import { ArrowLeft, ChevronDown, Search, Upload, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import CandidatePanel from '../components/CandidatePanel.jsx';
import Pipeline from '../components/Pipeline.jsx';
import ScorecardEditor from '../components/ScorecardEditor.jsx';
import UploadPanel from '../components/UploadPanel.jsx';
import {
  Empty,
  ErrorState,
  Meter,
  Score,
  Skeleton,
  StagePill,
  StatusIcon,
  useDebounced,
  useToast,
} from '../components/ui.jsx';
import { bandOf, noticeLabel, yearsLabel } from '../fmt.js';
import { useQuery } from '../hooks.js';

const NEXT_STEP = (a) => {
  if (a.parseStatus === 'scan') return 'Needs a manual look';
  if (a.stage === 'sourced') return 'Review the CV';
  if (a.stage === 'screened') return a.openedAt ? 'Ready to submit' : 'Open the CV';
  return null;
};

function RankRow({ a, onOpen, index }) {
  const skills = a.meter.filter((m) => m.kind === 'skill').slice(0, 5);
  const next = NEXT_STEP(a);
  return (
    <li style={{ '--i': Math.min(index, 14) }}>
      <button className={`rank-row ${bandOf(a.score)}`} onClick={() => onOpen(a.id)}>
        <span className="rank" aria-label={`Rank ${a.rank}`}>
          {a.rank}
        </span>
        <span className="who">
          <b>{a.name}</b>
          <small>{a.headline ?? 'No headline found'}</small>
          <span className="facts">
            <span>{yearsLabel(a.experienceYears)}</span>
            <span>{noticeLabel(a.noticeDays)}</span>
            <span>{a.location ?? 'Location n/a'}</span>
          </span>
        </span>
        <span className="proof">
          <Meter criteria={a.meter} unscored={a.score == null} />
          {a.score == null ? (
            <span className="chips">
              <span className="chip scan">Scanned image, no text read</span>
            </span>
          ) : (
            <span className="chips">
              {skills.map((s) => (
                <span key={s.label} className={`chip ${s.status}`}>
                  <StatusIcon status={s.status} /> {s.label}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="num">
          <Score value={a.score} />
        </span>
        <span className="next">
          <StagePill stage={a.stage} />
          {next && <small>{next}</small>}
        </span>
      </button>
    </li>
  );
}

export default function Requisition() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user.role === 'recruiter';
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'ranked';
  const openId = params.get('c');
  const [query, setQuery] = useState('');
  const [showLow, setShowLow] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const search = useDebounced(tab === 'ranked' ? query.trim() : '');

  const req = useQuery(() => api.get(`/requisitions/${id}`), [id]);
  const apps = useQuery(
    () => api.get(`/requisitions/${id}/applications${search ? `?q=${encodeURIComponent(search)}` : ''}`),
    [id, search],
  );

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v == null ? next.delete(k) : next.set(k, v)));
    setParams(next, { replace: true });
  };
  const refresh = () => (req.reload(), apps.reload());

  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  useEffect(() => setDraft(req.data?.scorecard ?? null), [req.data]);
  const dirty = draft && req.data && JSON.stringify(draft) !== JSON.stringify(req.data.scorecard);

  const saveScorecard = async () => {
    setSaving(true);
    try {
      await api.put(`/requisitions/${id}/scorecard`, draft);
      toast('Scorecard saved. Every CV has been re-scored.');
      setErrors({});
      refresh();
    } catch (err) {
      setErrors(err.details ?? {});
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (req.error) return <ErrorState error={req.error} onRetry={req.retry} />;
  if (req.loading || !req.data) return <Skeleton lines={5} className="card pad" />;

  const r = req.data;
  const sc = r.scorecard;
  const list = apps.data ?? [];
  const unscored = list.filter((a) => a.score == null);
  const main = list.filter((a) => a.score != null && bandOf(a.score) !== 'low');
  const low = list.filter((a) => bandOf(a.score) === 'low');
  const lowOpen = showLow || Boolean(search);
  const total = Object.values(r.stageCounts).reduce((a, b) => a + b, 0);

  return (
    <>
      <Link to="/" className="back">
        <ArrowLeft size={16} /> Requisitions
      </Link>
      <header className="page-head">
        <div>
          <h1>{r.title}</h1>
          <p className="muted">{r.clientName}</p>
          <div className="scorecard-summary">
            <span>
              {sc.experience.min} to {sc.experience.max} yrs
            </span>
            {sc.noticeMax != null && <span>Notice up to {sc.noticeMax} days</span>}
            {sc.location && <span>{sc.location}</span>}
            {sc.skills.map((s) => (
              <span key={s.name} className={s.required ? 'must' : 'nice'}>
                {s.name}
              </span>
            ))}
          </div>
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => (update({ tab: 'ranked' }), setUploadOpen((o) => !o))}>
            <Upload size={17} /> Add CVs
          </button>
        )}
      </header>

      <nav className="tabs page-tabs" aria-label="Requisition sections">
        {[
          ['ranked', `Ranked (${total})`],
          ['pipeline', 'Pipeline'],
          ['scorecard', 'Scorecard'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => update({ tab: key === 'ranked' ? null : key })}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'ranked' && (
        <>
          {canEdit && (uploadOpen || total === 0) && <UploadPanel requisitionId={id} onDone={refresh} />}

          <div className="toolbar">
            <label className="search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, skill, role or any word in the CV"
                aria-label="Search candidates"
              />
            </label>
            <span className="muted small">
              {search ? `${list.length} match${list.length === 1 ? '' : 'es'}` : 'Best match first'}
            </span>
          </div>

          {apps.error && <ErrorState error={apps.error} onRetry={apps.retry} />}
          {apps.loading && !apps.data && <Skeleton lines={5} className="card pad" />}
          {apps.data && list.length === 0 && (
            <Empty icon={Users} title={search ? 'No one matches that search' : 'No CVs yet'}>
              {search
                ? 'Try a different skill or name. Low-scoring candidates are always searchable.'
                : canEdit
                  ? 'Drop a pile of CVs above and Sift will rank them against this scorecard.'
                  : 'Nothing has been uploaded for this role.'}
            </Empty>
          )}

          {unscored.length > 0 && (
            <section className="group attention">
              <h3>Needs a manual look ({unscored.length})</h3>
              <ul className="rank-list">
                {unscored.map((a, i) => (
                  <RankRow key={a.id} a={a} index={i} onOpen={(cid) => update({ c: cid })} />
                ))}
              </ul>
            </section>
          )}

          {main.length > 0 && (
            <ul className="rank-list">
              {main.map((a, i) => (
                <RankRow key={a.id} a={a} index={i} onOpen={(cid) => update({ c: cid })} />
              ))}
            </ul>
          )}

          {low.length > 0 && (
            <section className="group">
              <button className="group-toggle" onClick={() => setShowLow((s) => !s)} aria-expanded={lowOpen}>
                <ChevronDown size={16} className={lowOpen ? 'open' : ''} />
                Lower matches ({low.length})
                <small>Never rejected. Still searchable and can be submitted after review.</small>
              </button>
              {lowOpen && (
                <ul className="rank-list">
                  {low.map((a, i) => (
                    <RankRow key={a.id} a={a} index={i} onOpen={(cid) => update({ c: cid })} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {tab === 'pipeline' &&
        (apps.data ? (
          <Pipeline apps={list} canEdit={canEdit} onOpen={(cid) => update({ c: cid })} onMoved={refresh} />
        ) : (
          <Skeleton lines={5} className="card pad" />
        ))}

      {tab === 'scorecard' && draft && (
        <section className="card pad">
          <div className="section-title">
            <h2>Scorecard</h2>
            {canEdit && (
              <button className="btn primary" disabled={!dirty || saving} onClick={saveScorecard}>
                {saving ? 'Re-scoring…' : 'Save and re-score'}
              </button>
            )}
          </div>
          <fieldset disabled={!canEdit} className="plain">
            <ScorecardEditor value={draft} errors={errors} onChange={setDraft} />
          </fieldset>
        </section>
      )}

      {openId && (
        <CandidatePanel
          key={openId}
          applicationId={openId}
          canEdit={canEdit}
          onClose={() => update({ c: null })}
          onChanged={refresh}
        />
      )}
    </>
  );
}
