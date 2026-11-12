// ゲームバランスの数値はすべてここに集める（調整しやすく、テストで参照できるように）
import type { CheckLevel, FacilityKind } from './types';

export const POINTS: Record<CheckLevel, number> = { ideal: 1, min: 0.5 };
export const COINS: Record<CheckLevel, number> = { ideal: 10, min: 4 };

export const MORALE_INITIAL = 50;
export const MORALE_MIN = 0;
export const MORALE_MAX = 100;

/** 日次スコア → やる気の増減（間は線形補間） */
export const MORALE_TABLE: ReadonlyArray<readonly [score: number, delta: number]> = [
  [0, -8],
  [0.25, -4],
  [0.5, 2],
  [0.75, 4],
  [1, 6],
];

/** これを超えると上がる量が半分 */
export const MORALE_SOFT_CAP = 80;
/** これ未満の日に 100% 達成すると復興ボーナス */
export const RECOVERY_THRESHOLD = 40;
export const RECOVERY_BONUS = 5;
/** 週N回目標の精算：(達成率 − 0.5) × この値 */
export const WEEKLY_FACTOR = 12;

/** 担当目標がこの回数連続で未達だと建物がさびれる */
export const FADE_AFTER_MISSES = 3;
/** 何もチェックしない日がこの日数を超えたら、それ以降は罰を止める */
export const ABSENCE_CAP_DAYS = 7;
export const REST_DAYS_PER_WEEK = 1;

/** 連続未達がこの数の倍数に達するたびに倒壊してレベルが1下がる */
export const COLLAPSE_EVERY = 7;

export const MAX_LEVEL = 9;
/** UPGRADE_COST[L-1] = レベル L → L+1 の費用（約1.6倍ずつ） */
export const UPGRADE_COST = [40, 64, 102, 164, 262, 419, 671, 1074] as const;
/** がれき（レベル0）からの再建費用 */
export const REBUILD_COST = 20;

export const MAX_GOALS = 12;
export const MAX_DAY_START_HOUR = 6;

export function upgradeCost(level: number): number | null {
  if (!Number.isInteger(level) || level < 0 || level >= MAX_LEVEL) return null;
  if (level === 0) return REBUILD_COST;
  return UPGRADE_COST[level - 1] ?? null;
}

// ---- 日記 ----
export const DIARY_DEFAULT_IDEAL_CHARS = 100;
export const DIARY_MAX_IDEAL_CHARS = 1000;
export const DIARY_MAX_LENGTH = 2000;

// 空白・改行と、見えない文字（ゼロ幅スペースなど）
const INVISIBLE = /[\s​-‍⁠﻿]/g;

const segmenter: { segment(s: string): Iterable<unknown> } | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;

/**
 * 空白・見えない文字を除いた、見た目の文字数（家族の絵文字や国旗も1文字）。
 * 先に見た目の1文字ずつに区切ってから、見えない文字だけの区切りを除く
 * （先に取り除くと、絵文字をつなぐ文字まで消えてバラバラに数えてしまう）。
 */
export function diaryChars(text: string): number {
  const parts: string[] = [];
  if (segmenter) {
    for (const seg of segmenter.segment(text)) parts.push((seg as { segment: string }).segment);
  } else {
    parts.push(...text);
  }
  return parts.filter(p => p.replace(INVISIBLE, '') !== '').length;
}

export function diaryLevel(text: string | undefined, idealChars: number): CheckLevel | null {
  const n = diaryChars(text ?? '');
  if (n >= Math.max(1, idealChars)) return 'ideal';
  if (n >= 1) return 'min';
  return null;
}

// ---- ToDo ----
export const TODO_COIN = 3;
export const TODO_DAILY_CAP = 5;
export const TODO_TITLE_MAX = 60;
export const MAX_OPEN_TODOS = 100;
/** 完了済みのToDoを一覧に残す日数 */
export const TODO_DONE_VISIBLE_DAYS = 7;

