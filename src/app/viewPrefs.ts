// 街の見た目の設定（季節・時間を本物に合わせるか、固定するか）。端末ごとの好みなので localStorage に置く
import { useSyncExternalStore } from 'react';
import type { Season } from '../core/seasons';
import type { TimeOfDay } from '../render/ambience';

export interface ViewPrefs {
  season: 'auto' | Season;
  time: 'auto' | TimeOfDay;
}

const KEY = 'hibitsumi:view';
const DEFAULT: ViewPrefs = { season: 'auto', time: 'auto' };
const listeners = new Set<() => void>();

function read(): ViewPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<ViewPrefs>) };
  } catch {
    // 読めなければ既定
  }
  return DEFAULT;
}

let current = read();

export function setViewPrefs(next: ViewPrefs): void {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても、この画面では反映する
  }
  listeners.forEach(l => l());
}

export function useViewPrefs(): ViewPrefs {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
