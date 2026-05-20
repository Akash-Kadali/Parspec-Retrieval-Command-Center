import { SearchResult } from "../api/client";
import ResultCard from "../components/ResultCard";

type Props = {
  results: SearchResult[];
  method: string;
  totalIndexed: number;
  showLowConfidence?: boolean;
};

function prettyMethod(method: string) {
  const value = method || "hybrid";
  return value.toUpperCase();
}

function getBestResult(results: SearchResult[]) {
  if (!results.length) return null;
  return results[0] as any;
}

function getConfidenceLabel(item: any) {
  if (item?.exact_match) return "Exact match";
  if (item?.confidence_label) return String(item.confidence_label).replace(/\b\w/g, (c) => c.toUpperCase());
  if (item?.score >= 0.75) return "High confidence";
  if (item?.score >= 0.45) return "Medium confidence";
  if (item?.score >= 0.25) return "Low confidence";
  return "No strong match";
}

function getConfidenceColor(item: any) {
  if (item?.exact_match) return "#38bdf8";
  if (item?.confidence_label === "high" || item?.score >= 0.75) return "#34d399";
  if (item?.confidence_label === "medium" || item?.score >= 0.45) return "#fbbf24";
  if (item?.confidence_label === "low" || item?.score >= 0.25) return "#fb923c";
  return "#fb7185";
}

