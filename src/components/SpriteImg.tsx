import { useEffect, useRef } from 'react';
import { getSprite, spriteSize, type SpriteVariant } from '../render/spriteCache';

interface Props {
  name: string;
  scale: number;
  variant?: SpriteVariant;
  label?: string;
}

/** スプライト1枚を、にじまない整数倍で表示する */
export function SpriteImg({ name, scale, variant, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = spriteSize(name);
  const faded = variant?.faded ?? false;
  const swapKey = variant?.swapKey ?? '';

  useEffect(() => {
    const cv = ref.current;
    const sp = getSprite(name, variant);
    if (!cv || !sp || !size) return;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.round(scale * dpr));
    cv.width = size.w * k;
    cv.height = size.h * k;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(sp, 0, 0, cv.width, cv.height);
    // variant はオブジェクトなので、中身を表すキー（faded・swapKey）で依存を判定する
  }, [name, scale, faded, swapKey]);

  if (!size) return null;
  return (
    <canvas
      ref={ref}
      className="sprite"
      style={{ width: size.w * scale, height: size.h * scale }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
