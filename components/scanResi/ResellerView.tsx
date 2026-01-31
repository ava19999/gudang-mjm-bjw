// FILE: components/scanResi/ResellerView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../context/StoreContext';
import { 
  Users, ChevronLeft, ChevronRight, Loader2, X
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { formatCompactNumber } from '../../utils/dashboardHelpers';

interface ResellerViewProps {
  onRefresh?: () => void;
  refreshTrigger?: number;
}

interface ResellerTransaction {
  id: string;
  created_at: string;
  customer: string;
  part_number: string;
  name: string;
  qty_keluar: number;
  harga_satuan: number;
  harga_total: number;
  resi: string;
  ecommerce: string;
  kode_toko: string;
  source_store?: string;
}

interface ResellerStats {
  nama_reseller: string;
  total_transaksi: number;
  total_qty: number;
  total_nilai: number;
}

export const ResellerView: React.FC<ResellerViewProps> = ({ onRefresh, refreshTrigger }) => {
  const { selectedStore } = useStore();
  
  // State
  const [transactions, setTransactions] = useState<ResellerTransaction[]>([]);
  const [stats, setStats] = useState<ResellerStats[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Store filter for combined data
  const [storeFilter, setStoreFilter] = useState<'all' | 'mjm' | 'bjw'>('all');
  
  // Filter & Pagination
  const [selectedReseller, setSelectedReseller] = useState<string>('');
  const [page, setPage] = useState(1);
  const perPage = 50;
  
  // History Modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyReseller, setHistoryReseller] = useState<string>('');
  
  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch Reseller Transactions - supports 'all', 'mjm', or 'bjw'
  const fetchTransactions = async () => {
    try {
      let allTransactions: ResellerTransaction[] = [];
      
      const fetchFromTable = async (table: string, storeName: string) => {
        let query = supabase
          .from(table)
          .select('*')
          .eq('ecommerce', 'RESELLER')
          .order('created_at', { ascending: false });
        
        if (selectedReseller) {
          query = query.ilike('kode_toko', `%${selectedReseller}%`);
        }
        
        const { data, error } = await query.limit(500);
        if (error) throw error;
        
        // Add store indicator to each transaction
        return (data || []).map(t => ({ ...t, source_store: storeName }));
      };
      
      if (storeFilter === 'all') {
        const [mjmData, bjwData] = await Promise.all([
          fetchFromTable('barang_keluar_mjm', 'MJM'),
          fetchFromTable('barang_keluar_bjw', 'BJW')
        ]);
        allTransactions = [...mjmData, ...bjwData];
        // Sort by created_at descending
        allTransactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (storeFilter === 'mjm') {
        allTransactions = await fetchFromTable('barang_keluar_mjm', 'MJM');
      } else {
        allTransactions = await fetchFromTable('barang_keluar_bjw', 'BJW');
      }
      
      setTransactions(allTransactions);
    } catch (err) {
      console.error('Fetch transactions error:', err);
    }
  };

  // Fetch Stats per Reseller - supports 'all', 'mjm', or 'bjw'
  const fetchStats = async () => {
    try {
      const statsMap: Record<string, ResellerStats> = {};
      
      const fetchFromTable = async (table: string) => {
        const { data, error } = await supabase
          .from(table)
          .select('kode_toko, qty_keluar, harga_total')
          .eq('ecommerce', 'RESELLER');
        
        if (error) throw error;
        return data || [];
      };
      
      let allData: any[] = [];
      
      if (storeFilter === 'all') {
        const [mjmData, bjwData] = await Promise.all([
          fetchFromTable('barang_keluar_mjm'),
          fetchFromTable('barang_keluar_bjw')
        ]);
        allData = [...mjmData, ...bjwData];
      } else if (storeFilter === 'mjm') {
        allData = await fetchFromTable('barang_keluar_mjm');
      } else {
        allData = await fetchFromTable('barang_keluar_bjw');
      }
      
      // Group by kode_toko (reseller name)
      allData.forEach(row => {
        const resellerName = (row.kode_toko || 'Unknown').toUpperCase();
        if (!statsMap[resellerName]) {
          statsMap[resellerName] = {
            nama_reseller: resellerName,
            total_transaksi: 0,
            total_qty: 0,
            total_nilai: 0
          };
        }
        statsMap[resellerName].total_transaksi++;
        statsMap[resellerName].total_qty += row.qty_keluar || 0;
        statsMap[resellerName].total_nilai += row.harga_total || 0;
      });
      
      const statsArray = Object.values(statsMap).sort((a, b) => b.total_nilai - a.total_nilai);
      setStats(statsArray);
    } catch (err) {
      console.error('Fetch stats error:', err);
    }
  };

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTransactions(), fetchStats()])
      .finally(() => setLoading(false));
  }, [selectedStore, refreshTrigger]);

  // Refetch when reseller filter or store filter changes
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTransactions(), fetchStats()])
      .finally(() => setLoading(false));
  }, [selectedReseller, storeFilter]);

  // Toast helper
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Paginated transactions
  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * perPage;
    return transactions.slice(start, start + perPage);
  }, [transactions, page]);

  const totalPages = Math.ceil(transactions.length / perPage) || 1;

  return (
    <div className="p-4 md:p-6 bg-gray-900 min-h-full">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } text-white font-medium animate-in slide-in-from-top`}>
          {toast.message}
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Users className="text-pink-400" size={28} />
              Reseller Management
            </h1>
            <p className="text-gray-400 text-sm mt-1">Kelola reseller dan transaksi penjualan</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Total Reseller</div>
            <div className="text-2xl font-bold text-white">{stats.length}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Total Transaksi</div>
            <div className="text-2xl font-bold text-blue-400">{stats.reduce((sum, s) => sum + s.total_transaksi, 0)}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Total Qty Terjual</div>
            <div className="text-2xl font-bold text-green-400">
              {stats.reduce((sum, s) => sum + s.total_qty, 0)}
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Total Nilai</div>
            <div className="text-2xl font-bold text-yellow-400">
              {formatCompactNumber(stats.reduce((sum, s) => sum + s.total_nilai, 0))}
            </div>
          </div>
        </div>

        {/* Store Filter */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-400">Data dari:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setStoreFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                storeFilter === 'all' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStoreFilter('mjm')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                storeFilter === 'mjm' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              MJM
            </button>
            <button
              onClick={() => setStoreFilter('bjw')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                storeFilter === 'bjw' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              BJW
            </button>
          </div>
        </div>

        {/* Stats Table */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-pink-400" size={32} />
            </div>
          ) : (
            <div className="p-4">
              {/* Stats per reseller */}
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Statistik per Reseller</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-2 px-3 text-gray-400 font-medium">Reseller</th>
                        <th className="text-right py-2 px-3 text-gray-400 font-medium">Transaksi</th>
                        <th className="text-right py-2 px-3 text-gray-400 font-medium">Qty</th>
                        <th className="text-right py-2 px-3 text-gray-400 font-medium">Nilai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-8 text-gray-500">Belum ada data</td>
                        </tr>
                      ) : (
                        stats.map((s, idx) => (
                          <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                            <td className="py-2 px-3">
                              <button
                                onClick={() => {
                                  setHistoryReseller(s.nama_reseller);
                                  setSelectedReseller(s.nama_reseller);
                                  setShowHistoryModal(true);
                                }}
                                className="text-pink-400 font-medium hover:text-pink-300 hover:underline text-left"
                              >
                                {s.nama_reseller}
                              </button>
                            </td>
                            <td className="py-2 px-3 text-right text-gray-300">{s.total_transaksi}</td>
                            <td className="py-2 px-3 text-right text-gray-300">{s.total_qty}</td>
                            <td className="py-2 px-3 text-right text-green-400 font-medium">
                              {formatCompactNumber(s.total_nilai)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-gray-700 shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users size={20} className="text-pink-400" />
                  Riwayat Transaksi: <span className="text-pink-400">{historyReseller}</span>
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Total: {paginatedTransactions.length} transaksi
                </p>
              </div>
              <button 
                onClick={() => setShowHistoryModal(false)} 
                className="p-2 hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 sticky top-0">
                  <tr className="border-b border-gray-700">
                    {storeFilter === 'all' && (
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Toko</th>
                    )}
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Tanggal</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Customer</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Part Number</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Nama Barang</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Qty</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Harga Satuan</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">Total</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Resi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={storeFilter === 'all' ? 9 : 8} className="text-center py-12 text-gray-500">
                        Belum ada transaksi untuk reseller ini
                      </td>
                    </tr>
                  ) : (
                    paginatedTransactions.map((trx, idx) => (
                      <tr key={trx.id || idx} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        {storeFilter === 'all' && (
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              trx.source_store === 'MJM' ? 'bg-blue-900/50 text-blue-400' : 'bg-green-900/50 text-green-400'
                            }`}>
                              {trx.source_store || '-'}
                            </span>
                          </td>
                        )}
                        <td className="py-3 px-4 text-gray-400 text-xs">
                          {new Date(trx.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="py-3 px-4 text-blue-400">{trx.customer || '-'}</td>
                        <td className="py-3 px-4 text-gray-300 font-mono text-xs">{trx.part_number}</td>
                        <td className="py-3 px-4 text-white max-w-[200px] truncate">{trx.name}</td>
                        <td className="py-3 px-4 text-right text-gray-300 font-medium">{trx.qty_keluar}</td>
                        <td className="py-3 px-4 text-right text-yellow-400">{formatCompactNumber(trx.harga_satuan)}</td>
                        <td className="py-3 px-4 text-right text-green-400 font-bold">{formatCompactNumber(trx.harga_total)}</td>
                        <td className="py-3 px-4 text-gray-400 text-xs">{trx.resi || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 bg-gray-700 rounded-lg disabled:opacity-30 hover:bg-gray-600"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-gray-400 text-sm">Hal {page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 bg-gray-700 rounded-lg disabled:opacity-30 hover:bg-gray-600"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="text-white font-medium">
                Total Nilai: <span className="text-green-400 font-bold">
                  {formatCompactNumber(transactions.reduce((sum, t) => sum + (t.harga_total || 0), 0))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
