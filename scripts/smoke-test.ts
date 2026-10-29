import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { request as httpRequest } from "node:http";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { Engagement } from "../shared/types.js";

// Exercises an already running local server; never starts, stops or restarts it.
const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3001";
const output = resolve("artifacts", "api-smoke");
await mkdir(output, { recursive: true });
const checks: { name: string; passed: boolean; detail?: string }[] = [];
const headers: Record<string, string> = process.env.APP_TOKEN
  ? { Authorization: `Bearer ${process.env.APP_TOKEN}` }
  : {};
async function request(route: string, init: RequestInit = {}) {
  const combined = new Headers(headers);
  new Headers(init.headers).forEach((value, key) => combined.set(key, value));
  return fetch(base + route, {
    ...init,
    headers: combined,
    signal: AbortSignal.timeout(90_000),
  });
}
async function json(route: string, init: RequestInit = {}) {
  const response = await request(route, init);
  const body = await response.json();
  assert.ok(
    response.ok,
    `${route} returned ${response.status}: ${JSON.stringify(body)}`,
  );
  return body;
}
const post = (body: unknown = {}): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
function zipEntries(bytes: Buffer): Map<string, Buffer> {
  // Central-directory sizes allow streaming ZIP entries with data descriptors.
  const footer = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(footer >= 0, "ZIP end directory absent.");
  const count = bytes.readUInt16LE(footer + 10);
  let cursor = bytes.readUInt32LE(footer + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
    const method = bytes.readUInt16LE(cursor + 10),
      size = bytes.readUInt32LE(cursor + 20),
      nameSize = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32),
      local = bytes.readUInt32LE(cursor + 42);
    const name = bytes.toString("utf8", cursor + 46, cursor + 46 + nameSize);
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + size);
    files.set(
      name,
      method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed)
          : Buffer.alloc(0),
    );
    cursor += 46 + nameSize + extra + comment;
  }
  return files;
}

