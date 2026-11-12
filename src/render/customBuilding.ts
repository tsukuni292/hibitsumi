// 自分で作る建物：部品（屋根・色・壁・入口・看板・ミニチュア）を組み合わせてドット絵を作る。
// 色は spriteData の PALETTE の文字で描く（さびれ表示などはふつうの建物と同じ仕組みで動く）
import { partsFromKey, partsKey, type BuildingParts, type DoorKind, type MiniKind, type RoofColor, type SignKind, type WallKind } from '../core/buildingLook';
import type { Tier } from '../core/rules';
import type { SpriteDef } from './spriteData';

const W = 32;
const PREFIX = 'cb_';

export function customSpriteName(parts: BuildingParts, tier: Tier): string {
  return `${PREFIX}${partsKey(parts)}_${tier}`;
}

/** スプライト名から作り直す（名前に部品が全部入っているので、保存しなくてよい） */
export function customSpriteFromName(name: string): SpriteDef | null {
  if (!name.startsWith(PREFIX)) return null;
  const sep = name.lastIndexOf('_');
  const tier = name.slice(sep + 1);
  const parts = partsFromKey(name.slice(PREFIX.length, sep));
  if (!parts || (tier !== 'village' && tier !== 'town' && tier !== 'city')) return null;
  return composeCustomBuilding(parts, tier);
}

// ---- 描画の土台 ----

class Grid {
  readonly px: string[][];
  constructor(readonly w: number, readonly h: number) {
    this.px = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  }
  set(x: number, y: number, c: string) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h && c !== '.') this.px[y]![x] = c;
  }
  get(x: number, y: number): string {
    return this.px[y]?.[x] ?? '.';
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: string | ((x: number, y: number) => string)) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, typeof c === 'string' ? c : c(x, y));
  }
  /** 枠つきの四角（枠は k） */
  box(x0: number, y0: number, x1: number, y1: number, fill: string | ((x: number, y: number) => string)) {
    this.rect(x0, y0, x1, y1, 'k');
    if (x1 - x0 >= 2 && y1 - y0 >= 2) this.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill);
  }
  /** 文字の絵を貼る（. は透明） */
  stamp(x0: number, y0: number, rows: readonly string[]) {
    rows.forEach((r, j) => [...r].forEach((c, i) => this.set(x0 + i, y0 + j, c)));
  }
  toDef(): SpriteDef {
    return { w: this.w, h: this.h, rows: this.px.map(r => r.join('')) };
  }
}

// ---- 色 ----

/** 屋根の色：明・中・暗 */
const ROOF_PAL: Record<RoofColor, [string, string, string]> = {
  kawara: ['a', 'A', 'n'],
  shu: ['s', 'r', 'R'],
  rokusho: ['h', 'g', 'j'],
  cha: ['p', 'o', 'O'],
  ai: ['t', 'T', 'n'],
};

/** 壁の模様（x, y は壁の中の位置） */
function wallFill(kind: WallKind, x: number, y: number): string {
  switch (kind) {
    case 'shiro':
      return x >= 25 ? 'x' : 'w';
    case 'wood':
      return x % 3 === 0 ? 'o' : 'p';
    case 'tsuchi':
      return (x * 5 + y * 3) % 11 === 0 ? 'd' : 'e';
    case 'stone':
      // 石積み：3段ごとに目地、段ごとに縦の目地をずらす
      if (y % 3 === 2) return 'A';
      return (x + (Math.floor(y / 3) % 2) * 3) % 6 === 0 ? 'A' : 'a';
    case 'brick':
      if (y % 2 === 1) return 'e';
      return (x + (Math.floor(y / 2) % 2) * 2) % 4 === 0 ? 'e' : 'r';
  }
}

/** 柱・梁の色 */
const TRIM: Record<WallKind, string> = { shiro: 'O', wood: 'O', tsuchi: 'O', stone: 'n', brick: 'R' };
const isWestern = (w: WallKind) => w === 'stone' || w === 'brick';

// ---- 部品の絵 ----

/** 窓（5×4）。和風は障子、洋風はガラス */
const WINDOW_JP = ['kkkkk', 'keOek', 'kOOOk', 'keOek'];
const WINDOW_WEST = ['kkkkk', 'kwcCk', 'kccCk', 'kkkkk'];
const WINDOW_WEST_LIT = ['kkkkk', 'kwllk', 'klYlk', 'kkkkk'];

