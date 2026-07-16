import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { MeasureData } from '../types';
import DimensionsTimeRowComponent from './DimensionsTimeRow';
import { transformToDimensionsTimeLayout, TransformedRow } from '../utils/layoutTransform';
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

interface DimensionsTimeGridProps {
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
  initialFocusedCell?: { rowId: string; measureId: string } | null; // Initial focused cell when switching layouts
  onFocusedCellChange?: (focus: { rowId: string; measureId: string } | null) => void; // Callback when focused cell changes
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

const DimensionsTimeGrid: React.FC<DimensionsTimeGridProps> = ({
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
  selectedCells: _selectedCells,
  onCellSelect: _onCellSelect,
  onCellMouseDown: _onCellMouseDown,
  onCellMouseMove: _onCellMouseMove,
  newlyAddedMeasureIds = [],
  onScrollToMeasureReady
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
  const [savedEditedCells] = useState<Map<string, string>>(new Map()); // TODO: Implement save functionality
  const [gridData, setGridData] = useState<MeasureData[]>(data);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  // Debug: Log when onEditHistory prop changes
  useEffect(() => {
    console.log('[DimensionsTimeGrid] Component mounted/updated, onEditHistory prop:', typeof onEditHistory, !!onEditHistory);
    if (onEditHistory) {
      console.log('[DimensionsTimeGrid] Testing onEditHistory callback...');
      try {
        onEditHistory({
          cellKey: 'test-cell-key-dimensions',
          rowId: 'test-row-id-dimensions',
          timeKey: 'jan2026',
          measureId: 'test-measure',
          oldValue: 100,
          newValue: 200,
        });
        console.log('[DimensionsTimeGrid] ✓ Test callback succeeded');
      } catch (error) {
        console.error('[DimensionsTimeGrid] ✗ Test callback failed:', error);
      }
    } else {
      console.warn('[DimensionsTimeGrid] ⚠ onEditHistory is NOT available!');
    }
  }, [onEditHistory]);

  // Debug: Log impacted cells when they change
  useEffect(() => {
    console.log('[DimensionsTimeGrid] Impacted cells changed:', Array.from(impactedCells.keys()));
  }, [impactedCells]);

  // Update local data when prop changes (but only if it's a different reference)
  useEffect(() => {
    // Only update if the data reference actually changed (not just a re-render)
    if (data !== gridData) {
      console.log('[DimensionsTimeGrid] Data prop changed, updating gridData');
      setGridData(data);
    }
  }, [data, gridData]);

  // Transform data to Dimensions/Time x Measures layout
  const transformedRows = useMemo(() => {
    try {
      console.log('[DimensionsTimeGrid] Transforming data, gridData length:', gridData?.length);
      const transformed = transformToDimensionsTimeLayout(gridData);
      console.log('[DimensionsTimeGrid] Transformation result:', transformed?.length, 'rows');
      return transformed || [];
    } catch (error) {
      console.error('[DimensionsTimeGrid] Error transforming data:', error);
      console.error('[DimensionsTimeGrid] Error stack:', error instanceof Error ? error.stack : 'No stack');
      return [];
    }
  }, [gridData]);

  // Expand all rows by default
  useEffect(() => {
    const allRowIds = new Set<string>();
    const collectRowIds = (rows: TransformedRow[]) => {
      rows.forEach(row => {
        if (row.children && row.children.length > 0) {
          allRowIds.add(row.id);
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

  // Aggregate time hierarchies from multiple children into one parent time hierarchy
  const aggregateTimeHierarchies = useCallback((
    timeHierarchies: TransformedRow[]
  ): TransformedRow[] | null => {
    if (timeHierarchies.length === 0) return null;

    // Find the year row (should be first)
    const yearRow = timeHierarchies.find(row => row.type === 'year');
    if (!yearRow) return null;

    // Aggregate measure values from all year rows
    const aggregatedYearValues = new Map<string, number>();
    timeHierarchies
      .filter(row => row.type === 'year')
      .forEach(yearRow => {
        yearRow.measureValues.forEach((value, measureId) => {
          const current = aggregatedYearValues.get(measureId) || 0;
          aggregatedYearValues.set(measureId, current + value);
        });
      });

    // Create aggregated year row
    const aggregatedYear: TransformedRow = {
      ...yearRow,
      id: `${yearRow.parentId}-aggregated-year`,
      measureValues: aggregatedYearValues,
      children: [],
    };

    // Aggregate quarters
    const quarterMap = new Map<string, TransformedRow[]>();
    timeHierarchies.forEach(hierarchy => {
      if (hierarchy.type === 'year' && hierarchy.children) {
        hierarchy.children.forEach(quarter => {
          if (quarter.type === 'quarter') {
            const quarterKey = quarter.timeKey || 'unknown';
            if (!quarterMap.has(quarterKey)) {
              quarterMap.set(quarterKey, []);
            }
            quarterMap.get(quarterKey)!.push(quarter);
          }
        });
      }
    });

    const aggregatedQuarters: TransformedRow[] = [];
    quarterMap.forEach((quarters, quarterKey) => {
      // Aggregate measure values for this quarter
      const aggregatedQuarterValues = new Map<string, number>();
      quarters.forEach(quarter => {
        quarter.measureValues.forEach((value, measureId) => {
          const current = aggregatedQuarterValues.get(measureId) || 0;
          aggregatedQuarterValues.set(measureId, current + value);
        });
      });

      // Aggregate months for this quarter
      const monthMap = new Map<string, TransformedRow[]>();
      quarters.forEach(quarter => {
        if (quarter.children) {
          quarter.children.forEach(month => {
            if (month.type === 'month') {
              const monthKey = month.timeKey || 'unknown';
              if (!monthMap.has(monthKey)) {
                monthMap.set(monthKey, []);
              }
              monthMap.get(monthKey)!.push(month);
            }
          });
        }
      });

      const aggregatedMonths: TransformedRow[] = [];
      monthMap.forEach((months, monthKey) => {
        const aggregatedMonthValues = new Map<string, number>();
        months.forEach(month => {
          month.measureValues.forEach((value, measureId) => {
            const current = aggregatedMonthValues.get(measureId) || 0;
            aggregatedMonthValues.set(measureId, current + value);
          });
        });

        aggregatedMonths.push({
          ...months[0],
          id: `${aggregatedYear.id}-${quarterKey}-${monthKey}`,
          measureValues: aggregatedMonthValues,
          children: undefined,
        });
      });

      aggregatedQuarters.push({
        ...quarters[0],
        id: `${aggregatedYear.id}-${quarterKey}`,
        measureValues: aggregatedQuarterValues,
        children: aggregatedMonths,
      });
    });

    aggregatedYear.children = aggregatedQuarters;

    return [aggregatedYear];
  }, []);

  // Filter rows based on selected dimension levels
  // Time hierarchy always attaches to the deepest selected dimension level
  // If parent is selected but children are not, aggregate all children's time hierarchies into one
  const filterRowsByDimensionLevels = useCallback((
    rows: TransformedRow[],
    selectedLevels: Set<string>
  ): TransformedRow[] => {
    if (!selectedLevels || selectedLevels.size === 0) {
      return rows; // If no selection, show all
    }

    const filtered: TransformedRow[] = [];

    for (const row of rows) {
      // Skip time rows (year, quarter, month) - they'll be attached later
      if (row.type === 'year' || row.type === 'quarter' || row.type === 'month') {
        continue;
      }

      const isSelected = selectedLevels.has(row.type);
      
      if (isSelected) {
        // This level is selected, process its children
        const processedChildren = row.children ? filterRowsByDimensionLevels(row.children, selectedLevels) : undefined;
        
        // Check if we have dimension children (not time)
        const hasDimensionChildren = processedChildren?.some(
          child => child.type !== 'year' && child.type !== 'quarter' && child.type !== 'month'
        ) ?? false;

        // Find all time hierarchies from original row's descendants
        const findAllTimeHierarchies = (children: TransformedRow[]): TransformedRow[] => {
          const timeHierarchies: TransformedRow[] = [];
          for (const child of children) {
            if (child.type === 'year') {
              // Found a year row, collect the entire hierarchy
              timeHierarchies.push(child);
            } else if (child.children) {
              timeHierarchies.push(...findAllTimeHierarchies(child.children));
            }
          }
          return timeHierarchies;
        };

        const allTimeHierarchies = row.children ? findAllTimeHierarchies(row.children) : [];

        // If no dimension children, this is the deepest selected level
        if (!hasDimensionChildren) {
          // Aggregate all time hierarchies into one
          if (allTimeHierarchies.length > 0) {
            const aggregatedTimeHierarchy = aggregateTimeHierarchies(allTimeHierarchies);
            if (aggregatedTimeHierarchy) {
              filtered.push({
                ...row,
                children: aggregatedTimeHierarchy,
              });
            } else {
              filtered.push({
                ...row,
                children: processedChildren,
              });
            }
          } else {
            filtered.push({
              ...row,
              children: processedChildren,
            });
          }
        } else {
          // Has dimension children, show them (time hierarchies stay with their parents)
          filtered.push({
            ...row,
            children: processedChildren,
          });
        }
      } else {
        // This level is not selected, promote its children
        if (row.children) {
          const promoted = filterRowsByDimensionLevels(row.children, selectedLevels);
          filtered.push(...promoted);
        }
      }
    }

    return filtered;
  }, [aggregateTimeHierarchies]);

  // Apply dimension level filtering
  const dimensionFilteredRows = useMemo(() => {
    if (!selectedDimensionLevels || selectedDimensionLevels.size === 0) {
      return transformedRows;
    }
    return filterRowsByDimensionLevels(transformedRows, selectedDimensionLevels);
  }, [transformedRows, selectedDimensionLevels, filterRowsByDimensionLevels]);

  // Filter time rows based on selected time granularities
  const filterRowsByTimeGranularities = useCallback((
    rows: TransformedRow[],
    selectedGranularities: Set<string>
  ): TransformedRow[] => {
    if (!selectedGranularities || selectedGranularities.size === 0) {
      return rows; // If no selection, show all
    }

    const filtered: TransformedRow[] = [];

    for (const row of rows) {
      if (row.type === 'year') {
        // Year row - show only if 'year' is selected
        if (selectedGranularities.has('year')) {
          // Process children (quarters)
          const processedChildren = row.children ? filterRowsByTimeGranularities(row.children, selectedGranularities) : undefined;
          filtered.push({
            ...row,
            children: processedChildren,
          });
        } else {
          // Year not selected - promote its children (quarters) up
          if (row.children) {
            const promoted = filterRowsByTimeGranularities(row.children, selectedGranularities);
            filtered.push(...promoted);
          }
        }
      } else if (row.type === 'quarter') {
        // Quarter row - show only if 'quarter' is selected
        if (selectedGranularities.has('quarter')) {
          // Process children (months)
          const processedChildren = row.children ? filterRowsByTimeGranularities(row.children, selectedGranularities) : undefined;
          filtered.push({
            ...row,
            children: processedChildren,
          });
        } else {
          // Quarter not selected - promote its children (months) up
          if (row.children) {
            const promoted = filterRowsByTimeGranularities(row.children, selectedGranularities);
            filtered.push(...promoted);
          }
        }
      } else if (row.type === 'month') {
        // Month row - show only if 'month' is selected
        if (selectedGranularities.has('month')) {
          filtered.push(row);
        }
        // If month not selected, don't add it (skip it)
      } else {
        // Dimension row (account, category, product) - process children recursively
        const processedChildren = row.children ? filterRowsByTimeGranularities(row.children, selectedGranularities) : undefined;
        filtered.push({
          ...row,
          children: processedChildren,
        });
      }
    }

    return filtered;
  }, []);

  // Apply time granularity filtering
  const timeGranularityFilteredRows = useMemo(() => {
    if (!selectedTimeGranularities || selectedTimeGranularities.size === 0) {
      return dimensionFilteredRows;
    }
    return filterRowsByTimeGranularities(dimensionFilteredRows, selectedTimeGranularities);
  }, [dimensionFilteredRows, selectedTimeGranularities, filterRowsByTimeGranularities]);

  // Helper function to check if a month key falls within the date range
  const isMonthInRange = useCallback((monthKey: string, start: string, end: string): boolean => {
    if (!start && !end) return true;
    
    // Map month keys to month numbers (1-12)
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
        // Check if this month is in range
        if (!row.timeKey || !isMonthInRange(row.timeKey, start, end)) {
          return null;
        }
        return row;
      } else if (row.type === 'quarter') {
        // Check if this quarter has any months in range
        if (!row.timeKey || !isQuarterInRange(row.timeKey, start, end)) {
          return null;
        }
        // Filter children (months)
        const filteredChildren = row.children
          ? row.children.map(child => filterRow(child)).filter((c): c is TransformedRow => c !== null)
          : undefined;
        if (filteredChildren && filteredChildren.length === 0) {
          return null;
        }
        return { ...row, children: filteredChildren };
      } else if (row.type === 'year') {
        // Filter children (quarters)
        const filteredChildren = row.children
          ? row.children.map(child => filterRow(child)).filter((c): c is TransformedRow => c !== null)
          : undefined;
        if (filteredChildren && filteredChildren.length === 0) {
          return null;
        }
        return { ...row, children: filteredChildren };
      } else {
        // Dimension row - process children recursively
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
      
      // Get matching time period keys if there are time terms
      const matchingTimeKeys = timeTerms.length > 0 ? getMatchingTimePeriodKeys(timeTerms) : new Set<string>();
      const hasTimeTerms = timeTerms.length > 0;

      // Check if any measure names match the search terms
      const allMeasures = gridData.map(measure => ({
        id: measure.id,
        name: measure.name,
      }));
      const matchingMeasures = allMeasures.filter(measure => 
        matchesText(measure.name, otherTerms)
      );
      const hasMatchingMeasures = matchingMeasures.length > 0;

      // If measure names match, show all rows (since all rows have those measure columns)
      // Still filter rows based on row names, cell values, and time periods, but don't exclude rows if only measures match
      const filterRow = (row: TransformedRow): TransformedRow | null => {
        try {
          // Check if time period matches (for time rows like month, quarter, year)
          let timeMatches = false;
          if (hasTimeTerms && row.timeKey) {
            timeMatches = matchingTimeKeys.has(row.timeKey);
          }

          // Check if row name or cell values match (for dimension rows)
          // For dimension rows, only check against non-time terms
          const isDimensionRow = row.type === 'account' || row.type === 'category' || row.type === 'product';
          let rowMatches = timeMatches;
          if (isDimensionRow) {
            // If we're searching for ONLY time periods, dimension rows should not match
            if (hasTimeTerms && otherTerms.length === 0) {
              rowMatches = false; // Only time terms - dimension rows don't match
            } else {
              // Check against non-time terms
              const matchResult = transformedRowMatchesSearch(row, otherTerms);
              rowMatches = matchResult.matches;
            }
          } else {
            // For time rows, also check row name against non-time terms
            if (!rowMatches && otherTerms.length > 0) {
              const matchResult = transformedRowMatchesSearch(row, otherTerms);
              rowMatches = matchResult.matches;
            }
          }
          
          // Process children
          let filteredChildren: TransformedRow[] = [];
          if (row.children && row.children.length > 0) {
            // Always filter children recursively to ensure only matching time periods are shown
            // Even if parent matches, we need to filter children based on time terms
            for (const child of row.children) {
              try {
                const filteredChild = filterRow(child);
                if (filteredChild) {
                  filteredChildren.push(filteredChild);
                }
              } catch (e) {
                console.error('[DimensionsTimeGrid] Error filtering child:', e);
              }
            }
          }

          // Show row if:
          // 1. Measure names match (all rows should be shown)
          // 2. Row name or cell values match
          // 3. Has matching children
          if (hasMatchingMeasures || rowMatches || filteredChildren.length > 0) {
            return {
              ...row,
              children: filteredChildren.length > 0 ? filteredChildren : row.children,
            };
          }

          return null;
        } catch (e) {
          console.error('[DimensionsTimeGrid] Error in filterRow:', e);
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
          console.error('[DimensionsTimeGrid] Error processing row:', e);
          // If measures match, include row even on error
          if (hasMatchingMeasures) {
            filtered.push(row);
          }
        }
      }

      return filtered;
    } catch (error) {
      console.error('[DimensionsTimeGrid] Error in filteredRows search:', error);
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

      const { otherTerms } = separateSearchTerms(searchTerms);
      if (otherTerms.length === 0) {
        return;
      }

      const rowsToExpand = new Set<string>();
      
      const checkRow = (row: TransformedRow) => {
        try {
          const matchResult = transformedRowMatchesSearch(row, otherTerms);
          if (matchResult.matches) {
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
          console.error('[DimensionsTimeGrid] Error in checkRow:', e);
        }
      };

      filteredRows.forEach(row => checkRow(row));

      setExpandedRows(prev => {
        const newSet = new Set(prev);
        rowsToExpand.forEach(id => newSet.add(id));
        return newSet;
      });
    } catch (error) {
      console.error('[DimensionsTimeGrid] Error in auto-expand useEffect:', error);
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
      console.error('[DimensionsTimeGrid] Error filtering measures:', error);
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

  // Expand all rows
  const handleExpandAll = useCallback(() => {
    const allExpandableIds = new Set<string>();
    const collectExpandableIds = (rows: TransformedRow[]) => {
      for (const row of rows) {
        if (row.children && row.children.length > 0) {
          allExpandableIds.add(row.id);
          collectExpandableIds(row.children);
        }
      }
    };
    collectExpandableIds(transformedRows);
    setExpandedRows(allExpandableIds);
  }, [transformedRows]);

  // Collapse all rows
  const handleCollapseAll = useCallback(() => {
    setExpandedRows(new Set());
  }, []);

  useEffect(() => {
    if (onExpandAllRows) {
      onExpandAllRows(handleExpandAll);
    }
    if (onCollapseAllRows) {
      onCollapseAllRows(handleCollapseAll);
    }
  }, [handleExpandAll, handleCollapseAll, onExpandAllRows, onCollapseAllRows]);

  // Restore focus when initialFocusedCell changes (layout switch)
  useEffect(() => {
    if (initialFocusedCell) {
      const cellKey = `${initialFocusedCell.rowId}-${initialFocusedCell.measureId}`;
      setTimeout(() => {
        const cellElement = cellRefs.current.get(cellKey);
        if (cellElement) {
          cellElement.focus();
          setFocusedCell(initialFocusedCell);
        }
      }, 100);
    }
  }, [initialFocusedCell]);

  // Notify parent when focus changes
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
    dimensionId: string,
    timeKey: string | null,
    measureId: string,
    newValue: number
  ) => {
    try {
      console.log('[DimensionsTimeGrid] handleCellChange called:', { dimensionId, timeKey, measureId, newValue });
      console.log('[DimensionsTimeGrid] gridData length:', gridData.length, 'measureIds:', gridData.map(m => m.id));
      
      if (!onDataChange) {
        console.log('[DimensionsTimeGrid] No onDataChange handler');
        return;
      }

      // Find the original dimension row and measure
      const measure = gridData.find(m => m.id === measureId);
      if (!measure) {
        console.log('[DimensionsTimeGrid] Measure not found:', measureId, 'Available measures:', gridData.map(m => m.id));
        return;
      }
      console.log('[DimensionsTimeGrid] Measure found:', measureId);

    // Find the transformed row to get its timeKey and dimensionPath
    // Note: We need to search in filteredRows, not transformedRows, because filtering may have changed the structure
    const findTransformedRow = (rows: TransformedRow[], id: string): TransformedRow | null => {
      for (const row of rows) {
        if (row.id === id) return row;
        if (row.children) {
          const found = findTransformedRow(row.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    // Try to find in filteredRows first (the actual rendered rows)
    let transformedRow = findTransformedRow(filteredRows, dimensionId);
    
    // If not found, try in transformedRows (before filtering)
    if (!transformedRow) {
      transformedRow = findTransformedRow(transformedRows, dimensionId);
    }
    
    // If still not found, try to match by extracting the base ID (remove measure references)
    if (!transformedRow) {
      // The dimensionId might have measure info embedded, try to extract the base dimension ID
      // e.g., "dimension-product-trn-a-measure-sa-qty-aggregated-year-q1-jan2026" 
      // should match "dimension-product-trn-a-aggregated-year-q1-jan2026"
      const baseIdMatch = dimensionId.match(/^(dimension-[^-]+(?:-[^-]+)*)-(?:measure-[^-]+-)?(aggregated-year.*)$/);
      if (baseIdMatch) {
        const baseId = `${baseIdMatch[1]}-${baseIdMatch[2]}`;
        console.log('[DimensionsTimeGrid] Trying to find row with base ID:', baseId);
        transformedRow = findTransformedRow(filteredRows, baseId) || findTransformedRow(transformedRows, baseId);
      }
    }
    
    if (!transformedRow) {
      console.log('[DimensionsTimeGrid] Transformed row not found:', dimensionId);
      console.log('[DimensionsTimeGrid] Available row IDs (first 10):', 
        (() => {
          const ids: string[] = [];
          const collectIds = (rows: TransformedRow[]) => {
            for (const row of rows) {
              ids.push(row.id);
              if (ids.length >= 10) return;
              if (row.children) collectIds(row.children);
            }
          };
          collectIds(filteredRows);
          return ids;
        })()
      );
      return;
    }
    console.log('[DimensionsTimeGrid] Transformed row found:', { id: transformedRow.id, type: transformedRow.type, dimensionPath: transformedRow.dimensionPath, timeKey: transformedRow.timeKey });

    // Extract original row ID and time key
    let originalRowId: string;
    let actualTimeKey: string | null = timeKey || transformedRow.timeKey || null;
    
    if (transformedRow.type === 'year' || transformedRow.type === 'quarter' || transformedRow.type === 'month') {
      // This is a time row - find the product row it belongs to using dimensionPath
      if (!transformedRow.dimensionPath || transformedRow.dimensionPath.length === 0) {
        console.log('[DimensionsTimeGrid] No dimension path for time row:', transformedRow.id);
        return; // No dimension path
      }
      console.log('[DimensionsTimeGrid] Finding product row by path:', transformedRow.dimensionPath);
      
      // Find the product row in the measure by matching the dimension path
      const findRowByPath = (rows: any[], path: string[]): any => {
        if (path.length === 0) return null;
        
        // Find account
        const account = rows.find(r => r.type === 'account' && r.name === path[0]);
        if (!account) return null;
        
        if (path.length === 1) return account;
        
        // Find category
        if (!account.children) return null;
        const category = account.children.find((r: any) => r.type === 'category' && r.name === path[1]);
        if (!category) return null;
        
        if (path.length === 2) return category;
        
        // Find product
        if (!category.children) return null;
        const product = category.children.find((r: any) => r.type === 'product' && r.name === path[2]);
        return product || null;
      };
      
      const productRow = measure.children ? findRowByPath(measure.children, transformedRow.dimensionPath) : null;
      if (!productRow) {
        console.log('[DimensionsTimeGrid] Could not find product row by path:', transformedRow.dimensionPath, 'measure children:', measure.children?.length);
        return; // Could not find product row
      }
      console.log('[DimensionsTimeGrid] Product row found:', { id: productRow.id, name: productRow.name });
      originalRowId = productRow.id;
      // Use the timeKey from the transformed row
      actualTimeKey = transformedRow.timeKey || timeKey || 'year';
    } else {
      // This is a dimension row (account, category, product)
      if (dimensionId.startsWith('dimension-')) {
        originalRowId = dimensionId.replace('dimension-', '');
      } else {
        originalRowId = dimensionId;
      }
      // For dimension rows, use year as default time key
      actualTimeKey = actualTimeKey || 'year';
    }
    
    // Find the row in the measure's hierarchy
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

    const targetRow = measure.children ? findRowInMeasure(measure.children, originalRowId) : null;
    if (!targetRow) {
      console.log('[DimensionsTimeGrid] Target row not found:', { originalRowId, measureId, measureChildren: measure.children?.length });
      return;
    }
    console.log('[DimensionsTimeGrid] Found target row:', { rowId: targetRow.id, rowName: targetRow.name, timeKeyToUse: actualTimeKey });

    // Get the time key to use (year, q1-q4, or month keys)
    const timeKeyToUse = actualTimeKey || 'year';
    const cellKey = `${dimensionId}-${measureId}`;
    const originalValue = targetRow.values[timeKeyToUse as keyof typeof targetRow.values] || 0;
    const delta = newValue - originalValue;

    if (delta === 0) {
      // If delta is 0, remove from edited cells
      setEditedCells(prev => {
        const newMap = new Map(prev);
        newMap.delete(cellKey);
        return newMap;
      });
      return;
    }

    // Track edit history - track EVERY edit, not just the first one
    if (onEditHistory) {
      const historyCellKey = `${dimensionId}-${measureId}`;
      console.log('[DimensionsTimeGrid] ✓ Calling onEditHistory:', { historyCellKey, dimensionId, measureId, timeKeyToUse, oldValue: originalValue, newValue });
      try {
        onEditHistory({
          cellKey: historyCellKey,
          rowId: dimensionId,
          timeKey: timeKeyToUse,
          measureId,
          oldValue: originalValue,
          newValue,
        });
        console.log('[DimensionsTimeGrid] ✓ onEditHistory called successfully');
      } catch (error) {
        console.error('[DimensionsTimeGrid] ✗ Error calling onEditHistory:', error);
      }
    } else {
      console.log('[DimensionsTimeGrid] ✗ onEditHistory is not available');
    }
    
    setEditedCells(prev => {
      const newMap = new Map(prev);
      if (!newMap.has(cellKey)) {
        newMap.set(cellKey, originalValue);
      }
      return newMap;
    });

    // Remove from impactedCells if it was previously impacted (edited cells take precedence)
    setImpactedCells(prev => {
      const newMap = new Map(prev);
      if (newMap.has(cellKey)) {
        newMap.delete(cellKey);
      }
      return newMap;
    });

    // Store original values for impacted cells
    // Map: transformedRowId-measureId -> originalValue
    const originalValuesForImpacted = new Map<string, number>();
    
    // Helper to find transformed row ID from original row ID and time key
    const findTransformedRowIdForOriginal = (originalRowId: string, timeKey: string | null, targetMeasureId: string): string | null => {
      // Find the dimension path for this row in the target measure
      const targetMeasure = gridData.find(m => m.id === targetMeasureId);
      if (!targetMeasure) return null;
      
      const findRowPath = (rows: any[], id: string, path: string[] = []): string[] | null => {
        for (const row of rows) {
          if (row.id === id) {
            return [...path, row.name];
          }
          if (row.children) {
            const found = findRowPath(row.children, id, [...path, row.name]);
            if (found) return found;
          }
        }
        return null;
      };
      
      const path = targetMeasure.children ? findRowPath(targetMeasure.children, originalRowId) : null;
      if (!path) {
        console.log('[DimensionsTimeGrid] Could not find path for row:', originalRowId, 'in measure:', targetMeasureId);
        return null;
      }
      
      // Find the transformed row with this path and time key
      const findTransformedRowByPath = (rows: TransformedRow[], targetPath: string[], targetTimeKey: string | null): TransformedRow | null => {
        for (const row of rows) {
          // Check if this is a time row with matching path and time key
          if ((row.type === 'year' || row.type === 'quarter' || row.type === 'month') &&
              row.dimensionPath &&
              row.dimensionPath.length === targetPath.length &&
              row.dimensionPath.every((p, i) => p === targetPath[i])) {
            if (targetTimeKey === null && row.type === 'year') return row;
            if (row.timeKey === targetTimeKey) return row;
          }
          // Also check dimension rows (for parent rows)
          if ((row.type === 'account' || row.type === 'category' || row.type === 'product') &&
              row.dimensionPath &&
              row.dimensionPath.length === targetPath.length &&
              row.dimensionPath.every((p, i) => p === targetPath[i]) &&
              targetTimeKey === null) {
            return row; // Dimension rows use year as default
          }
          if (row.children) {
            const found = findTransformedRowByPath(row.children, targetPath, targetTimeKey);
            if (found) return found;
          }
        }
        return null;
      };
      
      // Try filteredRows first (what's actually rendered), then transformedRows
      let transformedRow = findTransformedRowByPath(filteredRows, path, timeKey);
      if (!transformedRow) {
        transformedRow = findTransformedRowByPath(transformedRows, path, timeKey);
      }
      
      if (transformedRow) {
        console.log('[DimensionsTimeGrid] Found transformed row ID:', transformedRow.id, 'for original:', originalRowId, 'timeKey:', timeKey, 'path:', path);
        return transformedRow.id;
      } else {
        console.log('[DimensionsTimeGrid] Could not find transformed row for:', { originalRowId, timeKey, path });
        // Try to find any row with matching path (might be aggregated)
        const findAnyRowByPath = (rows: TransformedRow[], targetPath: string[]): TransformedRow | null => {
          for (const row of rows) {
            if (row.dimensionPath &&
                row.dimensionPath.length === targetPath.length &&
                row.dimensionPath.every((p, i) => p === targetPath[i])) {
              // Check if this is a time row or dimension row that matches
              if (row.type === 'year' || row.type === 'quarter' || row.type === 'month' || 
                  row.type === 'account' || row.type === 'category' || row.type === 'product') {
                return row;
              }
            }
            if (row.children) {
              const found = findAnyRowByPath(row.children, targetPath);
              if (found) return found;
            }
          }
          return null;
        };
        
        // Try to find aggregated row
        const anyRow = findAnyRowByPath(filteredRows, path) || findAnyRowByPath(transformedRows, path);
        if (anyRow) {
          console.log('[DimensionsTimeGrid] Found alternative row ID (possibly aggregated):', anyRow.id);
          return anyRow.id;
        }
      }
      
      return null;
    };
    
    const storeOriginalValueIfImpacted = (updateRowId: string, updateMeasureId: string, updateTimeKey: string | null) => {
      // Skip the directly edited cell
      if (updateRowId === originalRowId && updateMeasureId === measureId && updateTimeKey === actualTimeKey) {
        return;
      }
      
      // Find the transformed row ID for this impacted cell - use filteredRows to get the actual rendered row ID
      const transformedRowId = findTransformedRowIdForOriginal(updateRowId, updateTimeKey, updateMeasureId);
      if (!transformedRowId) {
        console.log('[DimensionsTimeGrid] Could not find transformed row ID for impacted cell:', { updateRowId, updateTimeKey, updateMeasureId });
        // Try to find by searching all filtered rows for matching dimension path and time key
        const impactedMeasure = gridData.find(m => m.id === updateMeasureId);
        if (impactedMeasure) {
          const findRowPath = (rows: any[], id: string, path: string[] = []): string[] | null => {
            for (const row of rows) {
              if (row.id === id) return [...path, row.name];
              if (row.children) {
                const found = findRowPath(row.children, id, [...path, row.name]);
                if (found) return found;
              }
            }
            return null;
          };
          const path = impactedMeasure.children ? findRowPath(impactedMeasure.children, updateRowId) : null;
          if (path) {
            // Search filteredRows for any row matching this path and time key
            const findMatchingRow = (rows: TransformedRow[]): TransformedRow | null => {
              for (const row of rows) {
                if (row.dimensionPath &&
                    row.dimensionPath.length === path.length &&
                    row.dimensionPath.every((p, i) => p === path[i])) {
                  if (updateTimeKey === null && (row.type === 'year' || row.type === 'account' || row.type === 'category' || row.type === 'product')) {
                    return row;
                  }
                  if (row.timeKey === updateTimeKey) {
                    return row;
                  }
                }
                if (row.children) {
                  const found = findMatchingRow(row.children);
                  if (found) return found;
                }
              }
              return null;
            };
            const matchingRow = findMatchingRow(filteredRows);
            if (matchingRow) {
              const impactedCellKey = `${matchingRow.id}-${updateMeasureId}`;
              const impactedRow = impactedMeasure.children ? findRowInMeasure(impactedMeasure.children, updateRowId) : null;
              if (impactedRow) {
                const impactedTimeKey = updateTimeKey || 'year';
                const originalValue = impactedRow.values[impactedTimeKey as keyof typeof impactedRow.values] || 0;
                originalValuesForImpacted.set(impactedCellKey, originalValue);
                console.log('[DimensionsTimeGrid] Storing impacted cell (fallback):', { impactedCellKey, originalValue, rowId: matchingRow.id, updateRowId, updateTimeKey });
                return;
              }
            }
          }
        }
        return;
      }
      
      const impactedCellKey = `${transformedRowId}-${updateMeasureId}`;
      if (!originalValuesForImpacted.has(impactedCellKey)) {
        const impactedMeasure = gridData.find(m => m.id === updateMeasureId);
        if (impactedMeasure) {
          const impactedRow = impactedMeasure.children ? findRowInMeasure(impactedMeasure.children, updateRowId) : null;
          if (impactedRow) {
            const impactedTimeKey = updateTimeKey || 'year';
            const originalValue = impactedRow.values[impactedTimeKey as keyof typeof impactedRow.values] || 0;
            originalValuesForImpacted.set(impactedCellKey, originalValue);
            console.log('[DimensionsTimeGrid] Storing impacted cell:', { impactedCellKey, originalValue, transformedRowId, updateRowId, updateTimeKey });
          } else {
            console.log('[DimensionsTimeGrid] Could not find impacted row in measure:', { updateRowId, updateMeasureId });
          }
        }
      }
    };

    // Collect all updates
    const allUpdates: { measureId: string; rowId: string; timeKey: string; newValue: number }[] = [];

    // 1. Update the edited cell
    allUpdates.push({ measureId, rowId: originalRowId, timeKey: timeKeyToUse, newValue });

    // 2. Handle time aggregation (month → quarter → year, quarter → year, year → quarters → months)
    if (timeKeyToUse.startsWith('jan') || timeKeyToUse.startsWith('feb') || timeKeyToUse.startsWith('mar') || 
        timeKeyToUse.startsWith('apr') || timeKeyToUse.startsWith('may') || timeKeyToUse.startsWith('jun') ||
        timeKeyToUse.startsWith('jul') || timeKeyToUse.startsWith('aug') || timeKeyToUse.startsWith('sep') ||
        timeKeyToUse.startsWith('oct') || timeKeyToUse.startsWith('nov') || timeKeyToUse.startsWith('dec')) {
      // Month edited → recalculate quarter → recalculate year
      const quarterMap: { [key: string]: string[] } = {
        'q1': ['jan2026', 'feb2026', 'mar2026'],
        'q2': ['apr2026', 'may2026', 'jun2026'],
        'q3': ['jul2026', 'aug2026', 'sep2026'],
        'q4': ['oct2026', 'nov2026', 'dec2026']
      };
      
      let quarterKey: string | null = null;
      for (const [q, months] of Object.entries(quarterMap)) {
        if (months.includes(timeKeyToUse)) {
          quarterKey = q;
          break;
        }
      }
      
      if (quarterKey) {
        // Recalculate quarter value
        const quarterMonths = quarterMap[quarterKey];
        const quarterValue = quarterMonths.reduce((sum, month) => {
          const monthValue = month === timeKeyToUse ? newValue : (targetRow.values[month as keyof typeof targetRow.values] || 0);
          return sum + monthValue;
        }, 0);
        storeOriginalValueIfImpacted(originalRowId, measureId, quarterKey);
        allUpdates.push({ measureId, rowId: originalRowId, timeKey: quarterKey, newValue: quarterValue });
        
        // Recalculate year value
        const yearValue = ['q1', 'q2', 'q3', 'q4'].reduce((sum, q) => {
          const qValue = q === quarterKey ? quarterValue : (targetRow.values[q as keyof typeof targetRow.values] || 0);
          return sum + qValue;
        }, 0);
        storeOriginalValueIfImpacted(originalRowId, measureId, 'year');
        allUpdates.push({ measureId, rowId: originalRowId, timeKey: 'year', newValue: yearValue });
      }
    } else if (timeKeyToUse === 'q1' || timeKeyToUse === 'q2' || timeKeyToUse === 'q3' || timeKeyToUse === 'q4') {
      // Quarter edited → distribute to months → recalculate year
      const quarterMap: { [key: string]: string[] } = {
        'q1': ['jan2026', 'feb2026', 'mar2026'],
        'q2': ['apr2026', 'may2026', 'jun2026'],
        'q3': ['jul2026', 'aug2026', 'sep2026'],
        'q4': ['oct2026', 'nov2026', 'dec2026']
      };
      
      const months = quarterMap[timeKeyToUse];
      const oldQuarterValue = months.reduce((sum, month) => sum + (targetRow.values[month as keyof typeof targetRow.values] || 0), 0);
      const quarterDelta = newValue - oldQuarterValue;
      const monthDelta = quarterDelta / months.length;
      
      // Distribute to months
      months.forEach(month => {
        const oldMonthValue = targetRow.values[month as keyof typeof targetRow.values] || 0;
        const newMonthValue = oldMonthValue + monthDelta;
        storeOriginalValueIfImpacted(originalRowId, measureId, month);
        allUpdates.push({ measureId, rowId: originalRowId, timeKey: month, newValue: newMonthValue });
      });
      
      // Recalculate year
      const yearValue = ['q1', 'q2', 'q3', 'q4'].reduce((sum, q) => {
        const qValue = q === timeKeyToUse ? newValue : (targetRow.values[q as keyof typeof targetRow.values] || 0);
        return sum + qValue;
      }, 0);
      storeOriginalValueIfImpacted(originalRowId, measureId, 'year');
      allUpdates.push({ measureId, rowId: originalRowId, timeKey: 'year', newValue: yearValue });
    } else if (timeKeyToUse === 'year') {
      // Year edited → distribute to quarters → distribute to months
      const oldYearValue = targetRow.values.year || 0;
      const yearDelta = newValue - oldYearValue;
      const quarterDelta = yearDelta / 4;
      
      ['q1', 'q2', 'q3', 'q4'].forEach(quarter => {
        const oldQuarterValue = targetRow.values[quarter as keyof typeof targetRow.values] || 0;
        const newQuarterValue = oldQuarterValue + quarterDelta;
        storeOriginalValueIfImpacted(originalRowId, measureId, quarter);
        allUpdates.push({ measureId, rowId: originalRowId, timeKey: quarter, newValue: newQuarterValue });
        
        // Distribute quarter to months
        const quarterMap: { [key: string]: string[] } = {
          'q1': ['jan2026', 'feb2026', 'mar2026'],
          'q2': ['apr2026', 'may2026', 'jun2026'],
          'q3': ['jul2026', 'aug2026', 'sep2026'],
          'q4': ['oct2026', 'nov2026', 'dec2026']
        };
        const months = quarterMap[quarter];
        const monthDelta = quarterDelta / months.length;
        months.forEach(month => {
          const oldMonthValue = targetRow.values[month as keyof typeof targetRow.values] || 0;
          const newMonthValue = oldMonthValue + monthDelta;
          storeOriginalValueIfImpacted(originalRowId, measureId, month);
          allUpdates.push({ measureId, rowId: originalRowId, timeKey: month, newValue: newMonthValue });
        });
      });
    }

    // 3. Update product row's year value (if month/quarter was edited)
    // The product dimension row displays the year value, so we need to update it
    if (timeKeyToUse !== 'year') {
      // Recalculate product's year value from all quarters
      const productYearValue = ['q1', 'q2', 'q3', 'q4'].reduce((sum, q) => {
        const qUpdate = allUpdates.find(u => u.rowId === originalRowId && u.timeKey === q);
        const qValue = qUpdate ? qUpdate.newValue : (targetRow.values[q as keyof typeof targetRow.values] || 0);
        return sum + qValue;
      }, 0);
      
      // Check if year value needs updating
      const currentYearValue = targetRow.values.year || 0;
      if (Math.abs(productYearValue - currentYearValue) > 0.01) {
        storeOriginalValueIfImpacted(originalRowId, measureId, 'year');
        allUpdates.push({ measureId, rowId: originalRowId, timeKey: 'year', newValue: productYearValue });
        console.log('[DimensionsTimeGrid] Updating product year value:', { originalRowId, currentYearValue, productYearValue });
      }
    }

    // 4. Propagate upward (product → category → account)
    const findParentRow = (rowId: string, measureData: any): any => {
      const findInRows = (rows: any[]): any => {
        for (const row of rows) {
          if (row.id === rowId) return row;
          if (row.children) {
            const found = findInRows(row.children);
            if (found) return found;
          }
        }
        return null;
      };
      return measureData.children ? findInRows(measureData.children) : null;
    };

    const currentRow = findParentRow(originalRowId, measure);
    if (currentRow && currentRow.parentId) {
      let parentId = currentRow.parentId;
      while (parentId && parentId !== measure.id) {
        const parentRow = findParentRow(parentId, measure);
        if (parentRow) {
          // Sum all children for this time period
          // Use year value for dimension rows (product, category, account)
          const childrenSum = (parentRow.children || []).reduce((sum: number, child: any) => {
            // Get the child's year value (either from updates or current value)
            const childYearUpdate = allUpdates.find(u => u.rowId === child.id && u.timeKey === 'year');
            const childValue = childYearUpdate ? childYearUpdate.newValue : (child.values.year || 0);
            return sum + childValue;
          }, 0);
          
          storeOriginalValueIfImpacted(parentId, measureId, 'year');
          allUpdates.push({ measureId, rowId: parentId, timeKey: 'year', newValue: childrenSum });
          console.log('[DimensionsTimeGrid] Updating parent row:', { parentId, parentName: parentRow.name, childrenSum });
          parentId = parentRow.parentId;
        } else {
          break;
        }
      }
    }

    // 5. Handle cross-measure dependencies (Final Forecast = average of others)
    // This only applies to Adjustment Measures, not Revenue and Quantity Measures
    if (measureId === 'measure-final-forecast') {
      // This is Final Forecast, but we're editing it directly, so skip cross-measure update
    } else {
      // Check if Final Forecast exists and update it
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
          const finalForecastRow = finalForecastMeasure.children ? findRowInMeasure(finalForecastMeasure.children, originalRowId) : null;
          if (finalForecastRow) {
            // Calculate average using the updated values from allUpdates
            const averageValue = otherMeasures.reduce((sum, m) => {
              // Check if this measure has an update for this row and time key
              const mUpdate = allUpdates.find(u => u.measureId === m.id && u.rowId === originalRowId && u.timeKey === timeKeyToUse);
              let mValue: number;
              if (mUpdate) {
                mValue = mUpdate.newValue;
              } else {
                const mRow = m.children ? findRowInMeasure(m.children, originalRowId) : null;
                mValue = mRow ? (mRow.values[timeKeyToUse as keyof typeof mRow.values] || 0) : 0;
              }
              return sum + mValue;
            }, 0) / otherMeasures.length;
            
            // Also update year value for Final Forecast
            const finalForecastYearValue = otherMeasures.reduce((sum, m) => {
              const mYearUpdate = allUpdates.find(u => u.measureId === m.id && u.rowId === originalRowId && u.timeKey === 'year');
              let mYearValue: number;
              if (mYearUpdate) {
                mYearValue = mYearUpdate.newValue;
              } else {
                const mRow = m.children ? findRowInMeasure(m.children, originalRowId) : null;
                mYearValue = mRow ? (mRow.values.year || 0) : 0;
              }
              return sum + mYearValue;
            }, 0) / otherMeasures.length;
            
            storeOriginalValueIfImpacted(originalRowId, 'measure-final-forecast', actualTimeKey);
            allUpdates.push({ measureId: 'measure-final-forecast', rowId: originalRowId, timeKey: timeKeyToUse, newValue: averageValue });
            
            // Update year value if it changed
            const currentFinalForecastYear = finalForecastRow.values.year || 0;
            if (Math.abs(finalForecastYearValue - currentFinalForecastYear) > 0.01) {
              storeOriginalValueIfImpacted(originalRowId, 'measure-final-forecast', 'year');
              allUpdates.push({ measureId: 'measure-final-forecast', rowId: originalRowId, timeKey: 'year', newValue: finalForecastYearValue });
            }
            
            console.log('[DimensionsTimeGrid] Updating Final Forecast:', { originalRowId, timeKey: timeKeyToUse, averageValue, yearValue: finalForecastYearValue });
          }
        }
      }
    }

    // Apply all updates to data
    const updatedData = gridData.map(m => {
      const updatedMeasure = JSON.parse(JSON.stringify(m));
      const updatesForMeasure = allUpdates.filter(u => u.measureId === m.id);
      if (updatesForMeasure.length === 0) return updatedMeasure;
      
      const updateRowValue = (rows: any[]): void => {
        for (const row of rows) {
          const update = updatesForMeasure.find(u => u.rowId === row.id);
          if (update) {
            const oldValue = row.values[update.timeKey as keyof typeof row.values] || 0;
            console.log('[DimensionsTimeGrid] Updating row value:', { 
              rowId: row.id, 
              rowName: row.name,
              timeKey: update.timeKey, 
              oldValue, 
              newValue: update.newValue 
            });
            row.values[update.timeKey as keyof typeof row.values] = update.newValue;
          }
          // Continue searching children regardless of whether we found a match
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

    console.log('[DimensionsTimeGrid] Updated data:', updatedData.length, 'measures');
    console.log('[DimensionsTimeGrid] All updates:', allUpdates);

    // Update impacted cells - accumulate across all edits (don't clear previous ones)
    setImpactedCells(prev => {
      const newMap = new Map(prev);
      console.log('[DimensionsTimeGrid] Current impacted cells before update:', Array.from(prev.keys()));
      console.log('[DimensionsTimeGrid] New impacted cells to add:', Array.from(originalValuesForImpacted.keys()));
      
      originalValuesForImpacted.forEach((originalVal, impactedKey) => {
        // Only add if not already tracked as edited (edited cells take precedence)
        if (!editedCells.has(impactedKey)) {
          // If already exists, keep the original value (first edit's original)
          if (!newMap.has(impactedKey)) {
            newMap.set(impactedKey, originalVal);
            console.log('[DimensionsTimeGrid] Adding impacted cell:', impactedKey, 'original value:', originalVal);
          } else {
            console.log('[DimensionsTimeGrid] Impacted cell already exists, keeping original:', impactedKey);
          }
        } else {
          // Remove from impacted if it's now edited
          if (newMap.has(impactedKey)) {
            newMap.delete(impactedKey);
            console.log('[DimensionsTimeGrid] Removing from impacted (now edited):', impactedKey);
          }
        }
      });
      console.log('[DimensionsTimeGrid] Total impacted cells after update:', newMap.size);
      console.log('[DimensionsTimeGrid] Final impacted cell keys:', Array.from(newMap.keys()));
      return newMap;
    });

      // Update local state first - this will trigger transformedRows to recalculate
      console.log('[DimensionsTimeGrid] Setting gridData to updated data');
      setGridData(updatedData);
      
      // Then notify parent - parent will update its data, but we keep our local version
      onDataChange(updatedData);
      console.log('[DimensionsTimeGrid] handleCellChange completed successfully');
    } catch (error) {
      console.error('[DimensionsTimeGrid] Error in handleCellChange:', error);
      console.error('[DimensionsTimeGrid] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }
  }, [gridData, onDataChange, editedCells, transformedRows, onEditHistory]);

  console.log('[DimensionsTimeGrid] Component rendering...');
  console.log('[DimensionsTimeGrid] gridData:', gridData?.length, 'measures:', measures?.length, 'transformedRows:', transformedRows?.length);
  console.log('[DimensionsTimeGrid] filteredRows:', filteredRows?.length, 'dateRangeFilteredRows:', dateRangeFilteredRows?.length);
  
  // Use filteredRows if available, otherwise fall back to transformedRows (for debugging)
  const rowsToRender = filteredRows && filteredRows.length > 0 ? filteredRows : (transformedRows && transformedRows.length > 0 ? transformedRows : []);
  console.log('[DimensionsTimeGrid] rowsToRender:', rowsToRender?.length);
  
  // Check if search is active (filtering columns)
  const isFiltering = searchTerm && searchTerm.trim().length > 0;

  // Early return if no data at all - make it very visible
  if (!gridData || gridData.length === 0) {
    console.warn('[DimensionsTimeGrid] No gridData available');
    return (
      <div className="grid-container-wrapper" style={{ minHeight: '200px', backgroundColor: '#f5f5f5', padding: '20px' }}>
        <div className="grid-container">
          <div className="grid-wrapper">
            <div style={{ padding: '20px', textAlign: 'center', color: '#d32f2f', fontSize: '16px', fontWeight: 'bold' }}>
              ⚠️ No data available. gridData is empty or undefined.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Ensure measures is not empty - make it very visible
  if (!measures || measures.length === 0) {
    console.warn('[DimensionsTimeGrid] No measures available');
    return (
      <div className="grid-container-wrapper" style={{ minHeight: '200px', backgroundColor: '#f5f5f5', padding: '20px' }}>
        <div className="grid-container">
          <div className="grid-wrapper">
            <div style={{ padding: '20px', textAlign: 'center', color: '#d32f2f', fontSize: '16px', fontWeight: 'bold' }}>
              ⚠️ No measures available. measures array is empty.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Always render something visible - even if there's an error
  try {
    return (
      <div className="grid-container-wrapper" style={{ minHeight: '100px' }}>
        <div className="grid-container" style={{ minHeight: '100px' }}>
          <div className="grid-wrapper" ref={tableWrapperRef} style={{ minHeight: '100px' }}>
            <table
              {...(isGrid264Ux
                ? { role: 'grid' as const, 'aria-label': 'Dimensions and measures' }
                : {})}
              className={`grid-table dimensions-time-table ${isFiltering ? 'filtered' : ''}`}
              style={{ minHeight: '100px' }}
            >
          <thead className="grid-header">
            <tr>
              <th style={{ width: '300px', minWidth: '300px' }}>
                <div className="grid-header-title-container">
                  <span>Dimensions / Time x Measures</span>
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
              {measures && measures.length > 0 && measures.map((measure) => {
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
                      overflowWrap: 'break-word'
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
            {!rowsToRender || rowsToRender.length === 0 ? (
              <tr>
                <td colSpan={measures.length + 1} style={{ padding: '20px', textAlign: 'center', color: 'var(--color-interactive-border)', backgroundColor: 'var(--color-surface-white)' }}>
                  No data available. transformedRows: {transformedRows?.length || 0}, filteredRows: {filteredRows?.length || 0}. Please check the console for errors.
                </td>
              </tr>
            ) : (
              rowsToRender.map((row) => (
                <DimensionsTimeRowComponent
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
                />
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
    );
  } catch (error) {
    console.error('[DimensionsTimeGrid] Rendering error:', error);
    console.error('[DimensionsTimeGrid] Error stack:', error instanceof Error ? error.stack : 'No stack');
    return (
      <div className="grid-container-wrapper" style={{ minHeight: '200px', backgroundColor: '#ffebee', padding: '20px' }}>
        <div className="grid-container">
          <div className="grid-wrapper">
            <div style={{ padding: '20px', textAlign: 'center', color: '#d32f2f', fontSize: '16px', fontWeight: 'bold' }}>
              ⚠️ Error rendering DimensionsTimeGrid. Check console for details.
              <br />
              <span style={{ fontSize: '12px', fontWeight: 'normal' }}>
                {error instanceof Error ? error.message : String(error)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
};

export default DimensionsTimeGrid;

