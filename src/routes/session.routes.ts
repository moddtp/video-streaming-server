import type { FastifyInstance } from 'fastify';
import type { CatalogStore } from '../catalog/store';
import { TranscodeBusyError, type SessionManager } from '../session/manager';
import { requireAuth } from '../auth/middleware';
import { signSessionToken } from '../auth/jwt';

/**
 * Playback session lifecycle. POST /play (authenticated) creates a per-user
 * watermarked HLS session and returns its playlist URL + a session token that
 * guards the playlist and segments.
 */
export function registerSessionRoutes(app: FastifyInstance, store: CatalogStore, sessions: SessionManager) {
  app.post<{ Params: { id: string } }>(
    '/api/videos/:id/play',
    { preHandler: requireAuth },
    async (req, reply) => {
      const video = await store.getVideo(req.params.id);
      if (!video) return reply.code(404).send({ error: 'not_found', message: `No video "${req.params.id}"` });

      // Identity comes from the verified access token — never from the request body.
      const { sub: userId, email } = req.user!;

      try {
        const session = await sessions.createSession({ video, email, userId });
        const sessionToken = signSessionToken({ sid: session.id, sub: userId });
        return {
          sessionId: session.id,
          playlistUrl: `/stream/${session.id}/index.m3u8`,
          sessionToken,
          expiresAt: new Date(session.expiresAt).toISOString(),
          watermark: { text: `${email} | ${video.category}` },
        };
      } catch (err) {
        if (err instanceof TranscodeBusyError) {
          return reply
            .code(503)
            .header('Retry-After', '10')
            .send({ error: 'busy', message: 'Server is at transcode capacity; retry shortly.' });
        }
        req.log.error({ err }, 'failed to start playback session');
        return reply
          .code(500)
          .send({ error: 'transcode_failed', message: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  app.delete<{ Params: { sid: string } }>(
    '/api/sessions/:sid',
    { preHandler: requireAuth },
    async (req, reply) => {
      const session = sessions.get(req.params.sid);
      // Only the owner may end their session.
      if (session && session.userId !== req.user!.sub) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      await sessions.endSession(req.params.sid);
      return reply.code(204).send();
    },
  );
}
