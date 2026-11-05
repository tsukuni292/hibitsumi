// 街の配置を決める純粋関数（描画とは分離してテストする）
import { tierForLevel, type Stage, type Tier } from '../core/rules';
import type { BuildingKind, FacilityKind } from '../core/types';

export const TILE = 16;
export const COLS = 16;
const SLOT_X = [1, 4, 7, 10, 13]; // 2マス幅の建物を置く列（間は1マス）
const BLOCK_ROWS = 4; // 建物3マス + 道1マス

const PREFIX: Record<BuildingKind, string> = {
  library: 'lib', bank: 'bank', news: 'news', gym: 'gym', school: 'school', plaza: 'plaza', kura: 'kura',
};

export interface LayoutFacility {
  id: string;
  kind: FacilityKind;
}

export interface LayoutGoal {
  goalId: string;
  kind: BuildingKind;
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
}

export const HOUSES_BY_STAGE: Record<Stage, number> = { hamlet: 1, village: 2, town: 3, city: 4 };

export function groundTier(stage: Stage): Tier {
  if (stage === 'city') return 'city';
  if (stage === 'town') return 'town';
  return 'village';
}

export function buildingSprite(kind: BuildingKind, level: number, has: (name: string) => boolean): string {
  // レベル0（倒壊）はがれき
  if (level <= 0 && has('rubble')) return 'rubble';
  const tier = tierForLevel(level);
  const name = `${PREFIX[kind]}_${tier}`;
  return has(name) ? name : `house_${tier}`;
}

export function facilitySprite(kind: FacilityKind, has: (name: string) => boolean): string {
  const name = `fac_${kind}`;
  return has(name) ? name : 'house_village';
}

type Size = (name: string) => { w: number; h: number } | null;

export function layoutTown(goals: LayoutGoal[], stage: Stage, size: Size, facilities: LayoutFacility[] = []): TownLayout {
  const has = (n: string) => size(n) !== null;
  const tier = groundTier(stage);
  const houses = HOUSES_BY_STAGE[stage];
  const slotsNeeded = goals.length + houses + facilities.length;
  const blocks = Math.max(1, Math.ceil(slotsNeeded / SLOT_X.length));
  const rows = 1 + blocks * BLOCK_ROWS + 1;
  const roadRows = Array.from({ length: blocks }, (_, b) => 1 + b * BLOCK_ROWS + 3);

  const tiles: string[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: string[] = [];
    for (let x = 0; x < COLS; x++) row.push(groundTile(tier, x, y, roadRows.includes(y), y === 0 || y === rows - 1));
    tiles.push(row);
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

  const entries: Array<{ key: string; sprite: string; extra: Partial<PlacedItem> }> = [
    ...goals.map(g => ({
      key: `goal:${g.goalId}`,
      sprite: buildingSprite(g.kind, g.level, has),
      // がれきは色あせ表示にしない（もう十分さびしいので）
      extra: { goalId: g.goalId, faded: g.faded && g.level > 0 },
    })),
    ...Array.from({ length: houses }, (_, i) => ({ key: `house:${i}`, sprite: `house_${tier}`, extra: {} })),
    ...facilities.map(f => ({ key: `fac:${f.id}`, sprite: facilitySprite(f.kind, has), extra: { facilityId: f.id } })),
  ];
  entries.forEach((e, i) => {
    const block = Math.floor(i / SLOT_X.length);
    const slot = SLOT_X[i % SLOT_X.length]!;
    const bottom = roadRows[block]! * TILE;
    place(e.key, e.sprite, slot, bottom, e.extra);
  });

  // 飾り：建物の間（道の上）に木か街灯、上下の余白に木
  const decoBetween = tier === 'village' ? 'deco_tree' : 'deco_lamp';
  roadRows.forEach((roadRow, b) => {
    for (const x of [0, 3, 6, 9, 12, 15]) {
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
