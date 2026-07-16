import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReviewMeasuresModal, { Measure } from '../components/ReviewMeasuresModal';
import ManageUserAccessModal from '../components/ManageUserAccessModal';
import TimeGranularityModal from '../components/TimeGranularityModal';
import ManageHierarchiesModal, { type HierarchyChangeToast } from '../components/ManageHierarchiesModal';
import MeasureToast from '../components/MeasureToast';
import {
  saveCustomMeasures,
  saveSessionMeasures,
  loadSessionMeasures,
  type StoredMeasure,
} from '../data/measureStore';
import '../styles/pages/CpmFeaturePage.css';

/* Assets captured from the Figma design (served from /public). */
const A = `${import.meta.env.BASE_URL}cpm-feature/`;
const MEDIA = `${A}14b012ccd99b9268e1d262f873684086ebc8dc52.png`;
const CLOUD_ICON = `${import.meta.env.BASE_URL}manufacturing-cloud-icon.png`;

/* ── Inline utility icons (crisp, dependency-free) ───────────────────────── */
const ChevronDown: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M4 6l4 4 4-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRight: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M6 4l4 4-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="9" cy="9" r="6" stroke={color} strokeWidth="1.6" />
    <path d="M13.5 13.5l3 3" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const ExternalLinkIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = '#0176d3' }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M5.5 2.5H2.5v9h9v-3" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 2.5h3.5V6" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.5 2.5L7 7" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RefreshIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M13 8a5 5 0 1 1-1.5-3.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <path d="M13 2v3h-3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ThreeDots: React.FC<{ color?: string }> = ({ color = '#747474' }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill={color} aria-hidden>
    <circle cx="8" cy="3" r="1.4" />
    <circle cx="8" cy="8" r="1.4" />
    <circle cx="8" cy="13" r="1.4" />
  </svg>
);

const PlayIcon: React.FC = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
    <path d="M19 15l14 9-14 9V15z" fill="#0b5cab" />
  </svg>
);

const StarFilledIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = '#0176d3' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={color} aria-hidden>
    <path d="M8 1.2l1.9 3.86 4.26.62-3.08 3 .73 4.24L8 11.92 4.19 13.92l.73-4.24-3.08-3 4.26-.62L8 1.2z" />
  </svg>
);

const ArrowRightIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = '#0176d3' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M3 8h10M9 4l4 4-4 4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StepCheckBlue: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="11" fill="#0176d3" />
    <path
      d="M7.5 12.4l3 3 6-6.4"
      stroke="#ffffff"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const InfoIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = '#0176d3' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.3" />
    <circle cx="8" cy="5" r="1" fill={color} />
    <path d="M8 7.5v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const WarningIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 1.5l6.5 11.5H1.5L8 1.5z" fill="#dd7a01" />
    <path d="M8 6v3.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="11.2" r="0.9" fill="#fff" />
  </svg>
);

const StepCircle: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9.5" stroke="#c9c9c9" strokeWidth="1.5" />
  </svg>
);

const CloseIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M4 4l8 8M12 4l-8 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const StepCheckboxSquare: React.FC<{ checked: boolean }> = ({ checked }) =>
  checked ? (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="1" y="1" width="20" height="20" rx="5" fill="#0176d3" />
      <path d="M6 11.2l3.2 3.2L16 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="1.75" y="1.75" width="18.5" height="18.5" rx="5" fill="#fff" stroke="#c9c9c9" strokeWidth="1.5" />
    </svg>
  );

const Spinner: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    className="cpm-spinner"
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden
  >
    <circle cx="8" cy="8" r="6.5" stroke="#e5e5e5" strokeWidth="2" />
    <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" stroke="#0176d3" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const InfoFilled: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = '#747474' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="8" fill={color} />
    <circle cx="8" cy="4.6" r="1" fill="#fff" />
    <path d="M8 7v4.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const StepCheckBlueSm: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="11" fill="#0176d3" />
    <path
      d="M7.5 12.4l3 3 6-6.4"
      stroke="#ffffff"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const RadioOff: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="10" cy="10" r="8.25" stroke="#747474" strokeWidth="1.5" />
  </svg>
);

const CheckboxOn: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <rect x="0.5" y="0.5" width="17" height="17" rx="2.5" fill="#0176d3" />
    <path d="M5 9.2l2.6 2.6L13 6.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CheckboxOff: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <rect x="1" y="1" width="16" height="16" rx="2.5" stroke="#747474" strokeWidth="1.5" />
  </svg>
);

const DownCaret: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M4 6l4 4 4-4" stroke="#3e3e3c" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ── Global-header chrome icons ──────────────────────────────────────────── */
const CloudLogo: React.FC = () => (
  <svg width="40" height="28" viewBox="0 0 40 28" fill="none" aria-hidden>
    <path
      d="M16.4 7.1a6.6 6.6 0 0 1 11.2 1.5 5.4 5.4 0 0 1 2.2-.5 5.5 5.5 0 0 1 1 10.9 5 5 0 0 1-6.7 2.4 5.7 5.7 0 0 1-10.6-.3 5 5 0 0 1-1-.1 5.5 5.5 0 0 1-1.3-10.4 6 6 0 0 1 5-3z"
      fill="#00a1e0"
    />
  </svg>
);

