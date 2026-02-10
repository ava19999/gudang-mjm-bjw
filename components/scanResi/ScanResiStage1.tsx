// FILE: components/scanResi/ScanResiStage1.tsx
// Stage 1: Scanner Gudang - Scan receipts with physical barcode scanner

import React, { useState, useEffect, useRef } from 'react';
// Komponen dropdown suggestion custom untuk sub toko reseller
const SubTokoResellerDropdown = ({ value, onChange, suggestions }: { value: string, onChange: (v: string) => void, suggestions: string[] }) => {
  const [show, setShow] = useState(false);
  const [input, setInput] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter: jika input kosong, tampilkan semua. Jika ada input, filter berdasarkan input
  const filtered = suggestions.filter(s => {
    if (!input.trim()) return true; // Tampilkan semua jika kosong
    return s.toLowerCase().includes(input.toLowerCase()) && s.toLowerCase() !== input.toLowerCase();
  });

  console.log('SubTokoResellerDropdown - suggestions:', suggestions.length, 'filtered:', filtered.length, 'input:', input);

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={input}
        onChange={e => { setInput(e.target.value); onChange(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)}
        placeholder="Ketik atau pilih nama reseller..."
        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        autoComplete="off"
      />
      {show && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-auto animate-in fade-in slide-in-from-top-2">
          {filtered.map((s, i) => (
            <div
              key={s}
              className="px-4 py-2 cursor-pointer hover:bg-purple-600 hover:text-white transition-colors text-sm"
              onMouseDown={() => { onChange(s); setInput(s); setShow(false); }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
      {show && filtered.length === 0 && suggestions.length === 0 && (
        <div className="absolute z-20 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-3 text-gray-400 text-sm">
          Tidak ada data reseller. Ketik nama baru.
        </div>
      )}
    </div>
  );
};
import { useStore } from '../../context/StoreContext';
import { 
  scanResiStage1, 
  scanResiStage1Bulk,
  deleteResiStage1,
  deleteResi,
  restoreResi,
  updateResi, 
  getResiStage1List,
  getResellers,
  getResellerNamesFromBarangKeluar,
  addReseller
} from '../../services/resiScanService';
import { 
  ResiScanStage, 
  EcommercePlatform, 
  SubToko, 
  NegaraEkspor,
  isInstantOrder
} from '../../types';
import { 
  Package, 
  Scan, 
  Trash2,
  Edit2,
  RefreshCw, 
  Plus,
  X,
  Check,
  ShoppingCart,
  User,
  List,
  Save,
  AlertTriangle
} from 'lucide-react';

// Import audio file untuk notifikasi duplikat
import duplicateAudioFile from './sudah di scan.mp3';

interface ScanResiStage1Props {
  onRefresh?: () => void;
  refreshTrigger?: number;
}

const Toast = ({ message, type, onClose }: any) => (
  <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-xl flex items-center gap-2 text-white text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${
    type === 'success' ? 'bg-green-600' : 'bg-red-600'
  }`}>
    {type === 'success' ? <Check size={16} /> : <X size={16} />}
    {message}
    <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
      <X size={14}/>
    </button>
  </div>
);

export const ScanResiStage1: React.FC<ScanResiStage1Props> = ({ onRefresh, refreshTrigger }) => {
  const { selectedStore, userName } = useStore();
  
  // State untuk scanning
  const [ecommerce, setEcommerce] = useState<EcommercePlatform>('SHOPEE');
  const [subToko, setSubToko] = useState<SubToko>(selectedStore === 'bjw' ? 'BJW' : 'MJM');
  const [negaraEkspor, setNegaraEkspor] = useState<NegaraEkspor>('PH');
  const [resiInput, setResiInput] = useState('');
  const [selectedReseller, setSelectedReseller] = useState('');
  const [loading, setLoading] = useState(false);
  const [resiList, setResiList] = useState<ResiScanStage[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchEcommerce, setSearchEcommerce] = useState('');
  const [searchToko, setSearchToko] = useState('');
  const [activeResiTab, setActiveResiTab] = useState<'regular' | 'kilat'>('regular');

  // Ambil unique e-commerce dan toko dari data
  const isKilatResi = (resi: ResiScanStage) => resi.ecommerce?.toUpperCase().includes('KILAT');
  const kilatResiCount = resiList.filter(isKilatResi).length;
  const regularResiCount = resiList.length - kilatResiCount;
  const baseResiList = activeResiTab === 'kilat'
    ? resiList.filter(isKilatResi)
    : resiList.filter(resi => !isKilatResi(resi));
  const ecommerceOptions = Array.from(new Set(baseResiList.map(r => r.ecommerce))).filter(Boolean);
  const tokoOptions = Array.from(new Set(baseResiList.map(r => r.sub_toko))).filter(Boolean);
  
  // State untuk Reseller
  const [showResellerForm, setShowResellerForm] = useState(false);
  const [resellers, setResellers] = useState<any[]>([]);
  // Daftar nama reseller dari barang_keluar (kode_toko where ecommerce = 'RESELLER')
  const [resellerNamesList, setResellerNamesList] = useState<string[]>([]);
  const [newResellerName, setNewResellerName] = useState('');
  
  // State untuk Bulk Scan (Scan Masal)
  const [showBulkScanModal, setShowBulkScanModal] = useState(false);
  const [bulkEcommerce, setBulkEcommerce] = useState<EcommercePlatform>('SHOPEE');
  const [bulkSubToko, setBulkSubToko] = useState<SubToko>(selectedStore === 'bjw' ? 'BJW' : 'MJM');
  const [bulkNegaraEkspor, setBulkNegaraEkspor] = useState<NegaraEkspor>('PH');
  const [bulkResellerDari, setBulkResellerDari] = useState<string>(''); // Reseller dari MJM/BJW
  const [bulkResiList, setBulkResiList] = useState<Array<{ id: string; resi: string; isDuplicate: boolean }>>([
    { id: '1', resi: '', isDuplicate: false }
  ]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bulkInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  
  const resiInputRef = useRef<HTMLInputElement>(null);
  
  // State untuk Undo (Ctrl+Z)
  const [deletedResiStack, setDeletedResiStack] = useState<ResiScanStage[]>([]);
  
  // State untuk Edit Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingResi, setEditingResi] = useState<ResiScanStage | null>(null);
  const [editResiValue, setEditResiValue] = useState('');
  const [editEcommerce, setEditEcommerce] = useState<EcommercePlatform>('SHOPEE');
  const [editSubToko, setEditSubToko] = useState<SubToko>('MJM');
  const [editNegaraEkspor, setEditNegaraEkspor] = useState<NegaraEkspor>('PH');
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  
  // Load data on mount or when refreshTrigger changes
  useEffect(() => {
    loadResiList();
    loadResellers();
    loadResellerNames();
  }, [selectedStore, refreshTrigger]);

  // Update subToko dan bulkSubToko ketika selectedStore berubah
  useEffect(() => {
    const defaultToko = selectedStore === 'bjw' ? 'BJW' : 'MJM';
    setSubToko(defaultToko as SubToko);
    setBulkSubToko(defaultToko as SubToko);
  }, [selectedStore]);
  
  // Auto focus on resi input
  useEffect(() => {
    if (resiInputRef.current && !showResellerForm) {
      resiInputRef.current.focus();
    }
  }, [showResellerForm]);
  
  // Keyboard listener untuk Ctrl+Z (Undo)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z' && deletedResiStack.length > 0) {
        e.preventDefault();
        await handleUndoDelete();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deletedResiStack]);
  
  // Fungsi Undo Delete
  const handleUndoDelete = async () => {
    if (deletedResiStack.length === 0) return;
    
    const lastDeleted = deletedResiStack[deletedResiStack.length - 1];
    setLoading(true);
    
    const result = await restoreResi(lastDeleted, selectedStore);
    
    if (result.success) {
      setDeletedResiStack(prev => prev.slice(0, -1));
      showToast(`Resi ${lastDeleted.resi} berhasil dikembalikan! (Ctrl+Z)`);
      await loadResiList();
      if (onRefresh) onRefresh();
    } else {
      showToast(result.message, 'error');
    }
    
    setLoading(false);
  };
  
  const loadResiList = async () => {
    setLoading(true);
    const data = await getResiStage1List(selectedStore);
    setResiList(data);
    setLoading(false);
  };
  
  const loadResellers = async () => {
    const data = await getResellers();
    setResellers(data);
  };
  
  // Load nama reseller dari barang_keluar (kode_toko where ecommerce = 'RESELLER')
  const loadResellerNames = async () => {
    const names = await getResellerNamesFromBarangKeluar(selectedStore);
    setResellerNamesList(names);
  };
  
  const handleScanResi = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resiInput.trim()) {
      showToast('Resi tidak boleh kosong!', 'error');
      return;
    }
    
    setLoading(true);
    
    const now = new Date().toISOString(); // atau gunakan format sesuai kebutuhan

    const payload = {
      resi: resiInput.trim(),
      ecommerce,
      sub_toko: subToko,
      negara_ekspor: ecommerce === 'EKSPOR' ? negaraEkspor : undefined,
      scanned_by: userName || 'Admin',
      tanggal: now,
      resellerdari: ecommerce === 'RESELLER' ? (selectedReseller || null) : null, // Reseller dari MJM/BJW
    };
    
    const result = await scanResiStage1(payload, selectedStore);
    
    if (result.success) {
      showToast('Resi berhasil di-scan!');
      setResiInput('');
      await loadResiList();
      if (onRefresh) onRefresh();
    } else {
      showToast(result.message, 'error');
      setResiInput(''); // KOSONGKAN INPUT JIKA DOUBLE/ERROR
      // Mainkan audio sudah di scan.mp3 jika error/double
      try {
        const audio = new Audio(duplicateAudioFile);
        audio.volume = 1.0;
        audio.play().catch((e) => console.error('Audio play failed:', e));
      } catch (e) {
        console.error('Audio error:', e);
      }
    }
    
    setLoading(false);
    
    // Selalu fokus kembali ke input resi setelah scan (sukses atau gagal)
    // Menggunakan setTimeout untuk memastikan state sudah update
    setTimeout(() => {
      if (resiInputRef.current) {
        resiInputRef.current.focus();
      }
    }, 50);
  };
  
  const handleDeleteResi = async (resiId: string, isStage2: boolean = false, isStage3: boolean = false) => {
    let confirmMsg = 'Yakin ingin menghapus resi ini?';
    if (isStage3) {
      confirmMsg = 'Resi ini sudah di Stage 3 (Completed). Yakin ingin menghapus dari database?';
    } else if (isStage2) {
      confirmMsg = 'Resi ini sudah di Stage 2. Yakin ingin menghapus dari database?';
    }
    if (!confirm(confirmMsg)) return;
    
    // Simpan data resi sebelum dihapus untuk undo
    const resiToDelete = resiList.find(r => r.id === resiId);
    
    setLoading(true);
    const result = await deleteResi(resiId, selectedStore);
    
    if (result.success) {
      // Simpan ke undo stack
      if (resiToDelete) {
        setDeletedResiStack(prev => [...prev, resiToDelete]);
      }
      showToast('Resi berhasil dihapus (Ctrl+Z untuk undo)');
      await loadResiList();
      if (onRefresh) onRefresh();
    } else {
      showToast(result.message, 'error');
    }
    
    setLoading(false);
  };
  
  // Fungsi untuk membuka Edit Modal
  const handleOpenEditModal = (resi: ResiScanStage) => {
    setEditingResi(resi);
    setEditResiValue(resi.resi);
    // Parse ecommerce (bisa "EKSPOR - PH" -> "EKSPOR")
    const baseEcommerce = resi.ecommerce.split(' - ')[0] as EcommercePlatform;
    setEditEcommerce(baseEcommerce);
    setEditSubToko(resi.sub_toko as SubToko);
    setEditNegaraEkspor((resi.negara_ekspor as NegaraEkspor) || 'PH');
    setShowEditModal(true);
  };
  
  // Fungsi untuk menyimpan edit
  const handleSaveEdit = async () => {
    if (!editingResi) return;
    if (!editResiValue.trim()) {
      showToast('Nomor resi tidak boleh kosong!', 'error');
      return;
    }
    
    setLoading(true);
    
    // Build ecommerce string dengan negara jika EKSPOR
    const ecommerceValue = editEcommerce === 'EKSPOR' 
      ? `EKSPOR - ${editNegaraEkspor}` 
      : editEcommerce;
    
    const result = await updateResi(
      editingResi.id,
      {
        resi: editResiValue.trim(),
        ecommerce: ecommerceValue,
        sub_toko: editSubToko,
        negara_ekspor: editEcommerce === 'EKSPOR' ? editNegaraEkspor : null
      },
      selectedStore
    );
    
    if (result.success) {
      showToast('Resi berhasil diupdate!');
      setShowEditModal(false);
      setEditingResi(null);
      await loadResiList();
      if (onRefresh) onRefresh();
    } else {
      showToast(result.message, 'error');
    }
    
    setLoading(false);
  };
  
  const handleAddReseller = async () => {
    if (!newResellerName.trim()) {
      showToast('Nama reseller tidak boleh kosong!', 'error');
      return;
    }
    
    const result = await addReseller(newResellerName.trim());
    
    if (result.success) {
      showToast('Reseller berhasil ditambahkan');
      setNewResellerName('');
      await loadResellers();
    } else {
      showToast(result.message, 'error');
    }
  };
  
  const filteredResiList = baseResiList.filter(resi => {
    const matchSearch =
      resi.resi.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resi.ecommerce.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resi.sub_toko.toLowerCase().includes(searchTerm.toLowerCase());
    const matchEcommerce = !searchEcommerce || resi.ecommerce === searchEcommerce;
    const matchToko = !searchToko || resi.sub_toko === searchToko;
    return matchSearch && matchEcommerce && matchToko;
  });

  // ============================================================================
  // BULK SCAN FUNCTIONS
  // ============================================================================
  
  // Check duplikat dalam list bulk scan
  const checkBulkDuplicates = (list: typeof bulkResiList) => {
    const seen = new Set<string>();
    return list.map(item => {
      const resiClean = item.resi.trim().toUpperCase();
      if (!resiClean) return { ...item, isDuplicate: false };
      
      const isDupe = seen.has(resiClean);
      seen.add(resiClean);
      return { ...item, isDuplicate: isDupe };
    });
  };

  const handleBulkResiChange = (id: string, value: string) => {
    setBulkResiList(prev => {
      const updated = prev.map(item => 
        item.id === id ? { ...item, resi: value } : item
      );
      return checkBulkDuplicates(updated);
    });
  };

  const handleBulkResiKeyDown = (e: React.KeyboardEvent, id: string, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentResi = bulkResiList.find(r => r.id === id)?.resi.trim();
      
      // Jika ada isi dan ini row terakhir, tambah row baru
      if (currentResi && index === bulkResiList.length - 1) {
        const newId = Date.now().toString();
        setBulkResiList(prev => [...prev, { id: newId, resi: '', isDuplicate: false }]);
        // Focus ke row baru setelah render
        setTimeout(() => {
          bulkInputRefs.current[newId]?.focus();
        }, 50);
      } else if (index < bulkResiList.length - 1) {
        // Pindah ke row berikutnya
        const nextId = bulkResiList[index + 1].id;
        bulkInputRefs.current[nextId]?.focus();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (index < bulkResiList.length - 1) {
        const nextId = bulkResiList[index + 1].id;
        bulkInputRefs.current[nextId]?.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index > 0) {
        const prevId = bulkResiList[index - 1].id;
        bulkInputRefs.current[prevId]?.focus();
      }
    }
  };

  const handleAddBulkRow = () => {
    const newId = Date.now().toString();
    setBulkResiList(prev => [...prev, { id: newId, resi: '', isDuplicate: false }]);
    setTimeout(() => {
      bulkInputRefs.current[newId]?.focus();
    }, 50);
  };

  const handleRemoveBulkRow = (id: string) => {
    if (bulkResiList.length <= 1) return;
    setBulkResiList(prev => {
      const filtered = prev.filter(item => item.id !== id);
      return checkBulkDuplicates(filtered);
    });
  };

  const handleClearBulkList = () => {
    setBulkResiList([{ id: '1', resi: '', isDuplicate: false }]);
  };

  const handleSaveBulkScan = async () => {
    const validResis = bulkResiList.filter(r => r.resi.trim() && !r.isDuplicate);
    
    if (validResis.length === 0) {
      showToast('Tidak ada resi valid untuk disimpan!', 'error');
      return;
    }

    setBulkSaving(true);

    const items = validResis.map(r => ({
      resi: r.resi.trim(),
      ecommerce: bulkEcommerce === 'EKSPOR' ? `EKSPOR - ${bulkNegaraEkspor}` : bulkEcommerce,
      sub_toko: bulkSubToko,
      negara_ekspor: bulkEcommerce === 'EKSPOR' ? bulkNegaraEkspor : undefined,
      scanned_by: userName || 'Admin',
      resellerdari: bulkEcommerce === 'RESELLER' ? (bulkResellerDari || null) : null // Reseller dari MJM/BJW
    }));

    const result = await scanResiStage1Bulk(items, selectedStore);

    if (result.success) {
      showToast(result.message);
      await loadResiList();
      if (onRefresh) onRefresh();
      
      // Reset bulk list
      setBulkResiList([{ id: '1', resi: '', isDuplicate: false }]);
      setShowBulkScanModal(false);
    } else {
      showToast(result.message, 'error');
    }

    setBulkSaving(false);
  };

  // Handle paste dari Excel - parse multiple lines
  const handlePasteFromExcel = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    
    // Split by newline, tab, atau comma - handle berbagai format Excel
    const lines = pastedText
      .split(/[\r\n\t]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (lines.length === 0) return;
    
    // Convert to bulk list format
    const newResiList = lines.map((resi, index) => ({
      id: `paste-${Date.now()}-${index}`,
      resi: resi,
      isDuplicate: false
    }));
    
    // Merge dengan list yang sudah ada (hapus row kosong di awal)
    setBulkResiList(prev => {
      const existingNonEmpty = prev.filter(r => r.resi.trim());
      const merged = [...existingNonEmpty, ...newResiList];
      return checkBulkDuplicates(merged);
    });
    
    showToast(`${lines.length} resi berhasil di-paste dari Excel`);
  };

  // Handle paste di input field biasa
  const handleBulkInputPaste = (e: React.ClipboardEvent<HTMLInputElement>, id: string) => {
    const pastedText = e.clipboardData.getData('text');
    
    // Jika paste mengandung multiple lines, handle sebagai bulk paste
    if (pastedText.includes('\n') || pastedText.includes('\r') || pastedText.includes('\t')) {
      e.preventDefault();
      
      const lines = pastedText
        .split(/[\r\n\t]+/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      if (lines.length > 1) {
        const newResiList = lines.map((resi, index) => ({
          id: `paste-${Date.now()}-${index}`,
          resi: resi,
          isDuplicate: false
        }));
        
        setBulkResiList(prev => {
          // Hapus row current yang kosong, tambahkan paste result
          const currentIndex = prev.findIndex(r => r.id === id);
          const before = prev.slice(0, currentIndex).filter(r => r.resi.trim());
          const after = prev.slice(currentIndex + 1).filter(r => r.resi.trim());
          const merged = [...before, ...newResiList, ...after];
          return checkBulkDuplicates(merged);
        });
        
        showToast(`${lines.length} resi berhasil di-paste`);
        return;
      }
    }
    // Jika single line, biarkan default behavior
  };

  const validBulkCount = bulkResiList.filter(r => r.resi.trim() && !r.isDuplicate).length;
  const duplicateBulkCount = bulkResiList.filter(r => r.isDuplicate).length;
  
  const getStatusBadge = (resi: ResiScanStage) => {
    if (resi.stage3_completed) {
      return <span className="px-2 py-1 text-xs bg-green-600 text-white rounded-full">Selesai</span>;
    }
    if (resi.stage2_verified) {
      return <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded-full">Stage 2</span>;
    }
    if (resi.stage1_scanned) {
      return <span className="px-2 py-1 text-xs bg-yellow-600 text-white rounded-full">Stage 1</span>;
    }
    return <span className="px-2 py-1 text-xs bg-gray-600 text-white rounded-full">Pending</span>;
  };
  
  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      {/* Sticky Header Section */}
      <div className="flex-shrink-0 p-4 md:p-6 pb-0">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-xl">
              <Scan size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Stage 1: Scanner Gudang</h1>
              <p className="text-sm text-gray-400">Scan resi dengan barcode scanner</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkScanModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors font-semibold"
            >
              <List size={16} />
              Scan Masal
            </button>
            <button
              onClick={loadResiList}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>
      
      {/* Scan Form */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6 shadow-lg border border-gray-700">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Package size={20} />
          Scan Resi Baru
        </h2>
        
        <form onSubmit={handleScanResi} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* E-commerce Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">E-commerce</label>
              <select
                value={ecommerce}
                onChange={(e) => setEcommerce(e.target.value as EcommercePlatform)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="SHOPEE">Shopee</option>
                <option value="TIKTOK">TikTok</option>
                <option value="KILAT">Kilat</option>
                <option value="RESELLER">Reseller</option>
                <option value="EKSPOR">Ekspor</option>
              </select>
            </div>
            {/* Sub Toko: jika RESELLER, input manual + dropdown suggestion untuk Nama Reseller */}
            <div>
              <label className="block text-sm font-medium mb-2">{ecommerce === 'RESELLER' ? 'Nama Reseller' : 'Sub Toko'}</label>
              {ecommerce === 'RESELLER' ? (
                <SubTokoResellerDropdown
                  value={subToko}
                  onChange={(v) => setSubToko(v as SubToko)}
                  suggestions={resellerNamesList}
                />
              ) : (
                <select
                  value={subToko}
                  onChange={(e) => setSubToko(e.target.value as SubToko)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="MJM">MJM</option>
                  <option value="BJW">BJW</option>
                  <option value="LARIS">LARIS</option>
                  <option value="PRAKTIS_PART">PRAKTIS PART</option>
                </select>
              )}
            </div>
            {/* Negara Ekspor (shown only for EKSPOR) */}
            {ecommerce === 'EKSPOR' && (
              <div>
                <label className="block text-sm font-medium mb-2">Negara</label>
                <select
                  value={negaraEkspor}
                  onChange={(e) => setNegaraEkspor(e.target.value as NegaraEkspor)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="PH">Philippines (PH)</option>
                  <option value="MY">Malaysia (MY)</option>
                  <option value="SG">Singapore (SG)</option>
                  <option value="HK">Hong Kong (HK)</option>
                </select>
              </div>
            )}
            {/* RESELLER DARI: dropdown MJM/BJW - hanya jika ecommerce RESELLER */}
            {ecommerce === 'RESELLER' && (
              <div>
                <label className="block text-sm font-medium mb-2">Reseller Dari</label>
                <select
                  value={selectedReseller}
                  onChange={e => setSelectedReseller(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">Pilih toko asal...</option>
                  <option value="MJM">MJM</option>
                  <option value="BJW">BJW</option>
                </select>
              </div>
            )}
          </div>
          
          {/* Resi Input: selalu tampil, baik reseller maupun non-reseller */}
          <div>
            <label className="block text-sm font-medium mb-2">Nomor Resi</label>
            <div className="flex gap-2">
              <input
                ref={resiInputRef}
                type="text"
                value={resiInput}
                onChange={(e) => setResiInput(e.target.value)}
                placeholder="Scan atau ketik nomor resi..."
                className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-mono"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !resiInput.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <Scan size={20} />
                Scan
              </button>
            </div>
          </div>
        </form>
      </div>
      
      {/* Resi List Header with Search - Sticky */}
      <div className="bg-gray-800 rounded-t-xl shadow-lg border border-gray-700 border-b-0">
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Daftar Resi Stage 1</h2>
            <div className="text-sm text-gray-400">
              Total: <span className="font-semibold text-blue-400">{filteredResiList.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setActiveResiTab('regular')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeResiTab === 'regular'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Reguler ({regularResiCount})
            </button>
            <button
              onClick={() => setActiveResiTab('kilat')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeResiTab === 'kilat'
                  ? 'bg-yellow-500 text-black'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              KILAT ({kilatResiCount})
            </button>
          </div>
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari resi, e-commerce, atau toko..."
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex gap-2">
              <input
                type="text"
                list="ecommerce-filter-list"
                value={searchEcommerce}
                onChange={e => setSearchEcommerce(e.target.value)}
                placeholder="Filter E-commerce"
                className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[140px]"
              />
              <datalist id="ecommerce-filter-list">
                {ecommerceOptions.map(opt => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
              <input
                type="text"
                list="toko-filter-list"
                value={searchToko}
                onChange={e => setSearchToko(e.target.value)}
                placeholder="Filter Toko"
                className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[140px]"
              />
              <datalist id="toko-filter-list">
                {tokoOptions.map(opt => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
      </div>
      </div>
      
      {/* Scrollable Resi List */}
      <div className="flex-1 overflow-auto px-4 md:px-6 pb-4 md:pb-6">
      <div className="bg-gray-800 rounded-b-xl shadow-lg border border-gray-700 border-t-0">
        
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Tanggal</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Resi</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">E-commerce</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Toko</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Di-scan oleh</th>
                <th className="px-4 py-3 text-center text-sm font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading && resiList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                    Memuat data...
                  </td>
                </tr>
              ) : filteredResiList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Belum ada resi yang di-scan
                  </td>
                </tr>
              ) : (
                filteredResiList.map((resi) => (
                  <tr key={resi.id} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      {new Date(resi.tanggal).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-blue-400">
                      {resi.resi}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-gray-700 rounded text-xs">
                        {resi.ecommerce}
                        {resi.negara_ekspor && !resi.ecommerce.includes(resi.negara_ekspor) && ` - ${resi.negara_ekspor}`}
                        {isInstantOrder(resi) && (
                          <span className="ml-1 px-1 py-0.5 bg-orange-500 text-white text-[9px] font-bold rounded">
                            INSTANT
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-semibold">
                        {resi.sub_toko}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getStatusBadge(resi)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {resi.stage1_scanned_by || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEditModal(resi)}
                          className="p-2 text-blue-400 hover:bg-blue-600/20 rounded-lg transition-colors"
                          title="Edit Resi"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteResi(resi.id, resi.stage2_verified, resi.stage3_completed)}
                          className={`p-2 hover:bg-red-600/20 rounded-lg transition-colors ${
                            resi.stage3_completed ? 'text-green-400' : resi.stage2_verified ? 'text-orange-400' : 'text-red-400'
                          }`}
                          title={resi.stage3_completed ? 'Hapus (Stage 3)' : resi.stage2_verified ? 'Hapus (Stage 2)' : 'Hapus'}
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
      </div>
      </div>
      
      {/* Reseller Form Modal */}
      {showResellerForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-2xl w-full border border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <User size={24} />
                Input Order Reseller
              </h3>
              <button
                onClick={() => setShowResellerForm(false)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Fitur ini akan menginput order langsung ke barang keluar tanpa melalui stage 2 & 3.
              </p>
              
              {/* Add Reseller */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newResellerName}
                  onChange={(e) => setNewResellerName(e.target.value)}
                  placeholder="Nama reseller baru..."
                  className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddReseller}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors flex items-center gap-2"
                >
                  <Plus size={16} />
                  Tambah
                </button>
              </div>
              
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
                <button
                  onClick={() => setShowResellerForm(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Scan Modal (Scan Masal) */}
      {showBulkScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-xl max-w-3xl w-full border border-gray-700 shadow-2xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <List size={24} className="text-purple-400" />
                Scan Masal - Input Banyak Resi
              </h3>
              <button
                onClick={() => setShowBulkScanModal(false)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Settings */}
            <div className="p-4 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">E-commerce</label>
                  <select
                    value={bulkEcommerce}
                    onChange={(e) => setBulkEcommerce(e.target.value as EcommercePlatform)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  >
                    <option value="SHOPEE">Shopee</option>
                    <option value="TIKTOK">TikTok</option>
                    <option value="KILAT">Kilat</option>
                    <option value="RESELLER">Reseller</option>
                    <option value="EKSPOR">Ekspor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">{bulkEcommerce === 'RESELLER' ? 'Nama Reseller' : 'Sub Toko'}</label>
                  {bulkEcommerce === 'RESELLER' ? (
                    <SubTokoResellerDropdown
                      value={bulkSubToko}
                      onChange={(v) => setBulkSubToko(v as SubToko)}
                      suggestions={resellerNamesList}
                    />
                  ) : (
                    <select
                      value={bulkSubToko}
                      onChange={(e) => setBulkSubToko(e.target.value as SubToko)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    >
                      <option value="MJM">MJM</option>
                      <option value="BJW">BJW</option>
                      <option value="LARIS">LARIS</option>
                      <option value="PRAKTIS_PART">PRAKTIS PART</option>
                    </select>
                  )}
                </div>
                {bulkEcommerce === 'EKSPOR' && (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-300">Negara</label>
                    <select
                      value={bulkNegaraEkspor}
                      onChange={(e) => setBulkNegaraEkspor(e.target.value as NegaraEkspor)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    >
                      <option value="PH">Philippines (PH)</option>
                      <option value="MY">Malaysia (MY)</option>
                      <option value="SG">Singapore (SG)</option>
                      <option value="HK">Hong Kong (HK)</option>
                    </select>
                  </div>
                )}
                {bulkEcommerce === 'RESELLER' && (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-300">Reseller Dari</label>
                    <select
                      value={bulkResellerDari}
                      onChange={(e) => setBulkResellerDari(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    >
                      <option value="">Pilih toko asal...</option>
                      <option value="MJM">MJM</option>
                      <option value="BJW">BJW</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Paste from Excel Area */}
            <div className="px-4 py-3 border-b border-gray-700 bg-blue-900/20 flex-shrink-0">
              <label className="block text-sm font-medium mb-2 text-blue-300">📋 Paste dari Excel</label>
              <textarea
                onPaste={handlePasteFromExcel}
                placeholder="Klik di sini lalu Ctrl+V untuk paste banyak resi dari Excel..."
                className="w-full px-3 py-2 bg-gray-700 border border-blue-600/50 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={2}
              />
              <p className="text-[10px] text-gray-500 mt-1">Copy kolom resi dari Excel, lalu paste di sini. Setiap baris akan menjadi 1 resi.</p>
            </div>

            {/* Table Header */}
            <div className="px-4 py-2 bg-gray-700/50 border-b border-gray-600 flex items-center gap-4 text-sm font-medium text-gray-300 flex-shrink-0">
              <div className="w-12 text-center">#</div>
              <div className="flex-1">Nomor Resi</div>
              <div className="w-24 text-center">Status</div>
              <div className="w-16 text-center">Aksi</div>
            </div>

            {/* Scrollable Table Body */}
            <div className="flex-1 overflow-auto p-2">
              {bulkResiList.map((item, index) => (
                <div 
                  key={item.id} 
                  className={`flex items-center gap-4 px-2 py-1.5 rounded ${
                    item.isDuplicate ? 'bg-red-900/30' : 'hover:bg-gray-700/30'
                  }`}
                >
                  <div className="w-12 text-center text-sm text-gray-400 font-mono">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <input
                      ref={(el) => { bulkInputRefs.current[item.id] = el; }}
                      type="text"
                      value={item.resi}
                      onChange={(e) => handleBulkResiChange(item.id, e.target.value)}
                      onKeyDown={(e) => handleBulkResiKeyDown(e, item.id, index)}
                      onPaste={(e) => handleBulkInputPaste(e, item.id)}
                      placeholder="Scan atau ketik resi (bisa paste dari Excel)..."
                      className={`w-full px-3 py-2 bg-gray-700 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                        item.isDuplicate ? 'border-red-500 text-red-300' : 'border-gray-600'
                      }`}
                      autoFocus={index === 0}
                    />
                  </div>
                  <div className="w-24 text-center">
                    {item.isDuplicate ? (
                      <span className="px-2 py-1 bg-red-600/30 text-red-300 rounded text-xs flex items-center gap-1 justify-center">
                        <AlertTriangle size={12} /> Double
                      </span>
                    ) : item.resi.trim() ? (
                      <span className="px-2 py-1 bg-green-600/30 text-green-300 rounded text-xs flex items-center gap-1 justify-center">
                        <Check size={12} /> OK
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs">-</span>
                    )}
                  </div>
                  <div className="w-16 text-center">
                    <button
                      onClick={() => handleRemoveBulkRow(item.id)}
                      disabled={bulkResiList.length <= 1}
                      className="p-1.5 text-red-400 hover:bg-red-600/20 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">
                    Total: <span className="font-semibold text-white">{bulkResiList.filter(r => r.resi.trim()).length}</span>
                  </span>
                  <span className="text-green-400">
                    Valid: <span className="font-semibold">{validBulkCount}</span>
                  </span>
                  {duplicateBulkCount > 0 && (
                    <span className="text-red-400">
                      Duplikat: <span className="font-semibold">{duplicateBulkCount}</span>
                    </span>
                  )}
                </div>
                <button
                  onClick={handleAddBulkRow}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
                >
                  <Plus size={14} />
                  Tambah Baris
                </button>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={handleClearBulkList}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
                >
                  Bersihkan
                </button>
                <button
                  onClick={() => setShowBulkScanModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveBulkScan}
                  disabled={bulkSaving || validBulkCount === 0}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {bulkSaving ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Simpan {validBulkCount} Resi
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Resi Modal */}
      {showEditModal && editingResi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-lg w-full border border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <Edit2 size={24} className="text-blue-400" />
                Edit Resi
              </h3>
              <button
                onClick={() => { setShowEditModal(false); setEditingResi(null); }}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Nomor Resi */}
              <div>
                <label className="block text-sm font-medium mb-2">Nomor Resi</label>
                <input
                  type="text"
                  value={editResiValue}
                  onChange={(e) => setEditResiValue(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Masukkan nomor resi..."
                />
              </div>
              
              {/* E-commerce */}
              <div>
                <label className="block text-sm font-medium mb-2">E-commerce</label>
                <select
                  value={editEcommerce}
                  onChange={(e) => setEditEcommerce(e.target.value as EcommercePlatform)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="SHOPEE">Shopee</option>
                  <option value="TIKTOK">TikTok</option>
                  <option value="KILAT">Kilat</option>
                  <option value="RESELLER">Reseller</option>
                  <option value="EKSPOR">Ekspor</option>
                </select>
              </div>
              
              {/* Negara Ekspor (jika EKSPOR) */}
              {editEcommerce === 'EKSPOR' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Negara Ekspor</label>
                  <select
                    value={editNegaraEkspor}
                    onChange={(e) => setEditNegaraEkspor(e.target.value as NegaraEkspor)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="PH">Philippines (PH)</option>
                    <option value="MY">Malaysia (MY)</option>
                    <option value="SG">Singapore (SG)</option>
                    <option value="HK">Hong Kong (HK)</option>
                  </select>
                </div>
              )}
              
              {/* Sub Toko */}
              <div>
                <label className="block text-sm font-medium mb-2">Toko</label>
                <select
                  value={editSubToko}
                  onChange={(e) => setEditSubToko(e.target.value as SubToko)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="MJM">MJM</option>
                  <option value="LARIS">LARIS</option>
                  <option value="BJW">BJW</option>
                </select>
              </div>
              
              {/* Status Info */}
              <div className="p-3 bg-gray-700/50 rounded-lg">
                <p className="text-sm text-gray-400">
                  Status: {editingResi.stage3_completed ? 'Stage 3 (Completed)' : editingResi.stage2_verified ? 'Stage 2' : 'Stage 1'}
                </p>
              </div>
            </div>
            
            {/* Footer Buttons */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => { setShowEditModal(false); setEditingResi(null); }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={loading || !editResiValue.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Simpan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
