import React, { useState, useRef, useEffect } from 'react';
import '../styles/components/SearchableSelect.css';

export interface SearchableSelectOptionGroup {
  label: string;
  options: string[];
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  /** When provided, options are rendered under labelled group headers (after any flat `options`). */
  optionGroups?: SearchableSelectOptionGroup[];
  placeholder?: string;
  label?: string;
  className?: string;
  showSearch?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  optionGroups,
  placeholder = 'Select...',
  label,
  className = '',
  showSearch = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter options based on search term
  const matchesSearch = (option: string) =>
    option.toLowerCase().includes(searchTerm.toLowerCase());
  const filteredOptions = options.filter(matchesSearch);
  const filteredGroups = (optionGroups ?? [])
    .map(g => ({ label: g.label, options: g.options.filter(matchesSearch) }))
    .filter(g => g.options.length > 0);
  const hasAnyResult = filteredOptions.length > 0 || filteredGroups.length > 0;

  // Get display value
  const displayValue = value || placeholder;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when dropdown opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSearchTerm('');
    }
  };

  return (
    <div className={`searchable-select-wrapper ${className}`} ref={wrapperRef}>
      {label && <label className="list-page-modal-label">{label}</label>}
      <div className={`searchable-select ${isOpen ? 'open' : ''}`}>
        <button
          type="button"
          className="searchable-select-trigger"
          onClick={handleToggle}
          aria-expanded={isOpen}
        >
          <span className={value ? 'searchable-select-value' : 'searchable-select-placeholder'}>
            {displayValue}
          </span>
          <svg
            className={`searchable-select-chevron ${isOpen ? 'open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {isOpen && (
          <div className="searchable-select-dropdown">
            {showSearch && (
              <div className="searchable-select-search">
                <svg
                  className="searchable-select-search-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M6.33333 11.6667C9.27885 11.6667 11.6667 9.27885 11.6667 6.33333C11.6667 3.38781 9.27885 1 6.33333 1C3.38781 1 1 3.38781 1 6.33333C1 9.27885 3.38781 11.6667 6.33333 11.6667Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M13 13L10.1 10.1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  className="searchable-select-search-input"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            <div className="searchable-select-options">
              {hasAnyResult ? (
                <>
                  {filteredOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`searchable-select-option ${value === option ? 'selected' : ''}`}
                      onClick={() => handleSelect(option)}
                    >
                      <span>{option}</span>
                    </button>
                  ))}
                  {filteredGroups.map((group) => (
                    <div key={group.label} className="searchable-select-group">
                      <div className="searchable-select-group-label">{group.label}</div>
                      {group.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`searchable-select-option ${value === option ? 'selected' : ''}`}
                          onClick={() => handleSelect(option)}
                        >
                          <span>{option}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              ) : (
                <div className="searchable-select-no-results">No results found</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchableSelect;
