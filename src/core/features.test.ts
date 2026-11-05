// v0.4 の追加機能（日記・ToDo・施設・倒壊）のテスト
import { describe, expect, it } from 'vitest';
import { applyAction, rebaseActions, type Action, type ActionResult } from './actions';
import { textOn } from './goals';
import { diaryChars, diaryLevel } from './rules';
import { inRangeFacilities, isCollapseImminent, isFadedNow, simulate } from './simulate';
import type { SaveData, Todo } from './types';
import { day, diaryGoal, goal, save, withChecks } from './testUtils';

const daily = { kind: 'daily' } as const;

function ok(r: ActionResult): SaveData {
  if (!r.ok) throw new Error(`失敗: ${r.error}`);
  return r.save;
}
function err(r: ActionResult): string {
  if (r.ok) throw new Error('成功してしまった');
  return r.error;
}
const todo = (id: string, doneOn: string | null): Todo => ({ id, title: id, due: null, createdOn: day(0), doneOn });

describe('日記', () => {
  it('空白を除いた文字数で判定する', () => {
    expect(diaryChars(' あ い\nう ')).toBe(3);
    expect(diaryChars('😀👍')).toBe(2);
    expect(diaryLevel(undefined, 10)).toBeNull();
    expect(diaryLevel('   \n', 10)).toBeNull();
    expect(diaryLevel('a', 10)).toBe('min');
    expect(diaryLevel('0123456789', 10)).toBe('ideal');
  });

  it('日記の文字数がそのまま日次スコアになる', () => {
    const g = [diaryGoal('d', 10)];
    expect(simulate(save(g, { diary: { [day(0)]: '今日はよく勉強した。満足！' } }), day(1)).morale).toBe(56);
    expect(simulate(save(g, { diary: { [day(0)]: '疲れた' } }), day(1)).morale).toBe(52);
    expect(simulate(save(g), day(1)).morale).toBe(42);
    expect(simulate(save(g, { diary: { [day(0)]: '今日はよく勉強した。満足！' } }), day(0)).coins).toBe(10);
  });

  it('今日と前日だけ書き換えられ、空白だけなら消える', () => {
    const s = save([diaryGoal('d')]);
    const s1 = ok(applyAction(s, { type: 'setDiary', date: day(3), text: 'こんにちは' }, day(3)));
    expect(s1.diary[day(3)]).toBe('こんにちは');
    expect(ok(applyAction(s1, { type: 'setDiary', date: day(2), text: 'きのう' }, day(3))).diary[day(2)]).toBe('きのう');
    expect(err(applyAction(s1, { type: 'setDiary', date: day(1), text: 'x' }, day(3)))).toContain('今日と前日');
    expect(ok(applyAction(s1, { type: 'setDiary', date: day(3), text: '  \n ' }, day(3))).diary).toEqual({});
    expect(err(applyAction(s1, { type: 'setDiary', date: day(3), text: 'あ'.repeat(2001) }, day(3)))).toContain('2000');
  });

  it('休養日にも書けるが判定はなく、書いても休養日を宣言できる', () => {
    const s = ok(applyAction(save([diaryGoal('d')]), { type: 'setDiary', date: day(0), text: '体調が悪い' }, day(0)));
    const s2 = ok(applyAction(s, { type: 'declareRest' }, day(0)));
    const r = simulate(s2, day(1));
    expect(r.days[0]?.kind).toBe('rest');
    expect(r.morale).toBe(50);
  });

  it('日記の目標は手動でチェックできず、2つは作れない', () => {
    const s = save([diaryGoal('d')]);
    expect(err(applyAction(s, { type: 'setCheck', date: day(0), goalId: 'd', level: 'ideal' }, day(0)))).toContain('自動');
    const add: Action = { type: 'addGoal', id: 'd2', goalType: 'diary', building: 'kura', text: { name: '日記2', ideal: '', minimum: null, idealChars: 50 }, frequency: daily };
    expect(err(applyAction(s, add, day(0)))).toContain('1つまで');
  });

  it('理想の文字数の変更は翌日から', () => {
    const s = save([diaryGoal('d', 100)]);
    const r = ok(applyAction(s, { type: 'editGoal', goalId: 'd', building: 'kura', text: { name: '日記', ideal: '', minimum: null, idealChars: 30 }, frequency: daily }, day(3)));
    const g = r.goals[0]!;
    expect(textOn(g, day(3))?.idealChars).toBe(100);
    expect(textOn(g, day(4))?.idealChars).toBe(30);
    expect(textOn(g, day(4))?.ideal).toBe('30文字以上');
  });
});

