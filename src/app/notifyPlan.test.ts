// 通知の予定づくりのテスト
import { describe, expect, it } from 'vitest';
import { day, goal, save } from '../core/testUtils';
import type { Assignment } from '../core/types';
import { buildNotificationPlan, DEFAULT_NOTIFY_SETTINGS, PLAN_DAYS } from './notifyPlan';

const daily = { kind: 'daily' } as const;
const asg = { kind: 'assignments' } as const;
// day(0) = 2026-11-02（月）の朝7時
const now = new Date(2026, 10, 2, 7, 0);
const task = (id: string, due: number): Assignment => ({ id, goalId: 's', title: id, due: day(due), createdOn: day(0), doneOn: null });

describe('通知の予定', () => {
  it('朝と夜を1週間分。朝は今日の目標数とやる気、夜はまだの目標', () => {
    const plan = buildNotificationPlan(save([goal('英語', daily)]), day(0), now, DEFAULT_NOTIFY_SETTINGS);
    expect(plan).toHaveLength(PLAN_DAYS * 2);
    expect(plan[0]).toMatchObject({ at: new Date(2026, 10, 2, 8, 0).toISOString(), tag: `morning-${day(0)}` });
    expect(plan[0]?.body).toMatch(/今日の目標 1個。住民のやる気 \d+（/);
    expect(plan[1]?.body).toContain('まだの目標 1個：英語');
  });

  it('過ぎた時刻は入れない。全部チェック済みで知らせることがない夜は送らない', () => {
    const s = save([goal('英語', daily)], { checks: { [day(0)]: { 英語: 'ideal' } } });
    const plan = buildNotificationPlan(s, day(0), new Date(2026, 10, 2, 9, 0), DEFAULT_NOTIFY_SETTINGS);
    expect(plan.some(n => n.tag === `morning-${day(0)}`)).toBe(false);
    expect(plan.some(n => n.tag === `evening-${day(0)}`)).toBe(false);
    expect(plan.some(n => n.tag === `evening-${day(1)}`)).toBe(true);
  });

  it('課題の締切は前日と当日に名前つきで知らせる。オフなら出さない', () => {
    const s = save([goal('s', asg)], { assignments: [task('統計レポート', 1)] });
    const plan = buildNotificationPlan(s, day(0), now, DEFAULT_NOTIFY_SETTINGS);
    expect(plan.find(n => n.tag === `evening-${day(0)}`)?.body).toContain('明日締切：統計レポート');
    expect(plan.find(n => n.tag === `morning-${day(1)}`)?.body).toContain('今日締切：統計レポート');
    const off = buildNotificationPlan(s, day(0), now, { ...DEFAULT_NOTIFY_SETTINGS, deadlines: false });
    expect(off.some(n => n.body.includes('統計レポート'))).toBe(false);
  });

  it('朝・夜をオフにすると、その分は作らない', () => {
    const plan = buildNotificationPlan(save([goal('英語', daily)]), day(0), now, { ...DEFAULT_NOTIFY_SETTINGS, morning: null, evening: '22:30' });
    expect(plan.every(n => n.tag.startsWith('evening-'))).toBe(true);
    expect(new Date(plan[0]!.at).getHours()).toBe(22);
  });
});
