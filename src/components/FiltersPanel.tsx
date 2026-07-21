import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MeasureData, GridRow, ParentTotalsRollupMode } from '../types';

import UnifiedFilterPopover from './UnifiedFilterPopover';
import ReorderMeasuresModal from './ReorderMeasuresModal';
import ScopedNotification from './ScopedNotification';
import { measureSubgroupOptions } from './SettingsPanel';
import { getMockData } from '../data/mockData';
import { adjustmentMeasuresData } from '../data/adjustmentMeasuresData';
import { useIndustry } from '../contexts/IndustryContext';
import type { IndustryType } from '../contexts/IndustryContext';
import { getDimensionScheme } from '../data/dimensionSchemes';
import { isConfigIndustry, getConfigMeasureCategories } from '../data/planConfigGridData';
import '../styles/components/FiltersPanel.css';

// A dimension "filter field" for the current grid scheme. `type` is the Filter.type stored
// on cards (kept as the legacy account/category/products values for the default scheme so
// saved sets, Agentforce hand-off, and the engine keep working); `rowType` is the GridRow
// type matched in the data; `name` is the display label. Non-default schemes (deep / Acme)
// use the level id for both `type` and `rowType`.
export interface DimensionFilterField {
  type: string;
  rowType: string;
  name: string;
  /** The hierarchy this level belongs to (e.g. "Account Hierarchy" / "Product Hierarchy"),
   * used to group the dimension filters into sections. */
  hierarchy: string;
}

const getDimensionFilterFields = (industry: IndustryType | null): DimensionFilterField[] =>
  getDimensionScheme(industry).map((lvl) => {
    if (lvl.id === 'account') return { type: 'account', rowType: 'account', name: 'Accounts', hierarchy: lvl.hierarchy };
    if (lvl.id === 'category') return { type: 'category', rowType: 'category', name: 'Category', hierarchy: lvl.hierarchy };
    if (lvl.id === 'product') return { type: 'products', rowType: 'product', name: 'Products', hierarchy: lvl.hierarchy };
    return { type: lvl.id, rowType: lvl.id, name: lvl.name, hierarchy: lvl.hierarchy };
  });

// ── Predefined filter sets (intent-driven presets) ──────────────────────────────
// Selecting a set auto-populates every basic & advanced filter field.
interface FilterSetDef {
  name: string;
  measures: string[];
  accounts: string[];
  categories: string[];
  products: string[];
  from: string; // month key, e.g. 'apr2026'
  to: string;
  /** 'standard' = shared business presets; 'watchlist' = personal monitoring lists. */
  group?: 'standard' | 'watchlist';
}

const FILTER_SETS: FilterSetDef[] = [
  // ── Standard, shared business presets ──────────────────────────────────────
  {
    name: 'Quarterly Business Review',
    group: 'standard',
    measures: ['Sales Agreement Revenue', 'Forecasted Revenue', 'Order Revenue', 'Opportunity Revenue'],
    accounts: [],
    categories: [],
    products: [],
    from: 'apr2026',
    to: 'jun2026',
  },
  {
    name: 'YoY Performance Review',
    group: 'standard',
    measures: ['Order Revenue', 'Last Years Order Revenue', 'Order Quantity (No.s)', 'Last Year Order Quantity (No.s)'],
    accounts: [],
    categories: [],
    products: [],
    from: 'jan2026',
    to: 'dec2026',
  },
  {
    name: 'Monthly Close',
    group: 'standard',
    measures: ['Order Revenue', 'Forecasted Revenue'],
    accounts: [],
    categories: [],
    products: [],
    from: 'jun2026',
    to: 'jun2026',
  },
  // ── My Watchlists — personal, cherry-picked lists to keep an eye on ─────────
  {
    // Accounts I suspect will slip and want to stay vigilant on (was "Revenue at Risk").
    name: 'Accounts on Watch',
    group: 'watchlist',
    measures: ['Order Revenue', 'Forecasted Revenue'],
    accounts: ['MagnaDrive - Georgia Plant', 'MagnaDrive - California Plant', 'MagnaDrive - Illinois Plant'],
    categories: [],
    products: [],
    from: 'jan2026',
    to: 'dec2026',
  },
  {
    // Cherry-picked products/categories I keep hearing about in customer calls.
    name: 'Customer Call Watchlist',
    group: 'watchlist',
    measures: ['Order Revenue', 'Opportunity Revenue'],
    accounts: [],
    categories: ['Transmission Assembly', 'Engine Components'],
    products: [],
    from: 'jan2026',
    to: 'dec2026',
  },
  {
    // Specific SKUs I'm watching closely for a slip.
    name: 'Products to Watch',
    group: 'watchlist',
    measures: ['Order Revenue', 'Forecasted Revenue'],
    accounts: [],
    categories: [],
    products: ['TRN 950 - Xtreme', 'CVT Module - Gen3', 'Head Gasket Kit'],
    from: 'jan2026',
    to: 'dec2026',
  },
];

const MONTHS = [
  { key: 'jan2026', label: 'Jan 2026' },
  { key: 'feb2026', label: 'Feb 2026' },
  { key: 'mar2026', label: 'Mar 2026' },
  { key: 'apr2026', label: 'Apr 2026' },
  { key: 'may2026', label: 'May 2026' },
  { key: 'jun2026', label: 'Jun 2026' },
  { key: 'jul2026', label: 'Jul 2026' },
  { key: 'aug2026', label: 'Aug 2026' },
  { key: 'sep2026', label: 'Sep 2026' },
  { key: 'oct2026', label: 'Oct 2026' },
  { key: 'nov2026', label: 'Nov 2026' },
  { key: 'dec2026', label: 'Dec 2026' },
];

// `type` is 'measures' | 'time' | 'new', or a dimension field type (legacy
// account/category/products for the default scheme, or a scheme level id for deep/Acme).
type FilterType = 'measures' | 'time' | 'new' | string;

interface Filter {
  id: string;
  type: FilterType;
  label: string;
  value: string;
  field?: string;
  operator?: string;
}

interface BasicFilterMultiSelectProps {
  id: string;
  labelId: string;
  options: string[];
  selected: Set<string>;
  onChange: (values: string[]) => void;
  /**
   * When true, an empty selection is treated as "all options checked" (the default
   * "All" state renders every checkbox ticked). Used for Measures so that picking a
   * measure category auto-checks its measures and the user filters down by unchecking.
   */
  treatEmptyAsAll?: boolean;
}

/**
 * Small blue info icon with an SLDS-style tooltip (rendered via a portal so it isn't
 * clipped by the panel's overflow). Used next to filter labels to explain behavior.
 */
const LabelInfoTooltip: React.FC<{ text: string }> = ({ text }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top - 8, left: r.left + r.width / 2 });
  };
  const hide = () => setPos(null);
  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
      role="img"
      aria-label={text}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        marginLeft: '4px',
        color: 'var(--slds-g-color-brand-base-30, #0176d3)',
        outline: 'none',
        cursor: 'default',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 4.4a1.35 1.35 0 110 2.7 1.35 1.35 0 010-2.7zM13.5 17.4h-3v-1.25h.75v-3.3h-.75V11.6h2.25v4.55h.75v1.25z" />
      </svg>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: 'translate(-50%, -100%)',
              background: 'var(--slds-g-color-brand-base-30, #0176d3)',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 400,
              lineHeight: 1.35,
              padding: '8px 10px',
              borderRadius: '6px',
              maxWidth: '240px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              zIndex: 10001,
              whiteSpace: 'normal',
              pointerEvents: 'none',
            }}
          >
            {text}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                bottom: '-5px',
                left: '50%',
                transform: 'translateX(-50%) rotate(45deg)',
                width: '10px',
                height: '10px',
                background: 'var(--slds-g-color-brand-base-30, #0176d3)',
              }}
            />
          </div>,
          document.body,
        )}
    </span>
  );
};

