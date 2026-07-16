import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/ColumnFilterPopover.css';

export type FilterOperator = '>=' | '<=' | '>' | '<' | '=' | '!=' | 'topN' | 'bottomN';
export type FilterDimension = 'account' | 'category' | 'product';

export interface ColumnFilter {
  operator?: FilterOperator;
  value?: string;
  conditions?: Array<{
    id: string;
    dimension: FilterDimension;
    measureId?: string;
    operator: FilterOperator;
    value: string;
    collapsed?: boolean;
    selectedNames?: string[]; // For name-based filtering
    // Top-N/Bottom-N ranking scope override (independent of the Sort panel's
    // preserveHierarchy): 'global' ranks across the whole grid, 'siblings' per parent.
    rankScope?: 'global' | 'siblings';
  }>;
  // For approval status columns, value is one of: 'notSubmitted', 'pending', 'approved', 'rejected'
}

interface ColumnFilterPopoverProps {
  columnKey: string;
  anchorEl: HTMLElement | null;
  isOpen: boolean;
  onClose: () => void;
  currentFilter?: ColumnFilter;
  onApply: (columnKey: string, filter: ColumnFilter | null) => void;
  availableMeasures?: Array<{ id: string; name: string }>;
  dimensionNames?: {
    account: string[];
    category: string[];
    product: string[];
  };
}

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: '>=', label: '>= (greater than or equal)' },
  { value: '<=', label: '<= (less than or equal)' },
  { value: '>', label: '> (greater than)' },
  { value: '<', label: '< (less than)' },
  { value: '=', label: '= (equal to)' },
  { value: '!=', label: '!= (not equal to)' },
  { value: 'topN', label: 'Top-N' },
  { value: 'bottomN', label: 'Bottom-N' },
];

