// 街の配置を決める純粋関数（描画とは分離してテストする）
import { HOUSES_BY_STAGE, tierForLevel, type Stage, type Tier } from '../core/rules';
import type { BuildingParts } from '../core/buildingLook';
import type { BuildingKind, FacilityKind, Placement } from '../core/types';
import { customSpriteName } from './customBuilding';
import { cellKey, type TerrainKind } from '../core/terrain';
import { terrainSprite } from './terrainSprites';

export const TILE = 16;
export const COLS = 16;
const SLOT_X = [1, 4, 7, 10, 13]; // 自動で並べるときの列（間は1マス）
const BLOCK_ROWS = 4; // 建物3マス + 道1マス
/** 建物の幅（マス）。置ける左端の列は 0〜COLS-2 */
export const SPAN = 2;
/** 発展段階ごとの最低限の区画数（区画＝建物の並び1列と、その前の道） */
export const STAGE_BLOCKS: Record<Stage, number> = { hamlet: 2, village: 3, town: 4, city: 5 };
export type { Placement } from '../core/types';

const PREFIX: Record<Exclude<BuildingKind, 'custom'>, string> = {
  library: 'lib', bank: 'bank', news: 'news', gym: 'gym', school: 'school', plaza: 'plaza', kura: 'kura',
};

export interface LayoutFacility {
  id: string;
  kind: FacilityKind;
}

export interface LayoutGoal {
  goalId: string;
  kind: BuildingKind;
  /** 自分で作った建物の部品 */
  parts?: BuildingParts;
  level: number;
  faded: boolean;
}

export interface PlacedItem {
  key: string;
  sprite: string;
  /** 左上（アート座標・ピクセル） */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 重なり順に使う下端 */
  bottom: number;
  goalId?: string;
  facilityId?: string;
  faded?: boolean;
  /** 動かせる物（建物・施設・民家）の位置 */
  place?: Placement;
}

export interface Lane {
  y: number;
  x0: number;
  x1: number;
}

export interface TownLayout {
  cols: number;
  rows: number;
  width: number;
  height: number;
  tiles: string[][];
  items: PlacedItem[];
  lanes: Lane[];
  blocks: number;
  /** 住民が歩けるマス（walk[y][x]）。もとからある横の道・左右の端の縦の道・自分で置いた道 */
  walk: boolean[][];
}

/** 左右の端の縦の道を通す列 */
export const EDGE_ROAD_COLS = [0, COLS - 1] as const;

export { HOUSES_BY_STAGE } from '../core/rules';

export function groundTier(stage: Stage): Tier {
  if (stage === 'city') return 'city';
  if (stage === 'town') return 'town';
  return 'village';
}

export function buildingSprite(kind: BuildingKind, level: number, has: (name: string) => boolean, parts?: BuildingParts): string {
  // レベル0（倒壊）はがれき
  if (level <= 0 && has('rubble')) return 'rubble';
  const tier = tierForLevel(level);
  if (kind === 'custom') return parts ? customSpriteName(parts, tier) : `house_${tier}`;
  const name = `${PREFIX[kind]}_${tier}`;
  return has(name) ? name : `house_${tier}`;
}

export function facilitySprite(kind: FacilityKind, has: (name: string) => boolean): string {
  const name = `fac_${kind}`;
  return has(name) ? name : 'house_village';
}

type Size = (name: string) => { w: number; h: number } | null;

/** 区画 b の道の行 */
export const roadRowOf = (block: number) => 1 + block * BLOCK_ROWS + 3;

/** アート座標の点が、どの区画のどの位置か（建物の中心がそこに来るように左端の列を決める） */
export function placementAt(ax: number, ay: number, blocks: number): Placement {
  const col = Math.min(COLS - SPAN, Math.max(0, Math.round(ax / TILE - SPAN / 2)));
  const block = Math.min(blocks - 1, Math.max(0, Math.floor((ay / TILE - 1) / BLOCK_ROWS)));
  return { col, block };
}

