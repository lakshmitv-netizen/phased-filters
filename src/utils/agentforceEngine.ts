import { MeasureData, GridRow } from '../types';
import { FocusGridParams } from '../components/AlertsPanel';

// ── Public types ─────────────────────────────────────────────────────────────
export interface FilterChip {
  label: string;
  value: string;
}

export interface AgentResponse {
  /** The conversational, grounded answer. */
  answer: string;
  /** Grounded data points the agent cites. */
  bullets: string[];
  /** Preview of the filters the agent would apply (shown as chips). */
  filterPreview: FilterChip[];
  /** Params passed to handleFocusGrid for "Show on grid" + "Edit filters". */
  focusParams: FocusGridParams;
  /**
   * Boolean expression over the Advanced-filter numbers the agent derived
   * (1=Measure, 2=Account, 3=Category, 4=Products, 5=Time). Pre-populated into
   * the Filters panel's "Filter Logic" box so the user sees how the criteria combine.
   */
  filterLogic: string;
  /** Contextual questions the user is likely to ask next. */
  followUps: string[];
}

// Canonical follow-up questions (worded so the intent classifier routes them correctly).
const Q_FOCUS = 'What accounts should I focus on right now?';
const Q_WHY = 'Why is revenue low this period?';
const Q_PRODUCTS = 'Which products are underperforming?';
const Q_TOP = 'Where are my biggest opportunities?';

/**
 * Fixed Advanced-filter card numbers in the Filters panel, so the agent can build a
 * Filter Logic expression that lines up with what it pre-populates.
 */
const FILTER_NO = { measure: 1, account: 2, category: 3, products: 4, time: 5 } as const;

/** Join filter numbers into an AND expression (e.g. [1,2] -> "1 AND 2"). */
function andLogic(...nos: number[]): string {
  return nos.join(' AND ');
}

export interface StarterPrompt {
  id: string;
  label: string;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  { id: 'focus', label: 'What accounts should I focus on right now?' },
  { id: 'why', label: 'Why is revenue low this period?' },
  { id: 'products', label: 'Which products are underperforming?' },
  { id: 'top', label: 'Where are my biggest opportunities?' },
];

// ── Month helpers ────────────────────────────────────────────────────────────
const MONTHS: Array<[keyof GridRow['values'] & string, string]> = [
  ['jan2026', 'Jan 26'], ['feb2026', 'Feb 26'], ['mar2026', 'Mar 26'],
  ['apr2026', 'Apr 26'], ['may2026', 'May 26'], ['jun2026', 'Jun 26'],
  ['jul2026', 'Jul 26'], ['aug2026', 'Aug 26'], ['sep2026', 'Sep 26'],
  ['oct2026', 'Oct 26'], ['nov2026', 'Nov 26'], ['dec2026', 'Dec 26'],
];
const H1 = MONTHS.slice(0, 6);

function fmtCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

// ── Grounding helpers ────────────────────────────────────────────────────────
function isCurrencyMeasure(m: MeasureData): boolean {
  return /revenue/i.test(m.name);
}

/** Pick the most "headline" measure to reason about: Order Revenue > any Revenue > first. */
function pickPrimaryMeasure(data: MeasureData[]): MeasureData | null {
  if (data.length === 0) return null;
  return (
    data.find((m) => /order revenue/i.test(m.name)) ||
    data.find((m) => /sales agreement revenue/i.test(m.name)) ||
    data.find((m) => isCurrencyMeasure(m)) ||
    data[0]
  );
}

/**
 * Top-level rows of a measure — the first hierarchy level, treated as the
 * "accounts" to rank. Resolved structurally (depth 0) rather than by a hardcoded
 * row type, so it works across every scheme: the legacy 3-level grid ('account'),
 * the deep/Acme grids ('acct-global', …) and config-generated grids ('cfg-0-*').
 */
function topLevelRows(measure: MeasureData): GridRow[] {
  return measure.children ?? [];
}

/**
 * Roll a column up from the leaf products — matching how the grid displays parent
 * totals (fullHierarchy). Parent rows store independent values in the mock data, so
 * reading them directly would disagree with the grid; summing the leaves keeps the
 * agent's numbers consistent with what the user sees.
 */
