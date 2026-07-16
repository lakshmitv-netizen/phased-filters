import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ApprovalRequest, MeasureData } from '../types';
import { CellEditHistoryEntry } from '../types/editHistory';
import '../styles/components/AlertsPanel.css';

// ── Types ──────────────────────────────────────────────────────────────────────
interface DeadlineTask {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  measureId?: string;
  timeKey?: string;
  cellKeys?: string[];
  type: 'submit' | 'review' | 'approve';
  // Which tab this item belongs to: 'alert' (system-surfaced risk/anomaly) or 'task'
  // (a scheduled to-do). Defaults to 'task' when omitted.
  category?: 'alert' | 'task';
  // Grid focus params
  searchTerm?: string;
  startPeriod?: string;
  endPeriod?: string;
}

export interface FocusGridParams {
  searchTerm?: string;
  startPeriod?: string;
  endPeriod?: string;
  selectedCellKeys?: string[];
  // New filter params for intent-based filtering
  accounts?: string[];
  categories?: string[];
  measures?: string[];
  dimensionLevel?: 'account' | 'category' | 'product';
  // Time granularities to show as columns (e.g. ['month', 'quarter'] to surface the quarter column).
  timeGranularities?: string[];
  // Column-level Bottom-N filter on the category dimension (e.g. the 3 worst-performing categories).
  bottomNCategories?: { n: number; measureId: string; columnKey: string };
  // Generic column-level Top-N / Bottom-N filter (e.g. Bottom 3 accounts by FY26 Order Revenue).
  bottomNColumnFilter?: {
    n: number;
    dimension: 'account' | 'category' | 'product';
    measureId: string;
    columnKey: string; // e.g. 'year' for the FY26 column
    operator?: 'bottomN' | 'topN';
  };
  // For Top-N/Bottom-N: false ranks across the whole grid (exactly N rows total);
  // true (default) ranks within each parent. Used so product Bottom-N shows N rows, not N per category.
  preserveHierarchy?: boolean;
  // When the agent applies this view, expand the full hierarchy (parent → child chevrons)
  // instead of the default tidy collapsed view — used for deep (product) matches.
  expandHierarchy?: boolean;
  // Controls how far the focused view auto-expands: 'all' (default, down to products)
  // or 'categories' (accounts expanded to show categories, categories left collapsed).
  expandLevel?: 'all' | 'categories';
  // When the agent ranks rows (e.g. Bottom-3 accounts by FY26), it can also sort the
  // grid so rows appear in the same order the agent lists them. Expressed as a dimension
  // sort (level + measure) so it shows up in the Sort panel exactly as the user expects.
  sort?: {
    dimension: 'account' | 'category' | 'product';
    measureId: string;                 // measure to sort by (labels the "Sort by" field)
    direction: 'asc' | 'desc';
  };
  // When the agent pins a root-cause to specific cells/periods, it hands over a
  // conditional-formatting highlight spec so those cells light up on the grid.
  highlight?: {
    name: string;
    color?: string;                // hex; defaults to an amber "watch" tint
    cellKeys?: string[];           // explicit `${rowId}-${timeKey}` cells
    measureIds?: string[];         // column-target scope (when cellKeys is empty)
    timeKeys?: string[];           // period columns to highlight
    dimensionLevels?: string[];    // 'account' | 'category' | 'product'
  };
}

const TODAY = new Date('2026-03-17');

