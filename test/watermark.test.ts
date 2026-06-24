import { describe, it, expect } from 'vitest';
import {
  opacityToAssAlpha,
  fontPxFromHeight,
  gapPx,
  formatAssTime,
  sanitizeAssText,
  estimateTextWidth,
} from '../src/watermark/geometry';
import { generateSchedule, type ScheduleConfig } from '../src/watermark/schedule';
import { renderAss } from '../src/watermark/ass';

const CONFIG: ScheduleConfig = {
  textHeightPct: 0.035,
  gapPct: 0.04,
  opacity: 0.65,
  minIntervalSec: 3,
  maxIntervalSec: 12,
  fontName: 'DejaVu Sans',
};

describe('geometry', () => {
  it('maps opacity to inverted ASS alpha', () => {
    expect(opacityToAssAlpha(1)).toBe('00'); // fully visible = opaque
    expect(opacityToAssAlpha(0)).toBe('FF'); // invisible = transparent
    expect(opacityToAssAlpha(0.5)).toBe('80'); // ~50%
    expect(opacityToAssAlpha(0.75)).toBe('40'); // ~75%
    expect(opacityToAssAlpha(0.65)).toBe('59'); // default
  });

  it('derives font size and gap from frame size', () => {
    expect(fontPxFromHeight(720, 0.035)).toBe(25);
    expect(fontPxFromHeight(1080, 0.035)).toBe(38);
    expect(gapPx(1280, 0.04)).toBe(51);
    expect(gapPx(720, 0.04)).toBe(29);
  });

  it('formats ASS timestamps as H:MM:SS.cc', () => {
    expect(formatAssTime(0)).toBe('0:00:00.00');
    expect(formatAssTime(5.4)).toBe('0:00:05.40');
    expect(formatAssTime(13.5)).toBe('0:00:13.50');
    expect(formatAssTime(3661.23)).toBe('1:01:01.23');
  });

  it('neutralizes ASS-special characters', () => {
    expect(sanitizeAssText('a{b}c\\d')).toBe('a(b)c/d');
    expect(sanitizeAssText('user@x.com | Drama')).toBe('user@x.com | Drama');
  });
});

