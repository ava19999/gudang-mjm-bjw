// FILE: src/components/finance/PettyCashView.tsx
import React, { useState } from 'react';
import { Wallet, Plus, Calendar, DollarSign, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface PettyCashEntry {
  id: string;
  date: string;
  description: string;
  type: 'in' | 'out';
  amount: number;
  balance: number;
  createdAt: number;
}

export const PettyCashView: React.FC = () => {
  const [entries, setEntries] = useState<PettyCashEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  
  const currentBalance = entries.length > 0 
    ? entries[entries.length - 1].balance 
    : 0;

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-green-600 p-3 rounded-xl">
              <Wallet size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-100">Petty Cash</h1>
              <p className="text-sm text-gray-400">Manajemen kas kecil</p>
            </div>
          </div>
        </div>

        {/* Balance Card */}
        <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-2xl p-6 mb-6 shadow-xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-green-100 text-sm font-medium mb-1">Saldo Saat Ini</p>
              <p className="text-4xl font-bold text-white">
                Rp {currentBalance.toLocaleString('id-ID')}
              </p>
            </div>
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all"
            >
              <Plus size={20} />
              <span className="font-medium">Tambah</span>
            </button>
          </div>
        </div>

        {/* Entries List */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-gray-100">Riwayat Transaksi</h2>
          </div>
          
          {entries.length === 0 ? (
            <div className="p-12 text-center">
              <Wallet size={48} className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg font-medium mb-2">Belum ada transaksi</p>
              <p className="text-gray-500 text-sm">Klik tombol "Tambah" untuk membuat transaksi pertama</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {entries.map((entry) => (
                <div key={entry.id} className="p-4 hover:bg-gray-750 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        entry.type === 'in' 
                          ? 'bg-green-900/30 text-green-400' 
                          : 'bg-red-900/30 text-red-400'
                      }`}>
                        {entry.type === 'in' ? (
                          <ArrowDownRight size={20} />
                        ) : (
                          <ArrowUpRight size={20} />
                        )}
                      </div>
                      <div>
                        <p className="text-gray-100 font-medium">{entry.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar size={14} className="text-gray-500" />
                          <p className="text-xs text-gray-400">{entry.date}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${
                        entry.type === 'in' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {entry.type === 'in' ? '+' : '-'} Rp {entry.amount.toLocaleString('id-ID')}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Saldo: Rp {entry.balance.toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Entry Modal - Placeholder */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-xl font-bold text-gray-100 mb-4">Tambah Transaksi</h3>
            <p className="text-gray-400 mb-4">Fitur ini sedang dalam pengembangan</p>
            <button 
              onClick={() => setIsAdding(false)}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
