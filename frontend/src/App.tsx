import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  DocumentInfo,
  EvidenceReport,
  IngestResponse,
  SearchResult,
  SystemStatus,
  checkHealth,
  exportReport,
  getEvaluationResults,
  getEvidence,
  getStatus,
  ingestAll,
  listDocuments,
  listEvidence,
  resetAll,
  runEvaluation,
  searchQuery,
  uploadPdf,
} from "./api/client";
import ResultCard from "./components/ResultCard";

type Page = "Search" | "Documents" | "Evidence" | "Evaluation" | "Settings";
type SearchMethod = "hybrid" | "bm25" | "tfidf" | "dense";

type DemoPreset = {
  label: string;
  query: string;
  topK: number;
  method: SearchMethod;
  category: string;
  goal: string;
};

const DEMO_PRESETS: DemoPreset[] = [
  {
    label: "Spec-heavy downlight",
    query: '6" recessed downlight, 3000K, black trim, dimmable',
    topK: 2,
    method: "hybrid",
    category: "Assignment Core",
    goal: "Tests size, CCT, finish, product type, and dimmable ↔ 0-10V bridge.",
  },
  {
    label: "Rough sink description",
    query: "stainless kitchen sink single bowl undermount",
    topK: 5,
    method: "dense",
    category: "Assignment Core",
    goal: "Tests semantic retrieval when the user gives a rough description.",
  },
  {
    label: "Exact model number",
    query: "cRC-DI-6-30",
    topK: 2,
    method: "hybrid",
    category: "Assignment Core",
    goal: "Tests model-number mode, exact match, and model variant retrieval.",
  },
  {
    label: "Comparable products",
    query: "Karran KBF514 find comparable products",
    topK: 10,
    method: "hybrid",
    category: "Assignment Core",
    goal: "Tests exact match first, then comparable product discovery.",
  },
  {
    label: "Faucet specs",
    query: "wall mounted faucet chrome 1.2 GPM ADA compliant",
    topK: 5,
    method: "hybrid",
    category: "Plumbing",
    goal: "Tests GPM, finish variants, ADA/cUPC, and suffix-aware matching.",
  },
  {
    label: "Whole house fan",
    query: "whole house fan 1434 CFM energy star",
    topK: 5,
    method: "hybrid",
    category: "Mechanical",
    goal: "Tests mechanical specs, CFM, and certification matching.",
  },
  {
    label: "Table-heavy high bay",
    query: "FCY0815L8CST 8508 lumens 55.2 watts",
    topK: 5,
    method: "bm25",
    category: "Table Row",
    goal: "Tests table-atomic chunks and exact photometric row retrieval.",
  },
  {
    label: "Scanned/OCR document",
    query: "dust collection airflow controller VFD PLC",
    topK: 5,
    method: "hybrid",
    category: "OCR",
    goal: "Tests scanned PDF ingestion and OCR evidence.",
  },
  {
    label: "No-match query",
    query: "industrial boiler 500 PSI steam",
    topK: 5,
    method: "hybrid",
    category: "Reliability",
    goal: "Tests low-confidence and no strong match behavior.",
  },
  {
    label: "Out-of-corpus wire query",
    query: "#12 THHN copper wire 600V",
    topK: 5,
    method: "hybrid",
    category: "Reliability",
    goal: "Tests honest no-match behavior for missing product domains.",
  },
];

const METHODS: SearchMethod[] = ["hybrid", "bm25", "tfidf", "dense"];

