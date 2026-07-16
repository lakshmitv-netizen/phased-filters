import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TransformedRow } from '../utils/layoutTransform';
import { MeasureData } from '../types';
import { extractSearchTerms, separateSearchTerms, matchesNumber } from '../utils/searchUtils';
import { SearchHighlight } from './SearchHighlight';
import { CellDeltaSignIcon } from './CellDeltaSignIcon';
import { LegacySavedLineArrowDownIcon, LegacySavedLineArrowUpIcon } from './gridLegacyValueIcons';
import { useIsGrid264UpdatedExperience } from '../contexts/IndustryContext';
import MoreNodeSettingsModal from './MoreNodeSettingsModal';
import AddRemoveChildNodesModal from './AddRemoveChildNodesModal';
import { evaluateCellInput } from '../utils/cellFormula';
import '../styles/components/Grid.css';

interface TimeDimensionsRowProps {
  row: TransformedRow;
  level: number;
  isExpanded: boolean;
  expandedRows: Set<string>;
  onToggleExpand: (id: string) => void;
  formatValue: (value: number, isQuantity?: boolean, measureName?: string) => string;
  measures: Array<{ id: string; name: string }>;
  onCellChange?: (timeKey: string, dimensionId: string, measureId: string, newValue: number) => void;
  focusedCell?: { rowId: string; measureId: string } | null;
  onCellFocus?: (cell: { rowId: string; measureId: string } | null) => void;
  cellRefs?: React.MutableRefObject<Map<string, HTMLTableCellElement>>;
  editedCells?: Map<string, number>;
  impactedCells?: Map<string, number>;
  savedEditedCells?: Map<string, string>;
  columnWidth?: number;
  searchTerm?: string;
  newlyAddedMeasureIds?: string[];
  onAddChildNode?: (rowId: string) => void;
  onRemoveChildNode?: (rowId: string) => void;
  onFilterChildrenNodes?: (rowId: string) => void;
  onEditNode?: (rowId: string) => void;
  onDeleteNode?: (rowId: string) => void;
  onReparentNode?: (rowId: string, parentNodeId: string | null) => void;
  data?: MeasureData[];
  selectedCells?: Set<string>;
  onCellSelect?: (cellKey: string, event: React.MouseEvent) => void;
  onCellMouseDown?: (cellKey: string, event: React.MouseEvent) => void;
  onCellMouseMove?: (cellKey: string) => void;
}

