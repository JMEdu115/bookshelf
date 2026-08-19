/*
 * 雲端書齋（Bookshelf Template）前端。
 * 單頁視圖：書架（含篩選）、建檔／編輯、主題檢索、竹林七賢導讀、垃圾桶。
 * 支援雙模式：
 * 1. 訪客示範模式（Demo Mode）：免登入，預載七賢示範藏書，於瀏覽器端體驗全功能。
 * 2. 主人模式（Owner Mode）：Google Identity 驗證 + Cloudflare Pages + Turso libSQL 雲端私有資料庫。
 */

import { currentUser, fetchServerConfig, mountGoogleSignIn, logout } from './auth.js';
import { listBooks, listTrash, exportBooks, createBook, updateBook, deleteBook, restoreBook } from './api.js';
import { lookupIsbn, isValidIsbn, looksLikeIsbn, parseYear } from './isbn.js';
import { scanIsbn, scanSupported } from './scan.js';
import { renderSagesView } from './sages.js';
import { DEMO_BOOKS } from './demo-data.js';

const app = document.getElementById('app');
let books = [];
let trashBooks = [];
let view = { name: 'shelf' }; // shelf | detail | edit | search | sages | trash
let shelfFilter = { q: '', status: '', kind: '', topic: '' };
let searchQuery = '';
let offline = false;

const CACHE_KEY = 'bs_books_cache';
const DRAFT_KEY = 'bs_draft';
const DEMO_MODE_KEY = 'bs_demo_mode';
const DEMO_BOOKS_KEY = 'bs_demo_books';
const DEMO_TRASH_KEY = 'bs_demo_trash';
const STALE_DAYS = 90; // 讀畢超過這天數沒複習就算「久未複習」

/* ---- 示範模式資料存取 ---- */

function isDemoMode() {
  return localStorage.getItem(DEMO_MODE_KEY) === 'true';
}

function setDemoMode(active) {
  if (active) localStorage.setItem(DEMO_MODE_KEY, 'true');
  else localStorage.removeItem(DEMO_MODE_KEY);
}

