import { useRef, useState } from 'react';
import type { Action } from '../core/actions';
import { addDays, type GameDate } from '../core/date';
import { buildingName } from '../core/defaults';
import { describeFrequency, frequencyOn, isActive, textOn } from '../core/goals';
import { MAX_DAY_START_HOUR, MAX_GOALS } from '../core/rules';
import type { Goal, SaveData } from '../core/types';
import { ConflictError, exportJson, importJson } from '../storage/db';
import type { Game } from '../app/useGame';
import { formatShort } from '../app/format';
import { APP_VERSION, BUILD_TIME, reinstallLatest } from '../app/update';
import { GoalForm, type GoalFormValue } from './GoalForm';

interface Props {
  game: Game;
  save: SaveData;
  today: GameDate;
}

export function SettingsScreen({ game, save, today }: Props) {
  const { dispatch } = game;
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = save.goals.filter(g => g.archivedFrom === null || g.archivedFrom > today);
  const archived = save.goals.filter(g => g.archivedFrom !== null && g.archivedFrom <= today);

  const submit = (v: GoalFormValue): boolean => {
    const { goalType, ...rest } = v;
    const action: Action =
      editing === 'new'
        ? { type: 'addGoal', id: game.newId(), goalType, ...rest }
        : { type: 'editGoal', goalId: (editing as Goal).id, ...rest };
    const ok = dispatch(action);
    if (ok) setEditing(null);
    return ok;
  };

  const doExport = () => {
    const blob = new Blob([exportJson(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hibitsumi-backup-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    dispatch({ type: 'markBackup' });
  };

  const doImport = async (file: File) => {
    const r = importJson(await file.text());
    if (!r.ok) {
      game.notify(`読み込めませんでした：${r.error}`, 'error');
      return;
    }
    const msg = `バックアップ（開始日 ${r.save.startDate}、目標 ${r.save.goals.length}個）で、今のデータを置き換えます。よろしいですか？\n（今のデータは端末内に1つだけ控えを残します）`;
    if (!window.confirm(msg)) return;
    try {
      await game.importSave(r.save);
      game.notify('バックアップを読み込みました');
    } catch (e) {
      console.error(e);
      game.notify(e instanceof ConflictError ? '別のタブで更新されたため中止しました。もう一度お試しください' : '読み込みに失敗しました', 'error');
    }
  };

  if (editing) {
    return (
      <div className="screen">
        <GoalForm
          goal={editing === 'new' ? null : editing}
          today={today}
          canAddDiary={!active.some(g => g.type === 'diary')}
          onSubmit={submit}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="screen">
      <h1 className="screen-title">設定</h1>

      <section className="card">
        <div className="card-head">
          <h2>目標（{active.length} / {MAX_GOALS}）</h2>
          <button type="button" className="btn primary small" disabled={active.length >= MAX_GOALS} onClick={() => setEditing('new')}>＋ 追加</button>
        </div>
        <ul className="settings-goals">
          {active.map(g => <GoalItem key={g.id} goal={g} today={today} onEdit={() => setEditing(g)} dispatch={dispatch} />)}
        </ul>
        {archived.length > 0 && (
          <details>
            <summary>削除した目標（{archived.length}）</summary>
            <ul className="settings-goals muted">
              {archived.map(g => {
                const name = g.text[g.text.length - 1]?.value.name;
                const from = g.archivedFrom ?? today;
                // archivedFrom は「対象外になった最初の日」なので、最後に有効だったのはその前日
                const label = from <= g.createdOn ? '作成した日に削除' : `${formatShort(g.createdOn)}〜${formatShort(addDays(from, -1))}`;
                return <li key={g.id}>{name}（{label}）</li>;
              })}
            </ul>
          </details>
        )}
      </section>

      <section className="card">
        <h2>1日の区切り</h2>
        <label className="inline">
          朝
          <select value={save.dayStartHour} onChange={e => dispatch({ type: 'setDayStartHour', hour: Number(e.target.value) })}>
            {Array.from({ length: MAX_DAY_START_HOUR + 1 }, (_, h) => <option key={h} value={h}>{h}</option>)}
          </select>
          時に次の日になる
        </label>
        <p className="hint">深夜に作業する日が多いなら、遅めにしておくと安心です。</p>
      </section>

      <section className="card">
        <h2>バックアップ</h2>
        <p className="hint">データはこの端末の中だけに保存されています。ブラウザのデータを消すと失われるので、ときどき書き出してください。{save.lastBackupDate ? `（前回：${formatShort(save.lastBackupDate)}）` : ''}</p>
        <p className="hint">⚠ 書き出したファイルには<strong>日記の本文もそのまま</strong>入ります。人に送ったり、共有フォルダに置いたりしないよう注意してください。</p>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={doExport}>書き出す（JSON）</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>読み込む</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void doImport(f);
            }}
          />
        </div>
      </section>

      <div className="about">
        <p className="app-title">ひびつみ</p>
        <p className="hint">日々を積んで、まちを育てる</p>
        <p className="hint">開始日 {save.startDate}　・　データ形式 v{save.schemaVersion}</p>
        <p className="hint">バージョン {APP_VERSION}（{new Date(BUILD_TIME).toLocaleString('ja-JP')} 公開）</p>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            if (window.confirm('この端末に保存してあるアプリ本体を入れ直して、最新版を読み込みます。\n記録は消えません。')) void reinstallLatest();
          }}
        >
          最新版に入れ直す
        </button>
        <p className="hint">新しい機能が出てこないときに押してください（記録はそのまま残ります）。</p>
      </div>
    </div>
  );
}

function GoalItem({ goal, today, onEdit, dispatch }: { goal: Goal; today: GameDate; onEdit: () => void; dispatch: (a: Action) => boolean }) {
  const text = textOn(goal, today);
  const freq = frequencyOn(goal, today);
  const tomorrow = addDays(today, 1);
  const pendingText = goal.text.find(t => t.from > today);
  const pendingFreq = goal.frequency.find(f => f.from > today);
  const leaving = goal.archivedFrom !== null && goal.archivedFrom > today;
  if (!text || !freq) return null;

  return (
    <li className="settings-goal">
      <div>
        <div className="goal-name">{text.name}<span className="freq">{describeFrequency(freq)}・{buildingName(goal)}</span></div>
        <div className="goal-lines">
          <span>理想：{text.ideal}</span>
          {text.minimum && <span>最低：{text.minimum}</span>}
        </div>
        {pendingText && <div className="pending">明日から：{pendingText.value.name}／{pendingText.value.ideal}{pendingText.value.minimum ? `／${pendingText.value.minimum}` : ''}</div>}
        {pendingFreq && <div className="pending">{formatShort(pendingFreq.from)}から：{describeFrequency(pendingFreq.value)}</div>}
        {leaving && <div className="pending">{formatShort(tomorrow)}から対象外</div>}
      </div>
      {isActive(goal, tomorrow) && (
        <div className="item-actions">
          <button type="button" className="btn small" onClick={onEdit}>編集</button>
          <button
            type="button"
            className="btn small danger"
            onClick={() => {
              if (window.confirm(`「${text.name}」を削除しますか？\n記録と建物のレベルは残ります。`)) dispatch({ type: 'archiveGoal', goalId: goal.id });
            }}
          >
            削除
          </button>
        </div>
      )}
    </li>
  );
}
