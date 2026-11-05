import { canonicalSkill, detectCity, detectSkills } from './taxonomy.js';

const TITLE_LABEL = /^(?:job title|position|role|designation)\s*[:\-–]\s*(.+)$/im;
const TITLE_PREFIX = /^(?:job description|jd|hiring|opening|requirement)\s*[:\-–]\s*/i;
const NICE = /\b(good to have|nice to have|preferred|bonus|desirable|added advantage)\b/i;
const MUST_HEADER = /\b(must have|mandatory|required|requirements?|key skills|responsibilities)\b.*:\s*$/i;
const UNIT_DAYS = { day: 1, week: 7, month: 30 };

function extractTitle(text, lines) {
  const labelled = text.match(TITLE_LABEL);
  const first = (labelled?.[1] ?? lines.find(Boolean) ?? '').replace(TITLE_PREFIX, '');
  const segment = first
    .split(/\s*[,|;]\s*|\s+[–—-]\s+/)[0]
    .replace(/\(.*$/, '')
    .trim();
  return segment.slice(0, 80);
}

function extractExperience(text) {
  const range = text.match(/(\d{1,2}(?:\.\d)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const open =
    text.match(/(?:(?:minimum|min\.?|at least)\s*)(\d{1,2}(?:\.\d)?)\s*(?:\+\s*)?(?:years?|yrs?)/i) ??
    text.match(/(\d{1,2}(?:\.\d)?)\s*\+\s*(?:years?|yrs?)/i);
  return open ? { min: Number(open[1]), max: Math.min(Number(open[1]) + 5, 50) } : null;
}

function extractNotice(text) {
  const m = text.match(
    /notice(?:\s+period)?\s*(?:of|is)?\s*(?:up\s*to|upto|max(?:imum)?|within|<=?|:|-)?\s*(\d{1,3})\s*(day|week|month)s?/i,
  );
  if (m) return Math.round(Number(m[1]) * UNIT_DAYS[m[2].toLowerCase()]);
  return /immediate\s*joiners?/i.test(text) ? 0 : null;
}

function extractCtcMax(text) {
  const range = text.match(
    /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d{1,3}(?:\.\d+)?)\s*(?:lpa|lakhs?|lacs?)/i,
  );
  if (range) return Number(range[2]);
  const cap = text.match(
    /(?:up\s*to|max(?:imum)?|budget)\s*(?:of\s*)?(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:\.\d+)?)\s*(?:lpa|lakhs?|lacs?)/i,
  );
  return cap ? Number(cap[1]) : null;
}

/** Walks the JD line by line so skills under "Good to have" headings become nice-to-have. */
function extractSkills(lines, title) {
  const found = new Map();
  let niceSection = false;
  for (const line of lines) {
    if (!line) niceSection = false;
    else if (NICE.test(line) && (line.length < 40 || line.endsWith(':'))) niceSection = true;
    else if (MUST_HEADER.test(line)) niceSection = false;

    const nice = niceSection || NICE.test(line);
    for (const { name } of detectSkills(line)) {
      const entry = found.get(name);
      if (!entry) found.set(name, { name, required: !nice });
      else if (!nice) entry.required = true;
    }
  }
  const titleSkills = new Set(detectSkills(title).map((s) => s.name));
  return [...found.values()].map((s) => ({
    name: canonicalSkill(s.name),
    required: s.required,
    weight: !s.required ? 1 : titleSkills.has(s.name) ? 3 : 2,
  }));
}

/**
 * Turns a pasted job description into an editable scorecard draft (rule based, offline).
 * Fields it cannot find are left empty and reported in `notes` so the recruiter can fill them.
 */
export function extractScorecard(jdText) {
  const text = String(jdText).replace(/\r/g, '').trim();
  const lines = text.split('\n').map((l) => l.trim());
  const title = extractTitle(text, lines);
  const experience = extractExperience(text);
  const noticeMax = extractNotice(text);
  const location = detectCity(text);
  const ctcMax = extractCtcMax(text);
  const skills = extractSkills(lines, title);

  const notes = [];
  if (!experience) notes.push('No experience band found. Set one before saving.');
  if (noticeMax == null) notes.push('No notice period limit found.');
  if (!location) notes.push('No location found.');
  if (!skills.length) notes.push('No known skills found. Add the must-have skills yourself.');

  return {
    source: 'rules',
    notes,
    scorecard: {
      title: title || 'Untitled role',
      experience: experience ?? { min: 0, max: 10 },
      skills,
      noticeMax,
      location,
      ctcMax,
    },
  };
}
