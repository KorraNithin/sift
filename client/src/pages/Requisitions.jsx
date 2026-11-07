import { FileSearch, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, ErrorState, Score, Skeleton } from '../components/ui.jsx';
import { timeAgo } from '../fmt.js';
import { useQuery } from '../hooks.js';

export default function Requisitions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, retry } = useQuery(() => api.get('/requisitions'), []);

  const totals = (data ?? []).reduce(
    (t, r) => ({ cvs: t.cvs + r.total, opened: t.opened + r.opened, submitted: t.submitted + r.submitted }),
    { cvs: 0, opened: 0, submitted: 0 },
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Requisitions</h1>
          <p className="muted">Every open role, and how much of the pile your team has needed to read.</p>
        </div>
        {user.role === 'recruiter' && (
          <Link className="btn primary" to="/requisitions/new">
            <Plus size={17} /> New requisition
          </Link>
        )}
      </header>

      {error && <ErrorState error={error} onRetry={retry} />}
      {loading && <Skeleton lines={4} className="card pad" />}

      {data && data.length === 0 && (
        <Empty
          icon={FileSearch}
          title="No requisitions yet"
          action={
            user.role === 'recruiter' && (
              <button className="btn primary" onClick={() => navigate('/requisitions/new')}>
                Create the first one
              </button>
            )
          }
        >
          Paste a job description and Sift will draft the scorecard.
        </Empty>
      )}

      {data && data.length > 0 && (
        <>
          <dl className="stat-strip">
            <div>
              <dt>Open roles</dt>
              <dd>{data.length}</dd>
            </div>
            <div>
              <dt>CVs ranked</dt>
              <dd>{totals.cvs}</dd>
            </div>
            <div>
              <dt>Opened by recruiters</dt>
              <dd>{totals.opened}</dd>
            </div>
            <div>
              <dt>With clients</dt>
              <dd>{totals.submitted}</dd>
            </div>
          </dl>

          <ul className="req-list">
            {data.map((r, i) => (
              <li key={r.id} style={{ '--i': i }}>
                <Link to={`/requisitions/${r.id}`} className={`req-row ${r.status === 'closed' ? 'closed' : ''}`}>
                  <span className="req-title">
                    <b>
                      {r.title}
                      {r.status === 'closed' && <span className="pill closed-pill">Closed</span>}
                    </b>
                    <small>{r.clientName}</small>
                  </span>
                  <span className="req-stat">
                    <b>{r.total}</b>
                    <small>CVs</small>
                  </span>
                  <span className="req-stat reviewed">
                    <span className="bar" aria-hidden="true">
                      <i style={{ width: `${r.total ? (r.opened / r.total) * 100 : 0}%` }} />
                    </span>
                    <small>
                      {r.opened} of {r.total} opened
                    </small>
                  </span>
                  <span className="req-stat">
                    <b>{r.submitted}</b>
                    <small>with client</small>
                  </span>
                  <span className="req-best">
                    <Score value={r.topScore} />
                    <small>{timeAgo(r.createdAt)}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
