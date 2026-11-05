import { describe, expect, it } from 'vitest';
import { LOOK_COUNT, residentLook } from './residents';
import { PALETTE, SPRITES } from './spriteData';
import { buildingSprite, layoutTown, TILE } from './townLayout';

const size = (n: string) => (SPRITES[n] ? { w: SPRITES[n]!.w, h: SPRITES[n]!.h } : null);

describe('スプライトデータ', () => {
  it('すべての行の幅・行数・色が正しい', () => {
    for (const [name, s] of Object.entries(SPRITES)) {
      expect(s.rows.length, name).toBe(s.h);
      for (const r of s.rows) {
        expect(r.length, name).toBe(s.w);
        for (const c of r) expect(c in PALETTE, `${name}: ${c}`).toBe(true);
      }
    }
  });

  it('街で使う基本の絵がそろっている', () => {
    for (const tier of ['village', 'town', 'city']) {
      expect(SPRITES[`house_${tier}`], tier).toBeDefined();
    }
    for (const n of ['deco_tree', 'deco_lamp', 'tile_path_dirt', 'tile_cobble', 'tile_asphalt_line', 'tile_sidewalk']) {
      expect(SPRITES[n], n).toBeDefined();
    }
  });
});

describe('住民の見た目', () => {
  it('最初の200人はすべて違う見た目', () => {
    const keys = new Set(Array.from({ length: 200 }, (_, i) => residentLook(i).key));
    expect(keys.size).toBe(200);
    expect(LOOK_COUNT).toBe(960);
  });
});

describe('街の配置', () => {
  const goals = Array.from({ length: 6 }, (_, i) => ({ goalId: `g${i}`, kind: 'library' as const, level: 1, faded: false }));

  it('絵がない建物は住居で代用する', () => {
    expect(buildingSprite('library', 1, n => n === 'lib_village')).toBe('lib_village');
    expect(buildingSprite('bank', 5, () => false)).toBe('house_town');
  });

  it('目標の建物が全部置かれ、地図からはみ出さない', () => {
    const lay = layoutTown(goals, 'city', size);
    const placed = lay.items.filter(i => i.goalId);
    expect(placed.map(i => i.goalId).sort()).toEqual(goals.map(g => g.goalId));
    for (const it of lay.items) {
      expect(it.x, it.key).toBeGreaterThanOrEqual(0);
      expect(it.y, it.key).toBeGreaterThanOrEqual(0);
      expect(it.x + it.w, it.key).toBeLessThanOrEqual(lay.width);
      expect(it.bottom, it.key).toBeLessThanOrEqual(lay.height);
    }
    expect(lay.tiles).toHaveLength(lay.rows);
    expect(lay.tiles.every(r => r.length === lay.cols)).toBe(true);
  });

  it('建物同士は重ならない', () => {
    const lay = layoutTown(goals, 'town', size);
    const buildings = lay.items.filter(i => i.w > TILE);
    for (const a of buildings) for (const b of buildings) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `${a.key} と ${b.key}`).toBe(false);
    }
  });

  it('目標0個でも壊れない', () => {
    const lay = layoutTown([], 'hamlet', size);
    expect(lay.lanes.length).toBeGreaterThan(0);
  });
});
