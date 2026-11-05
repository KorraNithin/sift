import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { HttpError, handle, parse } from '../errors.js';
import { COOKIE, authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const SESSION_HOURS = 12;

export function authRoutes(ctx) {
  const { db, config } = ctx;
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again in a few minutes.' },
  });

  router.post(
    '/login',
    limiter,
    handle((req, res) => {
      const { email, password } = parse(loginSchema, req.body);
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      // Compare against a dummy hash when the user is unknown so timing does not reveal valid emails.
      const valid = bcrypt.compareSync(password, user?.password_hash ?? DUMMY_HASH);
      if (!user || !valid) throw new HttpError(401, 'Email or password is incorrect');

      const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: `${SESSION_HOURS}h` });
      res.cookie(COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: SESSION_HOURS * 3600 * 1000,
      });
      audit(db, user, 'login', 'user', user.id);
      res.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.client_id },
      });
    }),
  );

  router.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE);
    res.status(204).end();
  });

  router.get('/me', authenticate(ctx), (req, res) => res.json({ user: req.user }));
  return router;
}
