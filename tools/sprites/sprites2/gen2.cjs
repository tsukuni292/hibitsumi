// Sprite generator #2: bank / news / school / plaza (3 tiers each).
// Writes new-sprites.json + preview2.png into this folder. Standalone (copies helpers from ../gen.js).
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const OUT = __dirname;

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

function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

class G {
  constructor(w, h) { this.w = w; this.h = h; this.a = []; for (let y = 0; y < h; y++) this.a.push(Array(w).fill('.')); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  p(x, y, c) { if (this.in(x, y)) this.a[y][x] = c; }
  pw(x, y, c) { this.p(((x % this.w) + this.w) % this.w, ((y % this.h) + this.h) % this.h, c); }
  g(x, y) { return this.in(x, y) ? this.a[y][x] : '.'; }
  r(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p(x + i, y + j, c); }
  hl(x, y, w, c) { this.r(x, y, w, 1, c); }
  vl(x, y, h, c) { this.r(x, y, 1, h, c); }
  box(x, y, w, h, fill, ol = 'k') { this.r(x, y, w, h, ol); if (w > 2 && h > 2) this.r(x + 1, y + 1, w - 2, h - 2, fill); }
  stamp(x, y, rows, wrap = false) { rows.forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.') (wrap ? this.pw : this.p).call(this, x + i, y + j, c); })); }
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

// ---------- helpers (copied from gen.js) ----------
const TUFT_S = ['h.h', '.j.'];
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

// ---------- new helpers ----------
// gold coin with dark rim, top-left light, bottom-right shade, optional square hole
function coin(g, cx, cy, r, o = {}) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r) continue;
    if (d > r - 1) { g.p(x, y, o.rim || 'k'); continue; }
    const s = (x - cx) + (y - cy);
    g.p(x, y, s < -r * 0.55 ? 'l' : s > r * 0.45 ? 'Y' : 'y');
  }
  if (o.hole) { const hx = Math.floor(cx), hy = Math.floor(cy); g.r(hx - 1, hy - 1, 4, 4, 'Y'); g.hl(hx - 1, hy - 1, 4, 'y'); g.p(hx - 1, hy, 'y'); g.r(hx, hy, 2, 2, 'k'); }
  if (o.mark) { // little 'value' mark: vertical bar with serifs
    const mx = Math.round(cx - 0.5), my = Math.round(cy - 0.5);
    g.vl(mx, my - 1, 3, 'Y'); g.vl(mx + 1, my - 1, 3, 'Y'); g.p(mx, my - 1, 'O'); g.p(mx + 1, my - 1, 'O');
  }
}
function disc(g, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1) g.p(x, y, c);
  }
}
// shingled roof shading (house_town style) over the current roof rows
function shadeRoof(g, y0, y1, base, light, dark, skip) {
  for (let y = y0; y <= y1; y++) { const [L, R] = rowSpan(g, y);
    for (let x = L; x <= R; x++) { if (g.g(x, y) !== base) continue; if (skip && skip(x, y)) continue;
      if ((y - y0) % 3 === 2) g.p(x, y, dark); else if ((y - y0) % 3 === 1 && (x + y) % 4 === 0) g.p(x, y, dark);
      else if (y === y0 || x <= L + 1) g.p(x, y, light);
      else if (x >= R - 1) g.p(x, y, dark); } }
}

// ================= BANK 銀行 =================
// thatched (kayabuki) roof, house_village shading, with dark ridge cap
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
// shoji / lattice window: paper 'w' with wooden grid
function shoji(g, x, y, w, h, o = {}) {
  g.box(x, y, w, h, o.paper || 'w');
  for (let i = x + 1; i < x + w - 1; i++) for (let j = y + 1; j < y + h - 1; j++) if ((i - x) % 3 === 0 || (j - y) % 3 === 0) g.p(i, j, o.grid || 'o');
  if (o.shade) for (let j = y + 1; j < y + h - 1; j++) if (g.g(x + w - 2, j) === (o.paper || 'w')) g.p(x + w - 2, j, 'e');
}

// ---- bank_village: thatched ryogae-ya (money changer) with coin sign + noren ----
{ const g = new G(32, 32);
  thatchRoof(g, 5, 14, 8, 2);
  ridge(g, 5, 8, 23);
  // coin-shaped signboard standing on the ridge
  g.r(11, 9, 2, 5, 'O'); g.r(19, 9, 2, 5, 'O'); g.vl(11, 9, 5, 'o'); g.vl(19, 9, 5, 'o');
  disc(g, 15.5, 7, 6.4, 6.4, 'O'); disc(g, 15.5, 7, 6.4, 6.4, 'O'); for (let y = 0; y < 14; y++) for (let x = 8; x < 24; x++) if (g.g(x, y) === 'O' && (x - 15.5) + (y - 7) < -5) g.p(x, y, 'o');
  coin(g, 15.5, 7, 5.4, { hole: true });
  g.hl(2, 15, 28, 'k');
  // plank wall
  g.r(4, 16, 24, 12, 'p');
  for (let x = 4; x < 28; x++) if (x % 4 === 3) g.vl(x, 16, 12, 'o');
  g.hl(4, 16, 24, 'o'); g.vl(4, 16, 12, 'O'); g.vl(27, 16, 12, 'O'); g.vl(26, 17, 11, 'o');
  // exchange counter (left): small wooden eave, lattice, coins + scale pans on the counter
  g.r(5, 17, 11, 2, 'o'); g.hl(5, 17, 11, 'p'); g.hl(5, 19, 11, 'O'); g.hl(4, 16, 13, 'k');
  g.box(6, 20, 9, 6, 'O'); g.hl(7, 21, 7, 'D');
  for (let x = 7; x < 14; x += 2) g.vl(x, 21, 2, 'O');
  g.stamp(7, 23, ['yy.l..', 'YYkyy.', 'yyl.YY']); g.stamp(12, 22, ['.k', 'kY']);
  g.hl(5, 25, 11, 'p'); g.hl(5, 26, 11, 'O'); g.p(5, 25, 'e');
  // door with indigo noren bearing a white coin mark (right)
  g.box(18, 18, 7, 10, 'O'); g.vl(19, 19, 9, 'o');
  g.r(18, 18, 7, 5, 'v'); g.hl(18, 18, 7, 'k'); g.vl(21, 19, 4, 'T'); g.hl(18, 19, 7, 'T');
  g.stamp(20, 20, ['.w.', 'wvw', '.w.']); g.vl(21, 22, 1, 'T');
  g.p(22, 25, 'l');
  // stone foundation + step
  g.hl(4, 28, 24, 'a'); g.hl(4, 29, 24, 'A'); for (let x = 6; x < 28; x += 5) { g.p(x, 28, 'n'); g.p(x + 2, 29, 'n'); }
  g.r(17, 30, 9, 1, 'a'); g.p(17, 30, 'x'); g.p(18, 30, 'x');
  g.outline(); def('bank_village', g); }

