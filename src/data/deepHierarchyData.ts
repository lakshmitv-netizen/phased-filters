// Deep-hierarchy demo dataset for the "manufacturing-deep" grid and the pristine
// OOTB Account Planning grid.
//
// Each measure expands into a 10-level hierarchy:
//   Account:  Global Account Group -> Strategic Account Group -> Segment -> Sold-to -> Ship-to
//   Product:  Company -> Business Unit -> Product Family -> Commodity -> Part
// (product levels nest under the deepest account level, mirroring how the existing grid
// nests products under accounts).
//
// LAZY GENERATION: every level has 8-10 children, so a fully materialized tree would be
// ~9^10 rows per measure (billions) — far too large to build up front. Instead the tree is
// generated top-down on demand: values are disaggregated from the parent down to its children
// (so parent totals always equal the sum of their children), and only the branches the user has
// expanded are materialized. `ensureDeepChildren` grows the tree one level ahead of the expanded
// rows; the grid calls it whenever the expanded-rows set changes.

import type { MeasureData, GridRow, RowType } from '../types';
import { withForecastAsSum } from '../utils/deriveForecast';

const seededRandom = (seed: string): number => {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(33, h) ^ seed.charCodeAt(i)) >>> 0;
  }
  return h / 4294967296;
};

const MONTH_KEYS = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
] as const;

type ValueBag = GridRow['values'];

/** Build a full values bag (months + quarters + year) for a leaf from a base amount. */
function leafValues(base: number, seed: string): ValueBag {
  const months: Record<string, number> = {};
  MONTH_KEYS.forEach((mk, idx) => {
    const jitter = 0.85 + seededRandom(`${seed}-${mk}`) * 0.30; // 0.85–1.15
    const seasonal = 1 + Math.sin((idx / 12) * Math.PI * 2 + seededRandom(seed) * 6) * 0.08;
    months[mk] = Math.max(0, Math.round(base * jitter * seasonal));
  });
  return finalizeValues(months, base, seed);
}

/** Sum an array of child value bags into a parent bag. */
export function sumValues(children: ValueBag[], base: number, seed: string): ValueBag {
  const months: Record<string, number> = {};
  MONTH_KEYS.forEach((mk) => {
    months[mk] = children.reduce((acc, c) => acc + (c[mk as keyof ValueBag] as number || 0), 0);
  });
  return finalizeValues(months, base, seed);
}

function finalizeValues(months: Record<string, number>, base: number, seed: string): ValueBag {
  const q1 = months.jan2026 + months.feb2026 + months.mar2026;
  const q2 = months.apr2026 + months.may2026 + months.jun2026;
  const q3 = months.jul2026 + months.aug2026 + months.sep2026;
  const q4 = months.oct2026 + months.nov2026 + months.dec2026;
  const year = q1 + q2 + q3 + q4;
  const cost = Math.round((year || base) * (0.45 + seededRandom(`${seed}-cost`) * 0.5));
  return { year, h1: q1 + q2, h2: q3 + q4, q1, q2, q3, q4, ...months, _cost: cost } as unknown as ValueBag;
}

interface LevelDef {
  type: RowType;
  names: string[];
}