function labelize(value: string) {
  return String(value || "")
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function boolText(value: unknown) {
  if (typeof value === "boolean") return value ? "enabled" : "disabled";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function statusTone(value: unknown) {
  if (typeof value === "boolean") return value ? "#34d399" : "#fb7185";
  if (typeof value === "number") return value > 0 ? "#38bdf8" : "#fb7185";
  if (value) return "#34d399";
  return "#64748b";
}

function confidenceLabel(item: any) {
  if (!item) return "No Result";
  if (item.exact_match) return "Exact Match";
  if (item.confidence_label) return labelize(item.confidence_label);
  if ((item.score || 0) >= 0.75) return "High Confidence";
  if ((item.score || 0) >= 0.45) return "Medium Confidence";
  if ((item.score || 0) >= 0.25) return "Low Confidence";
  return "No Strong Match";
}

function confidenceColor(item: any) {
  if (!item) return "#64748b";
  if (item.exact_match) return "#38bdf8";
  if (item.confidence_label === "high" || (item.score || 0) >= 0.75) return "#34d399";
  if (item.confidence_label === "medium" || (item.score || 0) >= 0.45) return "#fbbf24";
  if (item.confidence_label === "low" || (item.score || 0) >= 0.25) return "#fb923c";
  return "#fb7185";
}

function getDocTypeCounts(documents: DocumentInfo[]) {
  return {
    total: documents.length,
    parsed: documents.filter((d) => d.parsed).length,
    indexed: documents.filter((d) => d.indexed).length,
    native: documents.filter((d) => d.pdf_type === "native").length,
    scanned: documents.filter((d) => d.pdf_type === "scanned").length,
    multiCol: documents.filter((d) => d.pdf_type === "multi_col").length,
    chunks: documents.reduce((sum, d) => sum + (d.num_chunks || 0), 0),
  };
}

export default function App() {
  const [page, setPage] = useState<Page>("Search");

  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [version, setVersion] = useState("");
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [evidence, setEvidence] = useState<EvidenceReport[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<any>(null);
  const [evalData, setEvalData] = useState<any>(null);
  const [ingestStats, setIngestStats] = useState<IngestResponse | null>(null);

  const [query, setQuery] = useState(DEMO_PRESETS[0].query);
  const [topK, setTopK] = useState(DEMO_PRESETS[0].topK);
  const [method, setMethod] = useState<SearchMethod>(DEMO_PRESETS[0].method);
  const [searchMeta, setSearchMeta] = useState<any>(null);
  const [results, setResults] = useState<SearchResult[]>([]);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "success" | "error">("info");
  const [file, setFile] = useState<File | null>(null);

  const [demoMode, setDemoMode] = useState(true);
  const [showLowConfidence, setShowLowConfidence] = useState(false);

  async function refresh() {
    try {
      const [h, st, docs, ev, er] = await Promise.allSettled([
        checkHealth(),
        getStatus(),
        listDocuments(),
        listEvidence(),
        getEvaluationResults(),
      ]);

      if (h.status === "fulfilled") setVersion(h.value.version || "");
      if (st.status === "fulfilled") setStatus(st.value);
      if (docs.status === "fulfilled") setDocuments(docs.value.documents || []);
      if (ev.status === "fulfilled") setEvidence(ev.value.reports || []);
      if (er.status === "fulfilled") setEvalData(er.value);
    } catch {
      // Keep stale UI if refresh fails.
    }
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 10000);
    return () => window.clearInterval(id);
  }, []);

  function setNotice(text: string, kind: "info" | "success" | "error" = "info") {
    setMessage(text);
    setMessageKind(kind);
  }

  async function doUpload() {
    if (!file) return;

    setBusy(true);
    setNotice("Uploading PDF...", "info");

    try {
      const res = await uploadPdf(file);
      setNotice(res.message || "Uploaded PDF.", "success");
      setFile(null);
      await refresh();
    } catch (e: any) {
      setNotice(e?.response?.data?.detail || "Upload failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doIngest() {
    setBusy(true);
    setNotice("Building extraction evidence, chunks, sparse index, and dense vectors...", "info");

    try {
      const res = await ingestAll();
      setIngestStats(res);
      setNotice(res.message || "Index built.", "success");
      await refresh();
    } catch (e: any) {
      setNotice(e?.response?.data?.detail || "Ingest failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    const ok = window.confirm(
      "Clear parsed docs, chunks, index, evidence, and evaluation outputs? Raw PDFs stay."
    );
    if (!ok) return;

    setBusy(true);
    setNotice("Resetting derived data...", "info");

    try {
      const res = await resetAll();
      setNotice(res.message || "Reset complete.", "success");
      setResults([]);
      setSearchMeta(null);
      setIngestStats(null);
      setSelectedEvidence(null);
      await refresh();
    } catch {
      setNotice("Reset failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doSearch(
    nextQuery = query,
    nextTopK = topK,
    nextMethod: SearchMethod = method
  ) {
    if (!nextQuery.trim()) return;

    setBusy(true);
    setQuery(nextQuery);
    setTopK(nextTopK);
    setMethod(nextMethod);
    setPage("Search");
    setNotice(`Searching with ${nextMethod.toUpperCase()} · Top ${nextTopK}...`, "info");

    try {
      const res = await searchQuery(nextQuery, nextTopK, nextMethod);
      const nextResults = res.results || [];

      setResults(nextResults);
      setSearchMeta({
        query_type: res.query_type,
        search_mode: res.search_mode,
        detected_specs: res.detected_specs,
        total_indexed: res.total_indexed,
        method: nextMethod,
        top_k: nextTopK,
      });

      const above = nextResults.filter((r) => r.above_threshold).length;
      setNotice(`${nextResults.length} result(s). ${above} above threshold.`, "success");
    } catch (e: any) {
      setResults([]);
      setSearchMeta(null);
      setNotice(e?.response?.data?.detail || "Search failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doEvidence(name: string) {
    try {
      const item = await getEvidence(name);
      setSelectedEvidence(item);
    } catch {
      setSelectedEvidence({ error: "Unable to load evidence." });
    }
  }

  async function doEval() {
    setBusy(true);
    setNotice("Running evaluation...", "info");

    try {
      const data = await runEvaluation();
      setEvalData(data);
      setNotice("Evaluation complete.", "success");
    } catch (e: any) {
      setNotice(e?.response?.data?.detail || "Evaluation failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doExportReport() {
    setBusy(true);
    setNotice("Exporting report...", "info");

    try {
      const res = await exportReport();
      setNotice(res?.message || "Report exported.", "success");
    } catch {
      setNotice("Report export failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  const visibleResults = useMemo(() => {
    if (!demoMode || showLowConfidence) return results;

    return results.filter((r: any) => {
      return r.above_threshold || r.confidence_label === "high" || r.exact_match;
    });
  }, [results, demoMode, showLowConfidence]);

  const hiddenCount = results.length - visibleResults.length;
  const topResult: any = visibleResults[0];
  const docStats = getDocTypeCounts(documents);

  const noHighConfidence =
    results.length > 0 &&
    results.filter((r: any) => r.above_threshold || r.confidence_label === "high" || r.exact_match)
      .length === 0;

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brandBlock}>
          <div style={styles.logoOrb}>P</div>
          <div>
            <h2 style={styles.brandTitle}>Parspec</h2>
            <div style={styles.brandSub}>Retrieval Command Center</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {(["Search", "Documents", "Evidence", "Evaluation", "Settings"] as Page[]).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                ...styles.navButton,
                ...(page === p ? styles.navButtonActive : {}),
              }}
            >
              <span>{navIcon(p)}</span>
              <span>{p}</span>
            </button>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div
            style={{
              ...styles.connectionPill,
              borderColor: status?.backend_connected ? "#14532d" : "#7f1d1d",
              color: status?.backend_connected ? "#86efac" : "#fecaca",
            }}
          >
            ● Backend {status?.backend_connected ? "connected" : "disconnected"}
          </div>
          <div style={styles.version}>{version || "waiting..."}</div>
        </div>
      </aside>

      <main style={styles.main}>
        <Hero status={status} docStats={docStats} />

        {message && (
          <div
            style={{
              ...styles.notice,
              borderColor:
                messageKind === "error"
                  ? "rgba(248,113,113,0.45)"
                  : messageKind === "success"
                  ? "rgba(52,211,153,0.35)"
                  : "rgba(56,189,248,0.35)",
              color:
                messageKind === "error"
                  ? "#fecaca"
                  : messageKind === "success"
                  ? "#bbf7d0"
                  : "#bae6fd",
            }}
          >
            {message}
          </div>
        )}

        {page === "Search" && (
          <>
            <SearchPanel
              query={query}
              setQuery={setQuery}
              topK={topK}
              setTopK={setTopK}
              method={method}
              setMethod={setMethod}
              busy={busy}
              doSearch={doSearch}
              demoMode={demoMode}
              setDemoMode={setDemoMode}
              showLowConfidence={showLowConfidence}
              setShowLowConfidence={setShowLowConfidence}
            />

            <AssignmentCoverage />

            <DemoPresets onRun={doSearch} />

            {searchMeta && <QueryUnderstanding meta={searchMeta} />}

            {topResult && (
              <section
                style={{
                  ...styles.decisionBanner,
                  borderColor: noHighConfidence
                    ? "rgba(248,113,113,0.45)"
                    : confidenceColor(topResult),
                }}
              >
                <div>
                  <div style={styles.bannerEyebrow}>Top Retrieval Decision</div>
                  <div style={styles.bannerTitle}>
                    {noHighConfidence
                      ? "No high-confidence match found in the current corpus."
                      : `${confidenceLabel(topResult)} · ${topResult.source_file || topResult.title}`}
                  </div>
                  <div style={styles.bannerSub}>
                    {results.length} result(s) ·{" "}
                    {results.filter((r) => r.above_threshold).length} above threshold ·{" "}
                    {searchMeta?.total_indexed || 0} chunks indexed
                  </div>
                </div>

                <div style={styles.scoreBlock}>
                  <div style={{ ...styles.score, color: confidenceColor(topResult) }}>
                    {Number(topResult.score || 0).toFixed(3)}
                  </div>
                  <div style={styles.scoreLabel}>top score</div>
                </div>
              </section>
            )}

            {hiddenCount > 0 && (
              <div style={styles.lowConfidenceHint}>
                Hidden {hiddenCount} low-confidence result(s). Turn on “Show low confidence” to inspect them.
              </div>
            )}

            {visibleResults.length === 0 ? (
              <EmptyState
                title={results.length ? "No visible high-confidence results" : "No results yet"}
                text={
                  results.length
                    ? "Low-confidence results are hidden. Enable the toggle above to inspect them."
                    : "Use an assignment preset or enter a product description to test retrieval."
                }
              />
            ) : (
              <section style={styles.resultsStack}>
                {visibleResults.map((r, i) => (
                  <ResultCard
                    key={`${r.document_id}-${r.page_number}-${r.source_file}-${i}`}
                    item={r}
                    rank={i + 1}
                  />
                ))}
              </section>
            )}
          </>
        )}

        {page === "Documents" && (
          <>
            <ActionBar
              file={file}
              setFile={setFile}
              upload={doUpload}
              ingest={doIngest}
              reset={doReset}
              busy={busy}
            />

            <DocumentStats documents={documents} />

            {ingestStats && <IngestSummary stats={ingestStats} />}

            <SectionHeader
              title="Documents"
              subtitle="All uploaded PDFs with parsing, indexing, and extraction metadata."
            />

            <DataTable
              headers={["File", "Parsed", "Indexed", "PDF Type", "Pages", "Chunks", "Extraction"]}
              rows={documents.map((d) => [
                d.filename,
                d.parsed ? "✅" : "—",
                d.indexed ? "✅" : "—",
                d.pdf_type || "—",
                d.num_pages,
                d.num_chunks,
                (d as any).extraction_method || "—",
              ])}
            />
          </>
        )}

        {page === "Evidence" && (
          <>
            <SectionHeader
              title="Extraction Evidence"
              subtitle="OCR status, PDF type classification, table diagnostics, and extraction warnings."
            />

            <EvidenceStats evidence={evidence} />

            <DataTable
              headers={["File", "PDF Type", "Confidence", "Pages", "Open"]}
              rows={evidence.map((e) => [
                e.file,
                e.pdf_type,
                typeof e.confidence === "number" ? e.confidence.toFixed(2) : e.confidence,
                (e as any).page_count ?? "—",
                <button style={styles.tinyButton} onClick={() => doEvidence(e.file)}>
                  View Evidence
                </button>,
              ])}
            />

            {selectedEvidence && (
              <>
                <EvidenceSummary evidence={selectedEvidence} />
                <pre style={styles.jsonPanel}>{JSON.stringify(selectedEvidence, null, 2)}</pre>
              </>
            )}
          </>
        )}

        {page === "Evaluation" && (
          <section style={styles.evaluationPage}>
            <div style={styles.actionRow}>
              <button disabled={busy} onClick={doEval} style={styles.primaryButton}>
                {busy ? "Running..." : "Run Evaluation"}
              </button>
              <button disabled={busy} onClick={doExportReport} style={styles.secondaryButton}>
                Export Report
              </button>
            </div>

            <SectionHeader
              title="Evaluation Dashboard"
              subtitle="Proof-driven metrics for Top-1, Top-3, section accuracy, MRR, latency, and no-match behavior."
            />

            {evalData?.metrics ? (
              <MetricGrid metrics={evalData.metrics} />
            ) : (
              <EmptyState
                title="No evaluation result yet"
                text="Run evaluation to generate metrics from eval/queries.json."
              />
            )}

            <EvaluationTable rows={evalData?.results || []} />
          </section>
        )}

        {page === "Settings" && (
          <>
            <SectionHeader
              title="System Settings"
              subtitle="Runtime capabilities, installed retrieval backends, validation commands, and index state."
            />

            <StatusGrid status={status} />

            <section style={styles.panel}>
              <div style={styles.panelTitle}>Submission Commands</div>
              <pre style={styles.codeBlock}>{`cd /Users/srikadali/Desktop/parspec_app
source .venv/bin/activate
python -m pytest tests -q
./clear_data.sh
python backend/scripts/build_index.py
python backend/scripts/evaluate.py
./run_app.sh`}</pre>
            </section>

            <pre style={styles.jsonPanel}>{JSON.stringify(status, null, 2)}</pre>
          </>
        )}
      </main>
    </div>
  );
}

function navIcon(page: Page) {
  const map: Record<Page, string> = {
    Search: "⌘",
    Documents: "▤",
    Evidence: "◈",
    Evaluation: "◎",
    Settings: "⚙",
  };
  return map[page];
}

function Hero({
  status,
  docStats,
}: {
  status: SystemStatus | null;
  docStats: ReturnType<typeof getDocTypeCounts>;
}) {
  return (
    <header style={styles.hero}>
      <div>
        <div style={styles.eyebrow}>AI-Powered Product Datasheet Retrieval</div>
        <h1 style={styles.h1}>Submission-grade retrieval for real manufacturer PDFs.</h1>
        <p style={styles.heroText}>
          OCR-aware ingestion · column-aware extraction · table-atomic chunking · hybrid retrieval · explainable confidence.
        </p>
      </div>

      <div>
        <StatusGrid status={status} compact />
        <div style={styles.heroMiniStats}>
          <span>{docStats.total} PDFs</span>
          <span>{docStats.scanned} scanned</span>
          <span>{docStats.multiCol} multi-column</span>
          <span>{docStats.chunks} chunks</span>
        </div>
      </div>
    </header>
  );
}

function SearchPanel(props: {
  query: string;
  setQuery: (v: string) => void;
  topK: number;
  setTopK: (v: number) => void;
  method: SearchMethod;
  setMethod: (v: SearchMethod) => void;
  busy: boolean;
  doSearch: (q?: string, topK?: number, method?: SearchMethod) => void;
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
  showLowConfidence: boolean;
  setShowLowConfidence: (v: boolean) => void;
}) {
  return (
    <section style={styles.searchPanel}>
      <div style={styles.searchTopRow}>
        <input
          value={props.query}
          onChange={(e) => props.setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && props.doSearch()}
          placeholder='Try: 6" recessed downlight, 3000K, black trim, dimmable'
          style={styles.searchInput}
        />

        <select
          value={props.topK}
          onChange={(e) => props.setTopK(Number(e.target.value))}
          style={styles.select}
        >
          <option value={1}>Top 1</option>
          <option value={2}>Top 2</option>
          <option value={3}>Top 3</option>
          <option value={5}>Top 5</option>
          <option value={10}>Top 10</option>
        </select>

        <select
          value={props.method}
          onChange={(e) => props.setMethod(e.target.value as SearchMethod)}
          style={styles.select}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m.toUpperCase()}
            </option>
          ))}
        </select>

        <button disabled={props.busy} onClick={() => props.doSearch()} style={styles.primaryButton}>
          {props.busy ? "Running..." : "Search"}
        </button>
      </div>

      <div style={styles.searchMetaRow}>
        <label style={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={props.demoMode}
            onChange={(e) => props.setDemoMode(e.target.checked)}
          />
          Demo Mode
        </label>

        <label style={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={props.showLowConfidence}
            onChange={(e) => props.setShowLowConfidence(e.target.checked)}
          />
          Show low-confidence results
        </label>

        <div style={styles.methodHint}>
          Exact models → BM25/Hybrid · Rough descriptions → Dense/Hybrid · Final demo → Hybrid
        </div>
      </div>
    </section>
  );
}

function AssignmentCoverage() {
  const items = [
    "Spec-heavy query",
    "Rough description query",
    "Model-number query",
    "Comparable product mode",
    "OCR/scanned PDFs",
    "Multi-column PDFs",
    "Table-heavy datasheets",
    "No-match confidence",
  ];

  return (
    <section style={styles.coveragePanel}>
      <div>
        <div style={styles.panelTitle}>Assignment Coverage</div>
        <div style={styles.coverageSub}>Directly mapped to the take-home requirements.</div>
      </div>

      <div style={styles.coverageItems}>
        {items.map((item) => (
          <span key={item} style={styles.coverageItem}>
            ✓ {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function DemoPresets({ onRun }: { onRun: (q: string, topK: number, method: SearchMethod) => void }) {
  return (
    <section style={styles.presetGrid}>
      {DEMO_PRESETS.map((preset) => (
        <button
          key={preset.label}
          onClick={() => onRun(preset.query, preset.topK, preset.method)}
          style={styles.presetCard}
        >
          <div style={styles.presetCategory}>{preset.category}</div>
          <div style={styles.presetLabel}>{preset.label}</div>
          <div style={styles.presetQuery}>{preset.query}</div>
          <div style={styles.presetFooter}>
            <span>Recommended: Top {preset.topK}</span>
            <span>{preset.method.toUpperCase()}</span>
          </div>
          <div style={styles.presetGoal}>{preset.goal}</div>
        </button>
      ))}
    </section>
  );
}

function QueryUnderstanding({ meta }: { meta: any }) {
  return (
    <section style={styles.panel}>
      <div style={styles.panelTitle}>Query Understanding</div>

      <div style={styles.badgeRow}>
        <Badge label="type" value={meta.query_type || "unknown"} />
        <Badge label="mode" value={meta.search_mode || "standard"} />
        <Badge label="method" value={meta.method || "hybrid"} />
        <Badge label="top k" value={meta.top_k || "—"} />
        <Badge label="indexed" value={meta.total_indexed || 0} />
      </div>

      <pre style={styles.compactJson}>{JSON.stringify(meta.detected_specs || {}, null, 2)}</pre>
    </section>
  );
}

function Badge({ label, value }: { label: string; value: any }) {
  return (
    <span style={styles.badge}>
      {labelize(label)}: <b>{String(value)}</b>
    </span>
  );
}

function StatusGrid({ status, compact = false }: { status: SystemStatus | null; compact?: boolean }) {
  const items: Array<[string, unknown]> = [
    ["Backend", status?.backend_connected],
    ["PDFs", status?.pdfs_loaded ?? 0],
    ["Chunks", status?.chunks_indexed ?? 0],
    ["OCR", status?.ocr_available],
    ["Dense", status?.dense_embeddings_enabled],
    ["BM25", status?.bm25_enabled],
    ["Index", status?.index_built],
    ["Cross-Encoder", status?.cross_encoder_available],
  ];

  return (
    <div style={compact ? styles.statusGridCompact : styles.statusGrid}>
      {items.map(([k, v]) => (
        <div key={k} style={compact ? styles.statusCardCompact : styles.statusCard}>
          <div style={styles.statusLabel}>{k}</div>
          <div style={{ ...styles.statusValue, color: statusTone(v) }}>{boolText(v)}</div>
        </div>
      ))}
    </div>
  );
}

function ActionBar({
  file,
  setFile,
  upload,
  ingest,
  reset,
  busy,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  upload: () => void;
  ingest: () => void;
  reset: () => void;
  busy: boolean;
}) {
  return (
    <div style={styles.actionBar}>
      <label style={styles.filePicker}>
        {file?.name || "Choose PDF"}
        <input
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>

      <button disabled={!file || busy} onClick={upload} style={styles.secondaryButton}>
        Upload PDF
      </button>

      <button disabled={busy} onClick={ingest} style={styles.primaryButton}>
        Build / Refresh Index
      </button>

      <button disabled={busy} onClick={reset} style={styles.dangerButton}>
        Reset
      </button>
    </div>
  );
}

function DocumentStats({ documents }: { documents: DocumentInfo[] }) {
  const stats = getDocTypeCounts(documents);

  return (
    <div style={styles.metricGrid}>
      <MetricCard label="Total PDFs" value={stats.total} />
      <MetricCard label="Parsed" value={stats.parsed} />
      <MetricCard label="Indexed" value={stats.indexed} />
      <MetricCard label="Native" value={stats.native} />
      <MetricCard label="Scanned" value={stats.scanned} />
      <MetricCard label="Multi-column" value={stats.multiCol} />
      <MetricCard label="Chunks" value={stats.chunks} />
    </div>
  );
}

function EvidenceStats({ evidence }: { evidence: EvidenceReport[] }) {
  const native = evidence.filter((e) => e.pdf_type === "native").length;
  const scanned = evidence.filter((e) => e.pdf_type === "scanned").length;
  const multi = evidence.filter((e) => e.pdf_type === "multi_col").length;

  return (
    <div style={styles.metricGrid}>
      <MetricCard label="Evidence Reports" value={evidence.length} />
      <MetricCard label="Native" value={native} />
      <MetricCard label="Scanned" value={scanned} />
      <MetricCard label="Multi-column" value={multi} />
    </div>
  );
}

function EvidenceSummary({ evidence }: { evidence: any }) {
  if (!evidence || evidence.error) return null;

  const diagnostics = evidence.diagnostics || {};

  return (
    <section style={styles.panel}>
      <div style={styles.panelTitle}>Evidence Summary</div>
      <div style={styles.badgeRow}>
        <Badge label="file" value={evidence.file || evidence.filename || "—"} />
        <Badge label="pdf type" value={evidence.pdf_type || "—"} />
        <Badge label="confidence" value={evidence.confidence ?? "—"} />
        <Badge label="ocr available" value={diagnostics.ocr_available ?? "—"} />
        <Badge label="tables" value={diagnostics.detected_tables ?? diagnostics.tables_detected ?? "—"} />
        <Badge label="method" value={diagnostics.extraction_method || evidence.extraction_method || "—"} />
      </div>
    </section>
  );
}

function IngestSummary({ stats }: { stats: IngestResponse }) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelTitle}>Last Ingest Summary</div>
      <div style={styles.badgeRow}>
        <Badge label="PDFs" value={stats.num_pdfs} />
        <Badge label="Chunks" value={stats.num_chunks} />
        <Badge label="Indexed" value={stats.num_indexed} />
        <Badge label="Excluded" value={stats.num_excluded} />
        <Badge label="Dense" value={stats.dense_available ? "available" : "unavailable"} />
        <Badge label="BM25" value={stats.bm25_available ? "available" : "unavailable"} />
      </div>
    </div>
  );
}

function MetricGrid({ metrics }: { metrics: Record<string, any> }) {
  return (
    <div style={styles.metricGrid}>
      {Object.entries(metrics).map(([k, v]) => (
        <MetricCard key={k} label={labelize(k)} value={typeof v === "number" ? v.toFixed(3) : String(v)} />
      ))}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={styles.sectionHeader}>
      <h2 style={styles.h2}>{title}</h2>
      <p style={styles.sectionText}>{subtitle}</p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>⌘</div>
      <div style={styles.emptyTitle}>{title}</div>
      <div style={styles.emptyText}>{text}</div>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} style={styles.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={styles.td} colSpan={headers.length}>
                No records yet.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} style={j === 0 ? styles.tdStrong : styles.td}>
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
function EvaluationTable({ rows }: { rows: any[] }) {
  if (!rows.length) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>◎</div>
        <div style={styles.emptyTitle}>No evaluation rows yet</div>
        <div style={styles.emptyText}>Run evaluation to populate query-level results.</div>
      </div>
    );
  }

  return (
    <section style={styles.evalTablePanel}>
      <div style={styles.evalTableHeader}>
        <div>
          <div style={styles.panelTitle}>Query-Level Results</div>
          <div style={styles.mutedText}>
            Expected file, actual top result, rank, pass/fail, confidence, and latency.
          </div>
        </div>
        <div style={styles.evalCount}>{rows.length} queries</div>
      </div>

      <div style={styles.evalTableScroll}>
        <table style={styles.evalTable}>
          <thead>
            <tr>
              <th style={{ ...styles.evalTh, ...styles.evalQueryCol }}>Query</th>
              <th style={{ ...styles.evalTh, ...styles.evalFileCol }}>Expected</th>
              <th style={{ ...styles.evalTh, ...styles.evalFileCol }}>Actual</th>
              <th style={{ ...styles.evalTh, ...styles.evalSmallCol }}>Rank</th>
              <th style={{ ...styles.evalTh, ...styles.evalSmallCol }}>Pass</th>
              <th style={{ ...styles.evalTh, ...styles.evalSmallCol }}>Confidence</th>
              <th style={{ ...styles.evalTh, ...styles.evalLatencyCol }}>Latency</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r: any, idx: number) => {
              const passed = Boolean(r.pass);
              const latency =
                typeof r.latency_ms === "number"
                  ? `${r.latency_ms.toFixed(1)} ms`
                  : r.latency_ms
                    ? `${r.latency_ms} ms`
                    : "—";

              return (
                <tr key={`${r.query || "query"}-${idx}`} style={styles.evalTr}>
                  <td style={{ ...styles.evalTd, ...styles.evalQueryCell }}>
                    {r.query || "—"}
                  </td>

                  <td style={{ ...styles.evalTd, ...styles.evalFileCell }}>
                    {r.expected_file || "no-match"}
                  </td>

                  <td style={{ ...styles.evalTd, ...styles.evalFileCell }}>
                    {r.actual_top_file || "—"}
                  </td>

                  <td style={{ ...styles.evalTd, ...styles.evalCenterCell }}>
                    {r.rank ?? "—"}
                  </td>

                  <td style={{ ...styles.evalTd, ...styles.evalCenterCell }}>
                    <span
                      style={{
                        ...styles.evalPassBadge,
                        ...(passed ? styles.evalPassOk : styles.evalPassBad),
                      }}
                    >
                      {passed ? "PASS" : "FAIL"}
                    </span>
                  </td>

                  <td style={{ ...styles.evalTd, ...styles.evalCenterCell }}>
                    <span style={styles.evalConfidenceBadge}>
                      {r.confidence_label || "—"}
                    </span>
                  </td>

                  <td style={{ ...styles.evalTd, ...styles.evalLatencyCell }}>
                    {latency}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}


const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    background:
      "radial-gradient(circle at 15% 10%, rgba(37,99,235,0.22), transparent 28%), radial-gradient(circle at 90% 0%, rgba(14,165,233,0.16), transparent 26%), #050816",
    color: "#dbeafe",
    fontFamily:
      "'DM Sans', Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  sidebar: {
    width: 270,
    padding: 22,
    position: "sticky",
    top: 0,
    height: "100vh",
    background: "rgba(3, 7, 18, 0.78)",
    backdropFilter: "blur(22px)",
    borderRight: "1px solid rgba(148,163,184,0.16)",
    boxShadow: "18px 0 60px rgba(0,0,0,0.35)",
  },

  brandBlock: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 28,
  },

  logoOrb: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    color: "#eff6ff",
    fontWeight: 900,
    background: "linear-gradient(135deg, #2563eb, #06b6d4)",
    boxShadow: "0 0 40px rgba(37,99,235,0.45)",
  },

  brandTitle: {
    margin: 0,
    color: "#f8fafc",
    fontSize: 20,
    letterSpacing: "-0.03em",
  },

  brandSub: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2,
  },

  nav: {
    display: "grid",
    gap: 9,
  },

  navButton: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.12)",
    background: "rgba(15,23,42,0.28)",
    color: "#94a3b8",
    cursor: "pointer",
    fontWeight: 700,
    textAlign: "left",
  },

  navButtonActive: {
    border: "1px solid rgba(56,189,248,0.55)",
    background: "linear-gradient(135deg, rgba(37,99,235,0.32), rgba(8,145,178,0.14))",
    color: "#e0f2fe",
    boxShadow: "0 0 32px rgba(14,165,233,0.14)",
  },

  sidebarFooter: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 22,
  },

  connectionPill: {
    border: "1px solid",
    borderRadius: 999,
    padding: "8px 10px",
    fontSize: 12,
    background: "rgba(15,23,42,0.45)",
  },

  version: {
    marginTop: 8,
    fontSize: 10,
    color: "#475569",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },

  main: {
    flex: 1,
    minWidth: 0,
    width: "calc(100vw - 270px)",
    padding: "30px 34px 60px",
    maxWidth: 1480,
    margin: "0 auto",
    overflowX: "hidden",
  },

  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 1fr) minmax(380px, 540px)",
    gap: 24,
    alignItems: "start",
    padding: 24,
    marginBottom: 18,
    border: "1px solid rgba(148,163,184,0.16)",
    borderRadius: 26,
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.72), rgba(2,6,23,0.55)), radial-gradient(circle at 85% 15%, rgba(56,189,248,0.16), transparent 35%)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.32)",
    backdropFilter: "blur(18px)",
  },

  eyebrow: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    marginBottom: 8,
  },

  h1: {
    margin: 0,
    fontSize: 38,
    lineHeight: 1.05,
    letterSpacing: "-0.055em",
    color: "#f8fafc",
    maxWidth: 780,
  },

  heroText: {
    color: "#94a3b8",
    fontSize: 15,
    lineHeight: 1.6,
    maxWidth: 760,
    marginBottom: 0,
  },

  heroMiniStats: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: 800,
  },

  h2: {
    margin: 0,
    color: "#f8fafc",
    fontSize: 22,
    letterSpacing: "-0.03em",
  },

  sectionHeader: {
    margin: "18px 0 12px",
  },

  sectionText: {
    color: "#64748b",
    marginTop: 6,
    fontSize: 14,
  },

  notice: {
    marginBottom: 16,
    border: "1px solid",
    background: "rgba(15,23,42,0.72)",
    padding: "12px 14px",
    borderRadius: 14,
  },

  searchPanel: {
    padding: 16,
    borderRadius: 22,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.66)",
    backdropFilter: "blur(18px)",
    boxShadow: "0 20px 70px rgba(0,0,0,0.22)",
    marginBottom: 14,
  },

  searchTopRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },

  searchInput: {
    flex: 1,
    minWidth: 330,
    padding: "14px 15px",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(2,6,23,0.78)",
    color: "#e2e8f0",
    outline: "none",
    fontSize: 14,
  },

  select: {
    padding: "13px 12px",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.22)",
    background: "#020617",
    color: "#dbeafe",
    fontWeight: 800,
  },

  searchMetaRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
    flexWrap: "wrap",
    color: "#64748b",
    fontSize: 12,
  },

  toggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "#cbd5e1",
  },

  methodHint: {
    color: "#64748b",
  },

  primaryButton: {
    border: 0,
    borderRadius: 14,
    padding: "12px 16px",
    background: "linear-gradient(135deg, #2563eb, #06b6d4)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 14px 34px rgba(37,99,235,0.28)",
  },

  secondaryButton: {
    border: "1px solid rgba(148,163,184,0.22)",
    borderRadius: 14,
    padding: "12px 16px",
    background: "rgba(15,23,42,0.6)",
    color: "#dbeafe",
    fontWeight: 900,
    cursor: "pointer",
  },

  dangerButton: {
    border: "1px solid rgba(248,113,113,0.35)",
    borderRadius: 14,
    padding: "12px 16px",
    background: "rgba(127,29,29,0.22)",
    color: "#fecaca",
    fontWeight: 900,
    cursor: "pointer",
  },

  tinyButton: {
    border: "1px solid rgba(56,189,248,0.35)",
    borderRadius: 10,
    padding: "7px 9px",
    background: "rgba(8,47,73,0.44)",
    color: "#bae6fd",
    cursor: "pointer",
    fontWeight: 800,
  },

  coveragePanel: {
    display: "grid",
    gridTemplateColumns: "240px 1fr",
    gap: 14,
    padding: 16,
    borderRadius: 20,
    border: "1px solid rgba(52,211,153,0.18)",
    background: "linear-gradient(135deg, rgba(6,78,59,0.2), rgba(15,23,42,0.68))",
    marginBottom: 14,
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
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },

  presetCard: {
    textAlign: "left",
    border: "1px solid rgba(148,163,184,0.15)",
    borderRadius: 20,
    padding: 15,
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.72), rgba(30,41,59,0.32))",
    color: "#dbeafe",
    cursor: "pointer",
    boxShadow: "0 16px 55px rgba(0,0,0,0.2)",
  },

  presetCategory: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: 7,
  },

  presetLabel: {
    color: "#f8fafc",
    fontWeight: 900,
    fontSize: 15,
    marginBottom: 6,
  },

  presetQuery: {
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 1.45,
    minHeight: 34,
  },

  presetFooter: {
    display: "flex",
    gap: 8,
    marginTop: 12,
    color: "#bae6fd",
    fontSize: 11,
    fontWeight: 900,
  },

  presetGoal: {
    marginTop: 10,
    color: "#64748b",
    fontSize: 11,
    lineHeight: 1.45,
  },

  decisionBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    padding: 18,
    borderRadius: 22,
    border: "1px solid",
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.76), rgba(2,6,23,0.58)), radial-gradient(circle at 85% 10%, rgba(56,189,248,0.12), transparent 34%)",
    boxShadow: "0 20px 70px rgba(0,0,0,0.26)",
    backdropFilter: "blur(18px)",
    marginBottom: 14,
  },

  bannerEyebrow: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: "0.13em",
    textTransform: "uppercase",
    marginBottom: 5,
  },

  bannerTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: 950,
    letterSpacing: "-0.025em",
  },

  bannerSub: {
    marginTop: 6,
    color: "#94a3b8",
    fontSize: 13,
  },

  scoreBlock: {
    minWidth: 110,
    padding: "10px 12px",
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.14)",
    background: "rgba(2,6,23,0.55)",
    textAlign: "right",
  },

  score: {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 24,
    fontWeight: 950,
  },

  scoreLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: 850,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginTop: 2,
  },

  panel: {
    padding: 16,
    borderRadius: 20,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.67)",
    marginBottom: 16,
  },

  panelTitle: {
    color: "#f8fafc",
    fontWeight: 900,
    marginBottom: 10,
  },

  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },

  badge: {
    padding: "5px 9px",
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 999,
    background: "rgba(2,6,23,0.55)",
    color: "#94a3b8",
    fontSize: 12,
  },

  compactJson: {
    marginTop: 12,
    marginBottom: 0,
    padding: 12,
    borderRadius: 14,
    background: "rgba(2,6,23,0.65)",
    border: "1px solid rgba(148,163,184,0.10)",
    color: "#bae6fd",
    overflow: "auto",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },

  jsonPanel: {
    padding: 16,
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(2,6,23,0.76)",
    color: "#bfdbfe",
    overflow: "auto",
    maxHeight: 560,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    whiteSpace: "pre-wrap",
  },

  codeBlock: {
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(2,6,23,0.76)",
    color: "#bae6fd",
    overflow: "auto",
    fontSize: 12,
    lineHeight: 1.7,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },

  resultsStack: {
    display: "grid",
    gap: 12,
  },

  lowConfidenceHint: {
    marginBottom: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(251,191,36,0.25)",
    background: "rgba(120,53,15,0.18)",
    color: "#fde68a",
    fontSize: 13,
  },

  emptyState: {
    borderRadius: 22,
    border: "1px dashed rgba(148,163,184,0.24)",
    background: "rgba(15,23,42,0.5)",
    padding: 34,
    textAlign: "center",
  },

  emptyIcon: {
    width: 44,
    height: 44,
    margin: "0 auto 12px",
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, rgba(37,99,235,0.32), rgba(6,182,212,0.16))",
    border: "1px solid rgba(56,189,248,0.26)",
    color: "#bae6fd",
    fontSize: 20,
    fontWeight: 950,
  },

  emptyTitle: {
    color: "#e2e8f0",
    fontWeight: 900,
    fontSize: 18,
  },

  emptyText: {
    color: "#64748b",
    marginTop: 8,
  },

  statusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
    gap: 10,
    marginBottom: 18,
  },

  statusGridCompact: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(105px, 1fr))",
    gap: 8,
  },

  statusCard: {
    padding: 14,
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.58)",
  },

  statusCardCompact: {
    padding: 10,
    borderRadius: 15,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(2,6,23,0.42)",
  },

  statusLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  statusValue: {
    marginTop: 5,
    fontWeight: 900,
    fontSize: 16,
  },

  actionBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    padding: 16,
    borderRadius: 20,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.68)",
    marginBottom: 16,
  },

  actionRow: {
    display: "flex",
    gap: 10,
    marginBottom: 16,
  },

  filePicker: {
    border: "1px dashed rgba(148,163,184,0.35)",
    borderRadius: 14,
    padding: "12px 14px",
    color: "#cbd5e1",
    cursor: "pointer",
    background: "rgba(2,6,23,0.55)",
    maxWidth: 280,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },

  metricCard: {
    padding: 16,
    borderRadius: 20,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.67)",
  },

  metricLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
  },

  metricValue: {
    marginTop: 6,
    color: "#f8fafc",
    fontSize: 26,
    fontWeight: 950,
  },

  evaluationPage: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    overflow: "hidden",
  },

  evalTablePanel: {
    width: "100%",
    maxWidth: "100%",
    marginTop: 20,
    marginBottom: 18,
    border: "1px solid rgba(148,163,184,0.16)",
    borderRadius: 20,
    background: "rgba(15,23,42,0.58)",
    overflow: "hidden",
    boxShadow: "0 18px 48px rgba(0,0,0,0.22)",
  },

  evalTableHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "18px 20px",
    borderBottom: "1px solid rgba(148,163,184,0.14)",
    background: "rgba(2,6,23,0.34)",
  },

  evalCount: {
    flexShrink: 0,
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(56,189,248,0.22)",
    color: "#7dd3fc",
    background: "rgba(14,165,233,0.08)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },

  evalTableScroll: {
    width: "100%",
    maxWidth: "100%",
    overflowX: "auto",
    overflowY: "hidden",
  },

  evalTable: {
    width: "100%",
    minWidth: 980,
    borderCollapse: "collapse",
    tableLayout: "fixed",
  },

  evalTh: {
    padding: "14px 16px",
    textAlign: "left",
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(148,163,184,0.16)",
    background: "rgba(2,6,23,0.5)",
    whiteSpace: "nowrap",
  },

  evalTd: {
    padding: "14px 16px",
    color: "#dbeafe",
    fontSize: 13,
    lineHeight: 1.45,
    borderBottom: "1px solid rgba(148,163,184,0.10)",
    verticalAlign: "top",
  },

  evalTr: {
    background: "rgba(15,23,42,0.18)",
  },

  evalQueryCol: {
    width: "26%",
  },

  evalFileCol: {
    width: "22%",
  },

  evalSmallCol: {
    width: "9%",
  },

  evalLatencyCol: {
    width: "12%",
  },

  evalQueryCell: {
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    fontWeight: 850,
    color: "#f8fafc",
  },

  evalFileCell: {
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 12,
    color: "#cbd5e1",
  },

  evalCenterCell: {
    textAlign: "center",
    whiteSpace: "nowrap",
  },

  evalLatencyCell: {
    textAlign: "right",
    whiteSpace: "nowrap",
    color: "#bae6fd",
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 12,
  },

  evalPassBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 58,
    padding: "5px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.06em",
  },

  evalPassOk: {
    color: "#86efac",
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.26)",
  },

  evalPassBad: {
    color: "#fda4af",
    background: "rgba(244,63,94,0.12)",
    border: "1px solid rgba(244,63,94,0.26)",
  },

  evalConfidenceBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 9px",
    borderRadius: 999,
    color: "#e0f2fe",
    background: "rgba(56,189,248,0.10)",
    border: "1px solid rgba(56,189,248,0.20)",
    fontSize: 11,
    fontWeight: 800,
  },

  mutedText: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.5,
  },

  tableWrap: {
    overflow: "auto",
    borderRadius: 20,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.67)",
    marginBottom: 16,
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
};