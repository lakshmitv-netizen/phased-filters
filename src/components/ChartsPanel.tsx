import React, { useEffect, useMemo, useState } from 'react';
import type { GridRow } from '../types';
import { getDimensionGlyph, getDimensionLevelName } from '../data/dimensionSchemes';
import { getSubColumnNumeric, getSubColumnUnit, type SubColumnUnit } from './GridRow';
import type { SubColumn } from './EditSubColumnsModal';
import { BASE_LINE_COLOR, getSubColumnLineColorMap, isChartedSubColumn } from '../utils/subColumnColors';
import '../styles/components/ChartsPanel.css';

/* ------------------------------------------------------------------ */
/* Charts panel — right-side drawer that shows, for a focused row:     */
/*   • a monthly trend line (FY26)                                     */
/*   • a donut of the share of the row's children (parent rows only),  */
/*     with a time-period dropdown.                                    */
/* ------------------------------------------------------------------ */

type ValueKey = keyof GridRow['values'];

/* Level icons — same public assets the grid uses for each dimension level. */
const ICON_BASE = import.meta.env.BASE_URL;
const LEVEL_ICON_SRC: Record<string, string> = {
  account: `${ICON_BASE}new_account.svg`,
  category: `${ICON_BASE}category.svg`,
  product: `${ICON_BASE}product.svg`,
  measure: `${ICON_BASE}measure-row.svg`,
};

/** Renders the row's level icon exactly like the grid: SVG for account/category/product/measure, colored acronym for deep/config levels. */
const RowIcon: React.FC<{ type?: string }> = ({ type }) => {
  // Measures resolved from live data have no `type` — default to the measure icon.
  const src = type ? LEVEL_ICON_SRC[type] : LEVEL_ICON_SRC.measure;
  if (src) return <img className="charts-row-icon-img" src={src} alt="" decoding="async" />;
  const glyph = type ? getDimensionGlyph(type) : null;
  if (glyph) {
    return (
      <span className="charts-row-glyph" style={{ backgroundColor: glyph.bg }}>
        {glyph.letters}
      </span>
    );
  }
  return null;
};

const MONTHS: { key: ValueKey; label: string }[] = [
  { key: 'jan2026', label: 'Jan' },
  { key: 'feb2026', label: 'Feb' },
  { key: 'mar2026', label: 'Mar' },
  { key: 'apr2026', label: 'Apr' },
  { key: 'may2026', label: 'May' },
  { key: 'jun2026', label: 'Jun' },
  { key: 'jul2026', label: 'Jul' },
  { key: 'aug2026', label: 'Aug' },
  { key: 'sep2026', label: 'Sep' },
  { key: 'oct2026', label: 'Oct' },
  { key: 'nov2026', label: 'Nov' },
  { key: 'dec2026', label: 'Dec' },
];

/* Period options for the pie/donut dropdown. */
const PERIODS: { key: ValueKey; label: string }[] = [
  { key: 'year', label: 'FY26 (full year)' },
  { key: 'q1', label: 'Q1' },
  { key: 'q2', label: 'Q2' },
  { key: 'q3', label: 'Q3' },
  { key: 'q4', label: 'Q4' },
  ...MONTHS.map((m) => ({ key: m.key, label: `${m.label} 2026` })),
];

const PIE_COLORS = [
  '#0176d3', '#1b96ff', '#9050e9', '#ff9e2c', '#04844b',
  '#e5701a', '#b83c8c', '#3ba755', '#5867e8', '#c23934',
  '#0b827c', '#8a4fdf',
];

/** Compact currency-ish formatter for chart labels. */
const fmt = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
};

/** Format a value according to its sub-column unit. */
const fmtUnit = (n: number, unit: SubColumnUnit): string => {
  if (unit === 'percent') return `${n >= 0 ? '+' : ''}${Math.round(n)}%`;
  return fmt(n);
};

const val = (row: GridRow, key: ValueKey): number => Number(row.values?.[key] ?? 0);

/* ---------------------------- Trend lines -------------------------- */
interface TrendSeries {
  id: string;
  name: string;
  color: string;
  unit: SubColumnUnit;
  values: number[];
}

