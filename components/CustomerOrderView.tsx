// FILE: src/components/CustomerOrderView.tsx
import React, { useState, useMemo } from 'react';
import { Order } from '../types';
import { Clock, Truck, CheckCircle, ClipboardList, XCircle } from 'lucide-react';
import { formatRupiah } from '../utils';

interface CustomerOrderViewProps {
  orders: Order[];
  currentCustomerName: string;
}

export const CustomerOrderView: React.FC<CustomerOrderViewProps> = ({ orders, currentCustomerName }) => {
  const [orderTab, setOrderTab] = useState<'pending' | 'processing' | 'completed'>('pending');

  // Helper date formatter
  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('id-ID', { 
    timeZone: 'Asia/Jakarta',
    day: 'numeric', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const myOrders = useMemo(() => {
    if (!currentCustomerName) return [];
    return orders.filter(o => o.customerName.toLowerCase() === currentCustomerName.toLowerCase());
  }, [orders, currentCustomerName]);

  const filteredOrders = useMemo(() => {
    return myOrders.filter(o => {
      if (orderTab === 'pending') return o.status === 'pending';
      if (orderTab === 'processing') return o.status === 'processing';
      if (orderTab === 'completed') return o.status === 'completed' || o.status === 'cancelled';
      return false;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [myOrders, orderTab]);

  return (
    <div className="bg-gray-800 rounded-2xl shadow-sm border border-gray-700 min-h-[80vh] flex flex-col overflow-hidden text-gray-100">
      
      {/* Header */}
      <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
           <ClipboardList className="text-blue-500" />
           Pesanan Saya
        </h2>
        <p className="text-xs text-gray-400 mt-1">
           Halo, {currentCustomerName || 'Tamu'}. Pantau status pesananmu di sini.
        </p>
      </div>

      {/* Tabs Navigasi */}
      <div className="flex border-b border-gray-700 bg-gray-900/50">
          {[
              { id: 'pending', label: 'Menunggu', icon: Clock, color: 'text-orange-400', activeBorder: 'border-orange-500' },
              { id: 'processing', label: 'Dikirim', icon: Truck, color: 'text-blue-400', activeBorder: 'border-blue-500' },
              { id: 'completed', label: 'Selesai', icon: CheckCircle, color: 'text-green-400', activeBorder: 'border-green-500' }
          ].map((tab: any) => {
              const isActive = orderTab === tab.id;
              // Hitung badge count per tab
              const count = myOrders.filter(o => {
                  if (tab.id === 'pending') return o.status === 'pending';
                  if (tab.id === 'processing') return o.status === 'processing';
                  if (tab.id === 'completed') return o.status === 'completed' || o.status === 'cancelled';
                  return false;
              }).length;

              return (
                <button
                    key={tab.id}
                    onClick={() => setOrderTab(tab.id)}
                    className={`flex-1 py-4 text-sm font-bold flex flex-col md:flex-row items-center justify-center gap-2 border-b-2 transition-all hover:bg-gray-800
                        ${isActive ? `${tab.activeBorder} bg-gray-800 text-gray-100` : 'border-transparent text-gray-500 hover:text-gray-300'}
                    `}
                >
                    <div className="relative">
                        <tab.icon size={18} className={isActive ? tab.color : ''} />
                        {count > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                                {count}
                            </span>
                        )}
                    </div>
                    <span>{tab.label}</span>
                </button>
              );
          })}
      </div>

      {/* Content List */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-900 space-y-4">
          {filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <ClipboardList size={48} className="opacity-20 mb-3" />
                  <p className="text-sm font-medium">Tidak ada pesanan di status ini</p>
              </div>
          ) : (
              filteredOrders.map(order => (
                  <div key={order.id} className="bg-gray-800 p-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-gray-700 hover:border-blue-500/30 transition-colors">
                      {/* Order Header */}
                      <div className="flex justify-between items-start mb-3 pb-3 border-b border-gray-700">
                          <div>
                              <p className="text-[10px] text-gray-500 font-mono mb-1">ORDER ID: #{order.id.slice(0,8)}</p>
                              <p className="text-xs font-bold text-gray-300 flex items-center gap-1">
                                  {formatDate(order.timestamp)}
                              </p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border ${
                              order.status === 'pending' ? 'bg-orange-900/30 text-orange-300 border-orange-800' :
                              order.status === 'processing' ? 'bg-blue-900/30 text-blue-300 border-blue-800' :
                              order.status === 'completed' ? 'bg-green-900/30 text-green-300 border-green-800' : 
                              'bg-red-900/30 text-red-300 border-red-800'
                          }`}>
                              {order.status === 'pending' ? 'Menunggu Konfirmasi' : 
                               order.status === 'processing' ? 'Sedang Dikirim' : 
                               order.status === 'completed' ? 'Selesai' : 'Dibatalkan'}
                          </span>
                      </div>
                      
                      {/* Item List */}
                      <div className="space-y-2 mb-4 bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                          {order.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between text-xs text-gray-300">
                                  <div className="flex items-center gap-2 overflow-hidden">
                                      <span className="bg-gray-700 text-gray-400 w-5 h-5 flex items-center justify-center rounded text-[9px] font-bold flex-shrink-0">{item.cartQuantity}x</span>
                                      <span className="truncate">{item.name}</span>
                                  </div>
                                  <span className="font-mono text-gray-400 whitespace-nowrap ml-2">{formatRupiah(item.price * item.cartQuantity)}</span>
                              </div>
                          ))}
                      </div>

                      {/* Footer / Total */}
                      <div className="flex justify-between items-center pt-1">
                          <div className="text-xs text-gray-500">
                             {order.status === 'completed' && <span className="flex items-center text-green-400 gap-1"><CheckCircle size={12}/> Transaksi Berhasil</span>}
                             {order.status === 'cancelled' && <span className="flex items-center text-red-400 gap-1"><XCircle size={12}/> Dibatalkan</span>}
                          </div>
                          <div className="text-right">
                              <span className="text-[10px] text-gray-500 block">Total Belanja</span>
                              <span className="text-sm font-extrabold text-gray-100">{formatRupiah(order.totalAmount)}</span>
                          </div>
                      </div>
                  </div>
              ))
          )}
      </div>
    </div>
  );
};