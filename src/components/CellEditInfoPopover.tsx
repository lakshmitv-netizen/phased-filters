import React, { useLayoutEffect } from 'react';
import { CellEditHistoryEntry } from '../types/editHistory';
import '../styles/components/CellEditInfoPopover.css';

interface CellEditInfoPopoverProps {
  entry: CellEditHistoryEntry;
  position: { top: number; left: number };
  isLocked?: boolean;
  lockedValue?: number;
  measureName?: string; // Measure name to determine if $ symbol should be added
  approvalSummary?: {
    approvedCount: number;
    requestedCount: number;
  };
  onViewHistory: () => void;
  onMarkAsRead?: () => void;
  onClose: () => void;
}

const CellEditInfoPopover: React.FC<CellEditInfoPopoverProps> = ({
  entry,
  position,
  isLocked = false,
  lockedValue,
  measureName,
  approvalSummary,
  onViewHistory,
  onMarkAsRead,
  onClose,
}) => {
  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(date));
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined) return '-';
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    
    // Add $ symbol for revenue/currency measures (but not for quantities or percentages)
    if (measureName) {
      const nameLower = measureName.toLowerCase();
      const isRevenue = nameLower.includes('revenue') || 
                       nameLower.includes('spend') && !nameLower.includes('%') ||
                       nameLower === 'revenue';
      // Don't add $ for percentages, ROI multipliers, or quantities
      const isPercentage = nameLower.includes('%') || nameLower.includes('percent');
      const isROI = nameLower.includes('roi');
      const isQuantity = nameLower.includes('quantity');
      
      if (isRevenue && !isPercentage && !isROI && !isQuantity) {
        return `$${formatted}`;
      }
    }
    
    return formatted;
  };

  // Get user initials
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const hasEdit = entry.oldValue !== undefined && entry.newValue !== undefined && entry.oldValue !== entry.newValue;
  const delta = hasEdit ? (entry.newValue! - entry.oldValue!) : 0;
  const isIncrease = delta > 0;
  const hasNote = entry.note && entry.note.trim() !== '';
  /** Show value line for a real delta or for locked state (previously gated only on hasEdit, which hid locked-only). */
  const showValueLine = hasEdit || (isLocked && lockedValue !== undefined);
  const hasSecondaryContent =
    hasNote || !!approvalSummary || !!entry.disaggregationRule;
  const showEmptyFallback = !showValueLine && !hasSecondaryContent;

  useLayoutEffect(() => {
    if (showEmptyFallback) {
      onClose();
    }
  }, [showEmptyFallback, onClose]);

  if (showEmptyFallback) {
    return null;
  }

  // Build the change description like the side panel
  const getChangeDescription = () => {
    // For locked cells, show "Locked at {value}"
    if (isLocked && lockedValue !== undefined) {
      return (
        <>
          Locked at <strong>{formatNumber(lockedValue)}</strong>
        </>
      );
    }

    // Only show change description if there's an actual edit
    const action = isIncrease ? 'Increased' : 'Decreased';
    return (
      <>
        {action} from <strong>{formatNumber(entry.oldValue)}</strong> to <strong>{formatNumber(entry.newValue)}</strong>{' '}
        <span className={`cell-edit-info-delta ${isIncrease ? 'increase' : 'decrease'}`}>
          ({isIncrease ? '+' : ''}{formatNumber(delta)})
        </span>
      </>
    );
  };

  return (
    <div 
      className="cell-edit-info-popover"
      style={{ top: position.top, left: position.left }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <div className="cell-edit-info-popover-nubbin"></div>

      {/* Header row with avatar */}
      <div className="cell-edit-info-header">
        <div className="cell-edit-info-avatar">
          {getInitials(entry.userName)}
        </div>
        <div className="cell-edit-info-header-content">
          <span className="cell-edit-info-username">{entry.userName}</span>
          <span className="cell-edit-info-timestamp">{formatTimestamp(entry.timestamp)}</span>
        </div>
      </div>
      
      {/* Value / lock / delta — not only when hasEdit, so locked cells and fallbacks behave */}
      {showValueLine && (
        <div className="cell-edit-info-change-text">
          {getChangeDescription()}
        </div>
      )}

      {approvalSummary && (
        <div className="ascp-summary-line">
          <strong>{approvalSummary.approvedCount}/{approvalSummary.requestedCount}</strong> approved
        </div>
      )}

      {/* Disaggregation Rule - show if present */}
      {entry.disaggregationRule && (
        <div className="cell-edit-info-disaggregation-rule">
          <span className="cell-edit-info-disaggregation-rule-label">Disaggregation Rule:</span>
          <span className="cell-edit-info-disaggregation-rule-value">{entry.disaggregationRule}</span>
        </div>
      )}

      {/* Note section — italic quote */}
      {hasNote && (
        <div className="cell-edit-info-note">
          <span className="cell-edit-info-note-text">
            "{entry.note!.length > 100 ? entry.note!.slice(0, 100) + '...' : entry.note}"
          </span>
        </div>
      )}

      {/* Mark as read and View history buttons */}
      <div className="cell-edit-info-separator"></div>
      <div className="cell-edit-info-actions">
        {onMarkAsRead && (
          <>
            <button className="cell-edit-info-mark-read-btn" onClick={onMarkAsRead}>
              Mark as read
            </button>
            <div className="cell-edit-info-actions-separator"></div>
          </>
        )}
        <button className="cell-edit-info-history-btn" onClick={onViewHistory}>
          View history
        </button>
      </div>
      
      {/* Close button */}
      <button className="cell-edit-info-close" onClick={onClose} title="Close">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
        </svg>
      </button>
    </div>
  );
};

export default CellEditInfoPopover;
