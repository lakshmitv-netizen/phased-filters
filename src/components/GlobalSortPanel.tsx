import React, { useState, useEffect } from 'react';
import '../styles/components/FiltersPanel.css';
import '../styles/components/GlobalSortPanel.css';

export interface SortCriterion {
  id: string;
  columnKey: string;
  direction: 'asc' | 'desc';
}

export interface DimensionSort {
  id: string;
  /** Dimension level id (matches a row `type`); '' when unset. Deep grids use extra level ids. */
  level: string;
  sortBy: 'alphabetical' | 'measure-sa-qty' | 'measure-sa-rev' | 'measure-opp-qty' | 'measure-opp-rev' | 'measure-order-qty' | 'measure-order-rev' | '';
  direction: 'asc' | 'desc';
}

export interface GlobalSortConfig {
  criteria: SortCriterion[];
  preserveHierarchy: boolean;
  sortMeasures: boolean;
  dimensionSorts?: DimensionSort[];
}

interface GlobalSortPanelProps {
  isOpen: boolean;
  onClose: () => void;
  availableColumns: { key: string; label: string }[];
  initialConfig: GlobalSortConfig;
  onApply: (config: GlobalSortConfig) => void;
  /** When true, "Sort measures" is off, disabled, and cannot be applied on. */
  sortMeasuresDisabled?: boolean;
  /** When false, hide sort criteria strip (section title, rows, Add button). */
  showSortCriteriaSection?: boolean;
  /** Gray bar above criteria (e.g. sort by columns vs subcolumns). */
  sortCriteriaSectionTitle?: string;
  /** Label above the sort picker (e.g. Column vs subcolumn). */
  sortPickerFieldLabel?: string;
  placeholderSelectColumn?: string;
  addSortButtonLabel?: string;
  /** Callback to open sub columns modal */
  onOpenSubColumnsModal?: () => void;
  /** Per-grid dimension levels for the "Sort by dimension level" picker. Defaults to the standard 3. */
  dimensionLevels?: { id: string; name: string }[];
}

const DEFAULT_SORT_DIMENSION_LEVELS = [
  { id: 'account', name: 'Account' },
  { id: 'category', name: 'Category' },
  { id: 'product', name: 'Product' },
];

