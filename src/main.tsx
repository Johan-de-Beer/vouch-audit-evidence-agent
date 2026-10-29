import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Copy,
  FileCheck2,
  FilePlus2,
  FileSearch,
  FileText,
  Fingerprint,
  FolderOpen,
  Info,
  Layers,
  LoaderCircle,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Zap,
  TriangleAlert,
  Link2,
} from "lucide-react";
import type {
  Engagement,
  Claim,
  Document,
  LedgerLine,
  Settings,
  Review,
} from "../shared/types";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "./style.css";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch("/api" + url, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 401) window.dispatchEvent(new Event("vouch-auth"));
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json as T;
}
const fileUrl = (p: string) =>
  "/files/" + p.split(/[\\/]/).map(encodeURIComponent).join("/");
const money = (n: number, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
const nice = (s: string) =>
  ({
    approval: "Signature presence",
    vat: "VAT",
    invoice_no: "Invoice number",
    po_no: "PO reference",
  })[s] || s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
type Tab = "evidence" | "review" | "trace" | "integrity";
function status(e: Engagement, l: LedgerLine) {
  const cs = e.claims.filter((c) => c.ledgerId === l.id);
  return !cs.length
    ? "pending"
    : cs.some((c) => c.result === "exception")
      ? "exception"
      : cs.some((c) => c.result === "unverified")
        ? "unverified"
        : "match";
}
function Badge({
  value,
  children,
}: {
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={"badge " + value}>
      {value === "match" ? (
        <Check size={12} />
      ) : value === "exception" ? (
        <TriangleAlert size={12} />
      ) : value === "running" ? (
        <LoaderCircle size={12} className="spin" />
      ) : null}
      {children || nice(value)}
    </span>
  );
}

function App() {
  const [e, setE] = useState<Engagement | null>(null),
    [engagements, setEngagements] = useState<
      { id: string; name: string; count: number; status: string }[]
    >([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState<Tab>("evidence"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [importing, setImporting] = useState(false),
    [connections, setConnections] = useState(false),
    [showEngagements, setShowEngagements] = useState(false),
    [exportMenu, setExportMenu] = useState(false),
    [docId, setDocId] = useState(""),
    [focusCrop, setFocusCrop] = useState(""),
    [zoom, setZoom] = useState(false),
    [review, setReview] = useState<Claim | null>(null),
    [auth, setAuth] = useState(false),
    [token, setToken] = useState(""),
    [note, setNote] = useState(""),
    [nextMode, setNextMode] = useState<"demo" | "live">("demo"),
    [integrity, setIntegrity] = useState<unknown>(null);
  const searchRef = useRef<HTMLInputElement>(null),
    pollRef = useRef(false);
  const notify = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 5000);
  };
  const loadList = async () => setEngagements(await api("/engagements"));
  const choose = (value: Engagement) => {
    setE(value);
    setNextMode(value.mode);
    setSelected(value.ledger[0]?.id || "");
    setDocId("");
    setFocusCrop("");
    setTab("evidence");
    setFilter("all");
    setQuery("");
    setIntegrity(null);
    setShowEngagements(false);
  };
  const init = async () => {
    try {
      setSettings(await api("/settings"));
      const list =
        await api<
          { id: string; name: string; count: number; status: string }[]
        >("/engagements");
      setEngagements(list);
      choose(
        list.length
          ? await api("/engagements/" + list[0].id)
          : await api("/demo", { method: "POST", body: "{}" }),
      );
      await loadList();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  useEffect(() => {
    void init();
    const listener = () => setAuth(true);
    window.addEventListener("vouch-auth", listener);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setZoom(false);
        setImporting(false);
        setConnections(false);
        setReview(null);
        setExportMenu(false);
      }
      if (
        ev.key === "/" &&
        !(ev.target instanceof HTMLInputElement) &&
        !(ev.target instanceof HTMLTextAreaElement)
      ) {
        ev.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("vouch-auth", listener);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (!e || e.status !== "running") return;
    const timer = setInterval(async () => {
      if (pollRef.current) return;
      pollRef.current = true;
      try {
        const next = await api<Engagement>("/engagements/" + e.id);
        setE(next);
        if (next.status === "complete") {
          notify("Evidence checks complete. Review the exceptions below.");
          void loadList();
        }
        if (next.status === "failed") setError(next.error || "Run failed.");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        pollRef.current = false;
      }
    }, 650);
    return () => clearInterval(timer);
  }, [e?.id, e?.status]);
  const counts = useMemo(() => {
    const list = e?.ledger || [];
    return {
      match: list.filter((l) => e && status(e, l) === "match").length,
      exception: list.filter((l) => e && status(e, l) === "exception").length,
      unverified: list.filter((l) => e && status(e, l) === "unverified").length,
      pending: list.filter((l) => e && status(e, l) === "pending").length,
    };
  }, [e]);
  const rows =
    e?.ledger.filter(
      (l) =>
        (filter === "all" || status(e, l) === filter) &&
        `${l.id} ${l.vendor} ${l.invoice_no}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) || [];
  const line = e?.ledger.find((l) => l.id === selected),
    claims = e?.claims.filter((c) => c.ledgerId === selected) || [];
  const lineDocs =
    e?.documents.filter(
      (d) =>
        d.ledgerId === selected ||
        e.fields.some(
          (f) =>
            f.docId === d.id &&
            f.name === "invoice_no" &&
            String(f.value) === line?.invoice_no,
        ),
    ) || [];
  const docs = lineDocs.length ? lineDocs : e?.documents || [];
  const doc =
    docs.find((d) => d.id === docId) ||
    docs.find((d) => d.type === "invoice") ||
    docs[0];
  const crops = e?.crops.filter((c) => c.docId === doc?.id) || [];
  const currentCrops =
    e?.crops.filter((c) => claims.some((cl) => cl.cropIds.includes(c.id))) ||
    [];
  const running = e?.status === "running";
  const run = async () => {
    if (!e) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Engagement>(`/engagements/${e.id}/run`, {
        method: "POST",
        body: JSON.stringify({ mode: nextMode }),
      });
      setE(next);
      setIntegrity(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const newDemo = async () => {
    setBusy(true);
    try {
      choose(await api("/demo", { method: "POST", body: "{}" }));
      await loadList();
      notify("A fresh synthetic sample is ready.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveNote = async () => {
    if (!e || !line || !note.trim()) return;
    try {
      const n = await api<Engagement["notes"][number]>(
        `/engagements/${e.id}/notes`,
        {
          method: "POST",
          body: JSON.stringify({ ledgerId: line.id, text: note }),
        },
      );
      setNote("");
      setE(await api("/engagements/" + e.id));
      notify("Note saved to the working paper.");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const transcribe = async (file: File) => {
    if (!e || !line) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("ledgerId", line.id);
      form.append("audio", file);
      await api(`/engagements/${e.id}/transcribe`, {
        method: "POST",
        body: form,
      });
      setE(await api("/engagements/" + e.id));
      notify("Voice note transcribed and saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const selectLine = (id: string) => {
    setSelected(id);
    setDocId("");
    setFocusCrop("");
    setNote("");
  };
  const showCrop = (id: string) => {
    const c = e?.crops.find((x) => x.id === id);
    if (c) {
      setDocId(c.docId);
      setFocusCrop(c.id);
      setTab("evidence");
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Vouch home">
          <span className="brand-icon">
            <CheckCheck size={25} />
          </span>
          <span>
            vouch<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">AUDIT EVIDENCE AGENT</div>
        <div className="workspace-switch">
          <span className="workspace-avatar">BW</span>
          <div>
            <strong>BalanceWorx</strong>
            <span>Hackathon workspace</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          <button
            className={tab === "evidence" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("evidence")}
          >
            <FileSearch size={18} />
            Evidence workspace
            <span className="tiny-dot" />
          </button>
          <button
            className={tab === "review" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("review")}
          >
            <ClipboardCheck size={18} />
            Review queue
            {counts.exception + counts.unverified > 0 && (
              <span className="nav-count">
                {counts.exception + counts.unverified}
              </span>
            )}
          </button>
          <button
            className={tab === "trace" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("trace")}
          >
            <Zap size={18} />
            Agent activity
          </button>
          <button
            className={tab === "integrity" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("integrity")}
          >
            <Fingerprint size={18} />
            Evidence integrity
          </button>
        </nav>
        <div className="sidebar-rule" />
        <div className="nav-caption">
          ENGAGEMENTS
          <button title="New engagement" onClick={() => setImporting(true)}>
            <Plus size={14} />
          </button>
        </div>
        <button
          className="engagement-link"
          onClick={() => setShowEngagements(true)}
        >
          <span className="engagement-dot" />
          {e?.name || "Purchase evidence"}
          <ChevronRight size={13} />
        </button>
        <button className="nav-item muted" onClick={() => setImporting(true)}>
          <FilePlus2 size={17} />
          Import new sample
        </button>
        <div className="sidebar-bottom">
          <div className="proof-note">
            <ShieldCheck size={22} />
            <strong>Evidence you can inspect.</strong>
            <p>Source crops. Deterministic checks. A trace for every claim.</p>
          </div>
          <button className="nav-item" onClick={() => setConnections(true)}>
            <Settings2 size={17} />
            Models & connections
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="profile-avatar">JD</span>
            <div>
              <strong>Johan de Beer</strong>
              <span>Local audit workspace</span>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <FolderOpen size={16} />
            <span>Engagements</span>
            <ChevronRight size={14} />
            <strong>{e?.client || "Synthetic / Demonstration"}</strong>
          </div>
          <button className="environment" onClick={() => setConnections(true)}>
            <span className={e?.mode === "live" ? "online-dot" : "amber-dot"} />
            {e?.mode === "live" ? "Live API mode" : "Offline fixture mode"}
            <Info size={13} />
          </button>
        </header>
        <div className="workspace-main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                OCTOBER 2026 · PURCHASES
              </div>
              <h1>
                Every claim. <span>Backed by pixels.</span>
              </h1>
              <p>Vouch the sample. Inspect the evidence. Keep your judgment.</p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary"
                onClick={() => setImporting(true)}
              >
                <Upload size={15} />
                Import sample
              </button>
              <button
                className="button primary"
                onClick={run}
                disabled={!e || running || busy}
              >
                {running ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Play size={15} fill="currentColor" />
                )}
                {running
                  ? "Agent is running…"
                  : nextMode === "live"
                    ? "Run live checks"
                    : e?.status === "complete"
                      ? "Run checks again"
                      : "Run evidence checks"}
              </button>
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={17} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="demo-banner">
            <span className="demo-mark">
              <Sparkles size={17} />
            </span>
            <div>
              <strong>
                {e?.mode === "demo"
                  ? "A complete workflow, ready to explore."
                  : "Live evidence review."}
              </strong>
              <span>
                {e?.mode === "demo"
                  ? "25 synthetic samples · 5 planted scenarios · Fixture extraction & rereads. No API credits used."
                  : "Provider calls use server-side credentials. Every unsupported finding stays unverified."}
              </span>
            </div>
            <button onClick={() => setConnections(true)}>
              {e?.mode === "demo" ? "Connect Meta models" : "Model details"}
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="metrics">
            <Metric
              label="SAMPLE VALUE"
              value={
                e ? money(e.ledger.reduce((s, l) => s + l.amount, 0)) : "—"
              }
              caption={`${e?.ledger.length || 0} ledger lines · ${e?.documents.length || 0} source pages`}
              icon={<Layers size={18} />}
            />
            <Metric
              label="MATCHED"
              value={String(counts.match).padStart(2, "0")}
              caption="All evidence checks passed"
              tone="green"
              icon={<CheckCheck size={19} />}
            />
            <Metric
              label="EXCEPTIONS"
              value={String(counts.exception).padStart(2, "0")}
              caption={
                counts.exception
                  ? "Source evidence differs"
                  : "Findings will appear after a run"
              }
              tone="orange"
              icon={<TriangleAlert size={18} />}
            />
            <Metric
              label="NEEDS VERIFICATION"
              value={String(counts.unverified + counts.pending).padStart(
                2,
                "0",
              )}
              caption={
                counts.pending
                  ? `${counts.pending} awaiting checks`
                  : "Low confidence or missing evidence"
              }
              icon={<FileSearch size={19} />}
            />
          </div>
          <div className="content-top">
            <div className="tabs">
              <button
                className={tab === "evidence" ? "selected" : ""}
                onClick={() => setTab("evidence")}
              >
                Evidence workspace
              </button>
              <button
                className={tab === "review" ? "selected" : ""}
                onClick={() => setTab("review")}
              >
                Review queue<span>{counts.exception + counts.unverified}</span>
              </button>
              <button
                className={tab === "trace" ? "selected" : ""}
                onClick={() => setTab("trace")}
              >
                Agent activity{running && <span className="pulse" />}
              </button>
            </div>
            <div className="export-wrap">
              <button
                className="export-button"
                disabled={!e || running}
                onClick={() => setExportMenu(!exportMenu)}
              >
                <ArrowDownToLine size={15} />
                Export working paper
                <ChevronDown size={13} />
              </button>
              {exportMenu && e && (
                <div className="dropdown export-dropdown">
                  {[
                    [
                      "zip",
                      "Evidence bundle",
                      "Sources, crops, PDF & audit trail",
                    ],
                    [
                      "pdf",
                      "Working paper PDF",
                      "Shareable pages with crop evidence",
                    ],
                    [
                      "html",
                      "Working paper HTML",
                      "Portable report with embedded crops",
                    ],
                    ["json", "Engagement JSON", "Complete structured run data"],
                    ["trail", "Audit trail JSONL", "Hash-chained run events"],
                  ].map(([format, title, description]) => (
                    <a
                      key={format}
                      href={`/api/engagements/${e.id}/export/${format}`}
                      download
                      onClick={() => setExportMenu(false)}
                    >
                      <FileText size={16} />
                      <div>
                        <strong>{title}</strong>
                        <span>{description}</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
          {!e ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              Preparing your workspace…
            </div>
          ) : tab === "evidence" ? (
            <>
              <div className="evidence-grid">
                <section className="panel ledger-panel">
                  <div className="panel-title">
                    <div>
                      <h2>
                        Ledger sample <span>{e.ledger.length}</span>
                      </h2>
                      <p>Occurrence · accuracy · signature presence</p>
                    </div>
                    <button
                      aria-label="Open engagements"
                      className="icon-button"
                      onClick={() => setShowEngagements(true)}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                  </div>
                  <div className="table-toolbar">
                    <label className="search">
                      <Search size={15} />
                      <input
                        ref={searchRef}
                        placeholder="Search vendor, invoice or line…"
                        value={query}
                        onChange={(ev) => setQuery(ev.target.value)}
                      />
                      <kbd>/</kbd>
                    </label>
                    <select
                      aria-label="Filter sample status"
                      value={filter}
                      onChange={(ev) => setFilter(ev.target.value)}
                    >
                      <option value="all">All statuses</option>
                      <option value="exception">Exceptions</option>
                      <option value="unverified">Unverified</option>
                      <option value="match">Matched</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                  <div className="table-scroll">
                    <table className="ledger-table">
                      <thead>
                        <tr>
                          <th>LINE / SUPPLIER</th>
                          <th>INVOICE</th>
                          <th className="align-right">LEDGER AMOUNT</th>
                          <th>RESULT</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((l) => (
                          <tr
                            key={l.id}
                            className={selected === l.id ? "selected-row" : ""}
                            onClick={() => selectLine(l.id)}
                            tabIndex={0}
                            aria-selected={selected === l.id}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter" || ev.key === " ")
                                selectLine(l.id);
                            }}
                          >
                            <td>
                              <div className="supplier">
                                <span
                                  className={
                                    "supplier-icon " +
                                    (status(e, l) === "exception"
                                      ? "orange-bg"
                                      : "")
                                  }
                                >
                                  {l.vendor
                                    .split(" ")
                                    .map((w) => w[0])
                                    .slice(0, 2)
                                    .join("")}
                                </span>
                                <div>
                                  <strong>{l.vendor}</strong>
                                  <small>
                                    {l.id} · {l.account}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="invoice-number">
                                {l.invoice_no}
                              </span>
                              <small>{date(l.date)}</small>
                            </td>
                            <td className="align-right tabular">
                              <strong>{money(l.amount, l.currency)}</strong>
                              <small>incl. VAT</small>
                            </td>
                            <td>
                              <Badge value={status(e, l)} />
                            </td>
                            <td>
                              <ChevronRight size={14} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!rows.length && (
                      <div className="empty">
                        <Search size={25} />
                        <h3>No sample lines found</h3>
                        <p>Try another search or status filter.</p>
                      </div>
                    )}
                  </div>
                  <div className="table-footer">
                    <span>
                      Showing {rows.length} of {e.ledger.length} sample lines
                    </span>
                    <span>
                      <span className="micro-dot" />{" "}
                      {running
                        ? "Checking source evidence…"
                        : e.status === "complete"
                          ? "Run complete"
                          : "Ready for agent checks"}
                    </span>
                  </div>
                </section>
                <section className="panel document-panel">
                  <div className="panel-title">
                    <div>
                      <div className="document-eyebrow">
                        <FileText size={13} />
                        SOURCE EVIDENCE
                      </div>
                      <h2>
                        {line?.invoice_no || "Document viewer"}
                        <span className="document-count">
                          {docs.length} docs
                        </span>
                      </h2>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Expand source document"
                      onClick={() => setZoom(true)}
                      disabled={!doc}
                    >
                      <Maximize2 size={17} />
                    </button>
                  </div>
                  <div className="document-tabs">
                    {docs.slice(0, 8).map((d) => (
                      <button
                        key={d.id}
                        className={doc?.id === d.id ? "selected" : ""}
                        onClick={() => {
                          setDocId(d.id);
                          setFocusCrop("");
                        }}
                      >
                        {d.type === "po"
                          ? "Purchase order"
                          : d.type === "grn"
                            ? "Goods received"
                            : nice(d.type)}
                        {d.pages > 1 ? " · " + d.pages : ""}
                      </button>
                    ))}
                  </div>
                  <DocumentPreview
                    doc={doc}
                    crops={crops}
                    selected={focusCrop}
                    onCrop={(id) => setFocusCrop(id)}
                  />
                  <div className="document-footer">
                    <span>
                      <Fingerprint size={13} />
                      {doc?.sha256.slice(0, 12)}…
                    </span>
                    <a
                      href={doc ? fileUrl(doc.sourcePath) : "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open original
                      <ArrowUpRight size={12} />
                    </a>
                  </div>
                  <div className="crop-legend">
                    <span className="legend-box" />
                    <span>
                      {crops.length
                        ? `${crops.length} evidence regions · click to inspect`
                        : "Run checks to generate evidence crops"}
                    </span>
                  </div>
                </section>
              </div>
              {line && (
                <section className="panel findings">
                  <div className="panel-title">
                    <div>
                      <div className="eyebrow muted-text">
                        SELECTED SAMPLE · {line.id}
                      </div>
                      <h2>
                        {line.vendor}
                        <span className="subtitle">
                          Evidence & verification
                        </span>
                      </h2>
                    </div>
                    <Badge value={status(e, line)} />
                  </div>
                  {claims.length ? (
                    <div className="claim-grid">
                      {claims.map((c) => (
                        <ClaimCard
                          key={c.id}
                          claim={c}
                          e={e}
                          onCrop={showCrop}
                          onReview={() => setReview(c)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="before-run">
                      <span className="before-icon">
                        <FileCheck2 size={28} />
                      </span>
                      <h3>From source document to supported claim.</h3>
                      <p>
                        The agent will check amounts, dates, VAT, signature
                        presence, duplicates and the three-way match. Each
                        result links back to its evidence.
                      </p>
                      <button
                        className="text-button"
                        onClick={run}
                        disabled={running}
                      >
                        Run the sample
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                  <div className="notes-section">
                    <div>
                      <MessageSquare size={17} />
                      <h3>Auditor notes</h3>
                      <span>Included in your working paper</span>
                    </div>
                    {e.notes
                      .filter((n) => n.ledgerId === selected)
                      .map((n) => (
                        <div className="saved-note" key={n.id}>
                          <span>
                            {n.source === "voice" ? (
                              <AudioLines size={14} />
                            ) : (
                              <MessageSquare size={14} />
                            )}
                          </span>
                          <p>{n.text}</p>
                          <small>
                            {new Date(n.createdAt).toLocaleTimeString("en-ZA", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </small>
                        </div>
                      ))}
                    <div className="note-input">
                      <textarea
                        aria-label="Auditor note"
                        value={note}
                        onChange={(ev) => setNote(ev.target.value)}
                        placeholder="Add context, a follow-up, or your review conclusion…"
                        rows={2}
                      />
                      <div>
                        <label
                          className={
                            "voice-upload " +
                            (!settings?.metaConfigured ? "disabled" : "")
                          }
                          title={
                            settings?.metaConfigured
                              ? "Mono PCM WAV, 16/24 kHz, up to 10 minutes"
                              : "Meta credits required. Typed notes work now."
                          }
                        >
                          <AudioLines size={15} />
                          Upload voice note
                          <input
                            type="file"
                            accept=".wav"
                            disabled={!settings?.metaConfigured || busy}
                            onChange={(ev) => {
                              if (ev.target.files?.[0])
                                void transcribe(ev.target.files[0]);
                              ev.target.value = "";
                            }}
                          />
                        </label>
                        <button
                          className="button small primary"
                          onClick={saveNote}
                          disabled={!note.trim() || busy}
                        >
                          Save note
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </>
          ) : tab === "review" ? (
            <section className="panel review-panel">
              <div className="panel-title">
                <div>
                  <h2>Findings that need your judgment</h2>
                  <p>
                    Human review adds a conclusion while preserving the original
                    agent finding.
                  </p>
                </div>
                <Badge value="exception">
                  {e.claims.filter((c) => c.result !== "match").length} findings
                </Badge>
              </div>
              <div className="review-list">
                {e.claims
                  .filter((c) => c.result !== "match")
                  .map((c) => (
                    <div className="review-row" key={c.id}>
                      <span className={"finding-icon " + c.result}>
                        {c.result === "exception" ? (
                          <TriangleAlert size={19} />
                        ) : (
                          <FileSearch size={19} />
                        )}
                      </span>
                      <div>
                        <strong>
                          {e.ledger.find((l) => l.id === c.ledgerId)?.vendor}
                          <span>
                            {c.ledgerId} · {nice(c.test)}
                          </span>
                        </strong>
                        <p>{c.reasons.join(" ")}</p>
                        <small>
                          {e.reviews.filter((r) => r.claimId === c.id).at(-1)
                            ?.decision
                            ? `Reviewed: ${e.reviews.filter((r) => r.claimId === c.id).at(-1)?.decision}`
                            : "Awaiting auditor review"}
                        </small>
                      </div>
                      <button
                        className="button secondary small"
                        onClick={() => {
                          selectLine(c.ledgerId);
                          setTab("evidence");
                          showCrop(c.cropIds[0]);
                        }}
                      >
                        Inspect
                        <ArrowUpRight size={13} />
                      </button>
                      <button
                        className="button primary small"
                        onClick={() => setReview(c)}
                      >
                        Review
                      </button>
                    </div>
                  ))}
                {!e.claims.some((c) => c.result !== "match") && (
                  <div className="empty">
                    <ClipboardCheck size={33} />
                    <h3>
                      {e.status === "complete"
                        ? "No exceptions to review"
                        : "Your review queue is ready"}
                    </h3>
                    <p>
                      {e.status === "complete"
                        ? "Every line passed the configured evidence checks."
                        : "Run the sample to surface exceptions and unsupported claims."}
                    </p>
                  </div>
                )}
              </div>
            </section>
          ) : tab === "trace" ? (
            <section className="panel trace-panel">
              <div className="panel-title">
                <div>
                  <h2>The agent’s working trail</h2>
                  <p>
                    Plan → extract → segment → match → verify → retry or
                    escalate
                  </p>
                </div>
                <Badge value={running ? "running" : e.status}>
                  {e.events.length} events
                </Badge>
              </div>
              <div className="trace-notice">
                <Info size={15} />
                {e.mode === "demo"
                  ? "Offline run: fixture metadata and simulated rereads. Provider names in configuration do not imply API execution."
                  : "Live run: provider names, retries and escalation appear on each event."}
              </div>
              <div className="trace-list">
                {e.events.map((ev, i) => (
                  <details key={ev.id} className={"trace-event " + ev.stage}>
                    <summary>
                      <span className="trace-index">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="event-stage">{ev.stage}</span>
                      <span className="event-message">{ev.message}</span>
                      <span className="event-time">
                        {new Date(ev.timestamp).toLocaleTimeString("en-ZA")}
                      </span>
                      <ChevronDown size={13} />
                    </summary>
                    <div className="event-details">
                      <span>
                        {ev.model || "Deterministic code"}
                        {ev.ledgerId ? " · " + ev.ledgerId : ""}
                      </span>
                      <code>SHA256 {ev.hash}</code>
                      <code>Previous {ev.previousHash}</code>
                    </div>
                  </details>
                ))}
                {!e.events.length && (
                  <div className="empty">
                    <Zap size={33} />
                    <h3>A trace for every step.</h3>
                    <p>
                      Run the sample to follow the agent’s decisions and tool
                      results.
                    </p>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="panel integrity-panel">
              <div className="panel-title">
                <div>
                  <h2>Inspect the chain of evidence</h2>
                  <p>
                    Recompute file hashes and verify every event’s link to the
                    previous event.
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={running || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      setIntegrity(await api(`/engagements/${e.id}/integrity`));
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Fingerprint size={16} />
                  Verify integrity
                </button>
              </div>
              <div className="integrity-body">
                <ShieldCheck size={48} />
                <h3>Traceable from pixels to paper.</h3>
                <p>
                  Original files and evidence crops carry SHA-256 hashes. Agent
                  events form a hash chain, retained with the engagement and
                  exported for inspection.
                </p>
                <p className="muted-text">
                  These checks detect changes against a trusted retained copy.
                  They do not establish authenticity of a source document or
                  replace an auditor’s review.
                </p>
                {integrity != null && (
                  <pre className="integrity-result">
                    {JSON.stringify(integrity, null, 2)}
                  </pre>
                )}
                <div className="integrity-stats">
                  <div>
                    <strong>{e.documents.length}</strong>
                    <span>Source pages</span>
                  </div>
                  <div>
                    <strong>{e.crops.length}</strong>
                    <span>Evidence crops</span>
                  </div>
                  <div>
                    <strong>{e.events.length}</strong>
                    <span>Chained events</span>
                  </div>
                </div>
              </div>
            </section>
          )}
          <footer className="workspace-footer">
            <span>
              <ShieldCheck size={13} />
              Your evidence stays on this server. Live mode sends selected
              documents to configured model providers.
            </span>
            <span>
              <a href="/THIRD_PARTY.md" target="_blank" rel="noreferrer">
                Third-party notices
              </a>{" "}
              · VOUCH 2026
            </span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onCreated={(value) => {
            choose(value);
            setImporting(false);
            void loadList();
            notify("Sample imported. Connect model keys to run live checks.");
          }}
          onError={setError}
        />
      )}
      {connections && (
        <Modal
          title="Models & connections"
          onClose={() => setConnections(false)}
        >
          <p className="modal-intro">
            The complete synthetic workflow works without credits. Live checks
            use credentials stored only in the server environment.
          </p>
          <div className="connection-list">
            {[
              [
                settings?.sparkModel || "muse-spark-1.3",
                "Planning & field extraction",
                settings?.metaConfigured,
              ],
              [
                settings?.samModel || "sam-3.1",
                "Precise evidence segmentation",
                settings?.metaConfigured,
              ],
              [
                settings?.verifierModel || "Muse Spark Open",
                "Independent crop-only reread",
                settings?.basetenConfigured,
              ],
              [
                settings?.voiceModel || "Muse Voice Transcribe",
                "Auditor voice notes",
                settings?.metaConfigured,
              ],
            ].map(([model, role, configured]) => (
              <div key={String(model)}>
                <span className="connection-icon">
                  <Sparkles size={17} />
                </span>
                <div>
                  <strong>{model}</strong>
                  <span>{role}</span>
                </div>
                <Badge value={configured ? "match" : "pending"}>
                  {configured ? "Configured" : "Key pending"}
                </Badge>
              </div>
            ))}
          </div>
          <div className="setup-box">
            <strong>When your credits arrive</strong>
            <ol>
              <li>
                Copy <code>.env.example</code> to <code>.env</code> in the
                project.
              </li>
              <li>
                Set <code>MODEL_API_KEY</code> and <code>BASETEN_API_KEY</code>.
              </li>
              <li>Restart the server, then select Live API below.</li>
              <li>Validate a small synthetic sample before a full run.</li>
            </ol>
          </div>
          {e && (
            <div className="mode-control">
              <span>Run mode</span>
              <select
                aria-label="Run mode"
                value={nextMode}
                disabled={running}
                onChange={(ev) =>
                  setNextMode(ev.target.value as "demo" | "live")
                }
              >
                <option
                  value="demo"
                  disabled={e.documents.some((d) => !d.synthetic)}
                >
                  Offline synthetic fixture
                </option>
                <option
                  value="live"
                  disabled={
                    !settings?.metaConfigured || !settings?.basetenConfigured
                  }
                >
                  Live Meta + Baseten API
                </option>
              </select>
            </div>
          )}
          <p className="modal-footnote">
            Configured means keys are present. Live API access and model quality
            remain unverified until a successful run. No fallback to fixture
            mode occurs.
          </p>
        </Modal>
      )}
      {showEngagements && (
        <Modal
          title="Your engagements"
          onClose={() => setShowEngagements(false)}
        >
          <div className="engagement-list">
            {engagements.map((item) => (
              <button
                key={item.id}
                onClick={async () => {
                  try {
                    choose(await api("/engagements/" + item.id));
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                <FolderOpen size={21} />
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.count} sample lines · {item.status}
                  </span>
                </div>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                void newDemo();
                setShowEngagements(false);
              }}
            >
              <Plus size={15} />
              Fresh demo
            </button>
            <button
              className="button primary"
              onClick={() => {
                setShowEngagements(false);
                setImporting(true);
              }}
            >
              Import sample
              <ArrowRight size={14} />
            </button>
          </div>
        </Modal>
      )}
      {review && e && (
        <ReviewModal
          claim={review}
          e={e}
          onClose={() => setReview(null)}
          onSaved={async () => {
            setReview(null);
            setE(await api("/engagements/" + e.id));
            notify("Review recorded. Original evidence retained.");
          }}
        />
      )}
      {zoom && doc && (
        <div
          className="modal-overlay zoom-overlay"
          onClick={() => setZoom(false)}
        >
          <div className="zoom-dialog" onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-title">
              <div>
                <strong>{doc.name}</strong>
                <span>
                  {doc.width} × {doc.height} px · SHA256{" "}
                  {doc.sha256.slice(0, 18)}…
                </span>
              </div>
              <button
                className="icon-button"
                aria-label="Close expanded document"
                onClick={() => setZoom(false)}
              >
                <X size={21} />
              </button>
            </div>
            <DocumentPreview
              doc={doc}
              crops={crops}
              selected={focusCrop}
              onCrop={setFocusCrop}
            />
          </div>
        </div>
      )}
      {auth && (
        <Modal title="Unlock your workspace" onClose={() => {}}>
          <p className="modal-intro">
            This deployment requires the access token set by its owner.
          </p>
          <form
            onSubmit={async (ev) => {
              ev.preventDefault();
              try {
                await api("/session", {
                  method: "POST",
                  body: JSON.stringify({ token }),
                });
                setToken("");
                setAuth(false);
                setError("");
                void init();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <label className="form-field">
              Access token
              <input
                type="password"
                value={token}
                onChange={(ev) => setToken(ev.target.value)}
                autoComplete="off"
                required
              />
            </label>
            <button className="button primary">Unlock workspace</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  caption,
  icon,
  tone = "",
}: {
  label: string;
  value: string;
  caption: string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className={"metric " + tone}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{caption}</p>
    </div>
  );
}
function DocumentPreview({
  doc,
  crops,
  selected,
  onCrop,
}: {
  doc?: Document;
  crops: Engagement["crops"];
  selected: string;
  onCrop: (id: string) => void;
}) {
  return (
    <div className="document-stage">
      {doc ? (
        <div
          className="document-sheet"
          style={{ aspectRatio: `${doc.width}/${doc.height}` }}
        >
          <img src={fileUrl(doc.imagePath)} alt={doc.name} />
          {crops
            .filter((c) => c.maskPath && (!selected || c.id === selected))
            .map((c) => (
              <img
                className="sam-mask-overlay"
                key={c.id + "-mask"}
                src={fileUrl(c.maskPath!)}
                alt=""
                aria-hidden="true"
              />
            ))}
          {crops.map((c) => (
            <button
              key={c.id}
              className={"evidence-box " + (selected === c.id ? "focused" : "")}
              style={{
                left: (c.bbox[0] / doc.width) * 100 + "%",
                top: (c.bbox[1] / doc.height) * 100 + "%",
                width: (c.bbox[2] / doc.width) * 100 + "%",
                height: (c.bbox[3] / doc.height) * 100 + "%",
              }}
              title={`${nice(c.field)}: ${c.value} · ${c.method}`}
              aria-label={`Inspect ${c.field} evidence: ${c.value}`}
              aria-pressed={selected === c.id}
              onClick={() => onCrop(c.id)}
            >
              <span>{nice(c.field)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          <FileText size={30} />
          <p>Select a source document.</p>
        </div>
      )}
    </div>
  );
}
function ClaimCard({
  claim: c,
  e,
  onCrop,
  onReview,
}: {
  claim: Claim;
  e: Engagement;
  onCrop: (id: string) => void;
  onReview: () => void;
}) {
  const crops = c.cropIds
      .map((id) => e.crops.find((x) => x.id === id))
      .filter((x): x is Engagement["crops"][number] => !!x),
    latest = e.reviews.filter((r) => r.claimId === c.id).at(-1);
  return (
    <article className={"claim-card " + c.result}>
      <div className="claim-heading">
        <span>
          {c.result === "match" ? (
            <Check size={15} />
          ) : c.result === "exception" ? (
            <TriangleAlert size={15} />
          ) : (
            <FileSearch size={15} />
          )}
          <strong>{nice(c.test)}</strong>
        </span>
        <Badge value={c.result} />
      </div>
      <div className="comparison">
        <div>
          <small>EXPECTED</small>
          <strong>{String(c.expected ?? "—")}</strong>
        </div>
        <ArrowRight size={14} />
        <div>
          <small>OBSERVED</small>
          <strong>{String(c.observed ?? "—")}</strong>
        </div>
      </div>
      <p>{c.reasons.join(" ")}</p>
      {crops.length > 0 && (
        <div className="claim-crops">
          {crops.slice(0, 3).map((crop) => (
            <button
              key={crop.id}
              onClick={() => onCrop(crop.id)}
              title={`View ${crop.field} crop`}
            >
              <img src={fileUrl(crop.path)} alt={`${crop.field} source crop`} />
              <span>
                <Link2 size={10} />
                {nice(crop.field)}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="claim-meta">
        <span>
          <ShieldCheck size={12} />
          {Math.round(c.confidence * 100)}% confidence
        </span>
        <span>
          {e.mode === "demo"
            ? "Fixture reread"
            : c.verification?.agrees
              ? "Verified reread"
              : "Review required"}
        </span>
      </div>
      <details className="verification-detail">
        <summary>
          Verification details
          <ChevronDown size={12} />
        </summary>
        <p>
          {c.verification?.model || "No verifier"} ·{" "}
          {c.verification?.reason || "See agent trace for provenance."}
        </p>
        <small>
          Attempt {c.attempts} · {c.cropIds.length} evidence crops
        </small>
        <div className="reread-values">
          {crops.map((crop) => (
            <div key={crop.id}>
              <span>{nice(crop.field)}</span>
              <strong>
                {crop.verification
                  ? String(crop.verification.value ?? "Unreadable")
                  : "No retained read"}
              </strong>
              <small>
                {crop.verification?.agrees ? "Agrees" : "Uncorroborated"}
              </small>
            </div>
          ))}
        </div>
      </details>
      {c.result !== "match" && (
        <button className="claim-review" onClick={onReview}>
          {latest
            ? `Reviewed · ${nice(latest.decision)}`
            : "Add review conclusion"}
          <ArrowUpRight size={12} />
        </button>
      )}
    </article>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href]",
        ) || [],
      ).filter((x) => !x.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const trap = (ev: KeyboardEvent) => {
      if (ev.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last?.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ImportModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: (e: Engagement) => void;
  onError: (e: string) => void;
}) {
  const [ledger, setLedger] = useState<File | null>(null),
    [docs, setDocs] = useState<File[]>([]),
    [name, setName] = useState("Purchases · evidence review"),
    [client, setClient] = useState("Local engagement"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Import an audit sample" onClose={onClose}>
      <p className="modal-intro">
        Add your ledger and supporting source documents. Imported samples
        require live model credentials to run.
      </p>
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (!ledger || !docs.length) return;
          setBusy(true);
          setError("");
          try {
            const f = new FormData();
            f.append("ledger", ledger);
            for (const d of docs) f.append("documents", d);
            f.append("name", name);
            f.append("client", client);
            onCreated(await api("/engagements", { method: "POST", body: f }));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-row">
          <label className="form-field">
            Engagement name
            <input
              value={name}
              maxLength={120}
              required
              onChange={(ev) => setName(ev.target.value)}
            />
          </label>
          <label className="form-field">
            Client / entity
            <input
              value={client}
              maxLength={120}
              required
              onChange={(ev) => setClient(ev.target.value)}
            />
          </label>
        </div>
        <label
          className="upload-zone"
          onDragOver={(ev) => ev.preventDefault()}
          onDrop={(ev) => {
            ev.preventDefault();
            setLedger(ev.dataTransfer.files[0] || null);
          }}
        >
          <FileText size={25} />
          <strong>
            {ledger ? ledger.name : "Choose or drop a ledger CSV"}
          </strong>
          <span>Required columns: date, vendor, invoice_no, amount, vat</span>
          <input
            type="file"
            accept=".csv"
            onChange={(ev) => setLedger(ev.target.files?.[0] || null)}
          />
        </label>
        <a className="template-link" href="/api/ledger-template" download>
          <ArrowDownToLine size={13} />
          Download ledger template
        </a>
        <label
          className="upload-zone"
          onDragOver={(ev) => ev.preventDefault()}
          onDrop={(ev) => {
            ev.preventDefault();
            setDocs(Array.from(ev.dataTransfer.files));
          }}
        >
          <Layers size={25} />
          <strong>
            {docs.length
              ? `${docs.length} documents selected`
              : "Choose or drop source documents"}
          </strong>
          <span>PDF, PNG, JPEG or WebP · 20 MB per file · up to 80 files</span>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            multiple
            onChange={(ev) => setDocs(Array.from(ev.target.files || []))}
          />
        </label>
        <p className="modal-footnote">
          Use filenames containing “PO”, “purchase order”, “GRN”, or “delivery”
          to identify document roles. For this hackathon, use synthetic data
          only. Imported evidence is stored locally and sent to the model
          providers only when you start a live run.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={!ledger || !docs.length || busy}
          >
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Upload size={15} />
            )}{" "}
            {busy ? "Preparing source pages…" : "Import sample"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ReviewModal({
  claim,
  e,
  onClose,
  onSaved,
}: {
  claim: Claim;
  e: Engagement;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reviewer, setReviewer] = useState("Johan de Beer"),
    [decision, setDecision] = useState<Review["decision"]>("follow_up"),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={`Review ${claim.ledgerId} · ${nice(claim.test)}`}
      onClose={onClose}
    >
      <div className="review-summary">
        <Badge value={claim.result} />
        <p>{claim.reasons.join(" ")}</p>
      </div>
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          setBusy(true);
          try {
            await api(`/engagements/${e.id}/reviews`, {
              method: "POST",
              body: JSON.stringify({
                claimId: claim.id,
                reviewer,
                decision,
                note,
              }),
            });
            onSaved();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="form-field">
          Reviewer
          <input
            required
            value={reviewer}
            maxLength={120}
            onChange={(ev) => setReviewer(ev.target.value)}
          />
        </label>
        <label className="form-field">
          Conclusion
          <select
            value={decision}
            onChange={(ev) =>
              setDecision(ev.target.value as Review["decision"])
            }
          >
            <option value="follow_up">
              Follow up with supporting evidence
            </option>
            <option value="accepted">
              Accept the finding for the working paper
            </option>
          </select>
        </label>
        <label className="form-field">
          Review rationale
          <textarea
            required
            rows={4}
            maxLength={3000}
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            placeholder="Document your conclusion and next action…"
          />
        </label>
        <p className="modal-footnote">
          This adds a human conclusion. It preserves the agent’s original result
          and source evidence.
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={!note.trim() || busy}>
            Record review
            <Check size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