// ---- bank_town: stone bank, columns + gold coin in pediment ----
{ const g = new G(32, 40);
  // kawara (tile) hipped roof with upturned ridge ends
  trapRoof(g, 5, 12, 6, 1, 'A');
  for (let y = 5; y <= 12; y++) { const [L, R] = rowSpan(g, y); for (let x = L; x <= R; x++) { if (y === 5) g.p(x, y, 'a'); else if ((x - L) % 2 === 1) g.p(x, y, 'n'); else if (x <= L + 1) g.p(x, y, 'a'); } }
  g.hl(6, 4, 20, 'n'); g.hl(7, 3, 18, 'k'); g.p(5, 3, 'n'); g.p(26, 3, 'n'); g.p(5, 2, 'k'); g.p(26, 2, 'k');
  // stone gable with gold coin emblem
  for (let y = 1; y <= 12; y++) { const half = Math.round((y - 1) * 0.75) + 1; g.hl(16 - half, y, half * 2, 'x'); g.p(15 + half, y, 'a'); g.p(16 - half - 1, y, 'k'); g.p(16 + half, y, 'k'); }
  g.hl(15, 0, 2, 'k');
  coin(g, 15.5, 8.5, 3.6);
  g.vl(15, 7, 3, 'Y'); g.p(16, 7, 'Y'); g.p(16, 9, 'Y');
  // cornice + frieze
  g.hl(1, 13, 30, 'k'); g.hl(1, 14, 30, 'x'); g.hl(1, 15, 30, 'a'); g.hl(2, 16, 28, 'k');
  g.r(3, 17, 26, 3, 'x'); g.hl(3, 19, 26, 'a'); for (let x = 4; x < 28; x += 2) g.p(x, 19, 'A');
  g.p(3, 17, 'w');
  g.r(10, 17, 12, 2, 'y'); g.hl(10, 18, 12, 'Y'); g.p(10, 17, 'l'); g.p(11, 17, 'l');
  g.hl(3, 20, 26, 'k');
  // recessed portico wall
  g.r(3, 21, 26, 12, 'A'); g.hl(3, 21, 26, 'n'); g.vl(3, 21, 12, 'a');
  // windows between outer columns
  for (const wx of [7, 21]) { win(g, wx, 23, 4, 8, { bar: true, barY: 4 }); g.p(wx + 2, 24, 'c'); }
  // door
  g.box(13, 23, 6, 10, 'O'); g.hl(14, 23, 4, 'l'); g.vl(15, 24, 9, 'k'); g.vl(16, 24, 9, 'k'); g.vl(14, 24, 9, 'o'); g.p(14, 28, 'l'); g.p(17, 28, 'l');
  // columns
  for (const cx of [4, 10, 19, 25]) {
    g.r(cx - 1, 21, 5, 1, 'x'); g.p(cx - 1, 21, 'w'); g.p(cx + 3, 21, 'a'); g.hl(cx - 1, 22, 5, 'k');
    g.r(cx, 23, 3, 9, 'x'); g.vl(cx, 23, 9, 'w'); g.vl(cx + 2, 23, 9, 'a'); g.vl(cx - 1, 23, 9, 'k'); g.vl(cx + 3, 23, 9, 'k');
    g.r(cx - 1, 32, 5, 1, 'a'); g.p(cx - 1, 32, 'x');
  }
  // stylobate + steps
  g.hl(2, 33, 28, 'x'); g.hl(2, 34, 28, 'A');
  g.hl(2, 35, 28, 'k');
  g.hl(3, 36, 26, 'a'); g.hl(2, 37, 28, 'x'); g.hl(1, 38, 30, 'a'); g.p(1, 38, 'x');
  g.hl(10, 36, 12, 'x'); g.hl(9, 37, 14, 'w');
  g.outline(); def('bank_town', g); }

// ---- bank_city: modern bank tower, dark glass + gold trim, coin crown ----
{ const g = new G(32, 40);
  // rooftop coin sign on a frame
  g.r(14, 8, 4, 2, 'n'); g.vl(14, 8, 2, 'A');
  coin(g, 15.5, 4.5, 4.6, { mark: true });
  // setback crown
  g.r(7, 10, 18, 3, 'Y'); g.hl(7, 10, 18, 'y'); g.hl(7, 12, 18, 'k'); g.vl(7, 10, 2, 'l');
  // tower body
  g.r(3, 13, 26, 24, 'n');
  g.hl(3, 13, 26, 'y'); g.hl(3, 14, 26, 'Y');
  const floors = [15, 20, 25];
  floors.forEach((fy, fi) => {
    g.r(4, fy, 19, 4, 't'); g.hl(4, fy + 3, 19, 'T');
    for (let x = 4; x < 23; x++) for (let y = fy; y < fy + 4; y++) if ((x - y + fi * 4) % 8 === 0) g.p(x, y, 'c');
    for (let x = 7; x < 23; x += 4) g.vl(x, fy, 4, 'k');
    g.hl(3, fy + 4, 20, 'Y');
    for (let y = fy; y < fy + 4; y++) { g.p(24, y, 'T'); g.p(25, y, (y - fy) % 2 ? 'T' : 't'); g.p(26, y, 'T'); g.p(27, y, 'Q'); }
  });
  g.vl(3, 13, 24, 'q');
  g.vl(23, 13, 24, 'k');
  // stone base with gold canopy entrance
  g.r(3, 30, 26, 7, 'a'); g.hl(3, 30, 26, 'x'); g.vl(3, 30, 7, 'x'); g.vl(28, 30, 7, 'A');
  g.r(9, 30, 14, 2, 'y'); g.hl(9, 30, 14, 'l'); g.hl(9, 32, 14, 'Y'); g.hl(9, 31, 14, 'Y'); g.hl(10, 31, 12, 'y');
  g.box(11, 32, 10, 5, 'c'); g.vl(15, 33, 4, 'k'); g.vl(16, 33, 4, 'k'); g.p(12, 33, 'w'); g.p(17, 33, 'w'); g.hl(12, 35, 3, 'C'); g.hl(17, 35, 3, 'C');
  g.p(14, 34, 'l'); g.p(17, 34, 'l');
  win(g, 4, 32, 5, 4, { glass: 'c' }); win(g, 23, 32, 5, 4);
  g.hl(1, 37, 30, 'x'); g.hl(1, 38, 30, 'a');
  // vertical bank sign on the side
  g.box(26, 14, 5, 15, 'y'); g.vl(29, 15, 13, 'Y'); g.vl(27, 15, 13, 'l');
  g.stamp(27, 15, ['OOO', 'OyO', 'OOO']); g.hl(27, 18, 3, 'Y');
  for (const gy of [19, 23]) g.stamp(27, gy, ['OOO', '.O.', 'O.O']);
  g.outline(); def('bank_city', g); }