/** 入口（8×h）。上から描き、足りない行は下の行をくり返す */
function doorRows(kind: DoorKind, h: number): string[] {
  const body = (top: string[], fill: string) => [...top, ...Array(Math.max(0, h - top.length)).fill(fill)].slice(0, h);
  switch (kind) {
    case 'norenAi':
      return body(['kkkkkkkk', 'kTTkTTTk', 'kTwkTTTk', 'kTTkTTTk', 'knnnnnnk'], 'knnnnnnk');
    case 'norenShu':
      return body(['kkkkkkkk', 'kRRkRRRk', 'kRwkRRRk', 'kRRkRRRk', 'knnnnnnk'], 'knnnnnnk');
    case 'sliding':
      return body(['kkkkkkkk', 'kOeeOeOk', 'kOOOOOOk'], 'kOeeOeOk');
    case 'western':
      return body(['..kkkk..', '.kbbbbk.', 'kbbbbbbk'], 'kbbbbbbk').map((r, i) => (i === Math.floor(h / 2) ? 'kbbbbbyk' : r));
  }
}

/** 看板の絵（7×5）。看板の板は9×7 */
const SIGN_ICON: Record<Exclude<SignKind, 'none'>, string[]> = {
  book: ['.kk.kk.', 'kwwkwwk', 'kwwkwwk', 'kwwkwwk', '.kkkkk.'],
  coin: ['..kkk..', '.kyyyk.', '.kykyk.', '.kyyyk.', '..kkk..'],
  brush: ['.....Ok', '....Ok.', '...Ok..', '.kkk...', 'kk.....'],
  sword: ['.....kx', '....kxk', '.Okxk..', '..Ok...', '.O.O...'],
  note: ['..kkkkk', '..k...k', '..k...k', 'kkk.kkk', 'kk..kk.'],
  star: ['...Y...', 'YYYYYYY', '.YYYYY.', '.YY.YY.', '.Y...Y.'],
  heart: ['.uu.uu.', 'uuuuuuu', '.uuuuu.', '..uuu..', '...u...'],
  flower: ['..ZzZ..', '.ZzyzZ.', '..ZzZ..', '...j...', '..j.j..'],
  tea: ['.c.c...', '..c....', 'kjjjjjk', '.kjjjk.', '..kkk..'],
  ball: ['..kkk..', '.kwkwk.', '.kkwkk.', '.kwkwk.', '..kkk..'],
};

/** ミニチュア（幅8、高さはいろいろ。下端を地面にそろえる） */
const MINI: Record<Exclude<MiniKind, 'none'>, string[]> = {
  pot: ['.jhj.j..', 'jhjjhjj.', '.jjhjj..', '..jjj...', '.kkkkk..', '.kooOk..', '..kkk...'],
  bonsai: ['.jjj....', 'jhjjj.jj', '.jj.bjhj', '...bb.j.', '..bb....', 'kkkkkkk.', '.kOOOk..'],
  bamboo: ['h.h.h.h.', 'kjk.kjk.', 'kgk.kgk.', 'kgk.kjk.', 'kjk.kgk.', 'kgk.kgk.', 'kgk.kjk.', 'kjk.kgk.', 'kkk.kkk.'],
  tanuki: ['.k...k..', 'kOkkkOk.', 'kOeOeOk.', 'kOkOkOk.', '.kOeOk..', 'kOeeeOk.', 'kOeyeOk.', '.kkkkk..'],
  cat: ['.k...k..', 'kwkkkwk.', 'kwkwkwk.', 'kwwuwwk.', '.kwwwkk.', 'kwwrwwk.', 'kwwywwk.', '.kkkkk..'],
  daruma: ['..kkk...', '.krrrk..', 'krwwwrk.', 'krkwkrk.', 'krrrrrk.', 'krYrYrk.', '.krrrk..', '..kkk...'],
  jizo: ['..kkk...', '.kaaak..', '.kakak..', '.kaaak..', 'krrrrrk.', 'kaaaaak.', 'kaaaaak.', '.kkkkk..'],
  lantern: ['...k....', '..kak...', '.kaaak..', '.kAAAk..', '..kyk...', '..klk...', '.kaaak..', '..kak...', '.kaaak..'],
  chochin: ['kkkkkk..', 'Ok..kO..', 'O.kk.O..', 'O.kk.O..', 'Okrrk...', 'Orwwr...', 'Orrrr...', 'O.kk....', 'O.......', 'O.......'],
  umbrella: ['...k....', '.krrrk..', 'krrrrrk.', 'kRrRrRk.', '...O....', '...O....', '...O....', '..kkk...'],
  barrel: ['.kkkkk..', 'kOoooOk.', 'kkkkkkk.', 'kOoooOk.', 'kOoooOk.', 'kkkkkkk.', 'kOoooOk.', '.kkkkk..'],
  post: ['.kkkkk..', 'krrrrrk.', 'krkkkrk.', 'krrrrrk.', 'krrrrrk.', '.kRRRk..', '..kRk...', '..kkk...'],
  bike: ['....kk..', '.kk.k...', '..kTTk..', 'kkkTkkk.', 'k.kTk.k.', 'kkk.kkk.'],
  dog: ['.k..k...', 'kdkkdk..', 'kdkdkdk.', 'kdwwwdk.', '.kdddk.k', '.kdwdkdk', '.kdwddk.', '.kkkkk..'],
  snowman: ['..kkk...', '.kwwwk..', '.kwkwk..', '.kwpwk..', 'krrrrrk.', 'kwwkwwk.', 'kwwwwwk.', '.kkkkk..'],
};

