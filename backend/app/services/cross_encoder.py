"""Cross-encoder reranker using a lightweight retrieval model."""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

_cross_encoder = None
_ce_available = False

try:
    from sentence_transformers import CrossEncoder
    _ce_available = True
except ImportError:
    logger.info("sentence-transformers not available; cross-encoder disabled")


class CrossEncoderReranker:
    def __init__(self, model_name: str | None = None):
        self.model = None
        self.model_name = model_name or settings.cross_encoder_model
        if not settings.use_cross_encoder:
            logger.info("Cross-encoder disabled by settings")
            return
        if _ce_available:
            try:
                self.model = CrossEncoder(self.model_name, max_length=512)
                logger.info("Cross-encoder loaded: %s", self.model_name)
            except Exception as e:
                logger.warning("Failed to load cross-encoder: %s", e)

    @property
    def available(self) -> bool:
        return self.model is not None

    def rerank(
        self,
        query: str,
        results: List[Dict[str, Any]],
        top_k: int = 10,
        score_key: str = "chunk_text",
    ) -> List[Dict[str, Any]]:
        if not self.available or not results:
            return results

        pairs = [(query, r.get(score_key, "")) for r in results]
        try:
            scores = self.model.predict(pairs)
        except Exception as e:
            logger.warning("Cross-encoder scoring failed: %s", e)
            return results

        ce_weight = min(max(float(settings.cross_encoder_weight), 0.0), 1.0)
        orig_weight = 1.0 - ce_weight

        reranked: List[Dict[str, Any]] = []
        for i, result in enumerate(results):
            item = result.copy()
            ce = float(scores[i])
            ce_norm = 1.0 / (1.0 + math.exp(-ce))
            orig = float(item.get("score", 0) or 0)
            item["ce_score"] = ce
            item["score"] = orig_weight * orig + ce_weight * ce_norm
            method = item.get("retrieval_method", "")
            item["retrieval_method"] = f"{method}+ce" if method else "ce"
            reranked.append(item)

        reranked.sort(key=lambda x: x["score"], reverse=True)
        return reranked[:top_k]


def get_cross_encoder() -> CrossEncoderReranker:
    global _cross_encoder
    if _cross_encoder is None:
        _cross_encoder = CrossEncoderReranker()
    return _cross_encoder
