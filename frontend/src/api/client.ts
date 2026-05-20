import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";

export type NumericSpecs = Record<string, number | number[] | string | string[] | boolean>;

export type SearchResult = {
  score: number;
  document_id: string;
  title: string;
  source_file: string;
  page_number: number;
  section_type: string;
  chunk_text: string;
  chunking_strategy: string;
  extraction_method: string;
  retrieval_method: string;
  above_threshold: boolean;
  confidence_note: string;
  confidence_label: string;
  boost_applied: number;
  numeric_specs: NumericSpecs;
  model_numbers: string[];
  matched_fields: string[];
  matched_specs: Record<string, unknown>;
  missing_specs: Record<string, unknown>;
  why_matched: string[];
  manufacturer: string;
  domain: string;
  token_count: number;
  search_mode: string;
  exact_match: boolean;
  comparable_search: boolean;
  comparable_reason: string;
};

export type SearchResponse = {
  query: string;
  method: string;
  results: SearchResult[];
  total_indexed: number;
  query_type: string;
  search_mode: string;
  detected_specs: Record<string, unknown>;
};

export type IngestResponse = {
  message: string;
  num_pdfs: number;
  num_chunks: number;
  num_indexed: number;
  num_excluded: number;
  dense_available: boolean;
  bm25_available: boolean;
  pdf_types: Record<string, number>;
};

export type DocumentInfo = {
  filename: string;
  size_bytes: number;
  parsed: boolean;
  indexed: boolean;
  pdf_type: string;
  num_pages: number;
  num_chunks: number;
  extraction_method: string;
};

export type DocumentsResponse = { count: number; documents: DocumentInfo[] };
export type ResetResponse = { message: string; deleted: Record<string, number> };

export type SystemStatus = {
  backend_connected: boolean;
  pdfs_loaded: number;
  chunks_indexed: number;
  ocr_available: boolean;
  dense_embeddings_enabled: boolean;
  bm25_enabled: boolean;
  index_built: boolean;
  cross_encoder_available: boolean;
  data_paths: Record<string, string>;
  diagnostics: Record<string, unknown>;
};

export type EvidenceReport = {
  file: string;
  pdf_type: string;
  confidence: number;
  page_count?: number;
  diagnostics?: Record<string, any>;
  extraction_method?: string;
  tables_detected?: number;
  chunks_created?: number;
  indexed_chunks?: number;
  excluded_chunks?: number;
  sample_text?: string;
  warnings?: string[];
};

export async function checkHealth(): Promise<{ status: string; version: string }> {
  const res = await axios.get(`${API_BASE}/health`, { timeout: 3000 });
  return res.data;
}
export async function getStatus(): Promise<SystemStatus> {
  const res = await axios.get(`${API_BASE}/status`, { timeout: 3000 });
  return res.data;
}
export async function uploadPdf(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await axios.post(`${API_BASE}/upload`, formData, { headers: { "Content-Type": "multipart/form-data" } });
  return res.data;
}
export async function ingestAll(): Promise<IngestResponse> {
  const res = await axios.post(`${API_BASE}/ingest`, null, { timeout: 120000 });
  return res.data;
}
export async function searchQuery(query: string, topK = 5, method = "hybrid"): Promise<SearchResponse> {
  const res = await axios.post(`${API_BASE}/search`, { query, top_k: topK, method });
  return res.data;
}
export async function explainQuery(query: string) {
  const res = await axios.post(`${API_BASE}/search/explain`, { query });
  return res.data;
}
export async function listDocuments(): Promise<DocumentsResponse> {
  const res = await axios.get(`${API_BASE}/documents`);
  return res.data;
}
export async function resetAll(): Promise<ResetResponse> {
  const res = await axios.post(`${API_BASE}/reset`);
  return res.data;
}
export async function listEvidence() {
  const res = await axios.get(`${API_BASE}/evidence`);
  return res.data;
}
export async function getEvidence(filename: string) {
  const res = await axios.get(`${API_BASE}/evidence/${encodeURIComponent(filename)}`);
  return res.data;
}
export async function runEvaluation() {
  const res = await axios.post(`${API_BASE}/evaluation/run`, null, { timeout: 120000 });
  return res.data;
}
export async function getEvaluationResults() {
  const res = await axios.get(`${API_BASE}/evaluation/results`);
  return res.data;
}
export async function exportReport() {
  const res = await axios.post(`${API_BASE}/report/export`, null, { timeout: 120000 });
  return res.data;
}
