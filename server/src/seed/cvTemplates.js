/** Synthetic CV generator for demo data. All names, employers and contact details are fictional. */

export function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FEMALE = [
  'Aditi',
  'Neha',
  'Kavya',
  'Shreya',
  'Isha',
  'Nisha',
  'Tanvi',
  'Pallavi',
  'Radhika',
  'Sana',
  'Ananya',
  'Preeti',
  'Komal',
  'Swati',
  'Jhanvi',
];
const MALE = [
  'Rahul',
  'Amit',
  'Nikhil',
  'Siddharth',
  'Manish',
  'Deepak',
  'Harsh',
  'Varun',
  'Gaurav',
  'Tarun',
  'Yash',
  'Pranav',
  'Akash',
  'Mohit',
  'Sandeep',
];
const LAST = [
  'Sharma',
  'Verma',
  'Gupta',
  'Khan',
  'Reddy',
  'Nair',
  'Joshi',
  'Malhotra',
  'Bose',
  'Chopra',
  'Saxena',
  'Kulkarni',
  'Mishra',
  'Tiwari',
  'Sethi',
  'Bhatt',
  'Yadav',
  'Menon',
  'Arora',
  'Pandey',
];
const COMPANIES = {
  IT: ['Infosys', 'Wipro', 'Capgemini', 'HCLTech', 'Tech Mahindra', 'Cognizant', 'Mphasis', 'Zensar'],
  Banking: [
    'Axis Bank',
    'Kotak Bank',
    'Yes Bank',
    'Standard Chartered',
    'Genpact',
    'EXL Services',
    'IndusInd Bank',
    'Citi Operations',
  ],
  Retail: ['Shoppers Stop', 'Lifestyle', 'V-Mart', 'Spencer’s Retail', 'Westside', 'Decathlon', 'Max Fashion', 'Croma'],
};
const CONTEXT = {
  IT: [
    'a payments platform',
    'a logistics portal',
    'an insurance claims system',
    'an e-commerce checkout',
    'a telecom billing product',
  ],
  Banking: ['retail banking customers', 'corporate accounts', 'NBFC clients', 'high-volume onboarding queues'],
  Retail: ['a 12,000 sq ft flagship store', 'a high-footfall mall outlet', 'a regional cluster of stores'],
};
const EDUCATION = {
  IT: 'B.Tech, Computer Science, Regional Institute of Technology',
  Banking: 'B.Com, Delhi University',
  Retail: 'BBA, Symbiosis Centre for Management',
};

