# Query plan review

Run these on a populated PostgreSQL 16 + pgvector database with representative
data before changing the indexes. `ANALYZE` results depend on corpus size and
statistics; do not force an index on a tiny table.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT c.id
FROM chunks AS c
JOIN sources AS s ON s.id = c.source_id
WHERE c.notebook_id = :notebook_id
  AND c.source_id = ANY(:selected_source_ids)
  AND s.notebook_id = :notebook_id
  AND s.selected IS TRUE AND s.status = 'ready'
ORDER BY c.embedding <=> :query_vector
LIMIT 30;

EXPLAIN (ANALYZE, BUFFERS)
SELECT c.id
FROM chunks AS c
JOIN sources AS s ON s.id = c.source_id
WHERE c.notebook_id = :notebook_id
  AND c.source_id = ANY(:selected_source_ids)
  AND s.notebook_id = :notebook_id
  AND s.selected IS TRUE AND s.status = 'ready'
  AND c.tsv @@ plainto_tsquery('english', :query)
ORDER BY ts_rank_cd(c.tsv, plainto_tsquery('english', :query)) DESC
LIMIT 30;
```

The model declares `ix_chunks_embedding_hnsw` with `vector_cosine_ops`,
`ix_chunks_tsv_gin` on `tsv`, `ix_chunks_notebook_id`, and
`ix_sources_notebook_id_status`. The ORM emits those cosine and full-text
predicates. The local environment had no running Docker/Postgres daemon during
Level 10, so these are reviewed query/index matches, not captured `ANALYZE`
plans. Run the statements from a SQL client after substituting representative
notebook IDs, source IDs, vectors, and questions.
