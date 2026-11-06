// v0.5 の課題リスト（期限つきの提出物）と、頻度の変更が反映される日のテスト
import { describe, expect, it } from 'vitest';
import { acceptsAssignments, applyAction, type ActionResult } from './actions';
import { frequencyOn } from './goals';
import { isCollapseImminent, isFadedNow, simulate } from './simulate';
import type { Assignment, Frequency, SaveData } from './types';
import { day, goal, save, withChecks } from './testUtils';

const daily = { kind: 'daily' } as const;
const asg = { kind: 'assignments' } as const;

function ok(r: ActionResult): SaveData {
  if (!r.ok) throw new Error(`失敗: ${r.error}`);
  return r.save;
}
function err(r: ActionResult): string {
  if (r.ok) throw new Error('成功してしまった');
  return r.error;
}
const task = (id: string, due: number, doneOn: number | null, goalId = 's'): Assignment => ({
  id, goalId, title: id, due: day(due), createdOn: day(0), doneOn: doneOn === null ? null : day(doneOn),
});

describe('課題の報酬', () => {
  const s = (assignments: Assignment[]) => save([goal('s', asg)], { assignments });

  it('期限内 +15、2日以上前なら +20、期限後は 0', () => {
    expect(simulate(s([task('a', 3, 3)]), day(3)).todayCoins).toBe(15); // 当日
    expect(simulate(s([task('a', 3, 2)]), day(2)).todayCoins).toBe(15); // 1日前
    expect(simulate(s([task('a', 3, 1)]), day(1)).todayCoins).toBe(20); // 2日前
    expect(simulate(s([task('a', 3, 4)]), day(4)).todayCoins).toBe(0); // 期限後
  });

  it('コインがもらえるのは1日3件まで', () => {
    const list = ['a', 'b', 'c', 'd'].map(id => task(id, 5, 5));
    const r = simulate(s(list), day(5));
    expect(r.todayCoins).toBe(45);
    expect(r.assignmentRewardsLeft).toBe(0);
  });

  it('毎日の達成率には入らない', () => {
    const sv = withChecks(save([goal('a', daily), goal('s', asg)]), [[0, 'a', 'ideal']]);
    expect(simulate(sv, day(1)).days[0]?.score).toBe(1);
  });

  it('課題の完了は「その日の活動」として連続記録に数える', () => {
    expect(simulate(s([task('a', 3, 1)]), day(2)).streak).toBe(1);
  });
});

describe('レビューで見つかった抜け道・不具合の再発防止', () => {
  it('登録した当日の完了は、コインも回復も活動もなし', () => {
    const a: Assignment = { ...task('a', 30, null), createdOn: day(4), doneOn: day(4) };
    const sv = save([goal('s', asg)], { assignments: [a] });
    const r = simulate(sv, day(4));
    expect(r.todayCoins).toBe(0);
    expect(r.streak).toBe(0);
    // 前日までに登録してあれば対象
    const b: Assignment = { ...a, createdOn: day(3) };
    expect(simulate(save([goal('s', asg)], { assignments: [b] }), day(4)).todayCoins).toBe(20);
  });

  it('課題型でなくなった目標・削除した目標の課題は、コインも回復もなし', () => {
    const g = { ...goal('s', daily), frequency: [{ from: day(0), value: asg }, { from: day(3), value: daily }] };
    const sv = save([g], { assignments: [task('a', 9, 4)] });
    const r = simulate(sv, day(5));
    expect(r.days[4]?.assignmentCoins).toBe(0);
    expect(r.buildings.s?.misses).toBe(2); // day3, day4 の毎日の未達はそのまま
    const archived = { ...goal('s', asg), archivedFrom: day(3) };
    expect(simulate(save([archived], { assignments: [task('a', 9, 4)] }), day(4)).todayCoins).toBe(0);
  });

  it('期限切れは必ず1件 −3（やる気が高くても打ち消されない）', () => {
    let sv = save([goal('a', daily), goal('s', asg)], { assignments: [task('x', 11, null)] });
    for (let i = 0; i < 12; i++) sv = withChecks(sv, [[i, 'a', 'ideal']]);
    const r = simulate(sv, day(12));
    expect(r.days[10]?.moraleAfter).toBe(100);
    expect(r.days[11]?.moraleAfter).toBe(97);
  });

  it('休養日は課題を完了しても連続記録が増えて見えない', () => {
    const sv = save([goal('s', asg)], { assignments: [task('a', 5, 2)], restDays: [day(2)] });
    expect(simulate(sv, day(2)).streak).toBe(0);
  });

  it('期限当日は、期限の変更も削除もできない', () => {
    const sv = save([goal('s', asg)], { assignments: [task('x', 2, null)] });
    expect(err(applyAction(sv, { type: 'editAssignment', id: 'x', title: 'x', due: day(5) }, day(2)))).toContain('期限当日');
    expect(err(applyAction(sv, { type: 'deleteAssignment', id: 'x' }, day(2)))).toContain('期限当日');
  });

  it('期限は180日先まで', () => {
    const sv = save([goal('s', asg)]);
    expect(err(applyAction(sv, { type: 'addAssignment', id: 'x', goalId: 's', title: 't', due: day(181) }, day(0)))).toContain('180日');
    expect(applyAction(sv, { type: 'addAssignment', id: 'x', goalId: 's', title: 't', due: day(180) }, day(0)).ok).toBe(true);
  });

  it('前日の分は「昨日完了」にできる（期限が昨日でも期限内として扱う）', () => {
    const sv = save([goal('s', asg)], { assignments: [task('x', 2, null)] });
    const s1 = ok(applyAction(sv, { type: 'toggleAssignment', id: 'x', date: day(2) }, day(3)));
    expect(s1.assignments[0]?.doneOn).toBe(day(2));
    const r = simulate(s1, day(3));
    expect(r.days[2]?.overdue).toEqual([]);
    expect(r.days[2]?.assignmentCoins).toBe(15);
    expect(err(applyAction(sv, { type: 'toggleAssignment', id: 'x', date: day(1) }, day(3)))).toContain('今日か前日');
  });

  it('1日の上限を超えたら、報酬の多いものから数える', () => {
    const list = [task('a', 5, 4), task('b', 5, 4), task('c', 5, 4), task('d', 9, 4)]; // d だけ早め提出
    const r = simulate(save([goal('s', asg)], { assignments: list }), day(4));
    expect(r.todayCoins).toBe(20 + 15 + 15);
  });

  it('今の頻度を選び直すと、予定の取り消しになる', () => {
    const sv = save([goal('g', daily)]);
    const edit = (frequency: Frequency) => ({ type: 'editGoal' as const, goalId: 'g', building: 'school' as const, text: { name: 'g', ideal: '理想', minimum: '最低' }, frequency });
    const s1 = ok(applyAction(sv, edit(asg), day(3)));
    const r = applyAction(s1, edit(daily), day(3));
    expect(ok(r).goals[0]?.frequency).toEqual([{ from: day(0), value: daily }]);
    expect(r.ok && r.note).toContain('取り消しました');
  });

  it('週N回から課題型への切り替え予定があれば、切り替え前から課題を書ける', () => {
    const g = { ...goal('g', { kind: 'weekly', times: 2 }), frequency: [{ from: day(0), value: { kind: 'weekly' as const, times: 2 } }, { from: day(7), value: asg }] };
    expect(acceptsAssignments(g, day(3))).toBe(true);
    expect(acceptsAssignments(goal('h', daily), day(3))).toBe(false);
  });
});

