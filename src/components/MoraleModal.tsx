// やる気の詳細と解説（ヘッダーのやる気をタップして開く）
import { useMemo } from 'react';
import { addDays, type GameDate } from '../core/date';
import * as R from '../core/rules';
import { simulate, type DayKind, type SimResult } from '../core/simulate';
import type { SaveData } from '../core/types';
import { formatShort, signed } from '../app/format';
import { SpriteImg } from './SpriteImg';

interface Props {
  save: SaveData;
  sim: SimResult;
  today: GameDate;
  onClose: () => void;
}

const MOOD_LABEL = { happy: '元気', neutral: 'ふつう', sad: 'しょんぼり' } as const;
const KIND_LABEL: Record<DayKind, string> = { normal: '', rest: '休養日', none: '予定なし', absent: 'おやすみ中' };

export function MoraleModal({ save, sim, today, onClose }: Props) {
  // 「今の記録のまま今日を終えたら」を、明日を今日として計算し直して求める
  const projection = useMemo(() => {
    const next = simulate(save, addDays(today, 1));
    const todayResult = next.days[next.days.length - 1];
    return { morale: next.morale, day: todayResult && todayResult.date === today ? todayResult : null };
  }, [save, today]);

  const morale = Math.round(sim.morale);
  const mood = R.moodForMorale(sim.morale);
  const diff = projection.morale - sim.morale;
  const recent = sim.days.slice(-7).reverse();
  const day = projection.day;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="morale-title" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="panel-head">
          <h2 id="morale-title">住民のやる気</h2>
          <button type="button" className="btn icon" aria-label="閉じる" onClick={onClose}>×</button>
        </div>

        <div className="summary-hero">
          <SpriteImg name={`res_${mood}_0`} scale={4} label={`住民の気分：${MOOD_LABEL[mood]}`} />
          <div>
            <p className="big-number">{morale}<span className="sub"> / 100</span></p>
            <p>住民の気分：<strong>{MOOD_LABEL[mood]}</strong></p>
          </div>
        </div>

        <div className="summary-section">
          <h3>このまま今日を終えると</h3>
          <p>
            明日のやる気は <strong>{Math.round(projection.morale)}</strong>（{signed(diff)}）
            {day?.score !== null && day?.score !== undefined && <>　今日の達成度 {Math.round(day.score * 100)}%</>}
          </p>
          {day && day.kind !== 'normal' && <p className="hint">今日は「{KIND_LABEL[day.kind]}」なので、達成度によるやる気の増減はありません。</p>}
          {day && day.weekly.length > 0 && <p className="hint">今日は日曜なので、週の目標の集計も入っています。</p>}
          {day && day.overdue.length > 0 && <p className="hint warn">今日が期限の課題が {day.overdue.length}件 残っています（1件ごとに −{R.ASSIGNMENT_OVERDUE_PENALTY}）。</p>}
          {day?.kind === 'normal' && day.score !== null && day.score < 1 && (
            <p className="hint">あと1つでも達成すると、やる気の増え方が良くなります。最低ラインでも効果があります。</p>
          )}
        </div>

        {recent.length > 0 && (
          <div className="summary-section">
            <h3>最近のやる気</h3>
            <ul className="morale-history">
              {recent.map(d => (
                <li key={d.date}>
                  <span>{formatShort(d.date)}</span>
                  <span className="hint">{d.score !== null ? `達成 ${Math.round(d.score * 100)}%` : KIND_LABEL[d.kind]}</span>
                  <span>{Math.round(d.moraleAfter)}</span>
                  <span className={d.moraleAfter - d.moraleBefore >= 0 ? 'good-text' : 'warn'}>{signed(d.moraleAfter - d.moraleBefore)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="summary-section">
          <h3>やる気が増えたり減ったりするしくみ</h3>
          <p className="hint">1日の終わり（区切り時刻）に、その日の達成度で決まります。理想は1、最低は0.5として、予定の目標の平均をとります。</p>
          <table className="rule-table">
            <thead><tr><th>達成度</th>{R.MORALE_TABLE.map(([s]) => <th key={s}>{Math.round(s * 100)}%</th>)}</tr></thead>
            <tbody><tr><td>やる気</td>{R.MORALE_TABLE.map(([s, d]) => <td key={s}>{signed(d)}</td>)}</tr></tbody>
          </table>
          <ul className="rule-list">
            <li>やる気が{R.MORALE_SOFT_CAP}を超えると、上がる量は半分になります。</li>
            <li>やる気が{R.RECOVERY_THRESHOLD}未満の日に100%達成すると、復興ボーナス +{R.RECOVERY_BONUS}。</li>
            <li>週N回の目標は、日曜の終わりに集計します（達成率に応じて {signed(-0.5 * R.WEEKLY_FACTOR)}〜{signed(0.5 * R.WEEKLY_FACTOR)}）。</li>
            <li>課題の期限を守れないと、1件ごとに必ず −{R.ASSIGNMENT_OVERDUE_PENALTY}（休養日でも）。</li>
            <li>休養日と、予定の目標がない日は、達成度による増減なし。長く休んだときは、罰は{R.ABSENCE_CAP_DAYS}日分で止まります。</li>
            <li>銭湯があると、達成度で下がる日の下がり幅が25%小さくなります（課題の期限切れは対象外）。</li>
            <li>日記は目標の1つとして達成度に入ります。ToDoはコインだけで、やる気には関係しません。</li>
          </ul>
        </div>

        <div className="summary-section">
          <h3>やる気が影響するもの</h3>
          <ul className="rule-list">
            <li>住民の表情：60以上で元気、30〜59でふつう、30未満でしょんぼり（住民ごとに少しずつ違います）。</li>
            <li>大きな施設（銭湯・神社）は、建てるときにやる気を使います。使ったあとも{R.MORALE_SPEND_FLOOR}以上残るときだけ建てられます。</li>
          </ul>
        </div>

        <button type="button" className="btn primary block" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
