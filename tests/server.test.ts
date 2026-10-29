import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { parseLedger, safeFile, ingestDocument } from "../server/ingest.js";
import { workpaperHtml, workpaperPdf } from "../server/export.js";
import { createStore } from "../server/store.js";
import type { Engagement } from "../shared/types.js";

const ledgerCsv = (amount = "1150.00", vat = "150.00", date = "2026-10-01") =>
  `id,date,vendor,invoice_no,amount,vat,account,currency,quantity,po_no\nL001,${date},Fictional Supplier,INV-001,"${amount}","${vat}",Purchases,ZAR,10,PO-001\n`;
const example = (): Engagement => ({
  id: "test-engagement",
  name: "Evidence test",
  client: "Synthetic",
  period: "October 2026",
  createdAt: "2026-10-29T00:00:00Z",
  mode: "demo",
  status: "ready",
  ledger: parseLedger(ledgerCsv()),
  documents: [],
  fields: [],
  crops: [],
  claims: [],
  events: [],
  notes: [],
  reviews: [],
});

async function temporary(t: { after: (fn: () => Promise<void>) => unknown }) {
  const directory = await mkdtemp(path.join(tmpdir(), "vouch-server-test-"));
  t.after(async () => {
    // Only remove the exact freshly created temporary test directory.
    const relative = path.relative(
      path.resolve(tmpdir()),
      path.resolve(directory),
    );
    assert.ok(
      relative.startsWith("vouch-server-test-") && !relative.includes(path.sep),
    );
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("CSV import retains financial values and validates real calendar dates", () => {
  assert.equal(parseLedger(ledgerCsv())[0].amount, 1150);
  assert.equal(
    parseLedger(ledgerCsv('"1,150.00"'.replaceAll('"', "")))[0].amount,
    1150,
  );
  assert.equal(
    parseLedger(ledgerCsv("1150", "150", "2028-02-29"))[0].date,
    "2028-02-29",
  );
  for (const date of [
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-01",
    "2026-1-01",
  ])
    assert.throws(
      () => parseLedger(ledgerCsv("1150", "150", date)),
      /date|YYYY-MM-DD/i,
    );
});

test("CSV import must never silently change decimal-comma financial amounts", () => {
  // An importer may support locale decimal commas or reject them; multiplying by 100 is unsafe.
  let parsed: ReturnType<typeof parseLedger> | undefined;
  try {
    parsed = parseLedger(ledgerCsv("1 234,56"));
  } catch {
    return;
  }
  assert.equal(
    parsed[0].amount,
    1234.56,
    "Decimal-comma amount was silently corrupted during import.",
  );
});

test("CSV money rejects non-decimal syntax, excess precision, infinity and unsafe integers", () => {
  for (const amount of [
    "0x10",
    "1e3",
    "1.234",
    "NaN",
    "Infinity",
    "-1",
    "9007199254740992",
  ]) {
    assert.throws(
      () => parseLedger(ledgerCsv(amount)),
      () => true,
      `Unsafe amount accepted: ${amount}`,
    );
  }
});

test("CSV import rejects duplicate financial headers and duplicate ledger IDs", () => {
  assert.throws(
    () =>
      parseLedger(
        "id,date,vendor,invoice_no,amount,amount,vat\nL001,2026-10-01,Demo,INV-001,1150,950,150\n",
      ),
    /duplicate|header|column/i,
  );
  const csv = ledgerCsv();
  assert.throws(
    () => parseLedger(csv + csv.split("\n")[1] + "\n"),
    /duplicate/i,
  );
});

test("Evidence path validation prevents parent, absolute and sibling-directory traversal", () => {
  const root = path.resolve("data");
  for (const value of [
    "../outside.png",
    "../../secrets.env",
    path.resolve("outside.png"),
    `..${path.sep}${path.basename(root)}-sibling${path.sep}file.png`,
  ])
    assert.throws(() => safeFile(root, value), /path/i);
  assert.equal(
    safeFile(root, "uploads/example.png"),
    path.join(root, "uploads", "example.png"),
  );
});

test("Working-paper HTML treats notes, vendor names and findings as text", () => {
  const e = example();
  e.name = "<script>badTitle()</script>";
  e.ledger[0].vendor = "<img src=x onerror=badVendor()>";
  e.notes.push({
    id: "note-1",
    ledgerId: "L001",
    text: "<script>badNote()</script>",
    source: "typed",
    createdAt: e.createdAt,
  });
  const html = workpaperHtml(e);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;badNote()&lt;/script&gt;"));
  assert.ok(html.includes("OFFLINE SYNTHETIC DEMO"));
});

test("Persistent store recovers interrupted work and retains saved reviewer notes", async (t) => {
  const directory = await temporary(t);
  const first = createStore(directory),
    e = example();
  e.status = "running";
  e.notes.push({
    id: "note-1",
    ledgerId: "L001",
    text: "Review supplier confirmation.",
    source: "typed",
    createdAt: e.createdAt,
  });
  first.save(e);
  first.close();
  const reopened = createStore(directory);
  try {
    const restored = reopened.get(e.id)!;
    assert.equal(restored.status, "failed");
    assert.match(restored.error || "", /interrupted|restart/i);
    assert.equal(restored.notes[0].text, "Review supplier confirmation.");
    assert.equal(reopened.list().length, 1);
  } finally {
    reopened.close();
  }
});

test("Image ingestion confines names, records original content hashes, and preserves pixel dimensions", async (t) => {
  const directory = await temporary(t);
  const image = await sharp({
    create: { width: 240, height: 160, channels: 3, background: "#ece6db" },
  })
    .png()
    .toBuffer();
  const source = path.join(directory, "incoming.png");
  await writeFile(source, image);
  const [doc] = await ingestDocument(directory, "sample", {
    path: source,
    originalname: "../../receipt.png",
  });
  assert.equal(doc.width, 240);
  assert.equal(doc.height, 160);
  assert.equal(doc.synthetic, false);
  assert.equal(doc.name, "receipt.png");
  assert.equal(doc.sha256, createHash("sha256").update(image).digest("hex"));
  assert.equal(
    doc.imageSha256,
    createHash("sha256")
      .update(await readFile(safeFile(directory, doc.imagePath)))
      .digest("hex"),
  );
  assert.ok(doc.sourcePath.startsWith("uploads/sample/"));
  assert.deepEqual(await readFile(safeFile(directory, doc.sourcePath)), image);
  await assert.rejects(
    () =>
      ingestDocument(directory, "sample", {
        path: source,
        originalname: "payload.html",
      }),
    /PDF|PNG|JPEG|WebP/,
  );
});

test("PDF working paper includes all three source crops for a three-way quantity claim", async (t) => {
  const directory = await temporary(t),
    e = example();
  await mkdir(path.join(directory, "crops"));
  for (const [index, color] of ["#112233", "#445566", "#778899"].entries()) {
    const bytes = await sharp({
      create: { width: 90, height: 30, channels: 3, background: color },
    })
      .png()
      .toBuffer();
    const relative = `crops/evidence-${index}.png`;
    await writeFile(path.join(directory, relative), bytes);
    e.crops.push({
      id: `crop-${index}`,
      fieldId: `field-${index}`,
      docId: `doc-${index}`,
      field: "quantity",
      value: 10,
      path: relative,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bbox: [0, 0, 90, 30],
      confidence: 0.99,
      method: "fixture",
    });
  }
  e.claims.push({
    id: "claim-quantity",
    ledgerId: "L001",
    test: "quantity",
    result: "match",
    expected: 10,
    observed: 10,
    reasons: ["Invoice, PO and GRN agree."],
    cropIds: e.crops.map((c) => c.id),
    confidence: 0.99,
    attempts: 1,
  });
  const bytes = await workpaperPdf(e, directory);
  const pdf = await PDFDocument.load(bytes);
  const images = pdf.context
    .enumerateIndirectObjects()
    .filter(
      ([, object]) =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image",
    );
  assert.ok(pdf.getPageCount() >= 1);
  assert.equal(
    images.length,
    3,
    "The PDF silently omitted part of the three-way evidence.",
  );
});
