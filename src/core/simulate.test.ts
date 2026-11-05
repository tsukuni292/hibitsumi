import { describe, expect, it } from 'vitest';
import { moraleDeltaForScore, stageForLevels, tierForLevel, upgradeCost } from './rules';
import { isFadedNow, simulate, summarizeSince } from './simulate';
import { day, goal, MON, save, withChecks } from './testUtils';

const daily = { kind: 'daily' } as const;

describe('やる気の増減表', () => {
  it('表の点と中間', () => {
    expect(moraleDeltaForScore(0)).toBe(-8);
    expect(moraleDeltaForScore(0.25)).toBe(-4);
    expect(moraleDeltaForScore(0.5)).toBe(2);
    expect(moraleDeltaForScore(0.75)).toBe(4);
    expect(moraleDeltaForScore(1)).toBe(6);
    expect(moraleDeltaForScore(0.125)).toBe(-6);
    expect(moraleDeltaForScore(-1)).toBe(-8);
    expect(moraleDeltaForScore(2)).toBe(6);
  });
});

describe('日次判定', () => {
  it('今日はまだ確定しない（やる気は初期値のまま）', () => {
    const s = withChecks(save([goal('a', daily)]), [[0, 'a', 'ideal']]);
    const r = simulate(s, day(0));
    expect(r.days).toHaveLength(0);
    expect(r.morale).toBe(50);
    expect(r.coins).toBe(10);
    expect(r.todayCoins).toBe(10);
  });

  it('未達 -8 / 最低 +2 / 理想 +6', () => {
    const g = [goal('a', daily)];
    expect(simulate(save(g), day(1)).morale).toBe(42);
    expect(simulate(withChecks(save(g), [[0, 'a', 'min']]), day(1)).morale).toBe(52);
    expect(simulate(withChecks(save(g), [[0, 'a', 'ideal']]), day(1)).morale).toBe(56);
  });

  it('理想と最低の混在は平均（0.75 → +4）', () => {
    const s = withChecks(save([goal('a', daily), goal('b', daily)]), [[0, 'a', 'ideal'], [0, 'b', 'min']]);
    const r = simulate(s, day(1));
    expect(r.days[0]?.score).toBe(0.75);
    expect(r.morale).toBe(54);
  });

  it('80を超えると上がる量が半分', () => {
    let s = save([goal('a', daily)]);
    for (let i = 0; i < 7; i++) s = withChecks(s, [[i, 'a', 'ideal']]);
    const r = simulate(s, day(7));
    expect(r.days.map(d => d.moraleAfter)).toEqual([56, 62, 68, 74, 80, 86, 89]);
  });

  it('やる気40未満で100%達成すると復興ボーナス +5', () => {
    const s = withChecks(save([goal('a', daily)]), [[2, 'a', 'ideal']]);
    const r = simulate(s, day(3));
    expect(r.days.map(d => d.moraleAfter)).toEqual([42, 34, 45]);
  });

  it('0未満にはならず、8日目以降の連続未チェックは罰を止める', () => {
    const r = simulate(save([goal('a', daily)]), day(10));
    expect(r.days.slice(0, 7).every(d => d.kind === 'normal')).toBe(true);
    expect(r.days[6]?.moraleAfter).toBe(0);
    expect(r.days.slice(7).every(d => d.kind === 'absent')).toBe(true);
    expect(r.buildings.a?.misses).toBe(7);
  });

  it('長期不在の上限は「罰を受けた日」で数える（予定の少ない目標でもさびれる）', () => {
    const s = save([goal('m', { kind: 'weekdays', days: [0] })]); // 月曜だけ、一度もチェックしない
    const r = simulate(s, day(22)); // 月曜を3回（day0, 7, 14）＋α
    expect(r.buildings.m?.misses).toBe(4); // day0, 7, 14, 21
    expect(r.days.filter(d => d.kind === 'absent')).toHaveLength(0);
    expect(r.days[15]?.kind).toBe('none'); // 予定のない日は 'absent' にならない
  });

  it('長期不在中の休養日（日曜）では週の精算をしない', () => {
    const s = save([goal('a', daily), goal('w', { kind: 'weekly', times: 2 })], { restDays: [day(13)] });
    const r = simulate(s, day(14));
    expect(r.days[13]?.kind).toBe('rest');
    expect(r.days[13]?.weekly).toEqual([]);
  });

  it('予定の目標がない日は判定なし（0除算で -8 にならない）', () => {
    const s = save([goal('a', { kind: 'weekdays', days: [0] })]); // 月曜だけ
    const r = simulate(withChecks(s, [[0, 'a', 'ideal']]), day(2));
    expect(r.days[1]?.kind).toBe('none');
    expect(r.days[1]?.score).toBeNull();
    expect(r.morale).toBe(56);
  });

  it('休養日は判定なしで、記録にチェックがあっても無視する', () => {
    const s = withChecks(save([goal('a', daily)], { restDays: [day(0)] }), [[0, 'a', 'ideal']]);
    const r = simulate(s, day(1));
    expect(r.days[0]?.kind).toBe('rest');
    expect(r.morale).toBe(50);
    expect(r.coins).toBe(0);
    expect(r.buildings.a?.misses).toBe(0);
  });

  it('同じ記録からは同じ結果（決定的）', () => {
    const s = withChecks(save([goal('a', daily), goal('b', { kind: 'weekly', times: 2 })]), [[0, 'a', 'ideal'], [3, 'b', 'min']]);
    expect(simulate(s, day(12))).toEqual(simulate(s, day(12)));
  });
});

