/** Which border the watermark hugs during one interval. */
export type Border = 'top' | 'bottom' | 'left' | 'right';

/** One "show the watermark here, from startSec to endSec" instruction. */
export interface WatermarkInterval {
  startSec: number;
  endSec: number;
  /** Anchor position in video pixels (the text is centred on this point, \an5). */
  x: number;
  y: number;
  /** ASS \frz rotation in degrees: 0 = horizontal, 90 = left edge (reads up), 270 = right edge (reads down). */
  rotation: 0 | 90 | 270;
  vertical: boolean;
  border: Border;
}

export interface WatermarkStyle {
  fontName: string;
  fontPx: number;
  /** ASS alpha hex pair ("00" = opaque … "FF" = transparent). */
  alpha: string;
}

/** Everything needed to render a per-session ASS file. */
export interface WatermarkPlan {
  playResX: number;
  playResY: number;
  style: WatermarkStyle;
  intervals: WatermarkInterval[];
  /** The seed used, so a schedule can be reproduced/debugged. */
  seed: number;
}
