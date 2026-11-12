// 自分で作る建物（部品の組み合わせ）。選べる部品と、その検証
import { BUILDING_NAME_MAX } from './rules';

export const ROOF_KINDS = { gable: '切妻', irimoya: '入母屋', western: '洋館', tower: '塔' } as const;
export const ROOF_COLORS = { kawara: '瓦（灰）', shu: '朱', rokusho: '緑青', cha: '茶', ai: '藍' } as const;
export const WALL_KINDS = { shiro: '白壁', wood: '木', tsuchi: '土壁', stone: '石', brick: 'レンガ' } as const;
export const DOOR_KINDS = { norenAi: 'のれん（藍）', norenShu: 'のれん（朱）', sliding: '引き戸', western: '洋風の扉' } as const;
export const SIGN_KINDS = {
  none: 'なし', book: '本', coin: 'お金', brush: '筆', sword: '剣', note: '音符',
  star: '星', heart: 'ハート', flower: '花', tea: 'お茶', ball: 'ボール',
} as const;
export const MINI_KINDS = {
  none: 'なし', pot: '鉢植え', bonsai: '盆栽', bamboo: '竹', tanuki: '狸の置物', cat: '招き猫', daruma: 'だるま',
  jizo: 'お地蔵さま', lantern: '石灯籠', chochin: '提灯', umbrella: '番傘', barrel: '樽', post: 'ポスト',
  bike: '自転車', dog: '犬', snowman: '雪だるま',
} as const;

export type RoofKind = keyof typeof ROOF_KINDS;
export type RoofColor = keyof typeof ROOF_COLORS;
export type WallKind = keyof typeof WALL_KINDS;
export type DoorKind = keyof typeof DOOR_KINDS;
export type SignKind = keyof typeof SIGN_KINDS;
export type MiniKind = keyof typeof MINI_KINDS;

/** 見た目の部品（名前を除く） */
export interface BuildingParts {
  roof: RoofKind;
  roofColor: RoofColor;
  wall: WallKind;
  door: DoorKind;
  sign: SignKind;
  /** 建物の左前・右前に置くミニチュア */
  miniLeft: MiniKind;
  miniRight: MiniKind;
}

export interface BuildingLook extends BuildingParts {
  name: string;
}

export const DEFAULT_PARTS: BuildingParts = {
  roof: 'gable', roofColor: 'kawara', wall: 'shiro', door: 'norenAi', sign: 'none', miniLeft: 'none', miniRight: 'pot',
};

/** 部品ごとの選択肢（順番は画面の並び） */
export const PART_OPTIONS = {
  roof: ROOF_KINDS,
  roofColor: ROOF_COLORS,
  wall: WALL_KINDS,
  door: DOOR_KINDS,
  sign: SIGN_KINDS,
  miniLeft: MINI_KINDS,
  miniRight: MINI_KINDS,
} as const;

export const PART_LABEL: Record<keyof BuildingParts, string> = {
  roof: '屋根の形', roofColor: '屋根の色', wall: '壁', door: '入口', sign: '看板の絵', miniLeft: 'ミニチュア（左）', miniRight: 'ミニチュア（右）',
};

export const PART_KEYS = Object.keys(PART_OPTIONS) as Array<keyof BuildingParts>;

export function isValidParts(p: Record<string, unknown>): p is Record<string, unknown> & BuildingParts {
  return PART_KEYS.every(k => typeof p[k] === 'string' && Object.hasOwn(PART_OPTIONS[k], p[k] as string));
}

export function normalizeLook(look: BuildingLook): BuildingLook | string {
  const name = look.name.trim();
  if (!name) return '建物の名前を入力してください';
  if ([...name].length > BUILDING_NAME_MAX) return `建物の名前は${BUILDING_NAME_MAX}文字以内にしてください`;
  if (!isValidParts(look as unknown as Record<string, unknown>)) return '建物の部品を選び直してください';
  const parts = Object.fromEntries(PART_KEYS.map(k => [k, look[k]])) as unknown as BuildingParts;
  return { name, ...parts };
}

/** 部品の組み合わせを表す文字列（名前は含めない。スプライト名に使う） */
export function partsKey(p: BuildingParts): string {
  return PART_KEYS.map(k => p[k]).join('-');
}

export function partsFromKey(key: string): BuildingParts | null {
  const values = key.split('-');
  if (values.length !== PART_KEYS.length) return null;
  const p = Object.fromEntries(PART_KEYS.map((k, i) => [k, values[i]]));
  return isValidParts(p) ? (p as unknown as BuildingParts) : null;
}
