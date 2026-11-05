// Sprite generator #4: kura (diary goal) x3 tiers, rubble, and small facilities
// (bench / sakura / stall / teahouse / bathhouse / shrine).
// Writes sprites4.json + preview4.png into this folder. Standalone (helpers copied from gen2/gen3).
// ES module (the project's package.json has "type": "module").
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';
const OUT = path.dirname(fileURLToPath(import.meta.url));

const PALETTE = {
  '.': null,
  k: '#3b2a2e', // outline
  w: '#fffaf0', // white
  x: '#e8e1d5', // pale stone
  a: '#c6bdb1', // stone
  A: '#978d88', // stone shade
  n: '#686072', // dark stone / mortar
  g: '#8cc56a', // grass
  h: '#b6dd7f', // grass light
  j: '#5c9a4e', // grass dark / leaves
  e: '#f3dcae', // cream / straw light
  d: '#d9ae79', // dirt
  D: '#b0845a', // dirt shade
  p: '#e3a96b', // wood light
  o: '#bf7d48', // wood
  O: '#85543a', // wood dark
  y: '#f2cf6b', // straw
  Y: '#cc9b40', // straw shade
  s: '#f0957f', // brick light / cheek
  r: '#c95b4b', // brick / red
  R: '#8e3b3f', // brick shade
  t: '#73a7c6', // slate blue
  T: '#4b7399', // slate shade
  c: '#aee2ee', // glass
  C: '#6db3cd', // glass shade
  q: '#74727d', // asphalt
  Q: '#5c5a66', // asphalt shade
  f: '#f8d2ab', // skin
  F: '#df9f7f', // skin shade
  b: '#7a4b33', // hair
  u: '#ee7b78', // coral (shirt / flowers)
  v: '#6a86c9', // blue (pants / books)
  l: '#ffe590', // warm light
  z: '#fdd8e1', // sakura pale
  Z: '#ef9db5', // sakura deep
};

class G {
  constructor(w, h) { this.w = w; this.h = h; this.a = []; for (let y = 0; y < h; y++) this.a.push(Array(w).fill('.')); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  p(x, y, c) { if (this.in(x, y)) this.a[y][x] = c; }
  g(x, y) { return this.in(x, y) ? this.a[y][x] : '.'; }
  r(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p(x + i, y + j, c); }
  hl(x, y, w, c) { this.r(x, y, w, 1, c); }
  vl(x, y, h, c) { this.r(x, y, 1, h, c); }
  box(x, y, w, h, fill, ol = 'k') { this.r(x, y, w, h, ol); if (w > 2 && h > 2) this.r(x + 1, y + 1, w - 2, h - 2, fill); }
  stamp(x, y, rows) { rows.forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.') this.p(x + i, y + j, c); })); }
  swap(x, y, w, h, from, to) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.g(x + i, y + j) === from) this.p(x + i, y + j, to); }
  outline(c = 'k') {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.a[y][x] !== '.') continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const v = this.g(x + dx, y + dy); return v !== '.' && v !== c; });
      if (n) add.push([x, y]);
    }
    add.forEach(([x, y]) => this.p(x, y, c));
  }
  // shift content down so the lowest drawn row sits at h-2 (outline fills h-1)
  settle() { let last = -1; for (let y = 0; y < this.h; y++) if (this.a[y].some(c => c !== '.')) last = y; const d = this.h - 2 - last; if (d > 0 && last >= 0) { for (let i = 0; i < d; i++) { this.a.pop(); this.a.unshift(Array(this.w).fill('.')); } } }
  rows() { return this.a.map(r => r.join('')); }
}

const S = {};
const def = (name, g) => { S[name] = { w: g.w, h: g.h, rows: g.rows() }; };

