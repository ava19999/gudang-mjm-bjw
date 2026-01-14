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
    <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-20 shadow-lg">
        <div className="px-3 py-4 md:px-4">
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide snap-x snap-mandatory md:grid md:grid-cols-5 md:overflow-visible md:gap-3">
                {/* Item Card - Enhanced */}
                <div className="min-w-[145px] snap-start snap-always bg-gradient-to-br from-blue-900/50 via-blue-800/30 to-gray-800 p-3.5 rounded-2xl border border-blue-800/60 flex flex-col justify-between h-[110px] md:w-auto shadow-lg shadow-blue-900/20 hover:shadow-blue-800/30 transition-all duration-300">
                    <div className="flex items-center gap-2 text-blue-400 mb-1.5">
                        <div className="p-2 bg-blue-900/60 rounded-xl shadow-inner">
                            <Package size={16} className="drop-shadow-sm" />
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider">Item</span>
                    </div>
                    <div className="text-3xl font-extrabold text-white drop-shadow-md">{formatCompactNumber(stats.totalItems, false)}</div>
                </div>
                
                {/* Stock Card - Enhanced */}
                <div className="min-w-[145px] snap-start snap-always bg-gradient-to-br from-purple-900/50 via-purple-800/30 to-gray-800 p-3.5 rounded-2xl border border-purple-800/60 flex flex-col justify-between h-[110px] md:w-auto shadow-lg shadow-purple-900/20 hover:shadow-purple-800/30 transition-all duration-300">
                    <div className="flex items-center gap-2 text-purple-400 mb-1.5">
                        <div className="p-2 bg-purple-900/60 rounded-xl shadow-inner">
                            <Layers size={16} className="drop-shadow-sm" />
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider">Stok</span>
                    </div>
                    <div className="text-3xl font-extrabold text-white drop-shadow-md">{formatCompactNumber(stats.totalStock, false)}</div>
                </div>
                
                {/* In Card - Enhanced with better interaction */}
                <button 
                    onClick={() => onShowDetail('in')} 
                    className="min-w-[145px] snap-start snap-always bg-gradient-to-br from-green-900/30 to-gray-800 p-3.5 rounded-2xl border border-green-800/50 flex flex-col justify-between h-[110px] md:w-auto text-left hover:border-green-700/70 hover:shadow-lg hover:shadow-green-900/20 active:scale-[0.97] transition-all duration-200 shadow-md"
                >
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 text-green-400">
                            <div className="p-2 bg-green-900/40 rounded-xl shadow-inner">
                                <TrendingUp size={16} className="drop-shadow-sm" />
                            </div>
                            <span className="text-[11px] font-bold uppercase tracking-wide">Masuk</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold text-white drop-shadow-md mb-1">{stats.todayIn}</div>
                        <div className="text-[10px] text-green-400 font-semibold flex items-center gap-0.5 hover:gap-1 transition-all">
                            Lihat Detail 
                            <ChevronRight size={12} className="drop-shadow-sm" />
                        </div>
                    </div>
                </button>
                
                {/* Out Card - Enhanced with better interaction */}
                <button 
                    onClick={() => onShowDetail('out')} 
                    className="min-w-[145px] snap-start snap-always bg-gradient-to-br from-red-900/30 to-gray-800 p-3.5 rounded-2xl border border-red-800/50 flex flex-col justify-between h-[110px] md:w-auto text-left hover:border-red-700/70 hover:shadow-lg hover:shadow-red-900/20 active:scale-[0.97] transition-all duration-200 shadow-md"
                >
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 text-red-400">
                            <div className="p-2 bg-red-900/40 rounded-xl shadow-inner">
                                <TrendingDown size={16} className="drop-shadow-sm" />
                            </div>
                            <span className="text-[11px] font-bold uppercase tracking-wide">Keluar</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold text-white drop-shadow-md mb-1">{stats.todayOut}</div>
                        <div className="text-[10px] text-red-400 font-semibold flex items-center gap-0.5 hover:gap-1 transition-all">
                            Lihat Detail 
                            <ChevronRight size={12} className="drop-shadow-sm" />
                        </div>
                    </div>
                </button>
                
                {/* Asset Card - Enhanced */}
                <div className="min-w-[185px] snap-start snap-always bg-gradient-to-br from-yellow-900/20 via-gray-900 to-gray-800 p-3.5 rounded-2xl shadow-lg text-white flex flex-col justify-between h-[110px] relative overflow-hidden md:w-auto border border-yellow-800/40 hover:border-yellow-700/50 transition-all duration-300">
                    <div className="absolute right-1 top-1 opacity-[0.08]">
                        <Wallet size={52} className="text-yellow-400" />
                    </div>
                    <div className="flex items-center gap-2 text-yellow-400 mb-1.5 relative z-10">
                        <div className="p-1.5 bg-yellow-900/30 rounded-lg">
                            <Wallet size={15} className="drop-shadow-sm" />
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider">Nilai Aset</span>
                    </div>
                    <div className="text-2xl font-extrabold tracking-tight text-yellow-50 truncate drop-shadow-md relative z-10">
                        {formatCompactNumber(stats.totalAsset)}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};