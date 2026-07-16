import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { MeasureData, GridRow as GridRowType, ParentTotalsRollupMode } from '../types';
import GridRowComponent from './GridRow';
import GridFooter from './GridFooter';
import CellNotePopover from './CellNotePopover';
import { useIndustry } from '../contexts/IndustryContext';
import {
  propagateUpward,
  propagateDownward,
  updateCrossMeasureDependencies,
  findRowById,
  flattenHierarchy,
  distributeProportionally,
  childrenForParentRollup,
  rollupChildrenForParentRow,
  collectFilterBucketNoMatchSubtreeIds,
} from '../utils/valuePropagation';
import { mergeGlobalTopBottomNMeasureChildren, sumForest, unwrapColumnFilterBucketChildren } from '../utils/filterSummaryRows';
import {
  extractSearchTerms,
  rowMatchesSearch,
  getMatchingTimePeriodKeys,
  separateSearchTerms,
} from '../utils/searchUtils';
import { ApprovalRequest } from '../types';
import type { PlanningGridCellMapsSnapshot } from '../contexts/PlanningGridSessionContext';
import { SearchHighlight } from './SearchHighlight';
import ColumnFilterPopover, { ColumnFilter } from './ColumnFilterPopover';
import { buildWeekHeaders, deriveWeekValues, weekOverlapsRange } from '../utils/weekColumns';
import { BASE_LINE_COLOR, getSubColumnLineColorMap } from '../utils/subColumnColors';
import { getConfigTimeFrame, getPlanPeriodScope } from '../data/planConfigGridData';
import '../styles/components/Grid.css';

type HierarchyDim = 'account' | 'category' | 'product';

/** Time keys used when diffing pre/post recalc for impacted styling (must match calculateMeasureValues rollups). */
const GRID_IMPACT_TIME_KEYS: (keyof GridRowType['values'])[] = [
  'year', 'h1', 'h2', 'q1', 'q2', 'q3', 'q4',
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
];

/** Resolve a row on the full (un-pruned) grid tree — measure roots are not in findRowById’s flattened walk. */
function resolveFullGridNode(rowId: string, fullData: MeasureData[]): GridRowType | MeasureData | null {
  const root = fullData.find(m => m.id === rowId);
  if (root) return root;
  return findRowById(rowId, fullData);
}

const MONTH_KEYS_FOR_ROLLUP: (keyof GridRowType['values'])[] = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
];

function zeroMonthsRollup(): GridRowType['values'] {
  const out = {} as GridRowType['values'];
  for (const mk of MONTH_KEYS_FOR_ROLLUP) {
    (out as Record<string, number>)[mk] = 0;
  }
  out.q1 = out.q2 = out.q3 = out.q4 = out.h1 = out.h2 = out.year = 0;
  return out;
}

function addMonthsRollup(a: GridRowType['values'], b: GridRowType['values']): GridRowType['values'] {
  const out = { ...a };
  for (const mk of MONTH_KEYS_FOR_ROLLUP) {
    (out as Record<string, number>)[mk] = Number(a[mk] ?? 0) + Number(b[mk] ?? 0);
  }
  out.q1 = out.jan2026 + out.feb2026 + out.mar2026;
  out.q2 = out.apr2026 + out.may2026 + out.jun2026;
  out.q3 = out.jul2026 + out.aug2026 + out.sep2026;
  out.q4 = out.oct2026 + out.nov2026 + out.dec2026;
  out.h1 = out.q1 + out.q2;
  out.h2 = out.q3 + out.q4;
  out.year = out.q1 + out.q2 + out.q3 + out.q4;
  return out;
}

/**
 * Column-filter display must show full logical totals. `calculateMeasureValues` can omit branches
 * (e.g. "Does not match filter" buckets when propagateIntoNoMatchRows is false), so **do not**
 * trust stored parent `values` — recompute from the structural tree, summing **recursive** child
 * rollups; leaves use live `gridData` cells (edited values).
 */
function rollupValuesUsingStructure(
  structNode: GridRowType | MeasureData,
  liveData: MeasureData[],
): GridRowType['values'] {
  const resolveLive = (id: string) => resolveFullGridNode(id, liveData);
  if (!structNode.children?.length) {
    const live = resolveLive(structNode.id);
    return live ? { ...live.values } : { ...structNode.values };
  }
  let acc = zeroMonthsRollup();
  for (const ch of structNode.children) {
    acc = addMonthsRollup(acc, rollupValuesUsingStructure(ch, liveData));
  }
  return acc;
}

function overlayFullSubtreeTotalsForColumnFilter(
  rows: GridRowType[],
  liveData: MeasureData[],
  structureData: MeasureData[],
): GridRowType[] {
  const visit = (r: GridRowType): GridRowType => {
    const structNode = resolveFullGridNode(r.id, structureData);
    const values = structNode ? rollupValuesUsingStructure(structNode, liveData) : { ...r.values };
    const children = r.children?.map(visit);
    return { ...r, values, children };
  };
  return rows.map(visit);
}

/** After search / column filters prune the displayed tree, re-sum each parent from its visible children only. */
function recomputeVisibleOnlyTotalsInTree(rows: GridRowType[]): GridRowType[] {
  const visit = (r: GridRowType): GridRowType => {
    if (!r.children?.length) return r;
    const newChildren = r.children.map(visit);
    let acc = zeroMonthsRollup();
    for (const ch of newChildren) {
      acc = addMonthsRollup(acc, ch.values);
    }
    return { ...r, children: newChildren, values: { ...r.values, ...acc } };
  };
  return rows.map(visit);
}

/** Snapshot every measure row and descendant so filter-summary / bucket rows can show impacted state after recalc. */
function snapshotAllRowCellValues(data: MeasureData[]): Map<string, Map<keyof GridRowType['values'], number>> {
  const out = new Map<string, Map<keyof GridRowType['values'], number>>();
  const capture = (row: GridRowType) => {
    const m = new Map<keyof GridRowType['values'], number>();
    for (const key of GRID_IMPACT_TIME_KEYS) {
      m.set(key, row.values[key]);
    }
    out.set(row.id, m);
  };
  for (const measure of data) {
    capture(measure);
    for (const r of flattenHierarchy([measure])) {
      capture(r);
    }
  }
  return out;
}

/** Single dimension targeted by active Top/Bottom N when hierarchy is not preserved (flat N mode). */
function getGlobalTopBottomNFlatViewTargetDimension(
  columnFilters: Map<string, ColumnFilter>,
  preserveHierarchy: boolean,
): HierarchyDim | null {
  if (preserveHierarchy) return null;
  const dims = new Set<HierarchyDim>();
  for (const [, filter] of columnFilters) {
    if (!filter.conditions?.length) continue;
    for (const c of filter.conditions) {
      if (c.value?.trim() === '') continue;
      if (c.operator === 'topN' || c.operator === 'bottomN') {
        const d = c.dimension;
        if (d === 'account' || d === 'category' || d === 'product') dims.add(d);
      }
    }
  }
  if (dims.size !== 1) return null;
  return [...dims][0];
}

/** Legacy 32×32 bidirectional sort icon (neutral / third-click state) */
const COL_HEADER_SORT_ICON_NEUTRAL_PATH =
  'M16.923 9.84655C17.2922 9.47731 17.2922 8.92343 16.923 8.55419L9.9076 1.47695C9.53837 1.1077 8.98452 1.1077 8.61529 1.47695L1.5384 8.55419C1.16917 8.92343 1.16917 9.47731 1.5384 9.84655L2.8307 11.1389C3.19993 11.5082 3.75377 11.5082 4.123 11.1389L6.33838 8.92344C6.70761 8.55419 7.38453 8.80035 7.38453 9.35422V22.401C7.38453 22.8933 7.8153 23.3241 8.3076 23.3241H10.1537C10.6461 23.3241 11.0768 22.8318 11.0768 22.401V9.35422C11.0768 8.80035 11.7537 8.55419 12.123 8.92344L14.3383 11.1389C14.7076 11.5082 15.2614 11.5082 15.6307 11.1389L16.923 9.84655V9.84655ZM30.4617 22.1535L29.1694 20.9226C28.8001 20.5534 28.2463 20.5534 27.8771 20.9226L25.6617 23.1381C25.2924 23.5074 24.6155 23.2612 24.6155 22.7073V9.53752C24.6155 9.04519 24.1848 8.61441 23.6925 8.61441H21.8463C21.354 8.61441 20.9232 9.10674 20.9232 9.53752V22.5843C20.9232 23.1381 20.2463 23.3843 19.8771 23.015L17.6617 20.7996C17.2925 20.4303 16.7386 20.4303 16.3694 20.7996L15.0771 22.1535C14.7079 22.5227 14.7079 23.0766 15.0771 23.4458L22.154 30.5231C22.5232 30.8923 23.0771 30.8923 23.4463 30.5231L30.5232 23.4458C30.8309 23.0766 30.8309 22.4612 30.4617 22.1535V22.1535Z';

/** Column header: neutral (legacy ↕), ascending (↑), descending (↓) — color from .col-sort-icon-btn */
function ColHeaderSortGlyph({ dir, muted }: { dir: 'asc' | 'desc' | null; muted?: boolean }) {
  const stroke = { stroke: 'currentColor', strokeWidth: 2.25, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const op = muted ? 0.45 : 1;
  if (dir === 'asc') {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: op, transition: 'opacity 0.2s' }}>
        <path d="M12 19V5M12 5l-4.5 4.5M12 5l4.5 4.5" {...stroke} />
      </svg>
    );
  }
  if (dir === 'desc') {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: op, transition: 'opacity 0.2s' }}>
        <path d="M12 5v14M12 19l-4.5-4.5M12 19l4.5-4.5" {...stroke} />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: muted ? 0.45 : 0.92, transition: 'opacity 0.2s' }}>
      <path fillRule="evenodd" clipRule="evenodd" d={COL_HEADER_SORT_ICON_NEUTRAL_PATH} fill="currentColor" />
    </svg>
  );
}

/** Deterministic pseudo-random [0,1) from a string seed - must match GridRow's getSubColumnValue */
const seededRandom = (seed: string): number => {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
  }
  return h / 4294967296;
};

const getTargetAchievementPct = (rowId: string, timeKey: string): number => {
  const rand = seededRandom(`${rowId}-${timeKey}-targetAchievement`);
  if (rand < 0.18) {
    return Math.round(4 + rand * 170);
  }
  if (rand > 0.78) {
    return Math.round(100 + ((rand - 0.78) / 0.22) * 35);
  }
  return Math.round(55 + ((rand - 0.18) / 0.60) * 45);
};

const getTargetValue = (actualValue: number, rowId: string, timeKey: string): number => {
  const achievementPct = getTargetAchievementPct(rowId, timeKey);
  if (actualValue === 0 || achievementPct <= 0) return 0;
  return actualValue / (achievementPct / 100);
};

/** Get numeric value for filter/sort. Supports composite keys like "jan2026-Actual" or "jan2026-MoM" */
/** Constituent month keys for each derived quarter / year column. */
const QUARTER_MONTH_KEYS: Record<string, string[]> = {
  q1: ['jan2026', 'feb2026', 'mar2026'],
  q2: ['apr2026', 'may2026', 'jun2026'],
  q3: ['jul2026', 'aug2026', 'sep2026'],
  q4: ['oct2026', 'nov2026', 'dec2026'],
  h1: ['jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026'],
  h2: ['jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026'],
  year: [
    'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
    'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
  ],
};

/**
 * Reads a row's raw value for a time key. Quarter / year aggregates (`q1`–`q4`, `year`)
 * can be `null` on rolled-up rows after a time-period filter is applied, so fall back to
 * summing the constituent month values — this keeps column filters / Top-N / Bottom-N
 * ranking aligned with the values the grid actually displays.
 */
const getRowTimeKeyValue = (row: GridRowType, timeKey: string): number => {
  const raw = row.values?.[timeKey as keyof typeof row.values];
  if (raw !== null && raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (!isNaN(n)) return n;
  }
  const monthKeys = QUARTER_MONTH_KEYS[timeKey];
  if (monthKeys) {
    let sum = 0;
    let any = false;
    for (const mk of monthKeys) {
      const mv = row.values?.[mk as keyof typeof row.values];
      if (mv !== null && mv !== undefined && mv !== '') {
        const n = Number(mv);
        if (!isNaN(n)) { sum += n; any = true; }
      }
    }
    if (any) return sum;
  }
  return 0;
};

const getCellNumericValueForColumn = (row: GridRowType, compositeKey: string): number => {
  const dashIdx = compositeKey.indexOf('-');
  const timeKey = dashIdx >= 0 ? compositeKey.slice(0, dashIdx) : compositeKey;
  const subColId = dashIdx >= 0 ? compositeKey.slice(dashIdx + 1) : 'Actual';
  const actualValue = getRowTimeKeyValue(row, timeKey);
  const rand = seededRandom(`${row.id}-${timeKey}-${subColId}`);
  const targetValue = getTargetValue(actualValue, row.id, timeKey);
  if (subColId === 'Actual' || subColId === 'achieved') return actualValue;
  switch (subColId) {
    case 'yoy': return Math.round((rand * 40) - 20);
    case 'mom': return Math.round((rand * 20) - 10);
    case 'variance': {
      const planned = actualValue * (0.85 + rand * 0.2);
      const variance = ((actualValue - planned) / Math.abs(planned)) * 100;
      return Math.round(variance);
    }
    case 'target': return targetValue;
    case 'targetAchievement': return getTargetAchievementPct(row.id, timeKey);
    case 'planned': return actualValue * (0.85 + rand * 0.2);
    default: return actualValue;
  }
};

/** Map global-sort criterion keys to composite keys for getCellNumericValueForColumn (e.g. yoy → jan2026-yoy). */
function expandGlobalSortColumnKey(columnKey: string, visibleTimeKeys: string[]): string {
  if (columnKey.includes('-')) return columnKey;
  const visibleSet = new Set(visibleTimeKeys);
  if (visibleSet.has(columnKey)) return columnKey;
  const first = visibleTimeKeys[0];
  return first ? `${first}-${columnKey}` : columnKey;
}

interface HierarchicalGridProps {
  data: MeasureData[];
  onDataChange?: (newData: MeasureData[]) => void;
  /** Notified whenever the set of expanded row ids changes (used to lazily grow deep hierarchies). */
  onExpandedRowsChange?: (expandedIds: Set<string>) => void;
  selectedDimensionLevels?: Set<string>;
  selectedTimeGranularities?: Set<string>;
  calendarStartMonth?: number; // 0=Jan..9=Oct; rotates month columns to fiscal start
  calendarStartYear?: number; // Calendar year of the start month (e.g. 2025 for Fiscal)
  columnWidth?: number; // Column width in pixels for time period columns
  onExpandAllRows?: (handler: () => void) => void; // Callback to register expand handler
  onCollapseAllRows?: (handler: () => void) => void; // Callback to register collapse handler
  onExpandMeasuresOnly?: (handler: () => void) => void; // Register handler that expands only measure rows (top level)
  onExpandToCategories?: (handler: () => void) => void; // Register handler that expands measures + accounts (categories collapsed)
  onResetColumnWidths?: (handler: () => void) => void; // Callback to register column-width reset handler
  onClearAllFilters?: (handler: () => void) => void; // Callback to register clear all filters handler
  onSettingsClick?: () => void; // Callback to open settings panel
  onShowCharts?: (row: GridRowType) => void; // Open the Charts panel focused on a row
  onCellEdited?: (rowId: string, periodKey: string) => void; // Fired when a cell value is edited (row + time period)
  initialFocusedCell?: { rowId: string; monthKey: string } | null; // Initial focused cell when switching layouts
  onFocusedCellChange?: (focus: { rowId: string; monthKey: string } | null) => void; // Callback when focused cell changes
  searchTerm?: string; // Search term for filtering rows and columns
  onEditHistory?: (entry: { cellKey: string; rowId: string; timeKey?: string; oldValue: number; newValue: number; note?: string }) => void; // Callback to track edit history
  onAddAdjustmentNote?: (note: Omit<import('../types/adjustmentNote').AdjustmentNote, 'id' | 'timestamp' | 'userId' | 'userName'>) => void; // Callback to add adjustment note
  cellEditHistory?: import('../types/editHistory').CellEditHistoryEntry[]; // Edit history to check for notes
  onCellFocusWithHistory?: (cellKey: string, cellRect: DOMRect | null, cellValue?: number, isLocked?: boolean) => void; // Callback when a cell is focused
  lockedCells?: Set<string>; // Set of locked cell keys that cannot be edited or impacted
  readCells?: string[]; // Array of cell keys marked as read (will not show note indicators)
  onCellContextMenu?: (e: React.MouseEvent, cellKey: string, cellValue: number, isLocked: boolean, isEditable: boolean) => void; // Callback for right-click context menu
  onUndoHandler?: (handler: () => void) => void; // Callback to register undo handler
  onRedoHandler?: (handler: () => void) => void; // Callback to register redo handler
  onCanUndoChange?: (canUndo: boolean) => void; // Callback when undo availability changes
  onCanRedoChange?: (canRedo: boolean) => void; // Callback when redo availability changes
  onCommitDrafts?: () => void; // Callback to commit draft edits to saved history (called on Save)
  onClearDrafts?: () => void; // Callback to clear draft edits (called on Cancel)
  onAfterSave?: () => void; // Callback called after save completes
  selectedCells?: Set<string>; // Set of selected cell keys
  onCellSelect?: (cellKey: string, event: React.MouseEvent) => void; // Callback when a cell is clicked for selection
  onKeyboardSelect?: (cellKey: string, isShift: boolean) => void; // Callback for keyboard-driven selection (Shift+Arrow)
  onCellMouseDown?: (cellKey: string, event: React.MouseEvent) => void; // Callback for mouse down (drag selection)
  onCellMouseMove?: (cellKey: string) => void; // Callback for mouse move (drag selection)
  lastSelectedCell?: string | null; // Last selected cell key (for drag handle indicator)
  onFillHandleDragStart?: (cellKey: string) => void; // Callback when fill handle drag starts
  onFillHandleDragMove?: (cellKey: string) => void; // Callback when fill handle is dragged
  onFillHandleDragEnd?: () => void; // Callback when fill handle drag ends
  onCellChangeHandlerReady?: (
    handler: (
      rowId: string,
      monthKey: string,
      newValue: number,
      note?: string,
      skipUndoOperation?: boolean,
      disaggregateVisibleChildrenOnly?: boolean,
    ) => void,
  ) => void; // Callback to expose cell change handler for programmatic updates
  onGetCurrentCellValueReady?: (handler: (rowId: string, monthKey: string) => number) => void; // Callback to expose function to get current cell value
  onEditingCellChange?: (cellKey: string | null) => void; // Callback when editing cell changes (cellKey format: `${rowId}-${monthKey}`)
  onSavedImpactedCellsReady?: (cells: Set<string>) => void; // Callback to expose saved impacted cells
  showAllPeriods?: boolean; // Whether to show all time periods or filter by date range
  startPeriod?: string; // Start date for filtering (YYYY-MM-DD format)
  endPeriod?: string; // End date for filtering (YYYY-MM-DD format)
  visibleMeasureIds?: Set<string>; // Set of visible measure IDs to filter impacted count
  onToggleShowOnlyImpactedKPIChange?: (checked: boolean) => void; // Callback when "Show Only Impacted Measures" is toggled
  onGetVisibleRowsReady?: (handler: () => GridRowType[]) => void; // Callback to expose function to get visible rows
  onGetVisibleTimeKeysReady?: (handler: () => (keyof GridRowType['values'])[]) => void; // Callback to expose function to get visible time keys
  onImpactedMeasuresInfoReady?: (info: { count: number; showOnlyImpactedKPI: boolean }) => void; // Callback to expose impacted measures count and toggle state
  onToggleShowOnlyImpactedKPIHandlerReady?: (handler: (checked: boolean) => void) => void; // Callback to expose toggle handler
  readonlyMeasureIds?: Set<string>; // Set of measure IDs that are read-only
  isAdjustmentGroupSelected?: boolean; // Whether Adjustment Measures Group is selected
  onMeasureGroupChange?: (groups: Set<string>) => void; // Callback to change measure group selection
  measureGroupContext?: Map<string, string>; // Per-measure group context for shared measures
  onMeasureGroupContextChange?: (measureId: string, groupContext: string) => void; // Callback to change per-measure group context
  sharedMeasureIds?: string[]; // IDs of measures that exist in multiple groups
  onScrollToMeasureReady?: (handler: (measureId: string) => void) => void; // Callback to expose function to scroll to a measure
  newlyAddedMeasureIds?: string[]; // IDs of newly added measures for animation effect
  frozenColumns?: Array<{ id: string; name: string }>; // Array of frozen columns to display
  showAdditionalFrozenColumns?: boolean; // Whether to show additional frozen columns
  subColumns?: Array<{ id: string; name: string }>; // Sub-columns to show within each time column
  globalSortConfig?: import('../components/GlobalSortPanel').GlobalSortConfig; // Global multi-column sort config
  approvalRequests?: Map<string, import('../types').ApprovalRequest>; // Map of approval requests keyed by cellKey
  onApprovalUpdate?: (cellKey: string, approval: import('../types').ApprovalRequest | null) => void; // Callback to update approval status
  onApprovalAction?: (approvalId: string, action: 'submitForApproval' | 'approved' | 'approvedWithCondition' | 'rejected', comment: string, approverRole?: string) => void; // Direct action handler (supports multi-approver)
  onApprovalStatusChangeViewHistory?: (cellKey: string) => void; // Callback to view edit history for approval status change
  onApprovalStatusChangeMarkAsRead?: (cellKey: string) => void; // Callback to mark approval status change as read
  conditionalFormattingRules?: import('../types/conditionalFormatting').ConditionalFormattingRule[];
  /** Merge background "greater than" rules into one color scale by threshold. */
  conditionalFormattingColorScaleMerge?: boolean;
  isDesignSystemRulesEnabled?: boolean;
  /** Parent totals: full hierarchy vs visible children only vs legacy bucket layout. */
  parentTotalsRollupMode?: ParentTotalsRollupMode;
  /**
   * When parent totals use bucket mode: if false, downward propagation skips the synthetic
   * "Does not match filter" bucket (edits inside that subtree still propagate within it).
   * Omitted/true preserves legacy behavior (propagate into no-match).
   */
  propagateIntoNoMatchRows?: boolean;
  /** When opening a measure cell edit, default “limit split to visible child rows” to this value. */
  measureEditDisaggregateVisibleChildrenDefault?: boolean;
  /** Plan is Submitted — grid shows pending approval styling and blocks edits. */
  planReviewGridLock?: boolean;
  /** Plan submitter during Submitted — stripes all plan-locked value cells (read-only texture). */
  planReviewRequesterStripes?: boolean;
  /** Manager/approver: pencil opens inline edit popover (Manager override in More Actions) during review. */
  approverMayOpenReviewPopover?: boolean;
  /** Per-cell unlock when an approver uses Override (value cells only). */
  approverOverrideCellKeys?: Set<string>;
  pendingApproverEdit?: { rowId: string; monthKey: string } | null;
  onPendingApproverEditConsumed?: () => void;
  onManagerOverrideForCell?: (cellKey: string) => void;
  /** Restore cell edit maps after navigating back to the grid (Planning session persistence). */
  initialCellMapsSnapshot?: PlanningGridCellMapsSnapshot | null;
  /** Called when edit/impact/note maps change (debounced) so parent can persist across routes. */
  onCellMapsSnapshotChange?: (snapshot: PlanningGridCellMapsSnapshot) => void;
  /**
   * Full hierarchy shape (ids + nesting) for parent rollups — **values** still read from `rollupValueSourceData` / `gridData`.
   * Use the session’s widest tree (e.g. `originalData`) so account totals include categories hidden by column filters.
   */
  rollupStructureData?: MeasureData[];
  /**
   * Full dimension tree with live `values` merged in (e.g. `mergeRowValuesIntoFullTree(originalData, data)`).
   * Required when the Filters panel **prunes** rows from `data`: parent totals must still sum hidden branches.
   */
  rollupValueSourceData?: MeasureData[];
  /** Column / quick filters in the grid that can hide rows from the visible hierarchy (for parent UI hints). */
  onRowHidingFiltersChange?: (info: { hasColumnFilters: boolean; hasQuickFilters: boolean; columnFilters: Map<string, ColumnFilter> }) => void;
  /** Column filters injected from outside (e.g. a Focus-grid Bottom-N action). Seeds the grid's
   *  internal column filters; null leaves user-applied column filters untouched. */
  externalColumnFilters?: Map<string, ColumnFilter> | null;
}

