// FILE: src/components/ItemHistoryModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryItem, StockHistory } from '../types';
import { fetchItemHistory, getItemByPartNumber } from '../services/supabaseService';
import { parseHistoryReason, formatCompactNumber } from '../utils/dashboardHelpers';
import { HistoryTable } from './HistoryTable';
import { useStore } from '../context/StoreContext';
import { Loader2, X, ChevronLeft, ChevronRight, History, ArrowLeftRight, Package } from 'lucide-react';

interface ItemHistoryModalProps {
  item: InventoryItem;
  onClose: () => void;
}

export const ItemHistoryModal: React.FC<ItemHistoryModalProps> = ({ item, onClose }) => {
  const { selectedStore } = useStore();
  const [data, setData] = useState<StockHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  
  // State untuk perbandingan stock
  const [compareData, setCompareData] = useState<InventoryItem | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    if (item.partNumber && selectedStore) {
        setLoading(true);
        fetchItemHistory(item.partNumber, selectedStore).then((res) => {
            setData(res);
            setLoading(false);
        }).catch(() => setLoading(false));
    }
  }, [item, selectedStore]);

  // Client-side filtering & pagination (karena API fetchItemHistory mengambil semua log item tersebut)
  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const lowerSearch = search.toLowerCase();
    return data.filter(h => {
        const { resi, subInfo, customer, keterangan } = parseHistoryReason(h);
        return (keterangan.toLowerCase().includes(lowerSearch) || resi.toLowerCase().includes(lowerSearch) || subInfo.toLowerCase().includes(lowerSearch) || customer.toLowerCase().includes(lowerSearch) || h.reason.toLowerCase().includes(lowerSearch));
    });
  }, [data, search]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * 50;
    return filteredData.slice(start, start + 50);
  }, [filteredData, page]);

  const totalPages = Math.ceil(filteredData.length / 50) || 1;

  useEffect(() => setPage(1), [search]);

  // Fungsi untuk fetch data perbandingan dari toko lain
  const handleCompareStock = async () => {
    if (!selectedStore) return;
    
    setCompareLoading(true);
    setShowCompare(true);
    try {
      // Tentukan toko lawan
      const otherStore = selectedStore === 'bjw' ? 'mjm' : 'bjw';
      const otherStoreItem = await getItemByPartNumber(item.partNumber, otherStore);
      setCompareData(otherStoreItem);
    } catch (err) {
      console.error('Gagal fetch data perbandingan:', err);
      setCompareData(null);
    } finally {
      setCompareLoading(false);
    }
  };

  // Tentukan toko lawan untuk perbandingan
  const otherStoreName = selectedStore === 'bjw' ? 'MJM' : 'BJW';
  const currentStoreName = selectedStore === 'bjw' ? 'BJW' : 'MJM';

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-gray-800 rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col border border-gray-700 shadow-2xl m-4 overflow-hidden">
                <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-gray-100 flex items-center gap-2"><History size={16} className="text-blue-400"/> Riwayat Item</h3>
                      <p className="text-xs text-gray-400 truncate max-w-[300px]">{item.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Tombol Bandingkan Stock - Tampil di BJW dan MJM */}
                      {selectedStore && (
                        <button 
                          onClick={handleCompareStock}
                          disabled={compareLoading}
                          className="px-3 py-1.5 bg-purple-900/30 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-900/50 transition-colors border border-purple-900/50 flex items-center gap-1.5"
                        >
                          {compareLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
                          Bandingkan dengan {otherStoreName}
                        </button>
                      )}
                      <button onClick={onClose} className="p-1 bg-gray-700 hover:bg-gray-600 rounded-full"><X size={18}/></button>
                    </div>
                </div>

                {/* Panel Perbandingan Stock */}
                {showCompare && selectedStore && (
                  <div className="p-3 bg-purple-900/20 border-b border-purple-900/30">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-purple-300 flex items-center gap-2">
                        <ArrowLeftRight size={14} /> Perbandingan Stock dengan {otherStoreName}
                      </h4>
                      <button 
                        onClick={() => setShowCompare(false)} 
                        className="text-purple-400 hover:text-purple-300 text-xs"
                      >
                        Tutup
                      </button>
                    </div>
                    
                    {compareLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="animate-spin text-purple-400" size={20} />
                      </div>
                    ) : compareData ? (
                      <div className="mt-3 grid grid-cols-2 gap-4">
                        {/* Stock Current Store */}
                        <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                          <div className="text-xs text-gray-400 mb-1">Stock {currentStoreName} (Saat Ini)</div>
                          <div className="flex items-center gap-2">
                            <Package size={20} className="text-blue-400" />
                            <span className={`text-2xl font-bold ${item.quantity === 0 ? 'text-red-400' : item.quantity < 4 ? 'text-yellow-400' : 'text-green-400'}`}>
                              {item.quantity}
                            </span>
                            <span className="text-xs text-gray-500">unit</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Harga: {formatCompactNumber(item.price)}</div>
                        </div>
                        
                        {/* Stock Other Store */}
                        <div className="bg-gray-800 rounded-lg p-3 border border-purple-900/50">
                          <div className="text-xs text-purple-400 mb-1">Stock {otherStoreName}</div>
                          <div className="flex items-center gap-2">
                            <Package size={20} className="text-purple-400" />
                            <span className={`text-2xl font-bold ${compareData.quantity === 0 ? 'text-red-400' : compareData.quantity < 4 ? 'text-yellow-400' : 'text-green-400'}`}>
                              {compareData.quantity}
                            </span>
                            <span className="text-xs text-gray-500">unit</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Harga: {formatCompactNumber(compareData.price)}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-center py-4 bg-gray-800 rounded-lg border border-gray-700">
                        <Package size={24} className="mx-auto text-gray-600 mb-2" />
                        <p className="text-xs text-gray-500">Part number <span className="font-mono text-gray-400">{item.partNumber}</span></p>
                        <p className="text-xs text-gray-500">tidak ditemukan di {otherStoreName}</p>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="p-3 bg-gray-800 border-b border-gray-700"><input type="text" placeholder="Cari Resi / Nama Customer..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 focus:border-blue-500 outline-none" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                
                <div className="flex-1 overflow-auto p-2 bg-gray-900/30">
                    {loading ? ( <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-500" size={24}/></div> ) : paginatedData.length === 0 ? ( <div className="text-center py-8 text-gray-500 text-xs">Belum ada riwayat transaksi.</div> ) : (
                        <HistoryTable data={paginatedData} />
                    )}
                </div>

                <div className="p-3 border-t border-gray-700 flex justify-between items-center bg-gray-800 rounded-b-2xl">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 bg-gray-700 rounded disabled:opacity-30"><ChevronLeft size={18}/></button>
                    <span className="text-xs text-gray-400">Hal {page} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 bg-gray-700 rounded disabled:opacity-30"><ChevronRight size={18}/></button>
                </div>
          </div>
      </div>
  );
};