// ================= NEWS 新聞社 =================
// paper sheet (no outline): w x h, headline color, optional picture
function sheet(g, x, y, w, h, o = {}) {
  g.r(x, y, w, h, o.paper || 'w'); g.vl(x + w - 1, y + 1, h - 1, 'x'); g.hl(x + 1, y + h - 1, w - 1, 'x');
  if (o.head) g.hl(x + 1, y + 1, w - 2, o.head);
  for (let yy = y + (o.pic ? 4 : 3); yy < y + h - 1; yy += 2) g.hl(x + 1, yy, w - 2 - ((yy / 2 | 0) % 2), 'a');
  if (o.pic) g.r(x + 1, y + 1 + (o.head ? 1 : 0), w - 2, 2, o.pic);
  if (o.pin) g.p(x + (w >> 1), y, o.pin);
}
// vertical-writing sheet (Japanese text columns), optional red seal / picture
function sheetV(g, x, y, w, h, o = {}) {
  g.r(x, y, w, h, o.paper || 'w'); g.vl(x + w - 1, y + 1, h - 1, 'x'); g.hl(x + 1, y + h - 1, w - 1, 'x');
  const top = y + 1 + (o.pic ? 3 : 0);
  if (o.pic) { g.r(x + 1, y + 1, w - 2, 2, o.pic); if (o.pic2) g.p(x + 2, y + 1, o.pic2); }
  for (let cx = x + w - 2, i = 0; cx > x; cx -= 2, i++) g.vl(cx, top + (i % 2), y + h - 2 - top - (i % 2) - (i === 1 ? 1 : 0), i === 0 && o.head ? o.head : 'n');
  if (o.seal) g.p(x + 1, y + h - 2, o.seal);
}
// ---- news_village: kosatsu-ba / kawaraban notice board under a thatched hood ----
{ const g = new G(32, 32);
  thatchRoof(g, 4, 11, 8, 2);
  ridge(g, 4, 8, 23);
  g.hl(2, 12, 28, 'k'); g.hl(4, 13, 24, 'O');
  // posts
  for (const px of [4, 26]) { g.r(px, 13, 2, 16, 'o'); g.vl(px + 1, 13, 16, 'O'); g.p(px, 13, 'p'); }
  // plank board
  g.box(6, 14, 20, 12, 'p');
  for (let y = 15; y < 25; y++) if ((y - 15) % 3 === 2) g.hl(7, y, 18, 'o');
  g.vl(24, 15, 10, 'o'); g.hl(7, 15, 17, 'e');
  sheetV(g, 8, 16, 5, 8, { head: 'r', seal: 'r' });
  sheetV(g, 14, 15, 5, 7, { paper: 'e', pic: 'c', pic2: 'u' });
  sheetV(g, 20, 16, 4, 8, {});
  // low wooden fence in front (posts + two rails)
  g.hl(2, 25, 28, 'p'); g.hl(2, 27, 28, 'o');
  for (let x = 2; x < 30; x += 5) { g.r(x, 24, 2, 5, 'o'); g.vl(x + 1, 24, 5, 'O'); g.p(x, 24, 'p'); }
  g.r(29, 24, 1, 5, 'O');
  // ground pad
  g.hl(1, 29, 30, 'd'); g.hl(2, 30, 28, 'D'); g.p(12, 29, 'e'); g.p(24, 29, 'e'); g.p(6, 30, 'd');
  g.stamp(9, 27, TUFT_S); g.stamp(20, 27, TUFT_S);
  g.settle(); g.outline(); def('news_village', g); }

