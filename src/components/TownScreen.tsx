import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action } from '../core/actions';
import { toDayNumber, type GameDate } from '../core/date';
import { BUILDING_LABEL } from '../core/defaults';
import { isActive, textOn } from '../core/goals';
import {
  FACILITIES, FACILITY_ORDER, MAX_LEVEL, MORALE_SPEND_FLOOR, moodForMorale, tierForLevel, upgradeCost, type Stage,
} from '../core/rules';
import { inRangeFacilities, isCollapseImminent, isFadedNow, type SimResult } from '../core/simulate';
import type { FacilityKind, FacilityPurchase, SaveData } from '../core/types';
import { formatShort } from '../app/format';
import { formatSource, quoteFor } from '../core/quotes';
import { residentCount, residentLine } from '../render/residents';
import { spriteSize } from '../render/spriteCache';
import { HOUSES_BY_STAGE, layoutTown } from '../render/townLayout';
import { SpriteImg } from './SpriteImg';
import { TownCanvas } from './TownCanvas';

interface Props {
  save: SaveData;
  sim: SimResult;
  today: GameDate;
  stage: Stage;
  dispatch: (a: Action) => boolean;
  newId: () => string;
}

const ZOOMS = [2, 3, 4] as const;
const TIER_LABEL = { village: '村', town: '町', city: '都市' } as const;

const CHARM_LABEL = { none: '', tomorrow: '明日から', ready: '使えます', recharging: 'おやすみ中' } as const;

export function TownScreen({ save, sim, today, stage, dispatch, newId }: Props) {
  const [zoomIdx, setZoomIdx] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  // 住民をタップした回数（タップのたびに次の名言）
  const [quoteCount, setQuoteCount] = useState<number | null>(null);
  const zoom = ZOOMS[zoomIdx] ?? 3;

  const activeGoals = useMemo(() => save.goals.filter(g => isActive(g, today)), [save.goals, today]);
  const facilities = useMemo(() => inRangeFacilities(save, today), [save, today]);
  // 住民が増えるのも効果の一つなので、建てた翌日から
  const facilityResidents = facilities.filter(f => f.date < today).length;
  const layout = useMemo(
    () =>
      layoutTown(
        activeGoals.map(g => ({
          goalId: g.id,
          kind: g.building,
          level: sim.buildings[g.id]?.level ?? 1,
          faded: isFadedNow(save, sim, g),
        })),
        stage,
        spriteSize,
        facilities.map(f => ({ id: f.id, kind: f.kind })),
      ),
    [activeGoals, sim, save, stage, facilities],
  );

  const mood = moodForMorale(sim.morale);
  const line = residentLine(mood, toDayNumber(today));
  const quote = quoteCount === null ? null : quoteFor(toDayNumber(today), quoteCount);
  const selGoal = selected?.startsWith('goal:') ? activeGoals.find(g => `goal:${g.id}` === selected) ?? null : null;
  const selFacility = selected?.startsWith('fac:') ? facilities.find(f => `fac:${f.id}` === selected) ?? null : null;

  return (
    <div className="screen town-screen">
      <div className="town-view">
        <TownCanvas
          layout={layout}
          morale={sim.morale}
          residents={residentCount(HOUSES_BY_STAGE[stage]) + facilityResidents}
          selectedKey={selGoal || selFacility ? selected : null}
          onSelect={key => {
            setSelected(key);
            if (key) setShopOpen(false);
          }}
          zoom={zoom}
          onResidentTap={() => setQuoteCount(c => (c === null ? 0 : c + 1))}
        />
        <div className="zoom-buttons">
          <button type="button" className="btn icon" aria-label="縮小" disabled={zoomIdx === 0} onClick={() => setZoomIdx(i => Math.max(0, i - 1))}>－</button>
          <button type="button" className="btn icon" aria-label="拡大" disabled={zoomIdx === ZOOMS.length - 1} onClick={() => setZoomIdx(i => Math.min(ZOOMS.length - 1, i + 1))}>＋</button>
        </div>
      </div>

      {quote ? (
        <div className="speech quote" aria-live="polite">
          <p className="quote-text">「{quote.text}」</p>
          <p className="quote-meaning">{quote.meaning}</p>
          <p className="quote-source">— {formatSource(quote)}</p>
          {quote.note && (
            <details className="quote-note">
              <summary>原文・補足</summary>
              <p>{quote.note}</p>
            </details>
          )}
          <p className="hint">ほかの住民をタップすると、別の言葉を教えてくれます。</p>
        </div>
      ) : (
        <p className="speech">住民「{line}」<span className="hint">　住民をタップすると、名言を教えてくれます。</span></p>
      )}

      <div className="btn-row">
        <button type="button" className={`btn${shopOpen ? ' primary' : ''}`} onClick={() => { setShopOpen(o => !o); setSelected(null); }}>
          住民のための施設を建てる
        </button>
        {sim.charmState !== 'none' && <span className="hint">お守り：{CHARM_LABEL[sim.charmState]}</span>}
      </div>

      {shopOpen && <FacilityShop sim={sim} dispatch={dispatch} newId={newId} />}

      {selGoal && (
        <BuildingPanel save={save} sim={sim} today={today} goalId={selGoal.id} dispatch={dispatch} onClose={() => setSelected(null)} />
      )}
      {selFacility && <FacilityPanel facility={selFacility} today={today} onClose={() => setSelected(null)} />}
      {!selGoal && !selFacility && !shopOpen && (
        <p className="hint center">建物をタップすると、くわしい情報と建て替えができます。ドラッグで街を動かせます。</p>
      )}
    </div>
  );
}

