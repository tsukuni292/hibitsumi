// 街の季節・時間・天気の見た目（計算には関わらない）
import type { Season, Weather } from '../core/seasons';
import type { SpriteVariant } from './spriteCache';

export type TimeOfDay = 'dawn' | 'day' | 'evening' | 'night';
export const TIME_LABEL: Record<TimeOfDay, string> = { dawn: '朝焼け', day: '昼', evening: '夕方', night: '夜' };

export interface Ambience {
  season: Season;
  time: TimeOfDay;
  weather: Weather;
}

export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 16) return 'day';
  if (hour >= 16 && hour < 18.5) return 'evening';
  return 'night';
}

/** 地面と木の色の差し替え（季節ごと）。夏はそのまま */
const GROUND: Partial<Record<Season, Record<string, string>>> = {
  autumn: { g: '#a9c46a', h: '#c9d98a', j: '#7a9a4e' },
  winter: { g: '#e8eef2', h: '#ffffff', j: '#c9d6df' },
};
const TREE: Partial<Record<Season, Record<string, string>>> = {
  spring: { g: '#ef9db5', h: '#fdd8e1', j: '#c96f8c' },
  autumn: { g: '#e3a96b', h: '#f2cf6b', j: '#bf7d48' },
  winter: { g: '#dfe9ee', h: '#ffffff', j: '#5c9a4e' },
};

/** 地面・木のスプライトの季節の色。それ以外は null */
export function seasonVariant(sprite: string, season: Season): SpriteVariant | null {
  const swap = sprite === 'deco_tree' || sprite === 'tile_t_forest' ? TREE[season] : sprite.startsWith('tile_grass') || sprite.startsWith('tile_flowers') ? GROUND[season] : undefined;
  return swap ? { swap, swapKey: `season-${season}` } : null;
}

/** 時間帯の色のかぶせ（rgba）。昼は null。雨・雪の日は少し暗く */
export function tint(a: Ambience): string | null {
  if (a.time === 'night') return 'rgba(20, 30, 70, 0.45)';
  if (a.time === 'evening') return 'rgba(255, 140, 60, 0.16)';
  if (a.time === 'dawn') return 'rgba(255, 200, 150, 0.12)';
  return a.weather === 'clear' ? null : 'rgba(60, 70, 90, 0.15)';
}

/** 夜に明かりをともす画素（建物の窓・街灯の灯り） */
export const WINDOW_LIGHTS: SpriteVariant = { only: { c: '#ffe590', C: '#f2cf6b', l: '#fff3b8' }, swapKey: 'lights-window' };
export const LAMP_LIGHTS: SpriteVariant = { only: { w: '#fffaf0', l: '#ffe590' }, swapKey: 'lights-lamp' };

export interface Particle {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

/** 降るもの：雨・雪、晴れた春は花びら・秋は落ち葉。t は秒。地図の大きさ（アート画素）の中に置く */
export function particles(a: Ambience, t: number, width: number, height: number): Particle[] {
  const kind = a.weather === 'rain' ? 'rain' : a.weather === 'snow' ? 'snow' : a.season === 'spring' ? 'petal' : a.season === 'autumn' ? 'leaf' : null;
  if (!kind) return [];
  const spec = {
    rain: { n: 90, vx: -20, vy: 160, w: 1, h: 3, colors: ['#aee2ee', '#c8eef5'] },
    snow: { n: 70, vx: 4, vy: 14, w: 1, h: 1, colors: ['#ffffff', '#e8eef2'] },
    petal: { n: 18, vx: 8, vy: 10, w: 2, h: 1, colors: ['#fdd8e1', '#ef9db5'] },
    leaf: { n: 14, vx: 6, vy: 12, w: 2, h: 2, colors: ['#e3a96b', '#cc9b40', '#bf7d48'] },
  }[kind];
  const out: Particle[] = [];
  for (let i = 0; i < spec.n; i++) {
    // 粒ごとに決まった位置と速さのゆらぎ（状態を持たず、時刻から毎回計算する）
    const r1 = ((i * 7919) % 1000) / 1000;
    const r2 = ((i * 104729) % 1000) / 1000;
    const speed = 0.7 + r2 * 0.6;
    const sway = kind === 'snow' || kind === 'petal' || kind === 'leaf' ? Math.sin(t * 1.3 + i) * 4 : 0;
    const x = ((r1 * width + t * spec.vx * speed + sway) % width + width) % width;
    const y = ((r2 * height + t * spec.vy * speed) % height + height) % height;
    out.push({ x: Math.round(x), y: Math.round(y), w: spec.w, h: spec.h, color: spec.colors[i % spec.colors.length]! });
  }
  return out;
}
