/*
 * /api/auth/* —— Google Identity Services 登入與 session 簽發。
 *
 *   /api/auth/config → 前端拿 clientId 與 nonce（同時種 nonce cookie）
 *   /api/auth/google → 前端 POST GIS credential，後端驗簽後簽出 session cookie
 *   /api/auth/me     → 現在是誰
 *   /api/auth/logout → 清 cookie
 *
 * 只走 GIS id_token 流程，不需要 GOOGLE_CLIENT_SECRET。
 * 單人系統：credential 驗過之後 email 還要等於 OWNER_EMAIL 才簽 session。
 */

import {
  requireOwner,
  signSession,
  sessionCookie,
  clearSessionCookie,
  readCookie,
  isOwnerEmail,
  Unauthorized,
  Forbidden,
} from '../../_lib/session.js';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GIS_NONCE_COOKIE = 'bs_gis_nonce';
const NONCE_TTL_SECONDS = 600;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function missingConfig(env) {
  return ['GOOGLE_CLIENT_ID', 'SESSION_SECRET', 'OWNER_EMAIL'].filter((k) => !env?.[k]);
}

function decodeBase64urlBytes(value) {
  const text = String(value || '');
  const pad = text.length % 4 === 0 ? '' : '='.repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJwtPart(value) {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64urlBytes(value)));
  } catch {
    return null;
  }
}

/**
 * 驗證 GIS 回傳的 ID token。驗簽與 claims 都在 Worker 端完成，
 * 瀏覽器解 token 的結果不作為身分依據。
 */
export async function verifyGoogleCredential(
  credential,
  { clientId, nonce, nowSeconds = Math.floor(Date.now() / 1000), fetchImpl = fetch } = {},
) {
  if (!credential || !clientId || !nonce) return null;
  const parts = String(credential).split('.');
  if (parts.length !== 3) return null;

  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (!header || header.alg !== 'RS256' || !header.kid || !claims) return null;

  let jwks;
  try {
    const res = await fetchImpl(GOOGLE_JWKS_URL, {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!res.ok) return null;
    jwks = await res.json();
  } catch {
    return null;
  }
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      decodeBase64urlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;
  } catch {
    return null;
  }

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(clientId)) return null;
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') return null;
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return null;
  if (typeof claims.iat !== 'number' || claims.iat > nowSeconds + 300) return null;
  if (claims.nonce !== nonce) return null;
  if (!claims.sub || !claims.email || (claims.email_verified !== true && claims.email_verified !== 'true')) return null;
  return { userId: claims.sub, email: claims.email };
}

async function handleGoogle(request, env) {
  const missing = missingConfig(env);
  if (missing.length) return json({ error: 'not_configured', missing }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const nonce = readCookie(request, GIS_NONCE_COOKIE);
  const identity = await verifyGoogleCredential(body.credential, {
    clientId: env.GOOGLE_CLIENT_ID,
    nonce,
  });
  if (!identity) return json({ error: 'invalid_google_credential' }, 401);
  // 單人白名單：不是主人本人就不簽 session。
  if (!isOwnerEmail(identity.email, env)) return json({ error: 'not_owner' }, 403);

  const token = await signSession(identity, env.SESSION_SECRET);
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  headers.append('Set-Cookie', sessionCookie(token));
  headers.append(
    'Set-Cookie',
    `${GIS_NONCE_COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  );
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

async function handleMe(request, env) {
  try {
    const user = await requireOwner(request, env);
    return json({ signedIn: true, ...user });
  } catch (err) {
    if (err instanceof Unauthorized) return json({ signedIn: false }, 401);
    if (err instanceof Forbidden) return json({ signedIn: false, error: 'not_owner' }, 403);
    throw err;
  }
}

function handleLogout() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const route = Array.isArray(params?.route) ? params.route.join('/') : String(params?.route || '');
  const method = request.method.toUpperCase();

  if (route === 'me' && method === 'GET') return handleMe(request, env);
  if (route === 'logout' && (method === 'POST' || method === 'GET')) return handleLogout();
  if (route === 'google' && method === 'POST') return handleGoogle(request, env);

  // 設定狀態要能在沒登入時查。回傳缺哪些變數名，但不回傳值。
  if (route === 'config' && method === 'GET') {
    const missing = missingConfig(env);
    if (missing.length) return json({ configured: false, missing, mode: 'google_identity_services' });
    const nonce = randomToken();
    return json(
      { configured: true, missing: [], mode: 'google_identity_services', clientId: env.GOOGLE_CLIENT_ID, nonce },
      200,
      { 'Set-Cookie': `${GIS_NONCE_COOKIE}=${nonce}; Path=/api/auth; Max-Age=${NONCE_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict` },
    );
  }

  return json({ error: 'not_found' }, 404);
}
