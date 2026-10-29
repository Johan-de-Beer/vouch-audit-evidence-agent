import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Engagement } from "../shared/types.js";
export function createStore(dataDir: string) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "vouch.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS engagements(id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)",
  );
  const save = (e: Engagement) => {
    db.prepare(
      "INSERT INTO engagements VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
    ).run(e.id, JSON.stringify(e), new Date().toISOString());
  };
  const get = (id: string) => {
    const row = db
      .prepare("SELECT payload FROM engagements WHERE id=?")
      .get(id) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as Engagement) : undefined;
  };
  const list = () =>
    (
      db
        .prepare("SELECT payload FROM engagements ORDER BY updated_at DESC")
        .all() as { payload: string }[]
    ).map((row) => JSON.parse(row.payload) as Engagement);
  for (const e of list())
    if (e.status === "running") {
      e.status = "failed";
      e.error =
        "Run interrupted by server restart. Rerun to resume the engagement.";
      save(e);
    }
  return { save, get, list, close: () => db.close() };
}
