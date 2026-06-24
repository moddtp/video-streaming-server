import type { FastifyInstance } from 'fastify';
import { toPublic, type CatalogStore } from '../catalog/store';

/** Catalog browsing endpoints. Returns public metadata only (never sourcePath). */
export function registerCatalogRoutes(app: FastifyInstance, store: CatalogStore) {
  app.get('/api/videos', async () => {
    const videos = await store.listVideos();
    return { videos: videos.map(toPublic) };
  });

  app.get<{ Params: { id: string } }>('/api/videos/:id', async (req, reply) => {
    const video = await store.getVideo(req.params.id);
    if (!video) return reply.code(404).send({ error: 'not_found', message: `No video "${req.params.id}"` });
    return toPublic(video);
  });
}
