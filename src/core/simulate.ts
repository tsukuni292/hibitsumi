// 記録（SaveData）を最初の日から順に再生して、いまの街の状態を求める。
// 同じ記録と同じ「今日」からは必ず同じ結果になる（純粋関数）。
import { addDays, dateRange, diffDays, isSunday, weekStart, type GameDate } from './date';
import { frequencyOn, idealCharsOn, isActive, isAssignmentGoalOn, isCheckable, isScheduledDaily, isWeeklyOn } from './goals';
import * as R from './rules';
import { EVENTS, eventActiveOn, seasonOf as seasonOfDate, HANAMI_MORALE, MATSURI_TAX_FACTOR, MOCHITSUKI_MORALE, seasonKey, SHUKAKU_IDEAL_BONUS } from './seasons';
import { applyTerrain, FARM_TILES_PER_TAX, isFarm, isValidCell, TERRAIN, type TerrainKind } from './terrain';
import type { Assignment, CheckLevel, FacilityKind, FacilityPurchase, Goal, SaveData, SeasonEvent } from './types';

export type DayKind =
  /** 通常の判定 */
  | 'normal'
  /** 休養日（判定なし） */
  | 'rest'
  /** 予定の目標がない日（判定なし） */
  | 'none'
  /** 長期間チェックがなく、罰を止めている日 */
  | 'absent';

export interface WeeklySettlement {
  goalId: string;
  count: number;
  times: number;
  delta: number;
}

export interface DayResult {
  date: GameDate;
  kind: DayKind;
  /** 日次スコア（0〜1）。判定なしの日は null */
  score: number | null;
  moraleBefore: number;
  moraleAfter: number;
  /** 目標・日記・ToDo で得たコインの合計 */
  coinsEarned: number;
  todoCoins: number;
  assignmentCoins: number;
  coinsSpent: number;
  moraleSpent: number;
  weekly: WeeklySettlement[];
  /** この日が期限で、期限内に完了しなかった課題のID */
  overdue: string[];
  newlyFaded: string[];
  recovered: string[];
  /** 倒壊してレベルが下がった建物 */
  collapsed: string[];
  /** 神社のお守りで倒壊を防いだ建物 */
  protected: string[];
  /** その日の終わりの人口と、税収（活動した日だけ） */
  population: number;
  tax: number;
  /** その日に引っ越していった（+）・戻ってきた（-）住民 */
  movedOut: number;
}

/** none＝神社なし、tomorrow＝建てたばかりで明日から、ready＝使える、recharging＝使ったあとの休み中 */
export type CharmState = 'none' | 'tomorrow' | 'ready' | 'recharging';

/** 開始日〜今日の範囲にあり、上限を超えない施設の購入（表示と計算で同じ規則を使う） */
export function inRangeFacilities(save: SaveData, today: GameDate): FacilityPurchase[] {
  const seen: Partial<Record<FacilityKind, number>> = {};
  return save.facilities
    .filter(f => f.date >= save.startDate && f.date <= today && R.FACILITIES[f.kind] !== undefined)
    .map((f, i) => ({ f, i }))
    // 日付順（同じ日は記録順）に数えて、上限を超えた分は除く
    .sort((a, b) => (a.f.date < b.f.date ? -1 : a.f.date > b.f.date ? 1 : a.i - b.i))
    .filter(({ f }) => {
      seen[f.kind] = (seen[f.kind] ?? 0) + 1;
      return (seen[f.kind] ?? 0) <= R.FACILITIES[f.kind].max;
    })
    .map(({ f }) => f);
}

export interface BuildingState {
  goalId: string;
  /** 0 はがれき */
  level: number;
  /** 担当目標の連続未達回数（確定済みの日まで）。週N回の目標は1週間ゼロでN回分 */
  misses: number;
}