function usePanelScroll(dep: unknown) {
  const ref = useRef<HTMLElement>(null);
  // スマホでは街の下に隠れがちなので、選んだら見える位置までスクロールする
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [dep]);
  return ref;
}

function BuildingPanel({ save, sim, today, goalId, dispatch, onClose }: {
  save: SaveData; sim: SimResult; today: GameDate; goalId: string; dispatch: (a: Action) => boolean; onClose: () => void;
}) {
  const panelRef = usePanelScroll(goalId);
  const goal = save.goals.find(g => g.id === goalId);
  const st = sim.buildings[goalId];
  if (!goal || !st) return null;
  const text = textOn(goal, today);
  const faded = isFadedNow(save, sim, goal);
  const imminent = isCollapseImminent(save, sim, goal);
  const rubble = st.level === 0;
  const cost = upgradeCost(st.level);
  const nextTier = st.level < MAX_LEVEL ? tierForLevel(st.level + 1) : null;
  const tierChange = !rubble && nextTier && nextTier !== tierForLevel(st.level);

  return (
    <section className="building-panel" ref={panelRef}>
      <div className="panel-head">
        <h2>{BUILDING_LABEL[goal.building]}<span className="sub">（{text?.name ?? ''}）</span></h2>
        <button type="button" className="btn icon" aria-label="閉じる" onClick={onClose}>×</button>
      </div>
      {rubble ? (
        <p className="warn">倒壊して<strong>がれき</strong>になっています。「{text?.name}」を1回達成すると、再建できるようになります。</p>
      ) : (
        <p>レベル {st.level} / {MAX_LEVEL}　見た目：{TIER_LABEL[tierForLevel(st.level)]}の建物</p>
      )}
      {faded && !rubble && (
        <p className="warn">さびれています（{st.misses}回連続で未達）。「{text?.name}」を1回達成すると元に戻ります。</p>
      )}
      {imminent && (
        <p className="danger-box">⚠ 倒壊寸前です。次に未達だとレベルが1つ下がります{sim.charmReady ? '（神社のお守りが1回だけ守ってくれます）' : ''}。</p>
      )}
      {cost === null ? (
        <p>最大レベルです！</p>
      ) : (
        <button
          type="button"
          className="btn primary"
          disabled={faded || sim.coins < cost}
          onClick={() => dispatch({ type: 'upgrade', goalId })}
        >
          {rubble ? `再建する（コイン ${cost}）` : `建て替える（コイン ${cost}）${tierChange ? `→ ${TIER_LABEL[nextTier]}の姿に！` : ''}`}
        </button>
      )}
      {cost !== null && !faded && sim.coins < cost && <p className="hint">あと {cost - sim.coins} コイン</p>}
    </section>
  );
}

function FacilityPanel({ facility, today, onClose }: { facility: FacilityPurchase; today: GameDate; onClose: () => void }) {
  const panelRef = usePanelScroll(facility.id);
  const def = FACILITIES[facility.kind];
  return (
    <section className="building-panel" ref={panelRef}>
      <div className="panel-head">
        <h2>{def.label}</h2>
        <button type="button" className="btn icon" aria-label="閉じる" onClick={onClose}>×</button>
      </div>
      <p>{def.effect}</p>
      <p className="hint">{formatShort(facility.date)} に建設{facility.date === today ? '（効果は明日から）' : ''}</p>
    </section>
  );
}

function FacilityShop({ sim, dispatch, newId }: { sim: SimResult; dispatch: (a: Action) => boolean; newId: () => string }) {
  const panelRef = usePanelScroll('shop');
  const buy = (kind: FacilityKind) => {
    const def = FACILITIES[kind];
    const moraleText = def.morale > 0 ? `とやる気 ${def.morale}` : '';
    if (window.confirm(`${def.label}を建てますか？（コイン ${def.coins}${moraleText}）`)) dispatch({ type: 'buyFacility', id: newId(), kind });
  };
  return (
    <section className="building-panel" ref={panelRef}>
      <h2>住民のための施設</h2>
      <p className="hint">効果は建てた翌日から。施設1つにつき住民が1人増えます。やる気を使う施設は、使ったあとも{MORALE_SPEND_FLOOR}以上残るときだけ建てられます。</p>
      <ul className="shop-list">
        {FACILITY_ORDER.map(kind => {
          const def = FACILITIES[kind];
          const owned = sim.facilities[kind];
          const full = owned >= def.max;
          const noCoins = sim.coins < def.coins;
          const tired = def.morale > 0 && sim.morale - def.morale < MORALE_SPEND_FLOOR;
          const reason = full ? '上限です' : noCoins ? `あと${def.coins - sim.coins}コイン` : tired ? 'やる気が足りません' : null;
          return (
            <li key={kind} className="shop-item">
              <SpriteImg name={`fac_${kind}`} scale={2} />
              <div className="shop-info">
                <div className="goal-name">{def.label}<span className="freq">{owned}/{def.max}</span></div>
                <div className="goal-lines"><span>{def.effect}</span></div>
                <div className="goal-lines"><span>コイン {def.coins}{def.morale > 0 ? `・やる気 ${def.morale}` : ''}</span></div>
              </div>
              <div className="shop-buy">
                <button type="button" className="btn small primary" disabled={reason !== null} onClick={() => buy(kind)}>建てる</button>
                {reason && <span className="hint">{reason}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
