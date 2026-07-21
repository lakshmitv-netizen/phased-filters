import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GridRow as GridRowType, MeasureData, ParentTotalsRollupMode, RowType } from '../types';
import { extractSearchTerms, separateSearchTerms, matchesNumber } from '../utils/searchUtils';
import { SearchHighlight } from './SearchHighlight';
import { CellDeltaSignIcon } from './CellDeltaSignIcon';
import { LegacySavedLineArrowDownIcon, LegacySavedLineArrowUpIcon } from './gridLegacyValueIcons';
import { useIsGrid264UpdatedExperience } from '../contexts/IndustryContext';
import { CellEditHistoryEntry, editHistoryEntryAffectsCell } from '../types/editHistory';
import FillHandle from './FillHandle';
import MoreNodeSettingsModal from './MoreNodeSettingsModal';
import AddRemoveChildNodesModal from './AddRemoveChildNodesModal';
import ApprovalActionPopover from './ApprovalActionPopover';
import ApprovalStatusChangePopover from './ApprovalStatusChangePopover';
import ScopedNotification from './ScopedNotification';
import { findRowById, isUnderFilterBucketNoMatchSubtree } from '../utils/valuePropagation';
import { ApprovalRequest } from '../types';

/** Tooltip when value cell is read-only after bulk Request Approval submit. */
const PENDING_SUBMISSION_EDIT_TOOLTIP =
  'User cannot edit it since they have submitted it for approval.';

/** Tooltip when plan submitter hovers grid cells while plan is in Submitted review. */
const PLAN_REVIEW_REQUESTER_TOOLTIP =
  'You cannot edit this plan while approval is in progress.';

/** Tooltip when a cell is locked because a filter hides some of its children. */
const FILTER_LOCK_TOOLTIP =
  'Not editable while a filter is applied — edit at the filtered level instead.';

/** True when this cell is pending approval and the current user may not edit the value (requester / non-approver). Approvers on the request and override-unlock still edit. */
function pendingSubmissionLocksPlanningValueCell(
  approval: ApprovalRequest | undefined,
  cellKey: string,
  approverOverrideCellKeys: Set<string> | undefined,
  currentUser: { id: string; name: string },
): boolean {
  if (!approval || approval.status !== 'pending') return false;
  if (approverOverrideCellKeys?.has(cellKey)) return false;
  const selectedApproverNames = approval.approvers?.map(a => a.name) ?? [];
  const requesterNameNorm = (approval.requesterName ?? '').trim().toLowerCase();
  const currentNameNorm = currentUser.name.trim().toLowerCase();
  const legacyIdFromCurrentUser = `user-${currentUser.name.toLowerCase().replace(/\s+/g, '-')}`;
  const isCurrentUserRequester =
    approval.requesterId === currentUser.id ||
    approval.requesterId === legacyIdFromCurrentUser ||
    (requesterNameNorm !== '' && requesterNameNorm === currentNameNorm);
  const isCurrentUserSelectedApprover =
    selectedApproverNames.length > 0
      ? selectedApproverNames.includes(currentUser.name)
      : true;
  const canProvideApprovalDecision = !isCurrentUserRequester && isCurrentUserSelectedApprover;
  return !canProvideApprovalDecision;
}

