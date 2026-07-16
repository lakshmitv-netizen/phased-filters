import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { APP_USERS } from '../contexts/UserContext';
import { getMockData } from '../data/mockData';
import { adjustmentMeasuresData } from '../data/adjustmentMeasuresData';
import type { IndustryType } from '../contexts/IndustryContext';
import type { MeasureData } from '../types';
import '../styles/pages/PlanningForecastingListPage.css';
import '../styles/components/SettingsPanel.css';

/** Root measures shown in Access control table: main grid tree plus adjustment pipeline measures. */
function getAccessControlRootMeasures(industry: IndustryType | null): MeasureData[] {
  const primary = getMockData(industry);
  const seen = new Set(primary.map((m) => m.id));
  const extra = adjustmentMeasuresData.filter((m) => !seen.has(m.id));
  return [...primary, ...extra];
}

/** Per measure cell — View vs Edit only (access modal). */
type AccessScopePermission = 'View' | 'Edit';

const ACCESS_SCOPE_PERMISSION_OPTIONS: AccessScopePermission[] = ['View', 'Edit'];

type AccessTableFilterColumn = 'person' | 'jobRole' | 'subset' | 'measure' | 'access';
type AccessTableSortColumn = AccessTableFilterColumn;

interface AccessControlPerson {
  id: string;
  name: string;
  jobRole: string;
}

/** Job titles aligned with demo users (approval / user switcher roster). */
const ACCESS_CONTROL_ROLE_BY_USER_ID: Record<string, string> = {
  'john-carter': 'Key Account Manager',
  'alice-brennan': 'Key Account Manager',
  'bob-okoro': 'Key Account Manager',
  'carol-singh': 'Key Account Manager',
  'david-lee': 'Regional Sales Director',
};

/** Extra demo people beyond APP_USERS */
const ACCESS_CONTROL_EXTRA_PEOPLE: AccessControlPerson[] = [
  { id: 'elena-martinez', name: 'Elena Martinez', jobRole: 'Regional Sales Director' },
  { id: 'marcus-reid', name: 'Marcus Reid', jobRole: 'Regional Sales Director' },
  { id: 'priya-nair', name: 'Priya Nair', jobRole: 'Vice President' },
  { id: 'sam-oconnell', name: "Sam O'Connell", jobRole: 'Vice President' },
  { id: 'ryan-cole', name: 'Ryan Cole', jobRole: 'Vice President' },
  { id: 'omar-hassan', name: 'Omar Hassan', jobRole: 'Senior Vice President' },
  { id: 'nina-vogel', name: 'Nina Vogel', jobRole: 'Senior Vice President' },
  { id: 'james-wu', name: 'James Wu', jobRole: 'Senior Vice President' },
];

function buildAccessControlPeople(): AccessControlPerson[] {
  const fromAppUsers: AccessControlPerson[] = APP_USERS.map((u) => ({
    id: u.id,
    name: u.name,
    jobRole: ACCESS_CONTROL_ROLE_BY_USER_ID[u.id] ?? 'Contributor',
  }));
  return [...fromAppUsers, ...ACCESS_CONTROL_EXTRA_PEOPLE];
}

function accessMeasureCellKey(personId: string, measureId: string): string {
  return `${personId}:measure:${measureId}`;
}

/** Stable key for flattened row selection (person × measure). */
function accessFlattenedRowKey(personId: string, measureId: string): string {
  return `${personId}|${measureId}`;
}

interface AccessSearchableMultiSelectProps {
  options: string[];
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Used when `ariaLabelledby` is not set (accessible name on trigger). */
  ariaLabel: string;
  /** Prefer visible field label (e.g. id of span.list-page-modal-label). */
  ariaLabelledby?: string;
  /** Raise above column-header popovers (default 100002). */
  menuZIndex?: number;
}

