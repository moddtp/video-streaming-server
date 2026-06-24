import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken, verifySessionToken } from './jwt';
import type { SessionManager } from '../session/manager';

function bearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

/**
 * Session token, accepted via `Authorization: Bearer` OR a `?t=` query param.
 * The query fallback is mandatory: many mobile HLS players don't forward auth
 * headers to segment requests, and hls.js can't add headers to segment fetches.
 */
export function getSessionToken(req: FastifyRequest): string | null {
  const q = (req.query as Record<string, unknown> | undefined)?.t;
  if (typeof q === 'string' && q.length > 0) return q;
  return bearerToken(req);
}

/** preHandler: require a valid access token; attaches req.user. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    reply.code(401).send({ error: 'unauthorized', message: 'Missing bearer access token' });
    return;
  }
  try {
    req.user = verifyAccessToken(token);
  } catch {
    reply.code(401).send({ error: 'invalid_token', message: 'Invalid or expired access token' });
  }
}

/** Build a preHandler that authorizes access to a specific session's stream files. */
export function makeSessionGuard(sessions: SessionManager) {
  return async function sessionGuard(
    req: FastifyRequest<{ Params: { sid: string; file: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const token = getSessionToken(req);
    if (!token) {
      reply.code(401).send({ error: 'unauthorized', message: 'Missing session token' });
      return;
    }
    let claims;
    try {
      claims = verifySessionToken(token);
    } catch {
      reply.code(401).send({ error: 'invalid_token', message: 'Invalid or expired session token' });
      return;
    }
    if (claims.sid !== req.params.sid) {
      reply.code(403).send({ error: 'forbidden', message: 'Token does not match session' });
      return;
    }
    const session = sessions.get(req.params.sid);
    if (!session) {
      reply.code(404).send({ error: 'no_session', message: 'Session not found or expired' });
      return;
    }
    req.session = session;
  };
}