const GlobalSortPanel: React.FC<GlobalSortPanelProps> = ({
  isOpen,
  onClose,
  availableColumns,
  initialConfig,
  onApply,
  dimensionLevels = DEFAULT_SORT_DIMENSION_LEVELS,
  sortMeasuresDisabled = false,
  showSortCriteriaSection = true,
  sortCriteriaSectionTitle = 'Sort by column',
  sortPickerFieldLabel = 'Column',
  placeholderSelectColumn = 'Select a column',
  addSortButtonLabel = 'Add a sort column',
  onOpenSubColumnsModal,
}) => {
  const [criteria, setCriteria] = useState<SortCriterion[]>(
    initialConfig.criteria.length > 0 ? initialConfig.criteria : [{ id: 's-default', columnKey: '', direction: 'asc' }]
  );
  const [preserveHierarchy, setPreserveHierarchy] = useState(initialConfig.preserveHierarchy);
  const [sortMeasures, setSortMeasures] = useState(initialConfig.sortMeasures ?? false);
  const [isDirty, setIsDirty] = useState(false);
  const [sortDimensionExpanded, setSortDimensionExpanded] = useState(
    (initialConfig.dimensionSorts?.some(d => d.level !== '') ?? false),
  );
  const [sortMeasuresExpanded, setSortMeasuresExpanded] = useState(
    initialConfig.criteria.some(c => c.columnKey !== ''),
  );
  const [dimensionSorts, setDimensionSorts] = useState<DimensionSort[]>(
    initialConfig.dimensionSorts && initialConfig.dimensionSorts.length > 0 
      ? initialConfig.dimensionSorts 
      : [{ id: 'dim-default', level: '', sortBy: 'alphabetical', direction: 'asc' }]
  );

  const defaultCriteria = (): SortCriterion[] =>
    initialConfig.criteria.length > 0
      ? initialConfig.criteria
      : [{ id: `s-default`, columnKey: '', direction: 'asc' }];

  useEffect(() => {
    if (isOpen) {
      setCriteria(defaultCriteria());
      setPreserveHierarchy(initialConfig.preserveHierarchy);
      setSortMeasures(sortMeasuresDisabled ? false : (initialConfig.sortMeasures ?? false));
      setDimensionSorts(
        initialConfig.dimensionSorts && initialConfig.dimensionSorts.length > 0 
          ? initialConfig.dimensionSorts 
          : [{ id: 'dim-default', level: '', sortBy: 'alphabetical', direction: 'asc' }]
      );
      // Auto-expand whichever section has an active sort so it's visible on open.
      setSortDimensionExpanded(initialConfig.dimensionSorts?.some(d => d.level !== '') ?? false);
      setSortMeasuresExpanded(initialConfig.criteria.some(c => c.columnKey !== ''));
      setIsDirty(false);
    }
  }, [isOpen, sortMeasuresDisabled]);

  const markDirty = () => setIsDirty(true);

  const addCriterion = () => {
    setCriteria(prev => [...prev, { id: `s-${Date.now()}`, columnKey: '', direction: 'asc' }]);
    markDirty();
  };

  const removeCriterion = (id: string) => {
    setCriteria(prev => prev.filter(c => c.id !== id));
    markDirty();
  };

  const updateColumn = (id: string, columnKey: string) => {
    setCriteria(prev => prev.map(c => c.id === id ? { ...c, columnKey } : c));
    markDirty();
  };

  const updateDirection = (id: string, direction: 'asc' | 'desc') => {
    setCriteria(prev => prev.map(c => c.id === id ? { ...c, direction } : c));
    markDirty();
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setCriteria(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    markDirty();
  };

  const moveDown = (index: number) => {
    setCriteria(prev => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    markDirty();
  };

  // Dimension sort functions
  const addDimensionSort = () => {
    setDimensionSorts(prev => [...prev, { id: `dim-${Date.now()}`, level: '', sortBy: 'alphabetical', direction: 'asc' }]);
    markDirty();
  };

  const removeDimensionSort = (id: string) => {
    setDimensionSorts(prev => prev.filter(d => d.id !== id));
    markDirty();
  };

  const updateDimensionLevel = (id: string, level: DimensionSort['level']) => {
    setDimensionSorts(prev => prev.map(d => d.id === id ? { ...d, level } : d));
    markDirty();
  };

  const updateDimensionSortBy = (id: string, sortBy: DimensionSort['sortBy']) => {
    setDimensionSorts(prev => prev.map(d => d.id === id ? { ...d, sortBy } : d));
    markDirty();
  };

  const updateDimensionDirection = (id: string, direction: 'asc' | 'desc') => {
    setDimensionSorts(prev => prev.map(d => d.id === id ? { ...d, direction } : d));
    markDirty();
  };

  const sortMeasuresApplied = sortMeasuresDisabled ? false : sortMeasures;

  const handleApply = () => {
    const validCriteria = criteria.filter(c => c.columnKey !== '');
    const validDimensionSorts = dimensionSorts.filter(d => d.level !== '');
    onApply({ 
      criteria: validCriteria, 
      preserveHierarchy, 
      sortMeasures: sortMeasuresApplied,
      dimensionSorts: validDimensionSorts
    });
    setIsDirty(false);
    onClose();
  };

  const handleCancel = () => {
    setCriteria(initialConfig.criteria);
    setPreserveHierarchy(initialConfig.preserveHierarchy);
    setSortMeasures(sortMeasuresDisabled ? false : (initialConfig.sortMeasures ?? false));
    setDimensionSorts(
      initialConfig.dimensionSorts && initialConfig.dimensionSorts.length > 0 
        ? initialConfig.dimensionSorts 
        : [{ id: 'dim-default', level: '', sortBy: 'alphabetical', direction: 'asc' }]
    );
    setIsDirty(false);
  };

  /** Match Filters panel: Cancel reverts and closes the side panel */
  const handleHeaderCancel = () => {
    handleCancel();
    onClose();
  };

  const handleClearAll = () => {
    setCriteria([]);
    onApply({ criteria: [], preserveHierarchy, sortMeasures: sortMeasuresApplied });
    setIsDirty(false);
  };

  if (!isOpen) return null;

  return (
    <div className="sort-panel">
      {/* Panel Header */}
      <div className="sort-panel-header">
        {isDirty ? (
          <>
            <button type="button" className="filters-header-cancel-btn" onClick={handleHeaderCancel}>
              Cancel
            </button>
            <div className="filters-panel-header-actions">
              <button type="button" className="filters-header-apply-only-btn" onClick={handleApply}>
                Apply
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="sort-panel-title-section">
              <button className="sort-panel-back-button" onClick={onClose} aria-label="Back">
                <svg width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M16.923 9.84655C17.2922 9.47731 17.2922 8.92343 16.923 8.55419L9.9076 1.47695C9.53837 1.1077 8.98452 1.1077 8.61529 1.47695L1.5384 8.55419C1.16917 8.92343 1.16917 9.47731 1.5384 9.84655L2.8307 11.1389C3.19993 11.5082 3.75377 11.5082 4.123 11.1389L6.33838 8.92344C6.70761 8.55419 7.38453 8.80035 7.38453 9.35422V22.401C7.38453 22.8933 7.8153 23.3241 8.3076 23.3241H10.1537C10.6461 23.3241 11.0768 22.8318 11.0768 22.401V9.35422C11.0768 8.80035 11.7537 8.55419 12.123 8.92344L14.3383 11.1389C14.7076 11.5082 15.2614 11.5082 15.6307 11.1389L16.923 9.84655V9.84655ZM30.4617 22.1535L29.1694 20.9226C28.8001 20.5534 28.2463 20.5534 27.8771 20.9226L25.6617 23.1381C25.2924 23.5074 24.6155 23.2612 24.6155 22.7073V9.53752C24.6155 9.04519 24.1848 8.61441 23.6925 8.61441H21.8463C21.354 8.61441 20.9232 9.10674 20.9232 9.53752V22.5843C20.9232 23.1381 20.2463 23.3843 19.8771 23.015L17.6617 20.7996C17.2925 20.4303 16.7386 20.4303 16.3694 20.7996L15.0771 22.1535C14.7079 22.5227 14.7079 23.0766 15.0771 23.4458L22.154 30.5231C22.5232 30.8923 23.0771 30.8923 23.4463 30.5231L30.5232 23.4458C30.8309 23.0766 30.8309 22.4612 30.4617 22.1535V22.1535Z" fill="#0250D9"/>
                </svg>
              </button>
              <p className="sort-panel-title">Sort</p>
            </div>
            <div className="sort-panel-actions">
              <button className="sort-panel-close" onClick={onClose} aria-label="Close">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Panel Body */}
      <div className="sort-panel-body">

        <div className="sort-panel-settings">
          <h3 className="sort-panel-settings-heading">Sort settings</h3>
          <button
            type="button"
            className="sort-panel-hierarchy-row"
            aria-pressed={preserveHierarchy}
            onClick={() => { setPreserveHierarchy(v => !v); markDirty(); }}
          >
            <span className={`sort-panel-checkbox${preserveHierarchy ? ' checked' : ''}`} aria-hidden>
              {preserveHierarchy && (
                <svg viewBox="0 0 24 24" fill="none" width="11" height="11">
                  <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span className="sort-panel-hierarchy-label">Preserve hierarchy on sort</span>
          </button>

          {/* Sort Dimension Collapsible */}
          <button
            type="button"
            className="sort-panel-collapsible-header"
            onClick={() => setSortDimensionExpanded(v => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14" style={{ transform: sortDimensionExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Sort dimension</span>
          </button>
          {sortDimensionExpanded && (
            <div className="sort-dimension-content">
              {dimensionSorts.map((dimSort, index) => (
                <div key={dimSort.id} className="sort-criterion-row" style={{ marginTop: index === 0 ? '12px' : '0' }}>
                  <div className="sort-col-field" style={{ flex: 1 }}>
                    <label className="sort-col-field-label">Level</label>
                    <div className="sort-col-select-wrap">
                      <select
                        className="sort-col-select"
                        value={dimSort.level}
                        onChange={e => updateDimensionLevel(dimSort.id, e.target.value as any)}
                      >
                        <option value="">Select level</option>
                        {dimensionLevels.map((lvl) => (
                          <option key={lvl.id} value={lvl.id}>{lvl.name}</option>
                        ))}
                      </select>
                      <svg className="sort-col-select-arrow" viewBox="0 0 24 24" fill="none" width="14" height="14">
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>

                  <div className="sort-col-field" style={{ flex: 1 }}>
                    <label className="sort-col-field-label">Sort by</label>
                    <div className="sort-col-select-wrap">
                      <select
                        className="sort-col-select"
                        value={dimSort.sortBy}
                        onChange={e => updateDimensionSortBy(dimSort.id, e.target.value as any)}
                      >
                        <option value="alphabetical">Alphabetical</option>
                        <option value="measure-sa-qty">Sales Agreement Quantity</option>
                        <option value="measure-sa-rev">Sales Agreement Revenue</option>
                        <option value="measure-opp-qty">Opportunity Quantity</option>
                        <option value="measure-opp-rev">Opportunity Revenue</option>
                        <option value="measure-order-qty">Order Quantity</option>
                        <option value="measure-order-rev">Order Revenue</option>
                      </select>
                      <svg className="sort-col-select-arrow" viewBox="0 0 24 24" fill="none" width="14" height="14">
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>

                  <div className="sort-col-radio-group">
                    <label className="sort-radio-label">
                      <input
                        type="radio"
                        className="sort-radio"
                        checked={dimSort.direction === 'asc'}
                        onChange={() => updateDimensionDirection(dimSort.id, 'asc')}
                      />
                      <span>Ascending</span>
                    </label>
                    <label className="sort-radio-label">
                      <input
                        type="radio"
                        className="sort-radio"
                        checked={dimSort.direction === 'desc'}
                        onChange={() => updateDimensionDirection(dimSort.id, 'desc')}
                      />
                      <span>Descending</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    className="sort-remove-btn"
                    onClick={() => removeDimensionSort(dimSort.id)}
                    disabled={!dimSort.level}
                    title="Remove dimension sort"
                  >
                    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                      <path d="M6 7h12M10 11v6M14 11v6M9 7V5h6v2M8 7l1 12h6l1-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              ))}
              
              <button
                type="button"
                className="sort-add-btn"
                onClick={addDimensionSort}
              >
                <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Add a level sort
              </button>
            </div>
          )}

          {/* Sort Measures Collapsible */}
          <button
            type="button"
            className="sort-panel-collapsible-header"
            onClick={() => setSortMeasuresExpanded(v => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14" style={{ transform: sortMeasuresExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Sort measures</span>
          </button>
          {sortMeasuresExpanded && (
            <div className="sort-measures-content">
              <p className="sort-measures-info">
                Subcolumns need to be enabled for this feature.{' '}
                {onOpenSubColumnsModal && (
                  <button
                    type="button"
                    className="sort-measures-link"
                    onClick={onOpenSubColumnsModal}
                  >
                    Open Sub-columns settings
                  </button>
                )}
              </p>
              {showSortCriteriaSection && (
                <>
                  
                  {/* Criteria list */}
                  {criteria.map((criterion, index) => {
          const otherKeys = new Set(criteria.filter(c => c.id !== criterion.id).map(c => c.columnKey));
          const options = availableColumns.filter(col => !otherKeys.has(col.key));
          const sectionLabel = index === 0 ? 'Sort by' : 'Then by';

          return (
            <div key={criterion.id} className="sort-criterion-section">
              <div className="sort-criterion-label">{sectionLabel}</div>
              <div className="sort-criterion-row">

                {/* Reorder arrows */}
                <div className="sort-reorder-group">
                  <button
                    type="button"
                    className="sort-arrow-btn"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    title="Move up"
                  >
                    <svg viewBox="0 0 24 24" fill="none" width="13" height="13">
                      <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="sort-arrow-btn"
                    onClick={() => moveDown(index)}
                    disabled={index === criteria.length - 1}
                    title="Move down"
                  >
                    <svg viewBox="0 0 24 24" fill="none" width="13" height="13">
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>

                {/* Column dropdown */}
                <div className="sort-col-field">
                  <label className="sort-col-field-label" htmlFor={`sort-col-${criterion.id}`}>
                    {sortPickerFieldLabel}
                  </label>
                  <div className="sort-col-select-wrap">
                    <select
                      id={`sort-col-${criterion.id}`}
                      className="sort-col-select"
                      value={criterion.columnKey}
                      onChange={e => updateColumn(criterion.id, e.target.value)}
                    >
                      <option value="">{placeholderSelectColumn}</option>
                      {options.map(col => (
                        <option key={col.key} value={col.key}>{col.label}</option>
                      ))}
                    </select>
                    <svg className="sort-col-select-caret" viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>

                {/* Radio: Ascending / Descending */}
                <div className="sort-radio-group">
                  <label className="sort-radio-label" onClick={() => updateDirection(criterion.id, 'asc')}>
                    <div className={`sort-radio${criterion.direction === 'asc' ? ' checked' : ''}`}>
                      {criterion.direction === 'asc' && <div className="sort-radio-dot"/>}
                    </div>
                    Ascending
                  </label>
                  <label className="sort-radio-label" onClick={() => updateDirection(criterion.id, 'desc')}>
                    <div className={`sort-radio${criterion.direction === 'desc' ? ' checked' : ''}`}>
                      {criterion.direction === 'desc' && <div className="sort-radio-dot"/>}
                    </div>
                    Descending
                  </label>
                </div>

                {/* Trash */}
                <button
                  type="button"
                  className="sort-trash-btn"
                  onClick={() => removeCriterion(criterion.id)}
                  title="Remove"
                >
                  <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          );
                  })}

                  {/* Add button — right below the last criterion block */}
                  <button className="sort-add-btn" onClick={addCriterion}>
                    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                    {addSortButtonLabel}
                  </button>

                  {/* Remove All link at the bottom */}
                  {criteria.some(c => c.columnKey !== '') && (
                    <div className="filters-actions" style={{ marginTop: 'auto' }}>
                      <button className="filters-link filters-link-right" onClick={handleClearAll}>
                        Remove All
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalSortPanel;
