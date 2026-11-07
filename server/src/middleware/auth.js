import jwt from 'jsonwebtoken';
import { HttpError } from '../errors.js';

export const COOKIE = 'sift_session';

/** Loads the signed-in user from the httpOnly session cookie. */
export const authenticate =
  ({ db, config }) =>
  (req, _res, next) => {
    const token = req.cookies?.[COOKIE];
    if (!token) return next(new HttpError(401, 'Sign in to continue'));
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      const user = db
        .prepare('SELECT id, email, name, role, client_id AS clientId FROM users WHERE id = ?')
        .get(payload.sub);
      if (!user) throw new Error('unknown user');
      req.user = user;
      return next();
    } catch {
      return next(new HttpError(401, 'Your session has expired. Sign in again.'));
    }
  };

export const requireRole =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have access to this'));

export const CLIENT_HEADER = 'x-requested-with';
export const CLIENT_HEADER_VALUE = 'sift';

/**
 * CSRF defence for state-changing requests. A page on another site cannot add a custom header
 * without a CORS preflight, and this server never grants one. Combined with SameSite cookies this
 * does not depend on the Host or Origin headers, which proxies (Vite, Codespaces, load balancers) rewrite.
 */
export function requireClientHeader(req, _res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (safe || req.headers[CLIENT_HEADER] === CLIENT_HEADER_VALUE) return next();
  return next(new HttpError(403, 'Request blocked. Reload the page and try again.'));
}
