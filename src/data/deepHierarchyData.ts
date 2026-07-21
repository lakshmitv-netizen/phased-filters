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

// Extract a node's measure-independent DIMENSION PATH from its id. Ids look like
// `measure-sa-qty-0_2-1_5-...`, where each `${childIdx}_${i}` segment records the child index `i`
// chosen at that level. The path is the sequence of those `i` values, so the same tree position
// yields the same path (and thus the same names) across every measure.
function pathFromParentId(parentId: string): number[] {
  const segs = parentId.match(/\d+_\d+/g);
  if (!segs) return [];
  return segs.map((s) => parseInt(s.split('_')[1], 10));
}

// Children per level: a FIXED count per level (min === max), tapering from wide at the top to
// narrow at the bottom. Two reasons for a fixed (not ranged) count:
//   1. A flat 8–10 children across all 10 levels divides each parent's value ~9x ten times
//      over, collapsing leaf rows to 0; tapering keeps deep rows non-zero.
//   2. A UNIFORM count means every parent at a level has exactly the members the Filters panel
//      advertises (DEEP_LEVEL_OPTIONS below). If the count varied per parent, the dropdown
//      would list names some parents lack, so selecting one would filter all of that parent's
//      children out and its chevron would open to an empty set.
const LEVEL_CHILD_COUNTS: Array<[number, number]> = [
  [6, 6], // 0: Global Account Group
  [5, 5], // 1: Strategic Account Group
  [5, 5], // 2: Segment
  [4, 4], // 3: Sold-to
  [3, 3], // 4: Ship-to
  [2, 2], // 5: Company
  [2, 2], // 6: Business Unit
  [2, 2], // 7: Product Family
  [2, 2], // 8: Commodity
  [2, 2], // 9: Part
];

/**
 * Deterministic child names for one parent, derived from the parent's dimension path (so they're
 * the same across measures). The key property: SIBLING parents never share the same set of
 * children. Each parent is assigned a contiguous block of its level's name pool; the block index
 * shifts by the parent's own index among its siblings, so adjacent siblings get different,
 * non-overlapping blocks (e.g. "Transmission Family" and "Driveline Family" get different
 * commodities). Names can still recur across DIFFERENT branches, which is realistic.
 *
 * `parentPath` is the parent's dimension path (length === childIdx); pass [] for the root.
 */
export function deepChildNames(parentPath: number[], childIdx: number): string[] {
  const def = LEVELS[childIdx];
  if (!def) return [];
  const pool = def.names;
  const n = Math.min(LEVEL_CHILD_COUNTS[childIdx]?.[0] ?? pool.length, pool.length);
  const ancestor = parentPath.length ? parentPath.slice(0, -1).join('.') : 'root';
  const last = parentPath.length ? parentPath[parentPath.length - 1] : 0;
  // The root has a single parent (no siblings), so start at the pool's natural order — this keeps
  // the top level as the original Acme Partners / MagnaDrive / Globex / Initech / ... list. Deeper
  // levels use a per-ancestor offset so sibling parents get different blocks.
  const base = parentPath.length
    ? Math.floor(seededRandom(`deepname:${childIdx}:${ancestor}`) * pool.length)
    : 0;
  const blocks = Math.floor(pool.length / n);
  const out: string[] = [];
  if (blocks >= 2) {
    // Pool big enough for disjoint blocks → sibling sets never overlap.
    const start = ((((base % blocks) + last) % blocks) + blocks) % blocks * n;
    for (let i = 0; i < n; i++) out.push(pool[(start + i) % pool.length]);
  } else {
    // Small pool: rotate by a per-parent offset so sibling sets still differ (may overlap).
    const start = (((base + last) % pool.length) + pool.length) % pool.length;
    for (let i = 0; i < n; i++) out.push(pool[(start + i) % pool.length]);
  }
  return out;
}

/**
 * Cascaded option names for `targetType`, honoring the current selections on ANCESTOR levels.
 * The deep grid is lazy, so we can't scan a live tree; instead we regenerate names deterministically
 * from the root, descending only through members selected at each ancestor level, and collect the
 * distinct names produced at the target level. Stops early once the whole pool is covered.
 */
export function deepCascadedOptions(
  selectionsByRowType: Map<string, Set<string>>,
  targetType: string,
): string[] {
  const targetIdx = LEVEL_INDEX_BY_TYPE[targetType];
  if (targetIdx === undefined) return [];
  const pool = LEVELS[targetIdx].names;
  const seen = new Set<string>();

  const dfs = (parentPath: number[], level: number): void => {
    if (seen.size >= pool.length) return;
    const names = deepChildNames(parentPath, level);
    if (level === targetIdx) {
      names.forEach((nm) => seen.add(nm));
      return;
    }
    const sel = selectionsByRowType.get(LEVELS[level].type);
    names.forEach((nm, i) => {
      if (sel && sel.size > 0 && !sel.has(nm)) return;
      dfs([...parentPath, i], level + 1);
    });
  };
  dfs([], 0);

  return Array.from(seen).sort((a, b) => pool.indexOf(a) - pool.indexOf(b));
}