describe('週N回の目標', () => {
  const weekly3 = { kind: 'weekly', times: 3 } as const;

  it('日次スコアの分母に入らない', () => {
    const s = save([goal('a', daily), goal('w', weekly3)]);
    const r = simulate(withChecks(s, [[0, 'a', 'ideal']]), day(1));
    expect(r.days[0]?.score).toBe(1);
  });

  it('週の締め：達成3/3で +6、0/3 で -6 と未達3回分', () => {
    const full = withChecks(save([goal('w', weekly3)]), [[0, 'w', 'ideal'], [2, 'w', 'min'], [4, 'w', 'ideal']]);
    const r1 = simulate(full, day(7));
    expect(r1.days[6]?.weekly).toEqual([{ goalId: 'w', count: 3, times: 3, delta: 6 }]);
    expect(r1.morale).toBe(56);

    const none = simulate(save([goal('w', weekly3)]), day(7));
    expect(none.morale).toBe(44);
    expect(none.buildings.w?.misses).toBe(3);
  });

  it('回数を超えても達成率は100%まで', () => {
    const s = withChecks(save([goal('w', { kind: 'weekly', times: 1 })]), [[0, 'w', 'ideal'], [1, 'w', 'ideal']]);
    expect(simulate(s, day(7)).days[6]?.weekly[0]?.delta).toBe(6);
  });

  it('週の途中で追加した目標は、その週は精算しない', () => {
    const s = save([goal('w', weekly3, { createdOn: day(2) })]);
    expect(simulate(s, day(7)).days[6]?.weekly).toEqual([]);
  });

  it('休養日でも週の締めは行う', () => {
    const s = save([goal('w', weekly3)], { restDays: [day(6)] });
    expect(simulate(s, day(7)).days[6]?.weekly[0]?.delta).toBe(-6);
  });
});

describe('さびれ', () => {
  it('3回連続未達でさびれ、1回達成で回復', () => {
    const s = save([goal('a', daily)]);
    const r = simulate(s, day(3));
    expect(r.days[2]?.newlyFaded).toEqual(['a']);
    expect(isFadedNow(s, r, s.goals[0]!)).toBe(true);

    // 今日チェックすると、その場で回復して見える
    const s2 = withChecks(s, [[3, 'a', 'min']]);
    expect(isFadedNow(s2, simulate(s2, day(3)), s2.goals[0]!)).toBe(false);

    const r3 = simulate(s2, day(4));
    expect(r3.days[3]?.recovered).toEqual(['a']);
  });

  it('予定日でない日は連続未達に数えない', () => {
    const s = save([goal('a', { kind: 'weekdays', days: [0, 2, 4] })]); // 月水金
    const r = simulate(s, day(4)); // 月〜木
    expect(r.buildings.a?.misses).toBe(2);
  });

  it('まとめでは、期間中にさびれて回復した建物は差し引きゼロ', () => {
    const s = withChecks(save([goal('a', daily)]), [[3, 'a', 'ideal']]);
    const r = simulate(s, day(4));
    const sum = summarizeSince(r, null);
    expect(sum?.newlyFaded).toEqual([]);
    expect(sum?.recovered).toEqual([]);
    expect(summarizeSince(r, day(2))?.recovered).toEqual(['a']);
  });
});

