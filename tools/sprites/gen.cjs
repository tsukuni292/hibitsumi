// Sprite generator: builds plain row strings, writes sprites.js + preview.png
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
  rows() { return this.a.map(r => r.join('')); }
}

const S = {};
const def = (name, g) => { S[name] = { w: g.w, h: g.h, rows: g.rows() }; };

// ---------- helpers ----------
const BOOK = ['.kkkkkkkk.', '.kuulluuwk', 'kkkkkkkkkk', 'kvvvllvvwk', 'kkkkkkkkkk'];
const TUFT = ['h...h', '.j.j.', '..j..'];
const TUFT_S = ['h.h', '.j.'];
function grass(g, seed, nT, nS, nSpeck) {
  g.r(0, 0, 16, 16, 'g');
  const R = rng(seed);
  for (let i = 0; i < nSpeck; i++) g.pw(R() * 16 | 0, R() * 16 | 0, R() < .6 ? 'h' : 'j');
  return R;
}
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

// ================= TILES (16x16) =================
// village grass
{ const g = new G(16, 16); const R = grass(g, 11, 0, 0, 8);
  g.stamp(1, 2, TUFT, true); g.stamp(9, 6, TUFT, true); g.stamp(3, 11, TUFT_S, true); g.stamp(12, 12, TUFT_S, true); g.stamp(13, 1, TUFT_S, true);
  def('tile_grass_village', g); }
// village grass with flowers
{ const g = new G(16, 16); grass(g, 12, 0, 0, 6);
  g.stamp(9, 9, TUFT, true); g.stamp(1, 13, TUFT_S, true);
  g.stamp(2, 2, ['.w.', 'wlw', '.w.', '.j.']); g.stamp(10, 3, ['.u.', 'ulu', '.u.', '.j.']); g.stamp(5, 9, ['.w.', 'wlw', '.w.', '.j.']);
  def('tile_flowers_village', g); }
// dirt path
{ const g = new G(16, 16); g.r(0, 0, 16, 16, 'd'); const R = rng(21);
  for (let i = 0; i < 9; i++) g.p(R() * 16 | 0, 2 + (R() * 12 | 0), 'D');
  for (const [x, y] of [[3, 5], [11, 9], [6, 12], [13, 4]]) { g.p(x, y, 'e'); g.p(x + 1, y, 'e'); g.p(x, y + 1, 'D'); g.p(x + 1, y + 1, 'D'); }
  g.p(8, 7, 'e'); g.p(1, 10, 'e');
  const top = 'ggDggggDgggDgggD', bot = 'hgg.ggghg.gggggh';
  [...top].forEach((c, x) => { if (c === 'g') { g.p(x, 0, 'g'); g.p(x, 1, 'D'); } else g.p(x, 0, 'D'); });
  [...bot].forEach((c, x) => { if (c !== '.') g.p(x, 15, c); if (c === 'h') g.p(x, 14, 'g'); });
  def('tile_path_dirt', g); }
// town grass (neat lawn)
{ const g = new G(16, 16); g.r(0, 0, 16, 16, 'g');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y * 3) % 8 === 0) g.p(x, y, 'h');
  g.stamp(4, 5, TUFT_S); g.stamp(11, 11, TUFT_S); g.p(13, 3, 'j'); g.p(2, 12, 'j');
  def('tile_grass_town', g); }
// cobblestone
{ const g = new G(16, 16); g.r(0, 0, 16, 16, 'n');
  const bands = [[[0, 5], [5, 6], [11, 5]], [[3, 5], [8, 5], [13, 6]], [[1, 6], [7, 5], [12, 5]], [[4, 5], [9, 5], [14, 6]]];
  bands.forEach((band, bi) => band.forEach(([sx, w]) => {
    const y0 = bi * 4, n = w - 1;
    for (let i = 0; i < n; i++) {
      g.pw(sx + i, y0, i < 2 ? 'x' : 'a'); g.pw(sx + i, y0 + 1, i === 0 ? 'x' : 'a'); g.pw(sx + i, y0 + 2, 'A');
    }
    g.pw(sx + n - 1, y0, 'A'); g.pw(sx, y0 + 2, 'n'); g.pw(sx + n - 1, y0 + 2, 'n');
  }));
  def('tile_cobble', g); }
// sidewalk
{ const g = new G(16, 16); g.r(0, 0, 16, 16, 'a');
  for (const ox of [0, 8]) for (const oy of [0, 8]) { g.hl(ox, oy, 7, 'x'); g.vl(ox, oy, 7, 'x'); g.hl(ox, oy + 7, 8, 'A'); g.vl(ox + 7, oy, 8, 'A'); }
  g.p(4, 3, 'A'); g.p(11, 12, 'A'); g.p(12, 4, 'x');
  def('tile_sidewalk', g); }
