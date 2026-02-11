// FILE: src/components/finance/BarangKosongView.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PackageX, Search, RefreshCw, ChevronDown, ChevronUp,
  Plus, Minus, ShoppingCart, X, Truck, Package,
  Clock, CreditCard, User, Layers, History, Loader2,
  FileText, Printer, Download, ClipboardList, CheckCircle, Eye, Share2, Image
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { supabase } from '../../services/supabaseClient';

// Types
interface SupplierItem {
  part_number: string;
  nama_barang: string;
  current_stock: number;
  current_stock_mjm?: number;  // Stock from MJM (for BJW view)
  current_stock_bjw?: number;  // Stock from BJW (for BJW view)
  last_price: number;
  last_price_mjm?: number;     // Price from MJM
  last_price_bjw?: number;     // Price from BJW
  last_order_date: string;
  last_order_date_mjm?: string;
  last_order_date_bjw?: string;
  tempo: string;
  brand?: string;
  application?: string;
}

interface SupplierGroup {
  supplier: string;
  items: SupplierItem[];
  totalItems: number;
}

interface CartItem {
  part_number: string;
  nama_barang: string;
  supplier: string;
  qty: number;
  price: number;
  tempo: string;
  brand?: string;
  application?: string;
}

interface PurchaseHistory {
  id: number;
  part_number: string;
  nama_barang: string;
  customer: string;
  qty_masuk: number;
  harga_satuan: number;
  harga_total: number;
  tempo: string;
  created_at: string;
}

interface SupplierOrder {
  id: number;
  po_number: string;
  supplier: string;
  store: string;
  tempo: string;
  total_items: number;
  total_value: number;
  notes: string;
  status: string;
  created_at: string;
  items?: SupplierOrderItem[];
}

interface SupplierOrderItem {
  id: number;
  order_id: number;
  part_number: string;
  nama_barang: string;
  qty: number;
  harga_satuan: number;
  harga_total: number;
}

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

const isUnknownSupplierLabel = (supplier: string) => {
  const normalized = (supplier || '').toUpperCase();
  return normalized.includes('TANPA SUPPLIER') || normalized.includes('UNKNOWN');
};

