import { moodForMorale, STAGE_LABEL, type Stage } from '../core/rules';
import type { SimResult } from '../core/simulate';
import { SpriteImg } from './SpriteImg';

interface Props {
  sim: SimResult;
  stage: Stage;
  onMoraleClick: () => void;
}

const MOOD_LABEL = { happy: '元気', neutral: 'ふつう', sad: 'しょんぼり' } as const;

export function Header({ sim, stage, onMoraleClick }: Props) {
  const morale = Math.round(sim.morale);
  const mood = moodForMorale(sim.morale);
  return (
    <header className="app-header">
      <div className="header-top">
        <div className="town-name">
          <span className="stage-badge">{STAGE_LABEL[stage]}</span>
          <span>あなたの{STAGE_LABEL[stage]}</span>
        </div>
        <div className="header-stats">
          <span className={`coins${sim.coins < 0 ? ' negative' : ''}`} title="コイン">
            <span className="coin-icon" aria-hidden="true" />
            {sim.coins}
          </span>
          <span className="streak" title="連続でチェックした日数">連続 {sim.streak}日</span>
        </div>
      </div>
      <button type="button" className="morale-row" onClick={onMoraleClick} aria-label={`住民のやる気 ${morale}（${MOOD_LABEL[mood]}）。タップでくわしく見る`}>
        <SpriteImg name={`res_${mood}_0`} scale={2} />
        <div className="morale-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={morale} aria-label="住民のやる気">
          <div className={`morale-fill mood-${mood}`} style={{ width: `${morale}%` }} />
        </div>
        <span className="morale-value">やる気 {morale}<span className="morale-more" aria-hidden="true">ⓘ</span></span>
      </button>
    </header>
  );
}
