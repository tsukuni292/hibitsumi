// 保存データの読み込み・保存・操作をまとめるフック
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyAction, currentGameDate, rebaseActions, type Action } from '../core/actions';
import { gameDateFromLocal, type GameDate } from '../core/date';
import { createInitialSave } from '../core/defaults';
import { simulate, type SimResult } from '../core/simulate';
import type { SaveData } from '../core/types';
import { ConflictError, CorruptDataError, loadSave, replaceWithImport, requestPersistence, writeSave } from '../storage/db';

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; corrupt: boolean }
  | { kind: 'ready' };

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

const CHANNEL = 'hibitsumi';
const DEFAULT_DAY_START = 4;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface Game {
  load: LoadState;
  save: SaveData | null;
  today: GameDate;
  sim: SimResult | null;
  toasts: Toast[];
  dispatch: (action: Action) => boolean;
  notify: (text: string, tone?: Toast['tone']) => void;
  importSave: (data: SaveData, force?: boolean) => Promise<void>;
  newId: () => string;
}

export function useGame(): Game {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [save, setSave] = useState<SaveData | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [toasts, setToasts] = useState<Toast[]>([]);

  const saveRef = useRef<SaveData | null>(null);
  const persistedRev = useRef<number | null>(null);
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const channel = useRef<BroadcastChannel | null>(null);
  const toastId = useRef(0);

  const notify = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current;
    setToasts(t => [...t.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'error' ? 4500 : 3000);
  }, []);

  /** 最後に保存済みと確認できたデータ。saveRef と違えば「まだ保存していない操作がある」 */
  const persistedObj = useRef<SaveData | null>(null);

  /** まだ保存できていない操作（別タブとぶつかったとき、最新データに重ね直すため） */
  const pendingActions = useRef<Action[]>([]);

  const adopt = useCallback((s: SaveData) => {
    saveRef.current = s;
    persistedObj.current = s;
    persistedRev.current = s.revision;
    pendingActions.current = [];
    setSave(s);
  }, []);

  /**
   * 外部（別タブ・画面復帰）からの読み直し。保存の列に並べて、書き込み中のデータと競合しないようにする。
   * 手元より新しい revision のときだけ取り込む。未保存の操作があるときは取り込まない
   * （その操作の保存が ConflictError になり、通知つきで読み直されるので、黙って消えることはない）。
   */
  const reloadFromDb = useCallback(() => {
    writeChain.current = writeChain.current.then(async () => {
      try {
        const s = await loadSave();
        const dirty = saveRef.current !== persistedObj.current;
        if (s && !dirty && (persistedRev.current === null || s.revision > persistedRev.current)) adopt(s);
      } catch (e) {
        console.error(e);
      }
    });
  }, [adopt]);

  // 初回読み込み
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let s = await loadSave();
        if (!s) {
          const today = gameDateFromLocal(new Date(), DEFAULT_DAY_START);
          try {
            s = await writeSave(createInitialSave(today, newId, DEFAULT_DAY_START), null);
          } catch (e) {
            // 同時に初回起動した別の処理（別タブなど）が先に作っていたら、それを使う
            if (!(e instanceof ConflictError)) throw e;
            s = await loadSave();
            if (!s) throw e;
          }
        }
        if (cancelled) return;
        adopt(s);
        setLoad({ kind: 'ready' });
        void requestPersistence();
      } catch (e) {
        if (cancelled) return;
        const corrupt = e instanceof CorruptDataError;
        setLoad({ kind: 'error', message: e instanceof Error ? e.message : String(e), corrupt });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  // 時計：30秒ごと＋画面に戻ったとき
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, 30_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        tick();
        reloadFromDb();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reloadFromDb]);

  // 別タブで保存されたら読み直す
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (ev: MessageEvent<{ revision: number }>) => {
      if (persistedRev.current === null || ev.data.revision > persistedRev.current) reloadFromDb();
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, [reloadFromDb]);

  const persistRef = useRef<() => void>(() => undefined);
  const persist = useCallback(() => {
    writeChain.current = writeChain.current.then(async () => {
      const latest = saveRef.current;
      if (!latest) return;
      // この書き込みに含まれる操作の数（書き込み中に増えた分は次の persist で保存する）
      const included = pendingActions.current.length;
      try {
        const written = await writeSave(latest, persistedRev.current);
        persistedRev.current = written.revision;
        persistedObj.current = written;
        pendingActions.current = pendingActions.current.slice(included);
        // 書き込み中に次の操作がなければ、revision を反映した版に差し替える
        // （次の操作があれば saveRef は written と違うまま＝未保存として扱われ、後ろの persist が保存する）
        if (saveRef.current === latest) {
          saveRef.current = written;
          setSave(written);
        }
        channel.current?.postMessage({ revision: written.revision });
      } catch (e) {
        if (e instanceof ConflictError) {
          // 別タブが先に保存していた。最新データを読み、こちらの未保存の操作を重ね直して保存し直す
          // （ここは保存の列の中なので、読み直しは列に並べず直接行う。並べると自分を待ってしまう）
          try {
            const s = await loadSave();
            if (!s) return;
            const actions = pendingActions.current;
            const r = rebaseActions(s, actions, currentGameDate(s, new Date()));
            adopt(s);
            if (actions.length > 0) {
              saveRef.current = r.save;
              pendingActions.current = actions;
              setSave(r.save);
              persistRef.current();
            }
            notify(
              r.dropped > 0
                ? `別のタブの変更と合わせました（${r.dropped}件の操作は反映できませんでした）`
                : '別のタブの変更と合わせて保存しました',
              r.dropped > 0 ? 'error' : 'info',
            );
          } catch (err) {
            console.error(err);
          }
        } else {
          notify('保存に失敗しました。空き容量などを確認してください', 'error');
          console.error(e);
        }
      }
    });
  }, [notify, adopt]);
  persistRef.current = persist;

  const dispatch = useCallback((action: Action): boolean => {
    const cur = saveRef.current;
    if (!cur) return false;
    const today = currentGameDate(cur, new Date());
    const r = applyAction(cur, action, today);
    if (!r.ok) {
      notify(r.error, 'error');
      return false;
    }
    if (r.note) notify(r.note);
    saveRef.current = r.save;
    pendingActions.current = [...pendingActions.current, action];
    setSave(r.save);
    persist();
    return true;
  }, [notify, persist]);

  /**
   * バックアップの取り込み。保存の列に並べ、ほかの保存と同時に走らないようにする。
   * force=true は壊れたデータからの復元用（revision を確かめない）。
   */
  const importSave = useCallback((data: SaveData, force = false) => {
    const job = writeChain.current.then(async () => {
      const written = await replaceWithImport(data, persistedRev.current, force);
      adopt(written);
      // 読み込みエラー画面からの復元にも使うので、ここで準備完了にする
      setLoad({ kind: 'ready' });
      channel.current?.postMessage({ revision: written.revision });
    });
    // 失敗しても列が止まらないようにする（失敗は呼び出し元に返す）
    writeChain.current = job.catch(() => undefined);
    return job;
  }, [adopt]);

  const today = save ? currentGameDate(save, now) : gameDateFromLocal(now, DEFAULT_DAY_START);
  const sim = useMemo(() => (save ? simulate(save, today) : null), [save, today]);

  // 日付が進んだら「最後に見た日」を記録（時計の巻き戻し対策）
  useEffect(() => {
    if (save && save.lastSeenDate < today) dispatch({ type: 'touch' });
  }, [save, today, dispatch]);

  return { load, save, today, sim, toasts, dispatch, notify, importSave, newId };
}
