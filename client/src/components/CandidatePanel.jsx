import {
  Briefcase,
  CalendarClock,
  Clock,
  EyeOff,
  ExternalLink,
  Lock,
  MapPin,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatDate, formatSlot, noticeLabel, STAGE_LABEL, yearsLabel } from '../fmt.js';
import { useQuery } from '../hooks.js';
import {
  BandTag,
  ConfidenceTag,
  Drawer,
  ErrorState,
  Highlight,
  Meter,
  ReasonModal,
  Score,
  Skeleton,
  StagePill,
  StatusIcon,
  useToast,
  STATUS_LABEL,
} from './ui.jsx';

/** The one next step for each stage. Submitting is gated behind opening the CV. */
function primaryAction(d) {
  switch (d.stage) {
    case 'sourced':
      return { to: 'screened', label: 'Mark as screened' };
    case 'screened':
      return d.openedAt
        ? { to: 'submitted', label: 'Submit to client', disabled: d.score == null }
        : { openCv: true, label: 'Open the CV to continue' };
    case 'shortlisted':
      return { to: 'interview', label: 'Mark interview scheduled' };
    case 'interview':
      return { to: 'offered', label: 'Mark offer made' };
    case 'offered':
      return { to: 'joined', label: 'Mark as joined' };
    case 'rejected':
      return { to: 'screened', label: 'Reopen candidate', ghost: true };
    default:
      return null;
  }
}

function CriterionRow({ c }) {
  return (
    <li className={`criterion ${c.status}`}>
      <div className="criterion-head">
        <StatusIcon status={c.status} />
        <b>{c.label}</b>
        {c.kind === 'skill' && <span className="tag">{c.required ? 'Must have' : 'Bonus'}</span>}
        {c.detail && <span className="detail">{c.detail}</span>}
        <span className="pts">
          {Math.round(c.earned * 10) / 10}
          <small>/{c.points}</small>
        </span>
      </div>
      {c.evidence ? (
        <blockquote className="evidence">
          <Highlight text={c.evidence} term={c.matched} />
        </blockquote>
      ) : (
        <p className="no-evidence">{c.note ?? STATUS_LABEL[c.status]}</p>
      )}
      {c.evidence && c.note && <p className="criterion-note">{c.note}</p>}
    </li>
  );
}

