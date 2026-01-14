// FILE: src/components/finance/BarangKosongView.tsx
import React from 'react';
import { PackageX, Construction } from 'lucide-react';

export const BarangKosongView: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 p-4 flex items-center justify-center">
      <div className="max-w-md w-full text-center">
        <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
          <div className="bg-yellow-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <PackageX size={40} className="text-yellow-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-100 mb-2">Barang Kosong</h1>
          <p className="text-gray-400 mb-6">Manajemen stok barang yang habis</p>
          
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-700 mb-4">
            <div className="flex items-center gap-3 justify-center text-yellow-500">
              <Construction size={20} />
              <p className="font-medium">Dalam Pengembangan</p>
            </div>
          </div>
          
          <p className="text-sm text-gray-500">
            Fitur ini sedang dalam tahap pengembangan dan akan segera tersedia.
          </p>
        </div>
      </div>
    </div>
  );
};
