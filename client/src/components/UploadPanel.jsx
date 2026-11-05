import { CheckCircle2, CopyCheck, FileWarning, ScanLine, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './ui.jsx';

const BATCH_SIZE = 20;
const MAX_FILES = 500;
const MAX_BYTES = 5 * 1024 * 1024;
const SOURCES = ['Candidate applied directly', 'Consent taken by call or email', 'Referral with consent'];
const RESULT_ICON = {
  parsed: CheckCircle2,
  duplicate: CopyCheck,
  already_in_requisition: CopyCheck,
  scan: ScanLine,
  failed: FileWarning,
};
const RESULT_LABEL = {
  parsed: 'Ranked',
  duplicate: 'Duplicate',
  already_in_requisition: 'Already here',
  scan: 'Scan',
  failed: 'Failed',
};

const sizeLabel = (bytes) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Bulk CV upload: files are sent in small batches so the recruiter sees real progress and per-file outcomes. */
export default function UploadPanel({ requisitionId, onDone }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [source, setSource] = useState(SOURCES[0]);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = (list) => {
    const incoming = [...list];
    const valid = incoming.filter((f) => /\.(pdf|docx|txt)$/i.test(f.name) && f.size <= MAX_BYTES);
    if (valid.length < incoming.length)
      toast(`${incoming.length - valid.length} file(s) skipped: only PDF, DOCX or TXT up to 5 MB`, 'error');
    setFiles((current) => {
      const seen = new Set(current.map((f) => `${f.name}:${f.size}`));
      const merged = [...current, ...valid.filter((f) => !seen.has(`${f.name}:${f.size}`))];
      if (merged.length > MAX_FILES) toast(`Only the first ${MAX_FILES} files were kept`, 'error');
      return merged.slice(0, MAX_FILES);
    });
    setResults(null);
  };

  const run = async () => {
    const queue = files;
    const all = [];
    setProgress({ done: 0, total: queue.length });
    for (let i = 0; i < queue.length; i += BATCH_SIZE) {
      const batch = queue.slice(i, i + BATCH_SIZE);
      const form = new FormData();
      form.append('consent', 'true');
      form.append('consentSource', source);
      batch.forEach((f) => form.append('files', f));
      try {
        all.push(...(await api.upload(`/requisitions/${requisitionId}/cvs`, form)).results);
      } catch (err) {
        all.push(...batch.map((f) => ({ fileName: f.name, status: 'failed', message: err.message })));
      }
      setProgress({ done: Math.min(i + BATCH_SIZE, queue.length), total: queue.length });
    }
    setResults(all);
    setFiles([]);
    setProgress(null);
    onDone();
  };

  const counts = (results ?? []).reduce((c, r) => ({ ...c, [r.status]: (c[r.status] ?? 0) + 1 }), {});
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const busy = Boolean(progress);

  return (
    <section className="card pad upload">
      <div
        className={`dropzone ${dragging ? 'over' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => (e.preventDefault(), setDragging(false), addFiles(e.dataTransfer.files))}
      >
        <UploadCloud size={26} />
        <div>
          <b>Drop CVs here</b>
          <p className="muted small">PDF, DOCX or TXT, up to 5 MB each and 500 per upload</p>
        </div>
        <button className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          multiple
          hidden
          onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))}
        />
      </div>

      {files.length > 0 && (
        <div className="upload-ready reveal">
          <p>
            <b>{files.length}</b> file{files.length > 1 ? 's' : ''} ready ({sizeLabel(totalBytes)})
            <button className="link" onClick={() => setFiles([])} disabled={busy}>
              Clear
            </button>
          </p>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
            <span>
              I confirm these candidates agreed to their CV being used for hiring and placement only (DPDP Act 2023).
            </span>
          </label>
          <div className="upload-actions">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={busy}
              aria-label="How consent was obtained"
            >
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button className="btn primary" disabled={!consent || busy} onClick={run}>
              {busy
                ? `Parsing ${progress.done} of ${progress.total}…`
                : `Parse and rank ${files.length} CV${files.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {busy && (
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
        >
          <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}

      {results && (
        <div className="results reveal">
          <div className="result-summary">
            {Object.entries(counts).map(([status, n]) => (
              <span key={status} className={`chip ${status}`}>
                <b>{n}</b> {RESULT_LABEL[status].toLowerCase()}
              </span>
            ))}
          </div>
          <ul>
            {results.map((r, i) => {
              const Icon = RESULT_ICON[r.status];
              return (
                <li key={`${r.fileName}-${i}`} className={r.status}>
                  <Icon size={16} />
                  <span className="file">{r.fileName}</span>
                  <span className="msg">{r.message}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