// asphalt road with curb at top
{ const g = new G(16, 16); g.r(0, 0, 16, 16, 'q'); const R = rng(41);
  for (let i = 0; i < 14; i++) g.p(R() * 16 | 0, 3 + (R() * 13 | 0), R() < .7 ? 'Q' : 'A');
  g.hl(0, 0, 16, 'x'); g.hl(0, 1, 16, 'a'); g.hl(0, 2, 16, 'Q'); g.vl(7, 0, 2, 'A'); g.vl(15, 0, 2, 'A');
  def('tile_asphalt', g); }
// asphalt with lane dash
{ const g = new G(16, 16); g.r(0, 0, 16, 16, 'q'); const R = rng(42);
  for (let i = 0; i < 14; i++) g.p(R() * 16 | 0, R() * 16 | 0, R() < .7 ? 'Q' : 'A');
  g.r(3, 7, 9, 2, 'w'); g.hl(3, 9, 9, 'Q');
  def('tile_asphalt_line', g); }
// city grass patch (planter with curb)
{ const g = new G(16, 16); g.r(0, 0, 16, 16, 'a');
  g.hl(0, 0, 16, 'x'); g.vl(0, 0, 16, 'x'); g.hl(0, 15, 16, 'A'); g.vl(15, 0, 16, 'A');
  g.r(2, 2, 12, 12, 'g'); g.hl(2, 2, 12, 'j'); g.vl(2, 2, 12, 'j');
  g.stamp(4, 5, TUFT_S); g.stamp(9, 9, TUFT_S); g.p(11, 4, 'h'); g.p(5, 11, 'h'); g.p(7, 7, 'h');
  def('tile_grass_city', g); }

// ================= DECO (16x16) =================
{ const g = new G(16, 16);
  for (let y = 1; y <= 11; y++) for (let x = 2; x <= 13; x++) { const dx = x - 7.5, dy = y - 6; if (dx * dx + dy * dy * 1.15 <= 33) g.p(x, y, 'g'); }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g.g(x, y) === 'g') {
    const dx = x - 5.5, dy = y - 3.5; if (dx * dx + dy * dy < 7) g.p(x, y, 'h');
    if ((x - 7.5) + (y - 6) > 5.5) g.p(x, y, 'j');
  }
  g.p(9, 5, 'j'); g.p(5, 8, 'j'); g.p(10, 8, 'j'); g.p(4, 3, 'w');
  g.r(7, 11, 2, 4, 'o'); g.vl(8, 11, 4, 'O'); g.p(7, 11, 'O');
  g.outline(); def('deco_tree', g); }
{ const g = new G(16, 16);
  g.r(5, 1, 6, 2, 'T'); g.hl(5, 1, 6, 't'); g.r(6, 3, 4, 1, 'l'); g.p(6, 3, 'w');
  g.r(7, 4, 2, 9, 'n'); g.vl(7, 4, 9, 'A'); g.r(6, 13, 4, 2, 'n'); g.hl(6, 13, 4, 'A');
  g.outline(); def('deco_lamp', g); }

// ================= BUILDINGS =================
// ---- house_village: thatched cottage ----
{ const g = new G(32, 32);
  g.r(21, 1, 4, 6, 'A'); g.vl(21, 1, 6, 'a'); g.hl(21, 1, 4, 'n');
  trapRoof(g, 3, 14, 8, 2, 'y');
  for (let y = 3; y <= 14; y++) { const [L, R] = rowSpan(g, y); if (y >= 7 || L > 0) {}
    // keep chimney pixels untouched
    for (let x = L; x <= R; x++) { if (g.g(x, y) !== 'y') continue;
      if ((y - 3) % 3 === 2 && (x + y) % 3 !== 0) g.p(x, y, 'Y');
      else if (y === 3 || x <= L + 1) g.p(x, y, 'e');
      else if (x >= R - 1) g.p(x, y, 'Y'); } }
  for (let x = 2; x <= 29; x++) g.p(x, 14, x % 2 ? 'Y' : 'y');
  g.hl(2, 15, 28, 'k');
  g.r(4, 16, 24, 14, 'e'); g.hl(5, 16, 22, 'd'); g.vl(26, 17, 11, 'd');
  g.vl(4, 16, 12, 'O'); g.vl(27, 16, 12, 'O');
  g.p(9, 18, 'd'); g.p(23, 27, 'd'); g.p(17, 17, 'd');
  // foundation
  g.hl(4, 28, 24, 'a'); g.hl(4, 29, 24, 'A'); for (let x = 6; x < 28; x += 5) { g.p(x, 28, 'n'); g.p(x + 2, 29, 'n'); }
  // door
  g.box(13, 20, 6, 10, 'O'); g.hl(14, 19, 4, 'k'); g.vl(14, 21, 9, 'o'); g.p(16, 25, 'l'); g.vl(15, 21, 9, 'O');
  g.r(13, 30, 6, 1, 'a'); g.p(13, 30, 'x'); g.p(14, 30, 'x');
  // windows + flower boxes
  for (const wx of [6, 20]) {
    win(g, wx, 19, 6, 7, { glass: 'l', bar: true, barY: 3, barC: 'O' }); g.p(wx + 4, 23, 'Y'); g.p(wx + 3, 24, 'Y');
    [...'ujsjuj'].forEach((c, i) => g.p(wx + i, 26, c)); g.hl(wx, 27, 6, 'O');
  }
  g.outline(); def('house_village', g); }

