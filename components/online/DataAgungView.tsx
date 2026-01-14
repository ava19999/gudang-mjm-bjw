// FILE: src/components/online/DataAgungView.tsx
import React, { useState, useMemo } from 'react';
import { Package, Plus, X, Search } from 'lucide-react';
import { InventoryItem, OnlineProduct, ProdukKosong, TableMasuk, BaseWarehouseItem } from '../../types';
import { generateId } from '../../utils';

interface DataAgungViewProps {
  items: InventoryItem[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

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
      item.partNumber.toLowerCase().includes(searchBase.toLowerCase()) ||
      item.name.toLowerCase().includes(searchBase.toLowerCase())
    );
  }, [baseWarehouseItems, searchBase]);

  const filteredOnlineProducts = useMemo(() => {
    return onlineProducts.filter(item =>
      item.partNumber.toLowerCase().includes(searchOnline.toLowerCase()) ||
      item.name.toLowerCase().includes(searchOnline.toLowerCase())
    );
  }, [onlineProducts, searchOnline]);

  const filteredProdukKosong = useMemo(() => {
    return produkKosong.filter(item =>
      item.partNumber.toLowerCase().includes(searchKosong.toLowerCase()) ||
      item.name.toLowerCase().includes(searchKosong.toLowerCase())
    );
  }, [produkKosong, searchKosong]);

  const filteredTableMasuk = useMemo(() => {
    return tableMasuk.filter(item =>
      item.partNumber.toLowerCase().includes(searchMasuk.toLowerCase()) ||
      item.name.toLowerCase().includes(searchMasuk.toLowerCase())
    );
  }, [tableMasuk, searchMasuk]);

  // Get quantity color class
  const getQtyColorClass = (qty: number) => {
    return qty === 0 ? 'text-red-400' : 'text-green-400';
  };

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
  React.useEffect(() => {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Data Agung - Manajemen Online</h1>
          <p className="text-sm text-gray-400 mt-1">Kelola produk online dengan tracking otomatis</p>
        </div>
      </div>

      {/* Grid layout for 4 tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: Base Warehouse */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="bg-gray-700 px-4 py-3 border-b border-gray-700">
            <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
              <Package size={20} className="text-blue-400" />
              Base Warehouse
            </h2>
            <p className="text-xs text-gray-400 mt-1">Barang dengan Qty = 0 (Auto-populated)</p>
            <div className="mt-3 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchBase}
                onChange={(e) => setSearchBase(e.target.value)}
                placeholder="Cari part number atau nama..."
                className="w-full bg-gray-900 text-gray-100 pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            {filteredBaseWarehouse.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Tidak ada barang kosong</p>
            ) : (
              <div className="space-y-2">
                {filteredBaseWarehouse.map(item => (
                  <div key={item.id} className="bg-gray-900 p-3 rounded-lg border border-gray-700">
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
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="bg-gray-700 px-4 py-3 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                  <Package size={20} className="text-green-400" />
                  Produk Online
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
                value={searchOnline}
                onChange={(e) => setSearchOnline(e.target.value)}
                placeholder="Cari part number atau nama..."
                className="w-full bg-gray-900 text-gray-100 pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              />
            </div>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            {filteredOnlineProducts.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Belum ada produk online</p>
            ) : (
              <div className="space-y-2">
                {filteredOnlineProducts.map(product => (
                  <div key={product.id} className="bg-gray-900 p-3 rounded-lg border border-gray-700">
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
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="bg-gray-700 px-4 py-3 border-b border-gray-700">
            <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
              <Package size={20} className="text-yellow-400" />
              Produk Kosong
            </h2>
            <p className="text-xs text-gray-400 mt-1">Produk yang di-Off dari Online</p>
            <div className="mt-3 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchKosong}
                onChange={(e) => setSearchKosong(e.target.value)}
                placeholder="Cari part number atau nama..."
                className="w-full bg-gray-900 text-gray-100 pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
              />
            </div>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            {filteredProdukKosong.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Tidak ada produk kosong</p>
            ) : (
              <div className="space-y-2">
                {filteredProdukKosong.map(product => (
                  <div key={product.id} className="bg-gray-900 p-3 rounded-lg border border-gray-700">
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
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="bg-gray-700 px-4 py-3 border-b border-gray-700">
            <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
              <Package size={20} className="text-purple-400" />
              Table Masuk
            </h2>
            <p className="text-xs text-gray-400 mt-1">Produk dengan Qty &gt; 0 (Auto-moved)</p>
            <div className="mt-3 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchMasuk}
                onChange={(e) => setSearchMasuk(e.target.value)}
                placeholder="Cari part number atau nama..."
                className="w-full bg-gray-900 text-gray-100 pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            {filteredTableMasuk.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Tidak ada produk masuk</p>
            ) : (
              <div className="space-y-2">
                {filteredTableMasuk.map(product => (
                  <div key={product.id} className="bg-gray-900 p-3 rounded-lg border border-gray-700">
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
                  Pilih Produk dari Inventory
                </label>
                <select
                  value={selectedPartNumber}
                  onChange={(e) => setSelectedPartNumber(e.target.value)}
                  className="w-full bg-gray-900 text-gray-100 px-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">-- Pilih Produk --</option>
                  {items.map(item => (
                    <option key={item.id} value={item.partNumber}>
                      {item.partNumber} - {item.name} (Qty: {item.quantity})
                    </option>
                  ))}
                </select>
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
  );
};
