import React, { useEffect, useRef, useState } from 'react';
import '../styles/pages/PresentationPage.css';
// Real filter-panel styles so the area-2 preview renders with the actual
// implementation's controls (multi-select trigger, dropdown, option rows).
import '../styles/components/FiltersPanel.css';

/* ------------------------------------------------------------------
   Presentation shell — two clearly-labelled tabs:
     • Presentation     → 4 side-by-side "actual vs suggested" comparisons
     • Actual Prototype → the full working prototype (untouched)
------------------------------------------------------------------- */

const GRID_SRC = `${import.meta.env.BASE_URL}home/grid-264`;

type Tab = 'present' | 'proto';

const PresentationPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('present');

  return (
    <div className="pres-shell">
      <div className="pres-topbar">
        <div className="pres-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="#0176d3" strokeWidth="2" />
            <path d="M3 9h18M9 9v11" stroke="#0176d3" strokeWidth="2" />
          </svg>
          Grid Filters — Phase 1 Review
        </div>

        <div className="pres-seg" role="tablist" aria-label="View switcher">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'present'}
            className={`pres-seg-btn${tab === 'present' ? ' pres-seg-btn--active' : ''}`}
            onClick={() => setTab('present')}
          >
            Presentation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'proto'}
            className={`pres-seg-btn${tab === 'proto' ? ' pres-seg-btn--active' : ''}`}
            onClick={() => setTab('proto')}
          >
            <span className="pres-seg-dot" />
            Actual Prototype
          </button>
        </div>

        <a className="pres-openlink" href={GRID_SRC} target="_blank" rel="noreferrer">
          Open prototype ↗
        </a>
      </div>

      <div className="pres-body">
        <div className={`pres-pane${tab === 'present' ? '' : ' pres-pane--hidden'}`}>
          <Phase1Content active={tab === 'present'} />
        </div>
        <div className={`pres-pane${tab === 'proto' ? '' : ' pres-pane--hidden'}`}>
          <iframe className="pres-iframe" src={GRID_SRC} title="Live prototype" />
        </div>
      </div>
    </div>
  );
};

/* ================================================================== */
/* Live embed of the real app, scaled down to a preview and driven    */
/* into a target state. Same-origin, so the parent can click into it. */
/* Lazy-mounts only when scrolled into view (and the tab is active).  */
/* ================================================================== */

const clickFilter = (doc: Document) => {
  const b = Array.from(doc.querySelectorAll('button')).find(
    (x) => (x.getAttribute('title') || '').trim() === 'Filter',
  ) as HTMLButtonElement | undefined;
  if (b) b.click();
};

const LiveEmbed: React.FC<{
  drive?: (doc: Document) => boolean;
  enabled?: boolean;
  /** rendered (unscaled) iframe size; it is scaled to fit the column width */
  baseW?: number;
  baseH?: number;
}> = ({ drive, enabled = true, baseW = 1280, baseH = 900 }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(0.38);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setVisible(true)),
      { rootMargin: '200px' },
    );
    io.observe(el);
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / baseW);
    });
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, [baseW]);

  const handleLoad = () => {
    setReady(true);
    if (!drive) return;
    const iframe = frameRef.current;
    let tries = 0;
    const attempt = () => {
      tries += 1;
      let done = false;
      try {
        const doc = iframe?.contentDocument;
        if (doc) done = drive(doc);
      } catch {
        /* cross-origin guard — not expected on localhost */
      }
      if (!done && tries < 50) window.setTimeout(attempt, 300);
    };
    attempt();
  };

  const mount = enabled && visible;

  return (
    <div className="cmp-frame" ref={wrapRef}>
      {!ready && <div className="cmp-frame-loading">Loading live prototype…</div>}
      {mount && (
        <iframe
          ref={frameRef}
          title="Live prototype"
          src={GRID_SRC}
          onLoad={handleLoad}
          style={{
            width: baseW,
            height: baseH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 'none',
          }}
        />
      )}
    </div>
  );
};

/* ---- drivers for each area (best-effort, guarded against re-click) ---- */