function loadDemoBooks() {
  try {
    const raw = localStorage.getItem(DEMO_BOOKS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {}
  localStorage.setItem(DEMO_BOOKS_KEY, JSON.stringify(DEMO_BOOKS));
  return JSON.parse(JSON.stringify(DEMO_BOOKS));
}

function saveDemoBooks(list) {
  localStorage.setItem(DEMO_BOOKS_KEY, JSON.stringify(list));
}

function loadDemoTrash() {
  try {
    const raw = localStorage.getItem(DEMO_TRASH_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveDemoTrash(list) {
  localStorage.setItem(DEMO_TRASH_KEY, JSON.stringify(list));
}

/* ---- 小工具 ---- */

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const STATUS_LABEL = {
  unread: '未讀', reading: '閱讀中', done: '讀畢',
  reference: '工具書', lost: '遺失', given: '已轉贈',
};
const KIND_LABEL = { physical: '實體書', ebook: '電子書' };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 主題正規化——跟後端同一套（NFKC＋去空白），比對前都先過這關。 */
function normTopic(t) {
  return String(t ?? '').normalize('NFKC').replace(/[\s　]+/g, '');
}

function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function bookById(id) {
  return books.find((b) => b.id === id) || null;
}

function allTopics() {
  const set = new Set();
  for (const b of books) for (const t of (b.topics || [])) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

function allLocations() {
  const set = new Set();
  for (const b of books) if (b.location) set.add(b.location);
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

/** 讀畢／工具書超過 STALE_DAYS 沒複習 = 該回顧了。 */
function isStale(book) {
  if (book.status !== 'done' && book.status !== 'reference') return false;
  const base = book.last_reviewed_at || book.finish_date || (book.updated_at || '').slice(0, 10);
  if (!base) return true;
  const days = (Date.now() - new Date(base).getTime()) / 86400000;
  return days > STALE_DAYS;
}

function coverHtml(book, cls) {
  if (book.cover_url) {
    return `<img class="${cls}" src="${esc(book.cover_url)}" alt="${esc(book.title)} 封面" loading="lazy" referrerpolicy="no-referrer">`;
  }
  return `<div class="${cls}">${esc(book.title.slice(0, 12))}</div>`;
}

/** 著錄字串：作者 著、譯者 譯。 */
function creatorsLine(book) {
  const parts = [];
  if (book.authors) parts.push(book.authors);
  if (book.translator) parts.push(`${book.translator} 譯`);
  return parts.join('，');
}

/**
 * 完整引文（中文引註慣例：作者、譯者、書名、出版社、出版年、頁碼）。
 * kind = 'gist' 的大意摘要不加引號，避免被誤當逐字引用。
 */
function citation(hl, book) {
  const src = [];
  src.push(`《${book.title}》`);
  const creators = creatorsLine(book);
  if (creators) src.push(creators);
  if (book.publisher) src.push(book.publisher);
  if (book.published_year) src.push(`${book.published_year} 年`);
  if (hl.page) src.push(`p.${hl.page}`);
  const text = hl.kind === 'gist' ? `${hl.text}（大意摘述）` : `「${hl.text}」`;
  return `${text}——${src.join('，')}`;
}

/* ---- 離線快取與草稿 ---- */

function cacheBooks() {
  if (isDemoMode()) {
    saveDemoBooks(books);
    return;
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(books));
  } catch { /* 空間滿就算了，快取是輔助 */ }
}

function loadCachedBooks() {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function saveDraft() {
  if (!draft) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* ignore */ }
}

function clearDraft() {
  draft = null;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch { /* ignore */ }
}

function loadDraft(forKey) {
  try {
    const v = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (v && v._for === forKey) return v;
  } catch { /* ignore */ }
  return null;
}

/* ---- 登入畫面 ---- */

async function renderLogin(reason) {
  app.innerHTML = `
    <div class="login-hero">
      <div class="login-badge">🎋 開源國風個人藏書整理系統</div>
      <h1>雲端書齋</h1>
      <p>個人藏書整理系統——ISBN 快速建檔、位置與主題管理、心得與重點摘記、竹林七賢導讀與引經據典。</p>
      ${reason ? `<p class="login-error">${esc(reason)}</p>` : ''}
      <div class="login-actions">
        <button type="button" class="btn primary btn-demo" id="enter-demo-btn">🎲 進入訪客示範模式（免登入試用）</button>
        <div class="login-divider"><span>或使用主人 Google 帳號登入</span></div>
        <div id="gsi-btn"></div>
      </div>
      <p id="login-msg" class="login-error" hidden></p>
      <div class="template-footer">
        <a href="https://github.com/hk6429/bookshelf-template" target="_blank" rel="noopener">📦 取得開源模版與 5 分鐘部署指南 →</a>
      </div>
    </div>`;

  document.getElementById('enter-demo-btn').addEventListener('click', () => {
    setDemoMode(true);
    books = loadDemoBooks();
    render({ email: '訪客示範模式', isDemo: true });
  });

  const config = await fetchServerConfig();
  const btn = document.getElementById('gsi-btn');
  const msg = document.getElementById('login-msg');
  if (!config?.configured) {
    btn.innerHTML = `<span style="font-size:0.85rem; color:var(--muted);">（後端尚未設定 Google Client ID，請點擊上方按鈕體驗示範模式）</span>`;
    return;
  }
  btn.addEventListener('loginerror', (e) => {
    msg.textContent = e.detail?.message || '登入失敗';
    msg.hidden = false;
  });
  try {
    await mountGoogleSignIn(btn, config);
  } catch (err) {
    msg.textContent = err.message;
    msg.hidden = false;
  }
}

/* ---- 版頭與路由 ---- */

function shell(user, inner) {
  return `
    <header class="top">
      <span class="brand">📚 雲端書齋</span>
      <nav class="tabs">
        <button data-nav="shelf" class="${view.name === 'shelf' || view.name === 'detail' ? 'active' : ''}">書架</button>
        <button data-nav="search" class="${view.name === 'search' ? 'active' : ''}">主題檢索</button>
        <button data-nav="sages" class="${view.name === 'sages' ? 'active' : ''}">🎋 竹林七賢</button>
        <button data-nav="new" class="${view.name === 'edit' ? 'active' : ''}">＋ 新增藏書</button>
      </nav>
      <span class="userbox">
        <span class="user-email">${esc(user.email)}</span>
        <button data-act="logout">${user.isDemo ? '結束示範' : '登出'}</button>
      </span>
    </header>
    ${user.isDemo ? `
      <div class="demo-bar">
        <span>🏮 <strong>訪客示範體驗模式</strong>（功能全開放，資料僅保存在本機）</span>
        <button class="linklike" id="reset-demo-btn" style="color:#fff; text-decoration:underline;">↺ 重設示範資料</button>
        <a href="https://github.com/hk6429/bookshelf-template" target="_blank" rel="noopener" style="color:#ffdf9e; margin-left:0.6rem;">📦 取得開源模版 →</a>
      </div>
    ` : offline ? '<div class="offline-bar">離線瀏覽中——顯示的是上次載入的資料，恢復連線後請重新整理。</div>' : ''}
    <main>${inner}</main>`;
}

function render(user) {
  let inner = '';
  if (view.name === 'shelf') inner = renderShelf();
  else if (view.name === 'detail') inner = renderDetail(view.id);
  else if (view.name === 'edit') inner = renderEditShell();
  else if (view.name === 'search') inner = renderSearch();
  else if (view.name === 'sages') inner = renderSagesView(books);
  else if (view.name === 'trash') inner = renderTrash();
  app.innerHTML = shell(user, inner);
  // 封面圖掛掉（外站 404/429）就退回書名色塊，不留破圖
  app.querySelectorAll('img.cover, img.cover-lg').forEach((img) => {
    img.addEventListener('error', () => {
      const div = document.createElement('div');
      div.className = img.className;
      div.textContent = (img.alt || '').replace(/ 封面$/, '').slice(0, 12);
      img.replaceWith(div);
    });
  });
  bindShell(user);
  if (view.name === 'shelf') bindShelf(user);
  else if (view.name === 'detail') bindDetail(user);
  else if (view.name === 'edit') bindEdit(user);
  else if (view.name === 'search') bindSearch(user);
  else if (view.name === 'sages') bindSages(user);
  else if (view.name === 'trash') bindTrash(user);
}

function bindShell(user) {
  app.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.nav;
      if (nav === 'shelf') view = { name: 'shelf' };
      if (nav === 'search') view = { name: 'search' };
      if (nav === 'sages') view = { name: 'sages' };
      if (nav === 'new') view = { name: 'edit', id: null };
      render(user);
    });
  });
  app.querySelector('[data-act="logout"]').addEventListener('click', () => {
    if (user.isDemo) {
      setDemoMode(false);
      renderLogin();
    } else {
      logout();
    }
  });
  document.getElementById('reset-demo-btn')?.addEventListener('click', () => {
    books = JSON.parse(JSON.stringify(DEMO_BOOKS));
    saveDemoBooks(books);
    saveDemoTrash([]);
    toast('已重設為預設示範藏書');
    render(user);
  });
}

function bindSages(user) {
  app.querySelectorAll('[data-search-kw]').forEach((btn) => {
    btn.addEventListener('click', () => {
      searchQuery = btn.dataset.searchKw || '';
      view = { name: 'search' };
      render(user);
    });
  });
  app.querySelectorAll('[data-sage-search]').forEach((btn) => {
    btn.addEventListener('click', () => {
      searchQuery = btn.dataset.sageSearch || '';
      view = { name: 'search' };
      render(user);
    });
  });
}

/* ---- 書架 ---- */

function matchShelf(book) {
  const q = shelfFilter.q.trim().toLowerCase();
  if (q) {
    const hay = `${book.title} ${book.authors} ${book.translator} ${book.publisher} ${book.series} ${book.location} ${(book.topics || []).join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (shelfFilter.status === 'stale') {
    if (!isStale(book)) return false;
  } else if (shelfFilter.status === 'lent') {
    if (!book.lend_to) return false;
  } else if (shelfFilter.status && book.status !== shelfFilter.status) {
    return false;
  }
  if (shelfFilter.kind && book.location_kind !== shelfFilter.kind) return false;
  if (shelfFilter.topic && !(book.topics || []).includes(shelfFilter.topic)) return false;
  return true;
}

function bookCard(book) {
  return `
    <article class="book-card" data-id="${esc(book.id)}">
      ${coverHtml(book, 'cover')}
      <div>
        <h3>${esc(book.title)}</h3>
        <p class="meta">${esc(creatorsLine(book))}</p>
        <p class="meta">${KIND_LABEL[book.location_kind] || ''}${book.location ? '｜' + esc(book.location) : ''}</p>
        <span class="badge status-${esc(book.status)}">${STATUS_LABEL[book.status] || ''}</span>
        ${book.lend_to ? `<span class="badge lent">外借：${esc(book.lend_to)}</span>` : ''}
        ${isStale(book) ? '<span class="badge stale">該複習了</span>' : ''}
        ${(book.topics || []).slice(0, 3).map((t) => `<span class="badge topic">${esc(t)}</span>`).join('')}
      </div>
    </article>`;
}

function renderShelf() {
  const shown = books.filter(matchShelf);
  const topics = allTopics();
  return `
    <div class="view-hero-banner shelf-banner">
      <img src="/icons/sages/shelf_banner.jpg" alt="雲端書齋・典藏閣" class="view-hero-img">
      <div class="view-hero-overlay">
        <h2>🌿 雲端書齋・藏書閣</h2>
        <p>竹影弄書頁，清風拂墨香。目前典藏 <strong>${books.length}</strong> 部書籍。</p>
      </div>
    </div>
    <div class="toolbar">
      <input type="search" id="shelf-q" placeholder="搜尋書名／作者／位置…" value="${esc(shelfFilter.q)}">
      <select id="shelf-status" aria-label="狀態篩選">
        <option value="">所有狀態</option>
        ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${shelfFilter.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        <option value="lent" ${shelfFilter.status === 'lent' ? 'selected' : ''}>外借中</option>
        <option value="stale" ${shelfFilter.status === 'stale' ? 'selected' : ''}>久未複習</option>
      </select>
      <select id="shelf-kind" aria-label="形式篩選">
        <option value="">實體＋電子</option>
        ${Object.entries(KIND_LABEL).map(([v, l]) => `<option value="${v}" ${shelfFilter.kind === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <button type="button" class="btn secondary" id="export-btn" title="下載全部藏書 JSON 備份">匯出備份</button>
      <button type="button" class="btn secondary" id="trash-btn">垃圾桶</button>
    </div>
    ${topics.length ? `<div class="chips">
      <span class="chip ${shelfFilter.topic === '' ? 'active' : ''}" data-topic="" role="button" tabindex="0">全部主題</span>
      ${topics.map((t) => `<span class="chip ${shelfFilter.topic === t ? 'active' : ''}" data-topic="${esc(t)}" role="button" tabindex="0">${esc(t)}</span>`).join('')}
    </div>` : ''}
    ${shown.length
      ? `<div class="grid">${shown.map(bookCard).join('')}</div>`
      : `<div class="empty">${books.length ? '沒有符合條件的書。' : '書齋還是空的——按上方「＋ 新增藏書」，輸入 ISBN 就能快速建檔。'}</div>`}
  `;
}

function bindShelf(user) {
  const q = document.getElementById('shelf-q');
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      shelfFilter.q = q.value;
      render(user);
      const nq = document.getElementById('shelf-q');
      nq.focus();
      nq.setSelectionRange(nq.value.length, nq.value.length);
    }, 250);
  });
  document.getElementById('shelf-status').addEventListener('change', (e) => {
    shelfFilter.status = e.target.value;
    render(user);
  });
  document.getElementById('shelf-kind').addEventListener('change', (e) => {
    shelfFilter.kind = e.target.value;
    render(user);
  });
  document.getElementById('export-btn').addEventListener('click', async () => {
    try {
      let data;
      if (user.isDemo) {
        data = { exported_at: new Date().toISOString(), books, trash: loadDemoTrash() };
      } else {
        data = await exportBooks();
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bookshelf-backup-${today()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('備份檔已下載');
    } catch (err) {
      toast(`匯出失敗：${err.message}`);
    }
  });
  document.getElementById('trash-btn').addEventListener('click', async () => {
    try {
      if (user.isDemo) {
        trashBooks = loadDemoTrash();
      } else {
        trashBooks = await listTrash();
      }
      view = { name: 'trash' };
      render(user);
    } catch (err) {
      toast(`讀取垃圾桶失敗：${err.message}`);
    }
  });
  app.querySelectorAll('.chips [data-topic]').forEach((chip) => {
    const apply = () => {
      shelfFilter.topic = chip.dataset.topic;
      render(user);
    };
    chip.addEventListener('click', apply);
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(); }
    });
  });
  app.querySelectorAll('.book-card').forEach((card) => {
    card.addEventListener('click', () => {
      view = { name: 'detail', id: card.dataset.id };
      render(user);
    });
  });
}

/* ---- 垃圾桶 ---- */

function renderTrash() {
  return `
    <div class="trash-head">
      <h2>垃圾桶</h2>
      <p>誤刪的書可以在這裡救回；目前保留 ${trashBooks.length} 本。</p>
      <button type="button" class="btn secondary" id="back-to-shelf">← 回到書架</button>
    </div>
    ${trashBooks.length === 0 ? '<div class="empty">垃圾桶空空如也。</div>' : `
      <div class="trash-list">
        ${trashBooks.map((b) => `
          <div class="trash-item">
            ${coverHtml(b, 'cover-sm')}
            <div class="trash-info">
              <strong>${esc(b.title)}</strong>
              <p class="meta">${esc(creatorsLine(b))}｜刪除時間：${esc((b.deleted_at || '').slice(0, 10))}</p>
            </div>
            <button type="button" class="btn primary small" data-restore="${esc(b.id)}">還原</button>
          </div>`).join('')}
      </div>
    `}
  `;
}

function bindTrash(user) {
  document.getElementById('back-to-shelf').addEventListener('click', () => {
    view = { name: 'shelf' };
    render(user);
  });
  app.querySelectorAll('[data-restore]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.restore;
      try {
        if (user.isDemo) {
          const t = loadDemoTrash();
          const target = t.find((x) => x.id === id);
          if (target) {
            delete target.deleted_at;
            books.unshift(target);
            saveDemoBooks(books);
            saveDemoTrash(t.filter((x) => x.id !== id));
            trashBooks = loadDemoTrash();
          }
        } else {
          await restoreBook(id);
          books = await listBooks();
          cacheBooks();
          trashBooks = await listTrash();
        }
        toast('已還原到書架');
        render(user);
      } catch (err) {
        toast(`還原失敗：${err.message}`);
      }
    });
  });
}

