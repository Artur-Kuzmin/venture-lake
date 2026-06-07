import jwt from 'jsonwebtoken';

// Backend-owned JWT helpers (Foundation Bible, Section 4.3).
// The token carries the user id; requireAuth decodes it and attaches req.user.

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production';
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
