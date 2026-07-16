// Acme Partners story dataset for the "manufacturing-acme" grid.
//
// This mirrors the narrative used on the CPM_Story page (Parag's link): a single
// Key Account Manager builds the FY26 plan for Acme Partners. The hierarchy is:
//   Account:  Global Account (Acme Partners) -> Region (North America)
//             -> Division (Light Trucks) -> Plant (Midwest Assembly / Southwest Stamping)
//   Product:  Program (Powertrain, Electronics, ...) -> SKU (part numbers)
//
// Measures:
//   Sales Agreement Quantity, Opportunity Quantity, Order Quantity  (base data)
//   Last Year Order Quantity                                        (prior-year orders)
//   Forecast Quantity = Sales Agreement + Opportunity               (calculated)
//   Sales Manager Target Quantity                                   (manual input)
//
// Values roll up bottom-up so parent totals equal the sum of their children, and
// Forecast Quantity equals SA + Opportunity at every level. Weekly columns
// are added later by getMockData via ensureWeekValues.

import type { MeasureData, GridRow, RowType } from '../types';
import { sumValues } from './deepHierarchyData';

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

/** Build a full values bag (months + quarters + year + cost) from a 12-month array. */
function bag(months: number[], seed: string): ValueBag {
  const m: Record<string, number> = {};
  MONTH_KEYS.forEach((mk, idx) => { m[mk] = months[idx] ?? 0; });
  const q1 = m.jan2026 + m.feb2026 + m.mar2026;
  const q2 = m.apr2026 + m.may2026 + m.jun2026;
  const q3 = m.jul2026 + m.aug2026 + m.sep2026;
  const q4 = m.oct2026 + m.nov2026 + m.dec2026;
  const year = q1 + q2 + q3 + q4;
  const cost = Math.round((year || 1) * (0.45 + seededRandom(`${seed}-cost`) * 0.5));
  return { year, h1: q1 + q2, h2: q3 + q4, q1, q2, q3, q4, ...m, _cost: cost } as unknown as ValueBag;
}

// ── Hierarchy skeleton ──────────────────────────────────────────────────────
interface AcmeNode {
  type: RowType;
  name: string;
  weight?: number; // leaf-only relative size
  children?: AcmeNode[];
}

// Every level below the root has 3–4 children. The tree is generated
// deterministically so the same shape/data appears on every reload.
interface LevelDef {
  type: RowType;
  pool: string[];
  format: (name: string) => string;
}

// Region and Division are generated from name pools. The Plant level and its
// Program children are curated below so the grid matches the CPM_Story talk track.
const LEVEL_DEFS: LevelDef[] = [
  {
    type: 'acme-region',
    pool: ['North America', 'Europe', 'Asia Pacific', 'Latin America'],
    format: (n) => `Acme Partners – ${n}`,
  },
  {
    type: 'acme-division',
    pool: ['Light Trucks', 'Heavy Trucks', 'Passenger Cars', 'Commercial Vans'],
    format: (n) => `Acme Vehicle Division – ${n}`,
  },
];

// The two plant-level agreements from the narrative, always present under every
// division, plus optional extra plants to keep the tree populated (3–4 total).
const AGREEMENT_PLANTS = ['Midwest Assembly', 'Southwest Stamping'];
const EXTRA_PLANTS = ['Northeast Fabrication', 'West Coast Assembly'];

// Program children per plant, matching the talk track:
//   Sales Agreement  → Midwest: Powertrain, Electronics, Thermal · Southwest: Control Arm
//   Opportunity      → Falcon ADAS + E-Motor Housing at Midwest · RWD Subframe at Southwest
const PLANT_PROGRAMS: Record<string, string[]> = {
  'Midwest Assembly': ['Powertrain', 'Electronics', 'Thermal', 'Falcon ADAS', 'E-Motor Housing'],
  'Southwest Stamping': ['Control Arm', 'RWD Subframe'],
  'Northeast Fabrication': ['Chassis', 'Body-in-White', 'Interior Systems'],
  'West Coast Assembly': ['Battery Pack', 'Skateboard Platform', 'HVAC Module'],
};

const SKU_PREFIX: Record<string, string> = {
  Powertrain: 'PWT',
  Electronics: 'ECU',
  Thermal: 'THR',
  'Falcon ADAS': 'ADAS',
  'E-Motor Housing': 'EMH',
  'Control Arm': 'CTRL',
  'RWD Subframe': 'RWD',
  'Battery Pack': 'BAT',
  'Skateboard Platform': 'SKB',
  'HVAC Module': 'HVAC',
  Chassis: 'CHS',
  'Body-in-White': 'BIW',
  'Interior Systems': 'INT',
};

