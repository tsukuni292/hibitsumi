// 通知の状態を持ち、記録が変わったら少し待ってから予定を送り直す
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameDate } from '../core/date';
import type { SaveData } from '../core/types';
import { disableNotify, enableNotify, loadNotifyState, saveNotifyState, syncNotify, testNotify, type NotifyState } from './notify';
import type { NotifySettings } from './notifyPlan';

const SYNC_DELAY_MS = 3000;

export interface Notify {
  state: NotifyState;
  busy: boolean;
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  test: () => Promise<void>;
  setSettings: (s: NotifySettings) => void;
}

export function useNotify(save: SaveData | null, today: GameDate): Notify {
  const [state, setState] = useState<NotifyState>(loadNotifyState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const run = useCallback(async (job: () => Promise<NotifyState | void>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await job();
      if (next) setState(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '通知の設定に失敗しました');
    } finally {
      setBusy(false);
    }
  }, []);

  // 記録・設定・日付が変わったら送り直す（変わっていなければ送らない）
  useEffect(() => {
    if (!save || !state.enabled) return;
    const t = setTimeout(() => {
      syncNotify(stateRef.current, save, today).then(setState).catch(() => undefined);
    }, SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [save, today, state.enabled, state.settings]);

  return {
    state,
    busy,
    error,
    enable: () => run(async () => (save ? enableNotify(stateRef.current, save, today) : undefined)),
    disable: () => run(() => disableNotify(stateRef.current)),
    test: () => run(() => testNotify(stateRef.current)),
    setSettings: settings => {
      const next = { ...stateRef.current, settings };
      saveNotifyState(next);
      setState(next);
    },
  };
}
