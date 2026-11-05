// ユーザーの操作。すべて「記録 + 操作 + 今日」→「新しい記録 or エラー」の純粋関数。
// 不正な操作（2日以上前のチェック、休養日のチェックなど）はここで必ず弾く。
import { addDays, gameDateFromLocal, isGameDate, maxDate, weekStart, type GameDate } from './date';
import { frequencyOn, hasMinimum, isActive, isCheckable, textOn, upsertTimed } from './goals';
import * as R from './rules';
import { checkOn, isFadedNow, simulate } from './simulate';
import type { BuildingKind, CheckLevel, FacilityKind, Frequency, Goal, GoalText, GoalType, SaveData, Todo } from './types';

export type Action =
  | { type: 'setCheck'; date: GameDate; goalId: string; level: CheckLevel | null }
  | { type: 'setDiary'; date: GameDate; text: string }
  | { type: 'declareRest' }
  | { type: 'cancelRest' }
  | { type: 'addGoal'; id: string; goalType?: GoalType; building: BuildingKind; text: GoalText; frequency: Frequency }
  | { type: 'editGoal'; goalId: string; building: BuildingKind; text: GoalText; frequency: Frequency }
  | { type: 'archiveGoal'; goalId: string }
  | { type: 'upgrade'; goalId: string }
  | { type: 'buyFacility'; id: string; kind: FacilityKind }
  | { type: 'addTodo'; id: string; title: string; due: GameDate | null }
  | { type: 'editTodo'; id: string; title: string; due: GameDate | null }
  | { type: 'toggleTodo'; id: string }
  | { type: 'deleteTodo'; id: string }
  | { type: 'setDayStartHour'; hour: number }
  | { type: 'markSummarySeen'; upTo: GameDate }
  | { type: 'markBackup' }
  | { type: 'touch' };

export type ActionResult =
  | { ok: true; save: SaveData; note?: string }
  | { ok: false; error: string };

/** 今日のゲーム日。時計が戻っても、これまでに見た最新日より前にはしない */
export function currentGameDate(save: SaveData, now: Date): GameDate {
  return maxDate(gameDateFromLocal(now, save.dayStartHour), save.lastSeenDate);
}

const fail = (error: string): ActionResult => ({ ok: false, error });

export const LIMITS = { name: 30, line: 40 } as const;

/** 日記は毎日書くもの（曜日指定にすると予定のない日に書けなくなるため固定） */
const DIARY_FREQUENCY: Frequency = { kind: 'daily' };

export function normalizeText(t: GoalText, type: GoalType = 'check'): GoalText | string {
  const name = t.name.trim();
  if (!name) return '目標の名前を入力してください';
  if (name.length > LIMITS.name) return `名前は${LIMITS.name}文字以内にしてください`;
  if (type === 'diary') {
    const n = t.idealChars ?? R.DIARY_DEFAULT_IDEAL_CHARS;
    if (!Number.isInteger(n) || n < 1 || n > R.DIARY_MAX_IDEAL_CHARS) return `理想の文字数は1〜${R.DIARY_MAX_IDEAL_CHARS}にしてください`;
    // 日記のラインは文字数から自動で決まる
    return { name, ideal: `${n}文字以上`, minimum: '一言', idealChars: n };
  }
  const ideal = t.ideal.trim();
  const minimum = t.minimum?.trim() ? t.minimum.trim() : null;
  if (!ideal) return '理想ラインを入力してください';
  if (ideal.length > LIMITS.line) return `理想ラインは${LIMITS.line}文字以内にしてください`;
  if (minimum && minimum.length > LIMITS.line) return `最低ラインは${LIMITS.line}文字以内にしてください`;
  return { name, ideal, minimum };
}

export function validateFrequency(f: Frequency): Frequency | string {
  if (f.kind === 'daily') return { kind: 'daily' };
  if (f.kind === 'weekdays') {
    const days = [...new Set(f.days)].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
    if (days.length === 0) return '曜日を1つ以上選んでください';
    return { kind: 'weekdays', days };
  }
  if (!Number.isInteger(f.times) || f.times < 1 || f.times > 7) return '週の回数は1〜7回にしてください';
  return { kind: 'weekly', times: f.times };
}

function sameFrequency(a: Frequency | null, b: Frequency): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameText(a: GoalText | null, b: GoalText): boolean {
  return a !== null && a.name === b.name && a.ideal === b.ideal && a.minimum === b.minimum && a.idealChars === b.idealChars;
}