// ---------- helpers (copied from gen2 / gen3) ----------
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function win(g, x, y, w, h, o = {}) {
  const glass = o.glass || 'c';
  g.box(x, y, w, h, glass);
  if (glass === 'c') g.hl(x + 1, y + h - 2, w - 2, 'C');
  if (o.bar) g.hl(x + 1, y + (o.barY ?? ((h / 2) | 0)), w - 2, o.barC || 'k');
  if (o.mull) g.vl(x + (o.mullX ?? ((w / 2) | 0)), y + 1, h - 2, o.barC || 'k');
  g.p(x + 1, y + 1, 'w');
  if (h > 5 && glass === 'c') g.p(x + 2, y + 1, 'w'), g.p(x + 1, y + 2, 'w');
}
function trapRoof(g, y0, y1, Ltop, Lbot, fill) {
  for (let y = y0; y <= y1; y++) {
    const L = Math.round(Ltop + (Lbot - Ltop) * (y - y0) / Math.max(1, y1 - y0));
    g.hl(L, y, g.w - 2 * L, fill);
  }
}
function rowSpan(g, y) { let L = -1, R = -1; for (let x = 0; x < g.w; x++) if (g.g(x, y) !== '.') { if (L < 0) L = x; R = x; } return [L, R]; }
function disc(g, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1) g.p(x, y, c);
  }
}
function thatchRoof(g, y0, y1, Ltop, Lbot) {
  trapRoof(g, y0, y1, Ltop, Lbot, 'y');
  for (let y = y0; y <= y1; y++) { const [L, R] = rowSpan(g, y);
    for (let x = L; x <= R; x++) { if (g.g(x, y) !== 'y') continue;
      if ((y - y0) % 3 === 2 && (x + y) % 3 !== 0) g.p(x, y, 'Y'); else if (y === y0 || x <= L + 1) g.p(x, y, 'e'); else if (x >= R - 1) g.p(x, y, 'Y'); } }
  for (let x = Lbot; x < g.w - Lbot; x++) g.p(x, y1, x % 2 ? 'Y' : 'y');
}
function ridge(g, y, L, R) { // dark wooden ridge cap with cross pieces (munagi)
  g.hl(L, y, R - L + 1, 'O'); g.hl(L, y - 1, R - L + 1, 'o'); g.p(L, y - 1, 'p');
  for (let x = L + 2; x < R - 1; x += 4) { g.p(x, y - 2, 'O'); g.p(x + 1, y - 2, 'O'); }
}
function shoji(g, x, y, w, h, o = {}) {
  g.box(x, y, w, h, o.paper || 'w');
  for (let i = x + 1; i < x + w - 1; i++) for (let j = y + 1; j < y + h - 1; j++) if ((i - x) % 3 === 0 || (j - y) % 3 === 0) g.p(i, j, o.grid || 'o');
  if (o.shade) for (let j = y + 1; j < y + h - 1; j++) if (g.g(x + w - 2, j) === (o.paper || 'w')) g.p(x + w - 2, j, 'e');
}
// kawara (tile) roof: vertical tile channels, light top row + left edge
function kawara(g, y0, y1, Ltop, Lbot) {
  trapRoof(g, y0, y1, Ltop, Lbot, 'A');
  for (let y = y0; y <= y1; y++) { const [L, R] = rowSpan(g, y); for (let x = L; x <= R; x++) { if (g.g(x, y) !== 'A') continue; if (y === y0) g.p(x, y, 'a'); else if ((x - L) % 2 === 1) g.p(x, y, 'n'); else if (x <= L + 1) g.p(x, y, 'a'); } }
}
// tiled ridge with upturned ends (onigawara)
function kawaraRidge(g, y, L, R) { g.hl(L + 1, y, R - L - 1, 'n'); g.hl(L + 2, y - 1, R - L - 3, 'k'); g.p(L, y - 1, 'n'); g.p(R, y - 1, 'n'); g.p(L, y - 2, 'k'); g.p(R, y - 2, 'k'); }
// namako-kabe: dark square tiles set diagonally, raised white plaster joints in a diamond lattice
function namako(g, x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const u = ((x - x0) + (y - y0) + 3) % 6, v = (((x - x0) - (y - y0)) % 6 + 6) % 6;
    if (u === 0 || v === 0) g.p(x, y, 'w');
    else if (u === 1 || v === 1) g.p(x, y, 'A'); // lit edge just below each upper joint
    else g.p(x, y, 'n');
  }
}
const TUFT_S = ['h.h', '.j.'];

// ================= kura_village: 土蔵 (earthen storehouse, thatched over-roof) =================
{ const g = new G(32, 32);
  // thatched "oki-yane" (separate roof set over the earthen roof)
  thatchRoof(g, 5, 11, 9, 3);
  ridge(g, 5, 9, 22);
  for (let x = 3; x <= 28; x++) g.p(x, 11, (x % 2) ? 'D' : 'Y');
  g.hl(4, 12, 24, 'k');
  // thick white plaster walls with a raised band (hachimaki) under the eave
  g.r(6, 13, 20, 15, 'w'); g.hl(6, 13, 20, 'x'); g.hl(6, 14, 20, 'a'); g.hl(6, 15, 20, 'x');
  g.vl(24, 16, 12, 'x'); g.vl(25, 13, 15, 'a'); g.vl(6, 13, 15, 'x');
  // weathered patches of earth showing through
  g.stamp(8, 18, ['dD', 'D.']); g.stamp(21, 20, ['.d', 'dD']); g.p(10, 23, 'e');
  // charred-cedar wainscot (koshi-ita)
  g.r(6, 24, 20, 4, 'O'); for (let x = 7; x < 26; x += 3) g.vl(x, 24, 4, 'o'); g.hl(6, 24, 20, 'k');
  // small barred window
  g.box(8, 17, 4, 4, 'Q'); g.vl(9, 18, 2, 'a'); g.vl(10, 18, 2, 'a'); g.p(8, 17, 'x');
  // round vent window
  g.stamp(20, 16, ['.kk.', 'kQak', 'kQQk', '.kk.']);
  // heavy door in a thick, stepped plaster frame
  g.r(12, 16, 8, 12, 'x'); g.vl(12, 16, 12, 'w'); g.hl(12, 16, 8, 'w'); g.vl(19, 17, 11, 'a');
  g.box(13, 18, 6, 10, 'o');
  g.vl(14, 19, 8, 'p'); g.vl(16, 19, 8, 'O');
  g.hl(14, 21, 4, 'n'); g.hl(14, 25, 4, 'n'); g.p(15, 21, 'a'); g.p(15, 25, 'a');
  g.p(17, 23, 'y');
  // stone base + step stone
  g.hl(5, 28, 22, 'a'); g.hl(5, 29, 22, 'A'); for (let x = 6; x < 27; x += 5) { g.p(x, 28, 'x'); g.p(x + 2, 29, 'n'); }
  g.r(12, 30, 8, 1, 'a'); g.p(12, 30, 'x'); g.p(13, 30, 'x');
  // grass tufts at the foot
  g.stamp(2, 29, TUFT_S); g.stamp(27, 29, TUFT_S);
  g.settle(); g.outline(); def('kura_village', g); }

