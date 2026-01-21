// FILE: src/components/online/DataAgungView.tsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Package, Plus, X, Search, Keyboard } from 'lucide-react';
import { InventoryItem, OnlineProduct, ProdukKosong, TableMasuk, BaseWarehouseItem } from '../../types';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { generateId } from '../../utils';

interface DataAgungViewProps {
  items: InventoryItem[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

type TableType = 'base' | 'online' | 'kosong' | 'masuk';

const TABLES: TableType[] = ['base', 'online', 'kosong', 'masuk'];

export const DataAgungView: React.FC<DataAgungViewProps> = ({ items, onRefresh, showToast }) => {
  // State for the four tables
  const [onlineProducts, setOnlineProducts] = useState<OnlineProduct[]>([]);
  const [produkKosong, setProdukKosong] = useState<ProdukKosong[]>([]);
  const [tableMasuk, setTableMasuk] = useState<TableMasuk[]>([]);
  
  // Search states
  const [searchBase, setSearchBase] = useState('');
  const [searchOnline, setSearchOnline] = useState('');
  const [searchKosong, setSearchKosong] = useState('');
  const [searchMasuk, setSearchMasuk] = useState('');
  
  // UI states
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPartNumber, setSelectedPartNumber] = useState('');
  
  // Keyboard navigation states
  const [activeTable, setActiveTable] = useState<TableType>('online');
  const [selectedRow, setSelectedRow] = useState<number>(0);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  
  // Refs for focusing
  const tableRefs = useRef<{[key in TableType]?: HTMLDivElement | null}>({});
  const rowRefs = useRef<{[key: string]: HTMLDivElement | null}>({});

  // Table 1: Base Warehouse - Auto-populated with Qty = 0 items
  const baseWarehouseItems: BaseWarehouseItem[] = useMemo(() => {
    return items
      .filter(item => item.quantity === 0)
      .map(item => ({
        id: item.id,
        partNumber: item.partNumber,
        name: item.name,
        quantity: item.quantity
      }));
  }, [items]);

  // Filtered tables
  const filteredBaseWarehouse = useMemo(() => {
    return baseWarehouseItems.filter(item =>
      (item.partNumber || '').toLowerCase().includes(searchBase.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchBase.toLowerCase())
    );
  }, [baseWarehouseItems, searchBase]);

  const filteredOnlineProducts = useMemo(() => {
    return onlineProducts.filter(item =>
      (item.partNumber || '').toLowerCase().includes(searchOnline.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchOnline.toLowerCase())
    );
  }, [onlineProducts, searchOnline]);

  const filteredProdukKosong = useMemo(() => {
    return produkKosong.filter(item =>
      (item.partNumber || '').toLowerCase().includes(searchKosong.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchKosong.toLowerCase())
    );
  }, [produkKosong, searchKosong]);

  const filteredTableMasuk = useMemo(() => {
    return tableMasuk.filter(item =>
      (item.partNumber || '').toLowerCase().includes(searchMasuk.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchMasuk.toLowerCase())
    );
  }, [tableMasuk, searchMasuk]);

  // Get quantity color class
  const getQtyColorClass = (qty: number) => {
    return qty === 0 ? 'text-red-400' : 'text-green-400';
  };

  // Get current table data based on active table
  const getCurrentTableData = useCallback(() => {
    switch (activeTable) {
      case 'base': return filteredBaseWarehouse;
      case 'online': return filteredOnlineProducts;
      case 'kosong': return filteredProdukKosong;
      case 'masuk': return filteredTableMasuk;
      default: return [];
    }
  }, [activeTable, filteredBaseWarehouse, filteredOnlineProducts, filteredProdukKosong, filteredTableMasuk]);

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if modal is open or typing in input
      if (showAddModal || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') {
        return;
      }

      const currentData = getCurrentTableData();
      const maxRow = currentData.length - 1;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedRow(prev => Math.max(0, prev - 1));
          break;
        
        case 'ArrowDown':
          e.preventDefault();
          setSelectedRow(prev => Math.min(maxRow, prev + 1));
          break;
        
        case 'ArrowLeft':
          e.preventDefault();
          // Move to previous table
          const currentIndex = TABLES.indexOf(activeTable);
          if (currentIndex > 0) {
            setActiveTable(TABLES[currentIndex - 1]);
            setSelectedRow(0);
          }
          break;
        
        case 'ArrowRight':
          e.preventDefault();
          // Move to next table
          const currentIndexRight = TABLES.indexOf(activeTable);
          if (currentIndexRight < TABLES.length - 1) {
            setActiveTable(TABLES[currentIndexRight + 1]);
            setSelectedRow(0);
          }
          break;
        
        case 'Enter':
        case ' ':
          e.preventDefault();
          // Toggle switch on current row
          if (currentData.length > 0 && selectedRow >= 0 && selectedRow < currentData.length) {
            const item = currentData[selectedRow];
            if (activeTable === 'online') {
              handleToggleOnlineProduct(item.id);
            } else if (activeTable === 'kosong') {
              handleToggleProdukKosong(item.id);
            } else if (activeTable === 'masuk') {
              handleToggleTableMasuk(item.id);
            }
          }
          break;
        
        case 'a':
        case 'A':
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+A or Cmd+A - prevent default
            e.preventDefault();
          } else if (activeTable === 'online') {
            e.preventDefault();
            setShowAddModal(true);
          }
          break;
        