/* ---- 詳細資訊 ---- */

function renderDetail(id) {
  const b = bookById(id);
  if (!b) return `<div class="empty">找不到這本書。<button class="btn" data-act="back">回書架</button></div>`;
  const rels = (b.related || []).map((r) => {
    const target = bookById(r.id);
    return { ...r, title: target ? target.title : `（已刪除的書）` };
  });
  return `
    <article class="detail">
      <div class="head">
        ${coverHtml(b, 'cover-lg')}
        <div class="info">
          <h2>${esc(b.title)}</h2>
          <p class="meta">${esc(creatorsLine(b))}</p>
          <p class="meta">${esc(b.publisher || '')}${b.published_year ? `｜${b.published_year} 年` : ''}${b.edition ? `｜${esc(b.edition)}` : ''}</p>
          <p class="meta">${b.isbn ? `ISBN：${esc(b.isbn)}` : ''}${b.series ? `｜叢書：${esc(b.series)}` : ''}</p>
          <p class="meta">${KIND_LABEL[b.location_kind] || ''}${b.location ? `｜位置：${esc(b.location)}` : ''}</p>
          <p>
            <span class="badge status-${esc(b.status)}">${STATUS_LABEL[b.status] || ''}</span>
            ${b.lend_to ? `<span class="badge lent">外借給 ${esc(b.lend_to)}${b.lend_date ? `（${esc(b.lend_date)}）` : ''}</span>` : ''}
            ${b.start_date || b.finish_date ? `<span class="badge dates">${esc(b.start_date || '—')} ～ ${esc(b.finish_date || '—')}</span>` : ''}
          </p>
          <p>${(b.topics || []).map((t) => `<span class="badge topic">${esc(t)}</span>`).join('')}</p>
          <div class="actions">
            <button type="button" class="btn" id="edit-btn">編輯</button>
            <button type="button" class="btn secondary" id="back-btn">回書架</button>
            <button type="button" class="btn danger" id="delete-btn">移至垃圾桶</button>
          </div>
        </div>
      </div>
      ${b.description ? `<section class="sec"><h3>簡介</h3><p class="desc">${esc(b.description)}</p></section>` : ''}
      ${b.key_question || b.reading_reason ? `
        <section class="sec">
          <h3>起心動念</h3>
          ${b.key_question ? `<p><strong>核心提問：</strong>${esc(b.key_question)}</p>` : ''}
          ${b.reading_reason ? `<p><strong>閱讀動機：</strong>${esc(b.reading_reason)}</p>` : ''}
        </section>` : ''}
      ${b.audience ? `<section class="sec"><h3>推薦對象</h3><p>${esc(b.audience)}</p></section>` : ''}
      ${b.review ? `<section class="sec"><h3>讀後心得</h3><p class="review">${esc(b.review)}</p></section>` : ''}
      ${(b.review_log || []).length ? `
        <section class="sec">
          <h3>覆盤紀錄</h3>
          <ul class="log-list">${b.review_log.map((x) => `<li><span class="log-date">${esc(x.date)}</span>${esc(x.text)}</li>`).join('')}</ul>
        </section>` : ''}
      ${(b.actions || []).length ? `
        <section class="sec">
          <h3>行動清單</h3>
          <ul class="action-list">${b.actions.map((x) => `<li><span class="log-date">${esc(x.date)}</span>${esc(x.text)}</li>`).join('')}</ul>
        </section>` : ''}
      ${(b.highlights || []).length ? `
        <section class="sec">
          <h3>重點摘記（${b.highlights.length}）</h3>
          ${b.highlights.map((h, i) => `
            <div class="hl-card">
              <p class="hl-text">${h.kind === 'gist' ? '<em class="gist-mark">（大意）</em> ' : ''}${esc(h.text)}</p>
              ${h.my_take ? `<p class="hl-take">💭 ${esc(h.my_take)}</p>` : ''}
              <div class="hl-foot">
                <span>${h.page ? `p.${esc(h.page)}` : ''} ${(h.tags || []).map((t) => `<span class="badge topic">${esc(t)}</span>`).join('')}</span>
                <button type="button" class="btn secondary small" data-copy-hl="${i}">複製引文</button>
              </div>
            </div>`).join('')}
        </section>` : ''}
      ${rels.length ? `
        <section class="sec">
          <h3>關聯閱讀</h3>
          <ul class="rel-list">${rels.map((r) => `<li><a href="#" data-goto="${esc(r.id)}">${esc(r.title)}</a>${r.note ? ` — ${esc(r.note)}` : ''}</li>`).join('')}</ul>
        </section>` : ''}
    </article>
  `;
}