const APPROVAL_STATUS_OPTIONS = [
  { value: 'notSubmitted', label: 'Not Submitted' },
  { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
];

const DIMENSIONS: Array<{ value: FilterDimension; label: string }> = [
  { value: 'account', label: 'Account' },
  { value: 'category', label: 'Category' },
  { value: 'product', label: 'Product' },
];

type FilterCondition = {
  id: string;
  dimension: FilterDimension;
  measureId: string;
  operator: FilterOperator;
  value: string;
  collapsed: boolean;
  selectedNames?: string[];
};

const makeCondition = (partial?: Partial<FilterCondition>, availableMeasures?: Array<{ id: string; name: string }>): FilterCondition => ({
  id: `cond-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  dimension: partial?.dimension ?? 'account',
  measureId: partial?.measureId ?? (availableMeasures && availableMeasures.length > 0 ? availableMeasures[0].id : ''),
  operator: partial?.operator ?? '>=',
  value: partial?.value ?? '0',
  collapsed: partial?.collapsed ?? false,
  selectedNames: partial?.selectedNames ?? [],
});

const ColumnFilterPopover: React.FC<ColumnFilterPopoverProps> = ({
  columnKey,
  anchorEl,
  isOpen,
  onClose,
  currentFilter,
  onApply,
  availableMeasures = [],
  dimensionNames = { account: [], category: [], product: [] },
}) => {
  const isApprovalStatus = columnKey.includes('-approvalStatus');
  const [operator, setOperator] = useState<FilterOperator>(currentFilter?.operator ?? '>=');
  const [value, setValue] = useState<string>(currentFilter?.value ?? '');
  const [conditions, setConditions] = useState<FilterCondition[]>([makeCondition(undefined, availableMeasures)]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, nubbinLeft: 20 });
  const [nameSearchTerms, setNameSearchTerms] = useState<Record<string, string>>({});

  useEffect(() => {
    // Only initialize state when popover opens, not on every availableMeasures change
    if (!isOpen) return;
    
    if (currentFilter) {
      setOperator(currentFilter.operator ?? '>=');
      setValue(currentFilter.value ?? '');
      if (!isApprovalStatus) {
        if (currentFilter.conditions && currentFilter.conditions.length > 0) {
          setConditions(currentFilter.conditions.map(c => makeCondition({
            id: c.id,
            dimension: c.dimension,
            measureId: c.measureId ?? (availableMeasures.length > 0 ? availableMeasures[0].id : ''),
            operator: c.operator,
            value: c.value,
            collapsed: c.collapsed ?? true,
            selectedNames: c.selectedNames,
          }, availableMeasures)));
        } else if (currentFilter.operator && typeof currentFilter.value === 'string') {
          // Backward-compatible single-condition filter.
          setConditions([makeCondition({
            dimension: 'account',
            measureId: availableMeasures.length > 0 ? availableMeasures[0].id : '',
            operator: currentFilter.operator,
            value: currentFilter.value,
            collapsed: false,
          }, availableMeasures)]);
        } else {
          setConditions([makeCondition({ collapsed: false }, availableMeasures)]);
        }
      }
    } else {
      setOperator('>=');
      setValue(isApprovalStatus ? '' : ''); // Empty string for approval status means "All"
      if (!isApprovalStatus) {
        setConditions([makeCondition({ collapsed: false }, availableMeasures)]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentFilter, isApprovalStatus]);

  useEffect(() => {
    if (isOpen && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const popoverWidth = 240;
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 8) {
        left = window.innerWidth - popoverWidth - 8;
      }
      left = Math.max(8, left);
      const anchorCenterX = rect.left + rect.width / 2;
      const nubbinLeft = Math.max(14, Math.min(popoverWidth - 14, anchorCenterX - left));
      setPosition({ top: rect.bottom + 6, left, nubbinLeft });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, anchorEl]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      // Don't close if clicking on a select element or option (native dropdown interaction)
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLOptionElement) {
        return;
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          anchorEl && !anchorEl.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose, anchorEl]);

  const handleApply = () => {
    if (isApprovalStatus) {
      if (value.trim() === '') {
        onApply(columnKey, null);
      } else {
        onApply(columnKey, { operator: '=', value: value.trim() });
      }
      onClose();
      return;
    }

    const activeConditions = conditions
      .map(c => ({ ...c, value: c.value.trim(), collapsed: true }))
      .filter(c => {
        // Name filter is active if selectedNames is not empty
        if (c.measureId === 'name') {
          return c.selectedNames && c.selectedNames.length > 0;
        }
        // Other filters are active if value is not empty and measureId is specified
        return c.value !== '' && c.measureId !== '';
      });

    if (activeConditions.length === 0) {
      onApply(columnKey, null);
    } else {
      onApply(columnKey, { conditions: activeConditions });
    }
    onClose();
  };

  const handleClear = () => {
    setOperator('>=');
    setValue('');
    setConditions([makeCondition({ operator: '>=', value: '0', collapsed: false }, availableMeasures)]);
    setNameSearchTerms({});
    onApply(columnKey, null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleApply();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="col-filter-popover"
      style={{ top: position.top, left: position.left }}
      onMouseDown={e => {
        // Don't stop propagation for select elements - they need the event to open their dropdown
        if (e.target instanceof HTMLSelectElement) {
          return;
        }
        e.stopPropagation();
      }}
    >
      <div className="col-filter-nubbin" style={{ left: `${position.nubbinLeft}px` }} aria-hidden="true">
        <div className="col-filter-nubbin-inner" />
      </div>
      {isApprovalStatus ? (
        <>
          <div className="col-filter-section">
            <label className="col-filter-label">Status</label>
            <div className="col-filter-select-wrapper">
              <select
                className="col-filter-select"
                value={value}
                onChange={e => setValue(e.target.value)}
              >
                <option value="">All</option>
                {APPROVAL_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <svg className="col-filter-select-arrow" viewBox="0 0 24 24" fill="none" width="14" height="14">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <div className="col-filter-footer">
            <button type="button" className="col-filter-btn col-filter-btn-clear" onClick={handleClear}>
              Clear
            </button>
            <button type="button" className="col-filter-btn col-filter-btn-apply" onClick={handleApply}>
              Apply
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="col-filter-group-head">
            <span className="col-filter-label">Filters</span>
            <button
              type="button"
              className="col-filter-add-btn col-filter-add-btn-header"
              onClick={() => setConditions(prev => [...prev, makeCondition({ collapsed: false }, availableMeasures)])}
            >
              + Add filter
            </button>
          </div>
          <div className="col-filter-conditions-list">
            {conditions.map((condition, idx) => {
              const summaryDimension = DIMENSIONS.find(d => d.value === condition.dimension)?.label ?? 'Dimension';
              
              // Handle name-based filtering
              let summaryText: string;
              if (condition.measureId === 'name' && condition.selectedNames && condition.selectedNames.length > 0) {
                const namesList = condition.selectedNames.join(', ');
                summaryText = `${summaryDimension} name = ${namesList}`;
              } else {
                const summaryMeasure = availableMeasures.find(m => m.id === condition.measureId)?.name ?? 'Measure';
                const summaryValue = condition.value?.trim() ? condition.value : '…';
                summaryText = `${summaryDimension} · ${summaryMeasure} ${condition.operator} ${summaryValue}`;
              }
              
              return (
                <div key={condition.id} className="col-filter-condition-card">
                  {condition.collapsed ? (
                    <div className="col-filter-condition-collapsed">
                      <span className="col-filter-condition-summary">
                        {summaryText}
                      </span>
                      <div className="col-filter-condition-actions">
                        <button
                          type="button"
                          className="col-filter-icon-action"
                          aria-label="Delete condition"
                          onClick={() => {
                            setConditions(prev => {
                              const next = prev.filter(c => c.id !== condition.id);
                              return next.length > 0 ? next : [makeCondition({ collapsed: false }, availableMeasures)];
                            });
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                            <path d="M6 7h12M10 11v6M14 11v6M9 7V5h6v2M8 7l1 12h6l1-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="col-filter-icon-action"
                          aria-label="Expand condition"
                          onClick={() => {
                            setConditions(prev => prev.map(c => c.id === condition.id ? { ...c, collapsed: false } : c));
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="col-filter-condition-top">
                        <span className="col-filter-condition-title">Condition {idx + 1}</span>
                        <div className="col-filter-condition-actions">
                          <button
                            type="button"
                            className="col-filter-icon-action"
                            aria-label="Delete condition"
                            onClick={() => {
                              setConditions(prev => {
                                const next = prev.filter(c => c.id !== condition.id);
                                return next.length > 0 ? next : [makeCondition({ collapsed: false }, availableMeasures)];
                              });
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                              <path d="M6 7h12M10 11v6M14 11v6M9 7V5h6v2M8 7l1 12h6l1-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="col-filter-icon-action"
                            aria-label="Collapse condition"
                            onClick={() => {
                              setConditions(prev => prev.map(c => c.id === condition.id ? { ...c, collapsed: true } : c));
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                              <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="col-filter-section">
                        <label className="col-filter-label">Dimension</label>
                        <div className="col-filter-select-wrapper">
                          <select
                            className="col-filter-select"
                            value={condition.dimension}
                            onChange={e => {
                              const nextDimension = e.target.value as FilterDimension;
                              setConditions(prev => prev.map(c => c.id === condition.id ? { ...c, dimension: nextDimension } : c));
                            }}
                          >
                            {DIMENSIONS.map(d => (
                              <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                          </select>
                          <svg className="col-filter-select-arrow" viewBox="0 0 24 24" fill="none" width="14" height="14">
                            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                      <div className="col-filter-section">
                        <label className="col-filter-label">Filter By</label>
                        <div className="col-filter-select-wrapper">
                          <select
                            className="col-filter-select"
                            value={condition.measureId}
                            onChange={e => {
                              const nextMeasureId = e.target.value;
                              setConditions(prev => prev.map(c => c.id === condition.id ? { 
                                ...c, 
                                measureId: nextMeasureId,
                                operator: nextMeasureId === 'name' ? '=' : c.operator,
                                selectedNames: nextMeasureId === 'name' ? [] : undefined
                              } : c));
                            }}
                          >
                            <option value="name">Name</option>
                            {availableMeasures.length === 0 && <option value="">No measures</option>}
                            {availableMeasures.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                          <svg className="col-filter-select-arrow" viewBox="0 0 24 24" fill="none" width="14" height="14">
                            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                      <div className="col-filter-section">
                        <label className="col-filter-label">Operator</label>
                        <div className="col-filter-select-wrapper">
                          <select
                            className="col-filter-select"
                            value={condition.measureId === 'name' ? '=' : condition.operator}
                            onChange={e => {
                              const nextOperator = e.target.value as FilterOperator;
                              setConditions(prev => prev.map(c => c.id === condition.id ? { ...c, operator: nextOperator } : c));
                            }}
                            disabled={condition.measureId === 'name'}
                          >
                            {condition.measureId === 'name' ? (
                              <option value="=">= (equal to)</option>
                            ) : (
                              OPERATORS.map(op => (
                                <option key={op.value} value={op.value}>{op.label}</option>
                              ))
                            )}
                          </select>
                          <svg className="col-filter-select-arrow" viewBox="0 0 24 24" fill="none" width="14" height="14">
                            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                      <div className="col-filter-section">
                        <label className="col-filter-label">Value</label>
                        {condition.measureId === 'name' ? (
                          <div className="col-filter-name-selector">
                            <input
                              type="text"
                              className="col-filter-input"
                              placeholder="Search..."
                              value={nameSearchTerms[condition.id] || ''}
                              onChange={e => {
                                setNameSearchTerms(prev => ({ ...prev, [condition.id]: e.target.value }));
                              }}
                            />
                            <div className="col-filter-name-checkboxes">
                              {(() => {
                                const names = dimensionNames[condition.dimension] || [];
                                const searchTerm = (nameSearchTerms[condition.id] || '').toLowerCase();
                                const filteredNames = searchTerm 
                                  ? names.filter(n => n.toLowerCase().includes(searchTerm))
                                  : names;
                                const selectedNames = condition.selectedNames || [];
                                const allSelected = filteredNames.length > 0 && filteredNames.every(n => selectedNames.includes(n));
                                
                                return (
                                  <>
                                    {filteredNames.length > 0 && (
                                      <label className="col-filter-name-checkbox-item">
                                        <input
                                          type="checkbox"
                                          checked={allSelected}
                                          onChange={e => {
                                            if (e.target.checked) {
                                              // Select all filtered names
                                              setConditions(prev => prev.map(c => c.id === condition.id ? { 
                                                ...c, 
                                                selectedNames: Array.from(new Set([...selectedNames, ...filteredNames]))
                                              } : c));
                                            } else {
                                              // Deselect all filtered names
                                              setConditions(prev => prev.map(c => c.id === condition.id ? { 
                                                ...c, 
                                                selectedNames: selectedNames.filter(n => !filteredNames.includes(n))
                                              } : c));
                                            }
                                          }}
                                        />
                                        <span style={{ fontWeight: 600 }}>All</span>
                                      </label>
                                    )}
                                    {filteredNames.map(name => (
                                      <label key={name} className="col-filter-name-checkbox-item">
                                        <input
                                          type="checkbox"
                                          checked={selectedNames.includes(name)}
                                          onChange={e => {
                                            if (e.target.checked) {
                                              setConditions(prev => prev.map(c => c.id === condition.id ? { 
                                                ...c, 
                                                selectedNames: [...selectedNames, name]
                                              } : c));
                                            } else {
                                              setConditions(prev => prev.map(c => c.id === condition.id ? { 
                                                ...c, 
                                                selectedNames: selectedNames.filter(n => n !== name)
                                              } : c));
                                            }
                                          }}
                                        />
                                        <span>{name}</span>
                                      </label>
                                    ))}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        ) : (
                          <input
                            ref={idx === 0 ? inputRef : undefined}
                            type="text"
                            className="col-filter-input"
                            placeholder="Enter value..."
                            value={condition.value}
                            onChange={e => {
                              const nextValue = e.target.value;
                              setConditions(prev => prev.map(c => c.id === condition.id ? { ...c, value: nextValue } : c));
                            }}
                            onKeyDown={handleKeyDown}
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="col-filter-footer">
            <button type="button" className="col-filter-btn col-filter-btn-clear" onClick={handleClear}>
              Clear
            </button>
            <button type="button" className="col-filter-btn col-filter-btn-apply" onClick={handleApply}>
              Apply
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  );
};

export default ColumnFilterPopover;
