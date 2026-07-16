import { GridRow } from '../types';
import { TransformedRow } from './layoutTransform';

/**
 * Time period recognition and matching
 */
const MONTH_ABBREVIATIONS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_FULL_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const QUARTER_NAMES = ['q1', 'q2', 'q3', 'q4', 'quarter 1', 'quarter 2', 'quarter 3', 'quarter 4'];
const FISCAL_YEAR_PATTERNS = ['fy26', 'fy 26', 'fiscal year 2026', 'fiscal year 26'];

/**
 * Check if a search term matches a time period
 */
export function isTimePeriodMatching(periodName: string, searchTerm: string): boolean {
  const periodLower = periodName.toLowerCase();
  const searchLower = searchTerm.toLowerCase().trim();
  
  // Check month abbreviations
  if (MONTH_ABBREVIATIONS.some(month => searchLower.includes(month) && periodLower.includes(month))) {
    return true;
  }
  
  // Check full month names
  if (MONTH_FULL_NAMES.some(month => searchLower.includes(month) && periodLower.includes(month))) {
    return true;
  }
  
  // Check quarters
  if (QUARTER_NAMES.some(quarter => searchLower.includes(quarter) && periodLower.includes(quarter))) {
    return true;
  }
  
  // Check fiscal year
  if (FISCAL_YEAR_PATTERNS.some(fy => searchLower.includes(fy) && periodLower.includes('fy'))) {
    return true;
  }
  
  // Direct match
  return periodLower.includes(searchLower) || searchLower.includes(periodLower);
}

/**
 * Map time period keys to display names
 */
const TIME_PERIOD_MAP: { [key: string]: string } = {
  'year': 'FY26',
  'q1': 'Q1',
  'q2': 'Q2',
  'q3': 'Q3',
  'q4': 'Q4',
  'jan2026': 'Jan',
  'feb2026': 'Feb',
  'mar2026': 'Mar',
  'apr2026': 'Apr',
  'may2026': 'May',
  'jun2026': 'Jun',
  'jul2026': 'Jul',
  'aug2026': 'Aug',
  'sep2026': 'Sep',
  'oct2026': 'Oct',
  'nov2026': 'Nov',
  'dec2026': 'Dec',
};

/**
 * Get display name for a time period key
 */
export function getTimePeriodDisplayName(key: string): string {
  return TIME_PERIOD_MAP[key] || key;
}

/**
 * Check if a time period key matches search terms
 */
export function matchesTimePeriod(key: string, searchTerms: string[]): boolean {
  const displayName = getTimePeriodDisplayName(key);
  return searchTerms.some(term => isTimePeriodMatching(displayName, term));
}

/**
 * Extract search terms from search string (comma-separated, AND logic)
 */
export function extractSearchTerms(searchString: string): string[] {
  if (!searchString || !searchString.trim()) {
    return [];
  }
  return searchString
    .split(',')
    .map(term => term.trim())
    .filter(term => term.length > 0);
}

/**
 * Check if text matches any search term (case-insensitive partial match)
 */
export function matchesText(text: string, searchTerms: string[]): boolean {
  if (searchTerms.length === 0) return true;
  const textLower = text.toLowerCase();
  return searchTerms.every(term => textLower.includes(term.toLowerCase()));
}

/**
 * Check if a number matches any search term
 */
export function matchesNumber(value: number, searchTerms: string[]): boolean {
  if (searchTerms.length === 0) return false;
  const valueStr = value.toString();
  const formattedValue = value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return searchTerms.some(term => {
    const termLower = term.toLowerCase();
    return valueStr.includes(term) || formattedValue.toLowerCase().includes(termLower);
  });
}

/**
 * Highlight matching text in a string
 */