describe('ToDo', () => {
  it('完了1件3コイン、1日5件まで。やる気には影響しない', () => {
    const todos = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => todo(id, day(0)));
    const r = simulate(save([goal('g', daily)], { todos }), day(0));
    expect(r.coins).toBe(15);
    expect(r.todoRewardsLeft).toBe(0);
    const r2 = simulate(save([goal('g', daily)], { todos }), day(1));
    expect(r2.morale).toBe(42); // 目標が未達なら、ToDoをこなしてもやる気は下がる
    expect(r2.streak).toBe(0);
  });

  it('追加・完了・取り消し・削除のルール', () => {
    let s = save([]);
    expect(err(applyAction(s, { type: 'addTodo', id: 't', title: '  ', due: null }, day(0)))).toContain('入力');
    expect(err(applyAction(s, { type: 'addTodo', id: 't', title: 'あ'.repeat(61), due: null }, day(0)))).toContain('60');
    s = ok(applyAction(s, { type: 'addTodo', id: 't', title: 'レポート提出', due: day(2) }, day(0)));
    s = ok(applyAction(s, { type: 'toggleTodo', id: 't' }, day(0)));
    expect(s.todos[0]?.doneOn).toBe(day(0));
    expect(err(applyAction(s, { type: 'deleteTodo', id: 't' }, day(0)))).toContain('消せません');
    // 今日完了したものだけ戻せる（前日分を戻して今日に付け直す抜け道を防ぐ）
    expect(ok(applyAction(s, { type: 'toggleTodo', id: 't' }, day(0))).todos[0]?.doneOn).toBeNull();
    expect(err(applyAction(s, { type: 'toggleTodo', id: 't' }, day(1)))).toContain('今日完了したToDoだけ');
    const s2 = ok(applyAction(s, { type: 'addTodo', id: 'u', title: '銀行', due: null }, day(0)));
    expect(ok(applyAction(s2, { type: 'deleteTodo', id: 'u' }, day(0))).todos.map(t => t.id)).toEqual(['t']);
  });
});