/** Comma-separated values in filter state; empty selection = no filter (All). */
const BasicFilterMultiSelect: React.FC<BasicFilterMultiSelectProps> = ({
  id,
  labelId,
  options,
  selected,
  onChange,
  treatEmptyAsAll = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    // Focus the search box so the user can type immediately.
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => { document.removeEventListener('mousedown', onDoc); clearTimeout(t); };
  }, [open]);

  const filteredOptions = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  // When treatEmptyAsAll is on, an empty selection means "everything checked" — so the
  // rendered/checkbox state derives from the full option list rather than the raw `selected`.
  const allChecked = treatEmptyAsAll && selected.size === 0;
  const effectiveSelected = allChecked ? new Set(options) : selected;

  const allCheckboxRef = useRef<HTMLInputElement>(null);
  const allFilteredSelected = filteredOptions.length > 0 && filteredOptions.every(o => effectiveSelected.has(o));
  const someFilteredSelected = filteredOptions.some(o => effectiveSelected.has(o));

  // Normalize a next selection: under treatEmptyAsAll, "all options selected" collapses
  // back to empty so the control reads "All" and stays consistent with the filter model.
  const emitSelection = (next: Set<string>) => {
    if (treatEmptyAsAll && options.length > 0 && next.size === options.length && options.every(o => next.has(o))) {
      onChange([]);
    } else {
      onChange(Array.from(next));
    }
  };

  useEffect(() => {
    if (allCheckboxRef.current) {
      allCheckboxRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
    }
  }, [someFilteredSelected, allFilteredSelected]);

  // "All" checkbox: select / deselect every option currently shown (respects the search term).
  const toggleAllFiltered = () => {
    const next = new Set(effectiveSelected);
    if (allFilteredSelected) filteredOptions.forEach(o => next.delete(o));
    else filteredOptions.forEach(o => next.add(o));
    emitSelection(next);
  };

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  }, []);

  const toggleOption = (opt: string) => {
    const next = new Set(effectiveSelected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    emitSelection(next);
  };

  const summary =
    selected.size === 0
      ? 'All'
      : options.length > 0 && selected.size === options.length && options.every(o => selected.has(o))
        ? 'All'
        : selected.size === 1
          ? Array.from(selected)[0]
          : selected.size === 2
            ? `${Array.from(selected)[0]}, ${Array.from(selected)[1]}`
            : `${selected.size} selected`;

  return (
    <div
      className={`filters-basic-ms${open ? ' filters-basic-ms--open' : ''}`}
      ref={wrapRef}
      onKeyDown={onKeyDown}
    >
      <div
        className="filters-basic-ms-trigger"
        onClick={() => { setOpen(true); searchRef.current?.focus(); }}
      >
        <input
          ref={searchRef}
          id={id}
          type="text"
          className="filters-basic-ms-input"
          role="combobox"
          aria-labelledby={labelId}
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={summary}
          value={open ? query : summary}
          title={selected.size > 1 ? Array.from(selected).join(', ') : undefined}
          onFocus={() => setOpen(true)}
          onChange={e => { setOpen(true); setQuery(e.target.value); }}
        />
        <svg
          className="filters-basic-ms-chevron"
          width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {open && (
        <div className="filters-basic-ms-dropdown" role="listbox" aria-multiselectable="true">
          <div className="filters-basic-ms-dropdown-head">
            <label className="filters-basic-ms-option">
              <input
                ref={allCheckboxRef}
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAllFiltered}
                disabled={filteredOptions.length === 0}
              />
              <span className="filters-basic-ms-option-label">{query.trim() ? 'All matches' : 'All'}</span>
            </label>
          </div>
          <div className="filters-basic-ms-list">
            {options.length === 0 ? (
              <div className="filters-basic-ms-empty">No options</div>
            ) : filteredOptions.length === 0 ? (
              <div className="filters-basic-ms-empty">No matches</div>
            ) : (
              filteredOptions.map(opt => (
                <label key={opt} className="filters-basic-ms-option">
                  <input
                    type="checkbox"
                    checked={effectiveSelected.has(opt)}
                    onChange={() => toggleOption(opt)}
                  />
                  <span className="filters-basic-ms-option-label">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface FiltersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMeasureSubgroup?: Set<string>;
  onMeasureSubgroupChange?: (subgroups: Set<string>) => void;
  selectedDimensionLevels?: Set<string>;
  onDimensionLevelsChange?: (levels: Set<string>) => void;
  data?: MeasureData[];
  // Measure subsets control (moved here from Settings): current measure tree, visibility,
  // reorder callback, and auto-lock ids so "Configure Measures" works from Filters.
  measures?: MeasureData[];
  visibleMeasureIds?: Set<string>;
  autoLockMeasureIds?: Set<string>;
  onMeasuresReorder?: (orderedMeasures: MeasureData[], visibleMeasureIds: Set<string>, autoLockMeasureIds?: Set<string>) => void;
  showAllPeriods?: boolean;
  onShowAllPeriodsChange?: (showAll: boolean) => void;
  startPeriod?: string;
  endPeriod?: string;
  onStartPeriodChange?: (period: string) => void;
  onEndPeriodChange?: (period: string) => void;
  onApplyFilters?: (
    filteredData: MeasureData[],
    options?: { ensureMeasureIdsVisible: string[] },
  ) => void;
  onActiveFilterCountChange?: (count: number) => void;
  parentTotalsRollupMode?: ParentTotalsRollupMode;
  onParentTotalsRollupModeChange?: (mode: ParentTotalsRollupMode) => void;
  propagateIntoNoMatchRows?: boolean;
  onPropagateIntoNoMatchRowsChange?: (value: boolean) => void;
  measureEditDisaggregateToVisibleChildrenOnly?: boolean;
  onMeasureEditDisaggregateToVisibleChildrenOnlyChange?: (value: boolean) => void;
  // External filter control for intent-based filtering
  externalAccounts?: string[];
  externalCategories?: string[];
  externalMeasures?: string[];
  // Registers a handler the parent can call to clear all filter cards back to "All".
  onRegisterClearAll?: (handler: () => void) => void;
  /** When the panel opens, force this tab (e.g. 'advanced' for Agentforce hand-off). */
  initialTab?: 'basic' | 'advanced';
  /** Bumped by the parent to force re-applying initialTab on a fresh open. */
  initialTabSignal?: number;
  /** Pre-populate the "Filter Logic" box (e.g. an agent-derived "1 AND 2"). */
  externalFilterLogic?: string;
  /** Bumped by the parent to (re)apply externalFilterLogic. */
  externalFilterLogicSignal?: number;
  /** Selected time granularities (year/quarter/month/week) — drives the Time filter period options. */
  selectedTimeGranularities?: Set<string>;
}

const FiltersPanel: React.FC<FiltersPanelProps> = ({ 
  isOpen, 
  onClose,
  selectedMeasureSubgroup,
  onMeasureSubgroupChange,
  selectedDimensionLevels: _selectedDimensionLevels,
  onDimensionLevelsChange: _onDimensionLevelsChange,
  data = [],
  measures = [],
  visibleMeasureIds = new Set<string>(),
  autoLockMeasureIds,
  onMeasuresReorder,
  showAllPeriods = true,
  onShowAllPeriodsChange,
  startPeriod = '',
  endPeriod = '',
  onStartPeriodChange,
  onEndPeriodChange,
  onApplyFilters,
  onActiveFilterCountChange,
  parentTotalsRollupMode: parentTotalsRollupModeProp = 'fullHierarchy',
  onParentTotalsRollupModeChange,
  propagateIntoNoMatchRows: propagateIntoNoMatchRowsProp = false,
  onPropagateIntoNoMatchRowsChange,
  measureEditDisaggregateToVisibleChildrenOnly: measureEditDisaggregateToVisibleChildrenOnlyProp = false,
  onMeasureEditDisaggregateToVisibleChildrenOnlyChange,
  externalAccounts = [],
  externalCategories = [],
  externalMeasures = [],
  onRegisterClearAll,
  initialTab,
  initialTabSignal,
  externalFilterLogic,
  externalFilterLogicSignal,
  selectedTimeGranularities,
}) => {
  const { industry } = useIndustry();

  // Dimension filter fields for this grid's scheme (default = account/category/products;
  // deep / Acme = their own levels). Drives the default cards, basic-tab multiselects,
  // the apply engine, and the editor's Field picker.
  const dimFields = useMemo(() => getDimensionFilterFields(industry), [industry]);
  const dimFieldTypes = useMemo(() => new Set(dimFields.map((d) => d.type)), [dimFields]);
  // Group dimension filters into collapsible sections by hierarchy (Account vs Product),
  // preserving their order in the scheme.
  const dimSections = useMemo(() => {
    const groups: { hierarchy: string; fields: DimensionFilterField[] }[] = [];
    dimFields.forEach((df) => {
      const last = groups[groups.length - 1];
      if (last && last.hierarchy === df.hierarchy) last.fields.push(df);
      else groups.push({ hierarchy: df.hierarchy, fields: [df] });
    });
    return groups;
  }, [dimFields]);
  const [collapsedDimSections, setCollapsedDimSections] = useState<Set<string>>(new Set());
  const toggleDimSection = useCallback((hierarchy: string) => {
    setCollapsedDimSections((prev) => {
      const next = new Set(prev);
      if (next.has(hierarchy)) next.delete(hierarchy);
      else next.add(hierarchy);
      return next;
    });
  }, []);
  const nameForDimType = useCallback(
    (type: string) => dimFields.find((d) => d.type === type)?.name ?? type,
    [dimFields],
  );
  // Build the full default set of filter cards (measures + one per dimension level + time).
  const makeDefaultFilters = useCallback(
    (): Filter[] => [
      { id: 'flt-measures', type: 'measures', label: 'Filter by Measure', value: 'Equals All' },
      ...dimFields.map((d) => ({
        id: `flt-${d.type}`,
        type: d.type,
        label: `Filter by ${d.name}`,
        value: 'Equals All',
        operator: 'equals',
      })),
      { id: 'flt-time', type: 'time', label: 'Filter by Time', value: 'Equals Jan 26 to Dec 26' },
    ],
    [dimFields],
  );

  // ── Measure subsets control (relocated from Settings) ───────────────────────
  // Config-driven grids expose the plan config's subsets as measure categories.
  const effectiveSubgroupOptions = useMemo(() => {
    if (isConfigIndustry(industry)) {
      const cats = getConfigMeasureCategories(industry);
      if (cats.length > 0) return cats.map((c) => ({ value: c.name }));
    }
    return measureSubgroupOptions;
  }, [industry]);
  const measureSubgroups = selectedMeasureSubgroup ?? new Set<string>([measureSubgroupOptions[0].value]);
  const [isMeasureSubgroupDropdownOpen, setIsMeasureSubgroupDropdownOpen] = useState(false);
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
  const measureSubgroupDropdownRef = useRef<HTMLDivElement>(null);

  const getMeasureSubgroupSelectedCount = () => measureSubgroups.size;

  const allMeasureSubgroupsSelected =
    effectiveSubgroupOptions.length > 0 &&
    effectiveSubgroupOptions.every((o) => measureSubgroups.has(o.value));

  const toggleAllMeasureSubgroups = () => {
    if (allMeasureSubgroupsSelected) onMeasureSubgroupChange?.(new Set());
    else onMeasureSubgroupChange?.(new Set(effectiveSubgroupOptions.map((o) => o.value)));
  };

  const toggleMeasureSubgroup = (subgroupValue: string) => {
    const newSet = new Set(measureSubgroups);
    if (newSet.has(subgroupValue)) newSet.delete(subgroupValue);
    else newSet.add(subgroupValue);
    onMeasureSubgroupChange?.(newSet);
  };

  // Model A: every measure is always loaded, so the "of N" total counts ALL measures
  // (both categories) regardless of which categories are currently selected.
  const totalMeasuresAvailable = useMemo(() => {
    const currentIndustry = industry || 'manufacturing';
    return getMockData(currentIndustry).length + adjustmentMeasuresData.length;
  }, [industry]);

  useEffect(() => {
    if (!isMeasureSubgroupDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!measureSubgroupDropdownRef.current?.contains(e.target as Node)) setIsMeasureSubgroupDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isMeasureSubgroupDropdownOpen]);

  // Track original values for Cancel functionality (only for filter cards)
  const [originalFilters, setOriginalFilters] = useState<Filter[]>(() => makeDefaultFilters());

  // Track original period values for cancel functionality
  const [originalStartPeriod, setOriginalStartPeriod] = useState(startPeriod);
  const [originalEndPeriod, setOriginalEndPeriod] = useState(endPeriod);

  // Local state for filter values (not applied until Apply button is clicked)
  const [localStartPeriod, setLocalStartPeriod] = useState(startPeriod);
  const [localEndPeriod, setLocalEndPeriod] = useState(endPeriod);

  const [isDirty, setIsDirty] = useState(false);

  const [localPropagateIntoNoMatchRows, setLocalPropagateIntoNoMatchRows] = useState(propagateIntoNoMatchRowsProp);
  const [originalPropagateIntoNoMatchRows, setOriginalPropagateIntoNoMatchRows] =
    useState(propagateIntoNoMatchRowsProp);
  const [localParentTotalsRollupMode, setLocalParentTotalsRollupMode] = useState(parentTotalsRollupModeProp);
  const [originalParentTotalsRollupMode, setOriginalParentTotalsRollupMode] =
    useState(parentTotalsRollupModeProp);
  const [localMeasureEditDisaggregateToVisibleChildrenOnly, setLocalMeasureEditDisaggregateToVisibleChildrenOnly] =
    useState(measureEditDisaggregateToVisibleChildrenOnlyProp);
  const [originalMeasureEditDisaggregateToVisibleChildrenOnly, setOriginalMeasureEditDisaggregateToVisibleChildrenOnly] =
    useState(measureEditDisaggregateToVisibleChildrenOnlyProp);
  // Track if Apply was clicked (to distinguish from Cancel/Close)
  const applyClickedRef = useRef(false);
  const [isScopeSectionOpen, setIsScopeSectionOpen] = useState(false);
  // Two stacked accordion sections that open/close independently.
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [filterSetsCollapsed, setFilterSetsCollapsed] = useState(false);

  const [filters, setFilters] = useState<Filter[]>(() => makeDefaultFilters());

  // Sync internal state with props
  useEffect(() => {
    setLocalStartPeriod(startPeriod);
    setLocalEndPeriod(endPeriod);
  }, [startPeriod, endPeriod]);

  // Track whether external (intent-based) filters are currently applied so we can
  // restore the full grid when they are cleared (Focus grid toggled off).
  const externalAppliedRef = useRef(false);

  // Apply external filters when provided (for intent-based filtering).
  // Unlike the manual flow, this both populates the filter cards AND applies them
  // to the grid immediately, so the user sees a filtered grid right away.
  useEffect(() => {
    const hasExternalFilters =
      externalAccounts.length > 0 ||
      externalCategories.length > 0 ||
      externalMeasures.length > 0;

    if (hasExternalFilters) {
      const newFilters: Filter[] = [...filters];

      const upsert = (
        type: Filter['type'],
        id: string,
        label: string,
        value: string,
        withOperator: boolean,
      ) => {
        const idx = newFilters.findIndex(f => f.type === type);
        if (idx >= 0) {
          newFilters[idx] = withOperator
            ? { ...newFilters[idx], value, operator: 'equals' }
            : { ...newFilters[idx], value };
        } else {
          newFilters.push(
            withOperator
              ? { id, type, label, value, operator: 'equals' }
              : { id, type, label, value },
          );
        }
      };

      if (externalAccounts.length > 0) {
        upsert('account', '2', 'Filter by Account', externalAccounts.join(', '), true);
      }
      if (externalCategories.length > 0) {
        upsert('category', '3', 'Filter by Category', externalCategories.join(', '), true);
      }
      if (externalMeasures.length > 0) {
        upsert('measures', '1', 'Filter by Measure', externalMeasures.join(', '), false);
      }

      setFilters(newFilters);
      setOriginalFilters(newFilters);
      setIsDirty(false);
      externalAppliedRef.current = true;

      // Apply to the grid right away using the freshly computed filters.
      if (onApplyFilters && data.length > 0) {
        const ensureMeasureIdsVisible = collectMeasureIdsReferencedInFilters(newFilters, data);
        onApplyFilters(applyFilters(data, newFilters), { ensureMeasureIdsVisible });
      }
    } else if (externalAppliedRef.current) {
      // External filters were cleared (Focus grid toggled off) — reset cards & restore grid.
      const resetFilters: Filter[] = makeDefaultFilters();
      setFilters(resetFilters);
      setOriginalFilters(resetFilters);
      setIsDirty(false);
      externalAppliedRef.current = false;

      if (onApplyFilters && data.length > 0) {
        onApplyFilters(applyFilters(data, resetFilters), { ensureMeasureIdsVisible: [] });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAccounts, externalCategories, externalMeasures]);

  // Reset dirty state and track original values when panel opens
  useEffect(() => {
    if (isOpen) {
      setIsDirty(false);
      setLocalStartPeriod(startPeriod);
      setLocalEndPeriod(endPeriod);
      // Don't clobber filters that were just applied via intent-based (external) filtering.
      if (!externalAppliedRef.current) {
        setOriginalFilters([...filters]);
      }
      setOriginalStartPeriod(startPeriod);
      setOriginalEndPeriod(endPeriod);
      setOriginalSelectedFilterSet(selectedFilterSet);
      setLocalPropagateIntoNoMatchRows(propagateIntoNoMatchRowsProp);
      setOriginalPropagateIntoNoMatchRows(propagateIntoNoMatchRowsProp);
      setLocalParentTotalsRollupMode(parentTotalsRollupModeProp);
      setOriginalParentTotalsRollupMode(parentTotalsRollupModeProp);
      setLocalMeasureEditDisaggregateToVisibleChildrenOnly(measureEditDisaggregateToVisibleChildrenOnlyProp);
      setOriginalMeasureEditDisaggregateToVisibleChildrenOnly(measureEditDisaggregateToVisibleChildrenOnlyProp);
      applyClickedRef.current = false;
    }
    // Intentionally depend only on isOpen: snapshot filters/periods/rollup when the panel opens.
  }, [isOpen]);

  // Check if filters are dirty (including filter cards and period changes)
  useEffect(() => {
    if (!isOpen) return;
    
    // Check filter cards for dirty state
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(originalFilters);
    // Check period changes for dirty state
    const periodsChanged = localStartPeriod !== originalStartPeriod || localEndPeriod !== originalEndPeriod;
    const propagateChanged = localPropagateIntoNoMatchRows !== originalPropagateIntoNoMatchRows;
    const rollupModeChanged = localParentTotalsRollupMode !== originalParentTotalsRollupMode;
    const measureDisaggChanged =
      localMeasureEditDisaggregateToVisibleChildrenOnly !== originalMeasureEditDisaggregateToVisibleChildrenOnly;

    setIsDirty(
      filtersChanged ||
        periodsChanged ||
        propagateChanged ||
        rollupModeChanged ||
        measureDisaggChanged,
    );
  }, [
    isOpen,
    filters,
    originalFilters,
    localStartPeriod,
    localEndPeriod,
    originalStartPeriod,
    originalEndPeriod,
    localPropagateIntoNoMatchRows,
    originalPropagateIntoNoMatchRows,
    localParentTotalsRollupMode,
    originalParentTotalsRollupMode,
    localMeasureEditDisaggregateToVisibleChildrenOnly,
    originalMeasureEditDisaggregateToVisibleChildrenOnly,
  ]);

  // Calculate and notify active filter count
  useEffect(() => {
    if (!onActiveFilterCountChange) return;

    const EMPTY = new Set(['', 'All', 'Equals All', 'Equals Jan 26 to Dec 26']);
    const count = filters.filter(f =>
      f.type !== 'new' && f.value && !EMPTY.has(f.value) && !f.value.includes('Jan 26 to Dec 26')
    ).length;

    onActiveFilterCountChange(count);
  }, [filters, onActiveFilterCountChange]);

  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic');
  // Searchable, collapsible filter-set cards (mirrors the conditional-formatting rule cards).
  const [filterSetSearch, setFilterSetSearch] = useState('');
  const [expandedSetName, setExpandedSetName] = useState<string | null>(null);
  const [isCreatingNewSet, setIsCreatingNewSet] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  // "Tip" banner (above the filter tabs) → save current filters as a set via a small popover.
  const [isTipSaveOpen, setIsTipSaveOpen] = useState(false);
  const [tipSetName, setTipSetName] = useState('');
  const tipSaveWrapRef = useRef<HTMLDivElement | null>(null);
  // Only one filter set can be applied (pushed to the grid) at a time.
  const [appliedSetName, setAppliedSetName] = useState<string | null>(null);
  // Collapse the list to the first few sets until "View more" is clicked.
  const [showAllSets, setShowAllSets] = useState(false);
  // Names of filter sets the user deleted (also hides deleted presets).
  const [deletedSetNames, setDeletedSetNames] = useState<Set<string>>(new Set());
  // When opened via an Agentforce hand-off, force the requested tab (e.g. Advanced).
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTab, initialTabSignal]);
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null);
  const [selectedFilterSet, setSelectedFilterSet] = useState<string>('');
  // Remember the selected set as of when the panel opened / was last applied, so Cancel
  // can restore the dropdown (and grid) to the pre-preview state.
  const [originalSelectedFilterSet, setOriginalSelectedFilterSet] = useState<string>('');

  // User-created filter sets — session-only (NOT persisted). On refresh they're gone,
  // leaving just the built-in presets. Also clear any previously-persisted sets.
  const [userFilterSets, setUserFilterSets] = useState<FilterSetDef[]>([]);
  useEffect(() => {
    try {
      localStorage.removeItem('forecastingUserFilterSets');
    } catch {
      /* ignore */
    }
  }, []);

  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [saveMode, setSaveMode] = useState<'update' | 'new'>('new');
  const [saveAsName, setSaveAsName] = useState('');
  const saveMenuWrapRef = useRef<HTMLDivElement>(null);

  const systemSetNames = useMemo(() => new Set(FILTER_SETS.map(s => s.name)), []);
  // Merge: a user set with the same name as a preset overrides it in place;
  // purely-new user sets are appended after the presets.
  const allFilterSets = useMemo(() => {
    const overrides = new Map(userFilterSets.map(s => [s.name, s]));
    const merged = FILTER_SETS.map(s => overrides.get(s.name) ?? s);
    // Newly-created sets appear first (they're prepended to userFilterSets).
    const extra = userFilterSets.filter(s => !systemSetNames.has(s.name));
    return [...extra, ...merged].filter(s => !deletedSetNames.has(s.name));
  }, [userFilterSets, systemSetNames, deletedSetNames]);

  // Build the time-filter card value in the same format manual selection produces.
  const buildTimeFilterValue = (from: string, to: string): string => {
    if (from === 'jan2026' && to === 'dec2026') return 'Equals Jan 26 to Dec 26';
    const fromLabel = MONTHS.find(m => m.key === from)?.label ?? from;
    const toLabel = MONTHS.find(m => m.key === to)?.label ?? to;
    return `Equals ${fromLabel} to ${toLabel}`.replace(/2026/g, '26');
  };

  // Parse the current time-filter card back into a month-key from/to range.
  // Handles both the Basic range format ("Equals Apr 26 to Jun 26") and the
  // Advanced discrete multi-select format ("Apr 2026, May 2026, Jun 2026"),
  // for which we collapse the selection to its earliest→latest month.
  const MONTH_ORDER = [
    'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
    'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
  ];
  const tokenToMonthKey = (token?: string): string | null => {
    const abbr = (token || '').trim().slice(0, 3).toLowerCase();
    const key = `${abbr}2026`;
    return MONTH_ORDER.includes(key) ? key : null;
  };
  // Structured Time value "T|<op>|<from>|<to>" → month-key window. Returns null for legacy.
  const parseStructuredTimeValue = (raw: string): { from: string; to: string } | null => {
    const s = (raw || '').trim();
    if (!s.startsWith('T|')) return null;
    const [, , from, to] = s.split('|');
    return {
      from: MONTH_ORDER.includes(from) ? from : 'jan2026',
      to: MONTH_ORDER.includes(to) ? to : 'dec2026',
    };
  };
  const parseTimeCardToRange = (): { from: string; to: string } => {
    const f = filters.find(fi => fi.type === 'time');
    const raw = (f?.value ?? '').trim();
    const structured = parseStructuredTimeValue(raw);
    if (structured) return structured;
    if (!raw || raw === 'All' || raw === 'Equals All' || raw.includes('Jan 26 to Dec 26')) {
      return { from: 'jan2026', to: 'dec2026' };
    }
    const body = raw.replace(/^Equals\s*/i, '');
    // Basic range format: "Apr 26 to Jun 26"
    if (/\sto\s/i.test(body)) {
      const [fromPart, toPart] = body.split(/\sto\s/i);
      return {
        from: tokenToMonthKey(fromPart) ?? 'jan2026',
        to: tokenToMonthKey(toPart) ?? 'dec2026',
      };
    }
    // Advanced discrete list: "Apr 2026, May 2026, Jun 2026" → earliest→latest
    const present = MONTH_ORDER.filter(key =>
      body.split(',').some(tok => tokenToMonthKey(tok) === key),
    );
    if (present.length === 0) return { from: 'jan2026', to: 'dec2026' };
    return { from: present[0], to: present[present.length - 1] };
  };

  const buildFiltersFromSet = (set: FilterSetDef): Filter[] => {
    // Legacy presets store account/category/products members; map those onto the matching
    // scheme fields when present, and leave the other scheme levels at "Equals All".
    const legacyValues: Record<string, string[]> = {
      account: set.accounts,
      category: set.categories,
      products: set.products,
    };
    return [
      { id: 'flt-measures', type: 'measures', label: 'Filter by Measure', value: set.measures.length ? set.measures.join(', ') : 'Equals All' },
      ...dimFields.map((d) => {
        const vals = legacyValues[d.type] ?? [];
        return {
          id: `flt-${d.type}`,
          type: d.type,
          label: `Filter by ${d.name}`,
          value: vals.length ? vals.join(', ') : 'Equals All',
          operator: 'equals',
        };
      }),
      { id: 'flt-time', type: 'time', label: 'Filter by Time', value: buildTimeFilterValue(set.from, set.to) },
    ];
  };

  const buildAllFilters = (): Filter[] => makeDefaultFilters();

  // Apply a predefined or user filter set — populates every basic & advanced filter field.
  // Push a set of filters + time range onto the grid without committing them as the new
  // baseline. Used to live-preview a filter set the moment it is selected; Apply commits
  // this view, Cancel restores the pre-preview view.
  const previewFilterViewOnGrid = (previewFilters: Filter[], from: string, to: string) => {
    const isAllTime = from === 'jan2026' && to === 'dec2026';
    const nextStartPeriod = isAllTime ? '' : from;
    const nextEndPeriod = isAllTime ? '' : to;
    onShowAllPeriodsChange?.(isAllTime);
    onStartPeriodChange?.(nextStartPeriod);
    onEndPeriodChange?.(nextEndPeriod);
    if (onApplyFilters && data.length > 0) {
      const ensureMeasureIdsVisible = collectMeasureIdsReferencedInFilters(previewFilters, data);
      onApplyFilters(applyFilters(data, previewFilters), { ensureMeasureIdsVisible });
    }
  };

  const handleSelectFilterSet = (name: string) => {
    setSelectedFilterSet(name);
    setIsSaveMenuOpen(false);
    setSaveAsName('');

    let nextFilters: Filter[];
    let nextFrom: string;
    let nextTo: string;

    if (name === 'None') {
      nextFilters = buildAllFilters();
      nextFrom = 'jan2026';
      nextTo = 'dec2026';
    } else {
      const set = allFilterSets.find(s => s.name === name);
      if (!set) return;
      nextFilters = buildFiltersFromSet(set);
      nextFrom = set.from;
      nextTo = set.to;
    }

    setFilters(nextFilters);
    setLocalStartPeriod(nextFrom);
    setLocalEndPeriod(nextTo);
    // Show the filtered view immediately (before Apply). Cancel reverts it.
    previewFilterViewOnGrid(nextFilters, nextFrom, nextTo);
  };

  // ── Modified detection: compare current filters against the selected set ────────
  const normalizeShape = (
    measures: string[], accounts: string[], categories: string[], products: string[], time: string,
  ) => JSON.stringify({
    measures: [...measures].sort(),
    accounts: [...accounts].sort(),
    categories: [...categories].sort(),
    products: [...products].sort(),
    time,
  });

  const shapeOfFilters = (fs: Filter[]): string => {
    const vals = (type: Filter['type']): string[] => {
      const f = fs.find(fi => fi.type === type);
      if (!f || !f.value || f.value === 'Equals All' || f.value === 'All') return [];
      if (type === 'measures' && f.value.includes('|')) return [f.value];
      return f.value.split(',').map(v => v.trim()).filter(Boolean);
    };
    const timeF = fs.find(fi => fi.type === 'time');
    const time = (!timeF || !timeF.value || timeF.value.includes('Jan 26 to Dec 26')) ? 'ALL' : timeF.value;
    return normalizeShape(vals('measures'), vals('account'), vals('category'), vals('products'), time);
  };

  const currentShape = shapeOfFilters(filters);

  const selectedSetDef = allFilterSets.find(s => s.name === selectedFilterSet) || null;
  // Baseline: when a set is loaded, compare against that set; otherwise compare against
  // the filters as they were loaded (originalFilters) so Save only enables once the user
  // actually edits a filter — not merely because filters were pre-applied (e.g. Focus grid).
  const baselineShape = selectedSetDef
    ? normalizeShape(
        selectedSetDef.measures, selectedSetDef.accounts, selectedSetDef.categories, selectedSetDef.products,
        (selectedSetDef.from === 'jan2026' && selectedSetDef.to === 'dec2026') ? 'ALL' : buildTimeFilterValue(selectedSetDef.from, selectedSetDef.to),
      )
    : shapeOfFilters(originalFilters);
  const isSetModified = currentShape !== baselineShape;
  const hasSelectedSet = selectedFilterSet !== '' && selectedFilterSet !== 'None';

  // Snapshot the current filter selections into a FilterSetDef shape.
  const snapshotCurrentSet = (name: string): FilterSetDef => {
    const vals = (type: Filter['type']): string[] => {
      const f = filters.find(fi => fi.type === type);
      if (!f || !f.value || f.value === 'Equals All' || f.value === 'All') return [];
      return f.value.split(',').map(v => v.trim()).filter(Boolean);
    };
    const { from, to } = parseTimeCardToRange();
    // Preserve the existing group if overwriting a known set; brand-new user sets
    // are personal watchlists.
    const group = allFilterSets.find(s => s.name === name)?.group ?? 'watchlist';
    return {
      name,
      measures: vals('measures'),
      accounts: vals('account'),
      categories: vals('category'),
      products: vals('products'),
      from,
      to,
      group,
    };
  };

  // Update (overwrite) a set in place with the current editor filters — no rename. Works
  // for both user sets and presets (an override is stored under the set's name).
  const handleUpdateSet = (name?: string) => {
    const targetName = name ?? selectedFilterSet;
    if (!targetName || targetName === 'None') return;
    const updated = snapshotCurrentSet(targetName);
    setUserFilterSets(prev => {
      const exists = prev.some(s => s.name === targetName);
      return exists ? prev.map(s => (s.name === targetName ? updated : s)) : [...prev, updated];
    });
    setSelectedFilterSet(targetName);
    setIsSaveMenuOpen(false);
  };

  // Confirm "Save as a new set" — creates a separate set under the typed name.
  const handleSaveAsNew = () => {
    const name = saveAsName.trim();
    if (!name || name === 'None') return;
    const newSet = snapshotCurrentSet(name);
    setUserFilterSets(prev => [newSet, ...prev.filter(s => s.name !== name)]);
    setSelectedFilterSet(name);
    setSaveAsName('');
    setIsSaveMenuOpen(false);
  };

  // Open the Save popover, defaulting the radio to the most likely intent.
  const openSavePopover = () => {
    if (!isSetModified) return;
    if (isSaveMenuOpen) {
      setIsSaveMenuOpen(false);
      return;
    }
    setSaveMode(hasSelectedSet ? 'update' : 'new');
    setSaveAsName('');
    setIsSaveMenuOpen(true);
  };

  // Footer "Save" inside the popover routes to update-in-place or save-as-new.
  const handleConfirmSave = () => {
    if (saveMode === 'update' && hasSelectedSet) {
      handleUpdateSet();
    } else {
      handleSaveAsNew();
    }
  };

  // ── Filter-set cards (searchable / collapsible) ─────────────────────────────
  // One-line summary shown under a set's name in its collapsed card header.
  const summarizeSet = (set: FilterSetDef): string => {
    const monthLabel = (k: string) => MONTHS.find(m => m.key === k)?.label ?? k;
    const plur = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;
    const parts: string[] = [];
    if (set.measures.length) parts.push(plur(set.measures.length, 'measure'));
    if (set.accounts.length) parts.push(plur(set.accounts.length, 'account'));
    if (set.categories.length) parts.push(set.categories.length === 1 ? '1 category' : `${set.categories.length} categories`);
    if (set.products.length) parts.push(plur(set.products.length, 'product'));
    const isAllTime = set.from === 'jan2026' && set.to === 'dec2026';
    parts.push(isAllTime ? 'All periods' : `${monthLabel(set.from)} – ${monthLabel(set.to)}`);
    return parts.join(' • ');
  };

  // Load a set's values into the shared editor without pushing anything to the grid.
  const loadSetIntoEditor = (name: string) => {
    setIsSaveMenuOpen(false);
    setSaveAsName('');
    const set = allFilterSets.find(s => s.name === name);
    if (!set) return;
    setFilters(buildFiltersFromSet(set));
    setLocalStartPeriod(set.from);
    setLocalEndPeriod(set.to);
    setSelectedFilterSet(name);
  };

  // Expand/collapse a set card. Expanding just loads it into the editor (no grid change);
  // applying is done via the card toggle.
  const toggleSetCard = (name: string) => {
    setIsCreatingNewSet(false);
    setIsSaveMenuOpen(false);
    if (expandedSetName === name) {
      setExpandedSetName(null);
      return;
    }
    setExpandedSetName(name);
    loadSetIntoEditor(name);
  };

  // Apply toggle — only one set can be applied at a time. Turning one on replaces the
  // previously applied set; turning the active one off clears the grid filters.
  const handleToggleApplySet = (name: string) => {
    setIsCreatingNewSet(false);
    if (appliedSetName === name) {
      setAppliedSetName(null);
      clearAllImplRef.current();
    } else {
      setAppliedSetName(name);
      handleSelectFilterSet(name);
    }
  };

  // Start a brand-new, empty filter set — opens a blank editor card at the top.
  const handleStartNewSet = () => {
    setExpandedSetName(null);
    setIsSaveMenuOpen(false);
    setNewSetName('');
    setIsCreatingNewSet(true);
    const empty = buildAllFilters();
    setFilters(empty);
    setLocalStartPeriod('jan2026');
    setLocalEndPeriod('dec2026');
    setSelectedFilterSet('');
    previewFilterViewOnGrid(empty, 'jan2026', 'dec2026');
  };

  // Save the blank editor card as a new named user filter set.
  const handleSaveNewSet = () => {
    const name = newSetName.trim();
    if (!name || name === 'None') return;
    const newSet = snapshotCurrentSet(name);
    setUserFilterSets(prev => [newSet, ...prev.filter(s => s.name !== name)]);
    setSelectedFilterSet(name);
    setIsCreatingNewSet(false);
    setNewSetName('');
    setShowAllSets(false);
    // Apply it (toggle on + show on grid) and keep the list collapsed.
    setExpandedSetName(null);
    setAppliedSetName(name);
    const { from, to } = parseTimeCardToRange();
    previewFilterViewOnGrid(filters, from, to);
  };

  // Save the current filter selections as a named set from the "Tip" popover, then apply it.
  const handleSaveTipSet = () => {
    const name = tipSetName.trim();
    if (!name || name === 'None') return;
    const newSet = snapshotCurrentSet(name);
    setUserFilterSets(prev => [newSet, ...prev.filter(s => s.name !== name)]);
    setSelectedFilterSet(name);
    setShowAllSets(false);
    setExpandedSetName(null);
    setAppliedSetName(name);
    const { from, to } = parseTimeCardToRange();
    previewFilterViewOnGrid(filters, from, to);
    setIsTipSaveOpen(false);
    setTipSetName('');
  };

  // Close the Tip save popover when clicking outside of it.
  useEffect(() => {
    if (!isTipSaveOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (tipSaveWrapRef.current && !tipSaveWrapRef.current.contains(e.target as Node)) {
        setIsTipSaveOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [isTipSaveOpen]);

  // Push the current editor selections onto the grid as a live preview.
  const handlePreviewCurrent = () => {
    const { from, to } = parseTimeCardToRange();
    previewFilterViewOnGrid(filters, from, to);
  };

  // Save the card: persist current filters into the set, apply it (toggle on + push to
  // grid), and collapse the card.
  const handleSaveSet = (name: string) => {
    handleUpdateSet(name);
    setExpandedSetName(null);
    setAppliedSetName(name);
    const { from, to } = parseTimeCardToRange();
    previewFilterViewOnGrid(filters, from, to);
  };

  // Delete a filter set (removes user sets; hides deleted presets).
  const handleDeleteSet = (name: string) => {
    setUserFilterSets(prev => prev.filter(s => s.name !== name));
    setDeletedSetNames(prev => new Set(prev).add(name));
    if (expandedSetName === name) setExpandedSetName(null);
    if (appliedSetName === name) {
      setAppliedSetName(null);
      clearAllImplRef.current();
    } else if (selectedFilterSet === name) {
      setSelectedFilterSet('');
    }
  };

  // Reset every filter card to "All", clear the selected set, and re-apply to the grid.
  // Exposed to the parent so the grid's "Clear filter" hint can reset panel filters too.
  const clearAllImplRef = useRef<() => void>(() => {});
  clearAllImplRef.current = () => {
    const resetFilters = buildAllFilters();
    setFilters(resetFilters);
    setOriginalFilters(resetFilters);
    setIsDirty(false);
    setSelectedFilterSet('');
    setAppliedSetName(null);
    setLocalStartPeriod('jan2026');
    setLocalEndPeriod('dec2026');
    externalAppliedRef.current = false;
    if (onApplyFilters && data.length > 0) {
      onApplyFilters(applyFilters(data, resetFilters), { ensureMeasureIdsVisible: [] });
    }
  };
  useEffect(() => {
    onRegisterClearAll?.(() => clearAllImplRef.current());
  }, [onRegisterClearAll]);

  // Close the Save popover on outside click.
  useEffect(() => {
    if (!isSaveMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (saveMenuWrapRef.current && !saveMenuWrapRef.current.contains(e.target as Node)) {
        setIsSaveMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isSaveMenuOpen]);

  // Derive unique measure names plus a per-row-type map of dimension member names from the
  // data. `optionsByType` covers every scheme (default account/category/product and the deep /
  // Acme levels) so the basic-tab multiselects and option lists are scheme-driven.
  const { basicMeasureFilterOptions, optionsByType } = useMemo(() => {
    const measureNames = new Set<string>();
    const byType = new Map<string, Set<string>>();
    const add = (type: string, name: string) => {
      if (!name) return;
      let s = byType.get(type);
      if (!s) { s = new Set<string>(); byType.set(type, s); }
      s.add(name);
    };
    const walk = (rows: GridRow[]) => {
      rows.forEach(row => {
        add(row.type, row.name);
        if (row.children) walk(row.children);
      });
    };
    // Model A: the Measures dropdown lists EVERY loaded measure, regardless of which
    // measure categories are selected. Category selection only checks/unchecks measures
    // (via visibleMeasureIds); it never removes them from the list.
    data.forEach(m => {
      const label = m.name?.trim() || m.id;
      if (label) measureNames.add(label);
      walk(m.children || []);
    });
    const optionsByType: Record<string, string[]> = {};
    byType.forEach((set, type) => { optionsByType[type] = Array.from(set).sort(); });
    return {
      basicMeasureFilterOptions: Array.from(measureNames).sort(),
      optionsByType,
    };
  }, [data]);

  // Model A: the Measures dropdown reflects grid visibility (visibleMeasureIds) directly.
  // Checked = measures currently shown on the grid; toggling a measure flips its visibility.
  // Measure categories drive this same visibility set (bulk toggle) upstream.
  const visibleMeasureNames = useMemo(() => {
    const s = new Set<string>();
    measures.forEach(m => {
      const label = m.name?.trim() || m.id;
      if (label && visibleMeasureIds.has(m.id)) s.add(label);
    });
    return s;
  }, [measures, visibleMeasureIds]);

  const handleVisibleMeasuresChange = useCallback((names: string[]) => {
    const nameSet = new Set(names);
    const nextVisible = new Set<string>();
    measures.forEach(m => {
      const label = m.name?.trim() || m.id;
      if (label && nameSet.has(label)) nextVisible.add(m.id);
    });
    onMeasuresReorder?.(measures, nextVisible);
  }, [measures, onMeasuresReorder]);

  // Cascading (dependent) options: each dimension level only lists members that are children
  // of the members currently selected in its ancestor levels — a deduped union across selected
  // parents (a child shared by multiple selected parents appears once). Levels whose ancestors
  // have no selection ("All") are unconstrained. Built off the full (unfiltered) `data` tree so
  // narrowing a parent immediately narrows every child level below it.
  const cascadedOptionsByType = useMemo(() => {
    const rowTypeToIdx = new Map<string, number>();
    dimFields.forEach((d, i) => rowTypeToIdx.set(d.rowType, i));

    const selectedByRowType = new Map<string, Set<string>>();
    dimFields.forEach((df) => {
      const f = filters.find((fi) => fi.type === df.type);
      const val = f?.value;
      if (!val || val === 'Equals All' || val === 'All') return;
      if (df.type === 'measures' && val.includes('|')) return;
      const sel = new Set(val.split(',').map((v) => v.trim()).filter(Boolean));
      if (sel.size > 0) selectedByRowType.set(df.rowType, sel);
    });

    const result: Record<string, string[]> = {};
    dimFields.forEach((df, targetIdx) => {
      const out = new Set<string>();
      const recurse = (node: GridRow) => {
        const idx = rowTypeToIdx.get(node.type);
        if (idx === undefined) {
          // Non-dimension node (measure root, filter summary): keep descending.
          node.children?.forEach(recurse);
          return;
        }
        if (idx < targetIdx) {
          // Ancestor level: only descend through members selected at this level (or all if "All").
          const sel = selectedByRowType.get(node.type);
          if (sel && !sel.has(node.name)) return;
          node.children?.forEach(recurse);
          return;
        }
        if (idx === targetIdx) {
          if (node.name) out.add(node.name);
        }
        // idx > targetIdx: nothing to collect here.
      };
      data.forEach((m) => (m.children ?? []).forEach(recurse));
      result[df.rowType] = Array.from(out).sort();
    });
    return result;
  }, [data, dimFields, filters]);

  const optionsForDimField = useCallback(
    (field: DimensionFilterField): string[] =>
      cascadedOptionsByType[field.rowType] ?? optionsByType[field.rowType] ?? [],
    [cascadedOptionsByType, optionsByType],
  );

  // Basic filter: get selected values for a given type from filters state
  const getBasicSelected = (type: Filter['type']): Set<string> => {
    const f = filters.find(fi => fi.type === type);
    if (!f || !f.value || f.value === 'Equals All' || f.value === 'All') return new Set();
    // Advanced measure numeric filters use "|" — do not treat as basic multi-select tokens
    if (type === 'measures' && f.value.includes('|')) return new Set();
    return new Set(f.value.split(',').map(v => v.trim()).filter(Boolean));
  };

  const updateBasicMultiFilter = (type: Filter['type'], rowId: string, values: string[]) => {
    const newValue = values.length === 0 ? 'Equals All' : values.join(', ');
    setFilters(prev => {
      const existing = prev.find(fi => fi.type === type);
      if (type === 'measures') {
        if (existing) return prev.map(fi => (fi.type === type ? { ...fi, value: newValue } : fi));
        return [...prev, { id: rowId, type: 'measures', label: 'Filter by Measure', value: newValue }];
      }
      // Any dimension level (account/category/products for the default scheme, or a deep/Acme level id)
      if (dimFieldTypes.has(type)) {
        if (existing) return prev.map(fi => (fi.type === type ? { ...fi, value: newValue, operator: 'equals' } : fi));
        return [...prev, { id: rowId, type, label: `Filter by ${nameForDimType(type)}`, value: newValue, operator: 'equals' }];
      }
      return prev;
    });
  };


  // Basic filter: get time range from filters state.
  // The time card stores a human-readable value ("Equals Apr 26 to Jun 26"),
  // so parse the month labels back into month keys (e.g. 'apr2026') that match
  // the <select> options — otherwise the dropdowns fall back to the first month.
  const getBasicTimeRange = (): { from: string; to: string } => parseTimeCardToRange();

  const setBasicTimeRange = (from: string, to: string) => {
    const display = `${MONTHS.find(m => m.key === from)?.label ?? from} to ${MONTHS.find(m => m.key === to)?.label ?? to}`;
    setFilters(prev => {
      const existing = prev.find(f => f.type === 'time');
      const newValue = `Equals ${display.replace('2026', '26').replace('2026', '26')}`;
      if (existing) return prev.map(f => f.type === 'time' ? { ...f, value: newValue } : f);
      return [...prev, { id: 'basic-time', type: 'time', label: 'Filter by Time', value: newValue }];
    });
  };
  const [showFilterLogic, setShowFilterLogic] = useState(false);
  const [filterLogicValue, setFilterLogicValue] = useState('');

  // Pre-populate the Filter Logic box when an Agentforce hand-off provides a derived expression.
  useEffect(() => {
    if (externalFilterLogic && externalFilterLogic.trim()) {
      setShowFilterLogic(true);
      setFilterLogicValue(externalFilterLogic);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFilterLogicSignal]);
  const filterCardRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const handleRemoveFilter = (filterId: string) => {
    setFilters(prev => prev.filter(f => f.id !== filterId));
    if (editingFilterId === filterId) setEditingFilterId(null);
  };

  const handleRemoveAll = () => {
    setFilters([]);
    setEditingFilterId(null);
  };

  const handleAddFilter = () => {
    const id = `filter-${Date.now()}`;
    const newFilter: Filter = { id, type: 'new', label: 'New Filter', value: '' };
    setFilters(prev => [...prev, newFilter]);
    setTimeout(() => setEditingFilterId(id), 50);
  };

  const handleFilterClick = (filterId: string) => {
    setEditingFilterId(prev => prev === filterId ? null : filterId);
  };

  const handleUnifiedFilterSave = (filterId: string, field: string, operator: string, selectedValues: string[]) => {
    // The editor's `field` is 'measure' | 'time' | a dimension field type (level id / legacy).
    const newType: Filter['type'] =
      field === 'measure' ? 'measures' : field === 'time' ? 'time' : field;
    const value = selectedValues.length > 0 ? selectedValues.join(', ') : 'All';
    // For measure numeric filters, use the measure name as the card label
    let label =
      field === 'measure' ? 'Filter by Measure'
      : field === 'time' ? 'Filter by Time'
      : dimFieldTypes.has(field) ? `Filter by ${nameForDimType(field)}`
      : field;
    if (field === 'measure' && value.includes('|')) {
      const [mName] = value.split('|');
      if (mName) label = mName;
    }
    const newFilters = filters.map(f =>
      f.id === filterId
        ? { ...f, type: newType, label, value, field, operator }
        : f
    );
    setFilters(newFilters);
    setIsDirty(true);
    setEditingFilterId(null);
    // For a Time range, live-preview the grid's visible time columns too (mirrors Apply).
    if (field === 'time') {
      let from = 'jan2026', to = 'dec2026';
      const structured = parseStructuredTimeValue(value);
      if (structured) {
        from = structured.from;
        to = structured.to;
      } else {
        const body = value.replace(/^Equals\s*/i, '').trim();
        if (/\sto\s/i.test(body)) {
          const [a, b] = body.split(/\sto\s/i);
          from = tokenToMonthKey(a) ?? 'jan2026';
          to = tokenToMonthKey(b) ?? 'dec2026';
        }
      }
      const isAllTime = from === 'jan2026' && to === 'dec2026';
      const nextStart = isAllTime ? '' : from;
      const nextEnd = isAllTime ? '' : to;
      onShowAllPeriodsChange?.(isAllTime);
      onStartPeriodChange?.(nextStart);
      onEndPeriodChange?.(nextEnd);
      setLocalStartPeriod(nextStart);
      setLocalEndPeriod(nextEnd);
    }
    // Live-preview the change on the grid immediately so the effect is visible without a
    // separate Apply click. Cancel/Close still reverts to the pre-edit (original) filters.
    if (onApplyFilters && data.length > 0) {
      const ensureMeasureIdsVisible = collectMeasureIdsReferencedInFilters(newFilters, data);
      onApplyFilters(applyFilters(data, newFilters), { ensureMeasureIdsVisible });
    }
  };

  const handleUnifiedFilterCancel = () => {
    // Remove the card if it was brand-new (type 'new') and user cancelled
    setFilters(prev => prev.filter(f => !(f.id === editingFilterId && f.type === 'new')));
    setEditingFilterId(null);
  };

  // Handle cancel - revert all changes (filters and periods)
  const handleCancel = () => {
    // Revert filter cards
    setFilters([...originalFilters]);
    // Revert period values
    setLocalStartPeriod(originalStartPeriod);
    setLocalEndPeriod(originalEndPeriod);
    // Revert parent state for periods (if they were changed)
    if (onStartPeriodChange && localStartPeriod !== originalStartPeriod) {
      onStartPeriodChange(originalStartPeriod);
    }
    if (onEndPeriodChange && localEndPeriod !== originalEndPeriod) {
      onEndPeriodChange(originalEndPeriod);
    }
    setLocalPropagateIntoNoMatchRows(originalPropagateIntoNoMatchRows);
    setLocalParentTotalsRollupMode(originalParentTotalsRollupMode);
    setLocalMeasureEditDisaggregateToVisibleChildrenOnly(originalMeasureEditDisaggregateToVisibleChildrenOnly);
    // Totals scope is owned by the grid banner toggle; Cancel must not revert it here.
    // Restore the filter-set dropdown and the grid view to the pre-preview state so that
    // any live-previewed filter set is undone.
    setSelectedFilterSet(originalSelectedFilterSet);
    onShowAllPeriodsChange?.(originalStartPeriod === '' && originalEndPeriod === '');
    if (onApplyFilters && data.length > 0) {
      const ensureMeasureIdsVisible = collectMeasureIdsReferencedInFilters(originalFilters, data);
      onApplyFilters(applyFilters(data, originalFilters), { ensureMeasureIdsVisible });
    }
    setIsDirty(false);
  };

  // Handle close - if Apply wasn't clicked, treat as Cancel
  const handleClose = () => {
    if (!applyClickedRef.current) {
      handleCancel();
    }
    onClose();
  };

  /** Parse measure numeric filter: new `name|op|val` or legacy `name|subCol|op|val`. */
  const parseMeasureNumericFilter = (encoded: string): { mName: string; op: string; rawVal: string } | null => {
    const parts = encoded.split('|');
    const ops = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']);
    if (parts.length >= 4 && ops.has(parts[2] ?? '')) {
      return { mName: parts[0], op: parts[2], rawVal: parts.slice(3).join('|') };
    }
    if (parts.length === 3 && ops.has(parts[1] ?? '')) {
      return { mName: parts[0], op: parts[1], rawVal: parts[2] };
    }
    return null;
  };

  /**
   * Parse a dimension-filtered-by-measure value: `measureName|op|val`, where op includes
   * the numeric operators plus topN / bottomN. Used when an Account/Category/Product filter
   * is set to filter by a measure value instead of by name.
   */
  const parseDimensionMeasureFilter = (
    encoded: string,
  ): { mName: string; op: string; rawVal: string } | null => {
    const parts = encoded.split('|');
    const ops = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'topN', 'bottomN']);
    if (parts.length >= 3 && ops.has(parts[1] ?? '')) {
      return { mName: parts[0], op: parts[1], rawVal: parts.slice(2).join('|') };
    }
    return null;
  };

  /** Top-level measure ids referenced by Basic or Advanced measure filters (so the grid can show those columns). */
  const collectMeasureIdsReferencedInFilters = (
    filtersList: Filter[],
    measureData: MeasureData[],
  ): string[] => {
    const nameToId = new Map<string, string>();
    measureData.forEach(m => {
      const n = (m.name ?? '').trim();
      if (n) nameToId.set(n, m.id);
      nameToId.set(m.id.trim(), m.id);
    });
    const out: string[] = [];
    const pushToken = (raw: string) => {
      const key = raw.trim();
      if (!key || key === 'All' || key === 'Equals All') return;
      const id = nameToId.get(key);
      if (id) out.push(id);
    };
    for (const f of filtersList) {
      if (f.type !== 'measures' || !f.value) continue;
      if (f.value === 'Equals All' || f.value === 'All') continue;
      if (f.value.includes('|')) {
        const parsed = parseMeasureNumericFilter(f.value);
        if (parsed?.mName) pushToken(parsed.mName);
      } else {
        f.value.split(',').forEach(part => pushToken(part));
      }
    }
    return [...new Set(out)];
  };

  const getFilterDisplayValue = (filter: Filter): string => {
    if (filter.type === 'new' || !filter.value) return 'Click to configure…';
    if (filter.value === 'Equals All' || filter.value === 'All') return 'Equals All';
    // Structured Time filter: "T|<op>|<from>|<to>"
    if (filter.type === 'time' && filter.value.startsWith('T|')) {
      const [, op, from, to] = filter.value.split('|');
      const short = (k: string) => (MONTHS.find(m => m.key === k)?.label ?? k).replace('2026', '26');
      if (op === 'is') return short(from);
      if (op === 'after') return `On or after ${short(from)}`;
      if (op === 'before') return `On or before ${short(to)}`;
      if (op === 'lastN') {
        const n = MONTH_ORDER.indexOf(to) - MONTH_ORDER.indexOf(from) + 1;
        return `Last ${n > 0 ? n : 1} periods`;
      }
      return `${short(from)} to ${short(to)}`;
    }
    // Measure numeric filter: "measureName|operator|value" (or legacy four-part with sub-column)
    if (filter.type === 'measures' && filter.value.includes('|')) {
      const parsed = parseMeasureNumericFilter(filter.value);
      const opLabels: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠' };
      if (parsed) {
        return `${parsed.mName} ${opLabels[parsed.op] ?? parsed.op} ${parsed.rawVal}`;
      }
    }
    // Dimension filtered by a measure value: "measureName|operator|value" incl. topN/bottomN
    if (dimFieldTypes.has(filter.type) && filter.value.includes('|')) {
      const parsed = parseDimensionMeasureFilter(filter.value);
      if (parsed) {
        if (parsed.op === 'topN') return `${parsed.mName} · Top ${parsed.rawVal}`;
        if (parsed.op === 'bottomN') return `${parsed.mName} · Bottom ${parsed.rawVal}`;
        const opLabels: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠' };
        return `${parsed.mName} ${opLabels[parsed.op] ?? parsed.op} ${parsed.rawVal}`;
      }
    }
    const items = filter.value.split(',').map(v => v.trim()).filter(Boolean);
    if (items.length === 0) return 'Equals All';
    if (items.length <= 2) return items.join(', ');
    return `${items.length} items selected`;
  };

  const getFilterInitialValue = (filter: Filter): string => {
    if (!filter.value || filter.value === 'Equals All' || filter.value === 'All' || filter.value.includes('Jan 26 to Dec 26')) return '';
    return filter.value;
  };

  const getFilterInitialField = (filter: Filter): string => {
    if (filter.field) return filter.field;
    if (filter.type === 'measures') return 'measure';
    if (filter.type === 'time') return 'time';
    if (filter.type === 'new') return dimFields[0]?.type ?? 'account';
    // Dimension level types map to themselves as the editor field.
    if (dimFieldTypes.has(filter.type)) return filter.type;
    return dimFields[0]?.type ?? 'account';
  };
  const getFilterInitialOperator = (filter: Filter): string => filter.operator || 'equals';

  // Helper: parse active filter values from filters state
  const getActiveValues = (type: Filter['type'], srcFilters: Filter[] = filters): string[] | null => {
    const f = srcFilters.find(fi => fi.type === type);
    if (!f || !f.value || f.value === 'Equals All' || f.value === 'All') return null;
    const vals = f.value.split(',').map(v => v.trim()).filter(Boolean);
    return vals.length > 0 ? vals : null;
  };

  /** Respect UnifiedFilterPopover operators (Equals / Not Equals / Contains / Not Contains). */
  const dimensionNameMatches = (name: string | undefined, selected: string[], operator: string | undefined): boolean => {
    const n = (name ?? '').trim();
    const normSelected = selected.map(s => s.trim()).filter(Boolean);
    if (normSelected.length === 0) return true;
    const op = operator || 'equals';
    if (op === 'equals') {
      return normSelected.some(s => n === s);
    }
    if (op === 'notEquals') {
      return !normSelected.some(s => n === s);
    }
    const lower = n.toLowerCase();
    if (op === 'contains') {
      return normSelected.some(s => lower.includes(s.toLowerCase()));
    }
    if (op === 'notContains') {
      return !normSelected.some(s => lower.includes(s.toLowerCase()));
    }
    return normSelected.some(s => n === s);
  };

  // ── Dimension-by-measure filtering helpers ─────────────────────────────────────
  const MONTH_KEYS = [
    'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
    'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
  ];

  // The month columns currently visible on the grid; measure values are summed across
  // these to produce one number per dimension row for comparison / ranking.
  const getVisibleMonthKeys = (): string[] => {
    if (showAllPeriods || (!startPeriod && !endPeriod)) return MONTH_KEYS;
    const si = startPeriod && MONTH_KEYS.includes(startPeriod) ? MONTH_KEYS.indexOf(startPeriod) : 0;
    const ei = endPeriod && MONTH_KEYS.includes(endPeriod) ? MONTH_KEYS.indexOf(endPeriod) : MONTH_KEYS.length - 1;
    return MONTH_KEYS.slice(Math.min(si, ei), Math.max(si, ei) + 1);
  };

  const sumRowOverVisible = (row: any, months: string[]): number =>
    months.reduce((sum, k) => sum + (Number(row?.values?.[k]) || 0), 0);

  const collectDimRows = (rows: any[], dimRowType: string, out: any[]): void => {
    rows.forEach(r => {
      if (r.type === dimRowType && (dimRowType !== 'product' || !r.children || r.children.length === 0)) {
        out.push(r);
      }
      if (r.children) collectDimRows(r.children, dimRowType, out);
    });
  };

  // Compute the dimension member names that satisfy a measure-based filter.
  //  • Top-N / Bottom-N: rank members by the measure summed across the visible range.
  //  • Comparison operators (>, <, =, …): apply the operator to the actual per-period
  //    cell values — keep a member when every visible period satisfies the operator.
  const qualifyingDimNames = (
    measureTree: MeasureData[], dimRowType: string, mName: string, op: string, rawVal: string,
  ): string[] => {
    const measure = measureTree.find(m => (m.name ?? m.id) === mName);
    if (!measure) return [];
    const rows: any[] = [];
    collectDimRows(measure.children || [], dimRowType, rows);
    const months = getVisibleMonthKeys();

    if (op === 'topN' || op === 'bottomN') {
      const byName = new Map<string, number>();
      rows.forEach(r => {
        const nm = (r.name ?? '').trim();
        if (!nm) return;
        byName.set(nm, (byName.get(nm) ?? 0) + sumRowOverVisible(r, months));
      });
      const n = Math.max(0, Math.floor(parseFloat(rawVal) || 0));
      return Array.from(byName.entries())
        .sort((a, b) => (op === 'topN' ? b[1] - a[1] : a[1] - b[1]))
        .slice(0, n)
        .map(([name]) => name);
    }

    const threshold = parseFloat(rawVal);
    if (isNaN(threshold)) {
      return Array.from(new Set(rows.map(r => (r.name ?? '').trim()).filter(Boolean)));
    }
    const holds = (v: number): boolean =>
      op === 'gt' ? v > threshold
      : op === 'gte' ? v >= threshold
      : op === 'lt' ? v < threshold
      : op === 'lte' ? v <= threshold
      : op === 'eq' ? v === threshold
      : op === 'neq' ? v !== threshold
      : true;
    const out = new Set<string>();
    rows.forEach(r => {
      const nm = (r.name ?? '').trim();
      if (!nm) return;
      const vals = months.map(k => Number(r?.values?.[k]) || 0);
      if (vals.length > 0 && vals.every(holds)) out.add(nm);
    });
    return Array.from(out);
  };

  // Resolve a dimension filter to a concrete { names, operator } pair. Name-based filters
  // pass through; measure-based filters are converted to the set of qualifying member names.
  const resolveDimensionFilter = (
    type: string,
    rowType: string,
    currentTree: MeasureData[],
    srcFilters: Filter[],
  ): { values: string[] | null; operator: string } => {
    const f = srcFilters.find(fi => fi.type === type);
    if (!f || !f.value || f.value === 'Equals All' || f.value === 'All') {
      return { values: null, operator: 'equals' };
    }
    if (f.value.includes('|')) {
      const parsed = parseDimensionMeasureFilter(f.value);
      if (parsed) {
        const names = qualifyingDimNames(currentTree, rowType, parsed.mName, parsed.op, parsed.rawVal);
        // Use a sentinel when nothing qualifies so the equals-match yields an empty result.
        return { values: names.length > 0 ? names : ['\u0000__none__'], operator: 'equals' };
      }
    }
    const vals = f.value.split(',').map(v => v.trim()).filter(Boolean);
    return { values: vals.length > 0 ? vals : null, operator: f.operator || 'equals' };
  };

  // Filter data - AND logic across all active filter criteria
  const applyFilters = (dataToFilter: MeasureData[], srcFilters: Filter[] = filters): MeasureData[] => {
    let filtered: MeasureData[] = JSON.parse(JSON.stringify(dataToFilter));

    const selectedMeasures   = getActiveValues('measures', srcFilters);
    const measureFilter = srcFilters.find(fi => fi.type === 'measures' && fi.value && fi.value.includes('|'));

    // 1. Filter by measure
    if (measureFilter && measureFilter.value.includes('|')) {
      const parsed = parseMeasureNumericFilter(measureFilter.value);
      const threshold = parsed ? parseFloat(parsed.rawVal) : NaN;
      if (parsed && !isNaN(threshold) && parsed.mName) {
        const op = parsed.op;
        const passes = (v: number): boolean => {
          if (op === 'gt')  return v > threshold;
          if (op === 'gte') return v >= threshold;
          if (op === 'lt')  return v < threshold;
          if (op === 'lte') return v <= threshold;
          if (op === 'eq')  return v === threshold;
          if (op === 'neq') return v !== threshold;
          return true;
        };
        const getMainCellValue = (row: any): number => row.values?.jan2026 ?? 0;
        const filterRows = (rows: any[]): any[] => rows.filter(row => {
          const val = getMainCellValue(row);
          const childPass = row.children ? filterRows(row.children) : [];
          return passes(val) || childPass.length > 0;
        }).map(row => ({ ...row, children: row.children ? filterRows(row.children) : undefined }));

        filtered = filtered.map(m => m.name === parsed.mName ? { ...m, children: filterRows(m.children || []) } : m);
      }
    } else if (selectedMeasures) {
      filtered = filtered.filter(m => selectedMeasures.includes(m.name ?? m.id));
    }

    // 2. Filter by each dimension level in this grid's scheme (by name, or by a measure
    //    value / Top-N / Bottom-N). AND logic across levels.
    for (const df of dimFields) {
      const { values, operator } = resolveDimensionFilter(df.type, df.rowType, filtered, srcFilters);
      if (values) {
        filtered = filtered.map(measure => ({
          ...measure,
          children: filterByDimensionType(measure.children || [], df.rowType, values, operator),
        }));
      }
    }

    // 5. Filter by time periods (date-range from props)
    if (!showAllPeriods && (startPeriod || endPeriod)) {
      filtered = filtered.map(measure => ({
        ...measure,
        children: filterByTimePeriods(measure.children || [], startPeriod, endPeriod),
      }));
    }

    return filtered;
  };

  // Helper function to filter by dimension levels
  const filterByDimensionLevels = (rows: GridRow[], levels: Set<string>): GridRow[] => {
    const result: GridRow[] = [];
    rows.forEach(row => {
      const shouldInclude = levels.has(row.type);
      const filteredChildren = row.children ? filterByDimensionLevels(row.children, levels) : [];
      
      if (shouldInclude) {
        result.push({
          ...row,
          children: filteredChildren.length > 0 ? filteredChildren : undefined
        });
      } else if (filteredChildren.length > 0) {
        // If this level is excluded but has children that should be included, include it but mark it differently
        result.push({
          ...row,
          children: filteredChildren
        });
      }
    });
    return result;
  };

  // Generic dimension filter: recurse to rows whose `type` equals `rowType`, keep those whose
  // name matches (with all their children); otherwise keep ancestors that lead to a match.
  // Works for every scheme level (account/category/product and the deep / Acme levels).
  const filterByDimensionType = (
    rows: GridRow[],
    rowType: string,
    selected: string[],
    op: string,
  ): GridRow[] => {
    const result: GridRow[] = [];
    rows.forEach(row => {
      if (row.type === rowType) {
        if (dimensionNameMatches(row.name, selected, op)) {
          result.push({ ...row, children: row.children }); // Keep all children
        }
      } else {
        const filteredChildren = row.children ? filterByDimensionType(row.children, rowType, selected, op) : [];
        if (filteredChildren.length > 0) {
          result.push({ ...row, children: filteredChildren });
        }
      }
    });
    return result;
  };

  // Helper function to filter by time periods
  const filterByTimePeriods = (rows: GridRow[], startDate: string, endDate: string): GridRow[] => {
    if (!startDate && !endDate) return rows;

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    // Map month keys to date ranges
    const monthKeyToDate: { [key: string]: Date } = {
      'jan2026': new Date('2026-01-01'),
      'feb2026': new Date('2026-02-01'),
      'mar2026': new Date('2026-03-01'),
      'apr2026': new Date('2026-04-01'),
      'may2026': new Date('2026-05-01'),
      'jun2026': new Date('2026-06-01'),
      'jul2026': new Date('2026-07-01'),
      'aug2026': new Date('2026-08-01'),
      'sep2026': new Date('2026-09-01'),
      'oct2026': new Date('2026-10-01'),
      'nov2026': new Date('2026-11-01'),
      'dec2026': new Date('2026-12-01'),
    };

    return rows.map(row => {
      const filteredValues: GridRow['values'] = { ...row.values };
      
      // Filter values based on date range
      Object.keys(monthKeyToDate).forEach(monthKey => {
        const monthDate = monthKeyToDate[monthKey];
        if (start && monthDate < start) {
          delete (filteredValues as any)[monthKey];
        }
        if (end) {
          const monthEnd = new Date(monthDate);
          monthEnd.setMonth(monthEnd.getMonth() + 1);
          if (monthEnd > end) {
            delete (filteredValues as any)[monthKey];
          }
        }
      });

      const filteredChildren = row.children ? filterByTimePeriods(row.children, startDate, endDate) : [];
      
      return {
        ...row,
        values: filteredValues,
        children: filteredChildren.length > 0 ? filteredChildren : undefined
      };
    });
  };

  if (!isOpen) return null;

  const basicTimeRange = getBasicTimeRange();

  // Calculation scope (mirrors the grid header control). Two settings move together:
  // "All rows" = full hierarchy rollups + edits; "Visible rows" = visible children only.
  // Applies immediately and keeps the panel's staging in sync so it doesn't go dirty.
  const scopeIsEverything =
    parentTotalsRollupModeProp === 'fullHierarchy' && !measureEditDisaggregateToVisibleChildrenOnlyProp;
  const applyScope = (everything: boolean) => {
    const nextRollup: ParentTotalsRollupMode = everything ? 'fullHierarchy' : 'visibleOnly';
    const nextDisagg = !everything;
    onParentTotalsRollupModeChange?.(nextRollup);
    onMeasureEditDisaggregateToVisibleChildrenOnlyChange?.(nextDisagg);
    setLocalParentTotalsRollupMode(nextRollup);
    setOriginalParentTotalsRollupMode(nextRollup);
    setLocalMeasureEditDisaggregateToVisibleChildrenOnly(nextDisagg);
    setOriginalMeasureEditDisaggregateToVisibleChildrenOnly(nextDisagg);
  };

  {/* Tip banner lives only in the top-level "Filters" section — not inside filter-set cards. */}
  const tipSaveBanner = (
    <div className="filters-tip-wrap" ref={tipSaveWrapRef}>
      <ScopedNotification
        variant="inline"
        className="filters-tip-banner"
        message="Tip: Save your filter settings into a Filter Set so you can re-use next time."
        ctaLabel="Save"
        onCtaClick={() => { setTipSetName(''); setIsTipSaveOpen(v => !v); }}
      />
      {isTipSaveOpen && (
        <div className="filters-tip-popover" role="dialog" aria-label="Save filter set">
          <label className="filters-tip-popover-label" htmlFor="tip-set-name">Filter set name</label>
          <input
            id="tip-set-name"
            type="text"
            className="filters-tip-popover-input"
            autoFocus
            placeholder="e.g. Q2 Revenue Recovery"
            value={tipSetName}
            onChange={e => setTipSetName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && tipSetName.trim()) handleSaveTipSet();
              if (e.key === 'Escape') { setIsTipSaveOpen(false); setTipSetName(''); }
            }}
          />
          <div className="filters-tip-popover-actions">
            <button type="button" className="filters-tip-popover-cancel" onClick={() => { setIsTipSaveOpen(false); setTipSetName(''); }}>Cancel</button>
            <button type="button" className="filters-tip-popover-save" disabled={!tipSetName.trim()} onClick={handleSaveTipSet}>Save</button>
          </div>
        </div>
      )}
    </div>
  );

  // Shared editor body (Basic + Advanced tabs) rendered inside whichever filter-set card is open.
  const filterEditorBody = (
    <>
      {/* Panel Body */}
      <div className="filters-panel-body">

        {/* ── BASIC FILTERS ──────────────────────────────────────────────────── */}
        {(
          <div className="filters-basic">

            {/* Measure categories */}
            <div className="filters-basic-group">
              <span className="filters-basic-label">Measure Categories</span>
              <div className="settings-dropdown-wrapper" ref={measureSubgroupDropdownRef}>
                <div
                  className={`settings-dropdown-trigger ${isMeasureSubgroupDropdownOpen ? 'open' : ''}`}
                  onClick={() => setIsMeasureSubgroupDropdownOpen(!isMeasureSubgroupDropdownOpen)}
                >
                  <span className={getMeasureSubgroupSelectedCount() > 0 ? 'settings-dropdown-value' : 'settings-dropdown-placeholder'}>
                    {getMeasureSubgroupSelectedCount() > 0 ? `${getMeasureSubgroupSelectedCount()} Categor${getMeasureSubgroupSelectedCount() !== 1 ? 'ies' : 'y'} Selected` : 'Select Measure Category'}
                  </span>
                  <svg className="settings-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                {isMeasureSubgroupDropdownOpen && (
                  <div className="settings-dropdown-list settings-dimension-dropdown">
                    <div className="settings-dropdown-checkbox-option" onClick={toggleAllMeasureSubgroups}>
                      <div className={`settings-checkbox-wrapper ${allMeasureSubgroupsSelected ? 'checked' : ''}`}>
                        {allMeasureSubgroupsSelected && <svg className="settings-checkbox-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span className="settings-dropdown-checkbox-label">All</span>
                    </div>
                    {effectiveSubgroupOptions.map((option, index) => {
                      const isSelected = measureSubgroups.has(option.value);
                      return (
                        <div key={index} className="settings-dropdown-checkbox-option" onClick={() => toggleMeasureSubgroup(option.value)}>
                          <div className={`settings-checkbox-wrapper ${isSelected ? 'checked' : ''}`}>
                            {isSelected && <svg className="settings-checkbox-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                          <span className="settings-dropdown-checkbox-label">{option.value}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {measures.length > 0 && (
                <p className="settings-field-helper-text">
                  Showing {visibleMeasureIds.size === 0 ? measures.length : measures.filter(m => visibleMeasureIds.has(m.id)).length} of {totalMeasuresAvailable} measures
                </p>
              )}
            </div>

            {/* Measures */}
            <div className="filters-basic-group">
              <span className="filters-basic-label" id="basic-measures-label">Measures</span>
              <BasicFilterMultiSelect
                id="basic-measures"
                labelId="basic-measures-label"
                options={basicMeasureFilterOptions}
                selected={visibleMeasureNames}
                onChange={handleVisibleMeasuresChange}
              />
            </div>

            {/* Dimension filters, grouped into collapsible sections by hierarchy
                (Account Hierarchy vs Product Hierarchy); constituents are indented. */}
            {dimSections.map((section) => {
              const collapsed = collapsedDimSections.has(section.hierarchy);
              return (
                <div className="filters-dim-section" key={section.hierarchy}>
                  <button
                    type="button"
                    className="filters-basic-section-header filters-dim-section-toggle"
                    aria-expanded={!collapsed}
                    onClick={() => toggleDimSection(section.hierarchy)}
                  >
                    <svg
                      className={`filters-dim-section-chevron${collapsed ? ' collapsed' : ''}`}
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {section.hierarchy}
                  </button>
                  {!collapsed && (
                    <div className="filters-dim-section-body">
                      {section.fields.map((df) => (
                        <div className="filters-basic-group" key={df.type}>
                          <span className="filters-basic-label" id={`basic-${df.type}-label`}>{df.name}</span>
                          <BasicFilterMultiSelect
                            id={`basic-${df.type}`}
                            labelId={`basic-${df.type}-label`}
                            options={optionsForDimField(df)}
                            selected={getBasicSelected(df.type)}
                            onChange={vals => updateBasicMultiFilter(df.type, `basic-${df.type}`, vals)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Time Range */}
            <div className="filters-basic-group filters-basic-group--separated">
              <label className="filters-basic-label">
                Time Period
                <LabelInfoTooltip text="Filters by the lowest time granularity selected." />
              </label>
              <div className="filters-basic-time-row">
                <div className="filters-basic-time-field">
                  <span className="filters-basic-time-lbl">From</span>
                  <select
                    className="filters-basic-select"
                    value={basicTimeRange.from}
                    onChange={e => setBasicTimeRange(e.target.value, basicTimeRange.to)}
                  >
                    {MONTHS.map(m => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="filters-basic-time-field">
                  <span className="filters-basic-time-lbl">To</span>
                  <select
                    className="filters-basic-select"
                    value={basicTimeRange.to}
                    onChange={e => setBasicTimeRange(basicTimeRange.from, e.target.value)}
                  >
                    {MONTHS.map(m => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="filters-basic-group" style={{ marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => clearAllImplRef.current()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 0',
                  color: 'var(--color-accent-blue, #0176d3)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Clear all filters
              </button>
            </div>

          </div>
        )}

      </div>
    </>
  );

  return (
    <div className="filters-panel">
      {/* Panel Header */}
      <div className="filters-panel-header">
        {isDirty ? (
          <>
            <button type="button" className="filters-header-cancel-btn" onClick={handleClose}>Cancel</button>
            <div className="filters-panel-header-actions">
              <button
                type="button"
                className="filters-header-apply-only-btn"
                onClick={() => {
                  applyClickedRef.current = true;
                  // Derive the active time range from the "Filter by Time" card so the grid's
                  // visible time columns match it. A full-year range means "show all periods".
                  const { from: appliedFrom, to: appliedTo } = parseTimeCardToRange();
                  const isAllTime = appliedFrom === 'jan2026' && appliedTo === 'dec2026';
                  const nextStartPeriod = isAllTime ? '' : appliedFrom;
                  const nextEndPeriod = isAllTime ? '' : appliedTo;
                  onShowAllPeriodsChange?.(isAllTime);
                  onStartPeriodChange?.(nextStartPeriod);
                  onEndPeriodChange?.(nextEndPeriod);
                  setLocalStartPeriod(nextStartPeriod);
                  setLocalEndPeriod(nextEndPeriod);
                  if (onApplyFilters && data.length > 0) {
                    const ensureMeasureIdsVisible = collectMeasureIdsReferencedInFilters(filters, data);
                    onApplyFilters(applyFilters(data), { ensureMeasureIdsVisible });
                  }
                  // Parent-totals scope is now driven solely by the grid banner toggle, so the
                  // Filters "Apply" must not push (and thus revert) those values.
                  onPropagateIntoNoMatchRowsChange?.(localPropagateIntoNoMatchRows);
                  setOriginalPropagateIntoNoMatchRows(localPropagateIntoNoMatchRows);
                  setOriginalFilters([...filters]);
                  setOriginalStartPeriod(nextStartPeriod);
                  setOriginalEndPeriod(nextEndPeriod);
                  setOriginalSelectedFilterSet(selectedFilterSet);
                  setIsDirty(false);
                  onClose();
                }}
              >
                Apply
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="filters-panel-title-row">
              <svg className="filters-panel-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M3.2 4.2C4.6 5.95 7.2 9.15 7.2 9.15v4.2c0 .38.31.69.69.69h1.38c.38 0 .69-.31.69-.69v-4.2s2.58-3.2 3.98-4.95c.35-.44.03-1.08-.53-1.08H3.73c-.56 0-.88.64-.53 1.08z" fill="currentColor"/>
              </svg>
              <p className="filters-panel-title">Filters</p>
            </div>
            <button type="button" className="filters-panel-close" onClick={handleClose} aria-label="Close">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        )}
      </div>

      <div className="filters-panel-scroll">

      {filterEditorBody}

      </div>
      {/* Unified Filter Popover */}
      {editingFilterId && (() => {
        const filter = filters.find(f => f.id === editingFilterId);
        if (!filter) return null;
        return (
          <UnifiedFilterPopover
            isOpen={true}
            onClose={() => setEditingFilterId(null)}
            onSave={(field, operator, selectedValues) => handleUnifiedFilterSave(editingFilterId, field, operator, selectedValues)}
            onCancel={handleUnifiedFilterCancel}
            initialField={getFilterInitialField(filter)}
            initialOperator={getFilterInitialOperator(filter)}
            initialValue={getFilterInitialValue(filter)}
            data={data}
            anchorElement={filterCardRefs.current[editingFilterId]}
            selectedTimeGranularities={selectedTimeGranularities}
            dimensionFields={dimFields.map((d) => ({ value: d.type, rowType: d.rowType, label: d.name }))}
          />
        );
      })()}

      {/* Configure Measures modal (relocated with the Measure subsets control) */}
      {measures.length > 0 && (
        <ReorderMeasuresModal
          isOpen={isReorderModalOpen}
          onClose={() => setIsReorderModalOpen(false)}
          measures={measures}
          measureSubgroup={Array.from(measureSubgroups).join(', ') || ''}
          selectedMeasureSubgroups={measureSubgroups}
          visibleMeasureIds={visibleMeasureIds}
          autoLockMeasureIds={autoLockMeasureIds}
          onSave={(orderedMeasures, nextVisibleMeasureIds, nextAutoLockMeasureIds) => {
            onMeasuresReorder?.(orderedMeasures, nextVisibleMeasureIds, nextAutoLockMeasureIds);
          }}
        />
      )}
    </div>
  );
};

export default FiltersPanel;