/** True when the approval request was created by the current user (submitter). */
function isCurrentUserApprovalRequester(
  approval: ApprovalRequest | undefined,
  currentUser: { id: string; name: string },
): boolean {
  if (!approval) return false;
  const requesterNameNorm = (approval.requesterName ?? '').trim().toLowerCase();
  const currentNameNorm = currentUser.name.trim().toLowerCase();
  const legacyIdFromCurrentUser = `user-${currentUser.name.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    approval.requesterId === currentUser.id ||
    approval.requesterId === legacyIdFromCurrentUser ||
    (requesterNameNorm !== '' && requesterNameNorm === currentNameNorm)
  );
}

const APPROVAL_STAMP_SRC = `${import.meta.env.BASE_URL}approval-stamp.svg`;

/** 0–100: share of approvers who approved (plain or with condition). Legacy single-approver: 100% when resolved approved. */
function approvalStampProgressPercent(a: ApprovalRequest): number {
  const list = a.approvers;
  if (list && list.length > 0) {
    const n = list.filter(x => x.status === 'approved' || x.status === 'approvedWithCondition').length;
    return Math.min(100, Math.round((n / list.length) * 100));
  }
  if (a.status === 'approved' || a.status === 'approvedWithCondition') return 100;
  return 0;
}

function shouldShowApprovalStampOnValueCell(a: ApprovalRequest | undefined): a is ApprovalRequest {
  return !!a && a.status !== 'notSubmitted' && a.userInitiated === true;
}

function CellApprovalStampButton({
  cellKey,
  approval,
  onStampMouseEnter,
  onStampMouseLeave,
}: {
  cellKey: string;
  approval: ApprovalRequest;
  onStampMouseEnter: (anchor: HTMLElement) => void;
  onStampMouseLeave: () => void;
}) {
  const pct = approvalStampProgressPercent(approval);
  const dash = `${Math.max(0, Math.min(100, pct))} 100`;
  return (
    <button
      type="button"
      className="cell-approval-stamp-btn"
      aria-label="View approval status"
      title="View approval status"
      onMouseEnter={(e) => {
        e.stopPropagation();
        const td = (e.currentTarget as HTMLElement).closest('td');
        onStampMouseEnter((td ?? e.currentTarget) as HTMLElement);
      }}
      onMouseLeave={(e) => {
        e.stopPropagation();
        onStampMouseLeave();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <svg className="cell-approval-stamp-ring" viewBox="0 0 18 18" aria-hidden width={18} height={18}>
        <g transform="translate(9 9) rotate(-90)">
          <circle
            className="cell-approval-stamp-ring__track"
            r={8}
            cx={0}
            cy={0}
            fill="none"
            strokeWidth={2}
            pathLength={100}
          />
          <circle
            className="cell-approval-stamp-ring__progress"
            r={8}
            cx={0}
            cy={0}
            fill="none"
            strokeWidth={2}
            pathLength={100}
            strokeDasharray={dash}
            strokeLinecap="round"
          />
        </g>
      </svg>
      <img src={APPROVAL_STAMP_SRC} alt="" width={10} height={10} className="cell-approval-stamp-img" />
    </button>
  );
}

import { ConditionalFormattingRule } from '../types/conditionalFormatting';
import { evaluateCellFormatting, getIndicatorIcon, evaluateFormulaExpression, formatFormulaResult, getAccessibleTextColor } from '../utils/conditionalFormattingUtils';
import { evaluateCellInput } from '../utils/cellFormula';
import { useCurrentUser } from '../contexts/UserContext';
/** Walk parentId chain until measure; names from immediate parent → root (excludes measure). */
function getDimensionAncestorNamesForFlatSortHint(
  row: GridRowType,
  measureRootId: string,
  data: MeasureData[],
): string[] {
  const names: string[] = [];
  let pid: string | null | undefined = row.parentId;
  while (pid && pid !== measureRootId) {
    const ancestor = findRowById(pid, data);
    if (ancestor) {
      names.push(ancestor.name);
      pid = ancestor.parentId;
      continue;
    }
    break;
  }
  return names;
}

const APPROVAL_STATUS_NOTE_RE = /^(Not Submitted|Pending|Approved|Approved with Condition|Rejected)\s*→\s*(Not Submitted|Pending|Approved|Approved with Condition|Rejected)(:|$)/;
const isApprovalStatusTransitionNote = (note?: string): boolean => !!note && APPROVAL_STATUS_NOTE_RE.test(note.trim());
// Icon imports - using public folder paths (SVGs with built-in colored backgrounds)
const AccountIcon = `${import.meta.env.BASE_URL}new_account.svg`;
/** Account row when column filters hide some descendant rows (e.g. categories); funnel baked into asset. */
const AccountFilteredDescendantsIcon = `${import.meta.env.BASE_URL}account-filtered-descendants.svg`;
const CategoryIcon = `${import.meta.env.BASE_URL}category.svg`;
/** Category row when some product children are hidden by filters; funnel baked into asset. */
const CategoryFilteredDescendantsIcon = `${import.meta.env.BASE_URL}category-filtered-descendants.svg`;
const ProductIcon = `${import.meta.env.BASE_URL}product.svg`;
const MeasureRowIcon = `${import.meta.env.BASE_URL}measure-row.svg`;
/** Measure row when expanded but every descendant is hidden by filters (badge baked into asset). */
const MeasureRowFilteredDescendantsIcon = `${import.meta.env.BASE_URL}measure-row-filtered-descendants.svg`;
import { getDimensionGlyph, getDimensionLevelName, isDeepDimensionType } from '../data/dimensionSchemes';
import '../styles/components/Grid.css';
import '../styles/components/CellEditInfoPopover.css';

interface GridRowProps {
  row: GridRowType;
  level: number;
  isExpanded: boolean;
  expandedRows: Set<string>;
  onToggleExpand: (id: string) => void;
  formatValue: (value: number, isQuantity?: boolean, measureName?: string) => string;
  onCellChange?: (
    rowId: string,
    monthKey: keyof GridRowType['values'],
    newValue: number,
    note?: string,
    skipUndoOperation?: boolean,
    disaggregateVisibleChildrenOnly?: boolean,
  ) => void;
  visibleTimeKeys?: (keyof GridRowType['values'])[];
  focusedCell?: { rowId: string; monthKey: keyof GridRowType['values'] } | null;
  onCellFocus?: (cell: { rowId: string; monthKey: keyof GridRowType['values'] } | null) => void;
  cellRefs?: React.MutableRefObject<Map<string, HTMLTableCellElement>>;
  editedCells?: Map<string, number>; // key: `${rowId}-${monthKey}`, value: originalValue
  impactedCells?: Map<string, number>; // key: `${rowId}-${monthKey}`, value: originalValue
  savedEditedCells?: Map<string, string>; // key: `${rowId}-${monthKey}`, value: icon color - cells that were edited and saved (show icon only)
  unsavedNotes?: Map<string, string>; // key: `${rowId}-${monthKey}`, value: note text - notes for dirty cells
  savedImpactedCells?: Set<string>; // Set of cellKeys that were impacted but are now saved (to prevent showing old notes/popovers)
  columnWidth?: number; // Column width in pixels for time period columns
  searchTerm?: string; // Search term for highlighting
  onCellEditStateChange?: (isEditing: boolean, rowId: string, monthKey: keyof GridRowType['values']) => void; // Callback when cell edit state changes
  editHistory?: CellEditHistoryEntry[]; // Edit history to check for notes
  onCellFocusWithHistory?: (cellKey: string, cellRect: DOMRect | null, cellValue?: number, isLocked?: boolean, isImpacted?: boolean) => void; // Callback when a cell is focused
  lockedCells?: Set<string>; // Set of locked cell keys that cannot be edited
  onCellContextMenu?: (e: React.MouseEvent, cellKey: string, cellValue: number, isLocked: boolean, isEditable: boolean) => void; // Callback for right-click context menu
  selectedCells?: Set<string>; // Set of selected cell keys
  onCellSelect?: (cellKey: string, event: React.MouseEvent) => void; // Callback when a cell is clicked for selection
  onCellMouseDown?: (cellKey: string, event: React.MouseEvent) => void; // Callback for mouse down (drag selection)
  onCellMouseMove?: (cellKey: string) => void; // Callback for mouse move (drag selection)
  lastSelectedCell?: string | null; // Last selected cell key (for drag handle indicator)
  onFillHandleDragStart?: (cellKey: string) => void; // Callback when fill handle drag starts
  onFillHandleDragMove?: (cellKey: string) => void; // Callback when fill handle is dragged
  onFillHandleDragEnd?: () => void; // Callback when fill handle drag ends
  readonlyMeasureIds?: Set<string>; // Set of measure IDs that are read-only
  isAdjustmentGroupSelected?: boolean; // Whether Adjustment Measures Group is selected
  onMeasureGroupChange?: (groups: Set<string>) => void; // Callback to change measure group selection
  measureGroupContext?: Map<string, string>; // Per-measure group context for shared measures
  onMeasureGroupContextChange?: (measureId: string, groupContext: string) => void; // Callback to change per-measure group context
  sharedMeasureIds?: string[]; // IDs of measures that exist in multiple groups
  onExpandMeasure?: (measureId: string) => void; // Callback to expand all rows within a measure
  onCollapseMeasure?: (measureId: string) => void; // Callback to collapse all rows within a measure
  readCells?: string[]; // Array of cell keys marked as read (will not show note indicators)
  isNewlyAdded?: boolean; // Whether this measure was newly added (for animation effect)
  onAddChildNode?: (rowId: string) => void; // Callback to add a child node
  onRemoveChildNode?: (rowId: string) => void; // Callback to remove a child node
  onFilterChildrenNodes?: (rowId: string) => void; // Callback to filter children nodes
  onApplyQuickFilter?: (rowId: string, criteria: import('./AddRemoveChildNodesModal').QuickFilterCriteria | null) => void; // Callback to apply quick filter
  quickFilter?: import('./AddRemoveChildNodesModal').QuickFilterCriteria | null; // Current quick filter for this row
  getQuickFilter?: (rowId: string) => import('./AddRemoveChildNodesModal').QuickFilterCriteria | null; // Function to get quick filter for a row
  onEditNode?: (rowId: string) => void; // Callback to edit a node
  onShowCharts?: (row: GridRowType) => void; // Open the Charts panel focused on this row
  onDeleteNode?: (rowId: string) => void; // Callback to delete a node
  onReparentNode?: (rowId: string, parentNodeId: string | null) => void; // Callback to reparent a node
  data?: MeasureData[]; // Full data structure for hierarchy operations
  /** Widest dimension tree (e.g. merged from `originalData`) so account-row icons can detect children hidden only in the visible tree. */
  rollupValueSourceData?: MeasureData[];
  frozenColumns?: Array<{ id: string; name: string }>; // Array of frozen columns to display
  showAdditionalFrozenColumns?: boolean; // Whether to show additional frozen columns divided in first cell
  subColumns?: Array<{ id: string; name: string; formula?: string; isCustom?: boolean; showOnGrid?: boolean }>; // Sub-columns to render within each time cell
  frozenColWidth?: number; // Dynamic width for the frozen first column (set by resize handle)
  approvalRequests?: Map<string, ApprovalRequest>; // Map of approval requests keyed by cellKey
  onApprovalAction?: (approvalId: string, action: 'submitForApproval' | 'approved' | 'approvedWithCondition' | 'rejected', comment: string, approverRole?: string) => void;
  onApprovalStatusChangeViewHistory?: (cellKey: string) => void; // Callback to view edit history for approval status change
  onApprovalStatusChangeMarkAsRead?: (cellKey: string) => void; // Callback to mark approval status change as read
  conditionalFormattingRules?: ConditionalFormattingRule[];
  /** When true, active background "greater than" rules define a shared color scale by threshold. */
  conditionalFormattingColorScaleMerge?: boolean;
  measureId?: string; // The parent measure this row belongs to
  allCellValues?: Map<string, number[]>; // timeKey -> all values for that key across all visible rows (for topN etc)
  allCellValuesByType?: Map<string, Map<string, number[]>>; // timeKey -> rowType -> values[] (for same-dimension concentration)
  isDesignSystemRulesEnabled?: boolean;
  /** fullHierarchy: sum all children. visibleOnly: sum only children kept visible by filters. columnFilterBuckets: legacy bucket layout when data includes bucket rows. */
  parentTotalsRollupMode?: ParentTotalsRollupMode;
  /** Bucket mode: when false, no-match branch is scratched out, omitted from parent totals, and not editable. */
  propagateIntoNoMatchRows?: boolean;
  /** Initial value for measure-row “limit split to visible children” when a cell edit opens. */
  measureEditDisaggregateVisibleChildrenDefault?: boolean;
  /** Precomputed row IDs in every "Does not match" subtree (bucket + nested rows); preferred over walking parentId. */
  excludedNoMatchSubtreeRowIds?: Set<string>;
  /** Plan record is Submitted — value cells show pending styling, no edits, not-allowed cursor + tooltip. */
  planReviewGridLock?: boolean;
  /** Plan submitter view: add read-only stripe texture to all plan-locked value cells. */
  planReviewRequesterStripes?: boolean;
  /** Approver/manager: show pencil in review; pencil opens edit popover with Manager override in More Actions. */
  approverMayOpenReviewPopover?: boolean;
  /** Cell keys where an approver used Override — may edit despite plan review lock. */
  approverOverrideCellKeys?: Set<string>;
  /** One-shot: open editor for this row/column after override (consumed by GridRow). */
  pendingApproverEdit?: { rowId: string; monthKey: string } | null;
  onPendingApproverEditConsumed?: () => void;
  /** Approver unlock during plan review (Manager override from pencil popover). */
  onManagerOverrideForCell?: (cellKey: string) => void;
  /** Flattened sort: show ancestor hierarchy under dimension names (from parentId + data) */
  flattenedSortShowAncestorPath?: boolean;
  /** From HierarchicalGrid: row IDs with column-filter hidden descendants (stable when row copies drop the flag). */
  descendantColumnFilterRowIds?: Set<string>;
  /** Root measure only: child count on full `gridData` (used when filters hide every visible child but measure stays expanded). */
  fullMeasureChildCount?: number;
}

/** Secondary line: full hierarchy path when sort is flattened (ellipsis + hover popover) */
const FlattenedSortHierarchyPath: React.FC<{ fullPath: string }> = ({ fullPath }) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, maxW: 360 });

  const clearLeaveTimer = () => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  const updateCoords = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({
      top: r.bottom + 4,
      left: r.left,
      maxW: Math.min(420, Math.max(160, window.innerWidth - r.left - 16)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updateCoords();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, updateCoords]);

  useEffect(() => () => clearLeaveTimer(), []);

  return (
    <>
      <div
        ref={anchorRef}
        className="grid-flattened-hierarchy-path"
        aria-label={`Hierarchy path: ${fullPath}`}
        onMouseEnter={() => {
          clearLeaveTimer();
          updateCoords();
          setOpen(true);
        }}
        onMouseLeave={() => {
          clearLeaveTimer();
          leaveTimerRef.current = setTimeout(() => setOpen(false), 150);
        }}
      >
        <span className="grid-flattened-hierarchy-path-text">{fullPath}</span>
        <span className="grid-flattened-hierarchy-path-info" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M12 16v-5M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      </div>
      {open &&
        createPortal(
          <div
            role="tooltip"
            className="grid-flattened-hierarchy-popover"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              maxWidth: coords.maxW,
              zIndex: 10020,
            }}
            onMouseEnter={() => {
              clearLeaveTimer();
              setOpen(true);
            }}
            onMouseLeave={() => {
              clearLeaveTimer();
              leaveTimerRef.current = setTimeout(() => setOpen(false), 150);
            }}
          >
            {fullPath}
          </div>,
          document.body
        )}
    </>
  );
};

/** Deterministic pseudo-random [0,1) from a string seed */
const seededRandom = (seed: string): number => {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
  }
  return h / 4294967296;
};

/** YoY/MoM diverging bars + target-achievement bullet — green 60 / red 40 + yellow 75 (SLDS palette). */
const DATA_BAR_POSITIVE_FILL = 'var(--slds-g-color-palette-green-60)';
const DATA_BAR_NEGATIVE_FILL = 'var(--slds-g-color-palette-red-40)';
const DATA_BAR_AMBER_FILL = 'var(--slds-g-color-palette-yellow-75)';

const getTargetAchievementPct = (rowId: string, colKey: string): number => {
  const rand = seededRandom(`${rowId}-${colKey}-targetAchievement`);
  if (rand < 0.18) {
    return Math.round(4 + rand * 170); // roughly 4% to low-30s
  }
  if (rand > 0.78) {
    return Math.round(100 + (rand - 0.78) / 0.22 * 35); // 100% to 135%
  }
  return Math.round(55 + ((rand - 0.18) / 0.60) * 45); // 55% to 100%
};

const getTargetValue = (actualValue: number, rowId: string, colKey: string): number => {
  const achievementPct = getTargetAchievementPct(rowId, colKey);
  if (actualValue === 0 || achievementPct <= 0) return 0;
  return actualValue / (achievementPct / 100);
};

const getSubColumnValue = (
  subColId: string,
  actualValue: number,
  rowId: string,
  colKey: string,
  formatValue: (v: number) => string,
  formula?: string
): string => {
  if (formula && formula.trim()) {
    const evaluated = evaluateFormulaExpression(formula, actualValue, [actualValue], rowId, colKey);
    if (evaluated !== null) return formatValue(evaluated);
    return 'Invalid';
  }
  const rand = seededRandom(`${rowId}-${colKey}-${subColId}`);
  const targetValue = getTargetValue(actualValue, rowId, colKey);
  switch (subColId) {
    case 'yoy': {
      const pct = Math.round((rand * 40) - 20);
      return `${pct >= 0 ? '+' : ''}${pct}%`;
    }
    case 'mom': {
      const pct = Math.round((rand * 20) - 10);
      return `${pct >= 0 ? '+' : ''}${pct}%`;
    }
    case 'target':
      return formatValue(targetValue);
    case 'targetAchievement': {
      const pct = getTargetAchievementPct(rowId, colKey);
      return `${pct}%`;
    }
    case 'planned':
      return formatValue(actualValue * (0.85 + rand * 0.2));
    case 'achieved':
      return formatValue(actualValue);
    case 'variance': {
      const planned = actualValue * (0.85 + rand * 0.2);
      const variance = ((actualValue - planned) / Math.abs(planned)) * 100;
      const pct = Math.round(variance);
      return `${pct >= 0 ? '+' : ''}${pct}%`;
    }
    case 'attribute':
      return ['New Launch', 'Deprecated', 'Active', 'Discontinued', 'Legacy', 'Promoted'][Math.floor(rand * 6)];
    default:
      return formatValue(actualValue);
  }
};

const getSubColumnColor = (subColId: string, value: string): string => {
  if (subColId === 'yoy' || subColId === 'mom' || subColId === 'variance') {
    return value.startsWith('-') ? DATA_BAR_NEGATIVE_FILL : DATA_BAR_POSITIVE_FILL;
  }
  if (subColId === 'targetAchievement') {
    const numeric = Number.parseFloat(value);
    if (numeric > 100) return DATA_BAR_AMBER_FILL;
    if (numeric >= 80) return DATA_BAR_POSITIVE_FILL;
    if (numeric >= 60) return DATA_BAR_AMBER_FILL;
    return DATA_BAR_NEGATIVE_FILL;
  }
  return 'inherit';
};

// Get numeric percentage value for YoY/MoM (for data bar visualization)
const getSubColumnNumericValue = (
  subColId: string,
  actualValue: number,
  rowId: string,
  colKey: string
): number => {
  const rand = seededRandom(`${rowId}-${colKey}-${subColId}`);
  if (subColId === 'yoy') {
    return Math.round((rand * 40) - 20); // Range: -20% to +20%
  }
  if (subColId === 'mom') {
    return Math.round((rand * 20) - 10); // Range: -10% to +10%
  }
  if (subColId === 'variance') {
    const planned = actualValue * (0.85 + rand * 0.2);
    const variance = ((actualValue - planned) / Math.abs(planned)) * 100;
    return Math.round(variance); // Range: typically -15% to +15%
  }
  if (subColId === 'targetAchievement') {
    return getTargetAchievementPct(rowId, colKey);
  }
  return 0;
};

export type SubColumnUnit = 'currency' | 'percent' | 'text';

/** Unit of a sub-column, used to decide chart axis grouping / value formatting. */
export const getSubColumnUnit = (subColId: string, formula?: string): SubColumnUnit => {
  if (formula && formula.trim()) return 'currency';
  switch (subColId) {
    case 'yoy':
    case 'mom':
    case 'variance':
    case 'targetAchievement':
      return 'percent';
    case 'attribute':
    case 'approvalStatus':
      return 'text';
    default:
      return 'currency';
  }
};

/**
 * Numeric value for a sub-column at a given cell — mirrors the grid's rendered
 * value (see getSubColumnValue) so charts stay in sync with the table.
 * Returns null for non-numeric sub-columns (attribute / approval status).
 */
export const getSubColumnNumeric = (
  subColId: string,
  actualValue: number,
  rowId: string,
  colKey: string,
  formula?: string
): number | null => {
  if (formula && formula.trim()) {
    return evaluateFormulaExpression(formula, actualValue, [actualValue], rowId, colKey);
  }
  const rand = seededRandom(`${rowId}-${colKey}-${subColId}`);
  switch (subColId) {
    case 'yoy':
      return Math.round((rand * 40) - 20);
    case 'mom':
      return Math.round((rand * 20) - 10);
    case 'variance': {
      const planned = actualValue * (0.85 + rand * 0.2);
      return Math.round(((actualValue - planned) / Math.abs(planned)) * 100);
    }
    case 'target':
      return getTargetValue(actualValue, rowId, colKey);
    case 'targetAchievement':
      return getTargetAchievementPct(rowId, colKey);
    case 'planned':
      return actualValue * (0.85 + rand * 0.2);
    case 'achieved':
      return actualValue;
    case 'attribute':
    case 'approvalStatus':
      return null;
    default:
      return actualValue;
  }
};

// Render diverging data bar for YoY/MoM values
const renderDataBar = (value: number, maxRange: number): React.ReactNode => {
  const isPositive = value >= 0;
  const barPct = Math.min((Math.abs(value) / maxRange) * 50, 50);
  const labelColor = isPositive ? DATA_BAR_POSITIVE_FILL : DATA_BAR_NEGATIVE_FILL;
  const barFill = labelColor;

  return React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 10px',
    },
  },
    React.createElement('div', {
      style: {
        flex: '1 1 0px',
        height: '8px',
        background: 'var(--slds-g-color-surface-container-2)',
        borderRadius: '20px',
        position: 'relative',
        overflow: 'hidden',
      },
    },
      // Center line
      React.createElement('div', {
        style: {
          position: 'absolute',
          left: '50%',
          top: '-1px',
          width: '2px',
          height: 'calc(100% + 2px)',
          background: 'var(--slds-g-color-neutral-base-60)',
          transform: 'translateX(-50%)',
          zIndex: 3,
        },
      }),
      // Colored fill — flat edge on center side, rounded on outer side
      React.createElement('div', {
        style: {
          position: 'absolute',
          top: '0',
          height: '100%',
          left: isPositive ? '50%' : `${50 - barPct}%`,
          width: `${barPct}%`,
          background: barFill,
          borderRadius: isPositive ? '0 20px 20px 0' : '20px 0 0 20px',
          zIndex: 2,
          minWidth: value !== 0 ? '2px' : '0',
        },
      }),
    ),
    React.createElement('span', {
      className: 'data-bar-pct',
      style: {
        fontSize: '13px',
        fontWeight: 600,
        color: labelColor,
        whiteSpace: 'nowrap',
        minWidth: '38px',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: '18px',
        flexShrink: 0,
      },
    }, `${value >= 0 ? '+' : ''}${value}%`),
  );
};

const renderBulletGraph = (value: number): React.ReactNode => {
  const clampedPct = Math.max(0, Math.min(value, 140));
  const fillPct = Math.min(clampedPct, 100);
  const overTargetPct = Math.max(0, Math.min(clampedPct - 100, 40));
  const labelColor =
    value >= 72 ? DATA_BAR_POSITIVE_FILL : value >= 45 ? DATA_BAR_AMBER_FILL : DATA_BAR_NEGATIVE_FILL;
  const baseFill = labelColor;

  return React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 10px',
    },
  },
    React.createElement('div', {
      style: {
        flex: '1 1 0px',
        height: '10px',
        background:
          'linear-gradient(90deg, var(--slds-g-color-error-container-1) 0% 45%, var(--slds-g-color-warning-container-1) 45% 72%, var(--slds-g-color-success-container-1) 72% 100%)',
        borderRadius: '999px',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid color-mix(in srgb, var(--slds-g-color-neutral-base-50) 18%, transparent)',
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-surface-white) 32%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-surface-white) 18%, transparent)',
      },
    },
      React.createElement('div', {
        style: {
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '45%',
          width: '1px',
          background: `color-mix(in srgb, ${DATA_BAR_AMBER_FILL} 35%, transparent)`,
          transform: 'translateX(-0.5px)',
        },
      }),
      React.createElement('div', {
        style: {
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '72%',
          width: '1px',
          background: `color-mix(in srgb, ${DATA_BAR_POSITIVE_FILL} 35%, transparent)`,
          transform: 'translateX(-0.5px)',
        },
      }),
      React.createElement('div', {
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: `${fillPct}%`,
          background: baseFill,
          borderRadius: '999px',
        },
      }),
      overTargetPct > 0 ? React.createElement('div', {
        style: {
          position: 'absolute',
          top: 0,
          left: '100%',
          height: '100%',
          width: `${overTargetPct}%`,
          background: DATA_BAR_POSITIVE_FILL,
          borderRadius: '0 999px 999px 0',
        },
      }) : null,
      React.createElement('div', {
        style: {
          position: 'absolute',
          left: '100%',
          top: '-2px',
          width: '2px',
          height: '14px',
          background: 'var(--slds-g-color-neutral-base-50)',
          transform: 'translateX(-1px)',
          opacity: 0.9,
        },
      }),
    ),
    React.createElement('span', {
      className: 'data-bar-pct',
      style: {
        fontSize: '13px',
        fontWeight: 600,
        color: labelColor,
        whiteSpace: 'nowrap',
        minWidth: '46px',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: '18px',
        flexShrink: 0,
      },
    }, `${Math.round(value)}%`),
  );
};

const DIMENSION_LEVEL_LABELS: Record<string, string> = {
  account: 'Account',
  category: 'Category',
  product: 'Product',
};

const getFrozenColumnValue = (colId: string, rowId: string, row?: GridRowType, visibleTimeKeys?: (keyof GridRowType['values'])[]): string => {
  const rand = seededRandom(`${rowId}-${colId}`);
  
  switch (colId) {
    case 'annotatedLevel':
      // Legacy account/category/product map first, then any built-in multi-level scheme
      // (deep / Acme) so deeper grids don't render a blank annotated level.
      return row ? (DIMENSION_LEVEL_LABELS[row.type] ?? getDimensionLevelName(row.type) ?? '') : '';
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
      // Use the first visible time key to get target achievement
      if (row && visibleTimeKeys && visibleTimeKeys.length > 0) {
        const firstTimeKey = visibleTimeKeys[0];
        const achievementPct = getTargetAchievementPct(rowId, String(firstTimeKey));
        
        if (achievementPct >= 100) {
          return 'Excellent';
        } else if (achievementPct >= 80) {
          return 'Good';
        } else {
          return 'Needs Attention';
        }
      }
      // Fallback to random if no row/time keys available
      return ['Good', 'Excellent', 'Needs Attention'][Math.floor(rand * 3)];
    }
    default:
      return '';
  }
};

/** Returns initials + a stable background color from the user's name */
const getUserAvatar = (name: string): { initials: string; bg: string; fg: string } => {
  const parts = name.trim().split(' ');
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
  const palette = [
    { bg: 'var(--slds-g-color-accent-1)', fg: 'var(--slds-g-color-on-accent-1)' },
    { bg: 'var(--slds-g-color-info-1)', fg: 'var(--slds-g-color-on-accent-1)' },
    { bg: 'var(--slds-g-color-success-1)', fg: 'var(--slds-g-color-on-accent-1)' },
    { bg: 'var(--slds-g-color-warning-1)', fg: 'var(--slds-g-color-on-accent-1)' },
    { bg: 'var(--slds-g-color-error-2)', fg: 'var(--slds-g-color-on-accent-1)' },
    { bg: 'var(--slds-g-color-neutral-base-50)', fg: 'var(--slds-g-color-on-accent-1)' },
    { bg: 'var(--slds-g-color-error-1)', fg: 'var(--slds-g-color-on-accent-1)' },
    { bg: 'var(--slds-g-color-brand-base-50)', fg: 'var(--slds-g-color-on-accent-1)' },
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) >>> 0;
  const { bg, fg } = palette[h % palette.length];
  return { initials, bg, fg };
};

// Render sparkline for trend column
const renderSparkline = (values: number[], width: number = 100, height: number = 24): React.ReactNode => {
  if (!values || values.length === 0) return null;
  
  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  // Find min and max for scaling
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1; // Avoid division by zero
  
  // Generate path points
  const points = values.map((val, idx) => {
    const x = padding + (idx / (values.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((val - min) / range) * chartHeight;
    return `${x},${y}`;
  });
  
  const pathData = `M ${points.join(' L ')}`;
  
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path
        d={pathData}
        fill="none"
        stroke="var(--slds-g-color-accent-1)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// Component for trend cell with tooltip
const TrendCell: React.FC<{ row: GridRowType }> = ({ row }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0, showAbove: true, nubbinLeft: 24 });
  const cellRef = useRef<HTMLDivElement>(null);

  const timeKeys: (keyof GridRowType['values'])[] = [
    'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
    'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026'
  ];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const values = timeKeys
    .map(key => Number(row.values?.[key] ?? 0))
    .filter(val => !isNaN(val));

  // Calculate which months are up or down
  const getTrendSummary = (): { up: string[]; down: string[]; flat: string[] } => {
    const up: string[] = [];
    const down: string[] = [];
    const flat: string[] = [];

    for (let i = 1; i < values.length; i++) {
      const prevVal = values[i - 1];
      const currVal = values[i];
      const monthLabel = monthLabels[i];
      
      if (currVal > prevVal) {
        up.push(monthLabel);
      } else if (currVal < prevVal) {
        down.push(monthLabel);
      } else {
        flat.push(monthLabel);
      }
    }

    return { up, down, flat };
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovered(true);
    if (cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      const tooltipWidth = 300; // Match the width set in style
      const tooltipHeight = 180; // Approximate height
      const gap = 8; // Gap between tooltip and cell
      
      // Calculate center of cell horizontally
      const cellCenterX = rect.left + rect.width / 2;
      
      // Position tooltip above the cell by default, centered on cell
      let left = cellCenterX - tooltipWidth / 2;
      let top = rect.top - tooltipHeight - gap;
      let showAbove = true;
      
      // Calculate nubbin position to point at cell center
      let nubbinLeft = cellCenterX - left;
      
      // Adjust if tooltip would go off screen horizontally
      if (left + tooltipWidth > window.innerWidth - 8) {
        left = window.innerWidth - tooltipWidth - 8;
        nubbinLeft = cellCenterX - left;
      }
      if (left < 8) {
        left = 8;
        nubbinLeft = cellCenterX - left;
      }
      
      // Clamp nubbin to reasonable bounds (between 20px and tooltipWidth - 20px)
      nubbinLeft = Math.max(20, Math.min(tooltipWidth - 20, nubbinLeft));
      
      // Adjust if tooltip would go off screen vertically (above)
      if (top < 8) {
        top = rect.bottom + gap; // Show below instead
        showAbove = false;
      }
      
      setTooltipPosition({ top, left, showAbove, nubbinLeft });
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  if (values.length === 0) return null;

  const trendSummary = getTrendSummary();

  return (
    <>
      <div
        ref={cellRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: '4px', cursor: 'help' }}
      >
        {renderSparkline(values, 100, 24)}
      </div>
      {isHovered && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            width: '300px',
            padding: '16px',
            background: 'var(--color-surface-white)',
            border: '1px solid var(--color-border-ui-strong)',
            borderRadius: '8px',
            boxShadow: 'var(--slds-g-shadow-3)',
            zIndex: 99999,
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            pointerEvents: 'auto',
          }}
          onMouseEnter={(e) => { e.stopPropagation(); setIsHovered(true); }}
          onMouseLeave={handleMouseLeave}
        >
          {/* Nubbin pointing up toward cell */}
          {tooltipPosition.showAbove && (
            <div style={{
              position: 'absolute',
              bottom: '-8px',
              left: `${tooltipPosition.nubbinLeft || 24}px`,
              width: '14px',
              height: '14px',
              background: 'var(--color-surface-white)',
              borderRight: '1px solid var(--color-border-ui-strong)',
              borderBottom: '1px solid var(--color-border-ui-strong)',
              transform: 'rotate(45deg)',
              boxShadow: 'var(--slds-g-shadow-1)',
              pointerEvents: 'none',
            }} />
          )}
          {/* Nubbin pointing down toward cell (tooltip shown below) */}
          {!tooltipPosition.showAbove && (
            <div style={{
              position: 'absolute',
              top: '-8px',
              left: `${tooltipPosition.nubbinLeft || 24}px`,
              width: '14px',
              height: '14px',
              background: 'var(--color-surface-white)',
              borderLeft: '1px solid var(--color-border-ui-strong)',
              borderTop: '1px solid var(--color-border-ui-strong)',
              transform: 'rotate(45deg)',
              boxShadow: 'var(--slds-g-shadow-1)',
              pointerEvents: 'none',
            }} />
          )}

          {/* Close button */}
          <button
            onClick={() => setIsHovered(false)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              width: '20px',
              height: '20px',
              border: 'none',
              background: 'transparent',
              color: 'var(--slds-g-color-neutral-base-60)',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
            </svg>
          </button>

          {/* Header */}
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-on-surface-strong)', marginBottom: '10px', paddingRight: '20px', lineHeight: '1.3' }}>
            Trend Summary
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--slds-g-color-surface-container-2)', marginBottom: '10px' }} />

          {/* Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {trendSummary.up.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px' }}>
                <span style={{ color: 'var(--slds-g-color-warning-2)', fontWeight: 700, fontSize: '16px', lineHeight: '1.1', flexShrink: 0 }}>↑</span>
                <div>
                  <span style={{ color: 'var(--color-interactive-border)', fontWeight: 500 }}>Up: </span>
                  <span style={{ fontWeight: 600, color: 'var(--color-on-surface-strong)' }}>{trendSummary.up.join(', ')}</span>
                </div>
              </div>
            )}
            {trendSummary.down.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px' }}>
                <span style={{ color: 'var(--slds-g-color-info-1)', fontWeight: 700, fontSize: '16px', lineHeight: '1.1', flexShrink: 0 }}>↓</span>
                <div>
                  <span style={{ color: 'var(--color-interactive-border)', fontWeight: 500 }}>Down: </span>
                  <span style={{ fontWeight: 600, color: 'var(--color-on-surface-strong)' }}>{trendSummary.down.join(', ')}</span>
                </div>
              </div>
            )}
            {trendSummary.flat.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px' }}>
                <span style={{ color: 'var(--slds-g-color-neutral-base-60)', fontWeight: 700, fontSize: '16px', lineHeight: '1.1', flexShrink: 0 }}>→</span>
                <div>
                  <span style={{ color: 'var(--color-interactive-border)', fontWeight: 500 }}>Flat: </span>
                  <span style={{ fontWeight: 600, color: 'var(--color-on-surface-strong)' }}>{trendSummary.flat.join(', ')}</span>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

const LEVEL_COLOR_MAP: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  Account: {
    color: 'var(--slds-g-color-brand-base-20)',
    bg: 'var(--slds-g-color-brand-base-95)',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
      </svg>
    ),
  },
  Category: {
    color: 'var(--slds-g-color-success-2)',
    bg: 'var(--slds-g-color-success-container-1)',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11">
        <path d="M12 2l-5.5 9h11L12 2zm0 3.84L14.93 10H9.07L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5S15.01 22 17.5 22 22 19.99 22 17.5 19.99 13 17.5 13zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z"/>
      </svg>
    ),
  },
  Product: {
    color: 'var(--slds-g-color-warning-2)',
    bg: 'var(--slds-g-color-warning-container-1)',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11">
        <path d="M20 6h-2.18c.07-.44.18-.86.18-1.3C18 2.55 15.45 1 13 1c-1.36 0-2.7.5-3.73 1.44L8 3.64l-1.27-2.2C5.8.56 4.5 0 3.13 0 1.4 0 0 1.4 0 3.13c0 .96.5 1.87 1.27 2.44L2 6.2V7H1c-.55 0-1 .45-1 1v11c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-.55-.45-1-1-1zM3.13 2c.74 0 1.4.4 1.74 1.06L6 5H3.13C2.5 5 2 4.5 2 3.88 2 2.84 2.84 2 3.13 2zM20 19H4V9h16v10z"/>
      </svg>
    ),
  },
};

/**
 * Small blue info icon with an SLDS-style tooltip, used to note that a row's
 * aggregation includes all children — including ones hidden by the current filters.
 * The tooltip renders via a portal so it isn't clipped by the frozen cell's overflow.
 */
const HiddenChildrenInfo: React.FC<{ text: string }> = ({ text }) => {
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
        color: 'var(--slds-g-color-brand-base-30, #0176d3)',
        outline: 'none',
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
                background: 'inherit',
              }}
            />
          </div>,
          document.body,
        )}
    </span>
  );
};

const renderFrozenCell = (colId: string, value: string, row?: GridRowType): React.ReactNode => {
  if (colId === 'annotatedLevel') {
    if (!value) return null;
    // Multi-level scheme rows (deep / Acme / config) carry a colored glyph — tint the badge
    // with that same color mixed into white (light fill + solid-color text) so each level's
    // badge matches its icon. Legacy account/category/product levels keep their preset colors.
    const glyph = row ? getDimensionGlyph(row.type) : null;
    const cfg = glyph
      ? { color: glyph.bg, bg: `color-mix(in srgb, ${glyph.bg} 14%, #ffffff)`, icon: null }
      : (LEVEL_COLOR_MAP[value] ?? { color: 'var(--slds-g-color-neutral-base-50)', bg: 'var(--slds-g-color-neutral-base-95)', icon: null });
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        background: cfg.bg, color: cfg.color,
        borderRadius: '9999px', padding: '2px 8px 2px 6px',
        fontSize: '11px', fontWeight: 600,
      }}>
        {cfg.icon}
        {value}
      </div>
    );
  }

  if (colId === 'users') {
    const { initials, bg, fg } = getUserAvatar(value);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
        <div style={{
          width: 24, height: 24, borderRadius: '50%', background: bg, color: fg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', fontWeight: 700, flexShrink: 0, letterSpacing: '0.02em',
        }}>{initials}</div>
        <span style={{ fontSize: '12px', color: 'var(--color-on-surface-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
      </div>
    );
  }

  if (colId === 'condition') {
    const cfg: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
      'Excellent': {
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>,
        color: 'var(--slds-g-color-success-2)', bg: 'var(--slds-g-color-success-container-1)',
      },
      'Good': {
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><path d="M20 6L9 17l-5-5"/></svg>,
        color: 'var(--slds-g-color-info-1)', bg: 'var(--slds-g-color-info-container-1)',
      },
      'Needs Attention': {
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 2L1 21h22L12 2zm0 4l7.5 13h-15L12 6zm-1 5v4h2v-4h-2zm0 5v2h2v-2h-2z"/></svg>,
        color: 'var(--slds-g-color-warning-2)', bg: 'var(--slds-g-color-warning-container-1)',
      },
    };
    const c = cfg[value] ?? { icon: null, color: 'var(--slds-g-color-neutral-base-50)', bg: 'var(--slds-g-color-neutral-base-95)' };
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px',
        background: c.bg, color: c.color,
        borderRadius: '9999px', padding: '2px 8px 2px 6px', fontSize: '11px', fontWeight: 600,
      }}>
        {c.icon}
        {value}
      </div>
    );
  }

  if (colId === 'status') {
    const cfg: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
      'Active': {
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="8" height="8"><circle cx="12" cy="12" r="8"/></svg>,
        color: 'var(--slds-g-color-success-2)', bg: 'var(--slds-g-color-success-container-1)',
      },
      'Inactive': {
        icon: <svg viewBox="0 0 24 24" fill="currentColor" width="8" height="8"><circle cx="12" cy="12" r="8"/></svg>,
        color: 'var(--slds-g-color-neutral-base-50)', bg: 'var(--slds-g-color-neutral-base-95)',
      },
    };
    const c = cfg[value] ?? { icon: null, color: 'var(--slds-g-color-neutral-base-50)', bg: 'var(--slds-g-color-neutral-base-95)' };
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px',
        background: c.bg, color: c.color,
        borderRadius: '9999px', padding: '2px 8px 2px 6px', fontSize: '11px', fontWeight: 600,
      }}>
        {c.icon}
        {value}
      </div>
    );
  }

  if (colId === 'trend' && row) {
    return <TrendCell row={row} />;
  }

  return <span style={{ fontSize: '13px', color: 'var(--color-on-surface-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>;
};

const GridRowComponent: React.FC<GridRowProps> = ({
  row,
  level,
  isExpanded,
  expandedRows,
  onToggleExpand,
  formatValue,
  onCellChange,
  visibleTimeKeys,
  focusedCell,
  onCellFocus,
  cellRefs,
  editedCells,
  impactedCells,
  savedEditedCells,
  unsavedNotes,
  savedImpactedCells = new Set<string>(),
  columnWidth = 100,
  searchTerm = '',
  onCellEditStateChange,
  editHistory = [],
  onCellFocusWithHistory,
  lockedCells = new Set<string>(),
  onCellContextMenu,
  selectedCells = new Set(),
  onCellSelect,
  onCellMouseDown,
  onCellMouseMove,
  lastSelectedCell = null,
  onFillHandleDragStart,
  onFillHandleDragMove,
  onFillHandleDragEnd,
  readonlyMeasureIds: _readonlyMeasureIds = new Set<string>(),
  isAdjustmentGroupSelected = false,
  onMeasureGroupChange,
  measureGroupContext = new Map<string, string>(),
  onMeasureGroupContextChange,
  sharedMeasureIds = [],
  onExpandMeasure,
  onCollapseMeasure,
  readCells: _readCells = [],
  isNewlyAdded = false,
  onAddChildNode,
  onRemoveChildNode,
  onFilterChildrenNodes,
  onApplyQuickFilter,
  quickFilter = null,
  getQuickFilter,
  onEditNode,
  onShowCharts,
  onDeleteNode,
  onReparentNode,
  data = [],
  rollupValueSourceData,
  frozenColumns = [],
  showAdditionalFrozenColumns = false,
  subColumns = [],
  frozenColWidth,
  approvalRequests = new Map(),
  onApprovalAction,
  onApprovalStatusChangeViewHistory,
  onApprovalStatusChangeMarkAsRead,
  conditionalFormattingRules,
  conditionalFormattingColorScaleMerge = false,
  measureId,
  allCellValues,
  allCellValuesByType,
  isDesignSystemRulesEnabled = true,
  parentTotalsRollupMode = 'fullHierarchy',
  propagateIntoNoMatchRows = true,
  measureEditDisaggregateVisibleChildrenDefault = false,
  excludedNoMatchSubtreeRowIds: excludedNoMatchSubtreeRowIdsProp,
  planReviewGridLock = false,
  planReviewRequesterStripes = false,
  approverMayOpenReviewPopover = false,
  approverOverrideCellKeys,
  pendingApproverEdit = null,
  onPendingApproverEditConsumed,
  onManagerOverrideForCell,
  flattenedSortShowAncestorPath = false,
  descendantColumnFilterRowIds,
  fullMeasureChildCount,
}) => {
  const isGrid264Ux = useIsGrid264UpdatedExperience();
  const rowA11y = isGrid264Ux ? { role: 'row' as const } : {};
  const rowheaderA11y = isGrid264Ux ? { role: 'rowheader' as const } : {};
  const gridCellA11y = isGrid264Ux ? { role: 'gridcell' as const } : {};
  // Guard: ensure we have valid row structure to prevent crashes when expanding with approval status
  if (!row?.id) {
    return null;
  }
  const rowValues = row.values ?? {};
  const { currentUser } = useCurrentUser();

  const hasDescendantColumnFilterBadge =
    Boolean(row.descendantsExcludedByColumnFilter) || Boolean(descendantColumnFilterRowIds?.has(row.id));

  /** Fewer category branches (or direct children) under this account than in the widest known tree. */
  const accountHasHiddenChildCategoriesVsStructure = React.useMemo(() => {
    if (row.type !== 'account') return false;
    if (parentTotalsRollupMode === 'columnFilterBuckets') return false;
    const structureSource =
      rollupValueSourceData && rollupValueSourceData.length > 0 ? rollupValueSourceData : data;
    if (!structureSource?.length) return false;
    const full = findRowById(row.id, structureSource);
    if (!full?.children?.length) return false;
    const visible = row.children ?? [];
    const fullCategoryChildIds = full.children.filter((c) => c.type === 'category').map((c) => c.id);
    if (fullCategoryChildIds.length > 0) {
      const visibleChildIds = new Set(visible.map((c) => c.id));
      if (fullCategoryChildIds.some((id) => !visibleChildIds.has(id))) return true;
    }
    return full.children.length > visible.length;
  }, [data, parentTotalsRollupMode, rollupValueSourceData, row.children, row.id, row.type]);

  /** Fewer product branches under this category than in the widest known tree. */
  const categoryHasHiddenChildProductsVsStructure = React.useMemo(() => {
    if (row.type !== 'category') return false;
    if (parentTotalsRollupMode === 'columnFilterBuckets') return false;
    const structureSource =
      rollupValueSourceData && rollupValueSourceData.length > 0 ? rollupValueSourceData : data;
    if (!structureSource?.length) return false;
    const full = findRowById(row.id, structureSource);
    if (!full?.children?.length) return false;
    const visible = row.children ?? [];
    const fullProductChildIds = full.children.filter((c) => c.type === 'product').map((c) => c.id);
    if (fullProductChildIds.length > 0) {
      const visibleChildIds = new Set(visible.map((c) => c.id));
      if (fullProductChildIds.some((id) => !visibleChildIds.has(id))) return true;
    }
    return full.children.length > visible.length;
  }, [data, parentTotalsRollupMode, rollupValueSourceData, row.children, row.id, row.type]);

  /**
   * Multi-level (deep / Acme) dimension rows — e.g. acme-region, acme-division, acct-segment.
   * These use dynamic level types (not account/category/product), so the account/category
   * checks above don't apply. Show the orange dot when this row has fewer visible children
   * than the full structure (i.e. a filter hid some descendants).
   */
  const deepDimHasHiddenChildrenVsStructure = React.useMemo(() => {
    if (!isDeepDimensionType(row.type)) return false;
    if (parentTotalsRollupMode === 'columnFilterBuckets') return false;
    const structureSource =
      rollupValueSourceData && rollupValueSourceData.length > 0 ? rollupValueSourceData : data;
    if (!structureSource?.length) return false;
    const full = findRowById(row.id, structureSource);
    if (!full?.children?.length) return false;
    const visible = (row.children ?? []).filter((c) => c.type !== 'filterSummary');
    const fullChildren = full.children.filter((c) => c.type !== 'filterSummary');
    if (fullChildren.length === 0) return false;
    const visibleChildIds = new Set(visible.map((c) => c.id));
    if (fullChildren.some((c) => !visibleChildIds.has(c.id))) return true;
    return fullChildren.length > visible.length;
  }, [data, parentTotalsRollupMode, rollupValueSourceData, row.children, row.id, row.type]);

  /**
   * How many of this row's *immediate* children are currently hidden by filters, compared
   * to the full rollup structure. Works for every dimension level (account/category/product
   * and the deep / Acme levels). Used to annotate the level name with "N children filtered out".
   */
  const hiddenImmediateChildCount = React.useMemo(() => {
    if (parentTotalsRollupMode === 'columnFilterBuckets') return 0;
    // Measure rows: compare the full (unfiltered) top-level child count against what's visible.
    if (row.type === 'measure') {
      if (typeof fullMeasureChildCount !== 'number') return 0;
      const visible = (row.children ?? []).filter((c) => c.type !== 'filterSummary').length;
      return Math.max(fullMeasureChildCount - visible, 0);
    }
    const isDimRow =
      row.type === 'account' ||
      row.type === 'category' ||
      row.type === 'product' ||
      isDeepDimensionType(row.type);
    if (!isDimRow) return 0;
    const structureSource =
      rollupValueSourceData && rollupValueSourceData.length > 0 ? rollupValueSourceData : data;
    if (!structureSource?.length) return 0;
    const full = findRowById(row.id, structureSource);
    if (!full?.children?.length) return 0;
    const fullChildren = full.children.filter((c) => c.type !== 'filterSummary');
    if (fullChildren.length === 0) return 0;
    const visible = (row.children ?? []).filter((c) => c.type !== 'filterSummary');
    const visibleChildIds = new Set(visible.map((c) => c.id));
    const hiddenById = fullChildren.filter((c) => !visibleChildIds.has(c.id)).length;
    return Math.max(hiddenById, fullChildren.length - visible.length, 0);
  }, [data, parentTotalsRollupMode, rollupValueSourceData, row.children, row.id, row.type, fullMeasureChildCount]);

  /**
   * Asif's edit-locking rule: a node is editable only if its ENTIRE subtree is
   * unfiltered. If a filter has hidden a descendant anywhere below this row — at
   * this row's own child boundary or deeper — then this row is an "ancestor of a
   * filtered level" and its value cells become read-only (rendered with the
   * existing striped read-only texture). The deepest filtered node itself (whose
   * own children are all present) stays editable.
   */
  const isAncestorOfFilteredRow = React.useMemo(() => {
    if (parentTotalsRollupMode === 'columnFilterBuckets') return false;
    // This row's own child boundary (covers account/category/product, deep/Acme
    // levels, and measures via fullMeasureChildCount).
    if (hiddenImmediateChildCount > 0) return true;
    const structureSource =
      rollupValueSourceData && rollupValueSourceData.length > 0 ? rollupValueSourceData : data;
    if (!structureSource?.length) return false;
    const descHasHiddenKids = (node: GridRowType): boolean => {
      const full = findRowById(node.id, structureSource);
      const fullKids = (full?.children ?? []).filter((c) => c.type !== 'filterSummary');
      const visKids = (node.children ?? []).filter((c) => c.type !== 'filterSummary');
      if (fullKids.length > 0) {
        const visIds = new Set(visKids.map((c) => c.id));
        if (fullKids.some((c) => !visIds.has(c.id))) return true;
        if (fullKids.length > visKids.length) return true;
      }
      return visKids.some(descHasHiddenKids);
    };
    const visChildren = (row.children ?? []).filter((c) => c.type !== 'filterSummary');
    return visChildren.some(descHasHiddenKids);
  }, [data, parentTotalsRollupMode, rollupValueSourceData, row, hiddenImmediateChildCount]);

  const noMatchBranchScratchedOut = React.useMemo(() => {
    if (parentTotalsRollupMode !== 'columnFilterBuckets' || propagateIntoNoMatchRows !== false) {
      return false;
    }
    if (excludedNoMatchSubtreeRowIdsProp !== undefined) {
      return excludedNoMatchSubtreeRowIdsProp.has(row.id);
    }
    if (!data?.length) return false;
    return isUnderFilterBucketNoMatchSubtree(row.id, data);
  }, [parentTotalsRollupMode, propagateIntoNoMatchRows, row.id, excludedNoMatchSubtreeRowIdsProp, data]);

  /** Column-filter bucket rows: editable in bucket mode; no-match bucket stays read-only when scratched out. */
  const allowEditPassFailBucketAggregateRow =
    row.type === 'filterSummary' &&
    parentTotalsRollupMode === 'columnFilterBuckets' &&
    (row.filterSummaryRole === 'filterBucketMatch' ||
      (row.filterSummaryRole === 'filterBucketNoMatch' && !noMatchBranchScratchedOut));

  const allowEditFilteredOutAggregateRow =
    row.type === 'filterSummary' &&
    row.filterSummaryRole === 'filteredOut' &&
    parentTotalsRollupMode === 'fullHierarchy';
  const isFilterSummaryReadonly =
    row.type === 'filterSummary' &&
    !allowEditFilteredOutAggregateRow &&
    !allowEditPassFailBucketAggregateRow;
  const isFilteredOutSummaryRow =
    row.type === 'filterSummary' && row.filterSummaryRole === 'filteredOut';
  const isFilterBucketNoMatchMutedRow =
    row.type === 'filterSummary' &&
    row.filterSummaryRole === 'filterBucketNoMatch' &&
    parentTotalsRollupMode === 'visibleOnly';
  const isFilteredOutMutedRow =
    isFilteredOutSummaryRow && parentTotalsRollupMode === 'visibleOnly';
  
  // Convert readCells array to Set for O(1) lookups
  const readCellsSet = React.useMemo(() => {
    return new Set(_readCells || []);
  }, [_readCells, JSON.stringify(_readCells), row.id]);
  
  // Store original children before filtering (for Quick Filter modal)
  const originalChildrenRef = useRef<GridRowType[] | null>(null);
  useEffect(() => {
    // Always try to get original children from data, regardless of current row.children state
    // Get original row from data to access all children (not filtered)
    const originalRow = data.length > 0 ? findRowById(row.id, data) : null;
    if (originalRow?.children) {
      originalChildrenRef.current = originalRow.children;
    } else if (row.children && row.children.length > 0 && !originalChildrenRef.current) {
      // Fallback to current children if original not found and we don't have stored children yet
      originalChildrenRef.current = row.children;
    }
  }, [row.id, data, row.children?.length, quickFilter]);
  
  const hasChildren = row.children && row.children.length > 0;
  /** Chevron when the visible tree has no rows but the measure still has rows in `gridData` (all filtered out). */
  const hasExpandChevron =
    row.type === 'measure'
      ? hasChildren || (typeof fullMeasureChildCount === 'number' && fullMeasureChildCount > 0)
      : hasChildren;

  const flattenedDimensionAncestorNames = React.useMemo(() => {
    if (!flattenedSortShowAncestorPath) return [];
    if (row.type !== 'account' && row.type !== 'category' && row.type !== 'product') return [];
    if (!measureId || data.length === 0) return [];
    return getDimensionAncestorNamesForFlatSortHint(row, measureId, data);
  }, [flattenedSortShowAncestorPath, row.type, row.parentId, row.id, measureId, data]);

  const hierarchyPathLine =
    flattenedDimensionAncestorNames.length > 0 ? flattenedDimensionAncestorNames.join(' > ') : '';
  const showFlattenedHierarchyPath =
    flattenedSortShowAncestorPath &&
    hierarchyPathLine &&
    (row.type === 'account' || row.type === 'category' || row.type === 'product');
  
  // Check if this is a leaf node (no children)
  const isLeafNode = !hasChildren;
  
  // Show expand/collapse options on any parent row (a row with children), so the
  // Expand All / Collapse All actions are available on every parent, not just the topmost.
  const showExpandCollapseOptions = hasChildren && !isLeafNode;
  
  // Helper function to collect all descendant IDs recursively
  const collectAllDescendantIds = (rows: GridRowType[]): string[] => {
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
  const [editingCell, setEditingCell] = useState<{ monthKey: keyof GridRowType['values'] } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [adjustmentNote, setAdjustmentNote] = useState<string>('');
  const [, setEditPopoverTab] = useState<'edit' | 'actions'>('edit');
  const [moreAction, setMoreAction] = useState<string>('');
  const [provideApprovalDecision, setProvideApprovalDecision] = useState<'approved' | 'rejected' | 'approvedWithCondition'>('approved');
  const [approvalActionNote, setApprovalActionNote] = useState<string>('');
  /** Cell key while approver opened pencil during plan review and must pick Manager override to edit. */
  const [planReviewPencilSessionCellKey, setPlanReviewPencilSessionCellKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const adjustmentNoteInputRef = useRef<HTMLTextAreaElement>(null);
  const savedByEnterRef = useRef<boolean>(false);
  const isMovingToNoteInputRef = useRef<boolean>(false); // Track if we're intentionally moving focus to note input
  const isInteractingWithPopoverControlRef = useRef<boolean>(false); // Prevent blur-save when using popover controls
  const shiftKeyPressedRef = useRef<boolean>(false); // Track if Shift key is pressed during selection
  // Type-to-edit: when a selected cell entered edit mode by the user typing a character,
  // place the caret at the end (type-over) instead of selecting all text.
  const typeOverEditRef = useRef<boolean>(false);
  // After committing via Tab/Enter, move selection to the adjacent cell (so the
  // next keystroke type-overs it). Set just before commit; consumed by the
  // post-commit refocus in handleSaveCell.
  const pendingNavRef = useRef<'left' | 'right' | 'down' | null>(null);
  const [hoveredCell, setHoveredCell] = useState<keyof GridRowType['values'] | null>(null);
  const [focusedCellKey, setFocusedCellKey] = useState<string | null>(null);
  // Instant cursor-following hint shown when hovering a cell that is locked
  // because a filter hides some of its children (native title is too slow).
  const [filterLockHint, setFilterLockHint] = useState<{ x: number; y: number } | null>(null);
  const [showReadonlyWarning, setShowReadonlyWarning] = useState(false);
  const [warningPopoverPosition, setWarningPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const warningIconRef = useRef<HTMLButtonElement>(null);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const [showMeasureMenu, setShowMeasureMenu] = useState(false);
  const [measureMenuPosition, setMeasureMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const measureMenuRef = useRef<HTMLButtonElement>(null);
  const [showDimensionMenu, setShowDimensionMenu] = useState(false);
  const [dimensionMenuPosition, setDimensionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const dimensionMenuRef = useRef<HTMLButtonElement>(null);
  const [showMoreNodeSettingsModal, setShowMoreNodeSettingsModal] = useState(false);
  const [showAddRemoveChildNodesModal, setShowAddRemoveChildNodesModal] = useState(false);
  const [approvalPopoverCell, setApprovalPopoverCell] = useState<string | null>(null);
  const approvalPopoverCellRef = useRef<HTMLElement | null>(null);
  const [approvalStatusChangePopover, setApprovalStatusChangePopover] = useState<{cellKey: string; position: { top: number; left: number }} | null>(null);
  const approvalStatusChangePopoverRef = useRef<HTMLElement | null>(null);
  const approvalStatusChangeHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMouseOverPopoverRef = useRef<boolean>(false);
  const popoverCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /** Opens `ApprovalStatusChangePopover` anchored to a cell (value column stamp or `<td>`). */
  const openApprovalStatusForCellAnchor = useCallback((cellKeyForPopover: string, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const popoverWidth = 320;
    const popoverHeight = 220;
    let leftPos = rect.left;
    if (leftPos + popoverWidth > window.innerWidth - 20) {
      leftPos = Math.max(10, window.innerWidth - popoverWidth - 20);
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const topPos =
      spaceBelow < popoverHeight + 20 ? rect.top - popoverHeight - 10 : rect.bottom + 4;
    if (approvalStatusChangeHoverTimeoutRef.current) {
      clearTimeout(approvalStatusChangeHoverTimeoutRef.current);
      approvalStatusChangeHoverTimeoutRef.current = null;
    }
    if (popoverCloseTimeoutRef.current) {
      clearTimeout(popoverCloseTimeoutRef.current);
      popoverCloseTimeoutRef.current = null;
    }
    setApprovalStatusChangePopover({ cellKey: cellKeyForPopover, position: { top: topPos, left: leftPos } });
    approvalStatusChangePopoverRef.current = anchor;
  }, []);

  /** Value-cell stamp: open on hover (same delay as approval pill), not on click. */
  const handleApprovalStampHoverEnter = useCallback(
    (cellKeyForPopover: string, anchor: HTMLElement) => {
      if (popoverCloseTimeoutRef.current) {
        clearTimeout(popoverCloseTimeoutRef.current);
        popoverCloseTimeoutRef.current = null;
      }
      if (approvalStatusChangeHoverTimeoutRef.current) {
        clearTimeout(approvalStatusChangeHoverTimeoutRef.current);
        approvalStatusChangeHoverTimeoutRef.current = null;
      }
      approvalStatusChangeHoverTimeoutRef.current = setTimeout(() => {
        approvalStatusChangeHoverTimeoutRef.current = null;
        openApprovalStatusForCellAnchor(cellKeyForPopover, anchor);
      }, 120);
    },
    [openApprovalStatusForCellAnchor],
  );

  const handleApprovalStampHoverLeave = useCallback(
    (cellKeyForPopover: string) => {
      if (approvalStatusChangeHoverTimeoutRef.current) {
        clearTimeout(approvalStatusChangeHoverTimeoutRef.current);
        approvalStatusChangeHoverTimeoutRef.current = null;
      }
      if (approvalStatusChangePopover?.cellKey === cellKeyForPopover) {
        if (popoverCloseTimeoutRef.current) {
          clearTimeout(popoverCloseTimeoutRef.current);
        }
        popoverCloseTimeoutRef.current = setTimeout(() => {
          if (!isMouseOverPopoverRef.current) {
            setApprovalStatusChangePopover(null);
          }
        }, 150);
      }
    },
    [approvalStatusChangePopover],
  );

  // Cleanup tooltip/hover timeouts on unmount
  useEffect(() => {
    return () => {
      if (approvalStatusChangeHoverTimeoutRef.current) {
        clearTimeout(approvalStatusChangeHoverTimeoutRef.current);
      }
      if (popoverCloseTimeoutRef.current) {
        clearTimeout(popoverCloseTimeoutRef.current);
      }
    };
  }, []);

  // Update popover position when showing
  useEffect(() => {
    if (showReadonlyWarning && warningIconRef.current) {
      const rect = warningIconRef.current.getBoundingClientRect();
      setWarningPopoverPosition({
        top: rect.bottom + 8,
        left: rect.left
      });
    }
  }, [showReadonlyWarning]);
  
  // Close popover when clicking outside
  useEffect(() => {
    if (!showReadonlyWarning) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.readonly-warning-popover') && !warningIconRef.current?.contains(target)) {
        setShowReadonlyWarning(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showReadonlyWarning]);

  // Update measure menu position when showing
  useEffect(() => {
    if (showMeasureMenu && measureMenuRef.current) {
      const rect = measureMenuRef.current.getBoundingClientRect();
      setMeasureMenuPosition({
        top: rect.bottom + 8,
        left: rect.left
      });
    }
  }, [showMeasureMenu]);

  // Close measure menu when clicking outside
  useEffect(() => {
    if (!showMeasureMenu) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.measure-menu-dropdown') && !measureMenuRef.current?.contains(target)) {
        setShowMeasureMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMeasureMenu]);

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
  
  // Convert savedImpactedCells Set to array so React can detect changes
  // Use state to force re-render when savedImpactedCells changes
  const [savedImpactedCellsArray, setSavedImpactedCellsArray] = useState<string[]>([]);
  
  // Update array whenever savedImpactedCells Set changes
  // Convert Set to string for dependency tracking - React will detect string changes
  useEffect(() => {
    if (savedImpactedCells) {
      const newArray = Array.from(savedImpactedCells);
      // Always update to ensure we have the latest values
      setSavedImpactedCellsArray(newArray);
    } else {
      setSavedImpactedCellsArray([]);
    }
    // Use Set size and a string representation to detect changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedImpactedCells ? Array.from(savedImpactedCells).sort().join('|') : '']);

  // Track Shift key state globally to prevent popover when Shift is pressed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftKeyPressedRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        // Small delay to allow focus event to check the state before resetting
        setTimeout(() => {
          shiftKeyPressedRef.current = false;
        }, 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Use visibleTimeKeys if provided, otherwise show all time keys
  const timeKeys: (keyof GridRowType['values'])[] = visibleTimeKeys || [
    'year',
    'q1',
    'q2',
    'q3',
    'q4',
    'jan2026',
    'feb2026',
    'mar2026',
    'apr2026',
    'may2026',
    'jun2026',
    'jul2026',
    'aug2026',
    'sep2026',
    'oct2026',
    'nov2026',
    'dec2026',
  ];

  // State to track dropdown position
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  
  // Use ref for onCellEditStateChange to avoid effect dependency issues
  const onCellEditStateChangeRef = useRef(onCellEditStateChange);
  useEffect(() => {
    onCellEditStateChangeRef.current = onCellEditStateChange;
  }, [onCellEditStateChange]);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      if (typeOverEditRef.current) {
        // Type-to-edit: keep the just-typed character and put caret at the end
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
        typeOverEditRef.current = false;
      } else {
        inputRef.current.select();
      }
      // Calculate dropdown position immediately
      const updatePosition = () => {
        if (inputRef.current) {
          const rect = inputRef.current.getBoundingClientRect();
          setDropdownPosition({
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX,
            width: Math.max(rect.width, 380)
          });
        }
      };
      // Update position immediately and after a short delay to ensure DOM is ready
      updatePosition();
      setTimeout(updatePosition, 0);
      setTimeout(updatePosition, 10);
      // Notify parent that editing started when input is focused
      if (onCellEditStateChangeRef.current) {
        onCellEditStateChangeRef.current(true, row.id, editingCell.monthKey);
      }
    } else {
      setDropdownPosition(null);
    }
  }, [editingCell, row.id]);

  // Update dropdown position on scroll/resize when editing
  useEffect(() => {
    if (!editingCell || !inputRef.current) return;
    
    const updatePosition = () => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
          width: Math.max(rect.width, 380)
        });
      }
    };
    
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [editingCell]);

  const enterEditModeForMonthKey = useCallback(
    (
      monthKey: keyof GridRowType['values'],
      options?: { fromApproverPencilInReview?: boolean; seedChar?: string }
    ) => {
      if (!onCellChange) return;
      if (isFilterSummaryReadonly) return;
      // Reset any stale post-commit navigation from a previous edit
      pendingNavRef.current = null;
      const cellKeyInner = `${row.id}-${monthKey}`;
      const approvalGate = (approvalRequests ?? new Map<string, ApprovalRequest>()).get(cellKeyInner);
      const pendingLocksOthers =
        pendingSubmissionLocksPlanningValueCell(
          approvalGate,
          cellKeyInner,
          approverOverrideCellKeys,
          currentUser,
        ) && !isCurrentUserApprovalRequester(approvalGate, currentUser);
      if (pendingLocksOthers) {
        return;
      }
      if (planReviewGridLock && !approverOverrideCellKeys?.has(cellKeyInner)) {
        if (!(options?.fromApproverPencilInReview && approverMayOpenReviewPopover)) return;
      }
      if (row.groupContext === 'Adjustment Measures') return;
      if (onCellFocusWithHistory) onCellFocusWithHistory('', null);
      if (options?.fromApproverPencilInReview) {
        setPlanReviewPencilSessionCellKey(cellKeyInner);
      } else {
        setPlanReviewPencilSessionCellKey(null);
      }
      setEditingCell({ monthKey });
      if (options?.seedChar != null) {
        // Type-to-edit: replace existing value with the character the user typed
        typeOverEditRef.current = true;
        setEditValue(options.seedChar);
      } else {
        setEditValue(row.values[monthKey].toString());
      }
      const unsavedNote = unsavedNotes?.get(cellKeyInner) || '';
      const approvalForCell = (approvalRequests ?? new Map<string, ApprovalRequest>()).get(cellKeyInner);
      const savedNoteFromHistory =
        editHistory.find(
          (entry) =>
            editHistoryEntryAffectsCell(entry, cellKeyInner, row.id, String(monthKey)) &&
            !!entry.note &&
            entry.note.trim() !== '' &&
            !isApprovalStatusTransitionNote(entry.note)
        )?.note ?? '';
      const approvalNote = approvalForCell?.requesterNote ?? '';
      setAdjustmentNote(unsavedNote || approvalNote || savedNoteFromHistory);
      setEditPopoverTab('edit');
      setMoreAction('');
      setProvideApprovalDecision('approved');
      setApprovalActionNote('');
      setTimeout(() => {
        if (onCellEditStateChange) onCellEditStateChange(true, row.id, monthKey);
      }, 0);
    },
    [
      onCellChange,
      isFilterSummaryReadonly,
      planReviewGridLock,
      approverOverrideCellKeys,
      approverMayOpenReviewPopover,
      row.id,
      row.values,
      row.groupContext,
      onCellFocusWithHistory,
      unsavedNotes,
      approvalRequests,
      editHistory,
      onCellEditStateChange,
      currentUser,
    ]
  );

  useEffect(() => {
    if (!planReviewPencilSessionCellKey) return;
    if (approverOverrideCellKeys?.has(planReviewPencilSessionCellKey)) {
      setPlanReviewPencilSessionCellKey(null);
    }
  }, [planReviewPencilSessionCellKey, approverOverrideCellKeys]);

  useLayoutEffect(() => {
    if (!pendingApproverEdit || !onPendingApproverEditConsumed) return;
    if (pendingApproverEdit.rowId !== row.id) return;
    const mk = pendingApproverEdit.monthKey as keyof GridRowType['values'];
    const ck = `${row.id}-${mk}`;
    if (!approverOverrideCellKeys?.has(ck)) {
      onPendingApproverEditConsumed();
      return;
    }
    enterEditModeForMonthKey(mk);
    onPendingApproverEditConsumed();
  }, [
    pendingApproverEdit,
    row.id,
    approverOverrideCellKeys,
    onPendingApproverEditConsumed,
    enterEditModeForMonthKey,
  ]);

  const handleCellValueClick = (
    monthKey: keyof GridRowType['values'],
    e: React.MouseEvent,
    _openedFromPencilIcon: boolean = false
  ) => {
    const isModifierKey = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!isModifierKey) {
      e.stopPropagation();
    }
    if (isModifierKey) {
      return;
    }
    if (editingCell?.monthKey === monthKey) {
      return;
    }
    console.log('[GridRow] Cell value clicked (entering edit mode):', { rowId: row.id, rowType: row.type, monthKey });
    if (!onCellChange) {
      console.log('[GridRow] No onCellChange handler, returning');
      return;
    }
    if (isFilterSummaryReadonly) {
      return;
    }
    const ck = `${row.id}-${monthKey}`;
    const appr = (approvalRequests ?? new Map<string, ApprovalRequest>()).get(ck);
    if (
      pendingSubmissionLocksPlanningValueCell(appr, ck, approverOverrideCellKeys, currentUser) &&
      !isCurrentUserApprovalRequester(appr, currentUser)
    ) {
      return;
    }
    enterEditModeForMonthKey(monthKey);
  };

  const handleCellEnterKey = (monthKey: keyof GridRowType['values']) => {
    console.log('[GridRow] Enter key pressed (entering edit mode):', { rowId: row.id, rowType: row.type, monthKey });
    if (!onCellChange) {
      console.log('[GridRow] No onCellChange handler, returning');
      return;
    }
    const ck = `${row.id}-${monthKey}`;
    const appr = (approvalRequests ?? new Map<string, ApprovalRequest>()).get(ck);
    if (
      pendingSubmissionLocksPlanningValueCell(appr, ck, approverOverrideCellKeys, currentUser) &&
      !isCurrentUserApprovalRequester(appr, currentUser)
    ) {
      return;
    }
    enterEditModeForMonthKey(monthKey);
  };

  const handleCellBlur = (monthKey: keyof GridRowType['values'], inputValue: string) => {
    if (!onCellChange) return;
    
    // If we're intentionally moving focus to note input, don't process blur
    if (isMovingToNoteInputRef.current || isInteractingWithPopoverControlRef.current) {
      return;
    }
    
    // Use requestAnimationFrame to ensure mousedown events have processed first
    // This handles the case where user clicks on the Notes textarea
    requestAnimationFrame(() => {
      // Check flag again after event loop
      if (isMovingToNoteInputRef.current || isInteractingWithPopoverControlRef.current) {
        return;
      }
      processBlur(monthKey, inputValue);
    });
  };
  
  const processBlur = (monthKey: keyof GridRowType['values'], inputValue: string) => {
    if (!onCellChange) return;
    
    // If this was already saved by Enter key, skip to avoid double-saving
    if (savedByEnterRef.current) {
      savedByEnterRef.current = false;
      // Still clear editing state
      if (editingCell?.monthKey === monthKey) {
        setEditingCell(null);
        setEditValue('');
        setAdjustmentNote('');
        setPlanReviewPencilSessionCellKey(null);
        // Notify parent that editing ended
        if (onCellEditStateChange) {
          onCellEditStateChange(false, row.id, monthKey);
        }
      }
      // Refocus the cell after editing is complete, unless focus already moved to
      // another grid cell (e.g. Tab/Enter navigated to the next cell after commit).
      setTimeout(() => {
        const activeElement = document.activeElement;
        const isOnAnotherCell = activeElement && (
          activeElement.classList.contains('grid-cell') ||
          activeElement.closest('.grid-cell')
        );
        if (!isOnAnotherCell && cellRefs && onCellFocus) {
          const cellKey = `${row.id}-${monthKey}`;
          const cellElement = cellRefs.current.get(cellKey);
          if (cellElement && document.activeElement !== cellElement) {
            cellElement.focus();
            onCellFocus({ rowId: row.id, monthKey });
          }
        }
      }, 0);
      return;
    }

    const currentRowIdForPending = row.id;
    const cellKeyPendingRequester = `${currentRowIdForPending}-${monthKey}`;
    const approvalPendingRequester = approvalRequests?.get(cellKeyPendingRequester);
    if (approvalPendingRequester?.status === 'pending' && isCurrentUserApprovalRequester(approvalPendingRequester, currentUser)) {
      if (moreAction === 'withdraw-approval') {
        return;
      }
      if (editingCell?.monthKey === monthKey) {
        setEditingCell(null);
        setEditValue('');
        setAdjustmentNote('');
        setPlanReviewPencilSessionCellKey(null);
        setMoreAction('');
        setApprovalActionNote('');
        if (onCellEditStateChange) {
          onCellEditStateChange(false, currentRowIdForPending, monthKey);
        }
      }
      setTimeout(() => {
        if (cellRefs && onCellFocus) {
          const ck = `${currentRowIdForPending}-${monthKey}`;
          const cellElement = cellRefs.current.get(ck);
          if (cellElement && document.activeElement !== cellElement) {
            cellElement.focus();
            onCellFocus({ rowId: currentRowIdForPending, monthKey });
          }
        }
      }, 0);
      return;
    }
    
    // Capture row.id at blur time to avoid stale closure issues
    const currentRowId = row.id;
    const cellKeyAwait = `${currentRowId}-${monthKey}`;
    const awaitingPlanReviewUnlock =
      planReviewPencilSessionCellKey === cellKeyAwait &&
      planReviewGridLock &&
      !approverOverrideCellKeys?.has(cellKeyAwait);
    if (awaitingPlanReviewUnlock) {
      if (editingCell?.monthKey === monthKey) {
        setEditingCell(null);
        setEditValue('');
        setAdjustmentNote('');
        setPlanReviewPencilSessionCellKey(null);
        if (onCellEditStateChange) {
          onCellEditStateChange(false, currentRowId, monthKey);
        }
      }
      setTimeout(() => {
        const activeElement = document.activeElement;
        const isClickingAnotherCell = activeElement && (
          activeElement.classList.contains('grid-cell') ||
          activeElement.closest('.grid-cell')
        );
        if (!isClickingAnotherCell && cellRefs && onCellFocus) {
          const cellElement = cellRefs.current.get(cellKeyAwait);
          if (cellElement && document.activeElement !== cellElement) {
            cellElement.focus();
            onCellFocus({ rowId: currentRowId, monthKey });
          }
        }
      }, 0);
      return;
    }
    
    // Evaluate input: plain number, "+N%/-N%" delta, or "=" arithmetic formula.
    let roundedValue: number;
    const currentValue = row.values[monthKey] || 0;
    const evalResult = evaluateCellInput(inputValue, currentValue);
    if (evalResult.value !== null && !isNaN(evalResult.value)) {
      roundedValue = Math.round(evalResult.value * 100) / 100;
    } else if (evalResult.isFormula && evalResult.error) {
      console.log('[GridRow] Invalid formula in handleCellBlur:', inputValue);
      alert('Invalid formula. Please check your formula and try again.');
      // Exit editing mode but don't save
      if (editingCell?.monthKey === monthKey) {
        setEditingCell(null);
        setEditValue('');
        setAdjustmentNote('');
        setPlanReviewPencilSessionCellKey(null);
        if (onCellEditStateChange) {
          onCellEditStateChange(false, currentRowId, monthKey);
        }
      }
      return;
    } else {
      console.log('[GridRow] ✗ Cannot save from blur - invalid number:', { inputValue });
      // Exit editing mode but don't save
      if (editingCell?.monthKey === monthKey) {
        setEditingCell(null);
        setEditValue('');
        setAdjustmentNote('');
        setPlanReviewPencilSessionCellKey(null);
        if (onCellEditStateChange) {
          onCellEditStateChange(false, currentRowId, monthKey);
        }
      }
      return;
    }
    
    // Read value directly from the input element, not from state (which might be stale)
    console.error('[GridRow] ========================================');
    console.error('[GridRow] ✓ Calling onCellChange from blur:', { rowId: currentRowId, monthKey, value: roundedValue, editingCell: editingCell?.monthKey, hasOnCellChange: !!onCellChange });
    // Always save - don't compare with row.values[monthKey] as row prop might be stale
    // The parent component will handle deduplication if needed
    // Pass note to onCellChange so it can be saved with edit history
    const noteToSave = adjustmentNote.trim() || undefined;
    const measureDisaggVisOnly = row.type === 'measure' && measureEditDisaggregateVisibleChildrenDefault;
    onCellChange(currentRowId, monthKey, roundedValue, noteToSave, undefined, measureDisaggVisOnly);

      // Apply optional approval action selected in "Other Actions"
      if (onApprovalAction) {
        const approvalId = `approval-${currentRowId}-${monthKey}`;
        const cellKeyBlur = `${currentRowId}-${monthKey}`;
        const approvalBlur = approvalRequests?.get(cellKeyBlur);
        const actingApproverRoleBlur =
          approvalBlur?.approvers?.find(
            (a) => a.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase()
          )?.role;
        if (moreAction === 'provide-approval' || moreAction === 'provide-approval-decision') {
          const actionMap: Record<typeof provideApprovalDecision, 'approved' | 'rejected' | 'approvedWithCondition'> = {
            approved: 'approved',
            rejected: 'rejected',
            approvedWithCondition: 'approvedWithCondition',
          };
          onApprovalAction(
            approvalId,
            actionMap[provideApprovalDecision],
            approvalActionNote.trim() || noteToSave || '',
            actingApproverRoleBlur
          );
        } else if (moreAction === 'withdraw-approval') {
          const withdrawReason = approvalActionNote.trim();
          const withdrawPayload = withdrawReason ? `__withdraw__::${withdrawReason}` : '__withdraw__';
          onApprovalAction(approvalId, 'submitForApproval', withdrawPayload);
        }
      }

      // Clear note after saving
      if (noteToSave) {
        setAdjustmentNote('');
      }

      console.error('[GridRow] ✓ onCellChange called successfully from blur');
      console.error('[GridRow] ========================================');
    
    // Only clear editing state if this is the currently editing cell
    if (editingCell?.monthKey === monthKey) {
      setEditingCell(null);
      setEditValue('');
      setAdjustmentNote('');
      setPlanReviewPencilSessionCellKey(null);
      // Notify parent that editing ended
      if (onCellEditStateChange) {
        onCellEditStateChange(false, currentRowId, monthKey);
      }
    }
    
    // Refocus the cell after editing is complete, but only if user didn't click on another cell
    setTimeout(() => {
      // Check if the active element is a different cell - if so, don't refocus
      const activeElement = document.activeElement;
      const isClickingAnotherCell = activeElement && (
        activeElement.classList.contains('grid-cell') ||
        activeElement.closest('.grid-cell')
      );
      
      if (!isClickingAnotherCell && cellRefs && onCellFocus) {
        const cellKey = `${currentRowId}-${monthKey}`;
        const cellElement = cellRefs.current.get(cellKey);
        if (cellElement && document.activeElement !== cellElement) {
          cellElement.focus();
          onCellFocus({ rowId: currentRowId, monthKey });
        }
      }
    }, 0);
  };

  // Helper function to save cell changes
  const handleSaveCell = (monthKey: keyof GridRowType['values'], inputValue?: string) => {
    const valueToSave = inputValue || editValue;
    const currentRowId = row.id;
    const cellKeySaveGuard = `${currentRowId}-${monthKey}`;
    if (
      planReviewPencilSessionCellKey === cellKeySaveGuard &&
      planReviewGridLock &&
      !approverOverrideCellKeys?.has(cellKeySaveGuard)
    ) {
      return;
    }

    const approvalSaveGuard = approvalRequests?.get(cellKeySaveGuard);
    if (
      approvalSaveGuard?.status === 'pending' &&
      isCurrentUserApprovalRequester(approvalSaveGuard, currentUser) &&
      moreAction !== 'withdraw-approval'
    ) {
      return;
    }

    // Set flag to prevent blur handler from double-saving
    savedByEnterRef.current = true;

    // Evaluate input: plain number, "+N%/-N%" delta, or "=" arithmetic formula.
    let roundedValue: number;
    const currentValueSave = row.values[monthKey] || 0;
    const evalResultSave = evaluateCellInput(valueToSave, currentValueSave);
    if (evalResultSave.value !== null && !isNaN(evalResultSave.value)) {
      roundedValue = Math.round(evalResultSave.value * 100) / 100;
    } else if (evalResultSave.isFormula && evalResultSave.error) {
      console.log('[GridRow] Invalid formula in handleSaveCell:', valueToSave);
      alert('Invalid formula. Please check your formula and try again.');
      return;
    } else {
      return;
    }

    if (onCellChange) {
      // Pass note to onCellChange so it can be saved with edit history
      const noteToSave = adjustmentNote.trim() || undefined;
      const measureDisaggVisOnlySave = row.type === 'measure' && measureEditDisaggregateVisibleChildrenDefault;
      onCellChange(currentRowId, monthKey, roundedValue, noteToSave, undefined, measureDisaggVisOnlySave);

      // Apply optional approval action selected in "Other Actions"
      if (onApprovalAction) {
        const approvalId = `approval-${currentRowId}-${monthKey}`;
        const cellKeySave = `${currentRowId}-${monthKey}`;
        const approvalSave = approvalRequests?.get(cellKeySave);
        const actingApproverRoleSave =
          approvalSave?.approvers?.find(
            (a) => a.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase()
          )?.role;
        if (moreAction === 'provide-approval' || moreAction === 'provide-approval-decision') {
          const actionMap: Record<typeof provideApprovalDecision, 'approved' | 'rejected' | 'approvedWithCondition'> = {
            approved: 'approved',
            rejected: 'rejected',
            approvedWithCondition: 'approvedWithCondition',
          };
          onApprovalAction(
            approvalId,
            actionMap[provideApprovalDecision],
            approvalActionNote.trim() || noteToSave || '',
            actingApproverRoleSave
          );
        } else if (moreAction === 'withdraw-approval') {
          const withdrawReason = approvalActionNote.trim();
          const withdrawPayload = withdrawReason ? `__withdraw__::${withdrawReason}` : '__withdraw__';
          onApprovalAction(approvalId, 'submitForApproval', withdrawPayload);
        }
      }
      
      // Clear note after saving
      if (noteToSave) {
        setAdjustmentNote('');
      }
    }
    
    // Clear editing state
    if (editingCell?.monthKey === monthKey) {
      setEditingCell(null);
      setEditValue('');
      setAdjustmentNote('');
      setPlanReviewPencilSessionCellKey(null);
      // Notify parent that editing ended
      if (onCellEditStateChange) {
        onCellEditStateChange(false, currentRowId, monthKey);
      }
    }
    
    // After saving: either move selection to the adjacent cell (Tab/Enter), or
    // refocus the just-edited cell (checkmark / other commits).
    setTimeout(() => {
      const navDirection = pendingNavRef.current;
      pendingNavRef.current = null;
      if (cellRefs && onCellFocus) {
        const cellKey = `${currentRowId}-${monthKey}`;
        const cellElement = cellRefs.current.get(cellKey);
        if (cellElement) {
          cellElement.focus();
          onCellFocus({ rowId: currentRowId, monthKey });
          // Tab/Enter after commit: move selection to the adjacent cell by replaying
          // the grid's own keyboard navigation. The cell is now focused (no longer
          // editing), so the grid's key handler will move + select the next cell,
          // ready for type-over. Tab = horizontal (with wrap), ArrowDown = below.
          if (navDirection) {
            const isDown = navDirection === 'down';
            const navEvent = new KeyboardEvent('keydown', {
              key: isDown ? 'ArrowDown' : 'Tab',
              code: isDown ? 'ArrowDown' : 'Tab',
              keyCode: isDown ? 40 : 9,
              which: isDown ? 40 : 9,
              shiftKey: navDirection === 'left',
              bubbles: true,
              cancelable: true,
            });
            cellElement.dispatchEvent(navEvent);
          }
        }
      }
    }, 0);
  };

  // Helper function to cancel cell editing
  const handleCancelCell = (monthKey: keyof GridRowType['values']) => {
    const currentRowId = row.id;
    pendingNavRef.current = null;
    setEditingCell(null);
    setEditValue('');
    setAdjustmentNote('');
    setPlanReviewPencilSessionCellKey(null);
    // Notify parent that editing ended
    if (onCellEditStateChange) {
      onCellEditStateChange(false, currentRowId, monthKey);
    }
    // Refocus the cell after canceling edit
    setTimeout(() => {
      if (cellRefs && onCellFocus) {
        const cellKey = `${currentRowId}-${monthKey}`;
        const cellElement = cellRefs.current.get(cellKey);
        if (cellElement) {
          cellElement.focus();
          onCellFocus({ rowId: currentRowId, monthKey });
        }
      }
    }, 0);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, monthKey: keyof GridRowType['values']) => {
    // Handle ArrowDown to focus adjustment note input
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      // Mark that we're intentionally moving focus
      isMovingToNoteInputRef.current = true;
      // Use requestAnimationFrame to ensure the notes field is mounted and ref is set
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (adjustmentNoteInputRef.current) {
            adjustmentNoteInputRef.current.focus();
            adjustmentNoteInputRef.current.select(); // Select text for better UX
            // Reset flag after focus is set
            setTimeout(() => {
              isMovingToNoteInputRef.current = false;
            }, 100);
          } else {
            // If ref is still not set, try again after a short delay
            setTimeout(() => {
              if (adjustmentNoteInputRef.current) {
                adjustmentNoteInputRef.current.focus();
                adjustmentNoteInputRef.current.select();
                setTimeout(() => {
                  isMovingToNoteInputRef.current = false;
                }, 100);
              } else {
                isMovingToNoteInputRef.current = false;
              }
            }, 100);
          }
        }, 10);
      });
      return;
    }
    
    if (e.key === 'Enter' || e.key === 'Return') {
      e.preventDefault();
      e.stopPropagation();
      const ckEnter = `${row.id}-${monthKey}`;
      const apprEnter = approvalRequests?.get(ckEnter);
      if (
        apprEnter?.status === 'pending' &&
        isCurrentUserApprovalRequester(apprEnter, currentUser) &&
        moreAction !== 'withdraw-approval'
      ) {
        return;
      }
      const inputValue = (e.target as HTMLInputElement).value;
      // After committing, move selection to the cell below (ready for type-over)
      pendingNavRef.current = 'down';
      handleSaveCell(monthKey, inputValue);
    } else if (e.key === 'Tab') {
      // Commit the current cell, then move selection horizontally to the
      // next/previous cell so the next keystroke type-overs it. We take over
      // navigation explicitly because the grid's default tab order is unreliable.
      e.preventDefault();
      e.stopPropagation();
      const ckTab = `${row.id}-${monthKey}`;
      const apprTab = approvalRequests?.get(ckTab);
      if (
        apprTab?.status === 'pending' &&
        isCurrentUserApprovalRequester(apprTab, currentUser) &&
        moreAction !== 'withdraw-approval'
      ) {
        return;
      }
      const inputValueTab = (e.target as HTMLInputElement).value;
      pendingNavRef.current = e.shiftKey ? 'left' : 'right';
      handleSaveCell(monthKey, inputValueTab);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCancelCell(monthKey);
    } else {
      // Stop propagation for other keys to prevent grid navigation while editing
      e.stopPropagation();
    }
  };

  // Helper function to render pencil icon for editable cells on hover/focus/selection
  const renderPencilIcon = (
    monthKey: keyof GridRowType['values'],
    isEditable: boolean,
    openPlanReviewPopoverOnPencil = false,
    openRequesterPendingPopover = false
  ) => {
    if ((!isEditable && !openPlanReviewPopoverOnPencil && !openRequesterPendingPopover) || editingCell) return null;

    const cellKey = `${row.id}-${monthKey}`;
    const isHovered = hoveredCell === monthKey;
    const isFocused = focusedCellKey === cellKey;
    const isSelected = selectedCells.has(cellKey);
    const isMultipleSelected = selectedCells.size > 1;
    const showPencil = isHovered || isFocused || (isSelected && !isMultipleSelected);

    if (!showPencil) return null;

    return (
      <button
        type="button"
        aria-label={
          openPlanReviewPopoverOnPencil
            ? 'Open plan review cell editor'
            : openRequesterPendingPopover
              ? 'Edit pending approval cell'
              : 'Edit cell'
        }
        style={{
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: 0.8,
          cursor: 'pointer',
          zIndex: 1000,
          pointerEvents: 'auto',
          border: 'none',
          padding: 0,
          margin: 0,
          background: 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 0,
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
        onMouseEnter={(e) => {
          e.stopPropagation();
          if (isEditable || openPlanReviewPopoverOnPencil || openRequesterPendingPopover) {
            setHoveredCell(monthKey);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isEditable && !editingCell && onCellChange) {
            handleCellValueClick(monthKey, e, true);
            return;
          }
          if (openRequesterPendingPopover && !editingCell && onCellChange) {
            handleCellValueClick(monthKey, e, true);
            return;
          }
          if (
            openPlanReviewPopoverOnPencil &&
            !editingCell &&
            onCellChange &&
            planReviewGridLock
          ) {
            enterEditModeForMonthKey(monthKey, { fromApproverPencilInReview: true });
          }
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M4.38298 15.4163L8.48876 19.5234C8.67329 19.708 8.95008 19.708 9.13461 19.5234L19.376 9.23257C19.5605 9.04798 19.5605 8.77109 19.376 8.5865L15.3163 4.52553C15.1318 4.34094 14.855 4.34094 14.6705 4.52553L4.38298 14.8164C4.19845 15.001 4.19845 15.2779 4.38298 15.4163V15.4163ZM16.6541 2.6336C16.4695 2.81819 16.4695 3.09507 16.6541 3.27966L20.7137 7.34063C20.8982 7.52522 21.175 7.52522 21.3596 7.34063L22.5129 6.18695C23.251 5.49474 23.251 4.3872 22.5129 3.64884L20.3447 1.47992C19.6065 0.741558 18.4532 0.741558 17.7151 1.47992L16.6541 2.6336V2.6336ZM0.96922 22.2463C0.876955 22.7077 1.29215 23.1231 1.75347 23.0308L6.7819 21.8309C6.96643 21.7848 7.10483 21.6925 7.19709 21.6002L7.28935 21.5079C7.38162 21.4156 7.42775 21.0926 7.24322 20.908L3.09131 16.7547C2.90678 16.5701 2.58385 16.6163 2.49159 16.7086L2.39932 16.8009C2.26093 16.9393 2.21479 17.0777 2.16866 17.2162L0.96922 22.2463V22.2463Z"
            fill="var(--slds-g-color-border-2)"
          />
        </svg>
      </button>
    );
  };

  const renderCellValue = (monthKey: keyof GridRowType['values']) => {
    const cellKey = `${row.id}-${monthKey}`;

    // Filtered-out aggregate rows (visible-only totals): read-only cell chrome
    if (isFilterSummaryReadonly) {
      const isCellLockedFs = lockedCells.has(cellKey);
      const apprFs = (approvalRequests ?? new Map<string, ApprovalRequest>()).get(cellKey);
      const showStampFs = shouldShowApprovalStampOnValueCell(apprFs);
      const cellValueFs = row.values[monthKey];
      const searchTermsFs = searchTerm && searchTerm.trim() ? extractSearchTerms(searchTerm) : [];
      const { otherTerms: otherTermsFs } = separateSearchTerms(searchTermsFs);
      const cellValueMatchesSearchFs = otherTermsFs.length > 0 && matchesNumber(cellValueFs, otherTermsFs);
      const measureNameForQty = measureId ? data.find(m => m.id === measureId)?.name : undefined;
      const isQuantityMeasure =
        (measureNameForQty ?? '').toLowerCase().includes('quantity') ||
        (row.name ?? '').toLowerCase().includes('quantity');

      return (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', width: '100%', minHeight: 'inherit' }}>
            <div className="cell-value-left-icon">
              {showStampFs && apprFs ? (
                <CellApprovalStampButton
                  cellKey={cellKey}
                  approval={apprFs}
                  onStampMouseEnter={(anchor) => handleApprovalStampHoverEnter(cellKey, anchor)}
                  onStampMouseLeave={() => handleApprovalStampHoverLeave(cellKey)}
                />
              ) : isCellLockedFs ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                  <rect x="5" y="11" width="14" height="9" rx="1" fill="var(--slds-g-color-neutral-base-50)"/>
                  <path d="M9 11V7c0-1.66 1.34-3 3-3s3 1.34 3 3v4" stroke="var(--slds-g-color-neutral-base-50)" strokeWidth="2" strokeLinecap="round" fill="none"/>
                </svg>
              ) : (
                <div style={{ width: '18px', height: '18px' }} />
              )}
            </div>
            <span className="cell-value cell-value-readonly" style={{ cursor: 'default' }}>
              {cellValueMatchesSearchFs ? (
                <SearchHighlight
                  text={formatValue(cellValueFs, isQuantityMeasure, row.name)}
                  searchTerms={otherTermsFs}
                />
              ) : (
                formatValue(cellValueFs, isQuantityMeasure, row.name)
              )}
            </span>
          </div>
        </>
      );
    }

    const approvalForEditing = (approvalRequests ?? new Map<string, ApprovalRequest>()).get(cellKey);
    const isApprovalRequestedForEditing = Boolean(approvalForEditing) && approvalForEditing?.status === 'pending';
    const selectedApproverNames = approvalForEditing?.approvers?.map(a => a.name) ?? [];
    const requesterNameNorm = (approvalForEditing?.requesterName ?? '').trim().toLowerCase();
    const currentNameNorm = currentUser.name.trim().toLowerCase();
    const legacyIdFromCurrentUser = `user-${currentUser.name.toLowerCase().replace(/\s+/g, '-')}`;
    const isCurrentUserRequester = Boolean(approvalForEditing) && (
      approvalForEditing.requesterId === currentUser.id ||
      approvalForEditing.requesterId === legacyIdFromCurrentUser ||
      (requesterNameNorm !== '' && requesterNameNorm === currentNameNorm)
    );
    const isCurrentUserSelectedApprover =
      selectedApproverNames.length > 0
        ? selectedApproverNames.includes(currentUser.name)
        : true;
    const canProvideApprovalDecision =
      isApprovalRequestedForEditing && !isCurrentUserRequester && isCurrentUserSelectedApprover;
    const isPlanReviewAwaitingManagerOverride =
      planReviewPencilSessionCellKey === cellKey &&
      !!planReviewGridLock &&
      !(approverOverrideCellKeys?.has(cellKey) ?? false);

    const pendingApprovalLocksValueCell = pendingSubmissionLocksPlanningValueCell(
      approvalForEditing,
      cellKey,
      approverOverrideCellKeys,
      currentUser,
    );

    const showApprovalValueStamp = shouldShowApprovalStampOnValueCell(approvalForEditing);

    const lockIconSvg = (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
        <rect x="5" y="11" width="14" height="9" rx="1" fill="var(--slds-g-color-neutral-base-50)"/>
        <path d="M9 11V7c0-1.66 1.34-3 3-3s3 1.34 3 3v4" stroke="var(--slds-g-color-neutral-base-50)" strokeWidth="2" strokeLinecap="round" fill="none"/>
      </svg>
    );

    const approvalStampButtonEl =
      showApprovalValueStamp && approvalForEditing ? (
        <CellApprovalStampButton
          cellKey={cellKey}
          approval={approvalForEditing}
          onStampMouseEnter={(anchor) => handleApprovalStampHoverEnter(cellKey, anchor)}
          onStampMouseLeave={() => handleApprovalStampHoverLeave(cellKey)}
        />
      ) : null;

    const renderStandardValueLeftIcon = (locked: boolean) => {
      if (approvalStampButtonEl) return approvalStampButtonEl;
      if (locked) return lockIconSvg;
      return <div style={{ width: '18px', height: '18px' }} />;
    };

    if (editingCell?.monthKey === monthKey) {
      return (
        <>
          <input
            ref={inputRef}
            type="text"
            className="cell-input"
            data-cell-key={`${row.id}-${monthKey}`}
            value={editValue}
            onChange={(e) => {
              if (!isApprovalRequestedForEditing && !isPlanReviewAwaitingManagerOverride) {
                setEditValue(e.target.value);
              }
            }}
            onBlur={(e) => handleCellBlur(monthKey, e.target.value)}
            onKeyDown={(e) => handleCellKeyDown(e, monthKey)}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => {
              e.stopPropagation();
            }}
            readOnly={isApprovalRequestedForEditing || isPlanReviewAwaitingManagerOverride}
          />
          {/* Note Dropdown - appears below cell input when editing */}
          {dropdownPosition && createPortal(
            <div
              style={{
                position: 'fixed',
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${Math.max(dropdownPosition.width, 280)}px`,
                backgroundColor: 'var(--color-surface-white)',
                border: '1px solid var(--color-border-ui-strong)',
                borderRadius: '4px',
                boxShadow: 'var(--slds-g-shadow-2)',
                zIndex: 100000,
                fontFamily: 'var(--slds-g-font-family-base, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
                marginTop: '4px',
                overflow: 'visible'
              }}
              onMouseDown={(e) => e.preventDefault()} // Prevent blur
            >
              {/* Nubbin/Arrow */}
              <div style={{
                position: 'absolute',
                top: '-8px',
                left: '20px',
                width: '0',
                height: '0',
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderBottom: '8px solid var(--color-border-ui-strong)'
              }}></div>
              <div style={{
                position: 'absolute',
                top: '-6px',
                left: '21px',
                width: '0',
                height: '0',
                borderLeft: '7px solid transparent',
                borderRight: '7px solid transparent',
                borderBottom: '7px solid var(--color-surface-white)'
              }}></div>
              
              {/* Popover Content */}
              <div style={{
                padding: '12px',
                paddingBottom: '8px'
              }}>
                {/* Value Change Section or Initial Message */}
                {(() => {
                  const oldValue = isApprovalRequestedForEditing
                    ? (approvalForEditing?.oldValue ?? row.values[monthKey])
                    : row.values[monthKey];
                  const previewEval = editValue ? evaluateCellInput(editValue, oldValue) : null;
                  const parsedNewValue = previewEval && previewEval.value !== null && !isNaN(previewEval.value)
                    ? previewEval.value
                    : null;
                  const newValue = isApprovalRequestedForEditing
                    ? (approvalForEditing?.newValue ?? oldValue)
                    : (parsedNewValue !== null ? parsedNewValue : oldValue);
                  const hasValueChanged = isApprovalRequestedForEditing || Math.abs(newValue - oldValue) > 0.01; // Account for floating point precision
                  const hasNotes = adjustmentNote.trim().length > 0;
                  const hasExtraMoreAction = moreAction !== '';
                  const hasActionEdits =
                    hasExtraMoreAction ||
                    approvalActionNote.trim().length > 0 ||
                    ((moreAction === 'provide-approval' || moreAction === 'provide-approval-decision') && provideApprovalDecision !== 'approved');
                  const showButtons = hasValueChanged || hasNotes || hasActionEdits;
                  const hideSaveForPendingRequester =
                    isApprovalRequestedForEditing && isCurrentUserRequester && moreAction !== 'withdraw-approval';
                  
                  if (!hasValueChanged) {
                    // Show initial instruction
                    const isQuantity = row.name?.toLowerCase().includes('quantity') || false;
                    const formattedCurrentValue = formatValue(oldValue, isQuantity, row.name);
                    return (
                      <div style={{
                        fontSize: '13px',
                        color: 'var(--color-on-surface-strong)',
                        fontFamily: 'var(--slds-g-font-family-base, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: showButtons ? 'space-between' : 'flex-start',
                        gap: '8px'
                      }}>
                        <span style={{ fontWeight: 600 }}>{formattedCurrentValue}</span>
                        {showButtons && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: 0,
                            border: '1px solid var(--color-interactive-border)',
                            borderRadius: '20px',
                            overflow: 'hidden',
                            backgroundColor: 'var(--color-surface-white)'
                          }}>
                            {/* Cancel Button (X) */}
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleCancelCell(monthKey);
                              }}
                              style={{
                                width: '24px',
                                height: '24px',
                                minWidth: '24px',
                                minHeight: '24px',
                                border: 'none',
                                borderRadius: '0',
                                backgroundColor: 'var(--color-surface-white)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0',
                                margin: '0',
                                outline: 'none',
                                transition: 'all 0.2s ease',
                                flexShrink: 0,
                                boxSizing: 'border-box'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--slds-g-color-error-container-1)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--color-surface-white)';
                              }}
                              title="Cancel (Esc)"
                              type="button"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M18 6L6 18M6 6l12 12" stroke="var(--color-accent-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>

                            {!hideSaveForPendingRequester && (
                              <>
                            {/* Divider */}
                            <div style={{
                              width: '1px',
                              height: '18px',
                              backgroundColor: 'var(--color-interactive-border)',
                              flexShrink: 0,
                              alignSelf: 'center'
                            }}></div>

                            {/* Save Button (Checkmark) */}
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const inputValue = inputRef.current?.value || editValue;
                                handleSaveCell(monthKey, inputValue);
                              }}
                              style={{
                                width: '24px',
                                height: '24px',
                                minWidth: '24px',
                                minHeight: '24px',
                                border: 'none',
                                borderRadius: '0',
                                backgroundColor: 'var(--color-surface-white)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0',
                                margin: '0',
                                outline: 'none',
                                transition: 'all 0.2s ease',
                                flexShrink: 0,
                                boxSizing: 'border-box',
                                color: 'var(--color-accent-blue)',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                lineHeight: '1'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--slds-g-color-accent-container-1)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--color-surface-white)';
                              }}
                              title="Save (Enter)"
                              type="button"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                                <path d="M20 6L9 17l-5-5" stroke="var(--color-accent-blue)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                              </svg>
                            </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    // Show value change one-liner with buttons inline
                    const delta = newValue - oldValue;
                    const isQuantity = row.name?.toLowerCase().includes('quantity') || false;
                    const deltaFormatted = delta >= 0 ? `+${formatValue(delta, isQuantity, row.name)}` : formatValue(delta, isQuantity, row.name);
                    const deltaColor = delta >= 0 ? 'var(--slds-g-color-warning-2)' : 'var(--color-accent-blue)';
                    
                    return (
                      <div style={{
                        fontSize: '13px',
                        color: 'var(--color-on-surface-strong)',
                        fontFamily: 'var(--slds-g-font-family-base, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                        marginBottom: '4px',
                        justifyContent: 'space-between'
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                          flex: '1',
                          minWidth: 0
                        }}>
                          <span style={{
                            textDecoration: 'line-through',
                            color: 'var(--color-interactive-border)'
                          }}>{formatValue(oldValue, isQuantity, row.name)}</span>
                          <span style={{ color: 'var(--color-interactive-border)' }}>→</span>
                          {previewEval && previewEval.isFormula && (
                            <>
                              <span style={{
                                fontWeight: '600',
                                color: 'var(--color-on-surface-strong)'
                              }}>{previewEval.expression.replace(/^=\s*/, '')}</span>
                              <span style={{ color: 'var(--color-interactive-border)' }}>=</span>
                            </>
                          )}
                          <span style={{
                            fontWeight: '600',
                            color: 'var(--color-on-surface-strong)'
                          }}>{formatValue(newValue, isQuantity, row.name)}</span>
                          <span style={{
                            fontWeight: '600',
                            color: deltaColor,
                            marginLeft: '4px'
                          }}>({deltaFormatted})</span>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          flexShrink: 0,
                          border: '1px solid var(--color-interactive-border)',
                          borderRadius: '20px',
                          overflow: 'hidden',
                          backgroundColor: 'var(--color-surface-white)'
                        }}>
                          {/* Cancel Button (X) */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleCancelCell(monthKey);
                            }}
                            style={{
                              width: '24px',
                              height: '24px',
                              minWidth: '24px',
                              minHeight: '24px',
                              border: 'none',
                              borderRadius: '0',
                              backgroundColor: 'var(--color-surface-white)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '0',
                              margin: '0',
                              outline: 'none',
                              transition: 'all 0.2s ease',
                              flexShrink: 0,
                              boxSizing: 'border-box'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--slds-g-color-error-container-1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-surface-white)';
                            }}
                            title="Cancel (Esc)"
                            type="button"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M18 6L6 18M6 6l12 12" stroke="var(--color-accent-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>

                          {!hideSaveForPendingRequester && (
                            <>
                          {/* Divider */}
                          <div style={{
                            width: '1px',
                            height: '18px',
                            backgroundColor: 'var(--color-interactive-border)',
                            flexShrink: 0,
                            alignSelf: 'center'
                          }}></div>

                          {/* Save Button (Checkmark) */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const inputValue = inputRef.current?.value || editValue;
                              handleSaveCell(monthKey, inputValue);
                            }}
                            style={{
                              width: '24px',
                              height: '24px',
                              minWidth: '24px',
                              minHeight: '24px',
                              border: 'none',
                              borderRadius: '0',
                              backgroundColor: 'var(--color-surface-white)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '0',
                              margin: '0',
                              outline: 'none',
                              transition: 'all 0.2s ease',
                              flexShrink: 0,
                              boxSizing: 'border-box',
                              color: 'var(--color-accent-blue)',
                              fontSize: '14px',
                              fontWeight: 'bold',
                              lineHeight: '1'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--slds-g-color-accent-container-1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-surface-white)';
                            }}
                            title="Save (Enter)"
                            type="button"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                              <path d="M20 6L9 17l-5-5" stroke="var(--color-accent-blue)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                            </svg>
                          </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }
                })()}

                {isApprovalRequestedForEditing &&
                  (adjustmentNote || approvalForEditing?.requesterNote || '').trim() !== '' && (
                  <div style={{ marginTop: '4px', marginBottom: '10px' }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        fontStyle: 'italic',
                        color: 'var(--color-on-surface-strong)',
                        lineHeight: '18px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'var(--slds-g-font-family-base, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
                      }}
                    >
                      {adjustmentNote || approvalForEditing?.requesterNote || ''}
                    </p>
                  </div>
                )}

                {isApprovalRequestedForEditing && isCurrentUserRequester && (
                  <div style={{ marginTop: '6px', marginBottom: '10px' }}>
                    <ScopedNotification
                      variant="inline"
                      message="You can't edit this value because it has been submitted for approval."
                      ctaLabel="Withdraw approval"
                      onCtaMouseDown={(e) => {
                        isInteractingWithPopoverControlRef.current = true;
                        e.stopPropagation();
                      }}
                      onCtaClick={() => {
                        setMoreAction('withdraw-approval');
                        setTimeout(() => {
                          isInteractingWithPopoverControlRef.current = false;
                        }, 150);
                      }}
                    />
                  </div>
                )}

                {!isApprovalRequestedForEditing && (() => {
                  const adjustmentNoteFieldId = `cell-adjustment-note-${row.id}-${monthKey}`;
                  return (
                    <>
                    <div style={{ marginBottom: '8px' }}>
                      <label
                        htmlFor={adjustmentNoteFieldId}
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--color-on-surface-strong)',
                          marginBottom: '4px',
                        }}
                      >
                        Notes
                      </label>
                      <textarea
                        id={adjustmentNoteFieldId}
                        ref={adjustmentNoteInputRef}
                        value={adjustmentNote}
                        onChange={(e) => {
                          e.stopPropagation();
                          setAdjustmentNote(e.target.value);
                        }}
                        placeholder="Enter notes (optional)"
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid var(--color-border-ui-strong)',
                          borderRadius: '4px',
                          fontSize: '13px',
                          fontFamily: 'var(--slds-g-font-family-base, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
                          color: 'var(--color-on-surface-strong)',
                          backgroundColor: 'var(--color-surface-white)',
                          outline: 'none',
                          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                          boxSizing: 'border-box',
                          resize: 'none',
                          lineHeight: '18px',
                          cursor: 'text',
                          marginBottom: '0',
                        }}
                        onFocus={(e) => {
                          e.stopPropagation();
                          e.target.style.borderColor = 'var(--color-accent-blue)';
                          e.target.style.boxShadow = '0 0 0 1px var(--color-accent-blue)';
                          isMovingToNoteInputRef.current = true;
                          setTimeout(() => {
                            isMovingToNoteInputRef.current = false;
                          }, 100);
                        }}
                        onBlur={(e) => {
                          e.stopPropagation();
                          e.target.style.borderColor = 'var(--color-border-ui-strong)';
                          e.target.style.boxShadow = 'none';
                          if (savedByEnterRef.current) {
                            return;
                          }
                          if (isMovingToNoteInputRef.current) {
                            return;
                          }
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          isMovingToNoteInputRef.current = true;
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (adjustmentNoteInputRef.current && document.activeElement !== adjustmentNoteInputRef.current) {
                            adjustmentNoteInputRef.current.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            e.stopPropagation();
                            isMovingToNoteInputRef.current = true;
                            if (inputRef.current) {
                              inputRef.current.focus();
                            }
                            setTimeout(() => {
                              isMovingToNoteInputRef.current = false;
                            }, 100);
                            return;
                          }
                          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                            e.stopPropagation();
                          }
                          if ((e.key === 'Enter' || e.key === 'Return') && !e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            const inputValue = inputRef.current?.value || editValue;
                            handleSaveCell(monthKey, inputValue);
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCancelCell(monthKey);
                          }
                        }}
                      />
                    </div>
                    </>
                  );
                })()}

                {((approverMayOpenReviewPopover &&
                  planReviewGridLock &&
                  !approverOverrideCellKeys?.has(cellKey)) ||
                  (isApprovalRequestedForEditing && canProvideApprovalDecision)) && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '10px 14px',
                    marginTop: '2px',
                    marginBottom: '8px',
                  }}
                >
                  {approverMayOpenReviewPopover &&
                    planReviewGridLock &&
                    !approverOverrideCellKeys?.has(cellKey) && (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          isInteractingWithPopoverControlRef.current = true;
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onManagerOverrideForCell?.(cellKey);
                          setMoreAction('');
                        }}
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: '2px 0',
                          margin: 0,
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--slds-g-color-accent-1)',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textUnderlineOffset: '2px',
                          fontFamily: 'inherit',
                        }}
                      >
                        Manager override
                      </button>
                    )}
                  {isApprovalRequestedForEditing && canProvideApprovalDecision && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        isInteractingWithPopoverControlRef.current = true;
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMoreAction('provide-approval-decision');
                      }}
                      style={{
                        border: 'none',
                        background: 'none',
                        padding: '2px 0',
                        margin: 0,
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--slds-g-color-accent-1)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textUnderlineOffset: '2px',
                        fontFamily: 'inherit',
                      }}
                    >
                      Provide approval decision
                    </button>
                  )}
                </div>
                )}

                {moreAction === 'withdraw-approval' && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    marginBottom: '8px'
                  }}>
                    <label style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--color-on-surface-strong)',
                      marginBottom: '0'
                    }}>
                      Withdrawal note (optional)
                    </label>
                    <textarea
                      value={approvalActionNote}
                      onChange={(e) => setApprovalActionNote(e.target.value)}
                      onMouseDown={(e) => {
                        isInteractingWithPopoverControlRef.current = true;
                        e.stopPropagation();
                      }}
                      onFocus={() => {
                        isInteractingWithPopoverControlRef.current = true;
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          isInteractingWithPopoverControlRef.current = false;
                        }, 120);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Enter withdrawal reason"
                      rows={2}
                      style={{
                        width: '100%',
                        border: '1px solid var(--color-border-ui-strong)',
                        borderRadius: '4px',
                        padding: '8px 10px',
                        fontSize: '13px',
                        color: 'var(--color-on-surface-strong)',
                        backgroundColor: 'var(--color-surface-white)',
                        outline: 'none',
                        boxSizing: 'border-box',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                )}

                {moreAction === 'provide-approval-decision' && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      marginBottom: '8px',
                    }}
                  >
                    <div className="planning-approver-decision-select-wrap" style={{ marginTop: 0 }}>
                    <div
                      className="planning-approver-decision-select-label"
                      id={`grid-cell-approver-decision-label-${row.id}-${String(monthKey)}`}
                    >
                      Your decision
                    </div>
                    <div
                      className="planning-approver-decision-btn-group"
                      role="group"
                      aria-labelledby={`grid-cell-approver-decision-label-${row.id}-${String(monthKey)}`}
                    >
                      <button
                        type="button"
                        className={`planning-approver-decision-btn planning-approver-decision-btn--approve${
                          provideApprovalDecision === 'approved' ? ' planning-approver-decision-btn--selected' : ''
                        }`}
                        aria-pressed={provideApprovalDecision === 'approved'}
                        onMouseDown={(e) => {
                          isInteractingWithPopoverControlRef.current = true;
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProvideApprovalDecision('approved');
                        }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className={`planning-approver-decision-btn planning-approver-decision-btn--conditional${
                          provideApprovalDecision === 'approvedWithCondition'
                            ? ' planning-approver-decision-btn--selected'
                            : ''
                        }`}
                        aria-pressed={provideApprovalDecision === 'approvedWithCondition'}
                        onMouseDown={(e) => {
                          isInteractingWithPopoverControlRef.current = true;
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProvideApprovalDecision('approvedWithCondition');
                        }}
                      >
                        Conditionally Approve
                      </button>
                      <button
                        type="button"
                        className={`planning-approver-decision-btn planning-approver-decision-btn--reject${
                          provideApprovalDecision === 'rejected' ? ' planning-approver-decision-btn--selected' : ''
                        }`}
                        aria-pressed={provideApprovalDecision === 'rejected'}
                        onMouseDown={(e) => {
                          isInteractingWithPopoverControlRef.current = true;
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProvideApprovalDecision('rejected');
                        }}
                      >
                        Reject
                      </button>
                    </div>
                    </div>
                    <label style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--color-on-surface-strong)',
                      marginBottom: '0'
                    }}>
                      Notes
                    </label>
                    <textarea
                      value={approvalActionNote}
                      onChange={(e) => setApprovalActionNote(e.target.value)}
                      onMouseDown={(e) => {
                        isInteractingWithPopoverControlRef.current = true;
                        e.stopPropagation();
                      }}
                      onFocus={() => {
                        isInteractingWithPopoverControlRef.current = true;
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          isInteractingWithPopoverControlRef.current = false;
                        }, 120);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Enter approval note"
                      rows={2}
                      style={{
                        width: '100%',
                        border: '1px solid var(--color-border-ui-strong)',
                        borderRadius: '4px',
                        padding: '8px 10px',
                        fontSize: '13px',
                        color: 'var(--color-on-surface-strong)',
                        backgroundColor: 'var(--color-surface-white)',
                        outline: 'none',
                        boxSizing: 'border-box',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                )}
              </div>
            </div>,
            document.body
          )}
        </>
      );
    }
    
    // Check if this cell has been directly edited or impacted
    // Note: cellKey is already declared at the top of renderCellValue
    
    // Check if cell is locked
    const isCellLocked = lockedCells.has(cellKey);
    const hasApproverOverrideThisCell = approverOverrideCellKeys?.has(cellKey) ?? false;
    const isPlanReviewLockActive = planReviewGridLock === true && !hasApproverOverrideThisCell;
    const isReadonlyMeasure = row.id.includes('measure-ly-order') ||
      row.id.includes('-measure-ly-order') ||
      row.name?.includes('Last Year');
    const isAdjustmentGroupCell = row.groupContext === 'Adjustment Measures';

    const editedOriginalValue = isDesignSystemRulesEnabled ? editedCells?.get(cellKey) : undefined;
    const impactedOriginalValue = isDesignSystemRulesEnabled ? impactedCells?.get(cellKey) : undefined;
    const savedIconColor = isDesignSystemRulesEnabled ? savedEditedCells?.get(cellKey) : undefined;
    const isSavedEdited = savedIconColor !== undefined;
    const currentValue = row.values[monthKey];
    // Check if edited (directly edited by user) - if in map, consider it edited
    const isDirectlyEdited = editedOriginalValue !== undefined;
    // Check if impacted (changed due to editing another cell) - if in map, consider it impacted
    const isImpacted = !isDirectlyEdited && impactedOriginalValue !== undefined;
    
    // IMPORTANT: If a cell is impacted, it should NOT show old edit history indicators (arrow and note triangle)
    // Even if it has edit history from editHistory prop, impacted cells take precedence
    
    // Check if this cell has a note
    // For impacted cells: only show note indicator if there's an unsaved note (new note added after impact)
    // For saved impacted cells (were impacted but now saved): don't show old notes
    // For non-impacted cells: show note indicator if there's a note in editHistory (saved notes)
    // CRITICAL: Check savedImpactedCells FIRST - if cell was impacted and saved, NEVER show note indicator
    // This handles the case where a cell had a note, then got impacted, then was saved
    // Check both cellKey formats to ensure we catch it regardless of format differences
    // IMPORTANT: savedImpactedCells is a Set<string>, check it directly and also use the memoized array
    const cellKeyAlt = `${row.id}-${monthKey}`;
    // Use savedImpactedCellsArray from useMemo (defined at component level) to ensure React detects changes
    // Check if cell is in savedImpactedCells using multiple methods to be absolutely sure
    const wasImpactedAndSaved = savedImpactedCells && (
      savedImpactedCells.has(cellKey) || 
      savedImpactedCells.has(cellKeyAlt) ||
      savedImpactedCellsArray.includes(cellKey) ||
      savedImpactedCellsArray.includes(cellKeyAlt)
    );
    
    // Calculate hasNote - explicitly exclude saved impacted cells and read cells
    // IMPORTANT: If cell is saved impacted OR marked as read, NEVER show note indicator, regardless of other conditions
    let hasNote = false;
    
    // Check if cell is marked as read - use Set for O(1) lookup
    const isCellReadInitial = readCellsSet.has(cellKey);
    
    
    // SCENARIO CHECK: If cell is saved impacted, it means it was impacted (not directly edited) and then saved
    // In this case, suppress ALL notes (even if there was a note in editHistory before it got impacted)
    if (wasImpactedAndSaved || isCellReadInitial) {
      // Cell is saved impacted or marked as read - don't show any notes (even if there's a note in editHistory)
      // This handles: cell had note -> got impacted -> saved -> triangle should NOT show
      // OR: cell had note -> marked as read -> triangle should NOT show
      hasNote = false;
    } else if (isImpacted) {
      // For currently impacted cells (not yet saved): only show note if there's an unsaved note (added after impact)
      hasNote = !!(unsavedNotes?.get(cellKey) && unsavedNotes.get(cellKey)!.trim() !== '');
    } else {
      const approvalNote = approvalForEditing?.requesterNote || approvalForEditing?.approverComment || '';
      if (approvalNote.trim() !== '') {
        hasNote = true;
      }
      // For non-impacted cells: check editHistory for saved notes
      // BUT: Only if cell is NOT saved impacted (double-check to be absolutely sure)
      if (!hasNote && !wasImpactedAndSaved && editHistory && editHistory.length > 0) {
        const matchingEntries = editHistory.filter((entry) =>
          editHistoryEntryAffectsCell(entry, cellKey, row.id, String(monthKey))
        );
        
        hasNote = matchingEntries.some(entry => {
          return !!(entry.note && entry.note.trim() !== '' && !isApprovalStatusTransitionNote(entry.note));
        });
      }
    }
    
    // CRITICAL: Final check - if cell is saved impacted OR currently impacted, NEVER show note indicator
    // This ensures that saved impacted cells (cells that had notes but then got impacted) don't show the triangle
    // Double-check savedImpactedCells one more time to be absolutely sure
    // IMPORTANT: Re-check savedImpactedCells here to catch any updates that might have happened
    const isDefinitelySavedImpacted = savedImpactedCells && (
      savedImpactedCells.has(cellKey) || 
      savedImpactedCells.has(cellKeyAlt) ||
      savedImpactedCellsArray.includes(cellKey) ||
      savedImpactedCellsArray.includes(cellKeyAlt)
    );
    
    // Check if cell is marked as read - use Set for O(1) lookup, check both formats
    const isCellRead = isCellReadInitial || readCellsSet.has(cellKeyAlt);
    
    // CRITICAL: If cell is saved impacted or marked as read, force hasNote to false regardless of what we calculated above
    // This is the final gate to prevent showing the triangle
    // EXTRA SAFETY: Even if hasNote was set to true above, if cell is saved impacted or marked as read, suppress it
    // Note: We already checked isCellReadInitial earlier, but now we check the full isCellRead which includes cellKeyAlt
    const finalHasNoteForRender = (isDefinitelySavedImpacted || isImpacted || isCellRead) ? false : hasNote;
    
    const baseValueEditable =
      onCellChange &&
      !isCellLocked &&
      !isReadonlyMeasure &&
      !isAdjustmentGroupCell &&
      !isFilterSummaryReadonly &&
      !noMatchBranchScratchedOut &&
      !isAncestorOfFilteredRow;
    const isEditable = baseValueEditable && !isPlanReviewLockActive && !pendingApprovalLocksValueCell;
    const planReviewRequesterLockActive =
      planReviewRequesterStripes === true && isPlanReviewLockActive;
    const valueCellCursor = isEditable
      ? 'pointer'
      : pendingApprovalLocksValueCell && baseValueEditable
        ? 'not-allowed'
        : planReviewRequesterLockActive
          ? 'not-allowed'
          : (isPlanReviewLockActive && baseValueEditable)
            ? 'not-allowed'
            : isAncestorOfFilteredRow
              ? 'not-allowed'
              : 'default';
    const valueCellTitle =
      pendingApprovalLocksValueCell && baseValueEditable
        ? PENDING_SUBMISSION_EDIT_TOOLTIP
        : planReviewRequesterLockActive
          ? PLAN_REVIEW_REQUESTER_TOOLTIP
          : isPlanReviewLockActive && baseValueEditable
            ? 'You cannot edit while the grid is in review.'
            : undefined;
    const valueCellHoverProps = valueCellTitle
      ? ({ title: valueCellTitle } as const)
      : {};
    
    // Calculate delta as percentage
    let deltaPercent: number | null = null;
    const originalValue = editedOriginalValue ?? impactedOriginalValue;
    if ((isDirectlyEdited || isImpacted) && originalValue !== undefined && originalValue !== 0) {
      deltaPercent = ((currentValue - originalValue) / originalValue) * 100;
    }

    // Check if cell value matches search for highlighting
    const searchTerms = searchTerm && searchTerm.trim() ? extractSearchTerms(searchTerm) : [];
    const { otherTerms } = separateSearchTerms(searchTerms);
    const valueMatchesSearch = otherTerms.length > 0 && matchesNumber(currentValue, otherTerms);
    
    
    // If cell is marked as read, render as a plain cell - no arrows, no delta badges, no note triangles
    if (isCellRead) {
      return (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <div className="cell-value-left-icon">
              {renderStandardValueLeftIcon(isCellLocked)}
            </div>
            <span 
              className="cell-value"
              {...valueCellHoverProps}
              style={{ cursor: valueCellCursor }}
            >
              {valueMatchesSearch ? (
                <SearchHighlight text={formatValue(currentValue, row.name?.toLowerCase().includes('quantity'), row.name)} searchTerms={otherTerms} />
              ) : (
                formatValue(currentValue, row.name?.toLowerCase().includes('quantity'), row.name)
              )}
            </span>
          </div>
        </>
      );
    }

    if (isDirectlyEdited) {
      const isIncrement = deltaPercent !== null && deltaPercent > 0;
      const deltaColor = isIncrement ? 'var(--slds-g-color-warning-2)' : 'var(--color-accent-blue)';
      const deltaColorLegacy = isIncrement ? '#ff5d2d' : '#2E76E1';

      return (
        <>
          <div className="cell-value-wrapper-edited-container">
            <div className="cell-value-left-icon">
              {renderStandardValueLeftIcon(isCellLocked)}
            </div>
            <div className="cell-value-left-section">
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
                className="cell-value cell-value-edited"
                {...valueCellHoverProps}
                style={{ cursor: valueCellCursor, color: isGrid264Ux ? deltaColor : deltaColorLegacy }}
              >
                {valueMatchesSearch ? (
                  <SearchHighlight text={formatValue(currentValue, row.name?.toLowerCase().includes('quantity'), row.name)} searchTerms={otherTerms} />
                ) : (
                  formatValue(currentValue, row.name?.toLowerCase().includes('quantity'), row.name)
                )}
              </span>
            </div>
          </div>
          {/* Dog ear triangle indicator for cells with notes */}
          {/* Show note indicator if cell has a note (from editHistory for saved notes, or unsavedNotes for unsaved notes) */}
          {finalHasNoteForRender && (
            <div className="cell-note-indicator"></div>
          )}
        </>
      );
    }
    
    // Impacted cell: show impacted state with new value and delta, no old arrow
    if (isImpacted) {
      const isIncrement = deltaPercent !== null && deltaPercent > 0;
      const deltaColor = isIncrement ? 'var(--slds-g-color-warning-2)' : 'var(--color-accent-blue)';
      const deltaColorLegacy = isIncrement ? '#ff5d2d' : '#2E76E1';

      return (
        <>
          <div className="cell-value-wrapper-edited-container">
            <div className="cell-value-left-icon">
              {renderStandardValueLeftIcon(isCellLocked)}
            </div>
            <div className="cell-value-left-section">
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
                className="cell-value cell-value-edited"
                {...valueCellHoverProps}
                style={{ cursor: valueCellCursor, color: isGrid264Ux ? deltaColor : deltaColorLegacy }}
              >
                {valueMatchesSearch ? (
                  <SearchHighlight text={formatValue(currentValue, row.name?.toLowerCase().includes('quantity'), row.name)} searchTerms={otherTerms} />
                ) : (
                  formatValue(currentValue, row.name?.toLowerCase().includes('quantity'), row.name)
                )}
              </span>
            </div>
          </div>
          {/* Don't show old note indicator for impacted cells */}
        </>
      );
    }
    
    // Saved edited cell: show only icon, no badge, normal value positioning
    // Only show if NOT impacted (impacted cells take precedence)
    // IMPORTANT: If a cell is impacted, it should NOT show old edit history indicators (arrow and note triangle)
    // Even if it has edit history from editHistory prop, impacted cells should not show old indicators
    // Also check if this cell was impacted and saved - if so, don't show old notes
    // CRITICAL: Check isImpacted FIRST - if impacted, never show old indicators
    if (isSavedEdited && !isImpacted && !wasImpactedAndSaved) {
      const iconColor = savedIconColor || 'var(--color-accent-blue)'; // Use stored color or default blue
      const isIncrease =
        iconColor === 'var(--slds-g-color-warning-2)' ||
        iconColor === '#ff5d2d' ||
        iconColor === '#FF5D2D';

      return (
        <>
          <div className="cell-value-wrapper-saved-container" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div
              className={
                approvalStampButtonEl || isCellLocked
                  ? 'cell-value-left-icon'
                  : isGrid264Ux
                    ? 'cell-value-left-icon cell-value-left-icon--compact-disc'
                    : `cell-value-left-icon ${!isCellLocked ? (isIncrease ? 'cell-arrow-increase' : 'cell-arrow-decrease') : ''}`
              }
            >
              {approvalStampButtonEl ??
                (isCellLocked ? (
                  lockIconSvg
                ) : isGrid264Ux ? (
                  <CellDeltaSignIcon variant={isIncrease ? 'increase' : 'decrease'} />
                ) : isIncrease ? (
                  <LegacySavedLineArrowUpIcon />
                ) : (
                  <LegacySavedLineArrowDownIcon />
                ))}
            </div>
            <span 
              className={`cell-value cell-value-saved ${!isCellLocked && (isIncrease ? 'cell-value-increase' : 'cell-value-decrease')}`}
              {...valueCellHoverProps}
              style={{ cursor: valueCellCursor }}
            >
              {valueMatchesSearch ? (
                <SearchHighlight text={formatValue(currentValue)} searchTerms={otherTerms} />
              ) : (
                formatValue(currentValue)
              )}
            </span>
          </div>
          {/* Dog ear triangle indicator for cells with notes */}
          {/* finalHasNoteForRender already checks savedImpactedCells, so no need for redundant checks */}
          {finalHasNoteForRender && (
            <div className="cell-note-indicator"></div>
          )}
        </>
      );
    }
    
    const cellValue = row.values[monthKey];
    const cellValueMatchesSearch = otherTerms.length > 0 && matchesNumber(cellValue, otherTerms);
    
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <div className="cell-value-left-icon">
            {renderStandardValueLeftIcon(isCellLocked)}
          </div>
          <span 
            className="cell-value"
            {...valueCellHoverProps}
            style={{ cursor: valueCellCursor }}
          >
            {cellValueMatchesSearch ? (
              <SearchHighlight text={formatValue(cellValue, row.name?.toLowerCase().includes('quantity'), row.name)} searchTerms={otherTerms} />
            ) : (
              formatValue(cellValue, row.name?.toLowerCase().includes('quantity'), row.name)
            )}
          </span>
        </div>
        {/* Dog ear triangle indicator for cells with saved notes (normal cells, not edited/impacted) */}
        {/* CRITICAL: Double-check savedImpactedCells here to ensure triangle doesn't show for saved impacted cells */}
        {/* Check savedImpactedCells directly at render time - convert to array fresh each time to ensure we get latest values */}
        {(() => {
          // Re-check savedImpactedCells at render time to catch any updates
          const cellKeyForCheck = `${row.id}-${monthKey}`;
          // Convert Set to array fresh each render to ensure we get the latest values
          const currentSavedImpactedArray = savedImpactedCells ? Array.from(savedImpactedCells) : [];
          // Check both Set and array to be absolutely sure
          const isInSavedImpacted = (
            (savedImpactedCells && (savedImpactedCells.has(cellKeyForCheck) || savedImpactedCells.has(cellKey))) ||
            currentSavedImpactedArray.includes(cellKeyForCheck) ||
            currentSavedImpactedArray.includes(cellKey) ||
            savedImpactedCellsArray.includes(cellKeyForCheck) ||
            savedImpactedCellsArray.includes(cellKey)
          );
          // If cell is saved impacted, NEVER show triangle, regardless of finalHasNoteForRender
          if (isInSavedImpacted) {
            return null;
          }
          return finalHasNoteForRender ? <div className="cell-note-indicator"></div> : null;
        })()}
      </>
    );
  };

  // Check if this row is a readonly measure (Last Year data) for row-level styling
  const isRowReadonlyMeasure = row.id.includes('measure-ly-order') || 
                               row.id.includes('-measure-ly-order') ||
                               row.name?.includes('Last Year');
  
  // Check if this is the actual measure row (not a child dimension row)
  const isActualMeasureRow = row.type === 'measure' && isRowReadonlyMeasure;
  // Check if this is a dimension row under a readonly measure
  const isDimensionUnderReadonlyMeasure = row.type !== 'measure' && isRowReadonlyMeasure;
  
  // Check if this is a shared measure (exists in multiple groups)
  const isSharedMeasure = row.type === 'measure' && sharedMeasureIds.includes(row.id);
  
  // Show warning icon for shared measures only when both groups are selected (has groupContext)
  // Don't show when only Adjustment Measures Group is selected
  const showGroupSwitcher = isSharedMeasure && row.groupContext !== undefined;

  /** Badge measure icon: expanded + (column filter hid some subtree, or panel/other pruning vs full rollup tree). */
  const measureUsesFilteredDescendantsAsset =
    row.type === 'measure' &&
    isExpanded &&
    (hasDescendantColumnFilterBadge ||
      (typeof fullMeasureChildCount === 'number' &&
        fullMeasureChildCount > (row.children?.length ?? 0)));

  /** Account: hidden category branches vs widest tree, or column-filter badge on this row. */
  const accountUsesFilteredDescendantsAsset =
    row.type === 'account' &&
    (hasDescendantColumnFilterBadge || accountHasHiddenChildCategoriesVsStructure);

  /** Category: hidden product branches vs widest tree, or column-filter badge on this row. */
  const categoryUsesFilteredDescendantsAsset =
    row.type === 'category' &&
    (hasDescendantColumnFilterBadge || categoryHasHiddenChildProductsVsStructure);

  /**
   * Orange dot: show whenever *any* filtering flow has hidden some of this row's descendants —
   * column filters (header icons / agent Focus) OR the Basic/Advanced Filters panel pruning the
   * tree. The panel-filter case is detected by the *UsesFilteredDescendantsAsset flags, which
   * compare visible children against the full rollup structure (from rollupValueSourceData).
   */
  const showFilterDot =
    hasDescendantColumnFilterBadge ||
    accountUsesFilteredDescendantsAsset ||
    categoryUsesFilteredDescendantsAsset ||
    measureUsesFilteredDescendantsAsset ||
    deepDimHasHiddenChildrenVsStructure;

  // Helper function to render type icon
  const renderTypeIcon = () => {
    const iconStyle: React.CSSProperties = {
      display: 'inline-block',
      verticalAlign: 'middle',
      marginRight:
        isFilteredOutMutedRow || isFilterBucketNoMatchMutedRow || noMatchBranchScratchedOut ? 0 : '6px',
      flexShrink: 0,
      width: '20px',
      height: '20px',
    };

    const accountFilteredIconStyle: React.CSSProperties = {
      ...iconStyle,
      width: '28px',
      height: '24px',
    };
    const categoryFilteredIconStyle: React.CSSProperties = {
      ...iconStyle,
      width: '28px',
      height: '25px',
    };

    const dimForIcon =
      row.type === 'filterSummary' && row.filteredOutDimension
        ? row.filteredOutDimension
        : row.type === 'account' || row.type === 'category' || row.type === 'product'
          ? row.type
          : null;

    const wrapMutedDimensionIcon = (node: React.ReactNode) => {
      if (isFilteredOutMutedRow) {
        return (
          <span
            className="grid-row-filtered-out-dimension-icon"
            data-filtered-dimension={row.filteredOutDimension ?? ''}
          >
            {node}
          </span>
        );
      }
      if (noMatchBranchScratchedOut && dimForIcon) {
        return (
          <span className="grid-row-filtered-out-dimension-icon" data-filtered-dimension={dimForIcon}>
            {node}
          </span>
        );
      }
      return node;
    };

    if (dimForIcon === 'account') {
      return wrapMutedDimensionIcon(
        <img
          src={AccountIcon}
          alt="Account"
          style={iconStyle}
          decoding="async"
        />,
      );
    }
    // Categories use the same Product icon — only two dimension icon types (account / product).
    if (dimForIcon === 'category') {
      return wrapMutedDimensionIcon(
        <img
          src={ProductIcon}
          alt="Product"
          style={iconStyle}
          decoding="async"
        />,
      );
    }
    if (dimForIcon === 'product') {
      return wrapMutedDimensionIcon(<img src={ProductIcon} alt="Product" style={iconStyle} />);
    }

    // Deep / Acme grid levels collapse to the same two icon types: account-hierarchy
    // levels use the Account icon, product-hierarchy levels use the Product icon.
    if (isDeepDimensionType(row.type)) {
      const accountSide =
        row.type.startsWith('acct-') ||
        row.type === 'acme-global' ||
        row.type === 'acme-region' ||
        row.type === 'acme-division' ||
        row.type === 'acme-plant';
      return wrapMutedDimensionIcon(
        <img
          src={accountSide ? AccountIcon : ProductIcon}
          alt={accountSide ? 'Account' : 'Product'}
          style={iconStyle}
          decoding="async"
        />,
      );
    }

    if (row.type === 'measure') {
      return (
        <span
          className="measure-row-hierarchy-icon"
          aria-hidden
        >
          <img
            src={MeasureRowIcon}
            alt=""
            width={20}
            height={20}
            decoding="async"
          />
        </span>
      );
    }

    return null;
  };

  /** Orange dot on account / category / measure icon when any filter hides some descendants. */
  const renderTypeIconWithFilterDot = () => {
    const icon = renderTypeIcon();
    if (!icon) return null;
    if (!showFilterDot)
      return icon;
    return (
      <span className="grid-row-type-icon-with-filter-dot">
        {icon}
        <span
          className="grid-row-filter-applied-dot"
          title="Filter applied — some child rows are hidden."
          role="img"
          aria-label="Filter applied; some child rows hidden"
        />
      </span>
    );
  };

  const rowNameColumnDisplay =
    row.type === 'filterSummary' &&
    (row.filterSummaryRole === 'filterBucketMatch' || row.filterSummaryRole === 'filterBucketNoMatch')
      ? `${row.name || ''} (${row.children?.length ?? 0})`
      : row.name || '';

  // Level name shown as a small subscript beneath each row's label in the frozen first
  // column (e.g. "Measure", "Account", "Region", "SKU"), so each row's level is identifiable
  // without a separate icon/column. Helper/summary rows are excluded.
  const dimensionLevelSubscript =
    row.type === 'measure'
      ? 'Measure'
      : row.type === 'account' ||
          row.type === 'category' ||
          row.type === 'product' ||
          isDeepDimensionType(row.type)
        ? getDimensionLevelName(row.type)
        : undefined;

  return (
    <>
      {filterLockHint && createPortal(
        <div
          style={{
            position: 'fixed',
            top: filterLockHint.y + 18,
            left: filterLockHint.x + 14,
            zIndex: 100000,
            pointerEvents: 'none',
            maxWidth: '240px',
            padding: '6px 10px',
            borderRadius: '6px',
            background: 'var(--slds-g-color-neutral-base-30, #444)',
            color: '#fff',
            fontSize: '12px',
            lineHeight: 1.35,
            boxShadow: 'var(--slds-g-shadow-3, 0 2px 8px rgba(0,0,0,0.25))',
            whiteSpace: 'normal',
          }}
        >
          {FILTER_LOCK_TOOLTIP}
        </div>,
        document.body
      )}
      <tr
        {...rowA11y}
        className={`grid-row ${row.type === 'measure' ? 'measure-row' : ''} ${isFilteredOutMutedRow || isFilterBucketNoMatchMutedRow || noMatchBranchScratchedOut ? 'grid-row-filtered-out-dimension' : ''} ${isActualMeasureRow ? 'readonly-measure-row-actual' : ''} ${isDimensionUnderReadonlyMeasure ? 'readonly-dimension-row' : ''} ${isNewlyAdded ? 'newly-added-measure' : ''} ${showFilterDot ? 'row-has-descendants-column-filter' : ''}`}
      >
        <td
          {...rowheaderA11y}
          className={`grid-cell frozen-column-cell ${frozenColumns.length > 0 && row.type !== 'measure' ? 'divided-frozen-cell' : ''}`}
          style={frozenColumns.length > 0 && row.type !== 'measure' ? {
            width: `${frozenColWidth ?? (300 + frozenColumns.length * 140)}px`,
            minWidth: `${frozenColWidth ?? (300 + frozenColumns.length * 140)}px`,
            maxWidth: `${frozenColWidth ?? (300 + frozenColumns.length * 140)}px`,
          } : undefined}
        >
          <div
            className={
              frozenColumns.length > 0 && row.type !== 'measure'
                ? `divided-frozen-row${showFilterDot ? ' divided-frozen-row--filter-badge' : ''}`
                : undefined
            }
          >
          <div
            className={
              frozenColumns.length > 0 && row.type !== 'measure'
                ? `divided-cell-content${showFilterDot ? ' cell-content-has-filter-badge' : ''}`
                : `cell-content${showFilterDot ? ' cell-content-has-filter-badge' : ''}`
            }
          >
            <span className={`cell-indent level-${level}`}></span>
            {hasExpandChevron && (
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
            {!hasExpandChevron && <span style={{ width: '16px', display: 'inline-block' }}></span>}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, flex: '1 1 0' }}>
              <span className="cell-name">
                {searchTerm && searchTerm.trim() ? (
                  <SearchHighlight 
                    text={rowNameColumnDisplay} 
                    searchTerms={extractSearchTerms(searchTerm)} 
                  />
                ) : (
                  rowNameColumnDisplay
                )}
              </span>
              {dimensionLevelSubscript && (
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--slds-g-color-neutral-base-50, #747474)',
                    marginTop: '1px',
                    fontWeight: 400,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                  }}
                >
                  {dimensionLevelSubscript}
                  {hiddenImmediateChildCount > 0 && (
                    <>
                      {' \u2022 '}
                      Incl. {hiddenImmediateChildCount} filtered
                      {' '}
                      <HiddenChildrenInfo text="Aggregation includes all children, even those hidden by filters." />
                    </>
                  )}
                </span>
              )}
              {/* Show measure group name for measures with groupContext */}
              {row.type === 'measure' && row.groupContext && (
                <span style={{ 
                  fontSize: '10px', 
                  color: 'var(--color-on-surface-strong)', 
                  marginTop: '2px',
                  fontWeight: 400
                }}>
                  {row.groupContext}
                </span>
              )}
              {showFlattenedHierarchyPath && (
                <FlattenedSortHierarchyPath fullPath={hierarchyPathLine} />
              )}
            </div>
            {/* Warning icon / Group switcher for shared measures */}
            {showGroupSwitcher && (
              <button
                type="button"
                ref={warningIconRef}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  marginLeft: '8px',
                  cursor: 'pointer',
                  border: 'none',
                  padding: 0,
                  background: 'transparent',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                }}
                aria-expanded={showReadonlyWarning}
                aria-haspopup="dialog"
                aria-label="Measure categories options"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReadonlyWarning(!showReadonlyWarning);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path d="M12 2L1 21h22L12 2z" fill="var(--slds-g-color-warning-2)" stroke="var(--slds-g-color-warning-1)" strokeWidth="1.5"/>
                  <path d="M12 9v5" stroke="var(--slds-g-color-warning-1)" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="12" cy="17" r="1" fill="var(--slds-g-color-warning-1)"/>
                </svg>
                {/* Popover rendered via portal */}
                {showReadonlyWarning && warningPopoverPosition && createPortal(
                  <div 
                    className="readonly-warning-popover"
                    style={{
                      position: 'fixed',
                      top: warningPopoverPosition.top,
                      left: warningPopoverPosition.left,
                      backgroundColor: 'var(--color-surface-white)',
                      border: '1px solid var(--slds-g-color-neutral-base-90)',
                      borderRadius: '8px',
                      padding: '16px',
                      boxShadow: 'var(--slds-g-shadow-3)',
                      zIndex: 10000,
                      width: '260px',
                      whiteSpace: 'normal'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Nubbin (triangle pointer) */}
                    <div style={{
                      position: 'absolute',
                      top: '-8px',
                      left: '16px',
                      width: '16px',
                      height: '8px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: '4px',
                        left: '0',
                        width: '16px',
                        height: '16px',
                        backgroundColor: 'var(--color-surface-white)',
                        border: '1px solid var(--slds-g-color-neutral-base-90)',
                        transform: 'rotate(45deg)',
                        boxShadow: 'var(--slds-g-shadow-1)'
                      }} />
                    </div>
                    
                    {/* Status message - changes based on selected group */}
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'flex-start', 
                      gap: '8px',
                      marginBottom: '12px',
                      padding: '10px 12px',
                      backgroundColor: 'var(--slds-g-color-warning-container-1)',
                      borderRadius: '6px'
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, marginTop: '1px' }}>
                        <path d="M12 2L1 21h22L12 2z" fill="var(--slds-g-color-warning-2)" stroke="var(--slds-g-color-warning-1)" strokeWidth="1.5"/>
                        <path d="M12 9v5" stroke="var(--slds-g-color-warning-1)" strokeWidth="2" strokeLinecap="round"/>
                        <circle cx="12" cy="17" r="1" fill="var(--slds-g-color-warning-1)"/>
                      </svg>
                      <div style={{ fontSize: '13px', color: 'var(--slds-g-color-warning-1)', lineHeight: '1.5' }}>
                        This measure is common across multiple categories, select a category to change its context.
                      </div>
                    </div>
                    
                    {/* Dropdown selector */}
                    <div style={{ fontSize: '13px', color: 'var(--color-on-surface-strong)', marginBottom: '8px', fontWeight: 500 }}>
                      Select measure category:
                    </div>
                    
                    {/* Custom dropdown */}
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        aria-expanded={isGroupDropdownOpen}
                        aria-haspopup="listbox"
                        onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
                        style={{
                          padding: '8px 12px',
                          fontSize: '13px',
                          border: '1px solid var(--slds-g-color-neutral-base-80)',
                          borderRadius: '6px',
                          backgroundColor: 'var(--color-surface-white)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          width: '100%',
                          font: 'inherit',
                          textAlign: 'left',
                          appearance: 'none',
                          WebkitAppearance: 'none',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.groupContext === 'Adjustment Measures' ? 'Adjustment…' : 'Revenue & Qty…'}
                        </span>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, transform: isGroupDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} aria-hidden>
                          <path stroke="var(--slds-g-color-neutral-base-50)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 8l4 4 4-4"/>
                        </svg>
                      </button>
                      
                      {/* Dropdown options */}
                      {isGroupDropdownOpen && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          marginTop: '4px',
                          backgroundColor: 'var(--color-surface-white)',
                          border: '1px solid var(--slds-g-color-neutral-base-90)',
                          borderRadius: '6px',
                          boxShadow: 'var(--slds-g-shadow-3)',
                          zIndex: 10001,
                          overflow: 'hidden'
                        }}>
                          {/* Revenue & Quantity Measures option */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onMeasureGroupContextChange) {
                                onMeasureGroupContextChange(row.id, 'Revenue & Quantity Measures');
                              }
                              setIsGroupDropdownOpen(false);
                            }}
                            style={{
                              padding: '10px 12px',
                              fontSize: '13px',
                              cursor: 'pointer',
                              backgroundColor: row.groupContext !== 'Adjustment Measures' ? 'var(--slds-g-color-neutral-base-95)' : 'var(--color-surface-white)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              width: '100%',
                              border: 'none',
                              font: 'inherit',
                              textAlign: 'left',
                              appearance: 'none',
                              WebkitAppearance: 'none',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--slds-g-color-neutral-base-95)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = row.groupContext !== 'Adjustment Measures' ? 'var(--slds-g-color-neutral-base-95)' : 'var(--color-surface-white)'}
                          >
                            <span>Revenue & Quantity Measures</span>
                            {row.groupContext !== 'Adjustment Measures' && (
                              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                                <path stroke="var(--color-accent-blue)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l3 3 7-7"/>
                              </svg>
                            )}
                          </button>
                          
                          {/* Adjustment Measures option */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onMeasureGroupContextChange) {
                                onMeasureGroupContextChange(row.id, 'Adjustment Measures');
                              }
                              setIsGroupDropdownOpen(false);
                            }}
                            style={{
                              padding: '10px 12px',
                              fontSize: '13px',
                              cursor: 'pointer',
                              backgroundColor: row.groupContext === 'Adjustment Measures' ? 'var(--slds-g-color-neutral-base-95)' : 'var(--color-surface-white)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              width: '100%',
                              border: 'none',
                              font: 'inherit',
                              textAlign: 'left',
                              appearance: 'none',
                              WebkitAppearance: 'none',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--slds-g-color-neutral-base-95)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = row.groupContext === 'Adjustment Measures' ? 'var(--slds-g-color-neutral-base-95)' : 'var(--color-surface-white)'}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Adjustment Mea...</span>
                              <span style={{
                                fontSize: '10px',
                                color: 'var(--slds-g-color-neutral-base-50)',
                                backgroundColor: 'var(--slds-g-color-neutral-base-80)',
                                padding: '3px 6px',
                                borderRadius: '4px',
                                fontWeight: 600,
                                flexShrink: 0
                              }}>
                                READ ONLY
                              </span>
                            </div>
                            {row.groupContext === 'Adjustment Measures' && (
                              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }} aria-hidden>
                                <path stroke="var(--color-accent-blue)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l3 3 7-7"/>
                              </svg>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>,
                  document.body
                )}
              </button>
            )}
            {/* 3-dot menu button for measure rows */}
            {row.type === 'measure' && (
              <button
                type="button"
                ref={measureMenuRef}
                aria-haspopup="menu"
                aria-expanded={showMeasureMenu}
                aria-label="Measure row actions"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMeasureMenu(!showMeasureMenu);
                }}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                  zIndex: 10
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
                {/* Filter indicator badge */}
                {quickFilter && quickFilter.filterColumn && quickFilter.selectedValues.length > 0 && (
                  <span 
                    style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-accent-blue)',
                      border: '1.5px solid white',
                      display: 'block'
                    }}
                  />
                )}
                {/* Dropdown menu rendered via portal */}
                {showMeasureMenu && measureMenuPosition && createPortal(
                  <div
                    className="measure-menu-dropdown"
                    style={{
                      position: 'fixed',
                      top: measureMenuPosition.top,
                      left: measureMenuPosition.left,
                      backgroundColor: 'var(--color-surface-white)',
                      border: '1px solid var(--slds-g-color-neutral-base-90)',
                      borderRadius: '6px',
                      boxShadow: 'var(--slds-g-shadow-3)',
                      zIndex: 10000,
                      minWidth: '160px',
                      overflow: 'hidden'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (onExpandMeasure) {
                          onExpandMeasure(row.id);
                        }
                        setShowMeasureMenu(false);
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
                        if (onCollapseMeasure) {
                          onCollapseMeasure(row.id);
                        }
                        setShowMeasureMenu(false);
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
                        borderTop: '1px solid var(--slds-g-color-neutral-base-90)',
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
                    {onShowCharts && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMeasureMenu(false);
                          onShowCharts(row);
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
                          borderTop: '1px solid var(--slds-g-color-neutral-base-90)',
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
                        <span>Show Charts</span>
                      </button>
                    )}
                  </div>,
                  document.body
                )}
              </button>
            )}
            {/* 3-dot menu button for dimension rows (includes deep-hierarchy levels) */}
            {(row.type === 'account' || row.type === 'category' || row.type === 'product' || isDeepDimensionType(row.type)) && (
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
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                  zIndex: 10
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--slds-g-color-neutral-base-95)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8" cy="3" r="1.5" fill="var(--slds-g-color-neutral-base-50)"/>
                    <circle cx="8" cy="8" r="1.5" fill="var(--slds-g-color-neutral-base-50)"/>
                    <circle cx="8" cy="13" r="1.5" fill="var(--slds-g-color-neutral-base-50)"/>
                  </svg>
          </div>
                {/* Dropdown menu rendered via portal */}
                {showDimensionMenu && dimensionMenuPosition && createPortal(
                  <div
                    className="dimension-menu-dropdown"
                    style={{
                      position: 'fixed',
                      top: dimensionMenuPosition.top,
                      left: dimensionMenuPosition.left,
                      backgroundColor: 'var(--color-surface-white)',
                      border: '1px solid var(--slds-g-color-neutral-base-90)',
                      borderRadius: '6px',
                      boxShadow: 'var(--slds-g-shadow-3)',
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
                            borderTop: '1px solid var(--slds-g-color-neutral-base-90)',
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
                          borderTop: showExpandCollapseOptions ? '1px solid var(--slds-g-color-neutral-base-90)' : 'none',
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
                        {quickFilter && quickFilter.filterColumn && quickFilter.selectedValues.length > 0 && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }} aria-hidden>
                            <path d="M3 6h18M7 12h10M11 18h2" stroke="var(--color-accent-blue)" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        )}
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
                        borderTop: '1px solid var(--slds-g-color-neutral-base-90)',
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
                    {onShowCharts && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowDimensionMenu(false);
                          onShowCharts(row);
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
                          borderTop: '1px solid var(--slds-g-color-neutral-base-90)',
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
                        <span>Show Charts</span>
                      </button>
                    )}
                  </div>,
                  document.body
                )}
              </button>
            )}
          </div>
          {frozenColumns.length > 0 && row.type !== 'measure' && frozenColumns.map((col) => {
            const frozenValue = col.id === 'trend' ? '' : getFrozenColumnValue(col.id, row.id, row, visibleTimeKeys);
            return (
              <div key={`frozen-part-${col.id}`} className="frozen-column-part">
                {renderFrozenCell(col.id, frozenValue, row)}
              </div>
            );
          })}
          </div>{/* closes divided-frozen-row wrapper */}
        </td>
        {timeKeys.map((key, keyIndex) => {
          const cellKey = `${row.id}-${key}`;
          const isFocused = focusedCell?.rowId === row.id && focusedCell?.monthKey === key;
          const isCellLocked = lockedCells.has(cellKey);
          const isLastColumnGroup = keyIndex === timeKeys.length - 1;
          const hasApproverOverrideThisCellTd = approverOverrideCellKeys?.has(cellKey) ?? false;
          const isPlanReviewLock = planReviewGridLock === true && !hasApproverOverrideThisCellTd;
          const planReviewStripeTexture =
            planReviewRequesterStripes === true && isPlanReviewLock;
          const approvalForValueCellTd = (approvalRequests ?? new Map<string, ApprovalRequest>()).get(cellKey);
          const pendingApprovalLocksCellTd = pendingSubmissionLocksPlanningValueCell(
            approvalForValueCellTd,
            cellKey,
            approverOverrideCellKeys,
            currentUser,
          );
          // Check if this is a readonly measure (Last Year data)
          const isReadonlyMeasureCell = row.id.includes('measure-ly-order') || 
                                        row.id.includes('-measure-ly-order') ||
                                        row.name?.includes('Last Year');
          
          // Block editing for cells that belong to Adjustment Measures (read-only context)
          const isAdjustmentGroupCell = row.type !== 'measure' && row.groupContext === 'Adjustment Measures';

          const cfRowType: RowType =
            row.type === 'filterSummary' && row.filteredOutDimension
              ? row.filteredOutDimension
              : row.type;
          
          // Apply striped texture to dimension cells under readonly measures or adjustment
          // group, and to ancestors of a filtered row (their totals are locked while filtered).
          const shouldShowTexture =
            isDimensionUnderReadonlyMeasure || isAdjustmentGroupCell || isAncestorOfFilteredRow;
          const baseValueEditable =
            onCellChange &&
            !isCellLocked &&
            !isReadonlyMeasureCell &&
            !isAdjustmentGroupCell &&
            !isFilterSummaryReadonly &&
            !noMatchBranchScratchedOut &&
            !isAncestorOfFilteredRow;
          const isEditable = baseValueEditable && !isPlanReviewLock && !pendingApprovalLocksCellTd;
          const reviewLockHover = isPlanReviewLock && baseValueEditable;
          const pendingSubmissionHoverTd = pendingApprovalLocksCellTd && baseValueEditable;
          /** In plan review, cells are read-only but hover popover (who changed / notes) must still work. */
          const canShowEditInfoOnHover =
            isEditable || isCellLocked || (isPlanReviewLock && baseValueEditable) || pendingSubmissionHoverTd;
          
          // Check if this cell has a note
          // For impacted cells: only show note indicator if there's an unsaved note (new note added after impact)
          // For saved impacted cells (were impacted but now saved): don't show old notes
          // For non-impacted cells: show note indicator if there's a note in editHistory (saved notes)
          const cellKeyForNoteCheck = `${row.id}-${key}`;
          const editedOriginalValueForNote = isDesignSystemRulesEnabled ? editedCells?.get(cellKeyForNoteCheck) : undefined;
          const impactedOriginalValueForNote = isDesignSystemRulesEnabled ? impactedCells?.get(cellKeyForNoteCheck) : undefined;
          const isImpactedForNote = !editedOriginalValueForNote && impactedOriginalValueForNote !== undefined;
          // Check if cell is saved impacted - check both cell key formats to be absolutely sure
          const isSavedImpacted = savedImpactedCells.has(cellKeyForNoteCheck) || savedImpactedCells.has(`${row.id}-${key}`);
          
          // Calculate hasNote - explicitly exclude saved impacted cells and read cells
          // IMPORTANT: If cell is saved impacted OR marked as read, NEVER show note indicator, regardless of other conditions
          let hasNote = false;
          
          // Check if cell is marked as read - use Set for O(1) lookup
          const isCellRead = readCellsSet.has(cellKeyForNoteCheck);
          
          
          if (isSavedImpacted || isCellRead) {
            // Cell is saved impacted or marked as read - don't show any notes, period
            // This handles: cell had note -> got impacted -> saved -> triangle should NOT show
            // OR: cell had note -> marked as read -> triangle should NOT show
            hasNote = false;
          } else if (isImpactedForNote) {
            // For impacted cells: only show note if there's an unsaved note (added after impact)
            hasNote = !!(unsavedNotes?.get(cellKeyForNoteCheck) && unsavedNotes.get(cellKeyForNoteCheck)!.trim() !== '');
          } else {
            const approvalForNote = (approvalRequests ?? new Map<string, ApprovalRequest>()).get(cellKeyForNoteCheck);
            const approvalNote = approvalForNote?.requesterNote || approvalForNote?.approverComment || '';
            if (approvalNote.trim() !== '') {
              hasNote = true;
            }
            // For non-impacted cells: only show note if there's a note in editHistory
            if (!hasNote && editHistory && editHistory.length > 0) {
              hasNote = editHistory.some((entry) => {
                if (!editHistoryEntryAffectsCell(entry, cellKeyForNoteCheck, row.id, String(key))) {
                  return false;
                }
                return !!(entry.note && entry.note.trim() !== '' && !isApprovalStatusTransitionNote(entry.note));
              });
            }
          }
          
          // Force hasNote to false if cell is saved impacted or marked as read (safety check)
          // Triple-check savedImpactedCells directly to be absolutely sure
          const finalHasNote = (isSavedImpacted || isCellRead) ? false : hasNote;

          // Evaluate conditional formatting rules for this cell
          const cfEffectiveMeasureId = measureId ?? row.id;
          const cfAllValues = allCellValues?.get(key as string) ?? [];
          const cfSiblingGroupKey = row.parentId ?? 'root';
          const cfSameTypeValues = allCellValuesByType?.get(key as string)?.get(cfSiblingGroupKey) ?? [];
          const cfSiblingCostValues = allCellValuesByType?.get('_cost')?.get(cfSiblingGroupKey) ?? [];
          const cfModifyRules = conditionalFormattingRules?.filter(r => r.mode === 'modifyCells') ?? [];
          const cfResult = cfModifyRules.length
            ? evaluateCellFormatting(
                rowValues[key] ?? 0,
                cfRowType,
                key as string,
                cfEffectiveMeasureId,
                cfModifyRules,
                cfAllValues,
                row.id,
                rowValues,
                cfSameTypeValues,
                cfSiblingCostValues,
                conditionalFormattingColorScaleMerge
                  ? { mergeBackgroundRulesAsColorScale: true }
                  : undefined,
              )
            : null;

          // Build CSS custom properties so CF colours beat design-system !important rules.
          // The actual override is done in Grid.css via .cell-cf-active selectors at the
          // end of the stylesheet (same specificity, later position wins the cascade).
          const hasCfActive = cfResult?.mode === 'modifyCells' && cfResult.hasMatch;
          const cfCssVars: Record<string, string> = {};
          if (hasCfActive) {
            const s = cfResult!.style;
            if (s.backgroundColor)                cfCssVars['--cf-bg']       = s.backgroundColor as string;
            if ((s as Record<string, unknown>).background)   cfCssVars['--cf-gradient'] = (s as Record<string, unknown>).background as string;
            if ((s as Record<string, unknown>).color)        cfCssVars['--cf-color']    = (s as Record<string, unknown>).color as string;
            if ((s as Record<string, unknown>).borderLeft)   cfCssVars['--cf-border']   = (s as Record<string, unknown>).borderLeft as string;
          }
          const cfHasBg = hasCfActive && !!cfCssVars['--cf-bg'];
          const cfHasGradient = hasCfActive && !!cfCssVars['--cf-gradient'];
          const cfHasColor = hasCfActive && !!cfCssVars['--cf-color'];
          const cfHasBorder = hasCfActive && !!cfCssVars['--cf-border'];
          const cfVizAttr = hasCfActive ? cfResult!.visualizationType : undefined;

          const planReviewRequesterHoverTd =
            planReviewRequesterStripes === true && isPlanReviewLock;
          const valueCellTextureClass =
            !isCellRead && planReviewStripeTexture
              ? 'cell-plan-review-requester-texture'
              : !isCellRead && shouldShowTexture
                ? 'cell-readonly-texture'
                : '';

          /** Mirrors FillHandle render — explicit class so clipping/z-index rules work without relying on :has() on td. */
          const showFillHandleForActualCell =
            lastSelectedCell === cellKey &&
            selectedCells.has(cellKey) &&
            (!planReviewGridLock || hasApproverOverrideThisCellTd) &&
            !pendingApprovalLocksCellTd;

          // Shared className computation for the Actual cell
          const actualCellClassName = `grid-cell cell-value-cell ${hasCfActive ? 'cell-cf-active' : ''} ${cfHasBg ? 'cell-cf-has-bg' : ''} ${cfHasGradient ? 'cell-cf-has-gradient' : ''} ${cfHasColor ? 'cell-cf-has-color' : ''} ${cfHasBorder ? 'cell-cf-has-border' : ''} ${isFocused ? 'cell-focused' : ''} ${valueCellTextureClass} ${isAncestorOfFilteredRow ? 'cell-filter-locked' : ''} ${!isCellRead && finalHasNote && !isSavedImpacted ? 'cell-has-note' : ''} ${isCellRead ? 'cell-marked-read' : ''} ${selectedCells.has(cellKey) ? 'cell-selected' : ''} ${showFillHandleForActualCell ? 'cell-has-fill-handle' : ''} ${(() => {
                if (isCellRead) return '';
                const cellKeyForCheck = `${row.id}-${key}`;
                const editedOriginalValue = isDesignSystemRulesEnabled ? editedCells?.get(cellKeyForCheck) : undefined;
                const impactedOriginalValue = isDesignSystemRulesEnabled ? impactedCells?.get(cellKeyForCheck) : undefined;
                const savedIconColorCheck = isDesignSystemRulesEnabled ? savedEditedCells?.get(cellKeyForCheck) : undefined;
                const isSavedEditedCheck = savedIconColorCheck !== undefined;
            if (editedOriginalValue !== undefined) return 'edited-cell';
            if (impactedOriginalValue !== undefined) return 'impacted-cell';
            if (isSavedEditedCheck) return '';
                return '';
          })()}`;

          // Shared event handlers for the Actual cell
          const actualCellProps = {
            role: 'gridcell' as const,
            'data-cell-key': cellKey,
            'data-cell-read': isCellRead ? 'true' : 'false',
            ...(cfVizAttr ? { 'data-cf-viz': cfVizAttr } : {}),
            ...(pendingSubmissionHoverTd
              ? { title: PENDING_SUBMISSION_EDIT_TOOLTIP as const }
              : planReviewRequesterHoverTd
                ? { title: PLAN_REVIEW_REQUESTER_TOOLTIP as const }
                : reviewLockHover
                  ? { title: 'You cannot edit while the grid is in review.' as const }
                  : {}),
            style: {
              minWidth: `${columnWidth}px`,
              width: `${columnWidth}px`,
              position: 'relative' as const,
              ...(hasCfActive ? cfResult!.style : {}),
              ...(cfCssVars as React.CSSProperties),
              ...((reviewLockHover || pendingSubmissionHoverTd || planReviewRequesterHoverTd || isAncestorOfFilteredRow)
                ? { cursor: 'not-allowed' as const }
                : {}),
            },
            ref: (el: HTMLTableCellElement | null) => { if (el && cellRefs) cellRefs.current.set(cellKey, el); },
            className: actualCellClassName,
            tabIndex: isEditable || (isPlanReviewLock && baseValueEditable) || pendingSubmissionHoverTd ? 0 : -1,
            onMouseMove: (e: React.MouseEvent) => {
              if (onCellMouseMove) onCellMouseMove(cellKey);
              if (isAncestorOfFilteredRow) setFilterLockHint({ x: e.clientX, y: e.clientY });
            },
            onMouseEnter: (e: React.MouseEvent<HTMLTableCellElement>) => {
              if (isAncestorOfFilteredRow) setFilterLockHint({ x: e.clientX, y: e.clientY });
              if (isEditable) setHoveredCell(key);
                if (onCellFocusWithHistory && canShowEditInfoOnHover && !editingCell && !isCellRead) {
                  const focusCellKey = `${row.id}-${key}`;
                  const isDirty = editedCells?.has(focusCellKey) && !savedEditedCells?.has(focusCellKey);
                  const isImpactedCell = impactedCells?.has(focusCellKey);
                  const wasImpactedAndSaved = savedImpactedCells.has(focusCellKey);
                  const approvalForCell = (approvalRequests ?? new Map<string, ApprovalRequest>()).get(focusCellKey);
                  const approvalHasNote = Boolean(
                    approvalForCell?.requesterNote?.trim() ||
                    approvalForCell?.approverComment?.trim()
                  );
                  const shouldShowApprovalPopover = Boolean(approvalForCell) && approvalForCell.status !== 'pending' && (
                    approvalForCell.status === 'rejected' ||
                    approvalForCell.status === 'approvedWithCondition' ||
                    approvalHasNote
                  );
                  const allowEditInfoPopover =
                    shouldShowApprovalPopover ||
                    ((!isDirty || isCellLocked) && !isImpactedCell && !wasImpactedAndSaved) ||
                    (isPlanReviewLock && baseValueEditable && (isImpactedCell || wasImpactedAndSaved)) ||
                    (pendingSubmissionHoverTd && baseValueEditable);
                  if (allowEditInfoPopover) {
                  onCellFocusWithHistory(focusCellKey, e.currentTarget.getBoundingClientRect(), row.values[key], isCellLocked, isImpactedCell || wasImpactedAndSaved);
                  }
                }
            },
            onMouseLeave: (e: React.MouseEvent) => {
                const relatedTarget = e.relatedTarget as HTMLElement;
              if (isAncestorOfFilteredRow) setFilterLockHint(null);
              if (!relatedTarget || !relatedTarget.closest('svg')) setHoveredCell(null);
              if (onCellFocusWithHistory && (!relatedTarget || !relatedTarget.closest('.cell-edit-info-popover'))) onCellFocusWithHistory('', null);
            },
            onMouseDown: (e: React.MouseEvent<HTMLTableCellElement>) => {
              if (onCellMouseDown && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.button === 0) onCellMouseDown(cellKey, e);
                shiftKeyPressedRef.current = e.shiftKey;
              if (e.shiftKey || e.ctrlKey || e.metaKey) return;
              if (e.button !== 0) return;
              if (editingCell?.monthKey === key) return;
                // Selection should be independent from editability so bulk actions
                // can include readonly/non-editable value cells as well.
                const canSelect = true;
                if (editingCell && editingCell.monthKey !== key && onCellSelect && canSelect) {
                onCellSelect(cellKey, { ...e, ctrlKey: false, metaKey: false, shiftKey: false, detail: 1 } as React.MouseEvent);
                  return;
                }
              if (onCellSelect && canSelect && !editingCell) onCellSelect(cellKey, e);
            },
            onClick: (e: React.MouseEvent) => {
                shiftKeyPressedRef.current = e.shiftKey;
                const isModifierKey = e.shiftKey || e.ctrlKey || e.metaKey;
              if (e.detail === 2) return;
              if (editingCell?.monthKey === key) return;
                // Keep click selection enabled for all value cells, even when not editable.
                const canSelect = true;
                if (onCellSelect && canSelect) {
                if (isModifierKey) { e.stopPropagation(); onCellSelect(cellKey, e); return; }
                if (!editingCell && !selectedCells.has(cellKey)) onCellSelect(cellKey, e);
              }
            },
            onDoubleClick: (e: React.MouseEvent) => {
              if (isEditable && !editingCell) { e.stopPropagation(); handleCellValueClick(key, e); }
            },
            onFocus: (e: React.FocusEvent<HTMLTableCellElement>) => {
                  e.stopPropagation();
              if (isEditable) setFocusedCellKey(cellKey);
              if (onCellFocus && isEditable) onCellFocus({ rowId: row.id, monthKey: key });
                if (onCellFocusWithHistory && canShowEditInfoOnHover && !editingCell && !shiftKeyPressedRef.current && !isCellRead) {
                  const focusCellKey = `${row.id}-${key}`;
                  const isDirty = editedCells?.has(focusCellKey) && !savedEditedCells?.has(focusCellKey);
                  const isImpactedCell = impactedCells?.has(focusCellKey);
                  const wasImpactedAndSaved = savedImpactedCells.has(focusCellKey);
                  const approvalForCell = (approvalRequests ?? new Map<string, ApprovalRequest>()).get(focusCellKey);
                  const approvalHasNote = Boolean(
                    approvalForCell?.requesterNote?.trim() ||
                    approvalForCell?.approverComment?.trim()
                  );
                  const shouldShowApprovalPopover = Boolean(approvalForCell) && approvalForCell.status !== 'pending' && (
                    approvalForCell.status === 'rejected' ||
                    approvalForCell.status === 'approvedWithCondition' ||
                    approvalHasNote
                  );
                  const allowEditInfoPopover =
                    shouldShowApprovalPopover ||
                    ((!isDirty || isCellLocked) && !isImpactedCell && !wasImpactedAndSaved) ||
                    (isPlanReviewLock && baseValueEditable && (isImpactedCell || wasImpactedAndSaved)) ||
                    (pendingSubmissionHoverTd && baseValueEditable);
                  if (allowEditInfoPopover) {
                  onCellFocusWithHistory(focusCellKey, e.currentTarget.getBoundingClientRect(), row.values[key], isCellLocked, isImpactedCell || wasImpactedAndSaved);
                  }
                }
                shiftKeyPressedRef.current = false;
            },
            onBlur: (e: React.FocusEvent) => {
                e.stopPropagation();
                setFocusedCellKey(null);
                if (onCellFocusWithHistory) {
                  const relatedTarget = e.relatedTarget as HTMLElement;
                if (!relatedTarget || !relatedTarget.closest('.cell-edit-info-popover')) onCellFocusWithHistory('', null);
              }
            },
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' && isEditable && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); handleCellEnterKey(key); return; }
              // Type-to-edit: a printable, value-like character on a selected editable cell
              // enters edit mode immediately and replaces the value (type-over), like a spreadsheet.
              if (
                isEditable &&
                !editingCell &&
                onCellChange &&
                !isFilterSummaryReadonly &&
                e.key.length === 1 &&
                !e.ctrlKey && !e.metaKey && !e.altKey &&
                /[0-9.,\-=]/.test(e.key)
              ) {
                e.preventDefault();
                e.stopPropagation();
                enterEditModeForMonthKey(key, { seedChar: e.key });
              }
            },
            onContextMenu: (e: React.MouseEvent) => {
              if (onCellContextMenu) onCellContextMenu(e, cellKey, row.values[key], isCellLocked, isEditable || false);
            },
          };

          if (subColumns.length > 0) {
            // Render Actual cell + one <td> per sub-column
            return (
              <React.Fragment key={cellKey}>
                <td {...actualCellProps} className={`${actualCellProps.className} sub-col-actual-cell ${isLastColumnGroup ? 'sub-col-last-column-group' : ''}`}>
                  {renderCellValue(key)}
                  {hasCfActive && cfResult?.zoneIcon && editingCell?.monthKey !== key && (
                    <span className="cell-cf-icon-overlay" style={{ color: cfResult.iconColor ?? cfResult.indicatorColor }}>
                      {cfResult.zoneIcon}
                    </span>
                  )}
                  {renderPencilIcon(
                    key,
                    !!isEditable,
                    Boolean(
                      approverMayOpenReviewPopover &&
                        planReviewGridLock &&
                        !hasApproverOverrideThisCellTd &&
                        baseValueEditable
                    ),
                    Boolean(
                      baseValueEditable &&
                        approvalForValueCellTd?.status === 'pending' &&
                        isCurrentUserApprovalRequester(approvalForValueCellTd, currentUser)
                    )
                  )}
                  {showFillHandleForActualCell && (
                    <FillHandle
                      cellKey={cellKey}
                      onDragStart={onFillHandleDragStart}
                      onDragMove={onFillHandleDragMove}
                      onDragEnd={onFillHandleDragEnd}
                    />
                  )}
                </td>
                {subColumns.map((sc, subColIndex) => {
                  const actualValue = row.values[key] ?? 0;
                  const isLastSubCol = subColIndex === subColumns.length - 1;
                  const isYoYOrMoM = sc.id === 'yoy' || sc.id === 'mom' || sc.id === 'variance';
                  const isTargetAchievement = sc.id === 'targetAchievement';
                  const isApprovalStatus = sc.id === 'approvalStatus';

                  // For approval status, use narrower width
                  const subColWidth = isApprovalStatus ? 110 : columnWidth;
                  
                  if (isApprovalStatus) {
                    const approvalCellKey = `${row.id}-${key}`;
                    const safeApprovalRequests = approvalRequests ?? new Map<string, ApprovalRequest>();
                    const approval = safeApprovalRequests.get(approvalCellKey);
                    const approvalCellRead = (_readCells ?? []).includes(approvalCellKey);
                    const approvalHasComment = approval && !!(approval.approverComment && approval.approverComment.trim() !== '');
                    const approvalHasStatusChange = approval && approval.status !== 'pending' && approval.resolvedAt;
                    
                    // Helper function to recursively count approval statuses across all descendant rows
                    const countApprovalStatuses = (
                      rowId: string,
                      timeKey: string,
                      children: GridRowType[] | undefined,
                      approvalRequestsMap: Map<string, ApprovalRequest>
                    ): { approved: number; approvedWithCondition: number; pending: number; rejected: number; notSubmitted: number } => {
                      const counts = { approved: 0, approvedWithCondition: 0, pending: 0, rejected: 0, notSubmitted: 0 };
                      
                      // Always check if this row itself has an approval status (for both leaf and intermediate nodes)
                      const cellKey = `${rowId}-${timeKey}`;
                      const approval = approvalRequestsMap.get(cellKey);
                      
                      if (!children || children.length === 0) {
                        // Leaf node - count its own approval status
                        if (approval) {
                          if (approval.status === 'approved' || approval.status === 'approvedWithCondition' || approval.status === 'pending' || approval.status === 'rejected' || approval.status === 'notSubmitted') {
                            counts[approval.status]++;
                          } else {
                            counts.notSubmitted++;
                          }
                        } else {
                          counts.notSubmitted++;
                        }
                        return counts;
                      }
                      
                      // Intermediate node - first count its own approval status if it exists
                      if (approval) {
                        if (approval.status === 'approved' || approval.status === 'approvedWithCondition' || approval.status === 'pending' || approval.status === 'rejected' || approval.status === 'notSubmitted') {
                          counts[approval.status]++;
                        } else {
                          counts.notSubmitted++;
                        }
                      }
                      
                      for (let i = 0; i < children.length; i++) {
                        const child = children[i];
                        if (!child?.id) continue;
                        const childCounts = countApprovalStatuses(child.id, timeKey, child.children, approvalRequestsMap);
                        counts.approved += childCounts.approved;
                        counts.approvedWithCondition += childCounts.approvedWithCondition;
                        counts.pending += childCounts.pending;
                        counts.rejected += childCounts.rejected;
                        counts.notSubmitted += childCounts.notSubmitted;
                      }
                      
                      return counts;
                    };
                    
                    // For measure rows, show aggregate stats instead of individual pill
                    const isMeasureRow = row.type === 'measure';

                    if (planReviewGridLock && isMeasureRow) {
                      return (
                        <td
                          {...gridCellA11y}
                          key={`${cellKey}-${sc.id}`}
                          className={`grid-cell cell-value-cell sub-col-value-td approval-status-cell ${isLastSubCol ? 'sub-col-last-in-group' : ''} ${isLastColumnGroup && isLastSubCol ? 'sub-col-last-column-group' : ''}${planReviewStripeTexture ? ' cell-plan-review-requester-texture' : ''}`}
                          style={{
                            minWidth: `${subColWidth}px`,
                            width: `${subColWidth}px`,
                            textAlign: 'center',
                            ...(planReviewRequesterHoverTd ? { cursor: 'not-allowed' as const } : {}),
                          }}
                          title={
                            planReviewRequesterHoverTd
                              ? PLAN_REVIEW_REQUESTER_TOOLTIP
                              : 'You cannot edit while the grid is in review.'
                          }
                        >
                          <span
                            className="approval-pill approval-pill--pending"
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              ['--approval-pill-bg' as string]: 'var(--slds-g-color-warning-container-1)',
                              ['--approval-pill-text' as string]: 'var(--slds-g-color-warning-1)',
                            }}
                          >
                            Pending
                          </span>
                        </td>
                      );
                    }
                    
                    if (isMeasureRow) {
                      const counts = countApprovalStatuses(row.id, String(key), row.children, safeApprovalRequests);
                      const total = counts.approved + counts.approvedWithCondition + counts.pending + counts.rejected + counts.notSubmitted;
                      const actionableTotal = counts.approved + counts.approvedWithCondition + counts.pending + counts.rejected;
                      
                      const renderAggregateStats = () => {
                        if (actionableTotal === 0) {
                          return <span className="approval-pill approval-pill--notSubmitted" style={{ fontSize: '10px', padding: '2px 6px' }}>Not Submitted</span>;
                        }
                        
                        const barWidth = 152; // Fixed width to match badge width
                        const calculateSegmentWidth = (count: number, isApproved: boolean = false): number => {
                          if (total === 0) return 0;
                          const calculated = (count / total) * barWidth;
                          // Ensure minimum 3px width for visibility if count > 0 (especially for approved)
                          if (count > 0) {
                            const rounded = Math.round(calculated);
                            return rounded < 3 ? 3 : rounded;
                          }
                          return 0;
                        };
                        
                        const segmentWidths = {
                          approved: calculateSegmentWidth(counts.approved, true),
                          approvedWithCondition: calculateSegmentWidth(counts.approvedWithCondition, true),
                          pending: calculateSegmentWidth(counts.pending),
                          rejected: calculateSegmentWidth(counts.rejected),
                          notSubmitted: calculateSegmentWidth(counts.notSubmitted),
                        };
                        
                        // Calculate total width to ensure it fills the bar (handle rounding)
                        const totalWidth = segmentWidths.approved + segmentWidths.approvedWithCondition + segmentWidths.pending + segmentWidths.rejected + 
                                          segmentWidths.notSubmitted;
                        const remainingWidth = barWidth - totalWidth;
                        
                        // Add remaining pixels to the last non-zero segment to fill the bar completely
                        const segments = [
                          { width: segmentWidths.approved, className: 'approval-bar-segment--approved' },
                          { width: segmentWidths.approvedWithCondition, className: 'approval-bar-segment--approvedWithCondition' },
                          { width: segmentWidths.pending, className: 'approval-bar-segment--pending' },
                          { width: segmentWidths.rejected, className: 'approval-bar-segment--rejected' },
                          { width: segmentWidths.notSubmitted, className: 'approval-bar-segment--notSubmitted' },
                        ].filter(s => s.width > 0);
                        
                        // Add remaining width to the last segment
                        if (segments.length > 0 && remainingWidth !== 0) {
                          segments[segments.length - 1].width += remainingWidth;
                        }
                        
                        return (
                          <div className="approval-aggregate-stats">
                            <div className="approval-aggregate-bar">
                              {segments.map((segment, index) => (
                                <div
                                  key={index}
                                  className={`approval-bar-segment ${segment.className}`}
                                  style={{ width: `${segment.width}px` }}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      };
                      
                      return (
                        <td
                          {...gridCellA11y}
                          key={`${cellKey}-${sc.id}`}
                          className={`grid-cell cell-value-cell sub-col-value-td approval-status-cell ${isLastSubCol ? 'sub-col-last-in-group' : ''} ${isLastColumnGroup && isLastSubCol ? 'sub-col-last-column-group' : ''}${planReviewStripeTexture ? ' cell-plan-review-requester-texture' : ''}`}
                          style={{
                            minWidth: `${subColWidth}px`,
                            width: `${subColWidth}px`,
                            textAlign: 'center',
                            ...(planReviewRequesterHoverTd ? { cursor: 'not-allowed' as const } : {}),
                          }}
                          title={planReviewRequesterHoverTd ? PLAN_REVIEW_REQUESTER_TOOLTIP : undefined}
                        >
                          {renderAggregateStats()}
                        </td>
                      );
                    }
                    
                    // For non-measure rows, show individual pill
                    const renderApprovalPill = () => {
                      const statusConfig: Record<string, { bg: string; text: string; label: string; icon: string }> = {
                        notSubmitted: { bg: 'var(--slds-g-color-neutral-base-95)', text: 'var(--slds-g-color-neutral-base-50)', label: 'Not Submitted', icon: 'dash' },
                        pending: { bg: 'var(--slds-g-color-warning-container-1)', text: 'var(--slds-g-color-warning-1)', label: 'Pending', icon: 'clock' },
                        approved: { bg: 'var(--slds-g-color-success-container-1)', text: 'var(--slds-g-color-success-1)', label: 'Approved', icon: 'check' },
                        approvedWithCondition: { bg: 'var(--slds-g-color-warning-container-1)', text: 'var(--slds-g-color-warning-1)', label: 'Cond. Approved', icon: 'edit' },
                        rejected: { bg: 'var(--slds-g-color-error-container-1)', text: 'var(--slds-g-color-error-1)', label: 'Rejected', icon: 'x' },
                        // Legacy statuses - map to notSubmitted
                        needsMoreInfo: { bg: 'var(--slds-g-color-neutral-base-95)', text: 'var(--slds-g-color-neutral-base-50)', label: 'Not Submitted', icon: 'dash' },
                        modificationSuggested: { bg: 'var(--slds-g-color-neutral-base-95)', text: 'var(--slds-g-color-neutral-base-50)', label: 'Not Submitted', icon: 'dash' },
                        inDiscussion: { bg: 'var(--slds-g-color-neutral-base-95)', text: 'var(--slds-g-color-neutral-base-50)', label: 'Not Submitted', icon: 'dash' },
                      };

                      if (planReviewGridLock) {
                        const cfg = statusConfig.pending;
                        return (
                          <span
                            className="approval-pill approval-pill--pending"
                            style={{
                              ['--approval-pill-bg' as string]: cfg.bg,
                              ['--approval-pill-text' as string]: cfg.text,
                              cursor: 'not-allowed',
                            }}
                            title={
                              planReviewRequesterStripes
                                ? PLAN_REVIEW_REQUESTER_TOOLTIP
                                : 'You cannot edit while the grid is in review.'
                            }
                          >
                            <span className="approval-pill__content">
                              <span className="approval-pill__icon" aria-hidden="true">
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
                                  <path d="M6 3V6L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                              </span>
                              <span className="approval-pill__label">{cfg.label}</span>
                            </span>
                          </span>
                        );
                      }

                      if (!approval) {
                        return <span className="approval-pill approval-pill--empty">—</span>;
                      }
                      
                      // Map legacy/invalid statuses to notSubmitted
                      const normalizedStatus = (approval.status === 'approved' || approval.status === 'approvedWithCondition' || approval.status === 'pending' || approval.status === 'rejected' || approval.status === 'notSubmitted')
                        ? approval.status
                        : 'notSubmitted';
                      const config = statusConfig[normalizedStatus] || statusConfig['notSubmitted'];
                      
                      const formatRelativeTime = (date: Date): string => {
                        const now = new Date();
                        const diffMs = now.getTime() - date.getTime();
                        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                        if (diffDays === 0) return 'today';
                        if (diffDays === 1) return '1 day ago';
                        if (diffDays < 7) return `${diffDays} days ago`;
                        const diffWeeks = Math.floor(diffDays / 7);
                        if (diffWeeks === 1) return '1 week ago';
                        return `${diffWeeks} weeks ago`;
                      };

                      const truncateText = (text: string, maxLength: number): string => {
                        if (text.length <= maxLength) return text;
                        return text.substring(0, maxLength - 3) + '...';
                      };

                      return (
                        <button
                          type="button"
                          className={`approval-pill approval-pill--${(approval.status === 'approved' || approval.status === 'approvedWithCondition' || approval.status === 'pending' || approval.status === 'rejected' || approval.status === 'notSubmitted') ? approval.status : 'notSubmitted'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          onMouseEnter={(e) => {
                            // Capture element reference before setTimeout
                            const pillElement = e.currentTarget as HTMLElement;
                            const tdElement = pillElement.closest('td') as HTMLElement;

                            if (approval && approval.status !== 'notSubmitted') {
                              // Status popover (pending + resolved) — same design as value-cell stamp popover
                              if (approvalStatusChangeHoverTimeoutRef.current) {
                                clearTimeout(approvalStatusChangeHoverTimeoutRef.current);
                              }
                              approvalStatusChangeHoverTimeoutRef.current = setTimeout(() => {
                                const rect = tdElement ? tdElement.getBoundingClientRect() : pillElement.getBoundingClientRect();
                                const popoverWidth = 320;
                                const popoverHeight = 200;
                                let leftPos = rect.left;
                                if (leftPos + popoverWidth > window.innerWidth - 20) {
                                  leftPos = window.innerWidth - popoverWidth - 20;
                                }
                                const spaceBelow = window.innerHeight - rect.bottom;
                                const topPos = spaceBelow < popoverHeight + 20
                                  ? rect.top - popoverHeight - 10
                                  : rect.bottom + 4;
                                setApprovalStatusChangePopover({
                                  cellKey: approvalCellKey,
                                  position: { top: topPos, left: leftPos },
                                });
                                approvalStatusChangePopoverRef.current = tdElement || pillElement;
                              }, 120);
                            }
                          }}
                          onMouseLeave={() => {
                            // Cancel pending show timeouts
                            if (approvalStatusChangeHoverTimeoutRef.current) {
                              clearTimeout(approvalStatusChangeHoverTimeoutRef.current);
                              approvalStatusChangeHoverTimeoutRef.current = null;
                            }
                          }}
                          style={{
                            ['--approval-pill-bg' as string]: config.bg,
                            ['--approval-pill-text' as string]: config.text,
                          }}
                        >
                          <span className="approval-pill__content">
                            <span className="approval-pill__icon" aria-hidden="true">
                              {config.icon === 'dash' && (
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <path d="M3 6H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                              )}
                              {config.icon === 'clock' && (
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
                                  <path d="M6 3V6L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                              )}
                              {config.icon === 'check' && (
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                              {config.icon === 'x' && (
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                              )}
                              {config.icon === 'question' && (
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
                                  <path d="M4.5 4.5C4.5 3.67 5.17 3 6 3C6.83 3 7.5 3.67 7.5 4.5C7.5 5.33 6 5.83 6 6.5M6 7.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                              )}
                              {config.icon === 'edit' && (
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 9L4.5 9L9.5 4L8 2.5L3 7.5L2 9Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M7 3.5L8.5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                </svg>
                              )}
                            </span>
                            <span className="approval-pill__label">{config.label}</span>
                          </span>
                          <span className="approval-pill__chevron" aria-hidden="true">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M3.5 4.75L6 7.25L8.5 4.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        </button>
                      );
                    };
                    
                    const approvalSelectionKey = `${row.id}-${key}-approval`;
                    const isApprovalCellSelected = selectedCells.has(approvalSelectionKey);
                    
                    // Check if approval has a comment or note (for triangle indicator)
                    // For pending: check requesterNote (includes both seeded mock notes and user-entered notes)
                    // For resolved: check approverComment (approver's comment)
                    const isPending = approval && approval.status === 'pending';
                    const hasApprovalNote = approval && (
                      (isPending && !!(approval.requesterNote && approval.requesterNote.trim() !== '')) ||
                      (!isPending && !!(approval.approverComment && approval.approverComment.trim() !== ''))
                    );
                    const isApprovalCellRead = readCellsSet.has(approvalCellKey);
                    const shouldShowApprovalTriangle = hasApprovalNote && !isApprovalCellRead;
                    const showFillHandleApproval =
                      lastSelectedCell === approvalSelectionKey && isApprovalCellSelected && !planReviewGridLock;
                    return (
                      <td
                        {...gridCellA11y}
                        key={`${cellKey}-${sc.id}`}
                        ref={(el: HTMLTableCellElement | null) => {
                          if (el && cellRefs) {
                            cellRefs.current.set(approvalSelectionKey, el);
                          }
                        }}
                        data-cell-key={approvalSelectionKey}
                        className={`grid-cell cell-value-cell sub-col-value-td approval-status-cell ${isLastSubCol ? 'sub-col-last-in-group' : ''} ${isLastColumnGroup && isLastSubCol ? 'sub-col-last-column-group' : ''} ${isApprovalCellSelected ? 'cell-selected' : ''} ${shouldShowApprovalTriangle ? 'approval-cell-has-comment' : ''}${planReviewStripeTexture ? ' cell-plan-review-requester-texture' : ''} ${showFillHandleApproval ? 'cell-has-fill-handle' : ''}`}
                        style={{
                          minWidth: `${subColWidth}px`,
                          width: `${subColWidth}px`,
                          textAlign: 'center',
                          position: 'relative',
                          ...(planReviewRequesterHoverTd ? { cursor: 'not-allowed' as const } : {}),
                        }}
                        title={planReviewRequesterHoverTd ? PLAN_REVIEW_REQUESTER_TOOLTIP : undefined}
                        onClick={(e) => {
                          // If clicking the pill button, let it handle the click (opens ApprovalActionPopover)
                          if ((e.target as HTMLElement).closest('button.approval-pill')) {
                            return;
                          }
                  e.stopPropagation();
                          if (onCellSelect) {
                            onCellSelect(approvalSelectionKey, e);
                }
              }}
              onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                if (onCellContextMenu) {
                            onCellContextMenu(e, approvalSelectionKey, 0, false, true);
                          }
                        }}
                        onMouseLeave={() => {
                          // Close the status change popover when mouse leaves the cell (unless moving to popover)
                          if (approvalStatusChangePopover && approvalStatusChangePopover.cellKey === approvalCellKey) {
                            // Clear any existing close timeout
                            if (popoverCloseTimeoutRef.current) {
                              clearTimeout(popoverCloseTimeoutRef.current);
                            }
                            // Small delay to allow moving mouse to popover
                            popoverCloseTimeoutRef.current = setTimeout(() => {
                              // Only close if mouse is not over the popover
                              if (!isMouseOverPopoverRef.current) {
                                setApprovalStatusChangePopover(null);
                              }
                            }, 150);
                          }
                        }}
                      >
                        {renderApprovalPill()}
                        {shouldShowApprovalTriangle && (
                          <div className="approval-comment-indicator"></div>
                        )}
                        {showFillHandleApproval && (
                          <FillHandle
                            cellKey={approvalSelectionKey}
                            onDragStart={onFillHandleDragStart}
                            onDragMove={onFillHandleDragMove}
                            onDragEnd={onFillHandleDragEnd}
                          />
                        )}
                      </td>
                    );
                  }
                  
                  // ── CF Indicator Column sub-column ───────────────────────
                  const cfIndicatorRule = conditionalFormattingRules?.find(
                    r => r.id === sc.id && r.mode === 'createColumns'
                  );
                  if (cfIndicatorRule) {
                    // Evaluate formula if present — this converts the raw cell value to
                    // the derived metric (e.g. % vs avg) so zones match correctly.
                    const formulaExpr  = cfIndicatorRule.visualization.formulaExpression;
                    const resultUnit   = cfIndicatorRule.visualization.resultUnit;
                    const formulaResult = formulaExpr
                      ? evaluateFormulaExpression(formulaExpr, actualValue, cfAllValues, row.id, key as string)
                      : null;
                    const effectiveValue = formulaResult !== null ? formulaResult : actualValue;

                    const cfSubResult = evaluateCellFormatting(
                      effectiveValue,
                      cfRowType,
                      key as string,
                      cfEffectiveMeasureId,
                      [cfIndicatorRule],
                      cfAllValues,
                      row.id,
                      rowValues,
                      cfSameTypeValues,
                    );

                    // The text to show — formula result formatted by unit, or zone label fallback
                    const numericText = formulaResult !== null
                      ? formatFormulaResult(formulaResult, resultUnit)
                      : null;

                    // WCAG AA-compliant text color derived from the zone color
                    const accessibleColor = cfSubResult
                      ? getAccessibleTextColor(cfSubResult.indicatorColor)
                      : 'var(--slds-g-color-neutral-base-10)';

                    return (
                      <td
                        {...gridCellA11y}
                        key={`${cellKey}-${sc.id}`}
                        className={`grid-cell cell-value-cell sub-col-value-td cf-indicator-sub-col ${isLastSubCol ? 'sub-col-last-in-group' : ''} ${isLastColumnGroup && isLastSubCol ? 'sub-col-last-column-group' : ''}${planReviewStripeTexture ? ' cell-plan-review-requester-texture' : ''}`}
                        style={{
                          minWidth: `${columnWidth}px`,
                          width: `${columnWidth}px`,
                          ...(planReviewRequesterHoverTd ? { cursor: 'not-allowed' as const } : {}),
                        }}
                        title={planReviewRequesterHoverTd ? PLAN_REVIEW_REQUESTER_TOOLTIP : undefined}
                      >
                        {cfSubResult?.hasMatch ? (
                          cfSubResult.visualizationType === 'iconSet' ? (
                            <div className="cf-sub-icon-cell">
                              <span className="cf-sub-icon-glyph" style={{ color: accessibleColor }}>
                                {cfSubResult.zoneIcon ?? '●'}
                              </span>
                              <span className="cf-sub-icon-label" style={{ color: accessibleColor }}>
                                {numericText ?? cfSubResult.zoneLabel ?? ''}
                              </span>
                            </div>
                          ) : cfSubResult.visualizationType === 'dataBar' ? (
                            <div className="cf-sub-bar-cell">
                              <div className="cf-sub-bar-track">
                                <div
                                  className="cf-sub-bar-fill"
                                  style={{
                                    width: `${Math.min(100, (cfSubResult.barPercent ?? 0) * (row.type === 'product' ? 8 : 2.2))}%`,
                                    backgroundColor: cfSubResult.indicatorColor,
                                  }}
                                />
                              </div>
                              <span className="cf-sub-bar-pct" style={{ color: 'var(--color-on-surface-strong)' }}>
                                {numericText ?? `${cfSubResult.barPercent ?? 0}%`}
                              </span>
                            </div>
                          ) : cfSubResult.visualizationType === 'divergingBar' ? (() => {
                            // Diverging bar: uses pre-computed barPercent (scaled 0–100 from evalValue).
                            // Zero-line is positioned at where barMin/barMax places 0 in the 0–100 track.
                            const cfRule = cfIndicatorRule;
                            const barMinVal = cfRule.visualization.barMin ?? -50;
                            const barMaxVal = cfRule.visualization.barMax ?? 50;
                            const range = (barMaxVal - barMinVal) || 1;
                            const barPct = cfSubResult.barPercent ?? 0;

                            // Position of "zero" within the 0–100% track
                            const zeroPct = Math.max(0, Math.min(100, ((0 - barMinVal) / range) * 100));
                            const barLeft  = Math.min(barPct, zeroPct);
                            const barRight = Math.max(barPct, zeroPct);
                            const barColor = cfSubResult.indicatorColor;

                            // Re-derive the eval value from barPct for display
                            const evalValDisplay = barMinVal + (barPct / 100) * range;
                            const displayTxt = `${evalValDisplay.toFixed(1)}%`;
                            return (
                              <div className="cf-sub-diverge-cell">
                                <div className="cf-sub-diverge-track">
                                  {/* Zero-line — only show if 0 is within [barMin, barMax] */}
                                  {zeroPct > 0 && zeroPct < 100 && (
                                    <div className="cf-sub-diverge-mid" style={{ left: `${zeroPct}%` }} />
                                  )}
                                  {/* Bar fill */}
                                  <div
                                    className="cf-sub-diverge-fill"
                                    style={{
                                      left: `${barLeft}%`,
                                      width: `${barRight - barLeft}%`,
                                      backgroundColor: barColor,
                                    }}
                                  />
                                </div>
                                <span className="cf-sub-diverge-lbl" style={{ color: 'var(--color-on-surface-strong)' }}>
                                  {displayTxt}
                                </span>
                              </div>
                            );
                          })() : (
                            // colorScale / background — tinted cell with accessible dark text
                            <div
                              className="cf-sub-scale-cell"
                              style={{
                                backgroundColor: cfSubResult.indicatorColor + '40',
                                borderLeft: `3px solid ${cfSubResult.indicatorColor}`,
                              }}
                            >
                              <span style={{ color: accessibleColor, fontWeight: 600 }}>
                                {numericText ?? cfSubResult.zoneLabel ?? '●'}
                              </span>
                            </div>
                          )
                        ) : (
                          <span className="cf-sub-no-match">—</span>
                        )}
                      </td>
                    );
                  }

                  // ── Other sub-columns (YoY, MoM, Target Achievement, etc.) ──
                  const displayVal = getSubColumnValue(sc.id, actualValue, row.id, String(key), (v) => formatValue(v), sc.formula);
                  const color = getSubColumnColor(sc.id, displayVal);
                  const numericSubColValue = getSubColumnNumericValue(sc.id, actualValue, row.id, String(key));
                  const targetAchievementTone = isTargetAchievement
                    ? `target-achievement-td${numericSubColValue > 100 ? ' target-achievement-td-exceeded' : ''}`
                    : '';
                  
                  const subColTextureClass =
                    !isCellRead && planReviewStripeTexture
                      ? 'cell-plan-review-requester-texture'
                      : !isCellRead && shouldShowTexture
                        ? 'cell-readonly-texture'
                        : '';
                  return (
                    <td
                      {...gridCellA11y}
                      key={`${cellKey}-${sc.id}`}
                      className={`grid-cell cell-value-cell sub-col-value-td ${isLastSubCol ? 'sub-col-last-in-group' : ''} ${isLastColumnGroup && isLastSubCol ? 'sub-col-last-column-group' : ''} ${subColTextureClass} ${isAncestorOfFilteredRow ? 'cell-filter-locked' : ''} ${targetAchievementTone}`}
                      style={{
                        minWidth: `${columnWidth}px`,
                        width: `${columnWidth}px`,
                        color: isYoYOrMoM || isTargetAchievement ? 'inherit' : color,
                        ...(planReviewRequesterHoverTd || isAncestorOfFilteredRow ? { cursor: 'not-allowed' as const } : {}),
                      }}
                      onMouseEnter={isAncestorOfFilteredRow ? (e) => setFilterLockHint({ x: e.clientX, y: e.clientY }) : undefined}
                      onMouseMove={isAncestorOfFilteredRow ? (e) => setFilterLockHint({ x: e.clientX, y: e.clientY }) : undefined}
                      onMouseLeave={isAncestorOfFilteredRow ? () => setFilterLockHint(null) : undefined}
                      title={planReviewRequesterHoverTd ? PLAN_REVIEW_REQUESTER_TOOLTIP : undefined}
                    >
                      {isYoYOrMoM ? (
                        renderDataBar(
                          numericSubColValue,
                          sc.id === 'yoy' ? 20 : sc.id === 'variance' ? 15 : 10
                        )
                      ) : isTargetAchievement ? (
                        renderBulletGraph(numericSubColValue)
                      ) : (
                        <span style={{ paddingRight: '8px' }}>{displayVal}</span>
                      )}
                    </td>
                  );
                })}
              </React.Fragment>
            );
          }

          return (
            <td
              key={cellKey}
              {...actualCellProps}
            >
              {renderCellValue(key)}
              {hasCfActive && cfResult?.zoneIcon && editingCell?.monthKey !== key && (
                <span className="cell-cf-icon-overlay" style={{ color: cfResult.iconColor ?? cfResult.indicatorColor }}>
                  {cfResult.zoneIcon}
                </span>
              )}
              {renderPencilIcon(
                key,
                !!isEditable,
                Boolean(
                  approverMayOpenReviewPopover &&
                    planReviewGridLock &&
                    !hasApproverOverrideThisCellTd &&
                    baseValueEditable
                ),
                Boolean(
                  baseValueEditable &&
                    approvalForValueCellTd?.status === 'pending' &&
                    isCurrentUserApprovalRequester(approvalForValueCellTd, currentUser)
                )
              )}
              {showFillHandleForActualCell && (
                <FillHandle
                  cellKey={cellKey}
                  onDragStart={onFillHandleDragStart}
                  onDragMove={onFillHandleDragMove}
                  onDragEnd={onFillHandleDragEnd}
                />
              )}
            </td>
          );
        })}
      </tr>
      {hasChildren && isExpanded && row.children && (
        <>
          {row.children.map((child) => {
            // Inherit groupContext from parent measure
            const childWithContext = row.groupContext ? { ...child, groupContext: row.groupContext } : child;
            return (
              <GridRowComponent
                key={child.id}
                row={childWithContext}
                level={level + 1}
                isExpanded={expandedRows.has(child.id)}
                expandedRows={expandedRows}
                onToggleExpand={onToggleExpand}
                formatValue={formatValue}
                onCellChange={onCellChange}
                visibleTimeKeys={visibleTimeKeys}
                focusedCell={focusedCell}
                onCellFocus={onCellFocus}
                cellRefs={cellRefs}
                editedCells={editedCells}
                impactedCells={impactedCells}
                savedEditedCells={savedEditedCells}
                unsavedNotes={unsavedNotes}
                savedImpactedCells={savedImpactedCells}
                columnWidth={columnWidth}
                searchTerm={searchTerm}
                editHistory={editHistory}
                onCellFocusWithHistory={onCellFocusWithHistory}
                lockedCells={lockedCells}
                onCellContextMenu={onCellContextMenu}
                selectedCells={selectedCells}
                onCellSelect={onCellSelect}
                lastSelectedCell={lastSelectedCell}
                onFillHandleDragStart={onFillHandleDragStart}
                onFillHandleDragMove={onFillHandleDragMove}
                onFillHandleDragEnd={onFillHandleDragEnd}
                isAdjustmentGroupSelected={isAdjustmentGroupSelected}
                onMeasureGroupChange={onMeasureGroupChange}
                measureGroupContext={measureGroupContext}
                onMeasureGroupContextChange={onMeasureGroupContextChange}
                sharedMeasureIds={sharedMeasureIds}
                readCells={_readCells}
                onAddChildNode={onAddChildNode}
                onRemoveChildNode={onRemoveChildNode}
                onFilterChildrenNodes={onFilterChildrenNodes}
                onApplyQuickFilter={onApplyQuickFilter}
                quickFilter={getQuickFilter ? getQuickFilter(child.id) : null}
                getQuickFilter={getQuickFilter}
                onEditNode={onEditNode}
                onShowCharts={onShowCharts}
                onDeleteNode={onDeleteNode}
                onReparentNode={onReparentNode}
                data={data}
                frozenColumns={frozenColumns}
                showAdditionalFrozenColumns={showAdditionalFrozenColumns}
                subColumns={subColumns}
                frozenColWidth={frozenColWidth}
                approvalRequests={approvalRequests}
                onApprovalAction={onApprovalAction}
                onApprovalStatusChangeViewHistory={onApprovalStatusChangeViewHistory}
                onApprovalStatusChangeMarkAsRead={onApprovalStatusChangeMarkAsRead}
                conditionalFormattingRules={conditionalFormattingRules}
                conditionalFormattingColorScaleMerge={conditionalFormattingColorScaleMerge}
                measureId={measureId}
                allCellValues={allCellValues}
                allCellValuesByType={allCellValuesByType}
                isDesignSystemRulesEnabled={isDesignSystemRulesEnabled}
                parentTotalsRollupMode={parentTotalsRollupMode}
                propagateIntoNoMatchRows={propagateIntoNoMatchRows}
                measureEditDisaggregateVisibleChildrenDefault={measureEditDisaggregateVisibleChildrenDefault}
                excludedNoMatchSubtreeRowIds={excludedNoMatchSubtreeRowIdsProp}
                planReviewGridLock={planReviewGridLock}
                planReviewRequesterStripes={planReviewRequesterStripes}
                approverMayOpenReviewPopover={approverMayOpenReviewPopover}
                approverOverrideCellKeys={approverOverrideCellKeys}
                pendingApproverEdit={pendingApproverEdit}
                onPendingApproverEditConsumed={onPendingApproverEditConsumed}
                onManagerOverrideForCell={onManagerOverrideForCell}
                flattenedSortShowAncestorPath={flattenedSortShowAncestorPath}
                descendantColumnFilterRowIds={descendantColumnFilterRowIds}
                rollupValueSourceData={rollupValueSourceData}
              />
            );
          })}
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
        onApplyQuickFilter={(criteria) => {
          if (onApplyQuickFilter) {
            onApplyQuickFilter(row.id, criteria);
          }
        }}
        currentFilter={quickFilter}
        nodeName={row.name}
        nodeType={row.type === 'account' ? 'account' : row.type === 'category' ? 'category' : row.type === 'product' ? 'product' : undefined}
        frozenColumns={frozenColumns}
        childrenNodes={(() => {
          // Use original children from ref (stored before filtering) or fallback to current children
          const allChildren = originalChildrenRef.current || row.children || [];
          return allChildren.map(child => ({
            id: child.id,
            name: child.name,
            isSelected: true // All existing children are selected by default
          }));
        })()}
      />
      {/* Approval Action Popover */}
      <ApprovalActionPopover
        isOpen={approvalPopoverCell !== null}
        cellElement={approvalPopoverCellRef.current}
        approval={approvalPopoverCell ? (() => {
          // Find approval by ID (format: "approval-{cellKey}")
          // Extract cellKey from approvalId
          const cellKey = approvalPopoverCell.replace(/^approval-/, '');
          return (approvalRequests ?? new Map()).get(cellKey) || null;
        })() : null}
        onAction={(approvalId, action, comment, approverRole) => {
          if (onApprovalAction) {
            onApprovalAction(approvalId, action, comment, approverRole);
          }
          setApprovalPopoverCell(null);
          approvalPopoverCellRef.current = null;
        }}
        onClose={() => {
          setApprovalPopoverCell(null);
          approvalPopoverCellRef.current = null;
        }}
      />
      {/* Approval Status Change Popover */}
      {approvalStatusChangePopover && (() => {
        const approval = (approvalRequests ?? new Map()).get(approvalStatusChangePopover.cellKey);
        if (!approval) return null;
        
        return createPortal(
          <ApprovalStatusChangePopover
            approval={approval}
            position={approvalStatusChangePopover.position}
            onShowDetails={() => {
              if (onApprovalStatusChangeViewHistory) {
                onApprovalStatusChangeViewHistory(approvalStatusChangePopover.cellKey);
              }
              setApprovalStatusChangePopover(null);
            }}
            onViewHistory={() => {
              if (onApprovalStatusChangeViewHistory) {
                onApprovalStatusChangeViewHistory(approvalStatusChangePopover.cellKey);
              }
              setApprovalStatusChangePopover(null);
            }}
            onClose={() => {
              setApprovalStatusChangePopover(null);
            }}
            onPopoverMouseEnter={() => {
              isMouseOverPopoverRef.current = true;
              // Cancel any pending close timeout
              if (popoverCloseTimeoutRef.current) {
                clearTimeout(popoverCloseTimeoutRef.current);
                popoverCloseTimeoutRef.current = null;
              }
            }}
            onPopoverMouseLeave={() => {
              isMouseOverPopoverRef.current = false;
              // Close popover after a short delay
              popoverCloseTimeoutRef.current = setTimeout(() => {
                setApprovalStatusChangePopover(null);
              }, 150);
            }}
          />,
          document.body
        );
      })()}
    </>
  );
};

export default GridRowComponent;