// 10-level config (account levels first, then product levels nested under the deepest account).
// Each level carries a generous name pool so 8–10 siblings read as distinct values; when a level
// has more children than names, a numeric suffix keeps them unique.
const LEVELS: LevelDef[] = [
  { type: 'acct-global',    names: ['Acme Partners', 'MagnaDrive', 'Globex', 'Initech', 'Vandelay Industries', 'Hooli', 'Soylent Corp', 'Umbrella Group', 'Stark Industries', 'Wayne Enterprises', 'Wonka Industries', 'Cyberdyne'] },
  { type: 'acct-strategic', names: ['Strategic Group Alpha', 'Strategic Group Beta', 'Strategic Group Gamma', 'Strategic Group Delta', 'Strategic Group Epsilon', 'Strategic Group Zeta', 'Strategic Group Eta', 'Strategic Group Theta', 'Strategic Group Iota', 'Strategic Group Kappa'] },
  { type: 'acct-segment',   names: ['Enterprise', 'Mid-Market', 'SMB', 'Public Sector', 'Healthcare', 'Financial Services', 'Retail', 'Technology', 'Automotive', 'Energy'] },
  { type: 'acct-soldto',    names: ['Sold-to North', 'Sold-to South', 'Sold-to East', 'Sold-to West', 'Sold-to Central', 'Sold-to Coastal', 'Sold-to Inland', 'Sold-to Metro', 'Sold-to Rural', 'Sold-to Border'] },
  { type: 'acct-shipto',    names: ['Ship-to Primary', 'Ship-to Secondary', 'Ship-to Central', 'Ship-to Regional', 'Ship-to National', 'Ship-to Local', 'Ship-to Express', 'Ship-to Bulk', 'Ship-to Overflow', 'Ship-to Reserve'] },
  { type: 'prod-company',   names: ['MagnaCorp', 'Zenith Manufacturing', 'Apex Industrial', 'Orion Works', 'Titan Fabrication', 'Vertex Systems', 'Pinnacle Motors', 'Summit Components', 'Nova Assembly', 'Meridian Plants'] },
  { type: 'prod-bu',        names: ['Powertrain BU', 'Chassis BU', 'Electronics BU', 'Interior BU', 'Safety BU', 'Infotainment BU', 'Thermal BU', 'Body BU', 'Suspension BU', 'Drivetrain BU'] },
  { type: 'prod-family',    names: ['Transmission Family', 'Driveline Family', 'Braking Family', 'Steering Family', 'Cooling Family', 'Exhaust Family', 'Fuel Family', 'Ignition Family', 'Sensor Family', 'Actuator Family'] },
  { type: 'prod-commodity', names: ['Gears', 'Bearings', 'Fasteners', 'Seals', 'Housings', 'Shafts', 'Valves', 'Springs', 'Couplings', 'Bushings'] },
  { type: 'prod-part',      names: ['PN-1001', 'PN-2002', 'PN-3003', 'PN-4004', 'PN-5005', 'PN-6006', 'PN-7007', 'PN-8008', 'PN-9009', 'PN-1010'] },
];

const LEVEL_INDEX_BY_TYPE: Record<string, number> = LEVELS.reduce((acc, def, idx) => {
  acc[def.type] = idx;
  return acc;
}, {} as Record<string, number>);

const DEEP_LEVEL_TYPES: Set<string> = new Set(LEVELS.map((l) => l.type));

/** Rows whose type is a deep-hierarchy level and that aren't the deepest level can grow children. */
function canGenerateChildren(type: RowType): boolean {
  const idx = LEVEL_INDEX_BY_TYPE[type as string];
  return idx !== undefined && idx < LEVELS.length - 1;
}

function nameForLevel(def: LevelDef, index: number): string {
  if (index < def.names.length) return def.names[index];
  return `${def.names[0]} ${index + 1}`;
}

/** How many children a node gets: 8, 9, or 10, chosen deterministically from its id. */
function childCountFor(parentId: string): number {
  return 8 + Math.floor(seededRandom(`${parentId}-count`) * 3);
}

/**
 * Split a parent value bag into `n` child bags whose month values sum exactly to the
 * parent's (integer-safe, with the remainder folded into the last child). Quarter/year
 * aggregates are recomputed per child. Cost is generated independently per node, matching
 * how leaf/parent costs are derived elsewhere in this dataset.
 */
function disaggregate(parent: ValueBag, n: number, seedBase: string): ValueBag[] {
  const weights = Array.from({ length: n }, (_, i) => 0.6 + seededRandom(`${seedBase}-w${i}`) * 0.9);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const childMonths: Record<string, number>[] = Array.from({ length: n }, () => ({}));

  MONTH_KEYS.forEach((mk) => {
    const total = Math.max(0, Math.round((parent[mk as keyof ValueBag] as number) || 0));
    let allocated = 0;
    for (let i = 0; i < n - 1; i++) {
      const v = Math.max(0, Math.round((total * weights[i]) / wsum));
      childMonths[i][mk] = v;
      allocated += v;
    }
    childMonths[n - 1][mk] = Math.max(0, total - allocated);
  });

  return childMonths.map((m, i) => finalizeValues(m, 0, `${seedBase}-c${i}`));
}

/** Generate `n` (8–10) child rows at hierarchy level `childIdx` under a parent, by
 *  disaggregating the parent's values. Returns [] when `childIdx` is past the deepest level. */
