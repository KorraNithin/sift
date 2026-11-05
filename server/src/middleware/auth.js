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

/** Blocks cross-site state-changing requests (defence in depth on top of SameSite cookies). */
export function sameOrigin(req, _res, next) {
  const origin = req.headers.origin;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin) {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      return next(new HttpError(403, 'Cross-site request blocked'));
    }
    if (host !== req.headers.host) return next(new HttpError(403, 'Cross-site request blocked'));
  }
  return next();
}
