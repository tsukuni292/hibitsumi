import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action } from '../core/actions';
import { toDayNumber, type GameDate } from '../core/date';
import { buildingName } from '../core/defaults';
import { isActive, textOn } from '../core/goals';
import {
  FACILITIES, FACILITY_ORDER, MAX_LEVEL, MAX_WALKING_RESIDENTS, MORALE_SPEND_FLOOR, moodForMorale, tierForLevel, upgradeCost, type Stage,
} from '../core/rules';
import { inRangeFacilities, isCollapseImminent, isFadedNow, type SimResult } from '../core/simulate';
import type { FacilityKind, FacilityPurchase, SaveData } from '../core/types';
import { formatShort } from '../app/format';
import { formatSource, quoteFor } from '../core/quotes';
import { ambienceLine, residentLine } from '../render/residents';
import { spriteSize } from '../render/spriteCache';
import { layoutTown, placementAt, SPAN, type Placement, type TownLayout } from '../render/townLayout';
import { SpriteImg } from './SpriteImg';
import { TownCanvas } from './TownCanvas';
import { useViewPrefs } from '../app/viewPrefs';
import { EVENT_EFFECT_DAYS, EVENT_FOR_SEASON, EVENTS, eventActiveOn, SEASON_LABEL, seasonKey, seasonOf, weatherOf, type EventKind } from '../core/seasons';
import { addDays, diffDays } from '../core/date';
import { timeOfDay, type Ambience } from '../render/ambience';
import { currentTerrain, FARM_TAX_MAX, FARM_TILES_PER_TAX, isFarm, TERRAIN, TERRAIN_ORDER, type TerrainKind } from '../core/terrain';
import { terrainSprite } from '../render/terrainSprites';
import { PERSONALITY_LABEL, personalityOf, SPECIALS } from '../render/walkers';
import { groundTier } from '../render/townLayout';

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
  // 最後にタップした住民（性格を見せる）
  const [tapped, setTapped] = useState<number | null>(null);
  const [special, setSpecial] = useState<string | null>(null);
  // 配置を変えるモードと、動かそうとしている物
  const [arranging, setArranging] = useState(false);
  const [mover, setMover] = useState<string | null>(null);
  const [arrangeMsg, setArrangeMsg] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  // 地形を置くモードと、選んでいる地形（null は「消す」）
  const [painting, setPainting] = useState(false);
  const [brush, setBrush] = useState<TerrainKind | null>('road');
  const terrain = useMemo(() => currentTerrain(save.terrainLog), [save.terrainLog]);
  const prefs = useViewPrefs();
  // 時刻は1分ごとに見直す（夜になったら夜の街に）
  const [hour, setHour] = useState(() => new Date().getHours() + new Date().getMinutes() / 60);
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours() + new Date().getMinutes() / 60), 60_000);
    return () => clearInterval(id);
  }, []);
  const ambience: Ambience = useMemo(() => {
    const season = prefs.season === 'auto' ? seasonOf(today) : prefs.season;
    // 降る日なら、見た目の季節が冬なら雪、それ以外は雨
    const weather = weatherOf(today) === 'clear' ? 'clear' : season === 'winter' ? 'snow' : 'rain';
    return { season, time: prefs.time === 'auto' ? timeOfDay(hour) : prefs.time, weather };
  }, [prefs, today, hour]);
  const zoom = ZOOMS[zoomIdx] ?? 3;

  const activeGoals = useMemo(() => save.goals.filter(g => isActive(g, today)), [save.goals, today]);
  const facilities = useMemo(() => inRangeFacilities(save, today), [save, today]);
  const layout = useMemo(
    () =>
      layoutTown(
        activeGoals.map(g => ({
          goalId: g.id,
          kind: g.building,
          parts: g.look,
          level: sim.buildings[g.id]?.level ?? 1,
          faded: isFadedNow(save, sim, g),
        })),
        stage,
        spriteSize,
        facilities.map(f => ({ id: f.id, kind: f.kind })),
        save.placements,
        terrain,
      ),
    [activeGoals, sim, save, stage, facilities, terrain],
  );

  const mood = moodForMorale(sim.morale);
  // 1日おきに、季節・時間・天気にちなんだ一言
  const line = toDayNumber(today) % 2 === 0 ? ambienceLine(ambience, toDayNumber(today)) : residentLine(mood, toDayNumber(today));
  const quote = quoteCount === null ? null : quoteFor(toDayNumber(today), quoteCount);
  const selGoal = selected?.startsWith('goal:') ? activeGoals.find(g => `goal:${g.id}` === selected) ?? null : null;
  const selFacility = selected?.startsWith('fac:') ? facilities.find(f => `fac:${f.id}` === selected) ?? null : null;

  return (
    <div className="screen town-screen">
      <div className="town-view">
        <TownCanvas
          layout={layout}
          morale={sim.morale}
          residents={Math.min(sim.population.total, MAX_WALKING_RESIDENTS)}
          selectedKey={arranging ? mover : selGoal || selFacility ? selected : null}
          onSelect={key => {
            setSelected(key);
            if (key) setShopOpen(false);
          }}
          zoom={zoom}
          ambience={ambience}
          onResidentTap={(i, result) => {
            setQuoteCount(c => (c === null ? 0 : c + 1));
            setTapped(i);
            setSpecial(result === 'react' ? null : SPECIALS[result].label);
          }}
          onTileTap={painting ? (tx, ty) => { dispatch({ type: 'paintTerrain', x: tx, y: ty, kind: brush }); } : undefined}
          onPlaceTap={arranging ? (ax, ay, hitKey) => {
            const r = arrangeTap(layout, mover, ax, ay, hitKey);
            setArrangeMsg(r.message);
            setMover(r.mover);
            if (r.placements) dispatch({ type: 'setPlacements', placements: r.placements });
          } : undefined}
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
          {tapped !== null && (
            <p className="hint">
              {special ? <strong>{PERSONALITY_LABEL[personalityOf(tapped)]}な住民の「{special}」！</strong> : `（${PERSONALITY_LABEL[personalityOf(tapped)]}な住民。続けて何回もタップすると…？）`}
            </p>
          )}
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

      <PopulationInfo sim={sim} farms={[...terrain.values()].filter(isFarm).length} />

      {painting ? (
        <div className="arrange-bar">
          <p className="hint">置きたい地形を選んで、街のマスをタップしてください（もとからある道の上には置けません）。消すのは無料ですが、コインは戻りません。</p>
          <div className="terrain-palette">
            {TERRAIN_ORDER.map(k => (
              <button key={k} type="button" className={`terrain-chip${brush === k ? ' on' : ''}`} onClick={() => setBrush(k)} aria-pressed={brush === k}>
                <SpriteImg name={terrainSprite(k, groundTier(stage))} scale={2} />
                <span>{TERRAIN[k].label}<br /><small>{TERRAIN[k].coins}コイン</small></span>
              </button>
            ))}
            <button type="button" className={`terrain-chip${brush === null ? ' on' : ''}`} onClick={() => setBrush(null)} aria-pressed={brush === null}>
              <span>消す<br /><small>無料</small></span>
            </button>
          </div>
          <div className="btn-row">
            <span className="hint">コイン {sim.coins}</span>
            <button type="button" className="btn small primary" onClick={() => setPainting(false)}>完了</button>
          </div>
        </div>
      ) : arranging ? (
        <div className="arrange-bar">
          <p className="hint">{arrangeMsg ?? '動かしたい物をタップしてから、置きたい場所をタップしてください。ほかの物をタップすると入れ替えます。'}</p>
          <div className="btn-row">
            <button
              type="button"
              className="btn small"
              onClick={() => {
                if (window.confirm('動かした位置を全部やめて、自動で並べ直しますか？')) {
                  dispatch({ type: 'resetPlacements' });
                  setMover(null);
                  setArrangeMsg(null);
                }
              }}
            >
              自動で並べ直す
            </button>
            <button type="button" className="btn small primary" onClick={() => { setArranging(false); setMover(null); setArrangeMsg(null); }}>完了</button>
          </div>
        </div>
      ) : (
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => { setArranging(true); setSelected(null); setShopOpen(false); setEventOpen(false); }}>配置を変える</button>
        <button type="button" className="btn" onClick={() => { setPainting(true); setSelected(null); setShopOpen(false); setEventOpen(false); }}>地形を置く</button>
        <button type="button" className={`btn${eventOpen ? ' primary' : ''}`} onClick={() => { setEventOpen(o => !o); setShopOpen(false); setSelected(null); }}>季節の行事</button>
        <button type="button" className={`btn${shopOpen ? ' primary' : ''}`} onClick={() => { setShopOpen(o => !o); setEventOpen(false); setSelected(null); }}>
          住民のための施設を建てる
        </button>
        {sim.charmState !== 'none' && <span className="hint">お守り：{CHARM_LABEL[sim.charmState]}</span>}
      </div>
      )}

      {shopOpen && <FacilityShop sim={sim} dispatch={dispatch} newId={newId} />}
      {eventOpen && <EventPanel sim={sim} today={today} dispatch={dispatch} newId={newId} />}
      <EventBanner sim={sim} today={today} />

      {selGoal && (
        <BuildingPanel save={save} sim={sim} today={today} goalId={selGoal.id} dispatch={dispatch} onClose={() => setSelected(null)} />
      )}
      {selFacility && <FacilityPanel facility={selFacility} today={today} onClose={() => setSelected(null)} />}
      {!selGoal && !selFacility && !shopOpen && !arranging && !painting && (
        <p className="hint center">建物をタップすると、くわしい情報と建て替えができます。ドラッグで街を動かせます。</p>
      )}
    </div>
  );
}

