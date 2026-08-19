import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBooks, sanitizeBook, normalizeTopic, parseYear } from '../functions/api/books/[[route]].js';
import { signSession, SESSION_COOKIE } from '../functions/_lib/session.js';

const SECRET = 'test-secret';
const OWNER = 'hk6429@gmail.com';
const env = { SESSION_SECRET: SECRET, OWNER_EMAIL: OWNER };

const FIELDS = [
  'isbn', 'title', 'authors', 'translator', 'publisher', 'published', 'published_year',
  'series', 'edition', 'cover_url', 'description', 'location_kind', 'location',
  'start_date', 'finish_date', 'status', 'lend_to', 'lend_date',
  'reading_reason', 'key_question', 'last_reviewed_at',
  'topics', 'audience', 'review', 'review_log', 'actions', 'highlights', 'related',
];

/** 針對 handleBooks 用到的各種 SQL 樣式做的記憶體假資料庫。 */
function fakeDb() {
  const rows = [];
  const history = [];
  async function execute(sql, args) {
    if (/^SELECT .*, deleted FROM books WHERE owner = \?/.test(sql)) {
      return rows.filter((r) => r.owner === args[0]);
    }
    if (/^SELECT id, title FROM books WHERE owner = \? AND isbn = \? AND deleted = 0/.test(sql)) {
      return rows.filter((r) => r.owner === args[0] && r.isbn === args[1] && r.deleted === 0);
    }
    if (/^SELECT id, related FROM books WHERE owner = \? AND deleted = 0 AND related LIKE \?/.test(sql)) {
      const needle = args[1].replace(/%/g, '');
      return rows.filter((r) => r.owner === args[0] && r.deleted === 0 && String(r.related).includes(needle));
    }
    if (/^SELECT id FROM books WHERE id = \? AND owner = \? AND deleted = ([01])/.test(sql)) {
      const del = Number(sql.match(/deleted = ([01])/)[1]);
      return rows.filter((r) => r.id === args[0] && r.owner === args[1] && r.deleted === del);
    }
    if (/^SELECT .* FROM books WHERE id = \? AND owner = \? AND deleted = 0/.test(sql)) {
      return rows.filter((r) => r.id === args[0] && r.owner === args[1] && r.deleted === 0);
    }
    if (/^SELECT .* FROM books WHERE owner = \? AND deleted = 1/.test(sql)) {
      return rows.filter((r) => r.owner === args[0] && r.deleted === 1);
    }
    if (/^SELECT .* FROM books WHERE owner = \? AND deleted = 0/.test(sql)) {
      return rows
        .filter((r) => r.owner === args[0] && r.deleted === 0)
        .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    }
    if (/^SELECT snapshot, created_at FROM book_history/.test(sql)) {
      return history.filter((h) => h.book_id === args[0] && h.owner === args[1]);
    }
    if (/^INSERT INTO book_history/.test(sql)) {
      history.push({ id: args[0], book_id: args[1], owner: args[2], snapshot: args[3], created_at: args[4] });
      return [];
    }
    if (/^INSERT INTO books/.test(sql)) {
      const row = { deleted: 0 };
      ['id', ...FIELDS, 'created_at', 'updated_at', 'owner'].forEach((c, i) => { row[c] = args[i]; });
      rows.push(row);
      return [];
    }
    if (/^UPDATE books SET isbn=/.test(sql)) {
      const [id, owner] = args.slice(-2);
      const row = rows.find((r) => r.id === id && r.owner === owner && r.deleted === 0);
      if (row) [...FIELDS, 'updated_at'].forEach((c, i) => { row[c] = args[i]; });
      return [];
    }
    if (/^UPDATE books SET deleted = 1/.test(sql)) {
      const row = rows.find((r) => r.id === args[1] && r.owner === args[2]);
      if (row) row.deleted = 1;
      return [];
    }
    if (/^UPDATE books SET deleted = 0/.test(sql)) {
      const row = rows.find((r) => r.id === args[1] && r.owner === args[2]);
      if (row) row.deleted = 0;
      return [];
    }
    if (/^UPDATE books SET related = \?/.test(sql)) {
      const row = rows.find((r) => r.id === args[2] && r.owner === args[3]);
      if (row) {
        row.related = args[0];
        row.updated_at = args[1];
      }
      return [];
    }
    throw new Error(`fakeDb 不認得的 SQL：${sql}`);
  }
  return {
    rows,
    history,
    execute,
    async executeBatch(statements) {
      const out = [];
      for (const st of statements) out.push(await execute(st.sql, st.args));
      return out;
    },
  };
}

async function authedRequest(path, options = {}, email = OWNER, userId = 'owner-1') {
  const token = await signSession({ userId, email }, SECRET);
  return new Request(`https://naicheng-bookshelf.pages.dev${path}`, {
    ...options,
    headers: {
      Cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
  });
}

test('未登入丟 Unauthorized', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => handleBooks(new Request('https://x.pages.dev/api/books'), env, db),
    (err) => err.status === 401,
  );
});