function generateChildrenAtLevel(parentId: string, parentValues: ValueBag, childIdx: number): GridRow[] {
  if (childIdx < 0 || childIdx >= LEVELS.length) return [];
  const def = LEVELS[childIdx];
  const n = childCountFor(parentId);
  const bags = disaggregate(parentValues, n, `${parentId}-dis`);
  const children: GridRow[] = [];
  for (let i = 0; i < n; i++) {
    children.push({
      id: `${parentId}-${childIdx}_${i}`,
      name: nameForLevel(def, i),
      parentId,
      level: childIdx + 1,
      type: def.type,
      values: bags[i],
    });
  }
  return children;
}

/** Generate a deep-hierarchy node's direct children (8–10 of them). Returns an empty array
 *  when the node is a leaf (deepest level) or isn't a deep-hierarchy level. */
export function generateChildren(node: GridRow): GridRow[] {
  const idx = LEVEL_INDEX_BY_TYPE[node.type as string];
  if (idx === undefined || idx >= LEVELS.length - 1) return [];
  return generateChildrenAtLevel(node.id, node.values, idx + 1);
}

/**
 * Grow the tree one level ahead of what's expanded: for every node whose id is in
 * `expandedIds`, make sure each of its (already-materialized) children has its own children
 * generated, so expander chevrons render. Pure — returns a new tree only when something was
 * generated, otherwise `null` (so callers can skip a no-op state update). Safe to call on any
 * dataset: rows whose type isn't a deep-hierarchy level are left untouched.
 */
export function ensureDeepChildren(
  data: MeasureData[],
  expandedIds: Set<string>,
): MeasureData[] | null {
  let changed = false;

  const visit = (node: GridRow): GridRow => {
    const children = node.children;
    if (!children || children.length === 0) return node;

    let nextChildren = children;
    if (expandedIds.has(node.id)) {
      nextChildren = children.map((child) => {
        if ((!child.children || child.children.length === 0) && canGenerateChildren(child.type)) {
          const generated = generateChildren(child);
          if (generated.length > 0) {
            changed = true;
            return { ...child, children: generated };
          }
        }
        return child;
      });
    }

    const recursed = nextChildren.map(visit);
    let recursedChanged = recursed.length !== nextChildren.length;
    if (!recursedChanged) {
      for (let i = 0; i < recursed.length; i++) {
        if (recursed[i] !== nextChildren[i]) { recursedChanged = true; break; }
      }
    }

    if (nextChildren === children && !recursedChanged) return node;
    return { ...node, children: recursed };
  };

  const nextData = data.map((measure) => {
    const visited = visit(measure as unknown as GridRow) as unknown as MeasureData;
    return visited;
  });

  return changed ? nextData : null;
}

/** Build a measure's initial (shallow) hierarchy: the top two account levels are
 *  materialized so the first expand shows 8–10 rows with working expander chevrons;
 *  deeper levels are generated lazily via `ensureDeepChildren`. */
export function buildDeepHierarchy(measureId: string, measureBase: number): GridRow[] {
  const measureValues = leafValues(measureBase, `${measureId}-root`);
  const roots = generateChildrenAtLevel(measureId, measureValues, 0);
  // Materialize one level deeper so the top-level rows show expander chevrons up front.
  return roots.map((root) => ({ ...root, children: generateChildren(root) }));
}

const MEASURES: { id: string; name: string; base: number }[] = [
  { id: 'measure-sa-qty',        name: 'Sales Agreement Quantity (No.s)',      base: 800 },
  { id: 'measure-sa-rev',        name: 'Sales Agreement Revenue',              base: 80000 },
  { id: 'measure-opp-qty',       name: 'Opportunity Quantity (No.s)',          base: 1200 },
  { id: 'measure-opp-rev',       name: 'Opportunity Revenue',                  base: 120000 },
  { id: 'measure-order-qty',     name: 'Order Quantity (No.s)',                base: 950 },
  { id: 'measure-order-rev',     name: 'Order Revenue',                        base: 95000 },
  { id: 'measure-ly-order-qty',  name: 'Last Year Order Quantity (No.s)',      base: 750 },
  { id: 'measure-ly-order-rev',  name: 'Last Years Order Revenue',             base: 75000 },
  { id: 'measure-forecast-qty',  name: 'Forecasted Quantity (No.s)',           base: 1000 },
  { id: 'measure-forecast-rev',  name: 'Forecasted Revenue',                   base: 100000 },
];

export const deepHierarchyData: MeasureData[] = withForecastAsSum(
  MEASURES.map((m) => {
    const children = buildDeepHierarchy(m.id, m.base);
    return {
      id: m.id,
      name: m.name,
      values: sumValues(children.map((c) => c.values), m.base, m.id),
      children,
    };
  }),
);
