// FILE: components/scanResi/ScanResiStage3.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useStore } from '../../context/StoreContext';
import { supabase } from '../../services/supabaseClient';
import XLSX from '../../services/xlsx'; 
import { 
  checkResiStatus, 
  processBarangKeluarBatch, 
  lookupPartNumberInfo,
  getPendingStage3List,
  getAvailableParts,
  saveCSVToResiItems,
  fetchPendingCSVItems,
  updateResiItem,
  insertResiItem,
  getBulkPartNumberInfo,
  insertProductAlias,
  deleteProcessedResiItems,
  deleteResiItemById,
  deleteScanResiById,
  deleteProcessedScanResi,
  checkResiOrOrderStatus,
  checkExistingInBarangKeluar,
  getStage1ResiList,
  getAllPendingStage1Resi,
  batchUpdateResiItems
} from '../../services/resiScanService';
import { 
  parseShopeeCSV, 
  parseShopeeIntlCSV,
  parseTikTokCSV, 
  detectCSVPlatform
} from '../../services/csvParserService';
import { 
  Upload, Save, Trash2, Plus, DownloadCloud, RefreshCw, Filter, CheckCircle, Loader2, Settings, Search, X, AlertTriangle, Package, Zap
} from 'lucide-react';
import { EcommercePlatform, SubToko, NegaraEkspor } from '../../types';

interface Stage3Row {
  id: string;
  tanggal: string;
  resi: string;
  ecommerce: string;
  sub_toko: string;
  part_number: string;
  nama_barang_csv: string;    // Nama barang dari CSV/Excel (untuk alias)
  nama_barang_base: string;   // Nama barang dari database (base_mjm/bjw)
  brand: string;
  application: string;
  stock_saat_ini: number;
  qty_keluar: number;
  harga_total: number;
  harga_satuan: number;
  mata_uang: string;          // Mata uang (IDR, PHP, MYR, SGD, HKD) - untuk Ekspor
  no_pesanan: string;
  customer: string;
  is_db_verified: boolean;
  is_stock_valid: boolean;
  status_message: string;
  force_override_double: boolean;  // FITUR 1: Flag untuk force override status Double
}

// Interface untuk item yang di-skip saat upload CSV
interface SkippedItem {
  resi: string;
  order_id?: string;
  customer?: string;
  product_name?: string;
  reason: string;
}

