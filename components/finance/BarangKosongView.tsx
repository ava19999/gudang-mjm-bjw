// FILE: src/components/finance/BarangKosongView.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PackageX, Search, RefreshCw, ChevronDown, ChevronUp, Camera, 
  Plus, Minus, ShoppingCart, Check, X, Truck, Package, History,
  ClipboardList, Send, Trash2, Clock, CheckCircle, AlertCircle,
  ChevronLeft, ChevronRight, Filter, Download, Copy, Eye
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { 
  fetchLowStockItems, 
  getLowStockGroupedBySupplier,
  fetchSupplierHistoryForItem,
  saveSupplierOrder,
  fetchSupplierOrders,
  updateSupplierOrderStatus,
  deleteSupplierOrder,
  LowStockItem, 
  SupplierOrderGroup, 
  SupplierHistory,
  SupplierOrder,
  LowStockOrderItem
} from '../../services/supabaseService';

// Toast Component
const Toast: React.FC<{ msg: string; type: 'success' | 'error'; onClose: () => void }> = ({ msg, type, onClose }) => (
  <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-xl flex items-center text-white text-sm font-bold animate-in fade-in slide-in-from-top-2 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
    {msg}
    <button onClick={onClose} className="ml-3 opacity-70 hover:opacity-100"><X size={14}/></button>
  </div>
);

// Format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);
};

