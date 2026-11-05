# ひびつみ（Hibitsumi）

**日々を積んで、まちを育てる。**

目標を毎日チェックすると住民のやる気が上がり、ドット絵の街が集落から都市へ育っていく自己管理アプリ（PWA）。
仕様は [docs/SPEC.md](docs/SPEC.md)。

## 使い方（開発）

```bash
npm install
npm run dev        # 開発サーバー
npm test           # 自動テスト
npm run typecheck  # 型チェック
npm run build      # 本番ビルド（dist/）
```

## フォルダ構成

| 場所 | 内容 |
|---|---|
| `src/core/` | ゲームのルール（日付・やる気・コイン・操作）。UIに依存しない純粋関数とテスト |
| `src/storage/` | 保存（IndexedDB）、形式チェック、データ移行 |
| `src/render/` | 街の配置・ドット絵の描画・住民の見た目 |
| `src/components/` | 画面 |
| `tools/sprites/` | ドット絵の元データと生成スクリプト |

## ドット絵を変更したとき

```bash
node tools/sprites/gen.cjs                # 基本のスプライト → tools/sprites/sprites.js
node tools/sprites/sprites2/gen2.cjs      # 銀行・新聞社・学舎・広場 → new-sprites.json
node tools/sprites/sprites2/gen3.js       # 和風に描き直した図書館(町)・住居 → redraw.json
node tools/sprites/sprites2/gen4.js       # 蔵・がれき・住民のための施設 → sprites4.json
node tools/build-sprite-data.cjs          # → src/render/spriteData.ts（検証つき。同名は後のJSONが優先）
node tools/build-icons.cjs                # アプリアイコン → public/
```