// ================= kura_town: なまこ壁 kura (namako wall, kawara roof, crest) =================
{ const g = new G(32, 40);
  kawara(g, 6, 12, 7, 2); kawaraRidge(g, 5, 6, 25);
  g.hl(1, 12, 30, 'n'); g.hl(2, 13, 28, 'k');
  // upper wall: white plaster, thick eave band
  g.r(4, 14, 24, 11, 'w'); g.hl(4, 14, 24, 'x'); g.hl(4, 15, 24, 'a');
  g.vl(26, 16, 9, 'x'); g.vl(27, 14, 11, 'a');
  // merchant's house mark (yago) painted on the plaster: mountain over a bar (yama-ichi)
  g.stamp(12, 16, ['...kk...', '..kkkk..', '.kk..kk.', 'kk....kk', '........', 'kkkkkkkk']);
  // small windows with thick open shutters
  for (const wx of [6, 22]) { g.box(wx, 18, 4, 4, 'Q'); g.vl(wx + 1, 19, 2, 'a'); g.vl(wx + 2, 19, 2, 'a'); g.p(wx, 18, 'x'); g.r(wx - 1, 18, 1, 4, 'x'); g.r(wx + 4, 18, 1, 4, 'a'); }
  // namako lower wall
  namako(g, 4, 25, 24, 9); g.hl(4, 25, 24, 'x'); g.vl(4, 25, 9, 'w');
  // small tiled hood over the door
  g.hl(10, 22, 12, 'a'); g.hl(9, 23, 14, 'A'); for (let x = 10; x < 22; x += 2) g.p(x, 23, 'n'); g.p(9, 23, 'a'); g.hl(10, 24, 12, 'k');
  // black-lacquered door in a stepped plaster frame
  g.r(11, 25, 10, 9, 'x'); g.vl(11, 25, 9, 'w'); g.vl(20, 25, 9, 'a');
  g.box(12, 26, 8, 8, 'Q'); g.vl(13, 27, 6, 'q'); g.vl(16, 27, 6, 'k'); g.hl(13, 29, 6, 'k'); g.p(15, 31, 'y'); g.p(17, 31, 'y');
  // stone base + steps
  g.hl(3, 34, 26, 'A'); g.hl(3, 35, 26, 'n'); for (let x = 5; x < 28; x += 5) g.p(x, 34, 'a');
  g.r(11, 36, 10, 1, 'a'); g.p(11, 36, 'x'); g.p(12, 36, 'x');
  g.settle(); g.outline(); def('kura_town', g); }

