import { IngestResponse } from "../api/client";

type Props = {
  stats: IngestResponse | null;
};

export default function IngestStats({ stats }: Props) {
  if (!stats) return null;

  return (
    <div
      style={{
        border: "1px solid #1e293b",
        borderRadius: 10,
        padding: 16,
        marginBottom: 20,
        background: "#0f172a",
      }}
    >
      <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 14, marginBottom: 12 }}>
        Pipeline Status
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <StatBox label="PDFs" value={stats.num_pdfs} />
        <StatBox label="Total Chunks" value={stats.num_chunks} />
        <StatBox label="Indexed" value={stats.num_indexed} color="#22c55e" />
        <StatBox label="Excluded (ToC)" value={stats.num_excluded} color="#ef4444" />
        <StatBox
          label="Dense Embeds"
          value={stats.dense_available ? "✓" : "✗"}
          color={stats.dense_available ? "#22c55e" : "#ef4444"}
        />
        <StatBox
          label="BM25 Index"
          value={stats.bm25_available ? "✓" : "✗"}
          color={stats.bm25_available ? "#22c55e" : "#ef4444"}
        />
      </div>

      {stats.pdf_types && Object.keys(stats.pdf_types).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "#64748b", fontSize: 11, marginBottom: 6 }}>PDF Classification</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(stats.pdf_types).map(([type, count]) => (
              <span
                key={type}
                style={{
                  background: "#1e293b",
                  color: "#94a3b8",
                  padding: "3px 10px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: "monospace",
                }}
              >
                {type}: {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div
      style={{
        background: "#020617",
        borderRadius: 6,
        padding: "10px 12px",
        textAlign: "center",
      }}
    >
      <div style={{ color: color || "#e2e8f0", fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>
        {value}
      </div>
      <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );
}