function rollupColumn(row: GridRow, key: keyof GridRow['values']): number {
  if (row.children && row.children.length > 0) {
    return row.children.reduce((s, c) => s + rollupColumn(c, key), 0);
  }
  const v = row.values[key];
  if (typeof v === 'number') return v;
  if (key === 'year') return MONTHS.reduce((s, [k]) => s + (row.values[k] ?? 0), 0);
  return 0;
}

/** Measure-level rollup: sum the rolled-up column across all of the measure's rows. */
function measureColumn(measure: MeasureData, key: keyof GridRow['values']): number {
  return measure.children.reduce((s, c) => s + rollupColumn(c, key), 0);
}

function yearValue(row: GridRow): number {
  return rollupColumn(row, 'year');
}

interface ProductInstance {
  name: string;
  account: string;
  category: string;
  val: number;
}

/** Every leaf row (deepest level = the "products"/SKUs) with its top-level
 *  ancestor as the account and its immediate parent as the category. Resolved by
 *  tree position (leaf = no children, account = depth 0) so it works across the
 *  legacy, deep/Acme and config grids regardless of their row type ids. */
function productInstances(measure: MeasureData): ProductInstance[] {
  const out: ProductInstance[] = [];
  const walk = (rows: GridRow[] | undefined, depth: number, account: string, category: string) => {
    if (!rows) return;
    for (const r of rows) {
      const acct = depth === 0 ? r.name : account;
      const isLeaf = !r.children || r.children.length === 0;
      if (isLeaf) {
        out.push({ name: r.name, account: acct || r.name, category, val: yearValue(r) });
      } else {
        // The level whose children are all leaves acts as the "category" group.
        const childrenAreLeaves = r.children!.every((c) => !c.children || c.children.length === 0);
        walk(r.children, depth + 1, acct, childrenAreLeaves ? r.name : category);
      }
    }
  };
  walk(measure.children, 0, '', '');
  return out;
}

function fmtValue(measure: MeasureData, n: number): string {
  return isCurrencyMeasure(measure) ? fmtCurrency(n) : `${fmtNumber(n)} units`;
}

// ── Intent classification ────────────────────────────────────────────────────
type Intent = 'products' | 'opportunities' | 'whyLow' | 'time' | 'focusAccounts' | 'summary';

function classify(q: string): Intent {
  const s = q.toLowerCase();
  if (/(product|sku|item)/.test(s)) return 'products';
  if (/(top|best|grow|opportun|invest|strongest|upside|winning)/.test(s)) return 'opportunities';
  if (/(why|low|drop|declin|weak|underperf|down|lag|behind plan|falling|slump)/.test(s)) return 'whyLow';
  if (/(quarter|q1|q2|q3|q4|this period|month|season)/.test(s)) return 'time';
  if (/(focus|account|attention|at risk|risk|priorit|where should)/.test(s)) return 'focusAccounts';
  return 'summary';
}

