from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional


class ChunkData(BaseModel):
    chunk_id: str
    document_id: str
    title: str
    source_file: str
    page_number: int
    section_type: str = "general"
    chunk_text: str
    token_count: int = 0
    chunking_strategy: str = "default"
    extraction_method: str = "unknown"
    metadata: Dict[str, Any] = Field(default_factory=dict)
    numeric_specs: Dict[str, Any] = Field(default_factory=dict)
    model_numbers: List[str] = Field(default_factory=list)
    manufacturer: str = ""
    domain: str = ""
    summary_preamble: str = ""
