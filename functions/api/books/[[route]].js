/*
 * /api/books —— 藏書 CRUD。全部路由都先過 requireOwner。
 *
 *   GET    /api/books              → { books: [...] }（未刪除、依 updated_at 新到舊）
 *   POST   /api/books              → 新增，回 { book }；同 ISBN 已存在回 409 { error:'duplicate_isbn', id }
 *   PUT    /api/books/:id          → 更新（樂觀鎖：body.updated_at 不符回 409 conflict），舊版寫入 book_history
 *   DELETE /api/books/:id          → 軟刪除＋清掉其他書 related 裡對它的引用；沒刪到回 404
 *   GET    /api/books/export       → 全量備份 JSON（含垃圾桶）
 *   GET    /api/books/trash        → 垃圾桶清單
 *   POST   /api/books/:id/restore  → 從垃圾桶還原
 *   GET    /api/books/:id/history  → 該書變更快照（新到舊，最多 30 筆）
 *
 * owner 只由 session 決定，不接受前端指定。
 * JSON 欄位進 DB 前 sanitize、出 DB 後 parse；解析失敗記 log 並以空值頂替，不弄垮列表。
 * 長文超過上限回 400（不靜默截斷）。
 */

import { requireOwner, Unauthorized, Forbidden } from '../../_lib/session.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// ---- Turso（libSQL）HTTP 客戶端（沿用 class-points 驗證過的實作） ----

/** libSQL 的參數要標型別；整數必須以字串傳，否則大整數會在 JSON 裡失真。 */
function toArg(value) {
  if (value === null || value === undefined) return { type: 'null', value: null };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  if (typeof value === 'boolean') return { type: 'integer', value: value ? '1' : '0' };
  return { type: 'text', value: String(value) };
}

function fromCell(cell) {
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'integer') return Number(cell.value);
  if (cell.type === 'float') return Number(cell.value);
  return cell.value;
}

export function tursoClient(env) {
  const url = env && env.TURSO_DATABASE_URL;
  const token = env && env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    throw new Error('雲端儲存尚未完成設定。');
  }
  let endpoint;
  try {
    const raw = String(url);
    if (!/^(?:libsql|https):\/\//i.test(raw)) throw new Error('bad scheme');
    const parsed = new URL(raw.replace(/^libsql:\/\//i, 'https://'));
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('bad url');
    }
    parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/v2/pipeline`;
    parsed.search = '';
    parsed.hash = '';
    endpoint = parsed.toString();
  } catch {
    throw new Error('Turso 資料庫網址格式不正確。');
  }

  async function executeBatch(statements = []) {
    if (!statements.length) return [];
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        requests: [
          ...statements.map(({ sql, args = [] }) => ({ type: 'execute', stmt: { sql, args: args.map(toArg) } })),
          { type: 'close' },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Turso HTTP ${res.status}`);
    const body = await res.json();
    return statements.map((_, index) => {
      const item = (body.results || [])[index];
      if (!item || item.type === 'error') {
        throw new Error(`Turso 執行失敗：${(item && item.error && item.error.message) || '未知錯誤'}`);
      }
      const result = item.response.result;
      const cols = (result.cols || []).map((c) => c.name);
      const rows = (result.rows || []).map((row) => {
        const obj = {};
        row.forEach((cell, i) => {
          obj[cols[i]] = fromCell(cell);
        });
        return obj;
      });
      rows.affectedRowCount = result.affected_row_count ?? null;
      return rows;
    });
  }

  return {
    async execute(sql, args = []) {
      return (await executeBatch([{ sql, args }]))[0];
    },
    executeBatch,
  };
}

// ---- 欄位清洗 ----

const TEXT_LIMIT = 20000; // 心得、簡介這類長文的上限
const SHORT_LIMIT = 500;

/** 超限錯誤：帶欄位名回 400，不靜默截斷。 */
export class TooLong extends Error {
  constructor(field, limit) {
    super(`${field} 超過 ${limit} 字上限`);
    this.field = field;
    this.limit = limit;
  }
}

function s(value, limit = SHORT_LIMIT, field = '') {
  const str = String(value ?? '');
  if (field && str.length > limit) throw new TooLong(field, limit);
  return str.slice(0, limit);
}

/** 主題標籤正規化：NFKC＋全半形空白收斂，避免「班級經營」「班級␣經營」分裂。 */
export function normalizeTopic(t) {
  return String(t ?? '').normalize('NFKC').replace(/[\s　]+/g, '').slice(0, 60);
}