function bindDetail(user) {
  const b = bookById(view.id);
  app.querySelector('#edit-btn')?.addEventListener('click', () => {
    view = { name: 'edit', id: b.id };
    render(user);
  });
  app.querySelector('#back-btn')?.addEventListener('click', () => {
    view = { name: 'shelf' };
    render(user);
  });
  app.querySelector('#delete-btn')?.addEventListener('click', async () => {
    if (!confirm(`確定將《${b.title}》移到垃圾桶？可在垃圾桶還原。`)) return;
    try {
      if (user.isDemo) {
        const t = loadDemoTrash();
        t.unshift({ ...b, deleted_at: new Date().toISOString() });
        books = books.filter((x) => x.id !== b.id);
        saveDemoBooks(books);
        saveDemoTrash(t);
      } else {
        await deleteBook(b.id);
        books = books.filter((x) => x.id !== b.id);
        cacheBooks();
      }
      toast('已移至垃圾桶');
      view = { name: 'shelf' };
      render(user);
    } catch (err) {
      toast(`刪除失敗：${err.message}`);
    }
  });
  app.querySelectorAll('[data-copy-hl]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const h = b.highlights[Number(btn.dataset.copyHl)];
      const text = citation(h, b);
      try {
        await navigator.clipboard.writeText(text);
        toast('已複製引文（含完整出處）');
      } catch {
        toast('複製失敗，請手動選取');
      }
    });
  });
  app.querySelectorAll('[data-goto]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      view = { name: 'detail', id: a.dataset.goto };
      render(user);
    });
  });
}