// ---- news_town: Showa-retro newspaper office / print shop, kawara roof, vertical sign ----
{ const g = new G(32, 40);
  // print-shop smokestack
  g.r(22, 1, 3, 7, 'n'); g.vl(22, 1, 7, 'A'); g.hl(21, 1, 5, 'a'); g.hl(21, 0, 5, 'A'); g.hl(22, 4, 3, 'r');
  // kawara (tile) roof
  trapRoof(g, 5, 11, 6, 1, 'A');
  for (let y = 5; y <= 11; y++) { const [L, R] = rowSpan(g, y); for (let x = L; x <= R; x++) { if (y === 5) g.p(x, y, 'a'); else if ((x - L) % 2 === 1) g.p(x, y, 'n'); else if (x <= L + 1) g.p(x, y, 'a'); } }
  g.hl(6, 4, 20, 'n'); g.hl(7, 3, 18, 'k'); g.p(5, 3, 'n'); g.p(26, 3, 'n'); g.p(5, 2, 'k'); g.p(26, 2, 'k');
  g.hl(0, 11, 32, 'n'); g.hl(1, 12, 30, 'k');
  // 2nd floor: plaster + lattice windows
  g.r(3, 13, 26, 8, 'x'); g.vl(3, 13, 8, 'O'); g.vl(28, 13, 8, 'O'); g.vl(27, 13, 8, 'a'); g.hl(4, 13, 24, 'a');
  for (const wx of [8, 18]) { g.box(wx, 14, 8, 5, 'e'); for (let x = wx + 1; x < wx + 7; x += 2) g.vl(x, 15, 3, 'O'); g.p(wx + 2, 15, 'w'); }
  // pent roof between floors
  g.hl(1, 21, 30, 'a'); g.hl(1, 22, 30, 'A'); for (let x = 2; x < 31; x += 2) g.vl(x, 21, 2, 'n'); g.hl(1, 23, 30, 'k');
  // ground floor wooden shopfront
  g.r(3, 24, 26, 11, 'o'); g.vl(3, 24, 11, 'O'); g.vl(28, 24, 11, 'O'); g.hl(4, 24, 24, 'O');
  // glass sliding doors with papers stacked inside
  g.box(10, 25, 13, 10, 'c'); g.hl(11, 33, 11, 'C');
  for (const x of [13, 16, 19]) g.vl(x, 26, 8, 'O'); g.hl(11, 29, 11, 'O');
  g.p(11, 26, 'w'); g.p(12, 26, 'w'); g.p(11, 27, 'w'); g.p(17, 26, 'w');
  g.r(11, 31, 5, 2, 'w'); g.hl(11, 32, 5, 'a'); g.r(17, 31, 4, 2, 'e'); g.p(14, 31, 'n');
  g.p(15, 30, 'l'); g.p(17, 30, 'l');
  // newspaper rack (left)
  g.box(5, 26, 4, 8, 'O'); for (const yy of [27, 30]) { g.r(6, yy, 2, 2, 'w'); g.p(7, yy, 'n'); }
  g.p(6, 32, 'w'); g.p(7, 32, 'e');
  // retro red postbox (right)
  g.stamp(24, 26, ['.rr.', 'rssr', 'rkkr', 'rrRr', 'rrRr', 'rrRr', '.RR.', '.nn.']);
  // vertical signboard on brackets
  g.hl(5, 15, 3, 'O'); g.hl(5, 30, 3, 'O');
  g.box(1, 13, 5, 20, 'w'); g.vl(4, 14, 18, 'x');
  g.r(2, 14, 2, 3, 'r'); g.p(2, 14, 's');
  for (const gy of [18, 23, 28]) g.stamp(2, gy, ['kk', '.k', 'kk', 'k.'].slice(0, 4));
  // base + step
  g.hl(3, 35, 26, 'A'); g.hl(3, 36, 26, 'n'); g.r(9, 36, 15, 1, 'a'); g.p(9, 36, 'x'); g.p(10, 36, 'x');
  g.settle(); g.outline(); def('news_town', g); }

// ---- news_city: media building with rooftop mast and big screen ----
{ const g = new G(32, 40);
  // antenna mast
  g.stamp(20, 0, ['...u...', '...n...', '..nAn..', '..A.A..', '.nnnnn.', '.A...A.', 'nAnnnAn', 'A.....A']);
  g.r(5, 6, 6, 2, 'a'); g.hl(5, 6, 6, 'x'); g.vl(10, 6, 2, 'A'); g.stamp(6, 4, ['k.k', 'A.A']);
  // body
  g.r(2, 8, 28, 2, 'x'); g.hl(2, 9, 28, 'a');
  g.r(3, 10, 26, 27, 'x'); g.vl(3, 10, 27, 'w'); g.r(26, 10, 3, 27, 'a'); g.vl(26, 10, 27, 'A');
  // big screen
  g.box(4, 11, 24, 13, 'T'); g.hl(5, 12, 22, 'q'); g.vl(5, 12, 11, 'q');
  g.r(6, 13, 20, 8, 'C'); g.r(6, 13, 20, 3, 't');
  g.stamp(7, 14, ['.ll.', 'llll', '.ll.']);
  // bar chart + presenter silhouette on screen
  g.r(14, 18, 2, 3, 'u'); g.r(17, 16, 2, 5, 'l'); g.r(20, 17, 2, 4, 'h'); g.hl(13, 20, 10, 'w');
  g.stamp(8, 17, ['.bb.', 'bffb', '.ff.', 'vvvv']);
  g.hl(6, 21, 20, 'u'); for (let x = 7; x < 25; x += 3) g.hl(x, 21, 2, 'w');
  g.p(6, 13, 'w'); g.p(7, 13, 'w'); g.p(6, 14, 'w');
  g.r(13, 24, 6, 1, 'n');
  // office floors
  for (const fy of [25]) for (let wx = 4; wx < 25; wx += 5) win(g, wx, fy, 5, 4);
  g.hl(3, 29, 26, 'a');
  // entrance
  g.r(3, 30, 26, 7, 'A'); g.hl(3, 30, 26, 'n');
  g.r(8, 30, 16, 2, 'u'); g.hl(8, 30, 16, 's'); g.hl(8, 32, 16, 'R');
  g.box(11, 32, 10, 5, 'c'); g.vl(15, 33, 4, 'k'); g.vl(16, 33, 4, 'k'); g.p(12, 33, 'w'); g.p(17, 33, 'w'); g.hl(12, 35, 3, 'C'); g.hl(17, 35, 3, 'C');
  g.p(14, 34, 'l'); g.p(17, 34, 'l');
  win(g, 4, 32, 5, 4); win(g, 23, 32, 5, 4);
  g.hl(1, 37, 30, 'x'); g.hl(1, 38, 30, 'a');
  // vertical sign on the left
  g.box(0, 24, 4, 13, 'r'); g.vl(1, 25, 11, 's'); g.vl(2, 25, 11, 'r');
  for (const gy of [26, 30]) g.stamp(1, gy, ['ww', 'w.', 'ww']); g.hl(1, 34, 2, 'w');
  g.outline(); def('news_city', g); }

// ================= SCHOOL 学舎 =================
// ---- school_village: terakoya, thatched roof, shoji, wooden signboard, engawa ----
{ const g = new G(32, 32);
  thatchRoof(g, 4, 12, 8, 2);
  ridge(g, 4, 8, 23);
  g.hl(2, 13, 28, 'k');
  // wooden wall + posts
  g.r(4, 14, 24, 12, 'o'); g.hl(4, 14, 24, 'O');
  for (const x of [4, 12, 19, 27]) g.vl(x, 14, 12, 'O');
  // hanging wooden signboard (kanban) under the eave
  g.box(9, 14, 14, 5, 'p'); g.hl(10, 15, 12, 'e'); g.vl(21, 15, 3, 'o');
  g.stamp(11, 15, ['O.O', 'OOO', 'O.O']); g.stamp(15, 15, ['OOO', '.O.', 'OOO']); g.stamp(19, 15, ['.O', 'OO', '.O']);
  // shoji (left)
  shoji(g, 5, 19, 7, 7);
  // entrance with indigo noren
  g.box(12, 19, 8, 7, 'O'); g.r(13, 20, 6, 2, 'D'); g.vl(13, 20, 5, 'o');
  g.r(12, 19, 8, 3, 'v'); g.hl(12, 19, 8, 'k'); g.vl(15, 20, 2, 'T'); g.vl(16, 20, 2, 'T'); g.hl(13, 21, 6, 'T'); g.p(13, 20, 't');
  // half-open shoji (right): pupil at a low desk
  g.box(19, 19, 9, 7, 'O'); g.r(20, 20, 4, 5, 'D');
  g.stamp(20, 20, ['.bb.', 'bffb', '.uu.']); g.r(20, 23, 4, 1, 'p'); g.p(21, 23, 'w'); g.p(22, 23, 'w');
  shoji(g, 24, 19, 4, 7);
  // engawa (veranda)
  g.hl(3, 26, 26, 'p'); g.hl(3, 27, 26, 'O'); g.p(3, 26, 'e');
  g.hl(4, 28, 24, 'n'); for (const x of [4, 15, 26]) g.vl(x, 28, 1, 'O');
  g.hl(3, 29, 26, 'a'); for (let x = 5; x < 29; x += 5) g.p(x, 29, 'A');
  g.r(12, 30, 8, 1, 'a'); g.p(12, 30, 'x'); g.p(13, 30, 'x');
  g.settle(); g.outline(); def('school_village', g); }

// ---- school_town: wooden schoolhouse (mokuzo kosha), kawara roof, white clock tower ----
{ const g = new G(32, 40);
  // wing kawara roof
  trapRoof(g, 14, 19, 5, 1, 'A');
  for (let y = 14; y <= 19; y++) { const [L, R] = rowSpan(g, y); for (let x = L; x <= R; x++) { if (y === 14) g.p(x, y, 'a'); else if ((x - L) % 2 === 1) g.p(x, y, 'n'); else if (x <= L + 1) g.p(x, y, 'a'); } }
  g.hl(0, 19, 32, 'n'); g.hl(1, 20, 30, 'k');
  // clapboard wing walls
  g.r(2, 21, 28, 15, 'p');
  for (let y = 21; y < 36; y++) if ((y - 21) % 2 === 1) g.hl(2, y, 28, 'o');
  g.vl(2, 21, 15, 'O'); g.vl(29, 21, 15, 'O'); g.hl(2, 21, 28, 'O'); g.vl(3, 22, 14, 'e');
  g.hl(2, 28, 28, 'O');
  for (const wx of [4, 23]) { win(g, wx, 22, 5, 5, { mull: true }); win(g, wx, 29, 5, 6, { mull: true, bar: true, barY: 2 }); g.hl(wx, 27, 5, 'w'); g.hl(wx, 35, 5, 'w'); }
  // tower: kawara pyramid cap with finial
  g.p(15, 0, 'y'); g.p(16, 0, 'Y');
  for (let y = 1; y <= 5; y++) { const half = Math.round(1 + (y - 1) * 1.2); g.hl(16 - half, y, half * 2, 'A'); for (let x = 16 - half; x < 16 + half; x++) if ((x + y) % 2) g.p(x, y, 'n'); g.p(16 - half, y, 'a'); }
  g.hl(10, 6, 12, 'n'); g.p(10, 5, 'n'); g.p(21, 5, 'n');
  // tower body (white-painted wood) with corner posts
  g.r(11, 7, 10, 29, 'x'); g.vl(11, 7, 29, 'O'); g.vl(20, 7, 29, 'O'); g.vl(12, 7, 29, 'w'); g.vl(19, 7, 29, 'a'); g.hl(11, 7, 10, 'a');
  g.hl(10, 15, 12, 'k'); g.hl(10, 16, 12, 'A'); for (let x = 11; x < 21; x += 2) g.p(x, 16, 'n');
  // clock
  for (let y = 7; y <= 15; y++) for (let x = 11; x <= 20; x++) { const d = Math.hypot(x - 15.5, y - 11); if (d <= 3.8) g.p(x, y, d > 2.9 ? 'O' : 'w'); }
  g.p(13, 9, 'x'); g.vl(15, 9, 3, 'k'); g.hl(16, 11, 2, 'k'); g.p(15, 11, 'k'); g.p(15, 8, 'A'); g.p(18, 11, 'A');
  // tower window + entrance with glass double door
  g.box(13, 18, 6, 6, 'c'); g.vl(15, 19, 4, 'O'); g.vl(16, 19, 4, 'O'); g.hl(14, 21, 4, 'O'); g.p(14, 19, 'w');
  g.r(10, 25, 12, 2, 'A'); g.hl(10, 25, 12, 'a'); for (let x = 11; x < 22; x += 2) g.p(x, 26, 'n'); g.hl(10, 27, 12, 'k');
  g.box(13, 28, 6, 8, 'O'); g.r(14, 29, 4, 3, 'c'); g.vl(15, 28, 8, 'k'); g.vl(16, 28, 8, 'k'); g.p(14, 29, 'w'); g.p(14, 33, 'l'); g.p(17, 33, 'l');
  // stone base + steps
  g.hl(2, 36, 28, 'A'); g.r(11, 37, 10, 1, 'x'); g.r(10, 38, 12, 1, 'a'); g.p(10, 38, 'x');
  g.hl(2, 37, 9, 'n'); g.hl(21, 37, 9, 'n');
  g.settle(); g.outline(); def('school_town', g); }