// ---- 組み立て ----

interface Frame {
  h: number;
  /** 壁のいちばん上の行 */
  wallTop: number;
  /** 2階の下（庇の行）。平屋なら null */
  floor2Bottom: number | null;
}

function frameFor(tier: Tier): Frame {
  if (tier === 'village') return { h: 32, wallTop: 18, floor2Bottom: null };
  return { h: 40, wallTop: 17, floor2Bottom: 25 };
}

export function composeCustomBuilding(p: BuildingParts, tier: Tier): SpriteDef {
  const f = frameFor(tier);
  const g = new Grid(W, f.h);
  const [L, M, D] = ROOF_PAL[p.roofColor];
  const trim = TRIM[p.wall];
  const base = f.h - 2;

  // 土台
  g.rect(2, base, 29, base, 'a');
  g.rect(2, base + 1, 29, base + 1, 'A');
  g.set(1, base, 'k'); g.set(30, base, 'k'); g.set(1, base + 1, 'k'); g.set(30, base + 1, 'k');
  g.rect(2, f.h - 1, 29, f.h - 1, (x) => (x % 5 === 0 ? 'n' : 'A'));

  // 壁と柱
  g.rect(3, f.wallTop, 28, base - 1, 'k');
  g.rect(4, f.wallTop, 27, base - 1, (x, y) => wallFill(p.wall, x, y - f.wallTop));
  g.rect(4, f.wallTop, 4, base - 1, trim);
  g.rect(27, f.wallTop, 27, base - 1, trim);
  if (p.wall === 'shiro') g.rect(5, base - 3, 26, base - 1, (x) => (x % 3 === 0 ? 'O' : 'o')); // 腰板

  // 2階建て：階の間に庇（屋根の色）
  const groundTop = f.floor2Bottom === null ? f.wallTop : f.floor2Bottom + 2;
  if (f.floor2Bottom !== null) {
    const y = f.floor2Bottom;
    g.rect(1, y, 30, y, 'k');
    g.rect(1, y + 1, 30, y + 1, (x) => (x === 1 || x === 30 ? 'k' : x % 2 === 0 ? M : L));
    g.rect(2, y + 2, 29, y + 2, 'k');
  }

  // 窓（1階は左右、2階は左右と真ん中）
  const lit = tier === 'city';
  const win = isWestern(p.wall) ? (lit ? WINDOW_WEST_LIT : WINDOW_WEST) : WINDOW_JP;
  const winY1 = groundTop + (f.floor2Bottom === null ? 2 : 3);
  g.stamp(6, winY1, win);
  g.stamp(21, winY1, win);
  if (f.floor2Bottom !== null) {
    g.stamp(6, f.wallTop + 2, win);
    g.stamp(21, f.wallTop + 2, win);
  }

  // 入口（1階の真ん中、地面まで）
  const doorTop = f.floor2Bottom === null ? f.wallTop + 6 : groundTop + 1;
  g.stamp(12, doorTop, doorRows(p.door, base - doorTop));

  // 看板（平屋は軒下、2階建ては2階の真ん中）
  if (p.sign !== 'none') {
    const sy = f.floor2Bottom === null ? f.wallTop - 1 : f.wallTop + 1;
    g.box(11, sy, 19, sy + 6, 'e');
    g.stamp(12, sy + 1, SIGN_ICON[p.sign]);
  }

  // 屋根（軒の行 = 壁のすぐ上）
  drawRoof(g, p.roof, f.wallTop - 1, [L, M, D], tier);

  // ミニチュア（左前・右前。地面にそろえる）
  for (const [kind, x] of [[p.miniLeft, 0], [p.miniRight, 24]] as const) {
    if (kind === 'none') continue;
    const rows = MINI[kind];
    g.stamp(x, f.h - rows.length, rows);
  }

  return g.toDef();
}

