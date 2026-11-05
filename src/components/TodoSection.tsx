import { useState, type FormEvent } from 'react';
import type { Action } from '../core/actions';
import { addDays, type GameDate } from '../core/date';
import { STALL_TODO_BONUS, TODO_COIN, TODO_DONE_VISIBLE_DAYS, TODO_TITLE_MAX } from '../core/rules';
import type { SimResult } from '../core/simulate';
import type { SaveData, Todo } from '../core/types';
import { formatShort } from '../app/format';

interface Props {
  save: SaveData;
  sim: SimResult;
  today: GameDate;
  dispatch: (a: Action) => boolean;
  newId: () => string;
}

function TodoEditRow({ todo, dispatch, onDone }: { todo: Todo; dispatch: (a: Action) => boolean; onDone: () => void }) {
  const [title, setTitle] = useState(todo.title);
  const [due, setDue] = useState(todo.due ?? '');
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (dispatch({ type: 'editTodo', id: todo.id, title, due: due || null })) onDone();
  };
  return (
    <li className="todo-item editing">
      <form className="todo-form" onSubmit={save}>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={TODO_TITLE_MAX} aria-label="ToDoの内容" autoFocus />
        <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="期限（任意）" />
        <button type="submit" className="btn small primary" disabled={!title.trim()}>保存</button>
        <button type="button" className="btn small" onClick={onDone}>やめる</button>
      </form>
    </li>
  );
}

function sortOpen(a: Todo, b: Todo): number {
  // 期限ありを先に、期限の早い順。期限なしは作った順
  if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
  if (a.due) return -1;
  if (b.due) return 1;
  return a.createdOn < b.createdOn ? -1 : a.createdOn > b.createdOn ? 1 : 0;
}

export function TodoSection({ save, sim, today, dispatch, newId }: Props) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const open = save.todos.filter(t => t.doneOn === null).sort(sortOpen);
  const recentDone = save.todos
    .filter(t => t.doneOn !== null && t.doneOn > addDays(today, -TODO_DONE_VISIBLE_DAYS))
    .sort((a, b) => ((a.doneOn ?? '') < (b.doneOn ?? '') ? 1 : -1));
  const stall = save.facilities.some(f => f.kind === 'stall' && f.date < today);
  const coinPer = TODO_COIN + (stall ? STALL_TODO_BONUS : 0);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (dispatch({ type: 'addTodo', id: newId(), title, due: due || null })) {
      setTitle('');
      setDue('');
    }
  };

  return (
    <section className="todo-section">
      <div className="card-head">
        <h2>ToDo</h2>
        <span className="hint">完了で +{coinPer}コイン（今日あと{sim.todoRewardsLeft}件）</span>
      </div>
      <form className="todo-form" onSubmit={add}>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={TODO_TITLE_MAX} placeholder="例：レポート提出" aria-label="ToDoの内容" />
        <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="期限（任意）" />
        <button type="submit" className="btn small primary" disabled={!title.trim()}>追加</button>
      </form>
      {open.length === 0 && recentDone.length === 0 && <p className="hint">その場限りのやることを書いておきましょう。やる気には影響しません。</p>}
      {open.length > 0 && <p className="hint">内容をタップすると編集できます。</p>}
      <ul className="todo-list">
        {open.map(t => {
          if (editingId === t.id) {
            return <TodoEditRow key={t.id} todo={t} dispatch={dispatch} onDone={() => setEditingId(null)} />;
          }
          const overdue = t.due !== null && t.due < today;
          return (
            <li key={t.id} className="todo-item">
              <button type="button" className="todo-check" aria-label={`${t.title}を完了にする`} onClick={() => dispatch({ type: 'toggleTodo', id: t.id })} />
              <button type="button" className="todo-title as-text" aria-label={`${t.title}を編集`} onClick={() => setEditingId(t.id)}>{t.title}</button>
              {t.due && <span className={`todo-due${overdue ? ' overdue' : t.due === today ? ' today' : ''}`}>{overdue ? '期限切れ ' : t.due === today ? '今日まで ' : ''}{formatShort(t.due)}</span>}
              <button
                type="button"
                className="btn icon small"
                aria-label={`${t.title}を削除`}
                onClick={() => { if (window.confirm(`「${t.title}」を削除しますか？`)) dispatch({ type: 'deleteTodo', id: t.id }); }}
              >
                ×
              </button>
            </li>
          );
        })}
        {recentDone.map(t => (
          <li key={t.id} className="todo-item done">
            <button
              type="button"
              className="todo-check checked"
              aria-label={`${t.title}を未完了に戻す`}
              disabled={t.doneOn !== today}
              onClick={() => dispatch({ type: 'toggleTodo', id: t.id })}
            >
              ✓
            </button>
            <span className="todo-title">{t.title}</span>
            <span className="todo-due">{t.doneOn === today ? '今日完了' : `${formatShort(t.doneOn ?? today)}完了`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
