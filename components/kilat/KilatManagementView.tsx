// FILE: components/kilat/KilatManagementView.tsx
// Komponen untuk mengelola sistem KILAT Pre-Ship (TERPISAH dari Scan Resi KILAT)
// 
// PERBEDAAN:
// - Scan Resi KILAT (Stage 3) = Pesanan KILAT yang sudah masuk, diproses via scan resi biasa
// - KILAT Pre-Ship (Menu ini) = Barang dikirim ke gudang Shopee SEBELUM ada order

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../../context/StoreContext';
import {
  fetchAllKilatPrestock,
  fetchKilatPrestockPending,
  addKilatPrestock,
  updateKilatPrestock,
  deleteKilatPrestock,
  fetchKilatPenjualan,
  addKilatPenjualanManual,
  getKilatStats,
  KilatPrestock,
  KilatPenjualan
} from '../../services/kilatService';
import { supabase } from '../../services/supabaseClient';
import {
  Package,
  Truck,
  TrendingUp,
  Clock,
  Search,
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Upload,
  Download,
  Filter,
  ChevronDown,
  Zap,
  ShoppingCart,
  BarChart3,
  Calendar,
  DollarSign,
  ArrowRightLeft,
  Info
} from 'lucide-react';

type TabType = 'prestock' | 'penjualan' | 'input';
type StatusFilter = 'all' | 'MENUNGGU_TERJUAL' | 'SEBAGIAN_TERJUAL' | 'HABIS_TERJUAL';

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export const KilatManagementView: React.FC = () => {
  const { selectedStore: currentStore } = useStore();
  
  // State
  const [activeTab, setActiveTab] = useState<TabType>('prestock');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [toast, setToast] = useState<Toast | null>(null);
  
  // Data states
  const [prestockData, setPrestockData] = useState<KilatPrestock[]>([]);
  const [penjualanData, setPenjualanData] = useState<KilatPenjualan[]>([]);
  const [stats, setStats] = useState<{
    totalPending: number;
    totalTerjual: number;
    totalQtyPending: number;
    totalQtyTerjual: number;
    avgAgingDays: number;
  }>({
    totalPending: 0,
    totalTerjual: 0,
    totalQtyPending: 0,
    totalQtyTerjual: 0,
    avgAgingDays: 0
  });
  
  // Input form state
  const [inputForm, setInputForm] = useState({
    resi_kirim: '',
    part_number: '',
    qty_kirim: 1,
    sub_toko: 'MJM'
  });
  const [partSuggestions, setPartSuggestions] = useState<any[]>([]);
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  
  // Modal states
  const [editingItem, setEditingItem] = useState<KilatPrestock | null>(null);
  const [showAddSaleModal, setShowAddSaleModal] = useState(false);
  const [selectedKilatForSale, setSelectedKilatForSale] = useState<KilatPrestock | null>(null);
  
  // Show toast
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  
  // Load data
  const loadData = useCallback(async () => {
    if (!currentStore) return;
    setLoading(true);
    
    try {
      const [prestock, penjualan, statsData] = await Promise.all([
        fetchAllKilatPrestock(currentStore, { limit: 500 }),
        fetchKilatPenjualan(currentStore, { limit: 200 }),
        getKilatStats(currentStore)
      ]);
      
      setPrestockData(prestock);
      setPenjualanData(penjualan);
      setStats(statsData);
    } catch (err) {
      console.error('Error loading KILAT data:', err);
      showToast('Gagal memuat data', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentStore, showToast]);
  
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // Search part number
  const searchPartNumber = useCallback(async (term: string) => {
    if (!term || term.length < 2 || !currentStore) {
      setPartSuggestions([]);
      return;
    }
    
    const stockTable = currentStore === 'mjm' ? 'base_mjm' : 'base_bjw';
    const { data } = await supabase
      .from(stockTable)
      .select('part_number, name, brand, quantity')
      .or(`part_number.ilike.%${term}%,name.ilike.%${term}%`)
      .order('part_number')
      .limit(20);
    
    setPartSuggestions(data || []);
    setShowPartDropdown(true);
  }, [currentStore]);
  
  // Handle input submit
  const handleInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputForm.part_number || inputForm.qty_kirim < 1) {
      showToast('Part Number dan Qty harus diisi!', 'error');
      return;
    }
    
    setLoading(true);
    const result = await addKilatPrestock(
      currentStore,
      {
        resi_kirim: inputForm.resi_kirim || undefined,
        part_number: inputForm.part_number,
        qty_kirim: inputForm.qty_kirim,
        sub_toko: inputForm.sub_toko
      },
      true // Reduce stock
    );
    
    if (result.success) {
      showToast(result.message, 'success');
      setInputForm({ resi_kirim: '', part_number: '', qty_kirim: 1, sub_toko: 'MJM' });
      loadData();
    } else {
      showToast(result.message, 'error');
    }
    setLoading(false);
  };
  
  // Handle delete
  const handleDelete = async (id: string, restoreStock: boolean) => {
    if (!confirm(`Hapus item ini? ${restoreStock ? '(Stock akan dikembalikan)' : ''}`)) return;
    
    setLoading(true);
    const result = await deleteKilatPrestock(currentStore, id, restoreStock);
    
    if (result.success) {
      showToast(result.message, 'success');
      loadData();
    } else {
      showToast(result.message, 'error');
    }
    setLoading(false);
  };
  
  // Filtered data
  const filteredPrestock = useMemo(() => {
    let data = prestockData;
    
    if (statusFilter !== 'all') {
      data = data.filter(d => d.status === statusFilter);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(d =>
        d.part_number?.toLowerCase().includes(term) ||
        d.nama_barang?.toLowerCase().includes(term) ||
        d.resi_kirim?.toLowerCase().includes(term)
      );
    }
    
    return data;
  }, [prestockData, statusFilter, searchTerm]);
  
  // Status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'MENUNGGU_TERJUAL':
        return <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-400 text-xs rounded-full">Menunggu</span>;
      case 'SEBAGIAN_TERJUAL':
        return <span className="px-2 py-0.5 bg-blue-900/50 text-blue-400 text-xs rounded-full">Sebagian</span>;
      case 'HABIS_TERJUAL':
        return <span className="px-2 py-0.5 bg-green-900/50 text-green-400 text-xs rounded-full">Habis</span>;
      case 'RETUR':
        return <span className="px-2 py-0.5 bg-red-900/50 text-red-400 text-xs rounded-full">Retur</span>;
      default:
        return <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded-full">{status}</span>;
    }
  };
  
  // Format currency
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  };
  
  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 ${
          toast.type === 'success' ? 'bg-green-900 text-green-100 border border-green-700' :
          toast.type === 'error' ? 'bg-red-900 text-red-100 border border-red-700' :
          'bg-blue-900 text-blue-100 border border-blue-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle size={18} /> :
           toast.type === 'error' ? <XCircle size={18} /> :
           <AlertTriangle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="text-yellow-400" />
            KILAT Management
          </h1>
          <p className="text-gray-400 text-sm">Pre-Ship ke Gudang E-commerce (Shopee)</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} className={`text-gray-300 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      
      {/* Info Banner */}
      <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3 flex items-start gap-3">
        <Info size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-yellow-200/80">
          <p className="font-medium text-yellow-300 mb-1">Sistem KILAT Pre-Ship</p>
          <p>Input barang yang dikirim ke gudang Shopee sebelum terjual. Ketika CSV diimport di Scan Resi, sistem akan otomatis match dan tidak mengurangi stock lagi.</p>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-900/10 border border-yellow-800/30 rounded-xl p-4">
          <div className="flex items-center gap-2 text-yellow-400 mb-1">
            <Clock size={18} />
            <span className="text-sm font-medium">Menunggu Terjual</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.totalPending}</div>
          <div className="text-xs text-gray-400">{stats.totalQtyPending} pcs</div>
        </div>
        
        <div className="bg-gradient-to-br from-green-900/30 to-green-900/10 border border-green-800/30 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-400 mb-1">
            <CheckCircle size={18} />
            <span className="text-sm font-medium">Sudah Terjual</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.totalTerjual}</div>
          <div className="text-xs text-gray-400">{stats.totalQtyTerjual} pcs</div>
        </div>
        
        <div className="bg-gradient-to-br from-blue-900/30 to-blue-900/10 border border-blue-800/30 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-400 mb-1">
            <Calendar size={18} />
            <span className="text-sm font-medium">Avg. Aging</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.avgAgingDays}</div>
          <div className="text-xs text-gray-400">hari di gudang</div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1 bg-gray-800/50 p-1 rounded-lg">
        {[
          { id: 'prestock', label: 'Prestock', icon: Package },
          { id: 'penjualan', label: 'Penjualan', icon: ShoppingCart },
          { id: 'input', label: 'Input Baru', icon: Plus }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex-1 min-w-[100px] px-3 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-yellow-600 text-white shadow-lg'
                : 'text-gray-400 hover:bg-gray-700'
            }`}
          >
            <tab.icon size={16} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>
      
      {/* Search & Filter */}
      {activeTab !== 'input' && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari part number, nama barang, resi..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
            />
          </div>
          
          {activeTab === 'prestock' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-yellow-500"
            >
              <option value="all">Semua Status</option>
              <option value="MENUNGGU_TERJUAL">Menunggu Terjual</option>
              <option value="SEBAGIAN_TERJUAL">Sebagian Terjual</option>
              <option value="HABIS_TERJUAL">Habis Terjual</option>
            </select>
          )}
        </div>
      )}
      
      {/* Content based on tab */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="animate-spin mx-auto text-yellow-400 mb-2" size={32} />
            <p className="text-gray-400">Memuat data...</p>
          </div>
        ) : (
          <>
            {/* Tab: Prestock */}
            {activeTab === 'prestock' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900/50">
                    <tr className="text-left text-gray-400 text-sm">
                      <th className="px-4 py-3">Tgl Kirim</th>
                      <th className="px-4 py-3">Resi</th>
                      <th className="px-4 py-3">Part Number</th>
                      <th className="px-4 py-3">Nama Barang</th>
                      <th className="px-4 py-3 text-center">Kirim</th>
                      <th className="px-4 py-3 text-center">Terjual</th>
                      <th className="px-4 py-3 text-center">Sisa</th>
                      <th className="px-4 py-3 text-center">Aging</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {filteredPrestock.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                          Tidak ada data prestock
                        </td>
                      </tr>
                    ) : (
                      filteredPrestock.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-700/30">
                          <td className="px-4 py-3 text-gray-300 text-sm">
                            {new Date(item.tanggal_kirim).toLocaleDateString('id-ID')}
                          </td>
                          <td className="px-4 py-3 text-white font-mono text-sm">{item.resi_kirim || '-'}</td>
                          <td className="px-4 py-3 text-yellow-400 font-mono text-sm">{item.part_number}</td>
                          <td className="px-4 py-3 text-gray-300 text-sm max-w-[200px] truncate">{item.nama_barang}</td>
                          <td className="px-4 py-3 text-center text-white text-sm">{item.qty_kirim}</td>
                          <td className="px-4 py-3 text-center text-green-400 text-sm">{item.qty_terjual}</td>
                          <td className="px-4 py-3 text-center text-yellow-400 text-sm font-bold">{item.qty_sisa}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm ${
                              (item.aging_days || 0) > 30 ? 'text-red-400' :
                              (item.aging_days || 0) > 14 ? 'text-orange-400' :
                              'text-gray-400'
                            }`}>
                              {item.aging_days}d
                            </span>
                          </td>
                          <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setSelectedKilatForSale(item);
                                  setShowAddSaleModal(true);
                                }}
                                className="p-1.5 bg-green-900/50 hover:bg-green-800/50 text-green-400 rounded-lg"
                                title="Catat Penjualan"
                              >
                                <ShoppingCart size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(item.id, true)}
                                className="p-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-400 rounded-lg"
                                title="Hapus (Kembalikan Stock)"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Tab: Penjualan */}
            {activeTab === 'penjualan' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900/50">
                    <tr className="text-left text-gray-400 text-sm">
                      <th className="px-4 py-3">Tanggal</th>
                      <th className="px-4 py-3">No. Pesanan</th>
                      <th className="px-4 py-3">Resi</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Part Number</th>
                      <th className="px-4 py-3 text-center">Qty</th>
                      <th className="px-4 py-3 text-right">Harga</th>
                      <th className="px-4 py-3">Sumber</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {penjualanData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                          Belum ada data penjualan
                        </td>
                      </tr>
                    ) : (
                      penjualanData.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-700/30">
                          <td className="px-4 py-3 text-gray-300 text-sm">
                            {new Date(item.tanggal_jual).toLocaleDateString('id-ID')}
                          </td>
                          <td className="px-4 py-3 text-white font-mono text-sm">{item.no_pesanan || '-'}</td>
                          <td className="px-4 py-3 text-gray-300 font-mono text-sm">{item.resi_penjualan || '-'}</td>
                          <td className="px-4 py-3 text-gray-300 text-sm">{item.customer || '-'}</td>
                          <td className="px-4 py-3 text-yellow-400 font-mono text-sm">{item.part_number}</td>
                          <td className="px-4 py-3 text-center text-white text-sm">{item.qty_jual}</td>
                          <td className="px-4 py-3 text-right text-green-400 text-sm">{formatRupiah(item.harga_jual)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              item.source === 'CSV' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'
                            }`}>
                              {item.source}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Tab: Input */}
            {activeTab === 'input' && (
              <div className="p-6">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Plus className="text-yellow-400" />
                  Input KILAT Baru
                </h2>
                <p className="text-gray-400 text-sm mb-6">
                  Input barang yang dikirim ke gudang Shopee. Stock akan otomatis dikurangi.
                </p>
                
                <form onSubmit={handleInputSubmit} className="space-y-4 max-w-xl">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Resi Pengiriman (Opsional)</label>
                    <input
                      type="text"
                      value={inputForm.resi_kirim}
                      onChange={(e) => setInputForm(f => ({ ...f, resi_kirim: e.target.value }))}
                      placeholder="Resi ke gudang Shopee"
                      className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                    />
                  </div>
                  
                  <div className="relative">
                    <label className="block text-sm text-gray-400 mb-1">Part Number *</label>
                    <input
                      type="text"
                      value={inputForm.part_number}
                      onChange={(e) => {
                        setInputForm(f => ({ ...f, part_number: e.target.value }));
                        searchPartNumber(e.target.value);
                      }}
                      onFocus={() => inputForm.part_number && searchPartNumber(inputForm.part_number)}
                      placeholder="Cari part number..."
                      className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                      required
                    />
                    
                    {showPartDropdown && partSuggestions.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                        {partSuggestions.map((p) => (
                          <button
                            key={p.part_number}
                            type="button"
                            onClick={() => {
                              setInputForm(f => ({ ...f, part_number: p.part_number }));
                              setShowPartDropdown(false);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                          >
                            <div>
                              <div className="text-yellow-400 font-mono text-sm">{p.part_number}</div>
                              <div className="text-gray-400 text-xs truncate">{p.name}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-white text-sm">Stok: {p.quantity}</div>
                              <div className="text-gray-500 text-xs">{p.brand}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Qty *</label>
                      <input
                        type="number"
                        min="1"
                        value={inputForm.qty_kirim}
                        onChange={(e) => setInputForm(f => ({ ...f, qty_kirim: parseInt(e.target.value) || 1 }))}
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Sub Toko</label>
                      <select
                        value={inputForm.sub_toko}
                        onChange={(e) => setInputForm(f => ({ ...f, sub_toko: e.target.value }))}
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                      >
                        <option value="MJM">MJM</option>
                        <option value="BJW">BJW</option>
                        <option value="LARIS">LARIS</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={loading || !inputForm.part_number}
                      className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <RefreshCw size={18} className="animate-spin" />
                      ) : (
                        <Truck size={18} />
                      )}
                      KIRIM KE GUDANG SHOPEE
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Modal: Add Sale */}
      {showAddSaleModal && selectedKilatForSale && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Catat Penjualan</h3>
              <button
                onClick={() => {
                  setShowAddSaleModal(false);
                  setSelectedKilatForSale(null);
                }}
                className="p-1 hover:bg-gray-700 rounded"
              >
                <XCircle size={20} className="text-gray-400" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-yellow-400 font-mono">{selectedKilatForSale.part_number}</div>
                <div className="text-gray-400 text-sm">{selectedKilatForSale.nama_barang}</div>
                <div className="text-white text-sm mt-1">
                  Sisa: <span className="font-bold text-yellow-400">{selectedKilatForSale.qty_sisa}</span> pcs
                </div>
              </div>
              
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const formData = new FormData(form);
                  
                  const result = await addKilatPenjualanManual(currentStore, {
                    kilat_id: selectedKilatForSale.id,
                    customer: formData.get('customer') as string,
                    part_number: selectedKilatForSale.part_number,
                    qty_jual: parseInt(formData.get('qty') as string) || 1,
                    harga_jual: parseFloat(formData.get('harga') as string) || 0
                  });
                  
                  if (result.success) {
                    showToast(result.message, 'success');
                    setShowAddSaleModal(false);
                    setSelectedKilatForSale(null);
                    loadData();
                  } else {
                    showToast(result.message, 'error');
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Customer</label>
                  <input
                    type="text"
                    name="customer"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Qty</label>
                    <input
                      type="number"
                      name="qty"
                      min="1"
                      max={selectedKilatForSale.qty_sisa}
                      defaultValue="1"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Harga Total</label>
                    <input
                      type="number"
                      name="harga"
                      min="0"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                      required
                    />
                  </div>
                </div>
                
                <button
                  type="submit"
                  className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg"
                >
                  Simpan Penjualan
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KilatManagementView;
