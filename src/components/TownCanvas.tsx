// 街の描画。指（マウス）でドラッグして動かし、タップで建物を選ぶ。
import { useEffect, useRef } from 'react';
import { getSprite } from '../render/spriteCache';
import { residentLook, residentMood } from '../render/residents';
import { TILE, type TownLayout } from '../render/townLayout';

interface Props {
  layout: TownLayout;
  morale: number;
  residents: number;
  /** 選択中の配置物のキー（PlacedItem.key） */
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** 1アート画素あたりの CSS ピクセル数 */
  zoom: number;
  /** 住民をタップしたとき（住民の番号） */
  onResidentTap?: (index: number) => void;
}

const TAP_SLOP = 6; // これ以上動いたらドラッグ扱い（CSS px）
const RESIDENT = { w: 12, h: 16 };
const RESIDENT_HIT_MARGIN = 3; // 小さくて動くので、当たり判定を少し広げる（アート画素）
const TALK_MS = 4000;

function pingPong(t: number, speed: number, offset: number, range: number): number {
  if (range <= 0) return 0;
  const p = (t * speed + offset) % (range * 2);
  return p < range ? p : range * 2 - p;
}

/** 頭の上の小さな吹き出し（白地に「…」）。cx は中心、bottom は下端（アート座標） */
function drawSpeechMark(ctx: CanvasRenderingContext2D, cx: number, bottom: number) {
  const w = 9;
  const h = 6;
  const x = Math.round(cx - w / 2);
  const y = bottom - h - 2;
  ctx.fillStyle = '#3b2a2e';
  ctx.fillRect(x, y, w, h);
  ctx.fillRect(x + 3, y + h, 2, 2); // しっぽ
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#3b2a2e';
  for (const dx of [2, 4, 6]) ctx.fillRect(x + dx, y + 2, 1, 2);
}

/** i 番目の住民の位置（描画とタップ判定で同じ計算を使う）。t は秒 */
function residentPos(i: number, t: number, lay: TownLayout): { x: number; y: number } | null {
  const lane = lay.lanes[i % lay.lanes.length];
  if (!lane) return null;
  const speed = 5 + ((i * 7) % 9);
  const x = lane.x0 + pingPong(t, speed, i * 37, lane.x1 - lane.x0 - RESIDENT.w);
  return { x: Math.round(x), y: lane.y };
}

