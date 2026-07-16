import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { MeasureData } from '../types';
// Icon imports - using public folder paths (SVGs with built-in colored backgrounds)
const ProductIcon = '/product.svg';
import '../styles/components/ProductFilterPopover.css';

interface ProductFilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (field: string, operator: string, selectedValues: string[]) => void;
  onCancel: () => void;
  initialField?: string;
  initialOperator?: string;
  initialValue?: string; // Comma-separated string of selected products
  data: MeasureData[];
  anchorElement: HTMLElement | null;
}

/**
 * Extract all unique product names from MeasureData
 */
const extractProducts = (data: MeasureData[]): string[] => {
  const productSet = new Set<string>();
  
  const extractFromRow = (row: any) => {
    if (row.type === 'product' && (!row.children || row.children.length === 0)) {
      productSet.add(row.name);
    }
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
  
  const products = Array.from(productSet).sort((a, b) => a.localeCompare(b));
  return products;
};

const fieldOptions = [
  { value: 'products', label: 'Products' }
];

const operatorOptions = [
  { value: 'equals', label: 'Equals' },
  { value: 'notEquals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'notContains', label: 'Not Contains' }
];

const ProductFilterPopover: React.FC<ProductFilterPopoverProps> = ({
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
  const [selectedField, setSelectedField] = useState<string>(initialField || 'products');
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
  
  // Extract products from data
  const allProducts = extractProducts(data);
  
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
  
  // Filter products based on search
  const filteredProducts = allProducts.filter(product => {
    if (!filterValueSearch.trim()) return true;
    return product.toLowerCase().includes(filterValueSearch.toLowerCase().trim());
  });
  
  // Determine if we're revisiting a saved filter
  const isRevisitingSavedFilter = initialValue && initialSelectedValues.length > 0;
  
  // Sort products: selected items first when revisiting saved filter, otherwise alphabetical
  const sortedProducts = isRevisitingSavedFilter
    ? [...filteredProducts].sort((a, b) => {
        const aWasSelected = initialSelectedValues.includes(a);
        const bWasSelected = initialSelectedValues.includes(b);
        if (aWasSelected && !bWasSelected) return -1;
        if (!aWasSelected && bWasSelected) return 1;
        return a.localeCompare(b);
      })
    : filteredProducts;
  
  // Check if all filtered products are selected
  const allFilteredSelected = filteredProducts.length > 0 && 
    filteredProducts.every(product => selectedValues.includes(product));
  
  const handleToggleProduct = (product: string) => {
    setSelectedValues(prev => {
      if (prev.includes(product)) {
        return prev.filter(p => p !== product);
      } else {
        return [...prev, product];
      }
    });
  };
  
  const handleToggleAll = () => {
    if (allFilteredSelected) {
      // Deselect all filtered products
      setSelectedValues(prev => prev.filter(p => !filteredProducts.includes(p)));
    } else {
      // Select all filtered products
      setSelectedValues(prev => {
        const newSet = new Set([...prev, ...filteredProducts]);
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
  // Position popover to the left of the filter card, aligned so nubbin originates from the product block
  const getPopoverPosition = () => {
    if (!anchorElement) return { top: 0, left: 0, maxHeight: 'none', contentMaxHeight: 'none', nubbinTop: '50%' };
    
    const rect = anchorElement.getBoundingClientRect();
    const popoverWidth = 320; // Width of the popover
    const buttonAreaHeight = 40; // Approximate height of buttons section
    const paddingTop = 12;
    const paddingBottom = 12;
    const minContentHeight = 100; // Minimum height for content area
    
    // Find header height to ensure popover doesn't go under it
    const pageHeader = document.querySelector('.page-header');
    const headerHeight = pageHeader ? pageHeader.getBoundingClientRect().height : 0;
    const headerBottom = headerHeight + 8; // Add 8px margin below header
    
    // Calculate available space above and below the filter card
    const spaceAbove = rect.top - headerBottom; // Account for header
    const spaceBelow = window.innerHeight - rect.bottom - 8; // 8px margin from bottom
    const filterCardCenterY = rect.top + (rect.height / 2);
    
    // Calculate maximum height to ensure buttons are always visible
    // Note: This is calculated but not directly used - height is managed via CSS maxHeight
    Math.min(
      spaceAbove + spaceBelow + rect.height, // Total available vertical space
      window.innerHeight - headerBottom - 8 // Viewport height minus header and margins
    );
    
    // Calculate maximum available height for the entire popover (including buttons)
    const maxAvailablePopoverHeight = window.innerHeight - headerBottom - 8; // 8px margin from bottom
    
    // Calculate maximum content height (total height - padding - buttons - gaps)
    const maxContentHeight = maxAvailablePopoverHeight - buttonAreaHeight - paddingTop - paddingBottom - 16; // 16px for gaps
    const actualContentHeight = Math.max(minContentHeight, Math.min(maxContentHeight, 280)); // Increased cap for taller popover
    
    // Calculate actual total popover height
    const actualPopoverHeight = actualContentHeight + buttonAreaHeight + paddingTop + paddingBottom + 16;
    
    // Position popover so nubbin aligns with filter card center
    const nubbinTargetY = filterCardCenterY;
    
    // Calculate ideal popover top so nubbin (at middle) aligns with filter card center
    const idealPopoverTop = nubbinTargetY - (actualPopoverHeight / 2);
    
    // Ensure popover is below header
    let adjustedTop = Math.max(headerBottom, idealPopoverTop);
    
    // Ensure popover doesn't go below viewport - this is critical
    const popoverBottom = adjustedTop + actualPopoverHeight;
    if (popoverBottom > window.innerHeight - 8) {
      // Adjust upward to fit within viewport
      adjustedTop = window.innerHeight - 8 - actualPopoverHeight;
      // But don't go above header
      adjustedTop = Math.max(headerBottom, adjustedTop);
    }
    
    // Recalculate content height based on final position to ensure buttons are always visible
    const finalMaxContentHeight = window.innerHeight - adjustedTop - 8 - buttonAreaHeight - paddingTop - paddingBottom - 16;
    let finalContentHeight = Math.max(minContentHeight, Math.min(finalMaxContentHeight, actualContentHeight));
    
    // Final verification: ensure popover with final height fits
    const finalPopoverHeightCheck = finalContentHeight + buttonAreaHeight + paddingTop + paddingBottom + 16;
    if (adjustedTop + finalPopoverHeightCheck > window.innerHeight - 8) {
      // If still doesn't fit, reduce content height further
      const maxAllowedContentHeight = window.innerHeight - adjustedTop - 8 - buttonAreaHeight - paddingTop - paddingBottom - 16;
      finalContentHeight = Math.max(minContentHeight, maxAllowedContentHeight);
    }
    
    // Recalculate final popover height with adjusted content height
    let finalPopoverHeight = finalContentHeight + buttonAreaHeight + paddingTop + paddingBottom + 16;
    
    // Final check: ensure popover bottom doesn't exceed viewport
    const popoverBottomFinal = adjustedTop + finalPopoverHeight;
    if (popoverBottomFinal > window.innerHeight - 8) {
      // Reduce popover height to fit
      finalPopoverHeight = window.innerHeight - adjustedTop - 8;
      // Recalculate content height to match
      finalContentHeight = finalPopoverHeight - buttonAreaHeight - paddingTop - paddingBottom - 16;
      finalContentHeight = Math.max(minContentHeight, finalContentHeight);
      // Recalculate popover height with adjusted content
      finalPopoverHeight = finalContentHeight + buttonAreaHeight + paddingTop + paddingBottom + 16;
    }
    
    // Calculate exact nubbin position to align with filter card center
    const nubbinOffsetFromPopoverTop = nubbinTargetY - adjustedTop;
    
    // Clamp nubbin position to be within reasonable bounds (20px from edges)
    const minNubbinTop = 20;
    const maxNubbinTop = finalPopoverHeight - 20;
    const clampedNubbinTop = Math.max(minNubbinTop, Math.min(nubbinOffsetFromPopoverTop, maxNubbinTop));
    
    const vw = window.innerWidth;
    const gap = 8;
    const leftOfAnchor = rect.left - popoverWidth - gap;
    const rightOfAnchor = rect.right + gap;
    const finalLeft = leftOfAnchor >= gap ? leftOfAnchor
      : rightOfAnchor + popoverWidth <= vw - gap ? rightOfAnchor
      : Math.max(gap, vw - popoverWidth - gap);

    return {
      top: adjustedTop,
      left: finalLeft,
      maxHeight: `${finalPopoverHeight}px`, // Total height including padding, content, buttons, and gaps
      contentMaxHeight: `${finalContentHeight}px`, // Max height for scrollable content area
      nubbinTop: `${clampedNubbinTop}px` // Dynamic nubbin position, clamped within bounds
    };
  };
  
  const position = getPopoverPosition();
  const selectedCount = selectedValues.length;

  const popoverContent = (
    <>
      {/* Backdrop overlay */}
      <div className="product-filter-popover-backdrop" onClick={handleCancel} />
      
      {/* Popover */}
      <div
        ref={popoverRef}
        className="product-filter-popover"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          maxHeight: position.maxHeight
        }}
      >
        {/* Nubbin */}
        <div 
          className="product-filter-popover-nubbin" 
          style={{ top: position.nubbinTop }}
        />
        
        {/* Scrollable Content Area */}
        <div 
          className="product-filter-popover-content-scrollable"
          style={{ maxHeight: position.contentMaxHeight }}
        >
          {/* Field Section */}
          <div className="product-filter-field-section">
          <label className="product-filter-label">Field</label>
          <div className="product-filter-dropdown-wrapper" ref={fieldDropdownRef}>
            <div 
              className={`product-filter-dropdown-trigger ${isFieldDropdownOpen ? 'open' : ''}`}
              onClick={() => {
                setIsFieldDropdownOpen(!isFieldDropdownOpen);
                setIsOperatorDropdownOpen(false);
              }}
            >
              <img src={ProductIcon} alt="Product" style={{ width: '16px', height: '16px', marginRight: '8px', flexShrink: 0 }} />
              <span className="product-filter-dropdown-value">
                {fieldOptions.find(f => f.value === selectedField)?.label || selectedField}
              </span>
              <svg className="product-filter-dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {isFieldDropdownOpen && (
              <div className="product-filter-dropdown-list">
                {fieldOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`product-filter-dropdown-option ${selectedField === option.value ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedField(option.value);
                      setIsFieldDropdownOpen(false);
                    }}
                  >
                    <img src={ProductIcon} alt="Product" style={{ width: '16px', height: '16px', marginRight: '8px', flexShrink: 0 }} />
                    {option.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Operator Section */}
        <div className="product-filter-field-section">
          <label className="product-filter-label">Operator</label>
          <div className="product-filter-dropdown-wrapper" ref={operatorDropdownRef}>
            <div 
              className={`product-filter-dropdown-trigger ${isOperatorDropdownOpen ? 'open' : ''}`}
              onClick={() => {
                setIsOperatorDropdownOpen(!isOperatorDropdownOpen);
                setIsFieldDropdownOpen(false);
              }}
            >
              <span className="product-filter-dropdown-value">
                {operatorOptions.find(o => o.value === selectedOperator)?.label || selectedOperator}
              </span>
              <svg className="product-filter-dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {isOperatorDropdownOpen && (
              <div className="product-filter-dropdown-list">
                {operatorOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`product-filter-dropdown-option ${selectedOperator === option.value ? 'selected' : ''}`}
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
        <div className="product-filter-field-section">
          <label className="product-filter-label">Value</label>
          
          {/* Collapsed State */}
          {!valueFieldClicked && (
            <div
              className="product-filter-display-box"
              onClick={() => {
                setValueFieldClicked(true);
                setIsFieldDropdownOpen(false);
                setIsOperatorDropdownOpen(false);
              }}
            >
              {selectedCount > 0 ? (
                <span className="product-filter-display-text-selected">
                  {selectedCount} {selectedCount === 1 ? 'Item' : 'Items'} selected
                </span>
              ) : (
                <span className="product-filter-display-text-empty">
                  Click to select values...
                </span>
              )}
            </div>
          )}
          
          {/* Expanded State */}
          {valueFieldClicked && (
            <div className="product-filter-expanded-container">
              {/* Search Input Section */}
              <div className="product-filter-search-section">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="product-filter-search-input"
                  placeholder="Search products..."
                  value={filterValueSearch}
                  onChange={(e) => setFilterValueSearch(e.target.value)}
                />
              </div>
              
              {/* Scrollable Checkbox List */}
              <div className="product-filter-checkbox-list">
                {/* "All" Checkbox */}
                {filteredProducts.length > 0 && (
                  <label className="product-filter-checkbox-item product-filter-checkbox-all">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={handleToggleAll}
                      className="product-filter-checkbox"
                    />
                    <span className="product-filter-checkbox-label">All</span>
                  </label>
                )}
                
                {/* Empty State - No search, no selection */}
                {!filterValueSearch.trim() && selectedCount === 0 && sortedProducts.length === 0 && (
                  <div className="product-filter-empty-state">
                    Start typing to see options...
                  </div>
                )}
                
                {/* Product Checkboxes */}
                {sortedProducts.length > 0 && (
                  <>
                    {sortedProducts.map((product) => (
                      <label
                        key={product}
                        className="product-filter-checkbox-item"
                      >
                        <input
                          type="checkbox"
                          checked={selectedValues.includes(product)}
                          onChange={() => handleToggleProduct(product)}
                          className="product-filter-checkbox"
                        />
                        <span className="product-filter-checkbox-label">{product}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
        
        {/* Action Buttons */}
        <div className="product-filter-actions">
          <button
            className="product-filter-button product-filter-button-cancel"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className="product-filter-button product-filter-button-save"
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

export default ProductFilterPopover;
