// FILE: src/components/GudangView.tsx
import React, { useState, useEffect } from 'react';
import { Package, Search, X, Loader } from 'lucide-react';
import { BaseMjmItem } from '../types';
import { fetchBaseMjm } from '../services/supabaseService';

interface GudangViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const GudangView: React.FC<GudangViewProps> = ({ showToast }) => {
  const [items, setItems] = useState<BaseMjmItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<BaseMjmItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<BaseMjmItem | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredItems(items);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = items.filter(item => 
        item.part_number.toLowerCase().includes(term) ||
        item.name.toLowerCase().includes(term) ||
        item.application.toLowerCase().includes(term) ||
        item.brand.toLowerCase().includes(term) ||
        item.shelf.toLowerCase().includes(term)
      );
      setFilteredItems(filtered);
    }
  }, [searchTerm, items]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchBaseMjm();
      setItems(data);
      setFilteredItems(data);
      if (data.length === 0) {
        showToast('Tidak ada data di tabel base_mjm', 'error');
      }
    } catch (error) {
      console.error('Error loading base_mjm data:', error);
      showToast('Gagal memuat data dari base_mjm', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (item: BaseMjmItem) => {
    setSelectedItem(item);
  };

  const closeModal = () => {
    setSelectedItem(null);
  };

  return (
    <div className="min-h-screen bg-gray-900 pb-24 md:pb-4">
      {/* Header Section */}
      <div className="bg-gradient-to-b from-gray-800 to-gray-800/95 border-b border-gray-700/80 p-4 md:p-6 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-3 rounded-xl shadow-lg">
              <Package size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-100">Gudang Base MJM</h1>
              <p className="text-sm text-gray-400">Data inventori dari tabel base_mjm</p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Cari part number, nama, aplikasi, brand, atau rak..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="mt-4 flex gap-4 text-sm">
            <div className="text-gray-400">
              Total Items: <span className="text-blue-400 font-semibold">{items.length}</span>
            </div>
            <div className="text-gray-400">
              Ditampilkan: <span className="text-blue-400 font-semibold">{filteredItems.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader className="animate-spin text-blue-500 mb-4" size={48} />
            <p className="text-gray-400">Memuat data dari base_mjm...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Package className="text-gray-600 mb-4" size={64} />
            <p className="text-gray-400 text-lg">
              {searchTerm ? 'Tidak ada produk yang cocok dengan pencarian' : 'Tidak ada data tersedia'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map((item, index) => (
              <div
                key={`${item.part_number}-${index}`}
                onClick={() => handleCardClick(item)}
                className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:bg-gray-750 hover:border-blue-500 transition-all cursor-pointer shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-100 text-sm mb-1 line-clamp-2">{item.name}</h3>
                    <p className="text-xs text-blue-400 font-mono">{item.part_number}</p>
                  </div>
                  <div className={`px-2 py-1 rounded-md text-xs font-semibold ${
                    item.quantity > 10 ? 'bg-green-900/30 text-green-400' :
                    item.quantity > 0 ? 'bg-yellow-900/30 text-yellow-400' :
                    'bg-red-900/30 text-red-400'
                  }`}>
                    {item.quantity}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center text-xs">
                    <span className="text-gray-500 w-20">Brand:</span>
                    <span className="text-gray-300 font-medium">{item.brand}</span>
                  </div>
                  <div className="flex items-center text-xs">
                    <span className="text-gray-500 w-20">Aplikasi:</span>
                    <span className="text-gray-300 font-medium line-clamp-1">{item.application}</span>
                  </div>
                  <div className="flex items-center text-xs">
                    <span className="text-gray-500 w-20">Rak:</span>
                    <span className="text-gray-300 font-medium">{item.shelf}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={closeModal}
        >
          <div 
            className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-3 rounded-xl">
                  <Package size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-100">Detail Produk</h2>
                  <p className="text-sm text-gray-400">Informasi lengkap produk</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="space-y-4">
              <div className="bg-gray-900/50 rounded-xl p-4">
                <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Part Number</label>
                <p className="text-lg font-mono font-bold text-blue-400">{selectedItem.part_number}</p>
              </div>

              <div className="bg-gray-900/50 rounded-xl p-4">
                <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Nama Produk</label>
                <p className="text-base font-semibold text-gray-100">{selectedItem.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900/50 rounded-xl p-4">
                  <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Brand</label>
                  <p className="text-base font-medium text-gray-200">{selectedItem.brand}</p>
                </div>

                <div className="bg-gray-900/50 rounded-xl p-4">
                  <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Quantity</label>
                  <p className={`text-2xl font-bold ${
                    selectedItem.quantity > 10 ? 'text-green-400' :
                    selectedItem.quantity > 0 ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {selectedItem.quantity}
                  </p>
                </div>
              </div>

              <div className="bg-gray-900/50 rounded-xl p-4">
                <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Aplikasi</label>
                <p className="text-base font-medium text-gray-200">{selectedItem.application}</p>
              </div>

              <div className="bg-gray-900/50 rounded-xl p-4">
                <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Lokasi Rak</label>
                <p className="text-base font-medium text-gray-200">{selectedItem.shelf}</p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={closeModal}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-lg"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
