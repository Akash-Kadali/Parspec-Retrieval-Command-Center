from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    method: str = "hybrid"


class SearchResultItem(BaseModel):
    score: float
    document_id: str
    title: str
    source_file: str
    page_number: int
    section_type: str
    chunk_text: str
    chunking_strategy: str = ""
    extraction_method: str = ""
    retrieval_method: str = ""
    above_threshold: bool = True
    confidence_note: str = ""
    boost_applied: float = 0.0
    numeric_specs: Dict[str, Any] = Field(default_factory=dict)
    model_numbers: List[str] = Field(default_factory=list)
    matched_fields: List[str] = Field(default_factory=list)
    manufacturer: str = ""
    domain: str = ""
    token_count: int = 0


class SearchResponse(BaseModel):
    query: str
    method: str
    results: List[SearchResultItem]
    total_indexed: int = 0


class MessageResponse(BaseModel):
    message: str
    details: Dict[str, Any] = Field(default_factory=dict)


class UploadResponse(BaseModel):
    message: str
    filename: str
    size_bytes: int
    status: str = "uploaded"


class EvidenceResponse(BaseModel):
    file: str
    pdf_type: str
    confidence: float
    diagnostics: Dict[str, Any] = Field(default_factory=dict)
    page_tokens: List[Dict[str, Any]] = Field(default_factory=list)
    pymupdf_preview: str = ""
    pdfplumber_preview: str = ""


class IngestResponse(BaseModel):
    message: str
    num_pdfs: int
    num_chunks: int
    num_indexed: int
    num_excluded: int
    dense_available: bool
    bm25_available: bool
    pdf_types: Dict[str, int] = Field(default_factory=dict)


class DocumentInfo(BaseModel):
    filename: str
    size_bytes: int
    parsed: bool = False
    indexed: bool = False
    pdf_type: str = ""
    num_pages: int = 0
    num_chunks: int = 0


class DocumentsResponse(BaseModel):
    count: int
    documents: List[DocumentInfo]


class ResetResponse(BaseModel):
    message: str
    deleted: Dict[str, int] = Field(default_factory=dict)
