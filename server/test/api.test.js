import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { cvForm, startApp } from './helpers.js';

let app;
let recruiter;
let head;
let orbit;
let northbank;

before(async () => {
  app = await startApp();
  [recruiter, head, orbit, northbank] = await Promise.all(
    ['recruiter@companya.test', 'head@companya.test', 'client@orbit.test', 'client@northbank.test'].map((e) =>
      app.as(e),
    ),
  );
});
after(() => app.close());

const javaReq = () => app.db.prepare("SELECT id FROM requisitions WHERE title = 'Senior Java Developer'").get().id;
const appIdWhere = (where) =>
  app.db.prepare(`SELECT a.id FROM applications a WHERE a.requisition_id = ? AND ${where} LIMIT 1`).get(javaReq()).id;

describe('Authentication and roles', () => {
  it('rejects anonymous requests and wrong passwords with a generic message', async () => {
    assert.equal((await fetch(`${app.base}/api/requisitions`)).status, 401);
    const { res } = await app.login('recruiter@companya.test', 'wrong');
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, 'Email or password is incorrect');
  });

  it('blocks state-changing requests that lack the client header, whatever the Origin or Host', async () => {
    const attempt = (headers) =>
      fetch(`${app.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ email: 'recruiter@companya.test', password: 'Demo@1234' }),
      });
    assert.equal((await attempt({ origin: 'https://evil.example' })).status, 403);
    // Behind a proxy (Vite dev server, Codespaces, a load balancer) Host and Origin often differ. That must not matter.
    assert.equal((await attempt({ origin: 'http://localhost:5173', 'x-requested-with': 'sift' })).status, 200);
  });

  it('keeps clients out of recruiter endpoints and recruiters out of the portal', async () => {
    assert.equal((await orbit.get('/requisitions')).status, 403);
    assert.equal((await recruiter.get('/portal/requisitions')).status, 403);
    assert.equal((await recruiter.get('/insights')).status, 403);
    assert.equal((await head.get('/insights')).status, 200);
  });

  it('makes the delivery head read-only', async () => {
    const id = appIdWhere("a.stage = 'sourced'");
    assert.equal((await head.post(`/applications/${id}/move`, { stage: 'screened' })).status, 403);
  });
});

describe('Ranking and fairness in the API', () => {
  it('returns candidates ranked by score and keeps low scorers searchable', async () => {
    const { body } = await recruiter.get(`/requisitions/${javaReq()}/applications`);
    const scores = body.map((a) => a.score);
    assert.deepEqual(
      scores,
      [...scores].sort((a, b) => b - a),
    );
    assert.ok(
      body.some((a) => a.score < 50),
      'low scorers must still be listed',
    );
    assert.ok(body.every((a) => a.rank >= 1));

    const search = await recruiter.get(`/requisitions/${javaReq()}/applications?q=python`);
    assert.ok(search.body.length >= 1);
    assert.ok(search.body.every((a) => a.rank >= 1));
  });

  it('scores never change the stage: nobody is rejected automatically', async () => {
    const { body } = await recruiter.get(`/requisitions/${javaReq()}/applications?stage=rejected`);
    assert.ok(
      body.every((a) => a.clientDecision === 'rejected'),
      'only client decisions reject candidates',
    );
  });
});

describe('Recruiter review gate', () => {
  it('blocks submission until the CV has been opened, then allows it', async () => {
    const id = appIdWhere("a.stage = 'sourced' AND a.opened_at IS NULL AND a.score IS NOT NULL");
    assert.equal((await recruiter.post(`/applications/${id}/move`, { stage: 'screened' })).status, 200);
    const blocked = await recruiter.post(`/applications/${id}/move`, { stage: 'submitted' });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error, /Open the CV/);

    assert.equal((await recruiter.post(`/applications/${id}/open`)).status, 200);
    const ok = await recruiter.post(`/applications/${id}/move`, { stage: 'submitted' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.stage, 'submitted');
  });

  it('rejects illegal stage jumps and requires a reason to reject', async () => {
    const id = appIdWhere("a.stage = 'sourced' AND a.opened_at IS NULL");
    assert.equal((await recruiter.post(`/applications/${id}/move`, { stage: 'joined' })).status, 409);
    assert.equal((await recruiter.post(`/applications/${id}/move`, { stage: 'rejected' })).status, 400);
  });
});

describe('Client portal', () => {
  it('shows only candidates submitted to that client, with masked contacts', async () => {
    const { body } = await orbit.get(`/portal/requisitions/${javaReq()}`);
    assert.ok(body.candidates.length >= 5);
    const codes = new Set(body.candidates.map((c) => c.code));
    const unsubmitted = app.db
      .prepare(
        'SELECT c.code FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE a.submitted_at IS NULL',
      )
      .all();
    assert.ok(unsubmitted.every((u) => !codes.has(u.code)));

    const detail = await orbit.get(`/portal/applications/${body.candidates[0].id}`);
    assert.equal(detail.status, 200);
    assert.match(detail.body.email, /•••@/);
    assert.match(detail.body.phone, /••••• ••/);
    const { email, phone } = app.db
      .prepare('SELECT c.email, c.phone FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE a.id = ?')
      .get(body.candidates[0].id);
    assert.ok(!detail.text.includes(email), 'raw email must not reach the client');
    assert.ok(!detail.text.includes(phone.slice(0, 5)), 'raw phone must not reach the client');
    assert.ok(!/\b[6-9]\d{4}[ -]?\d{5}\b/.test(detail.text), 'raw phone must not reach the client');
  });

  it('isolates clients from each other', async () => {
    const { body } = await orbit.get(`/portal/requisitions/${javaReq()}`);
    assert.equal((await northbank.get(`/portal/applications/${body.candidates[0].id}`)).status, 404);
    assert.equal((await northbank.get(`/portal/requisitions/${javaReq()}`)).status, 404);
  });

  it('hides candidates that were never submitted', async () => {
    const id = appIdWhere('a.submitted_at IS NULL');
    assert.equal((await orbit.get(`/portal/applications/${id}`)).status, 404);
  });

  it('requires a reason to reject and a future time for an interview', async () => {
    const pending = app.db
      .prepare("SELECT id FROM applications WHERE stage = 'submitted' AND requisition_id = ? LIMIT 2")
      .all(javaReq());
    assert.equal(
      (await orbit.post(`/portal/applications/${pending[0].id}/decision`, { action: 'reject' })).status,
      400,
    );
    assert.equal(
      (
        await orbit.post(`/portal/applications/${pending[0].id}/decision`, {
          action: 'interview',
          slot: '2020-01-01T10:00:00.000Z',
        })
      ).status,
      400,
    );

    const rejected = await orbit.post(`/portal/applications/${pending[0].id}/decision`, {
      action: 'reject',
      reason: 'Not enough microservices depth',
    });
    assert.equal(rejected.body.stage, 'rejected');
    const slot = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const interview = await orbit.post(`/portal/applications/${pending[1].id}/decision`, { action: 'interview', slot });
    assert.equal(interview.body.stage, 'interview');
  });
});

describe('Upload, parsing and duplicates', () => {
  const cv = (name, email, extra = '') =>
    `${name}\nJava Developer\nEmail: ${email} | Phone: +91 98765 43210\nLocation: Noida\n\nEXPERIENCE\nJava Developer, Acme Tech — Jan 2019 – Present\n• Built Spring Boot services for a payments platform\n• Designed REST APIs and microservices\nNotice Period: 30 days\n${extra}`;

  it('rejects uploads without a consent confirmation', async () => {
    const res = await recruiter.post(
      `/requisitions/${javaReq()}/cvs`,
      cvForm([['a.txt', cv('A B', 'a@example.org')]], { consent: false }),
    );
    assert.equal(res.status, 400);
  });

  it('parses, scores and de-duplicates a batch, and reports bad files per file', async () => {
    const form = cvForm([
      ['Neel_Kapoor.txt', cv('Neel Kapoor', 'neel.kapoor@example.org')],
      ['Neel_Kapoor_v2.txt', cv('Neel Kapoor', 'neel.kapoor@example.org', 'Kafka')],
      ['broken.pdf', 'this is not really a pdf'],
      ['notes.png', 'x'],
    ]);
    const { status, body } = await recruiter.post(`/requisitions/${javaReq()}/cvs`, form);
    assert.equal(status, 201);
    const by = Object.fromEntries(body.results.map((r) => [r.fileName, r]));
    assert.equal(by['Neel_Kapoor.txt'].status, 'parsed');
    assert.ok(by['Neel_Kapoor.txt'].score > 60);
    assert.equal(by['Neel_Kapoor_v2.txt'].status, 'already_in_requisition');
    assert.equal(by['broken.pdf'].status, 'failed');
    assert.equal(by['notes.png'].status, 'failed');
    assert.equal(
      app.db.prepare("SELECT COUNT(*) AS n FROM candidates WHERE email = 'neel.kapoor@example.org'").get().n,
      1,
    );
  });

  it('links an existing candidate to a second requisition instead of duplicating them', async () => {
    const other = app.db.prepare("SELECT id FROM requisitions WHERE title = 'Store Manager'").get().id;
    const { body } = await recruiter.post(
      `/requisitions/${other}/cvs`,
      cvForm([['Neel_again.txt', cv('Neel Kapoor', 'neel.kapoor@example.org')]]),
    );
    assert.equal(body.results[0].status, 'duplicate');
  });

  it('keeps scanned PDFs unscored instead of scoring them zero', async () => {
    const blankPdf = fs.readFileSync(new URL('./fixtures/scan.pdf', import.meta.url));
    const form = cvForm([['scan.pdf', blankPdf]]);
    const { body } = await recruiter.post(`/requisitions/${javaReq()}/cvs`, form);
    assert.equal(body.results[0].status, 'scan');
    assert.equal(body.results[0].score, null);
  });
});

describe('Scorecard edits', () => {
  it('re-scores every candidate when the scorecard changes', async () => {
    const id = javaReq();
    const before = (await recruiter.get(`/requisitions/${id}/applications`)).body[0].score;
    const { body: req } = await recruiter.get(`/requisitions/${id}`);
    const next = { ...req.scorecard, skills: [...req.scorecard.skills, { name: 'Kafka', required: true, weight: 3 }] };
    assert.equal((await recruiter.put(`/requisitions/${id}/scorecard`, next)).status, 200);
    const after = (await recruiter.get(`/requisitions/${id}/applications`)).body;
    assert.ok(after.some((a) => a.meter.some((m) => m.label === 'Kafka')));
    assert.notEqual(after[0].score, undefined);
    assert.ok(before >= 0);
  });

  it('validates scorecard input', async () => {
    const res = await recruiter.put(`/requisitions/${javaReq()}/scorecard`, {
      title: 'x',
      experience: { min: 9, max: 2 },
      skills: [],
      noticeMax: null,
      location: null,
      ctcMax: null,
    });
    assert.equal(res.status, 400);
  });
});

describe('Consent, deletion and audit trail', () => {
  it('records consent on every candidate', () => {
    const missing = app.db
      .prepare('SELECT COUNT(*) AS n FROM candidates WHERE consent_at IS NULL OR consent_source IS NULL')
      .get().n;
    assert.equal(missing, 0);
  });

  it('erases personal data and the stored file on request, and keeps an audit entry without PII', async () => {
    const upload = await recruiter.post(
      `/requisitions/${javaReq()}/cvs`,
      cvForm([
        [
          'Erase_Me.txt',
          `Erase Me\nJava Developer\nEmail: erase.me@example.org\nPhone: 9123456780\nJava and Spring Boot for 5 years of experience in payments.\n${'Built services. '.repeat(20)}`,
        ],
      ]),
    );
    const appId = upload.body.results[0].applicationId;
    const candidate = app.db
      .prepare('SELECT c.id, c.file_path FROM candidates c JOIN applications a ON a.candidate_id = c.id WHERE a.id = ?')
      .get(appId);
    assert.ok(fs.existsSync(candidate.file_path));

    assert.equal((await recruiter.del(`/candidates/${candidate.id}`, {})).status, 400, 'a reason is required');
    assert.equal(
      (await recruiter.del(`/candidates/${candidate.id}`, { reason: 'Candidate requested deletion by email' })).status,
      200,
    );

    const row = app.db
      .prepare('SELECT name, email, phone, raw_text, file_path, erased_at FROM candidates WHERE id = ?')
      .get(candidate.id);
    assert.deepEqual(
      { ...row, erased_at: Boolean(row.erased_at) },
      { name: 'Erased candidate', email: null, phone: null, raw_text: '', file_path: null, erased_at: true },
    );
    assert.ok(!fs.existsSync(candidate.file_path));
    assert.equal((await recruiter.get(`/applications/${appId}`)).status, 404);

    const log = (await head.get('/audit?action=candidate_erased')).body.entries;
    assert.ok(log.length >= 1);
    assert.ok(!JSON.stringify(log).includes('erase.me@example.org'));
  });

  it('logs who viewed which profile and CV', async () => {
    const id = appIdWhere("a.stage = 'screened' OR a.stage = 'sourced'");
    await recruiter.get(`/applications/${id}`);
    await recruiter.post(`/applications/${id}/open`);
    const entries = (await head.get('/audit?limit=20')).body.entries;
    const mine = entries.filter((e) => e.entityId === String(id) && e.actorRole === 'recruiter');
    assert.ok(mine.some((e) => e.action === 'profile_viewed'));
    assert.ok(mine.some((e) => e.action === 'cv_opened'));
  });
});

describe('Closing and deleting roles', () => {
  const newRole = async (title = 'Temp Role') => {
    const draft = (
      await recruiter.post('/requisitions/extract', { text: `${title}, 2-4 years, Java, Noida, notice up to 30 days` })
    ).body;
    const clientId = app.db.prepare('SELECT id FROM clients ORDER BY id LIMIT 1').get().id;
    return (await recruiter.post('/requisitions', { clientId, jdText: '', scorecard: draft.scorecard })).body;
  };
  const cvText = (name, email) =>
    `${name}\nJava Developer\nEmail: ${email}\nLocation: Noida\nEXPERIENCE\nJava Developer, Acme — Jan 2021 – Present\n• Built Java services for a payments platform\n${'Worked on backend features. '.repeat(10)}`;

  it('deletes an untouched role and erases CVs that belong to no other role', async () => {
    const role = await newRole();
    const upload = await recruiter.post(
      `/requisitions/${role.id}/cvs`,
      cvForm([['Only_Here.txt', cvText('Only Here', 'only.here@example.org')]]),
    );
    const row = app.db
      .prepare('SELECT c.id, c.file_path FROM candidates c JOIN applications a ON a.candidate_id = c.id WHERE a.id = ?')
      .get(upload.body.results[0].applicationId);
    assert.ok(fs.existsSync(row.file_path));

    const res = await recruiter.del(`/requisitions/${role.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.cvsRemoved, 1);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM requisitions WHERE id = ?').get(role.id).n, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM candidates WHERE id = ?').get(row.id).n, 0);
    assert.ok(!fs.existsSync(row.file_path), 'the stored CV file must be deleted too');
    assert.equal((await recruiter.get(`/requisitions/${role.id}`)).status, 404);
    const log = (await head.get('/audit?action=requisition_deleted')).body.entries;
    assert.ok(log.length >= 1);
  });

  it('keeps candidates that are also ranked for another role', async () => {
    const role = await newRole('Shared Role');
    const email = 'shared.person@example.org';
    await recruiter.post(`/requisitions/${role.id}/cvs`, cvForm([['Shared.txt', cvText('Shared Person', email)]]));
    const other = app.db.prepare("SELECT id FROM requisitions WHERE title = 'Store Manager'").get().id;
    await recruiter.post(`/requisitions/${other}/cvs`, cvForm([['Shared_again.txt', cvText('Shared Person', email)]]));

    assert.equal((await recruiter.del(`/requisitions/${role.id}`)).body.cvsRemoved, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM candidates WHERE email = ?').get(email).n, 1);
  });

  it('refuses to delete a role that has candidates with the client, and closing it blocks new CVs', async () => {
    const id = javaReq();
    const blocked = await recruiter.del(`/requisitions/${id}`);
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error, /Close it instead/);

    assert.equal((await recruiter.post(`/requisitions/${id}/status`, { status: 'closed' })).body.status, 'closed');
    const upload = await recruiter.post(
      `/requisitions/${id}/cvs`,
      cvForm([['x.txt', cvText('Late Comer', 'late@example.org')]]),
    );
    assert.equal(upload.status, 409);
    assert.match(upload.body.error, /closed/);
    assert.equal((await recruiter.post(`/requisitions/${id}/status`, { status: 'open' })).body.status, 'open');
  });

  it('lets only recruiters delete or close roles', async () => {
    const id = javaReq();
    assert.equal((await head.del(`/requisitions/${id}`)).status, 403);
    assert.equal((await head.post(`/requisitions/${id}/status`, { status: 'closed' })).status, 403);
    assert.equal((await orbit.del(`/requisitions/${id}`)).status, 403);
  });
});

describe('Insights', () => {
  it('compares AI ranks with recruiter picks and lists disagreements', async () => {
    const { body } = await head.get('/insights/agreement');
    assert.ok(body.sample.length >= 1);
    const java = body.sample.find((s) => s.title === 'Senior Java Developer');
    assert.ok(java.agreementPct <= 100 && java.agreementPct >= 0);
    assert.ok(Array.isArray(java.recruiterOverrides));
  });
});