try {
  assert.equal((await json("/api/health")).ok, true);
  checks.push({ name: "Health", passed: true });
  const rebindingStatus = await new Promise<number>((resolve, reject) => {
    const req = httpRequest(
      base + "/api/health",
      { headers: { Host: "attacker.invalid" } },
      (res) => {
        res.resume();
        resolve(res.statusCode || 0);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(rebindingStatus, 403);
  checks.push({
    name: "Host allowlist rejects DNS-rebinding host",
    passed: true,
  });
  const crossOrigin = await request("/api/demo", {
    ...post(),
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.invalid",
    },
  });
  assert.equal(crossOrigin.status, 403);
  checks.push({ name: "Cross-origin writes rejected", passed: true });
  const created = (await json("/api/demo", post())) as Engagement;
  const route = `/api/engagements/${created.id}`;
  assert.equal(created.ledger.length, 25);
  assert.equal(created.documents.length, 75);
  checks.push({
    name: "Synthetic sample creation",
    passed: true,
    detail: created.id,
  });
  await json(route + "/run", post({ mode: "demo" }));
  let engagement: Engagement = created;
  for (let attempt = 0; attempt < 300; attempt++) {
    engagement = (await json(route)) as Engagement;
    if (engagement.status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(
    engagement.status,
    "complete",
    engagement.error || "Demo did not complete.",
  );
  assert.equal(engagement.claims.length, 225);
  assert.equal(
    engagement.claims.filter((c) => c.result === "exception").length,
    7,
  );
  assert.equal(
    new Set(
      engagement.claims
        .filter((c) => c.result === "exception")
        .map((c) => c.ledgerId),
    ).size,
    6,
  );
  assert.equal(
    engagement.claims.filter((c) => c.result === "unverified").length,
    0,
  );
  checks.push({
    name: "End-to-end synthetic run",
    passed: true,
    detail: "225 claims, 7 exception claims across 6 rows, 0 unverified",
  });
  const usedCrops = new Set(
    engagement.claims.flatMap((claim) => claim.cropIds),
  );
  for (const id of usedCrops) {
    const crop = engagement.crops.find((crop) => crop.id === id);
    assert.ok(crop, `Claim points to absent crop ${id}`);
    assert.equal(crop.verification?.mode, "demo");
    assert.equal(crop.verification?.agrees, true);
    assert.ok(crop.verification.reason);
  }
  checks.push({
    name: "Every compared crop retains its own explicitly simulated verification",
    passed: true,
    detail: `${usedCrops.size} source crops independently addressable`,
  });
  await json(
    route + "/notes",
    post({
      ledgerId: "L003",
      text: "Automated smoke test: <script>bad()</script> is literal text.",
    }),
  );
  const exception = engagement.claims.find(
    (c) => c.ledgerId === "L003" && c.test === "amount",
  )!;
  await json(
    route + "/reviews",
    post({
      claimId: exception.id,
      decision: "follow_up",
      reviewer: "Automated synthetic test",
      note: "Synthetic exception retained for human investigation.",
    }),
  );
  checks.push({
    name: "Notes and explicit review records persist",
    passed: true,
  });
  const integrity = await json(route + "/integrity");
  assert.equal(integrity.trail.valid, true);
  assert.equal(integrity.filesValid, true);
  assert.equal(integrity.resultSeal.valid, true);
  assert.equal(integrity.annotationsValid, true);
  checks.push({
    name: "Evidence files, event chain, result seal and notes/reviews validate",
    passed: true,
    detail: `${integrity.filesChecked} checked files`,
  });
  const html = await (await request(route + "/export/html")).text();
  assert.ok(html.includes("&lt;script&gt;bad()&lt;/script&gt;"));
  assert.ok(!html.includes("<script>bad()"));
  await writeFile(join(output, "working-paper.html"), html);
  checks.push({
    name: "Standalone HTML exports embedded crops and escaped notes",
    passed: true,
  });
  const pdf = Buffer.from(
    await (await request(route + "/export/pdf")).arrayBuffer(),
  );
  const loaded = await PDFDocument.load(pdf);
  assert.ok(loaded.getPageCount() >= 25);
  await writeFile(join(output, "working-paper.pdf"), pdf);
  checks.push({
    name: "PDF exports all sample working papers",
    passed: true,
    detail: `${loaded.getPageCount()} pages`,
  });
  const zip = Buffer.from(
    await (await request(route + "/export/zip")).arrayBuffer(),
  );
  await writeFile(join(output, "evidence-bundle.zip"), zip);
  const entries = zipEntries(zip);
  for (const name of [
    "working-paper.html",
    "working-paper.pdf",
    "engagement.json",
    "audit-trail.jsonl",
    "README.txt",
    "file-manifest.json",
  ])
    assert.ok(entries.has(name), `ZIP missing ${name}`);
  const bundleEngagement = JSON.parse(
    entries.get("engagement.json")!.toString("utf8"),
  ) as Engagement;
  assert.equal(bundleEngagement.id, created.id);
  assert.equal(bundleEngagement.claims.length, 225);
  for (const crop of bundleEngagement.crops)
    assert.ok(
      entries.has(`evidence/${crop.id}.png`),
      `ZIP missing crop ${crop.id}`,
    );
  assert.equal(
    [...entries.keys()].filter((name) => name.startsWith("sources/")).length,
    75,
  );
  assert.equal(
    [...entries.keys()].filter((name) => name.startsWith("pages/")).length,
    75,
  );
  const manifest = JSON.parse(
    entries.get("file-manifest.json")!.toString("utf8"),
  ) as {
    storedPath: string;
    archivePath: string;
    sha256: string;
    kind: string;
  }[];
  for (const item of manifest) {
    assert.ok(
      entries.has(item.archivePath),
      `Manifest references absent file ${item.archivePath}`,
    );
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      createHash("sha256").update(entries.get(item.archivePath)!).digest("hex"),
      item.sha256,
      `Content hash differs for ${item.archivePath}`,
    );
  }
  for (const document of bundleEngagement.documents) {
    const original = manifest.find(
        (item) => item.storedPath === document.sourcePath,
      ),
      rendered = manifest.find(
        (item) => item.storedPath === document.imagePath,
      );
    assert.equal(original?.sha256, document.sha256);
    assert.equal(rendered?.sha256, document.imageSha256);
  }
  for (const crop of bundleEngagement.crops) {
    assert.equal(
      manifest.find((item) => item.storedPath === crop.path)?.sha256,
      crop.sha256,
    );
    if (crop.maskPath) {
      const mask = manifest.find((item) => item.storedPath === crop.maskPath);
      assert.equal(mask?.kind, "sam-mask");
      assert.equal(mask?.sha256, crop.maskSha256);
    }
  }
  checks.push({
    name: "ZIP contains original documents, rendered pages, crops, working papers and a verified file manifest",
    passed: true,
    detail: `${entries.size} files; ${manifest.length} content hashes verified`,
  });
  const form = new FormData();
  form.set("name", "Automated PDF ingestion smoke test");
  form.set(
    "ledger",
    new Blob(
      [
        "id,date,vendor,invoice_no,amount,vat,account,currency,quantity,po_no\nL003,2026-10-03,Highveld Industrial,INV-2026-1003,4530.00,567.39,Purchases,ZAR,3,PO-2026-1003\n",
      ],
      { type: "text/csv" },
    ),
    "ledger.csv",
  );
  form.set(
    "documents",
    new Blob(
      [
        new Uint8Array(
          await readFile(resolve("data/demo/documents/L003-invoice.pdf")),
        ),
      ],
      { type: "application/pdf" },
    ),
    "L003-invoice.pdf",
  );
  const imported = (await json("/api/engagements", {
    method: "POST",
    body: form,
  })) as Engagement;
  assert.equal(imported.mode, "live");
  assert.equal(imported.documents.length, 1);
  assert.ok(imported.documents[0].imageSha256);
  assert.equal(imported.documents[0].synthetic, false);
  const image = await request("/files/" + imported.documents[0].imagePath);
  assert.equal(image.status, 200);
  assert.match(image.headers.get("Content-Type") || "", /image\/png/);
  const importedIntegrity = await json(
    `/api/engagements/${imported.id}/integrity`,
  );
  assert.equal(importedIntegrity.filesValid, true);
  checks.push({
    name: "Actual PDF multipart import renders a verified PNG page",
    passed: true,
    detail: imported.id,
  });
  const forbiddenFixture = await request(
    `/api/engagements/${imported.id}/run`,
    post({ mode: "demo" }),
  );
  assert.equal(forbiddenFixture.status, 400);
  const settings = await json("/api/settings");
  if (!settings.metaConfigured || !settings.basetenConfigured) {
    const noKeys = await request(
      `/api/engagements/${imported.id}/run`,
      post({ mode: "live" }),
    );
    assert.equal(noKeys.status, 409);
    checks.push({
      name: "Live execution without credentials fails explicitly",
      passed: true,
    });
  }
  const malformed = new FormData();
  malformed.set(
    "ledger",
    new Blob(
      ["id,date,vendor,invoice_no,amount,vat\nL1,2026-02-30,Demo,INV,1,0\n"],
      { type: "text/csv" },
    ),
    "bad.csv",
  );
  malformed.set("documents", new Blob(["not-an-image"]), "bad.png");
  const bad = await request("/api/engagements", {
    method: "POST",
    body: malformed,
  });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /date|YYYY-MM-DD/i);
  checks.push({
    name: "Malformed imports return actionable validation errors",
    passed: true,
  });
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(
      {
        base,
        passed: true,
        timestamp: new Date().toISOString(),
        demoEngagementId: created.id,
        importEngagementId: imported.id,
        checks,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { passed: true, demoEngagementId: created.id, checks },
      null,
      2,
    ),
  );
} catch (error) {
  const failure = {
    passed: false,
    timestamp: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    checks,
  };
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(failure, null, 2),
  );
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
}