// ---- lib_village: wooden book hut, plank gable roof ----
{ const g = new G(32, 32);
  // gable roof band (45deg), apex at y=2
  for (let y = 2; y <= 15; y++) {
    const L = 15 - (y - 2), R = 31 - L;
    for (let x = L; x <= R; x++) {
      const dl = x - L, dr = R - x;
      if (dl < 3) g.p(x, y, dl === 0 ? 'p' : ((x + y) % 3 === 0 ? 'o' : 'p'));
      else if (dr < 3) g.p(x, y, dr === 0 ? 'O' : ((x - y) % 3 === 0 ? 'O' : 'o'));
      else if (dl === 3 || dr === 3) g.p(x, y, 'k');
      else g.p(x, y, (x % 3 === 0) ? 'o' : 'p'); // gable face planks
    }
  }
  g.p(15, 2, 'p'); g.p(16, 2, 'o'); g.p(15, 3, 'p'); g.p(16, 3, 'o');
  // attic round window
  g.stamp(14, 8, ['.kk.', 'klwk', 'kllk', '.kk.']);
  g.hl(2, 15, 28, 'O'); g.hl(2, 16, 28, 'k');
  // log wall
  g.r(4, 17, 24, 13, 'o');
  for (let y = 17; y < 30; y++) { if ((y - 17) % 3 === 2) g.hl(4, y, 24, 'O'); else if ((y - 17) % 3 === 0) g.hl(5, y, 22, 'p'); }
  for (let y = 18; y < 30; y += 3) { g.p(4, y, 'e'); g.p(27, y, 'D'); }
  g.hl(5, 17, 22, 'O');
  // sign board with open book
  g.box(9, 17, 14, 7, 'e'); g.vl(21, 18, 5, 'd');
  g.stamp(11, 18, BOOK);
  // door
  g.box(13, 24, 6, 6, 'O'); g.vl(14, 25, 5, 'o'); g.p(17, 27, 'l');
  // shelf window (left)
  g.box(5, 23, 6, 6, 'O'); g.stamp(6, 24, ['uvlj', 'uvlj', 'OOOO', 'jlvu']);
  // book stack (right)
  g.stamp(21, 24, ['kkkkkk', 'kvvvwk', 'kkkkkk', 'kuuuuw', 'kkkkkk', 'kjjjwk']);
  g.hl(4, 29, 24, 'O');
  g.outline(); def('lib_village', g); }

