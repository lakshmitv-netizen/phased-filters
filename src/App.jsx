import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './index.css';

// Searchable Dropdown Component
function SearchableDropdown({ value, options, onChange, placeholder = "Search...", displayFormatter = null, style = {}, useFixedPosition = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const inputIdRef = useRef(style.id || `searchable-dropdown-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  // Get display text for current value
  const getDisplayText = () => {
    let text;
    if (typeof options[0] === 'string') {
      text = value;
    } else {
      const option = options.find(opt => opt.value === value);
      text = option ? option.label : value;
    }
    // Apply formatter if provided
    return displayFormatter ? displayFormatter(text) : text;
  };

  // Filter options based on search term
  const filteredOptions = options.filter(option => {
    const label = typeof option === 'string' ? option : option.label;
    const meta = typeof option === 'string' ? '' : (option.meta || '');
    const haystack = (label + ' ' + meta).toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  // Handle option selection
  const handleSelect = (option) => {
    const selectedValue = typeof option === 'string' ? option : option.value;
    onChange(selectedValue);
    setSearchTerm('');
    setIsOpen(false);
  };

  // Calculate fixed position for menu when useFixedPosition is true
  useEffect(() => {
    if (isOpen && useFixedPosition && dropdownRef.current && menuRef.current) {
      const updatePosition = () => {
        if (dropdownRef.current && menuRef.current) {
          const rect = dropdownRef.current.getBoundingClientRect();
          const menuWidth = menuRef.current.offsetWidth || 250;
          setMenuPosition({
            top: rect.bottom + 4,
            left: rect.left + (rect.width / 2) - (menuWidth / 2)
          });
        }
      };
      
      // Initial position calculation
      updatePosition();
      
      // Recalculate on scroll and resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, useFixedPosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedInsideDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
      const clickedInsideMenu = menuRef.current && menuRef.current.contains(event.target);
      if (!clickedInsideDropdown && !clickedInsideMenu) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuStyle = useFixedPosition && isOpen ? {
    position: 'fixed',
    top: `${menuPosition.top}px`,
    left: `${menuPosition.left}px`,
    transform: 'none',
    zIndex: 10000
  } : {};

  return (
    <div className="searchable-dropdown" ref={dropdownRef} style={style}>
      <div className="searchable-dropdown-container">
        <input
          ref={inputRef}
          type="text"
          id={inputIdRef.current}
          name={style.name || inputIdRef.current}
          className="searchable-dropdown-input"
          value={isOpen ? searchTerm : getDisplayText()}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
        />
        {!isOpen && (
          <svg
            className="searchable-dropdown-icon" 
            width="12" 
            height="8" 
            viewBox="0 0 12 8" 
            fill="none"
            onClick={() => inputRef.current?.focus()}
          >
            <path d="M1 1.5L6 6.5L11 1.5" stroke="#5C5C5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      {isOpen && filteredOptions.length > 0 && (
        <div className="searchable-dropdown-menu" ref={menuRef} style={menuStyle}>
          {filteredOptions.map((option, index) => {
            const optionValue = typeof option === 'string' ? option : option.value;
            const optionLabel = typeof option === 'string' ? option : option.label;
            
            return (
              <div
                key={index}
                className={`searchable-dropdown-option ${optionValue === value ? 'selected' : ''}`}
                onClick={() => handleSelect(option)}
              >
                <div className="option-main">{optionLabel}</div>
                {typeof option !== 'string' && option.meta ? (
                  <div className="searchable-dropdown-option-meta">{option.meta}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function App() {
  const [expandedRows, setExpandedRows] = useState(new Set()); // Start with empty set, will be populated based on selected cell
  const [manuallyExpandedRows, setManuallyExpandedRows] = useState(new Set()); // Track rows manually expanded by user
  const [selectedMonth, setSelectedMonth] = useState('January 2025');
  const [selectedView, setSelectedView] = useState('Specific Time');
  const [selectedKAMView, setSelectedKAMView] = useState('Account Manager View'); // KAM view state
  const [lastSelectedCell, setLastSelectedCell] = useState('Baseline (Revenue) [Read-Only]'); // Track last selected cell with default
  // BB Cell: tracks the black-bordered cell with {kpi, time, hierarchy}
  const [selectedCell, setSelectedCell] = useState({ 
    kpi: 'Baseline (Revenue) [Read-Only]', 
    time: 0, 
    hierarchy: 'aggregate' 
  });
  const [, setSelectedMonthIndex] = useState(0); // Track which month column was selected in Time Series (setter used on line 4215)
  const [expandedTimePeriods, setExpandedTimePeriods] = useState(new Set(['fy2025'])); // For Account Director Time Roll-up - only FY open initially
  const [manuallyToggledTimePeriods, setManuallyToggledTimePeriods] = useState(new Map()); // Track time periods manually toggled by user: Map<periodId, isExpanded>
  const [sortColumn, setSortColumn] = useState(null); // Track which column is sorted: 'kpi:Baseline...' or 'time:0' (month index) or 'time:-1' (FY)
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
  const [preserveHierarchyOnSort, setPreserveHierarchyOnSort] = useState(true); // Whether to preserve hierarchy structure when sorting (default: true)
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false); // Whether the sort options popover is open
  const sortPopoverRef = useRef(null); // Ref for sort popover positioning
  const sortIndicatorButtonRef = useRef(null); // Ref for sort indicator button
  const [globalSearch, setGlobalSearch] = useState(''); // Global search term to search across all data
  const [editedCellValues, setEditedCellValues] = useState({}); // Track edited cell values: { 'rowId-kpi-timeIndex': editedValue }
  const [editingCell, setEditingCell] = useState(null); // Currently editing cell: { rowId, kpi, timeIndex }
  const clickTimeoutRef = useRef(null); // Ref to track click timeout for double-click detection
  const [columnFilters, setColumnFilters] = useState({}); // Track filter criteria for each column: { 'kpi:Baseline...': { operator: '>=', value: '1000' }, 'time:0': { operator: '=', value: '500' } }
  const [hierarchyFilter, setHierarchyFilter] = useState(''); // Filter for hierarchy/name column (product/category/account names)
  const [timeHierarchyFilter, setTimeHierarchyFilter] = useState(''); // Filter for time hierarchy in Time Roll-up view (FY, Quarters, Months)
  const [groupedComboboxValue, setGroupedComboboxValue] = useState('Account, Product'); // Value for the grouped combobox in Account Director view
  const [groupedComboboxOpen, setGroupedComboboxOpen] = useState(false); // Whether the combobox dropdown is open
  const [selectedLevels, setSelectedLevels] = useState(new Set(['Parent Account', 'Child Account', 'Category', 'Product'])); // Selected hierarchy levels to show
  const [levelFilterOpen, setLevelFilterOpen] = useState(false); // Whether the level filter dropdown is open
  const [selectedTimeLevels, setSelectedTimeLevels] = useState(new Set(['Year', 'Quarter', 'Month'])); // Selected time levels to show
  const [timeLevelFilterOpen, setTimeLevelFilterOpen] = useState(false); // Whether the time level filter dropdown is open
  const [productPopoverOpen, setProductPopoverOpen] = useState(null); // Track which product's popover is open (row ID)
  const productPopoverRef = useRef(null); // Ref for product popover positioning
  const [childFilterOpen, setChildFilterOpen] = useState(null); // Track which parent's child filter is open (row ID)
  const childFilterPopoverRef = useRef(null); // Ref for child filter popover positioning
  const [childFilterSelections, setChildFilterSelections] = useState({}); // Track which children are selected: { parentId: Set(childIds) }
  const [globalFilterPanelOpen, setGlobalFilterPanelOpen] = useState(false); // Whether global filter panel is open
  const [globalFilters, setGlobalFilters] = useState([]); // Array of filter objects: [{ field, operator, value, id }]
  const [selectedKPISet, setSelectedKPISet] = useState('Forecasting KPIs'); // Selected KPI set: 'Forecasting KPIs' or 'Planning KPIs'
  const [kpiSetDropdownOpen, setKpiSetDropdownOpen] = useState(false); // Whether the KPI set dropdown is open
  const kpiSetDropdownRef = useRef(null); // Ref for KPI set dropdown
  const prevViewRef = useRef(selectedView);
  const prevViewForScrollRef = useRef(selectedView); // Track previous view for auto-scroll detection
  const manualToggleTimestampRef = useRef(0); // Track when a manual toggle happened
  const shouldAutoScrollRef = useRef(false); // Track if auto-scroll should happen (only on view changes)
  const groupedComboboxRef = useRef(null); // Ref for grouped combobox to handle click outside
  const levelFilterDropdownRef = useRef(null); // Ref for level filter dropdown to position it
  const timeLevelFilterRef = useRef(null); // Ref for time level filter to handle click outside
  
  const months = ['January 2025', 'February 2025', 'March 2025', 'April 2025', 'May 2025', 'June 2025', 'July 2025', 'August 2025', 'September 2025', 'October 2025', 'November 2025', 'December 2025'];
  const monthNames = ['January \'25', 'February \'25', 'March \'25', 'April \'25', 'May \'25', 'June \'25', 'July \'25', 'August \'25', 'September \'25', 'October \'25', 'November \'25', 'December \'25'];
  const monthsWithFY = ['FY 25', ...months]; // Months array with FY 25 as first option
  const monthsWithFYAndQuarters = ['FY 25', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', ...months]; // For Account Director view: includes quarters
  
  const viewOptions = ['Time series', 'Time Roll-up', 'Specific Time'];
  const kamViewOptions = ['Account Manager View', 'Account Director View'];

  // Ensure the correct quarter chevron is open in Account Director Time Roll-up
  // Match hierarchy logic: only open quarter containing selected cell, close others unless manually opened
  useEffect(() => {
    if (selectedKAMView !== 'Account Director View' || selectedView !== 'Time Roll-up') return;
    
    // Check if a manual toggle just happened - if so, skip auto-expansion
    const timeSinceManualToggle = Date.now() - manualToggleTimestampRef.current;
    const wasRecentManualToggle = timeSinceManualToggle < 500; // Skip auto-expansion if manual toggle within last 500ms
    
    // Only auto-expand if not recently manually toggled
    if (wasRecentManualToggle) return;
    
    // Handle time values: month indices (0-11) or quarter time values (-2 to -5)
    const timeIdx = selectedCell && typeof selectedCell.time === 'number' ? selectedCell.time : -1;
    let quarterId = null;
    
    if (timeIdx >= 0 && timeIdx <= 11) {
      // Month index: determine quarter from month
      quarterId = timeIdx <= 2 ? 'q1' : timeIdx <= 5 ? 'q2' : timeIdx <= 8 ? 'q3' : 'q4';
    } else if (timeIdx >= -5 && timeIdx <= -2) {
      // Quarter time value: -2 (Q1), -3 (Q2), -4 (Q3), -5 (Q4)
      const quarterMap = { '-2': 'q1', '-3': 'q2', '-4': 'q3', '-5': 'q4' };
      quarterId = quarterMap[String(timeIdx)];
    }
    
    setExpandedTimePeriods(prev => {
      const next = new Set();
      
      // Always expand FY (like top-level hierarchy)
      next.add('fy2025');
      
      // Determine which quarters to keep open
      const quarters = ['q1', 'q2', 'q3', 'q4'];
      
      // Always open the quarter containing the selected cell (required)
      if (quarterId) {
        next.add(quarterId);
      }
      
      // Also keep open quarters that were manually expanded by user
      quarters.forEach(qId => {
        if (qId !== quarterId && manuallyToggledTimePeriods.get(qId) === true) {
          next.add(qId);
        }
      });
      
      return next;
    });
  }, [selectedKAMView, selectedView, selectedCell.time, manuallyToggledTimePeriods]);

  // Ensure a valid cell is selected by default on page load and when view/hierarchy changes
  // This prevents showing zeros in Time Roll-up view
  useEffect(() => {
    // Don't interfere with total-aggregate row selection
    if (selectedCell?.hierarchy === 'total-aggregate') {
      return;
    }
    
    // Generate current data based on view and KAM view
    const currentDataRaw = generateDataForMonth(selectedMonth, selectedKAMView === 'Account Director View');
    const currentData = selectedKAMView === 'Account Director View' && groupedComboboxValue
      ? transformDataByHierarchyOrder(currentDataRaw, groupedComboboxValue)
      : currentDataRaw;
    
    // Get the data structure to search in
    const displayedDataForCheck = selectedKAMView === 'Account Director View'
      ? currentData
      : (Array.isArray(currentData) && currentData[0] && Array.isArray(currentData[0].children) 
          ? currentData[0].children 
          : currentData);
    
    if (!displayedDataForCheck || !Array.isArray(displayedDataForCheck) || displayedDataForCheck.length === 0) {
      return;
    }
    
    // Helper to find first leaf node (recursive)
    const findFirstLeafNode = (dataArray) => {
      if (!dataArray || !Array.isArray(dataArray)) return null;
      for (const row of dataArray) {
        if (!row) continue;
        // If it's a leaf node, return it
        if (row.hasChildren === false) {
          return row;
        }
        // Otherwise, search in children
        if (row.children && Array.isArray(row.children) && row.children.length > 0) {
          const found = findFirstLeafNode(row.children);
          if (found) return found;
        }
      }
      return null;
    };
    
    // Helper to check if hierarchy exists in displayedData (recursive)
    const findInHierarchy = (dataArray, targetId) => {
      if (!dataArray || !Array.isArray(dataArray)) return false;
      for (const item of dataArray) {
        if (item.id === targetId) return true;
        if (item.children && item.children.length > 0) {
          if (findInHierarchy(item.children, targetId)) return true;
        }
      }
      return false;
    };
    
    // Check if current selected hierarchy is valid
    const isValidHierarchy = selectedCell.hierarchy && findInHierarchy(displayedDataForCheck, selectedCell.hierarchy);
    
    // If hierarchy is invalid or doesn't exist, select the first leaf node
    if (!isValidHierarchy) {
      const firstLeaf = findFirstLeafNode(displayedDataForCheck);
      if (firstLeaf && firstLeaf.id) {
        setSelectedCell(prev => ({
          kpi: prev.kpi || 'Baseline (Revenue) [Read-Only]',
          time: prev.time !== undefined ? prev.time : 0,
          hierarchy: firstLeaf.id
        }));
      }
    }
  }, [selectedKAMView, selectedView, selectedMonth, groupedComboboxValue, selectedCell.hierarchy]);

  // Position level filter dropdown dynamically
  useEffect(() => {
    if (levelFilterOpen && levelFilterDropdownRef.current) {
      const updatePosition = () => {
        const inputEl = document.getElementById('level-filter-input');
        if (inputEl && levelFilterDropdownRef.current) {
          const rect = inputEl.getBoundingClientRect();
          const dropdown = levelFilterDropdownRef.current;
          // getBoundingClientRect() returns viewport-relative coordinates, perfect for fixed positioning
          let top = rect.bottom + 4;
          let left = rect.left;
          
          // Ensure dropdown doesn't go off-screen to the right
          const dropdownWidth = 400;
          if (left + dropdownWidth > window.innerWidth) {
            left = window.innerWidth - dropdownWidth - 8;
          }
          
          // If dropdown would go off bottom, show above instead
          const dropdownHeight = 320; // maxHeight (20rem = 320px) + padding
          if (top + dropdownHeight > window.innerHeight) {
            top = rect.top - dropdownHeight - 4;
          }
          
          // Ensure dropdown doesn't go off-screen at the top
          if (top < 0) {
            top = 8; // Minimum margin from top
          }
          
          dropdown.style.top = `${top}px`;
          dropdown.style.left = `${left}px`;
          dropdown.style.display = 'block';
        }
      };
      
      // Use setTimeout to ensure DOM is fully rendered
      const timeoutId = setTimeout(() => {
        updatePosition();
      }, 0);
      
      // Update on scroll/resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    } else if (levelFilterDropdownRef.current) {
      levelFilterDropdownRef.current.style.display = 'none';
    }
  }, [levelFilterOpen]);

  // Handle click outside for product popover and position it dynamically
  useEffect(() => {
    if (productPopoverOpen && productPopoverRef.current) {
      const updatePosition = () => {
        // Find the button that opened this popover
        const buttons = document.querySelectorAll('button[title="Show hierarchy path"]');
        let targetButton = null;
        buttons.forEach(btn => {
          const rowId = btn.closest('.table-row')?.querySelector('[data-selected-hierarchy]')?.getAttribute('data-selected-hierarchy');
          if (rowId === productPopoverOpen) {
            targetButton = btn;
          }
        });
        
        if (targetButton && productPopoverRef.current) {
          const buttonRect = targetButton.getBoundingClientRect();
          const popover = productPopoverRef.current;
          const arrowEl = document.getElementById('product-popover-arrow');
          const arrowInnerEl = document.getElementById('product-popover-arrow-inner');
          
          // First set display to block temporarily to get accurate height
          popover.style.display = 'block';
          popover.style.visibility = 'hidden';
          
          const popoverHeight = popover.offsetHeight || 100; // Fallback height
          const popoverWidth = 300;
          
          // Determine if popover should be above or below
          let isAbove = true;
          let top = buttonRect.top - popoverHeight - 10; // 10px gap including arrow
          let left = buttonRect.left + (buttonRect.width / 2) - (popoverWidth / 2);
          
          // If popover would go off-screen to the right, align to right edge
          if (left + popoverWidth > window.innerWidth) {
            left = window.innerWidth - popoverWidth - 8;
          }
          
          // If popover would go off-screen to the left
          if (left < 8) {
            left = 8;
          }
          
          // If popover would go off-screen to the top, show below instead
          if (top < 0) {
            isAbove = false;
            top = buttonRect.bottom + 10;
          }
          
          // Ensure it doesn't go off-screen at the bottom
          if (top + popoverHeight > window.innerHeight) {
            isAbove = true;
            top = window.innerHeight - popoverHeight - 8;
            if (top < 0) {
              top = 8;
            }
          }
          
          popover.style.top = `${top}px`;
          popover.style.left = `${left}px`;
          popover.style.visibility = 'visible';
          popover.style.display = 'block';
          
          // Position the arrow
          if (arrowEl && arrowInnerEl) {
            const arrowCenterX = buttonRect.left + (buttonRect.width / 2);
            const arrowLeft = arrowCenterX - 6; // Half of arrow width (12px)
            
            if (isAbove) {
              // Arrow pointing down (below popover)
              arrowEl.style.top = `${top + popoverHeight}px`;
              arrowEl.style.left = `${arrowLeft}px`;
              arrowEl.style.borderTop = '6px solid #c9c9c9';
              arrowEl.style.borderBottom = 'none';
              arrowEl.style.display = 'block';
              
              arrowInnerEl.style.top = `${top + popoverHeight}px`;
              arrowInnerEl.style.left = `${arrowCenterX - 5}px`;
              arrowInnerEl.style.borderTop = '5px solid #ffffff';
              arrowInnerEl.style.borderBottom = 'none';
              arrowInnerEl.style.display = 'block';
            } else {
              // Arrow pointing up (above popover)
              arrowEl.style.top = `${top - 6}px`;
              arrowEl.style.left = `${arrowLeft}px`;
              arrowEl.style.borderBottom = '6px solid #c9c9c9';
              arrowEl.style.borderTop = 'none';
              arrowEl.style.display = 'block';
              
              arrowInnerEl.style.top = `${top - 5}px`;
              arrowInnerEl.style.left = `${arrowCenterX - 5}px`;
              arrowInnerEl.style.borderBottom = '5px solid #ffffff';
              arrowInnerEl.style.borderTop = 'none';
              arrowInnerEl.style.display = 'block';
            }
          }
        }
      };
      
      // Use setTimeout to ensure DOM is fully rendered
      const timeoutId = setTimeout(() => {
        updatePosition();
      }, 0);
      
      // Update on scroll/resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      const handleClickOutside = (event) => {
        if (productPopoverOpen && 
            productPopoverRef.current && 
            !productPopoverRef.current.contains(event.target) &&
            !event.target.closest('button[title="Show hierarchy path"]')) {
          setProductPopoverOpen(null);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      
      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    } else {
      // Hide popover and arrow when closed
      if (productPopoverRef.current) {
        productPopoverRef.current.style.display = 'none';
      }
      const arrowEl = document.getElementById('product-popover-arrow');
      const arrowInnerEl = document.getElementById('product-popover-arrow-inner');
      if (arrowEl) arrowEl.style.display = 'none';
      if (arrowInnerEl) arrowInnerEl.style.display = 'none';
    }
  }, [productPopoverOpen]);

  // Handle click outside and position for child filter popover
  useEffect(() => {
    if (childFilterOpen && childFilterPopoverRef.current) {
      const updatePosition = () => {
        // Find the filter button that opened this popover
        const buttons = document.querySelectorAll('button[title="Filter children"]');
        let targetButton = null;
        buttons.forEach(btn => {
          const rowId = btn.closest('.table-row')?.querySelector('[data-selected-hierarchy]')?.getAttribute('data-selected-hierarchy');
          if (rowId === childFilterOpen) {
            targetButton = btn;
          }
        });
        
        if (targetButton && childFilterPopoverRef.current) {
          const buttonRect = targetButton.getBoundingClientRect();
          const popover = childFilterPopoverRef.current;
          
          // First set display to block temporarily to get accurate dimensions
          popover.style.display = 'block';
          popover.style.visibility = 'hidden';
          
          const popoverHeight = popover.offsetHeight || 200;
          const popoverWidth = popover.offsetWidth || 250;
          
          // Position below the button
          let top = buttonRect.bottom + 4;
          let left = buttonRect.left;
          
          // If popover would go off-screen to the right, align to right edge
          if (left + popoverWidth > window.innerWidth) {
            left = window.innerWidth - popoverWidth - 8;
          }
          
          // If popover would go off-screen to the left
          if (left < 8) {
            left = 8;
          }
          
          // If popover would go off-screen at the bottom, show above instead
          if (top + popoverHeight > window.innerHeight) {
            top = buttonRect.top - popoverHeight - 4;
          }
          
          // Ensure it doesn't go off-screen at the top
          if (top < 0) {
            top = 8;
          }
          
          popover.style.top = `${top}px`;
          popover.style.left = `${left}px`;
          popover.style.visibility = 'visible';
          popover.style.display = 'block';
        }
      };
      
      // Use setTimeout to ensure DOM is fully rendered
      const timeoutId = setTimeout(() => {
        updatePosition();
      }, 0);
      
      // Update on scroll/resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      const handleClickOutside = (event) => {
        if (childFilterOpen && 
            childFilterPopoverRef.current && 
            !childFilterPopoverRef.current.contains(event.target) &&
            !event.target.closest('button[title="Filter children"]')) {
          setChildFilterOpen(null);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      
      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    } else if (childFilterPopoverRef.current) {
      childFilterPopoverRef.current.style.display = 'none';
    }
  }, [childFilterOpen]);

  // Handle click outside for grouped combobox, level filter, time level filter, KPI set dropdown, and sort popover
  useEffect(() => {
    if (!groupedComboboxOpen && !levelFilterOpen && !timeLevelFilterOpen && !kpiSetDropdownOpen && !sortPopoverOpen) return;

    const handleClickOutside = (event) => {
      // Don't close if clicking inside the combobox area, level filter, time level filter, or KPI set dropdown
      const clickedInsideCombobox = groupedComboboxRef.current && groupedComboboxRef.current.contains(event.target);
      const clickedInsideLevelFilter = (levelFilterDropdownRef.current && levelFilterDropdownRef.current.contains(event.target)) ||
                                       event.target.closest('.level-filter-dropdown') || 
                                       (event.target.id === 'level-filter-input');
      const clickedInsideTimeLevelFilter = timeLevelFilterRef.current && timeLevelFilterRef.current.contains(event.target);
      const clickedInsideKPISetDropdown = kpiSetDropdownRef.current && kpiSetDropdownRef.current.contains(event.target);
      
      const clickedInsideSortPopover = sortPopoverRef.current && sortPopoverRef.current.contains(event.target);
      const clickedOnSortButton = sortIndicatorButtonRef.current && sortIndicatorButtonRef.current.contains(event.target);
      
      if (clickedInsideCombobox || clickedInsideLevelFilter || clickedInsideTimeLevelFilter || clickedInsideKPISetDropdown || clickedInsideSortPopover || clickedOnSortButton) {
        return;
      }

      // Also check if clicking on dropdown menu items (they might be outside the ref due to positioning)
      const clickedElement = event.target;
      const isDropdownItem = clickedElement.closest('.slds-dropdown') || 
                             clickedElement.closest('.slds-listbox__option') ||
                              clickedElement.closest('[role="option"]') ||
                              clickedElement.closest('[role="listbox"]') ||
                              clickedElement.closest('.time-level-filter-dropdown') ||
                              clickedElement.closest('.kpi-set-dropdown');
      
      if (!isDropdownItem) {
        setGroupedComboboxOpen(false);
        setLevelFilterOpen(false);
        setTimeLevelFilterOpen(false);
        setKpiSetDropdownOpen(false);
        setSortPopoverOpen(false);
      }
    };

    // Use click instead of mousedown and add a slight delay
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
    }, 150);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
    };
   }, [groupedComboboxOpen, levelFilterOpen, timeLevelFilterOpen, kpiSetDropdownOpen, sortPopoverOpen]);

  // Preserve selected cell when switching between hierarchy views (Account, Product vs Product, Account)
  const prevGroupedComboboxValueRef = useRef(groupedComboboxValue);
  useEffect(() => {
    if (selectedKAMView !== 'Account Director View') return;
    
    // Don't interfere with total-aggregate row selection - it's an artificial row that doesn't exist in the data structure
    if (selectedCell?.hierarchy === 'total-aggregate') {
      return;
    }
    
    const prevValue = prevGroupedComboboxValueRef.current;
    const currentValue = groupedComboboxValue;
    
    // Only handle transitions between hierarchy views (not initial load or clearing)
    if (prevValue !== currentValue && (prevValue === 'Account, Product' || prevValue === 'Product, Account') && 
        (currentValue === 'Account, Product' || currentValue === 'Product, Account')) {
      
      // Get the current selected row's information
      const currentDataRaw = generateDataForMonth(selectedMonth, true);
      const currentDataOld = prevValue 
        ? transformDataByHierarchyOrder(currentDataRaw, prevValue)
        : currentDataRaw;
      
      // Find path to selected row in old structure to understand its context
      const findPathToRow = (dataArray, targetId, path = []) => {
        for (const row of dataArray) {
          const currentPath = [...path, { id: row.id, name: row.name }];
          if (row.id === targetId) {
            return currentPath;
          }
          if (row.children && row.children.length > 0) {
            const found = findPathToRow(row.children, targetId, currentPath);
            if (found) return found;
          }
        }
        return null;
      };
      
      const dataToSearchOld = Array.isArray(currentDataOld) && currentDataOld[0] 
        ? (currentDataOld[0].children || currentDataOld)
        : currentDataOld;
      
      // Transform to new structure (needed for both branches)
      // For Time Series view with specific months, use that month's data for accurate value matching
      let dataForSearch = currentDataRaw;
      if (selectedCell && selectedCell.time !== undefined && selectedView === 'Time series' && selectedCell.time >= 0 && selectedCell.time <= 11) {
        // Use the month from the selected cell for accurate value comparison
        dataForSearch = generateDataForMonth(months[selectedCell.time], true);
      }
      const currentDataNew = transformDataByHierarchyOrder(dataForSearch, currentValue);
      const dataToSearchNew = Array.isArray(currentDataNew) && currentDataNew[0]
        ? (currentDataNew[0].children || currentDataNew)
        : currentDataNew;
      
      const selectedPathOld = findPathToRow(dataToSearchOld, selectedCell.hierarchy);
      
      if (selectedPathOld && selectedPathOld.length > 0) {
        const selectedRowOld = selectedPathOld[selectedPathOld.length - 1];
        
        // Extract key identifiers from the old path to understand what we're looking for
        // These are the semantic elements: plant names, product categories, product names
        const pathNames = selectedPathOld.map(p => p.name);
        
        // Extract key identifiers from the old path (excluding aggregate/NA which can appear in many places)
        const extractKeyIdentifiers = (pathNames) => {
          return pathNames.filter(name => 
            name !== 'MagnaDrive North America' && 
            name !== 'Aggregate' &&
            !name.includes('North America')
          );
        };
        
        const oldKeyIdentifiers = extractKeyIdentifiers(pathNames);
        
        // Find row in new structure by matching name AND having all key identifiers in its path
        const findRowBySemanticMatch = (dataArray, targetName, targetKeyIdentifiers, currentPath = [], bestMatch = null, bestMatchScore = 0) => {
          for (const row of dataArray) {
            const newPath = [...currentPath, row.name];
            const newKeyIdentifiers = extractKeyIdentifiers(newPath);
            
            // Check if this row matches the target name
            if (row.name === targetName) {
              // Count how many key identifiers from old path are present in new path
              const matchingIdentifiers = targetKeyIdentifiers.filter(id => newKeyIdentifiers.includes(id));
              const matchScore = matchingIdentifiers.length;
              
              // Track the best match (highest score)
              if (matchScore > bestMatchScore) {
                bestMatch = row;
                bestMatchScore = matchScore;
              }
              
              // If we found a perfect match (all identifiers present), return immediately
              if (matchScore === targetKeyIdentifiers.length && targetKeyIdentifiers.length > 0) {
                return row;
              }
            }
            
            // Recurse into children to find better matches
            if (row.children && row.children.length > 0) {
              const recursiveResult = findRowBySemanticMatch(row.children, targetName, targetKeyIdentifiers, newPath, bestMatch, bestMatchScore);
              if (recursiveResult) {
                // Re-evaluate the recursive result's score
                // We need to build the full path to the recursive result to calculate its score
                const findPathToRowForScore = (dataArray, targetId, path = []) => {
                  for (const r of dataArray) {
                    const currentPath = [...path, r.name];
                    if (r.id === targetId) return currentPath;
                    if (r.children && r.children.length > 0) {
                      const found = findPathToRowForScore(r.children, targetId, currentPath);
                      if (found) return found;
                    }
                  }
                  return null;
                };
                
                const recursiveFullPath = findPathToRowForScore([row], recursiveResult.id, newPath);
                if (recursiveFullPath) {
                  const recursiveKeyIds = extractKeyIdentifiers(recursiveFullPath);
                  const recursiveScore = targetKeyIdentifiers.filter(id => recursiveKeyIds.includes(id)).length;
                  
                  // If perfect match found deeper, return it
                  if (recursiveScore === targetKeyIdentifiers.length && targetKeyIdentifiers.length > 0) {
                    return recursiveResult;
                  }
                  // Update best match if recursive result is better
                  if (recursiveScore > bestMatchScore) {
                    bestMatch = recursiveResult;
                    bestMatchScore = recursiveScore;
                  }
                }
              }
            }
          }
          return bestMatch;
        };
        
        // Reusable function to find childmost cell match when switching hierarchies
        // Match by hierarchy path elements (order-agnostic) rather than just value
        // This is more reliable for matching across different hierarchy structures
        const findChildmostCellMatch = (selectedRowOld, oldPath, oldValue, dataToSearchNew, currentValue, prevValue) => {
          if (!selectedRowOld || !dataToSearchNew || !currentValue || !oldPath || oldPath.length === 0) {
            return null;
          }
          
          // Extract hierarchy element names from the old path (excluding common aggregates)
          const oldPathNames = oldPath
            .map(p => typeof p === 'string' ? p : (p.name || p))
            .filter(name => name && name !== 'MagnaDrive North America' && name !== 'Aggregate');
          
          if (oldPathNames.length === 0) {
            return null;
          }
          
          // The product name is the name of the selected row (the leaf node we're trying to match)
          // This is the most specific identifier - e.g., "Chassis Product A" or "TRN-750-M"
          const selectedProductName = selectedRowOld.name;
          
          // Debug: Log what we're searching for
          console.log('Finding match for:', {
            productName: selectedProductName,
            pathElements: oldPathNames,
            oldPath: oldPath.map(p => typeof p === 'string' ? p : p.name)
          });
          
          // Get the cell value helper function
          const getCellValue = (row, kpi) => {
            switch(kpi) {
              case 'Baseline (Revenue) [Read-Only]': return row.baseline;
              case 'AM Adjusted (Revenue) [Editable]': return row.amAdjusted;
              case 'SM Adjustment [Read-Only]': return row.smAdjustment;
              case 'RSD Adjustment [Read-Only]': return row.rsdAdjustment;
              case 'Final Forecast (Revenue) [Read-Only]': return row.finalForecast;
              default: return undefined;
            }
          };
          
          // Helper function to find a row by ID (recursive) - needed in this scope
          const findRowById = (dataArray, id) => {
            if (!dataArray || !Array.isArray(dataArray)) return null;
            for (const row of dataArray) {
              if (row && row.id === id) return row;
              if (row && row.children) {
                const found = findRowById(row.children, id);
                if (found) return found;
              }
            }
            return null;
          };
          
          // Step 1: Find all nodes in the new hierarchy that match the old path elements
          // We'll navigate through the hierarchy matching elements from the old path
          // Priority: Must match the product name AND all other path elements
          const findMatchingNodeByPathElements = (dataArray, targetElements, targetProductName, currentPath = [], allMatches = []) => {
            if (!dataArray || !Array.isArray(dataArray) || targetElements.length === 0) {
              return allMatches;
            }
            
            // Recursively search through all nodes
            for (const node of dataArray) {
              if (!node || !node.name) continue;
              
              const newPath = [...currentPath, node.name];
              
              // Check if this node's path contains all target elements
              const pathSet = new Set(newPath.map(p => typeof p === 'string' ? p.toLowerCase() : (p.name || p).toLowerCase()));
              const hasAllElements = targetElements.every(el => pathSet.has(el.toLowerCase()));
              
              // CRITICAL: Check if the product name matches exactly (case-insensitive)
              // The product name must be in the path to the leaf node
              const hasProductName = newPath.some(p => {
                const name = typeof p === 'string' ? p : (p.name || p);
                return name && name.toLowerCase() === targetProductName.toLowerCase();
              });
              
              // Also check the node itself in case it's the product
              const nodeNameMatches = node.name && node.name.toLowerCase() === targetProductName.toLowerCase();
              
              // If it's a leaf node, has all elements, AND (has product name in path OR is the product itself)
              // This ensures we only match the correct product, not other products that share hierarchy elements
              if (node.hasChildren === false && hasAllElements && (hasProductName || nodeNameMatches)) {
                allMatches.push({ node, path: newPath, productMatch: hasProductName || nodeNameMatches });
              }
              
              // Continue searching in children
              if (node.children && Array.isArray(node.children) && node.children.length > 0) {
                findMatchingNodeByPathElements(node.children, targetElements, targetProductName, newPath, allMatches);
              }
            }
            
            return allMatches;
          };
          
          // Try to find matching nodes by path elements - collect all matches
          const matchingMatches = findMatchingNodeByPathElements(dataToSearchNew, oldPathNames, selectedProductName);
          
          // Debug: Log what was found
          console.log('Found matches:', matchingMatches.map(m => ({
            name: m.node.name,
            id: m.node.id,
            productMatch: m.productMatch,
            path: m.path
          })));
          
          // CRITICAL: Filter to only matches where the product name is in the path
          // This ensures we get "Chassis Product A" and not "TRN-750-A" when searching for Chassis
          const productMatches = matchingMatches.filter(m => {
            const pathNames = m.path.map(p => typeof p === 'string' ? p.toLowerCase() : (p.name || p).toLowerCase());
            const nodeName = m.node.name ? m.node.name.toLowerCase() : '';
            const targetProductLower = selectedProductName.toLowerCase();
            // Product name must be in path OR the node itself is the product
            return pathNames.includes(targetProductLower) || nodeName === targetProductLower;
          });
          
          // Extract nodes from product matches
          const matchingNodes = productMatches.map(m => m.node);
          
          // If we have matches with the correct product name, return the first one
          if (matchingNodes.length > 0 && matchingNodes[0] && matchingNodes[0].id) {
            console.log('Returning matched node:', matchingNodes[0].name, matchingNodes[0].id);
            return matchingNodes[0];
          }
          
          // If no match with product name, try fallback value-based matching
          console.log('No match found for product:', selectedProductName, 'with path elements:', oldPathNames);
          
          // Fallback: If path-based matching doesn't work, try value-based matching
          // This is the original logic but as a fallback
          if (oldValue === undefined) {
            return null;
          }
          
          // Step 1 (fallback): Find the same product node in the new hierarchy by name only
          // Search recursively through the entire hierarchy to find the product
          // Use exact name matching - case sensitive
          const findProductNodeInNew = (dataArray, targetName) => {
            if (!dataArray || !Array.isArray(dataArray)) {
              return null;
            }
            
            for (const row of dataArray) {
              if (!row) continue;
              
              // First check if this row matches exactly (case-sensitive)
              if (row.name === targetName) {
                return { row, path: [] };
              }
              
              // Then search in children recursively
              if (row.children && Array.isArray(row.children) && row.children.length > 0) {
                const found = findProductNodeInNew(row.children, targetName);
                if (found) {
                  return found;
                }
              }
            }
            return null;
          };
          
          // Fallback: If path-based matching doesn't work, try value-based matching
          // This is the original logic but as a fallback
          if (oldValue === undefined) {
            return null;
          }
          
          // Step 1 (fallback): Find the same product node in the new hierarchy by name only
          // Reuse the findProductNodeInNew function already defined above
          let foundProductNode = findProductNodeInNew(dataToSearchNew, selectedRowOld.name);
          
          // If product not found, return null
          if (!foundProductNode || !foundProductNode.row) {
            return null;
          }
          
          // If product found but has no children, it means it's still a leaf in new view
          // In "Product, Account" view, products should have children (North America)
          // So if no children, this might not be the right transformation
          if (!foundProductNode.row.children || foundProductNode.row.children.length === 0) {
            return null;
          }
          
          // Step 2 (fallback): Recursively search for any leaf node under the product that has a matching value
          // This works for both Transmission and Chassis products without hardcoding structure
          const findMatchingLeafCell = (node, targetValue) => {
            if (!node) return null;
            
            // Check if this is a leaf node: hasChildren is explicitly false
            const isLeafNode = node.hasChildren === false;
            
            if (isLeafNode) {
              // Get the cell value for this node
              let nodeValue = undefined;
              
              // For leaf nodes in transformed data, the node itself should have the correct values
              // But for Time Series view, we need to get month-specific values
              if (selectedView === 'Time series' && selectedCell.time >= 0 && selectedCell.time <= 11) {
                // Get value from month-specific transformed data to ensure accuracy
                const monthDataRaw = generateDataForMonth(months[selectedCell.time], selectedKAMView === 'Account Director View');
                const monthDataNew = transformDataByHierarchyOrder(monthDataRaw, currentValue);
                const monthDataToSearchNew = Array.isArray(monthDataNew) && monthDataNew[0]
                  ? (monthDataNew[0].children || monthDataNew)
                  : monthDataNew;
                
                // Try to find the node in the month-specific transformed data by ID
                // The node.id from the current transformed structure should match
                const nodeInMonth = findRowById(monthDataToSearchNew, node.id);
                if (nodeInMonth) {
                  nodeValue = getCellValue(nodeInMonth, selectedCell.kpi);
                } else {
                  // If node not found by ID, the node structure might be different
                  // Try to get value directly from the node (it might be from the same month)
                  nodeValue = getCellValue(node, selectedCell.kpi);
                }
              } else if (selectedView === 'Time series' && selectedCell.time >= -5 && selectedCell.time <= -2) {
                const quarterMonths = selectedCell.time === -2 ? [0, 1, 2] :
                                      selectedCell.time === -3 ? [3, 4, 5] :
                                      selectedCell.time === -4 ? [6, 7, 8] :
                                      [9, 10, 11];
                let quarterTotal = 0;
                quarterMonths.forEach(monthIdx => {
                  const monthDataRaw = generateDataForMonth(months[monthIdx], selectedKAMView === 'Account Director View');
                  const monthDataNew = transformDataByHierarchyOrder(monthDataRaw, currentValue);
                  const monthDataToSearchNewForQ = Array.isArray(monthDataNew) && monthDataNew[0]
                    ? (monthDataNew[0].children || monthDataNew)
                    : monthDataNew;
                  const nodeInMonth = findRowById(monthDataToSearchNewForQ, node.id);
                  if (nodeInMonth) {
                    const value = getCellValue(nodeInMonth, selectedCell.kpi);
                    if (value !== undefined) {
                      quarterTotal += value;
                    }
                  }
                });
                nodeValue = quarterTotal;
              } else if (selectedView === 'Time series' && selectedCell.time === -1) {
                let fyTotal = 0;
                months.forEach((month, idx) => {
                  const monthDataRaw = generateDataForMonth(month, selectedKAMView === 'Account Director View');
                  const monthDataNew = transformDataByHierarchyOrder(monthDataRaw, currentValue);
                  const monthDataToSearchNewForFY = Array.isArray(monthDataNew) && monthDataNew[0]
                    ? (monthDataNew[0].children || monthDataNew)
                    : monthDataNew;
                  const nodeInMonth = findRowById(monthDataToSearchNewForFY, node.id);
                  if (nodeInMonth) {
                    const value = getCellValue(nodeInMonth, selectedCell.kpi);
                    if (value !== undefined) {
                      fyTotal += value;
                    }
                  }
                });
                nodeValue = fyTotal;
              } else {
                nodeValue = getCellValue(node, selectedCell.kpi);
              }
              
              // Check if value matches (with tolerance for rounding differences)
              // Use larger tolerance (1 unit) since values are rounded integers
              if (nodeValue !== undefined && targetValue !== undefined) {
                const diff = Math.abs(nodeValue - targetValue);
                // Allow 1 unit difference for rounding differences in integer values
                if (diff <= 1) {
                  return node;
                }
              } else if (nodeValue === undefined && targetValue === undefined) {
                return node;
              }
              return null;
            }
            
            // If not a leaf, recursively search children
            if (node.children && node.children.length > 0) {
              for (const child of node.children) {
                const found = findMatchingLeafCell(child, targetValue);
                if (found) return found;
              }
            }
            
            return null;
          };
          
          // Search all descendants of the product node for a matching leaf cell
          // In "Product, Account" view, structure is: Product -> North America -> Plants (leaf nodes)
          // So we need to recursively search through all descendants, not just direct children
          const matchingLeaves = [];
          let firstLeafFound = null; // Fallback: store first leaf node found
          
          // Recursively collect all leaf nodes under a given node
          const collectLeaves = (node) => {
            if (!node) return;
            if (node.hasChildren === false) {
              if (!firstLeafFound) {
                firstLeafFound = node;
              }
              return;
            }
            if (node.children && Array.isArray(node.children) && node.children.length > 0) {
              for (const child of node.children) {
                collectLeaves(child);
              }
            }
          };
          
          // Recursively search through all descendants of the product node
          const searchDescendants = (node) => {
            if (!node) return;
            
            // Check if this node itself is a leaf
            if (node.hasChildren === false) {
              // This is a leaf node, try to match its value
              collectLeaves(node); // Track for fallback
              
              // Get the value for this leaf node and compare
              let nodeValue = undefined;
              
              if (selectedView === 'Time series' && selectedCell.time >= 0 && selectedCell.time <= 11) {
                // Get value from month-specific transformed data
                const monthDataRaw = generateDataForMonth(months[selectedCell.time], selectedKAMView === 'Account Director View');
                const monthDataNew = transformDataByHierarchyOrder(monthDataRaw, currentValue);
                const monthDataToSearchNew = Array.isArray(monthDataNew) && monthDataNew[0]
                  ? (monthDataNew[0].children || monthDataNew)
                  : monthDataNew;
                const nodeInMonth = findRowById(monthDataToSearchNew, node.id);
                if (nodeInMonth) {
                  nodeValue = getCellValue(nodeInMonth, selectedCell.kpi);
                } else {
                  nodeValue = getCellValue(node, selectedCell.kpi);
                }
              } else {
                nodeValue = getCellValue(node, selectedCell.kpi);
              }
              
              // Check if value matches (with tolerance for rounding)
              if (nodeValue !== undefined && oldValue !== undefined) {
                const diff = Math.abs(nodeValue - oldValue);
                if (diff <= 1) {
                  matchingLeaves.push(node);
                }
              } else if (nodeValue === undefined && oldValue === undefined) {
                matchingLeaves.push(node);
              }
              return;
            }
            
            // If it has children, search recursively
            if (node.children && Array.isArray(node.children) && node.children.length > 0) {
              for (const child of node.children) {
                searchDescendants(child);
              }
            }
          };
          
          // Start searching from the product node's children (usually North America)
          // But also search recursively through all descendants
          for (const child of foundProductNode.row.children) {
            searchDescendants(child);
          }
          
          // Return first exact match if found, otherwise return first leaf as fallback
          if (matchingLeaves.length > 0 && matchingLeaves[0] && matchingLeaves[0].id) {
            return matchingLeaves[0];
          }
          
          // If no exact match found, return first leaf as fallback
          // This handles cases where values might not match exactly due to rounding or calculation differences
          if (firstLeafFound && firstLeafFound.id) {
            return firstLeafFound;
          }
          
          // Last resort: return null if nothing valid found
          return null;
        };
        
        // Check if the selected row is a childmost (leaf) node
        const oldRow = findRowById(dataToSearchOld, selectedCell.hierarchy);
        const isLeafNode = oldRow && !oldRow.hasChildren;
        
        // Declare selectedRowNew here to ensure it's in scope
        let selectedRowNew = null;
        
        // If it's a leaf node, find the corresponding cell in the new hierarchy
        if (isLeafNode && selectedCell.kpi && selectedCell.time !== undefined) {
          // Get the cell value helper function
          const getCellValue = (row, kpi) => {
            switch(kpi) {
              case 'Baseline (Revenue) [Read-Only]': return row.baseline;
              case 'AM Adjusted (Revenue) [Editable]': return row.amAdjusted;
              case 'SM Adjustment [Read-Only]': return row.smAdjustment;
              case 'RSD Adjustment [Read-Only]': return row.rsdAdjustment;
              case 'Final Forecast (Revenue) [Read-Only]': return row.finalForecast;
              default: return undefined;
            }
          };
          
          // Get the old row's value for the selected KPI and time
          let oldValue = undefined;
          
          if (selectedView === 'Time series' && selectedCell.time >= 0 && selectedCell.time <= 11) {
            // Get value from the specific month's data
            const monthDataRaw = generateDataForMonth(months[selectedCell.time], selectedKAMView === 'Account Director View');
            const monthDataOld = prevValue 
              ? transformDataByHierarchyOrder(monthDataRaw, prevValue)
              : monthDataRaw;
            const monthDataToSearchOld = Array.isArray(monthDataOld) && monthDataOld[0] 
              ? (monthDataOld[0].children || monthDataOld)
              : monthDataOld;
            const oldRowInMonth = findRowById(monthDataToSearchOld, selectedCell.hierarchy);
            if (oldRowInMonth) {
              oldValue = getCellValue(oldRowInMonth, selectedCell.kpi);
            } else {
              // Fallback: try to get from oldRow directly
              oldValue = getCellValue(oldRow, selectedCell.kpi);
            }
          } else if (selectedView === 'Time series' && selectedCell.time >= -5 && selectedCell.time <= -2) {
            const quarterMonths = selectedCell.time === -2 ? [0, 1, 2] :
                                  selectedCell.time === -3 ? [3, 4, 5] :
                                  selectedCell.time === -4 ? [6, 7, 8] :
                                  [9, 10, 11];
            let quarterTotal = 0;
            quarterMonths.forEach(monthIdx => {
              const monthDataRaw = generateDataForMonth(months[monthIdx], selectedKAMView === 'Account Director View');
              const monthDataOld = prevValue 
                ? transformDataByHierarchyOrder(monthDataRaw, prevValue)
                : monthDataRaw;
              const monthDataToSearchOldForQ = Array.isArray(monthDataOld) && monthDataOld[0] 
                ? (monthDataOld[0].children || monthDataOld)
                : monthDataOld;
              const oldRowInMonth = findRowById(monthDataToSearchOldForQ, selectedCell.hierarchy);
              if (oldRowInMonth) {
                const value = getCellValue(oldRowInMonth, selectedCell.kpi);
                if (value !== undefined) {
                  quarterTotal += value;
                }
              }
            });
            oldValue = quarterTotal;
          } else if (selectedView === 'Time series' && selectedCell.time === -1) {
            let fyTotal = 0;
            months.forEach((month, idx) => {
              const monthDataRaw = generateDataForMonth(month, selectedKAMView === 'Account Director View');
              const monthDataOld = prevValue 
                ? transformDataByHierarchyOrder(monthDataRaw, prevValue)
                : monthDataRaw;
              const monthDataToSearchOldForFY = Array.isArray(monthDataOld) && monthDataOld[0] 
                ? (monthDataOld[0].children || monthDataOld)
                : monthDataOld;
              const oldRowInMonth = findRowById(monthDataToSearchOldForFY, selectedCell.hierarchy);
              if (oldRowInMonth) {
                const value = getCellValue(oldRowInMonth, selectedCell.kpi);
                if (value !== undefined) {
                  fyTotal += value;
                }
              }
            });
            oldValue = fyTotal;
          } else {
            oldValue = getCellValue(oldRow, selectedCell.kpi);
          }
          
          // Use the reusable function to find the childmost cell match
          selectedRowNew = findChildmostCellMatch(selectedRowOld, selectedPathOld, oldValue, dataToSearchNew, currentValue, prevValue);
          
          // If the reusable function didn't find a match, fall back to semantic matching
          if (!selectedRowNew) {
            selectedRowNew = findRowBySemanticMatch(dataToSearchNew, selectedRowOld.name, oldKeyIdentifiers);
          }
        } else {
          // Not a leaf node, use semantic matching
          selectedRowNew = findRowBySemanticMatch(dataToSearchNew, selectedRowOld.name, oldKeyIdentifiers);
        }
        
        // If we found a match, verify it's an exact match by checking the cell value
        // An exact match means: same KPI, same time, same value (same logical entity)
        if (selectedRowNew && !isLeafNode) {
          // Find the old row to compare values
          const oldRow = findRowById(dataToSearchOld, selectedCell.hierarchy);
          
          if (oldRow && selectedCell.kpi && selectedCell.time !== undefined) {
            // Get values for the selected KPI and time period
            const getCellValue = (row, kpi) => {
              switch(kpi) {
                case 'Baseline (Revenue) [Read-Only]': return row.baseline;
                case 'AM Adjusted (Revenue) [Editable]': return row.amAdjusted;
                case 'SM Adjustment [Read-Only]': return row.smAdjustment;
                case 'RSD Adjustment [Read-Only]': return row.rsdAdjustment;
                case 'Final Forecast (Revenue) [Read-Only]': return row.finalForecast;
                default: return undefined;
              }
            };
            
            // For time series, we need to check the specific month
            if (selectedView === 'Time series' && selectedCell.time >= 0 && selectedCell.time <= 11) {
              // Compare values from the specific month's data
              const monthDataRaw = generateDataForMonth(months[selectedCell.time], selectedKAMView === 'Account Director View');
              const monthDataOld = prevValue 
                ? transformDataByHierarchyOrder(monthDataRaw, prevValue)
                : monthDataRaw;
              const monthDataNew = transformDataByHierarchyOrder(monthDataRaw, currentValue);
              
              const monthDataToSearchOld = Array.isArray(monthDataOld) && monthDataOld[0] 
                ? (monthDataOld[0].children || monthDataOld)
                : monthDataOld;
              const monthDataToSearchNew = Array.isArray(monthDataNew) && monthDataNew[0]
                ? (monthDataNew[0].children || monthDataNew)
                : monthDataNew;
              
              const oldRowInMonth = findRowById(monthDataToSearchOld, selectedCell.hierarchy);
              const newRowInMonth = findRowById(monthDataToSearchNew, selectedRowNew.id);
              
              if (oldRowInMonth && newRowInMonth) {
                const oldValue = getCellValue(oldRowInMonth, selectedCell.kpi);
                const newValue = getCellValue(newRowInMonth, selectedCell.kpi);
                
                // If values don't match, this is not an exact match - try to find a better match
                if (oldValue !== undefined && newValue !== undefined && oldValue !== newValue) {
                  // Values don't match - try to use the reusable childmost cell matching function
                  const oldRowForMatch = findRowById(dataToSearchOld, selectedCell.hierarchy);
                  if (oldRowForMatch && !oldRowForMatch.hasChildren) {
                    // This is a leaf node, use the reusable function
                    const pathToOldRow = findPathToRow(dataToSearchOld, selectedCell.hierarchy);
                    const exactMatch = findChildmostCellMatch(
                      { name: selectedRowOld.name, id: selectedCell.hierarchy },
                      pathToOldRow || selectedPathOld,
                      oldValue,
                      dataToSearchNew,
                      currentValue,
                      prevValue
                    );
                    if (exactMatch) {
                      selectedRowNew = exactMatch;
                    }
                  }
                }
              }
            } else {
              // For Specific Time view, compare current month values
              const oldValue = getCellValue(oldRow, selectedCell.kpi);
              const newValue = getCellValue(selectedRowNew, selectedCell.kpi);
              
              // If values don't match, try to use the reusable childmost cell matching function
              if (oldValue !== undefined && newValue !== undefined && oldValue !== newValue) {
                // Values don't match - this might be a leaf node case, use the reusable function
                const oldRowForMatch = findRowById(dataToSearchOld, selectedCell.hierarchy);
                if (oldRowForMatch && !oldRowForMatch.hasChildren) {
                  // This is a leaf node, use the reusable function
                  const pathToOldRow = findPathToRow(dataToSearchOld, selectedCell.hierarchy);
                  const exactMatch = findChildmostCellMatch(
                    { name: selectedRowOld.name, id: selectedCell.hierarchy },
                    pathToOldRow || selectedPathOld,
                    oldValue,
                    dataToSearchNew,
                    currentValue,
                    prevValue
                  );
                  if (exactMatch) {
                    selectedRowNew = exactMatch;
                  }
                }
              }
            }
          }
        }
        
        // If semantic matching fails, try finding by full path context
        if (!selectedRowNew) {
          const findRowByFullPath = (dataArray, targetPath, level = 0, currentPath = []) => {
            if (level >= targetPath.length - 1) {
              const targetName = targetPath[targetPath.length - 1].name;
              // At target level, find the row that matches with best context
              for (const row of dataArray) {
                if (row.name === targetName) {
                  // Check if current path has relevant context from target path
                  const pathSet = new Set([...currentPath, row.name].map(p => typeof p === 'string' ? p : p.name || p));
                  const targetSet = new Set(targetPath.map(p => p.name || p));
                  
                  // Count matching elements (excluding aggregate/NA)
                  const matches = Array.from(pathSet).filter(name => 
                    targetSet.has(name) && 
                    name !== 'MagnaDrive North America' && 
                    name !== 'Aggregate'
                  ).length;
                  
                  if (matches > 0) {
                    return row;
                  }
                }
              }
              return null;
            }
            
            // Try to match parent and recurse
            const targetParentName = targetPath[level].name || targetPath[level];
            for (const row of dataArray) {
              const newPath = [...currentPath, row.name];
              if (row.name === targetParentName && row.children && row.children.length > 0) {
                const found = findRowByFullPath(row.children, targetPath, level + 1, newPath);
                if (found) return found;
              }
            }
            return null;
          };
          
          selectedRowNew = findRowByFullPath(dataToSearchNew, selectedPathOld);
        }
        
        // Final fallback: find by name, preferring leaf nodes
        if (!selectedRowNew) {
          const findAllRowsByName = (dataArray, targetName, results = []) => {
            for (const row of dataArray) {
              if (row.name === targetName) {
                results.push(row);
              }
              if (row.children && row.children.length > 0) {
                findAllRowsByName(row.children, targetName, results);
              }
            }
            return results;
          };
          
          const allMatches = findAllRowsByName(dataToSearchNew, selectedRowOld.name);
          // Prefer rows without children (leaf nodes) or the first match
          selectedRowNew = allMatches.find(r => !r.hasChildren) || allMatches[0];
        }
        
        // Only update selected cell if a matching cell exists
        // A matching cell means: same KPI, same time period, same hierarchy (equivalent row)
        if (selectedRowNew && selectedRowNew.id) {
          // Find the path to the new selected row to expand all parent chevrons
          const findPathToHierarchy = (dataArray, targetId, path = []) => {
            for (const row of dataArray) {
              const currentPath = [...path, row.id];
              if (row.id === targetId) {
                return currentPath; // Return path including the target itself
              }
              if (row.children && row.children.length > 0) {
                const found = findPathToHierarchy(row.children, targetId, currentPath);
                if (found) return found;
              }
            }
            return null;
          };
          
          const pathToNewRow = findPathToHierarchy(dataToSearchNew, selectedRowNew.id);
          
          // Expand all parent rows in the path (excluding the selected row itself)
          if (pathToNewRow && pathToNewRow.length > 0) {
            const parentIds = pathToNewRow.slice(0, -1); // Exclude the last element (selected row itself)
            // Mark these expansions as manual so they are preserved
            setManuallyExpandedRows(prev => {
              const next = new Set(prev);
              parentIds.forEach(id => next.add(id));
              return next;
            });
            setExpandedRows(prev => {
              const next = new Set(prev);
              parentIds.forEach(id => next.add(id));
              return next;
            });
          }
          
          // Update selected cell with new hierarchy ID while preserving KPI and time
          // This ensures the exact same cell (same KPI, same time, equivalent hierarchy) is shown
          // Do NOT trigger auto-scroll here - only scroll when view changes via button group or dropdown
          // Ensure we have a valid ID before updating
          if (selectedRowNew && selectedRowNew.id) {
            setSelectedCell(prev => ({
              kpi: prev.kpi || lastSelectedCell, // Preserve KPI
              time: prev.time, // Preserve time period (month index or -1 for FY)
              hierarchy: selectedRowNew.id // Update to matching hierarchy in new structure
            }));
          } else {
            // Fallback: try to find any leaf node
            console.log('selectedRowNew missing or invalid, attempting fallback');
            const findFirstLeaf = (dataArray) => {
              for (const row of dataArray) {
                if (row && row.hasChildren === false) {
                  return row;
                }
                if (row && row.children && Array.isArray(row.children) && row.children.length > 0) {
                  const found = findFirstLeaf(row.children);
                  if (found) return found;
                }
              }
              return null;
            };
            
            const firstLeaf = findFirstLeaf(dataToSearchNew);
            if (firstLeaf && firstLeaf.id) {
              setSelectedCell(prev => ({
                kpi: prev.kpi || lastSelectedCell,
                time: prev.time,
                hierarchy: firstLeaf.id
              }));
            }
          }
        } else {
          // No matching cell found - reset selection to default
          // This happens when the semantic matching fails (rare edge case)
          console.log('No matching cell found when switching hierarchy views. Resetting selection.');
          // Reset to first available row
          const firstAvailableRow = dataToSearchNew && dataToSearchNew.length > 0 
            ? dataToSearchNew[0] 
            : null;
          
          if (firstAvailableRow) {
            // Find first leaf node (actual data node, not aggregate)
            const findFirstLeafNode = (row) => {
              if (!row.hasChildren || !row.children || row.children.length === 0) {
                return row;
              }
              return findFirstLeafNode(row.children[0]);
            };
            
            const firstLeaf = findFirstLeafNode(firstAvailableRow);
            setSelectedCell(prev => ({
              kpi: prev.kpi || lastSelectedCell, // Preserve KPI
              time: prev.time, // Preserve time period
              hierarchy: firstLeaf.id // Update to first available hierarchy
            }));
            // Do NOT trigger auto-scroll - only scroll when view changes
          }
        }
      } else {
        // selectedPathOld not found - the old selected hierarchy doesn't exist
        // Reset to first available row
        const firstAvailableRow = dataToSearchNew && dataToSearchNew.length > 0 
          ? dataToSearchNew[0] 
          : null;
        
        if (firstAvailableRow) {
          const findFirstLeafNode = (row) => {
            if (!row.hasChildren || !row.children || row.children.length === 0) {
              return row;
            }
            return findFirstLeafNode(row.children[0]);
          };
          
          const firstLeaf = findFirstLeafNode(firstAvailableRow);
          setSelectedCell(prev => ({
            kpi: prev.kpi || lastSelectedCell, // Preserve KPI
            time: prev.time, // Preserve time period
            hierarchy: firstLeaf.id // Update to first available hierarchy
          }));
          // Do NOT trigger auto-scroll - only scroll when view changes
        }
      }
    }
    
    prevGroupedComboboxValueRef.current = currentValue;
  }, [groupedComboboxValue, selectedKAMView, selectedMonth, selectedCell.hierarchy]);

  // Sync selectedMonth with selectedCell.time when switching to Specific Time view
  useEffect(() => {
    if (selectedView === 'Specific Time' && selectedCell && selectedCell.time !== undefined) {
      let monthForTime;
      if (selectedCell.time === -1) {
        monthForTime = 'FY 25';
      } else if (selectedCell.time === -2) {
        monthForTime = 'Q1 2025';
      } else if (selectedCell.time === -3) {
        monthForTime = 'Q2 2025';
      } else if (selectedCell.time === -4) {
        monthForTime = 'Q3 2025';
      } else if (selectedCell.time === -5) {
        monthForTime = 'Q4 2025';
      } else {
        monthForTime = months[selectedCell.time];
      }
      if (monthForTime && monthForTime !== selectedMonth) {
        setSelectedMonth(monthForTime);
      }
    }
  }, [selectedView, selectedCell.time]);

  // Automatically expand parent rows to make selected cell visible
  useEffect(() => {
    // This will be defined after data is created, so we need to check if it exists
    if (!selectedCell || !selectedCell.hierarchy) return;
    
    // Only check if view changed - auto-scroll should ONLY happen on view changes via button group or dropdown
    // Do NOT trigger auto-scroll on cell clicks or hierarchy switches
    const prevView = prevViewForScrollRef.current;
    const validViews = ['Time series', 'Time Roll-up', 'Specific Time'];
    const viewChanged = prevView !== selectedView;
    if (viewChanged && validViews.includes(prevView) && validViews.includes(selectedView)) {
      shouldAutoScrollRef.current = true;
    } else {
      // If view didn't change, ensure auto-scroll is disabled (prevents scrolling on cell clicks)
      shouldAutoScrollRef.current = false;
    }
    
    // We'll compute data here to ensure it's available when this effect runs
    const currentDataRaw = generateDataForMonth(selectedMonth, selectedKAMView === 'Account Director View');
    const currentData = selectedKAMView === 'Account Director View' && groupedComboboxValue
      ? transformDataByHierarchyOrder(currentDataRaw, groupedComboboxValue)
      : currentDataRaw;
    if (!currentData || !Array.isArray(currentData)) return;
    
    // For Account Manager View, use displayedData (children of aggregate), otherwise use full data
    const dataToSearch = selectedKAMView === 'Account Director View'
      ? currentData
      : (Array.isArray(currentData) && currentData[0] && Array.isArray(currentData[0].children) ? currentData[0].children : currentData);
    
    const targetHierarchy = selectedCell.hierarchy;
    
    // Find path to hierarchy (recursive helper)
    const findPathToHierarchy = (dataArray, targetId, path = []) => {
      for (const row of dataArray) {
        const currentPath = [...path, row.id];
        if (row.id === targetId) {
          return currentPath;
        }
        if (row.children && row.children.length > 0) {
          const found = findPathToHierarchy(row.children, targetId, currentPath);
          if (found) return found;
        }
      }
      return null;
    };
    
    const path = findPathToHierarchy(dataToSearch, targetHierarchy);
    
    // Helper function to get all row IDs from data structure
    const getAllRowIds = (dataArray, ids = []) => {
      dataArray.forEach(row => {
        if (row.hasChildren) {
          ids.push(row.id);
        }
        if (row.children && row.children.length > 0) {
          getAllRowIds(row.children, ids);
        }
      });
      return ids;
    };
    
    // Helper function to find a row by ID in the data structure
    const findRowById = (dataArray, targetId) => {
      for (const row of dataArray) {
        if (row.id === targetId) {
          return row;
        }
        if (row.children && row.children.length > 0) {
          const found = findRowById(row.children, targetId);
          if (found) return found;
        }
      }
      return null;
    };
    
    // Helper function to get all descendant IDs (children and their descendants) of a given row
    const getDescendantIds = (row) => {
      const descendantIds = [];
      if (row && row.children && row.children.length > 0) {
        row.children.forEach(child => {
          if (child.hasChildren) {
            descendantIds.push(child.id);
            // Recursively get descendants of children
            const childDescendants = getDescendantIds(child);
            descendantIds.push(...childDescendants);
          }
        });
      }
      return descendantIds;
    };
    
    // Get all row IDs in the data structure
    const allRowIds = getAllRowIds(dataToSearch);
    
    // Expand parent rows if path exists, and close all unrelated rows
    if (path && path.length > 0) {
      // Remove the last element (the target itself) - we only need to expand parents
      const parentIds = new Set(path.slice(0, -1));
      
      // Find the selected row to get its descendants
      const selectedRow = findRowById(dataToSearch, targetHierarchy);
      const descendantIds = selectedRow ? getDescendantIds(selectedRow) : [];
      
      // Use functional update to access current expandedRows state
      setExpandedRows(prevExpandedRows => {
        const next = new Set();
        // Always add path parents (required to show selected cell)
        parentIds.forEach(id => next.add(id));
        // Preserve descendants of selected cell (don't auto-close chevrons below selected cell)
        // Only preserve if they were already expanded
        descendantIds.forEach(id => {
          if (allRowIds.includes(id) && prevExpandedRows.has(id)) {
            next.add(id);
          }
        });
        // Also add manually expanded rows (user preference)
        manuallyExpandedRows.forEach(id => {
          if (allRowIds.includes(id)) {
            next.add(id);
          }
        });
        return next;
      });
    } else {
      // If no path found, keep manually expanded rows that are valid
      const next = new Set();
      manuallyExpandedRows.forEach(id => {
        if (allRowIds.includes(id)) {
          next.add(id);
        }
      });
      setExpandedRows(next);
    }
    
    // Always try to scroll to selected cell (even if no path expansion needed)
    // But only if shouldAutoScrollRef is true (view changed or hierarchy switched)
    if (!shouldAutoScrollRef.current) return;
    
    const scrollToCell = () => {
      // Try multiple selectors to find the selected cell
      let selectedCellElement = null;
      
      // First try exact match with all attributes
      if (selectedCell.time !== undefined && selectedCell.kpi) {
        selectedCellElement = document.querySelector(
          `[data-selected-hierarchy="${selectedCell.hierarchy}"][data-selected-time="${selectedCell.time}"][data-selected-kpi="${selectedCell.kpi}"]`
        );
      }
      
      // If not found, try with just hierarchy and time
      if (!selectedCellElement && selectedCell.time !== undefined) {
        selectedCellElement = document.querySelector(
          `[data-selected-hierarchy="${selectedCell.hierarchy}"][data-selected-time="${selectedCell.time}"]`
        );
      }
      
      // If still not found, try with just hierarchy and KPI
      if (!selectedCellElement && selectedCell.kpi) {
        selectedCellElement = document.querySelector(
          `[data-selected-hierarchy="${selectedCell.hierarchy}"][data-selected-kpi="${selectedCell.kpi}"]`
        );
      }
      
      // Last resort: just hierarchy (will scroll to row)
      if (!selectedCellElement) {
        selectedCellElement = document.querySelector(
          `[data-selected-hierarchy="${selectedCell.hierarchy}"]`
        );
      }
      
      if (selectedCellElement) {
        // Find the scrollable container (simple-grid)
        const scrollContainer = selectedCellElement.closest('.simple-grid');
        
        // Find the row element containing this cell for better vertical scrolling
        const rowElement = selectedCellElement.closest('.table-row');
        const scrollTarget = rowElement || selectedCellElement;
        
        if (scrollContainer) {
          // Function to get element position relative to scroll container
          const getElementPosition = (element, container) => {
            // Get current scroll positions
            const scrollTop = container.scrollTop;
            const scrollLeft = container.scrollLeft;
            
            // Get bounding rectangles
            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            
            // Calculate position relative to container's scrollable content
            // elementRect is relative to viewport, containerRect is relative to viewport
            // Add current scroll to get absolute position within scrollable content
            const top = (elementRect.top - containerRect.top) + scrollTop;
            const left = (elementRect.left - containerRect.left) + scrollLeft;
            
            return { top, left };
          };
          
          const containerHeight = scrollContainer.clientHeight;
          const containerWidth = scrollContainer.clientWidth;
          
          // For horizontal scroll, use the cell element itself for accurate positioning
          const cellRect = selectedCellElement.getBoundingClientRect();
          const cellWidth = cellRect.width;
          const cellPosition = getElementPosition(selectedCellElement, scrollContainer);
          
          // For vertical scroll, use the row element
          const rowRect = scrollTarget.getBoundingClientRect();
          const elementHeight = rowRect.height;
          
          // Account for sticky header (approximately 100px for month-selector + table-header)
          const stickyHeaderOffset = 100;
          
          // Get row position for vertical scroll
          const rowPosition = getElementPosition(scrollTarget, scrollContainer);
          
          // Calculate target scroll positions
          // For horizontal: ensure the cell is fully visible, especially for rightmost columns like December
          const maxScrollLeft = scrollContainer.scrollWidth - containerWidth;
          
          // Always calculate target scroll position to ensure cell is fully visible
          const cellLeftAbsolute = cellPosition.left;
          const cellRightAbsolute = cellLeftAbsolute + cellWidth;
          
          // Calculate scroll position needed to show right edge of cell (with padding)
          const scrollToShowRightEdge = cellRightAbsolute - containerWidth + 40; // 40px padding for better visibility
          
          // Calculate scroll position to center the cell
          const scrollToCenter = cellLeftAbsolute - (containerWidth / 2) + (cellWidth / 2);
          
          // For rightmost cells, ensure right edge is visible; use maximum to ensure full visibility
          let targetScrollLeft = Math.max(scrollToCenter, scrollToShowRightEdge);
          
          // Don't exceed maximum scroll
          targetScrollLeft = Math.min(targetScrollLeft, maxScrollLeft);
          
          // Ensure it's not negative
          targetScrollLeft = Math.max(0, targetScrollLeft);
          
          // First, scroll horizontally to ensure cell is fully visible
          scrollContainer.scrollTo({
            left: targetScrollLeft,
            behavior: 'smooth'
          });
          
          // Wait for horizontal scroll to complete, then scroll vertically
          setTimeout(() => {
            // Recalculate position after horizontal scroll completes
            requestAnimationFrame(() => {
              // Use multiple animation frames to ensure DOM is fully updated
              requestAnimationFrame(() => {
                const updatedPosition = getElementPosition(scrollTarget, scrollContainer);
                const updatedElementRect = scrollTarget.getBoundingClientRect();
                const updatedElementHeight = updatedElementRect.height;
                const updatedContainerHeight = scrollContainer.clientHeight;
                const updatedScrollHeight = scrollContainer.scrollHeight;
                const maxScrollTop = Math.max(0, updatedScrollHeight - updatedContainerHeight);
                
                // Calculate target scroll to center the row
                const scrollToCenter = updatedPosition.top - (updatedContainerHeight / 2) + (updatedElementHeight / 2) - stickyHeaderOffset;
                
                // Calculate scroll position needed to show the bottom of the row
                // rowBottomPosition is the absolute position of the bottom edge within the scrollable content
                const rowBottomPosition = updatedPosition.top + updatedElementHeight;
                // To show the bottom, we need: scrollTop >= rowBottomPosition - containerHeight + padding
                const scrollToShowBottom = rowBottomPosition - updatedContainerHeight + 50; // 50px padding for better visibility
                
                // Check if this is the bottommost row (row's bottom is very close to scrollHeight)
                const rowDistanceFromBottom = updatedScrollHeight - rowBottomPosition;
                const isBottommostRow = rowDistanceFromBottom < 100; // Within 100px of bottom
                
                let updatedTargetScrollTop;
                
                if (isBottommostRow) {
                  // For bottommost row, always scroll to max to ensure bottom is fully visible
                  updatedTargetScrollTop = maxScrollTop;
                } else {
                  // Use the maximum of both to ensure full visibility (prioritize showing bottom)
                  updatedTargetScrollTop = Math.max(scrollToCenter, scrollToShowBottom);
                  
                  // Don't exceed maximum scroll
                  updatedTargetScrollTop = Math.min(updatedTargetScrollTop, maxScrollTop);
                }
                
                // Ensure it's not negative
                updatedTargetScrollTop = Math.max(0, updatedTargetScrollTop);
                
                // Perform vertical scroll
                if (!isNaN(updatedTargetScrollTop) && updatedTargetScrollTop >= 0) {
                  scrollContainer.scrollTo({
                    top: updatedTargetScrollTop,
                    behavior: 'smooth'
                  });
                  
                  // Double-check after scroll animation completes, especially for bottommost rows
                  setTimeout(() => {
                    requestAnimationFrame(() => {
                      const finalElementRect = scrollTarget.getBoundingClientRect();
                      const finalContainerRect = scrollContainer.getBoundingClientRect();
                      const finalScrollTop = scrollContainer.scrollTop;
                      const finalScrollHeight = scrollContainer.scrollHeight;
                      const finalContainerHeight = scrollContainer.clientHeight;
                      const finalMaxScroll = Math.max(0, finalScrollHeight - finalContainerHeight);
                      
                      // Calculate row position to check if it's the bottommost row
                      const finalRowPosition = (finalElementRect.top - finalContainerRect.top) + finalScrollTop;
                      const finalRowHeight = finalElementRect.height;
                      const finalRowBottomPosition = finalRowPosition + finalRowHeight;
                      const finalRowDistanceFromBottom = finalScrollHeight - finalRowBottomPosition;
                      const isBottommostRow = finalRowDistanceFromBottom < 100; // Within 100px of bottom
                      
                      // Check if bottom of row is visible
                      const rowBottomInViewport = finalElementRect.bottom;
                      const containerBottom = finalContainerRect.bottom;
                      const isBottomVisible = rowBottomInViewport <= containerBottom + 10; // 10px tolerance
                      
                      // If bottom is not visible, or if it's the bottommost row, ensure bottom is fully visible
                      if (!isBottomVisible || isBottommostRow) {
                        // For bottommost row, always scroll to max to ensure bottom is fully visible
                        if (isBottommostRow) {
                          scrollContainer.scrollTo({
                            top: finalMaxScroll,
                            behavior: 'smooth'
                          });
                        } else if (finalScrollTop >= finalMaxScroll - 10) {
                          // Already near max, just scroll to exact max
                          scrollContainer.scrollTo({
                            top: finalMaxScroll,
                            behavior: 'smooth'
                          });
                        } else {
                          // Calculate adjustment needed to show bottom
                          const adjustScroll = finalRowBottomPosition - finalContainerHeight + 50;
                          
                          if (adjustScroll <= finalMaxScroll && adjustScroll > finalScrollTop) {
                            scrollContainer.scrollTo({
                              top: Math.min(adjustScroll, finalMaxScroll),
                              behavior: 'smooth'
                            });
                          } else if (adjustScroll > finalMaxScroll) {
                            // Need to scroll to max to show bottom
                            scrollContainer.scrollTo({
                              top: finalMaxScroll,
                              behavior: 'smooth'
                            });
                          }
                        }
                      }
                    });
                  }, 800); // Wait for smooth scroll to complete
                } else {
                  // Fallback: use scrollIntoView to show the row
                  scrollTarget.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'nearest'
                  });
                }
              });
            });
          }, 500); // Wait for horizontal scroll animation to complete
        } else {
          // Fallback to standard scrollIntoView
          scrollTarget.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center'
          });
        }
      } else {
        // Debug: log if cell not found
        console.log('Cell not found for scroll:', {
          hierarchy: selectedCell.hierarchy,
          time: selectedCell.time,
          kpi: selectedCell.kpi,
          selectedView,
          selectedKAMView
        });
      }
    };
    
    // Check if a manual toggle just happened - if so, skip scrolling
    const timeSinceManualToggle = Date.now() - manualToggleTimestampRef.current;
    const wasRecentManualToggle = timeSinceManualToggle < 500; // Skip scroll if manual toggle within last 500ms
    
    // Only scroll if view changed (shouldAutoScrollRef is true) and this wasn't triggered by a manual toggle
    if (shouldAutoScrollRef.current && !wasRecentManualToggle) {
      // Scroll after expansion completes (use longer delay if expansion happened)
      const delay = path && path.length > 0 ? 300 : 150;
      
      // Use requestAnimationFrame to ensure DOM is ready, then setTimeout for expansion
      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollToCell();
          // Reset the auto-scroll flag after scroll completes
          setTimeout(() => {
            shouldAutoScrollRef.current = false;
          }, 800 + 500 + delay); // Wait for scroll animations to complete
        }, delay);
      });
    } else {
      // Reset auto-scroll flag if scrolling didn't happen
      shouldAutoScrollRef.current = false;
    }
  }, [selectedCell.hierarchy, selectedCell.time, selectedCell.kpi, selectedMonth, selectedKAMView, selectedView, manuallyExpandedRows]);
  
  // KPI options for the dropdown in Time Series view
  const kpiOptions = [
    'Baseline (Revenue) [Read-Only]',
    'AM Adjusted (Revenue) [Editable]',
    'SM Adjustment [Read-Only]',
    'RSD Adjustment [Read-Only]',
    'Final Forecast (Revenue) [Read-Only]'
  ];

  // Helper function to display KPI with emojis for Time Series view
  const getTimeSeriesKPIDisplay = (kpi) => {
    if (!kpi) return '';
    if (kpi.includes('[Read-Only]')) {
      return kpi.replace(' [Read-Only]', '') + ' 📖';
    } else if (kpi.includes('[Editable]')) {
      return kpi.replace(' [Editable]', '') + ' ✏️';
    }
    return kpi;
  };

  // Handle view switching - update BB cell's KPI or time
  useEffect(() => {
    const prevView = prevViewRef.current;
    
    // Check if view changed between Time Series, Time Roll-up, or Specific Time - if so, enable auto-scroll
    // This is the ONLY place where auto-scroll should be triggered (when switching views via button group or dropdown)
    const validViews = ['Time series', 'Time Roll-up', 'Specific Time'];
    const viewChanged = prevView !== selectedView;
    if (viewChanged && validViews.includes(prevView) && validViews.includes(selectedView)) {
      shouldAutoScrollRef.current = true;
      // Update prevViewForScrollRef to track this view change
      prevViewForScrollRef.current = selectedView;
    } else {
      // If view didn't change, ensure auto-scroll is disabled (prevents scrolling on cell clicks)
      shouldAutoScrollRef.current = false;
    }
    
    // Switching from Time Series → Specific Time
    if (prevView === 'Time series' && selectedView === 'Specific Time') {
      setSelectedCell(prev => ({
        ...prev,
        kpi: lastSelectedCell
      }));
      // Handle FY 25, quarters, and months
      let monthForTime;
      if (selectedCell.time === -1) {
        monthForTime = 'FY 25';
      } else if (selectedCell.time === -2) {
        monthForTime = 'Q1 2025';
      } else if (selectedCell.time === -3) {
        monthForTime = 'Q2 2025';
      } else if (selectedCell.time === -4) {
        monthForTime = 'Q3 2025';
      } else if (selectedCell.time === -5) {
        monthForTime = 'Q4 2025';
      } else if (selectedCell.time >= 0 && selectedCell.time <= 11) {
        monthForTime = months[selectedCell.time];
      } else {
        // Fallback to current selectedMonth or first month
        monthForTime = selectedMonth || months[0];
      }
      setSelectedMonth(monthForTime);
    }
    
    // Switching from Specific Time → Time Series
    if (prevView === 'Specific Time' && selectedView === 'Time series') {
      // Handle FY 25, quarters, and months - preserve quarter time values
      let currentTimeIndex;
      if (selectedMonth === 'FY 25') {
        currentTimeIndex = -1;
      } else if (selectedMonth === 'Q1 2025') {
        currentTimeIndex = -2; // Q1
      } else if (selectedMonth === 'Q2 2025') {
        currentTimeIndex = -3; // Q2
      } else if (selectedMonth === 'Q3 2025') {
        currentTimeIndex = -4; // Q3
      } else if (selectedMonth === 'Q4 2025') {
        currentTimeIndex = -5; // Q4
      } else {
        currentTimeIndex = months.indexOf(selectedMonth);
        // If month not found, preserve the current time or default to 0
        if (currentTimeIndex === -1) {
          currentTimeIndex = selectedCell.time !== undefined && selectedCell.time >= 0 && selectedCell.time <= 11 
            ? selectedCell.time 
            : 0;
        }
      }
      setSelectedCell(prev => ({
        ...prev,
        time: currentTimeIndex
      }));
    }
    
    // Switching from Time Roll-up → Specific Time
    if (prevView === 'Time Roll-up' && selectedView === 'Specific Time') {
      setSelectedCell(prev => ({
        ...prev,
        kpi: lastSelectedCell
      }));
      // Handle FY 25, quarters, and months
      let monthForTime;
      if (selectedCell.time === -1) {
        monthForTime = 'FY 25';
      } else if (selectedCell.time === -2) {
        monthForTime = 'Q1 2025';
      } else if (selectedCell.time === -3) {
        monthForTime = 'Q2 2025';
      } else if (selectedCell.time === -4) {
        monthForTime = 'Q3 2025';
      } else if (selectedCell.time === -5) {
        monthForTime = 'Q4 2025';
      } else if (selectedCell.time >= 0 && selectedCell.time <= 11) {
        monthForTime = months[selectedCell.time];
      } else {
        // Fallback to current selectedMonth or first month
        monthForTime = selectedMonth || months[0];
      }
      setSelectedMonth(monthForTime);
    }
    
    // Switching from Time Roll-up → Time Series
    if (prevView === 'Time Roll-up' && selectedView === 'Time series') {
      setLastSelectedCell(selectedCell.kpi || 'Baseline (Revenue) [Read-Only]');
    }
    
    // Switching from Specific Time → Time Roll-up
    if (prevView === 'Specific Time' && selectedView === 'Time Roll-up') {
      // Handle FY 25, quarters, and months - preserve quarter time values
      let currentTimeIndex;
      if (selectedMonth === 'FY 25') {
        currentTimeIndex = -1;
      } else if (selectedMonth === 'Q1 2025') {
        currentTimeIndex = -2; // Q1
      } else if (selectedMonth === 'Q2 2025') {
        currentTimeIndex = -3; // Q2
      } else if (selectedMonth === 'Q3 2025') {
        currentTimeIndex = -4; // Q3
      } else if (selectedMonth === 'Q4 2025') {
        currentTimeIndex = -5; // Q4
      } else {
        currentTimeIndex = months.indexOf(selectedMonth);
        // If month not found, preserve the current time or default to 0
        if (currentTimeIndex === -1) {
          currentTimeIndex = selectedCell.time !== undefined && selectedCell.time >= 0 && selectedCell.time <= 11 
            ? selectedCell.time 
            : 0;
        }
      }
      setSelectedCell(prev => ({
        ...prev,
        time: currentTimeIndex
      }));
    }
    
    // Switching from Time Series → Time Roll-up
    if (prevView === 'Time series' && selectedView === 'Time Roll-up') {
      setSelectedCell(prev => ({
        ...prev,
        hierarchy: prev.hierarchy || 'aggregate'
      }));
    }
    
    prevViewRef.current = selectedView;
  }, [selectedView, months, selectedMonth, lastSelectedCell, selectedCell.time, selectedCell.kpi]);

  const toggleRow = (rowId) => {
    // Record timestamp of manual toggle to prevent auto-scrolling
    manualToggleTimestampRef.current = Date.now();
    
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
        // Remove from manually expanded if collapsed
        setManuallyExpandedRows(prevManual => {
          const newManual = new Set(prevManual);
          newManual.delete(rowId);
          return newManual;
        });
      } else {
        newSet.add(rowId);
        // Mark as manually expanded when user opens it
        setManuallyExpandedRows(prevManual => {
          const newManual = new Set(prevManual);
          newManual.add(rowId);
          return newManual;
        });
      }
      return newSet;
    });
  };

  // Generate data based on selected month
  const generateDataForMonth = (month, includeOhio = false) => {
    // If FY 25 is selected, calculate sum of all months
    if (month === 'FY 25') {
      // Calculate actual sum by generating each month and summing the rounded values
      const uniqueMultipliers = [1.15, 0.92, 1.05, 1.18, 0.88, 1.10, 1.20, 0.85, 1.12, 0.95, 1.08, 1.00];
      
      // Calculate sums for each metric
      const aggregateBaseline = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(5000000 * mult), 0);
      const aggregateAmAdjusted = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(5500000 * mult), 0);
      const aggregateSmAdjustment = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(200000 * mult), 0);
      const aggregateRsdAdjustment = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(280000 * mult), 0);
      const aggregateFinalForecast = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(5980000 * mult), 0);
      
      const transmissionBaseline = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(4000000 * mult), 0);
      const transmissionAmAdjusted = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(4400000 * mult), 0);
      const transmissionSmAdjustment = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(150000 * mult), 0);
      const transmissionRsdAdjustment = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(200000 * mult), 0);
      const transmissionFinalForecast = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(4750000 * mult), 0);
      
      const chassisBaseline = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(1000000 * mult), 0);
      const chassisAmAdjusted = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(1100000 * mult), 0);
      const chassisSmAdjustment = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(50000 * mult), 0);
      const chassisRsdAdjustment = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(80000 * mult), 0);
      const chassisFinalForecast = uniqueMultipliers.reduce((sum, mult) => sum + Math.round(1230000 * mult), 0);
      
      // Calculate product sums
      const productASums = {
        baseline: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(850000 * mult), 0),
        amAdjusted: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(920000 * mult), 0),
        smAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(30000 * mult), 0),
        rsdAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(45000 * mult), 0),
        finalForecast: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(995000 * mult), 0)
      };
      const productBSums = {
        baseline: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(820000 * mult), 0),
        amAdjusted: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(900000 * mult), 0),
        smAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(40000 * mult), 0),
        rsdAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(38000 * mult), 0),
        finalForecast: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(978000 * mult), 0)
      };
      const productCSums = {
        baseline: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(750000 * mult), 0),
        amAdjusted: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(830000 * mult), 0),
        smAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(28000 * mult), 0),
        rsdAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(52000 * mult), 0),
        finalForecast: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(910000 * mult), 0)
      };
      const productDSums = {
        baseline: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(680000 * mult), 0),
        amAdjusted: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(750000 * mult), 0),
        smAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(25000 * mult), 0),
        rsdAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(45000 * mult), 0),
        finalForecast: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(820000 * mult), 0)
      };
      const productESums = {
        baseline: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(500000 * mult), 0),
        amAdjusted: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(580000 * mult), 0),
        smAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(15000 * mult), 0),
        rsdAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(20000 * mult), 0),
        finalForecast: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(615000 * mult), 0)
      };
      const productFSums = {
        baseline: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(400000 * mult), 0),
        amAdjusted: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(420000 * mult), 0),
        smAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(22000 * mult), 0),
        rsdAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(0 * mult), 0),
        finalForecast: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(442000 * mult), 0)
      };
      const chassis1Sums = {
        baseline: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(380000 * mult), 0),
        amAdjusted: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(420000 * mult), 0),
        smAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(18000 * mult), 0),
        rsdAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(22000 * mult), 0),
        finalForecast: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(460000 * mult), 0)
      };
      const chassis2Sums = {
        baseline: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(330000 * mult), 0),
        amAdjusted: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(380000 * mult), 0),
        smAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(16000 * mult), 0),
        rsdAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(30000 * mult), 0),
        finalForecast: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(426000 * mult), 0)
      };
      const chassis3Sums = {
        baseline: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(290000 * mult), 0),
        amAdjusted: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(300000 * mult), 0),
        smAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(16000 * mult), 0),
        rsdAdjustment: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(28000 * mult), 0),
        finalForecast: uniqueMultipliers.reduce((sum, mult) => sum + Math.round(344000 * mult), 0)
      };
      
      // Split aggregate across Michigan and Ohio plants (60% / 40%)
      const plantSplit = { mi: 0.6, oh: 0.4 };

      return [
      {
        id: 'aggregate',
        name: includeOhio ? 'MagnaDrive North America' : 'Aggregate',
        hasChildren: true,
        baseline: aggregateBaseline,
        amAdjusted: aggregateAmAdjusted,
        smAdjustment: aggregateSmAdjustment,
        rsdAdjustment: aggregateRsdAdjustment,
        finalForecast: aggregateFinalForecast,
        children: [
          {
            id: 'magnadrive',
            name: 'MagnaDrive - Michigan Plant',
            hasChildren: true,
            baseline: Math.round(aggregateBaseline * plantSplit.mi),
            amAdjusted: Math.round(aggregateAmAdjusted * plantSplit.mi),
            smAdjustment: Math.round(aggregateSmAdjustment * plantSplit.mi),
            rsdAdjustment: Math.round(aggregateRsdAdjustment * plantSplit.mi),
            finalForecast: Math.round(aggregateFinalForecast * plantSplit.mi),
            children: [
              {
                id: 'transmission',
                name: 'Transmission Assemblies',
                hasChildren: true,
                baseline: Math.round(transmissionBaseline * plantSplit.mi),
                amAdjusted: Math.round(transmissionAmAdjusted * plantSplit.mi),
                smAdjustment: Math.round(transmissionSmAdjustment * plantSplit.mi),
                rsdAdjustment: Math.round(transmissionRsdAdjustment * plantSplit.mi),
                finalForecast: Math.round(transmissionFinalForecast * plantSplit.mi),
              children: [
                { 
                  id: 'product-1', 
                  name: 'TRN-750-A', 
                  hasChildren: false,
                  baseline: Math.round(productASums.baseline * plantSplit.mi),
                  amAdjusted: Math.round(productASums.amAdjusted * plantSplit.mi),
                  smAdjustment: Math.round(productASums.smAdjustment * plantSplit.mi),
                  rsdAdjustment: Math.round(productASums.rsdAdjustment * plantSplit.mi),
                  finalForecast: Math.round(productASums.finalForecast * plantSplit.mi)
                },
                { 
                  id: 'product-2', 
                  name: 'TRN-850-M', 
                  hasChildren: false,
                  baseline: Math.round(productBSums.baseline * plantSplit.mi),
                  amAdjusted: Math.round(productBSums.amAdjusted * plantSplit.mi),
                  smAdjustment: Math.round(productBSums.smAdjustment * plantSplit.mi),
                  rsdAdjustment: Math.round(productBSums.rsdAdjustment * plantSplit.mi),
                  finalForecast: Math.round(productBSums.finalForecast * plantSplit.mi)
                },
                { 
                  id: 'product-3', 
                  name: 'TRN-850-P', 
                  hasChildren: false,
                  baseline: Math.round(productCSums.baseline * plantSplit.mi),
                  amAdjusted: Math.round(productCSums.amAdjusted * plantSplit.mi),
                  smAdjustment: Math.round(productCSums.smAdjustment * plantSplit.mi),
                  rsdAdjustment: Math.round(productCSums.rsdAdjustment * plantSplit.mi),
                  finalForecast: Math.round(productCSums.finalForecast * plantSplit.mi)
                },
                { 
                  id: 'product-4', 
                  name: 'TRN-850-T', 
                  hasChildren: false,
                  baseline: Math.round(productDSums.baseline * plantSplit.mi),
                  amAdjusted: Math.round(productDSums.amAdjusted * plantSplit.mi),
                  smAdjustment: Math.round(productDSums.smAdjustment * plantSplit.mi),
                  rsdAdjustment: Math.round(productDSums.rsdAdjustment * plantSplit.mi),
                  finalForecast: Math.round(productDSums.finalForecast * plantSplit.mi)
                },
                { 
                  id: 'product-5', 
                  name: 'TRN-750-M', 
                  hasChildren: false,
                  baseline: Math.round(productESums.baseline * plantSplit.mi),
                  amAdjusted: Math.round(productESums.amAdjusted * plantSplit.mi),
                  smAdjustment: Math.round(productESums.smAdjustment * plantSplit.mi),
                  rsdAdjustment: Math.round(productESums.rsdAdjustment * plantSplit.mi),
                  finalForecast: Math.round(productESums.finalForecast * plantSplit.mi)
                },
                { 
                  id: 'product-6', 
                  name: 'TRN-750-X', 
                  hasChildren: false,
                  baseline: Math.round(productFSums.baseline * plantSplit.mi),
                  amAdjusted: Math.round(productFSums.amAdjusted * plantSplit.mi),
                  smAdjustment: Math.round(productFSums.smAdjustment * plantSplit.mi),
                  rsdAdjustment: Math.round(productFSums.rsdAdjustment * plantSplit.mi),
                  finalForecast: Math.round(productFSums.finalForecast * plantSplit.mi)
                },
              ],
              },
              {
                id: 'chassis',
                name: 'Chassis Components',
                hasChildren: true,
                baseline: Math.round(chassisBaseline * plantSplit.mi),
                amAdjusted: Math.round(chassisAmAdjusted * plantSplit.mi),
                smAdjustment: Math.round(chassisSmAdjustment * plantSplit.mi),
                rsdAdjustment: Math.round(chassisRsdAdjustment * plantSplit.mi),
                finalForecast: Math.round(chassisFinalForecast * plantSplit.mi),
                children: [
                  { 
                    id: 'chassis-1', 
                    name: 'Chassis Product 1', 
                    hasChildren: false,
                    baseline: Math.round(chassis1Sums.baseline * plantSplit.mi),
                    amAdjusted: Math.round(chassis1Sums.amAdjusted * plantSplit.mi),
                    smAdjustment: Math.round(chassis1Sums.smAdjustment * plantSplit.mi),
                    rsdAdjustment: Math.round(chassis1Sums.rsdAdjustment * plantSplit.mi),
                    finalForecast: Math.round(chassis1Sums.finalForecast * plantSplit.mi)
                  },
                  { 
                    id: 'chassis-2', 
                    name: 'Chassis Product 2', 
                    hasChildren: false,
                    baseline: Math.round(chassis2Sums.baseline * plantSplit.mi),
                    amAdjusted: Math.round(chassis2Sums.amAdjusted * plantSplit.mi),
                    smAdjustment: Math.round(chassis2Sums.smAdjustment * plantSplit.mi),
                    rsdAdjustment: Math.round(chassis2Sums.rsdAdjustment * plantSplit.mi),
                    finalForecast: Math.round(chassis2Sums.finalForecast * plantSplit.mi)
                  },
                  { 
                    id: 'chassis-3', 
                    name: 'Chassis Product 3', 
                    hasChildren: false,
                    baseline: Math.round(chassis3Sums.baseline * plantSplit.mi),
                    amAdjusted: Math.round(chassis3Sums.amAdjusted * plantSplit.mi),
                    smAdjustment: Math.round(chassis3Sums.smAdjustment * plantSplit.mi),
                    rsdAdjustment: Math.round(chassis3Sums.rsdAdjustment * plantSplit.mi),
                    finalForecast: Math.round(chassis3Sums.finalForecast * plantSplit.mi)
                  },
                ],
              },
            ],
          },
          ...(includeOhio ? [{
            id: 'magnadrive_oh',
            name: 'MagnaDrive - Ohio Plant',
            hasChildren: true,
            baseline: Math.round(aggregateBaseline * plantSplit.oh),
            amAdjusted: Math.round(aggregateAmAdjusted * plantSplit.oh),
            smAdjustment: Math.round(aggregateSmAdjustment * plantSplit.oh),
            rsdAdjustment: Math.round(aggregateRsdAdjustment * plantSplit.oh),
            finalForecast: Math.round(aggregateFinalForecast * plantSplit.oh),
            children: [
              {
                id: 'transmission_oh',
                name: 'Transmission Assemblies',
                hasChildren: true,
                baseline: Math.round(transmissionBaseline * plantSplit.oh),
                amAdjusted: Math.round(transmissionAmAdjusted * plantSplit.oh),
                smAdjustment: Math.round(transmissionSmAdjustment * plantSplit.oh),
                rsdAdjustment: Math.round(transmissionRsdAdjustment * plantSplit.oh),
                finalForecast: Math.round(transmissionFinalForecast * plantSplit.oh),
                children: [
                  { id: 'oh-product-1', name: 'TRN-760-A', hasChildren: false,
                    baseline: Math.round(productASums.baseline * plantSplit.oh),
                    amAdjusted: Math.round(productASums.amAdjusted * plantSplit.oh),
                    smAdjustment: Math.round(productASums.smAdjustment * plantSplit.oh),
                    rsdAdjustment: Math.round(productASums.rsdAdjustment * plantSplit.oh),
                    finalForecast: Math.round(productASums.finalForecast * plantSplit.oh) },
                  { id: 'oh-product-2', name: 'TRN-860-M', hasChildren: false,
                    baseline: Math.round(productBSums.baseline * plantSplit.oh),
                    amAdjusted: Math.round(productBSums.amAdjusted * plantSplit.oh),
                    smAdjustment: Math.round(productBSums.smAdjustment * plantSplit.oh),
                    rsdAdjustment: Math.round(productBSums.rsdAdjustment * plantSplit.oh),
                    finalForecast: Math.round(productBSums.finalForecast * plantSplit.oh) },
                  { id: 'oh-product-3', name: 'TRN-850-P', hasChildren: false,
                    baseline: Math.round(productCSums.baseline * plantSplit.oh),
                    amAdjusted: Math.round(productCSums.amAdjusted * plantSplit.oh),
                    smAdjustment: Math.round(productCSums.smAdjustment * plantSplit.oh),
                    rsdAdjustment: Math.round(productCSums.rsdAdjustment * plantSplit.oh),
                    finalForecast: Math.round(productCSums.finalForecast * plantSplit.oh) },
                  { id: 'oh-product-4', name: 'TRN-850-T', hasChildren: false,
                    baseline: Math.round(productDSums.baseline * plantSplit.oh),
                    amAdjusted: Math.round(productDSums.amAdjusted * plantSplit.oh),
                    smAdjustment: Math.round(productDSums.smAdjustment * plantSplit.oh),
                    rsdAdjustment: Math.round(productDSums.rsdAdjustment * plantSplit.oh),
                    finalForecast: Math.round(productDSums.finalForecast * plantSplit.oh) },
                  { id: 'oh-product-5', name: 'TRN-750-M', hasChildren: false,
                    baseline: Math.round(productESums.baseline * plantSplit.oh),
                    amAdjusted: Math.round(productESums.amAdjusted * plantSplit.oh),
                    smAdjustment: Math.round(productESums.smAdjustment * plantSplit.oh),
                    rsdAdjustment: Math.round(productESums.rsdAdjustment * plantSplit.oh),
                    finalForecast: Math.round(productESums.finalForecast * plantSplit.oh) },
                  { id: 'oh-product-6', name: 'TRN-750-X', hasChildren: false,
                    baseline: Math.round(productFSums.baseline * plantSplit.oh),
                    amAdjusted: Math.round(productFSums.amAdjusted * plantSplit.oh),
                    smAdjustment: Math.round(productFSums.smAdjustment * plantSplit.oh),
                    rsdAdjustment: Math.round(productFSums.rsdAdjustment * plantSplit.oh),
                    finalForecast: Math.round(productFSums.finalForecast * plantSplit.oh) },
                ]
              },
              {
                id: 'chassis_oh',
                name: 'Chassis Components',
                hasChildren: true,
                baseline: Math.round(chassisBaseline * plantSplit.oh),
                amAdjusted: Math.round(chassisAmAdjusted * plantSplit.oh),
                smAdjustment: Math.round(chassisSmAdjustment * plantSplit.oh),
                rsdAdjustment: Math.round(chassisRsdAdjustment * plantSplit.oh),
                finalForecast: Math.round(chassisFinalForecast * plantSplit.oh),
                children: [
                  { id: 'oh-chassis-1', name: 'Chassis Product A', hasChildren: false,
                    baseline: Math.round(chassis1Sums.baseline * plantSplit.oh),
                    amAdjusted: Math.round(chassis1Sums.amAdjusted * plantSplit.oh),
                    smAdjustment: Math.round(chassis1Sums.smAdjustment * plantSplit.oh),
                    rsdAdjustment: Math.round(chassis1Sums.rsdAdjustment * plantSplit.oh),
                    finalForecast: Math.round(chassis1Sums.finalForecast * plantSplit.oh) },
                  { id: 'oh-chassis-2', name: 'Chassis Product B', hasChildren: false,
                    baseline: Math.round(chassis2Sums.baseline * plantSplit.oh),
                    amAdjusted: Math.round(chassis2Sums.amAdjusted * plantSplit.oh),
                    smAdjustment: Math.round(chassis2Sums.smAdjustment * plantSplit.oh),
                    rsdAdjustment: Math.round(chassis2Sums.rsdAdjustment * plantSplit.oh),
                    finalForecast: Math.round(chassis2Sums.finalForecast * plantSplit.oh) },
                  { id: 'oh-chassis-3', name: 'Chassis Product C', hasChildren: false,
                    baseline: Math.round(chassis3Sums.baseline * plantSplit.oh),
                    amAdjusted: Math.round(chassis3Sums.amAdjusted * plantSplit.oh),
                    smAdjustment: Math.round(chassis3Sums.smAdjustment * plantSplit.oh),
                    rsdAdjustment: Math.round(chassis3Sums.rsdAdjustment * plantSplit.oh),
                    finalForecast: Math.round(chassis3Sums.finalForecast * plantSplit.oh) },
                ]
              }
            ]
          }] : []),
        ],
      },
      ];
    }
    
    // Add seasonal variations - unique multiplier for each month
    const monthIndex = months.indexOf(month);
    // Array of unique multipliers for each month (varying from 0.85 to 1.20)
    const uniqueMultipliers = [
      1.15, // January
      0.92, // February
      1.05, // March
      1.18, // April
      0.88, // May
      1.10, // June
      1.20, // July
      0.85, // August
      1.12, // September
      0.95, // October
      1.08, // November
      1.00, // December
    ];
    const seasonalMultiplier = monthIndex >= 0 ? uniqueMultipliers[monthIndex] : 1.0;
    
    // Split aggregate across Michigan and Ohio plants (60% / 40%) for monthly
    const plantSplit = { mi: 0.6, oh: 0.4 };

    return [
    {
      id: 'aggregate',
      name: includeOhio ? 'MagnaDrive North America' : 'Aggregate',
      hasChildren: true,
      baseline: Math.round(5000000 * seasonalMultiplier),
      amAdjusted: Math.round(5500000 * seasonalMultiplier),
      smAdjustment: Math.round(200000 * seasonalMultiplier),
      rsdAdjustment: Math.round(280000 * seasonalMultiplier),
      finalForecast: Math.round(5980000 * seasonalMultiplier),
      children: [
        {
          id: 'magnadrive',
          name: 'MagnaDrive - Michigan Plant',
          hasChildren: true,
          baseline: Math.round(5000000 * seasonalMultiplier * plantSplit.mi),
          amAdjusted: Math.round(5500000 * seasonalMultiplier * plantSplit.mi),
          smAdjustment: Math.round(200000 * seasonalMultiplier * plantSplit.mi),
          rsdAdjustment: Math.round(280000 * seasonalMultiplier * plantSplit.mi),
          finalForecast: Math.round(5980000 * seasonalMultiplier * plantSplit.mi),
          children: [
            {
              id: 'transmission',
              name: 'Transmission Assemblies',
              hasChildren: true,
              baseline: Math.round(4000000 * seasonalMultiplier * plantSplit.mi),
              amAdjusted: Math.round(4400000 * seasonalMultiplier * plantSplit.mi),
              smAdjustment: Math.round(150000 * seasonalMultiplier * plantSplit.mi),
              rsdAdjustment: Math.round(200000 * seasonalMultiplier * plantSplit.mi),
              finalForecast: Math.round(4750000 * seasonalMultiplier * plantSplit.mi),
              children: [
                { 
                  id: 'product-1', 
                  name: 'TRN-750-A', 
                  hasChildren: false,
                  baseline: Math.round(850000 * seasonalMultiplier * plantSplit.mi),
                  amAdjusted: Math.round(920000 * seasonalMultiplier * plantSplit.mi),
                  smAdjustment: Math.round(30000 * seasonalMultiplier * plantSplit.mi),
                  rsdAdjustment: Math.round(45000 * seasonalMultiplier * plantSplit.mi),
                  finalForecast: Math.round(995000 * seasonalMultiplier * plantSplit.mi)
                },
                { 
                  id: 'product-2', 
                  name: 'TRN-850-M', 
                  hasChildren: false,
                  baseline: Math.round(820000 * seasonalMultiplier * plantSplit.mi),
                  amAdjusted: Math.round(900000 * seasonalMultiplier * plantSplit.mi),
                  smAdjustment: Math.round(40000 * seasonalMultiplier * plantSplit.mi),
                  rsdAdjustment: Math.round(38000 * seasonalMultiplier * plantSplit.mi),
                  finalForecast: Math.round(978000 * seasonalMultiplier * plantSplit.mi)
                },
                { 
                  id: 'product-3', 
                  name: 'TRN-850-P', 
                  hasChildren: false,
                  baseline: Math.round(750000 * seasonalMultiplier),
                  amAdjusted: Math.round(830000 * seasonalMultiplier),
                  smAdjustment: Math.round(28000 * seasonalMultiplier),
                  rsdAdjustment: Math.round(52000 * seasonalMultiplier),
                  finalForecast: Math.round(910000 * seasonalMultiplier)
                },
                { 
                  id: 'product-4', 
                  name: 'TRN-850-T', 
                  hasChildren: false,
                  baseline: Math.round(680000 * seasonalMultiplier),
                  amAdjusted: Math.round(750000 * seasonalMultiplier),
                  smAdjustment: Math.round(25000 * seasonalMultiplier),
                  rsdAdjustment: Math.round(45000 * seasonalMultiplier),
                  finalForecast: Math.round(820000 * seasonalMultiplier)
                },
                { 
                  id: 'product-5', 
                  name: 'TRN-750-M', 
                  hasChildren: false,
                  baseline: Math.round(500000 * seasonalMultiplier),
                  amAdjusted: Math.round(580000 * seasonalMultiplier),
                  smAdjustment: Math.round(15000 * seasonalMultiplier),
                  rsdAdjustment: Math.round(20000 * seasonalMultiplier),
                  finalForecast: Math.round(615000 * seasonalMultiplier)
                },
                { 
                  id: 'product-6', 
                  name: 'TRN-750-X', 
                  hasChildren: false,
                  baseline: Math.round(400000 * seasonalMultiplier),
                  amAdjusted: Math.round(420000 * seasonalMultiplier),
                  smAdjustment: Math.round(22000 * seasonalMultiplier),
                  rsdAdjustment: Math.round(0 * seasonalMultiplier),
                  finalForecast: Math.round(442000 * seasonalMultiplier)
                },
              ],
            },
            {
              id: 'chassis',
              name: 'Chassis Components',
              hasChildren: true,
              baseline: Math.round(1000000 * seasonalMultiplier * plantSplit.mi),
              amAdjusted: Math.round(1100000 * seasonalMultiplier * plantSplit.mi),
              smAdjustment: Math.round(50000 * seasonalMultiplier * plantSplit.mi),
              rsdAdjustment: Math.round(80000 * seasonalMultiplier * plantSplit.mi),
              finalForecast: Math.round(1230000 * seasonalMultiplier * plantSplit.mi),
              children: [
                { 
                  id: 'chassis-1', 
                  name: 'Chassis Product 1', 
                  hasChildren: false,
                  baseline: Math.round(380000 * seasonalMultiplier * plantSplit.mi),
                  amAdjusted: Math.round(420000 * seasonalMultiplier * plantSplit.mi),
                  smAdjustment: Math.round(18000 * seasonalMultiplier * plantSplit.mi),
                  rsdAdjustment: Math.round(22000 * seasonalMultiplier * plantSplit.mi),
                  finalForecast: Math.round(460000 * seasonalMultiplier * plantSplit.mi)
                },
                { 
                  id: 'chassis-2', 
                  name: 'Chassis Product 2', 
                  hasChildren: false,
                  baseline: Math.round(330000 * seasonalMultiplier * plantSplit.mi),
                  amAdjusted: Math.round(380000 * seasonalMultiplier * plantSplit.mi),
                  smAdjustment: Math.round(16000 * seasonalMultiplier * plantSplit.mi),
                  rsdAdjustment: Math.round(30000 * seasonalMultiplier * plantSplit.mi),
                  finalForecast: Math.round(426000 * seasonalMultiplier * plantSplit.mi)
                },
                { 
                  id: 'chassis-3', 
                  name: 'Chassis Product 3', 
                  hasChildren: false,
                  baseline: Math.round(290000 * seasonalMultiplier * plantSplit.mi),
                  amAdjusted: Math.round(300000 * seasonalMultiplier * plantSplit.mi),
                  smAdjustment: Math.round(16000 * seasonalMultiplier * plantSplit.mi),
                  rsdAdjustment: Math.round(28000 * seasonalMultiplier * plantSplit.mi),
                  finalForecast: Math.round(344000 * seasonalMultiplier * plantSplit.mi)
                },
              ],
            },
          ],
        },
        ...(includeOhio ? [{
          id: 'magnadrive_oh',
          name: 'MagnaDrive - Ohio Plant',
          hasChildren: true,
          baseline: Math.round(5000000 * seasonalMultiplier * plantSplit.oh),
          amAdjusted: Math.round(5500000 * seasonalMultiplier * plantSplit.oh),
          smAdjustment: Math.round(200000 * seasonalMultiplier * plantSplit.oh),
          rsdAdjustment: Math.round(280000 * seasonalMultiplier * plantSplit.oh),
          finalForecast: Math.round(5980000 * seasonalMultiplier * plantSplit.oh),
          children: [
            {
              id: 'transmission_oh',
              name: 'Transmission Assemblies',
              hasChildren: true,
              baseline: Math.round(4000000 * seasonalMultiplier * plantSplit.oh),
              amAdjusted: Math.round(4400000 * seasonalMultiplier * plantSplit.oh),
              smAdjustment: Math.round(150000 * seasonalMultiplier * plantSplit.oh),
              rsdAdjustment: Math.round(200000 * seasonalMultiplier * plantSplit.oh),
              finalForecast: Math.round(4750000 * seasonalMultiplier * plantSplit.oh),
              children: [
                { id: 'oh-product-1', name: 'TRN-760-A', hasChildren: false,
                  baseline: Math.round(850000 * seasonalMultiplier * plantSplit.oh),
                  amAdjusted: Math.round(920000 * seasonalMultiplier * plantSplit.oh),
                  smAdjustment: Math.round(30000 * seasonalMultiplier * plantSplit.oh),
                  rsdAdjustment: Math.round(45000 * seasonalMultiplier * plantSplit.oh),
                  finalForecast: Math.round(995000 * seasonalMultiplier * plantSplit.oh) },
                { id: 'oh-product-2', name: 'TRN-860-M', hasChildren: false,
                  baseline: Math.round(820000 * seasonalMultiplier * plantSplit.oh),
                  amAdjusted: Math.round(900000 * seasonalMultiplier * plantSplit.oh),
                  smAdjustment: Math.round(40000 * seasonalMultiplier * plantSplit.oh),
                  rsdAdjustment: Math.round(38000 * seasonalMultiplier * plantSplit.oh),
                  finalForecast: Math.round(978000 * seasonalMultiplier * plantSplit.oh) },
                { id: 'oh-product-3', name: 'TRN-850-P', hasChildren: false,
                  baseline: Math.round(750000 * seasonalMultiplier * plantSplit.oh),
                  amAdjusted: Math.round(830000 * seasonalMultiplier * plantSplit.oh),
                  smAdjustment: Math.round(28000 * seasonalMultiplier * plantSplit.oh),
                  rsdAdjustment: Math.round(52000 * seasonalMultiplier * plantSplit.oh),
                  finalForecast: Math.round(910000 * seasonalMultiplier * plantSplit.oh) },
                { id: 'oh-product-4', name: 'TRN-850-T', hasChildren: false,
                  baseline: Math.round(680000 * seasonalMultiplier * plantSplit.oh),
                  amAdjusted: Math.round(750000 * seasonalMultiplier * plantSplit.oh),
                  smAdjustment: Math.round(25000 * seasonalMultiplier * plantSplit.oh),
                  rsdAdjustment: Math.round(45000 * seasonalMultiplier * plantSplit.oh),
                  finalForecast: Math.round(820000 * seasonalMultiplier * plantSplit.oh) },
                { id: 'oh-product-5', name: 'TRN-750-M', hasChildren: false,
                  baseline: Math.round(500000 * seasonalMultiplier * plantSplit.oh),
                  amAdjusted: Math.round(580000 * seasonalMultiplier * plantSplit.oh),
                  smAdjustment: Math.round(15000 * seasonalMultiplier * plantSplit.oh),
                  rsdAdjustment: Math.round(20000 * seasonalMultiplier * plantSplit.oh),
                  finalForecast: Math.round(615000 * seasonalMultiplier * plantSplit.oh) },
                { id: 'oh-product-6', name: 'TRN-750-X', hasChildren: false,
                  baseline: Math.round(400000 * seasonalMultiplier * plantSplit.oh),
                  amAdjusted: Math.round(420000 * seasonalMultiplier * plantSplit.oh),
                  smAdjustment: Math.round(22000 * seasonalMultiplier * plantSplit.oh),
                  rsdAdjustment: Math.round(0 * seasonalMultiplier * plantSplit.oh),
                  finalForecast: Math.round(442000 * seasonalMultiplier * plantSplit.oh) },
              ]
            },
            {
              id: 'chassis_oh',
              name: 'Chassis Components',
              hasChildren: true,
              baseline: Math.round(1000000 * seasonalMultiplier * plantSplit.oh),
              amAdjusted: Math.round(1100000 * seasonalMultiplier * plantSplit.oh),
              smAdjustment: Math.round(50000 * seasonalMultiplier * plantSplit.oh),
              rsdAdjustment: Math.round(80000 * seasonalMultiplier * plantSplit.oh),
              finalForecast: Math.round(1230000 * seasonalMultiplier * plantSplit.oh),
              children: [
                { id: 'oh-chassis-1', name: 'Chassis Product A', hasChildren: false,
                  baseline: Math.round(380000 * seasonalMultiplier * plantSplit.oh),
                  amAdjusted: Math.round(420000 * seasonalMultiplier * plantSplit.oh),
                  smAdjustment: Math.round(18000 * seasonalMultiplier * plantSplit.oh),
                  rsdAdjustment: Math.round(22000 * seasonalMultiplier * plantSplit.oh),
                  finalForecast: Math.round(460000 * seasonalMultiplier * plantSplit.oh) },
                { id: 'oh-chassis-2', name: 'Chassis Product B', hasChildren: false,
                  baseline: Math.round(330000 * seasonalMultiplier * plantSplit.oh),
                  amAdjusted: Math.round(380000 * seasonalMultiplier * plantSplit.oh),
                  smAdjustment: Math.round(16000 * seasonalMultiplier * plantSplit.oh),
                  rsdAdjustment: Math.round(30000 * seasonalMultiplier * plantSplit.oh),
                  finalForecast: Math.round(426000 * seasonalMultiplier * plantSplit.oh) },
                { id: 'oh-chassis-3', name: 'Chassis Product C', hasChildren: false,
                  baseline: Math.round(290000 * seasonalMultiplier * plantSplit.oh),
                  amAdjusted: Math.round(300000 * seasonalMultiplier * plantSplit.oh),
                  smAdjustment: Math.round(16000 * seasonalMultiplier * plantSplit.oh),
                  rsdAdjustment: Math.round(28000 * seasonalMultiplier * plantSplit.oh),
                  finalForecast: Math.round(344000 * seasonalMultiplier * plantSplit.oh) },
              ]
            },
          ]
        }] : []),
      ],
    },
    ];
  };

  // Transform data structure based on hierarchy order (Account, Product vs Product, Account)
  const transformDataByHierarchyOrder = (data, hierarchyOrder) => {
    if (!hierarchyOrder || !Array.isArray(data) || data.length === 0) {
      return data; // Return original if no transformation needed
    }

    const aggregate = data[0];
    if (!aggregate || !aggregate.children) return data;


    if (hierarchyOrder === 'Account, Product') {
      // Level 1: MagnaDrive North America
      //   Level 2: MagnaDrive - Michigan Plant / MagnaDrive - Ohio Plant
      //     Level 3: Transmission Assemblies / Chassis Components
      //       Level 4: Individual products
      
      // Start with MagnaDrive North America as the root
      const northAmerica = {
        id: aggregate.id,
        name: aggregate.name,
        hasChildren: true,
        baseline: aggregate.baseline,
        amAdjusted: aggregate.amAdjusted,
        smAdjustment: aggregate.smAdjustment,
        rsdAdjustment: aggregate.rsdAdjustment,
        finalForecast: aggregate.finalForecast,
        children: []
      };

      // Process each plant (Michigan and Ohio) as children of North America
      aggregate.children.forEach(plant => {
        const plantNode = {
          id: plant.id,
          name: plant.name,
          hasChildren: true,
          baseline: plant.baseline || 0,
          amAdjusted: plant.amAdjusted || 0,
          smAdjustment: plant.smAdjustment || 0,
          rsdAdjustment: plant.rsdAdjustment || 0,
          finalForecast: plant.finalForecast || 0,
          children: []
        };

        // Attach product categories (Transmission Assemblies, Chassis Components) to each plant
        if (plant.children) {
          plant.children.forEach(productCategory => {
            plantNode.children.push({
              id: productCategory.id,
              name: productCategory.name,
              hasChildren: productCategory.hasChildren,
              baseline: productCategory.baseline || 0,
              amAdjusted: productCategory.amAdjusted || 0,
              smAdjustment: productCategory.smAdjustment || 0,
              rsdAdjustment: productCategory.rsdAdjustment || 0,
              finalForecast: productCategory.finalForecast || 0,
              children: productCategory.children?.map(product => ({
                ...product,
                id: `${product.id}-${plant.id}` // Unique ID to avoid conflicts
              })) || []
            });
          });
        }

        northAmerica.children.push(plantNode);
      });

      return [northAmerica];
    } else if (hierarchyOrder === 'Product, Account') {
      // Level 1: Transmission Assemblies / Chassis Components (categories)
      //   Level 2: Individual products (TRN-750-A, TRN-850-M, etc. for Transmission; CC products for Chassis)
      //     Level 3: MagnaDrive North America (when product is opened)
      //       Level 4: MagnaDrive - Michigan Plant / MagnaDrive - Ohio Plant (when North America is opened)
      
      const productCategories = [];
      
      // First, collect unique product categories across all plants
      // Use category name as key since IDs differ between plants (transmission vs transmission_oh)
      const categoryMap = new Map();
      
      aggregate.children.forEach(plant => {
        if (plant.children) {
          plant.children.forEach(productCategory => {
            const categoryName = productCategory.name; // Use name as key since it's consistent
            
            if (!categoryMap.has(categoryName)) {
              // Calculate aggregate values for this category across all plants
              let totalBaseline = 0;
              let totalAmAdjusted = 0;
              let totalSmAdjustment = 0;
              let totalRsdAdjustment = 0;
              let totalFinalForecast = 0;
              
              aggregate.children.forEach(p => {
                // Find category by name (not ID) since IDs differ
                const cat = p.children?.find(c => c.name === categoryName);
                if (cat) {
                  totalBaseline += cat.baseline || 0;
                  totalAmAdjusted += cat.amAdjusted || 0;
                  totalSmAdjustment += cat.smAdjustment || 0;
                  totalRsdAdjustment += cat.rsdAdjustment || 0;
                  totalFinalForecast += cat.finalForecast || 0;
                }
              });
              
              // Use a normalized ID (base category name without plant suffix)
              // For transmission -> 'transmission', for transmission_oh -> 'transmission'
              const normalizedId = categoryName === 'Transmission Assemblies' ? 'transmission' : 
                                   categoryName === 'Chassis Components' ? 'chassis' : 
                                   productCategory.id.replace('_oh', '');
              
              categoryMap.set(categoryName, {
                id: normalizedId,
                name: categoryName,
                hasChildren: true,
                baseline: totalBaseline,
                amAdjusted: totalAmAdjusted,
                smAdjustment: totalSmAdjustment,
                rsdAdjustment: totalRsdAdjustment,
                finalForecast: totalFinalForecast,
                children: []
              });
            }
          });
        }
      });

      // Build the hierarchy: Category -> Products -> Accounts
      Array.from(categoryMap.values()).forEach(productCategory => {
        // Collect all unique products from this category across all plants
        const productMap = new Map();
        
        aggregate.children.forEach(plant => {
          // Find category by name (not ID) since IDs differ between plants
          const originalProductCategory = plant.children?.find(p => p.name === productCategory.name);
          
          if (originalProductCategory && originalProductCategory.children) {
            originalProductCategory.children.forEach(product => {
              const productName = product.name;
              
              if (!productMap.has(productName)) {
                // Calculate aggregate values for this product across all plants
                let totalBaseline = 0;
                let totalAmAdjusted = 0;
                let totalSmAdjustment = 0;
                let totalRsdAdjustment = 0;
                let totalFinalForecast = 0;
                
                aggregate.children.forEach(p => {
                  // Find category by name
                  const cat = p.children?.find(c => c.name === productCategory.name);
                  const prod = cat?.children?.find(pr => pr.name === productName);
                  if (prod) {
                    totalBaseline += prod.baseline || 0;
                    totalAmAdjusted += prod.amAdjusted || 0;
                    totalSmAdjustment += prod.smAdjustment || 0;
                    totalRsdAdjustment += prod.rsdAdjustment || 0;
                    totalFinalForecast += prod.finalForecast || 0;
                  }
                });
                
                // Create unique ID combining category and product name to avoid duplicates
                // Format: {categoryId}-{productName} or use a hash of category+product
                const uniqueProductId = `${productCategory.id}-${productName}`.replace(/\s+/g, '-').toLowerCase();
                
                productMap.set(productName, {
                  id: uniqueProductId, // Use unique ID based on category + product name
                  name: productName,
                  hasChildren: true, // Will have accounts as children
                  baseline: totalBaseline,
                  amAdjusted: totalAmAdjusted,
                  smAdjustment: totalSmAdjustment,
                  rsdAdjustment: totalRsdAdjustment,
                  finalForecast: totalFinalForecast,
                  children: []
                });
              }
            });
          }
        });

        // For each product, attach account hierarchy as children
        Array.from(productMap.values()).forEach(product => {
          // First collect all plant values
          const plantNodes = [];
          
          aggregate.children.forEach(plant => {
            // Find category by name (not ID)
            const originalProductCategory = plant.children?.find(p => p.name === productCategory.name);
            const originalProduct = originalProductCategory?.children?.find(p => p.name === product.name);
            
            if (originalProduct) {
              // Make plant ID unique per product to avoid duplicate selections
              // Format: {productId}-{plantId}
              const uniquePlantId = `${product.id}-${plant.id}`;
              
              plantNodes.push({
                id: uniquePlantId,
                name: plant.name,
                hasChildren: false,
                baseline: originalProduct.baseline || 0,
                amAdjusted: originalProduct.amAdjusted || 0,
                smAdjustment: originalProduct.smAdjustment || 0,
                rsdAdjustment: originalProduct.rsdAdjustment || 0,
                finalForecast: originalProduct.finalForecast || 0
              });
            }
          });

          // Calculate North America totals as sum of all plants
          const northAmericaTotal = plantNodes.reduce((acc, plant) => ({
            baseline: acc.baseline + (plant.baseline || 0),
            amAdjusted: acc.amAdjusted + (plant.amAdjusted || 0),
            smAdjustment: acc.smAdjustment + (plant.smAdjustment || 0),
            rsdAdjustment: acc.rsdAdjustment + (plant.rsdAdjustment || 0),
            finalForecast: acc.finalForecast + (plant.finalForecast || 0)
          }), { baseline: 0, amAdjusted: 0, smAdjustment: 0, rsdAdjustment: 0, finalForecast: 0 });

          // Update product totals to match North America totals (ensure consistency)
          // This ensures the product row shows the correct sum
          product.baseline = northAmericaTotal.baseline;
          product.amAdjusted = northAmericaTotal.amAdjusted;
          product.smAdjustment = northAmericaTotal.smAdjustment;
          product.rsdAdjustment = northAmericaTotal.rsdAdjustment;
          product.finalForecast = northAmericaTotal.finalForecast;

          // Create MagnaDrive North America as a child of the product
          // Use unique ID by appending product ID to avoid duplicates when same product appears under different categories
          const northAmerica = {
            id: `${aggregate.id}-${product.id}`,
            name: aggregate.name,
            hasChildren: true,
            baseline: northAmericaTotal.baseline,
            amAdjusted: northAmericaTotal.amAdjusted,
            smAdjustment: northAmericaTotal.smAdjustment,
            rsdAdjustment: northAmericaTotal.rsdAdjustment,
            finalForecast: northAmericaTotal.finalForecast,
            children: plantNodes
          };

          // Attach North America as a child of the product
          product.children = [northAmerica];
        });

        // Attach all products as children of the product category
        productCategory.children = Array.from(productMap.values());
        productCategories.push(productCategory);
      });

      // For "Product, Account" order, return product categories at root level (not wrapped in aggregate)
      return productCategories;
    }

    return data; // Return original if hierarchy order not recognized
  };

  // Helper function to determine the hierarchy level type of a row
  const getRowLevelType = (row, hierarchyOrder) => {
    if (!row || !row.name) return null;
    
    const name = row.name.toLowerCase().trim();
    
    // CRITICAL: Check for Child Account (Plants: Michigan, Ohio) FIRST
    // This must come before Parent Account check because plant rows also have id === 'magnadrive'
    // Match plant names: "MagnaDrive - Michigan Plant", "MagnaDrive - Michigan Powertrain Plant", etc.
    // When lowercased: "magnadrive - michigan plant", "magnadrive - michigan powertrain plant"
    if (name.includes('magnadrive') && (name.includes('michigan') || name.includes('ohio'))) {
      // If it has "magnadrive" + "michigan"/"ohio" + ("plant" OR "powertrain"), it's a plant
      if (name.includes('plant') || name.includes('powertrain')) {
        return 'Child Account';
      }
    }
    // Also check for patterns without "magnadrive" prefix
    if ((name.includes('michigan') || name.includes('ohio')) && 
        (name.includes('plant') || name.includes('powertrain'))) {
      return 'Child Account';
    }
    
    // Check for Parent Account (MagnaDrive North America)
    // Only check id === 'magnadrive' if it's NOT a plant (which we already checked above)
    // Also check for IDs that start with 'aggregate-' which are created in Product, Account view
    if (name.includes('magnadrive north america') || 
        row.id === 'aggregate' ||
        (row.id && typeof row.id === 'string' && row.id.startsWith('aggregate-')) ||
        (row.id === 'magnadrive' && !name.includes('michigan') && !name.includes('ohio')) ||
        (row.hasChildren === true && name.includes('north america'))) {
      return 'Parent Account';
    }
    
    // Check for Category (Transmission Assemblies, Chassis Components)
    // These are parent nodes that contain products
    if (name.includes('transmission assemblies') || 
        name.includes('chassis components')) {
      return 'Category';
    }
    
    // Check for Product
    // Products can be:
    // 1. Leaf nodes (hasChildren === false) that start with TRN- or CC- (in "Account, Product" view)
    // 2. Parent nodes (hasChildren === true) that start with TRN- or CC- (in "Product, Account" view, where products have accounts as children)
    // Check by name pattern first, regardless of hasChildren
    const isProductByName = name.startsWith('trn-') || 
                            name.startsWith('cc-') || 
                            name.includes('chassis product') || 
                            (name.includes('product') && (name.includes('a') || name.includes('b') || name.includes('c') || name.includes('1') || name.includes('2') || name.includes('3') || /^(trn|cc)-/i.test(name))) ||
                            // Also check by ID pattern for chassis products
                            (row.id && (row.id.includes('chassis-') || row.id.includes('oh-chassis-')));
    
    if (isProductByName) {
      return 'Product';
    }
    
    // Legacy check: If it's a leaf node and matches product patterns, it's definitely a product
    if (row.hasChildren === false && isProductByName) {
      return 'Product';
    }
    
    // Additional check for intermediate categories
    // If it's a parent node that doesn't match account or known categories, it might be a category
    // But this should be more conservative - only if we're confident
    if (row.hasChildren === true && 
        !name.includes('magnadrive') && 
        !name.includes('north america') &&
        !name.startsWith('trn-') && 
        !name.startsWith('cc-') &&
        name !== 'aggregate') {
      // Could be a category or intermediate level
      // For now, return null and let the filtering logic handle it
      return null;
    }
    
    return null;
  };
  
  // Helper function to aggregate metrics from children
  const aggregateMetrics = (children) => {
    if (!children || children.length === 0) {
      return {
        baseline: 0,
        amAdjusted: 0,
        smAdjustment: 0,
        rsdAdjustment: 0,
        finalForecast: 0
      };
    }
    
    return children.reduce((acc, child) => {
      return {
        baseline: (acc.baseline || 0) + (child.baseline || 0),
        amAdjusted: (acc.amAdjusted || 0) + (child.amAdjusted || 0),
        smAdjustment: (acc.smAdjustment || 0) + (child.smAdjustment || 0),
        rsdAdjustment: (acc.rsdAdjustment || 0) + (child.rsdAdjustment || 0),
        finalForecast: (acc.finalForecast || 0) + (child.finalForecast || 0)
      };
    }, {
      baseline: 0,
      amAdjusted: 0,
      smAdjustment: 0,
      rsdAdjustment: 0,
      finalForecast: 0
    });
  };


  // Helper function to filter data by selected levels and aggregate when levels are disabled
  const filterDataByLevels = (dataArray, selectedLevelsSet, hierarchyOrder, parentPath = []) => {
    if (!dataArray || !Array.isArray(dataArray)) return [];
    
    // If no levels selected, return empty array
    if (!selectedLevelsSet || selectedLevelsSet.size === 0) {
      return [];
    }
    
    const result = [];
    
    for (const row of dataArray) {
      if (!row || !row.name) continue;
      
      const rowLevelType = getRowLevelType(row, hierarchyOrder);
      // Build current path including this row
      const currentPath = [...parentPath, { id: row.id, name: row.name, levelType: rowLevelType }];
      
      // If this row's level type is disabled (not selected), skip it and process its children
      // The children will be attached to this row's parent
      if (rowLevelType && !selectedLevelsSet.has(rowLevelType)) {
        // This level is disabled - process its children and add them directly to result (skip this row)
        // Do NOT include this row itself - it should be completely skipped
        if (row.children && row.children.length > 0) {
          // Recursively process children, including the disabled level in the path
          const processedChildren = filterDataByLevels(row.children, selectedLevelsSet, hierarchyOrder, currentPath);
          
          // Add processed children directly to result (skip this disabled level row)
          // This attaches children to the parent level, skipping the disabled intermediate level
          result.push(...processedChildren);
        }
        // No children, skip this disabled row completely (don't add anything to result)
        continue;
      }
      
      // If row level type is null/undefined, check if it might be a disabled level by pattern matching
      // BEFORE processing children, check if this unidentified row is actually a disabled plant/category
      if (!rowLevelType) {
        const rowName = row.name?.toLowerCase() || '';
        const mightBePlant = (rowName.includes('michigan') || rowName.includes('ohio')) && 
                             (rowName.includes('plant') || rowName.includes('powertrain') || rowName.includes('magnadrive'));
        const mightBeCategory = rowName.includes('transmission') || rowName.includes('chassis');
        
        // If it's a plant and Child Account is disabled, skip it and only process its children
        if (mightBePlant && !selectedLevelsSet.has('Child Account')) {
          if (row.children && row.children.length > 0) {
            const processedChildren = filterDataByLevels(row.children, selectedLevelsSet, hierarchyOrder, currentPath);
            result.push(...processedChildren);
          }
          continue; // Skip this plant row completely
        }
        
        // If it's a category and Category is disabled, skip it and only process its children
        if (mightBeCategory && !selectedLevelsSet.has('Category')) {
          if (row.children && row.children.length > 0) {
            const processedChildren = filterDataByLevels(row.children, selectedLevelsSet, hierarchyOrder, currentPath);
            result.push(...processedChildren);
          }
          continue; // Skip this category row completely
        }
      }
      
      // Process children recursively - this will handle disabled levels in the children
      let processedChildren = [];
      if (row.children && row.children.length > 0) {
        const allProcessedChildren = [];
        
        // CRITICAL: Process ALL children, but skip disabled-level rows and only process their children
        for (const child of row.children) {
          // Skip null/undefined children
          if (!child || !child.name) continue;
          
          const childLevelType = getRowLevelType(child, hierarchyOrder);
          
          // ULTRA-EARLY CHECK: If this is a plant and Child Account is disabled, skip immediately
          // Use explicit string comparison to be absolutely sure
          if (childLevelType === 'Child Account' && !selectedLevelsSet.has('Child Account')) {
            // This is a disabled plant - process its children directly, skip the plant itself
            if (child.children && child.children.length > 0) {
              const childPath = [...currentPath, { id: child.id, name: child.name, levelType: childLevelType }];
              const skippedLevelChildren = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, childPath);
              // CRITICAL: Filter out any plant rows that might have been returned from recursive call
              const filteredSkippedChildren = skippedLevelChildren.filter(grandChild => {
                if (!grandChild || !grandChild.name) return false;
                const grandChildLevelType = getRowLevelType(grandChild, hierarchyOrder);
                if (grandChildLevelType === 'Child Account' && !selectedLevelsSet.has('Child Account')) {
                  return false; // Remove any plant rows
                }
                return true;
              });
              allProcessedChildren.push(...filteredSkippedChildren);
            }
            continue; // Skip this plant row completely
          }
          
          // If this child is a disabled level (e.g., plant when Child Account is disabled), skip it and only process its children
          if (childLevelType && !selectedLevelsSet.has(childLevelType)) {
            // This is a disabled child - process its children directly, skip the child itself
            if (child.children && child.children.length > 0) {
              const childPath = [...currentPath, { id: child.id, name: child.name, levelType: childLevelType }];
              const skippedLevelChildren = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, childPath);
              allProcessedChildren.push(...skippedLevelChildren);
            }
            // Skip this disabled child completely - don't process it further
            continue;
          }
          
          // Check for unidentified plant/category rows
          if (!childLevelType) {
            const childName = child.name?.toLowerCase() || '';
            const mightBePlant = (childName.includes('michigan') || childName.includes('ohio')) && 
                                 (childName.includes('plant') || childName.includes('powertrain') || childName.includes('magnadrive'));
            const mightBeCategory = childName.includes('transmission') || childName.includes('chassis');
            
            // If it's a plant and Child Account is disabled, skip it and only process its children
            if (mightBePlant && !selectedLevelsSet.has('Child Account')) {
              if (child.children && child.children.length > 0) {
                const childPath = [...currentPath, { id: child.id, name: child.name, levelType: null }];
                const skippedLevelChildren = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, childPath);
                allProcessedChildren.push(...skippedLevelChildren);
              }
              continue; // Skip this plant row
            }
            
            // If it's a category and Category is disabled, skip it and only process its children
            if (mightBeCategory && !selectedLevelsSet.has('Category')) {
              if (child.children && child.children.length > 0) {
                const childPath = [...currentPath, { id: child.id, name: child.name, levelType: null }];
                const skippedLevelChildren = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, childPath);
                allProcessedChildren.push(...skippedLevelChildren);
              }
              continue; // Skip this category row
            }
          }
          
          // This child is enabled (or unidentified but not a disabled plant/category), process it recursively
          // Note: childLevelType was already determined above and checked - at this point we know:
          // 1. Either childLevelType is enabled (in selectedLevelsSet), OR
          // 2. childLevelType is null/undefined and it's not a disabled plant/category
          // So we can safely process it recursively
          
          // Process the enabled child recursively
          if (!childLevelType) {
            // Child level type is not identified - check if it might be a disabled level by pattern matching
            const childName = child.name?.toLowerCase() || '';
            const mightBePlant = (childName.includes('michigan') || childName.includes('ohio')) && 
                                 (childName.includes('plant') || childName.includes('powertrain') || childName.includes('magnadrive'));
            const mightBeCategory = childName.includes('transmission') || childName.includes('chassis');
            
            // If it looks like a plant and Child Account is disabled, skip it
            if (mightBePlant && !selectedLevelsSet.has('Child Account') && child.children && child.children.length > 0) {
              const childPath = [...currentPath, { id: child.id, name: child.name, levelType: null }];
              const skippedLevelChildren = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, childPath);
              allProcessedChildren.push(...skippedLevelChildren);
            } else if (mightBeCategory && !selectedLevelsSet.has('Category') && child.children && child.children.length > 0) {
              // If it looks like a category and Category is disabled, skip it
              const childPath = [...currentPath, { id: child.id, name: child.name, levelType: null }];
              const skippedLevelChildren = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, childPath);
              allProcessedChildren.push(...skippedLevelChildren);
            } else {
              // Unidentified child - process it normally
              const childPath = [...currentPath, { id: child.id, name: child.name, levelType: childLevelType }];
              const processedChildResult = filterDataByLevels([child], selectedLevelsSet, hierarchyOrder, childPath);
              if (processedChildResult.length > 0) {
                allProcessedChildren.push(processedChildResult[0]);
              }
            }
          } else {
            // Child level is enabled (we already checked at line 3045), process it recursively
            const childPath = [...currentPath, { id: child.id, name: child.name, levelType: childLevelType }];
            const processedChildResult = filterDataByLevels([child], selectedLevelsSet, hierarchyOrder, childPath);
            
            // IMPORTANT: When we recursively call filterDataByLevels on a child, if that child is a disabled level,
            // the recursive call should return only its children, NOT the child itself (see line 2993).
            // So processedChildResult should NOT contain the child row itself if it's disabled.
            // But we need to double-check to ensure no disabled-level rows slip through.
            for (const resultRow of processedChildResult) {
              const resultRowLevelType = getRowLevelType(resultRow, hierarchyOrder);
              if (resultRowLevelType && !selectedLevelsSet.has(resultRowLevelType)) {
                // This row is a disabled level - don't include it, only include its children
                if (resultRow.children && resultRow.children.length > 0) {
                  // Process the disabled row's children and add them directly
                  const disabledRowChildren = filterDataByLevels(resultRow.children, selectedLevelsSet, hierarchyOrder, childPath);
                  allProcessedChildren.push(...disabledRowChildren);
                }
                // Skip adding the disabled row itself
              } else {
                // Also check for unidentified plant/category rows
                if (!resultRowLevelType) {
                  const resultRowName = resultRow.name?.toLowerCase() || '';
                  const mightBePlant = (resultRowName.includes('michigan') || resultRowName.includes('ohio')) && 
                                       (resultRowName.includes('plant') || resultRowName.includes('powertrain') || resultRowName.includes('magnadrive'));
                  const mightBeCategory = resultRowName.includes('transmission') || resultRowName.includes('chassis');
                  
                  if ((mightBePlant && !selectedLevelsSet.has('Child Account')) ||
                      (mightBeCategory && !selectedLevelsSet.has('Category'))) {
                    // This is a disabled plant/category row - only include its children
                    if (resultRow.children && resultRow.children.length > 0) {
                      const disabledRowChildren = filterDataByLevels(resultRow.children, selectedLevelsSet, hierarchyOrder, childPath);
                      allProcessedChildren.push(...disabledRowChildren);
                    }
                    // Skip adding the disabled row itself
                    continue;
                  }
                }
                
                // Row is enabled or unidentified but not a disabled plant/category - add it
                allProcessedChildren.push(resultRow);
              }
            }
          }
        }
        
        // Merge children - for non-leaf nodes (categories/accounts) merge by name to aggregate
        // For leaf nodes (products), merge by name when Product level is disabled OR when both Child Account and Category are disabled, otherwise use ID to preserve uniqueness
        const mergedChildrenMap = new Map();
        const productLevelDisabled = !selectedLevelsSet.has('Product');
        const childAccountDisabled = !selectedLevelsSet.has('Child Account');
        const categoryDisabled = !selectedLevelsSet.has('Category');
        // When both Child Account and Category are disabled, merge all rows by name regardless of whether they're products
        const shouldMergeAllByName = childAccountDisabled && categoryDisabled;
        
        for (const child of allProcessedChildren) {
          const isLeaf = child.hasChildren === false;
          
          // Determine merge key:
          // 1. If Product level is disabled and this is a leaf node, merge by name (aggregate duplicates)
          // 2. If both Child Account and Category are disabled, always merge by name (aggregate all duplicates across plants/categories)
          // 3. If Product level is enabled and this is a leaf node, use ID+name to preserve uniqueness
          // 4. For non-leaf nodes, always merge by name
          let mergeKey;
          if (shouldMergeAllByName) {
            // Both Child Account and Category disabled: merge everything by name
            mergeKey = child.name || child.id || `unknown-${child.id}`;
          } else if (isLeaf && productLevelDisabled) {
            // Product level disabled: merge leaf nodes with same name
            mergeKey = child.name || child.id || `unknown-${child.id}`;
          } else if (isLeaf) {
            // Product level enabled: preserve all unique products using ID+name
            mergeKey = `${child.id || 'no-id'}-${child.name || 'no-name'}`;
          } else {
            // Non-leaf nodes: merge by name
            mergeKey = child.name || child.id || `unknown-${child.id}`;
          }
          
          if (mergedChildrenMap.has(mergeKey)) {
            const existing = mergedChildrenMap.get(mergeKey);
            
            // Merge if: (1) not a leaf node, OR (2) leaf node but Product level is disabled, OR (3) both Child Account and Category are disabled
            if (!isLeaf || (isLeaf && productLevelDisabled) || shouldMergeAllByName) {
              // Merge metrics (aggregate values)
              existing.baseline = (existing.baseline || 0) + (child.baseline || 0);
              existing.amAdjusted = (existing.amAdjusted || 0) + (child.amAdjusted || 0);
              existing.smAdjustment = (existing.smAdjustment || 0) + (child.smAdjustment || 0);
              existing.rsdAdjustment = (existing.rsdAdjustment || 0) + (child.rsdAdjustment || 0);
              existing.finalForecast = (existing.finalForecast || 0) + (child.finalForecast || 0);
              
              // Merge children if they exist (e.g., products from same category under different plants)
              if (child.children && child.children.length > 0) {
                if (!existing.children) existing.children = [];
                
                // For categories: when merging categories from different plants, we need to aggregate all products
                // Merge products by name to sum their values across all plants
                for (const grandChild of child.children) {
                  const grandChildIsLeaf = grandChild.hasChildren === false;
                  
                  // For products (leaf nodes), always merge by name when Child Account is disabled
                  // This aggregates products with the same name from different plants
                  let grandChildKey;
                  if (grandChildIsLeaf && childAccountDisabled) {
                    // Child Account disabled: merge products by name to aggregate across plants
                    grandChildKey = grandChild.name || grandChild.id;
                  } else if (shouldMergeAllByName) {
                    grandChildKey = grandChild.name || grandChild.id;
                  } else if (grandChildIsLeaf && productLevelDisabled) {
                    grandChildKey = grandChild.name || grandChild.id;
                  } else if (grandChildIsLeaf) {
                    grandChildKey = `${grandChild.id || 'no-id'}-${grandChild.name || 'no-name'}`;
                  } else {
                    grandChildKey = grandChild.name || grandChild.id;
                  }
                  
                  const existingGrandChild = existing.children.find(c => {
                    const cIsLeaf = c.hasChildren === false;
                    let cKey;
                    if (cIsLeaf && childAccountDisabled) {
                      // Child Account disabled: merge products by name
                      cKey = c.name || c.id;
                    } else if (shouldMergeAllByName) {
                      cKey = c.name || c.id;
                    } else if (cIsLeaf && productLevelDisabled) {
                      cKey = c.name || c.id;
                    } else if (cIsLeaf) {
                      cKey = `${c.id || 'no-id'}-${c.name || 'no-name'}`;
                    } else {
                      cKey = c.name || c.id;
                    }
                    return cKey === grandChildKey;
                  });
                  
                  if (!existingGrandChild) {
                    // Doesn't exist yet, add it
                    existing.children.push({ 
                      ...grandChild, 
                      _hierarchyPath: grandChild._hierarchyPath || child._hierarchyPath || currentPath 
                    });
                  } else {
                    // If grandchild exists and should be merged, aggregate metrics
                    // When Child Account is disabled, always merge products by name to aggregate across plants
                    if (!grandChildIsLeaf || (grandChildIsLeaf && productLevelDisabled) || shouldMergeAllByName || (grandChildIsLeaf && childAccountDisabled)) {
                      existingGrandChild.baseline = (existingGrandChild.baseline || 0) + (grandChild.baseline || 0);
                      existingGrandChild.amAdjusted = (existingGrandChild.amAdjusted || 0) + (grandChild.amAdjusted || 0);
                      existingGrandChild.smAdjustment = (existingGrandChild.smAdjustment || 0) + (grandChild.smAdjustment || 0);
                      existingGrandChild.rsdAdjustment = (existingGrandChild.rsdAdjustment || 0) + (grandChild.rsdAdjustment || 0);
                      existingGrandChild.finalForecast = (existingGrandChild.finalForecast || 0) + (grandChild.finalForecast || 0);
                    }
                  }
                }
              }
              
              // Preserve hierarchy path from first occurrence or merge paths
              if (child._hierarchyPath && child._hierarchyPath.length > 0) {
                if (!existing._hierarchyPath || existing._hierarchyPath.length < child._hierarchyPath.length) {
                  existing._hierarchyPath = child._hierarchyPath;
                }
              }
            }
            // If it's a leaf node (product) and Product level is enabled, skip (preserve uniqueness)
          } else {
            // First occurrence, add it
            mergedChildrenMap.set(mergeKey, { 
              ...child, 
              _hierarchyPath: child._hierarchyPath || currentPath 
            });
          }
        }
        
        processedChildren = Array.from(mergedChildrenMap.values());
        
        // IMMEDIATE FILTER: Remove any plant rows that might have made it into the merge map
        // This is CRITICAL - even if a plant row somehow made it through processing, remove it here
        processedChildren = processedChildren.filter(child => {
          if (!child || !child.name) return false;
          
          const childLevelType = getRowLevelType(child, hierarchyOrder);
          
          // Remove any disabled-level rows (including plant rows)
          if (childLevelType && !selectedLevelsSet.has(childLevelType)) {
            return false; // Remove disabled rows - this includes plant rows when Child Account is disabled
          }
          
          // Also check for unidentified plant rows using aggressive pattern matching
          if (!childLevelType || childLevelType === null || childLevelType === undefined) {
            const childName = (child.name || '').toLowerCase().trim();
            const mightBePlant = (
              (childName.includes('michigan') || childName.includes('ohio')) && 
              (childName.includes('plant') || childName.includes('powertrain') || childName.includes('magnadrive'))
            ) || (
              childName.includes('magnadrive') && 
              (childName.includes('michigan') || childName.includes('ohio'))
            );
            
            if (mightBePlant && !selectedLevelsSet.has('Child Account')) {
              return false; // Remove plant rows when Child Account is disabled
            }
          }
          
          return true;
        });
        
        // Recursively process merged children to handle nested structures
        // Also filter out any children that should be hidden (e.g., plant rows when Child Account is disabled)
        processedChildren = processedChildren.map(child => {
          const childLevelType = getRowLevelType(child, hierarchyOrder);
          
          // If this child should be hidden (disabled level), skip it and only include its children
          if (childLevelType && !selectedLevelsSet.has(childLevelType)) {
            // This child is a disabled level - only include its processed children
            if (child.children && child.children.length > 0) {
              const nestedPath = child._hierarchyPath || currentPath;
              const nestedProcessed = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, nestedPath);
              // Return null to signal this child should be replaced with its children
              // We'll flatten this in the next step
              return { _shouldFlatten: true, children: nestedProcessed };
            }
            // No children, return null to exclude this child
            return null;
          }
          
          // Check for unidentified plant/category rows that should be filtered
          if (!childLevelType) {
            const childName = child.name?.toLowerCase() || '';
            const mightBePlant = (childName.includes('michigan') || childName.includes('ohio')) && 
                                 (childName.includes('plant') || childName.includes('powertrain') || childName.includes('magnadrive'));
            const mightBeCategory = childName.includes('transmission') || childName.includes('chassis');
            
            if (mightBePlant && !selectedLevelsSet.has('Child Account') && child.children && child.children.length > 0) {
              const nestedPath = child._hierarchyPath || currentPath;
              const nestedProcessed = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, nestedPath);
              return { _shouldFlatten: true, children: nestedProcessed };
            }
            
            if (mightBeCategory && !selectedLevelsSet.has('Category') && child.children && child.children.length > 0) {
              const nestedPath = child._hierarchyPath || currentPath;
              const nestedProcessed = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, nestedPath);
              return { _shouldFlatten: true, children: nestedProcessed };
            }
          }
          
          if (child.children && child.children.length > 0) {
            const nestedPath = child._hierarchyPath || currentPath;
            const nestedProcessed = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, nestedPath);
            
            // CRITICAL: Before returning the child with its processed children, verify the child itself is not a disabled level
            const verifyChildLevelType = getRowLevelType(child, hierarchyOrder);
            if (verifyChildLevelType && !selectedLevelsSet.has(verifyChildLevelType)) {
              // This child is actually a disabled level - don't return it, only return its processed children
              // But we need to wrap them in a structure - actually, just flatten them
              return { _shouldFlatten: true, children: nestedProcessed };
            }
            
            // Also check for unidentified plant rows
            if (!verifyChildLevelType) {
              const childName = child.name?.toLowerCase() || '';
              const mightBePlant = (childName.includes('michigan') || childName.includes('ohio')) && 
                                   (childName.includes('plant') || childName.includes('powertrain') || childName.includes('magnadrive'));
              if (mightBePlant && !selectedLevelsSet.has('Child Account')) {
                return { _shouldFlatten: true, children: nestedProcessed };
              }
            }
            
            return {
              ...child,
              children: nestedProcessed
            };
          }
          
          // Also check leaf nodes for disabled levels
          const verifyLeafLevelType = getRowLevelType(child, hierarchyOrder);
          if (verifyLeafLevelType && !selectedLevelsSet.has(verifyLeafLevelType)) {
            return null; // Exclude disabled leaf nodes
          }
          
          return child;
        }).filter(child => child !== null); // Remove null entries
        
        // Flatten any children that were marked for flattening (replace parent with children)
        const flattenedChildren = [];
        for (const child of processedChildren) {
          if (child._shouldFlatten && child.children) {
            flattenedChildren.push(...child.children);
          } else {
            flattenedChildren.push(child);
          }
        }
        processedChildren = flattenedChildren;
        
        // Final pass: filter out any remaining disabled-level rows that might have slipped through
        // This is a safety check to ensure plant rows and category rows are not shown when disabled
        const filteredChildren = [];
        const childrenToFlatten = [];
        
        for (const child of processedChildren) {
          const childLevelType = getRowLevelType(child, hierarchyOrder);
          
          // If it's a disabled level, exclude it but collect its children
          if (childLevelType && !selectedLevelsSet.has(childLevelType)) {
            if (child.children && child.children.length > 0) {
              childrenToFlatten.push({ child, path: child._hierarchyPath || currentPath });
            }
            continue; // Skip this disabled child
          }
          
          // Also check for unidentified plant/category rows
          if (!childLevelType) {
            const childName = child.name?.toLowerCase() || '';
            const mightBePlant = (childName.includes('michigan') || childName.includes('ohio')) && 
                                 (childName.includes('plant') || childName.includes('powertrain') || childName.includes('magnadrive'));
            const mightBeCategory = childName.includes('transmission') || childName.includes('chassis');
            
            if (mightBePlant && !selectedLevelsSet.has('Child Account')) {
              if (child.children && child.children.length > 0) {
                childrenToFlatten.push({ child, path: child._hierarchyPath || currentPath });
              }
              continue; // Skip plant rows when Child Account is disabled
            }
            
            if (mightBeCategory && !selectedLevelsSet.has('Category')) {
              if (child.children && child.children.length > 0) {
                childrenToFlatten.push({ child, path: child._hierarchyPath || currentPath });
              }
              continue; // Skip category rows when Category is disabled
            }
          }
          
          filteredChildren.push(child);
        }
        
        // Flatten any disabled rows - add their children to filteredChildren
        for (const { child, path } of childrenToFlatten) {
          const disabledRowChildren = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, path);
          filteredChildren.push(...disabledRowChildren);
        }
        
        processedChildren = filteredChildren;
        
        // Double-check mergedChildrenMap for any disabled rows that might have been added
        const finalCheckChildren = [];
        for (const child of Array.from(mergedChildrenMap.values())) {
          const childLevelType = getRowLevelType(child, hierarchyOrder);
          if (childLevelType && !selectedLevelsSet.has(childLevelType)) {
            // This is a disabled level that somehow made it through merging
            if (child.children && child.children.length > 0) {
              const disabledRowChildren = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, child._hierarchyPath || currentPath);
              finalCheckChildren.push(...disabledRowChildren);
            }
            continue; // Don't include the disabled row itself
          } else if (!childLevelType) {
            const childName = child.name?.toLowerCase() || '';
            const mightBePlant = (childName.includes('michigan') || childName.includes('ohio')) && 
                                 (childName.includes('plant') || childName.includes('powertrain') || childName.includes('magnadrive'));
            const mightBeCategory = childName.includes('transmission') || childName.includes('chassis');
            
            if ((mightBePlant && !selectedLevelsSet.has('Child Account')) || 
                (mightBeCategory && !selectedLevelsSet.has('Category'))) {
              if (child.children && child.children.length > 0) {
                const disabledRowChildren = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, child._hierarchyPath || currentPath);
                finalCheckChildren.push(...disabledRowChildren);
              }
              continue; // Don't include the disabled row itself
            }
          }
          
          // Only add if it's not already in processedChildren
          const alreadyExists = processedChildren.some(pc => {
            const pcIsLeaf = pc.hasChildren === false;
            const childIsLeaf = child.hasChildren === false;
            // For non-leaf nodes (categories), check by name
            if (!pcIsLeaf && !childIsLeaf) {
              return pc.name === child.name;
            }
            // For leaf nodes, check by ID+name
            return pc.id === child.id && pc.name === child.name;
          });
          
          if (!alreadyExists) {
            finalCheckChildren.push(child);
          }
        }
        
        // Merge finalCheckChildren with processedChildren (they might have different items)
        // Use the same merge logic
        const finalMergedMap = new Map();
        for (const child of [...processedChildren, ...finalCheckChildren]) {
          const childLevelType = getRowLevelType(child, hierarchyOrder);
          if (childLevelType && !selectedLevelsSet.has(childLevelType)) {
            // Skip disabled rows
            if (child.children && child.children.length > 0) {
              const disabledRowChildren = filterDataByLevels(child.children, selectedLevelsSet, hierarchyOrder, child._hierarchyPath || currentPath);
              for (const dChild of disabledRowChildren) {
                const dChildLevelType = getRowLevelType(dChild, hierarchyOrder);
                if (!dChildLevelType || selectedLevelsSet.has(dChildLevelType)) {
                  const dMergeKey = dChild.hasChildren === false 
                    ? `${dChild.id || 'no-id'}-${dChild.name || 'no-name'}` 
                    : (dChild.name || dChild.id);
                  if (!finalMergedMap.has(dMergeKey)) {
                    finalMergedMap.set(dMergeKey, dChild);
                  }
                }
              }
            }
            continue;
          }
          
          const isLeaf = child.hasChildren === false;
          const mergeKey = isLeaf 
            ? `${child.id || 'no-id'}-${child.name || 'no-name'}` 
            : (child.name || child.id || `unknown-${child.id}`);
          
          if (!finalMergedMap.has(mergeKey)) {
            finalMergedMap.set(mergeKey, child);
          } else if (!isLeaf) {
            // Merge non-leaf nodes (categories)
            const existing = finalMergedMap.get(mergeKey);
            existing.baseline = (existing.baseline || 0) + (child.baseline || 0);
            existing.amAdjusted = (existing.amAdjusted || 0) + (child.amAdjusted || 0);
            existing.smAdjustment = (existing.smAdjustment || 0) + (child.smAdjustment || 0);
            existing.rsdAdjustment = (existing.rsdAdjustment || 0) + (child.rsdAdjustment || 0);
            existing.finalForecast = (existing.finalForecast || 0) + (child.finalForecast || 0);
            
            // Merge children
            if (child.children && child.children.length > 0) {
              if (!existing.children) existing.children = [];
              existing.children.push(...child.children);
            }
          }
        }
        
        processedChildren = Array.from(finalMergedMap.values());
      }
      
      // If row level is not identified, handle it carefully
      // Don't include unidentified parent nodes that might be disabled levels (like plant or category nodes)
      if (!rowLevelType) {
        // If it's an unidentified row with children, check if it might be a disabled level
        // Look for patterns that suggest it's a plant or category that wasn't detected
        const name = row.name?.toLowerCase() || '';
        // More comprehensive plant detection - check for various plant name patterns
        const mightBePlant = (
          (name.includes('michigan') || name.includes('ohio')) && 
          (name.includes('plant') || name.includes('powertrain'))
        ) || (
          name.includes('magnadrive') && 
          (name.includes('michigan') || name.includes('ohio')) && 
          (name.includes('plant') || name.includes('powertrain'))
        );
        const mightBeCategory = name.includes('transmission') || name.includes('chassis');
        
        // If it looks like a plant and Child Account is disabled, skip it
        if (mightBePlant && !selectedLevelsSet.has('Child Account')) {
          // Process children but don't include this row (skip the plant)
          if (row.children && row.children.length > 0) {
            const processedChildren = filterDataByLevels(row.children, selectedLevelsSet, hierarchyOrder, currentPath);
            // Continue to next iteration (skip this row)
            result.push(...processedChildren);
          }
          // Skip this row completely - don't add it to result
          continue;
        }
        
        // If it looks like a category and Category is disabled, skip it
        if (mightBeCategory && !selectedLevelsSet.has('Category') && row.children && row.children.length > 0) {
          // Process children but don't include this row (skip the category)
          const processedChildren = filterDataByLevels(row.children, selectedLevelsSet, hierarchyOrder, currentPath);
          // Continue to next iteration (skip this row)
          result.push(...processedChildren);
          continue;
        }
        
        // Otherwise, include unidentified rows if they have filtered children or are leaf nodes
        if (processedChildren.length > 0) {
          result.push({
            ...row,
            children: processedChildren,
            _hierarchyPath: currentPath
          });
        } else if (row.hasChildren === false) {
          // Leaf node - include it with path info
          result.push({
            ...row,
            _hierarchyPath: currentPath
          });
        }
        continue;
      }
      
      // Before adding the row to result, verify it's not a disabled level that slipped through
      const finalCheckLevelType = getRowLevelType(row, hierarchyOrder);
      if (finalCheckLevelType && !selectedLevelsSet.has(finalCheckLevelType)) {
        // This row is actually a disabled level - don't include it, only include its processed children
        result.push(...processedChildren);
        continue;
      }
      
      // Also check for unidentified plant/category rows that should be filtered
      if (!finalCheckLevelType) {
        const rowName = row.name?.toLowerCase() || '';
        const mightBePlant = (rowName.includes('michigan') || rowName.includes('ohio')) && 
                             (rowName.includes('plant') || rowName.includes('powertrain') || rowName.includes('magnadrive'));
        const mightBeCategory = rowName.includes('transmission') || rowName.includes('chassis');
        
        if (mightBePlant && !selectedLevelsSet.has('Child Account')) {
          // This is a plant row and Child Account is disabled - only include its children
          result.push(...processedChildren);
          continue;
        }
        
        if (mightBeCategory && !selectedLevelsSet.has('Category')) {
          // This is a category row and Category is disabled - only include its children
          result.push(...processedChildren);
          continue;
        }
      }
      
      // FINAL FILTER: Remove any plant rows from processedChildren before adding to result
      // This is CRITICAL - filter out any plant rows that might have been returned from recursive calls
      processedChildren = processedChildren.filter(child => {
        if (!child || !child.name) return false;
        
        const childLevelType = getRowLevelType(child, hierarchyOrder);
        
        // EXPLICIT CHECK: If this is "Child Account" and it's disabled, remove it
        if (childLevelType === 'Child Account' && !selectedLevelsSet.has('Child Account')) {
          return false; // Remove plant rows
        }
        
        // Remove disabled-level rows (plant rows when Child Account is disabled)
        if (childLevelType && !selectedLevelsSet.has(childLevelType)) {
          return false;
        }
        
        // Also check for unidentified plant rows using aggressive pattern matching
        if (!childLevelType || childLevelType === null || childLevelType === undefined) {
          const childName = (child.name || '').toLowerCase().trim();
          const mightBePlant = (
            (childName.includes('michigan') || childName.includes('ohio')) && 
            (childName.includes('plant') || childName.includes('powertrain') || childName.includes('magnadrive'))
          ) || (
            childName.includes('magnadrive') && 
            (childName.includes('michigan') || childName.includes('ohio'))
          );
          if (mightBePlant && !selectedLevelsSet.has('Child Account')) {
            return false; // Remove plant rows when Child Account is disabled
          }
        }
        
        return true;
      });
      
      // Row level is enabled, include it with processed children
      const processedRow = {
        ...row,
        children: processedChildren,
        _hierarchyPath: currentPath
      };
      
      // Check if this row already exists in result (same name and level type) - merge it
      // This is critical for Parent Account rows when Category/Product are disabled
      // Define productLevelDisabled here for use in merge logic
      const productLevelDisabledForMerge = !selectedLevelsSet.has('Product');
      
      const existingRowIndex = result.findIndex(r => {
        if (!r || !r.name) return false;
        const existingLevelType = getRowLevelType(r, hierarchyOrder);
        return r.name === row.name && 
               rowLevelType === existingLevelType && 
               rowLevelType !== null &&
               rowLevelType !== undefined;
      });
      
      if (existingRowIndex >= 0 && rowLevelType && rowLevelType !== null) {
        // Merge with existing row of same name and level type
        const existingRow = result[existingRowIndex];
        // Aggregate metrics
        existingRow.baseline = (existingRow.baseline || 0) + (processedRow.baseline || 0);
        existingRow.amAdjusted = (existingRow.amAdjusted || 0) + (processedRow.amAdjusted || 0);
        existingRow.smAdjustment = (existingRow.smAdjustment || 0) + (processedRow.smAdjustment || 0);
        existingRow.rsdAdjustment = (existingRow.rsdAdjustment || 0) + (processedRow.rsdAdjustment || 0);
        existingRow.finalForecast = (existingRow.finalForecast || 0) + (processedRow.finalForecast || 0);
        
        // Merge children - use same merge logic as before
        if (processedRow.children && processedRow.children.length > 0) {
          if (!existingRow.children) existingRow.children = [];
          
          // Merge children by name for non-leaf nodes, by ID+name for leaf nodes
          for (const child of processedRow.children) {
            const childLevelType = getRowLevelType(child, hierarchyOrder);
            const childIsLeaf = child.hasChildren === false;
            const childMergeKey = childIsLeaf && !productLevelDisabledForMerge
              ? `${child.id || 'no-id'}-${child.name || 'no-name'}`
              : (child.name || child.id);
            
            const existingChild = existingRow.children.find(c => {
              const cLevelType = getRowLevelType(c, hierarchyOrder);
              const cIsLeaf = c.hasChildren === false;
              const cMergeKey = cIsLeaf && !productLevelDisabledForMerge
                ? `${c.id || 'no-id'}-${c.name || 'no-name'}`
                : (c.name || c.id);
              return cMergeKey === childMergeKey && childLevelType === cLevelType;
            });
            
            if (existingChild) {
              // Merge metrics
              existingChild.baseline = (existingChild.baseline || 0) + (child.baseline || 0);
              existingChild.amAdjusted = (existingChild.amAdjusted || 0) + (child.amAdjusted || 0);
              existingChild.smAdjustment = (existingChild.smAdjustment || 0) + (child.smAdjustment || 0);
              existingChild.rsdAdjustment = (existingChild.rsdAdjustment || 0) + (child.rsdAdjustment || 0);
              existingChild.finalForecast = (existingChild.finalForecast || 0) + (child.finalForecast || 0);
              
              // Merge grandchildren if they exist
              if (child.children && child.children.length > 0) {
                if (!existingChild.children) existingChild.children = [];
                for (const grandChild of child.children) {
                  const grandChildIsLeaf = grandChild.hasChildren === false;
                  const grandChildMergeKey = grandChildIsLeaf && !productLevelDisabledForMerge
                    ? `${grandChild.id || 'no-id'}-${grandChild.name || 'no-name'}`
                    : (grandChild.name || grandChild.id);
                  
                  const existingGrandChild = existingChild.children.find(gc => {
                    const gcIsLeaf = gc.hasChildren === false;
                    const gcMergeKey = gcIsLeaf && !productLevelDisabledForMerge
                      ? `${gc.id || 'no-id'}-${gc.name || 'no-name'}`
                      : (gc.name || gc.id);
                    return gcMergeKey === grandChildMergeKey;
                  });
                  
                  if (existingGrandChild) {
                    existingGrandChild.baseline = (existingGrandChild.baseline || 0) + (grandChild.baseline || 0);
                    existingGrandChild.amAdjusted = (existingGrandChild.amAdjusted || 0) + (grandChild.amAdjusted || 0);
                    existingGrandChild.smAdjustment = (existingGrandChild.smAdjustment || 0) + (grandChild.smAdjustment || 0);
                    existingGrandChild.rsdAdjustment = (existingGrandChild.rsdAdjustment || 0) + (grandChild.rsdAdjustment || 0);
                    existingGrandChild.finalForecast = (existingGrandChild.finalForecast || 0) + (grandChild.finalForecast || 0);
                  } else {
                    existingChild.children.push(grandChild);
                  }
                }
              }
            } else {
              existingRow.children.push(child);
            }
          }
        }
        
        // Don't add this row again - it's been merged
        continue;
      }
      
      // If we have children, update metrics to match aggregated children
      // This ensures correct totals when levels are skipped
      // IMPORTANT: When Child Account is disabled, category totals should be the sum of ALL products across ALL plants
      if (processedChildren.length > 0 && row.hasChildren !== false) {
        // Recursively aggregate all leaf nodes (products) from all children to get true totals
        const aggregateAllProducts = (children) => {
          let totalBaseline = 0;
          let totalAmAdjusted = 0;
          let totalSmAdjustment = 0;
          let totalRsdAdjustment = 0;
          let totalFinalForecast = 0;
          
          for (const child of children) {
            if (child.hasChildren === false) {
              // Leaf node (product) - add its values
              totalBaseline += child.baseline || 0;
              totalAmAdjusted += child.amAdjusted || 0;
              totalSmAdjustment += child.smAdjustment || 0;
              totalRsdAdjustment += child.rsdAdjustment || 0;
              totalFinalForecast += child.finalForecast || 0;
            } else if (child.children && child.children.length > 0) {
              // Non-leaf node (category) - recursively aggregate its children
              const childTotals = aggregateAllProducts(child.children);
              totalBaseline += childTotals.baseline;
              totalAmAdjusted += childTotals.amAdjusted;
              totalSmAdjustment += childTotals.smAdjustment;
              totalRsdAdjustment += childTotals.rsdAdjustment;
              totalFinalForecast += childTotals.finalForecast;
            }
          }
          
          return { baseline: totalBaseline, amAdjusted: totalAmAdjusted, smAdjustment: totalSmAdjustment, rsdAdjustment: totalRsdAdjustment, finalForecast: totalFinalForecast };
        };
        
        // Use recursive aggregation when Child Account is disabled to get true totals across all plants
        if (!selectedLevelsSet.has('Child Account')) {
          const trueTotals = aggregateAllProducts(processedChildren);
          processedRow.baseline = trueTotals.baseline;
          processedRow.amAdjusted = trueTotals.amAdjusted;
          processedRow.smAdjustment = trueTotals.smAdjustment;
          processedRow.rsdAdjustment = trueTotals.rsdAdjustment;
          processedRow.finalForecast = trueTotals.finalForecast;
        } else {
          // Normal aggregation when all levels are shown
          const aggregatedMetrics = aggregateMetrics(processedChildren);
          processedRow.baseline = aggregatedMetrics.baseline;
          processedRow.amAdjusted = aggregatedMetrics.amAdjusted;
          processedRow.smAdjustment = aggregatedMetrics.smAdjustment;
          processedRow.rsdAdjustment = aggregatedMetrics.rsdAdjustment;
          processedRow.finalForecast = aggregatedMetrics.finalForecast;
        }
      }
      
      // ABSOLUTE FINAL CHECK: Verify the row itself is not a plant row before adding to result
      const absoluteFinalCheck = getRowLevelType(processedRow, hierarchyOrder);
      
      // EXPLICIT CHECK: If this is "Child Account" and it's disabled, never add it
      if (absoluteFinalCheck === 'Child Account' && !selectedLevelsSet.has('Child Account')) {
        // This is a disabled plant - only add its children, not the row itself
        result.push(...processedChildren);
        continue; // Don't add the row itself, continue to next iteration
      }
      
      // Generic check for any disabled level
      if (absoluteFinalCheck && !selectedLevelsSet.has(absoluteFinalCheck)) {
        // This is a disabled level - only add its children, not the row itself
        result.push(...processedChildren);
        continue; // Don't add the row itself, continue to next iteration
      }
      
      // Also check for unidentified plant rows using aggressive pattern matching
      if (!absoluteFinalCheck || absoluteFinalCheck === null || absoluteFinalCheck === undefined) {
        const rowNameCheck = (processedRow.name || '').toLowerCase().trim();
        const mightBePlantFinal = (
          (rowNameCheck.includes('michigan') || rowNameCheck.includes('ohio')) && 
          (rowNameCheck.includes('plant') || rowNameCheck.includes('powertrain') || rowNameCheck.includes('magnadrive'))
        ) || (
          rowNameCheck.includes('magnadrive') && 
          (rowNameCheck.includes('michigan') || rowNameCheck.includes('ohio'))
        );
        if (mightBePlantFinal && !selectedLevelsSet.has('Child Account')) {
          // This is a plant row - only add its children
          result.push(...processedChildren);
          continue; // Don't add the row itself, continue to next iteration
        }
      }
      
      result.push(processedRow);
    }
    
    // CRITICAL: Merge duplicate Parent Account rows (and other level types) at root level
    // This handles cases where Category/Product are disabled and multiple branches create duplicate parent rows
    // In "Product, Account" view with Category/Product disabled, each product creates a "MagnaDrive North America" entry
    // All of these must be merged into a single row with aggregated Michigan/Ohio children
    const mergedResultMap = new Map();
    for (const row of result) {
      if (!row || !row.name) continue;
      
      const rowLevelType = getRowLevelType(row, hierarchyOrder);
      if (!rowLevelType) {
        // Unidentified row - add as-is with unique key
        mergedResultMap.set(`${row.id || 'no-id'}-${row.name}`, row);
        continue;
      }
      
      // For rows with identified level types, merge by name + level type
      // This ensures all "MagnaDrive North America" entries (Parent Account) are merged together
      // regardless of which product they came from (Transmission Assemblies or Chassis Components)
      const mergeKey = `${rowLevelType}:${row.name}`;
      
      if (mergedResultMap.has(mergeKey)) {
        // Merge with existing row of same name and level type
        const existingRow = mergedResultMap.get(mergeKey);
        
        // CRITICAL: Merge children from the incoming row into the existing row
        // This ensures all children from all products (Transmission and Chassis) are included
        if (row.children && row.children.length > 0) {
          if (!existingRow.children) existingRow.children = [];
          
          // Merge children by level type and name
          // This ensures all "Michigan Plant" and "Ohio Plant" entries from all products are merged
          for (const child of row.children) {
            const childLevelType = getRowLevelType(child, hierarchyOrder);
            const childIsLeaf = child.hasChildren === false;
            
            // CRITICAL: Match Child Account rows by name and level type, not ID
            // In "Product, Account" view, each product creates its own plant nodes with unique IDs
            // When Category/Product are disabled, we need to merge all "Michigan Plant" entries regardless of ID
            const existingChild = existingRow.children.find(c => {
              const cLevelType = getRowLevelType(c, hierarchyOrder);
              const cIsLeaf = c.hasChildren === false;
              
              // For Child Account level rows, match by name and level type only (ignore ID)
              // This ensures all "Michigan Plant" entries from different products are merged
              if (childLevelType === 'Child Account' && cLevelType === 'Child Account') {
                return c.name === child.name;
              }
              
              if (cLevelType && childLevelType) {
                return cLevelType === childLevelType && c.name === child.name;
              } else if (!cLevelType && !childLevelType && cIsLeaf && childIsLeaf) {
                return c.id === child.id && c.name === child.name;
              } else {
                return c.name === child.name;
              }
            });
            
            if (existingChild) {
              // Get the level type of the existing child for comparison
              const existingChildLevelType = getRowLevelType(existingChild, hierarchyOrder);
              
              // CRITICAL: Only merge if this is a Child Account level row that needs aggregation
              // If both are Child Account level, we should sum their values (they come from different products)
              // Otherwise, if one has children and the other doesn't, we need to be careful
              const shouldMergeValues = (childLevelType === 'Child Account' && existingChildLevelType === 'Child Account') ||
                                       (childLevelType && childLevelType === existingChildLevelType);
              
              if (shouldMergeValues) {
                // Merge metrics - these represent the same entity (e.g., Michigan Plant) from different products
                existingChild.baseline = (existingChild.baseline || 0) + (child.baseline || 0);
                existingChild.amAdjusted = (existingChild.amAdjusted || 0) + (child.amAdjusted || 0);
                existingChild.smAdjustment = (existingChild.smAdjustment || 0) + (child.smAdjustment || 0);
                existingChild.rsdAdjustment = (existingChild.rsdAdjustment || 0) + (child.rsdAdjustment || 0);
                existingChild.finalForecast = (existingChild.finalForecast || 0) + (child.finalForecast || 0);
                
                // CRITICAL: If Category and Product are disabled, Child Account rows should be leaf nodes
                // Remove any children that shouldn't exist after filtering (they would have been filtered out earlier)
                if (!selectedLevelsSet.has('Category') && !selectedLevelsSet.has('Product')) {
                  // Category and Product are disabled, so Child Account rows should be leaf nodes
                  if (childLevelType === 'Child Account' && existingChildLevelType === 'Child Account') {
                    existingChild.hasChildren = false;
                    existingChild.children = undefined; // Clear children since Category/Product are disabled
                  }
                }
              }
              
              // Merge grandchildren if they exist (shouldn't exist when Category/Product are disabled, but handle it)
              if (child.children && child.children.length > 0 && existingChild.children) {
                // Only merge grandchildren if they weren't already cleared
                for (const grandChild of child.children) {
                  const grandChildLevelType = getRowLevelType(grandChild, hierarchyOrder);
                  const grandChildIsLeaf = grandChild.hasChildren === false;
                  
                  const existingGrandChild = existingChild.children.find(gc => {
                    const gcLevelType = getRowLevelType(gc, hierarchyOrder);
                    const gcIsLeaf = gc.hasChildren === false;
                    
                    if (gcLevelType && grandChildLevelType) {
                      return gcLevelType === grandChildLevelType && gc.name === grandChild.name;
                    } else if (!gcLevelType && !grandChildLevelType && gcIsLeaf && grandChildIsLeaf) {
                      return gc.id === grandChild.id && gc.name === grandChild.name;
                    } else {
                      return gc.name === grandChild.name;
                    }
                  });
                  
                  if (existingGrandChild) {
                    existingGrandChild.baseline = (existingGrandChild.baseline || 0) + (grandChild.baseline || 0);
                    existingGrandChild.amAdjusted = (existingGrandChild.amAdjusted || 0) + (grandChild.amAdjusted || 0);
                    existingGrandChild.smAdjustment = (existingGrandChild.smAdjustment || 0) + (grandChild.smAdjustment || 0);
                    existingGrandChild.rsdAdjustment = (existingGrandChild.rsdAdjustment || 0) + (grandChild.rsdAdjustment || 0);
                    existingGrandChild.finalForecast = (existingGrandChild.finalForecast || 0) + (grandChild.finalForecast || 0);
                  } else if (existingChild.children) {
                    existingChild.children.push(grandChild);
                  }
                }
              }
            } else {
              // Child doesn't exist yet - add it to the existing row's children
              // This ensures all children from all merged Parent Account rows are included
              existingRow.children.push(child);
            }
          }
          
          // CRITICAL: After merging children, recalculate parent row totals from merged children
          // This ensures correct values when merging multiple Parent Account rows from different products
          if (existingRow.children && existingRow.children.length > 0) {
            // Use direct aggregation (sum of children) since Child Account is enabled
            // and children are already merged Child Account rows (leaf nodes)
            const aggregatedMetrics = aggregateMetrics(existingRow.children);
            existingRow.baseline = aggregatedMetrics.baseline;
            existingRow.amAdjusted = aggregatedMetrics.amAdjusted;
            existingRow.smAdjustment = aggregatedMetrics.smAdjustment;
            existingRow.rsdAdjustment = aggregatedMetrics.rsdAdjustment;
            existingRow.finalForecast = aggregatedMetrics.finalForecast;
          }
        }
      } else {
        // First occurrence, add it as-is
        // Values will be recalculated from children in the final pass
        mergedResultMap.set(mergeKey, row);
      }
    }
    
    // CRITICAL: Recalculate metrics for ALL rows in mergedResultMap from their children
    // This ensures ALL rows (both first-added and merged) get recalculated from their children
    // This is essential because:
    // 1. First-added rows might have values from transformation that don't reflect merged children
    // 2. Merged rows have values that were recalculated during merge, but we want a final consistent recalculation
    // 3. After all merges are complete, ALL rows should have values that exactly match the sum of their children
    for (const row of mergedResultMap.values()) {
      // ALWAYS recalculate from children if children exist, regardless of whether this row was merged or first-added
      if (row.children && row.children.length > 0 && row.hasChildren !== false) {
        // Use recursive aggregation when Child Account is disabled (to sum all products across plants)
        // Otherwise use direct aggregation (sum child rows directly)
        // When Category and Product are disabled, children should be Child Account rows (leaf nodes)
        // In this case, direct aggregation is correct since we're just summing Michigan + Ohio
        if (!selectedLevelsSet.has('Child Account')) {
          const aggregateAllProducts = (children) => {
            let totalBaseline = 0;
            let totalAmAdjusted = 0;
            let totalSmAdjustment = 0;
            let totalRsdAdjustment = 0;
            let totalFinalForecast = 0;
            
            for (const child of children) {
              if (child.hasChildren === false) {
                totalBaseline += child.baseline || 0;
                totalAmAdjusted += child.amAdjusted || 0;
                totalSmAdjustment += child.smAdjustment || 0;
                totalRsdAdjustment += child.rsdAdjustment || 0;
                totalFinalForecast += child.finalForecast || 0;
              } else if (child.children && child.children.length > 0) {
                const childTotals = aggregateAllProducts(child.children);
                totalBaseline += childTotals.baseline;
                totalAmAdjusted += childTotals.amAdjusted;
                totalSmAdjustment += childTotals.smAdjustment;
                totalRsdAdjustment += childTotals.rsdAdjustment;
                totalFinalForecast += childTotals.finalForecast;
              } else {
                totalBaseline += child.baseline || 0;
                totalAmAdjusted += child.amAdjusted || 0;
                totalSmAdjustment += child.smAdjustment || 0;
                totalRsdAdjustment += child.rsdAdjustment || 0;
                totalFinalForecast += child.finalForecast || 0;
              }
            }
            
            return { baseline: totalBaseline, amAdjusted: totalAmAdjusted, smAdjustment: totalSmAdjustment, rsdAdjustment: totalRsdAdjustment, finalForecast: totalFinalForecast };
          };
          
          const trueTotals = aggregateAllProducts(row.children);
          row.baseline = trueTotals.baseline;
          row.amAdjusted = trueTotals.amAdjusted;
          row.smAdjustment = trueTotals.smAdjustment;
          row.rsdAdjustment = trueTotals.rsdAdjustment;
          row.finalForecast = trueTotals.finalForecast;
        } else {
          const aggregatedMetrics = aggregateMetrics(row.children);
          row.baseline = aggregatedMetrics.baseline;
          row.amAdjusted = aggregatedMetrics.amAdjusted;
          row.smAdjustment = aggregatedMetrics.smAdjustment;
          row.rsdAdjustment = aggregatedMetrics.rsdAdjustment;
          row.finalForecast = aggregatedMetrics.finalForecast;
        }
      }
    }
    
    // Convert map back to array
    const mergedResult = Array.from(mergedResultMap.values());
    
    // FINAL VERIFICATION: For Parent Account rows, ensure values match sum of children
    // This catches any cases where recalculation might have been missed
    for (const row of mergedResult) {
      const rowLevelType = getRowLevelType(row, hierarchyOrder);
      if (rowLevelType === 'Parent Account' && row.children && row.children.length > 0 && row.hasChildren !== false) {
        // Recalculate one more time to ensure absolute correctness
        const verifiedMetrics = aggregateMetrics(row.children);
        row.baseline = verifiedMetrics.baseline;
        row.amAdjusted = verifiedMetrics.amAdjusted;
        row.smAdjustment = verifiedMetrics.smAdjustment;
        row.rsdAdjustment = verifiedMetrics.rsdAdjustment;
        row.finalForecast = verifiedMetrics.finalForecast;
      }
    }
    
    // FINAL ABSOLUTE CHECK: Filter out any plant rows that somehow made it to the result
    // This is the last line of defense - check every row in the final result
    const finalFilteredResult = mergedResult.filter(row => {
      if (!row || !row.name) return false;
      
      const finalRowLevelType = getRowLevelType(row, hierarchyOrder);
      
      // Remove any disabled-level rows
      if (finalRowLevelType && !selectedLevelsSet.has(finalRowLevelType)) {
        return false;
      }
      
      // Check for unidentified plant rows
      if (!finalRowLevelType) {
        const finalRowName = (row.name || '').toLowerCase().trim();
        const mightBePlant = (
          (finalRowName.includes('michigan') || finalRowName.includes('ohio')) && 
          (finalRowName.includes('plant') || finalRowName.includes('powertrain') || finalRowName.includes('magnadrive'))
        ) || (
          finalRowName.includes('magnadrive') && 
          (finalRowName.includes('michigan') || finalRowName.includes('ohio'))
        );
        
        if (mightBePlant && !selectedLevelsSet.has('Child Account')) {
          return false;
        }
      }
      
      return true;
    });
    
    return finalFilteredResult;
  };
  
  const data = generateDataForMonth(selectedMonth, selectedKAMView === 'Account Director View');
  
  // Apply hierarchy transformation for Account Director view if combobox value is set
  const transformedData = selectedKAMView === 'Account Director View' && groupedComboboxValue
    ? transformDataByHierarchyOrder(data, groupedComboboxValue)
    : data;
  
  // For Account Director View, apply level filtering
  // Ensure selectedLevels is always a Set
  const selectedLevelsSet = selectedLevels instanceof Set ? selectedLevels : new Set(selectedLevels || []);
  const filteredTransformedData = selectedKAMView === 'Account Director View' && groupedComboboxValue
    ? filterDataByLevels(transformedData, selectedLevelsSet, groupedComboboxValue)
    : transformedData;
  
  // For Account Manager View, hide the aggregate row and start at plant level
  const displayedData = selectedKAMView === 'Account Director View'
    ? filteredTransformedData
    : (Array.isArray(data) && data[0] && Array.isArray(data[0].children) ? data[0].children : data);

  // Generate data for all months for Time Series view
  const allMonthsData = months.map(month => {
    const monthData = generateDataForMonth(month, selectedKAMView === 'Account Director View');
    const transformedMonthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
      ? transformDataByHierarchyOrder(monthData, groupedComboboxValue)
      : monthData;
    // Apply level filtering for Account Director view
    // Ensure selectedLevels is always a Set
    const selectedLevelsSetForMonth = selectedLevels instanceof Set ? selectedLevels : new Set(selectedLevels || []);
    return selectedKAMView === 'Account Director View' && groupedComboboxValue
      ? filterDataByLevels(transformedMonthData, selectedLevelsSetForMonth, groupedComboboxValue)
      : transformedMonthData;
  });

  // Helper function to find a row in data by id (recursive)
  const findRowById = (dataArray, id) => {
    if (!dataArray || !Array.isArray(dataArray)) return null;
    for (const row of dataArray) {
      if (row && row.id === id) return row;
      if (row && row.children) {
        const found = findRowById(row.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  // Helper function to find the path (parent IDs) to a hierarchy (recursive)
  const findPathToHierarchy = (dataArray, targetId, path = []) => {
    for (const row of dataArray) {
      const currentPath = [...path, row.id];
      if (row.id === targetId) {
        return currentPath; // Return path including the target itself
      }
      if (row.children && row.children.length > 0) {
        const found = findPathToHierarchy(row.children, targetId, currentPath);
        if (found) return found;
      }
    }
    return null;
  };

  // Helper function to get metric value for a row
  const getMetricValue = (row, metric) => {
    switch(metric) {
      case 'Baseline (Revenue) [Read-Only]':
        return row.baseline;
      case 'AM Adjusted (Revenue) [Editable]':
        return row.amAdjusted;
      case 'SM Adjustment [Read-Only]':
        return row.smAdjustment;
      case 'RSD Adjustment [Read-Only]':
        return row.rsdAdjustment;
      case 'Final Forecast (Revenue) [Read-Only]':
        return row.finalForecast;
      default:
        return undefined;
    }
  };

  // Helper function to get cell value for sorting (supports KPI columns, time columns, and hierarchy name)
  const getCellValueForSorting = (row, sortColumn, view) => {
    if (!sortColumn) return 0;
    
    // Parse sortColumn: 'kpi:Baseline...' or 'time:0' or 'time:-1' (FY) or 'hierarchy:name'
    // Handle splitting correctly even if there are colons in the identifier part
    const colonIndex = sortColumn.indexOf(':');
    if (colonIndex === -1) return 0;
    const type = sortColumn.substring(0, colonIndex);
    const identifier = sortColumn.substring(colonIndex + 1);
    
    if (type === 'hierarchy' && identifier === 'name') {
      // Hierarchy name sorting (alphabetical)
      return row.name ? row.name.toLowerCase() : '';
    } else if (type === 'kpi') {
      // KPI sorting (Specific Time and Time Roll-up views)
      return getMetricValue(row, identifier) || 0;
    } else if (type === 'time') {
      // Time column sorting (Time Series view)
      const timeIndex = parseInt(identifier, 10);
      
      if (timeIndex === -1) {
        // FY 25 total
        // Use lastSelectedCell if available, otherwise default to 'Baseline (Revenue) [Read-Only]'
        const kpiToUse = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
        let total = 0;
        months.forEach((month, idx) => {
          const monthData = allMonthsData[idx];
          if (!monthData) return;
          const rowData = findRowById(monthData, row.id);
          if (rowData) {
            const value = getMetricValue(rowData, kpiToUse);
            if (value !== undefined) {
              total += value;
            }
          }
        });
        return total;
      } else if (timeIndex >= -5 && timeIndex <= -2) {
        // Quarter totals (-2 to -5 for Q1-Q4)
        // Use lastSelectedCell if available, otherwise default to 'Baseline (Revenue) [Read-Only]'
        const kpiToUse = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
        const quarterMonths = timeIndex === -2 ? [0, 1, 2] : // Q1
                             timeIndex === -3 ? [3, 4, 5] : // Q2
                             timeIndex === -4 ? [6, 7, 8] : // Q3
                             [9, 10, 11]; // Q4
        let total = 0;
        quarterMonths.forEach((monthIdx) => {
          const monthData = allMonthsData[monthIdx];
          if (!monthData) return;
          const rowData = findRowById(monthData, row.id);
          if (rowData) {
            const value = getMetricValue(rowData, kpiToUse);
            if (value !== undefined) {
              total += value;
            }
          }
        });
        return total;
      } else if (timeIndex >= 0 && timeIndex <= 11) {
        // Month column
        // Use lastSelectedCell if available, otherwise default to 'Baseline (Revenue) [Read-Only]'
        const kpiToUse = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
        const monthData = allMonthsData[timeIndex];
        if (!monthData) return 0;
        const rowData = findRowById(monthData, row.id);
        if (!rowData) return 0;
        return getMetricValue(rowData, kpiToUse) || 0;
      }
    }
    
    return 0;
  };

  // Flatten hierarchical data into a flat array with parent references
  const flattenHierarchy = (dataArray, parent = null, level = 0) => {
    const result = [];
    dataArray.forEach(row => {
      result.push({
        ...row,
        _parent: parent,
        _level: level,
        _originalChildren: row.children ? [...row.children] : undefined
      });
      if (row.children && row.children.length > 0) {
        result.push(...flattenHierarchy(row.children, row.id, level + 1));
      }
    });
    return result;
  };

  // Sort hierarchical data structure
  const sortDataRecursive = (dataArray, sortColumn, sortDirection, view, preserveHierarchy = true) => {
    if (!sortColumn || !dataArray) return dataArray;
    
    // If not preserving hierarchy, flatten, sort, and return flat list
    if (!preserveHierarchy) {
      const flatArray = flattenHierarchy(dataArray);
      const sorted = flatArray.sort((a, b) => {
        const aValue = getCellValueForSorting(a, sortColumn, view);
        const bValue = getCellValueForSorting(b, sortColumn, view);
        
        // Parse sortColumn type
        const [type] = sortColumn.split(':');
        
        // Handle string comparison (for hierarchy names)
        if (type === 'hierarchy') {
          if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        }
        
        // Handle numeric comparison (for KPI and time columns)
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        
        // If values are equal, maintain original order (by name)
        return a.name.localeCompare(b.name);
      });
      
      // Return flat sorted list (remove hierarchy metadata and children)
      return sorted.map(item => ({
        ...item,
        _parent: undefined,
        _level: undefined,
        _originalChildren: undefined,
        hasChildren: false,
        children: undefined
      }));
    }
    
    // Original recursive sorting (preserves hierarchy)
    // Sort the array
    const sorted = [...dataArray].sort((a, b) => {
      const aValue = getCellValueForSorting(a, sortColumn, view);
      const bValue = getCellValueForSorting(b, sortColumn, view);
      
      // Parse sortColumn type
      const [type] = sortColumn.split(':');
      
      // Handle string comparison (for hierarchy names)
      if (type === 'hierarchy') {
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      }
      
      // Handle numeric comparison (for KPI and time columns)
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      
      // If values are equal, maintain original order (by name)
      return a.name.localeCompare(b.name);
    });
    
    // Recursively sort children
    return sorted.map(row => ({
      ...row,
      children: row.children ? sortDataRecursive(row.children, sortColumn, sortDirection, view, preserveHierarchy) : undefined
    }));
  };

  // Filter data based on hierarchy/name (product/category/account names)
  const filterByHierarchyName = (dataArray, filterValue) => {
    if (!filterValue || filterValue.trim() === '') return dataArray;
    
    const filterLower = filterValue.toLowerCase().trim();
    
    return dataArray.filter(row => {
      // Check if row name matches (case-insensitive contains)
      const nameMatches = row.name && row.name.toLowerCase().includes(filterLower);
      
      // Also check if any child matches (recursively)
      let childMatches = false;
      if (row.children && row.children.length > 0) {
        const filteredChildren = filterByHierarchyName(row.children, filterValue);
        childMatches = filteredChildren.length > 0;
      }
      
      // Include row if name matches or any child matches
      return nameMatches || childMatches;
    }).map(row => ({
      ...row,
      children: row.children ? filterByHierarchyName(row.children, filterValue) : undefined
    }));
  };

  // Global search - searches across all fields (names and values)
  const globalSearchFilter = (dataArray, searchValue, view) => {
    if (!searchValue || searchValue.trim() === '') return dataArray;
    
    const searchLower = searchValue.toLowerCase().trim();
    
    return dataArray.filter(row => {
      if (!row) return false;
      
      // Check row name
      const nameMatches = row.name && row.name.toLowerCase().includes(searchLower);
      
      // Check all metric values (baseline, amAdjusted, etc.)
      const baselineMatches = row.baseline !== undefined && String(row.baseline).toLowerCase().includes(searchLower);
      const amAdjustedMatches = row.amAdjusted !== undefined && String(row.amAdjusted).toLowerCase().includes(searchLower);
      const smAdjustmentMatches = row.smAdjustment !== undefined && String(row.smAdjustment).toLowerCase().includes(searchLower);
      const rsdAdjustmentMatches = row.rsdAdjustment !== undefined && String(row.rsdAdjustment).toLowerCase().includes(searchLower);
      const finalForecastMatches = row.finalForecast !== undefined && String(row.finalForecast).toLowerCase().includes(searchLower);
      
      // Check if any value matches
      const valueMatches = baselineMatches || amAdjustedMatches || smAdjustmentMatches || rsdAdjustmentMatches || finalForecastMatches;
      
      // Check children recursively
      let childMatches = false;
      if (row.children && row.children.length > 0) {
        const filteredChildren = globalSearchFilter(row.children, searchValue, view);
        childMatches = filteredChildren.length > 0;
      }
      
      // Include row if name matches, any value matches, or any child matches
      return nameMatches || valueMatches || childMatches;
    }).map(row => ({
      ...row,
      children: row.children ? globalSearchFilter(row.children, searchValue, view) : undefined
    }));
  };

  // Filter data based on column filters
  const filterDataRecursive = (dataArray, filters, view) => {
    if (!filters || Object.keys(filters).length === 0) return dataArray;
    
    return dataArray.map(row => {
      // First, recursively filter children
      const filteredChildren = row.children ? filterDataRecursive(row.children, filters, view) : undefined;
      const hasMatchingChildren = filteredChildren && filteredChildren.length > 0;
      
      // Check if row matches all active filters
      let matchesAllFilters = true;
      
      for (const [columnIdentifier, filterCriteria] of Object.entries(filters)) {
        // Support both old format (string) and new format (object with operator and value)
        let operator = '>=';
        let filterValue = '';
        
        if (typeof filterCriteria === 'string') {
          // Legacy format: just a string value, default to >= for backward compatibility
          filterValue = filterCriteria;
          operator = '>=';
        } else if (filterCriteria && typeof filterCriteria === 'object') {
          // New format: object with operator and value
          operator = filterCriteria.operator || '>=';
          filterValue = filterCriteria.value || '';
        }
        
        if (!filterValue || filterValue.trim() === '') {
          continue; // Skip empty filters
        }
        
        const cellValue = getCellValueForSorting(row, columnIdentifier, view);
        
        // Determine if this column is numeric (time-based columns and KPI columns are numeric)
        const isNumericColumn = columnIdentifier.startsWith('time:') || columnIdentifier.startsWith('kpi:');
        
        let matches = false;
        
        // Try to parse filter as number for numeric comparison
        // Remove currency symbols, commas, and other non-numeric characters (except minus sign)
        const cleanFilter = filterValue.replace(/[$,\s]/g, '').replace(/[^0-9.-]/g, '');
        const filterNum = parseFloat(cleanFilter);
        // Check if filter is numeric: must parse to a number and cleanFilter must be numeric (allows integers, decimals, and negative)
        // Regex: optional minus, followed by one or more digits, optionally followed by decimal point and more digits
        const isNumericFilter = !isNaN(filterNum) && cleanFilter !== '' && cleanFilter !== '-' && /^-?\d+(\.\d*)?$/.test(cleanFilter);
        
        // For numeric columns, always try numeric comparison (even if filter looks like text)
        // For text columns, use numeric comparison only if filter is clearly numeric
        if (isNumericColumn) {
          // Numeric column - always do numeric comparison
          // Handle cellValue: it might be number, string, undefined, or null
          let cellNum = 0;
          if (typeof cellValue === 'number' && !isNaN(cellValue)) {
            // cellValue is a valid number
            cellNum = cellValue;
          } else if (cellValue === undefined || cellValue === null || cellValue === '') {
            // Explicitly undefined/null/empty - treat as 0
            cellNum = 0;
          } else {
            // Try to parse as number, removing currency symbols and commas
            const cleanedCellValue = String(cellValue).replace(/[$,\s]/g, '').replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(cleanedCellValue);
            cellNum = !isNaN(parsed) ? parsed : 0;
          }
          
          // If filter can be parsed as number, use numeric comparison
          if (isNumericFilter) {
            switch (operator) {
              case '=':
              case 'equals':
                // Exact match for equals
                // For integers, use strict equality
                // For floating point, use very tight tolerance
                if (Number.isInteger(filterNum) && Number.isInteger(cellNum)) {
                  // Both are integers - exact match
                  matches = cellNum === filterNum;
                } else {
                  // Use tolerance for floating point comparison (covers both integer and decimal cases)
                  const tolerance = 0.0001;
                  matches = Math.abs(cellNum - filterNum) < tolerance;
                }
                
                // Debug logging for equals operator (remove after debugging)
                if (!matches && row.id && Math.random() < 0.05) {
                  console.log('Equals filter - no match:', {
                    rowId: row.id,
                    rowName: row.name,
                    columnIdentifier,
                    filterValue,
                    filterNum,
                    cellValue,
                    cellNum,
                    isIntegerFilter: Number.isInteger(filterNum),
                    isIntegerCell: Number.isInteger(cellNum),
                    diff: Math.abs(cellNum - filterNum),
                    cellValueType: typeof cellValue,
                    rowBaseline: row.baseline
                  });
                }
                
                break;
              case '>=':
              case 'greaterThanOrEqual':
                matches = cellNum >= filterNum;
                break;
              case '<=':
              case 'lessThanOrEqual':
                matches = cellNum <= filterNum;
                break;
              case '>':
              case 'greaterThan':
                matches = cellNum > filterNum;
                break;
              case '<':
              case 'lessThan':
                matches = cellNum < filterNum;
                break;
              case '!=':
              case 'notEquals':
                matches = Math.abs(cellNum - filterNum) >= 0.0001;
                break;
              default:
                matches = cellNum >= filterNum; // Default to >=
            }
          } else {
            // Filter is not numeric, so no match for numeric column
            matches = false;
          }
        } else if (isNumericFilter) {
          // Text column but numeric filter - convert cell to number and compare
          const cellNum = typeof cellValue === 'number' ? cellValue : (parseFloat(String(cellValue).replace(/[$,\s]/g, '')) || 0);
          
          switch (operator) {
            case '=':
            case 'equals':
              matches = Math.abs(cellNum - filterNum) < 0.0001;
              break;
            case '>=':
            case 'greaterThanOrEqual':
              matches = cellNum >= filterNum;
              break;
            case '<=':
            case 'lessThanOrEqual':
              matches = cellNum <= filterNum;
              break;
            case '>':
            case 'greaterThan':
              matches = cellNum > filterNum;
              break;
            case '<':
            case 'lessThan':
              matches = cellNum < filterNum;
              break;
            case '!=':
            case 'notEquals':
              matches = Math.abs(cellNum - filterNum) >= 0.0001;
              break;
            default:
              matches = cellNum >= filterNum;
          }
        } else if (filterValue.trim() !== '') {
          // String matching (case-insensitive) for text values
          const cellValueStr = String(cellValue || '').toLowerCase().trim();
          const filterStr = filterValue.toLowerCase().trim();
          
          switch (operator) {
            case '=':
            case 'equals':
            case '==':
              matches = cellValueStr === filterStr;
              break;
            case 'contains':
              matches = cellValueStr.includes(filterStr);
              break;
            case 'startsWith':
              matches = cellValueStr.startsWith(filterStr);
              break;
            case 'endsWith':
              matches = cellValueStr.endsWith(filterStr);
              break;
            case '!=':
            case 'notEquals':
            case '!==':
              matches = cellValueStr !== filterStr;
              break;
            case 'doesNotContain':
              matches = !cellValueStr.includes(filterStr);
              break;
            default:
              matches = cellValueStr.includes(filterStr); // Default to contains
          }
        }
        
        if (!matches) {
          matchesAllFilters = false;
          break;
        }
      }
      
      // Include row if it matches filters OR if any child matches (parent should be visible if children are visible)
      const shouldInclude = matchesAllFilters || hasMatchingChildren;
      
      if (!shouldInclude) {
        return null; // Mark for removal
      }
      
      return {
        ...row,
        children: filteredChildren
      };
    }).filter(row => row !== null); // Remove null entries
  };

  // Helper function to calculate aggregate totals from top-level rows only
  // Top-level rows already contain aggregated values from their children, so we don't need to recurse
  const calculateAggregateFromAllRows = (rows) => {
    let totalBaseline = 0;
    let totalAmAdjusted = 0;
    let totalSmAdjustment = 0;
    let totalRsdAdjustment = 0;
    let totalFinalForecast = 0;
    
    // Only sum top-level rows (they already contain aggregated values from children)
    rows.forEach(row => {
      // Skip only the "Total" aggregate row we create, but include "MagnaDrive North America" even if it has id 'aggregate'
      // because in "Account, Product" view, it's the actual top-level data row we want to sum
      if (row.id === 'total-aggregate') {
        return;
      }
      
      // In "Account, Product" view, the top-level row might have id 'aggregate' or 'magnadrive'
      // but it's still valid data that should be included in the total
      totalBaseline += row.baseline || 0;
      totalAmAdjusted += row.amAdjusted || 0;
      totalSmAdjustment += row.smAdjustment || 0;
      totalRsdAdjustment += row.rsdAdjustment || 0;
      totalFinalForecast += row.finalForecast || 0;
    });
    
    return {
      baseline: totalBaseline,
      amAdjusted: totalAmAdjusted,
      smAdjustment: totalSmAdjustment,
      rsdAdjustment: totalRsdAdjustment,
      finalForecast: totalFinalForecast
    };
  };
  
  // Apply global search first, then hierarchy filter (for Time Series and Specific Time views only), then column filters, then sorting
  const globallySearchedData = globalSearchFilter(displayedData, globalSearch, selectedView);
  const hierarchyFilteredData = (selectedView === 'Time series' || selectedView === 'Specific Time')
    ? filterByHierarchyName(globallySearchedData, hierarchyFilter)
    : globallySearchedData;
  const filteredData = filterDataRecursive(hierarchyFilteredData, columnFilters, selectedView);
  
  // Create aggregate row at the top (only for Account Director View)
  let dataWithAggregate = filteredData;
  if (selectedKAMView === 'Account Director View' && Array.isArray(filteredData) && filteredData.length > 0) {
    const aggregateTotals = calculateAggregateFromAllRows(filteredData);
    const aggregateRow = {
      id: 'total-aggregate',
      name: 'Total',
      hasChildren: false,
      baseline: aggregateTotals.baseline,
      amAdjusted: aggregateTotals.amAdjusted,
      smAdjustment: aggregateTotals.smAdjustment,
      rsdAdjustment: aggregateTotals.rsdAdjustment,
      finalForecast: aggregateTotals.finalForecast
    };
    // Add aggregate row at the beginning
    dataWithAggregate = [aggregateRow, ...filteredData];
  }
  
  // Sort data, but always keep aggregate row at the top
  let sortedDisplayedData;
  if (sortColumn) {
    const sorted = sortDataRecursive(dataWithAggregate, sortColumn, sortDirection, selectedView, preserveHierarchyOnSort);
    // Find and separate aggregate row
    const aggregateRowIndex = sorted.findIndex(row => row.id === 'total-aggregate');
    if (aggregateRowIndex >= 0) {
      const aggregateRow = sorted[aggregateRowIndex];
      const otherRows = sorted.filter(row => row.id !== 'total-aggregate');
      sortedDisplayedData = [aggregateRow, ...otherRows];
    } else {
      sortedDisplayedData = sorted;
    }
  } else {
    sortedDisplayedData = dataWithAggregate;
  }

  // Helper: collect all hierarchies with path meta (parent -> grandparent ...)
  const getAllHierarchies = (dataArray, hierarchies = [], parents = []) => {
    dataArray.forEach(row => {
      const meta = parents.length > 0 ? parents.join(' > ') : '';
      hierarchies.push({ id: row.id, name: row.name, meta });
      if (row.children && row.children.length > 0) {
        // Prepend immediate parent for children
        getAllHierarchies(row.children, hierarchies, [row.name, ...parents]);
      }
    });
    return hierarchies;
  };

  const allHierarchies = getAllHierarchies(sortedDisplayedData);

  // Handle column header click for sorting
  const handleColumnHeaderClick = (columnIdentifier) => {
    if (sortColumn === columnIdentifier) {
      // Toggle direction if same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(columnIdentifier);
      setSortDirection('asc');
    }
  };

  // Helper to render sort indicator (arrow) - now clickable to open popover
  const renderSortIndicator = (columnIdentifier) => {
    if (sortColumn !== columnIdentifier) return null;
    const isAscending = sortDirection === 'asc';
    return (
      <>
        <button
          ref={(el) => {
            if (el && sortColumn === columnIdentifier) {
              sortIndicatorButtonRef.current = el;
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            setSortPopoverOpen(true);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            flexShrink: 0,
            marginLeft: '4px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            borderRadius: '2px',
            color: '#0250d9'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#e8f4fd';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = 'transparent';
          }}
          title="Sort options"
        >
          {isAscending ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 1L10 8H2L6 1Z" fill="#0250d9"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 11L2 4H10L6 11Z" fill="#0250d9"/>
            </svg>
          )}
        </button>
        {sortPopoverOpen && renderSortPopover()}
      </>
    );
  };

  // Render sort options popover
  const renderSortPopover = () => {
    if (!sortIndicatorButtonRef.current) return null;
    
    const buttonRect = sortIndicatorButtonRef.current.getBoundingClientRect();
    
    return ReactDOM.createPortal(
      <div
        ref={sortPopoverRef}
        style={{
          position: 'fixed',
          top: `${buttonRect.bottom + window.scrollY + 4}px`,
          left: `${buttonRect.left + window.scrollX}px`,
          backgroundColor: '#ffffff',
          border: '1px solid #dddbda',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          padding: '12px',
          minWidth: '200px',
          zIndex: 10001,
          fontFamily: 'inherit'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: '12px', fontSize: '12px', fontWeight: '600', color: '#080707' }}>
          Sort Options
        </div>
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          fontSize: '12px', 
          color: '#080707', 
          cursor: 'pointer', 
          userSelect: 'none' 
        }}>
          <input
            type="checkbox"
            checked={preserveHierarchyOnSort}
            onChange={(e) => setPreserveHierarchyOnSort(e.target.checked)}
            style={{ cursor: 'pointer', width: '14px', height: '14px' }}
          />
          <span>Preserve hierarchy on sort</span>
        </label>
      </div>,
      document.body
    );
  };

  // Handle filter change
  const handleFilterChange = (columnIdentifier, filterValue, operator = null) => {
    setColumnFilters(prev => {
      const newFilters = { ...prev };
      const currentFilter = prev[columnIdentifier] || {};
      const currentOperator = typeof currentFilter === 'object' && currentFilter.operator ? currentFilter.operator : (operator || '>=');
      
      if (filterValue && filterValue.trim() !== '') {
        newFilters[columnIdentifier] = {
          operator: operator || currentOperator,
          value: filterValue
        };
      } else {
        delete newFilters[columnIdentifier];
      }
      return newFilters;
    });
  };
  
  // Handle filter operator change
  const handleFilterOperatorChange = (columnIdentifier, operator) => {
    setColumnFilters(prev => {
      const newFilters = { ...prev };
      const currentFilter = prev[columnIdentifier] || {};
      
      if (typeof currentFilter === 'object' && currentFilter.value) {
        // Keep existing value, update operator
        newFilters[columnIdentifier] = {
          operator: operator,
          value: currentFilter.value
        };
      } else if (typeof currentFilter === 'string' && currentFilter.trim() !== '') {
        // Legacy format: convert to new format
        newFilters[columnIdentifier] = {
          operator: operator,
          value: currentFilter
        };
      } else {
        // No value yet, set operator but keep value empty
        newFilters[columnIdentifier] = {
          operator: operator,
          value: ''
        };
      }
      return newFilters;
    });
  };

  // Helper to render filter input with operator dropdown
  const renderFilterInput = (columnIdentifier) => {
    const filterCriteria = columnFilters[columnIdentifier];
    const filterValue = typeof filterCriteria === 'object' && filterCriteria?.value ? filterCriteria.value : (typeof filterCriteria === 'string' ? filterCriteria : '');
    const filterOperator = typeof filterCriteria === 'object' && filterCriteria?.operator ? filterCriteria.operator : '>=';
    
    // Determine if this column is numeric (time-based columns and KPI columns are numeric)
    const isNumeric = columnIdentifier.startsWith('time:') || columnIdentifier.startsWith('kpi:');
    
    const numericOperators = [
      { value: '>=', label: '>=' },
      { value: '<=', label: '<=' },
      { value: '>', label: '>' },
      { value: '<', label: '<' },
      { value: '=', label: '=' },
      { value: '!=', label: '≠' }
    ];
    
    const textOperators = [
      { value: 'contains', label: 'Contains' },
      { value: '=', label: 'Equals' },
      { value: 'startsWith', label: 'Starts with' },
      { value: 'endsWith', label: 'Ends with' },
      { value: 'doesNotContain', label: 'Does not contain' },
      { value: '!=', label: 'Not equals' }
    ];
    
    const operators = isNumeric ? numericOperators : textOperators;
    
    return (
      <div style={{ position: 'relative', marginTop: '4px', width: '100%', display: 'flex', gap: '4px' }}>
        <select
          id={`filter-operator-${columnIdentifier.replace(/[:\[\]()\s]/g, '-')}`}
          name={`filter-operator-${columnIdentifier.replace(/[:\[\]()\s]/g, '-')}`}
          value={filterOperator}
          onChange={(e) => {
            e.stopPropagation();
            handleFilterOperatorChange(columnIdentifier, e.target.value);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '4px 6px',
            fontSize: '10px',
            border: filterValue ? '1px solid #0176d3' : '1px solid #c9c9c9',
            borderRadius: '4px',
            boxSizing: 'border-box',
            cursor: 'pointer',
            backgroundColor: filterValue ? '#f0f8ff' : '#ffffff',
            minWidth: '50px',
            flexShrink: 0
          }}
          title="Filter operator"
        >
          {operators.map(op => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            id={`filter-value-${columnIdentifier.replace(/[:\[\]()\s]/g, '-')}`}
            name={`filter-value-${columnIdentifier.replace(/[:\[\]()\s]/g, '-')}`}
            className="column-filter-input"
            value={filterValue}
            onChange={(e) => handleFilterChange(columnIdentifier, e.target.value, filterOperator)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Value..."
            style={{
              width: '100%',
              padding: '4px 20px 4px 6px',
              fontSize: '11px',
              border: filterValue ? '1px solid #0176d3' : '1px solid #c9c9c9',
              borderRadius: '4px',
              boxSizing: 'border-box',
              backgroundColor: filterValue ? '#f0f8ff' : '#ffffff'
            }}
          />
          {filterValue && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleFilterChange(columnIdentifier, '');
              }}
              style={{
                position: 'absolute',
                right: '4px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
                fontSize: '12px',
                color: '#666',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '3px',
                transition: 'background-color 0.2s',
                lineHeight: '1'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              title="Clear filter"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    );
  };

  // Helper function to get cell key for edited values map
  const getCellKey = (rowId, kpi, timeIndex) => {
    return `${rowId}-${kpi}-${timeIndex}`;
  };

  // Helper function to check if a KPI is editable
  const isKpiEditable = (kpi) => {
    return kpi && kpi.includes('[Editable]');
  };

  // Helper function to get edited value or return null
  const getEditedValue = (rowId, kpi, timeIndex) => {
    const key = getCellKey(rowId, kpi, timeIndex);
    return editedCellValues[key] !== undefined ? editedCellValues[key] : null;
  };

  // Helper function to check if a cell has been edited
  const isCellEdited = (rowId, kpi, timeIndex) => {
    const key = getCellKey(rowId, kpi, timeIndex);
    return editedCellValues[key] !== undefined;
  };

  // Helper function to check if a cell is impacted (has edited children)
  const isCellImpacted = (rowId, timeIndex, monthData) => {
    if (!monthData) return false;
    
    // Find the row
    const findRowById = (dataArray, id) => {
      if (!dataArray || !Array.isArray(dataArray)) return null;
      for (const row of dataArray) {
        if (row && row.id === id) return row;
        if (row && row.children) {
          const found = findRowById(row.children, id);
          if (found) return found;
        }
      }
      return null;
    };
    
    const row = findRowById(monthData, rowId);
    if (!row || !row.children || row.children.length === 0) return false;
    
    // Check if any child has been edited
    const checkChildren = (children) => {
      if (!children) return false;
      for (const child of children) {
        if (!child) continue;
        // Check all KPIs for this child at this time
        const kpis = [
          'Baseline (Revenue) [Read-Only]',
          'AM Adjusted (Revenue) [Editable]',
          'SM Adjustment [Read-Only]',
          'RSD Adjustment [Read-Only]',
          'Final Forecast (Revenue) [Read-Only]'
        ];
        for (const kpi of kpis) {
          if (isCellEdited(child.id, kpi, timeIndex)) {
            return true;
          }
        }
        // Recursively check grandchildren
        if (child.children && checkChildren(child.children)) {
          return true;
        }
      }
      return false;
    };
    
    return checkChildren(row.children);
  };

  // Helper function to set edited value
  const setEditedValue = (rowId, kpi, timeIndex, value) => {
    const key = getCellKey(rowId, kpi, timeIndex);
    setEditedCellValues(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleCellClick = (columnName, rowId, monthOverride = null, viewOverride = null) => {
    // Update the BB cell with: KPI, Time, Hierarchy
    const currentView = viewOverride || selectedView;
    const currentMonth = monthOverride || selectedMonth;
    
    // Map month/quarter/FY to time index
    let timeIndex;
    
    // For Time Roll-up view, preserve existing time or default to FY (-1)
    if (currentView === 'Time Roll-up') {
      timeIndex = selectedCell?.time !== undefined ? selectedCell.time : -1;
    } else if (currentMonth === 'FY 25') {
      timeIndex = -1;
    } else if (currentMonth === 'Q1 2025') {
      timeIndex = -2;
    } else if (currentMonth === 'Q2 2025') {
      timeIndex = -3;
    } else if (currentMonth === 'Q3 2025') {
      timeIndex = -4;
    } else if (currentMonth === 'Q4 2025') {
      timeIndex = -5;
    } else {
      timeIndex = months.indexOf(currentMonth);
      // If month not found, default to current selectedCell.time or 0
      if (timeIndex === -1) {
        timeIndex = selectedCell?.time !== undefined ? selectedCell.time : 0;
      }
    }
    
    const bbCell = {
      kpi: columnName,           // KPI/Column name
      time: timeIndex,           // Time/Month/Quarter/FY index
      hierarchy: rowId           // Hierarchy/Row ID
    };
    
    setSelectedCell(bbCell);
    setLastSelectedCell(columnName);
    // Only update selectedMonth if not in Time Roll-up view
    if (currentView !== 'Time Roll-up') {
      setSelectedMonth(currentMonth);
    }
  };

  // Handle double-click to start editing
  const handleCellDoubleClick = (rowId, kpi, timeIndex, currentValue) => {
    if (!isKpiEditable(kpi)) return;
    
    setEditingCell({ rowId, kpi, timeIndex, currentValue });
  };

  // Helper function to recalculate finalForecast when amAdjusted is edited
  const recalculateFinalForecast = (rowId, timeIndex, monthData) => {
    if (!monthData) {
      // If monthData not provided, generate it
      const monthIndex = timeIndex >= 0 && timeIndex <= 11 ? timeIndex : null;
      if (monthIndex === null) return;
      const month = months[monthIndex];
      const rawMonthData = generateDataForMonth(month, selectedKAMView === 'Account Director View');
      const transformedMonthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
        ? transformDataByHierarchyOrder(rawMonthData, groupedComboboxValue)
        : rawMonthData;
      const selectedLevelsSetForMonth = selectedLevels instanceof Set ? selectedLevels : new Set(selectedLevels || []);
      monthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
        ? filterDataByLevels(transformedMonthData, selectedLevelsSetForMonth, groupedComboboxValue)
        : transformedMonthData;
    }
    
    if (!monthData) return;
    
    // Find the row
    const findRowById = (dataArray, id) => {
      if (!dataArray || !Array.isArray(dataArray)) return null;
      for (const row of dataArray) {
        if (row && row.id === id) return row;
        if (row && row.children) {
          const found = findRowById(row.children, id);
          if (found) return found;
        }
      }
      return null;
    };
    
    const rowData = findRowById(monthData, rowId);
    if (!rowData) return;
    
    // Get edited amAdjusted or use original
    const editedAmAdjusted = getEditedValue(rowId, 'AM Adjusted (Revenue) [Editable]', timeIndex);
    const amAdjusted = editedAmAdjusted !== null ? editedAmAdjusted : (rowData.amAdjusted || 0);
    
    // Get other values (baseline, smAdjustment, rsdAdjustment) - these are read-only
    const baseline = getEditedValue(rowId, 'Baseline (Revenue) [Read-Only]', timeIndex);
    const baselineValue = baseline !== null ? baseline : (rowData.baseline || 0);
    const smAdjustment = rowData.smAdjustment || 0;
    const rsdAdjustment = rowData.rsdAdjustment || 0;
    
    // Recalculate finalForecast: baseline + amAdjusted + smAdjustment + rsdAdjustment
    const newFinalForecast = baselineValue + amAdjusted + smAdjustment + rsdAdjustment;
    
    // Store the recalculated finalForecast
    setEditedValue(rowId, 'Final Forecast (Revenue) [Read-Only]', timeIndex, newFinalForecast);
  };

  // Helper function to find all parent rows recursively
  const findAllParents = (dataArray, targetId, parentList = []) => {
    if (!dataArray || !Array.isArray(dataArray)) return [];
    
    for (const row of dataArray) {
      if (!row) continue;
      
      // Helper to check if targetId exists in children tree
      const findInChildren = (children, targetId) => {
        if (!children || !Array.isArray(children)) return false;
        for (const child of children) {
          if (child && child.id === targetId) return true;
          if (child && child.children && findInChildren(child.children, targetId)) return true;
        }
        return false;
      };
      
      // If this row contains the target as a child, it's a parent
      if (row.children && findInChildren(row.children, targetId)) {
        parentList.push(row);
        // Recursively find parents of this parent
        findAllParents(dataArray, row.id, parentList);
      }
      
      // Also check in children recursively
      if (row.children) {
        findAllParents(row.children, targetId, parentList);
      }
    }
    
    return parentList;
  };

  // Helper function to recalculate parent aggregates recursively
  const recalculateParentAggregates = (rowId, timeIndex, monthData) => {
    if (!monthData) return;
    
    // Find all parent rows that contain this rowId
    const findAllParents = (dataArray, targetId, parentList = []) => {
      if (!dataArray || !Array.isArray(dataArray)) return parentList;
      
      for (const row of dataArray) {
        if (!row) continue;
        
        // Helper to check if targetId exists in children tree
        const findInChildren = (children, targetId) => {
          if (!children || !Array.isArray(children)) return false;
          for (const child of children) {
            if (child && child.id === targetId) return true;
            if (child && child.children && findInChildren(child.children, targetId)) return true;
          }
          return false;
        };
        
        // If this row contains the target as a child, it's a parent
        if (row.children && findInChildren(row.children, targetId)) {
          if (!parentList.find(p => p.id === row.id)) {
            parentList.push(row);
            // Recursively find parents of this parent
            findAllParents(dataArray, row.id, parentList);
          }
        }
        
        // Also check in children recursively
        if (row.children) {
          findAllParents(row.children, targetId, parentList);
        }
      }
      
      return parentList;
    };
    
    const parentRows = findAllParents(monthData, rowId, []);
    
    // Recalculate aggregates for each parent
    const recalculateAggregateForRow = (row) => {
      if (!row || !row.children || row.children.length === 0) return;
      
      let totalBaseline = 0;
      let totalAmAdjusted = 0;
      let totalSmAdjustment = 0;
      let totalRsdAdjustment = 0;
      let totalFinalForecast = 0;
      
      const processChild = (child) => {
        if (!child) return;
        
        // Get values for this child, using edited values if available
        const childBaseline = getEditedValue(child.id, 'Baseline (Revenue) [Read-Only]', timeIndex);
        const childAmAdjusted = getEditedValue(child.id, 'AM Adjusted (Revenue) [Editable]', timeIndex);
        const childSmAdjustment = getEditedValue(child.id, 'SM Adjustment [Read-Only]', timeIndex);
        const childRsdAdjustment = getEditedValue(child.id, 'RSD Adjustment [Read-Only]', timeIndex);
        const childFinalForecast = getEditedValue(child.id, 'Final Forecast (Revenue) [Read-Only]', timeIndex);
        
        const baseline = childBaseline !== null ? childBaseline : (child.baseline || 0);
        const amAdjusted = childAmAdjusted !== null ? childAmAdjusted : (child.amAdjusted || 0);
        const smAdjustment = childSmAdjustment !== null ? childSmAdjustment : (child.smAdjustment || 0);
        const rsdAdjustment = childRsdAdjustment !== null ? childRsdAdjustment : (child.rsdAdjustment || 0);
        
        // If finalForecast is edited, use it; otherwise recalculate
        let finalForecast;
        if (childFinalForecast !== null) {
          finalForecast = childFinalForecast;
        } else {
          finalForecast = baseline + amAdjusted + smAdjustment + rsdAdjustment;
        }
        
        totalBaseline += baseline;
        totalAmAdjusted += amAdjusted;
        totalSmAdjustment += smAdjustment;
        totalRsdAdjustment += rsdAdjustment;
        totalFinalForecast += finalForecast;
        
        // If child has children, process them recursively
        if (child.children && child.children.length > 0) {
          child.children.forEach(processChild);
        }
      };
      
      row.children.forEach(processChild);
      
      // Store aggregated values for the parent
      setEditedValue(row.id, 'Baseline (Revenue) [Read-Only]', timeIndex, totalBaseline);
      setEditedValue(row.id, 'AM Adjusted (Revenue) [Editable]', timeIndex, totalAmAdjusted);
      setEditedValue(row.id, 'SM Adjustment [Read-Only]', timeIndex, totalSmAdjustment);
      setEditedValue(row.id, 'RSD Adjustment [Read-Only]', timeIndex, totalRsdAdjustment);
      setEditedValue(row.id, 'Final Forecast (Revenue) [Read-Only]', timeIndex, totalFinalForecast);
      
      // Recursively recalculate this parent's parents
      recalculateParentAggregates(row.id, timeIndex, monthData);
    };
    
    // Recalculate all parents
    parentRows.forEach(recalculateAggregateForRow);
  };

  // Handle saving edited value
  const handleSaveEdit = (rowId, kpi, timeIndex, newValue) => {
    // Parse the value - remove $ and commas
    const cleanValue = String(newValue).replace(/[$,\s]/g, '').replace(/[^0-9.-]/g, '');
    const numValue = parseFloat(cleanValue);
    
    if (!isNaN(numValue)) {
      setEditedValue(rowId, kpi, timeIndex, numValue);
      
      // If editing AM Adjusted, recalculate Final Forecast and parent aggregates
      if (kpi === 'AM Adjusted (Revenue) [Editable]') {
        const monthIndex = timeIndex >= 0 && timeIndex <= 11 ? timeIndex : null;
        if (monthIndex !== null) {
          // Generate month data on the fly
          const month = months[monthIndex];
          const rawMonthData = generateDataForMonth(month, selectedKAMView === 'Account Director View');
          const transformedMonthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
            ? transformDataByHierarchyOrder(rawMonthData, groupedComboboxValue)
            : rawMonthData;
          const selectedLevelsSetForMonth = selectedLevels instanceof Set ? selectedLevels : new Set(selectedLevels || []);
          const monthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
            ? filterDataByLevels(transformedMonthData, selectedLevelsSetForMonth, groupedComboboxValue)
            : transformedMonthData;
          
          recalculateFinalForecast(rowId, timeIndex, monthData);
          recalculateParentAggregates(rowId, timeIndex, monthData);
        }
      }
    }
    setEditingCell(null);
  };

  // Handle canceling edit
  const handleCancelEdit = () => {
    setEditingCell(null);
  };

  // Handle cell click in Time Series view
  const handleTimeSeriesCellClick = (rowId, monthIndex, kpiOverride = null) => {
    const clickedMonth = months[monthIndex];
    setSelectedMonth(clickedMonth);
    setSelectedMonthIndex(monthIndex);
    
    // Use kpiOverride if provided, otherwise use the current lastSelectedCell, or default to Baseline
    const kpiToUse = kpiOverride !== null ? kpiOverride : (lastSelectedCell || 'Baseline (Revenue) [Read-Only]');
    
    // Update the BB cell with: KPI, Time, Hierarchy
    const bbCell = {
      kpi: kpiToUse,             // KPI/Column name
      time: monthIndex,          // Time/Month index
      hierarchy: rowId           // Hierarchy/Row ID
    };
    
    setSelectedCell(bbCell);
    setLastSelectedCell(kpiToUse); // Always update lastSelectedCell
  };

  const Row = ({ row, level = 0, view = 'Specific Time' }) => {
    const hasChildren = row.children && row.children.length > 0;
    const isExpanded = expandedRows.has(row.id);
    const indent = (row.id === 'total-aggregate') ? 0 : level * 24;

    if (view === 'Time series') {
      // Helper function to calculate aggregate from all top-level rows in a dataset
      const calculateAggregateForMonthData = (monthData, metricName) => {
        if (!monthData || !Array.isArray(monthData) || monthData.length === 0) {
          return 0;
        }
        
        // Get top-level rows (exclude only the "Total" aggregate row we create)
        // In "Account, Product" view, monthData might be [northAmericaNode] (single element with id 'aggregate' or 'magnadrive')
        // In "Product, Account" view, monthData might be [transmissionNode, chassisNode] (multiple elements)
        // After filtering, we want to sum all top-level rows (including "MagnaDrive North America" even if id is 'aggregate')
        const topLevelRows = monthData.filter(r => r && r.id !== 'total-aggregate');
        let total = 0;
        topLevelRows.forEach(topRow => {
          const value = getMetricValue(topRow, metricName);
          if (value !== undefined && value !== null) {
            total += value || 0;
          }
        });
        return total;
      };
      
      // Time Series view - months as columns
      // Get the metric values for this row across all months
      const getCellValue = (monthIndex) => {
        const kpiToUse = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
        if (!lastSelectedCell && !kpiToUse) return '-';
        
        // For aggregate row, calculate from all top-level rows
        if (row.id === 'total-aggregate') {
          const monthData = allMonthsData[monthIndex];
          if (!monthData) return '-';
          const total = calculateAggregateForMonthData(monthData, kpiToUse);
          
          // Format based on metric type
          if (kpiToUse === 'SM Adjustment [Read-Only]' || kpiToUse === 'RSD Adjustment [Read-Only]') {
            return total !== 0 ? (total > 0 ? `+$${total.toLocaleString()}` : `-$${Math.abs(total).toLocaleString()}`) : '-';
          }
          return total !== 0 ? `$${total.toLocaleString()}` : '-';
        }
        
        // For regular rows
        const monthData = allMonthsData[monthIndex];
        const rowData = findRowById(monthData, row.id);
        if (!rowData) return '-';
        
        const value = getMetricValue(rowData, kpiToUse);
        if (value === undefined) return '-';
        
        // Format based on metric type
        if (kpiToUse === 'SM Adjustment [Read-Only]' || kpiToUse === 'RSD Adjustment [Read-Only]') {
          return value > 0 ? `+$${value.toLocaleString()}` : `-$${Math.abs(value).toLocaleString()}`;
        }
        return `$${value.toLocaleString()}`;
      };

      // Check if this cell is selected (matches the BB cell)
      const isCellSelected = (monthIndex) => {
        // Check if this cell matches the BB cell: same hierarchy (rowId), same time (monthIndex), and same KPI
        const kpiToCheck = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
        return selectedCell && 
               selectedCell.hierarchy === row.id && 
               selectedCell.time === monthIndex &&
               selectedCell.kpi === kpiToCheck;
      };

      // Calculate FY 25 total (sum of all 12 months)
      const getFYTotal = () => {
        const kpiToUse = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
        if (!lastSelectedCell && !kpiToUse) return '-';
        
        // For aggregate row, calculate from all top-level rows across all months
        if (row.id === 'total-aggregate') {
          let total = 0;
          months.forEach((month, idx) => {
            const monthData = allMonthsData[idx];
            if (monthData) {
              total += calculateAggregateForMonthData(monthData, kpiToUse);
            }
          });
          
          // Format based on metric type
          if (kpiToUse === 'SM Adjustment [Read-Only]' || kpiToUse === 'RSD Adjustment [Read-Only]') {
            return total !== 0 ? (total > 0 ? `+$${total.toLocaleString()}` : `-$${Math.abs(total).toLocaleString()}`) : '-';
          }
          return total !== 0 ? `$${total.toLocaleString()}` : '-';
        }
        
        // For regular rows
        let total = 0;
        months.forEach((month, idx) => {
          const monthData = allMonthsData[idx];
          const rowData = findRowById(monthData, row.id);
          if (rowData) {
            const value = getMetricValue(rowData, kpiToUse);
            if (value !== undefined) {
              total += value;
            }
          }
        });
        
        // Format based on metric type
        if (lastSelectedCell === 'SM Adjustment [Read-Only]' || lastSelectedCell === 'RSD Adjustment [Read-Only]') {
          return total > 0 ? `+$${total.toLocaleString()}` : `-$${Math.abs(total).toLocaleString()}`;
        }
        return `$${total.toLocaleString()}`;
      };

      // Calculate quarter totals for Account Director view
      const getQuarterTotal = (quarterMonths) => {
        const kpiToUse = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
        if (!lastSelectedCell && !kpiToUse) return '-';
        
        // For aggregate row, calculate from all top-level rows
        if (row.id === 'total-aggregate') {
          let total = 0;
          quarterMonths.forEach((monthIdx) => {
            const monthData = allMonthsData[monthIdx];
            if (monthData) {
              total += calculateAggregateForMonthData(monthData, kpiToUse);
            }
          });
          
          // Format based on metric type
          if (kpiToUse === 'SM Adjustment [Read-Only]' || kpiToUse === 'RSD Adjustment [Read-Only]') {
            return total !== 0 ? (total > 0 ? `+$${total.toLocaleString()}` : `-$${Math.abs(total).toLocaleString()}`) : '-';
          }
          return total !== 0 ? `$${total.toLocaleString()}` : '-';
        }
        
        // For regular rows
        let total = 0;
        quarterMonths.forEach((monthIdx) => {
          const monthData = allMonthsData[monthIdx];
          const rowData = findRowById(monthData, row.id);
          if (rowData) {
            const value = getMetricValue(rowData, kpiToUse);
            if (value !== undefined) {
              total += value;
            }
          }
        });
        
        // Format based on metric type
        if (kpiToUse === 'SM Adjustment [Read-Only]' || kpiToUse === 'RSD Adjustment [Read-Only]') {
          return total > 0 ? `+$${total.toLocaleString()}` : `-$${Math.abs(total).toLocaleString()}`;
        }
        return `$${total.toLocaleString()}`;
      };

      // Check if quarter cell is selected
      const isQuarterCellSelected = (quarterTime) => {
        const kpiToCheck = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
        return selectedCell && 
               selectedCell.hierarchy === row.id && 
               selectedCell.time === quarterTime &&
               selectedCell.kpi === kpiToCheck;
      };

      // Quarter definitions: -2 (Q1), -3 (Q2), -4 (Q3), -5 (Q4)
      const quarters = [
        { id: 'q1', name: 'Q1 2025', time: -2, months: [0, 1, 2] }, // Jan-Mar
        { id: 'q2', name: 'Q2 2025', time: -3, months: [3, 4, 5] }, // Apr-Jun
        { id: 'q3', name: 'Q3 2025', time: -4, months: [6, 7, 8] }, // Jul-Sep
        { id: 'q4', name: 'Q4 2025', time: -5, months: [9, 10, 11] } // Oct-Dec
      ];

      return (
        <>
          <div className={`table-row ${hasChildren ? 'parent-row' : 'child-row'}`}>
            <div className="cell name-cell" style={{ paddingLeft: `${20 + indent}px`, display: 'flex', alignItems: 'center', gap: '4px' }}>
              {hasChildren && row.id !== 'total-aggregate' && (
                <button 
                  className="expand-button"
                  onClick={() => toggleRow(row.id)}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
              )}
              <span className={hasChildren ? 'parent-text' : 'child-text'} style={{ flex: 1, fontWeight: row.id === 'total-aggregate' ? 'bold' : 'normal' }}>
                {row.name}
              </span>
              {/* Show filter button for parent rows */}
              {hasChildren && row.children && row.children.length > 0 && (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setChildFilterOpen(childFilterOpen === row.id ? null : row.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#706e6b',
                      fontSize: '14px',
                      lineHeight: '1',
                      width: '18px',
                      height: '18px'
                    }}
                    title="Filter children"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M13 1H1L6 7.5V11.5L8 12.5V7.5L13 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                  </button>
                  {childFilterOpen === row.id && ReactDOM.createPortal(
                    <div
                      ref={childFilterPopoverRef}
                      style={{
                        position: 'fixed',
                        top: '0px',
                        left: '0px',
                        padding: '8px 0',
                        backgroundColor: '#ffffff',
                        border: '1px solid #c9c9c9',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                        zIndex: 99999,
                        minWidth: '200px',
                        maxWidth: '300px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        display: 'none'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ padding: '0 12px 8px 12px', fontSize: '12px', fontWeight: '600', color: '#080707', borderBottom: '1px solid #dddbda', marginBottom: '4px' }}>
                        Filter Children
                      </div>
                      {row.children.map((child) => {
                        const childSelections = childFilterSelections[row.id] || new Set();
                        const isSelected = !childSelections.has(child.id); // If not in filter, show by default (all selected)
                        
                        return (
                          <label
                            key={child.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 12px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              color: '#080707',
                              userSelect: 'none'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f2f2'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                setChildFilterSelections(prev => {
                                  const parentSelections = prev[row.id] || new Set();
                                  const newSelections = new Set(parentSelections);
                                  
                                  if (e.target.checked) {
                                    newSelections.delete(child.id); // Remove from filter = show
                                  } else {
                                    newSelections.add(child.id); // Add to filter = hide
                                  }
                                  
                                  return {
                                    ...prev,
                                    [row.id]: newSelections.size > 0 ? newSelections : undefined
                                  };
                                });
                              }}
                              style={{
                                marginRight: '8px',
                                cursor: 'pointer',
                                width: '14px',
                                height: '14px'
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span>{child.name}</span>
                          </label>
                        );
                      })}
                    </div>,
                    document.body
                  )}
                </div>
              )}
              {/* Show hierarchy info button for products when intermediate levels are disabled */}
              {!hasChildren && row._hierarchyPath && row._hierarchyPath.length > 2 && selectedKAMView === 'Account Director View' && (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setProductPopoverOpen(productPopoverOpen === row.id ? null : row.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#706e6b',
                      fontSize: '14px',
                      lineHeight: '1',
                      width: '18px',
                      height: '18px'
                    }}
                    title="Show hierarchy path"
                  >
                    ⓘ
                  </button>
                  {productPopoverOpen === row.id && ReactDOM.createPortal(
                    <div
                      ref={productPopoverRef}
                      style={{
                        position: 'fixed',
                        top: '0px',
                        left: '0px',
                        padding: '8px 12px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #c9c9c9',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                        zIndex: 99999,
                        whiteSpace: 'nowrap',
                        fontSize: '12px',
                        color: '#181818',
                        minWidth: '200px',
                        maxWidth: '400px',
                        display: 'none'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>Hierarchy Path:</div>
                      <div style={{ color: '#706e6b' }}>
                        {(() => {
                          if (!row._hierarchyPath || row._hierarchyPath.length === 0) {
                            return row.name;
                          }
                          const enabledParts = row._hierarchyPath
                            .filter(p => p && p.levelType && selectedLevels.has(p.levelType))
                            .map(p => p.name);
                          const disabledParts = row._hierarchyPath
                            .filter(p => p && p.levelType && !selectedLevels.has(p.levelType))
                            .map(p => p.name);
                          return [...enabledParts, ...disabledParts, row.name].join(' > ');
                        })()}
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
              )}
            </div>
            {selectedTimeLevels.has('Year') && (() => {
              const kpiToUse = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
              const isEdited = isCellEdited(row.id, kpiToUse, -1);
              const monthIndex = 0;
              const monthDataForImpactCheck = allMonthsData && allMonthsData[monthIndex] ? allMonthsData[monthIndex] : null;
              const isImpacted = !isEdited && isCellImpacted(row.id, -1, monthDataForImpactCheck);
              
              return (
                <div 
                  className={`cell ${selectedCell && selectedCell.time === -1 && selectedCell.hierarchy === row.id && selectedCell.kpi === kpiToUse ? 'selected' : ''} ${isEdited ? 'cell-edited' : ''} ${isImpacted ? 'cell-impacted' : ''}`}
                  style={{ 
                    fontWeight: row.id === 'total-aggregate' ? 'bold' : 'normal', 
                    cursor: 'pointer',
                    backgroundColor: isEdited ? '#e8f5e9' : (isImpacted ? '#fff3e0' : undefined)
                  }}
                  onClick={() => {
                    // Just update BB cell, don't switch views
                    setSelectedCell({
                      time: -1,
                      hierarchy: row.id,
                      kpi: kpiToUse
                    });
                    setLastSelectedCell(kpiToUse);
                    setSelectedMonth('FY 25');
                  }}
                  data-selected-hierarchy={row.id}
                  data-selected-time="-1"
                  data-selected-kpi={kpiToUse}
                >
                  {getFYTotal()}
                </div>
              );
            })()}
            {/* Quarter columns for Account Director view */}
            {selectedKAMView === 'Account Director View' && selectedTimeLevels.has('Quarter') && quarters.map((quarter) => {
              const kpiToUse = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
              const isEdited = isCellEdited(row.id, kpiToUse, quarter.time);
              const monthIndex = quarter.months[0]; // Use first month of quarter for impact check
              const monthDataForImpactCheck = allMonthsData && allMonthsData[monthIndex] ? allMonthsData[monthIndex] : null;
              const isImpacted = !isEdited && isCellImpacted(row.id, quarter.time, monthDataForImpactCheck);
              
              return (
                <div
                  key={quarter.id}
                  className={`cell ${isQuarterCellSelected(quarter.time) ? 'selected' : ''} ${isEdited ? 'cell-edited' : ''} ${isImpacted ? 'cell-impacted' : ''}`}
                  style={{ 
                    fontWeight: row.id === 'total-aggregate' ? 'bold' : 'normal', 
                    cursor: 'pointer',
                    backgroundColor: isEdited ? '#e8f5e9' : (isImpacted ? '#fff3e0' : undefined)
                  }}
                onClick={() => {
                  const kpiToUse = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
                  setSelectedCell({
                    hierarchy: row.id,
                    time: quarter.time,
                    kpi: kpiToUse
                  });
                  setLastSelectedCell(kpiToUse);
                }}
                data-selected-hierarchy={row.id}
                data-selected-time={quarter.time}
                  data-selected-kpi={lastSelectedCell || ''}
                >
                  {getQuarterTotal(quarter.months)}
                </div>
              );
            })}
            {selectedTimeLevels.has('Month') && monthNames.map((month, idx) => {
              const kpiToUse = lastSelectedCell || 'Baseline (Revenue) [Read-Only]';
              const isEditing = editingCell && editingCell.rowId === row.id && editingCell.kpi === kpiToUse && editingCell.timeIndex === idx;
              const cellValue = getCellValue(idx);
              const isEditable = isKpiEditable(kpiToUse);
              const isEdited = isCellEdited(row.id, kpiToUse, idx);
              const monthDataForImpactCheck = allMonthsData[idx];
              const isImpacted = !isEdited && isCellImpacted(row.id, idx, monthDataForImpactCheck);
              
              return (
                <div 
                  key={month} 
                  className={`cell ${isCellSelected(idx) ? 'selected' : ''} ${isEdited ? 'cell-edited' : ''} ${isImpacted ? 'cell-impacted' : ''}`}
                  style={{ 
                    fontWeight: row.id === 'total-aggregate' ? 'bold' : 'normal', 
                    cursor: isEditable ? 'pointer' : 'pointer',
                    padding: isEditing ? '0' : undefined,
                    backgroundColor: isEdited ? '#e8f5e9' : (isImpacted ? '#fff3e0' : undefined)
                  }}
                  onClick={(e) => {
                    // Clear any existing timeout
                    if (clickTimeoutRef.current) {
                      clearTimeout(clickTimeoutRef.current);
                    }
                    
                    // Delay click handler to allow double-click to be detected
                    clickTimeoutRef.current = setTimeout(() => {
                      // Only select if not currently editing this cell
                      if (!isEditing) {
                        handleTimeSeriesCellClick(row.id, idx);
                      }
                      clickTimeoutRef.current = null;
                    }, 250);
                  }}
                  onDoubleClick={(e) => {
                    // Double-click starts editing (only for editable cells)
                    // Check if this specific KPI is editable
                    const cellKpiIsEditable = isKpiEditable(kpiToUse);
                    if (cellKpiIsEditable) {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      // Clear the click timeout immediately
                      if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current);
                        clickTimeoutRef.current = null;
                      }
                      
                      const monthData = allMonthsData[idx];
                      const rowData = findRowById(monthData, row.id);
                      const editedVal = getEditedValue(row.id, kpiToUse, idx);
                      const currentValue = editedVal !== null ? editedVal : (rowData ? getMetricValue(rowData, kpiToUse) : 0);
                      handleCellDoubleClick(row.id, kpiToUse, idx, currentValue);
                    }
                  }}
                  data-selected-hierarchy={row.id}
                  data-selected-time={idx}
                  data-selected-kpi={kpiToUse}
                >
                  {isEditing ? (
                    <input
                      type="text"
                      autoFocus
                      defaultValue={editingCell.currentValue !== undefined ? `$${editingCell.currentValue.toLocaleString()}` : ''}
                      onBlur={(e) => {
                        handleSaveEdit(row.id, kpiToUse, idx, e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveEdit(row.id, kpiToUse, idx, e.target.value);
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: '2px solid black',
                        outline: 'none',
                        padding: '4px 8px',
                        fontSize: '13px',
                        fontFamily: 'inherit',
                        background: 'white',
                        textAlign: 'right',
                        boxShadow: '0 0 8px rgba(2, 80, 217, 0.5)',
                        boxSizing: 'border-box'
                      }}
                    />
                  ) : (
                    cellValue
                  )}
                </div>
              );
            })}
          </div>
          {hasChildren && isExpanded && (() => {
            // Filter children based on childFilterSelections
            const filteredChildren = row.children.filter(child => {
              const parentSelections = childFilterSelections[row.id];
              if (!parentSelections || parentSelections.size === 0) {
                return true; // No filter = show all
              }
              return !parentSelections.has(child.id); // Show if not in filter (filter contains hidden items)
            });
            
            return filteredChildren.map(child => (
              <Row key={child.id} row={child} level={level + 1} view={view} />
            ));
          })()}
        </>
      );
    }

    // Specific Time view - current grid
    const isSelected = (columnName) => {
      // For Time Roll-up view, check against selectedCell.time directly (all time periods are shown)
      // For Specific Time view, derive time from selectedMonth
      let currentTime;
      if (view === 'Time Roll-up') {
        // In Time Roll-up Row component, cells show aggregated values (one value per KPI)
        // We check if hierarchy, KPI, and time all match
        // For Time Roll-up, we preserve the time when clicking, so we check for exact match
        return selectedCell && 
               selectedCell.hierarchy === row.id && 
               selectedCell.kpi === columnName &&
               selectedCell.time !== undefined; // Time should be set when cell is clicked
      } else {
        // Specific Time view - derive time from selectedMonth
        if (selectedMonth === 'FY 25') {
          currentTime = -1;
        } else if (selectedMonth === 'Q1 2025') {
          currentTime = -2;
        } else if (selectedMonth === 'Q2 2025') {
          currentTime = -3;
        } else if (selectedMonth === 'Q3 2025') {
          currentTime = -4;
        } else if (selectedMonth === 'Q4 2025') {
          currentTime = -5;
        } else {
          currentTime = months.indexOf(selectedMonth);
        }
        return selectedCell && 
               selectedCell.hierarchy === row.id && 
               selectedCell.kpi === columnName &&
               selectedCell.time === currentTime;
      }
    };

    // Helper function to get time value for data attributes
    const getTimeValueForDataAttr = () => {
      if (selectedMonth === 'FY 25') return -1;
      if (selectedMonth === 'Q1 2025') return -2;
      if (selectedMonth === 'Q2 2025') return -3;
      if (selectedMonth === 'Q3 2025') return -4;
      if (selectedMonth === 'Q4 2025') return -5;
      return months.indexOf(selectedMonth);
    };

    // Helper function to calculate aggregate from all top-level rows in a dataset
    const calculateAggregateForMonth = (monthData, metricName) => {
      if (!monthData || !Array.isArray(monthData) || monthData.length === 0) {
        return 0;
      }
      
        // Get top-level rows (exclude only the "Total" aggregate row we create)
        // In "Account, Product" view, monthData might be [northAmericaNode] (single element with id 'aggregate' or 'magnadrive')
        // In "Product, Account" view, monthData might be [transmissionNode, chassisNode] (multiple elements)
        // After filtering, we want to sum all top-level rows (including "MagnaDrive North America" even if id is 'aggregate')
        const topLevelRows = monthData.filter(r => r && r.id !== 'total-aggregate');
      let total = 0;
      topLevelRows.forEach(topRow => {
        const value = getMetricValue(topRow, metricName);
        if (value !== undefined && value !== null) {
          total += value || 0;
        }
      });
      return total;
    };

    // Helper function to get time index for edited values
    const getTimeIndexForEditedValue = () => {
      if (view === 'Time Roll-up') {
        return selectedCell?.time !== undefined ? selectedCell.time : -1;
      } else if (selectedMonth === 'FY 25') {
        return -1;
      } else if (selectedMonth === 'Q1 2025') {
        return -2;
      } else if (selectedMonth === 'Q2 2025') {
        return -3;
      } else if (selectedMonth === 'Q3 2025') {
        return -4;
      } else if (selectedMonth === 'Q4 2025') {
        return -5;
      } else {
        return months.indexOf(selectedMonth);
      }
    };

    // Helper function to get cell value - handles quarters by summing months
    const getCellValueForSpecificTime = (metricName) => {
      const timeIndex = getTimeIndexForEditedValue();
      const editedValue = getEditedValue(row.id, metricName, timeIndex);
      
      // For Time Roll-up view, aggregate row should use its own values directly
      // For Specific Time view, calculate from all top-level rows based on selectedMonth
      if (row.id === 'total-aggregate') {
        // If view is Time Roll-up, use row's own values (they're already calculated)
        if (view === 'Time Roll-up') {
          let value;
          if (editedValue !== null) {
            value = editedValue;
          } else {
            value = getMetricValue(row, metricName);
            if (value === undefined || value === null) return '-';
          }
          
          if (metricName === 'SM Adjustment [Read-Only]' || metricName === 'RSD Adjustment [Read-Only]') {
            return value !== 0 ? (value > 0 ? `+$${value.toLocaleString()}` : `-$${Math.abs(value).toLocaleString()}`) : '-';
          }
          return value !== 0 ? `$${value.toLocaleString()}` : '-';
        }
        
        // For Specific Time view, calculate from all top-level rows
        let total = 0;
        
        // If a quarter is selected, calculate quarter total from all months in quarter
        if (selectedMonth === 'Q1 2025' || selectedMonth === 'Q2 2025' || selectedMonth === 'Q3 2025' || selectedMonth === 'Q4 2025') {
          const quarterMonths = selectedMonth === 'Q1 2025' ? [0, 1, 2] :
                                selectedMonth === 'Q2 2025' ? [3, 4, 5] :
                                selectedMonth === 'Q3 2025' ? [6, 7, 8] :
                                [9, 10, 11]; // Q4
          
          quarterMonths.forEach(monthIdx => {
            const monthData = allMonthsData[monthIdx];
            if (monthData) {
              total += calculateAggregateForMonth(monthData, metricName);
            }
          });
        } 
        // For FY 25, calculate sum from all months
        else if (selectedMonth === 'FY 25') {
          months.forEach((month, idx) => {
            const monthData = allMonthsData[idx];
            if (monthData) {
              total += calculateAggregateForMonth(monthData, metricName);
            }
          });
        }
        // For specific months
        else {
          const monthIndex = months.indexOf(selectedMonth);
          if (monthIndex >= 0 && monthIndex <= 11) {
            const monthData = allMonthsData[monthIndex];
            if (monthData) {
              total = calculateAggregateForMonth(monthData, metricName);
            }
          }
        }
        
        // Format based on metric type
        if (metricName === 'SM Adjustment [Read-Only]' || metricName === 'RSD Adjustment [Read-Only]') {
          return total !== 0 ? (total > 0 ? `+$${total.toLocaleString()}` : `-$${Math.abs(total).toLocaleString()}`) : '-';
        }
        return total !== 0 ? `$${total.toLocaleString()}` : '-';
      }
      
      // For regular rows, check for edited value first
      let value;
      if (editedValue !== null) {
        // If edited value exists, use it directly
        value = editedValue;
      } else {
        // For regular rows, use existing logic
        // If a quarter is selected, calculate quarter total
        if (selectedMonth === 'Q1 2025' || selectedMonth === 'Q2 2025' || selectedMonth === 'Q3 2025' || selectedMonth === 'Q4 2025') {
          const quarterMonths = selectedMonth === 'Q1 2025' ? [0, 1, 2] :
                                selectedMonth === 'Q2 2025' ? [3, 4, 5] :
                                selectedMonth === 'Q3 2025' ? [6, 7, 8] :
                                [9, 10, 11]; // Q4
          
          let total = 0;
          quarterMonths.forEach(monthIdx => {
            const monthData = allMonthsData[monthIdx];
            const rowData = findRowById(monthData, row.id);
            if (rowData) {
              const cellValue = getEditedValue(row.id, metricName, monthIdx);
              if (cellValue !== null) {
                total += cellValue;
              } else {
                const val = getMetricValue(rowData, metricName);
                if (val !== undefined) {
                  total += val;
                }
              }
            }
          });
          
          value = total;
        }
        // For FY 25, calculate sum from all months (consistent with Time Series)
        else if (selectedMonth === 'FY 25') {
          let total = 0;
          months.forEach((month, idx) => {
            const monthData = allMonthsData[idx];
            const rowData = findRowById(monthData, row.id);
            if (rowData) {
              const cellValue = getEditedValue(row.id, metricName, idx);
              if (cellValue !== null) {
                total += cellValue;
              } else {
                const val = getMetricValue(rowData, metricName);
                if (val !== undefined) {
                  total += val;
                }
              }
            }
          });
          
          value = total;
        }
        // For months, use value from the specific month's data (consistent with Time Series)
        else {
          const monthIndex = months.indexOf(selectedMonth);
          if (monthIndex >= 0 && monthIndex <= 11) {
            const monthData = allMonthsData[monthIndex];
            const rowData = findRowById(monthData, row.id);
            if (rowData) {
              value = getMetricValue(rowData, metricName);
              if (value === undefined) return '-';
            } else {
              return '-';
            }
          } else {
            // Fallback to row value if month not found
            value = getMetricValue(row, metricName);
            if (value === undefined) return '-';
          }
        }
      }
      
      // Format based on metric type
      if (metricName === 'SM Adjustment [Read-Only]' || metricName === 'RSD Adjustment [Read-Only]') {
        return value !== 0 ? (value > 0 ? `+$${value.toLocaleString()}` : `-$${Math.abs(value).toLocaleString()}`) : '-';
      }
      return `$${value.toLocaleString()}`;
    };

    return (
      <>
        <div className={`table-row ${hasChildren ? 'parent-row' : 'child-row'}`}>
          <div className="cell name-cell" style={{ paddingLeft: `${20 + indent}px`, display: 'flex', alignItems: 'center', gap: '4px' }}>
            {hasChildren && (
              <button 
                className="expand-button"
                onClick={() => toggleRow(row.id)}
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            <span className={hasChildren ? 'parent-text' : 'child-text'} style={{ flex: 1, fontWeight: row.id === 'total-aggregate' ? 'bold' : 'normal' }}>
              {row.name}
            </span>
            {/* Show filter button for parent rows */}
            {hasChildren && row.children && row.children.length > 0 && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setChildFilterOpen(childFilterOpen === row.id ? null : row.id);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#706e6b',
                    fontSize: '14px',
                    lineHeight: '1',
                    width: '18px',
                    height: '18px'
                  }}
                  title="Filter children"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 1H1L6 7.5V11.5L8 12.5V7.5L13 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                </button>
                {childFilterOpen === row.id && ReactDOM.createPortal(
                  <div
                    ref={childFilterPopoverRef}
                    style={{
                      position: 'fixed',
                      top: '0px',
                      left: '0px',
                      padding: '8px 0',
                      backgroundColor: '#ffffff',
                      border: '1px solid #c9c9c9',
                      borderRadius: '4px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                      zIndex: 99999,
                      minWidth: '200px',
                      maxWidth: '300px',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      display: 'none'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ padding: '0 12px 8px 12px', fontSize: '12px', fontWeight: '600', color: '#080707', borderBottom: '1px solid #dddbda', marginBottom: '4px' }}>
                      Filter Children
                    </div>
                    {row.children.map((child) => {
                      const childSelections = childFilterSelections[row.id] || new Set();
                      const isSelected = !childSelections.has(child.id); // If not in filter, show by default (all selected)
                      
                      return (
                        <label
                          key={child.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: '#080707',
                            userSelect: 'none'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f2f2'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              setChildFilterSelections(prev => {
                                const parentSelections = prev[row.id] || new Set();
                                const newSelections = new Set(parentSelections);
                                
                                if (e.target.checked) {
                                  newSelections.delete(child.id); // Remove from filter = show
                                } else {
                                  newSelections.add(child.id); // Add to filter = hide
                                }
                                
                                return {
                                  ...prev,
                                  [row.id]: newSelections.size > 0 ? newSelections : undefined
                                };
                              });
                            }}
                            style={{
                              marginRight: '8px',
                              cursor: 'pointer',
                              width: '14px',
                              height: '14px'
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span>{child.name}</span>
                        </label>
                      );
                    })}
                  </div>,
                  document.body
                )}
              </div>
            )}
            {/* Show hierarchy info button for products when intermediate levels are disabled */}
            {!hasChildren && row._hierarchyPath && row._hierarchyPath.length > 2 && selectedKAMView === 'Account Director View' && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setProductPopoverOpen(productPopoverOpen === row.id ? null : row.id);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#706e6b',
                    fontSize: '14px',
                    lineHeight: '1',
                    width: '18px',
                    height: '18px'
                  }}
                  title="Show hierarchy path"
                >
                  ⓘ
                </button>
                {productPopoverOpen === row.id && ReactDOM.createPortal(
                  <>
                    <div
                      ref={productPopoverRef}
                      style={{
                        position: 'fixed',
                        top: '0px',
                        left: '0px',
                        padding: '8px 12px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #c9c9c9',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                        zIndex: 99999,
                        fontSize: '12px',
                        color: '#706e6b',
                        minWidth: '200px',
                        maxWidth: '400px',
                        wordWrap: 'break-word',
                        lineHeight: '1.4',
                        display: 'none'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(() => {
                        if (!row._hierarchyPath || row._hierarchyPath.length === 0) {
                          return row.name;
                        }
                        const enabledParts = row._hierarchyPath
                          .filter(p => p && p.levelType && selectedLevels.has(p.levelType))
                          .map(p => p.name);
                        const disabledParts = row._hierarchyPath
                          .filter(p => p && p.levelType && !selectedLevels.has(p.levelType))
                          .map(p => p.name);
                        
                        // Combine and remove duplicates while preserving order
                        const allParts = [...enabledParts, ...disabledParts];
                        const uniqueParts = [];
                        const seen = new Set();
                        
                        // Add parts in order, skipping duplicates
                        for (const part of allParts) {
                          if (part && !seen.has(part)) {
                            uniqueParts.push(part);
                            seen.add(part);
                          }
                        }
                        
                        // Add row.name only if it's not already in the path
                        if (row.name && !seen.has(row.name)) {
                          uniqueParts.push(row.name);
                        }
                        
                        return uniqueParts.join(' > ');
                      })()}
                    </div>
                    {/* Arrow/nubbin pointing to the button */}
                    <div
                      id="product-popover-arrow"
                      style={{
                        position: 'fixed',
                        top: '0px',
                        left: '0px',
                        width: '0',
                        height: '0',
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: 'none',
                        borderBottom: 'none',
                        zIndex: 99998,
                        display: 'none'
                      }}
                    />
                    <div
                      id="product-popover-arrow-inner"
                      style={{
                        position: 'fixed',
                        top: '0px',
                        left: '0px',
                        width: '0',
                        height: '0',
                        borderLeft: '5px solid transparent',
                        borderRight: '5px solid transparent',
                        borderTop: 'none',
                        borderBottom: 'none',
                        zIndex: 99999,
                        display: 'none'
                      }}
                    />
                  </>,
                  document.body
                )}
              </div>
            )}
          </div>
          {(() => {
            const timeIdx = getTimeIndexForEditedValue();
            const monthIndex = timeIdx >= 0 && timeIdx <= 11 ? timeIdx : null;
            let monthDataForImpactCheck = null;
            if (monthIndex !== null && allMonthsData && allMonthsData[monthIndex]) {
              monthDataForImpactCheck = allMonthsData[monthIndex];
            } else if (view === 'Time Roll-up' && allMonthsData && allMonthsData.length > 0) {
              monthDataForImpactCheck = allMonthsData[0];
            }
            
            const baselineIsEdited = isCellEdited(row.id, 'Baseline (Revenue) [Read-Only]', timeIdx);
            const baselineIsImpacted = !baselineIsEdited && isCellImpacted(row.id, timeIdx, monthDataForImpactCheck);
            
            return (
              <>
                <div 
                  className={`cell ${isSelected('Baseline (Revenue) [Read-Only]') ? 'selected' : ''} ${baselineIsEdited ? 'cell-edited' : ''} ${baselineIsImpacted ? 'cell-impacted' : ''}`}
                  style={{ 
                    fontWeight: row.id === 'total-aggregate' ? 'bold' : 'normal', 
                    cursor: 'pointer',
                    backgroundColor: baselineIsEdited ? '#e8f5e9' : (baselineIsImpacted ? '#fff3e0' : undefined)
                  }}
                  onClick={() => handleCellClick('Baseline (Revenue) [Read-Only]', row.id, null, view)}
                  data-selected-hierarchy={row.id}
                  data-selected-time={view === 'Specific Time' ? getTimeValueForDataAttr() : (view === 'Time Roll-up' && selectedCell?.time !== undefined ? selectedCell.time : '')}
                  data-selected-kpi="Baseline (Revenue) [Read-Only]"
                >
                  {getCellValueForSpecificTime('Baseline (Revenue) [Read-Only]')}
                </div>
              </>
            );
          })()}
          {(() => {
            const timeIdx = getTimeIndexForEditedValue();
            const monthIndex = timeIdx >= 0 && timeIdx <= 11 ? timeIdx : null;
            let monthDataForImpactCheck = null;
            if (monthIndex !== null && allMonthsData && allMonthsData[monthIndex]) {
              monthDataForImpactCheck = allMonthsData[monthIndex];
            } else if (view === 'Time Roll-up' && allMonthsData && allMonthsData.length > 0) {
              monthDataForImpactCheck = allMonthsData[0];
            }
            const isEdited = isCellEdited(row.id, 'AM Adjusted (Revenue) [Editable]', timeIdx);
            const isImpacted = !isEdited && isCellImpacted(row.id, timeIdx, monthDataForImpactCheck);
            
            return (
              <div 
                className={`cell ${isSelected('AM Adjusted (Revenue) [Editable]') ? 'selected' : ''} ${isEdited ? 'cell-edited' : ''} ${isImpacted ? 'cell-impacted' : ''}`}
                style={{ 
                  fontWeight: row.id === 'total-aggregate' ? 'bold' : 'normal', 
                  cursor: 'pointer',
                  padding: editingCell && editingCell.rowId === row.id && editingCell.kpi === 'AM Adjusted (Revenue) [Editable]' && editingCell.timeIndex === timeIdx ? '0' : undefined,
                  backgroundColor: isEdited ? '#e8f5e9' : (isImpacted ? '#fff3e0' : undefined)
                }}
            onClick={(e) => {
              // Clear any existing timeout
              if (clickTimeoutRef.current) {
                clearTimeout(clickTimeoutRef.current);
              }
              
              // Delay click handler to allow double-click to be detected
              clickTimeoutRef.current = setTimeout(() => {
                // Only select if not currently editing this cell
                const timeIdx = getTimeIndexForEditedValue();
                const isCurrentlyEditing = editingCell && editingCell.rowId === row.id && editingCell.kpi === 'AM Adjusted (Revenue) [Editable]' && editingCell.timeIndex === timeIdx;
                if (!isCurrentlyEditing) {
                  handleCellClick('AM Adjusted (Revenue) [Editable]', row.id, null, view);
                }
                clickTimeoutRef.current = null;
              }, 250);
            }}
            onDoubleClick={(e) => {
              // Double-click starts editing (only for editable cells)
              if (isKpiEditable('AM Adjusted (Revenue) [Editable]')) {
                e.preventDefault();
                e.stopPropagation();
                
                // Clear the click timeout immediately
                if (clickTimeoutRef.current) {
                  clearTimeout(clickTimeoutRef.current);
                  clickTimeoutRef.current = null;
                }
                
                const timeIdx = getTimeIndexForEditedValue();
                const editedVal = getEditedValue(row.id, 'AM Adjusted (Revenue) [Editable]', timeIdx);
                let currentValue = 0;
                if (editedVal !== null) {
                  currentValue = editedVal;
                } else if (view === 'Time Roll-up') {
                  currentValue = getMetricValue(row, 'AM Adjusted (Revenue) [Editable]') || 0;
                } else {
                  const monthIdx = months.indexOf(selectedMonth);
                  if (monthIdx >= 0) {
                    const monthData = allMonthsData[monthIdx];
                    const rowData = findRowById(monthData, row.id);
                    if (rowData) {
                      currentValue = getMetricValue(rowData, 'AM Adjusted (Revenue) [Editable]') || 0;
                    }
                  }
                }
                handleCellDoubleClick(row.id, 'AM Adjusted (Revenue) [Editable]', timeIdx, currentValue);
              }
            }}
            data-selected-hierarchy={row.id}
            data-selected-time={view === 'Specific Time' ? getTimeValueForDataAttr() : (view === 'Time Roll-up' && selectedCell?.time !== undefined ? selectedCell.time : '')}
            data-selected-kpi="AM Adjusted (Revenue) [Editable]"
          >
            {editingCell && editingCell.rowId === row.id && editingCell.kpi === 'AM Adjusted (Revenue) [Editable]' && editingCell.timeIndex === getTimeIndexForEditedValue() ? (
              <input
                type="text"
                autoFocus
                defaultValue={editingCell.currentValue !== undefined ? `$${editingCell.currentValue.toLocaleString()}` : ''}
                onBlur={(e) => {
                  handleSaveEdit(row.id, 'AM Adjusted (Revenue) [Editable]', getTimeIndexForEditedValue(), e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveEdit(row.id, 'AM Adjusted (Revenue) [Editable]', getTimeIndexForEditedValue(), e.target.value);
                  } else if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: '2px solid black',
                    outline: 'none',
                    padding: '4px 8px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    background: 'white',
                    textAlign: 'right',
                    boxShadow: '0 0 8px rgba(2, 80, 217, 0.5)',
                    boxSizing: 'border-box'
                  }}
              />
            ) : (
              getCellValueForSpecificTime('AM Adjusted (Revenue) [Editable]')
            )}
          </div>
            );
          })()}
          {(() => {
            const timeIdx = getTimeIndexForEditedValue();
            const monthIndex = timeIdx >= 0 && timeIdx <= 11 ? timeIdx : null;
            let monthDataForImpactCheck = null;
            if (monthIndex !== null && allMonthsData && allMonthsData[monthIndex]) {
              monthDataForImpactCheck = allMonthsData[monthIndex];
            } else if (view === 'Time Roll-up' && allMonthsData && allMonthsData.length > 0) {
              monthDataForImpactCheck = allMonthsData[0];
            }
            
            const renderCell = (kpiName) => {
              const isEdited = isCellEdited(row.id, kpiName, timeIdx);
              const isImpacted = !isEdited && isCellImpacted(row.id, timeIdx, monthDataForImpactCheck);
              
              return (
                <div 
                  className={`cell ${isSelected(kpiName) ? 'selected' : ''} ${isEdited ? 'cell-edited' : ''} ${isImpacted ? 'cell-impacted' : ''}`}
                  style={{ 
                    fontWeight: row.id === 'total-aggregate' ? 'bold' : 'normal', 
                    cursor: 'pointer',
                    backgroundColor: isEdited ? '#e8f5e9' : (isImpacted ? '#fff3e0' : undefined)
                  }}
                  onClick={() => handleCellClick(kpiName, row.id, null, view)}
                  data-selected-hierarchy={row.id}
                  data-selected-time={view === 'Specific Time' ? getTimeValueForDataAttr() : (view === 'Time Roll-up' && selectedCell?.time !== undefined ? selectedCell.time : '')}
                  data-selected-kpi={kpiName}
                >
                  {getCellValueForSpecificTime(kpiName)}
                </div>
              );
            };
            
            return (
              <>
                {renderCell('SM Adjustment [Read-Only]')}
                {renderCell('RSD Adjustment [Read-Only]')}
                {renderCell('Final Forecast (Revenue) [Read-Only]')}
              </>
            );
          })()}
        </div>
        {hasChildren && isExpanded && (() => {
          // Filter children based on childFilterSelections
          const filteredChildren = row.children.filter(child => {
            const parentSelections = childFilterSelections[row.id];
            if (!parentSelections || parentSelections.size === 0) {
              return true; // No filter = show all
            }
            return !parentSelections.has(child.id); // Show if not in filter (filter contains hidden items)
          });
          
          return filteredChildren.map(child => (
            <Row key={child.id} row={child} level={level + 1} view={view} />
          ));
        })()}
      </>
    );
  };

  // Render Global Filter Panel
  const renderGlobalFilterPanel = () => {
    if (!globalFilterPanelOpen) return null;

    const filterableFields = [
      { label: 'Hierarchy Name', value: 'hierarchyName' },
      { label: 'Baseline Revenue', value: 'baseline' },
      { label: 'AM Adjusted Revenue', value: 'amAdjusted' },
      { label: 'SM Adjustment', value: 'smAdjustment' },
      { label: 'RSD Adjustment', value: 'rsdAdjustment' },
      { label: 'Final Forecast Revenue', value: 'finalForecast' }
    ];

    const operators = [
      { label: 'equals', value: 'equals' },
      { label: 'not equal to', value: 'notEqual' },
      { label: 'greater than', value: 'greaterThan' },
      { label: 'less than', value: 'lessThan' },
      { label: 'greater or equal', value: 'greaterOrEqual' },
      { label: 'less or equal', value: 'lessOrEqual' },
      { label: 'contains', value: 'contains' },
      { label: 'does not contain', value: 'notContains' }
    ];

    const addFilter = () => {
      setGlobalFilters([...globalFilters, {
        id: Date.now(),
        field: 'hierarchyName',
        operator: 'contains',
        value: ''
      }]);
    };

    const removeFilter = (id) => {
      setGlobalFilters(globalFilters.filter(f => f.id !== id));
    };

    const updateFilter = (id, updates) => {
      setGlobalFilters(globalFilters.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const clearAllFilters = () => {
      setGlobalFilters([]);
    };

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '320px',
          height: '100vh',
          backgroundColor: '#ffffff',
          boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.15)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          transform: 'translateX(0)',
          transition: 'transform 0.3s ease'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1rem',
          borderBottom: '1px solid #dddbda',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#fafaf9'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 1H1L6 7.5V13.5L10 15.5V7.5L15 1Z" stroke="#706e6b" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <h2 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#080707', margin: 0 }}>
              Filters
            </h2>
            {globalFilters.length > 0 && (
              <span style={{
                backgroundColor: '#0176d3',
                color: '#ffffff',
                borderRadius: '0.75rem',
                padding: '0 0.5rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                minWidth: '1.5rem',
                height: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {globalFilters.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setGlobalFilterPanelOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#706e6b'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Filter List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {globalFilters.length === 0 ? (
            <div style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: '#706e6b',
              fontSize: '0.875rem'
            }}>
              No filters applied
            </div>
          ) : (
            globalFilters.map((filter) => (
              <div
                key={filter.id}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  backgroundColor: '#fafaf9',
                  borderRadius: '0.25rem',
                  border: '1px solid #dddbda'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#080707' }}>
                    Filter {globalFilters.indexOf(filter) + 1}
                  </span>
                  <button
                    onClick={() => removeFilter(filter.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#706e6b'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                
                {/* Field Dropdown */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.75rem', color: '#706e6b', marginBottom: '0.25rem', display: 'block' }}>
                    Field
                  </label>
                  <select
                    value={filter.field}
                    onChange={(e) => updateFilter(filter.id, { field: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.375rem 0.5rem',
                      border: '1px solid #c9c9c9',
                      borderRadius: '0.25rem',
                      fontSize: '0.875rem',
                      backgroundColor: '#ffffff',
                      cursor: 'pointer'
                    }}
                  >
                    {filterableFields.map(field => (
                      <option key={field.value} value={field.value}>{field.label}</option>
                    ))}
                  </select>
                </div>

                {/* Operator Dropdown */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.75rem', color: '#706e6b', marginBottom: '0.25rem', display: 'block' }}>
                    Operator
                  </label>
                  <select
                    value={filter.operator}
                    onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.375rem 0.5rem',
                      border: '1px solid #c9c9c9',
                      borderRadius: '0.25rem',
                      fontSize: '0.875rem',
                      backgroundColor: '#ffffff',
                      cursor: 'pointer'
                    }}
                  >
                    {operators.map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                </div>

                {/* Value Input */}
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#706e6b', marginBottom: '0.25rem', display: 'block' }}>
                    Value
                  </label>
                  <input
                    type="text"
                    value={filter.value}
                    onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                    placeholder="Enter value"
                    style={{
                      width: '100%',
                      padding: '0.375rem 0.5rem',
                      border: '1px solid #c9c9c9',
                      borderRadius: '0.25rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem',
          borderTop: '1px solid #dddbda',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <button
            onClick={addFilter}
            style={{
              width: '100%',
              padding: '0.5rem',
              backgroundColor: '#ffffff',
              border: '1px solid #0176d3',
              borderRadius: '0.25rem',
              color: '#0176d3',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f8ff'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
          >
            Add Filter
          </button>
          {globalFilters.length > 0 && (
            <button
              onClick={clearAllFilters}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: '#ffffff',
                border: '1px solid #c9c9c9',
                borderRadius: '0.25rem',
                color: '#706e6b',
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f2f2'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
            >
              Clear All
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Global Filter Panel */}
      {renderGlobalFilterPanel()}
      {/* Global Search Bar */}
      <div style={{ 
        padding: '12px 24px', 
        backgroundColor: '#ffffff', 
        borderBottom: '1px solid #dddbda',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          flex: '1',
          maxWidth: '400px'
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, color: '#706e6b' }}>
            <path d="M11.3333 9.66667H10.7267L10.4533 9.4C11.4067 8.26 12 6.79333 12 5.16667C12 2.32667 9.67333 0 6.83333 0C3.99333 0 1.66667 2.32667 1.66667 5.16667C1.66667 8.00667 3.99333 10.3333 6.83333 10.3333C8.46 10.3333 9.92667 9.74 11.0667 8.78667L11.3333 9.06V9.66667ZM6.83333 9C4.80667 9 3.16667 7.36 3.16667 5.33333C3.16667 3.30667 4.80667 1.66667 6.83333 1.66667C8.86 1.66667 10.5 3.30667 10.5 5.33333C10.5 7.36 8.86 9 6.83333 9Z" fill="currentColor"/>
          </svg>
          <input
            type="text"
            id="global-search-input"
            name="global-search-input"
            placeholder="Search across all data..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            style={{
              flex: '1',
              padding: '8px 12px',
              fontSize: '13px',
              border: '1px solid #c9c9c9',
              borderRadius: '4px',
              outline: 'none',
              fontFamily: 'inherit'
            }}
            onFocus={(e) => e.target.style.borderColor = '#0250d9'}
            onBlur={(e) => e.target.style.borderColor = '#c9c9c9'}
          />
          {globalSearch && (
            <button
              onClick={() => setGlobalSearch('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#706e6b',
                borderRadius: '2px'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f2f2'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              title="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 4L4 9M4 4L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* KAM View Tabs - At the very top */}
      <div className="kam-view-container">
        <div className="kam-view-tabs">
          {kamViewOptions.map((option, index) => (
            <button
              key={option}
              className={`kam-view-button ${selectedKAMView === option ? 'active' : ''} ${index === 0 ? 'first' : ''} ${index === kamViewOptions.length - 1 ? 'last' : ''}`}
              onClick={() => setSelectedKAMView(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      
      {/* Account Manager View - Original functionality */}
      {selectedKAMView === 'Account Manager View' && (
        <div className="title-and-buttons-container">
          <div className="header-title">MagnaDrive - North America Forecast</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="button-group">
            {viewOptions.map((option, index) => (
              <button
                key={option}
                className={`view-button ${selectedView === option ? 'active' : ''} ${index === 0 ? 'first' : ''} ${index === viewOptions.length - 1 ? 'last' : ''}`}
                onClick={() => setSelectedView(option)}
              >
                {option}
              </button>
            ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Account Manager View Content */}
      {selectedKAMView === 'Account Manager View' && selectedView === 'Specific Time' && (
        <div className="simple-grid">
          <div className="headers-wrapper">
            <div className="first-column-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
              <div 
                className="sortable-header" 
                onClick={() => handleColumnHeaderClick('hierarchy:name')}
                style={{ 
                  cursor: 'pointer', 
                  width: '100%', 
                  padding: '4px 8px',
                  marginBottom: '4px',
                  fontWeight: '600',
                  userSelect: 'none'
                }}
              >
                Name{renderSortIndicator('hierarchy:name')}
              </div>
              <div style={{ position: 'relative', marginTop: '4px', width: '100%', marginBottom: '8px' }}>
                <input
                  type="text"
                  id="hierarchy-filter-input"
                  name="hierarchy-filter-input"
                  className="hierarchy-filter-input"
                  value={hierarchyFilter}
                  onChange={(e) => setHierarchyFilter(e.target.value)}
                  placeholder="Filter..."
                  style={{
                    width: '100%',
                    padding: '4px 20px 4px 6px',
                    fontSize: '11px',
                    border: hierarchyFilter ? '1px solid #0176d3' : '1px solid #c9c9c9',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                    backgroundColor: hierarchyFilter ? '#f0f8ff' : '#ffffff'
                  }}
                />
                {hierarchyFilter && (
                  <button
                    onClick={() => setHierarchyFilter('')}
                    style={{
                      position: 'absolute',
                      right: '4px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontSize: '12px',
                      color: '#666',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '3px',
                      transition: 'background-color 0.2s',
                      lineHeight: '1'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    title="Clear filter"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div className="month-selector-header">
              <div className="month-selector-cell" style={{ display: 'flex', justifyContent: 'center' }}>
                <SearchableDropdown
                  value={selectedMonth}
                  options={(() => {
                    const filtered = [];
                    if (selectedTimeLevels.has('Year')) filtered.push('FY 25');
                    if (selectedTimeLevels.has('Month')) {
                      filtered.push(...months);
                    }
                    return filtered;
                  })()}
                  onChange={(newMonth) => {
                    // For FY 25, use -1 as time index, otherwise use month index
                    const monthIndex = newMonth === 'FY 25' ? -1 : months.indexOf(newMonth);
                    setSelectedMonth(newMonth);
                    
                    // Update BB cell directly if it exists
                    if (selectedCell && selectedCell.hierarchy && selectedCell.kpi) {
                      setSelectedCell({
                        ...selectedCell,
                        time: monthIndex
                      });
                    }
                  }}
                  placeholder="select time"
                />
              </div>
            </div>
            
            <div className="table-header">
              <div 
                className="cell header-cell sortable-header" 
                onClick={() => handleColumnHeaderClick('kpi:Baseline (Revenue) [Read-Only]')}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  gap: '4px',
                  minWidth: 0
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    Baseline (Revenue) 📖
                  </span>
                  {renderSortIndicator('kpi:Baseline (Revenue) [Read-Only]')}
                </div>
                {renderFilterInput('kpi:Baseline (Revenue) [Read-Only]')}
              </div>
              <div 
                className="cell header-cell sortable-header" 
                onClick={() => handleColumnHeaderClick('kpi:AM Adjusted (Revenue) [Editable]')}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  gap: '4px',
                  minWidth: 0
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    AM Adjusted (Revenue) ✏️
                  </span>
                  {renderSortIndicator('kpi:AM Adjusted (Revenue) [Editable]')}
                </div>
                {renderFilterInput('kpi:AM Adjusted (Revenue) [Editable]')}
              </div>
              <div 
                className="cell header-cell sortable-header" 
                onClick={() => handleColumnHeaderClick('kpi:SM Adjustment [Read-Only]')}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  gap: '4px',
                  minWidth: 0
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    SM Adjustment 📖
                  </span>
                  {renderSortIndicator('kpi:SM Adjustment [Read-Only]')}
                </div>
                {renderFilterInput('kpi:SM Adjustment [Read-Only]')}
              </div>
              <div 
                className="cell header-cell sortable-header" 
                onClick={() => handleColumnHeaderClick('kpi:RSD Adjustment [Read-Only]')}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  gap: '4px',
                  minWidth: 0
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    RSD Adjustment 📖
                  </span>
                  {renderSortIndicator('kpi:RSD Adjustment [Read-Only]')}
                </div>
                {renderFilterInput('kpi:RSD Adjustment [Read-Only]')}
              </div>
              <div 
                className="cell header-cell sortable-header" 
                onClick={() => handleColumnHeaderClick('kpi:Final Forecast (Revenue) [Read-Only]')}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  gap: '4px',
                  minWidth: 0
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    Final Forecast (Revenue) 📖
                  </span>
                  {renderSortIndicator('kpi:Final Forecast (Revenue) [Read-Only]')}
                </div>
                {renderFilterInput('kpi:Final Forecast (Revenue) [Read-Only]')}
              </div>
            </div>
          </div>
          
          <div className="table-content">
            {sortedDisplayedData.map(row => (
              <Row key={row.id} row={row} view={selectedView} />
            ))}
          </div>
        </div>
      )}

      {selectedKAMView === 'Account Manager View' && selectedView === 'Time series' && (
        <div className="simple-grid grid-timeseries">
          <div className="headers-wrapper">
            <div className="first-column-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
              <div 
                className="sortable-header" 
                onClick={() => handleColumnHeaderClick('hierarchy:name')}
                style={{ 
                  cursor: 'pointer', 
                  width: '100%', 
                  padding: '4px 8px',
                  marginBottom: '4px',
                  fontWeight: '600',
                  userSelect: 'none'
                }}
              >
                Name{renderSortIndicator('hierarchy:name')}
              </div>
              <div style={{ position: 'relative', marginTop: '4px', width: '100%', marginBottom: '8px', display: 'block', visibility: 'visible', opacity: 1, minHeight: '24px' }}>
                <input
                  type="text"
                  id="hierarchy-filter-input"
                  name="hierarchy-filter-input"
                  className="hierarchy-filter-input"
                  value={hierarchyFilter}
                  onChange={(e) => setHierarchyFilter(e.target.value)}
                  placeholder="Filter..."
                  style={{
                    width: '100%',
                    padding: '4px 20px 4px 6px',
                    fontSize: '11px',
                    border: hierarchyFilter ? '1px solid #0176d3' : '1px solid #c9c9c9',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                    backgroundColor: hierarchyFilter ? '#f0f8ff' : '#ffffff',
                    display: 'block',
                    visibility: 'visible',
                    opacity: 1,
                    position: 'relative',
                    zIndex: 10,
                    height: '24px',
                    minHeight: '24px',
                    lineHeight: '24px'
                  }}
                />
                {hierarchyFilter && (
                  <button
                    onClick={() => setHierarchyFilter('')}
                    style={{
                      position: 'absolute',
                      right: '4px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontSize: '12px',
                      color: '#666',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '3px',
                      transition: 'background-color 0.2s',
                      lineHeight: '1'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    title="Clear filter"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div className="month-selector-header">
              <div className="timeseries-header-center">
                <SearchableDropdown
                  value={lastSelectedCell || ''}
                  options={kpiOptions}
                  onChange={(newKPI) => {
                    setLastSelectedCell(newKPI);
                    
                    // Update BB cell directly if it exists
                    if (selectedCell && selectedCell.hierarchy && selectedCell.time !== undefined) {
                      setSelectedCell({
                        ...selectedCell,
                        kpi: newKPI
                      });
                    }
                  }}
                  displayFormatter={getTimeSeriesKPIDisplay}
                  placeholder="select KPI"
                  style={{ fontSize: '14px', fontWeight: '600' }}
                />
              </div>
            </div>
            
            <div className="table-header">
              {selectedTimeLevels.has('Year') && (
              <div 
                className="cell header-cell sortable-header" 
                onClick={() => handleColumnHeaderClick('time:-1')}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  gap: '4px',
                  minWidth: 0
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    FY 25
                  </span>
                  {renderSortIndicator('time:-1')}
                </div>
                {renderFilterInput('time:-1')}
              </div>
              )}
              {selectedTimeLevels.has('Month') && monthNames.map((month, idx) => (
                <div 
                  key={month} 
                  className="cell header-cell sortable-header"
                  onClick={() => handleColumnHeaderClick(`time:${idx}`)}
                  style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                >
                  <div style={{ 
                    width: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'flex-end',
                    gap: '4px',
                    minWidth: 0
                  }}>
                    <span style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      flex: '1 1 auto',
                      minWidth: 0
                    }}>
                      {month}
                    </span>
                    {renderSortIndicator(`time:${idx}`)}
                  </div>
                  {renderFilterInput(`time:${idx}`)}
                </div>
              ))}
            </div>
          </div>
          
          <div className="table-content">
            {sortedDisplayedData.map(row => (
              <Row key={row.id} row={row} view={selectedView} />
            ))}
          </div>
        </div>
      )}

      {selectedKAMView === 'Account Manager View' && selectedView === 'Time Roll-up' && (
        <div className="simple-grid">
          <div className="headers-wrapper">
            <div className="first-column-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
              <div 
                className="sortable-header" 
                onClick={() => handleColumnHeaderClick('hierarchy:name')}
                style={{ 
                  cursor: 'pointer', 
                  width: '100%', 
                  padding: '4px 8px',
                  marginBottom: '4px',
                  fontWeight: '600',
                  userSelect: 'none'
                }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px'
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    Time
                  </span>
                  {renderSortIndicator('hierarchy:name')}
                </div>
              </div>
              <div style={{ position: 'relative', marginTop: '4px', width: '100%', marginBottom: '8px' }}>
                <input
                  type="text"
                  className="hierarchy-filter-input"
                  id="time-hierarchy-filter-input"
                  name="time-hierarchy-filter-input"
                  value={timeHierarchyFilter}
                  onChange={(e) => setTimeHierarchyFilter(e.target.value)}
                  placeholder="Filter..."
                  style={{
                    width: '100%',
                    padding: '4px 20px 4px 6px',
                    fontSize: '11px',
                    border: timeHierarchyFilter ? '1px solid #0176d3' : '1px solid #c9c9c9',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                    backgroundColor: timeHierarchyFilter ? '#f0f8ff' : '#ffffff'
                  }}
                />
                {timeHierarchyFilter && (
                  <button
                    onClick={() => setTimeHierarchyFilter('')}
                    style={{
                      position: 'absolute',
                      right: '4px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontSize: '12px',
                      color: '#666',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '3px',
                      transition: 'background-color 0.2s',
                      lineHeight: '1'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    title="Clear filter"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div className="month-selector-header">
              <div className="month-selector-cell" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <SearchableDropdown
                  value={(selectedCell.hierarchy && allHierarchies.find(h => h.id === selectedCell.hierarchy)) ? selectedCell.hierarchy : (allHierarchies[0]?.id || '')}
                  options={allHierarchies.map(h => ({ value: h.id, label: h.name, meta: h.meta }))}
                  onChange={(newHierarchy) => {
                    setSelectedCell({
                      ...selectedCell,
                      hierarchy: newHierarchy
                    });
                  }}
                  placeholder="select dimension"
                  style={{ fontSize: '14px', fontWeight: '600' }}
                />
              </div>
            </div>
            
            <div className="table-header">
              <div 
                className="cell header-cell sortable-header" 
                onClick={() => handleColumnHeaderClick('kpi:Baseline (Revenue) [Read-Only]')}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  gap: '4px',
                  minWidth: 0
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    Baseline (Revenue) 📖
                  </span>
                  {renderSortIndicator('kpi:Baseline (Revenue) [Read-Only]')}
                </div>
                {renderFilterInput('kpi:Baseline (Revenue) [Read-Only]')}
              </div>
              <div 
                className="cell header-cell sortable-header" 
                onClick={() => handleColumnHeaderClick('kpi:AM Adjusted (Revenue) [Editable]')}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  gap: '4px',
                  minWidth: 0
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    AM Adjusted (Revenue) ✏️
                  </span>
                  {renderSortIndicator('kpi:AM Adjusted (Revenue) [Editable]')}
                </div>
                {renderFilterInput('kpi:AM Adjusted (Revenue) [Editable]')}
              </div>
              <div 
                className="cell header-cell sortable-header" 
                onClick={() => handleColumnHeaderClick('kpi:SM Adjustment [Read-Only]')}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  gap: '4px',
                  minWidth: 0
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    SM Adjustment 📖
                  </span>
                  {renderSortIndicator('kpi:SM Adjustment [Read-Only]')}
                </div>
                {renderFilterInput('kpi:SM Adjustment [Read-Only]')}
              </div>
              <div 
                className="cell header-cell sortable-header" 
                onClick={() => handleColumnHeaderClick('kpi:RSD Adjustment [Read-Only]')}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  gap: '4px',
                  minWidth: 0
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    RSD Adjustment 📖
                  </span>
                  {renderSortIndicator('kpi:RSD Adjustment [Read-Only]')}
                </div>
                {renderFilterInput('kpi:RSD Adjustment [Read-Only]')}
              </div>
              <div 
                className="cell header-cell sortable-header" 
                onClick={() => handleColumnHeaderClick('kpi:Final Forecast (Revenue) [Read-Only]')}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
              >
                <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  gap: '4px',
                  minWidth: 0
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    Final Forecast (Revenue) 📖
                  </span>
                  {renderSortIndicator('kpi:Final Forecast (Revenue) [Read-Only]')}
                </div>
                {renderFilterInput('kpi:Final Forecast (Revenue) [Read-Only]')}
              </div>
            </div>
          </div>
          
          <div className="table-content">
            {/* Aggregate row - sum of all 12 months */}
            {(() => {
              // Calculate totals across all months
              let totalBaseline = 0;
              let totalAmAdjusted = 0;
              let totalSmAdjustment = 0;
              let totalRsdAdjustment = 0;
              let totalFinalForecast = 0;
              
              months.forEach((month, idx) => {
                const monthData = allMonthsData[idx];
                const rowData = findRowById(monthData, selectedCell.hierarchy || 'aggregate');
                if (rowData) {
                  totalBaseline += rowData.baseline || 0;
                  totalAmAdjusted += rowData.amAdjusted || 0;
                  totalSmAdjustment += rowData.smAdjustment || 0;
                  totalRsdAdjustment += rowData.rsdAdjustment || 0;
                  totalFinalForecast += rowData.finalForecast || 0;
                }
              });
              
              // Check if FY 25 should be shown based on filter
              const shouldShowFY = !timeHierarchyFilter || timeHierarchyFilter.trim() === '' || 'FY 25'.toLowerCase().includes(timeHierarchyFilter.toLowerCase().trim());
              
              // Create array of month indices with their data for sorting
              const monthsWithData = months.map((month, monthIndex) => {
                const monthData = allMonthsData[monthIndex];
                const rowData = findRowById(monthData, selectedCell.hierarchy || 'aggregate');
                return { monthIndex, month, rowData, monthNames: monthNames[monthIndex] };
              });
              
              // Apply time hierarchy filter (filter by month name)
              let filteredMonths = monthsWithData;
              if (timeHierarchyFilter && timeHierarchyFilter.trim() !== '') {
                const filterLower = timeHierarchyFilter.toLowerCase().trim();
                filteredMonths = monthsWithData.filter(({ month, monthNames: monthName }) => {
                  return month.toLowerCase().includes(filterLower) || 
                         monthName.toLowerCase().includes(filterLower);
                });
              }
              
              // Apply sorting if sortColumn is set
              let sortedMonths = filteredMonths;
              if (sortColumn === 'hierarchy:name') {
                // Sort by time order (most recent to least recent = descending month index, or vice versa)
                sortedMonths = [...filteredMonths].sort((a, b) => {
                  // Sort by monthIndex: descending (11 to 0) = most recent first, ascending (0 to 11) = chronological
                  if (sortDirection === 'desc') {
                    // Most recent first (December=11 to January=0)
                    return b.monthIndex - a.monthIndex;
                  } else {
                    // Chronological order (January=0 to December=11)
                    return a.monthIndex - b.monthIndex;
                  }
                });
              } else if (sortColumn && sortColumn.startsWith('kpi:')) {
                sortedMonths = [...filteredMonths].sort((a, b) => {
                  // For Time Roll-up, we need to get the value from rowData based on the KPI
                  const aValue = a.rowData ? getMetricValue(a.rowData, sortColumn.replace('kpi:', '')) || 0 : 0;
                  const bValue = b.rowData ? getMetricValue(b.rowData, sortColumn.replace('kpi:', '')) || 0 : 0;
                  
                  if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
                  if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
                  return 0;
                });
              }
              
              return (
                <>
                  {shouldShowFY && (
                <div className="table-row" style={{ borderBottom: '2px solid #c9c9c9' }}>
                  <div className="cell name-cell" style={{ paddingLeft: '20px' }}>
                    <span style={{ fontWeight: 'bold', color: '#03234d' }}>FY 25</span>
                  </div>
                  
                  <div 
                    className={`cell ${selectedCell.time === -1 && selectedCell.kpi === 'Baseline (Revenue) [Read-Only]' ? 'selected' : ''}`}
                    style={{ fontWeight: 'bold', cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCell({
                        hierarchy: selectedCell.hierarchy || 'aggregate',
                        time: -1,
                        kpi: 'Baseline (Revenue) [Read-Only]'
                      });
                      setLastSelectedCell('Baseline (Revenue) [Read-Only]');
                      setSelectedMonth('FY 25');
                    }}
                  >
                    ${totalBaseline.toLocaleString()}
                  </div>
                  
                  <div 
                    className={`cell ${selectedCell.time === -1 && selectedCell.kpi === 'AM Adjusted (Revenue) [Editable]' ? 'selected' : ''}`}
                    style={{ fontWeight: 'bold', cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCell({
                        hierarchy: selectedCell.hierarchy || 'aggregate',
                        time: -1,
                        kpi: 'AM Adjusted (Revenue) [Editable]'
                      });
                      setLastSelectedCell('AM Adjusted (Revenue) [Editable]');
                      setSelectedMonth('FY 25');
                    }}
                  >
                    ${totalAmAdjusted.toLocaleString()}
                  </div>
                  
                  <div 
                    className={`cell ${selectedCell.time === -1 && selectedCell.kpi === 'SM Adjustment [Read-Only]' ? 'selected' : ''}`}
                    style={{ fontWeight: 'bold', cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCell({
                        hierarchy: selectedCell.hierarchy || 'aggregate',
                        time: -1,
                        kpi: 'SM Adjustment [Read-Only]'
                      });
                      setLastSelectedCell('SM Adjustment [Read-Only]');
                      setSelectedMonth('FY 25');
                    }}
                  >
                    {totalSmAdjustment > 0 ? `+$${totalSmAdjustment.toLocaleString()}` : `-$${Math.abs(totalSmAdjustment).toLocaleString()}`}
                  </div>
                  
                  <div 
                    className={`cell ${selectedCell.time === -1 && selectedCell.kpi === 'RSD Adjustment [Read-Only]' ? 'selected' : ''}`}
                    style={{ fontWeight: 'bold', cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCell({
                        hierarchy: selectedCell.hierarchy || 'aggregate',
                        time: -1,
                        kpi: 'RSD Adjustment [Read-Only]'
                      });
                      setLastSelectedCell('RSD Adjustment [Read-Only]');
                      setSelectedMonth('FY 25');
                    }}
                  >
                    +${totalRsdAdjustment.toLocaleString()}
                  </div>
                  
                  <div 
                    className={`cell ${selectedCell.time === -1 && selectedCell.kpi === 'Final Forecast (Revenue) [Read-Only]' ? 'selected' : ''}`}
                    style={{ fontWeight: 'bold', cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCell({
                        hierarchy: selectedCell.hierarchy || 'aggregate',
                        time: -1,
                        kpi: 'Final Forecast (Revenue) [Read-Only]'
                      });
                      setLastSelectedCell('Final Forecast (Revenue) [Read-Only]');
                      setSelectedMonth('FY 25');
                    }}
                  >
                    ${totalFinalForecast.toLocaleString()}
                  </div>
                </div>
                  )}
                  
                  {sortedMonths.map(({ monthIndex, month, rowData, monthNames: monthName }) => (
                <div key={month} className="table-row">
                  <div className="cell name-cell" style={{ paddingLeft: '20px' }}>
                    <span style={{ fontWeight: 'bold', color: '#03234d' }}>{monthName}</span>
                  </div>
                  
                  <div 
                    className={`cell ${selectedCell.time === monthIndex && selectedCell.kpi === 'Baseline (Revenue) [Read-Only]' ? 'selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCell({
                        hierarchy: selectedCell.hierarchy || 'aggregate',
                        time: monthIndex,
                        kpi: 'Baseline (Revenue) [Read-Only]'
                      });
                      setLastSelectedCell('Baseline (Revenue) [Read-Only]');
                      setSelectedMonth(month);
                    }}
                  >
                    {rowData && rowData.baseline !== undefined ? `$${rowData.baseline.toLocaleString()}` : '-'}
                  </div>
                  
                  <div 
                    className={`cell ${selectedCell.time === monthIndex && selectedCell.kpi === 'AM Adjusted (Revenue) [Editable]' ? 'selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCell({
                        hierarchy: selectedCell.hierarchy || 'aggregate',
                        time: monthIndex,
                        kpi: 'AM Adjusted (Revenue) [Editable]'
                      });
                      setLastSelectedCell('AM Adjusted (Revenue) [Editable]');
                      setSelectedMonth(month);
                    }}
                  >
                    {rowData && rowData.amAdjusted !== undefined ? `$${rowData.amAdjusted.toLocaleString()}` : '-'}
                  </div>
                  
                  <div 
                    className={`cell ${selectedCell.time === monthIndex && selectedCell.kpi === 'SM Adjustment [Read-Only]' ? 'selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCell({
                        hierarchy: selectedCell.hierarchy || 'aggregate',
                        time: monthIndex,
                        kpi: 'SM Adjustment [Read-Only]'
                      });
                      setLastSelectedCell('SM Adjustment [Read-Only]');
                      setSelectedMonth(month);
                    }}
                  >
                    {rowData && rowData.smAdjustment !== undefined 
                      ? (rowData.smAdjustment > 0 ? `+$${rowData.smAdjustment.toLocaleString()}` : `-$${Math.abs(rowData.smAdjustment).toLocaleString()}`)
                      : '-'}
                  </div>
                  
                  <div 
                    className={`cell ${selectedCell.time === monthIndex && selectedCell.kpi === 'RSD Adjustment [Read-Only]' ? 'selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCell({
                        hierarchy: selectedCell.hierarchy || 'aggregate',
                        time: monthIndex,
                        kpi: 'RSD Adjustment [Read-Only]'
                      });
                      setLastSelectedCell('RSD Adjustment [Read-Only]');
                      setSelectedMonth(month);
                    }}
                  >
                    {rowData && rowData.rsdAdjustment !== undefined ? `+$${rowData.rsdAdjustment.toLocaleString()}` : '-'}
                  </div>
                  
                  <div 
                    className={`cell ${selectedCell.time === monthIndex && selectedCell.kpi === 'Final Forecast (Revenue) [Read-Only]' ? 'selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedCell({
                        hierarchy: selectedCell.hierarchy || 'aggregate',
                        time: monthIndex,
                        kpi: 'Final Forecast (Revenue) [Read-Only]'
                      });
                      setLastSelectedCell('Final Forecast (Revenue) [Read-Only]');
                      setSelectedMonth(month);
                    }}
                  >
                    {rowData && rowData.finalForecast !== undefined ? `$${rowData.finalForecast.toLocaleString()}` : '-'}
                  </div>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Account Director View */}
      {selectedKAMView === 'Account Director View' && (
        <>
          {/* Title and buttons first */}
          <div className="title-and-buttons-container">
            <div className="header-title">MagnaDrive - North America Forecast</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div className="button-group">
              {viewOptions.map((option, index) => (
                <button
                  key={option}
                  className={`view-button ${selectedView === option ? 'active' : ''} ${index === 0 ? 'first' : ''} ${index === viewOptions.length - 1 ? 'last' : ''}`}
                  onClick={() => setSelectedView(option)}
                >
                  {option}
                </button>
              ))}
              </div>
            </div>
          </div>
          
          {/* SLDS Grouped Combobox - moved below title */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', padding: '8px 24px 8px 32px', backgroundColor: 'transparent', position: 'relative', zIndex: 9999 }}>
          <div ref={groupedComboboxRef} style={{ position: 'relative', zIndex: 9999 }}>
            <div className="slds-form-element" style={{ width: '375px', maxWidth: '375px', position: 'relative' }}>
              <label className="slds-form-element__label" style={{ 
                fontSize: '0.625rem', // Further reduced from 0.6875rem
                color: '#181818', 
                fontWeight: '700',
                marginBottom: '0.375rem', // Reduced from 0.5rem
                display: 'block',
                lineHeight: '1.25',
                letterSpacing: '0.0125rem'
              }}>
                Hierarchy & Levels
              </label>
              <div className="slds-form-element__control" style={{ position: 'relative', zIndex: (groupedComboboxOpen || levelFilterOpen) ? 10000 : 'auto', overflow: 'visible', width: '100%' }}>
                {/* Single input field with two sections */}
                <div 
                  style={{
                    display: 'flex',
                    width: '375px',
                    maxWidth: '375px',
                    height: '1.75rem', // Increased slightly from 1.5rem
                    border: '1px solid #c9c9c9',
                    borderRadius: '0.5rem', // Increased for more rounded edges
                    backgroundColor: '#ffffff',
                    fontFamily: 'Salesforce Sans, Arial, sans-serif',
                    overflow: 'hidden'
                  }}
                >
                  {/* Left section: Hierarchy */}
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setGroupedComboboxOpen(true);
                      setLevelFilterOpen(false);
                    }}
                    style={{
                      flex: '0 0 28%', // Further reduced width: 28% instead of 35%
                      maxWidth: '28%',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 0.5rem 0 0.5rem', // Reduced padding for smaller size
                      cursor: 'pointer',
                      borderRight: '1px solid #c9c9c9',
                      position: 'relative'
                    }}
                  >
                    <span style={{
                      fontSize: '0.6875rem', // Further reduced from 0.75rem
                      lineHeight: '1.5',
                      color: '#080707',
                      flex: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {groupedComboboxValue || 'Select...'}
                    </span>
                    <svg 
                      className="slds-icon slds-icon_x-small" 
                      aria-hidden="true"
                      viewBox="0 0 12 12"
                      style={{
                        width: '0.75rem', // Reduced from 1rem
                        height: '0.75rem', // Reduced from 1rem
                        fill: '#706e6b',
                        flexShrink: 0,
                        marginLeft: '0.375rem' // Reduced from 0.5rem
                      }}
                    >
                      <path d="M6 9L1 4h10z"/>
                    </svg>
                  </div>
                  
                  {/* Right section: Levels */}
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLevelFilterOpen(true);
                      setGroupedComboboxOpen(false);
                    }}
                    style={{
                      flex: '1', // Take remaining space
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 0.75rem 0 0.5rem', // Right padding for icon spacing from edge
                      cursor: 'pointer',
                      position: 'relative'
                    }}
                  >
                    <span style={{
                      fontSize: '0.6875rem', // Further reduced from 0.75rem
                      lineHeight: '1.5',
                      color: '#080707',
                      flex: '1 1 auto',
                      minWidth: 0, // Allow flex item to shrink below content size
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginRight: '0.5rem' // Space between text and icon
                    }}>
                      {selectedLevels.size > 0 ? Array.from(selectedLevels).join(', ') : 'Select...'}
                    </span>
                    <svg 
                      className="slds-icon slds-icon_x-small" 
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      style={{
                        width: '0.75rem', // Reduced from 1rem
                        height: '0.75rem', // Reduced from 1rem
                        fill: '#706e6b',
                        flexShrink: 0,
                        marginRight: '0' // No margin, positioned at the edge
                      }}
                    >
                      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                    </svg>
                  </div>
                </div>
                
                {/* Hierarchy Dropdown */}
                {groupedComboboxOpen && (
                  <div 
                    className="slds-dropdown slds-dropdown_length-5 slds-dropdown_fluid"
                    role="listbox"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '0',
                      width: '50%',
                      zIndex: 10000,
                      marginTop: '0.125rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #c9c9c9',
                      borderRadius: '0.25rem',
                      boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                      padding: '0.25rem 0',
                      maxHeight: '15rem',
                      overflowY: 'auto'
                    }}
                  >
                    <ul className="slds-listbox slds-listbox_vertical" role="group">
                      <li role="presentation" className="slds-listbox__item">
                        <div
                          id="option-account-product"
                          className="slds-media slds-listbox__option slds-listbox__option_plain slds-media_small"
                          role="option"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setGroupedComboboxValue('Account, Product');
                            setTimeout(() => setGroupedComboboxOpen(false), 10);
                          }}
                          style={{
                            padding: '0.5rem 0.75rem',
                            cursor: 'pointer',
                            backgroundColor: groupedComboboxValue === 'Account, Product' ? '#f3f2f2' : '#ffffff',
                            transition: 'background-color 0.1s ease'
                          }}
                        >
                          <span className="slds-media__figure slds-listbox__option-icon" style={{ width: '0' }}></span>
                          <span className="slds-media__body">
                            <span className="slds-listbox__option-text slds-listbox__option-text_entity">Account, Product</span>
                          </span>
                        </div>
                      </li>
                      <li role="presentation" className="slds-listbox__item">
                        <div
                          id="option-product-account"
                          className="slds-media slds-listbox__option slds-listbox__option_plain slds-media_small"
                          role="option"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setGroupedComboboxValue('Product, Account');
                            setTimeout(() => setGroupedComboboxOpen(false), 10);
                          }}
                          style={{
                            padding: '0.5rem 0.75rem',
                            cursor: 'pointer',
                            backgroundColor: groupedComboboxValue === 'Product, Account' ? '#f3f2f2' : '#ffffff',
                            transition: 'background-color 0.1s ease'
                          }}
                        >
                          <span className="slds-media__figure slds-listbox__option-icon" style={{ width: '0' }}></span>
                          <span className="slds-media__body">
                            <span className="slds-listbox__option-text slds-listbox__option-text_entity">Product, Account</span>
                          </span>
                        </div>
                      </li>
                    </ul>
                  </div>
                )}
                
                {/* Levels Dropdown */}
                {levelFilterOpen && (
                  <div 
                    className="level-filter-dropdown slds-dropdown slds-dropdown_length-5 slds-dropdown_fluid"
                    role="listbox"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      width: '50%',
                      zIndex: 10001,
                      marginTop: '0.125rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #c9c9c9',
                      borderRadius: '0.25rem',
                      boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                      padding: '0.25rem 0',
                      maxHeight: '20rem',
                      minHeight: '10rem',
                      overflowY: 'auto'
                    }}
                  >
                    <ul className="slds-listbox slds-listbox_vertical" role="group">
                      {(() => {
                        // Determine order based on groupedComboboxValue
                        let levelOrder;
                        if (groupedComboboxValue === 'Account, Product') {
                          levelOrder = ['Parent Account', 'Child Account', 'Category', 'Product'];
                        } else if (groupedComboboxValue === 'Product, Account') {
                          levelOrder = ['Category', 'Product', 'Parent Account', 'Child Account'];
                        } else {
                          // Default order if no selection
                          levelOrder = ['Parent Account', 'Child Account', 'Category', 'Product'];
                        }
                        
                        return levelOrder.map(level => (
                          <li key={level} role="presentation" className="slds-listbox__item">
                            <div
                              className="slds-media slds-listbox__option slds-listbox__option_plain slds-media_small"
                              role="option"
                              onClick={(e) => {
                                // Don't toggle if clicking on the checkbox itself (it has its own handler)
                                if (e.target.type === 'checkbox') {
                                  return;
                                }
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedLevels(prev => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(level)) {
                                    // Prevent deselecting if it's the last selected level
                                    if (newSet.size > 1) {
                                      newSet.delete(level);
                                    }
                                  } else {
                                    newSet.add(level);
                                  }
                                  return newSet;
                                });
                              }}
                              style={{
                                padding: '0.5rem 0.75rem',
                                cursor: 'pointer',
                                backgroundColor: selectedLevels.has(level) ? '#f3f2f2' : '#ffffff',
                                transition: 'background-color 0.1s ease',
                                display: 'flex',
                                alignItems: 'center',
                                minHeight: '2rem'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedLevels.has(level)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setSelectedLevels(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(level)) {
                                      // Prevent deselecting if it's the last selected level
                                      if (newSet.size > 1) {
                                        newSet.delete(level);
                                      } else {
                                        // If trying to deselect the last level, keep it selected
                                        e.target.checked = true;
                                        return prev;
                                      }
                                    } else {
                                      newSet.add(level);
                                    }
                                    return newSet;
                                  });
                                }}
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent parent onClick from firing twice
                                }}
                                style={{
                                  marginRight: '0.75rem',
                                  cursor: 'pointer',
                                  width: '16px',
                                  height: '16px',
                                  flexShrink: 0,
                                  accentColor: '#0176d3',
                                  WebkitAppearance: 'checkbox',
                                  MozAppearance: 'checkbox',
                                  appearance: 'checkbox',
                                  pointerEvents: 'auto'
                                }}
                              />
                              <span className="slds-media__body">
                                <span className="slds-listbox__option-text">{level}</span>
                              </span>
                            </div>
                          </li>
                        ));
                      })()}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Time Levels Filter and KPI Set */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <div ref={timeLevelFilterRef} style={{ position: 'relative', zIndex: 9999 }}>
              <div className="slds-form-element" style={{ width: '250px', position: 'relative' }}>
                <label className="slds-form-element__label" style={{ 
                  fontSize: '0.625rem',
                  color: '#181818', 
                  fontWeight: '700',
                  marginBottom: '0.375rem',
                  display: 'block',
                  lineHeight: '1.25',
                  letterSpacing: '0.0125rem'
                }}>
                  Time Levels
                </label>
              <div className="slds-form-element__control" style={{ position: 'relative', zIndex: timeLevelFilterOpen ? 10000 : 'auto', overflow: 'visible' }}>
                <div 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTimeLevelFilterOpen(!timeLevelFilterOpen);
                    setGroupedComboboxOpen(false);
                    setLevelFilterOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    width: '100%',
                    maxWidth: '250px',
                    height: '1.75rem',
                    border: '1px solid #c9c9c9',
                    borderRadius: '0.5rem',
                    backgroundColor: '#ffffff',
                    fontFamily: 'Salesforce Sans, Arial, sans-serif',
                    overflow: 'hidden',
                    alignItems: 'center',
                    padding: '0 0.5rem',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                >
                  <span style={{
                    fontSize: '0.6875rem',
                    lineHeight: '1.5',
                    color: '#080707',
                    flex: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginRight: '0.25rem'
                  }}>
                    {selectedTimeLevels.size > 0 ? Array.from(selectedTimeLevels).join(', ') : 'Select...'}
                  </span>
                  <svg 
                    className="slds-icon slds-icon_x-small" 
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    style={{
                      width: '0.75rem',
                      height: '0.75rem',
                      fill: '#706e6b',
                      flexShrink: 0,
                      marginLeft: '0.25rem'
                    }}
                  >
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                </div>
                
                {/* Time Levels Dropdown */}
                {timeLevelFilterOpen && (
                  <div 
                    className="time-level-filter-dropdown slds-dropdown slds-dropdown_length-5 slds-dropdown_fluid"
                    role="listbox"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '0',
                      width: '250px',
                      minWidth: '250px',
                      zIndex: 10000,
                      marginTop: '0.125rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #c9c9c9',
                      borderRadius: '0.25rem',
                      boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                      padding: '0.25rem 0',
                      maxHeight: '20rem',
                      overflowY: 'auto'
                    }}
                  >
                    <ul className="slds-listbox slds-listbox_vertical" role="group">
                      {['Year', 'Quarter', 'Month'].map(level => (
                        <li key={level} role="presentation" className="slds-listbox__item">
                          <div
                            className="slds-media slds-listbox__option slds-listbox__option_plain slds-media_small"
                            role="option"
                            onClick={(e) => {
                              if (e.target.type === 'checkbox') {
                                return;
                              }
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedTimeLevels(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(level)) {
                                  if (newSet.size > 1) {
                                    newSet.delete(level);
                                  }
                                } else {
                                  newSet.add(level);
                                }
                                return newSet;
                              });
                            }}
                            style={{
                              padding: '0.5rem 0.75rem',
                              cursor: 'pointer',
                              backgroundColor: selectedTimeLevels.has(level) ? '#f3f2f2' : '#ffffff',
                              transition: 'background-color 0.1s ease',
                              display: 'flex',
                              alignItems: 'center',
                              minHeight: '2rem'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedTimeLevels.has(level)}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedTimeLevels(prev => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(level)) {
                                    if (newSet.size > 1) {
                                      newSet.delete(level);
                                    } else {
                                      e.target.checked = true;
                                      return prev;
                                    }
                                  } else {
                                    newSet.add(level);
                                  }
                                  return newSet;
                                });
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              style={{
                                marginRight: '0.75rem',
                                cursor: 'pointer',
                                width: '16px',
                                height: '16px',
                                flexShrink: 0,
                                accentColor: '#0176d3',
                                WebkitAppearance: 'checkbox',
                                MozAppearance: 'checkbox',
                                appearance: 'checkbox',
                                pointerEvents: 'auto'
                              }}
                            />
                            <span className="slds-media__body" style={{ flex: 1 }}>
                              <span className="slds-listbox__option-text" style={{ whiteSpace: 'nowrap', overflow: 'visible' }}>{level}</span>
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            </div>
            {/* KPI Set Dropdown */}
            <div ref={kpiSetDropdownRef} style={{ position: 'relative', zIndex: 9999 }}>
              <div className="slds-form-element" style={{ width: '200px', position: 'relative' }}>
                <label className="slds-form-element__label" style={{ 
                  fontSize: '0.625rem',
                  color: '#181818', 
                  fontWeight: '700',
                  marginBottom: '0.375rem',
                  display: 'block',
                  lineHeight: '1.25',
                  letterSpacing: '0.0125rem'
                }}>
                  KPI Set
                </label>
                <div className="slds-form-element__control" style={{ position: 'relative', zIndex: kpiSetDropdownOpen ? 10000 : 'auto', overflow: 'visible' }}>
                  <div 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setKpiSetDropdownOpen(!kpiSetDropdownOpen);
                      setGroupedComboboxOpen(false);
                      setLevelFilterOpen(false);
                      setTimeLevelFilterOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      width: '100%',
                      maxWidth: '200px',
                      height: '1.75rem',
                      border: '1px solid #c9c9c9',
                      borderRadius: '0.5rem',
                      backgroundColor: '#ffffff',
                      fontFamily: 'Salesforce Sans, Arial, sans-serif',
                      overflow: 'hidden',
                      alignItems: 'center',
                      padding: '0 0.5rem',
                      cursor: 'pointer',
                      position: 'relative'
                    }}
                  >
                    <span style={{
                      fontSize: '0.6875rem',
                      lineHeight: '1.5',
                      color: '#080707',
                      flex: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginRight: '0.25rem'
                    }}>
                      {selectedKPISet}
                    </span>
                    <svg 
                      className="slds-icon slds-icon_x-small" 
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      style={{
                        width: '0.75rem',
                        height: '0.75rem',
                        fill: '#706e6b',
                        flexShrink: 0,
                        marginLeft: '0.25rem',
                        transform: kpiSetDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                      }}
                    >
                      <path d="M12 15L6 9L18 9L12 15Z" fill="currentColor"/>
                    </svg>
                  </div>
                  
                  {/* KPI Set Dropdown */}
                  {kpiSetDropdownOpen && (
                    <div 
                      className="kpi-set-dropdown slds-dropdown slds-dropdown_length-5 slds-dropdown_fluid"
                      role="listbox"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                      }}
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: '0',
                        width: '200px',
                        minWidth: '200px',
                        zIndex: 10000,
                        marginTop: '0.125rem',
                        backgroundColor: '#ffffff',
                        border: '1px solid #c9c9c9',
                        borderRadius: '0.25rem',
                        boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                        padding: '0.25rem 0',
                        maxHeight: '20rem',
                        overflowY: 'auto'
                      }}
                    >
                      <ul className="slds-listbox slds-listbox_vertical" role="group">
                        {['Forecasting KPIs', 'Planning KPIs'].map((kpiSet) => (
                          <li key={kpiSet} role="presentation" className="slds-listbox__item">
                            <div
                              className="slds-media slds-listbox__option slds-listbox__option_plain slds-media_small"
                              role="option"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedKPISet(kpiSet);
                                setKpiSetDropdownOpen(false);
                                // Planning KPIs is non-functional for now
                              }}
                              style={{
                                padding: '0.5rem 0.75rem',
                                cursor: 'pointer',
                                backgroundColor: selectedKPISet === kpiSet ? '#f3f2f2' : '#ffffff',
                                transition: 'background-color 0.1s ease',
                                display: 'flex',
                                alignItems: 'center',
                                minHeight: '2rem'
                              }}
                            >
                              <span className="slds-media__body" style={{ flex: 1 }}>
                                <span className="slds-listbox__option-text" style={{ whiteSpace: 'nowrap', overflow: 'visible' }}>{kpiSet}</span>
                              </span>
                              {selectedKPISet === kpiSet && (
                                <svg 
                                  className="slds-icon slds-icon_x-small slds-icon-text-default" 
                                  aria-hidden="true"
                                  style={{
                                    width: '0.75rem',
                                    height: '0.75rem',
                                    fill: '#0176d3',
                                    flexShrink: 0,
                                    marginLeft: '0.5rem'
                                  }}
                                >
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/>
                                </svg>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Global Filter Button */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                onClick={() => setGlobalFilterPanelOpen(!globalFilterPanelOpen)}
                style={{
                  background: globalFilterPanelOpen ? '#0176d3' : '#ffffff',
                  border: '1px solid #c9c9c9',
                  borderRadius: '0.25rem',
                  padding: '0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '1.75rem',
                  width: '1.75rem',
                  marginTop: '1.125rem',
                  color: globalFilterPanelOpen ? '#ffffff' : '#706e6b',
                  transition: 'all 0.2s ease'
                }}
                title={globalFilters.length > 0 ? `${globalFilters.length} filter${globalFilters.length > 1 ? 's' : ''} applied` : 'Add Filter'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 1H1L6 7.5V13.5L10 15.5V7.5L15 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </button>
              {globalFilters.length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '8px',
                  right: '-4px',
                  backgroundColor: '#e74c3c',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '600'
                }}>
                  {globalFilters.length}
                </span>
              )}
            </div>
          </div>
          </div>
          
          {/* Overlay when filter panel is open */}
          {globalFilterPanelOpen && (
            <div
              onClick={() => setGlobalFilterPanelOpen(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                zIndex: 9999
              }}
            />
          )}
          
          {/* Account Director View Content */}
          {selectedView === 'Specific Time' && (
            <div className="simple-grid">
              <div className="headers-wrapper">
                <div className="first-column-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                  <div 
                    className="sortable-header" 
                    onClick={() => handleColumnHeaderClick('hierarchy:name')}
                    style={{ 
                      cursor: 'pointer', 
                      width: '100%', 
                      padding: '4px 8px',
                      marginBottom: '4px',
                      fontWeight: '600',
                      userSelect: 'none'
                    }}
                  >
                    Name{renderSortIndicator('hierarchy:name')}
                  </div>
                  <div style={{ position: 'relative', marginTop: '4px', width: '100%', marginBottom: '8px', display: 'block', visibility: 'visible', opacity: 1, minHeight: '24px' }}>
                    <input
                      type="text"
                      id="hierarchy-filter-input"
                      name="hierarchy-filter-input"
                      className="hierarchy-filter-input"
                      value={hierarchyFilter}
                      onChange={(e) => setHierarchyFilter(e.target.value)}
                      placeholder="Filter..."
                      style={{
                        width: '100%',
                        padding: '4px 20px 4px 6px',
                        fontSize: '11px',
                        border: hierarchyFilter ? '1px solid #0176d3' : '1px solid #c9c9c9',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        backgroundColor: hierarchyFilter ? '#f0f8ff' : '#ffffff',
                        display: 'block',
                        visibility: 'visible',
                        opacity: 1,
                        position: 'relative',
                        zIndex: 10,
                        height: '24px',
                        minHeight: '24px',
                        lineHeight: '24px'
                      }}
                    />
                    {hierarchyFilter && (
                      <button
                        onClick={() => setHierarchyFilter('')}
                        style={{
                          position: 'absolute',
                          right: '4px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          fontSize: '12px',
                          color: '#666',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '3px',
                          transition: 'background-color 0.2s',
                          lineHeight: '1'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        title="Clear filter"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="month-selector-header">
                  <div className="month-selector-cell" style={{ display: 'flex', justifyContent: 'center' }}>
                    <SearchableDropdown
                      value={selectedMonth}
                      options={(() => {
                        const filtered = [];
                        if (selectedTimeLevels.has('Year')) filtered.push('FY 25');
                        if (selectedTimeLevels.has('Quarter')) {
                          filtered.push('Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025');
                        }
                        if (selectedTimeLevels.has('Month')) {
                          filtered.push(...months);
                        }
                        return filtered;
                      })()}
                      onChange={(newMonth) => {
                        // Map time values: FY 25 = -1, Q1 = -2, Q2 = -3, Q3 = -4, Q4 = -5, months = 0-11
                        let timeIndex;
                        if (newMonth === 'FY 25') {
                          timeIndex = -1;
                        } else if (newMonth === 'Q1 2025') {
                          timeIndex = -2;
                        } else if (newMonth === 'Q2 2025') {
                          timeIndex = -3;
                        } else if (newMonth === 'Q3 2025') {
                          timeIndex = -4;
                        } else if (newMonth === 'Q4 2025') {
                          timeIndex = -5;
                        } else {
                          timeIndex = months.indexOf(newMonth);
                        }
                        setSelectedMonth(newMonth);
                        
                        // Update BB cell directly if it exists
                        if (selectedCell && selectedCell.hierarchy && selectedCell.kpi) {
                          setSelectedCell({
                            ...selectedCell,
                            time: timeIndex
                          });
                        }
                      }}
                      placeholder="select time"
                    />
                  </div>
                </div>
                
                <div className="table-header">
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('kpi:Baseline (Revenue) [Read-Only]')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'flex-end',
                      gap: '4px',
                      minWidth: 0
                    }}>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: '1 1 auto',
                        minWidth: 0
                      }}>
                        Baseline (Revenue) [Read-Only]
                      </span>
                      {renderSortIndicator('kpi:Baseline (Revenue) [Read-Only]')}
                    </div>
                    {renderFilterInput('kpi:Baseline (Revenue) [Read-Only]')}
                  </div>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('kpi:AM Adjusted (Revenue) [Editable]')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'flex-end',
                      gap: '4px',
                      minWidth: 0
                    }}>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: '1 1 auto',
                        minWidth: 0
                      }}>
                        AM Adjusted (Revenue) [Editable]
                      </span>
                      {renderSortIndicator('kpi:AM Adjusted (Revenue) [Editable]')}
                    </div>
                    {renderFilterInput('kpi:AM Adjusted (Revenue) [Editable]')}
                  </div>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('kpi:SM Adjustment [Read-Only]')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'flex-end',
                      gap: '4px',
                      minWidth: 0
                    }}>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: '1 1 auto',
                        minWidth: 0
                      }}>
                        SM Adjustment [Read-Only]
                      </span>
                      {renderSortIndicator('kpi:SM Adjustment [Read-Only]')}
                    </div>
                    {renderFilterInput('kpi:SM Adjustment [Read-Only]')}
                  </div>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('kpi:RSD Adjustment [Read-Only]')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'flex-end',
                      gap: '4px',
                      minWidth: 0
                    }}>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: '1 1 auto',
                        minWidth: 0
                      }}>
                        RSD Adjustment [Read-Only]
                      </span>
                      {renderSortIndicator('kpi:RSD Adjustment [Read-Only]')}
                    </div>
                    {renderFilterInput('kpi:RSD Adjustment [Read-Only]')}
                  </div>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('kpi:Final Forecast (Revenue) [Read-Only]')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'flex-end',
                      gap: '4px',
                      minWidth: 0
                    }}>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: '1 1 auto',
                        minWidth: 0
                      }}>
                        Final Forecast (Revenue) [Read-Only]
                      </span>
                      {renderSortIndicator('kpi:Final Forecast (Revenue) [Read-Only]')}
                    </div>
                    {renderFilterInput('kpi:Final Forecast (Revenue) [Read-Only]')}
                  </div>
                </div>
              </div>
              
              <div className="table-content">
                {sortedDisplayedData.map(row => (
                  <Row key={row.id} row={row} level={0} view={selectedView} />
                ))}
              </div>
            </div>
          )}

          {selectedView === 'Time series' && (
            <div className="simple-grid grid-timeseries account-director-timeseries">
              <div className="headers-wrapper">
                <div className="first-column-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                  <div 
                    className="sortable-header" 
                    onClick={() => handleColumnHeaderClick('hierarchy:name')}
                    style={{ 
                      cursor: 'pointer', 
                      width: '100%', 
                      padding: '4px 8px',
                      marginBottom: '4px',
                      fontWeight: '600',
                      userSelect: 'none'
                    }}
                  >
                    Name{renderSortIndicator('hierarchy:name')}
                  </div>
                  <div style={{ position: 'relative', marginTop: '4px', width: '100%', marginBottom: '8px', display: 'block', visibility: 'visible', opacity: 1, zIndex: 10, minHeight: '24px' }}>
                    <input
                      type="text"
                      id="hierarchy-filter-input"
                      name="hierarchy-filter-input"
                      className="hierarchy-filter-input"
                      value={hierarchyFilter}
                      onChange={(e) => setHierarchyFilter(e.target.value)}
                      placeholder="Filter..."
                      style={{
                        width: '100%',
                        padding: '4px 20px 4px 6px',
                        fontSize: '11px',
                        border: hierarchyFilter ? '1px solid #0176d3' : '1px solid #c9c9c9',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        backgroundColor: hierarchyFilter ? '#f0f8ff' : '#ffffff',
                        display: 'block',
                        visibility: 'visible',
                        opacity: 1,
                        position: 'relative',
                        zIndex: 10,
                        height: '24px',
                        minHeight: '24px',
                        lineHeight: '24px'
                      }}
                    />
                    {hierarchyFilter && (
                      <button
                        onClick={() => setHierarchyFilter('')}
                        style={{
                          position: 'absolute',
                          right: '4px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          fontSize: '12px',
                          color: '#666',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '3px',
                          transition: 'background-color 0.2s',
                          lineHeight: '1'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        title="Clear filter"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="month-selector-header">
                  <div className="timeseries-header-center">
                    <SearchableDropdown
                      value={lastSelectedCell || ''}
                      options={kpiOptions}
                      onChange={(newKpi) => {
                        setLastSelectedCell(newKpi);
                        setSelectedCell(prev => ({
                          ...prev,
                          kpi: newKpi
                        }));
                      }}
                      placeholder="select KPI"
                      useFixedPosition={true}
                    />
                  </div>
                </div>
                <div className="table-header">
                  {selectedTimeLevels.has('Year') && (
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('time:-1')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ width: '100%' }}>
                      FY 25{renderSortIndicator('time:-1')}
                    </div>
                    {renderFilterInput('time:-1')}
                  </div>
                  )}
                  {selectedTimeLevels.has('Quarter') && (
                    <>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('time:-2')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'flex-end',
                      gap: '4px',
                      minWidth: 0
                    }}>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: '1 1 auto',
                        minWidth: 0
                      }}>
                        Q1 2025
                      </span>
                      {renderSortIndicator('time:-2')}
                    </div>
                    {renderFilterInput('time:-2')}
                  </div>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('time:-3')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'flex-end',
                      gap: '4px',
                      minWidth: 0
                    }}>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: '1 1 auto',
                        minWidth: 0
                      }}>
                        Q2 2025
                      </span>
                      {renderSortIndicator('time:-3')}
                    </div>
                    {renderFilterInput('time:-3')}
                  </div>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('time:-4')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'flex-end',
                      gap: '4px',
                      minWidth: 0
                    }}>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: '1 1 auto',
                        minWidth: 0
                      }}>
                        Q3 2025
                      </span>
                      {renderSortIndicator('time:-4')}
                    </div>
                    {renderFilterInput('time:-4')}
                  </div>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('time:-5')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ 
                      width: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'flex-end',
                      gap: '4px',
                      minWidth: 0
                    }}>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: '1 1 auto',
                        minWidth: 0
                      }}>
                        Q4 2025
                      </span>
                      {renderSortIndicator('time:-5')}
                    </div>
                    {renderFilterInput('time:-5')}
                  </div>
                    </>
                  )}
                  {selectedTimeLevels.has('Month') && monthNames.map((month, idx) => (
                    <div 
                      key={month} 
                      className="cell header-cell sortable-header"
                      onClick={() => handleColumnHeaderClick(`time:${idx}`)}
                      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                    >
                      <div style={{ width: '100%' }}>
                        {month}{renderSortIndicator(`time:${idx}`)}
                      </div>
                      {renderFilterInput(`time:${idx}`)}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="table-content">
                {sortedDisplayedData.map(row => (
                  <Row key={row.id} row={row} level={0} view={selectedView} />
                ))}
              </div>
            </div>
          )}

          {selectedView === 'Time Roll-up' && (
            <div className="simple-grid">
              <div className="headers-wrapper">
                <div className="first-column-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                  <div 
                    className="sortable-header" 
                    onClick={() => handleColumnHeaderClick('hierarchy:name')}
                    style={{ 
                      cursor: 'pointer', 
                      width: '100%', 
                      padding: '4px 8px',
                      marginBottom: '4px',
                      fontWeight: '600',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px'
                }}>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0
                  }}>
                    Time
                  </span>
                  {renderSortIndicator('hierarchy:name')}
                </div>
                  </div>
                  <div style={{ position: 'relative', marginTop: '4px', width: '100%', marginBottom: '8px' }}>
                    <input
                      type="text"
                      className="hierarchy-filter-input"
                      value={timeHierarchyFilter}
                      onChange={(e) => setTimeHierarchyFilter(e.target.value)}
                      placeholder="Filter..."
                      style={{
                        width: '100%',
                        padding: '4px 20px 4px 6px',
                        fontSize: '11px',
                        border: '1px solid #c9c9c9',
                        borderRadius: '4px',
                        boxSizing: 'border-box'
                      }}
                    />
                    {timeHierarchyFilter && (
                      <button
                        onClick={() => setTimeHierarchyFilter('')}
                        style={{
                          position: 'absolute',
                          right: '4px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          fontSize: '12px',
                          color: '#666',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '3px',
                          transition: 'background-color 0.2s',
                          lineHeight: '1'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        title="Clear filter"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="month-selector-header">
                  <div className="month-selector-cell" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <SearchableDropdown
                      value={selectedCell.hierarchy || 'aggregate'}
                      options={allHierarchies.map(h => ({ value: h.id, label: h.name, meta: h.meta }))}
                      onChange={(newHierarchy) => {
                        // Preserve existing time and KPI, but update hierarchy
                        // If switching to total-aggregate and no time is set, default to FY (-1)
                        const newTime = selectedCell?.time !== undefined ? selectedCell.time : -1;
                        const newKpi = selectedCell?.kpi || 'Baseline (Revenue) [Read-Only]';
                        setSelectedCell({
                          hierarchy: newHierarchy,
                          time: newTime,
                          kpi: newKpi
                        });
                        if (!selectedCell?.kpi) {
                          setLastSelectedCell(newKpi);
                        }
                      }}
                      placeholder="select dimension"
                      style={{ fontSize: '14px', fontWeight: '600' }}
                    />
                  </div>
                </div>
                
                <div className="table-header">
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('kpi:Baseline (Revenue) [Read-Only]')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ width: '100%' }}>
                      Baseline (Revenue) 📖{renderSortIndicator('kpi:Baseline (Revenue) [Read-Only]')}
                    </div>
                    {renderFilterInput('kpi:Baseline (Revenue) [Read-Only]')}
                  </div>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('kpi:AM Adjusted (Revenue) [Editable]')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ width: '100%' }}>
                      AM Adjusted (Revenue) ✏️{renderSortIndicator('kpi:AM Adjusted (Revenue) [Editable]')}
                    </div>
                    {renderFilterInput('kpi:AM Adjusted (Revenue) [Editable]')}
                  </div>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('kpi:SM Adjustment [Read-Only]')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ width: '100%' }}>
                      SM Adjustment 📖{renderSortIndicator('kpi:SM Adjustment [Read-Only]')}
                    </div>
                    {renderFilterInput('kpi:SM Adjustment [Read-Only]')}
                  </div>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('kpi:RSD Adjustment [Read-Only]')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ width: '100%' }}>
                      RSD Adjustment 📖{renderSortIndicator('kpi:RSD Adjustment [Read-Only]')}
                    </div>
                    {renderFilterInput('kpi:RSD Adjustment [Read-Only]')}
                  </div>
                  <div 
                    className="cell header-cell sortable-header" 
                    onClick={() => handleColumnHeaderClick('kpi:Final Forecast (Revenue) [Read-Only]')}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
                  >
                    <div style={{ width: '100%' }}>
                      Final Forecast (Revenue) 📖{renderSortIndicator('kpi:Final Forecast (Revenue) [Read-Only]')}
                    </div>
                    {renderFilterInput('kpi:Final Forecast (Revenue) [Read-Only]')}
                  </div>
                </div>
              </div>
              
              <div className="table-content">
                {(() => {
                  // Helper function to calculate aggregate from top-level rows
                  const calculateAggregateForMonthInRollup = (monthData, metricName) => {
                    if (!monthData || !Array.isArray(monthData) || monthData.length === 0) {
                      return 0;
                    }
                    const topLevelRows = monthData.filter(r => r && r.id !== 'total-aggregate');
                    let total = 0;
                    topLevelRows.forEach(topRow => {
                      const value = getMetricValue(topRow, metricName);
                      if (value !== undefined && value !== null) {
                        total += value || 0;
                      }
                    });
                    return total;
                  };
                  
                  // Calculate FY 2025 totals
                  let fyBaseline = 0;
                  let fyAmAdjusted = 0;
                  let fySmAdjustment = 0;
                  let fyRsdAdjustment = 0;
                  let fyFinalForecast = 0;
                  
                  const selectedHierarchy = selectedCell.hierarchy || 'aggregate';
                  
                  months.forEach((month) => {
                    const monthDataRaw = generateDataForMonth(month, selectedKAMView === 'Account Director View');
                    const monthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
                      ? transformDataByHierarchyOrder(monthDataRaw, groupedComboboxValue)
                      : monthDataRaw;
                    
                    // Apply level filtering for Account Director view
                    const selectedLevelsSetForMonth = selectedLevels instanceof Set ? selectedLevels : new Set(selectedLevels || []);
                    const filteredMonthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
                      ? filterDataByLevels(monthData, selectedLevelsSetForMonth, groupedComboboxValue)
                      : monthData;
                    
                    // If selected hierarchy is 'total-aggregate', calculate aggregate from all top-level rows
                    if (selectedHierarchy === 'total-aggregate') {
                      fyBaseline += calculateAggregateForMonthInRollup(filteredMonthData, 'Baseline (Revenue) [Read-Only]');
                      fyAmAdjusted += calculateAggregateForMonthInRollup(filteredMonthData, 'AM Adjusted (Revenue) [Editable]');
                      fySmAdjustment += calculateAggregateForMonthInRollup(filteredMonthData, 'SM Adjustment [Read-Only]');
                      fyRsdAdjustment += calculateAggregateForMonthInRollup(filteredMonthData, 'RSD Adjustment [Read-Only]');
                      fyFinalForecast += calculateAggregateForMonthInRollup(filteredMonthData, 'Final Forecast (Revenue) [Read-Only]');
                    } else {
                      const selectedRow = findRowById(filteredMonthData, selectedHierarchy);
                      if (selectedRow) {
                        fyBaseline += selectedRow.baseline || 0;
                        fyAmAdjusted += selectedRow.amAdjusted || 0;
                        fySmAdjustment += selectedRow.smAdjustment || 0;
                        fyRsdAdjustment += selectedRow.rsdAdjustment || 0;
                        fyFinalForecast += selectedRow.finalForecast || 0;
                      }
                    }
                  });

                  // Helper function to calculate quarter totals
                  const calculateQuarterTotal = (monthIndices) => {
                    let qBaseline = 0;
                    let qAmAdjusted = 0;
                    let qSmAdjustment = 0;
                    let qRsdAdjustment = 0;
                    let qFinalForecast = 0;

                    monthIndices.forEach(monthIdx => {
                      const monthDataRaw = generateDataForMonth(months[monthIdx], selectedKAMView === 'Account Director View');
                      const monthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
                        ? transformDataByHierarchyOrder(monthDataRaw, groupedComboboxValue)
                        : monthDataRaw;
                      
                      // Apply level filtering for Account Director view
                      const selectedLevelsSetForMonth = selectedLevels instanceof Set ? selectedLevels : new Set(selectedLevels || []);
                      const filteredMonthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
                        ? filterDataByLevels(monthData, selectedLevelsSetForMonth, groupedComboboxValue)
                        : monthData;
                      
                      // If selected hierarchy is 'total-aggregate' or 'aggregate', calculate aggregate from all top-level rows
                      if (selectedHierarchy === 'total-aggregate' || (selectedHierarchy === 'aggregate' && selectedKAMView === 'Account Director View')) {
                        qBaseline += calculateAggregateForMonthInRollup(filteredMonthData, 'Baseline (Revenue) [Read-Only]');
                        qAmAdjusted += calculateAggregateForMonthInRollup(filteredMonthData, 'AM Adjusted (Revenue) [Editable]');
                        qSmAdjustment += calculateAggregateForMonthInRollup(filteredMonthData, 'SM Adjustment [Read-Only]');
                        qRsdAdjustment += calculateAggregateForMonthInRollup(filteredMonthData, 'RSD Adjustment [Read-Only]');
                        qFinalForecast += calculateAggregateForMonthInRollup(filteredMonthData, 'Final Forecast (Revenue) [Read-Only]');
                      } else {
                        const selectedRow = findRowById(filteredMonthData, selectedHierarchy);
                        if (selectedRow) {
                          qBaseline += selectedRow.baseline || 0;
                          qAmAdjusted += selectedRow.amAdjusted || 0;
                          qSmAdjustment += selectedRow.smAdjustment || 0;
                          qRsdAdjustment += selectedRow.rsdAdjustment || 0;
                          qFinalForecast += selectedRow.finalForecast || 0;
                        }
                      }
                    });

                    return { qBaseline, qAmAdjusted, qSmAdjustment, qRsdAdjustment, qFinalForecast };
                  };
                  
                  // Quarter definitions
                  let quarters = [
                    { id: 'q1', name: 'Q1 2025', months: [0, 1, 2] }, // Jan-Mar
                    { id: 'q2', name: 'Q2 2025', months: [3, 4, 5] }, // Apr-Jun
                    { id: 'q3', name: 'Q3 2025', months: [6, 7, 8] }, // Jul-Sep
                    { id: 'q4', name: 'Q4 2025', months: [9, 10, 11] } // Oct-Dec
                  ];
                  
                  // Apply sorting to quarters if sortColumn is set
                  if (sortColumn === 'hierarchy:name') {
                    // Sort quarters by time order (most recent to least recent = Q4 to Q1, or vice versa)
                    quarters = [...quarters].sort((a, b) => {
                      // Quarter order: Q1=0, Q2=1, Q3=2, Q4=3 (based on id)
                      const quarterOrder = { 'q1': 0, 'q2': 1, 'q3': 2, 'q4': 3 };
                      const aOrder = quarterOrder[a.id] || 0;
                      const bOrder = quarterOrder[b.id] || 0;
                      
                      if (sortDirection === 'desc') {
                        // Most recent first (Q4 to Q1)
                        return bOrder - aOrder;
                      } else {
                        // Chronological order (Q1 to Q4)
                        return aOrder - bOrder;
                      }
                    });
                  } else if (sortColumn && sortColumn.startsWith('kpi:')) {
                    quarters = [...quarters].sort((a, b) => {
                      const aTotals = calculateQuarterTotal(a.months);
                      const bTotals = calculateQuarterTotal(b.months);
                      
                      // Get the KPI identifier (e.g., "Baseline (Revenue) [Read-Only]")
                      const kpiIdentifier = sortColumn.replace('kpi:', '');
                      
                      // Get values based on KPI
                      let aValue = 0;
                      let bValue = 0;
                      
                      switch(kpiIdentifier) {
                        case 'Baseline (Revenue) [Read-Only]':
                          aValue = aTotals.qBaseline;
                          bValue = bTotals.qBaseline;
                          break;
                        case 'AM Adjusted (Revenue) [Editable]':
                          aValue = aTotals.qAmAdjusted;
                          bValue = bTotals.qAmAdjusted;
                          break;
                        case 'SM Adjustment [Read-Only]':
                          aValue = aTotals.qSmAdjustment;
                          bValue = bTotals.qSmAdjustment;
                          break;
                        case 'RSD Adjustment [Read-Only]':
                          aValue = aTotals.qRsdAdjustment;
                          bValue = bTotals.qRsdAdjustment;
                          break;
                        case 'Final Forecast (Revenue) [Read-Only]':
                          aValue = aTotals.qFinalForecast;
                          bValue = bTotals.qFinalForecast;
                          break;
                      }
                      
                      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
                      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
                      return 0;
                    });
                  }
                  
                  // Helper to sort months within a quarter
                  const getSortedMonthsForQuarter = (quarter) => {
                    if (sortColumn === 'hierarchy:name') {
                      // Sort months by time order within the quarter
                      const sortedMonths = [...quarter.months].sort((a, b) => {
                        if (sortDirection === 'desc') {
                          // Most recent first (highest month index first)
                          return b - a;
                        } else {
                          // Chronological order (lowest month index first)
                          return a - b;
                        }
                      });
                      return sortedMonths;
                    } else if (!sortColumn || !sortColumn.startsWith('kpi:')) {
                      return quarter.months; // No sorting, return original order
                    }
                    
                    // Create array of month indices with their data
                    const monthsWithData = quarter.months.map(monthIdx => {
                      const monthDataRaw = generateDataForMonth(months[monthIdx], selectedKAMView === 'Account Director View');
                      const monthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
                        ? transformDataByHierarchyOrder(monthDataRaw, groupedComboboxValue)
                        : monthDataRaw;
                      const selectedRow = findRowById(monthData, selectedCell.hierarchy || 'aggregate');
                      return { monthIdx, rowData: selectedRow };
                    });
                    
                    // Sort based on KPI
                    const kpiIdentifier = sortColumn.replace('kpi:', '');
                    const sorted = [...monthsWithData].sort((a, b) => {
                      const aValue = a.rowData ? getMetricValue(a.rowData, kpiIdentifier) || 0 : 0;
                      const bValue = b.rowData ? getMetricValue(b.rowData, kpiIdentifier) || 0 : 0;
                      
                      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
                      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
                      return 0;
                    });
                    
                    return sorted.map(m => m.monthIdx);
                  };

                  const toggleTimePeriod = (periodId) => {
                    // Record timestamp of manual toggle to prevent auto-scrolling
                    manualToggleTimestampRef.current = Date.now();
                    
                    setExpandedTimePeriods(prev => {
                      const newSet = new Set(prev);
                      const willBeExpanded = !newSet.has(periodId);
                      
                      if (newSet.has(periodId)) {
                        newSet.delete(periodId);
                      } else {
                        newSet.add(periodId);
                      }
                      
                      // Track manual toggle state
                      setManuallyToggledTimePeriods(prevManual => {
                        const newManual = new Map(prevManual);
                        newManual.set(periodId, willBeExpanded);
                        return newManual;
                      });
                      
                      return newSet;
                    });
                  };

                  // Filter time hierarchy based on timeHierarchyFilter
                  const filterLower = timeHierarchyFilter && timeHierarchyFilter.trim() !== '' 
                    ? timeHierarchyFilter.toLowerCase().trim() 
                    : '';
                  
                  const shouldShowFY = !filterLower || 'FY 2025'.toLowerCase().includes(filterLower) || 'FY 25'.toLowerCase().includes(filterLower);
                  const shouldShowQuarter = (quarterName) => !filterLower || quarterName.toLowerCase().includes(filterLower);
                  
                  return (
                    <>
                      {/* Level 1: FY 2025 */}
                      {selectedTimeLevels.has('Year') && shouldShowFY && (
                      <div className="table-row parent-row">
                        <div className="cell name-cell" style={{ paddingLeft: '8px', fontWeight: 'bold' }}>
                          <button 
                            className="expand-button"
                            onClick={() => toggleTimePeriod('fy2025')}
                            style={{ marginRight: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                          >
                            {expandedTimePeriods.has('fy2025') ? '▼' : '▶'}
                          </button>
                          FY 2025
                        </div>
                        <div 
                          className={`cell ${selectedCell && selectedCell.time === -1 && selectedCell.hierarchy === (selectedCell.hierarchy || 'aggregate') && selectedCell.kpi === 'Baseline (Revenue) [Read-Only]' ? 'selected' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            const hierarchy = selectedCell.hierarchy || 'aggregate';
                            setSelectedCell({
                              hierarchy: hierarchy,
                              time: -1,
                              kpi: 'Baseline (Revenue) [Read-Only]'
                            });
                            setLastSelectedCell('Baseline (Revenue) [Read-Only]');
                          }}
                        >
                          ${fyBaseline.toLocaleString()}
                        </div>
                        <div 
                          className={`cell ${selectedCell && selectedCell.time === -1 && selectedCell.hierarchy === (selectedCell.hierarchy || 'aggregate') && selectedCell.kpi === 'AM Adjusted (Revenue) [Editable]' ? 'selected' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            const hierarchy = selectedCell.hierarchy || 'aggregate';
                            setSelectedCell({
                              hierarchy: hierarchy,
                              time: -1,
                              kpi: 'AM Adjusted (Revenue) [Editable]'
                            });
                            setLastSelectedCell('AM Adjusted (Revenue) [Editable]');
                          }}
                        >
                          ${fyAmAdjusted.toLocaleString()}
                        </div>
                        <div 
                          className={`cell ${selectedCell && selectedCell.time === -1 && selectedCell.hierarchy === (selectedCell.hierarchy || 'aggregate') && selectedCell.kpi === 'SM Adjustment [Read-Only]' ? 'selected' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            const hierarchy = selectedCell.hierarchy || 'aggregate';
                            setSelectedCell({
                              hierarchy: hierarchy,
                              time: -1,
                              kpi: 'SM Adjustment [Read-Only]'
                            });
                            setLastSelectedCell('SM Adjustment [Read-Only]');
                          }}
                        >
                          ${fySmAdjustment.toLocaleString()}
                        </div>
                        <div 
                          className={`cell ${selectedCell && selectedCell.time === -1 && selectedCell.hierarchy === (selectedCell.hierarchy || 'aggregate') && selectedCell.kpi === 'RSD Adjustment [Read-Only]' ? 'selected' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            const hierarchy = selectedCell.hierarchy || 'aggregate';
                            setSelectedCell({
                              hierarchy: hierarchy,
                              time: -1,
                              kpi: 'RSD Adjustment [Read-Only]'
                            });
                            setLastSelectedCell('RSD Adjustment [Read-Only]');
                          }}
                        >
                          ${fyRsdAdjustment.toLocaleString()}
                        </div>
                        <div 
                          className={`cell ${selectedCell && selectedCell.time === -1 && selectedCell.hierarchy === (selectedCell.hierarchy || 'aggregate') && selectedCell.kpi === 'Final Forecast (Revenue) [Read-Only]' ? 'selected' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            const hierarchy = selectedCell.hierarchy || 'aggregate';
                            setSelectedCell({
                              hierarchy: hierarchy,
                              time: -1,
                              kpi: 'Final Forecast (Revenue) [Read-Only]'
                            });
                            setLastSelectedCell('Final Forecast (Revenue) [Read-Only]');
                          }}
                        >
                          ${fyFinalForecast.toLocaleString()}
                        </div>
                      </div>
                      )}

                      {/* Level 2: Quarters (shown when FY is expanded and Quarter is selected) */}
                      {selectedTimeLevels.has('Quarter') && (selectedTimeLevels.has('Year') ? expandedTimePeriods.has('fy2025') : true) && quarters.filter(quarter => shouldShowQuarter(quarter.name)).map((quarter) => {
                        const quarterTotals = calculateQuarterTotal(quarter.months);
                        // Use special time values for quarters: -2 (Q1), -3 (Q2), -4 (Q3), -5 (Q4)
                        const quarterTimeMap = { 'q1': -2, 'q2': -3, 'q3': -4, 'q4': -5 };
                        const quarterTime = quarterTimeMap[quarter.id];
                        const hierarchy = selectedCell.hierarchy || 'aggregate';
                        
                        const isQuarterCellSelected = (kpiName) => {
                          return (
                            selectedCell &&
                            selectedCell.hierarchy === hierarchy &&
                            selectedCell.time === quarterTime &&
                            selectedCell.kpi === kpiName
                          );
                        };
                        
                        return (
                          <React.Fragment key={quarter.id}>
                            {/* Quarter Row */}
                            <div className="table-row parent-row">
                              <div className="cell name-cell" style={{ paddingLeft: '32px', fontWeight: '600' }}>
                                {selectedTimeLevels.has('Month') ? (
                                <button 
                                  className="expand-button"
                                  onClick={() => toggleTimePeriod(quarter.id)}
                                  style={{ marginRight: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                                >
                                  {expandedTimePeriods.has(quarter.id) ? '▼' : '▶'}
                                </button>
                                ) : (
                                <span style={{ marginRight: '8px', width: '12px', display: 'inline-block' }}></span>
                                )}
                                {quarter.name}
                              </div>
                              <div 
                                className={`cell ${isQuarterCellSelected('Baseline (Revenue) [Read-Only]') ? 'selected' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedCell({
                                    hierarchy: hierarchy,
                                    time: quarterTime,
                                    kpi: 'Baseline (Revenue) [Read-Only]'
                                  });
                                  setLastSelectedCell('Baseline (Revenue) [Read-Only]');
                                }}
                                data-selected-hierarchy={hierarchy}
                                data-selected-time={quarterTime}
                                data-selected-kpi="Baseline (Revenue) [Read-Only]"
                              >
                                ${quarterTotals.qBaseline.toLocaleString()}
                              </div>
                              <div 
                                className={`cell ${isQuarterCellSelected('AM Adjusted (Revenue) [Editable]') ? 'selected' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedCell({
                                    hierarchy: hierarchy,
                                    time: quarterTime,
                                    kpi: 'AM Adjusted (Revenue) [Editable]'
                                  });
                                  setLastSelectedCell('AM Adjusted (Revenue) [Editable]');
                                }}
                                data-selected-hierarchy={hierarchy}
                                data-selected-time={quarterTime}
                                data-selected-kpi="AM Adjusted (Revenue) [Editable]"
                              >
                                ${quarterTotals.qAmAdjusted.toLocaleString()}
                              </div>
                              <div 
                                className={`cell ${isQuarterCellSelected('SM Adjustment [Read-Only]') ? 'selected' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedCell({
                                    hierarchy: hierarchy,
                                    time: quarterTime,
                                    kpi: 'SM Adjustment [Read-Only]'
                                  });
                                  setLastSelectedCell('SM Adjustment [Read-Only]');
                                }}
                                data-selected-hierarchy={hierarchy}
                                data-selected-time={quarterTime}
                                data-selected-kpi="SM Adjustment [Read-Only]"
                              >
                                ${quarterTotals.qSmAdjustment.toLocaleString()}
                              </div>
                              <div 
                                className={`cell ${isQuarterCellSelected('RSD Adjustment [Read-Only]') ? 'selected' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedCell({
                                    hierarchy: hierarchy,
                                    time: quarterTime,
                                    kpi: 'RSD Adjustment [Read-Only]'
                                  });
                                  setLastSelectedCell('RSD Adjustment [Read-Only]');
                                }}
                                data-selected-hierarchy={hierarchy}
                                data-selected-time={quarterTime}
                                data-selected-kpi="RSD Adjustment [Read-Only]"
                              >
                                ${quarterTotals.qRsdAdjustment.toLocaleString()}
                              </div>
                              <div 
                                className={`cell ${isQuarterCellSelected('Final Forecast (Revenue) [Read-Only]') ? 'selected' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedCell({
                                    hierarchy: hierarchy,
                                    time: quarterTime,
                                    kpi: 'Final Forecast (Revenue) [Read-Only]'
                                  });
                                  setLastSelectedCell('Final Forecast (Revenue) [Read-Only]');
                                }}
                                data-selected-hierarchy={hierarchy}
                                data-selected-time={quarterTime}
                                data-selected-kpi="Final Forecast (Revenue) [Read-Only]"
                              >
                                ${quarterTotals.qFinalForecast.toLocaleString()}
                              </div>
                            </div>

                            {/* Level 3: Months (shown when quarter is expanded and Month is selected) */}
                            {selectedTimeLevels.has('Month') && expandedTimePeriods.has(quarter.id) && getSortedMonthsForQuarter(quarter).filter(monthIdx => {
                              if (!filterLower) return true; // No filter, show all
                              const monthName = months[monthIdx];
                              const monthNameFormatted = monthNames[monthIdx];
                              // Extract just the month name (before space) for better matching
                              const monthNameOnly = monthName.split(' ')[0].toLowerCase();
                              // Check full month name, formatted name, and just the month name
                              return monthName.toLowerCase().includes(filterLower) || 
                                     (monthNameFormatted && monthNameFormatted.toLowerCase().includes(filterLower)) ||
                                     monthNameOnly.includes(filterLower);
                            }).map((monthIdx) => {
                              const monthDataRaw = generateDataForMonth(months[monthIdx], selectedKAMView === 'Account Director View');
                              const transformedMonthDataRaw = selectedKAMView === 'Account Director View' && groupedComboboxValue
                                ? transformDataByHierarchyOrder(monthDataRaw, groupedComboboxValue)
                                : monthDataRaw;
                              // Apply level filtering for Time Roll-up view
                              const selectedLevelsSetForRollup = selectedLevels instanceof Set ? selectedLevels : new Set(selectedLevels || []);
                              const monthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
                                ? filterDataByLevels(transformedMonthDataRaw, selectedLevelsSetForRollup, groupedComboboxValue)
                                : transformedMonthDataRaw;
                              
                              const currentHierarchy = selectedCell.hierarchy || 'aggregate';
                              
                              // If selected hierarchy is 'total-aggregate' or 'aggregate', calculate aggregate from all top-level rows
                              let selectedRow;
                              if (currentHierarchy === 'total-aggregate' || (currentHierarchy === 'aggregate' && selectedKAMView === 'Account Director View')) {
                                // Create a synthetic row with aggregate values
                                selectedRow = {
                                  baseline: calculateAggregateForMonthInRollup(monthData, 'Baseline (Revenue) [Read-Only]'),
                                  amAdjusted: calculateAggregateForMonthInRollup(monthData, 'AM Adjusted (Revenue) [Editable]'),
                                  smAdjustment: calculateAggregateForMonthInRollup(monthData, 'SM Adjustment [Read-Only]'),
                                  rsdAdjustment: calculateAggregateForMonthInRollup(monthData, 'RSD Adjustment [Read-Only]'),
                                  finalForecast: calculateAggregateForMonthInRollup(monthData, 'Final Forecast (Revenue) [Read-Only]')
                                };
                              } else {
                                selectedRow = findRowById(monthData, currentHierarchy);
                              }
                              
                              if (!selectedRow) return null;
                              
                              const isSelected = (kpiName) => {
                                return (
                                  selectedCell &&
                                  selectedCell.hierarchy === (selectedCell.hierarchy || 'aggregate') &&
                                  selectedCell.time === monthIdx &&
                                  selectedCell.kpi === kpiName
                                );
                              };

                              return (
                                <div key={`${quarter.id}-${monthIdx}`} className="table-row child-row">
                                  <div className="cell name-cell" style={{ paddingLeft: '56px' }}>
                                    {monthNames[monthIdx]}
                                  </div>
                                  <div
                                    className={`cell ${isSelected('Baseline (Revenue) [Read-Only]') ? 'selected' : ''}`}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                      setSelectedCell({
                                        hierarchy: selectedCell.hierarchy || 'aggregate',
                                        time: monthIdx,
                                        kpi: 'Baseline (Revenue) [Read-Only]'
                                      });
                                      setLastSelectedCell('Baseline (Revenue) [Read-Only]');
                                    }}
                                  >
                                    ${ (selectedRow.baseline || 0).toLocaleString() }
                                  </div>
                                  <div
                                    className={`cell ${isSelected('AM Adjusted (Revenue) [Editable]') ? 'selected' : ''}`}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                      setSelectedCell({
                                        hierarchy: selectedCell.hierarchy || 'aggregate',
                                        time: monthIdx,
                                        kpi: 'AM Adjusted (Revenue) [Editable]'
                                      });
                                      setLastSelectedCell('AM Adjusted (Revenue) [Editable]');
                                    }}
                                  >
                                    ${ (selectedRow.amAdjusted || 0).toLocaleString() }
                                  </div>
                                  <div
                                    className={`cell ${isSelected('SM Adjustment [Read-Only]') ? 'selected' : ''}`}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                      setSelectedCell({
                                        hierarchy: selectedCell.hierarchy || 'aggregate',
                                        time: monthIdx,
                                        kpi: 'SM Adjustment [Read-Only]'
                                      });
                                      setLastSelectedCell('SM Adjustment [Read-Only]');
                                    }}
                                  >
                                    ${ (selectedRow.smAdjustment || 0).toLocaleString() }
                                  </div>
                                  <div
                                    className={`cell ${isSelected('RSD Adjustment [Read-Only]') ? 'selected' : ''}`}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                      setSelectedCell({
                                        hierarchy: selectedCell.hierarchy || 'aggregate',
                                        time: monthIdx,
                                        kpi: 'RSD Adjustment [Read-Only]'
                                      });
                                      setLastSelectedCell('RSD Adjustment [Read-Only]');
                                    }}
                                  >
                                    ${ (selectedRow.rsdAdjustment || 0).toLocaleString() }
                                  </div>
                                  <div
                                    className={`cell ${isSelected('Final Forecast (Revenue) [Read-Only]') ? 'selected' : ''}`}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                      setSelectedCell({
                                        hierarchy: selectedCell.hierarchy || 'aggregate',
                                        time: monthIdx,
                                        kpi: 'Final Forecast (Revenue) [Read-Only]'
                                      });
                                      setLastSelectedCell('Final Forecast (Revenue) [Read-Only]');
                                    }}
                                  >
                                    ${ (selectedRow.finalForecast || 0).toLocaleString() }
                                  </div>
                                </div>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}

                      {/* Show months directly under FY if Month is selected but Quarter is not */}
                      {selectedTimeLevels.has('Month') && !selectedTimeLevels.has('Quarter') && (selectedTimeLevels.has('Year') ? expandedTimePeriods.has('fy2025') : true) && (() => {
                        // Get all months (0-11)
                        const allMonthIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
                        
                        // Sort months if needed
                        const sortedMonthIndices = sortColumn === 'hierarchy:name' 
                          ? [...allMonthIndices].sort((a, b) => {
                              if (sortDirection === 'desc') {
                                return b - a; // Most recent first (highest month index first)
                              } else {
                                return a - b; // Chronological order
                              }
                            })
                          : allMonthIndices;
                        
                        // Apply KPI sorting if needed
                        let finalSortedMonths = sortedMonthIndices;
                        if (sortColumn && sortColumn.startsWith('kpi:')) {
                          const monthsWithData = sortedMonthIndices.map(monthIdx => {
                            const monthDataRaw = generateDataForMonth(months[monthIdx], selectedKAMView === 'Account Director View');
                            const monthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
                              ? transformDataByHierarchyOrder(monthDataRaw, groupedComboboxValue)
                              : monthDataRaw;
                            const selectedLevelsSetForRollup = selectedLevels instanceof Set ? selectedLevels : new Set(selectedLevels || []);
                            const filteredMonthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
                              ? filterDataByLevels(monthData, selectedLevelsSetForRollup, groupedComboboxValue)
                              : monthData;
                            const currentHierarchy = selectedCell.hierarchy || 'aggregate';
                            let selectedRow;
                            if (currentHierarchy === 'total-aggregate') {
                              // Create a synthetic row with aggregate values for sorting
                              selectedRow = {
                                baseline: calculateAggregateForMonthInRollup(filteredMonthData, 'Baseline (Revenue) [Read-Only]'),
                                amAdjusted: calculateAggregateForMonthInRollup(filteredMonthData, 'AM Adjusted (Revenue) [Editable]'),
                                smAdjustment: calculateAggregateForMonthInRollup(filteredMonthData, 'SM Adjustment [Read-Only]'),
                                rsdAdjustment: calculateAggregateForMonthInRollup(filteredMonthData, 'RSD Adjustment [Read-Only]'),
                                finalForecast: calculateAggregateForMonthInRollup(filteredMonthData, 'Final Forecast (Revenue) [Read-Only]')
                              };
                            } else {
                              selectedRow = findRowById(filteredMonthData, currentHierarchy);
                            }
                            return { monthIdx, rowData: selectedRow };
                          });
                          
                          const kpiIdentifier = sortColumn.replace('kpi:', '');
                          finalSortedMonths = [...monthsWithData].sort((a, b) => {
                            const aValue = a.rowData ? getMetricValue(a.rowData, kpiIdentifier) || 0 : 0;
                            const bValue = b.rowData ? getMetricValue(b.rowData, kpiIdentifier) || 0 : 0;
                            if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
                            if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
                            return 0;
                          }).map(m => m.monthIdx);
                        }
                        
                        return finalSortedMonths.filter(monthIdx => {
                          if (!filterLower) return true;
                          const monthName = months[monthIdx];
                          const monthNameFormatted = monthNames[monthIdx];
                          const monthNameOnly = monthName.split(' ')[0].toLowerCase();
                          return monthName.toLowerCase().includes(filterLower) || 
                                 (monthNameFormatted && monthNameFormatted.toLowerCase().includes(filterLower)) ||
                                 monthNameOnly.includes(filterLower);
                        }).map((monthIdx) => {
                          const monthDataRaw = generateDataForMonth(months[monthIdx], selectedKAMView === 'Account Director View');
                          const transformedMonthDataRaw = selectedKAMView === 'Account Director View' && groupedComboboxValue
                            ? transformDataByHierarchyOrder(monthDataRaw, groupedComboboxValue)
                            : monthDataRaw;
                          const selectedLevelsSetForRollup = selectedLevels instanceof Set ? selectedLevels : new Set(selectedLevels || []);
                          const monthData = selectedKAMView === 'Account Director View' && groupedComboboxValue
                            ? filterDataByLevels(transformedMonthDataRaw, selectedLevelsSetForRollup, groupedComboboxValue)
                            : transformedMonthDataRaw;
                          
                          const currentHierarchy = selectedCell.hierarchy || 'aggregate';
                          
                          // If selected hierarchy is 'total-aggregate' or 'aggregate', calculate aggregate from all top-level rows
                          let selectedRow;
                          if (currentHierarchy === 'total-aggregate' || (currentHierarchy === 'aggregate' && selectedKAMView === 'Account Director View')) {
                            // Create a synthetic row with aggregate values
                            selectedRow = {
                              baseline: calculateAggregateForMonthInRollup(monthData, 'Baseline (Revenue) [Read-Only]'),
                              amAdjusted: calculateAggregateForMonthInRollup(monthData, 'AM Adjusted (Revenue) [Editable]'),
                              smAdjustment: calculateAggregateForMonthInRollup(monthData, 'SM Adjustment [Read-Only]'),
                              rsdAdjustment: calculateAggregateForMonthInRollup(monthData, 'RSD Adjustment [Read-Only]'),
                              finalForecast: calculateAggregateForMonthInRollup(monthData, 'Final Forecast (Revenue) [Read-Only]')
                            };
                          } else {
                            selectedRow = findRowById(monthData, currentHierarchy);
                          }
                          
                          if (!selectedRow) return null;
                          
                          const isSelected = (kpiName) => {
                            return (
                              selectedCell &&
                              selectedCell.hierarchy === (selectedCell.hierarchy || 'aggregate') &&
                              selectedCell.time === monthIdx &&
                              selectedCell.kpi === kpiName
                            );
                          };

                          return (
                            <div key={`direct-${monthIdx}`} className="table-row child-row">
                              <div className="cell name-cell" style={{ paddingLeft: selectedTimeLevels.has('Year') ? '32px' : '8px' }}>
                                {monthNames[monthIdx]}
                              </div>
                              <div
                                className={`cell ${isSelected('Baseline (Revenue) [Read-Only]') ? 'selected' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedCell({
                                    hierarchy: selectedCell.hierarchy || 'aggregate',
                                    time: monthIdx,
                                    kpi: 'Baseline (Revenue) [Read-Only]'
                                  });
                                  setLastSelectedCell('Baseline (Revenue) [Read-Only]');
                                }}
                              >
                                ${ (selectedRow.baseline || 0).toLocaleString() }
                              </div>
                              <div
                                className={`cell ${isSelected('AM Adjusted (Revenue) [Editable]') ? 'selected' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedCell({
                                    hierarchy: selectedCell.hierarchy || 'aggregate',
                                    time: monthIdx,
                                    kpi: 'AM Adjusted (Revenue) [Editable]'
                                  });
                                  setLastSelectedCell('AM Adjusted (Revenue) [Editable]');
                                }}
                              >
                                ${ (selectedRow.amAdjusted || 0).toLocaleString() }
                              </div>
                              <div
                                className={`cell ${isSelected('SM Adjustment [Read-Only]') ? 'selected' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedCell({
                                    hierarchy: selectedCell.hierarchy || 'aggregate',
                                    time: monthIdx,
                                    kpi: 'SM Adjustment [Read-Only]'
                                  });
                                  setLastSelectedCell('SM Adjustment [Read-Only]');
                                }}
                              >
                                ${ (selectedRow.smAdjustment || 0).toLocaleString() }
                              </div>
                              <div
                                className={`cell ${isSelected('RSD Adjustment [Read-Only]') ? 'selected' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedCell({
                                    hierarchy: selectedCell.hierarchy || 'aggregate',
                                    time: monthIdx,
                                    kpi: 'RSD Adjustment [Read-Only]'
                                  });
                                  setLastSelectedCell('RSD Adjustment [Read-Only]');
                                }}
                              >
                                ${ (selectedRow.rsdAdjustment || 0).toLocaleString() }
                              </div>
                              <div
                                className={`cell ${isSelected('Final Forecast (Revenue) [Read-Only]') ? 'selected' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedCell({
                                    hierarchy: selectedCell.hierarchy || 'aggregate',
                                    time: monthIdx,
                                    kpi: 'Final Forecast (Revenue) [Read-Only]'
                                  });
                                  setLastSelectedCell('Final Forecast (Revenue) [Read-Only]');
                                }}
                              >
                                ${ (selectedRow.finalForecast || 0).toLocaleString() }
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
