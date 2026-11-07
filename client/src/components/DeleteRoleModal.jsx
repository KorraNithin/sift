import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, useToast } from './ui.jsx';

const WITH_CLIENT = ['submitted', 'shortlisted', 'interview', 'offered', 'joined'];

/** Confirms deleting a role, or offers to close it instead when candidates have already gone to the client. */
export default function DeleteRoleModal({ requisition, total, onClose, onClosed }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const withClient = WITH_CLIENT.some((stage) => requisition.stageCounts[stage] > 0);

  const run = async (action, message) => {
    setBusy(true);
    try {
      await action();
      toast(message);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  const remove = () =>
    run(async () => {
      await api.del(`/requisitions/${requisition.id}`);
      navigate('/');
    }, 'Role deleted');

  const close = () =>
    run(async () => {
      await api.post(`/requisitions/${requisition.id}/status`, { status: 'closed' });
      onClosed();
      onClose();
    }, 'Role closed');

  return (
    <Modal
      title={withClient ? 'This role cannot be deleted' : 'Delete this role?'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {withClient ? (
            <button className="btn primary" onClick={close} disabled={busy}>
              Close this role
            </button>
          ) : (
            <button className="btn danger" onClick={remove} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete role'}
            </button>
          )}
        </>
      }
    >
      {withClient ? (
        <p>
          Candidates have already gone to the client for <b>{requisition.title}</b>. Deleting it would erase that
          history. Close it instead: it stays on record but stops taking new CVs.
        </p>
      ) : (
        <>
          <p>
            This deletes <b>{requisition.title}</b>, its scorecard and its ranking
            {total > 0 ? ` (${total} CV${total > 1 ? 's' : ''})` : ''}.
          </p>
          <p className="muted small" style={{ marginTop: 10 }}>
            CVs that are not ranked for any other role are erased permanently, including the stored files. This cannot
            be undone.
          </p>
        </>
      )}
    </Modal>
  );
}
