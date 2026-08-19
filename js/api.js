/* 藏書 CRUD 的薄封裝。所有請求帶同網域 cookie；非 2xx 一律丟 Error（帶 status 與後端 error 碼）。 */

import { API } from './config.js';

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) },
    ...options,
  });
  if (res.status === 401) throw Object.assign(new Error('尚未登入'), { status: 401 });
  if (res.status === 403) throw Object.assign(new Error('僅限主人本人使用'), { status: 403 });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const messages = {
      duplicate_isbn: `這個 ISBN 已經建過檔（《${body.title || ''}》）`,
      conflict: '這本書已在其他裝置被修改過，請重新整理後再編輯',
      too_long: body.message || '內容超過字數上限',
    };
    throw Object.assign(new Error(messages[body.error] || `API 錯誤（${res.status}）`), {
      status: res.status,
      code: body.error,
      existingId: body.id,
    });
  }
  return res.json();
}

export async function listBooks() {
  return (await request(API.books)).books;
}

export async function listTrash() {
  return (await request(`${API.books}/trash`)).books;
}

export async function exportBooks() {
  return request(`${API.books}/export`);
}

export async function createBook(book) {
  return (await request(API.books, { method: 'POST', body: JSON.stringify(book) })).book;
}

export async function updateBook(id, book) {
  return (await request(`${API.books}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(book) })).book;
}

export async function deleteBook(id) {
  return request(`${API.books}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function restoreBook(id) {
  return (await request(`${API.books}/${encodeURIComponent(id)}/restore`, { method: 'POST' })).book;
}
