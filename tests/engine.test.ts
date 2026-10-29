import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createServer } from "node:http";
import type {
  Engagement,
  Field,
  Document,
  LedgerLine,
} from "../shared/types.js";
import {
  matchLedgerLine,
  runEngagement,
  withinDataDir,
} from "../server/engine.js";
import {
  appendEvent,
  validateTrail,
  validateResultSeal,
} from "../server/trail.js";
import { cents, sameValue } from "../server/money.js";
import {
  extractFields,
  planTests,
  readCrop,
  segmentFields,
  transcribeAudio,
  validateBox,
  validateWav,
} from "../server/providers.js";

const line: LedgerLine = {
  id: "L1",
  date: "2026-10-01",
  vendor: "Karoo Supplies",
  invoice_no: "INV-001",
  amount: 115,
  vat: 15,
  account: "Supplies",
  currency: "ZAR",
  quantity: 5,
  po_no: "PO-001",
};
function engagement(): Engagement {
  return {
    id: "test",
    name: "Synthetic test",
    client: "Test",
    period: "2026",
    createdAt: new Date().toISOString(),
    mode: "demo",
    status: "ready",
    ledger: [{ ...line }],
    documents: [],
    fields: [],
    crops: [],
    claims: [],
    events: [],
    notes: [],
    reviews: [],
  };
}
function populate(e: Engagement): void {
  for (const type of ["invoice", "po", "grn"] as const) {
    const id = `doc-${type}`;
    e.documents.push({
      id,
      name: `${type}.png`,
      type,
      sha256: "",
      pages: 1,
      sourcePath: `${type}.png`,
      imagePath: `${type}.png`,
      width: 200,
      height: 200,
      ledgerId: "L1",
      synthetic: true,
    });
    const values = {
      vendor: line.vendor,
      invoice_no: line.invoice_no,
      date: line.date,
      net: 100,
      vat: 15,
      total: 115,
      quantity: 5,
      unit_price: 20,
      approval: true,
      po_no: "PO-001",
      currency: "ZAR",
    };
    e.fields.push(
      ...Object.entries(values).map(([name, value], i) => ({
        id: `${id}-${name}`,
        docId: id,
        name,
        value,
        page: 1,
        bbox: [0, i * 10, 100, 10] as [number, number, number, number],
        confidence: 0.99,
        model: "synthetic-fixture",
      })),
    );
  }
}
test("decimal currency compares in integer cents with locale grouping and negative amounts", () => {
  assert.equal(cents("R 1 234,56"), 123456);
  assert.equal(cents("1,234.56"), 123456);
  assert.equal(cents("(15.10)"), -1510);
  assert.equal(cents("0.105"), 11);
  assert.equal(cents("NaN"), null);
  assert.equal(cents(Infinity), null);
  assert.equal(sameValue("115.00", 115, "money"), true);
  assert.equal(sameValue("115", 116, "money"), false);
});

