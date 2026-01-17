// FILE: components/orders/ScanResiManagement.tsx
import React, { useState, useEffect } from 'react';
import { Check, X, Edit, Search, Package } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { OnlineOrderRow } from '../../types';
import {
  fetchScanResiEntries,
  approveResiToBarangKeluar,
  updateScanResiEntry,
  deleteScanResiEntry
} from '../../services/supabaseService';

interface ScanResiManagementProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onRefresh?: () => void;
}

export const ScanResiManagement: React.FC<ScanResiManagementProps> = ({ showToast, onRefresh }) => {
  const { selectedStore } = useStore();
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scanned' | 'packed' | 'completed'>('all');
  const [scannedOrders, setScannedOrders] = useState<OnlineOrderRow[]>([]);
  const [packedOrders, setPackedOrders] = useState<OnlineOrderRow[]>([]);
  const [editingItem, setEditingItem] = useState<OnlineOrderRow | null>(null);

  useEffect(() => {
    loadOrders();
  }, [selectedStore, statusFilter]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      if (statusFilter === 'all' || statusFilter === 'scanned') {
        const scanned = await fetchScanResiEntries(selectedStore, 'scanned');
        setScannedOrders(scanned);
      }
      
      if (statusFilter === 'all' || statusFilter === 'packed') {
        const packed = await fetchScanResiEntries(selectedStore, 'packed');
        setPackedOrders(packed);
      }
    } catch (e) {
      console.error('Error loading orders:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (resi: string, items: OnlineOrderRow[]) => {
    if (!confirm(`Approve semua item dari resi ${resi}? Stok akan dikurangi.`)) return;
    
    setLoading(true);
    let successCount = 0;
    let failedCount = 0;
    
    for (const item of items) {
      const success = await approveResiToBarangKeluar(item, selectedStore);
      if (success) {
        successCount++;
      } else {
        failedCount++;
      }
    }
    
    if (successCount > 0) {
      showToast(`${successCount} item berhasil diproses!`);
      loadOrders();
      onRefresh?.();
    }
    
    if (failedCount > 0) {
      showToast(`${failedCount} item gagal diproses`, 'error');
    }
    
    setLoading(false);
  };

  const handleDelete = async (id: number, resi: string) => {
    if (!confirm(`Hapus item dari resi ${resi}?`)) return;
    
    setLoading(true);
    const success = await deleteScanResiEntry(id, selectedStore);
    if (success) {
      showToast('Item dihapus');
      loadOrders();
      onRefresh?.();
    } else {
      showToast('Gagal menghapus item', 'error');
    }
    setLoading(false);
  };

  const handleEdit = async (item: OnlineOrderRow) => {
    setEditingItem(item);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    
    if (!editingItem.id) {
      showToast('Error: Item ID tidak valid', 'error');
      setEditingItem(null);
      return;
    }
    
    setLoading(true);
    const success = await updateScanResiEntry(editingItem.id, {
      quantity: editingItem.quantity,
      harga_satuan: editingItem.harga_satuan,
      harga_total: editingItem.quantity * editingItem.harga_satuan,
      customer: editingItem.customer,
      nama_barang: editingItem.nama_barang
    }, selectedStore);
    
    if (success) {
      showToast('Perubahan disimpan');
      setEditingItem(null);
      loadOrders();
      onRefresh?.();
    } else {
      showToast('Gagal menyimpan perubahan', 'error');
    }
    setLoading(false);
  };

  const allOrders = [...scannedOrders, ...packedOrders];
  
  const filteredOrders = allOrders.filter(item => {
    const matchesSearch = 
      item.resi.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.part_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.nama_barang.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Group by resi
  const groupedOrders = filteredOrders.reduce((acc, item) => {
    if (!acc[item.resi]) {
      acc[item.resi] = [];
    }
    acc[item.resi].push(item);
    return acc;
  }, {} as Record<string, OnlineOrderRow[]>);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scanned':
        return <span className="px-2 py-1 bg-yellow-600 text-white text-xs rounded">Scanned</span>;
      case 'packed':
        return <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">Packed</span>;
      case 'completed':
        return <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">Completed</span>;
      default:
        return <span className="px-2 py-1 bg-gray-600 text-white text-xs rounded">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-2xl font-bold text-gray-100 mb-4">Manajemen Scan Resi</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari resi, customer, atau part..."
              className="w-full pl-10 pr-4 py-2 bg-gray-700 text-gray-100 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-gray-700 text-gray-100 rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">Semua Status</option>
              <option value="scanned">Scanned</option>
              <option value="packed">Packed</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-yellow-900 bg-opacity-30 rounded-lg p-4 border border-yellow-700">
          <h3 className="text-sm font-semibold text-yellow-400 mb-1">Scanned</h3>
          <p className="text-3xl font-bold text-yellow-300">{scannedOrders.length}</p>
        </div>
        <div className="bg-blue-900 bg-opacity-30 rounded-lg p-4 border border-blue-700">
          <h3 className="text-sm font-semibold text-blue-400 mb-1">Packed</h3>
          <p className="text-3xl font-bold text-blue-300">{packedOrders.length}</p>
        </div>
        <div className="bg-green-900 bg-opacity-30 rounded-lg p-4 border border-green-700">
          <h3 className="text-sm font-semibold text-green-400 mb-1">Total Resi</h3>
          <p className="text-3xl font-bold text-green-300">{Object.keys(groupedOrders).length}</p>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {Object.entries(groupedOrders).map(([resi, items]) => {
          const totalAmount = items.reduce((sum, item) => sum + item.harga_total, 0);
          const firstItem = items[0];
          
          return (
            <div key={resi} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              {/* Header */}
              <div className="bg-gray-750 p-4 border-b border-gray-700">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold text-blue-400 font-mono mb-1">
                      Resi: {resi}
                    </h3>
                    <div className="flex flex-wrap gap-2 text-sm text-gray-400">
                      <span>Customer: {firstItem.customer}</span>
                      <span>•</span>
                      <span>Toko: {firstItem.toko}</span>
                      <span>•</span>
                      <span>Platform: {firstItem.ecommerce}</span>
                      {firstItem.negara && (
                        <>
                          <span>•</span>
                          <span>Negara: {firstItem.negara}</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Tanggal: {firstItem.tanggal}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(firstItem.status)}
                    {(firstItem.status === 'scanned' || firstItem.status === 'packed') && (
                      <button
                        onClick={() => handleApprove(resi, items)}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium"
                      >
                        <Check size={16} />
                        Approve & Kurangi Stok
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-750">
                      <th className="text-left p-3 text-gray-400 font-medium">Part Number</th>
                      <th className="text-left p-3 text-gray-400 font-medium">Nama Barang</th>
                      <th className="text-left p-3 text-gray-400 font-medium">Brand</th>
                      <th className="text-right p-3 text-gray-400 font-medium">Qty</th>
                      <th className="text-right p-3 text-gray-400 font-medium">Harga Satuan</th>
                      <th className="text-right p-3 text-gray-400 font-medium">Total</th>
                      <th className="text-center p-3 text-gray-400 font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-700 hover:bg-gray-750">
                        {editingItem?.id === item.id ? (
                          <>
                            <td className="p-3 font-mono text-sm text-gray-300">{item.part_number}</td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={editingItem.nama_barang}
                                onChange={(e) => setEditingItem({...editingItem, nama_barang: e.target.value})}
                                className="w-full bg-gray-700 text-gray-100 rounded px-2 py-1 text-sm"
                              />
                            </td>
                            <td className="p-3 text-gray-400">{item.brand}</td>
                            <td className="p-3 text-right">
                              <input
                                type="number"
                                value={editingItem.quantity}
                                onChange={(e) => setEditingItem({...editingItem, quantity: parseInt(e.target.value) || 0})}
                                className="w-20 bg-gray-700 text-gray-100 rounded px-2 py-1 text-sm text-right"
                              />
                            </td>
                            <td className="p-3 text-right">
                              <input
                                type="number"
                                value={editingItem.harga_satuan}
                                onChange={(e) => setEditingItem({...editingItem, harga_satuan: parseFloat(e.target.value) || 0})}
                                className="w-24 bg-gray-700 text-gray-100 rounded px-2 py-1 text-sm text-right"
                              />
                            </td>
                            <td className="p-3 text-right font-semibold text-gray-300">
                              Rp {(editingItem.quantity * editingItem.harga_satuan).toLocaleString('id-ID')}
                            </td>
                            <td className="p-3">
                              <div className="flex gap-1 justify-center">
                                <button
                                  onClick={handleSaveEdit}
                                  className="p-1 bg-green-600 hover:bg-green-700 text-white rounded"
                                  title="Simpan"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={() => setEditingItem(null)}
                                  className="p-1 bg-gray-600 hover:bg-gray-700 text-white rounded"
                                  title="Batal"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 font-mono text-sm text-gray-300">{item.part_number}</td>
                            <td className="p-3 text-gray-300">{item.nama_barang}</td>
                            <td className="p-3 text-gray-400">{item.brand}</td>
                            <td className="p-3 text-right text-gray-300">{item.quantity}</td>
                            <td className="p-3 text-right text-gray-300">
                              Rp {item.harga_satuan.toLocaleString('id-ID')}
                            </td>
                            <td className="p-3 text-right font-semibold text-gray-200">
                              Rp {item.harga_total.toLocaleString('id-ID')}
                            </td>
                            <td className="p-3">
                              <div className="flex gap-1 justify-center">
                                <button
                                  onClick={() => handleEdit(item)}
                                  className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                                  title="Edit"
                                  disabled={item.status === 'completed'}
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={() => handleDelete(item.id, resi)}
                                  className="p-1 bg-red-600 hover:bg-red-700 text-white rounded"
                                  title="Hapus"
                                  disabled={item.status === 'completed'}
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-600 bg-gray-750">
                      <td colSpan={5} className="p-3 text-right font-semibold text-gray-300">
                        Total Resi:
                      </td>
                      <td className="p-3 text-right font-bold text-green-400">
                        Rp {totalAmount.toLocaleString('id-ID')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}

        {Object.keys(groupedOrders).length === 0 && (
          <div className="bg-gray-800 rounded-lg p-12 text-center border border-gray-700">
            <Package size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-xl text-gray-500">Tidak ada pesanan ditemukan</p>
            <p className="text-sm text-gray-600 mt-2">
              {statusFilter !== 'all' 
                ? `Tidak ada pesanan dengan status "${statusFilter}"`
                : 'Mulai scan resi untuk melihat pesanan di sini'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