/** 3 or 4 children, chosen deterministically from the seed. */
const childCount = (seed: string): number => (seededRandom(`${seed}-n`) < 0.5 ? 3 : 4);

/**
 * Pick the first `count` names from a pool, in pool order. Taking from the start (rather
 * than a seed-rotated offset) guarantees the narrative anchors are always present and first:
 * the first region is "North America" and its first division is "Light Trucks", so the
 * North America → Light Trucks → Midwest Assembly / Southwest Stamping path always exists.
 */
function pickNames(pool: string[], count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count && i < pool.length; i++) {
    out.push(pool[i]);
  }
  return out;
}

function buildSkus(programName: string, seed: string): AcmeNode[] {
  const n = childCount(seed);
  const prefix = SKU_PREFIX[programName] ?? programName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  const skus: AcmeNode[] = [];
  for (let i = 0; i < n; i++) {
    const s = `${seed}-sku-${i}`;
    const code = 100 * (i + 1) + Math.floor(seededRandom(s) * 90);
    const weight = 0.7 + seededRandom(`${s}-w`) * 0.9;
    skus.push({ type: 'acme-sku' as RowType, name: `${prefix}-${code}`, weight });
  }
  return skus;
}

/** Program nodes for a plant (curated), each with its own SKU children. */
function buildPrograms(plantName: string, seed: string): AcmeNode[] {
  const programs = PLANT_PROGRAMS[plantName] ?? ['Powertrain', 'Electronics', 'Thermal'];
  return programs.map((name, i) => ({
    type: 'acme-program' as RowType,
    name,
    children: buildSkus(name, `${seed}-${i}`),
  }));
}

/** Plants under a division: the two agreement plants plus 1–2 extras (3–4 total). */
function buildPlants(seed: string): AcmeNode[] {
  const names = [...AGREEMENT_PLANTS];
  const extra = childCount(seed) - AGREEMENT_PLANTS.length;
  for (let i = 0; i < extra && i < EXTRA_PLANTS.length; i++) names.push(EXTRA_PLANTS[i]);
  return names.map((name, i) => ({
    type: 'acme-plant' as RowType,
    name,
    children: buildPrograms(name, `${seed}-${i}`),
  }));
}

function buildLevel(levelIdx: number, seed: string): AcmeNode[] {
  const def = LEVEL_DEFS[levelIdx];
  const names = pickNames(def.pool, childCount(seed));
  return names.map((name, i) => {
    const childSeed = `${seed}-${i}`;
    const isDivisionLevel = levelIdx === LEVEL_DEFS.length - 1;
    return {
      type: def.type,
      name: def.format(name),
      children: isDivisionLevel ? buildPlants(childSeed) : buildLevel(levelIdx + 1, childSeed),
    };
  });
}

const ACME_ROOT: AcmeNode = {
  type: 'acme-global',
  name: 'Acme Partners',
  children: buildLevel(0, 'acme'),
};

// Per-leaf-month base quantities. SA + Opp compose Forecast Quantity.
const SA_BASE = 1500;
const OPP_BASE = 950;
const ORDER_BASE = 1300;

interface LeafEconomics {
  sa: number[];
  opp: number[];
  order: number[];
  ly: number[];
  forecast: number[];
  smtarget: number[];
}

/** Deterministic monthly economics for one SKU leaf. */
function computeLeafEconomics(key: string, weight: number): LeafEconomics {
  const phase = seededRandom(key) * Math.PI * 2;
  const sa: number[] = [];
  const opp: number[] = [];
  const order: number[] = [];
  const ly: number[] = [];
  const forecast: number[] = [];
  const smtarget: number[] = [];
  for (let idx = 0; idx < 12; idx++) {
    const seasonal = 1 + Math.sin((idx / 12) * Math.PI * 2 + phase) * 0.12;
    const jSa = 0.9 + seededRandom(`${key}-sa-${idx}`) * 0.2;
    const jOpp = 0.9 + seededRandom(`${key}-opp-${idx}`) * 0.2;
    const jOrd = 0.9 + seededRandom(`${key}-ord-${idx}`) * 0.2;
    const saV = Math.round(SA_BASE * weight * seasonal * jSa);
    const oppV = Math.round(OPP_BASE * weight * seasonal * jOpp);
    const ordV = Math.round(ORDER_BASE * weight * seasonal * jOrd);
    const fV = saV + oppV; // Forecast Quantity = Sales Agreement + Opportunity
    sa.push(saV);
    opp.push(oppV);
    order.push(ordV);
    ly.push(Math.round(ordV * (0.85 + seededRandom(`${key}-ly-${idx}`) * 0.1)));
    forecast.push(fV);
    smtarget.push(Math.round(fV * 1.08));
  }
  return { sa, opp, order, ly, forecast, smtarget };
}

