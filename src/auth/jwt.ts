import jwt from 'jsonwebtoken';
import { config, parseDurationMs } from '../config';

export interface AccessClaims {
  sub: string;
  email: string;
}

export interface SessionClaims {
  sid: string;
  sub: string;
}

const accessTtlSec = Math.floor(parseDurationMs(config.accessTokenTtl) / 1000);
const sessionTtlSec = Math.floor(config.sessionTtlMs / 1000);

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, config.jwtSecret, { expiresIn: accessTtlSec });
}

export function signSessionToken(claims: SessionClaims): string {
  return jwt.sign(claims, config.jwtSecret, { expiresIn: sessionTtlSec });
}

export function verifyAccessToken(token: string): AccessClaims {
  const p = jwt.verify(token, config.jwtSecret);
  if (typeof p === 'string' || !p.sub || typeof p.email !== 'string') {
    throw new Error('malformed access token');
  }
  return { sub: String(p.sub), email: p.email };
}

export function verifySessionToken(token: string): SessionClaims {
  const p = jwt.verify(token, config.jwtSecret);
  if (typeof p === 'string' || typeof (p as Record<string, unknown>).sid !== 'string' || !p.sub) {
    throw new Error('malformed session token');
  }
  return { sid: String((p as Record<string, unknown>).sid), sub: String(p.sub) };
}
