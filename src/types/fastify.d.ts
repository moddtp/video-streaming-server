import 'fastify';
import type { AccessClaims } from '../auth/jwt';
import type { Session } from '../session/types';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireAuth from a verified access token. */
    user?: AccessClaims;
    /** Set by the session guard once a stream request is authorized. */
    session?: Session;
  }
}
