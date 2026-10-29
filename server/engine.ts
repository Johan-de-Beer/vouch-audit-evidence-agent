import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type {
  Claim,
  Document,
  Engagement,
  EngineOptions,
  EvidenceCrop,
  Field,
  LedgerLine,
  TestName,
  Verification,
} from "../shared/types.js";
import { appendEvent, resultSeal } from "./trail.js";
import { cents, normalise, sameValue } from "./money.js";
import {
  extractFields,
  getSettings,
  planTests,
  readCrop,
  safeProviderError,
  segmentFields,
  TESTS,
  validateBox,
} from "./providers.js";

const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
export function withinDataDir(root: string, relative: string): string {
  const base = path.resolve(root),
    target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(base + path.sep))
    throw new Error("Evidence path is outside the data directory.");
  return target;
}
const scalar = (value: unknown): string | number | boolean | null =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean"
    ? value
    : null;
const fieldKind = (name: string) =>
  ["net", "vat", "total", "unit_price"].includes(name)
    ? "money"
    : name === "quantity"
      ? "number"
      : name === "approval"
        ? "boolean"
        : "text";
function numberField(field: Field | undefined): number | null {
  if (
    !field ||
    typeof field.value === "boolean" ||
    String(field.value).trim() === ""
  )
    return null;
  const value = Number(field.value);
  return Number.isFinite(value) ? value : null;
}
function moneyField(field: Field | undefined): number | null {
  return field ? cents(field.value) : null;
}