// ---- gym_village: practice yard with straw dummy + target ----
{ const g = new G(32, 32);
  // dirt pad
  for (let y = 13; y <= 29; y++) { const inset = y < 16 ? 3 - (y - 13) : (y > 27 ? y - 27 : 0); g.hl(1 + Math.max(0, inset), y, 30 - 2 * Math.max(0, inset), 'd'); }
  g.hl(3, 29, 26, 'D'); g.hl(2, 28, 28, 'D');
  for (const [x, y] of [[5, 26], [9, 21], [14, 24], [26, 26], [28, 18]]) g.p(x, y, 'D');
  for (const [x, y] of [[4, 22], [12, 19], [27, 21]]) g.p(x, y, 'e');
  // archery target on a stand (left)
  const tx = 7, ty = 11;
  g.vl(tx - 3, ty + 3, 9, 'O'); g.vl(tx + 3, ty + 3, 9, 'O'); g.vl(tx, ty + 4, 6, 'O');
  for (let y = ty - 6; y <= ty + 6; y++) for (let x = tx - 6; x <= tx + 6; x++) {
    const d = Math.hypot(x - tx, (y - ty) * 1.1);
    if (d <= 5.6) g.p(x, y, d <= 1.3 ? 'l' : d <= 2.6 ? 'u' : d <= 3.9 ? 'w' : 'u');
  }
  for (let y = ty - 6; y <= ty + 6; y++) for (let x = tx - 6; x <= tx + 6; x++) if (g.g(x, y) === 'u' && x + y - tx - ty >= 5) g.p(x, y, 'r');
  g.p(tx - 2, ty - 3, 'x'); g.p(tx - 3, ty - 2, 'x');
  // dummy
  const cx = 21;
  g.r(cx - 1, 9, 3, 18, 'O'); g.vl(cx - 1, 9, 18, 'o');                // post
  g.r(cx - 8, 14, 17, 2, 'o'); g.hl(cx - 8, 14, 17, 'p');               // arm stick
  for (const ax of [cx - 9, cx + 7]) { g.r(ax, 13, 3, 4, 'y'); g.hl(ax, 13, 3, 'e'); g.hl(ax, 16, 3, 'Y'); g.p(ax + 1, 17, 'Y'); g.vl(ax + (ax < cx ? 2 : 0), 13, 4, 'O'); }
  // torso
  g.r(cx - 4, 12, 9, 10, 'y'); g.p(cx - 4, 12, '.'); g.p(cx + 4, 12, '.'); g.p(cx - 4, 21, '.'); g.p(cx + 4, 21, '.');
  for (let y = 13; y < 21; y++) { g.p(cx - 4, y, 'e'); g.p(cx + 4, y, 'Y'); g.p(cx + 3, y, 'Y'); }
  for (let x = cx - 2; x <= cx + 2; x += 2) g.vl(x, 13, 7, 'Y');
  g.hl(cx - 3, 19, 7, 'O');
  g.stamp(cx - 1, 15, ['.u.', 'uwu', '.u.']);
  // head with red headband
  for (let y = 3; y <= 10; y++) for (let x = cx - 4; x <= cx + 4; x++) { const dx = x - cx, dy = y - 6.5; if (dx * dx + dy * dy * 1.3 <= 17) g.p(x, y, 'y'); }
  for (let y = 3; y <= 10; y++) for (let x = cx - 4; x <= cx + 4; x++) if (g.g(x, y) === 'y') { if (x - cx + y - 6.5 > 3) g.p(x, y, 'Y'); else if ((x - cx) + (y - 6.5) < -3) g.p(x, y, 'e'); }
  g.swap(cx - 4, 5, 9, 1, 'y', 'u'); g.swap(cx - 4, 5, 9, 1, 'e', 's'); g.swap(cx - 4, 5, 9, 1, 'Y', 'r');
  g.p(cx + 5, 6, 'u'); g.p(cx + 6, 7, 'r');
  g.p(cx - 2, 7, 'k'); g.p(cx + 2, 7, 'k'); g.hl(cx - 1, 9, 3, 'Y');
  g.hl(cx - 2, 11, 5, 'O');
  g.r(cx - 1, 22, 3, 5, 'O'); g.vl(cx - 1, 22, 5, 'o');
  g.hl(cx - 3, 27, 7, 'D');
  // low front fence with gap
  const posts = [2, 9, 23, 29];
  g.hl(1, 24, 10, 'p'); g.hl(1, 25, 10, 'o'); g.hl(23, 24, 8, 'p'); g.hl(23, 25, 8, 'o');
  for (const x of posts) { g.r(x, 22, 2, 7, 'o'); g.vl(x + 1, 22, 7, 'O'); g.p(x, 22, 'p'); }
  g.outline(); def('gym_village', g); }

// ---- house_town: two-storey townhouse, red tile roof ----
{ const g = new G(32, 40);
  g.r(22, 1, 4, 7, 'r'); g.vl(22, 1, 7, 's'); g.hl(22, 1, 4, 'R'); g.vl(25, 2, 6, 'R');
  trapRoof(g, 4, 14, 8, 2, 'r');
  for (let y = 4; y <= 14; y++) { const [L, R] = rowSpan(g, y);
    for (let x = L; x <= R; x++) { if (y < 8 && x >= 22 && x <= 25 && g.g(x, y) !== 'r') continue;
      if (y < 8 && x >= 22 && x <= 25 && y <= 7 && L > 8 - ((y - 4) * 0.6)) {}
      if ((y - 4) % 3 === 2) g.p(x, y, 'R'); else if ((y - 4) % 3 === 1 && (x + y) % 4 === 0) g.p(x, y, 'R');
      else if (y === 4 || x <= L + 1) g.p(x, y, 's');
      else if (x >= R - 1) g.p(x, y, 'R'); else g.p(x, y, 'r'); } }
  // chimney top above roof keeps its own color
  g.r(22, 1, 4, 3, 'r'); g.vl(22, 1, 3, 's'); g.hl(22, 1, 4, 'R');
  // dormer
  g.r(12, 6, 8, 7, 'e'); g.hl(11, 5, 10, 'R'); g.hl(12, 4, 8, 'R'); g.hl(13, 3, 6, 'r');
  win(g, 13, 7, 6, 6, { bar: true, barY: 3 }); g.vl(12, 6, 7, 'k'); g.vl(19, 6, 7, 'k');
  g.hl(2, 15, 28, 'k');
  // walls
  g.r(4, 16, 24, 21, 'e'); g.hl(5, 16, 22, 'd'); g.vl(26, 17, 19, 'd');
  g.vl(4, 16, 21, 'O'); g.vl(27, 16, 21, 'O'); g.hl(4, 25, 24, 'O'); g.hl(5, 26, 22, 'd');
  // upper windows with shutters + flower boxes
  for (const wx of [7, 19]) { win(g, wx, 17, 6, 7, { bar: true, barY: 3 }); g.vl(wx - 1, 18, 5, 'T'); g.vl(wx + 6, 18, 5, 'T'); [...'ujuuju'].forEach((c, i) => g.p(wx + i, 24, c)); }
  // ground floor
  win(g, 6, 28, 6, 6, { mull: true, mullX: 3 }); win(g, 20, 28, 6, 6, { mull: true, mullX: 2 });
  g.box(13, 28, 6, 9, 't'); g.hl(14, 27, 4, 'k'); g.p(13, 27, 'e'); g.p(18, 27, 'e'); g.vl(14, 29, 8, 'c'); g.p(17, 32, 'l'); g.hl(14, 30, 4, 'T'); g.p(14, 30, 'c');
  g.hl(4, 36, 24, 'A'); g.hl(4, 35, 9, 'a'); g.hl(19, 35, 9, 'a');
  g.r(12, 37, 8, 1, 'a'); g.p(12, 37, 'x'); g.p(13, 37, 'x');
  g.outline(); def('house_town', g); }

