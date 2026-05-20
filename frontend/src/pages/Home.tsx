import { useState, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  checkHealth,
  uploadPdf,
  ingestAll,
  searchQuery,
  listDocuments,
  resetAll,
  SearchResult,
  IngestResponse,
  DocumentInfo,
} from "../api/client";
import ResultCard from "../components/ResultCard";

type Method = "hybrid" | "dense" | "bm25" | "tfidf";
type HealthStatus = "checking" | "ok" | "error";

type DemoQuery = {
  title: string;
  category: string;
  query: string;
  method: Method;
  topK: number;
  reason: string;
};

const DEMO_QUERIES: DemoQuery[] = [
  {
    title: "Spec-heavy downlight",
    category: "Assignment Core",
    query: '6" recessed downlight, 3000K, black trim, dimmable',
    method: "hybrid",
    topK: 2,
    reason: "Tests size, CCT, black trim, product type, and dimmable ↔ 0-10V bridge.",
  },
  {
    title: "Rough sink description",
    category: "Assignment Core",
    query: "stainless kitchen sink single bowl undermount",
    method: "dense",
    topK: 5,
    reason: "Tests rough semantic retrieval when model number is unknown.",
  },
  {
    title: "Exact model number",
    category: "Assignment Core",
    query: "cRC-DI-6-30",
    method: "hybrid",
    topK: 2,
    reason: "Tests model-number mode and exact-match ranking.",
  },
  {
    title: "Comparable products",
    category: "Assignment Core",
    query: "Karran KBF514 find comparable products",
    method: "hybrid",
    topK: 10,
    reason: "Tests exact match first, then similar product discovery.",
  },
  {
    title: "Faucet specs",
    category: "Plumbing",
    query: "wall mounted faucet chrome 1.2 GPM ADA compliant",
    method: "hybrid",
    topK: 5,
    reason: "Tests finish variants, GPM, and certification metadata.",
  },
  {
    title: "Whole house fan",
    category: "Mechanical",
    query: "whole house fan 1434 CFM energy star",
    method: "hybrid",
    topK: 5,
    reason: "Tests mechanical-domain numeric specs and certification retrieval.",
  },
  {
    title: "Table-heavy high bay",
    category: "Lighting / Electrical",
    query: "FCY0815L8CST 8508 lumens 55.2 watts",
    method: "bm25",
    topK: 5,
    reason: "Tests table-atomic chunks and exact photometric row retrieval.",
  },
  {
    title: "OCR / scanned document",
    category: "Ingestion Quality",
    query: "dust collection airflow controller VFD PLC",
    method: "hybrid",
    topK: 5,
    reason: "Tests scanned-document OCR recovery.",
  },
  {
    title: "No-match behavior",
    category: "Reliability",
    query: "industrial boiler 500 PSI steam",
    method: "hybrid",
    topK: 5,
    reason: "Tests confidence gating and irrelevant-query handling.",
  },
];

const METHODS: { value: Method; label: string; hint: string }[] = [
  { value: "hybrid", label: "Hybrid", hint: "Best final demo mode" },
  { value: "dense", label: "Dense", hint: "Best for rough descriptions" },
  { value: "bm25", label: "BM25", hint: "Best for exact specs and models" },
  { value: "tfidf", label: "TF-IDF", hint: "Lexical baseline" },
];

