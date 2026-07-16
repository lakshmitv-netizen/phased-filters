import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { MeasureData } from '../types';
import TimeDimensionsRowComponent from './TimeDimensionsRow';
import { transformToTimeDimensionsLayout, TransformedRow } from '../utils/layoutTransform';
import {
  extractSearchTerms,
  transformedRowMatchesSearch,
  separateSearchTerms,
  matchesText,
  getMatchingTimePeriodKeys,
} from '../utils/searchUtils';
import { SearchHighlight } from './SearchHighlight';
import { useIsGrid264UpdatedExperience } from '../contexts/IndustryContext';
import '../styles/components/Grid.css';

interface TimeDimensionsGridProps {
  data: MeasureData[];
  onDataChange?: (newData: MeasureData[]) => void;
  /** Notified whenever the set of expanded row ids changes (used to lazily grow deep hierarchies). */
  onExpandedRowsChange?: (expandedIds: Set<string>) => void;
  selectedDimensionLevels?: Set<string>;
  selectedTimeGranularities?: Set<string>;
  columnWidth?: number;
  onExpandAllRows?: (handler: () => void) => void;
  onCollapseAllRows?: (handler: () => void) => void;
  onSettingsClick?: () => void;
  initialFocusedCell?: { rowId: string; measureId: string } | null;
  onFocusedCellChange?: (focus: { rowId: string; measureId: string } | null) => void;
  searchTerm?: string; // Search term for filtering rows and columns
  onEditHistory?: (entry: { cellKey: string; rowId: string; timeKey?: string; measureId?: string; oldValue: number; newValue: number }) => void; // Callback to track edit history
  showAllPeriods?: boolean; // Whether to show all time periods or filter by date range
  startPeriod?: string; // Start date for filtering (YYYY-MM-DD format)
  endPeriod?: string; // End date for filtering (YYYY-MM-DD format)
  selectedCells?: Set<string>; // Set of selected cell keys
  onCellSelect?: (cellKey: string, event: React.MouseEvent) => void; // Callback when a cell is clicked for selection
  onCellMouseDown?: (cellKey: string, event: React.MouseEvent) => void; // Callback for mouse down (drag selection)
  onCellMouseMove?: (cellKey: string) => void; // Callback for mouse move (drag selection)
  newlyAddedMeasureIds?: string[]; // IDs of newly added measures for animation effect
  onScrollToMeasureReady?: (handler: (measureId: string) => void) => void; // Callback to expose function to scroll to a measure column
}