// ---- lib_town: brick library with slate roof, pediment and sign ----
{ const g = new G(32, 40);
  trapRoof(g, 5, 13, 7, 1, 't');
  for (let y = 5; y <= 13; y++) { const [L, R] = rowSpan(g, y);
    for (let x = L; x <= R; x++) { if ((y - 5) % 3 === 2) g.p(x, y, (x % 3 === 0) ? 'k' : 'T'); else if (y === 5 || x <= L + 1) g.p(x, y, 'c'); else if (x >= R - 1) g.p(x, y, 'T'); } }
  // pediment
  for (let y = 2; y <= 13; y++) { const half = Math.round((y - 2) * 0.9) + 1; g.hl(16 - half, y, half * 2, 'x'); g.p(16 - half - 1, y, 'k'); g.p(15 + half + 1, y, 'k'); g.p(15 + half, y, 'a'); }
  g.hl(15, 1, 2, 'k');
  g.stamp(13, 7, ['.kkkk.', 'kclcCk', 'kcClck', '.kkkk.']);
  g.hl(4, 14, 24, 'k');
  // cornice
  g.hl(1, 14, 30, 'k'); g.hl(2, 15, 28, 'x'); g.hl(2, 16, 28, 'a'); g.hl(2, 17, 28, 'k');
  // brick body
  g.r(3, 18, 26, 18, 'r');
  for (let y = 18; y < 36; y++) for (let x = 3; x < 29; x++) {
    const row = (y - 18) % 3, course = ((y - 18) / 3) | 0;
    if (row === 2) g.p(x, y, 'R'); else if ((x + (course % 2) * 2) % 4 === 0) g.p(x, y, 'R'); else if (row === 0 && (x + (course % 2) * 2) % 4 === 1) g.p(x, y, 's');
  }
  // pilasters
  for (const px of [3, 27]) { g.r(px, 18, 2, 18, 'a'); g.vl(px, 18, 18, 'x'); }
  // sign plaque
  g.box(8, 17, 16, 7, 'O'); g.r(9, 18, 14, 5, 'e'); g.vl(22, 18, 5, 'd');
  g.stamp(11, 19, BOOK);
  // arched windows
  for (const wx of [6, 21]) { g.box(wx, 24, 5, 9, 'c'); g.p(wx, 24, 'r'); g.p(wx + 4, 24, 'r'); g.hl(wx + 1, 23, 3, 'k'); g.p(wx, 23, 'r'); g.hl(wx + 1, 24, 3, 'c'); g.p(wx, 24, 'k'); g.p(wx + 4, 24, 'k');
    g.hl(wx + 1, 31, 3, 'C'); g.hl(wx + 1, 28, 3, 'k'); g.p(wx + 1, 25, 'w'); g.p(wx + 1, 26, 'w'); g.hl(wx - 1, 33, 7, 'x'); }
  // double door
  g.box(12, 25, 8, 11, 'O'); g.hl(13, 24, 6, 'k'); g.p(12, 25, 'k'); g.p(19, 25, 'k'); g.hl(13, 25, 6, 'l');
  g.vl(15, 26, 10, 'k'); g.vl(16, 26, 10, 'k'); g.vl(13, 26, 10, 'o'); g.vl(17, 26, 10, 'o'); g.p(14, 31, 'l'); g.p(18, 31, 'l');
  // steps
  g.hl(2, 36, 28, 'A'); g.r(9, 37, 14, 1, 'x'); g.r(8, 38, 16, 1, 'a'); g.p(8, 38, 'x');
  g.outline(); def('lib_town', g); }

