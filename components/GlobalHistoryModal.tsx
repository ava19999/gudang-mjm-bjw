// FILE: src/components/GlobalHistoryModal.tsx
import React, { useState, useEffect } from 'react';
import { StockHistory } from '../types';
import { fetchHistoryLogsPaginated } from '../services/supabaseService';
import { HistoryTable } from './HistoryTable';
import { Loader2, X, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';

interface GlobalHistoryModalProps {
  type: 'in' | 'out';
  onClose: () => void;
}

export const GlobalHistoryModal: React.FC<GlobalHistoryModalProps> = ({ type, onClose }) => {
  const [data, setData] = useState<StockHistory[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(async () => {
      const { data, count } = await fetchHistoryLogsPaginated(type, page, 50, search);
      setData(data);
      setTotalPages(Math.ceil(count / 50));
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [type, page, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
        <div className="bg-gray-800 rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col border border-gray-700 shadow-2xl m-4">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 rounded-t-2xl">
                <h3 className="font-bold text-gray-100 flex items-center gap-2">{type === 'in' ? <TrendingUp className="text-green-500" size={20}/> : <TrendingDown className="text-red-500" size={20}/>} Detail Barang {type === 'in' ? 'Masuk' : 'Keluar'}</h3>
                <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded-full"><X size={20}/></button>
            </div>
            <div className="p-3 border-b border-gray-700 bg-gray-800">
                <input type="text" placeholder="Cari Resi / Nama Barang..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-blue-500 outline-none" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex-1 overflow-auto bg-gray-900/30 p-2">
                {loading ? ( <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" size={30}/></div> ) : data.length === 0 ? ( <div className="text-center py-10 text-gray-500">Tidak ada data history</div> ) : (
                    <HistoryTable data={data} />
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