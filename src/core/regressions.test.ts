// 点検（v0.12 のレビュー）で見つかった不具合の再発防止テスト
import { describe, expect, it } from 'vitest';
import { applyAction, type ActionResult } from './actions';
import { dateRange } from './date';
import { simulate } from './simulate';
import { FARM_TAX_MAX, TERRAIN_MAX_LOG, type TerrainEntry } from './terrain';
import type { SaveData } from './types';
import { day, goal, save } from './testUtils';
import { buildNotificationPlan, BODY_MAX, DEFAULT_NOTIFY_SETTINGS, timeOn } from '../app/notifyPlan';
import { parseSave } from '../storage/schema';

const daily = { kind: 'daily' } as const;
const asg = { kind: 'assignments' } as const;
function ok(r: ActionResult): SaveData {
  if (!r.ok) throw new Error(`失敗: ${r.error}`);
  return r.save;
}

describe('通知', () => {
  it('課題の名前が長く多くても、通知の文はサーバーの上限より短い', () => {
    const long = 'あ'.repeat(60);
    const assignments = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, goalId: 's', title: `${long}${i}`, due: day(i % 2 ? 1 : 0), createdOn: day(0), doneOn: null }));
    const s = save([goal('s', asg), ...Array.from({ length: 5 }, (_, i) => goal(`${'目標'.repeat(12)}${i}`, daily))], { assignments });
    const plan = buildNotificationPlan(s, day(0), new Date(2026, 10, 2, 7, 0), DEFAULT_NOTIFY_SETTINGS);
    expect(plan.length).toBeGreaterThan(0);
    for (const n of plan) expect([...n.body].length).toBeLessThanOrEqual(BODY_MAX);
  });

  it('区切り時刻より前の時刻は、そのゲーム日の終わり（暦の翌日）に送る', () => {
    expect(timeOn('2026-11-02', '00:30', 4).getDate()).toBe(3);
    expect(timeOn('2026-11-02', '21:00', 4).getDate()).toBe(2);
    const s = save([goal('a', daily)]);
    const plan = buildNotificationPlan(s, day(0), new Date(2026, 10, 2, 22, 0), { ...DEFAULT_NOTIFY_SETTINGS, morning: null, evening: '00:30' });
    expect(plan[0]?.tag).toBe(`evening-${day(0)}`);
  });
});

describe('毎週の課題', () => {
  it('来週から課題型になる目標には、今週分を足さず、締切が課題型でない日なら罰もない', () => {
    // 週N回の目標を、来週の月曜から課題型に切り替える予定にしてから毎週の課題を登録（水曜）
    const g = { ...goal('s', { kind: 'weekly', times: 2 }), frequency: [{ from: day(0), value: { kind: 'weekly' as const, times: 2 } }, { from: day(7), value: asg }] };
    const s = ok(applyAction(save([g]), { type: 'addWeeklyAssignment', id: 'w', goalId: 's', title: '統計', issueDay: 0, dueDay: 4 }, day(2)));
    expect(s.assignments).toEqual([]);
    // 古いデータに残っていても、課題型でない日の締切は罰にならない
    const stale = { ...s, assignments: [{ id: 'x', goalId: 's', title: 'x', due: day(4), createdOn: day(2), doneOn: null }] };
    expect(simulate(stale, day(6)).days[4]?.overdue).toEqual([]);
  });

  it('未完了の課題が多くても、毎週の課題は飛ばされない', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `o${i}`, goalId: 's', title: 'o', due: day(60), createdOn: day(0), doneOn: null }));
    let s = ok(applyAction(save([goal('s', asg)]), { type: 'addWeeklyAssignment', id: 'w', goalId: 's', title: '統計', issueDay: 0, dueDay: 3 }, day(1)));
    s = ok(applyAction({ ...s, assignments: [...s.assignments, ...many] }, { type: 'touch' }, day(7)));
    expect(s.assignments.some(a => a.id === `w@${day(7)}`)).toBe(true);
  });
});

describe('地形', () => {
  it('田んぼ・畑の税収の上乗せは1日50まで', () => {
    const log: TerrainEntry[] = [];
    for (let y = 1; y < 100 && log.length < 400; y++) {
      if (y % 4 === 0) continue;
      for (let x = 0; x < 16; x++) log.push({ date: day(0), x, y, kind: 'paddy' });
    }
    const s = save([goal('a', daily)], { taxFrom: day(0), terrainLog: log, checks: Object.fromEntries(dateRange(day(0), day(3)).map(d => [d, { a: 'ideal' as const }])) });
    expect(simulate(s, day(3)).farmTax).toBe(FARM_TAX_MAX);
  });

  it('記録が上限に達しても「消す」はできる', () => {
    const log: TerrainEntry[] = Array.from({ length: TERRAIN_MAX_LOG }, (_, i) => ({ date: day(0), x: i % 16, y: 1, kind: i % 2 ? null : 'road' }));
    const s = save([goal('a', daily)], { terrainLog: log });
    expect(applyAction(s, { type: 'paintTerrain', x: 0, y: 1, kind: 'road' }, day(0)).ok).toBe(false);
    expect(applyAction(s, { type: 'paintTerrain', x: 0, y: 1, kind: null }, day(0)).ok).toBe(true);
  });
});

describe('データの移行', () => {
  it('v6 → v7：税収は最後に開いた日から数える（過去の分をまとめて受け取らない）', () => {
    const { taxFrom: _t, events: _e, terrainLog: _l, ...v6 } = save([goal('a', daily)], { lastSeenDate: day(30) });
    const r = parseSave({ ...v6, schemaVersion: 6 });
    expect(r).toMatchObject({ ok: true, migratedFrom: 6, save: { taxFrom: day(30), events: [], terrainLog: [] } });
  });
});
