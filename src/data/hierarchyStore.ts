// Shared source of truth for hierarchies.
//
// The Setup Hierarchies modal (CpmFeaturePage, step 1.1) edits these rows and
// persists them to localStorage. The Plan Configuration builder's
// "Select Hierarchy" dropdown (PlanningGridConfig) derives its options from the
// same data, so any change to a hierarchy's name, level names or number of
// levels made in the modal shows up in the builder, and every hierarchy created
// in the modal appears in the dropdown.

import type { Hierarchy } from './planConfigData';

export type HierarchyRow = {
  id: string;
  name: string;
  active: boolean;
  dim: 'Account' | 'Product';
  levels: number;
  status: 'ok' | 'requested';
  sync: string;
  /** Optional custom level names; when present they override the generated pool. */
  levelNames?: string[];
  /** Human-readable creation date shown in the Manage Hierarchies modal. */
  createdOn?: string;
  /** Free-form data status label shown in the Manage Hierarchies modal. */
  dataStatus?: string;
};

/* Level-name pools used to build each hierarchy's level rows. Aligned to the OOTB
   Account Planning template (discrete-manufacturing / B2B). */
export const PRODUCT_LEVEL_NAMES = ['Company', 'Business Unit', 'Product Family', 'Commodity', 'Part'];
export const ACCOUNT_LEVEL_NAMES = ['Global Account Group', 'Strategic Account Group', 'Segment', 'Sold-to', 'Ship-to'];

export const HIERARCHY_STORAGE_KEY = 'cpm_hierarchies_v3';

// OOTB (out-of-the-box) hierarchy seed. This is the immutable default the app
// falls back to whenever localStorage is empty — i.e. on every fresh load, since
// the session-reset bootstrap clears the working keys. Edits made during a
// session are written to localStorage (see saveHierarchyRows) and stay connected
// across the setup page and the Plan Configuration builder until the next
// refresh, which restores this default.
export const HIERARCHY_ROWS: HierarchyRow[] = [
  {
    id: 'ootb-account-sales',
    name: 'Account Sales Hierarchy',
    active: true,
    dim: 'Account',
    levels: 5,
    status: 'ok',
    sync: '12/05/2026, 10:30 AM',
    levelNames: ['Global Account Group', 'Strategic Account Group', 'Segment', 'Sold-to', 'Ship-to'],
    createdOn: 'Out of the box',
    dataStatus: 'Sync Successful',
  },
  {
    id: 'ootb-product-sales',
    name: 'Product Sales Hierarchy',
    active: true,
    dim: 'Product',
    levels: 5,
    status: 'ok',
    sync: '12/05/2026, 10:30 AM',
    levelNames: ['Company', 'Business Unit', 'Product Family', 'Commodity', 'Part'],
    createdOn: 'Out of the box',
    dataStatus: 'Sync Successful',
  },
];

/** Read the current hierarchy rows from localStorage, falling back to defaults. */
export function loadHierarchyRows(): HierarchyRow[] {
  try {
    const saved = localStorage.getItem(HIERARCHY_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as HierarchyRow[]) : HIERARCHY_ROWS;
  } catch {
    return HIERARCHY_ROWS;
  }
}

/**
 * Persist hierarchy rows so the Plan Configuration builder can read them back.
 * Also mirrors the list of dimensions (used by other setup surfaces).
 */
export function saveHierarchyRows(rows: HierarchyRow[]): void {
  try {
    localStorage.setItem(HIERARCHY_STORAGE_KEY, JSON.stringify(rows));
    const dimensions = Array.from(new Set(rows.map((r) => r.dim)));
    localStorage.setItem('cpm_dimensions', JSON.stringify(dimensions));
  } catch {
    /* ignore quota / serialization errors */
  }
}

/** Resolve the data-status label shown for a hierarchy row. */
export function dataStatusForRow(row: HierarchyRow): string {
  if (row.dataStatus) return row.dataStatus;
  return row.status === 'ok' ? 'Sync Successful' : 'Data Requested';
}

/** Resolve the display names for each level of a hierarchy row. */
export function levelNamesForRow(row: HierarchyRow): string[] {
  if (row.levelNames && row.levelNames.length > 0) return row.levelNames;
  const pool = row.dim === 'Product' ? PRODUCT_LEVEL_NAMES : ACCOUNT_LEVEL_NAMES;
  return Array.from({ length: row.levels }, (_, i) => pool[i] || `Level ${i + 1}`);
}

/** Map the modal's hierarchy rows into the shape the Plan Config builder expects. */
export function toPlanConfigHierarchies(rows: HierarchyRow[]): Hierarchy[] {
  return rows.map((row) => {
    const names = levelNamesForRow(row);
    return {
      id: row.id,
      name: row.name,
      dimension: row.dim,
      dataStatus: dataStatusForRow(row),
      lastSync: row.sync,
      selected: false,
      isActive: row.active,
      numLevels: names.length,
      levels: names.map((name, i) => ({ id: i, level: i, name, isEditable: i >= 2 })),
    };
  });
}

/** Convenience: load rows and map them straight to Plan Config hierarchies. */
export function loadPlanConfigHierarchies(): Hierarchy[] {
  return toPlanConfigHierarchies(loadHierarchyRows());
}

// This module is the single source of truth for hierarchy data. React Fast
// Refresh preserves component state across edits, which can keep a stale
// in-memory hierarchy list alive. Force a genuine full page reload whenever this
// store changes so what you see always reflects localStorage (and the empty
// initial state).
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
