import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { openDb, resetDb } from '../db.js';
import { audit } from '../services/audit.js';
import { rankedApplications } from '../services/applications.js';
import { insertCandidate, linkCandidate } from '../services/ingest.js';
import { extractScorecard } from '../services/jd.js';
import { parseCv } from '../services/parser.js';
import { BRIEF_CANDIDATES, buildCv, generatePool, mulberry32 } from './cvTemplates.js';

export const DEMO_PASSWORD = 'Demo@1234';
const HOUR = 3600 * 1000;
const ago = (days, hours = 0) => new Date(Date.now() - (days * 24 + hours) * HOUR).toISOString();
const plus = (iso, hours) => new Date(new Date(iso).getTime() + hours * HOUR).toISOString();

const JDS = {
  java: 'Senior Java Developer, 5-8 years, Spring Boot, Noida, notice up to 60 days',
  kyc: `KYC Analyst
Northbank Operations, Gurugram
2-5 years of experience in KYC and AML checks.
Must have: KYC, AML checks, Excel.
Good to have: Sanctions Screening, MIS Reporting
Notice period up to 30 days. Budget up to 8 LPA.`,
  retail: `Store Manager
Kiran Retail, Delhi
4-8 years in organised retail. Must have Store Operations, Inventory Management, Team Management.
Good to have: Visual Merchandising, POS
Notice up to 45 days.`,
};

