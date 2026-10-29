import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import {
  parsePreflightArgs,
  redactReport,
  runLivePreflight,
  type PreflightAdapters,
} from "../scripts/live-preflight.js";
import type { Settings } from "../shared/types.js";
import { traceProviderCall } from "../server/provider-trace.js";

function adapters(settings: Partial<Settings> = {}): PreflightAdapters {
  return {
    getSettings: () => ({
      mode: "demo",
      metaConfigured: true,
      basetenConfigured: false,
      sparkModel: "test-spark",
      samModel: "test-sam",
      verifierModel: "test-spark-open",
      voiceModel: "test-voice",
      threshold: 0.8,
      ...settings,
    }),
    extractFields: async (document) => [
      {
        id: `${document.id}-total`,
        docId: document.id,
        name: "total",
        value: 1150,
        page: 1,
        bbox: [730, 830, 190, 60],
        confidence: 0.99,
        model: "test-spark",
      },
    ],
    segmentFields: async (_document, _image, fields) => [
      {
        fieldId: fields[0].id,
        bbox: [730, 830, 190, 60],
        confidence: 0.98,
        maskSvg:
          '<svg xmlns="http://www.w3.org/2000/svg"><rect width="190" height="60"/></svg>',
      },
    ],
    readCrop: async () => ({
      value: 1150,
      confidence: 0.99,
      model: "test-spark-open",
    }),
  };
}
async function temporary(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vouch-preflight-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
test("missing Meta key reports blocked without calling any provider or rendering a source", async () => {
  await temporary(async (workspaceDir) => {
    const tools = adapters({ metaConfigured: false });
    tools.extractFields =
      tools.segmentFields =
      tools.readCrop =
        async () => {
          throw new Error("Provider must not be called.");
        };
    const report = await runLivePreflight(
      { workspaceDir, secretsToRedact: [] },
      tools,
    );
    assert.equal(report.status, "blocked");
    assert.equal(report.adapterCallsMade, 0);
    assert.equal(report.artifacts.runDirectory, null);
    assert.equal(report.fullEngagementValidated, false);
    const stored = JSON.parse(
      await readFile(
        path.join(workspaceDir, "artifacts/live-preflight/latest.json"),
        "utf8",
      ),
    );
    assert.equal(stored.steps[0].errorCode, "missing_meta_key");
  });
});
test("Meta-only preflight generates pixels and reports independent verification as untested", async () => {
  await temporary(async (workspaceDir) => {
    const tools = adapters({ basetenConfigured: true });
    tools.extractFields = async (document, file) => {
      assert.equal(document.synthetic, true);
      assert.equal((await sharp(file).metadata()).width, 1000);
      return adapters().extractFields(document, file);
    };
    tools.readCrop = async () => {
      throw new Error("Meta-only must not call Baseten.");
    };
    const report = await runLivePreflight(
      { workspaceDir, metaOnly: true, secretsToRedact: [] },
      tools,
    );
    assert.equal(report.status, "passed");
    assert.equal(report.metaPassed, true);
    assert.equal(report.basetenPassed, null);
    assert.equal(report.readyForBoundedFullRun, false);
    assert.equal(report.adapterCallsMade, 2);
    assert.equal(report.steps.at(-1)?.status, "skipped");
    assert.match(report.artifacts.sourceImageSha256!, /^[a-f0-9]{64}$/);
    assert.match(report.artifacts.maskSha256!, /^[a-f0-9]{64}$/);
  });
});
test("wrong independent read fails truthfully and receives only the real crop plus field name", async () => {
  await temporary(async (workspaceDir) => {
    const tools = adapters({ basetenConfigured: true });
    tools.readCrop = async (file, fieldName) => {
      assert.equal(fieldName, "total");
      const image = await sharp(file).metadata();
      assert.equal(image.width, 190);
      assert.equal(image.height, 60);
      return { value: 999, confidence: 0.99, model: "test-open" };
    };
    const report = await runLivePreflight(
      { workspaceDir, secretsToRedact: [] },
      tools,
    );
    assert.equal(report.status, "failed");
    assert.equal(report.metaPassed, true);
    assert.equal(report.basetenPassed, false);
    assert.equal(report.readyForBoundedFullRun, false);
    assert.equal(report.adapterCallsMade, 3);
    assert.equal(report.steps.at(-1)?.errorCode, "verification_quality");
  });
});
test("provider errors and model labels cannot expose credentials in stdout-ready or saved reports", async () => {
  await temporary(async (workspaceDir) => {
    const secret = "synthetic-secret-never-output-123";
    const tools = adapters({ sparkModel: secret });
    tools.extractFields = async () => {
      throw Object.assign(new Error(`Bearer ${secret} in provider response`), {
        status: 401,
      });
    };
    const report = await runLivePreflight(
      { workspaceDir, secretsToRedact: [secret] },
      tools,
    );
    const json = JSON.stringify(report);
    const stored = await readFile(
      path.join(workspaceDir, "artifacts/live-preflight/latest.json"),
      "utf8",
    );
    assert.ok(!json.includes(secret));
    assert.ok(!stored.includes(secret));
    assert.equal(report.configuration.models.spark, "[REDACTED]");
    assert.equal(report.steps.at(-1)?.errorCode, "authentication");
    assert.equal(report.steps.at(-1)?.httpStatus, 401);
    assert.equal(report.adapterCallsMade, 1);
    assert.equal(
      redactReport({ message: "Bearer abcdef" }, []).message,
      "Bearer [REDACTED]",
    );
  });
});
test("empty SAM results are quality failures and never trigger a box fallback or verifier", async () => {
  await temporary(async (workspaceDir) => {
    const tools = adapters({ basetenConfigured: true });
    tools.segmentFields = async () => [];
    tools.readCrop = async () => {
      throw new Error("A crop-less verifier must not run.");
    };
    const report = await runLivePreflight(
      { workspaceDir, secretsToRedact: [] },
      tools,
    );
    assert.equal(report.status, "failed");
    assert.equal(report.metaPassed, false);
    assert.equal(report.adapterCallsMade, 2);
    assert.equal(report.steps.at(-1)?.errorCode, "no_mask");
    assert.equal(report.artifacts.cropSha256, undefined);
  });
});
test("CLI arguments keep the preflight bounded and reject unknown or unbounded values", () => {
  assert.deepEqual(
    parsePreflightArgs(["--meta-only", "--timeout-ms", "60000"]),
    { help: false, metaOnly: true, timeoutMs: 60000 },
  );
  assert.throws(() => parsePreflightArgs(["--timeout-ms", "999999"]));
  assert.throws(() => parsePreflightArgs(["--timeout-ms"]));
  assert.throws(() => parsePreflightArgs(["--full-engagement"]));
  assert.equal(parsePreflightArgs(["--help"]).help, true);
});
test("preflight persists safe provider metadata from the ambient real-adapter observer", async () => {
  await temporary(async (workspaceDir) => {
    const tools = adapters();
    const extract = tools.extractFields;
    tools.extractFields = (...args) =>
      traceProviderCall(
        {
          provider: "meta",
          operation: "extract",
          requestedModel: "requested-spark",
        },
        async (capture) => {
          capture({
            id: "response-preflight",
            model: "served-spark",
            _request_id: "request-preflight",
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
            prompt: "must never be recorded",
            answer: "must never be recorded",
          });
          return extract(...args);
        },
      );
    const report = await runLivePreflight(
      { workspaceDir, secretsToRedact: [] },
      tools,
    );
    assert.equal(report.calls.length, 1);
    assert.equal(report.calls[0].returnedModel, "served-spark");
    assert.equal(report.calls[0].responseId, "response-preflight");
    assert.equal(report.calls[0].requestId, "request-preflight");
    assert.deepEqual(report.calls[0].usage, {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
    assert.ok(!JSON.stringify(report).includes("must never be recorded"));
    const stored = JSON.parse(
      await readFile(
        path.join(workspaceDir, "artifacts/live-preflight/latest.json"),
        "utf8",
      ),
    );
    assert.equal(stored.calls[0].outcome, "success");
  });
});