/** Searchable multiselect for access table filters (above grid); fixed menu avoids modal overflow clipping. */
const AccessSearchableMultiSelect: React.FC<AccessSearchableMultiSelectProps> = ({
  options,
  values,
  onChange,
  placeholder = 'All',
  ariaLabel,
  ariaLabelledby,
  menuZIndex = 100002,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);

  const measureMenu = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const gap = 4;
    const below = window.innerHeight - r.bottom - gap - 16;
    const maxH = Math.min(260, Math.max(100, below));
    setMenuStyle({
      position: 'fixed',
      top: r.bottom + gap,
      left: r.left,
      width: Math.max(r.width, 152),
      maxHeight: maxH,
      zIndex: menuZIndex,
    });
  }, [menuZIndex]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    measureMenu();
    const ro = new ResizeObserver(() => measureMenu());
    const el = triggerRef.current;
    if (el) ro.observe(el);
    window.addEventListener('resize', measureMenu);
    document.addEventListener('scroll', measureMenu, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureMenu);
      document.removeEventListener('scroll', measureMenu, true);
    };
  }, [open, measureMenu]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const summary =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? values[0]
        : `${values.length} selected`;

  const toggle = (opt: string) => {
    onChange(values.includes(opt) ? values.filter((x) => x !== opt) : [...values, opt]);
  };

  return (
    <div className="list-page-modal-access-ms" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`list-page-modal-access-ms-trigger${open ? ' list-page-modal-access-ms-trigger--open' : ''}`}
        aria-labelledby={ariaLabelledby}
        aria-label={ariaLabelledby ? undefined : ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={values.length > 1 ? values.join(', ') : undefined}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setSearch('');
        }}
      >
        <span className={values.length === 0 ? 'list-page-modal-access-ms-summary--placeholder' : ''}>{summary}</span>
        <svg className="list-page-modal-access-ms-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && menuStyle && (
        <div
          ref={menuRef}
          className="list-page-modal-access-ms-menu"
          style={menuStyle}
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable="true"
        >
          <div className="list-page-modal-access-ms-menu-head">
            <input
              type="search"
              className="list-page-modal-access-ms-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              aria-label={`Search ${ariaLabel}`}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
            {values.length > 0 && (
              <button
                type="button"
                className="list-page-modal-access-ms-clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange([])}
              >
                Clear
              </button>
            )}
          </div>
          <div className="list-page-modal-access-ms-list">
            {filteredOptions.length === 0 ? (
              <div className="list-page-modal-access-ms-empty">No matching options</div>
            ) : (
              filteredOptions.map((opt) => (
                <label key={opt} className="list-page-modal-access-ms-option">
                  <input type="checkbox" checked={values.includes(opt)} onChange={() => toggle(opt)} />
                  <span>{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/** Access matrix column header: label + filter (opens panel) + sort (cycles asc → desc → off). */
interface AccessTableColumnHeaderProps {
  column: AccessTableFilterColumn;
  label: string;
  filterActive: boolean;
  filterPanelOpen: boolean;
  sortColumn: AccessTableSortColumn | null;
  sortDir: 'asc' | 'desc';
  onFilterClick: (anchor: HTMLElement) => void;
  onSortClick: () => void;
}

const AccessTableColumnHeader: React.FC<AccessTableColumnHeaderProps> = ({
  column,
  label,
  filterActive,
  filterPanelOpen,
  sortColumn,
  sortDir,
  onFilterClick,
  onSortClick,
}) => {
  const sortOn = sortColumn === column;
  const sortLabel = !sortOn
    ? `Sort ${label}: not applied. Activate for ascending.`
    : sortDir === 'asc'
      ? `Sort ${label}: ascending. Click for descending.`
      : `Sort ${label}: descending. Click to clear sort.`;

  return (
    <div className="list-page-modal-access-col-head-row">
      <span className="list-page-modal-access-col-head-text">{label}</span>
      <div className="list-page-modal-access-col-head-actions">
        <button
          type="button"
          className={`list-page-modal-access-col-filter-btn${filterActive ? ' list-page-modal-access-col-filter-btn--active' : ''}${
            filterPanelOpen ? ' list-page-modal-access-col-filter-btn--open' : ''
          }`}
          aria-expanded={filterPanelOpen}
          aria-haspopup="dialog"
          aria-controls={filterPanelOpen ? 'access-col-filter-panel' : undefined}
          title="Filter"
          aria-label={`Filter ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onFilterClick(e.currentTarget);
          }}
        >
          <svg className="list-page-modal-access-col-filter-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path
              fill="currentColor"
              d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"
            />
          </svg>
        </button>
        <button
          type="button"
          className={`list-page-modal-access-col-sort-btn${sortOn && sortDir === 'asc' ? ' list-page-modal-access-col-sort-btn--asc' : ''}${
            sortOn && sortDir === 'desc' ? ' list-page-modal-access-col-sort-btn--desc' : ''
          }`}
          title="Sort"
          aria-label={sortLabel}
          onClick={(e) => {
            e.stopPropagation();
            onSortClick();
          }}
        >
          <svg className="list-page-modal-access-col-sort-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path className="list-page-modal-access-col-sort-up" fill="currentColor" d="M12 6L7 14h10L12 6z" />
            <path className="list-page-modal-access-col-sort-down" fill="currentColor" d="M12 18l5-8H7l5 8z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

/**
 * Demo-only labels for Access control “Measure subset” column (does not affect hierarchical grid).
 */
const ACCESS_DEMO_MEASURE_SUBSET_LABELS = [
  'Adjustment Measures',
  'Planning Measures',
  'Revenue & Quantity Measures',
  'Revenue Measures',
  'Volume Measures',
] as const;

type AccessMeasureSubsetLabel = (typeof ACCESS_DEMO_MEASURE_SUBSET_LABELS)[number];

/** Consumer-style adjustment metrics → Adjustment bucket (demo access modal only). */
const ACCESS_MEASURE_SUBSET_ADJUSTMENT_STYLE_IDS = new Set<string>([
  'measure-promo-spend',
  'measure-days-inventory',
  'measure-trade-spend-roi',
]);

const ACCESS_MEASURE_SUBSET_PLANNING_IDS = new Set<string>(
  adjustmentMeasuresData.map((m) => m.id),
);

function getAccessMeasureSubsetLabel(measureId: string, measureName: string): AccessMeasureSubsetLabel {
  if (ACCESS_MEASURE_SUBSET_ADJUSTMENT_STYLE_IDS.has(measureId)) {
    return 'Adjustment Measures';
  }
  if (ACCESS_MEASURE_SUBSET_PLANNING_IDS.has(measureId)) {
    return 'Planning Measures';
  }
  const n = measureName.toLowerCase();
  if (/\brevenue\b/.test(n) || /\broi\b/.test(n) || (n.includes('spend') && n.includes('%'))) {
    return 'Revenue Measures';
  }
  if (
    /\bquantity\b/.test(n) ||
    /\bvolume\b/.test(n) ||
    n.includes('market share') ||
    (n.includes('days') && n.includes('inventory'))
  ) {
    return 'Volume Measures';
  }
  return 'Revenue & Quantity Measures';
}

function buildInitialAccessMatrix(industry: IndustryType | null): Record<string, AccessScopePermission> {
  const initial: Record<string, AccessScopePermission> = {};
  const people = buildAccessControlPeople();
  const measures = getAccessControlRootMeasures(industry);
  people.forEach((person) => {
    measures.forEach((m) => {
      initial[accessMeasureCellKey(person.id, m.id)] = 'View';
    });
  });
  return initial;
}

export interface AccessControlModalProps {
  open: boolean;
  onClose: () => void;
  /** Drives the measure roster in the access table. Defaults to null (all measures). */
  industry?: IndustryType | null;
  /** Modal header title. */
  title?: string;
  /** Primary (confirm) button label. */
  primaryLabel?: string;
  /** Optional callback fired before the modal closes when the primary button is clicked. */
  onPrimary?: () => void;
}

const AccessControlModal: React.FC<AccessControlModalProps> = ({
  open,
  onClose,
  industry = null,
  title = 'Access control settings',
  primaryLabel = 'Save',
  onPrimary,
}) => {
  const [accessControlMatrix, setAccessControlMatrix] = useState<Record<string, AccessScopePermission>>(
    () => buildInitialAccessMatrix(null),
  );
  const [accessFilterPersonNames, setAccessFilterPersonNames] = useState<string[]>([]);
  const [accessFilterJobRoles, setAccessFilterJobRoles] = useState<string[]>([]);
  const [accessFilterSubsetLabels, setAccessFilterSubsetLabels] = useState<string[]>([]);
  const [accessFilterMeasureNames, setAccessFilterMeasureNames] = useState<string[]>([]);
  const [accessFilterAccessLevels, setAccessFilterAccessLevels] = useState<AccessScopePermission[]>([]);
  const [accessColumnFilterPanel, setAccessColumnFilterPanel] = useState<{
    column: AccessTableFilterColumn;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const accessColumnFilterPanelRef = useRef<HTMLDivElement>(null);
  const [accessSortColumn, setAccessSortColumn] = useState<AccessTableSortColumn | null>(null);
  const [accessSortDir, setAccessSortDir] = useState<'asc' | 'desc'>('asc');
  const [accessBulkSelectedRowKeys, setAccessBulkSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [accessBulkPopoverOpen, setAccessBulkPopoverOpen] = useState(false);
  const [bulkEditPermission, setBulkEditPermission] = useState<AccessScopePermission>('View');
  const bulkEditButtonRef = useRef<HTMLButtonElement>(null);
  const bulkPopoverRef = useRef<HTMLDivElement>(null);
  const accessHeaderSelectAllRef = useRef<HTMLInputElement>(null);
  const [bulkPopoverPosition, setBulkPopoverPosition] = useState<{
    top: number;
    left: number;
    nibLeft: number;
    placement: 'below' | 'above';
  } | null>(null);

  const accessControlPeople = useMemo(() => buildAccessControlPeople(), []);

  const accessMeasureRows = useMemo(
    () =>
      getAccessControlRootMeasures(industry).map((m) => ({
        id: m.id,
        name: m.name,
        subsetLabel: getAccessMeasureSubsetLabel(m.id, m.name),
      })),
    [industry],
  );

  const accessSubsetFilterOptions = useMemo(
    () => [...ACCESS_DEMO_MEASURE_SUBSET_LABELS].sort((a, b) => a.localeCompare(b)),
    [],
  );

  const accessPersonFilterOptions = useMemo(
    () => [...new Set(accessControlPeople.map((p) => p.name))].sort((a, b) => a.localeCompare(b)),
    [accessControlPeople],
  );

  const accessJobRoleFilterOptions = useMemo(
    () => [...new Set(accessControlPeople.map((p) => p.jobRole))].sort((a, b) => a.localeCompare(b)),
    [accessControlPeople],
  );

  const accessMeasureFilterOptions = useMemo(
    () => accessMeasureRows.map((m) => m.name).sort((a, b) => a.localeCompare(b)),
    [accessMeasureRows],
  );

  const filteredAccessControlPeople = useMemo(() => {
    return accessControlPeople.filter((p) => {
      if (accessFilterPersonNames.length > 0 && !accessFilterPersonNames.includes(p.name)) return false;
      if (accessFilterJobRoles.length > 0 && !accessFilterJobRoles.includes(p.jobRole)) return false;
      return true;
    });
  }, [accessControlPeople, accessFilterPersonNames, accessFilterJobRoles]);

  type FlatAccessRow = {
    person: (typeof accessControlPeople)[number];
    measure: { id: string; name: string; subsetLabel: AccessMeasureSubsetLabel };
    rowKey: string;
  };

  const baseFlattenedAccessRows = useMemo((): FlatAccessRow[] => {
    const out: FlatAccessRow[] = [];
    filteredAccessControlPeople.forEach((person) => {
      accessMeasureRows.forEach((measure) => {
        out.push({
          person,
          measure,
          rowKey: accessFlattenedRowKey(person.id, measure.id),
        });
      });
    });
    return out;
  }, [filteredAccessControlPeople, accessMeasureRows]);

  const filteredFlattenedAccessRows = useMemo(() => {
    return baseFlattenedAccessRows.filter((row) => {
      if (
        accessFilterSubsetLabels.length > 0 &&
        !accessFilterSubsetLabels.includes(row.measure.subsetLabel)
      ) {
        return false;
      }
      if (accessFilterMeasureNames.length > 0 && !accessFilterMeasureNames.includes(row.measure.name)) {
        return false;
      }
      const perm =
        accessControlMatrix[accessMeasureCellKey(row.person.id, row.measure.id)] ?? 'View';
      if (accessFilterAccessLevels.length > 0 && !accessFilterAccessLevels.includes(perm)) {
        return false;
      }
      return true;
    });
  }, [
    baseFlattenedAccessRows,
    accessFilterSubsetLabels,
    accessFilterMeasureNames,
    accessFilterAccessLevels,
    accessControlMatrix,
  ]);

  const sortedFlattenedAccessRows = useMemo(() => {
    const rows = [...filteredFlattenedAccessRows];
    if (!accessSortColumn) return rows;
    const dir = accessSortDir === 'asc' ? 1 : -1;
    const permRank = (p: AccessScopePermission) => (p === 'View' ? 0 : 1);
    rows.sort((a, b) => {
      let cmp = 0;
      if (accessSortColumn === 'person') {
        cmp = a.person.name.localeCompare(b.person.name);
      } else if (accessSortColumn === 'jobRole') {
        cmp = a.person.jobRole.localeCompare(b.person.jobRole);
      } else if (accessSortColumn === 'subset') {
        cmp = a.measure.subsetLabel.localeCompare(b.measure.subsetLabel);
      } else if (accessSortColumn === 'measure') {
        cmp = a.measure.name.localeCompare(b.measure.name);
      } else {
        const va =
          accessControlMatrix[accessMeasureCellKey(a.person.id, a.measure.id)] ?? 'View';
        const vb =
          accessControlMatrix[accessMeasureCellKey(b.person.id, b.measure.id)] ?? 'View';
        cmp = permRank(va) - permRank(vb);
      }
      if (cmp === 0) {
        cmp =
          a.person.name.localeCompare(b.person.name) ||
          a.measure.name.localeCompare(b.measure.name);
      }
      return cmp * dir;
    });
    return rows;
  }, [filteredFlattenedAccessRows, accessSortColumn, accessSortDir, accessControlMatrix]);

  const accessBulkSelectedCount = accessBulkSelectedRowKeys.size;

  const bulkAccessSelectionLabel = useMemo(() => {
    const n = accessBulkSelectedRowKeys.size;
    if (n === 0) return '';
    return n === 1 ? '1 row selected' : `${n} rows selected`;
  }, [accessBulkSelectedRowKeys]);

  const visibleFlattenedRowKeys = useMemo(
    () => sortedFlattenedAccessRows.map((r) => r.rowKey),
    [sortedFlattenedAccessRows],
  );

  const toggleAccessColumnFilterPanel = useCallback((column: AccessTableFilterColumn, anchorEl: HTMLElement) => {
    setAccessColumnFilterPanel((cur) => {
      if (cur?.column === column) return null;
      const r = anchorEl.getBoundingClientRect();
      const panelWidth = Math.min(340, Math.max(268, r.width + 40));
      let left = r.left;
      const margin = 8;
      if (left + panelWidth > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - panelWidth - margin);
      }
      return { column, top: r.bottom + 6, left, width: panelWidth };
    });
  }, []);

  const cycleAccessColumnSort = useCallback(
    (column: AccessTableSortColumn) => {
      if (accessSortColumn !== column) {
        setAccessSortColumn(column);
        setAccessSortDir('asc');
      } else if (accessSortDir === 'asc') {
        setAccessSortDir('desc');
      } else {
        setAccessSortColumn(null);
      }
    },
    [accessSortColumn, accessSortDir],
  );

  useEffect(() => {
    if (!accessColumnFilterPanel) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (accessColumnFilterPanelRef.current?.contains(t)) return;
      if (t.closest?.('.list-page-modal-access-ms-menu')) return;
      if (t.closest?.('.list-page-modal-access-col-filter-btn')) return;
      if (t.closest?.('.list-page-modal-access-col-sort-btn')) return;
      setAccessColumnFilterPanel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccessColumnFilterPanel(null);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [accessColumnFilterPanel]);

  useEffect(() => {
    if (!open) setAccessColumnFilterPanel(null);
  }, [open]);

  const allVisibleAccessSelected =
    visibleFlattenedRowKeys.length > 0 &&
    visibleFlattenedRowKeys.every((id) => accessBulkSelectedRowKeys.has(id));

  const someVisibleAccessSelected = visibleFlattenedRowKeys.some((id) =>
    accessBulkSelectedRowKeys.has(id),
  );

  useEffect(() => {
    const el = accessHeaderSelectAllRef.current;
    if (!el) return;
    el.indeterminate = someVisibleAccessSelected && !allVisibleAccessSelected;
  }, [someVisibleAccessSelected, allVisibleAccessSelected]);

  const toggleAccessBulkSelectRow = (rowKey: string) => {
    setAccessBulkSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleAccessBulkSelectAllVisible = () => {
    setAccessBulkSelectedRowKeys((prev) => {
      const next = new Set(prev);
      const everyVisibleSelected =
        visibleFlattenedRowKeys.length > 0 &&
        visibleFlattenedRowKeys.every((id) => next.has(id));
      if (everyVisibleSelected) {
        visibleFlattenedRowKeys.forEach((id) => next.delete(id));
      } else {
        visibleFlattenedRowKeys.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const updateBulkPopoverPosition = useCallback(() => {
    const btn = bulkEditButtonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const popoverWidth = 320;
    const popoverMaxHeight = 280;
    const margin = 8;
    const buttonCenterX = r.left + r.width / 2;

    let left = r.left;
    let top = r.bottom + 8;
    let placement: 'below' | 'above' = 'below';

    if (left + popoverWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - popoverWidth - margin);
    }
    if (left < margin) left = margin;

    if (top + popoverMaxHeight > window.innerHeight - margin) {
      top = Math.max(margin, r.top - popoverMaxHeight - 8);
      placement = 'above';
    }

    const nibClamp = 18;
    const nibLeft = Math.min(popoverWidth - nibClamp, Math.max(nibClamp, buttonCenterX - left));

    setBulkPopoverPosition({ top, left, nibLeft, placement });
  }, []);

  useLayoutEffect(() => {
    if (!accessBulkPopoverOpen) {
      setBulkPopoverPosition(null);
      return;
    }
    updateBulkPopoverPosition();
    window.addEventListener('resize', updateBulkPopoverPosition);
    document.addEventListener('scroll', updateBulkPopoverPosition, true);
    return () => {
      window.removeEventListener('resize', updateBulkPopoverPosition);
      document.removeEventListener('scroll', updateBulkPopoverPosition, true);
    };
  }, [accessBulkPopoverOpen, updateBulkPopoverPosition]);

  useEffect(() => {
    if (!accessBulkPopoverOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (bulkPopoverRef.current?.contains(t) || bulkEditButtonRef.current?.contains(t)) return;
      setAccessBulkPopoverOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [accessBulkPopoverOpen]);

  useEffect(() => {
    if (!accessBulkPopoverOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccessBulkPopoverOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accessBulkPopoverOpen]);

  useEffect(() => {
    if (accessBulkPopoverOpen && accessBulkSelectedCount === 0) {
      setAccessBulkPopoverOpen(false);
    }
  }, [accessBulkPopoverOpen, accessBulkSelectedCount]);

  useEffect(() => {
    if (!open) {
      setAccessFilterPersonNames([]);
      setAccessFilterJobRoles([]);
      setAccessFilterSubsetLabels([]);
      setAccessFilterMeasureNames([]);
      setAccessFilterAccessLevels([]);
      setAccessColumnFilterPanel(null);
      setAccessSortColumn(null);
      setAccessBulkSelectedRowKeys(new Set());
      setAccessBulkPopoverOpen(false);
      return;
    }
    setAccessControlMatrix(buildInitialAccessMatrix(industry));
    setBulkEditPermission('View');
  }, [open, industry]);

  const handleBulkAccessApply = () => {
    if (accessBulkSelectedRowKeys.size === 0) return;
    setAccessControlMatrix((prev) => {
      const next = { ...prev };
      accessBulkSelectedRowKeys.forEach((rowKey) => {
        const pipe = rowKey.indexOf('|');
        if (pipe <= 0) return;
        const personId = rowKey.slice(0, pipe);
        const measureId = rowKey.slice(pipe + 1);
        if (personId && measureId) {
          next[accessMeasureCellKey(personId, measureId)] = bulkEditPermission;
        }
      });
      return next;
    });
    setAccessBulkPopoverOpen(false);
  };

  if (!open) return null;

  return createPortal(
    <>
      <div className="list-page-modal-overlay" onClick={onClose}>
        <div className="list-page-modal list-page-modal--access-wide" onClick={(e) => e.stopPropagation()}>
          <div className="list-page-modal-header">
            <h2 className="list-page-modal-title">{title}</h2>
          </div>
          <div className="list-page-modal-body list-page-modal-body--access-step" aria-label="Access control">
            <div className="list-page-modal-access-grid-block">
              <div
                className="list-page-modal-access-filters list-page-modal-access-filters--toolbar"
                role="group"
                aria-label="Access table toolbar"
              >
                <p className="list-page-modal-access-toolbar-hint">
                  Use the filter and sort icons on Person, Job role, Measure subset, Measure, and Access.
                </p>
                <div className="list-page-modal-access-bulk-actions">
                  <button
                    type="button"
                    ref={bulkEditButtonRef}
                    className="list-page-modal-access-bulk-edit-btn"
                    disabled={accessBulkSelectedCount === 0}
                    onClick={() => setAccessBulkPopoverOpen(true)}
                  >
                    Bulk edit Access
                  </button>
                </div>
              </div>
              <div className="list-page-modal-access-table-wrap">
                <table className="list-page-modal-access-table">
                  <thead>
                    <tr>
                      <th scope="col" className="list-page-modal-access-table-check-col">
                        <span className="list-page-modal-sr-only">Select rows</span>
                        <input
                          ref={accessHeaderSelectAllRef}
                          type="checkbox"
                          className="list-page-modal-access-row-check"
                          checked={allVisibleAccessSelected}
                          disabled={visibleFlattenedRowKeys.length === 0}
                          onChange={toggleAccessBulkSelectAllVisible}
                          aria-label="Select all rows shown in the table"
                        />
                      </th>
                      <th scope="col" className="list-page-modal-access-table-corner">
                        <AccessTableColumnHeader
                          column="person"
                          label="Person"
                          filterActive={accessFilterPersonNames.length > 0}
                          filterPanelOpen={accessColumnFilterPanel?.column === 'person'}
                          sortColumn={accessSortColumn}
                          sortDir={accessSortDir}
                          onFilterClick={(anchor) => toggleAccessColumnFilterPanel('person', anchor)}
                          onSortClick={() => cycleAccessColumnSort('person')}
                        />
                      </th>
                      <th scope="col" className="list-page-modal-access-table-role-col">
                        <AccessTableColumnHeader
                          column="jobRole"
                          label="Job role"
                          filterActive={accessFilterJobRoles.length > 0}
                          filterPanelOpen={accessColumnFilterPanel?.column === 'jobRole'}
                          sortColumn={accessSortColumn}
                          sortDir={accessSortDir}
                          onFilterClick={(anchor) => toggleAccessColumnFilterPanel('jobRole', anchor)}
                          onSortClick={() => cycleAccessColumnSort('jobRole')}
                        />
                      </th>
                      <th scope="col" className="list-page-modal-access-table-subset-col">
                        <AccessTableColumnHeader
                          column="subset"
                          label="Measure subset"
                          filterActive={accessFilterSubsetLabels.length > 0}
                          filterPanelOpen={accessColumnFilterPanel?.column === 'subset'}
                          sortColumn={accessSortColumn}
                          sortDir={accessSortDir}
                          onFilterClick={(anchor) => toggleAccessColumnFilterPanel('subset', anchor)}
                          onSortClick={() => cycleAccessColumnSort('subset')}
                        />
                      </th>
                      <th scope="col" className="list-page-modal-access-table-measure-col">
                        <AccessTableColumnHeader
                          column="measure"
                          label="Measure"
                          filterActive={accessFilterMeasureNames.length > 0}
                          filterPanelOpen={accessColumnFilterPanel?.column === 'measure'}
                          sortColumn={accessSortColumn}
                          sortDir={accessSortDir}
                          onFilterClick={(anchor) => toggleAccessColumnFilterPanel('measure', anchor)}
                          onSortClick={() => cycleAccessColumnSort('measure')}
                        />
                      </th>
                      <th scope="col" className="list-page-modal-access-table-access-col">
                        <AccessTableColumnHeader
                          column="access"
                          label="Access"
                          filterActive={accessFilterAccessLevels.length > 0}
                          filterPanelOpen={accessColumnFilterPanel?.column === 'access'}
                          sortColumn={accessSortColumn}
                          sortDir={accessSortDir}
                          onFilterClick={(anchor) => toggleAccessColumnFilterPanel('access', anchor)}
                          onSortClick={() => cycleAccessColumnSort('access')}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFlattenedAccessRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="list-page-modal-access-table-empty">
                          {filteredAccessControlPeople.length === 0
                            ? accessFilterPersonNames.length > 0 || accessFilterJobRoles.length > 0
                              ? 'No rows match the column filters. Open a column’s filter icon and clear selections to see more rows.'
                              : 'No people to show.'
                            : 'No rows match the column filters. Open a column’s filter icon and clear selections to see more rows.'}
                        </td>
                      </tr>
                    ) : (
                      sortedFlattenedAccessRows.map((row) => {
                        const cellKey = accessMeasureCellKey(row.person.id, row.measure.id);
                        const perm = accessControlMatrix[cellKey] ?? 'View';
                        return (
                          <tr key={row.rowKey}>
                            <td className="list-page-modal-access-table-check-cell">
                              <input
                                type="checkbox"
                                className="list-page-modal-access-row-check"
                                checked={accessBulkSelectedRowKeys.has(row.rowKey)}
                                onChange={() => toggleAccessBulkSelectRow(row.rowKey)}
                                aria-label={`Select ${row.person.name} — ${row.measure.name}`}
                              />
                            </td>
                            <th scope="row">{row.person.name}</th>
                            <td className="list-page-modal-access-table-role-cell">{row.person.jobRole}</td>
                            <td className="list-page-modal-access-table-subset-cell" title={row.measure.subsetLabel}>
                              {row.measure.subsetLabel}
                            </td>
                            <td className="list-page-modal-access-table-measure-name-cell" title={row.measure.name}>
                              {row.measure.name}
                            </td>
                            <td>
                              <select
                                className="list-page-modal-select list-page-modal-access-select"
                                aria-label={`${row.person.name} — ${row.measure.name} — access`}
                                value={perm}
                                onChange={(e) =>
                                  setAccessControlMatrix((prev) => ({
                                    ...prev,
                                    [cellKey]: e.target.value as AccessScopePermission,
                                  }))
                                }
                              >
                                {ACCESS_SCOPE_PERMISSION_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="list-page-modal-footer list-page-modal-footer--split">
            <button
              type="button"
              className="list-page-modal-button-link"
              onClick={onClose}
            >
              Cancel
            </button>
            <div className="list-page-modal-footer-actions">
              <button
                type="button"
                className="list-page-modal-create"
                onClick={() => {
                  onPrimary?.();
                  onClose();
                }}
              >
                {primaryLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
      {accessColumnFilterPanel &&
        createPortal(
          <div
            id="access-col-filter-panel"
            ref={accessColumnFilterPanelRef}
            className="list-page-modal-access-col-panel"
            style={{
              position: 'fixed',
              top: accessColumnFilterPanel.top,
              left: accessColumnFilterPanel.left,
              width: accessColumnFilterPanel.width,
              zIndex: 100045,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-col-filter-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="list-page-modal-access-col-panel-header">
              <h3 className="list-page-modal-access-col-panel-title" id="access-col-filter-title">
                {accessColumnFilterPanel.column === 'person'
                  ? 'Person'
                  : accessColumnFilterPanel.column === 'jobRole'
                    ? 'Job role'
                    : accessColumnFilterPanel.column === 'subset'
                      ? 'Measure subset'
                      : accessColumnFilterPanel.column === 'measure'
                        ? 'Measure'
                        : 'Access'}
              </h3>
              <button
                type="button"
                className="list-page-modal-access-col-panel-close"
                aria-label="Close"
                onClick={() => setAccessColumnFilterPanel(null)}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="list-page-modal-access-col-panel-body">
              {accessColumnFilterPanel.column === 'person' && (
                <>
                  <span className="list-page-modal-label" id="access-col-panel-person-label">
                    Filter by name
                  </span>
                  <AccessSearchableMultiSelect
                    menuZIndex={100055}
                    options={accessPersonFilterOptions}
                    values={accessFilterPersonNames}
                    onChange={setAccessFilterPersonNames}
                    placeholder="All people"
                    ariaLabel="Person filter"
                    ariaLabelledby="access-col-panel-person-label"
                  />
                </>
              )}
              {accessColumnFilterPanel.column === 'jobRole' && (
                <>
                  <span className="list-page-modal-label" id="access-col-panel-job-label">
                    Filter by job role
                  </span>
                  <AccessSearchableMultiSelect
                    menuZIndex={100055}
                    options={accessJobRoleFilterOptions}
                    values={accessFilterJobRoles}
                    onChange={setAccessFilterJobRoles}
                    placeholder="All roles"
                    ariaLabel="Job role filter"
                    ariaLabelledby="access-col-panel-job-label"
                  />
                </>
              )}
              {accessColumnFilterPanel.column === 'subset' && (
                <>
                  <span className="list-page-modal-label" id="access-col-panel-subset-label">
                    Filter by measure subset
                  </span>
                  <AccessSearchableMultiSelect
                    menuZIndex={100055}
                    options={accessSubsetFilterOptions}
                    values={accessFilterSubsetLabels}
                    onChange={setAccessFilterSubsetLabels}
                    placeholder="All subsets"
                    ariaLabel="Measure subset filter"
                    ariaLabelledby="access-col-panel-subset-label"
                  />
                </>
              )}
              {accessColumnFilterPanel.column === 'measure' && (
                <>
                  <span className="list-page-modal-label" id="access-col-panel-measure-label">
                    Filter by measure
                  </span>
                  <AccessSearchableMultiSelect
                    menuZIndex={100055}
                    options={accessMeasureFilterOptions}
                    values={accessFilterMeasureNames}
                    onChange={setAccessFilterMeasureNames}
                    placeholder="All measures"
                    ariaLabel="Measure filter"
                    ariaLabelledby="access-col-panel-measure-label"
                  />
                </>
              )}
              {accessColumnFilterPanel.column === 'access' && (
                <>
                  <span className="list-page-modal-label" id="access-col-panel-access-label">
                    Filter by access level
                  </span>
                  <AccessSearchableMultiSelect
                    menuZIndex={100055}
                    options={[...ACCESS_SCOPE_PERMISSION_OPTIONS]}
                    values={accessFilterAccessLevels}
                    onChange={(v) => setAccessFilterAccessLevels(v as AccessScopePermission[])}
                    placeholder="All access levels"
                    ariaLabel="Access level filter"
                    ariaLabelledby="access-col-panel-access-label"
                  />
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
      {accessBulkPopoverOpen && bulkPopoverPosition && (
        <div
          ref={bulkPopoverRef}
          className={`list-page-modal-access-bulk-popover${
            bulkPopoverPosition.placement === 'above' ? ' list-page-modal-access-bulk-popover--above' : ''
          }`}
          style={{
            position: 'fixed',
            top: bulkPopoverPosition.top,
            left: bulkPopoverPosition.left,
            zIndex: 100003,
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="access-bulk-popover-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span
            className="list-page-modal-access-bulk-popover-nib"
            style={{ left: bulkPopoverPosition.nibLeft }}
            aria-hidden
          />
          <div className="list-page-modal-access-bulk-popover-body">
            <p className="list-page-modal-access-bulk-popover-count" id="access-bulk-popover-title">
              {bulkAccessSelectionLabel}
            </p>
            <p className="list-page-modal-access-bulk-popover-hint">
              Sets access for all selected person–measure rows.
            </p>
            <div className="list-page-modal-access-bulk-popover-field">
              <label className="list-page-modal-label" htmlFor="access-bulk-permission">
                Access
              </label>
              <select
                id="access-bulk-permission"
                className="list-page-modal-select"
                value={bulkEditPermission}
                onChange={(e) => setBulkEditPermission(e.target.value as AccessScopePermission)}
              >
                {ACCESS_SCOPE_PERMISSION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="list-page-modal-access-bulk-popover-footer">
            <button
              type="button"
              className="list-page-modal-button-neutral"
              onClick={() => setAccessBulkPopoverOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="list-page-modal-create"
              disabled={accessBulkSelectedRowKeys.size === 0}
              onClick={handleBulkAccessApply}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
};

export default AccessControlModal;
