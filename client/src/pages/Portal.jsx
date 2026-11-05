import {
  ArrowLeft,
  Briefcase,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  Inbox,
  MapPin,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Empty,
  ErrorState,
  Highlight,
  Meter,
  Modal,
  ReasonModal,
  Score,
  Skeleton,
  StagePill,
  StatusIcon,
  STATUS_LABEL,
  BandTag,
  useToast,
} from '../components/ui.jsx';
import { formatSlot, noticeLabel, timeAgo, tomorrowAtEleven, yearsLabel } from '../fmt.js';
import { useQuery } from '../hooks.js';

export function PortalHome() {
  const { user } = useAuth();
  const { data, error, loading, retry } = useQuery(() => api.get('/portal/requisitions'), []);
  return (
    <>
      <header className="portal-head">
        <h1>Hello, {user.name.split(' ')[0]}</h1>
        <p className="muted">Shortlists from Company A, ready for your decision.</p>
      </header>
      {error && <ErrorState error={error} onRetry={retry} />}
      {loading && <Skeleton lines={3} className="card pad" />}
      {data && data.length === 0 && (
        <Empty icon={Inbox} title="Nothing to review yet">
          When your recruiter submits candidates, they will appear here.
        </Empty>
      )}
      <ul className="portal-list">
        {(data ?? []).map((r) => (
          <li key={r.id}>
            <Link to={`/portal/r/${r.id}`} className="portal-card">
              <span>
                <b>{r.title}</b>
                <small>
                  {r.total} shortlisted, {timeAgo(r.createdAt).replace(' ago', '')} since the role opened
                </small>
              </span>
              {r.awaiting > 0 ? (
                <span className="badge">{r.awaiting} to review</span>
              ) : (
                <span className="muted small">All reviewed</span>
              )}
              <ChevronRight size={18} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function PortalRequisition() {
  const { id } = useParams();
  const { data, error, loading, retry } = useQuery(() => api.get(`/portal/requisitions/${id}`), [id]);
  return (
    <>
      <Link to="/portal" className="back">
        <ArrowLeft size={16} /> All roles
      </Link>
      {error && <ErrorState error={error} onRetry={retry} />}
      {loading && <Skeleton lines={4} className="card pad" />}
      {data && (
        <>
          <header className="portal-head">
            <h1>{data.title}</h1>
            <p className="muted">
              {data.candidates.filter((c) => c.stage === 'submitted').length} waiting for your decision
            </p>
          </header>
          <ul className="portal-list">
            {data.candidates.map((c, i) => (
              <li key={c.id} style={{ '--i': i }}>
                <Link to={`/portal/c/${c.id}`} className="cand-card">
                  <div className="cand-top">
                    <span>
                      <b>{c.name}</b>
                      <small>{c.headline}</small>
                    </span>
                    <Score value={c.score} />
                  </div>
                  <div className="facts">
                    <span>
                      <Briefcase size={14} /> {yearsLabel(c.experienceYears)}
                    </span>
                    <span>
                      <Clock size={14} /> {noticeLabel(c.noticeDays)}
                    </span>
                    <span>
                      <MapPin size={14} /> {c.location ?? 'n/a'}
                    </span>
                  </div>
                  <div className="chips">
                    {c.skills.slice(0, 4).map((s) => (
                      <span key={s} className="chip plain">
                        {s}
                      </span>
                    ))}
                  </div>
                  <StagePill stage={c.stage} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function SlotModal({ onClose, onSubmit }) {
  const [slot, setSlot] = useState(tomorrowAtEleven());
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(new Date(slot).toISOString());
      onClose();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Propose an interview slot"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!slot || busy} onClick={submit}>
            {busy ? 'Sending…' : 'Send proposal'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Date and time</span>
        <input type="datetime-local" value={slot} onChange={(e) => setSlot(e.target.value)} />
      </label>
      <p className="muted small">Your recruiter will confirm the time with the candidate.</p>
    </Modal>
  );
}

export function PortalCandidate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: c, error, loading, reload, retry } = useQuery(() => api.get(`/portal/applications/${id}`), [id]);
  const [modal, setModal] = useState(null);

  const decide = async (body, message) => {
    await api.post(`/portal/applications/${id}/decision`, body);
    toast(message);
    reload();
  };

  if (error) return <ErrorState error={error} onRetry={retry} />;
  if (loading || !c) return <Skeleton lines={6} className="card pad" />;

  const open = c.stage === 'submitted' || c.stage === 'shortlisted';
  const canInterview = open;
  const canShortlist = c.stage === 'submitted';
  const canReject = ['submitted', 'shortlisted', 'interview'].includes(c.stage);

  return (
    <>
      <Link to={`/portal/r/${c.requisitionId}`} className="back">
        <ArrowLeft size={16} /> {c.requisitionTitle}
      </Link>

      <header className="cand-head">
        <div>
          <h1>{c.name}</h1>
          <p className="muted">{c.headline}</p>
        </div>
        <Score value={c.score} size="lg" />
      </header>
      <div className="facts big">
        <span>
          <Briefcase size={15} /> {yearsLabel(c.experienceYears)}
        </span>
        <span>
          <Clock size={15} /> {noticeLabel(c.noticeDays)}
        </span>
        <span>
          <MapPin size={15} /> {c.location ?? 'n/a'}
        </span>
        <StagePill stage={c.stage} />
      </div>

      {c.stage === 'interview' && c.interviewSlot && (
        <div className="callout ok">
          <CalendarClock size={17} />
          <div>
            <b>Interview proposed</b>
            <p>{formatSlot(c.interviewSlot)}</p>
          </div>
        </div>
      )}
      {c.stage === 'rejected' && (
        <div className="callout danger">
          <X size={17} />
          <div>
            <b>Not taken forward</b>
            <p>{c.rejectReason}</p>
          </div>
        </div>
      )}

      <section className="card pad">
        <div className="section-title">
          <h2>Why this candidate matches</h2>
          <BandTag score={c.score} />
        </div>
        <Meter criteria={c.criteria} size="lg" />
        <ul className="criteria compact">
          {c.criteria.map((cr) => (
            <li key={cr.label} className={`criterion ${cr.status}`}>
              <div className="criterion-head">
                <StatusIcon status={cr.status} />
                <b>{cr.label}</b>
                {cr.detail && <span className="detail">{cr.detail}</span>}
              </div>
              {cr.evidence ? (
                <blockquote className="evidence">
                  <Highlight text={cr.evidence} term={cr.matched} />
                </blockquote>
              ) : (
                <p className="no-evidence">{cr.note ?? STATUS_LABEL[cr.status]}</p>
              )}
            </li>
          ))}
        </ul>
        <p className="fair-note">
          <ShieldCheck size={15} /> Ranked by an AI-assisted score that ignores name, gender, age, photo and marital
          status. A recruiter reviewed this CV before submitting it.
        </p>
      </section>

      <section className="card pad">
        <h2>Contact</h2>
        <dl className="facts-list">
          <div>
            <dt>Email</dt>
            <dd>{c.email ?? 'n/a'}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{c.phone ?? 'n/a'}</dd>
          </div>
        </dl>
        <p className="muted small">Contact details are masked. Company A arranges all introductions.</p>
      </section>

      <details className="card pad cv-details">
        <summary>Read the full CV</summary>
        <div className="cv-text">
          {c.cvText.split('\n').map((line, i) => (
            <div key={i} className="cv-line">
              {line || '\u00a0'}
            </div>
          ))}
        </div>
      </details>

      {(canShortlist || canInterview || canReject) && (
        <div className="action-bar">
          {canReject && (
            <button className="btn danger-outline" onClick={() => setModal('reject')}>
              <X size={17} /> Reject
            </button>
          )}
          {canInterview && (
            <button className="btn" onClick={() => setModal('slot')}>
              <CalendarClock size={17} /> Propose slot
            </button>
          )}
          {canShortlist && (
            <button
              className="btn primary"
              onClick={() =>
                decide({ action: 'shortlist' }, 'Shortlisted. Your recruiter has been told.').catch((e) =>
                  toast(e.message, 'error'),
                )
              }
            >
              <Check size={17} /> Shortlist
            </button>
          )}
        </div>
      )}

      {modal === 'reject' && (
        <ReasonModal
          title={`Reject ${c.name}`}
          label="Tell the recruiter why"
          placeholder="For example: needs more hands-on microservices experience"
          confirmLabel="Reject candidate"
          onClose={() => setModal(null)}
          onSubmit={async (reason) => {
            await decide({ action: 'reject', reason }, 'Rejected. The reason has been sent to your recruiter.');
            navigate(`/portal/r/${c.requisitionId}`);
          }}
        />
      )}
      {modal === 'slot' && (
        <SlotModal
          onClose={() => setModal(null)}
          onSubmit={(slot) => decide({ action: 'interview', slot }, 'Interview slot proposed')}
        />
      )}
    </>
  );
}
