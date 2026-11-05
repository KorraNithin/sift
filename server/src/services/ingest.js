import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { nowIso } from '../db.js';
import { audit } from './audit.js';
import { scoreApplication } from './applications.js';
import { cleanText, parseCv } from './parser.js';

const ALLOWED = new Set(['pdf', 'docx', 'txt']);
const MIN_TEXT_CHARS = 80;

/** Detects the real format from file signatures so a renamed file cannot slip through. */
export function detectFormat(buffer) {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'docx';
  return buffer.subarray(0, 2000).includes(0) ? null : 'txt';
}

/** Extracts text from every page of a PDF, rebuilding line breaks from text positions. */
async function extractPdfText(buffer) {
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  try {
    const pages = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();
      let text = '';
      let lastY = null;
      for (const item of items) {
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2 && !text.endsWith('\n')) text += '\n';
        text += item.str;
        if (item.hasEOL && !text.endsWith('\n')) text += '\n';
        lastY = y;
      }
      pages.push(text);
    }
    return pages.join('\n');
  } finally {
    await doc.destroy();
  }
}

export async function extractText(buffer, format) {
  if (format === 'pdf') return extractPdfText(buffer);
  if (format === 'docx') return (await mammoth.extractRawText({ buffer })).value;
  return buffer.toString('utf8');
}

export function nextCandidateCode(db) {
  const { n } = db.prepare('SELECT MAX(CAST(SUBSTR(code, 5) AS INTEGER)) AS n FROM candidates').get();
  return `CND-${Math.max(91100, (n ?? 0) + 1)}`;
}

/** Looks for an existing, non-erased candidate with the same email, phone or file content. */
export function findDuplicate(db, { email, phone, fileHash }) {
  const checks = [
    ['email', 'email = ?', email],
    ['phone', 'phone = ?', phone],
    ['file', 'file_hash = ?', fileHash],
  ];
  for (const [matchedOn, where, value] of checks) {
    if (!value) continue;
    const candidate = db.prepare(`SELECT * FROM candidates WHERE erased_at IS NULL AND ${where}`).get(value);
    if (candidate) return { candidate, matchedOn };
  }
  return null;
}

export function insertCandidate(db, c) {
  const info = db
    .prepare(
      `INSERT INTO candidates (code, name, email, phone, headline, experience_years, skills, notice_days, location,
         current_ctc, expected_ctc, raw_text, file_hash, file_path, file_name, parse_status, consent_at, consent_source,
         created_by, created_at)
       VALUES (@code, @name, @email, @phone, @headline, @experienceYears, @skills, @noticeDays, @location,
         @currentCtc, @expectedCtc, @rawText, @fileHash, @filePath, @fileName, @parseStatus, @consentAt, @consentSource,
         @createdBy, @createdAt)`,
    )
    .run({
      code: c.code ?? nextCandidateCode(db),
      name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      headline: c.headline ?? null,
      experienceYears: c.experienceYears ?? null,
      skills: JSON.stringify(c.skills ?? []),
      noticeDays: c.noticeDays ?? null,
      location: c.location ?? null,
      currentCtc: c.currentCtc ?? null,
      expectedCtc: c.expectedCtc ?? null,
      rawText: c.rawText ?? '',
      fileHash: c.fileHash ?? null,
      filePath: c.filePath ?? null,
      fileName: c.fileName ?? null,
      parseStatus: c.parseStatus ?? 'parsed',
      consentAt: c.consentAt ?? nowIso(),
      consentSource: c.consentSource,
      createdBy: c.createdBy ?? null,
      createdAt: c.createdAt ?? nowIso(),
    });
  return Number(info.lastInsertRowid);
}

export function linkCandidate(db, requisitionId, candidateId, at = nowIso()) {
  const info = db
    .prepare(
      'INSERT OR IGNORE INTO applications (requisition_id, candidate_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
    )
    .run(requisitionId, candidateId, at, at);
  if (!info.changes) return null;
  const applicationId = Number(info.lastInsertRowid);
  scoreApplication(db, applicationId);
  return applicationId;
}

/**
 * Ingests one uploaded CV: validate, extract text, parse, de-duplicate, store, link and score.
 * Always resolves with a per-file result so one bad file never fails a whole batch.
 */
export async function ingestFile({ db, config }, { requisitionId, file, user, consentSource }) {
  const fileName = file.originalname;
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const base = { fileName };
  if (!ALLOWED.has(ext)) return { ...base, status: 'failed', message: 'Only PDF, DOCX or TXT files are accepted' };

  const buffer = await fs.readFile(file.path);
  const format = detectFormat(buffer);
  if (format !== ext) return { ...base, status: 'failed', message: `This file is not a valid ${ext.toUpperCase()}` };

  let text;
  try {
    text = cleanText(await extractText(buffer, format));
  } catch {
    return { ...base, status: 'failed', message: 'The file is corrupt or password protected' };
  }

  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const isScan = format === 'pdf' && text.replace(/\s+/g, '').length < MIN_TEXT_CHARS;
  const parsed = isScan ? parseCv('', { fileName }) : parseCv(text, { fileName });

  const duplicate = findDuplicate(db, { email: parsed.email, phone: parsed.phone, fileHash });
  if (duplicate) {
    const applicationId = linkCandidate(db, requisitionId, duplicate.candidate.id);
    audit(db, user, 'cv_duplicate_detected', 'candidate', duplicate.candidate.id, {
      requisitionId,
      matchedOn: duplicate.matchedOn,
    });
    return {
      ...base,
      status: applicationId ? 'duplicate' : 'already_in_requisition',
      candidateCode: duplicate.candidate.code,
      message: applicationId
        ? `Already in the database (matched on ${duplicate.matchedOn}). Linked to this requisition.`
        : 'This candidate is already in this requisition',
    };
  }

  await fs.mkdir(config.storageDir, { recursive: true });
  const filePath = path.join(config.storageDir, `${fileHash}.${format}`);
  await fs.writeFile(filePath, buffer);

  const ids = db.transaction(() => {
    const candidateId = insertCandidate(db, {
      ...parsed,
      rawText: text,
      fileHash,
      filePath,
      fileName,
      parseStatus: isScan ? 'scan' : 'parsed',
      consentSource,
      createdBy: user.id,
    });
    const applicationId = linkCandidate(db, requisitionId, candidateId);
    audit(db, user, 'cv_ingested', 'candidate', candidateId, { requisitionId, format, consentSource });
    return { candidateId, applicationId };
  })();

  const { score } = db.prepare('SELECT score FROM applications WHERE id = ?').get(ids.applicationId);
  return {
    ...base,
    status: isScan ? 'scan' : 'parsed',
    applicationId: ids.applicationId,
    candidateName: parsed.name,
    score,
    message: isScan
      ? 'Scanned image. No text could be read, so it is unscored and needs a manual look.'
      : 'Parsed and scored',
  };
}