// --- KOMPONEN DROPDOWN E-COMMERCE UNTUK CELL TABEL (COMPACT) ---
const EcommerceCellDropdown = ({ value, onChange, onSave }: { value: string, onChange: (v: string) => void, onSave: () => void }) => {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const ecommerceOptions = ['SHOPEE', 'SHOPEE INSTAN', 'TIKTOK', 'TIKTOK INSTAN', 'KILAT', 'RESELLER', 'EKSPOR', 'EKSPOR - PH', 'EKSPOR - MY', 'EKSPOR - SG', 'EKSPOR - HK'];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setShow(false);
    setTimeout(() => onSave(), 100);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="w-full px-1 py-0.5 text-[11px] text-left hover:bg-gray-700 rounded transition-colors flex items-center justify-between gap-1"
      >
        <span className="truncate">{value || '-'}</span>
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {show && (
        <div className="absolute z-50 mt-1 left-0 min-w-[120px] bg-gray-800 border border-gray-600 rounded shadow-lg max-h-48 overflow-auto animate-in fade-in slide-in-from-top-2">
          {ecommerceOptions.map((s) => (
            <div
              key={s}
              className={`px-2 py-1.5 cursor-pointer hover:bg-blue-600 hover:text-white transition-colors text-[11px] whitespace-nowrap ${s === value ? 'bg-blue-600 text-white' : ''}`}
              onMouseDown={() => handleSelect(s)}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- KOMPONEN DROPDOWN TOKO UNTUK CELL TABEL (COMPACT) ---
const TokoCellDropdown = ({ value, onChange, onSave }: { value: string, onChange: (v: string) => void, onSave: () => void }) => {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const tokoOptions = ['MJM', 'BJW', 'LARIS', 'PRAKTIS PART'];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setShow(false);
    setTimeout(() => onSave(), 100);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="w-full px-1 py-0.5 text-[11px] text-left hover:bg-gray-700 rounded transition-colors flex items-center justify-between gap-1"
      >
        <span>{value || '-'}</span>
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {show && (
        <div className="absolute z-50 mt-1 left-0 min-w-[60px] bg-gray-800 border border-gray-600 rounded shadow-lg max-h-48 overflow-auto animate-in fade-in slide-in-from-top-2">
          {tokoOptions.map((s) => (
            <div
              key={s}
              className={`px-2 py-1.5 cursor-pointer hover:bg-blue-600 hover:text-white transition-colors text-[11px] ${s === value ? 'bg-blue-600 text-white' : ''}`}
              onMouseDown={() => handleSelect(s)}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- KOMPONEN DROPDOWN E-COMMERCE (SEARCHABLE) ---
const EcommerceDropdown = ({ value, onChange }: { value: string, onChange: (v: string) => void }) => {
  const [show, setShow] = useState(false);
  const [input, setInput] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  const ecommerceOptions = ['SHOPEE', 'TIKTOK', 'TIKTOK INSTAN', 'KILAT', 'RESELLER', 'EKSPOR'];

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = ecommerceOptions.filter(s => s.toLowerCase().includes(input.toLowerCase()));

  const handleSelect = (val: string) => {
    onChange(val);
    setInput(val);
    setShow(false);
  };

  return (
    <div className="relative min-w-[100px]" ref={ref}>
      <input
        type="text"
        value={input}
        onChange={e => { setInput(e.target.value.toUpperCase()); setShow(true); }}
        onFocus={() => setShow(true)}
        placeholder="E-commerce"
        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-[10px] md:text-xs focus:ring-1 focus:ring-blue-500 focus:border-transparent"
        autoComplete="off"
      />
      {show && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded shadow-lg max-h-48 overflow-auto animate-in fade-in slide-in-from-top-2">
          {filtered.length > 0 ? filtered.map((s) => (
            <div
              key={s}
              className={`px-3 py-2 cursor-pointer hover:bg-blue-600 hover:text-white transition-colors text-xs ${s === value ? 'bg-blue-600 text-white' : ''}`}
              onMouseDown={() => handleSelect(s)}
            >
              {s}
            </div>
          )) : (
            <div className="px-3 py-2 text-xs text-gray-500">Tidak ditemukan</div>
          )}
        </div>
      )}
    </div>
  );
};

// --- KOMPONEN FILTER E-COMMERCE (SEARCHABLE dengan opsi "Semua") ---
const EcommerceFilterDropdown = ({ value, onChange }: { value: string, onChange: (v: string) => void }) => {
  const [show, setShow] = useState(false);
  const [input, setInput] = useState(value || 'Semua Ecommerce');
  const ref = useRef<HTMLDivElement>(null);

  const ecommerceOptions = [
    'SHOPEE', 
    'TIKTOK', 
    'TIKTOK INSTAN',
    'KILAT', 
    'RESELLER', 
    'EKSPOR',
    'EKSPOR - PH',
    'EKSPOR - MY',
    'EKSPOR - SG',
    'EKSPOR - HK'
  ];

  useEffect(() => { setInput(value || 'Semua Ecommerce'); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = ecommerceOptions.filter(s => s.toLowerCase().includes(input.toLowerCase()) || input === 'Semua Ecommerce');

  const handleSelect = (val: string) => {
    onChange(val);
    setInput(val || 'Semua Ecommerce');
    setShow(false);
  };

  return (
    <div className="relative min-w-[120px]" ref={ref}>
      <input
        type="text"
        value={input}
        onChange={e => { 
          const val = e.target.value.toUpperCase();
          setInput(val); 
          setShow(true); 
        }}
        onFocus={() => { setShow(true); if (input === 'Semua Ecommerce') setInput(''); }}
        onBlur={() => { if (!input) setInput('Semua Ecommerce'); }}
        placeholder="Filter E-commerce"
        className="w-full px-2 py-0.5 bg-gray-800 border border-gray-600 rounded text-[10px] md:text-xs text-gray-300 focus:border-blue-500 outline-none"
        autoComplete="off"
      />
      {show && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded shadow-lg max-h-48 overflow-auto animate-in fade-in slide-in-from-top-2">
          <div
            className={`px-3 py-2 cursor-pointer hover:bg-blue-600 hover:text-white transition-colors text-xs ${value === '' ? 'bg-blue-600 text-white' : ''}`}
            onMouseDown={() => handleSelect('')}
          >
            Semua Ecommerce
          </div>
          {(input === '' || input === 'Semua Ecommerce' ? ecommerceOptions : filtered).map((s) => (
            <div
              key={s}
              className={`px-3 py-2 cursor-pointer hover:bg-blue-600 hover:text-white transition-colors text-xs ${s === value ? 'bg-blue-600 text-white' : ''}`}
              onMouseDown={() => handleSelect(s)}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- KOMPONEN DROPDOWN RESELLER (DICOPY DARI STAGE 1) ---
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
    <div className="relative min-w-[150px]" ref={ref}>
      <input
        type="text"
        value={input}
        onChange={e => { setInput(e.target.value); onChange(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)}
        placeholder="Nama Toko Reseller"
        className="w-full px-3 py-1 bg-gray-700 border border-gray-600 rounded text-xs focus:ring-1 focus:ring-purple-500 focus:border-transparent"
        autoComplete="off"
      />
      {show && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded shadow-lg max-h-48 overflow-auto animate-in fade-in slide-in-from-top-2">
          {filtered.map((s, i) => (
            <div
              key={s}
              className="px-3 py-2 cursor-pointer hover:bg-purple-600 hover:text-white transition-colors text-xs"
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

// --- KOMPONEN MODAL PROCESSING BARANG KELUAR ---
interface ProcessingItem {
  id: string;
  resi: string;
  part_number: string;
  nama_barang: string;
  qty: number;
  customer: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  errorMessage?: string;
}

const ProcessingModal = ({ 
  isOpen, 
  items,
  progress,
  currentItem,
  isComplete,
  successCount,
  errorCount,
  onClose
}: { 
  isOpen: boolean;
  items: ProcessingItem[];
  progress: number;
  currentItem: string;
  isComplete: boolean;
  successCount: number;
  errorCount: number;
  onClose: () => void;
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll ke item yang sedang diproses
  useEffect(() => {
    if (logContainerRef.current && !isComplete) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [items, isComplete]);
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-gray-600">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            {!isComplete ? (
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            ) : errorCount > 0 ? (
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
            ) : (
              <CheckCircle className="w-6 h-6 text-green-500" />
            )}
            <h2 className="text-lg font-bold text-white">
              {!isComplete ? 'Memproses Barang Keluar...' : 'Proses Selesai'}
            </h2>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-750">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300">Progress</span>
            <span className="text-sm font-bold text-blue-400">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                isComplete 
                  ? errorCount > 0 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' : 'bg-gradient-to-r from-green-500 to-green-400'
                  : 'bg-gradient-to-r from-blue-600 via-purple-500 to-blue-600'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {!isComplete && currentItem && (
            <div className="mt-2 text-xs text-gray-400 truncate">
              Sedang memproses: <span className="text-blue-300 font-mono">{currentItem}</span>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="px-4 py-2 border-b border-gray-700 bg-gray-750/50">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className="text-xl font-bold text-white">{items.length}</div>
              <div className="text-[10px] text-gray-400">Total Item</div>
            </div>
            <div className="bg-green-900/30 rounded-lg p-2">
              <div className="text-xl font-bold text-green-400">{successCount}</div>
              <div className="text-[10px] text-gray-400">Sukses</div>
            </div>
            <div className="bg-red-900/30 rounded-lg p-2">
              <div className="text-xl font-bold text-red-400">{errorCount}</div>
              <div className="text-[10px] text-gray-400">Gagal</div>
            </div>
          </div>
        </div>

        {/* Processing Log */}
        <div ref={logContainerRef} className="flex-1 overflow-auto p-3 space-y-1 min-h-[200px] max-h-[300px]">
          {items.map((item, idx) => (
            <div 
              key={`${item.resi}-${item.part_number}-${idx}`}
              className={`flex items-center gap-2 p-2 rounded text-xs ${
                item.status === 'processing' ? 'bg-blue-900/30 border border-blue-600' :
                item.status === 'success' ? 'bg-green-900/20' :
                item.status === 'error' ? 'bg-red-900/20' :
                'bg-gray-700/30'
              }`}
            >
              {/* Status Icon */}
              <div className="flex-shrink-0 w-5">
                {item.status === 'processing' && <Loader2 size={14} className="text-blue-400 animate-spin" />}
                {item.status === 'success' && <CheckCircle size={14} className="text-green-400" />}
                {item.status === 'error' && <X size={14} className="text-red-400" />}
                {item.status === 'pending' && <div className="w-2 h-2 rounded-full bg-gray-500 mx-1" />}
              </div>
              
              {/* Item Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-yellow-400 text-[11px]">{item.part_number}</span>
                  <span className="text-gray-400">×{item.qty}</span>
                </div>
                <div className="text-gray-300 truncate">{item.nama_barang}</div>
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <span>{item.customer}</span>
                  <span className="text-blue-400 font-mono">{item.resi}</span>
                </div>
                {item.errorMessage && (
                  <div className={`text-[10px] mt-0.5 ${item.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                    {item.errorMessage}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            disabled={!isComplete}
            className={`w-full py-2.5 rounded-lg font-bold text-sm transition-all ${
              isComplete 
                ? 'bg-blue-600 hover:bg-blue-500 text-white' 
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isComplete ? 'Tutup' : 'Menunggu proses selesai...'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- DELETE CONFIRMATION MODAL ---
interface DeleteItem {
  id: string;
  resi: string;
  part_number: string;
  nama_barang: string;
  customer: string;
  ecommerce: string;
  sub_toko: string;
}

const DeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  items,
  isDeleting,
  deleteProgress,
  deleteComplete,
  deletedCount,
  errorCount
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  items: DeleteItem[];
  isDeleting: boolean;
  deleteProgress: number;
  deleteComplete: boolean;
  deletedCount: number;
  errorCount: number;
}) => {
  if (!isOpen) return null;

  // Group items by resi
  const groupedByResi = items.reduce((acc, item) => {
    if (!acc[item.resi]) {
      acc[item.resi] = [];
    }
    acc[item.resi].push(item);
    return acc;
  }, {} as Record<string, DeleteItem[]>);

  const resiCount = Object.keys(groupedByResi).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-red-600/50">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-red-900/20">
          <div className="flex items-center gap-3">
            {isDeleting && !deleteComplete ? (
              <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
            ) : deleteComplete ? (
              <CheckCircle className="w-6 h-6 text-green-500" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-red-500" />
            )}
            <h2 className="text-lg font-bold text-white">
              {deleteComplete ? 'Penghapusan Selesai' : isDeleting ? 'Menghapus Data...' : 'Konfirmasi Hapus Data'}
            </h2>
          </div>
          {!isDeleting && (
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Progress Bar - only show when deleting */}
        {isDeleting && (
          <div className="px-4 py-3 border-b border-gray-700 bg-gray-750">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">Progress Hapus</span>
              <span className="text-sm font-bold text-red-400">{Math.round(deleteProgress)}%</span>
            </div>
            <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-300 ease-out ${
                  deleteComplete 
                    ? 'bg-gradient-to-r from-green-500 to-green-400'
                    : 'bg-gradient-to-r from-red-600 via-red-500 to-red-600'
                }`}
                style={{ width: `${deleteProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Warning Message */}
        {!isDeleting && !deleteComplete && (
          <div className="px-4 py-3 border-b border-gray-700 bg-yellow-900/20">
            <div className="flex items-start gap-2 text-yellow-300 text-sm">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Peringatan! Data akan dihapus PERMANEN:</p>
                <ul className="mt-1 text-xs text-yellow-200/80 list-disc list-inside">
                  <li>Item dari tabel Stage 3 (resi_items)</li>
                  <li>Resi dari Stage 1 (scan_resi) - harus scan ulang jika ingin memproses lagi</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="px-4 py-2 border-b border-gray-700 bg-gray-750/50">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className="text-xl font-bold text-white">{resiCount}</div>
              <div className="text-[10px] text-gray-400">Total Resi</div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className="text-xl font-bold text-white">{items.length}</div>
              <div className="text-[10px] text-gray-400">Total Item</div>
            </div>
            {isDeleting && (
              <div className="bg-red-900/30 rounded-lg p-2">
                <div className="text-xl font-bold text-red-400">{deletedCount}</div>
                <div className="text-[10px] text-gray-400">Terhapus</div>
              </div>
            )}
            {!isDeleting && (
              <div className="bg-red-900/30 rounded-lg p-2">
                <div className="text-xl font-bold text-red-400">
                  <Trash2 size={20} className="mx-auto" />
                </div>
                <div className="text-[10px] text-gray-400">Akan Dihapus</div>
              </div>
            )}
          </div>
        </div>

        {/* List of items to delete */}
        <div className="flex-1 overflow-auto p-3 space-y-2 min-h-[200px] max-h-[300px]">
          {Object.entries(groupedByResi).map(([resi, resiItems]) => (
            <div key={resi} className="bg-gray-700/30 rounded-lg p-2 border border-gray-600">
              {/* Resi Header */}
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-600">
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-blue-400" />
                  <span className="font-mono text-blue-300 text-sm">{resi}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="px-1.5 py-0.5 bg-gray-600 rounded">{resiItems[0]?.ecommerce}</span>
                  <span className="px-1.5 py-0.5 bg-gray-600 rounded">{resiItems[0]?.sub_toko}</span>
                  <span className="px-1.5 py-0.5 bg-red-600/50 rounded text-red-200">{resiItems.length} item</span>
                </div>
              </div>
              
              {/* Items in this resi */}
              <div className="space-y-1">
                {resiItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-gray-300 bg-gray-800/50 rounded px-2 py-1">
                    <span className="font-mono text-yellow-400 w-24 truncate">{item.part_number || '-'}</span>
                    <span className="flex-1 truncate">{item.nama_barang || '-'}</span>
                    <span className="text-gray-500 truncate max-w-[80px]">{item.customer}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex gap-3">
          {!isDeleting && !deleteComplete ? (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-gray-700 hover:bg-gray-600 text-white transition-all"
              >
                Batal
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-2.5 rounded-lg font-bold text-sm bg-red-600 hover:bg-red-500 text-white transition-all flex items-center justify-center gap-2"
              >
                <Trash2 size={16} /> Hapus {resiCount} Resi
              </button>
            </>
          ) : deleteComplete ? (
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-lg font-bold text-sm bg-blue-600 hover:bg-blue-500 text-white transition-all"
            >
              Tutup
            </button>
          ) : (
            <button
              disabled
              className="w-full py-2.5 rounded-lg font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed"
            >
              Menunggu proses selesai...
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// --- KOMPONEN MODAL SKIPPED ITEMS ---
// Interface untuk item yang di-update
interface UpdatedItem {
  resi: string;
  order_id?: string;
  customer?: string;
  product_name?: string;
  ecommerce?: string;
}

// Interface untuk log proses
interface ProcessLog {
  type: 'info' | 'success' | 'skip' | 'error';
  resi: string;
  message: string;
}

const UploadResultModal = ({ 
  isOpen, 
  onClose, 
  skippedItems,
  updatedItems,
  summary,
  isProcessing,
  processLogs
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  skippedItems: SkippedItem[];
  updatedItems: UpdatedItem[];
  summary: {imported: number, updated: number, skipped: number};
  isProcessing: boolean;
  processLogs: ProcessLog[];
}) => {
  const [activeTab, setActiveTab] = useState<'updated' | 'skipped'>('updated');
  const logContainerRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll log ke bawah
  useEffect(() => {
    if (logContainerRef.current && isProcessing) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [processLogs, isProcessing]);
  
  if (!isOpen) return null;

  // Group skipped by reason
  const groupedByReason = skippedItems.reduce((acc, item) => {
    if (!acc[item.reason]) acc[item.reason] = [];
    acc[item.reason].push(item);
    return acc;
  }, {} as Record<string, SkippedItem[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            {isProcessing ? (
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-500" />
            )}
            <h2 className="text-lg font-semibold text-white">
              {isProcessing ? 'Sedang Memproses Data CSV...' : 'Hasil Upload CSV'}
            </h2>
          </div>
          {!isProcessing && (
            <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>

        {/* Processing Log View */}
        {isProcessing && (
          <div className="flex-1 flex flex-col p-4">
            <div className="flex items-center gap-2 mb-3">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-sm text-gray-300">Memproses {processLogs.length} item...</span>
            </div>
            
            {/* Log Container - seperti terminal */}
            <div 
              ref={logContainerRef}
              className="flex-1 bg-gray-900 rounded-lg p-3 overflow-auto font-mono text-xs max-h-[400px] border border-gray-700"
            >
              {processLogs.map((log, idx) => (
                <div key={idx} className={`py-1 flex items-start gap-2 ${
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'skip' ? 'text-yellow-400' :
                  log.type === 'error' ? 'text-red-400' :
                  'text-gray-400'
                }`}>
                  <span className="text-gray-600 select-none w-6 text-right shrink-0">{idx + 1}.</span>
                  <span className={`shrink-0 ${
                    log.type === 'success' ? 'text-green-500' :
                    log.type === 'skip' ? 'text-yellow-500' :
                    log.type === 'error' ? 'text-red-500' :
                    'text-blue-500'
                  }`}>
                    {log.type === 'success' ? '✓' :
                     log.type === 'skip' ? '⏭' :
                     log.type === 'error' ? '✗' : '→'}
                  </span>
                  <span className="text-blue-300 font-semibold shrink-0">{log.resi}</span>
                  <span className="text-gray-500">-</span>
                  <span>{log.message}</span>
                </div>
              ))}
              {processLogs.length === 0 && (
                <div className="text-gray-500 text-center py-4">Menunggu proses...</div>
              )}
            </div>
            
            {/* Progress bar */}
            <div className="mt-3">
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" 
                     style={{width: `${Math.min(processLogs.length * 2, 100)}%`}}></div>
              </div>
            </div>
          </div>
        )}

        {/* Summary - only show when done */}
        {!isProcessing && (
          <>
            <div className="p-4 border-b border-gray-700 bg-gray-750">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-green-900/30 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-400">{summary.imported}</div>
                  <div className="text-xs text-gray-400">Item Baru</div>
                </div>
                <div 
                  className={`bg-blue-900/30 rounded-lg p-3 cursor-pointer transition-all ${activeTab === 'updated' ? 'ring-2 ring-blue-500' : 'hover:bg-blue-900/50'}`}
                  onClick={() => setActiveTab('updated')}
                >
                  <div className="text-2xl font-bold text-blue-400">{summary.updated}</div>
                  <div className="text-xs text-gray-400">Item Diperbarui</div>
                </div>
                <div 
                  className={`bg-yellow-900/30 rounded-lg p-3 cursor-pointer transition-all ${activeTab === 'skipped' ? 'ring-2 ring-yellow-500' : 'hover:bg-yellow-900/50'}`}
                  onClick={() => setActiveTab('skipped')}
                >
                  <div className="text-2xl font-bold text-yellow-400">{summary.skipped}</div>
                  <div className="text-xs text-gray-400">Item Dilewati</div>
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-700">
              <button
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'updated' 
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-900/20' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                }`}
                onClick={() => setActiveTab('updated')}
              >
                <CheckCircle className="w-4 h-4 inline mr-2" />
                Diperbarui ({updatedItems.length})
              </button>
              <button
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'skipped' 
                    ? 'text-yellow-400 border-b-2 border-yellow-400 bg-yellow-900/20' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                }`}
                onClick={() => setActiveTab('skipped')}
              >
                <AlertTriangle className="w-4 h-4 inline mr-2" />
                Dilewati ({skippedItems.length})
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto p-4">
              {/* Updated Tab */}
              {activeTab === 'updated' && (
                <div>
                  {updatedItems.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      <p>Tidak ada item yang diperbarui</p>
                    </div>
                  ) : (
                    <div className="bg-gray-700/50 rounded-lg p-3">
                      <div className="max-h-60 overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-gray-700">
                            <tr className="text-gray-400">
                              <th className="text-left py-2 px-2">No</th>
                              <th className="text-left py-2 px-2">Resi / Order ID</th>
                              <th className="text-left py-2 px-2">Customer</th>
                              <th className="text-left py-2 px-2">Produk</th>
                              <th className="text-left py-2 px-2">Platform</th>
                            </tr>
                          </thead>
                          <tbody>
                            {updatedItems.map((item, idx) => (
                              <tr key={idx} className="border-t border-gray-600/50 hover:bg-blue-900/20">
                                <td className="py-1.5 px-2 text-gray-500">{idx + 1}</td>
                                <td className="py-1.5 px-2 font-mono text-blue-300">
                                  {item.resi || item.order_id || '-'}
                                </td>
                                <td className="py-1.5 px-2 text-gray-300 truncate max-w-[120px]">
                                  {item.customer || '-'}
                                </td>
                                <td className="py-1.5 px-2 text-gray-400 truncate max-w-[180px]">
                                  {item.product_name || '-'}
                                </td>
                                <td className="py-1.5 px-2">
                                  <span className="px-1.5 py-0.5 bg-blue-600/30 text-blue-300 text-xs rounded">
                                    {item.ecommerce || '-'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Skipped Tab */}
              {activeTab === 'skipped' && (
                <div>
                  {skippedItems.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                      <p>Semua data berhasil diproses!</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(groupedByReason).map(([reason, reasonItems]) => (
                        <div key={reason} className="bg-gray-700/50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            <span className="px-2 py-0.5 bg-yellow-600/30 text-yellow-400 text-xs rounded-full">
                              {reasonItems.length} item
                            </span>
                            <span className="text-sm font-medium text-yellow-400">{reason}</span>
                          </div>
                          <div className="max-h-40 overflow-auto">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-gray-700">
                                <tr className="text-gray-400">
                                  <th className="text-left py-1 px-2">No</th>
                                  <th className="text-left py-1 px-2">Resi / Order ID</th>
                                  <th className="text-left py-1 px-2">Customer</th>
                                  <th className="text-left py-1 px-2">Produk</th>
                                </tr>
                              </thead>
                              <tbody>
                                {reasonItems.map((item, idx) => (
                                  <tr key={idx} className="border-t border-gray-600/50 hover:bg-yellow-900/20">
                                    <td className="py-1 px-2 text-gray-500">{idx + 1}</td>
                                    <td className="py-1 px-2 font-mono text-yellow-300">
                                      {item.resi || item.order_id || '-'}
                                    </td>
                                    <td className="py-1 px-2 text-gray-400 truncate max-w-[120px]">
                                      {item.customer || '-'}
                                    </td>
                                    <td className="py-1 px-2 text-gray-400 truncate max-w-[180px]">
                                      {item.product_name || '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700">
              <button
                onClick={onClose}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Keep old modal for backward compatibility (will be replaced)
const SkippedItemsModal = ({ 
  isOpen, 
  onClose, 
  items,
  summary
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  items: SkippedItem[];
  summary: {imported: number, updated: number, skipped: number};
}) => {
  if (!isOpen) return null;

  // Group by reason
  const groupedByReason = items.reduce((acc, item) => {
    if (!acc[item.reason]) acc[item.reason] = [];
    acc[item.reason].push(item);
    return acc;
  }, {} as Record<string, SkippedItem[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-semibold text-white">Hasil Upload CSV</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Summary */}
        <div className="p-4 border-b border-gray-700 bg-gray-750">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-green-900/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-400">{summary.imported}</div>
              <div className="text-xs text-gray-400">Item Baru</div>
            </div>
            <div className="bg-blue-900/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-400">{summary.updated}</div>
              <div className="text-xs text-gray-400">Item Updated</div>
            </div>
            <div className="bg-yellow-900/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-yellow-400">{summary.skipped}</div>
              <div className="text-xs text-gray-400">Item Skipped</div>
            </div>
          </div>
        </div>

        {/* Skipped Items List */}
        <div className="flex-1 overflow-auto p-4">
          {items.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
              <p>Semua data berhasil diproses!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedByReason).map(([reason, reasonItems]) => (
                <div key={reason} className="bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-yellow-600/30 text-yellow-400 text-xs rounded-full">
                      {reasonItems.length} item
                    </span>
                    <span className="text-sm font-medium text-yellow-400">{reason}</span>
                  </div>
                  <div className="max-h-40 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-700">
                        <tr className="text-gray-400">
                          <th className="text-left py-1 px-2">Resi / Order ID</th>
                          <th className="text-left py-1 px-2">Customer</th>
                          <th className="text-left py-1 px-2">Produk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reasonItems.map((item, idx) => (
                          <tr key={idx} className="border-t border-gray-600/50 hover:bg-gray-600/30">
                            <td className="py-1 px-2 font-mono text-gray-300">
                              {item.resi || item.order_id || '-'}
                            </td>
                            <td className="py-1 px-2 text-gray-400 truncate max-w-[150px]">
                              {item.customer || '-'}
                            </td>
                            <td className="py-1 px-2 text-gray-400 truncate max-w-[200px]">
                              {item.product_name || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export const ScanResiStage3 = ({ onRefresh }: { onRefresh?: () => void }) => {
  const { selectedStore } = useStore();
  const [rows, setRows] = useState<Stage3Row[]>([]);
  const rowsRef = useRef<Stage3Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [partOptions, setPartOptions] = useState<{part_number: string, name: string}[]>([]);
  
  // AUTO-SAVE DEBOUNCE REFS
  const autoSaveTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingUpdates = useRef<Map<string, Stage3Row>>(new Map());
  const isFlushingPendingRef = useRef(false);
  const isMountedRef = useRef(true);
  
  // SELECTED RESI FOR PROCESS
  const [selectedResis, setSelectedResis] = useState<Set<string>>(new Set());
  
  // PROCESSING MODAL STATE
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [processingItems, setProcessingItems] = useState<ProcessingItem[]>([]);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingCurrentItem, setProcessingCurrentItem] = useState('');
  const [processingComplete, setProcessingComplete] = useState(false);
  const [processingSuccessCount, setProcessingSuccessCount] = useState(0);
  const [processingErrorCount, setProcessingErrorCount] = useState(0);
  
  // DELETE MODAL STATE
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteItems, setDeleteItems] = useState<DeleteItem[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteComplete, setDeleteComplete] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
  const [deleteErrorCount, setDeleteErrorCount] = useState(0);
  
  // FILTER STATES (VIEW)
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEcommerce, setFilterEcommerce] = useState<string>('');
  const [filterSubToko, setFilterSubToko] = useState<string>('');
  const [filterPartNumber, setFilterPartNumber] = useState<string>('');
  const [showPartNumberDropdown, setShowPartNumberDropdown] = useState(false);
  const partNumberSearchRef = useRef<HTMLDivElement>(null);
  const [activeResiTab, setActiveResiTab] = useState<'regular' | 'kilat'>('regular');

  // UPLOAD SETTINGS STATES (Seperti Stage 1)
  const [uploadEcommerce, setUploadEcommerce] = useState<EcommercePlatform>('SHOPEE');
  const [uploadSubToko, setUploadSubToko] = useState<SubToko>(selectedStore === 'bjw' ? 'BJW' : 'MJM');
  const [uploadNegara, setUploadNegara] = useState<NegaraEkspor>('PH');
  const [overrideStage1, setOverrideStage1] = useState<boolean>(false);

  // RESI SEARCH STATE
  const [stage1ResiList, setStage1ResiList] = useState<Array<{resi: string, no_pesanan?: string, ecommerce: string, sub_toko: string, stage2_verified: boolean}>>([]);
  const [resiSearchQuery, setResiSearchQuery] = useState('');
  
  // SORT STATE
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | 'none'>('none');
  const [showResiDropdown, setShowResiDropdown] = useState(false);
  const resiSearchRef = useRef<HTMLDivElement>(null);

  // SKIPPED ITEMS MODAL STATE
  const [showSkippedModal, setShowSkippedModal] = useState(false);
  const [skippedItems, setSkippedItems] = useState<SkippedItem[]>([]);
  const [updatedItems, setUpdatedItems] = useState<UpdatedItem[]>([]);
  const [uploadSummary, setUploadSummary] = useState<{imported: number, updated: number, skipped: number}>({imported: 0, updated: 0, skipped: 0});
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [processLogs, setProcessLogs] = useState<ProcessLog[]>([]);

  // REALTIME COLLABORATION STATE
  const [activeUsers, setActiveUsers] = useState<{userId: string, userName: string, color: string}[]>([]);
  const [editingCells, setEditingCells] = useState<Record<string, {userId: string, userName: string, color: string}>>({});
  
  // FOCUSED CELL STATE (Google Sheets-like navigation)
  const [focusedCell, setFocusedCell] = useState<{rowIndex: number, colKey: string} | null>(null);
  
  // PART NUMBER DROPDOWN STATE
  const [partNumberDropdown, setPartNumberDropdown] = useState<{rowId: string, rowIndex: number, isOpen: boolean, selectedIndex: number}>({rowId: '', rowIndex: -1, isOpen: false, selectedIndex: -1});
  const partNumberSelectedRef = useRef<{rowId: string, value: string} | null>(null); // Track dropdown selection to prevent onBlur override
  const [userCursors, setUserCursors] = useState<Record<string, {x: number, y: number, userName: string, color: string}>>({});
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const resiItemsChannelRef = useRef<RealtimeChannel | null>(null);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State untuk highlight cell yang baru diupdate (flash effect)
  const [recentlyUpdatedCells, setRecentlyUpdatedCells] = useState<Set<string>>(new Set());
  
  // Warna untuk user yang berbeda
  const userColors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'];
  const getUserColor = useCallback((oderId: string) => {
    const hash = oderId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return userColors[hash % userColors.length];
  }, []);
  
  // Generate unique user ID (persistent per session)
  const userIdRef = useRef<string>(Math.random().toString(36).substring(2, 15));
  const userNameRef = useRef<string>(`User-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
  
  // Throttle untuk cursor update (hanya kirim setiap 50ms)
  const lastCursorUpdate = useRef<number>(0);
  
  // Function untuk broadcast perubahan data ke user lain (instant, tanpa menunggu database)
  const broadcastDataChange = useCallback((rowId: string, field: string, value: any) => {
    if (!broadcastChannelRef.current) return;
    
    broadcastChannelRef.current.send({
      type: 'broadcast',
      event: 'data_change',
      payload: {
        rowId,
        field,
        value,
        userId: userIdRef.current,
        timestamp: Date.now()
      }
    });
  }, []);
  
  // Function untuk menambahkan flash effect pada cell yang diupdate
  const flashCell = useCallback((rowId: string, fields: string[]) => {
    const cellKeys = fields.map(f => `${rowId}-${f}`);
    setRecentlyUpdatedCells(prev => new Set([...prev, ...cellKeys]));
    
    // Remove flash setelah 1.5 detik
    setTimeout(() => {
      setRecentlyUpdatedCells(prev => {
        const newSet = new Set(prev);
        cellKeys.forEach(k => newSet.delete(k));
        return newSet;
      });
    }, 1500);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Ambil list reseller unik dari data yang sudah ada untuk suggestion
  const resellerTokoList: string[] = Array.from(new Set(rows.filter(r => r.ecommerce === 'RESELLER').map(r => r.sub_toko)))
    .filter(Boolean)
    .map(String);

  // Daftar status unik untuk filter
  const uniqueStatuses = Array.from(new Set(rows.map(r => r.status_message))).filter(Boolean);
  
  // Daftar toko unik untuk filter
  const uniqueTokos = Array.from(new Set(rows.map(r => r.sub_toko))).filter(Boolean);

  useEffect(() => {
    const loadParts = async () => {
      const parts = await getAvailableParts(selectedStore);
      setPartOptions(parts);
    };
    loadParts();
  }, [selectedStore]);

  // Update uploadSubToko ketika selectedStore berubah
  useEffect(() => {
    setUploadSubToko(selectedStore === 'bjw' ? 'BJW' : 'MJM');
  }, [selectedStore]);

  // Load Stage 1 resi list untuk dropdown search
  useEffect(() => {
    const loadStage1Resi = async () => {
      const resiList = await getStage1ResiList(selectedStore);
      setStage1ResiList(resiList);
    };
    loadStage1Resi();
  }, [selectedStore]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (resiSearchRef.current && !resiSearchRef.current.contains(e.target as Node)) {
        setShowResiDropdown(false);
      }
      if (partNumberSearchRef.current && !partNumberSearchRef.current.contains(e.target as Node)) {
        setShowPartNumberDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    loadSavedDataFromDB();
  }, [selectedStore]);

  // REALTIME SUBSCRIPTION untuk kolaborasi multi-user
  useEffect(() => {
    const tableName = selectedStore === 'bjw' ? 'resi_items_bjw' : 'resi_items_mjm';
    const userId = userIdRef.current;
    const userName = userNameRef.current;
    const userColor = getUserColor(userId);

    // Channel untuk perubahan data resi_items
    resiItemsChannelRef.current = supabase
      .channel(`${tableName}-changes`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: tableName
        },
        async (payload) => {
          console.log('[Realtime] UPDATE received:', payload.new);
          
          const newData = payload.new as any;
          const rowId = `db-${String(newData.id)}`;
          const legacyRowId = String(newData.id);
          
          // Flash effect untuk cell yang berubah
          const changedFields: string[] = [];
          if (newData.part_number !== undefined) changedFields.push('part_number');
          if (newData.qty !== undefined) changedFields.push('qty');
          if (newData.harga_total !== undefined) changedFields.push('harga_total');
          if (changedFields.length > 0) {
            flashCell(rowId, changedFields);
          }
          
          // STEP 1: Update data segera (tanpa menunggu lookup) - untuk kecepatan
          setRows(prevRows => 
            prevRows.map(row => {
              if (row.id !== rowId && row.id !== legacyRowId) return row;
              return { 
                ...row, 
                part_number: newData.part_number ?? row.part_number,
                qty_keluar: newData.qty ?? row.qty_keluar,
                harga_satuan: newData.harga_satuan ?? row.harga_satuan,
                harga_total: newData.harga_total ?? row.harga_total,
                customer: newData.customer ?? row.customer,
                ecommerce: newData.ecommerce ?? row.ecommerce,
                sub_toko: newData.toko ?? row.sub_toko,
              };
            })
          );
          
          // STEP 2: Lookup part info di background, lalu update lagi
          if (newData.part_number) {
            try {
              const partInfo = await lookupPartNumberInfo(newData.part_number, selectedStore);
              if (partInfo) {
                setRows(prevRows => 
                  prevRows.map(row => {
                    if (row.id !== rowId && row.id !== legacyRowId) return row;
                    return {
                      ...row,
                      nama_barang_base: partInfo.name || '',
                      brand: partInfo.brand || '',
                      application: partInfo.application || '',
                      stock_saat_ini: partInfo.quantity || 0,
                      is_db_verified: true,
                      is_stock_valid: (partInfo.quantity || 0) >= row.qty_keluar,
                      status_message: (partInfo.quantity || 0) >= row.qty_keluar ? 'Ready' : 'Stok Kurang',
                    };
                  })
                );
              }
            } catch (e) {
              console.error('[Realtime] Error looking up part info:', e);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: tableName
        },
        async (payload) => {
          console.log('[Realtime] INSERT received:', payload.new);
          
          const newData = payload.new as any;
          const newRowId = `db-${String(newData.id)}`;
          const resiUpper = String(newData.resi || '').trim().toUpperCase();
          const orderUpper = String(newData.order_id || '').trim().toUpperCase();
          const customerUpper = String(newData.customer || '').trim().toUpperCase();
          const partUpper = String(newData.part_number || '').trim().toUpperCase();
          
          // Cek apakah row dengan ID ini sudah ada (untuk menghindari duplikat)
          setRows(prevRows => {
            const exists = prevRows.some(row => row.id === newRowId);
            if (exists) {
              console.log('[Realtime] INSERT ignored - row already exists:', newRowId);
              return prevRows;
            }
            
            // Buat row baru dari data yang diterima
            const newRow: Stage3Row = {
              id: newRowId,
              tanggal: newData.tanggal || new Date().toISOString().split('T')[0],
              resi: newData.resi || '',
              ecommerce: newData.ecommerce || '-',
              sub_toko: newData.toko || (selectedStore === 'bjw' ? 'BJW' : 'MJM'),
              part_number: newData.part_number || '',
              nama_barang_csv: newData.nama_barang || '',
              nama_barang_base: '',
              brand: '',
              application: '',
              stock_saat_ini: 0,
              qty_keluar: newData.qty || 0,
              harga_total: newData.harga_total || 0,
              harga_satuan: newData.harga_satuan || 0,
              mata_uang: 'IDR',
              no_pesanan: newData.order_id || '',
              customer: newData.customer || '',
              is_db_verified: false,
              is_stock_valid: true,
              status_message: 'Baru',
              force_override_double: false
            };
            
            // Cari row lokal yang ekuivalen (apapun prefix id-nya, bukan hanya s1-)
            const matchingIdx = prevRows.findIndex(row => {
              // Jangan match dengan row DB lain
              if (String(row.id).startsWith('db-')) return false;
              const rowResiUpper = String(row.resi || '').trim().toUpperCase();
              const rowOrderUpper = String(row.no_pesanan || '').trim().toUpperCase();
              const rowCustomerUpper = String(row.customer || '').trim().toUpperCase();
              const rowPartUpper = String(row.part_number || '').trim().toUpperCase();
              const orderMatch = rowOrderUpper === orderUpper || (!rowOrderUpper && !orderUpper);
              const customerMatch = rowCustomerUpper === customerUpper || !rowCustomerUpper || !customerUpper;
              const partMatch = !rowPartUpper || !partUpper || rowPartUpper === partUpper;
              return rowResiUpper === resiUpper && orderMatch && customerMatch && partMatch;
            });

            if (matchingIdx >= 0) {
              const nextRows = [...prevRows];
              nextRows[matchingIdx] = {
                ...nextRows[matchingIdx],
                ...newRow,
                id: newRowId
              };
              console.log('[Realtime] INSERT merged into existing local row:', newRowId);
              return nextRows;
            }

            console.log('[Realtime] Adding new row:', newRow);
            return [...prevRows, newRow];
          });
          
          // Lookup part info di background jika ada part_number
          if (newData.part_number) {
            try {
              const partInfo = await lookupPartNumberInfo(newData.part_number, selectedStore);
              if (partInfo) {
                setRows(prevRows => 
                  prevRows.map(row => {
                    if (row.id !== newRowId) return row;
                    return {
                      ...row,
                      nama_barang_base: partInfo.name || '',
                      brand: partInfo.brand || '',
                      application: partInfo.application || '',
                      stock_saat_ini: partInfo.quantity || 0,
                      is_db_verified: true,
                      is_stock_valid: (partInfo.quantity || 0) >= row.qty_keluar,
                      status_message: (partInfo.quantity || 0) >= row.qty_keluar ? 'Ready' : 'Stok Kurang',
                    };
                  })
                );
              }
            } catch (e) {
              console.error('[Realtime] Error looking up part info for new row:', e);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: tableName
        },
        (payload) => {
          console.log('[Realtime] DELETE received:', payload.old);
          // Remove deleted row
          const deletedDbId = `db-${String(payload.old.id)}`;
          const legacyDeletedId = String(payload.old.id);
          setRows(prevRows => prevRows.filter(row => row.id !== deletedDbId && row.id !== legacyDeletedId));
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] ${tableName} subscription status:`, status);
      });

    // Channel untuk INSTANT broadcast perubahan data (tanpa menunggu database)
    broadcastChannelRef.current = supabase
      .channel(`stage3-broadcast-${selectedStore}`)
      .on('broadcast', { event: 'data_change' }, (payload) => {
        const { rowId, field, value, userId: senderId } = payload.payload;
        
        // Jangan proses jika dari user yang sama
        if (senderId === userId) return;
        
        console.log('[Broadcast] Data change received:', { rowId, field, value });
        
        // Flash effect
        flashCell(rowId, [field]);
        
        // Update data langsung
        setRows(prevRows =>
          prevRows.map(row => {
            if (row.id !== rowId) return row;
            
            // Map field names
            const fieldMap: Record<string, keyof Stage3Row> = {
              'part_number': 'part_number',
              'qty_keluar': 'qty_keluar',
              'harga_total': 'harga_total',
              'harga_satuan': 'harga_satuan',
              'customer': 'customer',
              'ecommerce': 'ecommerce',
              'sub_toko': 'sub_toko',
              'tanggal': 'tanggal',
            };
            
            const rowField = fieldMap[field];
            if (rowField) {
              return { ...row, [rowField]: value };
            }
            return row;
          })
        );
      })
      .subscribe((status) => {
        console.log(`[Broadcast] stage3-broadcast-${selectedStore} status:`, status);
      });

    // Channel untuk presence (siapa yang online dan sedang edit apa)
    presenceChannelRef.current = supabase
      .channel(`stage3-presence-${selectedStore}`, {
        config: {
          presence: {
            key: userId,
          },
        },
      })
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannelRef.current?.presenceState() || {};
        const users: {userId: string, userName: string, color: string}[] = [];
        const cells: Record<string, {userId: string, userName: string, color: string}> = {};
        
        Object.entries(state).forEach(([oderId, presences]) => {
          const presence = (presences as any[])[0];
          if (presence && presence.oderId !== oderId) {
            users.push({
              userId: presence.userId,
              userName: presence.userName,
              color: presence.color
            });
            if (presence.editingCell) {
              cells[presence.editingCell] = {
                userId: presence.userId,
                userName: presence.userName,
                color: presence.color
              };
            }
          }
        });
        
        setActiveUsers(users);
        setEditingCells(cells);
        
        // Update cursor positions
        const cursors: Record<string, {x: number, y: number, userName: string, color: string}> = {};
        Object.entries(state).forEach(([oderId, presences]) => {
          const presence = (presences as any[])[0];
          if (presence && presence.userId !== userId && presence.cursorX !== undefined && presence.cursorY !== undefined) {
            cursors[presence.userId] = {
              x: presence.cursorX,
              y: presence.cursorY,
              userName: presence.userName,
              color: presence.color
            };
          }
        });
        setUserCursors(cursors);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannelRef.current?.track({
            online_at: new Date().toISOString(),
            userId,
            userName,
            color: userColor,
            editingCell: null,
            cursorX: 0,
            cursorY: 0
          });
        }
      });

    // Mouse move handler untuk broadcast cursor position
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      // Throttle: hanya kirim setiap 16ms (~60fps) untuk cursor yang lebih responsif
      if (now - lastCursorUpdate.current < 16) return;
      lastCursorUpdate.current = now;
      
      if (presenceChannelRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        presenceChannelRef.current.track({
          online_at: new Date().toISOString(),
          userId,
          userName,
          color: userColor,
          editingCell: null,
          cursorX: x,
          cursorY: y
        });
      }
    };

    // Add mouse move listener
    document.addEventListener('mousemove', handleMouseMove);

    // Cleanup
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (resiItemsChannelRef.current) {
        supabase.removeChannel(resiItemsChannelRef.current);
      }
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
      }
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current);
      }
    };
  }, [selectedStore, getUserColor, flashCell]);

  // Function untuk broadcast cell yang sedang diedit
  const broadcastEditingCell = useCallback(async (cellKey: string | null) => {
    if (!presenceChannelRef.current) return;
    
    const userId = userIdRef.current;
    const userName = userNameRef.current;
    const userColor = getUserColor(userId);
    
    await presenceChannelRef.current.track({
      online_at: new Date().toISOString(),
      userId,
      userName,
      color: userColor,
      editingCell: cellKey,
      cursorX: 0,
      cursorY: 0
    });
  }, [getUserColor]);

  // Helper untuk cek apakah cell sedang diedit user lain
  const getCellEditStatus = useCallback((rowId: string, field: string) => {
    const cellKey = `${rowId}-${field}`;
    return editingCells[cellKey] || null;
  }, [editingCells]);

  const loadSavedDataFromDB = async () => {
    setLoading(true);
    try {
      const savedItems = await fetchPendingCSVItems(selectedStore);
      
      if (savedItems.length > 0) {
        // Kumpulkan semua resi DAN no_pesanan untuk dicek di Stage 1/2
        const allResis = savedItems.map((i: any) => i.resi).filter(Boolean);
        const allOrderIds = savedItems.map((i: any) => i.order_id).filter(Boolean);
        const allResiOrOrders = [...new Set([...allResis, ...allOrderIds])];
        const allParts = savedItems.map((i: any) => i.part_number).filter(Boolean);

        const [dbStatus, bulkPartInfo] = await Promise.all([
            checkResiOrOrderStatus(allResiOrOrders, selectedStore),
            getBulkPartNumberInfo(allParts, selectedStore)
        ]);

        // Map by resi AND no_pesanan (UPPERCASE untuk case-insensitive matching)
        const statusMapByResi = new Map();
        const statusMapByOrder = new Map();
        dbStatus.forEach((d: any) => {
          if (d.resi) statusMapByResi.set(d.resi.trim().toUpperCase(), d);
          if (d.no_pesanan) statusMapByOrder.set(String(d.no_pesanan).trim().toUpperCase(), d);
        });

        // Map part info dengan UPPERCASE key untuk case-insensitive matching
        const partMap = new Map();
        bulkPartInfo.forEach((p: any) => {
          if (p.part_number) {
            partMap.set(p.part_number.trim().toUpperCase(), p);
          }
        });

        const loadedRows: Stage3Row[] = [];
        
        // Track untuk deteksi duplikat
        const seenKeys = new Set<string>();

        for (const item of savedItems) {
           // Cari di Stage 1 by resi ATAU by order_id (untuk instant/sameday) - UPPERCASE
           const resiUpper = (item.resi || '').trim().toUpperCase();
           const orderIdUpper = (item.order_id || '').trim().toUpperCase();
           
           let dbRow = statusMapByResi.get(resiUpper);
           if (!dbRow && orderIdUpper) {
             dbRow = statusMapByOrder.get(orderIdUpper);
           }
           
           // Gunakan UPPERCASE untuk lookup part number
           const partNumberUpper = (item.part_number || '').trim().toUpperCase();
           const partInfo = partMap.get(partNumberUpper);
           
           let statusMsg = 'Ready';
           let verified = true;
           
           // Prioritas Ecom: Stage 1 SELALU prioritas untuk mendapatkan negara ekspor yang benar
           let ecommerceCSV = item.ecommerce || '-';
           let ecommerceS1 = dbRow?.ecommerce || '-';
           
           // SELALU gunakan ecommerce dari Stage 1 jika tersedia (karena punya info negara)
           // Fallback ke CSV jika Stage 1 tidak ada
           let ecommerceDB = ecommerceS1 !== '-' ? ecommerceS1 : ecommerceCSV;
           
           // Jika masih hanya "EKSPOR" tanpa negara, dan ada negara_ekspor di dbRow, tambahkan
           if (ecommerceDB === 'EKSPOR' && dbRow?.negara_ekspor) {
             ecommerceDB = `EKSPOR - ${dbRow.negara_ekspor}`;
           }
           
           let subToko = item.toko || (dbRow?.sub_toko) || (selectedStore === 'bjw' ? 'BJW' : 'MJM');

           // CHECK 1: Belum Scan Stage 1
           if (!dbRow) { 
               statusMsg = 'Belum Scan S1'; verified = false; 
           } else {
               // CHECK 2: Belum verifikasi Stage 2
               // Handle berbagai format: boolean true, string 'true', atau truthy value
               const isS2Verified = dbRow.stage2_verified === true || 
                                    dbRow.stage2_verified === 'true' || 
                                    String(dbRow.stage2_verified).toLowerCase() === 'true';
               if (!isS2Verified) { 
                   statusMsg = 'Pending S2'; verified = false; 
               }
           }

           let stock = 0;
           let brand = '';
           let app = '';
           let namaBase = '';
           if (partInfo) { 
              stock = partInfo.quantity || 0; 
              brand = partInfo.brand || ''; 
              app = partInfo.application || '';
              namaBase = partInfo.name || '';
           }
           
           // Ambil qty dari database - SELALU gunakan nilai asli
           // Tidak perlu set ke 0 meskipun part_number kosong
           const rawQty = Number(item.jumlah || item.quantity || 0);
           const qty = rawQty; // Gunakan qty asli dari CSV/database
           const stockValid = (qty > 0 && item.part_number) ? stock >= qty : true; // Hanya cek stok jika ada part_number
           
           // CHECK 3: Part number belum diisi - CEK INI DULU sebelum stok
           if (verified && !item.part_number) {
               statusMsg = 'Butuh Input';
               verified = false;
           }
           
           // CHECK 4: Stok kurang - hanya cek jika part number sudah diisi
           if (verified && !stockValid) {
               statusMsg = 'Stok Kurang';
           }
           
           // CHECK 5: Nama barang base masih kosong (part number ada tapi tidak ditemukan di database)
           if (verified && stockValid && !namaBase && item.part_number) {
               statusMsg = 'Base Kosong';
               verified = false;
           }
           
           // CHECK 6: Cek duplikat - Double jika: resi + customer + no_pesanan + part_number + nama_barang_csv SAMA
           // FITUR 2: Menambahkan nama_barang_csv ke key
           // Jadi item dengan part_number sama tapi nama_barang_csv berbeda = BUKAN Double
           // Contoh: "Motor PW Depan Brio" dan "Motor PW Belakang Brio" dengan part_number sama = OK
           const namaCSVNormalized = (item.nama_produk || '').toLowerCase().trim();
           const dupeKey = `${item.resi}||${item.customer}||${item.order_id}||${item.part_number}||${namaCSVNormalized}`;
           if (item.part_number && seenKeys.has(dupeKey)) {
               statusMsg = 'Double';
               verified = false;
           }
           seenKeys.add(dupeKey);

           // Filter nama_produk: jika "-" atau "Item CSV", jadikan kosong
           const namaCsv = item.nama_produk && item.nama_produk !== '-' && item.nama_produk !== 'Item CSV' 
             ? item.nama_produk 
             : '';
           
           loadedRows.push({
             id: `db-${item.id}`,
             tanggal: item.created_at ? item.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
             resi: item.resi,
             ecommerce: ecommerceDB,
             sub_toko: subToko,
             part_number: item.part_number || '',
             nama_barang_csv: namaCsv, 
             nama_barang_base: namaBase, 
             brand: brand,
             application: app,
             stock_saat_ini: stock,
             qty_keluar: qty,
             harga_total: Number(item.total_harga_produk || 0),
             harga_satuan: qty > 0 ? (Number(item.total_harga_produk || 0) / qty) : 0,
             mata_uang: (item as any).mata_uang || (ecommerceDB.startsWith('EKSPOR') ? ecommerceDB.split(' - ')[1] || 'PHP' : 'IDR'),
             no_pesanan: item.order_id || '',
             customer: item.customer || '',
             is_db_verified: verified,
             is_stock_valid: stockValid,
             status_message: statusMsg,
             force_override_double: false  // FITUR 1: Default false
           });
        }

        // === OPSI 3: AGGREGATE CHECK ===
        // Hitung total qty yang dibutuhkan per part_number (UPPERCASE key untuk konsistensi)
        const aggregateQtyMap = new Map<string, { totalNeeded: number; stock: number }>();
        loadedRows.forEach(row => {
          if (row.part_number) {
            const partKey = row.part_number.trim().toUpperCase();
            const existing = aggregateQtyMap.get(partKey);
            if (existing) {
              existing.totalNeeded += row.qty_keluar;
            } else {
              aggregateQtyMap.set(partKey, { 
                totalNeeded: row.qty_keluar, 
                stock: row.stock_saat_ini 
              });
            }
          }
        });

        // Update status untuk item yang total qty melebihi stok
        loadedRows.forEach(row => {
          if (row.part_number) {
            const partKey = row.part_number.trim().toUpperCase();
            const aggregate = aggregateQtyMap.get(partKey);
            if (aggregate && aggregate.totalNeeded > aggregate.stock) {
              // Hanya update jika status sebelumnya Ready atau Stok Kurang
              if (row.status_message === 'Ready' || row.status_message === 'Stok Kurang') {
                row.status_message = `Stok Total Kurang`;
                // Tambahkan info tooltip: Total X, Stok Y
                (row as any).stockTooltip = `Total: ${aggregate.totalNeeded}, Stok: ${aggregate.stock}`;
                row.is_stock_valid = false;
              }
            }
          }
        });

        // Simpan loadedRows untuk digunakan nanti - UPPERCASE untuk case-insensitive matching
        const csvResiSet = new Set(loadedRows.map(r => (r.resi || '').trim().toUpperCase()));
        
        // === TAMBAHAN: Ambil resi dari Stage 1 yang belum ada di CSV ===
        const stage1Resi = await getAllPendingStage1Resi(selectedStore);
        
        // Filter resi Stage 1 yang belum ada di CSV (case-insensitive)
        const stage1OnlyRows: Stage3Row[] = [];
        for (const s1 of stage1Resi) {
          const s1ResiUpper = (s1.resi || '').trim().toUpperCase();
          if (!csvResiSet.has(s1ResiUpper)) {
            // Tentukan ecommerce dengan negara
            let ecommerce = s1.ecommerce || '-';
            if (ecommerce === 'EKSPOR' && s1.negara_ekspor) {
              ecommerce = `EKSPOR - ${s1.negara_ekspor}`;
            }
            
            // Tentukan status
            let statusMsg = s1.stage2_verified ? 'Butuh Input' : 'Pending S2';
            
            stage1OnlyRows.push({
              id: `s1-${s1.id}`,
              tanggal: s1.tanggal ? s1.tanggal.split('T')[0] : new Date().toISOString().split('T')[0],
              resi: s1.resi,
              ecommerce: ecommerce,
              sub_toko: s1.sub_toko || (selectedStore === 'bjw' ? 'BJW' : 'MJM'),
              part_number: '',
              nama_barang_csv: '',
              nama_barang_base: '',
              brand: '',
              application: '',
              stock_saat_ini: 0,
              qty_keluar: 0,
              harga_total: 0,
              harga_satuan: 0,
              mata_uang: ecommerce.startsWith('EKSPOR') ? (ecommerce.split(' - ')[1] || 'PHP') : 'IDR',
              customer: s1.customer || '',
              no_pesanan: s1.no_pesanan || '',
              is_db_verified: s1.stage2_verified,
              is_stock_valid: true,
              status_message: statusMsg,
              force_override_double: false
            });
            csvResiSet.add(s1ResiUpper);
          }
        }
        
        // Gabungkan semua rows (dari CSV + Stage 1 only)
        const allRows = [...loadedRows, ...stage1OnlyRows];
        
        // Gunakan resi (uppercase) sebagai key utama, bukan resi + part_number
        // Jika ada multiple item dengan resi sama tapi part_number berbeda, 
        // gunakan resi + part_number + nama_barang_csv sebagai key
        setRows(allRows);
      } else {
        // Jika tidak ada CSV items, tetap load dari Stage 1
        const stage1Resi = await getAllPendingStage1Resi(selectedStore);
        
        const stage1Rows: Stage3Row[] = stage1Resi.map(s1 => {
          let ecommerce = s1.ecommerce || '-';
          if (ecommerce === 'EKSPOR' && s1.negara_ekspor) {
            ecommerce = `EKSPOR - ${s1.negara_ekspor}`;
          }
          
          let statusMsg = s1.stage2_verified ? 'Butuh Input' : 'Pending S2';
          
          return {
            id: `s1-${s1.id}`,
            tanggal: s1.tanggal ? s1.tanggal.split('T')[0] : new Date().toISOString().split('T')[0],
            resi: s1.resi,
            ecommerce: ecommerce,
            sub_toko: s1.sub_toko || (selectedStore === 'bjw' ? 'BJW' : 'MJM'),
            part_number: '',
            nama_barang_csv: '',
            nama_barang_base: '',
            brand: '',
            application: '',
            stock_saat_ini: 0,
            qty_keluar: 0,
            harga_total: 0,
            harga_satuan: 0,
            mata_uang: ecommerce.startsWith('EKSPOR') ? (ecommerce.split(' - ')[1] || 'PHP') : 'IDR',
            customer: s1.customer || '',
            no_pesanan: s1.no_pesanan || '',
            is_db_verified: s1.stage2_verified,
            is_stock_valid: true,
            status_message: statusMsg,
            force_override_double: false
          };
        });
        
        if (stage1Rows.length > 0) {
          setRows(stage1Rows);
        }
      }
      
    } catch (e) {
      console.error("Error loading saved items:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRow = useCallback(async (row: Stage3Row) => {
    if (isMountedRef.current) {
      setSavingStatus('saving');
    }
    try {
      if (row.id.startsWith('db-')) {
         const dbId = row.id.replace('db-', '');
         const payload = {
            customer: row.customer,
            part_number: row.part_number,
            nama_produk: row.nama_barang_csv,
            jumlah: row.qty_keluar,
            total_harga_produk: row.harga_total,
            // Update juga Ecomm/Toko jika berubah
            ecommerce: row.ecommerce,
            toko: row.sub_toko
         };
         await updateResiItem(selectedStore, dbId, payload);
      } 
      else {
         const payload = {
            resi: row.resi,
            ecommerce: row.ecommerce,
            toko: row.sub_toko,
            customer: row.customer,
            part_number: row.part_number,
            nama_produk: row.nama_barang_csv,
            jumlah: row.qty_keluar,
            total_harga_produk: row.harga_total,
            status: 'pending',
            order_id: row.no_pesanan,
            created_at: new Date().toISOString()
         };
         
         const newId = await insertResiItem(selectedStore, payload);
         
         if (newId && isMountedRef.current) {
           setRows(prev => prev.map(r => r.id === row.id ? { ...r, id: `db-${newId}` } : r));
         }
      }
      if (isMountedRef.current) {
        setSavingStatus('saved');
        setTimeout(() => {
          if (isMountedRef.current) {
            setSavingStatus('idle');
          }
        }, 2000);
      }

      // Clear pending state for this row after successful save.
      const existingTimer = autoSaveTimers.current.get(row.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
        autoSaveTimers.current.delete(row.id);
      }
      pendingUpdates.current.delete(row.id);
    } catch (e) {
      console.error("Auto-save failed:", e);
      if (isMountedRef.current) {
        setSavingStatus('idle');
      }
    }
  }, [selectedStore]);

  const flushPendingUpdates = useCallback(async (reason: string = 'manual') => {
    if (isFlushingPendingRef.current) return;
    if (pendingUpdates.current.size === 0) return;

    isFlushingPendingRef.current = true;
    try {
      // Stop all debounce timers, then flush latest pending snapshots.
      autoSaveTimers.current.forEach(timer => clearTimeout(timer));
      autoSaveTimers.current.clear();

      const pendingRows = Array.from(pendingUpdates.current.values());
      const uniqueRows = Array.from(
        new Map(pendingRows.map(row => [row.id, row])).values()
      );

      for (const row of uniqueRows) {
        await handleSaveRow(row);
      }

      pendingUpdates.current.clear();
      console.log(`[AutoSave] Flushed ${uniqueRows.length} pending row(s) (${reason})`);
    } catch (error) {
      console.error(`[AutoSave] Failed to flush pending updates (${reason}):`, error);
    } finally {
      isFlushingPendingRef.current = false;
    }
  }, [handleSaveRow]);

  // Flush pending edits when page/tab state changes or component unmounts.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushPendingUpdates('visibilitychange');
      }
    };

    const handlePageHide = () => {
      void flushPendingUpdates('pagehide');
    };

    const handleBeforeUnload = () => {
      if (pendingUpdates.current.size > 0) {
        void flushPendingUpdates('beforeunload');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void flushPendingUpdates('unmount');
    };
  }, [flushPendingUpdates]);

  // SAVE ALL ROWS - Force save semua baris sekaligus ke database dengan batch update
  const handleSaveAllRows = async () => {
    if (rows.length === 0) return;
    
    setSavingStatus('saving');
    let savedCount = 0;
    let errorCount = 0;
    
    try {
      // Clear any pending auto-save timers first
      autoSaveTimers.current.forEach(timer => clearTimeout(timer));
      autoSaveTimers.current.clear();
      
      // Pisahkan rows yang perlu update vs insert
      const rowsToUpdate: Array<{ id: string; payload: any }> = [];
      const rowsToInsert: typeof rows = [];
      
      for (const row of rows) {
        if (row.id.startsWith('db-')) {
          // Row sudah ada di DB, siapkan untuk batch update
          const dbId = row.id.replace('db-', '');
          rowsToUpdate.push({
            id: dbId,
            payload: {
              customer: row.customer,
              part_number: row.part_number,
              nama_produk: row.nama_barang_csv,
              jumlah: row.qty_keluar,
              total_harga_produk: row.harga_total,
              ecommerce: row.ecommerce,
              toko: row.sub_toko
            }
          });
        } else {
          // Row baru, perlu insert
          rowsToInsert.push(row);
        }
      }
      
      // Batch update semua rows yang sudah ada di DB (parallel)
      if (rowsToUpdate.length > 0) {
        console.log(`[SaveAll] Batch updating ${rowsToUpdate.length} rows...`);
        const batchResult = await batchUpdateResiItems(selectedStore, rowsToUpdate);
        savedCount += batchResult.updatedCount;
        errorCount += batchResult.errorCount;
        console.log(`[SaveAll] Batch update done: ${batchResult.updatedCount} success, ${batchResult.errorCount} errors`);
      }
      
      // Insert rows baru satu per satu (karena perlu mendapat ID baru)
      for (const row of rowsToInsert) {
        try {
          const payload = {
            resi: row.resi,
            ecommerce: row.ecommerce,
            toko: row.sub_toko,
            customer: row.customer,
            part_number: row.part_number,
            nama_produk: row.nama_barang_csv,
            jumlah: row.qty_keluar,
            total_harga_produk: row.harga_total,
            status: 'pending',
            order_id: row.no_pesanan,
            created_at: new Date().toISOString()
          };
          
          const newId = await insertResiItem(selectedStore, payload);
          
          if (newId) {
            setRows(prev => prev.map(r => r.id === row.id ? { ...r, id: `db-${newId}` } : r));
            savedCount++;
          }
        } catch (e) {
          console.error("Insert row failed:", row.id, e);
          errorCount++;
        }
      }
      
      // Clear pending updates
      pendingUpdates.current.clear();
      
      console.log(`[SaveAll] Total: ${savedCount} saved, ${errorCount} errors`);
      setSavingStatus('saved');
      setTimeout(() => setSavingStatus('idle'), 3000);
    } catch (e) {
      console.error("Save all failed:", e);
      setSavingStatus('idle');
    }
  };

  // SAVE KILAT ONLY - Simpan hanya resi dengan ecommerce KILAT
  const handleSaveKilatRows = async () => {
    const kilatRows = rows.filter(r => r.ecommerce?.toUpperCase() === 'KILAT');
    
    if (kilatRows.length === 0) {
      alert('Tidak ada resi KILAT untuk disimpan');
      return;
    }
    
    setSavingStatus('saving');
    let savedCount = 0;
    let errorCount = 0;
    
    try {
      // Clear any pending auto-save timers first
      autoSaveTimers.current.forEach(timer => clearTimeout(timer));
      autoSaveTimers.current.clear();
      
      // Pisahkan rows yang perlu update vs insert
      const rowsToUpdate: Array<{ id: string; payload: any }> = [];
      const rowsToInsert: typeof rows = [];
      
      for (const row of kilatRows) {
        if (row.id.startsWith('db-')) {
          // Row sudah ada di DB, siapkan untuk batch update
          const dbId = row.id.replace('db-', '');
          rowsToUpdate.push({
            id: dbId,
            payload: {
              customer: row.customer,
              part_number: row.part_number,
              nama_produk: row.nama_barang_csv,
              jumlah: row.qty_keluar,
              total_harga_produk: row.harga_total,
              ecommerce: row.ecommerce,
              toko: row.sub_toko
            }
          });
        } else {
          // Row baru, perlu insert
          rowsToInsert.push(row);
        }
      }
      
      // Batch update semua rows yang sudah ada di DB (parallel)
      if (rowsToUpdate.length > 0) {
        console.log(`[SaveKilat] Batch updating ${rowsToUpdate.length} rows...`);
        const batchResult = await batchUpdateResiItems(selectedStore, rowsToUpdate);
        savedCount += batchResult.updatedCount;
        errorCount += batchResult.errorCount;
        console.log(`[SaveKilat] Batch update done: ${batchResult.updatedCount} success, ${batchResult.errorCount} errors`);
      }
      
      // Insert rows baru satu per satu (karena perlu mendapat ID baru)
      for (const row of rowsToInsert) {
        try {
          const payload = {
            resi: row.resi,
            ecommerce: row.ecommerce,
            toko: row.sub_toko,
            customer: row.customer,
            part_number: row.part_number,
            nama_produk: row.nama_barang_csv,
            jumlah: row.qty_keluar,
            total_harga_produk: row.harga_total,
            status: 'pending',
            order_id: row.no_pesanan,
            created_at: new Date().toISOString()
          };
          
          const newId = await insertResiItem(selectedStore, payload);
          
          if (newId) {
            setRows(prev => prev.map(r => r.id === row.id ? { ...r, id: `db-${newId}` } : r));
            savedCount++;
          }
        } catch (e) {
          console.error("Insert row failed:", row.id, e);
          errorCount++;
        }
      }
      
      console.log(`[SaveKilat] Total: ${savedCount} saved, ${errorCount} errors`);
      setSavingStatus('saved');
      setTimeout(() => setSavingStatus('idle'), 3000);
    } catch (e) {
      console.error("Save kilat failed:", e);
      setSavingStatus('idle');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    
    // Deteksi apakah file adalah XLSX berdasarkan ekstensi
    const fileName = file.name.toLowerCase();
    const isXLSXFile = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    
    // Buka modal progress
    setIsProcessingUpload(true);
    setProcessLogs([]);
    setShowSkippedModal(true);
    setSkippedItems([]);
    setUpdatedItems([]);
    setUploadSummary({ imported: 0, updated: 0, skipped: 0 });
    
    // Helper untuk menambah log
    const addLog = (type: 'info' | 'success' | 'skip' | 'error', resi: string, message: string) => {
      setProcessLogs(prev => [...prev, { type, resi, message }]);
    };
    
    try {
      addLog('info', 'SISTEM', 'Membaca file CSV/Excel...');
      
      const data = await file.arrayBuffer();
      // [FIX] Gunakan cellText: false agar cell numeric tidak dikonversi ke number
      // Ini membantu mempertahankan format asli seperti leading zeros
      const workbook = XLSX.read(data, { type: 'array', cellDates: false, cellNF: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // [FIX] Sebelum konversi ke CSV, format ulang cell yang berupa number dengan leading zeros
      // atau harga dengan format Indonesia (450.000)
      // Kita perlu iterasi cell dan konversi ke format text yang benar
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddress];
          if (cell) {
            // Jika cell punya format text asli (w property), gunakan itu
            // Jika tidak, gunakan value (v) sebagai string
            if (cell.w !== undefined && cell.w !== null) {
              // Sudah ada formatted text, biarkan
            } else if (cell.v !== undefined && cell.v !== null) {
              // Force ke string untuk mempertahankan format
              cell.t = 's'; // set type ke string
              cell.v = String(cell.v);
            }
          }
        }
      }
      
      // Konversi ke CSV - sekarang semua cell sudah string
      const csvText = XLSX.utils.sheet_to_csv(worksheet, { rawNumbers: false, blankrows: false });

      const platform = detectCSVPlatform(csvText);
      const platformLabel = platform === 'shopee' ? 'Shopee ID' : 
                           platform === 'shopee-intl' ? 'Shopee International/My Laris' :
                           platform === 'tiktok' ? 'TikTok' : 'Unknown';
      addLog('info', 'SISTEM', `Format terdeteksi: ${platformLabel} | Sumber: ${isXLSXFile ? 'XLSX' : 'CSV'}`);
      
      let parsedItems: any[] = [];
      
      // Parsing berdasarkan deteksi format file (Shopee/Shopee International/TikTok)
      // Namun attribute ecommerce/toko akan kita override dengan pilihan user
      // Untuk TikTok: CSV mulai dari baris 2, XLSX mulai dari baris 3
      if (platform === 'shopee') parsedItems = parseShopeeCSV(csvText);
      else if (platform === 'shopee-intl') parsedItems = parseShopeeIntlCSV(csvText);
      else if (platform === 'tiktok') parsedItems = parseTikTokCSV(csvText, isXLSXFile);
      else { 
        // Fallback coba parse Shopee standar jika tidak terdeteksi
        parsedItems = parseShopeeCSV(csvText);
        if(parsedItems.length === 0) {
             // Try Shopee International as second fallback
             parsedItems = parseShopeeIntlCSV(csvText);
        }
        if(parsedItems.length === 0) {
             setIsProcessingUpload(false);
             setShowSkippedModal(false);
             alert('Format File tidak dikenali! Pastikan file memiliki header seperti "No. Resi", "No. Pesanan", "Order ID", atau "Tracking Number".');
             setLoading(false); 
             return; 
        }
      }

      if (parsedItems.length === 0) {
        addLog('error', 'SISTEM', 'Tidak ada data valid dalam file');
        setIsProcessingUpload(false);
        setShowSkippedModal(false);
        alert('Tidak ada data valid (Mungkin status Batal/Belum Bayar?).');
        setLoading(false);
        return;
      }

      addLog('info', 'SISTEM', `Ditemukan ${parsedItems.length} item, memproses satu per satu...`);

      // === STEP 0: FILTER STATUS BATAL/CANCEL/UNPAID ===
      // Safety net: filter ulang item dengan status batal/cancel/unpaid
      // KECUALI "Pembatalan Diajukan" - ini TIDAK di-skip karena masih bisa diproses
      const allSkippedItems: SkippedItem[] = [];
      
      const afterStatusFilter = parsedItems.filter(item => {
        const orderStatus = String(item.order_status || '').toLowerCase();
        
        // "Pembatalan Diajukan" / "Cancellation Requested" TIDAK di-skip
        const isPembatalanDiajukan = orderStatus.includes('pembatalan diajukan') || 
                                      orderStatus.includes('cancellation requested') ||
                                      orderStatus.includes('pengajuan pembatalan');
        
        // Hanya skip jika BATAL TOTAL (sudah dibatalkan), bukan sekedar "diajukan"
        const isCancelled = (orderStatus.includes('batal') || orderStatus.includes('cancel')) && !isPembatalanDiajukan;
        const isUnpaid = orderStatus.includes('belum dibayar') || 
                         orderStatus.includes('unpaid') || 
                         orderStatus.includes('menunggu bayar') ||
                         orderStatus.includes('menunggu pembayaran') ||
                         orderStatus.includes('awaiting payment');
        
        if (isCancelled || isUnpaid) {
          const resiDisplay = item.resi || item.order_id || '-';
          addLog('skip', resiDisplay, `Dilewati - ${item.order_status}`);
          allSkippedItems.push({
            resi: item.resi,
            order_id: item.order_id,
            customer: item.customer,
            product_name: item.product_name,
            reason: `Status pesanan: ${item.order_status}`
          });
          return false;
        }
        return true;
      });
      
      console.log(`[handleFileUpload] After status filter: ${afterStatusFilter.length} valid, ${allSkippedItems.length} skipped (cancelled/unpaid)`);
      
      if (afterStatusFilter.length === 0) {
        addLog('info', 'SISTEM', 'Semua item dilewati karena status batal/belum bayar');
        setSkippedItems(allSkippedItems);
        setUploadSummary({ imported: 0, updated: 0, skipped: allSkippedItems.length });
        setIsProcessingUpload(false);
        setLoading(false);
        return;
      }

      addLog('info', 'SISTEM', `Mengecek ${afterStatusFilter.length} item di database...`);

      // === STEP 1: CEK BARANG_KELUAR - Filter item yang sudah terjual ===
      const allResiFromCSV = afterStatusFilter.map(i => i.resi).filter(Boolean);
      const allOrderIdFromCSV = afterStatusFilter.map(i => i.order_id).filter(Boolean);
      const allToCheckBarangKeluar = [...new Set([...allResiFromCSV, ...allOrderIdFromCSV])];
      
      const existingInBarangKeluar = await checkExistingInBarangKeluar(allToCheckBarangKeluar, selectedStore);
      
      // Filter: buang item yang sudah ada di barang_keluar
      const afterBarangKeluarFilter = afterStatusFilter.filter(item => {
        const resiUpper = String(item.resi || '').trim().toUpperCase();
        const orderIdUpper = String(item.order_id || '').trim().toUpperCase();
        
        if (existingInBarangKeluar.has(resiUpper) || existingInBarangKeluar.has(orderIdUpper)) {
          const resiDisplay = item.resi || item.order_id || '-';
          addLog('skip', resiDisplay, 'Dilewati - Sudah ada di Barang Keluar');
          allSkippedItems.push({
            resi: item.resi,
            order_id: item.order_id,
            customer: item.customer,
            product_name: item.product_name,
            reason: 'Sudah ada di Barang Keluar (sudah terjual)'
          });
          return false;
        }
        return true;
      });
      
      if (afterBarangKeluarFilter.length === 0) {
        // Semua item di-skip, tampilkan modal
        addLog('info', 'SISTEM', 'Semua item dilewati karena sudah ada di Barang Keluar');
        setSkippedItems(allSkippedItems);
        setUploadSummary({ imported: 0, updated: 0, skipped: allSkippedItems.length });
        setIsProcessingUpload(false);
        setLoading(false);
        return;
      }

      addLog('info', 'SISTEM', `Mengecek data Stage 1 untuk ${afterBarangKeluarFilter.length} item...`);

      // === STEP 2: Ambil info dari Stage 1 untuk ecommerce ===
      const resiList = afterBarangKeluarFilter.map(i => i.resi);
      const orderIdList = afterBarangKeluarFilter.map(i => i.order_id).filter(Boolean);
      const allResiOrOrders = [...new Set([...resiList, ...orderIdList])];
      
      // Cek Stage 1 untuk mendapatkan ecommerce yang sudah ada (termasuk negara ekspor)
      const dbStatus = await checkResiOrOrderStatus(allResiOrOrders, selectedStore);
      
      // Buat map dari resi/order_id ke data Stage 1 (termasuk negara_ekspor) - UPPERCASE
      const s1MapByResi = new Map<string, any>();
      const s1MapByOrder = new Map<string, any>();
      dbStatus.forEach((d: any) => {
        if (d.resi) s1MapByResi.set(String(d.resi).trim().toUpperCase(), d);
        if (d.no_pesanan) s1MapByOrder.set(String(d.no_pesanan).trim().toUpperCase(), d);
      });
      
      // === STEP 3: Proses item yang lolos filter barang_keluar ===
      const correctedItems = afterBarangKeluarFilter.map(item => {
        // Cek apakah resi ini sudah ada di Stage 1 - UPPERCASE matching
        const resiUpper = (item.resi || '').trim().toUpperCase();
        const orderIdUpper = (item.order_id || '').trim().toUpperCase();
        let s1Data = s1MapByResi.get(resiUpper) || s1MapByOrder.get(orderIdUpper);
        
        // Tentukan negara untuk konversi harga (khusus Ekspor)
        let negaraForConversion = '';
        
        // SIMPAN ecommerce dari parser (bisa berisi label khusus seperti TIKTOK INSTAN)
        const ecommerceFromParser = item.ecommerce || '';
        
        // Cek apakah ecommerce dari parser memiliki label khusus (INSTAN/SAMEDAY)
        // Jika ya, pertahankan label tersebut
        const hasSpecialLabel = ecommerceFromParser.includes('INSTAN') || 
                                ecommerceFromParser.includes('SAMEDAY') ||
                                ecommerceFromParser.includes('KILAT');
        
        if (overrideStage1) {
          // Override: always use Upload Config settings, ignore Stage 1 data
          if (uploadEcommerce === 'EKSPOR') {
            item.ecommerce = `EKSPOR - ${uploadNegara}`;
            negaraForConversion = uploadNegara;
          } else {
            item.ecommerce = uploadEcommerce;
          }
          item.sub_toko = uploadSubToko;
        } else {
          // Keep existing logic for Stage 1 lookup
          if (s1Data) {
            // Ada di Stage 1, gunakan ecommerce dari sana
            let ecomFromS1 = s1Data.ecommerce || '';
            
            // Jika hanya "EKSPOR" tapi ada negara_ekspor, gabungkan
            if (ecomFromS1 === 'EKSPOR' && s1Data.negara_ekspor) {
              item.ecommerce = `EKSPOR - ${s1Data.negara_ekspor}`;
              negaraForConversion = s1Data.negara_ekspor;
            } else if (ecomFromS1.startsWith('EKSPOR')) {
              // Sudah format lengkap atau tidak ada negara
              item.ecommerce = ecomFromS1;
              // Extract negara dari ecommerce (misal "EKSPOR - PH" -> "PH")
              const parts = ecomFromS1.split(' - ');
              if (parts.length > 1) {
                negaraForConversion = parts[1].trim();
              }
            } else {
              // Bukan ekspor, gunakan dari Stage 1
              item.ecommerce = ecomFromS1 || uploadEcommerce;
            }
          } else {
            // Tidak ada di Stage 1
            // PENTING: Jika ecommerce dari parser punya label khusus, PERTAHANKAN
            if (hasSpecialLabel) {
              // Pertahankan label khusus dari parser (misal: TIKTOK INSTAN, SHOPEE SAMEDAY, dll)
              item.ecommerce = ecommerceFromParser;
            } else if (uploadEcommerce === 'EKSPOR') {
              item.ecommerce = `EKSPOR - ${uploadNegara}`;
              negaraForConversion = uploadNegara;
            } else {
              item.ecommerce = uploadEcommerce;
            }
          }
          item.sub_toko = uploadSubToko;
        }
        
        // === SIMPAN MATA UANG UNTUK EKSPOR (TANPA KONVERSI) ===
        // Jika ini adalah item Ekspor, simpan kode negara/mata uang tapi JANGAN konversi harga
        if (negaraForConversion && item.ecommerce.startsWith('EKSPOR')) {
          // Gunakan negara dari detected_country jika ada, atau dari setting
          const countryForRate = (item as any).detected_country || negaraForConversion;
          
          console.log(`[Ekspor] Keeping original price: ${item.total_price} (Currency: ${countryForRate})`);
          
          // Simpan mata uang untuk ditampilkan di UI
          (item as any).mata_uang = countryForRate;
        }

        return item;
      });

      if (correctedItems.length > 0) {
          addLog('info', 'SISTEM', `Menyimpan ${correctedItems.length} item ke database...${overrideStage1 ? ' (Mode Override aktif)' : ''}`);
          
          // Log setiap item yang akan disimpan
          for (const item of correctedItems) {
            const resiDisplay = item.resi || item.order_id || '-';
            addLog('success', resiDisplay, `Memproses - ${item.customer || 'Customer'}`);
          }
          
          const result = await saveCSVToResiItems(correctedItems, selectedStore, overrideStage1);
          
          // Tambahkan skipped items dari saveCSVToResiItems (belum scan Stage 1, sudah Ready, dll)
          if (result.skippedItems && result.skippedItems.length > 0) {
            for (const sk of result.skippedItems) {
              const resiDisplay = sk.resi || sk.order_id || '-';
              addLog('skip', resiDisplay, sk.reason);
            }
            allSkippedItems.push(...result.skippedItems);
          }
          
          // Log sukses final
          addLog('info', 'SISTEM', `✓ Selesai: ${result.count} baru, ${result.updatedCount} update, ${allSkippedItems.length} skip`);
          
          // Set data untuk modal
          setUploadSummary({
            imported: result.count,
            updated: result.updatedCount,
            skipped: allSkippedItems.length
          });
          setSkippedItems(allSkippedItems);
          setUpdatedItems(result.updatedItems || []);
          
          // Selesai processing
          setIsProcessingUpload(false);
          
      } else {
        // Semua item sudah di-filter
        setUploadSummary({ imported: 0, updated: 0, skipped: allSkippedItems.length });
        setSkippedItems(allSkippedItems);
        setUpdatedItems([]);
        setIsProcessingUpload(false);
      }

      await loadSavedDataFromDB();
      
    } catch (err: any) { 
      console.error(err);
      setIsProcessingUpload(false);
      setShowSkippedModal(false);
      alert(`Error Import: ${err.message}`); 
    } finally { 
      setLoading(false); 
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, colKey: string, rowId?: string) => {
    // Navigasi panah seperti Excel/Google Sheets
    const colOrder = ['tanggal', 'customer', 'part_number', 'qty_keluar', 'harga_total', 'harga_satuan'];
    const currentColIdx = colOrder.indexOf(colKey);
    
    // Handle Part Number dropdown navigation
    if (colKey === 'part_number' && partNumberDropdown.isOpen && partNumberDropdown.rowId === rowId) {
      // Gunakan rowId untuk mencari row yang benar, bukan rowIndex
      const currentRow = rowId ? rows.find(r => r.id === rowId) : null;
      const searchValue = currentRow?.part_number || '';
      const filteredParts = partOptions.filter(p => 
        p.part_number.toLowerCase().includes(searchValue.toLowerCase())
      ).slice(0, 50);
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setPartNumberDropdown(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, filteredParts.length - 1)
        }));
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (partNumberDropdown.selectedIndex > 0) {
          setPartNumberDropdown(prev => ({
            ...prev,
            selectedIndex: prev.selectedIndex - 1
          }));
          return;
        } else {
          // Close dropdown and allow normal navigation
          setPartNumberDropdown(prev => ({ ...prev, isOpen: false, selectedIndex: -1 }));
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (partNumberDropdown.selectedIndex >= 0 && filteredParts[partNumberDropdown.selectedIndex]) {
          const selectedPart = filteredParts[partNumberDropdown.selectedIndex].part_number;
          if (rowId) {
            // Tandai selection supaya onBlur tidak meng-overwrite dengan nilai ketikan lama
            partNumberSelectedRef.current = { rowId, value: selectedPart };
            updateRow(rowId, 'part_number', selectedPart);
            handlePartNumberBlur(rowId, selectedPart);
          }
          setPartNumberDropdown(prev => ({ ...prev, isOpen: false, selectedIndex: -1 }));
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPartNumberDropdown(prev => ({ ...prev, isOpen: false, selectedIndex: -1 }));
        return;
      } else if (e.key === 'Tab') {
        setPartNumberDropdown(prev => ({ ...prev, isOpen: false, selectedIndex: -1 }));
      }
    }

    if (e.key === 'ArrowDown' || (e.key === 'Enter' && colKey !== 'part_number')) {
      e.preventDefault();
      (e.target as HTMLInputElement).blur(); 
      const nextInput = document.getElementById(`input-${rowIndex + 1}-${colKey}`);
      if (nextInput) {
        nextInput.focus();
        setFocusedCell({ rowIndex: rowIndex + 1, colKey });
      }
    } else if (e.key === 'Enter' && colKey === 'part_number' && !partNumberDropdown.isOpen) {
      e.preventDefault();
      (e.target as HTMLInputElement).blur(); 
      const nextInput = document.getElementById(`input-${rowIndex + 1}-${colKey}`);
      if (nextInput) {
        nextInput.focus();
        setFocusedCell({ rowIndex: rowIndex + 1, colKey });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      const prevInput = document.getElementById(`input-${rowIndex - 1}-${colKey}`);
      if (prevInput) {
        prevInput.focus();
        setFocusedCell({ rowIndex: rowIndex - 1, colKey });
      }
    } else if (e.key === 'ArrowRight') {
      const target = e.target as HTMLInputElement;
      if (target.type !== 'text' || target.selectionStart === target.value.length) {
         e.preventDefault();
         const nextCol = colOrder[currentColIdx + 1];
         if (nextCol) {
           const nextInput = document.getElementById(`input-${rowIndex}-${nextCol}`);
           if (nextInput) {
             nextInput.focus();
             setFocusedCell({ rowIndex, colKey: nextCol });
           }
         }
      }
    } else if (e.key === 'ArrowLeft') {
      const target = e.target as HTMLInputElement;
      if (target.type !== 'text' || target.selectionStart === 0) {
        e.preventDefault();
        const prevCol = colOrder[currentColIdx - 1];
        if (prevCol) {
          const prevInput = document.getElementById(`input-${rowIndex}-${prevCol}`);
          if (prevInput) {
            prevInput.focus();
            setFocusedCell({ rowIndex, colKey: prevCol });
          }
        }
      }
    }
  };
  
  // Helper function untuk mendapatkan style cell yang fokus (Google Sheets-like)
  const getCellFocusClass = (rowIndex: number, colKey: string): string => {
    if (focusedCell?.rowIndex === rowIndex && focusedCell?.colKey === colKey) {
      return 'ring-2 ring-blue-500 ring-inset bg-blue-900/40';
    }
    return '';
  };

  // Auto-save function with debounce
  const autoSaveRow = (updatedRow: Stage3Row) => {
    // Cancel previous timer for this row
    const existingTimer = autoSaveTimers.current.get(updatedRow.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Store the updated row in pending updates
    pendingUpdates.current.set(updatedRow.id, updatedRow);
    
    // Set new timer for faster autosave.
    const timer = setTimeout(async () => {
      const rowToSave = pendingUpdates.current.get(updatedRow.id);
      if (rowToSave) {
        await handleSaveRow(rowToSave);
        pendingUpdates.current.delete(updatedRow.id);
        autoSaveTimers.current.delete(updatedRow.id);
      }
    }, 600);
    
    autoSaveTimers.current.set(updatedRow.id, timer);
  };

  const updateRow = (id: string, field: keyof Stage3Row, value: any) => {
    const editableFields: Array<keyof Stage3Row> = [
      'part_number',
      'qty_keluar',
      'harga_total',
      'harga_satuan',
      'customer',
      'ecommerce',
      'sub_toko',
      'tanggal'
    ];

    const currentRows = rowsRef.current;
    const rowIdx = currentRows.findIndex(r => r.id === id);
    if (rowIdx === -1) return;

    const currentRow = currentRows[rowIdx];
    const updatedRow: Stage3Row = { ...currentRow, [field]: value };

    if (field === 'harga_total') {
      // Ketika harga_total diubah, hitung ulang harga_satuan
      updatedRow.harga_satuan = updatedRow.qty_keluar > 0 ? updatedRow.harga_total / updatedRow.qty_keluar : 0;
    } else if (field === 'harga_satuan') {
      // Ketika harga_satuan diubah, hitung ulang harga_total
      updatedRow.harga_total = updatedRow.harga_satuan * updatedRow.qty_keluar;
    } else if (field === 'qty_keluar') {
      // Ketika qty diubah, hitung ulang harga_satuan dari harga_total yang ada
      // Rumus: harga_satuan = harga_total / qty
      updatedRow.harga_satuan = updatedRow.qty_keluar > 0 ? updatedRow.harga_total / updatedRow.qty_keluar : 0;
    }

    // Update status_message secara real-time berdasarkan kondisi saat ini
    if (field === 'part_number' || field === 'qty_keluar') {
      // Recalculate status
      if (!updatedRow.is_db_verified) {
        // Masih belum verifikasi Stage 1/2
        if (updatedRow.status_message === 'Belum Scan S1' || updatedRow.status_message === 'Pending S2') {
          // Keep status as is
        }
      } else if (!updatedRow.part_number) {
        updatedRow.status_message = 'Butuh Input';
        updatedRow.is_db_verified = false;
      } else if (updatedRow.stock_saat_ini < updatedRow.qty_keluar && updatedRow.qty_keluar > 0) {
        updatedRow.status_message = 'Stok Kurang';
        updatedRow.is_stock_valid = false;
      } else if (!updatedRow.nama_barang_base && updatedRow.part_number) {
        updatedRow.status_message = 'Base Kosong';
        updatedRow.is_db_verified = false;
      } else {
        // Semua valid
        updatedRow.status_message = 'Ready';
        updatedRow.is_db_verified = true;
        updatedRow.is_stock_valid = true;
      }
    }

    const nextRows = [...currentRows];
    nextRows[rowIdx] = updatedRow;
    rowsRef.current = nextRows;
    setRows(nextRows);
    
    // Auto-save to database with debounce (only for editable fields)
    if (editableFields.includes(field)) {
      // INSTANT: Broadcast perubahan ke user lain (tanpa menunggu database)
      broadcastDataChange(id, field, value);
      
      // Broadcast editing status
      broadcastEditingCell(`${id}-${field}`);

      // Schedule debounced autosave immediately from the updated snapshot.
      autoSaveRow(updatedRow);

      // Clear editing status after save
      setTimeout(() => broadcastEditingCell(null), 500);
    }
  };

  const handleLoadPending = async () => {
    setLoading(true);
    const pendingData = await getPendingStage3List(selectedStore);
    if (pendingData.length === 0) {
      alert("Tidak ada resi pending dari Stage 2.");
      setLoading(false);
      return;
    }
    const dbRows: Stage3Row[] = pendingData.map(item => ({
      id: Math.random().toString(36).substr(2, 9), 
      tanggal: new Date(item.stage2_verified_at || item.created_at).toISOString().split('T')[0],
      resi: item.resi,
      ecommerce: item.ecommerce || '-',
      sub_toko: item.sub_toko || (selectedStore === 'bjw' ? 'BJW' : 'MJM'),
      part_number: '', 
      nama_barang_csv: 'Menunggu Input...',
      nama_barang_base: '',
      brand: '',
      application: '',
      stock_saat_ini: 0,
      qty_keluar: 0,
      harga_total: 0,
      harga_satuan: 0,
      mata_uang: (item.ecommerce || '').startsWith('EKSPOR') ? ((item.ecommerce || '').split(' - ')[1] || 'PHP') : 'IDR',
      no_pesanan: item.order_id || '',
      customer: item.customer || '',
      is_db_verified: true,
      is_stock_valid: true,
      status_message: 'Butuh Input',
      force_override_double: false  // FITUR 1
    }));
    const currentResis = new Set(rows.map(r => r.resi));
    const newUniqueRows = dbRows.filter(r => !currentResis.has(r.resi));
    setRows(prev => [...prev, ...newUniqueRows]);
    setLoading(false);
  };

  const handleSplit = (rowId: string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    const input = prompt("Split menjadi berapa item?", "2");
    if (!input) return;
    const splitCount = parseInt(input);
    if (isNaN(splitCount) || splitCount < 2) return;
    const newPriceTotal = row.harga_total / splitCount;
    
    const updatedParent: Stage3Row = {
      ...row,
      harga_total: newPriceTotal,
      harga_satuan: row.qty_keluar > 0 ? (newPriceTotal / row.qty_keluar) : 0,
      // Nama CSV tetap sama, tidak perlu label pecahan
      nama_barang_csv: row.nama_barang_csv
    };
    const newChildren: Stage3Row[] = [];
    for (let i = 2; i <= splitCount; i++) {
      newChildren.push({
        ...updatedParent,
        id: Math.random().toString(36).substr(2, 9), 
        part_number: '', 
        // Nama CSV tetap sama, tidak perlu label pecahan
        nama_barang_csv: row.nama_barang_csv,
        nama_barang_base: '',
        stock_saat_ini: 0,
        status_message: 'Isi Part Number',
        is_stock_valid: false,
        brand: '',
        application: '',
        force_override_double: false  // FITUR 1
      });
    }
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      const copy = [...prev];
      copy[idx] = updatedParent;
      copy.splice(idx + 1, 0, ...newChildren);
      return copy;
    });
  };

  // Handler untuk hapus row - juga hapus dari database dengan konfirmasi
  const handleDeleteRow = async (rowId: string, skipConfirm: boolean = false) => {
    // Cari row untuk mendapatkan info resi
    const rowToDelete = rows.find(r => r.id === rowId);
    const resiInfo = rowToDelete?.resi || 'item ini';
    
    // Konfirmasi sebelum hapus (skip jika dari bulk delete)
    if (!skipConfirm) {
      const confirmed = window.confirm(
        `Hapus resi "${resiInfo}"?\n\nItem akan dihapus permanen dan tidak akan muncul lagi di Pending DB (kecuali di-scan ulang).`
      );
      
      if (!confirmed) return;
    }
    
    // Hapus dari state lokal dulu untuk responsivitas
    setRows(prev => prev.filter(r => r.id !== rowId));
    
    let deleteResult = { success: false, message: '' };
    
    // Jika ID dimulai dengan "db-", hapus dari resi_items
    if (rowId.startsWith('db-')) {
      deleteResult = await deleteResiItemById(selectedStore, rowId);
    }
    // Jika ID dimulai dengan "s1-", hapus dari scan_resi (Stage 1)
    else if (rowId.startsWith('s1-')) {
      deleteResult = await deleteScanResiById(selectedStore, rowId);
    }
    // ID lainnya (temporary) - hanya hapus dari state lokal
    else {
      deleteResult = { success: true, message: 'Item dihapus dari daftar' };
    }
    
    // Tampilkan notifikasi hanya jika bukan bulk delete
    if (!skipConfirm) {
      if (deleteResult.success) {
        // Notifikasi sukses - tidak perlu alert untuk bulk
      } else {
        console.warn('Gagal hapus dari database:', deleteResult.message);
        // Reload data jika gagal
        await loadSavedDataFromDB();
      }
    }
    
    return deleteResult;
  };

  const handlePartNumberBlur = async (id: string, sku: string) => {
    let rowToSave: Stage3Row | undefined;
    
    // Jika part number kosong, set status ke "Butuh Input"
    if (!sku || sku.trim() === '') {
      setRows(prev => {
        const newRows = prev.map(r => {
          if (r.id !== id) return r;
          // Hanya set "Butuh Input" jika bukan status S1/S2 yang belum selesai
          const keepStatus = r.status_message === 'Belum Scan S1' || r.status_message === 'Pending S2';
          const updated = {
            ...r,
            brand: '',
            application: '',
            stock_saat_ini: 0,
            is_stock_valid: false,
            is_db_verified: false,
            nama_barang_base: '',
            status_message: keepStatus ? r.status_message : 'Butuh Input'
          };
          rowToSave = updated;
          return updated;
        });
        return newRows;
      });
      
      if (rowToSave) {
        // Pakai jalur autosave debounce supaya tidak double insert
        autoSaveRow(rowToSave);
      }
      return;
    }
    
    const info = await lookupPartNumberInfo(sku, selectedStore);
    
    setRows(prev => {
        const newRows = prev.map(r => {
            if (r.id !== id) return r;
            const stock = info?.quantity || 0;
            const qty = r.qty_keluar || 1;
            const stockValid = stock >= qty;
            
            // Tentukan status berdasarkan kondisi
            // PERBAIKAN: Selalu update status jika bukan "Belum Scan S1" atau "Pending S2"
            let newStatus = r.status_message;
            const isStage1or2Pending = r.status_message === 'Belum Scan S1' || r.status_message === 'Pending S2';
            
            if (!isStage1or2Pending) {
              // Part number sudah diinput, update status berdasarkan validasi
              if (!info?.name) {
                newStatus = 'Base Kosong'; // Part number tidak ditemukan di database
              } else if (!stockValid) {
                newStatus = 'Stok Kurang';
              } else {
                newStatus = 'Ready';
              }
            }
            
            const updated = {
                ...r,
                brand: info?.brand || '-',
                application: info?.application || '-',
                stock_saat_ini: stock,
                is_stock_valid: stockValid,
                is_db_verified: !isStage1or2Pending && info?.name ? true : r.is_db_verified,
                nama_barang_base: info?.name || '',
                status_message: newStatus
            };
            rowToSave = updated;
            return updated;
        });
        return newRows;
    });

    if (rowToSave) {
      // Hindari double insert: cukup jadwalkan autosave (akan merge dengan pending timer sebelumnya)
      autoSaveRow(rowToSave);
    }
  };

  const handleProcess = async () => {
    // FITUR 1: Item Double dengan force_override_double = true tetap bisa diproses
    const validRows = rows.filter(r => {
      // Kondisi normal: verified, stock valid, dan ada part_number
      const normalValid = r.is_db_verified && r.is_stock_valid && r.part_number;
      
      // ATAU: Status Double tapi user sudah force override
      const doubleOverridden = r.status_message === 'Double' && r.force_override_double && r.is_stock_valid && r.part_number;
      
      return normalValid || doubleOverridden;
    });
    if (validRows.length === 0) { alert("Tidak ada item siap proses (Pastikan Status Hijau atau centang Override untuk Double)."); return; }
    if (!confirm(`Proses ${validRows.length} item ke Barang Keluar?`)) return;
    
    // PROCESSING MODAL: Initialize
    const initialItems: ProcessingItem[] = validRows.map(r => ({
      id: r.id,
      resi: r.resi,
      part_number: r.part_number,
      nama_barang: r.nama_barang_csv || r.nama_barang_base || '-',
      qty: r.qty_keluar,
      customer: r.customer || '',
      status: 'pending' as const
    }));
    
    setProcessingItems(initialItems);
    setProcessingProgress(0);
    setProcessingCurrentItem('');
    setProcessingComplete(false);
    setProcessingSuccessCount(0);
    setProcessingErrorCount(0);
    setShowProcessingModal(true);
    setLoading(true);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process one by one untuk visual feedback
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const progress = Math.round(((i + 1) / validRows.length) * 100);
      
      // Update current item being processed
      setProcessingCurrentItem(`${row.part_number} - ${row.nama_barang_csv || row.nama_barang_base}`);
      setProcessingProgress(progress);
      
      // Update item status to processing
      setProcessingItems(prev => prev.map(item => 
        item.id === row.id ? { ...item, status: 'processing' } : item
      ));
      
      try {
        // Prepare single item untuk proses
        const itemToProcess = [{
          ...row,
          nama_pesanan: row.nama_barang_base || row.nama_barang_csv
        }];
        
        const result = await processBarangKeluarBatch(itemToProcess, selectedStore);
        
        if (result.success || result.processed > 0) {
          // Insert alias
          if (row.part_number && row.nama_barang_csv) {
            await insertProductAlias(row.part_number, row.nama_barang_csv);
          }
          
          // Delete from resi_items
          await deleteProcessedResiItems(selectedStore, [{ resi: row.resi, part_number: row.part_number }]);
          
          // Update item status to success
          setProcessingItems(prev => prev.map(item => 
            item.id === row.id ? { ...item, status: 'success' } : item
          ));
          successCount++;
          setProcessingSuccessCount(successCount);
        } else {
          // Update item status to error
          setProcessingItems(prev => prev.map(item => 
            item.id === row.id ? { ...item, status: 'error', errorMessage: result.errors.join(', ') } : item
          ));
          errorCount++;
          setProcessingErrorCount(errorCount);
        }
      } catch (err: any) {
        setProcessingItems(prev => prev.map(item => 
          item.id === row.id ? { ...item, status: 'error', errorMessage: err.message } : item
        ));
        errorCount++;
        setProcessingErrorCount(errorCount);
      }
      
      // Small delay untuk visual effect
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Delete dari scan_resi setelah semua item selesai
    const successfulResis = [...new Set(validRows.filter(r => 
      initialItems.find(i => i.id === r.id)?.status !== 'error'
    ).map(r => r.resi).filter(Boolean))];
    if (successfulResis.length > 0) {
      await deleteProcessedScanResi(selectedStore, successfulResis);
    }
    
    setProcessingComplete(true);
    setProcessingCurrentItem('');
    setLoading(false);
    
    // Refresh data
    setRows(prev => prev.filter(r => !validRows.find(v => v.id === r.id && 
      processingItems.find(p => p.id === v.id)?.status !== 'error'
    )));
    if (onRefresh) onRefresh();
  };

  const isKilatRow = (row: Stage3Row) => row.ecommerce?.toUpperCase().includes('KILAT');
  const kilatRowCount = rows.filter(isKilatRow).length;
  const regularRowCount = rows.length - kilatRowCount;
  const baseRows = activeResiTab === 'kilat'
    ? rows.filter(isKilatRow)
    : rows.filter(row => !isKilatRow(row));

  const displayedRows = baseRows.filter(row => {
    // Filter by status - 'all' menampilkan semua, selain itu filter berdasarkan status_message
    if (filterStatus !== 'all' && row.status_message !== filterStatus) return false;
    
    // Filter by ecommerce - mendukung filter "EKSPOR" untuk semua ekspor (EKSPOR - PH, EKSPOR - MY, dll)
    if (filterEcommerce) {
      if (filterEcommerce === 'EKSPOR') {
        // Jika filter "EKSPOR", tampilkan semua yang mengandung EKSPOR
        if (!row.ecommerce.startsWith('EKSPOR')) return false;
      } else {
        // Jika filter spesifik (misal "EKSPOR - PH"), harus exact match
        if (row.ecommerce !== filterEcommerce) return false;
      }
    }
    
    if (filterSubToko && row.sub_toko !== filterSubToko) return false;
    
    // Filter by part number - HANYA tampilkan yang part_number cocok
    if (filterPartNumber) {
      // Jika part_number kosong, jangan tampilkan
      if (!row.part_number) return false;
      // Jika tidak cocok, jangan tampilkan
      if (!row.part_number.toLowerCase().includes(filterPartNumber.toLowerCase())) return false;
    }
    
    // Filter by search query - mencari di resi, no_pesanan, customer, part_number
    if (resiSearchQuery) {
      const query = resiSearchQuery.toLowerCase();
      const matchResi = String(row.resi || '').toLowerCase().includes(query);
      const matchOrder = row.no_pesanan && String(row.no_pesanan).toLowerCase().includes(query);
      const matchCustomer = row.customer && String(row.customer).toLowerCase().includes(query);
      const matchPart = row.part_number && String(row.part_number).toLowerCase().includes(query);
      if (!matchResi && !matchOrder && !matchCustomer && !matchPart) return false;
    }
    
    return true;
  }).sort((a, b) => {
    // Apply sorting jika ada sortField dan direction bukan 'none'
    if (!sortField || sortDirection === 'none') return 0;
    
    let valA: any = a[sortField as keyof Stage3Row];
    let valB: any = b[sortField as keyof Stage3Row];
    
    // Handle null/undefined
    if (valA == null) valA = '';
    if (valB == null) valB = '';
    
    // Compare based on type
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    }
    
    // String comparison
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    if (sortDirection === 'asc') {
      return strA.localeCompare(strB);
    } else {
      return strB.localeCompare(strA);
    }
  });

  // GROUP BY RESI - mengelompokkan item berdasarkan resi yang sama
  const groupedByResi = displayedRows.reduce((acc, row) => {
    const resiKey = row.resi || 'NO_RESI';
    if (!acc[resiKey]) {
      acc[resiKey] = [];
    }
    acc[resiKey].push(row);
    return acc;
  }, {} as Record<string, Stage3Row[]>);
  
  // VISUAL ROWS - array rows sesuai urutan visual di tabel (setelah grouping)
  // Ini penting untuk navigasi keyboard yang benar
  const visualRows = Object.values(groupedByResi).flat();

  // Hitung status per grup resi
  const getGroupStatus = (items: Stage3Row[]) => {
    const allReady = items.every(r => r.status_message === 'Ready' || (r.status_message === 'Double' && r.force_override_double));
    const hasStokKurang = items.some(r => r.status_message === 'Stok Kurang' || r.status_message === 'Stok Total Kurang');
    const hasBelumScan = items.some(r => r.status_message === 'Belum Scan S1');
    const hasPendingS2 = items.some(r => r.status_message === 'Pending S2');
    if (allReady) return { status: 'Ready', color: 'bg-green-600' };
    if (hasBelumScan) return { status: 'Belum Scan S1', color: 'bg-red-800' };
    if (hasPendingS2) return { status: 'Pending S2', color: 'bg-yellow-600' };
    if (hasStokKurang) return { status: 'Stok Kurang', color: 'bg-red-600' };
    return { status: 'Butuh Input', color: 'bg-blue-600' };
  };

  // Toggle select resi group
  const toggleSelectResi = (resi: string) => {
    setSelectedResis(prev => {
      const newSet = new Set(prev);
      if (newSet.has(resi)) {
        newSet.delete(resi);
      } else {
        newSet.add(resi);
      }
      return newSet;
    });
  };

  // Select all visible resis
  const toggleSelectAll = () => {
    const allResis = Object.keys(groupedByResi);
    if (selectedResis.size === allResis.length) {
      setSelectedResis(new Set());
    } else {
      setSelectedResis(new Set(allResis));
    }
  };

  // Process only selected resis
  const handleProcessSelected = async () => {
    if (selectedResis.size === 0) {
      alert("Pilih minimal 1 resi untuk diproses!");
      return;
    }
    
    // VALIDASI: Cek apakah ada resi yang memiliki item dengan stok kurang
    // Semua item dalam satu resi harus ready sebelum bisa diproses
    const resiWithStockIssues: string[] = [];
    selectedResis.forEach(resi => {
      const itemsInResi = rows.filter(r => r.resi === resi);
      const hasStockIssue = itemsInResi.some(r => !r.is_stock_valid || r.stock_saat_ini < r.qty_keluar);
      if (hasStockIssue) {
        resiWithStockIssues.push(resi);
      }
    });
    
    if (resiWithStockIssues.length > 0) {
      const resiListText = resiWithStockIssues.slice(0, 5).join('\n• ');
      const moreText = resiWithStockIssues.length > 5 ? `\n... dan ${resiWithStockIssues.length - 5} resi lainnya` : '';
      alert(`Tidak bisa memproses! Resi berikut memiliki item dengan stok kurang/kosong:\n\n• ${resiListText}${moreText}\n\nSemua item dalam satu resi harus memiliki stok cukup sebelum bisa diproses.`);
      return;
    }
    
    // Filter rows yang resinya dipilih dan statusnya ready
    const selectedRows = rows.filter(r => {
      if (!selectedResis.has(r.resi)) return false;
      const normalValid = r.is_db_verified && r.is_stock_valid && r.part_number;
      const doubleOverridden = r.status_message === 'Double' && r.force_override_double && r.is_stock_valid && r.part_number;
      return normalValid || doubleOverridden;
    });
    
    if (selectedRows.length === 0) {
      alert("Tidak ada item siap proses dari resi yang dipilih. Pastikan status hijau (Ready).");
      return;
    }
    
    if (!confirm(`Proses ${selectedRows.length} item dari ${selectedResis.size} resi ke Barang Keluar?`)) return;
    
    // PROCESSING MODAL: Initialize
    const initialItems: ProcessingItem[] = selectedRows.map(r => ({
      id: r.id,
      resi: r.resi,
      part_number: r.part_number,
      nama_barang: r.nama_barang_csv || r.nama_barang_base || '-',
      qty: r.qty_keluar,
      customer: r.customer || '',
      status: 'pending' as const
    }));
    
    setProcessingItems(initialItems);
    setProcessingProgress(0);
    setProcessingCurrentItem('');
    setProcessingComplete(false);
    setProcessingSuccessCount(0);
    setProcessingErrorCount(0);
    setShowProcessingModal(true);
    setLoading(true);
    
    let successCount = 0;
    let errorCount = 0;
    const processedIds: string[] = [];
    
    // Process one by one untuk visual feedback
    for (let i = 0; i < selectedRows.length; i++) {
      const row = selectedRows[i];
      const progress = Math.round(((i + 1) / selectedRows.length) * 100);
      
      // Update current item being processed
      setProcessingCurrentItem(`${row.part_number} - ${row.nama_barang_csv || row.nama_barang_base}`);
      setProcessingProgress(progress);
      
      // Update item status to processing
      setProcessingItems(prev => prev.map(item => 
        item.id === row.id ? { ...item, status: 'processing' } : item
      ));
      
      try {
        // Prepare single item untuk proses
        const itemToProcess = [{
          ...row,
          nama_pesanan: row.nama_barang_base || row.nama_barang_csv
        }];
        
        const result = await processBarangKeluarBatch(itemToProcess, selectedStore);
        
        if (result.success || result.processed > 0) {
          // Insert alias
          if (row.part_number && row.nama_barang_csv) {
            await insertProductAlias(row.part_number, row.nama_barang_csv);
          }
          
          // Delete from resi_items
          await deleteProcessedResiItems(selectedStore, [{ resi: row.resi, part_number: row.part_number }]);
          
          // Update item status to success
          setProcessingItems(prev => prev.map(item => 
            item.id === row.id ? { ...item, status: 'success' } : item
          ));
          successCount++;
          processedIds.push(row.id);
          setProcessingSuccessCount(successCount);
        } else {
          // Update item status to error
          setProcessingItems(prev => prev.map(item => 
            item.id === row.id ? { ...item, status: 'error', errorMessage: result.errors.join(', ') } : item
          ));
          errorCount++;
          setProcessingErrorCount(errorCount);
        }
      } catch (err: any) {
        setProcessingItems(prev => prev.map(item => 
          item.id === row.id ? { ...item, status: 'error', errorMessage: err.message } : item
        ));
        errorCount++;
        setProcessingErrorCount(errorCount);
      }
      
      // Small delay untuk visual effect
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    setProcessingComplete(true);
    setProcessingCurrentItem('');
    setLoading(false);
    setSelectedResis(new Set()); // Clear selection
    
    // Refresh data
    await loadSavedDataFromDB();
    onRefresh?.();
  };

  // Handle delete all selected resis - Open modal
  const handleDeleteSelectedAll = () => {
    if (selectedResis.size === 0) {
      alert("Pilih minimal 1 resi untuk dihapus!");
      return;
    }
    
    // Prepare items for delete modal
    const itemsToDelete: DeleteItem[] = rows.filter(r => selectedResis.has(r.resi)).map(r => ({
      id: r.id,
      resi: r.resi,
      part_number: r.part_number,
      nama_barang: r.nama_barang_csv || r.nama_barang_base || '-',
      customer: r.customer || '',
      ecommerce: r.ecommerce,
      sub_toko: r.sub_toko
    }));
    
    setDeleteItems(itemsToDelete);
    setIsDeleting(false);
    setDeleteProgress(0);
    setDeleteComplete(false);
    setDeletedCount(0);
    setDeleteErrorCount(0);
    setShowDeleteModal(true);
  };

  // Execute delete after confirmation
  const executeDelete = async () => {
    setIsDeleting(true);
    setDeleteProgress(0);
    setDeletedCount(0);
    setDeleteErrorCount(0);
    
    const itemsToDelete = rows.filter(r => selectedResis.has(r.resi));
    let deleted = 0;
    let errors = 0;
    
    // Collect unique resis for Stage 1 deletion
    const uniqueResis = [...new Set(itemsToDelete.map(r => r.resi).filter(Boolean))];
    
    // Delete items one by one
    for (let i = 0; i < itemsToDelete.length; i++) {
      const row = itemsToDelete[i];
      const progress = Math.round(((i + 1) / itemsToDelete.length) * 100);
      setDeleteProgress(progress);
      
      try {
        await handleDeleteRow(row.id, true); // true = skip confirmation
        deleted++;
        setDeletedCount(deleted);
      } catch (err) {
        errors++;
        setDeleteErrorCount(errors);
      }
      
      // Small delay for visual effect
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Also delete from Stage 1 (scan_resi)
    if (uniqueResis.length > 0) {
      await deleteProcessedScanResi(selectedStore, uniqueResis);
    }
    
    setDeleteComplete(true);
    setSelectedResis(new Set());
    
    // Refresh data
    await loadSavedDataFromDB();
    onRefresh?.();
  };

  // Handle sort by column (3 states: asc -> desc -> none)
  const handleSort = (field: string) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> none
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection('none');
        setSortField('');
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper untuk menampilkan icon sort (↑ asc, ↓ desc, kosong jika none)
  const getSortIcon = (field: string) => {
    if (sortField !== field) return '';
    if (sortDirection === 'asc') return '↑';
    if (sortDirection === 'desc') return '↓';
    return '';
  };

  // Format number with thousand separator (47320 -> 47.320)
  const formatNumber = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  // Get row background color based on ecommerce and sub_toko
  const getRowBgColor = (row: Stage3Row, isSelected: boolean): string => {
    if (isSelected) return 'bg-blue-900/20';
    if (!row.is_db_verified) return 'bg-red-900/10';
    if (row.status_message === 'Stok Total Kurang') return 'bg-pink-900/20';
    if (!row.is_stock_valid) return 'bg-yellow-900/10';
    
    // Warna berdasarkan E-Commerce
    const ecomm = row.ecommerce?.toUpperCase() || '';
    const toko = row.sub_toko?.toUpperCase() || '';
    
    if (ecomm.includes('SHOPEE')) {
      if (toko === 'MJM') return 'bg-orange-900/15';
      if (toko === 'BJW') return 'bg-orange-800/20';
      if (toko === 'LARIS') return 'bg-orange-700/15';
      if (toko === 'PRAKTIS PART') return 'bg-orange-600/15';
      return 'bg-orange-900/10';
    }
    if (ecomm.includes('TIKTOK')) {
      if (toko === 'MJM') return 'bg-cyan-900/15';
      if (toko === 'BJW') return 'bg-cyan-800/20';
      if (toko === 'LARIS') return 'bg-cyan-700/15';
      if (toko === 'PRAKTIS PART') return 'bg-cyan-600/15';
      return 'bg-cyan-900/10';
    }
    if (ecomm.includes('EKSPOR')) {
      if (toko === 'MJM') return 'bg-purple-900/15';
      if (toko === 'BJW') return 'bg-purple-800/20';
      return 'bg-purple-900/10';
    }
    if (ecomm.includes('RESELLER')) {
      return 'bg-green-900/10';
    }
    if (ecomm.includes('KILAT')) {
      return 'bg-red-900/10';
    }
    return '';
  };

  // Komponen untuk menampilkan user yang sedang online
  const ActiveUsersIndicator = () => {
    if (activeUsers.length === 0) return null;
    
    return (
      <div className="fixed bottom-20 md:bottom-4 left-4 z-50 bg-gray-800 rounded-lg p-2 md:p-3 shadow-lg border border-gray-700">
        <div className="flex items-center gap-2 text-xs md:text-sm">
          <div className="flex -space-x-2">
            {activeUsers.slice(0, 5).map((u) => (
              <div
                key={u.userId}
                className="w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-white text-[10px] md:text-xs font-bold border-2 border-gray-800"
                style={{ backgroundColor: u.color }}
                title={u.userName}
              >
                {u.userName.charAt(0).toUpperCase()}
              </div>
            ))}
            {activeUsers.length > 5 && (
              <div className="w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-white text-[10px] md:text-xs font-bold border-2 border-gray-800 bg-gray-600">
                +{activeUsers.length - 5}
              </div>
            )}
          </div>
          <span className="text-green-400 whitespace-nowrap">
            {activeUsers.length} user online
          </span>
        </div>
      </div>
    );
  };

  // Wrapper untuk editable cell dengan indicator user lain sedang edit + flash effect
  const EditableCellWrapper = ({ 
    rowId, 
    field, 
    children 
  }: { 
    rowId: string; 
    field: string; 
    children: React.ReactNode;
  }) => {
    const editStatus = getCellEditStatus(rowId, field);
    const cellKey = `${rowId}-${field}`;
    const isRecentlyUpdated = recentlyUpdatedCells.has(cellKey);
    
    return (
      <div className="relative">
        {editStatus && (
          <div 
            className="absolute -top-4 left-0 z-20 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap shadow-lg animate-pulse"
            style={{ backgroundColor: editStatus.color }}
          >
            {editStatus.userName}
          </div>
        )}
        <div 
          className={`transition-all duration-300 ${editStatus ? 'pointer-events-none' : ''} ${isRecentlyUpdated ? 'animate-pulse' : ''}`}
          style={
            editStatus 
              ? { 
                  boxShadow: `0 0 0 2px ${editStatus.color}`,
                  borderRadius: '4px',
                  opacity: 0.6
                } 
              : isRecentlyUpdated 
                ? {
                    boxShadow: '0 0 0 2px #22c55e',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                  }
                : undefined
          }
        >
          {children}
        </div>
      </div>
    );
  };

  // Helper untuk mendapatkan style flash pada row
  const getRowFlashStyle = (rowId: string) => {
    // Cek apakah ada cell dalam row ini yang baru diupdate
    const hasUpdate = Array.from(recentlyUpdatedCells).some(key => key.startsWith(`${rowId}-`));
    if (hasUpdate) {
      return {
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        transition: 'background-color 0.3s ease',
      };
    }
    return {};
  };

  // Komponen untuk render cursor user lain
  const UserCursors = () => {
    return (
      <>
        {Object.entries(userCursors).map(([oderId, cursor]) => (
          <div
            key={oderId}
            className="pointer-events-none fixed z-[9999]"
            style={{
              left: cursor.x,
              top: cursor.y,
              transform: 'translate(-2px, -2px)',
              willChange: 'left, top',
            }}
          >
            {/* Cursor Arrow SVG */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
            >
              <path
                d="M5.5 3L19 12L12 13L9 20L5.5 3Z"
                fill={cursor.color}
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            {/* User Name Label */}
            <div
              className="absolute left-4 top-4 px-2 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap shadow-lg"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.userName}
            </div>
          </div>
        ))}
      </>
    );
  };

  return (
    <div ref={containerRef} className="bg-gray-900 text-white h-screen p-2 pb-20 md:pb-2 text-sm font-sans flex flex-col overflow-hidden relative">
      {/* Remote User Cursors */}
      <UserCursors />
      
      {/* Active Users Indicator */}
      <ActiveUsersIndicator />

      {/* HEADER TOOLBAR */}
      <div className="bg-gray-800 p-2 rounded border border-gray-700 mb-2 shadow-sm flex-shrink-0">
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap justify-between items-center gap-2">
                <div className="flex gap-2 items-center">
                    <h1 className="font-bold text-base md:text-lg flex items-center gap-1 md:gap-2 text-gray-100">
                        <RefreshCw size={16} className="text-green-400"/> STAGE 3
                    </h1>
                    
                    {/* SAVING INDICATOR */}
                    <div className="w-16 md:w-20 flex items-center">
                        {savingStatus === 'saving' && (
                            <span className="text-yellow-400 text-[10px] md:text-xs flex items-center gap-1"><Loader2 size={10} className="animate-spin"/> Saving...</span>
                        )}
                        {savingStatus === 'saved' && (
                            <span className="text-green-400 text-[10px] md:text-xs flex items-center gap-1"><CheckCircle size={10}/> Saved</span>
                        )}
                    </div>
                </div>

                <div className="flex gap-1 md:gap-2 items-center">
                     <button 
                        onClick={() => { loadSavedDataFromDB(); }} 
                        disabled={loading}
                        className="bg-gray-600 hover:bg-gray-500 px-2 md:px-3 py-1 md:py-1.5 rounded text-[10px] md:text-xs flex gap-1 items-center transition-colors disabled:opacity-50"
                        title="Refresh Data"
                     >
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/> <span className="hidden sm:inline">Refresh</span>
                    </button>
                     <button onClick={handleLoadPending} className="bg-yellow-700/80 hover:bg-yellow-600 px-2 md:px-3 py-1 md:py-1.5 rounded text-[10px] md:text-xs flex gap-1 items-center transition-colors">
                        <DownloadCloud size={12}/> <span className="hidden sm:inline">DB</span> Pending
                    </button>
                    <button onClick={handleProcess} className="bg-green-600 hover:bg-green-500 text-white px-2 md:px-4 py-1 md:py-1.5 rounded font-bold shadow-md flex gap-1 md:gap-2 items-center text-[10px] md:text-sm transition-all transform active:scale-95">
                        <Save size={14}/> PROSES ({rows.filter(r => {
                          const normalValid = r.is_db_verified && r.is_stock_valid && r.part_number;
                          const doubleOverridden = r.status_message === 'Double' && r.force_override_double && r.is_stock_valid && r.part_number;
                          return normalValid || doubleOverridden;
                        }).length})
                    </button>
                </div>
            </div>

            {/* IMPORT & UPLOAD CONFIGURATION SECTION */}
            <div className="flex flex-wrap items-center gap-2 bg-blue-900/20 p-2 rounded border border-blue-800/50">
                <div className="text-[10px] md:text-xs text-blue-300 font-semibold flex items-center gap-1">
                    <Settings size={12}/> Upload Config:
                </div>
                
                {/* SELECTOR E-COMMERCE (SEARCHABLE) */}
                <EcommerceDropdown 
                    value={uploadEcommerce}
                    onChange={(v) => setUploadEcommerce(v as EcommercePlatform)}
                />

                {/* SELECTOR SUB TOKO */}
                {uploadEcommerce === 'RESELLER' ? (
                     <SubTokoResellerDropdown 
                        value={uploadSubToko}
                        onChange={(v) => setUploadSubToko(v as SubToko)}
                        suggestions={resellerTokoList}
                     />
                ) : (
                    <select 
                        value={uploadSubToko} 
                        onChange={e => setUploadSubToko(e.target.value as SubToko)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-[10px] md:text-xs outline-none focus:ring-1 focus:ring-blue-500 flex-shrink-0"
                    >
                        <option value="MJM">MJM</option>
                        <option value="BJW">BJW</option>
                        <option value="LARIS">LARIS</option>
                        <option value="PRAKTIS PART">PRAKTIS PART</option>
                    </select>
                )}

                {/* SELECTOR NEGARA (KHUSUS EKSPOR) */}
                {uploadEcommerce === 'EKSPOR' && (
                    <select 
                        value={uploadNegara} 
                        onChange={e => setUploadNegara(e.target.value as NegaraEkspor)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-[10px] md:text-xs outline-none focus:ring-1 focus:ring-blue-500 flex-shrink-0"
                    >
                        <option value="PH">PH</option>
                        <option value="MY">MY</option>
                        <option value="SG">SG</option>
                        <option value="HK">HK</option>
                    </select>
                )}

                {/* CHECKBOX OVERRIDE STAGE 1 */}
                <label className="flex items-center gap-1.5 cursor-pointer ml-2 group">
                    <input 
                        type="checkbox"
                        checked={overrideStage1}
                        onChange={(e) => setOverrideStage1(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-gray-800 cursor-pointer"
                    />
                    <span className={`text-[10px] md:text-xs font-medium transition-colors ${overrideStage1 ? 'text-orange-400' : 'text-gray-400 group-hover:text-gray-300'}`}>
                        Override Stage 1
                    </span>
                    {overrideStage1 && (
                        <span className="text-[9px] text-orange-300 bg-orange-900/30 px-1.5 py-0.5 rounded">
                            Paksa: {uploadEcommerce} / {uploadSubToko}
                        </span>
                    )}
                </label>
                
                <div className="hidden md:block h-4 w-px bg-gray-600 mx-1"></div>

                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv, .xlsx, .xls" className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-500 px-3 md:px-4 py-1 rounded text-[10px] md:text-xs flex gap-1 items-center font-bold shadow transition-colors ml-auto md:ml-0">
                    <Upload size={12}/> Import CSV
                </button>
                
                {/* SAVE ALL BUTTON - Force save semua data ke database */}
                <button 
                    onClick={handleSaveAllRows}
                    disabled={savingStatus === 'saving' || rows.length === 0}
                    className={`px-3 md:px-4 py-1 rounded text-[10px] md:text-xs flex gap-1 items-center font-bold shadow transition-colors ${
                        savingStatus === 'saving' 
                            ? 'bg-yellow-600 text-white cursor-wait' 
                            : savingStatus === 'saved'
                                ? 'bg-green-600 text-white'
                                : 'bg-purple-600 hover:bg-purple-500 text-white'
                    }`}
                    title="Simpan semua data ke database"
                >
                    {savingStatus === 'saving' ? (
                        <>
                            <Loader2 size={12} className="animate-spin" /> Menyimpan...
                        </>
                    ) : savingStatus === 'saved' ? (
                        <>
                            <CheckCircle size={12} /> Tersimpan
                        </>
                    ) : (
                        <>
                            <Save size={12}/> Simpan ({rows.length})
                        </>
                    )}
                </button>
                
                {/* KILAT BUTTON - Simpan hanya resi KILAT */}
                <button 
                    onClick={handleSaveKilatRows}
                    disabled={savingStatus === 'saving' || rows.filter(r => r.ecommerce?.toUpperCase() === 'KILAT').length === 0}
                    className={`px-3 md:px-4 py-1 rounded text-[10px] md:text-xs flex gap-1 items-center font-bold shadow transition-colors ${
                        rows.filter(r => r.ecommerce?.toUpperCase() === 'KILAT').length === 0
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-orange-600 hover:bg-orange-500 text-white'
                    }`}
                    title="Simpan hanya resi KILAT"
                >
                    <Zap size={12}/> Kilat ({rows.filter(r => r.ecommerce?.toUpperCase() === 'KILAT').length})
                </button>
            </div>

            {/* TAB RESI */}
            <div className="flex items-center gap-2 mb-2">
                <button
                    onClick={() => setActiveResiTab('regular')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        activeResiTab === 'regular'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                    Reguler ({regularRowCount})
                </button>
                <button
                    onClick={() => setActiveResiTab('kilat')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        activeResiTab === 'kilat'
                            ? 'bg-yellow-500 text-black'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                    KILAT ({kilatRowCount})
                </button>
            </div>

            {/* VIEW FILTER BAR */}
            <div className="flex flex-wrap gap-1 md:gap-2 bg-gray-900/50 p-1.5 rounded items-center border border-gray-700/50">
                <Filter size={12} className="text-gray-400 ml-1 hidden md:block" />
                
                {/* FILTER STATUS - Dinamis berdasarkan data */}
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs text-gray-300 focus:border-blue-500 outline-none flex-shrink-0">
                    <option value="all">Semua Status</option>
                    {uniqueStatuses.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                </select>
                
                {/* FILTER ECOMMERCE (SEARCHABLE) */}
                <EcommerceFilterDropdown 
                    value={filterEcommerce}
                    onChange={(v) => setFilterEcommerce(v)}
                />
                
                {/* FILTER PART NUMBER dengan Dropdown */}
                <div className="relative" ref={partNumberSearchRef}>
                    <div className="flex items-center gap-1">
                        <input
                            type="text"
                            value={filterPartNumber}
                            onChange={e => { setFilterPartNumber(e.target.value); setShowPartNumberDropdown(true); }}
                            onFocus={() => setShowPartNumberDropdown(true)}
                            placeholder="Cari Part No..."
                            className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-[10px] md:text-xs text-yellow-400 w-28 md:w-36 focus:border-yellow-500 outline-none font-mono"
                        />
                        {filterPartNumber && (
                            <button 
                                onClick={() => { setFilterPartNumber(''); setShowPartNumberDropdown(false); }}
                                className="text-gray-400 hover:text-white text-xs"
                                title="Hapus filter"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    {showPartNumberDropdown && (
                        <div className="absolute left-0 top-full mt-1 w-64 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-60 overflow-auto z-50">
                            <div className="p-1.5 text-[9px] text-yellow-400 border-b border-gray-700 bg-yellow-900/20 font-semibold sticky top-0 z-10">
                                📦 Part Number di Tabel ({(() => {
                                    const uniqueParts = [...new Set(rows.filter(r => r.part_number).map(r => r.part_number))];
                                    const filtered = filterPartNumber 
                                        ? uniqueParts.filter(p => p.toLowerCase().includes(filterPartNumber.toLowerCase()))
                                        : uniqueParts;
                                    return filtered.length;
                                })()})
                            </div>
                            {(() => {
                                const uniqueParts = [...new Set(rows.filter(r => r.part_number).map(r => r.part_number))];
                                const filtered = filterPartNumber 
                                    ? uniqueParts.filter(p => p.toLowerCase().includes(filterPartNumber.toLowerCase()))
                                    : uniqueParts;
                                return filtered.slice(0, 30).map((pn, i) => {
                                    // Hitung berapa baris yang punya part number ini
                                    const count = rows.filter(r => r.part_number === pn).length;
                                    const totalQty = rows.filter(r => r.part_number === pn).reduce((sum, r) => sum + r.qty_keluar, 0);
                                    const stock = rows.find(r => r.part_number === pn)?.stock_saat_ini || 0;
                                    return (
                                        <div 
                                            key={i} 
                                            className="px-2 py-1.5 hover:bg-yellow-900/30 cursor-pointer border-b border-gray-700/50 text-[10px]"
                                            onClick={() => {
                                                setFilterPartNumber(pn);
                                                setShowPartNumberDropdown(false);
                                            }}
                                        >
                                            <div className="flex justify-between items-center">
                                                <span className="font-mono text-yellow-400 truncate max-w-[140px]">{pn}</span>
                                                <span className={`px-1 rounded text-[9px] ${totalQty > stock ? 'bg-pink-600/30 text-pink-300' : 'bg-green-600/30 text-green-300'}`}>
                                                    {count} resi
                                                </span>
                                            </div>
                                            <div className="flex gap-2 text-gray-500 mt-0.5">
                                                <span>Total Qty: {totalQty}</span>
                                                <span>Stok: {stock}</span>
                                                {totalQty > stock && <span className="text-pink-400">⚠️ Kurang {totalQty - stock}</span>}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                            {(() => {
                                const uniqueParts = [...new Set(rows.filter(r => r.part_number).map(r => r.part_number))];
                                const filtered = filterPartNumber 
                                    ? uniqueParts.filter(p => p.toLowerCase().includes(filterPartNumber.toLowerCase()))
                                    : uniqueParts;
                                return filtered.length === 0 && (
                                    <div className="p-3 text-center text-gray-500 text-[10px]">Tidak ada part number</div>
                                );
                            })()}
                        </div>
                    )}
                </div>
                
                {/* FILTER TOKO */}
                <select value={filterSubToko} onChange={e => setFilterSubToko(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs text-gray-300 focus:border-blue-500 outline-none flex-shrink-0">
                    <option value="">Semua Toko</option>
                    {uniqueTokos.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                
                {/* SEARCH RESI DROPDOWN - Mencari di Stage 1 DAN Tabel S3 */}
                <div className="relative ml-auto" ref={resiSearchRef}>
                    <div className="flex items-center gap-1">
                        <Search size={12} className="text-gray-400" />
                        <input
                            type="text"
                            value={resiSearchQuery}
                            onChange={e => { setResiSearchQuery(e.target.value); setShowResiDropdown(true); }}
                            onFocus={() => setShowResiDropdown(true)}
                            placeholder="Cari Resi..."
                            className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-[10px] md:text-xs text-gray-300 w-28 md:w-40 focus:border-blue-500 outline-none"
                        />
                        {/* Tombol Clear Search */}
                        {resiSearchQuery && (
                            <button 
                                onClick={() => { setResiSearchQuery(''); setShowResiDropdown(false); }}
                                className="text-gray-400 hover:text-white text-xs px-1"
                                title="Hapus pencarian"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    {showResiDropdown && resiSearchQuery && (
                        <div className="absolute right-0 top-full mt-1 w-80 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-72 overflow-auto z-50">
                            {/* SECTION 1: Hasil dari Tabel Stage 3 (rows) */}
                            {(() => {
                                const filteredTableRows = rows.filter(r => 
                                    resiSearchQuery && (
                                        String(r.resi || '').toLowerCase().includes(resiSearchQuery.toLowerCase()) ||
                                        (r.no_pesanan && String(r.no_pesanan).toLowerCase().includes(resiSearchQuery.toLowerCase())) ||
                                        (r.customer && String(r.customer).toLowerCase().includes(resiSearchQuery.toLowerCase())) ||
                                        (r.part_number && String(r.part_number).toLowerCase().includes(resiSearchQuery.toLowerCase()))
                                    )
                                );
                                return filteredTableRows.length > 0 && (
                                    <>
                                        <div className="p-1.5 text-[9px] text-green-400 border-b border-gray-700 bg-green-900/20 font-semibold sticky top-0 z-10">
                                            📋 Hasil di Tabel S3 ({filteredTableRows.length})
                                        </div>
                                        {filteredTableRows.slice(0, 20).map((r, i) => {
                                            const rowIndex = visualRows.indexOf(r);
                                            return (
                                                <div 
                                                    key={`table-${i}`} 
                                                    className="px-2 py-1.5 hover:bg-green-900/30 cursor-pointer border-b border-gray-700/50 text-[10px]"
                                                    onClick={() => {
                                                        // Scroll ke row di tabel - tetap buka dropdown
                                                        if (rowIndex >= 0) {
                                                            const el = document.getElementById(`input-${rowIndex}-part_number`);
                                                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                            el?.focus();
                                                        }
                                                        // Tidak menutup dropdown dan tidak mengubah query
                                                    }}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-mono text-green-300 truncate max-w-[130px]">{r.resi}</span>
                                                        <span className={`px-1 rounded text-[9px] ${
                                                            r.status_message === 'Ready' ? 'bg-green-600/30 text-green-300' : 
                                                            r.status_message === 'Stok Kurang' ? 'bg-red-600/30 text-red-300' :
                                                            'bg-yellow-600/30 text-yellow-300'
                                                        }`}>
                                                            {r.status_message}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-2 text-gray-500 mt-0.5">
                                                        <span>{r.ecommerce}</span>
                                                        <span>{r.sub_toko}</span>
                                                        <span className="text-gray-400 truncate max-w-[80px]">{r.customer}</span>
                                                        {r.part_number && <span className="text-yellow-400 font-mono">{r.part_number}</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                );
                            })()}
                            
                            {/* SECTION 2: Hasil dari Stage 1 (untuk referensi) */}
                            <div className="p-1.5 text-[9px] text-blue-400 border-b border-gray-700 bg-blue-900/20 font-semibold sticky top-0 z-10">
                                🔍 Resi Stage 1 ({stage1ResiList.filter(r => 
                                    !resiSearchQuery || 
                                    String(r.resi || '').toLowerCase().includes(resiSearchQuery.toLowerCase()) ||
                                    (r.no_pesanan && String(r.no_pesanan).toLowerCase().includes(resiSearchQuery.toLowerCase()))
                                ).length})
                            </div>
                            {stage1ResiList
                                .filter(r => 
                                    !resiSearchQuery || 
                                    String(r.resi || '').toLowerCase().includes(resiSearchQuery.toLowerCase()) ||
                                    (r.no_pesanan && String(r.no_pesanan).toLowerCase().includes(resiSearchQuery.toLowerCase()))
                                )
                                .slice(0, 30)
                                .map((r, i) => (
                                    <div 
                                        key={`s1-${i}`} 
                                        className="px-2 py-1.5 hover:bg-blue-900/30 cursor-pointer border-b border-gray-700/50 text-[10px]"
                                        onClick={() => {
                                            // Cek apakah resi ini sudah ada di tabel S3
                                            const foundRowIndex = visualRows.findIndex(row => row.resi === r.resi || row.no_pesanan === r.no_pesanan);
                                            if (foundRowIndex >= 0) {
                                                const el = document.getElementById(`input-${foundRowIndex}-part_number`);
                                                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                el?.focus();
                                            }
                                            // Tidak menutup dropdown, tetap buka untuk navigasi
                                        }}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="font-mono text-blue-300 truncate max-w-[130px]">{r.resi}</span>
                                            <div className="flex gap-1">
                                                {/* Indikator apakah sudah ada di tabel S3 */}
                                                {rows.some(row => row.resi === r.resi) && (
                                                    <span className="px-1 rounded text-[9px] bg-green-600/30 text-green-300">Di S3</span>
                                                )}
                                                <span className={`px-1 rounded text-[9px] ${r.stage2_verified ? 'bg-green-600/30 text-green-300' : 'bg-yellow-600/30 text-yellow-300'}`}>
                                                    {r.stage2_verified ? 'S2 ✓' : 'S1 only'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 text-gray-500 mt-0.5">
                                            <span>{r.ecommerce}</span>
                                            <span>{r.sub_toko}</span>
                                            {r.no_pesanan && <span className="text-gray-400">#{r.no_pesanan}</span>}
                                        </div>
                                    </div>
                                ))
                            }
                            {stage1ResiList.filter(r => 
                                !resiSearchQuery || 
                                r.resi.toLowerCase().includes(resiSearchQuery.toLowerCase())
                            ).length === 0 && rows.filter(r => 
                                resiSearchQuery && r.resi.toLowerCase().includes(resiSearchQuery.toLowerCase())
                            ).length === 0 && (
                                <div className="p-3 text-center text-gray-500 text-[10px]">Tidak ditemukan</div>
                            )}
                        </div>
                    )}
                </div>
                
                <div className="text-[10px] md:text-xs text-gray-400 px-1 md:px-2 border-l border-gray-700 ml-2">
                    Total: {displayedRows.length}
                </div>
            </div>
        </div>
      </div>

      {/* BULK SELECT BAR - FIXED di atas table, tampil jika ada yang dipilih */}
      {selectedResis.size > 0 && (
        <div className="bg-blue-900/95 backdrop-blur-sm border border-blue-600 rounded-lg p-2 mb-2 flex items-center justify-between shadow-lg flex-shrink-0">
          <div className="flex items-center gap-3">
            {(() => {
              // Hitung resi yang siap vs tidak siap
              const selectedResiArray = Array.from(selectedResis);
              const resiWithStockIssues = selectedResiArray.filter(resi => {
                const itemsInResi = rows.filter(r => r.resi === resi);
                return itemsInResi.some(r => !r.is_stock_valid || r.stock_saat_ini < r.qty_keluar);
              });
              const readyResiCount = selectedResiArray.length - resiWithStockIssues.length;
              
              return (
                <>
                  <span className="text-blue-200 font-bold text-sm">
                    {selectedResis.size} resi dipilih ({rows.filter(r => selectedResis.has(r.resi)).length} item)
                  </span>
                  {resiWithStockIssues.length > 0 && (
                    <span className="text-red-400 text-xs">
                      ⚠️ {resiWithStockIssues.length} resi tidak bisa diproses (stok kurang)
                    </span>
                  )}
                </>
              );
            })()}
            <button 
              onClick={() => setSelectedResis(new Set())}
              className="text-xs text-blue-300 hover:text-white underline"
            >
              Batalkan
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleDeleteSelectedAll}
              disabled={loading}
              className="bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Trash2 size={16}/> Hapus Semua
            </button>
            <button 
              onClick={handleProcessSelected}
              disabled={loading}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <CheckCircle size={16}/> Proses {selectedResis.size} Resi
            </button>
          </div>
        </div>
      )}

      {/* EXCEL-LIKE TABLE */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto border border-gray-600 bg-gray-800 shadow-inner custom-scrollbar">
        <table className="border-collapse text-[10px] md:text-xs min-w-[1000px] md:w-full md:table-fixed">
          <thead className="sticky top-0 z-20 shadow-md">
            <tr className="bg-gray-700 text-gray-200 font-semibold">
              <th className="border border-gray-600 px-1 py-1 text-center w-[40px] md:w-[3%] bg-gray-700">
                <input 
                  type="checkbox" 
                  checked={Object.keys(groupedByResi).length > 0 && selectedResis.size === Object.keys(groupedByResi).length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 accent-green-500 cursor-pointer"
                  title="Pilih Semua"
                />
              </th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[55px] md:w-[5%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('status_message')}>
                <div className="flex items-center justify-center gap-0.5">Status {getSortIcon('status_message')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[75px] md:w-[6%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('tanggal')}>
                <div className="flex items-center justify-center gap-0.5">Tanggal {getSortIcon('tanggal')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[80px] md:w-[7%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('resi')}>
                <div className="flex items-center gap-0.5">Resi {getSortIcon('resi')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[55px] md:w-[5%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('ecommerce')}>
                <div className="flex items-center justify-center gap-0.5">E-Comm {getSortIcon('ecommerce')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[45px] md:w-[4%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('sub_toko')}>
                <div className="flex items-center justify-center gap-0.5">Toko {getSortIcon('sub_toko')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[70px] md:w-[6%] bg-gray-600 cursor-pointer hover:bg-gray-500" onClick={() => handleSort('customer')}>
                <div className="flex items-center gap-0.5">Customer {getSortIcon('customer')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-left border-b-2 border-b-yellow-600/50 w-[90px] md:w-[8%] bg-gray-600 cursor-pointer hover:bg-gray-500" onClick={() => handleSort('part_number')}>
                <div className="flex items-center gap-0.5">Part No. {getSortIcon('part_number')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[140px] md:w-[12%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('nama_barang_csv')}>
                <div className="flex items-center gap-0.5">Nama (CSV) {getSortIcon('nama_barang_csv')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[100px] md:w-[9%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('nama_barang_base')}>
                <div className="flex items-center gap-0.5">Nama (Base) {getSortIcon('nama_barang_base')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[55px] md:w-[5%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('brand')}>
                <div className="flex items-center gap-0.5">Brand {getSortIcon('brand')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[70px] md:w-[6%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('application')}>
                <div className="flex items-center gap-0.5">Aplikasi {getSortIcon('application')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[40px] md:w-[3%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('stock_saat_ini')}>
                <div className="flex items-center justify-center gap-0.5">Stok {getSortIcon('stock_saat_ini')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-center border-b-2 border-b-yellow-600/50 w-[40px] md:w-[3%] bg-gray-600 cursor-pointer hover:bg-gray-500" onClick={() => handleSort('qty_keluar')}>
                <div className="flex items-center justify-center gap-0.5">Qty {getSortIcon('qty_keluar')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-right border-b-2 border-b-yellow-600/50 w-[70px] md:w-[5%] bg-gray-600 cursor-pointer hover:bg-gray-500" onClick={() => handleSort('harga_total')}>
                <div className="flex items-center justify-end gap-0.5">Total {getSortIcon('harga_total')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-right w-[60px] md:w-[4%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('harga_satuan')}>
                <div className="flex items-center justify-end gap-0.5">Satuan {getSortIcon('harga_satuan')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[60px] md:w-[4%] bg-gray-700 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('no_pesanan')}>
                <div className="flex items-center gap-0.5">No. Pesanan {getSortIcon('no_pesanan')}</div>
              </th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[35px] md:w-[2%] bg-gray-700">#</th>
            </tr>
          </thead>
          <tbody className="bg-gray-900 text-gray-300">
            {Object.keys(groupedByResi).length === 0 ? (
              <tr><td colSpan={18} className="text-center py-10 text-gray-500 italic">Data Kosong. Silakan Import atau Load Pending.</td></tr>
            ) : (
              Object.entries(groupedByResi).map(([resiKey, resiItems]) => {
                const groupStatus = getGroupStatus(resiItems);
                const isSelected = selectedResis.has(resiKey);
                const firstItem = resiItems[0];
                const totalQty = resiItems.reduce((sum, r) => sum + r.qty_keluar, 0);
                const totalHarga = resiItems.reduce((sum, r) => sum + r.harga_total, 0);
                // Cek apakah ada item dengan stok kurang dalam resi ini
                const hasStockIssue = resiItems.some(r => !r.is_stock_valid || r.stock_saat_ini < r.qty_keluar);
                const canProcess = groupStatus.status === 'Ready';
                
                return resiItems.map((row, itemIdx) => {
                  const isFirstOfGroup = itemIdx === 0;
                  // Gunakan visualRows untuk index yang sesuai dengan urutan visual di tabel
                  const idx = visualRows.indexOf(row);
                  const rowFlashStyle = getRowFlashStyle(row.id);
                  
                  return (
                    <tr key={row.id} className={`group hover:bg-gray-700/50 transition-colors ${getRowBgColor(row, isSelected)} ${isFirstOfGroup && resiItems.length > 1 ? 'border-t-2 border-t-gray-500' : ''}`} style={rowFlashStyle}>
                      
                      {/* CHECKBOX - hanya tampil di baris pertama grup */}
                      {isFirstOfGroup ? (
                        <td rowSpan={resiItems.length} className={`border border-gray-600 p-0 text-center align-middle ${isSelected ? 'bg-blue-900/30' : hasStockIssue ? 'bg-red-900/20' : 'bg-gray-800'}`}>
                          <div className="flex flex-col items-center gap-1 py-1">
                            <input 
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectResi(resiKey)}
                              className={`w-5 h-5 cursor-pointer ${hasStockIssue ? 'accent-red-500' : 'accent-green-500'}`}
                              title={hasStockIssue ? 'Ada item dengan stok kurang - tidak bisa diproses' : (canProcess ? 'Siap diproses' : 'Belum siap diproses')}
                            />
                            {resiItems.length > 1 && (
                              <span className={`text-[9px] ${hasStockIssue ? 'text-red-400' : 'text-gray-400'}`}>
                                {resiItems.length} item{hasStockIssue ? ' ⚠️' : ''}
                              </span>
                            )}
                            {hasStockIssue && resiItems.length === 1 && (
                              <span className="text-[9px] text-red-400">⚠️</span>
                            )}
                          </div>
                        </td>
                      ) : null}
                  {/* STATUS */}
                  <td className="border border-gray-600 p-0 text-center align-middle">
                     <div className="flex flex-col items-center gap-0.5 py-0.5">
                       <div className={`text-[10px] font-bold py-0.5 px-1 mx-1 rounded ${
                          row.status_message === 'Ready' ? 'bg-green-600 text-white' : 
                          row.status_message === 'Stok Kurang' ? 'bg-red-600 text-white' :
                          row.status_message === 'Stok Total Kurang' ? 'bg-pink-600 text-white' :
                          row.status_message === 'Double' ? (row.force_override_double ? 'bg-green-600 text-white' : 'bg-orange-600 text-white') :
                          row.status_message === 'Base Kosong' ? 'bg-purple-600 text-white' :
                          row.status_message === 'Belum Scan S1' ? 'bg-red-800 text-red-200' :
                          row.status_message === 'Pending S2' ? 'bg-yellow-600 text-yellow-100' :
                          row.status_message === 'Butuh Input' ? 'bg-blue-600 text-white' :
                          'bg-gray-600 text-gray-300'
                       }`}>
                          {row.status_message === 'Double' && row.force_override_double ? 'Ready*' : row.status_message}
                       </div>
                       
                       {/* Info tooltip untuk Stok Total Kurang */}
                       {row.status_message === 'Stok Total Kurang' && (
                         <div className="text-[8px] text-pink-300 px-1">
                           {(() => {
                             // Hitung total yang dibutuhkan untuk part ini
                             const totalNeeded = rows.filter(r => r.part_number === row.part_number).reduce((sum, r) => sum + r.qty_keluar, 0);
                             return `Total: ${totalNeeded}, Stok: ${row.stock_saat_ini}`;
                           })()}
                         </div>
                       )}
                       
                       {/* FITUR 1: Checkbox Override untuk status Double */}
                       {row.status_message === 'Double' && (
                         <label className="flex items-center gap-0.5 text-[9px] text-orange-300 cursor-pointer hover:text-orange-200">
                           <input 
                             type="checkbox"
                             checked={row.force_override_double}
                             onChange={(e) => updateRow(row.id, 'force_override_double', e.target.checked)}
                             className="w-3 h-3 accent-orange-500"
                           />
                           <span>Override</span>
                         </label>
                       )}
                     </div>
                  </td>

                  {/* TANGGAL */}
                  <td className={`border border-gray-600 p-0 transition-all ${getCellFocusClass(idx, 'tanggal')}`}>
                    <input 
                        id={`input-${idx}-tanggal`} 
                        type="date" 
                        value={row.tanggal} 
                        onChange={(e) => updateRow(row.id, 'tanggal', e.target.value)} 
                        onFocus={() => setFocusedCell({ rowIndex: idx, colKey: 'tanggal' })}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'tanggal', row.id)} 
                        className="w-full h-full bg-transparent px-1 outline-none text-center cursor-pointer"
                    />
                  </td>

                  {/* RESI (READONLY) */}
                  <td className="border border-gray-600 px-1 py-1 font-mono text-blue-300 select-all truncate text-[11px]" title={row.resi}>
                    {row.resi}
                  </td>

                  {/* ECOMM (EDITABLE DROPDOWN) */}
                  <td className="border border-gray-600 px-0.5 text-center text-[11px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <EcommerceCellDropdown
                        value={row.ecommerce}
                        onChange={(v) => updateRow(row.id, 'ecommerce', v)}
                        onSave={() => handleSaveRow(row)}
                      />
                      {/* Badge INSTANT: untuk SHOPEE (jika resi === no_pesanan) ATAU TikTok (jika label INSTAN) */}
                      {((row.resi && row.no_pesanan && row.resi === row.no_pesanan && row.ecommerce?.toUpperCase().includes('SHOPEE')) ||
                        row.ecommerce?.toUpperCase().includes('INSTAN')) && (
                        <span className="px-1 py-0.5 bg-orange-500 text-white text-[8px] font-bold rounded">INSTANT</span>
                      )}
                    </div>
                  </td>
                  
                  {/* TOKO (EDITABLE DROPDOWN) */}
                  <td className="border border-gray-600 px-0.5 text-center text-[11px]">
                    <TokoCellDropdown
                      value={row.sub_toko}
                      onChange={(v) => updateRow(row.id, 'sub_toko', v)}
                      onSave={() => handleSaveRow(row)}
                    />
                  </td>

                  {/* CUSTOMER (INPUT) */}
                  <td className={`border border-gray-600 p-0 transition-all ${getCellFocusClass(idx, 'customer')}`}>
                    <input 
                        id={`input-${idx}-customer`} 
                        type="text"
                        value={row.customer} 
                        onChange={(e) => updateRow(row.id, 'customer', e.target.value)} 
                        onBlur={() => handleSaveRow(row)} 
                        onFocus={() => setFocusedCell({ rowIndex: idx, colKey: 'customer' })}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'customer', row.id)}
                        className="w-full h-full bg-transparent px-1.5 outline-none text-gray-200 truncate focus:text-clip"
                        placeholder="Customer..."
                    />
                  </td>

                  {/* PART NUMBER (INPUT UTAMA) dengan custom dropdown */}
                  <td className={`border border-gray-600 p-0 bg-gray-800/30 relative transition-all ${getCellFocusClass(idx, 'part_number')}`}>
                    <input 
                        id={`input-${idx}-part_number`} 
                        type="text" 
                        autoComplete="off"
                        value={row.part_number} 
                        onChange={(e) => {
                          updateRow(row.id, 'part_number', e.target.value);
                          setPartNumberDropdown({ rowId: row.id, rowIndex: idx, isOpen: true, selectedIndex: -1 });
                        }} 
                        onFocus={() => {
                          setFocusedCell({ rowIndex: idx, colKey: 'part_number' });
                          setPartNumberDropdown({ rowId: row.id, rowIndex: idx, isOpen: true, selectedIndex: -1 });
                        }}
                        onBlur={(e) => {
                          const currentRowId = row.id;
                          const blurValue = e.target.value;
                          // Delay blur untuk memungkinkan klik pada dropdown
                          setTimeout(() => {
                            if (partNumberDropdown.rowId === currentRowId) {
                              setPartNumberDropdown(prev => ({ ...prev, isOpen: false }));
                            }
                            // Jika ada selection dari dropdown untuk row ini, gunakan value dari selection
                            if (partNumberSelectedRef.current && partNumberSelectedRef.current.rowId === currentRowId) {
                              // Selection sudah dihandle oleh onMouseDown, skip onBlur
                              partNumberSelectedRef.current = null;
                              return;
                            }
                            handlePartNumberBlur(currentRowId, blurValue);
                          }, 150);
                        }} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'part_number', row.id)} 
                        className="w-full h-full bg-transparent px-1.5 outline-none text-yellow-400 font-mono font-bold placeholder-gray-600" 
                        placeholder="Scan Part..."
                    />
                    {/* Custom Part Number Dropdown - Style seperti Input Barang */}
                    {partNumberDropdown.isOpen && partNumberDropdown.rowId === row.id && (
                      <div className="absolute left-0 top-full mt-1 bg-gray-800 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto border border-gray-600 w-72">
                        {(() => {
                          const searchValue = row.part_number || '';
                          const filtered = partOptions.filter(p => 
                            p.part_number.toLowerCase().includes(searchValue.toLowerCase())
                          ).slice(0, 50);
                          
                          if (filtered.length === 0) {
                            return (
                              <div className="p-3 text-center text-gray-500 text-[10px]">
                                Tidak ditemukan
                              </div>
                            );
                          }
                          
                          return filtered.map((item, pnIdx) => (
                            <div 
                              key={pnIdx} 
                              className={`px-3 py-2 cursor-pointer border-b border-gray-700 last:border-0 transition-colors ${
                                partNumberDropdown.selectedIndex === pnIdx 
                                  ? 'bg-gray-700 border-l-2 border-orange-400' 
                                  : 'hover:bg-gray-700'
                              }`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                // Set ref untuk mencegah onBlur menimpa value
                                partNumberSelectedRef.current = { rowId: row.id, value: item.part_number };
                                updateRow(row.id, 'part_number', item.part_number);
                                handlePartNumberBlur(row.id, item.part_number);
                                setPartNumberDropdown(prev => ({ ...prev, isOpen: false, selectedIndex: -1 }));
                              }}
                              onMouseEnter={() => {
                                setPartNumberDropdown(prev => ({ ...prev, selectedIndex: pnIdx }));
                              }}
                            >
                              <div className="font-bold text-orange-400 font-mono text-xs">{item.part_number}</div>
                              <div className="text-gray-400 text-[10px] truncate">{item.name}</div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </td>

                  {/* NAMA BARANG DARI CSV/EXCEL */}
                  <td className="border border-gray-600 px-1.5 py-1 text-[11px] leading-tight align-middle text-blue-300 bg-blue-900/10">
                    <div className="whitespace-normal break-words" title={row.nama_barang_csv}>
                        {row.nama_barang_csv || ''}
                    </div>
                  </td>

                  {/* NAMA BARANG DARI BASE */}
                  <td className="border border-gray-600 px-1.5 py-1 text-[11px] leading-tight align-middle text-green-300 bg-green-900/10">
                    <div className="line-clamp-2 hover:line-clamp-none max-h-[3.5em] overflow-hidden" title={row.nama_barang_base}>
                        {row.nama_barang_base || ''}
                    </div>
                  </td>

                  {/* BRAND - merek spare part */}
                  <td className="border border-gray-600 px-1 py-1 text-[11px] truncate text-gray-400">{row.brand}</td>
                  {/* APPLICATION / MOBIL - jenis mobil */}
                  <td className="border border-gray-600 px-1 py-1 text-[11px] truncate text-gray-400">{row.application}</td>

                  {/* STOK INFO */}
                  <td className={`border border-gray-600 px-1 text-center font-bold ${row.stock_saat_ini < row.qty_keluar ? 'text-red-500 bg-red-900/20' : 'text-green-500'}`}>
                    {row.stock_saat_ini}
                  </td>

                  {/* QTY KELUAR (INPUT) */}
                  <td className={`border border-gray-600 p-0 transition-all ${getCellFocusClass(idx, 'qty_keluar')}`}>
                    <input 
                        id={`input-${idx}-qty_keluar`} 
                        type="number" 
                        value={row.qty_keluar || ''} 
                        onChange={(e) => updateRow(row.id, 'qty_keluar', parseInt(e.target.value) || 0)} 
                        onBlur={() => handleSaveRow(row)} 
                        onFocus={() => setFocusedCell({ rowIndex: idx, colKey: 'qty_keluar' })}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'qty_keluar', row.id)} 
                        className="w-full h-full bg-transparent text-center outline-none font-bold"
                        placeholder=""
                    />
                  </td>

                  {/* TOTAL HARGA (DISPLAY + INPUT) */}
                  <td className={`border border-gray-600 p-0 relative group/harga transition-all ${getCellFocusClass(idx, 'harga_total')}`}>
                    <div className="w-full h-full px-1 text-right font-mono text-yellow-400 font-bold group-focus-within/harga:hidden flex items-center justify-end gap-1">
                      <span>{row.harga_total ? formatNumber(row.harga_total) : ''}</span>
                      {row.mata_uang && row.mata_uang !== 'IDR' && row.harga_total > 0 && (
                        <span className="text-[9px] px-1 py-0.5 bg-purple-600/50 text-purple-200 rounded font-normal">{row.mata_uang}</span>
                      )}
                    </div>
                    <input 
                        id={`input-${idx}-harga_total`} 
                        type="number" 
                        value={row.harga_total || ''} 
                        onChange={(e) => updateRow(row.id, 'harga_total', parseInt(e.target.value) || 0)} 
                        onBlur={() => handleSaveRow(row)} 
                        onFocus={() => setFocusedCell({ rowIndex: idx, colKey: 'harga_total' })}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'harga_total', row.id)} 
                        className="absolute inset-0 w-full h-full bg-transparent text-right px-1 outline-none font-mono text-yellow-400 font-bold opacity-0 focus:opacity-100"
                        placeholder=""
                    />
                  </td>

                  {/* HARGA SATUAN (DISPLAY + INPUT) */}
                  <td className={`border border-gray-600 p-0 relative group/satuan transition-all ${getCellFocusClass(idx, 'harga_satuan')}`}>
                    <div className="w-full h-full px-1 text-right font-mono text-yellow-300 text-[11px] group-focus-within/satuan:hidden flex items-center justify-end gap-1">
                      <span>{formatNumber(row.harga_satuan || 0)}</span>
                      {row.mata_uang && row.mata_uang !== 'IDR' && row.harga_satuan > 0 && (
                        <span className="text-[8px] px-0.5 py-0.5 bg-purple-600/30 text-purple-300 rounded font-normal">{row.mata_uang}</span>
                      )}
                    </div>
                    <input 
                        id={`input-${idx}-harga_satuan`} 
                        type="number" 
                        value={row.harga_satuan || ''} 
                        onChange={(e) => updateRow(row.id, 'harga_satuan', parseInt(e.target.value) || 0)} 
                        onBlur={() => handleSaveRow(row)} 
                        onFocus={() => setFocusedCell({ rowIndex: idx, colKey: 'harga_satuan' })}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'harga_satuan', row.id)} 
                        className="absolute inset-0 w-full h-full bg-transparent text-right px-1 outline-none font-mono text-yellow-300 text-[11px] opacity-0 focus:opacity-100"
                        placeholder=""
                    />
                  </td>

                  {/* NO PESANAN */}
                  <td className="border border-gray-600 px-1 py-1 truncate text-[10px] text-gray-400" title={row.no_pesanan}>{row.no_pesanan}</td>

                  {/* ACTIONS */}
                  <td className="border border-gray-600 text-center p-0 align-middle">
                    <div className="flex flex-col items-center justify-center gap-1 h-full w-full py-1">
                      <button tabIndex={-1} onClick={() => handleSplit(row.id)} className="text-blue-400 hover:text-white hover:bg-blue-700 rounded p-0.5 transition-colors" title="Split Item"><Plus size={14}/></button>
                      <button tabIndex={-1} onClick={() => handleDeleteRow(row.id)} className="text-red-400 hover:text-white hover:bg-red-700 rounded p-0.5 transition-colors" title="Hapus Baris (juga dari Database)"><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
                  );
                })
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal untuk menampilkan proses dan hasil upload CSV */}
      <UploadResultModal
        isOpen={showSkippedModal}
        onClose={() => setShowSkippedModal(false)}
        skippedItems={skippedItems}
        updatedItems={updatedItems}
        summary={uploadSummary}
        isProcessing={isProcessingUpload}
        processLogs={processLogs}
      />

      {/* Processing Modal - Loading progress untuk proses barang keluar */}
      <ProcessingModal
        isOpen={showProcessingModal}
        onClose={() => setShowProcessingModal(false)}
        items={processingItems}
        progress={processingProgress}
        currentItem={processingCurrentItem}
        isComplete={processingComplete}
        successCount={processingSuccessCount}
        errorCount={processingErrorCount}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={executeDelete}
        items={deleteItems}
        isDeleting={isDeleting}
        deleteProgress={deleteProgress}
        deleteComplete={deleteComplete}
        deletedCount={deletedCount}
        errorCount={deleteErrorCount}
      />
    </div>
  );
};
