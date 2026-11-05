// Sprite generator #3: Japanese-style redraws of lib_town / house_village / house_town.
// Writes redraw.json + preview3.png into this folder. Standalone (helpers copied from gen2.js).
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

// ---------- helpers (copied from gen.js / gen2.js) ----------
const OPENBOOK = ['wwwkkxxx', 'wAAwxAAx', 'wwwwxxxx', 'vvvkkvvv'];
const BOOK = ['.kkkkkkkk.', '.kuulluuwk', 'kkkkkkkkkk', 'kvvvllvvwk', 'kkkkkkkkkk'];
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
// kawara (tile) roof as in gen2 bank_town/news_town: vertical tile channels, light top row + left edge
function kawara(g, y0, y1, Ltop, Lbot) {
  trapRoof(g, y0, y1, Ltop, Lbot, 'A');
  for (let y = y0; y <= y1; y++) { const [L, R] = rowSpan(g, y); for (let x = L; x <= R; x++) { if (g.g(x, y) !== 'A') continue; if (y === y0) g.p(x, y, 'a'); else if ((x - L) % 2 === 1) g.p(x, y, 'n'); else if (x <= L + 1) g.p(x, y, 'a'); } }
}
// tiled ridge with upturned ends (onigawara)
function kawaraRidge(g, y, L, R) { g.hl(L + 1, y, R - L - 1, 'n'); g.hl(L + 2, y - 1, R - L - 3, 'k'); g.p(L, y - 1, 'n'); g.p(R, y - 1, 'n'); g.p(L, y - 2, 'k'); g.p(R, y - 2, 'k'); }

// ================= house_village: 古民家 (kayabuki farmhouse) =================
{ const g = new G(32, 32);
  // thick thatched roof, deep cut eave
  thatchRoof(g, 4, 15, 9, 1);
  for (let x = 1; x <= 30; x++) { g.p(x, 14, (x % 3 === 0) ? 'D' : 'Y'); g.p(x, 15, (x % 2) ? 'D' : 'Y'); }
  g.p(1, 14, 'y'); g.p(2, 14, 'e'); g.p(1, 15, 'Y');
  ridge(g, 4, 9, 22);
  // smoke-vent gable (kemudashi) near the ridge
  g.stamp(13, 5, ['..kk..', '.kOOk.', 'kOoOOk', 'OOOOOO']);
  g.p(15, 6, 'o');
  g.hl(1, 16, 30, 'k');
  // walls: dark posts + beam, earthen plaster
  g.r(4, 17, 24, 8, 'e'); g.hl(4, 17, 24, 'O'); g.hl(5, 18, 22, 'd');
  for (const x of [4, 11, 20, 27]) g.vl(x, 17, 8, 'O');
  // shoji (left + right)
  shoji(g, 5, 19, 6, 6, { shade: true }); shoji(g, 21, 19, 6, 6, { shade: true });
  // open doma entrance: dark interior, straw sack + glow
  g.box(12, 18, 8, 7, 'Q'); g.hl(13, 23, 6, 'D'); g.p(17, 20, 'l'); g.p(17, 21, 'Y');
  g.r(12, 18, 4, 7, 'k'); g.r(13, 19, 3, 5, 'o'); g.vl(13, 19, 5, 'p'); g.hl(13, 21, 3, 'O'); g.p(15, 22, 'O');
  // hanging dried persimmons (hoshigaki) from the eave
  for (const hx of [8, 24]) { g.vl(hx, 17, 1, 'Y'); g.p(hx, 18, 'u'); g.p(hx, 19, 'Y'); g.p(hx, 20, 'u'); }
  // engawa (veranda)
  g.hl(3, 25, 26, 'p'); g.hl(3, 26, 26, 'O'); g.p(3, 25, 'e'); g.p(4, 25, 'e');
  g.hl(4, 27, 24, 'n'); for (const x of [4, 15, 27]) g.p(x, 27, 'O');
  // stone foundation + step stone
  g.hl(3, 28, 26, 'a'); g.hl(3, 29, 26, 'A'); for (let x = 5; x < 29; x += 5) { g.p(x, 28, 'x'); g.p(x + 2, 29, 'n'); }
  g.r(13, 30, 7, 1, 'a'); g.p(13, 30, 'x'); g.p(14, 30, 'x');
  g.settle(); g.outline(); def('house_village', g); }

