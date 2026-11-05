import { describe, expect, it } from 'vitest';
import { applyAction, currentGameDate, type Action, type ActionResult } from './actions';
import { createInitialSave } from './defaults';
import { frequencyOn, isCheckable, textOn } from './goals';
import { simulate } from './simulate';
import type { SaveData } from './types';
import { day, goal, save, withChecks } from './testUtils';

const daily = { kind: 'daily' } as const;

function ok(r: ActionResult): SaveData {
  if (!r.ok) throw new Error(`失敗: ${r.error}`);
  return r.save;
}
function err(r: ActionResult): string {
  if (r.ok) throw new Error('成功してしまった');
  return r.error;
}
const check = (date: string, goalId: string, level: 'min' | 'ideal' | null): Action => ({ type: 'setCheck', date, goalId, level });

describe('チェック', () => {
  const s = save([goal('a', daily), goal('n', daily, { minimum: null })]);

  it('今日と前日だけ変更できる', () => {
    expect(ok(applyAction(s, check(day(3), 'a', 'ideal'), day(3))).checks[day(3)]).toEqual({ a: 'ideal' });
    expect(ok(applyAction(s, check(day(2), 'a', 'min'), day(3))).checks[day(2)]).toEqual({ a: 'min' });
    expect(err(applyAction(s, check(day(1), 'a', 'ideal'), day(3)))).toContain('今日と前日');
    expect(err(applyAction(s, check(day(4), 'a', 'ideal'), day(3)))).toContain('今日と前日');
  });

  it('開始日より前は不可', () => {
    expect(err(applyAction(s, check(day(-1), 'a', 'ideal'), day(0)))).toContain('開始日');
  });

  it('外すと記録から消え、空の日も消える', () => {
    const s1 = ok(applyAction(s, check(day(0), 'a', 'ideal'), day(0)));
    const s2 = ok(applyAction(s1, check(day(0), 'a', null), day(0)));
    expect(s2.checks).toEqual({});
  });

  it('最低ラインのない目標に「最低」は付けられない', () => {
    expect(err(applyAction(s, check(day(0), 'n', 'min'), day(0)))).toContain('最低ライン');
  });

  it('対象日でない目標・休養日はチェックできない', () => {
    const s2 = save([goal('m', { kind: 'weekdays', days: [0] })], { restDays: [day(7)] });
    expect(err(applyAction(s2, check(day(1), 'm', 'ideal'), day(1)))).toContain('対象日');
    expect(err(applyAction(s2, check(day(7), 'm', 'ideal'), day(7)))).toContain('休養日');
  });

  it('付け外しを繰り返してもコインは増えない', () => {
    let cur = s;
    for (let i = 0; i < 5; i++) {
      cur = ok(applyAction(cur, check(day(0), 'a', 'ideal'), day(0)));
      cur = ok(applyAction(cur, check(day(0), 'a', null), day(0)));
    }
    cur = ok(applyAction(cur, check(day(0), 'a', 'ideal'), day(0)));
    expect(simulate(cur, day(0)).coins).toBe(10);
  });
});

describe('休養日', () => {
  const s = save([goal('a', daily)]);

  it('チェックがなければ当日に宣言でき、取り消せる', () => {
    const s1 = ok(applyAction(s, { type: 'declareRest' }, day(1)));
    expect(s1.restDays).toEqual([day(1)]);
    expect(ok(applyAction(s1, { type: 'cancelRest' }, day(1))).restDays).toEqual([]);
  });

  it('チェック済みの日は不可', () => {
    const s1 = withChecks(s, [[1, 'a', 'min']]);
    expect(err(applyAction(s1, { type: 'declareRest' }, day(1)))).toContain('チェック');
  });

  it('週1回まで（翌週はまた使える）', () => {
    const s1 = ok(applyAction(s, { type: 'declareRest' }, day(1)));
    expect(err(applyAction(s1, { type: 'declareRest' }, day(3)))).toContain('週1回');
    expect(ok(applyAction(s1, { type: 'declareRest' }, day(7))).restDays).toEqual([day(1), day(7)]);
  });
});

