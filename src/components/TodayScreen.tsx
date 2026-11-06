import { useState } from 'react';
import { acceptsAssignments, validCheckCount, type Action } from '../core/actions';
import { addDays, dateRange, diffDays, weekStart, type GameDate } from '../core/date';
import { BUILDING_LABEL } from '../core/defaults';
import { describeFrequency, frequencyOn, hasMinimum, isActive, isCheckable, isWeeklyOn, textOn } from '../core/goals';
import { COINS, REST_DAYS_PER_WEEK } from '../core/rules';
import { checkOn, isCollapseImminent, type SimResult } from '../core/simulate';
import type { CheckLevel, Goal, SaveData } from '../core/types';
import { formatDate, formatShort } from '../app/format';
import { AssignmentSection } from './AssignmentSection';
import { DiaryEditor } from './DiaryEditor';
import { TodoSection } from './TodoSection';

interface Props {
  save: SaveData;
  sim: SimResult;
  today: GameDate;
  dispatch: (a: Action) => boolean;
  newId: () => string;
  onGoSettings: () => void;
}

export function TodayScreen({ save, sim, today, dispatch, newId, onGoSettings }: Props) {
  const yesterday = addDays(today, -1);
  const isRest = save.restDays.includes(today);
  const hasChecksToday = validCheckCount(save, today) > 0;
  const ws = weekStart(today);
  const restUsed = save.restDays.filter(d => d >= ws && d <= addDays(ws, 6)).length;
  const backupBase = save.lastBackupDate ?? save.startDate;
  const needBackup = diffDays(today, backupBase) >= 7;
  const showYesterday = yesterday >= save.startDate;
  const diaryGoal = save.goals.find(g => g.type === 'diary' && isCheckable(g, today));
  // 課題リストを出す目標：課題型の目標（明日から切り替わるものも）と、未完了の課題が残っている目標
  // （削除した目標は出さない）
  const assignmentGoals = save.goals.filter(
    g => isActive(g, today) && (acceptsAssignments(g, today) || save.assignments.some(a => a.goalId === g.id && a.doneOn === null)),
  );

  return (
    <div className="screen">
      <h1 className="screen-title">{formatDate(today)}</h1>

      {needBackup && (
        <div className="banner">
          {save.lastBackupDate ? `最後のバックアップから${diffDays(today, save.lastBackupDate)}日たちました。` : 'まだバックアップがありません。'}
          <button type="button" className="link" onClick={onGoSettings}>設定でバックアップ</button>
        </div>
      )}

      {isRest ? (
        <>
          <div className="rest-card">
            <p>今日は<strong>休養日</strong>です。達成度によるやる気やさびれは変わりません。ゆっくり休みましょう。</p>
            <p className="hint">ただし、今日が期限の課題は休養日でも期限切れになります（実際の締切は休めないため）。</p>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'cancelRest' })}>休養日を取り消す</button>
          </div>
          {/* 休養日でも日記は書ける（判定はなし） */}
          {diaryGoal && (
            <section className="goal-list">
              <ul><GoalRow save={save} sim={sim} goal={diaryGoal} date={today} dispatch={dispatch} /></ul>
            </section>
          )}
        </>
      ) : (
        <GoalList save={save} sim={sim} date={today} dispatch={dispatch} />
      )}

      {assignmentGoals.map(g => (
        <AssignmentSection key={g.id} save={save} sim={sim} today={today} goal={g} dispatch={dispatch} newId={newId} />
      ))}

      <TodoSection save={save} sim={sim} today={today} dispatch={dispatch} newId={newId} />

      {!isRest && (
        <div className="rest-row">
          <button
            type="button"
            className="btn ghost"
            disabled={hasChecksToday || restUsed >= REST_DAYS_PER_WEEK}
            onClick={() => {
              if (window.confirm('今日を休養日にしますか？（週1回まで。チェックできなくなります）')) dispatch({ type: 'declareRest' });
            }}
          >
            今日を休養日にする
          </button>
          <span className="hint">
            {restUsed >= REST_DAYS_PER_WEEK ? '今週の休養日は使いました' : hasChecksToday ? 'チェックがある日は休養日にできません' : `体調が悪い日などに（週${REST_DAYS_PER_WEEK}回まで）`}
          </span>
        </div>
      )}

      {showYesterday && (
        <details className="yesterday">
          <summary>前日（{formatShort(yesterday)}）の記録を直す</summary>
          <GoalList save={save} sim={sim} date={yesterday} dispatch={dispatch} compact />
        </details>
      )}
    </div>
  );
}

