import test from "node:test";
import assert from "node:assert/strict";
import { buildLedger } from "../scripts/gen-data.js";

test("synthetic ledger has unique row IDs and a deliberately repeated supplier invoice", () => {
  const ledger = buildLedger();
  assert.equal(ledger.length, 25);
  assert.equal(new Set(ledger.map((line) => line.id)).size, 25);
  const duplicates = ledger.filter(
    (line) =>
      line.vendor === ledger[20].vendor &&
      line.invoice_no === ledger[20].invoice_no,
  );
  assert.deepEqual(
    duplicates.map((line) => line.id),
    ["L021", "L022"],
  );
  assert.ok(
    ledger.every(
      (line) => line.currency === "ZAR" && /^2026-10-\d{2}$/.test(line.date),
    ),
  );
});

test("ground truth planted ledger values are explicit and reproducible", () => {
  const ledger = buildLedger();
  assert.equal(ledger[2].amount, 4530);
  assert.equal(ledger[6].vat, 680);
  assert.equal(ledger[11].quantity, 10);
  assert.deepEqual(buildLedger(), ledger);
});