// ── Intent builders ──────────────────────────────────────────────────────────
function buildFocusAccounts(data: MeasureData[]): AgentResponse | null {
  const measure = pickPrimaryMeasure(data);
  if (!measure) return null;
  const accounts = topLevelRows(measure)
    .map((a) => ({ name: a.name, val: yearValue(a) }))
    .sort((a, b) => a.val - b.val);
  if (accounts.length === 0) return null;

  const n = Math.min(3, accounts.length);
  const bottom = accounts.slice(0, n);
  const top = accounts[accounts.length - 1];
  const names = bottom.map((b) => b.name);
  const gap = top.val - bottom[0].val;
  const cutoff = bottom[bottom.length - 1].val; // the Bottom-N boundary value

  const single = accounts.length === 1;
  return {
    answer: single
      ? `There's just **1 account** in view — ${bottom[0].name} at ${fmtValue(measure, bottom[0].val)} for FY26 ${measure.name}.\n` +
        `That's your entire book right now, so all focus goes here.`
      : `I ranked all ${accounts.length} accounts by FY26 ${measure.name} and pulled the **bottom ${n}** — each under ${fmtValue(measure, cutoff)}.\n` +
        `${bottom[0].name} is furthest behind at ${fmtValue(measure, bottom[0].val)}, about ${fmtValue(measure, gap)} below your strongest account (${top.name}).\n` +
        `Starting here closes the biggest part of the gap.`,
    bullets: bottom.map((b, i) => `${i + 1}. ${b.name} — ${fmtValue(measure, b.val)} (FY26)`),
    filterPreview: [
      { label: 'Measure', value: measure.name },
      { label: 'Column filter', value: `FY26 · Account Bottom ${n}` },
      { label: `Accounts (Bottom ${n})`, value: names.join(', ') },
    ],
    focusParams: {
      measures: [measure.name],
      accounts: names,
      dimensionLevel: 'account',
      timeGranularities: ['month', 'year'],
      bottomNColumnFilter: {
        n,
        dimension: 'account',
        measureId: measure.id,
        columnKey: 'year',
        operator: 'bottomN',
      },
      // Order the surfaced accounts weakest-first so the grid matches the ranked list.
      sort: { dimension: 'account', measureId: measure.id, direction: 'asc' },
    },
    filterLogic: andLogic(FILTER_NO.measure, FILTER_NO.account),
    followUps: [
      `Why is ${bottom[0].name} underperforming?`,
      Q_PRODUCTS,
      Q_TOP,
    ],
  };
}

function buildOpportunities(data: MeasureData[]): AgentResponse | null {
  const measure = pickPrimaryMeasure(data);
  if (!measure) return null;
  const accounts = topLevelRows(measure)
    .map((a) => ({ name: a.name, val: yearValue(a) }))
    .sort((a, b) => b.val - a.val);
  if (accounts.length === 0) return null;

  const n = Math.min(3, accounts.length);
  const top = accounts.slice(0, n);
  const names = top.map((t) => t.name);
  const total = accounts.reduce((s, a) => s + a.val, 0);
  const share = total > 0 ? Math.round((top.reduce((s, a) => s + a.val, 0) / total) * 100) : 0;
  const cutoff = top[top.length - 1].val;

  return {
    answer:
      `I ranked all accounts by FY26 ${measure.name} — your **top ${n}** each clear ${fmtValue(measure, cutoff)}.\n` +
      `Together they drive about ${share}% of the total, so wins here compound fastest.\n` +
      `${top[0].name} leads at ${fmtValue(measure, top[0].val)}.`,
    bullets: top.map((t, i) => `${i + 1}. ${t.name} — ${fmtValue(measure, t.val)} (FY26)`),
    filterPreview: [
      { label: 'Measure', value: measure.name },
      { label: 'Column filter', value: `FY26 · Account Top ${n}` },
      { label: `Accounts (Top ${n})`, value: names.join(', ') },
    ],
    focusParams: {
      measures: [measure.name],
      accounts: names,
      dimensionLevel: 'account',
      timeGranularities: ['month', 'year'],
      bottomNColumnFilter: {
        n,
        dimension: 'account',
        measureId: measure.id,
        columnKey: 'year',
        operator: 'topN',
      },
      // Order the surfaced accounts strongest-first so the grid matches the ranked list.
      sort: { dimension: 'account', measureId: measure.id, direction: 'desc' },
    },
    filterLogic: andLogic(FILTER_NO.measure, FILTER_NO.account),
    followUps: [
      Q_FOCUS,
      Q_PRODUCTS,
      Q_WHY,
    ],
  };
}