// line helper (Bresenham), optional thickness to the right/below
function line(g, x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;) { g.p(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
// wooden beam: 2px thick line, light on the upper-left side
function beam(g, x0, y0, x1, y1) { line(g, x0 + 1, y0, x1 + 1, y1, 'O'); line(g, x0, y0, x1, y1, 'o'); line(g, x0, y0 - 1, x1, y1 - 1, 'p'); }

// ================= kura_city: 資料館 (modern archive / memorial library-museum) =================
{ const g = new G(32, 40);
  // deep standing-seam metal gable roof: a modern echo of the kura's heavy roof
  trapRoof(g, 7, 13, 8, 1, 'Q');
  for (let y = 7; y <= 13; y++) { const [L, R] = rowSpan(g, y); for (let x = L; x <= R; x++) { if (y === 7 || x <= L + 1) g.p(x, y, 'q'); else if ((x - 1) % 3 === 0) g.p(x, y, 'n'); } }
  g.hl(8, 6, 16, 'k'); g.hl(9, 5, 14, 'n'); g.p(8, 5, 'k'); g.p(23, 5, 'k');
  g.hl(1, 13, 30, 'x'); g.hl(1, 14, 30, 'a'); g.hl(2, 15, 28, 'k');
  // upper volume: white concrete with a namako-motif lattice panel (light)
  g.r(4, 16, 24, 9, 'w'); g.vl(26, 16, 9, 'x'); g.vl(27, 16, 9, 'a'); g.hl(4, 16, 24, 'x');
  g.box(5, 17, 13, 7, 'x');
  for (let y = 18; y < 23; y++) for (let x = 6; x < 17; x++) { const u = (x + y) % 4, v = ((x - y) % 4 + 4) % 4; g.p(x, y, (u === 0 || v === 0) ? 'w' : (u === 1 ? 'a' : 'x')); }
  // tall slit window
  win(g, 20, 17, 6, 7, { mull: true, mullX: 3 }); g.hl(19, 24, 8, 'a');
  // thin projecting floor slab
  g.hl(2, 25, 28, 'x'); g.hl(2, 26, 28, 'A'); g.p(2, 25, 'w');
  // ground floor: glass curtain wall with mullions + entrance
  g.r(4, 27, 24, 8, 'c');
  for (let y = 27; y < 35; y++) for (let x = 4; x < 28; x++) { if ((x - 4) % 5 === 4) g.p(x, y, 'n'); else if (y >= 32) g.p(x, y, 'C'); }
  g.p(5, 28, 'w'); g.p(6, 28, 'w'); g.p(5, 29, 'w'); g.p(10, 28, 'w'); g.p(25, 28, 'w');
  // shelves of archive boxes glimpsed through the glass
  for (const bx of [5, 20]) { g.hl(bx, 31, 4, 'n'); for (let i = 0; i < 4; i++) g.vl(bx + i, 29, 2, 'eyd'[(i + bx) % 3]); }
  // entrance: sliding glass door + warm lobby light
  g.box(12, 28, 8, 7, 'e'); g.hl(13, 29, 6, 'l'); g.vl(16, 29, 5, 'k'); g.p(13, 30, 'w'); g.p(15, 31, 'n'); g.p(17, 31, 'n'); g.hl(13, 33, 6, 'd');
  g.hl(11, 27, 10, 'n');
  // concrete pier at the left with a vertical name plate
  g.r(1, 25, 3, 10, 'a'); g.vl(1, 25, 10, 'x'); g.vl(3, 25, 10, 'A');
  g.r(28, 25, 3, 10, 'a'); g.vl(28, 25, 10, 'x'); g.vl(30, 25, 10, 'A');
  g.box(28, 27, 3, 6, 'w'); g.p(29, 28, 'n'); g.p(29, 30, 'n'); g.p(29, 31, 'n');
  // plinth + wide steps
  g.hl(1, 35, 30, 'A'); g.hl(1, 36, 30, 'n'); g.r(10, 37, 12, 1, 'x'); g.r(9, 38, 14, 1, 'a'); g.p(9, 38, 'x'); g.p(10, 37, 'w');
  g.settle(); g.outline(); def('kura_city', g); }

// ================= rubble: がれき (collapsed building, generic) =================
{ const g = new G(32, 32);
  // ground patch
  disc(g, 15.5, 27, 15, 3.6, 'D'); disc(g, 15.5, 26.5, 14.6, 3.2, 'd');
  // heap of broken plaster + stone under everything
  disc(g, 16, 25, 12, 4, 'A'); disc(g, 15, 24.5, 10.5, 3.2, 'a');
  // a jagged stub of wall still standing (left)
  const top = [15, 14, 16, 17, 16, 19, 21];
  top.forEach((t, i) => { const x = 3 + i; g.vl(x, t, 27 - t, i === 0 ? 'O' : (i >= 5 ? 'a' : 'x')); g.p(x, t, i === 0 ? 'o' : 'w'); });
  g.vl(4, 22, 5, 'O'); g.hl(4, 22, 4, 'O'); g.p(6, 19, 'D'); g.p(5, 24, 'd');
  // a slab of fallen kawara roof, tilted
  for (let i = 0; i < 15; i++) { const x = 10 + i, t = 15 + Math.round(i * 0.4);
    for (let j = 0; j < 5; j++) g.p(x, t + j, j === 0 ? 'a' : (i % 2 ? 'n' : 'A')); g.p(x, t + 5, 'Q'); }
  g.p(10, 15, 'x'); g.p(11, 15, 'x');
  // broken beams poking out at angles
  beam(g, 21, 24, 27, 12); beam(g, 9, 25, 14, 13); beam(g, 13, 27, 26, 25);
  g.stamp(13, 11, ['kp', 'oO']); g.stamp(26, 10, ['kp', 'oO']);
  // rocks and loose tiles in the heap + scattered on the ground
  for (const [sx, sy] of [[8, 26], [17, 23], [24, 24]]) g.stamp(sx, sy, ['xa', 'aA']);
  for (const [sx, sy] of [[2, 27], [27, 27], [19, 29], [10, 29]]) g.stamp(sx, sy, ['an', 'AA']);
  g.p(29, 25, 'A'); g.p(6, 29, 'A');
  // dust puffs
  g.stamp(0, 10, ['.xx.', 'xwxx', '.xa.']); g.stamp(27, 6, ['.x.', 'xwx']); g.p(18, 9, 'x');
  g.settle(); g.outline(); def('rubble', g); }

// small grassy ground patch used under facilities
function lawn(g, cx, cy, rx, ry) {
  disc(g, cx, cy + 0.6, rx, ry, 'j'); disc(g, cx, cy, rx, ry, 'g');
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.g(x, y) === 'g' && g.g(x, y - 1) === '.') g.p(x, y, 'h');
}
// red paper parasol (bangasa / janome): cone canopy with ribs + white ring, bamboo pole
function parasol(g, cx, top, hw, h, poleTo) {
  for (let y = 0; y < h; y++) { const w = Math.round(1 + (hw - 1) * Math.sqrt(y / (h - 1))); g.hl(cx - w, top + y, 2 * w + 1, y === 0 ? 'R' : 'r'); }
  for (let y = 1; y < h; y++) { const [L] = rowSpan(g, top + y); for (let x = 0; x < g.w; x++) if (g.g(x, top + y) === 'r' && x < cx - 1 && x < L + 3 + y / 2) g.p(x, top + y, 's'); }
  for (let i = -hw + 1; i <= hw; i += 4) line(g, cx, top, cx + i, top + h - 1, 'R');
  const ry = top + Math.round(h * 0.45); for (let x = 0; x < g.w; x++) if ('rsR'.includes(g.g(x, ry))) g.p(x, ry, 'w');
  for (let x = cx - hw; x <= cx + hw; x++) if (g.g(x, top + h - 1) !== '.') g.p(x, top + h - 1, (x - cx + hw + 3) % 4 === 0 ? 'R' : 'r');
  g.p(cx, top - 1, 'O');
  g.vl(cx, top + h, poleTo - top - h, 'p'); for (let y = top + h + 2; y < poleTo; y += 4) g.p(cx, y, 'Y');
}
// red felt (mosen) bench
function mosen(g, x, y, w) {
  g.hl(x, y, w, 's'); g.hl(x, y + 1, w, 'r'); g.hl(x, y + 2, w, 'R');
  for (const lx of [x + 1, x + w - 2]) g.vl(lx, y + 3, 2, 'O');
  g.hl(x + 1, y + 4, w - 2, 'O'); g.vl(x + 2, y + 3, 2, 'o');
}

// ================= fac_bench: 縁台 + 番傘 =================
{ const g = new G(32, 32);
  lawn(g, 15.5, 25.5, 14, 4.2);
  g.stamp(3, 25, TUFT_S); g.stamp(26, 27, TUFT_S); g.p(9, 28, 'd'); g.p(22, 24, 'd');
  // stepping stone
  g.stamp(12, 28, ['xaaA', '.AA.']);
  mosen(g, 4, 21, 20);
  // tea cup + tri-colour dango on the bench
  g.stamp(7, 19, ['kwwk', 'kwxk']); g.p(8, 18, 'w');
  g.stamp(11, 20, ['zZwwgj']); g.p(17, 20, 'o');
  parasol(g, 20, 4, 11, 8, 26);
  g.settle(); g.outline(); def('fac_bench', g); }

// ================= fac_sakura: 桜 in full bloom =================
{ const g = new G(32, 32);
  lawn(g, 15.5, 26.5, 14.5, 4);
  // trunk + roots + main branches
  g.r(14, 14, 4, 13, 'O'); g.vl(14, 14, 13, 'o'); g.vl(17, 15, 12, 'b'); g.stamp(12, 25, ['oO......Ob', '.oO....Ob.']);
  line(g, 14, 16, 8, 11, 'O'); line(g, 17, 15, 23, 10, 'b'); line(g, 15, 14, 14, 7, 'O');
  // blossom crown: clustered puffs
  const puffs = [[9, 10, 6, 4.6], [22, 9, 6.5, 5], [15.5, 6, 7, 4.8], [26, 15, 4.5, 3.6], [5, 15, 4.5, 3.5], [16, 13, 7, 4], [20, 15, 5, 3], [11, 15, 5, 3]];
  for (const [x, y, rx, ry] of puffs) disc(g, x, y, rx, ry, 'z');
  const R = rng(7);
  for (let y = 0; y < 21; y++) for (let x = 0; x < 32; x++) { if (g.g(x, y) !== 'z') continue;
    const below = g.g(x, y + 1) === '.' || g.g(x, y + 1) === 'O' || g.g(x, y + 1) === 'b' || g.g(x + 1, y) === '.';
    const above = g.g(x, y - 1) === '.' || g.g(x - 1, y) === '.';
    if (below && !above) g.p(x, y, 'Z'); else if (above && (x + y) % 2 === 0 && y < 12) g.p(x, y, 'w');
    else { const v = R(); if (v < 0.13) g.p(x, y, 'Z'); else if (v < 0.2) g.p(x, y, 'w'); } }
  // let a little bark show between blossoms
  g.p(10, 16, 'O'); g.p(21, 13, 'b'); g.p(15, 10, 'O');
  // fallen petals on the grass
  for (const [x, y, c] of [[4, 26, 'z'], [7, 28, 'Z'], [11, 27, 'z'], [20, 28, 'z'], [24, 26, 'Z'], [27, 28, 'z'], [18, 26, 'w'], [9, 25, 'w'], [2, 28, 'Z'], [25, 23, 'z'], [6, 21, 'z']]) g.p(x, y, c);
  g.settle(); g.outline(); def('fac_sakura', g); }

// ================= fac_stall: 屋台 (noren + red lantern) =================
{ const g = new G(32, 32);
  // plank roof with a front eave
  trapRoof(g, 5, 8, 6, 3, 'o');
  for (let y = 5; y <= 8; y++) { const [L, R] = rowSpan(g, y); for (let x = L; x <= R; x++) { if (y === 5 || x <= L) g.p(x, y, 'p'); else if ((x - L) % 4 === 0) g.p(x, y, 'O'); } }
  g.hl(3, 9, 26, 'O'); g.hl(4, 10, 24, 'k');
  // sign board on the roof
  g.box(11, 2, 10, 4, 'w'); g.hl(12, 3, 8, 'w'); g.stamp(13, 3, ['r.r.r.r']); g.vl(12, 4, 1, 'x'); g.p(19, 4, 'x');
  // posts
  for (const px of [5, 26]) { g.vl(px, 11, 11, 'O'); }
  g.vl(5, 11, 11, 'o');
  // dark interior with steaming pot + bowls on the shelf
  g.r(6, 11, 20, 8, 'Q'); g.hl(6, 11, 20, 'q');
  g.stamp(9, 16, ['nAAAAn', 'nnAAnn']); g.stamp(10, 14, ['w..w', '.w..']); g.stamp(19, 17, ['wxw.wx']);
  // indigo noren with white marks
  g.hl(6, 11, 20, 'O');
  for (let i = 0; i < 4; i++) { const nx = 6 + i * 5; g.r(nx, 12, 4, 4, 'v'); g.vl(nx + 3, 12, 4, 'T'); g.hl(nx, 15, 4, 'T'); g.stamp(nx + 1, 12, ['ww', 'w.']); }
  // counter
  g.hl(3, 19, 26, 'p'); g.hl(3, 20, 26, 'o'); g.p(3, 19, 'e');
  // cart body
  g.r(5, 21, 22, 5, 'o'); for (let x = 6; x < 26; x += 4) g.vl(x, 21, 5, 'O'); g.vl(5, 21, 5, 'p'); g.hl(5, 25, 22, 'O');
  // red paper lantern hanging from the eave
  g.vl(28, 10, 1, 'k');
  g.stamp(26, 11, ['.kkk.', 'srrrr', 'srwrR', 'RRRRR', 'srrrR', 'srrRR', '.kkk.']);
  // wheel + leg
  disc(g, 20, 27, 3.4, 3.4, 'O'); disc(g, 20, 27, 2.2, 2.2, 'o'); g.p(20, 27, 'O'); g.p(19, 25, 'p');
  g.vl(7, 26, 3, 'O'); g.vl(8, 26, 3, 'o');
  // stool
  g.stamp(1, 25, ['pppo', 'O..O', 'O..O']);
  g.settle(); g.outline(); def('fac_stall', g); }

// ================= fac_teahouse: 茶屋 (red bench, 茶 banner, noren) =================
{ const g = new G(32, 32);
  lawn(g, 15.5, 27, 15, 3.2);
  // small thatched roof
  thatchRoof(g, 5, 11, 8, 2);
  ridge(g, 5, 8, 23);
  for (let x = 2; x <= 29; x++) g.p(x, 11, (x % 2) ? 'D' : 'Y');
  g.hl(3, 12, 26, 'k');
  // earthen walls + posts
  g.r(4, 13, 24, 12, 'e'); g.hl(4, 13, 24, 'O'); for (const x of [4, 14, 27]) g.vl(x, 13, 12, 'O');
  // open front with green noren (abstract 茶 mark)
  g.r(5, 14, 9, 11, 'Q'); g.hl(6, 22, 7, 'D'); g.stamp(9, 19, ['.w.', 'wxw']);
  g.r(5, 14, 9, 4, 'j'); g.hl(5, 14, 9, 'g'); g.vl(9, 15, 3, 'k'); g.stamp(6, 15, ['wwk', '.wk']); g.stamp(10, 15, ['www', '.w.']);
  // shoji window
  shoji(g, 16, 15, 9, 7, { shade: true });
  g.hl(15, 22, 12, 'O'); g.hl(15, 23, 12, 'o'); g.hl(15, 24, 12, 'O');
  // stone base
  g.hl(3, 25, 26, 'a'); g.hl(3, 26, 26, 'A'); for (let x = 5; x < 29; x += 5) g.p(x, 25, 'x');
  // red felt bench in front
  mosen(g, 15, 24, 12);
  g.stamp(17, 22, ['kwk']); g.p(18, 21, 'w');
  // 茶 nobori banner on a bamboo pole
  g.vl(1, 3, 25, 'p'); g.vl(2, 3, 25, 'Y'); g.hl(1, 3, 6, 'O');
  g.r(3, 4, 4, 13, 'w'); g.vl(6, 4, 13, 'x'); g.stamp(3, 6, ['r.r', 'rrr', '.r.', 'rrr', 'r.r']); g.hl(3, 16, 4, 'r'); g.stamp(3, 13, ['j.j']);
  g.settle(); g.outline(); def('fac_teahouse', g); }

// ================= fac_bathhouse: 銭湯 (karahafu gable, tall chimney, ゆ noren) =================
{ const g = new G(32, 40);
  // tall chimney (behind) with a puff of steam
  g.r(25, 3, 4, 18, 'a'); g.vl(25, 3, 18, 'x'); g.vl(28, 3, 18, 'A');
  g.hl(24, 2, 6, 'n'); g.hl(24, 3, 6, 'A'); for (const y of [8, 14]) g.hl(25, y, 4, 'n');
  g.vl(26, 9, 4, 'w'); g.vl(27, 9, 4, 'x'); g.p(26, 10, 'r'); g.p(26, 12, 'r'); // painted name band
  g.stamp(19, 0, ['.xx..', 'xwwx.', '.xxwx']);
  // main kawara roof
  kawara(g, 15, 20, 6, 1); kawaraRidge(g, 14, 5, 26);
  g.hl(0, 20, 32, 'n'); g.hl(1, 21, 30, 'k');
  // karahafu: rounded crown, steep shoulders, flared and slightly upturned tips
  const KP = [0, 0, 1, 1, 2, 3, 5, 7, 8, 8, 7]; // drop from the crown by distance from centre
  const prof = x => 9 + KP[Math.min(10, Math.abs(x * 2 - 31) >> 1)];
  for (let x = 5; x <= 26; x++) { const t = prof(x);
    g.vl(x, t + 3, Math.max(0, 22 - t - 3), 'e');                                  // plaster gable face
    g.p(x, t - 1, 'n'); g.p(x, t, x % 2 ? 'a' : 'n'); g.p(x, t + 1, x % 2 ? 'A' : 'n'); // tiles
    g.p(x, t + 2, 'p'); g.p(x, t + 3, 'o'); g.p(x, t + 4, 'O');                      // barge board
  }
  g.p(4, prof(5) + 1, 'O'); g.p(27, prof(26) + 1, 'O');
  // gable face: tie beam, struts and a hanging gegyo ornament
  g.hl(7, 19, 18, 'O'); g.hl(7, 18, 18, 'o');
  for (const x of [10, 21]) g.vl(x, prof(x) + 5, 18 - prof(x) - 5, 'O');
  g.stamp(14, 13, ['.yy.', 'yllY', '.YY.']); g.vl(15, 16, 2, 'Y'); g.vl(16, 16, 2, 'Y');
  g.hl(5, 21, 22, 'O');
  // facade: plaster upper band, wooden lower walls
  g.r(3, 22, 26, 13, 'o'); g.vl(3, 22, 13, 'O'); g.vl(28, 22, 13, 'O');
  g.hl(4, 22, 24, 'x'); g.hl(4, 23, 24, 'a'); g.hl(4, 24, 24, 'O');
  for (const x of [4, 9, 22, 27]) g.vl(x, 25, 10, 'p');
  // side lattice windows
  for (const wx of [5, 23]) { g.box(wx, 26, 4, 6, 'l'); g.vl(wx + 1, 27, 4, 'O'); g.vl(wx + 2, 27, 4, 'e'); g.hl(wx + 1, 29, 2, 'O'); }
  // entrance with two noren: indigo (男) and red (女), each with an abstract ゆ
  g.box(10, 25, 12, 10, 'Q'); g.hl(11, 33, 10, 'D'); g.hl(9, 25, 14, 'O');
  g.r(11, 26, 5, 5, 'v'); g.hl(11, 26, 5, 'T'); g.vl(15, 27, 4, 'T');
  g.r(16, 26, 5, 5, 'r'); g.hl(16, 26, 5, 'R'); g.vl(20, 27, 4, 'R');
  for (const nx of [11, 16]) g.stamp(nx, 27, ['.w.w.', 'w.w..', 'w...w', '.www.']); // steam-over-tub bath mark
  g.p(13, 32, 'l'); g.p(18, 32, 'l');
  // stone base + step + wooden geta box
  g.hl(2, 35, 28, 'A'); g.hl(2, 36, 28, 'n'); for (let x = 4; x < 29; x += 5) g.p(x, 35, 'a');
  g.r(9, 37, 14, 1, 'a'); g.p(9, 37, 'x'); g.p(10, 37, 'x');
  g.stamp(0, 31, ['.hj', 'hgj', 'jjg', 'OoO']);
  g.settle(); g.outline(); def('fac_bathhouse', g); }

// ================= fac_shrine: 神社 (small shrine framed by a red torii, shimenawa) =================
{ const g = new G(32, 32);
  lawn(g, 15.5, 27, 15, 3.4);
  // stone path to the torii
  g.stamp(12, 28, ['xaaaaaA.', '.xaaaaaA']);
  // --- shrine (behind) ---
  // hiwada (cypress bark) roof with upswept eaves
  trapRoof(g, 8, 14, 10, 3, 'o');
  for (let y = 8; y <= 14; y++) { const [L, R] = rowSpan(g, y); for (let x = L; x <= R; x++) { if (y === 8 || x <= L + 1) g.p(x, y, 'p'); else if (y === 14) g.p(x, y, 'O'); else if (x >= R - 1 || (y - 8) % 3 === 2) g.p(x, y, 'O'); } }
  g.p(2, 13, 'p'); g.p(29, 13, 'O'); g.p(2, 12, 'k'); g.p(29, 12, 'k');
  // body: vermilion posts, white walls, lattice doors
  g.r(9, 15, 14, 9, 'w'); g.vl(9, 15, 9, 'r'); g.vl(22, 15, 9, 'R'); g.vl(15, 15, 9, 'r'); g.vl(16, 15, 9, 'R');
  g.box(10, 18, 5, 5, 'O'); g.box(17, 18, 5, 5, 'O'); g.p(12, 20, 'o'); g.p(19, 20, 'o'); g.p(11, 19, 'o'); g.p(18, 19, 'o');
  // shimenawa (thick twisted straw rope, sagging) with zigzag shide
  for (let x = 9; x <= 22; x++) { const sag = (x > 11 && x < 20) ? 1 : 0; g.p(x, 15 + sag, (x % 3 === 0) ? 'Y' : 'y'); g.p(x, 16 + sag, (x % 3 === 1) ? 'Y' : 'e'); if (sag) g.p(x, 15, 'k'); }
  for (const sx of [11, 19]) g.stamp(sx, 18, ['ww', '.w', 'ww', '.w']);
  // bell + bell rope + offering box
  g.stamp(15, 17, ['yY', 'rw', 'wr', 'rw']);
  g.box(13, 22, 6, 2, 'o'); g.hl(14, 22, 4, 'p');
  // raised stone base
  g.hl(8, 24, 16, 'a'); g.hl(8, 25, 16, 'A'); g.p(8, 24, 'x');
  // --- torii (front) ---
  // kasagi (black top beam, upturned ends) + red shimaki beneath
  g.hl(2, 1, 28, 'k'); g.hl(1, 0, 3, 'k'); g.hl(28, 0, 3, 'k'); g.hl(4, 0, 24, 'n');
  g.hl(3, 2, 26, 'r'); g.hl(3, 2, 3, 's'); g.p(28, 2, 'R');
  // gakuzuka + plaque
  g.box(14, 3, 4, 4, 'y'); g.vl(15, 4, 2, 'O'); g.vl(16, 4, 2, 'O');
  // nuki (tie beam)
  g.hl(3, 6, 26, 'r'); g.hl(3, 7, 26, 'R'); g.p(3, 6, 's');
  // pillars with black bases
  for (const px of [5, 25]) { g.vl(px, 3, 24, 's'); g.vl(px + 1, 3, 24, 'R'); g.r(px, 25, 2, 2, 'k'); g.hl(px - 1, 27, 4, 'A'); }
  g.settle(); g.outline(); def('fac_shrine', g); }

// ---------- validate ----------
const SIZES = {
  kura_village: [32, 32], kura_town: [32, 40], kura_city: [32, 40], rubble: [32, 32],
  fac_bench: [32, 32], fac_sakura: [32, 32], fac_stall: [32, 32], fac_teahouse: [32, 32], fac_bathhouse: [32, 40], fac_shrine: [32, 32],
};
const NAMES = Object.keys(SIZES);
const STRICT = !process.argv.includes('--partial');
let bad = 0;
for (const [n, s] of Object.entries(S)) {
  if (!SIZES[n]) { console.log('UNEXPECTED', n); bad++; continue; }
  if (s.w !== SIZES[n][0] || s.h !== SIZES[n][1]) { console.log('SIZE', n, s.w, s.h); bad++; }
  if (s.rows.length !== s.h) { console.log('H', n, s.rows.length); bad++; }
  s.rows.forEach((r, i) => { if (r.length !== s.w) { console.log('W', n, i, r.length); bad++; } [...r].forEach(c => { if (!(c in PALETTE)) { console.log('C', n, i, c); bad++; } }); });
  if (!/[^.]/.test(s.rows[s.h - 1])) { console.log('EMPTY BOTTOM ROW', n); bad++; }
}
const missing = NAMES.filter(n => !S[n]);
if (missing.length && STRICT) bad++;
console.log('sprites', Object.keys(S).length, '/', NAMES.length, 'missing:', missing.join(',') || 'none', 'bad', bad, bad ? 'VALIDATION FAILED' : 'VALIDATION OK');
for (const [n, s] of Object.entries(S)) console.log(' ', n, s.w + 'x' + s.h);
if (bad) process.exit(1);

// ---------- emit JSON ----------
const outJ = {}; for (const n of NAMES) if (S[n]) outJ[n] = S[n];
fs.writeFileSync(path.join(OUT, 'sprites4.json'), JSON.stringify(outJ, null, 1));

// ---------- preview PNG ----------
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function makePNG(W, H, px) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; const p = px[y * W + x]; raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2]; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// reference sprites (read-only): lib_town from redraw.json (fallback ../sprites.js), bank_town from new-sprites.json
const refRow = [];
const readJ = f => { try { return JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); } catch (e) { return {}; } };
const rd = readJ('redraw.json'), ns = readJ('new-sprites.json');
let lib = rd.lib_town;
if (!lib) { try { const src = fs.readFileSync(path.join(OUT, '..', 'sprites.js'), 'utf8'); lib = new Function(src + '; return SPRITES;')().lib_town; } catch (e) { /* none */ } }
if (lib) refRow.push(['lib_town', lib]);
if (ns.bank_town) refRow.push(['bank_town', ns.bank_town]);
const SC = +(process.argv.find(a => /^\d+$/.test(a)) || 4), PAD = 8;
const mine = NAMES.filter(n => S[n]).map(n => [n, S[n]]);
const groups = [mine.slice(0, 4), mine.slice(4, 8), [...mine.slice(8), ...refRow]].filter(r => r.length);
let W = 0, H = PAD; const pos = [];
for (const row of groups) { let x = PAD; for (const [n, s] of row) { pos.push([n, s, x, H + (40 - s.h) * SC]); x += s.w * SC + PAD; } W = Math.max(W, x); H += 40 * SC + PAD; }
const px = Array.from({ length: W * H }, () => [246, 239, 224]);
for (const [n, s, ox, oy] of pos) s.rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === '.') return; const col = hex(PALETTE[c]); for (let b = 0; b < SC; b++) for (let a = 0; a < SC; a++) px[(oy + j * SC + b) * W + ox + i * SC + a] = col; }));
fs.writeFileSync(path.join(OUT, 'preview4.png'), makePNG(W, H, px));
console.log('preview4', W, H);
