import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('recruiter', 'client', 'head')),
  password_hash TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS requisitions (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  jd_text TEXT NOT NULL DEFAULT '',
  scorecard TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  first_submitted_at TEXT
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  headline TEXT,
  experience_years REAL,
  skills TEXT NOT NULL DEFAULT '[]',
  notice_days INTEGER,
  location TEXT,
  current_ctc REAL,
  expected_ctc REAL,
  raw_text TEXT NOT NULL DEFAULT '',
  file_hash TEXT,
  file_path TEXT,
  file_name TEXT,
  parse_status TEXT NOT NULL DEFAULT 'parsed' CHECK (parse_status IN ('parsed', 'scan', 'manual')),
  consent_at TEXT NOT NULL,
  consent_source TEXT NOT NULL,
  consent_purpose TEXT NOT NULL DEFAULT 'Hiring and placement only',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  erased_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
CREATE INDEX IF NOT EXISTS idx_candidates_phone ON candidates(phone);
CREATE INDEX IF NOT EXISTS idx_candidates_hash ON candidates(file_hash);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY,
  requisition_id INTEGER NOT NULL REFERENCES requisitions(id),
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  score REAL,
  confidence TEXT NOT NULL DEFAULT 'low',
  breakdown TEXT NOT NULL DEFAULT '{}',
  stage TEXT NOT NULL DEFAULT 'sourced',
  opened_at TEXT,
  submitted_at TEXT,
  ai_rank_at_submit INTEGER,
  client_decision TEXT,
  reject_reason TEXT,
  interview_slot TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (requisition_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_applications_req ON applications(requisition_id, score);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor_id INTEGER,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
`;

/**
 * Opens (and migrates) the SQLite database.
 * @param {string} file path to the db file, or ':memory:' for tests
 */
export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export const nowIso = () => new Date().toISOString();

export function resetDb(db) {
  db.exec(`
    DELETE FROM audit_log; DELETE FROM applications; DELETE FROM candidates;
    DELETE FROM requisitions; DELETE FROM users; DELETE FROM clients;
  `);
}
