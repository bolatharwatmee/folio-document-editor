import { useId } from "react";
import { AlertCircle } from "lucide-react";
import { Modal } from "./Modal";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Discard changes",
  cancelLabel = "Keep editing",
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const titleId = useId();
  return (
    <Modal open={open} onClose={onCancel} labelledBy={titleId}>
      <div className="modal-header">
        <div className="confirm-heading">
          <span className="confirm-icon" aria-hidden="true">
            <AlertCircle size={20} />
          </span>
          <h2 id={titleId}>{title}</h2>
        </div>
      </div>
      <p className="modal-description">{description}</p>
      <div className="modal-footer">
        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
          disabled={busy}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="button button-danger"
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
