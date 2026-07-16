import React, { useEffect, useRef } from 'react';
import '../styles/components/CellContextMenu.css';

interface CellContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onToggleLock: () => void;
  onMassUpdate?: () => void;
  onViewEditHistory?: () => void;
  onViewExplainability?: () => void;
  onMarkAsRead?: () => void;
  isLocked: boolean;
  canPaste: boolean;
  isEditable: boolean;
  hasMultipleSelection: boolean;
  hasApprovalSelection?: boolean;
  pendingApprovalCount?: number;
  onBulkApprove?: () => void;
  onBulkReject?: (comment: string) => void;
  onBulkRequestMoreInfo?: (comment: string) => void;
  onAddFormattingRule?: () => void;
  onRequestApproval?: () => void;
  onCellActions?: () => void;
}

const CellContextMenu: React.FC<CellContextMenuProps> = ({
  isOpen,
  position,
  onClose,
  onCopy,
  onPaste,
  onToggleLock,
  onMassUpdate,
  onViewEditHistory,
  onViewExplainability,
  onMarkAsRead,
  isLocked,
  canPaste,
  isEditable,
  hasMultipleSelection,
  hasApprovalSelection = false,
  pendingApprovalCount = 0,
  onBulkApprove,
  onBulkReject,
  onBulkRequestMoreInfo,
  onAddFormattingRule,
  onRequestApproval,
  onCellActions,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking on a menu item button
      if (target.closest('.cell-context-menu-item')) {
        return;
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = position.x;
      let adjustedY = position.y;

      if (position.x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }
      if (position.y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      menu.style.left = `${adjustedX}px`;
      menu.style.top = `${adjustedY}px`;
    }
  }, [isOpen, position]);

  if (!isOpen) return null;

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div 
      className="cell-context-menu"
      ref={menuRef}
      style={{ left: position.x, top: position.y }}
    >
      {/* Copy */}
      <button 
        className="cell-context-menu-item"
        onClick={() => handleAction(onCopy)}
      >
        <svg className="cell-context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </svg>
        <span className="cell-context-menu-label">Copy</span>
        <span className="cell-context-menu-shortcut">⌘C</span>
      </button>

      {/* Paste */}
      <button 
        className={`cell-context-menu-item ${!canPaste || !isEditable ? 'disabled' : ''}`}
        onClick={() => canPaste && isEditable && handleAction(onPaste)}
        disabled={!canPaste || !isEditable}
      >
        <svg className="cell-context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/>
        </svg>
        <span className="cell-context-menu-label">Paste</span>
        <span className="cell-context-menu-shortcut">⌘V</span>
      </button>

      <div className="cell-context-menu-separator" />

      {/* ── Actions group: Actions (bulk), View history, View Explainability ── */}

      {/* Actions - single cell: opens Cell Actions tab in right panel */}
      {!hasMultipleSelection && onCellActions && (
        <button
          className="cell-context-menu-item"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCellActions();
          }}
        >
          <svg className="cell-context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
          <span className="cell-context-menu-label">Actions</span>
        </button>
      )}

      {/* Actions - only show when multiple cells are selected */}
      {hasMultipleSelection && onMassUpdate && (
        <button
          className="cell-context-menu-item"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onMassUpdate) onMassUpdate();
          }}
        >
          <svg className="cell-context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
          <span className="cell-context-menu-label">Actions</span>
        </button>
      )}

      {/* View history - only show when single cell is selected */}
      {onViewEditHistory && !hasMultipleSelection && (
        <button
          className="cell-context-menu-item"
          onClick={() => handleAction(onViewEditHistory)}
        >
          <svg className="cell-context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
          </svg>
          <span className="cell-context-menu-label">View history</span>
        </button>
      )}

      {/* View Explainability - only show when single cell is selected */}
      {onViewExplainability && !hasMultipleSelection && (
        <button
          className="cell-context-menu-item"
          onClick={() => handleAction(onViewExplainability)}
        >
          <svg className="cell-context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          <span className="cell-context-menu-label">View Explainability</span>
        </button>
      )}

      {/* Mark as Read - only show for multi-cell selection */}
      {onMarkAsRead && hasMultipleSelection && (
        <button
          className="cell-context-menu-item"
          onClick={() => handleAction(onMarkAsRead)}
        >
          <svg className="cell-context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
          </svg>
          <span className="cell-context-menu-label">Mark as read</span>
        </button>
      )}

      <div className="cell-context-menu-separator" />

      {/* Lock/Unlock */}
      <button
        className="cell-context-menu-item"
        onClick={() => handleAction(onToggleLock)}
      >
        <svg className="cell-context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
          {isLocked ? (
            <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6zM18 20H6V10h12v10z"/>
          ) : (
            <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/>
          )}
        </svg>
        <span className="cell-context-menu-label">{isLocked ? 'Unlock Cell' : 'Lock Cell'}</span>
      </button>
    </div>
  );
};

export default CellContextMenu;

