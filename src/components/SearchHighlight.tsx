import React from 'react';

interface SearchHighlightProps {
  text: string;
  searchTerms: string[];
}

/**
 * Safe React component for highlighting search terms in text
 */
export const SearchHighlight: React.FC<SearchHighlightProps> = ({ text, searchTerms }) => {
  if (!text || searchTerms.length === 0) {
    return <>{text}</>;
  }

  try {
    const textLower = text.toLowerCase();
    const matches: Array<{ start: number; end: number }> = [];

    // Find all matches
    searchTerms.forEach(term => {
      if (!term || term.trim() === '') return;
      const termLower = term.toLowerCase().trim();
      if (termLower.length === 0) return;

      let startIndex = 0;
      while (true) {
        const index = textLower.indexOf(termLower, startIndex);
        if (index === -1) break;
        matches.push({
          start: index,
          end: Math.min(index + term.length, text.length)
        });
        startIndex = index + 1;
      }
    });

    // Sort and merge overlapping matches
    matches.sort((a, b) => a.start - b.start);
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

    // Build React elements
    if (mergedMatches.length === 0) {
      return <>{text}</>;
    }

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    for (const match of mergedMatches) {
      if (match.start < lastIndex) continue;
      if (match.start > lastIndex) {
        elements.push(text.substring(lastIndex, match.start));
      }
      elements.push(
        <mark key={`${match.start}-${match.end}`} className="search-highlight">
          {text.substring(match.start, match.end)}
        </mark>
      );
      lastIndex = match.end;
    }
    if (lastIndex < text.length) {
      elements.push(text.substring(lastIndex));
    }

    return <>{elements}</>;
  } catch (error) {
    console.error('[SearchHighlight] Error highlighting text:', error);
    return <>{text}</>;
  }
};



