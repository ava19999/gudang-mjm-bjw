// FILE: src/components/shop/ShopFilterBar.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Search, LayoutGrid, List, Package, Tag, PenTool } from 'lucide-react';

interface ShopFilterBarProps {
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    partNumberSearch: string;
    setPartNumberSearch: (val: string) => void;
    partNumberOptions: string[];
    nameSearch: string;
    setNameSearch: (val: string) => void;
    nameOptions: string[];
    brandSearch: string;
    setBrandSearch: (val: string) => void;
    brandOptions: string[];
    applicationSearch: string;
    setApplicationSearch: (val: string) => void;
    applicationOptions: string[];
    isAdmin: boolean;
    viewMode: 'grid' | 'list';
    setViewMode: (mode: 'grid' | 'list') => void;
}

// Autocomplete Input Component
const AutocompleteInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
  icon: React.ReactNode;
  className?: string;
}> = ({ value, onChange, options, placeholder, icon, className = '' }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.length >= 1 && options.length > 0) {
      const filtered = options.filter(opt => 
        opt.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 15);
      setFilteredOptions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else if (options.length > 0 && value.length >= 1) {
      setFilteredOptions(options.slice(0, 15));
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }
  }, [value, options]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions && filteredOptions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setShowSuggestions(true);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => prev < filteredOptions.length - 1 ? prev + 1 : prev);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          onChange(filteredOptions[highlightedIndex]);
          setShowSuggestions(false);
          setHighlightedIndex(-1);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        {icon}
      </div>
      <input 
        type="text" 
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => value.length >= 1 && filteredOptions.length > 0 && setShowSuggestions(true)}
        onKeyDown={handleKeyDown}
        className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/50 outline-none text-white placeholder-gray-500"
        autoComplete="off"
      />
      {showSuggestions && (
        <div ref={listRef} className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
          {filteredOptions.map((opt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => { onChange(opt); setShowSuggestions(false); setHighlightedIndex(-1); }}
              className={`w-full px-4 py-2 text-left text-xs first:rounded-t-xl last:rounded-b-xl ${
                idx === highlightedIndex
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-200 hover:bg-gray-700'
              }`}
              onMouseEnter={() => setHighlightedIndex(idx)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const ShopFilterBar: React.FC<ShopFilterBarProps> = ({
    searchTerm, setSearchTerm,
    partNumberSearch, setPartNumberSearch, partNumberOptions,
    nameSearch, setNameSearch, nameOptions,
    brandSearch, setBrandSearch, brandOptions,
    applicationSearch, setApplicationSearch, applicationOptions,
    isAdmin, viewMode, setViewMode
}) => {
    return (
        <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur-sm pt-2 pb-2 -mx-2 px-2 md:mx-0 md:px-0 space-y-3 border-b border-gray-800">
            {/* Main Search Box - Search All Fields */}
            <div className="flex gap-2">
                <div className="relative w-full group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Search size={18} className="text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Cari semua..." 
                        className="pl-10 pr-4 py-3 w-full bg-gray-800 border border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none shadow-sm transition-all text-white placeholder-gray-500" 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="bg-gray-800 rounded-xl p-1 flex shadow-sm border border-gray-700">
                    <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}><LayoutGrid size={18}/></button>
                    <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-gray-700 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}><List size={18}/></button>
                </div>
            </div>

            {/* Individual Search Boxes with Autocomplete */}
            <div className="grid grid-cols-2 gap-2">
                <AutocompleteInput
                    value={partNumberSearch}
                    onChange={setPartNumberSearch}
                    options={partNumberOptions}
                    placeholder="Part Number..."
                    icon={<Package size={14} />}
                />
                <AutocompleteInput
                    value={nameSearch}
                    onChange={setNameSearch}
                    options={nameOptions}
                    placeholder="Nama Barang..."
                    icon={<Search size={14} />}
                />
                <AutocompleteInput
                    value={brandSearch}
                    onChange={setBrandSearch}
                    options={brandOptions}
                    placeholder="Brand..."
                    icon={<Tag size={14} />}
                />
                <AutocompleteInput
                    value={applicationSearch}
                    onChange={setApplicationSearch}
                    options={applicationOptions}
                    placeholder="Aplikasi..."
                    icon={<PenTool size={14} />}
                />
            </div>
        </div>
    );
};