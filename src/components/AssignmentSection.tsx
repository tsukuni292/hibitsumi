// 「課題があるときだけ」の目標の課題リスト（内容・期限）
import { useState, type FormEvent } from 'react';
import type { Action } from '../core/actions';
import { addDays, diffDays, WEEKDAY_LABELS, type GameDate } from '../core/date';
import { BUILDING_LABEL } from '../core/defaults';
import { textOn } from '../core/goals';
import {
  ASSIGNMENT_DAILY_CAP, ASSIGNMENT_EARLY_BONUS, ASSIGNMENT_EARLY_DAYS, ASSIGNMENT_ONTIME_COIN, ASSIGNMENT_OVERDUE_PENALTY,
  ASSIGNMENT_TITLE_MAX, MAX_WEEKLY_ASSIGNMENTS, TODO_DONE_VISIBLE_DAYS,
} from '../core/rules';
import { assignmentReward, isCollapseImminent, isRegisteredBefore, type SimResult } from '../core/simulate';
import type { Assignment, Goal, SaveData, WeeklyAssignment } from '../core/types';
import { weeklyDueOffset } from '../core/weekly';
import { formatShort } from '../app/format';

interface Props {
  save: SaveData;
  sim: SimResult;
  today: GameDate;
  goal: Goal;
  dispatch: (a: Action) => boolean;
  newId: () => string;
}

function dueLabel(a: Assignment, today: GameDate): { text: string; tone: '' | 'today' | 'overdue' } {
  const left = diffDays(a.due, today);
  if (left < 0) return { text: `期限切れ ${formatShort(a.due)}（完了してもコインなし）`, tone: 'overdue' };
  if (left === 0) return { text: `今日まで ${formatShort(a.due)}`, tone: 'today' };
  return { text: `期限 ${formatShort(a.due)}（あと${left}日）`, tone: left === 1 ? 'today' : '' };
}

