import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import type { Document, ProviderCall, Settings } from "../shared/types.js";
import {
  extractFields,
  getSettings,
  readCrop,
  segmentFields,
  validateBox,
} from "../server/providers.js";
import { cents, sameValue } from "../server/money.js";
import { withProviderTrace } from "../server/provider-trace.js";

type StageName = "credentials" | "source" | "spark" | "sam" | "baseten";
type Outcome = "passed" | "failed" | "blocked" | "skipped";
interface PreflightStep {
  stage: StageName;
  status: Outcome;
  elapsedMs: number;
  message?: string;
  errorCode?: string;
  httpStatus?: number;
  metrics?: Record<string, number | string | boolean | null>;
}
export interface PreflightReport {
  schemaVersion: 1;
  id: string;
  label: string;
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  status: "passed" | "failed" | "blocked";
  coverage: "meta_only" | "meta_and_baseten";
  metaPassed: boolean;
  basetenPassed: boolean | null;
  readyForBoundedFullRun: boolean;
  fullEngagementValidated: false;
  configuration: {
    metaConfigured: boolean;
    basetenConfigured: boolean;
    models: { spark: string; sam: string; verifier: string };
    confidenceThreshold: number;
  };
  limits: {
    documents: 1;
    fieldsSegmented: 1;
    maximumAdapterCalls: number;
    maximumTransportAttempts: number;
    timeoutMs: number;
  };
  adapterCallsMade: number;
  calls: ProviderCall[];
  steps: PreflightStep[];
  artifacts: {
    runDirectory: string | null;
    sourceImageSha256?: string;
    cropSha256?: string;
    maskSha256?: string;
  };
}
export interface PreflightOptions {
  workspaceDir?: string;
  metaOnly?: boolean;
  timeoutMs?: number;
  /** Explicit injection keeps tests independent of real credentials. */
  secretsToRedact?: string[];
}
export interface PreflightAdapters {
  getSettings: typeof getSettings;
  extractFields: typeof extractFields;
  segmentFields: typeof segmentFields;
  readCrop: typeof readCrop;
}
const defaultAdapters: PreflightAdapters = {
  getSettings,
  extractFields,
  segmentFields,
  readCrop,
};
const digest = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
const EXPECTED_TOTAL_CENTS = 115000;

class PreflightFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Only report values are redacted; schema keys and primitive types stay stable. */
export function redactReport<T>(value: T, secrets: readonly string[]): T {
  const nonempty = [...new Set(secrets.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  const visit = (item: unknown): unknown => {
    if (typeof item === "string") {
      let text = item;
      for (const secret of nonempty)
        text = text.split(secret).join("[REDACTED]");
      return text.replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]");
    }
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([key, entry]) => [key, visit(entry)]),
      );
    return item;
  };
  return visit(value) as T;
}

/** External error text, request bodies, headers and response bodies are never logged. */
function failureDetails(
  error: unknown,
): Pick<PreflightStep, "message" | "errorCode" | "httpStatus"> {
  if (error instanceof PreflightFailure)
    return { message: error.message, errorCode: error.code };
  const status =
    error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : NaN;
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    const cases: Record<number, [string, string]> = {
      400: [
        "request_rejected",
        "Provider rejected the request format or parameters.",
      ],
      401: ["authentication", "Provider rejected the API credential."],
      402: ["credits", "Provider requires available credits or billing setup."],
      403: [
        "permission",
        "Credential does not have access to this model or operation.",
      ],
      404: ["model_access", "Configured model or endpoint was not available."],
      429: ["rate_limit", "Provider rate limit reached; retry later."],
    };
    const [errorCode, message] = cases[status] ?? [
      "provider_unavailable",
      "Provider request failed; verify model availability and service status.",
    ];
    return { errorCode, message, httpStatus: status };
  }
  if (
    error instanceof Error &&
    [
      "AbortError",
      "TimeoutError",
      "APIUserAbortError",
      "APIConnectionTimeoutError",
    ].includes(error.name)
  )
    return {
      errorCode: "timeout",
      message: "Preflight exceeded its bounded request deadline.",
    };
  if (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === "ZodError")
  )
    return {
      errorCode: "invalid_output",
      message: "Provider output did not satisfy the evidence contract.",
    };
  return {
    errorCode: "tool_error",
    message:
      "Preflight tool failed. Check local files, model configuration and provider access.",
  };
}

