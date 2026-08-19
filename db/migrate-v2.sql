-- v1 → v2 遷移：新欄位＋歷史表。對已上線的 Turso DB 執行一次。
ALTER TABLE books ADD COLUMN translator TEXT DEFAULT '';
ALTER TABLE books ADD COLUMN published_year INTEGER DEFAULT 0;
ALTER TABLE books ADD COLUMN series TEXT DEFAULT '';
ALTER TABLE books ADD COLUMN edition TEXT DEFAULT '';
ALTER TABLE books ADD COLUMN finish_date TEXT DEFAULT '';
ALTER TABLE books ADD COLUMN lend_to TEXT DEFAULT '';
ALTER TABLE books ADD COLUMN lend_date TEXT DEFAULT '';
ALTER TABLE books ADD COLUMN reading_reason TEXT DEFAULT '';
ALTER TABLE books ADD COLUMN key_question TEXT DEFAULT '';
ALTER TABLE books ADD COLUMN last_reviewed_at TEXT DEFAULT '';
ALTER TABLE books ADD COLUMN review_log TEXT DEFAULT '[]';
ALTER TABLE books ADD COLUMN actions TEXT DEFAULT '[]';

CREATE TABLE IF NOT EXISTS book_history (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_book ON book_history(book_id, created_at);
