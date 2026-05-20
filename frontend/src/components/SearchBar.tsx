import { useState } from "react";

type Props = {
  onSearch: (query: string, method: string) => Promise<void> | void;
  loading?: boolean;
};

const METHODS = [
  { value: "hybrid", label: "Hybrid (Dense+BM25+TF-IDF)" },
  { value: "dense", label: "Dense Only" },
  { value: "bm25", label: "BM25 Only" },
  { value: "tfidf", label: "TF-IDF Only" },
];

export default function SearchBar({ onSearch, loading }: Props) {
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("hybrid");

  function handleSubmit() {
    if (query.trim()) onSearch(query, method);
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder='Try: 6" recessed downlight, 3000K, black trim, dimmable'
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
            fontSize: 15,
            outline: "none",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !query.trim()}
          style={{
            padding: "12px 22px",
            borderRadius: 8,
            border: "none",
            background: loading ? "#475569" : "#3b82f6",
            color: "white",
            cursor: loading ? "wait" : "pointer",
            fontWeight: 600,
            fontSize: 14,
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {METHODS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMethod(m.value)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: method === m.value ? "1px solid #3b82f6" : "1px solid #334155",
              background: method === m.value ? "#1e3a5f" : "transparent",
              color: method === m.value ? "#93c5fd" : "#94a3b8",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}


