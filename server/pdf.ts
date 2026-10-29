import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import fs from "node:fs/promises";
import type { Engagement, LedgerLine } from "../shared/types.js";
import { safeFile } from "./ingest.js";

export async function workpaperPdf(e: Engagement, dataDir: string) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(0.1, 0.24, 0.19),
    muted = rgb(0.4, 0.49, 0.43);
  const clean = (value: unknown) =>
    [...String(value ?? "")]
      .map((c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return c === "\n" ? "\n" : "?";
        }
      })
      .join("");
  let page!: PDFPage,
    y = 0,
    currentLine: LedgerLine | undefined,
    currentTest = "";
  const wrap = (value: unknown, size: number, maxWidth = 520) => {
    const lines: string[] = [];
    for (const paragraph of clean(value).split("\n")) {
      let text = "";
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        const candidate = text ? text + " " + word : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          text = candidate;
          continue;
        }
        if (text) {
          lines.push(text);
          text = "";
        }
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > maxWidth) {
          let count = Math.max(
            1,
            Math.floor(
              (rest.length * maxWidth) / font.widthOfTextAtSize(rest, size),
            ),
          );
          while (font.widthOfTextAtSize(rest.slice(0, count), size) > maxWidth)
            count--;
          lines.push(rest.slice(0, count));
          rest = rest.slice(count);
        }
        text = rest;
      }
      lines.push(text);
    }
    return lines;
  };
  const newPage = (continued = false) => {
    page = pdf.addPage([595, 842]);
    page.drawRectangle({ x: 0, y: 832, width: 595, height: 10, color });
    page.drawText("VOUCH / AUDIT EVIDENCE WORKING PAPER", {
      x: 36,
      y: 801,
      size: 12,
      font: bold,
      color,
    });
    page.drawText(
      clean(`${e.mode.toUpperCase()} | ${e.name} | ${e.period}`).slice(0, 110),
      { x: 36, y: 782, size: 8, font, color: muted },
    );
    if (e.mode === "demo")
      page.drawText("SYNTHETIC FIXTURE: no live model accuracy measured.", {
        x: 36,
        y: 767,
        size: 8,
        font,
        color: muted,
      });
    y = 744;
    if (currentLine) {
      for (const text of wrap(
        `${currentLine.id} | ${currentLine.vendor} | ${currentLine.invoice_no}${continued ? " | continued" : ""}`,
        11,
      )) {
        page.drawText(text, { x: 36, y, size: 11, font: bold, color });
        y -= 16;
      }
      page.drawText(
        clean(
          `Ledger ${currentLine.currency} ${currentLine.amount.toFixed(2)} | ${currentLine.date}${continued && currentTest ? " | " + currentTest + " evidence continued" : ""}`,
        ),
        { x: 36, y, size: 8, font, color: muted },
      );
      y -= 26;
    }
  };
  const ensure = (height: number) => {
    if (y - height < 55) newPage(true);
  };
  const text = (value: unknown, strong = false, size = 9) => {
    for (const line of wrap(value, size)) {
      ensure(size * 1.5);
      page.drawText(line, {
        x: 36,
        y,
        size,
        font: strong ? bold : font,
        color: strong ? color : muted,
      });
      y -= size * 1.5;
    }
  };
  const images = new Map<
    string,
    Awaited<ReturnType<PDFDocument["embedPng"]>>
  >();
  for (const l of e.ledger) {
    currentLine = l;
    currentTest = "";
    newPage();
    const claims = e.claims.filter((c) => c.ledgerId === l.id);
    if (!claims.length) text("No checks have been completed for this sample.");
    for (const c of claims) {
      currentTest = c.test.toUpperCase();
      ensure(c.cropIds.length ? 190 : 90);
      text(`${currentTest}: ${c.result.toUpperCase()}`, true, 10);
      text(
        `Expected: ${c.expected ?? "Unknown"} | Observed: ${c.observed ?? "Unknown"}`,
      );
      for (const reason of c.reasons) text(reason);
      text(
        `Confidence ${(c.confidence * 100).toFixed(0)}% | ${c.verification?.model || "No independent reread"}`,
        false,
        8,
      );
      if (c.verification?.reason) text(c.verification.reason, false, 8);
      y -= 7;
      for (const cropId of c.cropIds) {
        const crop = e.crops.find((x) => x.id === cropId);
        if (!crop) continue;
        let img = images.get(crop.path);
        if (!img) {
          img = await pdf.embedPng(
            await fs.readFile(safeFile(dataDir, crop.path)),
          );
          images.set(crop.path, img);
        }
        const scale = Math.min(1, 520 / img.width, 66 / img.height),
          height = img.height * scale;
        ensure(height + 45);
        page.drawImage(img, {
          x: 36,
          y: y - height,
          width: img.width * scale,
          height,
        });
        y -= height + 10;
        text(`Source crop: ${crop.id} | ${crop.method}`, false, 7);
        text(`SHA256 ${crop.sha256}`, false, 6);
        y -= 7;
      }
      y -= 14;
    }
    currentTest = "AUDITOR NOTES";
    for (const n of e.notes.filter((n) => n.ledgerId === l.id)) {
      ensure(70);
      text(`Auditor note (${n.source})`, true);
      text(n.text);
      y -= 10;
    }
    currentTest = "HUMAN REVIEW";
    for (const r of e.reviews.filter((r) =>
      claims.some((c) => c.id === r.claimId),
    )) {
      ensure(70);
      text(`Review: ${r.decision} | ${r.reviewer}`, true);
      text(r.note);
      y -= 10;
    }
  }
  if (!pdf.getPageCount()) newPage();
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawLine({
      start: { x: 36, y: 40 },
      end: { x: 559, y: 40 },
      thickness: 0.5,
      color: rgb(0.85, 0.89, 0.85),
    });
    p.drawText(`Engagement ${e.id} | ${e.status}`, {
      x: 36,
      y: 26,
      size: 7,
      font,
      color: muted,
    });
    p.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: 490,
      y: 26,
      size: 7,
      font,
      color: muted,
    });
  });
  pdf.setTitle(`${e.name} working paper`);
  pdf.setAuthor("Vouch / Audit Evidence Agent");
  return Buffer.from(await pdf.save());
}
