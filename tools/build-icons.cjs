// アプリアイコン（PNG）をドット絵から作る
//   node tools/build-icons.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const code = fs.readFileSync(path.join(__dirname, 'sprites', 'sprites.js'), 'utf8');
const { PALETTE, SPRITES } = new Function(`${code}\nreturn { PALETTE, SPRITES };`)();
const SPRITE = 'lib_village';
const BG = [246, 239, 224];

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function png(W, H, px) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc = buf => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const o = y * (W * 3 + 1) + 1 + x * 3;
      const p = px[y * W + x];
      raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2];
    }
  }
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(W, 0);
  ih.writeUInt32BE(H, 4);
  ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function icon(size) {
  const s = SPRITES[SPRITE];
  // マスク型アイコンでも切れないよう、絵は全体の約6割に収める
  const scale = Math.max(1, Math.floor((size * 0.6) / Math.max(s.w, s.h)));
  const ox = Math.floor((size - s.w * scale) / 2);
  const oy = Math.floor((size - s.h * scale) / 2);
  const px = Array.from({ length: size * size }, () => BG);
  s.rows.forEach((row, j) => [...row].forEach((c, i) => {
    if (!PALETTE[c]) return;
    const col = hex(PALETTE[c]);
    for (let b = 0; b < scale; b++) for (let a = 0; a < scale; a++) px[(oy + j * scale + b) * size + ox + i * scale + a] = col;
  }));
  return png(size, size, px);
}

const out = path.join(__dirname, '..', 'public');
fs.mkdirSync(out, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(out, name), icon(size));
}
console.log('icons written');
