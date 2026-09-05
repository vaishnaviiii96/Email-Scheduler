'use client';

import { useState, useRef, useEffect } from 'react';

interface TopBarProps {
  onSearch: (query: string) => void;
  onRefresh?: () => void;
  isSearching?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// TopBar — Search bar with filter + refresh icons (matches Figma)
// ─────────────────────────────────────────────────────────────────────────────
export function TopBar({ onSearch, onRefresh, isSearching }: TopBarProps) {
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim().length >= 2) {
        onSearch(value.trim());
      } else if (value.trim().length === 0) {
        onSearch(''); // clear search
      }
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="h-[56px] bg-white border-b border-[#E8E8E8] flex items-center px-5 gap-3 flex-shrink-0">
      {/* Search input */}
      <div className="flex-1 relative flex items-center">
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          className="absolute left-3 text-[#9E9E9E] pointer-events-none"
        >
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M10 10L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search"
          className="w-full h-[34px] pl-9 pr-4 bg-[#F5F5F5] rounded-lg text-[13px]
                     text-[#1A1A1A] placeholder-[#9E9E9E] border-none outline-none
                     focus:bg-[#EFEFEF] transition-colors"
        />
        {isSearching && (
          <div className="absolute right-3 w-3 h-3 border border-[#9E9E9E] border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Filter icon */}
      <button
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F5F5F5] transition-colors text-[#9E9E9E] hover:text-[#666666]"
        title="Filter"
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M1.5 3.5H13.5M3.5 7.5H11.5M5.5 11.5H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Refresh icon */}
      <button
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F5F5F5] transition-colors text-[#9E9E9E] hover:text-[#666666]"
        title="Refresh"
        onClick={() => {
          setQuery('');
          onSearch('');
          onRefresh?.();
        }}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M13.5 2.5V6H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12.78 9A5.5 5.5 0 1 1 11 3.5L13.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}
