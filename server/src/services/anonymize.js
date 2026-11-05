/**
 * Removes attributes that must never influence scoring (name, gender, age, photo,
 * marital status, and other protected details) before a CV reaches the scoring engine.
 */
const PROTECTED_LINE = [
  /\b(gender|sex)\s*[:\-]/i,
  /\b(male|female)\b/i,
  /\bdob\b|\bd\.o\.b\b|date of birth|birth ?date/i,
  /\bage\s*[:\-]?\s*\d{2}\b/i,
  /\b\d{2}\s*(?:years?|yrs?)\s*old\b/i,
  /\b(marital status|married|unmarried|spouse|husband|wife)\b/i,
  /\b(father|mother)(?:'s|’s)?\s*name\b/i,
  /\b(nationality|religion|caste|photograph|photo)\b/i,
];

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const PROFILE_LINK = /(?:https?:\/\/)?(?:www\.)?(?:linkedin|github)\.com\/\S+/gi;

/**
 * @param {string} text raw CV text
 * @param {{name?: string|null}} [options]
 * @returns {{text: string, hiddenLines: number}}
 */
export function anonymize(text, { name } = {}) {
  const nameTokens = String(name ?? '')
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .map((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'));

  let hiddenLines = 0;
  const kept = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line) {
      kept.push('');
    } else if (PROTECTED_LINE.some((re) => re.test(line))) {
      hiddenLines += 1;
    } else {
      let clean = line.replace(EMAIL, '[contact]').replace(PHONE, '[contact]').replace(PROFILE_LINK, '[profile link]');
      for (const re of nameTokens) clean = clean.replace(re, '[candidate]');
      kept.push(clean);
    }
  }
  return {
    text: kept
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    hiddenLines,
  };
}