const Waffle: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="#747474" aria-hidden>
    {[2, 8, 14].map((y) =>
      [2, 8, 14].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="3.5" height="3.5" rx="1" />)
    )}
  </svg>
);

const StarIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <path
      d="M10 2.5l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5L5.5 16l1-5L2.8 7.7l5-.6L10 2.5z"
      stroke="#747474"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const PlusBox: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <rect x="2.5" y="2.5" width="15" height="15" rx="3" stroke="#747474" strokeWidth="1.3" />
    <path d="M10 6.5v7M6.5 10h7" stroke="#747474" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const HelpIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="10" cy="10" r="7.3" stroke="#747474" strokeWidth="1.3" />
    <path
      d="M8 7.7a2 2 0 1 1 2.6 1.9c-.5.2-.8.6-.8 1.1v.4"
      stroke="#747474"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <circle cx="9.85" cy="13.4" r="0.85" fill="#747474" />
  </svg>
);

const GearIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="10" cy="10" r="2.4" stroke="#747474" strokeWidth="1.3" />
    <path
      d="M10 2.2v2.3M10 15.5v2.3M2.2 10h2.3M15.5 10h2.3M4.5 4.5l1.6 1.6M13.9 13.9l1.6 1.6M15.5 4.5l-1.6 1.6M6.1 13.9l-1.6 1.6"
      stroke="#747474"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const BellIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <path
      d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3.5-1.2 4.8-1.6 5.3-.2.2 0 .7.3.7h11.6c.3 0 .5-.5.3-.7-.4-.5-1.6-1.8-1.6-5.3A4.5 4.5 0 0 0 10 3z"
      stroke="#747474"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <path d="M8.4 16a1.7 1.7 0 0 0 3.2 0" stroke="#747474" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

/* ── Left-nav model ──────────────────────────────────────────────────────── */
const NAV_ITEMS: Array<{ label: string; selected?: boolean; section?: boolean; chevron?: boolean }> = [
  { label: 'Setup Home' },
  { label: 'Salesforce Go', selected: true },
  { label: 'ADMINISTRATION', section: true },
  { label: 'Users', chevron: true },
  { label: 'Data', chevron: true },
  { label: 'Email', chevron: true },
  { label: 'PLATFORM TOOLS', section: true },
  { label: 'Apps', chevron: true },
  { label: 'Feature Settings', chevron: true },
  { label: 'Slack', chevron: true },
  { label: 'Heroku', chevron: true },
  { label: 'MuleSoft', chevron: true },
  { label: 'Einstein', chevron: true },
];

const LOREM =
  'Plan and forecast demand across accounts and products, tracking volume, revenue, and ' +
  'margin from a single source of truth.';

const INITIAL_MEASURES: Measure[] = [
  { id: 1,  name: 'Sales Agreement Quantity (No.s)', description: 'Sales Agreement Quantity',   type: 'Read',  sourceDmo: 'SalesAgreement',  code: 'SA_QTY',    aggregation: 'SUM',     disaggregation: 'Proportional', category: 'Volume',     subsets: ['SalesAgreement', 'Revenue', 'Q1 Sales', 'Annual'],    unit: 'volume',   dataType: 'Number',   sourceName: 'SalesAgreement',  selected: false },
  { id: 2,  name: 'Sales Agreement Revenue',         description: 'Sales Agreement Revenue',     type: 'Read',  sourceDmo: 'SalesAgreement',  code: 'SA_REV',    aggregation: 'SUM',     disaggregation: 'Proportional', category: 'Financials', subsets: ['SalesAgreement', 'Revenue', 'Finance'],               unit: 'currency', dataType: 'Currency', sourceName: 'SalesAgreement',  selected: false },
  { id: 3,  name: 'Opportunity Quantity (No.s)',      description: 'Opportunity Quantity',        type: 'Read',  sourceDmo: 'Opportunity',     code: 'OPP_QTY',   aggregation: 'SUM',     disaggregation: 'Proportional', category: 'Volume',     subsets: ['Opportunity', 'Pipeline', 'Volume'],                  unit: 'volume',   dataType: 'Number',   sourceName: 'Opportunity',     selected: false },
  { id: 4,  name: 'Opportunity Revenue',             description: 'Opportunity Revenue',         type: 'Read',  sourceDmo: 'Opportunity',     code: 'OPP_REV',   aggregation: 'SUM',     disaggregation: 'Proportional', category: 'Financials', subsets: ['Opportunity', 'Revenue', 'Pipeline'],                 unit: 'currency', dataType: 'Currency', sourceName: 'Opportunity',     selected: false },
  { id: 5,  name: 'Order Quantity (No.s)',            description: 'Order Quantity',              type: 'Write', sourceDmo: 'Order',           code: 'ORD_QTY',   aggregation: 'SUM',     disaggregation: 'Proportional', category: 'Volume',     subsets: ['Order', 'Fulfillment', 'Volume'],                     unit: 'volume',   dataType: 'Number',   sourceName: 'Order',           selected: false },
  { id: 6,  name: 'Order Revenue',                   description: 'Order Revenue',               type: 'Read',  sourceDmo: 'Order',           code: 'ORD_REV',   aggregation: 'SUM',     disaggregation: 'Proportional', category: 'Financials', subsets: ['Order', 'Revenue', 'Finance'],                        unit: 'currency', dataType: 'Currency', sourceName: 'Order',           selected: false },
  { id: 7,  name: 'Last Year Order Quantity (No.s)', description: 'Last Year Order Quantity',    type: 'Read',  sourceDmo: 'Order',           code: 'LY_ORD_QTY',aggregation: 'SUM',     disaggregation: 'Proportional', category: 'Volume',     subsets: ['Order', 'Historical', 'Last Year'],                   unit: 'volume',   dataType: 'Number',   sourceName: 'Order',           selected: false },
  { id: 8,  name: 'Last Years Order Revenue',        description: 'Last Years Order Revenue',    type: 'Read',  sourceDmo: 'Order',           code: 'LY_ORD_REV',aggregation: 'SUM',     disaggregation: 'Proportional', category: 'Financials', subsets: ['Order', 'Historical', 'Last Year', 'Revenue'],        unit: 'currency', dataType: 'Currency', sourceName: 'Order',           selected: false },
  { id: 9,  name: 'Forecasted Quantity (No.s)',      description: 'Forecasted Quantity',         type: 'Calculated', sourceDmo: 'ForecastEntry',   code: 'FCST_QTY',  aggregation: 'SUM',     disaggregation: 'Proportional', category: 'Volume',     subsets: ['Forecast', 'Pipeline', 'Future'],                     unit: 'volume',   dataType: 'Number',   sourceName: 'ForecastEntry',   selected: false },
  { id: 10, name: 'Forecasted Revenue',              description: 'Forecasted Revenue',          type: 'Calculated', sourceDmo: 'ForecastEntry',   code: 'FCST_REV',  aggregation: 'SUM',     disaggregation: 'Proportional', category: 'Financials', subsets: ['Forecast', 'Revenue', 'Pipeline', 'Future'],          unit: 'currency', dataType: 'Currency', sourceName: 'ForecastEntry',   selected: false },
];

