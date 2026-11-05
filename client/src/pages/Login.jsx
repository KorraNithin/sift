import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Logo, Meter, Score } from '../components/ui.jsx';

// Demo sign-in shortcuts for reviewers. Build with VITE_SHOW_DEMO=false to strip them from the bundle.
const DEMO_PASSWORD = 'Demo@1234';
const DEMO_ACCOUNTS =
  import.meta.env.VITE_SHOW_DEMO === 'false'
    ? []
    : [
        { label: 'Recruiter', email: 'recruiter@companya.test', hint: 'Rank CVs, submit shortlists' },
        { label: 'Hiring manager', email: 'client@orbit.test', hint: 'Review on your phone' },
        { label: 'Delivery head', email: 'head@companya.test', hint: 'Insights and audit log' },
      ];

const PREVIEW = [
  { label: 'Java', status: 'met', points: 15, earned: 15 },
  { label: 'Spring Boot', status: 'met', points: 10, earned: 10 },
  { label: 'Microservices', status: 'met', points: 5, earned: 5 },
  { label: 'Hibernate', status: 'missing', points: 5, earned: 0 },
  { label: 'Experience', status: 'met', points: 20, earned: 20 },
  { label: 'Notice', status: 'partial', points: 10, earned: 5 },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e, creds = { email, password }) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(creds.email, creds.password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="login-art" aria-hidden="true">
        <div className="brand light">
          <Logo size={32} />
          <span>Sift</span>
        </div>
        <div className="login-copy">
          <h1>Read the best CVs first.</h1>
          <p>
            Upload a pile of CVs against a job. Sift ranks them and quotes the line in each CV that earned the score.
          </p>
        </div>
        <div className="preview-card">
          <div className="preview-top">
            <span className="rank">1</span>
            <div>
              <b>Ritika B.</b>
              <small>Senior Java Developer</small>
            </div>
            <Score value={94} />
          </div>
          <Meter criteria={PREVIEW} size="lg" />
          <blockquote>Migrated monolith modules to Spring Boot, reducing deployment time by 31%</blockquote>
        </div>
      </section>

      <section className="login-form">
        <form onSubmit={submit} noValidate>
          <h2>Sign in</h2>
          <p className="muted">Use your Company A account.</p>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary block" disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {DEMO_ACCOUNTS.length > 0 && (
          <div className="demo">
            <p className="muted small">Reviewing? Jump in as:</p>
            <div className="demo-grid">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  className="demo-btn"
                  disabled={busy}
                  onClick={() => submit(null, { email: a.email, password: DEMO_PASSWORD })}
                >
                  <b>{a.label}</b>
                  <small>{a.hint}</small>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="privacy-note">
          <ShieldCheck size={15} /> CVs are personal data under the DPDP Act 2023. Every view is logged.
        </p>
      </section>
    </div>
  );
}
