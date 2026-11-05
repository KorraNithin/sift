import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { anonymize } from '../src/services/anonymize.js';
import { extractScorecard } from '../src/services/jd.js';
import { parseCv } from '../src/services/parser.js';
import { bandOf, scoreCandidate } from '../src/services/scoring.js';
import { BRIEF_CANDIDATES, buildCv, mulberry32 } from '../src/seed/cvTemplates.js';

const JD = 'Senior Java Developer, 5-8 years, Spring Boot, Noida, notice up to 60 days';
const { scorecard } = extractScorecard(JD);

function scoreSpec(spec, { scorecard: sc = scorecard } = {}) {
  const text = buildCv(spec, mulberry32(7));
  const parsed = parseCv(text);
  const anon = anonymize(text, { name: parsed.name });
  const result = scoreCandidate(sc, parsed, anon.text);
  return { text, parsed, anon, result };
}

const [ritika, arjun, pooja] = BRIEF_CANDIDATES;

describe('JD extraction', () => {
  it('turns the example JD into an editable scorecard', () => {
    assert.equal(scorecard.title, 'Senior Java Developer');
    assert.deepEqual(scorecard.experience, { min: 5, max: 8 });
    assert.equal(scorecard.noticeMax, 60);
    assert.equal(scorecard.location, 'Noida');
    assert.deepEqual(
      scorecard.skills.map((s) => s.name),
      ['Java', 'Spring Boot'],
    );
  });

  it('puts skills under a "good to have" line in the nice-to-have group', () => {
    const { scorecard: sc } = extractScorecard(
      'KYC Analyst\n2-5 years\nMust have: KYC, Excel.\nGood to have: Sanctions Screening',
    );
    assert.equal(sc.skills.find((s) => s.name === 'Sanctions Screening').required, false);
    assert.equal(sc.skills.find((s) => s.name === 'KYC').required, true);
  });

  it('reports what it could not find instead of guessing', () => {
    const { notes } = extractScorecard('We need a hardworking person to join our team soon');
    assert.ok(notes.length >= 2);
  });
});

describe('CV parsing', () => {
  it('reads the brief sample candidates correctly', () => {
    const { parsed } = scoreSpec(ritika);
    assert.equal(parsed.name, 'Ritika Bansal');
    assert.equal(parsed.noticeDays, 60);
    assert.equal(parsed.location, 'Noida');
    assert.equal(parsed.experienceYears, 6.5);
    assert.ok(parsed.skills.includes('Spring Boot'));
  });

  it('falls back to employment date ranges and ignores education years', () => {
    const text = [
      'Asha Verma',
      'Java Developer',
      'EXPERIENCE',
      'Java Developer, Acme — Jan 2020 – Jan 2023',
      'EDUCATION',
      'B.Tech, 2012–2016',
    ].join('\n');
    const { experienceYears } = parseCv(text, { now: new Date(2026, 0, 1) });
    assert.equal(experienceYears, 3);
  });

  it('understands notice periods in weeks, months and "immediate"', () => {
    assert.equal(parseCv('Notice period: 2 months').noticeDays, 60);
    assert.equal(parseCv('Serving 4 weeks notice').noticeDays, 28);
    assert.equal(parseCv('Immediate joiner').noticeDays, 0);
    assert.equal(parseCv('No details here').noticeDays, null);
  });
});

describe('Scoring', () => {
  it('ranks a strong fit above a partial fit above an off-profile CV', () => {
    const strong = scoreSpec(ritika).result.score;
    const partial = scoreSpec(pooja).result.score;
    const off = scoreSpec(arjun).result.score;
    assert.ok(strong > partial && partial > off, `${strong} > ${partial} > ${off}`);
    assert.equal(bandOf(strong), 'strong');
    assert.equal(bandOf(off), 'low');
  });

  it('quotes evidence that exists verbatim in the CV for every matched criterion', () => {
    const { result, anon } = scoreSpec(ritika);
    const quoted = result.criteria.filter((c) => c.evidence);
    assert.ok(quoted.length >= 5);
    for (const c of quoted) assert.ok(anon.text.includes(c.evidence), `"${c.evidence}" not found in CV`);
  });

  it('gives partial credit for a related skill and says so', () => {
    const text = 'A Person\nBackend Developer\nBuilt services with Spring MVC and Spring Security for a bank.\n'.repeat(
      4,
    );
    const { criteria } = scoreCandidate(
      { ...scorecard, skills: [{ name: 'Spring Boot', required: true, weight: 2 }] },
      { experienceYears: 6, noticeDays: 30, location: 'Noida' },
      text,
    );
    const sb = criteria.find((c) => c.label === 'Spring Boot');
    assert.equal(sb.status, 'partial');
    assert.match(sb.note, /Related skill: Spring/);
  });

  it('marks missing facts as unknown, lowers confidence, and never scores them as zero', () => {
    const { result } = scoreSpec({ ...ritika, notice: undefined });
    const text = 'Short CV\nJava';
    const sparse = scoreCandidate(scorecard, { experienceYears: null, noticeDays: null, location: null }, text);
    assert.equal(sparse.confidence, 'low');
    assert.ok(sparse.criteria.filter((c) => c.status === 'unknown').length >= 3);
    assert.ok(sparse.score > 0 && sparse.flags.length > 0);
    assert.ok(result.score > 0);
  });

  it('reports over- and under-experience as partial credit with a note', () => {
    const over = scoreSpec({ ...ritika, years: 11 }).result.criteria.find((c) => c.kind === 'experience');
    const under = scoreSpec({ ...ritika, years: 3 }).result.criteria.find((c) => c.kind === 'experience');
    assert.equal(over.status, 'partial');
    assert.match(over.note, /above the band/);
    assert.equal(under.status, 'partial');
    assert.match(under.note, /below the band/);
  });
});

describe('Fairness', () => {
  it('hides protected attributes before scoring', () => {
    const { anon } = scoreSpec(ritika);
    assert.ok(anon.hiddenLines >= 3);
    for (const banned of ['Female', 'Date of Birth', 'Marital', 'Ritika', 'Bansal', '@example.com']) {
      assert.ok(!anon.text.includes(banned), `${banned} leaked into the scoring text`);
    }
  });

  it('gives identical scores when only name, gender, age and marital status change', () => {
    const base = scoreSpec(ritika).result;
    const variants = [
      {
        ...ritika,
        name: 'Mohammed Farooqui',
        gender: 'Male',
        dob: '1 Jan 1975',
        marital: 'Single',
        email: 'someone.else@example.com',
        phone: '9000000000',
      },
      { ...ritika, name: 'Chandrika Iyengar', gender: 'Female', dob: '30 Dec 2001', marital: 'Married' },
    ];
    for (const v of variants) {
      const other = scoreSpec(v).result;
      assert.equal(other.score, base.score);
      assert.deepEqual(
        other.criteria.map((c) => c.status),
        base.criteria.map((c) => c.status),
      );
    }
  });

  it('never produces a rejection: scoring returns a score and flags only', () => {
    const { result } = scoreSpec(arjun);
    assert.deepEqual(Object.keys(result).sort(), ['confidence', 'criteria', 'flags', 'score']);
    assert.ok(result.score >= 0);
  });
});
