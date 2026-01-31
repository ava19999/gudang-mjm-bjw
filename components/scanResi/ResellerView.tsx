// FILE: components/scanResi/ResellerView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../context/StoreContext';
import { 
  Users, ChevronLeft, ChevronRight, Loader2, X, Search, Calendar, FileText, AlertTriangle
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Store filter for combined data
  const [storeFilter, setStoreFilter] = useState<'all' | 'mjm' | 'bjw'>('all');
  
  // Main page date filter
  const [mainDateFrom, setMainDateFrom] = useState<string>('');
  const [mainDateTo, setMainDateTo] = useState<string>('');
  
  // Search query for filtering reseller names
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Filter & Pagination
  const [selectedReseller, setSelectedReseller] = useState<string>('');
  const [page, setPage] = useState(1);
  const perPage = 50;
  
  // History Modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyReseller, setHistoryReseller] = useState<string>('');
  
  // Date filter for history modal
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  
  // Resi search for history modal
  const [resiSearch, setResiSearch] = useState<string>('');
  
  // PDF export loading
  const [exportingPdf, setExportingPdf] = useState(false);
  
  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch Reseller Transactions - supports 'all', 'mjm', or 'bjw'
  const fetchTransactions = async () => {
    try {
      let allTransactions: ResellerTransaction[] = [];
      
      const fetchFromTable = async (table: string, storeName: string): Promise<ResellerTransaction[]> => {
        try {
          const { data, error } = await supabase
            .from(table)
            .select('id, created_at, customer, part_number, name, qty_keluar, harga_satuan, harga_total, resi, ecommerce, kode_toko')
            .eq('ecommerce', 'RESELLER')
            .order('created_at', { ascending: false })
            .limit(500);
          
          if (error) {
            console.error(`Error fetching from ${table}:`, error);
            return [];
          }
          
          // Add store indicator to each transaction with safe mapping
          return (data || []).map(t => ({
            id: t.id || '',
            created_at: t.created_at || '',
            customer: t.customer || '',
            part_number: t.part_number || '',
            name: t.name || '',
            qty_keluar: t.qty_keluar || 0,
            harga_satuan: t.harga_satuan || 0,
            harga_total: t.harga_total || 0,
            resi: t.resi || '',
            ecommerce: t.ecommerce || '',
            kode_toko: t.kode_toko || '',
            source_store: storeName
          }));
        } catch (err) {
          console.error(`Exception fetching from ${table}:`, err);
          return [];
        }
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
    } catch (err: any) {
      console.error('Fetch transactions error:', err);
      setError(err?.message || 'Gagal mengambil data transaksi');
    }
  };

  // Fetch Stats per Reseller - supports 'all', 'mjm', or 'bjw' with date filter
  const fetchStats = async () => {
    try {
      const statsMap: Record<string, ResellerStats> = {};
      
      const fetchFromTable = async (table: string): Promise<any[]> => {
        try {
          let query = supabase
            .from(table)
            .select('kode_toko, qty_keluar, harga_total, created_at')
            .eq('ecommerce', 'RESELLER');
          
          // Apply date filters
          if (mainDateFrom) {
            query = query.gte('created_at', `${mainDateFrom}T00:00:00`);
          }
          if (mainDateTo) {
            query = query.lte('created_at', `${mainDateTo}T23:59:59`);
          }
          
          const { data, error } = await query;
          if (error) {
            console.error(`Error fetching stats from ${table}:`, error);
            return [];
          }
          return data || [];
        } catch (err) {
          console.error(`Exception fetching stats from ${table}:`, err);
          return [];
        }
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
        if (!row) return;
        const resellerName = (row.kode_toko || 'Unknown').toUpperCase().trim();
        if (!resellerName) return;
        
        if (!statsMap[resellerName]) {
          statsMap[resellerName] = {
            nama_reseller: resellerName,
            total_transaksi: 0,
            total_qty: 0,
            total_nilai: 0
          };
        }
        statsMap[resellerName].total_transaksi++;
        statsMap[resellerName].total_qty += Number(row.qty_keluar) || 0;
        statsMap[resellerName].total_nilai += Number(row.harga_total) || 0;
      });
      
      const statsArray = Object.values(statsMap).sort((a, b) => b.total_nilai - a.total_nilai);
      setStats(statsArray);
      setError(null);
    } catch (err: any) {
      console.error('Fetch stats error:', err);
      setError(err?.message || 'Gagal mengambil statistik reseller');
    }
  };

  // Initial load
  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchTransactions(), fetchStats()])
      .finally(() => setLoading(false));
  }, [selectedStore, refreshTrigger]);

  // Refetch when store filter or date filter changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchTransactions(), fetchStats()])
      .finally(() => setLoading(false));
  }, [storeFilter, mainDateFrom, mainDateTo]);

  // Toast helper
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Filtered stats based on search query
  const filteredStats = useMemo(() => {
    if (!searchQuery.trim()) return stats;
    return stats.filter(s => 
      s.nama_reseller.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [stats, searchQuery]);

  // Filtered transactions for modal (with date range, resi search, and selected reseller)
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;
    
    // Filter by selected reseller (for modal)
    if (selectedReseller) {
      filtered = filtered.filter(t => 
        (t.kode_toko || '').toUpperCase() === selectedReseller.toUpperCase()
      );
    }
    
    // Filter by date range
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(t => new Date(t.created_at) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(t => new Date(t.created_at) <= toDate);
    }
    
    // Filter by resi search
    if (resiSearch.trim()) {
      filtered = filtered.filter(t => 
        (t.resi || '').toLowerCase().includes(resiSearch.toLowerCase()) ||
        (t.customer || '').toLowerCase().includes(resiSearch.toLowerCase()) ||
        (t.part_number || '').toLowerCase().includes(resiSearch.toLowerCase())
      );
    }
    
    return filtered;
  }, [transactions, selectedReseller, dateFrom, dateTo, resiSearch]);

  // Paginated transactions (using filtered)
  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * perPage;
    return filteredTransactions.slice(start, start + perPage);
  }, [filteredTransactions, page]);

  const totalPages = Math.ceil(filteredTransactions.length / perPage) || 1;

  // Calculate filtered total value
  const filteredTotalValue = useMemo(() => {
    return filteredTransactions.reduce((sum, t) => sum + (t.harga_total || 0), 0);
  }, [filteredTransactions]);

  // Export to PDF
  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      // Create PDF content
      const dateRangeText = dateFrom || dateTo 
        ? `Periode: ${dateFrom ? new Date(dateFrom).toLocaleDateString('id-ID') : 'Awal'} - ${dateTo ? new Date(dateTo).toLocaleDateString('id-ID') : 'Sekarang'}`
        : 'Semua Periode';
      
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Tagihan Reseller - ${historyReseller}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .header h1 { font-size: 18px; margin-bottom: 5px; }
            .header p { color: #666; font-size: 11px; }
            .info { display: flex; justify-content: space-between; margin-bottom: 15px; }
            .info-item { margin-bottom: 5px; }
            .info-label { color: #666; font-size: 10px; }
            .info-value { font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 10px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .total-row { background-color: #f0f0f0; font-weight: bold; }
            .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #666; }
            .summary { background: #f9f9f9; padding: 10px; margin-bottom: 15px; border-radius: 5px; }
            .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
            .summary-item { text-align: center; }
            .summary-value { font-size: 16px; font-weight: bold; color: #333; }
            @media print {
              body { padding: 10px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>TAGIHAN RESELLER</h1>
            <p>MJM86 AUTOPART - Suku Cadang Mobil</p>
          </div>
          
          <div class="info">
            <div>
              <div class="info-item">
                <div class="info-label">Nama Reseller</div>
                <div class="info-value">${historyReseller}</div>
              </div>
              <div class="info-item">
                <div class="info-label">${dateRangeText}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div class="info-item">
                <div class="info-label">Tanggal Cetak</div>
                <div class="info-value">${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Toko</div>
                <div class="info-value">${storeFilter === 'all' ? 'MJM & BJW' : storeFilter.toUpperCase()}</div>
              </div>
            </div>
          </div>

          <div class="summary">
            <div class="summary-grid">
              <div class="summary-item">
                <div class="info-label">Total Transaksi</div>
                <div class="summary-value">${filteredTransactions.length}</div>
              </div>
              <div class="summary-item">
                <div class="info-label">Total Qty</div>
                <div class="summary-value">${filteredTransactions.reduce((sum, t) => sum + (t.qty_keluar || 0), 0)}</div>
              </div>
              <div class="summary-item">
                <div class="info-label">Total Nilai</div>
                <div class="summary-value">Rp ${filteredTotalValue.toLocaleString('id-ID')}</div>
              </div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th class="text-center">No</th>
                <th>Tanggal</th>
                <th>Customer</th>
                <th>Part Number</th>
                <th class="text-center">Qty</th>
                <th class="text-right">Harga</th>
                <th class="text-right">Total</th>
                <th>Resi</th>
              </tr>
            </thead>
            <tbody>
              ${[...filteredTransactions].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((t, i) => `
                <tr>
                  <td class="text-center">${i + 1}</td>
                  <td>${new Date(t.created_at).toLocaleDateString('id-ID')}</td>
                  <td>${t.customer || '-'}</td>
                  <td>${t.part_number || '-'}</td>
                  <td class="text-center">${t.qty_keluar}</td>
                  <td class="text-right">Rp ${(t.harga_satuan || 0).toLocaleString('id-ID')}</td>
                  <td class="text-right">Rp ${(t.harga_total || 0).toLocaleString('id-ID')}</td>
                  <td>${t.resi || '-'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="4" class="text-right">TOTAL</td>
                <td class="text-center">${filteredTransactions.reduce((sum, t) => sum + (t.qty_keluar || 0), 0)}</td>
                <td></td>
                <td class="text-right">Rp ${filteredTotalValue.toLocaleString('id-ID')}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          
          <div class="footer">
            <p>Dokumen ini dicetak secara otomatis dari sistem MJM86 AUTOPART</p>
          </div>
        </body>
        </html>
      `;
      
      // Open print window
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
      
      showToast('PDF berhasil dibuat', 'success');
    } catch (err) {
      console.error('Export PDF error:', err);
      showToast('Gagal membuat PDF', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  // Reset filters when modal closes
  const handleCloseModal = () => {
    setShowHistoryModal(false);
    setSelectedReseller('');
    setDateFrom('');
    setDateTo('');
    setResiSearch('');
    setPage(1);
  };

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

        {/* Date Range Filter */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-sm text-gray-400">Periode:</span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="date"
                value={mainDateFrom}
                onChange={(e) => setMainDateFrom(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-pink-500 outline-none w-40"
              />
            </div>
            <span className="text-gray-500">-</span>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="date"
                value={mainDateTo}
                onChange={(e) => setMainDateTo(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-pink-500 outline-none w-40"
              />
            </div>
            {(mainDateFrom || mainDateTo) && (
              <button
                onClick={() => { setMainDateFrom(''); setMainDateTo(''); }}
                className="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg flex items-center gap-1"
              >
                <X size={14} />
                Reset
              </button>
            )}
          </div>
          {(mainDateFrom || mainDateTo) && (
            <span className="text-xs text-pink-400">
              (Filter aktif)
            </span>
          )}
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama reseller..."
              className="w-full md:w-80 bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Stats Table */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-pink-400" size={32} />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="text-red-400 text-lg mb-2">⚠️ Terjadi Kesalahan</div>
              <div className="text-gray-400 text-sm mb-4">{error}</div>
              <button
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  Promise.all([fetchTransactions(), fetchStats()])
                    .finally(() => setLoading(false));
                }}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm"
              >
                Coba Lagi
              </button>
            </div>
          ) : (
            <div className="p-4">
              {/* Stats per reseller */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-300">Statistik per Reseller</h3>
                  {searchQuery && (
                    <span className="text-xs text-gray-500">
                      Menampilkan {filteredStats.length} dari {stats.length} reseller
                    </span>
                  )}
                </div>
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
                      {filteredStats.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-8 text-gray-500">
                            {searchQuery ? 'Tidak ada reseller yang cocok' : 'Belum ada data'}
                          </td>
                        </tr>
                      ) : (
                        filteredStats.map((s, idx) => (
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
          <div className="bg-gray-800 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden border border-gray-700 shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 bg-gray-900/50">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Users size={20} className="text-pink-400" />
                    Riwayat Transaksi: <span className="text-pink-400">{historyReseller}</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Total: {filteredTransactions.length} transaksi
                    {(dateFrom || dateTo || resiSearch) && ' (difilter)'}
                  </p>
                </div>
                <button 
                  onClick={handleCloseModal} 
                  className="p-2 hover:bg-gray-700 rounded-lg"
                >
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
              
              {/* Filters Row */}
              <div className="flex flex-wrap gap-3 items-end">
                {/* Date From */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Dari Tanggal</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                      className="bg-gray-700 border border-gray-600 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white focus:border-pink-500 outline-none w-36"
                    />
                  </div>
                </div>
                
                {/* Date To */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Sampai Tanggal</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                      className="bg-gray-700 border border-gray-600 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white focus:border-pink-500 outline-none w-36"
                    />
                  </div>
                </div>
                
                {/* Resi Search */}
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-gray-400 mb-1">Cari Resi/Customer/Part</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                    <input
                      type="text"
                      value={resiSearch}
                      onChange={(e) => { setResiSearch(e.target.value); setPage(1); }}
                      placeholder="Ketik resi, customer, atau part number..."
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-8 pr-8 py-1.5 text-sm text-white focus:border-pink-500 outline-none"
                    />
                    {resiSearch && (
                      <button
                        onClick={() => setResiSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Clear Filters */}
                {(dateFrom || dateTo || resiSearch) && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo(''); setResiSearch(''); setPage(1); }}
                    className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
                  >
                    Reset Filter
                  </button>
                )}
                
                {/* Export PDF Button */}
                <button
                  onClick={handleExportPdf}
                  disabled={exportingPdf || filteredTransactions.length === 0}
                  className="px-4 py-1.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  {exportingPdf ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <FileText size={14} />
                  )}
                  Export PDF
                </button>
              </div>
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
                  Rp {filteredTotalValue.toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
