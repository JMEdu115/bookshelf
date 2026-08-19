/*
 * 全站設定。這裡不放任何金鑰——後端金鑰只存在 Cloudflare Pages 環境變數，
 * 前端拿得到的一律當公開資訊。
 */

export const API = {
  auth: '/api/auth',
  books: '/api/books',
};

/*
 * Google 登入 Client ID（公開值）。與會考家族共用同一個 OAuth Client
 * （GCP 專案 cap-exam-hub-20260816），授權來源需含本站網域。
 */
export const GOOGLE_CLIENT_ID = '980957938007-r643ekt674tqmtfbun4g22f2rvhj9rks.apps.googleusercontent.com';
