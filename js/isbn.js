/*
 * ISBN → 書目資料。先查 Google Books，查不到 fallback Open Library。
 * 兩邊都是可跨域的公開 API，不用金鑰。台版書覆蓋不全，查不到就回 null，
 * 由使用者手動補完——不要編造書目。
 */

function normalizeIsbn(raw) {
  return String(raw || '').replace(/[-\s]/g, '').trim();
}

/** ISBN-10 modulo-11 檢查碼。 */
function validIsbn10(isbn) {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = isbn[i];
    const v = c === 'X' || c === 'x' ? 10 : Number(c);
    if (Number.isNaN(v)) return false;
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

/** ISBN-13（EAN）modulo-10 檢查碼。 */
function validIsbn13(isbn) {
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const v = Number(isbn[i]);
    if (Number.isNaN(v)) return false;
    sum += v * (i % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}

/**
 * 驗長度＋檢查碼。分辨「號碼本身打錯」vs「資料庫沒收錄」，
 * 打錯一碼時直接擋下，不誤導使用者以為是查不到。
 */
export function isValidIsbn(raw) {
  const isbn = normalizeIsbn(raw);
  if (/^\d{9}[\dXx]$/.test(isbn)) return validIsbn10(isbn);
  if (/^\d{13}$/.test(isbn)) return validIsbn13(isbn);
  return false;
}

/** 只驗形狀不驗檢查碼——用來區分「格式不像 ISBN」vs「檢查碼不對（打錯字）」。 */
export function looksLikeIsbn(raw) {
  const isbn = normalizeIsbn(raw);
  return /^(\d{9}[\dXx]|\d{13})$/.test(isbn);
}

/** 從各種出版日期字串（2020 / 2020-05 / May 2020）撈出西元年。 */
export function parseYear(published) {
  const m = String(published ?? '').match(/(1[5-9]\d{2}|20\d{2})/);
  return m ? Number(m[1]) : 0;
}

async function fromGoogleBooks(isbn) {
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&country=TW`);
  if (res.status === 429 || res.status >= 500) throw new Error('rate_limited');
  if (!res.ok) return null;
  const data = await res.json();
  const info = data.items?.[0]?.volumeInfo;
  if (!info || !info.title) return null;
  // Google Books 的縮圖是 http://，要換 https 才過得了 CSP
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

async function fromOpenLibrary(isbn) {
  const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
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

/**
 * 查一個 ISBN。回 { book, degraded }：
 *   book     查到的書目物件（含 isbn 欄），查不到為 null
 *   degraded true 表示至少一個書目庫暫時故障（配額滿／伺服器錯誤），
 *            「查不到」不代表真的沒有這本書
 */
export async function lookupIsbn(raw) {
  const isbn = normalizeIsbn(raw);
  if (!isValidIsbn(isbn)) return { book: null, degraded: false };
  // 先走後端代理（Cloudflare 出口 IP，不吃使用者家用 IP 的匿名配額）
  try {
    const res = await fetch(`/api/isbn/${isbn}`, { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      if (data.book || !data.degraded) return data; // 查到了，或確定查不到
      // 代理端兩庫都滿載 → 再用瀏覽器直連試一輪（不同 IP，也許還有額度）
    }
  } catch { /* 代理掛了就退回直連 */ }
  let hit = null;
  let degraded = false;
  try {
    hit = await fromGoogleBooks(isbn);
  } catch {
    degraded = true;
  }
  if (!hit) {
    try {
      hit = await fromOpenLibrary(isbn);
    } catch {
      degraded = true;
    }
  }
  return { book: hit ? { ...hit, isbn } : null, degraded };
}
