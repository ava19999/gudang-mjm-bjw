// FILE: components/common/FloatingQuickAccess.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, X, Package, ArrowRight, Loader2, Sparkles, Edit3, MapPin, Tag, Hash, Layers, Image as ImageIcon } from 'lucide-react';
import { fetchSearchSuggestions, fetchInventoryByPartNumber } from '../../services/supabaseService';
import { useStore } from '../../context/StoreContext';
import { InventoryItem } from '../../types';

interface FloatingQuickAccessProps {
  onAddNew: () => void;
  onViewItem?: (item: InventoryItem) => void;
  isAdmin?: boolean;
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
  const [activeTab, setActiveTab] = useState<'search' | 'add'>('search');
  
  // Preview item state
  const [previewItem, setPreviewItem] = useState<InventoryItem | null>(null);
  
  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
        <div className="absolute bottom-16 right-0 w-80 sm:w-96 bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
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
              <div className="flex border-b border-gray-700">
                <button
                  onClick={() => setActiveTab('search')}
                  className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    activeTab === 'search'
                      ? 'bg-gray-700 text-blue-400 border-b-2 border-blue-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                  }`}
                >
                  <Search size={16} />
                  Cari Barang
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setActiveTab('add')}
                    className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      activeTab === 'add'
                        ? 'bg-gray-700 text-green-400 border-b-2 border-green-400'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                    }`}
                  >
                    <Plus size={16} />
                    Tambah Baru
                  </button>
                )}
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
