// 通知の予定づくり（純粋関数）。この先の数日分の「いつ・何を」知らせるかを、今の記録から計算する。
// サーバーは時刻が来たら送るだけ。記録が変わるたびに予定ごと作り直して送り直す。
// アプリを開かない日は記録も増えないので、「このまま何もしなかった場合」の予想がそのまま当たる。
import { addDays, type GameDate } from '../core/date';
import { buildingName } from '../core/defaults';
import { isActive, isScheduledDaily, textOn } from '../core/goals';
import { moodForMorale } from '../core/rules';
import { isCollapseImminent, simulate } from '../core/simulate';
import type { SaveData } from '../core/types';
import { issueWeeklyAssignments } from '../core/weekly';

export interface NotifySettings {
  /** "HH:MM"。null なら送らない */
  morning: string | null;
  evening: string | null;
  deadlines: boolean;
  collapse: boolean;
}

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = { morning: '08:00', evening: '21:00', deadlines: true, collapse: true };

export interface PlannedNotification {
  /** 送る時刻（ISO） */
  at: string;
  title: string;
  body: string;
  tag: string;
}

export const PLAN_DAYS = 7;
const MOOD_LABEL = { happy: '元気', neutral: 'ふつう', sad: 'しょんぼり' } as const;
const MAX_NAMES = 3;
/** 1つの名前・通知の文の長さの上限（サーバーの上限 400 字より短く） */
const NAME_MAX = 20;
export const BODY_MAX = 360;

const clip = (t: string, max: number) => ([...t].length <= max ? t : `${[...t].slice(0, max - 1).join('')}…`);

/**
 * ゲーム日 date の HH:MM（端末の時刻）。1日の区切り時刻より前の時刻（例：区切り4時で 0:30）は、
 * そのゲーム日の終わり＝暦の翌日の早朝にする
 */
export function timeOn(date: GameDate, hhmm: string, dayStartHour: number): Date {
  const [hh, mm] = hhmm.split(':').map(Number);
  const cal = hh! < dayStartHour ? addDays(date, 1) : date;
  const [y, m, d] = cal.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hh!, mm!);
}

const list = (names: string[]) => {
  const shown = names.slice(0, MAX_NAMES).map(n => clip(n, NAME_MAX)).join('、');
  return names.length <= MAX_NAMES ? shown : `${shown} ほか${names.length - MAX_NAMES}件`;
};

export function buildNotificationPlan(save: SaveData, today: GameDate, now: Date, s: NotifySettings): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  for (let i = 0; i < PLAN_DAYS; i++) {
    const date = addDays(today, i);
    // 先の日の分は、その日までに出る毎週の課題も入れて計算する
    const day = issueWeeklyAssignments(save, date);
    const sim = simulate(day, date);
    const morale = Math.round(sim.morale);
    const moraleText = `住民のやる気 ${morale}（${MOOD_LABEL[moodForMorale(sim.morale)]}）`;
    const rest = day.restDays.includes(date);
    const goals = day.goals.filter(g => isActive(g, date));
    const scheduled = rest ? [] : goals.filter(g => isScheduledDaily(g, date));
    const unchecked = scheduled.filter(g => (g.type === 'diary' ? !day.diary[date]?.trim() : !day.checks[date]?.[g.id]));
    const open = day.assignments.filter(a => a.doneOn === null && goals.some(g => g.id === a.goalId));
    const dueToday = open.filter(a => a.due === date).map(a => a.title);
    const dueTomorrow = open.filter(a => a.due === addDays(date, 1)).map(a => a.title);
    const imminent = goals.filter(g => isCollapseImminent(day, sim, g)).map(g => `${buildingName(g)}（${textOn(g, date)?.name ?? ''}）`);

    if (s.morning) {
      const lines = [rest ? `今日は休養日です。${moraleText}` : `今日の目標 ${scheduled.length}個。${moraleText}`];
      if (s.deadlines && dueToday.length) lines.push(`今日締切：${list(dueToday)}`);
      if (s.deadlines && dueTomorrow.length) lines.push(`明日締切：${list(dueTomorrow)}`);
      if (s.collapse && imminent.length) lines.push(`⚠ 倒壊寸前：${list(imminent)}`);
      out.push({ at: timeOn(date, s.morning, save.dayStartHour).toISOString(), title: 'ひびつみ：おはようございます', body: clip(lines.join('\n'), BODY_MAX), tag: `morning-${date}` });
    }

    if (s.evening) {
      const lines: string[] = [];
      if (unchecked.length) lines.push(`まだの目標 ${unchecked.length}個：${list(unchecked.map(g => textOn(g, date)?.name ?? ''))}`);
      if (s.deadlines && dueToday.length) lines.push(`今日締切でまだ：${list(dueToday)}`);
      if (s.deadlines && dueTomorrow.length) lines.push(`明日締切：${list(dueTomorrow)}`);
      if (s.collapse && imminent.length) lines.push(`⚠ 今日できないと倒壊：${list(imminent)}`);
      // 知らせることがない夜は送らない
      if (lines.length) {
        lines.push(moraleText);
        out.push({ at: timeOn(date, s.evening, save.dayStartHour).toISOString(), title: 'ひびつみ：今日のふり返り', body: clip(lines.join('\n'), BODY_MAX), tag: `evening-${date}` });
      }
    }
  }
  return out.filter(n => Date.parse(n.at) > now.getTime());
}
