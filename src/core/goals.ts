import { WEEKDAY_LABELS, weekday, type GameDate } from './date';
import { DIARY_DEFAULT_IDEAL_CHARS } from './rules';
import type { Frequency, Goal, GoalText, Timed } from './types';

/** date 時点で有効な値。最初の from より前なら null */
export function resolveTimed<T>(list: Timed<T>[], date: GameDate): T | null {
  let found: T | null = null;
  for (const item of list) {
    if (item.from <= date) found = item.value;
    else break;
  }
  return found;
}

/** from が同じものは置き換え、なければ昇順を保って挿入する */
export function upsertTimed<T>(list: Timed<T>[], from: GameDate, value: T): Timed<T>[] {
  const rest = list.filter(t => t.from !== from);
  rest.push({ from, value });
  rest.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return rest;
}

export function isActive(goal: Goal, date: GameDate): boolean {
  if (date < goal.createdOn) return false;
  if (goal.archivedFrom !== null && date >= goal.archivedFrom) return false;
  return true;
}

export function textOn(goal: Goal, date: GameDate): GoalText | null {
  return resolveTimed(goal.text, date);
}

export function frequencyOn(goal: Goal, date: GameDate): Frequency | null {
  return resolveTimed(goal.frequency, date);
}

/** 日次スコアの対象（毎日・曜日指定でその日が予定日） */
export function isScheduledDaily(goal: Goal, date: GameDate): boolean {
  if (!isActive(goal, date)) return false;
  const f = frequencyOn(goal, date);
  if (!f) return false;
  if (f.kind === 'daily') return true;
  if (f.kind === 'weekdays') return f.days.includes(weekday(date));
  return false;
}

export function isWeeklyOn(goal: Goal, date: GameDate): boolean {
  if (!isActive(goal, date)) return false;
  return frequencyOn(goal, date)?.kind === 'weekly';
}

/** 「課題があるときだけ」の目標か（チェックはせず、課題リストの提出で評価する） */
export function isAssignmentGoalOn(goal: Goal, date: GameDate): boolean {
  if (!isActive(goal, date)) return false;
  return frequencyOn(goal, date)?.kind === 'assignments';
}

/** その日にチェックできるか（予定日の目標、または週N回の目標） */
export function isCheckable(goal: Goal, date: GameDate): boolean {
  return isScheduledDaily(goal, date) || isWeeklyOn(goal, date);
}

export function hasMinimum(goal: Goal, date: GameDate): boolean {
  if (goal.type === 'diary') return true; // 日記は一言でも書けば「最低」
  const t = textOn(goal, date);
  return t !== null && t.minimum !== null && t.minimum.trim() !== '';
}

/** 日記の目標で「理想」になる文字数 */
export function idealCharsOn(goal: Goal, date: GameDate): number {
  return textOn(goal, date)?.idealChars ?? DIARY_DEFAULT_IDEAL_CHARS;
}

export function describeFrequency(f: Frequency): string {
  if (f.kind === 'daily') return '毎日';
  if (f.kind === 'weekly') return `週${f.times}回`;
  if (f.kind === 'assignments') return '課題があるとき';
  return [...f.days].sort((a, b) => a - b).map(d => WEEKDAY_LABELS[d]).join('・');
}