// ---- school_city: modern university, clock tower, ribbon windows, rooftop green, gate plaques ----
{ const g = new G(32, 40);
  // tower
  g.r(11, 1, 10, 34, 'x'); g.vl(11, 1, 34, 'w'); g.r(19, 1, 2, 34, 'a'); g.vl(20, 1, 34, 'A'); g.hl(11, 1, 10, 'a'); g.hl(11, 2, 10, 'n');
  for (let y = 3; y <= 10; y++) for (let x = 11; x <= 20; x++) { const d = Math.hypot(x - 15.5, y - 6.5); if (d <= 3.6) g.p(x, y, d > 2.7 ? 'T' : 'w'); }
  g.vl(15, 4, 3, 'k'); g.hl(16, 6, 2, 'k'); g.p(15, 6, 'k'); g.p(13, 5, 'x');
  g.r(13, 12, 6, 16, 'c'); for (let y = 12; y < 28; y++) { g.p(18, y, 'C'); if ((y - 12) % 4 === 3) g.hl(13, y, 6, 'T'); }
  for (let y = 12; y < 28; y++) if ((y - 12) % 8 < 2) g.p(13 + ((y - 12) % 8), y, 'w');
  // wings with rooftop greenery
  for (const [x0, w] of [[2, 9], [21, 9]]) {
    g.r(x0, 12, w, 2, 'g'); g.hl(x0, 12, w, 'h'); for (let x = x0 + 1; x < x0 + w; x += 3) g.p(x, 12, 'j');
    g.r(x0, 14, w, 21, 'x'); g.hl(x0, 14, w, 'a');
    for (const ry of [16, 21, 26]) { g.r(x0, ry, w, 3, 'c'); g.hl(x0, ry + 2, w, 'C'); g.hl(x0, ry - 1, w, 'k'); g.hl(x0, ry + 3, w, 'a');
      for (let x = x0 + 2; x < x0 + w; x += 3) g.vl(x, ry, 3, 'T'); g.p(x0 + 1, ry, 'w'); }
  }
  g.vl(2, 14, 21, 'w'); g.r(28, 14, 2, 21, 'a'); g.vl(29, 14, 21, 'A');
  g.vl(10, 12, 23, 'a'); g.vl(21, 12, 23, 'w');
  // entrance canopy + glass doors
  g.r(9, 28, 14, 2, 'v'); g.hl(9, 28, 14, 't'); g.hl(9, 30, 14, 'T');
  g.box(12, 30, 8, 5, 'c'); g.vl(15, 31, 4, 'k'); g.vl(16, 31, 4, 'k'); g.p(13, 31, 'w'); g.p(17, 31, 'w'); g.p(14, 33, 'l'); g.p(17, 33, 'l');
  // ground + gate pillars with vertical name plaques
  g.hl(1, 35, 30, 'x'); g.hl(1, 36, 30, 'a');
  for (const px of [3, 25]) { g.r(px, 29, 4, 8, 'a'); g.vl(px, 29, 8, 'x'); g.vl(px + 3, 29, 8, 'A'); g.hl(px, 29, 4, 'x');
    g.r(px + 1, 30, 2, 5, 'w'); g.vl(px + 2, 31, 3, 'n'); g.p(px + 1, 31, 'n'); }
  g.hl(1, 37, 30, 'A');
  g.settle(); g.outline(); def('school_city', g); }

// ================= PLAZA 広場 (open areas) =================
const FLOWER = (c) => ['.' + c + '.', c + 'l' + c, '.j.'];
// ---- plaza_village: roofed stone well, broom, small flower bed on a dirt yard ----
{ const g = new G(32, 32);
  // dirt yard (rounded pad, like gym_village)
  for (let y = 16; y <= 29; y++) { const inset = y < 19 ? 3 - (y - 16) : (y > 27 ? y - 27 : 0); g.hl(1 + inset, y, 30 - 2 * inset, 'd'); }
  g.hl(3, 29, 26, 'D'); g.hl(2, 28, 28, 'D');
  for (const [x, y] of [[4, 25], [26, 19], [9, 18], [28, 24]]) g.p(x, y, 'D');
  for (const [x, y] of [[5, 20], [24, 18], [18, 27]]) g.p(x, y, 'e');
  // well posts + bucket
  const wc = 12.5;
  for (const px of [6, 18]) { g.r(px, 8, 2, 13, 'o'); g.vl(px + 1, 8, 13, 'O'); g.p(px, 8, 'p'); }
  g.hl(6, 10, 14, 'O'); g.hl(7, 10, 2, 'o');
  g.vl(12, 11, 3, 'e');
  g.stamp(10, 14, ['kkkkkk', 'kpooOk', 'kOOOOk', 'kpooOk', '.kkkk.']);
  // little thatched roof (ido-yakata) with ridge cap
  for (let y = 3; y <= 8; y++) { const half = Math.round(2 + (y - 3) * 1.85); g.hl(Math.round(wc - half), y, half * 2 + 1, 'y'); }
  for (let y = 3; y <= 8; y++) { const [L, R] = rowSpan(g, y); for (let x = L; x <= R; x++) { if (g.g(x, y) !== 'y') continue;
    if ((y - 3) % 2 === 1 && (x + y) % 3 !== 0) g.p(x, y, 'Y'); else if (y === 3 || x <= L + 1) g.p(x, y, 'e'); else if (x >= R - 1) g.p(x, y, 'Y'); } }
  for (let x = 2; x <= 23; x++) if (g.g(x, 8) !== '.') g.p(x, 8, x % 2 ? 'Y' : 'y');
  g.hl(10, 2, 6, 'O'); g.hl(10, 1, 6, 'o'); g.p(10, 1, 'p'); g.p(11, 0, 'O'); g.p(14, 0, 'O');
  g.hl(Math.round(wc - 11), 9, 23, 'k');
  // stone well ring
  disc(g, wc, 26.5, 6.5, 2.2, 'A');
  g.r(6, 21, 14, 6, 'a');
  for (let y = 21; y <= 27; y++) for (let x = 5; x <= 20; x++) { const c = g.g(x, y); if (c !== 'a' && c !== 'A') continue;
    const row = (y - 21) % 2, course = ((y - 21) / 2) | 0;
    if (row === 1) g.p(x, y, 'A'); else if ((x + course * 2) % 4 === 0) g.p(x, y, 'A'); else if ((x + course * 2) % 4 === 1) g.p(x, y, 'x'); }
  g.vl(6, 21, 6, 'x'); g.vl(19, 21, 6, 'A');
  disc(g, wc, 20.5, 6.8, 2.2, 'x'); disc(g, wc, 20.5, 4.8, 1.2, 'T'); g.hl(10, 20, 2, 'C'); g.hl(12, 19, 1, 'w');
  // re-draw the posts in front of the rim
  for (const px of [6, 18]) { g.r(px, 17, 2, 4, 'o'); g.vl(px + 1, 17, 4, 'O'); }
  // broom leaning on the well
  for (let i = 0; i < 14; i++) { const bx = 24 - (i / 4 | 0); g.p(bx, 8 + i, i % 5 === 4 ? 'j' : 'h'); g.p(bx + 1, 8 + i, i % 5 === 4 ? 'j' : 'g'); }
  g.stamp(18, 21, ['...OO...', '..OYYO..', '.OYOYOY.', 'OYOYOYOY', 'YO.YO.YO', 'O..O..O.']);
  // flower bed (front right)
  g.box(24, 25, 7, 4, 'D'); g.hl(25, 26, 5, 'O');
  g.stamp(24, 22, FLOWER('u')); g.stamp(27, 21, FLOWER('w')); g.stamp(28, 23, FLOWER('u'));
  g.p(25, 25, 'j'); g.p(29, 25, 'j');
  g.stamp(2, 25, ['h.h', '.j.']); g.stamp(1, 18, TUFT_S);
  g.settle(); g.outline(); def('plaza_village', g); }

