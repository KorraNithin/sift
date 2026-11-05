import { detectCity, detectSkills } from './taxonomy.js';

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?,?\\s+';
const RANGE = new RegExp(
  `(?:${MON})?((?:19|20)\\d{2})\\s*(?:-|–|—|to)\\s*(?:(?:${MON})?((?:19|20)\\d{2})|(present|current|till date|till now|now|ongoing))`,
  'ig',
);
const EDUCATION =
  /\b(b\.?\s?tech|b\.?e|b\.?sc|b\.?com|bca|bba|mca|m\.?tech|mba|bachelor|master|diploma|university|college|school|hsc|ssc|graduat|cgpa|percentage)\b/i;
const SECTION =
  /^\s*(work experience|professional experience|experience|employment(?: history)?|work history|education(?:al qualifications?)?|academics?|academic (?:details|qualifications?)|skills?|technical skills|projects?|certifications?|summary|profile|personal (?:details|information)|achievements)\s*:?\s*$/i;
const EXPLICIT_YEARS = [
  /(\d{1,2}(?:\.\d{1,2})?)\s*\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:(?:total|overall|professional|relevant|work|it)\s*)*experience/i,
  /experience\s*[:\-–]?\s*(?:of\s*)?(\d{1,2}(?:\.\d{1,2})?)\s*\+?\s*(?:years?|yrs?)/i,
];
const ROLE_WORDS =
  /\b(developer|engineer|analyst|manager|executive|associate|lead|architect|officer|consultant|specialist|administrator|supervisor|head|tester|designer|programmer)\b/i;
const UNIT_DAYS = { day: 1, week: 7, month: 30 };

const toLines = (text) => text.split('\n').map((l) => l.trim());