function replaceGoal(save: SaveData, goal: Goal): SaveData {
  return { ...save, goals: save.goals.map(g => (g.id === goal.id ? goal : g)) };
}

/** その日の有効なチェックの数（日記と、対象外になった目標の残りは数えない）。休養日の判定に使う */
export function validCheckCount(save: SaveData, date: GameDate): number {
  const rest = new Set(save.restDays);
  return save.goals.filter(g => g.type !== 'diary' && checkOn(save, rest, g, date) !== null).length;
}

/**
 * 目標の変更で無効になったチェックを消す（今日作った目標を今日のうちに編集・削除したとき用）。
 * 対象日でなくなった、または最低ラインがなくなったのに「最低」になっている場合。
 */
function dropInvalidCheck(save: SaveData, goalId: string, date: GameDate): SaveData {
  const level = save.checks[date]?.[goalId];
  const goal = save.goals.find(g => g.id === goalId);
  if (!level || !goal) return save;
  const valid = isCheckable(goal, date) && (level !== 'min' || hasMinimum(goal, date));
  if (valid) return save;
  const day = { ...(save.checks[date] ?? {}) };
  delete day[goalId];
  const checks = { ...save.checks };
  if (Object.keys(day).length === 0) delete checks[date];
  else checks[date] = day;
  return { ...save, checks };
}

function normalizeTodo(title: string, due: GameDate | null): { title: string; due: GameDate | null } | string {
  const t = title.trim();
  if (!t) return 'ToDoの内容を入力してください';
  if ([...t].length > R.TODO_TITLE_MAX) return `ToDoは${R.TODO_TITLE_MAX}文字以内にしてください`;
  if (due !== null && !isGameDate(due)) return '期限の日付が正しくありません';
  return { title: t, due };
}

function replaceTodo(save: SaveData, todo: Todo): SaveData {
  return { ...save, todos: save.todos.map(t => (t.id === todo.id ? todo : t)) };
}

