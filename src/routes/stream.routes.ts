import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { STREAM_FILE_RE, SEGMENT_PREFIX } from '../ffmpeg/hls';
import { sendFile } from '../util/http';
import { getSessionToken, makeSessionGuard } from '../auth/middleware';
import type { SessionManager } from '../session/manager';

/**
 * Serves the per-session HLS playlist and segments, guarded by the session
 * token. The filename is restricted to an allowlist and resolved strictly
 * inside the session directory (defeats path traversal). When serving the
 * playlist, each segment URI is rewritten to carry the same `?t=` token so
 * players that don't propagate auth to segment requests still get authorized.
 */
export function registerStreamRoutes(app: FastifyInstance, sessions: SessionManager) {
  const guard = makeSessionGuard(sessions);

  app.get<{ Params: { sid: string; file: string } }>(
    '/stream/:sid/:file',
    { preHandler: guard },
    async (req, reply) => {
      const { file } = req.params;
      if (!STREAM_FILE_RE.test(file)) return reply.code(400).send({ error: 'bad_file' });

      const session = req.session!; // set by guard
      const filePath = path.join(session.dir, file);
      if (filePath !== session.dir && !filePath.startsWith(session.dir + path.sep)) {
        return reply.code(400).send({ error: 'bad_path' });
      }

      if (file.endsWith('.m3u8')) {
        const token = getSessionToken(req)!; // guaranteed by guard
        // Read the playlist; defensively retry a transient empty/partial read so a
        // player never receives a half-written manifest (belt-and-suspenders to the
        // atomic temp_file writes ffmpeg already does).
        let text = '';
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            text = await readFile(filePath, 'utf8');
          } catch {
            return reply.code(404).send({ error: 'not_found' });
          }
          if (text.includes('#EXTM3U')) break;
          await new Promise((r) => setTimeout(r, 40));
        }
        // Append the token to every segment URI line (e.g. "seg_00001.ts").
        const tokenized = text.replace(
          new RegExp(`^(${SEGMENT_PREFIX}\\d{5}\\.ts)\\s*$`, 'gm'),
          `$1?t=${encodeURIComponent(token)}`,
        );
        return reply
          .header('Content-Type', 'application/vnd.apple.mpegurl')
          .header('Cache-Control', 'no-store')
          .send(tokenized);
      }

      return sendFile(req, reply, filePath, 'video/mp2t');
    },
  );
}
