// FILE: components/online/ResellerView.tsx
import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Save } from 'lucide-react';
import { ScanResi, ScanResiItem } from '../../types';
import { saveScanResi, saveScanResiItems } from '../../services/resiService';
import { getItemByPartNumber } from '../../services/supabaseService';

interface ResellerViewProps {
  store: string | null;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

interface ResellerFormItem {
  tempId: string;
  part_number: string;
  nama_barang: string;
  qty: number;
  harga_satuan: number;
  harga_total: number;
}

export const ResellerView: React.FC<ResellerViewProps> = ({ store, showToast }) => {
  const [resi, setResi] = useState('');
  const [customer, setCustomer] = useState('');
  const [items, setItems] = useState<ResellerFormItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Add initial empty item
  useEffect(() => {
    if (items.length === 0) {
      addNewItem();
    }
  }, []);

  const addNewItem = () => {
    const newItem: ResellerFormItem = {
      tempId: `temp-${Date.now()}-${Math.random()}`,
      part_number: '',
      nama_barang: '',
      qty: 1,
      harga_satuan: 0,
      harga_total: 0,
    };
    setItems([...items, newItem]);
  };

  const removeItem = (tempId: string) => {
    setItems(items.filter((item) => item.tempId !== tempId));
  };

  const updateItem = (tempId: string, field: keyof ResellerFormItem, value: any) => {
    setItems(
      items.map((item) => {
        if (item.tempId === tempId) {
          const updated = { ...item, [field]: value };
          
          // Auto-calculate harga_total
          if (field === 'qty' || field === 'harga_satuan') {
            updated.harga_total = updated.qty * updated.harga_satuan;
          }
          
          return updated;
        }
        return item;
      })
    );
  };

  const handleScanPartNumber = async (tempId: string, partNumber: string) => {
    if (!partNumber.trim()) return;

    try {
      const item = await getItemByPartNumber(partNumber, store);
      if (item) {
        updateItem(tempId, 'nama_barang', item.name);
        showToast(`✅ ${item.name}`, 'success');
      } else {
        showToast('Part number tidak ditemukan', 'error');
      }
    } catch (error) {
      console.error('Error fetching item:', error);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!resi.trim()) {
      showToast('Masukkan nomor resi', 'error');
      return;
    }

    if (!customer.trim()) {
      showToast('Masukkan nama customer', 'error');
      return;
    }

    const validItems = items.filter((item) => item.part_number.trim() && item.qty > 0);
    if (validItems.length === 0) {
      showToast('Tambahkan minimal 1 item', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      // Save scan resi
      const resiData: ScanResi = {
        tanggal: new Date().toISOString(),
        type_toko: 'RESELLER',
        resi,
        customer,
        status: 'MATCHED',
        scanned_at: new Date().toISOString(),
        matched_at: new Date().toISOString(),
      };

      const result = await saveScanResi(resiData, store);

      if (!result.success || !result.id) {
        showToast(result.error || 'Gagal menyimpan resi', 'error');
        setIsProcessing(false);
        return;
      }

      // Save items
      const resiItems: ScanResiItem[] = validItems.map((item) => ({
        scan_resi_id: result.id!,
        part_number: item.part_number,
        product_name_export: item.nama_barang,
        qty: item.qty,
        harga_satuan: item.harga_satuan,
        harga_total: item.harga_total,
        is_split: false,
        split_count: 1,
      }));

      const itemsSuccess = await saveScanResiItems(resiItems, store);

      if (itemsSuccess) {
        showToast('✅ Data reseller tersimpan', 'success');
        
        // Reset form
        setResi('');
        setCustomer('');
        setItems([]);
        addNewItem();
      } else {
        showToast('Gagal menyimpan items', 'error');
      }
    } catch (error) {
      console.error('Error saving reseller data:', error);
      showToast('Terjadi kesalahan', 'error');
    }

    setIsProcessing(false);
  };

  const totalHarga = items.reduce((sum, item) => sum + item.harga_total, 0);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-900 to-rose-900 p-4 shadow-lg">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Users size={24} />
          RESELLER - INPUT MANUAL
        </h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Form Header */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">No. Resi *</label>
              <input
                type="text"
                value={resi}
                onChange={(e) => setResi(e.target.value)}
                placeholder="Masukkan nomor resi..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Customer *</label>
              <input
                type="text"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Nama customer..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 bg-gray-750 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-lg font-bold">📦 Item List</h3>
            <button
              onClick={addNewItem}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded-lg font-semibold transition-all flex items-center gap-2"
            >
              <Plus size={18} />
              Tambah Item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-750">
                <tr>
                  <th className="px-4 py-3 text-left border-b border-gray-700">#</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">PART NUMBER *</th>
                  <th className="px-4 py-3 text-left border-b border-gray-700">NAMA BARANG</th>
                  <th className="px-4 py-3 text-center border-b border-gray-700">QTY *</th>
                  <th className="px-4 py-3 text-right border-b border-gray-700">HARGA SATUAN *</th>
                  <th className="px-4 py-3 text-right border-b border-gray-700">TOTAL</th>
                  <th className="px-4 py-3 text-center border-b border-gray-700">AKSI</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.tempId} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="px-4 py-3">{index + 1}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.part_number}
                        onChange={(e) => updateItem(item.tempId, 'part_number', e.target.value)}
                        onBlur={(e) => handleScanPartNumber(item.tempId, e.target.value)}
                        placeholder="Part number..."
                        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-pink-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.nama_barang}
                        onChange={(e) => updateItem(item.tempId, 'nama_barang', e.target.value)}
                        placeholder="Nama barang..."
                        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-pink-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => updateItem(item.tempId, 'qty', parseInt(e.target.value) || 0)}
                        min="1"
                        className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-center focus:ring-2 focus:ring-pink-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={item.harga_satuan}
                        onChange={(e) => updateItem(item.tempId, 'harga_satuan', parseFloat(e.target.value) || 0)}
                        min="0"
                        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-right focus:ring-2 focus:ring-pink-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {item.harga_total.toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => removeItem(item.tempId)}
                        disabled={items.length === 1}
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Hapus"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-750">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right font-bold">TOTAL:</td>
                  <td className="px-4 py-3 text-right font-bold text-pink-400">
                    Rp {totalHarga.toLocaleString('id-ID')}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Save Button */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <button
            onClick={handleSave}
            disabled={isProcessing}
            className="w-full sm:w-auto px-6 py-3 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 rounded-lg font-semibold transition-all flex items-center gap-2 justify-center"
          >
            <Save size={20} />
            {isProcessing ? 'Menyimpan...' : 'Simpan Data Reseller'}
          </button>
        </div>
      </div>
    </div>
  );
};
