// FILE: src/components/OrderManagement.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { useStore } from '../context/StoreContext';
import { 
  fetchOfflineOrders, fetchSoldItems, fetchReturItems,
  processOfflineOrderItem, updateOfflineOrder, fetchInventory, createReturFromSold, updateReturStatus,
  fetchDistinctEcommerce, deleteBarangLog
} from '../services/supabaseService';
import { OfflineOrderRow, SoldItemRow, ReturRow } from '../types';
import { 
  ClipboardList, CheckCircle, RotateCcw, Search, RefreshCw, Box, Check, X, 
  ChevronDown, ChevronUp, Layers, User, Pencil, Save, XCircle, Trash2, ChevronLeft, ChevronRight,
  PackageX, RotateCw, ArrowLeftRight, Package, Hash, ShoppingBag, Copy
} from 'lucide-react';

// Toast Component Sederhana
const Toast = ({ msg, type, onClose }: any) => (
  <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-xl flex items-center text-white text-sm font-bold animate-in fade-in slide-in-from-top-2 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
    {msg}
    <button onClick={onClose} className="ml-3 opacity-70 hover:opacity-100"><X size={14}/></button>
  </div>
);

// Helper untuk warna background berdasarkan ecommerce
const getEcommerceColor = (ecommerce: string) => {
  const upper = (ecommerce || '').toUpperCase();
  switch (upper) {
    case 'SHOPEE':
    case 'SHOPPE':
      return { bg: 'bg-orange-900/20', border: 'border-orange-700/50', text: 'text-orange-400' };
    case 'TIKTOK':
      return { bg: 'bg-pink-900/20', border: 'border-pink-700/50', text: 'text-pink-400' };
    case 'TOKOPEDIA':
      return { bg: 'bg-green-900/20', border: 'border-green-700/50', text: 'text-green-400' };
    case 'LAZADA':
      return { bg: 'bg-blue-900/20', border: 'border-blue-700/50', text: 'text-blue-400' };
    case 'KILAT':
      return { bg: 'bg-yellow-900/20', border: 'border-yellow-700/50', text: 'text-yellow-400' };
    case 'RESELLER':
      return { bg: 'bg-purple-900/20', border: 'border-purple-700/50', text: 'text-purple-400' };
    case 'OFFLINE':
      return { bg: 'bg-gray-800', border: 'border-gray-600', text: 'text-gray-300' };
    default:
      return { bg: 'bg-gray-800', border: 'border-gray-600', text: 'text-gray-300' };
  }
};

// Autocomplete Dropdown with Keyboard Navigation
interface AutocompleteDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  icon: React.ReactNode;
}