describe('施設', () => {
  const rich = () => {
    // 理想を30日分チェックして300コイン
    let s = save([goal('a', daily)]);
    for (let i = 0; i < 30; i++) s = withChecks(s, [[i, 'a', 'ideal']]);
    return s;
  };

  it('コインが足りなければ建てられず、上限を超えられない', () => {
    expect(err(applyAction(save([]), { type: 'buyFacility', id: 'f1', kind: 'bench' }, day(0)))).toContain('コインが足りません');
    let s = rich();
    for (let i = 0; i < 3; i++) s = ok(applyAction(s, { type: 'buyFacility', id: `b${i}`, kind: 'bench' }, day(29)));
    expect(err(applyAction(s, { type: 'buyFacility', id: 'b3', kind: 'bench' }, day(29)))).toContain('3つまで');
    expect(simulate(s, day(29)).coins).toBe(300 - 180);
  });

  it('やる気を使う施設は、使ったあと20以上残るときだけ', () => {
    const s = rich();
    const morale = simulate(s, day(29)).morale; // 30日分の理想でかなり高い
    const s1 = ok(applyAction(s, { type: 'buyFacility', id: 'bath', kind: 'bathhouse' }, day(29)));
    expect(simulate(s1, day(29)).morale).toBe(morale - 10);
    // コインは十分（ToDoで稼ぐ）でも、目標をサボってやる気が低いときは建てられない
    const todos = Array.from({ length: 20 }, (_, d) => Array.from({ length: 5 }, (_, i) => todo(`t${d}-${i}`, day(d)))).flat();
    const lazy = save([goal('a', daily)], { todos });
    const sim = simulate(lazy, day(20));
    expect(sim.coins).toBe(300);
    expect(sim.morale).toBeLessThan(35);
    expect(err(applyAction(lazy, { type: 'buyFacility', id: 'sh', kind: 'shrine' }, day(20)))).toContain('疲れて');
  });

  it('茶屋の効果は建てた翌日から（理想のコイン +2）', () => {
    const s = withChecks(save([goal('a', daily)], { facilities: [{ id: 'f', kind: 'teahouse', date: day(0) }] }), [[0, 'a', 'ideal'], [1, 'a', 'ideal']]);
    const r = simulate(s, day(2));
    expect(r.days[0]?.coinsEarned).toBe(10);
    expect(r.days[1]?.coinsEarned).toBe(12);
  });

  it('銭湯：やる気が下がる日の下がり幅が25%小さくなる', () => {
    const s = save([goal('a', daily)], { facilities: [{ id: 'f', kind: 'bathhouse', date: day(0) }] });
    const r = simulate(s, day(2));
    // day0 は効果なし（-8）、そのあと銭湯のやる気消費 -10、day1 は -6
    expect(r.days[0]?.moraleAfter).toBe(50 - 8 - 10);
    expect(r.days[1]?.moraleAfter).toBe(50 - 8 - 10 - 6);
  });

  it('屋台：ToDoのコイン +1（翌日から）', () => {
    const s = save([], { facilities: [{ id: 'f', kind: 'stall', date: day(0) }], todos: [todo('a', day(0)), todo('b', day(1))] });
    const r = simulate(s, day(1));
    expect(r.days[0]?.todoCoins).toBe(3);
    expect(r.todayCoins).toBe(4);
  });
});

