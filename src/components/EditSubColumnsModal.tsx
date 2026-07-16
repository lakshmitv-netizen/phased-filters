import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { evaluateFormulaExpression } from '../utils/conditionalFormattingUtils';
import '../styles/components/EditSubColumnsModal.css';

export interface SubColumn {
  id: string;
  name: string;
  formula?: string;
  isCustom?: boolean;
  showOnGrid?: boolean;
}

interface EditSubColumnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableColumns: SubColumn[];
  selectedColumns: SubColumn[];
  fixedColumns?: SubColumn[];
  customColumns?: SubColumn[];
  onSave: (selectedColumns: SubColumn[], customColumns: SubColumn[]) => void;
}

const EditSubColumnsModal: React.FC<EditSubColumnsModalProps> = ({
  isOpen,
  onClose,
  availableColumns,
  selectedColumns: initialSelectedColumns,
  fixedColumns = [],
  customColumns: initialCustomColumns = [],
  onSave
}) => {
  const [selected, setSelected] = useState<SubColumn[]>([]);
  const [customColumns, setCustomColumns] = useState<SubColumn[]>([]);
  const [activeTab, setActiveTab] = useState<'picklist' | 'custom'>('picklist');
  const [leftHighlighted, setLeftHighlighted] = useState<Set<string>>(new Set());
  const [rightHighlighted, setRightHighlighted] = useState<Set<string>>(new Set());
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Ensure fixed columns are always included and at the top
      const fixedIds = new Set(fixedColumns.map(col => col.id));
      const nonFixedSelected = initialSelectedColumns.filter(col => !fixedIds.has(col.id));
      const merged = [...fixedColumns, ...nonFixedSelected];
      setSelected(merged.length > 0 ? merged : fixedColumns);
      setCustomColumns(initialCustomColumns);
      setActiveTab('picklist');
      setLeftHighlighted(new Set());
      setRightHighlighted(new Set());
    }
  }, [isOpen, initialSelectedColumns, fixedColumns, initialCustomColumns]);

  const fixedIds = new Set(fixedColumns.map(col => col.id));

  const available = availableColumns.filter(col => !selected.find(s => s.id === col.id));

  const validateFormula = (formula: string): boolean => {
    const f = formula.trim();
    if (!f) return false;
    return evaluateFormulaExpression(f, 100, [80, 100, 120], 'product-trn-a', 'jan2026') !== null;
  };

  const moveToSelected = () => {
    const toAdd = available.filter(col => leftHighlighted.has(col.id));
    setSelected(prev => [...prev, ...toAdd]);
    setLeftHighlighted(new Set());
  };

  const moveToAvailable = () => {
    setSelected(prev => prev.filter(col => fixedIds.has(col.id) || !rightHighlighted.has(col.id)));
    setCustomColumns(prev => prev.map(col => rightHighlighted.has(col.id) ? { ...col, showOnGrid: false } : col));
    setRightHighlighted(new Set());
  };

  const moveUp = () => {
    const newSelected = [...selected];
    const indices = newSelected
      .map((col, i) => rightHighlighted.has(col.id) && !fixedIds.has(col.id) ? i : -1)
      .filter(i => i > fixedColumns.length - 1);
    indices.forEach(i => {
      if (fixedIds.has(newSelected[i - 1].id)) return;
      [newSelected[i - 1], newSelected[i]] = [newSelected[i], newSelected[i - 1]];
    });
    setSelected(newSelected);
  };

  const moveDown = () => {
    const newSelected = [...selected];
    const indices = newSelected
      .map((col, i) => rightHighlighted.has(col.id) && !fixedIds.has(col.id) ? i : -1)
      .filter(i => i >= 0 && i < newSelected.length - 1)
      .reverse();
    indices.forEach(i => {
      // Don't swap with fixed columns
      if (fixedIds.has(newSelected[i + 1].id)) return;
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
    if (fixedIds.has(id)) return;
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

  const handleSave = () => onSave(selected, customColumns);
  const handleCancel = () => onClose();

  const canMoveUp = rightHighlighted.size > 0 && selected.some((col, i) => i > fixedColumns.length - 1 && rightHighlighted.has(col.id) && !fixedIds.has(col.id));
  const canMoveDown = rightHighlighted.size > 0 && selected.some((col, i) => i < selected.length - 1 && rightHighlighted.has(col.id) && !fixedIds.has(col.id));

  const addCustomColumn = () => {
    const id = `custom-${Date.now()}`;
    setCustomColumns(prev => [
      ...prev,
      { id, name: 'New Column', formula: '', isCustom: true, showOnGrid: false },
    ]);
  };

  const updateCustomColumn = (id: string, patch: Partial<SubColumn>) => {
    let updatedCustom: SubColumn | null = null;
    setCustomColumns(prev => prev.map(col => {
      if (col.id !== id) return col;
      updatedCustom = { ...col, ...patch };
      return updatedCustom;
    }));
    if (patch.name !== undefined) {
      setSelected(prev => prev.map(col => col.id === id ? { ...col, name: patch.name ?? col.name } : col));
    }
    if (patch.showOnGrid !== undefined) {
      if (patch.showOnGrid) {
        const cc = updatedCustom ?? customColumns.find(c => c.id === id) ?? null;
        if (cc) {
          setSelected(prev => prev.some(s => s.id === id) ? prev : [...prev, { ...cc, showOnGrid: true }]);
        }
      } else {
        setSelected(prev => prev.filter(col => col.id !== id || fixedIds.has(col.id)));
      }
    }
  };

  const removeCustomColumn = (id: string) => {
    setCustomColumns(prev => prev.filter(col => col.id !== id));
    setSelected(prev => prev.filter(col => col.id !== id || fixedIds.has(col.id)));
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="edit-sub-columns-modal-overlay">
      <div className="edit-sub-columns-modal" ref={modalRef}>
        <div className="edit-sub-columns-modal-header">
          <h2 className="edit-sub-columns-modal-title">Configure Sub-columns</h2>
          <button type="button" className="edit-sub-columns-modal-close" onClick={handleCancel} aria-label="Close">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="edit-sub-columns-modal-body">
          <div className="edit-sub-columns-tabs" role="tablist">
            <button
              type="button"
              className={`edit-sub-columns-tab ${activeTab === 'picklist' ? 'active' : ''}`}
              onClick={() => setActiveTab('picklist')}
            >
              Select Columns
            </button>
            <button
              type="button"
              className={`edit-sub-columns-tab ${activeTab === 'custom' ? 'active' : ''}`}
              onClick={() => setActiveTab('custom')}
            >
              Custom Formula Columns
            </button>
          </div>

          {activeTab === 'picklist' && <div className="duelling-picklist">
            {/* Left panel - Available */}
            <div className="duelling-picklist-panel">
              <div className="duelling-picklist-panel-header">
                <span className="duelling-picklist-panel-title">Available Sub-columns</span>
              </div>
              <ul className="duelling-picklist-list" role="listbox" aria-multiselectable="true">
                {available.length === 0 && (
                  <li className="duelling-picklist-empty">All sub-columns selected</li>
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
                <span className="duelling-picklist-panel-title">Selected Sub-columns</span>
              </div>
              <ul className="duelling-picklist-list" role="listbox" aria-multiselectable="true">
                {selected.length === 0 && (
                  <li className="duelling-picklist-empty">No sub-columns selected</li>
                )}
                {selected.map(col => (
                  <li
                    key={col.id}
                    role="option"
                    aria-selected={rightHighlighted.has(col.id)}
                    className={`duelling-picklist-item${rightHighlighted.has(col.id) ? ' selected' : ''}${fixedIds.has(col.id) ? ' fixed' : ''}`}
                    onClick={e => toggleRight(col.id, e)}
                    onDoubleClick={e => { if (!fixedIds.has(col.id)) { toggleRight(col.id, e); setTimeout(moveToAvailable, 0); } }}
                  >
                    <span>{col.name}</span>
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
          </div>}

          {activeTab === 'picklist' && (
            <p className="duelling-picklist-hint">
              Click to select · Ctrl+click for multi-select · Double-click to move · Drag order with ↑↓ buttons
            </p>
          )}

          {activeTab === 'custom' && (
            <div className="custom-sub-columns-editor">
              <div className="custom-sub-columns-header">
                <span>Create and edit formula-based sub columns</span>
                <button type="button" className="custom-sub-columns-add-btn" onClick={addCustomColumn}>+ Add custom column</button>
              </div>

              {customColumns.length === 0 ? (
                <div className="custom-sub-columns-empty">No custom columns yet</div>
              ) : (
                <div className="custom-sub-columns-list">
                  {customColumns.map(col => {
                    const isValid = validateFormula(col.formula || '');
                    return (
                      <div key={col.id} className="custom-sub-columns-card">
                        <div className="custom-sub-columns-grid">
                          <input
                            type="text"
                            className="custom-sub-columns-name"
                            value={col.name}
                            placeholder="Column name"
                            onChange={e => updateCustomColumn(col.id, { name: e.target.value })}
                          />
                          <input
                            type="text"
                            className="custom-sub-columns-formula"
                            value={col.formula || ''}
                            placeholder="Formula e.g. ({VALUE} - {VALUE[-1Y]}) / {VALUE[-1Y]} * 100"
                            onChange={e => updateCustomColumn(col.id, { formula: e.target.value })}
                          />
                          <label className="custom-sub-columns-toggle">
                            <input
                              type="checkbox"
                              checked={!!col.showOnGrid}
                              onChange={e => updateCustomColumn(col.id, { showOnGrid: e.target.checked })}
                            />
                            Show on grid
                          </label>
                          <span className={`custom-sub-columns-valid ${isValid ? 'ok' : 'err'}`}>
                            {isValid ? 'Valid formula' : 'Invalid formula'}
                          </span>
                          <button type="button" className="custom-sub-columns-delete-btn" onClick={() => removeCustomColumn(col.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="edit-sub-columns-modal-footer">
          <button type="button" className="edit-sub-columns-modal-button edit-sub-columns-modal-button-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="edit-sub-columns-modal-button edit-sub-columns-modal-button-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EditSubColumnsModal;
