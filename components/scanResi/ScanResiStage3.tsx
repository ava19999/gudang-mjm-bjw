// FILE: components/scanResi/ScanResiStage3.tsx
// Stage 3: Data Entry and Finalization

import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../context/StoreContext';
import {
  getPendingStage3List,
  getResiItems,
  addResiItem,
  updateResiItem,
  deleteResiItem,
  splitItem,
  completeStage3,
  lookupPartNumber
} from '../../services/resiScanService';
import {
  parseShopeeCSV,
  parseTikTokCSV,
  readFileAsText,
  validateCSVFormat,
  detectCSVPlatform,
  groupItemsByResi
} from '../../services/csvParserService';
import { ResiScanStage, ResiItem, ParsedCSVItem } from '../../types';
import {
  FileText,
  Upload,
  Save,
  Trash2,
  Plus,
  Check,
  X,
  AlertCircle,
  Package,
  RefreshCw,
  Search,
  Edit2,
  CheckCircle,
  Copy
} from 'lucide-react';

interface ScanResiStage3Props {
  onRefresh?: () => void;
}

const Toast = ({ message, type, onClose }: any) => (
  <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-xl flex items-center gap-2 text-white text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${
    type === 'success' ? 'bg-green-600' : type === 'warning' ? 'bg-yellow-600' : 'bg-red-600'
  }`}>
    {type === 'success' ? <Check size={16} /> : <X size={16} />}
    {message}
    <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
      <X size={14}/>
    </button>
  </div>
);

export const ScanResiStage3: React.FC<ScanResiStage3Props> = ({ onRefresh }) => {
  const { selectedStore, userName } = useStore();
  
  const [pendingList, setPendingList] = useState<ResiScanStage[]>([]);
  const [selectedResi, setSelectedResi] = useState<ResiScanStage | null>(null);
  const [resiItems, setResiItems] = useState<ResiItem[]>([]);
  const [parsedCSVItems, setParsedCSVItems] = useState<ParsedCSVItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [showStockPreview, setShowStockPreview] = useState(false);
  const [stockPreview, setStockPreview] = useState<any[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [manualInputMode, setManualInputMode] = useState(false);
  
  // Form states
  const [customerName, setCustomerName] = useState('');
  const [orderId, setOrderId] = useState('');
  
  // Manual input form
  const [manualForm, setManualForm] = useState({
    part_number: '',
    nama_barang: '',
    brand: '',
    application: '',
    qty_keluar: 1,
    harga_satuan: 0,
    harga_total: 0
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  
  useEffect(() => {
    loadPendingList();
  }, [selectedStore]);
  
  useEffect(() => {
    if (selectedResi) {
      loadResiItems();
      // Extract customer and order_id if available
      setCustomerName(selectedResi.customer || '');
      setOrderId(selectedResi.order_id || '');
    }
  }, [selectedResi]);
  
  const loadPendingList = async () => {
    setLoading(true);
    const data = await getPendingStage3List(selectedStore);
    setPendingList(data);
    setLoading(false);
  };
  
  const loadResiItems = async () => {
    if (!selectedResi) return;
    setLoading(true);
    const items = await getResiItems(selectedResi.id, selectedStore);
    setResiItems(items);
    setLoading(false);
  };
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      showToast('File harus berformat CSV!', 'error');
      return;
    }
    
    try {
      setLoading(true);
      const text = await readFileAsText(file);
      
      // Auto-detect platform
      const platform = detectCSVPlatform(text);
      if (platform === 'unknown') {
        showToast('Format CSV tidak dikenali. Pastikan file dari Shopee/TikTok', 'error');
        setLoading(false);
        return;
      }
      
      // Validate format
      const validation = validateCSVFormat(text, platform);
      if (!validation.valid) {
        showToast(validation.error || 'Format CSV tidak valid', 'error');
        setLoading(false);
        return;
      }
      
      // Parse CSV
      const items = platform === 'shopee' ? parseShopeeCSV(text) : parseTikTokCSV(text);
      
      if (items.length === 0) {
        showToast('Tidak ada data yang dapat diproses', 'error');
        setLoading(false);
        return;
      }
      
      // Filter items for selected resi
      const resiItems = items.filter(item => item.resi === selectedResi?.resi);
      
      if (resiItems.length === 0) {
        showToast(`Tidak ada item untuk resi ${selectedResi?.resi} dalam file ini`, 'warning');
        setParsedCSVItems(items);
      } else {
        setParsedCSVItems(resiItems);
        // Auto-fill customer and order_id
        if (resiItems[0].customer) setCustomerName(resiItems[0].customer);
        if (resiItems[0].order_id) setOrderId(resiItems[0].order_id);
      }
      
      showToast(`${items.length} item berhasil di-parse dari ${platform.toUpperCase()}`, 'success');
      setLoading(false);
    } catch (error: any) {
      console.error('Error parsing CSV:', error);
      showToast(error.message || 'Gagal memproses file CSV', 'error');
      setLoading(false);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleAddItemFromCSV = async (csvItem: ParsedCSVItem) => {
    if (!selectedResi) return;
    
    setProcessing(true);
    
    // Lookup part number
    const lookup = await lookupPartNumber(csvItem.sku, selectedStore);
    
    if (!lookup.found) {
      showToast(`Part number tidak ditemukan: ${csvItem.sku}`, 'error');
      setProcessing(false);
      return;
    }
    
    const result = await addResiItem(
      selectedResi.id,
      {
        part_number: lookup.data!.part_number,
        nama_barang: lookup.data!.name,
        brand: lookup.data!.brand,
        application: lookup.data!.application,
        qty_keluar: csvItem.quantity,
        harga_satuan: csvItem.price,
        harga_total: csvItem.total_price,
        sku_from_csv: csvItem.sku,
        manual_input: false
      },
      selectedStore
    );
    
    if (result.success) {
      showToast('Item ditambahkan!', 'success');
      await loadResiItems();
      // Remove from parsed items
      setParsedCSVItems(prev => prev.filter(item => item !== csvItem));
    } else {
      showToast(result.message, 'error');
    }
    
    setProcessing(false);
  };
  
  const handleManualAddItem = async () => {
    if (!selectedResi) return;
    
    if (!manualForm.part_number || !manualForm.nama_barang) {
      showToast('Part number dan nama barang harus diisi!', 'error');
      return;
    }
    
    setProcessing(true);
    
    const result = await addResiItem(
      selectedResi.id,
      {
        ...manualForm,
        manual_input: true
      },
      selectedStore
    );
    
    if (result.success) {
      showToast('Item berhasil ditambahkan!', 'success');
      await loadResiItems();
      // Reset form
      setManualForm({
        part_number: '',
        nama_barang: '',
        brand: '',
        application: '',
        qty_keluar: 1,
        harga_satuan: 0,
        harga_total: 0
      });
      setManualInputMode(false);
    } else {
      showToast(result.message, 'error');
    }
    
    setProcessing(false);
  };
  
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Hapus item ini?')) return;
    
    const result = await deleteResiItem(itemId, selectedStore);
    
    if (result.success) {
      showToast('Item dihapus', 'success');
      await loadResiItems();
    } else {
      showToast(result.message, 'error');
    }
  };
  
  const handleSplitItem = async (itemId: string) => {
    const splitCount = prompt('Pecah menjadi berapa item? (contoh: 2 untuk kiri/kanan)', '2');
    if (!splitCount) return;
    
    const count = parseInt(splitCount);
    if (isNaN(count) || count < 2) {
      showToast('Jumlah split harus minimal 2', 'error');
      return;
    }
    
    setProcessing(true);
    const result = await splitItem(itemId, count, selectedStore);
    
    if (result.success) {
      showToast(result.message, 'success');
      await loadResiItems();
    } else {
      showToast(result.message, 'error');
    }
    
    setProcessing(false);
  };
  
  const handleCompleteStage3 = async () => {
    if (!selectedResi) return;
    
    if (resiItems.length === 0) {
      showToast('Belum ada item yang ditambahkan!', 'error');
      return;
    }
    
    if (!customerName.trim()) {
      showToast('Nama customer harus diisi!', 'error');
      return;
    }
    
    if (!confirm(`Selesaikan dan proses ${resiItems.length} item untuk resi ${selectedResi.resi}?`)) {
      return;
    }
    
    setProcessing(true);
    
    const result = await completeStage3(
      {
        resi_id: selectedResi.id,
        customer: customerName.trim(),
        order_id: orderId.trim(),
        items: resiItems
      },
      selectedStore
    );
    
    if (result.success) {
      showToast('Resi berhasil diproses! Stock telah dikurangi.', 'success');
      await loadPendingList();
      setSelectedResi(null);
      setResiItems([]);
      setParsedCSVItems([]);
      setCustomerName('');
      setOrderId('');
      if (onRefresh) onRefresh();
    } else {
      showToast(result.message, 'error');
    }
    
    setProcessing(false);
  };
  
  const filteredPendingList = pendingList.filter(resi =>
    resi.resi.toLowerCase().includes(searchTerm.toLowerCase()) ||
    resi.ecommerce.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const getEcommerceBadgeColor = (ecommerce: string) => {
    switch (ecommerce.toUpperCase()) {
      case 'SHOPEE': return 'bg-orange-600';
      case 'TIKTOK': return 'bg-blue-600';
      case 'KILAT': return 'bg-purple-600';
      case 'EKSPOR': return 'bg-green-600';
      default: return 'bg-gray-600';
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-xl">
              <FileText size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Stage 3: Data Entry & Finalisasi</h1>
              <p className="text-sm text-gray-400">Upload CSV dan finalisasi data barang keluar</p>
            </div>
          </div>
          <button
            onClick={loadPendingList}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Pending List */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold mb-3">Pilih Resi</h2>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari resi..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
            
            <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
              {filteredPendingList.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <Package size={48} className="mx-auto mb-2 opacity-50" />
                  <p>Tidak ada resi yang menunggu</p>
                </div>
              ) : (
                filteredPendingList.map((resi) => (
                  <button
                    key={resi.id}
                    onClick={() => setSelectedResi(resi)}
                    className={`w-full p-4 border-b border-gray-700 hover:bg-gray-700/50 transition-colors text-left ${
                      selectedResi?.id === resi.id ? 'bg-blue-600/20 border-l-4 border-l-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-mono font-semibold text-blue-400 text-sm">
                        {resi.resi}
                      </span>
                      <span className={`px-2 py-1 ${getEcommerceBadgeColor(resi.ecommerce)} rounded text-xs font-semibold`}>
                        {resi.ecommerce}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>{resi.sub_toko}</span>
                      <span>{new Date(resi.stage2_verified_at || resi.created_at).toLocaleDateString('id-ID')}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
        
        {/* Right Panel - Details */}
        <div className="lg:col-span-2">
          {!selectedResi ? (
            <div className="bg-gray-800 rounded-xl p-12 text-center border border-gray-700">
              <Package size={64} className="mx-auto mb-4 text-gray-600" />
              <p className="text-gray-400 text-lg">Pilih resi dari daftar di samping untuk memulai</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resi Info */}
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Resi: {selectedResi.resi}</h2>
                  <span className={`px-3 py-1 ${getEcommerceBadgeColor(selectedResi.ecommerce)} rounded-lg font-semibold`}>
                    {selectedResi.ecommerce}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Nama Customer *</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nama customer..."
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Order ID</label>
                    <input
                      type="text"
                      value={orderId}
                      onChange={(e) => setOrderId(e.target.value)}
                      placeholder="Order ID (optional)..."
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                {/* CSV Upload */}
                <div className="border-t border-gray-700 pt-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || processing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                  >
                    <Upload size={20} />
                    Upload CSV Shopee/TikTok
                  </button>
                </div>
              </div>
              
              {/* Parsed CSV Items */}
              {parsedCSVItems.length > 0 && (
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <FileText size={20} />
                    Data dari CSV ({parsedCSVItems.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {parsedCSVItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                        <div className="flex-1 text-sm">
                          <p className="font-semibold">{item.product_name}</p>
                          <p className="text-gray-400 text-xs">
                            SKU: {item.sku} | Qty: {item.quantity} | Rp {item.total_price.toLocaleString()}
                          </p>
                        </div>
                        <button
                          onClick={() => handleAddItemFromCSV(item)}
                          disabled={processing}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1"
                        >
                          <Plus size={14} />
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Items List */}
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Package size={20} />
                    Items ({resiItems.length})
                  </h3>
                  <button
                    onClick={() => setManualInputMode(!manualInputMode)}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Manual Input
                  </button>
                </div>
                
                {/* Manual Input Form */}
                {manualInputMode && (
                  <div className="mb-4 p-4 bg-gray-700 rounded-lg border border-gray-600">
                    <h4 className="text-sm font-semibold mb-3">Input Manual</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={manualForm.part_number}
                        onChange={(e) => setManualForm({...manualForm, part_number: e.target.value})}
                        placeholder="Part Number *"
                        className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
                      />
                      <input
                        type="text"
                        value={manualForm.nama_barang}
                        onChange={(e) => setManualForm({...manualForm, nama_barang: e.target.value})}
                        placeholder="Nama Barang *"
                        className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
                      />
                      <input
                        type="text"
                        value={manualForm.brand}
                        onChange={(e) => setManualForm({...manualForm, brand: e.target.value})}
                        placeholder="Brand"
                        className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
                      />
                      <input
                        type="text"
                        value={manualForm.application}
                        onChange={(e) => setManualForm({...manualForm, application: e.target.value})}
                        placeholder="Application"
                        className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
                      />
                      <input
                        type="number"
                        value={manualForm.qty_keluar}
                        onChange={(e) => setManualForm({...manualForm, qty_keluar: parseInt(e.target.value) || 1})}
                        placeholder="Qty"
                        className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
                      />
                      <input
                        type="number"
                        value={manualForm.harga_satuan}
                        onChange={(e) => {
                          const hargaSatuan = parseFloat(e.target.value) || 0;
                          setManualForm({
                            ...manualForm,
                            harga_satuan: hargaSatuan,
                            harga_total: hargaSatuan * manualForm.qty_keluar
                          });
                        }}
                        placeholder="Harga Satuan"
                        className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
                      />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleManualAddItem}
                        disabled={processing}
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg text-sm font-semibold transition-colors"
                      >
                        Tambah Item
                      </button>
                      <button
                        onClick={() => setManualInputMode(false)}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-semibold transition-colors"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Part Number</th>
                        <th className="px-3 py-2 text-left">Nama Barang</th>
                        <th className="px-3 py-2 text-left">Brand</th>
                        <th className="px-3 py-2 text-center">Qty</th>
                        <th className="px-3 py-2 text-right">Harga</th>
                        <th className="px-3 py-2 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {resiItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                            <AlertCircle size={32} className="mx-auto mb-2 opacity-50" />
                            Belum ada item. Upload CSV atau input manual.
                          </td>
                        </tr>
                      ) : (
                        resiItems.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-700/50">
                            <td className="px-3 py-2 font-mono text-xs text-blue-400">
                              {item.part_number}
                              {item.is_split_item && (
                                <span className="ml-2 px-1 py-0.5 bg-yellow-600 rounded text-xs">
                                  Split {item.split_count}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">{item.nama_barang}</td>
                            <td className="px-3 py-2 text-gray-400">{item.brand}</td>
                            <td className="px-3 py-2 text-center font-semibold">{item.qty_keluar}</td>
                            <td className="px-3 py-2 text-right">
                              Rp {item.harga_total.toLocaleString()}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleSplitItem(item.id)}
                                  disabled={processing || item.is_split_item}
                                  title="Split item (kiri/kanan)"
                                  className="p-1 text-yellow-400 hover:bg-yellow-600/20 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <Copy size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  disabled={processing}
                                  className="p-1 text-red-400 hover:bg-red-600/20 rounded"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* Summary */}
                {resiItems.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Total Items:</span>
                      <span className="font-semibold">{resiItems.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-gray-400">Total Qty:</span>
                      <span className="font-semibold">
                        {resiItems.reduce((sum, item) => sum + item.qty_keluar, 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-gray-400">Total Harga:</span>
                      <span className="font-bold text-lg text-green-400">
                        Rp {resiItems.reduce((sum, item) => sum + item.harga_total, 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedResi(null);
                    setResiItems([]);
                    setParsedCSVItems([]);
                    setCustomerName('');
                    setOrderId('');
                  }}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleCompleteStage3}
                  disabled={processing || resiItems.length === 0 || !customerName.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                >
                  {processing ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={20} />
                      Selesaikan & Proses Stock
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
