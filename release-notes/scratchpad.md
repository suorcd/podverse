## Stored episode and track title search (API, web)

- Surfaces: api, web
- Change: new public `GET /item/search/title?q=&medium=all|music&page=`. It matches the term against the titles of stored active items, case-insensitive. Titles that start with the term come first, then titles that contain it, with the newest publish date first in each group. It only returns items on public feeds whose channel has an about row. `meta.count` is the total number of matches. It answers only while `CATALOG_PODCAST_INDEX_ID_ALLOWLIST` is set and `CATALOG_ITEM_TITLE_SEARCH_ENABLED` is `true`, and returns 404 otherwise. The web Search page calls it beside the stored channel search and shows the matching episodes or tracks. A new linear migration creates the `pg_trgm` extension and a trigram index on `item.title`.
- Who notices: anyone searching a stored episode or track title on an instance with a Podcast Index id allowlist
- Operator steps: run `ops-db-migrate-app` for the new linear migration before the new API pods start.
