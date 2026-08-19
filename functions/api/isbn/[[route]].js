/*
 * GET /api/isbn/:isbn —— ISBN 書目查詢後端代理。
 * 走 Cloudflare 出口 IP 查 Google Books／Open Library，
 * 避免使用者家用 IP 的匿名配額被打光（手機和電腦同一個 IP 會互相吃額度）。
 * 回 { book, degraded }，語意與前端直連版相同。
 */

import { requireOwner, Unauthorized, Forbidden } from '../../_lib/session.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function parseYear(published) {
  const m = String(published ?? '').match(/(1[5-9]\d{2}|20\d{2})/);
  return m ? Number(m[1]) : 0;
}

async function fromGoogleBooks(isbn, fetchImpl, apiKey) {
  // 有 API key 走專屬配額（1000 次/日），沒有就吃匿名配額（CF 共用出口 IP 常年被打滿）
  const key = apiKey ? `&key=${apiKey}` : '';
  const res = await fetchImpl(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&country=TW${key}`);
  if (res.status === 429 || res.status >= 500) throw new Error('rate_limited');
  if (!res.ok) return null;
  const data = await res.json();
  const info = data.items?.[0]?.volumeInfo;
  if (!info || !info.title) return null;
  const thumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
  return {
    title: info.title + (info.subtitle ? `：${info.subtitle}` : ''),
    authors: (info.authors || []).join('、'),
    publisher: info.publisher || '',
    published: info.publishedDate || '',
    published_year: parseYear(info.publishedDate),
    description: info.description || '',
    cover_url: thumb ? thumb.replace(/^http:\/\//, 'https://') : '',
  };
}

async function fromOpenLibrary(isbn, fetchImpl) {
  const res = await fetchImpl(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  if (res.status === 429 || res.status >= 500) throw new Error('rate_limited');
  if (!res.ok) return null;
  const data = await res.json();
  const info = data[`ISBN:${isbn}`];
  if (!info || !info.title) return null;
  return {
    title: info.title,
    authors: (info.authors || []).map((a) => a.name).join('、'),
    publisher: (info.publishers || []).map((p) => p.name).join('、'),
    published: info.publish_date || '',
    published_year: parseYear(info.publish_date),
    description: '',
    cover_url: info.cover?.medium || info.cover?.small || '',
  };
}

export async function handleIsbn(request, env, fetchImpl = fetch) {
  await requireOwner(request, env);
  const segments = new URL(request.url).pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const isbn = (segments[2] || '').replace(/[-\s]/g, '');
  if (!/^(\d{9}[\dXx]|\d{13})$/.test(isbn)) return json({ error: 'bad_isbn' }, 400);
  let hit = null;
  let degraded = false;
  try {
    hit = await fromGoogleBooks(isbn, fetchImpl, env.GOOGLE_BOOKS_API_KEY);
  } catch {
    degraded = true;
  }
  if (!hit) {
    try {
      hit = await fromOpenLibrary(isbn, fetchImpl);
    } catch {
      degraded = true;
    }
  }
  return json({ book: hit ? { ...hit, isbn } : null, degraded });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    return await handleIsbn(request, env);
  } catch (err) {
    if (err instanceof Unauthorized) return json({ error: 'unauthorized' }, 401);
    if (err instanceof Forbidden) return json({ error: 'forbidden' }, 403);
    console.error('isbn api error', err);
    return json({ error: 'internal' }, 500);
  }
}
