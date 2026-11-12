// v0.13 住民の歩行（縦の道）とタップの反応のテスト
import { describe, expect, it } from 'vitest';
import { SPRITES } from './spriteData';
import { layoutTown, roadRowOf } from './townLayout';
import { personalityOf, reactionFor, SPECIAL_TAPS, specialFor, SPECIALS, stepWalkers, syncWalkers, tapWalker, walkerPose } from './walkers';

const size = (n: string) => (SPRITES[n] ? { w: SPRITES[n]!.w, h: SPRITES[n]!.h } : null);

describe('縦の道', () => {
  it('となりの区画の道を、左右の端の縦の道がつなぐ', () => {
    const lay = layoutTown([], 'town', size);
    for (let y = roadRowOf(0); y <= roadRowOf(1); y++) {
      expect(lay.walk[y]![0], `y=${y}`).toBe(true);
      expect(lay.walk[y]![15], `y=${y}`).toBe(true);
    }
    expect(lay.walk[roadRowOf(0) + 1]![7]).toBe(false);
  });

  it('端に建物を置いた区画には縦の道を通さない。置いた道は歩ける', () => {
    const goals = [{ goalId: 'a', kind: 'library' as const, level: 1, faded: false }];
    const lay = layoutTown(goals, 'town', size, [], { 'goal:a': { col: 0, block: 1 } }, new Map([['7,2', 'road' as const], ['8,2', 'water' as const]]));
    expect(lay.walk[roadRowOf(0) + 1]![0]).toBe(false);
    expect(lay.walk[roadRowOf(0) + 1]![15]).toBe(true);
    expect(lay.walk[2]![7]).toBe(true);
    expect(lay.walk[2]![8]).toBe(false);
  });
});

describe('住民の歩行', () => {
  it('いつも歩けるマスの上にいて、いずれ別の列の道へ行く', () => {
    const lay = layoutTown([], 'city', size);
    const ws = syncWalkers([], 6, lay.walk);
    const rows = new Set<number>();
    for (let k = 0; k < 3000; k++) {
      stepWalkers(ws, lay.walk, 0.05, k * 50);
      for (const w of ws) {
        expect(lay.walk[w.ty]![w.tx]).toBe(true);
        expect(lay.walk[w.ny]![w.nx]).toBe(true);
        rows.add(w.ty);
      }
    }
    expect([...rows].filter(y => y % 4 === 0).length).toBeGreaterThan(1);
  });

  it('住民の数や道が変わっても、歩けるマスに置き直す', () => {
    const big = layoutTown([], 'city', size);
    const small = layoutTown([], 'hamlet', size);
    let ws = syncWalkers([], 10, big.walk);
    ws = syncWalkers(ws, 4, small.walk);
    expect(ws).toHaveLength(4);
    for (const w of ws) expect(small.walk[w.ty]![w.tx]).toBe(true);
  });
});

describe('タップの反応', () => {
  it('1回なら立ち止まって、やる気に応じた反応。止まっている間は進まない', () => {
    const lay = layoutTown([], 'village', size);
    const [w] = syncWalkers([], 1, lay.walk);
    expect(tapWalker(w!, 'happy', 1000)).toBe('react');
    expect(w!.reaction).toBe(reactionFor('happy'));
    const before = { tx: w!.tx, t: w!.t };
    stepWalkers([w!], lay.walk, 0.5, 1500);
    expect({ tx: w!.tx, t: w!.t }).toEqual(before);
    stepWalkers([w!], lay.walk, 0.5, 4000);
    expect(w!.mode).toBe('walk');
  });

  it(`${SPECIAL_TAPS}回続けてタップすると特別な動き。間があくと数え直す`, () => {
    const lay = layoutTown([], 'village', size);
    const [w] = syncWalkers([], 1, lay.walk);
    for (let k = 0; k < SPECIAL_TAPS - 1; k++) expect(tapWalker(w!, 'happy', 1000 + k * 200)).toBe('react');
    expect(tapWalker(w!, 'happy', 1000 + SPECIAL_TAPS * 200)).toBe(specialFor('happy', personalityOf(w!.index)));
    const [v] = syncWalkers([], 1, lay.walk);
    for (let k = 0; k < SPECIAL_TAPS - 1; k++) tapWalker(v!, 'sad', k * 200);
    expect(tapWalker(v!, 'sad', 10_000)).toBe('react');
  });

  it('やる気ごとに、性格で4通りに分かれる（12通りすべて違う動き）', () => {
    const moods = ['happy', 'neutral', 'sad'] as const;
    const ps = ['cheerful', 'shy', 'lonely', 'calm'] as const;
    const all = moods.flatMap(m => ps.map(p => specialFor(m, p)));
    expect(new Set(all).size).toBe(12);
    for (const m of moods) expect(new Set(ps.map(p => specialFor(m, p))).size).toBe(4);
    expect(new Set(Array.from({ length: 8 }, (_, i) => personalityOf(i))).size).toBe(4);
  });

  it('走る動きは向きを変えて進み、寝転ぶ・その場の動きは進まない', () => {
    const lay = layoutTown([], 'village', size);
    for (const kind of Object.keys(SPECIALS) as Array<keyof typeof SPECIALS>) {
      const [w] = syncWalkers([], 1, lay.walk);
      stepWalkers([w!], lay.walk, 1, 0);
      w!.mode = 'special';
      w!.special = kind;
      w!.modeUntil = 10_000;
      const before = { tx: w!.tx, ty: w!.ty, t: w!.t };
      stepWalkers([w!], lay.walk, 0.5, 100);
      const moved = before.t !== w!.t || before.tx !== w!.tx || before.ty !== w!.ty;
      expect(moved, kind).toBe(SPECIALS[kind].run > 0);
      expect(walkerPose(w!, 200).lie, kind).toBe(SPECIALS[kind].lie);
    }
  });
});
