-- Stored item title search matches ILIKE '%term%'. The channel title search is unindexed
-- because the stored channel set is small; items are the large table, so keep this lookup
-- on a trigram index. pg_trgm is a trusted extension in PostgreSQL 13+, and the migrator
-- has CREATE on the database. The runner wraps this file in a transaction, so the index
-- build is blocking rather than CONCURRENTLY.

SET LOCAL statement_timeout = 0;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_item_title_trgm
  ON public.item USING gin (title gin_trgm_ops);