/* ---- 建檔／編輯 ---- */

let draft = null; // 表單工作副本

function blankBook() {
  return {
    isbn: '', title: '', authors: '', translator: '', publisher: '', published: '',
    published_year: 0, series: '', edition: '', cover_url: '',
    description: '', location_kind: 'physical', location: '', start_date: '', finish_date: '',
    status: 'unread', lend_to: '', lend_date: '', reading_reason: '', key_question: '',
    last_reviewed_at: '', topics: [], audience: '', review: '', review_log: [], actions: [],
    highlights: [], related: [],
  };
}

function renderEditShell() {
  const forKey = view.id || 'new';
  const editing = view.id ? bookById(view.id) : null;
  if (!draft || draft._for !== forKey) {
    draft = loadDraft(forKey)
      || (editing ? JSON.parse(JSON.stringify({ ...blankBook(), ...editing })) : blankBook());
    draft._for = forKey;
  }
  const b = draft;
  const otherBooks = books.filter((x) => x.id !== view.id);
  const relOptions = (selected) => `
    <option value="">— 選一本館內藏書 —</option>
    ${otherBooks.map((x) => `<option value="${esc(x.id)}" ${selected === x.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}`;
  const logEditor = (key, list, addId, addLabel, placeholder) => `
    <div class="log-editor" id="${key}-editor">
      ${list.map((e, i) => `
        <div class="log-item">
          <input type="date" data-${key}-date="${i}" value="${esc(e.date)}">
          <textarea rows="2" data-${key}-text="${i}" placeholder="${placeholder}">${esc(e.text)}</textarea>
          <button type="button" class="btn danger small" data-rm-${key}="${i}">刪</button>
        </div>`).join('')}
      <button type="button" class="btn secondary small" id="${addId}">${addLabel}</button>
    </div>`;

  return `
    <div class="view-hero-banner edit-banner">
      <img src="/icons/sages/edit_banner.jpg" alt="雲端書齋・藏書建檔" class="view-hero-img">
      <div class="view-hero-overlay">
        <h2>📖 ${view.id ? '修訂藏書記錄' : '雲端書齋・新書入庫'}</h2>
        <p>${view.id ? '修訂書籍資料、閱讀進度、心得與重點摘記。' : '輸入 ISBN 快速自動帶入書目，或手動登記自選藏書與閱讀筆記。'}</p>
      </div>
    </div>
    <form class="book-form" id="book-form">
      <div class="isbn-row">
        <strong>ISBN 快速建檔</strong>
        <div class="isbn-controls">
          <input id="isbn-input" inputmode="numeric" autocomplete="off" placeholder="輸入 ISBN（例：9789573287674）" value="${esc(b.isbn)}">
          <button type="button" class="btn" id="isbn-lookup">查詢帶入</button>
          <button type="button" class="btn secondary" id="isbn-scan" title="用相機掃書背條碼">📷 掃條碼</button>
        </div>
        <p class="isbn-hint" id="isbn-hint">查 Google Books／Open Library；台版書若查不到，直接手動填寫下方欄位即可。</p>
      </div>
      <div class="form-grid">
        <div class="field wide"><label>書名（必填）</label><input name="title" required value="${esc(b.title)}"></div>
        <div class="field"><label>作者</label><input name="authors" value="${esc(b.authors)}"></div>
        <div class="field"><label>譯者</label><input name="translator" value="${esc(b.translator)}"></div>
        <div class="field"><label>出版社</label><input name="publisher" value="${esc(b.publisher)}"></div>
        <div class="field"><label>出版日期</label><input name="published" placeholder="例：2020-05" value="${esc(b.published)}"></div>
        <div class="field"><label>出版年（排序用）</label><input name="published_year" inputmode="numeric" placeholder="例：2020" value="${b.published_year || ''}"></div>
        <div class="field"><label>叢書</label><input name="series" value="${esc(b.series)}"></div>
        <div class="field"><label>版次</label><input name="edition" placeholder="例：二版" value="${esc(b.edition)}"></div>
        <div class="field"><label>封面圖網址（https）</label><input name="cover_url" value="${esc(b.cover_url)}"></div>
        <div class="field"><label>形式</label>
          <select name="location_kind">
            ${Object.entries(KIND_LABEL).map(([v, l]) => `<option value="${v}" ${b.location_kind === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <div class="field"><label>位置（書架編號／電子書平台）</label><input name="location" list="loc-list" value="${esc(b.location)}">
          <datalist id="loc-list">${allLocations().map((l) => `<option value="${esc(l)}">`).join('')}</datalist></div>
        <div class="field"><label>狀態</label>
          <select name="status">
            ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${b.status === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <div class="field"><label>開讀日</label><input type="date" name="start_date" value="${esc(b.start_date)}"></div>
        <div class="field"><label>讀畢日</label><input type="date" name="finish_date" value="${esc(b.finish_date)}"></div>
        <div class="field"><label>借給誰</label><input name="lend_to" value="${esc(b.lend_to)}"></div>
        <div class="field"><label>借出日期</label><input type="date" name="lend_date" value="${esc(b.lend_date)}"></div>
        <div class="field"><label>最近複習日</label><input type="date" name="last_reviewed_at" value="${esc(b.last_reviewed_at)}"></div>
      </div>
      <div class="field wide"><label>簡介</label><textarea name="description" rows="3">${esc(b.description)}</textarea></div>
      <div class="field wide"><label>主題標籤</label>
        <div class="tag-input-area" id="topic-tags">
          ${(b.topics || []).map((t, i) => `<span class="tag">${esc(t)}<button type="button" data-rm-topic="${i}" aria-label="移除 ${esc(t)}">×</button></span>`).join('')}
          <input id="topic-add-input" list="topic-list" placeholder="輸入主題後按 Enter 新增">
          <datalist id="topic-list">${allTopics().map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
        </div>
      </div>
      <div class="field wide"><label>起心動念・核心提問</label><input name="key_question" placeholder="這本書要幫我解決什麼問題？" value="${esc(b.key_question)}"></div>
      <div class="field wide"><label>起心動念・閱讀動機</label><input name="reading_reason" placeholder="為什麼在現在這個時間點讀？" value="${esc(b.reading_reason)}"></div>
      <div class="field wide"><label>推薦對象</label><input name="audience" placeholder="讀完覺得適合推薦給誰？例：國二導師、準備會考的學生" value="${esc(b.audience)}"></div>
      <div class="field wide"><label>讀後心得</label><textarea name="review" rows="5" placeholder="自由書寫你的評論、摘要或感悟…">${esc(b.review)}</textarea></div>
      <div class="field wide"><label>覆盤紀錄（間隔重複回顧）</label>${logEditor('review_log', b.review_log || [], 'add-review-log', '＋ 新增覆盤紀錄', '寫下本次覆盤的新體會')}</div>
      <div class="field wide"><label>行動清單（讀完這本書要採取什麼行動）</label>${logEditor('actions', b.actions || [], 'add-action', '＋ 新增行動', '要做什麼、產出什麼、怎麼落地')}</div>
      <div class="field wide">
        <label>重點摘記（金句、關鍵論點，附頁碼）</label>
        <div class="hl-editor" id="hl-editor">
          ${(b.highlights || []).map((h, i) => `
            <div class="hl-item">
              <div class="hl-main">
                <textarea rows="3" data-hl-text="${i}" placeholder="摘錄原文或寫大意">${esc(h.text)}</textarea>
                <input data-hl-take="${i}" placeholder="💭 我的反思／想法（選填）" value="${esc(h.my_take || '')}">
              </div>
              <div class="hl-side">
                <select data-hl-kind="${i}">
                  <option value="exact" ${h.kind !== 'gist' ? 'selected' : ''}>逐字引用</option>
                  <option value="gist" ${h.kind === 'gist' ? 'selected' : ''}>大意摘要</option>
                </select>
                <input data-hl-page="${i}" placeholder="頁碼（例：42）" value="${esc(h.page || '')}">
                <input data-hl-tags="${i}" placeholder="主題標籤（逗點分隔）" value="${esc((h.tags || []).join(','))}">
                <button type="button" class="btn danger small" data-rm-hl="${i}">刪</button>
              </div>
            </div>`).join('')}
          <button type="button" class="btn secondary small" id="add-hl">＋ 新增重點摘記</button>
        </div>
      </div>
      <div class="field wide">
        <label>關聯閱讀（館內相呼應的藏書）</label>
        <div class="rel-editor" id="rel-editor">
          ${(b.related || []).map((r, i) => `
            <div class="rel-item">
              <select data-rel-id="${i}">${relOptions(r.id)}</select>
              <input data-rel-note="${i}" placeholder="關聯說明（例：同主題不同流派）" value="${esc(r.note || '')}">
              <button type="button" class="btn danger small" data-rm-rel="${i}">刪</button>
            </div>`).join('')}
          ${otherBooks.length ? `<button type="button" class="btn secondary small" id="add-rel">＋ 新增關聯書</button>` : `<p class="field-hint">館內只有這本書時無法建立關聯，多建幾本後即可串聯。</p>`}
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn primary">儲存</button>
        <button type="button" class="btn secondary" id="cancel-edit">取消</button>
      </div>
    </form>`;
}

function bindEdit(user) {
  const form = document.getElementById('book-form');
  const harvestForm = () => {
    if (!draft) return;
    const fd = new FormData(form);
    for (const k of ['title', 'authors', 'translator', 'publisher', 'published', 'series', 'edition',
      'cover_url', 'description', 'location_kind', 'location', 'start_date', 'finish_date',
      'status', 'lend_to', 'lend_date', 'reading_reason', 'key_question', 'last_reviewed_at', 'review', 'audience']) {
      draft[k] = (fd.get(k) || '').toString().trim();
    }
    const py = parseInt(fd.get('published_year'), 10);
    draft.published_year = Number.isFinite(py) ? py : 0;
    saveDraft();
  };

  const lookupBtn = document.getElementById('isbn-lookup');
  const isbnInput = document.getElementById('isbn-input');
  const hint = document.getElementById('isbn-hint');

  lookupBtn.addEventListener('click', async () => {
    harvestForm();
    const raw = isbnInput.value.trim();
    if (!raw) return;
    if (!looksLikeIsbn(raw)) {
      hint.textContent = 'ISBN 格式似乎不對（應為 10 碼或 13 碼數字）。';
      return;
    }
    if (!isValidIsbn(raw)) {
      hint.textContent = 'ISBN 檢查碼不正確，請核對是否有錯字。';
      return;
    }
    lookupBtn.disabled = true;
    hint.textContent = '查詢書目中…';
    try {
      const meta = await lookupIsbn(raw);
      draft.isbn = meta.isbn || raw;
      if (meta.title && !draft.title) draft.title = meta.title;
      if (meta.authors && !draft.authors) draft.authors = meta.authors;
      if (meta.publisher && !draft.publisher) draft.publisher = meta.publisher;
      if (meta.published && !draft.published) draft.published = meta.published;
      if (meta.published_year && !draft.published_year) draft.published_year = meta.published_year;
      if (meta.description && !draft.description) draft.description = meta.description;
      if (meta.cover_url && !draft.cover_url) draft.cover_url = meta.cover_url;
      if (meta.topics?.length) {
        const merged = new Set([...(draft.topics || []), ...meta.topics]);
        draft.topics = [...merged];
      }
      saveDraft();
      hint.textContent = meta.title ? `已帶入《${meta.title}》資訊！` : '查無詳細書目，請手動填寫。';
      render(user);
    } catch (err) {
      hint.textContent = `查詢失敗：${err.message}`;
    } finally {
      lookupBtn.disabled = false;
    }
  });

  const scanBtn = document.getElementById('isbn-scan');
  if (!scanSupported()) {
    scanBtn.title = '此瀏覽器不支援相機掃碼';
    scanBtn.disabled = true;
  } else {
    scanBtn.addEventListener('click', async () => {
      harvestForm();
      try {
        const scanned = await scanIsbn();
        isbnInput.value = scanned;
        draft.isbn = scanned;
        saveDraft();
        lookupBtn.click();
      } catch (err) {
        if (err.message !== 'cancelled') toast(`掃描失敗：${err.message}`);
      }
    });
  }

  const topicInput = document.getElementById('topic-add-input');
  topicInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const t = topicInput.value.trim();
      if (t) {
        harvestForm();
        if (!draft.topics) draft.topics = [];
        if (!draft.topics.includes(t)) draft.topics.push(t);
        saveDraft();
        render(user);
      }
    }
  });

  app.querySelectorAll('[data-rm-topic]').forEach((btn) => {
    btn.addEventListener('click', () => {
      harvestForm();
      draft.topics.splice(Number(btn.dataset.rmTopic), 1);
      saveDraft();
      render(user);
    });
  });

  document.getElementById('add-review-log').addEventListener('click', () => {
    harvestForm();
    if (!draft.review_log) draft.review_log = [];
    draft.review_log.push({ date: today(), text: '' });
    saveDraft();
    render(user);
  });

  app.querySelectorAll('[data-rm-review_log]').forEach((btn) => {
    btn.addEventListener('click', () => {
      harvestForm();
      draft.review_log.splice(Number(btn.dataset.rmReview_log), 1);
      saveDraft();
      render(user);
    });
  });

  document.getElementById('add-action').addEventListener('click', () => {
    harvestForm();
    if (!draft.actions) draft.actions = [];
    draft.actions.push({ date: today(), text: '' });
    saveDraft();
    render(user);
  });

  app.querySelectorAll('[data-rm-actions]').forEach((btn) => {
    btn.addEventListener('click', () => {
      harvestForm();
      draft.actions.splice(Number(btn.dataset.rmActions), 1);
      saveDraft();
      render(user);
    });
  });

  document.getElementById('add-hl').addEventListener('click', () => {
    harvestForm();
    if (!draft.highlights) draft.highlights = [];
    draft.highlights.push({ text: '', page: '', tags: [], my_take: '', kind: 'exact' });
    saveDraft();
    render(user);
  });

  app.querySelectorAll('[data-rm-hl]').forEach((btn) => {
    btn.addEventListener('click', () => {
      harvestForm();
      draft.highlights.splice(Number(btn.dataset.rmHl), 1);
      saveDraft();
      render(user);
    });
  });

  document.getElementById('add-rel')?.addEventListener('click', () => {
    harvestForm();
    if (!draft.related) draft.related = [];
    draft.related.push({ id: '', note: '' });
    saveDraft();
    render(user);
  });

  app.querySelectorAll('[data-rm-rel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      harvestForm();
      draft.related.splice(Number(btn.dataset.rmRel), 1);
      saveDraft();
      render(user);
    });
  });

  document.getElementById('cancel-edit').addEventListener('click', () => {
    clearDraft();
    view = view.id ? { name: 'detail', id: view.id } : { name: 'shelf' };
    render(user);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    harvestForm();
    if (!draft.title.trim()) {
      toast('書名必填');
      return;
    }
    const payload = { ...draft };
    delete payload._for;
    payload.highlights = (payload.highlights || []).filter((h) => h.text.trim());
    payload.review_log = (payload.review_log || []).filter((x) => x.text.trim());
    payload.actions = (payload.actions || []).filter((x) => x.text.trim());
    payload.related = (payload.related || []).filter((r) => r.id);

    try {
      let saved;
      if (user.isDemo) {
        if (view.id) {
          payload.id = view.id;
          payload.updated_at = new Date().toISOString();
          books = books.map((b) => (b.id === view.id ? { ...b, ...payload } : b));
          saved = payload;
        } else {
          payload.id = 'demo-' + Date.now();
          payload.created_at = new Date().toISOString();
          payload.updated_at = payload.created_at;
          books.unshift(payload);
          saved = payload;
        }
        saveDemoBooks(books);
      } else {
        if (view.id) {
          payload.updated_at = bookById(view.id)?.updated_at;
          saved = await updateBook(view.id, payload);
          books = books.map((b) => (b.id === saved.id ? saved : b));
        } else {
          saved = await createBook(payload);
          books.unshift(saved);
        }
        cacheBooks();
      }
      clearDraft();
      toast('已儲存藏書');
      view = { name: 'detail', id: saved.id };
      render(user);
    } catch (err) {
      if (err.code === 'duplicate_isbn' && err.existingId) {
        toast(err.message);
        clearDraft();
        view = { name: 'detail', id: err.existingId };
        render(user);
        return;
      }
      toast(`儲存失敗：${err.message}`);
    }
  });
}