export interface SimResult {
  today: GameDate;
  /** 今日使ったやる気まで含めた値（今日の達成による増減は明日確定） */
  morale: number;
  /** 今日のチェック・建設まで含めた残高（マイナスもありうる） */
  coins: number;
  todayCoins: number;
  /** 今日のToDo完了のうち、コインがもらえる残り件数 */
  todoRewardsLeft: number;
  /** 今日の課題の期限内完了のうち、コインがもらえる残り件数 */
  assignmentRewardsLeft: number;
  buildings: Record<string, BuildingState>;
  facilities: Record<FacilityKind, number>;
  /** 今日の未達に対して神社のお守りが使えるか（神社がなければ false） */
  charmReady: boolean;
  charmState: CharmState;
  /** 確定済みの日（開始日〜昨日）の結果 */
  days: DayResult[];
  /** 連続でチェックした日数（今日チェック済みなら今日も含む） */
  streak: number;
  /** 今の人口と内訳 */
  population: Population;
  /** 今日活動すると、明日の朝に入る税収 */
  taxToday: number;
  /** 今日すでに活動したか（税収の対象か） */
  activeToday: boolean;
  /** 開いた季節の行事（有効なものだけ） */
  events: SeasonEvent[];
  /** 田んぼ・畑による税収の上乗せ（昨日までに置いた分） */
  farmTax: number;
}

export interface Population {
  total: number;
  /** 最初からいる住民＋民家の住民 */
  houses: number;
  /** 施設に集まる住民 */
  facilities: number;
  /** 建物のレベルの合計 */
  buildings: number;
  /** 活動した日の積み重ね */
  activity: number;
  /** やる気が低くて引っ越していった住民 */
  away: number;
}

/** その日の達成度。日記の目標は本文の文字数から決まる */
export function checkOn(save: SaveData, rest: ReadonlySet<GameDate>, goal: Goal, date: GameDate): CheckLevel | null {
  if (rest.has(date)) return null;
  if (!isCheckable(goal, date)) return null;
  if (goal.type === 'diary') return R.diaryLevel(save.diary[date], idealCharsOn(goal, date));
  return save.checks[date]?.[goal.id] ?? null;
}

/** 課題を doneOn に完了したときのコイン（上限は別に数える）。期限後は0 */
export function assignmentReward(a: Assignment, doneOn: GameDate): number {
  if (doneOn > a.due) return 0;
  return R.ASSIGNMENT_ONTIME_COIN + (diffDays(a.due, doneOn) >= R.ASSIGNMENT_EARLY_DAYS ? R.ASSIGNMENT_EARLY_BONUS : 0);
}

/**
 * 課題の完了を評価の対象にするか。
 * - 登録した翌日以降の完了だけ（その場で登録してすぐ完了、の抜け道を防ぐ）。毎週の課題から出たものは前もって登録してあるので、出た当日から
 * - その日に担当の目標が「課題があるときだけ」であること（頻度を戻した目標・削除した目標は対象外）
 */
export function countsAsAssignmentWork(goal: Goal | undefined, a: Assignment, doneOn: GameDate): boolean {
  return goal !== undefined && isRegisteredBefore(a, doneOn) && isAssignmentGoalOn(goal, doneOn);
}

/** 完了した日より前に登録してあったか */
export function isRegisteredBefore(a: Assignment, doneOn: GameDate): boolean {
  return doneOn > a.createdOn || (a.preRegistered === true && doneOn === a.createdOn);
}

/** その日に担当目標を「達成した」か（チェック・日記、または課題を期限内に完了） */
export function achievedOn(save: SaveData, rest: ReadonlySet<GameDate>, goal: Goal, date: GameDate): boolean {
  if (checkOn(save, rest, goal, date) !== null) return true;
  return save.assignments.some(
    a => a.goalId === goal.id && a.doneOn === date && a.doneOn <= a.due && countsAsAssignmentWork(goal, a, date),
  );
}

function groupBy<T>(list: T[], key: (t: T) => GameDate): Map<GameDate, T[]> {
  const map = new Map<GameDate, T[]>();
  for (const item of list) {
    const k = key(item);
    const arr = map.get(k) ?? [];
    arr.push(item);
    map.set(k, arr);
  }
  return map;
}

