import assert from "node:assert/strict";
import type { Engagement } from "../shared/types.js";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3001";
const token = process.env.APP_TOKEN;
assert.ok(
  token && token.length >= 24,
  "Set the ephemeral container APP_TOKEN for this test.",
);
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    if ((await fetch(base + "/api/health")).ok) break;
  } catch {}
  if (attempt === 59)
    throw new Error("Container health endpoint did not become ready.");
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.equal(
  (await fetch(base + "/api/settings")).status,
  401,
  "Unauthenticated evidence access must be rejected.",
);
const login = await fetch(base + "/api/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie?.startsWith("vouch_session="));
assert.match(login.headers.get("set-cookie")!, /HttpOnly/i);
assert.match(login.headers.get("set-cookie")!, /SameSite=Strict/i);
assert.equal(
  (await fetch(base + "/api/settings", { headers: { Cookie: cookie! } }))
    .status,
  200,
  "Session cookie must unlock API.",
);
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
const created = await fetch(base + "/api/demo", {
  method: "POST",
  headers,
  body: "{}",
});
assert.equal(created.status, 201);
const e = (await created.json()) as Engagement;
const start = await fetch(`${base}/api/engagements/${e.id}/run`, {
  method: "POST",
  headers,
  body: JSON.stringify({ mode: "demo" }),
});
assert.equal(start.status, 202);
let result = e;
for (let attempt = 0; attempt < 120; attempt++) {
  result = (await (
    await fetch(`${base}/api/engagements/${e.id}`, { headers })
  ).json()) as Engagement;
  if (result.status !== "running") break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.equal(
  result.status,
  "complete",
  result.error || "Container run did not complete",
);
assert.equal(result.claims.length, 225);
assert.equal(result.claims.filter((c) => c.result === "exception").length, 6);
assert.equal(result.claims.filter((c) => c.result === "unverified").length, 0);
const integrity = await (
  await fetch(`${base}/api/engagements/${e.id}/integrity`, { headers })
).json();
assert.equal(integrity.trail.valid, true);
assert.equal(integrity.resultSeal.valid, true);
assert.equal(integrity.filesValid, true);
assert.equal(
  (await fetch(base + "/files/" + result.crops[0].path)).status,
  401,
);
assert.equal(
  (await fetch(base + "/files/" + result.crops[0].path, { headers })).status,
  200,
);
console.log(
  JSON.stringify(
    {
      passed: true,
      authenticated: true,
      claims: 225,
      exceptions: 6,
      filesChecked: integrity.filesChecked,
    },
    null,
    2,
  ),
);
