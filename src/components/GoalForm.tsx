import { useState, type FormEvent } from 'react';
import { WEEKDAY_LABELS, type GameDate } from '../core/date';
import { BUILDING_LABEL } from '../core/defaults';
import { frequencyOn, textOn } from '../core/goals';
import type { BuildingKind, Frequency, Goal, GoalText, GoalType } from '../core/types';
import { LIMITS } from '../core/actions';
import { DIARY_DEFAULT_IDEAL_CHARS, DIARY_MAX_IDEAL_CHARS } from '../core/rules';

export interface GoalFormValue {
  goalType: GoalType;
  building: BuildingKind;
  text: GoalText;
  frequency: Frequency;
}

interface Props {
  /** 編集時は対象の目標。追加時は null */
  goal: Goal | null;
  today: GameDate;
  /** 日記の目標を新しく作れるか（1つまで） */
  canAddDiary: boolean;
  onSubmit: (v: GoalFormValue) => boolean;
  onCancel: () => void;
}

const KINDS = Object.keys(BUILDING_LABEL) as BuildingKind[];

export function GoalForm({ goal, today, canAddDiary, onSubmit, onCancel }: Props) {
  // 編集時は「いちばん新しい予定」（明日・来週の変更を含む）を初期値にする
  const latestText = goal ? goal.text[goal.text.length - 1]?.value ?? textOn(goal, today) : null;
  const latestFreq = goal ? goal.frequency[goal.frequency.length - 1]?.value ?? frequencyOn(goal, today) : null;

  const [goalType, setGoalType] = useState<GoalType>(goal?.type ?? 'check');
  const [idealChars, setIdealChars] = useState(latestText?.idealChars ?? DIARY_DEFAULT_IDEAL_CHARS);
  const [building, setBuilding] = useState<BuildingKind>(goal?.building ?? 'library');
  const [name, setName] = useState(latestText?.name ?? '');
  const [ideal, setIdeal] = useState(latestText?.ideal ?? '');
  const [minimum, setMinimum] = useState(latestText?.minimum ?? '');
  const [kind, setKind] = useState<Frequency['kind']>(latestFreq?.kind ?? 'daily');
  const [days, setDays] = useState<number[]>(latestFreq?.kind === 'weekdays' ? latestFreq.days : [0, 1, 2, 3, 4]);
  const [times, setTimes] = useState(latestFreq?.kind === 'weekly' ? latestFreq.times : 3);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const frequency: Frequency =
      kind === 'daily' || kind === 'assignments' ? { kind } : kind === 'weekdays' ? { kind, days } : { kind, times };
    const text: GoalText = goalType === 'diary'
      ? { name, ideal: '', minimum: null, idealChars }
      : kind === 'assignments'
        // 課題型はチェックしないのでラインは使わない。頻度だけ変えたときに「ラインの変更」扱いにならないよう元の値を残す
        ? { name, ideal: ideal.trim() || '期限内に提出', minimum: minimum.trim() ? minimum : null }
        : { name, ideal, minimum: minimum.trim() ? minimum : null };
    onSubmit({ goalType, building, text, frequency });
  };

  const toggleDay = (d: number) => setDays(ds => (ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d].sort((a, b) => a - b)));
  const isNewToday = goal === null || goal.createdOn === today;
  const isDiary = goalType === 'diary';

  return (
    <form className="goal-form" onSubmit={submit}>
      <h2>{goal ? '目標を編集' : '目標を追加'}</h2>
      {!isNewToday && (
        <p className="hint">変更は<strong>明日から</strong>反映されます（今日の判定を変えないため）。「週に何回」が関わる頻度の変更だけは、週の集計を崩さないよう<strong>来週の月曜から</strong>です。</p>
      )}

      {goal === null && (
        <fieldset className="field">
          <legend>種類</legend>
          <div className="radio-row">
            <label className="radio">
              <input type="radio" name="gtype" checked={!isDiary} onChange={() => setGoalType('check')} />
              ふつうの目標（自分でチェック）
            </label>
            <label className="radio">
              <input
                type="radio"
                name="gtype"
                checked={isDiary}
                disabled={!canAddDiary}
                onChange={() => {
                  setGoalType('diary');
                  setBuilding('kura');
                  if (!name) setName('日記');
                }}
              />
              日記（文字数で自動判定）{!canAddDiary && '※1つまで'}
            </label>
          </div>
        </fieldset>
      )}

      <label className="field">
        <span>目標の名前</span>
        <input value={name} maxLength={LIMITS.name} onChange={e => setName(e.target.value)} placeholder={isDiary ? '例：日記' : '例：英語学習'} required />
      </label>
      {isDiary ? (
        <label className="field">
          <span>「理想」になる文字数（一言でも書けば「最低」）</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={DIARY_MAX_IDEAL_CHARS}
            value={idealChars}
            onChange={e => setIdealChars(Math.trunc(Number(e.target.value)) || 0)}
            required
          />
        </label>
      ) : kind === 'assignments' ? (
        <p className="hint">「課題があるときだけ」の目標は、チェックの代わりに課題リスト（内容・期限）で評価します。期限内に完了でコイン、期限を守れないとやる気が下がります。</p>
      ) : (
        <>
          <label className="field">
            <span>理想ライン</span>
            <input value={ideal} maxLength={LIMITS.line} onChange={e => setIdeal(e.target.value)} placeholder="例：30分" required />
          </label>
          <label className="field">
            <span>最低ライン（なくてもOK）</span>
            <input value={minimum} maxLength={LIMITS.line} onChange={e => setMinimum(e.target.value)} placeholder="例：単語5個" />
          </label>
        </>
      )}

      {isDiary ? (
        <p className="hint">日記は毎日の目標です。</p>
      ) : (
      <fieldset className="field">
        <legend>頻度</legend>
        <div className="radio-row">
          {(['daily', 'weekdays', 'weekly', 'assignments'] as const).map(k => (
            <label key={k} className="radio">
              <input type="radio" name="freq" checked={kind === k} onChange={() => setKind(k)} />
              {k === 'daily' ? '毎日' : k === 'weekdays' ? '曜日を指定' : k === 'weekly' ? '週に何回' : '課題があるときだけ'}
            </label>
          ))}
        </div>
        {kind === 'weekdays' && (
          <div className="day-row">
            {WEEKDAY_LABELS.map((l, d) => (
              <label key={l} className={`day-chip${days.includes(d) ? ' on' : ''}`}>
                <input type="checkbox" checked={days.includes(d)} onChange={() => toggleDay(d)} />
                {l}
              </label>
            ))}
          </div>
        )}
        {kind === 'weekly' && (
          <label className="inline">
            週
            <select value={times} onChange={e => setTimes(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            回（曜日は自由。日曜の終わりに集計）
          </label>
        )}
      </fieldset>
      )}

      <label className="field">
        <span>担当の建物</span>
        <select value={building} onChange={e => setBuilding(e.target.value as BuildingKind)}>
          {KINDS.map(k => <option key={k} value={k}>{BUILDING_LABEL[k]}</option>)}
        </select>
      </label>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>やめる</button>
        <button type="submit" className="btn primary">{goal ? '保存' : '追加'}</button>
      </div>
    </form>
  );
}
