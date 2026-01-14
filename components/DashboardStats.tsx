// FILE: src/components/DashboardStats.tsx
import React from 'react';
import { Package, Layers, TrendingUp, TrendingDown, Wallet, ChevronRight } from 'lucide-react';
import { formatCompactNumber } from '../utils/dashboardHelpers';

interface DashboardStatsProps {
  stats: { totalItems: number; totalStock: number; totalAsset: number; todayIn: number; todayOut: number };
  onShowDetail: (type: 'in' | 'out') => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({ stats, onShowDetail }) => {
  return (
    <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-20 shadow-md">
        <div className="px-4 py-3">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x md:grid md:grid-cols-5 md:overflow-visible">
                <div className="min-w-[140px] snap-start bg-gradient-to-br from-blue-900/40 to-gray-800 p-3 rounded-xl border border-blue-900/50 flex flex-col justify-between h-24 md:w-auto">
                    <div className="flex items-center gap-2 text-blue-400 mb-1"><div className="p-1.5 bg-blue-900/50 rounded-lg"><Package size={14} /></div><span className="text-[10px] font-bold uppercase tracking-wider">Item</span></div>
                    <div className="text-2xl font-extrabold text-white">{formatCompactNumber(stats.totalItems, false)}</div>
                </div>
                <div className="min-w-[140px] snap-start bg-gradient-to-br from-purple-900/40 to-gray-800 p-3 rounded-xl border border-purple-900/50 flex flex-col justify-between h-24 md:w-auto">
                    <div className="flex items-center gap-2 text-purple-400 mb-1"><div className="p-1.5 bg-purple-900/50 rounded-lg"><Layers size={14} /></div><span className="text-[10px] font-bold uppercase tracking-wider">Stok</span></div>
                    <div className="text-2xl font-extrabold text-white">{formatCompactNumber(stats.totalStock, false)}</div>
                </div>
                <button onClick={() => onShowDetail('in')} className="min-w-[130px] snap-start bg-gray-800 p-3 rounded-xl border border-gray-700 flex flex-col justify-between h-24 active:scale-95 transition-transform md:w-auto text-left hover:border-green-700/50 hover:bg-gray-750">
                    <div className="flex items-center justify-between w-full"><div className="flex items-center gap-2 text-green-500"><div className="p-1.5 bg-green-900/30 rounded-lg"><TrendingUp size={14} /></div><span className="text-[10px] font-bold uppercase">Masuk</span></div></div>
                    <div><div className="text-xl font-extrabold text-white">{stats.todayIn}</div><div className="text-[9px] text-green-500 font-medium flex items-center">Lihat Detail <ChevronRight size={10} /></div></div>
                </button>
                <button onClick={() => onShowDetail('out')} className="min-w-[130px] snap-start bg-gray-800 p-3 rounded-xl border border-gray-700 flex flex-col justify-between h-24 active:scale-95 transition-transform md:w-auto text-left hover:border-red-700/50 hover:bg-gray-750">
                    <div className="flex items-center justify-between w-full"><div className="flex items-center gap-2 text-red-500"><div className="p-1.5 bg-red-900/30 rounded-lg"><TrendingDown size={14} /></div><span className="text-[10px] font-bold uppercase">Keluar</span></div></div>
                    <div><div className="text-xl font-extrabold text-white">{stats.todayOut}</div><div className="text-[9px] text-red-500 font-medium flex items-center">Lihat Detail <ChevronRight size={10} /></div></div>
                </button>
                <div className="min-w-[180px] snap-start bg-gradient-to-br from-gray-950 to-gray-800 p-3 rounded-xl shadow-md text-white flex flex-col justify-between h-24 relative overflow-hidden md:w-auto border border-gray-700">
                    <div className="absolute right-0 top-0 p-2 opacity-10"><Wallet size={48} /></div>
                    <div className="flex items-center gap-2 text-gray-400 mb-1"><Wallet size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">Nilai Aset</span></div>
                    <div className="text-xl font-bold tracking-tight text-white truncate">{formatCompactNumber(stats.totalAsset)}</div>
                </div>
            </div>
        </div>
    </div>
  );
};