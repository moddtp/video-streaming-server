import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/** Parse a human duration ("15m", "3h", "120s", "500ms", or bare seconds) into milliseconds. */
export function parseDurationMs(input: string): number {
  const m = String(input).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
  if (!m) throw new Error(`Invalid duration: "${input}"`);
  const value = Number(m[1]);
  const unit = (m[2] ?? 's').toLowerCase();
  const mult: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Math.round(value * mult[unit]);
}

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number());

const EnvSchema = z.object({
  PORT: num(3000),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
  CORS_ALLOW_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.string().default('info'),
  LOG_PRETTY: bool(true),

  JWT_SECRET: z.string().default('dev-only-insecure-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  SESSION_TTL: z.string().default('3h'),

  CATALOG_STORE: z.enum(['sqlite', 'json']).default('sqlite'),
  CATALOG_DB_PATH: z.string().default('data/catalog.db'),
  CATALOG_JSON_PATH: z.string().default('data/catalog.json'),

  MEDIA_DIR: z.string().default('media'),
  SESSIONS_DIR: z.string().default('data/sessions'),
  FONTS_DIR: z.string().default('assets/fonts'),

  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),

  MAX_CONCURRENT_TRANSCODES: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? Math.max(1, os.cpus().length) : Number(v)))
    .pipe(z.number().int().positive()),
  HLS_SEGMENT_SECONDS: num(4),
  X264_PRESET: z.string().default('veryfast'),
  X264_CRF: num(21),
  SESSION_IDLE_TIMEOUT_SEC: num(120),
  SWEEP_INTERVAL_SEC: num(30),

  WM_TEXT_HEIGHT_PCT: num(0.035),
  WM_GAP_PCT: num(0.04),
  WM_OPACITY: num(0.65),
  WM_MIN_INTERVAL_SEC: num(3),
  WM_MAX_INTERVAL_SEC: num(12),
  WM_FONT_NAME: z.string().default('DejaVu Sans'),
  WM_FONT_FILE: z.string().default('DejaVuSans.ttf'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error(`Invalid configuration:\n${lines.join('\n')}`);
  process.exit(1);
}
const env = parsed.data;

const root = process.cwd();
const abs = (p: string) => (path.isAbsolute(p) ? p : path.resolve(root, p));

export const config = {
  root,
  port: env.PORT,
  host: env.HOST,
  publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, ''),
  corsAllowOrigin: env.CORS_ALLOW_ORIGIN,
  logLevel: env.LOG_LEVEL,
  logPretty: env.LOG_PRETTY,

  jwtSecret: env.JWT_SECRET,
  accessTokenTtl: env.ACCESS_TOKEN_TTL,
  sessionTtl: env.SESSION_TTL,
  sessionTtlMs: parseDurationMs(env.SESSION_TTL),

  catalogStore: env.CATALOG_STORE,
  catalogDbPath: abs(env.CATALOG_DB_PATH),
  catalogJsonPath: abs(env.CATALOG_JSON_PATH),

  mediaDir: abs(env.MEDIA_DIR),
  sessionsDir: abs(env.SESSIONS_DIR),
  fontsDir: abs(env.FONTS_DIR),

  ffmpegPathOverride: env.FFMPEG_PATH && env.FFMPEG_PATH.trim() !== '' ? env.FFMPEG_PATH : null,
  ffprobePathOverride: env.FFPROBE_PATH && env.FFPROBE_PATH.trim() !== '' ? env.FFPROBE_PATH : null,

  maxConcurrentTranscodes: env.MAX_CONCURRENT_TRANSCODES,
  hlsSegmentSeconds: env.HLS_SEGMENT_SECONDS,
  x264Preset: env.X264_PRESET,
  x264Crf: env.X264_CRF,
  sessionIdleTimeoutSec: env.SESSION_IDLE_TIMEOUT_SEC,
  sweepIntervalSec: env.SWEEP_INTERVAL_SEC,

  watermark: {
    textHeightPct: env.WM_TEXT_HEIGHT_PCT,
    gapPct: env.WM_GAP_PCT,
    opacity: Math.min(1, Math.max(0, env.WM_OPACITY)),
    minIntervalSec: env.WM_MIN_INTERVAL_SEC,
    maxIntervalSec: env.WM_MAX_INTERVAL_SEC,
    fontName: env.WM_FONT_NAME,
    fontFile: env.WM_FONT_FILE,
  },
} as const;

export type AppConfig = typeof config;
