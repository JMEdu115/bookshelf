/*
 * 前端登入狀態與登入／登出流程（沿用 class-points 驗證過的實作）。
 * 真正的認證全在後端（HttpOnly session cookie），這裡只做三件事：
 * 問後端「現在是誰」、把 Google ID token 交給後端驗、叫後端清 cookie。
 */

import { API } from './config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisLoading = null;

async function getJson(path) {
  try {
    const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const type = res.headers.get('Content-Type') || '';
    if (!type.includes('application/json')) return null; // 純靜態伺服器回的 404 HTML
    return { status: res.status, body: await res.json() };
  } catch {
    return null;
  }
}

export async function fetchServerConfig() {
  const r = await getJson(`${API.auth}/config`);
  return r ? r.body : null;
}

function loadGis() {
  if (globalThis.google?.accounts?.id) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = GIS_SRC;
    el.async = true;
    el.onload = resolve;
    el.onerror = () => {
      gisLoading = null;
      reject(new Error('載不到 Google 登入元件，請檢查網路後再試。'));
    };
    document.head.appendChild(el);
  });
  return gisLoading;
}

/** 目前登入者 { userId, email }；未登入回 null；非主人回 { forbidden: true }。 */
export async function currentUser() {
  const r = await getJson(`${API.auth}/me`);
  if (!r) return null;
  if (r.status === 403) return { forbidden: true };
  if (r.status !== 200 || !r.body?.signedIn) return null;
  return { userId: r.body.userId, email: r.body.email || '' };
}

/** 在容器畫出 Google 官方按鈕；ID token 只送同網域後端換 HttpOnly session。 */
export async function mountGoogleSignIn(container, config, { onDone } = {}) {
  if (!container || !config?.clientId || !config?.nonce) {
    throw new Error('Google 登入設定不完整。');
  }
  await loadGis();
  globalThis.google.accounts.id.initialize({
    client_id: config.clientId,
    nonce: config.nonce,
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: async ({ credential } = {}) => {
      if (!credential) return;
      container.setAttribute('aria-busy', 'true');
      try {
        const res = await fetch(`${API.auth}/google`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ credential }),
        });
        if (res.status === 403) throw new Error('這個 Google 帳號不是書齋主人，無法進入。');
        if (!res.ok) throw new Error('身分驗證失敗，請再試一次。');
        if (onDone) onDone();
        else window.location.reload();
      } catch (err) {
        container.removeAttribute('aria-busy');
        container.dispatchEvent(new CustomEvent('loginerror', { detail: err }));
      }
    },
  });
  globalThis.google.accounts.id.renderButton(container, {
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    locale: 'zh_TW',
  });
}

export async function logout() {
  try {
    await fetch(`${API.auth}/logout`, { method: 'POST', credentials: 'same-origin' });
  } catch {
    // 連不上也照樣重載，不要卡在登不出去的畫面
  }
  window.location.reload();
}
