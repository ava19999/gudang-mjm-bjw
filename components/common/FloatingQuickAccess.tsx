// FILE: components/common/FloatingQuickAccess.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, X, Package, ArrowRight, Loader2, Sparkles, Edit3, MapPin, Tag, Hash, Layers, Image as ImageIcon, Calculator, RefreshCw, ArrowRightLeft } from 'lucide-react';
import { fetchSearchSuggestions, fetchInventoryByPartNumber } from '../../services/supabaseService';
import { useStore } from '../../context/StoreContext';
import { InventoryItem } from '../../types';

interface FloatingQuickAccessProps {
  onAddNew: () => void;
  onViewItem?: (item: InventoryItem) => void;
  isAdmin?: boolean;
}

interface ExchangeRates {
  PHP: number;
  MYR: number;
  SGD: number;
  HKD: number;
  lastUpdated: string;
}

export const FloatingQuickAccess: React.FC<FloatingQuickAccessProps> = ({
  onAddNew,
  onViewItem,
  isAdmin = false
}) => {
  const { selectedStore } = useStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingItem, setLoadingItem] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [activeTab, setActiveTab] = useState<'search' | 'add' | 'calc' | 'currency'>('search');
  
  // Preview item state
  const [previewItem, setPreviewItem] = useState<InventoryItem | null>(null);
  
  // Calculator state
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrevValue, setCalcPrevValue] = useState<number | null>(null);
  const [calcOperator, setCalcOperator] = useState<string | null>(null);
  const [calcWaitingForOperand, setCalcWaitingForOperand] = useState(false);
  
  // Currency converter state
  const [currencyAmount, setCurrencyAmount] = useState('');
  const [currencyFrom, setCurrencyFrom] = useState<'PHP' | 'MYR' | 'SGD' | 'HKD'>('PHP');
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  
  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Calculate panel position based on button position
  const getPanelPosition = () => {
    // position.x is the distance from the RIGHT edge
    // position.y is the distance from the BOTTOM edge
    const isNearTop = position.y > window.innerHeight - 250; // Button is near top when bottom distance is large
    const isNearRight = position.x < window.innerWidth / 2; // Button is on the right side
    
    return {
      isNearTop,
      isNearRight
    };
  };

  // Load saved position
  useEffect(() => {
    const saved = localStorage.getItem('floatingBtnPosition');
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        setPosition(pos);
      } catch (e) {}
    }
  }, []);

  // Save position when changed
  useEffect(() => {
    if (position.x !== 0 || position.y !== 0) {
      localStorage.setItem('floatingBtnPosition', JSON.stringify(position));
    }
  }, [position]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDragging(true);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (buttonRef.current && e.touches[0]) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      });
      setIsDragging(true);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = window.innerWidth - e.clientX - (56 - dragOffset.x);
        const newY = window.innerHeight - e.clientY - (56 - dragOffset.y);
        
        // Keep within bounds
        const boundedX = Math.max(16, Math.min(window.innerWidth - 72, newX));
        const boundedY = Math.max(80, Math.min(window.innerHeight - 72, newY));
        
        setPosition({ x: boundedX, y: boundedY });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches[0]) {
        const newX = window.innerWidth - e.touches[0].clientX - (56 - dragOffset.x);
        const newY = window.innerHeight - e.touches[0].clientY - (56 - dragOffset.y);
        
        const boundedX = Math.max(16, Math.min(window.innerWidth - 72, newX));
        const boundedY = Math.max(80, Math.min(window.innerHeight - 72, newY));
        
        setPosition({ x: boundedX, y: boundedY });
      }
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragOffset]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
        setPreviewItem(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && activeTab === 'search' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isExpanded, activeTab]);

  // Search suggestions
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // Search in multiple fields
        const [partNumbers, names] = await Promise.all([
          fetchSearchSuggestions(selectedStore, 'part_number', searchQuery),
          fetchSearchSuggestions(selectedStore, 'name', searchQuery)
        ]);
        
        // Combine and dedupe
        const combined = [...new Set([...partNumbers, ...names])].slice(0, 10);
        setSearchResults(combined);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedStore]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && searchResults[highlightedIndex]) {
          handleSelectResult(searchResults[highlightedIndex]);
        }
        break;
      case 'Escape':
        if (previewItem) {
          setPreviewItem(null);
        } else {
          setIsExpanded(false);
        }
        break;
    }
  };

  const handleSelectResult = async (result: string) => {
    setLoadingItem(true);
    try {
      const item = await fetchInventoryByPartNumber(selectedStore, result);
      if (item) {
        setPreviewItem(item);
        setSearchQuery('');
        setSearchResults([]);
      }
    } catch (err) {
      console.error('Error fetching item:', err);
    } finally {
      setLoadingItem(false);
    }
  };

  const handleEditItem = () => {
    if (previewItem && onViewItem) {
      onViewItem(previewItem);
      setIsExpanded(false);
      setPreviewItem(null);
    }
  };

  const handleAddNew = () => {
    onAddNew();
    setIsExpanded(false);
  };

  const handleButtonClick = () => {
    if (!isDragging) {
      setIsExpanded(!isExpanded);
      setPreviewItem(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  };

  // ========== CALCULATOR FUNCTIONS ==========
  const calcClear = () => {
    setCalcDisplay('0');
    setCalcPrevValue(null);
    setCalcOperator(null);
    setCalcWaitingForOperand(false);
  };

  const calcInputDigit = (digit: string) => {
    if (calcWaitingForOperand) {
      setCalcDisplay(digit);
      setCalcWaitingForOperand(false);
    } else {
      setCalcDisplay(calcDisplay === '0' ? digit : calcDisplay + digit);
    }
  };

  const calcInputDecimal = () => {
    if (calcWaitingForOperand) {
      setCalcDisplay('0.');
      setCalcWaitingForOperand(false);
      return;
    }
    if (!calcDisplay.includes('.')) {
      setCalcDisplay(calcDisplay + '.');
    }
  };

  const calcPerformOperation = (nextOperator: string) => {
    const inputValue = parseFloat(calcDisplay);

    if (calcPrevValue === null) {
      setCalcPrevValue(inputValue);
    } else if (calcOperator) {
      const result = calculate(calcPrevValue, inputValue, calcOperator);
      setCalcDisplay(String(result));
      setCalcPrevValue(result);
    }

    setCalcWaitingForOperand(true);
    setCalcOperator(nextOperator);
  };

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const calcEquals = () => {
    if (!calcOperator || calcPrevValue === null) return;
    
    const inputValue = parseFloat(calcDisplay);
    const result = calculate(calcPrevValue, inputValue, calcOperator);
    
    setCalcDisplay(String(result));
    setCalcPrevValue(null);
    setCalcOperator(null);
    setCalcWaitingForOperand(true);
  };

  const calcPercent = () => {
    const value = parseFloat(calcDisplay);
    setCalcDisplay(String(value / 100));
  };

  const calcToggleSign = () => {
    const value = parseFloat(calcDisplay);
    setCalcDisplay(String(-value));
  };

  // ========== CURRENCY CONVERTER FUNCTIONS ==========
  const fetchExchangeRates = useCallback(async () => {
    setLoadingRates(true);
    try {
      // Using exchangerate-api.com free tier (no API key needed for base USD)
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/IDR');
      const data = await response.json();
      
      // Calculate rates TO IDR (inverse of rates FROM IDR)
      setExchangeRates({
        PHP: 1 / data.rates.PHP,
        MYR: 1 / data.rates.MYR,
        SGD: 1 / data.rates.SGD,
        HKD: 1 / data.rates.HKD,
        lastUpdated: new Date().toLocaleString('id-ID')
      });
      
      // Save to localStorage
      localStorage.setItem('exchangeRates', JSON.stringify({
        PHP: 1 / data.rates.PHP,
        MYR: 1 / data.rates.MYR,
        SGD: 1 / data.rates.SGD,
        HKD: 1 / data.rates.HKD,
        lastUpdated: new Date().toLocaleString('id-ID')
      }));
    } catch (err) {
      console.error('Error fetching exchange rates:', err);
      // Fallback rates (approximate)
      const fallback: ExchangeRates = {
        PHP: 285,    // 1 PHP ≈ 285 IDR
        MYR: 3600,   // 1 MYR ≈ 3600 IDR
        SGD: 12000,  // 1 SGD ≈ 12000 IDR
        HKD: 2050,   // 1 HKD ≈ 2050 IDR
        lastUpdated: 'Offline (Fallback)'
      };
      setExchangeRates(fallback);
    } finally {
      setLoadingRates(false);
    }
  }, []);

  // Load exchange rates on mount or when currency tab is selected
  useEffect(() => {
    if (activeTab === 'currency' && !exchangeRates) {
      // Try loading from localStorage first
      const saved = localStorage.getItem('exchangeRates');
      if (saved) {
        try {
          setExchangeRates(JSON.parse(saved));
        } catch (e) {
          fetchExchangeRates();
        }
      } else {
        fetchExchangeRates();
      }
    }
  }, [activeTab, exchangeRates, fetchExchangeRates]);

  const convertToIDR = (amount: number, from: 'PHP' | 'MYR' | 'SGD' | 'HKD'): number => {
    if (!exchangeRates) return 0;
    return amount * exchangeRates[from];
  };

  const currencyLabels: Record<string, { code: string; flag: string; name: string }> = {
    PHP: { code: 'PHP', flag: '🇵🇭', name: 'Philippine Peso' },
    MYR: { code: 'MYR', flag: '🇲🇾', name: 'Malaysian Ringgit' },
    SGD: { code: 'SGD', flag: '🇸🇬', name: 'Singapore Dollar' },
    HKD: { code: 'HKD', flag: '🇭🇰', name: 'Hong Kong Dollar' }
  };

  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', { 
      style: 'currency', 
      currency: 'IDR', 
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const panelPos = getPanelPosition();

  return (
    <div 
      ref={wrapperRef} 
      className="fixed z-[9999]"
      style={{ 
        right: position.x || 16,
        bottom: position.y || 80
      }}
    >
      {/* Expanded Panel */}
      {isExpanded && (
        <div 
          className={`absolute w-80 sm:w-96 bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden animate-in duration-200 ${
            panelPos.isNearTop 
              ? 'top-16 slide-in-from-top-4' 
              : 'bottom-16 slide-in-from-bottom-4'
          } ${
            panelPos.isNearRight 
              ? 'right-0' 
              : 'left-0'
          }`}
        >
          {/* Preview Item View */}
          {previewItem ? (
            <div className="p-4">
              {/* Header with close */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">Detail Barang</h3>
                <button 
                  onClick={() => setPreviewItem(null)}
                  className="text-gray-400 hover:text-white p-1"
                >
                  <X size={18} />
                </button>
              </div>
              
              {/* Item Preview Card */}
              <div className="bg-gray-750 rounded-xl p-3 space-y-3">
                {/* Image */}
                <div className="w-full h-32 bg-gray-700 rounded-lg overflow-hidden flex items-center justify-center">
                  {previewItem.imageUrl || (previewItem.images && previewItem.images[0]) ? (
                    <img 
                      src={previewItem.imageUrl || previewItem.images?.[0]} 
                      alt={previewItem.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <ImageIcon size={40} className="text-gray-500" />
                  )}
                </div>
                
                {/* Info Grid */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Hash size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase">Part Number</p>
                      <p className="text-white text-sm font-mono">{previewItem.partNumber}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <Package size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase">Nama Barang</p>
                      <p className="text-white text-sm">{previewItem.name}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-start gap-2">
                      <Tag size={14} className="text-purple-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Brand</p>
                        <p className="text-white text-xs">{previewItem.brand || '-'}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="text-orange-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Rak</p>
                        <p className="text-white text-xs">{previewItem.shelf || '-'}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <Layers size={14} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase">Stok</p>
                      <p className={`text-lg font-bold ${previewItem.quantity > 5 ? 'text-green-400' : previewItem.quantity > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {previewItem.quantity} pcs
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setPreviewItem(null)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Cari Lagi
                </button>
                {isAdmin && (
                  <button
                    onClick={handleEditItem}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Edit3 size={16} />
                    Edit
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Header Tabs */}
              <div className="flex border-b border-gray-700 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('search')}
                  className={`flex-1 min-w-0 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                    activeTab === 'search'
                      ? 'bg-gray-700 text-blue-400 border-b-2 border-blue-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                  }`}
                >
                  <Search size={14} />
                  <span className="hidden sm:inline">Cari</span>
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setActiveTab('add')}
                    className={`flex-1 min-w-0 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                      activeTab === 'add'
                        ? 'bg-gray-700 text-green-400 border-b-2 border-green-400'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                    }`}
                  >
                    <Plus size={14} />
                    <span className="hidden sm:inline">Tambah</span>
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('calc')}
                  className={`flex-1 min-w-0 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                    activeTab === 'calc'
                      ? 'bg-gray-700 text-orange-400 border-b-2 border-orange-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                  }`}
                >
                  <Calculator size={14} />
                  <span className="hidden sm:inline">Kalkulat</span>
                </button>
                <button
                  onClick={() => setActiveTab('currency')}
                  className={`flex-1 min-w-0 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                    activeTab === 'currency'
                      ? 'bg-gray-700 text-cyan-400 border-b-2 border-cyan-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                  }`}
                >
                  <ArrowRightLeft size={14} />
                  <span className="hidden sm:inline">Kurs</span>
                </button>
              </div>

              {/* Content */}
              <div className="p-4">
                {activeTab === 'search' && (
                  <div>
                    {/* Search Input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        ref={inputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setHighlightedIndex(-1);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Ketik part number atau nama..."
                        className="w-full pl-10 pr-10 py-3 bg-gray-700 border border-gray-600 rounded-xl text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                        autoComplete="off"
                      />
                      {(loading || loadingItem) && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 animate-spin" size={18} />
                      )}
                    </div>

                    {/* Search Results */}
                    {searchResults.length > 0 && (
                      <div ref={listRef} className="mt-3 max-h-60 overflow-y-auto rounded-xl border border-gray-700 bg-gray-750">
                        {searchResults.map((result, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSelectResult(result)}
                            disabled={loadingItem}
                            className={`w-full px-4 py-3 text-left text-sm flex items-center justify-between gap-2 transition-colors ${
                              idx === highlightedIndex
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-200 hover:bg-gray-700'
                            } ${idx === 0 ? 'rounded-t-xl' : ''} ${idx === searchResults.length - 1 ? 'rounded-b-xl' : ''}`}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                          >
                            <span className="flex items-center gap-2">
                              <Package size={14} className="text-gray-400" />
                              <span className="truncate">{result}</span>
                            </span>
                            <ArrowRight size={14} className="text-gray-500 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Empty State */}
                    {searchQuery && !loading && searchResults.length === 0 && (
                      <div className="mt-4 text-center py-6 text-gray-400">
                        <Package size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Tidak ada hasil ditemukan</p>
                        {isAdmin && (
                          <button
                            onClick={handleAddNew}
                            className="mt-3 text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1 mx-auto"
                          >
                            <Plus size={14} />
                            Tambah barang baru
                          </button>
                        )}
                      </div>
                    )}

                    {/* Initial State */}
                    {!searchQuery && (
                      <div className="mt-4 text-center py-4 text-gray-500">
                        <Sparkles size={24} className="mx-auto mb-2 opacity-50" />
                        <p className="text-xs">Ketik untuk mencari barang</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'add' && isAdmin && (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-green-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Plus size={32} className="text-green-400" />
                    </div>
                    <h3 className="text-white font-medium mb-2">Tambah Barang Baru</h3>
                    <p className="text-gray-400 text-sm mb-4">
                      Buka form untuk menambahkan item baru ke inventaris
                    </p>
                    <button
                      onClick={handleAddNew}
                      className="bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2 mx-auto"
                    >
                      <Plus size={18} />
                      Buka Form Tambah
                    </button>
                  </div>
                )}

                {/* Calculator Tab */}
                {activeTab === 'calc' && (
                  <div>
                    {/* Calculator Display */}
                    <div className="bg-gray-900 rounded-xl p-4 mb-3">
                      <div className="text-right">
                        <div className="text-gray-500 text-xs h-4">
                          {calcPrevValue !== null && calcOperator && `${calcPrevValue} ${calcOperator}`}
                        </div>
                        <div className="text-white text-3xl font-mono truncate">
                          {parseFloat(calcDisplay).toLocaleString('id-ID', { maximumFractionDigits: 10 })}
                        </div>
                      </div>
                    </div>

                    {/* Calculator Buttons */}
                    <div className="grid grid-cols-4 gap-2">
                      {/* Row 1 */}
                      <button onClick={calcClear} className="bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        C
                      </button>
                      <button onClick={calcToggleSign} className="bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        ±
                      </button>
                      <button onClick={calcPercent} className="bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        %
                      </button>
                      <button onClick={() => calcPerformOperation('÷')} className={`py-3 rounded-xl text-sm font-medium transition-colors ${calcOperator === '÷' ? 'bg-orange-400 text-white' : 'bg-orange-500 hover:bg-orange-400 text-white'}`}>
                        ÷
                      </button>

                      {/* Row 2 */}
                      <button onClick={() => calcInputDigit('7')} className="bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        7
                      </button>
                      <button onClick={() => calcInputDigit('8')} className="bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        8
                      </button>
                      <button onClick={() => calcInputDigit('9')} className="bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        9
                      </button>
                      <button onClick={() => calcPerformOperation('×')} className={`py-3 rounded-xl text-sm font-medium transition-colors ${calcOperator === '×' ? 'bg-orange-400 text-white' : 'bg-orange-500 hover:bg-orange-400 text-white'}`}>
                        ×
                      </button>

                      {/* Row 3 */}
                      <button onClick={() => calcInputDigit('4')} className="bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        4
                      </button>
                      <button onClick={() => calcInputDigit('5')} className="bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        5
                      </button>
                      <button onClick={() => calcInputDigit('6')} className="bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        6
                      </button>
                      <button onClick={() => calcPerformOperation('-')} className={`py-3 rounded-xl text-sm font-medium transition-colors ${calcOperator === '-' ? 'bg-orange-400 text-white' : 'bg-orange-500 hover:bg-orange-400 text-white'}`}>
                        −
                      </button>

                      {/* Row 4 */}
                      <button onClick={() => calcInputDigit('1')} className="bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        1
                      </button>
                      <button onClick={() => calcInputDigit('2')} className="bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        2
                      </button>
                      <button onClick={() => calcInputDigit('3')} className="bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        3
                      </button>
                      <button onClick={() => calcPerformOperation('+')} className={`py-3 rounded-xl text-sm font-medium transition-colors ${calcOperator === '+' ? 'bg-orange-400 text-white' : 'bg-orange-500 hover:bg-orange-400 text-white'}`}>
                        +
                      </button>

                      {/* Row 5 */}
                      <button onClick={() => calcInputDigit('0')} className="bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl text-sm font-medium transition-colors col-span-2">
                        0
                      </button>
                      <button onClick={calcInputDecimal} className="bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl text-sm font-medium transition-colors">
                        ,
                      </button>
                      <button onClick={calcEquals} className="bg-blue-500 hover:bg-blue-400 text-white py-3 rounded-xl text-sm font-bold transition-colors">
                        =
                      </button>
                    </div>
                  </div>
                )}

                {/* Currency Converter Tab */}
                {activeTab === 'currency' && (
                  <div>
                    {/* Header with refresh */}
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-white text-sm font-medium">Konversi ke IDR</h4>
                      <button
                        onClick={fetchExchangeRates}
                        disabled={loadingRates}
                        className="text-gray-400 hover:text-white p-1 transition-colors disabled:opacity-50"
                        title="Refresh Kurs"
                      >
                        <RefreshCw size={16} className={loadingRates ? 'animate-spin' : ''} />
                      </button>
                    </div>

                    {/* Amount Input */}
                    <div className="relative mb-3">
                      <input
                        type="number"
                        value={currencyAmount}
                        onChange={(e) => setCurrencyAmount(e.target.value)}
                        placeholder="Masukkan jumlah..."
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none text-lg font-mono"
                      />
                    </div>

                    {/* Currency Selector */}
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {(['PHP', 'MYR', 'SGD', 'HKD'] as const).map((curr) => (
                        <button
                          key={curr}
                          onClick={() => setCurrencyFrom(curr)}
                          className={`py-2 rounded-xl text-xs font-medium transition-colors flex flex-col items-center gap-0.5 ${
                            currencyFrom === curr
                              ? 'bg-cyan-500 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          <span className="text-lg">{currencyLabels[curr].flag}</span>
                          <span>{curr}</span>
                        </button>
                      ))}
                    </div>

                    {/* Result */}
                    {currencyAmount && exchangeRates && (
                      <div className="bg-gray-900 rounded-xl p-4">
                        <div className="text-center">
                          <div className="text-gray-400 text-xs mb-1">
                            {currencyLabels[currencyFrom].flag} {parseFloat(currencyAmount || '0').toLocaleString()} {currencyFrom}
                          </div>
                          <div className="text-2xl font-bold text-green-400">
                            {formatIDR(convertToIDR(parseFloat(currencyAmount || '0'), currencyFrom))}
                          </div>
                          <div className="text-gray-500 text-[10px] mt-2">
                            1 {currencyFrom} = {formatIDR(exchangeRates[currencyFrom])}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* All Rates */}
                    {exchangeRates && (
                      <div className="mt-3 bg-gray-750 rounded-xl p-3">
                        <div className="text-gray-400 text-[10px] mb-2 flex items-center justify-between">
                          <span>Kurs Saat Ini</span>
                          <span className="text-gray-500">{exchangeRates.lastUpdated}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {(['PHP', 'MYR', 'SGD', 'HKD'] as const).map((curr) => (
                            <div key={curr} className="flex items-center gap-2 text-xs">
                              <span>{currencyLabels[curr].flag}</span>
                              <span className="text-gray-400">{curr}</span>
                              <span className="text-white font-mono ml-auto">
                                {exchangeRates[curr].toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Loading state */}
                    {loadingRates && !exchangeRates && (
                      <div className="text-center py-8">
                        <Loader2 className="animate-spin text-cyan-400 mx-auto mb-2" size={24} />
                        <p className="text-gray-400 text-xs">Memuat kurs terbaru...</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating Button - Draggable */}
      <button
        ref={buttonRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={handleButtonClick}
        className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 select-none ${
          isDragging 
            ? 'scale-110 opacity-80 cursor-grabbing'
            : isExpanded
              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 rotate-45 cursor-pointer'
              : 'bg-gradient-to-br from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 hover:scale-110 cursor-grab'
        }`}
        style={{ touchAction: 'none' }}
      >
        {isExpanded ? (
          <X size={24} />
        ) : (
          <Sparkles size={24} />
        )}
      </button>
      
      {/* Drag hint */}
      {!isExpanded && !isDragging && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
          Seret untuk pindahkan
        </div>
      )}
    </div>
  );
};
