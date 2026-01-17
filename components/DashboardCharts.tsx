// FILE: src/components/DashboardCharts.tsx
import React, { useMemo } from 'react';
import { Order, StockHistory } from '../types';
import { TrendingUp, TrendingDown, DollarSign, Package, ShoppingBag, Clock } from 'lucide-react';
import { formatRupiah } from '../utils';

interface DashboardChartsProps {
  orders: Order[];
  history: StockHistory[];
}

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ orders, history }) => {
  // Calculate statistics
  const stats = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    
    // Order statistics
    const completedOrders = orders.filter(o => o.status === 'completed');
    const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'processing');
    
    // Daily revenue
    const todayOrders = completedOrders.filter(o => o.timestamp && o.timestamp >= startOfDay.getTime());
    const dailyRevenue = todayOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    
    // Weekly revenue
    const weekOrders = completedOrders.filter(o => o.timestamp && o.timestamp >= startOfWeek.getTime());
    const weeklyRevenue = weekOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    
    // Daily orders count
    const dailyOrdersCount = todayOrders.length;
    
    // Marketplace breakdown
    const marketplaceStats: Record<string, number> = {};
    completedOrders.forEach(order => {
      // Extract marketplace from customer name or default to 'Offline'
      const match = order.customerName.match(/\(Via: (.*?)\)/);
      const marketplace = match ? match[1] : 'Offline';
      marketplaceStats[marketplace] = (marketplaceStats[marketplace] || 0) + 1;
    });
    
    // Daily trend (last 7 days)
    const dailyTrend: Array<{ date: string, count: number, revenue: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const dayOrders = completedOrders.filter(o => 
        o.timestamp && o.timestamp >= date.getTime() && o.timestamp < nextDate.getTime()
      );
      
      dailyTrend.push({
        date: date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        count: dayOrders.length,
        revenue: dayOrders.reduce((sum, o) => sum + o.totalAmount, 0)
      });
    }
    
    return {
      completedOrders: completedOrders.length,
      pendingOrders: pendingOrders.length,
      dailyRevenue,
      weeklyRevenue,
      dailyOrdersCount,
      marketplaceStats,
      dailyTrend
    };
  }, [orders]);

  const maxTrendCount = Math.max(...stats.dailyTrend.map(d => d.count), 1);
  const maxTrendRevenue = Math.max(...stats.dailyTrend.map(d => d.revenue), 1);

  return (
    <div className="space-y-4">
      {/* Summary Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Completed vs Pending Orders */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package size={16} className="text-green-400" />
            <span className="text-xs font-bold text-gray-400 uppercase">Selesai</span>
          </div>
          <div className="text-2xl font-bold text-green-400">{stats.completedOrders}</div>
          <div className="text-[10px] text-gray-500 mt-1">Pesanan</div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-yellow-400" />
            <span className="text-xs font-bold text-gray-400 uppercase">Pending</span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">{stats.pendingOrders}</div>
          <div className="text-[10px] text-gray-500 mt-1">Pesanan</div>
        </div>

        {/* Daily Revenue */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={16} className="text-blue-400" />
            <span className="text-xs font-bold text-gray-400 uppercase">Hari Ini</span>
          </div>
          <div className="text-lg font-bold text-blue-400">{formatRupiah(stats.dailyRevenue)}</div>
          <div className="text-[10px] text-gray-500 mt-1">{stats.dailyOrdersCount} Pesanan</div>
        </div>

        {/* Weekly Revenue */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-purple-400" />
            <span className="text-xs font-bold text-gray-400 uppercase">Minggu Ini</span>
          </div>
          <div className="text-lg font-bold text-purple-400">{formatRupiah(stats.weeklyRevenue)}</div>
          <div className="text-[10px] text-gray-500 mt-1">Total</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Completed vs Pending Pie Chart */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">
            <Package size={16} className="text-purple-400" />
            Status Pesanan
          </h3>
          <div className="flex items-center justify-center gap-8">
            {/* Simple Pie Chart using CSS */}
            <div className="relative w-32 h-32">
              <div 
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(
                    #22c55e 0deg ${(stats.completedOrders / (stats.completedOrders + stats.pendingOrders) * 360)}deg,
                    #eab308 ${(stats.completedOrders / (stats.completedOrders + stats.pendingOrders) * 360)}deg 360deg
                  )`
                }}
              />
              <div className="absolute inset-3 bg-gray-800 rounded-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-xl font-bold text-white">{stats.completedOrders + stats.pendingOrders}</div>
                  <div className="text-[8px] text-gray-400">Total</div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-xs text-gray-300">Selesai: <span className="font-bold">{stats.completedOrders}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-xs text-gray-300">Pending: <span className="font-bold">{stats.pendingOrders}</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Marketplace Breakdown */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">
            <ShoppingBag size={16} className="text-blue-400" />
            Per Marketplace
          </h3>
          <div className="space-y-2">
            {Object.entries(stats.marketplaceStats)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([marketplace, count]) => {
                const total = Object.values(stats.marketplaceStats).reduce((a, b) => a + b, 0);
                const percentage = (count / total) * 100;
                return (
                  <div key={marketplace} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-300 font-medium">{marketplace}</span>
                      <span className="text-gray-400">{count} ({percentage.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Daily Trend Chart */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-green-400" />
          Tren Pesanan 7 Hari Terakhir
        </h3>
        <div className="flex items-end gap-2 h-32">
          {stats.dailyTrend.map((day, idx) => {
            const heightPercentage = (day.count / maxTrendCount) * 100;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                <div className="relative w-full flex-1 flex items-end">
                  <div 
                    className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all hover:from-blue-500 hover:to-blue-300 group cursor-pointer"
                    style={{ height: `${Math.max(heightPercentage, 5)}%` }}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap font-bold">
                      {day.count} pesanan<br/>
                      {formatRupiah(day.revenue)}
                    </div>
                  </div>
                </div>
                <span className="text-[9px] text-gray-400 font-medium">{day.date}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Order Summary Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-300 mb-4">Ringkasan Pesanan</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-gray-700">
              <tr className="text-left text-gray-400">
                <th className="pb-2 font-bold">Kategori</th>
                <th className="pb-2 font-bold text-right">Jumlah</th>
                <th className="pb-2 font-bold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              <tr>
                <td className="py-2 text-gray-300">Total Pesanan Aktif</td>
                <td className="py-2 text-right font-bold text-white">{stats.pendingOrders}</td>
                <td className="py-2 text-right text-gray-400">-</td>
              </tr>
              <tr>
                <td className="py-2 text-gray-300">Pesanan Selesai</td>
                <td className="py-2 text-right font-bold text-green-400">{stats.completedOrders}</td>
                <td className="py-2 text-right text-gray-400">-</td>
              </tr>
              <tr>
                <td className="py-2 text-gray-300">Pendapatan Hari Ini</td>
                <td className="py-2 text-right font-bold text-white">{stats.dailyOrdersCount}</td>
                <td className="py-2 text-right font-bold text-blue-400">{formatRupiah(stats.dailyRevenue)}</td>
              </tr>
              <tr className="bg-gray-900/50">
                <td className="py-2 text-gray-300 font-bold">Total Pendapatan Minggu Ini</td>
                <td className="py-2 text-right text-gray-400">-</td>
                <td className="py-2 text-right font-bold text-purple-400">{formatRupiah(stats.weeklyRevenue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
