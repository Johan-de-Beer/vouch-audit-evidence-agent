import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import type { ProviderCall } from "../shared/types.js";

type Observer = (call: ProviderCall) => void;
type CallInfo = Pick<ProviderCall, "provider" | "operation" | "requestedModel">;
const observers = new AsyncLocalStorage<Observer>();

/** Scoped to one asynchronous run; concurrent engagements cannot exchange traces. */
export function withProviderTrace<T>(observer: Observer, operation: () => Promise<T>): Promise<T> {
  return observers.run(observer, operation);
}

function metadataString(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]{0,199}$/.test(value)) return;
  const secrets = [process.env.MODEL_API_KEY, process.env.META_API_KEY, process.env.BASETEN_API_KEY].filter(Boolean) as string[];
  return secrets.some((secret) => value.includes(secret)) ? undefined : value;
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}
function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Retains metadata only. Never passes prompts, answers, headers or raw errors to an observer. */
export async function traceProviderCall<T>(
  info: CallInfo,
  operation: (capture: (response: unknown) => void) => Promise<T>,
): Promise<T> {
  const observer = observers.getStore();
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const metadata: Partial<ProviderCall> = {};
  const capture = (response: unknown) => {
    const raw = record(response);
    const returnedModel = metadataString(raw.model);
    const responseId = metadataString(raw.id);
    const requestId = metadataString(raw._request_id);
    if (returnedModel) metadata.returnedModel = returnedModel;
    if (responseId) metadata.responseId = responseId;
    if (requestId) metadata.requestId = requestId;
    const usage = record(raw.usage);
    const inputTokens = tokenCount(usage.prompt_tokens ?? usage.input_tokens);
    const outputTokens = tokenCount(usage.completion_tokens ?? usage.output_tokens);
    const totalTokens = tokenCount(usage.total_tokens);
    if (inputTokens !== undefined || outputTokens !== undefined || totalTokens !== undefined) {
      metadata.usage = {
        ...metadata.usage,
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        ...(totalTokens !== undefined ? { totalTokens } : {}),
      };
    }
  };
  let outcome: ProviderCall["outcome"] = "failed";
  try {
    const result = await operation(capture);
    outcome = "success";
    return result;
  } catch (error) {
    const status = record(error).status;
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status < 600) metadata.httpStatus = status;
    const requestId = metadataString(record(error).requestID ?? record(error).request_id);
    if (requestId) metadata.requestId = requestId;
    throw error;
  } finally {
    if (observer) {
      observer({
        ...info,
        requestedModel: metadataString(info.requestedModel) ?? "redacted-or-invalid-model",
        ...metadata,
        startedAt,
        durationMs: Math.max(0, Math.round(performance.now() - start)),
        outcome,
      });
    }
  }
}
