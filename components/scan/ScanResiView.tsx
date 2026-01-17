// FILE: components/scan/ScanResiView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Camera, Upload, Plus, Trash2, Save, Search } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { 
  EcommerceType, 
  SubTokoType, 
  NegaraEksporType,
  OnlineOrderRow,
  ResiItemEntry,
  CSVImportRow 
} from '../../types';
import {
  saveScanResiEntry,
  batchSaveScanResiEntries,
  checkDuplicateResi,
  getProductByPartNumber,
  fetchScanResiEntries,
  deleteScanResiEntry
} from '../../services/supabaseService';

interface ScanResiViewProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onRefresh?: () => void;
}

const ECOMMERCE_OPTIONS: { value: EcommerceType; label: string; subs: SubTokoType[] }[] = [
  { value: 'TIKTOK', label: 'TikTok Shop', subs: ['LARIS', 'MJM', 'BJW'] },
  { value: 'SHOPEE', label: 'Shopee', subs: ['LARIS', 'MJM', 'BJW'] },
  { value: 'KILAT', label: 'Kilat', subs: ['MJM', 'BJW', 'LARIS'] },
  { value: 'RESELLER', label: 'Reseller', subs: [] },
  { value: 'EKSPOR', label: 'Ekspor', subs: [] }
];

const NEGARA_OPTIONS: NegaraEksporType[] = ['PH', 'MY', 'SG', 'HK'];

