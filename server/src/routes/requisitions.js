import fs from 'node:fs/promises';
import os from 'node:os';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { nowIso } from '../db.js';
import { HttpError, handle, parse } from '../errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { parseJson, rankedApplications, rescoreRequisition } from '../services/applications.js';
import { ingestFile } from '../services/ingest.js';
import { extractScorecard } from '../services/jd.js';
import { extractWithLlm } from '../services/llm.js';
import { STAGES } from '../services/pipeline.js';
import { canonicalSkill } from '../services/taxonomy.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 100;

export const scorecardSchema = z.object({
  title: z.string().trim().min(2).max(120),
  experience: z
    .object({ min: z.number().min(0).max(40), max: z.number().min(0).max(50) })
    .refine((e) => e.max >= e.min, { message: 'Maximum experience must be at least the minimum' }),
  skills: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        required: z.boolean(),
        weight: z.number().int().min(1).max(3),
      }),
    )
    .min(1, 'Add at least one skill')
    .max(25),
  noticeMax: z.number().int().min(0).max(180).nullable(),
  location: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .transform((v) => v || null),
  ctcMax: z.number().min(0).max(500).nullable(),
});

/** Canonicalises skill names and removes duplicates (first occurrence wins; must-have beats nice-to-have). */
function normaliseScorecard(scorecard) {
  const byName = new Map();
  for (const skill of scorecard.skills) {
    const name = canonicalSkill(skill.name);
    const existing = byName.get(name.toLowerCase());
    if (!existing) byName.set(name.toLowerCase(), { ...skill, name });
    else if (skill.required && !existing.required) byName.set(name.toLowerCase(), { ...skill, name });
  }
  return { ...scorecard, skills: [...byName.values()] };
}

const createSchema = z.object({
  clientId: z.number().int().positive(),
  jdText: z.string().max(20000).default(''),
  scorecard: scorecardSchema,
});
const statusSchema = z.object({ status: z.enum(['open', 'closed']) });
const extractSchema = z.object({ text: z.string().trim().min(10, 'Paste the job description').max(20000) });
const uploadSchema = z.object({
  consent: z.literal('true', { errorMap: () => ({ message: 'Confirm that candidates consented to this use' }) }),
  consentSource: z.enum(['Candidate applied directly', 'Consent taken by call or email', 'Referral with consent']),
});