/* ---- 主題檢索 ---- */

function searchLibrary(query) {
  const q = query.trim().toLowerCase();
  const qNorm = normTopic(query);
  if (!q) return { books: [], quotes: [] };
  const scored = [];
  for (const b of books) {
    let score = 0;
    if ((b.topics || []).some((t) => normTopic(t) === qNorm)) score += 5;
    else if (qNorm.length >= 2 && (b.topics || []).some((t) => normTopic(t).includes(qNorm))) score += 3;
    if (b.title.toLowerCase().includes(q)) score += 3;
    if (`${b.key_question || ''} ${b.reading_reason || ''}`.toLowerCase().includes(q)) score += 3;
    if (`${b.review || ''} ${b.audience || ''} ${(b.review_log || []).map((x) => x.text).join(' ')}`.toLowerCase().includes(q)) score += 2;
    if ((b.description || '').toLowerCase().includes(q)) score += 1;
    if ((b.highlights || []).some((h) => `${h.text} ${h.my_take || ''}`.toLowerCase().includes(q)
      || (h.tags || []).some((t) => normTopic(t) === qNorm))) score += 2;

    if (score > 0) scored.push({ book: b, score });
  }
  scored.sort((a, b) => b.score - a.score);

  const quotes = [];
  for (const b of scored.map((s) => s.book)) {
    for (const h of (b.highlights || [])) {
      const hay = `${h.text} ${h.my_take || ''} ${(h.tags || []).join(' ')}`.toLowerCase();
      const match = hay.includes(q) || (h.tags || []).some((t) => normTopic(t) === qNorm);
      quotes.push({ hl: h, book: b, hit: match });
    }
  }
  quotes.sort((a, b) => Number(b.hit) - Number(a.hit));
  return { books: scored.map((s) => s.book), quotes };
}

