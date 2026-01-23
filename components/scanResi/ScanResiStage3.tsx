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
  checkResiOrOrderStatus,
  getStage1ResiList
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

        // Map by resi AND no_pesanan
        const statusMapByResi = new Map();
        const statusMapByOrder = new Map();
        dbStatus.forEach((d: any) => {
          if (d.resi) statusMapByResi.set(d.resi, d);
          if (d.no_pesanan) statusMapByOrder.set(String(d.no_pesanan), d);
        });

        const partMap = new Map();
        bulkPartInfo.forEach((p: any) => partMap.set(p.part_number, p));

        const loadedRows: Stage3Row[] = [];
        
        // Track untuk deteksi duplikat
        const seenKeys = new Set<string>();

        for (const item of savedItems) {
           // Cari di Stage 1 by resi ATAU by order_id (untuk instant/sameday)
           let dbRow = statusMapByResi.get(item.resi);
           if (!dbRow && item.order_id) {
             dbRow = statusMapByOrder.get(String(item.order_id));
           }
           
           const partInfo = partMap.get(item.part_number);
           
           let statusMsg = 'Ready';
           let verified = true;
           
           // Prioritas Ecom/Toko: Dari Item CSV -> Dari DB Stage 1 -> Default berdasarkan selectedStore
           let ecommerceDB = item.ecommerce || (dbRow?.ecommerce) || '-';
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

        setRows(prev => {
            const newMap = new Map();
            loadedRows.forEach(r => newMap.set(r.resi + r.part_number, r));
            const mergedRows = prev.map(existingRow => {
                const key = existingRow.resi + existingRow.part_number;
                if (newMap.has(key)) {
                    const freshData = newMap.get(key);
                    newMap.delete(key);
                    return freshData;
                }
                return existingRow;
            });
            return [...mergedRows, ...Array.from(newMap.values()) as Stage3Row[]];
        });
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

      // Check status di DB Stage 1 (Opsional, untuk info saja)
      // Kita akan gunakan input User untuk Ecommerce & Sub Toko
      const resiList = parsedItems.map(i => i.resi);
      // const dbStatus = await checkResiStatus(resiList, selectedStore);
      
      const correctedItems = parsedItems.map(item => {
        // APPLY USER SELECTION HERE (OVERRIDE DETECTED / DB)
        item.ecommerce = uploadEcommerce;
        item.sub_toko = uploadSubToko;
        
        // Handle Ekspor (tambah suffix negara)
        if (uploadEcommerce === 'EKSPOR') {
            item.ecommerce = `EKSPOR - ${uploadNegara}`;
        }

        return item;
      });

      if (correctedItems.length > 0) {
          await saveCSVToResiItems(correctedItems, selectedStore);
          alert(`Berhasil import ${correctedItems.length} item sebagai ${uploadEcommerce} (${uploadSubToko}).`);
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
    const itemsToProcess = validRows.map(r => ({
      ...r,
      nama_pesanan: r.nama_barang_base || r.nama_barang_csv
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
    if (filterEcommerce && row.ecommerce !== filterEcommerce) return false;
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
      const matchResi = row.resi.toLowerCase().includes(query);
      const matchOrder = row.no_pesanan && row.no_pesanan.toLowerCase().includes(query);
      const matchCustomer = row.customer && row.customer.toLowerCase().includes(query);
      const matchPart = row.part_number && row.part_number.toLowerCase().includes(query);
      if (!matchResi && !matchOrder && !matchCustomer && !matchPart) return false;
    }
    
    return true;
  });

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
                
                {/* SELECTOR E-COMMERCE */}
                <select 
                    value={uploadEcommerce} 
                    onChange={e => setUploadEcommerce(e.target.value as EcommercePlatform)}
                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-[10px] md:text-xs outline-none focus:ring-1 focus:ring-blue-500 flex-shrink-0"
                >
                    <option value="SHOPEE">SHOPEE</option>
                    <option value="TIKTOK">TIKTOK</option>
                    <option value="KILAT">KILAT</option>
                    <option value="RESELLER">RESELLER</option>
                    <option value="EKSPOR">EKSPOR</option>
                </select>

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
                
                {/* FILTER ECOMMERCE */}
                <select value={filterEcommerce} onChange={e => setFilterEcommerce(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs text-gray-300 focus:border-blue-500 outline-none flex-shrink-0">
                    <option value="">Semua Ecommerce</option>
                    <option value="SHOPEE">SHOPEE</option>
                    <option value="TIKTOK">TIKTOK</option>
                    <option value="RESELLER">RESELLER</option>
                    <option value="EKSPOR">EKSPOR</option>
                </select>
                
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
                                        r.resi.toLowerCase().includes(resiSearchQuery.toLowerCase()) ||
                                        (r.no_pesanan && r.no_pesanan.toLowerCase().includes(resiSearchQuery.toLowerCase())) ||
                                        (r.customer && r.customer.toLowerCase().includes(resiSearchQuery.toLowerCase())) ||
                                        (r.part_number && r.part_number.toLowerCase().includes(resiSearchQuery.toLowerCase()))
                                    )
                                );
                                return filteredTableRows.length > 0 && (
                                    <>
                                        <div className="p-1.5 text-[9px] text-green-400 border-b border-gray-700 bg-green-900/20 font-semibold sticky top-0 z-10">
                                            📋 Hasil di Tabel S3 ({filteredTableRows.length})
                                        </div>
                                        {filteredTableRows.slice(0, 20).map((r, i) => {
                                            const rowIndex = displayedRows.indexOf(r);
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
                                    r.resi.toLowerCase().includes(resiSearchQuery.toLowerCase()) ||
                                    (r.no_pesanan && r.no_pesanan.toLowerCase().includes(resiSearchQuery.toLowerCase()))
                                ).length})
                            </div>
                            {stage1ResiList
                                .filter(r => 
                                    !resiSearchQuery || 
                                    r.resi.toLowerCase().includes(resiSearchQuery.toLowerCase()) ||
                                    (r.no_pesanan && r.no_pesanan.toLowerCase().includes(resiSearchQuery.toLowerCase()))
                                )
                                .slice(0, 30)
                                .map((r, i) => (
                                    <div 
                                        key={`s1-${i}`} 
                                        className="px-2 py-1.5 hover:bg-blue-900/30 cursor-pointer border-b border-gray-700/50 text-[10px]"
                                        onClick={() => {
                                            // Cek apakah resi ini sudah ada di tabel S3
                                            const foundRowIndex = displayedRows.findIndex(row => row.resi === r.resi || row.no_pesanan === r.no_pesanan);
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
              <th className="border border-gray-600 px-1 py-1 text-left w-[110px] md:w-[11%] bg-gray-700">Nama (CSV)</th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[110px] md:w-[11%] bg-gray-700">Nama (Base)</th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[55px] md:w-[5%] bg-gray-700">Brand</th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[70px] md:w-[7%] bg-gray-700">Aplikasi</th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[40px] md:w-[3%] bg-gray-700">Stok</th>
              <th className="border border-gray-600 px-1 py-1 text-center border-b-2 border-b-yellow-600/50 w-[40px] md:w-[3%] bg-gray-600">Qty</th>
              <th className="border border-gray-600 px-1 py-1 text-right border-b-2 border-b-yellow-600/50 w-[70px] md:w-[6%] bg-gray-600">Total</th>
              <th className="border border-gray-600 px-1 py-1 text-right w-[60px] md:w-[5%] bg-gray-700">Satuan</th>
              <th className="border border-gray-600 px-1 py-1 text-left w-[60px] md:w-[5%] bg-gray-700">No. Pesanan</th>
              <th className="border border-gray-600 px-1 py-1 text-center w-[35px] md:w-[2%] bg-gray-700">#</th>
            </tr>
          </thead>
          <tbody className="bg-gray-900 text-gray-300">
            {displayedRows.length === 0 ? (
              <tr><td colSpan={17} className="text-center py-10 text-gray-500 italic">Data Kosong. Silakan Import atau Load Pending.</td></tr>
            ) : (
              displayedRows.map((row, idx) => (
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
                    <div className="line-clamp-2 hover:line-clamp-none max-h-[3.5em] overflow-hidden" title={row.nama_barang_csv}>
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
                  <td className="border border-gray-600 px-1 py-1 text-[11px] truncate text-gray-400">{row.brand}</td>
                  {/* APPLICATION / MOBIL */}
                  <td className="border border-gray-600 px-1 py-1 text-[11px] truncate text-gray-400">{row.application}</td>

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
                        type="number" 
                        value={row.harga_total} 
                        onChange={(e) => updateRow(row.id, 'harga_total', parseInt(e.target.value) || 0)} 
                        onBlur={() => handleSaveRow(row)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'harga_total')} 
                        className="w-full h-full bg-transparent text-right px-1 focus:bg-blue-900/50 outline-none font-mono text-gray-300"
                    />
                  </td>

                  {/* HARGA SATUAN (INPUT) */}
                  <td className="border border-gray-600 p-0">
                    <input 
                        id={`input-${idx}-harga_satuan`} 
                        type="number" 
                        value={row.harga_satuan} 
                        onChange={(e) => updateRow(row.id, 'harga_satuan', parseInt(e.target.value) || 0)} 
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
                      <button tabIndex={-1} onClick={() => setRows(p => p.filter(r => r.id !== row.id))} className="text-red-400 hover:text-white hover:bg-red-700 rounded p-0.5 transition-colors" title="Hapus Baris"><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};