const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({ value, onChange, options, placeholder, icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Reset highlighted index when options change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [options]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && options.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < options.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && options[highlightedIndex]) {
          onChange(options[highlightedIndex]);
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        {icon}
      </div>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none text-white placeholder-gray-500"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => options.length > 0 && setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        onKeyDown={handleKeyDown}
      />
      {isOpen && options.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 max-h-60 overflow-auto bg-gray-800 border border-gray-600 rounded-xl shadow-xl"
        >
          {options.map((option, index) => (
            <li
              key={option}
              className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                index === highlightedIndex
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-200 hover:bg-gray-700'
              }`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(option)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Retur Modal Component
interface ReturModalProps {
  isOpen: boolean;
  item: SoldItemRow | null;
  onClose: () => void;
  onConfirm: (item: SoldItemRow, tipeRetur: 'BALIK_STOK' | 'RUSAK' | 'TUKAR_SUPPLIER', qty: number, keterangan: string) => void;
}

const ReturModal: React.FC<ReturModalProps> = ({ isOpen, item, onClose, onConfirm }) => {
  const [tipeRetur, setTipeRetur] = useState<'BALIK_STOK' | 'RUSAK' | 'TUKAR_SUPPLIER'>('BALIK_STOK');
  const [qty, setQty] = useState(1);
  const [keterangan, setKeterangan] = useState('');

  useEffect(() => {
    if (item) {
      setQty(item.qty_keluar);
      setTipeRetur('BALIK_STOK');
      setKeterangan('');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center gap-2">
            <RotateCcw className="text-red-400" size={20}/> Proses Retur
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20}/></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Info Barang */}
          <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
            <p className="text-base font-bold text-purple-400 font-mono">{item.part_number}</p>
            <p className="text-sm font-semibold text-white mt-1">{item.name}</p>
            {(item.brand || item.application) && (
              <p className="text-xs text-gray-400 mt-0.5">
                {item.brand && <span className="text-blue-300">{item.brand}</span>}
                {item.brand && item.application && <span className="mx-1">•</span>}
                {item.application && <span className="text-green-300">{item.application}</span>}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">Customer: {item.customer}</p>
          </div>

          {/* Qty Retur */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Jumlah Retur</label>
            <input
              type="number"
              min={1}
              max={item.qty_keluar}
              value={qty}
              onChange={(e) => setQty(Math.min(item.qty_keluar, Math.max(1, Number(e.target.value))))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
            <p className="text-[10px] text-gray-500 mt-1">Max: {item.qty_keluar} pcs</p>
          </div>

          {/* Tipe Retur */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Tipe Retur</label>
            <div className="space-y-2">
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${tipeRetur === 'BALIK_STOK' ? 'bg-green-900/30 border-green-600' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                <input type="radio" name="tipeRetur" checked={tipeRetur === 'BALIK_STOK'} onChange={() => setTipeRetur('BALIK_STOK')} className="hidden"/>
                <RotateCw size={20} className="text-green-400"/>
                <div>
                  <p className="font-bold text-white text-sm">Balik Stok</p>
                  <p className="text-[10px] text-gray-400">Barang kembali ke stok gudang</p>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${tipeRetur === 'RUSAK' ? 'bg-red-900/30 border-red-600' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                <input type="radio" name="tipeRetur" checked={tipeRetur === 'RUSAK'} onChange={() => setTipeRetur('RUSAK')} className="hidden"/>
                <PackageX size={20} className="text-red-400"/>
                <div>
                  <p className="font-bold text-white text-sm">Rusak</p>
                  <p className="text-[10px] text-gray-400">Barang rusak, tidak balik ke stok</p>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${tipeRetur === 'TUKAR_SUPPLIER' ? 'bg-orange-900/30 border-orange-600' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                <input type="radio" name="tipeRetur" checked={tipeRetur === 'TUKAR_SUPPLIER'} onChange={() => setTipeRetur('TUKAR_SUPPLIER')} className="hidden"/>
                <ArrowLeftRight size={20} className="text-orange-400"/>
                <div>
                  <p className="font-bold text-white text-sm">Tukar Supplier</p>
                  <p className="text-[10px] text-gray-400">Dikirim ke supplier, bisa balik stok nanti</p>
                </div>
              </label>
            </div>
          </div>

          {/* Keterangan */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Keterangan</label>
            <textarea
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Alasan retur..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm h-20 resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-700 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">Batal</button>
          <button onClick={() => onConfirm(item, tipeRetur, qty, keterangan)} className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 font-bold">Proses Retur</button>
        </div>
      </div>
    </div>
  );
};

export const OrderManagement: React.FC = () => {
  const { selectedStore } = useStore();
  const [activeTab, setActiveTab] = useState<'OFFLINE' | 'TERJUAL' | 'RETUR'>('OFFLINE');
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [partNumberFilter, setPartNumberFilter] = useState('');
  const [ecommerceFilter, setEcommerceFilter] = useState('all');
  const [ecommerceOptions, setEcommerceOptions] = useState<string[]>([]);
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  
  // State Grouping
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  // State Data
  const [offlineData, setOfflineData] = useState<OfflineOrderRow[]>([]);
  const [soldData, setSoldData] = useState<SoldItemRow[]>([]);
  const [returData, setReturData] = useState<ReturRow[]>([]);

  // Pagination for TERJUAL
  const [soldPage, setSoldPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // Retur Modal
  const [returModalOpen, setReturModalOpen] = useState(false);
  const [selectedReturItem, setSelectedReturItem] = useState<SoldItemRow | null>(null);

  // State Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ partNumber: '', quantity: 0, price: 0 });

  // Inventory for Autocomplete
  const [inventory, setInventory] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // Load inventory langsung saat komponen mount - TANPA CACHE untuk menghindari masalah
  useEffect(() => {
    const loadInventory = async () => {
      setInventoryLoading(true);
      try {
        console.log('=== LOADING INVENTORY ===');
        const [invMjm, invBjw] = await Promise.all([
          fetchInventory('mjm'),
          fetchInventory('bjw')
        ]);
        
        console.log('MJM items:', invMjm?.length || 0);
        console.log('BJW items:', invBjw?.length || 0);
        
        // Log sample dari setiap toko
        if (invMjm?.length > 0) {
          console.log('Sample MJM:', invMjm[0]);
        }
        if (invBjw?.length > 0) {
          console.log('Sample BJW:', invBjw[0]);
        }
        
        // Gabungkan semua
        const all = [...(invMjm || []), ...(invBjw || [])];
        console.log('Total inventory:', all.length);
        
        setInventory(all);
      } catch (err) {
        console.error("Error fetching inventory:", err);
      } finally {
        setInventoryLoading(false);
      }
    };
    
    loadInventory();
  }, []); // Load sekali saat mount

  // Update selectedItem when partNumber changes
  useEffect(() => {
    if (!editingId) { setSelectedItem(null); return; }
    const found = inventory.find((item) => item.partNumber === editForm.partNumber);
    setSelectedItem(found || null);
  }, [editForm.partNumber, inventory, editingId]);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    setLoadingProgress(0);
    
    // Start progress animation
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 90) return prev; // Stop at 90% until data loads
        return prev + Math.random() * 15;
      });
    }, 200);
    
    try {
      if (activeTab === 'OFFLINE') setOfflineData(await fetchOfflineOrders(selectedStore));
      if (activeTab === 'TERJUAL') setSoldData(await fetchSoldItems(selectedStore));
      if (activeTab === 'RETUR') setReturData(await fetchReturItems(selectedStore));
      
      // Complete the progress
      clearInterval(progressInterval);
      setLoadingProgress(100);
      
      // Reset after animation completes
      setTimeout(() => {
        setLoading(false);
        setLoadingProgress(0);
      }, 300);
    } catch (e) {
      console.error("Gagal load data:", e);
      clearInterval(progressInterval);
      setLoading(false);
      setLoadingProgress(0);
    }
  };

  useEffect(() => { loadData(); }, [selectedStore, activeTab]);

  // Load ecommerce options from database
  useEffect(() => {
    const loadEcommerceOptions = async () => {
      const options = await fetchDistinctEcommerce(selectedStore);
      setEcommerceOptions(options);
    };
    loadEcommerceOptions();
  }, [selectedStore]);

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

  // GROUPING SOLD DATA by Customer/Resi
  const groupedSoldData = useMemo(() => {
    // Filter dulu berdasarkan search
    const filtered = soldData.filter(item => {
      // Old searchTerm filter (for backward compatibility)
      if (searchTerm && !(
        (item.customer || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.resi || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.part_number || '').toLowerCase().includes(searchTerm.toLowerCase())
      )) return false;

      // Customer filter
      if (customerFilter && !(item.customer || '').toLowerCase().includes(customerFilter.toLowerCase())) return false;
      
      // Part number filter
      if (partNumberFilter && !(item.part_number || '').toLowerCase().includes(partNumberFilter.toLowerCase())) return false;
      
      // Ecommerce filter
      if (ecommerceFilter !== 'all' && (item.ecommerce || '').toUpperCase() !== ecommerceFilter.toUpperCase()) return false;
      
      return true;
    });

    const groups: Record<string, { 
      id: string, 
      customer: string, 
      resi: string, 
      ecommerce: string, 
      tempo: string,
      date: string, 
      items: SoldItemRow[], 
      totalQty: number,
      totalAmount: number 
    }> = {};
    
    filtered.forEach(item => {
      const safeCustomer = (item.customer || 'Tanpa Nama').trim();
      const safeResi = (item.resi || '-').trim();
      const safeEcommerce = (item.ecommerce || 'OFFLINE').trim();
      // Group by resi jika ada, kalau tidak by customer + date
      const key = safeResi !== '-' ? `${safeResi}` : `${safeCustomer}-${item.created_at?.slice(0, 10)}`;
      
      if (!groups[key]) {
        groups[key] = {
          id: key, 
          customer: safeCustomer, 
          resi: safeResi, 
          ecommerce: safeEcommerce,
          tempo: item.tempo || 'CASH',
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
    
    return Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [soldData, searchTerm, customerFilter, partNumberFilter, ecommerceFilter]);

  // Extract unique customers and part numbers from soldData for autocomplete - filtered and limited for performance
  const filteredCustomerOptions = useMemo(() => {
    if (!customerFilter || customerFilter.length < 1) return [];
    const search = customerFilter.toLowerCase();
    const customers = [...new Set(soldData.map(item => item.customer).filter(Boolean))];
    return customers.filter(c => c.toLowerCase().includes(search)).slice(0, 50);
  }, [soldData, customerFilter]);

  const filteredPartNumberOptions = useMemo(() => {
    if (!partNumberFilter || partNumberFilter.length < 1) return [];
    const search = partNumberFilter.toLowerCase();
    const partNumbers = [...new Set(soldData.map(item => item.part_number).filter(Boolean))];
    return partNumbers.filter(p => p.toLowerCase().includes(search)).slice(0, 50);
  }, [soldData, partNumberFilter]);

  // Pagination for grouped sold data
  const paginatedSoldGroups = useMemo(() => {
    const start = (soldPage - 1) * ITEMS_PER_PAGE;
    return groupedSoldData.slice(start, start + ITEMS_PER_PAGE);
  }, [groupedSoldData, soldPage]);

  const soldTotalPages = Math.ceil(groupedSoldData.length / ITEMS_PER_PAGE);

  // Handle Retur
  const openReturModal = (item: SoldItemRow) => {
    setSelectedReturItem(item);
    setReturModalOpen(true);
  };

  // Handle Delete Sold Item
  const handleDeleteSoldItem = async (item: SoldItemRow) => {
    if (!window.confirm(`Hapus item "${item.name}" dari data penjualan?\n\nStok akan dikembalikan +${item.qty_keluar} pcs.`)) {
      return;
    }
    
    setLoading(true);
    try {
      const success = await deleteBarangLog(
        parseInt(item.id),
        'out',
        item.part_number,
        item.qty_keluar,
        selectedStore
      );
      
      if (success) {
        showToast(`Item "${item.name}" berhasil dihapus, stok +${item.qty_keluar}`);
        loadData();
      } else {
        showToast('Gagal menghapus item', 'error');
      }
    } catch (error) {
      showToast('Terjadi kesalahan saat menghapus', 'error');
    }
    setLoading(false);
  };

  // Handle Delete All Items in a Group
  const handleDeleteAllGroupItems = async (items: SoldItemRow[]) => {
    if (items.length === 0) return;
    
    const totalQty = items.reduce((sum, item) => sum + item.qty_keluar, 0);
    if (!window.confirm(`Hapus SEMUA ${items.length} item dari pesanan ini?\n\nTotal stok yang akan dikembalikan: +${totalQty} pcs`)) {
      return;
    }
    
    setLoading(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const item of items) {
      try {
        const success = await deleteBarangLog(
          parseInt(item.id),
          'out',
          item.part_number,
          item.qty_keluar,
          selectedStore
        );
        if (success) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    
    setLoading(false);
    
    if (failCount === 0) {
      showToast(`${successCount} item berhasil dihapus, stok +${totalQty}`);
    } else {
      showToast(`${successCount} berhasil, ${failCount} gagal`, failCount > 0 ? 'error' : 'success');
    }
    loadData();
  };

  // Handle Retur All Items in a Group
  const handleReturAllGroupItems = async (items: SoldItemRow[]) => {
    if (items.length === 0) return;
    
    const totalQty = items.reduce((sum, item) => sum + item.qty_keluar, 0);
    if (!window.confirm(`Retur SEMUA ${items.length} item dari pesanan ini?\n\nTotal: ${totalQty} pcs akan masuk ke retur (Balik Stok).`)) {
      return;
    }
    
    setLoading(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const item of items) {
      try {
        const result = await createReturFromSold(item, 'BALIK_STOK', item.qty_keluar, 'Retur massal', selectedStore);
        if (result.success) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    
    setLoading(false);
    
    if (failCount === 0) {
      showToast(`${successCount} item berhasil diretur`);
    } else {
      showToast(`${successCount} berhasil, ${failCount} gagal`, failCount > 0 ? 'error' : 'success');
    }
    loadData();
  };

  const handleReturConfirm = async (item: SoldItemRow, tipeRetur: 'BALIK_STOK' | 'RUSAK' | 'TUKAR_SUPPLIER', qty: number, keterangan: string) => {
    setLoading(true);
    const result = await createReturFromSold(item, tipeRetur, qty, keterangan, selectedStore);
    setLoading(false);
    setReturModalOpen(false);
    
    if (result.success) {
      showToast(`Retur berhasil diproses: ${result.msg}`);
      loadData();
    } else {
      showToast(result.msg, 'error');
    }
  };

  // --- HANDLERS ---

  // 1. EDIT HANDLERS
  // Simpan item original untuk BJW (yang tidak punya id)
  const [editingOriginalItem, setEditingOriginalItem] = useState<OfflineOrderRow | null>(null);
  
  const startEdit = (item: OfflineOrderRow) => {
    setEditingId(item.id);
    setEditingOriginalItem(item); // Simpan item asli untuk BJW
    setEditForm({
      partNumber: item.part_number,
      quantity: item.quantity,
      price: item.harga_satuan
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingOriginalItem(null);
  };

  const saveEdit = async (id: string) => {
    setLoading(true);
    // Cari nama barang dari inventory jika partNumber valid
    let namaBarang = editForm.partNumber;
    const found = inventory.find((item) => item.partNumber === editForm.partNumber);
    if (found) {
      namaBarang = found.nama_barang || found.name || editForm.partNumber;
    }
    const formWithName = { ...editForm, nama_barang: namaBarang };
    
    // Untuk BJW, kirim originalItem karena tidak punya id
    const originalItemForBJW = editingOriginalItem ? {
      tanggal: editingOriginalItem.tanggal,
      customer: editingOriginalItem.customer,
      part_number: editingOriginalItem.part_number
    } : undefined;
    
    const res = await updateOfflineOrder(id, formWithName, selectedStore, originalItemForBJW);
    setLoading(false);
    
    if (res.success) {
      showToast('Item berhasil diupdate');
      setEditingId(null);
      setEditingOriginalItem(null);
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

  // Toggle selection for bulk ACC
  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  // Select/Deselect all groups
  const toggleSelectAll = () => {
    if (selectedGroups.size === filteredGroupedOffline.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(filteredGroupedOffline.map(g => g.id)));
    }
  };

  // Bulk ACC all selected groups
  const handleBulkAccSelected = async () => {
    if (selectedGroups.size === 0) {
      showToast('Pilih minimal 1 pesanan untuk di-ACC', 'error');
      return;
    }
    
    const selectedItems = filteredGroupedOffline
      .filter(g => selectedGroups.has(g.id))
      .flatMap(g => g.items);
    
    if (!window.confirm(`ACC ${selectedGroups.size} pesanan (${selectedItems.length} item)?`)) {
      return;
    }
    
    setLoading(true);
    let successCount = 0;
    
    for (const item of selectedItems) {
      const res = await processOfflineOrderItem(item, selectedStore, 'Proses');
      if (res.success) successCount++;
    }
    
    setLoading(false);
    setSelectedGroups(new Set());
    showToast(`${successCount} item berhasil diproses.`);
    loadData();
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
    <div className="bg-gray-800 m-4 rounded-2xl border border-gray-700 shadow-xl flex flex-col text-gray-100" style={{ height: 'calc(100vh - 120px)' }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* HEADER - Fixed */}
      <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800 rounded-t-2xl flex-shrink-0">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ClipboardList className="text-purple-400" /> Manajemen Pesanan ({selectedStore?.toUpperCase()})
        </h2>
        <div className="flex items-center gap-3">
          {/* Loading Bar */}
          {loading && (
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500 rounded-full transition-all duration-200 ease-out" 
                  style={{ width: `${Math.min(loadingProgress, 100)}%` }}
                />
              </div>
              <span className="text-xs text-purple-400 font-mono font-bold w-10">{Math.round(Math.min(loadingProgress, 100))}%</span>
            </div>
          )}
          <button onClick={loadData} disabled={loading} className={`p-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <RefreshCw size={18} className={loading ? 'animate-spin text-purple-400' : ''}/>
          </button>
        </div>
      </div>

      {/* TABS MENU - Fixed */}
      <div className="flex border-b border-gray-700 bg-gray-900/50 overflow-x-auto flex-shrink-0">
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

      {/* SCROLLABLE CONTENT AREA - hanya bagian ini yang scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gray-900 rounded-b-2xl">
        {/* SEARCH FILTERS - Sticky saat scroll */}
        <div className="sticky top-0 z-30 p-4 bg-gray-900 border-b border-gray-700 shadow-lg backdrop-blur-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {/* Customer Search with Keyboard-Navigable Dropdown */}
            <AutocompleteDropdown
              value={customerFilter}
              onChange={setCustomerFilter}
              options={filteredCustomerOptions}
              placeholder="Cari Customer..."
              icon={<User size={16} />}
            />
            
            {/* Part Number Search with Keyboard-Navigable Dropdown */}
            <AutocompleteDropdown
              value={partNumberFilter}
              onChange={setPartNumberFilter}
              options={filteredPartNumberOptions}
              placeholder="Cari Part Number..."
              icon={<Hash size={16} />}
            />
            
            {/* Ecommerce Dropdown */}
            <div className="relative">
              <ShoppingBag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <select 
                className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none text-white appearance-none cursor-pointer"
                value={ecommerceFilter}
                onChange={(e) => setEcommerceFilter(e.target.value)}
              >
                <option value="all">Semua Sumber</option>
                {ecommerceOptions.map(ecom => (
                  <option key={ecom} value={ecom}>{ecom}</option>
                ))}
              </select>
            </div>
            
            {/* General Search (backward compatibility) */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Cari lainnya (Resi, Barang)..." 
                className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none text-white placeholder-gray-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          {/* Bulk Action Bar for OFFLINE Tab */}
          {activeTab === 'OFFLINE' && filteredGroupedOffline.length > 0 && (
            <div className="bg-gray-800 border border-gray-600 rounded-xl p-3 flex items-center justify-between mt-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.size === filteredGroupedOffline.length && filteredGroupedOffline.length > 0}
                    onChange={toggleSelectAll}
                    className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-sm font-bold text-gray-300">Pilih Semua</span>
                </label>
                {selectedGroups.size > 0 && (
                  <span className="text-sm text-purple-400 font-bold">
                    ({selectedGroups.size} pesanan dipilih)
                  </span>
                )}
              </div>
              {selectedGroups.size > 0 && (
                <button 
                  onClick={handleBulkAccSelected}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-500 shadow-lg shadow-blue-900/30 text-sm font-bold flex items-center gap-2 transition-colors"
                >
                  <Check size={18}/> ACC {selectedGroups.size} PESANAN
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-4">
          {/* --- 1. TAB OFFLINE (GROUPED VIEW) --- */}
          {activeTab === 'OFFLINE' && (
            <div className="space-y-4">
              {filteredGroupedOffline.length === 0 && <EmptyState msg="Tidak ada order offline baru." />}
            
            {filteredGroupedOffline.map((group) => {
              const groupKey = group.id;
              // Default to expanded (true) if not explicitly set to false
              const isExpanded = expandedGroups[groupKey] !== false;
              const isSelected = selectedGroups.has(groupKey);

              return (
                <div key={groupKey} className={`bg-gray-800 border rounded-xl overflow-hidden hover:border-gray-500 transition-all shadow-lg ${isSelected ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-gray-600'}`}>
                  {/* GROUP HEADER */}
                  <div className="p-3 flex flex-col md:flex-row justify-between gap-2 bg-gray-800">
                    <div className="flex items-start gap-3">
                      {/* Checkbox for bulk selection */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => { e.stopPropagation(); toggleGroupSelection(groupKey); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-6 h-6 mt-1 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                      />
                      <div className="flex-1 cursor-pointer select-none" onClick={() => toggleExpand(groupKey)}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-sm font-bold px-3 py-1 rounded border ${group.tempo === 'CASH' ? 'bg-green-900/30 border-green-800 text-green-400' : 'bg-orange-900/30 border-orange-800 text-orange-400'}`}>
                            {group.tempo}
                          </span>
                          <span className="text-sm font-mono bg-gray-700 px-2 py-0.5 rounded text-gray-300">
                            {new Date(group.date).toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'})}
                          </span>
                          <span className="text-sm bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded border border-blue-800 flex items-center gap-1">
                            <Layers size={14} /> {group.items.length} Item
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronUp size={20} className="text-purple-400"/> : <ChevronDown size={20} className="text-gray-400"/>}
                          <h3 className="font-extrabold text-xl text-white">
                            {group.customer}
                          </h3>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 border-t md:border-t-0 border-gray-700 pt-2 md:pt-0">
                      <div>
                        <span className="text-gray-400 text-xs mr-2">Total Tagihan:</span>
                        <span className="text-lg font-bold text-green-400">{formatRupiah(group.totalAmount)}</span>
                      </div>
                      <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={() => handleProcessGroup(group.items, 'Tolak')} className="flex-1 md:flex-none bg-red-900/20 text-red-400 px-4 py-2 rounded-lg hover:bg-red-900/40 border border-red-900/50 text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                          <X size={16}/> TOLAK SEMUA
                        </button>
                        <button onClick={() => handleProcessGroup(group.items, 'Proses')} className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 shadow-lg shadow-blue-900/30 text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                          <Check size={16}/> ACC SEMUA
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
                                  <p className="text-lg font-bold text-white font-mono tracking-wider">{item.part_number || '-'}</p>
                                  <p className="text-sm font-semibold text-gray-200 mt-0.5">{item.nama_barang}</p>
                                </>
                            ) : (
                                <div className="space-y-2 w-full">
                                    <div className="flex flex-col">
                                        <label className="text-[10px] text-gray-400">Part Number</label>
                                        <Autocomplete
                                          size="small"
                                          options={inventory}
                                          getOptionLabel={(option) => option?.partNumber || ''}
                                          filterOptions={(options, { inputValue }) => {
                                            console.log('=== FILTER OPTIONS ===');
                                            console.log('Total options available:', options.length);
                                            console.log('Input value:', inputValue);
                                            
                                            if (!inputValue || inputValue.length < 1) {
                                              const result = options.slice(0, 50);
                                              console.log('No input, returning first 50:', result.length);
                                              return result;
                                            }
                                            
                                            const search = inputValue.toLowerCase();
                                            
                                            const filtered = options.filter(opt => {
                                              if (!opt) return false;
                                              const pn = String(opt.partNumber || '').toLowerCase();
                                              const nm = String(opt.name || '').toLowerCase();
                                              const br = String(opt.brand || '').toLowerCase();
                                              const ap = String(opt.application || '').toLowerCase();
                                              
                                              return pn.includes(search) || nm.includes(search) || br.includes(search) || ap.includes(search);
                                            });
                                            
                                            console.log('Filtered count:', filtered.length);
                                            return filtered.slice(0, 50);
                                          }}
                                          value={inventory.find((inv) => inv?.partNumber === editForm.partNumber) || null}
                                          onChange={(_, newValue) => {
                                            setEditForm({ ...editForm, partNumber: newValue ? newValue.partNumber : '' });
                                          }}
                                          renderOption={(props, option, { index }) => (
                                            <li {...props} key={`${option.partNumber}-${index}`}>
                                              <div className="flex flex-col w-full py-1">
                                                <div className="flex justify-between items-center">
                                                  <span className="font-bold text-sm text-blue-600">{option.partNumber}</span>
                                                  <span className="text-xs text-gray-500 ml-2">Stok: {option.quantity ?? 0}</span>
                                                </div>
                                                <span className="text-xs text-gray-700 truncate">{option.name || '-'}</span>
                                                <div className="flex gap-2 text-[10px] text-gray-500">
                                                  <span>Brand: {option.brand || '-'}</span>
                                                  <span>|</span>
                                                  <span>Aplikasi: {option.application || '-'}</span>
                                                </div>
                                              </div>
                                            </li>
                                          )}
                                          renderInput={(params) => (
                                            <TextField {...params} variant="outlined" placeholder={inventoryLoading ? "Memuat data..." : "Ketik Part Number, Nama, atau Brand..."} className="bg-gray-700 border border-gray-600 rounded text-xs text-white" />
                                          )}
                                          isOptionEqualToValue={(option, value) => option.partNumber === value.partNumber}
                                          noOptionsText={inventoryLoading ? "Memuat data..." : "Tidak ada data ditemukan"}
                                          loading={inventoryLoading}
                                          loadingText="Memuat data..."
                                          sx={{
                                            '& .MuiAutocomplete-listbox': {
                                              maxHeight: '300px',
                                            },
                                          }}
                                        />
                                    </div>
                                    {/* Detail info kanan */}
                                    {selectedItem && (
                                      <div className="mt-2 text-xs bg-gray-800 border border-gray-700 rounded p-2 text-white min-w-[180px]">
                                        <div><b>Name:</b> {selectedItem.nama_barang || selectedItem.name || '-'}</div>
                                        <div><b>Brand:</b> {selectedItem.brand || '-'}</div>
                                        <div><b>Aplikasi:</b> {selectedItem.application || selectedItem.aplikasi || '-'}</div>
                                        <div><b>Stock:</b> {selectedItem.quantity ?? '-'}</div>
                                      </div>
                                    )}
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

        {/* --- 3. TAB TERJUAL (GROUPED VIEW dengan PAGINATION) --- */}
        {activeTab === 'TERJUAL' && (
          <div className="space-y-4">
            {paginatedSoldGroups.length === 0 && <EmptyState msg="Belum ada data penjualan." />}
            
            {paginatedSoldGroups.map((group) => {
              const groupKey = group.id;
              // Default to expanded (true) if not explicitly set to false
              const isExpanded = expandedGroups[groupKey] !== false;
              const ecommerceColors = getEcommerceColor(group.ecommerce);

              return (
                <div key={groupKey} className={`${ecommerceColors.bg} border ${ecommerceColors.border} rounded-xl overflow-hidden hover:border-gray-500 transition-all shadow-lg`}>
                  {/* GROUP HEADER */}
                  <div className={`p-3 flex flex-col md:flex-row justify-between gap-2 ${ecommerceColors.bg}`}>
                    <div className="flex-1 cursor-pointer select-none" onClick={() => toggleExpand(groupKey)}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-sm font-bold px-3 py-1 rounded border ${ecommerceColors.bg} ${ecommerceColors.border} ${ecommerceColors.text}`}>
                          {group.ecommerce}
                        </span>
                        <span className="text-sm font-mono bg-gray-700/50 px-2 py-0.5 rounded text-gray-300">
                          {new Date(group.date).toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'})}
                        </span>
                        <span className="text-sm bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded border border-blue-800 flex items-center gap-1">
                          <Layers size={14} /> {group.items.length} Item
                        </span>
                        {group.resi !== '-' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(group.resi);
                              showToast(`Resi "${group.resi}" disalin!`);
                            }}
                            className="text-sm bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded border border-purple-800 font-mono hover:bg-purple-800/50 transition-colors flex items-center gap-1.5 cursor-pointer"
                            title="Klik untuk copy resi"
                          >
                            Resi: {group.resi}
                            <Copy size={12} className="opacity-70"/>
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronUp size={20} className="text-purple-400"/> : <ChevronDown size={20} className="text-gray-400"/>}
                        <h3 className="font-extrabold text-xl text-white flex items-center gap-2">
                          <User size={20} className="text-gray-400"/> {group.customer}
                        </h3>
                        {/* Hide tempo for online marketplaces (Shopee, TikTok, etc) */}
                        {group.ecommerce === 'OFFLINE' && (
                          <span className="text-base text-gray-500">• {group.tempo}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 border-t md:border-t-0 border-gray-700 pt-2 md:pt-0">
                      <div className="text-right">
                        <span className="text-gray-400 text-xs mr-2">Total:</span>
                        <span className="text-lg font-bold text-green-400">{group.totalQty} Pcs</span>
                      </div>
                      <span className="text-base font-bold font-mono text-yellow-400">{formatRupiah(group.totalAmount)}</span>
                      {/* Bulk Action Buttons */}
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleReturAllGroupItems(group.items); }} 
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-900/30 text-orange-400 hover:bg-orange-900/50 transition-colors border border-orange-800 text-sm font-bold"
                          title="Retur Semua Item"
                        >
                          <RotateCcw size={16}/> Retur Semua
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteAllGroupItems(group.items); }} 
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors border border-red-800 text-sm font-bold"
                          title="Hapus Semua Item"
                        >
                          <Trash2 size={16}/> Hapus Semua
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ITEM LIST */}
                  {isExpanded && (
                    <div className="bg-gray-900/80 border-t border-gray-700 p-1 space-y-1 animate-in slide-in-from-top-2 duration-200">
                      {group.items.map((item, idx) => (
                        <div key={`${item.id}-${idx}`} className={`flex justify-between items-center p-3 rounded-lg border ${ecommerceColors.bg} ${ecommerceColors.border} hover:border-gray-500 ml-2 mr-1`}>
                          <div className="flex-1">
                            {/* Part Number - Large and Prominent */}
                            <p className="text-lg font-bold text-white font-mono tracking-wider">{item.part_number || '-'}</p>
                            {/* Item Name */}
                            <p className="text-sm font-semibold text-gray-200 mt-0.5">{item.name}</p>
                            {/* Brand & Application */}
                            {(item.brand || item.application) && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {item.brand && <span className="text-blue-300 font-medium">{item.brand}</span>}
                                {item.brand && item.application && <span className="mx-2">•</span>}
                                {item.application && <span className="text-green-300">{item.application}</span>}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="text-sm font-bold text-white">{item.qty_keluar} x {formatRupiah(item.harga_total / item.qty_keluar || 0)}</p>
                              <p className="text-xs text-green-400 font-mono">{formatRupiah(item.harga_total)}</p>
                            </div>
                            <button 
                              onClick={() => openReturModal(item)} 
                              className="p-1.5 rounded bg-orange-900/30 text-orange-400 hover:bg-orange-900/50 transition-colors border border-orange-800" 
                              title="Retur"
                            >
                              <RotateCcw size={16}/>
                            </button>
                            <button 
                              onClick={() => handleDeleteSoldItem(item)} 
                              className="p-1.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors border border-red-800" 
                              title="Hapus"
                            >
                              <Trash2 size={16}/>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* PAGINATION */}
            {soldTotalPages > 1 && (
              <div className="flex justify-center items-center gap-4 pt-4 border-t border-gray-700">
                <button 
                  onClick={() => setSoldPage(p => Math.max(1, p - 1))} 
                  disabled={soldPage === 1}
                  className="p-2 bg-gray-700 rounded-lg disabled:opacity-30 hover:bg-gray-600"
                >
                  <ChevronLeft size={18}/>
                </button>
                <span className="text-sm text-gray-400">
                  Halaman {soldPage} dari {soldTotalPages} ({groupedSoldData.length} grup)
                </span>
                <button 
                  onClick={() => setSoldPage(p => Math.min(soldTotalPages, p + 1))} 
                  disabled={soldPage === soldTotalPages}
                  className="p-2 bg-gray-700 rounded-lg disabled:opacity-30 hover:bg-gray-600"
                >
                  <ChevronRight size={18}/>
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- 4. TAB RETUR (Enhanced with types) --- */}
        {activeTab === 'RETUR' && (
          <div className="space-y-3">
            {filterList(returData).length === 0 && <EmptyState msg="Tidak ada data retur." />}
            {filterList(returData).map((item, idx) => {
              const tipeRetur = (item as any).tipe_retur || 'BALIK_STOK';
              const isTukarSupplier = tipeRetur === 'TUKAR_SUPPLIER';
              const isRusak = tipeRetur === 'RUSAK';
              const isSudahDitukar = item.status === 'Sudah Ditukar';
              
              return (
                <div key={idx} className={`border p-4 rounded-xl flex flex-col md:flex-row justify-between gap-4 ${
                  isRusak ? 'bg-red-900/10 border-red-900/30' : 
                  isTukarSupplier ? 'bg-orange-900/10 border-orange-900/30' : 
                  'bg-green-900/10 border-green-900/30'
                }`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        isRusak ? 'bg-red-900/50 text-red-300 border-red-800' :
                        isTukarSupplier ? 'bg-orange-900/50 text-orange-300 border-orange-800' :
                        'bg-green-900/50 text-green-300 border-green-800'
                      }`}>
                        {isRusak ? 'RUSAK' : isTukarSupplier ? 'TUKAR SUPPLIER' : 'BALIK STOK'}
                      </span>
                      {item.ecommerce && (
                        <span className="text-[10px] bg-gray-700 px-1.5 rounded text-gray-400">{item.ecommerce}</span>
                      )}
                      {item.status && (
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          item.status === 'Selesai' ? 'bg-green-900/30 text-green-400' :
                          isSudahDitukar ? 'bg-blue-900/30 text-blue-400' :
                          'bg-yellow-900/30 text-yellow-400'
                        }`}>
                          {item.status}
                        </span>
                      )}
                    </div>
                    
                    {/* Tanggal Pemesanan & Tanggal Retur */}
                    <div className="flex flex-wrap gap-4 mb-2 text-[10px]">
                      {item.tanggal_pemesanan && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">📦 Pesan:</span>
                          <span className="text-gray-400 font-mono">{new Date(item.tanggal_pemesanan).toLocaleDateString('id-ID', {timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: '2-digit'})}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">🔄 Retur:</span>
                        <span className="text-gray-400 font-mono">{new Date(item.tanggal_retur).toLocaleDateString('id-ID', {timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: '2-digit'})}</span>
                      </div>
                    </div>
                    
                    <h4 className="font-bold text-white">{item.nama_barang}</h4>
                    <p className="text-[10px] text-gray-500 font-mono">Part: {item.part_number}</p>
                    <p className="text-sm text-gray-400 mt-1">{item.customer} {item.resi !== '-' ? `(Resi: ${item.resi})` : ''}</p>
                    {item.keterangan && <p className="text-xs text-gray-500 mt-1 italic">"{item.keterangan}"</p>}
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className={`text-xl font-bold ${isRusak ? 'text-red-400' : isTukarSupplier ? 'text-orange-400' : 'text-green-400'}`}>
                        {item.quantity}
                      </p>
                      <p className="text-xs text-gray-500">Pcs</p>
                      <p className="text-sm font-mono text-gray-400 mt-1">{formatRupiah(item.harga_total)}</p>
                    </div>
                    
                    {/* Tombol untuk tukar supplier - hanya untuk status Pending */}
                    {isTukarSupplier && item.status === 'Pending' && (
                      <button 
                        onClick={async () => {
                          if (!confirm('Barang sudah ditukar di supplier dan akan dikembalikan ke stok?')) return;
                          setLoading(true);
                          const result = await updateReturStatus(item.id!, 'Sudah Ditukar', selectedStore);
                          setLoading(false);
                          if (result.success) {
                            showToast('Stok berhasil dikembalikan');
                            loadData();
                          } else {
                            showToast(result.msg, 'error');
                          }
                        }}
                        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 flex items-center gap-1"
                      >
                        <Package size={14}/> Sudah Ditukar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        </div>
      </div>

      {/* RETUR MODAL */}
      <ReturModal 
        isOpen={returModalOpen}
        item={selectedReturItem}
        onClose={() => setReturModalOpen(false)}
        onConfirm={handleReturConfirm}
      />
    </div>
  );
};

const EmptyState = ({ msg }: { msg: string }) => (
  <div className="flex flex-col items-center justify-center h-64 text-gray-500">
    <Box size={48} className="mb-4 opacity-20" />
    <p>{msg}</p>
  </div>
);