export function TownCanvas({ layout, morale, residents, selectedKey, onSelect, zoom, onResidentTap }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 描画ループから最新の props を読むための参照
  const live = useRef({ layout, morale, residents, selectedKey, zoom });
  live.current = { layout, morale, residents, selectedKey, zoom };
  const cam = useRef({ x: 0, y: 0, centered: false });
  const view = useRef({ cssW: 1, cssH: 1, dpr: 1 });
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onResidentTapRef = useRef(onResidentTap);
  onResidentTapRef.current = onResidentTap;
  /** 話している住民（吹き出しの印を出す） */
  const talk = useRef<{ index: number; until: number } | null>(null);

  /**
   * 実際に描かれる倍率（CSS px / アート画素）。
   * にじみ防止で「アート1画素 = 整数個の実画素」に丸めて描くので、devicePixelRatio が 1.5 などのときは
   * zoom とずれる。カメラ・ドラッグ・タップ判定はすべてこの値を使うこと。
   */
  const effZoom = () => {
    const { dpr } = view.current;
    return Math.max(1, Math.round(live.current.zoom * dpr)) / dpr;
  };

  // カメラが地図の外に出ないようにする。地図が画面より小さければ中央に置く
  const clampCam = () => {
    const lay = live.current.layout;
    const z = effZoom();
    const vw = view.current.cssW / z;
    const vh = view.current.cssH / z;
    cam.current.x = lay.width <= vw ? (lay.width - vw) / 2 : Math.min(Math.max(0, cam.current.x), lay.width - vw);
    cam.current.y = lay.height <= vh ? (lay.height - vh) / 2 : Math.min(Math.max(0, cam.current.y), lay.height - vh);
  };

  // サイズ変更
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.max(1, wrap.clientWidth);
      const cssH = Math.max(1, wrap.clientHeight);
      view.current = { cssW, cssH, dpr };
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      if (!cam.current.centered) {
        // 最初は地図の中央を表示
        const z = effZoom();
        cam.current.x = (live.current.layout.width - cssW / z) / 2;
        cam.current.y = (live.current.layout.height - cssH / z) / 2;
        cam.current.centered = true;
      }
      clampCam();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    // ブラウザの拡大縮小などで devicePixelRatio だけが変わった場合にも追従する
    window.addEventListener('resize', resize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  // 拡大率や地図が変わったら、画面中央を保ったまま範囲を直す
  const prevEff = useRef<number | null>(null);
  useEffect(() => {
    const { cssW, cssH } = view.current;
    const z1 = effZoom();
    const z0 = prevEff.current ?? z1;
    const cx = cam.current.x + cssW / z0 / 2;
    const cy = cam.current.y + cssH / z0 / 2;
    cam.current.x = cx - cssW / z1 / 2;
    cam.current.y = cy - cssH / z1 / 2;
    prevEff.current = z1;
    clampCam();
  }, [zoom, layout]);

  // 描画ループ
  useEffect(() => {
    let raf = 0;
    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const { layout: lay, morale: m, residents: count, selectedKey: sel, zoom: z } = live.current;
      const { dpr } = view.current;
      // 1アート画素 = 整数個の実画素 にしてにじみを防ぐ
      const dev = Math.max(1, Math.round(z * dpr));
      const ox = -Math.round(cam.current.x * dev);
      const oy = -Math.round(cam.current.y * dev);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#5c9a4e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dev, 0, 0, dev, ox, oy);
      ctx.imageSmoothingEnabled = false;

      lay.tiles.forEach((row, y) => row.forEach((name, x) => {
        const sp = getSprite(name);
        if (sp) ctx.drawImage(sp, x * TILE, y * TILE);
      }));

      for (const it of lay.items) {
        const sp = getSprite(it.sprite, { faded: it.faded });
        if (sp) ctx.drawImage(sp, it.x, it.y);
      }

      const t = ts / 1000;
      const frame = Math.floor(t / 0.25) % 2;
      const talking = talk.current && ts < talk.current.until ? talk.current.index : -1;
      for (let i = 0; i < count; i++) {
        const pos = residentPos(i, t, lay);
        if (!pos) break;
        const look = residentLook(i);
        const mood = residentMood(i, m);
        const sp = getSprite(`res_${mood}_${frame}`, { swap: look.swap, swapKey: look.key });
        if (!sp) continue;
        ctx.drawImage(sp, pos.x, pos.y);
        if (i === talking) drawSpeechMark(ctx, pos.x + RESIDENT.w / 2, pos.y - 2);
      }

      if (sel) {
        const it = lay.items.find(i => i.key === sel);
        if (it) {
          ctx.fillStyle = '#ffe590';
          const blink = Math.floor(t * 2) % 2 === 0;
          if (blink) {
            ctx.fillRect(it.x - 1, it.y - 1, it.w + 2, 1);
            ctx.fillRect(it.x - 1, it.y + it.h, it.w + 2, 1);
            ctx.fillRect(it.x - 1, it.y, 1, it.h);
            ctx.fillRect(it.x + it.w, it.y, 1, it.h);
          }
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ドラッグとタップ
  const drag = useRef<{ id: number; sx: number; sy: number; cx: number; cy: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 捕捉できなくても、ドラッグ・タップ自体は続けられる
    }
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: cam.current.x, cy: cam.current.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP) d.moved = true;
    if (!d.moved) return;
    const z = effZoom();
    cam.current.x = d.cx - dx / z;
    cam.current.y = d.cy - dy / z;
    clampCam();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const z = effZoom();
    const ax = cam.current.x + (e.clientX - rect.left) / z;
    const ay = cam.current.y + (e.clientY - rect.top) / z;

    // 住民は建物より手前に描くので先に調べる（後に描いた住民ほど手前）
    if (onResidentTapRef.current) {
      const now = performance.now();
      const m = RESIDENT_HIT_MARGIN;
      for (let i = live.current.residents - 1; i >= 0; i--) {
        const pos = residentPos(i, now / 1000, live.current.layout);
        if (!pos) continue;
        if (ax >= pos.x - m && ax < pos.x + RESIDENT.w + m && ay >= pos.y - m && ay < pos.y + RESIDENT.h + m) {
          talk.current = { index: i, until: now + TALK_MS };
          onResidentTapRef.current(i);
          return;
        }
      }
    }

    // 手前（下）にある建物を優先
    const hit = [...live.current.layout.items].reverse().find(
      it => (it.goalId || it.facilityId) && ax >= it.x && ax < it.x + it.w && ay >= it.y && ay < it.y + it.h,
    );
    onSelectRef.current(hit?.key ?? null);
  };
  const onPointerCancel = () => {
    drag.current = null;
  };

  return (
    <div className="town-canvas" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        aria-label="街のようす。ドラッグで移動、建物をタップで選択、住民をタップで名言"
        role="img"
      />
    </div>
  );
}