export function requisitionRoutes(ctx) {
  const { db, config } = ctx;
  const router = Router();
  const upload = multer({ dest: os.tmpdir(), limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST } });
  const recruiterOnly = requireRole('recruiter');

  router.use(authenticate(ctx), requireRole('recruiter', 'head'));

  const getRequisition = (id) => {
    const row = db
      .prepare(
        `SELECT r.id, r.title, r.jd_text AS jdText, r.scorecard, r.status, r.created_at AS createdAt, r.first_submitted_at AS firstSubmittedAt,
                r.client_id AS clientId, cl.name AS clientName
         FROM requisitions r JOIN clients cl ON cl.id = r.client_id WHERE r.id = ?`,
      )
      .get(id);
    if (!row) throw new HttpError(404, 'Requisition not found');
    return { ...row, scorecard: parseJson(row.scorecard, {}) };
  };
  const idParam = (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'Not found');
    return id;
  };

  router.get('/clients', (_req, res) =>
    res.json(db.prepare('SELECT id, name, sector FROM clients ORDER BY name').all()),
  );

  router.get('/requisitions', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT r.id, r.title, r.status, r.created_at AS createdAt, cl.name AS clientName,
           (SELECT COUNT(*) FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE a.requisition_id = r.id AND c.erased_at IS NULL) AS total,
           (SELECT COUNT(*) FROM applications a WHERE a.requisition_id = r.id AND a.submitted_at IS NOT NULL) AS submitted,
           (SELECT COUNT(*) FROM applications a WHERE a.requisition_id = r.id AND a.opened_at IS NOT NULL) AS opened,
           (SELECT MAX(score) FROM applications a WHERE a.requisition_id = r.id) AS topScore
         FROM requisitions r JOIN clients cl ON cl.id = r.client_id ORDER BY (r.status = 'closed'), r.created_at DESC`,
      )
      .all();
    res.json(rows);
  });

  router.post(
    '/requisitions/extract',
    recruiterOnly,
    handle(async (req, res) => {
      const { text } = parse(extractSchema, req.body);
      const draft = (await extractWithLlm(text, config)) ?? extractScorecard(text);
      res.json(draft);
    }),
  );

  router.post(
    '/requisitions',
    recruiterOnly,
    handle((req, res) => {
      const body = parse(createSchema, req.body);
      if (!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(body.clientId))
        throw new HttpError(400, 'Choose a client');
      const scorecard = normaliseScorecard(body.scorecard);
      const info = db
        .prepare(
          'INSERT INTO requisitions (client_id, title, jd_text, scorecard, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(body.clientId, scorecard.title, body.jdText, JSON.stringify(scorecard), req.user.id, nowIso());
      audit(db, req.user, 'requisition_created', 'requisition', info.lastInsertRowid);
      res.status(201).json(getRequisition(Number(info.lastInsertRowid)));
    }),
  );

  router.get('/requisitions/:id', (req, res) => {
    const requisition = getRequisition(idParam(req));
    const counts = db
      .prepare(
        `SELECT a.stage, COUNT(*) AS n FROM applications a JOIN candidates c ON c.id = a.candidate_id
         WHERE a.requisition_id = ? AND c.erased_at IS NULL GROUP BY a.stage`,
      )
      .all(requisition.id);
    const stageCounts = Object.fromEntries(STAGES.map((s) => [s, counts.find((c) => c.stage === s)?.n ?? 0]));
    res.json({ ...requisition, stageCounts });
  });

  router.post(
    '/requisitions/:id/status',
    recruiterOnly,
    handle((req, res) => {
      const id = idParam(req);
      getRequisition(id);
      const { status } = parse(statusSchema, req.body);
      db.prepare('UPDATE requisitions SET status = ? WHERE id = ?').run(status, id);
      audit(db, req.user, status === 'closed' ? 'requisition_closed' : 'requisition_reopened', 'requisition', id);
      res.json(getRequisition(id));
    }),
  );

  /**
   * Deletes a role that has not gone to a client. CVs that belong to no other role are erased too
   * (hiring-only purpose), including their stored files. Roles with client activity must be closed instead.
   */
  router.delete(
    '/requisitions/:id',
    recruiterOnly,
    handle(async (req, res) => {
      const id = idParam(req);
      const requisition = getRequisition(id);
      const { n } = db
        .prepare('SELECT COUNT(*) AS n FROM applications WHERE requisition_id = ? AND submitted_at IS NOT NULL')
        .get(id);
      if (n > 0) {
        throw new HttpError(
          409,
          `${n} candidate${n > 1 ? 's were' : ' was'} submitted to the client for this role, so it cannot be deleted. Close it instead.`,
        );
      }

      const files = [];
      const summary = db.transaction(() => {
        const linked = db.prepare('SELECT candidate_id FROM applications WHERE requisition_id = ?').all(id);
        db.prepare('DELETE FROM applications WHERE requisition_id = ?').run(id);
        db.prepare('DELETE FROM requisitions WHERE id = ?').run(id);
        let cvsRemoved = 0;
        for (const { candidate_id: candidateId } of linked) {
          if (db.prepare('SELECT 1 FROM applications WHERE candidate_id = ? LIMIT 1').get(candidateId)) continue;
          const candidate = db.prepare('SELECT code, file_path FROM candidates WHERE id = ?').get(candidateId);
          if (candidate.file_path) files.push(candidate.file_path);
          db.prepare('DELETE FROM candidates WHERE id = ?').run(candidateId);
          audit(db, req.user, 'candidate_deleted_with_requisition', 'candidate', candidateId, {
            code: candidate.code,
            requisitionId: id,
          });
          cvsRemoved += 1;
        }
        audit(db, req.user, 'requisition_deleted', 'requisition', id, { title: requisition.title, cvsRemoved });
        return { cvsRemoved, applications: linked.length };
      })();
      await Promise.all(files.map((file) => fs.rm(file, { force: true })));
      res.json(summary);
    }),
  );

  router.put(
    '/requisitions/:id/scorecard',
    recruiterOnly,
    handle((req, res) => {
      const id = idParam(req);
      getRequisition(id);
      const scorecard = normaliseScorecard(parse(scorecardSchema, req.body));
      db.prepare('UPDATE requisitions SET scorecard = ?, title = ? WHERE id = ?').run(
        JSON.stringify(scorecard),
        scorecard.title,
        id,
      );
      rescoreRequisition(db, id);
      audit(db, req.user, 'scorecard_updated', 'requisition', id);
      res.json(getRequisition(id));
    }),
  );

  router.get('/requisitions/:id/applications', (req, res) => {
    const id = idParam(req);
    getRequisition(id);
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim().slice(0, 80) : null;
    const stage = STAGES.includes(req.query.stage) ? req.query.stage : null;
    res.json(rankedApplications(db, id, { q, stage }));
  });

  router.post(
    '/requisitions/:id/cvs',
    recruiterOnly,
    upload.array('files', MAX_FILES_PER_REQUEST),
    handle(async (req, res) => {
      const files = req.files ?? [];
      try {
        const id = idParam(req);
        if (getRequisition(id).status === 'closed')
          throw new HttpError(409, 'This role is closed. Reopen it to add CVs.');
        const { consentSource } = parse(uploadSchema, req.body);
        if (!files.length) throw new HttpError(400, 'Choose at least one CV');

        const results = [];
        for (const file of files) {
          try {
            results.push(await ingestFile(ctx, { requisitionId: id, file, user: req.user, consentSource }));
          } catch (err) {
            console.error('ingest failed', err);
            results.push({
              fileName: file.originalname,
              status: 'failed',
              message: 'Unexpected error while reading this file',
            });
          }
        }
        res.status(201).json({ results });
      } finally {
        await Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
      }
    }),
  );

  return router;
}
