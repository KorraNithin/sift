import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(root, '..', '.env'));
} catch {
  // .env is optional; defaults below are safe for local development
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production');
}

export const config = Object.freeze({
  isProd,
  port: Number(env.PORT ?? 4000),
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  dbPath: env.DB_PATH || path.join(root, 'data', 'sift.db'),
  storageDir: env.STORAGE_DIR || path.join(root, 'data', 'cvs'),
  clientDist: env.CLIENT_DIST || path.resolve(root, '..', 'client', 'dist'),
  cookieSecure: env.COOKIE_SECURE === 'true',
  seedDemo: env.SEED_DEMO === 'true',
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
});
