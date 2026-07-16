/**
 * Shared color mapping for the Charts panel trend lines and the grid's
 * sub-column header dots, so a sub-column's header dot matches its chart line.
 */

/** The row's own value line ("Actual"). */
export const BASE_LINE_COLOR = '#0176d3';

/** Line colors assigned, in order, to each charted sub-column. */
export const SUBCOL_LINE_COLORS = [
  '#9050e9', '#04844b', '#e5701a', '#b83c8c', '#0b827c',
  '#c23934', '#5867e8', '#b8860b', '#3ba755',
];

interface SubColLike {
  id: string;
  formula?: string;
}

/** Sub-columns that render text (no numeric line). */
const TEXT_SUBCOL_IDS = new Set(['attribute', 'approvalStatus']);

/**
 * True when a sub-column maps to its own trend line. Custom (formula) columns
 * always chart; text columns never do; "Achieved" mirrors the Actual base line
 * so it doesn't get a separate line/dot.
 */
export function isChartedSubColumn(sc: SubColLike): boolean {
  if (sc.formula && sc.formula.trim()) return true;
  if (TEXT_SUBCOL_IDS.has(sc.id)) return false;
  if (sc.id === 'achieved') return false;
  return true;
}

/**
 * Map of subColumnId -> line color, matching the order in which the Charts
 * panel assigns colors to its trend lines.
 */
export function getSubColumnLineColorMap(subColumns: SubColLike[]): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  for (const sc of subColumns) {
    if (!isChartedSubColumn(sc)) continue;
    map.set(sc.id, SUBCOL_LINE_COLORS[idx % SUBCOL_LINE_COLORS.length]);
    idx += 1;
  }
  return map;
}