interface Candidate {
  test: TestName;
  expected: Claim["expected"];
  observed: Claim["observed"];
  fields: Field[];
  pass: boolean | null;
  reasons: string[];
}
/** Header identity can support another page of the same original file, never another file. */
function sourceField(
  engagement: Engagement,
  document: Document,
  name: string,
): Field | undefined {
  const sourceIds = new Set(
    engagement.documents
      .filter(
        (doc) =>
          doc.type === document.type &&
          doc.sourcePath === document.sourcePath &&
          doc.sha256 === document.sha256,
      )
      .map((doc) => doc.id),
  );
  const fields = engagement.fields.filter(
    (field) => sourceIds.has(field.docId) && field.name === name,
  );
  if (
    !fields.length ||
    fields.some(
      (field) => !sameValue(fields[0].value, field.value, fieldKind(name)),
    )
  )
    return undefined;
  return [...fields].sort((a, b) => b.confidence - a.confidence)[0];
}
/** Matching is deterministic; a model cannot turn a mismatch into equality. */
export function matchLedgerLine(
  engagement: Engagement,
  line: LedgerLine,
): Candidate[] {
  const docs = engagement.documents.filter((d) => {
    if (d.ledgerId === line.id) return true;
    if (d.ledgerId || engagement.mode === "demo") return false;
    const value = (name: string) => sourceField(engagement, d, name)?.value;
    return (
      value("vendor") !== undefined &&
      sameValue(line.vendor, value("vendor")) &&
      ((value("invoice_no") !== undefined &&
        sameValue(line.invoice_no, value("invoice_no"))) ||
        (d.type !== "invoice" &&
          line.po_no &&
          sameValue(line.po_no, value("po_no"))))
    );
  });
  const get = (type: Document["type"], name: string): Field | undefined => {
    const ids = new Set(docs.filter((d) => d.type === type).map((d) => d.id));
    const fields = engagement.fields.filter(
      (f) => ids.has(f.docId) && f.name === name,
    );
    // Contradictory pages/files must never be resolved by picking the first value.
    if (
      !fields.length ||
      fields.some((f) => !sameValue(fields[0].value, f.value, fieldKind(name)))
    )
      return undefined;
    return [...fields].sort((a, b) => b.confidence - a.confidence)[0];
  };
  const inv = (name: string) => get("invoice", name),
    pof = (name: string) => get("po", name),
    grnf = (name: string) => get("grn", name);
  const required = (...fields: (Field | undefined)[]) =>
    fields.filter((f): f is Field => Boolean(f));
  const simple = (
    test: TestName,
    expected: Claim["expected"],
    field: Field | undefined,
    kind: string,
  ): Candidate => ({
    test,
    expected,
    observed: scalar(field?.value),
    fields: required(field),
    pass: !field ? null : sameValue(expected, field.value, kind),
    reasons: !field
      ? [`No ${test} evidence could be associated with this ledger line.`]
      : [
          sameValue(expected, field.value, kind)
            ? `${test} agrees with source evidence.`
            : `${test} differs: ledger expects ${String(expected)}; document shows ${String(field.value)}.`,
        ],
  });
  const candidates = [
    simple("amount", line.amount, inv("total"), "money"),
    simple("date", line.date, inv("date"), "text"),
    simple("invoice_no", line.invoice_no, inv("invoice_no"), "text"),
    simple("approval", true, inv("approval"), "boolean"),
  ];
  const amountCandidate = candidates[0],
    currency = inv("currency");
  if (currency) amountCandidate.fields.push(currency);
  if (!currency) {
    amountCandidate.pass = null;
    amountCandidate.reasons.push(
      "Currency could not be established from source evidence.",
    );
  } else if (!sameValue(line.currency, currency.value)) {
    amountCandidate.pass = false;
    amountCandidate.reasons.push(
      `Currency differs: ledger ${line.currency}; source ${String(currency.value)}.`,
    );
  }
  for (const candidate of candidates) {
    if (candidate.test === "amount" && cents(candidate.observed) === null) {
      candidate.pass = null;
      candidate.reasons = [
        "Invoice total is missing or is not a valid monetary value.",
      ];
    }
    if (
      candidate.test === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(String(candidate.observed)) ||
        Number.isNaN(Date.parse(String(candidate.observed))) ||
        new Date(String(candidate.observed)).toISOString().slice(0, 10) !==
          candidate.observed)
    ) {
      candidate.pass = null;
      candidate.reasons = [
        "Invoice date could not be read as a valid ISO date.",
      ];
    }
    if (
      candidate.test === "approval" &&
      typeof candidate.observed !== "boolean"
    ) {
      candidate.pass = null;
      candidate.reasons = [
        "Approval must be independently read as present or clearly absent; unclear evidence is not a signature.",
      ];
    }
  }
  const vendors = required(inv("vendor"), pof("vendor"), grnf("vendor"));
  const vendorPass =
    Boolean(inv("vendor")) &&
    vendors.every((f) => sameValue(line.vendor, f.value));
  candidates.push({
    test: "vendor",
    expected: line.vendor,
    observed: scalar(inv("vendor")?.value),
    fields: vendors,
    pass: inv("vendor") ? vendorPass : null,
    reasons: [
      vendorPass
        ? "Vendor agrees across available invoice, PO and GRN."
        : "Vendor does not agree with the source documents, or invoice evidence is missing.",
    ],
  });
  const net = moneyField(inv("net")),
    vat = moneyField(inv("vat")),
    total = moneyField(inv("total")),
    ledgerVat = cents(line.vat);
  const rate = Number(process.env.VAT_RATE ?? 0.15),
    expectedVat =
      net === null ? null : Math.sign(net) * Math.round(Math.abs(net) * rate);
  const vatValid =
    net !== null &&
    vat !== null &&
    total !== null &&
    ledgerVat !== null &&
    Boolean(currency) &&
    Number.isFinite(rate) &&
    rate >= 0 &&
    rate <= 1;
  const vatReasons: string[] = [];
  if (!vatValid)
    vatReasons.push(
      "VAT arithmetic needs readable net, VAT, gross total and source currency plus a valid VAT policy.",
    );
  else {
    if (!sameValue(line.currency, currency!.value))
      vatReasons.push(
        `Currency differs: ledger ${line.currency}; invoice ${String(currency!.value)}. VAT amounts cannot be compared across currencies.`,
      );
    if (Math.abs(net + vat - total) > 1)
      vatReasons.push("Invoice net plus VAT does not equal the gross total.");
    if (Math.abs(vat - expectedVat!) > 1)
      vatReasons.push(
        `Invoice VAT is ${vat / 100}; policy rate ${rate * 100}% expects ${expectedVat! / 100}.`,
      );
    if (Math.abs(vat - ledgerVat) > 1)
      vatReasons.push(
        `Ledger VAT ${ledgerVat / 100} differs from invoice VAT ${vat / 100}.`,
      );
  }
  candidates.push({
    test: "vat",
    expected: expectedVat === null ? null : expectedVat / 100,
    observed: vat === null ? null : vat / 100,
    fields: required(inv("net"), inv("vat"), inv("total"), currency),
    pass: vatValid ? vatReasons.length === 0 : null,
    reasons: vatReasons.length
      ? vatReasons
      : [
          "Source currency, VAT rate, ledger VAT and net-plus-VAT arithmetic agree to one cent.",
        ],
  });
  const iq = numberField(inv("quantity")),
    pq = numberField(pof("quantity")),
    gq = numberField(grnf("quantity"));
  const quantitiesKnown = iq !== null && pq !== null && gq !== null;
  const qtyPass =
    quantitiesKnown &&
    sameValue(iq, pq, "number") &&
    sameValue(iq, gq, "number") &&
    (line.quantity === undefined || sameValue(iq, line.quantity, "number"));
  candidates.push({
    test: "quantity",
    expected: iq,
    observed: gq,
    fields: required(inv("quantity"), pof("quantity"), grnf("quantity")),
    pass: quantitiesKnown ? qtyPass : null,
    reasons: [
      quantitiesKnown
        ? qtyPass
          ? "Invoice, purchase order and goods receipt quantities agree."
          : `Three-way quantity mismatch: invoice ${iq}, PO ${pq}, goods received ${gq}${line.quantity === undefined ? "" : `, ledger ${line.quantity}`}.`
        : "Three-way quantity testing needs readable invoice, purchase order and goods receipt quantities.",
    ],
  });
  const ip = moneyField(inv("unit_price")),
    pp = moneyField(pof("unit_price")),
    poCurrency = pof("currency"),
    poNet = moneyField(pof("net")),
    poTotal = moneyField(pof("total"));
  const invoiceExtension =
    ip !== null && iq !== null ? Math.round(ip * iq) : null;
  const orderExtension =
    pp !== null && pq !== null ? Math.round(pp * pq) : null;
  const priceKnown =
    ip !== null &&
    pp !== null &&
    Boolean(currency) &&
    Boolean(poCurrency) &&
    net !== null &&
    total !== null &&
    poNet !== null &&
    poTotal !== null &&
    iq !== null &&
    pq !== null &&
    iq >= 0 &&
    pq >= 0 &&
    Number.isSafeInteger(invoiceExtension) &&
    Number.isSafeInteger(orderExtension);
  const sameCurrency = Boolean(
    currency &&
    poCurrency &&
    sameValue(line.currency, currency.value) &&
    sameValue(line.currency, poCurrency.value),
  );
  const priceReasons: string[] = [];
  if (!priceKnown)
    priceReasons.push(
      "Price testing needs invoice and purchase order unit prices, quantities, net and gross totals, with currency evidence from both documents.",
    );
  else {
    if (!sameCurrency)
      priceReasons.push(
        `Currency differs: ledger ${line.currency}, invoice ${String(currency!.value)}, PO ${String(poCurrency!.value)}. Unit prices cannot be compared across currencies.`,
      );
    if (Math.abs(ip - pp) > 1)
      priceReasons.push(
        `Invoice unit price ${ip / 100} differs from PO price ${pp / 100}.`,
      );
    if (Math.abs(invoiceExtension! - net!) > 1)
      priceReasons.push(
        "Invoice quantity multiplied by unit price does not equal its net total.",
      );
    if (Math.abs(orderExtension! - poNet!) > 1)
      priceReasons.push(
        "Purchase order quantity multiplied by unit price does not equal its net total.",
      );
    if (Math.abs(net! - poNet!) > 1)
      priceReasons.push("Invoice and purchase order net totals differ.");
    if (Math.abs(total! - poTotal!) > 1)
      priceReasons.push("Invoice and purchase order gross totals differ.");
  }
  candidates.push({
    test: "price",
    expected: pp === null ? null : pp / 100,
    observed: ip === null ? null : ip / 100,
    fields: required(
      inv("unit_price"),
      pof("unit_price"),
      currency,
      poCurrency,
      inv("quantity"),
      pof("quantity"),
      inv("net"),
      pof("net"),
      inv("total"),
      pof("total"),
    ),
    pass: priceKnown ? priceReasons.length === 0 : null,
    reasons: priceReasons.length
      ? priceReasons
      : [
          "Invoice and purchase order prices, extended net values and gross totals agree in the ledger currency.",
        ],
  });
  const duplicates = engagement.ledger.filter(
    (other) =>
      normalise(other.vendor) === normalise(line.vendor) &&
      normalise(other.invoice_no) === normalise(line.invoice_no),
  );
  const duplicateFields = required(inv("invoice_no"), inv("vendor"));
  candidates.push({
    test: "duplicate",
    expected: 1,
    observed: duplicates.length,
    fields: duplicateFields,
    pass: duplicateFields.length === 2 ? duplicates.length === 1 : null,
    reasons: [
      duplicates.length > 1
        ? `Invoice ${line.invoice_no} for ${line.vendor} occurs on ${duplicates.length} ledger lines: ${duplicates.map((l) => l.id).join(", ")}.`
        : "Vendor and invoice number occur once in the supplied ledger sample.",
    ],
  });
  // Every value crop also depends on independent corroboration of the source identity
  // used to associate it with this ledger line. A right amount on the wrong invoice
  // must never be sufficient for a match.
  for (const candidate of candidates) {
    const dependencies = new Map(
      candidate.fields.map((field) => [field.id, field]),
    );
    const sourceDocuments = [
      ...new Set(candidate.fields.map((field) => field.docId)),
    ]
      .map((id) => engagement.documents.find((doc) => doc.id === id))
      .filter((doc): doc is Document => Boolean(doc));
    for (const document of sourceDocuments) {
      const vendor = sourceField(engagement, document, "vendor");
      const referenceName =
        document.type === "invoice" ? "invoice_no" : "po_no";
      const reference = sourceField(engagement, document, referenceName);
      const invoicePo = inv("po_no");
      const expectedReference =
        document.type === "invoice"
          ? line.invoice_no
          : (line.po_no ?? invoicePo?.value);
      for (const field of [vendor, reference])
        if (field) dependencies.set(field.id, field);
      if (document.type !== "invoice" && invoicePo)
        dependencies.set(invoicePo.id, invoicePo);
      if (
        !vendor ||
        !sameValue(line.vendor, vendor.value) ||
        !reference ||
        expectedReference === undefined ||
        !sameValue(expectedReference, reference.value) ||
        (document.type !== "invoice" &&
          line.po_no &&
          invoicePo &&
          !sameValue(line.po_no, invoicePo.value))
      ) {
        candidate.pass = null;
        candidate.reasons.push(
          `Source identity is missing or conflicting for ${document.name}; vendor and ${referenceName} must corroborate the ledger reference before its values can be used.`,
        );
      }
    }
    candidate.fields = [...dependencies.values()];
  }
  return candidates;
}

