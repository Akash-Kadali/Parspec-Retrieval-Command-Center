import { SearchResult } from "../api/client";

type Props = {
  item: SearchResult;
  rank: number;
};

const SECTION_COLORS: Record<string, string> = {
  specs: "#3b82f6",
  photometrics: "#a78bfa",
  ordering: "#f59e0b",
  certifications: "#22c55e",
  dimensions: "#06b6d4",
  features: "#ec4899",
  materials: "#f97316",
  general: "#64748b",
  toc: "#475569",
};

const DOMAIN_ICONS: Record<string, string> = {
  lighting: "💡",
  plumbing: "🚿",
  hvac: "🌀",
  electrical: "⚡",
};

export default function ResultCard({ item, rank }: Props) {
  const sectionColor = SECTION_COLORS[item.section_type] || "#64748b";
  const domainIcon = DOMAIN_ICONS[item.domain] || "📄";
  const belowThreshold = !item.above_threshold;

  const S = {
    card: {
      background: "#111827",
      border: `1px solid ${belowThreshold ? "#7f1d1d" : "#1e293b"}`,
      borderRadius: 10,
      padding: 16,
      marginBottom: 12,
      opacity: belowThreshold ? 0.7 : 1,
      transition: "border-color 0.15s",
    } as React.CSSProperties,
    mono: { fontFamily: "'JetBrains Mono', monospace" },
  };

  return (
    <div style={S.card}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Rank badge */}
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: rank <= 3 ? "#172554" : "#0f172a",
                border: `1px solid ${rank <= 3 ? "#2563eb" : "#1e293b"}`,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: rank <= 3 ? "#60a5fa" : "#475569",
                flexShrink: 0,
                ...S.mono,
              }}
            >
              {rank}
            </span>

            {/* Title */}
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#f1f5f9",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.title || item.source_file}
            </span>

            {/* Domain icon */}
            {item.domain && <span style={{ fontSize: 14 }}>{domainIcon}</span>}
          </div>

          {/* Meta row */}
          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ ...S.mono, fontSize: 11, color: "#94a3b8" }}>
              {item.source_file}
            </span>
            <span style={{ color: "#334155" }}>·</span>
            <span style={{ fontSize: 11, color: "#64748b" }}>p.{item.page_number}</span>

            {/* Section badge */}
            <span
              style={{
                padding: "1px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                color: sectionColor,
                border: `1px solid ${sectionColor}33`,
                background: `${sectionColor}11`,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {item.section_type}
            </span>

            {item.confidence_label && (
              <span style={{ padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, color: item.confidence_label === "high" ? "#86efac" : item.confidence_label === "medium" ? "#fcd34d" : "#fca5a5", border: "1px solid #334155", textTransform: "uppercase" }}>{item.confidence_label}</span>
            )}
            {item.exact_match && <span style={{ padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, color: "#86efac", border: "1px solid #14532d" }}>Exact Match</span>}
            {item.comparable_search && <span style={{ padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, color: "#c4b5fd", border: "1px solid #4c1d95" }}>Comparable</span>}

            {/* Manufacturer */}
            {item.manufacturer && (
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {item.manufacturer}
              </span>
            )}
          </div>
        </div>

        {/* Score */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              ...S.mono,
              fontSize: 16,
              fontWeight: 700,
              color: item.score >= 0.5 ? "#22c55e" : item.score >= 0.2 ? "#f59e0b" : "#ef4444",
            }}
          >
            {item.score.toFixed(3)}
          </div>
          {item.boost_applied > 0 && (
            <div style={{ ...S.mono, fontSize: 10, color: "#22c55e" }}>
              +{item.boost_applied.toFixed(3)} boost
            </div>
          )}
          <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
            {item.retrieval_method}
          </div>
        </div>
      </div>

      {/* Confidence warning */}
      {item.confidence_note && (
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            background: belowThreshold ? "#1a0505" : "#172554",
            border: `1px solid ${belowThreshold ? "#7f1d1d" : "#1e3a5f"}`,
            color: belowThreshold ? "#fca5a5" : "#93c5fd",
            fontSize: 11,
            marginBottom: 8,
          }}
        >
          {belowThreshold ? "⚠ " : "ℹ "}
          {item.confidence_note}
        </div>
      )}

      {/* Matched fields */}
      {item.matched_fields.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#475569" }}>Matched:</span>
          {item.matched_fields.map((f) => (
            <span
              key={f}
              style={{
                padding: "1px 7px",
                borderRadius: 4,
                background: "#172554",
                color: "#60a5fa",
                fontSize: 10,
                fontWeight: 500,
              }}
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Model numbers */}
      {item.model_numbers.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#475569" }}>Models:</span>
          {item.model_numbers.map((m) => (
            <span
              key={m}
              style={{
                padding: "1px 7px",
                borderRadius: 4,
                background: "#14532d22",
                border: "1px solid #14532d",
                color: "#4ade80",
                fontSize: 10,
                fontWeight: 600,
                ...S.mono,
              }}
            >
              {m}
            </span>
          ))}
        </div>
      )}

      {/* Numeric specs */}
      {Object.keys(item.numeric_specs).length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {Object.entries(item.numeric_specs).map(([key, val]) => (
            <span
              key={key}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                background: "#0f172a",
                border: "1px solid #1e293b",
                fontSize: 10,
                color: "#94a3b8",
                ...S.mono,
              }}
            >
              {key}: {Array.isArray(val) ? val.join(", ") : val}
            </span>
          ))}
        </div>
      )}

      {/* Why matched */}
      {item.why_matched && item.why_matched.length > 0 && (
        <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 6, background: "#020617", border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Why this matched</div>
          {item.why_matched.slice(0, 5).map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>• {w}</div>
          ))}
          {item.comparable_reason && <div style={{ fontSize: 11, color: "#c4b5fd", marginTop: 4 }}>Comparable reason: {item.comparable_reason}</div>}
        </div>
      )}

      {/* Chunk text preview */}
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 6,
          background: "#0a0e1a",
          border: "1px solid #1e293b",
          fontSize: 12,
          color: "#94a3b8",
          lineHeight: 1.6,
          maxHeight: 160,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          ...S.mono,
        }}
      >
        {item.chunk_text.length > 600
          ? item.chunk_text.slice(0, 600) + "…"
          : item.chunk_text}
      </div>

      {/* Footer meta */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 8,
          color: "#334155",
          fontSize: 10,
          ...S.mono,
        }}
      >
        <span>strategy: {item.chunking_strategy || "—"}</span>
        <span>extraction: {item.extraction_method || "—"}</span>
        <span>tokens: {item.token_count || "—"}</span>
      </div>
    </div>
  );
}