describe('目標の編集', () => {
  const edit = (patch: Partial<Extract<Action, { type: 'editGoal' }>> = {}): Action => ({
    type: 'editGoal', goalId: 'a', building: 'library',
    text: { name: '新しい名前', ideal: '理想', minimum: '最低' }, frequency: daily, ...patch,
  });

  it('文章は翌日から、頻度は翌週月曜から反映（今日の判定は変わらない）', () => {
    const s = save([goal('a', daily)]);
    const today = day(2); // 水曜
    const r = applyAction(s, edit({ frequency: { kind: 'weekly', times: 2 } }), today);
    const g = ok(r).goals[0]!;
    expect(textOn(g, today)?.name).toBe('a');
    expect(textOn(g, day(3))?.name).toBe('新しい名前');
    expect(frequencyOn(g, day(6))).toEqual(daily);
    expect(frequencyOn(g, day(7))).toEqual({ kind: 'weekly', times: 2 });
    expect(isCheckable(g, today)).toBe(true);
    expect(r.ok && r.note).toContain('来週の月曜');
  });

  it('今日作った目標はすぐ反映', () => {
    const s = save([goal('a', daily, { createdOn: day(2) })]);
    const g = ok(applyAction(s, edit(), day(2))).goals[0]!;
    expect(textOn(g, day(2))?.name).toBe('新しい名前');
    expect(g.text).toHaveLength(1);
  });

  it('空の名前や不正な頻度は弾く', () => {
    const s = save([goal('a', daily)]);
    expect(err(applyAction(s, edit({ text: { name: '  ', ideal: 'x', minimum: null } }), day(1)))).toContain('名前');
    expect(err(applyAction(s, edit({ frequency: { kind: 'weekdays', days: [] } }), day(1)))).toContain('曜日');
    expect(err(applyAction(s, edit({ frequency: { kind: 'weekly', times: 8 } }), day(1)))).toContain('1〜7');
  });

  it('最低ラインが空文字なら「なし」になる', () => {
    const s = save([goal('a', daily, { createdOn: day(0) })]);
    const g = ok(applyAction(s, edit({ text: { name: 'x', ideal: 'y', minimum: '   ' } }), day(0))).goals[0]!;
    expect(textOn(g, day(0))?.minimum).toBeNull();
  });

  it('今日作った目標の編集・削除で無効になったチェックは消える（休養日を宣言できなくならない）', () => {
    const base = withChecks(save([goal('a', daily, { createdOn: day(2) })]), [[2, 'a', 'min']]);
    // 最低ラインを消す → 「最低」のチェックは消える
    const s1 = ok(applyAction(base, edit({ text: { name: 'a', ideal: 'x', minimum: null } }), day(2)));
    expect(s1.checks).toEqual({});
    // 今日を含まない曜日に変える → チェックは消える
    const s2 = ok(applyAction(base, edit({ frequency: { kind: 'weekdays', days: [0] } }), day(2)));
    expect(s2.checks).toEqual({});
    // 削除 → チェックが消え、休養日にできる
    const s3 = ok(applyAction(base, { type: 'archiveGoal', goalId: 'a' }, day(2)));
    expect(s3.checks).toEqual({});
    expect(ok(applyAction(s3, { type: 'declareRest' }, day(2))).restDays).toEqual([day(2)]);
    // 変更後も有効なチェックは残る
    const s4 = ok(applyAction(base, edit({ text: { name: '新', ideal: 'x', minimum: 'y' } }), day(2)));
    expect(s4.checks[day(2)]).toEqual({ a: 'min' });
  });

  it('削除は翌日から（今日作った目標は今日から）', () => {
    const s = save([goal('a', daily), goal('b', daily, { createdOn: day(2) })]);
    const s1 = ok(applyAction(s, { type: 'archiveGoal', goalId: 'a' }, day(2)));
    expect(s1.goals[0]?.archivedFrom).toBe(day(3));
    const s2 = ok(applyAction(s1, { type: 'archiveGoal', goalId: 'b' }, day(2)));
    expect(s2.goals[1]?.archivedFrom).toBe(day(2));
    expect(err(applyAction(s2, { type: 'archiveGoal', goalId: 'a' }, day(2)))).toContain('すでに');
  });

  it('目標は12個まで', () => {
    let s = save([]);
    for (let i = 0; i < 12; i++) {
      s = ok(applyAction(s, { type: 'addGoal', id: `g${i}`, building: 'bank', text: { name: `g${i}`, ideal: 'x', minimum: null }, frequency: daily }, day(0)));
    }
    expect(err(applyAction(s, { type: 'addGoal', id: 'g12', building: 'bank', text: { name: 'g', ideal: 'x', minimum: null }, frequency: daily }, day(0)))).toContain('12');
  });
});

