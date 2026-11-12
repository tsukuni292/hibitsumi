// v0.9 自由配置のテスト
import { describe, expect, it } from 'vitest';
import { applyAction } from '../core/actions';
import { day, goal, save } from '../core/testUtils';
import { parseSave } from '../storage/schema';
import { SPRITES } from './spriteData';
import { layoutTown, placementAt, STAGE_BLOCKS, TILE } from './townLayout';

const size = (n: string) => (SPRITES[n] ? { w: SPRITES[n]!.w, h: SPRITES[n]!.h } : null);
const goals = Array.from({ length: 3 }, (_, i) => ({ goalId: `g${i}`, kind: 'library' as const, level: 1, faded: false }));
const at = (lay: ReturnType<typeof layoutTown>, key: string) => lay.items.find(i => i.key === key)?.place;

describe('自由配置の並べ方', () => {
  it('動かした位置に置かれ、ほかは空いている所へ自動で並ぶ。重ならない', () => {
    const lay = layoutTown(goals, 'village', size, [], { 'goal:g0': { col: 6, block: 2 } });
    expect(at(lay, 'goal:g0')).toEqual({ col: 6, block: 2 });
    const placed = lay.items.filter(i => i.place);
    for (const a of placed) for (const b of placed) {
      if (a === b || a.place!.block !== b.place!.block) continue;
      expect(Math.abs(a.place!.col - b.place!.col) >= 2, `${a.key} と ${b.key}`).toBe(true);
    }
  });

  it('地図の外・重なる位置は無視して自動で置く（先に書いた物が優先）', () => {
    const lay = layoutTown(goals, 'village', size, [], {
      'goal:g0': { col: 3, block: 0 },
      'goal:g1': { col: 4, block: 0 },
      'goal:g2': { col: 3, block: 29 },
    });
    expect(at(lay, 'goal:g0')).toEqual({ col: 3, block: 0 });
    expect(at(lay, 'goal:g1')).not.toEqual({ col: 4, block: 0 });
    expect(at(lay, 'goal:g2')!.block).toBeLessThan(lay.blocks);
  });

  it('発展すると土地が広がり、いつも空き地がある', () => {
    expect(layoutTown([], 'hamlet', size).blocks).toBe(STAGE_BLOCKS.hamlet);
    expect(layoutTown([], 'city', size).blocks).toBe(STAGE_BLOCKS.city);
    const many = Array.from({ length: 20 }, (_, i) => ({ goalId: `m${i}`, kind: 'bank' as const, level: 1, faded: false }));
    const lay = layoutTown(many, 'hamlet', size);
    expect(lay.blocks).toBeGreaterThanOrEqual(Math.ceil(21 / 5) + 1);
  });

  it('建物の上には飾りの木・街灯を置かない', () => {
    const lay = layoutTown(goals, 'village', size, [], { 'goal:g0': { col: 2, block: 0 } });
    expect(lay.items.some(i => i.key === 'deco:0:3')).toBe(false);
  });

  it('タップした地点から、建物の中心がそこに来る位置を求める', () => {
    expect(placementAt(5 * TILE, 1 * TILE + 2, 3)).toEqual({ col: 4, block: 0 });
    expect(placementAt(-50, 9999, 3)).toEqual({ col: 0, block: 2 });
  });
});

describe('配置の記録', () => {
  it('位置を覚え、自動で並べ直すと消える。おかしな値は弾く', () => {
    let s = save([goal('a', { kind: 'daily' })]);
    const r = applyAction(s, { type: 'setPlacements', placements: { 'goal:a': { col: 4, block: 1 } } }, day(0));
    expect(r.ok).toBe(true);
    if (r.ok) s = r.save;
    expect(s.placements).toEqual({ 'goal:a': { col: 4, block: 1 } });
    expect(applyAction(s, { type: 'setPlacements', placements: { 'goal:a': { col: 15, block: 0 } } }, day(0)).ok).toBe(false);
    expect(applyAction(s, { type: 'setPlacements', placements: { 'tree:1': { col: 1, block: 0 } } }, day(0)).ok).toBe(false);
    const reset = applyAction(s, { type: 'resetPlacements' }, day(0));
    expect(reset.ok && reset.save.placements).toEqual({});
  });

  it('v5 のデータは配置なし（自動）で読み込める', () => {
    const { placements: _p, ...v5 } = save([goal('a', { kind: 'daily' })]);
    expect(parseSave({ ...v5, schemaVersion: 5 })).toMatchObject({ ok: true, migratedFrom: 5, save: { placements: {} } });
  });
});