const MOCK_DEADLINES: DeadlineTask[] = [
  {
    id: 'dl-1',
    title: 'Submit Q1 Forecast',
    description: 'Sales Agreement Quantity · Jan–Mar 2026',
    dueDate: new Date('2026-03-10'),
    measureId: 'measure-sa-qty',
    type: 'submit',
    searchTerm: 'Sales Agreement',
    startPeriod: 'jan2026',
    endPeriod: 'mar2026',
  },
  {
    id: 'dl-3',
    title: 'Lock Revenue Forecast',
    description: 'Revenue · All accounts · Q2',
    dueDate: new Date('2026-03-28'),
    measureId: 'measure-revenue',
    type: 'submit',
    searchTerm: 'Revenue',
    startPeriod: 'apr2026',
    endPeriod: 'jun2026',
  },
  {
    id: 'dl-4',
    title: 'Reconcile Planned vs Actual',
    description: 'Chassis Components · Jan–Jun 2026',
    dueDate: new Date('2026-04-05'),
    measureId: 'measure-sa-qty',
    type: 'review',
    searchTerm: 'Chassis',
    startPeriod: 'jan2026',
    endPeriod: 'jun2026',
  },
  {
    id: 'dl-5',
    title: 'Urgent: Q2 at Risk - 3 Categories Behind Plan',
    description: 'Michigan + Ohio · Bottom 3 categories by Q2 revenue · $2.3M gap',
    dueDate: new Date('2026-03-19'),
    measureId: 'measure-revenue',
    type: 'review',
    category: 'alert',
    searchTerm: '',
    startPeriod: 'apr2026',
    endPeriod: 'jun2026',
  },
];

const SLA_DAYS = 5;

