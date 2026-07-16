import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { MeasureData } from '../types';
import { getDimensionGlyph } from '../data/dimensionSchemes';
import '../styles/components/UnifiedFilterPopover.css';

// A selectable dimension field in the Field picker, driven by the grid's scheme.
export interface PopoverDimensionField {
  value: string;   // editor field id (legacy account/category/products or a level id)
  rowType: string; // GridRow.type matched in the data
  label: string;   // display label
}

const DEFAULT_DIMENSION_FIELDS: PopoverDimensionField[] = [
  { value: 'account', rowType: 'account', label: 'Account' },
  { value: 'category', rowType: 'category', label: 'Category' },
  { value: 'products', rowType: 'product', label: 'Product' },
];

const timePeriods = [
  { value: 'year', label: 'Year (FY26)' },
  { value: 'q1', label: 'Q1' }, { value: 'q2', label: 'Q2' },
  { value: 'q3', label: 'Q3' }, { value: 'q4', label: 'Q4' },
  { value: 'jan2026', label: 'Jan 2026' }, { value: 'feb2026', label: 'Feb 2026' },
  { value: 'mar2026', label: 'Mar 2026' }, { value: 'apr2026', label: 'Apr 2026' },
  { value: 'may2026', label: 'May 2026' }, { value: 'jun2026', label: 'Jun 2026' },
  { value: 'jul2026', label: 'Jul 2026' }, { value: 'aug2026', label: 'Aug 2026' },
  { value: 'sep2026', label: 'Sep 2026' }, { value: 'oct2026', label: 'Oct 2026' },
  { value: 'nov2026', label: 'Nov 2026' }, { value: 'dec2026', label: 'Dec 2026' },
];

const FieldIcon: React.FC<{ field: string; size?: number }> = ({ field, size = 16 }) => {
  if (field === 'measure') return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, display: 'block' }}>
      <rect x="1.5" y="9" width="3" height="5.5" rx="0.5" fill="#999"/>
      <rect x="6.5" y="5.5" width="3" height="9" rx="0.5" fill="#999"/>
      <rect x="11.5" y="1.5" width="3" height="13" rx="0.5" fill="#999"/>
    </svg>
  );
  // Scheme dimension levels (deep / Acme) render a colored acronym glyph.
  const glyph = getDimensionGlyph(field);
  if (glyph) return (
    <span
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%', background: glyph.bg,
        color: '#fff', fontSize: size * 0.42, fontWeight: 700, lineHeight: 1,
      }}
    >
      {glyph.letters}
    </span>
  );
  if (field === 'account') return (
    <img src={`${import.meta.env.BASE_URL}new_account.svg`} width={size} height={size} alt="" style={{ flexShrink: 0, display: 'block' }} />
  );
  if (field === 'category') return (
    <img src={`${import.meta.env.BASE_URL}category.svg`} width={size} height={size} alt="" style={{ flexShrink: 0, display: 'block' }} />
  );
  if (field === 'products' || field === 'product') return (
    <img src={`${import.meta.env.BASE_URL}product.svg`} width={size} height={size} alt="" style={{ flexShrink: 0, display: 'block' }} />
  );
  // Time Period — inline calendar icon (grey)
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, display: 'block' }}>
      <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="#999" strokeWidth="1.3"/>
      <path d="M5 1v3M11 1v3" stroke="#999" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M1.5 6h13" stroke="#999" strokeWidth="1.3"/>
      <rect x="4" y="8.5" width="2" height="2" rx="0.5" fill="#999"/>
      <rect x="7" y="8.5" width="2" height="2" rx="0.5" fill="#999"/>
      <rect x="10" y="8.5" width="2" height="2" rx="0.5" fill="#999"/>
      <rect x="4" y="11" width="2" height="2" rx="0.5" fill="#999"/>
      <rect x="7" y="11" width="2" height="2" rx="0.5" fill="#999"/>
    </svg>
  );
};

const operatorOptions = [
  { value: 'equals', label: 'Equals' },
  { value: 'notEquals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'notContains', label: 'Not Contains' },
];

const numericOperatorOptions = [
  { value: 'gt',  label: 'Greater than' },
  { value: 'gte', label: 'Greater than or equal' },
  { value: 'lt',  label: 'Less than' },
  { value: 'lte', label: 'Less than or equal' },
  { value: 'eq',  label: 'Equals' },
  { value: 'neq', label: 'Not equals' },
];

// Operators available when a dimension (Account/Category/Product) is filtered by a
// measure value instead of by its name — mirrors the column-level filter options.
const dimensionMeasureOperatorOptions = [
  { value: 'gt',  label: 'Greater than' },
  { value: 'gte', label: 'Greater than or equal' },
  { value: 'lt',  label: 'Less than' },
  { value: 'lte', label: 'Less than or equal' },
  { value: 'eq',  label: 'Equals' },
  { value: 'neq', label: 'Not equals' },
  { value: 'topN', label: 'Top-N' },
  { value: 'bottomN', label: 'Bottom-N' },
];

const DIM_MEASURE_OPS = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'topN', 'bottomN']);

const MATCH_MONTH_KEYS = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
];

