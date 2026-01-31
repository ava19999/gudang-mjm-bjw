// FILE: components/scanResi/ResellerView.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../context/StoreContext';
import { ResellerMaster, InventoryItem } from '../../types';
import { 
  Users, Plus, Trash2, Search, RefreshCw, ChevronLeft, ChevronRight, 
  Package, DollarSign, TrendingUp, Calendar, Loader2, X, Check, Edit2, Save
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
  const [resellers, setResellers] = useState<ResellerMaster[]>([]);
  const [transactions, setTransactions] = useState<ResellerTransaction[]>([]);
  const [stats, setStats] = useState<ResellerStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  
  // Filter & Pagination
  const [searchReseller, setSearchReseller] = useState('');
  const [selectedReseller, setSelectedReseller] = useState<string>('');
  const [page, setPage] = useState(1);
  const perPage = 50;
  
  // History Modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyReseller, setHistoryReseller] = useState<string>('');
  
  // New Reseller
  const [newResellerName, setNewResellerName] = useState('');
  const [addingReseller, setAddingReseller] = useState(false);
  
  // Edit Reseller
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  
  // Add Transaction Modal
  const [showAddTrx, setShowAddTrx] = useState(false);
  const [trxReseller, setTrxReseller] = useState('');
  const [trxCustomer, setTrxCustomer] = useState('');
  const [trxItems, setTrxItems] = useState<{ partNumber: string; name: string; qty: number; price: number }[]>([]);
  const [trxResi, setTrxResi] = useState('');
  const [submittingTrx, setSubmittingTrx] = useState(false);
  
  // Item search
  const [itemSearch, setItemSearch] = useState('');
  const [itemSuggestions, setItemSuggestions] = useState<InventoryItem[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);
  
  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch Resellers
  const fetchResellers = async () => {
    try {
      const { data, error } = await supabase
        .from('reseller_master')
        .select('*')
        .order('nama_reseller', { ascending: true });
      
      if (error) throw error;
      setResellers(data || []);
    } catch (err) {
      console.error('Fetch resellers error:', err);
    }
  };

  // Fetch Reseller Transactions
  const fetchTransactions = async () => {
    if (!selectedStore) return;
    
    const table = selectedStore === 'mjm' ? 'barang_keluar_mjm' : 'barang_keluar_bjw';
    
    try {
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
      setTransactions(data || []);
    } catch (err) {
      console.error('Fetch transactions error:', err);
    }
  };

  // Fetch Stats per Reseller
  const fetchStats = async () => {
    if (!selectedStore) return;
    
    const table = selectedStore === 'mjm' ? 'barang_keluar_mjm' : 'barang_keluar_bjw';
    
    try {
      const { data, error } = await supabase
        .from(table)
        .select('kode_toko, qty_keluar, harga_total')
        .eq('ecommerce', 'RESELLER');
      
      if (error) throw error;
      
      // Group by kode_toko (reseller name)
      const statsMap: Record<string, ResellerStats> = {};
      (data || []).forEach(row => {
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
    Promise.all([fetchResellers(), fetchTransactions(), fetchStats()])
      .finally(() => setLoading(false));
  }, [selectedStore, refreshTrigger]);

  // Refetch when reseller filter changes
  useEffect(() => {
    fetchTransactions();
  }, [selectedReseller]);

  // Add Reseller
  const handleAddReseller = async () => {
    if (!newResellerName.trim()) return;
    
    setAddingReseller(true);
    try {
      const { error } = await supabase
        .from('reseller_master')
        .insert({ nama_reseller: newResellerName.trim().toUpperCase() });
      
      if (error) throw error;
      
      setNewResellerName('');
      await fetchResellers();
      showToast('Reseller berhasil ditambahkan', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menambah reseller', 'error');
    } finally {
      setAddingReseller(false);
    }
  };

  // Delete Reseller
  const handleDeleteReseller = async (id: number) => {
    if (!confirm('Yakin hapus reseller ini?')) return;
    
    try {
      const { error } = await supabase
        .from('reseller_master')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      await fetchResellers();
      showToast('Reseller berhasil dihapus', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus reseller', 'error');
    }
  };

  // Edit Reseller
  const handleSaveEdit = async (id: number) => {
    if (!editName.trim()) return;
    
    try {
      const { error } = await supabase
        .from('reseller_master')
        .update({ nama_reseller: editName.trim().toUpperCase() })
        .eq('id', id);
      
      if (error) throw error;
      
      setEditingId(null);
      setEditName('');
      await fetchResellers();
      showToast('Reseller berhasil diupdate', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal update reseller', 'error');
    }
  };

  // Search Items for Transaction
  const searchItems = async (query: string) => {
    if (!query.trim() || !selectedStore) {
      setItemSuggestions([]);
      return;
    }
    
    setSearchingItems(true);
    const table = selectedStore === 'mjm' ? 'base_mjm' : 'base_bjw';
    
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .or(`part_number.ilike.%${query}%,name.ilike.%${query}%`)
        .limit(10);
      
      if (error) throw error;
      setItemSuggestions(data || []);
    } catch (err) {
      console.error('Search items error:', err);
    } finally {
      setSearchingItems(false);
    }
  };

  // Add item to transaction
  const addItemToTrx = (item: InventoryItem) => {
    const exists = trxItems.find(i => i.partNumber === item.partNumber);
    if (exists) {
      showToast('Item sudah ada di daftar', 'error');
      return;
    }
    
    setTrxItems(prev => [...prev, {
      partNumber: item.partNumber,
      name: item.name,
      qty: 1,
      price: item.price
    }]);
    setItemSearch('');
    setItemSuggestions([]);
  };

  // Remove item from transaction
  const removeItemFromTrx = (partNumber: string) => {
    setTrxItems(prev => prev.filter(i => i.partNumber !== partNumber));
  };

  // Update item qty/price
  const updateTrxItem = (partNumber: string, field: 'qty' | 'price', value: number) => {
    setTrxItems(prev => prev.map(i => 
      i.partNumber === partNumber ? { ...i, [field]: value } : i
    ));
  };

  // Submit Transaction
  const handleSubmitTransaction = async () => {
    if (!trxReseller.trim()) {
      showToast('Pilih reseller', 'error');
      return;
    }
    if (trxItems.length === 0) {
      showToast('Tambahkan minimal 1 item', 'error');
      return;
    }
    if (!selectedStore) return;
    
    setSubmittingTrx(true);
    const table = selectedStore === 'mjm' ? 'barang_keluar_mjm' : 'barang_keluar_bjw';
    const stockTable = selectedStore === 'mjm' ? 'base_mjm' : 'base_bjw';
    
    try {
      // Generate resi if not provided
      const resi = trxResi.trim() || `RSL-${Date.now()}`;
      
      for (const item of trxItems) {
        // Get current stock
        const { data: stockData } = await supabase
          .from(stockTable)
          .select('quantity')
          .eq('part_number', item.partNumber)
          .single();
        
        const currentStock = stockData?.quantity ?? 0;
        const newStock = Math.max(0, currentStock - item.qty);
        
        // Insert to barang_keluar
        const { error: insertError } = await supabase
          .from(table)
          .insert({
            part_number: item.partNumber,
            name: item.name,
            qty_keluar: item.qty,
            harga_satuan: item.price,
            harga_total: item.qty * item.price,
            customer: trxCustomer.trim().toUpperCase() || '-',
            resi: resi,
            ecommerce: 'RESELLER',
            kode_toko: trxReseller.toUpperCase(),
            tempo: '-',
            stock_ahir: newStock
          });
        
        if (insertError) throw insertError;
        
        // Update stock
        const { error: updateError } = await supabase
          .from(stockTable)
          .update({ quantity: newStock })
          .eq('part_number', item.partNumber);
        
        if (updateError) throw updateError;
      }
      
      showToast('Transaksi berhasil disimpan', 'success');
      setShowAddTrx(false);
      setTrxReseller('');
      setTrxCustomer('');
      setTrxItems([]);
      setTrxResi('');
      
      // Refresh data
      await Promise.all([fetchTransactions(), fetchStats()]);
      onRefresh?.();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan transaksi', 'error');
    } finally {
      setSubmittingTrx(false);
    }
  };

  // Toast helper
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Filtered resellers
  const filteredResellers = useMemo(() => {
    if (!searchReseller.trim()) return resellers;
    return resellers.filter(r => 
      r.nama_reseller.toLowerCase().includes(searchReseller.toLowerCase())
    );
  }, [resellers, searchReseller]);

  // Paginated transactions
  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * perPage;
    return transactions.slice(start, start + perPage);
  }, [transactions, page]);

  const totalPages = Math.ceil(transactions.length / perPage) || 1;

  // Total transaksi value
  const trxTotal = trxItems.reduce((sum, item) => sum + (item.qty * item.price), 0);

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
          
          <button
            onClick={() => setShowAddTrx(true)}
            className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Plus size={18} />
            Tambah Transaksi
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Total Reseller</div>
            <div className="text-2xl font-bold text-white">{resellers.length}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Total Transaksi</div>
            <div className="text-2xl font-bold text-blue-400">{transactions.length}</div>
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

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              activeTab === 'list' 
                ? 'bg-pink-600 text-white' 
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Daftar Reseller
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              activeTab === 'add' 
                ? 'bg-pink-600 text-white' 
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Tambah Reseller
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-pink-400" size={32} />
            </div>
          ) : (
            <>
              {/* Daftar Reseller */}
              {activeTab === 'list' && (
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

              {/* Tambah Reseller */}
              {activeTab === 'add' && (
                <div className="p-4">
                  {/* Add new reseller */}
                  <div className="flex gap-3 mb-6">
                    <input
                      type="text"
                      value={newResellerName}
                      onChange={(e) => setNewResellerName(e.target.value)}
                      placeholder="Nama reseller baru..."
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-pink-500 outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddReseller()}
                    />
                    <button
                      onClick={handleAddReseller}
                      disabled={addingReseller || !newResellerName.trim()}
                      className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
                    >
                      {addingReseller ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                      Tambah
                    </button>
                  </div>

                  {/* Search */}
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                      <input
                        type="text"
                        value={searchReseller}
                        onChange={(e) => setSearchReseller(e.target.value)}
                        placeholder="Cari reseller..."
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-3 py-2 text-white focus:border-pink-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Reseller List */}
                  <div className="space-y-2">
                    {filteredResellers.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">Tidak ada reseller</div>
                    ) : (
                      filteredResellers.map(r => (
                        <div key={r.id} className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-3 border border-gray-700">
                          {editingId === r.id ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white mr-2"
                              autoFocus
                            />
                          ) : (
                            <span className="text-white font-medium">{r.nama_reseller}</span>
                          )}
                          
                          <div className="flex items-center gap-2">
                            {editingId === r.id ? (
                              <>
                                <button
                                  onClick={() => handleSaveEdit(r.id)}
                                  className="p-1.5 text-green-400 hover:bg-green-900/30 rounded"
                                >
                                  <Save size={16} />
                                </button>
                                <button
                                  onClick={() => { setEditingId(null); setEditName(''); }}
                                  className="p-1.5 text-gray-400 hover:bg-gray-700 rounded"
                                >
                                  <X size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => { setEditingId(r.id); setEditName(r.nama_reseller); }}
                                  className="p-1.5 text-blue-400 hover:bg-blue-900/30 rounded"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteReseller(r.id)}
                                  className="p-1.5 text-red-400 hover:bg-red-900/30 rounded"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Transaction Modal */}
      {showAddTrx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-700 shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Tambah Transaksi Reseller</h3>
              <button onClick={() => setShowAddTrx(false)} className="p-1 hover:bg-gray-700 rounded">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              {/* Reseller */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Reseller (Sub Toko)</label>
                <select
                  value={trxReseller}
                  onChange={(e) => setTrxReseller(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-pink-500 outline-none"
                >
                  <option value="">Pilih Reseller...</option>
                  {resellers.map(r => (
                    <option key={r.id} value={r.nama_reseller}>{r.nama_reseller}</option>
                  ))}
                </select>
              </div>

              {/* Customer */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Customer (Nama Pembeli)</label>
                <input
                  type="text"
                  value={trxCustomer}
                  onChange={(e) => setTrxCustomer(e.target.value)}
                  placeholder="Nama customer..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-pink-500 outline-none"
                />
              </div>

              {/* Resi */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Resi (Opsional)</label>
                <input
                  type="text"
                  value={trxResi}
                  onChange={(e) => setTrxResi(e.target.value)}
                  placeholder="Kosongkan untuk auto-generate"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-pink-500 outline-none"
                />
              </div>

              {/* Item Search */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tambah Item</label>
                <div className="relative">
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => { setItemSearch(e.target.value); searchItems(e.target.value); }}
                    placeholder="Cari part number atau nama..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-pink-500 outline-none"
                  />
                  {searchingItems && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-500" size={16} />
                  )}
                  
                  {/* Suggestions */}
                  {itemSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                      {itemSuggestions.map((item: any) => (
                        <button
                          key={item.id}
                          onClick={() => addItemToTrx(item)}
                          className="w-full px-3 py-2 text-left hover:bg-gray-800 flex justify-between items-center border-b border-gray-700/50 last:border-0"
                        >
                          <div>
                            <div className="text-white text-sm">{item.name}</div>
                            <div className="text-gray-500 text-xs font-mono">{item.part_number}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-green-400 text-sm">{formatCompactNumber(item.price)}</div>
                            <div className="text-gray-500 text-xs">Stok: {item.quantity}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Items List */}
              {trxItems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Item Transaksi</label>
                  <div className="space-y-2">
                    {trxItems.map((item, idx) => (
                      <div key={item.partNumber} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="text-white text-sm font-medium">{item.name}</div>
                            <div className="text-gray-500 text-xs font-mono">{item.partNumber}</div>
                          </div>
                          <button
                            onClick={() => removeItemFromTrx(item.partNumber)}
                            className="p-1 text-red-400 hover:bg-red-900/30 rounded"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-gray-500">Qty</label>
                            <input
                              type="number"
                              value={item.qty}
                              onChange={(e) => updateTrxItem(item.partNumber, 'qty', parseInt(e.target.value) || 1)}
                              min="1"
                              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-gray-500">Harga</label>
                            <input
                              type="number"
                              value={item.price}
                              onChange={(e) => updateTrxItem(item.partNumber, 'price', parseInt(e.target.value) || 0)}
                              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-gray-500">Subtotal</label>
                            <div className="py-1 text-green-400 font-medium">
                              {formatCompactNumber(item.qty * item.price)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex justify-between items-center">
              <div className="text-lg font-bold text-white">
                Total: <span className="text-green-400">{formatCompactNumber(trxTotal)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddTrx(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                >
                  Batal
                </button>
                <button
                  onClick={handleSubmitTransaction}
                  disabled={submittingTrx || !trxReseller || trxItems.length === 0}
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
                >
                  {submittingTrx ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                  Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                      <td colSpan={8} className="text-center py-12 text-gray-500">
                        Belum ada transaksi untuk reseller ini
                      </td>
                    </tr>
                  ) : (
                    paginatedTransactions.map((trx, idx) => (
                      <tr key={trx.id || idx} className="border-b border-gray-700/50 hover:bg-gray-700/30">
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
