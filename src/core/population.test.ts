// v0.10 人口と税収のテスト
import { describe, expect, it } from 'vitest';
import { simulate } from './simulate';
import type { SaveData } from './types';
import { day, goal, save, withChecks } from './testUtils';

const daily = { kind: 'daily' } as const;
const base = (patch: Partial<SaveData> = {}) => save([goal('a', daily)], { taxFrom: day(0), ...patch });

describe('人口', () => {
  it('最初は 民家の住民（2+1軒×2）＋建物のレベル1 ＝ 5人', () => {
    const p = simulate(base(), day(0)).population;
    expect(p).toMatchObject({ houses: 4, buildings: 1, facilities: 0, activity: 0, away: 0, total: 5 });
  });

  it('活動した日が7日たまると1人増える', () => {
    const s = withChecks(base(), Array.from({ length: 7 }, (_, i) => [i, 'a', 'ideal'] as [number, string, 'ideal']));
    expect(simulate(s, day(6)).population.activity).toBe(1);
    expect(simulate(s, day(5)).population.activity).toBe(0);
  });

  it('しょんぼりで終わった日は1人引っ越し、2人より減らない', () => {
    // やる気が低い状態から、何もしない日が続く
    const s = base();
    const r = simulate(s, day(20));
    expect(r.population.total).toBeGreaterThanOrEqual(2);
    expect(r.days.some(d => d.movedOut > 0)).toBe(true);
  });
});

describe('税収', () => {
  it('活動した日だけ、その日の終わりの人口×0.5（切り捨て）', () => {
    const s = withChecks(base(), [[0, 'a', 'ideal']]);
    const r = simulate(s, day(2));
    expect(r.days[0]?.tax).toBe(Math.floor(r.days[0]!.population * 0.5));
    expect(r.days[0]!.tax).toBeGreaterThan(0);
    expect(r.days[1]?.tax).toBe(0);
  });

  it('税収を数え始める日より前は、税収も引っ越しもない', () => {
    const s = withChecks(base({ taxFrom: day(5) }), [[0, 'a', 'ideal'], [6, 'a', 'ideal']]);
    const r = simulate(s, day(7));
    expect(r.days[0]?.tax).toBe(0);
    expect(r.days.slice(0, 5).every(d => d.movedOut === 0)).toBe(true);
    expect(r.days[6]!.tax).toBeGreaterThan(0);
  });

  it('今日活動すると入る税収を前もって見せる', () => {
    const r = simulate(withChecks(base(), [[0, 'a', 'ideal']]), day(0));
    expect(r.activeToday).toBe(true);
    expect(r.taxToday).toBe(Math.floor(r.population.total * 0.5));
  });
});
