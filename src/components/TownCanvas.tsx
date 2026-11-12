// 街の描画。指（マウス）でドラッグして動かし、タップで建物を選ぶ。
import { useEffect, useRef } from 'react';
import { LAMP_LIGHTS, particles, seasonVariant, tint, WINDOW_LIGHTS, type Ambience } from '../render/ambience';
import { getSprite } from '../render/spriteCache';
import { residentLook, residentMood } from '../render/residents';
import {
  RESIDENT_H, RESIDENT_W, stepWalkers, syncWalkers, tapWalker, walkerMark, walkerPose, type MarkKind, type SpecialKind, type Walker,
} from '../render/walkers';
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
  /** 住民をタップしたとき（住民の番号と、起きたこと） */
  onResidentTap?: (index: number, result: 'react' | SpecialKind) => void;
  /** 季節・時間帯・天気の見た目 */
  ambience: Ambience;
  /** 地形を置くモード：タップしたマス */
  onTileTap?: (tx: number, ty: number) => void;
  /** 配置を変えるモード：タップした地点（アート座標）と、そこにある動かせる物のキー */
  onPlaceTap?: (ax: number, ay: number, hitKey: string | null) => void;
}

const TAP_SLOP = 6; // これ以上動いたらドラッグ扱い（CSS px）
const RESIDENT_HIT_MARGIN = 3; // 小さくて動くので、当たり判定を少し広げる（アート画素）

/** 吹き出しの中の小さな絵（5×4）。# が色つき */
const MARKS: Record<MarkKind, readonly string[]> = {
  dots: ['.....', '#.#.#', '.....', '.....'],
  note: ['..##.', '..#.#', '###..', '##...'],
  bang: ['#.#..', '#.#..', '.....', '#.#..'],
  ask: ['###..', '..#..', '.#...', '.#...'],
  heart: ['##.##', '#####', '.###.', '..#..'],
  zzz: ['####.', '..#..', '.#...', '####.'],
  sweat: ['..#..', '.###.', '.###.', '..#..'],
  tear: ['#...#', '#...#', '.....', '#...#'],
  blush: ['..#.#', '.#.#.', '#.#..', '.....'],
  sparkle: ['..#..', '.###.', '#####', '.#.#.'],
};

/** 頭の上の小さな吹き出し。cx は中心、bottom は下端（アート座標） */
function drawMark(ctx: CanvasRenderingContext2D, cx: number, bottom: number, kind: MarkKind, color: string) {
  const w = 9;
  const h = 6;
  const x = Math.round(cx - w / 2);
  const y = bottom - h - 2;
  ctx.fillStyle = '#3b2a2e';
  ctx.fillRect(x, y, w, h);
  ctx.fillRect(x + 3, y + h, 2, 2); // しっぽ
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = color;
  MARKS[kind].forEach((row, j) => [...row].forEach((c, i) => { if (c === '#') ctx.fillRect(x + 2 + i, y + 1 + j, 1, 1); }));
}



