import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MeasureData, GridRow } from '../types';
import { extractCellInfo, CellInfo } from '../utils/cellInfoUtils';
import { CellEditHistoryEntry, editHistoryEntryAffectsCell } from '../types/editHistory';
import { ApprovalRequest, ALL_APPROVER_ROLES, APPROVER_ROSTER } from '../types/approvalRequest';
import { useNotifications, type PlanApproverDecisionOutcome } from '../contexts/NotificationsContext';
import { useCurrentUser, APP_USERS } from '../contexts/UserContext';
import CellEditHistoryCard from './CellEditHistoryCard';
import GenericCommentCard from './GenericCommentCard';
import RequestApprovalConfirmModal from './RequestApprovalConfirmModal';
import ScopedNotification from './ScopedNotification';
import { getPlanWideValueCellKeys } from '../utils/planWideCellKeys';
import { filterPlanWideKeysByAutoCriteria, hasActiveAutoCriteria } from '../utils/bulkCriteriaCellKeys';
import '../styles/components/CellDetailsHistoryPanel.css';
import '../styles/pages/PlanningForecastingPage.css';

const BULK_TIME_PERIOD_OPTIONS: { key: string; label: string }[] = [
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

type AutoCriteriaField = 'Account' | 'Category' | 'Product' | 'Measure' | 'Time';

const AUTO_CRITERIA_FIELDS: AutoCriteriaField[] = ['Account', 'Category', 'Product', 'Measure', 'Time'];

function operatorsForAutoField(field: AutoCriteriaField): string[] {
  if (field === 'Time') return ['between', 'is any of'];
  return ['is any of', 'is none of'];
}

function shortTimeLabel(label: string): string {
  return label.replace(/\s+2026$/, ' 26');
}

function createDefaultAutoCriteriaRow(): {
  id: string;
  field: AutoCriteriaField;
  operator: string;
  value: string;
  value2: string;
} {
  return {
    id: `criteria-${Date.now()}-${Math.random()}`,
    field: 'Account',
    operator: 'is any of',
    value: '',
    value2: '',
  };
}

interface CellDetailsHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  focusedCell?: { rowId: string; monthKey?: string; measureId?: string } | null;
  data?: MeasureData[];
  layout?: string;
  editHistory?: CellEditHistoryEntry[];
  draftEditHistory?: Map<string, CellEditHistoryEntry>; // Draft (unsaved) edits
  onAddNote?: (rowId: string, monthKey: string, note: string) => void;
  selectedCells?: Set<string>; // Set of selected cell keys
  onClearSelection?: () => void; // Callback to clear selection
  onMassUpdate?: (cellKeys: string[], rule: string, value: string, note?: string, disaggregationRule?: string, submitToApprovers?: string[]) => void; // Callback for mass update
  approvalRequests?: Map<string, ApprovalRequest>; // For showing per-approver breakdown in single-cell view
  selectedCellsOrder?: string[]; // Ordered array of selected cell keys (preserves selection order)
  getSelectedCellsOrder?: () => string[]; // Function to get current order from ref (always current)
  initialTab?: 'single' | 'multi' | 'details'; // Initial tab to show when panel opens
  detailsFocusSection?: 'approval' | 'explainability' | null;
  preselectAction?: string | null; // Optional action to preselect when opening multi-cell form
  preselectActionSignal?: number; // Increment to force-apply preselected action
  onSetFocusedCell?: (cell: { rowId: string; monthKey?: string; measureId?: string }) => void; // Callback to set focused cell
  onSingleCellUpdate?: (rowId: string, monthKey: string, newValue: number, adjustmentNote?: string, disaggregationRule?: string) => void; // Callback for single cell update
  onToggleCellLock?: (cellKey: string) => void; // Callback to toggle cell lock
  isCellLocked?: (cellKey: string) => boolean; // Function to check if cell is locked
  getCellValue?: (rowId: string, monthKey: string) => number | undefined; // Function to get current cell value
  onSelectSingleCell?: (cellKey: string) => void; // Callback to select a single cell (for View All Changes)
  isApprovalView?: boolean; // When true: show only approval timeline; hide numerical edit history
  /** After full-grid “Request Approval” submit — lock bulk request UI and show notice. */
  planWideApprovalSubmitted?: boolean;
}