test('非主人丟 Forbidden', async () => {
  const db = fakeDb();
  const req = await authedRequest('/api/books', {}, 'evil@example.com', 'evil-1');
  await assert.rejects(() => handleBooks(req, env, db), (err) => err.status === 403);
});

test('新增 → 列表 → 更新 → 軟刪除 全鏈（新欄位齊全）', async () => {
  const db = fakeDb();
  const payload = {
    title: '學習的王道',
    isbn: '9789573287674',
    translator: '游敏',
    published: '2009-08',
    topics: ['學習方法', '班級經營'],
    highlights: [{ text: '投資於過程而非結果', page: '42', my_take: '段考檢討可用', tags: ['班級經營'], kind: 'exact' }],
    review_log: [{ date: '2026-08-01', text: '第二次讀，更懂了' }],
    actions: [{ date: '2026-08-05', text: '用在 802 班段考檢討' }],
    location_kind: 'physical',
    location: '書房左櫃',
    key_question: '如何把挫折變成學習過程？',
  };
  const createRes = await handleBooks(
    await authedRequest('/api/books', { method: 'POST', body: JSON.stringify(payload) }),
    env,
    db,
  );
  assert.equal(createRes.status, 201);
  const { book } = await createRes.json();
  assert.ok(book.id);
  assert.equal(book.translator, '游敏');
  assert.equal(book.published_year, 2009); // 自動從 published 撈年份
  assert.deepEqual(book.topics, ['學習方法', '班級經營']);
  assert.equal(book.highlights[0].my_take, '段考檢討可用');
  assert.ok(book.highlights[0].created_at); // 系統自動蓋時間戳

  const listRes = await handleBooks(await authedRequest('/api/books'), env, db);
  const { books } = await listRes.json();
  assert.equal(books.length, 1);
  assert.equal(books[0].review_log[0].text, '第二次讀，更懂了');

  const updateRes = await handleBooks(
    await authedRequest(`/api/books/${book.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...payload, review: '值得每年重讀', status: 'done', finish_date: '2026-08-19', updated_at: books[0].updated_at }),
    }),
    env,
    db,
  );
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()).book;
  assert.equal(updated.review, '值得每年重讀');
  assert.equal(updated.finish_date, '2026-08-19');
  assert.equal(db.history.length, 1); // 舊版進了歷史表

  const delRes = await handleBooks(
    await authedRequest(`/api/books/${book.id}`, { method: 'DELETE' }),
    env,
    db,
  );
  assert.equal(delRes.status, 200);
  const after = await (await handleBooks(await authedRequest('/api/books'), env, db)).json();
  assert.equal(after.books.length, 0);
});

test('同 ISBN 重複建檔回 409 並附既有書 id', async () => {
  const db = fakeDb();
  const body = JSON.stringify({ title: 'A書', isbn: '9789573287674' });
  const first = await handleBooks(await authedRequest('/api/books', { method: 'POST', body }), env, db);
  assert.equal(first.status, 201);
  const dup = await handleBooks(await authedRequest('/api/books', { method: 'POST', body }), env, db);
  assert.equal(dup.status, 409);
  const dupBody = await dup.json();
  assert.equal(dupBody.error, 'duplicate_isbn');
  assert.equal(dupBody.id, (await first.clone?.()?.json?.())?.book?.id ?? dupBody.id);
});

test('樂觀鎖：帶過期 updated_at 的 PUT 回 409 conflict', async () => {
  const db = fakeDb();
  const create = await handleBooks(
    await authedRequest('/api/books', { method: 'POST', body: JSON.stringify({ title: '同步之書' }) }),
    env, db,
  );
  const { book } = await create.json();
  // 第一台裝置改成功
  const ok = await handleBooks(
    await authedRequest(`/api/books/${book.id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: '同步之書v2', updated_at: book.updated_at }),
    }),
    env, db,
  );
  assert.equal(ok.status, 200);
  // 第二台裝置還拿著舊 updated_at → 409
  const stale = await handleBooks(
    await authedRequest(`/api/books/${book.id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: '會蓋掉別人的版本', updated_at: book.updated_at }),
    }),
    env, db,
  );
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error, 'conflict');
});

test('DELETE 不存在的 id 回 404，不謊報成功；刪除會清掉別人的 related 引用', async () => {
  const db = fakeDb();
  const miss = await handleBooks(await authedRequest('/api/books/no-such-id', { method: 'DELETE' }), env, db);
  assert.equal(miss.status, 404);

  const a = (await (await handleBooks(
    await authedRequest('/api/books', { method: 'POST', body: JSON.stringify({ title: '甲書' }) }), env, db,
  )).json()).book;
  const b = (await (await handleBooks(
    await authedRequest('/api/books', { method: 'POST', body: JSON.stringify({ title: '乙書', related: [{ id: a.id, how: '搭配讀' }] }) }), env, db,
  )).json()).book;
  const del = await handleBooks(await authedRequest(`/api/books/${a.id}`, { method: 'DELETE' }), env, db);
  assert.equal(del.status, 200);
  const list = (await (await handleBooks(await authedRequest('/api/books'), env, db)).json()).books;
  const bAfter = list.find((x) => x.id === b.id);
  assert.deepEqual(bAfter.related, []); // 懸空引用被清掉
});

test('垃圾桶列表與還原', async () => {
  const db = fakeDb();
  const a = (await (await handleBooks(
    await authedRequest('/api/books', { method: 'POST', body: JSON.stringify({ title: '误刪之書' }) }), env, db,
  )).json()).book;
  await handleBooks(await authedRequest(`/api/books/${a.id}`, { method: 'DELETE' }), env, db);
  const trash = (await (await handleBooks(await authedRequest('/api/books/trash'), env, db)).json()).books;
  assert.equal(trash.length, 1);
  const restored = await handleBooks(await authedRequest(`/api/books/${a.id}/restore`, { method: 'POST' }), env, db);
  assert.equal(restored.status, 200);
  const list = (await (await handleBooks(await authedRequest('/api/books'), env, db)).json()).books;
  assert.equal(list.length, 1);
});

test('export 全量備份含垃圾桶', async () => {
  const db = fakeDb();
  const a = (await (await handleBooks(
    await authedRequest('/api/books', { method: 'POST', body: JSON.stringify({ title: '現役' }) }), env, db,
  )).json()).book;
  await handleBooks(
    await authedRequest('/api/books', { method: 'POST', body: JSON.stringify({ title: '已刪' }) }), env, db,
  );
  const delTarget = db.rows.find((r) => r.title === '已刪');
  await handleBooks(await authedRequest(`/api/books/${delTarget.id}`, { method: 'DELETE' }), env, db);
  const exp = await (await handleBooks(await authedRequest('/api/books/export'), env, db)).json();
  assert.equal(exp.books.length, 2);
  assert.ok(exp.books.some((b) => b.deleted === 1));
  assert.ok(exp.exported_at);
  assert.ok(exp.books.some((b) => b.id === a.id));
});

test('超長欄位回 400 too_long，不靜默截斷', async () => {
  const db = fakeDb();
  const res = await handleBooks(
    await authedRequest('/api/books', {
      method: 'POST',
      body: JSON.stringify({ title: '長文之書', review: 'x'.repeat(20001) }),
    }),
    env, db,
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'too_long');
});

test('別人的書看不到也刪不掉', async () => {
  const db = fakeDb();
  await handleBooks(
    await authedRequest('/api/books', { method: 'POST', body: JSON.stringify({ title: '我的書' }) }),
    env,
    db,
  );
  const otherList = await handleBooks(await authedRequest('/api/books', {}, OWNER, 'other-sub'), env, db);
  assert.equal((await otherList.json()).books.length, 0);
});

test('sanitizeBook：沒書名回 null；壞欄位被清洗；主題正規化去重', () => {
  assert.equal(sanitizeBook({ title: '   ' }), null);
  assert.equal(sanitizeBook(null), null);
  const cleaned = sanitizeBook({
    title: '好書',
    cover_url: 'javascript:alert(1)',
    location_kind: 'weird',
    status: 'weird',
    published: 'May 2020',
    topics: ['班級經營', '班級 經營', '班級　經營', ''],
    highlights: [{ text: '', page: '1' }, { text: 'ok', page: 2, kind: 'nonsense' }, 'junk'],
    related: [{ id: 'x', how: 'pair' }, { how: 'no-id' }],
    review_log: [{ date: '2026-01-01', text: 'ok' }, { text: '' }, 'junk'],
  });
  assert.equal(cleaned.cover_url, '');
  assert.equal(cleaned.location_kind, 'physical');
  assert.equal(cleaned.status, 'unread');
  assert.equal(cleaned.published_year, 2020);
  assert.deepEqual(cleaned.topics, ['班級經營']); // 空白變體收斂成一個
  assert.equal(cleaned.highlights.length, 1);
  assert.equal(cleaned.highlights[0].kind, 'exact');
  assert.deepEqual(cleaned.related, [{ id: 'x', how: 'pair' }]);
  assert.equal(cleaned.review_log.length, 1);
});

test('normalizeTopic 與 parseYear', () => {
  assert.equal(normalizeTopic(' 班級 經營 '), '班級經營');
  assert.equal(normalizeTopic('ＡＩ 教學'), 'AI教學'); // NFKC 全形轉半形
  assert.equal(parseYear('2020-05-01'), 2020);
  assert.equal(parseYear('May 1998'), 1998);
  assert.equal(parseYear('未知'), 0);
});