const TrendChart: React.FC<{
  series: TrendSeries[];
  normalizePerSeries: boolean;
  selectedIndex: number | null;
  onSelectMonth?: (index: number) => void;
}> = ({ series, normalizePerSeries, selectedIndex, onSelectMonth }) => {
  const W = 336;
  const H = 160;
  const padL = 6;
  const padR = 6;
  const padT = 12;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = series[0]?.values.length ?? 0;
  const single = series.length === 1;
  const interactive = !!onSelectMonth;

  const x = (i: number) => padL + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);

  // Shared axis (used when all series share a unit): anchored to 0.
  const allVals = series.flatMap((s) => s.values);
  const sharedMin = Math.min(0, ...allVals);
  const sharedMax = Math.max(0, ...allVals);

  const yFor = (s: TrendSeries, v: number) => {
    let mn: number;
    let mx: number;
    if (normalizePerSeries) {
      mn = Math.min(...s.values);
      mx = Math.max(...s.values);
      if (mn === mx) {
        mn -= 1;
        mx += 1;
      }
    } else {
      mn = sharedMin;
      mx = sharedMax;
    }
    const range = mx - mn || 1;
    return padT + innerH - ((v - mn) / range) * innerH;
  };

  return (
    <svg className="charts-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly trend">
      <defs>
        <linearGradient id="charts-trend-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BASE_LINE_COLOR} stopOpacity="0.28" />
          <stop offset="100%" stopColor={BASE_LINE_COLOR} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="#e5e5e5" strokeWidth="1" />
      {/* Vertical guide for the selected month. */}
      {selectedIndex !== null && selectedIndex >= 0 && (
        <line
          x1={x(selectedIndex)}
          y1={padT - 4}
          x2={x(selectedIndex)}
          y2={padT + innerH}
          stroke={BASE_LINE_COLOR}
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.6"
        />
      )}
      {/* Area fill only for the clean single-line case. */}
      {single &&
        (() => {
          const s = series[0];
          const line = s.values.map((v, i) => `${x(i).toFixed(1)},${yFor(s, v).toFixed(1)}`).join(' ');
          const area = `${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} ${line} ${x(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)}`;
          return <polygon points={area} fill="url(#charts-trend-grad)" />;
        })()}
      {series.map((s) => (
        <polyline
          key={s.id}
          points={s.values.map((v, i) => `${x(i).toFixed(1)},${yFor(s, v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={s.color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {series.map((s) =>
        s.values.map((v, i) => {
          const sel = i === selectedIndex;
          return (
            <circle
              key={`${s.id}-${i}`}
              cx={x(i)}
              cy={yFor(s, v)}
              r={sel ? 3.6 : 2.2}
              fill={sel ? s.color : '#fff'}
              stroke={s.color}
              strokeWidth={sel ? 1.8 : 1.4}
            />
          );
        }),
      )}
      {MONTHS.map((m, i) => {
        const sel = i === selectedIndex;
        if (!sel && i % 2 !== 0) return null;
        return (
          <text
            key={m.key}
            x={x(i)}
            y={H - 6}
            fontSize="8"
            textAnchor="middle"
            fill={sel ? BASE_LINE_COLOR : '#8a8a8a'}
            fontWeight={sel ? 700 : 400}
          >
            {m.label}
          </text>
        );
      })}
      {/* Transparent click bands — one per month. */}
      {interactive &&
        MONTHS.map((m, i) => {
          const left = i === 0 ? padL : (x(i - 1) + x(i)) / 2;
          const right = i === n - 1 ? W - padR : (x(i) + x(i + 1)) / 2;
          return (
            <rect
              key={`hit-${m.key}`}
              x={left}
              y={padT - 4}
              width={Math.max(right - left, 1)}
              height={innerH + 4}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectMonth?.(i)}
            >
              <title>{`${m.label} 2026`}</title>
            </rect>
          );
        })}
    </svg>
  );
};

/* ------------------------------ Donut ------------------------------ */
interface Slice {
  id: string;
  name: string;
  value: number;
  color: string;
}
const Donut: React.FC<{ slices: Slice[]; total: number }> = ({ slices, total }) => {
  const cx = 74;
  const cy = 74;
  const r = 54;
  const sw = 26;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg className="charts-donut" viewBox="0 0 148 148" role="img" aria-label="Share by child">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef1f6" strokeWidth={sw} />
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {slices.map((s) => {
          const frac = total > 0 ? Math.max(s.value, 0) / total : 0;
          const len = frac * C;
          const offset = acc * C;
          acc += frac;
          return (
            <circle
              key={s.id}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={sw}
              strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
              strokeDashoffset={-offset}
            />
          );
        })}
      </g>
      <text x={cx} y={cy - 3} textAnchor="middle" fontSize="9" fill="#8a8a8a">
        Total
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="12" fontWeight="700" fill="#181818">
        {fmt(total)}
      </text>
    </svg>
  );
};

interface ChartsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  row: GridRow | null;
  /** Active sub-columns (only when "Show subcolumns" is on) — each becomes an extra trend line. */
  subColumns?: SubColumn[];
  /** Time period of the most recent cell edit — snaps the composition breakdown to it. */
  focusPeriod?: string | null;
  /** Bumped on each cell edit so the breakdown re-syncs even if the period is unchanged. */
  focusPeriodSignal?: number;
}

const ChartsPanel: React.FC<ChartsPanelProps> = ({
  isOpen,
  onClose,
  row,
  subColumns = [],
  focusPeriod,
  focusPeriodSignal,
}) => {
  const [periodKey, setPeriodKey] = useState<ValueKey>('year');

  // When a cell is edited, snap the pie/donut to the edited period (if it's a selectable one).
  useEffect(() => {
    if (focusPeriod && PERIODS.some((p) => p.key === focusPeriod)) {
      setPeriodKey(focusPeriod as ValueKey);
    }
  }, [focusPeriodSignal, focusPeriod]);

  // Trend series: the row's own monthly value ("Actual") plus one line per numeric sub-column.
  const trendSeries: TrendSeries[] = useMemo(() => {
    if (!row) return [];
    const base: TrendSeries = {
      id: '__value',
      name: 'Actual',
      color: BASE_LINE_COLOR,
      unit: 'currency',
      values: MONTHS.map((m) => val(row, m.key)),
    };
    const colorMap = getSubColumnLineColorMap(subColumns);
    const extras: TrendSeries[] = [];
    subColumns.forEach((sc) => {
      // Skip non-numeric columns and "Achieved" (identical to the Actual base line).
      if (!isChartedSubColumn(sc)) return;
      const unit = getSubColumnUnit(sc.id, sc.formula);
      const values = MONTHS.map((m) => getSubColumnNumeric(sc.id, val(row, m.key), row.id, m.key, sc.formula) ?? 0);
      extras.push({
        id: sc.id,
        name: sc.name,
        color: colorMap.get(sc.id) ?? BASE_LINE_COLOR,
        unit,
        values,
      });
    });
    return [base, ...extras];
  }, [row, subColumns]);

  // If series mix currency + percent, scale each line independently so all stay visible.
  const normalizePerSeries = useMemo(() => {
    const units = new Set(trendSeries.map((s) => s.unit));
    return units.size > 1;
  }, [trendSeries]);

  const children = row?.children ?? [];
  const hasChildren = children.length > 0;

  const slices: Slice[] = useMemo(() => {
    if (!hasChildren) return [];
    return children
      .map((c, i) => ({
        id: c.id,
        name: c.name,
        value: val(c, periodKey),
        color: PIE_COLORS[i % PIE_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [children, hasChildren, periodKey]);

  const pieTotal = slices.reduce((s, d) => s + Math.max(d.value, 0), 0);

  if (!isOpen) return null;

  const childLevelName = hasChildren && children[0].type ? getDimensionLevelName(children[0].type) : undefined;

  return (
    <div className="charts-panel">
      <div className="charts-panel-header">
        <div className="charts-panel-title-section">
          <svg className="charts-panel-icon" width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M17 3.05V15h11.95A12 12 0 0 0 17 3.05zM15 4.06A12 12 0 1 0 27.94 17H15V4.06z"
              fill="#0250D9"
            />
          </svg>
          <p className="charts-panel-title">Charts</p>
        </div>
        <button className="charts-panel-close" onClick={onClose} aria-label="Close">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="charts-panel-body">
        {!row ? (
          <div className="charts-empty">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M17 3.05V15h11.95A12 12 0 0 0 17 3.05zM15 4.06A12 12 0 1 0 27.94 17H15V4.06z"
                fill="#c9c9c9"
              />
            </svg>
            <p className="charts-empty-title">No row selected</p>
            <p className="charts-empty-sub">
              Open a row’s <b>⋮</b> menu and choose <b>Show Charts</b> to see its trend and
              composition here.
            </p>
          </div>
        ) : (
          <>
            <div className="charts-row-head">
              <RowIcon type={row.type} />
              <div className="charts-row-head-text">
                <span className="charts-row-name" title={row.name}>
                  {row.name}
                </span>
                <span className="charts-row-sub">Trend &amp; composition</span>
              </div>
            </div>

            <section className="charts-section">
              <div className="charts-section-head">
                <h4 className="charts-section-title">Trend</h4>
                <span className="charts-section-meta">
                  {trendSeries.length > 1 ? `FY26 · monthly · ${trendSeries.length} series` : `FY26 · monthly · ${fmt(val(row, 'year'))}`}
                </span>
              </div>
              <TrendChart
                series={trendSeries}
                normalizePerSeries={normalizePerSeries}
                selectedIndex={MONTHS.findIndex((m) => m.key === periodKey)}
                onSelectMonth={(i) => setPeriodKey(MONTHS[i].key)}
              />
              <p className="charts-scale-note">Tip: click a month to update the breakdown below.</p>
              {trendSeries.length > 1 && (
                <>
                  <ul className="charts-line-legend">
                    {trendSeries.map((s) => {
                      const yearVal =
                        s.id === '__value'
                          ? val(row, 'year')
                          : getSubColumnNumeric(s.id, val(row, 'year'), row.id, 'year',
                              subColumns.find((c) => c.id === s.id)?.formula) ?? 0;
                      return (
                        <li key={s.id} className="charts-line-legend-item">
                          <span className="charts-line-swatch" style={{ backgroundColor: s.color }} />
                          <span className="charts-line-name" title={s.name}>
                            {s.name}
                          </span>
                          <span className="charts-line-val">{fmtUnit(yearVal, s.unit)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {normalizePerSeries && (
                    <p className="charts-scale-note">
                      Lines are scaled independently (currency &amp; % mixed) so each sub-column’s
                      trend stays visible.
                    </p>
                  )}
                </>
              )}
            </section>

            {hasChildren ? (
              <section className="charts-section">
                <div className="charts-section-head">
                  <h4 className="charts-section-title">
                    Share of {childLevelName ? childLevelName.toLowerCase() : 'children'}
                  </h4>
                  <div className="charts-period">
                    <label htmlFor="charts-period-select" className="charts-period-label">
                      Period
                    </label>
                    <select
                      id="charts-period-select"
                      className="charts-period-select"
                      value={periodKey}
                      onChange={(e) => setPeriodKey(e.target.value as ValueKey)}
                    >
                      {PERIODS.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {pieTotal > 0 ? (
                  <div className="charts-pie-wrap">
                    <Donut slices={slices} total={pieTotal} />
                    <ul className="charts-legend">
                      {slices.map((s) => {
                        const pct = pieTotal > 0 ? (Math.max(s.value, 0) / pieTotal) * 100 : 0;
                        return (
                          <li key={s.id} className="charts-legend-item">
                            <span className="charts-legend-dot" style={{ backgroundColor: s.color }} />
                            <span className="charts-legend-name" title={s.name}>
                              {s.name}
                            </span>
                            <span className="charts-legend-val">{fmt(s.value)}</span>
                            <span className="charts-legend-pct">{pct.toFixed(0)}%</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="charts-note">No values for this period.</p>
                )}
              </section>
            ) : (
              <p className="charts-note">
                This is a leaf row — expand a parent row to see a share breakdown of its children.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ChartsPanel;