function apply(save: SaveData, action: Action, today: GameDate): ActionResult {
  const goalById = (id: string) => save.goals.find(g => g.id === id);
  const todoById = (id: string) => save.todos.find(t => t.id === id);
  const yesterday = addDays(today, -1);

  switch (action.type) {
    case 'touch':
      return { ok: true, save };

    case 'setCheck': {
      const { date, goalId, level } = action;
      if (date !== today && date !== yesterday) return fail('チェックを変更できるのは今日と前日だけです');
      if (date < save.startDate) return fail('開始日より前の日はチェックできません');
      if (save.restDays.includes(date)) return fail('休養日はチェックできません');
      const goal = goalById(goalId);
      if (!goal || !isCheckable(goal, date)) return fail('この日はこの目標の対象日ではありません');
      if (goal.type === 'diary') return fail('日記は書くと自動で達成になります');
      if (level === 'min' && !hasMinimum(goal, date)) return fail('この目標には最低ラインがありません');
      const day = { ...(save.checks[date] ?? {}) };
      if (level === null) delete day[goalId];
      else day[goalId] = level;
      const checks = { ...save.checks };
      if (Object.keys(day).length === 0) delete checks[date];
      else checks[date] = day;
      return { ok: true, save: { ...save, checks } };
    }

    case 'setDiary': {
      const { date } = action;
      if (date !== today && date !== yesterday) return fail('日記を書き換えられるのは今日と前日だけです');
      if (date < save.startDate) return fail('開始日より前の日の日記は書けません');
      // 入力欄の maxLength と同じ数え方（UTF-16）。日本語は1字=1、絵文字は2字分
      if (action.text.length > R.DIARY_MAX_LENGTH) return fail(`日記は1日${R.DIARY_MAX_LENGTH}文字までです（絵文字は2文字分）`);
      const diary = { ...save.diary };
      // 空白だけなら「書いていない」扱いで消す
      if (action.text.trim() === '') delete diary[date];
      else diary[date] = action.text;
      return { ok: true, save: { ...save, diary } };
    }

    case 'declareRest': {
      if (save.restDays.includes(today)) return fail('今日はすでに休養日です');
      if (validCheckCount(save, today) > 0) return fail('チェックが1つでもある日は休養日にできません');
      const ws = weekStart(today);
      const we = addDays(ws, 6);
      const used = save.restDays.filter(d => d >= ws && d <= we).length;
      if (used >= R.REST_DAYS_PER_WEEK) return fail(`休養日は週${R.REST_DAYS_PER_WEEK}回までです`);
      return { ok: true, save: { ...save, restDays: [...save.restDays, today].sort() } };
    }

    case 'cancelRest': {
      if (!save.restDays.includes(today)) return fail('今日は休養日ではありません');
      return { ok: true, save: { ...save, restDays: save.restDays.filter(d => d !== today) } };
    }

    case 'addGoal': {
      const goalType = action.goalType ?? 'check';
      if (save.goals.some(g => g.id === action.id)) return fail('同じIDの目標がすでにあります');
      const active = save.goals.filter(g => g.archivedFrom === null || g.archivedFrom > today);
      if (active.length >= R.MAX_GOALS) return fail(`目標は${R.MAX_GOALS}個までです`);
      if (goalType === 'diary' && active.some(g => g.type === 'diary')) return fail('日記の目標は1つまでです');
      const text = normalizeText(action.text, goalType);
      if (typeof text === 'string') return fail(text);
      const frequency = validateFrequency(goalType === 'diary' ? DIARY_FREQUENCY : action.frequency);
      if (typeof frequency === 'string') return fail(frequency);
      const goal: Goal = {
        id: action.id,
        type: goalType,
        building: action.building,
        createdOn: today,
        archivedFrom: null,
        text: [{ from: today, value: text }],
        frequency: [{ from: today, value: frequency }],
      };
      return { ok: true, save: { ...save, goals: [...save.goals, goal] } };
    }

    case 'editGoal': {
      const goal = goalById(action.goalId);
      if (!goal || !isActive(goal, today)) return fail('この目標は編集できません');
      const text = normalizeText(action.text, goal.type);
      if (typeof text === 'string') return fail(text);
      const frequency = validateFrequency(goal.type === 'diary' ? DIARY_FREQUENCY : action.frequency);
      if (typeof frequency === 'string') return fail(frequency);

      // 今日作った目標は、作り直しと同じなので今日からすぐ反映
      if (goal.createdOn === today) {
        const updated: Goal = {
          ...goal,
          building: action.building,
          text: [{ from: today, value: text }],
          frequency: [{ from: today, value: frequency }],
        };
        return { ok: true, save: dropInvalidCheck(replaceGoal(save, updated), goal.id, today), note: '変更しました' };
      }

      // 文章の変更は翌日から、頻度の変更は翌週の月曜から（今週・今日の判定を変えないため）
      const tomorrow = addDays(today, 1);
      const nextMonday = addDays(weekStart(today), 7);
      const notes: string[] = [];
      let updated: Goal = { ...goal, building: action.building };
      if (!sameText(textOn(goal, tomorrow), text)) {
        updated = { ...updated, text: upsertTimed(updated.text, tomorrow, text) };
        notes.push(goal.type === 'diary' ? '名前・文字数の変更は明日から反映されます' : '名前・ラインの変更は明日から反映されます');
      }
      if (!sameFrequency(frequencyOn(goal, nextMonday), frequency)) {
        updated = { ...updated, frequency: upsertTimed(updated.frequency, nextMonday, frequency) };
        notes.push('頻度の変更は来週の月曜から反映されます');
      }
      return { ok: true, save: replaceGoal(save, updated), note: notes.join('。') || '変更しました' };
    }

    case 'archiveGoal': {
      const goal = goalById(action.goalId);
      if (!goal || goal.archivedFrom !== null) return fail('この目標はすでに削除されています');
      const archivedFrom = goal.createdOn === today ? today : addDays(today, 1);
      return {
        ok: true,
        save: dropInvalidCheck(replaceGoal(save, { ...goal, archivedFrom }), goal.id, today),
        note: archivedFrom === today ? '削除しました' : '明日から対象外になります（記録は残ります）',
      };
    }

    case 'upgrade': {
      const goal = goalById(action.goalId);
      if (!goal || !isActive(goal, today)) return fail('この建物は建て替えできません');
      const sim = simulate(save, today);
      const st = sim.buildings[goal.id];
      if (!st) return fail('建物が見つかりません');
      const cost = R.upgradeCost(st.level);
      if (cost === null) return fail('これ以上レベルを上げられません');
      if (isFadedNow(save, sim, goal)) {
        return fail(st.level === 0
          ? 'がれきを再建するには、まず担当の目標を1回達成してください'
          : 'さびれている建物は、担当の目標を達成するまで建て替えできません');
      }
      if (sim.coins < cost) return fail(`コインが足りません（あと${cost - sim.coins}枚）`);
      return {
        ok: true,
        save: { ...save, upgrades: [...save.upgrades, { date: today, goalId: goal.id }] },
        note: st.level === 0 ? '再建しました！' : undefined,
      };
    }

    case 'buyFacility': {
      const def = R.FACILITIES[action.kind];
      if (!def) return fail('その施設はありません');
      if (save.facilities.some(f => f.id === action.id)) return fail('同じIDの施設がすでにあります');
      const sim = simulate(save, today);
      if (sim.facilities[action.kind] >= def.max) return fail(`${def.label}は${def.max}つまでです`);
      if (sim.coins < def.coins) return fail(`コインが足りません（あと${def.coins - sim.coins}枚）`);
      if (def.morale > 0 && sim.morale - def.morale < R.MORALE_SPEND_FLOOR) {
        return fail(`住民が疲れてしまうので建てられません（やる気が${R.MORALE_SPEND_FLOOR + def.morale}以上必要）`);
      }
      return {
        ok: true,
        save: { ...save, facilities: [...save.facilities, { id: action.id, kind: action.kind, date: today }] },
        note: `${def.label}を建てました！効果は明日から`,
      };
    }

    case 'addTodo': {
      if (save.todos.some(t => t.id === action.id)) return fail('同じIDのToDoがすでにあります');
      if (save.todos.filter(t => t.doneOn === null).length >= R.MAX_OPEN_TODOS) return fail(`未完了のToDoは${R.MAX_OPEN_TODOS}件までです`);
      const v = normalizeTodo(action.title, action.due);
      if (typeof v === 'string') return fail(v);
      const todo: Todo = { id: action.id, title: v.title, due: v.due, createdOn: today, doneOn: null };
      return { ok: true, save: { ...save, todos: [...save.todos, todo] } };
    }

    case 'editTodo': {
      const todo = todoById(action.id);
      if (!todo) return fail('ToDoが見つかりません');
      const v = normalizeTodo(action.title, action.due);
      if (typeof v === 'string') return fail(v);
      return { ok: true, save: replaceTodo(save, { ...todo, title: v.title, due: v.due }) };
    }

    case 'toggleTodo': {
      const todo = todoById(action.id);
      if (!todo) return fail('ToDoが見つかりません');
      if (todo.doneOn === null) return { ok: true, save: replaceTodo(save, { ...todo, doneOn: today }) };
      // 取り消せるのは今日完了したものだけ（前日分を戻して今日に付け直し、1日の上限をすり抜けるのを防ぐ）
      if (todo.doneOn !== today) return fail('完了を取り消せるのは、今日完了したToDoだけです');
      return { ok: true, save: replaceTodo(save, { ...todo, doneOn: null }) };
    }

    case 'deleteTodo': {
      const todo = todoById(action.id);
      if (!todo) return fail('ToDoが見つかりません');
      if (todo.doneOn !== null) return fail('完了したToDoは消せません（7日たつと自動で隠れます）');
      return { ok: true, save: { ...save, todos: save.todos.filter(t => t.id !== action.id) } };
    }

    case 'setDayStartHour': {
      const h = action.hour;
      if (!Number.isInteger(h) || h < 0 || h > R.MAX_DAY_START_HOUR) return fail(`区切り時刻は0〜${R.MAX_DAY_START_HOUR}時にしてください`);
      return { ok: true, save: { ...save, dayStartHour: h } };
    }

    case 'markSummarySeen': {
      const upTo = action.upTo < yesterday ? action.upTo : yesterday;
      const seen = save.summarySeenDate === null ? upTo : maxDate(save.summarySeenDate, upTo);
      return { ok: true, save: { ...save, summarySeenDate: seen } };
    }

    case 'markBackup':
      return { ok: true, save: { ...save, lastBackupDate: today } };
  }
}

/**
 * 別タブの保存とぶつかったとき用：最新のデータ（base）に、まだ保存できていない操作を順に重ね直す。
 * 重ねられなくなった操作（例：別タブで同じ目標が消された）は捨て、その数を返す。
 */
export function rebaseActions(base: SaveData, actions: Action[], today: GameDate): { save: SaveData; dropped: number } {
  let save = base;
  let dropped = 0;
  for (const a of actions) {
    const r = applyAction(save, a, today);
    if (r.ok) save = r.save;
    else dropped += 1;
  }
  return { save, dropped };
}

export function applyAction(save: SaveData, action: Action, today: GameDate): ActionResult {
  const result = apply(save, action, today);
  if (!result.ok) return result;
  return { ...result, save: { ...result.save, lastSeenDate: maxDate(result.save.lastSeenDate, today) } };
}