const emptyFacilities = (): Record<FacilityKind, number> => ({ bench: 0, sakura: 0, stall: 0, teahouse: 0, bathhouse: 0, shrine: 0 });

export function simulate(save: SaveData, today: GameDate): SimResult {
  const rest = new Set(save.restDays);
  const goals = save.goals;
  const goalById = new Map(goals.map(g => [g.id, g]));
  const upgrades = groupBy(save.upgrades, u => u.date);
  // 開始日〜今日の範囲外の購入（手で編集したバックアップなど）は、表示・効果・費用のすべてで無視する
  const validPurchases = inRangeFacilities(save, today);
  const purchases = groupBy(validPurchases, f => f.date);
  // 季節の行事：今日までに開いた、季節に合っていて季節ごとに1回目のもの
  const heldKeys = new Set<string>();
  const validEvents = [...save.events]
    .filter(e => EVENTS[e.kind] !== undefined && e.date >= save.startDate && e.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .filter(e => {
      const key = `${e.kind}:${seasonKey(e.date)}`;
      if (heldKeys.has(key) || EVENTS[e.kind].season !== seasonOfDate(e.date)) return false;
      heldKeys.add(key);
      return true;
    });
  const eventsOn = groupBy(validEvents, e => e.date);
  const effectOn = (kind: 'matsuri' | 'shukaku', date: GameDate) => validEvents.some(e => e.kind === kind && eventActiveOn(e.date, date));

  // 地形：開始日〜今日の記録だけ（置ける場所でないものは無視）。田畑の税収は置いた翌日から
  const terrainByDate = groupBy(
    save.terrainLog.filter(e => e.date >= save.startDate && e.date <= today && isValidCell(e.x, e.y) && (e.kind === null || TERRAIN[e.kind] !== undefined)),
    e => e.date,
  );
  const terrain = new Map<string, TerrainKind>();
  const farmTax = () => Math.floor([...terrain.values()].filter(isFarm).length / FARM_TILES_PER_TAX);

  const todosDone = groupBy(save.todos.filter(t => t.doneOn !== null), t => t.doneOn as GameDate);
  // 担当の目標が消えた課題（壊れたデータ）は数えない
  const assignments = save.assignments.filter(a => goalById.has(a.goalId));
  const assignmentsDone = groupBy(assignments.filter(a => a.doneOn !== null), a => a.doneOn as GameDate);
  const assignmentsDue = groupBy(assignments, a => a.due);

  const buildings: Record<string, BuildingState> = {};
  for (const g of goals) buildings[g.id] = { goalId: g.id, level: 1, misses: 0 };
  const b = (id: string): BuildingState => (buildings[id] ??= { goalId: id, level: 1, misses: 0 });

  // 施設の効果は「建てた翌日から」
  const firstBuilt = new Map<FacilityKind, GameDate>();
  for (const f of validPurchases) {
    const cur = firstBuilt.get(f.kind);
    if (cur === undefined || f.date < cur) firstBuilt.set(f.kind, f.date);
  }
  const effective = (kind: FacilityKind, date: GameDate) => {
    const d = firstBuilt.get(kind);
    return d !== undefined && d < date;
  };

  let morale = R.MORALE_INITIAL;
  let coins = 0;
  let absentPenalties = 0;
  let streak = 0;
  let activeDays = 0;
  let away = 0;
  /** お守りが使えるようになる日（null は「神社があればいつでも」） */
  let charmReadyOn: GameDate | null = null;
  const facilities = emptyFacilities();
  const days: DayResult[] = [];

  const coinsForCheck = (c: CheckLevel, date: GameDate) =>
    R.COINS[c]
    + (c === 'ideal' && effective('teahouse', date) ? R.TEAHOUSE_IDEAL_BONUS : 0)
    + (c === 'ideal' && effectOn('shukaku', date) ? SHUKAKU_IDEAL_BONUS : 0);

  const todoCoinsOn = (date: GameDate) => {
    const n = Math.min((todosDone.get(date) ?? []).length, R.TODO_DAILY_CAP);
    return n * (R.TODO_COIN + (effective('stall', date) ? R.STALL_TODO_BONUS : 0));
  };

  /**
   * その日に完了した課題：コイン（期限内のものを報酬の多い順に1日の上限まで）、期限内に完了した目標、件数。
   * 評価の対象外の完了（登録した当日の完了など）はコインも活動もなし
   */
  const assignmentsOn = (date: GameDate) => {
    const done = (assignmentsDone.get(date) ?? []).filter(a => countsAsAssignmentWork(goalById.get(a.goalId), a, date));
    const onTime = done.filter(a => date <= a.due);
    const rewards = onTime.map(a => assignmentReward(a, date)).sort((x, y) => y - x);
    const coinsEarned = rewards.slice(0, R.ASSIGNMENT_DAILY_CAP).reduce((sum, c) => sum + c, 0);
    return { coins: coinsEarned, onTimeGoals: new Set(onTime.map(a => a.goalId)), onTimeCount: onTime.length, any: done.length > 0 };
  };

  /** 連続未達を n 回増やす。7の倍数をまたいだら倒壊（お守りがあれば防ぐ） */
  const addMisses = (goalId: string, n: number, date: GameDate, collapsed: string[], prot: string[]) => {
    const st = b(goalId);
    const before = st.misses;
    const after = before + n;
    const crossings = Math.floor(after / R.COLLAPSE_EVERY) - Math.floor(before / R.COLLAPSE_EVERY);
    st.misses = after;
    // がれき（レベル0）はこれ以上失うものがないので、お守りも使わない
    if (crossings <= 0 || st.level === 0) return;
    const charmOk = effective('shrine', date) && (charmReadyOn === null || date >= charmReadyOn);
    if (charmOk) {
      st.misses = R.FADE_AFTER_MISSES;
      charmReadyOn = addDays(date, R.SHRINE_RECHARGE_DAYS);
      prot.push(goalId);
      return;
    }
    st.level = Math.max(0, st.level - crossings);
    collapsed.push(goalId);
  };

  /**
   * 建て替え・施設の購入を反映する（その日の判定より前に行う）。戻り値は使ったコインとやる気。
   * 建て替えの可否は「その日の始まりにさびれていたか」で決める。さびれていた建物は、その日に担当目標を
   * 達成していなければ無効（チェック→建て替え→チェックを外す、の抜け道を防ぐ）。
   * その日の未達で後からさびれても、建て替えは取り消さない。
   */
  const applySpending = (date: GameDate): { coins: number; morale: number } => {
    let spentCoins = 0;
    let spentMorale = 0;
    for (const u of upgrades.get(date) ?? []) {
      const goal = goalById.get(u.goalId);
      if (!goal) continue;
      const st = b(u.goalId);
      const cost = R.upgradeCost(st.level);
      if (cost === null) continue; // 最大レベル（記録が壊れていても落ちないように無視）
      if (st.misses >= R.FADE_AFTER_MISSES && !achievedOn(save, rest, goal, date)) continue;
      st.level += 1;
      spentCoins += cost;
    }
    for (const p of purchases.get(date) ?? []) {
      const def = R.FACILITIES[p.kind];
      if (!def || facilities[p.kind] >= def.max) continue;
      facilities[p.kind] += 1;
      spentCoins += def.coins;
      spentMorale += def.morale;
    }
    // 地形：置いたマスの費用（消すのは無料）
    for (const e of terrainByDate.get(date) ?? []) if (e.kind !== null) spentCoins += TERRAIN[e.kind].coins;
    // 季節の行事：費用と、その場で効く分（お花見・餅つきのやる気）
    let gainedMorale = 0;
    for (const e of eventsOn.get(date) ?? []) {
      spentCoins += EVENTS[e.kind].coins;
      if (e.kind === 'hanami') gainedMorale += HANAMI_MORALE;
      if (e.kind === 'mochitsuki') gainedMorale += MOCHITSUKI_MORALE;
    }
    coins -= spentCoins;
    morale = Math.min(R.MORALE_MAX, Math.max(R.MORALE_MIN, R.round2(morale - spentMorale + gainedMorale)));
    return { coins: spentCoins, morale: spentMorale };
  };

  /**
   * その日の人口（引っ越しを除く前）。建物のレベル・民家（発展段階）・施設（建てた翌日から）・活動した日の積み重ね
   */
  const grossPopulation = (date: GameDate): Omit<Population, 'total' | 'away'> => {
    const levels = goals.filter(g => isActive(g, date)).map(g => b(g.id).level);
    const houses = R.HOUSES_BY_STAGE[R.stageForLevels(levels)];
    return {
      houses: R.RESIDENT_BASE + houses * R.RESIDENTS_PER_HOUSE,
      facilities: validPurchases.filter(f => f.date < date).length,
      buildings: levels.reduce((a, l) => a + l, 0),
      activity: Math.min(R.ACTIVE_DAYS_RESIDENTS_MAX, Math.floor(activeDays / R.ACTIVE_DAYS_PER_RESIDENT)),
    };
  };
  const populationOf = (g: Omit<Population, 'total' | 'away'>, awayNow: number): Population => {
    const gross = g.houses + g.facilities + g.buildings + g.activity;
    const a = Math.min(awayNow, Math.max(0, gross - R.MIN_POPULATION));
    return { ...g, away: a, total: gross - a };
  };
  const taxFor = (pop: number) => Math.floor(pop * R.TAX_PER_RESIDENT);

  const fadedSet = (date: GameDate): Set<string> =>
    new Set(goals.filter(g => isActive(g, date) && b(g.id).misses >= R.FADE_AFTER_MISSES).map(g => g.id));

  const yesterday = addDays(today, -1);
  for (const date of dateRange(save.startDate, yesterday)) {
    const dayStartMorale = morale;
    const fadedBefore = fadedSet(date);
    const isRest = rest.has(date);
    const collapsed: string[] = [];
    const prot: string[] = [];

    // 0. 建設・施設（その日の始まりの状態で判定。今日の画面と同じく、やる気の消費は判定の前）
    const spent = applySpending(date);
    const before = morale;

    // 1. 報酬（目標・日記・ToDo）
    let earned = 0;
    let anyCheck = false;
    for (const g of goals) {
      const c = checkOn(save, rest, g, date);
      if (c) {
        earned += coinsForCheck(c, date);
        anyCheck = true;
        // 週N回の目標は、どの日でも1回達成すれば回復
        if (isWeeklyOn(g, date)) b(g.id).misses = 0;
      }
    }
    const todoCoins = todoCoinsOn(date);
    earned += todoCoins;
    const asg = assignmentsOn(date);
    earned += asg.coins;
    // 課題の完了も「その日の活動」。期限内に完了すれば、担当の建物の連続未達は0に戻る
    if (asg.any) anyCheck = true;
    for (const goalId of asg.onTimeGoals) b(goalId).misses = 0;
    coins += earned;

    // 2. 日次判定
    // 長期不在：チェックのない日に受けた罰が ABSENCE_CAP_DAYS 回に達したら、それ以降の罰を止める
    // （予定のない日は罰がないので数えない）
    if (anyCheck) absentPenalties = 0;
    const capped = !anyCheck && absentPenalties >= R.ABSENCE_CAP_DAYS;
    let kind: DayKind;
    let score: number | null = null;
    let delta = 0;
    if (isRest) {
      kind = 'rest';
    } else if (capped) {
      kind = 'absent';
    } else {
      const scheduled = goals.filter(g => isScheduledDaily(g, date));
      if (scheduled.length === 0) {
        kind = 'none';
      } else {
        kind = 'normal';
        let pts = 0;
        for (const g of scheduled) {
          const c = checkOn(save, rest, g, date);
          pts += c ? R.POINTS[c] : 0;
          if (c) b(g.id).misses = 0;
          else addMisses(g.id, 1, date, collapsed, prot);
        }
        score = pts / scheduled.length;
        delta += R.moraleDeltaForScore(score);
        if (score === 1 && before < R.RECOVERY_THRESHOLD) delta += R.RECOVERY_BONUS;
      }
    }

    // 3. 週の締め（日曜）。休養日でも行う（週N回のNは減らさない）。長期不在中は行わない
    const weekly: WeeklySettlement[] = [];
    if (isSunday(date) && !capped) {
      const monday = weekStart(date);
      for (const g of goals) {
        // 月曜から日曜まで「週N回」で有効だった目標だけ精算する（途中で追加・削除した週は対象外）
        if (!isWeeklyOn(g, monday) || !isWeeklyOn(g, date)) continue;
        const f = frequencyOn(g, date);
        if (!f || f.kind !== 'weekly' || f.times < 1) continue;
        const count = dateRange(monday, date).filter(d => checkOn(save, rest, g, d) !== null).length;
        const r = Math.min(1, count / f.times);
        const d = (r - 0.5) * R.WEEKLY_FACTOR;
        delta += d;
        weekly.push({ goalId: g.id, count, times: f.times, delta: R.round2(d) });
        // 1週間まったく達成できなければ N 回分の未達
        if (count === 0) addMisses(g.id, f.times, date, collapsed, prot);
      }
    }

    // 4. 課題の期限切れ：この日が期限で、期限内に完了しなかったもの。休養日でも罰あり（実際の締切は休めないため）
    const overdue: string[] = [];
    if (!capped) {
      for (const a of assignmentsDue.get(date) ?? []) {
        const goal = goalById.get(a.goalId);
        if (!goal || !isActive(goal, date)) continue;
        if (a.doneOn !== null && a.doneOn <= a.due) continue;
        addMisses(a.goalId, 1, date, collapsed, prot);
        overdue.push(a.id);
      }
    }

    if (!anyCheck && (((kind === 'normal' || weekly.length > 0) && !isRest) || overdue.length > 0)) absentPenalties += 1;

    if (delta < 0 && effective('bathhouse', date)) delta *= R.BATHHOUSE_PENALTY_FACTOR;
    if (delta > 0 && before > R.MORALE_SOFT_CAP) delta /= 2;
    // 課題の期限切れは、達成度による増減とは別に「1件ごとに必ず −3」（半分にしたり上限で打ち消したりしない）
    const afterDaily = Math.min(R.MORALE_MAX, Math.max(R.MORALE_MIN, R.round2(before + delta)));
    morale = Math.max(R.MORALE_MIN, R.round2(afterDaily - overdue.length * R.ASSIGNMENT_OVERDUE_PENALTY));

    // 5. 連続記録（休養日と「予定なし・チェックなし」の日は途切れも増えもしない）
    if (!isRest) {
      if (anyCheck) streak += 1;
      else if (kind !== 'none') streak = 0;
    }

    // 6. 人口と税収（機能を入れた日から）。しょんぼりで終わった日は1人引っ越し、元気で終わった日は1人戻る。
    //    税収は活動した日だけ、その日の終わりの人口に応じて
    if (anyCheck) activeDays += 1;
    let movedOut = 0;
    let tax = 0;
    const gross = grossPopulation(date);
    if (date >= save.taxFrom) {
      const mood = R.moodForMorale(morale);
      const prev = populationOf(gross, away).away;
      if (mood === 'sad') away = prev + 1;
      else if (mood === 'happy') away = Math.max(0, prev - 1);
      else away = prev;
      // 餅つきの日は、引っ越した住民が全員戻る
      if ((eventsOn.get(date) ?? []).some(e => e.kind === 'mochitsuki')) away = 0;
      movedOut = populationOf(gross, away).away - prev;
      away = populationOf(gross, away).away;
      if (anyCheck) tax = (taxFor(populationOf(gross, away).total) + farmTax()) * (effectOn('matsuri', date) ? MATSURI_TAX_FACTOR : 1);
      coins += tax;
    }
    const population = populationOf(gross, away).total;
    // その日に置いた地形は、翌日から田畑の税収に数える
    for (const e of terrainByDate.get(date) ?? []) applyTerrain(terrain, e);

    const fadedAfter = fadedSet(date);
    days.push({
      date,
      kind,
      score,
      moraleBefore: dayStartMorale,
      moraleAfter: morale,
      coinsEarned: earned,
      todoCoins,
      assignmentCoins: asg.coins,
      coinsSpent: spent.coins,
      moraleSpent: spent.morale,
      weekly,
      overdue,
      newlyFaded: [...fadedAfter].filter(id => !fadedBefore.has(id)),
      recovered: [...fadedBefore].filter(id => !fadedAfter.has(id)),
      collapsed,
      protected: prot,
      population,
      tax,
      movedOut,
    });
  }

  // 今日（まだ確定していない）：コイン・建設・やる気の消費だけ反映し、達成による増減は明日
  let todayCoins = 0;
  let anyToday = false;
  let todoRewardsLeft = R.TODO_DAILY_CAP;
  let assignmentRewardsLeft = R.ASSIGNMENT_DAILY_CAP;
  if (today >= save.startDate) {
    for (const g of goals) {
      const c = checkOn(save, rest, g, today);
      if (c) {
        todayCoins += coinsForCheck(c, today);
        anyToday = true;
      }
    }
    todayCoins += todoCoinsOn(today);
    todoRewardsLeft = Math.max(0, R.TODO_DAILY_CAP - (todosDone.get(today) ?? []).length);
    const asg = assignmentsOn(today);
    todayCoins += asg.coins;
    if (asg.any) anyToday = true;
    assignmentRewardsLeft = Math.max(0, R.ASSIGNMENT_DAILY_CAP - asg.onTimeCount);
    coins += todayCoins;
    applySpending(today);
  }

  // 今日の人口：今日の建設まで反映。活動した日の積み重ねは、今日活動していれば今日の分も数える
  const activeToday = anyToday;
  if (activeToday) activeDays += 1;
  const heldToday = (eventsOn.get(today) ?? []).some(e => e.kind === 'mochitsuki');
  const population = populationOf(grossPopulation(today), today >= save.taxFrom && !heldToday ? away : 0);

  // charmReadyOn はクロージャ内で書き換わるので、型の絞り込みを外して読む
  const readyOn = charmReadyOn as GameDate | null;
  // 今日の分は明日の確定時に effective('shrine', today) で判定されるので、表示も同じ条件にする
  const charmState: CharmState =
    facilities.shrine === 0 ? 'none'
      : !effective('shrine', today) ? 'tomorrow'
        : readyOn === null || today >= readyOn ? 'ready' : 'recharging';
  const charmReady = charmState === 'ready';

  return {
    today,
    morale,
    coins,
    todayCoins,
    todoRewardsLeft,
    assignmentRewardsLeft,
    buildings,
    facilities,
    charmReady,
    charmState,
    days,
    // 休養日は連続記録を増やさない（確定時と同じ規則）
    streak: streak + (anyToday && !rest.has(today) ? 1 : 0),
    population,
    taxToday: today >= save.taxFrom ? (taxFor(population.total) + farmTax()) * (effectOn('matsuri', today) ? MATSURI_TAX_FACTOR : 1) : 0,
    farmTax: farmTax(),
    events: validEvents,
    activeToday,
  };
}

/** 建物がいま「さびれ」て見えるか（今日チェックすればその場で回復して見える） */
export function isFadedNow(save: SaveData, sim: SimResult, goal: Goal): boolean {
  if (!isActive(goal, sim.today)) return false;
  const st = sim.buildings[goal.id];
  if (!st || st.misses < R.FADE_AFTER_MISSES) return false;
  return !achievedOn(save, new Set(save.restDays), goal, sim.today);
}

/**
 * 次の未達で倒壊するか（予告用）。毎日・曜日指定は「次の予定日」、週N回は「今週ゼロだったら」。
 * 今日すでに達成していれば false。がれき（レベル0）は失うものがないので false。
 */
export function isCollapseImminent(save: SaveData, sim: SimResult, goal: Goal): boolean {
  if (!isActive(goal, sim.today)) return false;
  const st = sim.buildings[goal.id];
  if (!st || st.level === 0) return false;
  const rest = new Set(save.restDays);
  if (achievedOn(save, rest, goal, sim.today)) return false;
  const f = frequencyOn(goal, sim.today);
  if (!f) return false;
  const n = f.kind === 'weekly' ? f.times : 1;
  if (f.kind === 'assignments') {
    // 今日が期限で、まだ終わっていない課題があるときだけ（期限切れ1件で未達1回）
    const dueToday = save.assignments.filter(a => a.goalId === goal.id && a.due === sim.today && a.doneOn === null).length;
    if (dueToday === 0) return false;
    return Math.floor((st.misses + dueToday) / R.COLLAPSE_EVERY) > Math.floor(st.misses / R.COLLAPSE_EVERY);
  }
  if (f.kind === 'weekly') {
    // 今週の月曜から「週N回」でなかった目標（週の途中で追加・変更）は、今週は精算されない
    if (!isWeeklyOn(goal, weekStart(sim.today))) return false;
    // 今週すでに1回でも達成していれば、今週の締めで未達にはならない
    const done = dateRange(weekStart(sim.today), sim.today).some(d => checkOn(save, rest, goal, d) !== null);
    if (done) return false;
  } else if (rest.has(sim.today) || !isScheduledDaily(goal, sim.today)) {
    // 今日が休養日・予定のない日なら、今日の未達では倒壊しない
    return false;
  }
  return Math.floor((st.misses + n) / R.COLLAPSE_EVERY) > Math.floor(st.misses / R.COLLAPSE_EVERY);
}

export interface PeriodSummary {
  from: GameDate;
  to: GameDate;
  dayCount: number;
  moraleBefore: number;
  moraleAfter: number;
  coinsEarned: number;
  /** 期間中の税収の合計（coinsEarned とは別） */
  tax: number;
  /** 期間中に引っ越していった（+）・戻ってきた（-）住民の合計 */
  movedOut: number;
  newlyFaded: string[];
  recovered: string[];
  collapsed: string[];
  protected: string[];
  weekly: WeeklySettlement[];
  /** 期限を守れなかった課題のID */
  overdue: string[];
  lastDay: DayResult;
}

/** after より後〜昨日までの結果をまとめる（朝のまとめ用）。対象がなければ null */
export function summarizeSince(sim: SimResult, after: GameDate | null): PeriodSummary | null {
  const list = sim.days.filter(d => after === null || d.date > after);
  const first = list[0];
  const last = list[list.length - 1];
  if (!first || !last) return null;
  // さびれ(+1)と回復(-1)は目標ごとに交互に起きるので、合計で期間全体の差分になる
  const net = new Map<string, number>();
  for (const d of list) {
    for (const id of d.newlyFaded) net.set(id, (net.get(id) ?? 0) + 1);
    for (const id of d.recovered) net.set(id, (net.get(id) ?? 0) - 1);
  }
  const faded = [...net].filter(([, v]) => v > 0).map(([id]) => id);
  const recovered = [...net].filter(([, v]) => v < 0).map(([id]) => id);
  const unique = (ids: string[]) => [...new Set(ids)];
  return {
    from: first.date,
    to: last.date,
    dayCount: list.length,
    moraleBefore: first.moraleBefore,
    moraleAfter: last.moraleAfter,
    coinsEarned: list.reduce((a, d) => a + d.coinsEarned, 0),
    tax: list.reduce((a, d) => a + d.tax, 0),
    movedOut: list.reduce((a, d) => a + d.movedOut, 0),
    newlyFaded: faded,
    recovered,
    collapsed: unique(list.flatMap(d => d.collapsed)),
    protected: unique(list.flatMap(d => d.protected)),
    weekly: list.flatMap(d => d.weekly),
    overdue: list.flatMap(d => d.overdue),
    lastDay: last,
  };
}