test("three-way price proof checks quantity extensions and order totals, not just equal unit prices", () => {
  const e = engagement();
  populate(e);
  const price = () =>
    matchLedgerLine(e, e.ledger[0]).find((c) => c.test === "price")!;
  assert.equal(price().pass, true);
  const invoiceNet = e.fields.find(
    (f) => f.docId === "doc-invoice" && f.name === "net",
  )!;
  invoiceNet.value = 120;
  assert.equal(price().pass, false);
  assert.ok(price().reasons.some((r) => r.includes("multiplied")));
  invoiceNet.value = 100;
  const orderGross = e.fields.find(
    (f) => f.docId === "doc-po" && f.name === "total",
  )!;
  orderGross.value = 125;
  assert.equal(price().pass, false);
  assert.ok(price().reasons.some((r) => r.includes("gross totals")));
  e.fields = e.fields.filter((f) => f !== orderGross);
  assert.equal(
    price().pass,
    null,
    "Missing order-total evidence must abstain.",
  );
});
test("three-way matching catches transpositions, VAT errors, short deliveries and missing approvals", () => {
  const e = engagement();
  populate(e);
  assert.ok(matchLedgerLine(e, e.ledger[0]).every((c) => c.pass));
  e.ledger[0].amount = 151;
  e.fields.find((f) => f.docId === "doc-invoice" && f.name === "vat")!.value =
    14;
  e.fields.find((f) => f.docId === "doc-grn" && f.name === "quantity")!.value =
    4;
  e.fields.find(
    (f) => f.docId === "doc-invoice" && f.name === "approval",
  )!.value = false;
  const results = matchLedgerLine(e, e.ledger[0]);
  for (const name of ["amount", "vat", "quantity", "approval"])
    assert.equal(results.find((c) => c.test === name)?.pass, false, name);
});
test("duplicates are scoped to vendor plus invoice number; missing evidence abstains", () => {
  const e = engagement();
  populate(e);
  e.ledger.push({ ...line, id: "L2", vendor: "Another supplier" });
  assert.equal(
    matchLedgerLine(e, e.ledger[0]).find((c) => c.test === "duplicate")?.pass,
    true,
  );
  e.ledger.push({ ...line, id: "L3", vendor: "  KAROO   SUPPLIES " });
  assert.equal(
    matchLedgerLine(e, e.ledger[0]).find((c) => c.test === "duplicate")?.pass,
    false,
  );
  e.fields = e.fields.filter((f) => f.name !== "total");
  assert.equal(
    matchLedgerLine(e, e.ledger[0]).find((c) => c.test === "amount")?.pass,
    null,
  );
});
test("value controls require corroboratable document identity and consistent purchase references", () => {
  const e = engagement();
  populate(e);
  const amount = matchLedgerLine(e, e.ledger[0]).find(
    (c) => c.test === "amount",
  )!;
  assert.ok(amount.fields.some((field) => field.name === "vendor"));
  assert.ok(amount.fields.some((field) => field.name === "invoice_no"));
  e.fields.find(
    (field) => field.docId === "doc-invoice" && field.name === "invoice_no",
  )!.value = "ANOTHER-INVOICE";
  assert.equal(
    matchLedgerLine(e, e.ledger[0]).find((c) => c.test === "amount")?.pass,
    null,
  );
  e.fields.find(
    (field) => field.docId === "doc-invoice" && field.name === "invoice_no",
  )!.value = line.invoice_no;
  e.fields.find(
    (field) => field.docId === "doc-po" && field.name === "po_no",
  )!.value = "ANOTHER-PO";
  for (const name of ["price", "quantity"])
    assert.equal(
      matchLedgerLine(e, e.ledger[0]).find((c) => c.test === name)?.pass,
      null,
    );
});
test("multi-page extraction refuses conflicting values and validates calendar dates", () => {
  const e = engagement();
  populate(e);
  e.fields.find((f) => f.name === "date")!.value = "2026-02-30";
  assert.equal(
    matchLedgerLine(e, e.ledger[0]).find((c) => c.test === "date")?.pass,
    null,
  );
  e.documents.push({ ...e.documents[0], id: "duplicate-page" });
  e.fields.push({
    ...e.fields.find((f) => f.name === "total")!,
    id: "conflicting-total",
    docId: "duplicate-page",
    value: 999,
  });
  assert.equal(
    matchLedgerLine(e, e.ledger[0]).find((c) => c.test === "amount")?.pass,
    null,
  );
});
test("hash chain detects edits, deletions and reordering; result seal binds all evidence metadata", () => {
  const e = engagement();
  appendEvent(e, "plan", "first");
  appendEvent(e, "extract", "second");
  assert.equal(validateTrail(e.events).valid, true);
  const edited = structuredClone(e.events);
  edited[0].message = "forged";
  assert.equal(validateTrail(edited).valid, false);
  assert.equal(validateTrail(e.events.slice(1)).valid, false);
  assert.equal(validateTrail([...e.events].reverse()).valid, false);
  assert.equal(validateResultSeal(e).valid, false);
});
test("crop path confinement and invalid bounding boxes prevent unsafe reads", () => {
  assert.throws(() => withinDataDir("C:/data", "../../secret"));
  assert.throws(() => validateBox([190, 0, 20, 10], 200, 200));
  assert.throws(() => validateBox([0, 0, 0, 10], 200, 200));
  assert.deepEqual(validateBox([1.2, 2.3, 10, 10], 200, 200), [1, 2, 10, 10]);
});
test("WAV validation rejects containers that the voice API cannot transcribe", () => {
  assert.throws(() => validateWav(Buffer.from("not a wave")));
  const bytes = Buffer.alloc(48);
  bytes.write("RIFF");
  bytes.writeUInt32LE(40, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24);
  bytes.writeUInt32LE(48000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(4, 40);
  assert.doesNotThrow(() => validateWav(bytes));
  bytes.writeUInt16LE(2, 22);
  assert.throws(() => validateWav(bytes));
});
test("end-to-end demo creates real hashed crops, corroborates fixture values and abstains on low confidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-engine-"));
  try {
    const e = engagement();
    populate(e);
    const image = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    for (const doc of e.documents) {
      await writeFile(path.join(root, doc.sourcePath), image);
      doc.sha256 = createHash("sha256").update(image).digest("hex");
    }
    appendEvent(e, "retry", "An earlier run retried this line.", {
      ledgerId: "L1",
    });
    e.fields.find(
      (f) => f.docId === "doc-invoice" && f.name === "vendor",
    )!.confidence = 0.4;
    await runEngagement(e, { mode: "demo", dataDir: root });
    assert.equal(e.status, "complete");
    assert.equal(e.claims.length, 9);
    assert.equal(
      e.claims.find((c) => c.test === "amount")?.result,
      "unverified",
      "uncertain source identity gates an otherwise exact amount",
    );
    assert.equal(
      e.claims.find((c) => c.test === "approval")?.result,
      "unverified",
      "uncertain source identity also gates signature presence",
    );
    assert.equal(validateTrail(e.events).valid, true);
    assert.equal(validateResultSeal(e).valid, true);
    assert.ok(
      e.claims.every((claim) => claim.attempts === 1),
      "prior-run retry events do not inflate current-run attempts",
    );
    for (const crop of e.crops) {
      assert.equal(crop.method, "fixture");
      assert.equal(
        createHash("sha256")
          .update(await readFile(path.join(root, crop.path)))
          .digest("hex"),
        crop.sha256,
      );
      if (e.claims.some((claim) => claim.cropIds.includes(crop.id)))
        assert.ok(
          crop.verification,
          "each used crop preserves its actual reader result",
        );
    }
    e.claims[0].result = "match";
    assert.equal(validateResultSeal(e).valid, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("disagreeing reread values are retained per crop and cannot become an aggregate verified value", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-reader-result-"));
  try {
    const e = engagement();
    populate(e);
    const image = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    for (const doc of e.documents) {
      await writeFile(path.join(root, doc.sourcePath), image);
      doc.sha256 = createHash("sha256").update(image).digest("hex");
    }
    let changed = false;
    await runEngagement(e, {
      mode: "demo",
      dataDir: root,
      onUpdate: () => {
        if (!changed && e.crops.length === e.fields.length) {
          changed = true;
          e.fields.find(
            (f) => f.docId === "doc-invoice" && f.name === "total",
          )!.value = 116;
        }
      },
    });
    const amount = e.claims.find((claim) => claim.test === "amount")!,
      crop = e.crops.find((item) => item.fieldId === "doc-invoice-total")!;
    assert.equal(amount.result, "unverified");
    assert.equal(amount.verification?.agrees, false);
    assert.equal(amount.verification?.value, null);
    assert.equal(crop.verification?.value, 115);
    assert.equal(crop.verification?.agrees, false);
    assert.ok(amount.verification?.reason?.includes("3 of 4"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("missing source evidence never produces a match, even with seeded extraction fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-engine-"));
  try {
    const e = engagement();
    populate(e);
    await runEngagement(e, { mode: "demo", dataDir: root });
    assert.equal(e.claims.length, 9);
    assert.ok(e.claims.every((c) => c.result === "unverified"));
    assert.ok(e.events.some((event) => event.stage === "escalate"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("document currency is evidenced and incompatible currencies never match", () => {
  const e = engagement();
  populate(e);
  e.fields.find(
    (f) => f.docId === "doc-invoice" && f.name === "currency",
  )!.value = "USD";
  for (const testName of ["amount", "vat", "price"])
    assert.equal(
      matchLedgerLine(e, e.ledger[0]).find((c) => c.test === testName)?.pass,
      false,
      `${testName} must not match a USD invoice to a ZAR ledger`,
    );
  e.fields.find(
    (f) => f.docId === "doc-invoice" && f.name === "currency",
  )!.value = "ZAR";
  e.fields.find((f) => f.docId === "doc-po" && f.name === "currency")!.value =
    "USD";
  const price = matchLedgerLine(e, e.ledger[0]).find(
    (c) => c.test === "price",
  )!;
  assert.equal(
    price.pass,
    false,
    "numerically equal prices in mixed currencies must fail",
  );
  assert.equal(
    price.fields.filter((f) => f.name === "currency").length,
    2,
    "both currency crops are required",
  );
  assert.ok(
    price.reasons.some((reason) => reason.includes("Currency differs")),
  );
  e.fields = e.fields.filter((f) => f.name !== "currency");
  for (const testName of ["amount", "vat", "price"])
    assert.equal(
      matchLedgerLine(e, e.ledger[0]).find((c) => c.test === testName)?.pass,
      null,
      `${testName} must abstain without source currency`,
    );
});
test("rendered-page tampering cannot inherit trust from an unchanged original PDF", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-render-hash-"));
  try {
    const e = engagement();
    populate(e);
    const trusted = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const altered = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "black" },
    })
      .png()
      .toBuffer();
    for (const doc of e.documents) {
      const original = Buffer.from("synthetic PDF source");
      doc.sourcePath = `${doc.id}.pdf`;
      doc.imageSha256 = createHash("sha256").update(trusted).digest("hex");
      doc.sha256 = createHash("sha256").update(original).digest("hex");
      await writeFile(path.join(root, doc.sourcePath), original);
      await writeFile(path.join(root, doc.imagePath), altered);
    }
    await runEngagement(e, { mode: "demo", dataDir: root });
    assert.ok(e.claims.every((c) => c.result === "unverified"));
    assert.equal(e.crops.length, 0);
    assert.ok(
      e.events.some((event) =>
        event.message.includes("Rendered image hash changed"),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("real adapter wire contracts: strict extraction, SAM stream parsing, blind crop reader and WAV multipart", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-adapter-")),
    requests: { url: string; body: string }[] = [];
  let readerMode: "valid" | "malformed" | "refusal" | "truncated" = "valid";
  const prior = Object.fromEntries(
    [
      "MODEL_API_KEY",
      "META_BASE_URL",
      "BASETEN_API_KEY",
      "BASETEN_BASE_URL",
    ].map((key) => [key, process.env[key]]),
  );
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString();
    requests.push({ url: req.url!, body });
    if (req.url === "/v1/responses") {
      const text =
        "<0f>1<|box;x1=0;y1=0;x2=4;y2=4;w=200;h=200;c=0.95|><|mask;x=0;y=0;c=0.95;data=5,5,!!!!!(QO(0lu8?|>";
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const event of [
        {
          type: "response.output_text.delta",
          item_id: "sam-output",
          output_index: 0,
          content_index: 0,
          delta: text,
        },
        {
          type: "response.content_part.done",
          item_id: "sam-output",
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text, annotations: [] },
        },
        {
          type: "response.completed",
          response: { id: "sam-test", status: "completed" },
        },
      ])
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
      return;
    }
    if (req.url === "/v1/asr/transcribe") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          transcript: "Inspect the invoice.",
          turns: [
            { startMs: 100, endMs: 1500, transcript: "Inspect the invoice." },
          ],
        }),
      );
      return;
    }
    const parsed = JSON.parse(body),
      name = parsed.response_format?.json_schema?.name;
    const content =
      name === "audit_fields"
        ? {
            fields: [
              {
                name: "total",
                value: 115,
                bbox: [0, 0, 100, 30],
                confidence: 0.96,
              },
            ],
          }
        : name === "audit_plan"
          ? { lines: [{ ledgerId: "L1", tests: ["amount", "vat"] }] }
          : { value: 115, confidence: 0.97 };
    const isReader = !name;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        id: "mock",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content:
                isReader && readerMode === "malformed"
                  ? "```json\nnot valid evidence\n```"
                  : JSON.stringify(content),
              ...(isReader && readerMode === "refusal"
                ? { refusal: "Cannot read this crop." }
                : {}),
            },
            finish_reason:
              isReader && readerMode === "truncated" ? "length" : "stop",
          },
        ],
      }),
    );
  });
  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/v1`;
    process.env.MODEL_API_KEY = "test-only-key";
    process.env.BASETEN_API_KEY = "test-only-key";
    process.env.META_BASE_URL = base;
    process.env.BASETEN_BASE_URL = base;
    const e = engagement();
    populate(e);
    const doc = e.documents[0],
      imagePath = path.join(root, "source.png");
    await sharp({
      create: { width: 200, height: 200, channels: 3, background: "white" },
    })
      .png()
      .toFile(imagePath);
    const plan = await planTests(e.ledger, e.documents);
    assert.deepEqual(plan.get("L1"), ["amount", "vat"]);
    const fields = await extractFields(doc, imagePath);
    assert.equal(fields[0].value, 115);
    const segmented = await segmentFields(doc, imagePath, fields);
    assert.equal(segmented.length, 1);
    assert.equal(segmented[0].confidence, 0.95);
    assert.match(segmented[0].maskSvg, /<svg/);
    const read = await readCrop(imagePath, "total");
    assert.equal(read.value, 115);
    const cropRequest = requests
      .filter((r) => r.url === "/v1/chat/completions")
      .at(-1)!;
    assert.ok(!cropRequest.body.includes("Karoo"));
    assert.ok(!cropRequest.body.includes("expected"));
    assert.ok(!cropRequest.body.includes("INV-001"));
    assert.equal(
      JSON.parse(cropRequest.body).response_format,
      undefined,
      "Muse Spark Open does not support structured-output or JSON modes",
    );
    readerMode = "malformed";
    await assert.rejects(() => readCrop(imagePath, "total"));
    readerMode = "refusal";
    await assert.rejects(() => readCrop(imagePath, "total"));
    readerMode = "truncated";
    await assert.rejects(() => readCrop(imagePath, "total"));
    readerMode = "valid";
    const wav = Buffer.alloc(48);
    wav.write("RIFF");
    wav.writeUInt32LE(40, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24000, 24);
    wav.writeUInt32LE(48000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(4, 40);
    const audioPath = path.join(root, "note.wav");
    await writeFile(audioPath, wav);
    const note = await transcribeAudio(audioPath, ["Karoo"]);
    assert.equal(note.text, "Inspect the invoice.");
    assert.deepEqual(note.turns, [
      { start: 0.1, end: 1.5, text: "Inspect the invoice." },
    ]);
    assert.match(requests.at(-1)!.body, /"audioEncoding":"WAV"/);
    assert.match(requests.at(-1)!.body, /"keywords":\["Karoo"\]/);
  } finally {
    for (const [key, value] of Object.entries(prior))
      value === undefined
        ? delete process.env[key]
        : (process.env[key] = value);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
