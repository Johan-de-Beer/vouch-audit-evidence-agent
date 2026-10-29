import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import type {
  BBox,
  Document,
  DocumentType,
  Field,
  Fixture,
  LedgerLine,
  TestName,
} from "../shared/types.js";

const WIDTH = 1200;
const HEIGHT = 1600;
const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const money = (value: number) =>
  `R ${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const xml = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const tests: TestName[] = [
  "amount",
  "date",
  "vat",
  "approval",
  "quantity",
  "duplicate",
  "vendor",
  "invoice_no",
  "price",
];
const vendors = [
  {
    name: "Karoo Office Supplies",
    city: "Gqeberha",
    item: "Ergonomic task chair",
    category: "Office equipment",
  },
  {
    name: "Cape Circuit Trading",
    city: "Cape Town",
    item: "Network switch - 16 port",
    category: "IT equipment",
  },
  {
    name: "Highveld Industrial",
    city: "Johannesburg",
    item: "Workshop consumables kit",
    category: "Workshop supplies",
  },
  {
    name: "Garden Route Packaging",
    city: "George",
    item: "Recycled archive boxes",
    category: "Packaging",
  },
  {
    name: "Umoya Safety Products",
    city: "Durban",
    item: "Site safety equipment kit",
    category: "Safety equipment",
  },
];

/** Entirely fictional records; no employer, client, public dataset or real person is used. */
export function buildLedger(): LedgerLine[] {
  const ledger: LedgerLine[] = [];
  for (let n = 1; n <= 25; n++) {
    const vendor = vendors[(n - 1) % vendors.length];
    let quantity = 3 + (n % 8);
    let unitPrice = round(180 + n * 27.5);
    if (n === 3) {
      quantity = 3;
      unitPrice = 1260.87;
    }
    if (n === 7) {
      quantity = 10;
      unitPrice = 480;
    }
    if (n === 12) {
      quantity = 10;
      unitPrice = 320;
    }
    const net = round(quantity * unitPrice);
    const vat = n === 7 ? 680 : round(net * 0.15);
    ledger.push({
      id: `L${String(n).padStart(3, "0")}`,
      date: `2026-10-${String(1 + ((n - 1) % 22)).padStart(2, "0")}`,
      vendor: vendor.name,
      invoice_no: `INV-2026-${1000 + n}`,
      amount: n === 3 ? 4530 : round(net + vat),
      vat,
      account: vendor.category,
      currency: "ZAR",
      quantity,
      po_no: `PO-2026-${1000 + n}`,
      assertion: "Occurrence, accuracy and authorisation",
    });
  }
  // Two separate ledger postings share one supplier invoice. Both must be flagged.
  ledger[21] = { ...ledger[20], id: "L022" };
  return ledger;
}

interface RenderData {
  line: LedgerLine;
  type: DocumentType;
  index: number;
  quantity: number;
  unitPrice: number;
  net: number;
  vat: number;
  total: number;
  approval: boolean;
}

/** One shared layout defines the pixels AND the extraction fixture boxes. */
function renderSource(data: RenderData): {
  svg: string;
  values: { name: string; value: string | number | boolean; bbox: BBox }[];
} {
  const { line, type, index, quantity, unitPrice, net, vat, total, approval } =
    data;
  const vendorInfo = vendors.find((vendor) => vendor.name === line.vendor)!;
  const title =
    type === "invoice"
      ? "TAX INVOICE"
      : type === "po"
        ? "PURCHASE ORDER"
        : "GOODS RECEIVED NOTE";
  const number =
    type === "invoice"
      ? line.invoice_no
      : type === "po"
        ? line.po_no!
        : `GRN-2026-${1000 + index}`;
  const values: {
    name: string;
    value: string | number | boolean;
    bbox: BBox;
  }[] = [
    { name: "vendor", value: line.vendor, bbox: [72, 154, 770, 55] },
    { name: "invoice_no", value: line.invoice_no, bbox: [760, 282, 366, 40] },
    { name: "date", value: line.date, bbox: [760, 362, 366, 40] },
    { name: "po_no", value: line.po_no!, bbox: [760, 442, 366, 40] },
    { name: "currency", value: "ZAR", bbox: [750, 561, 376, 45] },
    { name: "quantity", value: quantity, bbox: [698, 720, 110, 50] },
    { name: "unit_price", value: unitPrice, bbox: [815, 720, 142, 50] },
    { name: "net", value: net, bbox: [840, 945, 288, 48] },
    { name: "vat", value: vat, bbox: [840, 1010, 288, 48] },
    { name: "total", value: total, bbox: [797, 1093, 331, 66] },
    { name: "approval", value: approval, bbox: [70, 1205, 670, 145] },
  ];
  const text = (
    x: number,
    y: number,
    value: unknown,
    size = 26,
    fill = "#273933",
    weight = 400,
    extra = "",
  ) =>
    `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${xml(value)}</text>`;
  const lineRule = (y: number) =>
    `<line x1="74" x2="1126" y1="${y}" y2="${y}" stroke="#d9e0dc" stroke-width="2"/>`;
  const signature = approval
    ? `<path d="M106 1288 C128 1221 153 1261 129 1294 C169 1226 195 1238 177 1282 C197 1266 215 1272 227 1286 C246 1262 263 1260 269 1277 C289 1257 306 1262 325 1275 L386 1259" fill="none" stroke="#315a79" stroke-width="3.5" stroke-linecap="round"/>${text(438, 1263, "APPROVED", 25, "#427c64", 700)}${text(438, 1300, line.date, 19, "#62716b")}`
    : `${text(104, 1270, "Awaiting authorised signature", 24, "#acb5af")}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="1200" height="1600" fill="#fffefa"/>
    <rect width="1200" height="20" fill="#203f35"/>
    ${text(74, 104, title, 32, "#264c3d", 700)}
    ${text(74, 193, line.vendor, 40, "#1c342a", 700)}
    ${text(74, 232, `${vendorInfo.city}, South Africa | Fictional supplier`, 20, "#6a7770")}
    <rect x="905" y="60" width="222" height="39" rx="5" fill="#eef2e9"/>${text(925, 86, "SYNTHETIC SAMPLE", 16, "#56724f", 700)}
    ${lineRule(260)}
    ${text(74, 305, type === "po" ? "PURCHASER" : "DELIVER TO / BILL TO", 17, "#859088", 700)}
    ${text(74, 348, "Fynbos Manufacturing (Demo)", 29, "#263d32", 700)}
    ${text(74, 386, "Demo distribution centre", 23, "#67766c")}
    ${text(74, 420, "Sample Road 01, Gqeberha", 23, "#67766c")}
    ${text(74, 455, "No real customer, tax or bank information", 19, "#859088")}
    ${text(760, 270, "SUPPLIER INVOICE", 16, "#859088", 700)}${text(766, 312, line.invoice_no, 25, "#273933", 700)}
    ${text(760, 350, "DOCUMENT DATE", 16, "#859088", 700)}${text(766, 392, line.date, 26)}
    ${text(760, 430, "PURCHASE ORDER", 16, "#859088", 700)}${text(766, 472, line.po_no!, 25)}
    <rect x="74" y="520" width="1052" height="96" rx="7" fill="#f1f4ee"/>
    ${text(100, 557, "DOCUMENT REFERENCE", 16, "#71826f", 700)}${text(100, 590, number, 24, "#35543c", 700)}
    ${text(760, 557, "CURRENCY", 16, "#71826f", 700)}${text(760, 590, "ZAR - South African rand", 22, "#35543c")}
    <rect x="74" y="655" width="1052" height="49" rx="3" fill="#294c3c"/>
    ${text(94, 687, "DESCRIPTION", 18, "#ffffff", 700)}${text(703, 687, "QTY", 18, "#ffffff", 700)}${text(821, 687, "UNIT PRICE", 18, "#ffffff", 700)}${text(980, 687, "AMOUNT", 18, "#ffffff", 700)}
    ${text(94, 756, vendorInfo.item, 25)}${text(717, 756, quantity, 29, "#273933", 700)}${text(825, 756, money(unitPrice), 23)}${text(1112, 756, money(net), 23, "#273933", 400, 'text-anchor="end"')}
    ${text(94, 794, type === "grn" ? "Physical quantity received and counted at warehouse" : "Goods supplied under the referenced purchase order", 18, "#8d968f")}
    ${lineRule(834)}
    ${text(650, 978, "Subtotal", 24, "#7a857d")}${text(1110, 978, money(net), 30, "#273933", 400, 'text-anchor="end"')}
    ${text(650, 1043, "VAT (15%)", 24, "#7a857d")}${text(1110, 1043, money(vat), 30, "#273933", 400, 'text-anchor="end"')}
    <rect x="622" y="1080" width="504" height="91" rx="6" fill="#edf3e8"/>
    ${text(650, 1138, type === "grn" ? "Received value" : "TOTAL", 24, "#345540", 700)}${text(1110, 1140, money(total), 36, "#1b4230", 700, 'text-anchor="end"')}
    ${text(74, 1188, "AUTHORISATION", 17, "#859088", 700)}
    <rect x="74" y="1212" width="660" height="132" rx="5" fill="#fafbf7" stroke="#d6dfd5" stroke-width="2"/>
    ${signature}
    ${text(74, 1392, type === "grn" ? "Receipt confirms quantities only; settlement remains subject to invoice review." : "Payment terms: 30 days from date of invoice. No real bank account is provided.", 20, "#7e897e")}
    ${lineRule(1460)}
    ${text(74, 1503, "FICTIONAL DOCUMENT - GENERATED FOR HACKATHON EVALUATION ONLY", 17, "#82917f", 700)}
    ${text(74, 1537, "Not a valid tax invoice. No real supplier registration or banking details.", 18, "#9aa296")}
    ${text(1126, 1537, "1 / 1", 18, "#9aa296", 400, 'text-anchor="end"')}
  </svg>`;
  return { svg, values };
}

export async function generateDemo(
  dataDir: string = resolve("data"),
): Promise<Fixture> {
  const base = resolve(dataDir);
  const documentsPath = join(base, "demo", "documents");
  const photosPath = join(base, "demo", "photos");
  await Promise.all([
    mkdir(documentsPath, { recursive: true }),
    mkdir(photosPath, { recursive: true }),
  ]);
  const ledger = buildLedger();
  const documents: Document[] = [];
  const fields: Field[] = [];
  for (let i = 0; i < ledger.length; i++) {
    const line = ledger[i];
    const sourceNumber = i === 21 ? 21 : i + 1;
    let quantity = line.quantity!;
    let unitPrice = round(180 + sourceNumber * 27.5);
    if (sourceNumber === 3) unitPrice = 1260.87;
    if (sourceNumber === 7) unitPrice = 480;
    if (sourceNumber === 12) unitPrice = 320;
    for (const type of ["invoice", "po", "grn"] as const) {
      const delivered =
        type === "grn" && sourceNumber === 12 ? quantity - 2 : quantity;
      const net = round(delivered * unitPrice);
      const vat =
        sourceNumber === 7 && type === "invoice" ? 680 : round(net * 0.15);
      const total = round(net + vat);
      const approval = !(sourceNumber === 17 && type === "invoice");
      const docId = `${line.id}-${type}`;
      const { svg, values } = renderSource({
        line,
        type,
        index: sourceNumber,
        quantity: delivered,
        unitPrice,
        net,
        vat,
        total,
        approval,
      });
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      const pdf = await PDFDocument.create();
      pdf.setTitle(`${docId} | Synthetic audit evidence`);
      pdf.setAuthor("Audit Evidence Agent synthetic data generator");
      pdf.setSubject(
        "Fictional hackathon sample. No client, employer or real personal data.",
      );
      pdf.setCreationDate(new Date("2026-10-29T00:00:00Z"));
      pdf.setModificationDate(new Date("2026-10-29T00:00:00Z"));
      const page = pdf.addPage([600, 800]);
      const image = await pdf.embedPng(png);
      page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
      const pdfBytes = await pdf.save();
      const sourcePath = `demo/documents/${docId}.pdf`;
      const imagePath = `demo/documents/${docId}.png`;
      await Promise.all([
        writeFile(join(base, sourcePath), pdfBytes),
        writeFile(join(base, imagePath), png),
      ]);
      documents.push({
        id: docId,
        name: `${line.vendor} - ${type === "invoice" ? line.invoice_no : type === "po" ? line.po_no : `GRN-${1000 + sourceNumber}`}.pdf`,
        type,
        sha256: sha(pdfBytes),
        imageSha256: sha(png),
        pages: 1,
        sourcePath,
        imagePath,
        width: WIDTH,
        height: HEIGHT,
        ledgerId: line.id,
        synthetic: true,
      });
      fields.push(
        ...values.map((field) => ({
          ...field,
          id: `${docId}-${field.name}`,
          docId,
          page: 1,
          confidence: 0.99,
          model: "synthetic-fixture",
        })),
      );
      // These are separate upload examples; no fixture boxes are claimed for transformed photos.
      if (type === "invoice" && i < 6) {
        const deskWidth = 1510,
          deskHeight = 1900;
        const rotated = await sharp(png)
          .resize({ width: 1020 })
          .rotate(i % 2 ? 4 : -4, { background: "#c9b9a1" })
          .toBuffer();
        const dimensions = await sharp(rotated).metadata();
        const photo = await sharp({
          create: {
            width: deskWidth,
            height: deskHeight,
            channels: 3,
            background: "#c9b9a1",
          },
        })
          .composite([
            {
              input: rotated,
              left: Math.floor((deskWidth - dimensions.width!) / 2),
              top: Math.floor((deskHeight - dimensions.height!) / 2),
            },
          ])
          .jpeg({ quality: 86 })
          .toBuffer();
        await writeFile(join(photosPath, `${docId}-desk.jpg`), photo);
      }
    }
  }
  const exceptions = new Map<string, TestName[]>([
    ["L003", ["amount"]],
    ["L007", ["vat", "price"]],
    ["L012", ["quantity"]],
    ["L017", ["approval"]],
    ["L021", ["duplicate"]],
    ["L022", ["duplicate"]],
  ]);
  const expected: Fixture["expected"] = ledger.flatMap((line) =>
    tests.map((test) => ({
      ledgerId: line.id,
      test,
      result: exceptions.get(line.id)?.includes(test)
        ? ("exception" as const)
        : ("match" as const),
    })),
  );
  const fixture: Fixture = { ledger, documents, fields, expected };
  const columns: (keyof LedgerLine)[] = [
    "id",
    "date",
    "vendor",
    "invoice_no",
    "amount",
    "vat",
    "account",
    "currency",
    "quantity",
    "po_no",
    "assertion",
  ];
  const csv =
    [
      columns.join(","),
      ...ledger.map((line) =>
        columns
          .map(
            (column) => `"${String(line[column] ?? "").replace(/"/g, '""')}"`,
          )
          .join(","),
      ),
    ].join("\r\n") + "\r\n";
  await Promise.all([
    writeFile(
      join(base, "demo", "fixture.json"),
      JSON.stringify(fixture, null, 2),
    ),
    writeFile(join(base, "demo", "ledger.csv"), csv),
    writeFile(
      join(base, "demo", "ground-truth.json"),
      JSON.stringify(
        {
          notice:
            "Evaluation only. Never provided to the extraction/matching engine.",
          scenarios: [
            {
              line: "L003",
              scenario: "Ledger amount 4,530.00 vs invoice total 4,350.00",
            },
            {
              line: "L007",
              scenario:
                "Invoice VAT 680.00 on net 4,800.00; correct VAT is 720.00",
            },
            {
              line: "L012",
              scenario: "10 units ordered/invoiced but only 8 received",
            },
            { line: "L017", scenario: "No authorisation signature on invoice" },
            {
              lines: ["L021", "L022"],
              scenario: "Duplicate supplier invoice posted twice",
            },
          ],
          expected,
        },
        null,
        2,
      ),
    ),
    writeFile(
      join(base, "demo", "README.txt"),
      "SYNTHETIC AUDIT DATASET\n25 ledger rows; 75 scanned-style PDFs and exact corresponding 1200x1600 PNG source pages.\nSix additional desk-photo JPEGs are separate upload examples; fixture boxes do not apply to them.\nAll businesses, transactions and signatures are fictional. No real tax, banking, client or employer data.\nThe five planted scenarios affect six ledger rows because both duplicate postings are flagged.\nfixture.json includes known synthetic extraction fields for the explicitly labelled offline demo.\nDemo evaluation is a deterministic fixture pipeline test; it does not measure Meta model accuracy.\nTo reproduce: npm run seed. PDFs embed the corresponding PNG, so the rendered source and crop coordinates agree.\n",
    ),
  ]);
  return fixture;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const folder = resolve(process.env.DATA_DIR || "data");
  const fixture = await generateDemo(folder);
  console.log(
    `Generated ${fixture.ledger.length} synthetic ledger rows, ${fixture.documents.length} PDF/PNG document pairs and 6 desk photos in ${join(folder, "demo")}.`,
  );
}