describe('レビューで見つかった不具合の再発防止', () => {
  it('がれきにはお守りを使わない', () => {
    // a は最初からずっと未達（レベル1→がれき）、b は毎日やる。神社は day0 に建設
    let s = save([goal('a', daily), goal('b', daily)], { facilities: [{ id: 'sh', kind: 'shrine', date: day(0) }] });
    for (let i = 0; i < 30; i++) s = withChecks(s, [[i, 'b', 'ideal']]);
    const r = simulate(s, day(30));
    expect(r.days[6]?.protected).toEqual(['a']); // 7回目はお守りが守る（レベル1）
    expect(r.days[10]?.collapsed).toEqual(['a']); // 守ったあと4回でがれきに
    expect(r.buildings.a?.level).toBe(0);
    // その後 14回目以降をまたいでも、がれきにはお守りを使わない
    expect(r.days.flatMap(d => d.protected)).toEqual(['a']);
    expect(r.charmState).toBe('ready');
  });

  it('さびれる前に行った建て替えは、その日に未達でも取り消されない', () => {
    let s = save([goal('a', daily), goal('b', daily)]);
    for (let i = 0; i < 10; i++) s = withChecks(s, [[i, 'b', 'ideal']]);
    // a は day0, day1 未達で misses=2（まだ さびれていない）。day2 に建て替えて、day2 も未達
    s = { ...s, upgrades: [{ date: day(2), goalId: 'a' }] };
    expect(simulate(s, day(2)).buildings.a?.level).toBe(2);
    const next = simulate(s, day(3));
    expect(next.buildings.a?.level).toBe(2);
    expect(next.days[2]?.coinsSpent).toBe(40);
  });

  it('週N回の目標：ゼロの週の日曜に行った建て替えも取り消されない', () => {
    let s = save([goal('w', { kind: 'weekly', times: 3 }), goal('b', daily)]);
    for (let i = 0; i < 10; i++) s = withChecks(s, [[i, 'b', 'ideal']]);
    s = { ...s, upgrades: [{ date: day(6), goalId: 'w' }] };
    expect(simulate(s, day(7)).buildings.w?.level).toBe(2);
  });

  it('神社を建てた当日は「明日から」', () => {
    const s = save([goal('a', daily)], { facilities: [{ id: 'sh', kind: 'shrine', date: day(3) }] });
    expect(simulate(s, day(3)).charmState).toBe('tomorrow');
    expect(simulate(s, day(4)).charmState).toBe('ready');
    expect(simulate(save([]), day(3)).charmState).toBe('none');
  });

  it('開始日より前・未来の日付の施設は、表示も効果も費用もなし', () => {
    const s = save([goal('a', daily)], {
      facilities: [{ id: 'old', kind: 'teahouse', date: day(-3) }, { id: 'future', kind: 'bench', date: day(9) }],
    });
    const r = simulate(withChecks(s, [[1, 'a', 'ideal']]), day(2));
    expect(r.facilities.teahouse).toBe(0);
    expect(r.days[1]?.coinsEarned).toBe(10); // 茶屋の+2はつかない
    expect(inRangeFacilities(s, day(2))).toEqual([]);
  });

  it('やる気の消費は判定の前（今日の画面と同じ順）', () => {
    // やる気100で銭湯（-10）を建てた日に理想達成 → 90 から +3（80超は半分）＝ 93
    let s = save([goal('a', daily)]);
    for (let i = 0; i < 12; i++) s = withChecks(s, [[i, 'a', 'ideal']]);
    const before = simulate(s, day(11)).morale;
    expect(before).toBe(100);
    s = { ...s, facilities: [{ id: 'bath', kind: 'bathhouse', date: day(11) }] };
    expect(simulate(s, day(11)).morale).toBe(90);
    expect(simulate(s, day(12)).morale).toBe(93);
  });

  it('倒壊寸前の予告：週の途中で作った週N回の目標・休養日は出さない', () => {
    // 週の途中（水曜）に作った週3回の目標は、その週は精算されない
    const w = goal('w', { kind: 'weekly', times: 3 }, { createdOn: day(2) });
    const sw = save([w], { facilities: [] });
    const fake = { ...simulate(sw, day(5)), buildings: { w: { goalId: 'w', level: 2, misses: 6 } } };
    expect(isCollapseImminent(sw, fake, w)).toBe(false);
    // 休養日の今日は、毎日の目標も予告しない
    const a = goal('a', daily);
    const sr = save([a], { restDays: [day(5)] });
    const fake2 = { ...simulate(sr, day(5)), buildings: { a: { goalId: 'a', level: 2, misses: 6 } } };
    expect(isCollapseImminent(sr, fake2, a)).toBe(false);
  });

  it('文字数：家族の絵文字や国旗は1文字、ゼロ幅スペースは0文字', () => {
    expect(diaryChars('👨‍👩‍👧')).toBe(1);
    expect(diaryChars('🇯🇵')).toBe(1);
    expect(diaryChars('​')).toBe(0);
    expect(diaryLevel('​​', 10)).toBeNull();
  });

  it('日記の目標は「毎日」に固定', () => {
    const add: Action = { type: 'addGoal', id: 'd', goalType: 'diary', building: 'kura', text: { name: '日記', ideal: '', minimum: null, idealChars: 50 }, frequency: { kind: 'weekdays', days: [0] } };
    const s = ok(applyAction(save([]), add, day(0)));
    expect(s.goals[0]?.frequency[0]?.value).toEqual({ kind: 'daily' });
  });

  it('別タブとぶつかったら、最新データに未保存の操作を重ね直す', () => {
    const base = save([goal('a', daily), goal('b', daily)]);
    // 別タブで b にチェック済み。こちらは a のチェックと日記を書いていた
    const theirs = withChecks(base, [[0, 'b', 'ideal']]);
    const mine: Action[] = [
      { type: 'setCheck', date: day(0), goalId: 'a', level: 'min' },
      { type: 'setDiary', date: day(0), text: '書きかけの日記' },
      { type: 'setCheck', date: day(0), goalId: 'zzz', level: 'ideal' }, // 別タブで消えた目標など
    ];
    const r = rebaseActions(theirs, mine, day(0));
    expect(r.save.checks[day(0)]).toEqual({ b: 'ideal', a: 'min' });
    expect(r.save.diary[day(0)]).toBe('書きかけの日記');
    expect(r.dropped).toBe(1);
  });
});