// ================= house_town: 町家 (machiya townhouse) =================
{ const g = new G(32, 40);
  kawara(g, 4, 10, 5, 1); kawaraRidge(g, 3, 4, 27);
  g.hl(0, 10, 32, 'n'); g.hl(1, 11, 30, 'k');
  // low 2nd floor (zushi-nikai): plaster + mushiko-mado slatted windows
  g.r(3, 12, 26, 8, 'x'); g.hl(4, 12, 24, 'a'); g.vl(3, 12, 8, 'O'); g.vl(28, 12, 8, 'O'); g.vl(27, 13, 7, 'a');
  for (const wx of [6, 18]) {
    g.box(wx, 14, 8, 5, 'n');
    for (let x = wx + 1; x < wx + 7; x += 2) g.vl(x, 15, 3, 'x');
    g.p(wx + 1, 15, 'w'); g.p(wx, 14, 'x'); g.p(wx + 7, 14, 'x'); g.p(wx, 18, 'a'); g.p(wx + 7, 18, 'a');
  }
  // pent roof (hisashi) between floors
  g.hl(1, 20, 30, 'a'); g.hl(1, 21, 30, 'A'); for (let x = 2; x < 31; x += 2) g.vl(x, 20, 2, 'n'); g.p(1, 20, 'x'); g.hl(1, 22, 30, 'k');
  // ground floor: wooden frame
  g.r(3, 23, 26, 11, 'o'); g.vl(3, 23, 11, 'O'); g.vl(28, 23, 11, 'O'); g.hl(4, 23, 24, 'O'); g.vl(4, 24, 10, 'p');
  // senbon-goshi (fine wooden lattice) front
  g.box(5, 24, 11, 7, 'O');
  for (let x = 6; x < 15; x += 2) { g.vl(x, 25, 5, 'p'); g.p(x, 25, 'e'); }
  g.hl(6, 26, 9, 'o'); g.p(6, 26, 'p');
  // inuyarai (curved bamboo fence) at the base of the lattice
  g.stamp(4, 31, ['.pOpOpOpOpOp.', 'kpOpOpOpOpOpk', 'oOoOoOoOoOoOO']);
  // entrance with indigo noren
  g.box(16, 24, 10, 10, 'Q'); g.hl(17, 32, 8, 'D'); g.p(18, 29, 'l'); g.p(18, 30, 'Y');
  g.hl(15, 24, 12, 'O'); g.p(15, 24, 'p');
  g.r(17, 25, 8, 4, 'v'); g.hl(17, 25, 8, 't'); g.vl(20, 26, 3, 'T'); g.vl(21, 26, 3, 'T');
  g.stamp(17, 26, ['.w.', 'w.w']); g.stamp(22, 26, ['.w.', 'w.w']); g.hl(17, 28, 8, 'T');
  // red paper lantern (chochin)
  g.stamp(26, 24, ['.O.', 'srr', 'rrR', '.O.']);
  // potted plant (indigo ceramic pot) by the door
  g.stamp(26, 28, ['.hj.', 'hgjj', 'jgug', '.jj.', 'tttT', '.tT.']);
  // stone base + step
  g.hl(3, 34, 26, 'A'); g.hl(3, 35, 26, 'n'); g.r(15, 36, 12, 1, 'a'); g.p(15, 36, 'x'); g.p(16, 36, 'x');
  g.settle(); g.outline(); def('house_town', g); }

// ================= lib_town: 和洋折衷 Taisho library =================
{ const g = new G(32, 40);
  kawara(g, 6, 12, 5, 1); kawaraRidge(g, 5, 4, 27);
  // central plaster gable (chidori-hafu) with wooden barge boards + round window
  for (let y = 1; y <= 12; y++) { const half = Math.round((y - 1) * 0.8) + 1;
    g.hl(16 - half, y, half * 2, 'x'); g.p(15 + half - 1, y, 'a'); g.p(16 - half, y, 'p'); g.p(15 + half, y, 'O'); g.p(16 - half - 1, y, 'k'); g.p(16 + half, y, 'k'); }
  g.hl(15, 0, 2, 'k');
  g.stamp(14, 5, ['.kk.', 'kwck', 'kcCk', '.kk.']);
  // gable woodwork: tie beam + short struts (tsuma-kazari)
  g.hl(9, 10, 14, 'o'); g.hl(16, 10, 7, 'O'); g.p(9, 10, 'p');
  for (const x of [12, 19]) g.p(x, 9, 'O'); for (const x of [13, 18]) g.vl(x, 11, 2, 'O');
  g.p(15, 9, 'O'); g.p(16, 9, 'O');
  g.hl(0, 13, 32, 'n'); g.hl(1, 14, 30, 'k');
  // 2nd floor: plaster with wooden posts
  g.r(3, 15, 26, 9, 'x'); g.hl(4, 15, 24, 'a'); g.vl(3, 15, 9, 'O'); g.vl(28, 15, 9, 'O'); g.vl(27, 16, 8, 'a');
  // tall sash windows with white sills
  for (const wx of [5, 23]) { win(g, wx, 16, 4, 7, { bar: true, barY: 3 }); g.hl(wx - 1, 23, 6, 'w'); }
  // wooden signboard with book emblem
  g.box(11, 16, 10, 7, 'O'); g.hl(12, 17, 8, 'o'); g.p(12, 18, 'o');
  g.stamp(12, 18, OPENBOOK);
  // pent roof
  g.hl(1, 24, 30, 'a'); g.hl(1, 25, 30, 'A'); for (let x = 2; x < 31; x += 2) g.vl(x, 24, 2, 'n'); g.p(1, 24, 'x'); g.hl(1, 26, 30, 'k');
  // ground floor
  g.r(3, 27, 26, 9, 'x'); g.vl(3, 27, 9, 'O'); g.vl(28, 27, 9, 'O'); g.hl(4, 27, 24, 'a'); g.vl(27, 28, 8, 'a');
  g.r(4, 33, 24, 3, 'o'); g.hl(4, 33, 24, 'O'); g.hl(4, 34, 24, 'p');
  // bookshelf windows
  const SP = 'uvjlrytwvu';
  for (const wx of [5, 21]) {
    g.box(wx, 28, 6, 7, 'O');
    for (const sy of [29, 32]) for (let i = 0; i < 4; i++) g.vl(wx + 1 + i, sy, 2, SP[(i + sy + wx) % SP.length]);
    g.hl(wx + 1, 31, 4, 'O'); g.p(wx + 1, 29, 'w'); g.p(wx + 4, 33, 'c');
  }
  // glass double door with lit fanlight
  g.box(13, 27, 6, 9, 'O'); g.hl(14, 28, 4, 'l'); g.r(14, 29, 4, 4, 'c'); g.vl(15, 29, 7, 'k'); g.vl(16, 29, 7, 'k');
  g.p(14, 29, 'w'); g.hl(14, 32, 4, 'C'); g.p(14, 33, 'o'); g.p(17, 33, 'o');
  // vertical name plaque by the door
  g.box(11, 28, 2, 7, 'w'); g.r(11, 28, 2, 7, 'w'); g.vl(12, 29, 5, 'x'); g.p(11, 29, 'n'); g.p(11, 31, 'n'); g.p(11, 33, 'n'); g.vl(11, 28, 1, 'k');
  // stone base + steps
  g.hl(2, 36, 28, 'A'); g.r(11, 37, 10, 1, 'x'); g.r(10, 38, 12, 1, 'a'); g.p(10, 38, 'x');
  g.hl(2, 37, 9, 'n'); g.hl(21, 37, 9, 'n');
  g.settle(); g.outline(); def('lib_town', g); }