function buildWhyLow(data: MeasureData[], question = ''): AgentResponse | null {
  const measure = pickPrimaryMeasure(data);
  if (!measure) return null;
  const accounts = topLevelRows(measure);
  if (accounts.length === 0) return null;

  const buildFor = (a: GridRow) => {
    const first = rollupColumn(a, H1[0][0]);
    const last = rollupColumn(a, H1[H1.length - 1][0]);
    const declinePct = first > 0 ? (first - last) / first : 0;
    return { row: a, declinePct, first, last };
  };

  // If the question names a specific account, analyse that one; else pick the steepest H1 decline.
  const q = question.toLowerCase();
  const named = accounts.find((a) => q.includes(a.name.toLowerCase()));
  let worst: { row: GridRow; declinePct: number; first: number; last: number } | null = named
    ? buildFor(named)
    : null;
  if (!worst) {
    for (const a of accounts) {
      const cand = buildFor(a);
      if (!worst || cand.declinePct > worst.declinePct) worst = cand;
    }
  }
  if (!worst) return null;

  // Identify the weakest single H1 month for that account.
  let troughLabel = H1[0][1];
  let troughKey: keyof GridRow['values'] & string = H1[0][0];
  let troughVal = Infinity;
  for (const [k, label] of H1) {
    const v = rollupColumn(worst.row, k);
    if (v < troughVal) {
      troughVal = v;
      troughLabel = label;
      troughKey = k;
    }
  }

  const pct = Math.round(worst.declinePct * 100);
  const trendSentence =
    pct > 0
      ? `It's down ${pct}% across H1 — from ${fmtValue(measure, worst.first)} in ${H1[0][1]} to ${fmtValue(measure, worst.last)} in ${H1[H1.length - 1][1]}.`
      : `It's running below the other accounts for most of H1.`;

  return {
    answer:
      `I compared every account's first-half trend on ${measure.name}, and ${worst.row.name} is the clear drag this period.\n` +
      `${trendSentence}\n` +
      `The weakest month is **${troughLabel}** at ${fmtValue(measure, troughVal)} — I've highlighted that cell so you can see exactly where the dip starts.`,
    bullets: [
      `${worst.row.name} — ${H1[0][1]}: ${fmtValue(measure, worst.first)} → ${H1[H1.length - 1][1]}: ${fmtValue(measure, worst.last)}`,
      `Trough month: ${troughLabel} (${fmtValue(measure, troughVal)})`,
    ],
    filterPreview: [
      { label: 'Measure', value: measure.name },
      { label: 'Account', value: worst.row.name },
      { label: 'Time', value: `${H1[0][1]} – ${H1[H1.length - 1][1]}` },
    ],
    focusParams: {
      measures: [measure.name],
      accounts: [worst.row.name],
      startPeriod: 'jan2026',
      endPeriod: 'jun2026',
      highlight: {
        name: `Root cause · ${worst.row.name} ${troughLabel}`,
        cellKeys: [`${worst.row.id}-${troughKey}`],
      },
    },
    filterLogic: andLogic(FILTER_NO.measure, FILTER_NO.account, FILTER_NO.time),
    followUps: [
      `Which products are dragging ${worst.row.name} down?`,
      Q_FOCUS,
      Q_TOP,
    ],
  };
}

function buildProducts(data: MeasureData[]): AgentResponse | null {
  const measure = pickPrimaryMeasure(data);
  if (!measure) return null;

  // Rank every individual SKU row (a SKU repeats across accounts) by FY26 value and
  // pull the weakest three — the exact rows the grid's Bottom-3 column filter surfaces.
  const all = productInstances(measure).sort((a, b) => a.val - b.val);
  if (all.length === 0) return null;

  const n = Math.min(3, all.length);
  const products = all.slice(0, n);
  const cutoff = products[products.length - 1].val; // the Bottom-N boundary value
  const label = (p: ProductInstance) => `${p.name} · ${p.account}`;

  return {
    answer:
      `I ranked all ${all.length} SKU rows by FY26 ${measure.name} and pulled the **bottom ${n}** — each under ${fmtValue(measure, cutoff)}.\n` +
      `${label(products[0])} is the softest at ${fmtValue(measure, products[0].val)}.\n` +
      `I've expanded the grid to just these rows so you can see what's dragging on the number.`,
    bullets: products.map((p, i) => `${i + 1}. ${label(p)} — ${fmtValue(measure, p.val)} (FY26)`),
    filterPreview: [
      { label: 'Measure', value: measure.name },
      { label: 'Column filter', value: `FY26 · Product Bottom ${n}` },
      { label: `SKUs (Bottom ${n})`, value: products.map(label).join(', ') },
    ],
    focusParams: {
      measures: [measure.name],
      dimensionLevel: 'product',
      timeGranularities: ['month', 'year'],
      // Rank across the whole grid (not per-parent) so exactly N product rows show.
      preserveHierarchy: false,
      // Expand the full account → category → product tree so rows correlate with the answer.
      expandHierarchy: true,
      bottomNColumnFilter: {
        n,
        dimension: 'product',
        measureId: measure.id,
        columnKey: 'year',
        operator: 'bottomN',
      },
    },
    filterLogic: andLogic(FILTER_NO.measure, FILTER_NO.products),
    followUps: [
      Q_FOCUS,
      Q_WHY,
      Q_TOP,
    ],
  };
}

