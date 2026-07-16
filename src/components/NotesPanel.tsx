import React from 'react';
import '../styles/components/CellDetailsHistoryPanel.css';

interface CellDetailsHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const CellDetailsHistoryPanel: React.FC<CellDetailsHistoryPanelProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="cell-details-history-panel">
      {/* Panel Header */}
      <div className="cell-details-history-panel-header">
        <div className="cell-details-history-panel-title-section">
          <div className="cell-details-history-panel-note-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="cell-details-history-panel-title">Cell Details & Updates</p>
        </div>
        <div className="cell-details-history-panel-actions">
          <button className="cell-details-history-panel-close" onClick={onClose} aria-label="Close">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="cell-details-history-panel-body">
        <div className="cell-details-history-content">
          <p className="cell-details-history-placeholder">Cell details and history content will go here...</p>
        </div>
      </div>
    </div>
  );
};

export default CellDetailsHistoryPanel;

