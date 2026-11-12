// v0.12 地形を置くのテスト
import { describe, expect, it } from 'vitest';
import { applyAction, type ActionResult } from './actions';
import { simulate } from './simulate';
import { currentTerrain, isFixedRoadRow, type TerrainKind } from './terrain';
import type { SaveData } from './types';
import { day, goal, save, withChecks } from './testUtils';
import { PALETTE, SPRITES } from '../render/spriteData';
import { TERRAIN_SPRITES } from '../render/terrainSprites';
import { layoutTown } from '../render/townLayout';

const daily = { kind: 'daily' } as const;
function ok(r: ActionResult): SaveData {
  if (!r.ok) throw new Error(`失敗: ${r.error}`);
  return r.save;
}
const rich = (patch: Partial<SaveData> = {}) =>
  withChecks(save([goal('a', daily)], { taxFrom: day(0), ...patch }), Array.from({ length: 10 }, (_, i) => [i, 'a', 'ideal'] as [number, string, 'ideal']));
const paint = (s: SaveData, x: number, y: number, kind: TerrainKind | null, d = 10) =>
  applyAction(s, { type: 'paintTerrain', x, y, kind }, day(d));

describe('地形を置く', () => {
  it('道は2コイン、ほかは5コイン。消すのは無料でコインは戻らない', () => {
    const base = simulate(rich(), day(10)).coins;
    let s = ok(paint(rich(), 1, 1, 'road'));
    s = ok(paint(s, 2, 1, 'water'));
    expect(simulate(s, day(10)).coins).toBe(base - 7);
    s = ok(paint(s, 2, 1, null));
    expect(simulate(s, day(10)).coins).toBe(base - 7);
    expect(currentTerrain(s.terrainLog).size).toBe(1);
  });

  it('もとからある道の行・地図の外・同じ地形の重ね置き・コイン不足は不可', () => {
    expect(isFixedRoadRow(4)).toBe(true);
    expect(paint(rich(), 1, 4, 'road').ok).toBe(false);
    expect(paint(rich(), 16, 1, 'road').ok).toBe(false);
    const s = ok(paint(rich(), 1, 1, 'road'));
    expect(paint(s, 1, 1, 'road').ok).toBe(false);
    expect(paint(save([goal('a', daily)]), 1, 1, 'paddy', 0).ok).toBe(false);
  });

  it('田んぼ・畑5マスごとに、置いた翌日から活動した日の税収 +1', () => {
    let s = rich();
    for (let x = 0; x < 5; x++) s = ok(paint(s, x, 2, x % 2 ? 'field' : 'paddy', 5));
    const withFarm = simulate(s, day(9));
    const without = simulate(rich(), day(9));
    const tax = (r: typeof withFarm, n: number) => r.days[n]!.tax;
    expect(tax(withFarm, 5)).toBe(tax(without, 5)); // 置いた日は数えない
    expect(tax(withFarm, 6)).toBe(tax(without, 6) + 1);
    expect(withFarm.farmTax).toBe(1);
  });

  it('置いた地形が街のマスに描かれ、道の行には描かれない', () => {
    const size = (n: string) => (SPRITES[n] ? { w: SPRITES[n]!.w, h: SPRITES[n]!.h } : null);
    const map = new Map([['3,2', 'water' as const], ['3,4', 'water' as const]]);
    const lay = layoutTown([], 'village', size, [], {}, map);
    expect(lay.tiles[2]![3]).toBe('tile_t_water');
    expect(lay.tiles[4]![3]).not.toBe('tile_t_water');
  });

  it('地形の絵は大きさと色が正しい', () => {
    for (const [name, d] of Object.entries(TERRAIN_SPRITES)) {
      expect(d.rows, name).toHaveLength(16);
      for (const r of d.rows) {
        expect(r).toHaveLength(16);
        for (const c of r) expect(c in PALETTE, `${name}: ${c}`).toBe(true);
      }
    }
  });
});
