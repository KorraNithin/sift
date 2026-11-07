import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { config as baseConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { seedDemo, DEMO_PASSWORD } from '../src/seed/seed.js';

/** Boots the real Express app on a random port with an in-memory database and demo data. */
export async function startApp() {
  const db = openDb(':memory:');
  seedDemo(db);
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-test-'));
  const config = { ...baseConfig, storageDir, clientDist: path.join(storageDir, 'none'), anthropicKey: '' };
  const server = createApp({ db, config }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function login(email, password = DEMO_PASSWORD) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'sift' },
      body: JSON.stringify({ email, password }),
    });
    return { res, cookie: res.headers.getSetCookie()[0]?.split(';')[0] ?? '' };
  }

  /** Returns a small client bound to one session cookie. */
  async function as(email) {
    const { cookie } = await login(email);
    const call = async (method, url, body) => {
      const isForm = body instanceof FormData;
      const res = await fetch(`${base}/api${url}`, {
        method,
        headers: {
          cookie,
          'x-requested-with': 'sift',
          ...(body && !isForm ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        // non-JSON responses (file downloads) are returned as text
      }
      return { status: res.status, body: json, text };
    };
    return {
      get: (u) => call('GET', u),
      post: (u, b) => call('POST', u, b ?? {}),
      put: (u, b) => call('PUT', u, b),
      del: (u, b) => call('DELETE', u, b ?? {}),
      patch: (u, b) => call('PATCH', u, b),
    };
  }

  const close = () => new Promise((resolve) => server.close(resolve));
  return { db, base, login, as, close };
}

export function cvForm(files, { consent = true, source = 'Candidate applied directly' } = {}) {
  const form = new FormData();
  if (consent) form.append('consent', 'true');
  form.append('consentSource', source);
  for (const [name, content] of files) form.append('files', new Blob([content]), name);
  return form;
}
