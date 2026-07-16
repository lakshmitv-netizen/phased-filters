import React, { useState } from 'react';
import { CellEditHistoryEntry } from '../types/editHistory';
import '../styles/components/CellEditHistoryCard.css';

interface CardReply {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: Date;
}

interface CellEditHistoryCardProps {
  entry: CellEditHistoryEntry;
  replies?: CardReply[];
  onAddReply?: (entryId: string, message: string) => void;
  isLast?: boolean;
  isFirst?: boolean;
  cellContext?: string; // e.g., "Chassis Components · Aug 2026 · Sales Agreement Quantity"
  cellContextAsHeader?: boolean; // If true, show cell context as primary header (for multi-cell mode)
  threadColor?: string; // Custom thread color for the timeline line
  dimensionType?: 'account' | 'category' | 'product'; // Dimension type for icon display
  onViewAllChanges?: () => void; // Callback for "View all changes" in multi-cell mode
  editCountForCell?: number; // Number of edits for this cell (to show "View all X changes")
  fullHierarchyPath?: string; // Full hierarchy path for tooltip (e.g., "MagnaDrive > Chassis Components > CHS-100-A")
  measureName?: string; // Measure name to determine if $ symbol should be added
}

const CellEditHistoryCard: React.FC<CellEditHistoryCardProps> = ({ entry, replies = [], onAddReply, isLast = false, isFirst = false, cellContext, cellContextAsHeader = false, threadColor, dimensionType, onViewAllChanges, editCountForCell, fullHierarchyPath, measureName }) => {
  const [isExpanded, setIsExpanded] = useState(isFirst);
  const [replyText, setReplyText] = useState('');
  const [showHierarchyTooltip, setShowHierarchyTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const hierarchyInfoRef = React.useRef<HTMLDivElement>(null);
  
  // Only consider it an "edit" if values are defined AND actually different
  const hasEdit = entry.oldValue !== undefined && entry.newValue !== undefined && entry.oldValue !== entry.newValue;
  const hasNote = !!(entry.note && entry.note.trim() !== '');
  const hasReplies = replies.length > 0;
  
  const APPROVAL_STATUS_LABELS = ['Not Submitted', 'Pending', 'Approved', 'Rejected'];
  // Check if this is an approval status change entry (note starts with a known status label followed by " →")
  const isApprovalStatusChange = hasNote && APPROVAL_STATUS_LABELS.some(label => entry.note!.startsWith(`${label} →`));
  
  // Parse approval status change note
  let approvalStatusChange: { oldStatus: string; newStatus: string; comment: string } | null = null;
  if (isApprovalStatusChange && entry.note) {
    // Match patterns like "Pending → Approved: comment" or "Info Req. → Rejected: comment"
    const match = entry.note.match(/^([^→]+)\s*→\s*([^:]+)(?::\s*(.+))?$/);
    if (match) {
      approvalStatusChange = {
        oldStatus: match[1].trim(),
        newStatus: match[2].trim(),
        comment: match[3] ? match[3].trim() : '',
      };
    }
  }
  
  // Helper to normalize status name for CSS class
  const normalizeStatusForClass = (status: string): string => {
    const normalized = status.toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
    // Map legacy/invalid statuses to notSubmitted
    if (normalized === 'needsmoreinfo' || normalized === 'modificationsuggested' || normalized === 'indiscussion') {
      return 'notsubmitted';
    }
    return normalized;
  };
  
  // Only calculate delta if we have both values
  const delta = hasEdit ? (entry.newValue! - entry.oldValue!) : 0;
  const isIncrease = delta > 0;
  
  // Helper function to format numbers with $ symbol for revenue measures
  const formatCurrencyValue = (value: number): string => {
    const formatted = value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
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
  
  const formattedOldValue = hasEdit ? formatCurrencyValue(entry.oldValue!) : '';
  const formattedNewValue = hasEdit ? formatCurrencyValue(entry.newValue!) : '';
  const formattedDelta = hasEdit ? formatCurrencyValue(Math.abs(delta)) : '';

  // Get user initials from name
  const getUserInitials = (name: string): string => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Format full timestamp with date and time
  const formatFullTimestamp = (date: Date): string => {
    const timestamp = date instanceof Date ? date : new Date(date);
    return timestamp.toLocaleString('en-US', { 
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Format timestamp for replies
  const formatReplyTimestamp = (date: Date): string => {
    const timestamp = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return timestamp.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  const handleSubmitReply = () => {
    if (replyText.trim() && onAddReply) {
      onAddReply(entry.id, replyText.trim());
      setReplyText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitReply();
    }
    if (e.key === 'Escape') {
      setReplyText('');
    }
  };

  // Use "John Carter" as the user name, initials "JC"
  const userName = entry.userName || 'John Carter';
  const userInitials = getUserInitials(userName);

  // For note-only entries, show a truncated preview
  const isNoteOnly = !hasEdit && hasNote;
  const notePreviewLength = 40;
  const truncatedNote = hasNote && entry.note!.length > notePreviewLength 
    ? entry.note!.substring(0, notePreviewLength) + '...' 
    : entry.note;
  const needsSeeMore = hasNote && entry.note!.length > notePreviewLength;

  return (
    <div className={`sf-timeline-item ${isExpanded ? 'expanded' : ''}`}>
      {/* Left side: Expand arrow + Avatar + Line */}
      <div className="sf-timeline-left">
        <div className="sf-timeline-left-row">
          {/* Always show expand button so user can access comments */}
          <button 
            className="sf-timeline-expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              {isExpanded ? (
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
              ) : (
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
              )}
            </svg>
          </button>
          <div className="sf-timeline-avatar" style={threadColor ? { backgroundColor: threadColor } : undefined}>
            {cellContextAsHeader && dimensionType ? (
              /* Multi-cell mode: Show dimension icon */
              <span className="sf-timeline-avatar-icon">
                {dimensionType === 'account' && (
                  <svg width="14" height="12" viewBox="0 0 31 26" fill="currentColor">
                    <path d="M30.9965 13.585C31.061 12.48 30.2216 12.155 29.8987 12.155H18.275C17.2418 12.155 17.1126 13.26 17.1126 13.325V26H30.9965V13.585ZM22.989 22.685C22.989 23.27 22.537 23.79 21.8913 23.79H20.7935C20.2123 23.79 19.6957 23.27 19.6957 22.685V21.58C19.6957 20.995 20.1477 20.475 20.7935 20.475H21.8913C22.4724 20.475 22.989 20.995 22.989 21.58V22.685ZM22.989 17.16C22.989 17.745 22.537 18.265 21.8913 18.265H20.7935C20.2123 18.265 19.6957 17.745 19.6957 17.16V16.055C19.6957 15.47 20.1477 14.95 20.7935 14.95H21.8913C22.4724 14.95 22.989 15.47 22.989 16.055V17.16ZM28.3489 22.685C28.3489 23.27 27.8968 23.79 27.2511 23.79H26.1533C25.5721 23.79 25.0555 23.27 25.0555 22.685V21.58C25.0555 20.995 25.5075 20.475 26.1533 20.475H27.2511C27.8322 20.475 28.3489 20.995 28.3489 21.58V22.685ZM28.3489 17.16C28.3489 17.745 27.8968 18.265 27.2511 18.265H26.1533C25.5721 18.265 25.0555 17.745 25.0555 17.16V16.055C25.0555 15.47 25.5075 14.95 26.1533 14.95H27.2511C27.8322 14.95 28.3489 15.47 28.3489 16.055V17.16ZM20.2769 7.735V1.43C20.3414 0.325 19.5665 0 19.2436 0H1.16237C0.129152 0 0 1.105 0 1.17V26H13.8838V10.14C13.8838 10.14 13.8838 8.84 15.0462 8.84H19.2436C19.8894 8.84 20.2769 8.19 20.2769 7.735ZM5.87641 22.165C5.87641 22.75 5.42438 23.27 4.77862 23.27H3.74541C3.16422 23.27 2.64762 22.75 2.64762 22.165V21.06C2.64762 20.475 3.09965 19.955 3.74541 19.955H4.8432C5.42438 19.955 5.94099 20.475 5.94099 21.06V22.165H5.87641ZM5.87641 16.575C5.87641 17.16 5.42438 17.68 4.77862 17.68H3.74541C3.16422 17.68 2.64762 17.16 2.64762 16.575V15.47C2.64762 14.885 3.09965 14.365 3.74541 14.365H4.8432C5.42438 14.365 5.94099 14.885 5.94099 15.47V16.575H5.87641ZM5.87641 11.05C5.87641 11.635 5.42438 12.155 4.77862 12.155H3.74541C3.16422 12.155 2.64762 11.635 2.64762 11.05V9.945C2.64762 9.36 3.09965 8.84 3.74541 8.84H4.8432C5.42438 8.84 5.94099 9.36 5.94099 9.945V11.05H5.87641ZM5.87641 5.525C5.87641 6.11 5.42438 6.63 4.77862 6.63H3.74541C3.16422 6.63 2.64762 6.11 2.64762 5.525V4.42C2.64762 3.835 3.09965 3.315 3.74541 3.315H4.8432C5.42438 3.315 5.94099 3.835 5.94099 4.42V5.525H5.87641ZM11.7528 22.165C11.7528 22.75 11.3008 23.27 10.655 23.27H9.55725C8.97606 23.27 8.45945 22.75 8.45945 22.165V21.06C8.45945 20.475 8.91149 19.955 9.55725 19.955H10.655C11.2362 19.955 11.7528 20.475 11.7528 21.06V22.165ZM11.7528 16.575C11.7528 17.16 11.3008 17.68 10.655 17.68H9.55725C8.97606 17.68 8.45945 17.16 8.45945 16.575V15.47C8.45945 14.885 8.91149 14.365 9.55725 14.365H10.655C11.2362 14.365 11.7528 14.885 11.7528 15.47V16.575ZM11.7528 11.05C11.7528 11.635 11.3008 12.155 10.655 12.155H9.55725C8.97606 12.155 8.45945 11.635 8.45945 11.05V9.945C8.45945 9.36 8.91149 8.84 9.55725 8.84H10.655C11.2362 8.84 11.7528 9.36 11.7528 9.945V11.05ZM11.7528 5.525C11.7528 6.11 11.3008 6.63 10.655 6.63H9.55725C8.97606 6.63 8.45945 6.11 8.45945 5.525V4.42C8.45945 3.835 8.91149 3.315 9.55725 3.315H10.655C11.2362 3.315 11.7528 3.835 11.7528 4.42V5.525ZM17.6292 5.525C17.6292 6.11 17.1772 6.63 16.5315 6.63H15.4982C14.9171 6.63 14.4004 6.11 14.4004 5.525V4.42C14.4004 3.835 14.8525 3.315 15.4982 3.315H16.596C17.1772 3.315 17.6938 3.835 17.6938 4.42V5.525H17.6292Z"/>
                  </svg>
                )}
                {dimensionType === 'category' && (
                  <svg width="14" height="14" viewBox="0 0 27 27" fill="currentColor">
                    <path d="M18.81 4.23L22.815 8.235C23.715 9.09 23.715 10.53 22.815 11.385L12.375 21.78V7.47L15.615 4.185C15.8271 3.97703 16.0783 3.81312 16.3541 3.70274C16.6299 3.59235 16.9248 3.53768 17.2219 3.54186C17.5189 3.54604 17.8122 3.60901 18.0848 3.72711C18.3573 3.84522 18.6038 4.01614 18.81 4.23ZM7.875 0H2.25C1.65326 0 1.08097 0.237053 0.65901 0.65901C0.237053 1.08097 0 1.65326 0 2.25V21.96C-9.86251e-09 22.6219 0.130363 23.2772 0.383647 23.8887C0.636931 24.5002 1.00817 25.0558 1.47618 25.5238C1.94419 25.9918 2.49979 26.3631 3.11128 26.6164C3.72276 26.8696 4.37814 27 5.04 27C5.70186 27 6.35724 26.8696 6.96872 26.6164C7.5802 26.3631 8.13581 25.9918 8.60382 25.5238C9.07182 25.0558 9.44307 24.5002 9.69635 23.8887C9.94964 23.2772 10.08 22.6219 10.08 21.96V2.25C10.125 0.99 9.09 0 7.875 0ZM5.04 24.21C3.78 24.21 2.79 23.22 2.79 21.96C2.79 20.7 3.78 19.71 5.04 19.71C6.3 19.71 7.29 20.7 7.29 21.96C7.29 23.22 6.3 24.21 5.04 24.21ZM24.75 16.875H20.79L18.09 19.575H24.3L24.255 24.3H13.41L10.71 27H24.75C25.3467 27 25.919 26.7629 26.341 26.341C26.7629 25.919 27 25.3467 27 24.75V19.125C27 18.5283 26.7629 17.956 26.341 17.534C25.919 17.1121 25.3467 16.875 24.75 16.875Z"/>
                  </svg>
                )}
                {dimensionType === 'product' && (
                  <svg width="14" height="13" viewBox="0 0 27 26" fill="currentColor">
                    <path d="M0.9 20.6207H3.15C3.645 20.6207 4.05 20.2172 4.05 19.7241V5.82759C4.05 5.33448 3.645 4.93103 3.15 4.93103H0.9C0.405 4.93103 0 5.33448 0 5.82759V19.7241C0 20.2172 0.405 20.6207 0.9 20.6207ZM26.1 4.93103H23.85C23.355 4.93103 22.95 5.33448 22.95 5.82759V19.7241C22.95 20.2172 23.355 20.6207 23.85 20.6207H26.1C26.595 20.6207 27 20.2172 27 19.7241V5.82759C27 5.33448 26.595 4.93103 26.1 4.93103ZM14.85 20.6207C15.345 20.6207 15.75 20.2172 15.75 19.7241V5.82759C15.75 5.33448 15.345 4.93103 14.85 4.93103H12.15C11.655 4.93103 11.25 5.33448 11.25 5.82759V19.7241C11.25 20.2172 11.655 20.6207 12.15 20.6207H14.85ZM20.25 20.6207C20.745 20.6207 21.15 20.2172 21.15 19.7241V5.82759C21.15 5.33448 20.745 4.93103 20.25 4.93103H19.35C18.855 4.93103 18.45 5.33448 18.45 5.82759V19.7241C18.45 20.2172 18.855 20.6207 19.35 20.6207H20.25ZM8.55 20.6207C9.045 20.6207 9.45 20.2172 9.45 19.7241V5.82759C9.45 5.33448 9.045 4.93103 8.55 4.93103H7.65C7.155 4.93103 6.75 5.33448 6.75 5.82759V19.7241C6.75 20.2172 7.155 20.6207 7.65 20.6207H8.55ZM26.1 23.3103H0.9C0.405 23.3103 0 23.7138 0 24.2069V25.1034C0 25.5966 0.405 26 0.9 26H26.1C26.595 26 27 25.5966 27 25.1034V24.2069C27 23.7138 26.595 23.3103 26.1 23.3103ZM26.1 0H0.9C0.405 0 0 0.403448 0 0.896552V1.7931C0 2.28621 0.405 2.68966 0.9 2.68966H26.1C26.595 2.68966 27 2.28621 27 1.7931V0.896552C27 0.403448 26.595 0 26.1 0Z"/>
                  </svg>
                )}
              </span>
            ) : (
              /* Single-cell mode: Show user initials */
            <span className="sf-timeline-avatar-initials">{userInitials}</span>
            )}
          </div>
        </div>
        {!isLast && <div className="sf-timeline-line" style={threadColor ? { backgroundColor: threadColor } : undefined}></div>}
      </div>
      
      {/* Right side: Content */}
      <div className="sf-timeline-content">
        {/* Header Row */}
        <div className="sf-timeline-header">
          {cellContextAsHeader && cellContext ? (
            /* Multi-cell mode: Cell context as primary header */
            <>
              <div className="sf-timeline-cell-context-header-row">
                <span className="sf-timeline-cell-context-header">{cellContext}</span>
                {fullHierarchyPath && (
                  <div 
                    className="sf-timeline-hierarchy-info-wrapper"
                    ref={hierarchyInfoRef}
                    onMouseEnter={() => {
                      if (hierarchyInfoRef.current) {
                        const rect = hierarchyInfoRef.current.getBoundingClientRect();
                        const tooltipWidth = 300;
                        const tooltipHeight = 100; // Approximate height
                        const viewportWidth = window.innerWidth;
                        const viewportHeight = window.innerHeight;
                        
                        // Calculate position - prefer left side to avoid right edge clipping
                        let left = rect.left - tooltipWidth + rect.width;
                        let top = rect.bottom + 8;
                        
                        // Ensure tooltip stays within viewport
                        if (left < 8) {
                          left = rect.right + 8; // Position to the right if not enough space on left
                        }
                        if (left + tooltipWidth > viewportWidth - 8) {
                          left = viewportWidth - tooltipWidth - 8;
                        }
                        if (top + tooltipHeight > viewportHeight - 8) {
                          top = rect.top - tooltipHeight - 8; // Position above if not enough space below
                        }
                        
                        setTooltipPosition({
                          top: top + window.scrollY,
                          left: left + window.scrollX
                        });
                      }
                      setShowHierarchyTooltip(true);
                    }}
                    onMouseLeave={() => {
                      setShowHierarchyTooltip(false);
                      setTooltipPosition(null);
                    }}
                  >
                    <button
                      className="sf-timeline-hierarchy-info-btn"
                      onFocus={() => {
                        if (hierarchyInfoRef.current) {
                          const rect = hierarchyInfoRef.current.getBoundingClientRect();
                          const tooltipWidth = 300;
                          const tooltipHeight = 100;
                          const viewportWidth = window.innerWidth;
                          const viewportHeight = window.innerHeight;
                          
                          let left = rect.left - tooltipWidth + rect.width;
                          let top = rect.bottom + 8;
                          
                          if (left < 8) {
                            left = rect.right + 8;
                          }
                          if (left + tooltipWidth > viewportWidth - 8) {
                            left = viewportWidth - tooltipWidth - 8;
                          }
                          if (top + tooltipHeight > viewportHeight - 8) {
                            top = rect.top - tooltipHeight - 8;
                          }
                          
                          setTooltipPosition({
                            top: top + window.scrollY,
                            left: left + window.scrollX
                          });
                        }
                        setShowHierarchyTooltip(true);
                      }}
                      onBlur={() => {
                        setShowHierarchyTooltip(false);
                        setTooltipPosition(null);
                      }}
                      aria-label="Show full hierarchy"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 16v-4M12 8h.01"/>
                      </svg>
                    </button>
                    {showHierarchyTooltip && tooltipPosition && (
                      <div 
                        className="sf-timeline-hierarchy-tooltip"
                        style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }}
                      >
                        <div className="sf-timeline-hierarchy-tooltip-nubbin"></div>
                        <span>{fullHierarchyPath}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="sf-timeline-user-row">
                <span className="sf-timeline-username-secondary">{userName}</span>
                <span className="sf-timeline-timestamp">{formatFullTimestamp(entry.timestamp)}</span>
              </div>
            </>
          ) : (
            /* Single-cell mode: User as primary header */
            <>
          <div className="sf-timeline-title-row">
            <span className="sf-timeline-username">{userName}</span>
            <span className="sf-timeline-timestamp">{formatFullTimestamp(entry.timestamp)}</span>
          </div>
              {cellContext && (
                <div className="sf-timeline-cell-context">{cellContext}</div>
              )}
            </>
          )}
          <div className="sf-timeline-subtitle">
            {hasEdit ? (
              // Edit with or without note - show edit info
              <div>
                <span className="sf-timeline-edit-info">
                  {isIncrease ? 'Increased' : 'Decreased'} from <strong>{formattedOldValue}</strong> to <strong>{formattedNewValue}</strong> <span className={`sf-timeline-delta ${isIncrease ? 'increase' : 'decrease'}`}>({isIncrease ? '+' : '-'}{formattedDelta})</span>
                  {hasNote && (
                    <button 
                      className="sf-timeline-see-note-btn"
                      onClick={() => setIsExpanded(!isExpanded)}
                    >
                      {isExpanded ? 'Hide note' : 'See note'}
                    </button>
                  )}
                </span>
                {/* Show note inline in white region when expanded */}
                {hasNote && isExpanded && (
                  <div className="sf-timeline-note-preview" style={{ marginTop: '4px' }}>
                    <span className="sf-timeline-note-text">{entry.note}</span>
                  </div>
                )}
              </div>
            ) : isApprovalStatusChange && approvalStatusChange ? (
              // Approval status change - show status badges
              <div className="sf-timeline-approval-status-change">
                <span className={`sf-timeline-approval-badge sf-timeline-approval-badge--${normalizeStatusForClass(approvalStatusChange.oldStatus)}`}>
                  {approvalStatusChange.oldStatus}
                </span>
                <span className="sf-timeline-approval-arrow">→</span>
                <span className={`sf-timeline-approval-badge sf-timeline-approval-badge--${normalizeStatusForClass(approvalStatusChange.newStatus)}`}>
                  {approvalStatusChange.newStatus}
                </span>
                {approvalStatusChange.comment && (
                  <span className="sf-timeline-approval-comment">{approvalStatusChange.comment}</span>
                )}
              </div>
            ) : isNoteOnly ? (
              // Note only - show truncated preview or full note when expanded
              <div className="sf-timeline-note-preview">
                <span className="sf-timeline-note-text">
                  {isExpanded ? entry.note : truncatedNote}
                </span>
                {needsSeeMore && (
                  <button 
                    className="sf-timeline-see-more-btn"
                    onClick={() => setIsExpanded(!isExpanded)}
                  >
                    {isExpanded ? 'see less' : 'see more'}
                  </button>
                )}
              </div>
            ) : (
              <>Added a note with value unchanged</>
            )}
          </div>
          
          {/* View all changes button for multi-cell mode */}
          {onViewAllChanges && editCountForCell && editCountForCell > 1 && (
            <button 
              className="sf-timeline-view-all-btn"
              onClick={onViewAllChanges}
            >
              View all {editCountForCell} changes
            </button>
          )}
        </div>
        
        {/* Expanded Details */}
        {isExpanded && (
          <div className="sf-timeline-details">
            {/* Discussion - always show for threaded comments */}
            <div className="sf-timeline-discussion">
              {hasReplies && (
                <div className="sf-timeline-replies">
                  {replies.map((reply) => (
                    <div key={reply.id} className="sf-timeline-reply">
                      <div className="sf-timeline-reply-avatar">
                        {getUserInitials(reply.userName)}
                      </div>
                      <div className="sf-timeline-reply-content">
                        <span className="sf-timeline-reply-username">{reply.userName}</span>
                        <span className="sf-timeline-reply-message">{reply.message}</span>
                        <span className="sf-timeline-reply-timestamp">
                          {formatReplyTimestamp(reply.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Reply Input */}
              <div className="sf-timeline-reply-input">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add a comment..."
                />
                <button 
                  className="sf-timeline-post-btn"
                  onClick={handleSubmitReply}
                  disabled={!replyText.trim()}
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CellEditHistoryCard;