const driveArea1 = (doc: Document): boolean => {
  if (doc.querySelector('.filters-panel')) return true;
  clickFilter(doc);
  return !!doc.querySelector('.filters-panel');
};

const driveArea2 = (doc: Document): boolean => {
  if (!doc.querySelector('.filters-panel')) {
    clickFilter(doc);
    return false;
  }
  const d = doc as Document & { __ddDone?: boolean };
  if (d.__ddDone) return true;
  const combos = Array.from(doc.querySelectorAll('[role="combobox"]')) as HTMLElement[];
  const acct =
    combos.find((c) => (c.getAttribute('aria-label') || c.textContent || '').includes('Account')) ||
    combos[1];
  if (acct) {
    acct.click();
    d.__ddDone = true;
  }
  return true;
};

const driveArea3 = (doc: Document): boolean => {
  if (!doc.querySelector('.filters-panel')) {
    clickFilter(doc);
    return false;
  }
  const d = doc as Document & { __scopeDone?: boolean };
  if (d.__scopeDone) return true;
  const btn = Array.from(doc.querySelectorAll('button')).find((b) =>
    (b.getAttribute('aria-label') || b.textContent || '').includes('Calculation Scope'),
  ) as HTMLButtonElement | undefined;
  if (btn) {
    btn.click();
    d.__scopeDone = true;
  }
  return true;
};

/* ---- suggested side: the SAME live app, with Phase-1 applied ---------- */
/* We load the real prototype and hide exactly what Phase 1 removes        */
/* (Calculation Scope, the Advanced tab, Filter Sets, the "save" tip, and  */
/* the grid's blue totaling bar). These overrides live only inside this    */
/* presentation iframe — the real app code is untouched. Later, "promoting"*/
/* a suggestion means baking these same removals into the app.             */

const P1_OVERRIDE_CSS = `
  .filters-scope-section,
  .filters-tabs,
  .filters-tip-wrap,
  .scoped-notification--grid-totals-hint { display: none !important; }
`;

const injectP1Style = (doc: Document) => {
  if (doc.getElementById('p1-overrides')) return;
  const s = doc.createElement('style');
  s.id = 'p1-overrides';
  s.textContent = P1_OVERRIDE_CSS;
  (doc.head || doc.documentElement).appendChild(s);
};

/* Hide the "Filter Sets" accordion section and collapse the now-lone      */
/* "Filters" heading so the basic filters read as a single clean panel.    */
const trimPanelSections = (doc: Document) => {
  Array.from(doc.querySelectorAll<HTMLElement>('.fs-cards-section')).forEach((s) => {
    const title = (s.querySelector('.fs-cards-title')?.textContent || '').trim();
    if (title === 'Filter Sets') s.style.setProperty('display', 'none', 'important');
    if (title === 'Filters') {
      const heading = s.querySelector<HTMLElement>('.fs-cards-heading');
      if (heading) heading.style.setProperty('display', 'none', 'important');
    }
  });
};

/* Areas 1, 3 & 4 — trimmed Phase-1 panel open on the real app. */
const suggestPanel = (doc: Document): boolean => {
  injectP1Style(doc);
  if (!doc.querySelector('.filters-panel')) {
    clickFilter(doc);
    return false;
  }
  trimPanelSections(doc);
  return false; // keep re-applying while the drive loop runs (survives re-renders)
};

/* ================================================================== */