function buildTime(data: MeasureData[]): AgentResponse | null {
  const measure = pickPrimaryMeasure(data);
  if (!measure) return null;

  // Compare quarters using rolled-up (leaf-summed) measure values, matching the grid.
  const quarters: Array<[string, number, string, string]> = [
    ['Q1', measureColumn(measure, 'q1'), 'jan2026', 'mar2026'],
    ['Q2', measureColumn(measure, 'q2'), 'apr2026', 'jun2026'],
    ['Q3', measureColumn(measure, 'q3'), 'jul2026', 'sep2026'],
    ['Q4', measureColumn(measure, 'q4'), 'oct2026', 'dec2026'],
  ];
  const weakest = [...quarters].sort((a, b) => a[1] - b[1])[0];
  const weakestKey = weakest[0].toLowerCase() as keyof GridRow['values'] & string; // 'q1'..'q4'

  return {
    answer:
      `Comparing ${measure.name} across all four quarters, **${weakest[0]}** is the softest at ${fmtValue(measure, weakest[1])}.\n` +
      `I've highlighted the ${weakest[0]} column so you can see which accounts are pulling it down.`,
    bullets: quarters.map(([q, v]) => `${q}: ${fmtValue(measure, v)}`),
    filterPreview: [
      { label: 'Measure', value: measure.name },
      { label: 'Time (weakest)', value: weakest[0] },
    ],
    focusParams: {
      measures: [measure.name],
      startPeriod: weakest[2],
      endPeriod: weakest[3],
      timeGranularities: ['month', 'quarter'],
      highlight: {
        name: `Weakest period · ${weakest[0]}`,
        timeKeys: [weakestKey],
        measureIds: [measure.id],
        dimensionLevels: ['account'],
      },
    },
    filterLogic: andLogic(FILTER_NO.measure, FILTER_NO.time),
    followUps: [
      Q_FOCUS,
      Q_PRODUCTS,
      Q_TOP,
    ],
  };
}

function buildSummary(data: MeasureData[]): AgentResponse | null {
  // Default: combine a focus recommendation with a light overview.
  const focus = buildFocusAccounts(data);
  if (!focus) return null;
  const measure = pickPrimaryMeasure(data)!;
  const total = topLevelRows(measure).reduce((s, a) => s + yearValue(a), 0);
  return {
    ...focus,
    answer:
      `Here's a quick read on ${measure.name} — total **${fmtValue(measure, total)}** for FY26.\n${focus.answer}`,
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────
export function runAgentQuery(question: string, data: MeasureData[]): AgentResponse {
  const intent = classify(question);
  let res: AgentResponse | null = null;
  switch (intent) {
    case 'products': res = buildProducts(data); break;
    case 'opportunities': res = buildOpportunities(data); break;
    case 'whyLow': res = buildWhyLow(data, question); break;
    case 'time': res = buildTime(data); break;
    case 'focusAccounts': res = buildFocusAccounts(data); break;
    default: res = buildSummary(data); break;
  }

  return (
    res ?? {
      answer:
        "I couldn't find grid data to analyse yet. Once measures and accounts are loaded, ask me what to " +
        'focus on, why a number is low, or where your biggest opportunities are.',
      bullets: [],
      filterPreview: [],
      focusParams: {},
      filterLogic: '',
      followUps: [Q_FOCUS, Q_WHY, Q_TOP],
    }
  );
}
