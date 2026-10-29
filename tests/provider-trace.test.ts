import { test } from "node:test";
import assert from "node:assert/strict";
import { traceProviderCall, withProviderTrace } from "../server/provider-trace.js";
import { appendProviderEvent, validateTrail } from "../server/trail.js";
import type { Engagement, ProviderCall } from "../shared/types.js";

const info = { provider: "meta", operation: "extract", requestedModel: "requested-model" } as const;

test("provider traces retain bounded execution metadata and never response content or credentials", async () => {
  const previous = process.env.MODEL_API_KEY;
  process.env.MODEL_API_KEY = "fictional-test-secret";
  const calls: ProviderCall[] = [];
  try {
    const result = await withProviderTrace((call) => calls.push(call), () => traceProviderCall(info, async (capture) => {
      capture({ id: "resp_123", model: "returned-model", _request_id: "req_456", usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }, choices: [{ message: { content: "private invoice text fictional-test-secret" } }], headers: { authorization: "Bearer fictional-test-secret" } });
      capture({ id: "fictional-test-secret", model: "bad\nmodel", usage: { prompt_tokens: -1, completion_tokens: Infinity } });
      return 42;
    }));
    assert.equal(result, 42);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].returnedModel, "returned-model");
    assert.equal(calls[0].responseId, "resp_123");
    assert.equal(calls[0].requestId, "req_456");
    assert.deepEqual(calls[0].usage, { inputTokens: 10, outputTokens: 2, totalTokens: 12 });
    assert.equal(calls[0].outcome, "success");
    assert.ok(calls[0].durationMs >= 0);
    assert.ok(!JSON.stringify(calls).includes("fictional-test-secret"));
    assert.ok(!JSON.stringify(calls).includes("invoice text"));
  } finally {
    if (previous === undefined) delete process.env.MODEL_API_KEY; else process.env.MODEL_API_KEY = previous;
  }
});

test("failed calls retain status and request reference, propagate errors, and are hash chained", async () => {
  const calls: ProviderCall[] = [];
  const failure = Object.assign(new Error("raw provider error with sensitive body"), { status: 429, request_id: "req_failure" });
  await assert.rejects(withProviderTrace((call) => calls.push(call), () => traceProviderCall(info, async () => { throw failure; })), (error) => error === failure);
  assert.equal(calls[0].outcome, "failed");
  assert.equal(calls[0].httpStatus, 429);
  assert.equal(calls[0].requestId, "req_failure");
  assert.ok(!JSON.stringify(calls).includes("sensitive body"));
  const engagement = { events: [] } as unknown as Engagement;
  appendProviderEvent(engagement, calls[0]);
  assert.equal(validateTrail(engagement.events).valid, true);
  engagement.events[0].providerCall!.httpStatus = 200;
  assert.equal(validateTrail(engagement.events).valid, false);
});

test("concurrent provider observers stay isolated and missing metadata is not invented", async () => {
  const a: ProviderCall[] = [], b: ProviderCall[] = [];
  await Promise.all([
    withProviderTrace((call) => a.push(call), () => traceProviderCall(info, async (capture) => { await new Promise((resolve) => setTimeout(resolve, 5)); capture({ model: "model-a" }); })),
    withProviderTrace((call) => b.push(call), () => traceProviderCall({ ...info, provider: "baseten", operation: "verify" }, async () => {})),
  ]);
  assert.equal(a.length, 1);
  assert.equal(a[0].returnedModel, "model-a");
  assert.equal(b.length, 1);
  assert.equal(b[0].provider, "baseten");
  assert.equal(b[0].returnedModel, undefined);
  assert.equal(b[0].usage, undefined);
  assert.equal(b[0].responseId, undefined);
});

test("streamed usage fragments retain previously reported counts", async () => {
  const calls: ProviderCall[] = [];
  await withProviderTrace((call) => calls.push(call), () => traceProviderCall({ ...info, operation: "segment" }, async (capture) => {
    capture({ id: "resp_stream", usage: { input_tokens: 120 } });
    capture({ usage: { output_tokens: 40, total_tokens: 160 } });
  }));
  assert.deepEqual(calls[0].usage, { inputTokens: 120, outputTokens: 40, totalTokens: 160 });
});
