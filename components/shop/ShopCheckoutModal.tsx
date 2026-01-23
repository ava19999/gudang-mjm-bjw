// FILE: components/shop/ShopCheckoutModal.tsx
import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Clock } from 'lucide-react';

interface ShopCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (customerName: string, tempo: string, note: string) => void;
}

export const ShopCheckoutModal: React.FC<ShopCheckoutModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [customerName, setCustomerName] = useState('');
  const [tempo, setTempo] = useState('CASH'); // Default CASH
  const [note, setNote] = useState('');

  // Reset form saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      setCustomerName('');
      setTempo('CASH');
      setNote('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      alert('Nama pelanggan wajib diisi!');
      return;
    }
    
    // Gabungkan Nama dan Note untuk kompatibilitas jika perlu, atau kirim terpisah
    // Format finalName: "Nama (Note)" agar terbaca di sistem lama, atau sesuaikan handler
    const finalName = note.trim() ? `${customerName} (${note})` : customerName;
    
    onConfirm(finalName, tempo, note);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-gray-800/50 p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CheckCircle className="text-green-500" size={20} />
            Konfirmasi Pesanan
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Nama Pelanggan */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Nama Pelanggan / Toko *</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value.toUpperCase())}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase"
              placeholder="Contoh: BUDI MOTOR"
              required
            />
          </div>

          {/* Dropdown Tempo */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
              <Clock size={14} /> Tempo Pembayaran
            </label>
            <div className="relative">
              <select
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="CASH">CASH</option>
                <option value="1 BLN">1 BLN</option>
                <option value="2 BLN">2 BLN</option>
                <option value="3 BLN">3 BLN</option>
                <option value="NADIR">NADIR</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                ▼
              </div>
            </div>
          </div>

          {/* Catatan Tambahan */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Catatan (Opsional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-none"
              placeholder="Keterangan tambahan..."
            />
          </div>

          {/* Tombol Action */}
          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-800 text-gray-300 rounded-xl font-semibold hover:bg-gray-700 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 shadow-lg shadow-blue-900/30 transition-all active:scale-95"
            >
              Lanjut Bayar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};