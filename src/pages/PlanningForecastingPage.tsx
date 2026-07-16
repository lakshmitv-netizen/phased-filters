import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import SalesforcePath from '../components/SalesforcePath';
import { APPROVER_ROSTER } from '../types/approvalRequest';
import {
  usePlanWorkflow,
  type PlanWorkflowStatus,
} from '../contexts/PlanWorkflowContext';
import { useCurrentUser } from '../contexts/UserContext';
import { useNotifications } from '../contexts/NotificationsContext';
import type { ApprovalNotificationFocusContext } from '../contexts/NotificationsContext';
import { usePlanningGridSession } from '../contexts/PlanningGridSessionContext';
import type { CellEditHistoryEntry } from '../types/editHistory';
import { useIndustry, getGridPathForIndustry } from '../contexts/IndustryContext';
import ScopedNotification from '../components/ScopedNotification';
import ExportCsvModal from '../components/ExportCsvModal';
import '../styles/pages/PlanningForecastingPage.css';

const PLAN_FOCUS_MONTH_ORDER = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
];

/** Build an approval focus context from the requester's grid edits, so the
 *  approver's review card can focus the grid on the cells that actually changed.
 *  Only month-level value edits made by the requester are included. */
function buildPlanFocusContextFromEdits(
  editHistory: CellEditHistoryEntry[] | undefined,
  requesterUserId: string,
): ApprovalNotificationFocusContext | undefined {
  if (!editHistory || editHistory.length === 0) return undefined;

  const seen = new Set<string>();
  const cellKeys: string[] = [];
  for (const entry of editHistory) {
    // Skip note-only entries (no value change).
    if (entry.oldValue === undefined && entry.newValue === undefined) continue;
    // Only the requester's own edits.
    if (requesterUserId && entry.userId && entry.userId !== requesterUserId) continue;
    const timeKey = (entry.timeKey || entry.cellKey.split('-').pop() || '').toLowerCase();
    if (PLAN_FOCUS_MONTH_ORDER.indexOf(timeKey) === -1) continue; // month value cells only
    if (seen.has(entry.cellKey)) continue;
    seen.add(entry.cellKey);
    cellKeys.push(entry.cellKey);
  }
  if (cellKeys.length === 0) return undefined;

  const months = cellKeys
    .map((k) => (k.split('-').pop() || '').toLowerCase())
    .filter((m) => PLAN_FOCUS_MONTH_ORDER.includes(m))
    .sort((a, b) => PLAN_FOCUS_MONTH_ORDER.indexOf(a) - PLAN_FOCUS_MONTH_ORDER.indexOf(b));

  return {
    selectedCellKeys: cellKeys,
    startPeriod: months[0],
    endPeriod: months[months.length - 1],
  };
}

const PLAN_STATUS_TO_PATH_ID: Record<PlanWorkflowStatus, string> = {
  Draft: 'draft',
  Submitted: 'submitted',
  'Approved / Rejected': 'approved_rejected',
  'Active / Expired': 'active_expired',
};

const PATH_ID_TO_PLAN_STATUS: Record<string, PlanWorkflowStatus> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved_rejected: 'Approved / Rejected',
  active_expired: 'Active / Expired',
};

const PLAN_STATUS_ORDER: PlanWorkflowStatus[] = [
  'Draft',
  'Submitted',
  'Approved / Rejected',
  'Active / Expired',
];

const APPROVER_DISPLAY_ORDER = ['Finance', 'Supply Chain', 'Sales Ops', 'Product Management'] as const;

/** List `mockRecords` id for FY26 — used when opening Clone from this record page. */
const RECORD_PAGE_CLONE_SOURCE_ID = 'fy26';

/** Mock rows for the Approvals related list (status overridden when plan approval is withdrawn). */
const RELATED_APPROVAL_LIST_ROWS: Array<{
  request: string;
  role: string;
  assignee: string;
  status: string;
  updated: string;
}> = [
  { request: 'Forecast Consensus - Feb 2026', role: 'Finance', assignee: 'Alice Brennan', status: 'Pending', updated: '2h ago' },
  { request: 'Forecast Consensus - Feb 2026', role: 'Supply Chain', assignee: 'Bob Okoro', status: 'Pending', updated: '2h ago' },
  { request: 'Forecast Consensus - Feb 2026', role: 'Sales Ops', assignee: 'Carol Singh', status: 'Approved', updated: '5m ago' },
  { request: 'Forecast Consensus - Feb 2026', role: 'Product Management', assignee: 'David Lee', status: 'Pending', updated: '2h ago' },
];

function getNextPlanStatus(current: PlanWorkflowStatus): PlanWorkflowStatus | null {
  const i = PLAN_STATUS_ORDER.indexOf(current);
  if (i < 0 || i >= PLAN_STATUS_ORDER.length - 1) return null;
  return PLAN_STATUS_ORDER[i + 1];
}

type ApproverPlanDecisionOutcome = 'approved' | 'approvedWithCondition' | 'rejected';

function approverPlanDecisionLabel(outcome: ApproverPlanDecisionOutcome): string {
  switch (outcome) {
    case 'approved':
      return 'Approved';
    case 'approvedWithCondition':
      return 'Approved with condition';
    case 'rejected':
      return 'Rejected';
    default:
      return outcome;
  }
}