/** Associate only unique, explicit document references; uncertain associations remain unverified. */
export function associateDocuments(engagement: Engagement): void {
  for (const doc of engagement.documents) {
    if (doc.ledgerId && engagement.mode === "demo") continue;
    const find = (name: string) => sourceField(engagement, doc, name)?.value;
    const vendor = find("vendor"),
      invoiceNo = find("invoice_no"),
      poNo = find("po_no");
    const lines = engagement.ledger.filter(
      (l) =>
        vendor !== undefined &&
        sameValue(l.vendor, vendor) &&
        ((invoiceNo !== undefined && sameValue(l.invoice_no, invoiceNo)) ||
          (doc.type !== "invoice" &&
            l.po_no &&
            poNo !== undefined &&
            sameValue(l.po_no, poNo))),
    );
    if (lines.length === 1) doc.ledgerId = lines[0].id;
    // A repeated invoice must not silently choose one ledger line. Duplicate tests can use
    // explicit same-source association through candidate resolution below; other tests abstain.
    else doc.ledgerId = undefined;
  }
}

export async function runEngagement(
  engagement: Engagement,
  options: EngineOptions,
): Promise<Engagement> {
  const settings = getSettings(),
    threshold = options.threshold ?? settings.threshold;
  const update = async () => {
    await options.onUpdate?.(engagement);
  };
  const cancelled = () => {
    if (options.signal?.aborted) throw new Error("Audit run aborted.");
  };
  engagement.mode = options.mode;
  engagement.status = "running";
  engagement.error = undefined;
  engagement.startedAt = new Date().toISOString();
  engagement.completedAt = undefined;
  engagement.claims = [];
  engagement.crops = [];
  const fixtureFields = new Map(
    engagement.fields.map((f) => [f.id, structuredClone(f)]),
  );
  if (options.mode === "live") engagement.fields = [];
  appendEvent(
    engagement,
    "plan",
    options.mode === "demo"
      ? "Demo run: synthetic fixture extraction and simulated verification; no Meta API calls will be made."
      : "Live run: source pixels → Spark extraction → SAM segmentation → deterministic tests → blind open-weight verification.",
  );
  await update();
  try {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
      throw new Error("Invalid confidence threshold.");
    if (
      options.mode === "live" &&
      (!settings.metaConfigured || !settings.basetenConfigured)
    )
      throw new Error(
        "Meta and Baseten API keys are not configured. Live runs require MODEL_API_KEY and BASETEN_API_KEY.",
      );
    let plan = new Map<string, TestName[]>();
    if (options.mode === "live") {
      plan = await planTests(
        engagement.ledger,
        engagement.documents,
        options.signal,
      );
      appendEvent(
        engagement,
        "plan",
        `Spark selected test tools for ${plan.size} ledger lines. Core vouching controls remain mandatory.`,
        { model: settings.sparkModel },
      );
      await update();
    } else
      appendEvent(
        engagement,
        "plan",
        `Rule-based demo plan: ${engagement.ledger.length} sample lines, ${TESTS.length} controls per line.`,
        { model: "deterministic demo planner" },
      );
    const documentAttempts = new Map<string, number>();
    for (const document of engagement.documents) {
      cancelled();
      let succeeded = false;
      for (let attempt = 1; attempt <= 2 && !succeeded; attempt++) {
        documentAttempts.set(document.id, attempt);
        try {
          const source = await readFile(
            withinDataDir(options.dataDir, document.sourcePath),
          );
          if (hash(source) !== document.sha256)
            throw new Error(
              "Source document hash changed; this document cannot support evidence.",
            );
          const filepath = withinDataDir(options.dataDir, document.imagePath),
            image = await readFile(filepath);
          const expectedImageHash =
            document.imageSha256 ??
            (document.imagePath === document.sourcePath
              ? document.sha256
              : undefined);
          if (!expectedImageHash)
            throw new Error(
              "No usable rendered image integrity hash; re-import this document.",
            );
          if (hash(image) !== expectedImageHash)
            throw new Error(
              "Rendered image hash changed; this page cannot support evidence.",
            );
          let fields: Field[];
          if (options.mode === "demo") {
            if (!document.synthetic)
              throw new Error(
                "Demo fixtures cannot be used for a non-synthetic document.",
              );
            fields = [...fixtureFields.values()]
              .filter((f) => f.docId === document.id)
              .map((field) => structuredClone(field));
          } else
            fields = (
              await extractFields(document, filepath, attempt, options.signal)
            ).map((f) => ({ ...f, id: `${f.id}-a${attempt}` }));
          if (!fields.length)
            throw new Error(
              "No usable fields extracted from the source document.",
            );
          engagement.fields = engagement.fields
            .filter((f) => f.docId !== document.id)
            .concat(fields);
          appendEvent(
            engagement,
            "extract",
            `${fields.length} fields read from ${document.name}. Source SHA-256 ${document.sha256}; image SHA-256 ${hash(image)}.`,
            {
              ledgerId: document.ledgerId,
              model:
                options.mode === "demo"
                  ? "synthetic fixture metadata"
                  : settings.sparkModel,
            },
          );
          const segments =
            options.mode === "live"
              ? await segmentFields(document, filepath, fields, options.signal)
              : [];
          const cropFolder = path.posix.join("crops", engagement.id);
          await mkdir(withinDataDir(options.dataDir, cropFolder), {
            recursive: true,
          });
          let lowConfidence = false;
          for (const field of fields) {
            cancelled();
            const segment = segments.find((s) => s.fieldId === field.id);
            const bbox = validateBox(
              segment?.bbox ?? field.bbox,
              document.width,
              document.height,
            );
            const safeName = field.id.replace(/[^a-zA-Z0-9_-]/g, "_");
            const relative = path.posix.join(cropFolder, `${safeName}.png`),
              target = withinDataDir(options.dataDir, relative);
            await sharp(image)
              .extract({
                left: bbox[0],
                top: bbox[1],
                width: bbox[2],
                height: bbox[3],
              })
              .png()
              .toFile(target);
            const bytes = await readFile(target);
            const crop: EvidenceCrop = {
              id: `crop-${field.id}`,
              fieldId: field.id,
              docId: document.id,
              field: field.name,
              value: field.value,
              path: relative,
              sha256: hash(bytes),
              bbox,
              confidence:
                options.mode === "demo"
                  ? field.confidence
                  : (segment?.confidence ?? 0),
              method:
                options.mode === "demo" ? "fixture" : segment ? "sam" : "box",
            };
            if (segment) {
              crop.maskPath = path.posix.join(
                cropFolder,
                `${safeName}.mask.svg`,
              );
              await writeFile(
                withinDataDir(options.dataDir, crop.maskPath),
                segment.maskSvg,
                "utf8",
              );
              crop.maskSha256 = hash(segment.maskSvg);
            }
            engagement.crops.push(crop);
            if (Math.min(crop.confidence, field.confidence) < threshold)
              lowConfidence = true;
          }
          appendEvent(
            engagement,
            "segment",
            `${document.name}: ${fields.length} hashed crops; ${options.mode === "demo" ? "fixture boxes (SAM not used)" : `${segments.length} SAM masks, ${fields.length - segments.length} box-only fallbacks`}. Crop hashes: ${engagement.crops
              .filter((c) => fields.some((f) => f.id === c.fieldId))
              .map((c) => `${c.id}=${c.sha256}`)
              .join("; ")}.`,
            {
              ledgerId: document.ledgerId,
              model:
                options.mode === "demo"
                  ? "sharp fixture crop"
                  : settings.samModel,
            },
          );
          if (lowConfidence && attempt === 1 && options.mode === "live") {
            appendEvent(
              engagement,
              "retry",
              `Low confidence or missing SAM mask in ${document.name}; re-extracting once.`,
              { ledgerId: document.ledgerId },
            );
            await update();
            continue;
          }
          succeeded = true;
        } catch (error) {
          const reason = safeProviderError(error);
          if (attempt === 1 && options.mode === "live")
            appendEvent(
              engagement,
              "retry",
              `${document.name}: ${reason} Retrying extraction once.`,
              { ledgerId: document.ledgerId },
            );
          else
            appendEvent(
              engagement,
              "escalate",
              `${document.name}: ${reason} Document evidence requires human review.`,
              { ledgerId: document.ledgerId },
            );
        }
        await update();
      }
    }
    if (options.mode === "live") associateDocuments(engagement);
    const verificationCache = new Map<string, Verification>(),
      cropAttempts = new Map<string, number>();
    const lineOrder = [...plan.keys()];
    const scheduledLines =
      options.mode === "live"
        ? [...engagement.ledger].sort((a, b) => {
            const ai = lineOrder.indexOf(a.id),
              bi = lineOrder.indexOf(b.id);
            return (
              (ai < 0 ? lineOrder.length : ai) -
              (bi < 0 ? lineOrder.length : bi)
            );
          })
        : engagement.ledger;
    if (options.mode === "live")
      appendEvent(
        engagement,
        "plan",
        `Executing planned line priority: ${scheduledLines.map((line) => line.id).join(", ")}.`,
        { model: settings.sparkModel },
      );
    for (const line of scheduledLines) {
      cancelled();
      // A source invoice repeated in the ledger can still substantiate the duplicate control.
      const candidates = matchLedgerLine(engagement, line);
      const selected = [...new Set([...(plan.get(line.id) ?? []), ...TESTS])];
      appendEvent(
        engagement,
        "plan",
        `${line.id} control order: ${selected.join(" → ")}. Mandatory controls remain enforced.`,
        {
          ledgerId: line.id,
          model:
            options.mode === "demo"
              ? "deterministic demo planner"
              : settings.sparkModel,
        },
      );
      for (const candidate of candidates.sort(
        (a, b) => selected.indexOf(a.test) - selected.indexOf(b.test),
      )) {
        const cropIds: string[] = [],
          verificationResults: Verification[] = [],
          reasons = [...candidate.reasons];
        let confidence = 1,
          allEvidence = true;
        for (const field of candidate.fields) {
          const crop = engagement.crops.find((c) => c.fieldId === field.id);
          if (!crop) {
            allEvidence = false;
            reasons.push(`Missing crop for ${field.name}.`);
            continue;
          }
          cropIds.push(crop.id);
          confidence = Math.min(confidence, field.confidence, crop.confidence);
          if (options.mode === "live" && crop.method !== "sam") {
            allEvidence = false;
            reasons.push(
              `${field.name} has a box fallback without a SAM mask.`,
            );
          }
          let verification = verificationCache.get(crop.id);
          if (!verification) {
            cropAttempts.set(crop.id, 1);
            try {
              const bytes = await readFile(
                withinDataDir(options.dataDir, crop.path),
              );
              if (hash(bytes) !== crop.sha256)
                throw new Error(
                  "Evidence crop hash changed; cannot verify this crop.",
                );
              if (options.mode === "demo") {
                const original = fixtureFields.get(field.id);
                verification = {
                  model: "simulated fixture re-read",
                  agrees: Boolean(
                    original &&
                    sameValue(
                      original.value,
                      field.value,
                      fieldKind(field.name),
                    ),
                  ),
                  value: original?.value ?? null,
                  confidence: original?.confidence ?? 0,
                  timestamp: new Date().toISOString(),
                  mode: "demo",
                  reason:
                    "Simulated second read from synthetic fixture metadata; not an independent AI pixel read.",
                };
              } else {
                let read = await readCrop(
                  withinDataDir(options.dataDir, crop.path),
                  field.name,
                  options.signal,
                );
                let agrees =
                  read.value !== null &&
                  sameValue(read.value, field.value, fieldKind(field.name));
                if (!agrees || read.confidence < threshold) {
                  cropAttempts.set(crop.id, 2);
                  appendEvent(
                    engagement,
                    "retry",
                    `Blind reader disagreed or was uncertain on ${field.name}; requesting one fresh crop read.`,
                    { ledgerId: line.id, model: read.model },
                  );
                  read = await readCrop(
                    withinDataDir(options.dataDir, crop.path),
                    field.name,
                    options.signal,
                  );
                  agrees =
                    read.value !== null &&
                    sameValue(read.value, field.value, fieldKind(field.name));
                }
                verification = {
                  model: read.model,
                  agrees,
                  value: read.value,
                  confidence: read.confidence,
                  timestamp: new Date().toISOString(),
                  mode: "live",
                  reason: agrees
                    ? "Independent crop-only reader agrees with extraction."
                    : "Independent crop-only reader did not corroborate the extracted value.",
                };
              }
            } catch (error) {
              verification = {
                model:
                  options.mode === "demo"
                    ? "simulated fixture re-read"
                    : settings.verifierModel,
                agrees: false,
                value: null,
                confidence: 0,
                timestamp: new Date().toISOString(),
                mode: options.mode,
                reason: safeProviderError(error),
              };
            }
            verificationCache.set(crop.id, verification);
          }
          crop.verification = verification;
          verificationResults.push(verification);
          confidence = Math.min(confidence, verification.confidence);
          if (!verification.agrees) {
            allEvidence = false;
            reasons.push(
              `Independent verification did not corroborate ${field.name}.`,
            );
          }
        }
        if (candidate.fields.length === 0) {
          allEvidence = false;
          confidence = 0;
        }
        const verified =
          allEvidence && confidence >= threshold && candidate.pass !== null;
        const result = verified
          ? candidate.pass
            ? "match"
            : "exception"
          : "unverified";
        if (confidence < threshold)
          reasons.push(
            `Evidence confidence ${(confidence * 100).toFixed(0)}% is below ${(threshold * 100).toFixed(0)}% review threshold.`,
          );
        const claim: Claim = {
          id: randomUUID(),
          ledgerId: line.id,
          test: candidate.test,
          result,
          expected: candidate.expected,
          observed: candidate.observed,
          reasons,
          cropIds,
          confidence,
          attempts: Math.max(
            1,
            ...candidate.fields.map(
              (field) => documentAttempts.get(field.docId) ?? 1,
            ),
            ...cropIds.map((id) => cropAttempts.get(id) ?? 1),
          ),
        };
        if (verificationResults.length) {
          const agrees =
            verificationResults.length === candidate.fields.length &&
            verificationResults.every((v) => v.agrees);
          const corroborated = verificationResults.filter(
            (v) => v.agrees,
          ).length;
          const failures = verificationResults
            .filter((v) => !v.agrees)
            .map((v) => v.reason || "Reader did not corroborate this crop.");
          claim.verification = {
            model:
              options.mode === "demo"
                ? "simulated fixture re-read"
                : settings.verifierModel,
            agrees,
            value: agrees ? candidate.observed : null,
            confidence: Math.min(
              ...verificationResults.map((v) => v.confidence),
            ),
            timestamp: new Date().toISOString(),
            mode: options.mode,
            reason: `${options.mode === "demo" ? "Synthetic fixture simulation, not live AI verification. " : ""}${corroborated} of ${candidate.fields.length} available field crops ${options.mode === "demo" ? "corroborated by fixture metadata" : "independently corroborated without ledger values"}.${failures.length ? ` ${failures.join(" ")}` : ""}`,
          };
        }
        engagement.claims.push(claim);
      }
      const claims = engagement.claims.filter((c) => c.ledgerId === line.id);
      appendEvent(
        engagement,
        "match",
        `${line.id}: ${claims.filter((c) => c.result === "match").length} matched, ${claims.filter((c) => c.result === "exception").length} exceptions, ${claims.filter((c) => c.result === "unverified").length} unverified.`,
        { ledgerId: line.id, model: "deterministic matching engine" },
      );
      appendEvent(
        engagement,
        claims.some((c) => c.result === "unverified") ? "escalate" : "verify",
        claims.some((c) => c.result === "unverified")
          ? "Uncorroborated evidence routed to human review."
          : options.mode === "demo"
            ? "Fixture simulation corroborated the evidence crops."
            : "Blind open-weight crop verification completed.",
        {
          ledgerId: line.id,
          model:
            options.mode === "demo"
              ? "simulated fixture re-read"
              : settings.verifierModel,
        },
      );
      await update();
    }
    engagement.status = "complete";
    engagement.completedAt = new Date().toISOString();
    appendEvent(
      engagement,
      "complete",
      `Completed ${engagement.claims.length} controls over ${engagement.ledger.length} sample lines. ${engagement.claims.filter((c) => c.result === "exception").length} exceptions; ${engagement.claims.filter((c) => c.result === "unverified").length} require further evidence. ${options.mode === "demo" ? "Demo results are deterministic synthetic-fixture results." : "Live results require auditor review."} Result seal SHA-256 ${resultSeal(engagement)}.`,
    );
  } catch (error) {
    engagement.status = "failed";
    engagement.error = safeProviderError(error);
    appendEvent(engagement, "error", engagement.error);
  }
  await update();
  return engagement;
}
