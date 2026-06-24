import {
  estimateTextWidth,
  fontPxFromHeight,
  gapPx,
  lineHeight,
  makeRng,
  opacityToAssAlpha,
  randFloat,
  randIntInRange,
} from './geometry';
import type { Border, WatermarkInterval, WatermarkPlan } from './types';

export interface ScheduleConfig {
  textHeightPct: number;
  gapPct: number;
  opacity: number;
  minIntervalSec: number;
  maxIntervalSec: number;
  fontName: string;
}

export interface ScheduleParams {
  durationSec: number;
  width: number;
  height: number;
  /** The watermark text — needed to size/clamp the box so it never overflows the gap. */
  text: string;
  config: ScheduleConfig;
  /** Optional fixed seed for reproducibility (tests); otherwise random per session. */
  seed?: number;
}

const BORDERS: Border[] = ['top', 'bottom', 'left', 'right'];

/**
 * Build an infinite-feeling watermark schedule that tiles the whole video:
 *  - each interval lasts a random 3–12 s, then the watermark "suddenly" jumps;
 *  - each interval hugs a random border (with the configured gap), so the mark
 *    is always near an edge, never floating in the dead centre;
 *  - top/bottom → horizontal text; left/right → vertical text (rotated 90°/270°);
 *  - position along the chosen border is randomized;
 *  - consecutive intervals never reuse the same border, guaranteeing visible movement.
 */
export function generateSchedule(p: ScheduleParams): WatermarkPlan {
  const { durationSec, width: W, height: H, text, config: c } = p;
  const seed = p.seed ?? ((Math.random() * 0x7fffffff) | 0);
  const rng = makeRng(seed);

  const fontPx = fontPxFromHeight(H, c.textHeightPct);
  const alpha = opacityToAssAlpha(c.opacity);
  const gapX = gapPx(W, c.gapPct);
  const gapY = gapPx(H, c.gapPct);
  const lineH = lineHeight(fontPx);
  const textW = estimateTextWidth(text, fontPx);

  const intervals: WatermarkInterval[] = [];
  let t = 0;
  let lastBorder = -1;

  while (t < durationSec - 1e-6) {
    const dur = randFloat(rng, c.minIntervalSec, c.maxIntervalSec);
    const end = Math.min(t + dur, durationSec);

    // Pick a border, never repeating the previous one (always-visible movement).
    let bi = Math.floor(rng() * BORDERS.length);
    if (bi === lastBorder) bi = (bi + 1) % BORDERS.length;
    lastBorder = bi;
    const border = BORDERS[bi];

    const horizontal = border === 'top' || border === 'bottom';
    // Bounding box of the (possibly rotated) text.
    const boxW = horizontal ? textW : lineH;
    const boxH = horizontal ? lineH : textW;
    const halfW = boxW / 2;
    const halfH = boxH / 2;
    const xLo = gapX + halfW;
    const xHi = W - gapX - halfW;
    const yLo = gapY + halfH;
    const yHi = H - gapY - halfH;

    let x: number;
    let y: number;
    let rotation: 0 | 90 | 270 = 0;
    let vertical = false;

    switch (border) {
      case 'top':
        y = Math.round(gapY + halfH);
        x = randIntInRange(rng, xLo, xHi, W / 2);
        break;
      case 'bottom':
        y = Math.round(H - gapY - halfH);
        x = randIntInRange(rng, xLo, xHi, W / 2);
        break;
      case 'left':
        x = Math.round(gapX + halfW);
        y = randIntInRange(rng, yLo, yHi, H / 2);
        rotation = 90;
        vertical = true;
        break;
      case 'right':
      default:
        x = Math.round(W - gapX - halfW);
        y = randIntInRange(rng, yLo, yHi, H / 2);
        rotation = 270;
        vertical = true;
        break;
    }

    intervals.push({ startSec: t, endSec: end, x, y, rotation, vertical, border });
    t = end;
  }

  return { playResX: W, playResY: H, style: { fontName: c.fontName, fontPx, alpha }, intervals, seed };
}
