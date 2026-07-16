import React from 'react';
import '../styles/components/GridFooter.css';

interface GridFooterProps {
  isVisible: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCancel: () => void;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  impactedMeasuresCount?: number;
  showOnlyImpactedKPI?: boolean;
  onToggleShowOnlyImpactedKPI?: (checked: boolean) => void;
}

const GridFooter: React.FC<GridFooterProps> = ({
  isVisible,
  onUndo,
  onRedo,
  onCancel,
  onSave,
  canUndo,
  canRedo,
  impactedMeasuresCount = 0,
  showOnlyImpactedKPI = false,
  onToggleShowOnlyImpactedKPI,
}) => {
  console.log('[FOOTER] Rendering footer. isVisible:', isVisible);
  
  if (!isVisible) {
    console.log('[FOOTER] Footer not visible, returning null');
    return null;
  }
  
  console.log('[FOOTER] Footer visible, showing.');

  return (
    <div className="grid-footer">
      <div className="grid-footer-left">
        <button type="button" className="grid-footer-button grid-footer-button-outline" onClick={onCancel}>
          Cancel
        </button>
      </div>
      
      {impactedMeasuresCount > 0 && (
        <div className="grid-footer-center">
          <div className="grid-footer-impacted-measures">
            <svg className="grid-footer-warning-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M19.7693 16.3443L12.2115 2.1009C11.75 1.3309 10.75 1.3309 10.2885 2.1009L2.73077 16.3443C2.05769 17.4797 2.73077 19.2116 4.19231 19.2116H18.8077C20.2692 19.2116 20.9423 17.4797 20.2693 16.3443ZM10 15.2C9.34615 15.2 8.84615 14.7 8.84615 14.0462C8.84615 13.3923 9.34615 12.8923 10 12.8923C10.6538 12.8923 11.1538 13.3923 11.1538 14.0462C11.1538 14.7 10.6538 15.2 10 15.2ZM10 11.2C9.34615 11.2 8.84615 10.7 8.84615 10.0462V6.2C8.84615 5.54615 9.34615 5.04615 10 5.04615C10.6538 5.04615 11.1538 5.54615 11.1538 6.2V10.0462C11.1538 10.7 10.6538 11.2 10 11.2Z" fill="#8C4B02"/>
            </svg>
            <span className="grid-footer-warning-text">
              {impactedMeasuresCount} {impactedMeasuresCount === 1 ? 'measure' : 'measures'} impacted
            </span>
            {onToggleShowOnlyImpactedKPI && (
              <label className="grid-footer-checkbox-label">
                <input
                  type="checkbox"
                  className="grid-footer-checkbox"
                  checked={showOnlyImpactedKPI}
                  onChange={(e) => onToggleShowOnlyImpactedKPI(e.target.checked)}
                />
                <span className="grid-footer-checkbox-text">Show Only Impacted Measures</span>
              </label>
            )}
          </div>
        </div>
      )}
      
      <div className="grid-footer-right">
        <div className="grid-footer-button-group">
          <button
            type="button"
            className="grid-footer-icon-button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo"
          >
            <svg className="grid-footer-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" fill="#0250D9"/>
            </svg>
          </button>
          <button
            type="button"
            className="grid-footer-icon-button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo"
          >
            <svg className="grid-footer-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.96 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z" fill="#0250D9"/>
            </svg>
          </button>
        </div>
        <button type="button" className="grid-footer-button grid-footer-button-brand" onClick={onSave}>
          Save Changes
        </button>
      </div>
    </div>
  );
};

export default GridFooter;