describe('課題の期限切れ', () => {
  const s = (assignments: Assignment[], patch: Partial<SaveData> = {}) => save([goal('s', asg)], { assignments, ...patch });

  it('期限日の終わりに未完了なら、やる気 −3 と未達1回', () => {
    const r = simulate(s([task('a', 2, null)]), day(3));
    expect(r.days[2]?.overdue).toEqual(['a']);
    expect(r.days[2]?.moraleAfter).toBe(47);
    expect(r.buildings.s?.misses).toBe(1);
  });

  it('期限当日はまだ罰なし（今日は確定していない）', () => {
    const r = simulate(s([task('a', 2, null)]), day(2));
    expect(r.morale).toBe(50);
    expect(r.days.flatMap(d => d.overdue)).toEqual([]);
  });

  it('期限後に完了しても罰は残り、コインは0', () => {
    const r = simulate(s([task('a', 2, 3)]), day(4));
    expect(r.days[2]?.overdue).toEqual(['a']);
    expect(r.days[3]?.assignmentCoins).toBe(0);
  });

  it('休養日が期限でも罰あり', () => {
    const r = simulate(s([task('a', 2, null)], { restDays: [day(2)] }), day(3));
    expect(r.days[2]?.kind).toBe('rest');
    expect(r.days[2]?.overdue).toEqual(['a']);
    expect(r.morale).toBe(47);
  });

  it('期限内に完了すれば連続未達が0に戻り、さびれも今日から回復して見える', () => {
    const list = [task('a', 0, null), task('b', 1, null), task('c', 2, null), task('d', 5, null)];
    const sv = s(list);
    const r = simulate(sv, day(3));
    expect(r.buildings.s?.misses).toBe(3);
    expect(isFadedNow(sv, r, sv.goals[0]!)).toBe(true);
    const done = s([...list.slice(0, 3), task('d', 5, 3)]);
    expect(isFadedNow(done, simulate(done, day(3)), done.goals[0]!)).toBe(false);
    expect(simulate(done, day(4)).buildings.s?.misses).toBe(0);
  });

  it('長期不在中は課題の罰も止める', () => {
    const sv = save([goal('a', daily), goal('s', asg)], { assignments: [task('x', 10, null)] });
    const r = simulate(sv, day(11));
    expect(r.days[9]?.kind).toBe('absent');
    expect(r.days[10]?.overdue).toEqual([]);
  });

  it('期限が今日で未完了なら倒壊寸前の予告を出す', () => {
    const list = [0, 1, 2, 3, 4, 5].map(i => task(`p${i}`, i, null)).concat(task('t', 6, null));
    const sv = s(list);
    const r = simulate(sv, day(6));
    expect(r.buildings.s?.misses).toBe(6);
    expect(isCollapseImminent(sv, r, sv.goals[0]!)).toBe(true);
  });
});