describe('倒壊', () => {
  // a はサボり続け、b は毎日やる（長期不在扱いにならないように）
  const base = (levelUps = 0) => {
    let s = save([goal('a', daily), goal('b', daily)]);
    for (let i = 0; i < 40; i++) s = withChecks(s, [[i, 'b', 'ideal']]);
    // day0 にチェックして建て替え（さびれる前）
    s = withChecks(s, [[0, 'a', 'ideal']]);
    s = { ...s, upgrades: Array.from({ length: levelUps }, () => ({ date: day(0), goalId: 'a' })) };
    return s;
  };

  it('連続未達7回ごとにレベルが1下がり、レベル0はがれき', () => {
    const s = base(2); // レベル3
    const r = simulate(s, day(16)); // day1〜15 の15回未達
    expect(r.days[7]?.collapsed).toEqual(['a']); // 7回目
    expect(r.days[14]?.collapsed).toEqual(['a']); // 14回目
    expect(r.buildings.a?.level).toBe(1);
    const r2 = simulate(base(0), day(9));
    expect(r2.buildings.a?.level).toBe(0);
  });

  it('倒壊の前日に予告が出る', () => {
    const s = base(0);
    const r6 = simulate(s, day(7)); // day1〜6 で6回未達
    expect(isCollapseImminent(s, r6, s.goals[0]!)).toBe(true);
    // 今日チェックすれば予告は消える
    const s2 = withChecks(s, [[7, 'a', 'min']]);
    expect(isCollapseImminent(s2, simulate(s2, day(7)), s2.goals[0]!)).toBe(false);
    expect(isCollapseImminent(s, simulate(s, day(5)), s.goals[0]!)).toBe(false);
  });

  it('がれきの再建は20コインで、担当目標を達成した日にだけできる', () => {
    const s = base(0);
    const r = simulate(s, day(9));
    expect(r.buildings.a?.level).toBe(0);
    expect(isFadedNow(s, r, s.goals[0]!)).toBe(true);
    expect(err(applyAction(s, { type: 'upgrade', goalId: 'a' }, day(9)))).toContain('がれき');
    const s2 = withChecks(s, [[9, 'a', 'min']]);
    const s3 = ok(applyAction(s2, { type: 'upgrade', goalId: 'a' }, day(9)));
    const r3 = simulate(s3, day(9));
    expect(r3.buildings.a?.level).toBe(1);
    expect(r3.coins).toBe(simulate(s2, day(9)).coins - 20);
  });

  it('週N回の目標は、1週間ゼロでN回分の未達', () => {
    let s = save([goal('w', { kind: 'weekly', times: 3 }), goal('b', daily)]);
    for (let i = 0; i < 21; i++) s = withChecks(s, [[i, 'b', 'ideal']]);
    const r = simulate(s, day(21));
    expect(r.buildings.w?.misses).toBe(9);
    expect(r.days[13]?.collapsed).toEqual([]); // 6回分ではまだ
    expect(r.days[20]?.collapsed).toEqual(['w']); // 9回分で7をまたぐ
    expect(r.buildings.w?.level).toBe(0);
  });

  it('神社のお守りが倒壊を1回防ぎ、14日後に復活する', () => {
    const s = { ...base(2), facilities: [{ id: 'sh', kind: 'shrine' as const, date: day(0) }] };
    const r = simulate(s, day(12));
    expect(r.days[7]?.protected).toEqual(['a']);
    expect(r.days[7]?.collapsed).toEqual([]);
    expect(simulate(s, day(11)).buildings.a?.level).toBe(3); // 守られてレベルはそのまま
    expect(r.buildings.a?.misses).toBe(3 + 4); // 守った後は「さびれ」の状態から数え直し
    expect(r.charmReady).toBe(false);
    // 守った4日後（misses 3→7）に再び倒壊（お守りはまだ復活していない）
    expect(r.days[11]?.collapsed).toEqual(['a']);
    expect(r.buildings.a?.level).toBe(2);
    expect(simulate(s, day(22)).charmReady).toBe(true);
  });
});
