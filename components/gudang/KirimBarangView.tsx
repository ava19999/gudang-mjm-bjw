// FILE: src/components/gudang/KirimBarangView.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Package, ArrowRightLeft, Plus, Send, Check, X,
  Truck, ChevronDown, ChevronUp, AlertCircle, RefreshCw,
  Filter, Building2, Minus
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import {
  KirimBarangItem,
  StockItem,
  fetchKirimBarang,
  createKirimBarangRequest,
  approveKirimBarang,
  sendKirimBarang,
  receiveKirimBarang,
  rejectKirimBarang,
  deleteKirimBarang,
  searchItemsBothStores
} from '../../services/kirimBarangService';

type ViewMode = 'stock_comparison' | 'request_list';
type FilterType = 'all' | 'incoming' | 'outgoing' | 'pending' | 'completed';

// Extended stock item with request quantity
interface StockItemWithRequest extends StockItem {
  requestQty: number;
  catatan: string;
}

export const KirimBarangView: React.FC = () => {
  const { selectedStore, userName } = useStore();
  const currentStore = selectedStore as 'mjm' | 'bjw';

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('stock_comparison');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ mjm: StockItemWithRequest[]; bjw: StockItemWithRequest[] }>({ mjm: [], bjw: [] });
  const [requests, setRequests] = useState<KirimBarangItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; show: boolean; reason: string }>({
    id: '',
    show: false,
    reason: ''
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [sendingItem, setSendingItem] = useState<string | null>(null);

  // Toast helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load requests
  const loadRequests = useCallback(async () => {
    setLoading(true);
    const data = await fetchKirimBarang(currentStore, filter);
    setRequests(data);
    setLoading(false);
  }, [currentStore, filter]);

  useEffect(() => {
    if (viewMode === 'request_list') {
      loadRequests();
    }
  }, [viewMode, loadRequests]);

  // Search items
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults({ mjm: [], bjw: [] });
      return;
    }
    setLoading(true);
    const results = await searchItemsBothStores(searchQuery);
    // Add requestQty field to each item
    setSearchResults({
      mjm: results.mjm.map(item => ({ ...item, requestQty: 0, catatan: '' })),
      bjw: results.bjw.map(item => ({ ...item, requestQty: 0, catatan: '' }))
    });
    setLoading(false);
  };

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (searchQuery.length >= 2) {
        handleSearch();
      } else if (searchQuery.length === 0) {
        setSearchResults({ mjm: [], bjw: [] });
      }
    }, 500);
    return () => clearTimeout(delaySearch);
  }, [searchQuery]);

  // Update request quantity for an item
  const updateRequestQty = (store: 'mjm' | 'bjw', partNumber: string, qty: number) => {
    setSearchResults(prev => ({
      ...prev,
      [store]: prev[store].map(item =>
        item.part_number === partNumber ? { ...item, requestQty: Math.max(0, qty) } : item
      )
    }));
  };

  // Update catatan for an item
  const updateCatatan = (store: 'mjm' | 'bjw', partNumber: string, catatan: string) => {
    setSearchResults(prev => ({
      ...prev,
      [store]: prev[store].map(item =>
        item.part_number === partNumber ? { ...item, catatan } : item
      )
    }));
  };

  // Send request for a single item
  const handleSendRequest = async (item: StockItemWithRequest, fromStore: 'mjm' | 'bjw') => {
    if (item.requestQty <= 0) {
      showToast('Masukkan quantity yang akan diminta', 'error');
      return;
    }

    setSendingItem(item.part_number);
    const toStore = fromStore === 'mjm' ? 'bjw' : 'mjm';
    
    const result = await createKirimBarangRequest({
      from_store: fromStore,
      to_store: toStore,
      part_number: item.part_number,
      nama_barang: item.name,
      brand: item.brand,
      application: item.application,
      quantity: item.requestQty,
      catatan: item.catatan,
      requested_by: userName
    });

    if (result.success) {
      showToast(`Request ${item.part_number} berhasil! Qty: ${item.requestQty}`);
      // Reset the qty after successful request
      updateRequestQty(fromStore, item.part_number, 0);
      updateCatatan(fromStore, item.part_number, '');
    } else {
      showToast(result.error || 'Gagal membuat request', 'error');
    }
    setSendingItem(null);
  };

  // Action handlers for request list
  const handleApprove = async (id: string) => {
    setLoading(true);
    const result = await approveKirimBarang(id, userName);
    if (result.success) {
      showToast('Request disetujui!');
      loadRequests();
    } else {
      showToast(result.error || 'Gagal menyetujui', 'error');
    }
    setLoading(false);
  };

  const handleSend = async (id: string) => {
    setLoading(true);
    const result = await sendKirimBarang(id, userName);
    if (result.success) {
      showToast('Barang sudah dikirim! Stok sudah dikurangi.');
      loadRequests();
    } else {
      showToast(result.error || 'Gagal mengirim', 'error');
    }
    setLoading(false);
  };

  const handleReceive = async (id: string) => {
    setLoading(true);
    const result = await receiveKirimBarang(id, userName);
    if (result.success) {
      showToast('Barang diterima! Stok sudah ditambahkan.');
      loadRequests();
    } else {
      showToast(result.error || 'Gagal menerima', 'error');
    }
    setLoading(false);
  };

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) {
      showToast('Alasan penolakan wajib diisi', 'error');
      return;
    }
    setLoading(true);
    const result = await rejectKirimBarang(rejectModal.id, userName, rejectModal.reason);
    if (result.success) {
      showToast('Request ditolak');
      setRejectModal({ id: '', show: false, reason: '' });
      loadRequests();
    } else {
      showToast(result.error || 'Gagal menolak', 'error');
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus request ini?')) return;
    setLoading(true);
    const result = await deleteKirimBarang(id);
    if (result.success) {
      showToast('Request dihapus');
      loadRequests();
    } else {
      showToast(result.error || 'Gagal menghapus', 'error');
    }
    setLoading(false);
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-900/30 text-yellow-400 border-yellow-700';
      case 'approved': return 'bg-blue-900/30 text-blue-400 border-blue-700';
      case 'sent': return 'bg-purple-900/30 text-purple-400 border-purple-700';
      case 'received': return 'bg-green-900/30 text-green-400 border-green-700';
      case 'rejected': return 'bg-red-900/30 text-red-400 border-red-700';
      default: return 'bg-gray-900/30 text-gray-400 border-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Menunggu';
      case 'approved': return 'Disetujui';
      case 'sent': return 'Dikirim';
      case 'received': return 'Diterima';
      case 'rejected': return 'Ditolak';
      default: return status;
    }
  };

  // Render stock table with inline request input
  const renderStockTable = (items: StockItemWithRequest[], store: 'mjm' | 'bjw') => {
    const otherStore = store === 'mjm' ? 'bjw' : 'mjm';
    const storeColorBg = store === 'mjm' ? 'bg-blue-900/30' : 'bg-purple-900/30';
    const storeColorText = store === 'mjm' ? 'text-blue-400' : 'text-purple-400';
    const otherStoreColorBtn = store === 'mjm' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700';

    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
        <div className={`${storeColorBg} px-4 py-3 border-b border-gray-700`}>
          <h3 className={`font-bold ${storeColorText} flex items-center gap-2`}>
            <Building2 size={18} />
            Stok {store.toUpperCase()} ({items.length} item)
            <span className="text-xs text-gray-500 font-normal ml-2">
              → Request ke {otherStore.toUpperCase()}
            </span>
          </h3>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {items.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-800 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-400">Part Number</th>
                  <th className="text-left px-3 py-2 text-gray-400 hidden md:table-cell">Nama Barang</th>
                  <th className="text-center px-3 py-2 text-gray-400">Stok</th>
                  <th className="text-center px-3 py-2 text-gray-400">Minta</th>
                  <th className="text-left px-3 py-2 text-gray-400 hidden lg:table-cell">Catatan</th>
                  <th className="text-center px-3 py-2 text-gray-400">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-t border-gray-700/50 hover:bg-gray-700/20">
                    <td className="px-3 py-2">
                      <div className="text-gray-300 font-mono text-xs">{item.part_number}</div>
                      <div className="text-gray-500 text-xs truncate max-w-[120px] md:hidden">{item.name}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-300 truncate max-w-[200px] hidden md:table-cell">
                      <div>{item.name}</div>
                      <div className="text-xs text-gray-500">{item.brand} {item.application && `• ${item.application}`}</div>
                    </td>
                    <td className={`px-3 py-2 text-center font-bold ${storeColorText}`}>
                      {item.quantity}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => updateRequestQty(store, item.part_number, item.requestQty - 1)}
                          className="p-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-400"
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={item.requestQty || ''}
                          onChange={(e) => updateRequestQty(store, item.part_number, parseInt(e.target.value) || 0)}
                          className="w-14 text-center px-1 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm"
                          placeholder="0"
                        />
                        <button
                          onClick={() => updateRequestQty(store, item.part_number, item.requestQty + 1)}
                          className="p-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-400"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <input
                        type="text"
                        value={item.catatan}
                        onChange={(e) => updateCatatan(store, item.part_number, e.target.value)}
                        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs"
                        placeholder="Catatan..."
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleSendRequest(item, store)}
                        disabled={item.requestQty <= 0 || sendingItem === item.part_number}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 mx-auto transition-all ${
                          item.requestQty > 0
                            ? `${otherStoreColorBtn} text-white`
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {sendingItem === item.part_number ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <>
                            <Send size={14} />
                            <span className="hidden sm:inline">{otherStore.toUpperCase()}</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? 'Tidak ada hasil' : 'Ketik untuk mencari barang...'}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 p-3 md:p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-right ${
          toast.type === 'success' ? 'bg-green-900/90 text-green-300 border border-green-700' : 'bg-red-900/90 text-red-300 border border-red-700'
        }`}>
          {toast.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl shadow-lg">
            <ArrowRightLeft size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-100">Kirim Barang MJM ↔ BJW</h1>
            <p className="text-sm text-gray-400">Transfer barang antar toko</p>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setViewMode('stock_comparison')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              viewMode === 'stock_comparison'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Search size={16} />
            Cari & Request Barang
          </button>
          <button
            onClick={() => { setViewMode('request_list'); loadRequests(); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              viewMode === 'request_list'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Package size={16} />
            Daftar Request
          </button>
        </div>
      </div>

      {/* Stock Comparison View with Inline Input */}
      {viewMode === 'stock_comparison' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari part number atau nama barang dari database..."
              className="w-full pl-12 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {loading && (
              <RefreshCw className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin" size={20} />
            )}
          </div>

          {/* Info Box */}
          <div className="bg-indigo-900/20 border border-indigo-800/50 rounded-xl p-4 text-sm text-indigo-300">
            <p className="flex items-start gap-2">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>
                Cari barang di atas, lalu masukkan quantity yang ingin diminta pada kolom <strong>Minta</strong>, 
                kemudian klik tombol kirim. Data barang diambil otomatis dari database. Quantity boleh melebihi stok yang tersedia.
              </span>
            </p>
          </div>

          {/* Stock Tables - Side by Side */}
          {searchQuery.length >= 2 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {renderStockTable(searchResults.mjm, 'mjm')}
              {renderStockTable(searchResults.bjw, 'bjw')}
            </div>
          )}
        </div>
      )}

      {/* Request List View */}
      {viewMode === 'request_list' && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex flex-wrap gap-2 items-center">
            <Filter size={18} className="text-gray-500" />
            {(['all', 'incoming', 'outgoing', 'pending', 'completed'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === f
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {f === 'all' && 'Semua'}
                {f === 'incoming' && `Masuk ke ${currentStore.toUpperCase()}`}
                {f === 'outgoing' && `Keluar dari ${currentStore.toUpperCase()}`}
                {f === 'pending' && 'Pending'}
                {f === 'completed' && 'Selesai'}
              </button>
            ))}
            <button
              onClick={loadRequests}
              className="ml-auto p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Request List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="animate-spin text-indigo-500" size={32} />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package size={48} className="mx-auto mb-4 opacity-50" />
              <p>Belum ada request transfer</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden"
                >
                  {/* Request Header */}
                  <div
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-700/30"
                    onClick={() => setExpandedRequest(expandedRequest === req.id ? null : req.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-sm">
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          req.from_store === 'mjm' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'
                        }`}>
                          {req.from_store.toUpperCase()}
                        </span>
                        <ArrowRightLeft size={14} className="text-gray-500" />
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          req.to_store === 'mjm' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'
                        }`}>
                          {req.to_store.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-gray-200 font-medium">{req.part_number}</p>
                        <p className="text-gray-500 text-xs truncate max-w-[200px]">{req.nama_barang}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-indigo-400">x{req.quantity}</span>
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${getStatusColor(req.status)}`}>
                        {getStatusLabel(req.status)}
                      </span>
                      {expandedRequest === req.id ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedRequest === req.id && (
                    <div className="px-4 py-3 border-t border-gray-700 bg-gray-800/30">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                        <div>
                          <span className="text-gray-500 text-xs">Brand</span>
                          <p className="text-gray-300">{req.brand || '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">Aplikasi</span>
                          <p className="text-gray-300">{req.application || '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">Request Oleh</span>
                          <p className="text-gray-300">{req.requested_by || '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">Tanggal</span>
                          <p className="text-gray-300">{new Date(req.created_at).toLocaleDateString('id-ID')}</p>
                        </div>
                      </div>

                      {req.catatan && (
                        <div className="mb-4 p-2 bg-gray-700/30 rounded-lg">
                          <span className="text-gray-500 text-xs">Catatan:</span>
                          <p className="text-gray-300 text-sm">{req.catatan}</p>
                        </div>
                      )}

                      {req.catatan_reject && (
                        <div className="mb-4 p-2 bg-red-900/20 border border-red-800/50 rounded-lg">
                          <span className="text-red-400 text-xs">Alasan Ditolak:</span>
                          <p className="text-red-300 text-sm">{req.catatan_reject}</p>
                        </div>
                      )}

                      {/* Timeline */}
                      <div className="flex flex-wrap gap-2 text-xs mb-4">
                        {req.approved_at && (
                          <span className="px-2 py-1 bg-blue-900/20 text-blue-400 rounded">
                            Disetujui: {new Date(req.approved_at).toLocaleString('id-ID')} oleh {req.approved_by}
                          </span>
                        )}
                        {req.sent_at && (
                          <span className="px-2 py-1 bg-purple-900/20 text-purple-400 rounded">
                            Dikirim: {new Date(req.sent_at).toLocaleString('id-ID')} oleh {req.sent_by}
                          </span>
                        )}
                        {req.received_at && (
                          <span className="px-2 py-1 bg-green-900/20 text-green-400 rounded">
                            Diterima: {new Date(req.received_at).toLocaleString('id-ID')} oleh {req.received_by}
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2">
                        {/* Pending: Can approve or reject (from source store) */}
                        {req.status === 'pending' && req.from_store === currentStore && (
                          <>
                            <button
                              onClick={() => handleApprove(req.id)}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-blue-700"
                            >
                              <Check size={14} /> Setujui
                            </button>
                            <button
                              onClick={() => setRejectModal({ id: req.id, show: true, reason: '' })}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-red-700"
                            >
                              <X size={14} /> Tolak
                            </button>
                          </>
                        )}

                        {/* Approved: Can send (from source store) */}
                        {req.status === 'approved' && req.from_store === currentStore && (
                          <button
                            onClick={() => handleSend(req.id)}
                            className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-purple-700"
                          >
                            <Truck size={14} /> Kirim Barang
                          </button>
                        )}

                        {/* Sent: Can receive (at destination store) */}
                        {req.status === 'sent' && req.to_store === currentStore && (
                          <>
                            <button
                              onClick={() => handleReceive(req.id)}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-green-700"
                            >
                              <Check size={14} /> Terima Barang
                            </button>
                            <button
                              onClick={() => setRejectModal({ id: req.id, show: true, reason: '' })}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-red-700"
                            >
                              <X size={14} /> Tolak
                            </button>
                          </>
                        )}

                        {/* Pending: Can delete (by requester) */}
                        {req.status === 'pending' && req.to_store === currentStore && (
                          <button
                            onClick={() => handleDelete(req.id)}
                            className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-gray-700"
                          >
                            <X size={14} /> Hapus Request
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.show && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md p-6 border border-gray-700">
            <h3 className="text-lg font-bold text-gray-100 mb-4 flex items-center gap-2">
              <AlertCircle className="text-red-400" size={20} />
              Tolak Request
            </h3>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              rows={3}
              placeholder="Masukkan alasan penolakan..."
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-red-500 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setRejectModal({ id: '', show: false, reason: '' })}
                className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg font-medium hover:bg-gray-600"
              >
                Batal
              </button>
              <button
                onClick={handleReject}
                disabled={loading || !rejectModal.reason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Tolak
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