function sanitizeTopics(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const t of value.slice(0, 30)) {
    const norm = normalizeTopic(t);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

const HL_KINDS = new Set(['exact', 'gist']); // 逐字精確引用 vs 大意摘要

function sanitizeHighlights(value, now) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((h) => h && typeof h === 'object')
    .map((h) => ({
      text: s(h.text, 2000, '重點內容').trim(),
      page: s(h.page, 40).trim(),
      my_take: s(h.my_take, 2000, '我的話').trim(),
      tags: sanitizeTopics(h.tags),
      kind: HL_KINDS.has(h.kind) ? h.kind : 'exact',
      edition_note: s(h.edition_note, 60).trim(),
      created_at: s(h.created_at, 30).trim() || now, // 舊資料沒有就補現在
    }))
    .filter((h) => h.text)
    .slice(0, 200);
}

function sanitizeRelated(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id)
    .map((r) => ({ id: s(r.id, 64), how: s(r.how, 500).trim() }))
    .slice(0, 30);
}

/** 心得紀錄／行動紀錄共用：JSON [{date, text}]。 */
function sanitizeLog(value, field) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e) => e && typeof e === 'object')
    .map((e) => ({ date: s(e.date, 20).trim(), text: s(e.text, 5000, field).trim() }))
    .filter((e) => e.text)
    .slice(0, 100);
}

const LOCATION_KINDS = new Set(['physical', 'ebook']);
const STATUSES = new Set(['unread', 'reading', 'done', 'reference', 'lost', 'given']);

/** 從各種出版日期字串（2020 / 2020-05 / May 2020）撈出西元年。 */
export function parseYear(published) {
  const m = String(published ?? '').match(/(1[5-9]\d{2}|20\d{2})/);
  return m ? Number(m[1]) : 0;
}

/**
 * 把前端送來的 body 洗成可入庫的欄位。title 必填。
 * 超過字數上限丟 TooLong（外層轉 400），不靜默截斷。
 */
export function sanitizeBook(body, now = new Date().toISOString()) {
  if (!body || typeof body !== 'object') return null;
  const title = s(body.title, 300, '書名').trim();
  if (!title) return null;
  const published = s(body.published, 40).trim();
  const year = Number(body.published_year) || parseYear(published);
  return {
    isbn: s(body.isbn, 20).trim(),
    title,
    authors: s(body.authors, 300, '作者').trim(),
    translator: s(body.translator, 200, '譯者').trim(),
    publisher: s(body.publisher, 200, '出版社').trim(),
    published,
    published_year: Number.isInteger(year) && year > 0 ? year : 0,
    series: s(body.series, 200, '叢書').trim(),
    edition: s(body.edition, 100, '版次').trim(),
    cover_url: sanitizeCoverUrl(body.cover_url),
    description: s(body.description, TEXT_LIMIT, '書籍簡介'),
    location_kind: LOCATION_KINDS.has(body.location_kind) ? body.location_kind : 'physical',
    location: s(body.location, 300, '收納位置').trim(),
    start_date: s(body.start_date, 20).trim(),
    finish_date: s(body.finish_date, 20).trim(),
    status: STATUSES.has(body.status) ? body.status : 'unread',
    lend_to: s(body.lend_to, 100, '借出對象').trim(),
    lend_date: s(body.lend_date, 20).trim(),
    reading_reason: s(body.reading_reason, 1000, '想讀的原因').trim(),
    key_question: s(body.key_question, 1000, '核心問題').trim(),
    last_reviewed_at: s(body.last_reviewed_at, 20).trim(),
    topics: sanitizeTopics(body.topics),
    audience: s(body.audience, 500, '推薦對象').trim(),
    review: s(body.review, TEXT_LIMIT, '心得'),
    review_log: sanitizeLog(body.review_log, '心得紀錄'),
    actions: sanitizeLog(body.actions, '行動紀錄'),
    highlights: sanitizeHighlights(body.highlights, now),
    related: sanitizeRelated(body.related),
  };
}

/** 封面只收 https 絕對網址，其他一律清空（CSP 也只放行 https 圖）。 */
function sanitizeCoverUrl(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  try {
    const url = new URL(v);
    if (url.protocol !== 'https:') return '';
    return v.slice(0, 1000);
  } catch {
    return '';
  }
}

