/**
 * In-cell formula evaluation, ported to match Parag's deployed grid behavior exactly.
 *
 * Supported inputs when a user edits a cell:
 *   - Plain numbers:            "1,234.5"   -> 1234.5
 *   - Percentage deltas:        "+10%"      -> currentValue * 1.10
 *                               "-5%"       -> currentValue * 0.95
 *   - Arithmetic formulas:      "=78*56"    -> 4368
 *                               "=(x+100)*1.1" where `x` is the current cell value
 *                               "=10% * 200" where `N%` becomes (N/100)
 *
 * The arithmetic is evaluated with a small, safe recursive-descent parser (no eval /
 * `new Function`), which also avoids Content-Security-Policy issues when deployed.
 */

export interface CellFormulaResult {
  /** True when the input was a formula (started with `=`) or a percentage delta. */
  isFormula: boolean;
  /** Numeric result, or null when empty / invalid. */
  value: number | null;
  /** The original (trimmed) expression the user typed. */
  expression: string;
  /** True when the input was a formula but could not be evaluated. */
  error: boolean;
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' };

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        num += expr[i];
        i++;
      }
      const parsed = parseFloat(num);
      if (isNaN(parsed)) return null;
      tokens.push({ type: 'num', value: parsed });
      continue;
    }
    // Any other character is invalid.
    return null;
  }
  return tokens;
}

function parseTokens(tokens: Token[]): number | null {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];

  // expression := term (('+' | '-') term)*
  const parseExpression = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    for (;;) {
      const t = peek();
      if (!t || t.type !== 'op' || (t.value !== '+' && t.value !== '-')) break;
      pos++;
      const right = parseTerm();
      if (right === null) return null;
      left = t.value === '+' ? left + right : left - right;
    }
    return left;
  };

  // term := factor (('*' | '/') factor)*
  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    for (;;) {
      const t = peek();
      if (!t || t.type !== 'op' || (t.value !== '*' && t.value !== '/')) break;
      pos++;
      const right = parseFactor();
      if (right === null) return null;
      if (t.value === '*') {
        left *= right;
      } else {
        if (right === 0) return null;
        left /= right;
      }
    }
    return left;
  };

  // factor := ('+' | '-') factor | '(' expression ')' | num
  const parseFactor = (): number | null => {
    const t = peek();
    if (!t) return null;
    if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
      pos++;
      const inner = parseFactor();
      if (inner === null) return null;
      return t.value === '-' ? -inner : inner;
    }
    if (t.type === 'lparen') {
      pos++;
      const inner = parseExpression();
      if (inner === null) return null;
      const next = peek();
      if (next && next.type === 'rparen') {
        pos++;
        return inner;
      }
      return null;
    }
    if (t.type === 'num') {
      pos++;
      return t.value;
    }
    return null;
  };

  const result = parseExpression();
  // Require that the whole token stream was consumed.
  if (result === null || pos !== tokens.length) return null;
  return result;
}

/** Safely evaluates a basic arithmetic expression (no variables / functions). */
export function evaluateArithmetic(expr: string): number | null {
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return null;
  return parseTokens(tokens);
}

/**
 * Evaluates raw cell-edit input against the cell's current value.
 * Mirrors Parag's deployed `evaluateCellInput`/formula behavior.
 */
export function evaluateCellInput(rawInput: string, currentValue: number): CellFormulaResult {
  const input = (rawInput ?? '').trim();
  if (input === '') {
    return { isFormula: false, value: null, expression: '', error: false };
  }

  const base = typeof currentValue === 'number' && isFinite(currentValue) ? currentValue : 0;

  // Percentage delta: "+10%" / "-5%" -> base adjusted by that percentage.
  const pctMatch = input.match(/^([+-])\s*(\d+(?:\.\d+)?)\s*%$/);
  if (pctMatch) {
    const sign = pctMatch[1] === '-' ? -1 : 1;
    const pct = parseFloat(pctMatch[2]);
    if (isNaN(pct)) {
      return { isFormula: true, value: null, expression: input, error: true };
    }
    return { isFormula: true, value: base * (1 + (sign * pct) / 100), expression: input, error: false };
  }

  // Arithmetic formula: starts with "=".
  if (input.startsWith('=')) {
    let expr = input.slice(1).trim();
    if (expr === '') {
      return { isFormula: true, value: null, expression: input, error: true };
    }
    expr = expr.replace(/,/g, '');
    // `x` (case-insensitive) references the current cell value.
    expr = expr.replace(/\bx\b/gi, `(${base})`);
    // Inline percentages: "10%" -> "(10/100)".
    expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
    const result = evaluateArithmetic(expr);
    return result !== null && isFinite(result)
      ? { isFormula: true, value: result, expression: input, error: false }
      : { isFormula: true, value: null, expression: input, error: true };
  }

  // Plain number.
  const num = parseFloat(input.replace(/,/g, ''));
  return { isFormula: false, value: isNaN(num) ? null : num, expression: input, error: false };
}
