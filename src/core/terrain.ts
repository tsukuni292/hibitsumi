// 地形を置く：道・田んぼ・畑・川や池・花畑・庭・林。1マスごとにコイン。消すのは無料（コインは戻らない）
import type { GameDate } from './date';
import { PLACE_MAX_BLOCKS } from './rules';

export type TerrainKind = 'road' | 'paddy' | 'field' | 'water' | 'flowerbed' | 'garden' | 'forest';

export interface TerrainDef {
  label: string;
  coins: number;
}

export const TERRAIN: Record<TerrainKind, TerrainDef> = {
  road: { label: '道', coins: 2 },
  paddy: { label: '田んぼ', coins: 5 },
  field: { label: '畑', coins: 5 },
  water: { label: '川・池', coins: 5 },
  flowerbed: { label: '花畑', coins: 5 },
  garden: { label: '庭', coins: 5 },
  forest: { label: '林', coins: 5 },
};
export const TERRAIN_ORDER: TerrainKind[] = ['road', 'paddy', 'field', 'water', 'flowerbed', 'garden', 'forest'];

/** 田んぼ・畑がこのマス数ごとに、活動した日の税収 +1（置いた翌日から） */
export const FARM_TILES_PER_TAX = 5;
/** 記録の上限（置いたり消したりの回数） */
export const TERRAIN_MAX_LOG = 5000;

export const TERRAIN_COLS = 16;
/** 置ける行の上限（区画の上限から決まる地図の高さ） */
export const TERRAIN_MAX_ROWS = 1 + PLACE_MAX_BLOCKS * 4 + 1;

/** もとからある道の行（区画ごとの道。地図の大きさによらず 4・8・12… 行目） */
export const isFixedRoadRow = (y: number) => y > 0 && y % 4 === 0;

export const isFarm = (k: TerrainKind | undefined) => k === 'paddy' || k === 'field';

/** 置いた・消した記録。kind が null なら消した */
export interface TerrainEntry {
  date: GameDate;
  x: number;
  y: number;
  kind: TerrainKind | null;
}

export const cellKey = (x: number, y: number) => `${x},${y}`;

/** 記録を順に当てはめた、今の地形（キーは "x,y"） */
export function applyTerrain(map: Map<string, TerrainKind>, e: TerrainEntry): void {
  const k = cellKey(e.x, e.y);
  if (e.kind === null) map.delete(k);
  else map.set(k, e.kind);
}

export function currentTerrain(log: readonly TerrainEntry[]): Map<string, TerrainKind> {
  const map = new Map<string, TerrainKind>();
  for (const e of log) applyTerrain(map, e);
  return map;
}

export function isValidCell(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < TERRAIN_COLS && y >= 0 && y < TERRAIN_MAX_ROWS && !isFixedRoadRow(y);
}
