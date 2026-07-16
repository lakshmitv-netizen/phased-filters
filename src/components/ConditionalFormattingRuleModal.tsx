import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ConditionalFormattingRule,
  IndicatorMode,
  IndicatorZone,
  RuleCondition,
  RuleTarget,
  VisualizationConfig,
  ConditionType,
  VisualizationType,
} from '../types/conditionalFormatting';
import { MeasureData } from '../types';
import '../styles/components/ConditionalFormattingRuleModal.css';

// ── Formula editor helpers ───────────────────────────────────────────────────

const FORMULA_SAMPLE_VALUES = [0, 25000, 50000, 75000, 95000, 110000, 130000, 145000, 165000, 180000, 200000, 220000];

const FORMULA_EXAMPLES = [
  { formula: 'VALUE > 100000', description: 'Flag cells above 100K' },
  { formula: 'VALUE > 0 AND VALUE < 50000', description: 'Flag low-but-nonzero values' },
  { formula: 'VALUE = 0', description: 'Flag zero values' },
  { formula: 'ABS(VALUE) > 150000', description: 'Flag large absolute values' },
  { formula: 'VALUE > 100000 AND VALUE < 200000', description: 'Flag values in a specific band' },
];

function normalizeFormulaExpr(formula: string, valueSubstitute: string): string {
  return formula
    .replace(/VALUE/gi, valueSubstitute)
    .replace(/\bAND\b/gi, '&&')
    .replace(/\bOR\b/gi, '||')
    .replace(/\bNOT\b\s*/gi, '!')
    .replace(/\bABS\s*\(/gi, 'Math.abs(')
    .replace(/(?<![<>!])=(?!=)/g, '===');
}

function validateFormula(formula: string): { valid: boolean; error?: string } {
  if (!formula.trim()) return { valid: false };
  try {
    const expr = normalizeFormulaExpr(formula, '0');
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${expr}`)();
    if (typeof result !== 'boolean' && typeof result !== 'number') {
      return { valid: false, error: 'Formula must return a true/false result' };
    }
    return { valid: true };
  } catch (e: unknown) {
    const raw = (e as Error)?.message ?? 'Invalid syntax';
    const clean = raw.replace(/\(anonymous\).*$/i, '').replace(/at new Function.*$/i, '').trim();
    return { valid: false, error: clean || 'Invalid syntax' };
  }
}

function countFormulaMatches(formula: string): number {
  return FORMULA_SAMPLE_VALUES.filter(v => {
    try {
      const expr = normalizeFormulaExpr(formula, String(v));
      // eslint-disable-next-line no-new-func
      return Boolean(new Function(`return ${expr}`)());
    } catch {
      return false;
    }
  }).length;
}

// ── Zone helpers ─────────────────────────────────────────────────────────────

function makeDefaultZones(): IndicatorZone[] {
  return [
    { id: `z-${Date.now()}-1`, threshold: 100000, color: '#10B981', label: 'Good' },
    { id: `z-${Date.now()}-2`, threshold: 50000, color: '#F59E0B', label: 'Watch' },
    { id: `z-${Date.now()}-3`, color: '#EF4444', label: 'Critical', isCatchAll: true },
  ];
}

function getZoneIcon(style: string, index: number, total: number): string {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  switch (style) {
    case 'trafficLights':
      return isFirst ? '🟢' : isLast ? '🔴' : '🟡';
    case 'arrows':
      return isFirst ? '↑' : isLast ? '↓' : '→';
    case 'stars':
      return '★';
    case 'flags':
      return '⚑';
    default:
      return '●';
  }
}

// ── Static options ────────────────────────────────────────────────────────────

const dimensionLevelOptions = [
  { id: 'account', name: 'Accounts' },
  { id: 'category', name: 'Categories' },
  { id: 'product', name: 'Products' },
];

const timeKeyOptions = [
  { id: 'jan2026', name: 'Jan 2026' }, { id: 'feb2026', name: 'Feb 2026' },
  { id: 'mar2026', name: 'Mar 2026' }, { id: 'apr2026', name: 'Apr 2026' },
  { id: 'may2026', name: 'May 2026' }, { id: 'jun2026', name: 'Jun 2026' },
  { id: 'jul2026', name: 'Jul 2026' }, { id: 'aug2026', name: 'Aug 2026' },
  { id: 'sep2026', name: 'Sep 2026' }, { id: 'oct2026', name: 'Oct 2026' },
  { id: 'nov2026', name: 'Nov 2026' }, { id: 'dec2026', name: 'Dec 2026' },
];

const conditionTypeOptions: { value: ConditionType; label: string }[] = [
  { value: 'greaterThan', label: 'Greater than' },
  { value: 'lessThan', label: 'Less than' },
  { value: 'equals', label: 'Equals' },
  { value: 'between', label: 'Between' },
  { value: 'topN', label: 'Top N' },
  { value: 'bottomN', label: 'Bottom N' },
  { value: 'aboveAverage', label: 'Above average' },
  { value: 'belowAverage', label: 'Below average' },
  { value: 'formula', label: 'Custom formula' },
];

const CREATE_COLUMNS_VIZ: { value: VisualizationType; label: string }[] = [
  { value: 'iconSet', label: 'Icon Set' },
  { value: 'dataBar', label: 'Data Bar' },
  { value: 'colorScale', label: 'Color Scale' },
];

const MODIFY_CELLS_VIZ: { value: VisualizationType; label: string }[] = [
  { value: 'iconSet', label: 'Icon Set' },
  { value: 'dataBar', label: 'Data Bar' },
  { value: 'colorScale', label: 'Color Scale' },
  { value: 'background', label: 'Background Color' },
  { value: 'font', label: 'Font Style' },
  { value: 'border', label: 'Border' },
];

const ICON_STYLE_OPTIONS = [
  { value: 'trafficLights', label: 'Traffic Lights (🟢🟡🔴)' },
  { value: 'arrows', label: 'Arrows (↑→↓)' },
  { value: 'stars', label: 'Stars (★)' },
  { value: 'flags', label: 'Flags (⚑)' },
];

const ZONE_BASED: VisualizationType[] = ['iconSet', 'dataBar', 'colorScale'];
// ── Target Criteria (rule builder) ───────────────────────────────────────────

interface TargetCriterion {
  id: string;
  field: 'Metric' | 'Dimension' | 'Time Period';
  operator: string;
  values: string[]; // multiselect — one or more values
}

const TARGET_FIELD_OPTIONS: TargetCriterion['field'][] = ['Metric', 'Dimension', 'Time Period'];

// "is before" / "is after" are single-value operators; all others support multiselect
const TARGET_OPERATOR_OPTIONS: Record<string, string[]> = {
  'Metric':      ['is any of', 'is not any of'],
  'Dimension':   ['is any of', 'is not any of'],
  'Time Period': ['is any of', 'is not any of', 'is before', 'is after'],
};

const SINGLE_VALUE_OPERATORS = new Set(['is before', 'is after']);

const DIMENSION_VALUE_OPTIONS = ['Accounts', 'Categories', 'Products'];
const DIM_LABEL_TO_ID: Record<string, string> = { Accounts: 'account', Categories: 'category', Products: 'product' };
const DIM_ID_TO_LABEL: Record<string, string> = { account: 'Accounts', category: 'Categories', product: 'Products' };

function criteriaToTarget(criteria: TargetCriterion[], measures: MeasureData[]): import('../types/conditionalFormatting').RuleTarget {
  const measureIds: string[] = [];
  const dimensionLevels: string[] = [];
  const timeKeys: string[] = [];
  const excludeMeasureIds: string[] = [];
  const excludeDimensionLevels: string[] = [];
  const excludeTimeKeys: string[] = [];

  for (const c of criteria) {
    const isExclude = c.operator === 'is not any of';
    const isBefore  = c.operator === 'is before';
    const isAfter   = c.operator === 'is after';

    if (c.field === 'Metric') {
      const ids = c.values.map(v => measures.find(m => m.name === v)?.id).filter(Boolean) as string[];
      (isExclude ? excludeMeasureIds : measureIds).push(...ids);

    } else if (c.field === 'Dimension') {
      const keys = c.values.map(v => DIM_LABEL_TO_ID[v]).filter(Boolean) as string[];
      (isExclude ? excludeDimensionLevels : dimensionLevels).push(...keys);

    } else if (c.field === 'Time Period') {
      if (isBefore) {
        const refIdx = timeKeyOptions.findIndex(t => t.name === c.values[0]);
        if (refIdx > 0) timeKeys.push(...timeKeyOptions.slice(0, refIdx).map(t => t.id));
      } else if (isAfter) {
        const refIdx = timeKeyOptions.findIndex(t => t.name === c.values[0]);
        if (refIdx >= 0 && refIdx < timeKeyOptions.length - 1)
          timeKeys.push(...timeKeyOptions.slice(refIdx + 1).map(t => t.id));
      } else {
        const keys = c.values.map(v => timeKeyOptions.find(t => t.name === v)?.id).filter(Boolean) as string[];
        (isExclude ? excludeTimeKeys : timeKeys).push(...keys);
      }
    }
  }

  return {
    measureIds, dimensionLevels, timeKeys,
    ...(excludeMeasureIds.length     ? { excludeMeasureIds }     : {}),
    ...(excludeDimensionLevels.length ? { excludeDimensionLevels } : {}),
    ...(excludeTimeKeys.length        ? { excludeTimeKeys }        : {}),
  };
}

function targetToCriteria(
  target: import('../types/conditionalFormatting').RuleTarget,
  measures: MeasureData[],
): TargetCriterion[] {
  const result: TargetCriterion[] = [];

  if (target.measureIds.length) {
    const names = target.measureIds.map(id => measures.find(m => m.id === id)?.name).filter(Boolean) as string[];
    if (names.length) result.push({ id: 'tc-m-inc', field: 'Metric', operator: 'is any of', values: names });
  }
  if (target.excludeMeasureIds?.length) {
    const names = target.excludeMeasureIds.map(id => measures.find(m => m.id === id)?.name).filter(Boolean) as string[];
    if (names.length) result.push({ id: 'tc-m-exc', field: 'Metric', operator: 'is not any of', values: names });
  }
  if (target.dimensionLevels.length) {
    const labels = target.dimensionLevels.map(d => DIM_ID_TO_LABEL[d]).filter(Boolean) as string[];
    if (labels.length) result.push({ id: 'tc-d-inc', field: 'Dimension', operator: 'is any of', values: labels });
  }
  if (target.excludeDimensionLevels?.length) {
    const labels = target.excludeDimensionLevels.map(d => DIM_ID_TO_LABEL[d]).filter(Boolean) as string[];
    if (labels.length) result.push({ id: 'tc-d-exc', field: 'Dimension', operator: 'is not any of', values: labels });
  }
  if (target.timeKeys.length) {
    const names = target.timeKeys.map(k => timeKeyOptions.find(t => t.id === k)?.name).filter(Boolean) as string[];
    if (names.length) result.push({ id: 'tc-t-inc', field: 'Time Period', operator: 'is any of', values: names });
  }
  if (target.excludeTimeKeys?.length) {
    const names = target.excludeTimeKeys.map(k => timeKeyOptions.find(t => t.id === k)?.name).filter(Boolean) as string[];
    if (names.length) result.push({ id: 'tc-t-exc', field: 'Time Period', operator: 'is not any of', values: names });
  }
  return result;
}

// ── Inline MultiSelect component ─────────────────────────────────────────────

interface MultiSelectProps {
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ options, values, onChange, placeholder = 'Select…' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);

  const label =
    values.length === 0 ? placeholder
    : values.length === 1 ? values[0]
    : `${values.length} selected`;

  return (
    <div className="cf-ms-root" ref={rootRef}>
      <button
        type="button"
        className={`cf-ms-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="cf-ms-label">{label}</span>
        <svg className="cf-ms-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="cf-ms-dropdown">
          {options.map(opt => (
            <label key={opt} className={`cf-ms-option ${values.includes(opt) ? 'checked' : ''}`}>
              <input
                type="checkbox"
                className="cf-ms-checkbox"
                checked={values.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span className="cf-ms-option-label">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Component ────────────────────────────────────────────────────────────────

interface ConditionalFormattingRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: ConditionalFormattingRule) => void;
  onPreview?: (rule: ConditionalFormattingRule | null) => void;
  mode: IndicatorMode;
  existingRule?: ConditionalFormattingRule;
  availableMeasures: MeasureData[];
  /** When provided, the rule scope is locked to these specific cell keys (manual selection). */
  prefillCellKeys?: string[];
}

const ConditionalFormattingRuleModal: React.FC<ConditionalFormattingRuleModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onPreview,
  mode,
  existingRule,
  availableMeasures,
  prefillCellKeys,
}) => {
  // Name
  const [ruleName, setRuleName] = useState('');

  // Target (modifyCells only) — rule builder criteria
  const [targetCriteria, setTargetCriteria] = useState<TargetCriterion[]>([]);

  // Condition
  const [conditionType, setConditionType] = useState<ConditionType>('greaterThan');
  const [conditionValue, setConditionValue] = useState<number>(0);
  const [conditionValue2, setConditionValue2] = useState<number>(0);
  const [conditionN, setConditionN] = useState<number>(5);
  const [conditionFormula, setConditionFormula] = useState<string>('');
  const [formulaValid, setFormulaValid] = useState<boolean | null>(null);
  const [formulaError, setFormulaError] = useState<string>('');
  const [formulaMatchCount, setFormulaMatchCount] = useState<number>(0);
  const [showFormulaExamples, setShowFormulaExamples] = useState(false);
  const formulaTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Visualization
  const [vizType, setVizType] = useState<VisualizationType>('iconSet');
  const [zones, setZones] = useState<IndicatorZone[]>(makeDefaultZones);
  const [iconStyle, setIconStyle] = useState<'arrows' | 'trafficLights' | 'stars' | 'flags'>('trafficLights');
  const [barMin, setBarMin] = useState<number>(0);
  const [barMax, setBarMax] = useState<number>(200000);
  const [showValue, setShowValue] = useState<boolean>(true);
  const [vizColor, setVizColor] = useState('#10B981');
  const [vizFontWeight, setVizFontWeight] = useState<'normal' | 'bold'>('bold');

  // ── Reset / load on open ─────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    if (existingRule) {
      setRuleName(existingRule.name);
      setTargetCriteria(targetToCriteria(existingRule.target, availableMeasures));
      setConditionType(existingRule.condition.type);
      setConditionValue(existingRule.condition.value ?? 0);
      setConditionValue2(existingRule.condition.value2 ?? 0);
      setConditionN(existingRule.condition.n ?? 5);
      const ef = existingRule.condition.formula ?? '';
      setConditionFormula(ef);
      if (ef.trim()) {
        const vr = validateFormula(ef);
        setFormulaValid(vr.valid);
        setFormulaError(vr.error ?? '');
        setFormulaMatchCount(vr.valid ? countFormulaMatches(ef) : 0);
      } else {
        setFormulaValid(null); setFormulaError(''); setFormulaMatchCount(0);
      }
      setShowFormulaExamples(false);
      setVizType(existingRule.visualization.type);
      setZones(existingRule.visualization.zones ?? makeDefaultZones());
      setIconStyle(existingRule.visualization.iconStyle ?? 'trafficLights');
      setBarMin(existingRule.visualization.barMin ?? 0);
      setBarMax(existingRule.visualization.barMax ?? 200000);
      setShowValue(existingRule.visualization.showValue ?? true);
      setVizColor(existingRule.visualization.color ?? '#10B981');
      setVizFontWeight(existingRule.visualization.fontWeight ?? 'bold');
    } else {
      setRuleName('');
      setTargetCriteria([]);
      setConditionType('greaterThan');
      setConditionValue(0); setConditionValue2(0); setConditionN(5);
      setConditionFormula('');
      setFormulaValid(null); setFormulaError(''); setFormulaMatchCount(0);
      setShowFormulaExamples(false);
      setVizType(mode === 'modifyCells' ? 'colorScale' : 'iconSet');
      setZones(makeDefaultZones());
      setIconStyle('trafficLights');
      setBarMin(0); setBarMax(200000); setShowValue(true);
      setVizColor('#10B981'); setVizFontWeight('bold');
    }
  }, [isOpen, existingRule]);

  // ── Formula handlers ─────────────────────────────────────────
  const handleFormulaChange = useCallback((value: string) => {
    setConditionFormula(value);
    if (!value.trim()) {
      setFormulaValid(null); setFormulaError(''); setFormulaMatchCount(0);
      return;
    }
    const result = validateFormula(value);
    setFormulaValid(result.valid);
    setFormulaError(result.error ?? '');
    if (result.valid) setFormulaMatchCount(countFormulaMatches(value));
  }, []);

  const insertFormulaToken = useCallback((token: string) => {
    const ta = formulaTextareaRef.current;
    if (!ta) {
      handleFormulaChange(conditionFormula + (conditionFormula ? ' ' : '') + token);
      return;
    }
    const start = ta.selectionStart;
    const before = conditionFormula.slice(0, start);
    const after = conditionFormula.slice(ta.selectionEnd);
    const insert = (before && !before.endsWith(' ') ? ' ' : '') + token + ' ';
    handleFormulaChange(before + insert + after);
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + insert.length;
      ta.focus();
    }, 0);
  }, [conditionFormula, handleFormulaChange]);

  // ── Zone handlers ─────────────────────────────────────────────
  const addZone = () => {
    setZones(prev => {
      const nonCatch = prev.filter(z => !z.isCatchAll);
      const catchAll = prev.find(z => z.isCatchAll);
      const newZone: IndicatorZone = { id: `z-${Date.now()}`, threshold: 0, color: '#9CA3AF', label: '' };
      return catchAll ? [...nonCatch, newZone, catchAll] : [...nonCatch, newZone];
    });
  };

  const removeZone = (id: string) => {
    setZones(prev => prev.length <= 2 ? prev : prev.filter(z => z.id !== id));
  };

  const updateZone = (id: string, updates: Partial<IndicatorZone>) => {
    setZones(prev => prev.map(z => z.id === id ? { ...z, ...updates } : z));
  };

  // ── Target criteria handlers ──────────────────────────────────
  const getTargetValueOptions = (field: TargetCriterion['field']): string[] => {
    if (field === 'Metric') return availableMeasures.map(m => m.name);
    if (field === 'Dimension') return DIMENSION_VALUE_OPTIONS;
    return timeKeyOptions.map(t => t.name);
  };

  const addTargetCriterion = () => {
    const field: TargetCriterion['field'] = 'Metric';
    setTargetCriteria(prev => [...prev, {
      id: `tc-${Date.now()}`,
      field,
      operator: TARGET_OPERATOR_OPTIONS[field][0],
      values: availableMeasures[0] ? [availableMeasures[0].name] : [],
    }]);
  };
  const removeTargetCriterion = (id: string) => setTargetCriteria(prev => prev.filter(c => c.id !== id));
  const updateTargetCriterion = (id: string, updates: Partial<TargetCriterion>) =>
    setTargetCriteria(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));

  const buildRuleFromForm = (): ConditionalFormattingRule => {
    const isZoneBased = ZONE_BASED.includes(vizType);
    const condition: RuleCondition = {
      type: conditionType, value: conditionValue,
      value2: conditionValue2, n: conditionN, formula: conditionFormula,
    };
    const resolvedTarget: RuleTarget =
      prefillCellKeys && prefillCellKeys.length > 0
        ? { measureIds: [], dimensionLevels: [], timeKeys: [], cellKeys: prefillCellKeys }
        : mode === 'createColumns'
          ? { measureIds: [], dimensionLevels: [], timeKeys: [] }
          : criteriaToTarget(targetCriteria, availableMeasures);
    const target: RuleTarget = resolvedTarget;
    const visualization: VisualizationConfig = isZoneBased ? {
      type: vizType,
      zones,
      iconStyle: vizType === 'iconSet' ? iconStyle : undefined,
      barMin: vizType === 'dataBar' ? barMin : undefined,
      barMax: vizType === 'dataBar' ? barMax : undefined,
      showValue: vizType === 'dataBar' ? showValue : undefined,
    } : {
      type: vizType,
      color: vizColor,
      fontWeight: vizFontWeight,
    };
    const rule: ConditionalFormattingRule = {
      id: existingRule?.id ?? `rule-${Date.now()}`,
      name: ruleName || 'Untitled',
      isActive: existingRule?.isActive ?? true,
      priority: existingRule?.priority ?? 0,
      mode, target, condition, visualization,
      createdAt: existingRule?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    return rule;
  };

  // ── Save / Preview ────────────────────────────────────────────
  const handleSave = () => {
    const rule = buildRuleFromForm();
    onPreview?.(null);
    onSave(rule);
    onClose();
  };

  const handlePreviewOnGrid = () => {
    const rule = buildRuleFromForm();
    onPreview?.(rule);
  };

  if (!isOpen) return null;

  const isZoneBased = ZONE_BASED.includes(vizType);
  const vizOptions = mode === 'createColumns' ? CREATE_COLUMNS_VIZ : MODIFY_CELLS_VIZ;

  return (
    <div className="cf-modal-overlay" onClick={onClose}>
      <div className="cf-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="cf-modal-header">
          <h2 className="cf-modal-title">
            {existingRule
              ? (mode === 'createColumns' ? 'Edit Indicator Column' : 'Edit Rule')
              : (mode === 'createColumns' ? 'Create Indicator Column' : 'Create New Rule')}
          </h2>
          <button className="cf-modal-close" onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="cf-modal-body">

          {/* Name */}
          <div className="cf-modal-section">
            <label className="cf-modal-label">Name</label>
            <input
              type="text"
              className="cf-modal-input"
              placeholder={mode === 'createColumns' ? 'e.g., Revenue Health' : 'e.g., High Revenue Alert'}
              value={ruleName}
              onChange={e => setRuleName(e.target.value)}
            />
          </div>

          {/* Target — modifyCells only — rule builder */}
          {mode === 'modifyCells' && (
            <div className="cf-modal-section">
              <div className="cf-rb-header">
                <label className="cf-modal-label">Cell Scope</label>
                {!prefillCellKeys && targetCriteria.length === 0 && (
                  <span className="cf-rb-all-hint">Applies to all cells</span>
                )}
              </div>

              {/* Manual selection badge — shown when rule is created from a cell selection */}
              {prefillCellKeys && prefillCellKeys.length > 0 && (
                <div className="cf-manual-selection-badge">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                  </svg>
                  <span>
                    <strong>{prefillCellKeys.length}</strong> cell{prefillCellKeys.length !== 1 ? 's' : ''} manually selected
                  </span>
                  <span className="cf-manual-selection-note">Rule will only apply to these specific cells</span>
                </div>
              )}

              {!prefillCellKeys && targetCriteria.length > 0 && (
                <div className="cf-rb-list">
                  {targetCriteria.map(c => {
                    const isSingleVal = SINGLE_VALUE_OPERATORS.has(c.operator);
                    return (
                      <div key={c.id} className="cf-rb-card">
                        <div className="cf-rb-card-content">

                          {/* Field selector */}
                          <select
                            className="cf-rb-select"
                            value={c.field}
                            onChange={e => {
                              const field = e.target.value as TargetCriterion['field'];
                              const operator = TARGET_OPERATOR_OPTIONS[field][0];
                              const opts = getTargetValueOptions(field);
                              updateTargetCriterion(c.id, { field, operator, values: opts.length ? [opts[0]] : [] });
                            }}
                          >
                            {TARGET_FIELD_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>

                          {/* Operator selector */}
                          <select
                            className="cf-rb-select cf-rb-select--operator"
                            value={c.operator}
                            onChange={e => {
                              const newOp = e.target.value;
                              const nowSingle = SINGLE_VALUE_OPERATORS.has(newOp);
                              const wasSingle = SINGLE_VALUE_OPERATORS.has(c.operator);
                              // When switching between multi ↔ single, reset to first value
                              const values = (nowSingle !== wasSingle)
                                ? [getTargetValueOptions(c.field)[0] ?? '']
                                : c.values;
                              updateTargetCriterion(c.id, { operator: newOp, values });
                            }}
                          >
                            {TARGET_OPERATOR_OPTIONS[c.field]?.map(op => (
                              <option key={op} value={op}>{op}</option>
                            ))}
                          </select>

                          {/* Value selector — multiselect or single depending on operator */}
                          {isSingleVal ? (
                            <select
                              className="cf-rb-select cf-rb-select--value"
                              value={c.values[0] ?? ''}
                              onChange={e => updateTargetCriterion(c.id, { values: [e.target.value] })}
                            >
                              {getTargetValueOptions(c.field).map(v => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                            </select>
                          ) : (
                            <MultiSelect
                              options={getTargetValueOptions(c.field)}
                              values={c.values}
                              onChange={vals => updateTargetCriterion(c.id, { values: vals })}
                              placeholder="Select…"
                            />
                          )}
                        </div>

                        <button
                          type="button"
                          className="cf-rb-delete"
                          onClick={() => removeTargetCriterion(c.id)}
                          aria-label="Remove condition"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {!prefillCellKeys && (
                <div className="cf-rb-actions">
                  <button type="button" className="cf-rb-add-btn" onClick={addTargetCriterion}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add Condition
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Condition */}
          <div className="cf-modal-section">
            <label className="cf-modal-label">Condition</label>
            <select className="cf-modal-select" value={conditionType} onChange={e => setConditionType(e.target.value as ConditionType)}>
              {conditionTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {(conditionType === 'greaterThan' || conditionType === 'lessThan' || conditionType === 'equals') && (
              <input type="number" className="cf-modal-input" placeholder="Value"
                value={conditionValue} onChange={e => setConditionValue(Number(e.target.value))}
                style={{ marginTop: '8px' }} />
            )}
            {conditionType === 'between' && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input type="number" className="cf-modal-input" placeholder="Min"
                  value={conditionValue} onChange={e => setConditionValue(Number(e.target.value))} />
                <input type="number" className="cf-modal-input" placeholder="Max"
                  value={conditionValue2} onChange={e => setConditionValue2(Number(e.target.value))} />
              </div>
            )}
            {(conditionType === 'topN' || conditionType === 'bottomN') && (
              <input type="number" className="cf-modal-input" placeholder="N"
                value={conditionN} onChange={e => setConditionN(Number(e.target.value))}
                style={{ marginTop: '8px' }} />
            )}

            {/* Formula editor */}
            {conditionType === 'formula' && (
              <div className="cf-formula-editor">
                <div className="cf-formula-input-row">
                  <span className="cf-formula-prefix">=</span>
                  <textarea
                    ref={formulaTextareaRef}
                    className={`cf-formula-textarea${formulaValid === true ? ' cf-formula-textarea--valid' : formulaValid === false ? ' cf-formula-textarea--invalid' : ''}`}
                    placeholder="VALUE > 100000"
                    value={conditionFormula}
                    onChange={e => handleFormulaChange(e.target.value)}
                    rows={2}
                    spellCheck={false}
                  />
                </div>
                {conditionFormula.trim() ? (
                  <div className={`cf-formula-status${formulaValid ? ' cf-formula-status--valid' : ' cf-formula-status--error'}`}>
                    {formulaValid ? (
                      <>
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Valid &middot; Applies to <strong>{formulaMatchCount}</strong> of {FORMULA_SAMPLE_VALUES.length} sample cells
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        {formulaError || 'Invalid formula'}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="cf-formula-hint">Use <code>VALUE</code> to reference the cell's number</div>
                )}
                <div className="cf-formula-quick-insert">
                  <span className="cf-formula-quick-label">Insert:</span>
                  {['VALUE', 'AND', 'OR', 'NOT', '>', '<', '>=', '<=', '=', 'ABS('].map(t => (
                    <button key={t} type="button" className="cf-formula-quick-btn" onClick={() => insertFormulaToken(t)}>{t}</button>
                  ))}
                </div>
                <div className="cf-formula-examples-section">
                  <button type="button" className="cf-formula-examples-toggle" onClick={() => setShowFormulaExamples(v => !v)}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"
                      style={{ transform: showFormulaExamples ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    Examples
                  </button>
                  {showFormulaExamples && (
                    <div className="cf-formula-examples-list">
                      {FORMULA_EXAMPLES.map(ex => (
                        <div key={ex.formula} className="cf-formula-example-item">
                          <div className="cf-formula-example-content">
                            <code className="cf-formula-example-code">= {ex.formula}</code>
                            <span className="cf-formula-example-desc">{ex.description}</span>
                          </div>
                          <button type="button" className="cf-formula-example-use-btn" onClick={() => handleFormulaChange(ex.formula)}>Use</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Visualization dropdown */}
          <div className="cf-modal-section">
            <label className="cf-modal-label">Visualization</label>
            <select className="cf-modal-select" value={vizType} onChange={e => setVizType(e.target.value as VisualizationType)}>
              {vizOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Icon style (iconSet only) */}
          {vizType === 'iconSet' && (
            <div className="cf-modal-section">
              <label className="cf-modal-label">Icon Style</label>
              <select className="cf-modal-select" value={iconStyle} onChange={e => setIconStyle(e.target.value as typeof iconStyle)}>
                {ICON_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          {/* Data bar range (dataBar only) */}
          {vizType === 'dataBar' && (
            <div className="cf-modal-section">
              <label className="cf-modal-label">Bar Range</label>
              <div className="cf-bar-range-row">
                <div className="cf-bar-range-field">
                  <span className="cf-bar-range-label">Min (= 0%)</span>
                  <input type="number" className="cf-modal-input" value={barMin} onChange={e => setBarMin(Number(e.target.value))} />
                </div>
                <div className="cf-bar-range-field">
                  <span className="cf-bar-range-label">Max (= 100%)</span>
                  <input type="number" className="cf-modal-input" value={barMax} onChange={e => setBarMax(Number(e.target.value))} />
                </div>
              </div>
              <label className="cf-modal-checkbox-label" style={{ marginTop: '8px' }}>
                <input type="checkbox" checked={showValue} onChange={e => setShowValue(e.target.checked)} />
                <span>Show value alongside bar</span>
              </label>
            </div>
          )}

          {/* Zone builder */}
          {isZoneBased && (
            <div className="cf-modal-section">
              <div className="cf-zones-header">
                <label className="cf-modal-label">Zones</label>
                <button type="button" className="cf-add-zone-btn" onClick={addZone}>
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                    <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add Zone
                </button>
              </div>
              <div className="cf-zones-list">
                {zones.map((zone, idx) => (
                  <div key={zone.id} className="cf-zone-row">
                    <span className="cf-zone-icon-badge" style={{ color: zone.color }}>
                      {vizType === 'iconSet' && getZoneIcon(iconStyle, idx, zones.length)}
                      {vizType === 'colorScale' && '■'}
                      {vizType === 'dataBar' && '▬'}
                    </span>
                    <div className="cf-zone-condition">
                      {zone.isCatchAll ? (
                        <span className="cf-zone-catchall-label">Everything else</span>
                      ) : (
                        <>
                          <span className="cf-zone-condition-text">if VALUE ≥</span>
                          <input
                            type="number"
                            className="cf-zone-threshold-input"
                            value={zone.threshold ?? 0}
                            onChange={e => updateZone(zone.id, { threshold: Number(e.target.value) })}
                          />
                        </>
                      )}
                    </div>
                    <input
                      type="color"
                      className="cf-zone-color-input"
                      value={zone.color}
                      onChange={e => updateZone(zone.id, { color: e.target.value })}
                      title="Zone color"
                    />
                    <input
                      type="text"
                      className="cf-zone-label-input"
                      placeholder="Label"
                      value={zone.label ?? ''}
                      onChange={e => updateZone(zone.id, { label: e.target.value })}
                    />
                    {!zone.isCatchAll && zones.length > 2 && (
                      <button type="button" className="cf-zone-remove-btn" onClick={() => removeZone(zone.id)} title="Remove zone">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L10 11.414l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="cf-zones-hint">Evaluated top to bottom — first matching zone wins.</p>
            </div>
          )}

          {/* Simple cell formatting (non-zone modifyCells types) */}
          {!isZoneBased && (
            <div className="cf-modal-section">
              <label className="cf-modal-label">Color</label>
              <input type="color" value={vizColor} onChange={e => setVizColor(e.target.value)} />
            </div>
          )}
          {vizType === 'font' && !isZoneBased && (
            <div className="cf-modal-section">
              <label className="cf-modal-label">Font Weight</label>
              <select className="cf-modal-select" value={vizFontWeight} onChange={e => setVizFontWeight(e.target.value as 'normal' | 'bold')}>
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
              </select>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="cf-modal-footer">
          <button className="cf-modal-button cf-modal-button-secondary cf-modal-button-cancel-left" onClick={onClose}>Cancel</button>
          <button className="cf-modal-button cf-modal-button-secondary" onClick={handlePreviewOnGrid}>Preview</button>
          <button className="cf-modal-button cf-modal-button-primary" onClick={handleSave}>
            {existingRule ? 'Save Changes' : (mode === 'createColumns' ? 'Add Column' : 'Create Rule')}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ConditionalFormattingRuleModal;