        case 'Escape':
          if (showAddModal) {
            setShowAddModal(false);
            setSelectedPartNumber('');
          }
          break;
        
        case '?':
          e.preventDefault();
          setShowKeyboardHelp(prev => !prev);
          break;
        
        case '1':
          e.preventDefault();
          setActiveTable('base');
          setSelectedRow(0);
          break;
        
        case '2':
          e.preventDefault();
          setActiveTable('online');
          setSelectedRow(0);
          break;
        
        case '3':
          e.preventDefault();
          setActiveTable('kosong');
          setSelectedRow(0);
          break;
        
        case '4':
          e.preventDefault();
          setActiveTable('masuk');
          setSelectedRow(0);
          break;
        
        case 'Home':
          e.preventDefault();
          setSelectedRow(0);
          break;
        
        case 'End':
          e.preventDefault();
          setSelectedRow(maxRow);
          break;
        
        case '/':
          e.preventDefault();
          // Focus on search input of active table
          const searchInput = document.querySelector(`[data-search="${activeTable}"]`) as HTMLInputElement;
          if (searchInput) searchInput.focus();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTable, selectedRow, showAddModal, getCurrentTableData]);

  // Scroll selected row into view
  useEffect(() => {
    const currentData = getCurrentTableData();
    if (currentData.length > 0 && selectedRow >= 0 && selectedRow < currentData.length) {
      const item = currentData[selectedRow];
      const rowKey = `${activeTable}-${item.id}`;
      const rowElement = rowRefs.current[rowKey];
      if (rowElement) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedRow, activeTable, getCurrentTableData]);

  // Handle add product to online
  const handleAddOnlineProduct = () => {
    if (!selectedPartNumber) {
      showToast('Pilih produk terlebih dahulu', 'error');
      return;
    }

    const item = items.find(i => i.partNumber === selectedPartNumber);
    if (!item) {
      showToast('Produk tidak ditemukan', 'error');
      return;
    }

    // Check if already exists
    if (onlineProducts.some(p => p.partNumber === item.partNumber)) {
      showToast('Produk sudah ada di list online', 'error');
      return;
    }

    const newProduct: OnlineProduct = {
      id: generateId(),
      partNumber: item.partNumber,
      name: item.name,
      brand: item.brand,
      quantity: item.quantity,
      isActive: true,
      timestamp: Date.now()
    };

    setOnlineProducts(prev => [...prev, newProduct]);
    showToast('Produk ditambahkan ke Online');
    setShowAddModal(false);
    setSelectedPartNumber('');
  };

  // Handle toggle online product
  const handleToggleOnlineProduct = (id: string) => {
    const product = onlineProducts.find(p => p.id === id);
    if (!product) return;

    if (product.isActive) {
      // Move to Produk Kosong
      const kosongItem: ProdukKosong = {
        id: generateId(),
        partNumber: product.partNumber,
        name: product.name,
        brand: product.brand,
        quantity: product.quantity,
        isOnlineActive: false,
        timestamp: Date.now()
      };
      setProdukKosong(prev => [...prev, kosongItem]);
      setOnlineProducts(prev => prev.filter(p => p.id !== id));
      showToast('Produk dipindahkan ke Produk Kosong');
    }
  };

  // Handle toggle produk kosong
  const handleToggleProdukKosong = (id: string) => {
    const product = produkKosong.find(p => p.id === id);
    if (!product) return;

    if (!product.isOnlineActive) {
      // Move back to Online Products
      const onlineItem: OnlineProduct = {
        id: generateId(),
        partNumber: product.partNumber,
        name: product.name,
        brand: product.brand,
        quantity: product.quantity,
        isActive: true,
        timestamp: Date.now()
      };
      setOnlineProducts(prev => [...prev, onlineItem]);
      setProdukKosong(prev => prev.filter(p => p.id !== id));
      showToast('Produk dikembalikan ke Online');
    }
  };

  // Handle toggle table masuk
  const handleToggleTableMasuk = (id: string) => {
    setTableMasuk(prev =>
      prev.map(item =>
        item.id === id ? { ...item, isActive: !item.isActive } : item
      )
    );
  };

  // Auto-sync: Check for quantity changes
  useEffect(() => {
    const itemsToMoveToMasuk: TableMasuk[] = [];
    
    // Update quantities in online products
    setOnlineProducts(prev =>
      prev.map(product => {
        const currentItem = items.find(i => i.partNumber === product.partNumber);
        if (currentItem && currentItem.quantity !== product.quantity) {
          // If qty increased to > 0, add to items to move
          if (product.quantity === 0 && currentItem.quantity > 0) {
            itemsToMoveToMasuk.push({
              id: generateId(),
              partNumber: product.partNumber,
              name: product.name,
              brand: product.brand,
              quantity: currentItem.quantity,
              isActive: true,
              timestamp: Date.now()
            });
          }
          return { ...product, quantity: currentItem.quantity };
        }
        return product;
      })
    );

    // Update quantities in produk kosong
    setProdukKosong(prev =>
      prev.map(product => {
        const currentItem = items.find(i => i.partNumber === product.partNumber);
        if (currentItem && currentItem.quantity !== product.quantity) {
          // If qty increased to > 0, add to items to move
          if (product.quantity === 0 && currentItem.quantity > 0) {
            itemsToMoveToMasuk.push({
              id: generateId(),
              partNumber: product.partNumber,
              name: product.name,
              brand: product.brand,
              quantity: currentItem.quantity,
              isActive: true,
              timestamp: Date.now()
            });
          }
          return { ...product, quantity: currentItem.quantity };
        }
        return product;
      })
    );

    // Move items to Table Masuk if any
    if (itemsToMoveToMasuk.length > 0) {
      setTableMasuk(prev => [...prev, ...itemsToMoveToMasuk]);
    }

    // Update quantities in table masuk
    setTableMasuk(prev =>
      prev.map(product => {
        const currentItem = items.find(i => i.partNumber === product.partNumber);
        return currentItem ? { ...product, quantity: currentItem.quantity } : product;
      })
    );
  }, [items]);

  return (
    <div className="p-4 space-y-6">
      {/* Mobile Warning - Desktop Only Feature */}
      <div className="md:hidden bg-yellow-900/30 border border-yellow-700 rounded-xl p-6 text-center">
        <Package size={48} className="mx-auto text-yellow-400 mb-4" />
        <h2 className="text-xl font-bold text-yellow-300 mb-2">Akses Desktop Diperlukan</h2>
        <p className="text-gray-300 mb-4">
          Fitur Data Agung hanya dapat diakses melalui desktop untuk pengalaman terbaik dan navigasi keyboard yang optimal.
        </p>
        <p className="text-sm text-gray-400">
          Silakan buka aplikasi ini di komputer atau laptop untuk menggunakan fitur ini.
        </p>
      </div>

      {/* Desktop Content */}
      <div className="hidden md:block space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Data Agung - Manajemen Online</h1>
          <p className="text-sm text-gray-400 mt-1">Kelola produk online dengan tracking otomatis</p>
        </div>
        <button
          onClick={() => setShowKeyboardHelp(!showKeyboardHelp)}
          className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-all text-sm"
          title="Keyboard Shortcuts (Press ?)"
        >
          <Keyboard size={18} />
          <span className="hidden md:inline">Shortcuts</span>
        </button>
      </div>

      {/* Keyboard Help Modal */}
      {showKeyboardHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between sticky top-0 bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <Keyboard size={20} className="text-cyan-400" />
                Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowKeyboardHelp(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h4 className="font-bold text-gray-200 mb-3">Navigation</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Move up/down</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">↑ ↓</kbd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Move left/right (between tables)</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">← →</kbd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Jump to first item</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">Home</kbd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Jump to last item</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">End</kbd>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-bold text-gray-200 mb-3">Quick Access</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Go to Base Warehouse</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">1</kbd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Go to Produk Online</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">2</kbd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Go to Produk Kosong</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">3</kbd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Go to Table Masuk</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">4</kbd>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-bold text-gray-200 mb-3">Actions</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Toggle switch on selected item</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">Enter</kbd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Add product (in Produk Online)</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">A</kbd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Focus search</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">/</kbd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Close modal/Cancel</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">Esc</kbd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300">Show this help</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-sm font-mono">?</kbd>
                  </div>
                </div>
              </div>

              <div className="bg-cyan-900/20 border border-cyan-800/50 rounded-lg p-4">
                <p className="text-sm text-cyan-300">
                  <strong>Tip:</strong> Navigate like Google Sheets - use arrow keys to move between items and tables, Enter to toggle switches, and number keys (1-4) to jump between tables quickly!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid layout for 4 tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: Base Warehouse */}
        <div 
          ref={(el) => (tableRefs.current.base = el)}
          className={`bg-gray-800 rounded-xl border-2 transition-all ${
            activeTable === 'base' ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-gray-700'
          } overflow-hidden`}
        >
          <div className="bg-gray-700 px-4 py-3 border-b border-gray-700">
            <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
              <Package size={20} className="text-blue-400" />
              Base Warehouse
              {activeTable === 'base' && <span className="ml-auto text-xs bg-blue-900/50 text-blue-300 px-2 py-1 rounded">Press 1</span>}
            </h2>
            <p className="text-xs text-gray-400 mt-1">Barang dengan Qty = 0 (Auto-populated)</p>
            <div className="mt-3 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                data-search="base"
                value={searchBase}
                onChange={(e) => setSearchBase(e.target.value)}
                placeholder="Cari part number atau nama... (Press /)"
                className="w-full bg-gray-900 text-gray-100 pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>
          <div className="p-4 max-h-[600px] overflow-y-auto">
            {filteredBaseWarehouse.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Tidak ada barang kosong</p>
            ) : (
              <div className="space-y-2">
                {filteredBaseWarehouse.map((item, index) => (
                  <div 
                    key={item.id}
                    ref={(el) => (rowRefs.current[`base-${item.id}`] = el)}
                    className={`bg-gray-900 p-3 rounded-lg border transition-all ${
                      activeTable === 'base' && selectedRow === index
                        ? 'border-blue-500 bg-blue-900/20 shadow-lg shadow-blue-500/10'
                        : 'border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-100 text-sm">{item.partNumber}</p>
                        <p className="text-xs text-gray-400 mt-1">{item.name}</p>
                      </div>
                      <span className={`font-bold ${getQtyColorClass(item.quantity)}`}>
                        {item.quantity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Table 2: Produk Online */}
        <div ref={(el) => (tableRefs.current.online = el)} className={`bg-gray-800 rounded-xl border-2 transition-all ${
            activeTable === 'online' ? 'border-green-500 shadow-lg shadow-green-500/20' : 'border-gray-700'
          } overflow-hidden`}>
          <div className="bg-gray-700 px-4 py-3 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                  <Package size={20} className="text-green-400" />
                  Produk Online
                  {activeTable === 'online' && <span className="ml-2 text-xs bg-green-900/50 text-green-300 px-2 py-1 rounded">Press 2 / A to add</span>}
                </h2>
                <p className="text-xs text-gray-400 mt-1">Input manual dengan switch On/Off</p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition-all"
              >
                <Plus size={16} />
                Tambah
              </button>
            </div>
            <div className="mt-3 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                data-search="online"
                value={searchOnline}
                onChange={(e) => setSearchOnline(e.target.value)}
                placeholder="Cari part number atau nama... (Press /)"
                className="w-full bg-gray-900 text-gray-100 pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              />
            </div>
          </div>
          <div className="p-4 max-h-[600px] overflow-y-auto">
            {filteredOnlineProducts.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Belum ada produk online</p>
            ) : (
              <div className="space-y-2">
                {filteredOnlineProducts.map((product, index) => (
                  <div 
                    key={product.id}
                    ref={(el) => (rowRefs.current[`online-${product.id}`] = el)}
                    className={`bg-gray-900 p-3 rounded-lg border transition-all ${
                      activeTable === 'online' && selectedRow === index
                        ? 'border-green-500 bg-green-900/20 shadow-lg shadow-green-500/10'
                        : 'border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-100 text-sm">{product.partNumber}</p>
                        <p className="text-xs text-gray-400 mt-1">{product.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{product.brand}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${getQtyColorClass(product.quantity)}`}>
                          {product.quantity}
                        </span>
                        <button
                          onClick={() => handleToggleOnlineProduct(product.id)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            product.isActive ? 'bg-green-600' : 'bg-gray-600'
                          }`}
                          title="Press Enter to toggle"
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              product.isActive ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Table 3: Produk Kosong */}
        <div 
          ref={(el) => (tableRefs.current.kosong = el)}
          className={`bg-gray-800 rounded-xl border-2 transition-all ${
            activeTable === 'kosong' ? 'border-yellow-500 shadow-lg shadow-yellow-500/20' : 'border-gray-700'
          } overflow-hidden`}
        >
          <div className="bg-gray-700 px-4 py-3 border-b border-gray-700">
            <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
              <Package size={20} className="text-yellow-400" />
              Produk Kosong
              {activeTable === 'kosong' && <span className="ml-auto text-xs bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded">Press 3</span>}
            </h2>
            <p className="text-xs text-gray-400 mt-1">Produk yang di-Off dari Online</p>
            <div className="mt-3 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                data-search="kosong"
                value={searchKosong}
                onChange={(e) => setSearchKosong(e.target.value)}
                placeholder="Cari part number atau nama... (Press /)"
                className="w-full bg-gray-900 text-gray-100 pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
              />
            </div>
          </div>
          <div className="p-4 max-h-[600px] overflow-y-auto">
            {filteredProdukKosong.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Tidak ada produk kosong</p>
            ) : (
              <div className="space-y-2">
                {filteredProdukKosong.map((product, index) => (
                  <div 
                    key={product.id}
                    ref={(el) => (rowRefs.current[`kosong-${product.id}`] = el)}
                    className={`bg-gray-900 p-3 rounded-lg border transition-all ${
                      activeTable === 'kosong' && selectedRow === index
                        ? 'border-yellow-500 bg-yellow-900/20 shadow-lg shadow-yellow-500/10'
                        : 'border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-100 text-sm">{product.partNumber}</p>
                        <p className="text-xs text-gray-400 mt-1">{product.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{product.brand}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${getQtyColorClass(product.quantity)}`}>
                          {product.quantity}
                        </span>
                        <button
                          onClick={() => handleToggleProdukKosong(product.id)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            product.isOnlineActive ? 'bg-green-600' : 'bg-gray-600'
                          }`}
                          title="Press Enter to toggle"
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              product.isOnlineActive ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Table 4: Table Masuk */}
        <div 
          ref={(el) => (tableRefs.current.masuk = el)}
          className={`bg-gray-800 rounded-xl border-2 transition-all ${
            activeTable === 'masuk' ? 'border-purple-500 shadow-lg shadow-purple-500/20' : 'border-gray-700'
          } overflow-hidden`}
        >
          <div className="bg-gray-700 px-4 py-3 border-b border-gray-700">
            <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
              <Package size={20} className="text-purple-400" />
              Table Masuk
              {activeTable === 'masuk' && <span className="ml-auto text-xs bg-purple-900/50 text-purple-300 px-2 py-1 rounded">Press 4</span>}
            </h2>
            <p className="text-xs text-gray-400 mt-1">Produk dengan Qty &gt; 0 (Auto-moved)</p>
            <div className="mt-3 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                data-search="masuk"
                value={searchMasuk}
                onChange={(e) => setSearchMasuk(e.target.value)}
                placeholder="Cari part number atau nama... (Press /)"
                className="w-full bg-gray-900 text-gray-100 pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
          </div>
          <div className="p-4 max-h-[600px] overflow-y-auto">
            {filteredTableMasuk.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Tidak ada produk masuk</p>
            ) : (
              <div className="space-y-2">
                {filteredTableMasuk.map((product, index) => (
                  <div 
                    key={product.id}
                    ref={(el) => (rowRefs.current[`masuk-${product.id}`] = el)}
                    className={`bg-gray-900 p-3 rounded-lg border transition-all ${
                      activeTable === 'masuk' && selectedRow === index
                        ? 'border-purple-500 bg-purple-900/20 shadow-lg shadow-purple-500/10'
                        : 'border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-100 text-sm">{product.partNumber}</p>
                        <p className="text-xs text-gray-400 mt-1">{product.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{product.brand}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${getQtyColorClass(product.quantity)}`}>
                          {product.quantity}
                        </span>
                        <button
                          onClick={() => handleToggleTableMasuk(product.id)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            product.isActive ? 'bg-green-600' : 'bg-gray-600'
                          }`}
                          title="Press Enter to toggle"
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              product.isActive ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-100">Tambah Produk Online</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedPartNumber('');
                }}
                className="text-gray-400 hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Pilih Produk dari Data Pusat (Base Warehouse)
                </label>
                <Autocomplete
                  options={baseWarehouseItems}
                  getOptionLabel={(option) => option.partNumber ? `${option.partNumber} - ${option.name}` : ''}
                  value={baseWarehouseItems.find(item => item.partNumber === selectedPartNumber) || null}
                  onChange={(_, newValue) => {
                    setSelectedPartNumber(newValue?.partNumber || '');
                  }}
                  filterOptions={(options, { inputValue }) => {
                    const searchLower = inputValue.toLowerCase();
                    return options.filter(option =>
                      (option.partNumber || '').toLowerCase().includes(searchLower) ||
                      (option.name || '').toLowerCase().includes(searchLower)
                    ).slice(0, 50);
                  }}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id} className="px-3 py-2 hover:bg-gray-700 cursor-pointer border-b border-gray-700">
                      <div>
                        <div className="font-semibold text-gray-100">{option.partNumber}</div>
                        <div className="text-xs text-gray-400">{option.name}</div>
                        <div className="text-xs text-gray-500">Qty: <span className={option.quantity === 0 ? 'text-red-400' : 'text-green-400'}>{option.quantity}</span></div>
                      </div>
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Ketik untuk mencari produk..."
                      variant="outlined"
                      size="small"
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: '#111827',
                          color: '#f3f4f6',
                          borderRadius: '0.5rem',
                          '& fieldset': { borderColor: '#374151' },
                          '&:hover fieldset': { borderColor: '#4b5563' },
                          '&.Mui-focused fieldset': { borderColor: '#22c55e' },
                        },
                        '& .MuiInputBase-input': { color: '#f3f4f6' },
                        '& .MuiInputBase-input::placeholder': { color: '#9ca3af', opacity: 1 },
                        '& .MuiSvgIcon-root': { color: '#9ca3af' },
                      }}
                    />
                  )}
                  componentsProps={{
                    paper: {
                      sx: {
                        backgroundColor: '#1f2937',
                        border: '1px solid #374151',
                        borderRadius: '0.5rem',
                        maxHeight: '300px',
                        '& .MuiAutocomplete-listbox': {
                          padding: 0,
                          '& .MuiAutocomplete-option': {
                            padding: 0,
                            '&:hover': { backgroundColor: '#374151' },
                            '&[aria-selected="true"]': { backgroundColor: '#374151' },
                          },
                        },
                      },
                    },
                  }}
                  noOptionsText={<span className="text-gray-400">Tidak ada produk ditemukan</span>}
                  fullWidth
                />
                <p className="text-xs text-gray-500 mt-2">
                  * Hanya menampilkan produk dari Base Warehouse (Qty = 0)
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedPartNumber('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-semibold transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={handleAddOnlineProduct}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all"
                >
                  Tambah
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