/** 開催中の行事（効果が続いているもの） */
function EventBanner({ sim, today }: { sim: SimResult; today: GameDate }) {
  const active = sim.events.filter(e => (e.kind === 'matsuri' || e.kind === 'shukaku') && eventActiveOn(e.date, today));
  if (active.length === 0) return null;
  return (
    <p className="event-banner">
      {active.map(e => `🏮 ${EVENTS[e.kind].label}開催中（${EVENTS[e.kind].effect.replace(/^開いた日から\d日間、/, '')}・あと${diffDays(addDays(e.date, EVENT_EFFECT_DAYS), today)}日）`).join('　')}
    </p>
  );
}

/** 季節の行事：今の季節の行事をコインで開く（季節ごとに1回） */
function EventPanel({ sim, today, dispatch, newId }: { sim: SimResult; today: GameDate; dispatch: (a: Action) => boolean; newId: () => string }) {
  const panelRef = usePanelScroll('event');
  const season = seasonOf(today);
  const kind: EventKind = EVENT_FOR_SEASON[season];
  const def = EVENTS[kind];
  const held = sim.events.some(e => e.kind === kind && seasonKey(e.date) === seasonKey(today));
  const reason = held ? 'この季節はもう開きました' : sim.coins < def.coins ? `あと${def.coins - sim.coins}コイン` : null;
  return (
    <section className="building-panel" ref={panelRef}>
      <h2>季節の行事（今は{SEASON_LABEL[season]}）</h2>
      <p className="hint">コインを使って、季節ごとに1回だけ開けます。季節は本物の暦で決まります（見た目の季節の設定とは別）。</p>
      <div className="shop-item">
        <div className="shop-info">
          <div className="goal-name">{def.label}</div>
          <div className="goal-lines"><span>{def.effect}</span></div>
          <div className="goal-lines"><span>コイン {def.coins}</span></div>
        </div>
        <div className="shop-buy">
          <button
            type="button"
            className="btn small primary"
            disabled={reason !== null}
            onClick={() => { if (window.confirm(`${def.label}を開きますか？（コイン ${def.coins}）`)) dispatch({ type: 'holdEvent', id: newId(), kind }); }}
          >
            開く
          </button>
          {reason && <span className="hint">{reason}</span>}
        </div>
      </div>
      <p className="hint">ほかの季節の行事：{(Object.keys(EVENTS) as EventKind[]).filter(k => k !== kind).map(k => `${SEASON_LABEL[EVENTS[k].season]}の${EVENTS[k].label}（${EVENTS[k].effect}）`).join('、')}</p>
    </section>
  );
}