export function AssignmentSection({ save, sim, today, goal, dispatch, newId }: Props) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const name = textOn(goal, today)?.name ?? textOn(goal, addDays(today, 1))?.name ?? '課題';
  const mine = save.assignments.filter(a => a.goalId === goal.id);
  const open = mine.filter(a => a.doneOn === null).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const recentDone = mine
    .filter(a => a.doneOn !== null && a.doneOn > addDays(today, -TODO_DONE_VISIBLE_DAYS))
    .sort((a, b) => ((a.doneOn ?? '') < (b.doneOn ?? '') ? 1 : -1));
  const imminent = isCollapseImminent(save, sim, goal);
  const yesterday = addDays(today, -1);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (dispatch({ type: 'addAssignment', id: newId(), goalId: goal.id, title, due })) {
      setTitle('');
      setDue('');
    }
  };

  return (
    <section className="todo-section assignment-section">
      <div className="card-head">
        <h2>{name}<span className="freq">課題があるとき</span></h2>
        <span className="hint">今日あと{sim.assignmentRewardsLeft}件コインあり</span>
      </div>
      <p className="hint">
        期限内に完了で +{ASSIGNMENT_ONTIME_COIN}コイン（{ASSIGNMENT_EARLY_DAYS}日以上前なら +{ASSIGNMENT_ONTIME_COIN + ASSIGNMENT_EARLY_BONUS}）。
        期限を守れないと、やる気 −{ASSIGNMENT_OVERDUE_PENALTY}。1日{ASSIGNMENT_DAILY_CAP}件まで。
        登録した当日の完了はコインの対象外なので、課題が出たら早めに登録しておきましょう。
        毎週出る課題は「毎週の課題」に登録しておくと、出る曜日に自動で追加されます。
      </p>
      {imminent && <div className="danger-text">⚠ 倒壊寸前：今日が期限の課題を終えないと{BUILDING_LABEL[goal.building]}のレベルが下がります</div>}
      <form className="todo-form" onSubmit={add}>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={ASSIGNMENT_TITLE_MAX} placeholder="例：統計学 第3回レポート" aria-label="課題の内容" />
        <input type="date" value={due} min={today} onChange={e => setDue(e.target.value)} aria-label="期限" required />
        <button type="submit" className="btn small primary" disabled={!title.trim() || !due}>追加</button>
      </form>
      {open.length === 0 && recentDone.length === 0 && <p className="hint">提出物が出たら、内容と期限を書いておきましょう。</p>}
      <ul className="todo-list">
        {open.map(a => {
          if (editingId === a.id) {
            return <AssignmentEditRow key={a.id} a={a} today={today} dispatch={dispatch} onDone={() => setEditingId(null)} />;
          }
          const label = dueLabel(a, today);
          return (
            <li key={a.id} className={`todo-item${label.tone === 'overdue' ? ' overdue-item' : ''}`}>
              <button type="button" className="todo-check" aria-label={`${a.title}を完了にする`} onClick={() => dispatch({ type: 'toggleAssignment', id: a.id })} />
              <div className="todo-main">
                <button type="button" className="todo-title as-text" aria-label={`${a.title}を編集`} onClick={() => setEditingId(a.id)}>{a.title}</button>
                <span className={`todo-due${label.tone ? ` ${label.tone}` : ''}`}>{a.weeklyId && <span className="weekly-tag">毎週</span>}{label.text}</span>
                {a.due === yesterday && a.createdOn <= yesterday && (
                  <button type="button" className="link small-link" onClick={() => dispatch({ type: 'toggleAssignment', id: a.id, date: yesterday })}>
                    昨日のうちに終えていた（昨日完了にする）
                  </button>
                )}
              </div>
              {a.due > today && (
                <button
                  type="button"
                  className="btn icon small"
                  aria-label={`${a.title}を削除`}
                  onClick={() => { if (window.confirm(`「${a.title}」を削除しますか？`)) dispatch({ type: 'deleteAssignment', id: a.id }); }}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
        {recentDone.map(a => {
          const reward = assignmentReward(a, a.doneOn ?? today);
          return (
            <li key={a.id} className="todo-item done">
              <button
                type="button"
                className="todo-check checked"
                aria-label={`${a.title}を未完了に戻す`}
                disabled={a.doneOn !== today}
                onClick={() => dispatch({ type: 'toggleAssignment', id: a.id })}
              >
                ✓
              </button>
              <div className="todo-main">
                <span className="todo-title">{a.title}</span>
                <span className="todo-due">
                  {a.doneOn === today ? '今日完了' : `${formatShort(a.doneOn ?? today)}完了`}
                  {!isRegisteredBefore(a, a.doneOn ?? today)
                    ? '・登録した当日（コインなし）'
                    : reward > 0 ? (reward > ASSIGNMENT_ONTIME_COIN ? '・早め提出！' : '・期限内') : '・期限後'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <WeeklyList save={save} goal={goal} dispatch={dispatch} newId={newId} />
    </section>
  );
}

const weeklyLabel = (w: WeeklyAssignment) => {
  const days = weeklyDueOffset(w.issueDay, w.dueDay);
  return `毎週${WEEKDAY_LABELS[w.issueDay]}曜に出る → ${days === 7 ? '翌週の' : ''}${WEEKDAY_LABELS[w.dueDay]}曜締切`;
};

/** 毎週の課題：曜日と締切を登録しておくと、出る曜日に課題リストへ自動で追加される */
function WeeklyList({ save, goal, dispatch, newId }: Omit<Props, 'sim' | 'today'>) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [issueDay, setIssueDay] = useState(0);
  const [dueDay, setDueDay] = useState(0);
  const mine = save.weeklyAssignments.filter(w => w.goalId === goal.id);
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (dispatch({ type: 'addWeeklyAssignment', id: newId(), goalId: goal.id, title, issueDay, dueDay })) {
      setTitle('');
      setOpen(false);
    }
  };
  const dayOptions = WEEKDAY_LABELS.map((l, i) => <option key={l} value={i}>{l}曜</option>);
  return (
    <div className="weekly-block">
      <div className="card-head">
        <h3>毎週の課題</h3>
        {!open && mine.length < MAX_WEEKLY_ASSIGNMENTS && (
          <button type="button" className="btn small" onClick={() => setOpen(true)}>＋ 登録</button>
        )}
      </div>
      {open && (
        <form className="todo-form weekly-form" onSubmit={add}>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={ASSIGNMENT_TITLE_MAX} placeholder="例：統計学 毎回のレポート" aria-label="毎週の課題の内容" autoFocus />
          <label>出る曜日 <select value={issueDay} onChange={e => setIssueDay(Number(e.target.value))}>{dayOptions}</select></label>
          <label>締切 <select value={dueDay} onChange={e => setDueDay(Number(e.target.value))}>{dayOptions}</select></label>
          <span className="hint">（出る曜日と同じなら翌週の締切）</span>
          <button type="submit" className="btn small primary" disabled={!title.trim()}>登録</button>
          <button type="button" className="btn small" onClick={() => setOpen(false)}>やめる</button>
        </form>
      )}
      {mine.length === 0 && !open && <p className="hint">授業ごとに毎週出る課題を登録しておくと、出た当日に終えてもコインがもらえます。</p>}
      <ul className="todo-list">
        {mine.map(w => (
          <li key={w.id} className="todo-item">
            <div className="todo-main">
              <span className="todo-title">{w.title}</span>
              <span className="todo-due">{weeklyLabel(w)}</span>
            </div>
            <button
              type="button"
              className="btn icon small"
              aria-label={`毎週の${w.title}をやめる`}
              onClick={() => {
                if (window.confirm(`毎週の「${w.title}」をやめますか？（もう出ている課題は残ります）`)) dispatch({ type: 'deleteWeeklyAssignment', id: w.id });
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {mine.length > 0 && <p className="hint">休講などで出なかった週は、その週の課題を×で消してください（締切当日より前なら消せます）。</p>}
    </div>
  );
}

function AssignmentEditRow({ a, today, dispatch, onDone }: { a: Assignment; today: GameDate; dispatch: (x: Action) => boolean; onDone: () => void }) {
  const [title, setTitle] = useState(a.title);
  const [due, setDue] = useState(a.due);
  // 期限当日・期限を過ぎた課題は、期限を変えられない
  const overdue = a.due <= today;
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (dispatch({ type: 'editAssignment', id: a.id, title, due })) onDone();
  };
  return (
    <li className="todo-item editing">
      <form className="todo-form" onSubmit={save}>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={ASSIGNMENT_TITLE_MAX} aria-label="課題の内容" autoFocus />
        <input type="date" value={due} min={today} disabled={overdue} onChange={e => setDue(e.target.value)} aria-label="期限" />
        <button type="submit" className="btn small primary" disabled={!title.trim()}>保存</button>
        <button type="button" className="btn small" onClick={onDone}>やめる</button>
      </form>
      {overdue && <p className="hint">期限当日・期限を過ぎた課題は、期限を変更できません。</p>}
    </li>
  );
}