const CpmFeaturePage: React.FC = () => {
  const navigate = useNavigate();
  const [prereqOpen, setPrereqOpen] = useState(true);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [dataSpaceSaved, setDataSpaceSaved] = useState(false);
  // Steps 1 & 2 are manual — the user checks them off themselves.
  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [turnOnOpen, setTurnOnOpen] = useState(false);
  const [turningOn, setTurningOn] = useState(false);
  const [turnedOn, setTurnedOn] = useState(false);
  const [reqOpen, setReqOpen] = useState(true);
  const [step11Done, setStep11Done] = useState(false);
  const [step12Done, setStep12Done] = useState(false);
  const [step21Done, setStep21Done] = useState(false);
  const [step22Done, setStep22Done] = useState(false);
  const [step31Done, setStep31Done] = useState(false);
  const [step32Done, setStep32Done] = useState(false);
  const [step4Done, setStep4Done] = useState(false);
  const [step5Done, setStep5Done] = useState(false);
  const [step6Done, setStep6Done] = useState(false);
  const [hierarchyModalOpen, setHierarchyModalOpen] = useState(false);
  const [hierarchyToast, setHierarchyToast] = useState<HierarchyChangeToast | null>(null);
  const [measuresModalOpen, setMeasuresModalOpen] = useState(false);
  const [userAccessModalOpen, setUserAccessModalOpen] = useState(false);
  const [timeGranularityModalOpen, setTimeGranularityModalOpen] = useState(false);
  const [measures, setMeasures] = useState<Measure[]>(() => {
    // Restore the session's working measure list if the user already edited or
    // added measures this session; otherwise start from the OOTB seed with Data
    // Source and Measure Code pre-filled for the standard measures. (The session
    // copy is cleared on refresh, so a fresh load always starts from OOTB.)
    const saved = loadSessionMeasures();
    if (saved) return saved as unknown as Measure[];
    return INITIAL_MEASURES.map((m, i) => ({
      ...m,
      dataSource: m.dataSource ?? 'Planning Weekly Read Measure',
      measureCode: m.measureCode ?? `ASDL${i + 1}`,
    }));
  });
  useEffect(() => {
    if (!turningOn) return;
    const t = setTimeout(() => {
      setTurningOn(false);
      setTurnedOn(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [turningOn]);

  // Persist user-created measures (those beyond the seed set) so they surface in
  // the Plan Configuration builder's "Add Measures" modal, and keep the full
  // working list for this session so edits survive navigating away and back.
  useEffect(() => {
    const seedMaxId = INITIAL_MEASURES.reduce((max, m) => Math.max(max, m.id || 0), 0);
    saveCustomMeasures(measures.filter((m) => (m.id || 0) > seedMaxId) as unknown as StoredMeasure[]);
    saveSessionMeasures(measures as unknown as StoredMeasure[]);
  }, [measures]);

  return (
    <div className="cpm-feature-page">
      {/* ── Global header ──────────────────────────────────────────────── */}
      <header className="cpm-gh">
        <div className="cpm-gh-top">
          <span className="cpm-gh-logo">
            <CloudLogo />
          </span>
          <div className="cpm-gh-search">
            <div className="cpm-gh-search-all">
              <span>All</span>
              <DownCaret />
            </div>
            <div className="cpm-gh-search-field">
              <SearchIcon size={16} color="#706e6b" />
              <span>Search Salesforce</span>
            </div>
          </div>
          <div className="cpm-gh-icons">
            <StarIcon />
            <PlusBox />
            <HelpIcon />
            <GearIcon />
            <BellIcon />
            <span className="cpm-gh-avatar" aria-label="User" />
          </div>
        </div>
        <div className="cpm-gh-bottom">
          <span className="cpm-gh-logo" style={{ width: 20, height: 20 }}>
            <Waffle />
          </span>
          <span className="cpm-gh-setup">Setup</span>
          <div className="cpm-gh-tab">
            <span>Home</span>
            <ChevronDown size={16} color="#181818" />
          </div>
          <div className="cpm-gh-progress">
            <span className="bar" />
            <ChevronDown size={16} />
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="cpm-body">
        {/* Side nav */}
        <nav className="cpm-sidenav">
          <div className="cpm-sidenav-search">
            <div className="cpm-sidenav-search-field">
              <SearchIcon size={20} color="#747474" />
            </div>
          </div>
          {NAV_ITEMS.map((item) => {
            const cls = [
              'cpm-nav-item',
              item.selected ? 'cpm-nav-item--selected' : '',
              item.section ? 'cpm-nav-item--section' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={item.label}
                className={cls}
                onClick={item.label === 'Salesforce Go' ? () => navigate('/setup/salesforce-go') : undefined}
              >
                {item.chevron && <ChevronRight size={16} color="#747474" />}
                <span>{item.label}</span>
              </div>
            );
          })}
        </nav>

        {/* Main content */}
        <main className="cpm-main">
          {/* Hero */}
          <section className="cpm-hero-container">
            <div className="cpm-colorbar" />
            <div className="cpm-breadcrumb-row">
              <div className="cpm-breadcrumb">
                <span className="crumb">
                  <a className="crumb-link" onClick={() => navigate('/setup/salesforce-go')}>
                    Salesforce Go
                  </a>
                  <span className="crumb-sep">&gt;</span>
                </span>
                <span className="crumb">
                  <a className="crumb-link" onClick={() => navigate('/setup/cpm-feature-set')}>
                    Commercial Planning for Manufacturing
                  </a>
                  <span className="crumb-sep">&gt;</span>
                </span>
                <span className="crumb">
                  <span className="crumb-current">Commercial Planning for Manufacturing</span>
                </span>
              </div>
              <div className="cpm-header-actions">
                <button className="cpm-icon-btn" type="button" aria-label="Refresh">
                  <RefreshIcon />
                </button>
                <button className="cpm-icon-btn" type="button" aria-label="More actions">
                  <ThreeDots />
                </button>
              </div>
            </div>

            <div className="cpm-hero">
              <div className="cpm-hero-content">
                <div className="cpm-cloud-row">
                  <img src={CLOUD_ICON} alt="" />
                  <span>Manufacturing Cloud</span>
                </div>
                <h1 className="cpm-hero-title">Commercial Planning for Manufacturing</h1>
                <p className="cpm-hero-desc">{LOREM}</p>
                <span className="cpm-badge">In Progress</span>
              </div>
              <div className="cpm-media">
                <div className="cpm-media-bg">
                  <img src={MEDIA} alt="" />
                </div>
                <div className="cpm-media-play">
                  <PlayIcon />
                </div>
              </div>
            </div>
          </section>

          {/* Sections + right rail */}
          <div className="cpm-content-row">
          <div className="cpm-sections">
            {/* Complete the Prerequisites */}
            <section className="cpm-section">
              <button
                type="button"
                className="cpm-section-chevron"
                aria-expanded={prereqOpen}
                aria-label="Toggle Complete the Prerequisites"
                onClick={() => setPrereqOpen((o) => !o)}
              >
                {prereqOpen ? <ChevronDown /> : <ChevronRight />}
              </button>
              <div className="cpm-section-body">
                <div className="cpm-section-head">
                  <h2
                    className="cpm-section-title cpm-section-title--toggle"
                    onClick={() => setPrereqOpen((o) => !o)}
                  >
                    Complete the Prerequisites
                  </h2>
                  {prereqOpen && (
                    <p className="cpm-section-desc">
                      Complete the Prerequistes to continue configuring Commercial Planning for Manufacturing.
                    </p>
                  )}
                </div>

                {prereqOpen && (
                <div className="cpm-steps">
                  {/* Step 1 */}
                  <div className="cpm-step">
                    <div className="cpm-step-rail">
                      <button
                        type="button"
                        className="cpm-step-checkbtn"
                        aria-pressed={step1Done}
                        aria-label={step1Done ? 'Mark step incomplete' : 'Mark step complete'}
                        onClick={() => setStep1Done((v) => !v)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}
                      >
                        <StepCheckboxSquare checked={step1Done} />
                      </button>
                      <div className="cpm-step-line" />
                    </div>
                    <div className="cpm-step-content">
                      <div className="cpm-step-main">
                        <div className="cpm-step-text">
                          <h3 className="cpm-step-title">Data Cloud Architect Permission Set</h3>
                          <p className="cpm-step-desc">Assign the Data Cloud Architect permission set to yourself</p>
                          <a className="cpm-link cpm-learn-more">
                            Learn More in Help
                            <ExternalLinkIcon />
                          </a>
                        </div>
                        <div className="cpm-step-controls">
                          <button className="cpm-btn cpm-btn--outline" type="button">
                            Review
                            <ExternalLinkIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="cpm-step">
                    <div className="cpm-step-rail">
                      <button
                        type="button"
                        className="cpm-step-checkbtn"
                        aria-pressed={step2Done}
                        aria-label={step2Done ? 'Mark step incomplete' : 'Mark step complete'}
                        onClick={() => setStep2Done((v) => !v)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}
                      >
                        <StepCheckboxSquare checked={step2Done} />
                      </button>
                      <div className="cpm-step-line" />
                    </div>
                    <div className="cpm-step-content">
                      <div className="cpm-step-main">
                        <div className="cpm-step-text">
                          <h3 className="cpm-step-title">Set up Data 360</h3>
                          <a className="cpm-link cpm-learn-more">
                            Learn More in Help
                            <ExternalLinkIcon />
                          </a>
                        </div>
                        <div className="cpm-step-controls">
                          <button className="cpm-btn cpm-btn--outline" type="button">
                            Review
                            <ExternalLinkIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 — Select a Data Space */}
                  <div className="cpm-step">
                    <div className="cpm-step-rail">
                      {dataSpaceSaved ? <StepCheckBlue /> : <StepCircle />}
                    </div>
                    <div className="cpm-step-content">
                      <div className="cpm-step-main">
                        <div className="cpm-step-text">
                          <h3 className="cpm-step-title">Select a Data Space</h3>
                          <p className="cpm-step-desc">
                            Decide which data space to use for your Commercial Planning data.{' '}
                            <span className="cpm-link-inline">Learn More in Help</span>
                          </p>
                        </div>
                        <div className="cpm-step-controls">
                          <button className="cpm-btn cpm-btn--disabled" type="button" disabled>
                            Manage Data Spaces
                            <ExternalLinkIcon color="#c9c9c9" />
                          </button>
                        </div>
                      </div>

                      <div className="cpm-embedded">
                        <div className="cpm-field">
                          <label className="cpm-field-label">
                            Data Space
                            <span className="cpm-info">
                              <InfoIcon />
                            </span>
                          </label>
                          <div className="cpm-select">Default</div>
                        </div>
                        {!dataSpaceSaved && (
                          <div className="cpm-save-actions">
                            <span className="cpm-save-warning">
                              After saving selection, you will not be able to make updates.
                            </span>
                            <div className="cpm-save-buttons">
                              <button className="cpm-btn cpm-btn--outline" type="button">
                                Cancel
                              </button>
                              <button
                                className="cpm-btn cpm-btn--brand"
                                type="button"
                                onClick={() => setSaveModalOpen(true)}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                )}
              </div>
            </section>

            {/* Turn on Commercial Planning for Manufacturing */}
            <section className="cpm-section cpm-section--turnon">
              <div className="cpm-section-body">
                <div className="cpm-turnon-row">
                  <div className="cpm-turnon-title">
                    <h2
                      className="cpm-section-title cpm-section-title--toggle"
                      onClick={() => setTurnOnOpen((o) => !o)}
                    >
                      Turn on Commercial Planning for Manufacturing
                    </h2>
                    {!dataSpaceSaved && (
                      <span className="cpm-tooltip-wrap" tabIndex={0} aria-describedby="cpm-turnon-tip">
                        <WarningIcon />
                        <span className="cpm-tooltip" role="tooltip" id="cpm-turnon-tip">
                          Complete the pre-requisites to turn on the feature
                        </span>
                      </span>
                    )}
                  </div>
                  {turnedOn ? (
                    <span className="cpm-on-badge">On</span>
                  ) : turningOn ? (
                    <div className="cpm-turnon-progress">
                      <span className="cpm-turnon-progress-text">This may take several minutes...</span>
                      <Spinner size={20} />
                    </div>
                  ) : (
                    <div className="cpm-turnon-cta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        className={`cpm-btn ${dataSpaceSaved ? 'cpm-btn--brand' : 'cpm-btn--turn-on'}`}
                        type="button"
                        disabled={!dataSpaceSaved}
                        onClick={() => {
                          setTurningOn(true);
                          setTurnOnOpen(true);
                          setPrereqOpen(false);
                        }}
                      >
                        Turn On
                      </button>
                    </div>
                  )}
                </div>
                {(turningOn || turnedOn) && turnOnOpen && (
                  <div className="cpm-automation-steps">
                    <div className="cpm-auto-step">
                      <div className="cpm-step-rail">
                        <StepCheckBlue />
                        <div className="cpm-step-line" />
                      </div>
                      <div className="cpm-auto-step-title">
                        <a className="cpm-link cpm-auto-step-link">Provision Data Kit</a>
                        <ExternalLinkIcon size={12} />
                        <InfoFilled size={16} />
                      </div>
                    </div>

                    <div className="cpm-auto-step">
                      <div className="cpm-step-rail">
                        {turnedOn ? <StepCheckBlue /> : <Spinner size={16} />}
                        <div className="cpm-step-line" />
                      </div>
                      <div className="cpm-auto-step-title">
                        <a className="cpm-link cpm-auto-step-link">Deploy OOTB Configuration</a>
                        <ExternalLinkIcon size={12} />
                        <InfoFilled size={16} />
                      </div>
                    </div>

                    <div className="cpm-auto-step">
                      <div className="cpm-step-rail">
                        {turnedOn ? <StepCheckBlue /> : <Spinner size={16} />}
                      </div>
                      <div className="cpm-auto-step-title">
                        <a className="cpm-link cpm-auto-step-link">
                          Turn on Commercial Planning for Manufacturing
                        </a>
                        <InfoFilled size={16} />
                      </div>
                    </div>
                  </div>
                )}

                {!turningOn && !turnedOn && turnOnOpen && (
                  <p className="cpm-section-desc">
                    Complete the prerequisites above before turning on Commercial Planning for Manufacturing.
                  </p>
                )}
              </div>
            </section>

            {/* Complete the Required Steps (appears once feature is turned on) */}
            {turnedOn && (
              <section className="cpm-section cpm-section--required">
                <button
                  type="button"
                  className="cpm-section-chevron"
                  aria-expanded={reqOpen}
                  aria-label="Toggle Complete the Required Steps"
                  onClick={() => setReqOpen((o) => !o)}
                >
                  {reqOpen ? <ChevronDown /> : <ChevronRight />}
                </button>
                <div className="cpm-section-body">
                  <div className="cpm-section-head">
                    <h2
                      className="cpm-section-title cpm-section-title--toggle"
                      onClick={() => setReqOpen((o) => !o)}
                    >
                      Complete the Required Steps
                    </h2>
                    {reqOpen && (
                      <p className="cpm-section-desc">
                        Check off each step as you go to keep track of what you&rsquo;ve completed.
                      </p>
                    )}
                  </div>

                  {reqOpen && (
                    <div className="cpm-req">
                      {/* 1. Review Dimensions & Hierarchies */}
                      <div className="cpm-req-group">
                        <div className="cpm-req-lead">
                          <span className="cpm-req-ind">{step11Done && step12Done ? <StepCheckBlueSm /> : <RadioOff />}</span>
                          <div className="cpm-req-lead-text">
                            <h3 className="cpm-req-title">1. Review Dimensions &amp; Hierarchies</h3>
                          </div>
                        </div>
                        <div className="cpm-req-subs">
                          <div className="cpm-req-sub">
                            <button
                              type="button"
                              className="cpm-req-ind cpm-req-ind--btn"
                              onClick={() => setStep11Done((d) => !d)}
                              aria-pressed={step11Done}
                              aria-label={
                                step11Done
                                  ? 'Mark step 1.1 as not complete'
                                  : 'Mark step 1.1 as complete'
                              }
                            >
                              {step11Done ? <CheckboxOn /> : <CheckboxOff />}
                            </button>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">
                                1.1 View the Dimensions and Annotate Hierarchy levels
                              </p>
                            </div>
                            <button
                              className="cpm-btn cpm-btn--outline"
                              type="button"
                              onClick={() => setHierarchyModalOpen(true)}
                            >
                              Manage
                            </button>
                          </div>
                          <div className="cpm-req-sub">
                            <button
                              type="button"
                              className="cpm-req-ind cpm-req-ind--btn"
                              onClick={() => setStep12Done((d) => !d)}
                              aria-pressed={step12Done}
                              aria-label={step12Done ? 'Mark step 1.2 as not complete' : 'Mark step 1.2 as complete'}
                            >
                              {step12Done ? <CheckboxOn /> : <CheckboxOff />}
                            </button>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">1.2 Run the DPEs for hierarchy building and dimension relationship mapping</p>
                              <p className="cpm-req-sub-desc">Run the DPE definitions corresponding to "Define Dimension Hierarchy for Account Forecasting" &amp; "Build Account–Product Relationships for Account Forecasting" DPE Templates.</p>
                            </div>
                            <a
                              className="cpm-btn cpm-btn--outline"
                              href={`${import.meta.env.BASE_URL}dpe_listview.html`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Go to DPE listview
                              <ExternalLinkIcon />
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* 2. Setup the Measures */}
                      <div className="cpm-req-group">
                        <div className="cpm-req-lead">
                          <span className="cpm-req-ind">{step21Done && step22Done ? <StepCheckBlueSm /> : <RadioOff />}</span>
                          <div className="cpm-req-lead-text">
                            <h3 className="cpm-req-title">2. Setup the Measures</h3>
                            <p className="cpm-req-desc">View existing or create new measures</p>
                          </div>
                        </div>
                        <div className="cpm-req-subs">
                          <div className="cpm-req-sub">
                            <button
                              type="button"
                              className="cpm-req-ind cpm-req-ind--btn"
                              onClick={() => setStep21Done((d) => !d)}
                              aria-pressed={step21Done}
                              aria-label={step21Done ? 'Mark step 2.1 as not complete' : 'Mark step 2.1 as complete'}
                            >
                              {step21Done ? <CheckboxOn /> : <CheckboxOff />}
                            </button>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">2.1 Review existing measures</p>
                            </div>
                            <button
                              className="cpm-btn cpm-btn--outline"
                              type="button"
                              onClick={() => setMeasuresModalOpen(true)}
                            >
                              Manage
                            </button>
                          </div>
                          <div className="cpm-req-sub">
                            <button
                              type="button"
                              className="cpm-req-ind cpm-req-ind--btn"
                              onClick={() => setStep22Done((d) => !d)}
                              aria-pressed={step22Done}
                              aria-label={step22Done ? 'Mark step 2.2 as not complete' : 'Mark step 2.2 as complete'}
                            >
                              {step22Done ? <CheckboxOn /> : <CheckboxOff />}
                            </button>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">2.2 Run the DPE for baseline measure calculation</p>
                              <p className="cpm-req-sub-desc">Run the DPE definition corresponding to "Define Baseline Measures for Account Forecasting" DPE Template.</p>
                            </div>
                            <a
                              className="cpm-btn cpm-btn--outline"
                              href={`${import.meta.env.BASE_URL}dpe_listview.html`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Go to DPE Listview
                              <ExternalLinkIcon />
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* 3. Configure Time Granularity */}
                      <div className="cpm-req-group">
                        <div className="cpm-req-lead">
                          <span className="cpm-req-ind">{step31Done && step32Done ? <StepCheckBlueSm /> : <RadioOff />}</span>
                          <div className="cpm-req-lead-text">
                            <div className="cpm-req-title-row">
                              <h3 className="cpm-req-title">3. Configure Time Granularity</h3>
                            </div>
                            <p className="cpm-req-desc">Provide time granularity your product will support</p>
                          </div>
                        </div>
                        <div className="cpm-req-subs">
                          <div className="cpm-req-sub">
                            <button
                              type="button"
                              className="cpm-req-ind cpm-req-ind--btn"
                              onClick={() => setStep31Done((d) => !d)}
                              aria-pressed={step31Done}
                              aria-label={step31Done ? 'Mark step 3.1 as not complete' : 'Mark step 3.1 as complete'}
                            >
                              {step31Done ? <CheckboxOn /> : <CheckboxOff />}
                            </button>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">3.1 Configure Org Calendar</p>
                              <p className="cpm-req-meta">Fiscal Calendar selected by default</p>
                            </div>
                            <button className="cpm-btn cpm-btn--outline" type="button">
                              Go to Org Calendar
                              <ExternalLinkIcon />
                            </button>
                          </div>
                          <div className="cpm-req-sub">
                            <button
                              type="button"
                              className="cpm-req-ind cpm-req-ind--btn"
                              onClick={() => setStep32Done((d) => !d)}
                              aria-pressed={step32Done}
                              aria-label={step32Done ? 'Mark step 3.2 as not complete' : 'Mark step 3.2 as complete'}
                            >
                              {step32Done ? <CheckboxOn /> : <CheckboxOff />}
                            </button>
                            <div className="cpm-req-sub-text">
                              <p className="cpm-req-sub-title">3.2 Setup time granularity</p>
                              <p className="cpm-req-meta">
                                Time granularity selected to Quarterly and Monthly by default
                              </p>
                            </div>
                            <button className="cpm-btn cpm-btn--outline" type="button" onClick={() => setTimeGranularityModalOpen(true)}>Review</button>
                          </div>
                        </div>
                      </div>

                      {/* 4. Setup User & User Roles */}
                      <div className="cpm-req-single">
                        <button
                          type="button"
                          className="cpm-req-ind cpm-req-ind--btn"
                          onClick={() => setStep4Done((d) => !d)}
                          aria-pressed={step4Done}
                          aria-label={step4Done ? 'Mark step 4 as not complete' : 'Mark step 4 as complete'}
                        >
                          {step4Done ? <CheckboxOn /> : <CheckboxOff />}
                        </button>
                        <div className="cpm-req-lead-text">
                          <div className="cpm-req-title-row">
                            <h3 className="cpm-req-title">4. Setup User &amp; User Roles</h3>
                          </div>
                          <p className="cpm-req-desc">
                            Review and make any changes if required to out of the box settings
                          </p>
                        </div>
                        <button className="cpm-btn cpm-btn--outline" type="button" onClick={() => setUserAccessModalOpen(true)}>Manage</button>
                      </div>

                      {/* 5. Setup Plan Configurations */}
                      <div className="cpm-req-single">
                        <button
                          type="button"
                          className="cpm-req-ind cpm-req-ind--btn"
                          onClick={() => setStep5Done((d) => !d)}
                          aria-pressed={step5Done}
                          aria-label={step5Done ? 'Mark step 5 as not complete' : 'Mark step 5 as complete'}
                        >
                          {step5Done ? <CheckboxOn /> : <CheckboxOff />}
                        </button>
                        <div className="cpm-req-lead-text">
                          <h3 className="cpm-req-title">5. Setup Plan Configurations</h3>
                          <p className="cpm-req-desc">
                            Create your own and modify reuse out of the box plan configuration
                          </p>
                        </div>
                        <button className="cpm-btn cpm-btn--outline" type="button" onClick={() => navigate('/setup/plan-configuration-list')}>
                          Go to Plan Configuration List
                          <ExternalLinkIcon />
                        </button>
                      </div>

                      {/* 6. Sync Schedule for Data for Measures & Dimensional Hierarchies */}
                      <div className="cpm-req-single">
                        <button
                          type="button"
                          className="cpm-req-ind cpm-req-ind--btn"
                          onClick={() => setStep6Done((d) => !d)}
                          aria-pressed={step6Done}
                          aria-label={step6Done ? 'Mark step 6 as not complete' : 'Mark step 6 as complete'}
                        >
                          {step6Done ? <CheckboxOn /> : <CheckboxOff />}
                        </button>
                        <div className="cpm-req-lead-text">
                          <h3 className="cpm-req-title">6. Sync Schedule for Data for Measures &amp; Dimensional Hierarchies</h3>
                          <p className="cpm-req-desc">
                            Sync Schedule for Data for Measures &amp; Dimensional Hierarchies
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Right rail: help / updates / learning */}
          <aside className="cpm-aside">
            <div className="cpm-aside-card">
              <div className="cpm-aside-video">Video Preview</div>
              <a className="cpm-aside-link cpm-aside-link--lg">
                See How It Works
                <StarFilledIcon />
              </a>
              <p className="cpm-aside-text">
                Take a look at how you can plan, track, predict, and grow your Manufacturing
                business with Commercial Planning for Manufacturing
              </p>
            </div>

            <div className="cpm-aside-card">
              <h3 className="cpm-aside-title">See the Latest Updates</h3>
              <a className="cpm-aside-link">What's New in Commercial Planning for Manufacturing</a>
              <p className="cpm-aside-text">
                Stay up-to-date with the latest improvements in Commercial Planning for Manufacturing
              </p>
            </div>

            <div className="cpm-aside-card">
              <h3 className="cpm-aside-title">Learning on Trailhead</h3>
              <a className="cpm-aside-link cpm-aside-link--arrow">
                Commercial Planning for Manufacturing Basics
                <ArrowRightIcon />
              </a>
            </div>
          </aside>
          </div>
        </main>
      </div>

      {/* Configure Data Selection modal (opens on Save) */}
      {saveModalOpen && (
        <div className="cpm-modal-backdrop" onClick={() => setSaveModalOpen(false)}>
          <div className="cpm-modal-wrap" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="cpm-modal-close"
              aria-label="Close"
              onClick={() => setSaveModalOpen(false)}
            >
              <CloseIcon size={16} />
            </button>
            <div className="cpm-modal" role="dialog" aria-modal="true" aria-labelledby="cpm-modal-title">
              <div className="cpm-modal-header">
                <h2 id="cpm-modal-title" className="cpm-modal-title">
                  Configure Data Selection?
                </h2>
              </div>
              <div className="cpm-modal-body">
                <p className="cpm-modal-text">
                  This feature uses generative AI to generate responses using data from the selected Data Space.
                  AI-generated outputs may be inaccurate or incomplete. Ensure that only approved data sources are
                  connected and review responses before acting on them.
                </p>
                <div className="cpm-modal-disclaimers">
                  <p className="cpm-modal-disc-title">Disclaimers</p>
                  <div className="cpm-modal-disc-box">
                    <p className="cpm-modal-disc-head">No Changes Allowed!</p>
                    <p className="cpm-modal-disc-text">
                      Saving this configuration permanently associates the selected Data Space with this feature.
                      Changes cannot be made later.
                    </p>
                  </div>
                </div>
              </div>
              <div className="cpm-modal-footer">
                <button
                  className="cpm-btn cpm-btn--outline"
                  type="button"
                  onClick={() => setSaveModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="cpm-btn cpm-btn--brand"
                  type="button"
                  onClick={() => {
                    setDataSpaceSaved(true);
                    setSaveModalOpen(false);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Hierarchies modal (opens from step 1.1 Manage) */}
      <ManageHierarchiesModal
        isOpen={hierarchyModalOpen}
        onClose={(result) => {
          setHierarchyModalOpen(false);
          if (result) setHierarchyToast(result);
        }}
      />

      {hierarchyToast && (
        <MeasureToast
          message={hierarchyToast.message}
          description={hierarchyToast.description}
          onClose={() => setHierarchyToast(null)}
        />
      )}

      <ReviewMeasuresModal
        isOpen={measuresModalOpen}
        onClose={() => setMeasuresModalOpen(false)}
        measures={measures}
        setMeasures={setMeasures}
      />

      {userAccessModalOpen && (
        <ManageUserAccessModal onClose={() => setUserAccessModalOpen(false)} />
      )}

      <TimeGranularityModal
        isOpen={timeGranularityModalOpen}
        onClose={() => setTimeGranularityModalOpen(false)}
      />
    </div>
  );
};

export default CpmFeaturePage;