interface ListProps {
  save: SaveData;
  sim: SimResult;
  date: GameDate;
  dispatch: (a: Action) => boolean;
  compact?: boolean;
}

function GoalList({ save, sim, date, dispatch, compact }: ListProps) {
  const rest = new Set(save.restDays);
  const isRestDay = rest.has(date);
  // 休養日は日記だけ表示する
  const goals = save.goals.filter(g => isCheckable(g, date) && (!isRestDay || g.type === 'diary'));
  if (goals.length === 0) return <p className="empty">{isRestDay ? 'この日は休養日でした。' : 'この日に予定している目標はありません。'}</p>;
  const done = goals.filter(g => checkOn(save, rest, g, date) !== null).length;
  return (
    <section className={`goal-list${compact ? ' compact' : ''}`}>
      {!compact && <p className="progress">達成 {done} / {goals.length}</p>}
      {compact && isRestDay && <p className="hint">この日は休養日でした（日記だけ直せます）。</p>}
      <ul>
        {goals.map(g => <GoalRow key={g.id} save={save} sim={sim} goal={g} date={date} dispatch={dispatch} />)}
      </ul>
    </section>
  );
}

function GoalRow({ save, sim, goal, date, dispatch }: { save: SaveData; sim: SimResult; goal: Goal; date: GameDate; dispatch: (a: Action) => boolean }) {
  const text = textOn(goal, date);
  const freq = frequencyOn(goal, date);
  const rest = new Set(save.restDays);
  const level = checkOn(save, rest, goal, date);
  const withMin = hasMinimum(goal, date);
  const [pop, setPop] = useState<{ n: number; key: number } | null>(null);
  if (!text || !freq) return null;

  let weeklyInfo: string | null = null;
  if (isWeeklyOn(goal, date) && freq.kind === 'weekly') {
    const count = dateRange(weekStart(date), date).filter(d => checkOn(save, rest, goal, d) !== null).length;
    weeklyInfo = `今週 ${count}/${freq.times}回`;
  }
  // 倒壊の予告は「今日」の行にだけ出す
  const imminent = date === sim.today && isCollapseImminent(save, sim, goal);

  const set = (next: CheckLevel | null) => {
    if (next === level) return;
    if (dispatch({ type: 'setCheck', date, goalId: goal.id, level: next })) {
      const gain = (next ? COINS[next] : 0) - (level ? COINS[level] : 0);
      if (gain > 0) setPop({ n: gain, key: Date.now() });
    }
  };

  return (
    <li className={`goal-row level-${level ?? 'none'}${goal.type === 'diary' ? ' diary' : ''}`}>
      <div className="goal-info">
        <div className="goal-name">
          {text.name}
          <span className="freq">{weeklyInfo ?? describeFrequency(freq)}</span>
        </div>
        {goal.type === 'diary' ? (
          <div className="goal-lines"><span>一言で最低、{text.idealChars ?? ''}文字以上で理想（自動で判定）</span></div>
        ) : (
          <div className="goal-lines">
            <span>理想：{text.ideal}</span>
            {withMin && <span>最低：{text.minimum}</span>}
          </div>
        )}
        {imminent && (
          <div className="danger-text">⚠ 倒壊寸前：{freq.kind === 'weekly' ? '今週1回もできないと' : '今日できないと'}{BUILDING_LABEL[goal.building]}のレベルが下がります</div>
        )}
      </div>
      {goal.type === 'diary' ? (
        <DiaryEditor save={save} goal={goal} date={date} dispatch={dispatch} />
      ) : (
        <div className="check-group" role="group" aria-label={`${text.name}の達成度`}>
          <button type="button" aria-pressed={level === null} className="seg" onClick={() => set(null)}>まだ</button>
          {withMin && (
            <button type="button" aria-pressed={level === 'min'} className="seg min" onClick={() => set('min')}>最低</button>
          )}
          <button type="button" aria-pressed={level === 'ideal'} className="seg ideal" onClick={() => set('ideal')}>
            {withMin ? '理想' : '達成'}
          </button>
          {pop && (
            <span key={pop.key} className="coin-pop" onAnimationEnd={() => setPop(null)}>+{pop.n}</span>
          )}
        </div>
      )}
    </li>
  );
}
