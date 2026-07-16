import React from 'react';
import '../styles/components/TimeGranularityModal.css';

interface TimeGranularityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TimeGranularityModal: React.FC<TimeGranularityModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="tg-overlay" onClick={onClose}>
      <div className="tg-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="tg-title">
        <button className="tg-close" type="button" aria-label="Close" onClick={onClose}>✕</button>
        <div className="tg-container">
          <div className="tg-header">
            <h2 id="tg-title" className="tg-title">Setup Time Granularity</h2>
          </div>
          <div className="tg-body">
            <p className="tg-field-label">Time Granularity has been set to default</p>
            <p className="tg-field-value">Quarterly, Monthly</p>
          </div>
          <div className="tg-footer">
            <button className="tg-ok-btn" type="button" onClick={onClose}>Ok</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeGranularityModal;
