import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Wraps an async route handler so thrown errors (including ZodError and
// ApiError) are forwarded to the central errorHandler instead of crashing the
// process. Reuse this for every async route.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export default asyncHandler;
