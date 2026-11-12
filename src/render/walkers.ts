// 住民の歩行と、タップしたときの反応。歩けるマス（横の道・縦の道・置いた道）を1マスずつたどって歩く。
// 描画とは分けて、時間を進める関数だけを持つ（テストしやすいように）
import type { Mood } from '../core/rules';
import { TILE } from './townLayout';

export type Personality = 'cheerful' | 'shy' | 'lonely' | 'calm';
export const PERSONALITY_LABEL: Record<Personality, string> = { cheerful: '陽気', shy: 'てれや', lonely: 'さみしがり', calm: 'のんびり' };

/** 住民ごとに決まった性格 */
export function personalityOf(index: number): Personality {
  return (['cheerful', 'shy', 'lonely', 'calm'] as const)[(index * 7 + 3) % 4]!;
}

/** 1回タップしたときの反応（やる気で決まる） */
export type Reaction = 'hop' | 'nod' | 'sigh';
export const reactionFor = (mood: Mood): Reaction => (mood === 'happy' ? 'hop' : mood === 'neutral' ? 'nod' : 'sigh');

/** 頭の上の吹き出しの絵 */
export type MarkKind = 'dots' | 'note' | 'bang' | 'ask' | 'heart' | 'zzz' | 'sweat' | 'tear' | 'blush' | 'sparkle';

/**
 * 続けてタップしたときの特別な動き。やる気（元気・ふつう・しょんぼり）ごとに、性格で4通りに分かれる。
 * 動きは「跳ねる・くるくる向きを変える・左右に揺れる・震える・走る・寝転ぶ」の組み合わせで描く
 */
export interface SpecialDef {
  label: string;
  /** 跳ねる高さ（画素）と周期（ミリ秒） */
  hop: number;
  hopMs: number;
  /** くるくる向きを変える周期（ミリ秒）。null なら変えない */
  flipMs: number | null;
  /** 左右に揺れる幅（画素） */
  sway: number;
  /** 震える */
  shake: boolean;
  /** 走る（速さの倍率。0 なら止まったまま） */
  run: number;
  /** 寝転ぶ */
  lie: boolean;
  mark: MarkKind;
  markColor: string;
}

export type SpecialKind =
  | 'joyDance' | 'shyDance' | 'heartJump' | 'slowSway'
  | 'spin' | 'shyRun' | 'callOut' | 'doze'
  | 'forcedSmile' | 'runAway' | 'cry' | 'sulk';

const C = { ink: '#3b2a2e', gold: '#cc9b40', red: '#c95b4b', pink: '#ee7b78', blue: '#4b7399', sky: '#6db3cd' };

export const SPECIALS: Record<SpecialKind, SpecialDef> = {
  // 元気
  joyDance: { label: '喜びの舞', hop: 4, hopMs: 240, flipMs: 300, sway: 0, shake: false, run: 0, lie: false, mark: 'note', markColor: C.gold },
  shyDance: { label: '照れ踊り', hop: 2, hopMs: 360, flipMs: 700, sway: 1, shake: false, run: 0, lie: false, mark: 'blush', markColor: C.pink },
  heartJump: { label: 'ハートの大ジャンプ', hop: 8, hopMs: 600, flipMs: null, sway: 0, shake: false, run: 0, lie: false, mark: 'heart', markColor: C.pink },
  slowSway: { label: 'ゆらゆら踊り', hop: 0, hopMs: 1, flipMs: 900, sway: 3, shake: false, run: 0, lie: false, mark: 'note', markColor: C.gold },
  // ふつう
  spin: { label: 'くるくる回る', hop: 0, hopMs: 1, flipMs: 100, sway: 0, shake: false, run: 0, lie: false, mark: 'sparkle', markColor: C.gold },
  shyRun: { label: '照れて走り去る', hop: 0, hopMs: 1, flipMs: null, sway: 0, shake: false, run: 3, lie: false, mark: 'blush', markColor: C.pink },
  callOut: { label: 'ぴょんぴょん呼ぶ', hop: 3, hopMs: 200, flipMs: null, sway: 0, shake: false, run: 0, lie: false, mark: 'heart', markColor: C.pink },
  doze: { label: '居眠り', hop: 0, hopMs: 1, flipMs: null, sway: 0, shake: false, run: 0, lie: true, mark: 'zzz', markColor: C.blue },
  // しょんぼり
  forcedSmile: { label: '空元気', hop: 2, hopMs: 700, flipMs: null, sway: 0, shake: false, run: 0, lie: false, mark: 'sweat', markColor: C.sky },
  runAway: { label: '逃げ出す', hop: 0, hopMs: 1, flipMs: null, sway: 0, shake: false, run: 4, lie: false, mark: 'bang', markColor: C.red },
  cry: { label: '泣き出す', hop: 0, hopMs: 1, flipMs: null, sway: 0, shake: true, run: 0, lie: false, mark: 'tear', markColor: C.sky },
  sulk: { label: 'ふて寝', hop: 0, hopMs: 1, flipMs: null, sway: 0, shake: false, run: 0, lie: true, mark: 'dots', markColor: C.ink },
};

