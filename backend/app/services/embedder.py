"""Embedding service — TF-IDF sparse, BM25, and optional dense sentence-transformer."""

import logging
import numpy as np
from typing import List, Optional, Any

from sklearn.feature_extraction.text import TfidfVectorizer

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

_st_available = False
try:
    from sentence_transformers import SentenceTransformer
    _st_available = True
except ImportError:
    logger.info("sentence-transformers not available; dense embeddings disabled")

_bm25_available = False
try:
    from rank_bm25 import BM25Okapi
    _bm25_available = True
except ImportError:
    logger.info("rank_bm25 not available; BM25 index disabled")


class DenseEmbedder:
    def __init__(self, model_name: str = None):
        self.model_name = model_name or settings.embedding_model
        self.model = None
        if _st_available:
            try:
                logger.info(f"Loading sentence-transformer model: {self.model_name}")
                self.model = SentenceTransformer(self.model_name)
                logger.info(f"Dense embedder ready: {self.model_name}")
            except Exception as e:
                logger.warning(f"Failed to load sentence-transformer model: {e}")

    def encode(self, texts: List[str], is_query: bool = False) -> Optional[np.ndarray]:
        if self.model is None:
            return None

        prepared_texts = [str(t or "") for t in texts]
        if settings.use_bge_instructions:
            prefix = settings.bge_query_prefix if is_query else settings.bge_doc_prefix
            prepared_texts = [prefix + t for t in prepared_texts]

        return self.model.encode(
            prepared_texts,
            show_progress_bar=False,
            normalize_embeddings=True,
        )

    @property
    def available(self) -> bool:
        return self.model is not None


class TfidfEmbedder:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(
            lowercase=True,
            stop_words="english",
            ngram_range=(1, 2),
            max_features=50000,
            sublinear_tf=True,
        )

    def fit_transform(self, texts: List[str]):
        return self.vectorizer.fit_transform(texts)

    def transform(self, texts: List[str]):
        return self.vectorizer.transform(texts)

    def get_state(self):
        return self.vectorizer

    def set_state(self, vectorizer: TfidfVectorizer):
        self.vectorizer = vectorizer


class BM25Index:
    def __init__(self):
        self.index = None
        self.corpus_tokens = None

    def build(self, texts: List[str]):
        if not _bm25_available:
            logger.warning("rank_bm25 not available, BM25 index disabled")
            return
        self.corpus_tokens = [text.lower().split() for text in texts]
        self.index = BM25Okapi(self.corpus_tokens)
        logger.info(f"BM25 index built with {len(self.corpus_tokens)} documents")

    def search(self, query: str, top_k: int = 20) -> List[tuple]:
        if self.index is None:
            return []
        query_tokens = query.lower().split()
        scores = self.index.get_scores(query_tokens)
        ranked = np.argsort(-scores)[:top_k]
        return [(int(idx), float(scores[idx])) for idx in ranked if scores[idx] > 0]

    @property
    def available(self) -> bool:
        return self.index is not None




