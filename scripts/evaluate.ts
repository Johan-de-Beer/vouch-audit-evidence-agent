import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { generateDemo } from "./gen-data.js";
import { runEngagement } from "../server/engine.js";
import { validateTrail, validateResultSeal } from "../server/trail.js";
import type { Engagement, Fixture } from "../shared/types.js";

const dataDir = resolve(process.env.DATA_DIR || "data");
let fixture: Fixture;
try {
  fixture = JSON.parse(
    await readFile(join(dataDir, "demo", "fixture.json"), "utf8"),
  ) as Fixture;
} catch {
  fixture = await generateDemo(dataDir);
}
const engagement: Engagement = {
  id: `eval-${randomUUID()}`,
  name: "Synthetic pipeline evaluation",
  client: "Fynbos Manufacturing (Demo)",
  period: "October 2026",
  createdAt: new Date().toISOString(),
  mode: "demo",
  status: "ready",
  ledger: structuredClone(fixture.ledger),
  documents: structuredClone(fixture.documents),
  fields: structuredClone(fixture.fields),
  crops: [],
  claims: [],
  events: [],
  notes: [],
  reviews: [],
};
const start = performance.now();
await runEngagement(engagement, { mode: "demo", dataDir });
const actual = new Map(
  engagement.claims.map((claim) => [`${claim.ledgerId}:${claim.test}`, claim]),
);
const cases = fixture.expected.map((expected) => {
  const claim = actual.get(`${expected.ledgerId}:${expected.test}`);
  return {
    ...expected,
    observed: claim?.result ?? "missing",
    correct: claim?.result === expected.result,
  };
});
const planted = cases.filter((item) => item.result === "exception");
const correctExceptions = planted.filter((item) => item.correct).length;
const falsePositives = cases.filter(
  (item) => item.result === "match" && item.observed === "exception",
).length;
const noEvidenceMatches = engagement.claims.filter(
  (claim) =>
    claim.result === "match" &&
    (claim.cropIds.length === 0 ||
      claim.cropIds.some(
        (id) => !engagement.crops.some((crop) => crop.id === id),
      )),
);
const damagedCrops: string[] = [];
for (const crop of engagement.crops) {
  try {
    const bytes = await readFile(join(dataDir, crop.path));
    if (createHash("sha256").update(bytes).digest("hex") !== crop.sha256)
      damagedCrops.push(crop.id);
  } catch {
    damagedCrops.push(crop.id);
  }
}
const trail = validateTrail(engagement.events);
const resultSeal = validateResultSeal(engagement);
const damagedRenderedPages: string[] = [];
for (const document of engagement.documents) {
  try {
    const bytes = await readFile(join(dataDir, document.imagePath));
    if (
      createHash("sha256").update(bytes).digest("hex") !== document.imageSha256
    )
      damagedRenderedPages.push(document.id);
  } catch {
    damagedRenderedPages.push(document.id);
  }
}
const scenarioGroups = [
  ["L003:amount"],
  ["L007:vat"],
  ["L012:quantity"],
  ["L017:approval"],
  ["L021:duplicate", "L022:duplicate"],
];
const detectedScenarios = scenarioGroups.filter((group) =>
  group.every((key) => actual.get(key)?.result === "exception"),
).length;
const metrics = {
  label: "Synthetic fixture pipeline evaluation (NOT live Meta model accuracy)",
  timestamp: new Date().toISOString(),
  mode: "demo",
  elapsedMs: Math.round(performance.now() - start),
  ledgerLines: fixture.ledger.length,
  documents: fixture.documents.length,
  claims: engagement.claims.length,
  expectedTests: cases.length,
  correctTests: cases.filter((item) => item.correct).length,
  plantedScenarios: scenarioGroups.length,
  detectedScenarios,
  expectedExceptions: planted.length,
  detectedExceptions: correctExceptions,
  falsePositives,
  noEvidenceMatches: noEvidenceMatches.length,
  damagedCrops,
  damagedRenderedPages,
  hashChainValid: trail.valid,
  resultSealValid: resultSeal.valid,
  precision:
    correctExceptions + falsePositives
      ? correctExceptions / (correctExceptions + falsePositives)
      : 0,
  recall: planted.length ? correctExceptions / planted.length : 0,
  passed:
    cases.every((item) => item.correct) &&
    noEvidenceMatches.length === 0 &&
    damagedCrops.length === 0 &&
    damagedRenderedPages.length === 0 &&
    trail.valid &&
    resultSeal.valid,
  cases,
};
await mkdir(resolve("artifacts"), { recursive: true });
await writeFile(
  resolve("artifacts", "evaluation.json"),
  JSON.stringify(metrics, null, 2),
);
console.log(JSON.stringify({ ...metrics, cases: undefined }, null, 2));
if (!metrics.passed) process.exitCode = 1;