const Phase1Content: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="p1">
    <div className="p1-inner">
      <header className="p1-hero">
        <p className="p1-eyebrow">Product / Eng Sync · Grid Filters</p>
        <h1>Phase 1: a view-only filter to “jump to the cell I need to edit.”</h1>
        <p>
          Both columns are the <b>same live prototype</b>. The left is the app exactly as it is
          today; the right is that <b>same app with the Phase 1 change applied</b> — so you see how
          it would actually look and behave if we shipped it, not a concept sketch. Phase 1 only
          changes what you <i>see</i> — calculations still run over the full plan.
        </p>
        <div className="p1-scope">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="#0176d3" />
            <path d="M12 7v6m0 4h.01" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>
            <b>Scope:</b> Basic filters + a subtle indicator. &nbsp;<b>Out for P1:</b> calculation
            scope, advanced filters, filter sets.
          </span>
        </div>
      </header>

      {/* Roadmap */}
      <div className="p1-roadmap">
        <div className="p1-phase p1-phase--now">
          <span className="p1-phase-badge">NOW</span>
          <div className="p1-phase-tag">PHASE 1</div>
          <div className="p1-phase-title">View filter</div>
          <div className="p1-phase-sub">Basic filters, subtle indicator, clear.</div>
        </div>
        <div className="p1-phase">
          <div className="p1-phase-tag">PHASE 2</div>
          <div className="p1-phase-title">Advanced filters</div>
          <div className="p1-phase-sub">Contains, ranges, AND/OR, Agentforce.</div>
        </div>
        <div className="p1-phase">
          <div className="p1-phase-tag">PHASE 3</div>
          <div className="p1-phase-title">Filter sets</div>
          <div className="p1-phase-sub">Save &amp; reuse combinations.</div>
        </div>
        <div className="p1-phase">
          <div className="p1-phase-tag">PHASE 4</div>
          <div className="p1-phase-title">Calculation scope</div>
          <div className="p1-phase-sub">Partial agg / disagg over filtered rows.</div>
        </div>
      </div>

      <h2 className="p1-h2">Area-by-area: today vs. Phase 1</h2>
      <p className="p1-h2-sub">
        Both columns are the real app running live — click into either. The right column has the
        Phase 1 change applied at runtime. Net-new ideas that still need to be built (per-level
        dimension dropdowns, a “review changes” panel) are called out in the points below.
      </p>

      {/* 1 — Filter panel */}
      <Comparison
        n={1}
        title="The filter panel"
        intent="Trim the panel from a config surface down to a lightweight “find” tool."
        actualDrive={driveArea1}
        suggestedDrive={suggestPanel}
        active={active}
        points={[
          <>
            <b>Remove for P1:</b> Calculation Scope, the Advanced Filters tab, and Filter Sets (+ the
            “save your filter” tip). <em>(confirm scope — Kaushik)</em>
          </>,
          <>Keep only Basic filters: measures, accounts, category, products, time period.</>,
          <>
            <span className="tag tag-open">OPEN</span> Keep it as a right-side drawer, or move the
            filter entry next to the plan name? <em>(Annie)</em>
          </>,
        ]}
      />

      {/* 2 — Dimension value dropdown */}
      <Comparison
        n={2}
        title="The dimension value dropdown"
        intent="Give each dimension picker hierarchy context instead of a flat list."
        actualDrive={driveArea2}
        suggestedNode={<SuggLevelDropdown />}
        active={active}
        points={[
          <>
            Today it’s a flat multi-select (“All” + a list) with no parent/child context.
          </>,
          <>
            <span className="tag tag-build">TO BUILD</span> <b>Suggested:</b> a{' '}
            <b>separate dropdown per level</b> — Level 0, Level 1, Level 2 are each their own filter
            field, so you drill straight to a deep value one level at a time. <em>(Annie)</em>
          </>,
          <>
            Icons read <b>L0 / L1 / L2</b> in a circle — <b>one hue per dimension, darkening with
            depth</b> — and they match the grid’s row icons exactly. This is the workaround until
            real level annotations exist. <em>(Kaushik)</em>
          </>,
          <>
            Values are global: “Chassis Components” shows wherever it exists — no{' '}
            <em>parent · child</em> subtitles. Narrowing children under one specific parent stays a
            separate row-level control.
          </>,
          <>
            <span className="tag tag-crit">CRITICAL</span> Must reach deep rows that aren’t loaded yet
            — materialize-on-filter or a search index feeding AG&nbsp;Grid. <em>(Scott)</em>
          </>,
        ]}
      />

      {/* 3 — Totaling / applied indicator */}
      <Comparison
        n={3}
        title="Totaling & the “filtered” indicator"
        intent="Stop implying partial totals; make “filtered” a quiet status, not a loud bar."
        actualDrive={driveArea3}
        suggestedDrive={suggestPanel}
        active={active}
        points={[
          <>
            Today a prominent Calculation Scope control + blue totaling bar suggest totals change with
            the filter.
          </>,
          <>
            <b>Suggested:</b> remove scope; totals are always full-plan; replace the loud bar with a
            subtle “Filtered · N” pill by the plan name — click it to see what’s applied.{' '}
            <em>(Annie)</em>
          </>,
          <>
            Per-row cue stays: rows whose children are filtered out keep the{' '}
            <b>orange dot on the level icon</b> (already in today’s design) — signalling the total
            spans visible <em>and</em> hidden rows. See it in area 2’s grid.
          </>,
          <>
            Flip calc defaults back to full-plan totaling &amp; disaggregation. Engine untouched.{' '}
            <em>(Prajwal)</em>
          </>,
          <>
            <span className="tag tag-open">OPEN</span> Subtle indicator vs. a persistent bar — recommend
            subtle.
          </>,
        ]}
      />

      {/* 4 — Edit & impact verification */}
      <Comparison
        n={4}
        title="Editing & verifying impact"
        intent="Let people confirm the full impact of an edit even while a filter hides rows."
        actualDrive={driveArea1}
        suggestedDrive={suggestPanel}
        active={active}
        points={[
          <>Editing a filtered cell still recalculates the full plan — unchanged from today.</>,
          <>
            <span className="tag tag-crit">CRITICAL</span> Modified/impacted highlighting must persist
            when the filter is toggled off. <em>(Scott)</em>
          </>,
          <>
            <span className="tag tag-build">TO BUILD</span> <b>Suggested:</b> a “Review changes”
            panel listing every modified + impacted cell regardless of the active filter (alt:
            auto-clear on commit). <em>(Prajwal)</em>
          </>,
          <>Companion: a top “search to cell” for the single-cell edit case.</>,
        ]}
      />

      {/* Closing */}
      <h2 className="p1-h2">Decisions to close</h2>
      <div className="p1-cols">
        <div className="p1-list">
          <h3>Open decisions</h3>
          <ul>
            <li>Prominent totaling bar vs. subtle indicator (recommend subtle).</li>
            <li>Annotated levels vs. plain tree in dropdowns.</li>
            <li>How to represent impact that falls outside the current filter.</li>
            <li>Are column/header filters and AI filters in P1 or P2?</li>
            <li>How the filter reaches deep, not-yet-loaded rows.</li>
          </ul>
        </div>
        <div className="p1-list p1-list--remove">
          <h3>Removing / deferring for P1</h3>
          <ul>
            <li>Calculation Scope — panel section, blue grid bar, scope popover.</li>
            <li>Advanced Filters tab (contains / AND-OR) → Phase 2.</li>
            <li>Filter Sets + the “save your filter” tip → Phase 3.</li>
            <li>Flip calc defaults back to full-plan.</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
);

