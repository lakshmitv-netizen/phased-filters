import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/CellExplainabilityModal.css';

export interface SourceRecord {
  id: string;
  name: string;
  field: string;
  object: string; // Salesforce object name
  value: number;
  influence: number; // Percentage influence on the cell value (0-100)
}

interface CellExplainabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  cellKey: string;
  cellValue: number;
  sourceRecords: SourceRecord[];
}

const CellExplainabilityModal: React.FC<CellExplainabilityModalProps> = ({
  isOpen,
  onClose,
  cellKey,
  cellValue,
  sourceRecords
}) => {
  // Sort records by influence (highest first)
  const sortedRecords = [...sourceRecords].sort((a, b) => b.influence - a.influence);

  // Generate initial formula based on source records
  const initialFormula = useMemo(() => {
    // Create a formula string based on the records
    // Format: SUM(Record1.Field1 * Influence1%, Record2.Field2 * Influence2%, ...)
    const formulaParts = sortedRecords.map((record, index) => {
      return `${record.object}.${record.field} * ${record.influence.toFixed(1)}%`;
    });
    
    return `SUM(${formulaParts.join(', ')})`;
  }, [sortedRecords]);

  // State for editable formula
  const [formula, setFormula] = useState(initialFormula);

  // Update formula when sourceRecords change (when modal opens with new data)
  useEffect(() => {
    if (isOpen) {
      setFormula(initialFormula);
    }
  }, [isOpen, initialFormula]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="cell-explainability-modal-overlay" onClick={handleOverlayClick}>
      <div className="cell-explainability-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cell-explainability-modal-header">
          <div className="cell-explainability-modal-header-left">
            <h2 className="cell-explainability-modal-title">Cell Explainability</h2>
            <div className="cell-explainability-modal-subtitle">
              Source records influencing cell value: <strong>{cellKey}</strong>
            </div>
          </div>
          <button className="cell-explainability-modal-close" onClick={onClose} aria-label="Close">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="cell-explainability-modal-body">
          {/* Current Value Display */}
          <div className="cell-explainability-current-value">
            <span className="cell-explainability-current-label">Current Cell Value:</span>
            <span className="cell-explainability-current-number">{cellValue.toLocaleString()}</span>
          </div>

          {/* Formula Display */}
          <div className="cell-explainability-formula-section">
            <h3 className="cell-explainability-section-title">Calculation Formula</h3>
            <div className="cell-explainability-formula">
              <textarea
                className="cell-explainability-formula-input"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                rows={3}
                spellCheck={false}
              />
            </div>
          </div>

          {/* Source Records Table */}
          <div className="cell-explainability-table-section">
            <h3 className="cell-explainability-section-title">Source Records</h3>
            <div className="cell-explainability-table-container">
              <table className="cell-explainability-table">
                <thead>
                  <tr>
                    <th className="cell-explainability-th-name">Record Name</th>
                    <th className="cell-explainability-th-object">Object</th>
                    <th className="cell-explainability-th-field">Field</th>
                    <th className="cell-explainability-th-value">Value</th>
                    <th className="cell-explainability-th-influence">Influence</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.map((record) => (
                    <tr key={record.id} className="cell-explainability-row">
                      <td className="cell-explainability-td-name">
                        <a href="#" className="cell-explainability-record-link" onClick={(e) => {
                          e.preventDefault();
                          // Could navigate to record detail page or open a popover
                        }}>
                          {record.name}
                        </a>
                      </td>
                      <td className="cell-explainability-td-object">
                        {record.object}
                      </td>
                      <td className="cell-explainability-td-field">
                        {record.field}
                      </td>
                      <td className="cell-explainability-td-value">
                        {record.value.toLocaleString()}
                      </td>
                      <td className="cell-explainability-td-influence">
                        <div className="cell-explainability-influence-display">
                          <span className="cell-explainability-influence-percentage">{record.influence.toFixed(1)}%</span>
                          <div className="cell-explainability-influence-bar">
                            <div
                              className="cell-explainability-influence-bar-fill"
                              style={{ width: `${record.influence}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="cell-explainability-modal-footer">
          <button className="cell-explainability-btn-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CellExplainabilityModal;
