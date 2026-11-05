// ドット絵の元データ（tools/sprites/ 以下）から src/render/spriteData.ts を作る
//   node tools/build-sprite-data.cjs
// 元データ：
//   tools/sprites/sprites.js            … gen.js が出力（PALETTE と SPRITES を定義）
//   tools/sprites/sprites2/*.json       … 追加の建物（{ 名前: { w, h, rows } }）
// 後から読み込んだ同名のスプライトが優先される（描き直し用）。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'sprites');
const code = fs.readFileSync(path.join(root, 'sprites.js'), 'utf8');
const { PALETTE, SPRITES } = new Function(`${code}\nreturn { PALETTE, SPRITES };`)();

const extraDir = path.join(root, 'sprites2');
if (fs.existsSync(extraDir)) {
  for (const file of fs.readdirSync(extraDir).filter(f => f.endsWith('.json')).sort()) {
    Object.assign(SPRITES, JSON.parse(fs.readFileSync(path.join(extraDir, file), 'utf8')));
  }
}

// 検証：1つでも誤りがあれば出力しない
const errors = [];
for (const [name, s] of Object.entries(SPRITES)) {
  if (s.rows.length !== s.h) errors.push(`${name}: 行数 ${s.rows.length} != ${s.h}`);
  s.rows.forEach((r, i) => {
    if (r.length !== s.w) errors.push(`${name} 行${i}: 幅 ${r.length} != ${s.w}`);
    for (const c of r) if (!(c in PALETTE)) errors.push(`${name} 行${i}: 未定義の色 '${c}'`);
  });
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

let out = '// 自動生成ファイル（tools/build-sprite-data.cjs）。直接編集しないこと。\n\n';
out += 'export const PALETTE: Record<string, string | null> = {\n';
for (const [k, v] of Object.entries(PALETTE)) out += `  ${JSON.stringify(k)}: ${v === null ? 'null' : JSON.stringify(v)},\n`;
out += '};\n\nexport interface SpriteDef {\n  w: number;\n  h: number;\n  rows: string[];\n}\n\n';
out += 'export const SPRITES: Record<string, SpriteDef> = {\n';
for (const [name, s] of Object.entries(SPRITES)) {
  out += `  ${name}: { w: ${s.w}, h: ${s.h}, rows: [\n`;
  for (const r of s.rows) out += `    ${JSON.stringify(r)},\n`;
  out += '  ] },\n';
}
out += '};\n';
const dest = path.join(__dirname, '..', 'src', 'render', 'spriteData.ts');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`spriteData.ts: ${Object.keys(SPRITES).length} sprites`);