const BULLETS = {
  Java: [
    'Developed and maintained backend modules in Java for {ctx}',
    'Refactored legacy Java code and cut response time by {n}%',
  ],
  'Spring Boot': [
    'Built REST services with Spring Boot for {ctx}',
    'Migrated monolith modules to Spring Boot, reducing deployment time by {n}%',
  ],
  Spring: ['Implemented business logic with Spring MVC and Spring Security for {ctx}'],
  Microservices: ['Designed event-driven microservices for {ctx}'],
  'REST APIs': ['Designed and documented REST APIs used by web and mobile clients'],
  Hibernate: ['Modelled persistence with Hibernate and JPA on PostgreSQL'],
  Kafka: ['Streamed order events through Kafka at {n}k messages per hour'],
  Docker: ['Containerised services with Docker and shipped them through CI/CD pipelines'],
  AWS: ['Deployed workloads on AWS (EC2, S3) with automated rollbacks'],
  SQL: ['Tuned SQL queries and indexes, cutting report runtime by {n}%'],
  JUnit: ['Raised unit-test coverage to {n}% using JUnit and Mockito'],
  Python: ['Wrote Python services and data scripts for {ctx}'],
  KYC: ['Completed KYC verification for {n}0+ accounts a month within turnaround time'],
  AML: ['Performed AML transaction monitoring and escalated suspicious cases for {ctx}'],
  'Sanctions Screening': ['Screened customers against OFAC and UN watchlists, clearing {n}0 alerts a week'],
  Excel: ['Built Excel trackers with pivot tables and VLOOKUP for the daily review'],
  Reconciliation: ['Reconciled nostro and vostro accounts and cleared breaks within T+1'],
  'MIS Reporting': ['Prepared weekly MIS reports for senior management'],
  'Customer Service': ['Resolved customer escalations for {ctx} with a {n}% satisfaction score'],
  'Loan Processing': ['Processed loan applications end to end for {ctx}'],
  'Inventory Management': ['Managed stock replenishment and inventory control, keeping shrinkage under {n}%'],
  'Team Management': ['Led a team of {n} associates and ran daily floor briefings'],
  'Store Operations': ['Ran store operations for {ctx}, from opening checks to cash reconciliation'],
  'Visual Merchandising': ['Planned seasonal visual merchandising that lifted conversion by {n}%'],
  POS: ['Trained staff on POS systems and cut billing errors by {n}%'],
  'Sales Targets': ['Achieved sales targets for {n} consecutive quarters'],
  'Vendor Management': ['Negotiated with suppliers under vendor management contracts to save {n}% on cost'],
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtMonth = (d) => `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
const monthsAgo = (now, months) => new Date(now.getFullYear(), now.getMonth() - Math.round(months), 1);
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
const between = (rand, lo, hi, step = 0.5) => Math.round((lo + rand() * (hi - lo)) / step) * step;

/** Renders a realistic, varied CV from a candidate spec. Includes protected details on purpose so the anonymiser is exercised. */
export function buildCv(spec, rand, now = new Date()) {
  const { name, role, years, skills, location, notice, currentCtc, expectedCtc, domain, email, phone } = spec;
  const ctx = () => pick(rand, CONTEXT[domain]);
  const fill = (t) => t.replace('{ctx}', ctx()).replace('{n}', String(Math.round(8 + rand() * 40)));
  const bullets = skills.flatMap((s) => (BULLETS[s] ? [fill(BULLETS[s][Math.floor(rand() * BULLETS[s].length)])] : []));
  const half = Math.ceil(bullets.length / 2);
  const [companyA, companyB] = [pick(rand, COMPANIES[domain]), pick(rand, COMPANIES[domain])];
  const totalMonths = years * 12;
  const recentMonths = Math.round(totalMonths * 0.58);
  const start1 = monthsAgo(now, recentMonths);
  const start2 = monthsAgo(now, totalMonths);
  const lines = [
    name,
    role,
    `Email: ${email} | Phone: +91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
    `Location: ${location}`,
    '',
    'PROFESSIONAL SUMMARY',
    spec.statedYears === false
      ? `Dependable professional working across ${skills.slice(0, 3).join(', ')}.`
      : `${years} years of experience in ${skills.slice(0, 3).join(', ')} for ${domain === 'IT' ? 'enterprise software teams' : domain === 'Banking' ? 'banking operations' : 'organised retail'}.`,
    '',
    'EXPERIENCE',
    `${role}, ${companyA} — ${fmtMonth(start1)} – Present`,
    ...bullets.slice(0, half).map((b) => `• ${b}`),
    `${role.replace(/^(Senior|Lead) /, '')}, ${companyB} — ${fmtMonth(start2)} – ${fmtMonth(start1)}`,
    ...bullets.slice(half).map((b) => `• ${b}`),
    '',
    'EDUCATION',
    `${EDUCATION[domain]}, ${now.getFullYear() - Math.ceil(years) - 4}–${now.getFullYear() - Math.ceil(years)}`,
    '',
    'SKILLS',
    skills.join(', '),
    '',
    'PERSONAL DETAILS',
    `Gender: ${spec.gender}`,
    `Date of Birth: ${spec.dob}`,
    `Marital Status: ${spec.marital}`,
    `Notice Period: ${notice === 0 ? 'Immediate joiner' : `${notice} days`}`,
    currentCtc ? `Current CTC: ${currentCtc} LPA` : '',
    expectedCtc ? `Expected CTC: ${expectedCtc} LPA` : '',
  ];
  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n');
}

