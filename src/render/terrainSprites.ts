// 地形のマス（16×16）。PALETTE の文字で、模様を式で描く
import type { TerrainKind } from '../core/terrain';
import type { Tier } from '../core/rules';
import type { SpriteDef } from './spriteData';

const N = 16;

function tile(f: (x: number, y: number) => string): SpriteDef {
  return { w: N, h: N, rows: Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => f(x, y)).join('')) };
}

export const TERRAIN_SPRITES: Record<string, SpriteDef> = {
  // 田んぼ：水を張った田に、稲の株が並ぶ。下と右はあぜ
  tile_t_paddy: tile((x, y) => {
    if (y === 15 || x === 15) return 'd';
    if (x % 4 === 1 && y % 4 !== 3) return y % 4 === 0 ? 'h' : 'g';
    if (x % 4 === 2 && y % 4 === 1) return 'j';
    return (x + y * 3) % 11 === 0 ? 'c' : 'C';
  }),
  // 畑：うねと芽
  tile_t_field: tile((x, y) => {
    if (y % 4 === 3) return 'O';
    if (y % 4 === 1 && x % 3 === 1) return 'g';
    if (y % 4 === 0 && x % 3 === 1) return 'h';
    return y % 4 === 2 ? 'o' : 'p';
  }),
  // 水：さざ波
  tile_t_water: tile((x, y) => {
    if ((x + y * 2) % 13 === 0 || (x * 3 + y) % 17 === 0) return 'c';
    return (x * 5 + y * 3) % 23 === 0 ? 'T' : 't';
  }),
  // 花畑：草の上にいろいろな花
  tile_t_flowerbed: tile((x, y) => {
    const k = (x * 7 + y * 5) % 9;
    if (x % 3 === 1 && y % 3 === 1) return ['u', 'l', 'Z', 'v', 'y', 'z'][(x * 3 + y) % 6]!;
    if (k === 0) return 'h';
    return (x + y) % 5 === 0 ? 'j' : 'g';
  }),
  // 庭：砂利に飛び石
  tile_t_garden: tile((x, y) => {
    const stone = (cx: number, cy: number) => Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 1;
    if (stone(4, 4) || stone(11, 10)) {
      if (y === 3 || y === 9) return 'a';
      return (x === 2 || x === 6 || x === 9 || x === 13) ? 'q' : 'A';
    }
    return (x * 5 + y * 7) % 6 === 0 ? 'a' : (x * 3 + y) % 11 === 0 ? 'w' : 'x';
  }),
  // 林：木がこんもり並ぶ
  tile_t_forest: tile((x, y) => {
    const cx = x % 8, cy = y % 8;
    const d = (cx - 4) ** 2 + (cy - 3) ** 2;
    if (cy === 7 && (cx === 3 || cx === 4)) return 'O';
    if (d <= 2) return 'h';
    if (d <= 10) return 'g';
    return 'j';
  }),
};

/** 地形のマスに使うスプライト名。道は街の発展に合わせた舗装 */
export function terrainSprite(kind: TerrainKind, tier: Tier): string {
  if (kind === 'road') return tier === 'village' ? 'tile_path_dirt' : tier === 'town' ? 'tile_cobble' : 'tile_asphalt';
  return `tile_t_${kind}`;
}
