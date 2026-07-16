import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { MeasureData } from '../types';
// Icon imports - using public folder paths (SVGs with built-in colored backgrounds)
const CategoryIcon = '/category.svg';
import '../styles/components/CategoryFilterPopover.css';

/**
 * Extract all unique category names from MeasureData
 */
const extractCategories = (data: MeasureData[]): string[] => {
  const categorySet = new Set<string>();
  
  const extractFromRow = (row: any) => {
    // Categories can have children (products), so we don't check for no children
    if (row.type === 'category') {
      categorySet.add(row.name);
    }
    // Continue traversing to find all categories
    if (row.children && row.children.length > 0) {
      row.children.forEach((child: any) => extractFromRow(child));
    }
  };
  
  data.forEach(measure => {
    if (measure.children) {
      measure.children.forEach(account => {
        extractFromRow(account);
      });
    }
  });
  
  const categories = Array.from(categorySet).sort((a, b) => a.localeCompare(b));
  return categories;
};

interface CategoryFilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (field: string, operator: string, selectedValues: string[]) => void;
  onCancel: () => void;
  initialField?: string;
  initialOperator?: string;
  initialValue?: string; // Comma-separated string of selected categories
  data: MeasureData[];
  anchorElement: HTMLElement | null;
}


const fieldOptions = [
  { value: 'category', label: 'Category' }
];