// ---- plaza_town: tiered stone fountain on a round cobblestone square ----
{ const g = new G(32, 32);
  // cobble disc with thickness
  disc(g, 15.5, 23, 15, 7, 'A'); g.hl(1, 23, 30, 'A');
  disc(g, 15.5, 22, 15, 7, 'a');
  for (let y = 14; y <= 30; y++) for (let x = 0; x < 32; x++) { if (g.g(x, y) !== 'a') continue;
    const row = (y - 15) % 3, course = ((y - 15) / 3) | 0, k = (x + (course % 2) * 3) % 6;
    if (row === 2 || k === 0) g.p(x, y, 'n'); else if (row === 0 && k < 3) g.p(x, y, 'x'); else if (k === 5) g.p(x, y, 'A'); }
  // little planters at left/right
  // cherry tree (back right)
  g.r(26, 9, 2, 10, 'O'); g.vl(26, 9, 10, 'b'); g.p(25, 11, 'O'); g.p(28, 10, 'O');
  disc(g, 26.5, 6, 5.4, 5.2, 'z');
  for (let y = 0; y < 13; y++) for (let x = 20; x < 32; x++) if (g.g(x, y) === 'z') { if (Math.hypot(x - 25, y - 3.5) < 2.4) g.p(x, y, 'w'); else if ((x - 26.5) + (y - 6) > 3.2) g.p(x, y, 'Z'); else if ((x * 3 + y * 5) % 7 === 0) g.p(x, y, 'Z'); }
  g.p(24, 15, 'z'); g.p(29, 17, 'Z'); g.p(22, 13, 'z');
  // stone lantern (toro) back left
  g.stamp(1, 7, ['..xx..', '.xaaA.', 'xxaaaA', 'aAAAAA', '.alla.', '.alYa.', '.AAAA.', '..aA..', '..aA..', '..aA..', '.xaaA.', 'xaaaaA', 'AAAAAA']);
  // basin: side wall then rim then water
  disc(g, 15.5, 26, 9.5, 3.2, 'A'); g.r(6, 22, 20, 4, 'a'); g.vl(6, 22, 4, 'x'); g.vl(25, 22, 4, 'A');
  for (let x = 8; x < 25; x += 4) g.vl(x, 23, 3, 'A');
  disc(g, 15.5, 22, 10, 3.4, 'x'); disc(g, 15.5, 22, 8.2, 2.3, 'c');
  for (let x = 9; x < 23; x++) if (g.g(x, 23) === 'c') g.p(x, 23, 'C');
  g.hl(10, 21, 2, 'w'); g.p(21, 22, 'w');
  // column + upper bowl
  g.r(14, 12, 4, 10, 'x'); g.vl(14, 12, 10, 'w'); g.vl(17, 12, 10, 'a'); g.hl(14, 21, 4, 'C');
  disc(g, 15.5, 12, 5, 1.6, 'a'); disc(g, 15.5, 11.5, 5, 1.4, 'x'); g.hl(13, 11, 6, 'c'); g.hl(14, 12, 4, 'A');
  // water spray
  g.stamp(10, 2, ['.....ww.....', '....wccw....', '...wcwccw...', '..wccwcccw..', '..cccwcccc..', '.wcc.wc.ccw.', '.cc......cc.', '.c........c.']);
  g.vl(15, 5, 6, 'w'); g.vl(16, 5, 6, 'c');
  g.p(9, 17, 'c'); g.p(22, 17, 'c'); g.p(10, 19, 'w'); g.p(21, 19, 'w');
  g.settle(); g.outline(); def('plaza_town', g); }