// Format date
const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Supplier Card Component - untuk screenshot dan kirim ke supplier
interface SupplierCardProps {
  supplier: string;
  items: LowStockOrderItem[];
  selectedItems: Set<string>;
  orderQtys: Record<string, number>;
  onToggleItem: (partNumber: string) => void;
  onQtyChange: (partNumber: string, qty: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onViewHistory: (partNumber: string) => void;
  cardRef?: React.RefObject<HTMLDivElement>;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const SupplierCard: React.FC<SupplierCardProps> = ({
  supplier,
  items,
  selectedItems,
  orderQtys,
  onToggleItem,
  onQtyChange,
  onSelectAll,
  onDeselectAll,
  onViewHistory,
  cardRef,
  isExpanded,
  onToggleExpand
}) => {
  const selectedCount = items.filter(i => selectedItems.has(i.partNumber)).length;
  const totalValue = items
    .filter(i => selectedItems.has(i.partNumber))
    .reduce((sum, i) => sum + (orderQtys[i.partNumber] || 0) * i.lastPrice, 0);

  return (
    <div 
      ref={cardRef}
      className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden shadow-lg"
    >
      {/* Supplier Header */}
      <div 
        className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-4 cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl">
              <Truck size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">{supplier}</h3>
              <p className="text-xs text-gray-400">{items.length} barang perlu diorder</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selectedCount > 0 && (
              <span className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                {selectedCount} dipilih
              </span>
            )}
            {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4">
          {/* Action Buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={onSelectAll}
              className="flex-1 py-2 bg-blue-600/20 text-blue-400 rounded-xl text-xs font-bold hover:bg-blue-600/30 flex items-center justify-center gap-1"
            >
              <Check size={14} /> Pilih Semua
            </button>
            <button
              onClick={onDeselectAll}
              className="flex-1 py-2 bg-gray-700 text-gray-300 rounded-xl text-xs font-bold hover:bg-gray-600 flex items-center justify-center gap-1"
            >
              <X size={14} /> Batal Semua
            </button>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-900 text-gray-400">
                  <th className="p-2 text-left w-8">
                    <Check size={12} />
                  </th>
                  <th className="p-2 text-left">Part Number</th>
                  <th className="p-2 text-left">Nama Barang</th>
                  <th className="p-2 text-center">Stok</th>
                  <th className="p-2 text-center">Rak</th>
                  <th className="p-2 text-right">
                    <span className="text-green-400">CASH</span>
                  </th>
                  <th className="p-2 text-right">
                    <span className="text-orange-400">TEMPO</span>
                  </th>
                  <th className="p-2 text-center">Qty Order</th>
                  <th className="p-2 text-right">Subtotal</th>
                  <th className="p-2 text-center">Riwayat</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isSelected = selectedItems.has(item.partNumber);
                  const qty = orderQtys[item.partNumber] || 0;
                  // Use the higher of cash or tempo price for subtotal calculation
                  const activePrice = item.lastPriceCash > 0 ? item.lastPriceCash : item.lastPriceTempo;
                  const subtotal = qty * activePrice;

                  return (
                    <tr 
                      key={item.partNumber}
                      className={`border-b border-gray-700 hover:bg-gray-700/50 ${isSelected ? 'bg-blue-900/20' : ''}`}
                    >
                      <td className="p-2">
                        <button
                          onClick={() => onToggleItem(item.partNumber)}
                          className={`w-5 h-5 rounded flex items-center justify-center ${isSelected ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-500'}`}
                        >
                          {isSelected && <Check size={12} />}
                        </button>
                      </td>
                      <td className="p-2">
                        <span className="font-mono text-blue-400 font-bold">{item.partNumber}</span>
                      </td>
                      <td className="p-2">
                        <div className="text-white font-medium">{item.name}</div>
                        {(item.brand || item.application) && (
                          <div className="text-[10px] text-gray-500">
                            {item.brand && <span className="text-purple-400">{item.brand}</span>}
                            {item.brand && item.application && ' • '}
                            {item.application && <span className="text-green-400">{item.application}</span>}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <span className={`font-bold ${item.currentStock === 0 ? 'text-red-400' : item.currentStock < 3 ? 'text-yellow-400' : 'text-gray-300'}`}>
                          {item.currentStock}
                        </span>
                      </td>
                      <td className="p-2 text-center text-gray-400">{item.shelf || '-'}</td>
                      <td className="p-2 text-right">
                        {item.lastPriceCash > 0 ? (
                          <span className="text-green-400 font-medium">{formatCurrency(item.lastPriceCash)}</span>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {item.lastPriceTempo > 0 ? (
                          <span className="text-orange-400 font-medium">{formatCurrency(item.lastPriceTempo)}</span>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onQtyChange(item.partNumber, Math.max(0, qty - 1))}
                            className="w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center text-gray-400"
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number"
                            value={qty}
                            onChange={(e) => onQtyChange(item.partNumber, Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-12 h-6 bg-gray-900 border border-gray-600 rounded text-center text-white text-xs"
                          />
                          <button
                            onClick={() => onQtyChange(item.partNumber, qty + 1)}
                            className="w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center text-gray-400"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="p-2 text-right text-yellow-400 font-medium">
                        {subtotal > 0 ? formatCurrency(subtotal) : '-'}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => onViewHistory(item.partNumber)}
                          className="p-1 bg-purple-600/20 hover:bg-purple-600/30 rounded text-purple-400"
                          title="Lihat Riwayat Supplier"
                        >
                          <History size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          {selectedCount > 0 && (
            <div className="mt-4 p-3 bg-gray-900 rounded-xl flex items-center justify-between">
              <div className="text-sm text-gray-400">
                <span className="font-bold text-white">{selectedCount}</span> barang dipilih
              </div>
              <div className="text-sm">
                <span className="text-gray-400">Total Estimasi: </span>
                <span className="font-bold text-green-400">{formatCurrency(totalValue)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Screenshot-ready Order Card for sending to supplier
interface OrderPreviewCardProps {
  supplier: string;
  items: { partNumber: string; name: string; qty: number; price: number }[];
  storeName: string;
  date: string;
}

const OrderPreviewCard: React.FC<OrderPreviewCardProps> = ({ supplier, items, storeName, date }) => {
  const total = items.reduce((sum, i) => sum + i.qty * i.price, 0);
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <div className="bg-white text-black p-6 rounded-xl shadow-xl max-w-2xl mx-auto" id="order-preview">
      {/* Header */}
      <div className="border-b-2 border-gray-300 pb-4 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">ORDER BARANG</h2>
            <p className="text-gray-600 text-sm mt-1">{storeName}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Tanggal</p>
            <p className="font-bold">{date}</p>
          </div>
        </div>
      </div>

      {/* Supplier Info */}
      <div className="bg-blue-50 p-3 rounded-lg mb-4">
        <p className="text-sm text-gray-600">Kepada Supplier:</p>
        <p className="text-xl font-bold text-blue-800">{supplier}</p>
      </div>

      {/* Items Table */}
      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left border">No</th>
            <th className="p-2 text-left border">Part Number</th>
            <th className="p-2 text-left border">Nama Barang</th>
            <th className="p-2 text-center border">Qty</th>
            <th className="p-2 text-right border">Harga</th>
            <th className="p-2 text-right border">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.partNumber} className="hover:bg-gray-50">
              <td className="p-2 border text-center">{idx + 1}</td>
              <td className="p-2 border font-mono font-bold">{item.partNumber}</td>
              <td className="p-2 border">{item.name}</td>
              <td className="p-2 border text-center font-bold">{item.qty}</td>
              <td className="p-2 border text-right">{formatCurrency(item.price)}</td>
              <td className="p-2 border text-right font-medium">{formatCurrency(item.qty * item.price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-100 font-bold">
            <td colSpan={3} className="p-2 border text-right">TOTAL:</td>
            <td className="p-2 border text-center">{totalQty}</td>
            <td className="p-2 border"></td>
            <td className="p-2 border text-right text-blue-800">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Footer */}
      <div className="text-center text-gray-500 text-xs mt-4 pt-4 border-t">
        <p>Terima kasih atas kerjasama yang baik</p>
      </div>
    </div>
  );
};

// Supplier History Modal
interface HistoryModalProps {
  isOpen: boolean;
  partNumber: string;
  itemName: string;
  history: SupplierHistory[];
  onClose: () => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, partNumber, itemName, history, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-white flex items-center gap-2">
              <History className="text-purple-400" size={20} /> Riwayat Supplier
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              <span className="text-blue-400 font-mono">{partNumber}</span> - {itemName}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {history.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package size={40} className="mx-auto mb-2 opacity-50" />
              <p>Belum ada riwayat pembelian</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((h, idx) => (
                <div 
                  key={h.supplier}
                  className={`p-3 rounded-xl border ${idx === 0 ? 'bg-blue-900/20 border-blue-700' : 'bg-gray-800 border-gray-700'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Truck size={16} className={idx === 0 ? 'text-blue-400' : 'text-gray-400'} />
                      <span className="font-bold text-white">{h.supplier}</span>
                      {idx === 0 && (
                        <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full">Terakhir</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(h.lastDate)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="bg-gray-900 p-2 rounded-lg">
                      <p className="text-gray-500">Harga CASH</p>
                      <p className={`font-bold ${h.lastPriceCash > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                        {h.lastPriceCash > 0 ? formatCurrency(h.lastPriceCash) : '-'}
                      </p>
                    </div>
                    <div className="bg-gray-900 p-2 rounded-lg">
                      <p className="text-gray-500">Harga TEMPO</p>
                      <p className={`font-bold ${h.lastPriceTempo > 0 ? 'text-orange-400' : 'text-gray-600'}`}>
                        {h.lastPriceTempo > 0 ? formatCurrency(h.lastPriceTempo) : '-'}
                      </p>
                    </div>
                    <div className="bg-gray-900 p-2 rounded-lg">
                      <p className="text-gray-500">Total Qty</p>
                      <p className="font-bold text-white">{h.totalQtyPurchased} pcs</p>
                    </div>
                    <div className="bg-gray-900 p-2 rounded-lg">
                      <p className="text-gray-500">Transaksi</p>
                      <p className="font-bold text-white">{h.purchaseCount}x</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Order Preview Modal
interface OrderPreviewModalProps {
  isOpen: boolean;
  supplier: string;
  items: { partNumber: string; name: string; qty: number; price: number }[];
  storeName: string;
  onClose: () => void;
  onConfirm: () => void;
  onCopyText: () => void;
}

const OrderPreviewModal: React.FC<OrderPreviewModalProps> = ({ 
  isOpen, supplier, items, storeName, onClose, onConfirm, onCopyText 
}) => {
  if (!isOpen) return null;

  const date = new Date().toLocaleDateString('id-ID', { 
    day: '2-digit', month: 'long', year: 'numeric' 
  });

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl my-8">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-900 z-10">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Send className="text-green-400" size={20} /> Preview Order
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <OrderPreviewCard 
            supplier={supplier}
            items={items}
            storeName={storeName}
            date={date}
          />
        </div>

        <div className="p-4 border-t border-gray-700 flex gap-2 sticky bottom-0 bg-gray-900">
          <button 
            onClick={onCopyText}
            className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-500 flex items-center justify-center gap-2"
          >
            <Copy size={18} /> Copy Text
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-500 flex items-center justify-center gap-2"
          >
            <Check size={18} /> Simpan Order
          </button>
        </div>
      </div>
    </div>
  );
};

// Order History Modal
interface OrderHistoryModalProps {
  isOpen: boolean;
  orders: SupplierOrder[];
  onClose: () => void;
  onUpdateStatus: (orderId: number, status: 'PENDING' | 'ORDERED' | 'RECEIVED') => void;
  onDelete: (orderId: number) => void;
  onViewOrder: (order: SupplierOrder) => void;
}

const OrderHistoryModal: React.FC<OrderHistoryModalProps> = ({ 
  isOpen, orders, onClose, onUpdateStatus, onDelete, onViewOrder 
}) => {
  if (!isOpen) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-600 text-yellow-100';
      case 'ORDERED': return 'bg-blue-600 text-blue-100';
      case 'RECEIVED': return 'bg-green-600 text-green-100';
      default: return 'bg-gray-600 text-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING': return <Clock size={12} />;
      case 'ORDERED': return <Truck size={12} />;
      case 'RECEIVED': return <CheckCircle size={12} />;
      default: return <AlertCircle size={12} />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center gap-2">
            <ClipboardList className="text-blue-400" size={20} /> Riwayat Order Supplier
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {orders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <ClipboardList size={40} className="mx-auto mb-2 opacity-50" />
              <p>Belum ada order tersimpan</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div 
                  key={order.id}
                  className="p-4 bg-gray-800 border border-gray-700 rounded-xl"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Truck size={16} className="text-blue-400" />
                        <span className="font-bold text-white">{order.supplier}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${getStatusColor(order.status)}`}>
                          {getStatusIcon(order.status)} {order.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {formatDate(order.created_at || '')} • {order.total_items} barang • {formatCurrency(order.total_value)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => onViewOrder(order)}
                        className="p-2 bg-purple-600/20 hover:bg-purple-600/30 rounded-lg text-purple-400"
                        title="Lihat Detail"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(order.id!)}
                        className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-lg text-red-400"
                        title="Hapus"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Status Buttons */}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => onUpdateStatus(order.id!, 'PENDING')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 ${order.status === 'PENDING' ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                    >
                      <Clock size={12} /> Pending
                    </button>
                    <button
                      onClick={() => onUpdateStatus(order.id!, 'ORDERED')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 ${order.status === 'ORDERED' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                    >
                      <Truck size={12} /> Dipesan
                    </button>
                    <button
                      onClick={() => onUpdateStatus(order.id!, 'RECEIVED')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 ${order.status === 'RECEIVED' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                    >
                      <CheckCircle size={12} /> Diterima
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Main Component
export const BarangKosongView: React.FC = () => {
  const { selectedStore, getStoreConfig } = useStore();
  const storeConfig = getStoreConfig();

  // State
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStatus, setLoadStatus] = useState('');
  const [supplierGroups, setSupplierGroups] = useState<SupplierOrderGroup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockThreshold, setStockThreshold] = useState(5);
  const [priceType, setPriceType] = useState<'cash' | 'tempo'>('cash');
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Record<string, Set<string>>>({});
  const [orderQtys, setOrderQtys] = useState<Record<string, Record<string, number>>>({});
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // History Modal
  const [historyModal, setHistoryModal] = useState<{
    isOpen: boolean;
    partNumber: string;
    itemName: string;
    history: SupplierHistory[];
  }>({ isOpen: false, partNumber: '', itemName: '', history: [] });

  // Order Preview Modal
  const [orderPreview, setOrderPreview] = useState<{
    isOpen: boolean;
    supplier: string;
    items: { partNumber: string; name: string; qty: number; price: number }[];
  }>({ isOpen: false, supplier: '', items: [] });

  // Order History Modal
  const [orderHistoryModal, setOrderHistoryModal] = useState(false);
  const [savedOrders, setSavedOrders] = useState<SupplierOrder[]>([]);

  // View Order Detail Modal
  const [viewOrderDetail, setViewOrderDetail] = useState<SupplierOrder | null>(null);

  // Load data
  const loadData = async () => {
    setLoading(true);
    setLoadProgress(0);
    setLoadStatus('Memulai...');
    try {
      const groups = await getLowStockGroupedBySupplier(
        selectedStore, 
        stockThreshold,
        (progress, status) => {
          setLoadProgress(progress);
          setLoadStatus(status);
        }
      );
      setSupplierGroups(groups);
      
      // Initialize selected items and quantities
      const initialSelected: Record<string, Set<string>> = {};
      const initialQtys: Record<string, Record<string, number>> = {};
      
      groups.forEach(group => {
        initialSelected[group.supplier] = new Set();
        initialQtys[group.supplier] = {};
        group.items.forEach(item => {
          initialQtys[group.supplier][item.partNumber] = 0;
        });
      });
      
      setSelectedItems(initialSelected);
      setOrderQtys(initialQtys);
    } catch (error) {
      console.error('Error loading data:', error);
      showToast('Gagal memuat data', 'error');
    }
    setLoading(false);
  };

  const loadSavedOrders = async () => {
    const orders = await fetchSupplierOrders(selectedStore);
    setSavedOrders(orders);
  };

  useEffect(() => {
    if (selectedStore) {
      loadData();
      loadSavedOrders();
    }
  }, [selectedStore, stockThreshold]);

  // Toast helper
  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Handlers
  const toggleExpand = (supplier: string) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(supplier)) {
        next.delete(supplier);
      } else {
        next.add(supplier);
      }
      return next;
    });
  };

  const toggleItem = (supplier: string, partNumber: string) => {
    setSelectedItems(prev => {
      const supplierSet = new Set(prev[supplier] || []);
      if (supplierSet.has(partNumber)) {
        supplierSet.delete(partNumber);
      } else {
        supplierSet.add(partNumber);
      }
      return { ...prev, [supplier]: supplierSet };
    });
  };

  const selectAll = (supplier: string) => {
    const group = supplierGroups.find(g => g.supplier === supplier);
    if (!group) return;
    
    setSelectedItems(prev => ({
      ...prev,
      [supplier]: new Set(group.items.map(i => i.partNumber))
    }));

    // Also set default qty of 1 for all items
    setOrderQtys(prev => {
      const newQtys = { ...prev[supplier] };
      group.items.forEach(item => {
        if (newQtys[item.partNumber] === 0) {
          newQtys[item.partNumber] = 1;
        }
      });
      return { ...prev, [supplier]: newQtys };
    });
  };

  const deselectAll = (supplier: string) => {
    setSelectedItems(prev => ({
      ...prev,
      [supplier]: new Set()
    }));
  };

  const updateQty = (supplier: string, partNumber: string, qty: number) => {
    setOrderQtys(prev => ({
      ...prev,
      [supplier]: {
        ...prev[supplier],
        [partNumber]: qty
      }
    }));

    // Auto-select if qty > 0
    if (qty > 0) {
      setSelectedItems(prev => {
        const supplierSet = new Set(prev[supplier] || []);
        supplierSet.add(partNumber);
        return { ...prev, [supplier]: supplierSet };
      });
    }
  };

  const viewHistory = async (partNumber: string) => {
    const group = supplierGroups.find(g => g.items.some(i => i.partNumber === partNumber));
    const item = group?.items.find(i => i.partNumber === partNumber);
    
    if (!item) return;

    const history = await fetchSupplierHistoryForItem(selectedStore, partNumber);
    setHistoryModal({
      isOpen: true,
      partNumber,
      itemName: item.name,
      history
    });
  };

  const createOrder = (supplier: string) => {
    const group = supplierGroups.find(g => g.supplier === supplier);
    if (!group) return;

    const selected = selectedItems[supplier] || new Set();
    const qtys = orderQtys[supplier] || {};

    const items = group.items
      .filter(i => selected.has(i.partNumber) && qtys[i.partNumber] > 0)
      .map(i => ({
        partNumber: i.partNumber,
        name: i.name,
        qty: qtys[i.partNumber],
        price: i.lastPrice
      }));

    if (items.length === 0) {
      showToast('Pilih barang dan isi qty terlebih dahulu', 'error');
      return;
    }

    setOrderPreview({ isOpen: true, supplier, items });
  };

  const confirmOrder = async () => {
    const order: SupplierOrder = {
      supplier: orderPreview.supplier,
      items: orderPreview.items,
      status: 'PENDING',
      notes: '',
      total_items: orderPreview.items.length,
      total_value: orderPreview.items.reduce((sum, i) => sum + i.qty * i.price, 0)
    };

    const result = await saveSupplierOrder(selectedStore, order);
    
    if (result.success) {
      showToast('Order berhasil disimpan!', 'success');
      setOrderPreview({ isOpen: false, supplier: '', items: [] });
      
      // Reset selection for this supplier
      setSelectedItems(prev => ({
        ...prev,
        [orderPreview.supplier]: new Set()
      }));
      
      loadSavedOrders();
    } else {
      showToast(result.msg, 'error');
    }
  };

  const copyOrderText = () => {
    const { supplier, items } = orderPreview;
    const storeName = storeConfig?.displayName || selectedStore?.toUpperCase() || 'Toko';
    const date = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    
    let text = `*ORDER BARANG - ${storeName}*\n`;
    text += `Tanggal: ${date}\n`;
    text += `Kepada: ${supplier}\n\n`;
    text += `─────────────────\n`;
    
    items.forEach((item, idx) => {
      text += `${idx + 1}. ${item.partNumber}\n`;
      text += `   ${item.name}\n`;
      text += `   Qty: ${item.qty} pcs\n`;
      if (item.price > 0) {
        text += `   Harga: ${formatCurrency(item.price)}\n`;
      }
      text += `\n`;
    });

    const total = items.reduce((sum, i) => sum + i.qty * i.price, 0);
    const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
    
    text += `─────────────────\n`;
    text += `Total: ${totalQty} pcs\n`;
    if (total > 0) {
      text += `Estimasi: ${formatCurrency(total)}\n`;
    }
    text += `\nTerima kasih 🙏`;

    navigator.clipboard.writeText(text);
    showToast('Text berhasil di-copy!', 'success');
  };

  const handleUpdateOrderStatus = async (orderId: number, status: 'PENDING' | 'ORDERED' | 'RECEIVED') => {
    const result = await updateSupplierOrderStatus(selectedStore, orderId, status);
    if (result.success) {
      showToast('Status diupdate', 'success');
      loadSavedOrders();
    } else {
      showToast(result.msg, 'error');
    }
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (!confirm('Hapus order ini?')) return;
    
    const result = await deleteSupplierOrder(selectedStore, orderId);
    if (result.success) {
      showToast('Order dihapus', 'success');
      loadSavedOrders();
    } else {
      showToast(result.msg, 'error');
    }
  };

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!searchTerm) return supplierGroups;
    
    const term = searchTerm.toLowerCase();
    return supplierGroups.map(group => ({
      ...group,
      items: group.items.filter(item => 
        item.partNumber.toLowerCase().includes(term) ||
        item.name.toLowerCase().includes(term) ||
        (item.brand && item.brand.toLowerCase().includes(term)) ||
        (item.application && item.application.toLowerCase().includes(term))
      )
    })).filter(group => group.items.length > 0);
  }, [supplierGroups, searchTerm]);

  // Stats
  const totalLowStock = supplierGroups.reduce((sum, g) => sum + g.items.length, 0);
  const totalEmpty = supplierGroups.reduce((sum, g) => sum + g.items.filter(i => i.currentStock === 0).length, 0);
  const totalSuppliers = supplierGroups.filter(g => g.supplier !== 'TANPA SUPPLIER').length;
  const pendingOrders = savedOrders.filter(o => o.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-gray-900 pb-24 md:pb-4">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-600/20 p-2 rounded-xl">
                <PackageX size={24} className="text-red-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Barang Kosong</h1>
                <p className="text-xs text-gray-400">Kelola order ke supplier</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setOrderHistoryModal(true)}
                className="relative p-2 bg-purple-600/20 text-purple-400 rounded-xl hover:bg-purple-600/30"
                title="Riwayat Order"
              >
                <ClipboardList size={20} />
                {pendingOrders > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                    {pendingOrders}
                  </span>
                )}
              </button>
              <button
                onClick={loadData}
                disabled={loading}
                className="p-2 bg-blue-600/20 text-blue-400 rounded-xl hover:bg-blue-600/30"
              >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="bg-gray-800 p-3 rounded-xl border border-gray-700">
              <p className="text-[10px] text-gray-400 uppercase">Stok Rendah</p>
              <p className="text-xl font-bold text-yellow-400">{totalLowStock}</p>
            </div>
            <div className="bg-gray-800 p-3 rounded-xl border border-gray-700">
              <p className="text-[10px] text-gray-400 uppercase">Stok Habis</p>
              <p className="text-xl font-bold text-red-400">{totalEmpty}</p>
            </div>
            <div className="bg-gray-800 p-3 rounded-xl border border-gray-700">
              <p className="text-[10px] text-gray-400 uppercase">Supplier</p>
              <p className="text-xl font-bold text-blue-400">{totalSuppliers}</p>
            </div>
            <div className="bg-gray-800 p-3 rounded-xl border border-gray-700">
              <p className="text-[10px] text-gray-400 uppercase">Order Pending</p>
              <p className="text-xl font-bold text-purple-400">{pendingOrders}</p>
            </div>
          </div>

          {/* Search & Filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Cari part number, nama barang..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-gray-500"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <select
                value={stockThreshold}
                onChange={(e) => setStockThreshold(Number(e.target.value))}
                className="pl-9 pr-8 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white appearance-none cursor-pointer"
              >
                <option value={3}>Stok &lt; 3</option>
                <option value={5}>Stok &lt; 5</option>
                <option value={10}>Stok &lt; 10</option>
                <option value={20}>Stok &lt; 20</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            {/* Progress Bar */}
            <div className="w-full max-w-md mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-blue-400">Loading Data...</span>
                <span className="text-sm font-bold text-white">{loadProgress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-600 to-purple-600 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">{loadStatus}</p>
            </div>
            
            {/* Animated Icon */}
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping" />
              <div className="bg-gray-800 p-4 rounded-full border border-gray-700">
                <RefreshCw size={28} className="animate-spin text-blue-500" />
              </div>
            </div>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Package size={48} className="mb-3 opacity-50" />
            <p className="text-lg font-medium text-gray-400">
              {searchTerm ? 'Tidak ada hasil' : 'Semua stok aman!'}
            </p>
            <p className="text-sm">
              {searchTerm ? 'Coba kata kunci lain' : `Tidak ada barang dengan stok < ${stockThreshold}`}
            </p>
          </div>
        ) : (
          <>
            {filteredGroups.map(group => (
              <div key={group.supplier}>
                <SupplierCard
                  supplier={group.supplier}
                  items={group.items}
                  selectedItems={selectedItems[group.supplier] || new Set()}
                  orderQtys={orderQtys[group.supplier] || {}}
                  onToggleItem={(pn) => toggleItem(group.supplier, pn)}
                  onQtyChange={(pn, qty) => updateQty(group.supplier, pn, qty)}
                  onSelectAll={() => selectAll(group.supplier)}
                  onDeselectAll={() => deselectAll(group.supplier)}
                  onViewHistory={viewHistory}
                  isExpanded={expandedSuppliers.has(group.supplier)}
                  onToggleExpand={() => toggleExpand(group.supplier)}
                />

                {/* Create Order Button */}
                {expandedSuppliers.has(group.supplier) && 
                 (selectedItems[group.supplier]?.size || 0) > 0 && 
                 group.supplier !== 'TANPA SUPPLIER' && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => createOrder(group.supplier)}
                      className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-500 flex items-center gap-2 shadow-lg shadow-green-900/50"
                    >
                      <Send size={18} />
                      Buat Order ke {group.supplier}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Modals */}
      <HistoryModal
        isOpen={historyModal.isOpen}
        partNumber={historyModal.partNumber}
        itemName={historyModal.itemName}
        history={historyModal.history}
        onClose={() => setHistoryModal({ isOpen: false, partNumber: '', itemName: '', history: [] })}
      />

      <OrderPreviewModal
        isOpen={orderPreview.isOpen}
        supplier={orderPreview.supplier}
        items={orderPreview.items}
        storeName={storeConfig?.displayName || selectedStore?.toUpperCase() || 'Toko'}
        onClose={() => setOrderPreview({ isOpen: false, supplier: '', items: [] })}
        onConfirm={confirmOrder}
        onCopyText={copyOrderText}
      />

      <OrderHistoryModal
        isOpen={orderHistoryModal}
        orders={savedOrders}
        onClose={() => setOrderHistoryModal(false)}
        onUpdateStatus={handleUpdateOrderStatus}
        onDelete={handleDeleteOrder}
        onViewOrder={(order) => {
          setOrderPreview({
            isOpen: true,
            supplier: order.supplier,
            items: order.items
          });
          setOrderHistoryModal(false);
        }}
      />
    </div>
  );
};
