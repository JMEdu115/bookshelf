import test from 'node:test';
import assert from 'node:assert/strict';
import { handleIsbn } from '../functions/api/isbn/[[route]].js';
import { signSession, SESSION_COOKIE } from '../functions/_lib/session.js';

const SECRET = 'test-secret';
const OWNER = 'hk6429@gmail.com';
const env = { SESSION_SECRET: SECRET, OWNER_EMAIL: OWNER };

async function authedRequest(path) {
  const token = await signSession({ userId: 'owner-1', email: OWNER }, SECRET);
  return new Request(`https://naicheng-bookshelf.pages.dev${path}`, {
    headers: { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
  });
}

const fakeJson = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

test('未登入 401', async () => {
  await assert.rejects(
    () => handleIsbn(new Request('https://x.pages.dev/api/isbn/9789573287674'), env, async () => fakeJson({})),
    (err) => err.status === 401,
  );
});

test('格式不對回 400', async () => {
  const res = await handleIsbn(await authedRequest('/api/isbn/12345'), env, async () => fakeJson({}));
  assert.equal(res.status, 400);
});

test('Google Books 命中：帶回書目含出版年', async () => {
  const gbook = {
    items: [{ volumeInfo: {
      title: '與成功有約', subtitle: '高效能人士的七個習慣',
      authors: ['史蒂芬・柯維'], publisher: '天下文化', publishedDate: '2020-05',
      description: '簡介', imageLinks: { thumbnail: 'http://books.google.com/x.jpg' },
    } }],
  };
  const res = await handleIsbn(await authedRequest('/api/isbn/9789573287674'), env, async (url) => {
    assert.match(url, /googleapis/);
    return fakeJson(gbook);
  });
  const { book, degraded } = await res.json();
  assert.equal(degraded, false);
  assert.equal(book.title, '與成功有約：高效能人士的七個習慣');
  assert.equal(book.published_year, 2020);
  assert.match(book.cover_url, /^https:/); // http 縮圖被升級成 https
  assert.equal(book.isbn, '9789573287674');
});

test('Google 429 → fallback Open Library；OL 也 429 → degraded', async () => {
  const ol = { 'ISBN:9789573287674': { title: 'OL書', authors: [{ name: '某人' }], publishers: [{ name: '某社' }], publish_date: '1999' } };
  const res = await handleIsbn(await authedRequest('/api/isbn/9789573287674'), env, async (url) => {
    if (/googleapis/.test(url)) return fakeJson({}, 429);
    return fakeJson(ol);
  });
  const { book, degraded } = await res.json();
  assert.equal(book.title, 'OL書');
  assert.equal(book.published_year, 1999);
  assert.equal(degraded, true); // Google 滿載要誠實回報

  const res2 = await handleIsbn(await authedRequest('/api/isbn/9789573287674'), env, async () => fakeJson({}, 429));
  const out2 = await res2.json();
  assert.equal(out2.book, null);
  assert.equal(out2.degraded, true);
});

test('兩庫都查無此書：degraded=false（真的沒有）', async () => {
  const res = await handleIsbn(await authedRequest('/api/isbn/9789869866262'), env, async (url) => (
    /googleapis/.test(url) ? fakeJson({ totalItems: 0 }) : fakeJson({})
  ));
  const { book, degraded } = await res.json();
  assert.equal(book, null);
  assert.equal(degraded, false);
});
