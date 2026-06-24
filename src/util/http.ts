import { createReadStream, statSync } from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Stream a file to the client with HTTP range support (needed by native HLS
 * players that byte-range segment requests). Per-user content is marked
 * no-store so intermediaries never share one user's watermarked bytes.
 */
export function sendFile(
  req: FastifyRequest,
  reply: FastifyReply,
  filePath: string,
  contentType: string,
): FastifyReply {
  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    return reply.code(404).send({ error: 'not_found' });
  }

  reply.header('Content-Type', contentType);
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Cache-Control', 'no-store');

  const range = req.headers.range;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m) {
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return reply.code(416).header('Content-Range', `bytes */${size}`).send();
    }
    return reply
      .code(206)
      .header('Content-Range', `bytes ${start}-${end}/${size}`)
      .header('Content-Length', end - start + 1)
      .send(createReadStream(filePath, { start, end }));
  }

  return reply.header('Content-Length', size).send(createReadStream(filePath));
}