const operatorOptions = [
  { value: 'equals', label: 'Equals' },
  { value: 'notEquals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'notContains', label: 'Not Contains' }
];

const CategoryFilterPopover: React.FC<CategoryFilterPopoverProps> = ({
  isOpen,
  onClose,
  onSave,
  onCancel,
  initialField,
  initialOperator,
  initialValue,
  data,
  anchorElement
}) => {
  const [selectedField, setSelectedField] = useState<string>(initialField || 'category');
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
  
  // Extract categories from data
  const allCategories = extractCategories(data);
  
  // Debug: Log categories to console
  useEffect(() => {
    if (isOpen && allCategories.length === 0) {
      console.log('[CategoryFilter] No categories found. Data:', data);
      console.log('[CategoryFilter] Data length:', data.length);
    } else if (isOpen) {
      console.log('[CategoryFilter] Found categories:', allCategories);
    }
  }, [isOpen, allCategories, data]);
  
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
  
  // Filter categories based on search
  const filteredCategories = allCategories.filter(category => {
    if (!filterValueSearch.trim()) return true;
    return category.toLowerCase().includes(filterValueSearch.toLowerCase().trim());
  });
  
  // Determine if we're revisiting a saved filter
  const isRevisitingSavedFilter = initialValue && initialSelectedValues.length > 0;
  
  // Sort categories: selected items first when revisiting saved filter, otherwise alphabetical
  const sortedCategories = isRevisitingSavedFilter
    ? [...filteredCategories].sort((a, b) => {
        const aWasSelected = initialSelectedValues.includes(a);
        const bWasSelected = initialSelectedValues.includes(b);
        if (aWasSelected && !bWasSelected) return -1;
        if (!aWasSelected && bWasSelected) return 1;
        return a.localeCompare(b);
      })
    : filteredCategories;
  
  // Check if all filtered categories are selected
  const allFilteredSelected = filteredCategories.length > 0 && 
    filteredCategories.every(category => selectedValues.includes(category));
  
  const handleToggleCategory = (category: string) => {
    setSelectedValues(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };
  
  const handleToggleAll = () => {
    if (allFilteredSelected) {
      // Deselect all filtered categories
      setSelectedValues(prev => prev.filter(c => !filteredCategories.includes(c)));
    } else {
      // Select all filtered categories
      setSelectedValues(prev => {
        const newSet = new Set([...prev, ...filteredCategories]);
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

  const getPopoverPosition = () => {
    if (!anchorElement) return { top: 8, left: 8 };
    const rect = anchorElement.getBoundingClientRect();
    const popoverWidth = 320;
    const popoverHeight = 370;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer left of anchor; fall back to right if not enough space
    const leftOfAnchor = rect.left - popoverWidth - gap;
    const rightOfAnchor = rect.right + gap;
    const left = leftOfAnchor >= gap ? leftOfAnchor
      : rightOfAnchor + popoverWidth <= vw - gap ? rightOfAnchor
      : Math.max(gap, vw - popoverWidth - gap);

    // Vertically centre on anchor, then clamp
    const idealTop = rect.top + rect.height / 2 - popoverHeight / 2;
    const top = Math.min(Math.max(gap, idealTop), vh - popoverHeight - gap);

    return { top, left };
  };

  const position = getPopoverPosition();
  const selectedCount = selectedValues.length;

  const popoverContent = (
    <>
      {/* Backdrop overlay */}
      <div className="category-filter-popover-backdrop" onClick={handleCancel} />
      
      {/* Popover */}
      <div
        ref={popoverRef}
        className="category-filter-popover"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`
        }}
      >
        {/* Nubbin */}
        <div className="category-filter-popover-nubbin" />
        
        {/* Field Section */}
        <div className="category-filter-field-section">
          <label className="category-filter-label">Field</label>
          <div className="category-filter-dropdown-wrapper" ref={fieldDropdownRef}>
            <div 
              className={`category-filter-dropdown-trigger ${isFieldDropdownOpen ? 'open' : ''}`}
              onClick={() => {
                setIsFieldDropdownOpen(!isFieldDropdownOpen);
                setIsOperatorDropdownOpen(false);
              }}
            >
              <img src={CategoryIcon} alt="Category" style={{ width: '16px', height: '16px', marginRight: '8px', flexShrink: 0 }} />
              <span className="category-filter-dropdown-value">
                {fieldOptions.find(f => f.value === selectedField)?.label || selectedField}
              </span>
              <svg className="category-filter-dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {isFieldDropdownOpen && (
              <div className="category-filter-dropdown-list">
                {fieldOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`category-filter-dropdown-option ${selectedField === option.value ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedField(option.value);
                      setIsFieldDropdownOpen(false);
                    }}
                  >
                    <img src={CategoryIcon} alt="Category" style={{ width: '16px', height: '16px', marginRight: '8px', flexShrink: 0 }} />
                    {option.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Operator Section */}
        <div className="category-filter-field-section">
          <label className="category-filter-label">Operator</label>
          <div className="category-filter-dropdown-wrapper" ref={operatorDropdownRef}>
            <div 
              className={`category-filter-dropdown-trigger ${isOperatorDropdownOpen ? 'open' : ''}`}
              onClick={() => {
                setIsOperatorDropdownOpen(!isOperatorDropdownOpen);
                setIsFieldDropdownOpen(false);
              }}
            >
              <span className="category-filter-dropdown-value">
                {operatorOptions.find(o => o.value === selectedOperator)?.label || selectedOperator}
              </span>
              <svg className="category-filter-dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {isOperatorDropdownOpen && (
              <div className="category-filter-dropdown-list">
                {operatorOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`category-filter-dropdown-option ${selectedOperator === option.value ? 'selected' : ''}`}
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
        <div className="category-filter-field-section">
          <label className="category-filter-label">Value</label>
          
          {/* Collapsed State */}
          {!valueFieldClicked && (
            <div
              className="category-filter-display-box"
              onClick={() => {
                setValueFieldClicked(true);
                setIsFieldDropdownOpen(false);
                setIsOperatorDropdownOpen(false);
              }}
            >
              {selectedCount > 0 ? (
                <span className="category-filter-display-text-selected">
                  {selectedCount} {selectedCount === 1 ? 'Item' : 'Items'} selected
                </span>
              ) : (
                <span className="category-filter-display-text-empty">
                  Click to select values...
                </span>
              )}
            </div>
          )}
          
          {/* Expanded State */}
          {valueFieldClicked && (
            <div className="category-filter-expanded-container">
              {/* Search Input Section */}
              <div className="category-filter-search-section">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="category-filter-search-input"
                  placeholder="Search categories..."
                  value={filterValueSearch}
                  onChange={(e) => setFilterValueSearch(e.target.value)}
                />
              </div>
              
              {/* Scrollable Checkbox List */}
              <div className="category-filter-checkbox-list">
                {/* "All" Checkbox */}
                {filteredCategories.length > 0 && (
                  <label className="category-filter-checkbox-item category-filter-checkbox-all">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={handleToggleAll}
                      className="category-filter-checkbox"
                    />
                    <span className="category-filter-checkbox-label">All</span>
                  </label>
                )}
                
                {/* Empty State - No categories found */}
                {sortedCategories.length === 0 && (
                  <div className="category-filter-empty-state">
                    {filterValueSearch.trim() ? 'No categories found' : 'No categories available'}
                  </div>
                )}
                
                {/* Category Checkboxes */}
                {sortedCategories.length > 0 && (
                  <>
                    {sortedCategories.map((category) => (
                      <label
                        key={category}
                        className="category-filter-checkbox-item"
                      >
                        <input
                          type="checkbox"
                          checked={selectedValues.includes(category)}
                          onChange={() => handleToggleCategory(category)}
                          className="category-filter-checkbox"
                        />
                        <span className="category-filter-checkbox-label">{category}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div className="category-filter-actions">
          <button
            className="category-filter-button category-filter-button-cancel"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className="category-filter-button category-filter-button-save"
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

export default CategoryFilterPopover;