/** Seeds demo accounts, requisitions, candidates and a realistic pipeline history. */
export function seedDemo(db) {
  const rand = mulberry32(20260903);
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

  db.transaction(() => {
    const client = (name, sector) =>
      Number(db.prepare('INSERT INTO clients (name, sector) VALUES (?, ?)').run(name, sector).lastInsertRowid);
    const orbit = client('Orbit IT Services', 'IT services');
    const northbank = client('Northbank Operations', 'Banking back-office');
    const kiran = client('Kiran Retail', 'Retail');

    const user = (email, name, role, clientId = null) =>
      Number(
        db
          .prepare('INSERT INTO users (email, name, role, password_hash, client_id) VALUES (?, ?, ?, ?, ?)')
          .run(email, name, role, passwordHash, clientId).lastInsertRowid,
      );
    const recruiter = {
      id: user('recruiter@companya.test', 'Priya Sharma', 'recruiter'),
      name: 'Priya Sharma',
      role: 'recruiter',
    };
    const head = { id: user('head@companya.test', 'Rahul Menon', 'head'), name: 'Rahul Menon', role: 'head' };
    const clientUser = {
      id: user('client@orbit.test', 'Anita Kapoor', 'client', orbit),
      name: 'Anita Kapoor',
      role: 'client',
    };
    const northUser = {
      id: user('client@northbank.test', 'Vivek Rao', 'client', northbank),
      name: 'Vivek Rao',
      role: 'client',
    };
    user('client@kiranretail.test', 'Meghna Jain', 'client', kiran);

    const requisition = (clientId, key, createdAt, tweak) => {
      const draft = extractScorecard(JDS[key]).scorecard;
      const scorecard = tweak ? tweak(draft) : draft;
      return Number(
        db
          .prepare(
            'INSERT INTO requisitions (client_id, title, jd_text, scorecard, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(clientId, scorecard.title, JDS[key], JSON.stringify(scorecard), recruiter.id, createdAt).lastInsertRowid,
      );
    };
    const reqJava = requisition(orbit, 'java', ago(6), (s) => ({
      ...s,
      skills: [
        ...s.skills,
        { name: 'Microservices', required: false, weight: 1 },
        { name: 'Hibernate', required: false, weight: 1 },
      ],
    }));
    const reqKyc = requisition(northbank, 'kyc', ago(4));
    const reqRetail = requisition(kiran, 'retail', ago(1));

    const usedNames = new Set(BRIEF_CANDIDATES.map((c) => c.name));
    const addCandidates = (reqId, specs, createdAt) => {
      for (const spec of specs) {
        const text = buildCv(spec, rand);
        const parsed = parseCv(text);
        const id = insertCandidate(db, {
          ...parsed,
          code: spec.code,
          rawText: text,
          consentSource: 'Candidate applied directly',
          consentAt: createdAt,
          createdAt,
          createdBy: recruiter.id,
        });
        linkCandidate(db, reqId, id, createdAt);
        audit(db, recruiter, 'cv_ingested', 'candidate', id, { requisitionId: reqId, seeded: true }, createdAt);
      }
    };
    const [ritika, arjun, pooja] = BRIEF_CANDIDATES;
    addCandidates(reqJava, [ritika, pooja, arjun, ...generatePool('java', 24, rand, usedNames)], ago(6, -1));
    addCandidates(reqKyc, generatePool('kyc', 13, rand, usedNames), ago(4, -1));
    const arjunId = db.prepare('SELECT id FROM candidates WHERE code = ?').get(arjun.code).id;
    linkCandidate(db, reqKyc, arjunId, ago(4, -1));
    addCandidates(reqRetail, generatePool('retail', 10, rand, usedNames), ago(1));

    /** Applies a recruiter/client history to a requisition, addressed by AI rank. */
    const play = (reqId, createdAt, plan, actors) => {
      const ranked = rankedApplications(db, reqId);
      const submittedAt = plus(createdAt, 30);
      db.prepare('UPDATE requisitions SET first_submitted_at = ? WHERE id = ?').run(submittedAt, reqId);
      for (const step of plan) {
        const app = ranked[step.rank - 1];
        const fields = { opened_at: plus(createdAt, 20), stage: step.stage ?? 'screened', updated_at: submittedAt };
        if (step.submitted) Object.assign(fields, { submitted_at: submittedAt, ai_rank_at_submit: step.rank });
        if (step.decision)
          Object.assign(fields, {
            client_decision: step.decision,
            reject_reason: step.reason ?? null,
            interview_slot: step.slot ?? null,
          });
        const cols = Object.keys(fields);
        db.prepare(`UPDATE applications SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({
          ...fields,
          id: app.id,
        });
        audit(db, recruiter, 'cv_opened', 'application', app.id, { candidate: app.code }, plus(createdAt, 20));
        if (step.submitted)
          audit(
            db,
            recruiter,
            'stage_changed',
            'application',
            app.id,
            { from: 'screened', to: 'submitted', candidate: app.code },
            submittedAt,
          );
        if (step.decision)
          audit(
            db,
            actors.client,
            `client_${step.decision === 'rejected' ? 'reject' : step.decision === 'interview' ? 'interview' : 'shortlist'}`,
            'application',
            app.id,
            { candidate: app.code },
            plus(submittedAt, 9),
          );
      }
    };

    const in2days = new Date(Date.now() + 48 * HOUR).toISOString();
    play(
      reqJava,
      ago(6),
      [
        { rank: 1, submitted: true, stage: 'offered', decision: 'interview', slot: ago(3) },
        { rank: 2, submitted: true, stage: 'interview', decision: 'interview', slot: in2days },
        { rank: 3, submitted: true, stage: 'shortlisted', decision: 'shortlisted' },
        {
          rank: 4,
          submitted: true,
          stage: 'rejected',
          decision: 'rejected',
          reason: 'Notice period is too long for our start date',
        },
        { rank: 5 },
        { rank: 6, submitted: true, stage: 'submitted' },
        { rank: 7 },
        { rank: 8, submitted: true, stage: 'submitted' },
      ],
      { client: clientUser },
    );
    play(
      reqKyc,
      ago(4),
      [
        { rank: 1, submitted: true, stage: 'shortlisted', decision: 'shortlisted' },
        {
          rank: 2,
          submitted: true,
          stage: 'rejected',
          decision: 'rejected',
          reason: 'Needs 3+ years of hands-on AML experience',
        },
        { rank: 3, submitted: true, stage: 'submitted' },
        { rank: 4 },
      ],
      { client: northUser },
    );

    audit(db, head, 'login', 'user', head.id, null, ago(0, 2));
    audit(db, recruiter, 'login', 'user', recruiter.id, null, ago(0, 5));
    audit(db, clientUser, 'login', 'user', clientUser.id, null, ago(0, 3));
  })();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const db = openDb(config.dbPath);
  resetDb(db);
  seedDemo(db);
  const rows = db
    .prepare(
      'SELECT r.title, COUNT(a.id) AS n, MAX(a.score) AS top FROM requisitions r JOIN applications a ON a.requisition_id = r.id GROUP BY r.id',
    )
    .all();
  console.log(`Seeded ${config.dbPath}`);
  rows.forEach((r) => console.log(`  ${r.title}: ${r.n} candidates, top score ${r.top}`));
  console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
}
