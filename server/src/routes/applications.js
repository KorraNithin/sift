import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { nowIso } from '../db.js';
import { HttpError, handle, parse } from '../errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { applicationDetail, rescoreCandidate } from '../services/applications.js';
import { audit } from '../services/audit.js';
import { canMove, STAGES } from '../services/pipeline.js';
import { cleanText, parseCv } from '../services/parser.js';
import { canonicalCity, canonicalSkill } from '../services/taxonomy.js';

const moveSchema = z.object({ stage: z.enum(STAGES), reason: z.string().trim().max(300).optional() });
const eraseSchema = z.object({ reason: z.string().trim().min(3, 'Record why the data is being erased').max(300) });
const patchSchema = z
  .object({
    rawText: z.string().max(60000).optional(),
    headline: z.string().trim().max(80).nullable().optional(),
    experienceYears: z.number().min(0).max(45).nullable().optional(),
    noticeDays: z.number().int().min(0).max(365).nullable().optional(),
    location: z.string().trim().max(60).nullable().optional(),
    skills: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function applicationRoutes(ctx) {
  const { db } = ctx;
  const router = Router();
  const recruiterOnly = requireRole('recruiter');

  router.use(authenticate(ctx), requireRole('recruiter', 'head'));

  const loadApplication = (req) => {
    const id = Number(req.params.id);
    const detail = Number.isInteger(id) ? applicationDetail(db, id) : null;
    if (!detail) throw new HttpError(404, 'Application not found');
    return detail;
  };

  router.get('/applications/:id', (req, res) => {
    const detail = loadApplication(req);
    audit(db, req.user, 'profile_viewed', 'application', detail.id, { candidate: detail.candidate.code });
    res.json(detail);
  });

  /** Opening the CV is the recruiter's required review step before a candidate can be submitted. */
  router.post(
    '/applications/:id/open',
    handle((req, res) => {
      const detail = loadApplication(req);
      const { raw_text: text } = db.prepare('SELECT raw_text FROM candidates WHERE id = ?').get(detail.candidate.id);
      if (req.user.role === 'recruiter' && !detail.openedAt) {
        db.prepare('UPDATE applications SET opened_at = ?, updated_at = ? WHERE id = ?').run(
          nowIso(),
          nowIso(),
          detail.id,
        );
      }
      audit(db, req.user, 'cv_opened', 'application', detail.id, { candidate: detail.candidate.code });
      res.json({
        text,
        hasFile: detail.candidate.hasFile,
        parseStatus: detail.candidate.parseStatus,
        openedAt: detail.openedAt ?? nowIso(),
      });
    }),
  );

  router.get(
    '/applications/:id/file',
    handle((req, res) => {
      const detail = loadApplication(req);
      const { file_path: filePath } = db
        .prepare('SELECT file_path FROM candidates WHERE id = ?')
        .get(detail.candidate.id);
      if (!filePath || !fs.existsSync(filePath)) throw new HttpError(404, 'The original file is not available');
      audit(db, req.user, 'cv_file_downloaded', 'application', detail.id, { candidate: detail.candidate.code });
      const ext = path.extname(filePath).slice(1);
      res.type(CONTENT_TYPES[ext] ?? 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${detail.candidate.code}.${ext}"`);
      fs.createReadStream(filePath).pipe(res);
    }),
  );

  router.post(
    '/applications/:id/move',
    recruiterOnly,
    handle((req, res) => {
      const detail = loadApplication(req);
      const { stage, reason } = parse(moveSchema, req.body);
      if (!canMove('recruiter', detail.stage, stage)) {
        throw new HttpError(409, `A candidate cannot move from ${detail.stage} to ${stage}`);
      }
      if (stage === 'rejected' && (reason ?? '').length < 3) throw new HttpError(400, 'Give a short reason');

      if (stage === 'submitted') {
        if (!detail.openedAt) throw new HttpError(409, 'Open the CV before submitting this candidate to the client');
        if (detail.score == null) throw new HttpError(409, 'This candidate has no score yet. Add the CV text first.');
        const { rank } = db
          .prepare(
            `SELECT COUNT(*) + 1 AS rank FROM applications
           WHERE requisition_id = ? AND score IS NOT NULL AND (score > ? OR (score = ? AND id < ?))`,
          )
          .get(detail.requisition.id, detail.score, detail.score, detail.id);
        db.prepare(
          'UPDATE applications SET stage = ?, submitted_at = ?, ai_rank_at_submit = ?, updated_at = ? WHERE id = ?',
        ).run('submitted', nowIso(), rank, nowIso(), detail.id);
        db.prepare('UPDATE requisitions SET first_submitted_at = COALESCE(first_submitted_at, ?) WHERE id = ?').run(
          nowIso(),
          detail.requisition.id,
        );
      } else if (stage === 'screened' || stage === 'sourced') {
        // Recalling a candidate withdraws the submission and clears the client's earlier decision.
        db.prepare(
          'UPDATE applications SET stage = ?, submitted_at = NULL, client_decision = NULL, interview_slot = NULL, reject_reason = NULL, updated_at = ? WHERE id = ?',
        ).run(stage, nowIso(), detail.id);
      } else {
        db.prepare('UPDATE applications SET stage = ?, reject_reason = ?, updated_at = ? WHERE id = ?').run(
          stage,
          stage === 'rejected' ? reason : null,
          nowIso(),
          detail.id,
        );
      }
      audit(db, req.user, 'stage_changed', 'application', detail.id, {
        from: detail.stage,
        to: stage,
        candidate: detail.candidate.code,
      });
      res.json(applicationDetail(db, detail.id));
    }),
  );

  /** Corrects parse mistakes or adds transcribed text for scanned CVs, then re-scores every application. */
  router.patch(
    '/candidates/:id',
    recruiterOnly,
    handle((req, res) => {
      const id = Number(req.params.id);
      const candidate = db.prepare('SELECT * FROM candidates WHERE id = ? AND erased_at IS NULL').get(id);
      if (!candidate) throw new HttpError(404, 'Candidate not found');
      const patch = parse(patchSchema, req.body);

      const next = {};
      if (patch.rawText !== undefined) {
        const text = cleanText(patch.rawText);
        const parsed = parseCv(text, { fileName: candidate.file_name });
        Object.assign(next, {
          raw_text: text,
          parse_status: 'manual',
          skills: JSON.stringify(parsed.skills),
          experience_years: parsed.experienceYears,
          notice_days: parsed.noticeDays,
          location: parsed.location,
          headline: parsed.headline,
          expected_ctc: parsed.expectedCtc,
          current_ctc: parsed.currentCtc,
        });
      }
      if (patch.headline !== undefined) next.headline = patch.headline;
      if (patch.experienceYears !== undefined) next.experience_years = patch.experienceYears;
      if (patch.noticeDays !== undefined) next.notice_days = patch.noticeDays;
      if (patch.location !== undefined) next.location = patch.location ? canonicalCity(patch.location) : null;
      if (patch.skills !== undefined) next.skills = JSON.stringify([...new Set(patch.skills.map(canonicalSkill))]);

      const columns = Object.keys(next);
      db.prepare(`UPDATE candidates SET ${columns.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({
        ...next,
        id,
      });
      rescoreCandidate(db, id);
      audit(db, req.user, 'profile_edited', 'candidate', id, { fields: Object.keys(patch), candidate: candidate.code });
      res.json({ ok: true });
    }),
  );

  /** Erasure on request: removes personal data and the stored file, keeps an anonymous tombstone and the audit trail. */
  router.delete(
    '/candidates/:id',
    handle(async (req, res) => {
      if (!['recruiter', 'head'].includes(req.user.role)) throw new HttpError(403, 'You do not have access to this');
      const id = Number(req.params.id);
      const candidate = db.prepare('SELECT * FROM candidates WHERE id = ? AND erased_at IS NULL').get(id);
      if (!candidate) throw new HttpError(404, 'Candidate not found');
      const { reason } = parse(eraseSchema, req.body ?? {});

      db.transaction(() => {
        db.prepare(
          `UPDATE candidates SET name = 'Erased candidate', email = NULL, phone = NULL, headline = NULL, skills = '[]',
           location = NULL, current_ctc = NULL, expected_ctc = NULL, experience_years = NULL, notice_days = NULL,
           raw_text = '', file_hash = NULL, file_path = NULL, file_name = NULL, erased_at = ? WHERE id = ?`,
        ).run(nowIso(), id);
        db.prepare("UPDATE applications SET score = NULL, breakdown = '{}', updated_at = ? WHERE candidate_id = ?").run(
          nowIso(),
          id,
        );
        audit(db, req.user, 'candidate_erased', 'candidate', id, { code: candidate.code, reason });
      })();
      if (candidate.file_path) await fsp.rm(candidate.file_path, { force: true });
      res.json({ ok: true });
    }),
  );

  return router;
}