const SPECIAL_TABLE: Record<Mood, Record<Personality, SpecialKind>> = {
  happy: { cheerful: 'joyDance', shy: 'shyDance', lonely: 'heartJump', calm: 'slowSway' },
  neutral: { cheerful: 'spin', shy: 'shyRun', lonely: 'callOut', calm: 'doze' },
  sad: { cheerful: 'forcedSmile', shy: 'runAway', lonely: 'cry', calm: 'sulk' },
};

export const specialFor = (mood: Mood, p: Personality): SpecialKind => SPECIAL_TABLE[mood][p];

/** この回数を続けてタップすると特別な動き */
export const SPECIAL_TAPS = 5;
/** 続けてタップしたと見なす間隔（ミリ秒） */
export const TAP_CHAIN_MS = 1500;
export const REACT_MS = 2500;
export const SPECIAL_MS = 3000;
export const RESIDENT_W = 12;
export const RESIDENT_H = 16;

export interface Walker {
  index: number;
  /** 今いるマスと、向かっているマス */
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  /** 今いるマスから向かうマスまでの進み具合（0〜1） */
  t: number;
  /** 1秒に進むマス数 */
  speed: number;
  /** 左を向いているか */
  left: boolean;
  /** 立ち止まり・特別な動き */
  mode: 'walk' | 'react' | 'special';
  modeUntil: number;
  reaction: Reaction | null;
  special: SpecialKind | null;
  taps: number;
  lastTap: number;
  seed: number;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function rand(w: Walker): number {
  w.seed = (Math.imul(w.seed ^ (w.seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
  return (w.seed >>> 0) / 4294967296;
}

const walkable = (walk: boolean[][], x: number, y: number) => walk[y]?.[x] === true;

export function walkableCells(walk: boolean[][]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  walk.forEach((row, y) => row.forEach((w, x) => { if (w) out.push([x, y]); }));
  return out;
}

/** 次に向かうマス。来た道には、行き止まりのときだけ戻る */
function chooseNext(w: Walker, walk: boolean[][]): void {
  const options = DIRS.map(([dx, dy]) => ({ x: w.nx + dx, y: w.ny + dy })).filter(c => walkable(walk, c.x, c.y));
  const forward = options.filter(c => c.x !== w.tx || c.y !== w.ty);
  const list = forward.length > 0 ? forward : options;
  w.tx = w.nx;
  w.ty = w.ny;
  if (list.length === 0) return; // 1マスだけの道：その場にとどまる
  const c = list[Math.floor(rand(w) * list.length)]!;
  w.nx = c.x;
  w.ny = c.y;
}

/** 住民を n 人に合わせる（増えた分は歩けるマスに散らばらせ、歩けなくなった人は置き直す） */
export function syncWalkers(list: Walker[], n: number, walk: boolean[][]): Walker[] {
  const cells = walkableCells(walk);
  if (cells.length === 0) return [];
  const out = list.slice(0, n).map(w => (walkable(walk, w.tx, w.ty) && walkable(walk, w.nx, w.ny) ? w : place(w.index, cells)));
  for (let i = out.length; i < n; i++) out.push(place(i, cells));
  return out;
}

function place(index: number, cells: Array<[number, number]>): Walker {
  const [x, y] = cells[(index * 37 + 11) % cells.length]!;
  return {
    index, tx: x, ty: y, nx: x, ny: y, t: 1, speed: 0.35 + ((index * 7) % 9) * 0.04, left: index % 2 === 0,
    mode: 'walk', modeUntil: 0, reaction: null, special: null, taps: 0, lastTap: 0, seed: (index + 1) * 2654435761,
  };
}

/** dt 秒だけ進める。now はミリ秒 */
export function stepWalkers(list: Walker[], walk: boolean[][], dt: number, now: number): void {
  for (const w of list) {
    if (w.mode !== 'walk' && now >= w.modeUntil) {
      w.mode = 'walk';
      w.reaction = null;
      w.special = null;
    }
    const run = w.mode === 'walk' ? 1 : w.mode === 'special' && w.special ? SPECIALS[w.special].run : 0;
    if (run === 0) continue;
    w.t += w.speed * run * dt;
    while (w.t >= 1) {
      w.t -= 1;
      chooseNext(w, walk);
      if (w.nx !== w.tx) w.left = w.nx < w.tx;
      if (w.nx === w.tx && w.ny === w.ty) {
        w.t = 0;
        break;
      }
    }
  }
}

export interface WalkerPose {
  /** 描く位置（アート座標・左上） */
  x: number;
  y: number;
  /** 左を向いて描くか */
  left: boolean;
  /** 寝転んで描くか */
  lie: boolean;
  /** 足を動かすか */
  moving: boolean;
}

/** 今の姿勢。特別な動きは、跳ねる・向きを変える・揺れる・震える・寝転ぶを組み合わせて描く */
export function walkerPose(w: Walker, now: number): WalkerPose {
  const fx = w.tx + (w.nx - w.tx) * w.t;
  const fy = w.ty + (w.ny - w.ty) * w.t;
  let x = fx * TILE + (TILE - RESIDENT_W) / 2;
  let y = fy * TILE;
  let left = w.left;
  let lie = false;
  let moving = w.mode === 'walk';
  if (w.mode === 'react' && w.reaction === 'hop') y -= Math.abs(Math.sin(now / 150)) * 3;
  if (w.mode === 'special' && w.special) {
    const d = SPECIALS[w.special];
    if (d.hop > 0) y -= Math.abs(Math.sin((now / d.hopMs) * Math.PI)) * d.hop;
    if (d.flipMs !== null) left = Math.floor(now / d.flipMs) % 2 === 0;
    if (d.sway > 0) x += Math.sin(now / 300) * d.sway;
    if (d.shake) x += Math.floor(now / 60) % 2 === 0 ? -1 : 1;
    lie = d.lie;
    moving = d.run > 0 || d.hop > 0 || d.flipMs !== null;
  }
  return { x: Math.round(x), y: Math.round(y), left, lie, moving };
}

/** 頭の上の吹き出し。なければ null */
export function walkerMark(w: Walker): { kind: MarkKind; color: string } | null {
  if (w.mode === 'special' && w.special) return { kind: SPECIALS[w.special].mark, color: SPECIALS[w.special].markColor };
  if (w.mode !== 'react') return null;
  if (w.reaction === 'hop') return { kind: 'note', color: C.gold };
  if (w.reaction === 'nod') return { kind: 'ask', color: C.ink };
  return { kind: 'dots', color: C.blue };
}

/** タップされたとき。立ち止まって反応し、続けてタップされたら特別な動き。戻り値は起きたこと */
export function tapWalker(w: Walker, mood: Mood, now: number): 'react' | SpecialKind {
  w.taps = now - w.lastTap <= TAP_CHAIN_MS ? w.taps + 1 : 1;
  w.lastTap = now;
  if (w.taps >= SPECIAL_TAPS) {
    w.taps = 0;
    const sp = specialFor(mood, personalityOf(w.index));
    w.mode = 'special';
    w.special = sp;
    w.modeUntil = now + SPECIAL_MS;
    w.reaction = null;
    if (SPECIALS[sp].run > 0 && (w.nx !== w.tx || w.ny !== w.ty)) {
      // 走り去る：くるりと向きを変える
      [w.tx, w.ty, w.nx, w.ny] = [w.nx, w.ny, w.tx, w.ty];
      w.t = 1 - w.t;
      w.left = !w.left;
    }
    return sp;
  }
  w.mode = 'react';
  w.special = null;
  w.modeUntil = now + REACT_MS;
  w.reaction = reactionFor(mood);
  return 'react';
}
