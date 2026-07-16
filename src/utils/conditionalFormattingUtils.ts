import React from 'react';
import { ConditionalFormattingRule, IndicatorZone, RuleCondition, VisualizationType } from '../types/conditionalFormatting';
import { RowType } from '../types';
import { SLDS_HEX } from './sldsColorHex';

/** Stable timestamp for ordering rules (handles `Date` or ISO string from persistence). */
export function ruleCreatedAtMs(rule: ConditionalFormattingRule): number {
  const d = rule.createdAt as Date | string;
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.getTime();
  const t = new Date(d as string).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Optional behavior for {@link evaluateCellFormatting}. */
export interface EvaluateCellFormattingOptions {
  /** Merge active background + "greater than" rules into one continuous color scale by threshold. */
  mergeBackgroundRulesAsColorScale?: boolean;
}

function ruleAppliesToCell(
  rule: ConditionalFormattingRule,
  rowType: RowType,
  timeKey: string,
  measureId: string,
  rowId?: string,
): boolean {
  if (rule.target.cellKeys && rule.target.cellKeys.length > 0) {
    const cellKey = rowId ? `${rowId}-${timeKey}` : null;
    return !!(cellKey && rule.target.cellKeys.includes(cellKey));
  }
  const targetsMeasure =
    (rule.target.measureIds.length === 0 || rule.target.measureIds.includes(measureId)) &&
    !(rule.target.excludeMeasureIds?.includes(measureId) ?? false);
  const targetsDimension =
    (rule.target.dimensionLevels.length === 0 || rule.target.dimensionLevels.includes(rowType)) &&
    !(rule.target.excludeDimensionLevels?.includes(rowType) ?? false);
  const targetsTime =
    (rule.target.timeKeys.length === 0 || rule.target.timeKeys.includes(timeKey)) &&
    !(rule.target.excludeTimeKeys?.includes(timeKey) ?? false);
  return targetsMeasure && targetsDimension && targetsTime;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace(/^#/, '');
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lerpHexColor(a: string, b: string, t: number): string {
  const A = parseHexRgb(a);
  const B = parseHexRgb(b);
  if (!A || !B) return t < 0.5 ? a : b;
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bl = Math.round(A.b + (B.b - A.b) * t);
  return `#${[r, g, bl].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Piecewise linear gradient across sorted (threshold, color) stops. */
export function interpolateColorStopsForRules(
  cellValue: number,
  stops: { value: number; color: string }[],
): string {
  const sorted = [...stops].sort((a, b) => a.value - b.value);
  if (sorted.length === 0) return SLDS_HEX.surface;
  if (cellValue <= sorted[0].value) return sorted[0].color;
  const last = sorted[sorted.length - 1];
  if (cellValue >= last.value) return last.color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (cellValue <= hi.value) {
      const span = hi.value - lo.value;
      const t = span === 0 ? 0 : (cellValue - lo.value) / span;
      return lerpHexColor(lo.color, hi.color, t);
    }
  }
  return last.color;
}

/**
 * Mix a hex color with white at `amount` (0 = full white, 1 = full color).
 * A value of 0.22 gives a soft pastel tint that keeps WCAG AA dark-text contrast.
 */
export function tintColor(hex: string, amount = 0.22): string {
  if (!hex || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount));
  return '#' + [mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Derive the value used for zone/condition evaluation based on the rule's evalBasis.
 *  Uses the same seeded-random helpers used by GridRow for YoY/MoM/TargetAchievement. */
export function resolveEvalValue(
  cellValue: number,
  rowId: string,
  timeKey: string,
  evalBasis: string | undefined,
  rowValues?: Record<string, number>,
  columnValues?: number[],
): number {
  if (!evalBasis || evalBasis === 'cellValue') return cellValue;

  if (evalBasis === 'pctOfColumnTotal') {
    const positives = (columnValues ?? []).filter(v => v > 0);
    const total = positives.reduce((s, v) => s + v, 0);
    if (total === 0) return 0;
    return (cellValue / total) * 100;
  }

  if (evalBasis === 'costShare') {
    // Use the row's stored _cost value; compare against sibling _cost values (columnValues).
    const costVal = rowValues?._cost ?? 0;
    const positives = (columnValues ?? []).filter(v => v > 0);
    const total = positives.reduce((s, v) => s + v, 0);
    if (total === 0) return 0;
    return (costVal / total) * 100;
  }

  if (evalBasis === 'pctRankByType') {
    // Percentile rank (0–100) of this cell among all same-type peers in the column.
    // Rank 100 = highest value (top contributor), rank 0 = lowest.
    const peers = (columnValues ?? []).filter(v => isFinite(v));
    if (peers.length <= 1) return 100;
    const sorted = [...peers].sort((a, b) => a - b);
    const below = sorted.filter(v => v < cellValue).length;
    return Math.round((below / (sorted.length - 1)) * 100);
  }

  // Seeded RNG mirroring GridRow's seededRandom
  const seededRandom = (seed: string): number => {
    let h = 5381;
    for (let i = 0; i < seed.length; i++) {
      h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
    }
    return h / 4294967296;
  };

  const seed = `${rowId}-${timeKey}`;
  const rand = seededRandom(`${seed}-${evalBasis}`);

  switch (evalBasis) {
    case 'yoy': return Math.round((rand * 40) - 20);            // -20% to +20%
    case 'mom': return Math.round((rand * 20) - 10);            // -10% to +10%
    case 'targetAchievement': {
      const r = seededRandom(`${rowId}-${timeKey}-targetAchievement`);
      if (r < 0.18) return Math.round(4 + r * 170);
      if (r > 0.78) return Math.round(100 + (r - 0.78) / 0.22 * 35);
      return Math.round(55 + ((r - 0.18) / 0.60) * 45);
    }
    case 'variance': {
      // Signed % deviation from yearly average:
      // ((value - yearly_avg) / |yearly_avg|) * 100
      // Positive = above average (red/yellow), negative = below average (green catch-all)
      const monthlyValues = Object.entries(rowValues ?? {})
        .filter(([k, v]) => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{4}$/i.test(k) && Number.isFinite(v))
        .map(([, v]) => v as number);
      if (monthlyValues.length === 0) return 0;
      const yearlyAvg = monthlyValues.reduce((sum, v) => sum + v, 0) / monthlyValues.length;
      if (Math.abs(yearlyAvg) < 1e-9) return 0;
      return ((cellValue - yearlyAvg) / Math.abs(yearlyAvg)) * 100;
    }
    default: return cellValue;
  }
}

export interface CellFormattingResult {
  hasMatch: boolean;
  mode: 'modifyCells' | 'createColumns';
  visualizationType: VisualizationType;
  style: React.CSSProperties;
  indicatorColor: string;
  indicatorLabel: string;
  zoneIcon?: string;       // Pre-computed icon character from zone + iconStyle
  iconColor?: string;      // Icon color from winning icon-set rule
  zoneLabel?: string;      // Zone label e.g. "Good", "Watch"
  iconType?: 'arrows' | 'trafficLights' | 'stars' | 'flags' | 'custom';
  barPercent?: number;
  barColor?: string;
}

function resolveZone(value: number, zones: IndicatorZone[]): { zone: IndicatorZone; index: number } | null {
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (zone.isCatchAll) return { zone, index: i };
    if (zone.threshold !== undefined && value >= zone.threshold) return { zone, index: i };
  }
  return zones.length > 0 ? { zone: zones[zones.length - 1], index: zones.length - 1 } : null;
}

function zoneIcon(iconStyle: string | undefined, index: number, total: number, zone?: IndicatorZone): string {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  if (iconStyle === 'custom') return zone?.icon?.trim() || '●';
  switch (iconStyle) {
    case 'trafficLights': return isFirst ? '🟢' : isLast ? '🔴' : '🟡';
    case 'arrows': {
      if (isFirst) return '↑';
      if (isLast)  return '↓';
      // 5-zone support: ↗ for second, ↘ for second-to-last
      if (total >= 5 && index === 1)         return '↗';
      if (total >= 5 && index === total - 2) return '↘';
      return '→';
    }
    case 'stars': return isFirst ? '★★★' : isLast ? '★' : '★★';
    case 'flags': return isFirst ? '🚩' : isLast ? '🏴' : '🏳️';
    default: return '●';
  }
}

function evaluateCondition(
  value: number,
  condition: RuleCondition,
  allValues: number[],
): boolean {
  switch (condition.type) {
    case 'greaterThan':
      return value > (condition.value ?? 0);
    case 'lessThan':
      return value < (condition.value ?? 0);
    case 'equals':
      return value === (condition.value ?? 0);
    case 'between':
      return value >= (condition.value ?? 0) && value <= (condition.value2 ?? 0);
    case 'topN': {
      if (allValues.length === 0) return false;
      const sorted = [...allValues].sort((a, b) => b - a);
      const n = Math.min(condition.n ?? 5, sorted.length);
      const threshold = sorted[n - 1];
      return value >= threshold;
    }
    case 'bottomN': {
      if (allValues.length === 0) return false;
      const sorted = [...allValues].sort((a, b) => a - b);
      const n = Math.min(condition.n ?? 5, sorted.length);
      const threshold = sorted[n - 1];
      return value <= threshold;
    }
    case 'aboveAverage': {
      if (allValues.length === 0) return false;
      const avg = allValues.reduce((a, b) => a + b, 0) / allValues.length;
      return value > avg;
    }
    case 'belowAverage': {
      if (allValues.length === 0) return false;
      const avg = allValues.reduce((a, b) => a + b, 0) / allValues.length;
      return value < avg;
    }
    case 'formula': {
      try {
        const raw = condition.formula ?? '';
        const expr = raw
          .replace(/VALUE/gi, String(value))
          .replace(/\bAND\b/gi, '&&')
          .replace(/\bOR\b/gi, '||')
          .replace(/\bNOT\b\s*/gi, '!')
          .replace(/\bABS\s*\(/gi, 'Math.abs(')
          .replace(/(?<![<>!])=(?!=)/g, '==='); // single = → ===
        // eslint-disable-next-line no-new-func
        return Boolean(new Function(`return ${expr}`)());
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

/**
 * Returns the bar fill percentage for a data bar visualization.
 * Maps the value between min and max of allValues → 0-100%.
 */
function computeBarPercent(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 50;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  if (max === min) return 50;
  return Math.round(((value - min) / (max - min)) * 100);
}

/**
 * Evaluates all active conditional formatting rules for a single cell.
 * Returns the highest-priority matching result, or null if no rule matches.
 */
export function evaluateCellFormatting(
  value: number,
  rowType: RowType,
  timeKey: string,
  measureId: string,
  rules: ConditionalFormattingRule[],
  allValues: number[] = [],
  rowId?: string,
  rowValues?: Record<string, number>,
  sameTypeValues?: number[],
  siblingCostValues?: number[],
  options?: EvaluateCellFormattingOptions,
): CellFormattingResult | null {
  // Non-admin rules: newest first so the first match per visualization type is the latest-created rule.
  // Admin rules: keep priority order (lower number = higher precedence) after user rules.
  const active = rules.filter(r => r.isActive);
  const userActive = active
    .filter(r => !r.isAdmin)
    .sort((a, b) => {
      const dt = ruleCreatedAtMs(b) - ruleCreatedAtMs(a);
      if (dt !== 0) return dt;
      return a.priority - b.priority;
    });
  const adminActive = active.filter(r => r.isAdmin).sort((a, b) => a.priority - b.priority);
  const activeRules = [...userActive, ...adminActive];

  if (options?.mergeBackgroundRulesAsColorScale && Number.isFinite(value)) {
    const bgGtRules = activeRules.filter(
      r =>
        !r.isAdmin &&
        r.mode === 'modifyCells' &&
        r.visualization.type === 'background' &&
        typeof r.visualization.color === 'string' &&
        r.visualization.color.length >= 4 &&
        r.condition.type === 'greaterThan' &&
        typeof r.condition.value === 'number' &&
        Number.isFinite(r.condition.value),
    );
    const matching = bgGtRules.filter(r => ruleAppliesToCell(r, rowType, timeKey, measureId, rowId));
    if (matching.length >= 2) {
      const byPriority = [...matching].sort((a, b) => a.priority - b.priority);
      const stopMap = new Map<number, string>();
      for (const r of byPriority) {
        stopMap.set(r.condition.value as number, r.visualization.color as string);
      }
      const stops = [...stopMap.entries()]
        .map(([v, color]) => ({ value: v, color }))
        .sort((a, b) => a.value - b.value);
      if (stops.length >= 2) {
        const bg = interpolateColorStopsForRules(value, stops);
        const tc = getAccessibleTextColor(bg);
        return {
          hasMatch: true,
          mode: 'modifyCells',
          visualizationType: 'colorScale',
          style: { backgroundColor: bg, color: tc },
          indicatorColor: bg,
          indicatorLabel: 'Color scale',
          barPercent: 0,
          barColor: bg,
        };
      }
    }
  }

  type Matched = {
    rule: ConditionalFormattingRule;
    vizType: VisualizationType;
    style: React.CSSProperties;
    activeColor: string;
    activeZoneLabel?: string;
    activeZoneIcon?: string;
    barPct: number;
  };
  const winnersByType = new Map<VisualizationType, Matched>();

  for (const rule of activeRules) {
    // Manual cell selection — check if this specific cell key is in the stored set
    if (rule.target.cellKeys && rule.target.cellKeys.length > 0) {
      const cellKey = rowId ? `${rowId}-${timeKey}` : null;
      if (!cellKey || !rule.target.cellKeys.includes(cellKey)) continue;
    } else {
      const targetsMeasure =
        (rule.target.measureIds.length === 0 || rule.target.measureIds.includes(measureId)) &&
        !(rule.target.excludeMeasureIds?.includes(measureId) ?? false);
      const targetsDimension =
        (rule.target.dimensionLevels.length === 0 || rule.target.dimensionLevels.includes(rowType)) &&
        !(rule.target.excludeDimensionLevels?.includes(rowType) ?? false);
      const targetsTime =
        (rule.target.timeKeys.length === 0 || rule.target.timeKeys.includes(timeKey)) &&
        !(rule.target.excludeTimeKeys?.includes(timeKey) ?? false);

      if (!targetsMeasure || !targetsDimension || !targetsTime) continue;
    }
    const viz = rule.visualization;

    // Resolve the value to evaluate — may be a derived metric (YoY, MoM, Target Ach., etc.)
    // pctRankByType and pctOfColumnTotal use sibling group values.
    // costShare uses sibling _cost values (passed via siblingCostValues).
    const columnValuesForEval =
      viz.evalBasis === 'costShare'
        ? (siblingCostValues ?? [])
        : (viz.evalBasis === 'pctRankByType' || viz.evalBasis === 'pctOfColumnTotal')
          ? (sameTypeValues?.length ? sameTypeValues : allValues)
          : allValues;
    const evalValue = resolveEvalValue(value, rowId ?? '', timeKey, viz.evalBasis, rowValues, columnValuesForEval);

    if (!evaluateCondition(evalValue, rule.condition, allValues)) continue;

    // Resolve zone if this is a zone-based visualization
    const zones = viz.zones;
    const resolved = zones?.length ? resolveZone(evalValue, zones) : null;
    const activeColor = resolved?.zone.color ?? viz.color ?? SLDS_HEX.accent;
    const activeZoneLabel = resolved?.zone.label;
    const activeZoneIcon = resolved
      ? zoneIcon(viz.iconStyle, resolved.index, zones!.length, resolved.zone)
      : undefined;

    // Bar percent: use evalValue (derived metric) for bar length when evalBasis is set,
    // otherwise use raw cell value. Fall back to allValues range if no barMin/barMax.
    const barValue = viz.evalBasis && viz.evalBasis !== 'cellValue' ? evalValue : value;
    const barMin = viz.barMin ?? (allValues.length ? Math.min(...allValues) : 0);
    const barMax = viz.barMax ?? (allValues.length ? Math.max(...allValues) : 1);
    const barPct = barMax !== barMin
      ? Math.min(100, Math.max(0, Math.round(((barValue - barMin) / (barMax - barMin)) * 100)))
      : computeBarPercent(barValue, allValues);

    // Compute cell style for modifyCells mode
    let style: React.CSSProperties = {};
    if (rule.mode === 'modifyCells') {
      switch (viz.type) {
        case 'background':
          style = { backgroundColor: activeColor, color: getAccessibleTextColor(activeColor) };
          break;
        case 'colorScale':
          style = { backgroundColor: activeColor, color: getAccessibleTextColor(activeColor) };
          break;
        case 'font':
          style = { color: activeColor, fontWeight: viz.fontWeight === 'bold' ? 700 : 400 };
          break;
        case 'border':
          style = { borderLeft: `4px solid ${activeColor}` };
          break;
        case 'dataBar':
          style = {
            background: `linear-gradient(to right, ${activeColor}44 ${barPct}%, transparent ${barPct}%)`,
          };
          break;
        case 'divergingBar': {
          // Gradient fill between the zero-line position and barPct
          const barMinV = viz.barMin ?? -50;
          const barMaxV = viz.barMax ?? 50;
          const rangeV = (barMaxV - barMinV) || 1;
          const zeroPctV = Math.max(0, Math.min(100, ((0 - barMinV) / rangeV) * 100));
          const fillFrom = Math.min(barPct, zeroPctV);
          const fillTo   = Math.max(barPct, zeroPctV);
          style = fillTo > fillFrom ? {
            background: `linear-gradient(to right, transparent ${fillFrom}%, ${activeColor}88 ${fillFrom}%, ${activeColor}88 ${fillTo}%, transparent ${fillTo}%)`,
          } : {};
          break;
        }
        case 'iconSet':
          // Icon set should only render icon overlays, not mutate cell borders.
          style = {};
          break;
        default:
          style = {};
      }
    }

    // Keep the first matched rule per visualization type (priority order already sorted).
    if (!winnersByType.has(viz.type)) {
      winnersByType.set(viz.type, {
        rule,
        vizType: viz.type,
        style,
        activeColor,
        activeZoneLabel,
        activeZoneIcon,
        barPct,
      });
    }
  }

  if (winnersByType.size === 0) return null;

  const winners = Array.from(winnersByType.values());

  // Primary = highest-precedence rule (lowest priority number = rank 1 wins).
  // Its style is authoritative — lower-ranked rules must not override it visually.
  const primary = [...winners].sort((a, b) => a.rule.priority - b.rule.priority)[0];

  const iconWinner = [...winners]
    .filter(w => w.vizType === 'iconSet' && !!w.activeZoneIcon)
    .sort((a, b) => a.rule.priority - b.rule.priority)[0];
  const barWinner = [...winners]
    .filter(w => w.vizType === 'dataBar' || w.vizType === 'divergingBar')
    .sort((a, b) => a.rule.priority - b.rule.priority)[0];

  // Only the primary rule's style is applied to avoid CSS conflicts between visualization
  // types (e.g. `background` shorthand from a low-priority divergingBar overriding
  // `backgroundColor` from a high-priority colorScale rule).
  const winningStyle: React.CSSProperties = primary.style;

  return {
    hasMatch: true,
    mode: primary.rule.mode,
    visualizationType: primary.vizType,
    style: winningStyle,
    indicatorColor: primary.activeColor,
    indicatorLabel: primary.rule.name,
    zoneIcon: iconWinner?.activeZoneIcon,
    iconColor: iconWinner?.activeColor,
    zoneLabel: primary.activeZoneLabel,
    iconType: iconWinner?.rule.visualization.iconType ?? primary.rule.visualization.iconType,
    barPercent: barWinner?.barPct ?? primary.barPct,
    barColor: barWinner?.activeColor ?? primary.activeColor,
  };
}

/**
 * Given any zone hex color, returns a WCAG AA-compliant text color.
 * For light/pastel backgrounds: darkens the same hue to ~L=22% (contrast ≥ 4.5:1).
 * For dark backgrounds: returns white.
 */
export function getAccessibleTextColor(hex: string): string {
  if (!hex || hex.length < 7) return SLDS_HEX.neutral10;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // Relative luminance (WCAG formula)
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  if (L > 0.18) {
    // Light color — derive dark text by converting to HSL and clamping L to 22%
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lHsl = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = lHsl > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    // Clamp to dark: L=22%, boost saturation for color richness
    return hslToHex(h, Math.min(s * 1.3, 1), 0.22);
  }
  return SLDS_HEX.surface;
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(hue2rgb(p, q, h + 1 / 3))}${toHex(hue2rgb(p, q, h))}${toHex(hue2rgb(p, q, h - 1 / 3))}`;
}

// Same hash function used by GridRow's existing YoY/MoM sub-columns.
// Must stay in sync so formula results match the built-in sub-column values.
function seededRandom(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
  }
  return h / 4294967296;
}

/**
 * Derives the "prior period" value that, when used in a % change formula, produces
 * the same result as the existing seeded sub-columns (yoy / mom).
 *
 * Existing YoY pct  = Math.round(rand * 40 − 20)   → range −20..+20
 * Existing MoM pct  = Math.round(rand * 20 − 10)   → range −10..+10
 *
 * Given:  pct = (current − prior) / prior * 100
 * Solving: prior = current * 100 / (100 + pct)
 */
function derivePriorValue(actualValue: number, pct: number): number {
  return pct === -100 ? actualValue : actualValue * 100 / (100 + pct);
}

/**
 * Evaluates a formula expression for an indicator column.
 *
 * Token resolution:
 *   {Measure}          → actualValue
 *   {AVG(Measure)}     → average of allValues
 *   {MAX(Measure)}     → max of allValues
 *   {MIN(Measure)}     → min of allValues
 *   {Measure[-1Y]}     → seeded prior-year value (same seed as existing YoY column)
 *   {Measure[-1M]}     → seeded prior-month value (same seed as existing MoM column)
 *   {Measure[-1Q]}     → seeded prior-quarter value
 *   {Measure[budget]}  → seeded budget value (same as existing target sub-column)
 *   Other tokens       → actualValue
 *
 * Pass `rowId` and `colKey` to enable seeded historical values; omit to fall back
 * to actualValue for all time-shifted tokens.
 */
export function evaluateFormulaExpression(
  formula: string,
  actualValue: number,
  allValues: number[],
  rowId?: string,
  colKey?: string,
): number | null {
  if (!formula.trim()) return null;
  try {
    const avg = allValues.length > 0
      ? allValues.reduce((a, b) => a + b, 0) / allValues.length
      : actualValue;
    const max = allValues.length > 0 ? Math.max(...allValues) : actualValue;
    const min = allValues.length > 0 ? Math.min(...allValues) : actualValue;

    // Compute seeded historical values using the same approach as the built-in sub-columns
    let prior1Y = actualValue;
    let prior1M = actualValue;
    let prior1Q = actualValue;
    let budgetVal = actualValue;

    if (rowId && colKey) {
      const yoyRand = seededRandom(`${rowId}-${colKey}-yoy`);
      const yoyPct  = Math.round(yoyRand * 40 - 20);
      prior1Y = derivePriorValue(actualValue, yoyPct);

      const momRand = seededRandom(`${rowId}-${colKey}-mom`);
      const momPct  = Math.round(momRand * 20 - 10);
      prior1M = derivePriorValue(actualValue, momPct);

      // Quarter: use a distinct seed (no built-in quarter sub-column)
      const qRand = seededRandom(`${rowId}-${colKey}-quarter`);
      const qPct  = Math.round(qRand * 30 - 15);
      prior1Q = derivePriorValue(actualValue, qPct);

      // Budget/target: same seed as existing target sub-column
      const targetRand = seededRandom(`${rowId}-${colKey}-targetAchievement`);
      const targetPct  = Math.round(60 + targetRand * 60); // 60–120%
      budgetVal = actualValue * 100 / targetPct;
    }

    let expr = formula
      // Statistical wrappers
      .replace(/\{AVG\([^)]+\)\}/g, String(avg))
      .replace(/\{MAX\([^)]+\)\}/g, String(max))
      .replace(/\{MIN\([^)]+\)\}/g, String(min))
      // Time-shifted tokens
      .replace(/\{[^}]+\[-1Y\]\}/g,  String(prior1Y))
      .replace(/\{[^}]+\[-2Y\]\}/g,  String(derivePriorValue(prior1Y, Math.round(seededRandom((rowId ?? '') + (colKey ?? '') + 'yoy2') * 40 - 20))))
      .replace(/\{[^}]+\[-1Q\]\}/g,  String(prior1Q))
      .replace(/\{[^}]+\[-1M\]\}/g,  String(prior1M))
      .replace(/\{[^}]+\[budget\]\}/g,  String(budgetVal))
      .replace(/\{[^}]+\[target\]\}/g,  String(budgetVal))
      // Any remaining bracket tokens
      .replace(/\{[^}]+\[[^\]]+\]\}/g, String(actualValue))
      // Plain measure token
      .replace(/\{[^}]+\}/g, String(actualValue));

    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${expr})`)();
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/**
 * Formats a formula result according to the result unit.
 */
export function formatFormulaResult(
  value: number,
  resultUnit: 'percent' | 'number' | 'ratio' | undefined,
): string {
  if (resultUnit === 'percent') return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  if (resultUnit === 'ratio')   return `${value.toFixed(2)}×`;
  return value.toLocaleString();
}

/** Returns an icon character for a given icon type and value direction */
export function getIndicatorIcon(
  iconType: 'arrows' | 'trafficLights' | 'stars' | 'flags' | undefined,
  color: string,
): string {
  switch (iconType) {
    case 'trafficLights':
      return '●';
    case 'stars':
      return '★';
    case 'flags':
      return '⚑';
    case 'arrows':
    default:
      // Use up/down arrow based on color (green = up, red = down, else right)
      if (
        color === SLDS_HEX.success2 ||
        color.toLowerCase() === '#3ba755' ||
        color === '#10B981' ||
        color.toLowerCase() === '#22c55e'
      )
        return '↑';
      if (
        color === SLDS_HEX.error2 ||
        color === '#EF4444' ||
        color.toLowerCase() === '#dc2626'
      )
        return '↓';
      return '→';
  }
}