function highlightQuery(text, query) {
  const q = query.trim();
  if (!q) return esc(text);
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let out = '';
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(ql, i);
    if (at === -1) {
      out += esc(text.slice(i));
      break;
    }
    out += esc(text.slice(i, at)) + '<mark>' + esc(text.slice(at, at + q.length)) + '</mark>';
    i = at + q.length;
  }
  return out;
}

function renderSearch() {
  const { books: hits, quotes } = searchLibrary(searchQuery);
  const q = searchQuery.trim();
  return `
    <div class="view-hero-banner search-banner">
      <img src="/icons/sages/search_banner.jpg" alt="竹林書香檢索" class="view-hero-img">
      <div class="view-hero-overlay">
        <h2>🔍 主題檢索・引經據典</h2>
        <p>從你手頭上的藏書裡，找出相關的書與可引用的重點摘記。</p>
      </div>
    </div>
    <div class="search-hero">
      <input type="search" id="topic-q" placeholder="要準備什麼主題？例：班級經營、哲學思辨、散文隨筆…" value="${esc(searchQuery)}" autofocus>
      <p>輸入關鍵字檢索書名、作者、主題標籤、心得與重點摘記。</p>
      ${!q ? `
        <div class="search-sugg-box">
          <span class="sugg-label">💡 熱門靈感主題：</span>
          <div class="chips">
            <button type="button" class="chip" data-search-sugg="班級經營">班級經營</button>
            <button type="button" class="chip" data-search-sugg="哲學">哲學思辨</button>
            <button type="button" class="chip" data-search-sugg="散文">散文隨筆</button>
            <button type="button" class="chip" data-search-sugg="創意">創意靈感</button>
            <button type="button" class="chip" data-search-sugg="藝術">藝術美學</button>
            <button type="button" class="chip" data-search-sugg="管理">實戰管理</button>
            <button type="button" class="chip" data-search-sugg="筆記">讀書筆記</button>
          </div>
        </div>
      ` : ''}
    </div>
    ${!q ? '' : hits.length === 0 ? `<div class="empty">館內目前沒有和「${esc(q)}」相關的書。<br>建檔時多加主題標籤與重點摘記，檢索會越來越準。</div>` : `
      <div class="result-section">
        <h3>相關藏書（${hits.length} 本）</h3>
        <div class="grid">${hits.map(bookCard).join('')}</div>
      </div>
      ${quotes.length ? `<div class="result-section">
        <h3>可引用的重點（${quotes.length} 條）
          <button class="btn secondary small" id="copy-all">複製全部（Markdown）</button></h3>
        ${quotes.map((x, i) => `
          <div class="quote-card">
            <p class="q">${highlightQuery(x.hl.text, q)}${x.hl.kind === 'gist' ? ' <em class="gist-mark">（大意）</em>' : ''}</p>
            ${x.hl.my_take ? `<p class="my-take">💭 ${highlightQuery(x.hl.my_take, q)}</p>` : ''}
            <p class="src">
              <span>——《${esc(x.book.title)}》${esc(creatorsLine(x.book))}${x.book.published_year ? `，${x.book.published_year}` : ''}${x.hl.page ? `，p.${esc(x.hl.page)}` : ''}</span>
              <button class="btn secondary small" data-copy="${i}">複製引文</button>
            </p>
          </div>`).join('')}
      </div>` : `<p class="empty">相關的書還沒有重點摘記——到書的編輯頁補上，之後就能直接引用。</p>`}
    `}
  `;
}