export function highlightText(text: string, searchTerms: string[]): string {
  try {
    if (!text || searchTerms.length === 0) return text || '';
    
    const textLower = text.toLowerCase();
    
    // Find all matches and their positions
    const matches: Array<{ start: number; end: number; term: string }> = [];
    
    searchTerms.forEach(term => {
      if (!term || term.trim() === '') return;
      const termLower = term.toLowerCase().trim();
      if (termLower.length === 0) return;
      
      let startIndex = 0;
      while (true) {
        const index = textLower.indexOf(termLower, startIndex);
        if (index === -1) break;
        const endIndex = Math.min(index + term.length, text.length);
        matches.push({
          start: index,
          end: endIndex,
          term: text.substring(index, endIndex)
        });
        startIndex = index + 1;
      }
    });
    
    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);
    
    // Merge overlapping matches
    const mergedMatches: Array<{ start: number; end: number }> = [];
    for (const match of matches) {
      if (mergedMatches.length === 0) {
        mergedMatches.push({ start: match.start, end: match.end });
      } else {
        const last = mergedMatches[mergedMatches.length - 1];
        if (match.start <= last.end) {
          last.end = Math.max(last.end, match.end);
        } else {
          mergedMatches.push({ start: match.start, end: match.end });
        }
      }
    }
    
    // Build highlighted string
    if (mergedMatches.length === 0) return text;
    
    let result = '';
    let lastIndex = 0;
    for (const match of mergedMatches) {
      if (match.start < lastIndex) continue; // Skip invalid matches
      result += escapeHtml(text.substring(lastIndex, match.start));
      const matchText = escapeHtml(text.substring(match.start, match.end));
      result += `<mark class="search-highlight">${matchText}</mark>`;
      lastIndex = match.end;
    }
    result += escapeHtml(text.substring(lastIndex));
    
    return result;
  } catch (error) {
    console.error('[searchUtils] Error in highlightText:', error);
    return text || '';
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Check if a row matches search terms (for HierarchicalGrid)
 * @param timeTerms - Optional time period terms to match against specific time columns
 * @param matchingTimeKeys - Optional set of time keys that match the time terms
 */
export function rowMatchesSearch(
  row: GridRow,
  searchTerms: string[],
  measureName: string,
  timeTerms?: string[],
  matchingTimeKeys?: Set<string>
): { matches: boolean; matchedCellKeys: Set<string> } {
  const matchedCellKeys = new Set<string>();
  
  if (searchTerms.length === 0 && (!timeTerms || timeTerms.length === 0)) {
    return { matches: true, matchedCellKeys };
  }
  
  try {
    // Check row name
    const nameMatches = searchTerms.length > 0 ? matchesText(row.name || '', searchTerms) : true;
    const measureMatches = searchTerms.length > 0 ? matchesText(measureName || '', searchTerms) : true;
    
    // Check cell values
    const timeKeys: (keyof GridRow['values'])[] = [
      'year', 'q1', 'q2', 'q3', 'q4',
      'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
      'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
    ];
    
    let hasMatchingCell = false;
    let hasMatchingTimeCell = false;
    
    if (row.values) {
      timeKeys.forEach(key => {
        try {
          const value = row.values[key] || 0;
          
          // If we have time terms and matching time keys, only check cells in matching time columns
          if (timeTerms && timeTerms.length > 0 && matchingTimeKeys) {
            if (matchingTimeKeys.has(key)) {
              // Check if value matches any search terms (for numeric search)
              if (searchTerms.length > 0 && matchesNumber(value, searchTerms)) {
                matchedCellKeys.add(key);
                hasMatchingCell = true;
                hasMatchingTimeCell = true;
              } else if (searchTerms.length === 0) {
                // If only time terms (no other search terms), show rows with data in matching time columns
                if (value !== 0 && value !== null && value !== undefined) {
                  matchedCellKeys.add(key);
                  hasMatchingTimeCell = true;
                }
              }
            }
          } else {
            // No time filtering - check all cells for search term matches
            if (searchTerms.length > 0 && matchesNumber(value, searchTerms)) {
              matchedCellKeys.add(key);
              hasMatchingCell = true;
            }
          }
        } catch (e) {
          // Skip if error accessing value
        }
      });
    }
    
    // Row matches if:
    // 1. Name matches search terms (show row if name matches, regardless of time data)
    // 2. Measure matches search terms (show row if measure matches, regardless of time data)
    // 3. Has matching cell values (numeric matches in any cell, or in time-filtered cells if time terms exist)
    // 4. If only time terms (no other search terms), show rows with data in matching time columns
    // Note: Time terms filter which columns are visible, but don't require data in those columns for row matching
    const matches = 
      nameMatches ||
      measureMatches ||
      hasMatchingCell ||
      (timeTerms && timeTerms.length > 0 && matchingTimeKeys && hasMatchingTimeCell && searchTerms.length === 0);
    
    // Recursively check children
    if (row.children && row.children.length > 0) {
      for (const child of row.children) {
        try {
          const childResult = rowMatchesSearch(child, searchTerms, measureName, timeTerms, matchingTimeKeys);
          if (childResult.matches) {
            childResult.matchedCellKeys.forEach(key => matchedCellKeys.add(key));
            return { matches: true, matchedCellKeys };
          }
        } catch (e) {
          // Continue checking other children if one fails
          console.error('[searchUtils] Error checking child row:', e);
        }
      }
    }
    
    return { matches, matchedCellKeys };
  } catch (error) {
    console.error('[searchUtils] Error in rowMatchesSearch:', error);
    return { matches: false, matchedCellKeys };
  }
}

/**
 * Check if a transformed row matches search terms (for DimensionsTimeGrid and TimeDimensionsGrid)
 */
export function transformedRowMatchesSearch(
  row: TransformedRow,
  searchTerms: string[]
): { matches: boolean; matchedMeasureIds: Set<string> } {
  const matchedMeasureIds = new Set<string>();
  
  if (searchTerms.length === 0) {
    return { matches: true, matchedMeasureIds };
  }
  
  // Check row name
  const nameMatches = matchesText(row.name, searchTerms);
  
  // Check cell values
  let hasMatchingCell = false;
  row.measureValues.forEach((value, measureId) => {
    if (matchesNumber(value, searchTerms)) {
      matchedMeasureIds.add(measureId);
      hasMatchingCell = true;
    }
  });
  
  const matches = nameMatches || hasMatchingCell;
  
  // Recursively check children
  if (row.children && row.children.length > 0) {
    for (const child of row.children) {
      const childResult = transformedRowMatchesSearch(child, searchTerms);
      if (childResult.matches) {
        childResult.matchedMeasureIds.forEach(id => matchedMeasureIds.add(id));
        return { matches: true, matchedMeasureIds };
      }
    }
  }
  
  return { matches, matchedMeasureIds };
}

/**
 * Separate search terms into measure terms, dimension terms, and time period terms
 * Backward compatible: if availableMeasures is not provided, returns timeTerms and otherTerms
 */
export function separateSearchTerms(
  searchTerms: string[],
  availableMeasures?: Array<{ id: string; name: string }>
): {
  measureTerms?: string[];
  dimensionTerms?: string[];
  timeTerms: string[];
  otherTerms: string[];
} {
  const measureTerms: string[] = [];
  const dimensionTerms: string[] = [];
  const timeTerms: string[] = [];
  const otherTerms: string[] = [];
  
  searchTerms.forEach(term => {
    const termLower = term.toLowerCase().trim();
    if (termLower.length === 0) {
      return;
    }
    
    // Check if it's a time term first
    const isTimeTerm = 
      // Exact month abbreviation match (e.g., "may" matches "may")
      MONTH_ABBREVIATIONS.some(m => termLower === m) ||
      // Full month name match (e.g., "may" matches "may")
      MONTH_FULL_NAMES.some(m => termLower === m || termLower.startsWith(m)) ||
      // Quarter match
      QUARTER_NAMES.some(q => termLower === q || termLower.startsWith(q)) ||
      // Fiscal year match
      FISCAL_YEAR_PATTERNS.some(fy => termLower === fy || termLower.startsWith(fy)) ||
      // Pattern match for quarters and fiscal year
      /^(q[1-4]|fy\d+|fiscal\s*year)/i.test(termLower) ||
      // Month abbreviations at start of term (e.g., "may" matches)
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(termLower);
    
    if (isTimeTerm) {
      timeTerms.push(term);
      return;
    }
    
    // Check if it matches a measure name (only if availableMeasures is provided)
    if (availableMeasures && availableMeasures.length > 0) {
      const matchesMeasure = availableMeasures.some(measure => {
        const measureNameLower = measure.name.toLowerCase();
        // Check if term is contained in measure name or vice versa
        if (measureNameLower.includes(termLower) || termLower.includes(measureNameLower)) {
          return true;
        }
        // For multi-word terms, check if all words appear in measure name
        const termWords = termLower.split(/\s+/).filter(w => w.length > 0);
        if (termWords.length > 1) {
          return termWords.every(word => measureNameLower.includes(word));
        }
        return false;
      });
      
      if (matchesMeasure) {
        measureTerms.push(term);
        return;
      }
    }
    
    // If not a time term or measure, it's likely a dimension term or other term
    if (availableMeasures) {
      // Enhanced mode: treat as dimension term
      dimensionTerms.push(term);
    } else {
      // Backward compatible mode: treat as other term
      otherTerms.push(term);
    }
  });
  
  console.log('[separateSearchTerms] Result:', { measureTerms, dimensionTerms, timeTerms, otherTerms });
  
  // Return backward compatible format if availableMeasures not provided
  if (!availableMeasures) {
    return { timeTerms, otherTerms };
  }
  
  return { measureTerms, dimensionTerms, timeTerms, otherTerms };
}

/**
 * Get all time period keys that match search terms
 */
export function getMatchingTimePeriodKeys(timeTerms: string[]): Set<string> {
  const matchingKeys = new Set<string>();
  
  if (timeTerms.length === 0) {
    // If no time terms, return all keys
    return new Set(['year', 'q1', 'q2', 'q3', 'q4', 'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026', 'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026']);
  }
  
  const allKeys: string[] = ['year', 'q1', 'q2', 'q3', 'q4', 'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026', 'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026'];
  
  // First, find all directly matching keys
  const directlyMatchingKeys = new Set<string>();
  allKeys.forEach(key => {
    const displayName = getTimePeriodDisplayName(key);
    const matches = matchesTimePeriod(key, timeTerms);
    if (matches) {
      console.log(`[getMatchingTimePeriodKeys] Key "${key}" (display: "${displayName}") matches time terms:`, timeTerms);
      directlyMatchingKeys.add(key);
    }
  });
  
  console.log('[getMatchingTimePeriodKeys] Directly matching keys:', Array.from(directlyMatchingKeys));
  
  // If no direct matches, return empty set (or all keys if that's preferred)
  if (directlyMatchingKeys.size === 0) {
    console.log('[getMatchingTimePeriodKeys] No direct matches found');
    return matchingKeys; // Return empty - no matches
  }
  
  // For each directly matching key, add it and its parents/children
  directlyMatchingKeys.forEach(key => {
    matchingKeys.add(key);
    
    // Add parent/child relationships
    if (key === 'year') {
      // Year matches - add all quarters and months
      matchingKeys.add('q1'); matchingKeys.add('q2'); matchingKeys.add('q3'); matchingKeys.add('q4');
      matchingKeys.add('jan2026'); matchingKeys.add('feb2026'); matchingKeys.add('mar2026');
      matchingKeys.add('apr2026'); matchingKeys.add('may2026'); matchingKeys.add('jun2026');
      matchingKeys.add('jul2026'); matchingKeys.add('aug2026'); matchingKeys.add('sep2026');
      matchingKeys.add('oct2026'); matchingKeys.add('nov2026'); matchingKeys.add('dec2026');
    } else if (key.startsWith('q')) {
      // Quarter matches - add year and months in this quarter
      matchingKeys.add('year');
      if (key === 'q1') {
        matchingKeys.add('jan2026'); matchingKeys.add('feb2026'); matchingKeys.add('mar2026');
      } else if (key === 'q2') {
        matchingKeys.add('apr2026'); matchingKeys.add('may2026'); matchingKeys.add('jun2026');
      } else if (key === 'q3') {
        matchingKeys.add('jul2026'); matchingKeys.add('aug2026'); matchingKeys.add('sep2026');
      } else if (key === 'q4') {
        matchingKeys.add('oct2026'); matchingKeys.add('nov2026'); matchingKeys.add('dec2026');
      }
    } else if (key.includes('2026')) {
      // Month matches - add year, quarter, and the month
      matchingKeys.add('year');
      if (['jan2026', 'feb2026', 'mar2026'].includes(key)) {
        matchingKeys.add('q1');
      } else if (['apr2026', 'may2026', 'jun2026'].includes(key)) {
        matchingKeys.add('q2');
      } else if (['jul2026', 'aug2026', 'sep2026'].includes(key)) {
        matchingKeys.add('q3');
      } else if (['oct2026', 'nov2026', 'dec2026'].includes(key)) {
        matchingKeys.add('q4');
      }
    }
  });
  
  return matchingKeys;
}