// Full per-level option pools (rowType -> every member name that can appear at that level). The
// deep grid materializes rows lazily, so scanning the live tree would miss members in unexpanded
// branches. Since children names are now assigned per-parent from the whole pool, the complete set
// of possible names at a level is the entire pool. `deepCascadedOptions` narrows this to the
// members reachable under the currently-selected ancestors; this serves as the un-cascaded fallback.
export const DEEP_LEVEL_OPTIONS: Record<string, string[]> = LEVELS.reduce((acc, def) => {
  acc[def.type] = def.names;
  return acc;
}, {} as Record<string, string[]>);

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
  const names = deepChildNames(pathFromParentId(parentId), childIdx);
  const n = names.length;
  const bags = disaggregate(parentValues, n, `${parentId}-dis`);
  const children: GridRow[] = [];
  for (let i = 0; i < n; i++) {
    children.push({
      id: `${parentId}-${childIdx}_${i}`,
      name: names[i],
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

/**
 * Build a dimension-filtered deep tree by REGENERATING (deterministically) only the branches
 * whose members match the given per-level selections, down to the deepest selected level.
 *
 * Why this exists: the deep grid materializes rows lazily, so pruning the live (partial) tree
 * would drop any filter set on a level that hasn't been expanded yet — collapsing branches to
 * empty. Because generation is deterministic (seeded from ids + the parent's values), we can
 * rebuild exactly the matching branches on demand instead. Kept nodes retain their FULL values
 * (so parent totals still include filtered-out children), and one extra level below the deepest
 * selected level is materialized so expander chevrons render; deeper levels grow lazily.
 *
 * `selectionsByRowType` maps a level's rowType (e.g. 'acct-soldto') to the set of selected member
 * names. Levels with no entry keep all their children.
 */
export function buildFilteredDeepTree(
  measures: MeasureData[],
  selectionsByRowType: Map<string, Set<string>>,
): MeasureData[] {
  let deepestSelectedIdx = -1;
  LEVELS.forEach((lvl, i) => {
    if (selectionsByRowType.has(lvl.type)) deepestSelectedIdx = Math.max(deepestSelectedIdx, i);
  });
  if (deepestSelectedIdx < 0) return measures;

  const buildChildren = (parentId: string, parentValues: ValueBag, childIdx: number): GridRow[] => {
    if (childIdx >= LEVELS.length) return [];
    const generated = generateChildrenAtLevel(parentId, parentValues, childIdx);
    const sel = selectionsByRowType.get(LEVELS[childIdx].type);
    const kept = sel ? generated.filter((c) => sel.has(c.name)) : generated;
    if (childIdx < deepestSelectedIdx) {
      return kept.map((c) => ({ ...c, children: buildChildren(c.id, c.values, childIdx + 1) }));
    }
    // Deepest selected level reached: materialize one more level so chevrons render; below here
    // there's no filter, so keep every child. Deeper levels grow lazily via ensureDeepChildren.
    return kept.map((c) => ({ ...c, children: generateChildren(c) }));
  };

  return measures.map((m) => ({
    ...m,
    children: buildChildren(m.id, (m as unknown as GridRow).values, 0),
  }));
}

// Bases are the measure's monthly value at the very top, which gets disaggregated down the
// 10-level tree. They're deliberately large so that after the (tapered) per-level splits the
// child-most Part rows still carry meaningful, multi-digit numbers instead of collapsing to 0.
const MEASURES: { id: string; name: string; base: number }[] = [
  { id: 'measure-sa-qty',        name: 'Sales Agreement Quantity (No.s)',      base: 2_000_000 },
  { id: 'measure-sa-rev',        name: 'Sales Agreement Revenue',              base: 200_000_000 },
  { id: 'measure-opp-qty',       name: 'Opportunity Quantity (No.s)',          base: 3_000_000 },
  { id: 'measure-opp-rev',       name: 'Opportunity Revenue',                  base: 300_000_000 },
  { id: 'measure-order-qty',     name: 'Order Quantity (No.s)',                base: 2_400_000 },
  { id: 'measure-order-rev',     name: 'Order Revenue',                        base: 240_000_000 },
  { id: 'measure-ly-order-qty',  name: 'Last Year Order Quantity (No.s)',      base: 1_900_000 },
  { id: 'measure-ly-order-rev',  name: 'Last Years Order Revenue',             base: 190_000_000 },
  { id: 'measure-forecast-qty',  name: 'Forecasted Quantity (No.s)',           base: 2_500_000 },
  { id: 'measure-forecast-rev',  name: 'Forecasted Revenue',                   base: 250_000_000 },
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
