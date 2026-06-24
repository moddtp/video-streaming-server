import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { signAccessToken } from '../auth/jwt';
import { findUserByEmail, verifyPassword, DEMO_LOGINS } from '../auth/users';

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/login', async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', message: 'email and password required' });
    }
    const user = findUserByEmail(parsed.data.email);
    // Constant-ish behavior: same error whether the email exists or the password is wrong.
    if (!user || !(await verifyPassword(user, parsed.data.password))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    return { accessToken, email: user.email };
  });

  // Convenience for the demo/test player only — never expose real credentials like this.
  app.get('/api/demo-logins', async () => ({ logins: DEMO_LOGINS }));
}
