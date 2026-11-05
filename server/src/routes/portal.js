import { Router } from 'express';
import { z } from 'zod';
import { nowIso } from '../db.js';
import { HttpError, handle, parse } from '../errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { parseJson } from '../services/applications.js';
import { audit, notify } from '../services/audit.js';
import { maskEmail, maskName, maskPhone, redactContacts } from '../services/masking.js';
import { canMove } from '../services/pipeline.js';

const decisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('shortlist') }),
  z.object({ action: z.literal('reject'), reason: z.string().trim().min(3, 'Tell the recruiter why').max(300) }),
  z.object({ action: z.literal('interview'), slot: z.string().datetime({ message: 'Choose a valid date and time' }) }),
]);

const TARGET_STAGE = { shortlist: 'shortlisted', reject: 'rejected', interview: 'interview' };
const SUBMITTED = "a.submitted_at IS NOT NULL AND a.stage NOT IN ('sourced', 'screened') AND c.erased_at IS NULL";

/** Client hiring-manager API. Every query is scoped to the signed-in user's own client. */
export function portalRoutes(ctx) {
  const { db } = ctx;
  const router = Router();
  router.use(authenticate(ctx), requireRole('client'));

  const summary = (row) => ({
    id: row.id,
    requisitionId: row.requisitionId,
    code: row.code,
    name: maskName(row.name),
    headline: row.headline,
    experienceYears: row.experience_years,
    noticeDays: row.notice_days,
    location: row.location,
    skills: parseJson(row.skills, []).slice(0, 6),
    score: row.score,
    confidence: row.confidence,
    stage: row.stage,
    submittedAt: row.submitted_at,
    interviewSlot: row.interview_slot,
    rejectReason: row.reject_reason,
    clientDecision: row.client_decision,
  });

  const ownApplication = (req) => {
    const row = db
      .prepare(
        `SELECT a.*, a.requisition_id AS requisitionId, r.title AS requisitionTitle, c.*, a.id AS id, a.stage AS stage
         FROM applications a
         JOIN requisitions r ON r.id = a.requisition_id
         JOIN candidates c ON c.id = a.candidate_id
         WHERE a.id = ? AND r.client_id = ? AND ${SUBMITTED}`,
      )
      .get(Number(req.params.id), req.user.clientId);
    if (!row) throw new HttpError(404, 'Candidate not found');
    return row;
  };

  router.get('/requisitions', (req, res) => {
    const rows = db
      .prepare(
        `SELECT r.id, r.title, r.created_at AS createdAt,
           SUM(a.stage = 'submitted') AS awaiting,
           SUM(a.stage IN ('shortlisted', 'interview', 'offered', 'joined')) AS progressing,
           COUNT(a.id) AS total
         FROM requisitions r
         JOIN applications a ON a.requisition_id = r.id
         JOIN candidates c ON c.id = a.candidate_id
         WHERE r.client_id = ? AND ${SUBMITTED}
         GROUP BY r.id ORDER BY awaiting DESC, r.created_at DESC`,
      )
      .all(req.user.clientId);
    res.json(rows);
  });

  router.get('/requisitions/:id', (req, res) => {
    const requisition = db
      .prepare('SELECT id, title, scorecard FROM requisitions WHERE id = ? AND client_id = ?')
      .get(Number(req.params.id), req.user.clientId);
    if (!requisition) throw new HttpError(404, 'Requisition not found');
    const rows = db
      .prepare(
        `SELECT a.*, a.requisition_id AS requisitionId, c.code, c.name, c.headline, c.experience_years, c.notice_days, c.location, c.skills
         FROM applications a JOIN candidates c ON c.id = a.candidate_id
         WHERE a.requisition_id = ? AND ${SUBMITTED}
         ORDER BY (a.stage = 'submitted') DESC, a.score DESC`,
      )
      .all(requisition.id);
    const { title, experience } = parseJson(requisition.scorecard, {});
    res.json({ id: requisition.id, title: requisition.title || title, experience, candidates: rows.map(summary) });
  });

  router.get('/applications/:id', (req, res) => {
    const row = ownApplication(req);
    const breakdown = parseJson(row.breakdown, {});
    audit(db, req.user, 'client_viewed_candidate', 'application', row.id, { candidate: row.code });
    res.json({
      ...summary(row),
      requisitionTitle: row.requisitionTitle,
      email: maskEmail(row.email),
      phone: maskPhone(row.phone),
      criteria: (breakdown.criteria ?? []).map(
        ({ label, status, evidence, detail, note, matched, required, kind, points, earned }) => ({
          label,
          status,
          evidence,
          detail,
          note,
          matched,
          required,
          kind,
          points,
          earned,
        }),
      ),
      cvText: redactContacts(row.raw_text),
    });
  });

  router.post(
    '/applications/:id/decision',
    handle((req, res) => {
      const row = ownApplication(req);
      const decision = parse(decisionSchema, req.body);
      const target = TARGET_STAGE[decision.action];
      if (!canMove('client', row.stage, target))
        throw new HttpError(409, 'This candidate can no longer be updated from here');
      if (decision.action === 'interview' && new Date(decision.slot) <= new Date())
        throw new HttpError(400, 'Choose a time in the future');

      db.prepare(
        'UPDATE applications SET stage = ?, client_decision = ?, reject_reason = ?, interview_slot = ?, updated_at = ? WHERE id = ?',
      ).run(
        target,
        target === 'rejected' ? 'rejected' : target,
        decision.action === 'reject' ? decision.reason : null,
        decision.action === 'interview' ? decision.slot : row.interview_slot,
        nowIso(),
        row.id,
      );
      audit(db, req.user, `client_${decision.action}`, 'application', row.id, { candidate: row.code, to: target });
      notify(db, 'recruiter@companya.test', `Client update on ${row.code}: ${target}`, row.id);
      res.json({ ok: true, stage: target });
    }),
  );

  return router;
}
