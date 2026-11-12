// 季節・天気・季節の行事。季節と行事は本物の暦（ゲーム日の月）で決める。見た目の季節を設定で変えても、行事は変わらない
import { addDays, toDayNumber, type GameDate } from './date';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASON_LABEL: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

/** 3〜5月 春、6〜8月 夏、9〜11月 秋、12〜2月 冬 */
export function seasonOf(date: GameDate): Season {
  const m = Number(date.slice(5, 7));
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/** 「何年の何の季節」か。冬は12月と翌年の1・2月で1つ */
export function seasonKey(date: GameDate): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return `${m === 12 ? y + 1 : y}-${seasonOf(date)}`;
}

export type Weather = 'clear' | 'rain' | 'snow';

/** 日付から決まる天気（毎回同じ）。だいたい4日に1日は雨、冬は雪 */
export function weatherOf(date: GameDate): Weather {
  let h = toDayNumber(date) * 2654435761;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  if ((h % 100) >= 25) return 'clear';
  return seasonOf(date) === 'winter' ? 'snow' : 'rain';
}

// ---- 季節の行事（コインを使って開く。季節ごとに1回） ----

export type EventKind = 'hanami' | 'matsuri' | 'shukaku' | 'mochitsuki';

export interface EventDef {
  season: Season;
  label: string;
  coins: number;
  effect: string;
}

export const EVENTS: Record<EventKind, EventDef> = {
  hanami: { season: 'spring', label: 'お花見', coins: 120, effect: 'その場でやる気 +8' },
  matsuri: { season: 'summer', label: '夏祭り', coins: 150, effect: '開いた日から3日間、税収が2倍' },
  shukaku: { season: 'autumn', label: '収穫祭', coins: 150, effect: '開いた日から3日間、理想達成のコイン +3' },
  mochitsuki: { season: 'winter', label: '餅つき', coins: 120, effect: '引っ越した住民が全員戻り、やる気 +5' },
};

export const EVENT_FOR_SEASON: Record<Season, EventKind> = { spring: 'hanami', summer: 'matsuri', autumn: 'shukaku', winter: 'mochitsuki' };

export const HANAMI_MORALE = 8;
export const MOCHITSUKI_MORALE = 5;
/** 夏祭り・収穫祭の効果が続く日数（開いた日を含む） */
export const EVENT_EFFECT_DAYS = 3;
export const MATSURI_TAX_FACTOR = 2;
export const SHUKAKU_IDEAL_BONUS = 3;

/** その行事の効果が date に続いているか（開いた日から EVENT_EFFECT_DAYS 日） */
export function eventActiveOn(heldOn: GameDate, date: GameDate): boolean {
  return date >= heldOn && date < addDays(heldOn, EVENT_EFFECT_DAYS);
}
