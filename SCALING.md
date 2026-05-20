# Scaling Plan

Local MVP can scale by separating ingestion, storage, indexing, and serving.

- Store raw PDFs in S3/GCS/Azure Blob with immutable object keys.
- Store document metadata, extraction evidence, chunk metadata, and evaluation labels in Postgres.
- Use Celery/RQ/Kafka workers for async ingestion, OCR, table extraction, embedding, and reindexing.
- Use OpenSearch/Elasticsearch for BM25 and filters.
- Use Pinecone/Weaviate/Milvus/pgvector for dense vectors.
- Version every extraction pipeline and embedding model so indexes are reproducible.
- Add monitoring for OCR failures, low-confidence searches, latency, index freshness, and empty-result rates.
- Add human feedback labels from accepted/rejected search results.
- Run evaluation on every ingestion/retrieval change and block deploys on metric regressions.
- Reindex by changed document IDs, not full corpus, with a background blue/green index swap.
