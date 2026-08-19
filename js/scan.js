/*
 * 條碼掃描：用相機掃書背 EAN-13（= ISBN-13）。雙引擎：
 *   1. 原生 BarcodeDetector（Android／桌面 Chrome）
 *   2. 自架 ZXing 解碼庫 fallback（iPhone Safari 沒有原生 API，靠這條路）
 * 只要瀏覽器給得出相機（getUserMedia），就能掃。
 */

const ZXING_SRC = '/js/vendor/zxing.min.js';
let zxingLoading = null;

export function scanSupported() {
  return !!navigator.mediaDevices?.getUserMedia;
}

function loadZxing() {
  if (window.ZXing) return Promise.resolve();
  if (zxingLoading) return zxingLoading;
  zxingLoading = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = ZXING_SRC;
    el.onload = resolve;
    el.onerror = () => {
      zxingLoading = null;
      reject(new Error('載不到條碼解碼元件'));
    };
    document.head.appendChild(el);
  });
  return zxingLoading;
}

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'scan-overlay';
  overlay.innerHTML = `
    <video playsinline autoplay muted></video>
    <p>對準書背條碼（ISBN）</p>
    <button type="button" class="btn secondary">取消</button>`;
  document.body.appendChild(overlay);
  return overlay;
}

/** 原生 BarcodeDetector 路線。 */
async function scanNative(video, isStopped) {
  const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8'] });
  return new Promise((resolve) => {
    const tick = async () => {
      if (isStopped()) {
        resolve(null);
        return;
      }
      try {
        const codes = await detector.detect(video);
        const hit = codes.find((c) => /^\d{13}$/.test(c.rawValue));
        if (hit) {
          resolve(hit.rawValue);
          return;
        }
      } catch {
        /* 個別幀偵測失敗照常重試 */
      }
      setTimeout(tick, 180);
    };
    tick();
  });
}

/** ZXing 路線：把相機串流交給解碼器連續解（iPhone Safari 走這裡）。 */
async function scanZxing(video, isStopped, stream) {
  await loadZxing();
  const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = window.ZXing;
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]);
  const reader = new BrowserMultiFormatReader(hints);
  return new Promise((resolve) => {
    const done = (value) => {
      clearInterval(stopWatch);
      try {
        reader.reset();
      } catch { /* 收尾失敗不影響結果 */ }
      resolve(value);
    };
    const stopWatch = setInterval(() => {
      if (isStopped()) done(null);
    }, 200);
    reader
      .decodeFromStream(stream, video, (result) => {
        const text = result?.getText?.();
        if (text && /^\d{13}$/.test(text)) done(text);
      })
      .catch(() => done(null));
  });
}

/**
 * 開相機掃一個 ISBN。回 Promise<string|null>：掃到回 ISBN、使用者取消回 null。
 * 自己負責建立／收掉全螢幕覆蓋層。
 */
export async function scanIsbn() {
  if (!scanSupported()) return null;
  const overlay = buildOverlay();
  const video = overlay.querySelector('video');
  let stream = null;
  let stopped = false;
  const isStopped = () => stopped;

  const cleanup = () => {
    stopped = true;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    overlay.remove();
  };

  const cancelled = new Promise((resolve) => {
    overlay.querySelector('button').addEventListener('click', () => resolve(null));
  });

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    const engine = 'BarcodeDetector' in window ? scanNative : scanZxing;
    const result = await Promise.race([engine(video, isStopped, stream), cancelled]);
    cleanup();
    return result;
  } catch {
    cleanup();
    return null;
  }
}