// ---- plaza_city: tidy park, square paved plaza, modern jet fountain, benches, tree + lamp ----
{ const g = new G(32, 32);
  // paved slab with curb thickness
  g.r(1, 13, 30, 16, 'x'); g.hl(1, 29, 30, 'a'); g.hl(1, 30, 30, 'A');
  for (let y = 13; y < 29; y++) for (let x = 1; x < 31; x++) { if ((y - 13) % 4 === 3 || (x - 1) % 5 === 4) g.p(x, y, 'a'); }
  g.vl(1, 13, 16, 'w');
  // back lawn strip + hedge
  g.r(1, 13, 30, 3, 'g'); g.hl(1, 13, 30, 'h'); for (let x = 2; x < 31; x += 3) g.p(x, 15, 'j');
  // lawn corners
  g.r(1, 24, 6, 5, 'g'); g.hl(1, 24, 6, 'h'); g.vl(6, 24, 5, 'j'); g.stamp(2, 26, TUFT_S);
  g.r(25, 24, 6, 5, 'g'); g.hl(25, 24, 6, 'h'); g.vl(25, 24, 5, 'j'); g.stamp(27, 26, ['.u.', 'ulu', '.j.']);
  // pool
  g.r(9, 18, 14, 7, 'n'); g.r(9, 18, 14, 1, 'w'); g.vl(9, 18, 6, 'w'); g.r(10, 19, 12, 4, 'c'); g.hl(10, 22, 12, 'C'); g.hl(10, 19, 12, 'C');
  g.hl(9, 23, 14, 'a'); g.hl(9, 24, 14, 'A');
  g.p(11, 20, 'w'); g.p(19, 21, 'w');
  // three jets
  for (const [jx, top] of [[12, 13], [16, 9], [20, 13]]) { g.vl(jx, top, 21 - top, 'w'); g.vl(jx - 1, top + 1, 2, 'c'); g.vl(jx + 1, top + 1, 2, 'c'); g.p(jx, top - 1, 'c'); }
  g.vl(15, 10, 11, 'c'); g.vl(17, 10, 11, 'c'); g.vl(16, 9, 12, 'w');
  // tree (back left)
  disc(g, 5, 6.5, 4.6, 5, 'g');
  for (let y = 0; y < 13; y++) for (let x = 0; x < 11; x++) if (g.g(x, y) === 'g') { if (Math.hypot(x - 3.5, y - 4) < 2.4) g.p(x, y, 'h'); else if ((x - 5) + (y - 6.5) > 3.5) g.p(x, y, 'j'); }
  g.p(4, 3, 'w'); g.r(4, 11, 2, 5, 'o'); g.vl(5, 11, 5, 'O');
  // lamp (back right)
  g.r(25, 1, 4, 2, 'T'); g.hl(25, 1, 4, 't'); g.r(25, 3, 4, 1, 'l'); g.p(25, 3, 'w');
  g.vl(26, 4, 12, 'n'); g.vl(27, 4, 12, 'A'); g.r(25, 15, 4, 2, 'n'); g.hl(25, 15, 4, 'A');
  // benches (front)
  for (const bx of [8, 18]) { g.r(bx, 25, 6, 1, 'O'); g.r(bx, 26, 6, 1, 'p'); g.hl(bx, 27, 6, 'o'); g.p(bx + 1, 28, 'n'); g.p(bx + 4, 28, 'n'); g.hl(bx, 25, 6, 'o'); }
  g.settle(); g.outline(); def('plaza_city', g); }

// ---------- validate ----------
const NAMES = ['bank_village', 'bank_town', 'bank_city', 'news_village', 'news_town', 'news_city', 'school_village', 'school_town', 'school_city', 'plaza_village', 'plaza_town', 'plaza_city'];
let bad = 0;
for (const [n, s] of Object.entries(S)) {
  if (s.rows.length !== s.h) { console.log('H', n, s.rows.length); bad++; }
  s.rows.forEach((r, i) => { if (r.length !== s.w) { console.log('W', n, i, r.length, JSON.stringify(r)); bad++; } [...r].forEach(c => { if (!(c in PALETTE)) { console.log('C', n, i, c); bad++; } }); });
  if (!/[^.]/.test(s.rows[s.h - 1])) { console.log('EMPTY BOTTOM ROW', n); bad++; }
  if (!/[^.]/.test(s.rows[0])) console.log('note: empty top row', n);
}
const missing = NAMES.filter(n => !S[n]); const extra = Object.keys(S).filter(n => !NAMES.includes(n));
if (extra.length) { console.log('unexpected sprites', extra); bad++; }
console.log('sprites', Object.keys(S).length, '/', NAMES.length, 'missing:', missing.join(',') || 'none', 'bad', bad, bad ? 'VALIDATION FAILED' : 'VALIDATION OK');
for (const [n, s] of Object.entries(S)) console.log(' ', n, s.w + 'x' + s.h);

// ---------- emit JSON ----------
const outJ = {}; for (const n of NAMES) if (S[n]) outJ[n] = S[n];
fs.writeFileSync(path.join(OUT, 'new-sprites.json'), JSON.stringify(outJ, null, 1));

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
// reference sprites (read-only) from ../sprites.js for style comparison
let REF = {};
try { const src = fs.readFileSync(path.join(OUT, '..', 'sprites.js'), 'utf8'); const all = new Function(src + '; return SPRITES;')(); for (const n of ['lib_town', 'gym_town']) if (all[n]) REF['ref:' + n] = all[n]; } catch (e) { console.log('ref sprites unavailable:', e.message); }
const SC = +(process.argv[2] || 4), PAD = 8;
// one row per building type (3 tiers), reference sprites on the last row
const groups = [['bank'], ['news'], ['school'], ['plaza']].map(([k]) => NAMES.filter(n => n.startsWith(k + '_') && S[n]).map(n => [n, S[n]])).filter(r => r.length);
if (Object.keys(REF).length) groups.push(Object.entries(REF));
let W = 0, H = PAD; const pos = [];
for (const row of groups) { let x = PAD, rowH = 0; for (const [n, s] of row) { pos.push([n, s, x, H + (40 - s.h) * SC]); x += s.w * SC + PAD; rowH = Math.max(rowH, 40 * SC); } W = Math.max(W, x); H += rowH + PAD; }
const px = Array.from({ length: W * H }, () => [246, 239, 224]);
for (const [n, s, ox, oy] of pos) s.rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === '.') return; const col = hex(PALETTE[c]); for (let b = 0; b < SC; b++) for (let a = 0; a < SC; a++) px[(oy + j * SC + b) * W + ox + i * SC + a] = col; }));
fs.writeFileSync(path.join(OUT, 'preview2.png'), makePNG(W, H, px));
console.log('preview2', W, H);
