// 記録（SaveData）を最初の日から順に再生して、いまの街の状態を求める。
// 同じ記録と同じ「今日」からは必ず同じ結果になる（純粋関数）。
import { addDays, dateRange, isSunday, weekStart, type GameDate } from './date';
import { frequencyOn, idealCharsOn, isActive, isCheckable, isScheduledDaily, isWeeklyOn } from './goals';
import * as R from './rules';
import type { CheckLevel, FacilityKind, FacilityPurchase, Goal, SaveData } from './types';

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
  coinsSpent: number;
  moraleSpent: number;
  weekly: WeeklySettlement[];
  newlyFaded: string[];
  recovered: string[];
  /** 倒壊してレベルが下がった建物 */
  collapsed: string[];
  /** 神社のお守りで倒壊を防いだ建物 */
  protected: string[];
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
  buildings: Record<string, BuildingState>;
  facilities: Record<FacilityKind, number>;
  /** 今日の未達に対して神社のお守りが使えるか（神社がなければ false） */
  charmReady: boolean;
  charmState: CharmState;
  /** 確定済みの日（開始日〜昨日）の結果 */
  days: DayResult[];
  /** 連続でチェックした日数（今日チェック済みなら今日も含む） */
  streak: number;
}

/** その日の達成度。日記の目標は本文の文字数から決まる */
export function checkOn(save: SaveData, rest: ReadonlySet<GameDate>, goal: Goal, date: GameDate): CheckLevel | null {
  if (rest.has(date)) return null;
  if (!isCheckable(goal, date)) return null;
  if (goal.type === 'diary') return R.diaryLevel(save.diary[date], idealCharsOn(goal, date));
  return save.checks[date]?.[goal.id] ?? null;
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
  const todosDone = groupBy(save.todos.filter(t => t.doneOn !== null), t => t.doneOn as GameDate);

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
  /** お守りが使えるようになる日（null は「神社があればいつでも」） */
  let charmReadyOn: GameDate | null = null;
  const facilities = emptyFacilities();
  const days: DayResult[] = [];

  const coinsForCheck = (c: CheckLevel, date: GameDate) =>
    R.COINS[c] + (c === 'ideal' && effective('teahouse', date) ? R.TEAHOUSE_IDEAL_BONUS : 0);

  const todoCoinsOn = (date: GameDate) => {
    const n = Math.min((todosDone.get(date) ?? []).length, R.TODO_DAILY_CAP);
    return n * (R.TODO_COIN + (effective('stall', date) ? R.STALL_TODO_BONUS : 0));
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
      if (st.misses >= R.FADE_AFTER_MISSES && checkOn(save, rest, goal, date) === null) continue;
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
    coins -= spentCoins;
    morale = Math.max(R.MORALE_MIN, R.round2(morale - spentMorale));
    return { coins: spentCoins, morale: spentMorale };
  };

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

    if (!anyCheck && !isRest && (kind === 'normal' || weekly.length > 0)) absentPenalties += 1;

    if (delta < 0 && effective('bathhouse', date)) delta *= R.BATHHOUSE_PENALTY_FACTOR;
    if (delta > 0 && before > R.MORALE_SOFT_CAP) delta /= 2;
    morale = Math.min(R.MORALE_MAX, Math.max(R.MORALE_MIN, R.round2(before + delta)));

    // 4. 連続記録（休養日と「予定なし・チェックなし」の日は途切れも増えもしない）
    if (!isRest) {
      if (anyCheck) streak += 1;
      else if (kind !== 'none') streak = 0;
    }

    const fadedAfter = fadedSet(date);
    days.push({
      date,
      kind,
      score,
      moraleBefore: dayStartMorale,
      moraleAfter: morale,
      coinsEarned: earned,
      todoCoins,
      coinsSpent: spent.coins,
      moraleSpent: spent.morale,
      weekly,
      newlyFaded: [...fadedAfter].filter(id => !fadedBefore.has(id)),
      recovered: [...fadedBefore].filter(id => !fadedAfter.has(id)),
      collapsed,
      protected: prot,
    });
  }

  // 今日（まだ確定していない）：コイン・建設・やる気の消費だけ反映し、達成による増減は明日
  let todayCoins = 0;
  let anyToday = false;
  let todoRewardsLeft = R.TODO_DAILY_CAP;
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
    coins += todayCoins;
    applySpending(today);
  }

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
    buildings,
    facilities,
    charmReady,
    charmState,
    days,
    streak: streak + (anyToday ? 1 : 0),
  };
}

/** 建物がいま「さびれ」て見えるか（今日チェックすればその場で回復して見える） */
export function isFadedNow(save: SaveData, sim: SimResult, goal: Goal): boolean {
  if (!isActive(goal, sim.today)) return false;
  const st = sim.buildings[goal.id];
  if (!st || st.misses < R.FADE_AFTER_MISSES) return false;
  return checkOn(save, new Set(save.restDays), goal, sim.today) === null;
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
  if (checkOn(save, rest, goal, sim.today) !== null) return false;
  const f = frequencyOn(goal, sim.today);
  if (!f) return false;
  const n = f.kind === 'weekly' ? f.times : 1;
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
  newlyFaded: string[];
  recovered: string[];
  collapsed: string[];
  protected: string[];
  weekly: WeeklySettlement[];
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
    newlyFaded: faded,
    recovered,
    collapsed: unique(list.flatMap(d => d.collapsed)),
    protected: unique(list.flatMap(d => d.protected)),
    weekly: list.flatMap(d => d.weekly),
    lastDay: last,
  };
}
