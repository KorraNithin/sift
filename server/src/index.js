import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db.js';
import { seedDemo } from './seed/seed.js';

const db = openDb(config.dbPath);
if (config.seedDemo && !db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  seedDemo(db);
  console.log('Seeded demo data');
}

createApp({ db, config }).listen(config.port, () => {
  console.log(`Sift API listening on http://localhost:${config.port}`);
});
