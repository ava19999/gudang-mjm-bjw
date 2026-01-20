// FILE: src/components/OrderManagement.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { 
  fetchOfflineOrders, fetchSoldItems, fetchReturItems,
  processOfflineOrderItem, updateOfflineOrder
} from '../services/supabaseService';
import { OfflineOrderRow, SoldItemRow, ReturRow } from '../types';
import { 
  ClipboardList, CheckCircle, RotateCcw, Search, RefreshCw, Box, Check, X, 
  ChevronDown, ChevronUp, Layers, User, Pencil, Save, XCircle
} from 'lucide-react';

// Toast Component Sederhana
const Toast = ({ msg, type, onClose }: any) => (
  <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-xl flex items-center text-white text-sm font-bold animate-in fade-in slide-in-from-top-2 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
    {msg}
    <button onClick={onClose} className="ml-3 opacity-70 hover:opacity-100"><X size={14}/></button>
  </div>
);

export const OrderManagement: React.FC = () => {
  const { selectedStore } = useStore();
  const [activeTab, setActiveTab] = useState<'OFFLINE' | 'TERJUAL' | 'RETUR'>('OFFLINE');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  
  // State Grouping
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // State Data
  const [offlineData, setOfflineData] = useState<OfflineOrderRow[]>([]);
  const [soldData, setSoldData] = useState<SoldItemRow[]>([]);
  const [returData, setReturData] = useState<ReturRow[]>([]);

  // State Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ partNumber: '', quantity: 0, price: 0 });

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'OFFLINE') setOfflineData(await fetchOfflineOrders(selectedStore));
      if (activeTab === 'TERJUAL') setSoldData(await fetchSoldItems(selectedStore));
      if (activeTab === 'RETUR') setReturData(await fetchReturItems(selectedStore));
    } catch (e) {
      console.error("Gagal load data:", e);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [selectedStore, activeTab]);

  // --- LOGIC GROUPING ---
  const groupedOfflineOrders = useMemo(() => {
    const groups: Record<string, { id: string, customer: string, tempo: string, date: string, items: OfflineOrderRow[], totalAmount: number }> = {};
    offlineData.forEach(item => {
      const safeCustomer = (item.customer || 'Tanpa Nama').trim();
      const safeTempo = (item.tempo || 'CASH').trim();
      const key = `${safeCustomer}-${safeTempo}`;
      if (!groups[key]) {
        groups[key] = {
          id: key, customer: safeCustomer, tempo: safeTempo, date: item.tanggal, items: [], totalAmount: 0
        };
      }
      groups[key].items.push(item);
      groups[key].totalAmount += (Number(item.harga_total) || 0);
    });
    return Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [offlineData]);

  // --- HANDLERS ---

  // 1. EDIT HANDLERS
  const startEdit = (item: OfflineOrderRow) => {
    setEditingId(item.id);
    setEditForm({
      partNumber: item.part_number,
      quantity: item.quantity,
      price: item.harga_satuan
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    setLoading(true);
    const res = await updateOfflineOrder(id, editForm, selectedStore);
    setLoading(false);
    
    if (res.success) {
      showToast('Item berhasil diupdate');
      setEditingId(null);
      loadData();
    } else {
      showToast(res.msg, 'error');
    }
  };

  // 2. PROSES / TOLAK HANDLERS
  const handleProcessItem = async (item: OfflineOrderRow, action: 'Proses' | 'Tolak') => {
    if (editingId === item.id) {
        showToast("Simpan perubahan edit dulu sebelum memproses!", 'error');
        return;
    }

    const actionText = action === 'Proses' ? 'ACC' : 'TOLAK (Hapus)';
    if (!confirm(`Yakin ingin ${actionText} barang ini: ${item.nama_barang}?`)) return;
    
    setLoading(true);
    const res = await processOfflineOrderItem(item, selectedStore, action);
    setLoading(false);
    
    if (res.success) {
      showToast(action === 'Proses' ? 'Barang di-ACC & Masuk Terjual' : 'Barang Ditolak & Dihapus');
      loadData();
    } else {
      showToast(res.msg, 'error');
    }
  };

  const handleProcessGroup = async (items: OfflineOrderRow[], action: 'Proses' | 'Tolak') => {
    if (items.some(i => i.id === editingId)) {
        showToast("Ada item yang sedang diedit. Simpan atau batalkan dulu.", 'error');
        return;
    }

    const actionText = action === 'Proses' ? 'ACC SEMUA' : 'TOLAK SEMUA (Hapus)';
    if (!confirm(`Yakin ingin ${actionText} (${items.length} item)?`)) return;
    
    setLoading(true);
    let successCount = 0;
    
    for (const item of items) {
      const res = await processOfflineOrderItem(item, selectedStore, action);
      if (res.success) successCount++;
    }
    
    setLoading(false);
    showToast(`${successCount} item berhasil diproses.`);
    loadData();
  };

  const toggleExpand = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatRupiah = (val: number) => `Rp ${val.toLocaleString('id-ID')}`;

  const filterList = (list: any[]) => {
    if (!searchTerm) return list;
    const lower = searchTerm.toLowerCase();
    return list.filter(item => 
      (item.customer || '').toLowerCase().includes(lower) ||
      (item.nama_barang || item.name || '').toLowerCase().includes(lower) ||
      (item.resi || '').toLowerCase().includes(lower) ||
      (item.part_number || '').toLowerCase().includes(lower)
    );
  };

  const filteredGroupedOffline = groupedOfflineOrders.filter(group => 
    group.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.items.some(i => i.nama_barang.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="bg-gray-800 m-4 rounded-2xl border border-gray-700 shadow-xl min-h-[80vh] flex flex-col text-gray-100">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* HEADER */}
      <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800 rounded-t-2xl">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ClipboardList className="text-purple-400" /> Manajemen Pesanan ({selectedStore?.toUpperCase()})
        </h2>
        <button onClick={loadData} className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      {/* TABS MENU */}
      <div className="flex border-b border-gray-700 bg-gray-900/50 overflow-x-auto">
        {[
          { id: 'OFFLINE', label: 'OFFLINE (Kasir)', icon: ClipboardList, color: 'text-amber-400' },
          { id: 'TERJUAL', label: 'SUDAH TERJUAL', icon: CheckCircle, color: 'text-green-400' },
          { id: 'RETUR', label: 'RETUR', icon: RotateCcw, color: 'text-red-400' },
        ].map((tab: any) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-all hover:bg-gray-800 min-w-[120px] ${activeTab === tab.id ? `border-purple-500 text-purple-400 bg-gray-800` : 'border-transparent text-gray-500'}`}
          >
            <tab.icon size={18} className={activeTab === tab.id ? tab.color : ''} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* SEARCH */}
      <div className="p-4 bg-gray-900/30 border-b border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Cari Customer, Barang, Resi..." 
            className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none text-white placeholder-gray-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-auto p-4 bg-gray-900">
        
        {/* --- 1. TAB OFFLINE (GROUPED VIEW) --- */}
        {activeTab === 'OFFLINE' && (
          <div className="space-y-4">
            {filteredGroupedOffline.length === 0 && <EmptyState msg="Tidak ada order offline baru." />}
            
            {filteredGroupedOffline.map((group) => {
              const groupKey = group.id;
              const isExpanded = expandedGroups[groupKey];

              return (
                <div key={groupKey} className="bg-gray-800 border border-gray-600 rounded-xl overflow-hidden hover:border-gray-500 transition-all shadow-lg">
                  {/* GROUP HEADER */}
                  <div className="p-4 flex flex-col md:flex-row justify-between gap-4 bg-gray-800">
                    <div className="flex-1 cursor-pointer select-none" onClick={() => toggleExpand(groupKey)}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${group.tempo === 'CASH' ? 'bg-green-900/30 border-green-800 text-green-400' : 'bg-orange-900/30 border-orange-800 text-orange-400'}`}>
                          {group.tempo}
                        </span>
                        <span className="text-[10px] font-mono bg-gray-700 px-2 py-0.5 rounded text-gray-300">
                          {new Date(group.date).toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'})}
                        </span>
                        <span className="text-[10px] bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded border border-blue-800 flex items-center gap-1">
                          <Layers size={10} /> {group.items.length} Item
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronUp size={20} className="text-purple-400"/> : <ChevronDown size={20} className="text-gray-400"/>}
                        <h3 className="font-bold text-lg text-white flex items-center gap-2">
                          <User size={18} className="text-gray-400"/> {group.customer}
                        </h3>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 border-t md:border-t-0 border-gray-700 pt-3 md:pt-0">
                      <div>
                        <span className="text-gray-400 text-xs mr-2">Total Tagihan:</span>
                        <span className="text-xl font-bold text-green-400">{formatRupiah(group.totalAmount)}</span>
                      </div>
                      <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={() => handleProcessGroup(group.items, 'Tolak')} className="flex-1 md:flex-none bg-red-900/20 text-red-400 px-4 py-2 rounded-lg hover:bg-red-900/40 border border-red-900/50 text-xs font-bold flex items-center justify-center gap-2 transition-colors">
                          <X size={14}/> TOLAK SEMUA
                        </button>
                        <button onClick={() => handleProcessGroup(group.items, 'Proses')} className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 shadow-lg shadow-blue-900/30 text-xs font-bold flex items-center justify-center gap-2 transition-colors">
                          <Check size={14}/> ACC SEMUA
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ITEM LIST (EDITABLE) */}
                  {isExpanded && (
                    <div className="bg-gray-900/80 border-t border-gray-700 p-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
                      {group.items.map((item, idx) => {
                        const isEditing = editingId === item.id;

                        return (
                        <div key={`${item.id}-${idx}`} className={`flex flex-col md:flex-row justify-between items-center p-3 rounded-lg border ml-4 mr-2 ${isEditing ? 'bg-gray-800 border-blue-500/50 ring-1 ring-blue-500/30' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                          
                          {/* BAGIAN KIRI: INFO / INPUT */}
                          <div className="w-full md:w-auto flex-1 mr-4">
                            {!isEditing ? (
                                <>
                                  <p className="text-sm font-bold text-white">{item.nama_barang}</p>
                                  <p className="text-[10px] text-gray-500 font-mono">Part: {item.part_number}</p>
                                </>
                            ) : (
                                <div className="space-y-2 w-full">
                                    <div className="flex flex-col">
                                        <label className="text-[10px] text-gray-400">Part Number</label>
                                        <input 
                                            value={editForm.partNumber}
                                            onChange={(e) => setEditForm({...editForm, partNumber: e.target.value})}
                                            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>
                            )}
                          </div>

                          {/* BAGIAN KANAN: QTY, HARGA, ACTIONS */}
                          <div className="flex items-center gap-4 w-full md:w-auto mt-2 md:mt-0 justify-between md:justify-end">
                            <div className="text-right">
                              {!isEditing ? (
                                  <>
                                    <p className="text-sm font-bold text-white">{item.quantity} x {formatRupiah(item.harga_satuan)}</p>
                                    <p className="text-xs text-green-400 font-mono">{formatRupiah(item.harga_total)}</p>
                                  </>
                              ) : (
                                  <div className="flex gap-2 items-end">
                                      <div className="flex flex-col w-16">
                                          <label className="text-[10px] text-gray-400">Qty</label>
                                          <input 
                                              type="number"
                                              value={editForm.quantity}
                                              onChange={(e) => setEditForm({...editForm, quantity: Number(e.target.value)})}
                                              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white text-center focus:ring-1 focus:ring-blue-500 outline-none"
                                          />
                                      </div>
                                      <div className="flex flex-col w-28">
                                          <label className="text-[10px] text-gray-400">Harga</label>
                                          <input 
                                              type="number"
                                              value={editForm.price}
                                              onChange={(e) => setEditForm({...editForm, price: Number(e.target.value)})}
                                              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white text-right focus:ring-1 focus:ring-blue-500 outline-none"
                                          />
                                      </div>
                                  </div>
                              )}
                            </div>

                            {/* TOMBOL AKSI */}
                            <div className="flex gap-1">
                                {!isEditing ? (
                                    <>
                                        <button onClick={() => startEdit(item)} className="p-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors" title="Edit">
                                            <Pencil size={14}/>
                                        </button>
                                        <button onClick={() => handleProcessItem(item, 'Tolak')} className="p-1.5 rounded bg-red-900/20 text-red-400 hover:bg-red-900/50 transition-colors" title="Tolak">
                                            <X size={14}/>
                                        </button>
                                        <button onClick={() => handleProcessItem(item, 'Proses')} className="p-1.5 rounded bg-blue-900/20 text-blue-400 hover:bg-blue-900/50 transition-colors" title="ACC">
                                            <Check size={14}/>
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={cancelEdit} className="p-1.5 rounded bg-red-600 text-white hover:bg-red-500 transition-colors" title="Batal">
                                            <XCircle size={16}/>
                                        </button>
                                        <button onClick={() => saveEdit(item.id)} className="p-1.5 rounded bg-green-600 text-white hover:bg-green-500 transition-colors" title="Simpan">
                                            <Save size={16}/>
                                        </button>
                                    </>
                                )}
                            </div>
                          </div>
                        </div>
                      )})}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* --- 3. TAB TERJUAL & RETUR (TIDAK BERUBAH) --- */}
        {activeTab === 'TERJUAL' && (
          <div className="space-y-2">
            {filterList(soldData).length === 0 && <EmptyState msg="Belum ada data penjualan." />}
            {filterList(soldData).map(item => (
              <div key={item.id} className="bg-gray-800/50 border border-gray-700 p-3 rounded-lg flex justify-between items-center hover:bg-gray-800 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-gray-500">{new Date(item.created_at).toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'})}</span>
                    <span className="text-[10px] bg-gray-700 px-1.5 rounded text-gray-400">{item.ecommerce || 'OFFLINE'}</span>
                  </div>
                  <h4 className="font-bold text-white text-sm">{item.name}</h4>
                  <p className="text-xs text-gray-400">{item.customer} • {item.tempo}</p>
                </div>
                <div className="text-right pl-4 border-l border-gray-700">
                  <p className="text-lg font-bold text-green-400">{item.qty_keluar}</p>
                  <p className="text-[10px] text-gray-500">Pcs</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'RETUR' && (
          <div className="space-y-3">
            {filterList(returData).length === 0 && <EmptyState msg="Tidak ada data retur." />}
            {filterList(returData).map((item, idx) => (
              <div key={idx} className="bg-red-900/10 border border-red-900/30 p-4 rounded-xl flex justify-between items-center">
                <div>
                   <span className="text-[10px] font-bold bg-red-900/50 text-red-300 px-2 py-0.5 rounded border border-red-800 mb-1 inline-block">RETUR</span>
                   <h4 className="font-bold text-white">{item.nama_barang}</h4>
                   <p className="text-sm text-gray-400">{item.customer} (Resi: {item.resi})</p>
                   <p className="text-xs text-gray-500 mt-1 italic">"{item.keterangan}"</p>
                </div>
                <div className="text-right">
                   <p className="text-xl font-bold text-red-400">{item.quantity}</p>
                   <p className="text-xs text-gray-500">Dikembalikan</p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

const EmptyState = ({ msg }: { msg: string }) => (
  <div className="flex flex-col items-center justify-center h-64 text-gray-500">
    <Box size={48} className="mb-4 opacity-20" />
    <p>{msg}</p>
  </div>
);