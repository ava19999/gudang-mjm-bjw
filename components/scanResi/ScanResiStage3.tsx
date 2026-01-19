// FILE: components/scanResi/ScanResiStage3.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../context/StoreContext';
import { 
  checkResiStatus, 
  processBarangKeluarBatch, 
  lookupPartNumberInfo,
  getPendingStage3List,
  getAvailableParts,
  saveCSVToResiItems,
  fetchPendingCSVItems,
  updateResiItem,
  getBulkPartNumberInfo // <--- FUNGSI OPTIMASI
} from '../../services/resiScanService';
import { 
  parseShopeeCSV, 
  parseTikTokCSV, 
  detectCSVPlatform 
} from '../../services/csvParserService';
import { 
  Upload, Save, Trash2, Plus, DownloadCloud, RefreshCw, Filter 
} from 'lucide-react';

interface Stage3Row {
  id: string;
  tanggal: string;
  resi: string;
  ecommerce: string;
  sub_toko: string;
  part_number: string;
  nama_pesanan: string;
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

  // LOAD DATA DARI DB SAAT REFRESH / PINDAH TAB
  useEffect(() => {
    loadSavedDataFromDB();
  }, [selectedStore]);

  // --- OPTIMASI SPEED: LOAD BULK ---
  const loadSavedDataFromDB = async () => {
    setLoading(true);
    try {
      // 1. Ambil data CSV pending (Cepat karena Index)
      const savedItems = await fetchPendingCSVItems(selectedStore);
      
      if (savedItems.length > 0) {
        // 2. Kumpulkan Resi & Part untuk Bulk Query
        const allResis = savedItems.map((i: any) => i.resi).filter(Boolean);
        const allParts = savedItems.map((i: any) => i.part_number).filter(Boolean);

        // 3. Request Paralel (Cuma 2 request ke server)
        const [dbStatus, bulkPartInfo] = await Promise.all([
            checkResiStatus(allResis, selectedStore),
            getBulkPartNumberInfo(allParts, selectedStore)
        ]);

        // 4. Map untuk pencarian instan (O(1))
        const statusMap = new Map();
        dbStatus.forEach((d: any) => statusMap.set(d.resi, d));

        const partMap = new Map();
        bulkPartInfo.forEach((p: any) => partMap.set(p.part_number, p));

        const loadedRows: Stage3Row[] = [];

        // 5. Loop di memori (Super Cepat)
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
             nama_pesanan: item.nama_produk || 'Item Database',
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
            const currentIds = new Set(prev.map(r => r.resi + r.part_number));
            const uniqueNew = loadedRows.filter(r => !currentIds.has(r.resi + r.part_number));
            return [...prev, ...uniqueNew];
        });
      }
    } catch (e) {
      console.error("Error loading saved items:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRow = async (row: Stage3Row) => {
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
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const platform = detectCSVPlatform(text);
      let parsedItems: any[] = [];
      if (platform === 'shopee') parsedItems = parseShopeeCSV(text);
      else if (platform === 'tiktok') parsedItems = parseTikTokCSV(text);
      else { alert('Format CSV tidak dikenali!'); setLoading(false); return; }

      // 1. Ambil list resi & Cek DB (Optimasi)
      const resiList = parsedItems.map(i => i.resi);
      const dbStatus = await checkResiStatus(resiList, selectedStore);
      
      // 2. Koreksi Data dengan DB (di Memori)
      const correctedItems = parsedItems.map(item => {
        const dbRow = dbStatus.find(d => d.resi === item.resi);
        if (dbRow) {
            if (dbRow.ecommerce) item.ecommerce = dbRow.ecommerce; 
            if (dbRow.sub_toko) (item as any).sub_toko = dbRow.sub_toko; 
        }
        return item;
      });

      // 3. Simpan ke DB
      if (correctedItems.length > 0) {
          try {
             const saveResult = await saveCSVToResiItems(correctedItems, selectedStore);
             if (!saveResult.success) {
                 console.warn("Gagal simpan CSV ke DB:", saveResult.message);
                 alert(`Gagal simpan ke database: ${saveResult.message}`);
             }
          } catch (dbErr: any) { console.error(dbErr); }
      }

      // 4. Reload Data (Optimasi)
      await loadSavedDataFromDB();
      
    } catch (err: any) { alert(`Error CSV: ${err.message}`); } 
    finally { setLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, colKey: string) => {
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
    <div className="bg-gray-900 text-white min-h-screen p-2 text-sm font-sans">
      <datalist id="part-options">
        {partOptions.map((p, idx) => (<option key={idx} value={p} />))}
      </datalist>

      {/* HEADER */}
      <div className="bg-gray-800 p-2 rounded border border-gray-700 mb-2">
        <div className="flex justify-between items-center mb-2">
            <div className="flex gap-2 items-center">
                <h1 className="font-bold text-lg flex items-center gap-2 px-2">
                    <RefreshCw size={18} className="text-green-400"/> STAGE 3 INPUT
                </h1>
                <button onClick={handleLoadPending} className="bg-yellow-700 hover:bg-yellow-600 px-3 py-1 rounded flex gap-1 items-center">
                    <DownloadCloud size={14}/> Pending (DB)
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded flex gap-1 items-center">
                    <Upload size={14}/> Import CSV
                </button>
            </div>
            <button onClick={handleProcess} className="bg-green-700 hover:bg-green-600 px-4 py-1 rounded font-bold flex gap-1 items-center">
                <Save size={14}/> PROSES ({rows.filter(r => r.is_db_verified && r.is_stock_valid && r.part_number).length})
            </button>
        </div>

        {/* FILTER BAR */}
        <div className="flex gap-2 bg-gray-900 p-2 rounded items-center">
            <Filter size={16} className="text-gray-400 mr-2" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs">
                <option value="all">Semua Status</option>
                <option value="pending_input">Hanya Butuh Input</option>
            </select>
            <select value={filterEcommerce} onChange={e => setFilterEcommerce(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs">
                <option value="">Semua Ecommerce</option>
                <option value="SHOPEE">SHOPEE</option>
                <option value="TIKTOK">TIKTOK</option>
                <option value="RESELLER">RESELLER</option>
            </select>
            <select value={filterSubToko} onChange={e => setFilterSubToko(e.target.value)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs">
                <option value="">Semua Toko</option>
                <option value="MJM">MJM</option>
                <option value="BJW">BJW</option>
            </select>
            <div className="ml-auto text-xs text-gray-400">Menampilkan {displayedRows.length} baris</div>
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto border border-gray-600 bg-gray-900 select-none">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-700 text-gray-200">
              <th className="border border-gray-600 px-2 py-1 w-20">STATUS</th>
              <th className="border border-gray-600 px-1 py-1 w-20">TANGGAL</th>
              <th className="border border-gray-600 px-1 py-1 w-28">RESI</th>
              <th className="border border-gray-600 px-1 py-1 w-16">E-COMM</th>
              <th className="border border-gray-600 px-1 py-1 w-12">TOKO</th>
              <th className="border border-gray-600 px-1 py-1 w-32 bg-gray-750">CUSTOMER (Edit)</th>
              <th className="border border-gray-600 px-1 py-1 w-32 bg-gray-800">PART NUMBER (Edit)</th>
              <th className="border border-gray-600 px-1 py-1 min-w-[300px]">NAMA PESANAN</th>
              <th className="border border-gray-600 px-1 py-1 w-20">BRAND</th>
              <th className="border border-gray-600 px-1 py-1 w-20">APP</th>
              <th className="border border-gray-600 px-1 py-1 w-12 text-center">STOK</th>
              <th className="border border-gray-600 px-1 py-1 w-12 text-center">QTY</th>
              <th className="border border-gray-600 px-1 py-1 w-24 text-right bg-gray-800">TOTAL (Edit)</th>
              <th className="border border-gray-600 px-1 py-1 w-24 text-right bg-gray-800">SATUAN (Edit)</th>
              <th className="border border-gray-600 px-1 py-1 w-24">NO PESANAN</th>
              <th className="border border-gray-600 px-1 py-1 w-10 text-center">AKSI</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr><td colSpan={16} className="text-center py-10 text-gray-500 italic">Data Kosong.</td></tr>
            ) : (
              displayedRows.map((row, idx) => (
                <tr key={row.id} className={`hover:bg-gray-800 ${!row.is_db_verified ? 'bg-red-900/20' : !row.is_stock_valid ? 'bg-yellow-900/20' : ''}`}>
                  <td className="border border-gray-600 px-1 text-center">
                    <span className={`px-1 rounded text-[10px] font-bold ${row.is_db_verified && row.is_stock_valid && row.part_number ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{row.status_message}</span>
                  </td>
                  <td className="border border-gray-600 px-1"><input id={`input-${idx}-tanggal`} type="date" value={row.tanggal} onChange={(e) => updateRow(row.id, 'tanggal', e.target.value)} onKeyDown={(e) => handleKeyDown(e, idx, 'tanggal')} className="bg-transparent w-full h-full focus:outline-none text-gray-300"/></td>
                  <td className="border border-gray-600 px-1 font-mono text-blue-300 truncate" title={row.resi}>{row.resi}</td>
                  <td className="border border-gray-600 px-1 text-center">{row.ecommerce}</td>
                  <td className="border border-gray-600 px-1 text-center">{row.sub_toko}</td>

                  {/* CUSTOMER */}
                  <td className="border border-gray-600 p-0">
                    <input 
                        id={`input-${idx}-customer`} 
                        type="text" 
                        value={row.customer} 
                        onChange={(e) => updateRow(row.id, 'customer', e.target.value)} 
                        onBlur={() => handleSaveRow(row)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'customer')} 
                        className="w-full h-full px-2 py-1 bg-gray-800 focus:bg-blue-900 focus:outline-none text-white truncate" 
                        placeholder="Customer"
                    />
                  </td>

                  {/* PART NUMBER */}
                  <td className="border border-gray-600 p-0">
                    <input 
                        id={`input-${idx}-part_number`} 
                        type="text" 
                        list="part-options" 
                        value={row.part_number} 
                        onChange={(e) => updateRow(row.id, 'part_number', e.target.value)} 
                        onBlur={(e) => handlePartNumberBlur(row.id, e.target.value)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'part_number')} 
                        className="w-full h-full px-2 py-1 bg-gray-800 focus:bg-blue-900 focus:outline-none text-yellow-300 font-mono font-bold" 
                        placeholder="Input Part..."
                    />
                  </td>

                  <td className="border border-gray-600 px-1 whitespace-normal break-words leading-tight" title={row.nama_pesanan}>{row.nama_pesanan}</td>
                  <td className="border border-gray-600 px-1 text-gray-400">{row.brand}</td>
                  <td className="border border-gray-600 px-1 text-gray-400 truncate max-w-[80px]">{row.application}</td>
                  <td className={`border border-gray-600 px-1 text-center font-bold ${row.stock_saat_ini < row.qty_keluar ? 'text-red-500' : 'text-green-400'}`}>{row.stock_saat_ini}</td>

                  {/* QTY KELUAR */}
                  <td className="border border-gray-600 p-0">
                    <input 
                        id={`input-${idx}-qty_keluar`} 
                        type="number" 
                        value={row.qty_keluar} 
                        onChange={(e) => updateRow(row.id, 'qty_keluar', parseInt(e.target.value) || 0)} 
                        onBlur={() => handleSaveRow(row)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'qty_keluar')} 
                        className="w-full h-full text-center bg-transparent focus:bg-blue-900 focus:outline-none"
                    />
                  </td>

                  {/* HARGA TOTAL */}
                  <td className="border border-gray-600 p-0">
                    <input 
                        id={`input-${idx}-harga_total`} 
                        type="number" 
                        value={row.harga_total} 
                        onChange={(e) => updateRow(row.id, 'harga_total', parseInt(e.target.value) || 0)} 
                        onBlur={() => handleSaveRow(row)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'harga_total')} 
                        className="w-full h-full text-right px-1 bg-transparent focus:bg-blue-900 focus:outline-none font-mono"
                    />
                  </td>

                  {/* HARGA SATUAN */}
                  <td className="border border-gray-600 p-0">
                    <input 
                        id={`input-${idx}-harga_satuan`} 
                        type="number" 
                        value={row.harga_satuan} 
                        onChange={(e) => updateRow(row.id, 'harga_satuan', parseInt(e.target.value) || 0)} 
                        onBlur={() => handleSaveRow(row)} 
                        onKeyDown={(e) => handleKeyDown(e, idx, 'harga_satuan')} 
                        className="w-full h-full text-right px-1 bg-transparent focus:bg-blue-900 focus:outline-none font-mono text-gray-300"
                    />
                  </td>

                  <td className="border border-gray-600 px-1 truncate max-w-[100px]" title={row.no_pesanan}>{row.no_pesanan}</td>
                  <td className="border border-gray-600 text-center">
                    <div className="flex justify-center gap-1">
                      <button tabIndex={-1} onClick={() => handleSplit(row.id)} className="text-blue-400 hover:text-white" title="Split"><Plus size={14}/></button>
                      <button tabIndex={-1} onClick={() => setRows(p => p.filter(r => r.id !== row.id))} className="text-red-400 hover:text-white" title="Hapus"><Trash2 size={14}/></button>
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