const ARCHETYPES = {
  java: [
    {
      role: 'Senior Java Developer',
      years: [5.5, 7.5],
      skills: ['Java', 'Spring Boot', 'Microservices', 'Hibernate', 'REST APIs', 'SQL'],
      loc: ['Noida', 'Gurugram', 'Delhi'],
      notice: [30, 45, 60],
    },
    {
      role: 'Senior Java Developer',
      years: [6, 8],
      skills: ['Java', 'Spring Boot', 'Microservices', 'Kafka', 'AWS', 'Docker', 'REST APIs'],
      loc: ['Noida', 'Ghaziabad', 'Gurugram'],
      notice: [30, 60],
    },
    {
      role: 'Java Developer',
      years: [4, 5],
      skills: ['Java', 'Spring', 'Hibernate', 'SQL', 'REST APIs', 'JUnit'],
      loc: ['Pune', 'Noida', 'Hyderabad'],
      notice: [60, 90],
    },
    {
      role: 'Junior Java Developer',
      years: [1.5, 3],
      skills: ['Java', 'Hibernate', 'SQL', 'JUnit'],
      loc: ['Noida', 'Pune', 'Jaipur'],
      notice: [30, 45],
    },
    {
      role: 'Lead Java Engineer',
      years: [9, 12],
      skills: ['Java', 'Spring Boot', 'Microservices', 'Kafka', 'AWS'],
      loc: ['Bengaluru', 'Hyderabad', 'Gurugram'],
      notice: [90],
    },
    {
      role: 'Python Developer',
      years: [3, 6],
      skills: ['Python', 'SQL', 'AWS', 'Docker'],
      loc: ['Noida', 'Bengaluru', 'Pune'],
      notice: [30, 60],
    },
  ],
  kyc: [
    {
      role: 'KYC Analyst',
      years: [2.5, 5],
      skills: ['KYC', 'AML', 'Excel', 'Customer Service'],
      loc: ['Gurugram', 'Noida', 'Delhi'],
      notice: [15, 30],
    },
    {
      role: 'KYC Associate',
      years: [1.5, 2.5],
      skills: ['KYC', 'Excel', 'Customer Service'],
      loc: ['Gurugram', 'Noida'],
      notice: [30, 45],
    },
    {
      role: 'Reconciliation Analyst',
      years: [3, 5],
      skills: ['Reconciliation', 'Excel', 'MIS Reporting'],
      loc: ['Gurugram', 'Pune', 'Mumbai'],
      notice: [30, 60],
    },
    {
      role: 'Loan Processing Executive',
      years: [2, 4],
      skills: ['Loan Processing', 'Excel', 'Customer Service'],
      loc: ['Noida', 'Delhi', 'Jaipur'],
      notice: [30, 60],
    },
    {
      role: 'AML Compliance Analyst',
      years: [5, 7],
      skills: ['AML', 'Sanctions Screening', 'KYC', 'Excel'],
      loc: ['Gurugram', 'Mumbai'],
      notice: [60, 90],
    },
  ],
  retail: [
    {
      role: 'Store Manager',
      years: [5, 8],
      skills: ['Store Operations', 'Inventory Management', 'Team Management', 'Visual Merchandising', 'POS'],
      loc: ['Delhi', 'Noida', 'Gurugram'],
      notice: [30, 45],
    },
    {
      role: 'Assistant Store Manager',
      years: [3, 4],
      skills: ['Inventory Management', 'Customer Service', 'POS'],
      loc: ['Delhi', 'Ghaziabad'],
      notice: [30, 45],
    },
    {
      role: 'Visual Merchandiser',
      years: [2.5, 5],
      skills: ['Visual Merchandising', 'Customer Service'],
      loc: ['Mumbai', 'Delhi'],
      notice: [30],
    },
    {
      role: 'Regional Retail Manager',
      years: [9, 12],
      skills: ['Sales Targets', 'Vendor Management', 'Team Management', 'Store Operations'],
      loc: ['Delhi', 'Jaipur'],
      notice: [60, 90],
    },
  ],
};
const DOMAIN = { java: 'IT', kyc: 'Banking', retail: 'Retail' };
const MARITAL = ['Married', 'Single'];

/** Generates `count` candidate specs for a pool, cycling through archetypes for a realistic spread. */
export function generatePool(pool, count, rand, usedNames) {
  const archetypes = ARCHETYPES[pool];
  return Array.from({ length: count }, (_, i) => {
    const a = archetypes[i % archetypes.length];
    const female = rand() < 0.5;
    let name;
    do name = `${pick(rand, female ? FEMALE : MALE)} ${pick(rand, LAST)}`;
    while (usedNames.has(name));
    usedNames.add(name);
    const years = between(rand, a.years[0], a.years[1]);
    const noticeDays = pick(rand, a.notice);
    const current = Math.round(years * 2.2 + 3);
    return {
      name,
      role: a.role,
      years,
      skills: a.skills,
      location: pick(rand, a.loc),
      notice: noticeDays,
      currentCtc: current,
      expectedCtc: Math.round(current * 1.25),
      domain: DOMAIN[pool],
      gender: female ? 'Female' : 'Male',
      dob: `${1 + Math.floor(rand() * 27)} ${pick(rand, MONTH_NAMES)} ${1986 + Math.floor(rand() * 12)}`,
      marital: pick(rand, MARITAL),
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      phone: `${6 + Math.floor(rand() * 4)}${String(Math.floor(rand() * 1e9)).padStart(9, '0')}`,
      statedYears: rand() > 0.35,
    };
  });
}

/** The three candidates from the brief's sample data, plus enough detail to render full CVs. */
export const BRIEF_CANDIDATES = [
  {
    code: 'CND-91022',
    name: 'Ritika Bansal',
    role: 'Senior Java Developer',
    years: 6.5,
    skills: ['Java', 'Spring Boot', 'Microservices'],
    notice: 60,
    location: 'Noida',
    domain: 'IT',
    gender: 'Female',
    dob: '14 Mar 1993',
    marital: 'Married',
    currentCtc: 22,
    expectedCtc: 28,
    email: 'ritika.bansal@example.com',
    phone: '9810011022',
  },
  {
    code: 'CND-91047',
    name: 'Arjun Rawat',
    role: 'KYC Analyst',
    years: 3,
    skills: ['KYC', 'AML', 'Excel'],
    notice: 30,
    location: 'Gurugram',
    domain: 'Banking',
    gender: 'Male',
    dob: '2 Aug 1996',
    marital: 'Single',
    currentCtc: 6,
    expectedCtc: 7.5,
    email: 'arjun.rawat@example.com',
    phone: '9810011047',
  },
  {
    code: 'CND-91088',
    name: 'Pooja Nair',
    role: 'Java Developer',
    years: 4,
    skills: ['Java', 'Hibernate', 'REST APIs'],
    notice: 90,
    location: 'Pune',
    domain: 'IT',
    gender: 'Female',
    dob: '21 Nov 1995',
    marital: 'Single',
    currentCtc: 14,
    expectedCtc: 18,
    email: 'pooja.nair@example.com',
    phone: '9810011088',
  },
];

