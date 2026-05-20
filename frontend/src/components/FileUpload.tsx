import { useState } from "react";

type Props = {
  onUpload: (file: File) => Promise<void>;
  onIngest: () => Promise<void>;
};

export default function FileUpload({ onUpload, onIngest }: Props) {
  const [selected, setSelected] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("");

  async function handleUpload() {
    if (!selected) return;
    setBusy(true);
    setAction("Uploading…");
    try {
      await onUpload(selected);
    } finally {
      setBusy(false);
      setAction("");
    }
  }

  async function handleIngest() {
    setBusy(true);
    setAction("Classifying PDFs → Extracting → Chunking → Embedding → Indexing…");
    try {
      await onIngest();
    } finally {
      setBusy(false);
      setAction("");
    }
  }

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
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px dashed #334155",
            color: "#94a3b8",
            cursor: "pointer",
            fontSize: 13,
            background: "#020617",
          }}
        >
          {selected ? selected.name : "Choose PDF…"}
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setSelected(e.target.files?.[0] || null)}
            style={{ display: "none" }}
          />
        </label>

        <button
          onClick={handleUpload}
          disabled={!selected || busy}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: !selected || busy ? "#1e293b" : "#2563eb",
            color: !selected || busy ? "#475569" : "white",
            cursor: !selected || busy ? "default" : "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Upload PDF
        </button>

        <button
          onClick={handleIngest}
          disabled={busy}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "transparent",
            color: busy ? "#475569" : "#e2e8f0",
            cursor: busy ? "wait" : "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Build / Refresh Index
        </button>
      </div>

      {action && (
        <div style={{ marginTop: 10, color: "#f59e0b", fontSize: 12, fontStyle: "italic" }}>
          {action}
        </div>
      )}
    </div>
  );
}


