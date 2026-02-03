// FILE: components/common/FloatingQuickAccess.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, X, Package, ArrowRight, Loader2, Sparkles, Edit3, MapPin, Tag, Hash, Layers, Image as ImageIcon, Calculator, RefreshCw, ArrowRightLeft, ShoppingCart, Send, Minus, PackageX, DollarSign, Store, Clock, TrendingDown, History, TrendingUp, PenTool } from 'lucide-react';
import { fetchSearchSuggestions, fetchInventoryByPartNumber, fetchShopItems, fetchSupplierPricesByPartNumber, SupplierPriceInfo, fetchPriceHistoryByPartNumber, PriceHistoryItem, fetchAllDistinctValues } from '../../services/supabaseService';
import { supabase } from '../../services/supabaseClient';
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

interface OrderCartItem {
  part_number: string;
  nama_barang: string;
  qty: number;
  current_stock: number;
  imageUrl?: string;
  supplier: string;
  price: number;
  tempo: string;
}

export const FloatingQuickAccess: React.FC<FloatingQuickAccessProps> = ({
  onAddNew,
  onViewItem,
  isAdmin = false
}) => {
  const { selectedStore, userName } = useStore();
  const [isExpanded, setIsExpanded] = useState(false);
  
  // 4-field search state
  const [partNumberSearch, setPartNumberSearch] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [appSearch, setAppSearch] = useState('');
  
  // Autocomplete options state
  const [partNumberOptions, setPartNumberOptions] = useState<string[]>([]);
  const [nameOptions, setNameOptions] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [appOptions, setAppOptions] = useState<string[]>([]);
  
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingItem, setLoadingItem] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [activeTab, setActiveTab] = useState<'search' | 'add' | 'order' | 'calc' | 'currency'>('search');
  
  // Preview item state
  const [previewItem, setPreviewItem] = useState<InventoryItem | null>(null);
  
  // Order cart state
  const [orderCart, setOrderCart] = useState<OrderCartItem[]>([]);
  const [showOrderCart, setShowOrderCart] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  
  // Supplier search state for order tab
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderSearchLoading, setOrderSearchLoading] = useState(false);
  const [orderSearchResults, setOrderSearchResults] = useState<InventoryItem[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<SupplierPriceInfo[]>([]);
  const [selectedOrderItem, setSelectedOrderItem] = useState<InventoryItem | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('Supplier Tidak Diketahui');
  const orderSearchInputRef = useRef<HTMLInputElement>(null);
  const orderListRef = useRef<HTMLDivElement>(null);
  
  // Price history state for search tab
  const [priceHistory, setPriceHistory] = useState<PriceHistoryItem[]>([]);
  const [loadingPriceHistory, setLoadingPriceHistory] = useState(false);
  const [priceHistoryFilter, setPriceHistoryFilter] = useState<'all' | 'modal' | 'jual'>('all');
  
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

  // Removed: Close when clicking outside - user requested to keep panel open

  // Load autocomplete options when expanded
  useEffect(() => {
    if (isExpanded && activeTab === 'search') {
      const loadOptions = async () => {
        try {
          const [pnOpts, nameOpts, brandOpts, appOpts] = await Promise.all([
            fetchAllDistinctValues(selectedStore, 'part_number'),
            fetchAllDistinctValues(selectedStore, 'name'),
            fetchAllDistinctValues(selectedStore, 'brand'),
            fetchAllDistinctValues(selectedStore, 'application')
          ]);
          setPartNumberOptions(pnOpts);
          setNameOptions(nameOpts);
          setBrandOptions(brandOpts);
          setAppOptions(appOpts);
        } catch (err) {
          console.error('Error loading autocomplete options:', err);
        }
      };
      // Only load if options are empty
      if (partNumberOptions.length === 0) {
        loadOptions();
      }
    }
  }, [isExpanded, activeTab, selectedStore]);

  // Search with 4-field filters
  useEffect(() => {
    const hasAnySearch = partNumberSearch || nameSearch || brandSearch || appSearch;
    if (!hasAnySearch) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // Fetch items with 4-field filters
        const { data: items } = await fetchShopItems(1, 15, { 
          partNumberSearch, 
          nameSearch, 
          brandSearch, 
          applicationSearch: appSearch 
        }, selectedStore);
        setSearchResults(items);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [partNumberSearch, nameSearch, brandSearch, appSearch, selectedStore]);

  // Order search - fetch items and supplier prices when searching
  useEffect(() => {
    if (!orderSearchQuery || orderSearchQuery.length < 2) {
      setOrderSearchResults([]);
      setSupplierPrices([]);
      setSelectedOrderItem(null);
      return;
    }

    const timer = setTimeout(async () => {
      setOrderSearchLoading(true);
      try {
        // Search for items matching the query
        const { data: items } = await fetchShopItems(1, 20, { searchTerm: orderSearchQuery }, selectedStore);
        if (items && items.length > 0) {
          setOrderSearchResults(items);
        } else {
          setOrderSearchResults([]);
        }
      } catch (err) {
        console.error('Order search error:', err);
      } finally {
        setOrderSearchLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [orderSearchQuery, selectedStore]);

  // Fetch supplier prices when item is selected
  useEffect(() => {
    if (!selectedOrderItem) {
      setSupplierPrices([]);
      return;
    }
    
    const fetchPrices = async () => {
      try {
        const prices = await fetchSupplierPricesByPartNumber(selectedStore, selectedOrderItem.partNumber);
        setSupplierPrices(prices);
        // Auto-select first supplier if available
        if (prices.length > 0) {
          setSelectedSupplier(prices[0].supplier);
        } else {
          setSelectedSupplier('Supplier Tidak Diketahui');
        }
      } catch (err) {
        console.error('Error fetching supplier prices:', err);
      }
    };
    
    fetchPrices();
  }, [selectedOrderItem, selectedStore]);

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

  const handleSelectResult = async (item: InventoryItem) => {
    setPreviewItem(item);
    // Clear all search fields
    setPartNumberSearch('');
    setNameSearch('');
    setBrandSearch('');
    setAppSearch('');
    setSearchResults([]);
    setPriceHistoryFilter('all');
    
    // Fetch price history for the selected item
    setLoadingPriceHistory(true);
    try {
      const history = await fetchPriceHistoryByPartNumber(selectedStore, item.partNumber);
      setPriceHistory(history);
    } catch (err) {
      console.error('Error fetching price history:', err);
      setPriceHistory([]);
    } finally {
      setLoadingPriceHistory(false);
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
      setPriceHistory([]);
      setShowOrderCart(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  };

  // ========== ORDER CART FUNCTIONS ==========
  const addToOrderCart = (item: InventoryItem, supplier: string, price: number = 0, tempo: string = 'CASH') => {
    const existing = orderCart.find(c => c.part_number === item.partNumber && c.supplier === supplier);
    if (existing) {
      setOrderCart(prev => prev.map(c => 
        c.part_number === item.partNumber && c.supplier === supplier
          ? { ...c, qty: c.qty + 1 }
          : c
      ));
    } else {
      setOrderCart(prev => [...prev, {
        part_number: item.partNumber,
        nama_barang: item.name,
        qty: 1,
        current_stock: item.quantity,
        imageUrl: item.imageUrl || item.images?.[0],
        supplier: supplier,
        price: price,
        tempo: tempo
      }]);
    }
  };

  const updateOrderQty = (partNumber: string, supplier: string, delta: number) => {
    setOrderCart(prev => prev.map(c => 
      c.part_number === partNumber && c.supplier === supplier
        ? { ...c, qty: Math.max(1, c.qty + delta) }
        : c
    ));
  };

  const removeFromOrderCart = (partNumber: string, supplier: string) => {
    setOrderCart(prev => prev.filter(c => !(c.part_number === partNumber && c.supplier === supplier)));
  };

  const submitOrderToBarangKosong = async () => {
    if (orderCart.length === 0) return;
    
    setSubmittingOrder(true);
    try {
      // Get existing cart from localStorage
      const storageKey = `barangKosongCart_${selectedStore || 'mjm'}`;
      const existingCartStr = localStorage.getItem(storageKey);
      const existingCart = existingCartStr ? JSON.parse(existingCartStr) : [];
      
      // Convert order cart items to BarangKosong cart format
      const newCartItems = orderCart.map(item => ({
        part_number: item.part_number,
        nama_barang: item.nama_barang,
        supplier: item.supplier,
        qty: item.qty,
        price: item.price, // Use the price from cart item
        tempo: item.tempo, // Use the tempo from cart item
        brand: '',
        application: ''
      }));
      
      // Merge with existing cart (update qty if same part_number & supplier, else add)
      const mergedCart = [...existingCart];
      newCartItems.forEach(newItem => {
        const existingIdx = mergedCart.findIndex(
          (c: any) => c.part_number === newItem.part_number && c.supplier === newItem.supplier
        );
        if (existingIdx >= 0) {
          mergedCart[existingIdx].qty += newItem.qty;
        } else {
          mergedCart.push(newItem);
        }
      });
      
      // Save to localStorage
      localStorage.setItem(storageKey, JSON.stringify(mergedCart));
      
      // Dispatch custom event to notify BarangKosongView
      window.dispatchEvent(new CustomEvent('barangKosongCartUpdated', { 
        detail: { store: selectedStore || 'mjm' } 
      }));

      // Clear cart
      setOrderCart([]);
      setShowOrderCart(false);
      alert('Order berhasil ditambahkan ke keranjang Barang Kosong!');
    } catch (err) {
      console.error('Error submitting order:', err);
      alert('Gagal mengirim order. Silakan coba lagi.');
    } finally {
      setSubmittingOrder(false);
    }
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

  // Calculator keyboard handler
  const handleCalcKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle if calculator tab is active
    if (activeTab !== 'calc' || !isExpanded) return;
    
    // Prevent default for calculator keys
    const calcKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ',', '+', '-', '*', '/', 'Enter', 'Escape', 'Backspace', 'Delete', '%'];
    if (calcKeys.includes(e.key)) {
      e.preventDefault();
    }
    
    switch (e.key) {
      // Digits
      case '0': case '1': case '2': case '3': case '4':
      case '5': case '6': case '7': case '8': case '9':
        calcInputDigit(e.key);
        break;
      
      // Decimal
      case '.':
      case ',':
        calcInputDecimal();
        break;
      
      // Operators
      case '+':
        calcPerformOperation('+');
        break;
      case '-':
        calcPerformOperation('-');
        break;
      case '*':
        calcPerformOperation('×');
        break;
      case '/':
        calcPerformOperation('÷');
        break;
      
      // Equals
      case 'Enter':
      case '=':
        calcEquals();
        break;
      
      // Clear
      case 'Escape':
      case 'Delete':
        calcClear();
        break;
      
      // Backspace - remove last digit
      case 'Backspace':
        if (calcDisplay.length > 1) {
          setCalcDisplay(calcDisplay.slice(0, -1));
        } else {
          setCalcDisplay('0');
        }
        break;
      
      // Percent
      case '%':
        calcPercent();
        break;
    }
  }, [activeTab, isExpanded, calcDisplay, calcInputDigit, calcInputDecimal, calcPerformOperation, calcEquals, calcClear, calcPercent]);

  // Add keyboard listener for calculator
  useEffect(() => {
    if (activeTab === 'calc' && isExpanded) {
      window.addEventListener('keydown', handleCalcKeyDown);
      return () => window.removeEventListener('keydown', handleCalcKeyDown);
    }
  }, [activeTab, isExpanded, handleCalcKeyDown]);

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
              
              {/* Price History Section */}
              <div className="mt-3 bg-gray-750 rounded-xl border border-gray-600 overflow-hidden">
                <div className="px-3 py-2 bg-gray-700 border-b border-gray-600 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History size={14} className="text-blue-400" />
                    <span className="text-xs font-medium text-gray-300">Riwayat Harga</span>
                  </div>
                  {/* Filter buttons */}
                  <div className="flex gap-1">
                    <button 
                      onClick={() => setPriceHistoryFilter('all')}
                      className={`text-[9px] px-1.5 py-0.5 rounded ${priceHistoryFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-400 hover:bg-gray-500'}`}
                    >
                      Semua
                    </button>
                    <button 
                      onClick={() => setPriceHistoryFilter('modal')}
                      className={`text-[9px] px-1.5 py-0.5 rounded ${priceHistoryFilter === 'modal' ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-400 hover:bg-gray-500'}`}
                    >
                      Modal
                    </button>
                    <button 
                      onClick={() => setPriceHistoryFilter('jual')}
                      className={`text-[9px] px-1.5 py-0.5 rounded ${priceHistoryFilter === 'jual' ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-400 hover:bg-gray-500'}`}
                    >
                      Jual
                    </button>
                  </div>
                </div>
                
                {loadingPriceHistory ? (
                  <div className="py-4 flex items-center justify-center">
                    <Loader2 size={16} className="animate-spin text-blue-400" />
                    <span className="text-xs text-gray-400 ml-2">Memuat riwayat...</span>
                  </div>
                ) : priceHistory.filter(p => priceHistoryFilter === 'all' || p.type === priceHistoryFilter).length === 0 ? (
                  <div className="py-4 text-center text-gray-500">
                    <DollarSign size={20} className="mx-auto mb-1 opacity-50" />
                    <p className="text-[10px]">Belum ada riwayat harga</p>
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto">
                    {priceHistory
                      .filter(p => priceHistoryFilter === 'all' || p.type === priceHistoryFilter)
                      .map((item, idx) => (
                        <div 
                          key={`${item.type}-${item.date}-${idx}`}
                          className={`px-3 py-2 flex items-center gap-2 border-b border-gray-700 last:border-b-0 ${
                            item.type === 'modal' ? 'bg-red-900/10' : 'bg-green-900/10'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                            item.type === 'modal' ? 'bg-red-900/50' : 'bg-green-900/50'
                          }`}>
                            {item.type === 'modal' ? (
                              <TrendingDown size={10} className="text-red-400" />
                            ) : (
                              <TrendingUp size={10} className="text-green-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                                item.type === 'modal' ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'
                              }`}>
                                {item.type === 'modal' ? 'MODAL' : 'JUAL'}
                              </span>
                              <span className="text-white text-xs font-bold">
                                {formatPrice(item.harga)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[9px] text-gray-500 mt-0.5">
                              <span>{item.customer}</span>
                              <span>•</span>
                              <span>{item.qty} pcs</span>
                              {item.tempo && <><span>•</span><span>{item.tempo}</span></>}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-gray-500">
                              {new Date(item.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              
              {/* Actions */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setPreviewItem(null)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Cari Lagi
                </button>
                <button
                  onClick={() => {
                    // For preview item, price is 0 since no supplier selected
                    addToOrderCart(previewItem, 'Supplier Tidak Diketahui', 0, 'CASH');
                    setPreviewItem(null);
                  }}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <ShoppingCart size={16} />
                  + Order
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
                  onClick={() => setActiveTab('order')}
                  className={`flex-1 min-w-0 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors relative ${
                    activeTab === 'order'
                      ? 'bg-gray-700 text-purple-400 border-b-2 border-purple-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-750'
                  }`}
                >
                  <PackageX size={14} />
                  <span className="hidden sm:inline">Order</span>
                  {orderCart.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {orderCart.length}
                    </span>
                  )}
                </button>
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
                  <div className="space-y-2">
                    {/* 4 Search Inputs */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Part Number Search */}
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input
                          ref={inputRef}
                          type="text"
                          value={partNumberSearch}
                          onChange={(e) => {
                            setPartNumberSearch(e.target.value);
                            setHighlightedIndex(-1);
                          }}
                          onKeyDown={handleKeyDown}
                          placeholder="Part Number..."
                          className="w-full pl-8 pr-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                          autoComplete="off"
                          list="pn-options"
                        />
                        <datalist id="pn-options">
                          {partNumberOptions.filter(o => o.toLowerCase().includes(partNumberSearch.toLowerCase())).slice(0, 10).map((opt, i) => (
                            <option key={i} value={opt} />
                          ))}
                        </datalist>
                      </div>
                      
                      {/* Name Search */}
                      <div className="relative">
                        <Package className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input
                          type="text"
                          value={nameSearch}
                          onChange={(e) => {
                            setNameSearch(e.target.value);
                            setHighlightedIndex(-1);
                          }}
                          onKeyDown={handleKeyDown}
                          placeholder="Nama Barang..."
                          className="w-full pl-8 pr-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                          autoComplete="off"
                          list="name-options"
                        />
                        <datalist id="name-options">
                          {nameOptions.filter(o => o.toLowerCase().includes(nameSearch.toLowerCase())).slice(0, 10).map((opt, i) => (
                            <option key={i} value={opt} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      {/* Brand Search */}
                      <div className="relative">
                        <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input
                          type="text"
                          value={brandSearch}
                          onChange={(e) => {
                            setBrandSearch(e.target.value);
                            setHighlightedIndex(-1);
                          }}
                          onKeyDown={handleKeyDown}
                          placeholder="Filter Brand..."
                          className="w-full pl-8 pr-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                          autoComplete="off"
                          list="brand-options"
                        />
                        <datalist id="brand-options">
                          {brandOptions.filter(o => o.toLowerCase().includes(brandSearch.toLowerCase())).slice(0, 10).map((opt, i) => (
                            <option key={i} value={opt} />
                          ))}
                        </datalist>
                      </div>
                      
                      {/* Application Search */}
                      <div className="relative">
                        <PenTool className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input
                          type="text"
                          value={appSearch}
                          onChange={(e) => {
                            setAppSearch(e.target.value);
                            setHighlightedIndex(-1);
                          }}
                          onKeyDown={handleKeyDown}
                          placeholder="Filter Aplikasi..."
                          className="w-full pl-8 pr-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-xs text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                          autoComplete="off"
                          list="app-options"
                        />
                        <datalist id="app-options">
                          {appOptions.filter(o => o.toLowerCase().includes(appSearch.toLowerCase())).slice(0, 10).map((opt, i) => (
                            <option key={i} value={opt} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                    
                    {/* Loading indicator */}
                    {loading && (
                      <div className="flex items-center justify-center py-2">
                        <Loader2 className="text-blue-400 animate-spin" size={16} />
                        <span className="text-xs text-gray-400 ml-2">Mencari...</span>
                      </div>
                    )}

                    {/* Search Results with Images */}
                    {searchResults.length > 0 && (
                      <div ref={listRef} className="max-h-52 overflow-y-auto rounded-xl border border-gray-700 bg-gray-750 space-y-1 p-2">
                        {searchResults.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            onClick={() => handleSelectResult(item)}
                            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                              idx === highlightedIndex
                                ? 'bg-blue-600'
                                : 'hover:bg-gray-700'
                            }`}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                          >
                            {/* Image */}
                            <div className="w-10 h-10 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                              {item.imageUrl || item.images?.[0] ? (
                                <img 
                                  src={item.imageUrl || item.images?.[0]} 
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package size={16} className="text-gray-600" />
                                </div>
                              )}
                            </div>
                            
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-medium truncate">{item.name}</p>
                              <p className="text-gray-400 text-[10px] font-mono truncate">{item.partNumber}</p>
                            </div>
                            
                            {/* Stock Badge */}
                            <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.quantity > 5 ? 'bg-green-900/50 text-green-400' :
                              item.quantity > 0 ? 'bg-yellow-900/50 text-yellow-400' :
                              'bg-red-900/50 text-red-400'
                            }`}>
                              {item.quantity}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Empty State */}
                    {(partNumberSearch || nameSearch || brandSearch || appSearch) && !loading && searchResults.length === 0 && (
                      <div className="text-center py-4 text-gray-400">
                        <Package size={24} className="mx-auto mb-2 opacity-50" />
                        <p className="text-xs">Tidak ada hasil ditemukan</p>
                        {isAdmin && (
                          <button
                            onClick={handleAddNew}
                            className="mt-2 text-blue-400 hover:text-blue-300 text-xs font-medium flex items-center gap-1 mx-auto"
                          >
                            <Plus size={12} />
                            Tambah barang baru
                          </button>
                        )}
                      </div>
                    )}

                    {/* Initial State */}
                    {!partNumberSearch && !nameSearch && !brandSearch && !appSearch && (
                      <div className="text-center py-3 text-gray-500">
                        <Sparkles size={20} className="mx-auto mb-1 opacity-50" />
                        <p className="text-[10px]">Ketik untuk mencari barang</p>
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

                {activeTab === 'order' && (
                  <div className="space-y-3">
                    {/* Search Input */}
                    <div>
                      <label className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Search size={12} /> Cari barang untuk order
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                          ref={orderSearchInputRef}
                          type="text"
                          value={orderSearchQuery}
                          onChange={(e) => {
                            setOrderSearchQuery(e.target.value);
                            setSelectedOrderItem(null);
                          }}
                          placeholder="Ketik part number atau nama barang..."
                          className="w-full pl-10 pr-10 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none"
                          autoComplete="off"
                        />
                        {orderSearchLoading && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400 animate-spin" size={16} />
                        )}
                      </div>
                    </div>

                    {/* Scrollable Search Results */}
                    {orderSearchResults.length > 0 && !selectedOrderItem && (
                      <div ref={orderListRef} className="max-h-48 overflow-y-auto rounded-xl border border-gray-700 bg-gray-750 space-y-1 p-2">
                        {orderSearchResults.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            onClick={() => {
                              setSelectedOrderItem(item);
                              setOrderSearchResults([]);
                            }}
                            className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-700"
                          >
                            {/* Image */}
                            <div className="w-10 h-10 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                              {item.imageUrl || item.images?.[0] ? (
                                <img 
                                  src={item.imageUrl || item.images?.[0]} 
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package size={16} className="text-gray-600" />
                                </div>
                              )}
                            </div>
                            
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-medium truncate">{item.name}</p>
                              <p className="text-gray-400 text-[10px] font-mono truncate">{item.partNumber}</p>
                            </div>
                            
                            {/* Stock Badge */}
                            <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.quantity > 5 ? 'bg-green-900/50 text-green-400' :
                              item.quantity > 0 ? 'bg-yellow-900/50 text-yellow-400' :
                              'bg-red-900/50 text-red-400'
                            }`}>
                              {item.quantity}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Selected Item with Supplier Selection */}
                    {selectedOrderItem && (
                      <div className="bg-gray-750 rounded-xl p-3 border border-purple-600/50">
                        {/* Item Info */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 bg-gray-700 rounded-lg overflow-hidden flex-shrink-0">
                            {selectedOrderItem.imageUrl || selectedOrderItem.images?.[0] ? (
                              <img 
                                src={selectedOrderItem.imageUrl || selectedOrderItem.images?.[0]} 
                                alt={selectedOrderItem.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package size={24} className="text-gray-600 m-auto mt-3" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{selectedOrderItem.name}</p>
                            <p className="text-gray-400 text-xs font-mono">{selectedOrderItem.partNumber}</p>
                            <span className={`text-xs px-2 py-0.5 rounded inline-block mt-1 ${
                              selectedOrderItem.quantity === 0 ? 'bg-red-900/50 text-red-400' :
                              selectedOrderItem.quantity < 4 ? 'bg-yellow-900/50 text-yellow-400' :
                              'bg-green-900/50 text-green-400'
                            }`}>
                              Stok: {selectedOrderItem.quantity}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedOrderItem(null);
                              setSupplierPrices([]);
                            }}
                            className="p-1 rounded bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        {/* Supplier Selection */}
                        <div className="mb-3">
                          <label className="text-xs text-gray-400 mb-1 block">Pilih Supplier:</label>
                          <select
                            value={selectedSupplier}
                            onChange={(e) => setSelectedSupplier(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none"
                          >
                            <option value="Supplier Tidak Diketahui">Supplier Tidak Diketahui</option>
                            {supplierPrices.map((sp) => (
                              <option key={sp.supplier} value={sp.supplier}>
                                {sp.supplier} - {formatPrice(sp.harga_satuan)} ({sp.tempo})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Supplier Prices Info */}
                        {supplierPrices.length > 0 && (
                          <div className="bg-gray-800 rounded-lg p-2 mb-3 max-h-24 overflow-y-auto">
                            <p className="text-[10px] text-gray-400 mb-1">Riwayat harga dari importir:</p>
                            <div className="space-y-1">
                              {supplierPrices.slice(0, 5).map((sp, idx) => (
                                <div 
                                  key={sp.supplier} 
                                  className={`flex items-center justify-between text-[10px] ${
                                    selectedSupplier === sp.supplier ? 'text-purple-400 font-bold' : 'text-gray-400'
                                  }`}
                                >
                                  <span className="flex items-center gap-1 truncate">
                                    {idx === 0 && <TrendingDown size={10} className="text-green-400" />}
                                    {sp.supplier}
                                  </span>
                                  <span className={idx === 0 ? 'text-green-400' : ''}>
                                    {formatPrice(sp.harga_satuan)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Add to Cart Button */}
                        <button
                          onClick={() => {
                            // Get price and tempo from selected supplier
                            const supplierInfo = supplierPrices.find(sp => sp.supplier === selectedSupplier);
                            const price = supplierInfo?.harga_satuan || 0;
                            const tempo = supplierInfo?.tempo || 'CASH';
                            addToOrderCart(selectedOrderItem, selectedSupplier, price, tempo);
                            setOrderSearchQuery('');
                            setSelectedOrderItem(null);
                            setSupplierPrices([]);
                          }}
                          className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                        >
                          <Plus size={14} /> Tambah ke Keranjang
                        </button>
                      </div>
                    )}

                    {/* Empty state for search */}
                    {orderSearchQuery && !orderSearchLoading && orderSearchResults.length === 0 && !selectedOrderItem && (
                      <div className="text-center py-4 text-gray-500">
                        <Package size={24} className="mx-auto mb-2 opacity-50" />
                        <p className="text-xs">Tidak ditemukan barang dengan kata kunci tersebut</p>
                      </div>
                    )}

                    {/* Cart Section */}
                    {orderCart.length > 0 && (
                      <div className="border-t border-gray-700 pt-3">
                        <h4 className="text-white text-sm font-medium mb-2 flex items-center gap-2">
                          <ShoppingCart size={14} /> Keranjang ({orderCart.length})
                        </h4>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {orderCart.map((item) => (
                            <div key={`${item.part_number}_${item.supplier}`} className="flex items-center gap-2 bg-gray-800 rounded-lg p-2">
                              <div className="w-8 h-8 bg-gray-700 rounded overflow-hidden flex-shrink-0">
                                {item.imageUrl ? (
                                  <img src={item.imageUrl} alt={item.nama_barang} className="w-full h-full object-cover" />
                                ) : (
                                  <Package size={14} className="text-gray-600 m-auto mt-2" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-[10px] font-medium truncate">{item.nama_barang}</p>
                                <p className="text-gray-500 text-[9px] font-mono truncate">{item.part_number}</p>
                                <div className="flex items-center gap-1">
                                  <span className="text-purple-400 text-[9px] truncate">{item.supplier}</span>
                                  {item.price > 0 && (
                                    <span className="text-green-400 text-[9px]">• {formatPrice(item.price)}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => updateOrderQty(item.part_number, item.supplier, -1)} className="p-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"><Minus size={10} /></button>
                                <span className="px-1.5 text-[10px] font-bold text-purple-400">{item.qty}</span>
                                <button onClick={() => updateOrderQty(item.part_number, item.supplier, 1)} className="p-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"><Plus size={10} /></button>
                              </div>
                              <button onClick={() => removeFromOrderCart(item.part_number, item.supplier)} className="p-0.5 rounded bg-red-700/50 text-red-400 hover:bg-red-700"><X size={10} /></button>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={submitOrderToBarangKosong}
                          disabled={submittingOrder}
                          className="w-full mt-2 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center justify-center gap-2 text-xs transition-colors disabled:opacity-50"
                        >
                          <Send size={14} />
                          {submittingOrder ? 'Mengirim...' : 'Kirim ke Barang Kosong'}
                        </button>
                      </div>
                    )}

                    {/* Initial state when no search and no cart */}
                    {!orderSearchQuery && orderCart.length === 0 && !selectedOrderItem && (
                      <div className="text-center py-6 text-gray-500">
                        <PackageX size={28} className="mx-auto mb-2 opacity-50" />
                        <p className="text-xs">Cari barang untuk menambahkan ke order</p>
                      </div>
                    )}
                  </div>
                )
                }
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
