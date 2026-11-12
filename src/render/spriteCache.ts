// スプライトを一度だけ小さなキャンバスに描いてキャッシュする（毎フレーム描き直さない）
import { customSpriteFromName } from './customBuilding';
import { PALETTE, SPRITES, type SpriteDef } from './spriteData';
import { TERRAIN_SPRITES } from './terrainSprites';

const customDefs = new Map<string, SpriteDef | null>();

/** 用意したスプライト、または自分で作った建物（名前から組み立てる） */
function spriteDef(name: string): SpriteDef | undefined {
  const fixed = SPRITES[name] ?? TERRAIN_SPRITES[name];
  if (fixed) return fixed;
  if (!customDefs.has(name)) customDefs.set(name, customSpriteFromName(name));
  return customDefs.get(name) ?? undefined;
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export interface SpriteVariant {
  faded?: boolean;
  /** 色の差し替え（住民の見た目用）。キャッシュのキーにも使う */
  swap?: Record<string, string>;
  swapKey?: string;
  /** この文字の画素だけを、この色で描く（夜の窓明かり用）。キャッシュのキーは swapKey に含める */
  only?: Record<string, string>;
}

const cache = new Map<string, HTMLCanvasElement>();

export function getSprite(name: string, v: SpriteVariant = {}): HTMLCanvasElement | null {
  const def = spriteDef(name);
  if (!def) return null;
  const key = `${name}|${v.faded ? 1 : 0}|${v.swapKey ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const cv = document.createElement('canvas');
  cv.width = def.w;
  cv.height = def.h;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(def.w, def.h);
  for (let y = 0; y < def.h; y++) {
    const row = def.rows[y] ?? '';
    for (let x = 0; x < def.w; x++) {
      const ch = row[x] ?? '.';
      if (v.only && !(ch in v.only)) continue;
      const hex = v.only?.[ch] ?? v.swap?.[ch] ?? PALETTE[ch];
      if (!hex) continue;
      const [r, g, b] = hexToRgb(hex);
      const o = (y * def.w + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  if (v.faded) applyFaded(img, name);
  ctx.putImageData(img, 0, 0);
  cache.set(key, cv);
  return cv;
}

// 名前から決まる乱数（さびれの模様が毎回同じになるように）
function seeded(str: string): () => number {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** さびれ：色あせ・ほこり・くもの巣・つる */
function applyFaded(img: ImageData, name: string): void {
  const { width: w, height: h, data: d } = img;
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3]! > 0;
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const o = (y * w + x) * 4;
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  };
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const gray = 0.3 * d[i]! + 0.59 * d[i + 1]! + 0.11 * d[i + 2]!;
    d[i] = Math.round((d[i]! * 0.3 + gray * 0.7) * 0.85 + 8);
    d[i + 1] = Math.round((d[i + 1]! * 0.3 + gray * 0.7) * 0.85 + 4);
    d[i + 2] = Math.round((d[i + 2]! * 0.3 + gray * 0.7) * 0.85);
  }
  const rnd = seeded(name);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (opaque(x, y) && rnd() < 0.06) set(x, y, 138, 127, 116);
  let top = 0;
  while (top < h && !Array.from({ length: w }, (_, x) => opaque(x, top)).some(Boolean)) top++;
  const web = ['x...x', '.x.x.', '..x..', '.x.x.', 'x...x'];
  const wx = w - 9;
  const wy = Math.min(h - 6, top + 6);
  web.forEach((row, j) => [...row].forEach((c, i) => {
    if (c === 'x' && opaque(wx + i, wy + j)) set(wx + i, wy + j, 222, 216, 206);
  }));
  for (const startX of [1, w - 3]) {
    let x = startX;
    for (let k = 0; k < Math.floor(h / 3); k++) {
      const y = h - 2 - k;
      if (rnd() < 0.35) x += rnd() < 0.5 ? -1 : 1;
      x = Math.max(0, Math.min(w - 1, x));
      if (opaque(x, y)) {
        if (k % 3 === 0) set(x, y, 140, 197, 106);
        else set(x, y, 92, 154, 78);
      }
    }
  }
}

export function spriteSize(name: string): { w: number; h: number } | null {
  const def = spriteDef(name);
  return def ? { w: def.w, h: def.h } : null;
}
