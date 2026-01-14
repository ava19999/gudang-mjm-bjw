// FILE: src/components/DashboardStats.tsx
import React from 'react';
import { Package, Layers, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { formatCompactNumber } from '../utils/dashboardHelpers';
import { StatCard } from './dashboard/StatCard';

interface DashboardStatsProps {
  stats: { totalItems: number; totalStock: number; totalAsset: number; todayIn: number; todayOut: number };
  onShowDetail: (type: 'in' | 'out') => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({ stats, onShowDetail }) => {
  return (
    <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-20 shadow-lg">
        <div className="px-3 py-4 md:px-4">
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide snap-x snap-mandatory md:grid md:grid-cols-5 md:overflow-visible md:gap-3">
                <StatCard 
                    icon={Package}
                    label="Item"
                    value={formatCompactNumber(stats.totalItems, false)}
                    color="blue"
                />
                
                <StatCard 
                    icon={Layers}
                    label="Stok"
                    value={formatCompactNumber(stats.totalStock, false)}
                    color="purple"
                />
                
                <StatCard 
                    icon={TrendingUp}
                    label="Masuk"
                    value={stats.todayIn}
                    color="green"
                    interactive
                    onClick={() => onShowDetail('in')}
                    detailText="Lihat Detail"
                />
                
                <StatCard 
                    icon={TrendingDown}
                    label="Keluar"
                    value={stats.todayOut}
                    color="red"
                    interactive
                    onClick={() => onShowDetail('out')}
                    detailText="Lihat Detail"
                />
                
                <StatCard 
                    icon={Wallet}
                    label="Nilai Aset"
                    value={formatCompactNumber(stats.totalAsset)}
                    color="yellow"
                    backgroundImage
                />
            </div>
        </div>
    </div>
  );
};