// ---- 課題（期限つきの提出物） ----
export const ASSIGNMENT_ONTIME_COIN = 15;
export const ASSIGNMENT_EARLY_BONUS = 5;
/** 期限のこの日数以上前に完了すると早め提出ボーナス */
export const ASSIGNMENT_EARLY_DAYS = 2;
/** コインがもらえる完了は1日この件数まで */
export const ASSIGNMENT_DAILY_CAP = 3;
/** 期限切れ1件ごとのやる気の減少 */
export const ASSIGNMENT_OVERDUE_PENALTY = 3;
export const ASSIGNMENT_TITLE_MAX = 60;
/** 期限は今日からこの日数先まで */
export const ASSIGNMENT_MAX_DAYS_AHEAD = 180;
export const MAX_OPEN_ASSIGNMENTS = 100;
export const MAX_WEEKLY_ASSIGNMENTS = 20;

// ---- 自由配置 ----
/** 建物の左端に置ける列の最大（街は16列、建物は2列幅） */
export const PLACE_MAX_COL = 14;
/** 置ける区画の上限 */
export const PLACE_MAX_BLOCKS = 30;
/** 位置を覚えておく物の数の上限（消した目標・施設の分も残るため余裕をもつ） */
export const PLACE_MAX_ITEMS = 300;

// ---- 自分で作る建物 ----
export const BUILDING_NAME_MAX = 10;
/** しばらく開かなかったとき、毎週の課題はこの日数前の分までさかのぼって出す */
export const WEEKLY_CATCHUP_DAYS = 14;

// ---- 施設 ----
export interface FacilityDef {
  label: string;
  coins: number;
  /** 建てるときに使うやる気 */
  morale: number;
  max: number;
  effect: string;
}

export const FACILITIES: Record<FacilityKind, FacilityDef> = {
  bench: { label: '縁台', coins: 60, morale: 0, max: 3, effect: '住民がひと休みできる（住民+1）' },
  sakura: { label: '桜', coins: 80, morale: 0, max: 3, effect: '街が華やぐ（住民+1）' },
  stall: { label: '屋台', coins: 100, morale: 0, max: 1, effect: 'ToDoのコイン +1' },
  teahouse: { label: '茶屋', coins: 150, morale: 0, max: 1, effect: '理想達成のコイン +2' },
  bathhouse: { label: '銭湯', coins: 250, morale: 10, max: 1, effect: 'やる気が下がる日の下がり幅を25%小さく' },
  shrine: { label: '神社', coins: 300, morale: 15, max: 1, effect: 'お守り：倒壊を1回防ぐ（使うと14日後に復活）' },
};

export const FACILITY_ORDER: FacilityKind[] = ['bench', 'sakura', 'stall', 'teahouse', 'bathhouse', 'shrine'];

/** やる気を使って建てるとき、使ったあとに残っていなければならないやる気 */
export const MORALE_SPEND_FLOOR = 20;
export const STALL_TODO_BONUS = 1;
export const TEAHOUSE_IDEAL_BONUS = 2;
export const BATHHOUSE_PENALTY_FACTOR = 0.75;
export const SHRINE_RECHARGE_DAYS = 14;

export function moraleDeltaForScore(score: number): number {
  const s = Math.min(1, Math.max(0, score));
  for (let i = 1; i < MORALE_TABLE.length; i++) {
    const [x1, y1] = MORALE_TABLE[i]!;
    const [x0, y0] = MORALE_TABLE[i - 1]!;
    if (s <= x1) return y0 + ((y1 - y0) * (s - x0)) / (x1 - x0);
  }
  return MORALE_TABLE[MORALE_TABLE.length - 1]![1];
}

/** 小数の誤差がたまらないよう、やる気は小数第2位で丸める */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type Tier = 'village' | 'town' | 'city';

export function tierForLevel(level: number): Tier {
  if (level >= 7) return 'city';
  if (level >= 4) return 'town';
  return 'village';
}

export type Stage = 'hamlet' | 'village' | 'town' | 'city';

export const STAGE_LABEL: Record<Stage, string> = {
  hamlet: '集落',
  village: '村',
  town: '町',
  city: '都市',
};

/** 発展段階は「有効な建物の平均レベル」で決める（目標の数に左右されない） */
export function stageForLevels(levels: number[]): Stage {
  if (levels.length === 0) return 'hamlet';
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  if (avg >= 7) return 'city';
  if (avg >= 4) return 'town';
  if (avg >= 2) return 'village';
  return 'hamlet';
}

export type Mood = 'happy' | 'neutral' | 'sad';

export function moodForMorale(morale: number): Mood {
  if (morale >= 60) return 'happy';
  if (morale >= 30) return 'neutral';
  return 'sad';
}