const HierarchicalGrid: React.FC<HierarchicalGridProps> = ({ 
  data,
  rollupStructureData,
  rollupValueSourceData,
  onDataChange, 
  onExpandedRowsChange,
  selectedDimensionLevels, 
  selectedTimeGranularities,
  calendarStartMonth = 0,
  calendarStartYear = 2026,
  onAddAdjustmentNote, 
  columnWidth = 100, 
  onExpandAllRows, 
  onCollapseAllRows,
  onExpandMeasuresOnly,
  onExpandToCategories,
  onResetColumnWidths,
  onClearAllFilters,
  onCellFocusWithHistory,
  onSettingsClick,
  onShowCharts,
  onCellEdited,
  initialFocusedCell,
  onFocusedCellChange,
  searchTerm = '',
  onEditHistory,
  cellEditHistory = [],
  lockedCells = new Set<string>(),
  readCells = [],
  onUndoHandler,
  onRedoHandler,
  onCanUndoChange,
  onCanRedoChange,
  onCellContextMenu,
  onCommitDrafts,
  onClearDrafts,
  onAfterSave,
  selectedCells = new Set(),
  onCellSelect,
  onKeyboardSelect,
  onCellMouseDown,
  onCellMouseMove,
  lastSelectedCell = null,
  onFillHandleDragStart,
  onFillHandleDragMove,
  onFillHandleDragEnd,
  onCellChangeHandlerReady,
  showAllPeriods = true,
  startPeriod = '',
  endPeriod = '',
  onGetCurrentCellValueReady,
  onEditingCellChange,
  onSavedImpactedCellsReady,
  visibleMeasureIds,
  onToggleShowOnlyImpactedKPIChange,
  onGetVisibleRowsReady,
  onGetVisibleTimeKeysReady,
  onImpactedMeasuresInfoReady,
  onToggleShowOnlyImpactedKPIHandlerReady,
  readonlyMeasureIds: readonlyMeasureIdsProp = new Set<string>(),
  isAdjustmentGroupSelected = false,
  onMeasureGroupChange,
  measureGroupContext = new Map<string, string>(),
  onMeasureGroupContextChange,
  sharedMeasureIds = [],
  onScrollToMeasureReady,
  newlyAddedMeasureIds = [],
  frozenColumns = [],
  showAdditionalFrozenColumns = false,
  subColumns = [],
  globalSortConfig,
  approvalRequests = new Map(),
  onApprovalUpdate,
  onApprovalAction: onApprovalActionDirect,
  onApprovalStatusChangeViewHistory,
  onApprovalStatusChangeMarkAsRead,
  conditionalFormattingRules = [],
  conditionalFormattingColorScaleMerge = false,
  isDesignSystemRulesEnabled = true,
  parentTotalsRollupMode = 'fullHierarchy',
  propagateIntoNoMatchRows = true,
  measureEditDisaggregateVisibleChildrenDefault = false,
  planReviewGridLock = false,
  planReviewRequesterStripes = false,
  approverMayOpenReviewPopover = false,
  approverOverrideCellKeys,
  pendingApproverEdit = null,
  onPendingApproverEditConsumed,
  onManagerOverrideForCell,
  initialCellMapsSnapshot = null,
  onCellMapsSnapshotChange,
  onRowHidingFiltersChange,
  externalColumnFilters,
}) => {
  const readonlyMeasureIds = readonlyMeasureIdsProp;
  const { industry } = useIndustry();
  // Bifurcation removed: every industry (incl. grid-264) now uses the manufacturing (legacy) grid UX.
  const isGrid264Ux = false;
  
  // Store onEditHistory in a ref so it's always available in callbacks
  const onEditHistoryRef = useRef(onEditHistory);
  useEffect(() => {
    onEditHistoryRef.current = onEditHistory;
  }, [onEditHistory]);

  // Store onCellEdited in a ref so handleCellChange can notify without dep churn.
  const onCellEditedRef = useRef(onCellEdited);
  useEffect(() => {
    onCellEditedRef.current = onCellEdited;
  }, [onCellEdited]);

  // Color per charted sub-column, matching the Charts panel trend lines, for header dots.
  const subColLineColors = useMemo(() => getSubColumnLineColorMap(subColumns), [subColumns]);
  
  // Note: Debug logging for onEditHistory removed
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [gridData, setGridData] = useState<MeasureData[]>(data);
  /** Latest filtered measure tree (for “disaggregate to visible children only” on measure edits). */
  const filteredMeasureRowsRef = useRef<GridRowType[] | null>(null);

  // Sync gridData when the data prop reference changes (e.g. industry switch or HMR reload)
  useEffect(() => {
    setGridData(data);
  }, [data]);

  /** Bucket row + every nested dimension under each "Does not match filter" (for scratch-out + read-only). */
  const excludedNoMatchSubtreeRowIds = useMemo(() => {
    if (parentTotalsRollupMode !== 'columnFilterBuckets' || propagateIntoNoMatchRows !== false) {
      return undefined;
    }
    return collectFilterBucketNoMatchSubtreeIds(gridData);
  }, [gridData, parentTotalsRollupMode, propagateIntoNoMatchRows]);

  // Pre-compute per-(timeKey, parentId) sibling value arrays for concentration ranking.
  // Grouping by parentId means products rank only vs siblings under the same category,
  // categories vs siblings under the same account, accounts vs siblings under the same measure.
  const allCellValuesByType = useMemo(() => {
    const result = new Map<string, Map<string, number[]>>();
    // Include _cost as a special key so sibling cost values can be looked up per parent group.
    const timeKeys = ['jan2026','feb2026','mar2026','apr2026','may2026','jun2026','jul2026','aug2026','sep2026','oct2026','nov2026','dec2026','q1','q2','q3','q4','year','_cost'];
    const visitRow = (row: GridRowType) => {
      const siblingGroupKey = row.parentId ?? 'root';
      for (const tk of timeKeys) {
        const v = (row.values as Record<string, number>)[tk];
        if (typeof v === 'number' && isFinite(v)) {
          if (!result.has(tk)) result.set(tk, new Map());
          const bySibling = result.get(tk)!;
          if (!bySibling.has(siblingGroupKey)) bySibling.set(siblingGroupKey, []);
          bySibling.get(siblingGroupKey)!.push(v);
        }
      }
      row.children?.forEach(visitRow);
    };
    gridData.forEach(m => m.children?.forEach(visitRow));
    return result;
  }, [gridData]);

  // All values per time key across every row — used for pctOfColumnTotal (data bar relative sizing).
  const allCellValues = useMemo(() => {
    const result = new Map<string, number[]>();
    const timeKeys = ['jan2026','feb2026','mar2026','apr2026','may2026','jun2026','jul2026','aug2026','sep2026','oct2026','nov2026','dec2026','q1','q2','q3','q4','year'];
    const visitRow = (row: GridRowType) => {
      for (const tk of timeKeys) {
        const v = (row.values as Record<string, number>)[tk];
        if (typeof v === 'number' && isFinite(v)) {
          if (!result.has(tk)) result.set(tk, []);
          result.get(tk)!.push(v);
        }
      }
      row.children?.forEach(visitRow);
    };
    gridData.forEach(m => { visitRow(m); m.children?.forEach(visitRow); });
    return result;
  }, [gridData]);
  
  // Quick filter state: map of rowId -> QuickFilterCriteria
  const [quickFilters, setQuickFilters] = useState<Map<string, import('./AddRemoveChildNodesModal').QuickFilterCriteria>>(new Map());
  
  // Helper function to get frozen column value (same as GridRow)
  const getFrozenColumnValue = useCallback((colId: string, rowId: string): string => {
    // Deterministic pseudo-random from rowId + colId
    let h = 5381;
    const seed = `${rowId}-${colId}`;
    for (let i = 0; i < seed.length; i++) {
      h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
    }
    const rand = h / 4294967296;
    
    switch (colId) {
      case 'users': {
        const userNames = [
          'John Doe', 'Jane Smith', 'Michael Johnson', 'Sarah Williams', 
          'David Brown', 'Emily Davis', 'Robert Miller', 'Lisa Wilson',
          'James Moore', 'Jennifer Taylor', 'William Anderson', 'Maria Martinez',
          'Richard Jackson', 'Patricia White', 'Joseph Harris', 'Linda Martin'
        ];
        return userNames[Math.floor(rand * userNames.length)];
      }
      case 'status': {
        const statuses = ['Active', 'Inactive'];
        return statuses[Math.floor(rand * statuses.length)];
      }
      case 'region':
        return ['North', 'South', 'East', 'West', 'Central', 'Northeast', 'Northwest'][Math.floor(rand * 7)];
      case 'team':
        return ['Team A', 'Team B', 'Team C', 'Team Alpha', 'Team Beta', 'Team Gamma'][Math.floor(rand * 6)];
      case 'condition': {
        // Determine condition based on target achievement percentage
        // Use first time key as reference for consistency
        const firstTimeKey = 'jan2026';
        const achievementPct = getTargetAchievementPct(rowId, firstTimeKey);
        
        if (achievementPct >= 100) {
          return 'Excellent';
        } else if (achievementPct >= 80) {
          return 'Good';
        } else {
          return 'Needs Attention';
        }
      }
      default:
        return '';
    }
  }, []);
  
  // Handler to apply quick filter
  const handleApplyQuickFilter = useCallback((rowId: string, criteria: import('./AddRemoveChildNodesModal').QuickFilterCriteria | null) => {
    setQuickFilters(prev => {
      const newMap = new Map(prev);
      if (criteria === null) {
        newMap.delete(rowId);
      } else {
        newMap.set(rowId, criteria);
      }
      return newMap;
    });
  }, []);
  
  // Filter children based on quick filter criteria (recursive)
  const filterChildrenByQuickFilter = useCallback((row: GridRowType): GridRowType | null => {
    if (!row.children || row.children.length === 0) {
      return row;
    }
    
    const rowQuickFilter = quickFilters.get(row.id);
    
    if (!rowQuickFilter || !rowQuickFilter.filterColumn) {
      // No filter for this row, but recursively filter children
      const filteredChildren = row.children
        .map(child => filterChildrenByQuickFilter(child))
        .filter((c): c is GridRowType => c !== null);
      
      if (filteredChildren.length === 0) {
        return null;
      }
      return { ...row, children: filteredChildren };
    }
    
    // Apply filter to children
    const filteredChildren = row.children
      .map(child => {
        let matches = false;
        
        if (rowQuickFilter.filterColumn === 'dimension') {
          // Filter by node ID when filterColumn is 'dimension'
          matches = rowQuickFilter.selectedValues.includes(child.id);
        } else {
          // Filter by frozen column value
          const childValue = getFrozenColumnValue(rowQuickFilter.filterColumn!, child.id);
          matches = rowQuickFilter.selectedValues.includes(childValue);
        }
        
        if (matches) {
          // Recursively filter this child's children
          return filterChildrenByQuickFilter(child);
        }
        return null;
      })
      .filter((c): c is GridRowType => c !== null);
    
    if (filteredChildren.length === 0) {
      return null; // No children match the filter
    }
    
    return { ...row, children: filteredChildren };
  }, [quickFilters, getFrozenColumnValue]);

  // Frozen column resize - only tracks the frozen columns width (not dimensions column)
  // Dimensions column is always 300px, frozen columns are resizable
  const [frozenColWidth, setFrozenColWidth] = useState(() => frozenColumns.length * 140);
  const frozenColResizingRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mainHeaderCellRef = useRef<HTMLTableCellElement>(null);
  const [headerRowHeight, setHeaderRowHeight] = useState(37);
  // Width of the frozen first (dimensions) column - user-adjustable via drag handle.
  const DIM_COL_MIN_WIDTH = 160;
  const DIM_COL_MAX_WIDTH = 640;
  const [dimensionsColWidth, setDimensionsColWidth] = useState(300);
  const dimColResizingRef = useRef(false);
  const firstColHeaderRef = useRef<HTMLTableCellElement>(null);
  // Actual rendered right edge of the first column (relative to the wrapper). The column
  // can't shrink below its content floor, so its real edge may differ from dimensionsColWidth;
  // the resize handle follows this measured edge so it always sits exactly at the column border.
  const [firstColEdge, setFirstColEdge] = useState<number | null>(null);
  const totalFrozenWidth = dimensionsColWidth + frozenColWidth;

  // Column-level sort
  const [sortConfig, setSortConfig] = useState<{ columnKey: string; direction: 'asc' | 'desc' } | null>(null);

  const handleSortClick = useCallback((e: React.MouseEvent<HTMLButtonElement>, key: string) => {
    e.stopPropagation();
    console.log('[SORT] Clicked column:', key);
    setSortConfig(prev => {
      const newConfig = !prev || prev.columnKey !== key
        ? { columnKey: key, direction: 'asc' }
        : prev.direction === 'asc'
        ? { columnKey: key, direction: 'desc' }
        : null;
      console.log('[SORT] New sort config:', newConfig);
      return newConfig;
    });
  }, []);

  /** Flat list under each measure whenever panel has "preserve hierarchy" off (independent of column sort) */
  const isFlattenedSortAncestorPathVisible = useMemo(() => {
    if (!globalSortConfig || globalSortConfig.preserveHierarchy) return false;
    return true;
  }, [globalSortConfig]);

  // Recursively sort children at each level (preserve hierarchy mode)
  const sortRowTree = useCallback((row: GridRowType, colKey: string, dir: 'asc' | 'desc', preserve: boolean): GridRowType => {
    if (!row.children || row.children.length === 0) return row;
    const getVal = (r: GridRowType) => colKey.includes('-')
      ? getCellNumericValueForColumn(r, colKey)
      : Number(r.values?.[colKey as keyof typeof r.values] ?? 0);
    const sorted = [...row.children].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      return dir === 'asc' ? av - bv : bv - av;
    });
    if (preserve) {
      return { ...row, children: sorted.map(c => sortRowTree(c, colKey, dir, preserve)) };
    } else {
      const flattenAll = (r: GridRowType): GridRowType[] => [r, ...(r.children ? r.children.flatMap(flattenAll) : [])];
      const allDesc = row.children.flatMap(flattenAll);
      const sortedFlat = allDesc.sort((a, b) => {
        const av = getVal(a);
        const bv = getVal(b);
        return dir === 'asc' ? av - bv : bv - av;
      });
      return { ...row, children: sortedFlat.map(c => ({ ...c, children: undefined })) };
    }
  }, []);

  /** Flatten dimension rows under a measure in tree order (no sort) — used when preserveHierarchy is off but column sort is cleared */
  const flattenMeasureChildrenInTreeOrder = useCallback((row: GridRowType): GridRowType => {
    if (!row.children?.length) return row;
    const flattenAll = (r: GridRowType): GridRowType[] => [
      r,
      ...(r.children?.length ? r.children.flatMap(flattenAll) : []),
    ];
    const flat = row.children.flatMap(flattenAll);
    return { ...row, children: flat.map(c => ({ ...c, children: undefined })) };
  }, []);

  // Column-level filters: map of columnKey -> ColumnFilter
  const [columnFilters, setColumnFilters] = useState<Map<string, ColumnFilter>>(new Map());

  // Seed column filters from a Focus-grid action (e.g. Bottom-N categories). Only touches the
  // internal column filters while a focus filter is active, then clears its own injection so the
  // user's manually-applied column filters are never clobbered.
  const externalColumnFilterActiveRef = useRef(false);
  useEffect(() => {
    if (externalColumnFilters && externalColumnFilters.size > 0) {
      setColumnFilters(new Map(externalColumnFilters));
      externalColumnFilterActiveRef.current = true;
    } else if (externalColumnFilterActiveRef.current) {
      setColumnFilters(new Map());
      externalColumnFilterActiveRef.current = false;
    }
  }, [externalColumnFilters]);

  // Extract dimension names from data for name-based filtering
  const dimensionNames = useMemo(() => {
    const accounts = new Set<string>();
    const categories = new Set<string>();
    const products = new Set<string>();
    
    const extractNames = (rows: GridRowType[] | undefined) => {
      if (!rows) return;
      rows.forEach(row => {
        if (row.type === 'account') accounts.add(row.name);
        else if (row.type === 'category') categories.add(row.name);
        else if (row.type === 'product') products.add(row.name);
        extractNames(row.children);
      });
    };
    
    data.forEach(measure => extractNames(measure.children));
    
    return {
      account: Array.from(accounts).sort(),
      category: Array.from(categories).sort(),
      product: Array.from(products).sort(),
    };
  }, [data]);

  useEffect(() => {
    onRowHidingFiltersChange?.({
      hasColumnFilters: columnFilters.size > 0,
      hasQuickFilters: quickFilters.size > 0,
      columnFilters: columnFilters,
    });
  }, [columnFilters, quickFilters, onRowHidingFiltersChange]);

  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null);
  const filterBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleFilterIconClick = useCallback((e: React.MouseEvent<HTMLButtonElement>, key: string) => {
    e.stopPropagation();
    if (openFilterKey === key) {
      setOpenFilterKey(null);
      setFilterAnchorEl(null);
    } else {
      setOpenFilterKey(key);
      setFilterAnchorEl(e.currentTarget);
    }
  }, [openFilterKey]);

  const handleFilterApply = useCallback((columnKey: string, filter: ColumnFilter | null) => {
    setColumnFilters(prev => {
      const next = new Map(prev);
      if (filter === null) {
        next.delete(columnKey);
      } else {
        next.set(columnKey, filter);
      }
      return next;
    });
    setOpenFilterKey(null);
    setFilterAnchorEl(null);
  }, []);

  // Check if a single row's values pass all active column filters
  const rowPassesFilters = useCallback((row: GridRowType): boolean => {
    if (row.type === 'filterSummary') return true;
    if (columnFilters.size === 0) return true;

    const evaluateNumeric = (numVal: number, operator: '>=' | '<=' | '>' | '<' | '=' | '!=', filterValue: string): boolean => {
      const filterNum = parseFloat(filterValue);
      if (isNaN(numVal) || isNaN(filterNum)) return true;
      switch (operator) {
        case '>=': return numVal >= filterNum;
        case '<=': return numVal <= filterNum;
        case '>': return numVal > filterNum;
        case '<': return numVal < filterNum;
        case '=': return numVal === filterNum;
        case '!=': return numVal !== filterNum;
        default: return true;
      }
    };

    const rowMatchesDimension = (dimension: 'account' | 'category' | 'product'): boolean => {
      const rowType = String(row.type || '').toLowerCase();
      return rowType === dimension;
    };

    const getRowMeasureId = (): string | null => {
      if (row.type === 'measure') return row.id;
      const parts = row.id.split('-');
      const measureIndex = parts.findIndex(part => part === 'measure');
      if (measureIndex >= 0 && measureIndex < parts.length - 1) {
        return `measure-${parts.slice(measureIndex + 1).join('-')}`;
      }
      return null;
    };
    const rowMeasureId = getRowMeasureId();
    const topBottomCache = new Map<string, Set<string>>();
    const preserveHierarchyForTopBottom = globalSortConfig?.preserveHierarchy ?? true;

    for (const [colKey, filter] of columnFilters) {
      // Handle approval status columns specially
      if (colKey.includes('-approvalStatus')) {
        // Extract time key from column key (e.g., "jan2026-approvalStatus" -> "jan2026")
        const timeKey = colKey.replace('-approvalStatus', '');
        const cellKey = `${row.id}-${timeKey}`;
        const approval = approvalRequests.get(cellKey);
        const cellStatus = approval ? approval.status : 'notSubmitted';
        // For approval status, operator is always '=' and value is the status string
        const passes = filter.value === cellStatus;
        if (!passes) return false;
        continue;
      }

      // Handle multi-condition (AND) filters with dimension selection and measure-specific values.
      if (filter.conditions && filter.conditions.length > 0) {
        const activeConditions = filter.conditions.filter(c => {
          // Name filter is active if selectedNames is not empty
          if (c.measureId === 'name') {
            return c.selectedNames && c.selectedNames.length > 0;
          }
          // Other filters are active if value is not empty and measureId is specified
          return c.value?.trim() !== '' && c.measureId;
        });
        if (activeConditions.length === 0) continue;
        
        const matchingConditions = activeConditions.filter(cond => rowMatchesDimension(cond.dimension));
        // If this row doesn't belong to any targeted dimension for this filter,
        // keep it visible (e.g., product rows remain when only account/category
        // conditions are defined).
        if (matchingConditions.length === 0) continue;

        // Helper to find dimension row value in a specific measure
        // Returns { found: boolean, value: number }
        const getDimensionValueInMeasure = (dimensionRowId: string, measureId: string, columnKey: string): { found: boolean; value: number } => {
          // CRITICAL: Choose data source based on parentTotalsRollupMode
          // - When mode is 'fullHierarchy': use gridData (has current edited values with full rollups)
          // - When mode is 'visibleOnly' or 'columnFilterBuckets': use rollupValueSourceData (stable full-hierarchy values)
          //   to prevent filter conditions from breaking when rollup mode changes
          const dataSource = (parentTotalsRollupMode === 'visibleOnly' || parentTotalsRollupMode === 'columnFilterBuckets')
            ? (rollupValueSourceData || gridData)
            : gridData;
          
          const targetMeasure = dataSource.find(m => m.id === measureId);
          if (!targetMeasure) {
            return { found: false, value: NaN };
          }
          
          // Row ID format: "account-{slug}-{currentMeasureId}" or "category-{accSlug}-{catSlug}-{currentMeasureId}"
          // Find current measure ID by checking which measure ID appears in this row's ID
          let currentMeasureId = '';
          for (const m of dataSource) {
            if (dimensionRowId.includes(`-${m.id}`)) {
              currentMeasureId = m.id;
              break;
            }
          }
          
          if (!currentMeasureId) {
            return { found: false, value: NaN };
          }
          
          // Build target row ID by replacing measure ID
          const targetRowId = dimensionRowId.replace(`-${currentMeasureId}`, `-${measureId}`);
          
          // Recursively search for this row in the target measure's hierarchy
          const findInHierarchy = (rows: GridRowType[] | undefined): GridRowType | null => {
            if (!rows) return null;
            for (const r of rows) {
              if (r.id === targetRowId) return r;
              const found = findInHierarchy(r.children);
              if (found) return found;
            }
            return null;
          };
          
          const targetRow = findInHierarchy(targetMeasure.children);
          if (!targetRow) {
            return { found: false, value: NaN };
          }
          
          // CRITICAL: Always use getCellNumericValueForColumn to get the correct rolled-up value
          // This ensures cross-measure lookups return the same aggregated value that
          // the row would see when evaluating its own filter
          const val = getCellNumericValueForColumn(targetRow, columnKey);
          
          return { found: true, value: val };
        };

        const passesAll = matchingConditions.every(cond => {
          // Handle name-based filtering
          if (cond.measureId === 'name') {
            const selectedNames = cond.selectedNames || [];
            if (selectedNames.length === 0) return true; // No names selected = pass all
            return selectedNames.includes(row.name);
          }
          
          // Handle Top-N/Bottom-N operators first (before same-measure/cross-measure branching)
          if (cond.operator === 'topN' || cond.operator === 'bottomN') {
            const n = parseInt(cond.value, 10);
            if (!Number.isFinite(n) || n <= 0) return false;

            // A per-condition rankScope overrides the Sort panel's preserveHierarchy so a
            // filter can rank globally (exactly N rows) while the tree stays nested/expanded.
            const rankWithinSiblings = cond.rankScope
              ? cond.rankScope === 'siblings'
              : preserveHierarchyForTopBottom;

            const cacheKey = `${colKey}|${cond.dimension}|${cond.measureId ?? ''}|${cond.operator}|${n}|ph:${rankWithinSiblings ? '1' : '0'}`;
            let allowedRowIds = topBottomCache.get(cacheKey);
            if (!allowedRowIds) {
              allowedRowIds = new Set<string>();

              const rowValueForCol = (r: GridRowType): number => {
                // If condition specifies a measure, get value from that measure
                if (cond.measureId) {
                  const result = getDimensionValueInMeasure(r.id, cond.measureId, colKey);
                  return result.value;
                }
                const val = colKey.includes('-')
                  ? getCellNumericValueForColumn(r, colKey)
                  : (typeof r.values?.[colKey as keyof typeof r.values] === 'number'
                    ? r.values[colKey as keyof typeof r.values]
                    : parseFloat(String(r.values?.[colKey as keyof typeof r.values] ?? '')));
                return val;
              };

              if (rankWithinSiblings) {
                /** Top/Bottom N among direct children of each parent that match the dimension */
                const rankSiblingsUnderParent = (children: GridRowType[] | undefined) => {
                  if (!children?.length) return;
                  const dimRows = children.filter(c => c.type === cond.dimension);
                  if (dimRows.length > 0) {
                    const ranked = dimRows
                      .map(r => ({ id: r.id, value: rowValueForCol(r) }))
                      .filter(x => !isNaN(x.value));
                    ranked.sort((a, b) =>
                      cond.operator === 'topN' ? b.value - a.value : a.value - b.value
                    );
                    ranked.slice(0, n).forEach(x => allowedRowIds!.add(x.id));
                  }
                  for (const c of children) {
                    rankSiblingsUnderParent(c.children);
                  }
                };

                gridData.forEach(measure => {
                  if (cond.measureId && cond.measureId !== measure.id) return;
                  rankSiblingsUnderParent(measure.children);
                });
              } else {
                /** Top/Bottom N across all rows of that dimension under the measure (ignore parent boundaries) */
                const candidates: Array<{ id: string; value: number }> = [];
                const collectByDimension = (rows: GridRowType[] | undefined) => {
                  if (!rows) return;
                  rows.forEach(r => {
                    if (r.type === cond.dimension) {
                      const val = rowValueForCol(r);
                      if (!isNaN(val)) candidates.push({ id: r.id, value: val });
                    }
                    if (r.children && r.children.length > 0) collectByDimension(r.children);
                  });
                };

                gridData.forEach(measure => {
                  if (cond.measureId && cond.measureId !== measure.id) return;
                  collectByDimension(measure.children);
                });

                const sorted = [...candidates].sort((a, b) =>
                  cond.operator === 'topN' ? b.value - a.value : a.value - b.value
                );
                sorted.slice(0, n).forEach(c => allowedRowIds!.add(c.id));
              }

              topBottomCache.set(cacheKey, allowedRowIds);
            }
            return allowedRowIds.has(row.id);
          }
          
          // Handle regular numeric operators (>=, <=, >, <, =, !=)
          // Get value from the target measure specified in the filter
          // This ensures consistent filtering across all measures
          const rowMeasureId = getRowMeasureId();
          
          // If no measure specified in condition, use row's own value
          if (!cond.measureId) {
            const numVal = colKey.includes('-')
              ? getCellNumericValueForColumn(row, colKey)
              : (typeof row.values?.[colKey as keyof typeof row.values] === 'number' 
                ? row.values![colKey as keyof typeof row.values] 
                : parseFloat(String(row.values?.[colKey as keyof typeof row.values] ?? '')));
            if (isNaN(numVal)) return true;
            return evaluateNumeric(numVal, cond.operator, cond.value);
          }
          
          // Check if this row is already in the target measure
          if (rowMeasureId === cond.measureId) {
            // Row is in the target measure, use its own value directly
            const numVal = colKey.includes('-')
              ? getCellNumericValueForColumn(row, colKey)
              : (typeof row.values?.[colKey as keyof typeof row.values] === 'number' 
                ? row.values![colKey as keyof typeof row.values] 
                : parseFloat(String(row.values?.[colKey as keyof typeof row.values] ?? '')));
            if (isNaN(numVal)) return true;
            
            return evaluateNumeric(numVal, cond.operator, parseFloat(cond.value));
          }
          
          // Row is in a different measure - need to look up value in target measure
          const result = getDimensionValueInMeasure(row.id, cond.measureId, colKey);
          
          // If dimension not found in target measure, hide this row
          // (can't pass a filter if it doesn't exist in the filtered measure)
          if (!result.found) {
            return false;
          }
          
          // If found but value is NaN, treat as "not applicable" and pass filter
          if (isNaN(result.value)) return true;
          
          // Evaluate the numeric condition using the value from the target measure
          return evaluateNumeric(result.value, cond.operator, cond.value);
        });

        if (!passesAll) return false;
        continue;
      }

      // Backward-compatible single-condition numeric filter.
      if (!filter.operator || typeof filter.value !== 'string') continue;
      const numVal = colKey.includes('-')
        ? getCellNumericValueForColumn(row, colKey)
        : (typeof row.values?.[colKey as keyof typeof row.values] === 'number' ? row.values![colKey as keyof typeof row.values] : parseFloat(String(row.values?.[colKey as keyof typeof row.values] ?? '')));
      const passes = evaluateNumeric(numVal, filter.operator, filter.value);
      if (!passes) return false;
    }
    return true;
  }, [columnFilters, approvalRequests, globalSortConfig, rollupValueSourceData, gridData, data, parentTotalsRollupMode]);

  // Recursively apply column filters: non-matching branches are omitted from the tree.
  // Parent row values on gridData remain full-hierarchy rollups (matching + non-matching).
  const filterRowTree = useCallback((row: GridRowType): GridRowType | null => {
    if (columnFilters.size === 0) return row;

    const flatTopBottomDim = getGlobalTopBottomNFlatViewTargetDimension(
      columnFilters,
      globalSortConfig?.preserveHierarchy ?? true,
    );
    const isMeasureExplicitlyFiltered = (measureId: string): boolean => {
      for (const [, filter] of columnFilters) {
        if (!filter.conditions || filter.conditions.length === 0) continue;
        const hasFilterForMeasure = filter.conditions.some(c => c.value?.trim() !== '' && c.measureId === measureId);
        if (hasFilterForMeasure) return true;
      }
      return false;
    };

    if (row.type === 'measure' && flatTopBottomDim) {
      const { children, hadHiddenTargets } = mergeGlobalTopBottomNMeasureChildren(
        row,
        flatTopBottomDim,
        rowPassesFilters,
      );
      // Only show badge if this measure is explicitly being filtered
      const shouldShowBadge = hadHiddenTargets && isMeasureExplicitlyFiltered(row.id);
      return {
        ...row,
        children,
        ...(shouldShowBadge ? { descendantsExcludedByColumnFilter: true } : {}),
      };
    }

    const hasActiveConditionsForDimension = (dimension: 'account' | 'category' | 'product'): boolean => {
      for (const [, filter] of columnFilters) {
        if (!filter.conditions || filter.conditions.length === 0) continue;
        const hasActiveForDimension = filter.conditions.some(c => c.value?.trim() !== '' && c.dimension === dimension);
        if (hasActiveForDimension) return true;
      }
      return false;
    };

    let filteredChildren: GridRowType[] | undefined;
    let hadChildFilteredOut = false;
    if (row.children && row.children.length > 0) {
      const unwrapped = unwrapColumnFilterBucketChildren(row.children);
      const baseChildren = unwrapped ?? row.children;
      const mapped = baseChildren.map(filterRowTree);
      for (const m of mapped) {
        if (m === null) hadChildFilteredOut = true;
      }
      filteredChildren = mapped.filter((r): r is GridRowType => r !== null);
    }
    const selfPasses = rowPassesFilters(row);
    const hasMatchingChild = filteredChildren && filteredChildren.length > 0;

    // Hard-gate constrained hierarchy levels so filters visibly apply.
    // Example: if Account conditions exist, non-matching Account branches are removed
    // even when descendant levels are unconstrained.
    if (row.type === 'account' && hasActiveConditionsForDimension('account') && !selfPasses) return null;
    if (row.type === 'category' && hasActiveConditionsForDimension('category') && !selfPasses) return null;
    if (row.type === 'product' && hasActiveConditionsForDimension('product') && !selfPasses) return null;

    // When a *deeper* dimension is actively filtered (e.g. product), drop ancestor rows
    // that have no surviving descendants — e.g. categories/accounts with no matching
    // products. (Such ancestors otherwise "pass" because the condition is skipped for
    // their dimension.) Only applies when the ancestor's own dimension isn't constrained.
    const descendantDimActive =
      (row.type === 'account' &&
        (hasActiveConditionsForDimension('category') || hasActiveConditionsForDimension('product')) &&
        !hasActiveConditionsForDimension('account')) ||
      (row.type === 'category' &&
        hasActiveConditionsForDimension('product') &&
        !hasActiveConditionsForDimension('category'));
    if (descendantDimActive && !hasMatchingChild) return null;

    if (!selfPasses && !hasMatchingChild) return null;
    const next: GridRowType = { ...row, children: filteredChildren };
    // Only show orange dot on measures that are explicitly filtered
    if (hadChildFilteredOut) {
      if (row.type === 'measure') {
        // Only set badge if this measure is explicitly being filtered
        if (isMeasureExplicitlyFiltered(row.id)) {
          next.descendantsExcludedByColumnFilter = true;
        }
      } else {
        // For non-measure rows (accounts, categories, products), always set badge
        next.descendantsExcludedByColumnFilter = true;
      }
    }
    return next;
  }, [columnFilters, rowPassesFilters, globalSortConfig]);
  
  // Sync gridData with data prop changes (for mass updates from parent)
  // Use a ref to track if we're updating from internal changes vs external
  const isInternalUpdateRef = useRef(false);
  const prevDataRef = useRef(data);
  const isMassUpdateRef = useRef(false);
  
  useEffect(() => {
    // Only sync if data actually changed and it wasn't from an internal update
    // Skip sync during mass updates - let the grid's handleCellChange handle it
    if (prevDataRef.current !== data && !isInternalUpdateRef.current && !isMassUpdateRef.current) {
      prevDataRef.current = data;
      setGridData(data);
    }
    isInternalUpdateRef.current = false;
    isMassUpdateRef.current = false;
  }, [data]);
  // Track preserved values for year/quarter edits at account/category levels
  const preservedValuesRef = useRef<Map<string, { monthKey: keyof GridRowType['values']; value: number }>>(new Map());
  // Track focused cell for keyboard navigation
  const [focusedCell, setFocusedCell] = useState<{ rowId: string; monthKey: keyof GridRowType['values'] } | null>(
    initialFocusedCell ? { rowId: initialFocusedCell.rowId, monthKey: initialFocusedCell.monthKey as keyof GridRowType['values'] } : null
  );
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  // Track editing cell for note popover - use a ref to track active input
  const [editingCell, setEditingCell] = useState<{ rowId: string; monthKey: keyof GridRowType['values'] } | null>(null);
  const editingInputRef = useRef<HTMLInputElement | null>(null);
  
  // Track column widths per column for auto-expansion
  const [columnWidths, setColumnWidths] = useState<Map<string, number>>(new Map());
  const columnWidthsRef = useRef<Map<string, number>>(new Map());
  const previousColumnWidthRef = useRef<number>(columnWidth);
  const isSliderAdjustingRef = useRef<boolean>(false);
  const previousExpandedRowsRef = useRef<Set<string>>(new Set());
  
  // Reset auto-expanded widths when user manually changes column width via slider
  useEffect(() => {
    if (previousColumnWidthRef.current !== columnWidth) {
      // User changed slider - reset auto-expanded widths and mark as adjusting
      isSliderAdjustingRef.current = true;
      columnWidthsRef.current.clear();
      setColumnWidths(new Map());
      previousColumnWidthRef.current = columnWidth;
      
      // Clear the flag after a delay to allow slider to settle
      setTimeout(() => {
        isSliderAdjustingRef.current = false;
      }, 300);
    }
  }, [columnWidth]);
  
  // Listen for input focus events globally
  useEffect(() => {
    const handleInputFocus = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement;
      if (target && target.classList.contains('cell-input')) {
        const cellKey = target.getAttribute('data-cell-key');
        if (cellKey) {
          const [rowId, monthKey] = cellKey.split('-');
          editingInputRef.current = target;
          setEditingCell({ rowId, monthKey: monthKey as keyof GridRowType['values'] });
        }
      }
    };
    
    const handleInputBlur = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement;
      if (target && target.classList.contains('cell-input')) {
        // Delay clearing to allow save to complete
        setTimeout(() => {
          if (document.activeElement !== target) {
            editingInputRef.current = null;
            setEditingCell(null);
          }
        }, 100);
      }
    };
    
    document.addEventListener('focusin', handleInputFocus);
    document.addEventListener('focusout', handleInputBlur);
    
    return () => {
      document.removeEventListener('focusin', handleInputFocus);
      document.removeEventListener('focusout', handleInputBlur);
    };
  }, []);

  // Restore focus when initialFocusedCell changes (layout switch)
  useEffect(() => {
    if (initialFocusedCell) {
      const cellKey = `${initialFocusedCell.rowId}-${initialFocusedCell.monthKey}`;
      setTimeout(() => {
        const cellElement = cellRefs.current.get(cellKey);
        if (cellElement) {
          cellElement.focus();
          setFocusedCell({ 
            rowId: initialFocusedCell.rowId, 
            monthKey: initialFocusedCell.monthKey as keyof GridRowType['values'] 
          });
        }
      }, 100);
    }
  }, [initialFocusedCell]);

  // Notify parent when focus changes
  const handleFocusChange = useCallback((focus: { rowId: string; monthKey: keyof GridRowType['values'] } | null) => {
    setFocusedCell(focus);
    if (onFocusedCellChange) {
      onFocusedCellChange(focus ? { rowId: focus.rowId, monthKey: focus.monthKey as string } : null);
    }
  }, [onFocusedCellChange]);
  
  // Memoized callback for cell edit state changes to prevent re-renders
  const handleCellEditStateChange = useCallback((isEditing: boolean, rowId: string, monthKey: string) => {
    if (isEditing) {
      setEditingCell({ rowId, monthKey: monthKey as keyof GridRowType['values'] });
      // Notify parent of editing cell key
      if (onEditingCellChange) {
        const cellKey = `${rowId}-${monthKey}`;
        onEditingCellChange(cellKey);
      }
    } else {
      setEditingCell(null);
      // Notify parent that editing stopped
      if (onEditingCellChange) {
        onEditingCellChange(null);
      }
    }
  }, [onEditingCellChange]);
  
  // Track edited cells and their original values to show delta (restore from planning session when reopening grid)
  const [editedCells, setEditedCells] = useState<Map<string, number>>(() =>
    initialCellMapsSnapshot ? new Map(initialCellMapsSnapshot.editedCells) : new Map()
  );
  const [impactedCells, setImpactedCells] = useState<Map<string, number>>(() =>
    initialCellMapsSnapshot ? new Map(initialCellMapsSnapshot.impactedCells) : new Map()
  );
  const [savedEditedCells, setSavedEditedCells] = useState<Map<string, string>>(() =>
    initialCellMapsSnapshot ? new Map(initialCellMapsSnapshot.savedEditedCells) : new Map()
  );
  const [savedImpactedCells, setSavedImpactedCells] = useState<Set<string>>(() =>
    initialCellMapsSnapshot ? new Set(initialCellMapsSnapshot.savedImpactedCells) : new Set()
  );
  const [unsavedNotes, setUnsavedNotes] = useState<Map<string, string>>(() =>
    initialCellMapsSnapshot ? new Map(initialCellMapsSnapshot.unsavedNotes) : new Map()
  );

  // Merge arrow indicators from cellEditHistory (do not replace — preserves session-restored savedEditedCells)
  useEffect(() => {
    if (cellEditHistory.length === 0) return;
    setSavedEditedCells(prev => {
      const next = new Map(prev);
      cellEditHistory.forEach(entry => {
        if (entry.oldValue !== undefined && entry.newValue !== undefined && entry.oldValue !== entry.newValue) {
          const isIncrement = entry.newValue > entry.oldValue;
          const iconColor = isIncrement ? 'var(--slds-g-color-warning-2)' : 'var(--color-accent-blue)';
          next.set(entry.cellKey, iconColor);
        }
      });
      return next;
    });
  }, [cellEditHistory]);

  // Sync maps to parent on every change (parent only updates a ref — safe without debounce so unmount always has latest arrows/notes state)
  useEffect(() => {
    if (!onCellMapsSnapshotChange) return;
    onCellMapsSnapshotChange({
      editedCells: Array.from(editedCells.entries()),
      savedEditedCells: Array.from(savedEditedCells.entries()),
      impactedCells: Array.from(impactedCells.entries()),
      unsavedNotes: Array.from(unsavedNotes.entries()),
      savedImpactedCells: Array.from(savedImpactedCells),
    });
  }, [
    editedCells,
    savedEditedCells,
    impactedCells,
    unsavedNotes,
    savedImpactedCells,
    onCellMapsSnapshotChange,
  ]);
  // Operation-based undo/redo history
  interface UndoRedoOperation {
    id: string;
    cellKey: string;
    rowId: string;
    monthKey: keyof GridRowType['values'];
    operationType: 'value' | 'note' | 'both'; // What was changed
    oldValue?: number; // Value before this operation
    newValue?: number; // Value after this operation
    oldNote?: string; // Note before this operation
    newNote?: string; // Note after this operation
    timestamp: Date;
    // Store the state of impacted cells before this operation
    impactedCellsBefore: Map<string, number>;
    // Store the state of edited cells before this operation
    editedCellsBefore: Map<string, number>;
  }
  
  const [undoRedoHistory, setUndoRedoHistory] = useState<UndoRedoOperation[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const historyIndexRef = useRef<number>(-1); // Keep ref in sync for use in callbacks
  const [showOnlyImpactedKPI, setShowOnlyImpactedKPI] = useState<boolean>(false);
  const originalDataRef = useRef<MeasureData[]>(JSON.parse(JSON.stringify(data)));
  
  // Keep ref in sync with state
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  // Calculate measure values from children and aggregate time periods
  // Excludes locked cells from sums and aggregations
  const calculateMeasureValues = useCallback((
    dataToCalculate: MeasureData[],
    skipTimeAggregationForRows?: Set<string>,
    lockedCellsSet?: Set<string>,
    rollupMode: ParentTotalsRollupMode = parentTotalsRollupMode,
    rollupPropagateIntoNoMatch: boolean = propagateIntoNoMatchRows,
  ): MeasureData[] => {
    const updated = JSON.parse(JSON.stringify(dataToCalculate));
    const skipSet = skipTimeAggregationForRows || new Set<string>();
    const lockedSet = lockedCellsSet || new Set<string>();
    
    // Helper to check if a cell is locked
    const isCellLocked = (rowId: string, monthKey: keyof GridRowType['values']) => {
      return lockedSet.has(`${rowId}-${monthKey}`);
    };
    
    // Helper to calculate time aggregations for a row
    // Locked cells contribute their current value to aggregations, but locked aggregations themselves are not recalculated
    const calculateTimeAggregations = (row: GridRowType | MeasureData) => {
      // Only recalculate if this row is not in the skip set
      if (!skipSet.has(row.id)) {
        const rowId = row.id;
        // Calculate quarters from months - include locked months (they contribute their current value)
        // But don't recalculate if the quarter itself is locked
        if (!isCellLocked(rowId, 'q1')) {
          row.values.q1 = row.values.jan2026 + row.values.feb2026 + row.values.mar2026;
        }
        if (!isCellLocked(rowId, 'q2')) {
          row.values.q2 = row.values.apr2026 + row.values.may2026 + row.values.jun2026;
        }
        if (!isCellLocked(rowId, 'q3')) {
          row.values.q3 = row.values.jul2026 + row.values.aug2026 + row.values.sep2026;
        }
        if (!isCellLocked(rowId, 'q4')) {
          row.values.q4 = row.values.oct2026 + row.values.nov2026 + row.values.dec2026;
        }
        
        // Calculate half-years from quarters (H1 = Q1+Q2, H2 = Q3+Q4).
        if (!isCellLocked(rowId, 'h1')) {
          row.values.h1 = row.values.q1 + row.values.q2;
        }
        if (!isCellLocked(rowId, 'h2')) {
          row.values.h2 = row.values.q3 + row.values.q4;
        }
        // Calculate year from quarters - include locked quarters (they contribute their current value)
        // But don't recalculate if the year itself is locked
        if (!isCellLocked(rowId, 'year')) {
          row.values.year = row.values.q1 + row.values.q2 + row.values.q3 + row.values.q4;
        }
        // Derive weekly columns from months (once); preserves any edited week values.
        deriveWeekValues(row.values as Record<string, number>, calendarStartMonth);
      }
    };
    
    // Recursively calculate aggregations for all rows
    const calculateRowAggregations = (row: GridRowType | MeasureData) => {
      if (row.children && row.children.length > 0) {
        // First calculate children aggregations
        row.children.forEach(calculateRowAggregations);
        
        // For parent rows, sum children values for MONTHS only
        // Year and quarters are calculated from months, not summed from children
        const monthKeys: (keyof GridRowType['values'])[] = [
          'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
          'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
        ];
        
        // Sum months from children ONLY if this row is not in the skip set
        // (If year/quarter was edited, we've already distributed to months, so don't recalculate)
        // Locked children contribute their current value to parent sums, but don't receive propagation
        if (!skipSet.has(row.id)) {
          const isPassFailBucket =
            row.type === 'filterSummary' &&
            (row.filterSummaryRole === 'filterBucketMatch' ||
              row.filterSummaryRole === 'filterBucketNoMatch') &&
            row.children?.length;

          if (isPassFailBucket) {
            // Deepest-leaf sum matches injectPassFailBucketRows / refreshPassFailBucketAggregates
            const rowId = row.id;
            let anyMonthLocked = false;
            for (const mk of monthKeys) {
              if (isCellLocked(rowId, mk)) {
                anyMonthLocked = true;
                break;
              }
            }
            if (!anyMonthLocked) {
              row.values = sumForest(row.children);
            } else {
              for (const monthKey of monthKeys) {
                if (isCellLocked(rowId, monthKey)) continue;
                const rollupKids = rollupChildrenForParentRow(row, rollupMode, rollupPropagateIntoNoMatch);
                row.values[monthKey] = rollupKids.reduce(
                  (sum: number, child: GridRowType) => sum + child.values[monthKey],
                  0,
                );
              }
            }
          } else {
            for (const monthKey of monthKeys) {
              const rowId = row.id;
              if (isCellLocked(rowId, monthKey)) {
                continue;
              }
              const rollupKids = rollupChildrenForParentRow(row, rollupMode, rollupPropagateIntoNoMatch);
              row.values[monthKey] = rollupKids.reduce(
                (sum: number, child: GridRowType) => {
                  return sum + child.values[monthKey];
                },
                0
              );
            }
          }
          // After summing months, calculate quarters and year from months
          calculateTimeAggregations(row);
        }
        // If row is in skip set, don't recalculate anything - preserve the edited values
      } else {
        // Leaf node - calculate time aggregations from months (unless skipped)
        calculateTimeAggregations(row);
      }
    };
    
    // Calculate for all measures
    for (const measure of updated) {
      // If measure is in skip set, don't recalculate its time aggregations
      // But still need to calculate children (they might not be skipped)
      if (!skipSet.has(measure.id)) {
        calculateRowAggregations(measure);
      } else {
        // Measure is skipped - still calculate children, but don't sum months or recalculate time aggregations
        if (measure.children && measure.children.length > 0) {
          measure.children.forEach(calculateRowAggregations);
          // Don't sum months from children or recalculate time aggregations - preserve the edited values
        }
      }
    }
    
    return updated;
  }, [lockedCells, parentTotalsRollupMode, propagateIntoNoMatchRows]);

  // Update local state when prop changes and recalculate measure values
  React.useEffect(() => {
    // Build skip set from preserved values (only the currently edited cell, if any)
    const skipSet = new Set<string>();
    preservedValuesRef.current.forEach((_, rowId) => {
      skipSet.add(rowId);
    });

    const calculatedData = calculateMeasureValues(
      data,
      skipSet,
      lockedCells,
      parentTotalsRollupMode,
      propagateIntoNoMatchRows,
    );

    // After recalculation, restore preserved values ONLY for the currently edited cell.
    // This ensures that when data prop changes (e.g., from external source),
    // the currently edited cell's value is preserved.
    if (preservedValuesRef.current.size > 0) {
      preservedValuesRef.current.forEach((preserved, rowId) => {
        const measure = calculatedData.find(m => m.id === rowId);
        if (measure) {
          measure.values[preserved.monthKey] = preserved.value;
        } else {
          const updateRowValue = (rows: GridRowType[]) => {
            for (const row of rows) {
              if (row.id === rowId) {
                row.values[preserved.monthKey] = preserved.value;
                return true;
              }
              if (row.children && updateRowValue(row.children)) {
                return true;
              }
            }
            return false;
          };

          for (const measureData of calculatedData) {
            if (measureData.children && updateRowValue(measureData.children)) {
              break;
            }
          }
        }
      });
    }

    setGridData(calculatedData);
  }, [data, calculateMeasureValues, lockedCells, parentTotalsRollupMode, propagateIntoNoMatchRows]);

  // Ensure edited measures are expanded at the measure row only (no auto-expand of nested children)
  // Runs on gridData/industry/cellEditHistory changes, not on every editedCells change
  useEffect(() => {
    // Only run this on initial mount or when gridData/industry changes significantly
    // Don't reset expansion state when editedCells changes - let the handleCellChange expansion logic handle it
    const expandedRowIds = new Set<string>();
    
    // Helper function to extract measure ID from rowId
    const getMeasureIdFromRowId = (rowId: string): string | null => {
      // Check if rowId is directly a measure ID
      const directMeasure = gridData.find(m => m.id === rowId);
      if (directMeasure) {
        return directMeasure.id;
      }
      
      // Extract measure ID from rowId pattern: account-measure-xxx, category-xxx-measure-xxx, product-xxx-measure-xxx
      const parts = rowId.split('-');
      const measureIndex = parts.findIndex(part => part === 'measure');
      if (measureIndex !== -1 && measureIndex < parts.length - 1) {
        return parts.slice(measureIndex, measureIndex + 2).join('-');
      }
      
      return null;
    };
    
    // Find all measures that have edits from cellEditHistory (saved edits) and editedCells (unsaved edits)
    const editedMeasureIds = new Set<string>();
    
    // Check saved edits from cellEditHistory
    if (cellEditHistory && cellEditHistory.length > 0) {
      cellEditHistory.forEach(entry => {
        const measureId = getMeasureIdFromRowId(entry.rowId);
        if (measureId) {
          editedMeasureIds.add(measureId);
        }
      });
    }
    
    // Check unsaved edits from editedCells
    if (editedCells && editedCells.size > 0) {
      editedCells.forEach((_, cellKey) => {
        // cellKey format: `${rowId}-${monthKey}`
        // Extract rowId by removing the last part (monthKey)
        const rowId = cellKey.split('-').slice(0, -1).join('-');
        const measureId = getMeasureIdFromRowId(rowId);
        if (measureId) {
          editedMeasureIds.add(measureId);
        }
      });
    }
    
    // Expand edited measures only (not nested children — avoids opening the full subtree after edits)
    if (editedMeasureIds.size > 0) {
      editedMeasureIds.forEach(measureId => {
        const measure = gridData.find(m => m.id === measureId);
        if (measure) {
          expandedRowIds.add(measure.id);
        }
      });
    }
    
    // Only set expanded rows if we have edited measures, otherwise preserve current state
    // This prevents collapsing measures when editedCells changes
    if (editedMeasureIds.size > 0) {
      setExpandedRows(prev => {
        // Merge with existing expanded rows instead of replacing
        const newSet = new Set(prev);
        expandedRowIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  }, [gridData, industry, cellEditHistory]); // Removed editedCells from dependencies

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Let the data owner lazily grow deep hierarchies one level ahead of what's expanded.
  useEffect(() => {
    onExpandedRowsChange?.(expandedRows);
  }, [expandedRows, onExpandedRowsChange]);

  // Expand all rows that have children
  const handleClearAllFilters = useCallback(() => {
    setColumnFilters(new Map());
  }, []);

  const handleExpandAll = useCallback(() => {
    const allExpandableIds = new Set<string>();
    
    // Recursive function to collect all row IDs that have children
    const collectExpandableIds = (rows: GridRowType[]) => {
      for (const row of rows) {
        if (row.children && row.children.length > 0) {
          allExpandableIds.add(row.id);
          collectExpandableIds(row.children);
        }
      }
    };
    
    // Collect from all measures
    for (const measure of gridData) {
      if (measure.children && measure.children.length > 0) {
        allExpandableIds.add(measure.id);
        collectExpandableIds(measure.children);
      }
    }
    
    setExpandedRows(allExpandableIds);
  }, [gridData]);

  // Expand all rows within a specific measure
  const handleExpandMeasure = useCallback((measureId: string) => {
    const measure = gridData.find(m => m.id === measureId);
    if (!measure) return;
    
    const expandedIds = new Set<string>();
    expandedIds.add(measureId);
    
    // Recursive function to collect all row IDs within this measure
    const collectAllIds = (rows: GridRowType[]) => {
      for (const row of rows) {
        expandedIds.add(row.id);
        if (row.children && row.children.length > 0) {
          collectAllIds(row.children);
        }
      }
    };
    
    if (measure.children && measure.children.length > 0) {
      collectAllIds(measure.children);
    }
    
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      expandedIds.forEach(id => newSet.add(id));
      return newSet;
    });
  }, [gridData]);

  // Collapse all rows within a specific measure
  const handleCollapseMeasure = useCallback((measureId: string) => {
    const measure = gridData.find(m => m.id === measureId);
    if (!measure) return;
    
    const collapsedIds = new Set<string>();
    
    // Recursive function to collect all row IDs within this measure
    const collectAllIds = (rows: GridRowType[]) => {
      for (const row of rows) {
        collapsedIds.add(row.id);
        if (row.children && row.children.length > 0) {
          collectAllIds(row.children);
        }
      }
    };
    
    if (measure.children && measure.children.length > 0) {
      collectAllIds(measure.children);
    }
    
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      // Remove measure and all its children, but keep other measures expanded
      newSet.delete(measureId);
      collapsedIds.forEach(id => newSet.delete(id));
      return newSet;
    });
  }, [gridData]);

  // Collapse all rows
  const handleCollapseAll = useCallback(() => {
    setExpandedRows(new Set());
  }, []);

  // Expand only the top-level measure rows (their direct children — accounts — become
  // visible but stay collapsed). Used to present a tidy "filtered" view.
  const handleExpandMeasuresOnly = useCallback(() => {
    const ids = new Set<string>();
    for (const measure of gridData) {
      if (measure.children && measure.children.length > 0) ids.add(measure.id);
    }
    setExpandedRows(ids);
  }, [gridData]);

  // Expand measures and accounts (so categories are visible) but leave categories
  // collapsed — accounts → categories only, no products. Used for the "categories behind"
  // focus so the referenced categories read clearly without drilling into SKUs.
  const handleExpandToCategories = useCallback(() => {
    const ids = new Set<string>();
    const walkAccounts = (rows: GridRowType[]) => {
      for (const row of rows) {
        if (row.type === 'account' && row.children && row.children.length > 0) {
          ids.add(row.id);
        }
        if (row.children && row.children.length > 0) walkAccounts(row.children);
      }
    };
    for (const measure of gridData) {
      if (measure.children && measure.children.length > 0) {
        ids.add(measure.id);
        walkAccounts(measure.children);
      }
    }
    setExpandedRows(ids);
  }, [gridData]);

  // Handle toggle for "Show Only Impacted KPI" - collapse all when checked, expand latest edited measure when unchecked
  const handleToggleShowOnlyImpactedKPI = useCallback((checked: boolean) => {
    setShowOnlyImpactedKPI(checked);
    if (checked) {
      // Collapse all rows when showing only impacted measures
      setExpandedRows(new Set());
      // Close side panels when checking "Show Only Impacted Measures"
      if (onToggleShowOnlyImpactedKPIChange) {
        onToggleShowOnlyImpactedKPIChange(checked);
      }
    } else {
      // When unchecked, find and expand the latest edited measure
      // Helper function to extract measure ID from rowId
      const getMeasureIdFromRowId = (rowId: string): string | null => {
        // Check if rowId is directly a measure ID
        const directMeasure = gridData.find(m => m.id === rowId);
        if (directMeasure) {
          return directMeasure.id;
        }
        
        // Extract measure ID from rowId pattern: account-measure-xxx, category-xxx-measure-xxx, product-xxx-measure-xxx
        const parts = rowId.split('-');
        const measureIndex = parts.findIndex(part => part === 'measure');
        if (measureIndex !== -1 && measureIndex < parts.length - 1) {
          const measureId = `measure-${parts.slice(measureIndex + 1).join('-')}`;
          if (gridData.find(m => m.id === measureId)) {
            return measureId;
          }
        }
        
        // Fallback: search through all measures to find which one contains this row
        for (const m of gridData) {
          const row = findRowById(rowId, [m]);
          if (row) {
            return m.id;
          }
        }
        
        return null;
      };
      
      // Find the latest edited measure from editedCells
      let latestMeasureId: string | null = null;
      
      // First, try to find from cellEditHistory (has timestamps)
      if (cellEditHistory && cellEditHistory.length > 0) {
        // Sort by timestamp (most recent first)
        const sortedHistory = [...cellEditHistory].sort((a, b) => 
          b.timestamp.getTime() - a.timestamp.getTime()
        );
        
        // Find the most recent edited cell that's still in editedCells
        for (const entry of sortedHistory) {
          const cellKey = entry.cellKey; // Format: `${rowId}-${monthKey}`
          const rowId = entry.rowId;
          
          // Check if this cell is still in editedCells (unsaved)
          if (editedCells.has(cellKey)) {
            const measureId = getMeasureIdFromRowId(rowId);
            if (measureId) {
              latestMeasureId = measureId;
              break;
            }
          }
        }
      }
      
      // If no measure found from history, use the first edited cell
      if (!latestMeasureId && editedCells.size > 0) {
        const firstEditedCellKey = Array.from(editedCells.keys())[0];
        const rowId = firstEditedCellKey.split('-').slice(0, -1).join('-'); // Remove monthKey
        latestMeasureId = getMeasureIdFromRowId(rowId);
      }
      
      // Expand the latest edited measure row only (keep nested rows collapsed)
      if (latestMeasureId) {
        setExpandedRows(prev => {
          const newSet = new Set(prev);
          newSet.add(latestMeasureId!);
          return newSet;
        });
      }
    }
  }, [gridData, editedCells, cellEditHistory]);
  
  // Register handlers with parent component (moved after getAllVisibleRows and getVisibleTimeKeys are defined)


  const formatValue = (value: number, isQuantity?: boolean, measureName?: string): string => {
    // Use comma-separated format with exactly 3 decimal places — no K/M/B units.
    // This avoids mixed units within a column (e.g., some rows showing K, others M)
    // and keeps all cells consistently formatted for easy decimal-point alignment.
    if (value === undefined || value === null || Number.isNaN(value)) {
      value = 0;
    }
    const formatted = value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

    // Add $ symbol for revenue/currency measures (but not for quantities or percentages)
    if (!isQuantity && measureName) {
      const nameLower = measureName.toLowerCase();
      const isRevenue = nameLower.includes('revenue') ||
                        (nameLower.includes('spend') && !nameLower.includes('%')) ||
                        nameLower === 'revenue';
      const isPercentage = nameLower.includes('%') || nameLower.includes('percent');
      const isROI = nameLower.includes('roi');

      if (isRevenue && !isPercentage && !isROI) {
        return `$${formatted}`;
      }
    }

    return formatted;
  };

  // Helper function to check if a month key falls within the date range
  const isMonthInRange = useCallback((monthKey: string, start: string, end: string): boolean => {
    if (!start && !end) return true;
    
    // Map month keys to month numbers (1-12)
    const monthKeyToNumber: { [key: string]: number } = {
      'jan2026': 1, 'feb2026': 2, 'mar2026': 3, 'apr2026': 4,
      'may2026': 5, 'jun2026': 6, 'jul2026': 7, 'aug2026': 8,
      'sep2026': 9, 'oct2026': 10, 'nov2026': 11, 'dec2026': 12
    };
    
    const monthNum = monthKeyToNumber[monthKey];
    if (!monthNum) return true; // If not a month key, include it
    
    // Parse start and end dates to get months
    let startMonth = 1;
    let endMonth = 12;
    
    if (start) {
      const startDate = new Date(start);
      startMonth = startDate.getMonth() + 1; // getMonth() is 0-indexed
    }
    
    if (end) {
      const endDate = new Date(end);
      endMonth = endDate.getMonth() + 1;
    }
    
    return monthNum >= startMonth && monthNum <= endMonth;
  }, []);

  // Helper to check if a quarter has any visible months
  const isQuarterInRange = useCallback((quarterKey: string, start: string, end: string): boolean => {
    if (!start && !end) return true;
    
    const quarterMonths: { [key: string]: string[] } = {
      'q1': ['jan2026', 'feb2026', 'mar2026'],
      'q2': ['apr2026', 'may2026', 'jun2026'],
      'q3': ['jul2026', 'aug2026', 'sep2026'],
      'q4': ['oct2026', 'nov2026', 'dec2026']
    };
    
    const months = quarterMonths[quarterKey];
    if (!months) return true;
    
    // Quarter is visible if any of its months are in range
    return months.some(month => isMonthInRange(month, start, end));
  }, [isMonthInRange]);

  // Get visible time headers with labels (filtered by granularity and search) - memoized
  const visibleTimeHeaders = useMemo(() => {
    const monthKeys: { key: keyof GridRowType['values']; granularity: string; label: string; shortLabel?: string }[] = [
      { key: 'jan2026', granularity: 'month', label: 'Jan' },
      { key: 'feb2026', granularity: 'month', label: 'Feb' },
      { key: 'mar2026', granularity: 'month', label: 'Mar' },
      { key: 'apr2026', granularity: 'month', label: 'Apr' },
      { key: 'may2026', granularity: 'month', label: 'May' },
      { key: 'jun2026', granularity: 'month', label: 'Jun' },
      { key: 'jul2026', granularity: 'month', label: 'Jul' },
      { key: 'aug2026', granularity: 'month', label: 'Aug' },
      { key: 'sep2026', granularity: 'month', label: 'Sep' },
      { key: 'oct2026', granularity: 'month', label: 'Oct' },
      { key: 'nov2026', granularity: 'month', label: 'Nov' },
      { key: 'dec2026', granularity: 'month', label: 'Dec' },
    ];
    // Rotate months so the column order starts at the calendar's fiscal start month.
    const startMonth = ((calendarStartMonth % 12) + 12) % 12;
    const orderedMonths = startMonth > 0
      ? [...monthKeys.slice(startMonth), ...monthKeys.slice(0, startMonth)]
      : monthKeys;
    const allTimeKeys: { key: keyof GridRowType['values']; granularity: string; label: string; shortLabel?: string }[] = [
      { key: 'year', granularity: 'year', label: 'FY26' },
      { key: 'h1', granularity: 'half', label: 'H1' },
      { key: 'h2', granularity: 'half', label: 'H2' },
      { key: 'q1', granularity: 'quarter', label: 'Q1' },
      { key: 'q2', granularity: 'quarter', label: 'Q2' },
      { key: 'q3', granularity: 'quarter', label: 'Q3' },
      { key: 'q4', granularity: 'quarter', label: 'Q4' },
      ...orderedMonths,
      ...buildWeekHeaders(calendarStartMonth, calendarStartYear),
    ];

    // Filter by granularity first
    let filteredKeys = allTimeKeys;
    if (selectedTimeGranularities && selectedTimeGranularities.size > 0) {
      filteredKeys = allTimeKeys.filter(tk => selectedTimeGranularities.has(tk.granularity));
    }

    // Apply date range filter if showAllPeriods is false
    if (!showAllPeriods && (startPeriod || endPeriod)) {
      // Parse YYYY-MM-DD as local calendar dates so boundary weeks are inclusive.
      const parseLocal = (s: string): Date | null => {
        if (!s) return null;
        const p = s.split('-');
        if (p.length !== 3) return null;
        return new Date(+p[0], +p[1] - 1, +p[2]);
      };
      const rangeStart = parseLocal(startPeriod);
      const rangeEnd = parseLocal(endPeriod);
      filteredKeys = filteredKeys.filter(tk => {
        if (tk.granularity === 'month') {
          return isMonthInRange(tk.key as string, startPeriod, endPeriod);
        } else if (tk.granularity === 'quarter') {
          return isQuarterInRange(tk.key as string, startPeriod, endPeriod);
        } else if (tk.granularity === 'week') {
          const m = /^week(\d+)_/.exec(tk.key as string);
          if (!m) return true;
          return weekOverlapsRange(parseInt(m[1], 10), rangeStart, rangeEnd, calendarStartMonth, calendarStartYear);
        } else if (tk.granularity === 'year' || tk.granularity === 'half') {
          // Show year / half-year aggregates if any months are visible
          return true;
        }
        return true;
      });
    }

    // Scope columns to the active plan's time frame (e.g. an "H2 FY25" plan shows
    // only H2 and its quarters/months — not the whole year).
    const planScope = getPlanPeriodScope(getConfigTimeFrame(industry)?.planningPeriod);
    if (planScope.scoped) {
      filteredKeys = filteredKeys.filter(tk => {
        if (tk.granularity === 'week') {
          if (!planScope.weekRange) return true;
          const m = /^week(\d+)_/.exec(tk.key as string);
          if (!m) return true;
          const n = parseInt(m[1], 10);
          return n >= planScope.weekRange[0] && n <= planScope.weekRange[1];
        }
        return planScope.keys.has(tk.key as string);
      });
    }

    // Apply search filter if search term exists
    if (searchTerm && searchTerm.trim()) {
      const searchTerms = extractSearchTerms(searchTerm);
      if (searchTerms.length > 0) {
        // Get available measures for term classification
        const availableMeasures = gridData.map(m => ({ id: m.id, name: m.name }));
        const { timeTerms, otherTerms } = separateSearchTerms(searchTerms, availableMeasures);
        console.log('[GRID] getVisibleTimeHeaders - Search terms:', { searchTerm, searchTerms, timeTerms, otherTerms });
        if (timeTerms.length > 0) {
          // Filter columns based on time period search
          const matchingKeys = getMatchingTimePeriodKeys(timeTerms);
          console.log('[GRID] getVisibleTimeHeaders - Matching time period keys:', Array.from(matchingKeys));
          // Only show columns that match or are parents/children of matches
          filteredKeys = filteredKeys.filter(tk => matchingKeys.has(tk.key));
          console.log('[GRID] getVisibleTimeHeaders - Filtered keys after search:', filteredKeys.map(tk => tk.key));
        }
        // If there are other terms (non-time), don't filter columns - show all
        // This allows searching for row names without filtering columns
      }
    }

    return filteredKeys.map(tk => ({
      key: tk.key,
      label: tk.label,
      granularity: tk.granularity,
      shortLabel: tk.shortLabel,
    }));
  }, [selectedTimeGranularities, calendarStartMonth, calendarStartYear, searchTerm, showAllPeriods, startPeriod, endPeriod, isMonthInRange, isQuarterInRange, industry]);

  // Track previous visible headers to detect structural changes
  const previousVisibleHeadersRef = useRef<string>('');
  
  // Measure cell content and auto-expand columns when content overflows
  useEffect(() => {
    // Don't auto-expand while user is adjusting slider
    if (isSliderAdjustingRef.current) {
      return;
    }

    // Don't auto-expand while time-period filtering is active.
    // In a constrained layout (fewer columns), table-layout: auto can inflate scrollWidth
    // measurements, causing stale wide widths to persist after filtering is cleared.
    if (!showAllPeriods) {
      return;
    }
    
    // Only run auto-expansion on structural changes (header changes), not on value changes or row expand/collapse
    const currentHeadersKey = visibleTimeHeaders.map(h => h.key).join(',');
    const headersChanged = previousVisibleHeadersRef.current !== currentHeadersKey;
    
    // Update refs
    previousVisibleHeadersRef.current = currentHeadersKey;
    previousExpandedRowsRef.current = expandedRows;
    
    // Skip auto-expansion if only values changed (not structure)
    // Also skip if only expandedRows changed (expand/collapse all buttons) - don't recalculate column widths
    if (!headersChanged) {
      return;
    }
    
    const measureAndExpandColumns = () => {
      const newColumnWidths = new Map<string, number>();
      const padding = 20; // Account for cell padding (left + right)
      const minColumnWidth = columnWidth;
      
      // Measure all visible cells for each column
      visibleTimeHeaders.forEach((header) => {
        let maxWidth = minColumnWidth;
        
        // Check header width
        const headerElement = document.querySelector(`th[data-column-key="${header.key}"]`) as HTMLElement;
        if (headerElement) {
          // Temporarily set width to auto to measure natural width
          const originalWidth = headerElement.style.width;
          headerElement.style.width = 'auto';
          const headerWidth = headerElement.scrollWidth;
          headerElement.style.width = originalWidth;
          maxWidth = Math.max(maxWidth, headerWidth + padding);
        }
        
        // Check all cells in this column
        cellRefs.current.forEach((cellElement, cellKey) => {
          const [_rowId, monthKey] = cellKey.split('-');
          if (monthKey === header.key) {
            // Temporarily set width to auto to measure natural content width
            const originalWidth = cellElement.style.width;
            const originalMinWidth = cellElement.style.minWidth;
            cellElement.style.width = 'auto';
            cellElement.style.minWidth = 'auto';
            
            // Measure the actual content width
            const contentWidth = cellElement.scrollWidth;
            
            // Restore original styles
            cellElement.style.width = originalWidth;
            cellElement.style.minWidth = originalMinWidth;
            
            const requiredWidth = contentWidth + padding;
            maxWidth = Math.max(maxWidth, requiredWidth);
          }
        });
        
        // Set column width - use slider value as base, only expand if content needs more
        // Only set custom width if content requires more than slider value
        if (maxWidth > minColumnWidth) {
          newColumnWidths.set(header.key, Math.ceil(maxWidth) + 12);
        } else {
          // Content fits in slider width - don't override slider value
          // Don't add to map, will use columnWidth as fallback
        }
      });
      
      // Only update if widths changed significantly (avoid infinite loops)
      const currentWidths = columnWidthsRef.current;
      let hasChanges = false;
      
      // Check if any column widths changed
      if (currentWidths.size !== newColumnWidths.size) {
        hasChanges = true;
      } else {
        // Check existing columns
        currentWidths.forEach((width, key) => {
          const newWidth = newColumnWidths.get(key);
          if (newWidth === undefined) {
            // Column no longer needs expansion - remove it
            hasChanges = true;
          } else if (Math.abs(width - newWidth) > 2) {
            // Width changed significantly
            hasChanges = true;
          }
        });
        // Check for new columns that need expansion
        newColumnWidths.forEach((_width, key) => {
          if (!currentWidths.has(key)) {
            hasChanges = true;
          }
        });
      }
      
      if (hasChanges) {
        columnWidthsRef.current = newColumnWidths;
        setColumnWidths(newColumnWidths);
      }
    };
    
    // Measure after a short delay to ensure DOM is updated
    const timeoutId = setTimeout(measureAndExpandColumns, 150);
    
    // Also measure on window resize
    window.addEventListener('resize', measureAndExpandColumns);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', measureAndExpandColumns);
    };
  }, [visibleTimeHeaders, columnWidth, expandedRows, showAllPeriods]);

  // Get visible time keys based on selected granularities and search - use visibleTimeHeaders
  const getVisibleTimeKeys = useCallback((): (keyof GridRowType['values'])[] => {
    return visibleTimeHeaders.map(h => h.key);
  }, [visibleTimeHeaders]);

  // Helper function to deep copy a row and all its children recursively
  const deepCopyRow = useCallback((row: GridRowType): GridRowType => {
    return {
      ...row,
      values: row.values ? { ...row.values } : {},
      children: row.children ? row.children.map(child => deepCopyRow(child)) : undefined
    };
  }, []);

  // Recompute weekly columns from each row's (already rolled-up) monthly values, in place,
  // so rendered cells always carry consistent, non-zero week values regardless of which
  // copy/filter step the row passed through. Operates on fresh per-render copies.
  const ensureWeeksDeep = useCallback((row: GridRowType): GridRowType => {
    if (row.values) {
      const v = row.values as Record<string, number>;
      for (let n = 1; n <= 52; n++) delete v[`week${n}_2026`];
      deriveWeekValues(v, calendarStartMonth);
    }
    if (row.children) row.children.forEach(ensureWeeksDeep);
    return row;
  }, [calendarStartMonth]);

  // Filter rows by selected dimension types
  // If a parent is deselected but child is selected, show child directly under grandparent
  const filterRowsByType = (
    row: GridRowType,
    selectedTypes: Set<string>
  ): GridRowType | GridRowType[] | null => {
    // Always show measure rows (they are not dimension levels)
    if (row.type === 'measure') {
      // Recursively filter children and flatten promoted children
      if (row.children && row.children.length > 0) {
        const filteredChildren: GridRowType[] = [];
        
        for (const child of row.children) {
          const result = filterRowsByType(child, selectedTypes);
          if (result !== null) {
            if (Array.isArray(result)) {
              // Promoted children (array) - add them directly
              filteredChildren.push(...result);
            } else {
              // Single child - add it
              filteredChildren.push(result);
            }
          }
        }
        
        return {
          ...row,
          values: { ...row.values }, // Deep copy values to avoid stale references
          children: filteredChildren.length > 0 ? filteredChildren : undefined
        };
      }
      return { ...row, values: { ...row.values } }; // Copy to avoid stale references
    }

    // Panel filter summary rows are not dimension levels; keep them and filter descendants.
    if (row.type === 'filterSummary') {
      if (row.children && row.children.length > 0) {
        const filteredChildren: GridRowType[] = [];
        for (const child of row.children) {
          const result = filterRowsByType(child, selectedTypes);
          if (result !== null) {
            if (Array.isArray(result)) {
              filteredChildren.push(...result);
            } else {
              filteredChildren.push(result);
            }
          }
        }
        if (filteredChildren.length === 0) {
          return null;
        }
        return {
          ...row,
          values: { ...row.values },
          children: filteredChildren,
        };
      }
      return { ...row, values: { ...row.values } };
    }
    
    // If row type is selected, show it and filter children normally
    if (selectedTypes.has(row.type)) {
      if (row.children && row.children.length > 0) {
        const filteredChildren: GridRowType[] = [];
        
        for (const child of row.children) {
          const result = filterRowsByType(child, selectedTypes);
          if (result !== null) {
            if (Array.isArray(result)) {
              filteredChildren.push(...result);
            } else {
              filteredChildren.push(result);
            }
          }
        }
        
        return {
          ...row,
          values: { ...row.values }, // Deep copy values to avoid stale references
          children: filteredChildren.length > 0 ? filteredChildren : undefined
        };
      }
      return { ...row, values: { ...row.values } }; // Copy to avoid stale references
    }
    
    // If row type is not selected, check if any descendants match selected types
    // If so, promote those descendants to this level (skip this parent)
    if (row.children && row.children.length > 0) {
      const promotedChildren: GridRowType[] = [];
      
      for (const child of row.children) {
        const result = filterRowsByType(child, selectedTypes);
        if (result !== null) {
          if (Array.isArray(result)) {
            // Already promoted children - add them directly
            promotedChildren.push(...result);
          } else {
            // Single child result
            if (selectedTypes.has(child.type)) {
              // Child matches selected types - add it directly
              promotedChildren.push(result);
            } else if (result.children && result.children.length > 0) {
              // Child doesn't match but has matching descendants - promote those descendants
              promotedChildren.push(...result.children);
            }
          }
        }
      }
      
      // If we have promoted children, return them as an array (to be flattened by parent)
      if (promotedChildren.length > 0) {
        return promotedChildren;
      }
    }
    
    // No matching descendants, filter out this row
    return null;
  };

  // Update a single value in the data structure
  // Copy-on-write single-cell update: clones ONLY the objects along the path to the changed
  // row and shares every untouched subtree/measure by reference. The previous implementation
  // deep-cloned the entire dataset on every call, and this runs inside per-update loops during a
  // single edit — so editing one cell (esp. a year total that fans out to many months/children)
  // triggered O(updates × wholeDataset) JSON clones, causing the grid to visibly jank/snap.
  // This is behavior-identical (never mutates the input) but avoids the allocation storm and
  // keeps unaffected measures' object identity stable so they don't re-render.
  const updateValue = useCallback((
    rowId: string,
    monthKey: keyof GridRowType['values'],
    newValue: number,
    dataToUpdate: MeasureData[]
  ): MeasureData[] => {
    let found = false;

    const copyRow = (row: any): any => {
      if (found) return row; // a given id matches at most one row — stop copying once applied
      if (row.id === rowId) {
        found = true;
        return { ...row, values: { ...row.values, [monthKey]: newValue } };
      }
      const kids = row.children as any[] | undefined;
      if (kids && kids.length > 0) {
        let childChanged = false;
        const newKids = kids.map((c) => {
          const nc = copyRow(c);
          if (nc !== c) childChanged = true;
          return nc;
        });
        if (childChanged) {
          return { ...row, children: newKids };
        }
      }
      return row;
    };

    return dataToUpdate.map((m) => copyRow(m) as MeasureData);
  }, []);

  // Helper function to recalculate time aggregations for a row
  const recalculateTimeAggregations = useCallback((
    rowId: string,
    data: MeasureData[]
  ): { rowId: string; monthKey: keyof GridRowType['values']; newValue: number }[] => {
    const updates: { rowId: string; monthKey: keyof GridRowType['values']; newValue: number }[] = [];
    const row = findRowById(rowId, data);
    const measure = data.find(m => m.id === rowId);
    const targetRow = row || measure;
    
    if (!targetRow) return updates;

    // Recalculate quarters from months
    const q1 = targetRow.values.jan2026 + targetRow.values.feb2026 + targetRow.values.mar2026;
    const q2 = targetRow.values.apr2026 + targetRow.values.may2026 + targetRow.values.jun2026;
    const q3 = targetRow.values.jul2026 + targetRow.values.aug2026 + targetRow.values.sep2026;
    const q4 = targetRow.values.oct2026 + targetRow.values.nov2026 + targetRow.values.dec2026;
    
    // Recalculate half-years and year from quarters
    const h1 = q1 + q2;
    const h2 = q3 + q4;
    const year = q1 + q2 + q3 + q4;

    updates.push(
      { rowId, monthKey: 'q1', newValue: q1 },
      { rowId, monthKey: 'q2', newValue: q2 },
      { rowId, monthKey: 'q3', newValue: q3 },
      { rowId, monthKey: 'q4', newValue: q4 },
      { rowId, monthKey: 'h1', newValue: h1 },
      { rowId, monthKey: 'h2', newValue: h2 },
      { rowId, monthKey: 'year', newValue: year }
    );

    return updates;
  }, []);

  // Helper to distribute quarter to months proportionally
  const distributeQuarterToMonths = useCallback((
    rowId: string,
    quarter: 'q1' | 'q2' | 'q3' | 'q4',
    newQuarterValue: number,
    data: MeasureData[]
  ): { rowId: string; monthKey: keyof GridRowType['values']; newValue: number }[] => {
    const updates: { rowId: string; monthKey: keyof GridRowType['values']; newValue: number }[] = [];
    const row = findRowById(rowId, data);
    const measure = data.find(m => m.id === rowId);
    const targetRow = row || measure;
    
    if (!targetRow) return updates;

    const monthMap = {
      q1: ['jan2026', 'feb2026', 'mar2026'] as const,
      q2: ['apr2026', 'may2026', 'jun2026'] as const,
      q3: ['jul2026', 'aug2026', 'sep2026'] as const,
      q4: ['oct2026', 'nov2026', 'dec2026'] as const,
    };

    const months = monthMap[quarter];
    const currentTotal = months.reduce((sum, month) => sum + targetRow.values[month], 0);

    if (currentTotal === 0) {
      // Equal distribution
      const monthValue = newQuarterValue / 3;
      months.forEach(month => {
        updates.push({ rowId, monthKey: month, newValue: monthValue });
      });
    } else {
      // Proportional distribution
      months.forEach(month => {
        const proportion = targetRow.values[month] / currentTotal;
        const monthValue = newQuarterValue * proportion;
        updates.push({ rowId, monthKey: month, newValue: monthValue });
      });
    }

    return updates;
  }, []);

  // Helper to distribute year to quarters proportionally
  const distributeYearToQuarters = useCallback((
    rowId: string,
    newYearValue: number,
    data: MeasureData[]
  ): { rowId: string; monthKey: keyof GridRowType['values']; newValue: number }[] => {
    const updates: { rowId: string; monthKey: keyof GridRowType['values']; newValue: number }[] = [];
    const row = findRowById(rowId, data);
    const measure = data.find(m => m.id === rowId);
    const targetRow = row || measure;
    
    if (!targetRow) return updates;

    const currentTotal = targetRow.values.q1 + targetRow.values.q2 + targetRow.values.q3 + targetRow.values.q4;

    if (currentTotal === 0) {
      // Equal distribution
      const quarterValue = newYearValue / 4;
      updates.push(
        { rowId, monthKey: 'q1', newValue: quarterValue },
        { rowId, monthKey: 'q2', newValue: quarterValue },
        { rowId, monthKey: 'q3', newValue: quarterValue },
        { rowId, monthKey: 'q4', newValue: quarterValue }
      );
    } else {
      // Proportional distribution
      ['q1', 'q2', 'q3', 'q4'].forEach(quarter => {
        const q = quarter as 'q1' | 'q2' | 'q3' | 'q4';
        const proportion = targetRow.values[q] / currentTotal;
        const quarterValue = newYearValue * proportion;
        updates.push({ rowId, monthKey: q, newValue: quarterValue });
      });
    }

    return updates;
  }, []);

  // Flag to prevent creating undo operations when undoing/redoing
  const isUndoRedoOperationRef = useRef<boolean>(false);
  
  // Handle cell value change
  const handleCellChange = useCallback((
    rowId: string,
    monthKey: keyof GridRowType['values'],
    newValue: number,
    note?: string,
    skipUndoOperation?: boolean, // Skip creating undo operation (for undo/redo)
    disaggregateVisibleChildrenOnly?: boolean,
  ) => {
    // CRITICAL: Clear all preserved values from previous edits
    preservedValuesRef.current.clear();
    
    // Check if it's a measure row
    const measure = gridData.find(m => m.id === rowId);
    const isMeasureRow = !!measure;
    
    let oldValue: number;
    if (isMeasureRow) {
      oldValue = measure.values[monthKey];
    } else {
      const row = findRowById(rowId, gridData);
      if (!row) {
        return;
      }
      oldValue = row.values[monthKey];
    }

    const delta = newValue - oldValue;
    const cellKey = `${rowId}-${monthKey}`;

    // Notify the parent so it can surface this row's charts with the updated value,
    // scoped to the edited time period (so the pie/donut snaps to that month).
    if (delta !== 0) {
      onCellEditedRef.current?.(rowId, monthKey as string);
    }

    // Check if note exists and is not empty
    const hasNote = note && note.trim() !== '';

    if (delta === 0 && !hasNote) {
      // If delta is 0 and no note, remove from edited cells
      setEditedCells(prev => {
        const newMap = new Map(prev);
        newMap.delete(cellKey);
        return newMap;
      });
      return;
    }
    
    // Track edit history - track EVERY edit, not just the first one
    // Also track note-only entries (when delta is 0 but note exists)
    // CRITICAL: Call onEditHistory if available - try ref first, then direct prop
    try {
      const callbackToCall = onEditHistoryRef.current || onEditHistory;
      
      if (callbackToCall && typeof callbackToCall === 'function') {
        // Always call callback if we have a note OR a delta change
        if (delta === 0 && hasNote) {
          // Note-only entry (no value change) - ensure note is passed
          // CRITICAL: Always include oldValue and newValue even if they're the same
          callbackToCall({
            cellKey,
            rowId,
            timeKey: monthKey,
            oldValue: oldValue,
            newValue: newValue,
            note: note.trim(),
          });
        } else if (delta !== 0) {
          // Edit with optional note - always include note if present
          callbackToCall({
            cellKey,
            rowId,
            timeKey: monthKey,
            oldValue,
            newValue,
            note: hasNote ? note.trim() : undefined,
          });
        }
      }
    } catch (error) {
      console.error('[HierarchicalGrid] Error calling onEditHistory:', error);
    }
    
    // Add to editedCells if there's a value change OR if there's a note (to show orange background)
    // Note-only entries (delta === 0 && hasNote) should show edited background
    if (delta !== 0 || hasNote) {
      // Check if this is a new edit (cell not already in editedCells)
      const isNewEdit = !editedCells.has(cellKey);
      
      setEditedCells(prev => {
        const newMap = new Map(prev);
        if (!newMap.has(cellKey)) {
          // Only store original value on first edit
          newMap.set(cellKey, oldValue);
        }
        return newMap;
      });
      
      // Expand the measure that contains this edited cell (only for new edits)
      if (isNewEdit) {
        // Extract measure ID from rowId using the same logic as the useEffect
        const getMeasureIdFromRowId = (rId: string): string | null => {
          // Check if rowId is directly a measure ID
          const directMeasure = gridData.find(m => m.id === rId);
          if (directMeasure) {
            return directMeasure.id;
          }
          
          // Extract measure ID from rowId pattern: account-measure-xxx, category-xxx-measure-xxx, product-xxx-measure-xxx
          const parts = rId.split('-');
          const measureIndex = parts.findIndex(part => part === 'measure');
          if (measureIndex !== -1 && measureIndex < parts.length - 1) {
            return parts.slice(measureIndex, measureIndex + 2).join('-');
          }
          
          return null;
        };
        
        const measureId = getMeasureIdFromRowId(rowId);
        if (measureId) {
          // Expand the measure row only so nested rows stay collapsed unless the user opens them
          setExpandedRows(prev => {
            const newSet = new Set(prev);
            newSet.add(measureId);
            return newSet;
          });
        }
      }
      
      // ROOT CAUSE FIX: If a cell was saved impacted but is now being edited again,
      // remove it from savedImpactedCells because it's now directly edited
      // This ensures old note indicators don't show for cells that are being edited again
      if (savedImpactedCells.has(cellKey)) {
        setSavedImpactedCells(prev => {
          const newSet = new Set(prev);
          newSet.delete(cellKey);
          console.log('[GRID] Removed cell from savedImpactedCells (now directly edited):', cellKey);
          // Notify parent
          if (onSavedImpactedCellsReady) {
            onSavedImpactedCellsReady(newSet);
          }
          return newSet;
        });
      }
    } else {
      // If delta is 0 and no note, ensure cell is not in editedCells
      setEditedCells(prev => {
        const newMap = new Map(prev);
        newMap.delete(cellKey);
        return newMap;
      });
    }
    
    // Store unsaved note if provided (for dirty cells)
    if (hasNote) {
      setUnsavedNotes(prev => {
        const newMap = new Map(prev);
        newMap.set(cellKey, note.trim());
        return newMap;
      });
    } else {
      // Clear unsaved note if note is empty
      setUnsavedNotes(prev => {
        const newMap = new Map(prev);
        newMap.delete(cellKey);
        return newMap;
      });
    }
    
    // Remove from impactedCells if it was previously impacted (edited cells take precedence)
    setImpactedCells(prev => {
      const newMap = new Map(prev);
      if (newMap.has(cellKey)) {
        newMap.delete(cellKey);
        console.log('[GRID] Removed cell from impactedCells (now edited):', cellKey);
      }
      return newMap;
    });

    // Store original values for impacted cells (all cells that will change except the directly edited one)
    const originalValuesForImpacted = new Map<string, number>();
    
    // Helper function to store original value for impacted cells
    const storeOriginalValueIfImpacted = (updateRowId: string, updateMonthKey: keyof GridRowType['values']) => {
      if (updateRowId === rowId && updateMonthKey === monthKey) {
        return; // Skip the directly edited cell
      }
      const impactedCellKey = `${updateRowId}-${updateMonthKey}`;
      // Skip locked cells - they are protected from propagation
      if (lockedCells.has(impactedCellKey)) {
        console.log('[GRID] Skipping locked cell from propagation:', impactedCellKey);
        return;
      }
      if (!originalValuesForImpacted.has(impactedCellKey)) {
        const impactedRow = findRowById(updateRowId, gridData) || gridData.find(m => m.id === updateRowId);
        if (impactedRow) {
          originalValuesForImpacted.set(impactedCellKey, impactedRow.values[updateMonthKey]);
        }
      }
    };

    // Collect all updates
    const allUpdates: { rowId: string; monthKey: keyof GridRowType['values']; newValue: number }[] = [];

    // 1. Update the edited cell
    allUpdates.push({ rowId, monthKey, newValue });

    // Only propagate value changes if delta !== 0 (skip propagation for note-only edits)
    // When delta === 0, there's no value change to propagate, so no cells should be marked as impacted
    if (delta === 0) {
      // No value change - just apply the cell update (value is same, but triggers re-render for note)
      // No propagation needed since there's no value change
      let updatedData = JSON.parse(JSON.stringify(gridData));
      updatedData = updateValue(rowId, monthKey, newValue, updatedData);
      setGridData(updatedData);
      // Note is already saved to editHistory via callback above
      // Don't mark any cells as impacted since there's no value change
      return;
    }

    // 2. Handle time aggregation based on what was edited
    // Track distributed time periods for downward propagation
    const timeDistributionUpdates: { rowId: string; monthKey: keyof GridRowType['values']; newValue: number; oldValue: number }[] = [];
    const row = findRowById(rowId, gridData) || gridData.find(m => m.id === rowId);
    
    if (monthKey === 'year') {
      // Year edited → distribute to quarters → quarters distribute to months
      const quarterUpdates = distributeYearToQuarters(rowId, newValue, gridData);
      quarterUpdates.forEach(q => storeOriginalValueIfImpacted(q.rowId, q.monthKey));
      allUpdates.push(...quarterUpdates);
      
      // Track quarter updates for downward propagation
      if (row) {
        quarterUpdates.forEach(qUpdate => {
          const oldQValue = row.values[qUpdate.monthKey];
          timeDistributionUpdates.push({ rowId, monthKey: qUpdate.monthKey, newValue: qUpdate.newValue, oldValue: oldQValue });
        });
      }
      
      // For each quarter update, distribute to its months
      for (const quarterUpdate of quarterUpdates) {
        const quarter = quarterUpdate.monthKey as 'q1' | 'q2' | 'q3' | 'q4';
        const monthUpdates = distributeQuarterToMonths(rowId, quarter, quarterUpdate.newValue, gridData);
        monthUpdates.forEach(m => storeOriginalValueIfImpacted(m.rowId, m.monthKey));
        allUpdates.push(...monthUpdates);
        
        // Track month updates for downward propagation
        if (row) {
          monthUpdates.forEach(mUpdate => {
            const oldMValue = row.values[mUpdate.monthKey];
            timeDistributionUpdates.push({ rowId, monthKey: mUpdate.monthKey, newValue: mUpdate.newValue, oldValue: oldMValue });
          });
        }
      }
    } else if (monthKey === 'q1' || monthKey === 'q2' || monthKey === 'q3' || monthKey === 'q4') {
      // Quarter edited → distribute to its months → recalculate year
      const quarter = monthKey as 'q1' | 'q2' | 'q3' | 'q4';
      const monthUpdates = distributeQuarterToMonths(rowId, quarter, newValue, gridData);
      monthUpdates.forEach(m => storeOriginalValueIfImpacted(m.rowId, m.monthKey));
      allUpdates.push(...monthUpdates);
      
      // Track month updates for downward propagation
      if (row) {
        monthUpdates.forEach(mUpdate => {
          const oldMValue = row.values[mUpdate.monthKey];
          timeDistributionUpdates.push({ rowId, monthKey: mUpdate.monthKey, newValue: mUpdate.newValue, oldValue: oldMValue });
        });
      }
      
      // Recalculate year from all quarters (will be updated after applying month updates)
      if (row) {
        // Calculate new year value after quarter change
        const updatedQ1 = monthKey === 'q1' ? newValue : row.values.q1;
        const updatedQ2 = monthKey === 'q2' ? newValue : row.values.q2;
        const updatedQ3 = monthKey === 'q3' ? newValue : row.values.q3;
        const updatedQ4 = monthKey === 'q4' ? newValue : row.values.q4;
        const yearValue = updatedQ1 + updatedQ2 + updatedQ3 + updatedQ4;
        storeOriginalValueIfImpacted(rowId, 'year');
        allUpdates.push({ rowId, monthKey: 'year', newValue: yearValue });
      }
    } else {
      // Month edited → recalculate its quarter → recalculate year
      const timeAggUpdates = recalculateTimeAggregations(rowId, gridData);
      timeAggUpdates.forEach(u => storeOriginalValueIfImpacted(u.rowId, u.monthKey));
      allUpdates.push(...timeAggUpdates);
    }

    // 3. Propagate upward (to ancestors) - for the edited time period
    // BUT: Skip upward propagation for the edited row itself if it's a year/quarter edit at account/category level
    // (because we're distributing downward, not summing upward)
    const editedRowForPropagation = findRowById(rowId, gridData);
    const isAccountOrCategoryYearQuarterEditForPropagation = editedRowForPropagation &&
      (editedRowForPropagation.type === 'account' || editedRowForPropagation.type === 'category') &&
      (monthKey === 'year' || monthKey === 'q1' || monthKey === 'q2' || monthKey === 'q3' || monthKey === 'q4');
    
    if (!isAccountOrCategoryYearQuarterEditForPropagation) {
      // Normal case: propagate upward (sum children to parent)
      const upwardUpdates = propagateUpward(rowId, monthKey, delta, gridData, lockedCells);
      upwardUpdates.forEach(u => storeOriginalValueIfImpacted(u.rowId, u.monthKey));
      allUpdates.push(...upwardUpdates);
    } else {
      // Special case: year/quarter edited at account/category level
      // We need to update the parent by summing all children (including the edited one)
      // Then propagate upward from the parent
      console.log('[GRID] Skipping upward propagation for edited row:', rowId, 'type:', editedRowForPropagation.type);
      
      // Find parent and update it by summing all its children
      if (editedRowForPropagation.parentId) {
        const parentRow = findRowById(editedRowForPropagation.parentId, gridData) || gridData.find(m => m.id === editedRowForPropagation.parentId);
        if (parentRow && parentRow.children) {
          const rollupSiblings = rollupChildrenForParentRow(
            parentRow,
            parentTotalsRollupMode,
            propagateIntoNoMatchRows,
          );
          // Calculate new parent value by summing rollup children (including the edited one)
          const childrenSum = rollupSiblings.reduce((sum, child) => {
            // Use the new value for the edited child, current value for others
            const childValue = child.id === rowId ? newValue : child.values[monthKey];
            return sum + childValue;
          }, 0);
          
          const parentOldValue = parentRow.values[monthKey];
          const parentDelta = childrenSum - parentOldValue;
          
          if (parentDelta !== 0) {
            // Update parent value
            storeOriginalValueIfImpacted(parentRow.id, monthKey);
            allUpdates.push({ rowId: parentRow.id, monthKey, newValue: childrenSum });
            
            // Propagate upward from parent
            const upwardUpdates = propagateUpward(parentRow.id, monthKey, parentDelta, gridData, lockedCells);
            upwardUpdates.forEach(u => storeOriginalValueIfImpacted(u.rowId, u.monthKey));
            allUpdates.push(...upwardUpdates);
          }
        }
      }
    }

    const resolveMeasureRollupKidsForDisaggregation = (measureData: MeasureData): GridRowType[] => {
      const measureSource =
        rollupValueSourceData?.find((m) => m.id === measureData.id) ?? measureData;
      const base = childrenForParentRollup(
        measureSource.children,
        parentTotalsRollupMode,
        propagateIntoNoMatchRows,
      );
      if (!disaggregateVisibleChildrenOnly) return base;
      const visibleRoot = filteredMeasureRowsRef.current?.find((m) => m.id === measureData.id);
      if (!visibleRoot?.children?.length) return base;
      const visibleIds = new Set(visibleRoot.children.map((c) => c.id));
      const narrowed = base.filter((c) => visibleIds.has(c.id));
      return narrowed.length > 0 ? narrowed : base;
    };

    // 4. Propagate downward (to descendants) - for the edited time period
    // For measure rows, propagate to account level proportionally
    if (isMeasureRow) {
      const measureData = gridData.find(m => m.id === rowId);
      const measureRollupKids = measureData ? resolveMeasureRollupKidsForDisaggregation(measureData) : [];
      if (measureData && measureRollupKids.length > 0) {
        const accountDistribution = distributeProportionally(delta, measureRollupKids, monthKey, lockedCells);
        for (const [accountId, accountDelta] of accountDistribution.entries()) {
          const account = measureData.children.find(c => c.id === accountId);
          if (account) {
            const accountNewValue = account.values[monthKey] + accountDelta;
            storeOriginalValueIfImpacted(accountId, monthKey);
            allUpdates.push({ rowId: accountId, monthKey, newValue: accountNewValue });
            const accountUpdates = propagateDownward(
              accountId,
              monthKey,
              accountDelta,
              gridData,
              lockedCells,
              parentTotalsRollupMode,
              propagateIntoNoMatchRows,
            );
            accountUpdates.forEach(u => storeOriginalValueIfImpacted(u.rowId, u.monthKey));
            allUpdates.push(...accountUpdates);
          }
        }
      }
    } else {
      // Propagate downward for the edited cell
      const downwardUpdates = propagateDownward(
        rowId,
        monthKey,
        delta,
        gridData,
        lockedCells,
        parentTotalsRollupMode,
        propagateIntoNoMatchRows,
      );
      downwardUpdates.forEach(u => storeOriginalValueIfImpacted(u.rowId, u.monthKey));
      allUpdates.push(...downwardUpdates);
      
      // Also propagate downward for all distributed time periods (quarters, months) to child dimensions
      for (const timeUpdate of timeDistributionUpdates) {
        const timeDelta = timeUpdate.newValue - timeUpdate.oldValue;
        if (timeDelta !== 0) {
          const timeDownwardUpdates = propagateDownward(
            rowId,
            timeUpdate.monthKey,
            timeDelta,
            gridData,
            lockedCells,
            parentTotalsRollupMode,
            propagateIntoNoMatchRows,
          );
          timeDownwardUpdates.forEach(u => storeOriginalValueIfImpacted(u.rowId, u.monthKey));
          allUpdates.push(...timeDownwardUpdates);
        }
      }
    }

    // 5. Propagate time aggregations upward and downward
    // After time aggregation updates, propagate them through hierarchy
    const timeAggRow = findRowById(rowId, gridData) || gridData.find(m => m.id === rowId);
    if (timeAggRow) {
      // For each time aggregation update, propagate through hierarchy
      const timeAggKeys: (keyof GridRowType['values'])[] = ['year', 'q1', 'q2', 'q3', 'q4'];
      for (const aggKey of timeAggKeys) {
        if (monthKey !== aggKey) {
          const currentValue = timeAggRow.values[aggKey];
          // Find the update for this aggregation key
          const aggUpdate = allUpdates.find(u => u.rowId === rowId && u.monthKey === aggKey);
          if (aggUpdate && aggUpdate.newValue !== currentValue) {
            const aggDelta = aggUpdate.newValue - currentValue;
            const aggUpwardUpdates = propagateUpward(rowId, aggKey, aggDelta, gridData, lockedCells);
            allUpdates.push(...aggUpwardUpdates);
            
            if (isMeasureRow) {
              const measureData = gridData.find(m => m.id === rowId);
              const aggRollupKids = measureData ? resolveMeasureRollupKidsForDisaggregation(measureData) : [];
              if (measureData && aggRollupKids.length > 0) {
                const accountDistribution = distributeProportionally(aggDelta, aggRollupKids, aggKey, lockedCells);
                for (const [accountId, accountDelta] of accountDistribution.entries()) {
                  const account = measureData.children.find(c => c.id === accountId);
                  if (account) {
                    const accountNewValue = account.values[aggKey] + accountDelta;
                    allUpdates.push({ rowId: accountId, monthKey: aggKey, newValue: accountNewValue });
                    const accountUpdates = propagateDownward(
                      accountId,
                      aggKey,
                      accountDelta,
                      gridData,
                      lockedCells,
                      parentTotalsRollupMode,
                      propagateIntoNoMatchRows,
                    );
                    allUpdates.push(...accountUpdates);
                  }
                }
              }
            } else {
              const aggDownwardUpdates = propagateDownward(
                rowId,
                aggKey,
                aggDelta,
                gridData,
                lockedCells,
                parentTotalsRollupMode,
                propagateIntoNoMatchRows,
              );
              allUpdates.push(...aggDownwardUpdates);
            }
          }
        }
      }
    }

    // 6. Update cross-measure dependencies (Orders = Sales Agreement)
    // Apply all updates first to get the correct state, then calculate cross-measure dependencies
    let tempData = gridData;
    for (const update of allUpdates) {
      // Skip locked cells - they are protected from propagation
      const updateCellKey = `${update.rowId}-${update.monthKey}`;
      if (lockedCells.has(updateCellKey) && !(update.rowId === rowId && update.monthKey === monthKey)) {
        console.log('[GRID] Skipping locked cell update:', updateCellKey);
        continue;
      }
      tempData = updateValue(update.rowId, update.monthKey, update.newValue, tempData);
    }
    
    // Now calculate cross-measure dependencies with the updated data
    // But we need to pass the original data for unit price calculations
    // So we'll pass both: tempData (for finding rows) and gridData (for original values)
    console.log('[GRID] Calling updateCrossMeasureDependencies:', { rowId, monthKey, newValue });
    
    // For quarter/year edits, we need to trigger cross-measure dependencies at BOTH levels:
    // 1. At the quarter/year level (for direct updates)
    // 2. At the month level (for distributed months)
    const isYearQuarterEdit = monthKey === 'year' || monthKey === 'q1' || monthKey === 'q2' || monthKey === 'q3' || monthKey === 'q4';
    
    let crossMeasureUpdates: { rowId: string; monthKey: keyof GridRowType['values']; newValue: number }[] = [];
    
    if (isYearQuarterEdit) {
      // First, calculate cross-measure dependencies for the quarter/year level
      const quarterYearCrossMeasureUpdates = updateCrossMeasureDependencies(rowId, monthKey, newValue, tempData, gridData, lockedCells);
      console.log('[GRID] Quarter/Year cross-measure updates returned:', quarterYearCrossMeasureUpdates.length, 'updates');
      crossMeasureUpdates.push(...quarterYearCrossMeasureUpdates);
      
      // Apply quarter/year cross-measure updates to tempData
      for (const update of quarterYearCrossMeasureUpdates) {
        tempData = updateValue(update.rowId, update.monthKey, update.newValue, tempData);
      }
      
      // Then, for each month that was distributed from this quarter/year edit, trigger cross-measure dependencies
      const monthKeys: (keyof GridRowType['values'])[] = [
        'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
        'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
      ];
      
      // Determine which months belong to the edited quarter/year
      let relevantMonths: (keyof GridRowType['values'])[] = [];
      if (monthKey === 'year') {
        relevantMonths = monthKeys; // All months for year
      } else if (monthKey === 'q1') {
        relevantMonths = ['jan2026', 'feb2026', 'mar2026'];
      } else if (monthKey === 'q2') {
        relevantMonths = ['apr2026', 'may2026', 'jun2026'];
      } else if (monthKey === 'q3') {
        relevantMonths = ['jul2026', 'aug2026', 'sep2026'];
      } else if (monthKey === 'q4') {
        relevantMonths = ['oct2026', 'nov2026', 'dec2026'];
      }
      
      // For each relevant month, trigger cross-measure dependencies
      for (const monthKeyToProcess of relevantMonths) {
        const monthUpdate = allUpdates.find(u => u.rowId === rowId && u.monthKey === monthKeyToProcess);
        if (monthUpdate) {
          // Get the updated row from tempData to get the new month value
          const updatedRow = findRowById(rowId, tempData) || tempData.find(m => m.id === rowId);
          if (updatedRow) {
            const monthNewValue = updatedRow.values[monthKeyToProcess];
            console.log('[GRID] Triggering cross-measure for distributed month:', { rowId, monthKey: monthKeyToProcess, newValue: monthNewValue });
            const monthCrossMeasureUpdates = updateCrossMeasureDependencies(rowId, monthKeyToProcess, monthNewValue, tempData, gridData, lockedCells);
            console.log('[GRID] Month cross-measure updates returned:', monthCrossMeasureUpdates.length, 'updates');
            
            // Add month cross-measure updates
            crossMeasureUpdates.push(...monthCrossMeasureUpdates);
            
            // Apply these updates to tempData for next iteration
            for (const update of monthCrossMeasureUpdates) {
              tempData = updateValue(update.rowId, update.monthKey, update.newValue, tempData);
            }
          }
        }
      }
    } else {
      // For month edits, just calculate cross-measure dependencies normally
      crossMeasureUpdates = updateCrossMeasureDependencies(rowId, monthKey, newValue, tempData, gridData, lockedCells);
      console.log('[GRID] Cross-measure updates returned:', crossMeasureUpdates.length, 'updates');
    }
    
    allUpdates.push(...crossMeasureUpdates);
    
    // Store original values for cross-measure impacted cells
    crossMeasureUpdates.forEach(update => storeOriginalValueIfImpacted(update.rowId, update.monthKey));

    // Apply all updates
    // Start with a deep copy to ensure we always have a new array reference
    let updatedData = JSON.parse(JSON.stringify(gridData));
    
    // Check if this is a year/quarter edit that needs preservation
    // For measure rows: preserve year/quarter edits
    // For account/category rows: preserve year/quarter edits
    // Note: isYearQuarterEdit is already declared above (line 692)
    const editedRow = findRowById(rowId, gridData);
    const editedMeasure = gridData.find(m => m.id === rowId);
    const isAccountOrCategoryYearQuarterEdit = editedRow &&
      (editedRow.type === 'account' || editedRow.type === 'category') &&
      isYearQuarterEdit;
    const isMeasureYearQuarterEdit = !!editedMeasure && isYearQuarterEdit;
    
    // 7. Update Revenue when Planned Volume is edited
    // Check if the edited row is Planned Volume
    const plannedVolumeMeasure = gridData.find(m => m.id === 'measure-planned-volume');
    const isPlannedVolumeMeasure = editedMeasure && editedMeasure.id === 'measure-planned-volume';
    
    // Check if row is a child of Planned Volume measure
    let isPlannedVolumeRow = false;
    if (editedRow) {
      // Check if parent is Planned Volume measure
      if (editedRow.parentId === 'measure-planned-volume') {
        isPlannedVolumeRow = true;
      } else {
        // Check if any ancestor is Planned Volume measure
        let currentParentId = editedRow.parentId;
        while (currentParentId) {
          if (currentParentId === 'measure-planned-volume') {
            isPlannedVolumeRow = true;
            break;
          }
          const parentRow = findRowById(currentParentId, gridData);
          if (!parentRow) break;
          currentParentId = parentRow.parentId;
        }
      }
    }
    
    if ((isPlannedVolumeMeasure || isPlannedVolumeRow) && delta !== 0 && plannedVolumeMeasure) {
      console.log('[GRID] Planned Volume edited, updating Revenue:', { rowId, monthKey, newValue, delta });
      
      // Find Revenue measure
      const revenueMeasure = tempData.find(m => m.id === 'measure-revenue');
      if (!revenueMeasure) {
        console.log('[GRID] Revenue measure not found');
      } else {
        // Helper function to find row by hierarchy path in a measure
        const findRowByPath = (rows: GridRowType[], path: string[]): GridRowType | null => {
          if (path.length === 0) return null;
          
          const row = rows.find(r => r.name === path[0]);
          if (!row) return null;
          
          if (path.length === 1) return row;
          
          if (row.children && path.length > 1) {
            return findRowByPath(row.children, path.slice(1));
          }
          
          return null;
        };
        
        // Build hierarchy path for the edited Planned Volume row
        const buildPath = (currentRowId: string): string[] => {
          const path: string[] = [];
          let current = findRowById(currentRowId, tempData);
          
          if (!current) return path;
          
          // If it's a measure row, return empty path
          const isMeasure = tempData.some(m => m.id === currentRowId);
          if (isMeasure) return path;
          
          // Traverse up to build path
          while (current) {
            if (current.type !== 'measure') {
              path.unshift(current.name);
            }
            
            if (current.parentId) {
              const parentIsMeasure = tempData.some(m => m.id === current!.parentId);
              if (parentIsMeasure) break;
            }
            
            const parent = findRowById(current.parentId || '', tempData);
            if (!parent) break;
            current = parent;
          }
          
          return path;
        };
        
        // Get hierarchy path
        const hierarchyPath = isPlannedVolumeMeasure ? [] : buildPath(rowId);
        
        // Find corresponding Revenue row
        let revenueRow: GridRowType | null = null;
        if (hierarchyPath.length === 0) {
          // Measure level edit
          revenueRow = revenueMeasure as any;
        } else {
          // Find row by path in Revenue measure
          revenueRow = findRowByPath(revenueMeasure.children, hierarchyPath);
        }
        
        if (revenueRow) {
          // Calculate unit price from existing values (use original data to avoid circular updates)
          const plannedVolumeRow = isPlannedVolumeMeasure 
            ? plannedVolumeMeasure
            : findRowById(rowId, gridData);
          
          if (plannedVolumeRow) {
            const plannedVolumeValue = plannedVolumeRow.values[monthKey];
            const revenueValue = revenueRow.values[monthKey];
            
            // Calculate unit price (avoid division by zero)
            const unitPrice = plannedVolumeValue > 0 ? revenueValue / plannedVolumeValue : 0;
            
            // Calculate new Revenue value
            const newRevenueValue = newValue * unitPrice;
            const revenueDelta = newRevenueValue - revenueValue;
            
            if (Math.abs(revenueDelta) > 0.01) {
              console.log('[GRID] Updating Revenue:', {
                revenueRowId: revenueRow.id,
                monthKey,
                oldRevenue: revenueValue,
                newRevenue: newRevenueValue,
                unitPrice,
                plannedVolumeOld: plannedVolumeValue,
                plannedVolumeNew: newValue
              });
              
              // Add Revenue update
              const revenueUpdate = { rowId: revenueRow.id, monthKey, newValue: newRevenueValue };
              allUpdates.push(revenueUpdate);
              
              // Store original value for impacted cell
              storeOriginalValueIfImpacted(revenueRow.id, monthKey);
              
              // If this is a year/quarter edit, also update distributed months
              if (isYearQuarterEdit) {
                const monthKeys: (keyof GridRowType['values'])[] = [
                  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
                  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
                ];
                
                let relevantMonths: (keyof GridRowType['values'])[] = [];
                if (monthKey === 'year') {
                  relevantMonths = monthKeys;
                } else if (monthKey === 'q1') {
                  relevantMonths = ['jan2026', 'feb2026', 'mar2026'];
                } else if (monthKey === 'q2') {
                  relevantMonths = ['apr2026', 'may2026', 'jun2026'];
                } else if (monthKey === 'q3') {
                  relevantMonths = ['jul2026', 'aug2026', 'sep2026'];
                } else if (monthKey === 'q4') {
                  relevantMonths = ['oct2026', 'nov2026', 'dec2026'];
                }
                
                // Update Revenue for each distributed month
                for (const monthKeyToProcess of relevantMonths) {
                  const plannedVolumeMonthValue = plannedVolumeRow.values[monthKeyToProcess];
                  const revenueMonthValue = revenueRow.values[monthKeyToProcess];
                  const monthUnitPrice = plannedVolumeMonthValue > 0 ? revenueMonthValue / plannedVolumeMonthValue : 0;
                  
                  // Get the new Planned Volume value for this month from allUpdates
                  const plannedVolumeMonthUpdate = allUpdates.find(u => 
                    u.rowId === rowId && u.monthKey === monthKeyToProcess
                  );
                  const newPlannedVolumeMonthValue = plannedVolumeMonthUpdate 
                    ? plannedVolumeMonthUpdate.newValue 
                    : plannedVolumeMonthValue;
                  
                  const newRevenueMonthValue = newPlannedVolumeMonthValue * monthUnitPrice;
                  
                  if (Math.abs(newRevenueMonthValue - revenueMonthValue) > 0.01) {
                    const revenueMonthUpdate = { 
                      rowId: revenueRow.id, 
                      monthKey: monthKeyToProcess, 
                      newValue: newRevenueMonthValue 
                    };
                    allUpdates.push(revenueMonthUpdate);
                    storeOriginalValueIfImpacted(revenueRow.id, monthKeyToProcess);
                  }
                }
              }
            }
          }
        } else {
          console.log('[GRID] Could not find corresponding Revenue row for path:', hierarchyPath);
        }
      }
    }
    
    // Store the edited value to preserve it after calculateMeasureValues.
    // - Year/quarter on account/category or measure: those rows must not be overwritten by child rollups.
    // - Direct measure month (etc.) edit **only** when splitting to visible children only: then
    //   sum(visible children) can legitimately differ from the typed measure total, and recalc would
    //   overwrite the driver. For normal splits, let calculateMeasureValues re-sum the measure so
    //   parent totals stay consistent with children and with filter overlays.
    const preservedValue =
      isAccountOrCategoryYearQuarterEdit ||
      isMeasureYearQuarterEdit ||
      (editedMeasure && disaggregateVisibleChildrenOnly)
        ? newValue
        : null;
    
    // Apply all updates
    console.log('[GRID] Applying', allUpdates.length, 'updates');
    for (const update of allUpdates) {
      // Skip locked cells - they are protected from propagation
      const updateCellKey = `${update.rowId}-${update.monthKey}`;
      if (lockedCells.has(updateCellKey) && !(update.rowId === rowId && update.monthKey === monthKey)) {
        console.log('[GRID] Skipping locked cell update (final):', updateCellKey);
        continue;
      }
      // Check if this update is for a previously edited cell
      const isPreviouslyEdited = editedCells.has(updateCellKey);
      if (isPreviouslyEdited && updateCellKey !== `${rowId}-${monthKey}`) {
        console.log('[GRID] Updating previously edited cell:', updateCellKey, 'from', 
          editedCells.get(updateCellKey), 'to', update.newValue);
      }
      updatedData = updateValue(update.rowId, update.monthKey, update.newValue, updatedData);
    }

    // Store original cell values for every row BEFORE recalculation (measures + nested rows, incl. filter buckets)
    const originalRowValuesBeforeRecalc = snapshotAllRowCellValues(updatedData);

    // Recalculate measure values from children after all updates
    // Skip recalculating ONLY for the currently edited cell (if it's a year/quarter edit)
    // Do NOT skip for cross-measure updates - they should be recalculated
    const skipTimeAggregation = new Set<string>();
    if (isAccountOrCategoryYearQuarterEdit) {
      skipTimeAggregation.add(rowId);
      console.log('[GRID] Skipping recalculation for currently edited row:', rowId, 'type:', editedRow.type);
    } else if (isMeasureYearQuarterEdit) {
      skipTimeAggregation.add(rowId);
      console.log('[GRID] Skipping recalculation for currently edited measure row:', rowId);
    }

    updatedData = calculateMeasureValues(
      updatedData,
      skipTimeAggregation,
      lockedCells,
      parentTotalsRollupMode,
      propagateIntoNoMatchRows,
    );

    // Track any row cell whose value changed from recalc (not only top-level measure rows), e.g. Matches filter bucket
    for (const [snapshotRowId, originalValues] of originalRowValuesBeforeRecalc.entries()) {
      // findRowById only walks measure.children, so top-level measure rows are not found by it.
      // Fall back to the measures array so a measure whose rolled-up total changed is also marked impacted.
      const rowAfter = findRowById(snapshotRowId, updatedData) || updatedData.find(m => m.id === snapshotRowId);
      if (!rowAfter) continue;
      for (const [key, originalValue] of originalValues.entries()) {
        if (snapshotRowId === rowId && key === monthKey) {
          continue;
        }
        const newValue = rowAfter.values[key];
        if (Math.abs(newValue - originalValue) > 0.01) {
          const impactedKey = `${snapshotRowId}-${key}`;
          if (lockedCells.has(impactedKey)) {
            continue;
          }
          if (!editedCells.has(impactedKey) && !originalValuesForImpacted.has(impactedKey)) {
            originalValuesForImpacted.set(impactedKey, originalValue);
            console.log('[GRID] Tracking row cell as impacted after recalc:', impactedKey, 'original:', originalValue, 'new:', newValue);
          }
        }
      }
    }

    // CRITICAL: After recalculation, restore ONLY the currently edited cell's value when needed.
    // Do NOT restore cross-measure updated values - they should be recalculated
    if (preservedValue !== null) {
      console.log('[GRID] Restoring preserved value for currently edited cell:', preservedValue, 'for row:', rowId, 'monthKey:', monthKey);
      updatedData = updateValue(rowId, monthKey, preservedValue, updatedData);
      // Store in ref so it persists across recalculations triggered by useEffect
      preservedValuesRef.current.set(rowId, { monthKey, value: preservedValue });

      // Direct measure month (or other non Y/Q) edit: restoring the month breaks Q/year until we roll up from months.
      if (editedMeasure && !isYearQuarterEdit) {
        const timeRollups = recalculateTimeAggregations(rowId, updatedData);
        for (const u of timeRollups) {
          updatedData = updateValue(u.rowId, u.monthKey, u.newValue, updatedData);
        }
      }
    } else {
      // Clear preserved value if this edit doesn't need preservation
      preservedValuesRef.current.delete(rowId);
    }

    // Update impacted cells state with original values
    // ACCUMULATE impacted cells across all edits (don't clear previous ones)
    setImpactedCells(prev => {
      const newMap = new Map(prev);
      // Add new impacted cells to existing ones (don't clear)
      originalValuesForImpacted.forEach((value, key) => {
        // Skip locked cells - they shouldn't be tracked as impacted
        if (lockedCells.has(key)) {
          return;
        }
        // A cell the user EXPLICITLY edited must keep its edited state (and its edit arrow) even
        // when a later, related edit re-rolls its total. This covers BOTH unsaved edits
        // (editedCells) and already-saved edits (savedEditedCells). Example: user edits FY26 on a
        // parent, saves, then edits June on the same parent — June rolls June->Q2->Year, which
        // changes the parent's Year total. That must NOT demote the earlier FY26 edit to
        // "impacted" (which would drop its arrow and stop showing it as an edit).
        // The note-suppression requirement (a noted cell that later gets impacted must not show
        // its note triangle after save) is the ONLY reason to reclassify, so scope the demotion
        // to cells that actually carried a note.
        const wasUserEdited = editedCells.has(key) || savedEditedCells.has(key);
        if (wasUserEdited) {
          const editedCellHadNote =
            unsavedNotes.has(key) ||
            (cellEditHistory?.some(
              (entry) => entry.cellKey === key && entry.note && entry.note.trim() !== ''
            ) ?? false);
          if (!editedCellHadNote) {
            // Keep as a (saved) edited cell: do not add to impactedCells and do not touch
            // editedCells / savedEditedCells for this key.
            return;
          }
          // Noted cell: fall through to demotion so its note triangle is suppressed after save.
          // Remove from editedCells - this cell is now impacted, not directly edited
          setEditedCells(prevEdited => {
            const newEditedMap = new Map(prevEdited);
            newEditedMap.delete(key);
            console.log('[GRID] Removed cell from editedCells (now impacted):', key);
            return newEditedMap;
          });
          // Also remove from unsavedNotes if present (impacted cells don't show old notes)
          setUnsavedNotes(prevNotes => {
            const newNotesMap = new Map(prevNotes);
            newNotesMap.delete(key);
            return newNotesMap;
          });
        }
        // Add to impactedCells (even if it was previously edited)
        // If already exists, keep the original value (first edit's original)
        if (!newMap.has(key)) {
          newMap.set(key, value);
          console.log('[GRID] Adding impacted cell:', key, 'original value:', value);
        } else {
          console.log('[GRID] Impacted cell already exists, keeping original:', key);
        }
        
        // If this cell was previously saved edited (has arrow), remove it from savedEditedCells
        // so it shows as impacted instead of showing the old arrow
        if (savedEditedCells.has(key)) {
          setSavedEditedCells(prevSaved => {
            const newSavedMap = new Map(prevSaved);
            newSavedMap.delete(key);
            console.log('[GRID] Removed cell from savedEditedCells (now impacted):', key);
            return newSavedMap;
          });
        }
      });
      console.log('[GRID] Total impacted cells after update:', newMap.size);
      return newMap;
    });

    // Ensure we have a fresh deep copy to trigger React re-render
    const finalData = JSON.parse(JSON.stringify(updatedData));
    setGridData(finalData);
    
    // Create undo/redo operation BEFORE updating state (unless this is an undo/redo operation)
    if (!skipUndoOperation && !isUndoRedoOperationRef.current) {
      // Determine operation type: 'value', 'note', or 'both'
      const previousNote = unsavedNotes.get(cellKey) || undefined;
      const operationType: 'value' | 'note' | 'both' = 
        delta !== 0 && hasNote ? 'both' :
        delta !== 0 ? 'value' :
        hasNote ? 'note' : 'value'; // Default to value if somehow both are 0
      
      // Store state before this operation for undo
      const operation: UndoRedoOperation = {
        id: `op-${Date.now()}-${Math.random()}`,
        cellKey,
        rowId,
        monthKey,
        operationType,
        oldValue: delta !== 0 ? oldValue : undefined,
        newValue: delta !== 0 ? newValue : undefined,
        oldNote: hasNote ? previousNote : undefined,
        newNote: hasNote ? note.trim() : undefined,
        timestamp: new Date(),
        impactedCellsBefore: new Map(impactedCells),
        editedCellsBefore: new Map(editedCells),
      };
      
      // Add operation to undo/redo history
      setUndoRedoHistory(prev => {
        const currentIndex = historyIndexRef.current;
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(operation);
        console.log('[UNDO/REDO] Adding operation:', operation.id, 'type:', operationType, 'index:', currentIndex + 1);
        return newHistory;
      });
      setHistoryIndex(prev => {
        const newIndex = prev + 1;
        console.log('[UNDO/REDO] Incrementing historyIndex from', prev, 'to', newIndex);
        return newIndex;
      });
    }
    
    if (onDataChange) {
      isInternalUpdateRef.current = true; // Mark as internal update to prevent sync loop
      onDataChange(finalData);
    }
  }, [
    gridData,
    updateValue,
    onDataChange,
    calculateMeasureValues,
    recalculateTimeAggregations,
    distributeQuarterToMonths,
    distributeYearToQuarters,
    historyIndex,
    editedCells,
    savedEditedCells,
    unsavedNotes,
    cellEditHistory,
    handleExpandMeasure,
    selectedCells,
    focusedCell,
    findRowById,
    lockedCells,
    parentTotalsRollupMode,
    propagateIntoNoMatchRows,
    rollupValueSourceData,
  ]);

  // Collect all visible rows in order for keyboard navigation
  const getAllVisibleRows = useCallback((): GridRowType[] => {
    const visibleRows: GridRowType[] = [];
    
    const collectRows = (row: GridRowType) => {
      visibleRows.push(row);
      if (row.children && expandedRows.has(row.id)) {
        row.children.forEach(collectRows);
      }
    };
    
    gridData.forEach((measure) => {
      // Deep copy the measure row to ensure all children have fresh values
      const measureRow: GridRowType = deepCopyRow({
        id: measure.id,
        name: measure.name,
        parentId: null,
        level: 0,
        type: 'measure',
        children: measure.children,
        values: measure.values,
        groupContext: measure.groupContext,
      });
      
      if (selectedDimensionLevels) {
        const filteredResult = filterRowsByType(measureRow, selectedDimensionLevels);
        if (filteredResult) {
          const filteredRow = Array.isArray(filteredResult) ? measureRow : filteredResult;
          collectRows(filteredRow);
        }
      } else {
        collectRows(measureRow);
      }
    });
    
    return visibleRows;
  }, [gridData, expandedRows, selectedDimensionLevels, filterRowsByType, deepCopyRow]);

  // Register handlers with parent component (moved here after getAllVisibleRows and getVisibleTimeKeys are defined)
  useEffect(() => {
    if (onExpandAllRows) {
      onExpandAllRows(handleExpandAll);
    }
    if (onCollapseAllRows) {
      onCollapseAllRows(handleCollapseAll);
    }
    if (onExpandMeasuresOnly) {
      onExpandMeasuresOnly(handleExpandMeasuresOnly);
    }
    if (onExpandToCategories) {
      onExpandToCategories(handleExpandToCategories);
    }
    if (onClearAllFilters) {
      onClearAllFilters(handleClearAllFilters);
    }
    if (onGetVisibleRowsReady) {
      onGetVisibleRowsReady(getAllVisibleRows);
    }
    if (onGetVisibleTimeKeysReady) {
      onGetVisibleTimeKeysReady(getVisibleTimeKeys);
    }
    if (onResetColumnWidths) {
      onResetColumnWidths(() => {
        columnWidthsRef.current.clear();
        setColumnWidths(new Map());
      });
    }
  }, [handleExpandAll, handleCollapseAll, handleExpandMeasuresOnly, handleExpandToCategories, handleClearAllFilters, onExpandAllRows, onCollapseAllRows, onExpandMeasuresOnly, onExpandToCategories, onClearAllFilters, onGetVisibleRowsReady, onGetVisibleTimeKeysReady, getAllVisibleRows, getVisibleTimeKeys, onResetColumnWidths]);

  // Handle keyboard navigation
  // Note: handleSave is defined later, so we'll use a ref or move this callback after handleSave
  const handleSaveRef = useRef<(() => void) | null>(null);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Handle Copy (Ctrl+C / Cmd+C)
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey && !e.altKey) {
      const activeElement = document.activeElement as HTMLElement;
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement.isContentEditable === true)
      );
      
      // Don't copy if user is typing in an input field (let browser handle it)
      if (isTyping) {
        return;
      }
      
      // Copy selected cells or focused cell
      if (selectedCells && selectedCells.size > 0) {
        e.preventDefault();
        
        // Get cell values from selected cells
        const sortedCells = Array.from(selectedCells).sort();
        
        // Group cells by row to maintain row order
        const cellsByRow = new Map<string, string[]>();
        sortedCells.forEach(cellKey => {
          const [rowId, ...monthKeyParts] = cellKey.split('-');
          const monthKey = monthKeyParts.join('-') as keyof GridRowType['values'];
          
          if (!cellsByRow.has(rowId)) {
            cellsByRow.set(rowId, []);
          }
          
          const row = findRowById(rowId, gridData);
          const measure = gridData.find(m => m.id === rowId);
          const targetRow = row || measure;
          
          if (targetRow && targetRow.values[monthKey] !== undefined) {
            const value = targetRow.values[monthKey];
            cellsByRow.get(rowId)!.push(value.toString());
          }
        });
        
        // Convert to tab-separated values (one row per selected cell, tab-separated columns)
        const rows: string[] = [];
        cellsByRow.forEach((values) => {
          rows.push(values.join('\t'));
        });
        
        const clipboardText = rows.join('\n');
        navigator.clipboard.writeText(clipboardText).catch(err => {
          console.error('Failed to copy to clipboard:', err);
        });
      } else if (focusedCell) {
        // Copy focused cell
        e.preventDefault();
        const row = findRowById(focusedCell.rowId, gridData);
        const measure = gridData.find(m => m.id === focusedCell.rowId);
        const targetRow = row || measure;
        
        if (targetRow && targetRow.values[focusedCell.monthKey] !== undefined) {
          const value = targetRow.values[focusedCell.monthKey];
          navigator.clipboard.writeText(value.toString()).catch(err => {
            console.error('Failed to copy to clipboard:', err);
          });
        }
      }
      return;
    }
    
    // Handle Paste (Ctrl+V / Cmd+V)
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey && !e.altKey) {
      const activeElement = document.activeElement as HTMLElement;
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement.isContentEditable === true)
      );
      
      // Don't paste if user is typing in an input field (let browser handle it)
      if (isTyping) {
        return;
      }
      
      e.preventDefault();
      
      // Read from clipboard
      navigator.clipboard.readText().then(clipboardText => {
        if (!clipboardText.trim()) return;
        
        // Parse clipboard data (support tab-separated values)
        const lines = clipboardText.split('\n').filter(line => line.trim());
        if (lines.length === 0) return;
        
        // Use getAllVisibleRows if available, otherwise compute inline
        const visibleRows = getAllVisibleRows();
        const visibleTimeKeys = getVisibleTimeKeys();
        
        if (visibleRows.length === 0 || visibleTimeKeys.length === 0) return;
        
        // Determine target cells
        let targetCells: Array<{ rowId: string; monthKey: keyof GridRowType['values'] }> = [];
        
        if (selectedCells && selectedCells.size > 0) {
          // Paste into selected cells
          const sortedCells = Array.from(selectedCells).sort();
          sortedCells.forEach(cellKey => {
            const [rowId, ...monthKeyParts] = cellKey.split('-');
            const monthKey = monthKeyParts.join('-') as keyof GridRowType['values'];
            targetCells.push({ rowId, monthKey });
          });
        } else if (focusedCell) {
          // Paste starting from focused cell
          const startRowIndex = visibleRows.findIndex(r => r.id === focusedCell.rowId);
          const startColIndex = visibleTimeKeys.findIndex(k => k === focusedCell.monthKey);
          
          if (startRowIndex !== -1 && startColIndex !== -1) {
            lines.forEach((line, lineIndex) => {
              const values = line.split('\t');
              values.forEach((_, colIndex) => {
                const rowIndex = startRowIndex + lineIndex;
                const colIdx = startColIndex + colIndex;
                
                if (rowIndex < visibleRows.length && colIdx < visibleTimeKeys.length) {
                  const row = visibleRows[rowIndex];
                  if (row && row.type !== 'measure') {
                    targetCells.push({
                      rowId: row.id,
                      monthKey: visibleTimeKeys[colIdx]
                    });
                  }
                }
              });
            });
          }
        }
        
        // Parse values and paste
        const valuesToPaste: string[] = [];
        lines.forEach(line => {
          const values = line.split('\t');
          valuesToPaste.push(...values);
        });
        
        // Paste values into target cells
        targetCells.forEach((targetCell, index) => {
          if (index < valuesToPaste.length) {
            const valueStr = valuesToPaste[index].trim();
            if (valueStr) {
              const numValue = parseFloat(valueStr.replace(/,/g, ''));
              if (!isNaN(numValue)) {
                handleCellChange(targetCell.rowId, targetCell.monthKey, numValue);
              }
            }
          }
        });
      }).catch(err => {
        console.error('Failed to read from clipboard:', err);
      });
      
      return;
    }
    
    // Handle Save shortcut (S key) - only if footer is visible and not typing in input
    if (e.key === 's' || e.key === 'S') {
      const activeElement = document.activeElement as HTMLElement;
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement.isContentEditable === true)
      );
      
      // Check if footer should be visible (there are changes)
      const footerVisible = editedCells.size > 0 || impactedCells.size > 0;
      
      // Only save if footer is visible (there are changes) and not typing in an input field
      if (footerVisible && !isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (handleSaveRef.current) {
          handleSaveRef.current();
        }
        return;
      }
    }
    
    // Don't handle navigation if user is typing in an input field
    const activeElement = document.activeElement;
    if (activeElement && (
      (activeElement.tagName === 'INPUT' && activeElement.classList.contains('cell-input'))
    )) {
      return;
    }
    
    const visibleRows = getAllVisibleRows();
    const visibleTimeKeys = getVisibleTimeKeys();
    
    if (visibleRows.length === 0 || visibleTimeKeys.length === 0) return;
    
    if (!focusedCell) {
      // If no cell is focused, focus the first editable cell
      for (const row of visibleRows) {
        if (row.type !== 'measure') {
          setFocusedCell({ rowId: row.id, monthKey: visibleTimeKeys[0] });
          return;
        }
      }
      return;
    }
    
    const currentRowIndex = visibleRows.findIndex(r => r.id === focusedCell.rowId);
    const currentColIndex = visibleTimeKeys.findIndex(k => k === focusedCell.monthKey);
    
    if (currentRowIndex === -1 || currentColIndex === -1) return;
    
    let newRowIndex = currentRowIndex;
    let newColIndex = currentColIndex;
    
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        newRowIndex = Math.max(0, currentRowIndex - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        newRowIndex = Math.min(visibleRows.length - 1, currentRowIndex + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newColIndex = Math.max(0, currentColIndex - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        newColIndex = Math.min(visibleTimeKeys.length - 1, currentColIndex + 1);
        break;
      case 'Tab':
        // Tab navigation handled by browser, but we can enhance it
        if (e.shiftKey) {
          e.preventDefault();
          if (currentColIndex > 0) {
            newColIndex = currentColIndex - 1;
          } else if (currentRowIndex > 0) {
            newRowIndex = currentRowIndex - 1;
            newColIndex = visibleTimeKeys.length - 1;
          }
        } else {
          e.preventDefault();
          if (currentColIndex < visibleTimeKeys.length - 1) {
            newColIndex = currentColIndex + 1;
          } else if (currentRowIndex < visibleRows.length - 1) {
            newRowIndex = currentRowIndex + 1;
            newColIndex = 0;
          }
        }
        break;
      case 'Enter':
        e.preventDefault();
        // Enter edit mode - GridRow's onKeyDown will handle this
        if (visibleRows[currentRowIndex] && visibleRows[currentRowIndex].type !== 'measure') {
          const cellKey = `${visibleRows[currentRowIndex].id}-${visibleTimeKeys[currentColIndex]}`;
          const cellElement = cellRefs.current.get(cellKey);
          if (cellElement) {
            // Create and dispatch a keyboard event to trigger the cell's onKeyDown handler
            const enterEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              bubbles: true,
              cancelable: true,
            });
            cellElement.dispatchEvent(enterEvent);
          }
        }
        return;
      case 'Home':
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+Home: Go to first cell
          newRowIndex = 0;
          newColIndex = 0;
        } else {
          // Home: Go to first column of current row
          newColIndex = 0;
        }
        break;
      case 'End':
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+End: Go to last cell
          newRowIndex = visibleRows.length - 1;
          newColIndex = visibleTimeKeys.length - 1;
        } else {
          // End: Go to last column of current row
          newColIndex = visibleTimeKeys.length - 1;
        }
        break;
      default:
        return; // Don't prevent default for other keys
    }
    
    // Skip measure rows when navigating (both up and down)
    const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
    if (e.key === 'ArrowDown' || (!e.shiftKey && e.key === 'Tab')) {
      while (newRowIndex < visibleRows.length && visibleRows[newRowIndex].type === 'measure') {
        newRowIndex++;
      }
    } else if (e.key === 'ArrowUp') {
      while (newRowIndex >= 0 && visibleRows[newRowIndex].type === 'measure') {
        newRowIndex--;
      }
    }
    
    if (newRowIndex >= 0 && newRowIndex < visibleRows.length && 
        newColIndex >= 0 && newColIndex < visibleTimeKeys.length) {
      const cellKey = `${visibleRows[newRowIndex].id}-${visibleTimeKeys[newColIndex]}`;
      
      // Shift+Arrow: extend selection range
      if (e.shiftKey && isArrowKey && onKeyboardSelect) {
        onKeyboardSelect(cellKey, true);
      } else if (isArrowKey && onKeyboardSelect) {
        // Plain arrow: single-select the target cell
        onKeyboardSelect(cellKey, false);
      }
      
      setFocusedCell({ 
        rowId: visibleRows[newRowIndex].id, 
        monthKey: visibleTimeKeys[newColIndex] 
      });
      
      // Scroll into view and focus
      const cellElement = cellRefs.current.get(cellKey);
      if (cellElement) {
        cellElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        cellElement.focus();
      }
    }
  }, [focusedCell, getAllVisibleRows, getVisibleTimeKeys, handleCellChange, editedCells, impactedCells, selectedCells, gridData, findRowById, expandedRows, onKeyboardSelect]);

  // Intercept cell selection from mouse clicks to keep `focusedCell` in sync.
  // This ensures Shift+Arrow keyboard selection works correctly after any mouse click,
  // not only after editable cells receive DOM focus.
  const handleCellSelectWithFocus = useCallback((cellKey: string, event: React.MouseEvent) => {
    // Sync focusedCell so that subsequent Shift+Arrow navigation uses the clicked
    // cell as the navigation cursor, regardless of whether it received DOM focus.
    if (!event.shiftKey) {
      const parts = cellKey.split('-');
      if (parts.length >= 2) {
        const monthKey = parts[parts.length - 1] as keyof GridRowType['values'];
        const rowId = parts.slice(0, -1).join('-');
        setFocusedCell({ rowId, monthKey });
      }
    }
    onCellSelect?.(cellKey, event);
  }, [onCellSelect]);

  // Expose cell change handler for programmatic updates (mass update)
  // Also expose a function to get current cell value from gridData
  useEffect(() => {
    if (onCellChangeHandlerReady) {
      onCellChangeHandlerReady((
        rowId: string,
        monthKey: string,
        newValue: number,
        note?: string,
        skipUndo?: boolean,
        disaggregateVisibleChildrenOnly?: boolean,
      ) => {
        handleCellChange(
          rowId,
          monthKey as keyof GridRowType['values'],
          newValue,
          note,
          skipUndo,
          disaggregateVisibleChildrenOnly,
        );
      });
    }
  }, [handleCellChange, onCellChangeHandlerReady]);
  
  // Expose a function to get current cell value (for mass update calculations)
  useEffect(() => {
    if (onGetCurrentCellValueReady) {
      onGetCurrentCellValueReady((rowId: string, monthKey: string): number => {
        const measure = gridData.find(m => m.id === rowId);
        if (measure) {
          return measure.values[monthKey as keyof typeof measure.values] || 0;
        }
        const row = findRowById(rowId, gridData);
        if (row) {
          return row.values[monthKey as keyof typeof row.values] || 0;
        }
        return 0;
      });
    }
  }, [gridData, onGetCurrentCellValueReady]);

  // Expose function to scroll to a specific measure
  useEffect(() => {
    if (onScrollToMeasureReady) {
      onScrollToMeasureReady((measureId: string) => {
        // Get visible rows to find the measure
        const visibleRows = getAllVisibleRows();
        const measureRow = visibleRows.find(row => row.id === measureId && row.type === 'measure');
        
        if (measureRow) {
          // Get the first visible time key to scroll to the first cell of the measure row
          const visibleTimeKeys = getVisibleTimeKeys();
          if (visibleTimeKeys.length > 0) {
            const cellKey = `${measureId}-${visibleTimeKeys[0]}`;
            const cellElement = cellRefs.current.get(cellKey);
            if (cellElement) {
              // Scroll to the cell with smooth behavior, centered in view
              cellElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }
      });
    }
  }, [onScrollToMeasureReady, getAllVisibleRows, getVisibleTimeKeys]);

  // Auto-expand rows that match search (only when searchTerm changes, not gridData)
  useEffect(() => {
    if (!searchTerm || searchTerm.trim() === '') {
      return;
    }

    try {
      const searchTerms = extractSearchTerms(searchTerm);
      if (searchTerms.length === 0) {
        return;
      }

      const rowsToExpand = new Set<string>();
      
      const checkRow = (row: GridRowType, measureName: string) => {
        try {
          const matchResult = rowMatchesSearch(row, searchTerms, measureName);
          if (matchResult.matches) {
            // Add this row and all its parents to expanded set
            let currentRow: GridRowType | null = row;
            while (currentRow && currentRow.parentId) {
              rowsToExpand.add(currentRow.parentId);
              // Find parent in current gridData
              let foundParent: GridRowType | null = null;
              for (const m of gridData) {
                if (m.id === currentRow!.parentId) {
                  foundParent = {
                    id: m.id,
                    name: m.name,
                    parentId: null,
                    level: 0,
                    type: 'measure',
                    children: m.children,
                    values: m.values,
                    groupContext: m.groupContext,
                  };
                  break;
                }
                if (m.children) {
                  const findParentInChildren = (rows: GridRowType[]): GridRowType | null => {
                    for (const r of rows) {
                      if (r.id === currentRow!.parentId) return r;
                      if (r.children) {
                        const found = findParentInChildren(r.children);
                        if (found) return found;
                      }
                    }
                    return null;
                  };
                  foundParent = findParentInChildren(m.children);
                  if (foundParent) break;
                }
              }
              currentRow = foundParent;
            }
            rowsToExpand.add(row.id);
          }
          
          if (row.children) {
            row.children.forEach(child => checkRow(child, measureName));
          }
        } catch (e) {
          console.error('[GRID] Error in checkRow:', e);
        }
      };

      gridData.forEach(measure => {
        try {
          checkRow({
            id: measure.id,
            name: measure.name,
            parentId: null,
            level: 0,
            type: 'measure',
            children: measure.children,
            values: measure.values,
            groupContext: measure.groupContext,
          }, measure.name);
        } catch (e) {
          console.error('[GRID] Error checking measure:', e);
        }
      });

      setExpandedRows(prev => {
        const newSet = new Set(prev);
        rowsToExpand.forEach(id => newSet.add(id));
        return newSet;
      });
    } catch (error) {
      console.error('[GRID] Error in auto-expand useEffect:', error);
    }
  }, [searchTerm]); // Removed gridData dependency to prevent infinite loops

  // Memoize the deep-copied measure rows with search filtering
  const memoizedMeasureRows = useMemo(() => {
    try {
      if (!gridData || gridData.length === 0) {
        return [];
      }

      // If no search term, return all rows
      if (!searchTerm || !searchTerm.trim()) {
        return gridData.map((measure) => {
          return deepCopyRow({
            id: measure.id,
            name: measure.name,
            parentId: null,
            level: 0,
            type: 'measure',
            children: measure.children,
            values: measure.values,
            groupContext: measure.groupContext,
          });
        });
      }

      const searchTerms = extractSearchTerms(searchTerm);
      if (searchTerms.length === 0) {
        // No valid search terms, return all rows
        return gridData.map((measure) => {
          return deepCopyRow({
            id: measure.id,
            name: measure.name,
            parentId: null,
            level: 0,
            type: 'measure',
            children: measure.children,
            values: measure.values,
            groupContext: measure.groupContext,
          });
        });
      }
      
      // Get available measures for term classification
      const availableMeasures = gridData.map(m => ({ id: m.id, name: m.name }));
      
      // Separate search terms into measure, dimension, time, and other terms
      const { measureTerms, dimensionTerms, timeTerms, otherTerms } = separateSearchTerms(searchTerms, availableMeasures);
      
      const filteredRows: GridRowType[] = [];
      
      for (const measure of gridData) {
        try {
          // Filter by measure name if measure terms exist
          if (measureTerms.length > 0) {
            const measureNameLower = measure.name.toLowerCase();
            const matchesMeasure = measureTerms.some(term => {
              const termLower = term.toLowerCase();
              // Check if term is contained in measure name or vice versa
              if (measureNameLower.includes(termLower) || termLower.includes(measureNameLower)) {
                return true;
              }
              // For multi-word terms, check if all words appear in measure name
              const termWords = termLower.split(/\s+/).filter(w => w.length > 0);
              if (termWords.length > 1) {
                return termWords.every(word => measureNameLower.includes(word));
              }
              return false;
            });
            if (!matchesMeasure) {
              continue; // Skip this measure if it doesn't match
            }
          }
          
          let measureRow: GridRowType = deepCopyRow({
            id: measure.id,
            name: measure.name,
            parentId: null,
            level: 0,
            type: 'measure',
            children: measure.children,
            values: measure.values,
            groupContext: measure.groupContext,
          });

          // Combine dimension terms and other terms for row filtering
          const rowSearchTerms = [...dimensionTerms, ...otherTerms];
          
          // Get matching time period keys if there are time terms
          const matchingTimeKeys = timeTerms.length > 0 ? getMatchingTimePeriodKeys(timeTerms) : undefined;
          
          // Filter rows if we have dimension/other terms OR time terms
          if (rowSearchTerms.length > 0 || timeTerms.length > 0) {
            // Filter rows based on search (dimension, other terms, and time terms)
            const filterRow = (row: GridRowType): GridRowType | null => {
              try {
                const matchResult = rowMatchesSearch(
                  row, 
                  rowSearchTerms, 
                  measure.name,
                  timeTerms.length > 0 ? timeTerms : undefined,
                  matchingTimeKeys
                );
                
                // Process children
                let filteredChildren: GridRowType[] = [];
                if (row.children && row.children.length > 0) {
                  for (const child of row.children) {
                    try {
                      const filteredChild = filterRow(child);
                      if (filteredChild) {
                        filteredChildren.push(filteredChild);
                      }
                    } catch (e) {
                      console.error('[GRID] Error filtering child:', e);
                      // Skip child if filtering fails
                    }
                  }
                }

                // Show row if it matches or has matching children
                if (matchResult.matches || filteredChildren.length > 0) {
                  return {
                    ...row,
                    children: filteredChildren.length > 0 ? filteredChildren : row.children,
                  };
                }

                return null;
              } catch (e) {
                console.error('[GRID] Error in filterRow:', e);
                return null;
              }
            };

            const filteredRow = filterRow(measureRow);
            if (filteredRow) {
              filteredRows.push(filteredRow);
            }
          } else if (measureTerms.length > 0) {
            // Only measure terms, show all rows for matching measures
            filteredRows.push(measureRow);
          } else {
            // No search terms, show all rows
            filteredRows.push(measureRow);
          }
        } catch (e) {
          console.error('[GRID] Error processing measure:', e);
          // Include measure even if filtering fails to prevent data loss
          filteredRows.push(deepCopyRow({
            id: measure.id,
            name: measure.name,
            parentId: null,
            level: 0,
            type: 'measure',
            children: measure.children,
            values: measure.values,
            groupContext: measure.groupContext,
          }));
        }
      }
      
      return filteredRows;
    } catch (error) {
      console.error('[GRID] Error in memoizedMeasureRows:', error);
      // Return all rows on error to prevent blank page
      try {
        return gridData.map((measure) => {
          return deepCopyRow({
            id: measure.id,
            name: measure.name,
            parentId: null,
            level: 0,
            type: 'measure',
            children: measure.children,
            values: measure.values,
            groupContext: measure.groupContext,
          });
        });
      } catch (e) {
        console.error('[GRID] Error creating fallback rows:', e);
        return [];
      }
    }
  }, [gridData, deepCopyRow, searchTerm]);

  // Get the value for a measure row to use for sorting.
  // The measure row itself has a YoY/MoM/Actual value — sort by that directly.
  const getMeasureAggregateValue = useCallback((measure: GridRowType, columnKey: string): number => {
    return getCellNumericValueForColumn(measure, columnKey);
  }, []);

  // Apply column filters on top of the memoized rows (remove non-matching rows)
  const filteredMeasureRows = useMemo(() => {
    let rows = memoizedMeasureRows;
    if (!rows) return rows;

    const visibleTimeKeyStrings = getVisibleTimeKeys().map(String);
    const sortValueForCriterion = (row: GridRowType, columnKey: string) =>
      getCellNumericValueForColumn(row, expandGlobalSortColumnKey(columnKey, visibleTimeKeyStrings));

    // 1. Apply column filters
    if (columnFilters.size > 0) {
      rows = rows.map(r => filterRowTree(r)).filter((r): r is GridRowType => r !== null);
    }

    // 2. Apply sort — global multi-column sort takes precedence over single column sort
    // Apply dimension sorts first (if any)
    if (globalSortConfig?.dimensionSorts && globalSortConfig.dimensionSorts.length > 0) {
      const { dimensionSorts, preserveHierarchy: ph } = globalSortConfig;
      
      const applyDimensionSort = (row: GridRowType): GridRowType => {
        if (!row.children || row.children.length === 0) return row;
        
        let children = [...row.children];
        
        // Apply each dimension sort
        for (const dimSort of dimensionSorts) {
          if (!dimSort.level) continue;
          
          // Filter children by level
          const matchingChildren = children.filter(c => c.type === dimSort.level);
          const otherChildren = children.filter(c => c.type !== dimSort.level);
          
          // Sort matching children
          const sortedMatching = [...matchingChildren].sort((a, b) => {
            let av: number, bv: number;
            
            if (dimSort.sortBy === 'alphabetical') {
              // Sort by name alphabetically
              const nameA = (a.name || '').toLowerCase();
              const nameB = (b.name || '').toLowerCase();
              return dimSort.direction === 'asc' 
                ? nameA.localeCompare(nameB)
                : nameB.localeCompare(nameA);
            } else {
              // Sort by measure value
              const measureId = dimSort.sortBy.replace('measure-', 'measure-');
              // Get the value from the specified measure
              av = sortValueForCriterion(a, 'year'); // Use year as aggregate
              bv = sortValueForCriterion(b, 'year');
              return dimSort.direction === 'asc' ? av - bv : bv - av;
            }
          });
          
          // Reconstruct children array with sorted matching children
          children = [...sortedMatching, ...otherChildren];
        }
        
        if (ph) {
          return { ...row, children: children.map(c => applyDimensionSort(c)) };
        } else {
          return { ...row, children };
        }
      };
      
      rows = rows.map(r => applyDimensionSort(r));
    }
    
    if (globalSortConfig && globalSortConfig.criteria.length > 0) {
      // Multi-column sort: apply criteria in reverse order so first criterion is most significant
      const { criteria, preserveHierarchy: ph, sortMeasures: sm } = globalSortConfig;
      
      // Sort measures if sortMeasures is true
      if (sm && criteria.length > 0) {
        const firstCriterion = criteria[criteria.length - 1]; // First criterion (most significant)
        rows = [...rows].sort((a, b) => {
          const av = sortValueForCriterion(a, firstCriterion.columnKey) || 0;
          const bv = sortValueForCriterion(b, firstCriterion.columnKey) || 0;
          // Ensure we're comparing signed numeric values correctly
          // For descending: larger values first (bv - av), so +19 comes before -19
          // For ascending: smaller values first (av - bv), so -19 comes before +19
          return firstCriterion.direction === 'asc' ? av - bv : bv - av;
        });
      }
      
      const applyMultiSort = (row: GridRowType): GridRowType => {
        if (!row.children || row.children.length === 0) return row;
        let children = [...row.children];
        // Apply criteria from last to first (stable sort: first criterion wins)
        for (let i = criteria.length - 1; i >= 0; i--) {
          const { columnKey, direction } = criteria[i];
          children = children.sort((a, b) => {
            const av = sortValueForCriterion(a, columnKey);
            const bv = sortValueForCriterion(b, columnKey);
            return direction === 'asc' ? av - bv : bv - av;
          });
        }
        if (ph) {
          return { ...row, children: children.map(c => applyMultiSort(c)) };
        } else {
          const flattenAll = (r: GridRowType): GridRowType[] => [r, ...(r.children ? r.children.flatMap(flattenAll) : [])];
          const allDesc = row.children.flatMap(flattenAll);
          let sortedFlat = allDesc;
          for (let i = criteria.length - 1; i >= 0; i--) {
            const { columnKey, direction } = criteria[i];
            sortedFlat = sortedFlat.sort((a, b) => {
              const av = sortValueForCriterion(a, columnKey);
              const bv = sortValueForCriterion(b, columnKey);
              return direction === 'asc' ? av - bv : bv - av;
            });
          }
          return { ...row, children: sortedFlat.map(c => ({ ...c, children: undefined })) };
        }
      };
      rows = rows.map(r => applyMultiSort(r));
    } else if (sortConfig) {
      // Single column sort — honor Global Sort panel flags even when criteria list is empty
      const { columnKey, direction } = sortConfig;
      // When sorting by subcolumns (YoY, Target, etc.), automatically sort measures
      const isSubColumnSort = columnKey.includes('-') && !columnKey.endsWith('-Actual');
      const panelSm = isSubColumnSort || (globalSortConfig?.sortMeasures ?? false);
      const panelPh = globalSortConfig?.preserveHierarchy ?? true;

      if (panelSm) {
        // Calculate aggregate YoY/MoM value for each measure
        const measureAggregates = new Map<GridRowType, number>();
        rows.forEach(row => {
          measureAggregates.set(row, getMeasureAggregateValue(row, columnKey));
        });
        
        // Sort measures by aggregate value
        rows = [...rows].sort((a, b) => {
          const av = measureAggregates.get(a) || 0;
          const bv = measureAggregates.get(b) || 0;
          
          // Descending: bv - av (19 > 15 > 14 > 0 > -4 > -6 > -10 > -19)
          // Ascending: av - bv (-19 < -10 < -6 < -4 < 0 < 14 < 15 < 19)
          if (direction === 'desc') {
            return bv - av;
          } else {
            return av - bv;
          }
        });
      }
      
      rows = rows.map(r => sortRowTree(r, columnKey, direction, panelPh));
    } else if (
      globalSortConfig &&
      !globalSortConfig.preserveHierarchy &&
      (globalSortConfig.criteria?.length ?? 0) === 0
    ) {
      rows = rows.map(r => flattenMeasureChildrenInTreeOrder(r));
    }

    // Parent totals: full hierarchy / bucket modes recompute from widest structure + live values.
    // `visibleOnly`: parents must sum only the row tree actually shown (search / column filters / depth).
    if (
      parentTotalsRollupMode !== 'visibleOnly' &&
      (columnFilters.size > 0 || rollupValueSourceData)
    ) {
      const liveForRollup = rollupValueSourceData ?? gridData;
      const structureForRollup = rollupStructureData ?? rollupValueSourceData ?? gridData;
      return overlayFullSubtreeTotalsForColumnFilter(rows, liveForRollup, structureForRollup);
    }
    if (parentTotalsRollupMode === 'visibleOnly') {
      return recomputeVisibleOnlyTotalsInTree(rows);
    }
    return rows;
  }, [
    memoizedMeasureRows,
    columnFilters,
    filterRowTree,
    sortConfig,
    sortRowTree,
    globalSortConfig,
    getMeasureAggregateValue,
    flattenMeasureChildrenInTreeOrder,
    getVisibleTimeKeys,
    gridData,
    rollupStructureData,
    rollupValueSourceData,
    parentTotalsRollupMode,
  ]);

  useEffect(() => {
    filteredMeasureRowsRef.current = filteredMeasureRows ?? null;
  }, [filteredMeasureRows]);

  /** Column-filter “some children hidden” flag — collected here because filterRowsByType / quick-filter copies can drop `descendantsExcludedByColumnFilter` on row objects. */
  const descendantColumnFilterRowIds = useMemo(() => {
    const ids = new Set<string>();
    const walk = (r: GridRowType) => {
      if (r.descendantsExcludedByColumnFilter) ids.add(r.id);
      r.children?.forEach(walk);
    };
    for (const m of filteredMeasureRows ?? []) {
      walk(m);
    }
    return ids;
  }, [filteredMeasureRows]);

  // Calculate impacted measures count
  const impactedMeasuresCount = useMemo(() => {
    const impactedMeasureIds = new Set<string>();
    
    console.log('[FOOTER] Calculating impacted measures count. editedCells:', editedCells.size, 'impactedCells:', impactedCells.size);
    
    // Helper function to extract measure ID from rowId
    const getMeasureIdFromRowId = (rowId: string): string | null => {
      // Check if rowId is directly a measure ID
      const directMeasure = gridData.find(m => m.id === rowId);
      if (directMeasure) {
        return directMeasure.id;
      }
      
      // Extract measure ID from rowId pattern: account-measure-xxx, category-xxx-measure-xxx, product-xxx-measure-xxx
      // Or measure row cells: measure-xxx
      const parts = rowId.split('-');
      
      // Look for 'measure-' in the parts
      const measureIndex = parts.findIndex(part => part === 'measure');
      if (measureIndex !== -1 && measureIndex < parts.length - 1) {
        // Reconstruct measure ID: measure-xxx
        const measureId = `measure-${parts.slice(measureIndex + 1).join('-')}`;
        // Verify it exists in gridData
        if (gridData.find(m => m.id === measureId)) {
          return measureId;
        }
      }
      
      // Fallback: search through all measures to find which one contains this row
      for (const m of gridData) {
        const row = findRowById(rowId, [m]);
        if (row) {
          return m.id;
        }
      }
      
      return null;
    };
    
    // Get measure IDs from edited cells
    editedCells.forEach((_, cellKey) => {
      // cellKey format: `${rowId}-${monthKey}`
      // Extract rowId by removing the last part (monthKey like 'feb2026', 'jan2026', etc.)
      const parts = cellKey.split('-');
      // MonthKey is always the last part (e.g., 'feb2026', 'jan2026', 'year', 'q1', etc.)
      // Reconstruct rowId from all parts except the last one
      const rowId = parts.slice(0, -1).join('-');
      const measureId = getMeasureIdFromRowId(rowId);
      if (measureId) {
        console.log('[FOOTER] Found edited cell in measure:', measureId, 'from rowId:', rowId, 'cellKey:', cellKey);
        impactedMeasureIds.add(measureId);
      }
    });
    
    // Get measure IDs from impacted cells
    impactedCells.forEach((_, cellKey) => {
      // cellKey format: `${rowId}-${monthKey}`
      // Extract rowId by removing the last part (monthKey like 'feb2026', 'jan2026', etc.)
      const parts = cellKey.split('-');
      // MonthKey is always the last part (e.g., 'feb2026', 'jan2026', 'year', 'q1', etc.)
      // Reconstruct rowId from all parts except the last one
      const rowId = parts.slice(0, -1).join('-');
      const measureId = getMeasureIdFromRowId(rowId);
      if (measureId) {
        console.log('[FOOTER] Found impacted cell in measure:', measureId, 'from rowId:', rowId, 'cellKey:', cellKey);
        impactedMeasureIds.add(measureId);
      }
    });
    
    // Filter to only count visible measures if visibleMeasureIds is provided
    let finalCount = impactedMeasureIds.size;
    if (visibleMeasureIds && visibleMeasureIds.size > 0) {
      const visibleImpactedMeasures = Array.from(impactedMeasureIds).filter(measureId => 
        visibleMeasureIds.has(measureId)
      );
      finalCount = visibleImpactedMeasures.length;
      console.log('[FOOTER] Total impacted measures (all):', impactedMeasureIds.size, 'measures:', Array.from(impactedMeasureIds));
      console.log('[FOOTER] Visible impacted measures:', finalCount, 'measures:', visibleImpactedMeasures);
    } else {
      console.log('[FOOTER] Total impacted measures:', impactedMeasureIds.size, 'measures:', Array.from(impactedMeasureIds));
    }
    return finalCount;
  }, [editedCells, impactedCells, gridData, visibleMeasureIds]);

  // Expose impacted measures info to parent
  useEffect(() => {
    if (onImpactedMeasuresInfoReady) {
      onImpactedMeasuresInfoReady({
        count: impactedMeasuresCount,
        showOnlyImpactedKPI: showOnlyImpactedKPI
      });
    }
  }, [impactedMeasuresCount, showOnlyImpactedKPI, onImpactedMeasuresInfoReady]);

  // Expose toggle handler to parent
  useEffect(() => {
    if (onToggleShowOnlyImpactedKPIHandlerReady) {
      onToggleShowOnlyImpactedKPIHandlerReady(handleToggleShowOnlyImpactedKPI);
    }
  }, [handleToggleShowOnlyImpactedKPI, onToggleShowOnlyImpactedKPIHandlerReady]);

  // Undo handler - undo the most recent operation
  const handleUndo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    const currentHistory = undoRedoHistory;
    
    console.log('[UNDO] handleUndo called. historyIndex:', currentIndex, 'operations.length:', currentHistory.length);
    
    // Can only undo if we have at least one operation
    if (currentIndex >= 0 && currentHistory.length > currentIndex) {
      const operation = currentHistory[currentIndex];
      console.log('[UNDO] Undoing operation:', operation.id, 'type:', operation.operationType, 'cell:', operation.cellKey);
      
      // Reverse the operation based on its type
      let valueToRestore: number | undefined = undefined;
      let noteToRestore: string | undefined = undefined;
      
      // Determine what to restore based on operation type
      // If operation type is 'both', undo the latest change (value or note)
      // For now, prioritize value if both exist
      if (operation.operationType === 'value' || operation.operationType === 'both') {
        valueToRestore = operation.oldValue;
      }
      if (operation.operationType === 'note' || operation.operationType === 'both') {
        noteToRestore = operation.oldNote;
      }
      
      // Set flag to prevent creating new undo operation
      isUndoRedoOperationRef.current = true;
      
      try {
        // Restore the cell value/note by calling handleCellChange with the old values
        // This will trigger all propagation logic automatically
        if (valueToRestore !== undefined) {
          // Call handleCellChange to restore value and trigger propagation
          handleCellChange(operation.rowId, operation.monthKey, valueToRestore, noteToRestore, true);
          
          // CRITICAL: Restore editedCells and impactedCells to their state BEFORE this operation
          // This ensures formatting (backgrounds, arrows) matches the previous state
          // We do this AFTER handleCellChange because it recalculates these maps
          // Use setTimeout to ensure handleCellChange completes first
          setTimeout(() => {
            setEditedCells(new Map(operation.editedCellsBefore));
            setImpactedCells(new Map(operation.impactedCellsBefore));
            console.log('[UNDO] Restored editedCells and impactedCells to previous state');
          }, 0);
          
          console.log('[UNDO] Undo completed. Restored value:', valueToRestore, 'note:', noteToRestore);
        } else if (noteToRestore !== undefined) {
          // Note-only undo - just restore the note
          setUnsavedNotes(prev => {
            const newMap = new Map(prev);
            if (noteToRestore) {
              newMap.set(operation.cellKey, noteToRestore);
            } else {
              newMap.delete(operation.cellKey);
            }
            return newMap;
          });
          
          // For note-only undo, also restore editedCells state
          // If the cell was edited before, keep it; if not, remove it
          setEditedCells(() => {
            const newMap = new Map(operation.editedCellsBefore);
            // If the note was the only edit, remove from editedCells
            if (!operation.editedCellsBefore.has(operation.cellKey)) {
              newMap.delete(operation.cellKey);
            }
            return newMap;
          });
          
          console.log('[UNDO] Undo completed (note only). Restored note:', noteToRestore);
        }
        
        // Update history index
        setHistoryIndex(currentIndex - 1);
      } finally {
        // Reset flag
        isUndoRedoOperationRef.current = false;
      }
    } else {
      console.log('[UNDO] Cannot undo - historyIndex:', currentIndex, 'operations.length:', currentHistory.length);
    }
  }, [undoRedoHistory, gridData, updateValue, calculateMeasureValues, lockedCells, onDataChange]);

  // Redo handler - reapply the next operation
  const handleRedo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    const currentHistory = undoRedoHistory;
    
    console.log('[REDO] handleRedo called. historyIndex:', currentIndex, 'operations.length:', currentHistory.length);
    
    if (currentIndex < currentHistory.length - 1 && currentHistory.length > 0) {
      const newIndex = currentIndex + 1;
      const operation = currentHistory[newIndex];
      console.log('[REDO] Redoing operation:', operation.id, 'type:', operation.operationType, 'cell:', operation.cellKey);
      
      // Reapply the operation by calling handleCellChange with the new values
      // Set flag to prevent creating new undo operation
      isUndoRedoOperationRef.current = true;
      
      try {
        if (operation.newValue !== undefined) {
          // Call handleCellChange to restore value and trigger propagation
          handleCellChange(operation.rowId, operation.monthKey, operation.newValue, operation.newNote, true);
          console.log('[REDO] Redo completed. Restored value:', operation.newValue, 'note:', operation.newNote);
        } else if (operation.newNote !== undefined) {
          // Note-only redo
          setUnsavedNotes(prev => {
            const newMap = new Map(prev);
            if (operation.newNote) {
              newMap.set(operation.cellKey, operation.newNote);
            } else {
              newMap.delete(operation.cellKey);
            }
            return newMap;
          });
          console.log('[REDO] Redo completed (note only). Restored note:', operation.newNote);
        }
        
        setHistoryIndex(newIndex);
      } finally {
        // Reset flag
        isUndoRedoOperationRef.current = false;
      }
    } else {
      console.log('[REDO] Cannot redo - historyIndex:', currentIndex, 'operations.length:', currentHistory.length);
    }
  }, [undoRedoHistory, gridData, updateValue, calculateMeasureValues, lockedCells, onDataChange]);

  // Register undo/redo handlers with parent
  useEffect(() => {
    if (onUndoHandler) {
      onUndoHandler(handleUndo);
    }
  }, [onUndoHandler, handleUndo]);

  useEffect(() => {
    if (onRedoHandler) {
      onRedoHandler(handleRedo);
    }
  }, [onRedoHandler, handleRedo]);

  // Report undo/redo availability to parent
  useEffect(() => {
    if (onCanUndoChange) {
      onCanUndoChange(historyIndex > 0);
    }
  }, [onCanUndoChange, historyIndex]);

  useEffect(() => {
    if (onCanRedoChange) {
      onCanRedoChange(historyIndex < undoRedoHistory.length - 1);
    }
  }, [onCanRedoChange, historyIndex, undoRedoHistory.length]);

  // Cancel handler
  const handleCancel = useCallback(() => {
    // Clear draft edits
    if (onClearDrafts) {
      onClearDrafts();
    }
    
    // Restore to original data
    setGridData(JSON.parse(JSON.stringify(originalDataRef.current)));
    setUndoRedoHistory([]);
    setHistoryIndex(-1);
    setEditedCells(new Map());
    setImpactedCells(new Map());
    // Also clear saved edited cells
    setSavedEditedCells(new Map());
    // Clear saved impacted cells
    setSavedImpactedCells(new Set());
    // Notify parent that saved impacted cells are cleared
    if (onSavedImpactedCellsReady) {
      onSavedImpactedCellsReady(new Set());
    }
    // Clear unsaved notes
    setUnsavedNotes(new Map());
  }, [onClearDrafts, onSavedImpactedCellsReady]);

  // Save handler
  const handleSave = useCallback(() => {
    // Commit draft edits to saved history before clearing undo/redo history
    if (onCommitDrafts) {
      onCommitDrafts();
    }
    
    // Update original data reference
    originalDataRef.current = JSON.parse(JSON.stringify(gridData));
    // Clear history and reset
    setUndoRedoHistory([]);
    setHistoryIndex(-1);
    // Mark all currently edited cells as saved (they keep the icon but lose the badge)
    // Store the icon color based on whether it was an increment or decrement
    setSavedEditedCells(prev => {
      const newMap = new Map(prev);
      editedCells.forEach((originalValue, cellKey) => {
        // Extract rowId and monthKey from cellKey
        const parts = cellKey.split('-');
        const monthKey = parts[parts.length - 1] as keyof GridRowType['values'];
        const rowId = parts.slice(0, -1).join('-');
        
        // Find the current value for this cell
        let currentValue = 0;
        const measure = gridData.find(m => m.id === rowId);
        if (measure) {
          currentValue = measure.values[monthKey] || 0;
        } else {
          const row = findRowById(rowId, gridData);
          if (row) {
            currentValue = row.values[monthKey] || 0;
          }
        }
        
        // Only add to savedEditedCells if there was an actual value change
        if (originalValue !== currentValue) {
          // Calculate if it was an increment or decrement
          const isIncrement = originalValue !== 0 && currentValue > originalValue;
          const iconColor = isIncrement ? 'var(--slds-g-color-warning-2)' : 'var(--color-accent-blue)';
          
          newMap.set(cellKey, iconColor);
          console.log('[SAVE] Adding cell to savedEditedCells:', cellKey, 'iconColor:', iconColor, 'originalValue:', originalValue, 'currentValue:', currentValue);
        } else {
          // No value change - remove from savedEditedCells if present
          newMap.delete(cellKey);
          console.log('[SAVE] Removing cell from savedEditedCells (no value change):', cellKey);
        }
      });
      console.log('[SAVE] Total saved edited cells:', newMap.size);
      return newMap;
    });
    // Track which cells were impacted but are now saved (to prevent showing old notes/popovers)
    // These cells were impacted but not directly edited, so they shouldn't show note indicators or popovers
    const impactedCellKeys = Array.from(impactedCells.keys());
    console.log('[SAVE] Impacted cells to track:', impactedCellKeys);
    console.log('[SAVE] Edited cells:', Array.from(editedCells.keys()));
    setSavedImpactedCells(prev => {
      const newSet = new Set(prev);
      impactedCellKeys.forEach(key => {
        // Only add if it wasn't directly edited (directly edited cells go to savedEditedCells)
        // CRITICAL: This includes cells that had notes but then got impacted
        // When a cell with a saved note gets impacted, it's removed from editedCells and added to impactedCells
        // So on save, it should be added to savedImpactedCells to suppress the old note indicator
        if (!editedCells.has(key)) {
          newSet.add(key);
        }
      });
      // CRITICAL: Always create a new Set reference to ensure React detects the change
      // Even if no new cells are added, create a new Set to trigger re-render
      const finalSet = new Set(newSet);
      // Notify parent of saved impacted cells
      if (onSavedImpactedCellsReady) {
        onSavedImpactedCellsReady(finalSet);
      }
      return finalSet;
    });
    
    // Clear impacted cells (they're now saved)
    setImpactedCells(new Map());
    // Clear editedCells - remove all cells
    // Note-only cells (no value change) are removed (no background after save)
    // Value-change cells are moved to savedEditedCells (for arrow display)
    setEditedCells(new Map());
    // Clear unsaved notes (they're now saved)
    setUnsavedNotes(new Map());
    // Reset "Show Only Impacted KPI" filter since there are no more unsaved edits
    setShowOnlyImpactedKPI(false);
    // Notify parent
    if (onDataChange) {
      isInternalUpdateRef.current = true; // Mark as internal update to prevent sync loop
      onDataChange(gridData);
    }
    
    // Call onAfterSave callback if provided (after all save operations complete)
    if (onAfterSave) {
      onAfterSave();
    }
  }, [gridData, onDataChange, editedCells, onCommitDrafts, onAfterSave]);

  // Check if footer should be visible (only if there are unsaved edits)
  const isFooterVisible = editedCells.size > 0 || impactedCells.size > 0;

  // Filter rows based on "Show Only Impacted KPI" setting
  const getFilteredRows = useCallback((measureRow: GridRowType): GridRowType | GridRowType[] | null => {
    if (!showOnlyImpactedKPI) {
      return measureRow;
    }
    
    // Check if this measure has any edited or impacted cells
    const measureHasChanges = Array.from(editedCells.keys()).some(key => key.startsWith(measureRow.id + '-')) ||
                              Array.from(impactedCells.keys()).some(key => key.startsWith(measureRow.id + '-'));
    
    if (!measureHasChanges) {
      // Check children
      const hasChangedChildren = measureRow.children?.some(child => {
        const childHasChanges = Array.from(editedCells.keys()).some(key => key.startsWith(child.id + '-')) ||
                                Array.from(impactedCells.keys()).some(key => key.startsWith(child.id + '-'));
        return childHasChanges || (child.children && child.children.some(grandchild => 
          Array.from(editedCells.keys()).some(key => key.startsWith(grandchild.id + '-')) ||
          Array.from(impactedCells.keys()).some(key => key.startsWith(grandchild.id + '-'))
        ));
      });
      
      if (!hasChangedChildren) {
        return null; // Filter out this measure
      }
    }
    
    return measureRow;
  }, [showOnlyImpactedKPI, editedCells, impactedCells]);

  // Measure the main month header cell height for accurate sub-col sticky top offset.
  // Using a single-row month cell avoids rowspan/table-row measurement quirks.
  useEffect(() => {
    const el = mainHeaderCellRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (h > 0) setHeaderRowHeight(Math.round(h));
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Track the first column's real right edge so the resize handle sits exactly on the
  // column border even when the column can't shrink to the requested width.
  useEffect(() => {
    const th = firstColHeaderRef.current;
    const wrapper = wrapperRef.current;
    if (!th || !wrapper) return;
    const measure = () => {
      const edge = Math.round(th.getBoundingClientRect().right - wrapper.getBoundingClientRect().left);
      setFirstColEdge(edge);
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(th);
    window.addEventListener('resize', measure);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [dimensionsColWidth, frozenColWidth]);

  // Check if search is active (filtering columns)
  const isFiltering = (searchTerm && searchTerm.trim().length > 0) || !showAllPeriods;

  const frozenHeaderTitle = (
    <div className="grid-header-title-container">
      <span>Measures / Dimensions x Time</span>
      {onSettingsClick && (
        <button
          className="grid-header-settings-button"
          onClick={onSettingsClick}
          title="Settings"
          type="button"
        >
          <svg fill="currentColor" viewBox="0 0 24 24" width="14" height="14">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <div className="grid-container-wrapper" ref={wrapperRef} style={{ position: 'relative' }}>
      <div
        className={`grid-container ${isFooterVisible ? 'has-footer' : ''} ${subColumns.length > 0 ? 'has-sub-columns' : ''}`}
        {...(!isGrid264Ux ? { onKeyDown: handleKeyDown, tabIndex: 0 as const } : {})}
      >
        <table
          {...(isGrid264Ux
            ? {
                role: 'grid' as const,
                tabIndex: 0 as const,
                onKeyDown: handleKeyDown,
                'aria-label': 'Planning grid',
              }
            : {})}
          className={`grid-table ${isFiltering ? 'filtered' : ''} ${subColumns.length > 0 ? 'has-sub-columns' : ''} ${frozenColumns.length > 0 ? 'has-frozen-cols' : ''}`}
          style={{
            '--first-col-width': `${totalFrozenWidth}px`,
            '--header-row-height': `${headerRowHeight}px`,
          } as React.CSSProperties}
        >
          <thead className="grid-header">
            <tr>
              <th
                ref={firstColHeaderRef}
                rowSpan={subColumns.length > 0 ? 2 : 1}
                style={frozenColumns.length > 0 ? {
                  width: `${totalFrozenWidth}px`,
                  minWidth: `${totalFrozenWidth}px`,
                } : undefined}
              >
                {frozenHeaderTitle}
              </th>
              {visibleTimeHeaders.map((header, headerIndex) => {
                const searchTerms = searchTerm && searchTerm.trim() ? extractSearchTerms(searchTerm) : [];
                const dynamicWidth = columnWidths.get(header.key) || columnWidth;
                const hasFilter = subColumns.length > 0 ? false : columnFilters.has(header.key);
                const isActiveSort = subColumns.length > 0 ? false : sortConfig?.columnKey === header.key;
                const sortDir = isActiveSort ? sortConfig!.direction : null;
                const subColCount = subColumns.length > 0 ? 1 + subColumns.length : 1;
                const isLastColumnGroup = headerIndex === visibleTimeHeaders.length - 1;
                const isCompactWeek = header.granularity === 'week' && !!header.shortLabel && dynamicWidth < 170;
                return (
                  <th
                    key={header.key}
                    data-column-key={header.key}
                    colSpan={subColCount}
                    className={isLastColumnGroup ? 'sub-col-last-column-group' : ''}
                    style={{ minWidth: `${dynamicWidth * subColCount}px`, width: `${dynamicWidth * subColCount}px` }}
                    ref={headerIndex === 0 ? mainHeaderCellRef : undefined}
                    onMouseEnter={isCompactWeek ? (ev) => {
                      let tip = document.getElementById('__wkTip');
                      if (!tip) {
                        tip = document.createElement('div');
                        tip.id = '__wkTip';
                        tip.style.cssText = 'position:fixed;z-index:99999;background:#032d60;color:#fff;font:12px/1.5 sans-serif;padding:4px 8px;border-radius:4px;pointer-events:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.35));white-space:nowrap';
                        const tx = document.createElement('span');
                        tip.appendChild(tx);
                        const nb = document.createElement('div');
                        nb.style.cssText = 'position:absolute;top:-5px;left:14px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:6px solid #032d60';
                        tip.appendChild(nb);
                        document.body.appendChild(tip);
                      }
                      (tip.firstChild as HTMLElement).textContent = header.label;
                      tip.style.display = 'block';
                      const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                      tip.style.left = `${Math.round(r.left + 24)}px`;
                      tip.style.top = `${Math.round(r.bottom - 4)}px`;
                    } : undefined}
                    onMouseLeave={isCompactWeek ? () => {
                      const t = document.getElementById('__wkTip');
                      if (t) t.style.display = 'none';
                    } : undefined}
                  >
                    <div className="col-header-content">
                      <span className="col-header-label">
                        {isCompactWeek ? (
                          header.shortLabel
                        ) : searchTerms.length > 0 ? (
                          <SearchHighlight text={header.label} searchTerms={searchTerms} />
                        ) : (
                          header.label
                        )}
                      </span>
                      {subColumns.length === 0 && (
                        <div className="col-header-icons">
                          {/* Sort button */}
                          <button
                            type="button"
                            className={`col-sort-icon-btn${isActiveSort ? ' active' : ''}`}
                            title="Sort column (ascending, descending, off)"
                            onClick={e => handleSortClick(e, header.key)}
                          >
                            <ColHeaderSortGlyph dir={sortDir} muted={!isActiveSort} />
                          </button>
                          {/* Filter button */}
                          <button
                            type="button"
                            ref={el => { if (el) filterBtnRefs.current.set(header.key, el); else filterBtnRefs.current.delete(header.key); }}
                            className={`col-filter-icon-btn${hasFilter ? ' active' : ''}`}
                            title={hasFilter ? 'Filter active — click to edit' : 'Filter column'}
                            onClick={e => handleFilterIconClick(e, header.key)}
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                              <path d="M4.25 5.61C6.27 8.2 10 13 10 13v6c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-6s3.72-4.8 5.74-7.39c.51-.66.04-1.61-.79-1.61H5.04c-.83 0-1.3.95-.79 1.61z"/>
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
              <ColumnFilterPopover
                columnKey={openFilterKey ?? ''}
                anchorEl={filterAnchorEl}
                isOpen={openFilterKey !== null}
                onClose={() => { setOpenFilterKey(null); setFilterAnchorEl(null); }}
                currentFilter={openFilterKey ? columnFilters.get(openFilterKey) : undefined}
                onApply={handleFilterApply}
                availableMeasures={gridData.map(m => ({ id: m.id, name: m.name }))}
                dimensionNames={dimensionNames}
              />
            </tr>
            {/* Sub-column header row — one <th> per sub-column per time period */}
            {subColumns.length > 0 && (
              <tr className="sub-col-header-row">
                {visibleTimeHeaders.map((header, headerIndex) => {
                  const dynamicWidth = columnWidths.get(header.key) || columnWidth;
                  const isLastColumnGroup = headerIndex === visibleTimeHeaders.length - 1;
                  return (
                    <React.Fragment key={`sub-hdr-${header.key}`}>
                      <th
                        data-column-key={`${header.key}-Actual`}
                        className={`sub-col-header-item-th sub-col-header-item-actual ${isLastColumnGroup ? 'sub-col-last-column-group' : ''}`}
                        style={{ minWidth: `${dynamicWidth}px`, width: `${dynamicWidth}px` }}
                      >
                        <div className="col-header-content sub-col-header-content">
                          <span className="sub-col-line-dot" style={{ backgroundColor: BASE_LINE_COLOR }} aria-hidden="true" />
                          <span className="col-header-label">Actual</span>
                          <div className="col-header-icons">
                            <button
                              type="button"
                              className={`col-sort-icon-btn${sortConfig?.columnKey === `${header.key}-Actual` ? ' active' : ''}`}
                              title="Sort column (ascending, descending, off)"
                              onClick={e => handleSortClick(e, `${header.key}-Actual`)}
                            >
                              <ColHeaderSortGlyph
                                dir={sortConfig?.columnKey === `${header.key}-Actual` ? sortConfig.direction : null}
                                muted={sortConfig?.columnKey !== `${header.key}-Actual`}
                              />
                            </button>
                            <button
                              type="button"
                              ref={el => { if (el) filterBtnRefs.current.set(`${header.key}-Actual`, el); else filterBtnRefs.current.delete(`${header.key}-Actual`); }}
                              className={`col-filter-icon-btn${columnFilters.has(`${header.key}-Actual`) ? ' active' : ''}`}
                              title={columnFilters.has(`${header.key}-Actual`) ? 'Filter active — click to edit' : 'Filter column'}
                              onClick={e => handleFilterIconClick(e, `${header.key}-Actual`)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" width="13" height="13"><path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                            </button>
                          </div>
                        </div>
                      </th>
                      {subColumns.map((sc, subColIndex) => {
                        const isLastSubCol = subColIndex === subColumns.length - 1;
                        const subColKey = `${header.key}-${sc.id}`;
                        const isActiveSort = sortConfig?.columnKey === subColKey;
                        const hasFilter = columnFilters.has(subColKey);
                        // Approval Status sub-column is narrower
                        const subColWidth = sc.id === 'approvalStatus' ? 110 : dynamicWidth;
                        return (
                          <th
                            key={sc.id}
                            data-column-key={subColKey}
                            className={`sub-col-header-item-th ${isLastSubCol ? 'sub-col-last-in-group' : ''} ${isLastColumnGroup && isLastSubCol ? 'sub-col-last-column-group' : ''}`}
                            style={{ minWidth: `${subColWidth}px`, width: `${subColWidth}px` }}
                          >
                            <div className="col-header-content sub-col-header-content">
                              {subColLineColors.has(sc.id) && (
                                <span className="sub-col-line-dot" style={{ backgroundColor: subColLineColors.get(sc.id) }} aria-hidden="true" />
                              )}
                              <span className="col-header-label">{sc.name}</span>
                              <div className="col-header-icons">
                                <button
                                  type="button"
                                  className={`col-sort-icon-btn${isActiveSort ? ' active' : ''}`}
                                  title="Sort column (ascending, descending, off)"
                                  onClick={e => handleSortClick(e, subColKey)}
                                >
                                  <ColHeaderSortGlyph
                                    dir={isActiveSort && sortConfig ? sortConfig.direction : null}
                                    muted={!isActiveSort}
                                  />
                                </button>
                                <button
                                  type="button"
                                  ref={el => { if (el) filterBtnRefs.current.set(subColKey, el); else filterBtnRefs.current.delete(subColKey); }}
                                  className={`col-filter-icon-btn${hasFilter ? ' active' : ''}`}
                                  title={hasFilter ? 'Filter active — click to edit' : 'Filter column'}
                                  onClick={e => handleFilterIconClick(e, subColKey)}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" width="13" height="13"><path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                </button>
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody className="grid-body">
            {!filteredMeasureRows || filteredMeasureRows.length === 0 ? (
              <tr>
                <td colSpan={visibleTimeHeaders.length + 1} className="grid-no-results">
                  {columnFilters.size > 0 ? 'No rows match the active column filters' : searchTerm && searchTerm.trim() ? `No results found for '${searchTerm}'` : 'No data available'}
                </td>
              </tr>
            ) : (
              filteredMeasureRows.map((measureRow) => {
                if (!measureRow) return null;
                const measure = gridData.find(m => m.id === measureRow.id);
                if (!measure) return null;
                /** Logical child count for measure-row icon (panel filters prune `gridData` but rollup keeps full tree). */
                const measureForUnderlyingChildCount =
                  rollupValueSourceData?.find(m => m.id === measure.id) ?? measure;
                const fullMeasureChildCountForIcon = measureForUnderlyingChildCount.children?.length ?? 0;
              
                // Apply "Show Only Impacted KPI" filter first
                const impactedFilteredRow = getFilteredRows(measureRow);
                if (!impactedFilteredRow) {
                  return null;
                }
              const rowAfterImpactedFilter = Array.isArray(impactedFilteredRow) ? measureRow : impactedFilteredRow;
              
              // Apply filtering if selectedDimensionLevels is provided
              if (selectedDimensionLevels) {
                // Create a fresh copy for filtering to ensure we don't mutate the memoized row
                const rowForFiltering = deepCopyRow(rowAfterImpactedFilter);
                const filteredResult = filterRowsByType(rowForFiltering, selectedDimensionLevels);
                
                // Skip rendering if the row was filtered out
                if (!filteredResult) {
                  return null;
                }
                
                // Measure rows should always return a single GridRowType, not an array
                // But handle array case just in case (shouldn't happen)
                const filteredRow = Array.isArray(filteredResult) ? measureRow : filteredResult;
                
                // Apply quick filter filtering
                const rowForQuickFilter = deepCopyRow(filteredRow);
                const quickFilteredRow = filterChildrenByQuickFilter(rowForQuickFilter);
                if (!quickFilteredRow) {
                  return null; // Row filtered out by quick filter
                }
                
                return (
                  <GridRowComponent
                    key={`${measure.id}-read-${readCells.length > 0 ? [...readCells].sort().join('-') : 'none'}-${readCells.length}`}
                    row={ensureWeeksDeep(quickFilteredRow)}
                    level={0}
                    isExpanded={expandedRows.has(measure.id)}
                    expandedRows={expandedRows}
                    onToggleExpand={toggleExpand}
                    formatValue={(value: number, isQuantity?: boolean, rowName?: string) => {
                      // For measure rows, rowName is the measure name
                      // For child rows, rowName is account/category/product name, so use measure.name
                      const measureName = rowName && gridData.find(m => m.name === rowName) ? rowName : measure.name;
                      return formatValue(value, isQuantity, measureName);
                    }}
                    onCellChange={(rowId, monthKey, newValue, note, skipUndo, disaggregateVisibleChildrenOnly) => {
                      handleCellChange(rowId, monthKey, newValue, note, skipUndo, disaggregateVisibleChildrenOnly);
                    }}
                    visibleTimeKeys={getVisibleTimeKeys()}
                    focusedCell={focusedCell}
                    onCellFocus={handleFocusChange}
                    cellRefs={cellRefs}
                    editedCells={editedCells}
                    impactedCells={impactedCells}
                    savedEditedCells={savedEditedCells}
                    unsavedNotes={unsavedNotes}
                    savedImpactedCells={savedImpactedCells}
                    columnWidth={columnWidth}
                    searchTerm={searchTerm}
                    onCellEditStateChange={handleCellEditStateChange}
                    editHistory={cellEditHistory}
                    onCellFocusWithHistory={onCellFocusWithHistory}
                    lockedCells={lockedCells}
                    readCells={readCells}
                    onCellContextMenu={onCellContextMenu}
                    selectedCells={selectedCells}
                    onCellSelect={handleCellSelectWithFocus}
                    onCellMouseDown={onCellMouseDown}
                    onCellMouseMove={onCellMouseMove}
                    lastSelectedCell={lastSelectedCell}
                    onFillHandleDragStart={onFillHandleDragStart}
                    onFillHandleDragMove={onFillHandleDragMove}
                    onFillHandleDragEnd={onFillHandleDragEnd}
                    readonlyMeasureIds={readonlyMeasureIds}
                    isAdjustmentGroupSelected={isAdjustmentGroupSelected}
                    onMeasureGroupChange={onMeasureGroupChange}
                    measureGroupContext={measureGroupContext}
                    onMeasureGroupContextChange={onMeasureGroupContextChange}
                    sharedMeasureIds={sharedMeasureIds}
                    onExpandMeasure={handleExpandMeasure}
                    onCollapseMeasure={handleCollapseMeasure}
                    isNewlyAdded={newlyAddedMeasureIds.includes(measure.id)}
                    frozenColumns={frozenColumns}
                    showAdditionalFrozenColumns={showAdditionalFrozenColumns}
                    subColumns={subColumns}
                    frozenColWidth={totalFrozenWidth}
                    data={gridData}
                    onApplyQuickFilter={handleApplyQuickFilter}
                    onShowCharts={onShowCharts}
                    quickFilter={quickFilters.get(measure.id) || null}
                    getQuickFilter={(rowId: string) => quickFilters.get(rowId) || null}
                    approvalRequests={approvalRequests}
                    onApprovalAction={(approvalId, action, comment, approverRole) => {
                      if (onApprovalActionDirect) {
                        // Direct path: ForecastingGrid's handleApprovalAction handles multi-approver logic
                        onApprovalActionDirect(approvalId, action, comment, approverRole);
                      } else if (onApprovalUpdate) {
                        // Legacy fallback
                        const cellKey = approvalId.replace(/^approval-/, '');
                        const approval = approvalRequests.get(cellKey);
                        if (approval) {
                          const newStatus: ApprovalRequest['status'] = action === 'submitForApproval' ? 'pending' : action;
                          onApprovalUpdate(cellKey, { ...approval, status: newStatus, userInitiated: true });
                        }
                      }
                    }}
                    onApprovalStatusChangeViewHistory={onApprovalStatusChangeViewHistory}
                    onApprovalStatusChangeMarkAsRead={onApprovalStatusChangeMarkAsRead}
                    conditionalFormattingRules={conditionalFormattingRules}
                    conditionalFormattingColorScaleMerge={conditionalFormattingColorScaleMerge}
                    isDesignSystemRulesEnabled={isDesignSystemRulesEnabled}
                    measureId={measure.id}
                    allCellValues={allCellValues}
                    allCellValuesByType={allCellValuesByType}
                    parentTotalsRollupMode={parentTotalsRollupMode}
                    propagateIntoNoMatchRows={propagateIntoNoMatchRows}
                    measureEditDisaggregateVisibleChildrenDefault={measureEditDisaggregateVisibleChildrenDefault}
                    excludedNoMatchSubtreeRowIds={excludedNoMatchSubtreeRowIds}
                    planReviewGridLock={planReviewGridLock}
                    planReviewRequesterStripes={planReviewRequesterStripes}
                    approverMayOpenReviewPopover={approverMayOpenReviewPopover}
                    approverOverrideCellKeys={approverOverrideCellKeys}
                    pendingApproverEdit={pendingApproverEdit}
                    onPendingApproverEditConsumed={onPendingApproverEditConsumed}
                    onManagerOverrideForCell={onManagerOverrideForCell}
                    flattenedSortShowAncestorPath={isFlattenedSortAncestorPathVisible}
                    descendantColumnFilterRowIds={descendantColumnFilterRowIds}
                    rollupValueSourceData={rollupValueSourceData}
                    fullMeasureChildCount={fullMeasureChildCountForIcon}
                  />
              );
              }
              
              // No filtering - render normally
              // Apply quick filter filtering
              const rowForQuickFilterNoFilter = deepCopyRow(rowAfterImpactedFilter);
              const quickFilteredRowNoFilter = filterChildrenByQuickFilter(rowForQuickFilterNoFilter);
              if (!quickFilteredRowNoFilter) {
                return null; // Row filtered out by quick filter
              }
              
              return (
                <GridRowComponent
                  key={`${measure.id}-read-${readCells.length > 0 ? [...readCells].sort().join('-') : 'none'}-${readCells.length}`}
                  row={ensureWeeksDeep(quickFilteredRowNoFilter)}
                  level={0}
                  isExpanded={expandedRows.has(measure.id)}
                  expandedRows={expandedRows}
                  onToggleExpand={toggleExpand}
                  formatValue={formatValue}
                  onCellChange={(rowId, monthKey, newValue, note, skipUndo, disaggregateVisibleChildrenOnly) => {
                    handleCellChange(rowId, monthKey, newValue, note, skipUndo, disaggregateVisibleChildrenOnly);
                  }}
                  visibleTimeKeys={getVisibleTimeKeys()}
                  focusedCell={focusedCell}
                  onCellFocus={setFocusedCell}
                  cellRefs={cellRefs}
                  editedCells={editedCells}
                  impactedCells={impactedCells}
                  savedEditedCells={savedEditedCells}
                  unsavedNotes={unsavedNotes}
                  savedImpactedCells={savedImpactedCells}
                  columnWidth={columnWidth}
                  isNewlyAdded={newlyAddedMeasureIds.includes(measure.id)}
                  searchTerm={searchTerm}
                  onCellEditStateChange={handleCellEditStateChange}
                  editHistory={cellEditHistory}
                  onCellFocusWithHistory={onCellFocusWithHistory}
                  lockedCells={lockedCells}
                  readCells={readCells}
                  onCellContextMenu={onCellContextMenu}
                    selectedCells={selectedCells}
                    onCellSelect={handleCellSelectWithFocus}
                    onCellMouseDown={onCellMouseDown}
                    onCellMouseMove={onCellMouseMove}
                    lastSelectedCell={lastSelectedCell}
                    onFillHandleDragStart={onFillHandleDragStart}
                    onFillHandleDragMove={onFillHandleDragMove}
                    onFillHandleDragEnd={onFillHandleDragEnd}
                    readonlyMeasureIds={readonlyMeasureIds}
                    isAdjustmentGroupSelected={isAdjustmentGroupSelected}
                    onMeasureGroupChange={onMeasureGroupChange}
                    measureGroupContext={measureGroupContext}
                    onMeasureGroupContextChange={onMeasureGroupContextChange}
                    sharedMeasureIds={sharedMeasureIds}
                    onExpandMeasure={handleExpandMeasure}
                    onCollapseMeasure={handleCollapseMeasure}
                    frozenColumns={frozenColumns}
                    showAdditionalFrozenColumns={showAdditionalFrozenColumns}
                    subColumns={subColumns}
                    frozenColWidth={totalFrozenWidth}
                  data={gridData}
                  onApplyQuickFilter={handleApplyQuickFilter}
                  onShowCharts={onShowCharts}
                  quickFilter={quickFilters.get(measure.id) || null}
                  getQuickFilter={(rowId: string) => quickFilters.get(rowId) || null}
                  approvalRequests={approvalRequests}
                  onApprovalAction={(approvalId, action, comment, approverRole) => {
                    if (onApprovalActionDirect) {
                      onApprovalActionDirect(approvalId, action, comment, approverRole);
                    } else if (onApprovalUpdate) {
                      const cellKey = approvalId.replace(/^approval-/, '');
                      const approval = approvalRequests.get(cellKey);
                      if (approval) {
                        const newStatus: ApprovalRequest['status'] = action === 'submitForApproval' ? 'pending' : action;
                        onApprovalUpdate(cellKey, { ...approval, status: newStatus, userInitiated: true });
                      }
                    }
                  }}
                  onApprovalStatusChangeViewHistory={onApprovalStatusChangeViewHistory}
                  onApprovalStatusChangeMarkAsRead={onApprovalStatusChangeMarkAsRead}
                  conditionalFormattingRules={conditionalFormattingRules}
                  conditionalFormattingColorScaleMerge={conditionalFormattingColorScaleMerge}
                  isDesignSystemRulesEnabled={isDesignSystemRulesEnabled}
                  measureId={measure.id}
                  allCellValues={allCellValues}
                  allCellValuesByType={allCellValuesByType}
                  parentTotalsRollupMode={parentTotalsRollupMode}
                  propagateIntoNoMatchRows={propagateIntoNoMatchRows}
                  measureEditDisaggregateVisibleChildrenDefault={measureEditDisaggregateVisibleChildrenDefault}
                  excludedNoMatchSubtreeRowIds={excludedNoMatchSubtreeRowIds}
                  planReviewGridLock={planReviewGridLock}
                  planReviewRequesterStripes={planReviewRequesterStripes}
                  approverMayOpenReviewPopover={approverMayOpenReviewPopover}
                  approverOverrideCellKeys={approverOverrideCellKeys}
                  pendingApproverEdit={pendingApproverEdit}
                  onPendingApproverEditConsumed={onPendingApproverEditConsumed}
                    onManagerOverrideForCell={onManagerOverrideForCell}
                  flattenedSortShowAncestorPath={isFlattenedSortAncestorPathVisible}
                  descendantColumnFilterRowIds={descendantColumnFilterRowIds}
                  rollupValueSourceData={rollupValueSourceData}
                  fullMeasureChildCount={fullMeasureChildCountForIcon}
                />
              );
              })
            )}
          </tbody>
      </table>
      {frozenColumns.length === 0 && (
        <div
          className="frozen-col-resize-handle-vertical"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize first column"
          style={{
            position: 'absolute',
            left: `${firstColEdge ?? dimensionsColWidth}px`,
            top: 0,
            bottom: 0,
            width: '16px',
            transform: 'translateX(-50%)',
            cursor: 'col-resize',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startWidth = dimensionsColWidth;
            dimColResizingRef.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            const onMove = (mv: MouseEvent) => {
              if (!dimColResizingRef.current) return;
              const delta = mv.clientX - startX;
              const next = Math.min(DIM_COL_MAX_WIDTH, Math.max(DIM_COL_MIN_WIDTH, startWidth + delta));
              setDimensionsColWidth(next);
            };
            const onUp = () => {
              dimColResizingRef.current = false;
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
          onDoubleClick={() => setDimensionsColWidth(300)}
        >
          <div className="frozen-col-resize-handle-pill" aria-hidden />
        </div>
      )}
      {frozenColumns.length > 0 &&
        (isGrid264Ux ? (
          <button
            type="button"
            className="frozen-col-resize-handle-vertical"
            aria-label="Resize frozen columns"
            style={{
              position: 'absolute',
              left: `${totalFrozenWidth}px`,
              top: 0,
              bottom: 0,
              width: '16px',
              transform: 'translateX(-50%)',
              cursor: 'col-resize',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'auto',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const startX = e.clientX;
              const startWidth = frozenColWidth;
              frozenColResizingRef.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
              const onMove = (mv: MouseEvent) => {
                if (!frozenColResizingRef.current) return;
                const delta = mv.clientX - startX;
                setFrozenColWidth(Math.max(0, startWidth + delta));
              };
              const onUp = () => {
                frozenColResizingRef.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            <div className="frozen-col-resize-handle-pill" aria-hidden />
          </button>
        ) : (
          <div
            className="frozen-col-resize-handle-vertical"
            style={{
              position: 'absolute',
              left: `${totalFrozenWidth}px`,
              top: 0,
              bottom: 0,
              width: '16px',
              transform: 'translateX(-50%)',
              cursor: 'col-resize',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'auto',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const startX = e.clientX;
              const startWidth = frozenColWidth;
              frozenColResizingRef.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
              const onMove = (mv: MouseEvent) => {
                if (!frozenColResizingRef.current) return;
                const delta = mv.clientX - startX;
                setFrozenColWidth(Math.max(0, startWidth + delta));
              };
              const onUp = () => {
                frozenColResizingRef.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            <div className="frozen-col-resize-handle-pill" aria-hidden />
          </div>
        ))}
        <GridFooter
          isVisible={isFooterVisible}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onCancel={handleCancel}
          onSave={handleSave}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < undoRedoHistory.length - 1}
          impactedMeasuresCount={impactedMeasuresCount}
          showOnlyImpactedKPI={showOnlyImpactedKPI}
          onToggleShowOnlyImpactedKPI={handleToggleShowOnlyImpactedKPI}
        />
    </div>
      
      {/* Cell Note Popover */}
      {editingCell && onAddAdjustmentNote && editingInputRef.current && (
        <CellNotePopover
          key={`${editingCell.rowId}-${editingCell.monthKey}`}
          isOpen={true}
          cellElement={editingInputRef.current.parentElement as HTMLElement || cellRefs.current.get(`${editingCell.rowId}-${editingCell.monthKey}`) || null}
          cellKey={`${editingCell.rowId}-${editingCell.monthKey}`}
          rowId={editingCell.rowId}
          timeKey={editingCell.monthKey as string}
          onAddNote={onAddAdjustmentNote}
          onClose={() => {
            setEditingCell(null);
            editingInputRef.current = null;
          }}
        />
      )}
    </div>
  );
};

export default HierarchicalGrid;

