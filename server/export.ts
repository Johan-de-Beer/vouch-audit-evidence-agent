import { ZipArchive } from "archiver";
import fs from "node:fs/promises";
import path from "node:path";
import type { Response } from "express";
import { workpaperPdf } from "./pdf.js";
export { workpaperPdf } from "./pdf.js";
import type { Engagement } from "../shared/types.js";
import { safeFile } from "./ingest.js";
const esc = (x: unknown) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function workpaperHtml(
  e: Engagement,
  embedded: Record<string, string> = {},
) {
  const rows = e.ledger
    .map((l) => {
      const claims = e.claims.filter((c) => c.ledgerId === l.id);
      return `<section><h2>${esc(l.id)} · ${esc(l.vendor)} · ${esc(l.invoice_no)}</h2><p>Ledger: ${esc(l.currency)} ${l.amount.toFixed(2)} · ${esc(l.date)}</p><table><tr><th>Test</th><th>Result</th><th>Expected</th><th>Observed</th><th>Reason / verification</th></tr>${claims.map((c) => `<tr><td>${esc(c.test)}</td><td>${esc(c.result)}</td><td>${esc(c.expected)}</td><td>${esc(c.observed)}</td><td>${esc(c.reasons.join("; "))}<br>${esc(c.verification?.model)} · ${(c.confidence * 100).toFixed(0)}%</td></tr>`).join("")}</table><div class="crops">${e.crops
        .filter((c) => claims.some((x) => x.cropIds.includes(c.id)))
        .map(
          (c) =>
            `<figure><img src="${embedded[c.path] || "evidence/" + encodeURIComponent(c.id) + ".png"}" alt="${esc(c.field)} evidence"><figcaption>${esc(c.field)} · ${esc(c.method)}<br><small>SHA256 ${esc(c.sha256)}</small></figcaption></figure>`,
        )
        .join("")}</div>${e.notes
        .filter((n) => n.ledgerId === l.id)
        .map(
          (n) =>
            `<p><b>Auditor note (${esc(n.source)}):</b> ${esc(n.text)}</p>`,
        )
        .join("")}${e.reviews
        .filter((r) => claims.some((c) => c.id === r.claimId))
        .map(
          (r) =>
            `<p><b>Review:</b> ${esc(r.decision)} by ${esc(r.reviewer)} · ${esc(r.note)}</p>`,
        )
        .join("")}</section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(e.name)} — working paper</title><style>body{font:14px/1.5 system-ui;color:#17332d;max-width:1100px;margin:40px auto;padding:0 24px}h1{font-size:32px}h2{font-size:19px}section{padding:24px 0;border-top:1px solid #ddd;break-inside:avoid}table{border-collapse:collapse;width:100%;font-size:12px}td,th{text-align:left;border:1px solid #ddd;padding:8px}th{background:#f1f5f2}.crops{display:flex;flex-wrap:wrap;gap:10px}figure{margin:15px 0;max-width:300px}img{max-width:100%;max-height:120px;border:1px solid #ccc}small{font-size:8px;overflow-wrap:anywhere}.notice{background:#fff3d5;padding:16px}@media print{body{margin:0}button{display:none}}</style></head><body><h1>Vouch / Audit Evidence Agent</h1><h2>${esc(e.name)}</h2><p>${esc(e.client)} · ${esc(e.period)} · Generated ${new Date().toISOString()}</p><div class="notice">${e.mode === "demo" ? "OFFLINE SYNTHETIC DEMO — extraction, segmentation and rereads use fixture metadata. No model accuracy is claimed." : "LIVE API RUN — review provider details and exceptions."} This working paper supports auditor judgment; it is not an audit opinion. Evidence hashes and an event chain detect changes only against a trusted retained copy; they do not prove document authenticity.</div><p>Status: ${esc(e.status)} · ${e.ledger.length} sample lines · ${e.claims.filter((c) => c.result === "exception").length} exception claims · ${e.claims.filter((c) => c.result === "unverified").length} unverified claims</p>${rows}<h2>Run provenance</h2><p>Engagement ${esc(e.id)}. Final event hash: ${esc(e.events.at(-1)?.hash || "No events")}. See engagement.json and audit-trail.jsonl for full detail.</p></body></html>`;
}
export async function exportBundle(
  e: Engagement,
  dataDir: string,
  res: Response,
) {
  const zip = new ZipArchive({ zlib: { level: 6 } });
  zip.on("error", () => res.destroy());
  zip.pipe(res);
  zip.append(workpaperHtml(e), { name: "working-paper.html" });
  zip.append(await workpaperPdf(e, dataDir), { name: "working-paper.pdf" });
  zip.append(JSON.stringify(e, null, 2), { name: "engagement.json" });
  zip.append(e.events.map((x) => JSON.stringify(x)).join("\n") + "\n", {
    name: "audit-trail.jsonl",
  });
  zip.append(
    "Synthetic demo mode is explicitly labeled. Review all exceptions and unverified items. Verify event hashes against a trusted retained root. Source files and crops are included below. Open working-paper.html or working-paper.pdf.\n",
    { name: "README.txt" },
  );
  const manifest: {
      storedPath: string;
      archivePath: string;
      sha256: string;
      kind: string;
    }[] = [],
    seen = new Set<string>();
  const include = (
    storedPath: string,
    archivePath: string,
    sha256: string,
    kind: string,
  ) => {
    if (seen.has(storedPath)) return;
    seen.add(storedPath);
    zip.file(safeFile(dataDir, storedPath), { name: archivePath });
    manifest.push({ storedPath, archivePath, sha256, kind });
  };
  for (const d of e.documents) {
    include(
      d.sourcePath,
      `sources/${d.id}${path.extname(d.sourcePath)}`,
      d.sha256,
      "original",
    );
    include(
      d.imagePath,
      `pages/${d.id}.png`,
      d.imageSha256 || "unavailable",
      "rendered-page",
    );
  }
  for (const c of e.crops) {
    include(c.path, `evidence/${c.id}.png`, c.sha256, "crop");
    if (c.maskPath)
      include(
        c.maskPath,
        `masks/${c.id}.svg`,
        c.maskSha256 || "unavailable",
        "sam-mask",
      );
  }
  zip.append(JSON.stringify(manifest, null, 2), { name: "file-manifest.json" });
  await zip.finalize();
}