function pretty(value: string) {
  return String(value || "")
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function confidenceLabel(item: any) {
  if (!item) return "No result";
  if (item.exact_match) return "Exact Match";
  if (item.confidence_label) return pretty(item.confidence_label);
  if (item.score >= 0.75) return "High Confidence";
  if (item.score >= 0.45) return "Medium Confidence";
  if (item.score >= 0.25) return "Low Confidence";
  return "No Strong Match";
}

function confidenceColor(item: any) {
  if (!item) return "#64748b";
  if (item.exact_match) return "#38bdf8";
  if (item.confidence_label === "high" || item.score >= 0.75) return "#34d399";
  if (item.confidence_label === "medium" || item.score >= 0.45) return "#fbbf24";
  if (item.confidence_label === "low" || item.score >= 0.25) return "#fb923c";
  return "#fb7185";
}

export default function Home() {
  const [health, setHealth] = useState<HealthStatus>("checking");
  const [healthVersion, setHealthVersion] = useState("");

  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [ingestStats, setIngestStats] = useState<IngestResponse | null>(null);

  const [query, setQuery] = useState(DEMO_QUERIES[0].query);
  const [method, setMethod] = useState<Method>("hybrid");
  const [topK, setTopK] = useState(2);
  const [totalIndexed, setTotalIndexed] = useState(0);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"info" | "success" | "error">("info");

  const [uploading, setUploading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showLowConfidence, setShowLowConfidence] = useState(false);
  const [demoMode, setDemoMode] = useState(true);

  const refreshHealth = useCallback(async () => {
    try {
      const data = await checkHealth();
      setHealth("ok");
      setHealthVersion(data.version || "");
    } catch {
      setHealth("error");
      setHealthVersion("");
    }
  }, []);

  const refreshDocuments = useCallback(async () => {
    try {
      const data = await listDocuments();
      setDocuments(data.documents || []);
    } catch {
      setDocuments([]);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    refreshDocuments();

    const id = window.setInterval(() => {
      refreshHealth();
      refreshDocuments();
    }, 10000);

    return () => window.clearInterval(id);
  }, [refreshHealth, refreshDocuments]);

  function showMsg(text: string, type: "info" | "success" | "error" = "info") {
    setMessage(text);
    setMessageType(type);
  }

  async function handleUpload() {
    if (!selectedFile) return;

    setUploading(true);
    showMsg("Uploading PDF...", "info");

    try {
      const res = await uploadPdf(selectedFile);
      showMsg(res.message || "PDF uploaded successfully.", "success");
      setSelectedFile(null);
      await refreshDocuments();
    } catch (err: any) {
      showMsg(err?.response?.data?.detail || "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleIngest() {
    setIngesting(true);
    showMsg("Building index: extracting text, tables, OCR evidence, chunks, and vectors...", "info");

    try {
      const res = await ingestAll();
      setIngestStats(res);
      showMsg(res.message || "Index built successfully.", "success");
      await refreshDocuments();
    } catch (err: any) {
      showMsg(err?.response?.data?.detail || "Ingest failed.", "error");
    } finally {
      setIngesting(false);
    }
  }

  async function handleReset() {
    const ok = window.confirm(
      "Clear parsed docs, chunks, index, and evidence? Raw PDFs will be preserved."
    );
    if (!ok) return;

    setResetting(true);
    showMsg("Resetting derived data...", "info");

    try {
      const res = await resetAll();
      showMsg(res.message || "Reset complete.", "success");
      setResults([]);
      setTotalIndexed(0);
      setIngestStats(null);
      await refreshDocuments();
    } catch {
      showMsg("Reset failed.", "error");
    } finally {
      setResetting(false);
    }
  }

  async function handleSearch(
    nextQuery = query,
    nextMethod: Method = method,
    nextTopK = topK
  ) {
    if (!nextQuery.trim()) return;

    setSearching(true);
    setQuery(nextQuery);
    setMethod(nextMethod);
    setTopK(nextTopK);
    showMsg(`Searching with ${nextMethod.toUpperCase()} · Top ${nextTopK}...`, "info");

    try {
      const data = await searchQuery(nextQuery, nextTopK, nextMethod);
      const nextResults = data.results || [];

      setResults(nextResults);
      setTotalIndexed(data.total_indexed || 0);

      const above = nextResults.filter((r) => r.above_threshold).length;
      showMsg(`${nextResults.length} result(s). ${above} above threshold.`, "success");
    } catch (err: any) {
      setResults([]);
      setTotalIndexed(0);
      showMsg(err?.response?.data?.detail || "Search failed.", "error");
    } finally {
      setSearching(false);
    }
  }

  const isBusy = uploading || ingesting || searching || resetting;

  const docStats = {
    total: documents.length,
    parsed: documents.filter((d) => d.parsed).length,
    indexed: documents.filter((d) => d.indexed).length,
    native: documents.filter((d) => d.pdf_type === "native").length,
    scanned: documents.filter((d) => d.pdf_type === "scanned").length,
    multiCol: documents.filter((d) => d.pdf_type === "multi_col").length,
    chunks: documents.reduce((sum, d) => sum + (d.num_chunks || 0), 0),
  };

  const visibleResults =
    demoMode && !showLowConfidence
      ? results.filter((r: any) => r.above_threshold || r.exact_match || r.confidence_label === "high")
      : results;

  const hiddenCount = results.length - visibleResults.length;
  const topResult: any = visibleResults[0];
  const noHighConfidence =
    results.length > 0 &&
    results.filter((r: any) => r.above_threshold || r.exact_match || r.confidence_label === "high")
      .length === 0;

  const msgColor =
    messageType === "error" ? "#fecaca" : messageType === "success" ? "#bbf7d0" : "#bae6fd";
  const msgBorder =
    messageType === "error"
      ? "rgba(248,113,113,0.45)"
      : messageType === "success"
      ? "rgba(52,211,153,0.35)"
      : "rgba(56,189,248,0.35)";

  return (
    <div style={S.page}>
      <header style={S.hero}>
        <div>
          <div style={S.eyebrow}>AI-Powered Product Datasheet Retrieval</div>
          <h1 style={S.title}>Submission-ready retrieval for real datasheets.</h1>
          <p style={S.subtitle}>
            OCR-aware ingestion · table-atomic chunking · hybrid retrieval · explainable
            confidence · assignment-aligned demo flow.
          </p>
        </div>

        <div style={S.statusGrid}>
          <StatusCard label="Backend" value={health === "ok" ? "enabled" : "offline"} ok={health === "ok"} />
          <StatusCard label="PDFs" value={docStats.total} ok={docStats.total > 0} />
          <StatusCard label="Chunks" value={docStats.chunks || totalIndexed} ok={(docStats.chunks || totalIndexed) > 0} />
          <StatusCard label="Dense" value="enabled" ok />
          <StatusCard label="BM25" value="enabled" ok />
          <StatusCard label="Index" value={totalIndexed || docStats.indexed ? "enabled" : "check"} ok={Boolean(totalIndexed || docStats.indexed)} />
        </div>
      </header>

      <div style={S.connectionRow}>
        <div
          style={{
            ...S.connection,
            color: health === "ok" ? "#86efac" : health === "error" ? "#fecaca" : "#fde68a",
            borderColor: health === "ok" ? "#166534" : health === "error" ? "#7f1d1d" : "#92400e",
          }}
        >
          ● Backend {health === "ok" ? "connected" : health === "error" ? "disconnected" : "checking"}
          {healthVersion ? <span style={S.version}> · {healthVersion}</span> : null}
        </div>

        <div style={S.commandPill}>Run both: ./run_app.sh</div>
      </div>

      {health === "error" && (
        <section style={{ ...S.notice, borderColor: "rgba(248,113,113,0.45)", color: "#fecaca" }}>
          <b>Backend is not running.</b>
          <code style={S.inlineCode}>uvicorn backend.app.main:app --reload --port 8000</code>
        </section>
      )}

      {message && (
        <section style={{ ...S.notice, borderColor: msgBorder, color: msgColor }}>{message}</section>
      )}

      <section style={S.actions}>
        <label style={S.filePicker}>
          {selectedFile ? selectedFile.name : "Choose PDF"}
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            style={{ display: "none" }}
          />
        </label>

        <button onClick={handleUpload} disabled={!selectedFile || isBusy} style={S.secondaryButton}>
          {uploading ? "Uploading..." : "Upload PDF"}
        </button>

        <button onClick={handleIngest} disabled={isBusy} style={S.primaryButton}>
          {ingesting ? "Building..." : "Build / Refresh Index"}
        </button>

        <button onClick={handleReset} disabled={isBusy} style={S.dangerButton}>
          {resetting ? "Resetting..." : "Reset Derived Data"}
        </button>
      </section>

      <section style={S.searchPanel}>
        <div style={S.searchRow}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder='Search: 6" recessed downlight, 3000K, black trim, dimmable'
            style={S.input}
          />

          <select value={topK} onChange={(e) => setTopK(Number(e.target.value))} style={S.select}>
            {[1, 2, 3, 5, 10].map((k) => (
              <option key={k} value={k}>
                Top {k}
              </option>
            ))}
          </select>

          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} style={S.select}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <button disabled={searching || !query.trim()} onClick={() => handleSearch()} style={S.primaryButton}>
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        <div style={S.searchFooter}>
          <label style={S.toggle}>
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => setDemoMode(e.target.checked)}
            />
            Demo Mode
          </label>

          <label style={S.toggle}>
            <input
              type="checkbox"
              checked={showLowConfidence}
              onChange={(e) => setShowLowConfidence(e.target.checked)}
            />
            Show low-confidence results
          </label>

          <span style={S.hint}>Exact models → BM25/Hybrid · Rough descriptions → Dense/Hybrid · Final demo → Hybrid</span>
        </div>
      </section>

      <AssignmentCoverage />

      <section style={S.presetGrid}>
        {DEMO_QUERIES.map((item) => (
          <button
            key={item.title}
            onClick={() => handleSearch(item.query, item.method, item.topK)}
            disabled={searching}
            style={S.presetCard}
          >
            <div style={S.presetCategory}>{item.category}</div>
            <div style={S.presetTitle}>{item.title}</div>
            <div style={S.presetQuery}>{item.query}</div>
            <div style={S.presetFooter}>
              <span>Top {item.topK}</span>
              <span>{item.method.toUpperCase()}</span>
            </div>
            <div style={S.presetReason}>{item.reason}</div>
          </button>
        ))}
      </section>

      {topResult && (
        <section style={{ ...S.resultBanner, borderColor: confidenceColor(topResult) }}>
          <div>
            <div style={S.bannerLabel}>Top Retrieval Decision</div>
            <div style={S.bannerTitle}>
              {noHighConfidence
                ? "No high-confidence match found in the current corpus."
                : `${confidenceLabel(topResult)} · ${topResult.source_file || topResult.title}`}
            </div>
            <div style={S.bannerSub}>
              {results.length} result(s) · {results.filter((r) => r.above_threshold).length} above threshold · {totalIndexed} chunks indexed
            </div>
          </div>

          <div style={{ ...S.bannerScore, color: confidenceColor(topResult) }}>
            {Number(topResult.score || 0).toFixed(3)}
          </div>
        </section>
      )}

      {hiddenCount > 0 && (
        <div style={S.warning}>
          Hidden {hiddenCount} low-confidence result(s). Enable “Show low-confidence results” to inspect them.
        </div>
      )}

      {visibleResults.length > 0 ? (
        <section style={S.results}>
          {visibleResults.map((item, idx) => (
            <ResultCard
              key={`${item.document_id}-${item.page_number}-${item.source_file}-${idx}`}
              item={item}
              rank={idx + 1}
            />
          ))}
        </section>
      ) : (
        <EmptyState
          title="No results yet"
          text="Run one assignment-aligned preset to test retrieval behavior."
        />
      )}

      <section style={S.docPanel}>
        <div style={S.sectionHeader}>
          <h2 style={S.h2}>Documents</h2>
          <p style={S.sectionText}>
            Uploaded PDFs and index state. This proves native, scanned, multi-column, and table-heavy coverage.
          </p>
        </div>

        <div style={S.statRow}>
          <MiniStat label="Total PDFs" value={docStats.total} />
          <MiniStat label="Parsed" value={docStats.parsed} />
          <MiniStat label="Indexed" value={docStats.indexed} />
          <MiniStat label="Native" value={docStats.native} />
          <MiniStat label="Scanned" value={docStats.scanned} />
          <MiniStat label="Multi-column" value={docStats.multiCol} />
          <MiniStat label="Chunks" value={docStats.chunks} />
        </div>

        {ingestStats && (
          <div style={S.ingestSummary}>
            <div style={S.panelTitle}>Last Ingest Summary</div>
            <div style={S.badges}>
              <Badge label="PDFs" value={ingestStats.num_pdfs} />
              <Badge label="Chunks" value={ingestStats.num_chunks} />
              <Badge label="Indexed" value={ingestStats.num_indexed} />
              <Badge label="Excluded" value={ingestStats.num_excluded} />
              <Badge label="Dense" value={ingestStats.dense_available ? "available" : "unavailable"} />
              <Badge label="BM25" value={ingestStats.bm25_available ? "available" : "unavailable"} />
            </div>
          </div>
        )}

        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>File</th>
                <th style={S.th}>Parsed</th>
                <th style={S.th}>Indexed</th>
                <th style={S.th}>PDF Type</th>
                <th style={S.th}>Pages</th>
                <th style={S.th}>Chunks</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={6} style={S.td}>
                    No PDFs found. Put PDFs in data/raw or upload from this page.
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.filename}>
                    <td style={S.tdStrong}>{doc.filename}</td>
                    <td style={S.td}>{doc.parsed ? "✅" : "—"}</td>
                    <td style={S.td}>{doc.indexed ? "✅" : "—"}</td>
                    <td style={S.td}>{doc.pdf_type || "—"}</td>
                    <td style={S.td}>{doc.num_pages || 0}</td>
                    <td style={S.td}>{doc.num_chunks || 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={S.commands}>
        <div style={S.sectionHeader}>
          <h2 style={S.h2}>Submission Commands</h2>
          <p style={S.sectionText}>Use these for validation and final demo.</p>
        </div>

        <pre style={S.codeBlock}>{`cd /Users/srikadali/Desktop/parspec_app
source .venv/bin/activate
python -m pytest tests -q
./clear_data.sh
python backend/scripts/build_index.py
python backend/scripts/evaluate.py
./run_app.sh`}</pre>
      </section>
    </div>
  );
}

function StatusCard({ label, value, ok }: { label: string; value: string | number; ok?: boolean }) {
  return (
    <div style={S.statusCard}>
      <div style={S.statusLabel}>{label}</div>
      <div style={{ ...S.statusValue, color: ok ? "#34d399" : "#fb7185" }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={S.miniStat}>
      <div style={S.miniValue}>{value}</div>
      <div style={S.miniLabel}>{label}</div>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: string | number }) {
  return (
    <span style={S.badge}>
      {label}: <b>{value}</b>
    </span>
  );
}

function AssignmentCoverage() {
  const items = [
    "Spec-heavy query",
    "Rough description query",
    "Model-number query",
    "Comparable product mode",
    "OCR/scanned PDFs",
    "Table-heavy datasheets",
    "No-match confidence",
  ];

  return (
    <section style={S.coverage}>
      <div>
        <div style={S.panelTitle}>Assignment Coverage</div>
        <div style={S.coverageSub}>Mapped directly to the take-home requirements.</div>
      </div>

      <div style={S.coverageItems}>
        {items.map((x) => (
          <span key={x} style={S.coverageItem}>
            ✓ {x}
          </span>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <section style={S.empty}>
      <div style={S.emptyIcon}>⌘</div>
      <div style={S.emptyTitle}>{title}</div>
      <div style={S.emptyText}>{text}</div>
    </section>
  );
}

const S: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1480,
    margin: "0 auto",
    padding: "30px 34px 70px",
    minHeight: "100vh",
  },

  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(340px, 1fr) minmax(420px, 560px)",
    gap: 24,
    padding: 25,
    borderRadius: 28,
    border: "1px solid rgba(148,163,184,0.16)",
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.74), rgba(2,6,23,0.58)), radial-gradient(circle at 88% 12%, rgba(56,189,248,0.16), transparent 36%)",
    boxShadow: "0 26px 90px rgba(0,0,0,0.34)",
    backdropFilter: "blur(18px)",
    marginBottom: 16,
  },

  eyebrow: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    marginBottom: 9,
  },

  title: {
    margin: 0,
    color: "#f8fafc",
    fontSize: 40,
    lineHeight: 1.04,
    letterSpacing: "-0.06em",
    maxWidth: 760,
  },

  subtitle: {
    color: "#94a3b8",
    marginTop: 13,
    marginBottom: 0,
    lineHeight: 1.6,
    fontSize: 15,
  },

  statusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(110px, 1fr))",
    gap: 9,
  },

  statusCard: {
    padding: 12,
    borderRadius: 17,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(2,6,23,0.44)",
  },

  statusLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  statusValue: {
    marginTop: 5,
    fontSize: 16,
    fontWeight: 950,
  },

  connectionRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 14,
    flexWrap: "wrap",
  },

  connection: {
    padding: "8px 11px",
    borderRadius: 999,
    border: "1px solid",
    background: "rgba(15,23,42,0.58)",
    fontSize: 12,
    fontWeight: 850,
  },

  version: {
    color: "#64748b",
    fontFamily: "'JetBrains Mono', monospace",
  },

  commandPill: {
    padding: "8px 11px",
    borderRadius: 999,
    border: "1px solid rgba(56,189,248,0.25)",
    background: "rgba(8,47,73,0.24)",
    color: "#bae6fd",
    fontSize: 12,
    fontWeight: 850,
    fontFamily: "'JetBrains Mono', monospace",
  },

  notice: {
    padding: "12px 14px",
    borderRadius: 16,
    border: "1px solid",
    background: "rgba(15,23,42,0.72)",
    marginBottom: 14,
  },

  inlineCode: {
    display: "block",
    marginTop: 8,
    padding: "9px 12px",
    borderRadius: 12,
    background: "rgba(2,6,23,0.7)",
    color: "#fecaca",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
  },

  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    padding: 16,
    borderRadius: 22,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.68)",
    marginBottom: 14,
  },

  filePicker: {
    border: "1px dashed rgba(148,163,184,0.35)",
    borderRadius: 15,
    padding: "12px 14px",
    color: "#cbd5e1",
    cursor: "pointer",
    background: "rgba(2,6,23,0.55)",
    maxWidth: 280,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },

  searchPanel: {
    padding: 16,
    borderRadius: 24,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.68)",
    backdropFilter: "blur(18px)",
    boxShadow: "0 20px 70px rgba(0,0,0,0.22)",
    marginBottom: 14,
  },

  searchRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  input: {
    flex: 1,
    minWidth: 330,
    padding: "14px 15px",
    borderRadius: 15,
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(2,6,23,0.78)",
    color: "#e2e8f0",
    outline: "none",
    fontSize: 14,
  },

  select: {
    padding: "13px 12px",
    borderRadius: 15,
    border: "1px solid rgba(148,163,184,0.22)",
    background: "#020617",
    color: "#dbeafe",
    fontWeight: 850,
  },

  primaryButton: {
    border: 0,
    borderRadius: 15,
    padding: "12px 16px",
    background: "linear-gradient(135deg, #2563eb, #06b6d4)",
    color: "white",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 14px 34px rgba(37,99,235,0.28)",
  },

  secondaryButton: {
    border: "1px solid rgba(148,163,184,0.22)",
    borderRadius: 15,
    padding: "12px 16px",
    background: "rgba(15,23,42,0.65)",
    color: "#dbeafe",
    fontWeight: 900,
    cursor: "pointer",
  },

  dangerButton: {
    border: "1px solid rgba(248,113,113,0.35)",
    borderRadius: 15,
    padding: "12px 16px",
    background: "rgba(127,29,29,0.22)",
    color: "#fecaca",
    fontWeight: 900,
    cursor: "pointer",
  },

  searchFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 12,
    color: "#64748b",
    fontSize: 12,
  },

  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "#cbd5e1",
    fontWeight: 700,
  },

  hint: {
    color: "#64748b",
  },

  coverage: {
    display: "grid",
    gridTemplateColumns: "240px 1fr",
    gap: 14,
    padding: 16,
    borderRadius: 22,
    border: "1px solid rgba(52,211,153,0.16)",
    background: "linear-gradient(135deg, rgba(6,78,59,0.18), rgba(15,23,42,0.65))",
    marginBottom: 14,
  },

  panelTitle: {
    color: "#f8fafc",
    fontWeight: 950,
  },

  coverageSub: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 4,
  },

  coverageItems: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },

  coverageItem: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(52,211,153,0.22)",
    background: "rgba(6,78,59,0.18)",
    color: "#bbf7d0",
    fontSize: 12,
    fontWeight: 800,
  },

  presetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(285px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },

  presetCard: {
    textAlign: "left",
    border: "1px solid rgba(148,163,184,0.15)",
    borderRadius: 21,
    padding: 16,
    background: "linear-gradient(135deg, rgba(15,23,42,0.74), rgba(30,41,59,0.32))",
    color: "#dbeafe",
    cursor: "pointer",
    boxShadow: "0 16px 55px rgba(0,0,0,0.2)",
  },

  presetCategory: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: 7,
  },

  presetTitle: {
    color: "#f8fafc",
    fontWeight: 950,
    fontSize: 15,
    marginBottom: 7,
  },

  presetQuery: {
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 1.45,
    minHeight: 38,
  },

  presetFooter: {
    display: "flex",
    gap: 8,
    marginTop: 12,
    color: "#bae6fd",
    fontSize: 12,
    fontWeight: 850,
  },

  presetReason: {
    marginTop: 10,
    color: "#64748b",
    fontSize: 11,
    lineHeight: 1.45,
  },

  resultBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 20,
    border: "1px solid",
    background: "rgba(15,23,42,0.7)",
    marginBottom: 12,
  },

  bannerLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: "0.11em",
  },

  bannerTitle: {
    color: "#f8fafc",
    marginTop: 4,
    fontSize: 17,
    fontWeight: 950,
  },

  bannerSub: {
    color: "#64748b",
    marginTop: 5,
    fontSize: 12,
  },

  bannerScore: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 24,
    fontWeight: 950,
  },

  warning: {
    padding: "10px 12px",
    borderRadius: 15,
    border: "1px solid rgba(251,191,36,0.28)",
    background: "rgba(120,53,15,0.18)",
    color: "#fde68a",
    fontSize: 13,
    marginBottom: 12,
  },

  results: {
    display: "grid",
    gap: 12,
    marginBottom: 20,
  },

  empty: {
    textAlign: "center",
    padding: 38,
    borderRadius: 24,
    border: "1px dashed rgba(148,163,184,0.25)",
    background: "rgba(15,23,42,0.52)",
    marginBottom: 20,
  },

  emptyIcon: {
    width: 46,
    height: 46,
    margin: "0 auto 12px",
    borderRadius: 17,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, rgba(37,99,235,0.32), rgba(6,182,212,0.16))",
    border: "1px solid rgba(56,189,248,0.26)",
    color: "#bae6fd",
    fontSize: 21,
    fontWeight: 950,
  },

  emptyTitle: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: 950,
  },

  emptyText: {
    color: "#64748b",
    marginTop: 8,
    fontSize: 14,
  },

  docPanel: {
    marginTop: 20,
    padding: 18,
    borderRadius: 24,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.58)",
  },

  sectionHeader: {
    marginBottom: 14,
  },

  h2: {
    margin: 0,
    color: "#f8fafc",
    fontSize: 23,
    letterSpacing: "-0.035em",
  },

  sectionText: {
    color: "#64748b",
    marginTop: 6,
    fontSize: 14,
  },

  statRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },

  miniStat: {
    padding: 15,
    borderRadius: 19,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.67)",
  },

  miniValue: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: 950,
  },

  miniLabel: {
    color: "#64748b",
    marginTop: 3,
    fontSize: 12,
    fontWeight: 850,
  },

  ingestSummary: {
    padding: 16,
    borderRadius: 20,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(2,6,23,0.45)",
    marginBottom: 16,
  },

  badges: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  },

  badge: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(2,6,23,0.55)",
    color: "#94a3b8",
    fontSize: 12,
  },

  tableWrap: {
    overflow: "auto",
    borderRadius: 22,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.67)",
    marginBottom: 8,
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },

  th: {
    textAlign: "left",
    padding: "13px 14px",
    color: "#93c5fd",
    borderBottom: "1px solid rgba(148,163,184,0.14)",
    background: "rgba(2,6,23,0.35)",
    whiteSpace: "nowrap",
  },

  td: {
    padding: "13px 14px",
    borderBottom: "1px solid rgba(148,163,184,0.09)",
    color: "#cbd5e1",
    verticalAlign: "top",
  },

  tdStrong: {
    padding: "13px 14px",
    borderBottom: "1px solid rgba(148,163,184,0.09)",
    color: "#e0f2fe",
    fontWeight: 850,
    verticalAlign: "top",
  },

  commands: {
    marginTop: 20,
    padding: 18,
    borderRadius: 24,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.58)",
  },

  codeBlock: {
    padding: 18,
    borderRadius: 20,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(2,6,23,0.78)",
    color: "#bae6fd",
    overflow: "auto",
    fontSize: 13,
    lineHeight: 1.7,
    fontFamily: "'JetBrains Mono', monospace",
    margin: 0,
  },
};