// 住民の見た目（色の差し替え）とやる気。見た目は番号ごとに必ず異なる組み合わせになる。
import { moodForMorale, type Mood } from '../core/rules';

const HAIR = ['#7a4b33', '#3b2a2e', '#2f3442', '#a0603a', '#d9ae79', '#6b5a7a'];
const SKIN: Array<[string, string]> = [
  ['#f8d2ab', '#df9f7f'],
  ['#f3c9a0', '#d69a72'],
  ['#e0b08a', '#c08060'],
  ['#fbe0c4', '#e6b394'],
];
const SHIRT = ['#ee7b78', '#73a7c6', '#8cc56a', '#f2cf6b', '#b07cc6', '#f0957f', '#5c9a4e', '#e3a96b'];
const PANTS = ['#6a86c9', '#4b4a5a', '#85543a', '#5c9a4e', '#978d88'];

export const LOOK_COUNT = HAIR.length * SKIN.length * SHIRT.length * PANTS.length; // 960
// LOOK_COUNT と互いに素な数を掛けて並べ替え、隣り合う住民の見た目が似すぎないようにする
const STRIDE = 389;

export interface ResidentLook {
  /** スプライトの文字 → 置き換える色 */
  swap: Record<string, string>;
  key: string;
}

export function residentLook(index: number): ResidentLook {
  let n = (((index * STRIDE) % LOOK_COUNT) + LOOK_COUNT) % LOOK_COUNT;
  const shirt = n % SHIRT.length; n = Math.floor(n / SHIRT.length);
  const hair = n % HAIR.length; n = Math.floor(n / HAIR.length);
  const skin = n % SKIN.length; n = Math.floor(n / SKIN.length);
  const pants = n % PANTS.length;
  const [s0, s1] = SKIN[skin]!;
  return {
    swap: { b: HAIR[hair]!, f: s0, F: s1, u: SHIRT[shirt]!, v: PANTS[pants]! },
    key: `${hair}-${skin}-${shirt}-${pants}`,
  };
}

/** 住民ごとに少しずつ気分をばらつかせる（全員が同じ表情にならないように） */
export function residentMood(index: number, morale: number): Mood {
  return moodForMorale(morale + ((index % 5) - 2) * 6);
}

export function residentCount(houses: number): number {
  return 2 + houses * 2;
}

const LINES: Record<Mood, string[]> = {
  happy: ['今日もいい日になりそう！', 'リーダーのおかげで街が元気です', 'みんな張り切ってますよ', 'この調子でいきましょう！'],
  neutral: ['今日はどの目標から始めます？', 'ぼちぼちやっていきましょう', '最低ラインだけでも、みんな喜びますよ'],
  sad: ['最近ちょっと元気が出なくて…', 'リーダー、今日は1つだけでも…', '街がさみしくなってきました'],
};

export function residentLine(mood: Mood, seed: number): string {
  const list = LINES[mood];
  return list[((seed % list.length) + list.length) % list.length]!;
}