// ── Helpers ────────────────────────────────────────────────────────────────────
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function formatRelativeTime(d: Date): string {
  const mins = Math.round((TODAY.getTime() - new Date(d).getTime()) / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
function formatTimeKey(tk: string): string {
  return tk.replace(/([a-z]+)(\d{4})/, (_, m, y) =>
    `${m.charAt(0).toUpperCase() + m.slice(1)} ${y}`
  );
}

type TabType = 'all' | 'alerts' | 'tasks';

// ── Props ──────────────────────────────────────────────────────────────────────
interface AlertsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  approvalRequests?: Map<string, ApprovalRequest>;
  editHistory?: CellEditHistoryEntry[];
  data?: MeasureData[];
  onJumpToCell?: (cellKey: string) => void;
  onViewCellHistory?: (cellKey: string) => void;
  onFocusGrid?: (params: FocusGridParams | null) => void;
  /** Injected when arriving from a header-bell approval notification — rendered as a
   *  pinned "Review approval request from <requester>" card, auto-focused. */
  reviewApprovalCard?: {
    id: string;
    requesterName: string;
    summary?: string;
    focusParams: FocusGridParams;
    /** Optional logical sub-sections (measure · branch · contiguous months). When
     *  present, each renders its own "Focus grid" button beneath a "Focus all". */
    chunks?: Array<{ id: string; label: string; focusParams: FocusGridParams }>;
  } | null;
  onDismissReviewApprovalCard?: () => void;
}

// ── FocusGrid toggle button ───────────────────────────────────────────────────
const FocusToggleBtn: React.FC<{
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}> = ({ active, disabled, onClick }) => (
  <button
    className={`alerts-focus-btn ${active ? 'alerts-focus-btn--active' : ''}`}
    disabled={disabled}
    onClick={onClick}
    title={active ? 'Remove grid focus' : 'Focus grid on this item'}
  >
    {/* Target / crosshair icon */}
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="5" y2="12"/>
      <line x1="19" y1="12" x2="22" y2="12"/>
    </svg>
    {active ? 'Focused' : 'Focus grid'}
  </button>
);

// ── Component ──────────────────────────────────────────────────────────────────
const AlertsPanel: React.FC<AlertsPanelProps> = ({
  isOpen,
  onClose,
  approvalRequests = new Map(),
  editHistory = [],
  data = [],
  onJumpToCell: _onJumpToCell,
  onViewCellHistory,
  onFocusGrid,
  reviewApprovalCard = null,
  onDismissReviewApprovalCard,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [showTasks, setShowTasks] = useState(true);
  const [showApprovals, setShowApprovals] = useState(true);
  const [showNotifications, setShowNotifications] = useState(true);
  const [draftShowTasks, setDraftShowTasks] = useState(true);
  const [draftShowApprovals, setDraftShowApprovals] = useState(true);
  const [draftShowNotifications, setDraftShowNotifications] = useState(true);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  const handleFocusToggle = (cardId: string, params: FocusGridParams) => {
    if (focusedCardId === cardId) {
      // Toggle off
      setFocusedCardId(null);
      onFocusGrid?.(null);
    } else {
      setFocusedCardId(cardId);
      onFocusGrid?.(params);
    }
  };

  // When a review-approval card is injected (arriving from a bell notification),
  // show its first section as already "Focused" — the grid focus is applied by the
  // parent on navigation. Falls back to the card id when there are no sections.
  useEffect(() => {
    if (reviewApprovalCard) {
      const firstChunk = reviewApprovalCard.chunks?.[0];
      setFocusedCardId(
        firstChunk ? `${reviewApprovalCard.id}::${firstChunk.id}` : reviewApprovalCard.id
      );
    }
  }, [reviewApprovalCard?.id]);

  // ── Deadline tasks ─────────────────────────────────────────────────────────
  const deadlineTasks = useMemo(() => MOCK_DEADLINES, []);

  // ── Pending-approval SLA tasks ─────────────────────────────────────────────
  const approvalSlaTasks = useMemo(() => {
    const tasks: Array<{
      id: string;
      cellKey: string;
      daysOverdue: number;
      daysRemaining: number;
      approval: ApprovalRequest;
    }> = [];
    approvalRequests.forEach((req, cellKey) => {
      if (req.status === 'pending') {
        const age = diffDays(new Date(req.createdAt), TODAY);
        const daysRemaining = SLA_DAYS - age;
        tasks.push({ id: `sla-${cellKey}`, cellKey, daysOverdue: Math.max(0, -daysRemaining), daysRemaining, approval: req });
      }
    });
    return tasks.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [approvalRequests]);

  // ── Approval notifications ─────────────────────────────────────────────────
  const approvalNotifications = useMemo(() => {
    const APPROVAL_LABELS = ['Not Submitted', 'Pending', 'Approved', 'Rejected'];
    return editHistory
      .filter(e => {
        if (!e.note) return false;
        return APPROVAL_LABELS.some(l => e.note!.startsWith(`${l} →`)) ||
               e.note.includes('→ Approved') || e.note.includes('→ Rejected') ||
               e.note.includes('Finance:') || e.note.includes('Supply Chain:') ||
               e.note.includes('Sales Ops:') || e.note.includes('Product Management:');
      })
      .slice(0, 10)
      .map(e => ({ ...e, notifId: `notif-${e.id}` }));
  }, [editHistory]);

  // ── SLA progress ───────────────────────────────────────────────────────────
  const forecastLockSla = useMemo(() => {
    let total = 0, filled = 0;
    const months = ['jan2026','feb2026','mar2026','apr2026','may2026','jun2026'] as const;
    const walk = (rows: any[]) => {
      rows.forEach(row => {
        if (!row.children || row.children.length === 0) {
          months.forEach(m => {
            total++;
            const v = row[m];
            if (typeof v === 'number' && v > 0) filled++;
          });
        }
        if (row.children) walk(row.children);
      });
    };
    data.forEach(measure => walk(measure.children ?? []));
    return { total: Math.max(1, total), filled };
  }, [data]);

  const approvalSlaProgress = useMemo(() => {
    let total = 0, done = 0;
    approvalRequests.forEach(req => {
      total++;
      if (req.status === 'approved' || req.status === 'rejected') done++;
    });
    return { total: Math.max(1, total), done };
  }, [approvalRequests]);

  const dismiss = (id: string) => setDismissedIds(prev => new Set([...prev, id]));
  const markAllRead = () => {
    const ids = new Set(dismissedIds);
    approvalNotifications.forEach(n => ids.add(n.notifId));
    setDismissedIds(ids);
  };

  // ── Alert / Task partitions ────────────────────────────────────────────────
  const alertDeadlines = deadlineTasks.filter(t => t.category === 'alert');
  const taskDeadlines = deadlineTasks.filter(t => (t.category ?? 'task') === 'task');
  const unreadNotifCount = approvalNotifications.filter(n => !dismissedIds.has(n.notifId)).length;

  // ── Tab badge counts ───────────────────────────────────────────────────────
  // Notifications (approval status updates) surface under Alerts; approvals + the injected
  // review-approval card are actionable Tasks.
  const alertsBadge = alertDeadlines.length + unreadNotifCount;
  const tasksBadge = taskDeadlines.length + approvalSlaTasks.length + (reviewApprovalCard ? 1 : 0);
  const allBadge = alertsBadge + tasksBadge;

  // ── Filter helpers ─────────────────────────────────────────────────────────
  const showAlertsGroup = activeTab === 'all' || activeTab === 'alerts';
  const showTasksGroup = activeTab === 'all' || activeTab === 'tasks';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isFilterPopoverOpen &&
        filterPopoverRef.current &&
        !filterPopoverRef.current.contains(event.target as Node) &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(event.target as Node)
      ) {
        setIsFilterPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterPopoverOpen]);

  // ── Urgency helpers ────────────────────────────────────────────────────────
  const deadlineUrgency = (days: number) => days > 0 ? 'overdue' : days > -3 ? 'urgent' : 'upcoming';

  if (!isOpen) return null;

  // Approvals are all Tasks; the Tasks-group gate controls whether they render.
  const visibleApprovalSlaCards = approvalSlaTasks;
  const contextualPendingCards = visibleApprovalSlaCards.filter(t =>
    Boolean(t.approval.focusContext?.selectedCellKeys?.length)
  );
  const prioritizedCard = contextualPendingCards.sort(
    (a, b) => new Date(b.approval.createdAt).getTime() - new Date(a.approval.createdAt).getTime()
  )[0] ?? null;
  const pinnedApprovalCard = prioritizedCard ?? visibleApprovalSlaCards[0] ?? null;
  const remainingApprovalSlaCards = visibleApprovalSlaCards.filter(t => t.id !== pinnedApprovalCard?.id);

  // Whether any card is focused — used to dim all others
  const anyFocused = focusedCardId !== null;

  // Shared renderer for a deadline card (used by both the Alerts and Tasks sections).
  const renderDeadlineCard = (task: DeadlineTask) => {
    const days = diffDays(task.dueDate, TODAY);
    const urgency = deadlineUrgency(days);
    const isFocused = focusedCardId === task.id;
    const isDimmed = anyFocused && !isFocused;

    // Build focus params - special handling for intent-based filtering task.
    // dl-5 ("Q2 at Risk – 3 Categories Behind Plan"): surface the Q2 quarter column and
    // apply a column-level Bottom-3 filter on the category dimension (by Q2 revenue) so the
    // "3 categories behind" are explicitly the 3 worst-performing categories.
    const focusParams: FocusGridParams = task.id === 'dl-5'
      ? {
          accounts: ['MagnaDrive - Michigan Plant', 'MagnaDrive - Ohio Plant'],
          measures: ['Sales Agreement Revenue'],
          startPeriod: task.startPeriod,
          endPeriod: task.endPeriod,
          timeGranularities: ['month', 'quarter'],
          bottomNCategories: { n: 3, measureId: 'measure-sa-rev', columnKey: 'q2' },
          // Show accounts → categories only (categories collapsed) so the "3 categories
          // behind" read clearly against the card without drilling into products.
          expandLevel: 'categories',
        }
      : {
          searchTerm: task.searchTerm,
          startPeriod: task.startPeriod,
          endPeriod: task.endPeriod,
        };

    return (
      <div
        key={task.id}
        className={`alerts-card alerts-card--${urgency}${isFocused ? ' alerts-card--focused' : ''}${isDimmed ? ' alerts-card--dimmed' : ''}`}
      >
        {/* Card header row */}
        <div className="alerts-card-header">
          <div className="alerts-card-header-left">
            <span className={`alerts-urgency-dot alerts-urgency-dot--${urgency}`}></span>
            <span className="alerts-card-title">{task.title}</span>
          </div>
          <span className={`alerts-type-badge alerts-type-badge--${task.type}`}>
            {task.type === 'submit' ? 'Submit' : 'Review'}
          </span>
        </div>

        {/* Sub / context */}
        <div className="alerts-card-sub">{task.description}</div>

        {/* Deadline chip */}
        <div className="alerts-card-meta">
          {days > 0
            ? <span className="alerts-chip alerts-chip--red">⏱ {days} day{days !== 1 ? 's' : ''} overdue · was due {formatDate(task.dueDate)}</span>
            : days === 0
              ? <span className="alerts-chip alerts-chip--amber">⏱ Due today</span>
              : <span className="alerts-chip alerts-chip--amber">⏱ Due in {-days} day{-days !== 1 ? 's' : ''} ({formatDate(task.dueDate)})</span>
          }
        </div>

        {/* Focus action */}
        {onFocusGrid && (
          <div className="alerts-card-actions">
            <FocusToggleBtn
              active={isFocused}
              disabled={isDimmed}
              onClick={() => handleFocusToggle(task.id, focusParams)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="alerts-panel">
      {/* Header */}
      <div className="alerts-panel-header">
        <div className="alerts-panel-header-left">
          <svg fill="currentColor" viewBox="0 0 24 24" width="16" height="16" className="alerts-panel-header-icon">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
          </svg>
          <span className="alerts-panel-title">Alerts &amp; Tasks</span>
        </div>
        <div className="alerts-panel-header-right">
          <div className="alerts-filter-wrapper">
            <button
              ref={filterButtonRef}
              className={`alerts-filter-btn ${isFilterPopoverOpen ? 'active' : ''}`}
              onClick={() => {
                setDraftShowTasks(showTasks);
                setDraftShowApprovals(showApprovals);
                setDraftShowNotifications(showNotifications);
                setIsFilterPopoverOpen(prev => !prev);
              }}
              aria-label="Filter alerts"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5h18" />
                <path d="M6 12h12" />
                <path d="M10 19h4" />
              </svg>
            </button>
            {isFilterPopoverOpen && (
              <div ref={filterPopoverRef} className="alerts-filter-popover">
                <div className="alerts-filter-popover-nubbin"></div>
                <div className="alerts-filter-popover-content">
                  <div className="alerts-filter-field">
                    <label>Card types</label>
                    <div className="alerts-filter-checkbox-row">
                      <label><input type="checkbox" checked={draftShowTasks} onChange={(e) => setDraftShowTasks(e.target.checked)} /> Tasks</label>
                      <label><input type="checkbox" checked={draftShowApprovals} onChange={(e) => setDraftShowApprovals(e.target.checked)} /> Approvals</label>
                      <label><input type="checkbox" checked={draftShowNotifications} onChange={(e) => setDraftShowNotifications(e.target.checked)} /> Notifications</label>
                    </div>
                  </div>
                  <div className="alerts-filter-actions">
                    <button
                      className="alerts-filter-clear-btn"
                      onClick={() => {
                        setDraftShowTasks(true);
                        setDraftShowApprovals(true);
                        setDraftShowNotifications(true);
                      }}
                    >
                      Clear
                    </button>
                    <button
                      className="alerts-filter-apply-btn"
                      onClick={() => {
                        setShowTasks(draftShowTasks);
                        setShowApprovals(draftShowApprovals);
                        setShowNotifications(draftShowNotifications);
                        setIsFilterPopoverOpen(false);
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        <button className="alerts-panel-close" onClick={onClose} aria-label="Close">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="alerts-panel-tabs">
        {(['all', 'alerts', 'tasks'] as TabType[]).map(tab => (
          <button
            key={tab}
            className={`alerts-panel-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'all' ? 'All' : tab === 'alerts' ? 'Alerts' : 'Tasks'}
            {tab === 'all'    && allBadge    > 0 && <span className="alerts-tab-badge alerts-tab-badge--grey">{allBadge}</span>}
            {tab === 'alerts' && alertsBadge > 0 && <span className="alerts-tab-badge alerts-tab-badge--red">{alertsBadge}</span>}
            {tab === 'tasks'  && tasksBadge  > 0 && <span className="alerts-tab-badge alerts-tab-badge--amber">{tasksBadge}</span>}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="alerts-panel-body">

        {/* ── Injected review-approval card (from a header-bell notification) ── */}
        {showTasksGroup && reviewApprovalCard && (() => {
          const t = reviewApprovalCard;
          const chunks = t.chunks ?? [];
          const hasChunks = chunks.length > 0;
          // The card counts as focused if any of its sections is active, so
          // focusing one section doesn't dim the whole card.
          const isFocused =
            focusedCardId === t.id ||
            (!!focusedCardId && focusedCardId.startsWith(`${t.id}::`));
          const isDimmed = anyFocused && !isFocused;
          return (
            <div
              key={t.id}
              className={`alerts-card alerts-card--urgent${isFocused ? ' alerts-card--focused' : ''}${isDimmed ? ' alerts-card--dimmed' : ''}`}
            >
              <div className="alerts-card-header">
                <div className="alerts-card-header-left">
                  <span className="alerts-urgency-dot alerts-urgency-dot--urgent"></span>
                  <span className="alerts-card-title">Review approval request from {t.requesterName}</span>
                </div>
                <span className="alerts-type-badge alerts-type-badge--approve">Approval</span>
              </div>

              {t.summary && <div className="alerts-card-sub">{t.summary}</div>}

              <div className="alerts-card-meta">
                <span className="alerts-chip alerts-chip--amber">⏱ Awaiting your decision</span>
                {chunks.length > 1 && (
                  <span className="alerts-chip">{chunks.length} sections</span>
                )}
              </div>

              {onDismissReviewApprovalCard && (
                <div className="alerts-card-actions">
                  <button className="alerts-link-btn" onClick={onDismissReviewApprovalCard}>
                    Dismiss
                  </button>
                </div>
              )}

              {onFocusGrid && hasChunks && (
                <div className="alerts-chunk-list">
                  {chunks.map((chunk) => {
                    const chunkId = `${t.id}::${chunk.id}`;
                    return (
                      <div key={chunkId} className="alerts-chunk-row">
                        <span className="alerts-chunk-label">{chunk.label}</span>
                        <FocusToggleBtn
                          active={focusedCardId === chunkId}
                          disabled={false}
                          onClick={() => handleFocusToggle(chunkId, chunk.focusParams)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── ALERTS ────────────────────────────────────────────── */}
        {showAlertsGroup && showTasks && alertDeadlines.length > 0 && (
          <>
            <div className="alerts-section-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              Alerts
            </div>
            {alertDeadlines.map(renderDeadlineCard)}
          </>
        )}

        {/* ── TASKS ─────────────────────────────────────────────── */}
        {showTasksGroup && ((showTasks && taskDeadlines.length > 0) || (showApprovals && visibleApprovalSlaCards.length > 0)) && (
          <>
            <div className="alerts-section-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              Tasks
            </div>

            {/* Pinned top approval card (only one) */}
            {showApprovals && pinnedApprovalCard && (() => {
              const t = pinnedApprovalCard;
              const urgency = t.daysRemaining < 0 ? 'overdue' : t.daysRemaining <= 2 ? 'urgent' : 'upcoming';
              const cellParts = t.cellKey.split('-');
              const timeKey = cellParts[cellParts.length - 1];
              const isFocused = focusedCardId === t.id;
              const isDimmed = anyFocused && !isFocused;
              const fc = t.approval.focusContext;
              const focusParams: FocusGridParams = {
                searchTerm: fc?.searchTerm,
                startPeriod: fc?.startPeriod ?? timeKey,
                endPeriod: fc?.endPeriod ?? timeKey,
                selectedCellKeys: fc?.selectedCellKeys,
              };

              return (
                <div
                  key={t.id}
                  className={`alerts-card alerts-card--${urgency}${isFocused ? ' alerts-card--focused' : ''}${isDimmed ? ' alerts-card--dimmed' : ''}`}
                >
                  <div className="alerts-card-header">
                    <div className="alerts-card-header-left">
                      <span className={`alerts-urgency-dot alerts-urgency-dot--${urgency}`}></span>
                      <span className="alerts-card-title">Approval Pending</span>
                    </div>
                    <span className="alerts-type-badge alerts-type-badge--approve">Approval</span>
                  </div>

                  <div className="alerts-card-sub">
                    {fc?.measureSummary || t.approval.requesterName}
                    {' · '}
                    {fc?.startPeriod && fc?.endPeriod
                      ? `${formatTimeKey(fc.startPeriod)}–${formatTimeKey(fc.endPeriod)}`
                      : formatTimeKey(timeKey)}
                    {fc?.dimensionSummary ? ` · ${fc.dimensionSummary}` : ''}
                  </div>

                  <div className="alerts-card-meta">
                    {t.daysRemaining < 0
                      ? <span className="alerts-chip alerts-chip--red">⏱ SLA exceeded by {t.daysOverdue} day{t.daysOverdue !== 1 ? 's' : ''}</span>
                      : <span className="alerts-chip alerts-chip--amber">⏱ SLA: {t.daysRemaining} day{t.daysRemaining !== 1 ? 's' : ''} remaining</span>
                    }
                  </div>

                  {onFocusGrid && (
                    <div className="alerts-card-actions">
                      <FocusToggleBtn
                        active={isFocused}
                        disabled={isDimmed}
                        onClick={() => handleFocusToggle(t.id, focusParams)}
                      />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Deadline task cards */}
            {showTasks && taskDeadlines.map(renderDeadlineCard)}

            {/* Remaining approval cards (keep in regular order below tasks) */}
            {showApprovals && remainingApprovalSlaCards.map(t => {
              const urgency = t.daysRemaining < 0 ? 'overdue' : t.daysRemaining <= 2 ? 'urgent' : 'upcoming';
              const cellParts = t.cellKey.split('-');
              const timeKey = cellParts[cellParts.length - 1];
              const isFocused = focusedCardId === t.id;
              const isDimmed = anyFocused && !isFocused;
              const fc = t.approval.focusContext;
              const focusParams: FocusGridParams = {
                searchTerm: fc?.searchTerm,
                startPeriod: fc?.startPeriod ?? timeKey,
                endPeriod: fc?.endPeriod ?? timeKey,
                selectedCellKeys: fc?.selectedCellKeys,
              };

              return (
                <div
                  key={t.id}
                  className={`alerts-card alerts-card--${urgency}${isFocused ? ' alerts-card--focused' : ''}${isDimmed ? ' alerts-card--dimmed' : ''}`}
                >
                  <div className="alerts-card-header">
                    <div className="alerts-card-header-left">
                      <span className={`alerts-urgency-dot alerts-urgency-dot--${urgency}`}></span>
                      <span className="alerts-card-title">Approval Pending</span>
                    </div>
                    <span className="alerts-type-badge alerts-type-badge--approve">Approval</span>
                  </div>

                  <div className="alerts-card-sub">
                    {fc?.measureSummary || t.approval.requesterName}
                    {' · '}
                    {fc?.startPeriod && fc?.endPeriod
                      ? `${formatTimeKey(fc.startPeriod)}–${formatTimeKey(fc.endPeriod)}`
                      : formatTimeKey(timeKey)}
                    {fc?.dimensionSummary ? ` · ${fc.dimensionSummary}` : ''}
                  </div>

                  <div className="alerts-card-meta">
                    {t.daysRemaining < 0
                      ? <span className="alerts-chip alerts-chip--red">⏱ SLA exceeded by {t.daysOverdue} day{t.daysOverdue !== 1 ? 's' : ''}</span>
                      : <span className="alerts-chip alerts-chip--amber">⏱ SLA: {t.daysRemaining} day{t.daysRemaining !== 1 ? 's' : ''} remaining</span>
                    }
                  </div>

                  {onFocusGrid && (
                    <div className="alerts-card-actions">
                      <FocusToggleBtn
                        active={isFocused}
                        disabled={isDimmed}
                        onClick={() => handleFocusToggle(t.id, focusParams)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ── NOTIFICATIONS (surfaced under Alerts) ─────────────── */}
        {showAlertsGroup && showNotifications && approvalNotifications.some(n => !dismissedIds.has(n.notifId)) && (
          <>
            <div className="alerts-section-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              Notifications
            </div>
            {approvalNotifications
              .filter(n => !dismissedIds.has(n.notifId))
              .map(n => {
                const isApproved = n.note?.includes('→ Approved') || n.note?.includes('Approved');
                const isRejected = n.note?.includes('→ Rejected') || n.note?.includes('Rejected');
                const urgency = isRejected ? 'overdue' : isApproved ? 'approved' : 'upcoming';
                const notifCardId = n.notifId;
                const isFocused = focusedCardId === notifCardId;
                const isDimmed = anyFocused && !isFocused;

                // Parse timeKey for focus
                const cellParts = n.cellKey?.split('-') ?? [];
                const timeKey = cellParts[cellParts.length - 1];
                const focusParams: FocusGridParams = { startPeriod: timeKey, endPeriod: timeKey };

                return (
                  <div
                    key={n.notifId}
                    className={`alerts-card alerts-card--${urgency}${isFocused ? ' alerts-card--focused' : ''}${isDimmed ? ' alerts-card--dimmed' : ''}`}
                  >
                    <div className="alerts-card-header">
                      <div className="alerts-card-header-left">
                        <span className={`alerts-urgency-dot alerts-urgency-dot--${urgency}`}></span>
                        <span className="alerts-card-title">
                          {isApproved ? '✓ ' : isRejected ? '✗ ' : ''}{n.userName}
                        </span>
                      </div>
                      <span className="alerts-chip alerts-chip--grey" style={{ fontSize: 10 }}>{formatRelativeTime(n.timestamp)}</span>
                    </div>

                    <div className="alerts-card-sub alerts-card-note">
                      {n.note && n.note.length > 80 ? n.note.slice(0, 80) + '…' : n.note}
                    </div>

                    <div className="alerts-card-actions">
                      {onViewCellHistory && n.cellKey && (
                        <button className="alerts-link-btn" onClick={() => onViewCellHistory(n.cellKey!)}>
                          View cell →
                        </button>
                      )}
                      {onFocusGrid && (
                        <FocusToggleBtn
                          active={isFocused}
                          disabled={isDimmed}
                          onClick={() => handleFocusToggle(notifCardId, focusParams)}
                        />
                      )}
                      <button className="alerts-dismiss-btn" onClick={() => dismiss(n.notifId)}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
          </>
        )}

        {/* ── SLA TRACKER ───────────────────────────────────────── */}
        {activeTab === 'all' && (
          <>
            <div className="alerts-section-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              SLA Tracker
            </div>
            <div className="alerts-sla-card">
              <div className="alerts-sla-card-row">
                <span className="alerts-sla-title">Forecast Lock Deadline</span>
                <span className="alerts-sla-date">Mar 25</span>
              </div>
              <div className="alerts-sla-bar-track">
                <div className="alerts-sla-bar-fill" style={{ width: `${Math.min(100, Math.round((forecastLockSla.filled / forecastLockSla.total) * 100))}%` }} />
              </div>
              <div className="alerts-sla-card-row alerts-sla-card-row--meta">
                <span>{forecastLockSla.filled} of {forecastLockSla.total} cells updated</span>
                <span>{Math.round((forecastLockSla.filled / forecastLockSla.total) * 100)}%</span>
              </div>
            </div>
            <div className="alerts-sla-card">
              <div className="alerts-sla-card-row">
                <span className="alerts-sla-title">Approval SLA</span>
                <span className="alerts-sla-date">5-day SLA</span>
              </div>
              <div className="alerts-sla-bar-track">
                <div className="alerts-sla-bar-fill alerts-sla-bar-fill--green" style={{ width: `${Math.min(100, Math.round((approvalSlaProgress.done / approvalSlaProgress.total) * 100))}%` }} />
              </div>
              <div className="alerts-sla-card-row alerts-sla-card-row--meta">
                <span>{approvalSlaProgress.done} of {approvalSlaProgress.total} approvals resolved</span>
                <span>{Math.round((approvalSlaProgress.done / approvalSlaProgress.total) * 100)}%</span>
              </div>
            </div>
          </>
        )}

        {/* ── Empty states ───────────────────────────────────────── */}
        {activeTab === 'alerts' && alertsBadge === 0 && (
          <div className="alerts-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
            <p>No alerts</p>
            <span>Nothing needs your attention right now</span>
          </div>
        )}
        {activeTab === 'tasks' && tasksBadge === 0 && (
          <div className="alerts-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
            <p>No tasks</p>
            <span>You're all caught up!</span>
          </div>
        )}
        {activeTab === 'all' && allBadge === 0 && (
          <div className="alerts-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
            <p>All clear</p>
            <span>No alerts or tasks right now</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="alerts-panel-footer">
        <button className="alerts-footer-btn alerts-footer-btn--ghost" onClick={markAllRead}>
          Mark all read
        </button>
        <button className="alerts-footer-btn alerts-footer-btn--ghost" onClick={() => setDismissedIds(new Set(approvalNotifications.map(n => n.notifId)))}>
          Clear notifications
        </button>
      </div>
    </div>
  );
};

export default AlertsPanel;