const TimeDimensionsGrid: React.FC<TimeDimensionsGridProps> = ({
  data,
  onDataChange,
  onExpandedRowsChange,
  selectedDimensionLevels,
  selectedTimeGranularities,
  columnWidth = 100,
  onExpandAllRows,
  onCollapseAllRows,
  onSettingsClick,
  initialFocusedCell,
  onFocusedCellChange,
  searchTerm = '',
  onEditHistory,
  showAllPeriods = true,
  startPeriod = '',
  endPeriod = '',
  newlyAddedMeasureIds = [],
  onScrollToMeasureReady,
  selectedCells,
  onCellSelect,
  onCellMouseDown,
  onCellMouseMove,
}) => {
  const isGrid264Ux = useIsGrid264UpdatedExperience();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  // Let the data owner lazily grow deep hierarchies one level ahead of what's expanded.
  useEffect(() => {
    onExpandedRowsChange?.(expandedRows);
  }, [expandedRows, onExpandedRowsChange]);
  const [focusedCell, setFocusedCell] = useState<{ rowId: string; measureId: string } | null>(initialFocusedCell || null);
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const [editedCells, setEditedCells] = useState<Map<string, number>>(new Map());
  const [impactedCells, setImpactedCells] = useState<Map<string, number>>(new Map());
  const [savedEditedCells] = useState<Map<string, string>>(new Map());
  const [gridData, setGridData] = useState<MeasureData[]>(data);
  const tableWrapperRef = useRef<HTMLDivElement>(null);


  // Update local data when prop changes
  useEffect(() => {
    if (data !== gridData) {
      console.log('[TimeDimensionsGrid] Data prop changed, updating gridData');
      setGridData(data);
    }
  }, [data, gridData]);

  // Transform data to Time/Dimensions x Measures layout
  const transformedRows = useMemo(() => {
    try {
      const transformed = transformToTimeDimensionsLayout(gridData);
      return transformed;
    } catch (error) {
      console.error('[TimeDimensionsGrid] Error transforming data:', error);
      return [];
    }
  }, [gridData]);

  // Helper to collect all dimensions from a time row's descendants
  const collectDimensionsFromDescendants = useCallback((row: TransformedRow): TransformedRow[] => {
    const dimensions: TransformedRow[] = [];
    const collect = (children: TransformedRow[]) => {
      for (const child of children) {
        if (child.type === 'account' || child.type === 'category' || child.type === 'product') {
          dimensions.push(child);
        } else if (child.children) {
          collect(child.children);
        }
      }
    };
    if (row.children) {
      collect(row.children);
    }
    return dimensions;
  }, []);

  // Expand all rows by default
  useEffect(() => {
    const allRowIds = new Set<string>();
    const collectRowIds = (rows: TransformedRow[]) => {
      rows.forEach(row => {
        allRowIds.add(row.id);
        if (row.children) {
          collectRowIds(row.children);
        }
      });
    };
    collectRowIds(transformedRows);
    setExpandedRows(allRowIds);
  }, [transformedRows]);

  // Expose scroll function to parent
  useEffect(() => {
    if (onScrollToMeasureReady) {
      onScrollToMeasureReady((measureId: string) => {
        // Find the header cell for this measure
        const headerCell = document.querySelector(`th.newly-added-measure-column[data-measure-id="${measureId}"]`);
        if (headerCell && tableWrapperRef.current) {
          headerCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      });
    }
  }, [onScrollToMeasureReady]);

  // Filter dimension rows based on selected dimension levels (applied at each time period)
  const filterDimensionsByLevels = useCallback((
    dimensionRows: TransformedRow[],
    selectedLevels: Set<string>
  ): TransformedRow[] => {
    if (!selectedLevels || selectedLevels.size === 0) {
      return dimensionRows;
    }

    const filtered: TransformedRow[] = [];

    for (const row of dimensionRows) {
      const levelKey = row.type === 'account' ? 'account' : 
                       row.type === 'category' ? 'category' : 
                       row.type === 'product' ? 'product' : null;
      
      if (!levelKey) {
        // Not a dimension row, keep as is
        filtered.push(row);
        continue;
      }

      if (selectedLevels.has(levelKey)) {
        // This level is selected, process children
        const processedChildren = row.children ? filterDimensionsByLevels(row.children, selectedLevels) : undefined;
        filtered.push({
          ...row,
          children: processedChildren,
        });
      } else {
        // This level is not selected, promote its children
        if (row.children) {
          const promoted = filterDimensionsByLevels(row.children, selectedLevels);
          filtered.push(...promoted);
        }
      }
    }

    return filtered;
  }, []);

  // Determine the deepest enabled time granularity level
  const getDeepestEnabledGranularity = useCallback((selectedGranularities: Set<string>): string | null => {
    if (!selectedGranularities || selectedGranularities.size === 0) {
      return 'month'; // Default to month if nothing selected
    }
    
    // Check in order: month > quarter > year
    if (selectedGranularities.has('month')) {
      return 'month';
    }
    if (selectedGranularities.has('quarter')) {
      return 'quarter';
    }
    if (selectedGranularities.has('year')) {
      return 'year';
    }
    
    return null;
  }, []);

  // Filter time rows based on selected time granularities
  // Dimensions only appear under the deepest enabled time granularity level
  const filterTimeRows = useCallback((
    rows: TransformedRow[],
    selectedGranularities: Set<string>
  ): TransformedRow[] => {
    if (!selectedGranularities || selectedGranularities.size === 0) {
      return rows;
    }

    const deepestGranularity = getDeepestEnabledGranularity(selectedGranularities);
    const filtered: TransformedRow[] = [];

    for (const row of rows) {
      if (row.type === 'year') {
        if (selectedGranularities.has('year')) {
          // Collect dimensions BEFORE filtering (from original row.children)
          const allDimensions = deepestGranularity === 'year' ? collectDimensionsFromDescendants(row) : [];
          
          // Process children (quarters) - this may filter out months if they're not deepest
          const processedChildren = row.children ? filterTimeRows(row.children, selectedGranularities) : undefined;
          
          // Only keep dimensions if year is the deepest enabled level
          if (deepestGranularity === 'year') {
            // Year is the deepest level - aggregate collected dimensions
            
            // Aggregate dimensions by their base ID (remove time suffix)
            const dimensionMap = new Map<string, TransformedRow>();
            allDimensions.forEach(dim => {
              // Extract base dimension ID (remove time suffix like -q1, -jan2026)
              const baseId = dim.id.replace(/-(q[1-4]|jan2026|feb2026|mar2026|apr2026|may2026|jun2026|jul2026|aug2026|sep2026|oct2026|nov2026|dec2026)$/, '');
              if (!dimensionMap.has(baseId)) {
                // Create a new dimension row for year level
                dimensionMap.set(baseId, {
                  ...dim,
                  id: `${baseId}-year`,
                  parentId: row.id,
                });
              } else {
                // Aggregate values
                const existing = dimensionMap.get(baseId)!;
                dim.measureValues.forEach((value, measureId) => {
                  const current = existing.measureValues.get(measureId) || 0;
                  existing.measureValues.set(measureId, current + value);
                });
              }
            });
            
            const filteredDimensions = Array.from(dimensionMap.values()).length > 0 ? 
              filterDimensionsByLevels(Array.from(dimensionMap.values()), selectedDimensionLevels || new Set()) : 
              [];
            
            filtered.push({
              ...row,
              children: [...(processedChildren || []), ...filteredDimensions],
            });
          } else {
            // Year is not the deepest level, remove dimensions (only keep time children)
            filtered.push({
              ...row,
              children: processedChildren,
            });
          }
        } else {
          // Year not selected, promote quarters
          if (row.children) {
            const promoted = filterTimeRows(row.children, selectedGranularities);
            filtered.push(...promoted);
          }
        }
      } else if (row.type === 'quarter') {
        if (selectedGranularities.has('quarter')) {
          // Collect dimensions BEFORE filtering (from original row.children)
          const allDimensions = deepestGranularity === 'quarter' ? collectDimensionsFromDescendants(row) : [];
          
          // Process children (months) - this may filter out months if they're not deepest
          const processedChildren = row.children ? filterTimeRows(row.children, selectedGranularities) : undefined;
          
          // Only keep dimensions if quarter is the deepest enabled level
          if (deepestGranularity === 'quarter') {
            // Quarter is the deepest level - aggregate collected dimensions
            
            // Aggregate dimensions by their base ID
            const dimensionMap = new Map<string, TransformedRow>();
            const quarterKey = row.timeKey || 'q1';
            allDimensions.forEach(dim => {
              const baseId = dim.id.replace(/-(jan2026|feb2026|mar2026|apr2026|may2026|jun2026|jul2026|aug2026|sep2026|oct2026|nov2026|dec2026)$/, '');
              if (!dimensionMap.has(baseId)) {
                dimensionMap.set(baseId, {
                  ...dim,
                  id: `${baseId}-${quarterKey}`,
                  parentId: row.id,
                });
              } else {
                const existing = dimensionMap.get(baseId)!;
                dim.measureValues.forEach((value, measureId) => {
                  const current = existing.measureValues.get(measureId) || 0;
                  existing.measureValues.set(measureId, current + value);
                });
              }
            });
            
            const filteredDimensions = Array.from(dimensionMap.values()).length > 0 ? 
              filterDimensionsByLevels(Array.from(dimensionMap.values()), selectedDimensionLevels || new Set()) : 
              [];
            
            filtered.push({
              ...row,
              children: [...(processedChildren || []), ...filteredDimensions],
            });
          } else {
            // Quarter is not the deepest level, remove dimensions (only keep time children)
            filtered.push({
              ...row,
              children: processedChildren,
            });
          }
        } else {
          // Quarter not selected, promote months
          if (row.children) {
            const promoted = filterTimeRows(row.children, selectedGranularities);
            filtered.push(...promoted);
          }
        }
      } else if (row.type === 'month') {
        if (selectedGranularities.has('month')) {
          // Month is the deepest time level, so if month is enabled and is the deepest, keep dimensions
          if (deepestGranularity === 'month') {
            // Filter dimensions under this month
            const processedChildren = row.children ? filterDimensionsByLevels(row.children, selectedDimensionLevels || new Set()) : undefined;
            filtered.push({
              ...row,
              children: processedChildren,
            });
          } else {
            // Month is enabled but not the deepest (shouldn't happen, but handle it)
            filtered.push({
              ...row,
              children: undefined,
            });
          }
        }
        // If month not selected, skip it
      } else {
        // Dimension row - process children recursively
        const processedChildren = row.children ? filterTimeRows(row.children, selectedGranularities) : undefined;
        filtered.push({
          ...row,
          children: processedChildren,
        });
      }
    }

    return filtered;
  }, [filterDimensionsByLevels, selectedDimensionLevels, getDeepestEnabledGranularity, collectDimensionsFromDescendants]);

  // Apply filters
  const timeGranularityFilteredRows = useMemo(() => {
    let result = transformedRows;
    
    // Apply time filtering first
    if (selectedTimeGranularities && selectedTimeGranularities.size > 0) {
      result = filterTimeRows(result, selectedTimeGranularities);
    }
    
    return result;
  }, [transformedRows, selectedTimeGranularities, filterTimeRows]);

  // Helper function to check if a month key falls within the date range
  const isMonthInRange = useCallback((monthKey: string, start: string, end: string): boolean => {
    if (!start && !end) return true;
    
    const monthKeyToNumber: { [key: string]: number } = {
      'jan2026': 1, 'feb2026': 2, 'mar2026': 3, 'apr2026': 4,
      'may2026': 5, 'jun2026': 6, 'jul2026': 7, 'aug2026': 8,
      'sep2026': 9, 'oct2026': 10, 'nov2026': 11, 'dec2026': 12
    };
    
    const monthNum = monthKeyToNumber[monthKey];
    if (!monthNum) return true;
    
    let startMonth = 1;
    let endMonth = 12;
    
    if (start) {
      const startDate = new Date(start);
      startMonth = startDate.getMonth() + 1;
    }
    
    if (end) {
      const endDate = new Date(end);
      endMonth = endDate.getMonth() + 1;
    }
    
    return monthNum >= startMonth && monthNum <= endMonth;
  }, []);

  // Helper to check if a quarter has any visible months
  const isQuarterInRange = useCallback((quarterKey: string, start: string, end: string): boolean => {
    if (!start && !end) return true;
    
    const quarterMonths: { [key: string]: string[] } = {
      'q1': ['jan2026', 'feb2026', 'mar2026'],
      'q2': ['apr2026', 'may2026', 'jun2026'],
      'q3': ['jul2026', 'aug2026', 'sep2026'],
      'q4': ['oct2026', 'nov2026', 'dec2026']
    };
    
    const months = quarterMonths[quarterKey];
    if (!months) return true;
    
    return months.some(month => isMonthInRange(month, start, end));
  }, [isMonthInRange]);

  // Filter time rows by date range
  const filterRowsByDateRange = useCallback((
    rows: TransformedRow[],
    start: string,
    end: string
  ): TransformedRow[] => {
    if (!start && !end) return rows;

    const filterRow = (row: TransformedRow): TransformedRow | null => {
      if (row.type === 'month') {
        if (!row.timeKey || !isMonthInRange(row.timeKey, start, end)) {
          return null;
        }
        return row;
      } else if (row.type === 'quarter') {
        if (!row.timeKey || !isQuarterInRange(row.timeKey, start, end)) {
          return null;
        }
        const filteredChildren = row.children
          ? row.children.map(child => filterRow(child)).filter((c): c is TransformedRow => c !== null)
          : undefined;
        if (filteredChildren && filteredChildren.length === 0) {
          return null;
        }
        return { ...row, children: filteredChildren };
      } else if (row.type === 'year') {
        const filteredChildren = row.children
          ? row.children.map(child => filterRow(child)).filter((c): c is TransformedRow => c !== null)
          : undefined;
        if (filteredChildren && filteredChildren.length === 0) {
          return null;
        }
        return { ...row, children: filteredChildren };
      } else {
        // Dimension row
        const filteredChildren = row.children
          ? row.children.map(child => filterRow(child)).filter((c): c is TransformedRow => c !== null)
          : undefined;
        return { ...row, children: filteredChildren };
      }
    };

    return rows.map(row => filterRow(row)).filter((r): r is TransformedRow => r !== null);
  }, [isMonthInRange, isQuarterInRange]);

  // Apply date range filtering
  const dateRangeFilteredRows = useMemo(() => {
    if (showAllPeriods || (!startPeriod && !endPeriod)) {
      return timeGranularityFilteredRows;
    }
    return filterRowsByDateRange(timeGranularityFilteredRows, startPeriod, endPeriod);
  }, [timeGranularityFilteredRows, showAllPeriods, startPeriod, endPeriod, filterRowsByDateRange]);

  // Apply search filtering to rows
  const filteredRows = useMemo(() => {
    try {
      if (!searchTerm || !searchTerm.trim()) {
        return dateRangeFilteredRows;
      }

      const searchTerms = extractSearchTerms(searchTerm);
      if (searchTerms.length === 0) {
        return dateRangeFilteredRows;
      }

      const { timeTerms, otherTerms } = separateSearchTerms(searchTerms);
      
      // Filter rows based on search (both time terms and other terms apply to rows in this layout)
      const allSearchTerms = [...timeTerms, ...otherTerms];
      if (allSearchTerms.length === 0) {
        return dateRangeFilteredRows;
      }

      // Check if any measure names match the search terms
      const allMeasures = gridData.map(measure => ({
        id: measure.id,
        name: measure.name,
      }));
      const matchingMeasures = allMeasures.filter(measure => 
        matchesText(measure.name, otherTerms)
      );
      const hasMatchingMeasures = matchingMeasures.length > 0;

      const filterRow = (row: TransformedRow): TransformedRow | null => {
        try {
          // For time rows, check if time period matches
          let matches = false;
          if (row.type === 'year' || row.type === 'quarter' || row.type === 'month') {
            // Check if time period matches
            if (timeTerms.length > 0 && row.timeKey) {
              const matchingKeys = getMatchingTimePeriodKeys(timeTerms);
              if (matchingKeys.has(row.timeKey)) {
                matches = true;
              }
            }
            // Also check row name against non-time terms
            if (!matches && otherTerms.length > 0) {
              matches = matchesText(row.name, otherTerms);
            }
          } else {
            // Dimension row - only check against non-time terms
            // If we're searching for ONLY time periods, dimension rows should not match
            if (timeTerms.length > 0 && otherTerms.length === 0) {
              // Only time terms - dimension rows don't match
              matches = false;
            } else {
              // Check against non-time terms
              const matchResult = transformedRowMatchesSearch(row, otherTerms);
              matches = matchResult.matches;
            }
          }
          
          // Process children
          let filteredChildren: TransformedRow[] = [];
          if (row.children && row.children.length > 0) {
            // Always filter children recursively to ensure only matching rows are shown
            // Even if parent matches, we need to filter children based on search
            for (const child of row.children) {
              try {
                const filteredChild = filterRow(child);
                if (filteredChild) {
                  filteredChildren.push(filteredChild);
                }
              } catch (e) {
                console.error('[TimeDimensionsGrid] Error filtering child:', e);
              }
            }
          }

          // Show row if:
          // 1. Measure names match (all rows should be shown)
          // 2. Row matches (time period, row name, or cell values)
          // 3. Has matching children
          if (hasMatchingMeasures || matches || filteredChildren.length > 0) {
            return {
              ...row,
              children: filteredChildren.length > 0 ? filteredChildren : row.children,
            };
          }

          return null;
        } catch (e) {
          console.error('[TimeDimensionsGrid] Error in filterRow:', e);
          // If measures match, show row even on error
          return hasMatchingMeasures ? row : null;
        }
      };

      const filtered: TransformedRow[] = [];
      for (const row of dateRangeFilteredRows) {
        try {
          const filteredRowResult = filterRow(row);
          if (filteredRowResult) {
            filtered.push(filteredRowResult);
          }
        } catch (e) {
          console.error('[TimeDimensionsGrid] Error processing row:', e);
          // If measures match, include row even on error
          if (hasMatchingMeasures) {
            filtered.push(row);
          }
        }
      }

      return filtered;
    } catch (error) {
      console.error('[TimeDimensionsGrid] Error in filteredRows search:', error);
      return dateRangeFilteredRows;
    }
  }, [dateRangeFilteredRows, searchTerm]);

  // Auto-expand rows that match search
  useEffect(() => {
    if (!searchTerm || searchTerm.trim() === '') {
      return;
    }

    try {
      const searchTerms = extractSearchTerms(searchTerm);
      if (searchTerms.length === 0) {
        return;
      }

      const { timeTerms, otherTerms } = separateSearchTerms(searchTerms);
      const allSearchTerms = [...timeTerms, ...otherTerms];
      if (allSearchTerms.length === 0) {
        return;
      }

      const rowsToExpand = new Set<string>();
      
      const checkRow = (row: TransformedRow) => {
        try {
          let matches = false;
          if (row.type === 'year' || row.type === 'quarter' || row.type === 'month') {
            // Check if time period matches
            if (timeTerms.length > 0 && row.timeKey) {
              const matchingKeys = getMatchingTimePeriodKeys(timeTerms);
              if (matchingKeys.has(row.timeKey)) {
                matches = true;
              }
            }
            // Also check row name
            if (!matches && otherTerms.length > 0) {
              matches = matchesText(row.name, otherTerms);
            }
          } else {
            // Dimension row
            const matchResult = transformedRowMatchesSearch(row, allSearchTerms);
            matches = matchResult.matches;
          }

          if (matches) {
            // Add this row and all its parents to expanded set
            let currentRow: TransformedRow | null = row;
            while (currentRow && currentRow.parentId) {
              rowsToExpand.add(currentRow.parentId);
              // Find parent in filteredRows
              const findParent = (rows: TransformedRow[]): TransformedRow | null => {
                for (const r of rows) {
                  if (r.id === currentRow!.parentId) return r;
                  if (r.children) {
                    const found = findParent(r.children);
                    if (found) return found;
                  }
                }
                return null;
              };
              currentRow = findParent(filteredRows);
            }
            rowsToExpand.add(row.id);
          }
          
          if (row.children) {
            row.children.forEach(child => checkRow(child));
          }
        } catch (e) {
          console.error('[TimeDimensionsGrid] Error in checkRow:', e);
        }
      };

      filteredRows.forEach(row => checkRow(row));

      setExpandedRows(prev => {
        const newSet = new Set(prev);
        rowsToExpand.forEach(id => newSet.add(id));
        return newSet;
      });
    } catch (error) {
      console.error('[TimeDimensionsGrid] Error in auto-expand useEffect:', error);
    }
  }, [searchTerm, filteredRows]);

  // Get measures list with search filtering
  const measures = useMemo(() => {
    const allMeasures = gridData.map(measure => ({
      id: measure.id,
      name: measure.name,
    }));

    if (!searchTerm || !searchTerm.trim()) {
      return allMeasures;
    }

    try {
      const searchTerms = extractSearchTerms(searchTerm);
      if (searchTerms.length === 0) {
        return allMeasures;
      }

      const { otherTerms } = separateSearchTerms(searchTerms);
      
      // Filter measures based on search terms (excluding time terms)
      if (otherTerms.length === 0) {
        // Only time terms, show all measures
        return allMeasures;
      }

      // Check if any measure names match
      const matchingMeasures = allMeasures.filter(measure => 
        matchesText(measure.name, otherTerms)
      );

      // Only filter measures if some measures match
      // If no measures match but rows match, show all measures
      if (matchingMeasures.length > 0) {
        return matchingMeasures;
      }

      // No measures match - show all measures (user is searching for rows, not measures)
      return allMeasures;
    } catch (error) {
      console.error('[TimeDimensionsGrid] Error filtering measures:', error);
      return allMeasures;
    }
  }, [gridData, searchTerm]);

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const expandAllRows = useCallback(() => {
    const allRowIds = new Set<string>();
    const collectRowIds = (rows: TransformedRow[]) => {
      rows.forEach(row => {
        allRowIds.add(row.id);
        if (row.children) {
          collectRowIds(row.children);
        }
      });
    };
    collectRowIds(filteredRows);
    setExpandedRows(allRowIds);
  }, [filteredRows]);

  const collapseAllRows = useCallback(() => {
    // Only keep top-level rows expanded
    const topLevelIds = new Set(filteredRows.map(row => row.id));
    setExpandedRows(topLevelIds);
  }, [filteredRows]);

  useEffect(() => {
    if (onExpandAllRows) {
      onExpandAllRows(expandAllRows);
    }
  }, [onExpandAllRows, expandAllRows]);

  useEffect(() => {
    if (onCollapseAllRows) {
      onCollapseAllRows(collapseAllRows);
    }
  }, [onCollapseAllRows, collapseAllRows]);

  // Restore focus when initialFocusedCell changes (e.g. switching back to this layout).
  // We must NOT steal focus from an active input — that would instantly cancel editing.
  useEffect(() => {
    if (initialFocusedCell && cellRefs.current) {
      const cellKey = `${initialFocusedCell.rowId}-${initialFocusedCell.measureId}`;
      const cellElement = cellRefs.current.get(cellKey);
      if (cellElement) {
        setTimeout(() => {
          // If an input/textarea is currently focused the user is in edit mode — don't interfere.
          const active = document.activeElement;
          if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
          cellElement.focus();
        }, 100);
      }
    }
  }, [initialFocusedCell]);

  const handleFocusChange = useCallback((focus: { rowId: string; measureId: string } | null) => {
    setFocusedCell(focus);
    if (onFocusedCellChange) {
      onFocusedCellChange(focus);
    }
  }, [onFocusedCellChange]);

  const formatValue = (value: number, isQuantity?: boolean, measureName?: string): string => {
    const formatted = value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0, // No decimals in cell values
    });
    
    // Add $ symbol for revenue/currency measures (but not for quantities or percentages)
    if (!isQuantity && measureName) {
      const nameLower = measureName.toLowerCase();
      const isRevenue = nameLower.includes('revenue') || 
                       nameLower.includes('spend') && !nameLower.includes('%') ||
                       nameLower === 'revenue';
      // Don't add $ for percentages, ROI multipliers, or quantities
      const isPercentage = nameLower.includes('%') || nameLower.includes('percent');
      const isROI = nameLower.includes('roi');
      
      if (isRevenue && !isPercentage && !isROI) {
        return `$${formatted}`;
      }
    }
    
    return formatted;
  };

  // Handle cell value change
  const handleCellChange = useCallback((
    timeKey: string,
    dimensionId: string,
    measureId: string,
    newValue: number
  ) => {
    try {
      console.log('[TimeDimensionsGrid] handleCellChange called:', { timeKey, dimensionId, measureId, newValue });
      
      if (!onDataChange) {
        console.log('[TimeDimensionsGrid] No onDataChange handler');
        return;
      }

      // Find the measure
      const measure = gridData.find(m => m.id === measureId);
      if (!measure) {
        console.log('[TimeDimensionsGrid] Measure not found:', measureId);
        return;
      }

      // Find the dimension row in the measure's hierarchy
      const findRowInMeasure = (rows: any[], id: string): any => {
        for (const row of rows) {
          if (row.id === id) return row;
          if (row.children) {
            const found = findRowInMeasure(row.children, id);
            if (found) return found;
          }
        }
        return null;
      };

      const dimensionRow = measure.children ? findRowInMeasure(measure.children, dimensionId) : null;
      if (!dimensionRow) {
        console.log('[TimeDimensionsGrid] Dimension row not found:', dimensionId);
        return;
      }

      // Store original value for edited cell
      const cellKey = `dimension-${dimensionId}-${timeKey}-${measureId}`;
      const originalValue = dimensionRow.values?.[timeKey as keyof typeof dimensionRow.values] || 0;
      
      // Track edit history - track EVERY edit, not just the first one
      if (onEditHistory) {
        const historyCellKey = `${dimensionId}-${measureId}`;
        console.log('[TimeDimensionsGrid] ✓ Calling onEditHistory:', { historyCellKey, dimensionId, measureId, timeKey, oldValue: originalValue, newValue });
        try {
          onEditHistory({
            cellKey: historyCellKey,
            rowId: dimensionId,
            timeKey,
            measureId,
            oldValue: originalValue,
            newValue,
          });
          console.log('[TimeDimensionsGrid] ✓ onEditHistory called successfully');
        } catch (error) {
          console.error('[TimeDimensionsGrid] ✗ Error calling onEditHistory:', error);
        }
      } else {
        console.log('[TimeDimensionsGrid] ✗ onEditHistory is not available');
      }
      
      setEditedCells(prev => {
        const newMap = new Map(prev);
        if (!newMap.has(cellKey)) {
          newMap.set(cellKey, originalValue);
        }
        return newMap;
      });

      // Collect all updates
      const allUpdates: Array<{ measureId: string; rowId: string; timeKey: string; newValue: number }> = [];
      allUpdates.push({ measureId, rowId: dimensionId, timeKey, newValue });

      // Propagate upward through dimension hierarchy
      const storeOriginalValueIfImpacted = (rowId: string, mId: string, tKey: string) => {
        const impactedCellKey = `dimension-${rowId}-${tKey}-${mId}`;
        const impactedRow = measure.children ? findRowInMeasure(measure.children, rowId) : null;
        if (impactedRow && impactedRow.values) {
          const impactedOriginalValue = impactedRow.values[tKey as keyof typeof impactedRow.values] || 0;
          setImpactedCells(prev => {
            const newMap = new Map(prev);
            if (!newMap.has(impactedCellKey)) {
              newMap.set(impactedCellKey, impactedOriginalValue);
            }
            return newMap;
          });
        }
      };

      // Update parent dimension rows
      let currentRow = dimensionRow;
      while (currentRow && currentRow.parentId && currentRow.parentId !== measure.id) {
        const parentRow = measure.children ? findRowInMeasure(measure.children, currentRow.parentId) : null;
        if (parentRow) {
          // Sum all children for this time period
          const childrenSum = (parentRow.children || []).reduce((sum: number, child: any) => {
            const childValue = child.values?.[timeKey as keyof typeof child.values] || 0;
            // Check if this child has an update
            const childUpdate = allUpdates.find(u => u.rowId === child.id && u.timeKey === timeKey);
            return sum + (childUpdate ? childUpdate.newValue : childValue);
          }, 0);
          
          storeOriginalValueIfImpacted(parentRow.id, measureId, timeKey);
          allUpdates.push({ measureId, rowId: parentRow.id, timeKey, newValue: childrenSum });
          currentRow = parentRow;
        } else {
          break;
        }
      }

      // Handle time aggregation (month -> quarter -> year)
      if (timeKey !== 'year' && timeKey !== 'q1' && timeKey !== 'q2' && timeKey !== 'q3' && timeKey !== 'q4') {
        // This is a month, update its quarter
        const quarterMap: { [key: string]: string } = {
          jan2026: 'q1', feb2026: 'q1', mar2026: 'q1',
          apr2026: 'q2', may2026: 'q2', jun2026: 'q2',
          jul2026: 'q3', aug2026: 'q3', sep2026: 'q3',
          oct2026: 'q4', nov2026: 'q4', dec2026: 'q4',
        };
        const quarterKey = quarterMap[timeKey];
        if (quarterKey) {
          // Sum all months in this quarter for this dimension
          const monthKeys = Object.keys(quarterMap).filter(k => quarterMap[k] === quarterKey);
          const quarterSum = monthKeys.reduce((sum, monthKey) => {
            const monthValue = dimensionRow.values?.[monthKey as keyof typeof dimensionRow.values] || 0;
            const monthUpdate = allUpdates.find(u => u.rowId === dimensionId && u.timeKey === monthKey);
            return sum + (monthUpdate ? monthUpdate.newValue : monthValue);
          }, 0);
          
          storeOriginalValueIfImpacted(dimensionId, measureId, quarterKey);
          allUpdates.push({ measureId, rowId: dimensionId, timeKey: quarterKey, newValue: quarterSum });
        }
      }

      // Update year value (sum of all quarters or months)
      const quarterKeys = ['q1', 'q2', 'q3', 'q4'];
      const yearSum = quarterKeys.reduce((sum, qKey) => {
        const quarterValue = dimensionRow.values?.[qKey as keyof typeof dimensionRow.values] || 0;
        const quarterUpdate = allUpdates.find(u => u.rowId === dimensionId && u.timeKey === qKey);
        return sum + (quarterUpdate ? quarterUpdate.newValue : quarterValue);
      }, 0);
      
      storeOriginalValueIfImpacted(dimensionId, measureId, 'year');
      allUpdates.push({ measureId, rowId: dimensionId, timeKey: 'year', newValue: yearSum });

      // Handle cross-measure dependencies (Final Forecast = average)
      if (measureId !== 'measure-final-forecast') {
        const finalForecastMeasure = gridData.find(m => m.id === 'measure-final-forecast');
        if (finalForecastMeasure) {
          const otherMeasures = gridData.filter(m => 
            m.id !== 'measure-final-forecast' && 
            (m.id === 'measure-baseline-forecast' || 
             m.id === 'measure-account-manager-adjusted' || 
             m.id === 'measure-sales-manager-adjusted' || 
             m.id === 'measure-regional-director-adjusted')
          );
          
          if (otherMeasures.length > 0) {
            const finalForecastRow = finalForecastMeasure.children ? findRowInMeasure(finalForecastMeasure.children, dimensionId) : null;
            if (finalForecastRow) {
              const averageValue = otherMeasures.reduce((sum, m) => {
                const mRow = m.children ? findRowInMeasure(m.children, dimensionId) : null;
                const mValue = mRow ? (mRow.values?.[timeKey as keyof typeof mRow.values] || 0) : 0;
                const mUpdate = allUpdates.find(u => u.measureId === m.id && u.rowId === dimensionId && u.timeKey === timeKey);
                return sum + (mUpdate ? mUpdate.newValue : mValue);
              }, 0) / otherMeasures.length;
              
              storeOriginalValueIfImpacted(dimensionId, 'measure-final-forecast', timeKey);
              allUpdates.push({ measureId: 'measure-final-forecast', rowId: dimensionId, timeKey, newValue: averageValue });
            }
          }
        }
      }

      // Apply all updates
      const updatedData = gridData.map(m => {
        const updatedMeasure = JSON.parse(JSON.stringify(m));
        const updatesForMeasure = allUpdates.filter(u => u.measureId === m.id);
        if (updatesForMeasure.length === 0) return updatedMeasure;
        
        const updateRowValue = (rows: any[]): void => {
          for (const row of rows) {
            const update = updatesForMeasure.find(u => u.rowId === row.id);
            if (update && row.values) {
              row.values[update.timeKey as keyof typeof row.values] = update.newValue;
            }
            if (row.children) {
              updateRowValue(row.children);
            }
          }
        };
        
        if (updatedMeasure.children) {
          updateRowValue(updatedMeasure.children);
        }
        
        return updatedMeasure;
      });

      setGridData(updatedData);
      onDataChange(updatedData);
    } catch (error) {
      console.error('[TimeDimensionsGrid] Error in handleCellChange:', error);
    }
  }, [gridData, onDataChange, editedCells, onEditHistory]);

  if (transformedRows.length === 0) {
    return (
      <div className="grid-container-wrapper">
        <div className="grid-container">
          <div className="grid-empty">No data available</div>
        </div>
      </div>
    );
  }

  // Check if search is active (filtering columns)
  const isFiltering = searchTerm && searchTerm.trim().length > 0;

  return (
      <div className="grid-container-wrapper">
      <div className="grid-container">
        <div className="grid-wrapper" ref={tableWrapperRef}>
        <table
          {...(isGrid264Ux
            ? { role: 'grid' as const, 'aria-label': 'Time, dimensions, and measures' }
            : {})}
          className={`grid-table dimensions-time-table time-dimensions-table ${isFiltering ? 'filtered' : ''}`}
        >
          <thead className="grid-header dimensions-time-layout">
            <tr>
              <th style={{ width: '300px', minWidth: '300px' }}>
                <div className="grid-header-title-container" style={{ justifyContent: 'space-between' }}>
                  <span>Time / Dimensions x Measures</span>
                  {onSettingsClick && (
                    <button 
                      className="grid-header-settings-button"
                      onClick={onSettingsClick}
                      title="Settings"
                      type="button"
                    >
                      <svg fill="currentColor" viewBox="0 0 24 24" width="14" height="14">
                        <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                      </svg>
                    </button>
                  )}
                </div>
              </th>
              {measures.map((measure) => {
                const searchTerms = searchTerm && searchTerm.trim() ? extractSearchTerms(searchTerm) : [];
                const { otherTerms } = searchTerms.length > 0 ? separateSearchTerms(searchTerms) : { otherTerms: [] };
                const isNewlyAdded = newlyAddedMeasureIds.includes(measure.id);
                return (
                  <th
                    key={measure.id}
                    className={isNewlyAdded ? 'newly-added-measure-column' : ''}
                    data-measure-id={measure.id}
                    style={{
                      minWidth: `${columnWidth}px`,
                      width: `${columnWidth}px`,
                      whiteSpace: 'normal',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {otherTerms.length > 0 ? (
                      <SearchHighlight text={measure.name} searchTerms={otherTerms} />
                    ) : (
                      measure.name
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="grid-body">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={measures.length + 1} className="grid-no-results">
                  {searchTerm && searchTerm.trim() ? `No results found for '${searchTerm}'` : 'No data available'}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <TimeDimensionsRowComponent
                  key={row.id}
                  row={row}
                  level={0}
                  isExpanded={expandedRows.has(row.id)}
                  expandedRows={expandedRows}
                  onToggleExpand={toggleExpand}
                  formatValue={formatValue}
                  measures={measures}
                  onCellChange={handleCellChange}
                  focusedCell={focusedCell}
                  onCellFocus={handleFocusChange}
                  cellRefs={cellRefs}
                  editedCells={editedCells}
                  impactedCells={impactedCells}
                  savedEditedCells={savedEditedCells}
                  columnWidth={columnWidth}
                  searchTerm={searchTerm}
                  newlyAddedMeasureIds={newlyAddedMeasureIds}
                  data={gridData}
                  selectedCells={selectedCells}
                  onCellSelect={onCellSelect}
                  onCellMouseDown={onCellMouseDown}
                  onCellMouseMove={onCellMouseMove}
                />
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};

export default TimeDimensionsGrid;

