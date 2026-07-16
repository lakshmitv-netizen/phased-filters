import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SearchableMultiSelectProps {
  /** All selectable values. */
  options: string[];
  /** Currently-selected values (kept in `options` order by the toggle handler). */
  selected: string[];
  /** Called with the next selection whenever the user toggles an option. */
  onChange: (next: string[]) => void;
  placeholder?: string;
}

/**
 * A searchable, multi-select combobox styled to match the modal's Plan
 * Configuration field. The dropdown is portaled to <body> and position-anchored
 * to the field so it isn't clipped by the modal's transform/overflow.
 */
const SearchableMultiSelect: React.FC<SearchableMultiSelectProps> = ({
  options,
  selected,
  onChange,
  placeholder = 'Select',
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  // Anchor the portaled dropdown to the field, and keep it there on scroll/resize.
  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const measure = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  // Close when clicking outside the field and the portaled dropdown.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('.searchable-multiselect-dropdown')) return;
      setOpen(false);
      setSearchTerm('');
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const toggle = (opt: string) => {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    // Preserve canonical option order so grid rows render predictably.
    onChange(options.filter((o) => next.has(o)));
  };

  const allSelected = options.length > 0 && selected.length === options.length;

  const toggleAll = () => {
    onChange(allSelected ? [] : [...options]);
  };

  const filtered = searchTerm
    ? options.filter((o) => o.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  // Only surface the "All" shortcut when not narrowing the list via search.
  const showAllOption = !searchTerm && options.length > 0;

  const displayValue = open ? searchTerm : selected.join(', ');

  return (
    <div ref={anchorRef} style={{ position: 'relative' }}>
      <div className="slds-combobox">
        <div
          className="slds-combobox__form-element slds-input-has-icon slds-input-has-icon_right"
          style={{ position: 'relative' }}
        >
          <input
            type="text"
            className="slds-input slds-combobox__input"
            value={displayValue}
            placeholder={placeholder}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              setSearchTerm('');
            }}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
              setSearchTerm('');
            }}
            style={{
              height: '40px',
              padding: '0 36px 0 12px',
              border: '1px solid var(--color-border-ui-strong)',
              borderRadius: '0.25rem',
              fontSize: '14px',
              color: selected.length ? 'var(--color-on-surface-strong)' : 'var(--slds-g-color-neutral-base-60)',
              backgroundColor: 'white',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              width: '100%',
              boxSizing: 'border-box',
              textOverflow: 'ellipsis',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M5.5 9.5C7.70914 9.5 9.5 7.70914 9.5 5.5C9.5 3.29086 7.70914 1.5 5.5 1.5C3.29086 1.5 1.5 3.29086 1.5 5.5C1.5 7.70914 3.29086 9.5 5.5 9.5Z"
                stroke="var(--color-interactive-border)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8.5 8.5L10.5 10.5"
                stroke="var(--color-interactive-border)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {open &&
            position &&
            createPortal(
              <div
                className="slds-dropdown slds-dropdown_fluid searchable-multiselect-dropdown"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: `${position.top}px`,
                  left: `${position.left}px`,
                  width: `${position.width}px`,
                  transform: 'none',
                  zIndex: 99999,
                  backgroundColor: 'var(--color-surface-white)',
                  border: '1px solid var(--color-border-ui-strong)',
                  borderRadius: '0.25rem',
                  boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
                  padding: '0.25rem 0',
                  maxHeight: '20rem',
                  overflowY: 'auto',
                }}
              >
                <ul className="slds-listbox slds-listbox_vertical" role="listbox" aria-multiselectable="true">
                  {showAllOption && (
                    <li role="presentation" className="slds-listbox__item">
                      <div
                        role="option"
                        aria-selected={allSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          toggleAll();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.625rem 0.75rem',
                          cursor: 'pointer',
                          backgroundColor: allSelected ? 'var(--color-surface-gray)' : 'var(--color-surface-white)',
                          borderBottom: '1px solid var(--color-border-ui-strong)',
                          transition: 'background-color 0.1s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!allSelected) e.currentTarget.style.backgroundColor = 'var(--slds-g-color-accent-container-1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = allSelected
                            ? 'var(--color-surface-gray)'
                            : 'var(--color-surface-white)';
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={allSelected}
                          readOnly
                          tabIndex={-1}
                          style={{ pointerEvents: 'none', margin: 0 }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-on-surface-strong)' }}>All</span>
                      </div>
                    </li>
                  )}
                  {filtered.length > 0 ? (
                    filtered.map((opt) => {
                      const isSelected = selected.includes(opt);
                      return (
                        <li key={opt} role="presentation" className="slds-listbox__item">
                          <div
                            role="option"
                            aria-selected={isSelected}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              toggle(opt);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.625rem 0.75rem',
                              cursor: 'pointer',
                              backgroundColor: isSelected ? 'var(--color-surface-gray)' : 'var(--color-surface-white)',
                              transition: 'background-color 0.1s ease',
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--slds-g-color-accent-container-1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = isSelected
                                ? 'var(--color-surface-gray)'
                                : 'var(--color-surface-white)';
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              tabIndex={-1}
                              style={{ pointerEvents: 'none', margin: 0 }}
                            />
                            <span style={{ fontSize: '14px', color: 'var(--color-on-surface-strong)' }}>{opt}</span>
                          </div>
                        </li>
                      );
                    })
                  ) : (
                    <li role="presentation" className="slds-listbox__item">
                      <div style={{ padding: '0.75rem', color: 'var(--color-interactive-border)', fontSize: '14px' }}>
                        No results found
                      </div>
                    </li>
                  )}
                </ul>
              </div>,
              document.body,
            )}
        </div>
      </div>
    </div>
  );
};

export default SearchableMultiSelect;
