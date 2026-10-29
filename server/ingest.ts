import { parse } from "csv-parse/sync";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Document, LedgerLine } from "../shared/types.js";

export function parseLedger(csv: string): LedgerLine[] {
  const records = parse(csv, {
    columns: (headers: string[]) => {
      const normalized = headers.map((h) =>
        h
          .replace(/^\uFEFF/, "")
          .trim()
          .toLowerCase(),
      );
      if (new Set(normalized).size !== normalized.length)
        throw new Error("Duplicate CSV column headers are not allowed.");
      return normalized;
    },
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];
  if (!records.length || records.length > 500)
    throw new Error("Supply between 1 and 500 ledger lines.");
  const seen = new Set<string>();
  const number = (
    value: string | undefined,
    name: string,
    row: number,
    optional = false,
  ) => {
    if (optional && !value) return undefined;
    const raw = (value ?? "").trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw))
      throw new Error(
        `Row ${row}: ${name} must use decimal digits with a dot and at most two decimal places (example 1234.56).`,
      );
    const n = Number(raw.replaceAll(",", ""));
    if (
      !Number.isFinite(n) ||
      n < 0 ||
      !Number.isSafeInteger(Math.round(n * 100))
    )
      throw new Error(`Row ${row}: ${name} exceeds the supported range.`);
    return n;
  };
  return records.map((r, index) => {
    const row = index + 2,
      id = r.id || `L${String(index + 1).padStart(3, "0")}`;
    if (seen.has(id)) throw new Error(`Row ${row}: duplicate line ID.`);
    seen.add(id);
    if (
      !r.vendor ||
      !r.invoice_no ||
      !r.date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      Number.isNaN(Date.parse(r.date)) ||
      new Date(r.date).toISOString().slice(0, 10) !== r.date
    )
      throw new Error(
        `Row ${row}: vendor, invoice_no and a valid YYYY-MM-DD date are required.`,
      );
    if (
      [id, r.vendor, r.invoice_no, r.account ?? ""].some((x) => x.length > 200)
    )
      throw new Error(`Row ${row}: text fields are too long.`);
    if (r.currency && !/^[A-Z]{3}$/.test(r.currency))
      throw new Error(
        `Row ${row}: currency must be a three-letter uppercase code.`,
      );
    return {
      id,
      date: r.date,
      vendor: r.vendor,
      invoice_no: r.invoice_no,
      amount: number(r.amount, "amount", row)!,
      vat: number(r.vat, "vat", row)!,
      account: r.account || "Purchases",
      currency: r.currency || "ZAR",
      quantity: number(r.quantity, "quantity", row, true),
      po_no: r.po_no || undefined,
      assertion: r.assertion || "occurrence",
    };
  });
}
export function safeFile(dataDir: string, relative: string) {
  const root = path.resolve(dataDir),
    resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root + path.sep))
    throw new Error("Invalid evidence path.");
  return resolved;
}
export async function ingestDocument(
  dataDir: string,
  engagementId: string,
  file: { path: string; originalname: string },
): Promise<Document[]> {
  const ext = path.extname(file.originalname).toLowerCase();
  if (![".pdf", ".png", ".jpg", ".jpeg", ".webp"].includes(ext))
    throw new Error("Documents must be PDF, PNG, JPEG or WebP.");
  const id = randomUUID(),
    folder = path.join("uploads", engagementId),
    targetFolder = safeFile(dataDir, folder);
  await fs.mkdir(targetFolder, { recursive: true });
  const bytes = await fs.readFile(file.path),
    hash = createHash("sha256").update(bytes).digest("hex");
  const sourcePath = path.join(folder, `${id}${ext}`).replaceAll("\\", "/");
  await fs.copyFile(file.path, safeFile(dataDir, sourcePath));
  const type = /\bgrn\b|delivery|received/i.test(file.originalname)
    ? "grn"
    : /\bpo\b|purchase.?order/i.test(file.originalname)
      ? "po"
      : /bank|statement/i.test(file.originalname)
        ? "bank"
        : "invoice";
  const make = async (image: Buffer, page: number) => {
    const imagePath = path
      .join(folder, `${id}-${page}.png`)
      .replaceAll("\\", "/");
    const meta = await sharp(image, { limitInputPixels: 20_000_000 })
      .rotate()
      .png()
      .toFile(safeFile(dataDir, imagePath));
    const imageSha256 = createHash("sha256")
      .update(await fs.readFile(safeFile(dataDir, imagePath)))
      .digest("hex");
    return {
      id: `${id}-${page}`,
      name: `${path.basename(file.originalname)}${page > 1 ? ` · page ${page}` : ""}`,
      type,
      sha256: hash,
      imageSha256,
      pages: 1,
      sourcePath,
      imagePath,
      width: meta.width,
      height: meta.height,
      synthetic: false,
    } as Document;
  };
  if (ext !== ".pdf") return [await make(bytes, 1)];
  const canvas = await import("@napi-rs/canvas");
  Object.assign(globalThis, {
    DOMMatrix: canvas.DOMMatrix,
    Path2D: canvas.Path2D,
    ImageData: canvas.ImageData,
  });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  try {
    if (pdf.numPages > 20)
      throw new Error("Each PDF may contain at most 20 pages.");
    const docs: Document[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      const p = await pdf.getPage(page),
        vp = p.getViewport({ scale: 1.6 });
      if (vp.width * vp.height > 20_000_000)
        throw new Error("PDF page exceeds pixel limit.");
      const c = canvas.createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      await p.render({
        canvasContext: c.getContext("2d") as never,
        viewport: vp,
        canvas: c as never,
      }).promise;
      docs.push(await make(c.toBuffer("image/png"), page));
    }
    return docs;
  } finally {
    await loading.destroy();
  }
}