export function layoutTown(
  goals: LayoutGoal[],
  stage: Stage,
  size: Size,
  facilities: LayoutFacility[] = [],
  placements: Readonly<Record<string, Placement>> = {},
  terrain: ReadonlyMap<string, TerrainKind> = new Map(),
): TownLayout {
  const has = (n: string) => size(n) !== null;
  const tier = groundTier(stage);
  const houses = HOUSES_BY_STAGE[stage];

  const entries: Array<{ key: string; sprite: string; extra: Partial<PlacedItem> }> = [
    ...goals.map(g => ({
      key: `goal:${g.goalId}`,
      sprite: buildingSprite(g.kind, g.level, has, g.parts),
      // がれきは色あせ表示にしない（もう十分さびしいので）
      extra: { goalId: g.goalId, faded: g.faded && g.level > 0 },
    })),
    ...Array.from({ length: houses }, (_, i) => ({ key: `house:${i}`, sprite: `house_${tier}`, extra: {} })),
    ...facilities.map(f => ({ key: `fac:${f.id}`, sprite: facilitySprite(f.kind, has), extra: { facilityId: f.id } })),
  ];

  // 区画の数：発展段階の広さ、または全部を自動で並べられる数＋空き1区画の多いほう
  let blocks = Math.max(STAGE_BLOCKS[stage], Math.ceil(entries.length / SLOT_X.length) + 1);
  const used: boolean[][] = [];
  const isFree = (p: Placement) => {
    if (!Number.isInteger(p.col) || !Number.isInteger(p.block) || p.col < 0 || p.col > COLS - SPAN || p.block < 0 || p.block >= blocks) return false;
    const row = used[p.block] ?? [];
    return !row[p.col] && !row[p.col + 1];
  };
  const take = (p: Placement) => {
    const row = (used[p.block] ??= []);
    row[p.col] = true;
    row[p.col + 1] = true;
  };

  // 1. 自分で置いた位置（地図の外・重なりは無視して、あとで自動で置く）
  const pos = new Map<string, Placement>();
  for (const e of entries) {
    const p = placements[e.key];
    if (p && isFree(p)) {
      take(p);
      pos.set(e.key, p);
    }
  }
  // 2. 残りは、いつもの列から順に空いているところへ。なければ区画を足す
  const findFree = (): Placement => {
    for (;;) {
      for (let b = 0; b < blocks; b++) {
        for (const col of SLOT_X) if (isFree({ col, block: b })) return { col, block: b };
        for (let col = 0; col <= COLS - SPAN; col++) if (isFree({ col, block: b })) return { col, block: b };
      }
      blocks += 1;
    }
  };
  for (const e of entries) {
    if (pos.has(e.key)) continue;
    const p = findFree();
    take(p);
    pos.set(e.key, p);
  }

  const rows = 1 + blocks * BLOCK_ROWS + 1;
  const roadRows = Array.from({ length: blocks }, (_, b) => roadRowOf(b));

  // 縦の道：となりの区画の道どうしを、左右の端でつなぐ（その列に建物があるとき・地形を置いたときは通さない）
  const edgeRoad = new Set<string>();
  for (let b = 0; b + 1 < blocks; b++) {
    for (const x of EDGE_ROAD_COLS) {
      if (used[b + 1]?.[x]) continue;
      const cells = [];
      for (let y = roadRowOf(b) + 1; y < roadRowOf(b + 1); y++) cells.push(y);
      if (cells.some(y => terrain.has(cellKey(x, y)))) continue;
      for (const y of cells) edgeRoad.add(cellKey(x, y));
    }
  }

  const tiles: string[][] = [];
  const walk: boolean[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: string[] = [];
    const w: boolean[] = [];
    for (let x = 0; x < COLS; x++) {
      const isRoad = roadRows.includes(y);
      const isEdge = edgeRoad.has(cellKey(x, y));
      // 置いた地形（もとからある道の上には置けない）
      const t = isRoad ? undefined : terrain.get(cellKey(x, y));
      // 縦の道は、置いた道と同じ舗装（都市の白線は横向きなので使わない）
      row.push(t ? terrainSprite(t, tier) : isEdge ? terrainSprite('road', tier) : groundTile(tier, x, y, isRoad, y === 0 || y === rows - 1));
      w.push(isRoad || isEdge || t === 'road');
    }
    tiles.push(row);
    walk.push(w);
  }

  const items: PlacedItem[] = [];
  const place = (key: string, sprite: string, tileX: number, bottomPx: number, extra: Partial<PlacedItem> = {}) => {
    const s = size(sprite);
    if (!s) return;
    // 幅が2マス未満の物はマスの中央に寄せる
    const span = s.w > TILE ? 2 : 1;
    const x = tileX * TILE + Math.floor((span * TILE - s.w) / 2);
    items.push({ key, sprite, x, y: bottomPx - s.h, w: s.w, h: s.h, bottom: bottomPx, ...extra });
  };

  for (const e of entries) {
    const p = pos.get(e.key)!;
    place(e.key, e.sprite, p.col, roadRowOf(p.block) * TILE, { ...e.extra, place: p });
  }

  // 飾り：建物のない列に木か街灯、上下の余白に木
  const decoBetween = tier === 'village' ? 'deco_tree' : 'deco_lamp';
  roadRows.forEach((roadRow, b) => {
    for (const x of [0, 3, 6, 9, 12, 15]) {
      if (used[b]?.[x]) continue;
      const sprite = tier === 'town' && (x === 0 || x === 15) ? 'deco_tree' : decoBetween;
      place(`deco:${b}:${x}`, sprite, x, roadRow * TILE);
    }
  });
  for (const x of [1, 5, 10, 14]) place(`deco:top:${x}`, 'deco_tree', x, TILE);
  for (const x of [2, 7, 12]) place(`deco:bottom:${x}`, 'deco_tree', x, rows * TILE);

  items.sort((a, b) => a.bottom - b.bottom || a.x - b.x);

  return {
    cols: COLS,
    rows,
    width: COLS * TILE,
    height: rows * TILE,
    tiles,
    items,
    lanes: roadRows.map(r => ({ y: r * TILE, x0: 0, x1: COLS * TILE })),
    blocks,
    walk,
  };
}

function groundTile(tier: Tier, x: number, y: number, isRoad: boolean, isEdge: boolean): string {
  if (tier === 'village') {
    if (isRoad) return 'tile_path_dirt';
    return (x * 7 + y * 3) % 5 === 0 ? 'tile_flowers_village' : 'tile_grass_village';
  }
  if (tier === 'town') return isRoad ? 'tile_cobble' : 'tile_grass_town';
  if (isRoad) return 'tile_asphalt_line';
  return isEdge ? 'tile_grass_city' : 'tile_sidewalk';
}
