-- Embeddings are now computed locally with BGE small (384 dimensions) instead
-- of replicate/all-mpnet-base-v2 (768). Knowledge chunks are temporary, so
-- existing ones are dropped rather than re-embedded.
TRUNCATE knowledge_chunks;
ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(384);

-- Vectors we've already computed, keyed by a hash of the model and the text.
CREATE TABLE embedding_cache (
  hash          TEXT PRIMARY KEY,
  embedding     vector(384) NOT NULL,
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX embedding_cache_last_used_at_idx ON embedding_cache (last_used_at);
