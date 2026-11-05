import { bestEvidence, canonicalCity, clipLine, findSkill, NCR, skillPatterns } from './taxonomy.js';
import { findExperienceEvidence } from './parser.js';

/** Points available per criterion group. Scores are normalised over the groups the scorecard uses. */
export const WEIGHTS = Object.freeze({ skills: 50, nice: 10, experience: 20, notice: 10, location: 5, ctc: 5 });
const UNKNOWN_CREDIT = 0.5;
const round1 = (n) => Math.round(n * 10) / 10;

const unknown = (base, note) => ({
  ...base,
  status: 'unknown',
  earned: base.points * UNKNOWN_CREDIT,
  evidence: null,
  note,
});

function skillCriterion(skill, lines, lowInfo, points) {
  const base = {
    key: `skill:${skill.name}`,
    kind: 'skill',
    label: skill.name,
    required: skill.required,
    points: round1(points),
  };
  if (lowInfo) return unknown(base, 'CV text too short to verify');

  const exact = bestEvidence(lines, skillPatterns(skill.name));
  if (exact) return { ...base, status: 'met', earned: points, evidence: exact.line, matched: exact.term };

  for (const related of findSkill(skill.name)?.related ?? []) {
    const hit = bestEvidence(lines, skillPatterns(related));
    if (hit) {
      return {
        ...base,
        status: 'partial',
        earned: points * 0.5,
        evidence: hit.line,
        matched: hit.term,
        note: `Related skill: ${related}`,
      };
    }
  }
  return { ...base, status: 'missing', earned: 0, evidence: null, note: 'Not found in the CV' };
}

function experienceCriterion({ min, max }, years, lines) {
  const base = {
    key: 'experience',
    kind: 'experience',
    label: `Experience ${min}–${max} yrs`,
    required: true,
    points: WEIGHTS.experience,
  };
  if (years == null) return unknown(base, 'Experience not stated in the CV');

  const evidence = findExperienceEvidence(lines);
  const detail = `${years} yrs`;
  if (years >= min && years <= max) return { ...base, status: 'met', earned: base.points, detail, evidence };
  if (years > max) {
    const earned = base.points * Math.max(0.7, 1 - (years - max) * 0.05);
    return { ...base, status: 'partial', earned, detail, evidence, note: `${round1(years - max)} yrs above the band` };
  }
  const gap = min - years;
  const earned = base.points * Math.max(0, 1 - gap * 0.25);
  return {
    ...base,
    status: earned > 0 ? 'partial' : 'missing',
    earned,
    detail,
    evidence,
    note: `${round1(gap)} yrs below the band`,
  };
}

function noticeCriterion(max, days, lines) {
  const base = {
    key: 'notice',
    kind: 'notice',
    label: `Notice up to ${max} days`,
    required: false,
    points: WEIGHTS.notice,
  };
  if (days == null) return unknown(base, 'Notice period not stated');

  const line = lines.find((l) => /notice|immediate/i.test(l));
  const evidence = line ? clipLine(line) : null;
  const detail = days === 0 ? 'Immediate' : `${days} days`;
  if (days <= max) return { ...base, status: 'met', earned: base.points, detail, evidence };
  if (days <= max + 30) {
    return {
      ...base,
      status: 'partial',
      earned: base.points * 0.5,
      detail,
      evidence,
      note: `${days - max} days over, a buy-out may be possible`,
    };
  }
  return {
    ...base,
    status: 'missing',
    earned: base.points * 0.15,
    detail,
    evidence,
    note: `${days - max} days over the limit`,
  };
}