describe('課題の操作', () => {
  const base = () => save([goal('s', asg), goal('a', daily)]);

  it('課題は「課題があるときだけ」の目標にだけ追加でき、期限は今日以降', () => {
    const s = base();
    expect(err(applyAction(s, { type: 'addAssignment', id: 'x', goalId: 'a', title: 'レポート', due: day(5) }, day(1)))).toContain('追加できません');
    expect(err(applyAction(s, { type: 'addAssignment', id: 'x', goalId: 's', title: 'レポート', due: day(0) }, day(1)))).toContain('今日以降');
    expect(err(applyAction(s, { type: 'addAssignment', id: 'x', goalId: 's', title: '  ', due: day(5) }, day(1)))).toContain('内容');
    const s1 = ok(applyAction(s, { type: 'addAssignment', id: 'x', goalId: 's', title: ' 統計学レポート ', due: day(5) }, day(1)));
    expect(s1.assignments).toEqual([{ id: 'x', goalId: 's', title: '統計学レポート', due: day(5), createdOn: day(1), doneOn: null }]);
  });

  it('期限を過ぎた課題は、期限の変更も削除もできない（内容は直せる）', () => {
    const s = { ...base(), assignments: [task('x', 2, null)] };
    expect(err(applyAction(s, { type: 'editAssignment', id: 'x', title: 'x', due: day(9) }, day(3)))).toContain('期限を変更できません');
    expect(ok(applyAction(s, { type: 'editAssignment', id: 'x', title: '直した', due: day(2) }, day(3))).assignments[0]?.title).toBe('直した');
    expect(err(applyAction(s, { type: 'deleteAssignment', id: 'x' }, day(3)))).toContain('消せません');
    // 期限前なら延長も削除もできる
    expect(ok(applyAction(s, { type: 'editAssignment', id: 'x', title: 'x', due: day(4) }, day(1))).assignments[0]?.due).toBe(day(4));
    expect(ok(applyAction(s, { type: 'deleteAssignment', id: 'x' }, day(1))).assignments).toEqual([]);
  });

  it('完了の取り消しは当日だけ。期限後の完了はお知らせつき', () => {
    const s = { ...base(), assignments: [task('x', 2, null)] };
    const done = applyAction(s, { type: 'toggleAssignment', id: 'x' }, day(1));
    const s1 = ok(done);
    expect(ok(applyAction(s1, { type: 'toggleAssignment', id: 'x' }, day(1))).assignments[0]?.doneOn).toBeNull();
    expect(err(applyAction(s1, { type: 'toggleAssignment', id: 'x' }, day(2)))).toContain('今日完了した課題だけ');
    const late = applyAction(s, { type: 'toggleAssignment', id: 'x' }, day(3));
    expect(late.ok && late.note).toContain('コインはありません');
  });
});

describe('頻度の変更が反映される日', () => {
  const edit = (frequency: Frequency) => ({
    type: 'editGoal' as const, goalId: 'g', building: 'school' as const, text: { name: 'g', ideal: '理想', minimum: '最低' }, frequency,
  });

  it('週N回が関わらない変更は翌日から（「大学の課題」を明日から課題型に）', () => {
    const s = save([goal('g', { kind: 'weekdays', days: [0, 1, 2, 3, 4] })]);
    const g = ok(applyAction(s, edit(asg), day(3))).goals[0]!; // 木曜
    expect(frequencyOn(g, day(3))?.kind).toBe('weekdays');
    expect(frequencyOn(g, day(4))).toEqual(asg);
    // 切り替えた当日から課題を書き始められる
    expect(acceptsAssignments(g, day(3))).toBe(true);
  });

  it('週N回が関わる変更は来週の月曜から', () => {
    const s = save([goal('g', daily)]);
    const g = ok(applyAction(s, edit({ kind: 'weekly', times: 3 }), day(3))).goals[0]!;
    expect(frequencyOn(g, day(6))).toEqual(daily);
    expect(frequencyOn(g, day(7))).toEqual({ kind: 'weekly', times: 3 });
    const w = save([goal('g', { kind: 'weekly', times: 2 })]);
    const g2 = ok(applyAction(w, edit(asg), day(3))).goals[0]!;
    expect(frequencyOn(g2, day(6))?.kind).toBe('weekly');
    expect(frequencyOn(g2, day(7))).toEqual(asg);
  });

  it('予定されていた変更は新しい変更で置き換える', () => {
    const s = save([goal('g', daily)]);
    const s1 = ok(applyAction(s, edit({ kind: 'weekly', times: 3 }), day(3))); // 来週月曜から週3
    const g = ok(applyAction(s1, edit(asg), day(3))).goals[0]!; // やっぱり明日から課題型
    expect(frequencyOn(g, day(4))).toEqual(asg);
    expect(frequencyOn(g, day(7))).toEqual(asg); // 週3の予定は消えている
  });
});