/** 人口と税収 */
function PopulationInfo({ sim, farms }: { sim: SimResult; farms: number }) {
  const p = sim.population;
  return (
    <details className="population">
      <summary>
        人口 <strong>{p.total}人</strong>
        {p.away > 0 && <span className="hint">（{p.away}人が引っ越し中）</span>}
        <span className="hint">　{sim.activeToday ? `今日の税収 +${sim.taxToday}（明日の朝に入ります）` : `今日活動すると税収 +${sim.taxToday}`}</span>
      </summary>
      <ul className="hint">
        <li>民家の住民 {p.houses}人（街が発展すると民家が増えます）</li>
        <li>建物のレベルの合計 {p.buildings}人（建て替えるほど増えます）</li>
        <li>施設に集まる住民 {p.facilities}人</li>
        <li>続けたごほうび {p.activity}人（活動した日7日ごとに1人）</li>
        {p.away > 0 && <li>引っ越し中 −{p.away}人（しょんぼりで終わった日に1人出ていき、元気で終わった日に1人戻ります）</li>}
        <li>税収：目標や課題を1つでもやった日に、人口×0.5 コイン</li>
        <li>田んぼ・畑 {farms}マス：{FARM_TILES_PER_TAX}マスごとに税収 +1、1日 {FARM_TAX_MAX} まで（置いた翌日から。今は +{sim.farmTax}）</li>
      </ul>
    </details>
  );
}

