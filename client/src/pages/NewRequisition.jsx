import { ArrowLeft, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import ScorecardEditor from '../components/ScorecardEditor.jsx';
import { ErrorState, Skeleton, useToast } from '../components/ui.jsx';
import { useQuery } from '../hooks.js';

const EXAMPLE_JD = 'Senior Java Developer, 5-8 years, Spring Boot, Noida, notice up to 60 days';

export default function NewRequisition() {
  const navigate = useNavigate();
  const toast = useToast();
  const clients = useQuery(() => api.get('/clients'), []);
  const [jd, setJd] = useState('');
  const [draft, setDraft] = useState(null);
  const [clientId, setClientId] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const extract = async () => {
    setExtracting(true);
    try {
      setDraft(await api.post('/requisitions/extract', { text: jd }));
      setErrors({});
    } catch (err) {
      toast(err.details?.text?.[0] ?? err.message, 'error');
    } finally {
      setExtracting(false);
    }
  };

  const create = async () => {
    setSaving(true);
    try {
      const created = await api.post('/requisitions', {
        clientId: Number(clientId),
        jdText: jd,
        scorecard: draft.scorecard,
      });
      toast('Requisition created. Add CVs to start ranking.');
      navigate(`/requisitions/${created.id}`);
    } catch (err) {
      setErrors(err.details ?? {});
      toast(err.message, 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <Link to="/" className="back">
        <ArrowLeft size={16} /> Requisitions
      </Link>
      <header className="page-head">
        <div>
          <h1>New requisition</h1>
          <p className="muted">
            Paste the client’s job description. Sift drafts a scorecard you can edit before any CV is scored.
          </p>
        </div>
      </header>

      <section className="card pad">
        <label className="field">
          <span>Job description</span>
          <textarea
            rows={7}
            value={jd}
            maxLength={20000}
            placeholder="Paste the JD from the client email here"
            onChange={(e) => setJd(e.target.value)}
          />
        </label>
        <div className="actions">
          <button className="btn primary" onClick={extract} disabled={extracting || jd.trim().length < 10}>
            <Sparkles size={16} /> {extracting ? 'Reading the JD…' : draft ? 'Extract again' : 'Extract scorecard'}
          </button>
          {!jd && (
            <button className="btn ghost" onClick={() => setJd(EXAMPLE_JD)}>
              Use the example JD
            </button>
          )}
        </div>
      </section>

      {extracting && <Skeleton lines={4} className="card pad" />}

      {draft && !extracting && (
        <section className="card pad reveal">
          <div className="section-title">
            <h2>Scorecard</h2>
            <span className="tag">{draft.source === 'llm' ? 'Read by AI' : 'Read by rules'}</span>
          </div>
          {draft.notes.length > 0 && (
            <ul className="notes" role="note">
              {draft.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <ScorecardEditor
            value={draft.scorecard}
            errors={errors}
            onChange={(scorecard) => setDraft({ ...draft, scorecard })}
          />

          <div className="create-bar">
            {clients.error ? (
              <ErrorState error={clients.error} onRetry={clients.retry} />
            ) : (
              <label className="field inline">
                <span>Client</span>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Choose a client</option>
                  {(clients.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="btn primary"
              disabled={!clientId || saving || draft.scorecard.skills.length === 0}
              onClick={create}
            >
              {saving ? 'Creating…' : 'Create requisition'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
