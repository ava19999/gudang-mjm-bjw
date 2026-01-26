// FILE: src/components/DashboardFilterBar.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Tag, PenTool, AlertTriangle, AlertCircle, LayoutGrid, List, ArrowUpDown, Hash, Package } from 'lucide-react';

interface DashboardFilterBarProps {
  partNumber: string;
  setPartNumber: (val: string) => void;
  partNumberOptions: string[];
  nameSearch: string;
  setNameSearch: (val: string) => void;
  nameOptions: string[];
  brandSearch: string;
  setBrandSearch: (val: string) => void;
  brandOptions: string[];
  appSearch: string;
  setAppSearch: (val: string) => void;
  appOptions: string[];
  filterType: 'all' | 'low' | 'empty';
  setFilterType: (val: 'all' | 'low' | 'empty') => void;
  viewMode: 'grid' | 'list';
  setViewMode: (val: 'grid' | 'list') => void;
  priceSort: 'none' | 'asc' | 'desc';
  setPriceSort: (val: 'none' | 'asc' | 'desc') => void;
  onAddNew: () => void;
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
    if (value.length >= 1) {
      const filtered = options.filter(opt => 
        opt.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 10);
      setFilteredOptions(filtered);
      setShowSuggestions(filtered.length > 0);
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
        className="w-full pl-10 pr-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/50 outline-none text-white placeholder-gray-400"
        autoComplete="off"
      />
      {showSuggestions && (
        <div ref={listRef} className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
          {filteredOptions.map((opt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => { onChange(opt); setShowSuggestions(false); setHighlightedIndex(-1); }}
              className={`w-full px-4 py-2 text-left text-sm first:rounded-t-xl last:rounded-b-xl ${
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

export const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({
  partNumber, setPartNumber, partNumberOptions,
  nameSearch, setNameSearch, nameOptions,
  brandSearch, setBrandSearch, brandOptions,
  appSearch, setAppSearch, appOptions,
  filterType, setFilterType,
  viewMode, setViewMode,
  priceSort, setPriceSort,
  onAddNew
}) => {
  return (
    <div className="sticky top-0 z-20 bg-gray-800 border-b border-gray-700 shadow-md">
      <div className="px-4 pb-3 pt-2">
        {/* Search Row 1: Part Number & Name */}
        <div className="grid grid-cols-2 gap-2 mb-2">
            <AutocompleteInput
              value={partNumber}
              onChange={setPartNumber}
              options={partNumberOptions}
              placeholder="Cari Part Number..."
              icon={<Hash size={16} />}
            />
            <div className="flex gap-2">
              <AutocompleteInput
                value={nameSearch}
                onChange={setNameSearch}
                options={nameOptions}
                placeholder="Cari Nama Barang..."
                icon={<Package size={16} />}
                className="flex-1"
              />
              <button onClick={onAddNew} className="bg-blue-600 text-white p-2.5 rounded-xl shadow-md hover:bg-blue-700 active:scale-95 transition-all flex-shrink-0">
                <Plus size={20} />
              </button>
            </div>
        </div>
        
        {/* Secondary Filters */}
        <div className="grid grid-cols-2 gap-2 mb-2">
            <AutocompleteInput
              value={brandSearch}
              onChange={setBrandSearch}
              options={brandOptions}
              placeholder="Filter Brand..."
              icon={<Tag size={14} />}
            />
            <AutocompleteInput
              value={appSearch}
              onChange={setAppSearch}
              options={appOptions}
              placeholder="Filter Aplikasi..."
              icon={<PenTool size={14} />}
            />
        </div>

        {/* Filter Harga (BARU) */}
        <div className="relative mb-2">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <select 
                value={priceSort} 
                onChange={(e) => setPriceSort(e.target.value as 'none' | 'asc' | 'desc')} 
                className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500/50 outline-none text-white appearance-none cursor-pointer"
            >
                <option value="none">Urutkan Harga...</option>
                <option value="asc">Harga: Termurah ke Termahal</option>
                <option value="desc">Harga: Termahal ke Termurah</option>
            </select>
        </div>

        {/* Filter Buttons & View Mode */}
        <div className="flex justify-between items-center">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
                <button onClick={() => setFilterType('all')} className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all border whitespace-nowrap ${filterType === 'all' ? 'bg-gray-700 text-white border-gray-600' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}>Semua</button>
                <button onClick={() => setFilterType('low')} className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all border whitespace-nowrap flex items-center gap-1 ${filterType === 'low' ? 'bg-yellow-400 text-black border-yellow-500' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}><AlertTriangle size={12}/> Menipis</button>
                <button onClick={() => setFilterType('empty')} className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all border whitespace-nowrap flex items-center gap-1 ${filterType === 'empty' ? 'bg-red-900/30 text-red-400 border-red-900/50' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}><AlertCircle size={12}/> Habis</button>
            </div>
            <div className="flex bg-gray-800 p-1 rounded-lg ml-2 border border-gray-700">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-gray-700 shadow-sm text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}><LayoutGrid size={16}/></button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-gray-700 shadow-sm text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}><List size={16}/></button>
            </div>
        </div>
      </div>
    </div>
  );
};