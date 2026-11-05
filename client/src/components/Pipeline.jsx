import { useState } from 'react';
import { api } from '../api.js';
import { PIPELINE_STAGES, STAGE_LABEL, yearsLabel } from '../fmt.js';
import { Meter, ReasonModal, Score, useToast } from './ui.jsx';

/** Kanban board for one requisition. Drag a card to move it; the server enforces every rule. */
export default function Pipeline({ apps, canEdit, onOpen, onMoved }) {
  const toast = useToast();
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const columns = [...PIPELINE_STAGES, 'rejected'];

  const move = async (app, stage, reason) => {
    await api.post(`/applications/${app.id}/move`, { stage, reason });
    onMoved();
    toast(`${app.name} moved to ${STAGE_LABEL[stage].toLowerCase()}`);
  };

  const drop = async (stage) => {
    const app = apps.find((a) => a.id === dragId);
    setDragId(null);
    setOverStage(null);
    if (!app || app.stage === stage) return;
    if (stage === 'rejected') return setRejecting(app);
    try {
      await move(app, stage);
    } catch (err) {
      toast(err.message, 'error');
    }
    return undefined;
  };

  return (
    <>
      <p className="muted small board-hint">
        {canEdit
          ? 'Drag a card to move it. Submitting to the client needs the CV to be opened first.'
          : 'Read-only view.'}
      </p>
      <div className="board" role="list">
        {columns.map((stage) => {
          const cards = apps.filter((a) => a.stage === stage);
          return (
            <section
              key={stage}
              role="listitem"
              className={`column ${overStage === stage ? 'over' : ''} ${stage === 'rejected' ? 'muted-col' : ''}`}
              onDragOver={(e) => canEdit && (e.preventDefault(), setOverStage(stage))}
              onDragLeave={() => setOverStage(null)}
              onDrop={(e) => (e.preventDefault(), drop(stage))}
            >
              <h3>
                {STAGE_LABEL[stage]} <span>{cards.length}</span>
              </h3>
              {cards.length === 0 && <p className="col-empty">Nothing here</p>}
              {cards.map((a) => (
                <button
                  key={a.id}
                  className={`kcard ${dragId === a.id ? 'dragging' : ''}`}
                  draggable={canEdit}
                  onDragStart={() => setDragId(a.id)}
                  onDragEnd={() => (setDragId(null), setOverStage(null))}
                  onClick={() => onOpen(a.id)}
                >
                  <span className="kcard-top">
                    <b>{a.name}</b>
                    <Score value={a.score} size="sm" />
                  </span>
                  <small>
                    {a.headline ?? 'No headline'}, {yearsLabel(a.experienceYears)}
                  </small>
                  <Meter criteria={a.meter} unscored={a.score == null} />
                </button>
              ))}
            </section>
          );
        })}
      </div>
      {rejecting && (
        <ReasonModal
          title={`Mark ${rejecting.name} as not a fit`}
          label="Reason"
          placeholder="For example: salary expectation is well above budget"
          confirmLabel="Mark as not a fit"
          onClose={() => setRejecting(null)}
          onSubmit={(reason) => move(rejecting, 'rejected', reason)}
        />
      )}
    </>
  );
}
