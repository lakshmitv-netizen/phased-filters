/**
 * Canonical hex values aligned with `src/styles/variables.css` (SLDS 2 hooks).
 * Use `var(--slds-g-*)` in CSS and inline styles when possible; use these only when
 * an API requires a hex string (persistence, legacy comparisons, color pickers).
 */
export const SLDS_HEX = {
  surface: '#ffffff',
  surfaceGray: '#f3f3f3',
  accent: '#0250D9',
  accent2: '#023a9e',
  onAccent: '#ffffff',
  success: '#396547',
  success2: '#3ba755',
  successContainer: '#cdefc4',
  error: '#ba0517',
  error2: '#ea001e',
  errorContainer: '#feded8',
  warning: '#a96404',
  warning2: '#dd7a01',
  warningContainer: '#fedfd0',
  info: '#0176d3',
  infoContainer: '#d8e6fe',
  /** SLDS palette steps — data / variance bars (matches `var(--slds-g-color-palette-*-*)`) */
  paletteGreen60: '#3ba755',
  paletteRed40: '#ba0517',
  neutral10: '#181818',
  neutral20: '#2e2e2e',
  neutral40: '#5c5c5c',
  neutral50: '#747474',
  neutral60: '#969696',
  neutral70: '#aeaeae',
  neutral80: '#c9c9c9',
  neutral90: '#e5e5e5',
  border: '#a3a3a3',
} as const;
