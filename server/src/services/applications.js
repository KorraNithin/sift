import { nowIso } from '../db.js';
import { anonymize } from './anonymize.js';
import { scoreCandidate } from './scoring.js';

export const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

/**
 * Re-scores one application from the candidate's stored CV text and the requisition's scorecard.
 * Scanned CVs with no readable text stay unscored instead of receiving a misleading zero.
 */
export function scoreApplication(db, applicationId) {
  const row = db
    .prepare(
      `SELECT r.scorecard, c.name, c.raw_text, c.experience_years, c.notice_days, c.location, c.expected_ctc, c.parse_status
       FROM applications a
       JOIN requisitions r ON r.id = a.requisition_id
       JOIN candidates c ON c.id = a.candidate_id
       WHERE a.id = ?`,
    )
    .get(applicationId);
  if (!row) return;

  let result;
  let hiddenLines = 0;
  if (row.parse_status === 'scan') {
    result = {
      score: null,
      confidence: 'low',
      flags: ['Scanned image: no text could be read. Open the file or paste the text.'],
      criteria: [],
    };
  } else {
    const anon = anonymize(row.raw_text, { name: row.name });
    hiddenLines = anon.hiddenLines;
    result = scoreCandidate(
      parseJson(row.scorecard, {}),
      {
        experienceYears: row.experience_years,
        noticeDays: row.notice_days,
        location: row.location,
        expectedCtc: row.expected_ctc,
      },
      anon.text,
    );
  }
  db.prepare('UPDATE applications SET score = ?, confidence = ?, breakdown = ?, updated_at = ? WHERE id = ?').run(
    result.score,
    result.confidence,
    JSON.stringify({ criteria: result.criteria, flags: result.flags, hiddenLines }),
    nowIso(),
    applicationId,
  );
}

export function rescoreRequisition(db, requisitionId) {
  const ids = db.prepare('SELECT id FROM applications WHERE requisition_id = ?').all(requisitionId);
  db.transaction(() => ids.forEach(({ id }) => scoreApplication(db, id)))();
}

export function rescoreCandidate(db, candidateId) {
  const ids = db.prepare('SELECT id FROM applications WHERE candidate_id = ?').all(candidateId);
  db.transaction(() => ids.forEach(({ id }) => scoreApplication(db, id)))();
}

const meterOf = (breakdown) =>
  (breakdown.criteria ?? []).map(({ label, status, points, earned, required, kind }) => ({
    label,
    status,
    points,
    earned,
    required,
    kind,
  }));

/**
 * Applications for a requisition, ranked by score. Rank is computed over the full list so it stays
 * stable while searching. Low scorers are included: nobody is filtered out by the AI.
 */
export function rankedApplications(db, requisitionId, { q = null, stage = null } = {}) {
  const rows = db
    .prepare(
      `WITH ranked AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY score IS NULL, score DESC, id) AS rank
         FROM applications WHERE requisition_id = @req
       )
       SELECT a.id, a.stage, a.score, a.confidence, a.breakdown, a.opened_at AS openedAt, a.submitted_at AS submittedAt,
              a.client_decision AS clientDecision, r.rank, c.id AS candidateId, c.code, c.name, c.headline,
              c.experience_years AS experienceYears, c.notice_days AS noticeDays, c.location, c.skills, c.parse_status AS parseStatus
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN ranked r ON r.id = a.id
       WHERE a.requisition_id = @req AND c.erased_at IS NULL
         AND (@stage IS NULL OR a.stage = @stage)
         AND (@q IS NULL OR c.name LIKE @q OR c.headline LIKE @q OR c.code LIKE @q OR c.skills LIKE @q OR c.location LIKE @q OR c.raw_text LIKE @q)
       ORDER BY r.rank`,
    )
    .all({ req: requisitionId, stage, q: q ? `%${q}%` : null });

  return rows.map(({ breakdown, skills, ...row }) => {
    const parsed = parseJson(breakdown, {});
    return { ...row, skills: parseJson(skills, []), meter: meterOf(parsed), flags: parsed.flags ?? [] };
  });
}

/** Full recruiter view of one application, including the candidate's personal data. */
export function applicationDetail(db, id) {
  const row = db
    .prepare(
      `SELECT a.*, r.title AS requisitionTitle, r.client_id AS clientId, cl.name AS clientName,
              c.code, c.name, c.email, c.phone, c.headline, c.experience_years, c.skills, c.notice_days, c.location,
              c.current_ctc, c.expected_ctc, c.parse_status, c.consent_at, c.consent_source, c.consent_purpose,
              c.file_name, c.file_path, c.erased_at
       FROM applications a
       JOIN requisitions r ON r.id = a.requisition_id
       JOIN clients cl ON cl.id = r.client_id
       JOIN candidates c ON c.id = a.candidate_id
       WHERE a.id = ?`,
    )
    .get(id);
  if (!row || row.erased_at) return null;

  const breakdown = parseJson(row.breakdown, {});
  return {
    id: row.id,
    requisition: { id: row.requisition_id, title: row.requisitionTitle, clientName: row.clientName },
    stage: row.stage,
    score: row.score,
    confidence: row.confidence,
    criteria: breakdown.criteria ?? [],
    flags: breakdown.flags ?? [],
    hiddenLines: breakdown.hiddenLines ?? 0,
    openedAt: row.opened_at,
    submittedAt: row.submitted_at,
    clientDecision: row.client_decision,
    rejectReason: row.reject_reason,
    interviewSlot: row.interview_slot,
    candidate: {
      id: row.candidate_id,
      code: row.code,
      name: row.name,
      email: row.email,
      phone: row.phone,
      headline: row.headline,
      experienceYears: row.experience_years,
      skills: parseJson(row.skills, []),
      noticeDays: row.notice_days,
      location: row.location,
      currentCtc: row.current_ctc,
      expectedCtc: row.expected_ctc,
      parseStatus: row.parse_status,
      consentAt: row.consent_at,
      consentSource: row.consent_source,
      consentPurpose: row.consent_purpose,
      fileName: row.file_name,
      hasFile: Boolean(row.file_path),
    },
  };
}
