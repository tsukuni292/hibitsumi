// 通知：この端末の登録と、予定の送信（サーバーは Supabase の Edge Function）。
// 設定と端末の合い言葉は端末ごとのものなので、バックアップには入れず localStorage に置く。
import type { GameDate } from '../core/date';
import type { SaveData } from '../core/types';
import { buildNotificationPlan, DEFAULT_NOTIFY_SETTINGS, type NotifySettings } from './notifyPlan';

const ENDPOINT = 'https://yhdhmynxjtczhyzhmauq.supabase.co/functions/v1/hibitsumi-push';
const STORE_KEY = 'hibitsumi:notify';

export interface NotifyState {
  enabled: boolean;
  deviceId: string;
  secret: string;
  settings: NotifySettings;
  /** 最後に送った予定（同じなら送り直さない） */
  lastSent: string | null;
}

export type Support = 'ok' | 'unsupported' | 'needs-install' | 'denied';

/** この端末で通知が使えるか。iPhone はホーム画面に追加したアプリの中だけ */
export function notifySupport(): Support {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
    return ios && !standalone ? 'needs-install' : 'unsupported';
  }
  return Notification.permission === 'denied' ? 'denied' : 'ok';
}

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function loadNotifyState(): NotifyState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<NotifyState>;
      if (typeof s.deviceId === 'string' && typeof s.secret === 'string') {
        return { enabled: s.enabled === true, deviceId: s.deviceId, secret: s.secret, settings: { ...DEFAULT_NOTIFY_SETTINGS, ...s.settings }, lastSent: s.lastSent ?? null };
      }
    }
  } catch {
    // 読めないときは作り直す
  }
  return { enabled: false, deviceId: crypto.randomUUID(), secret: randomHex(32), settings: DEFAULT_NOTIFY_SETTINGS, lastSent: null };
}

export function saveNotifyState(s: NotifyState): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても通知の送信はできる
  }
}

async function call(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`通知サーバーの応答: ${res.status}`);
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function subscription(): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  const current = await reg.pushManager.getSubscription();
  if (current) return current;
  const { publicKey } = (await (await fetch(ENDPOINT)).json()) as { publicKey: string };
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
}

/** 通知を許可してもらい、この端末を登録する（ボタンを押したときに呼ぶ） */
export async function enableNotify(state: NotifyState, save: SaveData, today: GameDate): Promise<NotifyState> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('通知が許可されませんでした');
  const next = { ...state, enabled: true, lastSent: null };
  return syncNotify(next, save, today, true);
}

export async function disableNotify(state: NotifyState): Promise<NotifyState> {
  try {
    await call({ action: 'unregister', deviceId: state.deviceId, secret: state.secret });
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    await sub?.unsubscribe();
  } finally {
    saveNotifyState({ ...state, enabled: false, lastSent: null });
  }
  return { ...state, enabled: false, lastSent: null };
}

export async function testNotify(state: NotifyState): Promise<void> {
  await call({ action: 'test', deviceId: state.deviceId, secret: state.secret });
}

/** 今の記録から予定を作り直し、前回と違えばサーバーへ送る */
export async function syncNotify(state: NotifyState, save: SaveData, today: GameDate, force = false): Promise<NotifyState> {
  if (!state.enabled) return state;
  const items = buildNotificationPlan(save, today, new Date(), state.settings);
  const key = JSON.stringify(items);
  if (!force && key === state.lastSent) return state;
  const sub = await subscription();
  await call({ action: 'register', deviceId: state.deviceId, secret: state.secret, subscription: sub.toJSON(), items });
  const next = { ...state, lastSent: key };
  saveNotifyState(next);
  return next;
}
