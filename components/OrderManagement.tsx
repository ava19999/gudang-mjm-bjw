// FILE: src/components/OrderManagement.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderStatus, ReturRecord } from '../types';
import { 
  fetchReturRecords, updateReturKeterangan, getItemByPartNumber, 
  updateInventory, addReturTransaction, updateOrderData, saveOrder 
} from '../services/supabaseService';
import { 
  ClipboardList, Clock, ScanBarcode, Package, CheckCircle, Search, X, Loader2, XCircle 
} from 'lucide-react';
import { NoteModal, ReturnModal } from './orders/OrderModals';
import { OrderScanView } from './orders/OrderScanView';
import { OrderListView, ReturnHistoryView } from './orders/OrderTables';
import { getLocalISOString, getOrderDetails, getWIBISOString } from '../utils/orderHelpers';

// --- TOAST COMPONENT ---
const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-xl flex items-center text-white text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300 border ${type === 'success' ? 'bg-gray-800 border-gray-600 shadow-green-900/20' : 'bg-red-900/90 border-red-700'}`}>
      {type === 'success' ? <CheckCircle size={18} className="mr-2 text-green-400" /> : <XCircle size={18} className="mr-2 text-red-300" />}
      {message}
    </div>
  );
};

interface OrderManagementProps {
  orders: Order[];
  isLoading?: boolean;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  onProcessReturn: (orderId: string, returnedItems: { itemId: string, qty: number }[]) => void;
  onRefresh?: () => void;
}

export const OrderManagement: React.FC<OrderManagementProps> = ({ orders = [], isLoading = false, onUpdateStatus, onRefresh }) => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'pending' | 'scan' | 'processing' | 'history'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const showToast = (msg: string, type: 'success'|'error' = 'success') => setToast({msg, type});
  const [currentPage, setCurrentPage] = useState(1);
  const [returDbRecords, setReturDbRecords] = useState<ReturRecord[]>([]);

  // Modal States
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedOrderForReturn, setSelectedOrderForReturn] = useState<Order | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNoteData, setEditingNoteData] = useState<{ id: string, resi: string, currentText: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // --- EFFECTS ---
  useEffect(() => { fetchReturRecords().then(setReturDbRecords); }, [activeTab, orders]);
  useEffect(() => { setSearchTerm(''); setCurrentPage(1); }, [activeTab]);

  // --- FILTERED DATA ---
  const safeOrders = Array.isArray(orders) ? orders : [];
  const filteredData = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    if (activeTab === 'history') {
        return returDbRecords.filter(r => !searchTerm || (r.resi+r.customer+r.nama_barang).toLowerCase().includes(lowerSearch)).sort((a, b) => new Date(b.tanggal_retur).getTime() - new Date(a.tanggal_retur).getTime());
    } else if (activeTab === 'pending' || activeTab === 'processing') {
        return safeOrders.filter(o => o?.status === activeTab).filter(o => !searchTerm || (o.id+o.customerName).toLowerCase().includes(lowerSearch)).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }
    return [];
  }, [safeOrders, returDbRecords, activeTab, searchTerm]);

  // --- HANDLERS RETUR & NOTE ---
  const openNoteModal = (retur: ReturRecord) => {
    setEditingNoteData({ id: retur.id ? retur.id.toString() : '', resi: retur.resi || '', currentText: retur.keterangan || '' });
    setNoteText(retur.keterangan || ''); setIsNoteModalOpen(true);
  };

  const handleSaveNote = async () => {
    if (!editingNoteData) return; setIsSavingNote(true);
    try {
        if (await updateReturKeterangan(editingNoteData.resi, noteText)) {
            setReturDbRecords(prev => prev.map(item => (item.id && item.id.toString() === editingNoteData.id) || item.resi === editingNoteData.resi ? { ...item, keterangan: noteText } : item));
            setIsNoteModalOpen(false);
        } else { showToast("Gagal menyimpan keterangan.", 'error'); }
    } catch (error) { console.error("Error saving note:", error); } finally { setIsSavingNote(false); }
  };

  const openReturnModal = (order: Order) => {
    setSelectedOrderForReturn(order);
    const initialQty: Record<string, number> = {};
    order.items.forEach(item => { initialQty[item.id] = 0; });
    setReturnQuantities(initialQty); setIsReturnModalOpen(true);
  };

  const handleProcessReturn = async () => {
    if (!selectedOrderForReturn) return;
    const itemsToReturnData = selectedOrderForReturn.items.map(item => {
          const qtyRetur = returnQuantities[item.id] || 0;
          return qtyRetur > 0 ? { ...item, cartQuantity: qtyRetur } : null;
      }).filter(Boolean) as any[];

    if (itemsToReturnData.length === 0) return;
    setIsProcessingReturn(true);

    try {
      const { resiText, shopName, ecommerce, cleanName } = getOrderDetails(selectedOrderForReturn);
      const combinedResiShop = `${resiText} / ${shopName}`;
      const orderTimestamp = selectedOrderForReturn.timestamp ? getLocalISOString(selectedOrderForReturn.timestamp) : getWIBISOString();
      const currentReturDate = getWIBISOString();

      const remainingItems = selectedOrderForReturn.items.map(item => {
          const returItem = itemsToReturnData.find(r => r.id === item.id);
          const qtyReturned = returItem ? returItem.cartQuantity : 0;
          return { ...item, cartQuantity: (item.cartQuantity || 0) - qtyReturned };
      }).filter(item => (item.cartQuantity || 0) > 0);

      const statusLabel = remainingItems.length === 0 ? 'Full Retur' : 'Retur Sebagian';

      for (const item of itemsToReturnData) {
          const hargaSatuan = item.customPrice ?? item.price ?? 0;
          const realItem = await getItemByPartNumber(item.partNumber);
          if (realItem) {
              await updateInventory({ ...realItem, quantity: realItem.quantity }, {
                  type: 'in', qty: item.cartQuantity, ecommerce, resiTempo: combinedResiShop, customer: cleanName, price: hargaSatuan, isReturn: true 
              });
          }
          const returData: ReturRecord = {
              tanggal_pemesanan: orderTimestamp, resi: resiText, toko: shopName, ecommerce, customer: cleanName,
              part_number: item.partNumber, nama_barang: item.name, quantity: item.cartQuantity,
              harga_satuan: hargaSatuan, harga_total: hargaSatuan * item.cartQuantity, tanggal_retur: currentReturDate, status: statusLabel, keterangan: 'Retur Barang'
          };
          await addReturTransaction(returData);
      }

      if (remainingItems.length === 0) {
          await updateOrderData(selectedOrderForReturn.id, selectedOrderForReturn.items, selectedOrderForReturn.totalAmount, 'cancelled');
      } else {
          const returnTotal = itemsToReturnData.reduce((sum, item) => sum + ((item.customPrice ?? item.price ?? 0) * item.cartQuantity), 0);
          await saveOrder({ 
              id: `${selectedOrderForReturn.id}-RET-${Date.now()}`, customerName: `${selectedOrderForReturn.customerName} (RETUR)`, 
              items: itemsToReturnData, totalAmount: returnTotal, status: 'cancelled', timestamp: Date.now() 
          });
          const remainingTotal = remainingItems.reduce((sum, item) => sum + ((item.customPrice ?? item.price ?? 0) * item.cartQuantity), 0);
          await updateOrderData(selectedOrderForReturn.id, remainingItems, remainingTotal, 'processing');
      }

      setIsReturnModalOpen(false); setSelectedOrderForReturn(null); setActiveTab('history');
      if (onRefresh) onRefresh();
    } catch (error) { console.error("Error processing return:", error); } 
    finally { setIsProcessingReturn(false); }
  };

  return (
    <div className="bg-gray-800 rounded-2xl shadow-sm border border-gray-700 min-h-[80vh] flex flex-col overflow-hidden relative text-gray-100">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <NoteModal isOpen={isNoteModalOpen} noteText={noteText} setNoteText={setNoteText} onClose={() => setIsNoteModalOpen(false)} onSave={handleSaveNote} isSaving={isSavingNote} />
      <ReturnModal isOpen={isReturnModalOpen} order={selectedOrderForReturn} returnQuantities={returnQuantities} setReturnQuantities={setReturnQuantities} onClose={() => setIsReturnModalOpen(false)} onProcess={handleProcessReturn} isProcessing={isProcessingReturn} />

      {/* HEADER */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800 flex justify-between items-center">
          <div><h2 className="text-lg font-bold text-gray-100 flex items-center gap-2"><ClipboardList className="text-purple-400" size={20} /> Manajemen Pesanan</h2></div>
          <div className="flex items-center gap-3">
              {isLoading && (<div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/20 text-blue-400 rounded-full border border-blue-900/50 animate-pulse"><Loader2 size={14} className="animate-spin" /><span className="text-xs font-medium">Sinkronisasi Data...</span></div>)}
          </div>
      </div>

      {/* TABS */}
      <div className="flex border-b border-gray-700 bg-gray-900/50">
          {[{ id: 'pending', label: 'Baru', icon: Clock, count: safeOrders.filter(o=>o?.status==='pending').length, color: 'text-amber-400' }, { id: 'scan', label: 'Scan Resi', icon: ScanBarcode, count: 0, color: 'text-gray-300' }, { id: 'processing', label: 'Terjual', icon: Package, count: 0, color: 'text-blue-400' }, { id: 'history', label: 'Retur', icon: CheckCircle, count: returDbRecords.length, color: 'text-red-400' }].map((tab: any) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-all hover:bg-gray-800 relative ${activeTab === tab.id ? `border-purple-500 text-purple-400 bg-gray-800` : 'border-transparent text-gray-500 hover:text-gray-300'}`}><tab.icon size={16} className={activeTab === tab.id ? tab.color : ''} /><span>{tab.label}</span>{tab.id === 'pending' && tab.count > 0 && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full min-w-[16px] text-center">{tab.count}</span>}</button>
          ))}
      </div>

      {/* SEARCH BAR */}
      <div className="px-4 py-2 bg-gray-900 border-b border-gray-700">
          <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input type="text" placeholder={activeTab === 'scan' ? "Cari Resi / Pelanggan..." : "Cari Pesanan..."} className="w-full pl-9 pr-8 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-1 focus:ring-purple-900 focus:border-purple-500 outline-none transition-all text-white placeholder-gray-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
              {searchTerm && (<button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"><X size={12} /></button>)}
          </div>
      </div>

      {/* CONTENT SWITCHER */}
      {activeTab === 'scan' ? (
          <OrderScanView onShowToast={showToast} onRefreshParent={onRefresh || (() => {})} searchTerm={searchTerm} />
      ) : activeTab === 'history' ? (
          <ReturnHistoryView returRecords={filteredData as ReturRecord[]} openNoteModal={openNoteModal} page={currentPage} setPage={setCurrentPage} />
      ) : (
          <OrderListView orders={filteredData as Order[]} onUpdateStatus={onUpdateStatus} openReturnModal={openReturnModal} page={currentPage} setPage={setCurrentPage} />
      )}
    </div>
  );
};