function bindSearch(user) {
  const input = document.getElementById('topic-q');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      searchQuery = input.value;
      render(user);
      const el = document.getElementById('topic-q');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 250);
  });
  app.querySelectorAll('[data-search-sugg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      searchQuery = btn.dataset.searchSugg || '';
      render(user);
    });
  });
  const { quotes } = searchLibrary(searchQuery);
  const copyText = async (text, okMsg) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg);
    } catch {
      toast('複製失敗，請手動選取');
    }
  };
  app.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const x = quotes[Number(btn.dataset.copy)];
      copyText(citation(x.hl, x.book), '已複製引文（含完整出處）');
    });
  });
  document.getElementById('copy-all')?.addEventListener('click', () => {
    const md = quotes.map((x) => `- ${citation(x.hl, x.book)}`).join('\n');
    copyText(md, `已複製 ${quotes.length} 條引文（Markdown 清單）`);
  });
  app.querySelectorAll('.book-card').forEach((card) => {
    card.addEventListener('click', () => {
      view = { name: 'detail', id: card.dataset.id };
      render(user);
    });
  });
}

/* ---- 啟動 ---- */

async function main() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // 1. 如果處於示範模式，直接進入示範
  if (isDemoMode()) {
    books = loadDemoBooks();
    render({ email: '訪客示範模式', isDemo: true });
    return;
  }

  // 2. 正常主機身分檢查
  const user = await currentUser();
  if (!user) {
    const cached = loadCachedBooks();
    if (!navigator.onLine && cached) {
      books = cached;
      offline = true;
      render({ email: '離線模式' });
      return;
    }
    return renderLogin();
  }

  if (user.forbidden) {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    return renderLogin('這個 Google 帳號不是書齋主人。請換帳號登入，或點擊下方進入訪客示範模式。');
  }

  try {
    books = await listBooks();
    offline = false;
    cacheBooks();
  } catch (err) {
    if (err.status === 401 || err.status === 403) return renderLogin(err.message);
    const cached = loadCachedBooks();
    if (cached) {
      books = cached;
      offline = true;
    } else {
      app.innerHTML = `<div class="empty">讀取藏書失敗：${esc(err.message)}</div>`;
      return;
    }
  }
  render(user);
}

main();