describe('コインと建設', () => {
  it('理想10・最低4。チェックを外すとコインも消える', () => {
    const s = withChecks(save([goal('a', daily), goal('b', daily)]), [[0, 'a', 'ideal'], [0, 'b', 'min']]);
    expect(simulate(s, day(0)).coins).toBe(14);
    const removed = { ...s, checks: { [day(0)]: { a: 'ideal' as const } } };
    expect(simulate(removed, day(0)).coins).toBe(10);
  });

  it('建設で費用が引かれ、レベルが上がる', () => {
    let s = save([goal('a', daily)]);
    for (let i = 0; i < 4; i++) s = withChecks(s, [[i, 'a', 'ideal']]);
    s = { ...s, upgrades: [{ date: day(3), goalId: 'a' }] };
    const r = simulate(s, day(3));
    expect(r.coins).toBe(0);
    expect(r.buildings.a?.level).toBe(2);
  });

  it('その日の終わりにさびれていた建物の建て替えは無効（コインも減らない）', () => {
    let s = save([goal('a', daily), goal('b', daily)]);
    for (let i = 0; i < 5; i++) s = withChecks(s, [[i, 'b', 'ideal']]);
    // a は day0〜3 未達でさびれ。day4 にチェック→建て替え→チェックを外した状態
    s = { ...s, upgrades: [{ date: day(4), goalId: 'a' }] };
    const r = simulate(s, day(4));
    expect(r.buildings.a?.level).toBe(1);
    expect(r.coins).toBe(50);
    // チェックが残っていれば有効
    const r2 = simulate(withChecks(s, [[4, 'a', 'min']]), day(4));
    expect(r2.buildings.a?.level).toBe(2);
    expect(r2.coins).toBe(50 + 4 - 40);
  });

  it('前日のチェックを後から直すと、結果も直る', () => {
    const s = save([goal('a', daily)]);
    expect(simulate(s, day(1)).morale).toBe(42);
    expect(simulate(withChecks(s, [[0, 'a', 'ideal']]), day(1)).morale).toBe(56);
  });

  it('費用表と段階', () => {
    expect(upgradeCost(1)).toBe(40);
    expect(upgradeCost(8)).toBe(1074);
    expect(upgradeCost(9)).toBeNull();
    expect(tierForLevel(3)).toBe('village');
    expect(tierForLevel(4)).toBe('town');
    expect(tierForLevel(7)).toBe('city');
    expect(stageForLevels([])).toBe('hamlet');
    expect(stageForLevels([1, 3])).toBe('village');
    expect(stageForLevels([7, 7])).toBe('city');
  });
});

describe('連続記録', () => {
  it('休養日は途切れず、チェックなしの日で途切れる', () => {
    const g = [goal('a', daily)];
    let s = withChecks(save(g, { restDays: [day(2)] }), [[0, 'a', 'ideal'], [1, 'a', 'min'], [3, 'a', 'ideal']]);
    expect(simulate(s, day(4)).streak).toBe(3);
    s = withChecks(s, [[5, 'a', 'ideal']]);
    expect(simulate(s, day(6)).streak).toBe(1); // day(4) で途切れた
  });

  it('今日チェック済みなら今日も数える', () => {
    const s = withChecks(save([goal('a', daily)]), [[0, 'a', 'ideal']]);
    expect(simulate(s, day(0)).streak).toBe(1);
  });
});

describe('開始日', () => {
  it('開始日より前の今日（時計の異常）でも落ちない', () => {
    const r = simulate(save([goal('a', daily)]), '2026-10-01');
    expect(r.days).toEqual([]);
    expect(r.morale).toBe(50);
    expect(MON).toBe('2026-11-02');
  });
});
