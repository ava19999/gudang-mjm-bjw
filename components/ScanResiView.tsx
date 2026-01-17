// FILE: src/components/ScanResiView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Camera, Plus, Search, Filter, Download, Package, 
  Check, X, Edit2, Trash2, Eye, EyeOff, RefreshCw 
} from 'lucide-react';
import { OnlineOrderRow } from '../types';
import { 
  fetchScanResiData, 
  addScanResiEntry, 
  updateScanResiEntry, 
  deleteScanResiEntry,
  addProductVariation,
  exportScanResiData
} from '../services/supabaseService';
import { useStore } from '../context/StoreContext';

interface ScanResiViewProps {
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

type PackingStatus = 'all' | 'unpacked' | 'packed' | 'shipped';
type OrderType = 'all' | 'shopee' | 'tiktok' | 'reseller' | 'export' | 'online';

export const ScanResiView: React.FC<ScanResiViewProps> = ({ onRefresh, showToast }) => {
  const { selectedStore, userName } = useStore();
  
  // State Management
  const [resiData, setResiData] = useState<OnlineOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  
  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [packingStatusFilter, setPackingStatusFilter] = useState<PackingStatus>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderType>('all');
  const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({ start: '', end: '' });
  
  // Manual Input Form
  const [manualForm, setManualForm] = useState<Partial<OnlineOrderRow>>({
    resi: '',
    customer: '',
    nama_barang: '',
    part_number: '',
    quantity: 1,
    harga_satuan: 0,
    harga_total: 0,
    order_type: 'shopee',
    target_country: 'Indonesia'
  });
  
  // Edit State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<OnlineOrderRow>>({});

  // Scanning State (placeholder for camera integration)
  const [scannedCode, setScannedCode] = useState('');

  // Load Data
  useEffect(() => {
    loadResiData();
  }, [selectedStore]);

  const loadResiData = async () => {
    setLoading(true);
    try {
      const data = await fetchScanResiData(selectedStore);
      setResiData(data);
    } catch (error) {
      console.error('Error loading resi data:', error);
      showToast('Gagal memuat data resi', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Filter & Search Logic
  const filteredData = useMemo(() => {
    let result = resiData;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.resi?.toLowerCase().includes(query) ||
        item.customer?.toLowerCase().includes(query) ||
        item.nama_barang?.toLowerCase().includes(query) ||
        item.part_number?.toLowerCase().includes(query)
      );
    }

    // Packing status filter
    if (packingStatusFilter !== 'all') {
      result = result.filter(item => item.status_packing === packingStatusFilter);
    }

    // Order type filter
    if (orderTypeFilter !== 'all') {
      result = result.filter(item => item.order_type === orderTypeFilter);
    }

    // Date filter
    if (dateFilter.start) {
      result = result.filter(item => item.tanggal >= dateFilter.start);
    }
    if (dateFilter.end) {
      result = result.filter(item => item.tanggal <= dateFilter.end);
    }

    return result;
  }, [resiData, searchQuery, packingStatusFilter, orderTypeFilter, dateFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = resiData.length;
    const unpacked = resiData.filter(i => i.status_packing === 'unpacked').length;
    const packed = resiData.filter(i => i.status_packing === 'packed').length;
    const shipped = resiData.filter(i => i.status_packing === 'shipped').length;
    const totalRevenue = resiData.reduce((sum, i) => sum + (i.harga_total || 0), 0);
    const todayCount = resiData.filter(i => {
      const today = new Date().toISOString().split('T')[0];
      return i.tanggal === today;
    }).length;

    return { total, unpacked, packed, shipped, totalRevenue, todayCount };
  }, [resiData]);

  // Handle Manual Input Submit
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!manualForm.resi) {
      showToast('Resi number wajib diisi', 'error');
      return;
    }

    setLoading(true);
    const result = await addScanResiEntry(
      {
        ...manualForm,
        harga_total: (manualForm.quantity || 1) * (manualForm.harga_satuan || 0)
      },
      selectedStore,
      userName || 'Admin'
    );
    
    if (result.success) {
      showToast(result.msg);
      setShowManualInput(false);
      setManualForm({
        resi: '',
        customer: '',
        nama_barang: '',
        part_number: '',
        quantity: 1,
        harga_satuan: 0,
        harga_total: 0,
        order_type: 'shopee',
        target_country: 'Indonesia'
      });
      await loadResiData();
    } else {
      showToast(result.msg, 'error');
    }
    setLoading(false);
  };

