// FILE: src/components/ItemHistoryModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryItem, StockHistory } from '../types';
import { fetchItemHistory } from '../services/supabaseService';
import { parseHistoryReason } from '../utils/dashboardHelpers';
import { HistoryTable } from './HistoryTable';
import { Loader2, X, ChevronLeft, ChevronRight, History } from 'lucide-react';

interface ItemHistoryModalProps {
  item: InventoryItem;
  onClose: () => void;
}

export const ItemHistoryModal: React.FC<ItemHistoryModalProps> = ({ item, onClose }) => {
  const [data, setData] = useState<StockHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (item.partNumber) {
        setLoading(true);
        fetchItemHistory(item.partNumber).then((res) => {
            setData(res);
            setLoading(false);
        }).catch(() => setLoading(false));
    }
  }, [item]);

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

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-gray-800 rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col border border-gray-700 shadow-2xl m-4 overflow-hidden">
                <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
                    <div><h3 className="font-bold text-gray-100 flex items-center gap-2"><History size={16} className="text-blue-400"/> Riwayat Item</h3><p className="text-xs text-gray-400 truncate max-w-[300px]">{item.name}</p></div>
                    <button onClick={onClose} className="p-1 bg-gray-700 hover:bg-gray-600 rounded-full"><X size={18}/></button>
                </div>
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