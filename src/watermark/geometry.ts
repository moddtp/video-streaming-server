// Pure helpers for watermark sizing, color/opacity, RNG and ASS formatting.
// Kept side-effect free so they are easy to unit test.

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Convert opacity (0..1, where 1 = fully visible) to an ASS alpha hex pair.
 * ASS alpha is inverted: &H00 = opaque, &HFF = fully transparent.
 */
export function opacityToAssAlpha(opacity: number): string {
  const a = Math.round(255 * (1 - clamp(opacity, 0, 1)));
  return a.toString(16).toUpperCase().padStart(2, '0');
}

/** Text height "4-6 mm" → pixels, as a fraction of video height (min 10px). */
export function fontPxFromHeight(videoHeight: number, pct: number): number {
  return Math.max(10, Math.round(videoHeight * pct));
}

/** Border gap "1.5-2.5 cm" → pixels, as a fraction of a dimension. */
export function gapPx(dimension: number, pct: number): number {
  return Math.max(0, Math.round(dimension * pct));
}

/** Rough rendered width of a horizontal text run (DejaVu Sans avg advance ≈ 0.6em). */
export function estimateTextWidth(text: string, fontPx: number): number {
  return Math.round(text.length * fontPx * 0.6);
}

/** Rough vertical extent of one text line including outline/shadow padding. */
export function lineHeight(fontPx: number): number {
  return Math.round(fontPx * 1.3);
}

/** Deterministic PRNG (mulberry32) — same seed ⇒ same schedule (used by tests). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randFloat(rng: () => number, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/**
 * Random integer in [lo, hi]. If the range is empty (box too big for the safe
 * area on this axis) fall back to the midpoint so the text stays on-screen.
 */
export function randIntInRange(rng: () => number, lo: number, hi: number, fallback: number): number {
  const l = Math.ceil(lo);
  const h = Math.floor(hi);
  if (l > h) return Math.round(fallback);
  return l + Math.floor(rng() * (h - l + 1));
}

/** Format seconds as an ASS timestamp: H:MM:SS.cc (centiseconds). */
export function formatAssTime(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${h}:${p2(m)}:${p2(s)}.${p2(c)}`;
}

/**
 * Make text safe for an ASS Dialogue field. `{` `}` would open/close an override
 * block and `\` introduces ASS escapes, so neutralize those rare characters
 * (emails/categories realistically never contain them).
 */
export function sanitizeAssText(text: string): string {
  return text.replace(/\{/g, '(').replace(/\}/g, ')').replace(/\\/g, '/').replace(/\r?\n/g, ' ');
}
