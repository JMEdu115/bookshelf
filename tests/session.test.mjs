import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signSession,
  verifySession,
  sessionCookie,
  isOwnerEmail,
  requireOwner,
  Unauthorized,
  Forbidden,
  SESSION_COOKIE,
} from '../functions/_lib/session.js';

const SECRET = 'test-secret';
const OWNER = 'hk6429@gmail.com';
const env = { SESSION_SECRET: SECRET, OWNER_EMAIL: OWNER };

function requestWithCookie(token, url = 'https://naicheng-bookshelf.pages.dev/api/books') {
  return new Request(url, { headers: { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } });
}

test('簽發後可驗證，內容一致', async () => {
  const token = await signSession({ userId: 'u1', email: OWNER }, SECRET);
  const session = await verifySession(token, SECRET);
  assert.equal(session.userId, 'u1');
  assert.equal(session.email, OWNER);
});

test('篡改 payload 驗不過', async () => {
  const token = await signSession({ userId: 'u1', email: OWNER }, SECRET);
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'u2', email: OWNER, exp: 9999999999 }))
    .toString('base64url');
  assert.equal(await verifySession(`${forged}.${sig}`, SECRET), null);
  assert.equal(await verifySession(`${body}.AAAA`, SECRET), null);
});

test('過期 token 驗不過', async () => {
  const now = 1000000;
  const token = await signSession({ userId: 'u1', email: OWNER }, SECRET, now);
  assert.notEqual(await verifySession(token, SECRET, now + 10), null);
  assert.equal(await verifySession(token, SECRET, now + 60 * 60 * 24 * 31), null);
});

test('isOwnerEmail：大小寫與空白不敏感；沒設 OWNER_EMAIL 一律拒絕', () => {
  assert.equal(isOwnerEmail('HK6429@Gmail.com ', env), true);
  assert.equal(isOwnerEmail('other@gmail.com', env), false);
  assert.equal(isOwnerEmail(OWNER, { OWNER_EMAIL: '' }), false);
  assert.equal(isOwnerEmail(OWNER, {}), false);
});

test('requireOwner：主人放行、非主人 403、沒 cookie 401', async () => {
  const good = await signSession({ userId: 'u1', email: OWNER }, SECRET);
  const session = await requireOwner(requestWithCookie(good), env);
  assert.equal(session.userId, 'u1');

  const stranger = await signSession({ userId: 'u2', email: 'evil@example.com' }, SECRET);
  await assert.rejects(() => requireOwner(requestWithCookie(stranger), env), Forbidden);

  await assert.rejects(
    () => requireOwner(new Request('https://naicheng-bookshelf.pages.dev/api/books'), env),
    Unauthorized,
  );
});

test('DEV_OWNER_ID 只在本機主機名生效', async () => {
  const devEnv = { ...env, DEV_OWNER_ID: 'dev-1' };
  const local = await requireOwner(new Request('http://localhost:8788/api/books'), devEnv);
  assert.equal(local.userId, 'dev-1');
  await assert.rejects(
    () => requireOwner(new Request('https://naicheng-bookshelf.pages.dev/api/books'), devEnv),
    Unauthorized,
  );
});

test('sessionCookie 帶 HttpOnly/Secure/SameSite', async () => {
  const cookie = sessionCookie('abc');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
});
