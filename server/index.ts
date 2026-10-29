import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.js";
import { parseLedger, ingestDocument, safeFile } from "./ingest.js";
import { exportBundle, workpaperHtml, workpaperPdf } from "./export.js";
import { runEngagement } from "./engine.js";
import { getSettings, transcribeAudio } from "./providers.js";
import { withProviderTrace } from "./provider-trace.js";
import {
  appendEvent,
  appendProviderEvent,
  validateTrail,
  validateResultSeal,
  canonicalJson,
} from "./trail.js";
import { generateDemo } from "../scripts/gen-data.js";
import type { Engagement, Mode, Fixture } from "../shared/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, "data"));
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 3001),
  token = process.env.APP_TOKEN || "";
if (!["127.0.0.1", "localhost", "::1"].includes(host) && token.length < 24)
  throw new Error(
    "Network hosting requires APP_TOKEN of at least 24 characters.",
  );
await fs.mkdir(path.join(dataDir, "tmp"), { recursive: true });
const store = createStore(dataDir),
  active = new Map<string, Engagement>(),
  app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (["127.0.0.1", "localhost", "::1"].includes(host)) {
    let hostname = "";
    try {
      hostname = new URL(`http://${req.headers.host || ""}`).hostname;
    } catch {}
    if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(hostname))
      return res.status(403).json({ error: "Unrecognized local host." });
  }
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'",
  );
  next();
});
const eq = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      if (
        origin.host !== req.headers.host &&
        !(
          ["localhost", "127.0.0.1"].includes(origin.hostname) &&
          ["localhost", "127.0.0.1"].includes(
            (req.headers.host || "").split(":")[0],
          ) &&
          origin.port === "5173"
        )
      )
        return res.status(403).json({ error: "Cross-origin write rejected." });
    } catch {
      return res.status(403).json({ error: "Invalid request origin." });
    }
  }
  next();
});
const loginAttempts = new Map<string, { count: number; until: number }>();
app.post("/api/session", (req, res) => {
  const ip = req.ip || "local",
    now = Date.now(),
    prior = loginAttempts.get(ip);
  const entry =
    prior && prior.until > now ? prior : { count: 0, until: now + 60_000 };
  entry.count++;
  loginAttempts.set(ip, entry);
  if (entry.count > 10)
    return res
      .status(429)
      .json({ error: "Too many attempts. Retry in one minute." });
  if (!token || eq(String(req.body.token || ""), token)) {
    if (token)
      res.cookie(
        "vouch_session",
        createHash("sha256").update(token).digest("hex"),
        {
          httpOnly: true,
          sameSite: "strict",
          secure: req.secure,
          maxAge: 8 * 60 * 60 * 1000,
          path: "/",
        },
      );
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Incorrect access token." });
});
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "vouch", version: "0.1.0" }),
);
app.use(["/api", "/files"], (req, res, next) => {
  if (!token) return next();
  const cookie = String(req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("vouch_session="))
    ?.slice(14);
  if (
    eq(
      String(req.headers.authorization || "").replace(/^Bearer /, ""),
      token,
    ) ||
    eq(cookie || "", createHash("sha256").update(token).digest("hex"))
  )
    return next();
  return res.status(401).json({ error: "Access token required." });
});
const get = (req: Request) => {
  const id = String(req.params.id),
    e = active.get(id) || store.get(id);
  if (!e)
    throw Object.assign(new Error("Engagement not found."), { status: 404 });
  return e;
};
const busy = (e: Engagement) => {
  if (e.status === "running")
    throw Object.assign(new Error("A run is already in progress."), {
      status: 409,
    });
};
const blank = (mode: Mode): Engagement => ({
  id: randomUUID(),
  name: "Purchases · evidence review",
  client: "Synthetic / Demonstration",
  period: "October 2026",
  createdAt: new Date().toISOString(),
  mode,
  status: "ready",
  ledger: [],
  documents: [],
  fields: [],
  crops: [],
  claims: [],
  events: [],
  notes: [],
  reviews: [],
});
let fixturePromise: Promise<Fixture> | undefined;
const fixture = () =>
  (fixturePromise ??= (async () => {
    try {
      return JSON.parse(
        await fs.readFile(path.join(dataDir, "demo", "fixture.json"), "utf8"),
      ) as Fixture;
    } catch {
      return generateDemo(dataDir);
    }
  })().catch((err) => {
    fixturePromise = undefined;
    throw err;
  }));
