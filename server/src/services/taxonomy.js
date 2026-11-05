/**
 * Skill taxonomy shared by the JD extractor, CV parser and scoring engine.
 * `aliases` are exact matches; `related` skills earn partial credit.
 */
const row = (name, aliases = '', related = '', { matchName = true } = {}) => ({
  name,
  aliases: [...(matchName ? [name] : []), ...aliases.split('|')].filter(Boolean).map((a) => a.toLowerCase()),
  related: related.split('|').filter(Boolean),
});

export const SKILLS = [
  // Engineering
  row('Java', 'core java|j2ee|jdk|java 8|java 11|java 17|java 21', 'Kotlin|Scala'),
  row('Spring Boot', 'springboot|spring-boot', 'Spring'),
  // "Spring" alone would also match "Spring Boot", so only the framework's own module names count.
  row('Spring', 'spring framework|spring mvc|spring core|spring data|spring security', '', { matchName: false }),
  row('Hibernate', 'jpa|hibernate orm|spring data jpa'),
  row('Microservices', 'microservice|micro-services|micro services|service-oriented architecture'),
  row('REST APIs', 'rest api|restful|restful apis|restful services|rest services|restful web services'),
  row('SQL', 'mysql|postgresql|postgres|pl/sql|t-sql|oracle db'),
  row('Kafka', 'apache kafka'),
  row('RabbitMQ', 'activemq|message queue'),
  row('Docker', 'containerization', 'Kubernetes'),
  row('Kubernetes', 'k8s|eks|aks', 'Docker'),
  row('AWS', 'amazon web services|ec2|aws lambda', 'Azure|GCP'),
  row('Azure', 'microsoft azure', 'AWS|GCP'),
  row('GCP', 'google cloud', 'AWS|Azure'),
  row('CI/CD', 'ci cd|jenkins|gitlab ci|github actions|continuous integration'),
  row('Git', 'github|gitlab|bitbucket'),
  row('Maven', 'gradle'),
  row('JUnit', 'mockito|testng'),
  row('Redis', 'memcached'),
  row('MongoDB', 'mongo db'),
  row('Python', 'python3|django|flask|fastapi'),
  row('JavaScript', 'es6|ecmascript', 'TypeScript'),
  row('TypeScript', '', 'JavaScript'),
  row('React', 'reactjs|react.js|react js', 'Angular|Vue'),
  row('Angular', 'angularjs', 'React|Vue'),
  row('Vue', 'vue.js|vuejs', 'React|Angular'),
  row('Node.js', 'nodejs|node js|express.js|expressjs'),
  row('.NET', 'dotnet|asp.net|.net core|c#'),
  row('Selenium', 'test automation'),
  row('Agile', 'scrum'),
  // Banking back-office
  row('KYC', 'know your customer|customer due diligence|cdd|kyc/aml', 'AML'),
  row(
    'AML',
    'anti-money laundering|anti money laundering|transaction monitoring|aml checks',
    'KYC|Sanctions Screening',
  ),
  row('Sanctions Screening', 'ofac|watchlist screening', 'AML'),
  row('Excel', 'ms excel|microsoft excel|advanced excel|vlookup|pivot table|pivot tables'),
  row('Reconciliation', 'reconciliations|nostro|recon'),
  row('Loan Processing', 'loan operations|mortgage processing|loan origination'),
  row('Regulatory Reporting', 'rbi reporting|regulatory returns'),
  row('Risk Management', 'credit risk|operational risk'),
  row('Compliance', 'regulatory compliance'),
  row('Fraud Detection', 'fraud analysis|fraud monitoring'),
  row('Trade Settlement', 'settlements|trade operations|clearing'),
  row('Accounting', 'accounts payable|accounts receivable|tally'),
  row('MIS Reporting', 'mis|mis reports|mis reporting'),
  row('Customer Service', 'customer support|customer handling|client servicing'),
  // Retail
  row('Inventory Management', 'stock management|inventory control|stock replenishment', 'Supply Chain'),
  row('Visual Merchandising', 'merchandising'),
  row('POS', 'point of sale|pos systems'),
  row('Store Operations', 'store management|retail operations|store ops'),
  row('Team Management', 'team leadership|team handling|people management|managed a team|led a team'),
  row('Vendor Management', 'supplier management|vendor relations'),
  row('Sales Targets', 'sales target|revenue target|revenue targets|achieved target|target achievement'),
  row('Loss Prevention', 'shrinkage'),
  row('Supply Chain', 'logistics|warehouse operations', 'Inventory Management'),
];

