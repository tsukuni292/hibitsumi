import { describe, expect, it } from 'vitest';
import {
  addDays, dateRange, diffDays, fromDayNumber, gameDateFromLocal, isGameDate, toDayNumber, weekday, weekStart,
} from './date';

describe('日付の変換', () => {
  it('1970-01-01 は 0 日目', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(fromDayNumber(0)).toBe('1970-01-01');
  });

  it('1999〜2101年の全日で往復変換が一致し、1日ずつ増える', () => {
    let prev = toDayNumber('1999-01-01');
    for (let n = prev; n <= toDayNumber('2101-12-31'); n++) {
      const d = fromDayNumber(n);
      expect(isGameDate(d)).toBe(true);
      expect(toDayNumber(d)).toBe(n);
      if (n > prev) expect(n - prev).toBe(1);
      prev = n;
    }
  });

  it('うるう年を正しく扱う', () => {
    expect(isGameDate('2024-02-29')).toBe(true);
    expect(isGameDate('2025-02-29')).toBe(false);
    expect(isGameDate('2100-02-29')).toBe(false);
    expect(isGameDate('2000-02-29')).toBe(true);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('月・年をまたぐ加算と差', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
    expect(diffDays('2026-11-05', '2026-10-30')).toBe(6);
  });

  it('不正な文字列は弾く', () => {
    expect(isGameDate('2026-13-01')).toBe(false);
    expect(isGameDate('2026-1-01')).toBe(false);
    expect(() => toDayNumber('abc')).toThrow();
  });
});

describe('曜日と週', () => {
  it('2026-11-05 は木曜、週の始まりは 11-02（月）', () => {
    expect(weekday('2026-11-05')).toBe(3);
    expect(weekday('2026-11-02')).toBe(0);
    expect(weekday('2026-11-08')).toBe(6);
    expect(weekStart('2026-11-05')).toBe('2026-11-02');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
  });

  it('1970年より前でも曜日が正しい', () => {
    expect(weekday('1969-12-31')).toBe(2); // 水曜
  });
});

describe('ゲーム日付（区切り時刻）', () => {
  it('区切り時刻より前は前日扱い', () => {
    expect(gameDateFromLocal(new Date(2026, 10, 5, 3, 59), 4)).toBe('2026-11-04');
    expect(gameDateFromLocal(new Date(2026, 10, 5, 4, 0), 4)).toBe('2026-11-05');
    expect(gameDateFromLocal(new Date(2026, 10, 5, 0, 30), 0)).toBe('2026-11-05');
  });

  it('元日の深夜は前年の大みそか', () => {
    expect(gameDateFromLocal(new Date(2027, 0, 1, 2, 0), 4)).toBe('2026-12-31');
  });
});

describe('dateRange', () => {
  it('両端を含み、逆順なら空', () => {
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(dateRange('2026-11-02', '2026-11-01')).toEqual([]);
  });
});
