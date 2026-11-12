import { buildingName } from '../core/defaults';
import { textOn } from '../core/goals';
import { ASSIGNMENT_OVERDUE_PENALTY, moodForMorale } from '../core/rules';
import type { PeriodSummary } from '../core/simulate';
import type { SaveData } from '../core/types';
import { formatDate, formatShort, signed } from '../app/format';
import { SpriteImg } from './SpriteImg';

interface Props {
  summary: PeriodSummary;
  save: SaveData;
  /** 次の未達で倒壊する建物（目標ID） */
  imminent: string[];
  onClose: () => void;
}

export function SummaryModal({ summary, save, imminent, onClose }: Props) {
  const diff = summary.moraleAfter - summary.moraleBefore;
  const mood = moodForMorale(summary.moraleAfter);
  const nameOf = (id: string) => {
    const g = save.goals.find(x => x.id === id);
    if (!g) return '（不明）';
    return `${buildingName(g)}（${textOn(g, summary.to)?.name ?? ''}）`;
  };
  const single = summary.dayCount === 1;
  const last = summary.lastDay;
  const message =
    diff > 0 ? '住民たちのやる気が上がりました！' : diff < 0 ? '住民たちが少ししょんぼりしています…' : '街は落ち着いています。';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="summary-title">
      <div className="modal">
        <h2 id="summary-title">{single ? `${formatDate(summary.to)}の結果` : `${formatShort(summary.from)}〜${formatShort(summary.to)}（${summary.dayCount}日分）の結果`}</h2>
        <div className="summary-hero">
          <SpriteImg name={`res_${mood}_0`} scale={4} label="住民" />
          <p>{message}</p>
        </div>
        <dl className="summary-list">
          <dt>やる気</dt>
          <dd>{Math.round(summary.moraleBefore)} → <strong>{Math.round(summary.moraleAfter)}</strong>（{signed(diff)}）</dd>
          <dt>獲得コイン</dt>
          <dd>{summary.coinsEarned}</dd>
          {single && last.kind === 'normal' && last.score !== null && (
            <>
              <dt>達成度</dt>
              <dd>{Math.round(last.score * 100)}%</dd>
            </>
          )}
          {single && last.kind === 'rest' && (
            <>
              <dt>休養日</dt>
              <dd>しっかり休めましたか？</dd>
            </>
          )}
        </dl>
        {summary.weekly.length > 0 && (
          <div className="summary-section">
            <h3>週の目標の集計</h3>
            <ul>
              {summary.weekly.map((w, i) => (
                <li key={`${w.goalId}-${i}`}>{nameOf(w.goalId)}：{w.count}/{w.times}回（やる気 {signed(w.delta)}）</li>
              ))}
            </ul>
          </div>
        )}
        {summary.overdue.length > 0 && (
          <div className="summary-section warn">
            <h3>期限を守れなかった課題</h3>
            <ul>
              {summary.overdue.map(id => {
                const a = save.assignments.find(x => x.id === id);
                return <li key={id}>{a ? `${a.title}（期限 ${formatShort(a.due)}）` : '（削除された課題）'}</li>;
              })}
            </ul>
            <p className="hint">1件ごとにやる気 −{ASSIGNMENT_OVERDUE_PENALTY}。次の課題は早めに片づけましょう。</p>
          </div>
        )}
        {summary.collapsed.length > 0 && (
          <div className="summary-section warn">
            <h3>倒壊してしまった建物</h3>
            <ul>{summary.collapsed.map(id => <li key={id}>{nameOf(id)}</li>)}</ul>
            <p className="hint">レベルが1つ下がりました。がれきになった建物は、担当の目標を達成すれば再建できます。</p>
          </div>
        )}
        {summary.protected.length > 0 && (
          <div className="summary-section good">
            <h3>神社のお守りが守ってくれた建物</h3>
            <ul>{summary.protected.map(id => <li key={id}>{nameOf(id)}</li>)}</ul>
          </div>
        )}
        {imminent.length > 0 && (
          <div className="summary-section warn">
            <h3>⚠ 倒壊寸前の建物</h3>
            <ul>{imminent.map(id => <li key={id}>{nameOf(id)}</li>)}</ul>
            <p className="hint">次に未達だとレベルが下がります。今日達成すれば防げます。</p>
          </div>
        )}
        {summary.newlyFaded.length > 0 && (
          <div className="summary-section warn">
            <h3>さびれてしまった建物</h3>
            <ul>{summary.newlyFaded.map(id => <li key={id}>{nameOf(id)}</li>)}</ul>
            <p className="hint">担当の目標を1回達成すると元に戻ります。</p>
          </div>
        )}
        {summary.recovered.length > 0 && (
          <div className="summary-section good">
            <h3>元に戻った建物</h3>
            <ul>{summary.recovered.map(id => <li key={id}>{nameOf(id)}</li>)}</ul>
          </div>
        )}
        <button type="button" className="btn primary block" onClick={onClose} autoFocus>今日もがんばる</button>
      </div>
    </div>
  );
}