describe('generateSchedule', () => {
  const W = 1280;
  const H = 720;
  const DURATION = 30;
  const TEXT = 'phirapong@icbsolution.com | Drama';
  const plan = generateSchedule({ durationSec: DURATION, width: W, height: H, text: TEXT, config: CONFIG, seed: 42 });

  it('tiles the entire duration contiguously starting at 0', () => {
    expect(plan.intervals.length).toBeGreaterThan(1);
    expect(plan.intervals[0].startSec).toBe(0);
    expect(plan.intervals.at(-1)!.endSec).toBeCloseTo(DURATION, 5);
    for (let i = 0; i < plan.intervals.length - 1; i++) {
      expect(plan.intervals[i].endSec).toBeCloseTo(plan.intervals[i + 1].startSec, 5);
    }
  });

  it('keeps every non-final interval within the 3–12s bound', () => {
    plan.intervals.slice(0, -1).forEach((iv) => {
      const d = iv.endSec - iv.startSec;
      expect(d).toBeGreaterThanOrEqual(3 - 1e-6);
      expect(d).toBeLessThanOrEqual(12 + 1e-6);
    });
  });

  it('never repeats the same border twice in a row (visible movement)', () => {
    for (let i = 0; i < plan.intervals.length - 1; i++) {
      expect(plan.intervals[i].border).not.toBe(plan.intervals[i + 1].border);
    }
  });

  it('renders left/right vertical (90/270) and top/bottom horizontal (0)', () => {
    const gapX = gapPx(W, CONFIG.gapPct);
    const gapY = gapPx(H, CONFIG.gapPct);
    const lineH = Math.round(25 * 1.3); // fontPx 25 at 720p
    for (const iv of plan.intervals) {
      if (iv.border === 'left') {
        expect(iv.vertical).toBe(true);
        expect(iv.rotation).toBe(90);
        expect(iv.x).toBe(Math.round(gapX + lineH / 2));
      } else if (iv.border === 'right') {
        expect(iv.vertical).toBe(true);
        expect(iv.rotation).toBe(270);
        expect(iv.x).toBe(Math.round(W - gapX - lineH / 2));
      } else if (iv.border === 'top') {
        expect(iv.vertical).toBe(false);
        expect(iv.rotation).toBe(0);
        expect(iv.y).toBe(Math.round(gapY + lineH / 2));
      } else {
        expect(iv.vertical).toBe(false);
        expect(iv.rotation).toBe(0);
        expect(iv.y).toBe(Math.round(H - gapY - lineH / 2));
      }
    }
  });

  it('keeps the watermark box inside the frame', () => {
    const textW = estimateTextWidth(TEXT, 25);
    const lineH = Math.round(25 * 1.3);
    for (const iv of plan.intervals) {
      const boxW = iv.vertical ? lineH : textW;
      const boxH = iv.vertical ? textW : lineH;
      expect(iv.x - boxW / 2).toBeGreaterThanOrEqual(-1);
      expect(iv.x + boxW / 2).toBeLessThanOrEqual(W + 1);
      expect(iv.y - boxH / 2).toBeGreaterThanOrEqual(-1);
      expect(iv.y + boxH / 2).toBeLessThanOrEqual(H + 1);
    }
  });

  it('is deterministic for a fixed seed and varied across seeds', () => {
    const a = generateSchedule({ durationSec: DURATION, width: W, height: H, text: TEXT, config: CONFIG, seed: 7 });
    const b = generateSchedule({ durationSec: DURATION, width: W, height: H, text: TEXT, config: CONFIG, seed: 7 });
    const c = generateSchedule({ durationSec: DURATION, width: W, height: H, text: TEXT, config: CONFIG, seed: 99 });
    expect(a.intervals).toEqual(b.intervals);
    expect(a.intervals).not.toEqual(c.intervals);
  });

  it('eventually produces both vertical and horizontal placements', () => {
    const all = [7, 42, 99, 123, 256].flatMap(
      (seed) => generateSchedule({ durationSec: 120, width: W, height: H, text: TEXT, config: CONFIG, seed }).intervals,
    );
    expect(all.some((i) => i.vertical)).toBe(true);
    expect(all.some((i) => !i.vertical)).toBe(true);
  });
});

describe('renderAss', () => {
  const plan = generateSchedule({
    durationSec: 20,
    width: 1920,
    height: 1080,
    text: 'phirapong@icbsolution.com | Documentary',
    config: CONFIG,
    seed: 3,
  });
  const ass = renderAss(plan, 'phirapong@icbsolution.com | Documentary');

  it('emits a valid ASS header at the video resolution', () => {
    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('PlayResX: 1920');
    expect(ass).toContain('PlayResY: 1080');
    expect(ass).toContain('[V4+ Styles]');
    expect(ass).toMatch(/^Style: WM,DejaVu Sans,38,/m);
    expect(ass).toContain('[Events]');
  });

  it('carries the configured opacity in the colours', () => {
    // 0.65 opacity → alpha 59; white primary, black outline.
    expect(ass).toContain('&H59FFFFFF');
    expect(ass).toContain('&H59000000');
  });

  it('emits exactly one Dialogue per interval with position + rotation', () => {
    const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(dialogues).toHaveLength(plan.intervals.length);
    plan.intervals.forEach((iv, i) => {
      const line = dialogues[i];
      expect(line).toContain(`\\pos(${iv.x},${iv.y})`);
      if (iv.rotation === 0) expect(line).not.toContain('\\frz');
      else expect(line).toContain(`\\frz${iv.rotation}`);
      expect(line).toContain('phirapong@icbsolution.com | Documentary');
    });
  });
});