// ---- gym_town: stone dojo with flared tile roof and noren ----
{ const g = new G(32, 32);
  // roof
  trapRoof(g, 4, 12, 7, 1, 'T');
  for (let y = 4; y <= 12; y++) { const [L, R] = rowSpan(g, y);
    for (let x = L; x <= R; x++) { if (y === 4) g.p(x, y, 't'); else if ((x - L) % 3 === 1 && y > 5) g.p(x, y, 'n'); else if (x <= L + 1) g.p(x, y, 't'); } }
  g.hl(6, 3, 20, 'n'); g.hl(7, 2, 18, 'k'); g.p(6, 2, 'n'); g.p(25, 2, 'n'); g.p(5, 1, 'k'); g.p(26, 1, 'k'); g.p(5, 2, 'n'); g.p(26, 2, 'n');
  g.hl(0, 13, 32, 'n'); g.p(0, 12, 'n'); g.p(31, 12, 'n'); g.p(0, 11, 'T'); g.p(31, 11, 'T');
  g.hl(1, 14, 30, 'k');
  // walls (plaster + beams)
  g.r(3, 15, 26, 11, 'x'); g.hl(4, 15, 24, 'a');
  g.vl(3, 15, 11, 'O'); g.vl(28, 15, 11, 'O'); g.vl(10, 15, 11, 'O'); g.vl(21, 15, 11, 'O'); g.hl(3, 16, 26, 'O');
  // lattice windows
  for (const wx of [5, 23]) { g.box(wx, 18, 4, 5, 'e'); g.vl(wx + 1, 19, 3, 'O'); g.hl(wx + 1, 20, 2, 'O'); g.p(wx + 2, 19, 'w'); }
  // sliding doors with noren
  g.r(11, 17, 10, 9, 'e'); for (let y = 17; y < 26; y += 3) g.hl(11, y, 10, 'O'); for (let x = 11; x < 21; x += 3) g.vl(x, 17, 9, 'O'); g.vl(16, 17, 9, 'k');
  g.r(11, 17, 10, 5, 'v'); g.hl(11, 17, 10, 'T'); g.vl(13, 18, 4, 'T'); g.vl(18, 18, 4, 'T'); g.hl(11, 21, 10, 'T');
  g.stamp(14, 18, ['.ww.', 'w..w', '.ww.']); g.vl(16, 22, 4, 'k');
  // stone base
  g.r(2, 26, 28, 4, 'a'); g.hl(2, 26, 28, 'x'); g.hl(2, 29, 28, 'A');
  for (const [x, y] of [[6, 27], [12, 28], [19, 27], [25, 28], [9, 29], [22, 29]]) { g.p(x, y, 'n'); g.p(x, y - 1 < 26 ? y : y - 1, 'n'); }
  g.r(11, 26, 10, 1, 'n'); g.r(10, 30, 12, 1, 'x');
  g.outline(); def('gym_town', g); }

// ---- lib_city: modern multi-storey glass library ----
{ const g = new G(32, 40);
  g.r(20, 1, 6, 3, 'a'); g.hl(20, 1, 6, 'x'); g.vl(25, 1, 3, 'A'); g.hl(21, 2, 3, 'n');
  g.r(2, 3, 28, 2, 'x'); g.hl(2, 4, 28, 'a');
  g.r(2, 5, 28, 32, 'a'); g.vl(2, 5, 32, 'x');
  // side depth face
  g.r(26, 5, 4, 32, 'A'); g.vl(26, 5, 32, 'k');
  // glass floors
  const floors = [6, 12, 18];
  floors.forEach((fy, fi) => {
    g.r(4, fy, 21, 5, 'c'); g.hl(4, fy + 4, 21, 'C');
    for (let x = 4; x < 25; x++) for (let y = fy; y < fy + 5; y++) if ((x - y + fi * 3) % 9 === 0 || (x - y + fi * 3) % 9 === 1) g.p(x, y, 'w');
    for (let x = 4; x < 25; x += 5) g.vl(x + 4, fy, 5, 'T');
    g.hl(3, fy + 5, 23, 'A');
    for (let y = fy; y < fy + 5; y++) { g.p(27, y, (y - fy) % 2 ? 'T' : 'C'); g.p(28, y, 'T'); }
  });
  // books visible on middle floor
  [...'uvljuvlj'].forEach((c, i) => { g.vl(5 + i * 2 + (i > 3 ? 1 : 0), 15, 2, c); });
  // sign band
  g.r(3, 23, 23, 7, 'v'); g.hl(3, 23, 23, 'k'); g.hl(3, 29, 23, 'k'); g.hl(3, 24, 23, 't');
  g.stamp(5, 24, BOOK); g.hl(17, 26, 7, 'w'); g.hl(17, 27, 5, 'c');
  // entrance
  g.r(3, 30, 23, 7, 'A'); g.hl(3, 30, 23, 'n');
  g.box(10, 31, 9, 6, 'c'); g.vl(14, 32, 5, 'k'); g.p(11, 32, 'w'); g.p(15, 32, 'w'); g.hl(11, 35, 3, 'C'); g.hl(15, 35, 3, 'C');
  win(g, 4, 32, 5, 4); win(g, 20, 32, 5, 4);
  g.p(13, 34, 'l'); g.p(15, 34, 'l');
  g.hl(1, 37, 30, 'x'); g.hl(1, 38, 30, 'a');
  g.outline(); def('lib_city', g); }