const PlanningForecastingPage: React.FC = () => {
  const navigate = useNavigate();
  const { industry } = useIndustry();
  const gridHomePath = getGridPathForIndustry(industry);
  const { currentUser } = useCurrentUser();
  const { session } = usePlanningGridSession();
  const {
    publishPlanApprovalRequested,
    publishPlanApproverDecisionForRequester,
    withdrawPlanApprovalNotifications,
  } = useNotifications();
  const { planStatus, setPlanStatus, setPlanSubmittedByUserId, planSubmittedByUserId } = usePlanWorkflow();
  const pathCurrentId = PLAN_STATUS_TO_PATH_ID[planStatus];
  const [submitApprovalModalOpen, setSubmitApprovalModalOpen] = useState(false);
  const [submitForApprovalNotes, setSubmitForApprovalNotes] = useState('');
  const [selectedPathStepId, setSelectedPathStepId] = useState<string | null>(null);
  const [withdrawToDraftModalOpen, setWithdrawToDraftModalOpen] = useState(false);
  const [withdrawalReasonNote, setWithdrawalReasonNote] = useState('');
  /** After Submitted → Draft withdrawal, related list rows show Withdrawn until next submit. */
  const [relatedApprovalsWithdrawn, setRelatedApprovalsWithdrawn] = useState(false);
  const [planSubmittedForReviewToastVisible, setPlanSubmittedForReviewToastVisible] = useState(false);
  const [approverDecisionModalOpen, setApproverDecisionModalOpen] = useState(false);
  const [approverPlanDecision, setApproverPlanDecision] = useState<ApproverPlanDecisionOutcome>('approved');
  const [approverPlanNotes, setApproverPlanNotes] = useState('');
  const [lastRecordedPlanDecision, setLastRecordedPlanDecision] = useState<{
    outcome: ApproverPlanDecisionOutcome;
    notes: string;
    deciderName: string;
  } | null>(null);
  const [decisionFactorsExpanded, setDecisionFactorsExpanded] = useState(true);

  const [recordHeaderMenuOpen, setRecordHeaderMenuOpen] = useState(false);
  const [recordHeaderMenuPosition, setRecordHeaderMenuPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const recordHeaderMenuRef = useRef<HTMLDivElement>(null);
  const [exportCsvModalOpen, setExportCsvModalOpen] = useState(false);

  useEffect(() => {
    if (!recordHeaderMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (recordHeaderMenuRef.current?.contains(t)) return;
      const el = t as Element;
      if (typeof el.closest === 'function' && el.closest('.planning-header-btn-group__chevron')) return;
      setRecordHeaderMenuOpen(false);
      setRecordHeaderMenuPosition(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [recordHeaderMenuOpen]);

  useEffect(() => {
    setSelectedPathStepId(null);
  }, [planStatus]);

  const handlePathStepClick = useCallback((stepId: string) => {
    setSelectedPathStepId(stepId);
  }, []);

  const openApproverDecisionModal = useCallback(() => {
    setApproverPlanDecision('approved');
    setApproverPlanNotes('');
    setApproverDecisionModalOpen(true);
  }, []);

  const handleMarkPathAdvance = useCallback(() => {
    if (planStatus === 'Active / Expired') return;

    if (selectedPathStepId) {
      const targetStatus = PATH_ID_TO_PLAN_STATUS[selectedPathStepId];
      if (!targetStatus) return;
      const currentPathId = PLAN_STATUS_TO_PATH_ID[planStatus];
      if (selectedPathStepId === currentPathId) {
        setSelectedPathStepId(null);
        return;
      }
      if (planStatus === 'Submitted' && targetStatus === 'Draft') {
        setWithdrawalReasonNote('');
        setWithdrawToDraftModalOpen(true);
        return;
      }
      if (planStatus === 'Submitted' && targetStatus === 'Approved / Rejected') {
        openApproverDecisionModal();
        return;
      }
      if (planStatus === 'Draft' && targetStatus === 'Submitted') {
        setSubmitApprovalModalOpen(true);
        return;
      }
      setPlanStatus(targetStatus);
      setSelectedPathStepId(null);
      return;
    }

    if (planStatus === 'Draft') {
      setSubmitApprovalModalOpen(true);
      return;
    }
    if (planStatus === 'Submitted') {
      const next = getNextPlanStatus(planStatus);
      if (next === 'Approved / Rejected') {
        openApproverDecisionModal();
        return;
      }
    }
    const next = getNextPlanStatus(planStatus);
    if (next) setPlanStatus(next);
  }, [planStatus, setPlanStatus, selectedPathStepId, openApproverDecisionModal]);

  const handleConfirmDraftToInReview = useCallback(() => {
    const focusContext = buildPlanFocusContextFromEdits(session?.editHistory, currentUser.id);
    publishPlanApprovalRequested({
      requesterName: currentUser.name,
      requesterUserId: currentUser.id,
      notes: submitForApprovalNotes.trim() || undefined,
      focusContext,
    });
    setPlanSubmittedByUserId(currentUser.id);
    setPlanStatus('Submitted');
    setSubmitApprovalModalOpen(false);
    setSubmitForApprovalNotes('');
    setSelectedPathStepId(null);
    setRelatedApprovalsWithdrawn(false);
    setLastRecordedPlanDecision(null);
    setPlanSubmittedForReviewToastVisible(true);
  }, [
    setPlanStatus,
    setPlanSubmittedByUserId,
    currentUser.id,
    currentUser.name,
    publishPlanApprovalRequested,
    submitForApprovalNotes,
    session,
  ]);

  useEffect(() => {
    if (!planSubmittedForReviewToastVisible) return;
    const timer = window.setTimeout(() => setPlanSubmittedForReviewToastVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, [planSubmittedForReviewToastVisible]);

  const handleCloseSubmitApprovalModal = useCallback(() => {
    setSubmitApprovalModalOpen(false);
    setSubmitForApprovalNotes('');
  }, []);

  const handleCloseWithdrawToDraftModal = useCallback(() => {
    setWithdrawToDraftModalOpen(false);
    setWithdrawalReasonNote('');
  }, []);

  const handleConfirmWithdrawToDraft = useCallback(() => {
    const note = withdrawalReasonNote.trim();
    if (!note) return;
    withdrawPlanApprovalNotifications();
    setPlanStatus('Draft');
    setRelatedApprovalsWithdrawn(true);
    setWithdrawToDraftModalOpen(false);
    setWithdrawalReasonNote('');
    setSelectedPathStepId(null);
    setLastRecordedPlanDecision(null);
  }, [setPlanStatus, withdrawalReasonNote, withdrawPlanApprovalNotifications]);

  const handleCloseApproverDecisionModal = useCallback(() => {
    setApproverDecisionModalOpen(false);
    setApproverPlanNotes('');
    setApproverPlanDecision('approved');
  }, []);

  const handleConfirmApproverPlanDecision = useCallback(() => {
    const requesterId = planSubmittedByUserId;
    setLastRecordedPlanDecision({
      outcome: approverPlanDecision,
      notes: approverPlanNotes.trim(),
      deciderName: currentUser.name,
    });
    setPlanStatus('Approved / Rejected');
    setApproverDecisionModalOpen(false);
    setApproverPlanNotes('');
    setApproverPlanDecision('approved');
    setSelectedPathStepId(null);
    if (requesterId) {
      publishPlanApproverDecisionForRequester({
        requesterUserId: requesterId,
        approverName: currentUser.name,
        outcome: approverPlanDecision,
        notes: approverPlanNotes.trim() || undefined,
      });
    }
  }, [
    approverPlanDecision,
    approverPlanNotes,
    currentUser.name,
    planSubmittedByUserId,
    publishPlanApproverDecisionForRequester,
    setPlanStatus,
  ]);

  useEffect(() => {
    if (!approverDecisionModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseApproverDecisionModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [approverDecisionModalOpen, handleCloseApproverDecisionModal]);

  useEffect(() => {
    if (submitApprovalModalOpen) {
      setSubmitForApprovalNotes('');
    }
  }, [submitApprovalModalOpen]);

  useEffect(() => {
    if (!submitApprovalModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseSubmitApprovalModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [submitApprovalModalOpen, handleCloseSubmitApprovalModal]);

  useEffect(() => {
    if (!withdrawToDraftModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseWithdrawToDraftModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [withdrawToDraftModalOpen, handleCloseWithdrawToDraftModal]);

  const [leftTab, setLeftTab] = useState<'details' | 'related' | 'grid-config'>('details');
  const [rightTab, setRightTab] = useState<'activity' | 'chatter'>('activity');
  const [gridConfigTab] = useState<'mvp' | 'post-mvp'>('mvp');
  const [criteriaRowCount, setCriteriaRowCount] = useState<number>(2);
  const [postMvpCriteriaRowCount, setPostMvpCriteriaRowCount] = useState<number>(4);
  const [selectedHierarchyLevel, setSelectedHierarchyLevel] = useState<string>('Category');
  const [focusedSearchInput, setFocusedSearchInput] = useState<number | null>(null);
  
  // Initialize with prefilled values
  const initialDimensions = new Map<number, string>([
    [0, 'Account'],
    [1, 'Category'],
    [2, 'Account'],
    [3, 'Category']
  ]);
  const initialFields = new Map<number, string>([
    [0, 'City'],
    [1, 'Category Name'],
    [2, 'AnnualRevenue'],
    [3, 'Category Name']
  ]);
  const initialOperators = new Map<number, string>([
    [0, 'Equals'],
    [1, 'Equals'],
    [2, 'Greater Than'],
    [3, 'Equals']
  ]);
  const initialValues = new Map<number, string>([
    [0, 'Bangalore'],
    [1, 'Transmission Assemblies'],
    [2, '$ 12,500,000'],
    [3, 'Chassis Components']
  ]);
  
  const [selectedFields, setSelectedFields] = useState<Map<number, string>>(initialFields);
  const [selectedDimensions, setSelectedDimensions] = useState<Map<number, string>>(initialDimensions);
  const [selectedOperators, setSelectedOperators] = useState<Map<number, string>>(initialOperators);
  const [selectedValues, setSelectedValues] = useState<Map<number, string>>(initialValues);
  const [criteriaLogic, setCriteriaLogic] = useState<string>('(1 AND 2) OR (3 AND 4)');

  // Update criteria logic when row count changes (only if user hasn't manually edited it)
  useEffect(() => {
    // Only auto-update if the logic matches the default pattern
    const defaultPattern = Array.from({ length: postMvpCriteriaRowCount }, (_, i) => `(${i + 1})`).join(' AND ');
    // Don't override if it's the custom prefilled logic
    if (criteriaLogic === '(1 AND 2) OR (3 AND 4)') {
      return;
    }
    if (criteriaLogic === defaultPattern || criteriaLogic.match(/^\(\d+\)( AND \(\d+\))*$/)) {
      const newLogic = Array.from({ length: postMvpCriteriaRowCount }, (_, i) => `(${i + 1})`).join(' AND ');
      setCriteriaLogic(newLogic);
    }
  }, [postMvpCriteriaRowCount, criteriaLogic]);

  // Get dropdown options based on selected hierarchy level
  const getHierarchyOptions = (level: string): string[] => {
    const hierarchy: string[] = ['Parent Account', 'Account', 'Category', 'Product'];
    const levelIndex = hierarchy.indexOf(level);
    if (levelIndex === -1) return hierarchy;
    // Return current level and all ancestor levels
    return hierarchy.slice(0, levelIndex + 1).reverse();
  };

  // Get fields based on selected hierarchy level
  const getFieldsForLevel = (level: string): string[] => {
    switch (level) {
      case 'Account':
        return ['Account Name', 'City', 'AnnualRevenue'];
      case 'Parent Account':
        return ['Account Name', 'City', 'AnnualRevenue'];
      case 'Category':
        return ['Category Name', 'CatalogID', 'Status'];
      case 'Product':
        return ['Product Name', 'SKU', 'Status', 'Price'];
      default:
        return [];
    }
  };

  return (
    <div className="app">
      <Header />
      <div className="main-content planning-forecasting-page">
        {/* Page Header */}
        <div className="planning-page-header">
          <div className="planning-page-header-left">
            <div className="planning-page-icon">
              <span className="planning-page-icon-letter">P</span>
            </div>
            <div className="planning-page-title-section">
              <Link to="/planning-forecasting-list" className="planning-page-subtitle">Planning & Forecasting</Link>
              <div className="planning-page-title-row">
                <h1 className="planning-page-title">Planning & Forecasting FY26</h1>
                <svg className="planning-page-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          <div className="planning-page-header-right">
            <div className="planning-header-btn-group">
              <Link to={gridHomePath} className="planning-header-btn-group__primary">
                View Grid
              </Link>
              <button
                type="button"
                className="planning-header-btn-group__chevron"
                aria-expanded={recordHeaderMenuOpen}
                aria-haspopup="menu"
                aria-label="More actions"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (recordHeaderMenuOpen) {
                    setRecordHeaderMenuOpen(false);
                    setRecordHeaderMenuPosition(null);
                  } else {
                    setRecordHeaderMenuOpen(true);
                    setRecordHeaderMenuPosition({
                      top: rect.bottom + 4,
                      left: Math.max(8, rect.right - 180),
                    });
                  }
                }}
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M3 4.5L6 7.5L9 4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="planning-page-main">
          <div className="planning-page-path-section">
            <SalesforcePath
              currentStepId={pathCurrentId}
              selectedStepId={selectedPathStepId}
              onStepClick={handlePathStepClick}
              showMarkComplete={planStatus !== 'Active / Expired'}
              onMarkComplete={handleMarkPathAdvance}
              markCompleteLabel={
                selectedPathStepId ? 'Mark As Current Status' : 'Mark as Complete'
              }
            />
          </div>

          {/* Main Content - Two Panels */}
          <div className="planning-content-panels">
          {/* Left Panel */}
          <div className="planning-left-panel">
            <div className="planning-panel-tabs">
              <button 
                className={`planning-tab ${leftTab === 'details' ? 'active' : ''}`}
                onClick={() => setLeftTab('details')}
              >
                Details
              </button>
              <button
                className={`planning-tab ${leftTab === 'related' ? 'active' : ''}`}
                onClick={() => setLeftTab('related')}
              >
                Related
              </button>
            </div>
            <div className="planning-panel-content">
              {leftTab === 'details' && (
                <div className="planning-information-section">
                  <h3 className="planning-section-title">Information</h3>
                  <div className="planning-info-field">
                    <label className="planning-info-label">Plan Name</label>
                    <div className="planning-info-value">Planning & Forecasting FY26</div>
                  </div>
                  <div className="planning-info-field">
                    <label className="planning-info-label">Plan Status</label>
                    <div className="planning-info-value">{planStatus}</div>
                  </div>
                  {lastRecordedPlanDecision &&
                    (planStatus === 'Approved / Rejected' || planStatus === 'Active / Expired') && (
                      <>
                        <div className="planning-info-field">
                          <label className="planning-info-label">Approver decision</label>
                          <div className="planning-info-value">
                            {approverPlanDecisionLabel(lastRecordedPlanDecision.outcome)}
                          </div>
                        </div>
                        <div className="planning-info-field">
                          <label className="planning-info-label">Decision notes</label>
                          <div className="planning-info-value">
                            {lastRecordedPlanDecision.notes || '—'}
                          </div>
                        </div>
                        <div className="planning-info-field">
                          <label className="planning-info-label">Recorded by</label>
                          <div className="planning-info-value">{lastRecordedPlanDecision.deciderName}</div>
                        </div>
                      </>
                    )}
                  <div className="planning-info-field">
                    <label className="planning-info-label">Fiscal Year</label>
                    <div className="planning-info-value">2026</div>
                  </div>
                  <div className="planning-info-field">
                    <label className="planning-info-label">Plan Configuration</label>
                    <div className="planning-info-value">KAMPlanConfig</div>
                  </div>
                  <div className="planning-info-field">
                    <label className="planning-info-label">Root Record</label>
                    <div className="planning-info-value">Acme</div>
                  </div>
                </div>
              )}
              {leftTab === 'related' && (
                <div className="planning-related-section">
                  <div className="planning-related-section-header">
                    <h3 className="planning-section-title">Approvals</h3>
                  </div>
                  <div className="planning-related-list">
                    <div className="planning-related-list-header">
                      <span>Request</span>
                      <span>Role</span>
                      <span>Assignee</span>
                      <span>Status</span>
                      <span>Updated</span>
                    </div>
                    {RELATED_APPROVAL_LIST_ROWS.map((item, idx) => (
                      <div key={`${item.role}-${idx}`} className="planning-related-list-row">
                        <span>{item.request}</span>
                        <span>{item.role}</span>
                        <span>{item.assignee}</span>
                        <span
                          className={
                            relatedApprovalsWithdrawn ? 'planning-related-list-status--withdrawn' : undefined
                          }
                        >
                          {relatedApprovalsWithdrawn ? 'Withdrawn' : item.status}
                        </span>
                        <span>{relatedApprovalsWithdrawn ? 'Just now' : item.updated}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {leftTab === 'grid-config' && (
                <div className="planning-grid-config-section">
                  {/* WIP text and version tabs hidden for video - will be restored later */}
                  
                  {/* MVP Version Content */}
                  <div className="grid-config-tab-content">
                      <div className="mvp-account-selection">
                        <label className="grid-config-label">Select Account</label>
                        <div className="mvp-account-search-wrapper">
                          <input 
                            type="text" 
                            className="mvp-account-search-input" 
                            placeholder="Placeholder text..."
                            defaultValue="MagnaDrive Michigan Plant"
                          />
                          <svg className="mvp-account-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                      </div>
                      <div className="mvp-category-selection">
                        <label className="grid-config-label">Select Categories</label>
                        <p className="mvp-criteria-subtext">Describe Criteria for selecting Categories</p>
                        <div className="mvp-formula-logic-field">
                          <label className="mvp-criteria-field-label">Criteria Logic</label>
                          <input 
                            type="text" 
                            className="grid-config-input mvp-formula-input" 
                            value={Array.from({ length: criteriaRowCount }, (_, i) => `(${i + 1})`).join(' AND ')}
                            disabled
                          />
                        </div>
                        <div className="mvp-criteria-section">
                          <div className="mvp-criteria-rows">
                            {Array.from({ length: criteriaRowCount }, (_, index) => {
                              // Prefilled default values for first 2 rows
                              const defaultFields = ['Category Type', 'Category Status'];
                              const defaultOperators = ['Equals', 'Equals'];
                              const defaultValues = ['Powertrain', 'Active'];
                              
                              return (
                              <div key={index} className="mvp-criteria-row">
                                <div className="mvp-criteria-row-number">{index + 1}</div>
                                <div className="mvp-criteria-field">
                                  <label className="mvp-criteria-field-label">Category Field</label>
                                  <select className="grid-config-dropdown" defaultValue={defaultFields[index] || ''}>
                                    <option value="">Select...</option>
                                    <option value="Category Name">Category Name</option>
                                    <option value="Category Status">Category Status</option>
                                    <option value="Category Type">Category Type</option>
                                    <option value="Parent Category">Parent Category</option>
                                    <option value="Category Code">Category Code</option>
                                  </select>
                                </div>
                                <div className="mvp-criteria-field">
                                  <label className="mvp-criteria-field-label">Operator</label>
                                  <select className="grid-config-dropdown" defaultValue={defaultOperators[index] || ''}>
                                    <option value="">Select...</option>
                                    <option value="Equals">Equals</option>
                                    <option value="Not Equals">Not Equals</option>
                                    <option value="Contains">Contains</option>
                                    <option value="Starts With">Starts With</option>
                                    <option value="Ends With">Ends With</option>
                                  </select>
                                </div>
                                <div className="mvp-criteria-field">
                                  <label className="mvp-criteria-field-label">Value</label>
                                  <input type="text" className="grid-config-input" defaultValue={defaultValues[index] || ''} />
                                </div>
                                <button 
                                  className="grid-config-delete-btn"
                                  onClick={() => {
                                    if (criteriaRowCount > 1) {
                                      setCriteriaRowCount(criteriaRowCount - 1);
                                    }
                                  }}
                                >
                                  <svg fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                  </svg>
                                </button>
                              </div>
                              );
                            })}
                          </div>
                          <div className="mvp-criteria-actions">
                            <button 
                              className="grid-config-add-btn"
                              onClick={() => setCriteriaRowCount(criteriaRowCount + 1)}
                            >
                              + Add Condition
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="mvp-product-selection">
                        <label className="grid-config-label">Select Products</label>
                        <p className="mvp-product-note">
                          All the products belonging to the above categories will be shown on the grid
                        </p>
                      </div>
                    </div>

                  {/* Post MVP Version Tab - Hidden for video, will be restored later */}
                  {false && gridConfigTab === 'post-mvp' && (
                    <div className="grid-config-tab-content">
                      
                      <div className="grid-config-layout">
                    {/* Left Navigation Panel */}
                    <div className="grid-config-sidebar">
                      <div className="grid-config-quick-find">
                        <svg className="grid-config-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input type="text" className="grid-config-search-input" placeholder="Quick Find" />
                      </div>
                      <div className="grid-config-hierarchy-header">Hierarchy Levels</div>
                      <div className="grid-config-nav-items">
                        <button 
                          className="grid-config-nav-item disabled"
                          disabled
                        >
                          Parent Account
                        </button>
                        <button 
                          className="grid-config-nav-item disabled"
                          disabled
                        >
                          Account
                        </button>
                        <button 
                          className={`grid-config-nav-item ${selectedHierarchyLevel === 'Category' ? 'active' : ''}`}
                          onClick={() => setSelectedHierarchyLevel('Category')}
                        >
                          Category
                        </button>
                        <button 
                          className="grid-config-nav-item disabled"
                          disabled
                        >
                          Product
                        </button>
                      </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="grid-config-main">
                      <div className="grid-config-header">
                        <h2 className="grid-config-title">Select Categories</h2>
                        <p className="grid-config-description">Describe the Criteria to select Categories</p>
                      </div>

                      <div className="mvp-formula-logic-field">
                        <label className="mvp-criteria-field-label">Criteria Logic</label>
                        <input 
                          type="text" 
                          className="grid-config-input mvp-formula-input" 
                          value={criteriaLogic}
                          onChange={(e) => setCriteriaLogic(e.target.value)}
                        />
                      </div>
                      <div className="mvp-criteria-section">
                        <div className="mvp-criteria-rows">
                          {Array.from({ length: postMvpCriteriaRowCount }, (_, index) => (
                            <div key={index} className="mvp-criteria-row">
                              <div className="mvp-criteria-row-number">{index + 1}</div>
                              <div className="mvp-criteria-field">
                                <label className="mvp-criteria-field-label">Dimension & its field</label>
                                <div className="grouped-combobox-wrapper">
                                  <div className="grouped-combobox">
                                    <select 
                                      className="grouped-combobox-dropdown"
                                      value={selectedDimensions.get(index) || getHierarchyOptions(selectedHierarchyLevel)[0]}
                                      onChange={(e) => {
                                        const newMap = new Map(selectedDimensions);
                                        newMap.set(index, e.target.value);
                                        setSelectedDimensions(newMap);
                                      }}
                                    >
                                      {getHierarchyOptions(selectedHierarchyLevel).map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                      ))}
                                    </select>
                                    <div className="grouped-combobox-divider"></div>
                                    <div className="grouped-combobox-search">
                                      <input 
                                        type="text" 
                                        className="grouped-combobox-search-input" 
                                        placeholder="Search field..."
                                        value={selectedFields.get(index) || ''}
                                        onChange={(e) => {
                                          const newMap = new Map(selectedFields);
                                          newMap.set(index, e.target.value);
                                          setSelectedFields(newMap);
                                        }}
                                        onFocus={() => setFocusedSearchInput(index)}
                                        onBlur={() => setTimeout(() => setFocusedSearchInput(null), 200)}
                                      />
                                      <svg className="grouped-combobox-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                      </svg>
                                    </div>
                                  </div>
                                  {focusedSearchInput === index && (
                                    <div className="field-picklist">
                                      {getFieldsForLevel(selectedDimensions.get(index) || getHierarchyOptions(selectedHierarchyLevel)[0]).map((field) => (
                                        <div
                                          key={field}
                                          className="field-picklist-item"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            const newMap = new Map(selectedFields);
                                            newMap.set(index, field);
                                            setSelectedFields(newMap);
                                            setFocusedSearchInput(null);
                                          }}
                                        >
                                          {field}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="mvp-criteria-field">
                                <label className="mvp-criteria-field-label">Operator</label>
                                <select 
                                  className="grid-config-dropdown"
                                  value={selectedOperators.get(index) || 'Select...'}
                                  onChange={(e) => {
                                    const newMap = new Map(selectedOperators);
                                    newMap.set(index, e.target.value);
                                    setSelectedOperators(newMap);
                                  }}
                                >
                                  <option>Select...</option>
                                  <option>Equals</option>
                                  <option>Contains</option>
                                  <option>Not Equals</option>
                                  <option>Less Than</option>
                                  <option>Greater Than</option>
                                </select>
                              </div>
                              <div className="mvp-criteria-field">
                                <label className="mvp-criteria-field-label">Value</label>
                                <input 
                                  type="text" 
                                  className="grid-config-input" 
                                  placeholder=""
                                  value={selectedValues.get(index) || ''}
                                  onChange={(e) => {
                                    const newMap = new Map(selectedValues);
                                    newMap.set(index, e.target.value);
                                    setSelectedValues(newMap);
                                  }}
                                />
                              </div>
                              <button 
                                className="grid-config-delete-btn"
                                onClick={() => {
                                  if (postMvpCriteriaRowCount > 1) {
                                    setPostMvpCriteriaRowCount(postMvpCriteriaRowCount - 1);
                                  }
                                }}
                              >
                                <svg fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="mvp-criteria-actions">
                          <button 
                            className="grid-config-add-btn"
                            onClick={() => setPostMvpCriteriaRowCount(postMvpCriteriaRowCount + 1)}
                          >
                            + Add Condition
                          </button>
                        </div>
                      </div>
                    </div>
                    </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel */}
          <div className="planning-right-panel">
            <div className="planning-panel-tabs">
              <button 
                className={`planning-tab ${rightTab === 'activity' ? 'active' : ''}`}
                onClick={() => setRightTab('activity')}
              >
                Activity
              </button>
              <button 
                className={`planning-tab ${rightTab === 'chatter' ? 'active' : ''}`}
                onClick={() => setRightTab('chatter')}
              >
                Chatter
              </button>
            </div>
            <div className="planning-panel-content">
              {rightTab === 'activity' && (
                <div className="planning-activity-section">
                  <div className="planning-activity-filters">
                    <div className="planning-filter-icons">
                      <button className="planning-filter-icon-button">
                        <svg className="planning-filter-icon" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                        <svg className="planning-filter-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button className="planning-filter-icon-button">
                        <svg className="planning-filter-icon" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/>
                        </svg>
                        <svg className="planning-filter-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button className="planning-filter-icon-button">
                        <svg className="planning-filter-icon" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                        </svg>
                        <svg className="planning-filter-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button className="planning-filter-icon-button">
                        <svg className="planning-filter-icon" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                        </svg>
                        <svg className="planning-filter-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                    <div className="planning-filter-text">
                      <span>Filters: All time • All activities • All types</span>
                      <svg className="planning-filter-gear" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                      </svg>
                    </div>
                  </div>
                  <div className="planning-activity-links">
                    <a href="#" className="planning-activity-link">Refresh</a>
                    <a href="#" className="planning-activity-link">Expand All</a>
                    <a href="#" className="planning-activity-link">View All</a>
                  </div>
                  <div className="planning-activity-section-item">
                    <div className="planning-activity-section-header">
                      <h4 className="planning-activity-section-title">Upcoming & Overdue</h4>
                      <svg className="planning-page-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <div className="planning-empty-state">
                      <p className="planning-empty-text">No activities to show.</p>
                      <p className="planning-empty-subtext">Get started by sending an email, scheduling a task, and more.</p>
                    </div>
                  </div>
                  <div className="planning-activity-divider"></div>
                  <div className="planning-activity-section-item">
                    <div className="planning-empty-state">
                      <p className="planning-empty-text">No past activity.</p>
                      <p className="planning-empty-subtext">Past meetings and tasks marked as done show up here.</p>
                    </div>
                  </div>
                </div>
              )}
              {rightTab === 'chatter' && (
                <div className="planning-chatter-section">
                  <p>Chatter content will go here</p>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>

        {recordHeaderMenuOpen && recordHeaderMenuPosition &&
          createPortal(
            <div
              ref={recordHeaderMenuRef}
              className="planning-record-header-menu"
              role="menu"
              style={{
                position: 'fixed',
                top: recordHeaderMenuPosition.top,
                left: recordHeaderMenuPosition.left,
                zIndex: 99998,
              }}
            >
              <button
                type="button"
                className="planning-record-header-menu-item"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setRecordHeaderMenuOpen(false);
                  setRecordHeaderMenuPosition(null);
                  navigate('/planning-forecasting-list', { state: { cloneRecordId: RECORD_PAGE_CLONE_SOURCE_ID } });
                }}
              >
                Clone
              </button>
              <button
                type="button"
                className="planning-record-header-menu-item"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setRecordHeaderMenuOpen(false);
                  setRecordHeaderMenuPosition(null);
                  setExportCsvModalOpen(true);
                }}
              >
                Export Grid
              </button>
            </div>,
            document.body,
          )}

        <ExportCsvModal isOpen={exportCsvModalOpen} onClose={() => setExportCsvModalOpen(false)} />

        {submitApprovalModalOpen &&
          createPortal(
            <div
              className="planning-approval-modal-overlay"
              role="presentation"
              onClick={handleCloseSubmitApprovalModal}
            >
              <div
                className="planning-approval-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="planning-approval-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="planning-approval-modal-header">
                  <h2 id="planning-approval-modal-title" className="planning-approval-modal-title">
                    Submit Plan for Review
                  </h2>
                  <button
                    type="button"
                    className="planning-approval-modal-close"
                    onClick={handleCloseSubmitApprovalModal}
                    aria-label="Close"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="planning-approval-modal-body">
                  <p className="planning-approval-modal-warning">
                    After you submit, you will not be able to edit the planning grid until all required
                    approvals are completed. You can still view the grid and track approval status from this
                    record.
                  </p>
                  <div>
                    <p className="planning-approval-modal-approvers-heading">
                      Approval requests will be submitted to:
                    </p>
                    <ul className="planning-approval-modal-approvers-list">
                      {APPROVER_DISPLAY_ORDER.map((role) => {
                        const entry = APPROVER_ROSTER[role];
                        if (!entry) return null;
                        return (
                          <li key={role} className="planning-approval-modal-approver-item">
                            <div
                              className="planning-approval-modal-approver-avatar"
                              aria-hidden={true}
                              title={entry.name}
                            >
                              {entry.initials}
                            </div>
                            <div className="planning-approval-modal-approver-lines">
                              <span className="planning-approval-modal-approver-role">{role}</span>
                              <span className="planning-approval-modal-approver-name">{entry.name}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <label className="planning-submit-approval-notes-label" htmlFor="planning-submit-approval-notes">
                    Notes <span className="planning-submit-approval-notes-optional">(optional)</span>
                  </label>
                  <textarea
                    id="planning-submit-approval-notes"
                    className="planning-approval-modal-textarea"
                    rows={3}
                    value={submitForApprovalNotes}
                    onChange={(e) => setSubmitForApprovalNotes(e.target.value)}
                    placeholder="Add any context or instructions for approvers…"
                  />
                </div>
                <div className="planning-approval-modal-footer">
                  <button
                    type="button"
                    className="planning-approval-modal-btn planning-approval-modal-btn-cancel"
                    onClick={handleCloseSubmitApprovalModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="planning-approval-modal-btn planning-approval-modal-btn-confirm"
                    onClick={handleConfirmDraftToInReview}
                  >
                    Confirm and submit
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {approverDecisionModalOpen &&
          createPortal(
            <div
              className="planning-approval-modal-overlay"
              role="presentation"
              onClick={handleCloseApproverDecisionModal}
            >
              <div
                className="planning-approval-modal planning-approval-modal--approver-decision"
                role="dialog"
                aria-modal="true"
                aria-labelledby="planning-approver-decision-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="planning-approval-modal-header">
                  <h2 id="planning-approver-decision-modal-title" className="planning-approval-modal-title">
                    Complete review
                  </h2>
                  <button
                    type="button"
                    className="planning-approval-modal-close"
                    onClick={handleCloseApproverDecisionModal}
                    aria-label="Close"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="planning-approval-modal-body">
                  <p className="planning-approval-modal-warning planning-approver-decision-intro">
                    Record your decision for the <strong>Submitted</strong> stage. The plan will move to{' '}
                    <strong>Approved / Rejected</strong>.
                  </p>
                  
                  <div className="planning-decision-factors">
                    <div className="planning-decision-factors-header">
                      <h3 className="planning-decision-factors-title">Decision factors</h3>
                      <button 
                        type="button" 
                        className="planning-decision-factors-toggle"
                        onClick={() => setDecisionFactorsExpanded(!decisionFactorsExpanded)}
                      >
                        {decisionFactorsExpanded ? 'Less details' : 'More details'}
                      </button>
                    </div>
                    
                    {decisionFactorsExpanded && (
                      <>
                        <div className="planning-decision-factors-section">
                          <div className="planning-decision-factors-badge planning-decision-factors-badge--supporting">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                            </svg>
                            SUPPORTING
                          </div>
                          <ul className="planning-decision-factors-list planning-decision-factors-list--supporting">
                            <li>Forecast vs prior: +8.7%</li>
                            <li>Forecast vs budget: +5.2%</li>
                            <li>Historical trend positive (3M / 12M)</li>
                            <li>Margin impact: +1.9%</li>
                            <li>Revenue impact: +$12,240</li>
                            <li>Capacity within range (80%)</li>
                          </ul>
                        </div>
                        
                        <div className="planning-decision-factors-section">
                          <div className="planning-decision-factors-badge planning-decision-factors-badge--concerning">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                              <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
                            </svg>
                            CONCERNING
                          </div>
                          <ul className="planning-decision-factors-list planning-decision-factors-list--concerning">
                            <li>Lead time acceptable (16d)</li>
                            <li>Schedule risk: Low</li>
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="planning-approver-decision-select-wrap">
                    <div className="planning-approver-decision-select-label" id="planning-approver-decision-label">
                      Your decision
                    </div>
                    <div
                      className="planning-approver-decision-btn-group"
                      role="group"
                      aria-labelledby="planning-approver-decision-label"
                    >
                      <button
                        type="button"
                        className={`planning-approver-decision-btn planning-approver-decision-btn--approve${
                          approverPlanDecision === 'approved' ? ' planning-approver-decision-btn--selected' : ''
                        }`}
                        aria-pressed={approverPlanDecision === 'approved'}
                        onClick={() => setApproverPlanDecision('approved')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className={`planning-approver-decision-btn planning-approver-decision-btn--conditional${
                          approverPlanDecision === 'approvedWithCondition'
                            ? ' planning-approver-decision-btn--selected'
                            : ''
                        }`}
                        aria-pressed={approverPlanDecision === 'approvedWithCondition'}
                        onClick={() => setApproverPlanDecision('approvedWithCondition')}
                      >
                        Conditionally Approve
                      </button>
                      <button
                        type="button"
                        className={`planning-approver-decision-btn planning-approver-decision-btn--reject${
                          approverPlanDecision === 'rejected' ? ' planning-approver-decision-btn--selected' : ''
                        }`}
                        aria-pressed={approverPlanDecision === 'rejected'}
                        onClick={() => setApproverPlanDecision('rejected')}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                  <label
                    className="planning-submit-approval-notes-label"
                    htmlFor="planning-approver-decision-notes"
                  >
                    Notes <span className="planning-submit-approval-notes-optional">(optional)</span>
                  </label>
                  <textarea
                    id="planning-approver-decision-notes"
                    className="planning-approval-modal-textarea"
                    rows={4}
                    value={approverPlanNotes}
                    onChange={(e) => setApproverPlanNotes(e.target.value)}
                    placeholder="Add context for your decision (conditions, follow-ups, rejection reasons)…"
                  />
                </div>
                <div className="planning-approval-modal-footer">
                  <button
                    type="button"
                    className="planning-approval-modal-btn planning-approval-modal-btn-cancel"
                    onClick={handleCloseApproverDecisionModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="planning-approval-modal-btn planning-approval-modal-btn-confirm"
                    onClick={handleConfirmApproverPlanDecision}
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {withdrawToDraftModalOpen &&
          createPortal(
            <div
              className="planning-approval-modal-overlay"
              role="presentation"
              onClick={handleCloseWithdrawToDraftModal}
            >
              <div
                className="planning-approval-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="planning-withdraw-draft-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="planning-approval-modal-header">
                  <h2 id="planning-withdraw-draft-modal-title" className="planning-approval-modal-title">
                    Return plan to Draft?
                  </h2>
                  <button
                    type="button"
                    className="planning-approval-modal-close"
                    onClick={handleCloseWithdrawToDraftModal}
                    aria-label="Close"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="planning-approval-modal-body">
                  <p className="planning-approval-modal-warning">
                    Moving this plan back to Draft will withdraw all in-flight approval requests. Approvers
                    will be notified that their pending reviews are no longer required.
                  </p>
                  <label className="planning-withdraw-modal-label" htmlFor="planning-withdraw-reason">
                    Reason for withdrawal
                  </label>
                  <textarea
                    id="planning-withdraw-reason"
                    className="planning-approval-modal-textarea"
                    rows={4}
                    value={withdrawalReasonNote}
                    onChange={(e) => setWithdrawalReasonNote(e.target.value)}
                    placeholder="Enter a note explaining why you are withdrawing the approval requests…"
                    aria-required
                  />
                </div>
                <div className="planning-approval-modal-footer">
                  <button
                    type="button"
                    className="planning-approval-modal-btn planning-approval-modal-btn-cancel"
                    onClick={handleCloseWithdrawToDraftModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="planning-approval-modal-btn planning-approval-modal-btn-confirm"
                    onClick={handleConfirmWithdrawToDraft}
                    disabled={!withdrawalReasonNote.trim()}
                  >
                    Withdraw and set to Draft
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {planSubmittedForReviewToastVisible && (
          <ScopedNotification
            className="scoped-notification--approval-success scoped-notification--multiline"
            icon={
              <svg
                className="scoped-notification-icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <circle cx="10" cy="10" r="9" fill="currentColor" />
                <path
                  d="M6 10.2l2.5 2.5L14 7.2"
                  stroke="var(--color-surface-white)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            message={
              'Plan successfully submitted for review.\n\nYou will be notified when there are any updates.'
            }
            onClose={() => setPlanSubmittedForReviewToastVisible(false)}
          />
        )}

      </div>
    </div>
  );
};

export default PlanningForecastingPage;