export default function Results({
  results,
  method,
  totalIndexed,
  showLowConfidence = true,
}: Props) {
  if (!results.length) {
    return (
      <section style={S.emptyState}>
        <div style={S.emptyGlow} />
        <div style={S.emptyIcon}>⌘</div>
        <div style={S.emptyTitle}>No results yet</div>
        <div style={S.emptyText}>
          Upload PDFs, build the index, then run an assignment-style query.
        </div>

        <div style={S.emptyExamples}>
          <span>Try:</span>
          <code>6&quot; recessed downlight, 3000K, black trim, dimmable</code>
        </div>
      </section>
    );
  }

  const visibleResults = showLowConfidence
    ? results
    : results.filter((r: any) => r.above_threshold || r.exact_match || r.confidence_label === "high");

  const hiddenCount = results.length - visibleResults.length;
  const aboveThreshold = results.filter((r) => r.above_threshold).length;
  const exactMatches = results.filter((r: any) => r.exact_match).length;
  const best = getBestResult(results);

  const noHighConfidence = aboveThreshold === 0 && exactMatches === 0;

  return (
    <section style={S.wrap}>
      <div
        style={{
          ...S.decisionBanner,
          borderColor: best ? getConfidenceColor(best) : "rgba(148,163,184,0.16)",
        }}
      >
        <div>
          <div style={S.bannerEyebrow}>Retrieval Decision</div>

          <div style={S.bannerTitle}>
            {noHighConfidence
              ? "No high-confidence match found in the current corpus."
              : best
              ? `${getConfidenceLabel(best)} · ${best.source_file || best.title || "Top result"}`
              : "Search complete"}
          </div>

          <div style={S.bannerSub}>
            {results.length} result(s) via{" "}
            <strong style={S.strong}>{prettyMethod(method)}</strong>
            {" · "}
            {aboveThreshold} above threshold
            {" · "}
            {totalIndexed} chunks indexed
          </div>
        </div>

        {best && (
          <div style={S.scoreBlock}>
            <div style={{ ...S.score, color: getConfidenceColor(best) }}>
              {Number(best.score || 0).toFixed(3)}
            </div>
            <div style={S.scoreLabel}>top score</div>
          </div>
        )}
      </div>

      <div style={S.metricsGrid}>
        <MetricCard label="Results" value={results.length} />
        <MetricCard label="Shown" value={visibleResults.length} />
        <MetricCard label="Above Threshold" value={aboveThreshold} accent="#34d399" />
        <MetricCard label="Exact Matches" value={exactMatches} accent="#38bdf8" />
        <MetricCard label="Index Size" value={totalIndexed} accent="#a78bfa" />
        <MetricCard label="Method" value={prettyMethod(method)} accent="#fbbf24" />
      </div>

      {hiddenCount > 0 && (
        <div style={S.hiddenNotice}>
          Hidden {hiddenCount} low-confidence result(s). Enable “Show low-confidence results” to inspect them.
        </div>
      )}

      {noHighConfidence && (
        <div style={S.noMatchNotice}>
          The system returned candidates, but none crossed the confidence threshold. This is expected for
          out-of-corpus queries like boilers, rooftop units, or wire products if those PDFs are not indexed.
        </div>
      )}

      <div style={S.resultHeader}>
        <div>
          <div style={S.sectionTitle}>Ranked Results</div>
          <div style={S.sectionSub}>
            Sorted by retrieval score, exact-match boost, metadata matches, and confidence calibration.
          </div>
        </div>

        <div style={S.methodPill}>{prettyMethod(method)}</div>
      </div>

      {visibleResults.length === 0 ? (
        <section style={S.emptyStateSmall}>
          <div style={S.emptyTitle}>No visible high-confidence results</div>
          <div style={S.emptyText}>
            Low-confidence results are hidden. Turn on the toggle above to inspect them.
          </div>
        </section>
      ) : (
        <div style={S.cards}>
          {visibleResults.map((item, idx) => (
            <ResultCard
              key={`${item.document_id}-${item.page_number}-${item.source_file}-${idx}`}
              item={item}
              rank={idx + 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  accent = "#94a3b8",
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div style={S.metricCard}>
      <div style={{ ...S.metricValue, color: accent }}>{value}</div>
      <div style={S.metricLabel}>{label}</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    display: "grid",
    gap: 14,
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

  strong: {
    color: "#dbeafe",
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

  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
    gap: 10,
  },

  metricCard: {
    padding: 13,
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.14)",
    background: "rgba(15,23,42,0.66)",
    boxShadow: "0 12px 42px rgba(0,0,0,0.18)",
  },

  metricValue: {
    fontSize: 20,
    fontWeight: 950,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },

  metricLabel: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 11,
    fontWeight: 850,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  hiddenNotice: {
    padding: "11px 13px",
    borderRadius: 15,
    border: "1px solid rgba(251,191,36,0.28)",
    background: "rgba(120,53,15,0.18)",
    color: "#fde68a",
    fontSize: 13,
  },

  noMatchNotice: {
    padding: "12px 14px",
    borderRadius: 15,
    border: "1px solid rgba(248,113,113,0.28)",
    background: "rgba(127,29,29,0.16)",
    color: "#fecaca",
    fontSize: 13,
    lineHeight: 1.55,
  },

  resultHeader: {
    display: "flex",
    alignItems: "end",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 2,
  },

  sectionTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: 950,
    letterSpacing: "-0.025em",
  },

  sectionSub: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 4,
  },

  methodPill: {
    padding: "7px 10px",
    borderRadius: 999,
    border: "1px solid rgba(56,189,248,0.28)",
    background: "rgba(8,47,73,0.28)",
    color: "#bae6fd",
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: "0.08em",
  },

  cards: {
    display: "grid",
    gap: 12,
  },

  emptyState: {
    position: "relative",
    overflow: "hidden",
    textAlign: "center",
    padding: "46px 24px",
    borderRadius: 24,
    border: "1px dashed rgba(148,163,184,0.25)",
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.7), rgba(2,6,23,0.56))",
    boxShadow: "0 18px 60px rgba(0,0,0,0.22)",
  },

  emptyStateSmall: {
    textAlign: "center",
    padding: "30px 20px",
    borderRadius: 22,
    border: "1px dashed rgba(148,163,184,0.25)",
    background: "rgba(15,23,42,0.52)",
  },

  emptyGlow: {
    position: "absolute",
    inset: "auto auto -70px 50%",
    transform: "translateX(-50%)",
    width: 260,
    height: 140,
    background: "radial-gradient(circle, rgba(56,189,248,0.16), transparent 68%)",
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

  emptyExamples: {
    marginTop: 18,
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
    padding: "9px 12px",
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.16)",
    background: "rgba(2,6,23,0.48)",
    color: "#94a3b8",
    fontSize: 12,
  },
};