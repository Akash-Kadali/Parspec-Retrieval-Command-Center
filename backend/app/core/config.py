from pathlib import Path
from pydantic import BaseModel


class Settings(BaseModel):
    project_root: str = str(Path(__file__).resolve().parents[3])
    data_dir: str = str(Path(__file__).resolve().parents[3] / "data")
    raw_dir: str = str(Path(__file__).resolve().parents[3] / "data" / "raw")
    parsed_dir: str = str(Path(__file__).resolve().parents[3] / "data" / "parsed")
    chunks_dir: str = str(Path(__file__).resolve().parents[3] / "data" / "chunks")
    index_dir: str = str(Path(__file__).resolve().parents[3] / "data" / "index")
    evidence_dir: str = str(Path(__file__).resolve().parents[3] / "data" / "evidence")

    # Chunking
    max_chunk_tokens: int = 512
    max_chunk_chars: int = 1200
    ocr_chars_threshold: int = 50
    multi_col_tolerance: int = 30

    # Retrieval
    confidence_threshold: float = 0.20
    rrf_k: int = 60
    default_top_k: int = 5

    # Embedding — BGE-base for asymmetric retrieval (see MODEL_JUSTIFICATION.md)
    embedding_model: str = "BAAI/bge-base-en-v1.5"
    use_bge_instructions: bool = True
    bge_query_prefix: str = "Represent this product search query for retrieving technical datasheets: "
    bge_doc_prefix: str = "Represent this product datasheet section for retrieval: "

    # Cross-encoder reranking
    cross_encoder_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    cross_encoder_weight: float = 0.6
    use_cross_encoder: bool = True

    # Reset behavior
    keep_raw_on_reset: bool = True


settings = Settings()