/* ================================================================== */
/* Comparison row                                                      */
/* ================================================================== */

const Comparison: React.FC<{
  n: number;
  title: string;
  intent: string;
  actualDrive: (doc: Document) => boolean;
  /** Live embed of the real app with Phase-1 applied (used for removal-based changes). */
  suggestedDrive?: (doc: Document) => boolean;
  /** Net-new UI that can't be produced by trimming the live app → rendered as a mockup. */
  suggestedNode?: React.ReactNode;
  active: boolean;
  points: React.ReactNode[];
}> = ({ n, title, intent, actualDrive, suggestedDrive, suggestedNode, active, points }) => (
  <section className="cmp">
    <div className="cmp-head">
      <span className="cmp-num">{n}</span>
      <div>
        <h3 className="cmp-title">{title}</h3>
        <p className="cmp-intent">{intent}</p>
      </div>
    </div>

    <div className="cmp-grid">
      <div className="cmp-col">
        <div className="cmp-col-label cmp-col-label--now">
          <span className="cmp-live-dot" /> Actual prototype — today (live)
        </div>
        <div className="cmp-visual">
          <LiveEmbed drive={actualDrive} enabled={active} />
        </div>
      </div>
      <div className="cmp-col">
        <div className="cmp-col-label cmp-col-label--new">
          <span className="cmp-live-dot cmp-live-dot--new" />
          {suggestedNode ? 'Suggested — Phase 1 (preview)' : 'Suggested — Phase 1 applied (live)'}
        </div>
        <div className="cmp-visual">
          {suggestedNode ?? <LiveEmbed drive={suggestedDrive} enabled={active} />}
        </div>
      </div>
    </div>

    <ul className="cmp-points">
      {points.map((p, i) => (
        <li key={i}>{p}</li>
      ))}
    </ul>
  </section>
);

