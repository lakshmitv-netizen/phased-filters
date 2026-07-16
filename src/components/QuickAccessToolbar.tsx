import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MeasureData } from '../types';
import { measureSubgroupOptions, dimensionLevels, timeGranularities } from './SettingsPanel';
import '../styles/components/QuickAccessToolbar.css';

// Quick Access Toolbar: a compact bar of shortcut controls above the grid that
// mirror the most-used Settings options. Which controls appear (and their order)
// is configured via the dual-list modal. Mirrors the deployed Commercial Planning grid.

export interface QuickAccessAction {
  id: string;
  name: string;
}

export const QUICK_ACCESS_ACTIONS: QuickAccessAction[] = [
  { id: 'measure-categories', name: 'Measure categories' },
  { id: 'measures', name: 'Measures' },
  { id: 'dimension-levels', name: 'Dimension Levels' },
  { id: 'start-end-time', name: 'Start and End Time' },
  { id: 'time-granularity', name: 'Time Granularity' },
];

const ChevronDown = () => (
  <svg className="quick-access-bar-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const CheckMark = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="12" height="12">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
);

function toggleId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

interface MultiSelectControlProps {
  label: string;
  options: { id: string; name: string }[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  summary: string;
}

const MultiSelectControl: React.FC<MultiSelectControlProps> = ({ label, options, selectedIds, onToggle, summary }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return (
    <div className="quick-access-bar-control">
      <span className="quick-access-bar-label">{label}</span>
      <div className="quick-access-bar-dropdown" ref={ref}>
        <button type="button" className={`quick-access-bar-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}>
          <span className="quick-access-bar-value">{summary}</span>
          <ChevronDown />
        </button>
        {open && (
          <div className="quick-access-bar-menu" role="listbox" aria-multiselectable="true">
            {options.length === 0 && <div className="quick-access-bar-empty">No options</div>}
            {options.map(o => {
              const checked = selectedIds.has(o.id);
              return (
                <div
                  key={o.id}
                  className="quick-access-bar-option"
                  role="option"
                  aria-selected={checked}
                  onClick={() => onToggle(o.id)}
                >
                  <span className={`quick-access-bar-checkbox ${checked ? 'checked' : ''}`}>
                    {checked && <CheckMark />}
                  </span>
                  <span className="quick-access-bar-option-label">{o.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export interface QuickAccessBarProps {
  actions: string[];
  onConfigure: () => void;
  onClose: () => void;
  selectedMeasureSubgroup: Set<string>;
  onMeasureSubgroupChange: (subgroups: Set<string>) => void;
  measures: MeasureData[];
  visibleMeasureIds: Set<string>;
  onMeasuresReorder: (orderedMeasures: MeasureData[], visibleMeasureIds: Set<string>) => void;
  selectedDimensionLevels: Set<string>;
  onDimensionLevelsChange: (levels: Set<string>) => void;
  selectedTimeGranularities: Set<string>;
  onTimeGranularitiesChange: (granularities: Set<string>) => void;
  startPeriod: string;
  endPeriod: string;
  onStartPeriodChange: (period: string) => void;
  onEndPeriodChange: (period: string) => void;
  /** Per-grid dimension levels; defaults to the standard 3-level scheme. */
  dimensionLevels?: { id: string; name: string }[];
}

export const QuickAccessBar: React.FC<QuickAccessBarProps> = ({
  actions,
  onConfigure,
  onClose,
  dimensionLevels: dimensionLevelsProp = dimensionLevels,
  selectedMeasureSubgroup,
  onMeasureSubgroupChange,
  measures,
  visibleMeasureIds,
  onMeasuresReorder,
  selectedDimensionLevels,
  onDimensionLevelsChange,
  selectedTimeGranularities,
  onTimeGranularitiesChange,
  startPeriod,
  endPeriod,
  onStartPeriodChange,
  onEndPeriodChange,
}) => {
  const measureIds = measures.map(m => m.id);
  const effectiveVisible = visibleMeasureIds.size === 0 ? new Set(measureIds) : new Set(visibleMeasureIds);

  const renderAction = (id: string) => {
    switch (id) {
      case 'measure-categories': {
        const count = selectedMeasureSubgroup.size;
        return (
          <MultiSelectControl
            key={id}
            label="Measure categories"
            options={measureSubgroupOptions.map(o => ({ id: o.value, name: o.value }))}
            selectedIds={selectedMeasureSubgroup}
            onToggle={(optId) => onMeasureSubgroupChange(toggleId(selectedMeasureSubgroup, optId))}
            summary={count > 0 ? `${count} selected` : 'Select'}
          />
        );
      }
      case 'measures': {
        const visCount = effectiveVisible.size;
        return (
          <MultiSelectControl
            key={id}
            label="Measures"
            options={measures.map(m => ({ id: m.id, name: m.name }))}
            selectedIds={effectiveVisible}
            onToggle={(measureId) => onMeasuresReorder(measures, toggleId(effectiveVisible, measureId))}
            summary={`${visCount} of ${measureIds.length}`}
          />
        );
      }
      case 'dimension-levels': {
        const count = selectedDimensionLevels.size;
        return (
          <MultiSelectControl
            key={id}
            label="Dimension Levels"
            options={dimensionLevelsProp.map(l => ({ id: l.id, name: l.name }))}
            selectedIds={selectedDimensionLevels}
            onToggle={(levelId) => onDimensionLevelsChange(toggleId(selectedDimensionLevels, levelId))}
            summary={count > 0 ? `${count} selected` : 'Select'}
          />
        );
      }
      case 'time-granularity': {
        const count = selectedTimeGranularities.size;
        return (
          <MultiSelectControl
            key={id}
            label="Time Granularity"
            options={timeGranularities.map(g => ({ id: g.id, name: g.name }))}
            selectedIds={selectedTimeGranularities}
            onToggle={(gid) => onTimeGranularitiesChange(toggleId(selectedTimeGranularities, gid))}
            summary={count > 0 ? `${count} selected` : 'Select'}
          />
        );
      }
      case 'start-end-time':
        return (
          <div className="quick-access-bar-control" key={id}>
            <span className="quick-access-bar-label">Start and End Time</span>
            <div className="quick-access-bar-date-group">
              <input
                type="date"
                className="quick-access-bar-date"
                value={startPeriod}
                onChange={(e) => onStartPeriodChange(e.target.value)}
                aria-label="Start time"
              />
              <span className="quick-access-bar-date-sep">–</span>
              <input
                type="date"
                className="quick-access-bar-date"
                value={endPeriod}
                onChange={(e) => onEndPeriodChange(e.target.value)}
                aria-label="End time"
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="quick-access-bar">
      {actions.length === 0 && (
        <span className="quick-access-bar-empty">No quick actions configured.</span>
      )}
      {actions.map(renderAction)}
      <div className="quick-access-bar-end">
        <button type="button" className="quick-access-bar-configure" onClick={onConfigure}>
          Configure
        </button>
        <button type="button" className="quick-access-bar-close" onClick={onClose} title="Hide quick access toolbar" aria-label="Hide quick access toolbar">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

interface ConfigureQuickAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedActions: string[];
  onSave: (actions: string[]) => void;
}

export const ConfigureQuickAccessModal: React.FC<ConfigureQuickAccessModalProps> = ({
  isOpen,
  onClose,
  selectedActions,
  onSave,
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [leftHighlighted, setLeftHighlighted] = useState<Set<string>>(new Set());
  const [rightHighlighted, setRightHighlighted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setSelected(selectedActions);
      setLeftHighlighted(new Set());
      setRightHighlighted(new Set());
    }
  }, [isOpen, selectedActions]);

  const nameOf = (id: string) => QUICK_ACCESS_ACTIONS.find(a => a.id === id)?.name ?? id;
  const available = QUICK_ACCESS_ACTIONS.filter(a => !selected.includes(a.id));

  const moveToSelected = () => {
    const toAdd = available.filter(a => leftHighlighted.has(a.id)).map(a => a.id);
    setSelected(prev => [...prev, ...toAdd]);
    setLeftHighlighted(new Set());
  };
  const moveToAvailable = () => {
    setSelected(prev => prev.filter(id => !rightHighlighted.has(id)));
    setRightHighlighted(new Set());
  };
  const moveUp = () => {
    setSelected(prev => {
      const next = [...prev];
      for (let i = 1; i < next.length; i++) {
        if (rightHighlighted.has(next[i]) && !rightHighlighted.has(next[i - 1])) {
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
        }
      }
      return next;
    });
  };
  const moveDown = () => {
    setSelected(prev => {
      const next = [...prev];
      for (let i = next.length - 2; i >= 0; i--) {
        if (rightHighlighted.has(next[i]) && !rightHighlighted.has(next[i + 1])) {
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
        }
      }
      return next;
    });
  };

  const toggleHighlight = (
    id: string,
    e: React.MouseEvent,
    current: Set<string>,
    setCurrent: (s: Set<string>) => void,
    clearOther: () => void,
  ) => {
    const next = new Set(current);
    if (e.ctrlKey || e.metaKey) {
      next.has(id) ? next.delete(id) : next.add(id);
    } else if (next.has(id) && next.size === 1) {
      next.clear();
    } else {
      next.clear();
      next.add(id);
    }
    setCurrent(next);
    clearOther();
  };

  const canMoveUp = rightHighlighted.size > 0 && selected.some((id, i) => i > 0 && rightHighlighted.has(id));
  const canMoveDown = rightHighlighted.size > 0 && selected.some((id, i) => i < selected.length - 1 && rightHighlighted.has(id));

  if (!isOpen) return null;

  return createPortal(
    <div className="edit-sub-columns-modal-overlay">
      <div className="edit-sub-columns-modal">
        <div className="edit-sub-columns-modal-header">
          <h2 className="edit-sub-columns-modal-title">Configure Quick Access Toolbar</h2>
          <button type="button" className="edit-sub-columns-modal-close" onClick={onClose} aria-label="Close">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="edit-sub-columns-modal-body">
          <div className="duelling-picklist">
            <div className="duelling-picklist-panel">
              <div className="duelling-picklist-panel-header">
                <span className="duelling-picklist-panel-title">Available Actions</span>
              </div>
              <ul className="duelling-picklist-list" role="listbox" aria-multiselectable="true">
                {available.length === 0 && <li className="duelling-picklist-empty">All actions added</li>}
                {available.map(a => (
                  <li
                    key={a.id}
                    role="option"
                    aria-selected={leftHighlighted.has(a.id)}
                    className={`duelling-picklist-item${leftHighlighted.has(a.id) ? ' selected' : ''}`}
                    onClick={e => toggleHighlight(a.id, e, leftHighlighted, setLeftHighlighted, () => setRightHighlighted(new Set()))}
                    onDoubleClick={e => { toggleHighlight(a.id, e, leftHighlighted, setLeftHighlighted, () => setRightHighlighted(new Set())); setTimeout(moveToSelected, 0); }}
                  >
                    {a.name}
                  </li>
                ))}
              </ul>
            </div>

            <div className="duelling-picklist-actions">
              <button type="button" className="duelling-picklist-btn" title="Add to toolbar" onClick={moveToSelected} disabled={leftHighlighted.size === 0}>
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="duelling-picklist-btn" title="Remove from toolbar" onClick={moveToAvailable} disabled={rightHighlighted.size === 0}>
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="duelling-picklist-panel">
              <div className="duelling-picklist-panel-header">
                <span className="duelling-picklist-panel-title">Selected Actions</span>
              </div>
              <ul className="duelling-picklist-list" role="listbox" aria-multiselectable="true">
                {selected.length === 0 && <li className="duelling-picklist-empty">No actions selected</li>}
                {selected.map(id => (
                  <li
                    key={id}
                    role="option"
                    aria-selected={rightHighlighted.has(id)}
                    className={`duelling-picklist-item${rightHighlighted.has(id) ? ' selected' : ''}`}
                    onClick={e => toggleHighlight(id, e, rightHighlighted, setRightHighlighted, () => setLeftHighlighted(new Set()))}
                    onDoubleClick={e => { toggleHighlight(id, e, rightHighlighted, setRightHighlighted, () => setLeftHighlighted(new Set())); setTimeout(moveToAvailable, 0); }}
                  >
                    <span>{nameOf(id)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="duelling-picklist-order">
              <button type="button" className="duelling-picklist-btn" title="Move up" onClick={moveUp} disabled={!canMoveUp}>
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="duelling-picklist-btn" title="Move down" onClick={moveDown} disabled={!canMoveDown}>
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          <p className="duelling-picklist-hint">
            Click to select · Ctrl+click for multi-select · Double-click to move · Reorder with ↑↓ buttons
          </p>
        </div>

        <div className="edit-sub-columns-modal-footer">
          <button type="button" className="edit-sub-columns-modal-button edit-sub-columns-modal-button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="edit-sub-columns-modal-button edit-sub-columns-modal-button-primary" onClick={() => onSave(selected)}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
