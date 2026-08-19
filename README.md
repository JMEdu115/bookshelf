# 🎋 雲端書齋（Bookshelf Starter Template）

> 一款融合**國風潑墨美學**與**竹林七賢閱讀導航**的現代化個人藏書整理系統。  
> 專為愛書人、教師、學者與創作者設計：支援 ISBN 快速建檔、書籍定位、深度覆盤筆記、精準引文出處（附頁碼）與主題檢索。

- 🌐 **線上示範站**：[https://bookshelf-template.pages.dev](https://bookshelf-template.pages.dev)（點擊「🎲 訪客示範模式」免登入即可體驗全功能）
- 🧱 **極簡無伺服器架構**：Cloudflare Pages + Pages Functions + Turso (libSQL HTTP Pipeline，零 npm 後端依賴)
- 🔐 **私密個人白名單**：Google One Tap / GIS 驗簽 + HMAC 簽章 HttpOnly Session Cookie + 後端單人白名單（非主人一律 403）
- 📱 **PWA 支援**：支援手機/平板加入主畫面、離線瀏覽與相機掃描書背條碼

---

## 🌟 核心特色

| 模組 | 功能說明 |
|---|---|
| 📚 **典藏書架** | 卡片牆＋狀態／位置／主題多維度篩選，支援全文即時搜尋、久未複習提示與外借追蹤。 |
| 🎋 **竹林七賢導讀** | 將魏晉七賢典故化為七大閱讀維度（經典哲思、散文遊記、創意靈感、藝術美學、考據筆記、教育導讀、實戰管理），點擊可快速探索相應館藏。 |
| 🔍 **主題檢索** | 輸入主題關鍵字（如「班級經營」或「哲學」），一鍵檢索相關藏書，並彙整**可直接引用的重點摘記清單**（含書名、作者、出版年、頁碼，一鍵複製 Markdown）。 |
| 📖 **ISBN 快速建檔** | 支援相機掃條碼或輸入 10/13 碼 ISBN，自動查詢 Google Books 與 Open Library 帶入書目與封面。 |
| 💭 **深度讀書筆記** | 支援「起心動念」、「推薦對象」、「讀後心得」、「間隔覆盤紀錄」、「落地行動清單」與「重點摘記（精確引用／大意摘要）」。 |
| 🔗 **關聯閱讀** | 串聯館內相呼應的藏書，建構個人知識圖譜。 |
| 📦 **資料全自主** | 一鍵匯出全量 JSON 備份，含軟刪除垃圾桶防手滑機制。 |

---

## 🚀 5 分鐘快速部署指南

只需一個 **GitHub 帳號**、**Cloudflare 帳號** 與 **Turso 帳號**（皆為永久免費額度即可運作）。

### 步驟 1：建立 Turso 資料庫

1. 前往 [Turso.tech](https://turso.tech) 註冊並建立一個新的 SQLite / libSQL 資料庫（例如 `my-bookshelf`）。
2. 在 Turso Web 控制台或 CLI 執行 `db/schema.sql` 建立資料表結構：
   ```sql
   -- 複製 db/schema.sql 的內容貼入 Turso 執行
   ```
3. 取得資料庫連線網址（`TURSO_DATABASE_URL`）與存取權杖（`TURSO_AUTH_TOKEN`）。

### 步驟 2：取得 Google OAuth Client ID

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) 建立專案。
2. 進入「API 和服務」→「OAuth 同意畫面」，使用者類型選「外部」，填寫應用程式名稱。
3. 進入「憑證」→「建立憑證」→「OAuth 用戶端 ID」：
   - 應用程式類型選「網頁應用程式」。
   - **已授權的 JavaScript 來源** 加入你的 Cloudflare Pages 網址（例如 `https://my-bookshelf.pages.dev`）以及本機測試 `http://localhost:8788`。
4. 複製產生的 **用戶端編號**（`GOOGLE_CLIENT_ID`）。

### 步驟 3：部署到 Cloudflare Pages

1. 將本專案 Fork 或 Clone 至你的 GitHub。
2. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Compute (Workers) > Pages** → 建立新應用程式 → 連線到你的 Git 倉庫。
3. 建置設定：
   - **架構預設值**：None
   - **建置指令**：`rsync -a index.html _headers _routes.json manifest.json sw.js css js icons functions dist/`
   - **建置輸出目錄**：`dist`
4. 在 Pages 專案的 **Settings > Environment variables** 中新增以下 5 個變數：

| 變數名稱 | 範例值 / 說明 |
|---|---|
| `TURSO_DATABASE_URL` | `https://my-bookshelf-username.turso.io` |
| `TURSO_AUTH_TOKEN` | `eyJhbGciOi...`（Turso 資料庫 Token） |
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` |
| `OWNER_EMAIL` | `your-email@gmail.com`（你的個人 Google 帳號，只有此帳號能登入管理） |
| `SESSION_SECRET` | 任意 32 字元以上的隨機字串（用於 HMAC 簽章） |

5. 點擊 **Save and Deploy**，部署完成即可擁有專屬的雲端書齋！

---

## 💻 本機開發

```bash
# 安裝依賴
npm install

# 複製本機環境變數檔
cp .dev.vars.example .dev.vars
# 編輯 .dev.vars 填入你的設定

# 啟動本機開發伺服器
npm run dev

# 執行單元測試
npm test
```

`.dev.vars` 本機開發檔（已被 gitignore）：
```ini
TURSO_DATABASE_URL="https://my-bookshelf-username.turso.io"
TURSO_AUTH_TOKEN="your_turso_token"
GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
OWNER_EMAIL="your-email@gmail.com"
SESSION_SECRET="random_32_char_secret_string_here"
DEV_OWNER_ID="1"
```

---

## 🛠️ 自訂書房名稱與風格

- **自訂書房名稱**：在 `index.html` 與 `js/app.js` 中搜尋「雲端書齋」，替換為你喜歡的名稱（如「晴耕雨讀」、「南山書舍」）。
- **更換風格配色**：編輯 `css/style.css` 中的 CSS 變數（`--bg`, `--green`, `--accent`, `--ink`）。

---

## 📄 開源授權

本專案採用 [MIT License](LICENSE) 開源授權，歡迎自由修改、客製與推廣。