app.get("/api/settings", (_req, res) => res.json(getSettings()));
app.get("/api/engagements", (_req, res) =>
  res.json(
    store
      .list()
      .map(({ id, name, client, period, mode, status, createdAt, ledger }) => ({
        id,
        name,
        client,
        period,
        mode,
        status,
        createdAt,
        count: ledger.length,
      })),
  ),
);
app.get("/api/engagements/:id", (req, res) => res.json(get(req)));
app.post("/api/demo", async (_req, res) => {
  const f = await fixture(),
    e = blank("demo");
  e.ledger = structuredClone(f.ledger);
  e.documents = structuredClone(f.documents);
  e.fields = structuredClone(f.fields);
  store.save(e);
  res.status(201).json(e);
});
const upload = multer({
  dest: path.join(dataDir, "tmp"),
  limits: { fileSize: 20 * 1024 * 1024, files: 81, fields: 6, fieldSize: 2000 },
});
app.post(
  "/api/engagements",
  upload.fields([
    { name: "ledger", maxCount: 1 },
    { name: "documents", maxCount: 80 },
  ]),
  async (req, res) => {
    const files = req.files as
        Record<string, Express.Multer.File[]> | undefined,
      all = Object.values(files || {}).flat();
    try {
      const ledgerFile = files?.ledger?.[0];
      if (!ledgerFile || !files?.documents?.length)
        throw new Error(
          "Upload one ledger CSV and at least one source document.",
        );
      const e = blank("live");
      e.name = String(req.body.name || "Imported sample").slice(0, 120);
      e.client = String(req.body.client || "Local engagement").slice(0, 120);
      e.period = String(req.body.period || "Current period").slice(0, 80);
      e.ledger = parseLedger(await fs.readFile(ledgerFile.path, "utf8"));
      for (const file of files.documents)
        e.documents.push(...(await ingestDocument(dataDir, e.id, file)));
      if (e.documents.length > 200)
        throw new Error("The engagement exceeds the 200 rendered page limit.");
      store.save(e);
      res.status(201).json(e);
    } finally {
      await Promise.all(all.map((f) => fs.unlink(f.path).catch(() => {})));
    }
  },
);
app.post("/api/engagements/:id/run", async (req, res) => {
  const e = get(req);
  busy(e);
  if (active.size >= 2)
    return res.status(429).json({ error: "Two runs are already active." });
  const mode = req.body.mode || e.mode;
  if (mode !== "demo" && mode !== "live") throw new Error("Invalid run mode.");
  if (mode === "demo" && e.documents.some((d) => !d.synthetic))
    throw new Error(
      "Offline fixture mode is available only for the synthetic demonstration.",
    );
  if (mode === "live") {
    const settings = getSettings();
    if (!settings.metaConfigured || !settings.basetenConfigured)
      return res
        .status(409)
        .json({
          error:
            "Live runs require MODEL_API_KEY and BASETEN_API_KEY in the server environment. Offline demonstration remains available.",
        });
  }
  if (mode === "demo") {
    const f = await fixture();
    e.fields = structuredClone(f.fields);
  }
  e.mode = mode;
  e.status = "running";
  e.error = undefined;
  e.startedAt = new Date().toISOString();
  e.completedAt = undefined;
  active.set(e.id, e);
  store.save(e);
  res.status(202).json(e);
  void runEngagement(e, { mode, dataDir, onUpdate: () => store.save(e) })
    .then(() => {
      if (e.status === "running") e.status = "complete";
      e.completedAt = new Date().toISOString();
      store.save(e);
    })
    .catch((err) => {
      e.status = "failed";
      e.error = String(err.message || "Run failed").slice(0, 600);
      appendEvent(e, "error", e.error!);
      store.save(e);
    })
    .finally(() => active.delete(e.id));
});
app.post("/api/engagements/:id/notes", (req, res) => {
  const e = get(req),
    text = String(req.body.text || "").trim(),
    ledgerId = String(req.body.ledgerId || "");
  if (!text || text.length > 5000 || !e.ledger.some((l) => l.id === ledgerId))
    throw new Error(
      "A valid sample line and note of 1–5000 characters are required.",
    );
  const note = {
    id: randomUUID(),
    ledgerId,
    text,
    createdAt: new Date().toISOString(),
    source: "typed" as const,
  };
  e.notes.push(note);
  appendEvent(
    e,
    "note",
    `Note ${note.id} SHA256 ${createHash("sha256").update(canonicalJson(note)).digest("hex")}: auditor added a note.`,
    { ledgerId },
  );
  store.save(e);
  res.status(201).json(note);
});
app.post(
  "/api/engagements/:id/transcribe",
  upload.single("audio"),
  async (req, res) => {
    try {
      const e = get(req),
        ledgerId = String(req.body.ledgerId || "");
      if (!req.file || !e.ledger.some((l) => l.id === ledgerId))
        throw new Error("Select a sample line and supply an audio file.");
      if (!/\.(mp3|wav|m4a|webm|ogg|mp4)$/i.test(req.file.originalname))
        throw new Error("Unsupported audio format.");
      if (!getSettings().metaConfigured)
        return res
          .status(409)
          .json({
            error:
              "Voice transcription needs Meta credits and MODEL_API_KEY. Use a typed note until then.",
          });
      const tempAudio =
        req.file.path + path.extname(req.file.originalname).toLowerCase();
      await fs.rename(req.file.path, tempAudio);
      req.file.path = tempAudio;
      const result = await withProviderTrace(
        (call) => { appendProviderEvent(e, call, ledgerId); store.save(e); },
        () => transcribeAudio(req.file!.path, e.ledger.map((l) => l.vendor)),
      );
      const note = {
        id: randomUUID(),
        ledgerId,
        text: typeof result === "string" ? result : result.text,
        turns: typeof result === "string" ? undefined : result.turns,
        createdAt: new Date().toISOString(),
        source: "voice" as const,
      };
      if (!note.text) throw new Error("Transcription returned no text.");
      e.notes.push(note);
      appendEvent(
        e,
        "note",
        `Note ${note.id} SHA256 ${createHash("sha256").update(canonicalJson(note)).digest("hex")}: Muse Voice Transcribe produced a note.`,
        { ledgerId, model: getSettings().voiceModel },
      );
      store.save(e);
      res.status(201).json(note);
    } finally {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
    }
  },
);
app.post("/api/engagements/:id/reviews", (req, res) => {
  const e = get(req);
  busy(e);
  const claim = e.claims.find((c) => c.id === req.body.claimId),
    decision = req.body.decision,
    reviewer = String(req.body.reviewer || "").trim(),
    note = String(req.body.note || "").trim();
  if (
    !claim ||
    !["accepted", "follow_up"].includes(decision) ||
    !reviewer ||
    reviewer.length > 120 ||
    !note ||
    note.length > 3000
  )
    throw new Error(
      "A valid claim, decision, reviewer and review note are required.",
    );
  const review = {
    id: randomUUID(),
    claimId: claim.id,
    decision,
    reviewer,
    note,
    createdAt: new Date().toISOString(),
  };
  e.reviews.push(review);
  appendEvent(
    e,
    "review",
    `Review ${review.id} SHA256 ${createHash("sha256").update(canonicalJson(review)).digest("hex")}: ${reviewer}: ${decision}. ${note}`,
    { ledgerId: claim.ledgerId },
  );
  store.save(e);
  res.status(201).json(review);
});
app.get("/api/engagements/:id/integrity", async (req, res) => {
  const e = get(req),
    trail = validateTrail(e.events),
    resultSeal = validateResultSeal(e),
    problems: string[] = [],
    annotationProblems: string[] = [];
  const files = [
    ...e.documents.map((d) => [d.id, d.sourcePath, d.sha256]),
    ...e.documents.map((d) => [
      d.id + "-rendered",
      d.imagePath,
      d.imageSha256 || "missing ingestion hash",
    ]),
    ...e.crops.map((c) => [c.id, c.path, c.sha256]),
    ...e.crops
      .filter((c) => c.maskPath)
      .map((c) => [
        c.id + "-mask",
        c.maskPath!,
        c.maskSha256 || "missing mask hash",
      ]),
  ];
  for (const [id, file, expected] of files) {
    try {
      const hash = createHash("sha256")
        .update(await fs.readFile(safeFile(dataDir, file)))
        .digest("hex");
      if (hash !== expected) problems.push(`${id}: content hash differs`);
    } catch {
      problems.push(`${id}: file unavailable`);
    }
  }
  for (const [kind, items] of [
    ["note", e.notes],
    ["review", e.reviews],
  ] as const)
    for (const item of items) {
      const digest = createHash("sha256")
        .update(canonicalJson(item))
        .digest("hex");
      if (
        !e.events.some(
          (ev) =>
            ev.stage === kind &&
            ev.message.includes(
              `${kind === "note" ? "Note" : "Review"} ${item.id} SHA256 ${digest}`,
            ),
        )
      )
        annotationProblems.push(
          `${item.id}: annotation differs or has no retained event hash`,
        );
    }
  res.json({
    trail,
    resultSeal,
    filesValid: !problems.length,
    filesChecked: files.length,
    problems,
    annotationsValid: !annotationProblems.length,
    annotationProblems,
  });
});
app.get("/api/engagements/:id/export/:format", async (req, res) => {
  const e = get(req);
  busy(e);
  const format = String(req.params.format);
  res.setHeader("Cache-Control", "no-store");
  if (format === "json") {
    res.attachment(`vouch-${e.id}.json`).json(e);
    return;
  }
  if (format === "trail") {
    res
      .attachment("audit-trail.jsonl")
      .type("application/x-ndjson")
      .send(e.events.map((x) => JSON.stringify(x)).join("\n") + "\n");
    return;
  }
  if (format === "pdf") {
    res
      .attachment("working-paper.pdf")
      .type("application/pdf")
      .send(await workpaperPdf(e, dataDir));
    return;
  }
  if (format === "html") {
    const images: Record<string, string> = {};
    for (const c of e.crops)
      images[c.path] =
        "data:image/png;base64," +
        (await fs.readFile(safeFile(dataDir, c.path))).toString("base64");
    res
      .attachment("working-paper.html")
      .type("html")
      .send(workpaperHtml(e, images));
    return;
  }
  if (format === "zip") {
    res.attachment("vouch-evidence-bundle.zip").type("application/zip");
    await exportBundle(e, dataDir, res);
    return;
  }
  res.status(404).json({ error: "Unknown export format." });
});
app.get("/api/ledger-template", (_req, res) =>
  res
    .attachment("ledger-template.csv")
    .type("text/csv")
    .send(
      "id,date,vendor,invoice_no,amount,vat,account,currency,quantity,po_no\nL001,2026-10-01,Synthetic Supplier,INV-001,1150.00,150.00,Purchases,ZAR,10,PO-001\n",
    ),
);
app.use(
  "/files",
  (req, res, next) => {
    if (
      !/\.(png|jpe?g|webp|pdf)$/i.test(req.path) &&
      !/^\/crops\/[a-z0-9-]+\/[a-z0-9_-]+\.mask\.svg$/i.test(req.path)
    )
      return res.status(404).end();
    res.setHeader("Cache-Control", "private, max-age=0");
    next();
  },
  express.static(dataDir, {
    dotfiles: "deny",
    fallthrough: false,
    index: false,
  }),
);
app.use(express.static(path.join(root, "dist"), { index: false }));
app.get("/{*path}", (req, res) => {
  if (req.path.startsWith("/api/"))
    return res.status(404).json({ error: "Endpoint not found." });
  return res.sendFile(path.join(root, "dist", "index.html"));
});
app.use(
  (
    err: Error & { status?: number; code?: string },
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    if (res.headersSent) return res.end();
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Files must be smaller than 20 MB."
        : err.message || "Request failed.";
    res.status(err.status || 400).json({ error: message.slice(0, 600) });
  },
);
const server = app.listen(port, host, () =>
  console.log(`Vouch ready at http://${host}:${port} (${dataDir})`),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