export const ScanResiView: React.FC<ScanResiViewProps> = ({ showToast, onRefresh }) => {
  const { selectedStore } = useStore();
  const [ecommerce, setEcommerce] = useState<EcommerceType>('SHOPEE');
  const [subToko, setSubToko] = useState<SubTokoType>('MJM');
  const [negara, setNegara] = useState<NegaraEksporType>('PH');
  const [currentResi, setCurrentResi] = useState('');
  const [currentCustomer, setCurrentCustomer] = useState('');
  const [items, setItems] = useState<ResiItemEntry[]>([{
    part_number: '',
    nama_barang: '',
    brand: '',
    application: '',
    quantity: 1,
    harga_satuan: 0,
    harga_total: 0
  }]);
  const [scannedResiList, setScannedResiList] = useState<OnlineOrderRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanMode, setScanMode] = useState<'manual' | 'camera' | 'csv'>('manual');
  const resiInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadScannedResi();
  }, [selectedStore]);

  const loadScannedResi = async () => {
    const entries = await fetchScanResiEntries(selectedStore, 'scanned');
    setScannedResiList(entries);
  };

  const handleResiScan = async (scannedValue: string) => {
    const trimmedResi = scannedValue.trim();
    if (!trimmedResi) return;

    setCurrentResi(trimmedResi);
    
    // Check for duplicates
    const duplicates = await checkDuplicateResi(trimmedResi, selectedStore);
    if (duplicates.length > 0) {
      showToast(`Resi ${trimmedResi} sudah pernah discan!`, 'error');
      // Show existing data
      const firstDup = duplicates[0];
      setCurrentCustomer(firstDup.customer);
      // Could populate items here if needed
    }
  };

  const handlePartNumberChange = async (index: number, partNumber: string) => {
    const newItems = [...items];
    newItems[index].part_number = partNumber;
    
    // Auto-fill from database
    if (partNumber.trim()) {
      const product = await getProductByPartNumber(partNumber.trim(), selectedStore);
      if (product) {
        newItems[index].nama_barang = product.name || '';
        newItems[index].brand = product.brand || '';
        newItems[index].application = product.application || '';
        // Keep quantity as user entered, auto-calculate price
        newItems[index].harga_total = newItems[index].harga_satuan * newItems[index].quantity;
      }
    }
    
    setItems(newItems);
  };

  const handleQuantityChange = (index: number, qty: number) => {
    const newItems = [...items];
    newItems[index].quantity = qty;
    newItems[index].harga_total = newItems[index].harga_satuan * qty;
    setItems(newItems);
  };

  const handlePriceChange = (index: number, price: number) => {
    const newItems = [...items];
    newItems[index].harga_satuan = price;
    newItems[index].harga_total = price * newItems[index].quantity;
    setItems(newItems);
  };

  const handleAddItem = () => {
    setItems([...items, {
      part_number: '',
      nama_barang: '',
      brand: '',
      application: '',
      quantity: 1,
      harga_satuan: 0,
      harga_total: 0
    }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleSplitItem = (index: number) => {
    const item = items[index];
    const splitCount = 2; // Could be configurable
    const splitPrice = item.harga_satuan / splitCount;
    
    const newItem: ResiItemEntry = {
      ...item,
      harga_satuan: splitPrice,
      harga_total: splitPrice * item.quantity
    };
    
    // Update original
    const newItems = [...items];
    newItems[index].harga_satuan = splitPrice;
    newItems[index].harga_total = splitPrice * newItems[index].quantity;
    
    // Insert new item after current
    newItems.splice(index + 1, 0, newItem);
    setItems(newItems);
    showToast('Item split berhasil');
  };

  const handleSave = async () => {
    if (!currentResi.trim()) {
      showToast('Resi tidak boleh kosong!', 'error');
      return;
    }

    if (!currentCustomer.trim()) {
      showToast('Customer tidak boleh kosong!', 'error');
      return;
    }

    // Validate items
    const validItems = items.filter(item => item.part_number.trim() && item.quantity > 0);
    if (validItems.length === 0) {
      showToast('Minimal satu item harus diisi!', 'error');
      return;
    }

    setLoading(true);
    
    try {
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Jakarta'
      }).format(new Date());

      // Determine toko based on ecommerce type
      let finalToko = subToko;
      if (ecommerce === 'RESELLER') {
        finalToko = selectedStore === 'mjm' ? 'MJM' : 'BJW';
      } else if (ecommerce === 'EKSPOR') {
        // For export, could map based on negara or use selectedStore
        finalToko = selectedStore === 'mjm' ? 'MJM' : 'BJW';
      }

      // Remove duplicates by part_number (keep first occurrence)
      const uniqueItems: ResiItemEntry[] = [];
      const seenPartNumbers = new Set<string>();
      
      for (const item of validItems) {
        if (!seenPartNumbers.has(item.part_number)) {
          uniqueItems.push(item);
          seenPartNumbers.add(item.part_number);
        }
      }

      // Create entries for each item
      const entries: Partial<OnlineOrderRow>[] = uniqueItems.map(item => ({
        tanggal: today,
        resi: currentResi,
        toko: finalToko,
        ecommerce: ecommerce,
        customer: currentCustomer,
        part_number: item.part_number,
        nama_barang: item.nama_barang,
        brand: item.brand,
        application: item.application,
        quantity: item.quantity,
        harga_satuan: item.harga_satuan,
        harga_total: item.harga_total,
        status: 'scanned',
        negara: ecommerce === 'EKSPOR' ? negara : undefined
      }));

      // For RESELLER, save directly to barang_keluar
      if (ecommerce === 'RESELLER') {
        // This would require a different flow - save to barang_keluar directly
        // For now, still save to scan_resi but mark differently
        const result = await batchSaveScanResiEntries(entries, selectedStore);
        if (result.success) {
          showToast(`${result.insertedCount} item RESELLER disimpan!`);
          resetForm();
          loadScannedResi();
          onRefresh?.();
        } else {
          showToast('Gagal menyimpan data', 'error');
        }
      } else {
        // Normal flow - save to scan_resi
        const result = await batchSaveScanResiEntries(entries, selectedStore);
        if (result.success) {
          showToast(`Resi ${currentResi} berhasil discan! ${result.insertedCount} item disimpan.`);
          resetForm();
          loadScannedResi();
          onRefresh?.();
        } else {
          showToast('Gagal menyimpan data', 'error');
        }
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCurrentResi('');
    setCurrentCustomer('');
    setItems([{
      part_number: '',
      nama_barang: '',
      brand: '',
      application: '',
      quantity: 1,
      harga_satuan: 0,
      harga_total: 0
    }]);
    resiInputRef.current?.focus();
  };

  const handleDeleteResi = async (id: number, resi: string) => {
    if (!confirm(`Hapus semua item dengan resi ${resi}?`)) return;
    
    setLoading(true);
    const success = await deleteScanResiEntry(id, selectedStore);
    if (success) {
      showToast('Resi dihapus');
      loadScannedResi();
      onRefresh?.();
    } else {
      showToast('Gagal menghapus resi', 'error');
    }
    setLoading(false);
  };

  const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        showToast('File CSV kosong atau tidak valid', 'error');
        return;
      }

      // Parse CSV - assuming header in first line
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const resiIdx = headers.findIndex(h => h.includes('resi') || h.includes('tracking'));
      const customerIdx = headers.findIndex(h => h.includes('customer') || h.includes('buyer') || h.includes('pembeli'));
      const skuIdx = headers.findIndex(h => h.includes('sku') || h.includes('part'));
      const nameIdx = headers.findIndex(h => h.includes('product') || h.includes('name') || h.includes('item'));
      const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('jumlah'));
      const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('harga') || h.includes('total'));

      if (resiIdx === -1 || customerIdx === -1 || skuIdx === -1) {
        showToast('Format CSV tidak sesuai. Harus ada kolom: resi, customer, sku', 'error');
        return;
      }

      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Jakarta'
      }).format(new Date());

      const entries: Partial<OnlineOrderRow>[] = [];
      const processedResi = new Set<string>();

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < headers.length) continue;

        const resi = cols[resiIdx];
        const customer = cols[customerIdx];
        const sku = cols[skuIdx];
        const productName = nameIdx !== -1 ? cols[nameIdx] : '';
        const qty = qtyIdx !== -1 ? parseInt(cols[qtyIdx]) || 1 : 1;
        const price = priceIdx !== -1 ? parseFloat(cols[priceIdx]) || 0 : 0;

        if (!resi || !sku) continue;

        // Check if already processed to avoid duplicates
        const key = `${resi}-${sku}`;
        if (processedResi.has(key)) continue;
        processedResi.add(key);

        // Get product details
        const product = await getProductByPartNumber(sku, selectedStore);

        entries.push({
          tanggal: today,
          resi: resi,
          toko: subToko,
          ecommerce: ecommerce,
          customer: customer,
          part_number: sku,
          nama_barang: product?.name || productName,
          brand: product?.brand || '',
          application: product?.application || '',
          quantity: qty,
          harga_satuan: price,
          harga_total: price * qty,
          status: 'scanned'
        });
      }

      if (entries.length === 0) {
        showToast('Tidak ada data valid untuk diimport', 'error');
        return;
      }

      const result = await batchSaveScanResiEntries(entries, selectedStore);
      if (result.success) {
        showToast(`Import berhasil! ${result.insertedCount} item dari CSV.`);
        loadScannedResi();
        onRefresh?.();
      } else {
        showToast('Gagal import CSV', 'error');
      }
    } catch (e: any) {
      showToast(`Error import: ${e.message}`, 'error');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredResiList = scannedResiList.filter(item =>
    item.resi.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.part_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group by resi for display
  const groupedByResi = filteredResiList.reduce((acc, item) => {
    if (!acc[item.resi]) {
      acc[item.resi] = [];
    }
    acc[item.resi].push(item);
    return acc;
  }, {} as Record<string, OnlineOrderRow[]>);

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h1 className="text-2xl font-bold text-gray-100 mb-4">Scan Resi - Warehouse</h1>
          
          {/* E-commerce Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Platform E-commerce
              </label>
              <select
                value={ecommerce}
                onChange={(e) => {
                  setEcommerce(e.target.value as EcommerceType);
                  // Reset sub-toko when changing platform
                  const platform = ECOMMERCE_OPTIONS.find(opt => opt.value === e.target.value);
                  if (platform && platform.subs.length > 0) {
                    setSubToko(platform.subs[0]);
                  }
                }}
                className="w-full bg-gray-700 text-gray-100 rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                {ECOMMERCE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Sub-toko (only for certain platforms) */}
            {ecommerce !== 'RESELLER' && ecommerce !== 'EKSPOR' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Toko
                </label>
                <select
                  value={subToko}
                  onChange={(e) => setSubToko(e.target.value as SubTokoType)}
                  className="w-full bg-gray-700 text-gray-100 rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  {ECOMMERCE_OPTIONS.find(opt => opt.value === ecommerce)?.subs.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Negara (only for EKSPOR) */}
            {ecommerce === 'EKSPOR' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Negara Tujuan
                </label>
                <select
                  value={negara}
                  onChange={(e) => setNegara(e.target.value as NegaraEksporType)}
                  className="w-full bg-gray-700 text-gray-100 rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  {NEGARA_OPTIONS.map(neg => (
                    <option key={neg} value={neg}>{neg}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Scan Mode Selection */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setScanMode('manual')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                scanMode === 'manual' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <Search size={18} />
              Manual
            </button>
            <button
              onClick={() => setScanMode('camera')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                scanMode === 'camera' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <Camera size={18} />
              Kamera
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600"
            >
              <Upload size={18} />
              Import CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCSVImport}
              className="hidden"
            />
          </div>

          {/* Resi Input */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Nomor Resi / Tracking
              </label>
              <input
                ref={resiInputRef}
                type="text"
                value={currentResi}
                onChange={(e) => setCurrentResi(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleResiScan(currentResi);
                  }
                }}
                placeholder={scanMode === 'camera' ? 'Scan dengan kamera...' : 'Ketik atau scan resi'}
                className="w-full bg-gray-700 text-gray-100 rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Nama Customer
              </label>
              <input
                type="text"
                value={currentCustomer}
                onChange={(e) => setCurrentCustomer(e.target.value)}
                placeholder="Nama pembeli"
                className="w-full bg-gray-700 text-gray-100 rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Items Input Table */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-100">Detail Item Pesanan</h2>
            <button
              onClick={handleAddItem}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
            >
              <Plus size={18} />
              Tambah Item
            </button>
          </div>

          {/* Excel-like Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left p-2 text-gray-300 font-medium w-32">Part Number</th>
                  <th className="text-left p-2 text-gray-300 font-medium">Nama Barang</th>
                  <th className="text-left p-2 text-gray-300 font-medium w-24">Brand</th>
                  <th className="text-left p-2 text-gray-300 font-medium w-24">Application</th>
                  <th className="text-left p-2 text-gray-300 font-medium w-20">Qty</th>
                  <th className="text-left p-2 text-gray-300 font-medium w-32">Harga Satuan</th>
                  <th className="text-left p-2 text-gray-300 font-medium w-32">Total</th>
                  <th className="text-left p-2 text-gray-300 font-medium w-24">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.part_number}
                        onChange={(e) => handlePartNumberChange(idx, e.target.value)}
                        placeholder="SKU"
                        className="w-full bg-gray-700 text-gray-100 rounded px-2 py-1 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.nama_barang}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[idx].nama_barang = e.target.value;
                          setItems(newItems);
                        }}
                        placeholder="Auto-fill dari part number"
                        className="w-full bg-gray-700 text-gray-100 rounded px-2 py-1 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.brand}
                        readOnly
                        className="w-full bg-gray-600 text-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.application}
                        readOnly
                        className="w-full bg-gray-600 text-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 0)}
                        min="1"
                        className="w-full bg-gray-700 text-gray-100 rounded px-2 py-1 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.harga_satuan}
                        onChange={(e) => handlePriceChange(idx, parseFloat(e.target.value) || 0)}
                        className="w-full bg-gray-700 text-gray-100 rounded px-2 py-1 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.harga_total}
                        readOnly
                        className="w-full bg-gray-600 text-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleSplitItem(idx)}
                          title="Split item (bagi harga)"
                          className="p-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs"
                        >
                          +
                        </button>
                        {items.length > 1 && (
                          <button
                            onClick={() => handleRemoveItem(idx)}
                            title="Hapus item"
                            className="p-1 bg-red-600 hover:bg-red-700 text-white rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Save Button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium"
            >
              <Save size={18} />
              {loading ? 'Menyimpan...' : 'Simpan Scan Resi'}
            </button>
          </div>
        </div>

        {/* Scanned Resi List */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-100">Resi yang Sudah Discan</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari resi, customer, atau part..."
                className="pl-10 pr-4 py-2 bg-gray-700 text-gray-100 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-4">
            {Object.entries(groupedByResi).map(([resi, resiItems]) => (
              <div key={resi} className="bg-gray-750 rounded-lg p-4 border border-gray-600">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-blue-400">Resi: {resi}</h3>
                    <p className="text-sm text-gray-400">
                      Customer: {resiItems[0].customer} | 
                      Toko: {resiItems[0].toko} | 
                      Platform: {resiItems[0].ecommerce}
                      {resiItems[0].negara && ` | Negara: ${resiItems[0].negara}`}
                    </p>
                    <p className="text-xs text-gray-500">
                      Tanggal: {resiItems[0].tanggal}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteResi(resiItems[0].id, resi)}
                    className="p-2 bg-red-600 hover:bg-red-700 text-white rounded"
                    title="Hapus resi"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-600 text-gray-400">
                        <th className="text-left p-2">Part Number</th>
                        <th className="text-left p-2">Nama Barang</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Harga Satuan</th>
                        <th className="text-right p-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resiItems.map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-700 text-gray-300">
                          <td className="p-2 font-mono text-sm">{item.part_number}</td>
                          <td className="p-2">{item.nama_barang}</td>
                          <td className="p-2 text-right">{item.quantity}</td>
                          <td className="p-2 text-right">
                            Rp {item.harga_satuan.toLocaleString('id-ID')}
                          </td>
                          <td className="p-2 text-right font-semibold">
                            Rp {item.harga_total.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-600">
                        <td colSpan={4} className="p-2 text-right font-semibold text-gray-300">
                          Total Resi:
                        </td>
                        <td className="p-2 text-right font-bold text-green-400">
                          Rp {resiItems.reduce((sum, item) => sum + item.harga_total, 0).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}

            {Object.keys(groupedByResi).length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">Belum ada resi yang discan</p>
                <p className="text-sm mt-2">Scan resi pertama untuk memulai</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