/** This source contains only invented data; no fixture fields or ledger answers are read. */
function invoiceSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1320" viewBox="0 0 1000 1320">
<rect width="1000" height="1320" fill="white"/>
<g font-family="Arial, sans-serif" fill="#132d28">
<text x="70" y="90" font-size="19">FICTIONAL DATA · PROVIDER PREFLIGHT ONLY</text>
<text x="70" y="160" font-size="36" font-weight="700">Fynbos Test Supplies</text>
<text x="70" y="198" font-size="19">Invented supplier · no real client information</text>
<text x="70" y="280" font-size="40" font-weight="700">TAX INVOICE</text>
<text x="70" y="335" font-size="24">Invoice number: PREFLIGHT-001</text>
<text x="70" y="380" font-size="24">Invoice date: 2026-10-29</text>
<text x="70" y="425" font-size="24">Purchase order: PO-PREFLIGHT-001</text>
<text x="70" y="470" font-size="24">Currency: ZAR (South African rand)</text>
<rect x="70" y="540" width="860" height="52" fill="#edf4f0"/>
<text x="90" y="575" font-size="22">Description</text><text x="585" y="575" font-size="22">Qty</text><text x="720" y="575" font-size="22">Unit price</text>
<text x="90" y="645" font-size="23">Fictional testing notebooks</text><text x="590" y="645" font-size="23">10</text><text x="735" y="645" font-size="23">100.00</text>
<path d="M70 685H930" stroke="#a8bbb2"/>
<text x="500" y="745" font-size="25">Net amount</text><text x="745" y="745" font-size="27">1,000.00</text>
<text x="500" y="795" font-size="25">VAT (15%)</text><text x="770" y="795" font-size="27">150.00</text>
<rect x="480" y="820" width="450" height="76" rx="5" fill="#edf4f0"/>
<text x="500" y="870" font-size="29" font-weight="700">TOTAL ZAR</text><text x="745" y="870" font-size="32" font-weight="700">1,150.00</text>
<text x="70" y="990" font-size="23">Approval area</text><path d="M70 1060H460" stroke="#81958d"/>
<text x="70" y="1160" font-size="18">Created only to check live vision extraction and pixel segmentation.</text>
<text x="70" y="1200" font-size="18">This document is not an audit engagement or a genuine invoice.</text>
</g></svg>`;
}

export function validateTimeout(timeoutMs: number): number {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000)
    throw new PreflightFailure(
      "invalid_timeout",
      "Timeout must be an integer from 1000 to 180000 milliseconds.",
    );
  return timeoutMs;
}

async function bounded<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () =>
      reject(new DOMException("Preflight deadline reached.", "TimeoutError"));
    signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try {
    return await Promise.race([operation(), aborted]);
  } finally {
    if (rejectAbort) signal.removeEventListener("abort", rejectAbort);
  }
}

export async function runLivePreflight(
  options: PreflightOptions = {},
  adapters: PreflightAdapters = defaultAdapters,
): Promise<PreflightReport> {
  const started = performance.now();
  const timeoutMs = validateTimeout(options.timeoutMs ?? 120000);
  const workspace = path.resolve(options.workspaceDir ?? process.cwd());
  const reportDirectory = path.join(workspace, "artifacts", "live-preflight");
  const settings: Settings = adapters.getSettings();
  const includeBaseten = settings.basetenConfigured && !options.metaOnly;
  const maximumAdapterCalls = settings.metaConfigured
    ? includeBaseten
      ? 3
      : 2
    : 0;
  const id = randomUUID();
  const runDirectory = path.join(reportDirectory, "runs", id);
  const report: PreflightReport = {
    schemaVersion: 1,
    id,
    label:
      "Bounded live-provider preflight on one generated fictional invoice; not a full-engagement evaluation",
    startedAt: new Date().toISOString(),
    completedAt: "",
    elapsedMs: 0,
    status: settings.metaConfigured ? "failed" : "blocked",
    coverage: includeBaseten ? "meta_and_baseten" : "meta_only",
    metaPassed: false,
    basetenPassed: null,
    readyForBoundedFullRun: false,
    fullEngagementValidated: false,
    configuration: {
      metaConfigured: settings.metaConfigured,
      basetenConfigured: settings.basetenConfigured,
      models: {
        spark: settings.sparkModel,
        sam: settings.samModel,
        verifier: settings.verifierModel,
      },
      confidenceThreshold: settings.threshold,
    },
    limits: {
      documents: 1,
      fieldsSegmented: 1,
      maximumAdapterCalls,
      maximumTransportAttempts: maximumAdapterCalls * 2,
      timeoutMs,
    },
    adapterCallsMade: 0,
    calls: [],
    steps: [],
    artifacts: { runDirectory: null },
  };
  const signal = AbortSignal.timeout(timeoutMs);
  async function step<T>(
    stage: StageName,
    operation: (outcome: PreflightStep) => Promise<T>,
  ): Promise<T> {
    const began = performance.now();
    const outcome: PreflightStep = { stage, status: "failed", elapsedMs: 0 };
    report.steps.push(outcome);
    try {
      const result = await bounded(() => operation(outcome), signal);
      outcome.status = "passed";
      return result;
    } catch (error) {
      Object.assign(outcome, failureDetails(error));
      throw error;
    } finally {
      outcome.elapsedMs = Math.round(performance.now() - began);
    }
  }

  if (!settings.metaConfigured) {
    report.steps.push({
      stage: "credentials",
      status: "blocked",
      elapsedMs: 0,
      errorCode: "missing_meta_key",
      message:
        "MODEL_API_KEY is not configured. No provider requests were attempted.",
    });
  } else {
    report.steps.push({
      stage: "credentials",
      status: "passed",
      elapsedMs: 0,
      message:
        "Meta credential is present; request success will establish whether it is valid.",
    });
    await withProviderTrace(
      (call) => report.calls.push(call),
      async () => {
        try {
          const imagePath = path.join(runDirectory, "fictional-invoice.png");
          const document = await step(
            "source",
            async (outcome): Promise<Document> => {
              await mkdir(runDirectory, { recursive: true });
              const bytes = await sharp(Buffer.from(invoiceSvg()))
                .png()
                .toBuffer();
              await writeFile(imagePath, bytes);
              const sha256 = digest(bytes);
              report.artifacts.runDirectory = path
                .relative(workspace, runDirectory)
                .replaceAll("\\", "/");
              report.artifacts.sourceImageSha256 = sha256;
              outcome.metrics = {
                synthetic: true,
                width: 1000,
                height: 1320,
                sha256,
              };
              const relativeImage = path
                .relative(workspace, imagePath)
                .replaceAll("\\", "/");
              return {
                id: `preflight-${id}`,
                name: "Fictional provider preflight invoice",
                type: "invoice",
                sha256,
                imageSha256: sha256,
                pages: 1,
                sourcePath: relativeImage,
                imagePath: relativeImage,
                width: 1000,
                height: 1320,
                synthetic: true,
              };
            },
          );
          const total = await step("spark", async (outcome) => {
            report.adapterCallsMade++;
            const fields = await adapters.extractFields(
              document,
              imagePath,
              1,
              signal,
            );
            const field = fields.find((item) => item.name === "total");
            outcome.metrics = {
              fieldsReturned: fields.length,
              totalFieldFound: Boolean(field),
              totalAgreesWithPrintedSource: Boolean(
                field && cents(field.value) === EXPECTED_TOTAL_CENTS,
              ),
              confidence: field?.confidence ?? 0,
            };
            if (!field || cents(field.value) !== EXPECTED_TOTAL_CENTS)
              throw new PreflightFailure(
                "extraction_quality",
                "Spark did not read the total printed on the fictional source correctly.",
              );
            if (field.confidence < settings.threshold)
              throw new PreflightFailure(
                "low_confidence",
                "Spark extraction confidence is below the configured review threshold.",
              );
            return field;
          });
          const cropPath = path.join(runDirectory, "total.png");
          await step("sam", async (outcome) => {
            report.adapterCallsMade++;
            const segments = await adapters.segmentFields(
              document,
              imagePath,
              [total],
              signal,
            );
            const segment = segments.find((item) => item.fieldId === total.id);
            outcome.metrics = {
              masksReturned: segments.length,
              confidence: segment?.confidence ?? 0,
            };
            if (!segment)
              throw new PreflightFailure(
                "no_mask",
                "SAM completed without a usable total mask. This is a segmentation-quality failure, not confirmation that authentication failed.",
              );
            if (segment.confidence < settings.threshold)
              throw new PreflightFailure(
                "low_confidence",
                "SAM mask confidence is below the configured review threshold.",
              );
            const [left, top, width, height] = validateBox(
              segment.bbox,
              document.width,
              document.height,
            );
            const bytes = await sharp(imagePath)
              .extract({ left, top, width, height })
              .png()
              .toBuffer();
            await writeFile(cropPath, bytes);
            await writeFile(
              path.join(runDirectory, "total.mask.svg"),
              segment.maskSvg,
              "utf8",
            );
            report.artifacts.cropSha256 = digest(bytes);
            report.artifacts.maskSha256 = digest(segment.maskSvg);
            Object.assign(outcome.metrics, {
              cropSha256: report.artifacts.cropSha256,
              maskSha256: report.artifacts.maskSha256,
            });
          });
          report.metaPassed = true;
          if (includeBaseten) {
            await step("baseten", async (outcome) => {
              report.adapterCallsMade++;
              const reading = await adapters.readCrop(
                cropPath,
                "total",
                signal,
              );
              const agrees =
                reading.value !== null &&
                sameValue(total.value, reading.value, "money");
              outcome.metrics = {
                model: reading.model,
                agreesWithSpark: agrees,
                confidence: reading.confidence,
              };
              report.basetenPassed =
                agrees && reading.confidence >= settings.threshold;
              if (!report.basetenPassed)
                throw new PreflightFailure(
                  "verification_quality",
                  "Independent crop-only reader did not confidently corroborate the source total.",
                );
            });
          } else {
            report.steps.push({
              stage: "baseten",
              status: "skipped",
              elapsedMs: 0,
              message: options.metaOnly
                ? "Skipped by --meta-only. Independent live verification has not been validated."
                : "BASETEN_API_KEY is not configured. Independent live verification has not been validated.",
            });
          }
          report.status = "passed";
          report.readyForBoundedFullRun =
            report.metaPassed && report.basetenPassed === true;
        } catch {
          report.status = "failed";
        }
      },
    );
  }
  report.completedAt = new Date().toISOString();
  report.elapsedMs = Math.round(performance.now() - started);
  const secrets = options.secretsToRedact ?? [
    process.env.MODEL_API_KEY ?? "",
    process.env.META_API_KEY ?? "",
    process.env.BASETEN_API_KEY ?? "",
    process.env.APP_TOKEN ?? "",
  ];
  const sanitized = redactReport(report, secrets);
  await mkdir(reportDirectory, { recursive: true });
  const json = JSON.stringify(sanitized, null, 2) + "\n";
  await writeFile(path.join(reportDirectory, "latest.json"), json, "utf8");
  if (report.artifacts.runDirectory)
    await writeFile(path.join(runDirectory, "report.json"), json, "utf8");
  return sanitized;
}

export function parsePreflightArgs(args: string[]): {
  help: boolean;
  metaOnly: boolean;
  timeoutMs: number;
} {
  let help = false,
    metaOnly = false,
    timeoutMs = 120000;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--help" || args[index] === "-h") help = true;
    else if (args[index] === "--meta-only") metaOnly = true;
    else if (args[index] === "--timeout-ms")
      timeoutMs = validateTimeout(Number(args[++index]));
    else
      throw new PreflightFailure(
        "invalid_argument",
        "Unknown preflight argument. Use --help for supported options.",
      );
  }
  return { help, metaOnly, timeoutMs };
}

async function main(): Promise<void> {
  try {
    const args = parsePreflightArgs(process.argv.slice(2));
    if (args.help) {
      console.log(
        "Usage: npm run live:preflight -- [--meta-only] [--timeout-ms 120000]\nUses one generated fictional invoice. Meta requires MODEL_API_KEY in ignored .env. Baseten is tested only when configured unless --meta-only is set. Reports: artifacts/live-preflight/latest.json and per-run source/crop/mask files. Exit: 0 passed requested scope, 1 failed, 2 missing Meta credential. A preflight never validates a full engagement.",
      );
      return;
    }
    const report = await runLivePreflight(args);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode =
      report.status === "passed" ? 0 : report.status === "blocked" ? 2 : 1;
  } catch (error) {
    console.error(
      JSON.stringify({ status: "failed", ...failureDetails(error) }),
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  void main();
