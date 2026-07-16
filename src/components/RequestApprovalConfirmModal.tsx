import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/RequestApprovalConfirmModal.css';

interface RequestApprovalConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** When set, the body reflects how many value cells are included (manual or criteria-based). */
  cellCount?: number;
}

const RequestApprovalConfirmModal: React.FC<RequestApprovalConfirmModalProps> = ({
  isOpen,
  onCancel,
  onConfirm,
  cellCount,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return createPortal(
    <div
      className="request-approval-confirm-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="request-approval-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-approval-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="request-approval-confirm-title" className="request-approval-confirm-title">
          Submit Plan for Review
        </h2>
        <p className="request-approval-confirm-body">
          {typeof cellCount === 'number' && cellCount > 0 ? (
            <>
              {cellCount === 1
                ? '1 value cell will be submitted for approval.'
                : `${cellCount.toLocaleString()} value cells will be submitted for approval.`}{' '}
              Are you sure you want to continue?
            </>
          ) : (
            <>The selected value cells will be submitted for approval. Are you sure you want to continue?</>
          )}
        </p>
        <div className="request-approval-confirm-actions">
          <button type="button" className="request-approval-confirm-btn request-approval-confirm-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="request-approval-confirm-btn request-approval-confirm-btn--primary" onClick={onConfirm}>
            Submit for approval
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RequestApprovalConfirmModal;