/**
 * 配置を変えるモードでのタップ。1回目で動かす物を選び、2回目で置き場所を決める。
 * ほかの物をタップしたら入れ替え、空いた場所なら移動。2つ以上と重なる場所には置かない。
 * 動かすときは、今の並びを全部覚えておく（自動で並んでいた物が勝手に動かないように）。
 */
function arrangeTap(layout: TownLayout, mover: string | null, ax: number, ay: number, hitKey: string | null): {
  mover: string | null; message: string | null; placements?: Record<string, Placement>;
} {
  if (!mover) return hitKey ? { mover: hitKey, message: '置きたい場所をタップしてください（同じ物をもう一度タップでやめる）。' } : { mover: null, message: null };
  if (hitKey === mover) return { mover: null, message: null };
  const placeOf = (key: string) => layout.items.find(it => it.key === key)?.place;
  const from = placeOf(mover);
  if (!from) return { mover: null, message: null };
  const snapshot: Record<string, Placement> = {};
  for (const it of layout.items) if (it.place) snapshot[it.key] = it.place;

  if (hitKey) {
    const to = placeOf(hitKey);
    if (!to) return { mover, message: null };
    return { mover: null, message: '入れ替えました。', placements: { ...snapshot, [mover]: to, [hitKey]: from } };
  }
  const to = placementAt(ax, ay, layout.blocks);
  const blockers = layout.items.filter(
    it => it.place && it.key !== mover && it.place.block === to.block && it.place.col < to.col + SPAN && to.col < it.place.col + SPAN,
  );
  if (blockers.length === 0) return { mover: null, message: '動かしました。', placements: { ...snapshot, [mover]: to } };
  if (blockers.length === 1) {
    const other = blockers[0]!;
    return { mover: null, message: '入れ替えました。', placements: { ...snapshot, [mover]: other.place!, [other.key]: from } };
  }
  return { mover, message: 'そこには置けません。空いている場所か、ほかの物の上をタップしてください。' };
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
        <h2>{buildingName(goal)}<span className="sub">（{text?.name ?? ''}）</span></h2>
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
