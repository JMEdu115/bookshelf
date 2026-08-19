-- 大乃書齋：單表藏書。owner = Google sub，單人系統但仍以 owner 隔離。
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  isbn TEXT DEFAULT '',
  title TEXT NOT NULL,
  authors TEXT DEFAULT '',
  translator TEXT DEFAULT '',            -- 譯者（引用格式需要）
  publisher TEXT DEFAULT '',
  published TEXT DEFAULT '',             -- 原始出版日期字串（各來源格式不一，照存）
  published_year INTEGER DEFAULT 0,      -- 正規化出版年，排序／篩選用；0 = 未知
  series TEXT DEFAULT '',                -- 叢書名
  edition TEXT DEFAULT '',               -- 版次
  cover_url TEXT DEFAULT '',
  description TEXT DEFAULT '',
  location_kind TEXT DEFAULT 'physical', -- 'physical' | 'ebook'
  location TEXT DEFAULT '',              -- 收納位置或電子書平台
  start_date TEXT DEFAULT '',            -- 開讀日期 YYYY-MM-DD
  finish_date TEXT DEFAULT '',           -- 完讀日期 YYYY-MM-DD
  status TEXT DEFAULT 'unread',          -- unread | reading | done | reference | lost | given
  lend_to TEXT DEFAULT '',               -- 借出對象（非空 = 外借中）
  lend_date TEXT DEFAULT '',             -- 借出日期
  reading_reason TEXT DEFAULT '',        -- 為什麼想讀／想解決什麼問題
  key_question TEXT DEFAULT '',          -- 這本書回答了什麼問題
  last_reviewed_at TEXT DEFAULT '',      -- 上次複習重點的日期
  topics TEXT DEFAULT '[]',              -- JSON array of strings
  audience TEXT DEFAULT '',              -- 推薦給誰
  review TEXT DEFAULT '',                -- 我的介紹與心得（總評）
  review_log TEXT DEFAULT '[]',          -- JSON [{date, text}] 可累加的心得紀錄（重讀）
  actions TEXT DEFAULT '[]',             -- JSON [{date, text}] 讀後行動／應用紀錄
  highlights TEXT DEFAULT '[]',          -- JSON [{text, page, my_take, tags, kind, edition_note, created_at}]
  related TEXT DEFAULT '[]',             -- JSON array of {id, how}
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_books_owner ON books(owner, deleted);

-- 變更歷史：PUT 覆寫前把整本舊資料存快照，誤改可回溯。
CREATE TABLE IF NOT EXISTS book_history (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  snapshot TEXT NOT NULL,   -- 舊版整本書的 JSON
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_book ON book_history(book_id, created_at);
