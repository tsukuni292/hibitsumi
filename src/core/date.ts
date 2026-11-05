// ゲーム日付ユーティリティ
// 日付は "YYYY-MM-DD" 文字列で扱う。計算は「1970-01-01 からの日数」に変換して行い、
// Date 型のタイムゾーンや夏時間の影響を受けないようにする。

export type GameDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isGameDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
}

// Howard Hinnant の days_from_civil アルゴリズム
export function toDayNumber(date: GameDate): number {
  const m = DATE_RE.exec(date);
  if (!m || !isGameDate(date)) throw new Error(`不正な日付: ${date}`);
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  y -= mo <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(n: number): GameDate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(date: GameDate, n: number): GameDate {
  return fromDayNumber(toDayNumber(date) + n);
}

export function diffDays(a: GameDate, b: GameDate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** 曜日。0=月曜 … 6=日曜（週は月曜はじまり） */
export function weekday(date: GameDate): number {
  // 1970-01-01 は木曜（=3）
  return (((toDayNumber(date) + 3) % 7) + 7) % 7;
}

/** その日を含む週の月曜日 */
export function weekStart(date: GameDate): GameDate {
  return addDays(date, -weekday(date));
}

export function isSunday(date: GameDate): boolean {
  return weekday(date) === 6;
}

/** 文字列のまま比較できる（YYYY-MM-DD はゼロ埋めなので辞書順＝日付順） */
export function maxDate(a: GameDate, b: GameDate): GameDate {
  return a >= b ? a : b;
}

/**
 * 端末のローカル時刻からゲーム日付を求める。
 * 区切り時刻（dayStartHour）より前は前日扱い。
 * 夏時間などで時刻が飛んでも、「ローカルの年月日と時」だけを使うので結果は一意。
 */
export function gameDateFromLocal(now: Date, dayStartHour: number): GameDate {
  const local: GameDate = `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return now.getHours() < dayStartHour ? addDays(local, -1) : local;
}

/** from 〜 to（両端を含む）の日付を順に返す。from > to なら空 */
export function dateRange(from: GameDate, to: GameDate): GameDate[] {
  const out: GameDate[] = [];
  const a = toDayNumber(from), b = toDayNumber(to);
  for (let n = a; n <= b; n++) out.push(fromDayNumber(n));
  return out;
}

export const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;