const TimeDimensionsRowComponent: React.FC<TimeDimensionsRowProps> = ({
  row,
  level,
  isExpanded,
  expandedRows,
  onToggleExpand,
  formatValue,
  measures,
  onCellChange,
  focusedCell,
  onCellFocus,
  cellRefs,
  editedCells,
  impactedCells,
  savedEditedCells,
  columnWidth = 100,
  searchTerm = '',
  newlyAddedMeasureIds = [],
  onAddChildNode,
  onRemoveChildNode,
  onFilterChildrenNodes,
  onEditNode,
  onDeleteNode,
  onReparentNode,
  data = [],
  selectedCells,
  onCellSelect,
  onCellMouseDown,
  onCellMouseMove,
}) => {
  const isGrid264Ux = useIsGrid264UpdatedExperience();
  const rowA11y = isGrid264Ux ? ({ role: 'row' as const } satisfies React.HTMLAttributes<HTMLTableRowElement>) : {};
  const rowheaderA11y = isGrid264Ux
    ? ({ role: 'rowheader' as const } satisfies React.HTMLAttributes<HTMLTableCellElement>)
    : {};
  const gridcellA11y = isGrid264Ux
    ? ({ role: 'gridcell' as const } satisfies React.HTMLAttributes<HTMLTableCellElement>)
    : {};
  const hasChildren = row.children && row.children.length > 0;
  const [editingCell, setEditingCell] = useState<{ measureId: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const savedByEnterRef = useRef<boolean>(false);
  const [_hoveredMeasureId, setHoveredMeasureId] = useState<string | null>(null);
  const [_focusedCellKey, setFocusedCellKey] = useState<string | null>(null);
  const [showDimensionMenu, setShowDimensionMenu] = useState(false);
  const [dimensionMenuPosition, setDimensionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const dimensionMenuRef = useRef<HTMLButtonElement>(null);
  const [showMoreNodeSettingsModal, setShowMoreNodeSettingsModal] = useState(false);
  const [showAddRemoveChildNodesModal, setShowAddRemoveChildNodesModal] = useState(false);

  // Check if this node only has leaf children (no grandchildren)
  const hasOnlyLeafChildren = hasChildren && row.children 
    ? row.children.every(child => !child.children || child.children.length === 0)
    : false;
  
  // Check if this is a leaf node (no children)
  const isLeafNode = !hasChildren;
  
  // Show expand/collapse options only if node has grandchildren (not just direct children)
  const showExpandCollapseOptions = hasChildren && !hasOnlyLeafChildren && !isLeafNode;

  // Helper function to collect all descendant IDs recursively
  const collectAllDescendantIds = (rows: TransformedRow[]): string[] => {
    const ids: string[] = [];
    for (const childRow of rows) {
      if (childRow.children && childRow.children.length > 0) {
        ids.push(childRow.id);
        ids.push(...collectAllDescendantIds(childRow.children));
      }
    }
    return ids;
  };
  
  // Expand all children of this dimension row
  const handleExpandAll = () => {
    if (!hasChildren || !row.children) return;
    const allIds = collectAllDescendantIds(row.children);
    // Expand this row first if not already expanded
    if (!isExpanded) {
      onToggleExpand(row.id);
    }
    // Then expand all children that have children
    allIds.forEach(id => {
      if (!expandedRows.has(id)) {
        onToggleExpand(id);
      }
    });
  };
  
  // Collapse all children of this dimension row
  const handleCollapseAll = () => {
    if (!hasChildren || !row.children) return;
    const allIds = collectAllDescendantIds(row.children);
    // Collapse all children first
    allIds.forEach(id => {
      if (expandedRows.has(id)) {
        onToggleExpand(id);
      }
    });
    // Then collapse this row if expanded
    if (isExpanded) {
      onToggleExpand(row.id);
    }
  };

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Update dimension menu position when showing
  useEffect(() => {
    if (showDimensionMenu && dimensionMenuRef.current) {
      const rect = dimensionMenuRef.current.getBoundingClientRect();
      setDimensionMenuPosition({
        top: rect.bottom + 8,
        left: rect.left
      });
    }
  }, [showDimensionMenu]);

  // Close dimension menu when clicking outside
  useEffect(() => {
    if (!showDimensionMenu) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dimension-menu-dropdown') && !dimensionMenuRef.current?.contains(target)) {
        setShowDimensionMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDimensionMenu]);

  const handleCellValueDoubleClick = (measureId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Only dimension rows (account, category, product) are editable, not time rows
    if (row.type === 'account' || row.type === 'category' || row.type === 'product') {
      if (!onCellChange) {
        console.log('[TimeDimensionsRow] No onCellChange handler');
        return;
      }
      const currentValue = row.measureValues.get(measureId) || 0;
      console.log('[TimeDimensionsRow] Cell double-clicked, entering edit mode:', { rowId: row.id, measureId, currentValue });
      setEditingCell({ measureId });
      setEditValue(currentValue.toString());
    }
  };

  const handleCellEnterKey = (measureId: string) => {
    // Only dimension rows are editable
    if (row.type !== 'account' && row.type !== 'category' && row.type !== 'product') {
      return;
    }
    if (!onCellChange) {
      console.log('[TimeDimensionsRow] No onCellChange handler');
      return;
    }
    const currentValue = row.measureValues.get(measureId) || 0;
    console.log('[TimeDimensionsRow] Enter key pressed, entering edit mode:', { rowId: row.id, measureId, currentValue });
    setEditingCell({ measureId });
    setEditValue(currentValue.toString());
  };

  const handleCellBlur = (measureId: string, inputValue: string) => {
    // If this was already saved by Enter key, skip to avoid double-saving
    if (savedByEnterRef.current) {
      savedByEnterRef.current = false;
      setEditingCell(null);
      setEditValue('');
      return;
    }

    if (!onCellChange) {
      setEditingCell(null);
      setEditValue('');
      return;
    }

    // Read value from inputRef to ensure we get the current value, fallback to parameter
    const actualInputValue = inputRef.current?.value || inputValue;
    console.log('[TimeDimensionsRow] Blur event, inputValue:', actualInputValue, 'editValue state:', editValue);
    
    // Evaluate input: plain number, "+N%/-N%" delta, or "=" arithmetic formula.
    const currentValue = row.measureValues.get(measureId) || 0;
    const timeKey = row.timeKey || 'year';
    const evalResult = evaluateCellInput(actualInputValue, currentValue);
    if (evalResult.value !== null && !isNaN(evalResult.value)) {
      const roundedValue = Math.round(evalResult.value * 100) / 100;
      // Extract original dimension ID from row.id (format: dimension-{originalId}-{timeKey})
      const dimensionId = row.id.replace(/^dimension-/, '').replace(/-\w+$/, '');
      onCellChange(timeKey, dimensionId, measureId, roundedValue);
    } else if (evalResult.isFormula && evalResult.error) {
      console.log('[TimeDimensionsRow] Invalid formula:', actualInputValue);
      alert('Invalid formula. Please check your formula and try again.');
    }
    setEditingCell(null);
    setEditValue('');
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, measureId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      // Read value from inputRef to ensure we get the current value
      const inputValue = inputRef.current?.value || (e.target as HTMLInputElement).value;
      console.log('[TimeDimensionsRow] Enter pressed, inputValue:', inputValue, 'editValue state:', editValue);
      
      // Evaluate input: plain number, "+N%/-N%" delta, or "=" arithmetic formula.
      const currentValue = row.measureValues.get(measureId) || 0;
      const timeKey = row.timeKey || 'year';
      const evalResult = evaluateCellInput(inputValue, currentValue);
      if (evalResult.value !== null && !isNaN(evalResult.value) && onCellChange) {
        const roundedValue = Math.round(evalResult.value * 100) / 100;
        savedByEnterRef.current = true;
        const dimensionId = row.id.replace(/^dimension-/, '').replace(/-\w+$/, '');
        onCellChange(timeKey, dimensionId, measureId, roundedValue);
      } else if (evalResult.isFormula && evalResult.error) {
        console.log('[TimeDimensionsRow] Invalid formula:', inputValue);
        alert('Invalid formula. Please check your formula and try again.');
      }
      setEditingCell(null);
      setEditValue('');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setEditingCell(null);
      setEditValue('');
    }
  };

  const renderCellValue = (measureId: string) => {
    if (editingCell?.measureId === measureId) {
      return (
        <input
          ref={inputRef}
          type="text"
          className="cell-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={(e) => {
            // Read value from the input element directly
            const value = inputRef.current?.value || e.target.value;
            handleCellBlur(measureId, value);
          }}
          onKeyDown={(e) => handleCellKeyDown(e, measureId)}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => {
            e.stopPropagation();
          }}
        />
      );
    }

    const cellKey = `${row.id}-${measureId}`;
    const editedOriginalValue = editedCells?.get(cellKey);
    const impactedOriginalValue = impactedCells?.get(cellKey);
    const savedIconColor = savedEditedCells?.get(cellKey);
    const isSavedEdited = savedIconColor !== undefined;
    const currentValue = row.measureValues.get(measureId) || 0;
    const isDirectlyEdited = editedOriginalValue !== undefined;
    const isImpacted = !isDirectlyEdited && impactedOriginalValue !== undefined;

    // Calculate delta as percentage
    let deltaPercent: number | null = null;
    const originalValue = editedOriginalValue ?? impactedOriginalValue;
    if ((isDirectlyEdited || isImpacted) && originalValue !== undefined && originalValue !== 0) {
      deltaPercent = ((currentValue - originalValue) / originalValue) * 100;
    }

    const isEditable = (row.type === 'account' || row.type === 'category' || row.type === 'product');

    if (isDirectlyEdited) {
      const isIncrement = deltaPercent !== null && deltaPercent > 0;
      const deltaColor = isIncrement ? 'var(--slds-g-color-warning-2)' : 'var(--color-accent-blue)';
      const deltaColorLegacy = isIncrement ? '#ff5d2d' : '#2E76E1';

      return (
        <div 
          className="cell-value-wrapper-edited-container"
          onDoubleClick={isEditable ? (e) => handleCellValueDoubleClick(measureId, e) : undefined}
          style={{ cursor: isEditable ? 'pointer' : 'default' }}
        >
          <div className="cell-value-left-icon">
            <div style={{ width: '18px', height: '18px' }}></div>
          </div>
          <div className="cell-value-left-section" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {deltaPercent !== null && Math.abs(deltaPercent) > 0.001 && (
              <div
                className="cell-delta-badge"
                style={!isGrid264Ux ? { color: deltaColorLegacy } : undefined}
              >
                {isGrid264Ux ? (
                  <>
                    <CellDeltaSignIcon deltaPercent={deltaPercent} />
                    {`${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(2)}%`}
                  </>
                ) : (
                  <>
                    <CellDeltaSignIcon deltaPercent={deltaPercent} />
                    {`${deltaPercent > 0 ? '+' : ''} ${deltaPercent.toFixed(2)}%`}
                  </>
                )}
              </div>
            )}
            <span 
              className={`cell-value cell-value-edited ${!isEditable ? 'cell-value-readonly' : ''}`}
              style={{ color: isGrid264Ux ? deltaColor : deltaColorLegacy }}
            >
              {searchTerm && searchTerm.trim() ? (() => {
                const searchTerms = extractSearchTerms(searchTerm);
                const { otherTerms } = separateSearchTerms(searchTerms);
                const measure = measures.find(m => m.id === measureId);
                const isQuantity = measure?.name?.toLowerCase().includes('quantity') || false;
                const valueStr = formatValue(currentValue, isQuantity, measure?.name);
                return otherTerms.length > 0 && matchesNumber(currentValue, otherTerms) ? (
                  <SearchHighlight text={valueStr} searchTerms={otherTerms} />
                ) : (
                  valueStr
                );
              })() : (() => {
                const measure = measures.find(m => m.id === measureId);
                const isQuantity = measure?.name?.toLowerCase().includes('quantity') || false;
                return formatValue(currentValue, isQuantity, measure?.name);
              })()}
            </span>
          </div>
        </div>
      );
    }
    
    // Saved edited cell: show only icon, no badge, normal value positioning
    if (isSavedEdited) {
      const iconColor = savedIconColor || 'var(--color-accent-blue)'; // Use stored color or default blue
      const isIncrease =
        iconColor === 'var(--slds-g-color-warning-2)' ||
        iconColor === '#ff5d2d' ||
        iconColor === '#FF5D2D';

      return (
        <div 
          className="cell-value-wrapper-saved-container"
          onDoubleClick={isEditable ? (e) => handleCellValueDoubleClick(measureId, e) : undefined}
          style={{ cursor: isEditable ? 'pointer' : 'default' }}
        >
          <div
            className={
              isGrid264Ux
                ? 'cell-value-left-icon cell-value-left-icon--compact-disc'
                : `cell-value-left-icon ${isIncrease ? 'cell-arrow-increase' : 'cell-arrow-decrease'}`
            }
          >
            {isGrid264Ux ? (
              <CellDeltaSignIcon variant={isIncrease ? 'increase' : 'decrease'} />
            ) : isIncrease ? (
              <LegacySavedLineArrowUpIcon />
            ) : (
              <LegacySavedLineArrowDownIcon />
            )}
          </div>
          <span 
            className={`cell-value cell-value-saved ${isIncrease ? 'cell-value-increase' : 'cell-value-decrease'} ${!isEditable ? 'cell-value-readonly' : ''}`}
          >
            {searchTerm && searchTerm.trim() ? (() => {
              const searchTerms = extractSearchTerms(searchTerm);
              const { otherTerms } = separateSearchTerms(searchTerms);
              const measure = measures.find(m => m.id === measureId);
              const isQuantity = measure?.name?.toLowerCase().includes('quantity') || false;
              const valueStr = formatValue(currentValue, isQuantity);
              return otherTerms.length > 0 && matchesNumber(currentValue, otherTerms) ? (
                <SearchHighlight text={valueStr} searchTerms={otherTerms} />
              ) : (
                valueStr
              );
            })() : (() => {
              const measure = measures.find(m => m.id === measureId);
              const isQuantity = measure?.name?.toLowerCase().includes('quantity') || false;
              return formatValue(currentValue, isQuantity);
            })()}
          </span>
        </div>
      );
    }
    
    if (isImpacted) {
      // Impacted cell: lighter yellow background, delta badge, no icon
      const isIncrement = deltaPercent !== null && deltaPercent > 0;
      const deltaColor = isIncrement ? 'var(--slds-g-color-warning-2)' : 'var(--color-accent-blue)';
      const deltaColorLegacy = isIncrement ? '#ff5d2d' : '#2E76E1';

      return (
        <div 
          className="cell-value-wrapper-impacted-container"
          onDoubleClick={isEditable ? (e) => handleCellValueDoubleClick(measureId, e) : undefined}
          style={{ cursor: isEditable ? 'pointer' : 'default' }}
        >
          <div className="cell-value-left-icon">
            <div style={{ width: '18px', height: '18px' }}></div>
          </div>
          <div className="cell-value-left-section" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {deltaPercent !== null && Math.abs(deltaPercent) > 0.001 && (
              <div
                className="cell-delta-badge"
                style={!isGrid264Ux ? { color: deltaColorLegacy } : undefined}
              >
                {isGrid264Ux ? (
                  <>
                    <CellDeltaSignIcon deltaPercent={deltaPercent} />
                    {`${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(2)}%`}
                  </>
                ) : (
                  <>
                    <CellDeltaSignIcon deltaPercent={deltaPercent} />
                    {`${deltaPercent > 0 ? '+' : ''} ${deltaPercent.toFixed(2)}%`}
                  </>
                )}
              </div>
            )}
            <span 
              className={`cell-value cell-value-impacted ${!isEditable ? 'cell-value-readonly' : ''}`}
              style={{ color: isGrid264Ux ? deltaColor : deltaColorLegacy }}
            >
              {searchTerm && searchTerm.trim() ? (() => {
                const searchTerms = extractSearchTerms(searchTerm);
                const { otherTerms } = separateSearchTerms(searchTerms);
                const measure = measures.find(m => m.id === measureId);
                const isQuantity = measure?.name?.toLowerCase().includes('quantity') || false;
                const valueStr = formatValue(currentValue, isQuantity, measure?.name);
                return otherTerms.length > 0 && matchesNumber(currentValue, otherTerms) ? (
                  <SearchHighlight text={valueStr} searchTerms={otherTerms} />
                ) : (
                  valueStr
                );
              })() : (() => {
                const measure = measures.find(m => m.id === measureId);
                const isQuantity = measure?.name?.toLowerCase().includes('quantity') || false;
                return formatValue(currentValue, isQuantity, measure?.name);
              })()}
            </span>
          </div>
        </div>
      );
    }
    
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <div className="cell-value-left-icon">
          <div style={{ width: '16px', height: '16px' }}></div>
        </div>
        <span 
          className={`cell-value ${!isEditable ? 'cell-value-readonly' : ''}`}
          style={{ cursor: isEditable ? 'pointer' : 'default' }}
          onDoubleClick={isEditable ? (e) => handleCellValueDoubleClick(measureId, e) : undefined}
        >
          {searchTerm && searchTerm.trim() ? (() => {
            const searchTerms = extractSearchTerms(searchTerm);
            const { otherTerms } = separateSearchTerms(searchTerms);
            const measure = measures.find(m => m.id === measureId);
            const isQuantity = measure?.name?.toLowerCase().includes('quantity') || false;
            const valueStr = formatValue(currentValue, isQuantity);
            return otherTerms.length > 0 && matchesNumber(currentValue, otherTerms) ? (
              <SearchHighlight text={valueStr} searchTerms={otherTerms} />
            ) : (
              valueStr
            );
          })() : (() => {
            const measure = measures.find(m => m.id === measureId);
            const isQuantity = measure?.name?.toLowerCase().includes('quantity') || false;
            return formatValue(currentValue, isQuantity);
          })()}
        </span>
      </div>
    );
  };

  const rowClassName = `grid-row ${row.type === 'year' || row.type === 'quarter' || row.type === 'month' ? `time-row ${row.type}` : 'dimension-row'}`;

  return (
    <>
      <tr {...rowA11y} className={rowClassName}>
        <td {...rowheaderA11y} className="grid-cell" style={{ width: '300px', minWidth: '300px' }}>
          <div className="cell-content">
            <span className={`cell-indent level-${row.level}`}></span>
            {hasChildren && (
              <button
                type="button"
                className={`chevron-icon ${isExpanded ? 'expanded' : ''}`}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                onClick={() => onToggleExpand(row.id)}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {!hasChildren && <span style={{ width: '16px', display: 'inline-block' }}></span>}
            {row.type === 'account' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', marginRight: '4px', width: '24px', height: '24px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="24" height="24" rx="12" fill="#5867E8"/>
                  <path d="M18.6463 12.2486C18.674 11.7779 18.314 11.6394 18.1755 11.6394H13.1909C12.7479 11.6394 12.6925 12.1102 12.6925 12.1379V17.5379H18.6463V12.2486ZM15.2125 16.1256C15.2125 16.3748 15.0186 16.5963 14.7417 16.5963H14.2709C14.0217 16.5963 13.8002 16.3748 13.8002 16.1256V15.6548C13.8002 15.4056 13.994 15.184 14.2709 15.184H14.7417C14.9909 15.184 15.2125 15.4056 15.2125 15.6548V16.1256ZM15.2125 13.7717C15.2125 14.0209 15.0186 14.2425 14.7417 14.2425H14.2709C14.0217 14.2425 13.8002 14.0209 13.8002 13.7717V13.3009C13.8002 13.0517 13.994 12.8302 14.2709 12.8302H14.7417C14.9909 12.8302 15.2125 13.0517 15.2125 13.3009V13.7717ZM17.5109 16.1256C17.5109 16.3748 17.3171 16.5963 17.0402 16.5963H16.5694C16.3202 16.5963 16.0986 16.3748 16.0986 16.1256V15.6548C16.0986 15.4056 16.2925 15.184 16.5694 15.184H17.0402C17.2894 15.184 17.5109 15.4056 17.5109 15.6548V16.1256ZM17.5109 13.7717C17.5109 14.0209 17.3171 14.2425 17.0402 14.2425H16.5694C16.3202 14.2425 16.0986 14.0209 16.0986 13.7717V13.3009C16.0986 13.0517 16.2925 12.8302 16.5694 12.8302H17.0402C17.2894 12.8302 17.5109 13.0517 17.5109 13.3009V13.7717ZM14.0494 9.75632V7.07017C14.0771 6.5994 13.7448 6.46094 13.6063 6.46094H5.85247C5.40939 6.46094 5.354 6.93171 5.354 6.9594V17.5379H11.3079V10.7809C11.3079 10.7809 11.3079 10.2271 11.8063 10.2271H13.6063C13.8832 10.2271 14.0494 9.95017 14.0494 9.75632ZM7.874 15.904C7.874 16.1532 7.68016 16.3748 7.40323 16.3748H6.96016C6.71093 16.3748 6.48939 16.1532 6.48939 15.904V15.4332C6.48939 15.184 6.68323 14.9625 6.96016 14.9625H7.43093C7.68016 14.9625 7.9017 15.184 7.9017 15.4332V15.904H7.874ZM7.874 13.5225C7.874 13.7717 7.68016 13.9932 7.40323 13.9932H6.96016C6.71093 13.9932 6.48939 13.7717 6.48939 13.5225V13.0517C6.48939 12.8025 6.68323 12.5809 6.96016 12.5809H7.43093C7.68016 12.5809 7.9017 12.8025 7.9017 13.0517V13.5225H7.874ZM7.874 11.1686C7.874 11.4179 7.68016 11.6394 7.40323 11.6394H6.96016C6.71093 11.6394 6.48939 11.4179 6.48939 11.1686V10.6979C6.48939 10.4486 6.68323 10.2271 6.96016 10.2271H7.43093C7.68016 10.2271 7.9017 10.4486 7.9017 10.6979V11.1686H7.874ZM7.874 8.81478C7.874 9.06401 7.68016 9.28555 7.40323 9.28555H6.96016C6.71093 9.28555 6.48939 9.06401 6.48939 8.81478V8.34401C6.48939 8.09478 6.68323 7.87325 6.96016 7.87325H7.43093C7.68016 7.87325 7.9017 8.09478 7.9017 8.34401V8.81478H7.874ZM10.394 15.904C10.394 16.1532 10.2002 16.3748 9.92323 16.3748H9.45247C9.20324 16.3748 8.9817 16.1532 8.9817 15.904V15.4332C8.9817 15.184 9.17554 14.9625 9.45247 14.9625H9.92323C10.1725 14.9625 10.394 15.184 10.394 15.4332V15.904ZM10.394 13.5225C10.394 13.7717 10.2002 13.9932 9.92323 13.9932H9.45247C9.20324 13.9932 8.9817 13.7717 8.9817 13.5225V13.0517C8.9817 12.8025 9.17554 12.5809 9.45247 12.5809H9.92323C10.1725 12.5809 10.394 12.8025 10.394 13.0517V13.5225ZM10.394 11.1686C10.394 11.4179 10.2002 11.6394 9.92323 11.6394H9.45247C9.20324 11.6394 8.9817 11.4179 8.9817 11.1686V10.6979C8.9817 10.4486 9.17554 10.2271 9.45247 10.2271H9.92323C10.1725 10.2271 10.394 10.4486 10.394 10.6979V11.1686ZM10.394 8.81478C10.394 9.06401 10.2002 9.28555 9.92323 9.28555H9.45247C9.20324 9.28555 8.9817 9.06401 8.9817 8.81478V8.34401C8.9817 8.09478 9.17554 7.87325 9.45247 7.87325H9.92323C10.1725 7.87325 10.394 8.09478 10.394 8.34401V8.81478ZM12.914 8.81478C12.914 9.06401 12.7202 9.28555 12.4432 9.28555H12.0002C11.7509 9.28555 11.5294 9.06401 11.5294 8.81478V8.34401C11.5294 8.09478 11.7232 7.87325 12.0002 7.87325H12.4709C12.7202 7.87325 12.9417 8.09478 12.9417 8.34401V8.81478H12.914Z" fill="white"/>
                </svg>
              </span>
            )}
            {row.type === 'product' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', marginRight: '4px', width: '24px', height: '24px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clipPath="url(#timeDimensionsProductClip)">
                    <rect width="24" height="24" rx="4" fill="var(--color-dimension-product-icon)" />
                    <path d="M5.2798 15.8408H6.4798C6.7438 15.8408 6.9598 15.6248 6.9598 15.3608V7.92078C6.9598 7.65678 6.7438 7.44078 6.4798 7.44078H5.2798C5.0158 7.44078 4.7998 7.65678 4.7998 7.92078V15.3608C4.7998 15.6248 5.0158 15.8408 5.2798 15.8408ZM18.7198 7.44078H17.5198C17.2558 7.44078 17.0398 7.65678 17.0398 7.92078V15.3608C17.0398 15.6248 17.2558 15.8408 17.5198 15.8408H18.7198C18.9838 15.8408 19.1998 15.6248 19.1998 15.3608V7.92078C19.1998 7.65678 18.9838 7.44078 18.7198 7.44078ZM12.7198 15.8408C12.9838 15.8408 13.1998 15.6248 13.1998 15.3608V7.92078C13.1998 7.65678 12.9838 7.44078 12.7198 7.44078H11.2798C11.0158 7.44078 10.7998 7.65678 10.7998 7.92078V15.3608C10.7998 15.6248 11.0158 15.8408 11.2798 15.8408H12.7198ZM15.5998 15.8408C15.8638 15.8408 16.0798 15.6248 16.0798 15.3608V7.92078C16.0798 7.65678 15.8638 7.44078 15.5998 7.44078H15.1198C14.8558 7.44078 14.6398 7.65678 14.6398 7.92078V15.3608C14.6398 15.6248 14.8558 15.8408 15.1198 15.8408H15.5998ZM9.3598 15.8408C9.6238 15.8408 9.8398 15.6248 9.8398 15.3608V7.92078C9.8398 7.65678 9.6238 7.44078 9.3598 7.44078H8.8798C8.6158 7.44078 8.3998 7.65678 8.3998 7.92078V15.3608C8.3998 15.6248 8.6158 15.8408 8.8798 15.8408H9.3598ZM18.7198 17.2808H5.2798C5.0158 17.2808 4.7998 17.4968 4.7998 17.7608V18.2408C4.7998 18.5048 5.0158 18.7208 5.2798 18.7208H18.7198C18.9838 18.7208 19.1998 18.5048 19.1998 18.2408V17.7608C19.1998 17.4968 18.9838 17.2808 18.7198 17.2808ZM18.7198 4.80078H5.2798C5.0158 4.80078 4.7998 5.01678 4.7998 5.28078V5.76078C4.7998 6.02478 5.0158 6.24078 5.2798 6.24078H18.7198C18.9838 6.24078 19.1998 6.02478 19.1998 5.76078V5.28078C19.1998 5.01678 18.9838 4.80078 18.7198 4.80078Z" fill="white"/>
                  </g>
                  <defs>
                    <clipPath id="timeDimensionsProductClip">
                      <rect width="24" height="24" rx="12" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
              </span>
            )}
            {row.type === 'category' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', marginRight: '4px', width: '24px', height: '24px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clipPath="url(#timeDimensionsCategoryClip)">
                    <rect width="24" height="24" rx="4" fill="#396547"/>
                    <path d="M14.8318 7.05678L16.9678 9.19278C17.4478 9.64878 17.4478 10.4168 16.9678 10.8728L11.3998 16.4168V8.78478L13.1278 7.03278C13.2409 6.92186 13.3749 6.83445 13.522 6.77558C13.6691 6.7167 13.8264 6.68754 13.9848 6.68977C14.1432 6.692 14.2996 6.72558 14.445 6.78858C14.5904 6.85157 14.7218 6.94272 14.8318 7.05678ZM8.9998 4.80078H5.9998C5.68154 4.80078 5.37632 4.92721 5.15128 5.15225C4.92623 5.3773 4.7998 5.68252 4.7998 6.00078V16.5128C4.7998 16.8658 4.86933 17.2153 5.00442 17.5414C5.1395 17.8676 5.3375 18.1639 5.5871 18.4135C5.83671 18.6631 6.13303 18.8611 6.45915 18.9962C6.78527 19.1313 7.13481 19.2008 7.4878 19.2008C7.8408 19.2008 8.19033 19.1313 8.51646 18.9962C8.84258 18.8611 9.1389 18.6631 9.38851 18.4135C9.63811 18.1639 9.83611 17.8676 9.97119 17.5414C10.1063 17.2153 10.1758 16.8658 10.1758 16.5128V6.00078C10.1998 5.32878 9.6478 4.80078 8.9998 4.80078ZM7.4878 17.7128C6.8158 17.7128 6.2878 17.1848 6.2878 16.5128C6.2878 15.8408 6.8158 15.3128 7.4878 15.3128C8.1598 15.3128 8.6878 15.8408 8.6878 16.5128C8.6878 17.1848 8.1598 17.7128 7.4878 17.7128ZM17.9998 13.8008H15.8878L14.4478 15.2408H17.7598L17.7358 17.7608H11.9518L10.5118 19.2008H17.9998C18.3181 19.2008 18.6233 19.0744 18.8483 18.8493C19.0734 18.6243 19.1998 18.319 19.1998 18.0008V15.0008C19.1998 14.6825 19.0734 14.3773 18.8483 14.1523C18.6233 13.9272 18.3181 13.8008 17.9998 13.8008Z" fill="white"/>
                  </g>
                  <defs>
                    <clipPath id="timeDimensionsCategoryClip">
                      <rect width="24" height="24" rx="12" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
              </span>
            )}
            <span className="cell-name">
              {searchTerm && searchTerm.trim() ? (() => {
                const searchTerms = extractSearchTerms(searchTerm);
                const { timeTerms, otherTerms } = separateSearchTerms(searchTerms);
                const allTerms = [...timeTerms, ...otherTerms];
                return allTerms.length > 0 ? (
                  <SearchHighlight text={row.name} searchTerms={allTerms} />
                ) : (
                  row.name
                );
              })() : row.name}
            </span>
            {/* 3-dot menu button for dimension rows */}
            {(row.type === 'account' || row.type === 'category' || row.type === 'product') && (
              <button
                type="button"
                ref={dimensionMenuRef}
                aria-haspopup="menu"
                aria-expanded={showDimensionMenu}
                aria-label="Row actions"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDimensionMenu(!showDimensionMenu);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 'auto',
                  marginRight: '8px',
                  padding: '4px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--slds-g-color-neutral-base-95)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="3" r="1.5" fill="var(--slds-g-color-neutral-base-50)"/>
                  <circle cx="8" cy="8" r="1.5" fill="var(--slds-g-color-neutral-base-50)"/>
                  <circle cx="8" cy="13" r="1.5" fill="var(--slds-g-color-neutral-base-50)"/>
                </svg>
                {/* Dropdown menu rendered via portal */}
                {showDimensionMenu && dimensionMenuPosition && createPortal(
                  <div
                    className="dimension-menu-dropdown"
                    style={{
                      position: 'fixed',
                      top: dimensionMenuPosition.top,
                      left: dimensionMenuPosition.left,
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      zIndex: 10000,
                      minWidth: '160px',
                      overflow: 'hidden'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {showExpandCollapseOptions && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            handleExpandAll();
                            setShowDimensionMenu(false);
                          }}
                          style={{
                            padding: '10px 12px',
                            fontSize: '13px',
                            color: 'var(--color-on-surface-strong)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'background-color 0.15s',
                            width: '100%',
                            border: 'none',
                            background: 'var(--color-surface-white)',
                            font: 'inherit',
                            textAlign: 'left',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--slds-g-color-neutral-base-95)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                          }}
                        >
                          <span>Expand All</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleCollapseAll();
                            setShowDimensionMenu(false);
                          }}
                          style={{
                            padding: '10px 12px',
                            fontSize: '13px',
                            color: 'var(--color-on-surface-strong)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            border: 'none',
                            borderTop: '1px solid #e5e7eb',
                            transition: 'background-color 0.15s',
                            width: '100%',
                            background: 'var(--color-surface-white)',
                            font: 'inherit',
                            textAlign: 'left',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--slds-g-color-neutral-base-95)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                          }}
                        >
                          <span>Collapse All</span>
                        </button>
                      </>
                    )}
                    {hasChildren && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowDimensionMenu(false);
                          setShowAddRemoveChildNodesModal(true);
                        }}
                        style={{
                          padding: '10px 12px',
                          fontSize: '13px',
                          color: 'var(--color-on-surface-strong)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: 'none',
                          borderTop: showExpandCollapseOptions ? '1px solid #e5e7eb' : 'none',
                          transition: 'background-color 0.15s',
                          width: '100%',
                          background: 'var(--color-surface-white)',
                          font: 'inherit',
                          textAlign: 'left',
                          appearance: 'none',
                          WebkitAppearance: 'none',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--slds-g-color-neutral-base-95)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                        }}
                      >
                        <span>Quick Filter</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowDimensionMenu(false);
                        setShowMoreNodeSettingsModal(true);
                      }}
                      style={{
                        padding: '10px 12px',
                        fontSize: '13px',
                        color: 'var(--color-on-surface-strong)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        border: 'none',
                        borderTop: '1px solid #e5e7eb',
                        transition: 'background-color 0.15s',
                        width: '100%',
                        background: 'var(--color-surface-white)',
                        font: 'inherit',
                        textAlign: 'left',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--slds-g-color-neutral-base-95)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                    >
                      <span>Node Settings</span>
                    </button>
                  </div>,
                  document.body
                )}
              </button>
            )}
          </div>
        </td>
        {measures.map((measure) => {
          const cellKey = `${row.id}-${measure.id}`;
          const isFocused = focusedCell?.rowId === row.id && focusedCell?.measureId === measure.id;
          const isEditable = row.type === 'account' || row.type === 'category' || row.type === 'product';
          
          // Check if this cell is edited or impacted
          const editedOriginalValue = editedCells?.get(cellKey);
          const impactedOriginalValue = impactedCells?.get(cellKey);
          const savedIconColorCheck = savedEditedCells?.get(cellKey);
          const isSavedEdited = savedIconColorCheck !== undefined;
          const isDirectlyEdited = editedOriginalValue !== undefined;
          const isImpacted = !isDirectlyEdited && impactedOriginalValue !== undefined;
          
          const isSelected = selectedCells?.has(cellKey) ?? false;

          // Priority order: edited > impacted > saved edited
          let cellClassName = 'grid-cell cell-value-cell';
          if (isFocused) cellClassName += ' cell-focused';
          if (isSelected) cellClassName += ' cell-selected';
          if (isDirectlyEdited) {
            cellClassName += ' edited-cell';
          } else if (isImpacted) {
            cellClassName += ' impacted-cell';
          }

          const isNewlyAddedColumn = newlyAddedMeasureIds.includes(measure.id);
          if (isNewlyAddedColumn) cellClassName += ' newly-added-measure-column-cell';

          return (
            <td
              {...gridcellA11y}
              key={cellKey}
              data-cell-key={cellKey}
              style={{
                minWidth: `${columnWidth}px`,
                width: `${columnWidth}px`,
                position: 'relative',
                cursor: isEditable ? 'pointer' : 'default',
              }}
              ref={(el) => {
                if (el && cellRefs) {
                  cellRefs.current.set(cellKey, el);
                }
              }}
              className={cellClassName}
              tabIndex={isEditable ? 0 : -1}
              onMouseEnter={() => {
                if (isEditable) setHoveredMeasureId(measure.id);
              }}
              onMouseLeave={() => {
                setHoveredMeasureId(null);
              }}
              onMouseDown={(e) => {
                if (isEditable && onCellMouseDown && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.button === 0) {
                  onCellMouseDown(cellKey, e);
                }
              }}
              onClick={(e) => {
                if (!isEditable || !onCellSelect) return;
                if (e.detail === 2) return; // double-click — let onDoubleClick handle it
                if (editingCell) return; // currently editing this cell
                const isModifier = e.ctrlKey || e.metaKey || e.shiftKey;
                // For modifier keys always call onCellSelect (range/multi-select).
                // For plain clicks only call it if the cell is not already selected —
                // this avoids a state update between the two clicks of a double-click,
                // which would restart the onFocusedCellChange timer and steal focus.
                if (isModifier || !selectedCells?.has(cellKey)) {
                  onCellSelect(cellKey, e);
                }
              }}
              onFocus={() => {
                if (isEditable) setFocusedCellKey(cellKey);
                // Don't propagate focus to parent when the input inside is
                // focused (editing mode) — doing so would trigger the
                // TimeDimensionsGrid useEffect that reschedules a td.focus()
                // 100ms later, which would steal focus back from the input
                // and immediately cancel editing.
                if (onCellFocus && isEditable && !editingCell) {
                  onCellFocus({ rowId: row.id, measureId: measure.id });
                }
              }}
              onBlur={() => {
                setFocusedCellKey(null);
              }}
              onDoubleClick={(e) => {
                if (isEditable && !editingCell) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCellEnterKey(measure.id);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isEditable) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCellEnterKey(measure.id);
                }
              }}
            >
              {renderCellValue(measure.id)}
            </td>
          );
        })}
      </tr>
      {hasChildren && isExpanded && row.children && (
        <>
          {row.children.map((child) => (
            <TimeDimensionsRowComponent
              key={child.id}
              row={child}
              level={level + 1}
              isExpanded={expandedRows.has(child.id)}
              expandedRows={expandedRows}
              onToggleExpand={onToggleExpand}
              formatValue={formatValue}
              measures={measures}
              onCellChange={onCellChange}
              focusedCell={focusedCell}
              onCellFocus={onCellFocus}
              cellRefs={cellRefs}
              editedCells={editedCells}
              impactedCells={impactedCells}
              savedEditedCells={savedEditedCells}
              columnWidth={columnWidth}
              searchTerm={searchTerm}
              newlyAddedMeasureIds={newlyAddedMeasureIds}
              onAddChildNode={onAddChildNode}
              onRemoveChildNode={onRemoveChildNode}
              onFilterChildrenNodes={onFilterChildrenNodes}
              onEditNode={onEditNode}
              onDeleteNode={onDeleteNode}
              onReparentNode={onReparentNode}
              data={data}
              selectedCells={selectedCells}
              onCellSelect={onCellSelect}
              onCellMouseDown={onCellMouseDown}
              onCellMouseMove={onCellMouseMove}
            />
          ))}
        </>
      )}
      {/* More Node Settings Modal */}
      <MoreNodeSettingsModal
        isOpen={showMoreNodeSettingsModal}
        onClose={() => setShowMoreNodeSettingsModal(false)}
        anchorElement={dimensionMenuRef.current}
        onReplaceNode={() => {
          if (onEditNode) {
            onEditNode(row.id);
          }
        }}
        onReparentNode={(parentNodeId) => {
          if (onReparentNode) {
            onReparentNode(row.id, parentNodeId);
          }
        }}
        onDeleteNode={() => {
          if (onDeleteNode) {
            onDeleteNode(row.id);
          }
        }}
        nodeName={row.name}
        nodeId={row.id}
        nodeType={row.type === 'account' ? 'account' : row.type === 'category' ? 'category' : row.type === 'product' ? 'product' : undefined}
        data={data}
      />
      <AddRemoveChildNodesModal
        isOpen={showAddRemoveChildNodesModal}
        onClose={() => setShowAddRemoveChildNodesModal(false)}
        anchorElement={dimensionMenuRef.current}
        onAddChildNode={(nodeIds) => {
          if (onAddChildNode) {
            // For now, call for each node ID (can be optimized later)
            nodeIds.forEach(nodeId => onAddChildNode(nodeId));
          }
        }}
        onRemoveChildNode={(nodeIds) => {
          if (onRemoveChildNode) {
            // For now, call for each node ID (can be optimized later)
            nodeIds.forEach(nodeId => onRemoveChildNode(nodeId));
          }
        }}
        nodeName={row.name}
        nodeType={row.type === 'account' ? 'account' : row.type === 'category' ? 'category' : row.type === 'product' ? 'product' : undefined}
        childrenNodes={row.children ? row.children.map(child => ({
          id: child.id,
          name: child.name,
          isSelected: true // All existing children are selected by default
        })) : []}
      />
    </>
  );
};

export default TimeDimensionsRowComponent;


