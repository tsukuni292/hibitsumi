// v0.7 自分で作る建物（部品の組み合わせ）のテスト
import { describe, expect, it } from 'vitest';
import { applyAction, type ActionResult } from './actions';
import { DEFAULT_PARTS, normalizeLook, PART_KEYS, PART_OPTIONS, partsFromKey, partsKey, type BuildingParts } from './buildingLook';
import { buildingName } from './defaults';
import type { SaveData } from './types';
import { day, goal, save } from './testUtils';
import { composeCustomBuilding, customSpriteFromName, customSpriteName } from '../render/customBuilding';
import { PALETTE } from '../render/spriteData';
import { buildingSprite } from '../render/townLayout';
import { parseSave } from '../storage/schema';

function ok(r: ActionResult): SaveData {
  if (!r.ok) throw new Error(`失敗: ${r.error}`);
  return r.save;
}
const look = { name: ' 茶道部室 ', ...DEFAULT_PARTS };
const text = { name: '茶道', ideal: '30分', minimum: null };
const daily = { kind: 'daily' } as const;

describe('見た目の検証', () => {
  it('名前は前後の空白を除いて1〜10文字、部品は選択肢の中だけ', () => {
    expect(normalizeLook(look)).toEqual({ ...DEFAULT_PARTS, name: '茶道部室' });
    expect(normalizeLook({ ...look, name: '  ' })).toContain('名前');
    expect(normalizeLook({ ...look, name: 'あ'.repeat(11) })).toContain('10文字');
    expect(normalizeLook({ ...look, roof: 'castle' as BuildingParts['roof'] })).toContain('部品');
  });

  it('部品の文字列から元に戻せる（不正なものは null）', () => {
    expect(partsFromKey(partsKey(DEFAULT_PARTS))).toEqual(DEFAULT_PARTS);
    expect(partsFromKey('gable-x-shiro-norenAi-none-none-pot')).toBeNull();
    expect(partsFromKey('gable')).toBeNull();
  });
});

describe('目標の建物', () => {
  it('自分で作る建物は見た目つきで追加でき、名前が建物名になる', () => {
    const s = ok(applyAction(save([]), { type: 'addGoal', id: 'c', building: 'custom', look, text, frequency: daily }, day(0)));
    const g = s.goals[0]!;
    expect(g.look?.name).toBe('茶道部室');
    expect(buildingName(g)).toBe('茶道部室');
    expect(applyAction(save([]), { type: 'addGoal', id: 'c', building: 'custom', text, frequency: daily }, day(0)).ok).toBe(false);
  });

  it('今ある目標の建物を作り替えられ、ほかの建物に戻すと見た目は消える', () => {
    let s = save([goal('a', daily)]);
    s = ok(applyAction(s, { type: 'editGoal', goalId: 'a', building: 'custom', look, text: { name: 'a', ideal: '理想', minimum: '最低' }, frequency: daily }, day(3)));
    expect(s.goals[0]).toMatchObject({ building: 'custom', look: { name: '茶道部室' } });
    s = ok(applyAction(s, { type: 'editGoal', goalId: 'a', building: 'gym', look, text: { name: 'a', ideal: '理想', minimum: '最低' }, frequency: daily }, day(3)));
    expect(s.goals[0]?.building).toBe('gym');
    expect(s.goals[0]?.look).toBeUndefined();
  });

  it('保存データ：見た目のない custom は弾き、v4 からは移行できる', () => {
    const s = ok(applyAction(save([]), { type: 'addGoal', id: 'c', building: 'custom', look, text, frequency: daily }, day(0)));
    expect(parseSave(s).ok).toBe(true);
    const { look: _l, ...broken } = s.goals[0]!;
    expect(parseSave({ ...s, goals: [broken] }).ok).toBe(false);
    expect(parseSave({ ...save([goal('a', daily)]), schemaVersion: 4 })).toMatchObject({ ok: true, migratedFrom: 4 });
  });
});

describe('ドット絵の組み立て', () => {
  const check = (p: BuildingParts) => {
    for (const tier of ['village', 'town', 'city'] as const) {
      const d = composeCustomBuilding(p, tier);
      expect(d.rows).toHaveLength(d.h);
      expect(d.h).toBe(tier === 'village' ? 32 : 40);
      for (const r of d.rows) {
        expect(r).toHaveLength(32);
        for (const c of r) expect(c in PALETTE).toBe(true);
      }
    }
  };

  it('どの部品を選んでも、大きさと色が正しい絵になる', () => {
    for (const k of PART_KEYS) for (const v of Object.keys(PART_OPTIONS[k])) check({ ...DEFAULT_PARTS, [k]: v });
  });

  it('街では部品の名前のスプライトになり、名前から絵を作り直せる。倒壊はがれき', () => {
    const name = buildingSprite('custom', 5, () => true, DEFAULT_PARTS);
    expect(name).toBe(customSpriteName(DEFAULT_PARTS, 'town'));
    expect(customSpriteFromName(name)).toEqual(composeCustomBuilding(DEFAULT_PARTS, 'town'));
    expect(customSpriteFromName('cb_bad_town')).toBeNull();
    expect(buildingSprite('custom', 0, () => true, DEFAULT_PARTS)).toBe('rubble');
  });
});
