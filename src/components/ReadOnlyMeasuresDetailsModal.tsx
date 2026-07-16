import React from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/ReadOnlyMeasuresDetailsModal.css';

interface AffectedMeasure {
  name: string;
  groupName: string;
}

interface ReadOnlyMeasuresDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  affectedMeasures: AffectedMeasure[];
}

const ReadOnlyMeasuresDetailsModal: React.FC<ReadOnlyMeasuresDetailsModalProps> = ({
  isOpen,
  onClose,
  affectedMeasures
}) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="readonly-measures-modal-overlay" onClick={handleOverlayClick}>
      <div className="readonly-measures-modal">
        <div className="readonly-measures-modal-header">
          <h2 className="readonly-measures-modal-title">Read-Only Measures Details</h2>
          <button className="readonly-measures-modal-close" onClick={onClose} aria-label="Close">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="readonly-measures-modal-body">
          <div className="readonly-measures-description-wrapper">
            <svg className="readonly-measures-warning-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="readonly-measures-description">
              The following measures have become read-only due to the enablement of measure groups with read-only access:
            </p>
          </div>
          <div className="readonly-measures-table-container">
            <table className="readonly-measures-table">
              <thead>
                <tr>
                  <th className="readonly-measures-th-measure">Measure</th>
                  <th className="readonly-measures-th-group">Measure Group</th>
                </tr>
              </thead>
              <tbody>
                {affectedMeasures.map((measure, index) => (
                  <tr key={index} className="readonly-measures-row">
                    <td className="readonly-measures-td-measure">{measure.name}</td>
                    <td className="readonly-measures-td-group">{measure.groupName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="readonly-measures-modal-footer">
          <button className="readonly-measures-btn-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReadOnlyMeasuresDetailsModal;
