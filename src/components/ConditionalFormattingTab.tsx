import React, { useState, useRef, useEffect, useId } from 'react';
import {
  ConditionalFormattingRule,
  IndicatorMode,
  IndicatorZone,
  RuleTarget,
  VisualizationConfig,
  ConditionType,
  VisualizationType,
  RuleCondition,
} from '../types/conditionalFormatting';
import { MeasureData } from '../types';
import '../styles/components/ConditionalFormattingTab.css';
import { ruleCreatedAtMs } from '../utils/conditionalFormattingUtils';
import { SLDS_HEX } from '../utils/sldsColorHex';

// ─── Constants ─────────────────────────────────────────────────────────────────

const ZONE_BASED: VisualizationType[] = ['iconSet', 'dataBar', 'divergingBar', 'colorScale'];

const ICON_STYLES: { value: 'trafficLights' | 'arrows' | 'stars' | 'flags' | 'custom'; label: string }[] = [
  { value: 'trafficLights', label: 'Traffic Lights (🟢🟡🔴)' },
  { value: 'arrows',        label: 'Arrows (↑→↓)' },
  { value: 'stars',         label: 'Stars (★★★→★★→★)' },
  { value: 'flags',         label: 'Flags (🚩🏳️🏴)' },
  { value: 'custom',        label: 'Custom (emoji)' },
];


const CONDITION_TYPES: { value: ConditionType; label: string }[] = [
  { value: 'greaterThan',  label: 'Greater than' },
  { value: 'lessThan',     label: 'Less than' },
  { value: 'equals',       label: 'Equals' },
  { value: 'between',      label: 'Between' },
  { value: 'topN',         label: 'Top N rows' },
  { value: 'bottomN',      label: 'Bottom N rows' },
  { value: 'aboveAverage', label: 'Above average' },
  { value: 'belowAverage', label: 'Below average' },
  { value: 'formula',      label: 'Custom formula' },
];

const dimensionOptions = [
  { id: 'account',  label: 'Accounts' },
  { id: 'category', label: 'Categories' },
  { id: 'product',  label: 'Products' },
];

const timeOptions = [
  { id: 'jan2026', label: 'Jan 2026' }, { id: 'feb2026', label: 'Feb 2026' },
  { id: 'mar2026', label: 'Mar 2026' }, { id: 'apr2026', label: 'Apr 2026' },
  { id: 'may2026', label: 'May 2026' }, { id: 'jun2026', label: 'Jun 2026' },
  { id: 'jul2026', label: 'Jul 2026' }, { id: 'aug2026', label: 'Aug 2026' },
  { id: 'sep2026', label: 'Sep 2026' }, { id: 'oct2026', label: 'Oct 2026' },
  { id: 'nov2026', label: 'Nov 2026' }, { id: 'dec2026', label: 'Dec 2026' },
];

const DIM_LABEL_TO_ID: Record<string, string> = { Accounts: 'account', Categories: 'category', Products: 'product' };
const DIM_ID_TO_LABEL: Record<string, string> = { account: 'Accounts', category: 'Categories', product: 'Products' };

// Dimension levels for the rule "Level" dropdown (matches the deployed grid).
const LEVEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'category', label: 'Category' },
  { id: 'product', label: 'Product' },
];

// ─── Formula constants ──────────────────────────────────────────────────────────

const FORMULA_TEMPLATES: { label: string; description: string; formula: (m: string) => string; unit: 'percent' | 'number' | 'ratio' }[] = [
  {
    label: '% YoY',
    description: 'Percentage change vs the same period last year. Positive = growth, negative = decline.',
    formula: m => `({${m}} - {${m}[-1Y]}) / {${m}[-1Y]} * 100`,
    unit: 'percent',
  },
  {
    label: '% vs Budget',
    description: 'Actual as a percentage of the budgeted / target value. 100% = exactly on budget.',
    formula: m => `{${m}} / {${m}[budget]} * 100`,
    unit: 'percent',
  },
  {
    label: 'Margin %',
    description: 'Gross margin as a percentage of revenue. Uses the Margin and Revenue measures.',
    formula: _m => `{Margin} / {Revenue} * 100`,
    unit: 'percent',
  },
  {
    label: '% vs Avg',
    description: 'How far each cell deviates from the column average, expressed as a percentage.',
    formula: m => `({${m}} - {AVG(${m})}) / {AVG(${m})} * 100`,
    unit: 'percent',
  },
  {
    label: 'Abs Diff',
    description: 'Absolute difference between the current value and the same period last year.',
    formula: m => `{${m}} - {${m}[-1Y]}`,
    unit: 'number',
  },
  {
    label: '% MoM',
    description: 'Percentage change vs the previous month.',
    formula: m => `({${m}} - {${m}[-1M]}) / {${m}[-1M]} * 100`,
    unit: 'percent',
  },
  {
    label: '% vs Max',
    description: 'Each value as a percentage of the column maximum. Highlights relative performance.',
    formula: m => `{${m}} / {MAX(${m})} * 100`,
    unit: 'percent',
  },
];

const TIME_OFFSET_ITEMS = [
  { label: '[-1Y]   1 year ago',         token: '[-1Y]' },
  { label: '[-1Q]   1 quarter ago',      token: '[-1Q]' },
  { label: '[-1M]   1 month ago',        token: '[-1M]' },
  { label: '[-2Y]   2 years ago',        token: '[-2Y]' },
  { label: '[+1M]   1 month forward',    token: '[+1M]' },
];

const FN_ITEMS = [
  { label: 'ABS( )      absolute value',  token: 'ABS()' },
  { label: 'ROUND( )    round',           token: 'ROUND()' },
  { label: 'MIN( , )    minimum of two',  token: 'MIN(, )' },
  { label: 'MAX( , )    maximum of two',  token: 'MAX(, )' },
];

// ─── Admin (built-in) indicator columns ─────────────────────────────────────────

const ADMIN_INDICATOR_RULES: ConditionalFormattingRule[] = [
  {
    id: 'admin-yoy',
    name: 'YoY',
    isActive: true,
    priority: 0,
    mode: 'createColumns',
    isAdmin: true,
    target: { measureIds: [], dimensionLevels: [], timeKeys: [] },
    condition: { type: 'greaterThan', value: -1e15 },
    visualization: {
      type: 'divergingBar',
      formulaExpression: '({M} - {M[-1Y]}) / {M[-1Y]} * 100',
      resultUnit: 'percent',
      barMin: -50,
      barMax: 50,
      zones: [
        { id: 'yoy-z1', threshold: 0,     color: SLDS_HEX.paletteGreen60, label: 'Growth'  },
        { id: 'yoy-z2', isCatchAll: true, color: SLDS_HEX.paletteRed40, label: 'Decline' },
      ],
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    createdBy: 'Admin',
  },
  {
    id: 'admin-mom',
    name: 'MoM',
    isActive: true,
    priority: 1,
    mode: 'createColumns',
    isAdmin: true,
    target: { measureIds: [], dimensionLevels: [], timeKeys: [] },
    condition: { type: 'greaterThan', value: -1e15 },
    visualization: {
      type: 'divergingBar',
      formulaExpression: '({M} - {M[-1M]}) / {M[-1M]} * 100',
      resultUnit: 'percent',
      barMin: -20,
      barMax: 20,
      zones: [
        { id: 'mom-z1', threshold: 0,     color: SLDS_HEX.paletteGreen60, label: 'Growth'  },
        { id: 'mom-z2', isCatchAll: true, color: SLDS_HEX.paletteRed40, label: 'Decline' },
      ],
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    createdBy: 'Admin',
  },
  {
    id: 'admin-target',
    name: 'Target Achievement',
    isActive: true,
    priority: 2,
    mode: 'createColumns',
    isAdmin: true,
    target: { measureIds: [], dimensionLevels: [], timeKeys: [] },
    condition: { type: 'greaterThan', value: -1e15 },
    visualization: {
      type: 'dataBar',
      formulaExpression: '{M} / {M[budget]} * 100',
      resultUnit: 'percent',
      barMin: 0,
      barMax: 120,
      showValue: true,
      zones: [
        { id: 'ta-z1', threshold: 100,   color: SLDS_HEX.paletteGreen60, label: 'Above target' },
        { id: 'ta-z2', threshold: 72,    color: SLDS_HEX.paletteGreen60, label: 'On track'     },
        { id: 'ta-z3', threshold: 45,    color: '#f59e0b', label: 'At risk'      },
        { id: 'ta-z4', isCatchAll: true, color: SLDS_HEX.paletteRed40, label: 'Off track'    },
      ],
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    createdBy: 'Admin',
  },
];

// makePresetModifyCellRules removed — users now create their own rules inline.

// Kept as dead code placeholder for type-check continuity:
function _unusedPresetStub(): ConditionalFormattingRule[] {
  const now = new Date();
  return [
    {
      id: 'preset-yoy-rule',
      name: 'YoY Variance',
      isActive: true,
      priority: 0,
      mode: 'modifyCells',
      target: { measureIds: [], dimensionLevels: [], timeKeys: [] },
      adminTarget: { measureIds: [], dimensionLevels: [], timeKeys: [] },
      condition: { type: 'greaterThan', value: -1e15 },
      visualization: {
        type: 'colorScale',
        evalBasis: 'yoy',
        zones: [
          { id: 'yoy-z1', threshold: 15, color: '#C9F1E6', label: 'Strong Growth' },
          { id: 'yoy-z2', threshold: -15, color: '#FFFFFF', label: 'Within Range' },
          { id: 'yoy-z3', isCatchAll: true, color: '#F9D1DC', label: 'Decline' },
        ],
      },
      createdAt: now,
      updatedAt: now,
      createdBy: 'Admin',
    },
    {
      id: 'preset-target-achievement-rule',
      name: 'Target Achievement',
      isActive: false,
      priority: 1,
      mode: 'modifyCells',
      target: { measureIds: [], dimensionLevels: [], timeKeys: [] },
      adminTarget: { measureIds: [], dimensionLevels: [], timeKeys: [] },
      condition: { type: 'greaterThan', value: -1e15 },
      visualization: {
        type: 'iconSet',
        evalBasis: 'targetAchievement',
        iconStyle: 'trafficLights',
        zones: [
          { id: 'ta-z1', threshold: 90, color: '#C9F1E6', icon: '🟢', label: 'Above Target' },
          { id: 'ta-z2', threshold: 70, color: '#FFF6CC', icon: '🟡', label: 'Near Target' },
          { id: 'ta-z3', isCatchAll: true, color: '#F9D1DC', icon: '🔴', label: 'Below Target' },
        ],
      },
      createdAt: now,
      updatedAt: now,
      createdBy: 'Admin',
    },
    {
      id: 'preset-revenue-concentration-rule',
      name: 'Concentration Analysis',
      isActive: true,
      priority: 2,
      mode: 'modifyCells',
      target: { measureIds: [], dimensionLevels: ['account', 'category', 'product'], timeKeys: [] },
      adminTarget: { measureIds: [], dimensionLevels: ['account', 'category', 'product'], timeKeys: [] },
      condition: { type: 'greaterThan', value: -1e15 },
      visualization: {
        type: 'colorScale',
        evalBasis: 'pctRankByType',
        zones: [
          { id: 'rc-z1', threshold: 67, color: '#FFD0BB', label: 'Top tier' },
          { id: 'rc-z2', threshold: 33, color: '#FFF0D4', label: 'Mid tier' },
          { id: 'rc-z3', isCatchAll: true, color: '#FFFEF0', label: 'Bottom tier' },
        ],
      },
      createdAt: now,
      updatedAt: now,
      createdBy: 'Admin',
    },
    {
      id: 'preset-cost-magnitude-rule',
      name: 'Cost Magnitude',
      isActive: true,
      priority: 3,
      mode: 'modifyCells',
      target: { measureIds: ['measure-sa-rev'], dimensionLevels: [], timeKeys: [] },
      adminTarget: { measureIds: ['measure-sa-rev'], dimensionLevels: [], timeKeys: [] },
      condition: { type: 'greaterThan', value: -1e15 },
      visualization: {
        type: 'dataBar',
        evalBasis: 'costShare',
        barMin: 0,
        barMax: 100,
        showValue: false,
        zones: [
          { id: 'cm-z1', isCatchAll: true, color: '#E8829A', label: '' },
        ],
      },
      createdAt: now,
      updatedAt: now,
      createdBy: 'Admin',
    },
    {
      id: 'preset-trend-direction-rule',
      name: 'Trend Direction',
      isActive: true,
      priority: 4,
      mode: 'modifyCells',
      target: { measureIds: [], dimensionLevels: [], timeKeys: [] },
      adminTarget: { measureIds: [], dimensionLevels: [], timeKeys: [] },
      condition: { type: 'greaterThan', value: -1e15 },
      visualization: {
        type: 'iconSet',
        evalBasis: 'mom',
        iconStyle: 'arrows',
        zones: [
          { id: 'td-z1', threshold: 10,  color: '#3B0764', label: 'Strong Growth'   },
          { id: 'td-z2', threshold: 5,   color: '#3B0764', label: 'Moderate Growth' },
          { id: 'td-z3', threshold: -5,  color: '#3B0764', label: 'Flat'            },
          { id: 'td-z4', threshold: -10, color: '#3B0764', label: 'Moderate Decline' },
          { id: 'td-z5', isCatchAll: true, color: '#3B0764', label: 'Strong Decline' },
        ],
      },
      createdAt: now,
      updatedAt: now,
      createdBy: 'Admin',
    },
    {
      id: 'preset-variance-rule',
      name: 'Anomaly Detection',
      isActive: true,
      priority: 5,
      mode: 'modifyCells',
      target: { measureIds: [], dimensionLevels: [], timeKeys: [] },
      adminTarget: { measureIds: [], dimensionLevels: [], timeKeys: [] },
      condition: { type: 'greaterThan', value: -1e15 },
      visualization: {
        type: 'colorScale',
        evalBasis: 'variance',
        zones: [
          { id: 'variance-z1', threshold: 5, color: '#F9D1DC', label: 'Anomaly' },
          { id: 'variance-z2', isCatchAll: true, color: '#FFFFFF', label: 'Normal' },
        ],
      },
      createdAt: now,
      updatedAt: now,
      createdBy: 'Admin',
    },
    {
      id: 'preset-mom-rule',
      name: 'MoM',
      isActive: true,
      priority: 6,
      mode: 'modifyCells',
      target: { measureIds: [], dimensionLevels: [], timeKeys: [] },
      adminTarget: { measureIds: [], dimensionLevels: [], timeKeys: [] },
      condition: { type: 'greaterThan', value: -1e15 },
      visualization: {
        type: 'colorScale',
        evalBasis: 'mom',
        zones: [
          { id: 'mom-z1', threshold: 6, color: '#C9F1E6', label: 'Good' },
          { id: 'mom-z2', threshold: 0, color: '#FFF6CC', label: 'Watch' },
          { id: 'mom-z3', isCatchAll: true, color: '#F9D1DC', label: 'Critical' },
        ],
      },
      createdAt: now,
      updatedAt: now,
      createdBy: 'Admin',
    },
  ];
}

// ─── Simple operator labels ──────────────────────────────────────────────────────

const SIMPLE_OPERATOR_LABELS: Record<string, string> = {
  greaterThan: 'greater than',
  lessThan: 'less than',
  equals: 'equals',
  between: 'between',
};

// ─── Criterion types ────────────────────────────────────────────────────────────

type CriterionField = 'Metric' | 'Dimension' | 'Time Period';
type CriterionOperator = 'equals' | 'is any of' | 'is not any of' | 'is before' | 'is after';

interface Criterion {
  id: string;
  field: CriterionField;
  operator: CriterionOperator;
  values: string[];
}

const OPERATOR_OPTIONS: Record<CriterionField, CriterionOperator[]> = {
  'Metric':      ['equals', 'is any of', 'is not any of'],
  'Dimension':   ['is any of', 'is not any of'],
  'Time Period': ['is any of', 'is not any of', 'is before', 'is after'],
};

const SINGLE_VALUE_OPS = new Set<CriterionOperator>(['equals', 'is before', 'is after']);

function criteriaToTarget(criteria: Criterion[], measures: MeasureData[]): RuleTarget {
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
    } else {
      if (isBefore) {
        const refIdx = timeOptions.findIndex(t => t.label === c.values[0]);
        if (refIdx > 0) timeKeys.push(...timeOptions.slice(0, refIdx).map(t => t.id));
      } else if (isAfter) {
        const refIdx = timeOptions.findIndex(t => t.label === c.values[0]);
        if (refIdx >= 0 && refIdx < timeOptions.length - 1)
          timeKeys.push(...timeOptions.slice(refIdx + 1).map(t => t.id));
      } else {
        const ids = c.values.map(v => timeOptions.find(t => t.label === v)?.id).filter(Boolean) as string[];
        (isExclude ? excludeTimeKeys : timeKeys).push(...ids);
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

function targetToCriteria(target: RuleTarget, measures: MeasureData[]): Criterion[] {
  const result: Criterion[] = [];
  if (target.measureIds.length) {
    const names = target.measureIds.map(id => measures.find(m => m.id === id)?.name).filter(Boolean) as string[];
    if (names.length) {
      result.push({
        id: 'tc-m-inc',
        field: 'Metric',
        operator: names.length === 1 ? 'equals' : 'is any of',
        values: names,
      });
    }
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
    const names = target.timeKeys.map(k => timeOptions.find(t => t.id === k)?.label).filter(Boolean) as string[];
    if (names.length) result.push({ id: 'tc-t-inc', field: 'Time Period', operator: 'is any of', values: names });
  }
  if (target.excludeTimeKeys?.length) {
    const names = target.excludeTimeKeys.map(k => timeOptions.find(t => t.id === k)?.label).filter(Boolean) as string[];
    if (names.length) result.push({ id: 'tc-t-exc', field: 'Time Period', operator: 'is not any of', values: names });
  }
  return result;
}

// ─── Zone helpers ───────────────────────────────────────────────────────────────

// ─── Color scale definitions ────────────────────────────────────────────────
interface ColorScaleDef {
  id: string;
  label: string;
  stops: string[]; // 2-3 hex stops; interpolation fills the rest
}

const COLOR_SCALES: ColorScaleDef[] = [
  { id: 'redGreen',    label: 'Red → Green',       stops: ['#f9d1dc', '#fff6cc', '#c9f1e6'] },
  { id: 'greenRed',    label: 'Green → Red',       stops: ['#c9f1e6', '#fff6cc', '#f9d1dc'] },
  { id: 'heatmap',     label: 'Heatmap',           stops: ['#fff8d9', '#ffe4c4', '#ffd6b6'] },
  { id: 'blueWhiteRed',label: 'Blue – White – Red',stops: ['#c7e5ff', '#f7fbff', '#f9d1dc'] },
  { id: 'purpleBlue',  label: 'Purple → Blue',     stops: ['#ecd8ff', '#c7e5ff'] },
  { id: 'sequential',  label: 'Sequential Blue',   stops: ['#e7f3ff', '#c7e5ff'] },
  { id: 'custom',      label: 'Custom',            stops: [] },
];

// Linear interpolate two hex colors by t ∈ [0,1]
function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl2 = Math.round(ab + (bb - ab) * t);
  return '#' + [r, g, bl2].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Given N steps and ≥2 stops, interpolate N evenly-spaced colors
function interpolateScale(stops: string[], n: number): string[] {
  if (n <= 0 || stops.length === 0) return [];
  if (n === 1) return [stops[0]];
  const segments = stops.length - 1;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);          // 0…1 across entire scale
    const seg = Math.min(Math.floor(t * segments), segments - 1);
    const localT = t * segments - seg;
    return lerpHex(stops[seg], stops[seg + 1], localT);
  });
}

// Apply a color scale to a zone array (in-place copy)
function applyScaleToZones(
  zones: IndicatorZone[],
  scaleId: string,
  direction: 'normal' | 'reversed' = 'normal',
): IndicatorZone[] {
  const scale = COLOR_SCALES.find(s => s.id === scaleId);
  if (!scale || scale.stops.length === 0) return zones;
  const stops = direction === 'reversed' ? [...scale.stops].reverse() : scale.stops;
  const colors = interpolateScale(stops, zones.length);
  return zones.map((z, i) => ({ ...z, color: colors[i] ?? z.color }));
}


function makeDefaultZones(): IndicatorZone[] {
  const t = Date.now();
  return [
    { id: `z-${t}-1`, threshold: 10,  color: '#C9F1E6', label: 'Good' },
    { id: `z-${t}-2`, threshold: 0,   color: '#FFF6CC', label: 'Watch' },
    { id: `z-${t}-3`, color: '#F9D1DC', label: 'Critical', isCatchAll: true },
  ];
}


function getZoneIcon(style: string, index: number, total: number, zone?: IndicatorZone): string {
  const first = index === 0, last = index === total - 1;
  if (style === 'custom') return zone?.icon?.trim() || '●';
  switch (style) {
    case 'trafficLights': return first ? '🟢' : last ? '🔴' : '🟡';
    case 'arrows': return first ? '↑' : last ? '↓' : '→';
    case 'stars': return first ? '★★★' : last ? '★' : '★★';
    case 'flags': return first ? '🚩' : last ? '🏴' : '🏳️';
    default: return '●';
  }
}

function resolveZone(value: number, zones: IndicatorZone[]): { zone: IndicatorZone; index: number } | null {
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.isCatchAll) return { zone: z, index: i };
    if (z.threshold !== undefined && value >= z.threshold) return { zone: z, index: i };
  }
  return zones.length > 0 ? { zone: zones[zones.length - 1], index: zones.length - 1 } : null;
}


// ─── Draft Rule state ───────────────────────────────────────────────────────────

interface DraftRule {
  name: string;
  criteria: Criterion[];
  vizType: VisualizationType;
  zones: IndicatorZone[];
  iconStyle: 'trafficLights' | 'arrows' | 'stars' | 'flags' | 'custom';
  barMin: string;
  barMax: string;
  showValue: boolean;
  barDirection: 'leftToRight' | 'rightToLeft';
  color: string;
  fontWeight: 'normal' | 'bold';
  condType: ConditionType;
  condValue: string;
  condValue2: string;
  condN: string;
  condFormula: string;
  previewValue: string;
  // Calculation (createColumns mode)
  formulaExpression: string;
  resultUnit: 'percent' | 'number' | 'ratio';
  // Evaluate-on basis
  evalBasis: import('../types/conditionalFormatting').EvalBasis;
  evalBasisFormula: string;
  // Zone color scale
  colorScaleId: string;
  colorScaleDirection: 'normal' | 'reversed';
}

function makeDefaultDraft(): DraftRule {
  const defaultScaleId = 'greenRed';
  return {
    name: '', criteria: [], vizType: 'colorScale',
    zones: applyScaleToZones(makeDefaultZones(), defaultScaleId),
    iconStyle: 'trafficLights',
    barMin: '0', barMax: '100', showValue: true, barDirection: 'leftToRight',
    color: '#3B82F6', fontWeight: 'normal',
    condType: 'greaterThan', condValue: '0', condValue2: '0', condN: '5', condFormula: '',
    previewValue: '10',
    formulaExpression: '', resultUnit: 'percent',
    evalBasis: 'cellValue', evalBasisFormula: '',
    colorScaleId: defaultScaleId,
    colorScaleDirection: 'normal',
  };
}

function ruleToDraft(rule: ConditionalFormattingRule, measures: MeasureData[]): DraftRule {
  const v = rule.visualization;
  // When admin restricted a scope field, ensure those values show pre-selected in the editor.
  // If the rule's own target is empty for a field that adminTarget restricts, seed from adminTarget.
  const adminTgt = rule.adminTarget;
  const effectiveTarget: import('../types/conditionalFormatting').RuleTarget = adminTgt ? {
    measureIds: rule.target.measureIds.length > 0 ? rule.target.measureIds : adminTgt.measureIds,
    dimensionLevels: rule.target.dimensionLevels.length > 0 ? rule.target.dimensionLevels : adminTgt.dimensionLevels,
    timeKeys: rule.target.timeKeys.length > 0 ? rule.target.timeKeys : adminTgt.timeKeys,
    cellKeys: rule.target.cellKeys,
  } : rule.target;
  return {
    name: rule.name,
    criteria: rule.target.cellKeys?.length ? [] : targetToCriteria(effectiveTarget, measures),
    vizType: v.type,
    zones: v.zones ? v.zones.map(z => ({ ...z })) : makeDefaultZones(),
    iconStyle: v.iconStyle ?? 'trafficLights',
    barMin: String(v.barMin ?? 0),
    barMax: String(v.barMax ?? 100),
    showValue: v.showValue ?? true,
    barDirection: v.barDirection ?? 'leftToRight',
    color: v.color ?? '#3B82F6',
    fontWeight: v.fontWeight ?? 'normal',
    condType: rule.condition.type,
    condValue: String(rule.condition.value ?? 0),
    condValue2: String(rule.condition.value2 ?? 0),
    condN: String(rule.condition.n ?? 5),
    condFormula: rule.condition.formula ?? '',
    previewValue: '10',
    formulaExpression: v.formulaExpression ?? '',
    resultUnit: v.resultUnit ?? 'percent',
    evalBasis: v.evalBasis ?? 'cellValue',
    evalBasisFormula: v.evalBasisFormula ?? '',
    colorScaleId: 'custom', // existing rules loaded as custom (keep user-set colors)
    colorScaleDirection: 'normal',
  };
}

function draftToRule(
  draft: DraftRule,
  existingRule: ConditionalFormattingRule | null,
  mode: IndicatorMode,
  measures: MeasureData[],
  prefillCellKeys: string[] = [],
  scopeMode: 'manual' | 'automatic' = 'automatic',
): ConditionalFormattingRule {
  const now = new Date();
  const id = existingRule?.id ?? `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const isZoneBased = ZONE_BASED.includes(draft.vizType);

  const fallbackTarget = existingRule?.target ?? { measureIds: [], dimensionLevels: [], timeKeys: [] };
  const derivedTargetFromCriteria = draft.criteria.length > 0
    ? criteriaToTarget(draft.criteria, measures)
    : fallbackTarget;

  // Constrain user's selections to the admin-defined scope. If admin restricted a field to
  // specific values, the user can only pick a subset (never widen beyond admin's definition).
  const constrainToAdmin = (userIds: string[], adminIds: string[]): string[] => {
    if (adminIds.length === 0) return userIds; // Admin allows all; user can narrow freely
    if (userIds.length === 0) return adminIds; // User cleared selection → keep admin's restriction
    return userIds.filter(id => adminIds.includes(id));
  };
  const adminTgt = existingRule?.adminTarget;
  const constrainedTarget: RuleTarget = adminTgt ? {
    measureIds: constrainToAdmin(derivedTargetFromCriteria.measureIds, adminTgt.measureIds),
    dimensionLevels: constrainToAdmin(derivedTargetFromCriteria.dimensionLevels, adminTgt.dimensionLevels),
    timeKeys: constrainToAdmin(derivedTargetFromCriteria.timeKeys, adminTgt.timeKeys),
  } : derivedTargetFromCriteria;

  const selectedCellKeys = prefillCellKeys.length > 0
    ? [...prefillCellKeys]
    : (existingRule?.target?.cellKeys ? [...existingRule.target.cellKeys] : []);
  const target: RuleTarget = scopeMode === 'manual' && selectedCellKeys.length > 0
    ? { ...constrainedTarget, cellKeys: selectedCellKeys }
    : { ...constrainedTarget, cellKeys: undefined };

  const visualization: VisualizationConfig = {
    type: draft.vizType,
    // Persist the evaluate-on basis (default cellValue is omitted to keep JSON tidy)
    ...(draft.evalBasis !== 'cellValue' && { evalBasis: draft.evalBasis }),
    ...(draft.evalBasis === 'custom' && draft.evalBasisFormula.trim() && {
      evalBasisFormula: draft.evalBasisFormula.trim(),
    }),
    ...(isZoneBased && {
      zones: draft.zones,
      ...(draft.vizType === 'iconSet'  && { iconStyle: draft.iconStyle }),
      ...(draft.vizType === 'dataBar'  && {
        barMin: parseFloat(draft.barMin) || 0,
        barMax: parseFloat(draft.barMax) || 100,
        showValue: draft.showValue,
        barDirection: draft.barDirection,
      }),
    }),
    ...(!isZoneBased && {
      color: draft.color,
      ...(draft.vizType === 'font' && { fontWeight: draft.fontWeight }),
    }),
    ...(mode === 'createColumns' && draft.formulaExpression.trim() && {
      formulaExpression: draft.formulaExpression.trim(),
      resultUnit: draft.resultUnit,
    }),
  };

  const condition: RuleCondition = isZoneBased
    ? { type: 'greaterThan', value: -1e15 }
    : {
        type: draft.condType,
        value: parseFloat(draft.condValue) || 0,
        value2: parseFloat(draft.condValue2) || 0,
        n: parseInt(draft.condN) || 5,
        formula: draft.condFormula,
      };

  return {
    id, name: draft.name.trim() || 'Untitled Rule',
    isActive: existingRule?.isActive ?? true,
    priority: existingRule?.priority ?? 999,
    mode, target,
    ...(adminTgt ? { adminTarget: adminTgt } : {}),
    condition, visualization,
    createdAt: existingRule?.createdAt ?? now,
    updatedAt: now,
  };
}



function getRuleScopeSummary(target: RuleTarget, measures: MeasureData[]): string {
  const measureNames = target.measureIds
    .map(id => measures.find(m => m.id === id)?.name)
    .filter(Boolean) as string[];
  const measureLabel = measureNames.length === 0
    ? 'All metrics'
    : measureNames.join(', ');

  const dimensionLabel = target.dimensionLevels.length === 0
    ? 'All dimensions'
    : `${target.dimensionLevels.length} dimension${target.dimensionLevels.length === 1 ? '' : 's'}`;

  return `${measureLabel} · ${dimensionLabel}`;
}

// ─── Inline MultiSelect ─────────────────────────────────────────────────────────

const InlineMultiSelect: React.FC<{
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  singleSelect?: boolean;
}> = ({ options, values, onChange, placeholder = 'Select…', singleSelect = false }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (v: string) => {
    if (singleSelect) { onChange([v]); setOpen(false); }
    else onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  };

  const label = values.length === 0 ? placeholder : values.length === 1 ? values[0] : `${values.length} selected`;

  return (
    <div className="cf-ims-root" ref={ref}>
      <button type="button" className={`cf-ims-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className="cf-ims-label">{label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <div className="cf-ims-dropdown">
          {options.map(opt => (
            <label key={opt} className={`cf-ims-option ${values.includes(opt) ? 'checked' : ''}`}>
              {!singleSelect && (
                <input type="checkbox" checked={values.includes(opt)} onChange={() => toggle(opt)} />
              )}
              <span>{opt}</span>
              {singleSelect && values.includes(opt) && <span className="cf-ims-check">✓</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};


// ─── Formula Editor ─────────────────────────────────────────────────────────────

const TOKEN_RE = /(\{[^}]*\})/g;

function renderHighlighted(formula: string): React.ReactNode[] {
  const parts = formula.split(TOKEN_RE);
  const nodes: React.ReactNode[] = parts.map((part, i) =>
    TOKEN_RE.test(part)
      ? <mark key={i} className="cf-fml-token">{part}</mark>
      : <span key={i}>{part}</span>
  );
  // trailing newline prevents scroll jump between textarea and highlight div
  nodes.push('\n');
  TOKEN_RE.lastIndex = 0;
  return nodes;
}

const InsertMenu: React.FC<{
  label: string;
  items: { label: string; token: string; group?: string }[];
  onInsert: (token: string) => void;
}> = ({ label, items, onInsert }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="cf-insert-menu" ref={ref}>
      <button type="button" className={`cf-insert-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}>
        {label}
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <div className="cf-insert-dropdown">
          {items.map((item, i) => {
            const showGroup = item.group && (i === 0 || items[i - 1].group !== item.group);
            return (
              <React.Fragment key={i}>
                {showGroup && <div className="cf-insert-group">{item.group}</div>}
                <button
                  type="button"
                  className="cf-insert-option"
                  onMouseDown={e => { e.preventDefault(); onInsert(item.token); setOpen(false); }}
                >
                  {item.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Formula Library Dropdown ────────────────────────────────────────────────────

const FormulaLibraryDropdown: React.FC<{
  firstMeasure: string;
  onSelect: (formula: string, unit: 'percent' | 'number' | 'ratio') => void;
}> = ({ firstMeasure, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    setTimeout(() => inputRef.current?.focus(), 50);
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = FORMULA_TEMPLATES.filter(t =>
    t.label.toLowerCase().includes(query.toLowerCase()) ||
    t.description.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="cf-flib-root" ref={ref}>
      <button
        type="button"
        className={`cf-flib-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="cf-flib-trigger-label">Formula library</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div className="cf-flib-dropdown">
          <div className="cf-flib-search-row">
            <svg className="cf-flib-search-icon" viewBox="0 0 16 16" fill="none" width="13" height="13">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="cf-flib-search-input"
              placeholder="Search formulas…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setOpen(false)}
            />
          </div>

          <div className="cf-flib-list">
            {filtered.length === 0 && (
              <div className="cf-flib-empty">No formulas match "{query}"</div>
            )}
            {filtered.map(t => (
              <button
                key={t.label}
                type="button"
                className="cf-flib-option"
                onMouseDown={e => {
                  e.preventDefault();
                  onSelect(t.formula(firstMeasure), t.unit);
                  setOpen(false);
                }}
              >
                <span className="cf-flib-option-label">{t.label}</span>
                <span className="cf-flib-option-desc">{t.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const FormulaEditor: React.FC<{
  formula: string;
  resultUnit: 'percent' | 'number' | 'ratio';
  availableMeasures: MeasureData[];
  onChange: (formula: string) => void;
  onResultUnitChange: (unit: 'percent' | 'number' | 'ratio') => void;
}> = ({ formula, resultUnit, availableMeasures, onChange, onResultUnitChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = (token: string) => {
    const el = textareaRef.current;
    if (!el) { onChange(formula + token); return; }
    const start = el.selectionStart ?? formula.length;
    const end   = el.selectionEnd   ?? formula.length;
    const next  = formula.slice(0, start) + token + formula.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  // Build measure menu — current value + time-shifted + budget + stats for first measure only
  // (keeps menu short; user can type additional measure names)
  const allMeasures = availableMeasures.length ? availableMeasures : [{ id: 'rev', name: 'Revenue' }];
  const measureItems = [
    ...allMeasures.map(m => ({ label: `{${m.name}}`, token: `{${m.name}}`, group: 'Current value' })),
    ...allMeasures.slice(0, 2).flatMap(m => [
      { label: `{${m.name}[-1Y]}  1 year ago`,    token: `{${m.name}[-1Y]}`,    group: 'Time-shifted' },
      { label: `{${m.name}[-1Q]}  1 quarter ago`, token: `{${m.name}[-1Q]}`,    group: 'Time-shifted' },
      { label: `{${m.name}[-1M]}  1 month ago`,   token: `{${m.name}[-1M]}`,    group: 'Time-shifted' },
    ]),
    ...allMeasures.slice(0, 2).map(m => ({ label: `{${m.name}[budget]}`, token: `{${m.name}[budget]}`, group: 'Target / Budget' })),
    ...allMeasures.slice(0, 2).flatMap(m => [
      { label: `{AVG(${m.name})}  avg`, token: `{AVG(${m.name})}`, group: 'Statistical' },
      { label: `{MAX(${m.name})}  max`, token: `{MAX(${m.name})}`, group: 'Statistical' },
    ]),
  ];

  // Validate: non-empty + balanced braces
  const braceOpen  = (formula.match(/\{/g) ?? []).length;
  const braceClose = (formula.match(/\}/g) ?? []).length;
  const isValid   = formula.trim().length > 0 && braceOpen === braceClose;
  const validMsg  = !formula.trim() ? '' : isValid ? '✓ Valid' : '⚠ Unmatched { }';

  const firstName = allMeasures[0].name;

  return (
    <div className="cf-formula-editor">
      {/* Formula Library — above the expression field */}
      <div className="cf-fml-field-group">
        <label className="cf-fml-field-label">Formula library</label>
        <FormulaLibraryDropdown
          firstMeasure={firstName}
          onSelect={(f, u) => { onChange(f); onResultUnitChange(u); }}
        />
      </div>

      {/* Expression field */}
      <div className="cf-fml-field-group">
        <label className="cf-fml-field-label">Expression</label>
        {/* Insert variable row — below the label */}
        <div className="cf-insert-row">
          <span className="cf-insert-lbl">Insert</span>
          <InsertMenu label="Measure ▾"     items={measureItems}      onInsert={insertAtCursor} />
          <InsertMenu label="Time offset ▾" items={TIME_OFFSET_ITEMS.map(x => ({ ...x }))} onInsert={insertAtCursor} />
          <InsertMenu label="Fn ▾"          items={FN_ITEMS.map(x => ({ ...x }))}           onInsert={insertAtCursor} />
        </div>
        <div className="cf-fml-wrap">
          <div className="cf-fml-highlight" aria-hidden="true">
            {renderHighlighted(formula)}
          </div>
          <textarea
            ref={textareaRef}
            className="cf-fml-ta"
            value={formula}
            onChange={e => onChange(e.target.value)}
            placeholder={'e.g. ({Revenue} - {Revenue[-1Y]}) / {Revenue[-1Y]} * 100'}
            rows={3}
            spellCheck={false}
          />
        </div>
        {/* Validation */}
        {formula.trim() && (
          <span className={`cf-fml-valid ${isValid ? 'ok' : 'err'}`}>{validMsg}</span>
        )}
      </div>

      {/* Result unit — simple select */}
      <div className="cf-fml-field-group">
        <label className="cf-fml-field-label">Result unit</label>
        <select
          className="cf-editor-select"
          value={resultUnit}
          onChange={e => onResultUnitChange(e.target.value as 'percent' | 'number' | 'ratio')}
        >
          <option value="percent">Percent (%)</option>
          <option value="number">Number</option>
          <option value="ratio">Ratio (×)</option>
        </select>
      </div>
    </div>
  );
};

// ─── Zone Builder ───────────────────────────────────────────────────────────────

/* ── SLDS Color Picker ─────────────────────────────────────────────────── */
const SLDS_PALETTE: string[][] = [
  ['#fce4ec','#fce8d5','#fffde7','#e8f5e9','#e0f7fa','#ede7f6','#f3e5f5'],
  ['#ffcdd2','#ffe0cc','#fff9b0','#c8e6c9','#b2ebf2','#d1c4e9','#e1bee7'],
  ['#ffb3ba','#ffcc99','#fff176','#a5d6a7','#80deea','#b39ddb','#ce93d8'],
  ['#f48fb1','#ffab76','#ffe066','#81c784','#4dd0e1','#9575cd','#ba68c8'],
];

const CUSTOM_ICON_DEFAULTS = ['🔥', '⭐', '👍', '-'];
const EMOJI_PRESETS: string[] = ['😀', '🙂', '😐', '😕', '😟', '😢', '😡', '🔥', '⚠️', '✅', '⭐', '🚩', '⬆️', '➡️', '⬇️'];

const SldsColorPicker: React.FC<{ value: string; onChange: (c: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setHex(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const commit = (c: string) => { onChange(c); setHex(c); setOpen(false); };

  const handleHexInput = (v: string) => {
    setHex(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
  };

  return (
    <div className="slds-cp-wrap" ref={ref}>
      <div
        role="button"
        tabIndex={0}
        className="slds-cp-trigger"
        style={{ backgroundColor: value }}
        onClick={() => setOpen(p => !p)}
        onKeyDown={e => e.key === 'Enter' && setOpen(p => !p)}
        title="Pick color"
        aria-label="Pick color"
      />
      {open && (
        <div className="slds-cp-popover">
          <div className="slds-cp-palette">
            {SLDS_PALETTE.map((row, ri) => (
              <div key={ri} className="slds-cp-row">
                {row.map(c => (
                  <div
                    key={c}
                    role="button"
                    tabIndex={0}
                    className={`slds-cp-swatch${value === c ? ' slds-cp-swatch--selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => commit(c)}
                    onKeyDown={e => e.key === 'Enter' && commit(c)}
                    title={c}
                    aria-label={c}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="slds-cp-hex-row">
            <span className="slds-cp-hex-hash">#</span>
            <input
              className="slds-cp-hex-input"
              value={hex.replace(/^#/, '')}
              maxLength={6}
              onChange={e => handleHexInput('#' + e.target.value)}
              placeholder="000000"
              spellCheck={false}
            />
            <div className="slds-cp-hex-preview" style={{ background: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : 'transparent' }} />
          </div>
        </div>
      )}
    </div>
  );
};

const EmojiPicker: React.FC<{ value: string; onChange: (emoji: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value || '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(value || ''); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="cf-emoji-wrap" ref={ref}>
      <button
        type="button"
        className="cf-emoji-trigger"
        onClick={() => setOpen(v => !v)}
        title="Pick emoji"
      >
        {value?.trim() || '🙂'}
      </button>
      {open && (
        <div className="cf-emoji-pop">
          <div className="cf-emoji-grid">
            {EMOJI_PRESETS.map(em => (
              <button
                key={em}
                type="button"
                className={`cf-emoji-swatch${value === em ? ' active' : ''}`}
                onClick={() => { onChange(em); setOpen(false); }}
              >
                {em}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="cf-emoji-input"
            value={input}
            placeholder="Type emoji"
            onChange={e => {
              const v = e.target.value;
              setInput(v);
              onChange(v);
            }}
          />
        </div>
      )}
    </div>
  );
};



const ZoneBuilder: React.FC<{
  zones: IndicatorZone[];
  iconStyle: string;
  showIcons: boolean;
  onChange: (zones: IndicatorZone[]) => void;
  unit?: string;
}> = ({ zones, iconStyle, showIcons, onChange, unit = '' }) => {
  const update = (id: string, patch: Partial<IndicatorZone>) =>
    onChange(zones.map(z => z.id === id ? { ...z, ...patch } : z));

  const remove = (id: string) => {
    if (zones.length <= 2) return;
    onChange(zones.filter(z => z.id !== id));
  };

  const add = () => {
    const catchIdx = zones.findIndex(z => z.isCatchAll);
    const at = catchIdx >= 0 ? catchIdx : zones.length - 1;
    const nonCatch = zones.filter(z => !z.isCatchAll && z.threshold !== undefined);
    const firstThreshold = nonCatch[0]?.threshold ?? 10;
    const secondThreshold = nonCatch[1]?.threshold;
    const inferredStep =
      secondThreshold !== undefined
        ? Math.max(1, Math.round(Math.abs(firstThreshold - secondThreshold)))
        : Math.max(1, Math.round(Math.abs(firstThreshold) * 0.2));
    const nextThreshold = Math.max(0, firstThreshold - inferredStep);
    const newZone: IndicatorZone = {
      id: `z-${Date.now()}`,
      threshold: nextThreshold,
      color: '#6366F1',
      icon: CUSTOM_ICON_DEFAULTS[Math.min(at, CUSTOM_ICON_DEFAULTS.length - 2)],
      label: 'Zone',
    };
    const next = [...zones];
    next.splice(at, 0, newZone);
    onChange(next);
  };

  return (
    <div className="cf-zone-builder">
      <div className="cf-zone-list">
        {zones.map((zone, idx) => (
          <div key={zone.id} className="cf-zone-row">
            {showIcons ? (
              iconStyle === 'custom' ? (
                <EmojiPicker
                  value={zone.icon ?? ''}
                  onChange={em => update(zone.id, { icon: em })}
                />
              ) : (
                <span className="cf-zone-icon-preview">{getZoneIcon(iconStyle, idx, zones.length, zone)}</span>
              )
            ) : (
              <SldsColorPicker
                value={zone.color}
                onChange={c => update(zone.id, { color: c })}
              />
            )}
            {zone.isCatchAll ? (
              <span className="cf-zone-catchall">everything else</span>
            ) : (
              <>
                <span className="cf-zone-op">≥</span>
                <input
                  type="number"
                  className="cf-zone-threshold"
                  value={zone.threshold ?? ''}
                  onChange={e => update(zone.id, { threshold: parseFloat(e.target.value) || 0 })}
                />
                {unit && <span className="cf-zone-unit">{unit}</span>}
              </>
            )}
            {!zone.isCatchAll && zones.length > 2 ? (
              <button type="button" className="cf-zone-remove" onClick={() => remove(zone.id)} title="Remove">
                <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                  <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            ) : (
              <span className="cf-zone-remove-placeholder" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
      <button type="button" className="cf-add-zone-btn" onClick={add}>+ Add zone</button>
    </div>
  );
};

// ─── Condition Row (single-condition viz) ───────────────────────────────────────

interface CondPatch {
  condType?: ConditionType; condValue?: string; condValue2?: string;
  condN?: string; condFormula?: string;
}

const ConditionRow: React.FC<{
  condType: ConditionType; condValue: string; condValue2: string;
  condN: string; condFormula: string;
  onChange: (patch: CondPatch) => void;
}> = ({ condType, condValue, condValue2, condN, condFormula, onChange }) => (
  <div className="cf-condition-row">
    <select
      className="cf-cond-type-sel"
      value={condType}
      onChange={e => onChange({ condType: e.target.value as ConditionType })}
    >
      {CONDITION_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
    </select>

    {(condType === 'greaterThan' || condType === 'lessThan' || condType === 'equals') && (
      <input type="number" className="cf-cond-val" value={condValue}
        onChange={e => onChange({ condValue: e.target.value })} placeholder="Value" />
    )}

    {condType === 'between' && (
      <>
        <input type="number" className="cf-cond-val" value={condValue}
          onChange={e => onChange({ condValue: e.target.value })} placeholder="Min" />
        <span className="cf-cond-and">–</span>
        <input type="number" className="cf-cond-val" value={condValue2}
          onChange={e => onChange({ condValue2: e.target.value })} placeholder="Max" />
      </>
    )}

    {(condType === 'topN' || condType === 'bottomN') && (
      <input type="number" className="cf-cond-n" value={condN} min={1}
        onChange={e => onChange({ condN: e.target.value })} placeholder="N" />
    )}

    {condType === 'formula' && (
      <div className="cf-formula-row">
        <span className="cf-formula-eq">=</span>
        <input type="text" className="cf-formula-input" value={condFormula}
          onChange={e => onChange({ condFormula: e.target.value })}
          placeholder="VALUE > 100000" />
      </div>
    )}
  </div>
);

// ─── Rule Editor ────────────────────────────────────────────────────────────────

const RuleEditor: React.FC<{
  existingRule: ConditionalFormattingRule | null;
  mode: IndicatorMode;
  availableMeasures: MeasureData[];
  prefillCellKeys?: string[];
  prefillCriteria?: Criterion[];
  onSave: (rule: ConditionalFormattingRule) => void;
  onPreview?: (rule: ConditionalFormattingRule) => void;
  onCancel: () => void;
}> = ({ existingRule, mode, availableMeasures, prefillCellKeys = [], prefillCriteria = [], onSave, onPreview, onCancel }) => {
  const [draft, setDraft] = useState<DraftRule>(
    existingRule
      ? ruleToDraft(existingRule, availableMeasures)
      : {
          ...makeDefaultDraft(),
          ...(mode === 'modifyCells' && prefillCriteria.length > 0 ? { criteria: prefillCriteria } : {}),
        }
  );
  const set = (patch: Partial<DraftRule>) => setDraft(d => ({ ...d, ...patch }));
  const scopeMode: 'automatic' = 'automatic';

  // ── Cell Scope helpers (admin-constrained subset selection) ──────────────────
  const adminTgt = existingRule?.adminTarget;

  // Options are constrained to what admin has allowed; empty adminTarget field = allow all
  const scopeMetricOpts: string[] = adminTgt?.measureIds?.length
    ? adminTgt.measureIds.map(id => availableMeasures.find(m => m.id === id)?.name).filter(Boolean) as string[]
    : availableMeasures.map(m => m.name);

  const scopeDimensionOpts: string[] = adminTgt?.dimensionLevels?.length
    ? adminTgt.dimensionLevels.map(d => DIM_ID_TO_LABEL[d]).filter(Boolean) as string[]
    : dimensionOptions.map(d => d.label);

  const scopeTimeOpts: string[] = adminTgt?.timeKeys?.length
    ? adminTgt.timeKeys.map(k => timeOptions.find(t => t.id === k)?.label).filter(Boolean) as string[]
    : timeOptions.map(t => t.label);

  // Current user selections derived from criteria (only "is any of" criteria)
  const scopeMetricVals = draft.criteria.find(c => c.field === 'Metric' && c.operator === 'is any of')?.values ?? [];
  const scopeDimensionVals = draft.criteria.find(c => c.field === 'Dimension' && c.operator === 'is any of')?.values ?? [];
  const scopeTimeVals = draft.criteria.find(c => c.field === 'Time Period' && c.operator === 'is any of')?.values ?? [];

  // From / To state for the time period range picker — initialised once from existing criteria
  const [scopeTimeFrom, setScopeTimeFrom] = useState(() => scopeTimeVals[0] ?? '');
  const [scopeTimeTo,   setScopeTimeTo]   = useState(() => scopeTimeVals[scopeTimeVals.length - 1] ?? '');

  const updateScopeField = (field: CriterionField, vals: string[]) =>
    set({
      criteria: [
        ...draft.criteria.filter(c => c.field !== field),
        ...(vals.length > 0 ? [{ id: `scope-${field.replace(' ', '-')}`, field, operator: 'is any of' as CriterionOperator, values: vals }] : []),
      ],
    });

  // Recompute the inclusive range when From / To change and push into criteria
  const applyTimeRange = (from: string, to: string) => {
    if (!from && !to) { updateScopeField('Time Period', []); return; }
    const fromIdx = from ? scopeTimeOpts.indexOf(from) : 0;
    const toIdx   = to   ? scopeTimeOpts.indexOf(to)   : scopeTimeOpts.length - 1;
    if (fromIdx < 0 || toIdx < 0) { updateScopeField('Time Period', []); return; }
    const start = Math.min(fromIdx, toIdx);
    const end   = Math.max(fromIdx, toIdx);
    updateScopeField('Time Period', scopeTimeOpts.slice(start, end + 1));
  };

  const handleTimeFrom = (val: string) => { setScopeTimeFrom(val); applyTimeRange(val, scopeTimeTo); };
  const handleTimeTo   = (val: string) => { setScopeTimeTo(val);   applyTimeRange(scopeTimeFrom, val); };

  const isZoneBased = ZONE_BASED.includes(draft.vizType);

  // Criteria handlers
  const addCriterion = () => set({
    criteria: [...draft.criteria, { id: `c-${Date.now()}`, field: 'Metric', operator: 'is any of', values: [] }],
  });


  const evalBasisLabel: Record<string, string> = {
    variance: 'Variance',
    mom: 'MoM %',
    yoy: 'YoY %',
    targetAchievement: 'Target Achievement %',
    pctOfColumnTotal: '% of Column Total',
    pctRankByType: 'Concentration Rank',
    custom: 'Custom Formula',
    cellValue: 'Cell Value',
  };

  const evalBasisFormulas: Record<string, string> = {
    variance: '((value − yearly_avg) / |yearly_avg|) × 100',
    yoy: '((value − prior_year) / |prior_year|) × 100',
    mom: '((value − prior_month) / |prior_month|) × 100',
    targetAchievement: '(actual / target) × 100',
    pctOfColumnTotal: '(cell value / sum of itself + sibling values in column) × 100',
    costShare: "(cell's cost ÷ total cost of peer group) × 100",
    pctRankByType: 'percentile rank among same-dimension peers (0 = lowest, 100 = highest)',
    cellValue: 'value',
  };

  return (
    <div className="cf-rule-editor">
      {/* Calculation — only for createColumns */}
      {mode === 'createColumns' && (
        <div className="cf-editor-sect">
          <label className="cf-editor-lbl">Calculation</label>
          <FormulaEditor
            formula={draft.formulaExpression}
            resultUnit={draft.resultUnit}
            availableMeasures={availableMeasures}
            onChange={v => set({ formulaExpression: v })}
            onResultUnitChange={v => set({ resultUnit: v })}
          />
        </div>
      )}

      {/* 1. Formula — shown at top for modifyCells */}
      {mode === 'modifyCells' && (
        <div className="cf-editor-sect cf-editor-sect--tight">
          <label className="cf-editor-lbl">Formula</label>
          {evalBasisFormulas[draft.evalBasis] && (
            <div className="cf-formula-expr">{evalBasisFormulas[draft.evalBasis]}</div>
          )}
          {draft.evalBasis === 'custom' && (
            <input
              type="text"
              className="cf-editor-input cf-eval-formula-in"
              value={draft.evalBasisFormula}
              onChange={e => set({ evalBasisFormula: e.target.value })}
              placeholder="e.g. ({value} / {target}) * 100"
              style={{ marginTop: 6 }}
            />
          )}
        </div>
      )}

      {/* ── Zone-based viz config ── */}
      {isZoneBased && (
        <>
          {draft.vizType === 'iconSet' && existingRule?.id !== 'preset-target-achievement-rule' && existingRule?.id !== 'preset-trend-direction-rule' && (
            <div className="cf-editor-sect">
              <label className="cf-editor-lbl">Icon Style</label>
              <select
                className="cf-editor-select"
                value={draft.iconStyle}
                onChange={e => {
                  const nextStyle = e.target.value as DraftRule['iconStyle'];
                  if (nextStyle === 'custom') {
                    set({
                      iconStyle: nextStyle,
                      zones: draft.zones.map((z, i) => ({
                        ...z,
                        icon: z.icon?.trim() || CUSTOM_ICON_DEFAULTS[Math.min(i, CUSTOM_ICON_DEFAULTS.length - 1)],
                      })),
                    });
                  } else {
                    set({ iconStyle: nextStyle });
                  }
                }}
              >
                {ICON_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}

          {(draft.vizType === 'dataBar' || draft.vizType === 'divergingBar') && draft.evalBasis !== 'costShare' && (
            <div className="cf-editor-sect">
              <label className="cf-editor-lbl">Bar Range</label>
              {draft.vizType === 'divergingBar' && (
                <p className="cf-editor-hint">Diverging bar extends left for negative, right for positive values. Midpoint is 0.</p>
              )}
              <div className="cf-editor-row">
                <span className="cf-row-lbl">{draft.vizType === 'divergingBar' ? 'Min %' : 'Min'}</span>
                <input type="number" className="cf-editor-input cf-range-in"
                  value={draft.barMin} onChange={e => set({ barMin: e.target.value })} />
                <span className="cf-row-lbl">{draft.vizType === 'divergingBar' ? 'Max %' : 'Max'}</span>
                <input type="number" className="cf-editor-input cf-range-in"
                  value={draft.barMax} onChange={e => set({ barMax: e.target.value })} />
              </div>
              {draft.vizType === 'dataBar' && (
                <div className="cf-editor-row cf-bar-opts">
                  <label className="cf-chk-label">
                    <input type="checkbox" checked={draft.showValue}
                      onChange={e => set({ showValue: e.target.checked })} />
                    Show value
                  </label>
                  <select className="cf-editor-select cf-dir-sel" value={draft.barDirection}
                    onChange={e => set({ barDirection: e.target.value as DraftRule['barDirection'] })}>
                    <option value="leftToRight">Left → Right</option>
                    <option value="rightToLeft">Right → Left</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {draft.evalBasis !== 'costShare' && (
            <div className="cf-editor-sect">
              <div className="cf-editor-sect-hdr">
                <label className="cf-editor-lbl">Legend</label>
              </div>
              <ZoneBuilder
                zones={draft.zones}
                iconStyle={draft.iconStyle}
                showIcons={draft.vizType === 'iconSet'}
                unit={['variance', 'mom', 'yoy', 'targetAchievement', 'pctOfColumnTotal', 'pctRankByType'].includes(draft.evalBasis) ? '%' : ''}
                onChange={zones => {
                  const sameCount = zones.length === draft.zones.length;
                  const colorsChanged = zones.some((z, i) => z.color !== draft.zones[i]?.color);
                  if (!sameCount && draft.colorScaleId !== 'custom') {
                    set({ zones: applyScaleToZones(zones, draft.colorScaleId, draft.colorScaleDirection) });
                  } else if (sameCount && colorsChanged) {
                    set({ zones, colorScaleId: 'custom' });
                  } else {
                    set({ zones });
                  }
                }}
              />
            </div>
          )}
        </>
      )}

      {/* 3. Cell Scope — fixed subset-selector rows (constrained to admin's defined scope) */}
      {mode === 'modifyCells' && (
        <div className="cf-editor-sect">
          <div className="cf-editor-sect-hdr">
            <label className="cf-editor-lbl">Rule Scope</label>
          </div>
          <div className="cf-scope-rows">
            <div className="cf-scope-row">
              <span className="cf-scope-field-lbl">Metric</span>
              <InlineMultiSelect
                options={scopeMetricOpts}
                values={scopeMetricVals}
                onChange={vals => updateScopeField('Metric', vals)}
                placeholder="All metrics"
              />
            </div>
            <div className="cf-scope-row">
              <span className="cf-scope-field-lbl">Dimension</span>
              <InlineMultiSelect
                options={scopeDimensionOpts}
                values={scopeDimensionVals}
                onChange={vals => updateScopeField('Dimension', vals)}
                placeholder="All dimensions"
              />
            </div>
            <div className="cf-scope-row">
              <span className="cf-scope-field-lbl">Time Period</span>
              <div className="cf-scope-time-range">
                <select
                  className="cf-scope-time-sel"
                  value={scopeTimeFrom}
                  onChange={e => handleTimeFrom(e.target.value)}
                >
                  <option value="">Any</option>
                  {scopeTimeOpts.map(label => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
                <span className="cf-scope-time-arrow">→</span>
                <select
                  className="cf-scope-time-sel"
                  value={scopeTimeTo}
                  onChange={e => handleTimeTo(e.target.value)}
                >
                  <option value="">Any</option>
                  {scopeTimeOpts.map(label => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Single-condition viz config ── */}
      {!isZoneBased && (
        <div className="cf-editor-sect">
          <div className="cf-editor-row cf-color-row">
            <label className="cf-editor-lbl cf-color-lbl">Color</label>
            <div className="cf-color-wrap">
              <input type="color" className="cf-color-swatch" value={draft.color}
                onChange={e => set({ color: e.target.value })} />
              <span className="cf-color-hex">{draft.color}</span>
            </div>
            {draft.vizType === 'font' && (
              <label className="cf-chk-label cf-bold-chk">
                <input type="checkbox" checked={draft.fontWeight === 'bold'}
                  onChange={e => set({ fontWeight: e.target.checked ? 'bold' : 'normal' })} />
                Bold
              </label>
            )}
          </div>

          <label className="cf-editor-lbl cf-apply-lbl">Apply when</label>
          <ConditionRow
            condType={draft.condType} condValue={draft.condValue}
            condValue2={draft.condValue2} condN={draft.condN} condFormula={draft.condFormula}
            onChange={patch => set(patch)}
          />
        </div>
      )}

      {/* Footer */}
      <div className="cf-editor-footer">
        <button type="button" className="cf-editor-cancel-btn" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="cf-editor-preview-btn"
          onClick={() => onPreview?.(draftToRule(draft, existingRule, mode, availableMeasures, prefillCellKeys, scopeMode))}
        >
          Preview
        </button>
        <button type="button" className="cf-editor-save-btn"
          onClick={() => onSave(draftToRule(draft, existingRule, mode, availableMeasures, prefillCellKeys, scopeMode))}>
          Save Changes
        </button>
      </div>
    </div>
  );
};

// ─── Admin Rule Detail (read-only expanded view) ─────────────────────────────

// ─── Shared bar preview renderer (pixel-identical to grid sub-columns) ──────────

function renderBarPreview(
  vizType: 'dataBar' | 'divergingBar',
  value: number,
  barMin: number,
  barMax: number,
  zones: IndicatorZone[] = [],
): React.ReactNode {
  if (vizType === 'divergingBar') {
    const maxRange = Math.max(Math.abs(barMin), Math.abs(barMax), 0.01);
    const isPositive = value >= 0;
    const barPct = Math.min((Math.abs(value) / maxRange) * 50, 50);
    const labelColor = isPositive
      ? 'var(--slds-g-color-palette-green-60)'
      : 'var(--slds-g-color-palette-red-40)';
    const gradient = isPositive
      ? 'linear-gradient(90deg, var(--slds-g-color-palette-green-60), var(--slds-g-color-palette-green-80))'
      : 'linear-gradient(270deg, var(--slds-g-color-palette-red-40), var(--slds-g-color-palette-red-60))';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px' }}>
        <div style={{ flex: '1 1 0px', height: '8px', background: 'var(--slds-g-color-surface-container-2)', borderRadius: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: '50%', top: '-1px', width: '2px', height: 'calc(100% + 2px)', background: '#888', transform: 'translateX(-50%)', zIndex: 3 }} />
          <div style={{
            position: 'absolute', top: 0, height: '100%',
            left: isPositive ? '50%' : `${50 - barPct}%`,
            width: `${barPct}%`,
            background: gradient,
            borderRadius: isPositive ? '0 20px 20px 0' : '20px 0 0 20px',
            zIndex: 2,
            minWidth: value !== 0 ? '2px' : '0',
          }} />
        </div>
        <span style={{ fontSize: '13px', fontWeight: 600, color: labelColor, whiteSpace: 'nowrap', minWidth: '38px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', lineHeight: '18px', flexShrink: 0 }}>
          {value >= 0 ? '+' : ''}{value.toFixed(0)}%
        </span>
      </div>
    );
  }
  // dataBar — use configured zones for segment boundaries + active color
  const safeMin = Math.min(barMin, barMax);
  const safeMax = Math.max(barMin, barMax);
  const range = Math.max(0.0001, safeMax - safeMin);
  const pct = (n: number) => Math.max(0, Math.min(100, ((n - safeMin) / range) * 100));
  const clampedValue = Math.max(safeMin, Math.min(value, safeMax));
  const fillPct = pct(clampedValue);

  const nonCatchThresholds = zones
    .filter(z => !z.isCatchAll && z.threshold !== undefined)
    .map(z => z.threshold as number)
    .filter(t => t > safeMin && t < safeMax)
    .sort((a, b) => a - b);
  const boundaries = [safeMin, ...nonCatchThresholds, safeMax];
  const zoneBackground = boundaries.length > 1
    ? boundaries.slice(0, -1).map((start, i) => {
        const end = boundaries[i + 1];
        const mid = start + (end - start) / 2;
        const zoneAtMid = resolveZone(mid, zones)?.zone;
        const color = zoneAtMid?.color ?? 'var(--slds-g-color-neutral-base-90)';
        return `${color}22 ${pct(start)}%, ${color}22 ${pct(end)}%`;
      }).join(', ')
    : 'var(--slds-g-color-neutral-base-90)';

  const resolved = resolveZone(value, zones);
  const activeColor = resolved?.zone.color ?? SLDS_HEX.paletteGreen60;
  const labelColor = activeColor;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px' }}>
      <div style={{ flex: '1 1 0px', height: '10px', background: `linear-gradient(90deg, ${zoneBackground})`, borderRadius: '999px', position: 'relative', overflow: 'hidden', border: '1px solid rgba(71, 85, 105, 0.18)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.32)' }}>
        {nonCatchThresholds.map((t, idx) => (
          <div
            key={`${t}-${idx}`}
            style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(t)}%`, width: '1px', background: 'rgba(71, 85, 105, 0.25)', transform: 'translateX(-0.5px)' }}
          />
        ))}
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${fillPct}%`, background: `linear-gradient(90deg, ${activeColor}CC, ${activeColor})`, borderRadius: '999px' }} />
        {safeMax >= 100 && safeMin <= 100 && (
          <div style={{ position: 'absolute', left: `${pct(100)}%`, top: '-2px', width: '2px', height: '14px', background: '#475569', transform: 'translateX(-1px)', opacity: 0.9 }} />
        )}
      </div>
      <span style={{ fontSize: '13px', fontWeight: 600, color: labelColor, whiteSpace: 'nowrap', minWidth: '46px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', lineHeight: '18px', flexShrink: 0 }}>
        {Math.round(value)}%
      </span>
    </div>
  );
}

const VIZ_LABEL: Partial<Record<VisualizationType, string>> = {
  divergingBar: 'Diverging Bar',
  dataBar:      'Data Bar',
  iconSet:      'Icon Set',
  colorScale:   'Color Scale',
  background:   'Background',
  font:         'Font Style',
  border:       'Border',
};

const AdminRuleDetail: React.FC<{ rule: ConditionalFormattingRule }> = ({ rule }) => {
  const viz = rule.visualization;
  const zones = viz.zones ?? [];
  const vizLabel = VIZ_LABEL[viz.type] ?? viz.type;
  const unitSuffix = viz.resultUnit === 'percent' ? '%' : viz.resultUnit === 'ratio' ? '×' : '';

  // Default test value based on viz type
  const defaultTestVal = viz.type === 'dataBar' ? '95' : '12';
  const [testVal, setTestVal] = React.useState(defaultTestVal);
  const testNum = parseFloat(testVal) || 0;

  const renderPreview = () =>
    (viz.type === 'divergingBar' || viz.type === 'dataBar')
      ? renderBarPreview(
          viz.type,
          testNum,
          viz.barMin ?? (viz.type === 'divergingBar' ? -50 : 0),
          viz.barMax ?? (viz.type === 'divergingBar' ? 50 : 120),
          viz.zones ?? [],
        )
      : null;

  return (
    <div className="cf-admin-detail">
      <div className="cf-admin-detail-read-only-badge">
        <svg viewBox="0 0 24 24" fill="none" width="11" height="11">
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
          <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        Read-only — managed by Admin
      </div>

      {/* Visualization type + formula */}
      <div className="cf-admin-detail-row">
        <span className="cf-admin-detail-lbl">Visualization</span>
        <span className="cf-admin-detail-val">{vizLabel}</span>
      </div>

      {viz.formulaExpression && (
        <div className="cf-admin-detail-row cf-admin-detail-formula-row">
          <span className="cf-admin-detail-lbl">Formula</span>
          <code className="cf-admin-detail-formula">{viz.formulaExpression}</code>
        </div>
      )}

      {/* Zones legend */}
      {zones.length > 0 && (
        <div className="cf-admin-detail-zones-sect">
          <span className="cf-admin-detail-lbl">Color zones</span>
          <div className="cf-admin-detail-zones">
            {zones.map((z, i) => (
              <div key={i} className="cf-admin-detail-zone">
                <span className="cf-admin-detail-zone-swatch" style={{ backgroundColor: z.color }} />
                <span className="cf-admin-detail-zone-label">
                  {z.isCatchAll
                    ? `< ${zones[i - 1]?.threshold ?? 0}${unitSuffix}`
                    : z.threshold !== undefined
                      ? `≥ ${z.threshold}${unitSuffix}`
                      : '—'}
                </span>
                {z.label && <span className="cf-admin-detail-zone-name">{z.label}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live preview */}
      {(viz.type === 'divergingBar' || viz.type === 'dataBar') && (
        <div className="cf-admin-detail-preview-sect">
          <div className="cf-admin-detail-preview-hdr">
            <span className="cf-admin-detail-lbl">Preview</span>
            <div className="cf-admin-detail-preview-input-row">
              <span className="cf-admin-detail-preview-input-lbl">Test value</span>
              <input
                type="number"
                className="cf-admin-detail-preview-input"
                value={testVal}
                onChange={e => setTestVal(e.target.value)}
              />
              {unitSuffix && <span className="cf-admin-detail-preview-unit">{unitSuffix}</span>}
            </div>
          </div>
          <div className="cf-admin-detail-preview-cell">
            {renderPreview()}
          </div>
        </div>
      )}

      {/* Applies to */}
      <div className="cf-admin-detail-row">
        <span className="cf-admin-detail-lbl">Applies to</span>
        <span className="cf-admin-detail-val cf-admin-detail-scope">All measures · All dimensions · All time periods</span>
      </div>
    </div>
  );
};

// ─── Rule Card ──────────────────────────────────────────────────────────────────

const RuleCard: React.FC<{
  rule: ConditionalFormattingRule;
  isExpanded: boolean;
  mode: IndicatorMode;
  availableMeasures: MeasureData[];
  onToggleExpand: () => void;
  onToggleActive: () => void;
  onPriorityChange: (nextOrder: number) => void;
  onSave: (rule: ConditionalFormattingRule) => void;
  onPreviewRuleChange?: (rule: ConditionalFormattingRule | null) => void;
  isLocked?: boolean;
}> = ({
  rule, isExpanded, mode, availableMeasures,
  onToggleExpand, onToggleActive, onPriorityChange, onSave, onPreviewRuleChange, isLocked = false,
}) => {
  const isAdmin = !!rule.isAdmin;
  const scopeSummary = getRuleScopeSummary(rule.target, availableMeasures);
  const zones = rule.visualization.zones ?? [];
  const isTwoZoneThreshold =
    rule.visualization.type === 'colorScale' &&
    zones.length === 2 &&
    zones.some(z => z.isCatchAll);
  const vizBadgeInfo: Record<string, { label: string; cls: string }> = {
    colorScale:   { label: 'Color Scale', cls: 'badge-color-scale' },
    iconSet:      { label: 'Icons',       cls: 'badge-icon-set'    },
    dataBar:      { label: 'Data Bar',    cls: 'badge-data-bar'    },
    divergingBar: { label: 'Div. Bar',    cls: 'badge-div-bar'     },
    font:         { label: 'Font',        cls: 'badge-font'        },
    border:       { label: 'Border',      cls: 'badge-border'      },
    background:   { label: 'Background',  cls: 'badge-background'  },
  };
  const { label: vizBadge, cls: vizBadgeCls } = isTwoZoneThreshold
    ? { label: 'Threshold', cls: 'badge-threshold' }
    : (vizBadgeInfo[rule.visualization.type] ?? { label: rule.visualization.type, cls: '' });

  return (
    <div className={`cf-rule-item ${isAdmin ? 'cf-rule-admin' : ''} ${isExpanded ? 'cf-rule-expanded' : ''}`}>
      <div className="cf-rule-header">
        {/* Chevron — leftmost (always shown, even for admin) */}
        <button
          className={`cf-rule-action-btn cf-chevron-btn ${isExpanded ? 'cf-chevron-open' : ''}`}
          onClick={isLocked ? undefined : onToggleExpand}
          disabled={isLocked}
          title={isExpanded ? 'Collapse' : isAdmin ? 'View details' : 'Edit'}
        >
          <svg viewBox="0 0 24 24" fill="none" width="13" height="13">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Name + chips */}
        <div className="cf-rule-info">
          <div className="cf-rule-name-row">
            <span className="cf-rule-name">{rule.name}</span>
            <span className={`cf-rule-viz-badge ${vizBadgeCls}`}>{vizBadge}</span>
          </div>
          <div className="cf-rule-chips-row">
            <span className="cf-rule-chip cf-rule-chip-scope" title={scopeSummary}>{scopeSummary}</span>
          </div>
        </div>

        {!isAdmin && (
          <div className="cf-rule-controls">
            <input
              type="number"
              min={1}
              step={1}
              value={rule.priority + 1}
              onChange={(e) => onPriorityChange(Number(e.target.value))}
              className="cf-rule-order-input"
              title="Rule precedence"
            />
            <button
              className={`cf-rule-toggle ${rule.isActive ? 'active' : ''}`}
              onClick={isLocked ? undefined : onToggleActive}
              disabled={isLocked}
              aria-label={rule.isActive ? 'Deactivate' : 'Activate'}
            >
              <div className="cf-rule-toggle-track"><div className="cf-rule-toggle-thumb" /></div>
            </button>
          </div>
        )}

      </div>

      {isExpanded && !isAdmin && !isLocked && (
        <RuleEditor
          existingRule={rule}
          mode={mode}
          availableMeasures={availableMeasures}
          onSave={onSave}
          onPreview={(previewRule) => onPreviewRuleChange?.(previewRule)}
          onCancel={onToggleExpand}
        />
      )}

      {isExpanded && isAdmin && (
        <AdminRuleDetail rule={rule} />
      )}
    </div>
  );
};

// ─── Highlight preset colors ───────────────────────────────────────────────────────
// Product vocabulary: tint = mix with white (lighter); tone = mix with black (darker/muted).
// `hex` is stored on rules and used for cell backgrounds. `swatchHex` is slightly toned for
// the picker only so swatches read clearly on white (indicative, not the applied fill).

const TINT_COLORS: { hex: string; swatchHex: string; label: string }[] = [
  { hex: '#FFEBEB', swatchHex: '#F0D0D0', label: 'Red' },
  { hex: '#FFF0E6', swatchHex: '#F2E0D4', label: 'Orange' },
  { hex: '#FFFBD8', swatchHex: '#F2EDC6', label: 'Yellow' },
  { hex: '#E8F5E8', swatchHex: '#D2E6D2', label: 'Green' },
  { hex: '#E8F2FF', swatchHex: '#CDE0F5', label: 'Blue' },
  { hex: '#F1EAFF', swatchHex: '#DDD3F0', label: 'Purple' },
  { hex: '#FFF0F7', swatchHex: '#F0E0EC', label: 'Pink' },
  { hex: '#E8F8F8', swatchHex: '#D0EEEE', label: 'Teal' },
];

// ─── Simple Rule Form (shared by creator and editor) ─────────────────────────────

interface SimpleRuleFormProps {
  name: string;
  measureId: string;
  level: string;
  operator: ConditionType;
  value: string;
  value2: string;
  color: string;
  availableMeasures: MeasureData[];
  onNameChange: (v: string) => void;
  onMeasureChange: (v: string) => void;
  onLevelChange: (v: string) => void;
  onOperatorChange: (v: ConditionType) => void;
  onValueChange: (v: string) => void;
  onValue2Change: (v: string) => void;
  onColorChange: (v: string) => void;
}

const ReqMark = () => (
  <span className="cf-simple-required" aria-hidden="true">*</span>
);

const SimpleRuleForm: React.FC<SimpleRuleFormProps> = ({
  name, measureId, level, operator, value, value2, color, availableMeasures,
  onNameChange, onMeasureChange, onLevelChange, onOperatorChange, onValueChange, onValue2Change, onColorChange,
}) => {
  const uid = useId();
  const nameId = `${uid}-name`;
  const measureIdField = `${uid}-measure`;
  const levelId = `${uid}-level`;
  const conditionId = `${uid}-condition`;
  const valueId = `${uid}-value`;
  const value2Id = `${uid}-value2`;
  const colorGroupId = `${uid}-color`;

  return (
    <div className="cf-simple-form-fields">
      <div className="cf-simple-field">
        <label className="cf-simple-label" htmlFor={nameId}>
          Rule Name <ReqMark />
        </label>
        <input
          id={nameId}
          className="cf-simple-input"
          type="text"
          placeholder="Enter rule name"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          aria-required="true"
        />
      </div>
      <div className="cf-simple-field">
        <label className="cf-simple-label" htmlFor={measureIdField}>
          Measure
        </label>
        <select
          id={measureIdField}
          className="cf-simple-input cf-simple-select"
          value={measureId}
          onChange={e => onMeasureChange(e.target.value)}
        >
          <option value="">All measures</option>
          {availableMeasures.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      <div className="cf-simple-field">
        <label className="cf-simple-label" htmlFor={levelId}>
          Level
        </label>
        <select
          id={levelId}
          className="cf-simple-input cf-simple-select"
          value={level}
          onChange={e => onLevelChange(e.target.value)}
        >
          <option value="">All levels</option>
          {LEVEL_OPTIONS.map(l => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </div>
      <div className="cf-simple-field">
        <label className="cf-simple-label" htmlFor={conditionId}>
          Condition <ReqMark />
        </label>
        <select
          id={conditionId}
          className="cf-simple-input cf-simple-select"
          value={operator}
          onChange={e => onOperatorChange(e.target.value as ConditionType)}
          aria-required="true"
        >
          <option value="greaterThan">Greater than</option>
          <option value="lessThan">Less than</option>
          <option value="equals">Equals</option>
          <option value="between">Between</option>
        </select>
      </div>
      <div className="cf-simple-field">
        <label className="cf-simple-label" htmlFor={valueId}>
          {operator === 'between' ? 'From' : 'Value'} <ReqMark />
        </label>
        <input
          id={valueId}
          className="cf-simple-input"
          type="number"
          placeholder="Enter value"
          value={value}
          onChange={e => onValueChange(e.target.value)}
          aria-required="true"
        />
      </div>
      {operator === 'between' && (
        <div className="cf-simple-field">
          <label className="cf-simple-label" htmlFor={value2Id}>
            To <ReqMark />
          </label>
          <input
            id={value2Id}
            className="cf-simple-input"
            type="number"
            placeholder="Enter upper value"
            value={value2}
            onChange={e => onValue2Change(e.target.value)}
            aria-required="true"
          />
        </div>
      )}
      <div className="cf-simple-field">
        <span id={colorGroupId} className="cf-simple-label cf-simple-label-static">
          Highlight Color <ReqMark />
        </span>
        <div className="cf-color-swatches" role="group" aria-labelledby={colorGroupId}>
          {TINT_COLORS.map(c => (
            <button
              key={c.hex}
              type="button"
              className={`cf-color-swatch ${color === c.hex ? 'cf-color-swatch-selected' : ''}`}
              style={{ '--swatch-bg': c.swatchHex } as React.CSSProperties}
              title={c.label}
              onClick={() => onColorChange(c.hex)}
              aria-label={c.label}
              aria-pressed={color === c.hex}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Simple Rule Card ────────────────────────────────────────────────────────────

interface SimpleRuleCardProps {
  rule: ConditionalFormattingRule;
  availableMeasures: MeasureData[];
  onToggle: () => void;
  onDelete: () => void;
  onSave: (updated: ConditionalFormattingRule) => void;
}

const SimpleRuleCard: React.FC<SimpleRuleCardProps> = ({ rule, availableMeasures, onToggle, onDelete, onSave }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editName, setEditName] = useState(rule.name);
  const [editMeasureId, setEditMeasureId] = useState(rule.target.measureIds[0] ?? '');
  const [editLevel, setEditLevel] = useState(rule.target.dimensionLevels[0] ?? '');
  const [editOperator, setEditOperator] = useState<ConditionType>(rule.condition.type);
  const [editValue, setEditValue] = useState(String(rule.condition.value ?? ''));
  const [editValue2, setEditValue2] = useState(String(rule.condition.value2 ?? ''));
  const [editColor, setEditColor] = useState(rule.visualization.color ?? TINT_COLORS[0].hex);

  const handleToggleExpand = () => {
    if (!isExpanded) {
      setEditName(rule.name);
      setEditMeasureId(rule.target.measureIds[0] ?? '');
      setEditLevel(rule.target.dimensionLevels[0] ?? '');
      setEditOperator(rule.condition.type);
      setEditValue(String(rule.condition.value ?? ''));
      setEditValue2(String(rule.condition.value2 ?? ''));
      setEditColor(rule.visualization.color ?? TINT_COLORS[0].hex);
    }
    setIsExpanded(p => !p);
  };

  const handleSave = () => {
    if (!editName.trim() || !editValue) return;
    if (editOperator === 'between' && !editValue2.trim()) return;
    onSave({
      ...rule,
      name: editName.trim(),
      target: { ...rule.target, measureIds: editMeasureId ? [editMeasureId] : [], dimensionLevels: editLevel ? [editLevel] : [] },
      condition: {
        type: editOperator,
        value: parseFloat(editValue),
        ...(editOperator === 'between' ? { value2: parseFloat(editValue2) } : {}),
      },
      visualization: { ...rule.visualization, color: editColor },
      updatedAt: new Date(),
    });
    setIsExpanded(false);
  };

  const measureName = rule.target.measureIds.length > 0
    ? (availableMeasures.find(m => rule.target.measureIds.includes(m.id))?.name ?? 'Unknown measure')
    : 'All measures';
  const opLabel = SIMPLE_OPERATOR_LABELS[rule.condition.type] ?? rule.condition.type;
  const condSummary = rule.condition.type === 'between'
    ? `${measureName} · ${opLabel} · ${rule.condition.value} – ${rule.condition.value2}`
    : `${measureName} · ${opLabel} · ${rule.condition.value}`;

  return (
    <div className={`cf-rule-item cf-simple-rule-item ${rule.isActive ? '' : 'cf-rule-inactive'} ${isExpanded ? 'cf-rule-expanded' : ''}`}>
      <div className="cf-rule-header">
        <button
          className={`cf-rule-action-btn cf-chevron-btn ${isExpanded ? 'cf-chevron-open' : ''}`}
          onClick={handleToggleExpand}
          title={isExpanded ? 'Collapse' : 'Edit'}
        >
          <svg viewBox="0 0 24 24" fill="none" width="13" height="13">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="cf-rule-info">
          <div className="cf-rule-name-row">
            <span className="cf-rule-name">{rule.name}</span>
          </div>
          <div className="cf-rule-chips-row">
            <span
              className="cf-simple-rule-color-dot"
              style={{ backgroundColor: rule.visualization.color ?? TINT_COLORS[0].hex }}
              title="Highlight color"
            />
            <span className="cf-rule-chip cf-rule-chip-scope">{condSummary}</span>
          </div>
        </div>
        <div className="cf-rule-controls">
          <button
            className={`cf-rule-toggle ${rule.isActive ? 'active' : ''}`}
            onClick={onToggle}
            aria-label={rule.isActive ? 'Deactivate' : 'Activate'}
          >
            <div className="cf-rule-toggle-track"><div className="cf-rule-toggle-thumb" /></div>
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          <div className="cf-simple-edit-body">
            <SimpleRuleForm
              name={editName}
              measureId={editMeasureId}
              level={editLevel}
              operator={editOperator}
              value={editValue}
              value2={editValue2}
              color={editColor}
              availableMeasures={availableMeasures}
              onNameChange={setEditName}
              onMeasureChange={setEditMeasureId}
              onLevelChange={setEditLevel}
              onOperatorChange={setEditOperator}
              onValueChange={setEditValue}
              onValue2Change={setEditValue2}
              onColorChange={setEditColor}
            />
          </div>
          <div className="cf-simple-edit-footer" role="group" aria-label="Rule actions">
            <button
              type="button"
              className="cf-simple-delete-btn"
              onClick={onDelete}
              title="Delete rule"
            >
              <svg viewBox="0 0 24 24" fill="none" width="13" height="13">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Delete
            </button>
            <div className="cf-simple-edit-footer-right">
              <button type="button" className="cf-simple-cancel-btn" onClick={() => setIsExpanded(false)}>Cancel</button>
              <button
                type="button"
                className="cf-simple-save-btn"
                onClick={handleSave}
                disabled={
                  !editName.trim()
                  || !editValue
                  || (editOperator === 'between' && !editValue2.trim())
                }
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────────

interface ConditionalFormattingTabProps {
  rules: ConditionalFormattingRule[];
  onRulesChange: (rules: ConditionalFormattingRule[]) => void;
  onPreviewRuleChange?: (rule: ConditionalFormattingRule | null) => void;
  availableMeasures: MeasureData[];
  selectedCellKey?: string | null;
  designSystemRulesEnabled?: boolean;
  onDesignSystemRulesChange?: (enabled: boolean) => void;
  launchFromSelectionSignal?: number;
  launchFromSelectionCellKeys?: string[];
  applyRulesAsColorScale?: boolean;
  onApplyRulesAsColorScaleChange?: (enabled: boolean) => void;
}

const ConditionalFormattingTab: React.FC<ConditionalFormattingTabProps> = ({
  rules, onRulesChange, availableMeasures,
  designSystemRulesEnabled = true,
  onDesignSystemRulesChange,
  applyRulesAsColorScale = false,
  onApplyRulesAsColorScaleChange,
}) => {
  const [isDesignSystemRulesOn, setIsDesignSystemRulesOn] = useState(designSystemRulesEnabled);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftMeasureId, setDraftMeasureId] = useState('');
  const [draftLevel, setDraftLevel] = useState('');
  const [draftOperator, setDraftOperator] = useState<ConditionType>('greaterThan');
  const [draftValue, setDraftValue] = useState('');
  const [draftValue2, setDraftValue2] = useState('');
  const [draftColor, setDraftColor] = useState(TINT_COLORS[0].hex);

  useEffect(() => {
    setIsDesignSystemRulesOn(designSystemRulesEnabled);
  }, [designSystemRulesEnabled]);

  // Clear any stale preset rules so we start with a clean slate
  useEffect(() => {
    const presetIds = ['preset-variance-rule', 'preset-mom-rule', 'preset-yoy-rule', 'preset-revenue-concentration-rule', 'preset-target-achievement-rule', 'preset-cost-magnitude-rule', 'preset-trend-direction-rule'];
    const hasPresets = rules.some(r => presetIds.includes(r.id));
    if (hasPresets) {
      onRulesChange(rules.filter(r => !presetIds.includes(r.id)));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDesignSystemRulesToggle = () => {
    setIsDesignSystemRulesOn(prev => {
      const next = !prev;
      onDesignSystemRulesChange?.(next);
      return next;
    });
  };

  const handleAddRule = () => {
    const name = draftName.trim();
    if (!name || !draftValue) return;
    if (draftOperator === 'between' && !draftValue2.trim()) return;
    const now = new Date();
    const userRuleCount = rules.filter(r => r.mode === 'modifyCells').length;
    const newRule: ConditionalFormattingRule = {
      id: `user-rule-${Date.now()}`,
      name,
      isActive: true,
      priority: userRuleCount,
      mode: 'modifyCells',
      target: {
        measureIds: draftMeasureId ? [draftMeasureId] : [],
        dimensionLevels: draftLevel ? [draftLevel] : [],
        timeKeys: [],
      },
      condition: {
        type: draftOperator,
        value: parseFloat(draftValue),
        ...(draftOperator === 'between' ? { value2: parseFloat(draftValue2) } : {}),
      },
      visualization: {
        type: 'background',
        color: draftColor,
      },
      createdAt: now,
      updatedAt: now,
    };
    onRulesChange([...rules, newRule]);
    setDraftName('');
    setDraftMeasureId('');
    setDraftLevel('');
    setDraftOperator('greaterThan');
    setDraftValue('');
    setDraftValue2('');
    setDraftColor(TINT_COLORS[0].hex);
    setCreatorOpen(false);
  };

  const handleDeleteRule = (ruleId: string) => {
    onRulesChange(rules.filter(r => r.id !== ruleId));
  };

  const handleToggleRule = (ruleId: string) => {
    onRulesChange(rules.map(r => r.id === ruleId ? { ...r, isActive: !r.isActive } : r));
  };

  const handleSaveEditedRule = (updated: ConditionalFormattingRule) => {
    onRulesChange(rules.map(r => r.id === updated.id ? updated : r));
  };

  const userRules = rules
    .filter(r => r.mode === 'modifyCells')
    .sort((a, b) => ruleCreatedAtMs(b) - ruleCreatedAtMs(a));
  // "Apply as a color scale" is removed for parity with the deployed grid.
  const showColorScaleMergeOption = false;

  useEffect(() => {
    if (!showColorScaleMergeOption && applyRulesAsColorScale) {
      onApplyRulesAsColorScaleChange?.(false);
    }
  }, [showColorScaleMergeOption, applyRulesAsColorScale, onApplyRulesAsColorScaleChange]);

  return (
    <div className="cf-tab-content">
      {/* Design System Rules */}
      <div className="cf-section">
        <div className="cf-section-header">
          <span className="cf-section-label">Design System Rules</span>
        </div>
        <div className="cf-ds-rule-card">
          <div className="cf-ds-rule-info">
            <div className="cf-ds-rule-title">Default Rules</div>
            <div className="cf-ds-rule-subtitle">
              Apply the default styling for edited and impacted cells.
            </div>
          </div>
          <button
            type="button"
            className={`cf-rule-toggle ${isDesignSystemRulesOn ? 'active' : ''}`}
            onClick={handleDesignSystemRulesToggle}
            aria-label={isDesignSystemRulesOn ? 'Disable default rules' : 'Enable default rules'}
          >
            <div className="cf-rule-toggle-track"><div className="cf-rule-toggle-thumb" /></div>
          </button>
        </div>
      </div>

      {/* Rules section */}
      <div className="cf-section">
        <div className="cf-section-header cf-rules-section-header">
          <span className="cf-section-label">Rules</span>
          <button
            className="cf-new-rule-btn"
            onClick={() => setCreatorOpen(true)}
            disabled={creatorOpen}
          >
            + New Rule
          </button>
        </div>

        {showColorScaleMergeOption && (
          <label
            className={`cf-color-scale-merge-row${!onApplyRulesAsColorScaleChange ? ' cf-color-scale-merge-row--disabled' : ''}`}
          >
            <input
              type="checkbox"
              className="cf-color-scale-merge-checkbox"
              checked={applyRulesAsColorScale}
              onChange={e => onApplyRulesAsColorScaleChange?.(e.target.checked)}
              disabled={!onApplyRulesAsColorScaleChange}
            />
            <span className="cf-color-scale-merge-title">Apply as a color scale</span>
          </label>
        )}

        {/* Inline rule creator — shown only when New Rule is open */}
        {creatorOpen && (
          <div className="cf-simple-creator">
            <SimpleRuleForm
              name={draftName}
              measureId={draftMeasureId}
              level={draftLevel}
              operator={draftOperator}
              value={draftValue}
              value2={draftValue2}
              color={draftColor}
              availableMeasures={availableMeasures}
              onNameChange={setDraftName}
              onMeasureChange={setDraftMeasureId}
              onLevelChange={setDraftLevel}
              onOperatorChange={setDraftOperator}
              onValueChange={setDraftValue}
              onValue2Change={setDraftValue2}
              onColorChange={setDraftColor}
            />
            <div className="cf-simple-creator-footer">
              <button
                className="cf-simple-cancel-btn"
                onClick={() => setCreatorOpen(false)}
              >
                Cancel
              </button>
              <button
                className="cf-simple-creator-add-btn"
                onClick={handleAddRule}
                disabled={
                  !draftName.trim()
                  || !draftValue
                  || (draftOperator === 'between' && !draftValue2.trim())
                }
              >
                Add Rule
              </button>
            </div>
          </div>
        )}

        {/* Created rules */}
        <div className="cf-rules-list">
          {userRules.map(rule => (
            <SimpleRuleCard
              key={rule.id}
              rule={rule}
              availableMeasures={availableMeasures}
              onToggle={() => handleToggleRule(rule.id)}
              onDelete={() => handleDeleteRule(rule.id)}
              onSave={handleSaveEditedRule}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ConditionalFormattingTab;
