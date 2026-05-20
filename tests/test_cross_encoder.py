"""Tests for optional cross-encoder reranking."""

from backend.app.core.config import settings
from backend.app.services.cross_encoder import CrossEncoderReranker


class DummyModel:
    def predict(self, pairs):
        return [-4.0 if "wrong" in text else 4.0 for _, text in pairs]


def _disabled_reranker():
    old = settings.use_cross_encoder
    settings.use_cross_encoder = False
    try:
        return CrossEncoderReranker(model_name="not-loaded-in-unit-test")
    finally:
        settings.use_cross_encoder = old


def test_cross_encoder_reports_availability_without_crashing():
    reranker = _disabled_reranker()
    assert isinstance(reranker.available, bool)


def test_cross_encoder_reranks_when_model_is_available():
    reranker = _disabled_reranker()
    reranker.model = DummyModel()
    results = [
        {"chunk_id": "bad", "score": 0.9, "chunk_text": "wrong unrelated section", "retrieval_method": "hybrid"},
        {"chunk_id": "good", "score": 0.1, "chunk_text": "recessed downlight 3000K black trim", "retrieval_method": "hybrid"},
    ]
    ranked = reranker.rerank("3000K black downlight", results, top_k=2)
    assert ranked[0]["chunk_id"] == "good"
    assert "ce_score" in ranked[0]


def test_cross_encoder_fallback_returns_original_results():
    reranker = _disabled_reranker()
    reranker.model = None
    results = [{"chunk_id": "same", "score": 0.5, "chunk_text": "text"}]
    assert reranker.rerank("query", results) == results
