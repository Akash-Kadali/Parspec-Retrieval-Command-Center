from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


class PageData(BaseModel):
    page_number: int
    text: str
    tables: List[List[List[str]]] = Field(default_factory=list)
    extraction_method: str = "unknown"
    token_count: int = 0


class DocumentData(BaseModel):
    document_id: str
    title: str
    source_file: str
    pages: List[PageData]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    pdf_type: str = "native"  # native, scanned, multi_col
    pdf_confidence: float = 0.0
    diagnostics: Dict[str, Any] = Field(default_factory=dict)
    summary: str = ""
    manufacturer: str = ""
    domain: str = ""
