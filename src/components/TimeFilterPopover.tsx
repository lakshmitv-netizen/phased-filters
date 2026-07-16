import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import '../styles/components/TimeFilterPopover.css';

interface TimeFilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (field: string, operator: string, selectedValues: string[]) => void;
  onCancel: () => void;
  initialField?: string;
  initialOperator?: string;
  initialValue?: string; // Comma-separated string of selected time periods
  anchorElement: HTMLElement | null;
}

const fieldOptions = [
  { value: 'time', label: 'Time' }
];

const operatorOptions = [
  { value: 'equals', label: 'Equals' },
  { value: 'notEquals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'notContains', label: 'Not Contains' }
];

// Time period options
const timePeriods = [
  { value: 'year', label: 'Year (FY26)' },
  { value: 'q1', label: 'Q1' },
  { value: 'q2', label: 'Q2' },
  { value: 'q3', label: 'Q3' },
  { value: 'q4', label: 'Q4' },
  { value: 'jan2026', label: 'Jan 2026' },
  { value: 'feb2026', label: 'Feb 2026' },
  { value: 'mar2026', label: 'Mar 2026' },
  { value: 'apr2026', label: 'Apr 2026' },
  { value: 'may2026', label: 'May 2026' },
  { value: 'jun2026', label: 'Jun 2026' },
  { value: 'jul2026', label: 'Jul 2026' },
  { value: 'aug2026', label: 'Aug 2026' },
  { value: 'sep2026', label: 'Sep 2026' },
  { value: 'oct2026', label: 'Oct 2026' },
  { value: 'nov2026', label: 'Nov 2026' },
  { value: 'dec2026', label: 'Dec 2026' }
];

const TimeFilterPopover: React.FC<TimeFilterPopoverProps> = ({
  isOpen,
  onClose,
  onSave,
  onCancel,
  initialField,
  initialOperator,
  initialValue,
  anchorElement
}) => {
  const [selectedField, setSelectedField] = useState<string>(initialField || 'time');
  const [selectedOperator, setSelectedOperator] = useState<string>(initialOperator || 'equals');
  const [valueFieldClicked, setValueFieldClicked] = useState(false);
  const [filterValueSearch, setFilterValueSearch] = useState('');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [initialSelectedValues, setInitialSelectedValues] = useState<string[]>([]);
  
  const [isFieldDropdownOpen, setIsFieldDropdownOpen] = useState(false);
  const [isOperatorDropdownOpen, setIsOperatorDropdownOpen] = useState(false);
  
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fieldDropdownRef = useRef<HTMLDivElement>(null);
  const operatorDropdownRef = useRef<HTMLDivElement>(null);
  
  // Initialize selected values from initialValue prop
  useEffect(() => {
    if (isOpen && initialValue) {
      const parsed = initialValue.split(',').map(v => v.trim()).filter(v => v.length > 0);
      setSelectedValues(parsed);
      setInitialSelectedValues(parsed);
    } else if (isOpen && !initialValue) {
      setSelectedValues([]);
      setInitialSelectedValues([]);
    }
  }, [isOpen, initialValue]);
  
  // Initialize field and operator
  useEffect(() => {
    if (isOpen) {
      if (initialField) setSelectedField(initialField);
      if (initialOperator) setSelectedOperator(initialOperator);
    }
  }, [isOpen, initialField, initialOperator]);
  
  // Reset search when popover closes
  useEffect(() => {
    if (!isOpen) {
      setFilterValueSearch('');
      setValueFieldClicked(false);
      setIsFieldDropdownOpen(false);
      setIsOperatorDropdownOpen(false);
    }
  }, [isOpen]);
  
  // Auto-focus search input when expanded
  useEffect(() => {
    if (valueFieldClicked && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [valueFieldClicked]);
  
  // Handle click outside to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        anchorElement &&
        !anchorElement.contains(event.target as Node) &&
        fieldDropdownRef.current &&
        !fieldDropdownRef.current.contains(event.target as Node) &&
        operatorDropdownRef.current &&
        !operatorDropdownRef.current.contains(event.target as Node)
      ) {
        handleCancel();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, anchorElement]);
  
  // Handle click outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fieldDropdownRef.current && !fieldDropdownRef.current.contains(event.target as Node)) {
        setIsFieldDropdownOpen(false);
      }
      if (operatorDropdownRef.current && !operatorDropdownRef.current.contains(event.target as Node)) {
        setIsOperatorDropdownOpen(false);
      }
    };
    
    if (isFieldDropdownOpen || isOperatorDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFieldDropdownOpen, isOperatorDropdownOpen]);
  
  // Filter time periods based on search
  const filteredTimePeriods = timePeriods.filter(period => {
    if (!filterValueSearch.trim()) return true;
    return period.label.toLowerCase().includes(filterValueSearch.toLowerCase().trim());
  });
  
  // Determine if we're revisiting a saved filter
  const isRevisitingSavedFilter = initialValue && initialSelectedValues.length > 0;
  
  // Sort time periods: selected items first when revisiting saved filter, otherwise maintain order
  const sortedTimePeriods = isRevisitingSavedFilter
    ? [...filteredTimePeriods].sort((a, b) => {
        const aWasSelected = initialSelectedValues.includes(a.value);
        const bWasSelected = initialSelectedValues.includes(b.value);
        if (aWasSelected && !bWasSelected) return -1;
        if (!aWasSelected && bWasSelected) return 1;
        // Maintain original order
        return timePeriods.indexOf(a) - timePeriods.indexOf(b);
      })
    : filteredTimePeriods;
  
  // Check if all filtered time periods are selected
  const allFilteredSelected = filteredTimePeriods.length > 0 && 
    filteredTimePeriods.every(period => selectedValues.includes(period.value));
  
  const handleToggleTimePeriod = (periodValue: string) => {
    setSelectedValues(prev => {
      if (prev.includes(periodValue)) {
        return prev.filter(p => p !== periodValue);
      } else {
        return [...prev, periodValue];
      }
    });
  };
  
  const handleToggleAll = () => {
    if (allFilteredSelected) {
      // Deselect all filtered time periods
      setSelectedValues(prev => prev.filter(p => !filteredTimePeriods.some(tp => tp.value === p)));
    } else {
      // Select all filtered time periods
      setSelectedValues(prev => {
        const newSet = new Set([...prev, ...filteredTimePeriods.map(tp => tp.value)]);
        return Array.from(newSet);
      });
    }
  };
  
  const handleSave = () => {
    onSave(selectedField, selectedOperator, selectedValues);
    onClose();
  };
  
  const handleCancel = () => {
    // Restore original values
    if (initialValue) {
      const parsed = initialValue.split(',').map(v => v.trim()).filter(v => v.length > 0);
      setSelectedValues(parsed);
    } else {
      setSelectedValues([]);
    }
    if (initialField) setSelectedField(initialField);
    if (initialOperator) setSelectedOperator(initialOperator);
    setFilterValueSearch('');
    setValueFieldClicked(false);
    onCancel();
  };
  
  if (!isOpen) return null;
  
  // Calculate popover position relative to viewport (fixed positioning)
  const getPopoverPosition = () => {
    if (!anchorElement) return { top: 8, left: 8 };
    const rect = anchorElement.getBoundingClientRect();
    const popoverWidth = 320;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const leftOfAnchor = rect.left - popoverWidth - gap;
    const rightOfAnchor = rect.right + gap;
    const left = leftOfAnchor >= gap ? leftOfAnchor
      : rightOfAnchor + popoverWidth <= vw - gap ? rightOfAnchor
      : Math.max(gap, vw - popoverWidth - gap);
    const top = Math.min(rect.bottom + gap, vh - 300);
    return { top, left };
  };

  const position = getPopoverPosition();
  const selectedCount = selectedValues.length;

  const popoverContent = (
    <>
      {/* Backdrop overlay */}
      <div className="time-filter-popover-backdrop" onClick={handleCancel} />
      
      {/* Popover */}
      <div
        ref={popoverRef}
        className="time-filter-popover"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`
        }}
      >
        {/* Nubbin */}
        <div className="time-filter-popover-nubbin" />
        
        {/* Field Section */}
        <div className="time-filter-field-section">
          <label className="time-filter-label">Field</label>
          <div className="time-filter-dropdown-wrapper" ref={fieldDropdownRef}>
            <div 
              className={`time-filter-dropdown-trigger ${isFieldDropdownOpen ? 'open' : ''}`}
              onClick={() => {
                setIsFieldDropdownOpen(!isFieldDropdownOpen);
                setIsOperatorDropdownOpen(false);
              }}
            >
              <span className="time-filter-dropdown-value">
                {fieldOptions.find(f => f.value === selectedField)?.label || selectedField}
              </span>
              <svg className="time-filter-dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {isFieldDropdownOpen && (
              <div className="time-filter-dropdown-list">
                {fieldOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`time-filter-dropdown-option ${selectedField === option.value ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedField(option.value);
                      setIsFieldDropdownOpen(false);
                    }}
                  >
                    {option.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Operator Section */}
        <div className="time-filter-field-section">
          <label className="time-filter-label">Operator</label>
          <div className="time-filter-dropdown-wrapper" ref={operatorDropdownRef}>
            <div 
              className={`time-filter-dropdown-trigger ${isOperatorDropdownOpen ? 'open' : ''}`}
              onClick={() => {
                setIsOperatorDropdownOpen(!isOperatorDropdownOpen);
                setIsFieldDropdownOpen(false);
              }}
            >
              <span className="time-filter-dropdown-value">
                {operatorOptions.find(o => o.value === selectedOperator)?.label || selectedOperator}
              </span>
              <svg className="time-filter-dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {isOperatorDropdownOpen && (
              <div className="time-filter-dropdown-list">
                {operatorOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`time-filter-dropdown-option ${selectedOperator === option.value ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedOperator(option.value);
                      setIsOperatorDropdownOpen(false);
                    }}
                  >
                    {option.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Value Section */}
        <div className="time-filter-field-section">
          <label className="time-filter-label">Value</label>
          
          {/* Collapsed State */}
          {!valueFieldClicked && (
            <div
              className="time-filter-display-box"
              onClick={() => {
                setValueFieldClicked(true);
                setIsFieldDropdownOpen(false);
                setIsOperatorDropdownOpen(false);
              }}
            >
              {selectedCount > 0 ? (
                <span className="time-filter-display-text-selected">
                  {selectedCount} {selectedCount === 1 ? 'Item' : 'Items'} selected
                </span>
              ) : (
                <span className="time-filter-display-text-empty">
                  Click to select values...
                </span>
              )}
            </div>
          )}
          
          {/* Expanded State */}
          {valueFieldClicked && (
            <div className="time-filter-expanded-container">
              {/* Search Input Section */}
              <div className="time-filter-search-section">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="time-filter-search-input"
                  placeholder="Search time periods..."
                  value={filterValueSearch}
                  onChange={(e) => setFilterValueSearch(e.target.value)}
                />
              </div>
              
              {/* Scrollable Checkbox List */}
              <div className="time-filter-checkbox-list">
                {/* "All" Checkbox */}
                {filteredTimePeriods.length > 0 && (
                  <label className="time-filter-checkbox-item time-filter-checkbox-all">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={handleToggleAll}
                      className="time-filter-checkbox"
                    />
                    <span className="time-filter-checkbox-label">All</span>
                  </label>
                )}
                
                {/* Empty State - No search, no selection */}
                {!filterValueSearch.trim() && selectedCount === 0 && sortedTimePeriods.length === 0 && (
                  <div className="time-filter-empty-state">
                    Start typing to see options...
                  </div>
                )}
                
                {/* Time Period Checkboxes */}
                {sortedTimePeriods.length > 0 && (
                  <>
                    {sortedTimePeriods.map((period) => (
                      <label
                        key={period.value}
                        className="time-filter-checkbox-item"
                      >
                        <input
                          type="checkbox"
                          checked={selectedValues.includes(period.value)}
                          onChange={() => handleToggleTimePeriod(period.value)}
                          className="time-filter-checkbox"
                        />
                        <span className="time-filter-checkbox-label">{period.label}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div className="time-filter-actions">
          <button
            className="time-filter-button time-filter-button-cancel"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className="time-filter-button time-filter-button-save"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(popoverContent, document.body);
};

export default TimeFilterPopover;

