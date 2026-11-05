import { Activity, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api.js';
import { Empty, ErrorState, Skeleton } from '../components/ui.jsx';
import { STAGE_LABEL, timeAgo } from '../fmt.js';
import { useQuery } from '../hooks.js';

const ACTION_LABEL = {
  login: 'Signed in',
  cv_ingested: 'CV uploaded',
  cv_opened: 'CV opened',
  cv_file_downloaded: 'Original file opened',
  cv_duplicate_detected: 'Duplicate detected',
  profile_viewed: 'Profile viewed',
  profile_edited: 'Profile corrected',
  stage_changed: 'Stage changed',
  candidate_erased: 'Data erased',
  scorecard_updated: 'Scorecard edited',
  requisition_created: 'Requisition created',
  client_viewed_candidate: 'Client viewed candidate',
  client_shortlist: 'Client shortlisted',
  client_reject: 'Client rejected',
  client_interview: 'Client proposed interview',
  notification_sent: 'Mock notification',
};

function Kpi({ label, value, unit, goal, note }) {
  return (
    <div className="kpi">
      <dt>{label}</dt>
      <dd>
        {value ?? 'n/a'}
        {value != null && <small>{unit}</small>}
      </dd>
      {goal && <p className="goal">{goal}</p>}
      {note && <p className="muted small">{note}</p>}
    </div>
  );
}

function Agreement() {
  const { data, error, loading, retry } = useQuery(() => api.get('/insights/agreement'), []);
  if (error) return <ErrorState error={error} onRetry={retry} />;
  if (loading) return <Skeleton lines={3} className="card pad" />;
  return (
    <section className="card pad">
      <div className="section-title">
        <div>
          <h2>Weekly sample: AI ranks vs recruiter choices</h2>
          <p className="muted small">
            For each role submitted this week, how many of the recruiter’s picks were in the AI’s top picks?
            Disagreements are listed so you can see who was right.
          </p>
        </div>
        <div className="big-pct">
          {data.overallAgreementPct ?? 'n/a'}
          {data.overallAgreementPct != null && <small>%</small>}
        </div>
      </div>
      {data.sample.length === 0 && <Empty icon={Activity} title="No submissions this week" />}
      <div className="agree-grid">
        {data.sample.map((s) => (
          <article key={s.requisitionId} className="agree-card">
            <header>
              <b>{s.title}</b>
              <span className="pill">{s.agreementPct}% agree</span>
            </header>
            <p className="muted small">
              {s.overlap} of {s.picked} submitted candidates were in the AI’s top {s.picked}.
            </p>
            {s.recruiterOverrides.length > 0 && (
              <>
                <h4>Recruiter picked above the AI</h4>
                <ul>
                  {s.recruiterOverrides.map((o) => (
                    <li key={o.code}>
                      {o.code}{' '}
                      <small>
                        {o.headline}, AI rank {o.aiRank}, score {Math.round(o.score)}
                      </small>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {s.aiPicksNotSubmitted.length > 0 && (
              <>
                <h4>AI liked, recruiter did not submit</h4>
                <ul>
                  {s.aiPicksNotSubmitted.map((o) => (
                    <li key={o.code}>
                      {o.code}{' '}
                      <small>
                        {o.headline}, AI rank {o.aiRank}, score {Math.round(o.score)}
                      </small>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function AuditTrail() {
  const [action, setAction] = useState('');
  const { data, error, loading, retry } = useQuery(
    () => api.get(`/audit?limit=60${action ? `&action=${action}` : ''}`),
    [action],
  );
  return (
    <section className="card pad">
      <div className="section-title">
        <div>
          <h2>Who viewed what</h2>
          <p className="muted small">
            Every profile view, CV open, decision and erasure. Entries hold IDs only, never personal data.
          </p>
        </div>
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
          <option value="">All actions</option>
          {(data?.actions ?? []).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a] ?? a}
            </option>
          ))}
        </select>
      </div>
      {error && <ErrorState error={error} onRetry={retry} />}
      {loading && !data && <Skeleton lines={5} />}
      {data && (
        <div className="table-wrap">
          <table className="audit">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td>{timeAgo(e.at)}</td>
                  <td>
                    {e.actorName} <small>{e.actorRole}</small>
                  </td>
                  <td>{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td>
                    {e.detail?.candidate ?? `${e.entity} ${e.entityId}`}
                    {e.detail?.to && <small> to {e.detail.to}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Insights() {
  const { data, error, loading, retry } = useQuery(() => api.get('/insights'), []);
  if (error) return <ErrorState error={error} onRetry={retry} />;
  if (loading) return <Skeleton lines={6} className="card pad" />;

  const maxFunnel = Math.max(...data.funnel.map((f) => f.count), 1);
  const hours = Math.round(data.readingMinutesSaved / 60);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Insights and audit</h1>
          <p className="muted">
            Whether screening is getting faster, and whether the AI is earning the recruiters’ trust. Figures come from
            the seeded demo data.
          </p>
        </div>
      </header>

      <dl className="kpis">
        <Kpi
          label="Reading time saved"
          value={hours}
          unit=" hours"
          note={`${data.cvsRanked} CVs ranked, assuming ${data.baselineMinutesPerCv} min to read each`}
        />
        <Kpi
          label="Shortlist within 48 hours"
          value={data.shortlistWithin48hPct}
          unit="%"
          goal="Target 80%"
          note={
            data.avgHoursToShortlist != null ? `Average ${data.avgHoursToShortlist} h to first submission` : undefined
          }
        />
        <Kpi
          label="Client acceptance"
          value={data.clientAcceptancePct}
          unit="%"
          goal={`Baseline ${data.acceptance.baseline}%, target ${data.acceptance.target}%`}
        />
        <Kpi label="Open requisitions" value={data.requisitions} unit="" />
      </dl>

      <section className="card pad">
        <div className="section-title">
          <h2>Pipeline funnel</h2>
        </div>
        <ul className="funnel">
          {data.funnel.map((f) => (
            <li key={f.stage}>
              <span>{STAGE_LABEL[f.stage]}</span>
              <span className="bar">
                <i style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
              </span>
              <b>{f.count}</b>
            </li>
          ))}
        </ul>
      </section>

      <Agreement />
      <AuditTrail />
      <p className="privacy-note">
        <ShieldCheck size={15} /> Only the delivery head can see this page.
      </p>
    </>
  );
}