describe('建設', () => {
  it('コインが足りなければ不可、足りれば記録される', () => {
    const s = withChecks(save([goal('a', daily)]), [[0, 'a', 'ideal'], [1, 'a', 'ideal'], [2, 'a', 'ideal']]);
    expect(err(applyAction(s, { type: 'upgrade', goalId: 'a' }, day(2)))).toContain('あと10枚');
    const s2 = withChecks(s, [[3, 'a', 'ideal']]);
    const s3 = ok(applyAction(s2, { type: 'upgrade', goalId: 'a' }, day(3)));
    expect(simulate(s3, day(3)).buildings.a?.level).toBe(2);
  });

  it('さびれている建物は建て替え不可', () => {
    let s = save([goal('a', daily), goal('b', daily)]);
    for (let i = 0; i < 5; i++) s = withChecks(s, [[i, 'b', 'ideal']]);
    expect(err(applyAction(s, { type: 'upgrade', goalId: 'a' }, day(4)))).toContain('さびれ');
  });
});

describe('ゲーム日付と設定', () => {
  it('時計が過去に戻っても、見た最新日より前にはならない', () => {
    const s = save([], { lastSeenDate: '2026-11-10' });
    expect(currentGameDate(s, new Date(2026, 10, 5, 12))).toBe('2026-11-10');
    expect(currentGameDate(s, new Date(2026, 10, 12, 12))).toBe('2026-11-12');
  });

  it('操作すると lastSeenDate が進む', () => {
    const s = save([]);
    expect(ok(applyAction(s, { type: 'touch' }, day(5))).lastSeenDate).toBe(day(5));
  });

  it('区切り時刻は0〜6時', () => {
    const s = save([]);
    expect(ok(applyAction(s, { type: 'setDayStartHour', hour: 0 }, day(0))).dayStartHour).toBe(0);
    expect(err(applyAction(s, { type: 'setDayStartHour', hour: 7 }, day(0)))).toContain('0〜6');
    expect(err(applyAction(s, { type: 'setDayStartHour', hour: 2.5 }, day(0)))).toContain('0〜6');
  });

  it('まとめの既読は昨日より先へ進まない', () => {
    const s = save([]);
    expect(ok(applyAction(s, { type: 'markSummarySeen', upTo: day(9) }, day(5))).summarySeenDate).toBe(day(4));
  });
});

describe('初期データ', () => {
  it('6つの目標＋日記がそれぞれ有効な状態で作られる', () => {
    let n = 0;
    const s = createInitialSave(day(0), () => `id${n++}`);
    expect(s.goals).toHaveLength(7);
    expect(s.goals.filter(g => g.type === 'diary')).toHaveLength(1);
    expect(s.goals.every(g => textOn(g, day(0)) !== null && frequencyOn(g, day(0)) !== null)).toBe(true);
    expect(new Set(s.goals.map(g => g.id)).size).toBe(7);
  });
});