// Month options for the Time Period start/end range selectors.
const RANGE_MONTHS = [
  { key: 'jan2026', label: 'Jan 26' }, { key: 'feb2026', label: 'Feb 26' },
  { key: 'mar2026', label: 'Mar 26' }, { key: 'apr2026', label: 'Apr 26' },
  { key: 'may2026', label: 'May 26' }, { key: 'jun2026', label: 'Jun 26' },
  { key: 'jul2026', label: 'Jul 26' }, { key: 'aug2026', label: 'Aug 26' },
  { key: 'sep2026', label: 'Sep 26' }, { key: 'oct2026', label: 'Oct 26' },
  { key: 'nov2026', label: 'Nov 26' }, { key: 'dec2026', label: 'Dec 26' },
];
const rangeMonthLabel = (key: string): string => RANGE_MONTHS.find(m => m.key === key)?.label ?? key;

// ── Granularity-aware time periods ──────────────────────────────────────────────
// Every period (month / quarter / year / week) resolves to a start+end MONTH key so the
// existing "T|op|from|to" encoding and the grid's month-based range logic stay unchanged.
const MONTH_KEYS = RANGE_MONTHS.map(m => m.key);
const QUARTER_DEFS = [
  { key: 'q1-2026', label: 'Q1 26', s: 'jan2026', e: 'mar2026' },
  { key: 'q2-2026', label: 'Q2 26', s: 'apr2026', e: 'jun2026' },
  { key: 'q3-2026', label: 'Q3 26', s: 'jul2026', e: 'sep2026' },
  { key: 'q4-2026', label: 'Q4 26', s: 'oct2026', e: 'dec2026' },
];
const YEAR_DEFS = [{ key: 'y-2026', label: 'FY26', s: 'jan2026', e: 'dec2026' }];
// 52 weekly periods with real calendar ranges, e.g. "Week 2 (Jan 6, 2026 - Jan 12, 2026)".
// Each week resolves to the months its start/end dates fall in so filtering stays month-based.
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK_DEFS = (() => {
  const out: { key: string; label: string; s: string; e: string }[] = [];
  const base = new Date(2026, 0, 1);
  for (let n = 1; n <= 52; n++) {
    const start = new Date(base);
    start.setDate(base.getDate() + 7 * (n - 1));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (d: Date) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    out.push({
      key: `week${n}_2026`,
      label: `Week ${n} (${fmt(start)} - ${fmt(end)})`,
      s: MONTH_KEYS[Math.min(start.getMonth(), 11)],
      e: MONTH_KEYS[Math.min(end.getMonth(), 11)],
    });
  }
  return out;
})();

interface PeriodSpan { s: string; e: string; label: string }
const PERIOD_SPAN: Record<string, PeriodSpan> = {};
RANGE_MONTHS.forEach(m => { PERIOD_SPAN[m.key] = { s: m.key, e: m.key, label: m.label }; });
[...QUARTER_DEFS, ...YEAR_DEFS, ...WEEK_DEFS].forEach(p => { PERIOD_SPAN[p.key] = { s: p.s, e: p.e, label: p.label }; });

const periodLabel = (key: string): string => PERIOD_SPAN[key]?.label ?? rangeMonthLabel(key);
const periodStartMonth = (key: string): string => PERIOD_SPAN[key]?.s ?? key;
const periodEndMonth = (key: string): string => PERIOD_SPAN[key]?.e ?? key;

interface PeriodGroup { group: string; items: { key: string; label: string }[] }
// Build the grouped option list from the selected granularities (coarse → fine).
const buildTimeGroups = (grans?: Set<string>): PeriodGroup[] => {
  const g = grans && grans.size > 0 ? grans : new Set<string>(['month']);
  const groups: PeriodGroup[] = [];
  if (g.has('year')) groups.push({ group: 'Years', items: YEAR_DEFS.map(y => ({ key: y.key, label: y.label })) });
  if (g.has('quarter')) groups.push({ group: 'Quarters', items: QUARTER_DEFS.map(q => ({ key: q.key, label: q.label })) });
  if (g.has('month')) groups.push({ group: 'Months', items: RANGE_MONTHS.map(m => ({ key: m.key, label: m.label })) });
  if (g.has('week')) groups.push({ group: 'Weeks', items: WEEK_DEFS.map(w => ({ key: w.key, label: w.label })) });
  return groups.length > 0 ? groups : [{ group: 'Months', items: RANGE_MONTHS.map(m => ({ key: m.key, label: m.label })) }];
};

