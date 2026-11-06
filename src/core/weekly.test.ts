// 毎週の課題（出る曜日に課題リストへ自動追加）のテスト
import { describe, expect, it } from 'vitest';
import { applyAction, type ActionResult } from './actions';
import { simulate } from './simulate';
import type { SaveData } from './types';
import { day, goal, save } from './testUtils';
import { issueWeeklyAssignments, weeklyDueOffset } from './weekly';

const asg = { kind: 'assignments' } as const;

function ok(r: ActionResult): SaveData {
  if (!r.ok) throw new Error(`失敗: ${r.error}`);
  return r.save;
}
// day(0) は月曜。月曜(0)に出て木曜(3)締切
const add = (s: SaveData, today: number, issueDay = 0, dueDay = 3) =>
  ok(applyAction(s, { type: 'addWeeklyAssignment', id: 'w', goalId: 's', title: '統計', issueDay, dueDay }, day(today)));
const base = () => save([goal('s', asg)]);

describe('締切までの日数', () => {
  it('翌日以降で最初の締切曜日。同じ曜日なら1週間後', () => {
    expect(weeklyDueOffset(0, 3)).toBe(3);
    expect(weeklyDueOffset(3, 0)).toBe(4);
    expect(weeklyDueOffset(2, 2)).toBe(7);
    expect(weeklyDueOffset(6, 0)).toBe(1);
  });
});

describe('登録したとき', () => {
  it('出る曜日に登録すると、今日の分が出る（今日登録した扱い）', () => {
    const s = add(base(), 0);
    expect(s.assignments).toEqual([
      expect.objectContaining({ id: `w@${day(0)}`, due: day(3), createdOn: day(0), weeklyId: 'w' }),
    ]);
    expect(s.assignments[0]?.preRegistered).toBeUndefined();
  });

  it('今週すでに出ていて締切が先なら追加、締切当日・過ぎていれば追加しない', () => {
    expect(add(base(), 2).assignments.map(a => a.due)).toEqual([day(3)]); // 水曜
    expect(add(base(), 3).assignments).toEqual([]); // 木曜（締切当日）
    expect(add(base(), 5).assignments).toEqual([]);
  });

  it('課題型でない目標・不正な曜日は登録できない', () => {
    const r = applyAction(save([goal('s', { kind: 'daily' })]), { type: 'addWeeklyAssignment', id: 'w', goalId: 's', title: 'x', issueDay: 0, dueDay: 3 }, day(0));
    expect(r.ok).toBe(false);
    expect(applyAction(base(), { type: 'addWeeklyAssignment', id: 'w', goalId: 's', title: 'x', issueDay: 7, dueDay: 3 }, day(0)).ok).toBe(false);
  });
});

describe('毎週の自動追加', () => {
  it('翌週の出る曜日に、前もって登録済みとして出る（何度呼んでも1件）', () => {
    let s = add(base(), 2);
    s = ok(applyAction(s, { type: 'touch' }, day(7)));
    s = ok(applyAction(s, { type: 'touch' }, day(7)));
    const next = s.assignments.filter(a => a.createdOn === day(7));
    expect(next).toEqual([expect.objectContaining({ id: `w@${day(7)}`, due: day(10), preRegistered: true })]);
  });

  it('出た当日に完了してもコインがもらえる（2日以上前なので +20）', () => {
    let s = add(base(), 2);
    s = ok(applyAction(s, { type: 'touch' }, day(7)));
    const r = applyAction(s, { type: 'toggleAssignment', id: `w@${day(7)}` }, day(7));
    expect(r.ok && r.note).toBeUndefined();
    expect(simulate(ok(r), day(7)).todayCoins).toBe(20);
  });

  it('登録した当日に出た分は、当日の完了はコインなし', () => {
    const s = add(base(), 0);
    const r = applyAction(s, { type: 'toggleAssignment', id: `w@${day(0)}` }, day(0));
    expect(r.ok && r.note).toContain('当日');
    expect(simulate(ok(r), day(0)).todayCoins).toBe(0);
  });

  it('しばらく開かなくても、出るはずだった分は出る（締切を過ぎたものは罰の対象）', () => {
    let s = add(base(), 2);
    s = ok(applyAction(s, { type: 'touch' }, day(15)));
    expect(s.assignments.map(a => a.createdOn)).toEqual([day(2), day(7), day(14)]);
    expect(simulate(s, day(15)).days.find(d => d.date === day(10))?.overdue).toEqual([`w@${day(7)}`]);
  });

  it('担当の目標が課題型でない日・やめた後は出ない', () => {
    let s = add(base(), 2);
    s = ok(applyAction(s, { type: 'deleteWeeklyAssignment', id: 'w' }, day(3)));
    s = ok(applyAction(s, { type: 'touch' }, day(7)));
    expect(s.assignments).toHaveLength(1); // もう出ていた分は残る
    const archived = issueWeeklyAssignments(
      { ...add(base(), 2), goals: [{ ...goal('s', asg), archivedFrom: day(5) }] },
      day(7),
    );
    expect(archived.assignments).toHaveLength(1);
  });

  it('休講の週は、締切前なら消せて、また出てこない', () => {
    let s = add(base(), 2);
    s = ok(applyAction(s, { type: 'touch' }, day(7)));
    s = ok(applyAction(s, { type: 'deleteAssignment', id: `w@${day(7)}` }, day(7)));
    s = ok(applyAction(s, { type: 'touch' }, day(8)));
    expect(s.assignments.some(a => a.id === `w@${day(7)}`)).toBe(false);
  });
});
