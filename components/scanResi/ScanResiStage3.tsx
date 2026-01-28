// FILE: components/scanResi/ScanResiStage3.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../context/StoreContext';
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
  checkResiOrOrderStatus,
  checkExistingInBarangKeluar,
  getStage1ResiList,
  getAllPendingStage1Resi
} from '../../services/resiScanService';
import { 
  parseShopeeCSV, 
  parseTikTokCSV, 
  detectCSVPlatform 
} from '../../services/csvParserService';
import { 
  Upload, Save, Trash2, Plus, DownloadCloud, RefreshCw, Filter, CheckCircle, Loader2, Settings, Search
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
  no_pesanan: string;
  customer: string;
  is_db_verified: boolean;
  is_stock_valid: boolean;
  status_message: string;
  force_override_double: boolean;  // FITUR 1: Flag untuk force override status Double
}

// Helper: Format angka ke format Indonesia (titik sebagai pemisah ribuan)
const formatCurrency = (value: number): string => {
  return value.toLocaleString('id-ID');
};

// Helper: Parse string currency Indonesia ke number
const parseCurrency = (value: string): number => {
  // Hapus semua titik (pemisah ribuan) lalu parse
  return parseInt(value.replace(/\./g, '')) || 0;
};

// --- KOMPONEN DROPDOWN E-COMMERCE (SEARCHABLE) ---
const EcommerceDropdown = ({ value, onChange }: { value: string, onChange: (v: string) => void }) => {
  const [show, setShow] = useState(false);
  const [input, setInput] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  const ecommerceOptions = ['SHOPEE', 'TIKTOK', 'KILAT', 'RESELLER', 'EKSPOR'];

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

  // Hapus import duplikat di sini

  return (
    <div className="relative" ref={ref}>
      <input
        className="input input-sm"
        value={input}
        onFocus={() => setShow(true)}
        onChange={e => setInput(e.target.value)}
        placeholder="Pilih Ecommerce"
      />
      {show && (
        <div className="absolute z-10 bg-white border rounded w-full mt-1 max-h-40 overflow-auto shadow">
          {filtered.length > 0 ? (
            filtered.map((s, i) => (
              <div
                key={i}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-xs"
                onClick={() => handleSelect(s)}
              >
                {s}
              </div>
            ))
          ) : (
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

export const ScanResiStage3 = ({ onRefresh }: { onRefresh?: () => void }) => {
  const { selectedStore } = useStore();
  const [rows, setRows] = useState<Stage3Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [partOptions, setPartOptions] = useState<string[]>([]);
  
  // FILTER STATES (VIEW)
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEcommerce, setFilterEcommerce] = useState<string>('');
  const [filterSubToko, setFilterSubToko] = useState<string>('');
  const [filterPartNumber, setFilterPartNumber] = useState<string>('');
  const [showPartNumberDropdown, setShowPartNumberDropdown] = useState(false);
  const partNumberSearchRef = useRef<HTMLDivElement>(null);

  // UPLOAD SETTINGS STATES (Seperti Stage 1)
  const [uploadEcommerce, setUploadEcommerce] = useState<EcommercePlatform>('SHOPEE');
  const [uploadSubToko, setUploadSubToko] = useState<SubToko>(selectedStore === 'bjw' ? 'BJW' : 'MJM');
  const [uploadNegara, setUploadNegara] = useState<NegaraEkspor>('PH');

  // RESI SEARCH STATE
  const [stage1ResiList, setStage1ResiList] = useState<Array<{resi: string, no_pesanan?: string, ecommerce: string, sub_toko: string, stage2_verified: boolean}>>([]);
  const [resiSearchQuery, setResiSearchQuery] = useState('');
  const [showResiDropdown, setShowResiDropdown] = useState(false);
  const resiSearchRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

        const partMap = new Map();
        bulkPartInfo.forEach((p: any) => partMap.set(p.part_number, p));

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
           
           const partInfo = partMap.get(item.part_number);
           
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
               if (!dbRow.stage2_verified || String(dbRow.stage2_verified) !== 'true') { 
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
           
           const qty = Number(item.jumlah || item.quantity || 1);
           const stockValid = stock >= qty;
           
           // CHECK 3: Stok kurang
           if (!stockValid && verified) statusMsg = 'Stok Kurang';
           
           // CHECK 4: Nama barang base masih kosong (belum ada part number valid)
           if (verified && stockValid && !namaBase && item.part_number) {
               statusMsg = 'Base Kosong';
               verified = false;
           }
           
           // CHECK 5: Part number belum diisi
           if (verified && stockValid && !item.part_number) {
               statusMsg = 'Butuh Input';
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

           loadedRows.push({
             id: `db-${item.id}`,
             tanggal: item.created_at ? item.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
             resi: item.resi,
             ecommerce: ecommerceDB,
             sub_toko: subToko,
             part_number: item.part_number || '',
             nama_barang_csv: item.nama_produk || 'Item CSV', 
             nama_barang_base: namaBase, 
             brand: brand,
             application: app,
             stock_saat_ini: stock,
             qty_keluar: qty,
             harga_total: Number(item.total_harga_produk || 0),
             harga_satuan: qty > 0 ? (Number(item.total_harga_produk || 0) / qty) : 0,
             no_pesanan: item.order_id || '',
             customer: item.customer || '-',
             is_db_verified: verified,
             is_stock_valid: stockValid,
             status_message: statusMsg,
             force_override_double: false  // FITUR 1: Default false
           });
        }

        // === OPSI 3: AGGREGATE CHECK ===
        // Hitung total qty yang dibutuhkan per part_number
        const aggregateQtyMap = new Map<string, { totalNeeded: number; stock: number }>();
        loadedRows.forEach(row => {
          if (row.part_number) {
            const existing = aggregateQtyMap.get(row.part_number);
            if (existing) {
              existing.totalNeeded += row.qty_keluar;
            } else {
              aggregateQtyMap.set(row.part_number, { 
                totalNeeded: row.qty_keluar, 
                stock: row.stock_saat_ini 
              });
            }
          }
        });

        // Update status untuk item yang total qty melebihi stok
        loadedRows.forEach(row => {
          if (row.part_number) {
            const aggregate = aggregateQtyMap.get(row.part_number);
            if (aggregate && aggregate.totalNeeded > aggregate.stock) {
              // Hanya update jika status sebelumnya Ready atau Stok Kurang
              if (row.status_message === 'Ready' || row.status_message === 'Stok Kurang') {
                row.status_message = `Stok Total Kurang`;
                row.is_stock_valid = false;
              }
            }
          }
        });

        // Simpan loadedRows untuk digunakan nanti
        const csvResiSet = new Set(loadedRows.map(r => r.resi));
        
        // === TAMBAHAN: Ambil resi dari Stage 1 yang belum ada di CSV ===
        const stage1Resi = await getAllPendingStage1Resi(selectedStore);
        
        // Filter resi Stage 1 yang belum ada di CSV
        const stage1OnlyRows: Stage3Row[] = [];
        for (const s1 of stage1Resi) {
          if (!csvResiSet.has(s1.resi)) {
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
              nama_barang_csv: '-',
              nama_barang_base: '',
              brand: '',
              application: '',
              stock_saat_ini: 0,
              qty_keluar: 1,
              harga_total: 0,
              harga_satuan: 0,
              customer: s1.customer || '',
              no_pesanan: s1.no_pesanan || '',
              is_db_verified: s1.stage2_verified,
              is_stock_valid: false,
              status_message: statusMsg,
              force_override_double: false
            });
            csvResiSet.add(s1.resi);
          }
        }
        
        // Gabungkan semua rows (dari CSV + Stage 1 only)
        // CSV items sudah diurutkan by created_at DESC dari database
        // Stage 1 only juga sudah diurutkan by tanggal DESC
        const allRows = [...loadedRows, ...stage1OnlyRows];
        
        // Langsung set rows tanpa merge logic yang mengacaukan urutan
        // Urutan sudah benar dari database (terbaru di atas)
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
            nama_barang_csv: '-',
            nama_barang_base: '',
            brand: '',
            application: '',
            stock_saat_ini: 0,
            qty_keluar: 1,
            harga_total: 0,
            harga_satuan: 0,
            customer: s1.customer || '',
            no_pesanan: s1.no_pesanan || '',
            is_db_verified: s1.stage2_verified,
            is_stock_valid: false,
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

  const handleSaveRow = async (row: Stage3Row) => {
    setSavingStatus('saving');
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
         
         if (newId) {
             setRows(prev => prev.map(r => r.id === row.id ? { ...r, id: `db-${newId}` } : r));
         }
      }
      setSavingStatus('saved');
      setTimeout(() => setSavingStatus('idle'), 2000);
    } catch (e) {
      console.error("Auto-save failed:", e);
      setSavingStatus('idle');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    
    try {
      const data = await file.arrayBuffer();
      // Tambahkan opsi cellText: true dan cellDates: true untuk mempertahankan format asli
      const workbook = XLSX.read(data, { type: 'array', cellText: true, cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Konversi ke CSV dengan rawNumbers: true agar angka panjang tidak jadi scientific notation
      const csvText = XLSX.utils.sheet_to_csv(worksheet, { rawNumbers: true });

      const platform = detectCSVPlatform(csvText);
      let parsedItems: any[] = [];
      
      // Parsing berdasarkan deteksi format file (Shopee/TikTok)
      // Namun attribute ecommerce/toko akan kita override dengan pilihan user
      if (platform === 'shopee') parsedItems = parseShopeeCSV(csvText);
      else if (platform === 'tiktok') parsedItems = parseTikTokCSV(csvText);
      else { 
        // Fallback coba parse Shopee standar jika tidak terdeteksi
        parsedItems = parseShopeeCSV(csvText);
        if(parsedItems.length === 0) {
             alert('Format File tidak dikenali! Pastikan header kolom "No. Resi" atau "No. Pesanan" ada.'); 
             setLoading(false); 
             return; 
        }
      }

      if (parsedItems.length === 0) {
        alert('Tidak ada data valid (Mungkin status Batal/Belum Bayar?).');
        setLoading(false);
        return;
      }

      // === STEP 1: CEK BARANG_KELUAR - Filter item yang sudah terjual ===
      const allResiFromCSV = parsedItems.map(i => i.resi).filter(Boolean);
      const allOrderIdFromCSV = parsedItems.map(i => i.order_id).filter(Boolean);
      const allToCheckBarangKeluar = [...new Set([...allResiFromCSV, ...allOrderIdFromCSV])];
      
      const existingInBarangKeluar = await checkExistingInBarangKeluar(allToCheckBarangKeluar, selectedStore);
      
      // Filter: buang item yang sudah ada di barang_keluar
      const skippedByBarangKeluar: any[] = [];
      const afterBarangKeluarFilter = parsedItems.filter(item => {
        const resiUpper = String(item.resi || '').trim().toUpperCase();
        const orderIdUpper = String(item.order_id || '').trim().toUpperCase();
        
        if (existingInBarangKeluar.has(resiUpper) || existingInBarangKeluar.has(orderIdUpper)) {
          skippedByBarangKeluar.push(item);
          return false;
        }
        return true;
      });
      
      if (afterBarangKeluarFilter.length === 0) {
        const skippedResis = [...new Set(skippedByBarangKeluar.map(i => i.resi))].slice(0, 10).join(', ');
        alert(`Semua ${parsedItems.length} resi sudah ada di Barang Keluar (sudah terjual)!\n\nResi: ${skippedResis}...`);
        setLoading(false);
        return;
      }

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
        
        if (s1Data) {
          // Ada di Stage 1, gunakan ecommerce dari sana
          let ecomFromS1 = s1Data.ecommerce || '';
          
          // Jika hanya "EKSPOR" tapi ada negara_ekspor, gabungkan
          if (ecomFromS1 === 'EKSPOR' && s1Data.negara_ekspor) {
            item.ecommerce = `EKSPOR - ${s1Data.negara_ekspor}`;
          } else if (ecomFromS1.startsWith('EKSPOR')) {
            // Sudah format lengkap atau tidak ada negara
            item.ecommerce = ecomFromS1;
          } else {
            // Bukan ekspor, gunakan dari Stage 1
            item.ecommerce = ecomFromS1 || uploadEcommerce;
          }
        } else {
          // Tidak ada di Stage 1, gunakan pilihan user
          if (uploadEcommerce === 'EKSPOR') {
            item.ecommerce = `EKSPOR - ${uploadNegara}`;
          } else {
            item.ecommerce = uploadEcommerce;
          }
        }
        
        item.sub_toko = uploadSubToko;

        return item;
      });

      if (correctedItems.length > 0) {
          const result = await saveCSVToResiItems(correctedItems, selectedStore);
          
          // Gabungkan info skip dari pre-filter dan dari saveCSVToResiItems
          const totalSkipped = skippedByBarangKeluar.length + result.skippedCount;
          const allSkippedResis = [
            ...new Set([
              ...skippedByBarangKeluar.map(i => i.resi),
              ...result.skippedResis
            ])
          ];
          
          if (totalSkipped > 0) {
            // Ada item yang di-skip karena sudah ada di Barang Keluar
            const skippedMsg = allSkippedResis.slice(0, 10).join(', ');
            const moreMsg = allSkippedResis.length > 10 ? ` dan ${allSkippedResis.length - 10} lainnya` : '';
            alert(
              `✅ Berhasil import ${result.count} item sebagai ${uploadEcommerce} (${uploadSubToko}).\n\n` +
              `⚠️ ${totalSkipped} item di-SKIP karena sudah ada di Barang Keluar (sudah terjual/keluar):\n` +
              `${skippedMsg}${moreMsg}`
            );
          } else if (result.success) {
            alert(`✅ Berhasil import ${result.count} item sebagai ${uploadEcommerce} (${uploadSubToko}).`);
          } else {
            alert(result.message);
          }
      } else {
        // Semua item sudah di-filter
        const skippedResis = [...new Set(skippedByBarangKeluar.map(i => i.resi))].slice(0, 10).join(', ');
        alert(`Semua item sudah ada di Barang Keluar!\n\nResi: ${skippedResis}...`);
      }

      await loadSavedDataFromDB();
      
    } catch (err: any) { 
      console.error(err);
      alert(`Error Import: ${err.message}`); 
    } finally { 
      setLoading(false); 
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, colKey: string) => {
    // Navigasi panah seperti Excel
    const colOrder = ['tanggal', 'customer', 'part_number', 'qty_keluar', 'harga_total', 'harga_satuan'];
    const currentColIdx = colOrder.indexOf(colKey);

    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur(); 
      const nextInput = document.getElementById(`input-${rowIndex + 1}-${colKey}`);
      nextInput?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      const prevInput = document.getElementById(`input-${rowIndex - 1}-${colKey}`);
      prevInput?.focus();
    } else if (e.key === 'ArrowRight') {
      const target = e.target as HTMLInputElement;
      if (target.type !== 'text' || target.selectionStart === target.value.length) {
         e.preventDefault();
         const nextCol = colOrder[currentColIdx + 1];
         if (nextCol) document.getElementById(`input-${rowIndex}-${nextCol}`)?.focus();
      }
    } else if (e.key === 'ArrowLeft') {
      const target = e.target as HTMLInputElement;
      if (target.type !== 'text' || target.selectionStart === 0) {
        e.preventDefault();
        const prevCol = colOrder[currentColIdx - 1];
        if (prevCol) document.getElementById(`input-${rowIndex}-${prevCol}`)?.focus();
      }
    }
  };

  const updateRow = (id: string, field: keyof Stage3Row, value: any) => {
    setRows(prev => prev.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === 'harga_total') {
            updated.harga_satuan = updated.qty_keluar > 0 ? updated.harga_total / updated.qty_keluar : 0;
        } else if (field === 'harga_satuan') {
            updated.harga_total = updated.harga_satuan * updated.qty_keluar;
        } else if (field === 'qty_keluar') {
            updated.harga_total = updated.harga_satuan * updated.qty_keluar;
        }
        return updated;
    }));
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
      qty_keluar: 1,
      harga_total: 0,
      harga_satuan: 0,
      no_pesanan: item.order_id || '',
      customer: item.customer || '-',
      is_db_verified: true,
      is_stock_valid: false,
      status_message: 'Butuh Input',
      force_override_double: false  // FITUR 1
    }));
    const currentResis = new Set(rows.map(r => r.resi));
    const newUniqueRows = dbRows.filter(r => !currentResis.has(r.resi));
    // Tambahkan rows baru di AWAL agar yang terbaru di atas
    setRows(prev => [...newUniqueRows, ...prev]);
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
      nama_barang_csv: `${row.nama_barang_csv} (Pecahan 1)`
    };
    const newChildren: Stage3Row[] = [];
    for (let i = 2; i <= splitCount; i++) {
      newChildren.push({
        ...updatedParent,
        id: Math.random().toString(36).substr(2, 9), 
        part_number: '', 
        nama_barang_csv: `${row.nama_barang_csv} (Pecahan ${i})`,
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

  // Handler untuk hapus row - juga hapus dari database
  const handleDeleteRow = async (rowId: string) => {
    // Hapus dari state lokal dulu untuk responsivitas
    setRows(prev => prev.filter(r => r.id !== rowId));
    
    // Jika ID dimulai dengan "db-", berarti sudah ada di database, hapus juga dari sana
    if (rowId.startsWith('db-')) {
      const result = await deleteResiItemById(selectedStore, rowId);
      if (!result.success) {
        console.warn('Gagal hapus dari database:', result.message);
        // Opsional: bisa reload data jika gagal
      }
    }
  };

  const handlePartNumberBlur = async (id: string, sku: string) => {
    if (!sku) return;
    const info = await lookupPartNumberInfo(sku, selectedStore);
    
    let rowToSave: Stage3Row | undefined;
    setRows(prev => {
        const newRows = prev.map(r => {
            if (r.id !== id) return r;
            const stock = info?.quantity || 0;
            const stockValid = stock >= r.qty_keluar;
            
            const updated = {
                ...r,
                brand: info?.brand || '-',
                application: info?.application || '-',
                stock_saat_ini: stock,
                is_stock_valid: stockValid,
                nama_barang_base: info?.name || '',
                status_message: stockValid ? (r.is_db_verified ? 'Ready' : r.status_message) : 'Stok Kurang'
            };
            rowToSave = updated;
            return updated;
        });
        return newRows;
    });

    if (rowToSave) {
        handleSaveRow(rowToSave);
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
    setLoading(true);
    
    // Prepare items dengan nama_pesanan = nama_barang_base (atau csv jika base kosong)
    // Swap brand dan application karena data di database stock terbalik
    const itemsToProcess = validRows.map(r => ({
      ...r,
      nama_pesanan: r.nama_barang_base || r.nama_barang_csv,
      brand: r.application,      // Swap: application di DB sebenarnya adalah brand
      application: r.brand       // Swap: brand di DB sebenarnya adalah application
    }));
    
    const result = await processBarangKeluarBatch(itemsToProcess, selectedStore);
    
    if (result.success || result.processed > 0) {
      // Insert aliases untuk setiap item yang berhasil diproses
      for (const row of validRows) {
        if (row.part_number && row.nama_barang_csv) {
          await insertProductAlias(row.part_number, row.nama_barang_csv);
        }
      }
      
      // Delete processed items from resi_items
      const itemsToDelete = validRows.map(r => ({
        resi: r.resi,
        part_number: r.part_number
      }));
      await deleteProcessedResiItems(selectedStore, itemsToDelete);
      
      alert(`Sukses: ${result.processed} item diproses.`);
      setRows(prev => prev.filter(r => !validRows.find(v => v.id === r.id)));
      if (onRefresh) onRefresh();
    } else { 
      alert(`Error: ${result.errors.join('\n')}`); 
    }
    setLoading(false);
  };

  const displayedRows = rows.filter(row => {
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
  });

  // Sort displayedRows: group by resi, yang terbaru diinput di atas
  // Pecahan harus tetap di bawah parent-nya
  const sortedDisplayedRows = (() => {
    // Step 1: Group rows by resi
    const resiGroups = new Map<string, Stage3Row[]>();
    const resiFirstSeen = new Map<string, number>(); // Track order of first appearance
    
    displayedRows.forEach((row, index) => {
      const resi = row.resi;
      if (!resiGroups.has(resi)) {
        resiGroups.set(resi, []);
        resiFirstSeen.set(resi, index);
      }
      resiGroups.get(resi)!.push(row);
    });
    
    // Step 2: Sort groups by tanggal DESC (most recent first)
    const sortedResiKeys = Array.from(resiGroups.keys()).sort((a, b) => {
      const groupA = resiGroups.get(a)!;
      const groupB = resiGroups.get(b)!;
      // Get the earliest tanggal from each group (parent item)
      const dateA = new Date(groupA[0].tanggal).getTime();
      const dateB = new Date(groupB[0].tanggal).getTime();
      if (dateB !== dateA) return dateB - dateA;
      // If same date, use first seen order (preserve input order)
      return (resiFirstSeen.get(a) || 0) - (resiFirstSeen.get(b) || 0);
    });
    
    // Step 3: Flatten - keep items within each resi group in original order
    const result: Stage3Row[] = [];
    sortedResiKeys.forEach(resi => {
      const group = resiGroups.get(resi)!;
      // Sort within group: pecahan dengan nomor lebih kecil di atas
      group.sort((a, b) => {
        // Extract pecahan number if exists
        const matchA = a.nama_barang_csv.match(/\(Pecahan (\d+)\)/);
        const matchB = b.nama_barang_csv.match(/\(Pecahan (\d+)\)/);
        const numA = matchA ? parseInt(matchA[1]) : 0;
        const numB = matchB ? parseInt(matchB[1]) : 0;
        return numA - numB;
      });
      result.push(...group);
    });
    
    return result;
  })();

  // Helper: Cek apakah semua item dalam satu resi sudah Ready
  const isResiReadyToProcess = (resi: string): boolean => {
    const resiItems = sortedDisplayedRows.filter(r => r.resi === resi);
    return resiItems.length > 0 && resiItems.every(r => 
      r.status_message === 'Ready' || 
      (r.status_message === 'Double' && r.force_override_double)
    );
  };

  // Handler: Proses semua item dalam satu resi
  const handleProcessResi = async (resi: string) => {
    const resiItems = rows.filter(r => r.resi === resi);
    const validItems = resiItems.filter(r => 
      r.status_message === 'Ready' || 
      (r.status_message === 'Double' && r.force_override_double)
    );
    
    if (validItems.length === 0) {
      alert(`Tidak ada item Ready untuk resi ${resi}`);
      return;
    }
    
    if (!confirm(`Proses ${validItems.length} item untuk resi ${resi}?`)) return;
    
    setLoading(true);
    try {
      const itemsToProcess = validItems.map(r => ({
        tanggal: r.tanggal,
        resi: r.resi,
        ecommerce: r.ecommerce,
        sub_toko: r.sub_toko,
        part_number: r.part_number,
        qty_keluar: r.qty_keluar,
        harga_total: r.harga_total,
        customer: r.customer,
        no_pesanan: r.no_pesanan,
        nama_pesanan: r.nama_barang_base || r.nama_barang_csv,
        brand: r.application,      // Swap: application di DB sebenarnya adalah brand
        application: r.brand       // Swap: brand di DB sebenarnya adalah application
      }));
      
      const result = await processBarangKeluarBatch(itemsToProcess, selectedStore);
      
      if (result.processed > 0) {
        // Delete processed items from resi_items table
        const itemsToDelete = validItems.map(r => ({
          id: r.id.replace('db-', ''),
          resi: r.resi,
          part_number: r.part_number
        }));
        await deleteProcessedResiItems(selectedStore, itemsToDelete);
        
        // Remove from local state
        setRows(prev => prev.filter(r => !validItems.find(v => v.id === r.id)));
        
        alert(`✅ Berhasil proses ${result.processed} item untuk resi ${resi}`);
      }
      
      if (result.errors && result.errors.length > 0) {
        alert(`⚠️ Error: ${result.errors.join(', ')}`);
      }
    } catch (e) {
      console.error(e);
      alert('Gagal memproses resi');
    } finally {
      setLoading(false);
    }
  };

  // Track which resi groups have been rendered (for rowSpan)
  const renderedResiGroups = new Set<string>();

  return (
    <div className="bg-gray-900 text-white min-h-screen p-2 pb-20 md:pb-2 text-sm font-sans flex flex-col">
      <datalist id="part-options">
        {partOptions.map((p, idx) => (<option key={idx} value={p} />))}
      </datalist>

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
                
                <div className="hidden md:block h-4 w-px bg-gray-600 mx-1"></div>

                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv, .xlsx, .xls" className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-500 px-3 md:px-4 py-1 rounded text-[10px] md:text-xs flex gap-1 items-center font-bold shadow transition-colors ml-auto md:ml-0">
                    <Upload size={12}/> Import CSV
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
                                            const rowIndex = sortedDisplayedRows.indexOf(r);
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
                                            const foundRowIndex = sortedDisplayedRows.findIndex(row => row.resi === r.resi || row.no_pesanan === r.no_pesanan);
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
                    Total: {sortedDisplayedRows.length}
                </div>
            </div>
        </div>
      </div>

      {/* EXCEL-LIKE TABLE */}
      <div className="flex-1 overflow-x-auto overflow-y-auto border border-gray-600 bg-gray-800 shadow-inner custom-scrollbar">
        <table className="border-collapse text-[10px] md:text-xs min-w-[1000px] md:w-full md:table-fixed">
          <thead className="sticky top-0 z-20 shadow-md">
            <tr className="bg-gray-700 text-gray-200 font-semibold">
              <th className="border border-gray-600 px-1 py-1 text-center w-[55px] md:w-[5%] bg-gray-700">Status</th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[75px] md:w-[6%] bg-gray-700">Tanggal</th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[80px] md:w-[7%] bg-gray-700">Resi</th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[55px] md:w-[5%] bg-gray-700">E-Comm</th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[45px] md:w-[4%] bg-gray-700">Toko</th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[70px] md:w-[7%] bg-gray-600">Customer</th>
              <th className="border border-gray-600 px-1 py-1 text-left border-b-2 border-b-yellow-600/50 w-[90px] md:w-[8%] bg-gray-600">Part No.</th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[180px] md:w-[15%] bg-gray-700">Nama (CSV)</th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[110px] md:w-[9%] bg-gray-700">Nama (Base)</th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[55px] md:w-[5%] bg-gray-700">Brand</th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[70px] md:w-[7%] bg-gray-700">Aplikasi</th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[40px] md:w-[3%] bg-gray-700">Stok</th>
              <th className="border border-gray-600 px-1 py-1 text-center border-b-2 border-b-yellow-600/50 w-[40px] md:w-[3%] bg-gray-600">Qty</th>
              <th className="border border-gray-600 px-1 py-1 text-right border-b-2 border-b-yellow-600/50 w-[70px] md:w-[6%] bg-gray-600">Total</th>
              <th className="border border-gray-600 px-1 py-1 text-right w-[60px] md:w-[5%] bg-gray-700">Satuan</th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[60px] md:w-[5%] bg-gray-700">No. Pesanan</th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[35px] md:w-[2%] bg-gray-700">#</th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[50px] md:w-[3%] bg-green-800">Proses</th>
            </tr>
          </thead>
          <tbody className="bg-gray-900 text-gray-300">
            {sortedDisplayedRows.length === 0 ? (
              <tr><td colSpan={18} className="text-center py-10 text-gray-500 italic">Data Kosong. Silakan Import atau Load Pending.</td></tr>
            ) : (
              sortedDisplayedRows.map((row, idx) => (
                <tr key={row.id} className={`group hover:bg-gray-800 transition-colors ${
                  !row.is_db_verified ? 'bg-red-900/10' : 
                  row.status_message === 'Stok Total Kurang' ? 'bg-pink-900/20' :
                  !row.is_stock_valid ? 'bg-yellow-900/10' : ''
                }`}>
                  
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
                  <td className="border border-gray-600 p-0">
                    <input 
                        id={`input-${idx}-tanggal`} 
                        type="date" 
                        value={row.tanggal} 
                        onChange={(e) => updateRow(row.id, 'tanggal', e.target.value)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'tanggal')} 
                        className="w-full h-full bg-transparent px-1 focus:bg-blue-900/50 outline-none text-center cursor-pointer"
                    />
                  </td>

                  {/* RESI (READONLY) */}
                  <td className="border border-gray-600 px-1 py-1 font-mono text-blue-300 select-all truncate text-[11px]" title={row.resi}>
                    {row.resi}
                  </td>

                  {/* ECOMM & TOKO (FROM UPLOAD/DB) */}
                  <td className="border border-gray-600 px-1 text-center text-[11px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{row.ecommerce}</span>
                      {/* Badge INSTANT di bawah ecommerce jika resi === no_pesanan (kecuali RESELLER dan EKSPOR) */}
                      {row.resi && row.no_pesanan && row.resi === row.no_pesanan && 
                       row.ecommerce !== 'RESELLER' && !row.ecommerce?.startsWith('EKSPOR') && (
                        <span className="px-1 py-0.5 bg-orange-500 text-white text-[8px] font-bold rounded">INSTANT</span>
                      )}
                    </div>
                  </td>
                  <td className="border border-gray-600 px-1 text-center text-[11px]">{row.sub_toko}</td>

                  {/* CUSTOMER (INPUT) */}
                  <td className="border border-gray-600 p-0">
                    <input 
                        id={`input-${idx}-customer`} 
                        type="text"
                        value={row.customer} 
                        onChange={(e) => updateRow(row.id, 'customer', e.target.value)} 
                        onBlur={() => handleSaveRow(row)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'customer')}
                        className="w-full h-full bg-transparent px-1.5 focus:bg-blue-900/50 outline-none text-gray-200 truncate focus:text-clip"
                        placeholder="Customer..."
                    />
                  </td>

                  {/* PART NUMBER (INPUT UTAMA) */}
                  <td className="border border-gray-600 p-0 bg-gray-800/30">
                    <input 
                        id={`input-${idx}-part_number`} 
                        type="text" 
                        list="part-options" 
                        value={row.part_number} 
                        onChange={(e) => updateRow(row.id, 'part_number', e.target.value)} 
                        onBlur={(e) => handlePartNumberBlur(row.id, e.target.value)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'part_number')} 
                        className="w-full h-full bg-transparent px-1.5 focus:bg-blue-900/50 outline-none text-yellow-400 font-mono font-bold placeholder-gray-600" 
                        placeholder="Scan Part..."
                    />
                  </td>

                  {/* NAMA BARANG DARI CSV/EXCEL */}
                  <td className="border border-gray-600 px-1.5 py-1 text-[11px] leading-tight align-middle text-blue-300 bg-blue-900/10">
                    <div className="whitespace-normal break-words" title={row.nama_barang_csv}>
                        {row.nama_barang_csv ? row.nama_barang_csv : <span className="italic text-gray-500">-</span>}
                    </div>
                  </td>

                  {/* NAMA BARANG DARI BASE */}
                  <td className="border border-gray-600 px-1.5 py-1 text-[11px] leading-tight align-middle text-green-300 bg-green-900/10">
                    <div className="line-clamp-2 hover:line-clamp-none max-h-[3.5em] overflow-hidden" title={row.nama_barang_base}>
                        {row.nama_barang_base || <span className="italic text-gray-500">-</span>}
                    </div>
                  </td>

                  {/* BRAND */}
                  <td className="border border-gray-600 px-1 py-1 text-[11px] truncate text-gray-400">{row.application}</td>
                  {/* APPLICATION / MOBIL */}
                  <td className="border border-gray-600 px-1 py-1 text-[11px] truncate text-gray-400">{row.brand}</td>

                  {/* STOK INFO */}
                  <td className={`border border-gray-600 px-1 text-center font-bold ${row.stock_saat_ini < row.qty_keluar ? 'text-red-500 bg-red-900/20' : 'text-green-500'}`}>
                    {row.stock_saat_ini}
                  </td>

                  {/* QTY KELUAR (INPUT) */}
                  <td className="border border-gray-600 p-0">
                    <input 
                        id={`input-${idx}-qty_keluar`} 
                        type="number" 
                        value={row.qty_keluar} 
                        onChange={(e) => updateRow(row.id, 'qty_keluar', parseInt(e.target.value) || 0)} 
                        onBlur={() => handleSaveRow(row)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'qty_keluar')} 
                        className="w-full h-full bg-transparent text-center focus:bg-blue-900/50 outline-none font-bold"
                    />
                  </td>

                  {/* TOTAL HARGA (INPUT) */}
                  <td className="border border-gray-600 p-0">
                    <input 
                        id={`input-${idx}-harga_total`} 
                        type="text" 
                        value={formatCurrency(row.harga_total)} 
                        onChange={(e) => updateRow(row.id, 'harga_total', parseCurrency(e.target.value))} 
                        onBlur={() => handleSaveRow(row)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'harga_total')} 
                        className="w-full h-full bg-transparent text-right px-1 focus:bg-blue-900/50 outline-none font-mono text-yellow-400"
                    />
                  </td>

                  {/* HARGA SATUAN (INPUT) */}
                  <td className="border border-gray-600 p-0">
                    <input 
                        id={`input-${idx}-harga_satuan`} 
                        type="text" 
                        value={formatCurrency(row.harga_satuan)} 
                        onChange={(e) => updateRow(row.id, 'harga_satuan', parseCurrency(e.target.value))} 
                        onBlur={() => handleSaveRow(row)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'harga_satuan')} 
                        className="w-full h-full bg-transparent text-right px-1 focus:bg-blue-900/50 outline-none font-mono text-gray-500 text-[11px]"
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

                  {/* PROSES PER RESI - hanya tampil di row pertama dari setiap resi group */}
                  {(() => {
                    const resiItems = sortedDisplayedRows.filter(r => r.resi === row.resi);
                    const isFirstInGroup = resiItems[0]?.id === row.id;
                    const rowSpan = resiItems.length;
                    const isReady = isResiReadyToProcess(row.resi);
                    
                    if (!isFirstInGroup) return null;
                    
                    return (
                      <td 
                        rowSpan={rowSpan} 
                        className={`border border-gray-600 text-center align-middle ${isReady ? 'bg-green-900/30' : 'bg-gray-800'}`}
                      >
                        <button
                          tabIndex={-1}
                          onClick={() => handleProcessResi(row.resi)}
                          disabled={!isReady || loading}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                            isReady 
                              ? 'bg-green-600 hover:bg-green-500 text-white cursor-pointer' 
                              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          }`}
                          title={isReady ? `Proses ${resiItems.length} item` : 'Belum semua item Ready'}
                        >
                          {loading ? '...' : `✓ ${resiItems.length}`}
                        </button>
                      </td>
                    );
                  })()}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};