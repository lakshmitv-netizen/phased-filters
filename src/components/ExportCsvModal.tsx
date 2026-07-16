import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ScopedNotification from './ScopedNotification';
import { getWeekOptionsForCalendarYear } from '../utils/planPeriodOptions';
import '../styles/components/ExportCsvModal.css';
import '../styles/components/SettingsPanel.css';

export interface ExportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EXPORT_CSV_FISCAL_YEAR = 2026;

const PORTAL_Z = 100060;

/** Same hierarchy as plan creation modal (SettingsPanel / list page). */
interface PlanModalDimensionLevel {
  id: string;
  name: string;
  hierarchy: string;
}

const PLAN_MODAL_DIMENSION_LEVELS: PlanModalDimensionLevel[] = [
  { id: 'account', name: 'Accounts', hierarchy: 'Account Hierarchy' },
  { id: 'category', name: 'Category', hierarchy: 'Product Hierarchy' },
  { id: 'product', name: 'Product', hierarchy: 'Product Hierarchy' },
];

const PLAN_MODAL_ACCOUNT_ICON = '/new_account.svg';
const PLAN_MODAL_CATEGORY_ICON = '/category.svg';
const PLAN_MODAL_PRODUCT_ICON = '/product.svg';

function buildPlanModalDimensionHierarchyGroups(): Record<string, PlanModalDimensionLevel[]> {
  const groups: Record<string, PlanModalDimensionLevel[]> = {};
  PLAN_MODAL_DIMENSION_LEVELS.forEach((level) => {
    if (!groups[level.hierarchy]) groups[level.hierarchy] = [];
    groups[level.hierarchy].push(level);
  });
  return groups;
}

const PLAN_MODAL_DIMENSION_HIERARCHY_GROUPS = buildPlanModalDimensionHierarchyGroups();

const PLAN_MODAL_MEASURE_SUBGROUP_OPTIONS = [
  { value: 'Revenue & Quantity Measures' },
  { value: 'Adjustment Measures' },
] as const;

const COMBOBOX_INPUT_STYLE: React.CSSProperties = {
  height: '40px',
  padding: '0 36px 0 12px',
  border: '1px solid var(--color-border-ui-strong)',
  borderRadius: '0.25rem',
  fontSize: '14px',
  color: 'var(--color-on-surface-strong)',
  backgroundColor: 'white',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  width: '100%',
  boxSizing: 'border-box',
};

function buildSampleCsv(dimensionsSummary: string, periodRangeSummary: string, measuresSummary: string): string {
  const header = 'Product,Region,Period,Measure,Value';
  const rows = [
    'Widget A,North,FY26 Jan,Forecast Units,12840',
    'Widget A,North,FY26 Feb,Forecast Units,13102',
    'Widget B,South,FY26 Jan,Forecast Revenue,402500',
    `"(export: ${dimensionsSummary}, ${periodRangeSummary}, ${measuresSummary})"`,
  ];
  return [header, ...rows].join('\n');
}

function dimensionSummaryFromSet(selected: Set<string>): string {
  const names = PLAN_MODAL_DIMENSION_LEVELS.filter((l) => selected.has(l.id)).map((l) => l.name);
  return names.length ? names.join(', ') : '—';
}

function exportDimensionLevelIcon(levelId: string) {
  if (levelId === 'account') {
    return (
      <img
        src={PLAN_MODAL_ACCOUNT_ICON}
        alt=""
        style={{ width: '20px', height: '20px', marginLeft: '12px', marginRight: '4px', flexShrink: 0 }}
      />
    );
  }
  if (levelId === 'category') {
    return (
      <img
        src={PLAN_MODAL_CATEGORY_ICON}
        alt=""
        style={{ width: '20px', height: '20px', marginLeft: '12px', marginRight: '4px', flexShrink: 0 }}
      />
    );
  }
  if (levelId === 'product') {
    return (
      <img
        src={PLAN_MODAL_PRODUCT_ICON}
        alt=""
        style={{ width: '20px', height: '20px', marginLeft: '12px', marginRight: '4px', flexShrink: 0 }}
      />
    );
  }
  return null;
}

