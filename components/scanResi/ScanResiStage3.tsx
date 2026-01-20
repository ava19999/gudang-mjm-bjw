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
  getBulkPartNumberInfo
} from '../../services/resiScanService';
import { 
  parseShopeeCSV, 
  parseTikTokCSV, 
  detectCSVPlatform 
} from '../../services/csvParserService';
import { 
  Upload, Save, Trash2, Plus, DownloadCloud, RefreshCw, Filter, CheckCircle, Loader2
} from 'lucide-react';

interface Stage3Row {
  id: string;
  tanggal: string;
  resi: string;
  ecommerce: string;
  sub_toko: string;
  part_number: string;
  nama_pesanan: string; // Nama barang dari database/base
  nama_barang_csv?: string; // Nama barang dari CSV/Excel
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
}

export const ScanResiStage3 = ({ onRefresh }: { onRefresh?: () => void }) => {
  const { selectedStore } = useStore();
  const [rows, setRows] = useState<Stage3Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [partOptions, setPartOptions] = useState<string[]>([]);
  
  // FILTER STATES
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEcommerce, setFilterEcommerce] = useState<string>('');
  const [filterSubToko, setFilterSubToko] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadParts = async () => {
      const parts = await getAvailableParts(selectedStore);
      setPartOptions(parts);
    };
    loadParts();
  }, [selectedStore]);

  useEffect(() => {
    loadSavedDataFromDB();
  }, [selectedStore]);

  const loadSavedDataFromDB = async () => {
    setLoading(true);
    try {
      const savedItems = await fetchPendingCSVItems(selectedStore);
      
      if (savedItems.length > 0) {
        const allResis = savedItems.map((i: any) => i.resi).filter(Boolean);
        const allParts = savedItems.map((i: any) => i.part_number).filter(Boolean);

        const [dbStatus, bulkPartInfo] = await Promise.all([
            checkResiStatus(allResis, selectedStore),
            getBulkPartNumberInfo(allParts, selectedStore)
        ]);

        const statusMap = new Map();
        dbStatus.forEach((d: any) => statusMap.set(d.resi, d));

        const partMap = new Map();
        bulkPartInfo.forEach((p: any) => partMap.set(p.part_number, p));

        const loadedRows: Stage3Row[] = [];

        for (const item of savedItems) {
           const dbRow = statusMap.get(item.resi);
           const partInfo = partMap.get(item.part_number);
           
           let statusMsg = 'Ready';
           let verified = true;
           
           let ecommerceDB = item.ecommerce || '-';
           let subToko = item.toko || (selectedStore === 'mjm' ? 'MJM' : 'BJW');

           if (!dbRow) { 
               statusMsg = 'Belum Scan S1'; verified = false; 
           } else {
               if (!dbRow.stage2_verified || String(dbRow.stage2_verified) !== 'true') { 
                   statusMsg = 'Pending S2'; verified = false; 
               }
           }

           let stock = 0;
           let brand = '';
           let app = '';
           if (partInfo) { 
              stock = partInfo.quantity || 0; 
              brand = partInfo.brand || ''; 
              app = partInfo.application || ''; 
           }
           
           const qty = Number(item.jumlah || item.quantity || 1);
           const stockValid = stock >= qty;
           if (!stockValid && verified) statusMsg = 'Stok Kurang';

           loadedRows.push({
             id: `db-${item.id}`,
             tanggal: item.created_at ? item.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
             resi: item.resi,
             ecommerce: ecommerceDB,
             sub_toko: subToko,
             part_number: item.part_number || '',
             nama_pesanan: partInfo?.name || item.nama_produk || 'Item Database', // dari base
             nama_barang_csv: item.nama_produk || '', // dari CSV/Excel
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
             status_message: statusMsg
           });
        }

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
            nama_produk: row.nama_pesanan,
            jumlah: row.qty_keluar,
            total_harga_produk: row.harga_total
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
            nama_produk: row.nama_pesanan,
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
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const csvText = XLSX.utils.sheet_to_csv(worksheet);

      const platform = detectCSVPlatform(csvText);
      let parsedItems: any[] = [];
      
      if (platform === 'shopee') parsedItems = parseShopeeCSV(csvText);
      else if (platform === 'tiktok') parsedItems = parseTikTokCSV(csvText);
      else { 
        alert('Format File tidak dikenali! Pastikan header kolom "No. Resi" atau "No. Pesanan" ada.'); 
        setLoading(false); 
        return; 
      }

      if (parsedItems.length === 0) {
        alert('Tidak ada data valid (Mungkin status Batal/Belum Bayar?).');
        setLoading(false);
        return;
      }

      const resiList = parsedItems.map(i => i.resi);
      const dbStatus = await checkResiStatus(resiList, selectedStore);
      
      const correctedItems = parsedItems.map(item => {
        const dbRow = dbStatus.find(d => d.resi === item.resi);
        if (dbRow) {
            if (dbRow.ecommerce) item.ecommerce = dbRow.ecommerce; 
            if (dbRow.sub_toko) (item as any).sub_toko = dbRow.sub_toko; 
        }
        return item;
      });

      if (correctedItems.length > 0) {
          await saveCSVToResiItems(correctedItems, selectedStore);
          alert(`Berhasil import ${correctedItems.length} item.`);
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
         // Pindah ke kolom sebelah kanan jika kursor di ujung teks
         e.preventDefault();
         const nextCol = colOrder[currentColIdx + 1];
         if (nextCol) document.getElementById(`input-${rowIndex}-${nextCol}`)?.focus();
      }
    } else if (e.key === 'ArrowLeft') {
      const target = e.target as HTMLInputElement;
      if (target.type !== 'text' || target.selectionStart === 0) {
        // Pindah ke kolom sebelah kiri jika kursor di awal teks
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
      sub_toko: item.sub_toko || 'MJM',
      part_number: '', 
      nama_pesanan: 'Menunggu Input...',
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
      status_message: 'Butuh Input'
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
      nama_pesanan: `${row.nama_pesanan} (Pecahan 1)`
    };
    const newChildren: Stage3Row[] = [];
    for (let i = 2; i <= splitCount; i++) {
      newChildren.push({
        ...updatedParent,
        id: Math.random().toString(36).substr(2, 9), 
        part_number: '', 
        nama_pesanan: `${row.nama_pesanan} (Pecahan ${i})`,
        stock_saat_ini: 0,
        status_message: 'Isi Part Number',
        is_stock_valid: false,
        brand: '',
        application: ''
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
                nama_pesanan: r.nama_pesanan.includes('Menunggu') || r.nama_pesanan === 'Item CSV' || r.nama_pesanan === 'Item Database' ? (info?.name || r.nama_pesanan) : r.nama_pesanan,
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
    const validRows = rows.filter(r => r.is_db_verified && r.is_stock_valid && r.part_number);
    if (validRows.length === 0) { alert("Tidak ada item siap proses (Pastikan Status Hijau)."); return; }
    if (!confirm(`Proses ${validRows.length} item ke Barang Keluar?`)) return;
    setLoading(true);
    const result = await processBarangKeluarBatch(validRows, selectedStore);
    if (result.success) {
      alert(`Sukses: ${result.processed} item diproses.`);
      setRows(prev => prev.filter(r => !validRows.find(v => v.id === r.id)));
      if (onRefresh) onRefresh();
    } else { alert(`Error: ${result.errors.join('\n')}`); }
    setLoading(false);
  };

  const displayedRows = rows.filter(row => {
    if (filterStatus === 'pending_input' && row.status_message !== 'Butuh Input') return false;
    if (filterEcommerce && row.ecommerce !== filterEcommerce) return false;
    if (filterSubToko && row.sub_toko !== filterSubToko) return false;
    return true;
  });

  return (
    <div className="bg-gray-900 text-white h-screen p-2 text-sm font-sans flex flex-col">
      <datalist id="part-options">
        {partOptions.map((p, idx) => (<option key={idx} value={p} />))}
      </datalist>

      {/* HEADER TOOLBAR */}
      <div className="bg-gray-800 p-2 rounded border border-gray-700 mb-2 shadow-sm flex-shrink-0">
        <div className="flex justify-between items-center gap-2 mb-2">
            <div className="flex gap-2 items-center">
                <h1 className="font-bold text-lg flex items-center gap-2 px-2 text-gray-100">
                    <RefreshCw size={18} className="text-green-400"/> STAGE 3
                </h1>
                
                {/* SAVING INDICATOR */}
                <div className="w-24 flex items-center">
                    {savingStatus === 'saving' && (
                        <span className="text-yellow-400 text-xs flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Saving...</span>
                    )}
                    {savingStatus === 'saved' && (
                        <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle size={12}/> Saved</span>
                    )}
                </div>

                <div className="flex gap-1 ml-4 border-l border-gray-600 pl-4">
                    <button onClick={handleLoadPending} className="bg-yellow-700/80 hover:bg-yellow-600 px-3 py-1 rounded text-xs flex gap-1 items-center transition-colors">
                        <DownloadCloud size={14}/> DB Pending
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv, .xlsx, .xls" className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="bg-blue-700/80 hover:bg-blue-600 px-3 py-1 rounded text-xs flex gap-1 items-center transition-colors">
                        <Upload size={14}/> Import Excel/CSV
                    </button>
                </div>
            </div>
            
            <button onClick={handleProcess} className="bg-green-600 hover:bg-green-500 text-white px-6 py-1.5 rounded font-bold shadow-md flex gap-2 items-center text-sm transition-all transform active:scale-95">
                <Save size={16}/> PROSES DATA ({rows.filter(r => r.is_db_verified && r.is_stock_valid && r.part_number).length})
            </button>
        </div>

        {/* FILTER BAR */}
        <div className="flex gap-2 bg-gray-900/50 p-1.5 rounded items-center border border-gray-700/50">
            <Filter size={14} className="text-gray-400 ml-1" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-gray-300 focus:border-blue-500 outline-none">
                <option value="all">Semua Status</option>
                <option value="pending_input">Hanya Butuh Input</option>
            </select>
            <select value={filterEcommerce} onChange={e => setFilterEcommerce(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-gray-300 focus:border-blue-500 outline-none">
                <option value="">Semua Ecommerce</option>
                <option value="SHOPEE">SHOPEE</option>
                <option value="TIKTOK">TIKTOK</option>
                <option value="RESELLER">RESELLER</option>
            </select>
            <div className="ml-auto text-xs text-gray-400 px-2 border-r border-gray-700 mr-2">
                Total: {displayedRows.length} baris
            </div>
        </div>
      </div>

      {/* EXCEL-LIKE TABLE */}
      <div className="flex-1 table-wrapper border border-gray-600 bg-gray-800 shadow-inner custom-scrollbar">
        <table className="border-collapse text-xs" style={{ minWidth: '100%', width: 'max-content' }}>
          <thead className="sticky top-0 z-10 shadow-sm">
            <tr className="bg-gray-700 text-gray-200 font-semibold">
              <th className="border border-gray-600 px-1 py-1 text-center" style={{ minWidth: '4rem', width: '4rem' }}>Status</th>
              <th className="border border-gray-600 px-1 py-1 text-center" style={{ minWidth: '5rem', width: '5rem' }}>Tanggal</th>
              <th className="border border-gray-600 px-1 py-1 text-left" style={{ minWidth: '6rem', width: '6rem' }}>Resi / ID</th>
              <th className="border border-gray-600 px-1 py-1 text-center" style={{ minWidth: '3.5rem', width: '3.5rem' }}>E-Comm</th>
              <th className="border border-gray-600 px-1 py-1 text-center" style={{ minWidth: '3rem', width: '3rem' }}>Toko</th>
              <th className="border border-gray-600 px-1 py-1 text-left bg-gray-700/50" style={{ minWidth: '6rem', width: '8rem' }}>Customer</th>
              <th className="border border-gray-600 px-1 py-1 text-left bg-gray-700/80 border-b-2 border-b-yellow-600/50" style={{ minWidth: '6rem', width: '8rem' }}>Part Number (Input)</th>
              <th className="border border-gray-600 px-1 py-1 text-left" style={{ minWidth: '8rem', width: '12rem' }}>Nama Barang (CSV)</th>
              <th className="border border-gray-600 px-1 py-1 text-left" style={{ minWidth: '8rem', width: '12rem' }}>Nama Barang (Base)</th>
              <th className="border border-gray-600 px-1 py-1 text-left" style={{ minWidth: '3.5rem', width: '5rem' }}>Brand</th>
              <th className="border border-gray-600 px-1 py-1 text-left" style={{ minWidth: '5rem', width: '7rem' }}>Aplikasi / Mobil</th>
              <th className="border border-gray-600 px-1 py-1 text-center" style={{ minWidth: '2.5rem', width: '3rem' }}>Stok</th>
              <th className="border border-gray-600 px-1 py-1 text-center bg-gray-700/80 border-b-2 border-b-yellow-600/50" style={{ minWidth: '2.5rem', width: '3rem' }}>Qty</th>
              <th className="border border-gray-600 px-1 py-1 text-right bg-gray-700/80 border-b-2 border-b-yellow-600/50" style={{ minWidth: '5rem', width: '6rem' }}>Total (Rp)</th>
              <th className="border border-gray-600 px-1 py-1 text-right" style={{ minWidth: '5rem', width: '6rem' }}>Satuan (Rp)</th>
              <th className="border border-gray-600 px-1 py-1 text-left" style={{ minWidth: '5rem', width: '6rem' }}>No. Pesanan</th>
              <th className="border border-gray-600 px-1 py-1 text-center" style={{ minWidth: '2rem', width: '2.5rem' }}>#</th>
            </tr>
          </thead>
          <tbody className="bg-gray-900 text-gray-300">
            {displayedRows.length === 0 ? (
              <tr><td colSpan={15} className="text-center py-10 text-gray-500 italic">Data Kosong. Silakan Import atau Load Pending.</td></tr>
            ) : (
              displayedRows.map((row, idx) => (
                <tr key={row.id} className={`group hover:bg-gray-800 transition-colors ${!row.is_db_verified ? 'bg-red-900/10' : !row.is_stock_valid ? 'bg-yellow-900/10' : ''}`}>
                  
                  {/* STATUS */}
                  <td className="border border-gray-600 p-0 text-center align-middle">
                     <div className={`text-[10px] font-bold py-1 px-0.5 mx-1 rounded mt-1 ${
                        row.status_message === 'Ready' ? 'bg-green-600 text-white' : 
                        row.status_message.includes('Kurang') ? 'bg-red-600 text-white' :
                        'bg-gray-600 text-gray-300'
                     }`}>
                        {row.status_message}
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

                  {/* ECOMM & TOKO */}
                  <td className="border border-gray-600 px-1 text-center text-[11px]">{row.ecommerce}</td>
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
                  <td className="border border-gray-600 px-1.5 py-1 text-[11px] leading-tight align-middle text-gray-300">
                    <div className="line-clamp-2 hover:line-clamp-none max-h-[3.5em] overflow-hidden" title={row.nama_barang_csv}>
                        {row.nama_barang_csv ? row.nama_barang_csv : <span className="italic text-gray-500">-</span>}
                    </div>
                  </td>

                  {/* NAMA BARANG DARI BASE */}
                  <td className="border border-gray-600 px-1.5 py-1 text-[11px] leading-tight align-middle text-yellow-300">
                    <div className="line-clamp-2 hover:line-clamp-none max-h-[3.5em] overflow-hidden" title={row.nama_pesanan}>
                        {row.nama_pesanan}
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