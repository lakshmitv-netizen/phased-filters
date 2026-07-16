import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AdjustmentNote } from '../types/adjustmentNote';
import '../styles/components/CellNotePopover.css';

interface CellNotePopoverProps {
  isOpen: boolean;
  cellElement: HTMLElement | null;
  cellKey: string;
  rowId: string;
  timeKey?: string;
  measureId?: string;
  onAddNote: (note: Omit<AdjustmentNote, 'id' | 'timestamp' | 'userId' | 'userName'>) => void;
  onClose: () => void;
}

const CellNotePopover: React.FC<CellNotePopoverProps> = ({
  isOpen,
  cellElement,
  cellKey,
  rowId,
  timeKey,
  measureId,
  onAddNote,
  onClose,
}) => {
  const [noteText, setNoteText] = useState<string>('');
  const popoverRef = useRef<HTMLDivElement>(null);
  // Default position: center-right of screen
  const [position, setPosition] = useState<{ top: number; left: number }>({ 
    top: Math.max(100, window.innerHeight / 2 - 150), 
    left: Math.max(100, window.innerWidth / 2) 
  });

  // Calculate position when popover opens or cell element changes
  useEffect(() => {
    if (!isOpen) return;
    
    const updatePosition = () => {
      if (cellElement) {
        const cellRect = cellElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Position popover to the right of the cell
        let left = cellRect.right + 10;
        let top = cellRect.top + window.scrollY;

        // If not enough space on the right, position on the left
        if (left + 400 > viewportWidth) {
          left = cellRect.left - 410;
        }

        // Ensure popover stays in viewport
        if (left < 10) left = 10;
        if (top < 10) top = 10;
        if (top + 250 > viewportHeight) {
          top = viewportHeight - 260;
        }

        setPosition({ top, left });
      } else {
        // Fallback: center-right of screen
        setPosition({ 
          top: Math.max(100, window.innerHeight / 2 - 150), 
          left: Math.max(100, window.innerWidth / 2) 
        });
      }
    };

    // Set initial position immediately
    updatePosition();
    
    // Update position after popover renders
    const timer1 = setTimeout(updatePosition, 10);
    const timer2 = setTimeout(updatePosition, 100);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isOpen, cellElement]);

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        cellElement &&
        !cellElement.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, cellElement, onClose]);

  const handleSave = () => {
    if (noteText.trim()) {
      onAddNote({
        cellKey,
        rowId,
        timeKey,
        measureId,
        note: noteText.trim(),
      });
      setNoteText('');
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Enter (without Shift) saves the note
      e.preventDefault();
      handleSave();
    }
  };

  if (!isOpen) return null;

  const popoverContent = (
    <div
      ref={popoverRef}
      className="cell-note-popover"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 99999,
        display: 'block',
        visibility: 'visible',
        opacity: 1,
      }}
    >
      <div className="cell-note-popover-header">
        <h3 className="cell-note-popover-title">Adjustment Note</h3>
        <button
          className="cell-note-popover-close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="cell-note-popover-body">
        <textarea
          className="cell-note-popover-input"
          placeholder="Add note"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          autoFocus
        />
        <div className="cell-note-popover-instruction">
          Press <span className="cell-note-popover-key">Enter</span> / <span className="cell-note-popover-key">Return</span> to update your entry
        </div>
        {noteText.trim() && (
          <div className="cell-note-popover-actions">
            <button
              className="cell-note-popover-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="cell-note-popover-save"
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Render using portal to ensure it's on top
  return createPortal(popoverContent, document.body);
};

export default CellNotePopover;

