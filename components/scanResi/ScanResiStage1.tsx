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

  const filtered = suggestions.filter(s => s.toLowerCase().includes(input.toLowerCase()) && s !== input);

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={input}
        onChange={e => { setInput(e.target.value); onChange(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)}
        placeholder="Nama toko reseller (manual/dropdown)"
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
}

const Toast = ({ message, type, onClose }: any) => (
  <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-white text-[13px] font-medium animate-in fade-in slide-in-from-top-3 duration-300 border backdrop-blur-sm ${
    type === 'success' 
      ? 'bg-emerald-600/95 border-emerald-500/50 shadow-emerald-900/30' 
      : 'bg-red-600/95 border-red-500/50 shadow-red-900/30'
  }`}>
    {type === 'success' ? <Check size={16} strokeWidth={2.5} /> : <X size={16} strokeWidth={2.5} />}
    <span className="tracking-wide">{message}</span>
    <button onClick={onClose} className="ml-1 p-1 opacity-70 hover:opacity-100 hover:bg-white/10 rounded-full transition-all">
      <X size={14}/>
    </button>
  </div>
);

export const ScanResiStage1: React.FC<ScanResiStage1Props> = ({ onRefresh }) => {
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

  // Ambil unique e-commerce dan toko dari data
  const ecommerceOptions = Array.from(new Set(resiList.map(r => r.ecommerce))).filter(Boolean);
  const tokoOptions = Array.from(new Set(resiList.map(r => r.sub_toko))).filter(Boolean);
  
  // State untuk Reseller
  const [showResellerForm, setShowResellerForm] = useState(false);
  const [resellers, setResellers] = useState<any[]>([]);
  // Untuk subToko suggestion dari data resi yang sudah pernah diinput
  const resellerTokoList: string[] = Array.from(new Set(resiList.filter(r => r.ecommerce === 'RESELLER').map(r => r.sub_toko)))
    .filter(Boolean)
    .map(String);
  const [newResellerName, setNewResellerName] = useState('');
  
  // State untuk Bulk Scan (Scan Masal)
  const [showBulkScanModal, setShowBulkScanModal] = useState(false);
  const [bulkEcommerce, setBulkEcommerce] = useState<EcommercePlatform>('SHOPEE');
  const [bulkSubToko, setBulkSubToko] = useState<SubToko>(selectedStore === 'bjw' ? 'BJW' : 'MJM');
  const [bulkNegaraEkspor, setBulkNegaraEkspor] = useState<NegaraEkspor>('PH');
  const [bulkResiList, setBulkResiList] = useState<Array<{ id: string; resi: string; isDuplicate: boolean }>>([
    { id: '1', resi: '', isDuplicate: false }
  ]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bulkInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  
  const resiInputRef = useRef<HTMLInputElement>(null);
  // Ref untuk mencegah double submit dari scanner
  const isSubmitting = useRef(false);
  
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
  
  // Load data on mount
  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      setLoading(true);
      try {
        const [resiData, resellerData] = await Promise.all([
          getResiStage1List(selectedStore),
          getResellers()
        ]);
        
        if (mounted) {
          setResiList(resiData);
          setResellers(resellerData);
        }
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Load data error:', err);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    
    loadData();
    
    return () => { mounted = false; };
  }, [selectedStore]);

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
  
  const handleScanResi = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // CEGAH DOUBLE SUBMIT: Jika sedang proses, abaikan input berikutnya
    if (isSubmitting.current) return;

    if (!resiInput.trim()) {
      showToast('Resi tidak boleh kosong!', 'error');
      return;
    }
    
    // Kunci proses
    isSubmitting.current = true;
    setLoading(true);
    
    try {
      const now = new Date().toISOString(); // atau gunakan format sesuai kebutuhan

      const payload = {
        resi: resiInput.trim(),
        ecommerce,
        sub_toko: subToko,
        negara_ekspor: ecommerce === 'EKSPOR' ? negaraEkspor : undefined,
        scanned_by: userName || 'Admin',
        tanggal: now,
        reseller: selectedReseller || null,
      };
      
      const result = await scanResiStage1(payload, selectedStore);
      
      if (result.success) {
        showToast('Resi berhasil di-scan!');
        setResiInput('');
        await loadResiList();
        if (onRefresh) onRefresh();
        // Scroll/focus ke input resi agar siap scan berikutnya
        setTimeout(() => {
          if (resiInputRef.current) {
            resiInputRef.current.focus();
            resiInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      } else {
        showToast(result.message, 'error');
        setResiInput(''); // KOSONGKAN INPUT JIKA DOUBLE/ERROR
        
        // FIX: Hanya mainkan audio jika error mengandung kata kunci duplikat/sudah ada
        const isDuplicate = result.message.toLowerCase().includes('duplicate') || 
                            result.message.toLowerCase().includes('unique') || 
                            result.message.toLowerCase().includes('sudah ada');

        if (isDuplicate) {
          try {
            const audio = new Audio(duplicateAudioFile);
            audio.volume = 1.0;
            audio.play().catch((e) => console.error('Audio play failed:', e));
          } catch (e) {
            console.error('Audio error:', e);
          }
        }
        
        // Tetap fokus ke input jika error
        setTimeout(() => {
          if (resiInputRef.current) {
            resiInputRef.current.focus();
            resiInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    } catch (error) {
      console.error("Scan error:", error);
      showToast("Terjadi kesalahan sistem", 'error');
    } finally {
      setLoading(false);
      // Delay unlock sedikit untuk mencegah bounce dari scanner
      setTimeout(() => {
        isSubmitting.current = false;
      }, 500);
    }
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
  
  const filteredResiList = resiList.filter(resi => {
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
      scanned_by: userName || 'Admin'
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
      return <span className="px-2 py-0.5 text-[10px] md:text-[11px] font-medium bg-emerald-600/90 text-white rounded-full">Selesai</span>;
    }
    if (resi.stage2_verified) {
      return <span className="px-2 py-0.5 text-[10px] md:text-[11px] font-medium bg-blue-600/90 text-white rounded-full">Stage 2</span>;
    }
    if (resi.stage1_scanned) {
      return <span className="px-2 py-0.5 text-[10px] md:text-[11px] font-medium bg-amber-600/90 text-white rounded-full">Stage 1</span>;
    }
    return <span className="px-2 py-0.5 text-[10px] md:text-[11px] font-medium bg-gray-600/90 text-white rounded-full">Pending</span>;
  };
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 px-3 py-4 md:px-6 md:py-5">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      {/* Header */}
      <div className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl shadow-lg shadow-blue-500/20">
              <Scan size={22} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Stage 1: Scanner Gudang</h1>
              <p className="text-xs md:text-sm text-gray-400 mt-0.5">Scan resi dengan barcode scanner</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkScanModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-all text-[13px] font-semibold shadow-lg shadow-purple-900/20 hover:shadow-purple-500/30"
            >
              <List size={15} />
              <span className="hidden sm:inline">Scan Masal</span>
              <span className="sm:hidden">Masal</span>
            </button>
            <button
              onClick={loadResiList}
              className="flex items-center gap-2 px-3.5 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-all text-[13px]"
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Scan Form */}
      <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl p-4 md:p-5 mb-5 shadow-xl border border-gray-700/80">
        <h2 className="text-base md:text-lg font-semibold mb-4 flex items-center gap-2 text-gray-100">
          <Package size={18} className="text-blue-400" />
          Scan Resi Baru
        </h2>
        
        <form onSubmit={handleScanResi} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {/* E-commerce Selection */}
            <div>
              <label className="block text-xs md:text-sm font-medium mb-1.5 text-gray-300">E-commerce</label>
              <select
                value={ecommerce}
                onChange={(e) => setEcommerce(e.target.value as EcommercePlatform)}
                className="w-full px-3 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-gray-500"
              >
                <option value="SHOPEE">Shopee</option>
                <option value="TIKTOK">TikTok</option>
                <option value="KILAT">Kilat</option>
                <option value="RESELLER">Reseller</option>
                <option value="EKSPOR">Ekspor</option>
              </select>
            </div>
            {/* Sub Toko: jika RESELLER, input manual + dropdown suggestion, jika bukan, dropdown biasa */}
            <div>
              <label className="block text-xs md:text-sm font-medium mb-1.5 text-gray-300">Sub Toko</label>
              {ecommerce === 'RESELLER' ? (
                <SubTokoResellerDropdown
                  value={subToko}
                  onChange={(v) => setSubToko(v as SubToko)}
                  suggestions={resellerTokoList}
                />
              ) : (
                <select
                  value={subToko}
                  onChange={(e) => setSubToko(e.target.value as SubToko)}
                  className="w-full px-3 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-gray-500"
                >
                  <option value="MJM">MJM</option>
                  <option value="BJW">BJW</option>
                  <option value="LARIS">LARIS</option>
                  <option value="PRAKTIS_PART">Praktis Part</option>
                </select>
              )}
            </div>
            {/* Negara Ekspor (shown only for EKSPOR) */}
            {ecommerce === 'EKSPOR' && (
              <div>
                <label className="block text-xs md:text-sm font-medium mb-1.5 text-gray-300">Negara</label>
                <select
                  value={negaraEkspor}
                  onChange={(e) => setNegaraEkspor(e.target.value as NegaraEkspor)}
                  className="w-full px-3 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-gray-500"
                >
                  <option value="PH">Philippines (PH)</option>
                  <option value="MY">Malaysia (MY)</option>
                  <option value="SG">Singapore (SG)</option>
                  <option value="HK">Hong Kong (HK)</option>
                </select>
              </div>
            )}
            {/* Input reseller hanya jika ecommerce RESELLER */}
            {ecommerce === 'RESELLER' && (
              <div>
                <label className="block text-xs md:text-sm font-medium mb-1.5 text-gray-300">Reseller</label>
                <input
                  type="text"
                  value={selectedReseller}
                  onChange={e => setSelectedReseller(e.target.value)}
                  placeholder="Nama reseller (opsional)"
                  className="w-full px-3 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] md:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-gray-500"
                />
              </div>
            )}
          </div>
          
          {/* Resi Input: selalu tampil, baik reseller maupun non-reseller */}
          <div>
            <label className="block text-xs md:text-sm font-medium mb-1.5 text-gray-300">Nomor Resi</label>
            <div className="flex gap-2">
              <input
                ref={resiInputRef}
                type="text"
                value={resiInput}
                onChange={(e) => setResiInput(e.target.value)}
                placeholder="Scan atau ketik nomor resi..."
                className="flex-1 px-4 py-3 bg-gray-700/80 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base md:text-lg font-mono tracking-wide transition-all hover:border-gray-500"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !resiInput.trim()}
                className="px-5 md:px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold transition-all flex items-center gap-2 shadow-lg shadow-blue-900/30 text-sm md:text-base"
              >
                <Scan size={18} />
                <span className="hidden sm:inline">Scan</span>
              </button>
            </div>
          </div>
        </form>
      </div>
      
      {/* Resi List */}
      <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-700/80 overflow-hidden">
        <div className="p-4 md:p-5 border-b border-gray-700/80">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h2 className="text-base md:text-lg font-semibold text-gray-100">Daftar Resi Stage 1</h2>
            <div className="text-xs md:text-sm text-gray-400">
              Total: <span className="font-bold text-blue-400">{filteredResiList.length}</span> resi
            </div>
          </div>
          {/* Filter Bar */}
          <div className="flex flex-col lg:flex-row gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 Cari resi, e-commerce, atau toko..."
              className="flex-1 px-3.5 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-gray-500"
            />
            <div className="flex gap-2">
              <input
                type="text"
                list="ecommerce-filter-list"
                value={searchEcommerce}
                onChange={e => setSearchEcommerce(e.target.value)}
                placeholder="E-commerce"
                className="px-3 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-gray-500 min-w-[110px] md:min-w-[130px]"
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
                placeholder="Toko"
                className="px-3 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-gray-500 min-w-[90px] md:min-w-[110px]"
              />
              <datalist id="toko-filter-list">
                {tokoOptions.map(opt => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
        
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700/80">
              <tr>
                <th className="px-3 md:px-4 py-2.5 text-left text-[11px] md:text-xs font-semibold text-gray-300 uppercase tracking-wider">Tanggal</th>
                <th className="px-3 md:px-4 py-2.5 text-left text-[11px] md:text-xs font-semibold text-gray-300 uppercase tracking-wider">Resi</th>
                <th className="px-3 md:px-4 py-2.5 text-left text-[11px] md:text-xs font-semibold text-gray-300 uppercase tracking-wider">E-commerce</th>
                <th className="px-3 md:px-4 py-2.5 text-left text-[11px] md:text-xs font-semibold text-gray-300 uppercase tracking-wider">Toko</th>
                <th className="px-3 md:px-4 py-2.5 text-left text-[11px] md:text-xs font-semibold text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-3 md:px-4 py-2.5 text-left text-[11px] md:text-xs font-semibold text-gray-300 uppercase tracking-wider hidden md:table-cell">Di-scan</th>
                <th className="px-3 md:px-4 py-2.5 text-center text-[11px] md:text-xs font-semibold text-gray-300 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {loading && resiList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    <RefreshCw size={22} className="animate-spin mx-auto mb-2 text-blue-400" />
                    <span className="text-sm">Memuat data...</span>
                  </td>
                </tr>
              ) : filteredResiList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    <Package size={28} className="mx-auto mb-2 opacity-50" />
                    <span className="text-sm">Belum ada resi yang di-scan</span>
                  </td>
                </tr>
              ) : (
                filteredResiList.map((resi) => (
                  <tr key={resi.id} className="hover:bg-gray-700/40 transition-colors">
                    <td className="px-3 md:px-4 py-2.5 text-[12px] md:text-[13px] text-gray-300">
                      {new Date(resi.tanggal).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit'
                      })}
                    </td>
                    <td className="px-3 md:px-4 py-2.5 text-[12px] md:text-[13px] font-mono font-semibold text-blue-400">
                      <span className="truncate max-w-[120px] md:max-w-none block">{resi.resi}</span>
                    </td>
                    <td className="px-3 md:px-4 py-2.5 text-[12px] md:text-[13px]">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700/80 rounded-md text-[11px] md:text-xs">
                        {resi.ecommerce}
                        {resi.negara_ekspor && !resi.ecommerce.includes(resi.negara_ekspor) && ` - ${resi.negara_ekspor}`}
                        {isInstantOrder(resi) && (
                          <span className="ml-0.5 px-1 py-0.5 bg-orange-500 text-white text-[8px] md:text-[9px] font-bold rounded">
                            INSTANT
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 md:px-4 py-2.5 text-[12px] md:text-[13px]">
                      <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 rounded-md text-[11px] md:text-xs font-semibold">
                        {resi.sub_toko}
                      </span>
                    </td>
                    <td className="px-3 md:px-4 py-2.5 text-[12px] md:text-[13px]">
                      {getStatusBadge(resi)}
                    </td>
                    <td className="px-3 md:px-4 py-2.5 text-[12px] md:text-[13px] text-gray-500 hidden md:table-cell">
                      {resi.stage1_scanned_by || '-'}
                    </td>
                    <td className="px-3 md:px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => handleOpenEditModal(resi)}
                          className="p-1.5 text-blue-400 hover:bg-blue-600/20 rounded-lg transition-colors"
                          title="Edit Resi"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteResi(resi.id, resi.stage2_verified, resi.stage3_completed)}
                          className={`p-1.5 hover:bg-red-600/20 rounded-lg transition-colors ${
                            resi.stage3_completed ? 'text-green-400' : resi.stage2_verified ? 'text-orange-400' : 'text-red-400'
                          }`}
                          title={resi.stage3_completed ? 'Hapus (Stage 3)' : resi.stage2_verified ? 'Hapus (Stage 2)' : 'Hapus'}
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
        
        {/* Table Footer */}
        {filteredResiList.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-700/50 bg-gray-700/20">
            <p className="text-[11px] md:text-xs text-gray-500 text-center">
              Menampilkan {filteredResiList.length} dari {resiList.length} resi • Tekan <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">Ctrl+Z</kbd> untuk undo hapus
            </p>
          </div>
        )}
      </div>
      
      {/* Reseller Form Modal */}
      {showResellerForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-gray-800/95 rounded-2xl p-5 max-w-lg w-full border border-gray-700/80 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-100">
                <User size={20} className="text-purple-400" />
                Input Order Reseller
              </h3>
              <button
                onClick={() => setShowResellerForm(false)}
                className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-[13px] text-gray-400">
                Fitur ini akan menginput order langsung ke barang keluar tanpa melalui stage 2 & 3.
              </p>
              
              {/* Add Reseller */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newResellerName}
                  onChange={(e) => setNewResellerName(e.target.value)}
                  placeholder="Nama reseller baru..."
                  className="flex-1 px-3.5 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <button
                  onClick={handleAddReseller}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20"
                >
                  <Plus size={15} />
                  Tambah
                </button>
              </div>
              
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-700/80">
                <button
                  onClick={() => setShowResellerForm(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm transition-all"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 md:p-4">
          <div className="bg-gray-800/95 rounded-2xl max-w-3xl w-full border border-gray-700/80 shadow-2xl max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-700/80 flex items-center justify-between flex-shrink-0">
              <h3 className="text-base md:text-lg font-semibold flex items-center gap-2 text-gray-100">
                <List size={20} className="text-purple-400" />
                Scan Masal - Input Banyak Resi
              </h3>
              <button
                onClick={() => setShowBulkScanModal(false)}
                className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Settings */}
            <div className="p-3 md:p-4 border-b border-gray-700/80 bg-gray-700/20 flex-shrink-0">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] md:text-xs font-medium mb-1.5 text-gray-400 uppercase tracking-wide">E-commerce</label>
                  <select
                    value={bulkEcommerce}
                    onChange={(e) => setBulkEcommerce(e.target.value as EcommercePlatform)}
                    className="w-full px-3 py-2 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  >
                    <option value="SHOPEE">Shopee</option>
                    <option value="TIKTOK">TikTok</option>
                    <option value="KILAT">Kilat</option>
                    <option value="RESELLER">Reseller</option>
                    <option value="EKSPOR">Ekspor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] md:text-xs font-medium mb-1.5 text-gray-400 uppercase tracking-wide">Sub Toko</label>
                  {bulkEcommerce === 'RESELLER' ? (
                    <SubTokoResellerDropdown
                      value={bulkSubToko}
                      onChange={(v) => setBulkSubToko(v as SubToko)}
                      suggestions={resellerTokoList}
                    />
                  ) : (
                    <select
                      value={bulkSubToko}
                      onChange={(e) => setBulkSubToko(e.target.value as SubToko)}
                      className="w-full px-3 py-2 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    >
                      <option value="MJM">MJM</option>
                      <option value="BJW">BJW</option>
                      <option value="LARIS">LARIS</option>
                      <option value="PRAKTIS_PART">Praktis Part</option>
                    </select>
                  )}
                </div>
                {bulkEcommerce === 'EKSPOR' && (
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-[11px] md:text-xs font-medium mb-1.5 text-gray-400 uppercase tracking-wide">Negara</label>
                    <select
                      value={bulkNegaraEkspor}
                      onChange={(e) => setBulkNegaraEkspor(e.target.value as NegaraEkspor)}
                      className="w-full px-3 py-2 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    >
                      <option value="PH">Philippines (PH)</option>
                      <option value="MY">Malaysia (MY)</option>
                      <option value="SG">Singapore (SG)</option>
                      <option value="HK">Hong Kong (HK)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Paste from Excel Area */}
            <div className="px-3 md:px-4 py-3 border-b border-gray-700/80 bg-blue-900/20 flex-shrink-0">
              <label className="block text-xs font-medium mb-1.5 text-blue-300 flex items-center gap-1.5">📋 Paste dari Excel</label>
              <textarea
                onPaste={handlePasteFromExcel}
                placeholder="Klik di sini lalu Ctrl+V untuk paste banyak resi dari Excel..."
                className="w-full px-3 py-2 bg-gray-700/80 border border-blue-600/30 rounded-xl text-[13px] font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
                rows={2}
              />
              <p className="text-[10px] text-gray-500 mt-1">Copy kolom resi dari Excel, lalu paste di sini. Setiap baris akan menjadi 1 resi.</p>
            </div>

            {/* Table Header */}
            <div className="px-3 md:px-4 py-2 bg-gray-700/40 border-b border-gray-600/80 flex items-center gap-3 text-[11px] md:text-xs font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">
              <div className="w-10 text-center">#</div>
              <div className="flex-1">Nomor Resi</div>
              <div className="w-20 text-center">Status</div>
              <div className="w-12 text-center">Aksi</div>
            </div>

            {/* Scrollable Table Body */}
            <div className="flex-1 overflow-auto p-2 md:p-3">
              {bulkResiList.map((item, index) => (
                <div 
                  key={item.id} 
                  className={`flex items-center gap-3 px-2 py-1.5 rounded-lg mb-1 ${
                    item.isDuplicate ? 'bg-red-900/30' : 'hover:bg-gray-700/30'
                  }`}
                >
                  <div className="w-10 text-center text-[12px] text-gray-500 font-mono">
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
                      placeholder="Scan atau ketik resi..."
                      className={`w-full px-3 py-2 bg-gray-700/80 border rounded-xl text-[13px] font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
                        item.isDuplicate ? 'border-red-500/70 text-red-300' : 'border-gray-600 hover:border-gray-500'
                      }`}
                      autoFocus={index === 0}
                    />
                  </div>
                  <div className="w-20 text-center">
                    {item.isDuplicate ? (
                      <span className="px-2 py-1 bg-red-600/30 text-red-300 rounded-md text-[10px] md:text-[11px] flex items-center gap-1 justify-center">
                        <AlertTriangle size={11} /> Double
                      </span>
                    ) : item.resi.trim() ? (
                      <span className="px-2 py-1 bg-emerald-600/30 text-emerald-300 rounded-md text-[10px] md:text-[11px] flex items-center gap-1 justify-center">
                        <Check size={11} /> OK
                      </span>
                    ) : (
                      <span className="text-gray-600 text-[11px]">-</span>
                    )}
                  </div>
                  <div className="w-12 text-center">
                    <button
                      onClick={() => handleRemoveBulkRow(item.id)}
                      disabled={bulkResiList.length <= 1}
                      className="p-1.5 text-red-400 hover:bg-red-600/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-3 md:p-4 border-t border-gray-700/80 flex-shrink-0 bg-gray-800/50">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 md:gap-4 text-[12px] md:text-[13px]">
                  <span className="text-gray-400">
                    Total: <span className="font-bold text-white">{bulkResiList.filter(r => r.resi.trim()).length}</span>
                  </span>
                  <span className="text-emerald-400">
                    Valid: <span className="font-bold">{validBulkCount}</span>
                  </span>
                  {duplicateBulkCount > 0 && (
                    <span className="text-red-400">
                      Duplikat: <span className="font-bold">{duplicateBulkCount}</span>
                    </span>
                  )}
                </div>
                <button
                  onClick={handleAddBulkRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-[12px] md:text-[13px] transition-all"
                >
                  <Plus size={14} />
                  Tambah Baris
                </button>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={handleClearBulkList}
                  className="px-3.5 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-[13px] transition-all"
                >
                  Bersihkan
                </button>
                <button
                  onClick={() => setShowBulkScanModal(false)}
                  className="px-3.5 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-[13px] transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveBulkScan}
                  disabled={bulkSaving || validBulkCount === 0}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-bold text-[13px] transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  {bulkSaving ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save size={14} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 md:p-4">
          <div className="bg-gray-800 rounded-2xl p-4 md:p-5 max-w-md w-full border border-gray-700/80 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <div className="p-1.5 bg-blue-500/20 rounded-lg">
                  <Edit2 size={18} className="text-blue-400" />
                </div>
                Edit Resi
              </h3>
              <button
                onClick={() => { setShowEditModal(false); setEditingResi(null); }}
                className="p-1.5 hover:bg-gray-700 rounded-lg transition-all"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-3">
              {/* Nomor Resi */}
              <div>
                <label className="block text-[12px] font-medium text-gray-400 mb-1.5">Nomor Resi</label>
                <input
                  type="text"
                  value={editResiValue}
                  onChange={(e) => setEditResiValue(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Masukkan nomor resi..."
                />
              </div>
              
              {/* E-commerce */}
              <div>
                <label className="block text-[12px] font-medium text-gray-400 mb-1.5">E-commerce</label>
                <select
                  value={editEcommerce}
                  onChange={(e) => setEditEcommerce(e.target.value as EcommercePlatform)}
                  className="w-full px-3 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                  <label className="block text-[12px] font-medium text-gray-400 mb-1.5">Negara Ekspor</label>
                  <select
                    value={editNegaraEkspor}
                    onChange={(e) => setEditNegaraEkspor(e.target.value as NegaraEkspor)}
                    className="w-full px-3 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                <label className="block text-[12px] font-medium text-gray-400 mb-1.5">Toko</label>
                <select
                  value={editSubToko}
                  onChange={(e) => setEditSubToko(e.target.value as SubToko)}
                  className="w-full px-3 py-2.5 bg-gray-700/80 border border-gray-600 rounded-xl text-[13px] focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option value="MJM">MJM</option>
                  <option value="LARIS">LARIS</option>
                  <option value="BJW">BJW</option>
                  <option value="PRAKTIS_PART">Praktis Part</option>
                </select>
              </div>
              
              {/* Status Info */}
              <div className="p-2.5 bg-gray-700/40 rounded-xl border border-gray-600/50">
                <p className="text-[12px] text-gray-400">
                  Status: <span className="text-white font-medium">{editingResi.stage3_completed ? 'Stage 3 (Completed)' : editingResi.stage2_verified ? 'Stage 2' : 'Stage 1'}</span>
                </p>
              </div>
            </div>
            
            {/* Footer Buttons */}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowEditModal(false); setEditingResi(null); }}
                className="flex-1 px-3.5 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-[13px] transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={loading || !editResiValue.trim()}
                className="flex-1 px-3.5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-bold text-[13px] transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                {loading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check size={14} />
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
