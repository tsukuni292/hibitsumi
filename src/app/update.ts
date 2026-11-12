// アプリの更新（オフライン用に保存した古い版から、新しい版へ切り替える）
import { registerSW } from 'virtual:pwa-register';

/** 公開した版（package.json の version）とビルド日時 */
export const APP_VERSION = __APP_VERSION__;
export const BUILD_TIME = __BUILD_TIME__;

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let registration: ServiceWorkerRegistration | undefined;

const checkQuietly = () => void registration?.update().catch(() => undefined);

export function startUpdater(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      registration = r;
      if (!r) return;
      // ホーム画面のアプリは閉じずに戻ることが多いので、前に出てきたときと1時間ごとにも新しい版を確かめる
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkQuietly();
      });
      setInterval(checkQuietly, CHECK_INTERVAL_MS);
    },
  });
}

/**
 * 保存してある古い版を捨てて、最新版を読み込み直す。
 * 消すのはアプリ本体の控え（Cache Storage と Service Worker）だけで、記録（IndexedDB）は消さない。
 */
export async function reinstallLatest(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map(r => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } finally {
    // 古い index.html が HTTP キャッシュから出ないよう、URL を変えて読み込む
    const url = new URL(window.location.href);
    url.searchParams.set('v', String(Date.now()));
    window.location.replace(url.toString());
  }
}
