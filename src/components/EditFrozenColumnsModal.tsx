import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/EditFrozenColumnsModal.css';

export interface FrozenColumn {
  id: string;
  name: string;
}

interface EditFrozenColumnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableColumns: FrozenColumn[];
  selectedColumns: FrozenColumn[];
  onSave: (selectedColumns: FrozenColumn[]) => void;
}

const EditFrozenColumnsModal: React.FC<EditFrozenColumnsModalProps> = ({
  isOpen,
  onClose,
  availableColumns,
  selectedColumns: initialSelectedColumns,
  onSave
}) => {
  const [selected, setSelected] = useState<FrozenColumn[]>([]);
  const [leftHighlighted, setLeftHighlighted] = useState<Set<string>>(new Set());
  const [rightHighlighted, setRightHighlighted] = useState<Set<string>>(new Set());
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelected(initialSelectedColumns.length > 0 ? [...initialSelectedColumns] : []);
      setLeftHighlighted(new Set());
      setRightHighlighted(new Set());
    }
  }, [isOpen, initialSelectedColumns]);

  const available = availableColumns.filter(col => !selected.find(s => s.id === col.id));

  const moveToSelected = () => {
    const toAdd = available.filter(col => leftHighlighted.has(col.id));
    setSelected(prev => [...prev, ...toAdd]);
    setLeftHighlighted(new Set());
  };

  const moveToAvailable = () => {
    setSelected(prev => prev.filter(col => !rightHighlighted.has(col.id)));
    setRightHighlighted(new Set());
  };

  const moveAllToSelected = () => {
    setSelected([...availableColumns]);
    setLeftHighlighted(new Set());
    setRightHighlighted(new Set());
  };

  const moveAllToAvailable = () => {
    setSelected([]);
    setLeftHighlighted(new Set());
    setRightHighlighted(new Set());
  };

  const moveUp = () => {
    const newSelected = [...selected];
    const indices = newSelected
      .map((col, i) => rightHighlighted.has(col.id) ? i : -1)
      .filter(i => i > 0);
    indices.forEach(i => {
      [newSelected[i - 1], newSelected[i]] = [newSelected[i], newSelected[i - 1]];
    });
    setSelected(newSelected);
  };

  const moveDown = () => {
    const newSelected = [...selected];
    const indices = newSelected
      .map((col, i) => rightHighlighted.has(col.id) ? i : -1)
      .filter(i => i >= 0 && i < newSelected.length - 1)
      .reverse();
    indices.forEach(i => {
      [newSelected[i], newSelected[i + 1]] = [newSelected[i + 1], newSelected[i]];
    });
    setSelected(newSelected);
  };

  const toggleLeft = (id: string, e: React.MouseEvent) => {
    const next = new Set(leftHighlighted);
    if (e.ctrlKey || e.metaKey) {
      next.has(id) ? next.delete(id) : next.add(id);
    } else {
      if (next.has(id) && next.size === 1) {
        next.clear();
      } else {
        next.clear();
        next.add(id);
      }
    }
    setLeftHighlighted(next);
    setRightHighlighted(new Set());
  };

  const toggleRight = (id: string, e: React.MouseEvent) => {
    const next = new Set(rightHighlighted);
    if (e.ctrlKey || e.metaKey) {
      next.has(id) ? next.delete(id) : next.add(id);
    } else {
      if (next.has(id) && next.size === 1) {
        next.clear();
      } else {
        next.clear();
        next.add(id);
      }
    }
    setRightHighlighted(next);
    setLeftHighlighted(new Set());
  };

  const handleSave = () => onSave(selected);
  const handleCancel = () => onClose();

  const canMoveUp = rightHighlighted.size > 0 && selected.some((col, i) => i > 0 && rightHighlighted.has(col.id));
  const canMoveDown = rightHighlighted.size > 0 && selected.some((col, i) => i < selected.length - 1 && rightHighlighted.has(col.id));

  if (!isOpen) return null;

  return createPortal(
    <div className="edit-frozen-columns-modal-overlay">
      <div className="edit-frozen-columns-modal" ref={modalRef}>
        <div className="edit-frozen-columns-modal-header">
          <h2 className="edit-frozen-columns-modal-title">Configure Row Info</h2>
          <button type="button" className="edit-frozen-columns-modal-close" onClick={handleCancel} aria-label="Close">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="edit-frozen-columns-modal-body">
          <div className="duelling-picklist">
            {/* Left panel - Available */}
            <div className="duelling-picklist-panel">
              <div className="duelling-picklist-panel-header">
                <span className="duelling-picklist-panel-title">Available Columns</span>
              </div>
              <ul className="duelling-picklist-list" role="listbox" aria-multiselectable="true">
                {available.length === 0 && (
                  <li className="duelling-picklist-empty">All columns selected</li>
                )}
                {available.map(col => (
                  <li
                    key={col.id}
                    role="option"
                    aria-selected={leftHighlighted.has(col.id)}
                    className={`duelling-picklist-item${leftHighlighted.has(col.id) ? ' selected' : ''}`}
                    onClick={e => toggleLeft(col.id, e)}
                    onDoubleClick={e => { toggleLeft(col.id, e); setTimeout(moveToSelected, 0); }}
                  >
                    {col.name}
                  </li>
                ))}
              </ul>
            </div>

            {/* Move left/right buttons */}
            <div className="duelling-picklist-actions">
              <button
                type="button"
                className="duelling-picklist-btn"
                title="Move to selected"
                onClick={moveToSelected}
                disabled={leftHighlighted.size === 0}
              >
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                type="button"
                className="duelling-picklist-btn"
                title="Move to available"
                onClick={moveToAvailable}
                disabled={rightHighlighted.size === 0}
              >
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Right panel - Selected */}
            <div className="duelling-picklist-panel">
              <div className="duelling-picklist-panel-header">
                <span className="duelling-picklist-panel-title">Selected Columns</span>
              </div>
              <ul className="duelling-picklist-list" role="listbox" aria-multiselectable="true">
                {selected.length === 0 && (
                  <li className="duelling-picklist-empty">No columns selected</li>
                )}
                {selected.map(col => (
                  <li
                    key={col.id}
                    role="option"
                    aria-selected={rightHighlighted.has(col.id)}
                    className={`duelling-picklist-item${rightHighlighted.has(col.id) ? ' selected' : ''}`}
                    onClick={e => toggleRight(col.id, e)}
                    onDoubleClick={e => { toggleRight(col.id, e); setTimeout(moveToAvailable, 0); }}
                  >
                    {col.name}
                  </li>
                ))}
              </ul>
            </div>

            {/* Up/down reorder buttons */}
            <div className="duelling-picklist-order">
              <button
                type="button"
                className="duelling-picklist-btn"
                title="Move up"
                onClick={moveUp}
                disabled={!canMoveUp}
              >
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                type="button"
                className="duelling-picklist-btn"
                title="Move down"
                onClick={moveDown}
                disabled={!canMoveDown}
              >
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

          <p className="duelling-picklist-hint">
            Click to select · Ctrl+click for multi-select · Double-click to move · Drag order with ↑↓ buttons
          </p>
        </div>

        <div className="edit-frozen-columns-modal-footer">
          <button type="button" className="edit-frozen-columns-modal-button edit-frozen-columns-modal-button-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="edit-frozen-columns-modal-button edit-frozen-columns-modal-button-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EditFrozenColumnsModal;
