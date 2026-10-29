import { createHash, randomUUID } from "node:crypto";
import type { AgentEvent, Engagement } from "../shared/types.js";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
}
export function eventHash(event: Omit<AgentEvent, "hash">): string {
  return createHash("sha256").update(canonicalJson(event)).digest("hex");
}
export function appendEvent(
  engagement: Engagement,
  stage: AgentEvent["stage"],
  message: string,
  extra: Pick<AgentEvent, "ledgerId" | "model"> = {},
): AgentEvent {
  const base = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    stage,
    message,
    ...extra,
    previousHash: engagement.events.at(-1)?.hash ?? "0".repeat(64),
  };
  const event = { ...base, hash: eventHash(base) };
  engagement.events.push(event);
  return event;
}
export function validateTrail(events: AgentEvent[]): {
  valid: boolean;
  events: number;
  head: string;
  error?: string;
} {
  let previousHash = "0".repeat(64);
  for (const event of events) {
    const { hash, ...base } = event;
    if (base.previousHash !== previousHash || eventHash(base) !== hash)
      return {
        valid: false,
        events: events.length,
        head: previousHash,
        error: `Hash chain mismatch at event ${event.id}`,
      };
    previousHash = hash;
  }
  return { valid: true, events: events.length, head: previousHash };
}
/** Seal the reviewable evidence state while allowing later notes and human decisions. */
export function resultSeal(engagement: Engagement): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        mode: engagement.mode,
        ledger: engagement.ledger,
        documents: engagement.documents,
        fields: engagement.fields,
        crops: engagement.crops,
        claims: engagement.claims,
      }),
    )
    .digest("hex");
}
export function validateResultSeal(engagement: Engagement): {
  valid: boolean;
  seal: string;
  error?: string;
} {
  const expected = engagement.events
    .filter((e) => e.stage === "complete")
    .at(-1)
    ?.message.match(/Result seal SHA-256 ([a-f0-9]{64})/i)?.[1];
  const seal = resultSeal(engagement);
  return expected === seal
    ? { valid: true, seal }
    : {
        valid: false,
        seal,
        error: expected
          ? "Evidence state differs from the sealed run."
          : "No completed result seal is present.",
      };
}