type MeasureKind = keyof LeafEconomics;

// Precompute economics once per leaf, keyed by a stable path.
const ECONOMICS = new Map<string, LeafEconomics>();
(function populate(node: AcmeNode, path: string) {
  if (!node.children || node.children.length === 0) {
    ECONOMICS.set(path, computeLeafEconomics(path, node.weight ?? 1));
    return;
  }
  node.children.forEach((c, i) => populate(c, `${path}-${i}`));
})(ACME_ROOT, 'acme');

function buildMeasureNode(
  node: AcmeNode,
  kind: MeasureKind,
  measureId: string,
  parentId: string,
  level: number,
  path: string,
): GridRow {
  const id = `${path}-${measureId}`;
  if (!node.children || node.children.length === 0) {
    const econ = ECONOMICS.get(path)!;
    return {
      id,
      name: node.name,
      parentId,
      level,
      type: node.type,
      values: bag(econ[kind], id),
    };
  }
  const children = node.children.map((c, i) =>
    buildMeasureNode(c, kind, measureId, id, level + 1, `${path}-${i}`),
  );
  return {
    id,
    name: node.name,
    parentId,
    level,
    type: node.type,
    values: sumValues(children.map((c) => c.values), 0, id),
    children,
  };
}

const MEASURE_DEFS: { id: string; name: string; kind: MeasureKind }[] = [
  { id: 'measure-sa-qty', name: 'Sales Agreement Quantity (No.s)', kind: 'sa' },
  { id: 'measure-opp-qty', name: 'Opportunity Quantity (No.s)', kind: 'opp' },
  { id: 'measure-order-qty', name: 'Order Quantity (No.s)', kind: 'order' },
  { id: 'measure-ly-order-qty', name: 'Last Year Order Quantity (No.s)', kind: 'ly' },
  { id: 'measure-forecast-qty', name: 'Forecast Quantity (No.s)', kind: 'forecast' },
  { id: 'measure-sm-target-qty', name: 'Sales Manager Target Quantity (No.s)', kind: 'smtarget' },
];

export const acmeHierarchyData: MeasureData[] = MEASURE_DEFS.map((m) => {
  const root = buildMeasureNode(ACME_ROOT, m.kind, m.id, m.id, 1, 'acme');
  return {
    id: m.id,
    name: m.name,
    values: root.values,
    children: [root],
  };
});

// ── Generic single-amount variant (reused by adjustment measures) ────────────
// Distributes `measureBase` (per month) across leaves by weight, then rolls up.
const TOTAL_WEIGHT = (() => {
  let sum = 0;
  (function walk(node: AcmeNode) {
    if (!node.children || node.children.length === 0) { sum += node.weight ?? 1; return; }
    node.children.forEach(walk);
  })(ACME_ROOT);
  return sum;
})();

function buildAmountNode(
  node: AcmeNode,
  measureId: string,
  measureBase: number,
  parentId: string,
  level: number,
  path: string,
): GridRow {
  const id = `${path}-${measureId}`;
  if (!node.children || node.children.length === 0) {
    const weight = node.weight ?? 1;
    const phase = seededRandom(`${path}-${measureId}`) * Math.PI * 2;
    const months: number[] = [];
    for (let idx = 0; idx < 12; idx++) {
      const seasonal = 1 + Math.sin((idx / 12) * Math.PI * 2 + phase) * 0.1;
      const jitter = 0.9 + seededRandom(`${path}-${measureId}-${idx}`) * 0.2;
      months.push(Math.round((measureBase / TOTAL_WEIGHT) * weight * seasonal * jitter));
    }
    return { id, name: node.name, parentId, level, type: node.type, values: bag(months, id) };
  }
  const children = node.children.map((c, i) =>
    buildAmountNode(c, measureId, measureBase, id, level + 1, `${path}-${i}`),
  );
  return {
    id,
    name: node.name,
    parentId,
    level,
    type: node.type,
    values: sumValues(children.map((c) => c.values), measureBase, id),
    children,
  };
}

/** Single-amount Acme hierarchy (roots) scaled so the top total ≈ measureBase; for adjustment measures. */
export function buildAcmeHierarchy(measureId: string, measureBase: number): GridRow[] {
  return [buildAmountNode(ACME_ROOT, measureId, measureBase, measureId, 1, 'acme')];
}