export const CITIES = [
  ['Noida', 'noida'],
  ['Gurugram', 'gurugram|gurgaon'],
  ['Delhi', 'new delhi|delhi'],
  ['Ghaziabad', 'ghaziabad'],
  ['Faridabad', 'faridabad'],
  ['Pune', 'pune'],
  ['Hyderabad', 'hyderabad'],
  ['Bengaluru', 'bengaluru|bangalore'],
  ['Mumbai', 'mumbai|navi mumbai|thane'],
  ['Chennai', 'chennai'],
  ['Kolkata', 'kolkata'],
  ['Jaipur', 'jaipur'],
  ['Lucknow', 'lucknow'],
].map(([name, aliases]) => ({ name, aliases: aliases.split('|') }));

/** Delhi NCR cities count as the same commuting region. */
export const NCR = new Set(['Noida', 'Gurugram', 'Delhi', 'Ghaziabad', 'Faridabad']);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compile = (alias) => new RegExp(`(?<![A-Za-z0-9+#])${escapeRe(alias)}(?![A-Za-z0-9+#])`, 'i');

const PATTERNS = new Map(SKILLS.map((s) => [s.name, s.aliases.map(compile)]));
const BY_ALIAS = new Map(SKILLS.flatMap((s) => s.aliases.map((a) => [a, s])));
const BY_NAME = new Map(SKILLS.map((s) => [s.name.toLowerCase(), s]));
const CITY_PATTERNS = CITIES.map((c) => ({ name: c.name, patterns: c.aliases.map(compile) }));

export const findSkill = (name) => {
  const key = String(name).trim().toLowerCase();
  return BY_NAME.get(key) ?? BY_ALIAS.get(key) ?? null;
};
export const canonicalSkill = (name) => findSkill(name)?.name ?? String(name).trim();

/** Regexes that match a skill (taxonomy skills use all aliases; custom skills match literally). */
export function skillPatterns(name) {
  const skill = findSkill(name);
  return skill ? PATTERNS.get(skill.name) : [compile(String(name).trim().toLowerCase())];
}

/** Taxonomy skills mentioned in `text`, with the index of their first mention. */
export function detectSkills(text) {
  return SKILLS.map((s) => {
    const indexes = PATTERNS.get(s.name)
      .map((re) => re.exec(text)?.index)
      .filter((i) => i != null);
    return indexes.length ? { name: s.name, index: Math.min(...indexes) } : null;
  })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);
}

/** Returns the canonical city mentioned in `text`, or null. */
export function detectCity(text) {
  const hit = CITY_PATTERNS.find((c) => c.patterns.some((re) => re.test(text)));
  return hit?.name ?? null;
}

export const canonicalCity = (text) => detectCity(String(text)) ?? String(text).trim();

export const clipLine = (line) => line.replace(/^[•\-*▪◦●]\s*/, '').slice(0, 240);

function evidenceQuality(line) {
  let score = 0;
  if (/^[•\-*▪◦●]/.test(line)) score += 2;
  if (line.length >= 40) score += 1;
  if ((line.match(/,/g) ?? []).length >= 3) score -= 2;
  if (/^(key |technical |core )?skills?\s*:/i.test(line)) score -= 2;
  return score;
}

/**
 * Finds the CV line that best supports a skill. Narrative bullets beat skill lists.
 * The returned `line` is always a verbatim substring of the input lines.
 */
export function bestEvidence(lines, patterns) {
  let best = null;
  for (const line of lines) {
    const hit = patterns.map((re) => line.match(re)).find(Boolean);
    if (!hit) continue;
    const quality = evidenceQuality(line);
    if (!best || quality > best.quality) best = { line: clipLine(line), term: hit[0], quality };
  }
  return best ? { line: best.line, term: best.term } : null;
}