// ---- gym_city: modern sports gym ----
{ const g = new G(32, 40);
  // barrel roof
  for (let y = 3; y <= 10; y++) { const half = Math.round(Math.sqrt(Math.max(0, 1 - ((10.5 - y) / 8.2) ** 2)) * 14.5); g.hl(16 - half, y, half * 2, 'x'); }
  for (let y = 3; y <= 10; y++) { const [L, R] = rowSpan(g, y); for (let x = L; x <= R; x++) { if (x % 4 === 1) g.p(x, y, 'a'); if (x >= R - 1) g.p(x, y, 'A'); } }
  g.hl(1, 11, 30, 'k');
  // body
  g.r(2, 12, 28, 25, 'a'); g.vl(2, 12, 25, 'x'); g.vl(29, 12, 25, 'A');
  // sign band with dumbbell
  g.r(3, 12, 26, 7, 'u'); g.hl(3, 12, 26, 's'); g.hl(3, 18, 26, 'r');
  g.stamp(10, 13, ['.ww.....ww.', 'www.....www', 'wwwwwwwwwww', 'www.....www', '.ww.....ww.'].map(r => r));
  g.stamp(10, 13, ['...........'.replace(/./g, '.')]);
  g.hl(3, 19, 26, 'k');
  // big glass hall
  g.r(4, 20, 24, 8, 'c'); g.hl(4, 26, 24, 'C'); g.hl(4, 27, 24, 'C');
  for (let x = 4; x < 28; x++) for (let y = 20; y < 28; y++) if ((x - y) % 10 === 0 || (x - y) % 10 === 1) g.p(x, y, 'w');
  for (let x = 9; x < 28; x += 6) g.vl(x, 20, 8, 'T');
  g.hl(5, 25, 22, 'u'); // running track stripe
  g.hl(3, 28, 26, 'A');
  // canopy + entrance
  g.r(8, 29, 16, 2, 'n'); g.hl(8, 29, 16, 'A'); g.hl(9, 31, 14, 'A');
  g.box(11, 31, 10, 6, 'c'); g.vl(16, 32, 5, 'k'); g.p(12, 32, 'w'); g.p(17, 32, 'w'); g.p(15, 34, 'l'); g.p(17, 34, 'l');
  win(g, 3, 31, 6, 5, { mull: true }); win(g, 23, 31, 6, 5, { mull: true });
  g.hl(1, 37, 30, 'x'); g.hl(1, 38, 30, 'a');
  g.outline(); def('gym_city', g); }

// ---- house_city: small apartment ----
{ const g = new G(32, 40);
  g.r(5, 1, 6, 3, 'A'); g.hl(5, 1, 6, 'a'); g.vl(10, 1, 3, 'n'); g.vl(6, 4, 1, 'n'); g.vl(9, 4, 1, 'n');
  g.r(21, 2, 4, 2, 'x'); g.hl(21, 3, 4, 'a');
  g.r(3, 4, 26, 2, 'x'); g.hl(3, 5, 26, 'A');
  g.r(4, 6, 24, 31, 'e'); g.vl(4, 6, 31, 'w'); g.vl(26, 6, 31, 'd'); g.vl(27, 6, 31, 'D');
  for (const fy of [7, 15, 23]) {
    for (const wx of [6, 18]) {
      win(g, wx, fy, 7, 5, { mull: true, mullX: 3 });
      g.hl(wx - 1, fy + 5, 9, 'n'); g.hl(wx - 1, fy + 6, 9, 'A');
      for (let i = 0; i < 9; i += 2) g.p(wx - 1 + i, fy + 6, 'n');
    }
    g.hl(4, fy + 7, 24, 'd');
  }
  g.stamp(7, 10, ['jhj']); g.stamp(19, 18, ['juj']); g.stamp(20, 26, ['jhj']);
  // ground floor entrance
  g.r(4, 31, 24, 6, 'a'); g.hl(4, 31, 24, 'x');
  g.box(12, 31, 8, 6, 'c'); g.vl(15, 32, 5, 'k'); g.p(13, 32, 'w'); g.p(16, 32, 'w'); g.hl(10, 30, 12, 'T'); g.hl(10, 29, 12, 't');
  g.box(5, 32, 4, 4, 'u'); g.hl(6, 33, 2, 'k');
  g.box(23, 32, 3, 3, 'l');
  g.hl(2, 37, 28, 'x'); g.hl(2, 38, 28, 'a');
  g.outline(); def('house_city', g); }