function locationCriterion(wanted, actual, lines) {
  const base = {
    key: 'location',
    kind: 'location',
    label: `Based in ${wanted}`,
    required: false,
    points: WEIGHTS.location,
  };
  if (!actual) return unknown(base, 'Location not stated');

  const want = canonicalCity(wanted);
  const have = canonicalCity(actual);
  const line = lines.find((l) => l.toLowerCase().includes(have.toLowerCase()));
  const evidence = line ? clipLine(line) : null;
  if (want.toLowerCase() === have.toLowerCase())
    return { ...base, status: 'met', earned: base.points, detail: have, evidence };
  if (NCR.has(want) && NCR.has(have)) {
    return {
      ...base,
      status: 'partial',
      earned: base.points * 0.7,
      detail: have,
      evidence,
      note: 'Same Delhi NCR region',
    };
  }
  return {
    ...base,
    status: 'missing',
    earned: base.points * 0.25,
    detail: have,
    evidence,
    note: 'Relocation or remote work needed',
  };
}

function ctcCriterion(max, expected, lines) {
  const base = {
    key: 'ctc',
    kind: 'ctc',
    label: `Expected CTC up to ₹${max} LPA`,
    required: false,
    points: WEIGHTS.ctc,
  };
  if (expected == null) return unknown(base, 'Expected CTC not stated');

  const line = lines.find((l) => /ctc/i.test(l));
  const evidence = line ? clipLine(line) : null;
  const detail = `₹${expected} LPA`;
  if (expected <= max) return { ...base, status: 'met', earned: base.points, detail, evidence };
  if (expected <= max * 1.15)
    return { ...base, status: 'partial', earned: base.points * 0.5, detail, evidence, note: 'Slightly above budget' };
  return { ...base, status: 'missing', earned: base.points * 0.1, detail, evidence, note: 'Above budget' };
}

function confidenceOf(criteria, textLength) {
  const available = criteria.reduce((sum, c) => sum + c.points, 0);
  const unknownShare = criteria.filter((c) => c.status === 'unknown').reduce((sum, c) => sum + c.points, 0) / available;
  if (textLength < 250 || unknownShare >= 0.35) return 'low';
  if (textLength < 500 || unknownShare >= 0.12) return 'medium';
  return 'high';
}

/**
 * Scores one candidate against a scorecard. Deterministic and explainable: every criterion
 * carries a verbatim CV line as evidence. It never rejects; it only ranks.
 *
 * @param {object} scorecard validated scorecard
 * @param {{experienceYears: number|null, noticeDays: number|null, location: string|null, expectedCtc: number|null}} profile
 * @param {string} anonText CV text with protected attributes already removed
 */
export function scoreCandidate(scorecard, profile, anonText) {
  const lines = anonText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const textLength = anonText.replace(/\s+/g, '').length;
  const lowInfo = textLength < 150;
  const must = scorecard.skills.filter((s) => s.required);
  const nice = scorecard.skills.filter((s) => !s.required);
  const mustWeight = must.reduce((sum, s) => sum + s.weight, 0);

  const criteria = [
    ...must.map((s) => skillCriterion(s, lines, lowInfo, (WEIGHTS.skills * s.weight) / mustWeight)),
    ...nice.map((s) => skillCriterion(s, lines, lowInfo, WEIGHTS.nice / nice.length)),
    experienceCriterion(scorecard.experience, profile.experienceYears, lines),
  ];
  if (scorecard.noticeMax != null) criteria.push(noticeCriterion(scorecard.noticeMax, profile.noticeDays, lines));
  if (scorecard.location) criteria.push(locationCriterion(scorecard.location, profile.location, lines));
  if (scorecard.ctcMax != null) criteria.push(ctcCriterion(scorecard.ctcMax, profile.expectedCtc, lines));

  const available = criteria.reduce((sum, c) => sum + c.points, 0);
  const earned = criteria.reduce((sum, c) => sum + c.earned, 0);
  const flags = criteria.filter((c) => c.status === 'unknown').map((c) => `${c.label}: ${c.note}`);
  if (lowInfo) flags.unshift('Very little readable text in this CV');

  return {
    score: round1((earned / available) * 100),
    confidence: confidenceOf(criteria, textLength),
    flags,
    criteria: criteria.map((c) => ({ ...c, earned: round1(c.earned) })),
  };
}

/** Score bands used for display. "low" candidates stay searchable and are never auto-rejected. */
export const bandOf = (score) =>
  score == null ? 'unscored' : score >= 75 ? 'strong' : score >= 50 ? 'possible' : 'low';