const CellDetailsHistoryPanel: React.FC<CellDetailsHistoryPanelProps> = ({ 
  isOpen, 
  onClose, 
  focusedCell,
  data = [],
  layout = 'Measures / Dimensions x Time',
  editHistory = [],
  draftEditHistory,
  onAddNote,
  selectedCells = new Set(),
  onClearSelection,
  onMassUpdate,
  initialTab = 'multi',
  detailsFocusSection = null,
  preselectAction = null,
  preselectActionSignal = 0,
  onSetFocusedCell,
  onSingleCellUpdate,
  onToggleCellLock,
  isCellLocked,
  getCellValue,
  onSelectSingleCell,
  selectedCellsOrder = [],
  getSelectedCellsOrder,
  approvalRequests = new Map(),
  isApprovalView = false,
  planWideApprovalSubmitted = false,
}) => {
  const { publishCellApprovalRequested, publishCellApproverDecision } = useNotifications();
  const { currentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<'single' | 'multi' | 'details'>(initialTab);
  const [isExplainabilityOpen, setIsExplainabilityOpen] = useState(true);
  const [isApprovalDetailsOpen, setIsApprovalDetailsOpen] = useState(true);
  
  // Update activeTab when panel opens or initialTab prop changes
  useEffect(() => {
    if (isOpen) {
      // When panel opens or initialTab changes while open, always set the tab based on initialTab prop
      setActiveTab(initialTab);
    } else {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) {
      setIsExplainabilityOpen(true);
      setIsApprovalDetailsOpen(true);
      return;
    }
    if (activeTab === 'details' && detailsFocusSection === 'approval') {
      setIsApprovalDetailsOpen(true);
      setIsExplainabilityOpen(false);
    } else if (activeTab === 'details' && detailsFocusSection === 'explainability') {
      setIsApprovalDetailsOpen(false);
      setIsExplainabilityOpen(true);
    }
  }, [isOpen, activeTab, detailsFocusSection]);

  const [isHierarchyPopoverOpen, setIsHierarchyPopoverOpen] = useState(false);
  const [_nubbinLeft, _setNubbinLeft] = useState<number | null>(null); // Kept for potential future use
  const [panelNoteText, setPanelNoteText] = useState('');
  const [genericCommentText, setGenericCommentText] = useState(''); // For comments when no cell selected
  const hierarchyButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  
  // Filter state for history
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('');
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  
  // Generic comments state (for no-cell-selected mode)
  interface GenericComment {
    id: string;
    userId: string;
    userName: string;
    userInitials: string;
    message: string;
    timestamp: Date;
  }
  const [genericComments, setGenericComments] = useState<GenericComment[]>([]);
  
  // Generic comment replies state
  interface GenericCommentReply {
    id: string;
    userId: string;
    userName: string;
    message: string;
    timestamp: Date;
  }
  const [genericCommentReplies, setGenericCommentReplies] = useState<Record<string, GenericCommentReply[]>>({});
  
  // Multi-cell form state
  const [selectCells, setSelectCells] = useState<string>('Manually');
  const [selectAction, setSelectAction] = useState<string>('Bulk Edit');
  const [rule, setRule] = useState<string>('Increase');
  const [value, setValue] = useState<string>('20%');
  // "Submit to" approver selection (shown when submitting for approval)
  const [submitToApprovers, setSubmitToApprovers] = useState<string[]>([...ALL_APPROVER_ROLES]);
  const [requestNote, setRequestNote] = useState<string>('');
  const [approvalStatusValue, setApprovalStatusValue] = useState<string>('');
  const [requestApprovalConfirmOpen, setRequestApprovalConfirmOpen] = useState(false);
  
  // Reset value when rule changes or when switching from approval to regular cells
  useEffect(() => {
    const approvalCellKeys = Array.from(selectedCells).filter(key => key.endsWith('-approval'));
    const isAllApprovalCells = selectedCells.size > 0 && approvalCellKeys.length === selectedCells.size;
    
    if (isAllApprovalCells && rule === 'Set to') {
      // Reset to empty for approval status selection
      const approvalStatuses = ['approved', 'pending', 'rejected', 'notSubmitted'];
      if (!approvalStatuses.includes(value.toLowerCase())) {
        setValue('');
      }
    } else {
      // Reset to default for regular cells
      const approvalStatuses = ['approved', 'pending', 'rejected', 'notSubmitted'];
      if (approvalStatuses.includes(value.toLowerCase())) {
        setValue('20%');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCells, rule]);
  const [bulkNote, setBulkNote] = useState<string>('');
  const [isSelectCellsDropdownOpen, setIsSelectCellsDropdownOpen] = useState(false);
  const [isSelectActionDropdownOpen, setIsSelectActionDropdownOpen] = useState(false);
  const [isRuleDropdownOpen, setIsRuleDropdownOpen] = useState(false);
  const [actionSearchTerm, setActionSearchTerm] = useState<string>('');
  const selectCellsDropdownRef = useRef<HTMLDivElement>(null);
  const selectActionDropdownRef = useRef<HTMLDivElement>(null);
  const ruleDropdownRef = useRef<HTMLDivElement>(null);
  
  // Single cell update form state
  const [singleCellNewValue, setSingleCellNewValue] = useState<string>('');
  const [singleCellAdjustmentNote, setSingleCellAdjustmentNote] = useState<string>('');
  const [lockCellChecked, setLockCellChecked] = useState<boolean>(false);
  const [disaggregationRule, setDisaggregationRule] = useState<string>('Proportional');
  // Which approval modal is open (null = none). Neither button is selected by default.
  const [approvalModal, setApprovalModal] = useState<null | 'request' | 'provide'>(null);
  const [isProvideApprovalExpanded, setIsProvideApprovalExpanded] = useState(false);
  const [provideApprovalDecision, setProvideApprovalDecision] = useState<string>('approved');
  const [provideApprovalNote, setProvideApprovalNote] = useState<string>('');

  useEffect(() => {
    if (approvalModal !== 'provide') {
      setIsProvideApprovalExpanded(false);
    }
  }, [approvalModal]);
  
  // Replies state - keyed by entry ID
  interface CardReply {
    id: string;
    userId: string;
    userName: string;
    message: string;
    timestamp: Date;
  }
  const [cardReplies, setCardReplies] = useState<Record<string, CardReply[]>>({});
  
  // Use useMemo to ensure cellInfo updates when dependencies change
  const cellInfo: CellInfo | null = React.useMemo(() => {
    if (!focusedCell) return null;
    return extractCellInfo(focusedCell, data, layout);
  }, [focusedCell, data, layout]);

  /** Short human label for the focused cell, used in bell notifications. */
  const cellSummaryLabel = React.useMemo(() => {
    if (!cellInfo) return undefined;
    const lastDimension =
      cellInfo.dimensionPath && cellInfo.dimensionPath.length > 0
        ? cellInfo.dimensionPath[cellInfo.dimensionPath.length - 1]
        : undefined;
    return [cellInfo.measureName, cellInfo.timePeriod, lastDimension].filter(Boolean).join(' · ') || undefined;
  }, [cellInfo]);

  /** Canonical grid key for approval / value cells (matches `cellEditHistory` / selection). */
  const focusedValueCellKey = React.useMemo(() => {
    if (!focusedCell) return null;
    if (layout === 'Dimensions / Time x Measures' || layout === 'Time / Dimensions x Measures') {
      let baseDimensionId = focusedCell.rowId;
      if (baseDimensionId.startsWith('dimension-')) {
        const parts = baseDimensionId.split('-');
        let dimensionEndIndex = parts.length;
        for (let i = 1; i < parts.length; i++) {
          if (
            parts[i] === 'year' ||
            ['q1', 'q2', 'q3', 'q4'].includes(parts[i]) ||
            parts[i].match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{4}$/)
          ) {
            dimensionEndIndex = i;
            break;
          }
        }
        baseDimensionId = parts.slice(0, dimensionEndIndex).join('-');
      }
      if (!focusedCell.measureId) return null;
      return `${baseDimensionId}-${focusedCell.measureId}`;
    }
    if (!focusedCell.monthKey) return null;
    return `${focusedCell.rowId}-${focusedCell.monthKey}`;
  }, [focusedCell, layout]);
  
  const hasFocusedCell = focusedCell !== null && focusedCell !== undefined;

  // Selection state now derived directly from selectedCells.size in render logic

  // Filter edit history for the current focused cell
  const cellEditHistory = useMemo(() => {
    if (!focusedCell) return [];
    
    // Build cell key based on layout
    let cellKey: string;
    if (layout === 'Dimensions / Time x Measures' || layout === 'Time / Dimensions x Measures') {
      // For these layouts, cellKey stored is `${dimensionId}-${measureId}`
      // But focusedCell.rowId might be a transformed ID like "dimension-product-trn-a-year-q1-jan2026"
      // We need to extract the base dimension ID (remove time parts)
      let baseDimensionId = focusedCell.rowId;
      if (baseDimensionId.startsWith('dimension-')) {
        // Remove "dimension-" prefix and time parts (year, q1-q4, jan2026-dec2026)
        const parts = baseDimensionId.split('-');
        // Find where time parts start (usually after product/category/account)
        let dimensionEndIndex = parts.length;
        for (let i = 1; i < parts.length; i++) {
          if (parts[i] === 'year' || ['q1', 'q2', 'q3', 'q4'].includes(parts[i]) || 
              parts[i].match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{4}$/)) {
            dimensionEndIndex = i;
            break;
          }
        }
        baseDimensionId = parts.slice(0, dimensionEndIndex).join('-');
      }
      cellKey = focusedCell.measureId 
        ? `${baseDimensionId}-${focusedCell.measureId}`
        : baseDimensionId;
    } else {
      // For HierarchicalGrid, cellKey is `${rowId}-${monthKey}`
      cellKey = focusedCell.monthKey 
        ? `${focusedCell.rowId}-${focusedCell.monthKey}`
        : focusedCell.rowId;
    }
    
    // Merge drafts and saved history
    const draftsArray = draftEditHistory ? Array.from(draftEditHistory.values()) : [];
    const allHistory = [...draftsArray, ...editHistory];
    
    const timeKeyForBulkMatch =
      layout === 'Dimensions / Time x Measures' || layout === 'Time / Dimensions x Measures'
        ? undefined
        : focusedCell.monthKey;

    const filtered = allHistory
      .filter((entry) => {
        if (
          editHistoryEntryAffectsCell(
            entry,
            cellKey,
            focusedCell.rowId,
            timeKeyForBulkMatch as string | undefined
          )
        ) {
          return true;
        }
        
        if (layout === 'Dimensions / Time x Measures' || layout === 'Time / Dimensions x Measures') {
          const rowMeasureMatch = entry.rowId === focusedCell.rowId && entry.measureId === focusedCell.measureId;
          if (rowMeasureMatch) {
            return true;
          }
        }
        
        return false;
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Most recent first
    
    return filtered;
  }, [focusedCell, editHistory, draftEditHistory, layout]);
  
  // Add reply to a card
  const handleAddCardReply = useCallback((entryId: string, message: string) => {
    const newReply: CardReply = {
      id: `reply-${Date.now()}-${Math.random()}`,
      userId: 'john-carter',
      userName: 'John Carter',
      message,
      timestamp: new Date()
    };
    
    setCardReplies(prev => ({
      ...prev,
      [entryId]: [...(prev[entryId] || []), newReply]
    }));
  }, []);

  // Handle posting note from panel footer
  const handlePostNote = useCallback(() => {
    if (!panelNoteText.trim() || !focusedCell || !onAddNote) return;
    
    const monthKey = focusedCell.monthKey || '';
    onAddNote(focusedCell.rowId, monthKey, panelNoteText.trim());
    setPanelNoteText('');
  }, [panelNoteText, focusedCell, onAddNote]);

  // Handle posting generic comment (when no cell selected)
  const handlePostGenericComment = useCallback(() => {
    if (!genericCommentText.trim()) return;
    
    const newComment: GenericComment = {
      id: `gc-${Date.now()}-${Math.random()}`,
      userId: 'john-carter',
      userName: 'John Carter',
      userInitials: 'JC',
      message: genericCommentText.trim(),
      timestamp: new Date()
    };
    
    setGenericComments(prev => [newComment, ...prev]);
    setGenericCommentText('');
  }, [genericCommentText]);
  
  // Handle adding reply to generic comment
  const handleAddGenericCommentReply = useCallback((commentId: string, message: string) => {
    const newReply: GenericCommentReply = {
      id: `gcr-${Date.now()}-${Math.random()}`,
      userId: 'john-carter',
      userName: 'John Carter',
      message,
      timestamp: new Date()
    };
    
    setGenericCommentReplies(prev => ({
      ...prev,
      [commentId]: [...(prev[commentId] || []), newReply]
    }));
  }, []);

  // Handle single cell update
  const handleSingleCellUpdate = useCallback(() => {
    if (!focusedCell || !onSingleCellUpdate) return;
    
    const numericValue = parseFloat(singleCellNewValue);
    if (isNaN(numericValue)) return;
    
    const monthKey = focusedCell.monthKey || '';
    
    // Call the update callback (passes the disaggregation rule so the value is
    // pushed down to children Proportionally / Equally / Evenly).
    onSingleCellUpdate(
      focusedCell.rowId, 
      monthKey, 
      numericValue, 
      singleCellAdjustmentNote.trim() || undefined,
      disaggregationRule
    );

    // Apply the "Lock cell" choice — toggle only when it differs from current state.
    if (onToggleCellLock && focusedValueCellKey) {
      const currentlyLocked = isCellLocked ? isCellLocked(focusedValueCellKey) : false;
      if (lockCellChecked !== currentlyLocked) {
        onToggleCellLock(focusedValueCellKey);
      }
    }
    
    // Keep adjustment note - only clear when cell changes or grid saves
  }, [focusedCell, singleCellNewValue, singleCellAdjustmentNote, onSingleCellUpdate, disaggregationRule, onToggleCellLock, isCellLocked, focusedValueCellKey, lockCellChecked]);

  // Handle single cell cancel
  const handleSingleCellCancel = useCallback(() => {
    if (focusedCell) {
      // Reset form to current values
      const currentValue = getCellValue ? getCellValue(focusedCell.rowId, focusedCell.monthKey || '') : undefined;
      setSingleCellNewValue(currentValue !== undefined ? currentValue.toString() : '');
      setSingleCellAdjustmentNote('');
    }
  }, [focusedCell, getCellValue]);

  // Close filter popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterPopoverRef.current &&
        !filterPopoverRef.current.contains(event.target as Node) &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(event.target as Node)
      ) {
        setIsFilterPopoverOpen(false);
      }
    };

    if (isFilterPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isFilterPopoverOpen]);

  // Close popover when focused cell changes
  useEffect(() => {
    if (focusedCell) {
      setIsHierarchyPopoverOpen(false);
    }
  }, [focusedCell?.rowId, focusedCell?.monthKey, focusedCell?.measureId]);

  // Populate single cell update form when focusedCell changes
  useEffect(() => {
    if (focusedCell && selectedCells.size === 1) {
      // Get current cell value
      const currentValue = getCellValue ? getCellValue(focusedCell.rowId, focusedCell.monthKey || '') : undefined;
      setSingleCellNewValue(currentValue !== undefined ? currentValue.toString() : '');
      setSingleCellAdjustmentNote('');
      // Reflect the cell's current lock state in the checkbox
      setLockCellChecked(focusedValueCellKey && isCellLocked ? isCellLocked(focusedValueCellKey) : false);
      setDisaggregationRule('Proportional');
    }
  }, [focusedCell?.rowId, focusedCell?.monthKey, selectedCells.size, getCellValue, focusedValueCellKey, isCellLocked]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        hierarchyButtonRef.current &&
        !hierarchyButtonRef.current.contains(event.target as Node)
      ) {
        setIsHierarchyPopoverOpen(false);
      }
    };

    if (isHierarchyPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isHierarchyPopoverOpen]);

  // Close multi-cell dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selectCellsDropdownRef.current &&
        !selectCellsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSelectCellsDropdownOpen(false);
      }
      if (
        selectActionDropdownRef.current &&
        !selectActionDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSelectActionDropdownOpen(false);
        setActionSearchTerm('');
      }
      if (
        ruleDropdownRef.current &&
        !ruleDropdownRef.current.contains(event.target as Node)
      ) {
        setIsRuleDropdownOpen(false);
      }
    };

    if (isSelectCellsDropdownOpen || isSelectActionDropdownOpen || isRuleDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isSelectCellsDropdownOpen, isSelectActionDropdownOpen, isRuleDropdownOpen]);

  // Multi-cell options
  const selectCellsOptions = ['Manually', 'Automatically'];
  
  interface SelectionCriteria {
    id: string;
    field: AutoCriteriaField;
    operator: string;
    value: string;
    value2: string;
  }
  
  const [criteria, setCriteria] = useState<SelectionCriteria[]>([]);
  const [criteriaValuePickerId, setCriteriaValuePickerId] = useState<string | null>(null);
  const criteriaPickerRef = useRef<HTMLDivElement>(null);
  
  const addCriteria = () => {
    setCriteria(prev => [...prev, createDefaultAutoCriteriaRow()]);
  };
  
  const removeCriteria = (id: string) => {
    setCriteria(prev => prev.filter(c => c.id !== id));
    setCriteriaValuePickerId(cur => (cur === id ? null : cur));
  };
  
  const updateCriteria = (id: string, updates: Partial<SelectionCriteria>) => {
    setCriteria(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));
  };

  const parseCriteriaTokens = (raw: string): string[] =>
    raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

  const toggleCriteriaToken = (id: string, token: string) => {
    setCriteria(prev =>
      prev.map(c => {
        if (c.id !== id) return c;
        const set = new Set(parseCriteriaTokens(c.value));
        if (set.has(token)) set.delete(token);
        else set.add(token);
        return { ...c, value: Array.from(set).join(', ') };
      }),
    );
  };
  const selectActionOptions = [
    'Bulk Edit',
    'Request Approval',
    'Edit Approval Status',
    'Copy',
    'Copy Formula',
    'Copy Trend',
    'Copy conditional formatting rule',
    'Copy Adjustment Notes',
    'Set Disaggregation Mechanism'
  ];
  const ruleOptions = ['Increase', 'Decrease', 'Set to', 'Multiply by', 'Divide by'];
  const disaggregationRuleOptions = ['even', 'proportional', 'fixed', 'custom', 'do not cascade'];
  
  // Filter actions based on search term
  const filteredActions = selectActionOptions.filter(action =>
    action.toLowerCase().includes(actionSearchTerm.toLowerCase())
  );

  const bulkSelectionOptions = useMemo(() => {
    const accounts = new Set<string>();
    const categories = new Set<string>();
    const products = new Set<string>();
    const walk = (rows: GridRow[] | undefined) => {
      rows?.forEach(row => {
        if (row.type === 'account') accounts.add(row.name);
        if (row.type === 'category') categories.add(row.name);
        if (row.type === 'product') products.add(row.name);
        if (row.children) walk(row.children);
      });
    };
    data.forEach(m => walk(m.children));
    const measures = Array.from(
      new Set(data.map(m => (m.name?.trim() || m.id)).filter(Boolean) as string[]),
    ).sort();
    return {
      accounts: Array.from(accounts).sort(),
      categories: Array.from(categories).sort(),
      products: Array.from(products).sort(),
      measures,
      timePeriods: BULK_TIME_PERIOD_OPTIONS,
    };
  }, [data]);

  /** All hierarchical month cells — used when Request Approval runs without a manual multi-cell selection (plan scope). */
  const planWideValueCellKeys = useMemo(() => getPlanWideValueCellKeys(data), [data]);

  const resolvedBulkTargetKeys = useMemo(() => {
    if (selectCells === 'Manually') {
      const currentOrder = getSelectedCellsOrder ? getSelectedCellsOrder() : (selectedCellsOrder || []);
      return currentOrder.length > 0
        ? currentOrder.filter(key => selectedCells.has(key))
        : Array.from(selectedCells);
    }
    if (!hasActiveAutoCriteria(criteria)) {
      return [];
    }
    return filterPlanWideKeysByAutoCriteria(planWideValueCellKeys, data, criteria);
  }, [
    selectCells,
    criteria,
    data,
    planWideValueCellKeys,
    getSelectedCellsOrder,
    selectedCellsOrder,
    selectedCells,
  ]);

  /** Exclude value cells already in pending approval — avoids re-opening confirm after submit or empty confirm body. */
  const requestApprovalEligibleKeys = useMemo(
    () =>
      resolvedBulkTargetKeys.filter(cellKey => {
        const req = approvalRequests.get(cellKey);
        return !req || req.status !== 'pending';
      }),
    [resolvedBulkTargetKeys, approvalRequests],
  );

  useEffect(() => {
    if (
      requestApprovalConfirmOpen &&
      selectAction === 'Request Approval' &&
      requestApprovalEligibleKeys.length === 0
    ) {
      setRequestApprovalConfirmOpen(false);
    }
  }, [requestApprovalConfirmOpen, selectAction, requestApprovalEligibleKeys.length]);

  useEffect(() => {
    if (!criteriaValuePickerId) {
      criteriaPickerRef.current = null;
      return;
    }
    const onDocMouseDown = (e: MouseEvent) => {
      if (criteriaPickerRef.current?.contains(e.target as Node)) return;
      setCriteriaValuePickerId(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [criteriaValuePickerId]);

  useEffect(() => {
    if (!isOpen || preselectActionSignal <= 0 || !preselectAction) return;
    setSelectCells('Manually');
    setSelectAction(preselectAction);
    if (preselectAction === 'Request Approval') {
      setRule('');
      setValue('');
      setRequestNote('');
      setSubmitToApprovers([...ALL_APPROVER_ROLES]);
    }
  }, [isOpen, preselectAction, preselectActionSignal]);

  useEffect(() => {
    if (!isOpen) setRequestApprovalConfirmOpen(false);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
    <div className="cell-details-history-panel">
      {/* Panel Header */}
      <div className="cell-details-history-panel-header">
        <div className="cell-details-history-panel-title-section">
          <div className="cell-details-history-panel-note-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M12.7383 12.216L12.4614 12.4929C12.1537 12.8006 11.7537 12.9544 11.3229 12.9544H10.5229C9.78444 12.9544 8.98444 12.3698 8.98444 11.3544V10.5852C8.98444 9.96983 9.26137 9.6006 9.41521 9.38522L12.7383 6.0006C12.8306 5.90829 12.9229 5.69291 12.9229 5.56983V3.01599C12.9229 2.21599 12.246 1.53906 11.446 1.53906H3.56907C2.76908 1.53906 2.09215 2.27752 2.09215 3.01599H1.59985C1.046 3.01599 0.615234 3.47752 0.615234 4.03137C0.615234 4.58522 1.046 5.01599 1.59985 5.01599H2.09215V7.01599H1.59985C1.046 7.01599 0.615234 7.44676 0.615234 8.0006C0.615234 8.55445 1.046 8.98522 1.59985 8.98522H2.09215V10.9852H1.59985C1.046 10.9852 0.615234 11.4468 0.615234 11.9698C0.615234 12.5237 1.046 12.9544 1.59985 12.9544H2.09215C2.09215 13.9391 2.76908 14.4314 3.56907 14.4314H11.446C12.246 14.4314 12.9229 13.7544 12.9229 12.9544V12.3083C12.9229 12.1544 12.8614 12.1237 12.7383 12.216V12.216ZM10.2153 5.262C10.2153 5.53892 9.99987 5.75431 9.72295 5.75431H4.79988C4.52296 5.75431 4.30758 5.53892 4.30758 5.262V4.76969C4.30758 4.49277 4.52296 4.27738 4.79988 4.27738H9.72295C9.99987 4.27738 10.2153 4.49277 10.2153 4.76969V5.262ZM7.99988 11.2317C7.99988 11.5086 7.78449 11.724 7.50757 11.724H4.79988C4.52296 11.724 4.30758 11.5086 4.30758 11.2317V10.7394C4.30758 10.4624 4.52296 10.2471 4.79988 10.2471H7.50757C7.78449 10.2471 7.99988 10.4624 7.99988 10.7394V11.2317ZM8.73834 8.24728C8.73834 8.5242 8.52295 8.73959 8.24603 8.73959H4.79988C4.52296 8.73959 4.30758 8.5242 4.30758 8.24728V7.75497C4.30758 7.47805 4.52296 7.26267 4.79988 7.26267H8.24603C8.52295 7.26267 8.73834 7.47805 8.73834 7.75497V8.24728ZM15.2306 6.89245L14.9229 6.58476C14.7383 6.40014 14.4306 6.40014 14.246 6.58476L10.4922 10.4617C10.4614 10.4617 10.4614 10.5232 10.4614 10.5232V11.354C10.4614 11.4155 10.4614 11.4771 10.523 11.4771H11.323C11.3537 11.4771 11.3845 11.4463 11.4153 11.4463L15.1999 7.63091C15.446 7.41553 15.446 7.10784 15.2306 6.89245V6.89245Z" fill="#0250D9"/>
            </svg>
          </div>
          <p className="cell-details-history-panel-title">Actions</p>
        </div>
        <div className="cell-details-history-panel-actions">
          <button className="cell-details-history-panel-close" onClick={onClose} aria-label="Close">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="cell-details-history-tabs">
        <button
          className={`cell-details-history-tab ${activeTab === 'single' ? 'active' : ''}`}
          onClick={() => setActiveTab('single')}
        >
          {selectedCells.size === 1 ? 'Cell History' : 'History'}
        </button>
        <button
          className={`cell-details-history-tab ${activeTab === 'multi' ? 'active' : ''}`}
          onClick={() => setActiveTab('multi')}
        >
          {selectedCells.size === 1 ? 'Cell Actions' : 'Bulk Action'}
        </button>
        <button
          className={`cell-details-history-tab ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
      </div>

      {/* Panel Body */}
      <div className="cell-details-history-panel-body">
        {/* DETAILS TAB */}
        {activeTab === 'details' ? (
          <div className="cell-details-history-content">
            <div className="cell-details-history-tab-content">
              {selectedCells.size !== 1 && (
                <div className="cell-details-history-empty-state-inline">
                  <p className="cell-details-history-empty-text">
                    Select a cell to know more about its value.
                  </p>
                </div>
              )}

              {selectedCells.size === 1 && (
                <>
                  {/* Cell Info Header - keep consistent with single-cell history tab */}
                  {cellInfo && (
                    <div className="cell-details-history-header-compact">
                      <span className="cell-details-history-header-value">{cellInfo.measureName || 'N/A'}</span>
                      <span className="cell-details-history-header-separator">·</span>
                      <span className="cell-details-history-header-value">{cellInfo.timePeriod || 'N/A'}</span>
                      <span className="cell-details-history-header-separator">·</span>
                      <span className="cell-details-history-header-value">
                        {cellInfo.dimensionPath.length > 0 ? cellInfo.dimensionPath[cellInfo.dimensionPath.length - 1] : 'N/A'}
                      </span>
                      <div
                        className="cell-details-history-hierarchy-info-wrapper"
                        onMouseEnter={() => setIsHierarchyPopoverOpen(true)}
                        onMouseLeave={() => setIsHierarchyPopoverOpen(false)}
                      >
                        <button
                          ref={hierarchyButtonRef}
                          className="cell-details-history-hierarchy-button-compact"
                          onFocus={() => setIsHierarchyPopoverOpen(true)}
                          onBlur={() => setIsHierarchyPopoverOpen(false)}
                          aria-label="Show hierarchy"
                        >
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                        {isHierarchyPopoverOpen && (
                          <div ref={popoverRef} className="cell-details-history-hierarchy-popover">
                            <div className="cell-details-history-hierarchy-popover-nubbin"></div>
                            <div className="cell-details-history-hierarchy-popover-content">
                              {cellInfo.dimensionPath.length > 0 ? (
                                <span className="cell-details-history-hierarchy-path">
                                  {cellInfo.dimensionPath.join(' > ')}
                                </span>
                              ) : (
                                <span className="cell-details-history-hierarchy-path">No hierarchy available</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="cell-details-history-accordion-header"
                    onClick={() => setIsExplainabilityOpen(prev => !prev)}
                    aria-expanded={isExplainabilityOpen}
                  >
                    <svg
                      className={`cell-details-history-accordion-chevron ${isExplainabilityOpen ? 'open' : ''}`}
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6l6 6-6 6" />
                    </svg>
                    <span className="cell-details-history-accordion-title">Information</span>
                  </button>
                  {isExplainabilityOpen && (
                    <div className="cell-details-history-accordion-body">
                      <p className="cell-details-history-accordion-placeholder">
                        Explainability content will appear here.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    className="cell-details-history-accordion-header"
                    onClick={() => setIsApprovalDetailsOpen(prev => !prev)}
                    aria-expanded={isApprovalDetailsOpen}
                  >
                    <svg
                      className={`cell-details-history-accordion-chevron ${isApprovalDetailsOpen ? 'open' : ''}`}
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6l6 6-6 6" />
                    </svg>
                    <span className="cell-details-history-accordion-title">Approval Details</span>
                  </button>
                  {isApprovalDetailsOpen && (
                    <div className="cell-details-history-accordion-body">
                      {(() => {
                        if (!focusedValueCellKey) {
                          return <p className="cell-details-history-accordion-placeholder">No approval context available.</p>;
                        }
                        const approvalCellKey = focusedValueCellKey;
                        const approval = approvalRequests.get(approvalCellKey);
                        if (!approval) {
                          return <p className="cell-details-history-accordion-placeholder">No approval request found for this cell.</p>;
                        }
                        const approverRows = approval.approvers && approval.approvers.length > 0
                          ? approval.approvers
                          : [{
                              role: approval.approverName || 'Approver',
                              name: approval.approverName || 'Approver',
                              initials: (approval.approverName || 'A')
                                .split(' ')
                                .map((p: string) => p[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2),
                              status: approval.status === 'notSubmitted' ? 'pending' : approval.status,
                              comment: approval.approverComment,
                            }];

                        const statusLabel = (status: 'pending' | 'approved' | 'approvedWithCondition' | 'rejected') => {
                          if (status === 'approved') return 'Approved';
                          if (status === 'approvedWithCondition') return 'Cond. Approved';
                          if (status === 'rejected') return 'Rejected';
                          return 'Pending';
                        };

                        return (
                          <div className="cdh-approval-mini-dashboard">
                            {approverRows.map((a, idx) => (
                              <div key={`${a.name}-${a.role}-${idx}`} className="cdh-approval-mini-row">
                                <div className="cdh-approval-mini-left">
                                  <span className="cdh-approval-mini-avatar">{a.initials}</span>
                                  <div className="cdh-approval-mini-meta">
                                    <span className="cdh-approval-mini-name">{a.name}</span>
                                    <span className="cdh-approval-mini-role">{a.role}</span>
                                  </div>
                                </div>
                                <span className={`cdh-approver-badge cdh-approver-badge--${a.status === 'approvedWithCondition' ? 'pending' : a.status}`}>
                                  {statusLabel(a.status)}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : activeTab === 'multi' && selectedCells.size !== 1 ? (
          /* UPDATE TAB */
          /* Update > Bulk Edit UI (No selection or multiple cells) */
          <div className="cell-details-history-content">
            <div className="cell-details-history-tab-content">
              <div className="cell-details-history-multi-cell-form">
                {/* Select Action */}
                <div className="cell-details-history-multi-field">
                  <label className="cell-details-history-multi-label">Select Action</label>
                  <div className="cell-details-history-dropdown-wrapper" ref={selectActionDropdownRef}>
                    <div 
                      className={`cell-details-history-dropdown-trigger ${isSelectActionDropdownOpen ? 'open' : ''}`}
                      onClick={() => setIsSelectActionDropdownOpen(!isSelectActionDropdownOpen)}
                    >
                      <span className="cell-details-history-dropdown-value">
                        {selectAction}
                      </span>
                      <svg className="cell-details-history-dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    {isSelectActionDropdownOpen && (
                      <div className="cell-details-history-dropdown-list cell-details-history-dropdown-list-with-search">
                        <div className="cell-details-history-dropdown-search">
                          <svg className="cell-details-history-dropdown-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <input
                            type="text"
                            className="cell-details-history-dropdown-search-input"
                            placeholder="Select Action"
                            value={actionSearchTerm}
                            onChange={(e) => setActionSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="cell-details-history-dropdown-options-container">
                          {filteredActions.length > 0 ? (
                            filteredActions.map((option, index) => (
                              <div
                                key={index}
                                className={`cell-details-history-dropdown-option ${selectAction === option ? 'selected' : ''}`}
                                onClick={() => {
                                  setSelectAction(option);
                                  setIsSelectActionDropdownOpen(false);
                                  setActionSearchTerm('');
                                  // Reset rule when switching actions
                                  if (option === 'Bulk Edit') {
                                    setRule('Increase');
                                    setRequestNote('');
                                  } else if (option === 'Set Disaggregation Mechanism') {
                                    setRule('');
                                    setRequestNote('');
                                  } else if (option === 'Request Approval') {
                                    setRule('');
                                    setValue('');
                                    setSubmitToApprovers([...ALL_APPROVER_ROLES]);
                                  } else if (option === 'Edit Approval Status') {
                                    setRule('');
                                    setValue('');
                                    setApprovalStatusValue('');
                                    setRequestNote('');
                                    setSubmitToApprovers([...ALL_APPROVER_ROLES]);
                                  } else {
                                    setRule('');
                                    setRequestNote('');
                                  }
                                }}
                              >
                                {option}
                              </div>
                            ))
                          ) : (
                            <div className="cell-details-history-dropdown-option cell-details-history-dropdown-no-results">
                              No results found
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {selectAction === 'Request Approval' && planWideApprovalSubmitted && (
                  <div className="cell-details-history-scoped-notification-wrap">
                    <ScopedNotification
                      variant="inline"
                      className="scoped-notification--plan-submitted"
                      message="Plan already submitted for approval."
                    />
                  </div>
                )}
                <div className="cell-details-history-multi-field">
                  <label className="cell-details-history-multi-label">Select Cells</label>
                  <div className="cell-details-history-dropdown-wrapper" ref={selectCellsDropdownRef}>
                    <div 
                      className={`cell-details-history-dropdown-trigger ${isSelectCellsDropdownOpen ? 'open' : ''}`}
                      onClick={() => setIsSelectCellsDropdownOpen(!isSelectCellsDropdownOpen)}
                    >
                      <span className="cell-details-history-dropdown-value">
                        {selectCells}
                      </span>
                      <svg className="cell-details-history-dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
                    {isSelectCellsDropdownOpen && (
                      <div className="cell-details-history-dropdown-list">
                        {selectCellsOptions.map((option, index) => (
                          <div
                            key={index}
                            className={`cell-details-history-dropdown-option ${selectCells === option ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectCells(option);
                              if (option === 'Automatically') {
                                setCriteria([createDefaultAutoCriteriaRow()]);
                                setCriteriaValuePickerId(null);
                              }
                              setIsSelectCellsDropdownOpen(false);
                            }}
                          >
                            {option}
          </div>
                        ))}
                        {selectedCells.size > 0 && onClearSelection && (
                          <div
                            className="cell-details-history-dropdown-option"
                            onClick={() => {
                              onClearSelection();
                              setIsSelectCellsDropdownOpen(false);
                            }}
                            style={{ color: '#0050D9', fontWeight: 500 }}
                          >
                            Clear Selection
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {selectCells === 'Manually' && (
                    <div className="cell-details-history-multi-helper-text">
                      {selectedCells.size > 0 ? (
                        `${selectedCells.size} cell${selectedCells.size === 1 ? '' : 's'} selected`
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#5C5C5C', flexWrap: 'wrap' }}>
                          Hold <span className="cell-details-history-shift-key">Shift</span> key and select multiple cells
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Criteria UI for Automatic Selection — Field | Op | Value rows */}
                {selectCells === 'Automatically' && (
                  <div className="cell-details-history-criteria-section">
                    <div className="cell-details-history-criteria-header">
                      <h3 className="cell-details-history-criteria-title">Cell Selection Criteria</h3>
                    </div>
                    <div className="cell-details-history-criteria-grid-header" aria-hidden="true">
                      <span>Field</span>
                      <span>Operation</span>
                      <span>Value</span>
                      <span className="cell-details-history-criteria-grid-header-spacer" />
                    </div>
                    <div className="cell-details-history-criteria-list">
                      {criteria.map((criterion) => {
                        const ops = operatorsForAutoField(criterion.field);
                        const isTimeBetween = criterion.field === 'Time' && criterion.operator === 'between';
                        const optionList: string[] =
                          criterion.field === 'Account'
                            ? bulkSelectionOptions.accounts
                            : criterion.field === 'Category'
                              ? bulkSelectionOptions.categories
                              : criterion.field === 'Product'
                                ? bulkSelectionOptions.products
                                : criterion.field === 'Measure'
                                  ? bulkSelectionOptions.measures
                                  : bulkSelectionOptions.timePeriods.map(t => t.label);
                        const selectedTokens = parseCriteriaTokens(criterion.value);
                        const summaryText = isTimeBetween
                          ? criterion.value && criterion.value2
                            ? `${shortTimeLabel(criterion.value)} — ${shortTimeLabel(criterion.value2)}`
                            : 'Select periods…'
                          : selectedTokens.length > 0
                            ? selectedTokens.map(t => shortTimeLabel(t)).join(', ')
                            : 'Select…';

                        return (
                        <div key={criterion.id} className="cell-details-history-criteria-card">
                            <div className="cell-details-history-criteria-content-row">
                              <div className="cell-details-history-criteria-field cell-details-history-criteria-field--compact">
                              <select
                                value={criterion.field}
                                  onChange={(e) => {
                                    const f = e.target.value as AutoCriteriaField;
                                    const nextOps = operatorsForAutoField(f);
                                    updateCriteria(criterion.id, {
                                      field: f,
                                      operator: nextOps[0],
                                      value: '',
                                      value2: '',
                                    });
                                    setCriteriaValuePickerId(null);
                                  }}
                                className="cell-details-history-criteria-select"
                                  aria-label="Field"
                              >
                                  {AUTO_CRITERIA_FIELDS.map(f => (
                                    <option key={f} value={f}>{f}</option>
                                ))}
                              </select>
                            </div>
                              <div className="cell-details-history-criteria-operator cell-details-history-criteria-operator--compact">
                              <select
                                value={criterion.operator}
                                  onChange={(e) => {
                                    const op = e.target.value;
                                    updateCriteria(criterion.id, {
                                      operator: op,
                                      ...(op !== 'between' ? { value2: '' } : {}),
                                    });
                                    setCriteriaValuePickerId(null);
                                  }}
                                className="cell-details-history-criteria-select"
                                  aria-label="Operation"
                              >
                                  {ops.map(op => (
                                    <option key={op} value={op}>{op}</option>
                                ))}
                              </select>
                            </div>
                              <div className="cell-details-history-criteria-value cell-details-history-criteria-value--compact">
                                {isTimeBetween ? (
                                  <div className="cell-details-history-criteria-between-row">
                                    <select
                                      className="cell-details-history-criteria-select"
                                value={criterion.value}
                                onChange={(e) => updateCriteria(criterion.id, { value: e.target.value })}
                                      aria-label="Start period"
                                    >
                                      <option value="">Start</option>
                                      {bulkSelectionOptions.timePeriods.map(t => (
                                        <option key={t.key} value={t.label}>{shortTimeLabel(t.label)}</option>
                                      ))}
                                    </select>
                                    <select
                                      className="cell-details-history-criteria-select"
                                      value={criterion.value2}
                                      onChange={(e) => updateCriteria(criterion.id, { value2: e.target.value })}
                                      aria-label="End period"
                                    >
                                      <option value="">End</option>
                                      {bulkSelectionOptions.timePeriods.map(t => (
                                        <option key={t.key} value={t.label}>{shortTimeLabel(t.label)}</option>
                                      ))}
                                    </select>
                                  </div>
                                ) : (
                                  <div
                                    className="cell-details-history-criteria-value-with-picker"
                                    ref={(el) => {
                                      if (criteriaValuePickerId === criterion.id) {
                                        criteriaPickerRef.current = el;
                                      }
                                    }}
                                  >
                                    <span
                                      className={
                                        !criterion.value.trim()
                                          ? 'cell-details-history-criteria-value-summary cell-details-history-criteria-value-summary--placeholder'
                                          : 'cell-details-history-criteria-value-summary'
                                      }
                                    >
                                      {summaryText}
                                    </span>
                                    <button
                                      type="button"
                                      className="cell-details-history-criteria-browse-btn"
                                      aria-label="Choose values"
                                      disabled={optionList.length === 0}
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (optionList.length === 0) return;
                                        setCriteriaValuePickerId(prev =>
                                          prev === criterion.id ? null : criterion.id,
                                        );
                                      }}
                                    >
                                      ···
                                    </button>
                                    {criteriaValuePickerId === criterion.id && optionList.length > 0 && (
                                      <div
                                        className="cell-details-history-criteria-picker"
                                        onMouseDown={(e) => e.stopPropagation()}
                                      >
                                        {optionList.map((opt) => (
                                          <label key={opt} className="cell-details-history-criteria-picker-option">
                                            <input
                                              type="checkbox"
                                              checked={selectedTokens.includes(opt)}
                                              onChange={() => toggleCriteriaToken(criterion.id, opt)}
                                            />
                                            <span>{shortTimeLabel(opt)}</span>
                                          </label>
                                        ))}
                            </div>
                                    )}
                                  </div>
                                )}
                          </div>
                          <button
                                type="button"
                            onClick={() => removeCriteria(criterion.id)}
                            className="cell-details-history-criteria-delete"
                                aria-label="Delete condition"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="cell-details-history-criteria-actions">
                      <button
                        type="button"
                        onClick={addCriteria}
                        className="cell-details-history-criteria-add-btn"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Add condition
                      </button>
                    </div>
                  </div>
                )}

                {/* Rule - only show for Bulk Edit */}
                {selectAction === 'Bulk Edit' && (
                  <div className="cell-details-history-multi-field">
                    <label className="cell-details-history-multi-label">Rule</label>
                    <div className="cell-details-history-dropdown-wrapper" ref={ruleDropdownRef}>
                      <div 
                        className={`cell-details-history-dropdown-trigger ${isRuleDropdownOpen ? 'open' : ''}`}
                        onClick={() => setIsRuleDropdownOpen(!isRuleDropdownOpen)}
                      >
                        <span className="cell-details-history-dropdown-value">
                          {rule}
                        </span>
                        <svg className="cell-details-history-dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      {isRuleDropdownOpen && (
                        <div className="cell-details-history-dropdown-list">
                          {ruleOptions.map((option, index) => (
                            <div
                              key={index}
                              className={`cell-details-history-dropdown-option ${rule === option ? 'selected' : ''}`}
                              onClick={() => {
                                setRule(option);
                                setIsRuleDropdownOpen(false);
                              }}
                            >
                              {option}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Rule - only show for Set Disaggregation Mechanism */}
                {selectAction === 'Set Disaggregation Mechanism' && (
                  <div className="cell-details-history-multi-field">
                    <label className="cell-details-history-multi-label">Rule</label>
                    <div className="cell-details-history-dropdown-wrapper" ref={ruleDropdownRef}>
                      <div 
                        className={`cell-details-history-dropdown-trigger ${isRuleDropdownOpen ? 'open' : ''}`}
                        onClick={() => setIsRuleDropdownOpen(!isRuleDropdownOpen)}
                      >
                        <span className="cell-details-history-dropdown-value">
                          {rule || 'Select rule'}
                        </span>
                        <svg className="cell-details-history-dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      {isRuleDropdownOpen && (
                        <div className="cell-details-history-dropdown-list">
                          {disaggregationRuleOptions.map((option, index) => (
                            <div
                              key={index}
                              className={`cell-details-history-dropdown-option ${rule === option ? 'selected' : ''}`}
                              onClick={() => {
                                setRule(option);
                                setIsRuleDropdownOpen(false);
                              }}
                            >
                              {option}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Value - only show for Bulk Edit */}
                {selectAction === 'Bulk Edit' && (
                  <div className="cell-details-history-multi-field">
                    <label className="cell-details-history-multi-label">Value</label>
                    {/* Check if all selected cells are approval cells */}
                    {(() => {
                      const approvalCellKeys = Array.from(selectedCells).filter(key => key.endsWith('-approval'));
                      const isAllApprovalCells = selectedCells.size > 0 && approvalCellKeys.length === selectedCells.size;
                      
                      if (isAllApprovalCells && rule === 'Set to') {
                        // Show dropdown for approval status values
                        return (
                          <>
                          <select
                            className="cell-details-history-multi-input"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                          >
                            <option value="">Select approval status</option>
                            <option value="approved">Approved</option>
                            <option value="approvedWithCondition">Approved with Condition</option>
                            <option value="pending">Pending — Submit for Approval</option>
                            <option value="rejected">Rejected</option>
                            <option value="notSubmitted">Not Submitted</option>
                          </select>
                          {/* "Submit to" panel – shown only when submitting for approval */}
                          {value === 'pending' && (
                            <div className="cdh-submit-to-panel">
                              <p className="cdh-submit-to-label">Submit to</p>
                              <div className="cdh-submit-to-roles">
                                {ALL_APPROVER_ROLES.map(role => (
                                  <label key={role} className="cdh-submit-to-role">
                                    <input
                                      type="checkbox"
                                      checked={submitToApprovers.includes(role)}
                                      onChange={e => {
                                        if (e.target.checked) {
                                          setSubmitToApprovers(prev => [...prev, role]);
                                        } else {
                                          setSubmitToApprovers(prev => prev.filter(r => r !== role));
                                        }
                                      }}
                                    />
                                    <span className="cdh-submit-to-role-initials" style={{ background: role === 'Finance' ? '#dbeafe' : role === 'Supply Chain' ? '#d1fae5' : role === 'Sales Ops' ? '#fef3c7' : '#ede9fe' }}>
                                      {APPROVER_ROSTER[role].initials}
                                    </span>
                                    <span className="cdh-submit-to-role-text">
                                      <span className="cdh-submit-to-role-name">{APPROVER_ROSTER[role].name}</span>
                                      <span className="cdh-submit-to-role-dept">{role}</span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                          </>
                        );
                      } else {
                        // Show text input for regular cells
                        return (
                          <input
                            type="text"
                            className="cell-details-history-multi-input"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder="Enter value"
                          />
                        );
                      }
                    })()}
                  </div>
                )}

                {/* Bulk Add Adjustment Note - show for Bulk Edit */}
                {selectAction === 'Bulk Edit' && (
                  <div className="cell-details-history-multi-field">
                    <label className="cell-details-history-multi-label">Bulk Adjustment Note</label>
                    <textarea
                      className="cell-details-history-multi-textarea"
                      value={bulkNote}
                      onChange={(e) => setBulkNote(e.target.value)}
                      placeholder="Enter adjustment note (optional)"
                      rows={4}
                    />
                  </div>
                )}

                {/* Bulk Add Adjustment Note - show for Copy Adjustment Notes */}
                {selectAction === 'Copy Adjustment Notes' && (
                  <div className="cell-details-history-multi-field">
                    <label className="cell-details-history-multi-label">Bulk Add Adjustment Note</label>
                    <textarea
                      className="cell-details-history-multi-textarea"
                      value={bulkNote}
                      onChange={(e) => setBulkNote(e.target.value)}
                      placeholder="Enter adjustment note"
                      rows={4}
                    />
                  </div>
                )}

                {selectAction === 'Request Approval' && (
                  <>
                    <div className="cell-details-history-multi-field">
                      <label className="cell-details-history-multi-label">Submit to</label>
                      <div className="cdh-submit-to-panel">
                        <div className="cdh-submit-to-roles">
                          {ALL_APPROVER_ROLES.map(role => (
                            <label
                              key={role}
                              className={`cdh-submit-to-role${planWideApprovalSubmitted ? ' cdh-submit-to-role--disabled' : ''}`}
                            >
                              <input
                                type="checkbox"
                                disabled={planWideApprovalSubmitted}
                                checked={submitToApprovers.includes(role)}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setSubmitToApprovers(prev => [...prev, role]);
                                  } else {
                                    setSubmitToApprovers(prev => prev.filter(r => r !== role));
                                  }
                                }}
                              />
                              <span className="cdh-submit-to-role-initials" style={{ background: role === 'Finance' ? '#dbeafe' : role === 'Supply Chain' ? '#d1fae5' : role === 'Sales Ops' ? '#fef3c7' : '#ede9fe' }}>
                                {APPROVER_ROSTER[role].initials}
                              </span>
                              <span className="cdh-submit-to-role-text">
                                <span className="cdh-submit-to-role-name">{APPROVER_ROSTER[role].name}</span>
                                <span className="cdh-submit-to-role-dept">{role}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="cell-details-history-multi-field">
                      <label className="cell-details-history-multi-label">Request note</label>
                      <textarea
                        className="cell-details-history-multi-textarea"
                        value={requestNote}
                        onChange={(e) => setRequestNote(e.target.value)}
                        placeholder="Add request note (optional)"
                        rows={4}
                      />
                    </div>
                  </>
                )}

                {selectAction === 'Edit Approval Status' && (
                  <>
                    <div className="cell-details-history-multi-field">
                      <label className="cell-details-history-multi-label">Approval status</label>
                      <select
                        className="cell-details-history-multi-input"
                        value={approvalStatusValue}
                        onChange={(e) => setApprovalStatusValue(e.target.value)}
                      >
                        <option value="">Select approval status</option>
                        <option value="approved">Approved</option>
                        <option value="approvedWithCondition">Approved with Condition</option>
                        <option value="pending">Pending</option>
                        <option value="rejected">Rejected</option>
                        <option value="notSubmitted">Not Submitted</option>
                      </select>
                    </div>
                    {approvalStatusValue === 'pending' && (
                      <div className="cell-details-history-multi-field">
                        <label className="cell-details-history-multi-label">Submit to</label>
                        <div className="cdh-submit-to-panel">
                          <div className="cdh-submit-to-roles">
                            {ALL_APPROVER_ROLES.map(role => (
                              <label key={role} className="cdh-submit-to-role">
                                <input
                                  type="checkbox"
                                  checked={submitToApprovers.includes(role)}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setSubmitToApprovers(prev => [...prev, role]);
                                    } else {
                                      setSubmitToApprovers(prev => prev.filter(r => r !== role));
                                    }
                                  }}
                                />
                                <span className="cdh-submit-to-role-initials" style={{ background: role === 'Finance' ? '#dbeafe' : role === 'Supply Chain' ? '#d1fae5' : role === 'Sales Ops' ? '#fef3c7' : '#ede9fe' }}>
                                  {APPROVER_ROSTER[role].initials}
                                </span>
                                <span className="cdh-submit-to-role-text">
                                  <span className="cdh-submit-to-role-name">{APPROVER_ROSTER[role].name}</span>
                                  <span className="cdh-submit-to-role-dept">{role}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="cell-details-history-multi-field">
                      <label className="cell-details-history-multi-label">Status note</label>
                      <textarea
                        className="cell-details-history-multi-textarea"
                        value={requestNote}
                        onChange={(e) => setRequestNote(e.target.value)}
                        placeholder="Add status note (optional)"
                        rows={4}
                      />
                    </div>
                  </>
                )}

                {/* Update and Cancel Buttons */}
                <div className="cell-details-history-multi-actions">
                  <button 
                    className="cell-details-history-multi-cancel-btn"
                    onClick={() => {
                      // Clear form state
                      setSelectCells('Manually');
                      setSelectAction('Bulk Edit');
                      setRule('Increase');
                      setValue('20%');
                      setBulkNote('');
                      setRequestNote('');
                      setApprovalStatusValue('');
                      setSubmitToApprovers([...ALL_APPROVER_ROLES]);
                      setCriteria([]);
                      setCriteriaValuePickerId(null);
                      // Clear selection
                      if (onClearSelection) {
                        onClearSelection();
                      }
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    className="cell-details-history-multi-update-btn"
                    onClick={() => {
                      if (!onMassUpdate || resolvedBulkTargetKeys.length === 0) return;
                      const orderedKeys = resolvedBulkTargetKeys;
                        
                        if (selectAction === 'Bulk Edit' && value.trim()) {
                          onMassUpdate(orderedKeys, rule, value.trim(), bulkNote.trim() || undefined, undefined, value.trim() === 'pending' ? submitToApprovers : undefined);
                        } else if (selectAction === 'Request Approval') {
                        if (requestApprovalEligibleKeys.length === 0) return;
                        setRequestApprovalConfirmOpen(true);
                        } else if (selectAction === 'Edit Approval Status' && approvalStatusValue) {
                          const approvalKeys = orderedKeys.map(key => key.endsWith('-approval') ? key : `${key}-approval`);
                          onMassUpdate(
                            approvalKeys,
                            'Set to',
                            approvalStatusValue,
                            requestNote.trim() || undefined,
                            undefined,
                            approvalStatusValue === 'pending' ? submitToApprovers : undefined
                          );
                        } else if (selectAction === 'Set Disaggregation Mechanism' && rule) {
                          onMassUpdate(orderedKeys, '', '', bulkNote.trim() || undefined, rule);
                      }
                    }}
                    disabled={
                      (selectAction === 'Bulk Edit' && (!value.trim() || resolvedBulkTargetKeys.length === 0)) ||
                      (selectAction === 'Request Approval' &&
                        (planWideApprovalSubmitted ||
                          submitToApprovers.length === 0 ||
                          requestApprovalEligibleKeys.length === 0)) ||
                      (selectAction === 'Edit Approval Status' &&
                        (!approvalStatusValue ||
                          (approvalStatusValue === 'pending' && submitToApprovers.length === 0) ||
                          resolvedBulkTargetKeys.length === 0)) ||
                      (selectAction === 'Set Disaggregation Mechanism' && (!rule || resolvedBulkTargetKeys.length === 0))
                    }
                  >
                    {selectAction === 'Request Approval' ? 'Request' : 'Update'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'multi' && selectedCells.size === 1 ? (
          /* Update > Single Cell Update UI (exactly 1 cell selected) */
          <div className="cell-details-history-content">
            {/* Cell Info Header */}
            {cellInfo && (
              <div className="cell-details-history-header-compact">
                <span className="cell-details-history-header-value">{cellInfo.measureName || 'N/A'}</span>
                <span className="cell-details-history-header-separator">·</span>
                <span className="cell-details-history-header-value">{cellInfo.timePeriod || 'N/A'}</span>
                <span className="cell-details-history-header-separator">·</span>
                <span className="cell-details-history-header-value">
                  {cellInfo.dimensionPath.length > 0 ? cellInfo.dimensionPath[cellInfo.dimensionPath.length - 1] : 'N/A'}
                </span>
              </div>
            )}
            <div className="cell-details-history-tab-content">
              <div className="cell-details-history-single-update-form">
                  <h3 className="cell-details-history-single-section-title">Edit Cell</h3>
                  
                  {/* Value Field */}
                  <div className="cell-details-history-multi-field">
                    <label className="cell-details-history-multi-label">New Value</label>
                    <input
                      type="text"
                      className="cell-details-history-multi-input"
                      value={singleCellNewValue}
                      onChange={(e) => setSingleCellNewValue(e.target.value)}
                      placeholder="Enter new value"
                    />
                  </div>
                  
                  {/* Adjustment Note */}
                  <div className="cell-details-history-multi-field">
                    <label className="cell-details-history-multi-label">Adjustment Note</label>
                    <textarea
                      className="cell-details-history-multi-textarea"
                      value={singleCellAdjustmentNote}
                      onChange={(e) => setSingleCellAdjustmentNote(e.target.value)}
                      placeholder="Enter adjustment note (optional)"
                      rows={3}
                    />
                  </div>

                  {/* Disaggregation Rule */}
                  <div className="cell-details-history-multi-field">
                    <label className="cell-details-history-multi-label">Disaggregation Rule</label>
                    <select
                      className="cell-details-history-multi-input"
                      value={disaggregationRule}
                      onChange={(e) => setDisaggregationRule(e.target.value)}
                    >
                      <option value="Proportional">Proportional</option>
                      <option value="Equal">Equal</option>
                      <option value="Even">Even</option>
                    </select>
                  </div>

                  {/* Lock cell */}
                  <div className="cell-details-history-multi-field">
                    <label className="cdh-lock-cell-checkbox">
                      <input
                        type="checkbox"
                        checked={lockCellChecked}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setLockCellChecked(next);
                          // Apply the lock/unlock immediately so the grid reflects it.
                          if (onToggleCellLock && focusedValueCellKey) {
                            const currentlyLocked = isCellLocked ? isCellLocked(focusedValueCellKey) : false;
                            if (next !== currentlyLocked) {
                              onToggleCellLock(focusedValueCellKey);
                            }
                          }
                        }}
                      />
                      <span>Lock cell</span>
                    </label>
                  </div>

                  <h3 className="cell-details-history-single-section-title">Request or Provide Approvals</h3>
                  <div className="cell-details-history-approval-action-group" aria-label="Request or provide approvals">
                    <button
                      type="button"
                      className="cell-details-history-approval-action-btn"
                      onClick={() => setApprovalModal('request')}
                    >
                      Request Approval
                    </button>
                    <button
                      type="button"
                      className="cell-details-history-approval-action-btn"
                      onClick={() => setApprovalModal('provide')}
                    >
                      Provide Approval
                    </button>
                  </div>

                {/* Request Approval modal */}
                {approvalModal === 'request' && createPortal(
                  <div
                    className="planning-approval-modal-overlay"
                    role="presentation"
                    onClick={() => setApprovalModal(null)}
                  >
                    <div
                      className="planning-approval-modal"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="cdh-request-approval-modal-title"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="planning-approval-modal-header">
                        <h2 id="cdh-request-approval-modal-title" className="planning-approval-modal-title">
                          Request Approval
                        </h2>
                        <button
                          type="button"
                          className="planning-approval-modal-close"
                          onClick={() => setApprovalModal(null)}
                          aria-label="Close"
                        >
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="planning-approval-modal-body">
                        <div className="cell-details-history-multi-field">
                          <label className="cell-details-history-multi-label">Submit to</label>
                          <div className="cdh-submit-to-panel">
                            <div className="cdh-submit-to-roles">
                              {ALL_APPROVER_ROLES.map(role => (
                                <label key={role} className="cdh-submit-to-role">
                                  <input
                                    type="checkbox"
                                    checked={submitToApprovers.includes(role)}
                                    onChange={e => {
                                      if (e.target.checked) {
                                        setSubmitToApprovers(prev => [...prev, role]);
                                      } else {
                                        setSubmitToApprovers(prev => prev.filter(r => r !== role));
                                      }
                                    }}
                                  />
                                  <span
                                    className="cdh-submit-to-role-initials"
                                    style={{ background: role === 'Finance' ? '#dbeafe' : role === 'Supply Chain' ? '#d1fae5' : role === 'Sales Ops' ? '#fef3c7' : '#ede9fe' }}
                                  >
                                    {APPROVER_ROSTER[role].initials}
                                  </span>
                                  <span className="cdh-submit-to-role-text">
                                    <span className="cdh-submit-to-role-name">{APPROVER_ROSTER[role].name}</span>
                                    <span className="cdh-submit-to-role-dept">{role}</span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="cell-details-history-multi-field">
                          <label className="cell-details-history-multi-label">Request note</label>
                          <textarea
                            className="cell-details-history-multi-textarea"
                            value={requestNote}
                            onChange={(e) => setRequestNote(e.target.value)}
                            placeholder="Add request note (optional)"
                            rows={4}
                          />
                        </div>
                      </div>
                      <div className="planning-approval-modal-footer">
                        <button
                          type="button"
                          className="planning-approval-modal-btn planning-approval-modal-btn-cancel"
                          onClick={() => setApprovalModal(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="planning-approval-modal-btn planning-approval-modal-btn-confirm"
                          onClick={() => {
                            if (!focusedValueCellKey || !onMassUpdate) return;
                            onMassUpdate([focusedValueCellKey], 'Set to', 'pending', requestNote.trim() || undefined, undefined, submitToApprovers);
                            // Notify the targeted approver(s) via the header bell.
                            const recipientUserIds = submitToApprovers
                              .map((role) => APPROVER_ROSTER[role]?.name)
                              .map((name) => (name ? APP_USERS.find((u) => u.name === name)?.id : undefined))
                              .filter((id): id is string => !!id && id !== currentUser.id);
                            const reqMonthKey = focusedCell?.monthKey;
                            const reqLastDimension =
                              cellInfo?.dimensionPath && cellInfo.dimensionPath.length > 0
                                ? cellInfo.dimensionPath[cellInfo.dimensionPath.length - 1]
                                : undefined;
                            publishCellApprovalRequested({
                              requesterUserId: currentUser.id,
                              requesterName: currentUser.name,
                              recipientUserIds,
                              summary: cellSummaryLabel,
                              notes: requestNote.trim() || undefined,
                              cellKey: focusedValueCellKey,
                              focusContext: {
                                searchTerm: [cellInfo?.measureName, reqLastDimension].filter(Boolean).join(' ') || undefined,
                                startPeriod: reqMonthKey,
                                endPeriod: reqMonthKey,
                                measureSummary: cellInfo?.measureName,
                                dimensionSummary: reqLastDimension,
                                selectedCellKeys: focusedValueCellKey ? [focusedValueCellKey] : undefined,
                              },
                            });
                            setRequestNote('');
                            setApprovalModal(null);
                          }}
                          disabled={submitToApprovers.length === 0 || !focusedValueCellKey}
                        >
                          Request
                        </button>
                      </div>
                    </div>
                  </div>,
                  document.body
                )}

                {/* Provide Approval modal — mirrors the record-page approver decision modal */}
                {approvalModal === 'provide' && createPortal((() => {
                  const approvalCellKey = focusedValueCellKey;
                  const approval = approvalCellKey ? approvalRequests.get(approvalCellKey) : undefined;
                  const oldValue = approval?.oldValue ?? (singleCellNewValue ? Number(singleCellNewValue) * 0.92 : 0);
                  const newValue = approval?.newValue ?? Number(singleCellNewValue || 0);
                  const variancePct = approval?.variancePct ?? (oldValue ? ((newValue - oldValue) / oldValue) * 100 : 0);
                  const absVariancePct = Math.abs(variancePct);

                  const budgetVariancePct = variancePct - 3.5;
                  const historical3mPct = variancePct - 1.8;
                  const historical12mPct = variancePct + 2.1;
                  const marginImpactPct = variancePct >= 0 ? Math.max(0.6, variancePct * 0.22) : variancePct * 0.14;
                  const revenueImpact = (newValue - oldValue) * 125;
                  const capacityUtilization = Math.min(99, Math.max(52, 72 + Math.round(absVariancePct * 0.9)));
                  const leadTimeDays = Math.max(7, 14 + Math.round(absVariancePct * 0.2));
                  const scheduleRisk = capacityUtilization > 90 ? 'High' : capacityUtilization > 80 ? 'Medium' : 'Low';

                  const pros = [
                    variancePct >= 0 && `Forecast vs prior: ${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(1)}%`,
                    budgetVariancePct >= 0 && `Forecast vs budget: ${budgetVariancePct >= 0 ? '+' : ''}${budgetVariancePct.toFixed(1)}%`,
                    (historical3mPct >= 0 && historical12mPct >= 0) && `Historical trend positive (3M / 12M)`,
                    marginImpactPct >= 0 && `Margin impact: +${marginImpactPct.toFixed(1)}%`,
                    revenueImpact >= 0 && `Revenue impact: +$${Math.round(revenueImpact).toLocaleString('en-US')}`,
                    capacityUtilization <= 85 && `Capacity within range (${capacityUtilization}%)`,
                    leadTimeDays <= 18 && `Lead time acceptable (${leadTimeDays}d)`,
                    scheduleRisk === 'Low' && `Schedule risk: Low`,
                  ].filter(Boolean) as string[];

                  const cons = [
                    variancePct < 0 && `Forecast vs prior: ${variancePct.toFixed(1)}%`,
                    budgetVariancePct < 0 && `Forecast vs budget: ${budgetVariancePct.toFixed(1)}%`,
                    !(historical3mPct >= 0 && historical12mPct >= 0) && `Historical trend mixed or negative`,
                    marginImpactPct < 0 && `Margin impact: ${marginImpactPct.toFixed(1)}%`,
                    revenueImpact < 0 && `Revenue impact: -$${Math.abs(Math.round(revenueImpact)).toLocaleString('en-US')}`,
                    capacityUtilization > 85 && `Capacity strained (${capacityUtilization}%)`,
                    leadTimeDays > 18 && `Lead time extended (${leadTimeDays}d)`,
                    scheduleRisk !== 'Low' && `Schedule risk: ${scheduleRisk}`,
                  ].filter(Boolean) as string[];

                  return (
                    <div
                      className="planning-approval-modal-overlay"
                      role="presentation"
                      onClick={() => setApprovalModal(null)}
                    >
                      <div
                        className="planning-approval-modal planning-approval-modal--approver-decision"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cdh-provide-approval-modal-title"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="planning-approval-modal-header">
                          <h2 id="cdh-provide-approval-modal-title" className="planning-approval-modal-title">
                            Provide Approval
                          </h2>
                          <button
                            type="button"
                            className="planning-approval-modal-close"
                            onClick={() => setApprovalModal(null)}
                            aria-label="Close"
                          >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="planning-approval-modal-body">
                          <div className="planning-decision-factors">
                            <div className="planning-decision-factors-header">
                              <h3 className="planning-decision-factors-title">Decision factors</h3>
                              <button
                                type="button"
                                className="planning-decision-factors-toggle"
                                onClick={() => setIsProvideApprovalExpanded(prev => !prev)}
                              >
                                {isProvideApprovalExpanded ? 'Less details' : 'More details'}
                              </button>
                            </div>

                            {isProvideApprovalExpanded && (
                              <>
                                {pros.length > 0 && (
                                  <div className="planning-decision-factors-section">
                                    <div className="planning-decision-factors-badge planning-decision-factors-badge--supporting">
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                                      </svg>
                                      SUPPORTING
                                    </div>
                                    <ul className="planning-decision-factors-list planning-decision-factors-list--supporting">
                                      {pros.map((p, i) => <li key={i}>{p}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {cons.length > 0 && (
                                  <div className="planning-decision-factors-section">
                                    <div className="planning-decision-factors-badge planning-decision-factors-badge--concerning">
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                        <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
                                      </svg>
                                      CONCERNING
                                    </div>
                                    <ul className="planning-decision-factors-list planning-decision-factors-list--concerning">
                                      {cons.map((c, i) => <li key={i}>{c}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {pros.length === 0 && cons.length === 0 && (
                                  <span className="cdh-provide-empty">No factors available</span>
                                )}
                              </>
                            )}
                          </div>

                          <div className="planning-approver-decision-select-wrap">
                            <div className="planning-approver-decision-select-label" id="cdh-provide-approval-decision-label">
                              Your decision
                            </div>
                            <div
                              className="planning-approver-decision-btn-group"
                              role="group"
                              aria-labelledby="cdh-provide-approval-decision-label"
                            >
                              <button
                                type="button"
                                className={`planning-approver-decision-btn planning-approver-decision-btn--approve${
                                  provideApprovalDecision === 'approved' ? ' planning-approver-decision-btn--selected' : ''
                                }`}
                                aria-pressed={provideApprovalDecision === 'approved'}
                                onClick={() => setProvideApprovalDecision('approved')}
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
                                onClick={() => setProvideApprovalDecision('approvedWithCondition')}
                              >
                                Conditionally Approve
                              </button>
                              <button
                                type="button"
                                className={`planning-approver-decision-btn planning-approver-decision-btn--reject${
                                  provideApprovalDecision === 'rejected' ? ' planning-approver-decision-btn--selected' : ''
                                }`}
                                aria-pressed={provideApprovalDecision === 'rejected'}
                                onClick={() => setProvideApprovalDecision('rejected')}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                          <label className="planning-submit-approval-notes-label" htmlFor="cdh-provide-approval-notes">
                            Notes <span className="planning-submit-approval-notes-optional">(optional)</span>
                          </label>
                          <textarea
                            id="cdh-provide-approval-notes"
                            className="planning-approval-modal-textarea"
                            rows={4}
                            value={provideApprovalNote}
                            onChange={e => setProvideApprovalNote(e.target.value)}
                            placeholder="Add context for your decision (conditions, follow-ups, rejection reasons)…"
                          />
                        </div>
                        <div className="planning-approval-modal-footer">
                          <button
                            type="button"
                            className="planning-approval-modal-btn planning-approval-modal-btn-cancel"
                            onClick={() => setApprovalModal(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="planning-approval-modal-btn planning-approval-modal-btn-confirm"
                            onClick={() => {
                              if (!focusedValueCellKey || !onMassUpdate) return;
                              onMassUpdate([focusedValueCellKey], 'Edit Approval Status', provideApprovalDecision, provideApprovalNote.trim() || undefined);
                              // Notify the original requester of the approval outcome via the header bell.
                              const requesterUserId = approvalRequests.get(focusedValueCellKey)?.requesterId;
                              if (requesterUserId && requesterUserId !== currentUser.id) {
                                publishCellApproverDecision({
                                  requesterUserId,
                                  approverName: currentUser.name,
                                  outcome: provideApprovalDecision as PlanApproverDecisionOutcome,
                                  summary: cellSummaryLabel,
                                  notes: provideApprovalNote.trim() || undefined,
                                });
                              }
                              setProvideApprovalDecision('approved');
                              setProvideApprovalNote('');
                              setApprovalModal(null);
                            }}
                            disabled={!provideApprovalDecision || !focusedValueCellKey}
                          >
                            Submit
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })(), document.body)}
              </div>
            </div>
          </div>
        ) : activeTab === 'single' && selectedCells.size !== 1 ? (
          /* History > Aggregated History View (No selection = all cells, Multiple = selected cells) */
          <div className="cell-details-history-content">
            {/* Contextual Header with Filter */}
            <div className="cell-details-history-context-header">
              <div className="cell-details-history-context-header-main">
                {selectedCells.size === 0 ? (
                  <>
                    <span className="cell-details-history-context-text">Complete cell edit history</span>
                    <span className="cell-details-history-context-hint">Select cells in the grid to view their specific history</span>
                  </>
                ) : (
                  <span className="cell-details-history-context-text">Edit history for {selectedCells.size} selected cells</span>
                )}
              </div>
              <div className="cell-details-history-filter-wrapper">
                <button
                  ref={filterButtonRef}
                  className={`cell-details-history-filter-btn ${isFilterPopoverOpen ? 'active' : ''}`}
                  onClick={() => setIsFilterPopoverOpen(!isFilterPopoverOpen)}
                  aria-label="Filter history"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                  </svg>
                </button>
                {isFilterPopoverOpen && (
                  <div ref={filterPopoverRef} className="cell-details-history-filter-popover">
                    <div className="cell-details-history-filter-popover-nubbin"></div>
                    <div className="cell-details-history-filter-popover-content">
                      <div className="cell-details-history-filter-field">
                        <label>Date Range</label>
                        <div className="cell-details-history-filter-date-row">
                          <input
                            type="date"
                            value={filterDateFrom}
                            onChange={(e) => setFilterDateFrom(e.target.value)}
                            placeholder="From"
                          />
                          <span>to</span>
                          <input
                            type="date"
                            value={filterDateTo}
                            onChange={(e) => setFilterDateTo(e.target.value)}
                            placeholder="To"
                          />
                        </div>
                      </div>
                      <div className="cell-details-history-filter-field">
                        <label>User</label>
                        <select
                          value={filterUser}
                          onChange={(e) => setFilterUser(e.target.value)}
                        >
                          <option value="">All users</option>
                          <option value="john-carter">John Carter</option>
                          <option value="sarah-chen">Sarah Chen</option>
                          <option value="mike-johnson">Mike Johnson</option>
                        </select>
                      </div>
                      <div className="cell-details-history-filter-actions">
                        <button
                          className="cell-details-history-filter-clear-btn"
                          onClick={() => {
                            setFilterDateFrom('');
                            setFilterDateTo('');
                            setFilterUser('');
                          }}
                        >
                          Clear
                        </button>
                        <button
                          className="cell-details-history-filter-apply-btn"
                          onClick={() => setIsFilterPopoverOpen(false)}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="cell-details-history-tab-content">
                <div className="cell-details-history-multi-history">
                  {/* History Thread - Generic comments + Edit history */}
                  <div className="cell-details-history-multi-history-section">
                    <div className="cell-details-history-notes-list">
                      {/* Generic Comments at the top (only when no cell selected) */}
                      {selectedCells.size === 0 && genericComments.map((comment, index) => (
                        <GenericCommentCard
                          key={comment.id}
                          id={comment.id}
                          userName={comment.userName}
                          userInitials={comment.userInitials}
                          message={comment.message}
                          timestamp={comment.timestamp}
                          replies={genericCommentReplies[comment.id] || []}
                          onAddReply={handleAddGenericCommentReply}
                          isFirst={index === 0}
                          isLast={index === genericComments.length - 1 && editHistory.length === 0}
                        />
                      ))}
                      
                      {/* Cell Edit History */}
                      {(() => {
                        // Direct mapping for dimension names from rowId prefixes
                        // These should match what's displayed in the grid's first frozen column
                        const dimensionNameMap: Record<string, string> = {
                          // Account level
                          'account': 'MagnaDrive - Michigan Plant',
                          // Categories
                          'category-transmission': 'Transmission Assembly',
                          'category-chassis': 'Chassis Components',
                          'category-engine': 'Engine Assembly',
                          'category-powertrain': 'Powertrain Systems',
                          // Transmission products (TRN 750 series)
                          'product-trn-a': 'TRN 750 - A',
                          'product-trn-b': 'TRN 750 - B',
                          'product-trn-c': 'TRN 750 - C',
                          'product-trn-d': 'TRN 750 - D',
                          'product-trn-e': 'TRN 750 - E',
                          // Chassis products (matching actual data names)
                          'product-chs-a': 'Chassis Product 1',
                          'product-chs-b': 'Chassis Product 2',
                          'product-chs-c': 'Chassis Product 1',
                          'product-chs-d': 'Chassis Product 2',
                          'product-chassis-1': 'Chassis Product 1',
                          'product-chassis-2': 'Chassis Product 2',
                          // Engine products
                          'product-eng-a': 'Engine Product 1',
                          'product-eng-b': 'Engine Product 2',
                          // Powertrain products
                          'product-pwr-a': 'Powertrain Product 1',
                          'product-pwr-b': 'Powertrain Product 2',
                        };
                        
                        // For no selection (size === 0), show all edits; for multiple selection, filter to selected cells
                        const relevantEdits = selectedCells.size === 0 
                          ? editHistory.slice().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                          : editHistory
                              .filter((e) =>
                                Array.from(selectedCells).some((ck) => editHistoryEntryAffectsCell(e, ck))
                              )
                              .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                        
                        // Helper to generate cell context from entry (Row · Column · Header)
                        const getCellContext = (entry: CellEditHistoryEntry): string => {
                          const cellInfo = extractCellInfo(
                            { rowId: entry.rowId, monthKey: entry.timeKey, measureId: entry.measureId },
                            data,
                            layout
                          );
                          
                          const parts = [];
                          
                          // Row context first (dimension) - try multiple sources
                          if (cellInfo && cellInfo.dimensionPath.length > 0) {
                            parts.push(cellInfo.dimensionPath[cellInfo.dimensionPath.length - 1]);
                          } else if (entry.rowId) {
                            // Extract dimension prefix and look up in map
                            const measureIndex = entry.rowId.indexOf('-measure-');
                            const dimensionPrefix = measureIndex > 0 ? entry.rowId.substring(0, measureIndex) : entry.rowId;
                            
                            if (dimensionNameMap[dimensionPrefix]) {
                              parts.push(dimensionNameMap[dimensionPrefix]);
                            } else {
                              // Fallback: Try to find in data by searching for matching ID
                              let foundName: string | null = null;
                              for (const measure of data) {
                                if (measure.children) {
                                  for (const account of measure.children) {
                                    if (account.id === entry.rowId || account.id.startsWith(dimensionPrefix)) {
                                      foundName = account.name;
                                      break;
                                    }
                                    if (account.children) {
                                      for (const category of account.children) {
                                        if (category.id === entry.rowId || category.id.startsWith(dimensionPrefix)) {
                                          foundName = category.name;
                                          break;
                                        }
                                        if (category.children) {
                                          for (const product of category.children) {
                                            if (product.id === entry.rowId || product.id.startsWith(dimensionPrefix)) {
                                              foundName = product.name;
                                              break;
                                            }
                                          }
                                        }
                                        if (foundName) break;
                                      }
                                    }
                                    if (foundName) break;
                                  }
                                }
                                if (foundName) break;
                              }
                              if (foundName) {
                                parts.push(foundName);
                              }
                            }
                          }
                          
                          // Column context second (time)
                          if (cellInfo?.timePeriod) {
                            parts.push(cellInfo.timePeriod);
                          } else if (entry.timeKey) {
                            // Fallback: format the timeKey directly
                            const timeMap: Record<string, string> = {
                              'jan2026': 'Jan 2026', 'feb2026': 'Feb 2026', 'mar2026': 'Mar 2026',
                              'apr2026': 'Apr 2026', 'may2026': 'May 2026', 'jun2026': 'Jun 2026',
                              'jul2026': 'Jul 2026', 'aug2026': 'Aug 2026', 'sep2026': 'Sep 2026',
                              'oct2026': 'Oct 2026', 'nov2026': 'Nov 2026', 'dec2026': 'Dec 2026',
                            };
                            parts.push(timeMap[entry.timeKey] || entry.timeKey);
                          }
                          
                          // Header context third (measure)
                          if (cellInfo?.measureName) {
                            parts.push(cellInfo.measureName);
                          } else if (entry.measureId) {
                            // Fallback: find measure name directly
                            const measure = data.find(m => m.id === entry.measureId);
                            if (measure) parts.push(measure.name);
                          } else if (entry.rowId) {
                            // Try to extract measure from rowId (format: ...-measure-{measureId})
                            const measureMatch = entry.rowId.match(/-measure-(.+)$/);
                            if (measureMatch) {
                              const measureId = measureMatch[1];
                              const measureNames: Record<string, string> = {
                                'sa-rev': 'Sales Agreement Revenue',
                                'sa-qty': 'Sales Agreement Quantity',
                                'opp-rev': 'Opportunity Revenue',
                                'opp-qty': 'Opportunity Quantity',
                              };
                              if (measureNames[measureId]) {
                                parts.push(measureNames[measureId]);
                              }
                            }
                          }
                          
                          return parts.join(' · ') || entry.cellKey;
                        };
                        
                        // Helper to get full hierarchy path for tooltip
                        const getFullHierarchyPath = (entry: CellEditHistoryEntry): string => {
                          const cellInfo = extractCellInfo(
                            { rowId: entry.rowId, monthKey: entry.timeKey, measureId: entry.measureId },
                            data,
                            layout
                          );
                          if (cellInfo && cellInfo.dimensionPath.length > 0) {
                            return cellInfo.dimensionPath.join(' > ');
                          }
                          
                          // Fallback: Build hierarchy path from rowId
                          const measureIndex = entry.rowId.indexOf('-measure-');
                          const dimensionPrefix = measureIndex > 0 ? entry.rowId.substring(0, measureIndex) : entry.rowId;
                          
                          // Build path based on prefix type
                          if (dimensionPrefix === 'account') {
                            return 'MagnaDrive - Michigan Plant';
                          } else if (dimensionPrefix.startsWith('category-')) {
                            const catName = dimensionNameMap[dimensionPrefix] || dimensionPrefix;
                            return `MagnaDrive - Michigan Plant > ${catName}`;
                          } else if (dimensionPrefix.startsWith('product-')) {
                            // Determine parent category from product prefix
                            let category = 'Unknown Category';
                            if (dimensionPrefix.includes('trn')) {
                              category = 'Transmission Assembly';
                            } else if (dimensionPrefix.includes('chs') || dimensionPrefix.includes('chassis')) {
                              category = 'Chassis Components';
                            } else if (dimensionPrefix.includes('eng')) {
                              category = 'Engine Assembly';
                            } else if (dimensionPrefix.includes('pwr')) {
                              category = 'Powertrain Systems';
                            }
                            const prodName = dimensionNameMap[dimensionPrefix] || dimensionPrefix;
                            return `MagnaDrive - Michigan Plant > ${category} > ${prodName}`;
                          }
                          
                          return '';
                        };
                        
                        // Helper to get dimension type from entry
                        const getDimensionType = (entry: CellEditHistoryEntry): 'account' | 'category' | 'product' | undefined => {
                          const rowId = entry.rowId.toLowerCase();
                          if (rowId.includes('account') || rowId.includes('magnadrive')) return 'account';
                          if (rowId.includes('category') || rowId.includes('chassis') || rowId.includes('transmission') || rowId.includes('powertrain')) return 'category';
                          if (rowId.includes('product') || rowId.includes('trn-') || rowId.includes('chs-') || rowId.includes('pwr-')) return 'product';
                          return 'product'; // default to product
                        };
                        
                        // Get thread color based on dimension type
                        const getThreadColor = (dimType: 'account' | 'category' | 'product' | undefined): string => {
                          switch (dimType) {
                            case 'account': return 'var(--color-accent-blue)';
                            case 'category': return 'var(--slds-g-color-success-1)';
                            case 'product': return 'var(--color-dimension-product-icon)';
                            default: return 'var(--slds-g-color-neutral-base-50)';
                          }
                        };
                        
                        // Group edits by cell and get latest per cell
                        const editsByCell = relevantEdits.reduce((acc, edit) => {
                          if (!acc[edit.cellKey]) {
                            acc[edit.cellKey] = [];
                          }
                          acc[edit.cellKey].push(edit);
                          return acc;
                        }, {} as Record<string, CellEditHistoryEntry[]>);
                        
                        // Get only the latest edit per cell, sorted by timestamp
                        const latestEditsPerCell = Object.values(editsByCell)
                          .map(edits => edits[0]) // First one is latest (already sorted)
                          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                        
                        // Handler for "View all changes" - sets focused cell and selects it
                        const handleViewAllChanges = (entry: CellEditHistoryEntry) => {
                          // Set the focused cell
                          if (onSetFocusedCell) {
                            onSetFocusedCell({
                              rowId: entry.rowId,
                              monthKey: entry.timeKey,
                              measureId: entry.measureId
                            });
                          }
                          // Also select the cell so the panel switches to single-cell view
                          if (onSelectSingleCell) {
                            onSelectSingleCell(entry.cellKey);
                          }
                        };
                        
                        return latestEditsPerCell.length > 0 ? (
                          latestEditsPerCell.map((entry, index) => {
                            const dimType = getDimensionType(entry);
                            return (
                              <CellEditHistoryCard 
                                key={entry.id} 
                                entry={entry}
                                replies={cardReplies[entry.id] || []}
                                onAddReply={handleAddCardReply}
                                isLast={index === latestEditsPerCell.length - 1}
                                isFirst={index === 0}
                                cellContext={getCellContext(entry)}
                                cellContextAsHeader={true}
                                threadColor={getThreadColor(dimType)}
                                dimensionType={dimType}
                                editCountForCell={editsByCell[entry.cellKey].length}
                                onViewAllChanges={() => handleViewAllChanges(entry)}
                                fullHierarchyPath={getFullHierarchyPath(entry)}
                                measureName={(() => {
                                  const cellInfo = extractCellInfo(
                                    { rowId: entry.rowId, monthKey: entry.timeKey, measureId: entry.measureId },
                                    data,
                                    layout
                                  );
                                  return cellInfo?.measureName || (entry.measureId ? data.find(m => m.id === entry.measureId)?.name : undefined);
                                })()}
                              />
                            );
                          })
                        ) : (
                          // Only show placeholder if no generic comments either
                          (selectedCells.size === 0 && genericComments.length > 0) ? null : (
                            <p className="cell-details-history-placeholder">{selectedCells.size === 0 ? 'No edit history available yet' : 'No edits found for selected cells'}</p>
                          )
                        );
                      })()}
                    </div>
                  </div>
                </div>
            </div>
            
            {/* Comment Box (only when no cell selected) */}
            {selectedCells.size === 0 && (
              <div className="cell-details-history-panel-footer">
                <div className="cell-details-history-note-input-section">
                  <div className="cell-details-history-label-row">
                    <label className="cell-details-history-note-label">Comments</label>
                    <button className="cell-details-history-attach-btn-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                      </svg>
                    </button>
                  </div>
                  <div className="cell-details-history-textarea-wrapper">
                    <textarea
                      className="cell-details-history-note-textarea"
                      value={genericCommentText}
                      onChange={(e) => setGenericCommentText(e.target.value)}
                      placeholder="Enter a general comment"
                      rows={1}
                    />
                    <button 
                      className="cell-details-history-send-btn"
                      onClick={handlePostGenericComment}
                      disabled={!genericCommentText.trim()}
                      type="button"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'single' && selectedCells.size === 1 ? (
          /* History > Single Cell - Full History (exactly 1 cell selected) */
        <div className="cell-details-history-content">
            {/* Cell Info Header - Compact single line: Measure · Time · Dimension */}
            {cellInfo && (
              <div className="cell-details-history-header-compact">
                <span className="cell-details-history-header-value">{cellInfo.measureName || 'N/A'}</span>
                <span className="cell-details-history-header-separator">·</span>
                <span className="cell-details-history-header-value">{cellInfo.timePeriod || 'N/A'}</span>
                <span className="cell-details-history-header-separator">·</span>
                <span className="cell-details-history-header-value">
                  {cellInfo.dimensionPath.length > 0 ? cellInfo.dimensionPath[cellInfo.dimensionPath.length - 1] : 'N/A'}
                </span>
                <div 
                  className="cell-details-history-hierarchy-info-wrapper"
                  onMouseEnter={() => setIsHierarchyPopoverOpen(true)}
                  onMouseLeave={() => setIsHierarchyPopoverOpen(false)}
                >
                <button
                  ref={hierarchyButtonRef}
                  className="cell-details-history-hierarchy-button-compact"
                    onFocus={() => setIsHierarchyPopoverOpen(true)}
                    onBlur={() => setIsHierarchyPopoverOpen(false)}
                  aria-label="Show hierarchy"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {isHierarchyPopoverOpen && (
                  <div ref={popoverRef} className="cell-details-history-hierarchy-popover">
                    <div className="cell-details-history-hierarchy-popover-nubbin"></div>
                    <div className="cell-details-history-hierarchy-popover-content">
                      {cellInfo.dimensionPath.length > 0 ? (
                        <span className="cell-details-history-hierarchy-path">
                          {cellInfo.dimensionPath.join(' > ')}
                        </span>
                      ) : (
                        <span className="cell-details-history-hierarchy-path">No hierarchy available</span>
                      )}
                    </div>
                  </div>
                )}
                </div>
              </div>
            )}
              <div className="cell-details-history-tab-content">
                {/* Approval timeline — only shown when opened from an approval cell */}
                {isApprovalView && (() => {
                  if (!focusedCell) return null;
                  const approvalCellKey = focusedCell.monthKey
                    ? `${focusedCell.rowId}-${focusedCell.monthKey}`
                    : focusedCell.rowId;
                  const approval = approvalRequests.get(approvalCellKey);
                  if (!approval || approval.status === 'notSubmitted') return null;

                  // Build synthetic history entries — one for the submission + one per approver
                  const syntheticEntries: CellEditHistoryEntry[] = [];

                  // 1. Submission entry (requester)
                  syntheticEntries.push({
                    id: `approval-submit-${approval.id}`,
                    cellKey: approvalCellKey,
                    rowId: focusedCell.rowId,
                    timeKey: focusedCell.monthKey,
                    note: `Not Submitted → Pending${approval.requesterNote ? ': ' + approval.requesterNote : ''}`,
                    timestamp: new Date(approval.createdAt),
                    userId: approval.requesterId,
                    userName: approval.requesterName,
                  });

                  // 2. Per-approver entries
                  const approverList = approval.approvers && approval.approvers.length > 0
                    ? approval.approvers
                    : [{
                        role: '',
                        name: approval.approverName || 'Approver',
                        initials: approval.approverName
                          ? approval.approverName.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2)
                          : '?',
                        status: approval.status as 'pending' | 'approved' | 'approvedWithCondition' | 'rejected',
                        comment: approval.approverComment,
                        resolvedAt: approval.resolvedAt,
                      }];

                  approverList.forEach((a: { role: string; name: string; initials: string; status: 'pending' | 'approved' | 'approvedWithCondition' | 'rejected'; comment?: string; resolvedAt?: Date }, idx: number) => {
                    const statusLabel = a.status === 'approved' ? 'Approved' : a.status === 'approvedWithCondition' ? 'Approved with Condition' : a.status === 'rejected' ? 'Rejected' : 'Pending';
                    const note = a.status === 'pending'
                      ? 'Pending'
                      : a.status === 'approvedWithCondition'
                        ? `Pending → Approved with Condition${a.comment ? ': ' + a.comment : ''}`
                        : `Pending → ${statusLabel}${a.comment ? ': ' + a.comment : ''}`;
                    const ts = a.status !== 'pending' && a.resolvedAt
                      ? new Date(a.resolvedAt)
                      : new Date(new Date(approval.createdAt).getTime() + (idx + 1) * 3600000);
                    syntheticEntries.push({
                      id: `approval-approver-${approval.id}-${idx}`,
                      cellKey: approvalCellKey,
                      rowId: focusedCell.rowId,
                      timeKey: focusedCell.monthKey,
                      note,
                      timestamp: ts,
                      userId: `approver-${idx}`,
                      userName: a.name + (a.role ? ` · ${a.role}` : ''),
                    });
                  });

                  return (
                    <div className="cdh-approval-timeline-section">
                      <div className="cdh-approval-timeline-header">
                        <span>Approval Status</span>
                      </div>
                      {syntheticEntries.map((entry, index) => (
                        <CellEditHistoryCard
                          key={entry.id}
                          entry={entry}
                          isFirst={index === 0}
                          isLast={index === syntheticEntries.length - 1}
                        />
                      ))}
                    </div>
                  );
                })()}

                {/* Edit History Section — only shown when opened from a numerical cell */}
                {!isApprovalView && (<div className="cell-details-history-notes-section">
                  {/* History List */}
                  <div className="cell-details-history-notes-list">
                    {cellEditHistory.length > 0 ? (
                      cellEditHistory.map((entry, index) => {
                        const cellInfo = extractCellInfo(
                          { rowId: entry.rowId, monthKey: entry.timeKey, measureId: entry.measureId },
                          data,
                          layout
                        );
                        const measureName = cellInfo?.measureName || (entry.measureId ? data.find(m => m.id === entry.measureId)?.name : undefined);
                        return (
                          <CellEditHistoryCard 
                            key={entry.id} 
                            entry={entry}
                            replies={cardReplies[entry.id] || []}
                            onAddReply={handleAddCardReply}
                            isLast={index === cellEditHistory.length - 1}
                            isFirst={index === 0}
                            measureName={measureName}
                          />
                        );
                      })
                    ) : (
                      <div className="cell-details-history-empty-state-content">
                        {hasFocusedCell && (
                          <div className="cell-details-history-empty-illustration">
                            <svg width="304" height="192" viewBox="0 0 304 192" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M132 32L192 152H72L132 32Z" fill="#C1D5FF"/>
                              <path d="M174.453 24.6162C174.297 24.1951 173.703 24.1951 173.547 24.6162L172.388 27.7471C172.278 28.0437 172.044 28.2779 171.747 28.3877L168.616 29.5469C168.195 29.7027 168.195 30.2973 168.616 30.4531L171.747 31.6123C172.044 31.7221 172.278 31.9563 172.388 32.2529L173.547 35.3838C173.703 35.8049 174.297 35.8049 174.453 35.3838L175.612 32.2529C175.722 31.9563 175.956 31.7221 176.253 31.6123L179.384 30.4531C179.805 30.2973 179.805 29.7027 179.384 29.5469L176.253 28.3877C175.956 28.2779 175.722 28.0437 175.612 27.7471L174.453 24.6162Z" stroke="#7097FF" strokeWidth="0.6"/>
                              <path d="M77.265 56.5117C77.5175 55.8294 78.4825 55.8294 78.735 56.5117L79.8937 59.6433C79.9731 59.8578 80.1422 60.0269 80.3567 60.1063L83.4883 61.265C84.1706 61.5175 84.1706 62.4825 83.4883 62.735L80.3567 63.8937C80.1422 63.9731 79.9731 64.1422 79.8937 64.3567L78.735 67.4883C78.4825 68.1706 77.5175 68.1706 77.265 67.4883L76.1063 64.3567C76.0269 64.1422 75.8578 63.9731 75.6433 63.8937L72.5117 62.735C71.8294 62.4825 71.8294 61.5175 72.5117 61.265L75.6433 60.1063C75.8578 60.0269 76.0269 59.8578 76.1063 59.6433L77.265 56.5117Z" fill="#2E52B4"/>
                              <path d="M228.477 72.3319C228.313 71.8894 227.687 71.8894 227.523 72.3319L226.742 74.4422C226.691 74.5813 226.581 74.691 226.442 74.7424L224.332 75.5233C223.889 75.6871 223.889 76.3129 224.332 76.4767L226.442 77.2576C226.581 77.309 226.691 77.4187 226.742 77.5578L227.523 79.6681C227.687 80.1106 228.313 80.1106 228.477 79.6681L229.258 77.5578C229.309 77.4187 229.419 77.309 229.558 77.2576L231.668 76.4767C232.111 76.3129 232.111 75.6871 231.668 75.5233L229.558 74.7424C229.419 74.691 229.309 74.5813 229.258 74.4422L228.477 72.3319Z" fill="#2E52B4"/>
                              <path d="M196 88C196 80.5739 193.05 73.452 187.799 68.201C182.548 62.95 175.426 60 168 60C160.574 60 153.452 62.95 148.201 68.201C142.95 73.452 140 80.5739 140 88L168 88L196 88Z" fill="#DFEAFE"/>
                              <path d="M147 88C147 83.7565 145.367 79.6869 142.46 76.6863C139.553 73.6857 135.611 72 131.5 72C127.389 72 123.447 73.6857 120.54 76.6863C117.633 79.6869 116 83.7565 116 88L131.5 88L147 88Z" fill="#DFEAFE"/>
                              <path d="M40 128C40 117.391 44.2143 107.14 51.7157 99.6388C59.2172 92.1374 69.3913 87.9231 80 87.9231C90.6087 87.9231 100.783 92.1374 108.284 99.6388C115.786 107.14 120 117.391 120 128L80 127.923L40 128Z" fill="#DFEAFE"/>
                              <path d="M106 128C106 122.982 108.56 118.09 112.022 114.542C115.485 110.993 120.18 109 125.077 109C129.973 109 134.669 110.993 138.131 114.542C141.593 118.09 144 122.982 144 128L125.077 127.921L106 128Z" fill="#DFEAFE"/>
                              <g filter="url(#filter0_ddddii_2091_51862)">
                                <path d="M188 56L136 160H240L188 56Z" fill="url(#paint0_linear_2091_51862)"/>
                                <path d="M188 56L166 100H210L188 56Z" fill="white" fillOpacity="0.4"/>
                              </g>
                              <defs>
                                <filter id="filter0_ddddii_2091_51862" x="133.994" y="53.6591" width="135.1" height="132.425" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                                  <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                                  <feOffset dx="1.33764" dy="1.00323"/>
                                  <feGaussianBlur stdDeviation="1.67205"/>
                                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
                                  <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_2091_51862"/>
                                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                                  <feOffset dx="4.68174" dy="4.01292"/>
                                  <feGaussianBlur stdDeviation="3.00969"/>
                                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.21 0"/>
                                  <feBlend mode="normal" in2="effect1_dropShadow_2091_51862" result="effect2_dropShadow_2091_51862"/>
                                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                                  <feOffset dx="10.7011" dy="9.02906"/>
                                  <feGaussianBlur stdDeviation="4.18012"/>
                                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.13 0"/>
                                  <feBlend mode="normal" in2="effect2_dropShadow_2091_51862" result="effect3_dropShadow_2091_51862"/>
                                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                                  <feOffset dx="19.0614" dy="16.0517"/>
                                  <feGaussianBlur stdDeviation="5.01615"/>
                                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0"/>
                                  <feBlend mode="normal" in2="effect3_dropShadow_2091_51862" result="effect4_dropShadow_2091_51862"/>
                                  <feBlend mode="normal" in="SourceGraphic" in2="effect4_dropShadow_2091_51862" result="shape"/>
                                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                                  <feOffset dx="-1.00323" dy="-1.00323"/>
                                  <feGaussianBlur stdDeviation="0.501615"/>
                                  <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0"/>
                                  <feBlend mode="normal" in2="shape" result="effect5_innerShadow_2091_51862"/>
                                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                                  <feOffset dx="1.00323" dy="1.00323"/>
                                  <feGaussianBlur stdDeviation="0.501615"/>
                                  <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                                  <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0"/>
                                  <feBlend mode="normal" in2="effect5_innerShadow_2091_51862" result="effect6_innerShadow_2091_51862"/>
                                </filter>
                                <linearGradient id="paint0_linear_2091_51862" x1="165.5" y1="94.5" x2="198" y2="145.5" gradientUnits="userSpaceOnUse">
                                  <stop stopColor="#A4BCFF"/>
                                  <stop offset="1" stopColor="#648EFF"/>
                                </linearGradient>
                              </defs>
                            </svg>
                          </div>
                        )}
                        <p className="cell-details-history-placeholder">
                          No cell edit history available for this cell. Edit the value or add a note to see the changes logged here.
                        </p>
                      </div>
                    )}
                  </div>
                </div>)}
              </div>
              </div>
        ) : null}
        
        {/* Panel Footer - Note Input (only for single cell selection in History tab) */}
        {selectedCells.size === 1 && activeTab === 'single' && (
          <div className="cell-details-history-panel-footer">
            <div className="cell-details-history-note-input-section">
              <div className="cell-details-history-label-row">
                <label className="cell-details-history-note-label">Comments</label>
                <button className="cell-details-history-attach-btn-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
              </div>
              <div className="cell-details-history-textarea-wrapper">
                <textarea
                  className="cell-details-history-note-textarea"
                  value={panelNoteText}
                  onChange={(e) => setPanelNoteText(e.target.value)}
                  placeholder="Enter a comment"
                  rows={1}
                />
                <button 
                  className="cell-details-history-send-btn"
                  onClick={handlePostNote}
                  disabled={!panelNoteText.trim()}
                  type="button"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    <RequestApprovalConfirmModal
      isOpen={requestApprovalConfirmOpen}
      cellCount={requestApprovalEligibleKeys.length}
      onCancel={() => setRequestApprovalConfirmOpen(false)}
      onConfirm={() => {
        const orderedKeys = [...requestApprovalEligibleKeys];
        if (!onMassUpdate || orderedKeys.length === 0) return;
        setRequestApprovalConfirmOpen(false);
        const approvalKeys = orderedKeys.map(key => (key.endsWith('-approval') ? key : `${key}-approval`));
        onMassUpdate(
          approvalKeys,
          'Set to',
          'pending',
          requestNote.trim() || undefined,
          undefined,
          submitToApprovers
        );
      }}
    />
    </>
  );
};

export default CellDetailsHistoryPanel;