  // Handle Scanner Code
  const handleScannerCode = async (code: string) => {
    setScannedCode(code);
    setManualForm({ ...manualForm, resi: code });
    setShowScanner(false);
    setShowManualInput(true);
  };

  // Handle Edit
  const startEdit = (item: OnlineOrderRow) => {
    setEditingId(item.id);
    setEditForm(item);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id: number) => {
    setLoading(true);
    const result = await updateScanResiEntry(id, editForm, selectedStore);
    
    if (result.success) {
      showToast(result.msg);
      setEditingId(null);
      setEditForm({});
      await loadResiData();
    } else {
      showToast(result.msg, 'error');
    }
    setLoading(false);
  };

  // Handle Delete
  const handleDelete = async (id: number, resi: string) => {
    if (!confirm(`Hapus resi ${resi}?`)) return;
    
    setLoading(true);
    const result = await deleteScanResiEntry(id, selectedStore);
    
    if (result.success) {
      showToast(result.msg);
      await loadResiData();
    } else {
      showToast(result.msg, 'error');
    }
    setLoading(false);
  };

  // Handle Add Variation
  const handleAddVariation = async (item: OnlineOrderRow) => {
    setLoading(true);
    const result = await addProductVariation(item, selectedStore, userName || 'Admin');
    
    if (result.success) {
      showToast(result.msg);
      await loadResiData();
    } else {
      showToast(result.msg, 'error');
    }
    setLoading(false);
  };

  // Handle Update Packing Status
  const updatePackingStatus = async (id: number, status: 'unpacked' | 'packed' | 'shipped') => {
    setLoading(true);
    const result = await updateScanResiEntry(id, { status_packing: status }, selectedStore);
    
    if (result.success) {
      showToast(`Status diubah ke ${status}`);
      await loadResiData();
    } else {
      showToast(result.msg, 'error');
    }
    setLoading(false);
  };

