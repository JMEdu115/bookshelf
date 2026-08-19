/*
 * 後端共用：從請求裡取出目前登入的使用者，並確認是書齋主人本人。
 *
 * session 不進資料庫，用「簽章過的 cookie」：{ sub, email, exp } 接一段
 * HMAC-SHA256 簽章。金鑰只從 env.SESSION_SECRET 讀，程式碼裡不留預設值。
 *
 * 這是單人系統：requireOwner 除了驗 cookie，還要求 email 等於 env.OWNER_EMAIL，
 * 其他 Google 帳號就算簽到 session 也一律 403。
 */

/** cookie 名稱。前綴 bs_ 跟同網域其他工具的 cookie 分開。 */
export const SESSION_COOKIE = 'bs_session';

/** session 有效期 30 天——個人工具，不用像多人系統那麼緊。 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export class Unauthorized extends Error {
  constructor(message = '尚未登入') {
    super(message);
    this.status = 401;
  }
}

export class Forbidden extends Error {
  constructor(message = '此系統僅限主人本人使用') {
    super(message);
    this.status = 403;
  }
}

/* ---- base64url：cookie 不能放 + / = 這些字元 ---- */

function base64urlFromBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesFromBase64url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/* 定時比對，避免一位一位試出簽章。 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 簽發 session token：`<base64url(payload JSON)>.<base64url(HMAC)>`。
 * exp 一定由這裡覆寫，呼叫端塞不進永不過期的值。
 */
export async function signSession({ userId, email }, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret) throw new Error('缺少 SESSION_SECRET，不簽發 session');
  if (!userId) throw new Error('缺少 userId，不簽發 session');
  const payload = { sub: userId, email: email || '', exp: nowSeconds + SESSION_TTL_SECONDS };
  const body = base64urlFromBytes(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${base64urlFromBytes(new Uint8Array(sig))}`;
}

/**
 * 驗證 token，回傳 { userId, email } 或 null。
 * 任何一步不對都回 null，不對外區分「簽章錯」與「過期」。
 */
export async function verifySession(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot < 1 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let expected;
  try {
    const key = await hmacKey(secret);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    expected = base64urlFromBytes(new Uint8Array(mac));
  } catch {
    return null;
  }
  if (!timingSafeEqual(sig, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytesFromBase64url(body)));
  } catch {
    return null;
  }
  if (!payload || typeof payload.sub !== 'string' || !payload.sub) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return null;
  return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : '' };
}

/** 從 Cookie 標頭取一個值。名稱後面一定接 `=`，避免 xbs_session 被誤認。 */
export function readCookie(request, name) {
  const raw = request?.headers?.get?.('Cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const s = part.trim();
    const eq = s.indexOf('=');
    if (eq > 0 && s.slice(0, eq) === name) return decodeURIComponent(s.slice(eq + 1));
  }
  return null;
}

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/** email 白名單比對：修剪空白、不分大小寫。 */
export function isOwnerEmail(email, env) {
  const owner = String(env?.OWNER_EMAIL || '').trim().toLowerCase();
  if (!owner) return false; // 沒設白名單就誰都不放行，不要預設全開
  return String(email || '').trim().toLowerCase() === owner;
}

/*
 * 本機開發後門的第二道鎖：除了 env.DEV_OWNER_ID 有設，
 * 還要求請求來自本機主機名；正式網域永遠不符合，變數誤設也開不起來。
 */
function isLocalRequest(request) {
  let host;
  try {
    host = new URL(request.url).hostname;
  } catch {
    return false;
  }
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host.endsWith('.localhost');
}

/**
 * 回傳 { userId, email }。未登入 throw Unauthorized；
 * 已登入但不是 OWNER_EMAIL 則 throw Forbidden。
 */
export async function requireOwner(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  const session = await verifySession(token, env?.SESSION_SECRET);
  if (session) {
    if (!isOwnerEmail(session.email, env)) throw new Forbidden();
    return session;
  }
  if (env?.DEV_OWNER_ID && isLocalRequest(request)) {
    return { userId: env.DEV_OWNER_ID, email: 'dev@localhost' };
  }
  throw new Unauthorized();
}
