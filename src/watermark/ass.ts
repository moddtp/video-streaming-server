import { formatAssTime, sanitizeAssText } from './geometry';
import type { WatermarkPlan } from './types';

const STYLE_FORMAT =
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, ' +
  'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, ' +
  'Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

const EVENT_FORMAT = 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text';

/**
 * Render a WatermarkPlan into an ASS subtitle file that libass (ffmpeg's
 * `subtitles` filter) burns into the video. PlayResX/Y are set to the video
 * resolution so \pos and font size are effectively in pixels. One Dialogue line
 * per interval carries its own timing, position and rotation.
 */
export function renderAss(plan: WatermarkPlan, text: string): string {
  const { style } = plan;
  const safe = sanitizeAssText(text);

  // ASS colours are &HAABBGGRR. White text, black outline/shadow, all sharing
  // the configured alpha so the whole mark sits at the requested opacity.
  const white = `&H${style.alpha}FFFFFF`;
  const black = `&H${style.alpha}000000`;

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${plan.playResX}`,
    `PlayResY: ${plan.playResY}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: None',
    '',
    '[V4+ Styles]',
    STYLE_FORMAT,
    // BorderStyle 1 (outline+shadow), Outline 2px, Shadow 1px, Alignment 5 (centre = \pos anchor).
    `Style: WM,${style.fontName},${style.fontPx},${white},${white},${black},${black},` +
      `0,0,0,0,100,100,0,0,1,2,1,5,0,0,0,1`,
    '',
    '[Events]',
    EVENT_FORMAT,
  ];

  const events = plan.intervals.map((iv) => {
    const start = formatAssTime(iv.startSec);
    const end = formatAssTime(iv.endSec);
    // \an5 (centre anchor) + absolute \pos + rotation. Horizontal omits \frz (0).
    const tags = iv.rotation === 0 ? `{\\an5\\pos(${iv.x},${iv.y})}` : `{\\an5\\pos(${iv.x},${iv.y})\\frz${iv.rotation}}`;
    return `Dialogue: 0,${start},${end},WM,,0,0,0,,${tags}${safe}`;
  });

  return [...header, ...events, ''].join('\n');
}