export function TownCanvas({ layout, morale, residents, selectedKey, onSelect, zoom, onResidentTap, onPlaceTap, onTileTap, ambience }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 描画ループから最新の props を読むための参照
  const live = useRef({ layout, morale, residents, selectedKey, zoom, ambience });
  live.current = { layout, morale, residents, selectedKey, zoom, ambience };
  const cam = useRef({ x: 0, y: 0, centered: false });
  const view = useRef({ cssW: 1, cssH: 1, dpr: 1 });
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onResidentTapRef = useRef(onResidentTap);
  onResidentTapRef.current = onResidentTap;
  const onPlaceTapRef = useRef(onPlaceTap);
  onPlaceTapRef.current = onPlaceTap;
  const onTileTapRef = useRef(onTileTap);
  onTileTapRef.current = onTileTap;
  /** 歩いている住民（道を1マスずつたどる。タップで立ち止まる） */
  const walkers = useRef<Walker[]>([]);
  const walkersFor = useRef<{ walk: boolean[][] | null; count: number }>({ walk: null, count: -1 });
  const lastTs = useRef<number | null>(null);

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
      const { layout: lay, morale: m, residents: count, selectedKey: sel, zoom: z, ambience: amb } = live.current;
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
        const sp = getSprite(name, seasonVariant(name, amb.season) ?? undefined);
        if (sp) ctx.drawImage(sp, x * TILE, y * TILE);
      }));

      for (const it of lay.items) {
        const sp = getSprite(it.sprite, seasonVariant(it.sprite, amb.season) ?? { faded: it.faded });
        if (sp) ctx.drawImage(sp, it.x, it.y);
      }

      const t = ts / 1000;
      // 住民の数・道が変わったら合わせ、時間を進める（タブが隠れていた間の大きな飛びは切り捨てる）
      if (walkersFor.current.walk !== lay.walk || walkersFor.current.count !== count) {
        walkers.current = syncWalkers(walkers.current, count, lay.walk);
        walkersFor.current = { walk: lay.walk, count };
      }
      const dt = lastTs.current === null ? 0 : Math.min(0.1, (ts - lastTs.current) / 1000);
      lastTs.current = ts;
      stepWalkers(walkers.current, lay.walk, dt, ts);
      // 下にいる住民ほど手前に描く
      const poses = new Map(walkers.current.map(w => [w, walkerPose(w, ts)] as const));
      const order = [...walkers.current].sort((a, b) => poses.get(a)!.y - poses.get(b)!.y);
      for (const w of order) {
        const i = w.index;
        const pose = poses.get(w)!;
        const look = residentLook(i);
        const mood = residentMood(i, m);
        // 動いているときは足を動かす（走るときは速く）
        const fast = w.mode === 'special' && w.special !== null && pose.moving;
        const frame = pose.moving ? Math.floor(t / (fast ? 0.12 : 0.25)) % 2 : 0;
        const sp = getSprite(`res_${mood}_${frame}`, { swap: look.swap, swapKey: look.key });
        if (!sp) continue;
        ctx.save();
        if (pose.lie) {
          // 寝転ぶ：地面の上に横向きに倒す（立っていた位置を中心に、幅16・高さ12に収まる）
          if (pose.left) {
            ctx.translate(pose.x + RESIDENT_W, pose.y + RESIDENT_H);
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(sp, 0, 2 - RESIDENT_H);
          } else {
            ctx.translate(pose.x, pose.y + RESIDENT_H);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(sp, -RESIDENT_W, 2 - RESIDENT_H);
          }
        } else if (pose.left) {
          ctx.translate(pose.x + RESIDENT_W, pose.y);
          ctx.scale(-1, 1);
          ctx.drawImage(sp, 0, 0);
        } else {
          ctx.drawImage(sp, pose.x, pose.y);
        }
        ctx.restore();
        const mark = walkerMark(w);
        const markBottom = pose.lie ? pose.y + RESIDENT_H - RESIDENT_W - 2 : pose.y - 2;
        if (mark) drawMark(ctx, pose.x + RESIDENT_W / 2, markBottom, mark.kind, mark.color);
      }

      // 時間帯の色をかぶせ、夕方・夜は窓と街灯に明かりをともす
      const shade = tint(amb);
      if (shade) {
        ctx.fillStyle = shade;
        ctx.fillRect(-TILE, -TILE, lay.width + TILE * 2, lay.height + TILE * 2);
      }
      if (amb.time === 'night' || amb.time === 'evening') {
        for (const it of lay.items) {
          const v = it.sprite === 'deco_lamp' ? LAMP_LIGHTS : it.place && !it.faded ? WINDOW_LIGHTS : null;
          const sp = v && getSprite(it.sprite, v);
          if (sp) ctx.drawImage(sp, it.x, it.y);
        }
      }
      // 雨・雪・花びら・落ち葉
      for (const pt of particles(amb, t, lay.width, lay.height)) {
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, pt.w, pt.h);
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

    // 地形を置くモードでは、タップしたマスだけを見る
    if (onTileTapRef.current) {
      const lay = live.current.layout;
      if (ax >= 0 && ay >= 0 && ax < lay.width && ay < lay.height) onTileTapRef.current(Math.floor(ax / TILE), Math.floor(ay / TILE));
      return;
    }

    // 配置を変えるモードでは、住民は無視して建物・施設・民家だけを見る
    if (onPlaceTapRef.current) {
      const hit = [...live.current.layout.items].reverse().find(
        it => it.place && ax >= it.x && ax < it.x + it.w && ay >= it.y && ay < it.y + it.h,
      );
      onPlaceTapRef.current(ax, ay, hit?.key ?? null);
      return;
    }

    // 住民は建物より手前に描くので先に調べる（後に描いた住民ほど手前）
    if (onResidentTapRef.current) {
      const now = performance.now();
      const m = RESIDENT_HIT_MARGIN;
      // 手前（下）に描いた住民から調べる
      const order = [...walkers.current].sort((a, b) => walkerPose(b, now).y - walkerPose(a, now).y);
      for (const w of order) {
        const pos = walkerPose(w, now);
        if (ax >= pos.x - m && ax < pos.x + RESIDENT_W + m && ay >= pos.y - m && ay < pos.y + RESIDENT_H + m) {
          const result = tapWalker(w, residentMood(w.index, live.current.morale), now);
          onResidentTapRef.current(w.index, result);
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