// Purchase History Modal Component
const PurchaseHistoryModal: React.FC<{
  partNumber: string;
  namaBarang: string;
  store: string | null;
  onClose: () => void;
}> = ({ partNumber, namaBarang, store, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<PurchaseHistory[]>([]);
  
  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const tableMasuk = store === 'bjw' ? 'barang_masuk_bjw' : 'barang_masuk_mjm';
        
        const { data, error } = await supabase
          .from(tableMasuk)
          .select('id, part_number, nama_barang, customer, qty_masuk, harga_satuan, harga_total, tempo, created_at')
          .eq('part_number', partNumber)
          .order('created_at', { ascending: false })
          .limit(50);
        
        if (error) throw error;
        setHistory(data || []);
      } catch (err) {
        console.error('Error fetching purchase history:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchHistory();
  }, [partNumber, store]);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-gray-800 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col border border-gray-700 shadow-2xl m-4">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 rounded-t-2xl">
          <div>
            <h3 className="font-bold text-gray-100 flex items-center gap-2">
              <History className="text-blue-400" size={20} />
              Riwayat Pembelian
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              <span className="font-mono text-blue-400">{partNumber}</span> - {namaBarang}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 className="animate-spin text-blue-500 mb-3" size={32} />
              <p className="text-gray-400">Memuat riwayat...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <History className="text-gray-600 mb-3" size={48} />
              <p className="text-gray-400">Tidak ada riwayat pembelian</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-900/50 sticky top-0">
                <tr className="text-xs text-gray-400 uppercase">
                  <th className="px-3 py-2 text-left">Tanggal</th>
                  <th className="px-3 py-2 text-left">Supplier</th>
                  <th className="px-3 py-2 text-center">Qty</th>
                  <th className="px-3 py-2 text-right">Harga Satuan</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-center">Tempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {history.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-3 py-2 text-sm text-gray-300">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 font-semibold">
                      {item.customer || '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-green-400 font-bold">+{item.qty_masuk}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-gray-300">
                      {formatCurrency(item.harga_satuan || 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-white">
                      {formatCurrency(item.harga_total || 0)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        item.tempo === 'CASH' 
                          ? 'bg-green-900/30 text-green-400' 
                          : 'bg-orange-900/30 text-orange-400'
                      }`}>
                        {item.tempo || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/50 rounded-b-2xl flex justify-between items-center">
          <span className="text-sm text-gray-400">
            {history.length} transaksi ditemukan
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

// Purchase Order Preview Modal (for print/download)
const PurchaseOrderPreview: React.FC<{
  supplier: string;
  items: CartItem[];
  poNumber: string;
  store: string | null;
  onClose: () => void;
  onConfirm: (notes: string) => void;
  saving: boolean;
}> = ({ supplier, items, poNumber, store, onClose, onConfirm, saving }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState('');
  const [saving2, setSaving2] = useState(false);
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const storeName = store === 'bjw' ? 'BJW AUTOPART' : 'MJMAUTOPART 86';
  
  // Generate the PO HTML for print/save
  const generatePOHTML = () => {
    const sortedItemsLocal = [...items].sort((a, b) => b.qty - a.qty);
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Order - ${poNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 30px; background: white; color: #000; }
          .po-container { max-width: 700px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
          .company-name { font-size: 26px; font-weight: bold; color: #1a365d; }
          .po-title { color: #2563eb; font-size: 22px; font-weight: bold; text-align: right; }
          .po-info { text-align: right; font-size: 13px; color: #000; margin-top: 8px; }
          .po-info-row { display: flex; justify-content: flex-end; gap: 10px; margin: 3px 0; }
          .po-info-label { color: #666; font-weight: 500; }
          .po-info-value { font-weight: bold; color: #1a365d; }
          .vendor-section { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 10px 15px; font-weight: bold; font-size: 13px; margin: 25px 0 0; border-radius: 4px 4px 0 0; }
          .vendor-name { padding: 12px 15px; font-weight: bold; color: #1a365d; font-size: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; }
          .items-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          .items-table th { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 12px 15px; text-align: left; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          .items-table th.qty { text-align: center; width: 80px; }
          .items-table td { padding: 10px 15px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #000; background: white; }
          .items-table tr:nth-child(even) td { background: #f8fafc; }
          .items-table .pn { font-weight: bold; color: #1e40af; font-size: 13px; }
          .items-table .name { color: #374151; margin-top: 2px; }
          .items-table .brand { color: #6b7280; font-size: 11px; font-style: italic; margin-top: 2px; }
          .items-table .qty-cell { text-align: center; font-weight: bold; font-size: 15px; color: #1a365d; }
          .notes-section { margin-top: 30px; border: 2px solid #3b82f6; border-radius: 8px; overflow: hidden; }
          .notes-title { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 8px 15px; font-size: 12px; font-weight: bold; font-style: italic; }
          .notes-content { padding: 15px; font-size: 13px; color: #374151; min-height: 60px; white-space: pre-wrap; background: #f8fafc; }
        </style>
      </head>
      <body>
        <div class="po-container">
          <div class="header">
            <div class="company-name">${storeName}</div>
            <div>
              <div class="po-title">PURCHASE ORDER</div>
              <div class="po-info">
                <div class="po-info-row"><span class="po-info-label">DATE</span><span class="po-info-value">${today}</span></div>
                <div class="po-info-row"><span class="po-info-label">P.O. #</span><span class="po-info-value">(${poNumber})</span></div>
              </div>
            </div>
          </div>
          
          <div class="vendor-section">VENDOR</div>
          <div class="vendor-name">${supplier}</div>
          
          <table class="items-table">
            <thead>
              <tr>
                <th>PART NUMBER / NAMA BARANG / APLIKASI</th>
                <th class="qty">QTY</th>
              </tr>
            </thead>
            <tbody>
              ${sortedItemsLocal.map(item => `
                <tr>
                  <td>
                    <div class="pn">${item.part_number}</div>
                    <div class="name">${item.nama_barang}</div>
                    ${item.brand || item.application ? `<div class="brand">${item.brand && item.brand !== '-' ? `Brand: ${item.brand}` : ''}${item.brand && item.brand !== '-' && item.application && item.application !== '-' ? ' | ' : ''}${item.application && item.application !== '-' ? `App: ${item.application}` : ''}</div>` : ''}
                  </td>
                  <td class="qty-cell">${item.qty}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="notes-section">
            <div class="notes-title">Other Comments or Special Instructions</div>
            <div class="notes-content">${notes || ''}</div>
          </div>
        </div>
      </body>
      </html>
    `;
  };
  
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(generatePOHTML());
    printWindow.document.close();
    printWindow.print();
  };
  
  // Save as Image function
  const handleSaveImage = async () => {
    setSaving2(true);
    try {
      // Create a hidden iframe to render the PO
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.style.width = '800px';
      iframe.style.height = '1200px';
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error('Cannot access iframe');
      
      iframeDoc.open();
      iframeDoc.write(generatePOHTML());
      iframeDoc.close();
      
      // Wait for content to render
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Use html2canvas via dynamic import
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(iframeDoc.body, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false
      });
      
      // Remove iframe
      document.body.removeChild(iframe);
      
      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${poNumber}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
      
    } catch (error) {
      console.error('Error saving image:', error);
      alert('Gagal menyimpan gambar. Silakan gunakan Print dan save as PDF.');
    } finally {
      setSaving2(false);
    }
  };
  
  // Share function
  const handleShare = async () => {
    setSaving2(true);
    try {
      // Create a hidden iframe to render the PO
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.style.width = '800px';
      iframe.style.height = '1200px';
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error('Cannot access iframe');
      
      iframeDoc.open();
      iframeDoc.write(generatePOHTML());
      iframeDoc.close();
      
      // Wait for content to render
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Use html2canvas via dynamic import
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(iframeDoc.body, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false
      });
      
      // Remove iframe
      document.body.removeChild(iframe);
      
      // Convert to blob for sharing
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png');
      });
      
      if (!blob) throw new Error('Failed to create image');
      
      const file = new File([blob], `${poNumber}.png`, { type: 'image/png' });
      
      // Check if Web Share API is supported
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Purchase Order - ${poNumber}`,
          text: `PO ${poNumber} untuk ${supplier}`,
          files: [file]
        });
      } else {
        // Fallback: download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${poNumber}.png`;
        a.click();
        URL.revokeObjectURL(url);
        alert('Share tidak didukung di browser ini. Gambar telah diunduh.');
      }
      
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error sharing:', error);
        alert('Gagal share gambar.');
      }
    } finally {
      setSaving2(false);
    }
  };
  
  // Group items by part_number first part (brand identifier if any)
  const sortedItems = [...items].sort((a, b) => a.qty - b.qty).reverse();
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl m-4">
        {/* Preview Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-100 rounded-t-2xl">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <FileText className="text-blue-600" size={20} />
            Preview Purchase Order
          </h3>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSaveImage}
              disabled={saving2}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded transition-colors disabled:opacity-50"
              title="Simpan sebagai gambar"
            >
              {saving2 ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Simpan
            </button>
            <button 
              onClick={handleShare}
              disabled={saving2}
              className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded transition-colors disabled:opacity-50"
              title="Share gambar"
            >
              {saving2 ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />} Share
            </button>
            <button 
              onClick={handlePrint}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded transition-colors"
            >
              <Printer size={16} /> Print
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-600">
              <X size={20} />
            </button>
          </div>
        </div>
        
        {/* PO Preview Content */}
        <div ref={printRef} className="flex-1 overflow-auto p-6 bg-white">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div className="text-2xl font-bold text-gray-800">{storeName}</div>
            <div className="text-right">
              <div className="text-xl font-bold text-blue-700">PURCHASE ORDER</div>
              <table className="text-sm mt-2">
                <tbody>
                  <tr>
                    <td className="pr-4 text-gray-500 font-medium">DATE</td>
                    <td className="font-bold text-gray-800">{today}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-gray-500 font-medium">P.O. #</td>
                    <td className="font-bold text-gray-800">({poNumber})</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Vendor */}
          <div className="bg-blue-800 text-white px-3 py-2 font-bold text-sm">VENDOR</div>
          <div className="px-3 py-2 font-bold text-gray-800 border-b">{supplier}</div>
          
          {/* Items Table */}
          <table className="w-full mt-4 text-sm">
            <thead>
              <tr className="bg-blue-800 text-white">
                <th className="px-3 py-2 text-left">PART NUMBER / NAMA BARANG / APLIKASI</th>
                <th className="px-3 py-2 text-center w-20">QTY</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-200">
                  <td className="px-3 py-2">
                    <div className="font-bold text-gray-900">{item.part_number}</div>
                    <div className="text-gray-700">{item.nama_barang}</div>
                    {(item.brand || item.application) && (
                      <div className="text-xs text-gray-500 italic">
                        {item.brand && item.brand !== '-' ? `Brand: ${item.brand}` : ''}
                        {item.brand && item.brand !== '-' && item.application && item.application !== '-' ? ' | ' : ''}
                        {item.application && item.application !== '-' ? `App: ${item.application}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-bold text-lg text-gray-900">{item.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Notes */}
          <div className="mt-8 border border-gray-300">
            <div className="bg-blue-800 text-white px-3 py-1 text-xs font-bold">Other Comments or Special Instructions</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tulis catatan tambahan disini..."
              className="w-full p-3 min-h-[60px] text-sm text-gray-700 border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t bg-gray-100 rounded-b-2xl flex justify-between items-center">
          <span className="text-sm text-gray-600">
            {items.length} item, Total Qty: {items.reduce((sum, i) => sum + i.qty, 0)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              onClick={() => onConfirm(notes)}
              disabled={saving}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              Simpan & Kirim
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Order History Modal
const OrderHistoryModal: React.FC<{
  store: string | null;
  onClose: () => void;
}> = ({ store, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<SupplierOrder | null>(null);
  
  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('supplier_orders')
          .select('*')
          .eq('store', store || 'mjm')
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (error) throw error;
        
        // Check status for pending orders - compare with current stock
        const ordersWithUpdatedStatus = await Promise.all(
          (data || []).map(async (order) => {
            if (order.status !== 'PENDING') return order;
            
            // Fetch order items
            const { data: items } = await supabase
              .from('supplier_order_items')
              .select('*')
              .eq('order_id', order.id);
            
            if (!items || items.length === 0) return order;
            
            // Fetch current stock for these items
            const tableBase = store === 'bjw' ? 'base_bjw' : 'base_mjm';
            const partNumbers = items.map(i => i.part_number);
            
            const { data: stockData } = await supabase
              .from(tableBase)
              .select('part_number, quantity')
              .in('part_number', partNumbers);
            
            if (!stockData) return order;
            
            // Create stock map
            const stockMap: Record<string, number> = {};
            stockData.forEach(s => { stockMap[s.part_number] = s.quantity || 0; });
            
            // Check if ALL items have stock >= ordered qty
            const allItemsReceived = items.every(item => {
              const currentStock = stockMap[item.part_number] || 0;
              return currentStock >= item.qty;
            });
            
            if (allItemsReceived) {
              // Update status to OK in database
              await supabase
                .from('supplier_orders')
                .update({ status: 'OK' })
                .eq('id', order.id);
              
              return { ...order, status: 'OK' };
            }
            
            return order;
          })
        );
        
        setOrders(ordersWithUpdatedStatus);
      } catch (err) {
        console.error('Error fetching orders:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchOrders();
  }, [store]);
  
  const fetchOrderItems = async (orderId: number) => {
    const { data } = await supabase
      .from('supplier_order_items')
      .select('*')
      .eq('order_id', orderId);
    return data || [];
  };
  
  const handleViewOrder = async (order: SupplierOrder) => {
    const items = await fetchOrderItems(order.id);
    setSelectedOrder({ ...order, items });
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OK': return 'bg-green-900/30 text-green-400';
      case 'RECEIVED': return 'bg-green-900/30 text-green-400';
      case 'SENT': return 'bg-blue-900/30 text-blue-400';
      case 'CANCELLED': return 'bg-red-900/30 text-red-400';
      default: return 'bg-yellow-900/30 text-yellow-400';
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-gray-800 rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col border border-gray-700 shadow-2xl m-4">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 rounded-t-2xl">
          <h3 className="font-bold text-gray-100 flex items-center gap-2">
            <ClipboardList className="text-purple-400" size={20} />
            Riwayat Purchase Order
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 className="animate-spin text-blue-500 mb-3" size={32} />
              <p className="text-gray-400">Memuat riwayat order...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <ClipboardList className="text-gray-600 mb-3" size={48} />
              <p className="text-gray-400">Belum ada riwayat order</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-900/50 sticky top-0">
                <tr className="text-xs text-gray-400 uppercase">
                  <th className="px-3 py-2 text-left">P.O. Number</th>
                  <th className="px-3 py-2 text-left">Supplier</th>
                  <th className="px-3 py-2 text-center">Items</th>
                  <th className="px-3 py-2 text-right">Estimasi</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Tanggal</th>
                  <th className="px-3 py-2 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-3 py-2">
                      <span className="font-mono text-sm text-blue-400">{order.po_number}</span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 font-semibold">
                      {order.supplier}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-white font-bold">{order.total_items}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-gray-300">
                      {formatCurrency(order.total_value || 0)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-gray-400">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleViewOrder(order)}
                        className="p-1.5 bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white rounded transition-colors"
                        title="Lihat Detail"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/50 rounded-b-2xl flex justify-between items-center">
          <span className="text-sm text-gray-400">
            {orders.length} order ditemukan
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
      
      {/* Order Detail Modal with Print */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-gray-700 shadow-2xl m-4">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 rounded-t-xl">
              <div>
                <h4 className="font-bold text-white flex items-center gap-2">
                  <FileText className="text-blue-400" size={18} />
                  {selectedOrder.po_number}
                </h4>
                <p className="text-sm text-gray-400">Supplier: {selectedOrder.supplier}</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    const storeName = store === 'bjw' ? 'BJW AUTOPART' : 'MJMAUTOPART 86';
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    printWindow.document.write(`
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <title>Purchase Order - ${selectedOrder.po_number}</title>
                        <style>
                          * { margin: 0; padding: 0; box-sizing: border-box; }
                          body { font-family: Arial, sans-serif; padding: 20px; background: white; color: #000; }
                          .po-container { max-width: 800px; margin: 0 auto; }
                          .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
                          .company-name { font-size: 24px; font-weight: bold; color: #000; }
                          .po-title { color: #1a365d; font-size: 20px; font-weight: bold; }
                          .po-info { text-align: right; font-size: 12px; color: #000; }
                          .po-info td { padding: 2px 8px; }
                          .vendor-section { background: #1a365d; color: white; padding: 8px 12px; font-weight: bold; margin: 20px 0 10px; }
                          .vendor-name { padding: 8px 12px; font-weight: bold; color: #000; font-size: 14px; border-bottom: 2px solid #1a365d; }
                          .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                          .items-table th { background: #1a365d; color: white; padding: 10px; text-align: left; font-size: 12px; font-weight: bold; }
                          .items-table td { padding: 8px 10px; border-bottom: 1px solid #ccc; font-size: 11px; color: #000; }
                          .items-table .pn { font-weight: bold; color: #000; }
                          .items-table .name { color: #333; }
                          .items-table .qty { text-align: center; font-weight: bold; font-size: 13px; color: #000; }
                          .notes-section { margin-top: 30px; border: 2px solid #1a365d; padding: 10px; min-height: 80px; }
                          .notes-title { background: #1a365d; color: white; padding: 5px 10px; font-size: 11px; font-weight: bold; margin: -10px -10px 10px; }
                          .notes-content { padding: 10px 0; font-size: 12px; color: #000; white-space: pre-wrap; }
                          @media print { body { padding: 0; } }
                        </style>
                      </head>
                      <body>
                        <div class="po-container">
                          <div class="header">
                            <div class="company-name">${storeName}</div>
                            <div>
                              <div class="po-title">PURCHASE ORDER</div>
                              <table class="po-info">
                                <tr><td style="color:#333;">DATE</td><td style="font-weight:bold;color:#000;">${formatDate(selectedOrder.created_at)}</td></tr>
                                <tr><td style="color:#333;">P.O. #</td><td style="font-weight:bold;color:#000;">(${selectedOrder.po_number})</td></tr>
                              </table>
                            </div>
                          </div>
                          
                          <div class="vendor-section">VENDOR</div>
                          <div class="vendor-name">${selectedOrder.supplier}</div>
                          
                          <table class="items-table">
                            <thead>
                              <tr>
                                <th style="width: 65%;">PART NUMBER / NAMA BARANG</th>
                                <th class="qty" style="width: 15%;">QTY</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${(selectedOrder.items || []).map(item => `
                                <tr>
                                  <td>
                                    <div class="pn">${item.part_number}</div>
                                    <div class="name">${item.nama_barang}</div>
                                  </td>
                                  <td class="qty">${item.qty}</td>
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                          
                          <div class="notes-section">
                            <div class="notes-title">Other Comments or Special Instructions</div>
                            <div class="notes-content">${selectedOrder.notes || ''}</div>
                          </div>
                        </div>
                      </body>
                      </html>
                    `);
                    printWindow.document.close();
                    printWindow.print();
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded transition-colors"
                >
                  <Printer size={14} /> Print
                </button>
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-700 rounded-full">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {/* Status Badge */}
              <div className="mb-4 flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${getStatusColor(selectedOrder.status)}`}>
                  {selectedOrder.status}
                </span>
                <span className="text-sm text-gray-400">
                  {selectedOrder.total_items} item | Estimasi: {formatCurrency(selectedOrder.total_value || 0)}
                </span>
              </div>
              
              <table className="w-full text-sm">
                <thead className="bg-gray-900/50">
                  <tr className="text-xs text-gray-400 uppercase">
                    <th className="px-3 py-2 text-left">Part Number</th>
                    <th className="px-3 py-2 text-left">Nama Barang</th>
                    <th className="px-3 py-2 text-center">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {selectedOrder.items?.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 font-mono text-blue-400">{item.part_number}</td>
                      <td className="px-3 py-2 text-gray-200">{item.nama_barang}</td>
                      <td className="px-3 py-2 text-center font-bold text-white">{item.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Notes Section */}
              {selectedOrder.notes && (
                <div className="mt-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                  <div className="text-xs text-gray-400 mb-1">Catatan:</div>
                  <div className="text-sm text-gray-200 whitespace-pre-wrap">{selectedOrder.notes}</div>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-700 flex justify-between items-center">
              <span className="text-sm text-gray-400">
                Dibuat: {formatDate(selectedOrder.created_at)}
              </span>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Supplier Card Component
const SupplierCard: React.FC<{
  group: SupplierGroup;
  isExpanded: boolean;
  onToggle: () => void;
  cart: CartItem[];
  onAddToCart: (item: SupplierItem, supplier: string) => void;
  onRemoveFromCart: (partNumber: string) => void;
  onUpdateQty: (partNumber: string, qty: number) => void;
  onViewHistory: (item: SupplierItem) => void;
  supplierOptions: string[];
  isBJW?: boolean;
}> = ({ group, isExpanded, onToggle, cart, onAddToCart, onRemoveFromCart, onUpdateQty, onViewHistory, supplierOptions, isBJW = false }) => {
  const cartItemsFromSupplier = cart.filter(c => c.supplier === group.supplier);
  const totalInCart = cartItemsFromSupplier.reduce((sum, c) => sum + c.qty, 0);
  const isUnknownGroup = isUnknownSupplierLabel(group.supplier);
  const [selectedSupplierByItem, setSelectedSupplierByItem] = useState<Record<string, string>>({});
  
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <User size={20} className="text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-white text-lg">{group.supplier}</h3>
            <p className="text-xs text-gray-400">{group.totalItems} item tersedia</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalInCart > 0 && (
            <span className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full">
              {totalInCart} di keranjang
            </span>
          )}
          {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
        </div>
      </button>
      
      {/* Items List */}
      {isExpanded && (
        <div className="border-t border-gray-700">
          <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-900/50 sticky top-0">
                <tr className="text-xs text-gray-400 uppercase">
                  <th className="px-4 py-2 text-left">Part Number</th>
                  <th className="px-4 py-2 text-left">Nama / Brand / Aplikasi</th>
                  {isBJW ? (
                    <>
                      <th className="px-2 py-2 text-center bg-blue-900/30">
                        <div className="text-blue-400">Stok</div>
                        <div className="text-[10px] text-blue-300">MJM</div>
                      </th>
                      <th className="px-2 py-2 text-center bg-purple-900/30">
                        <div className="text-purple-400">Stok</div>
                        <div className="text-[10px] text-purple-300">BJW</div>
                      </th>
                      <th className="px-2 py-2 text-right bg-blue-900/30">
                        <div className="text-blue-400">Harga</div>
                        <div className="text-[10px] text-blue-300">MJM</div>
                      </th>
                      <th className="px-2 py-2 text-right bg-purple-900/30">
                        <div className="text-purple-400">Harga</div>
                        <div className="text-[10px] text-purple-300">BJW</div>
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-2 text-center">Stok</th>
                      <th className="px-4 py-2 text-right">Harga Terakhir</th>
                    </>
                  )}
                  <th className="px-4 py-2 text-center">Order Terakhir</th>
                  <th className="px-4 py-2 text-center w-32">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {group.items.map((item) => {
                  const inCart = cart.find(c => c.part_number === item.part_number);
                  
                  // Stock colors for BJW view
                  const stockMJM = item.current_stock_mjm || 0;
                  const stockBJW = item.current_stock_bjw || 0;
                  const stockMJMColor = stockMJM === 0 
                    ? 'text-red-400 bg-red-900/30' 
                    : stockMJM <= 5 
                      ? 'text-yellow-400 bg-yellow-900/30' 
                      : 'text-green-400 bg-green-900/30';
                  const stockBJWColor = stockBJW === 0 
                    ? 'text-red-400 bg-red-900/30' 
                    : stockBJW <= 5 
                      ? 'text-yellow-400 bg-yellow-900/30' 
                      : 'text-green-400 bg-green-900/30';
                  
                  // Single stock color for MJM view
                  const stockColor = item.current_stock === 0 
                    ? 'text-red-400 bg-red-900/30' 
                    : item.current_stock <= 5 
                      ? 'text-yellow-400 bg-yellow-900/30' 
                      : 'text-green-400 bg-green-900/30';
                  
                  return (
                    <tr key={item.part_number} className="hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-blue-400">{item.part_number}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-200 font-semibold">{item.nama_barang}</span>
                          <span className="text-xs text-gray-400">
                            {item.brand && item.brand !== '-' ? `Brand: ${item.brand}` : ''} 
                            {item.brand && item.brand !== '-' && item.application && item.application !== '-' ? ' | ' : ''}
                            {item.application && item.application !== '-' ? `App: ${item.application}` : ''}
                          </span>
                        </div>
                      </td>
                      {isBJW ? (
                        <>
                          {/* Stock MJM */}
                          <td className="px-2 py-3 text-center bg-blue-900/10">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${stockMJMColor}`}>
                              {stockMJM}
                            </span>
                          </td>
                          {/* Stock BJW */}
                          <td className="px-2 py-3 text-center bg-purple-900/10">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${stockBJWColor}`}>
                              {stockBJW}
                            </span>
                          </td>
                          {/* Harga MJM */}
                          <td className="px-2 py-3 text-right bg-blue-900/10">
                            <span className="text-xs text-blue-300">
                              {item.last_price_mjm ? formatCurrency(item.last_price_mjm) : '-'}
                            </span>
                          </td>
                          {/* Harga BJW */}
                          <td className="px-2 py-3 bg-purple-900/10">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs text-purple-300">
                                {item.last_price_bjw ? formatCurrency(item.last_price_bjw) : '-'}
                              </span>
                              <button
                                onClick={() => onViewHistory(item)}
                                className="p-1 bg-gray-700 hover:bg-blue-600 text-gray-400 hover:text-white rounded transition-colors"
                                title="Lihat riwayat harga"
                              >
                                <History size={12} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${stockColor}`}>
                              {item.current_stock}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm text-gray-300">{formatCurrency(item.last_price)}</span>
                              <button
                                onClick={() => onViewHistory(item)}
                                className="p-1 bg-gray-700 hover:bg-blue-600 text-gray-400 hover:text-white rounded transition-colors"
                                title="Lihat riwayat harga"
                              >
                                <History size={14} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-gray-400">
                          {isBJW 
                            ? formatDate(item.last_order_date_bjw || item.last_order_date_mjm || '')
                            : formatDate(item.last_order_date)
                          }
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {inCart ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => onUpdateQty(item.part_number, inCart.qty - 1)}
                              className="p-1 bg-gray-600 hover:bg-gray-500 rounded transition-colors"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center font-bold text-white">{inCart.qty}</span>
                            <button
                              onClick={() => onUpdateQty(item.part_number, inCart.qty + 1)}
                              className="p-1 bg-gray-600 hover:bg-gray-500 rounded transition-colors"
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              onClick={() => onRemoveFromCart(item.part_number)}
                              className="p-1 bg-red-600/30 hover:bg-red-600 text-red-400 hover:text-white rounded transition-colors ml-1"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          isUnknownGroup && supplierOptions.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              <select
                                value={selectedSupplierByItem[item.part_number] || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedSupplierByItem(prev => ({ ...prev, [item.part_number]: value }));
                                }}
                                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-[10px] text-gray-200 focus:border-blue-500 outline-none"
                              >
                                <option value="">Pilih Supplier</option>
                                {supplierOptions.map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => onAddToCart(item, selectedSupplierByItem[item.part_number])}
                                disabled={!selectedSupplierByItem[item.part_number]}
                                className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded transition-colors disabled:opacity-60"
                              >
                                <Plus size={14} /> Keranjang
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => onAddToCart(item, group.supplier)}
                              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded transition-colors"
                            >
                              <Plus size={14} /> Keranjang
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// Cart Sidebar Component
const CartSidebar: React.FC<{
  cart: CartItem[];
  onUpdateQty: (partNumber: string, qty: number) => void;
  onRemove: (partNumber: string) => void;
  onClear: () => void;
  onCheckoutSupplier: (supplier: string) => void;
}> = ({ cart, onUpdateQty, onRemove, onClear, onCheckoutSupplier }) => {
  const groupedBySupplier = useMemo(() => {
    const groups: Record<string, CartItem[]> = {};
    cart.forEach(item => {
      if (!groups[item.supplier]) groups[item.supplier] = [];
      groups[item.supplier].push(item);
    });
    return groups;
  }, [cart]);
  
  const totalItems = cart.reduce((sum, c) => sum + c.qty, 0);
  const totalValue = cart.reduce((sum, c) => sum + (c.qty * c.price), 0);
  
  if (cart.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 text-center">
        <ShoppingCart size={48} className="mx-auto text-gray-600 mb-3" />
        <p className="text-gray-400">Keranjang kosong</p>
        <p className="text-xs text-gray-500 mt-1">Tambahkan item untuk order ke supplier</p>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h3 className="font-bold text-white flex items-center gap-2">
          <ShoppingCart size={18} className="text-green-400" />
          Keranjang Order
        </h3>
        <button
          onClick={onClear}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Kosongkan
        </button>
      </div>
      
      <div className="max-h-[400px] overflow-y-auto p-3 space-y-4">
        {Object.entries(groupedBySupplier).map(([supplier, items]) => {
          const supplierTotal = items.reduce((sum, i) => sum + i.qty, 0);
          const supplierValue = items.reduce((sum, i) => sum + (i.qty * i.price), 0);
          
          return (
            <div key={supplier} className="bg-gray-900/50 rounded-lg p-3">
              <h4 className="font-bold text-sm text-blue-400 mb-2 flex items-center gap-2">
                <Truck size={14} /> {supplier}
              </h4>
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.part_number} className="flex items-center justify-between text-xs bg-gray-800/50 rounded-lg p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-300 truncate font-medium">{item.nama_barang}</p>
                      <p className="text-gray-500 font-mono text-[10px]">{item.part_number}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-green-400 font-bold">{item.price > 0 ? formatCurrency(item.price) : 'Harga belum ada'}</span>
                        <span className="text-gray-500">×</span>
                        <span className="text-blue-400">{item.qty}</span>
                        <span className="text-gray-500">=</span>
                        <span className="text-yellow-400 font-bold">{formatCurrency(item.price * item.qty)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onUpdateQty(item.part_number, item.qty - 1)}
                          className="p-0.5 bg-gray-700 hover:bg-gray-600 rounded"
                        >
                          <Minus size={10} />
                        </button>
                        <span className="w-6 text-center font-bold">{item.qty}</span>
                        <button
                          onClick={() => onUpdateQty(item.part_number, item.qty + 1)}
                          className="p-0.5 bg-gray-700 hover:bg-gray-600 rounded"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                      <button
                        onClick={() => onRemove(item.part_number)}
                        className="p-1 text-red-400 hover:text-red-300"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Per-supplier checkout button */}
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-gray-400">{supplierTotal} item</span>
                  <span className="text-green-400 font-bold">{formatCurrency(supplierValue)}</span>
                </div>
                <button
                  onClick={() => onCheckoutSupplier(supplier)}
                  className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1"
                >
                  <FileText size={14} /> Buat PO {supplier}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="p-4 border-t border-gray-700 bg-gray-900/50">
        <div className="flex justify-between text-sm mb-3">
          <span className="text-gray-400">Total Item:</span>
          <span className="font-bold text-white">{totalItems} pcs</span>
        </div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-400">Estimasi Total:</span>
          <span className="font-bold text-green-400">{formatCurrency(totalValue)}</span>
        </div>
        <p className="text-xs text-gray-500 text-center mt-2">
          Klik "Buat PO" per supplier untuk proses order
        </p>
      </div>
    </div>
  );
};

// Main Component
export const BarangKosongView: React.FC = () => {
  const { selectedStore } = useStore();
  
  // State
  const [activeTab, setActiveTab] = useState<'TEMPO' | 'CASH'>('TEMPO');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('');
  const [selectedPartNoFilter, setSelectedPartNoFilter] = useState<string>('');
  const [supplierGroups, setSupplierGroups] = useState<SupplierGroup[]>([]);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [cart, setCart] = useState<CartItem[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [historyItem, setHistoryItem] = useState<SupplierItem | null>(null);
  const [showPOPreview, setShowPOPreview] = useState(false);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [currentPONumber, setCurrentPONumber] = useState('');
  const [currentSupplier, setCurrentSupplier] = useState<string>('');
  
  // Tempo values for filtering
  const TEMPO_VALUES = ['3 BLN', '2 BLN', '1 BLN'];
  
  // Fetch data - for BJW, also fetch from MJM
  const fetchData = async () => {
    setLoading(true);
    try {
      const isBJW = selectedStore === 'bjw';
      const normalizePN = (pn: string): string => pn?.trim().toUpperCase().replace(/\s+/g, ' ') || '';
      
      interface BaseItemInfo {
        quantity: number;
        name: string;
        brand: string;
        application: string;
      }
      
      // For BJW: fetch from BOTH barang_masuk_mjm and barang_masuk_bjw
      // For MJM: fetch only from barang_masuk_mjm
      
      // Fetch base data from BOTH stores
      const { data: baseMJMData } = await supabase
        .from('base_mjm')
        .select('part_number, name, quantity, brand, application');
      
      const { data: baseBJWData } = await supabase
        .from('base_bjw')
        .select('part_number, name, quantity, brand, application');
      
      // Create lookup maps for both stores
      const baseMJMMap: Record<string, BaseItemInfo> = {};
      const baseBJWMap: Record<string, BaseItemInfo> = {};
      const baseMJMMapNormalized: Record<string, BaseItemInfo> = {};
      const baseBJWMapNormalized: Record<string, BaseItemInfo> = {};
      
      (baseMJMData || []).forEach(item => {
        const info: BaseItemInfo = {
          quantity: item.quantity || 0,
          name: item.name || '-',
          brand: item.brand || '-',
          application: item.application || '-'
        };
        baseMJMMap[item.part_number] = info;
        baseMJMMapNormalized[normalizePN(item.part_number)] = info;
      });
      
      (baseBJWData || []).forEach(item => {
        const info: BaseItemInfo = {
          quantity: item.quantity || 0,
          name: item.name || '-',
          brand: item.brand || '-',
          application: item.application || '-'
        };
        baseBJWMap[item.part_number] = info;
        baseBJWMapNormalized[normalizePN(item.part_number)] = info;
      });
      
      // Helper to get base item info
      const getBaseMJMInfo = (pn: string): BaseItemInfo | null => {
        return baseMJMMap[pn] || baseMJMMapNormalized[normalizePN(pn)] || null;
      };
      
      const getBaseBJWInfo = (pn: string): BaseItemInfo | null => {
        return baseBJWMap[pn] || baseBJWMapNormalized[normalizePN(pn)] || null;
      };
      
      // Fetch barang masuk data
      let masukDataMJM: any[] = [];
      let masukDataBJW: any[] = [];
      
      // Always fetch MJM data (for both BJW and MJM views)
      let queryMJM = supabase
        .from('barang_masuk_mjm')
        .select('part_number, nama_barang, customer, harga_satuan, tempo, created_at')
        .order('created_at', { ascending: false });
      
      if (activeTab === 'TEMPO') {
        queryMJM = queryMJM.in('tempo', TEMPO_VALUES);
      } else {
        queryMJM = queryMJM.eq('tempo', 'CASH');
      }
      
      const { data: mjmData, error: mjmError } = await queryMJM;
      if (mjmError) throw mjmError;
      masukDataMJM = mjmData || [];
      
      // For BJW view, also fetch BJW data
      if (isBJW) {
        let queryBJW = supabase
          .from('barang_masuk_bjw')
          .select('part_number, nama_barang, customer, harga_satuan, tempo, created_at')
          .order('created_at', { ascending: false });
        
        if (activeTab === 'TEMPO') {
          queryBJW = queryBJW.in('tempo', TEMPO_VALUES);
        } else {
          queryBJW = queryBJW.eq('tempo', 'CASH');
        }
        
        const { data: bjwData, error: bjwError } = await queryBJW;
        if (bjwError) throw bjwError;
        masukDataBJW = bjwData || [];
      }
      
      // Group by customer (supplier)
      const supplierMap: Record<string, Map<string, SupplierItem>> = {};
      
      // Process MJM data
      masukDataMJM.forEach(row => {
        const supplier = row.customer?.trim() || 'UNKNOWN';
        const pn = row.part_number;
        
        if (!pn) return;
        
        // For BJW view: item must exist in EITHER base table
        // For MJM view: item must exist in base_mjm
        const baseMJMInfo = getBaseMJMInfo(pn);
        const baseBJWInfo = isBJW ? getBaseBJWInfo(pn) : null;
        
        if (!isBJW && !baseMJMInfo) return; // MJM view: skip if not in base_mjm
        if (isBJW && !baseMJMInfo && !baseBJWInfo) return; // BJW view: skip if not in either
        
        // Use MJM info primarily, fall back to BJW
        const baseInfo = baseMJMInfo || baseBJWInfo;
        
        if (!supplierMap[supplier]) {
          supplierMap[supplier] = new Map();
        }
        
        // Only keep the latest entry per part_number
        if (!supplierMap[supplier].has(pn)) {
          const item: SupplierItem = {
            part_number: pn,
            nama_barang: baseInfo?.name || row.nama_barang || '-',
            current_stock: isBJW ? (baseBJWInfo?.quantity || 0) : (baseMJMInfo?.quantity || 0),
            current_stock_mjm: baseMJMInfo?.quantity || 0,
            current_stock_bjw: baseBJWInfo?.quantity || 0,
            last_price: isBJW ? 0 : (row.harga_satuan || 0),
            last_price_mjm: row.harga_satuan || 0,
            last_price_bjw: 0,
            last_order_date: isBJW ? '' : row.created_at,
            last_order_date_mjm: row.created_at,
            last_order_date_bjw: '',
            tempo: row.tempo,
            brand: baseInfo?.brand || '-',
            application: baseInfo?.application || '-'
          };
          supplierMap[supplier].set(pn, item);
        }
      });
      
      // Process BJW data (for BJW view only)
      if (isBJW) {
        masukDataBJW.forEach(row => {
          const supplier = row.customer?.trim() || 'UNKNOWN';
          const pn = row.part_number;
          
          if (!pn) return;
          
          const baseMJMInfo = getBaseMJMInfo(pn);
          const baseBJWInfo = getBaseBJWInfo(pn);
          
          if (!baseMJMInfo && !baseBJWInfo) return;
          
          const baseInfo = baseBJWInfo || baseMJMInfo;
          
          if (!supplierMap[supplier]) {
            supplierMap[supplier] = new Map();
          }
          
          const existing = supplierMap[supplier].get(pn);
          if (existing) {
            // Update BJW specific data
            existing.last_price_bjw = row.harga_satuan || 0;
            existing.last_order_date_bjw = row.created_at;
            existing.last_price = row.harga_satuan || existing.last_price;
            existing.last_order_date = row.created_at || existing.last_order_date;
          } else {
            // New item from BJW
            const item: SupplierItem = {
              part_number: pn,
              nama_barang: baseInfo?.name || row.nama_barang || '-',
              current_stock: baseBJWInfo?.quantity || 0,
              current_stock_mjm: baseMJMInfo?.quantity || 0,
              current_stock_bjw: baseBJWInfo?.quantity || 0,
              last_price: row.harga_satuan || 0,
              last_price_mjm: 0,
              last_price_bjw: row.harga_satuan || 0,
              last_order_date: row.created_at,
              last_order_date_mjm: '',
              last_order_date_bjw: row.created_at,
              tempo: row.tempo,
              brand: baseInfo?.brand || '-',
              application: baseInfo?.application || '-'
            };
            supplierMap[supplier].set(pn, item);
          }
        });
      }
      
      // Add items from base tables that have NO supplier (not in any barang_masuk)
      // This applies to BOTH MJM and BJW views
      const allPartNumbersWithSupplier = new Set<string>();
      Object.values(supplierMap).forEach(itemsMap => {
        itemsMap.forEach((_, pn) => allPartNumbersWithSupplier.add(pn));
      });
      
      // Add items from base tables that don't have supplier
      const noSupplierKey = '⚠️ TANPA SUPPLIER';
      
      if (isBJW) {
        // For BJW: Check both base_mjm and base_bjw items
        (baseMJMData || []).forEach(item => {
          if (!allPartNumbersWithSupplier.has(item.part_number)) {
            const baseBJWInfo = getBaseBJWInfo(item.part_number);
            
            if (!supplierMap[noSupplierKey]) {
              supplierMap[noSupplierKey] = new Map();
            }
            
            if (!supplierMap[noSupplierKey].has(item.part_number)) {
              supplierMap[noSupplierKey].set(item.part_number, {
                part_number: item.part_number,
                nama_barang: item.name || '-',
                current_stock: baseBJWInfo?.quantity || 0,
                current_stock_mjm: item.quantity || 0,
                current_stock_bjw: baseBJWInfo?.quantity || 0,
                last_price: 0,
                last_price_mjm: 0,
                last_price_bjw: 0,
                last_order_date: '',
                last_order_date_mjm: '',
                last_order_date_bjw: '',
                tempo: '-',
                brand: item.brand || '-',
                application: item.application || '-'
              });
              allPartNumbersWithSupplier.add(item.part_number);
            }
          }
        });
        
        // Check base_bjw items
        (baseBJWData || []).forEach(item => {
          if (!allPartNumbersWithSupplier.has(item.part_number)) {
            const baseMJMInfo = getBaseMJMInfo(item.part_number);
            
            if (!supplierMap[noSupplierKey]) {
              supplierMap[noSupplierKey] = new Map();
            }
            
            if (!supplierMap[noSupplierKey].has(item.part_number)) {
              supplierMap[noSupplierKey].set(item.part_number, {
                part_number: item.part_number,
                nama_barang: item.name || '-',
                current_stock: item.quantity || 0,
                current_stock_mjm: baseMJMInfo?.quantity || 0,
                current_stock_bjw: item.quantity || 0,
                last_price: 0,
                last_price_mjm: 0,
                last_price_bjw: 0,
                last_order_date: '',
                last_order_date_mjm: '',
                last_order_date_bjw: '',
                tempo: '-',
                brand: item.brand || '-',
                application: item.application || '-'
              });
              allPartNumbersWithSupplier.add(item.part_number);
            }
          }
        });
      } else {
        // For MJM: Check only base_mjm items
        (baseMJMData || []).forEach(item => {
          if (!allPartNumbersWithSupplier.has(item.part_number)) {
            if (!supplierMap[noSupplierKey]) {
              supplierMap[noSupplierKey] = new Map();
            }
            
            if (!supplierMap[noSupplierKey].has(item.part_number)) {
              supplierMap[noSupplierKey].set(item.part_number, {
                part_number: item.part_number,
                nama_barang: item.name || '-',
                current_stock: item.quantity || 0,
                current_stock_mjm: item.quantity || 0,
                current_stock_bjw: 0,
                last_price: 0,
                last_price_mjm: 0,
                last_price_bjw: 0,
                last_order_date: '',
                last_order_date_mjm: '',
                last_order_date_bjw: '',
                tempo: '-',
                brand: item.brand || '-',
                application: item.application || '-'
              });
              allPartNumbersWithSupplier.add(item.part_number);
            }
          }
        });
      }
      
      // Convert to array and sort
      const groups: SupplierGroup[] = Object.entries(supplierMap)
        .map(([supplier, itemsMap]) => {
          const items = Array.from(itemsMap.values())
            // For BJW: sort by BJW stock ascending, then by MJM stock
            .sort((a, b) => {
              if (isBJW) {
                const stockDiff = (a.current_stock_bjw || 0) - (b.current_stock_bjw || 0);
                if (stockDiff !== 0) return stockDiff;
                return (a.current_stock_mjm || 0) - (b.current_stock_mjm || 0);
              }
              return a.current_stock - b.current_stock;
            });
          return {
            supplier,
            items,
            totalItems: items.length
          };
        })
        .filter(g => g.totalItems > 0)
        // Sort: "TANPA SUPPLIER" at the end, others by item count
        .sort((a, b) => {
          if (a.supplier.includes('TANPA SUPPLIER')) return 1;
          if (b.supplier.includes('TANPA SUPPLIER')) return -1;
          return b.totalItems - a.totalItems;
        });
      
      setSupplierGroups(groups);
      
    } catch (error) {
      console.error('Error fetching data:', error);
      setToast({ msg: 'Gagal memuat data', type: 'error' });
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, [selectedStore, activeTab]);
  
  // Load cart from localStorage on mount and listen for updates
  useEffect(() => {
    const loadCartFromStorage = () => {
      const storageKey = `barangKosongCart_${selectedStore || 'mjm'}`;
      const savedCart = localStorage.getItem(storageKey);
      if (savedCart) {
        try {
          const cartItems = JSON.parse(savedCart) as CartItem[];
          if (cartItems.length > 0) {
            setCart(cartItems);
            setShowCart(true);
            setToast({ msg: `${cartItems.length} item dimuat ke keranjang`, type: 'success' });
          }
        } catch (e) {
          console.error('Error loading cart from storage:', e);
        }
      }
    };
    
    loadCartFromStorage();
    
    // Listen for cart updates from floating widget
    const handleCartUpdate = (event: CustomEvent) => {
      if (event.detail.store === (selectedStore || 'mjm')) {
        loadCartFromStorage();
      }
    };
    
    window.addEventListener('barangKosongCartUpdated', handleCartUpdate as EventListener);
    
    return () => {
      window.removeEventListener('barangKosongCartUpdated', handleCartUpdate as EventListener);
    };
  }, [selectedStore]);
  
  // Save cart to localStorage when it changes
  useEffect(() => {
    const storageKey = `barangKosongCart_${selectedStore || 'mjm'}`;
    if (cart.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [cart, selectedStore]);
  
  // Get unique supplier list
  const allSuppliers = useMemo(() => {
    return supplierGroups.map(g => g.supplier).sort((a, b) => a.localeCompare(b));
  }, [supplierGroups]);

  const knownSuppliers = useMemo(() => {
    return supplierGroups
      .map(g => g.supplier)
      .filter(s => !isUnknownSupplierLabel(s))
      .sort((a, b) => a.localeCompare(b));
  }, [supplierGroups]);
  
  // Get unique part numbers list
  const allPartNumbers = useMemo(() => {
    const parts = new Set<string>();
    supplierGroups.forEach(group => {
      group.items.forEach(item => parts.add(item.part_number));
    });
    return Array.from(parts).sort((a, b) => a.localeCompare(b));
  }, [supplierGroups]);
  
  // Filter suppliers by search, selected supplier, and selected part number
  const filteredGroups = useMemo(() => {
    let result = supplierGroups;
    
    // Filter by selected supplier
    if (selectedSupplierFilter) {
      result = result.filter(g => g.supplier === selectedSupplierFilter);
    }
    
    // Filter by part number search (partial match)
    if (selectedPartNoFilter) {
      const searchPN = selectedPartNoFilter.toUpperCase();
      result = result
        .map(group => ({
          ...group,
          items: group.items.filter(item => 
            item.part_number.toUpperCase().includes(searchPN)
          )
        }))
        .filter(g => g.items.length > 0);
    }
    
    // Filter by search term
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      result = result
        .map(group => ({
          ...group,
          items: group.items.filter(item => 
            item.part_number.toLowerCase().includes(search) ||
            item.nama_barang.toLowerCase().includes(search) ||
            group.supplier.toLowerCase().includes(search)
          )
        }))
        .filter(g => g.items.length > 0 || g.supplier.toLowerCase().includes(search));
    }
    
    return result;
  }, [supplierGroups, searchTerm, selectedSupplierFilter, selectedPartNoFilter]);
  
  // Toggle supplier expansion
  const toggleSupplier = (supplier: string) => {
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
  
  // Cart functions
  const addToCart = (item: SupplierItem, supplier: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.part_number === item.part_number);
      if (existing) {
        return prev.map(c => 
          c.part_number === item.part_number 
            ? { ...c, qty: c.qty + 1 } 
            : c
        );
      }
      return [...prev, {
        part_number: item.part_number,
        nama_barang: item.nama_barang,
        supplier,
        qty: 1,
        price: item.last_price,
        tempo: item.tempo,
        brand: item.brand,
        application: item.application
      }];
    });
    setToast({ msg: `${item.nama_barang} ditambahkan ke keranjang`, type: 'success' });
  };
  
  const removeFromCart = (partNumber: string) => {
    setCart(prev => prev.filter(c => c.part_number !== partNumber));
  };
  
  const updateCartQty = (partNumber: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(partNumber);
      return;
    }
    setCart(prev => prev.map(c => 
      c.part_number === partNumber ? { ...c, qty } : c
    ));
  };
  
  const clearCart = () => {
    setCart([]);
    // Also clear from localStorage
    const storageKey = `barangKosongCart_${selectedStore || 'mjm'}`;
    localStorage.removeItem(storageKey);
    setToast({ msg: 'Keranjang dikosongkan', type: 'success' });
  };
  
  // Generate PO Number
  const generatePONumber = () => {
    const store = selectedStore || 'mjm';
    const date = new Date();
    const yearMonth = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `PO-${store.toUpperCase()}-${yearMonth}-${random}`;
  };
  
  // Checkout per supplier
  const handleCheckoutSupplier = (supplier: string) => {
    const supplierItems = cart.filter(c => c.supplier === supplier);
    if (supplierItems.length === 0) {
      setToast({ msg: 'Tidak ada item untuk supplier ini!', type: 'error' });
      return;
    }
    const poNum = generatePONumber();
    setCurrentPONumber(poNum);
    setCurrentSupplier(supplier);
    setShowPOPreview(true);
  };
  
  const handleConfirmOrder = async (notes: string = '') => {
    if (!currentSupplier) return;
    
    const supplierItems = cart.filter(c => c.supplier === currentSupplier);
    if (supplierItems.length === 0) return;
    
    setSavingOrder(true);
    try {
      // Get items for the current supplier only
      const totalItems = supplierItems.reduce((sum, i) => sum + i.qty, 0);
      const totalValue = supplierItems.reduce((sum, i) => sum + (i.qty * i.price), 0);
      
      // Insert order header
      const { data: orderData, error: orderError } = await supabase
        .from('supplier_orders')
        .insert({
          po_number: currentPONumber,
          supplier: currentSupplier,
          store: selectedStore || 'mjm',
          tempo: activeTab,
          total_items: totalItems,
          total_value: totalValue,
          notes: notes,
          status: 'PENDING'
        })
        .select('id')
        .single();
      
      if (orderError) throw orderError;
      
      // Insert order items
      const orderItems = supplierItems.map(item => ({
        order_id: orderData.id,
        part_number: item.part_number,
        nama_barang: item.nama_barang,
        qty: item.qty,
        harga_satuan: item.price,
        harga_total: item.qty * item.price
      }));
      
      const { error: itemsError } = await supabase
        .from('supplier_order_items')
        .insert(orderItems);
      
      if (itemsError) throw itemsError;
      
      setToast({ msg: `PO untuk ${currentSupplier} berhasil disimpan!`, type: 'success' });
      setShowPOPreview(false);
      
      // Remove only the items for this supplier from cart
      setCart(prev => prev.filter(c => c.supplier !== currentSupplier));
      setCurrentSupplier('');
      
    } catch (error: any) {
      console.error('Error saving order:', error);
      setToast({ msg: `Gagal menyimpan: ${error.message}`, type: 'error' });
    } finally {
      setSavingOrder(false);
    }
  };
  
  // Stats - for BJW view, use BJW stock specifically
  const isBJWView = selectedStore === 'bjw';
  const totalSuppliers = filteredGroups.length;
  const totalItems = filteredGroups.reduce((sum, g) => sum + g.items.length, 0);
  const lowStockItems = filteredGroups.reduce((sum, g) => 
    sum + g.items.filter(i => {
      const stock = isBJWView ? (i.current_stock_bjw || 0) : i.current_stock;
      return stock > 0 && stock <= 5;
    }).length, 0
  );
  const emptyStockItems = filteredGroups.reduce((sum, g) => 
    sum + g.items.filter(i => {
      const stock = isBJWView ? (i.current_stock_bjw || 0) : i.current_stock;
      return stock === 0;
    }).length, 0
  );
  
  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Toast */}
      {toast && (
        <Toast 
          msg={toast.msg} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
      
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <PackageX className="text-red-400" />
            Barang Kosong / Re-Order
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOrderHistory(true)}
              className="flex items-center gap-1 px-3 py-2 bg-purple-600/20 hover:bg-purple-600 text-purple-400 hover:text-white rounded-lg transition-colors text-sm font-bold"
              title="Riwayat Order"
            >
              <ClipboardList size={18} />
              <span className="hidden md:inline">Riwayat PO</span>
            </button>
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <ShoppingCart size={20} className={cart.length > 0 ? 'text-green-400' : 'text-gray-400'} />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {cart.reduce((sum, c) => sum + c.qty, 0)}
                </span>
              )}
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <RefreshCw size={20} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('TEMPO')}
            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'TEMPO'
                ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            <Clock size={18} />
            Barang Tempo
          </button>
          <button
            onClick={() => setActiveTab('CASH')}
            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'CASH'
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            <CreditCard size={18} />
            Barang Cash
          </button>
        </div>
        
        {/* Filter Dropdowns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Supplier Dropdown */}
          <div className="relative">
            <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <select
              value={selectedSupplierFilter}
              onChange={(e) => setSelectedSupplierFilter(e.target.value)}
              className="w-full pl-10 pr-8 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 focus:border-blue-500 outline-none transition-colors appearance-none cursor-pointer"
            >
              <option value="">Semua Supplier ({allSuppliers.length})</option>
              {allSuppliers.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
          
          {/* Part Number Search Input */}
          <div className="relative">
            <Package size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder={`Cari Part Number (${allPartNumbers.length} item)...`}
              value={selectedPartNoFilter}
              onChange={(e) => setSelectedPartNoFilter(e.target.value.toUpperCase())}
              className="w-full pl-10 pr-10 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 focus:border-blue-500 outline-none transition-colors font-mono"
            />
            {selectedPartNoFilter && (
              <button
                onClick={() => setSelectedPartNoFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X size={16} />
              </button>
            )}
          </div>
          
          {/* Search Input */}
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Cari nama barang..."
              className="w-full pl-10 pr-10 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 focus:border-blue-500 outline-none transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {(searchTerm || selectedSupplierFilter || selectedPartNoFilter) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedSupplierFilter('');
                  setSelectedPartNoFilter('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                title="Reset filter"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        
        {/* Active Filters Badge */}
        {(selectedSupplierFilter || selectedPartNoFilter) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {selectedSupplierFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600/20 text-blue-400 rounded-full text-xs">
                <User size={12} /> {selectedSupplierFilter}
                <button onClick={() => setSelectedSupplierFilter('')} className="hover:text-blue-200">
                  <X size={12} />
                </button>
              </span>
            )}
            {selectedPartNoFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-600/20 text-purple-400 rounded-full text-xs">
                <Package size={12} /> {selectedPartNoFilter}
                <button onClick={() => setSelectedPartNoFilter('')} className="hover:text-purple-200">
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        )}
        
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="bg-gray-900/50 rounded-lg p-3 text-center">
            <User size={20} className="mx-auto text-blue-400 mb-1" />
            <p className="text-lg font-bold text-white">{totalSuppliers}</p>
            <p className="text-xs text-gray-400">Supplier</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3 text-center">
            <Package size={20} className="mx-auto text-purple-400 mb-1" />
            <p className="text-lg font-bold text-white">{totalItems}</p>
            <p className="text-xs text-gray-400">Total Item</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3 text-center">
            <Layers size={20} className="mx-auto text-yellow-400 mb-1" />
            <p className="text-lg font-bold text-yellow-400">{lowStockItems}</p>
            <p className="text-xs text-gray-400">{isBJWView ? 'Stok Menipis (BJW)' : 'Stok Menipis'}</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3 text-center">
            <PackageX size={20} className="mx-auto text-red-400 mb-1" />
            <p className="text-lg font-bold text-red-400">{emptyStockItems}</p>
            <p className="text-xs text-gray-400">{isBJWView ? 'Stok Habis (BJW)' : 'Stok Habis'}</p>
          </div>
        </div>
        
        {/* Info banner for BJW view */}
        {isBJWView && (
          <div className="mt-3 p-3 bg-purple-900/20 border border-purple-800/30 rounded-lg">
            <p className="text-xs text-purple-300">
              ℹ️ <strong>Mode BJW:</strong> Menampilkan semua barang dari importir MJM + BJW. Kolom stok dan harga ditampilkan terpisah untuk perbandingan.
            </p>
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Supplier List */}
        <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${showCart ? 'pr-2' : ''}`}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <RefreshCw size={40} className="text-blue-500 animate-spin mb-4" />
              <p className="text-gray-400">Memuat data supplier...</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <PackageX size={60} className="text-gray-600 mb-4" />
              <p className="text-gray-400 text-lg">Tidak ada data</p>
              <p className="text-gray-500 text-sm">Tidak ditemukan supplier dengan tipe {activeTab}</p>
            </div>
          ) : (
            filteredGroups.map(group => (
              <SupplierCard
                key={group.supplier}
                group={group}
                isExpanded={expandedSuppliers.has(group.supplier)}
                onToggle={() => toggleSupplier(group.supplier)}
                cart={cart}
                onAddToCart={addToCart}
                onRemoveFromCart={removeFromCart}
                onUpdateQty={updateCartQty}
                onViewHistory={setHistoryItem}
                supplierOptions={knownSuppliers}
                isBJW={selectedStore === 'bjw'}
              />
            ))
          )}
        </div>
        
        {/* Cart Sidebar */}
        {showCart && (
          <div className="w-[420px] border-l border-gray-700 p-4 overflow-y-auto bg-gray-900/50">
            <CartSidebar
              cart={cart}
              onUpdateQty={updateCartQty}
              onRemove={removeFromCart}
              onClear={clearCart}
              onCheckoutSupplier={handleCheckoutSupplier}
            />
          </div>
        )}
      </div>
      
      {/* Purchase History Modal */}
      {historyItem && (
        <PurchaseHistoryModal
          partNumber={historyItem.part_number}
          namaBarang={historyItem.nama_barang}
          store={selectedStore}
          onClose={() => setHistoryItem(null)}
        />
      )}
      
      {/* Purchase Order Preview Modal */}
      {showPOPreview && currentSupplier && (
        <PurchaseOrderPreview
          supplier={currentSupplier}
          items={cart.filter(c => c.supplier === currentSupplier)}
          poNumber={currentPONumber}
          store={selectedStore}
          onClose={() => {
            setShowPOPreview(false);
            setCurrentSupplier('');
          }}
          onConfirm={handleConfirmOrder}
          saving={savingOrder}
        />
      )}
      
      {/* Order History Modal */}
      {showOrderHistory && (
        <OrderHistoryModal
          store={selectedStore}
          onClose={() => setShowOrderHistory(false)}
        />
      )}
    </div>
  );
};