const ExportCsvModal: React.FC<ExportCsvModalProps> = ({ isOpen, onClose }) => {
  const [scheduleRecurring, setScheduleRecurring] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [frequency, setFrequency] = useState<string>('weekly');

  const [selectedDimensionLevels, setSelectedDimensionLevels] = useState<Set<string>>(
    () => new Set(['account', 'category', 'product']),
  );
  const [dimensionDropdownOpen, setDimensionDropdownOpen] = useState(false);
  const [dimensionDropdownPosition, setDimensionDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const dimensionDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedMeasureSubgroups, setSelectedMeasureSubgroups] = useState<Set<string>>(
    () => new Set(PLAN_MODAL_MEASURE_SUBGROUP_OPTIONS.map((o) => o.value)),
  );
  const [measureDropdownOpen, setMeasureDropdownOpen] = useState(false);
  const [measureDropdownPosition, setMeasureDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const measureDropdownRef = useRef<HTMLDivElement>(null);

  const periodOptions = useMemo(() => getWeekOptionsForCalendarYear(EXPORT_CSV_FISCAL_YEAR), []);

  const [startWeekId, setStartWeekId] = useState('');
  const [endWeekId, setEndWeekId] = useState('');
  const [weekStartSearchTerm, setWeekStartSearchTerm] = useState('');
  const [weekEndSearchTerm, setWeekEndSearchTerm] = useState('');
  const [weekStartDropdownOpen, setWeekStartDropdownOpen] = useState(false);
  const [weekEndDropdownOpen, setWeekEndDropdownOpen] = useState(false);
  const [weekStartDropdownPosition, setWeekStartDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [weekEndDropdownPosition, setWeekEndDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const weekStartComboboxRef = useRef<HTMLDivElement>(null);
  const weekEndComboboxRef = useRef<HTMLDivElement>(null);

  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const progressFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setScheduleRecurring(false);
    setScheduledDate('');
    setScheduledTime('');
    setFrequency('weekly');
    setSelectedDimensionLevels(new Set(['account', 'category', 'product']));
    setSelectedMeasureSubgroups(new Set(PLAN_MODAL_MEASURE_SUBGROUP_OPTIONS.map((o) => o.value)));
    const first = periodOptions[0];
    const last = periodOptions[periodOptions.length - 1];
    setStartWeekId(first?.id ?? '');
    setEndWeekId(last?.id ?? '');
    setWeekStartSearchTerm(first?.label ?? '');
    setWeekEndSearchTerm(last?.label ?? '');
    setWeekStartDropdownOpen(false);
    setWeekEndDropdownOpen(false);
    setDimensionDropdownOpen(false);
    setMeasureDropdownOpen(false);
    setDownloadProgress(null);
  }, [isOpen, periodOptions]);

  const cancelProgressAnimation = useCallback(() => {
    if (progressFrameRef.current != null) {
      cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    cancelProgressAnimation();
    setDownloadProgress(null);
    setWeekStartDropdownOpen(false);
    setWeekEndDropdownOpen(false);
    setDimensionDropdownOpen(false);
    setMeasureDropdownOpen(false);
    onClose();
  }, [cancelProgressAnimation, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (weekStartDropdownOpen) {
        setWeekStartDropdownOpen(false);
        setWeekStartDropdownPosition(null);
        return;
      }
      if (weekEndDropdownOpen) {
        setWeekEndDropdownOpen(false);
        setWeekEndDropdownPosition(null);
        return;
      }
      if (dimensionDropdownOpen) {
        setDimensionDropdownOpen(false);
        setDimensionDropdownPosition(null);
        return;
      }
      if (measureDropdownOpen) {
        setMeasureDropdownOpen(false);
        setMeasureDropdownPosition(null);
        return;
      }
      handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose, weekStartDropdownOpen, weekEndDropdownOpen, dimensionDropdownOpen, measureDropdownOpen]);

  useEffect(() => {
    return () => cancelProgressAnimation();
  }, [cancelProgressAnimation]);

  const selectedStartPeriod = periodOptions.find((w) => w.id === startWeekId);
  const selectedEndPeriod = periodOptions.find((w) => w.id === endWeekId);

  const endPeriodCandidateOptions = useMemo(() => {
    if (!selectedStartPeriod) return periodOptions;
    return periodOptions.filter((w) => w.order >= selectedStartPeriod.order);
  }, [periodOptions, selectedStartPeriod]);

  const filteredPeriodStartOptions =
    weekStartSearchTerm.trim() === ''
      ? periodOptions
      : periodOptions.filter((w) => w.label.toLowerCase().includes(weekStartSearchTerm.toLowerCase()));

  const filteredPeriodEndOptions =
    weekEndSearchTerm.trim() === ''
      ? endPeriodCandidateOptions
      : endPeriodCandidateOptions.filter((w) => w.label.toLowerCase().includes(weekEndSearchTerm.toLowerCase()));

  useEffect(() => {
    if (selectedStartPeriod && !weekStartDropdownOpen && weekStartSearchTerm !== selectedStartPeriod.label) {
      setWeekStartSearchTerm(selectedStartPeriod.label);
    }
    if (!startWeekId && weekStartSearchTerm !== '') {
      setWeekStartSearchTerm('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWeekId, selectedStartPeriod?.label, weekStartDropdownOpen]);

  useEffect(() => {
    if (selectedEndPeriod && !weekEndDropdownOpen && weekEndSearchTerm !== selectedEndPeriod.label) {
      setWeekEndSearchTerm(selectedEndPeriod.label);
    }
    if (!endWeekId && weekEndSearchTerm !== '') {
      setWeekEndSearchTerm('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endWeekId, selectedEndPeriod?.label, weekEndDropdownOpen]);

  useEffect(() => {
    if (weekStartDropdownOpen && weekStartComboboxRef.current) {
      const rect = weekStartComboboxRef.current.getBoundingClientRect();
      setWeekStartDropdownPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setWeekStartDropdownPosition(null);
    }
  }, [weekStartDropdownOpen]);

  useEffect(() => {
    if (weekEndDropdownOpen && weekEndComboboxRef.current) {
      const rect = weekEndComboboxRef.current.getBoundingClientRect();
      setWeekEndDropdownPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setWeekEndDropdownPosition(null);
    }
  }, [weekEndDropdownOpen]);

  const attachDropdownPositionListeners = useCallback(
    (
      open: boolean,
      wrapperRef: React.RefObject<HTMLDivElement | null>,
      setPosition: (p: { top: number; left: number; width: number } | null) => void,
    ) => {
      if (!open) {
        setPosition(null);
        return;
      }
      const updatePosition = () => {
        const el = wrapperRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const width = rect.width;
        const top = rect.bottom + 4;
        let left = rect.left;
        const margin = 8;
        if (left + width > window.innerWidth - margin) {
          left = Math.max(margin, window.innerWidth - width - margin);
        }
        if (left < margin) left = margin;
        setPosition({ top, left, width });
      };

      updatePosition();
      const modalBody = wrapperRef.current?.closest('.export-csv-modal-body') ?? null;
      let raf1 = 0;
      let raf2 = 0;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(updatePosition);
      });

      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      modalBody?.addEventListener('scroll', updatePosition);

      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
        modalBody?.removeEventListener('scroll', updatePosition);
      };
    },
    [],
  );

  useLayoutEffect(() => {
    return attachDropdownPositionListeners(dimensionDropdownOpen, dimensionDropdownRef, setDimensionDropdownPosition);
  }, [dimensionDropdownOpen, attachDropdownPositionListeners]);

  useLayoutEffect(() => {
    return attachDropdownPositionListeners(measureDropdownOpen, measureDropdownRef, setMeasureDropdownPosition);
  }, [measureDropdownOpen, attachDropdownPositionListeners]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (weekStartDropdownOpen && weekStartComboboxRef.current) {
        const isClickOnCombobox = weekStartComboboxRef.current.contains(target);
        const isClickOnDropdown = (target as Element).closest?.('.export-csv-modal-period-dropdown');
        if (!isClickOnCombobox && !isClickOnDropdown) {
          setWeekStartDropdownOpen(false);
          setWeekStartDropdownPosition(null);
        }
      }

      if (weekEndDropdownOpen && weekEndComboboxRef.current) {
        const isClickOnCombobox = weekEndComboboxRef.current.contains(target);
        const isClickOnDropdown = (target as Element).closest?.('.export-csv-modal-period-dropdown');
        if (!isClickOnCombobox && !isClickOnDropdown) {
          setWeekEndDropdownOpen(false);
          setWeekEndDropdownPosition(null);
        }
      }

      if (dimensionDropdownOpen && dimensionDropdownRef.current) {
        const isClickOnTrigger = dimensionDropdownRef.current.contains(target);
        const isClickOnDropdown = (target as Element).closest?.('.export-csv-modal-dimension-dropdown');
        if (!isClickOnTrigger && !isClickOnDropdown) {
          setDimensionDropdownOpen(false);
          setDimensionDropdownPosition(null);
        }
      }

      if (measureDropdownOpen && measureDropdownRef.current) {
        const isClickOnTrigger = measureDropdownRef.current.contains(target);
        const isClickOnDropdown = (target as Element).closest?.('.export-csv-modal-measure-dropdown');
        if (!isClickOnTrigger && !isClickOnDropdown) {
          setMeasureDropdownOpen(false);
          setMeasureDropdownPosition(null);
        }
      }
    };

    if (weekStartDropdownOpen || weekEndDropdownOpen || dimensionDropdownOpen || measureDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [weekStartDropdownOpen, weekEndDropdownOpen, dimensionDropdownOpen, measureDropdownOpen]);

  const dimensionLevelCount = selectedDimensionLevels.size;
  const measureSubgroupCount = selectedMeasureSubgroups.size;

  const toggleDimensionLevel = (levelId: string) => {
    setSelectedDimensionLevels((prev) => {
      const next = new Set(prev);
      if (next.has(levelId)) {
        if (next.size <= 1) return prev;
        next.delete(levelId);
      } else {
        next.add(levelId);
      }
      return next;
    });
  };

  const toggleMeasureSubgroup = (value: string) => {
    setSelectedMeasureSubgroups((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        if (next.size <= 1) return prev;
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const periodRangeSummary = useCallback(() => {
    const a = selectedStartPeriod?.label ?? startWeekId;
    const b = selectedEndPeriod?.label ?? endWeekId;
    return `${a} – ${b}`;
  }, [selectedStartPeriod?.label, selectedEndPeriod?.label, startWeekId, endWeekId]);

  const exportMetaSummary = useCallback(() => {
    return {
      dimensions: dimensionSummaryFromSet(selectedDimensionLevels),
      period: periodRangeSummary(),
      measures: [...selectedMeasureSubgroups].join(', ') || '—',
    };
  }, [periodRangeSummary, selectedDimensionLevels, selectedMeasureSubgroups]);

  const runDeterministicDownload = useCallback(() => {
    cancelProgressAnimation();
    setDownloadProgress(0);
    const start = performance.now();
    const durationMs = 1200;
    const meta = exportMetaSummary();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = t * t * (3 - 2 * t);
      setDownloadProgress(Math.round(eased * 100));
      if (t < 1) {
        progressFrameRef.current = requestAnimationFrame(tick);
      } else {
        progressFrameRef.current = null;
        const csv = buildSampleCsv(meta.dimensions, meta.period, meta.measures);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plan_export_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setDownloadProgress(null);
        handleClose();
      }
    };
    progressFrameRef.current = requestAnimationFrame(tick);
  }, [cancelProgressAnimation, exportMetaSummary, handleClose]);

  const handleDownload = () => {
    if (scheduleRecurring) {
      if (!scheduledDate || !scheduledTime) return;
      cancelProgressAnimation();
      setDownloadProgress(0);
      const start = performance.now();
      const durationMs = 900;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = t * t * (3 - 2 * t);
        setDownloadProgress(Math.round(eased * 100));
        if (t < 1) {
          progressFrameRef.current = requestAnimationFrame(tick);
        } else {
          progressFrameRef.current = null;
          setDownloadProgress(null);
          handleClose();
        }
      };
      progressFrameRef.current = requestAnimationFrame(tick);
      return;
    }
    runDeterministicDownload();
  };

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  const scheduleIncomplete = scheduleRecurring && (!scheduledDate || !scheduledTime);
  const fieldsIncomplete =
    !scheduleRecurring &&
    (selectedDimensionLevels.size === 0 || selectedMeasureSubgroups.size === 0 || !startWeekId || !endWeekId);
  const downloadDisabled = downloadProgress !== null || scheduleIncomplete || fieldsIncomplete;

  const periodDropdownBaseStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: PORTAL_Z,
    backgroundColor: 'var(--color-surface-white)',
    border: '1px solid var(--color-border-ui-strong)',
    borderRadius: '0.25rem',
    boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
    padding: '0.25rem 0',
    maxHeight: '20rem',
    overflowY: 'auto',
  };

  const searchIcon = (
    <div
      style={{
        position: 'absolute',
        right: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M5.5 9.5C7.70914 9.5 9.5 7.70914 9.5 5.5C9.5 3.29086 7.70914 1.5 5.5 1.5C3.29086 1.5 1.5 3.29086 1.5 5.5C1.5 7.70914 3.29086 9.5 5.5 9.5Z"
          stroke="var(--color-interactive-border)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8.5 8.5L10.5 10.5"
          stroke="var(--color-interactive-border)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );

  return createPortal(
    <div
      className="export-csv-modal-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="export-csv-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-csv-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="export-csv-modal-header">
          <h2 id="export-csv-modal-title" className="export-csv-modal-title">
            Export CSV
          </h2>
          <button type="button" className="export-csv-modal-close" onClick={handleClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="export-csv-modal-body">
          <label className="export-csv-modal-checkbox-row">
            <input
              type="checkbox"
              checked={scheduleRecurring}
              onChange={(e) => setScheduleRecurring(e.target.checked)}
              className="export-csv-modal-checkbox"
            />
            <span>Schedule a recurring export</span>
          </label>

          {scheduleRecurring ? (
            <div className="export-csv-modal-section">
              <p className="export-csv-modal-section-label">Schedule</p>
              <div className="export-csv-modal-field-row">
                <div className="export-csv-modal-field">
                  <label className="export-csv-modal-field-label" htmlFor="export-csv-scheduled-date">
                    Scheduled date
                  </label>
                  <input
                    id="export-csv-scheduled-date"
                    type="date"
                    className="export-csv-modal-input"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />
                </div>
                <div className="export-csv-modal-field">
                  <label className="export-csv-modal-field-label" htmlFor="export-csv-scheduled-time">
                    Scheduled time
                  </label>
                  <input
                    id="export-csv-scheduled-time"
                    type="time"
                    className="export-csv-modal-input"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="export-csv-modal-field">
                <label className="export-csv-modal-field-label" htmlFor="export-csv-frequency">
                  Recurring frequency
                </label>
                <select
                  id="export-csv-frequency"
                  className="export-csv-modal-select"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="export-csv-modal-section">
              <p className="export-csv-modal-section-lead">Select the fields to download</p>

              <div className="export-csv-modal-field">
                <label className="export-csv-modal-field-label">Dimension levels</label>
                <div className="settings-dropdown-wrapper" ref={dimensionDropdownRef}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={`settings-dropdown-trigger ${dimensionDropdownOpen ? 'open' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDimensionDropdownOpen((o) => !o);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDimensionDropdownOpen((o) => !o);
                      }
                    }}
                    aria-expanded={dimensionDropdownOpen}
                    aria-haspopup="listbox"
                  >
                    <span
                      className={dimensionLevelCount > 0 ? 'settings-dropdown-value' : 'settings-dropdown-placeholder'}
                    >
                      {dimensionLevelCount > 0
                        ? `${dimensionLevelCount} Level${dimensionLevelCount !== 1 ? 's' : ''} Selected`
                        : 'Select Dimension Levels'}
                    </span>
                    <svg className="settings-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {dimensionDropdownOpen &&
                    dimensionDropdownPosition &&
                    createPortal(
                      <div
                        className="settings-dropdown-list settings-dimension-dropdown export-csv-modal-dimension-dropdown"
                        role="listbox"
                        aria-multiselectable="true"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'fixed',
                          top: `${dimensionDropdownPosition.top}px`,
                          left: `${dimensionDropdownPosition.left}px`,
                          width: `${dimensionDropdownPosition.width}px`,
                          zIndex: PORTAL_Z,
                          maxHeight: '20rem',
                          overflowY: 'auto',
                          boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                        }}
                      >
                        {Object.entries(PLAN_MODAL_DIMENSION_HIERARCHY_GROUPS).map(([hierarchy, levels]) => (
                          <div key={hierarchy}>
                            <div className="settings-dropdown-header">{hierarchy}</div>
                            {levels.map((level) => {
                              const isSelected = selectedDimensionLevels.has(level.id);
                              return (
                                <div
                                  key={level.id}
                                  className="settings-dropdown-checkbox-option"
                                  role="option"
                                  aria-selected={isSelected}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleDimensionLevel(level.id);
                                  }}
                                >
                                  <div className={`settings-checkbox-wrapper ${isSelected ? 'checked' : ''}`}>
                                    {isSelected && (
                                      <svg
                                        className="settings-checkbox-icon"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2.5}
                                          d="M5 13l4 4L19 7"
                                        />
                                      </svg>
                                    )}
                                  </div>
                                  {exportDimensionLevelIcon(level.id)}
                                  <span className="settings-dropdown-checkbox-label">{level.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>,
                      document.body,
                    )}
                </div>
              </div>

              <div className="export-csv-modal-field">
                <p className="export-csv-modal-field-label export-csv-modal-label--static">Time range</p>
                <div className="export-csv-modal-period-row">
                  <div className="export-csv-modal-combobox-wrap" ref={weekStartComboboxRef}>
                    <label className="export-csv-modal-sublabel" htmlFor="export-csv-week-start-input">
                      Start period
                    </label>
                    <div className="slds-combobox" style={{ position: 'relative' }}>
                      <div className="slds-combobox__form-element slds-input-has-icon slds-input-has-icon_right">
                        <input
                          id="export-csv-week-start-input"
                          type="text"
                          className="slds-input slds-combobox__input"
                          value={
                            weekStartDropdownOpen
                              ? weekStartSearchTerm
                              : selectedStartPeriod
                                ? selectedStartPeriod.label
                                : weekStartSearchTerm
                          }
                          placeholder="Search or select start week"
                          onChange={(e) => {
                            setWeekStartSearchTerm(e.target.value);
                            setWeekStartDropdownOpen(true);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setWeekStartDropdownOpen(true);
                            if (selectedStartPeriod && weekStartSearchTerm === selectedStartPeriod.label) {
                              setWeekStartSearchTerm('');
                            }
                          }}
                          onFocus={(e) => {
                            e.stopPropagation();
                            setWeekStartDropdownOpen(true);
                            if (selectedStartPeriod && weekStartSearchTerm === selectedStartPeriod.label) {
                              setWeekStartSearchTerm('');
                            }
                          }}
                          style={COMBOBOX_INPUT_STYLE}
                        />
                        {searchIcon}
                        {weekStartDropdownOpen && weekStartDropdownPosition && createPortal(
                          <div
                            className="slds-dropdown slds-dropdown_fluid export-csv-modal-period-dropdown"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              ...periodDropdownBaseStyle,
                              top: `${weekStartDropdownPosition.top}px`,
                              left: `${weekStartDropdownPosition.left}px`,
                              width: `${weekStartDropdownPosition.width}px`,
                            }}
                          >
                            <ul className="slds-listbox slds-listbox_vertical" role="listbox">
                              {filteredPeriodStartOptions.length > 0 ? (
                                filteredPeriodStartOptions.map((option) => (
                                  <li key={option.id} role="presentation" className="slds-listbox__item">
                                    <div
                                      className={`slds-media slds-listbox__option slds-listbox__option_plain slds-media_small ${startWeekId === option.id ? 'slds-is-selected' : ''}`}
                                      role="option"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setStartWeekId(option.id);
                                        setWeekStartSearchTerm(option.label);
                                        setWeekStartDropdownOpen(false);
                                        setWeekStartDropdownPosition(null);
                                        const endOpt = periodOptions.find((w) => w.id === endWeekId);
                                        if (!endOpt || endOpt.order < option.order) {
                                          const lastInRange = periodOptions.filter((w) => w.order >= option.order);
                                          const pick = lastInRange[lastInRange.length - 1];
                                          if (pick) {
                                            setEndWeekId(pick.id);
                                            setWeekEndSearchTerm(pick.label);
                                          }
                                        }
                                      }}
                                      style={{
                                        padding: '0.5rem 0.75rem',
                                        cursor: 'pointer',
                                        backgroundColor:
                                          startWeekId === option.id ? 'var(--color-surface-gray)' : 'var(--color-surface-white)',
                                        transition: 'background-color 0.1s ease',
                                        fontSize: '14px',
                                        color: 'var(--color-on-surface-strong)',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (startWeekId !== option.id) {
                                          e.currentTarget.style.backgroundColor = 'var(--slds-g-color-accent-container-1)';
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (startWeekId !== option.id) {
                                          e.currentTarget.style.backgroundColor = 'var(--color-surface-white)';
                                        }
                                      }}
                                    >
                                      {option.label}
                                    </div>
                                  </li>
                                ))
                              ) : (
                                <li role="presentation" className="slds-listbox__item">
                                  <div style={{ padding: '0.75rem', color: 'var(--color-interactive-border)', fontSize: '14px' }}>
                                    No matching weeks
                                  </div>
                                </li>
                              )}
                            </ul>
                          </div>,
                          document.body,
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="export-csv-modal-combobox-wrap" ref={weekEndComboboxRef}>
                    <label className="export-csv-modal-sublabel" htmlFor="export-csv-week-end-input">
                      End period
                    </label>
                    <div className="slds-combobox" style={{ position: 'relative' }}>
                      <div className="slds-combobox__form-element slds-input-has-icon slds-input-has-icon_right">
                        <input
                          id="export-csv-week-end-input"
                          type="text"
                          className="slds-input slds-combobox__input"
                          value={
                            weekEndDropdownOpen
                              ? weekEndSearchTerm
                              : selectedEndPeriod
                                ? selectedEndPeriod.label
                                : weekEndSearchTerm
                          }
                          placeholder={!startWeekId ? 'Select start week first' : 'Search or select end week'}
                          disabled={!startWeekId}
                          onChange={(e) => {
                            setWeekEndSearchTerm(e.target.value);
                            setWeekEndDropdownOpen(true);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!startWeekId) return;
                            setWeekEndDropdownOpen(true);
                            if (selectedEndPeriod && weekEndSearchTerm === selectedEndPeriod.label) {
                              setWeekEndSearchTerm('');
                            }
                          }}
                          onFocus={(e) => {
                            e.stopPropagation();
                            if (!startWeekId) return;
                            setWeekEndDropdownOpen(true);
                            if (selectedEndPeriod && weekEndSearchTerm === selectedEndPeriod.label) {
                              setWeekEndSearchTerm('');
                            }
                          }}
                          style={{
                            ...COMBOBOX_INPUT_STYLE,
                            color: startWeekId ? COMBOBOX_INPUT_STYLE.color : 'var(--slds-g-color-neutral-base-60)',
                            backgroundColor: startWeekId ? 'white' : 'var(--color-surface-gray)',
                            cursor: startWeekId ? 'text' : 'not-allowed',
                          }}
                        />
                        {searchIcon}
                        {weekEndDropdownOpen && startWeekId && weekEndDropdownPosition && createPortal(
                          <div
                            className="slds-dropdown slds-dropdown_fluid export-csv-modal-period-dropdown"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              ...periodDropdownBaseStyle,
                              top: `${weekEndDropdownPosition.top}px`,
                              left: `${weekEndDropdownPosition.left}px`,
                              width: `${weekEndDropdownPosition.width}px`,
                            }}
                          >
                            <ul className="slds-listbox slds-listbox_vertical" role="listbox">
                              {filteredPeriodEndOptions.length > 0 ? (
                                filteredPeriodEndOptions.map((option) => (
                                  <li key={option.id} role="presentation" className="slds-listbox__item">
                                    <div
                                      className={`slds-media slds-listbox__option slds-listbox__option_plain slds-media_small ${endWeekId === option.id ? 'slds-is-selected' : ''}`}
                                      role="option"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setEndWeekId(option.id);
                                        setWeekEndSearchTerm(option.label);
                                        setWeekEndDropdownOpen(false);
                                        setWeekEndDropdownPosition(null);
                                      }}
                                      style={{
                                        padding: '0.5rem 0.75rem',
                                        cursor: 'pointer',
                                        backgroundColor:
                                          endWeekId === option.id ? 'var(--color-surface-gray)' : 'var(--color-surface-white)',
                                        transition: 'background-color 0.1s ease',
                                        fontSize: '14px',
                                        color: 'var(--color-on-surface-strong)',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (endWeekId !== option.id) {
                                          e.currentTarget.style.backgroundColor = 'var(--slds-g-color-accent-container-1)';
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (endWeekId !== option.id) {
                                          e.currentTarget.style.backgroundColor = 'var(--color-surface-white)';
                                        }
                                      }}
                                    >
                                      {option.label}
                                    </div>
                                  </li>
                                ))
                              ) : (
                                <li role="presentation" className="slds-listbox__item">
                                  <div style={{ padding: '0.75rem', color: 'var(--color-interactive-border)', fontSize: '14px' }}>
                                    No matching weeks
                                  </div>
                                </li>
                              )}
                            </ul>
                          </div>,
                          document.body,
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="export-csv-modal-field">
                <label className="export-csv-modal-field-label">Measure category</label>
                <div className="settings-dropdown-wrapper" ref={measureDropdownRef}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={`settings-dropdown-trigger ${measureDropdownOpen ? 'open' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMeasureDropdownOpen((o) => !o);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setMeasureDropdownOpen((o) => !o);
                      }
                    }}
                    aria-expanded={measureDropdownOpen}
                    aria-haspopup="listbox"
                  >
                    <span
                      className={measureSubgroupCount > 0 ? 'settings-dropdown-value' : 'settings-dropdown-placeholder'}
                    >
                      {measureSubgroupCount > 0
                        ? `${measureSubgroupCount} Categor${measureSubgroupCount !== 1 ? 'ies' : 'y'} Selected`
                        : 'Select Measure Category'}
                    </span>
                    <svg className="settings-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {measureDropdownOpen &&
                    measureDropdownPosition &&
                    createPortal(
                      <div
                        className="settings-dropdown-list settings-dimension-dropdown export-csv-modal-measure-dropdown"
                        role="listbox"
                        aria-multiselectable="true"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'fixed',
                          top: `${measureDropdownPosition.top}px`,
                          left: `${measureDropdownPosition.left}px`,
                          width: `${measureDropdownPosition.width}px`,
                          zIndex: PORTAL_Z,
                          maxHeight: '20rem',
                          overflowY: 'auto',
                          boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                        }}
                      >
                        {PLAN_MODAL_MEASURE_SUBGROUP_OPTIONS.map((option, index) => {
                          const isSelected = selectedMeasureSubgroups.has(option.value);
                          return (
                            <div
                              key={index}
                              className="settings-dropdown-checkbox-option"
                              role="option"
                              aria-selected={isSelected}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMeasureSubgroup(option.value);
                              }}
                            >
                              <div className={`settings-checkbox-wrapper ${isSelected ? 'checked' : ''}`}>
                                {isSelected && (
                                  <svg
                                    className="settings-checkbox-icon"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2.5}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </div>
                              <span className="settings-dropdown-checkbox-label">{option.value}</span>
                            </div>
                          );
                        })}
                      </div>,
                      document.body,
                    )}
                </div>
              </div>
            </div>
          )}

          <div className="export-csv-modal-preview-block">
            <p className="export-csv-modal-preview-caption">Preview (indicative)</p>
            <div className="export-csv-modal-csv-visual" aria-hidden>
              <div className="export-csv-modal-csv-visual-header">
                <span className="export-csv-modal-csv-dot" />
                <span className="export-csv-modal-csv-dot" />
                <span className="export-csv-modal-csv-dot" />
                <span className="export-csv-modal-csv-filename">plan_export.csv</span>
              </div>
              <div className="export-csv-modal-csv-grid">
                <div className="export-csv-modal-csv-row export-csv-modal-csv-row--header">
                  <span>Product</span>
                  <span>Region</span>
                  <span>Period</span>
                  <span>Value</span>
                </div>
                <div className="export-csv-modal-csv-row">
                  <span>Widget A</span>
                  <span>North</span>
                  <span>FY26 Jan</span>
                  <span>12,840</span>
                </div>
                <div className="export-csv-modal-csv-row">
                  <span>Widget B</span>
                  <span>South</span>
                  <span>FY26 Jan</span>
                  <span>9,210</span>
                </div>
              </div>
            </div>
          </div>

          <ScopedNotification
            variant="inline"
            className="scoped-notification--multiline export-csv-modal-scoped"
            message="Hierarchical grid rows will be flattened when converting to CSV (parent and child values appear as separate rows)."
          />

          {downloadProgress !== null && (
            <div className="export-csv-modal-progress-wrap">
              <label className="export-csv-modal-progress-label" htmlFor="export-csv-progress">
                {scheduleRecurring ? 'Saving schedule…' : 'Preparing download…'}
              </label>
              <progress
                id="export-csv-progress"
                className="export-csv-modal-progress"
                max={100}
                value={downloadProgress}
              />
            </div>
          )}
        </div>

        <div className="export-csv-modal-footer">
          <button
            type="button"
            className="export-csv-modal-btn export-csv-modal-btn--secondary"
            onClick={handleClose}
            disabled={downloadProgress !== null}
          >
            Cancel
          </button>
          <button
            type="button"
            className="export-csv-modal-btn export-csv-modal-btn--primary"
            onClick={handleDownload}
            disabled={downloadDisabled}
          >
            Download
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ExportCsvModal;
