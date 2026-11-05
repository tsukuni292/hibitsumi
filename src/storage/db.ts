// IndexedDB への保存。読み込み時は必ず parseSave() を通す。
import { createStore, get, promisifyRequest, set, type UseStore } from 'idb-keyval';
import type { SaveData } from '../core/types';
import { parseSave } from './schema';

// この名前を変えると既存の保存データが読めなくなるので、公開後は変えないこと
export const DB_NAME = 'hibitsumi';
export const STORE_NAME = 'kv';
const SAVE_KEY = 'save';
export const BEFORE_IMPORT_KEY = 'backup:before-import';
const preMigrationKey = (v: number) => `backup:pre-migration-v${v}`;

let store: UseStore | null = null;
function db(): UseStore {
  store ??= createStore(DB_NAME, STORE_NAME);
  return store;
}

/** テスト用：ストアを作り直す */
export function resetStoreForTest(): void {
  store = null;
}

export class ConflictError extends Error {
  constructor() {
    super('別のタブ（または別の操作）で先に保存されました');
    this.name = 'ConflictError';
  }
}

export class CorruptDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptDataError';
  }
}

/** 保存データを読む。なければ null。壊れていれば CorruptDataError */
export async function loadSave(): Promise<SaveData | null> {
  const raw = await get(SAVE_KEY, db());
  if (raw === undefined) return null;
  const r = parseSave(raw);
  if (!r.ok) throw new CorruptDataError(r.error);
  if (r.migratedFrom !== null) {
    // 移行前の元データを残してから、新しい形式で保存し直す。
    // revision を上げて、古い版のアプリ（別タブ）が移行済みデータを上書きしないようにする
    const migrated: SaveData = { ...r.save, revision: r.save.revision + 1 };
    await set(preMigrationKey(r.migratedFrom), raw, db());
    await set(SAVE_KEY, migrated, db());
    return migrated;
  }
  return r.save;
}

/** 保存データの revision。データなしは null、読めない形式は -1 */
function revisionOf(cur: unknown): number | null {
  if (cur === undefined) return null;
  const rev = (cur as { revision?: unknown } | null)?.revision;
  return typeof rev === 'number' ? rev : -1;
}

/**
 * 保存する。保存されている revision が expectedRevision と違えば ConflictError（上書きしない）。
 * 読み取りと書き込みを1つのトランザクションで行うので、途中で割り込まれない。
 */
export function writeSave(next: SaveData, expectedRevision: number | null): Promise<SaveData> {
  return db()('readwrite', s =>
    new Promise<SaveData>((resolve, reject) => {
      const req = s.get(SAVE_KEY);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        try {
          const curRev = revisionOf(req.result);
          if (curRev !== expectedRevision) {
            reject(new ConflictError());
            return;
          }
          const toWrite: SaveData = { ...next, revision: (curRev ?? 0) + 1 };
          s.put(toWrite, SAVE_KEY);
          promisifyRequest(s.transaction).then(() => resolve(toWrite), reject);
        } catch (e) {
          reject(e);
        }
      };
    }),
  );
}

/**
 * バックアップの取り込み：現在のデータを別キーに残してから置き換える（1つのトランザクションで行う）。
 * force=false なら、保存されている revision が expectedRevision と違うとき ConflictError。
 * force=true は、読み込めない（壊れた）データからの復元用。
 */
export function replaceWithImport(imported: SaveData, expectedRevision: number | null, force = false): Promise<SaveData> {
  return db()('readwrite', s =>
    new Promise<SaveData>((resolve, reject) => {
      const req = s.get(SAVE_KEY);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        try {
          const cur: unknown = req.result;
          const curRev = revisionOf(cur);
          if (!force && curRev !== expectedRevision) {
            reject(new ConflictError());
            return;
          }
          if (cur !== undefined) s.put(cur, BEFORE_IMPORT_KEY);
          const toWrite: SaveData = { ...imported, revision: Math.max(curRev ?? 0, 0) + 1 };
          s.put(toWrite, SAVE_KEY);
          promisifyRequest(s.transaction).then(() => resolve(toWrite), reject);
        } catch (e) {
          reject(e);
        }
      };
    }),
  );
}

/** ブラウザにデータを消さないよう頼む（iOS などで消されにくくなる） */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function exportJson(save: SaveData): string {
  return JSON.stringify(save, null, 2);
}

export function importJson(text: string): ReturnType<typeof parseSave> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSONとして読み込めませんでした' };
  }
  return parseSave(raw);
}