// Searchable, grouped time-period dropdown (type-ahead). Headers show only when more than
// one granularity is present.
const TimePeriodSelect: React.FC<{
  value: string;
  groups: PeriodGroup[];
  onChange: (key: string) => void;
  ariaLabel?: string;
}> = ({ value, groups, onChange, ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  useEffect(() => {
    if (open) { setQ(''); const t = setTimeout(() => inputRef.current?.focus(), 0); return () => clearTimeout(t); }
  }, [open]);
  const ql = q.trim().toLowerCase();
  const filtered = groups
    .map(g => ({ group: g.group, items: g.items.filter(it => it.label.toLowerCase().includes(ql)) }))
    .filter(g => g.items.length > 0);
  const showHeaders = groups.length > 1;
  return (
    <div className="ufp-dropdown-wrap" ref={wrapRef}>
      <button
        type="button"
        className="ufp-dropdown-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span>{periodLabel(value)}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="ufp-dropdown-menu ufp-dropdown-menu--search">
          <input
            ref={inputRef}
            className="ufp-dropdown-search"
            type="text"
            value={q}
            placeholder="Search periods…"
            onChange={e => setQ(e.target.value)}
          />
          <div className="ufp-dropdown-scroll">
            {filtered.length === 0 && <div className="ufp-dropdown-empty">No matching periods</div>}
            {filtered.map(g => (
              <div key={g.group}>
                {showHeaders && <div className="ufp-dropdown-group-header">{g.group}</div>}
                {g.items.map(it => (
                  <button
                    key={it.key}
                    type="button"
                    className={`ufp-dropdown-option${value === it.key ? ' selected' : ''}`}
                    onClick={() => { onChange(it.key); setOpen(false); }}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
// Parse a stored time value ("Equals Apr 26 to Jun 26" or a discrete list) into month keys.
const parseTimeValueToRange = (raw: string): { start: string; end: string } => {
  const body = (raw || '').replace(/^Equals\s*/i, '').trim();
  const toKey = (tok?: string): string | null => {
    const key = `${(tok || '').trim().slice(0, 3).toLowerCase()}2026`;
    return RANGE_MONTHS.some(m => m.key === key) ? key : null;
  };
  if (/\sto\s/i.test(body)) {
    const [a, b] = body.split(/\sto\s/i);
    return { start: toKey(a) ?? 'jan2026', end: toKey(b) ?? 'dec2026' };
  }
  const present = RANGE_MONTHS.map(m => m.key).filter(k => body.split(',').some(t => toKey(t) === k));
  if (present.length === 0) return { start: 'jan2026', end: 'dec2026' };
  return { start: present[0], end: present[present.length - 1] };
};

// Time Period operators (Option A). "Between" is a start→end range; the others map to a
// single reference month (or a rolling count for "Last N periods").
const timeOperatorOptions = [
  { value: 'between', label: 'Between' },
  { value: 'is', label: 'Is' },
  { value: 'after', label: 'On or after' },
  { value: 'before', label: 'On or before' },
];
const timeOpLabel = (v: string): string => timeOperatorOptions.find(o => o.value === v)?.label ?? v;

// Parse a stored time value into operator + month keys. Understands the structured
// "T|<op>|<from>|<to>" encoding plus the legacy "Equals <start> to <end>" / discrete list.
const parseTimeValue = (raw: string): { op: string; start: string; end: string; point: string; n: number } => {
  const s = (raw || '').trim();
  const has = (k: string) => RANGE_MONTHS.some(m => m.key === k);
  if (s.startsWith('T|')) {
    const [, op, from, to] = s.split('|');
    const fromKey = has(from) ? from : 'jan2026';
    const toKey = has(to) ? to : 'dec2026';
    const fi = RANGE_MONTHS.findIndex(m => m.key === fromKey);
    const ti = RANGE_MONTHS.findIndex(m => m.key === toKey);
    return { op, start: fromKey, end: toKey, point: op === 'before' ? toKey : fromKey, n: Math.max(1, ti - fi + 1) };
  }
  const { start, end } = parseTimeValueToRange(s);
  return { op: 'between', start, end, point: start, n: 12 };
};

// Live preview of how many dimension members a measure-based filter keeps. Mirrors the
// apply logic in FiltersPanel: Top/Bottom-N ranks by the summed value; comparison
// operators keep a member only when every period satisfies the operator.
const computeDimMatchCount = (
  data: MeasureData[], dimType: string, measureName: string, op: string, rawVal: string,
): { matched: number; total: number } => {
  const measure = data.find(m => (m.name ?? m.id) === measureName);
  const rows: any[] = [];
  const collect = (arr: any[] | undefined) => arr?.forEach((r: any) => {
    if (r.type === dimType && (dimType !== 'product' || !r.children || r.children.length === 0)) rows.push(r);
    if (r.children) collect(r.children);
  });
  if (measure) collect(measure.children);
  const total = new Set(rows.map(r => (r.name ?? '').trim()).filter(Boolean)).size;
  if (!measure || rows.length === 0) return { matched: 0, total };

  if (op === 'topN' || op === 'bottomN') {
    const n = Math.max(0, Math.floor(parseFloat(rawVal) || 0));
    return { matched: Math.min(n, total), total };
  }
  const threshold = parseFloat(rawVal);
  if (isNaN(threshold)) return { matched: total, total };
  const holds = (v: number): boolean =>
    op === 'gt' ? v > threshold
    : op === 'gte' ? v >= threshold
    : op === 'lt' ? v < threshold
    : op === 'lte' ? v <= threshold
    : op === 'eq' ? v === threshold
    : op === 'neq' ? v !== threshold
    : true;
  const matchedNames = new Set<string>();
  rows.forEach(r => {
    const nm = (r.name ?? '').trim();
    if (!nm) return;
    const vals = MATCH_MONTH_KEYS.map(k => Number(r?.values?.[k]) || 0);
    if (vals.length > 0 && vals.every(holds)) matchedNames.add(nm);
  });
  return { matched: matchedNames.size, total };
};

const extractMeasures = (data: MeasureData[]): string[] => {
  return data.map(m => m.name ?? m.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
};

// Collect the unique member names for a given GridRow type across the data tree.
const extractByType = (data: MeasureData[], rowType: string): string[] => {
  const set = new Set<string>();
  const walk = (row: any) => {
    if (row.type === rowType) set.add(row.name);
    row.children?.forEach(walk);
  };
  data.forEach(m => m.children?.forEach(walk));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};

interface UnifiedFilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (field: string, operator: string, selectedValues: string[]) => void;
  onCancel: () => void;
  initialField?: string;
  initialOperator?: string;
  initialValue?: string;
  data: MeasureData[];
  anchorElement: HTMLElement | null;
  selectedTimeGranularities?: Set<string>;
  /** Dimension levels for this grid's scheme (defaults to account/category/product). */
  dimensionFields?: PopoverDimensionField[];
}

const UnifiedFilterPopover: React.FC<UnifiedFilterPopoverProps> = ({
  isOpen, onClose, onSave, onCancel,
  initialField, initialOperator, initialValue,
  data, anchorElement, selectedTimeGranularities,
  dimensionFields,
}) => {
  const dimFields = dimensionFields && dimensionFields.length > 0 ? dimensionFields : DEFAULT_DIMENSION_FIELDS;
  const defaultDimField = dimFields[0]?.value ?? 'account';
  const fieldOptions = useMemo(
    () => [
      { value: 'measure', label: 'Measure' },
      ...dimFields.map((d) => ({ value: d.value, label: d.label })),
      { value: 'time', label: 'Time Period' },
    ],
    [dimFields],
  );
  const DIMENSION_FIELDS = useMemo(() => new Set(dimFields.map((d) => d.value)), [dimFields]);
  const rowTypeForField = (f: string): string => dimFields.find((d) => d.value === f)?.rowType ?? f;
  const timeGroups = useMemo(() => buildTimeGroups(selectedTimeGranularities), [selectedTimeGranularities]);
  const [field, setField] = useState(initialField || defaultDimField);
  const [operator, setOperator] = useState(initialOperator || 'equals');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [initialSelectedValues, setInitialSelectedValues] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [valueExpanded, setValueExpanded] = useState(false);
  const [fieldDropOpen, setFieldDropOpen] = useState(false);
  const [opDropOpen, setOpDropOpen] = useState(false);

  // Measure-specific state (numeric filter on main cell values: measureName|operator|value)
  const [measureName, setMeasureName] = useState('');
  const [measureOperator, setMeasureOperator] = useState('gt');
  const [measureValue, setMeasureValue] = useState('');
  const [measureNameDropOpen, setMeasureNameDropOpen] = useState(false);
  const [measureOpDropOpen, setMeasureOpDropOpen] = useState(false);
  const measureNameDropRef = useRef<HTMLDivElement>(null);
  const measureOpDropRef = useRef<HTMLDivElement>(null);

  // Dimension "Filter By" state: 'name' (default) or a measure name. When a measure is
  // chosen, the dimension is filtered by that measure's value (numeric ops + Top/Bottom-N).
  const [dimFilterBy, setDimFilterBy] = useState('name');
  const [dimMeasureOp, setDimMeasureOp] = useState('gt');
  const [dimMeasureValue, setDimMeasureValue] = useState('');
  const [dimFilterByDropOpen, setDimFilterByDropOpen] = useState(false);
  const [dimOpDropOpen, setDimOpDropOpen] = useState(false);
  const dimFilterByDropRef = useRef<HTMLDivElement>(null);
  const dimOpDropRef = useRef<HTMLDivElement>(null);

  // Time Period operator + value state.
  const [timeOp, setTimeOp] = useState('between');
  const [timeStart, setTimeStart] = useState('jan2026');
  const [timeEnd, setTimeEnd] = useState('dec2026');
  const [timePoint, setTimePoint] = useState('jan2026');
  const [timeOpDropOpen, setTimeOpDropOpen] = useState(false);
  const timeOpDropRef = useRef<HTMLDivElement>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fieldDropRef = useRef<HTMLDivElement>(null);
  const opDropRef = useRef<HTMLDivElement>(null);

  const numericMeasureOps = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']);

  // Reset / hydrate state when opened
  useEffect(() => {
    if (isOpen) {
      setField(initialField || defaultDimField);
      setOperator(initialOperator || 'equals');
      const parsed = initialValue ? initialValue.split(',').map(v => v.trim()).filter(Boolean) : [];
      setSelectedValues(parsed);
      setInitialSelectedValues(parsed);
      setSearch('');
      setValueExpanded(false);
      setMeasureName('');
      setMeasureOperator('gt');
      setMeasureValue('');
      setDimFilterBy('name');
      setDimMeasureOp('gt');
      setDimMeasureValue('');

      // Hydrate the Time Period operator + range from the existing card value.
      if ((initialField || '') === 'time' && initialValue) {
        const t = parseTimeValue(initialValue);
        // "lastN" was removed; fall back to a Between range if an old card still uses it.
        setTimeOp(t.op === 'lastN' ? 'between' : t.op);
        setTimeStart(t.start);
        setTimeEnd(t.end);
        setTimePoint(t.point);
      } else {
        setTimeOp('between');
        setTimeStart('jan2026');
        setTimeEnd('dec2026');
        setTimePoint('jan2026');
      }

      if ((initialField || '') === 'measure' && initialValue && initialValue.includes('|')) {
        const parts = initialValue.split('|');
        if (parts.length >= 4 && numericMeasureOps.has(parts[2] ?? '')) {
          setMeasureName(parts[0]);
          setMeasureOperator(parts[2]);
          setMeasureValue(parts.slice(3).join('|'));
        } else if (parts.length === 3 && numericMeasureOps.has(parts[1] ?? '')) {
          setMeasureName(parts[0]);
          setMeasureOperator(parts[1]);
          setMeasureValue(parts[2]);
        }
      }

      // Revisiting a dimension filtered by a measure: value encoded as measureName|op|val
      if (DIMENSION_FIELDS.has(initialField || '') && initialValue && initialValue.includes('|')) {
        const parts = initialValue.split('|');
        if (parts.length >= 3 && DIM_MEASURE_OPS.has(parts[1] ?? '')) {
          setDimFilterBy(parts[0]);
          setDimMeasureOp(parts[1]);
          setDimMeasureValue(parts.slice(2).join('|'));
        }
      }
    }
  }, [isOpen, initialField, initialValue]);

  // Close measure / dimension-measure dropdowns on outside click
  useEffect(() => {
    if (!measureNameDropOpen && !measureOpDropOpen && !dimFilterByDropOpen && !dimOpDropOpen && !timeOpDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (!measureNameDropRef.current?.contains(e.target as Node)) setMeasureNameDropOpen(false);
      if (!measureOpDropRef.current?.contains(e.target as Node)) setMeasureOpDropOpen(false);
      if (!dimFilterByDropRef.current?.contains(e.target as Node)) setDimFilterByDropOpen(false);
      if (!dimOpDropRef.current?.contains(e.target as Node)) setDimOpDropOpen(false);
      if (!timeOpDropRef.current?.contains(e.target as Node)) setTimeOpDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [measureNameDropOpen, measureOpDropOpen, dimFilterByDropOpen, dimOpDropOpen, timeOpDropOpen]);

  useEffect(() => {
    if (!isOpen) { setFieldDropOpen(false); setOpDropOpen(false); }
  }, [isOpen]);

  useEffect(() => {
    if (valueExpanded && searchRef.current) searchRef.current.focus();
  }, [valueExpanded]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        anchorElement?.contains(target) ||
        fieldDropRef.current?.contains(target) ||
        opDropRef.current?.contains(target)
      ) return;
      handleCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, anchorElement]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!fieldDropOpen && !opDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (!fieldDropRef.current?.contains(e.target as Node)) setFieldDropOpen(false);
      if (!opDropRef.current?.contains(e.target as Node)) setOpDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fieldDropOpen, opDropOpen]);

  // Clear selected values when field type changes
  const handleFieldChange = (val: string) => {
    setField(val);
    setSelectedValues([]);
    setSearch('');
    setValueExpanded(false);
    setFieldDropOpen(false);
    // Reset dimension "Filter By" back to Name whenever the field changes.
    setDimFilterBy('name');
    setDimMeasureOp('gt');
    setDimMeasureValue('');
    setDimFilterByDropOpen(false);
    setDimOpDropOpen(false);
  };

  // Value options based on field
  const allOptions: { value: string; label: string }[] = field === 'measure'
    ? extractMeasures(data).map(m => ({ value: m, label: m }))
    : field === 'time'
    ? timePeriods
    : extractByType(data, rowTypeForField(field)).map(v => ({ value: v, label: v }));

  const filtered = allOptions.filter(o =>
    !search.trim() || o.label.toLowerCase().includes(search.toLowerCase())
  );

  const isRevisiting = !!initialValue && initialSelectedValues.length > 0;
  const sorted = isRevisiting
    ? [...filtered].sort((a, b) => {
        const aWas = initialSelectedValues.includes(a.value);
        const bWas = initialSelectedValues.includes(b.value);
        if (aWas && !bWas) return -1;
        if (!aWas && bWas) return 1;
        return 0;
      })
    : filtered;

  const allSelected = filtered.length > 0 && filtered.every(o => selectedValues.includes(o.value));

  const toggle = (v: string) =>
    setSelectedValues(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const toggleAll = () => {
    if (allSelected) setSelectedValues(prev => prev.filter(v => !filtered.some(o => o.value === v)));
    else setSelectedValues(prev => Array.from(new Set([...prev, ...filtered.map(o => o.value)])));
  };

  const handleSave = () => {
    if (field === 'time') {
      // Encode the chosen operator + resolved window as "T|<op>|<from>|<to>". A full-year
      // "Between" collapses to the legacy all-periods sentinel so it reads as "no filter".
      const idx = (k: string) => RANGE_MONTHS.findIndex(m => m.key === k);
      let value = '';
      if (timeOp === 'between') {
        // Resolve each chosen period (month/quarter/year/week) to its bounding months.
        let fromKey = periodStartMonth(timeStart);
        let toKey = periodEndMonth(timeEnd);
        if (idx(fromKey) > idx(toKey)) { const t = fromKey; fromKey = toKey; toKey = t; }
        value = (fromKey === 'jan2026' && toKey === 'dec2026')
          ? 'Equals Jan 26 to Dec 26'
          : `T|between|${fromKey}|${toKey}`;
      } else if (timeOp === 'is') {
        // A multi-month period (quarter/year/week span) resolves to its full range.
        const fromKey = periodStartMonth(timePoint);
        const toKey = periodEndMonth(timePoint);
        value = fromKey === toKey ? `T|is|${fromKey}|${fromKey}` : `T|between|${fromKey}|${toKey}`;
      } else if (timeOp === 'after') {
        value = `T|after|${periodStartMonth(timePoint)}|dec2026`;
      } else {
        value = `T|before|jan2026|${periodEndMonth(timePoint)}`;
      }
      onSave('time', 'equals', [value]);
      onClose();
      return;
    }
    if (field === 'measure') {
      // Encode as: measureName|operator|value (main grid cell values)
      const encoded = `${measureName}|${measureOperator}|${measureValue}`;
      onSave(field, measureOperator, [encoded]);
    } else if (DIMENSION_FIELDS.has(field) && dimFilterBy !== 'name') {
      // Dimension filtered by a measure value. Encode as: measureName|op|value
      const encoded = `${dimFilterBy}|${dimMeasureOp}|${dimMeasureValue}`;
      onSave(field, dimMeasureOp, [encoded]);
    } else {
      onSave(field, operator, selectedValues);
    }
    onClose();
  };
  const handleCancel = () => {
    setSelectedValues(initialSelectedValues);
    setField(initialField || defaultDimField);
    setOperator(initialOperator || 'equals');
    setSearch('');
    setValueExpanded(false);
    setMeasureName('');
    setMeasureOperator('gt');
    setMeasureValue('');
    setDimFilterBy('name');
    setDimMeasureOp('gt');
    setDimMeasureValue('');
    setTimeStart('jan2026');
    setTimeEnd('dec2026');
    onCancel();
  };

  if (!isOpen) return null;

  const getPosition = () => {
    if (!anchorElement) return { top: 8, left: 8, side: 'right' as const, nubbinTop: 28 };
    const rect = anchorElement.getBoundingClientRect();
    const w = 320, gap = 8, vw = window.innerWidth, vh = window.innerHeight;
    const leftPos = rect.left - w - gap;
    const rightPos = rect.right + gap;
    const left = leftPos >= gap ? leftPos
      : rightPos + w <= vw - gap ? rightPos
      : Math.max(gap, vw - w - gap);
    const side = left < rect.left ? 'left' as const : 'right' as const;
    const top = Math.min(rect.top, vh - 420);
    const finalTop = Math.max(8, top);
    const anchorMidY = rect.top + rect.height / 2;
    const nubbinTop = Math.max(14, Math.min(392, anchorMidY - finalTop - 8));
    return { top: finalTop, left, side, nubbinTop };
  };

  const pos = getPosition();
  const fieldLabel = fieldOptions.find(f => f.value === field)?.label ?? field;
  const opLabel = operatorOptions.find(o => o.value === operator)?.label ?? operator;
  const selectedCount = selectedValues.length;
  const placeholder = field === 'time' ? 'Search time periods...' : `Search ${fieldLabel.toLowerCase()}...`;

  const measureNames = extractMeasures(data);
  const measureNameLabel = measureName || 'Select measure…';
  const measureOpLabel = numericOperatorOptions.find(o => o.value === measureOperator)?.label ?? measureOperator;

  const isDimensionField = DIMENSION_FIELDS.has(field);
  const dimFilterByLabel = dimFilterBy === 'name' ? 'Name' : dimFilterBy;
  const dimMeasureOpLabel = dimensionMeasureOperatorOptions.find(o => o.value === dimMeasureOp)?.label ?? dimMeasureOp;
  const dimValueIsRank = dimMeasureOp === 'topN' || dimMeasureOp === 'bottomN';
  const dimMemberNoun = (fieldOptions.find(f => f.value === field)?.label ?? 'members').toLowerCase();
  const dimMatch = isDimensionField && dimFilterBy !== 'name' && dimMeasureValue.trim() !== ''
    ? computeDimMatchCount(data, rowTypeForField(field), dimFilterBy, dimMeasureOp, dimMeasureValue)
    : null;

  const nubbinOuterStyle: React.CSSProperties = pos.side === 'left'
    ? {
        position: 'absolute',
        top: `${pos.nubbinTop}px`,
        right: '-10px',
        width: 0,
        height: 0,
        borderTop: '10px solid transparent',
        borderBottom: '10px solid transparent',
        borderLeft: '10px solid var(--slds-g-color-neutral-base-70)',
        pointerEvents: 'none',
        zIndex: 100011,
      }
    : {
        position: 'absolute',
        top: `${pos.nubbinTop}px`,
        left: '-10px',
        width: 0,
        height: 0,
        borderTop: '10px solid transparent',
        borderBottom: '10px solid transparent',
        borderRight: '10px solid var(--slds-g-color-neutral-base-70)',
        pointerEvents: 'none',
        zIndex: 100011,
      };

  const nubbinInnerStyle: React.CSSProperties = pos.side === 'left'
    ? {
        position: 'absolute',
        top: `${pos.nubbinTop + 1}px`,
        right: '-9px',
        width: 0,
        height: 0,
        borderTop: '9px solid transparent',
        borderBottom: '9px solid transparent',
        borderLeft: '9px solid #ffffff',
        pointerEvents: 'none',
        zIndex: 100012,
      }
    : {
        position: 'absolute',
        top: `${pos.nubbinTop + 1}px`,
        left: '-9px',
        width: 0,
        height: 0,
        borderTop: '9px solid transparent',
        borderBottom: '9px solid transparent',
        borderRight: '9px solid #ffffff',
        pointerEvents: 'none',
        zIndex: 100012,
      };

  const content = (
    <>
      <div className="ufp-backdrop" onClick={handleCancel} />
      <div ref={popoverRef} className="ufp-popover" style={{ top: pos.top, left: pos.left }}>
        <div style={nubbinOuterStyle} aria-hidden="true" />
        <div style={nubbinInnerStyle} aria-hidden="true" />

        {/* Field */}
        <div className="ufp-section">
          <label className="ufp-label">Field</label>
          <div className="ufp-dropdown-wrap" ref={fieldDropRef}>
            <button
              className="ufp-dropdown-trigger"
              onClick={() => { setFieldDropOpen(p => !p); setOpDropOpen(false); }}
            >
              <span className="ufp-trigger-label">
                <FieldIcon field={field} size={16} />
                {fieldLabel}
              </span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {fieldDropOpen && (
              <div className="ufp-dropdown-menu">
                {fieldOptions.map(opt => (
                  <button
                    key={opt.value}
                    className={`ufp-dropdown-option${field === opt.value ? ' selected' : ''}`}
                    onClick={() => handleFieldChange(opt.value)}
                  >
                    <FieldIcon field={opt.value} size={15} />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {field === 'measure' ? (
          <>
            {/* Measure name combobox */}
            <div className="ufp-section">
              <label className="ufp-label">Measure</label>
              <div className="ufp-dropdown-wrap" ref={measureNameDropRef}>
                <button
                  className="ufp-dropdown-trigger"
                  onClick={() => { setMeasureNameDropOpen(p => !p); setMeasureOpDropOpen(false); setFieldDropOpen(false); }}
                >
                  <span className={measureName ? undefined : 'ufp-value-placeholder-inline'}>{measureNameLabel}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {measureNameDropOpen && (
                  <div className="ufp-dropdown-menu">
                    {measureNames.map(mn => (
                      <button
                        key={mn}
                        className={`ufp-dropdown-option${measureName === mn ? ' selected' : ''}`}
                        onClick={() => { setMeasureName(mn); setMeasureNameDropOpen(false); }}
                      >
                        {mn}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Numeric operator */}
            <div className="ufp-section">
              <label className="ufp-label">Operator</label>
              <div className="ufp-dropdown-wrap" ref={measureOpDropRef}>
                <button
                  className="ufp-dropdown-trigger"
                  onClick={() => { setMeasureOpDropOpen(p => !p); setMeasureNameDropOpen(false); setFieldDropOpen(false); }}
                >
                  <span>{measureOpLabel}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {measureOpDropOpen && (
                  <div className="ufp-dropdown-menu">
                    {numericOperatorOptions.map(opt => (
                      <button
                        key={opt.value}
                        className={`ufp-dropdown-option${measureOperator === opt.value ? ' selected' : ''}`}
                        onClick={() => { setMeasureOperator(opt.value); setMeasureOpDropOpen(false); }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Numeric value input */}
            <div className="ufp-section">
              <label className="ufp-label">Value</label>
              <input
                className="ufp-measure-value-input"
                type="number"
                placeholder="Enter a number…"
                value={measureValue}
                onChange={e => setMeasureValue(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
        {/* Filter By (dimension fields only): Name or a measure */}
        {isDimensionField && (
          <div className="ufp-section">
            <label className="ufp-label">Filter By</label>
            <div className="ufp-dropdown-wrap" ref={dimFilterByDropRef}>
              <button
                className="ufp-dropdown-trigger"
                onClick={() => { setDimFilterByDropOpen(p => !p); setFieldDropOpen(false); setDimOpDropOpen(false); }}
              >
                <span>{dimFilterByLabel}</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {dimFilterByDropOpen && (
                <div className="ufp-dropdown-menu">
                  <button
                    className={`ufp-dropdown-option${dimFilterBy === 'name' ? ' selected' : ''}`}
                    onClick={() => { setDimFilterBy('name'); setDimFilterByDropOpen(false); }}
                  >
                    Name
                  </button>
                  {measureNames.map(mn => (
                    <button
                      key={mn}
                      className={`ufp-dropdown-option${dimFilterBy === mn ? ' selected' : ''}`}
                      onClick={() => { setDimFilterBy(mn); setDimFilterByDropOpen(false); }}
                    >
                      {mn}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {field === 'time' ? (
          <>
            {/* Operator */}
            <div className="ufp-section">
              <label className="ufp-label">Operator</label>
              <div className="ufp-dropdown-wrap" ref={timeOpDropRef}>
                <button
                  className="ufp-dropdown-trigger"
                  onClick={() => { setTimeOpDropOpen(p => !p); setTimeStartDropOpen(false); setTimeEndDropOpen(false); setTimePointDropOpen(false); setFieldDropOpen(false); }}
                >
                  <span>{timeOpLabel(timeOp)}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {timeOpDropOpen && (
                  <div className="ufp-dropdown-menu">
                    {timeOperatorOptions.map(o => (
                      <button
                        key={o.value}
                        className={`ufp-dropdown-option${timeOp === o.value ? ' selected' : ''}`}
                        onClick={() => { setTimeOp(o.value); setTimeOpDropOpen(false); }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {timeOp === 'between' ? (
              <>
                {/* Start period */}
                <div className="ufp-section">
                  <label className="ufp-label">Start</label>
                  <TimePeriodSelect
                    value={timeStart}
                    groups={timeGroups}
                    ariaLabel="Start period"
                    onChange={setTimeStart}
                  />
                </div>

                {/* End period */}
                <div className="ufp-section">
                  <label className="ufp-label">End</label>
                  <TimePeriodSelect
                    value={timeEnd}
                    groups={timeGroups}
                    ariaLabel="End period"
                    onChange={setTimeEnd}
                  />
                </div>
              </>
            ) : (
              /* Single reference period for Is / On or after / On or before */
              <div className="ufp-section">
                <label className="ufp-label">{timeOp === 'after' ? 'From' : timeOp === 'before' ? 'Until' : 'Period'}</label>
                <TimePeriodSelect
                  value={timePoint}
                  groups={timeGroups}
                  ariaLabel="Time period"
                  onChange={setTimePoint}
                />
              </div>
            )}
          </>
        ) : isDimensionField && dimFilterBy !== 'name' ? (
          <>
            {/* Measure-based operator (numeric + Top/Bottom-N) */}
            <div className="ufp-section">
              <label className="ufp-label">Operator</label>
              <div className="ufp-dropdown-wrap" ref={dimOpDropRef}>
                <button
                  className="ufp-dropdown-trigger"
                  onClick={() => { setDimOpDropOpen(p => !p); setDimFilterByDropOpen(false); setFieldDropOpen(false); }}
                >
                  <span>{dimMeasureOpLabel}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {dimOpDropOpen && (
                  <div className="ufp-dropdown-menu">
                    {dimensionMeasureOperatorOptions.map(opt => (
                      <button
                        key={opt.value}
                        className={`ufp-dropdown-option${dimMeasureOp === opt.value ? ' selected' : ''}`}
                        onClick={() => { setDimMeasureOp(opt.value); setDimOpDropOpen(false); }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Value: threshold, or N for Top/Bottom-N */}
            <div className="ufp-section">
              <label className="ufp-label">{dimValueIsRank ? 'N' : 'Value'}</label>
              <input
                className="ufp-measure-value-input"
                type="number"
                placeholder={dimValueIsRank ? 'Enter N…' : 'Enter a number…'}
                value={dimMeasureValue}
                onChange={e => setDimMeasureValue(e.target.value)}
              />
              {dimMatch && (
                <div
                  className="ufp-match-hint"
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: dimMatch.matched === 0 ? '#ba0517' : '#3e3e3c',
                  }}
                >
                  {dimMatch.matched === 0
                    ? `No ${dimMemberNoun} match — the grid will be empty. Try a different value.`
                    : `${dimMatch.matched} of ${dimMatch.total} ${dimMemberNoun} match`}
                  {!dimValueIsRank && (
                    <span style={{ color: '#706e6b' }}> (every period must satisfy the condition)</span>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
        {/* Operator */}
        <div className="ufp-section">
          <label className="ufp-label">Operator</label>
          <div className="ufp-dropdown-wrap" ref={opDropRef}>
            <button
              className="ufp-dropdown-trigger"
              onClick={() => { setOpDropOpen(p => !p); setFieldDropOpen(false); }}
            >
              <span>{opLabel}</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {opDropOpen && (
              <div className="ufp-dropdown-menu">
                {operatorOptions.map(opt => (
                  <button
                    key={opt.value}
                    className={`ufp-dropdown-option${operator === opt.value ? ' selected' : ''}`}
                    onClick={() => { setOperator(opt.value); setOpDropOpen(false); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Value */}
        <div className="ufp-section">
          <label className="ufp-label">Value</label>
          {!valueExpanded ? (
            <div
              className="ufp-value-collapsed"
              onClick={() => { setValueExpanded(true); setFieldDropOpen(false); setOpDropOpen(false); }}
            >
              {selectedCount > 0
                ? <span className="ufp-value-selected">{selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected</span>
                : <span className="ufp-value-placeholder">Click to select values…</span>
              }
            </div>
          ) : (
            <div className="ufp-value-expanded">
              <input
                ref={searchRef}
                type="text"
                className="ufp-search"
                placeholder={placeholder}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="ufp-checkbox-list">
                {filtered.length > 0 && (
                  <label className="ufp-checkbox-item ufp-checkbox-all">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                    <span>All</span>
                  </label>
                )}
                {sorted.map(opt => (
                  <label key={opt.value} className="ufp-checkbox-item">
                    <input type="checkbox" checked={selectedValues.includes(opt.value)} onChange={() => toggle(opt.value)} />
                    <span>{opt.label}</span>
                  </label>
                ))}
                {filtered.length === 0 && (
                  <div className="ufp-no-results">No results found</div>
                )}
              </div>
            </div>
          )}
        </div>
          </>
        )}
          </>
        )}

        {/* Actions */}
        <div className="ufp-actions">
          <button className="ufp-btn ufp-btn-cancel" onClick={handleCancel}>Cancel</button>
          <button className="ufp-btn ufp-btn-save" onClick={handleSave}>Save</button>
        </div>

      </div>
    </>
  );

  return ReactDOM.createPortal(content, document.body);
};

export default UnifiedFilterPopover;
