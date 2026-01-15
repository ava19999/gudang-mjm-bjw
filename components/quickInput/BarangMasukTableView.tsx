// FILE: src/components/quickInput/BarangMasukTableView.tsx
import React, { useEffect, useState } from 'react';
import { useStore } from '../../context/StoreContext';
import { fetchBarangMasukLog } from '../../services/supabaseService';
import { formatRupiah, formatDate } from '../../utils';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, PackageOpen } from 'lucide-react';

interface Props { refreshTrigger: number; }

export const BarangMasukTableView: React.FC<Props> = ({ refreshTrigger }) => {
    const { selectedStore } = useStore();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const LIMIT = 10;

    const loadData = async () => {
        setLoading(true);
        try {
            const { data: logs, total } = await fetchBarangMasukLog(selectedStore, page, LIMIT);
            setData(logs);
            setTotalRows(total);
        } catch (e) {
            console.error("Gagal memuat data barang masuk:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { setPage(1); }, [selectedStore]);
    useEffect(() => { loadData(); }, [selectedStore, page, refreshTrigger]);

    const totalPages = Math.ceil(totalRows / LIMIT);

    return (
        <div className="flex-1 bg-gray-900 border-t border-gray-700 flex flex-col overflow-hidden h-[40vh]">
            <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
                <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <PackageOpen size={16} className="text-green-500"/>
                    Riwayat Barang Masuk ({selectedStore?.toUpperCase()})
                </h3>
                <button onClick={loadData} className="p-1.5 hover:bg-gray-700 rounded text-gray-400">
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="flex-1 overflow-auto p-2">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-3 py-2">Tanggal</th>
                            <th className="px-3 py-2">Part Number</th>
                            <th className="px-3 py-2">Nama Barang</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Harga Satuan</th>
                            <th className="px-3 py-2 text-right">Total</th>
                            <th className="px-3 py-2">Customer/Sumber</th>
                            <th className="px-3 py-2">Tempo</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-gray-700/50">
                        {loading ? (
                            <tr><td colSpan={8} className="py-8 text-center text-gray-500"><Loader2 size={16} className="animate-spin inline mr-2"/>Memuat data...</td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={8} className="py-8 text-center text-gray-600 italic">Belum ada data barang masuk.</td></tr>
                        ) : (
                            data.map((item, idx) => (
                                <tr key={item.id || idx} className="hover:bg-gray-800/50 transition-colors">
                                    <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">{formatDate(item.created_at)}</td>
                                    <td className="px-3 py-2 font-bold text-gray-200 font-mono">{item.part_number}</td>
                                    <td className="px-3 py-2 text-gray-300 max-w-[200px] truncate" title={item.name}>{item.name || '-'}</td>
                                    <td className="px-3 py-2 text-right font-bold text-green-400">+{item.quantity || item.qty_masuk}</td>
                                    <td className="px-3 py-2 text-right text-gray-400 font-mono">{formatRupiah(item.harga_satuan)}</td>
                                    <td className="px-3 py-2 text-right text-orange-300 font-mono">{formatRupiah(item.harga_total)}</td>
                                    <td className="px-3 py-2 text-gray-400">{item.customer && item.customer !== '-' ? item.customer : (item.ecommerce || '-')}</td>
                                    <td className="px-3 py-2 text-gray-500">{item.tempo || '-'}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 flex justify-between items-center text-xs">
                <span className="text-gray-500">Hal {page} dari {totalPages || 1}</span>
                <div className="flex gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-300"><ChevronLeft size={16}/></button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-300"><ChevronRight size={16}/></button>
                </div>
            </div>
        </div>
    );
};