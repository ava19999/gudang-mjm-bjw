// FILE: components/scanResi/ScanResiStage3.tsx
import React, { useState, useRef } from 'react';
import { useStore } from '../../context/StoreContext';
import { 
  checkResiStatus, 
  processBarangKeluarBatch, 
  lookupPartNumberInfo,
  getPendingStage3List // IMPORT BARU
} from '../../services/resiScanService';
import { 
  parseShopeeCSV, 
  parseTikTokCSV, 
  detectCSVPlatform 
} from '../../services/csvParserService';
import { 
  Upload, Save, Trash2, Plus, DownloadCloud, RefreshCw 
} from 'lucide-react';

interface Stage3Row {
  id: string;
  tanggal: string;
  resi: string;
  ecommerce: string;
  sub_toko: string;
  customer: string;
  part_number: string;
  nama_pesanan: string;
  brand: string;
  application: string;
  qty_keluar: number;
  stock_saat_ini: number;
  harga_satuan: number;
  harga_total: number;
  order_id: string;
  is_db_verified: boolean;
  is_stock_valid: boolean;
  status_message: string;
}

export const ScanResiStage3 = ({ onRefresh }: { onRefresh?: () => void }) => {
  const { selectedStore } = useStore();
  const [rows, setRows] = useState<Stage3Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterEcommerce, setFilterEcommerce] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- FITUR BARU: LOAD PENDING FROM DB ---
  const handleLoadPending = async () => {
    setLoading(true);
    const pendingData = await getPendingStage3List(selectedStore);
    
    if (pendingData.length === 0) {
      alert("Tidak ada resi pending (Semua sudah selesai / Belum verifikasi Stage 2)");
      setLoading(false);
      return;
    }

    const dbRows: Stage3Row[] = pendingData.map(item => ({
      id: Math.random().toString(36).substr(2, 9),
      tanggal: new Date(item.stage2_verified_at || item.created_at).toISOString().split('T')[0],
      resi: item.resi,
      ecommerce: item.ecommerce || 'MANUAL',
      sub_toko: item.sub_toko || 'MJM',
      customer: item.customer || '',
      part_number: '', // Butuh input manual
      nama_pesanan: 'Menunggu Input / CSV',
      brand: '',
      application: '',
      qty_keluar: 1,
      stock_saat_ini: 0,
      harga_satuan: 0,
      harga_total: 0,
      order_id: item.order_id || '',
      is_db_verified: true, // Verified karena dari DB
      is_stock_valid: false,
      status_message: 'Butuh Input'
    }));

    // Gabungkan, hindari duplikat resi di tampilan
    const currentResis = new Set(rows.map(r => r.resi));
    const newUniqueRows = dbRows.filter(r => !currentResis.has(r.resi));
    
    setRows(prev => [...prev, ...newUniqueRows]);
    setLoading(false);
    alert(`Berhasil memuat ${newUniqueRows.length} resi pending dari database.`);
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
      else {
        alert('Format CSV tidak dikenali!');
        setLoading(false);
        return;
      }

      const resiList = parsedItems.map(i => i.resi);
      const dbStatus = await checkResiStatus(resiList, selectedStore);

      const newRows: Stage3Row[] = [];
      
      for (const item of parsedItems) {
        const dbRow = dbStatus.find(d => d.resi === item.resi);
        let statusMsg = 'Ready';
        let verified = true;

        if (!dbRow) { statusMsg = 'Belum Scan Stage 1'; verified = false; }
        else if (!dbRow.stage2_verified) { statusMsg = 'Pending Stage 2'; verified = false; }

        let stock = 0;
        let brand = '';
        if (item.part_number) {
          const partInfo = await lookupPartNumberInfo(item.part_number, selectedStore);
          if (partInfo) { stock = partInfo.quantity || 0; brand = partInfo.brand || ''; }
        }

        const stockValid = stock >= item.quantity;
        if (!stockValid && verified) statusMsg = 'Stok Kurang!';

        // Cek apakah resi sudah ada di tabel (misal dari Load Pending) -> Update isinya
        const existingIdx = rows.findIndex(r => r.resi === item.resi && r.status_message === 'Butuh Input');
        
        const rowData: Stage3Row = {
          id: existingIdx !== -1 ? rows[existingIdx].id : Math.random().toString(36).substr(2, 9),
          tanggal: new Date().toISOString().split('T')[0],
          resi: item.resi,
          ecommerce: platform.toUpperCase(),
          sub_toko: selectedStore === 'mjm' ? 'MJM' : 'BJW',
          customer: item.customer || '-',
          part_number: item.part_number || '',
          nama_pesanan: item.product_name,
          brand: brand,
          application: '',
          qty_keluar: item.quantity,
          stock_saat_ini: stock,
          harga_satuan: item.quantity > 0 ? (item.total_price / item.quantity) : 0,
          harga_total: item.total_price,
          order_id: item.order_id,
          is_db_verified: verified,
          is_stock_valid: stockValid,
          status_message: statusMsg
        };

        if (existingIdx !== -1) {
           setRows(prev => {
             const newArr = [...prev];
             newArr[existingIdx] = rowData;
             return newArr;
           });
        } else {
           newRows.push(rowData);
        }
      }

      setRows(prev => [...prev, ...newRows]);
    } catch (err: any) {
      alert(`Error CSV: ${err.message}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
      nama_pesanan: `${row.nama_pesanan} (Part 1/${splitCount})`
    };

    const newChildren: Stage3Row[] = [];
    for (let i = 2; i <= splitCount; i++) {
      newChildren.push({
        ...updatedParent,
        id: Math.random().toString(36).substr(2, 9),
        part_number: '', 
        nama_pesanan: `${row.nama_pesanan} (Part ${i}/${splitCount})`,
        stock_saat_ini: 0,
        status_message: 'Isi Part Number',
        is_stock_valid: false
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

  const handleProcess = async () => {
    const validRows = rows.filter(r => r.is_db_verified && r.is_stock_valid && r.part_number);
    if (validRows.length === 0) {
      alert("Tidak ada item siap proses (Cek status hijau).");
      return;
    }
    if (!confirm(`Proses ${validRows.length} item?`)) return;

    setLoading(true);
    const result = await processBarangKeluarBatch(validRows, selectedStore);
    if (result.success) {
      alert(`Sukses memproses ${result.processed} item.`);
      setRows(prev => prev.filter(r => !validRows.find(v => v.id === r.id)));
      if (onRefresh) onRefresh();
    } else {
      alert(`Error: ${result.errors.join('\n')}`);
    }
    setLoading(false);
  };

  const displayedRows = rows.filter(row => !filterEcommerce || row.ecommerce === filterEcommerce);

  return (
    <div className="bg-gray-900 text-white min-h-screen p-4">
      <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 mb-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Upload className="text-green-400" /> Stage 3: Data Entry
          </h1>
          <p className="text-gray-400 text-sm">Finalisasi data barang keluar (CSV / Manual)</p>
        </div>
        
        <div className="flex gap-2">
          {/* TOMBOL BARU: LOAD PENDING */}
          <button 
            onClick={handleLoadPending} 
            disabled={loading}
            className="bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 text-sm"
          >
            <DownloadCloud size={16} /> Ambil Data Pending (DB)
          </button>

          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 text-sm">
            <Upload size={16} /> Import CSV
          </button>
          
          <button onClick={handleProcess} disabled={loading} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 text-sm">
            <Save size={16} /> Proses ({rows.filter(r => r.is_db_verified && r.is_stock_valid && r.part_number).length})
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <select value={filterEcommerce} onChange={e => setFilterEcommerce(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
          <option value="">Semua E-commerce</option>
          <option value="SHOPEE">SHOPEE</option>
          <option value="TIKTOK">TIKTOK</option>
        </select>
        <button onClick={() => setRows([])} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm flex items-center gap-1">
          <RefreshCw size={14} /> Clear Table
        </button>
      </div>

      <div className="overflow-x-auto bg-gray-800 rounded-xl border border-gray-700 shadow-xl">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="bg-gray-750 text-gray-300 uppercase font-bold border-b border-gray-600">
            <tr>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Resi</th>
              <th className="px-4 py-3">Part Number</th>
              <th className="px-4 py-3">Nama Barang</th>
              <th className="px-4 py-3 text-center">Qty</th>
              <th className="px-4 py-3 text-right">Harga Total</th>
              <th className="px-4 py-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {displayedRows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-500">
                Data kosong. Klik <b>"Ambil Data Pending"</b> atau <b>"Import CSV"</b>.
              </td></tr>
            ) : (
              displayedRows.map((row) => (
                <tr key={row.id} className={`hover:bg-gray-700/50 transition-colors ${!row.is_db_verified ? 'bg-red-900/10' : !row.is_stock_valid ? 'bg-yellow-900/10' : ''}`}>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${
                      row.is_db_verified && row.is_stock_valid && row.part_number
                        ? 'bg-green-900/50 text-green-300 border-green-700'
                        : 'bg-red-900/50 text-red-300 border-red-700'
                    }`}>
                      {row.status_message}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-300">{row.resi}</td>
                  <td className="px-4 py-3">
                    <input 
                      type="text" 
                      value={row.part_number}
                      onChange={(e) => setRows(prev => prev.map(p => p.id === row.id ? {...p, part_number: e.target.value} : p))}
                      onBlur={async (e) => {
                         if(!e.target.value) return;
                         const info = await lookupPartNumberInfo(e.target.value, selectedStore);
                         setRows(prev => prev.map(p => p.id === row.id ? {
                            ...p, 
                            stock_saat_ini: info?.quantity || 0, 
                            brand: info?.brand || '',
                            nama_pesanan: p.nama_pesanan.includes('Menunggu') ? (info?.name || p.nama_pesanan) : p.nama_pesanan,
                            is_stock_valid: (info?.quantity || 0) >= p.qty_keluar,
                            status_message: (info?.quantity || 0) >= p.qty_keluar ? 'Ready' : 'Stok Kurang'
                        } : p));
                      }}
                      className="bg-gray-900 border border-gray-600 rounded px-2 py-1 w-36 focus:border-blue-500 outline-none text-blue-300 font-mono"
                      placeholder="Input Part..."
                    />
                    <div className="text-[10px] text-gray-500 mt-1">Stok: {row.stock_saat_ini}</div>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate text-gray-300">{row.nama_pesanan}</td>
                  <td className="px-4 py-3 text-center">
                    <input type="number" value={row.qty_keluar} 
                      onChange={(e) => setRows(prev => prev.map(p => p.id === row.id ? {...p, qty_keluar: parseInt(e.target.value)||1} : p))}
                      className="w-12 bg-gray-900 border border-gray-600 rounded text-center"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input type="number" value={row.harga_total} 
                      onChange={(e) => setRows(prev => prev.map(p => p.id === row.id ? {...p, harga_total: parseInt(e.target.value)||0} : p))}
                      className="w-24 bg-gray-900 border border-gray-600 rounded text-right"
                    />
                  </td>
                  <td className="px-4 py-3 text-center flex justify-center gap-2">
                    <button onClick={() => handleSplit(row.id)} className="text-blue-400 bg-blue-900/30 p-1.5 rounded hover:bg-blue-800"><Plus size={16} /></button>
                    <button onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))} className="text-red-400 bg-red-900/30 p-1.5 rounded hover:bg-red-800"><Trash2 size={16} /></button>
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