/** Candidates used for the downloadable sample CV files (upload demo). */
export const SAMPLE_UPLOADS = [
  {
    file: 'Karan_Mehta_CV.pdf',
    spec: {
      name: 'Karan Mehta',
      role: 'Senior Java Developer',
      years: 7,
      skills: ['Java', 'Spring Boot', 'Microservices', 'Hibernate', 'Kafka', 'Docker'],
      notice: 30,
      location: 'Noida',
      domain: 'IT',
      gender: 'Male',
      dob: '9 Jan 1992',
      marital: 'Married',
      currentCtc: 24,
      expectedCtc: 30,
      email: 'karan.mehta@example.com',
      phone: '9899900101',
    },
  },
  {
    file: 'Karan_Mehta_resume_updated.docx',
    spec: {
      name: 'Karan Mehta',
      role: 'Senior Java Developer',
      years: 7,
      skills: ['Java', 'Spring Boot', 'Microservices', 'Hibernate', 'Kafka', 'Docker', 'AWS'],
      notice: 30,
      location: 'Noida',
      domain: 'IT',
      gender: 'Male',
      dob: '9 Jan 1992',
      marital: 'Married',
      currentCtc: 24,
      expectedCtc: 30,
      email: 'karan.mehta@example.com',
      phone: '9899900101',
    },
  },
  {
    file: 'Sneha_Iyer_CV.docx',
    spec: {
      name: 'Sneha Iyer',
      role: 'Lead Java Developer',
      years: 8.5,
      skills: ['Java', 'Spring Boot', 'Microservices', 'REST APIs', 'AWS'],
      notice: 90,
      location: 'Bengaluru',
      domain: 'IT',
      gender: 'Female',
      dob: '3 Jun 1990',
      marital: 'Married',
      currentCtc: 34,
      expectedCtc: 40,
      email: 'sneha.iyer@example.com',
      phone: '9899900102',
    },
  },
  {
    file: 'Vikram_Singh_CV.txt',
    spec: {
      name: 'Vikram Singh',
      role: 'Java Developer',
      years: 2.5,
      skills: ['Java', 'Hibernate', 'SQL'],
      notice: 30,
      location: 'Noida',
      domain: 'IT',
      gender: 'Male',
      dob: '17 Sep 1998',
      marital: 'Single',
      currentCtc: 7,
      expectedCtc: 10,
      email: 'vikram.singh@example.com',
      phone: '9899900103',
    },
  },
  {
    file: 'Divya_Rao_CV.pdf',
    spec: {
      name: 'Divya Rao',
      role: 'Senior Java Developer',
      years: 6,
      skills: ['Java', 'Spring', 'Microservices', 'REST APIs', 'SQL'],
      notice: 45,
      location: 'Hyderabad',
      domain: 'IT',
      gender: 'Female',
      dob: '28 Feb 1994',
      marital: 'Single',
      currentCtc: 20,
      expectedCtc: 26,
      email: 'divya.rao@example.com',
      phone: '9899900104',
      statedYears: false,
    },
  },
  {
    file: 'Imran_Qureshi_CV.pdf',
    spec: {
      name: 'Imran Qureshi',
      role: 'Python Developer',
      years: 5,
      skills: ['Python', 'SQL', 'AWS', 'Docker'],
      notice: 60,
      location: 'Delhi',
      domain: 'IT',
      gender: 'Male',
      dob: '11 Dec 1995',
      marital: 'Single',
      currentCtc: 16,
      expectedCtc: 20,
      email: 'imran.qureshi@example.com',
      phone: '9899900105',
    },
  },
  {
    file: 'Rohit_Das_CV.docx',
    spec: {
      name: 'Rohit Das',
      role: 'Java Developer',
      years: 5.5,
      skills: ['Java', 'Spring Boot', 'REST APIs', 'JUnit'],
      notice: 60,
      location: 'Ghaziabad',
      domain: 'IT',
      gender: 'Male',
      dob: '5 May 1993',
      marital: 'Married',
      currentCtc: 18,
      expectedCtc: 23,
      email: 'rohit.das@example.com',
      phone: '9899900106',
    },
  },
];
