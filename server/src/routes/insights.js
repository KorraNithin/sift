import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { parseJson } from '../services/applications.js';
import { STAGES } from '../services/pipeline.js';

const BASELINE_MINUTES_PER_CV = 3;
const ACCEPTANCE = { baseline: 45, target: 60 };
const HOUR_MS = 3600 * 1000;

/** Delivery-head analytics: outcome metrics, AI vs recruiter agreement and the audit trail. */
export function insightRoutes(ctx) {
  const { db } = ctx;
  const router = Router();
  router.use(authenticate(ctx), requireRole('head'));

  router.get('/insights', (_req, res) => {
    const totals = db
      .prepare(
        `SELECT COUNT(*) AS scored, SUM(a.opened_at IS NOT NULL) AS opened,
                SUM(a.client_decision IN ('shortlisted', 'interview')) AS accepted,
                SUM(a.client_decision = 'rejected') AS rejected
         FROM applications a JOIN candidates c ON c.id = a.candidate_id
         WHERE c.erased_at IS NULL AND a.score IS NOT NULL`,
      )
      .get();
    const requisitions = db
      .prepare('SELECT created_at AS createdAt, first_submitted_at AS firstSubmittedAt, status FROM requisitions')
      .all();
    const shortlisted = requisitions.filter((r) => r.firstSubmittedAt);
    const hours = shortlisted.map((r) => (new Date(r.firstSubmittedAt) - new Date(r.createdAt)) / HOUR_MS);
    const decided = (totals.accepted ?? 0) + (totals.rejected ?? 0);
    const funnel = db
      .prepare(
        'SELECT a.stage, COUNT(*) AS n FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE c.erased_at IS NULL GROUP BY a.stage',
      )
      .all();

    res.json({
      requisitions: requisitions.filter((r) => r.status === 'open').length,
      cvsRanked: totals.scored,
      readingMinutesSaved: Math.max(0, (totals.scored - (totals.opened ?? 0)) * BASELINE_MINUTES_PER_CV),
      baselineMinutesPerCv: BASELINE_MINUTES_PER_CV,
      shortlistWithin48hPct: shortlisted.length
        ? Math.round((hours.filter((h) => h <= 48).length / shortlisted.length) * 100)
        : null,
      avgHoursToShortlist: hours.length ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length) : null,
      clientAcceptancePct: decided ? Math.round((totals.accepted / decided) * 100) : null,
      acceptance: ACCEPTANCE,
      funnel: STAGES.map((stage) => ({ stage, count: funnel.find((f) => f.stage === stage)?.n ?? 0 })),
    });
  });

  /**
   * Weekly sample: for requisitions with submissions in the last 7 days, compare the AI's top-K
   * (K = number submitted) with the recruiter's actual picks and list every disagreement.
   */
  router.get('/insights/agreement', (_req, res) => {
    const since = new Date(Date.now() - 7 * 24 * HOUR_MS).toISOString();
    const reqs = db
      .prepare(
        `SELECT DISTINCT r.id, r.title FROM requisitions r JOIN applications a ON a.requisition_id = r.id
         WHERE a.submitted_at >= ? ORDER BY r.id LIMIT 5`,
      )
      .all(since);

    const sample = reqs.map((r) => {
      const rows = db
        .prepare(
          `SELECT a.id, a.score, a.stage, a.submitted_at AS submittedAt, c.code, c.headline,
                  ROW_NUMBER() OVER (ORDER BY a.score IS NULL, a.score DESC, a.id) AS rank
           FROM applications a JOIN candidates c ON c.id = a.candidate_id
           WHERE a.requisition_id = ? AND c.erased_at IS NULL`,
        )
        .all(r.id);
      const picked = rows.filter((x) => x.submittedAt);
      const k = picked.length;
      const aiTop = rows.filter((x) => x.rank <= k);
      const overlap = picked.filter((x) => x.rank <= k).length;
      return {
        requisitionId: r.id,
        title: r.title,
        picked: k,
        overlap,
        agreementPct: k ? Math.round((overlap / k) * 100) : null,
        recruiterOverrides: picked
          .filter((x) => x.rank > k)
          .map(({ code, headline, rank, score }) => ({ code, headline, aiRank: rank, score })),
        aiPicksNotSubmitted: aiTop
          .filter((x) => !x.submittedAt)
          .map(({ code, headline, rank, score, stage }) => ({ code, headline, aiRank: rank, score, stage })),
      };
    });
    const picked = sample.reduce((sum, s) => sum + s.picked, 0);
    const overlap = sample.reduce((sum, s) => sum + s.overlap, 0);
    res.json({ windowDays: 7, overallAgreementPct: picked ? Math.round((overlap / picked) * 100) : null, sample });
  });

  router.get('/audit', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const action = typeof req.query.action === 'string' && req.query.action ? req.query.action : null;
    const rows = db
      .prepare(
        `SELECT id, at, actor_name AS actorName, actor_role AS actorRole, action, entity, entity_id AS entityId, detail
         FROM audit_log WHERE (? IS NULL OR action = ?) ORDER BY id DESC LIMIT ?`,
      )
      .all(action, action, limit);
    const actions = db
      .prepare('SELECT DISTINCT action FROM audit_log ORDER BY action')
      .all()
      .map((r) => r.action);
    res.json({ actions, entries: rows.map((r) => ({ ...r, detail: parseJson(r.detail, null) })) });
  });

  return router;
}