  // Handle Export
  const handleExport = async (format: 'shopee' | 'tiktok') => {
    setLoading(true);
    const result = await exportScanResiData(selectedStore, format, {
      startDate: dateFilter.start,
      endDate: dateFilter.end,
      status_packing: packingStatusFilter !== 'all' ? packingStatusFilter : undefined,
      order_type: orderTypeFilter !== 'all' ? orderTypeFilter : undefined
    });
    
    if (result.success && result.data) {
      // Convert to CSV and download
      const headers = Object.keys(result.data[0] || {});
      const csvContent = [
        headers.join(','),
        ...result.data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export-${format}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      showToast(`Export ${format.toUpperCase()} berhasil`);
    } else {
      showToast(result.msg, 'error');
    }
    setLoading(false);
  };

  // Get status color
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'unpacked': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'packed': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'shipped': return 'bg-green-500/20 text-green-300 border-green-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const getOrderTypeColor = (type?: string) => {
    switch (type) {
      case 'shopee': return 'bg-orange-500/20 text-orange-300';
      case 'tiktok': return 'bg-pink-500/20 text-pink-300';
      case 'reseller': return 'bg-purple-500/20 text-purple-300';
      case 'export': return 'bg-cyan-500/20 text-cyan-300';
      default: return 'bg-gray-500/20 text-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-2 md:p-4 pb-20 md:pb-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-100 mb-1 flex items-center gap-2">
          <Package className="text-blue-400" size={28} />
          Scan Resi & Packing
        </h1>
        <p className="text-sm text-gray-400">Kelola data pesanan dan packing</p>
      </div>

      {/* Statistics Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
          <div className="text-xs text-gray-400 mb-1">Total Resi</div>
          <div className="text-xl font-bold text-gray-100">{stats.total}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 border border-red-500/30">
          <div className="text-xs text-red-400 mb-1">Unpacked</div>
          <div className="text-xl font-bold text-red-300">{stats.unpacked}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 border border-blue-500/30">
          <div className="text-xs text-blue-400 mb-1">Packed</div>
          <div className="text-xl font-bold text-blue-300">{stats.packed}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 border border-green-500/30">
          <div className="text-xs text-green-400 mb-1">Shipped</div>
          <div className="text-xl font-bold text-green-300">{stats.shipped}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 border border-yellow-500/30">
          <div className="text-xs text-yellow-400 mb-1">Hari Ini</div>
          <div className="text-xl font-bold text-yellow-300">{stats.todayCount}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 border border-purple-500/30">
          <div className="text-xs text-purple-400 mb-1">Total Revenue</div>
          <div className="text-lg font-bold text-purple-300">
            Rp {(stats.totalRevenue / 1000000).toFixed(1)}M
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setShowScanner(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Camera size={18} />
          Scan Barcode
        </button>
        <button
          onClick={() => setShowManualInput(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
        >
          <Plus size={18} />
          Input Manual
        </button>
        <button
          onClick={() => handleExport('shopee')}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
        >
          <Download size={18} />
          Export Shopee
        </button>
        <button
          onClick={() => handleExport('tiktok')}
          className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
        >
          <Download size={18} />
          Export TikTok
        </button>
        <button
          onClick={loadResiData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4 border border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={18} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-300">Filter & Pencarian</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              placeholder="Cari Resi, Customer, Barang..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Packing Status Filter */}
          <select
            value={packingStatusFilter}
            onChange={(e) => setPackingStatusFilter(e.target.value as PackingStatus)}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="all">Semua Status</option>
            <option value="unpacked">Unpacked</option>
            <option value="packed">Packed</option>
            <option value="shipped">Shipped</option>
          </select>

          {/* Order Type Filter */}
          <select
            value={orderTypeFilter}
            onChange={(e) => setOrderTypeFilter(e.target.value as OrderType)}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="all">Semua Kategori</option>
            <option value="shopee">Shopee</option>
            <option value="tiktok">TikTok</option>
            <option value="reseller">Reseller</option>
            <option value="export">Export</option>
            <option value="online">Online</option>
          </select>

          {/* Date Filters */}
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFilter.start}
              onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              type="date"
              value={dateFilter.end}
              onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          Menampilkan {filteredData.length} dari {resiData.length} data
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400">Resi</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400">Customer</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400">Barang</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-400">Qty</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-400">Harga</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-400">Kategori</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-400">Status</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                    {loading ? 'Memuat data...' : 'Tidak ada data resi'}
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-700/30 transition-colors">
                    {/* Resi (Locked) */}
                    <td className="px-3 py-3">
                      <div className="text-sm font-mono text-blue-400">
                        {item.resi}
                        {item.is_variation && (
                          <span className="ml-2 text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">
                            VAR
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{item.tanggal}</div>
                    </td>

                    {/* Customer (Editable) */}
                    <td className="px-3 py-3">
                      {editingId === item.id ? (
                        <input
                          type="text"
                          value={editForm.customer || ''}
                          onChange={(e) => setEditForm({ ...editForm, customer: e.target.value })}
                          className="w-full px-2 py-1 bg-gray-900 border border-blue-500 rounded text-sm text-gray-300"
                        />
                      ) : (
                        <div className="text-sm text-gray-300">{item.customer}</div>
                      )}
                    </td>

                    {/* Barang (Editable) */}
                    <td className="px-3 py-3">
                      {editingId === item.id ? (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={editForm.nama_barang || ''}
                            onChange={(e) => setEditForm({ ...editForm, nama_barang: e.target.value })}
                            className="w-full px-2 py-1 bg-gray-900 border border-blue-500 rounded text-sm text-gray-300"
                            placeholder="Nama Barang"
                          />
                          <input
                            type="text"
                            value={editForm.part_number || ''}
                            onChange={(e) => setEditForm({ ...editForm, part_number: e.target.value })}
                            className="w-full px-2 py-1 bg-gray-900 border border-blue-500 rounded text-xs text-gray-400"
                            placeholder="Part Number"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="text-sm text-gray-300">{item.nama_barang}</div>
                          {item.part_number && (
                            <div className="text-xs text-gray-500 font-mono">{item.part_number}</div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Quantity (Editable) */}
                    <td className="px-3 py-3 text-center">
                      {editingId === item.id ? (
                        <input
                          type="number"
                          value={editForm.quantity || 0}
                          onChange={(e) => setEditForm({ 
                            ...editForm, 
                            quantity: parseInt(e.target.value) || 0,
                            harga_total: (parseInt(e.target.value) || 0) * (editForm.harga_satuan || 0)
                          })}
                          className="w-16 px-2 py-1 bg-gray-900 border border-blue-500 rounded text-sm text-gray-300 text-center"
                        />
                      ) : (
                        <div className="text-sm font-semibold text-gray-300">{item.quantity}</div>
                      )}
                    </td>

                    {/* Price (Editable) */}
                    <td className="px-3 py-3 text-right">
                      {editingId === item.id ? (
                        <div className="space-y-1">
                          <input
                            type="number"
                            value={editForm.harga_satuan || 0}
                            onChange={(e) => setEditForm({ 
                              ...editForm, 
                              harga_satuan: parseInt(e.target.value) || 0,
                              harga_total: (editForm.quantity || 0) * (parseInt(e.target.value) || 0)
                            })}
                            className="w-24 px-2 py-1 bg-gray-900 border border-blue-500 rounded text-sm text-gray-300 text-right"
                            placeholder="Satuan"
                          />
                          <div className="text-xs text-gray-500">
                            Total: {((editForm.quantity || 0) * (editForm.harga_satuan || 0)).toLocaleString('id-ID')}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-sm text-gray-400">
                            Rp {item.harga_satuan?.toLocaleString('id-ID')}
                          </div>
                          <div className="text-xs font-bold text-green-400">
                            Rp {item.harga_total?.toLocaleString('id-ID')}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Order Type */}
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full ${getOrderTypeColor(item.order_type)}`}>
                        {item.order_type?.toUpperCase()}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 text-center">
                      {editingId === item.id ? (
                        <select
                          value={editForm.status_packing || 'unpacked'}
                          onChange={(e) => setEditForm({ ...editForm, status_packing: e.target.value as any })}
                          className="px-2 py-1 bg-gray-900 border border-blue-500 rounded text-xs text-gray-300"
                        >
                          <option value="unpacked">Unpacked</option>
                          <option value="packed">Packed</option>
                          <option value="shipped">Shipped</option>
                        </select>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(item.status_packing)}`}>
                            {item.status_packing || 'unpacked'}
                          </span>
                          {item.status_packing === 'unpacked' && (
                            <button
                              onClick={() => updatePackingStatus(item.id, 'packed')}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              Mark Packed
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {editingId === item.id ? (
                          <>
                            <button
                              onClick={() => saveEdit(item.id)}
                              className="p-1.5 bg-green-600 hover:bg-green-700 rounded text-white transition-colors"
                              title="Simpan"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 bg-red-600 hover:bg-red-700 rounded text-white transition-colors"
                              title="Batal"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(item)}
                              className="p-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleAddVariation(item)}
                              className="p-1.5 bg-purple-600 hover:bg-purple-700 rounded text-white transition-colors"
                              title="Tambah Variasi"
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, item.resi)}
                              className="p-1.5 bg-red-600 hover:bg-red-700 rounded text-white transition-colors"
                              title="Hapus"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Input Modal */}
      {showManualInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700">
            <div className="sticky top-0 bg-gray-900 p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-100">Input Resi Manual</h2>
              <button
                onClick={() => setShowManualInput(false)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleManualSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Resi Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={manualForm.resi || ''}
                    onChange={(e) => setManualForm({ ...manualForm, resi: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 focus:border-blue-500 focus:outline-none"
                    placeholder="RESI123456"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Customer</label>
                  <input
                    type="text"
                    value={manualForm.customer || ''}
                    onChange={(e) => setManualForm({ ...manualForm, customer: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 focus:border-blue-500 focus:outline-none"
                    placeholder="Nama Customer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Nama Barang</label>
                  <input
                    type="text"
                    value={manualForm.nama_barang || ''}
                    onChange={(e) => setManualForm({ ...manualForm, nama_barang: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 focus:border-blue-500 focus:outline-none"
                    placeholder="Nama Barang"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Part Number</label>
                  <input
                    type="text"
                    value={manualForm.part_number || ''}
                    onChange={(e) => setManualForm({ ...manualForm, part_number: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 focus:border-blue-500 focus:outline-none"
                    placeholder="PART123"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Quantity</label>
                  <input
                    type="number"
                    value={manualForm.quantity || 1}
                    onChange={(e) => setManualForm({ 
                      ...manualForm, 
                      quantity: parseInt(e.target.value) || 1,
                      harga_total: (parseInt(e.target.value) || 1) * (manualForm.harga_satuan || 0)
                    })}
                    min="1"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Harga Satuan</label>
                  <input
                    type="number"
                    value={manualForm.harga_satuan || 0}
                    onChange={(e) => setManualForm({ 
                      ...manualForm, 
                      harga_satuan: parseInt(e.target.value) || 0,
                      harga_total: (manualForm.quantity || 1) * (parseInt(e.target.value) || 0)
                    })}
                    min="0"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Kategori</label>
                  <select
                    value={manualForm.order_type || 'shopee'}
                    onChange={(e) => setManualForm({ ...manualForm, order_type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="shopee">Shopee</option>
                    <option value="tiktok">TikTok</option>
                    <option value="reseller">Reseller</option>
                    <option value="export">Export</option>
                    <option value="online">Online</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Target Country</label>
                  <input
                    type="text"
                    value={manualForm.target_country || 'Indonesia'}
                    onChange={(e) => setManualForm({ ...manualForm, target_country: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <div className="text-sm text-gray-400">Total Harga:</div>
                <div className="text-xl font-bold text-green-400">
                  Rp {((manualForm.quantity || 1) * (manualForm.harga_satuan || 0)).toLocaleString('id-ID')}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {loading ? 'Menyimpan...' : 'Simpan Resi'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualInput(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scanner Modal (Placeholder - will need proper camera integration) */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-md p-6 border border-gray-700 text-center">
            <Camera size={48} className="mx-auto mb-4 text-blue-400" />
            <h2 className="text-xl font-bold text-gray-100 mb-2">Barcode Scanner</h2>
            <p className="text-sm text-gray-400 mb-4">
              Camera integration coming soon. Use manual input for now.
            </p>
            
            {/* Temporary: Manual code input */}
            <input
              type="text"
              placeholder="Or enter barcode manually"
              value={scannedCode}
              onChange={(e) => setScannedCode(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && scannedCode) {
                  handleScannerCode(scannedCode);
                }
              }}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 mb-4 focus:border-blue-500 focus:outline-none"
            />
            
            <div className="flex gap-2">
              <button
                onClick={() => scannedCode && handleScannerCode(scannedCode)}
                disabled={!scannedCode}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                Gunakan Code
              </button>
              <button
                onClick={() => {
                  setShowScanner(false);
                  setScannedCode('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
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
