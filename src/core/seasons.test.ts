// v0.11 季節・天気・季節の行事のテスト
import { describe, expect, it } from 'vitest';
import { applyAction, type ActionResult } from './actions';
import { dateRange } from './date';
import { seasonKey, seasonOf, weatherOf } from './seasons';
import { simulate } from './simulate';
import type { SaveData } from './types';
import { day, goal, save, withChecks } from './testUtils';

const daily = { kind: 'daily' } as const;
function ok(r: ActionResult): SaveData {
  if (!r.ok) throw new Error(`失敗: ${r.error}`);
  return r.save;
}
// 開始日 day(0) = 2026-11-02（秋）。コインを稼いでおく
const rich = (patch: Partial<SaveData> = {}) =>
  withChecks(save([goal('a', daily)], { taxFrom: day(0), ...patch }), Array.from({ length: 20 }, (_, i) => [i, 'a', 'ideal'] as [number, string, 'ideal']));

describe('季節と天気', () => {
  it('月で季節が決まり、冬は12月と翌年1・2月で1つ', () => {
    expect(seasonOf('2026-03-01')).toBe('spring');
    expect(seasonOf('2026-08-31')).toBe('summer');
    expect(seasonOf('2026-11-30')).toBe('autumn');
    expect(seasonOf('2027-02-28')).toBe('winter');
    expect(seasonKey('2026-12-31')).toBe(seasonKey('2027-02-01'));
    expect(seasonKey('2026-12-31')).not.toBe(seasonKey('2027-12-01'));
  });

  it('天気は日付で決まり、ときどき雨。冬は雪', () => {
    const days = dateRange('2026-04-01', '2026-06-30').map(weatherOf);
    const rainy = days.filter(w => w === 'rain').length;
    expect(rainy).toBeGreaterThan(5);
    expect(rainy).toBeLessThan(45);
    expect(days.includes('snow')).toBe(false);
    expect(dateRange('2027-01-01', '2027-02-28').map(weatherOf).includes('rain')).toBe(false);
    expect(weatherOf('2026-05-05')).toBe(weatherOf('2026-05-05'));
  });
});

describe('季節の行事', () => {
  it('今の季節の行事だけ、季節ごとに1回、コインが足りれば開ける', () => {
    let s = rich();
    expect(applyAction(s, { type: 'holdEvent', id: 'e0', kind: 'hanami' }, day(20)).ok).toBe(false); // 秋にお花見は不可
    expect(applyAction(save([goal('a', daily)]), { type: 'holdEvent', id: 'e0', kind: 'shukaku' }, day(0)).ok).toBe(false); // コイン不足
    s = ok(applyAction(s, { type: 'holdEvent', id: 'e1', kind: 'shukaku' }, day(20)));
    expect(applyAction(s, { type: 'holdEvent', id: 'e2', kind: 'shukaku' }, day(21)).ok).toBe(false); // 2回目は不可
    expect(simulate(s, day(20)).coins).toBe(simulate(rich(), day(20)).coins - 150);
  });

  it('収穫祭：開いた日から3日間、理想達成のコイン +3', () => {
    const s = ok(applyAction(rich(), { type: 'holdEvent', id: 'e', kind: 'shukaku' }, day(18)));
    const r = simulate(s, day(22));
    const base = simulate(rich(), day(22));
    // 18・19日目のチェックが +3 ずつ（20日目以降はチェックなし）
    expect(r.coins - base.coins).toBe(-150 + 3 * 2);
  });

  it('餅つき：引っ越した住民が全員戻り、やる気 +5', () => {
    // 開始日を冬にする
    const W = '2026-12-01';
    const s0 = save([goal('a', daily)], { startDate: W, lastSeenDate: W, taxFrom: W, goals: [{ ...goal('a', daily, { createdOn: W }) }] });
    const sad = simulate(s0, '2026-12-25');
    expect(sad.population.away).toBeGreaterThan(0);
    const rich2 = withChecks(s0, []);
    const s = { ...rich2, checks: Object.fromEntries(dateRange('2026-12-01', '2026-12-10').map(d => [d, { a: 'ideal' as const }])) };
    const before = simulate(s, '2026-12-25');
    const held = ok(applyAction(s, { type: 'holdEvent', id: 'm', kind: 'mochitsuki' }, '2026-12-25'));
    const after = simulate(held, '2026-12-25');
    expect(after.population.away).toBe(0);
    expect(after.morale).toBeCloseTo(Math.min(100, before.morale + 5), 5);
  });

  it('夏祭り：3日間、税収が2倍', () => {
    const S = '2026-07-01';
    const g = goal('a', daily, { createdOn: S });
    const s0 = save([g], { startDate: S, lastSeenDate: S, taxFrom: S, checks: Object.fromEntries(dateRange(S, '2026-07-20').map(d => [d, { a: 'ideal' as const }])) });
    const held = ok(applyAction(s0, { type: 'holdEvent', id: 'f', kind: 'matsuri' }, '2026-07-15'));
    const r = simulate(held, '2026-07-20');
    const base = simulate(s0, '2026-07-20');
    const taxOn = (sim: typeof r, d: string) => sim.days.find(x => x.date === d)!.tax;
    expect(taxOn(r, '2026-07-15')).toBe(taxOn(base, '2026-07-15') * 2);
    expect(taxOn(r, '2026-07-17')).toBe(taxOn(base, '2026-07-17') * 2);
    expect(taxOn(r, '2026-07-18')).toBe(taxOn(base, '2026-07-18'));
  });
});
