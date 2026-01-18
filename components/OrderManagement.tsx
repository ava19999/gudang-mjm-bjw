// FILE: src/components/OrderManagement.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { 
  fetchOfflineOrders, fetchOnlineOrders, fetchSoldItems, fetchReturItems,
  processOfflineOrderItem, processOnlineOrderItem, returSoldItem
} from '../services/supabaseService';
import { OfflineOrderRow, OnlineOrderRow, SoldItemRow, ReturRow } from '../types';
import { 
  ClipboardList, Wifi, CheckCircle, RotateCcw, Search, RefreshCw, Box, Check, X, ChevronDown, ChevronUp, Layers, User, Trash2
} from 'lucide-react';
import { formatDateTimeWIB } from '../utils/timezone';

// Toast Component Sederhana
const Toast = ({ msg, type, onClose }: any) => (
  <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-xl flex items-center text-white text-sm font-bold animate-in fade-in slide-in-from-top-2 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
    {msg}
    <button onClick={onClose} className="ml-3 opacity-70 hover:opacity-100"><X size={14}/></button>
  </div>
);

export const OrderManagement: React.FC = () => {
  const { selectedStore } = useStore();
  const [activeTab, setActiveTab] = useState<'OFFLINE' | 'ONLINE' | 'TERJUAL' | 'RETUR'>('OFFLINE');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  
  // State untuk expand/collapse kartu grup
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  
  // State untuk filter TERJUAL
  const [soldFilter, setSoldFilter] = useState<'ALL' | 'OFFLINE' | 'ONLINE'>('ALL');
  const [onlineMarketFilter, setOnlineMarketFilter] = useState<'ALL' | 'SHOPEE' | 'TIKTOK' | 'RESELLER' | 'EXPORT'>('ALL');
  const [onlineStoreFilter, setOnlineStoreFilter] = useState<'ALL' | 'MJM' | 'BJW' | 'LARIS'>('ALL');
  const [exportCountryFilter, setExportCountryFilter] = useState<'ALL' | 'PH' | 'SG' | 'MY' | 'HK'>('ALL');
  
  // State untuk Retur Modal
  const [returModal, setReturModal] = useState<{ show: boolean, item: SoldItemRow | null, items?: SoldItemRow[] }>({ show: false, item: null, items: undefined });

  // Data State
  const [offlineData, setOfflineData] = useState<OfflineOrderRow[]>([]);
  const [onlineData, setOnlineData] = useState<OnlineOrderRow[]>([]);
  const [soldData, setSoldData] = useState<SoldItemRow[]>([]);
  const [returData, setReturData] = useState<ReturRow[]>([]);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'OFFLINE') setOfflineData(await fetchOfflineOrders(selectedStore));
      if (activeTab === 'ONLINE') setOnlineData(await fetchOnlineOrders(selectedStore));
      if (activeTab === 'TERJUAL') setSoldData(await fetchSoldItems(selectedStore));
      if (activeTab === 'RETUR') setReturData(await fetchReturItems(selectedStore));
    } catch (e) {
      console.error("Gagal load data:", e);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [selectedStore, activeTab]);

  // --- LOGIC PENGELOMPOKAN OFFLINE (GROUPING) ---
  const groupedOfflineOrders = useMemo(() => {
    const groups: Record<string, { id: string, customer: string, tempo: string, date: string, items: OfflineOrderRow[], totalAmount: number }> = {};
    
    offlineData.forEach(item => {
      // Normalisasi Nama Customer untuk grouping
      const safeCustomer = (item.customer || 'Tanpa Nama').trim();
      const safeTempo = (item.tempo || 'CASH').trim();
      
      // Kunci Grouping: Nama + Tempo
      const key = `${safeCustomer}-${safeTempo}`;
      
      if (!groups[key]) {
        groups[key] = {
          id: key,
          customer: safeCustomer,
          tempo: safeTempo,
          date: item.tanggal,
          items: [],
          totalAmount: 0
        };
      }
      groups[key].items.push(item);
      groups[key].totalAmount += (Number(item.harga_total) || 0);
    });

    // Ubah object ke array & urutkan berdasarkan tanggal terbaru
    return Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [offlineData]);

  // --- LOGIC PENGELOMPOKAN SOLD (GROUPING) ---
  const groupedSoldOrders = useMemo(() => {
    const groups: Record<string, { 
      id: string, 
      customer: string, 
      tempo: string, 
      ecommerce: string,
      kode_toko: string,
      date: string, 
      items: SoldItemRow[], 
      totalQty: number,
      totalAmount: number 
    }> = {};
    
    soldData.forEach(item => {
      // Normalisasi untuk grouping
      const safeCustomer = (item.customer || 'Tanpa Nama').trim();
      const safeTempo = (item.tempo || 'CASH').trim();
      const safeEcom = (item.ecommerce || 'OFFLINE').trim();
      
      // Kunci Grouping: Customer + Tempo + Ecommerce + Tanggal (untuk memisahkan transaksi berbeda)
      const dateKey = formatDateTimeWIB(item.created_at);
      const key = `${safeCustomer}-${safeTempo}-${safeEcom}-${dateKey}`;
      
      if (!groups[key]) {
        groups[key] = {
          id: key,
          customer: safeCustomer,
          tempo: safeTempo,
          ecommerce: safeEcom,
          kode_toko: item.kode_toko || '',
          date: item.created_at,
          items: [],
          totalQty: 0,
          totalAmount: 0
        };
      }
      groups[key].items.push(item);
      groups[key].totalQty += (Number(item.qty_keluar) || 0);
      groups[key].totalAmount += (Number(item.harga_total) || 0);
    });

    // Ubah object ke array & urutkan berdasarkan tanggal terbaru
    return Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [soldData]);

  // --- HANDLERS ---

  // Proses SATUAN (Offline)
  const handleProcessItem = async (item: OfflineOrderRow, action: 'Proses' | 'Tolak') => {
    if (!confirm(`Yakin ingin ${action} barang ini: ${item.nama_barang}?`)) return;
    setLoading(true);
    const res = await processOfflineOrderItem(item, selectedStore, action);
    setLoading(false);
    
    if (res.success) {
      showToast(action === 'Proses' ? 'Barang di-ACC' : 'Barang Ditolak');
      loadData();
    } else {
      showToast(res.msg, 'error');
    }
  };

  // Proses SEMUA dalam satu Grup (Offline)
  const handleProcessGroup = async (items: OfflineOrderRow[], action: 'Proses' | 'Tolak') => {
    const actionText = action === 'Proses' ? 'ACC / TERIMA' : 'TOLAK';
    if (!confirm(`Yakin ingin ${actionText} SEMUA (${items.length} item) untuk pelanggan ini?`)) return;
    
    setLoading(true);
    let successCount = 0;
    
    for (const item of items) {
      const res = await processOfflineOrderItem(item, selectedStore, action);
      if (res.success) successCount++;
    }
    
    setLoading(false);
    showToast(`Berhasil memproses ${successCount} dari ${items.length} item.`);
    loadData();
  };

  const handleAccOnline = async (item: OnlineOrderRow) => {
    if (!confirm('ACC Resi ini? Barang akan keluar.')) return;
    setLoading(true);
    const success = await processOnlineOrderItem(item, selectedStore);
    setLoading(false);
    if (success) { showToast('Order Online Berhasil Diproses!'); loadData(); }
    else showToast('Gagal memproses order online', 'error');
  };

  // Handler Retur - Open Modal (Single Item)
  const handleOpenReturModal = (item: SoldItemRow) => {
    setReturModal({ show: true, item, items: undefined });
  };

  // Handler Retur - Open Modal (Group)
  const handleOpenReturGroupModal = (items: SoldItemRow[]) => {
    setReturModal({ show: true, item: null, items });
  };

  // Handler Retur - Process
  const handleProcessRetur = async (keterangan: 'KEMBALI KE STOCK' | 'BARANG RUSAK') => {
    setLoading(true);
    
    // Process single item
    if (returModal.item) {
      const res = await returSoldItem(returModal.item, selectedStore, keterangan);
      setLoading(false);
      
      if (res.success) {
        showToast(res.msg);
        setReturModal({ show: false, item: null, items: undefined });
        loadData();
      } else {
        showToast(res.msg, 'error');
      }
    }
    // Process group items
    else if (returModal.items && returModal.items.length > 0) {
      let successCount = 0;
      
      for (const item of returModal.items) {
        const res = await returSoldItem(item, selectedStore, keterangan);
        if (res.success) successCount++;
      }
      
      setLoading(false);
      showToast(`Berhasil retur ${successCount} dari ${returModal.items.length} item - ${keterangan}`);
      setReturModal({ show: false, item: null, items: undefined });
      loadData();
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatRupiah = (val: number) => `Rp ${val.toLocaleString('id-ID')}`;

  // Filter Search Logic (Online, Terjual, Retur)
  const filterList = (list: any[]) => {
    if (!searchTerm) return list;
    const lower = searchTerm.toLowerCase();
    return list.filter(item => 
      (item.customer || '').toLowerCase().includes(lower) ||
      (item.nama_barang || item.name || item.barang || '').toLowerCase().includes(lower) ||
      (item.resi || '').toLowerCase().includes(lower) ||
      (item.part_number || '').toLowerCase().includes(lower)
    );
  };

  // Filter Search Logic (Offline Grouped)
  const filteredGroupedOffline = groupedOfflineOrders.filter(group => 
    group.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.items.some(i => i.nama_barang.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Filter Search Logic (Sold Grouped)
  const filteredGroupedSold = groupedSoldOrders.filter(group => 
    group.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.items.some(i => (i.name || '').toLowerCase().includes(searchTerm.toLowerCase()))
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
                      
                      {/* Baris Atas Info */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${group.tempo === 'CASH' ? 'bg-green-900/30 border-green-800 text-green-400' : 'bg-orange-900/30 border-orange-800 text-orange-400'}`}>
                          {group.tempo}
                        </span>
                        <span className="text-[10px] font-mono bg-gray-700 px-2 py-0.5 rounded text-gray-300">
                          {formatDateTimeWIB(group.date)}
                        </span>
                        <span className="text-[10px] bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded border border-blue-800 flex items-center gap-1">
                          <Layers size={10} /> {group.items.length} Item
                        </span>
                      </div>

                      {/* Nama Customer */}
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronUp size={20} className="text-purple-400"/> : <ChevronDown size={20} className="text-gray-400"/>}
                        <h3 className="font-bold text-lg text-white flex items-center gap-2">
                          <User size={18} className="text-gray-400"/> {group.customer}
                        </h3>
                      </div>
                    </div>

                    {/* Total & Action Buttons */}
                    <div className="flex flex-col items-end gap-2 border-t md:border-t-0 border-gray-700 pt-3 md:pt-0">
                      <div>
                        <span className="text-gray-400 text-xs mr-2">Total Tagihan:</span>
                        <span className="text-xl font-bold text-green-400">{formatRupiah(group.totalAmount)}</span>
                      </div>
                      <div className="flex gap-2 w-full md:w-auto">
                        <button 
                          onClick={() => handleProcessGroup(group.items, 'Tolak')}
                          className="flex-1 md:flex-none bg-red-900/20 text-red-400 px-4 py-2 rounded-lg hover:bg-red-900/40 border border-red-900/50 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                          <X size={14}/> TOLAK SEMUA
                        </button>
                        <button 
                          onClick={() => handleProcessGroup(group.items, 'Proses')}
                          className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 shadow-lg shadow-blue-900/30 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                          <Check size={14}/> ACC SEMUA
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ITEM LIST (EXPANDABLE) */}
                  {isExpanded && (
                    <div className="bg-gray-900/80 border-t border-gray-700 p-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
                      {group.items.map((item, idx) => (
                        <div key={`${item.id}-${idx}`} className="flex justify-between items-center p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 ml-4 mr-2">
                          <div>
                            <p className="text-sm font-bold text-white">{item.nama_barang}</p>
                            <p className="text-[10px] text-gray-500 font-mono">Part: {item.part_number}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm font-bold text-white">{item.quantity} x {formatRupiah(item.harga_satuan)}</p>
                              <p className="text-xs text-green-400 font-mono">{formatRupiah(item.harga_total)}</p>
                            </div>
                            {/* Tombol Aksi Satuan */}
                            <div className="flex gap-1">
                              <button 
                                onClick={() => handleProcessItem(item, 'Tolak')} 
                                className="p-1.5 rounded bg-red-900/20 text-red-400 hover:bg-red-900/50 transition-colors" 
                                title="Tolak Satu Ini"
                              >
                                <X size={14}/>
                              </button>
                              <button 
                                onClick={() => handleProcessItem(item, 'Proses')} 
                                className="p-1.5 rounded bg-blue-900/20 text-blue-400 hover:bg-blue-900/50 transition-colors" 
                                title="ACC Satu Ini"
                              >
                                <Check size={14}/>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* --- 2. TAB TERJUAL (History Barang Keluar) --- */}
        {activeTab === 'TERJUAL' && (
          <>
            {/* Filter Section */}
            <div className="sticky top-0 z-10 bg-gray-800/95 backdrop-blur-sm border-b border-gray-700 p-4 space-y-3">
              {/* Main Filter: OFFLINE / ONLINE */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {['ALL', 'OFFLINE', 'ONLINE'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => {
                      setSoldFilter(filter as any);
                      setOnlineMarketFilter('ALL');
                      setOnlineStoreFilter('ALL');
                      setExportCountryFilter('ALL');
                    }}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap transition-all ${
                      soldFilter === filter 
                        ? 'bg-purple-600 text-white shadow-lg' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Sub-Filter untuk ONLINE */}
              {soldFilter === 'ONLINE' && (
                <div className="space-y-2">
                  {/* Marketplace Type */}
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <span className="text-xs text-gray-400 font-semibold whitespace-nowrap pt-2">Marketplace:</span>
                    {['ALL', 'SHOPEE', 'TIKTOK', 'RESELLER', 'EXPORT'].map(market => (
                      <button
                        key={market}
                        onClick={() => {
                          setOnlineMarketFilter(market as any);
                          if (market !== 'EXPORT') setExportCountryFilter('ALL');
                          if (market === 'RESELLER') setOnlineStoreFilter('ALL');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                          onlineMarketFilter === market 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {market}
                      </button>
                    ))}
                  </div>

                  {/* Store Filter (untuk SHOPEE, TIKTOK, EXPORT) */}
                  {(onlineMarketFilter === 'SHOPEE' || onlineMarketFilter === 'TIKTOK' || onlineMarketFilter === 'EXPORT') && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      <span className="text-xs text-gray-400 font-semibold whitespace-nowrap pt-2">Toko:</span>
                      {['ALL', 'MJM', 'BJW', 'LARIS'].map(store => (
                        <button
                          key={store}
                          onClick={() => setOnlineStoreFilter(store as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            onlineStoreFilter === store 
                              ? 'bg-green-600 text-white' 
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {store}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Country Filter (untuk EXPORT) */}
                  {onlineMarketFilter === 'EXPORT' && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      <span className="text-xs text-gray-400 font-semibold whitespace-nowrap pt-2">Negara:</span>
                      {['ALL', 'PH', 'SG', 'MY', 'HK'].map(country => (
                        <button
                          key={country}
                          onClick={() => setExportCountryFilter(country as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            exportCountryFilter === country 
                              ? 'bg-yellow-600 text-white' 
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {country}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Data List */}
            <div className="space-y-2">
              {(() => {
                let filtered = filteredGroupedSold;

                // Filter berdasarkan OFFLINE/ONLINE
                if (soldFilter === 'OFFLINE') {
                  filtered = filtered.filter(group => !group.ecommerce || group.ecommerce === 'OFFLINE' || group.ecommerce === '');
                } else if (soldFilter === 'ONLINE') {
                  filtered = filtered.filter(group => group.ecommerce && group.ecommerce !== 'OFFLINE' && group.ecommerce !== '');

                  // Sub-filter marketplace
                  if (onlineMarketFilter !== 'ALL') {
                    if (onlineMarketFilter === 'SHOPEE') {
                      filtered = filtered.filter(group => {
                        const ecom = (group.ecommerce || '').toUpperCase();
                        const match = ecom.includes('SHOPEE') || ecom.includes('SHOPPE');
                        if (onlineStoreFilter !== 'ALL') {
                          return match && ecom.includes(onlineStoreFilter);
                        }
                        return match;
                      });
                    } else if (onlineMarketFilter === 'TIKTOK') {
                      filtered = filtered.filter(group => {
                        const ecom = (group.ecommerce || '').toUpperCase();
                        const match = ecom.includes('TIKTOK');
                        if (onlineStoreFilter !== 'ALL') {
                          return match && ecom.includes(onlineStoreFilter);
                        }
                        return match;
                      });
                    } else if (onlineMarketFilter === 'RESELLER') {
                      filtered = filtered.filter(group => {
                        const ecom = (group.ecommerce || '').toUpperCase();
                        return ecom.includes('RESELLER');
                      });
                    } else if (onlineMarketFilter === 'EXPORT') {
                      filtered = filtered.filter(group => {
                        const ecom = (group.ecommerce || '').toUpperCase();
                        const match = ecom.includes('EXPORT');
                        if (match) {
                          if (onlineStoreFilter !== 'ALL' && !ecom.includes(onlineStoreFilter)) {
                            return false;
                          }
                          if (exportCountryFilter !== 'ALL' && !ecom.includes(exportCountryFilter)) {
                            return false;
                          }
                        }
                        return match;
                      });
                    }
                  }
                }

                return filtered.length === 0 ? (
                  <EmptyState msg="Belum ada data penjualan." />
                ) : (
                  filtered.map(group => {
                    const isExpanded = expandedGroups[group.id];
                    return (
                      <div key={group.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
                        {/* HEADER GROUP */}
                        <div className="p-4 flex flex-col md:flex-row justify-between gap-4">
                          {/* Info Customer & Date - Clickable */}
                          <div 
                            onClick={() => setExpandedGroups(prev => ({...prev, [group.id]: !prev[group.id]}))}
                            className="flex-1 cursor-pointer hover:bg-gray-750/30 rounded-lg p-2 -m-2 transition-colors"
                          >
                            <div className="flex items-start gap-3 mb-2">
                              {isExpanded ? <ChevronUp size={20} className="text-purple-400 mt-1"/> : <ChevronDown size={20} className="text-gray-400 mt-1"/>}
                              <div>
                                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                  <User size={18} className="text-gray-400"/> {group.customer}
                                </h3>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-[10px] text-gray-500">{formatDateTimeWIB(group.date)}</span>
                                  <span className="text-[10px] bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">{group.ecommerce}</span>
                                  {group.kode_toko && <span className="text-[10px] bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded">{group.kode_toko}</span>}
                                  <span className="text-[10px] bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded font-semibold">{group.tempo}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Total Qty & Amount + Retur Button */}
                          <div className="flex items-center gap-3 border-t md:border-t-0 border-gray-700 pt-3 md:pt-0">
                            <div className="text-center px-3 border-r border-gray-700">
                              <p className="text-xs text-gray-400">Total Items</p>
                              <p className="text-lg font-bold text-blue-400">{group.items.length}</p>
                            </div>
                            <div className="text-center px-3 border-r border-gray-700">
                              <p className="text-xs text-gray-400">Total Qty</p>
                              <p className="text-lg font-bold text-green-400">{group.totalQty}</p>
                            </div>
                            <div className="text-right px-3 border-r border-gray-700">
                              <p className="text-xs text-gray-400">Total Harga</p>
                              <p className="text-lg font-bold text-green-400">{formatRupiah(group.totalAmount)}</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenReturGroupModal(group.items);
                              }}
                              className="p-3 rounded-lg bg-red-900/20 text-red-400 hover:bg-red-900/50 border border-red-900/50 transition-colors"
                              title="Retur Semua Item"
                            >
                              <Trash2 size={20} />
                            </button>
                          </div>
                        </div>

                        {/* ITEM LIST (EXPANDABLE) */}
                        {isExpanded && (
                          <div className="bg-gray-900/80 border-t border-gray-700 p-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
                            {group.items.map((item, idx) => (
                              <div key={`${item.id}-${idx}`} className="flex justify-between items-center p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 ml-4 mr-2">
                                <div className="flex-1">
                                  <p className="text-sm font-bold text-white">{item.name}</p>
                                  <p className="text-[10px] text-gray-500 font-mono">Part: {item.part_number}</p>
                                  {item.resi && <p className="text-[10px] text-gray-500">Resi: {item.resi}</p>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right pl-4 border-l border-gray-700">
                                    <p className="text-sm font-bold text-white">{item.qty_keluar} pcs</p>
                                    <p className="text-xs text-gray-400">{formatRupiah(item.harga_satuan)}/pcs</p>
                                    <p className="text-xs text-green-400 font-mono font-semibold">{formatRupiah(item.harga_total)}</p>
                                  </div>
                                  <button
                                    onClick={() => handleOpenReturModal(item)}
                                    className="p-2 rounded bg-red-900/20 text-red-400 hover:bg-red-900/50 transition-colors"
                                    title="Retur Barang"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                );
              })()}
            </div>
          </>
        )}

        {/* --- 4. TAB RETUR --- */}
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

      {/* MODAL RETUR */}
      {returModal.show && (returModal.item || returModal.items) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <RotateCcw className="text-red-400" size={24} />
                Retur Barang {returModal.items ? `(${returModal.items.length} Items)` : ''}
              </h3>
              <button 
                onClick={() => setReturModal({ show: false, item: null, items: undefined })}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Item Info */}
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 mb-6 max-h-64 overflow-y-auto">
              {returModal.item ? (
                <>
                  <p className="text-sm font-bold text-white mb-1">{returModal.item.name}</p>
                  <p className="text-xs text-gray-400">Part: {returModal.item.part_number}</p>
                  <p className="text-xs text-gray-400">Customer: {returModal.item.customer}</p>
                  <p className="text-xs text-gray-400">Qty: {returModal.item.qty_keluar} pcs</p>
                </>
              ) : returModal.items ? (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-white mb-2">Item yang akan diretur:</p>
                  {returModal.items.map((item, idx) => (
                    <div key={idx} className="bg-gray-800 p-2 rounded border border-gray-700">
                      <p className="text-xs font-semibold text-white">{item.name}</p>
                      <p className="text-[10px] text-gray-500">Part: {item.part_number} • Qty: {item.qty_keluar} pcs</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Pilihan Keterangan */}
            <div className="space-y-3">
              <p className="text-sm text-gray-400 font-semibold">Pilih Jenis Retur:</p>
              
              <button
                onClick={() => handleProcessRetur('KEMBALI KE STOCK')}
                className="w-full p-4 bg-green-900/20 border border-green-900/50 rounded-lg hover:bg-green-900/40 transition-colors text-left group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-green-400 text-sm">KEMBALI KE STOCK</p>
                    <p className="text-xs text-gray-400 mt-1">Barang akan dikembalikan ke stok gudang</p>
                  </div>
                  <CheckCircle className="text-green-400 group-hover:scale-110 transition-transform" size={24} />
                </div>
              </button>

              <button
                onClick={() => handleProcessRetur('BARANG RUSAK')}
                className="w-full p-4 bg-red-900/20 border border-red-900/50 rounded-lg hover:bg-red-900/40 transition-colors text-left group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-red-400 text-sm">BARANG RUSAK</p>
                    <p className="text-xs text-gray-400 mt-1">Barang rusak, tidak kembali ke stok</p>
                  </div>
                  <X className="text-red-400 group-hover:scale-110 transition-transform" size={24} />
                </div>
              </button>

              <button
                onClick={() => setReturModal({ show: false, item: null })}
                className="w-full p-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 font-semibold text-sm transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ msg }: { msg: string }) => (
  <div className="flex flex-col items-center justify-center h-64 text-gray-500">
    <Box size={48} className="mb-4 opacity-20" />
    <p>{msg}</p>
  </div>
);