function drawRoof(g: Grid, kind: BuildingParts['roof'], eave: number, [L, M, D]: [string, string, string], tier: Tier) {
  const gold = tier === 'city';
  const tile = (x: number) => (x % 3 === 0 ? D : M);
  /** 中心から左右に half だけ広がる1行（端は k） */
  const row = (y: number, half: number, fill: (x: number) => string) => {
    const x0 = 16 - half, x1 = 15 + half;
    for (let x = x0; x <= x1; x++) g.set(x, y, x === x0 || x === x1 ? 'k' : fill(x));
  };
  /** 軒先（いちばん下の2行） */
  const eaves = (half: number) => {
    row(eave - 1, half, () => L);
    row(eave, half, () => (gold ? 'Y' : D));
  };

  switch (kind) {
    case 'gable': {
      const rows = 12;
      for (let i = 0; i < rows - 2; i++) {
        const y = eave - rows + 1 + i;
        const half = Math.min(16, 2 + Math.floor((i * 14) / (rows - 3)));
        row(y, half, i === 0 ? () => 'k' : tile);
      }
      eaves(16);
      if (gold) g.stamp(14, eave - 13, ['.YY.', 'kYYk']);
      break;
    }
    case 'irimoya': {
      // 上の小さな切妻 + 下の大きな屋根（軒先が反る）
      const top = eave - 12;
      for (let i = 0; i < 5; i++) row(top + i, 2 + i, i === 0 ? () => 'k' : tile);
      g.rect(12, top + 5, 19, top + 5, 'k');
      for (let i = 0; i < 5; i++) row(top + 6 + i, 9 + Math.floor(i * 1.5), tile);
      row(eave - 1, 15, () => L);
      row(eave, 14, () => (gold ? 'Y' : D));
      // 反り：両端を一段上げる
      g.set(0, eave - 2, 'k'); g.set(1, eave - 2, L); g.set(31, eave - 2, 'k'); g.set(30, eave - 2, L);
      g.set(0, eave - 1, 'k'); g.set(31, eave - 1, 'k');
      // 鬼瓦
      g.set(13, top - 1, 'k'); g.set(18, top - 1, 'k');
      if (gold) g.stamp(14, top - 2, ['.YY.']);
      break;
    }
    case 'western': {
      // 低い寄棟（洋館）と煙突
      g.box(22, eave - 10, 25, eave - 5, 'r');
      g.rect(22, eave - 11, 25, eave - 11, 'k');
      for (let i = 0; i < 6; i++) {
        const y = eave - 7 + i;
        row(y, 9 + i, i === 0 ? () => 'k' : (x) => ((x + i) % 4 === 0 ? D : M));
      }
      eaves(15);
      if (gold) g.stamp(15, eave - 9, ['YY', 'kk']);
      break;
    }
    case 'tower': {
      // 低い屋根の上に塔と尖り屋根
      for (let i = 0; i < 4; i++) row(eave - 5 + i, 12 + i, i === 0 ? () => 'k' : tile);
      eaves(16);
      const ty = eave - 10;
      g.box(12, ty, 19, eave - 5, 'w');
      g.stamp(14, ty + 1, ['kkkk', 'kcCk', 'kkkk']);
      for (let i = 0; i < 6; i++) row(ty - 6 + i, 1 + Math.floor(i * 0.9), i === 0 ? () => 'k' : tile);
      g.set(15, ty - 7, gold ? 'Y' : 'k'); g.set(16, ty - 7, gold ? 'Y' : 'k');
      break;
    }
  }
}