export function rowToBook(row) {
  const parse = (text, field) => {
    if (text == null || text === '') return [];
    try {
      const v = JSON.parse(text);
      return Array.isArray(v) ? v : [];
    } catch {
      // 資料損壞要留下線索，不能無聲吞掉（工單：壞 JSON 靜默清空難排查）
      console.error(`books: 壞掉的 JSON 欄位 book=${row.id} field=${field}`);
      return [];
    }
  };
  return {
    id: row.id,
    isbn: row.isbn || '',
    title: row.title || '',
    authors: row.authors || '',
    translator: row.translator || '',
    publisher: row.publisher || '',
    published: row.published || '',
    published_year: row.published_year || 0,
    series: row.series || '',
    edition: row.edition || '',
    cover_url: row.cover_url || '',
    description: row.description || '',
    location_kind: row.location_kind || 'physical',
    location: row.location || '',
    start_date: row.start_date || '',
    finish_date: row.finish_date || '',
    status: row.status || 'unread',
    lend_to: row.lend_to || '',
    lend_date: row.lend_date || '',
    reading_reason: row.reading_reason || '',
    key_question: row.key_question || '',
    last_reviewed_at: row.last_reviewed_at || '',
    topics: parse(row.topics, 'topics'),
    audience: row.audience || '',
    review: row.review || '',
    review_log: parse(row.review_log, 'review_log'),
    actions: parse(row.actions, 'actions'),
    highlights: parse(row.highlights, 'highlights'),
    related: parse(row.related, 'related'),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const FIELDS = [
  'isbn', 'title', 'authors', 'translator', 'publisher', 'published', 'published_year',
  'series', 'edition', 'cover_url', 'description', 'location_kind', 'location',
  'start_date', 'finish_date', 'status', 'lend_to', 'lend_date',
  'reading_reason', 'key_question', 'last_reviewed_at',
  'topics', 'audience', 'review', 'review_log', 'actions', 'highlights', 'related',
];
const JSON_FIELDS = new Set(['topics', 'review_log', 'actions', 'highlights', 'related']);

const BOOK_COLUMNS = `id, ${FIELDS.join(', ')}, created_at, updated_at`;

function bookArgs(book) {
  return FIELDS.map((f) => (JSON_FIELDS.has(f) ? JSON.stringify(book[f]) : book[f]));
}

/**
 * 核心處理函式。db 由外面注入：正式環境是 tursoClient(env)，測試是記憶體假資料庫。
 */
export async function handleBooks(request, env, db) {
  const owner = (await requireOwner(request, env)).userId;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  // /api/books/<id>/<action>
  const segments = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean); // ['api','books',id?,action?]
  const id = segments.length >= 3 ? decodeURIComponent(segments[2]) : '';
  const action = segments.length >= 4 ? segments[3] : '';

  if (method === 'GET' && id === 'export') {
    // 全量備份：現役＋垃圾桶都帶，供異地保存
    const rows = await db.execute(
      `SELECT ${BOOK_COLUMNS}, deleted FROM books WHERE owner = ? ORDER BY updated_at DESC`,
      [owner],
    );
    return json({
      exported_at: new Date().toISOString(),
      books: rows.map((r) => ({ ...rowToBook(r), deleted: r.deleted ? 1 : 0 })),
    });
  }

  if (method === 'GET' && id === 'trash') {
    const rows = await db.execute(
      `SELECT ${BOOK_COLUMNS} FROM books WHERE owner = ? AND deleted = 1 ORDER BY updated_at DESC`,
      [owner],
    );
    return json({ books: rows.map(rowToBook) });
  }

  if (method === 'GET' && !id) {
    const rows = await db.execute(
      `SELECT ${BOOK_COLUMNS} FROM books WHERE owner = ? AND deleted = 0 ORDER BY updated_at DESC`,
      [owner],
    );
    return json({ books: rows.map(rowToBook) });
  }

  if (method === 'GET' && id && action === 'history') {
    const rows = await db.execute(
      'SELECT snapshot, created_at FROM book_history WHERE book_id = ? AND owner = ? ORDER BY created_at DESC LIMIT 30',
      [id, owner],
    );
    return json({
      history: rows.map((r) => {
        try {
          return { created_at: r.created_at, book: JSON.parse(r.snapshot) };
        } catch {
          return { created_at: r.created_at, book: null };
        }
      }),
    });
  }

  if (method === 'POST' && id && action === 'restore') {
    const now = new Date().toISOString();
    const rows = await db.execute(
      'SELECT id FROM books WHERE id = ? AND owner = ? AND deleted = 1',
      [id, owner],
    );
    if (!rows.length) return json({ error: 'not_found' }, 404);
    await db.execute(
      'UPDATE books SET deleted = 0, updated_at = ? WHERE id = ? AND owner = ?',
      [now, id, owner],
    );
    const back = await db.execute(
      `SELECT ${BOOK_COLUMNS} FROM books WHERE id = ? AND owner = ? AND deleted = 0`,
      [id, owner],
    );
    return json({ book: rowToBook(back[0]) });
  }

  // sanitize 遇到超長欄位會丟 TooLong——就地轉 400，不讓它逸出成 500
  const trySanitize = (body) => {
    try {
      return { book: sanitizeBook(body) };
    } catch (err) {
      if (err instanceof TooLong) return { error: json({ error: 'too_long', field: err.field, limit: err.limit, message: err.message }, 400) };
      throw err;
    }
  };

  if (method === 'POST' && !id) {
    const parsed = trySanitize(await request.json().catch(() => null));
    if (parsed.error) return parsed.error;
    const book = parsed.book;
    if (!book) return json({ error: 'title_required' }, 400);
    // ISBN 查重：同一本書重複建檔會讓檢索引文重複出現
    if (book.isbn) {
      const dup = await db.execute(
        'SELECT id, title FROM books WHERE owner = ? AND isbn = ? AND deleted = 0',
        [owner, book.isbn],
      );
      if (dup.length) return json({ error: 'duplicate_isbn', id: dup[0].id, title: dup[0].title }, 409);
    }
    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO books (${BOOK_COLUMNS}, owner, deleted) VALUES (${'?,'.repeat(FIELDS.length + 3)}?, 0)`,
      [newId, ...bookArgs(book), now, now, owner],
    );
    return json({ book: { ...book, id: newId, created_at: now, updated_at: now } }, 201);
  }

  if (method === 'PUT' && id) {
    const body = await request.json().catch(() => null);
    const parsed = trySanitize(body);
    if (parsed.error) return parsed.error;
    const book = parsed.book;
    if (!book) return json({ error: 'title_required' }, 400);
    let now = new Date().toISOString();
    const current = await db.execute(
      `SELECT ${BOOK_COLUMNS} FROM books WHERE id = ? AND owner = ? AND deleted = 0`,
      [id, owner],
    );
    if (!current.length) return json({ error: 'not_found' }, 404);
    const old = rowToBook(current[0]);
    // 樂觀鎖：前端要帶著讀到當下的 updated_at 回來，不符表示另一台裝置改過了
    const baseVersion = body && body.updated_at;
    if (baseVersion && old.updated_at && baseVersion !== old.updated_at) {
      return json({ error: 'conflict', server_updated_at: old.updated_at }, 409);
    }
    // 同一毫秒內連續更新會讓 updated_at 不變、樂觀鎖失效——強迫往前推 1ms
    if (now <= old.updated_at) {
      now = new Date(new Date(old.updated_at).getTime() + 1).toISOString();
    }
    // 舊版快照進歷史表，誤改可回溯
    await db.executeBatch([
      {
        sql: 'INSERT INTO book_history (id, book_id, owner, snapshot, created_at) VALUES (?,?,?,?,?)',
        args: [crypto.randomUUID(), id, owner, JSON.stringify(old), now],
      },
      {
        sql: `UPDATE books SET ${FIELDS.map((f) => `${f}=?`).join(', ')}, updated_at=? WHERE id=? AND owner=? AND deleted=0`,
        args: [...bookArgs(book), now, id, owner],
      },
    ]);
    const rows = await db.execute(
      `SELECT ${BOOK_COLUMNS} FROM books WHERE id = ? AND owner = ? AND deleted = 0`,
      [id, owner],
    );
    if (!rows.length) return json({ error: 'not_found' }, 404);
    return json({ book: rowToBook(rows[0]) });
  }

  if (method === 'DELETE' && id) {
    const now = new Date().toISOString();
    const exists = await db.execute(
      'SELECT id FROM books WHERE id = ? AND owner = ? AND deleted = 0',
      [id, owner],
    );
    if (!exists.length) return json({ error: 'not_found' }, 404); // 打不存在的 id 不再謊報成功
    await db.execute(
      'UPDATE books SET deleted = 1, updated_at = ? WHERE id = ? AND owner = ?',
      [now, id, owner],
    );
    // 清掉其他書 related 裡對這本書的引用，不留懸空 ID
    const referrers = await db.execute(
      "SELECT id, related FROM books WHERE owner = ? AND deleted = 0 AND related LIKE ?",
      [owner, `%${id}%`],
    );
    const cleanups = [];
    for (const r of referrers) {
      let rel;
      try {
        rel = JSON.parse(r.related);
      } catch {
        continue;
      }
      if (!Array.isArray(rel)) continue;
      const next = rel.filter((x) => x && x.id !== id);
      if (next.length !== rel.length) {
        cleanups.push({
          sql: 'UPDATE books SET related = ?, updated_at = ? WHERE id = ? AND owner = ?',
          args: [JSON.stringify(next), now, r.id, owner],
        });
      }
    }
    if (cleanups.length) await db.executeBatch(cleanups);
    return json({ ok: true });
  }

  return json({ error: 'not_found' }, 404);
}

export async function onRequest(context) {
  const { request, env } = context;
  let db;
  try {
    db = tursoClient(env);
  } catch (err) {
    return json({ error: 'storage_not_configured', message: err.message }, 503);
  }
  try {
    return await handleBooks(request, env, db);
  } catch (err) {
    if (err instanceof Unauthorized) return json({ error: 'unauthorized' }, 401);
    if (err instanceof Forbidden) return json({ error: 'forbidden' }, 403);
    if (err instanceof TooLong) return json({ error: 'too_long', field: err.field, limit: err.limit, message: err.message }, 400);
    console.error('books api error', err);
    return json({ error: 'internal' }, 500);
  }
}