function ScoreTab({ d }) {
  return (
    <div className="score-tab">
      <div className="score-hero">
        <Score value={d.score} size="lg" />
        <div>
          <div className="tags">
            <BandTag score={d.score} />
            {d.score != null && <ConfidenceTag level={d.confidence} />}
          </div>
          <Meter criteria={d.criteria} size="lg" unscored={d.score == null} />
        </div>
      </div>

      {d.flags.length > 0 && (
        <div className="callout warn" role="note">
          <TriangleAlert size={17} />
          <div>
            <b>Worth a human look</b>
            <ul>
              {d.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {d.clientDecision && (
        <div className={`callout ${d.clientDecision === 'rejected' ? 'danger' : 'ok'}`}>
          <CalendarClock size={17} />
          <div>
            <b>Client decision: {STAGE_LABEL[d.clientDecision === 'rejected' ? 'rejected' : d.clientDecision]}</b>
            {d.rejectReason && <p>{d.rejectReason}</p>}
            {d.interviewSlot && <p>Interview proposed for {formatSlot(d.interviewSlot)}</p>}
          </div>
        </div>
      )}

      {d.criteria.length > 0 && (
        <>
          <h4 className="eyebrowless">How this score was built</h4>
          <ul className="criteria">
            {d.criteria.map((c) => (
              <CriterionRow key={c.key} c={c} />
            ))}
          </ul>
        </>
      )}

      <p className="fair-note">
        <EyeOff size={15} />
        Name, gender, age, photo and marital status were hidden while scoring
        {d.hiddenLines > 0 ? ` (${d.hiddenLines} line${d.hiddenLines > 1 ? 's' : ''} removed)` : ''}. Scores only rank.
        They never reject anyone.
      </p>
    </div>
  );
}

function CvTab({ d, canEdit, onOpened, onChanged }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [pasted, setPasted] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .post(`/applications/${d.id}/open`)
      .then((data) => {
        if (!alive) return;
        setState({ loading: false, error: null, data });
        if (canEdit && !d.openedAt) onOpened();
      })
      .catch((error) => alive && setState({ loading: false, error, data: null }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id]);

  const saveText = async () => {
    setSaving(true);
    try {
      await api.patch(`/candidates/${d.candidate.id}`, { rawText: pasted });
      toast('Text saved and the candidate has been scored');
      onChanged();
    } catch (err) {
      toast(err.details?.rawText?.[0] ?? err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (state.loading) return <Skeleton lines={6} />;
  if (state.error) return <ErrorState error={state.error} />;
  const { text, hasFile, parseStatus } = state.data;
  const evidence = d.criteria.map((c) => c.evidence).filter(Boolean);

  return (
    <div className="cv-tab">
      <div className="cv-meta">
        <span className="lock">
          <Lock size={14} /> Opening is logged
        </span>
        {hasFile && (
          <a className="link" href={`/api/applications/${d.id}/file`} target="_blank" rel="noreferrer">
            Original file <ExternalLink size={13} />
          </a>
        )}
      </div>

      {parseStatus === 'scan' && (
        <div className="callout warn">
          <TriangleAlert size={17} />
          <div>
            <b>This CV is a scanned image</b>
            <p>No text could be read, so it has no score. Open the original, then paste the text below to score it.</p>
          </div>
        </div>
      )}

      {text ? (
        <div className="cv-text">
          {text.split('\n').map((line, i) => (
            <div key={i} className={`cv-line ${evidence.some((e) => line.includes(e)) ? 'hit' : ''}`}>
              {line || '\u00a0'}
            </div>
          ))}
        </div>
      ) : (
        canEdit && (
          <label className="field">
            <span>Paste the text from the scan</span>
            <textarea
              rows={9}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="Type or paste what the CV says"
            />
            <button className="btn primary" onClick={saveText} disabled={saving || pasted.trim().length < 40}>
              {saving ? 'Scoring…' : 'Save and score'}
            </button>
          </label>
        )
      )}
    </div>
  );
}

function ProfileTab({ d, canEdit, onChanged, onErased }) {
  const toast = useToast();
  const c = d.candidate;
  const [form, setForm] = useState({
    headline: c.headline ?? '',
    experienceYears: c.experienceYears ?? '',
    noticeDays: c.noticeDays ?? '',
    location: c.location ?? '',
    skills: c.skills.join(', '),
  });
  const [saving, setSaving] = useState(false);
  const [erasing, setErasing] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const num = (v) => (v === '' ? null : Number(v));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/candidates/${c.id}`, {
        headline: form.headline || null,
        experienceYears: num(form.experienceYears),
        noticeDays: num(form.noticeDays),
        location: form.location || null,
        skills: form.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      toast('Profile updated and re-scored');
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-tab">
      <section>
        <h4 className="eyebrowless">What Sift read from the CV</h4>
        <p className="muted small">Fix anything the parser got wrong. The score updates straight away.</p>
        <div className="grid-2">
          <label className="field">
            <span>Current role</span>
            <input disabled={!canEdit} value={form.headline} onChange={(e) => set({ headline: e.target.value })} />
          </label>
          <label className="field">
            <span>Location</span>
            <input disabled={!canEdit} value={form.location} onChange={(e) => set({ location: e.target.value })} />
          </label>
          <label className="field">
            <span>Experience (years)</span>
            <input
              disabled={!canEdit}
              type="number"
              step="0.5"
              min="0"
              value={form.experienceYears}
              onChange={(e) => set({ experienceYears: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Notice period (days)</span>
            <input
              disabled={!canEdit}
              type="number"
              min="0"
              value={form.noticeDays}
              onChange={(e) => set({ noticeDays: e.target.value })}
            />
          </label>
        </div>
        <label className="field">
          <span>Skills, comma separated</span>
          <input disabled={!canEdit} value={form.skills} onChange={(e) => set({ skills: e.target.value })} />
        </label>
        {canEdit && (
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </section>

      <section>
        <h4 className="eyebrowless">Contact</h4>
        <dl className="facts-list">
          <div>
            <dt>Email</dt>
            <dd>{c.email ?? 'Not found'}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{c.phone ? `+91 ${c.phone}` : 'Not found'}</dd>
          </div>
          <div>
            <dt>Expected CTC</dt>
            <dd>{c.expectedCtc ? `₹${c.expectedCtc} LPA` : 'Not stated'}</dd>
          </div>
        </dl>
        <p className="muted small">Clients only ever see these masked.</p>
      </section>

      <section>
        <h4 className="eyebrowless">Consent and data rights</h4>
        <div className="callout ok">
          <ShieldCheck size={17} />
          <div>
            <b>Consent recorded on {formatDate(c.consentAt)}</b>
            <p>
              {c.consentSource}. Purpose: {c.consentPurpose}.
            </p>
          </div>
        </div>
        <button className="btn danger-outline" onClick={() => setErasing(true)}>
          <Trash2 size={16} /> Erase this candidate’s data
        </button>
        <p className="muted small">
          Removes the CV, contact details and parsed profile. The action stays in the audit log without personal data.
        </p>
      </section>

      {erasing && (
        <ReasonModal
          title="Erase candidate data"
          label="Why is the data being erased? (leave out names and contact details)"
          placeholder="For example: candidate requested deletion by email"
          confirmLabel="Erase permanently"
          onClose={() => setErasing(false)}
          onSubmit={async (reason) => {
            await api.del(`/candidates/${c.id}`, { reason });
            toast('Candidate data erased');
            onErased();
          }}
        />
      )}
    </div>
  );
}

export default function CandidatePanel({ applicationId, canEdit, onClose, onChanged }) {
  const {
    data: d,
    error,
    loading,
    reload,
    retry,
  } = useQuery(() => api.get(`/applications/${applicationId}`), [applicationId]);
  const [tab, setTab] = useState('score');
  const [rejecting, setRejecting] = useState(false);
  const toast = useToast();

  const refresh = () => {
    reload();
    onChanged();
  };

  const act = async (to, reason) => {
    try {
      await api.post(`/applications/${applicationId}/move`, { stage: to, reason });
      toast(to === 'submitted' ? 'Submitted to the client' : `Moved to ${STAGE_LABEL[to].toLowerCase()}`);
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const primary = d && canEdit ? primaryAction(d) : null;
  const canReject = d && canEdit && !['rejected', 'joined'].includes(d.stage);

  return (
    <Drawer onClose={onClose} label="Candidate">
      {loading && (
        <div className="panel-pad">
          <Skeleton lines={5} />
        </div>
      )}
      {error && (
        <div className="panel-pad">
          <ErrorState error={error} onRetry={retry} />
        </div>
      )}
      {d && (
        <>
          <header className="panel-head">
            <button className="icon-btn close" onClick={onClose} aria-label="Close panel">
              <X size={19} />
            </button>
            <div className="panel-title">
              <small>
                {d.candidate.code} for {d.requisition.title}
              </small>
              <h2>{d.candidate.name}</h2>
              <p>{d.candidate.headline ?? 'No headline found'}</p>
            </div>
            <div className="facts">
              <span>
                <Briefcase size={14} /> {yearsLabel(d.candidate.experienceYears)}
              </span>
              <span>
                <Clock size={14} /> {noticeLabel(d.candidate.noticeDays)}
              </span>
              <span>
                <MapPin size={14} /> {d.candidate.location ?? 'Location n/a'}
              </span>
              <StagePill stage={d.stage} />
            </div>
            <nav className="tabs" aria-label="Candidate sections">
              {[
                ['score', 'Score and evidence'],
                ['cv', 'CV'],
                ['profile', 'Profile and privacy'],
              ].map(([key, label]) => (
                <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </nav>
          </header>

          <div className="panel-body">
            {tab === 'score' && <ScoreTab d={d} />}
            {tab === 'cv' && <CvTab d={d} canEdit={canEdit} onOpened={reload} onChanged={refresh} />}
            {tab === 'profile' && (
              <ProfileTab d={d} canEdit={canEdit} onChanged={refresh} onErased={() => (onChanged(), onClose())} />
            )}
          </div>

          <footer className="panel-foot">
            {!canEdit && <span className="muted small">Read-only view</span>}
            {d.stage === 'submitted' && canEdit && (
              <>
                <span className="muted small">With the client. Waiting for a decision.</span>
                <button className="btn ghost" onClick={() => act('screened')}>
                  Recall
                </button>
              </>
            )}
            {canReject && (
              <button className="btn ghost" onClick={() => setRejecting(true)}>
                Not a fit
              </button>
            )}
            {primary && (
              <button
                className={`btn ${primary.ghost ? '' : 'primary'}`}
                disabled={primary.disabled}
                title={primary.disabled ? 'Add the CV text first' : undefined}
                onClick={() => (primary.openCv ? setTab('cv') : act(primary.to))}
              >
                {primary.label}
              </button>
            )}
          </footer>

          {rejecting && (
            <ReasonModal
              title={`Mark ${d.candidate.name} as not a fit`}
              label="Reason"
              placeholder="For example: salary expectation is well above budget"
              confirmLabel="Mark as not a fit"
              onClose={() => setRejecting(false)}
              onSubmit={async (reason) => {
                await api.post(`/applications/${d.id}/move`, { stage: 'rejected', reason });
                toast('Marked as not a fit');
                refresh();
              }}
            />
          )}
        </>
      )}
    </Drawer>
  );
}
