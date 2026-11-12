// 毎週の課題：出る曜日になったら、課題リストに1件ずつ自動で追加する
import { addDays, dateRange, maxDate, weekday, type GameDate } from './date';
import { isAssignmentGoalOn } from './goals';
import * as R from './rules';
import type { Assignment, SaveData, WeeklyAssignment } from './types';

/** 出た日から締切までの日数（1〜7）。同じ曜日なら1週間後 */
export function weeklyDueOffset(issueDay: number, dueDay: number): number {
  return ((dueDay - issueDay + 6) % 7) + 1;
}

/** date 以前で最後に課題が出た日（date が出る曜日なら date） */
export function lastIssueDate(issueDay: number, date: GameDate): GameDate {
  return addDays(date, -((weekday(date) - issueDay + 7) % 7));
}

export const weeklyInstanceId = (w: WeeklyAssignment, issuedOn: GameDate) => `${w.id}@${issuedOn}`;

export function weeklyInstance(w: WeeklyAssignment, issuedOn: GameDate, preRegistered: boolean): Assignment {
  return {
    id: weeklyInstanceId(w, issuedOn),
    goalId: w.goalId,
    title: w.title,
    due: addDays(issuedOn, weeklyDueOffset(w.issueDay, w.dueDay)),
    createdOn: issuedOn,
    doneOn: null,
    weeklyId: w.id,
    ...(preRegistered ? { preRegistered: true as const } : {}),
  };
}

/**
 * 今日までに出るはずの毎週の課題を課題リストに追加する（何度呼んでも同じ結果）。
 * 担当の目標がその日「課題があるときだけ」でなければ出さない。しばらく開かなかった場合は WEEKLY_CATCHUP_DAYS 日前の分まで。
 */
export function issueWeeklyAssignments(save: SaveData, today: GameDate): SaveData {
  if (save.weeklyAssignments.every(w => w.issuedThrough >= today)) return save;
  const ids = new Set(save.assignments.map(a => a.id));
  const added: Assignment[] = [];
  const weeklyAssignments = save.weeklyAssignments.map(w => {
    if (w.issuedThrough >= today) return w;
    const goal = save.goals.find(g => g.id === w.goalId);
    const from = maxDate(addDays(w.issuedThrough, 1), addDays(today, -(R.WEEKLY_CATCHUP_DAYS - 1)));
    for (const d of dateRange(from, today)) {
      if (weekday(d) !== w.issueDay || !goal || !isAssignmentGoalOn(goal, d)) continue;
      const a = weeklyInstance(w, d, true);
      // 未完了の上限では止めない（毎週の課題は数が決まっているので増えすぎない。止めると出し直せなくなる）
      if (ids.has(a.id)) continue;
      ids.add(a.id);
      added.push(a);
    }
    return { ...w, issuedThrough: today };
  });
  return { ...save, weeklyAssignments, assignments: [...save.assignments, ...added] };
}