// ================= RESIDENTS (12x16) =================
const NEUTRAL = [
  '............',
  '....kkkk....',
  '..kkbbbbkk..',
  '.kbbbbbbbbk.',
  '.kbffbbffbk.',
  '.kffffffffk.',
  '.kfkffffkfk.',
  '.kfkffffkfk.',
  '.ksffffffsk.',
  '..kffFFffk..',
  '...kkkkkk...',
  '..kuuuuuuk..',
  '.kfuuuuuufk.',
  '..kvvvvvvk..',
  '..kvvkkvvk..',
  '..kkk..kkk..',
];
const HAPPY = [
  '..........l.',
  '....kkkk.lwl',
  '..kkbbbbkkl.',
  '.kbbbbbbbbk.',
  '.kbffbbffbk.',
  '.kffffffffk.',
  '.kfkffffkfk.',
  '.kfkffffkfk.',
  '.ksfRRRRfsk.',
  '..kffRRffk..',
  '.k.kkkkkk.k.',
  'kfkuuuuuukfk',
  '.kkuuuuuukk.',
  '..kvvvvvvk..',
  '..kvvkkvvk..',
  '..kkk..kkk..',
];
const SAD = [
  '............',
  '............',
  '....kkkk....',
  '..kkbbbbkk..',
  '.kbbbbbbbbk.',
  '.kbbbbbbbbk.',
  '.kbbfbbfbbkc',
  '.kffffffffkC',
  '.kfkkffkkfk.',
  '.kfffFFfffk.',
  '..kfFffFfk..',
  '...kkkkkk...',
  '..kuuuuuuk..',
  '..kfuuuufk..',
  '..kvvkkvvk..',
  '..kkk..kkk..',
];
// frame 1: body bobs up 1px, left foot lifted
const walkB = rows => [...rows.slice(1, 14), '..kvvkkvvk..', '..kkkkkvvk..', '.......kkk..'];
// sad frame 1: no bob, shuffles one foot
const walkBsad = rows => [...rows.slice(0, 14), '..kvvk.kkk..', '..kkk.......'];
const R12 = rows => ({ w: 12, h: 16, rows });
S.res_happy_0 = R12(HAPPY);
S.res_happy_1 = R12(walkB(HAPPY));
S.res_neutral_0 = R12(NEUTRAL);
S.res_neutral_1 = R12(walkB(NEUTRAL));
S.res_sad_0 = R12(SAD);
S.res_sad_1 = R12(walkBsad(SAD));

// ---------- validate ----------
let bad = 0;
for (const [n, s] of Object.entries(S)) {
  if (s.rows.length !== s.h) { console.log('H', n, s.rows.length); bad++; }
  s.rows.forEach((r, i) => { if (r.length !== s.w) { console.log('W', n, i, r.length, JSON.stringify(r)); bad++; } [...r].forEach(c => { if (!(c in PALETTE)) { console.log('C', n, i, c); bad++; } }); });
}
console.log('sprites', Object.keys(S).length, 'bad', bad);
const used = new Set(); Object.values(S).forEach(s => s.rows.forEach(r => [...r].forEach(c => used.add(c))));
console.log('unused palette:', Object.keys(PALETTE).filter(k => !used.has(k)).join(','), 'colors:', Object.keys(PALETTE).length - 1);

// ---------- emit JS ----------
let js = 'const PALETTE = {\n';
for (const [k, v] of Object.entries(PALETTE)) js += `  '${k}': ${v === null ? 'null' : `'${v}'`},\n`;
js += '};\n\nconst SPRITES = {\n';
for (const [n, s] of Object.entries(S)) {
  js += `  ${n}: { w: ${s.w}, h: ${s.h}, rows: [\n`;
  s.rows.forEach(r => js += `    '${r}',\n`);
  js += '  ] },\n';
}
js += '};\n';
fs.writeFileSync(path.join(OUT, 'sprites.js'), js);

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
const only = process.argv[2] ? process.argv[2].split(',') : null;
const list = Object.entries(S).filter(([n]) => !only || only.some(o => n.includes(o)));
const SC = +(process.argv[3] || 5), PAD = 4;
let W = 0, H = 0, x = PAD, rowH = 0; const pos = [];
const MAXW = 700;
for (const [n, s] of list) { if (x + s.w * SC + PAD > MAXW) { x = PAD; H += rowH + PAD; rowH = 0; } pos.push([n, s, x, H + PAD]); x += s.w * SC + PAD; rowH = Math.max(rowH, s.h * SC); W = Math.max(W, x); }
H += rowH + PAD * 2;
const px = Array.from({ length: W * H }, () => [246, 239, 224]);
for (const [n, s, ox, oy] of pos) s.rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === '.') return; const col = hex(PALETTE[c]); for (let b = 0; b < SC; b++) for (let a = 0; a < SC; a++) px[(oy + j * SC + b) * W + ox + i * SC + a] = col; }));
fs.writeFileSync(path.join(OUT, 'preview.png'), makePNG(W, H, px));
console.log('preview', W, H);