/** Normalises whitespace and line endings of extracted CV text. */
export function cleanText(text) {
  return String(text)
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function titleCase(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function guessName(lines, fileName) {
  for (const line of lines.slice(0, 10)) {
    const labelled = line.match(/^(?:full name|candidate name|name)\s*[:\-]\s*([A-Za-z.' -]{2,50})$/i);
    if (labelled) return titleCase(labelled[1]);
  }
  for (const line of lines.slice(0, 6)) {
    if (!line || /@|\d{3,}|resume|curriculum|vitae|profile|summary|objective/i.test(line) || ROLE_WORDS.test(line))
      continue;
    if (/^[A-Za-z][A-Za-z.'’ -]{1,48}$/.test(line) && line.split(/\s+/).length <= 4) return titleCase(line);
  }
  const fromFile = String(fileName ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\b(cv|resume|copy|scan|scanned|updated|final)\b/gi, '')
    .trim();
  return fromFile ? titleCase(fromFile) : 'Unnamed candidate';
}

function guessHeadline(lines, name) {
  for (const line of lines.slice(0, 15)) {
    const labelled = line.match(
      /^(?:current role|current designation|designation|position|title)\s*[:\-]\s*(.{3,80})$/i,
    );
    if (labelled) return labelled[1].trim();
  }
  for (const line of lines.slice(0, 12)) {
    if (!line || line === name || /@|\d{5,}/.test(line)) continue;
    const segment = line.split(/[|•]/)[0].trim();
    if (segment.length <= 80 && ROLE_WORDS.test(segment) && !/^(summary|profile|objective)/i.test(segment))
      return segment;
  }
  return null;
}

function parseCtc(text, label) {
  const re = new RegExp(
    `${label}\\s*(?:ctc)?\\s*[:\\-–]?\\s*(?:₹|rs\\.?|inr)?\\s*(\\d{1,3}(?:\\.\\d{1,2})?)\\s*(?:lpa|lakhs?|lacs?)`,
    'i',
  );
  const m = text.match(re);
  return m ? Number(m[1]) : null;
}

/** Notice period in days; 0 for immediate joiners; null when not stated. */
export function parseNoticeDays(text) {
  const patterns = [
    /notice(?:\s+period)?\s*(?:of|is)?\s*[:\-–]?\s*(\d{1,3})\s*(day|week|month)s?/i,
    /(\d{1,3})\s*(day|week|month)s?\s*(?:of\s*)?notice/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return Math.round(Number(m[1]) * UNIT_DAYS[m[2].toLowerCase()]);
  }
  return /\bimmediate(?:ly)?\s*(?:joiner|joining|available)|available immediately|notice\s*(?:period)?\s*[:\-–]?\s*immediate/i.test(
    text,
  )
    ? 0
    : null;
}

const monthIndex = (year, mon, fallback) =>
  Number(year) * 12 + (mon ? MONTHS[mon.toLowerCase().slice(0, 3)] : fallback);

/** Sums employment date ranges (education ranges excluded), merging overlaps. */
function yearsFromRanges(lines, now) {
  const spans = [];
  let section = '';
  for (const line of lines) {
    const header = line.match(SECTION);
    if (header) {
      section = header[1].toLowerCase();
      continue;
    }
    if (/^(education|academ)/.test(section) || EDUCATION.test(line)) continue;
    for (const m of line.matchAll(RANGE)) {
      const start = monthIndex(m[2], m[1], 0);
      const end = m[5] ? now.getFullYear() * 12 + now.getMonth() : monthIndex(m[4], m[3], 0);
      if (end > start) spans.push([start, end]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let cursor = -Infinity;
  for (const [start, end] of spans) {
    months += Math.max(0, end - Math.max(start, cursor));
    cursor = Math.max(cursor, end);
  }
  return months > 0 ? Math.round((months / 12) * 10) / 10 : null;
}

/** Years of experience: explicit statements win, otherwise employment date ranges. */
export function parseExperienceYears(lines, now = new Date()) {
  const stated = lines
    .flatMap((line) => EXPLICIT_YEARS.map((re) => line.match(re)?.[1]))
    .filter(Boolean)
    .map(Number)
    .filter((n) => n > 0 && n <= 45);
  if (stated.length) return Math.max(...stated);
  const computed = yearsFromRanges(lines, now);
  return computed != null && computed <= 45 ? computed : null;
}

/** The CV line that supports the experience claim (statement first, then a date range). */
export function findExperienceEvidence(lines) {
  const stated = lines.find((l) => EXPLICIT_YEARS.some((re) => re.test(l)));
  if (stated) return stated.replace(/^[•\-*▪◦●]\s*/, '').slice(0, 240);
  const ranged = lines.find((l) => !EDUCATION.test(l) && new RegExp(RANGE.source, 'i').test(l));
  return ranged ? ranged.replace(/^[•\-*▪◦●]\s*/, '').slice(0, 240) : null;
}

/**
 * Parses free-text CV content into structured fields.
 * @param {string} text cleaned CV text
 * @param {{fileName?: string, now?: Date}} [options]
 */
export function parseCv(text, { fileName, now = new Date() } = {}) {
  const lines = toLines(text);
  const name = guessName(lines, fileName);
  const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]?.toLowerCase() ?? null;
  const phoneRaw = text.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/)?.[0] ?? null;
  const phone = phoneRaw ? phoneRaw.replace(/\D/g, '').slice(-10) : null;
  const locationLine = lines.find((l) => /^(?:current\s+)?location\s*[:\-]/i.test(l) || /^based in\b/i.test(l));
  const location = detectCity(locationLine ?? lines.slice(0, 15).join('\n'));

  return {
    name,
    email,
    phone,
    headline: guessHeadline(lines, name),
    experienceYears: parseExperienceYears(lines, now),
    skills: detectSkills(text).map((s) => s.name),
    noticeDays: parseNoticeDays(text),
    location,
    currentCtc: parseCtc(text, '(?:current|cctc)'),
    expectedCtc: parseCtc(text, '(?:expected|ectc)'),
  };
}