// ---------- validate ----------
const NAMES = ['lib_town', 'house_village', 'house_town'];
const SIZES = { lib_town: [32, 40], house_village: [32, 32], house_town: [32, 40] };
let bad = 0;
for (const [n, s] of Object.entries(S)) {
  if (s.rows.length !== s.h) { console.log('H', n, s.rows.length); bad++; }
  if (SIZES[n] && (s.w !== SIZES[n][0] || s.h !== SIZES[n][1])) { console.log('SIZE', n, s.w, s.h); bad++; }
  s.rows.forEach((r, i) => { if (r.length !== s.w) { console.log('W', n, i, r.length); bad++; } [...r].forEach(c => { if (!(c in PALETTE)) { console.log('C', n, i, c); bad++; } }); });
  if (!/[^.]/.test(s.rows[s.h - 1])) { console.log('EMPTY BOTTOM ROW', n); bad++; }
}
const missing = NAMES.filter(n => !S[n]);
console.log('sprites', Object.keys(S).length, '/', NAMES.length, 'missing:', missing.join(',') || 'none', 'bad', bad, bad ? 'VALIDATION FAILED' : 'VALIDATION OK');
for (const [n, s] of Object.entries(S)) console.log(' ', n, s.w + 'x' + s.h);
if (bad) process.exit(1);

// ---------- emit JSON ----------
const outJ = {}; for (const n of NAMES) if (S[n]) outJ[n] = S[n];
fs.writeFileSync(path.join(OUT, 'redraw.json'), JSON.stringify(outJ, null, 1));

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
// reference sprites (read-only): gym_town + old versions from ../sprites.js, bank_town/news_town from new-sprites.json
const refRow = [], oldRow = [];
try { const src = fs.readFileSync(path.join(OUT, '..', 'sprites.js'), 'utf8'); const all = new Function(src + '; return SPRITES;')();
  if (all.gym_town) refRow.push(['gym_town', all.gym_town]);
  for (const n of NAMES) if (all[n]) oldRow.push(['old:' + n, all[n]]); } catch (e) { console.log('sprites.js refs unavailable:', e.message); }
try { const j = JSON.parse(fs.readFileSync(path.join(OUT, 'new-sprites.json'), 'utf8')); for (const n of ['bank_town', 'news_town']) if (j[n]) refRow.push([n, j[n]]); } catch (e) { console.log('new-sprites.json refs unavailable:', e.message); }
const SC = +(process.argv[2] || 4), PAD = 8;
const groups = [NAMES.filter(n => S[n]).map(n => [n, S[n]]), refRow, oldRow].filter(r => r.length);
let W = 0, H = PAD; const pos = [];
for (const row of groups) { let x = PAD; for (const [n, s] of row) { pos.push([n, s, x, H + (40 - s.h) * SC]); x += s.w * SC + PAD; } W = Math.max(W, x); H += 40 * SC + PAD; }
const px = Array.from({ length: W * H }, () => [246, 239, 224]);
for (const [n, s, ox, oy] of pos) s.rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === '.') return; const col = hex(PALETTE[c]); for (let b = 0; b < SC; b++) for (let a = 0; a < SC; a++) px[(oy + j * SC + b) * W + ox + i * SC + a] = col; }));
fs.writeFileSync(path.join(OUT, 'preview3.png'), makePNG(W, H, px));
console.log('preview3', W, H);
