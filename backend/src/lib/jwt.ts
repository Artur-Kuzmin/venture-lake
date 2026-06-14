import jwt from 'jsonwebtoken';

// Backend-owned JWT helpers (Foundation Bible, Section 4.3).
// The token carries the user id; requireAuth decodes it and attaches req.user.

// Require a real secret in production; tokens signed with a known default would
// be trivially forgeable. In development we allow an insecure fallback (with a
// loud warning) so the app still runs without a configured secret.
const RAW_SECRET = process.env.JWT_SECRET ?? '';
if (!RAW_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error(
    'JWT_SECRET must be set in production. Refusing to start with an insecure default secret.'
  );
}
if (!RAW_SECRET) {
  console.warn(
    '[jwt] JWT_SECRET is not set — using an insecure development fallback. Set JWT_SECRET before deploying.'
  );
}
const JWT_SECRET = RAW_SECRET || 'insecure-dev-only-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

export interface JwtPayload {
  userId: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded === 'string' || !('userId' in decoded)) {
    throw new Error('Invalid token payload');
  }
  return { userId: (decoded as JwtPayload).userId };
}
