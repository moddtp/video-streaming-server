import bcrypt from 'bcryptjs';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

/**
 * Demo accounts. In a real deployment this would be a users table / identity
 * provider. Passwords are hashed at load (bcrypt), never compared in plaintext.
 * The email here becomes the first field of the burned-in watermark.
 */
const DEMO_CREDENTIALS = [
  { id: 'u_phirapong', email: 'phirapong@icbsolution.com', password: 'password123' },
  { id: 'u_demo', email: 'demo@example.com', password: 'demo1234' },
];

const users: User[] = DEMO_CREDENTIALS.map((u) => ({
  id: u.id,
  email: u.email,
  passwordHash: bcrypt.hashSync(u.password, 10),
}));

/** Demo credentials surfaced to the test player / docs (NOT for production). */
export const DEMO_LOGINS = DEMO_CREDENTIALS.map((u) => ({ email: u.email, password: u.password }));

export function findUserByEmail(email: string): User | undefined {
  const e = email.trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === e);
}

export function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}