/* ================================================================== */
/* Area 2 suggested — one dropdown *per level* (L0, L1, L2 … are        */
/* separate filter fields). Built with the app's real filter classes   */
/* + CSS so it reads like the actual implementation, plus the new       */
/* circular L-badge (one hue per dimension, darkening with depth). The  */
/* grid rows on the left use the same badge so filter + grid match.     */
/* ================================================================== */

/* Blue (Accounts) ramp, L0 → L2, darkening with depth. All shades hold  */
/* white text (contrast ≥ 4.5:1). A different dimension = different hue. */
const ACCT_LEVEL_COLORS = ['#3D74B8', '#285691', '#16386A'];
const MEASURE_ICON = `${import.meta.env.BASE_URL}measure-row.svg`;

const SgLvl: React.FC<{ depth: number; sm?: boolean; filtered?: boolean }> = ({
  depth,
  sm,
  filtered,
}) => (
  <span
    className={`sg-lvl${sm ? ' sg-lvl--sm' : ''}`}
    style={{ backgroundColor: ACCT_LEVEL_COLORS[depth] }}
  >
    L{depth}
    {filtered && <span className="sg-filtered-dot" aria-hidden="true" />}
  </span>
);

const SgChev: React.FC<{ state: 'open' | 'closed' | 'none' }> = ({ state }) => (
  <svg
    className={`sg-chev${state === 'open' ? ' sg-chev--open' : ''}${state === 'none' ? ' sg-chev--none' : ''}`}
    viewBox="0 0 12 12" width="9" height="9" fill="none" aria-hidden="true"
  >
    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* A single level's dropdown, using the real basic multi-select markup.  */
const SgLevelField: React.FC<{
  depth: number;
  summary: string;
  defaultOpen?: boolean;
  options?: { name: string; on?: boolean }[];
}> = ({ depth, summary, defaultOpen, options }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
  <div className="filters-basic-group">
    <span className="filters-basic-label">
      <SgLvl depth={depth} sm /> Level {depth}
    </span>
    <div className={`filters-basic-ms${open ? ' filters-basic-ms--open sg-real-dd' : ''}`}>
      <div
        className="filters-basic-ms-trigger"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
      >
        <input
          className="filters-basic-ms-input"
          value={summary}
          readOnly
          aria-label={`Level ${depth}`}
          style={{ cursor: 'pointer' }}
        />
        <svg
          className="filters-basic-ms-chevron"
          width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {open && options && (
        <div className="filters-basic-ms-dropdown" role="listbox" aria-multiselectable="true">
          <div className="filters-basic-ms-dropdown-head">
            <label className="filters-basic-ms-option">
              <input type="checkbox" checked readOnly />
              <span className="filters-basic-ms-option-label">All</span>
            </label>
          </div>
          <div className="filters-basic-ms-list">
            {options.map((o) => (
              <label key={o.name} className="filters-basic-ms-option">
                <input type="checkbox" checked={!!o.on} readOnly />
                <span className="filters-basic-ms-option-label">{o.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
  );
};

/* left-grid rows — a measure expanded into its dimension hierarchy, each  */
/* level tagged with the same L-badge used in the level dropdowns.         */
type DimRow = {
  depth: number | 'm';
  name: string;
  fy: string;
  jan: string;
  feb: string;
  chev: 'open' | 'closed' | 'none';
  /** true when some of this row's children are filtered out → total spans hidden rows */
  filtered?: boolean;
};
const DIM_GRID_ROWS: DimRow[] = [
  { depth: 'm', name: 'Sales Agreement Revenue', fy: '$6.6M', jan: '526K', feb: '520K', chev: 'open', filtered: true },
  { depth: 0, name: 'MagnaDrive', fy: '$4.2M', jan: '340K', feb: '338K', chev: 'open', filtered: true },
  { depth: 1, name: 'Michigan Plant', fy: '$1.9M', jan: '158K', feb: '156K', chev: 'open' },
  { depth: 2, name: 'Chassis Components', fy: '$820K', jan: '68K', feb: '67K', chev: 'none' },
  { depth: 2, name: 'Electrical Systems', fy: '$610K', jan: '51K', feb: '50K', chev: 'none' },
  { depth: 1, name: 'Ohio Plant', fy: '$1.1M', jan: '92K', feb: '91K', chev: 'closed' },
  { depth: 0, name: 'Acme Corp', fy: '$2.4M', jan: '186K', feb: '182K', chev: 'closed' },
];

const SgDimRow: React.FC<DimRow> = ({ depth, name, fy, jan, feb, chev, filtered }) => (
  <div className="sg-gr">
    <span
      className="sg-gcell-label"
      style={{ paddingLeft: depth === 'm' ? 0 : (depth as number) * 16 }}
    >
      <SgChev state={chev} />
      {depth === 'm' ? (
        <span className="sg-micon" aria-hidden="true">
          <img src={MEASURE_ICON} alt="" />
          {filtered && <span className="sg-filtered-dot" />}
        </span>
      ) : (
        <SgLvl depth={depth} filtered={filtered} />
      )}
      <span className="sg-mname" style={depth === 'm' ? { fontWeight: 700 } : undefined}>
        {name}
      </span>
    </span>
    <span className="sg-num">{fy}</span>
    <span className="sg-num">{jan}</span>
    <span className="sg-num">{feb}</span>
  </div>
);

const SuggLevelDropdown: React.FC = () => (
  <div className="sg-app">
    <div className="sg-app-header">
      <span className="sg-app-crumb">Planning &amp; Forecasting FY26 ›</span>
      <span className="sg-app-title">Grid View</span>
    </div>
    <div className="sg-app-body">
      <div className="sg-app-grid">
        <div className="sg-gh">
          <span className="sg-gcell-label">Measures / Dimensions × Time</span>
          <span className="sg-num">FY26</span>
          <span className="sg-num">Jan</span>
          <span className="sg-num">Feb</span>
        </div>
        <div className="sg-grid-scroll">
          {DIM_GRID_ROWS.map((r) => (
            <SgDimRow key={r.name} {...r} />
          ))}
        </div>
        <div className="sg-grid-note">
          <span className="sg-filtered-dot sg-filtered-dot--legend" /> orange dot = total still
          includes filtered-out (hidden) children
        </div>
      </div>
      <div className="sg-app-panel">
        <div className="sg-panel-head">
          <span className="sg-panel-ficon" aria-hidden="true">
            <svg viewBox="0 0 18 18" width="12" height="12" fill="none">
              <path d="M2 3h14l-5 6v5l-4 2V9L2 3z" fill="#fff" />
            </svg>
          </span>
          <span className="sg-panel-title">Filters</span>
          <span className="sg-panel-x" aria-hidden="true">✕</span>
        </div>
        <div className="sg-panel-scroll sg-panel-scroll--dd">
          <div className="filters-basic">
            <SgLevelField
              depth={0}
              summary="MagnaDrive, Acme Corp"
              options={[
                { name: 'MagnaDrive', on: true },
                { name: 'Acme Corp', on: true },
                { name: 'Globex', on: false },
              ]}
            />
            <SgLevelField
              depth={1}
              summary="3 selected"
              defaultOpen
              options={[
                { name: 'Michigan Plant', on: true },
                { name: 'Ohio Plant', on: true },
                { name: 'Texas Plant', on: true },
                { name: 'California Plant', on: false },
                { name: 'Georgia Plant', on: false },
              ]}
            />
            <SgLevelField
              depth={2}
              summary="8 selected"
              options={[
                { name: 'Chassis Components', on: true },
                { name: 'Electrical Systems', on: true },
                { name: 'Engine Components', on: true },
                { name: 'Transmission Assembly', on: true },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default PresentationPage;
