// Augment Express' Request so requireAuth can attach the authenticated user id,
// and requireProfile can flag a present founder profile.
import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string };
      hasProfile?: boolean;
    }
  }
}

export {};
