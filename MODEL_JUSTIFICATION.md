# Model and Reranking Justification

The dense retrieval model is `BAAI/bge-base-en-v1.5` instead of `all-MiniLM-L6-v2` because the task is retrieval, not generic sentence similarity. BGE models are trained with contrastive learning for search-style matching, which fits product datasheet retrieval where a short user query must retrieve a longer technical section. BGE also supports asymmetric instruction prefixes, so queries are encoded as product search requests while datasheet chunks are encoded as technical sections. That distinction is useful for terms like `0-10V dimming`, `GPM`, `CFM`, `LPW`, `CCT`, and model-number-heavy text.

BGE-base is a better fit than BGE-large for this pilot. The corpus is only around 30 datasheets, so base gives a practical latency and memory tradeoff while still improving retrieval semantics. Large would add cost and CPU latency without enough data to justify it.

I avoided OpenAI/Cohere embeddings because this assignment is meant to demonstrate ML system design, not only API usage. A local model is inspectable, reproducible, cheaper at scale, and can later be fine-tuned with accepted/rejected retrieval labels. I also avoided a narrow domain-specific model because there is no standard off-the-shelf embedding model trained specifically for MEP datasheets. BGE-base with instruction prefixes plus domain-aware reranking bridges the gap better than hoping a generic model understands that `0-10V` implies dimmable.

## Reranker Weight Calibration

The rule-based reranker applies domain-specific boosts that the cross-encoder cannot reliably learn from general MS MARCO training data, such as exact model-number matches, finish synonym bridging, dimming vocabulary mapping, and numeric spec equality. These weights were refactored into `RERANKER_WEIGHTS` and can be calibrated using coordinate-wise grid search over the evaluation query set, optimizing MRR@5 and section accuracy.

Run:

```bash
python backend/scripts/calibrate_reranker.py
```

The script writes `eval/calibration_results.json`. At runtime, the reranker loads calibrated weights when that file exists and otherwise falls back to safe defaults. The intended validation flow is to calibrate on `eval/queries.json`, then evaluate on `eval/real_pdf_queries.json` as a held-out real-PDF set.
