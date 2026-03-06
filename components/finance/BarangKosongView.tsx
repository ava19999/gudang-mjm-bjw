// FILE: src/components/finance/BarangKosongView.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PackageX, Search, RefreshCw, ChevronDown, ChevronUp,
  Plus, Minus, ShoppingCart, X, Truck, Package,
  Clock, CreditCard, User, Layers, History, Loader2,
  FileText, Printer, Download, ClipboardList, CheckCircle, Eye, MessageCircle
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
  store?: string;
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

interface ImporterCatalogItem {
  part_number: string;
  nama_barang: string;
  brand?: string;
  application?: string;
  stock_mjm: number;
  stock_bjw: number;
  cheapest_price: number;
}

interface ImporterPriceHistoryRow {
  id: string;
  part_number: string;
  supplier: string;
  store: 'MJM' | 'BJW';
  harga_satuan: number;
  tempo: string;
  created_at: string;
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

const fetchAllRowsPaged = async <T,>(
  table: string,
  selectColumns: string,
  buildQuery: (query: any) => any,
  options?: { orderBy?: string; ascending?: boolean; pageSize?: number }
): Promise<T[]> => {
  const pageSize = options?.pageSize ?? 1000;
  const rows: T[] = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(selectColumns);
    query = buildQuery(query);
    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending ?? true });
    }

    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;

    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};

const escapeHtml = (value: string) =>
  (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeMultiline = (value: string | null | undefined) => (value || '').trim();

const composeSupplierOrderNotes = (notes: string, complaint: string): string => {
  const cleanNotes = normalizeMultiline(notes);
  const cleanComplaint = normalizeMultiline(complaint);
  const chunks: string[] = [];

  if (cleanNotes) chunks.push(`CATATAN INTERNAL:\n${cleanNotes}`);
  if (cleanComplaint) chunks.push(`KOMPLAIN CUSTOMER:\n${cleanComplaint}`);

  return chunks.join('\n\n');
};

const parseSupplierOrderNotes = (rawNotes: string | null | undefined): { notes: string; complaint: string } => {
  const source = (rawNotes || '').trim();
  if (!source) return { notes: '', complaint: '' };

  const notesMatch = source.match(/CATATAN INTERNAL:\s*([\s\S]*?)(?:\n\s*KOMPLAIN CUSTOMER:|$)/i);
  const complaintMatch = source.match(/KOMPLAIN CUSTOMER:\s*([\s\S]*)/i);

  if (!notesMatch && !complaintMatch) {
    return { notes: source, complaint: '' };
  }

  return {
    notes: (notesMatch?.[1] || '').trim(),
    complaint: (complaintMatch?.[1] || '').trim()
  };
};

const buildPOWhatsappText = (params: {
  storeName: string;
  poNumber: string;
  supplier: string;
  totalItems: number;
  totalQty: number;
  notes?: string;
  complaint?: string;
}) => {
  const { storeName, poNumber, supplier, totalItems, totalQty, notes, complaint } = params;
  const lines: string[] = [
    `${storeName} - PURCHASE ORDER`,
    `PO: ${poNumber}`,
    `Supplier: ${supplier}`,
    `Total Item: ${totalItems} | Total Qty: ${totalQty}`
  ];

  const cleanComplaint = normalizeMultiline(complaint);
  const cleanNotes = normalizeMultiline(notes);

  if (cleanComplaint) {
    lines.push('', `Komplain Customer:`, cleanComplaint);
  }
  if (cleanNotes) {
    lines.push('', `Catatan PO:`, cleanNotes);
  }
  lines.push('', 'Lampiran: gambar PO');

  return lines.join('\n');
};

interface POHtmlItem {
  part_number: string;
  nama_barang: string;
  qty: number;
  brand?: string;
  application?: string;
}

const renderPurchaseOrderHTML = (params: {
  poNumber: string;
  storeName: string;
  supplier: string;
  dateLabel: string;
  notesText?: string;
  items: POHtmlItem[];
}) => {
  const {
    poNumber,
    storeName,
    supplier,
    dateLabel,
    notesText = '',
    items
  } = params;

  const sortedItems = [...items].sort((a, b) => Number(b.qty || 0) - Number(a.qty || 0));
  const safeNotes = escapeHtml(notesText).replace(/\n/g, '<br/>');
  const itemCount = sortedItems.length;
  const isDense = itemCount > 18;
  const isUltraDense = itemCount > 26;
  const rowPad = isUltraDense ? 4 : isDense ? 5 : 6;
  const pnFont = isUltraDense ? 13 : isDense ? 14 : 15;
  const nameFont = isUltraDense ? 10 : 11;
  const qtyFont = isUltraDense ? 18 : isDense ? 19 : 20;
  const notesMinHeight = isUltraDense ? 44 : 56;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Purchase Order - ${escapeHtml(poNumber)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: A4 portrait; margin: 0; }
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          background: #eef1f5;
          color: #111827;
        }
        .po-page {
          width: 700px;
          min-height: 990px;
          height: auto;
          margin: 0 auto;
          background: #ffffff;
          padding: 18px 18px 14px;
          display: flex;
          flex-direction: column;
          overflow: visible;
        }
        .po-container {
          width: 100%;
          height: auto;
          display: flex;
          flex-direction: column;
        }
        .header {
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 10px;
          align-items: start;
          margin-bottom: 10px;
        }
        .header-right {
          justify-self: start;
          text-align: left;
          margin-left: 6px;
        }
        .company-name {
          font-size: 34px;
          font-weight: 800;
          color: #111827;
          letter-spacing: 0.2px;
          line-height: 1;
        }
        .po-title {
          color: #1e40af;
          font-size: 30px;
          font-weight: 800;
          text-align: left;
          line-height: 1;
        }
        .po-info {
          text-align: left;
          font-size: 12px;
          color: #111827;
          margin-top: 8px;
        }
        .po-info-row {
          display: flex;
          justify-content: flex-start;
          gap: 8px;
          margin: 2px 0;
        }
        .po-info-label {
          color: #6b7280;
          font-weight: 700;
          min-width: 42px;
        }
        .po-info-value {
          font-weight: 800;
          color: #111827;
        }
        .vendor-section {
          background: #1e3a8a;
          color: #fff;
          padding: 7px 10px;
          font-weight: 700;
          font-size: 11px;
          margin-top: 6px;
        }
        .vendor-name {
          padding: 8px 10px;
          font-weight: 700;
          color: #111827;
          font-size: 15px;
          border: 1px solid #d1d5db;
          border-top: none;
          margin-bottom: 8px;
          background: #f3f4f6;
        }
        .table-wrap {
          flex: 0 0 auto;
          min-height: auto;
          overflow: visible;
          border: 1px solid #cfd5df;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .items-table th {
          background: #1e3a8a;
          color: #fff;
          padding: 7px 10px;
          text-align: left;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.2px;
        }
        .items-table th .head-row {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 120px;
        }
        .items-table td {
          padding: ${rowPad}px 9px;
          border-bottom: 1px solid #e5e7eb;
          font-size: 11px;
          vertical-align: top;
        }
        .items-table tr:nth-child(odd) td { background: #f3f4f6; }
        .items-table tr:nth-child(even) td { background: #ffffff; }
        .line-qty {
          display: flex;
          align-items: baseline;
          gap: 7px;
          width: 100%;
        }
        .items-table .pn {
          font-weight: 800;
          color: #0f172a;
          font-size: ${pnFont}px;
          line-height: 1.1;
          white-space: nowrap;
          min-width: 50%;
          letter-spacing: 0.15px;
        }
        .leader {
          flex: 0 0 78px;
          min-width: 56px;
          max-width: 100px;
          border-bottom: 1px dotted #6b7280;
          transform: translateY(-2px);
          opacity: 0.9;
        }
        .qty-inline {
          font-weight: 900;
          font-size: ${qtyFont}px;
          color: #0f172a;
          line-height: 1;
          min-width: 24px;
          text-align: left;
        }
        .items-table .name {
          color: #1f2937;
          font-size: ${nameFont}px;
          margin-top: 1px;
          line-height: 1.18;
        }
        .items-table .brand {
          color: #6b7280;
          font-size: 9px;
          margin-top: 1px;
          line-height: 1.15;
        }
        .notes-section {
          margin-top: 8px;
          border: 1px solid #cfd5df;
        }
        .notes-title {
          background: #1e3a8a;
          color: #fff;
          padding: 6px 10px;
          font-size: 10px;
          font-weight: 800;
        }
        .notes-content {
          padding: 8px 10px;
          font-size: 10px;
          color: #1f2937;
          min-height: ${notesMinHeight}px;
          white-space: pre-wrap;
          line-height: 1.25;
          background: #f3f4f6;
        }
      </style>
    </head>
    <body>
      <div class="po-page">
        <div class="po-container">
          <div class="header">
            <div class="company-name">${escapeHtml(storeName)}</div>
            <div class="header-right">
              <div class="po-title">PURCHASE ORDER</div>
              <div class="po-info">
                <div class="po-info-row"><span class="po-info-label">DATE</span><span class="po-info-value">${escapeHtml(dateLabel)}</span></div>
                <div class="po-info-row"><span class="po-info-label">PO#</span><span class="po-info-value">${escapeHtml(poNumber)}</span></div>
              </div>
            </div>
          </div>

          <div class="vendor-section">VENDOR</div>
          <div class="vendor-name">${escapeHtml(supplier)}</div>

          <div class="table-wrap">
            <table class="items-table">
              <thead>
                <tr>
                  <th>
                    <div class="head-row">
                      <span>PART NUMBER / NAMA BARANG / APLIKASI</span>
                      <span>QTY</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                ${sortedItems.map(item => {
                  const safePart = escapeHtml(item.part_number || '-');
                  const safeName = escapeHtml(item.nama_barang || '-');
                  const safeQty = Number(item.qty || 0);
                  const brand = (item.brand || '').trim();
                  const app = (item.application || '').trim();
                  const extra = brand || app
                    ? `<div class="brand">${brand ? `Brand: ${escapeHtml(brand)}` : ''}${brand && app ? ' | ' : ''}${app ? `App: ${escapeHtml(app)}` : ''}</div>`
                    : '';
                  return `
                    <tr>
                      <td>
                        <div class="line-qty">
                          <span class="pn">${safePart}</span>
                          <span class="leader"></span>
                          <span class="qty-inline">${safeQty}</span>
                        </div>
                        <div class="name">${safeName}</div>
                        ${extra}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="notes-section">
            <div class="notes-title">CATATAN / KOMPLAIN CUSTOMER</div>
            <div class="notes-content">${safeNotes}</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

const createPOImageBlobFromHtml = async (html: string): Promise<Blob> => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.width = '760px';
  iframe.style.height = '1200px';
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) throw new Error('Cannot access iframe');

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    await new Promise((resolve) => setTimeout(resolve, 500));

    const html2canvas = (await import('html2canvas')).default;
    const target = (iframeDoc.querySelector('.po-page') as HTMLElement) || iframeDoc.body;
    const targetWidth = Math.max(
      Math.ceil(target.scrollWidth || 0),
      Math.ceil(target.offsetWidth || 0),
      700
    );
    const targetHeight = Math.max(
      Math.ceil(target.scrollHeight || 0),
      Math.ceil(target.offsetHeight || 0),
      990
    );

    // Pastikan viewport iframe cukup besar agar elemen panjang tidak terpotong saat dirender.
    iframe.style.width = `${targetWidth + 40}px`;
    iframe.style.height = `${targetHeight + 40}px`;
    await new Promise((resolve) => setTimeout(resolve, 60));

    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: Math.max(2.1, (window.devicePixelRatio || 1) * 1.7),
      useCORS: true,
      logging: false,
      removeContainer: true,
      width: targetWidth,
      height: targetHeight,
      windowWidth: targetWidth,
      windowHeight: targetHeight,
      scrollX: 0,
      scrollY: 0
    });

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png');
    });
    if (!blob) throw new Error('Failed to create image');
    return blob;
  } finally {
    document.body.removeChild(iframe);
  }
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

const isUnknownSupplierLabel = (supplier: string) => {
  const normalized = (supplier || '').toUpperCase();
  return normalized.includes('TANPA SUPPLIER') || normalized.includes('UNKNOWN');
};

const normalizeSupplierName = (supplier: string): string => {
  return (supplier || '').trim().replace(/\s+/g, ' ').toUpperCase();
};

const isReturRow = (row: Record<string, any>): boolean => {
  const fields = ['status', 'keterangan', 'catatan', 'note', 'notes', 'remark', 'tipe', 'jenis'];
  return fields.some((field) => {
    const value = row?.[field];
    if (value === null || value === undefined) return false;
    const text = String(value).toLowerCase();
    return (
      text.includes('retur') ||
      text.includes('return') ||
      text.includes('batal') ||
      text.includes('cancel')
    );
  });
};

const getFirstString = (row: Record<string, any>, keys: string[], fallback = ''): string => {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return fallback;
};

const getFirstNumber = (row: Record<string, any>, keys: string[], fallback = 0): number => {
  for (const key of keys) {
    const value = row?.[key];
    const asNumber = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
  }
  return fallback;
};

const isOpenCartStatus = (status: string): boolean => {
  if (!status) return true;
  const normalized = status.toLowerCase();
  return ![
    'ok',
    'received',
    'selesai',
    'done',
    'processed',
    'ordered',
    'sent',
    'diproses',
    'cancelled',
    'canceled'
  ].includes(normalized);
};

const parseOrderSupplierItems = (rawItems: unknown): Record<string, any>[] => {
  if (Array.isArray(rawItems)) {
    return rawItems.filter((item) => typeof item === 'object' && item !== null) as Record<string, any>[];
  }

  if (typeof rawItems === 'string') {
    try {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === 'object' && item !== null) as Record<string, any>[];
      }
    } catch {
      // Ignore invalid JSON payload
    }
  }

  return [];
};

const mapOrderSupplierRowsToCart = (rows: Record<string, any>[], store: string): CartItem[] => {
  const selectedStore = (store || 'mjm').toLowerCase();
  const mergedCart = new Map<string, CartItem>();

  const toCartItem = (
    row: Record<string, any>,
    fallback: { supplier?: string; tempo?: string } = {}
  ): CartItem | null => {
    const partNumber = getFirstString(row, ['part_number', 'partNumber', 'pn', 'sku']);
    if (!partNumber) return null;

    const namaBarang = getFirstString(
      row,
      ['nama_barang', 'namaBarang', 'name', 'item_name'],
      partNumber
    );

    const supplier = getFirstString(
      row,
      ['supplier', 'customer', 'importir'],
      fallback.supplier || 'Supplier Tidak Diketahui'
    );

    const qty = Math.max(
      1,
      Math.floor(getFirstNumber(row, ['qty', 'quantity', 'qty_order', 'qty_requested', 'jumlah'], 1))
    );

    const price = Math.max(
      0,
      getFirstNumber(row, ['price', 'harga_satuan', 'harga', 'unit_price', 'last_price'], 0)
    );

    const tempo = getFirstString(
      row,
      ['tempo', 'payment_term', 'payment_type'],
      fallback.tempo || 'CASH'
    );

    const brand = getFirstString(row, ['brand']);
    const application = getFirstString(row, ['application', 'aplikasi']);
    const itemStore = getFirstString(row, ['store', 'toko', 'store_code'], selectedStore).toLowerCase();

    return {
      part_number: partNumber,
      nama_barang: namaBarang,
      supplier,
      qty,
      price,
      tempo,
      store: itemStore,
      brand: brand || undefined,
      application: application || undefined
    };
  };

  const mergeCartItem = (item: CartItem) => {
    const key = `${item.store || selectedStore}::${item.part_number}::${item.supplier}`;
    const existing = mergedCart.get(key);

    if (!existing) {
      mergedCart.set(key, item);
      return;
    }

    mergedCart.set(key, {
      ...existing,
      qty: existing.qty + item.qty,
      price: item.price > 0 ? item.price : existing.price,
      tempo: item.tempo || existing.tempo,
      nama_barang: existing.nama_barang || item.nama_barang,
      brand: existing.brand || item.brand,
      application: existing.application || item.application
    });
  };

  rows.forEach((row) => {
    const rowStatus = getFirstString(row, ['status']);
    if (!isOpenCartStatus(rowStatus)) return;

    const fallbackSupplier = getFirstString(
      row,
      ['supplier', 'customer', 'importir'],
      'Supplier Tidak Diketahui'
    );
    const fallbackTempo = getFirstString(row, ['tempo', 'payment_term', 'payment_type'], 'CASH');

    const nestedItems = parseOrderSupplierItems(row.items);
    if (nestedItems.length > 0) {
      nestedItems.forEach((nestedRow) => {
        const mapped = toCartItem(nestedRow, {
          supplier: fallbackSupplier,
          tempo: fallbackTempo
        });
        if (mapped) mergeCartItem(mapped);
      });
      return;
    }

    const mapped = toCartItem(row, {
      supplier: fallbackSupplier,
      tempo: fallbackTempo
    });
    if (mapped) mergeCartItem(mapped);
  });

  return Array.from(mergedCart.values());
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
  const [notes, setNotes] = useState('');
  const [customerComplaint, setCustomerComplaint] = useState('');
  const [saving2, setSaving2] = useState(false);
  const today = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const storeName = store === 'bjw' ? 'BJW AUTOPART' : 'MJMAUTOPART 86';

  const sortedItems = [...items].sort((a, b) => b.qty - a.qty);
  const totalQty = items.reduce((sum, i) => sum + Number(i.qty || 0), 0);
  const mergedNotes = composeSupplierOrderNotes(notes, customerComplaint);

  const buildPoHtml = () =>
    renderPurchaseOrderHTML({
      poNumber,
      storeName,
      supplier,
      dateLabel: today,
      notesText: mergedNotes,
      items: items.map((item) => ({
        part_number: item.part_number,
        nama_barang: item.nama_barang,
        qty: item.qty,
        brand: item.brand,
        application: item.application
      }))
    });

  const buildWaMessage = () =>
    buildPOWhatsappText({
      storeName,
      poNumber,
      supplier,
      totalItems: items.length,
      totalQty,
      notes,
      complaint: customerComplaint
    });

  const createPoImageBlob = async () => createPOImageBlobFromHtml(buildPoHtml());

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(buildPoHtml());
    printWindow.document.close();
    printWindow.print();
  };

  const handleSaveImage = async () => {
    setSaving2(true);
    try {
      const blob = await createPoImageBlob();
      downloadBlob(blob, `${poNumber}.png`);
    } catch (error) {
      console.error('Error saving image:', error);
      alert('Gagal menyimpan gambar PO.');
    } finally {
      setSaving2(false);
    }
  };

  const handleShareToWA = async () => {
    setSaving2(true);
    try {
      const blob = await createPoImageBlob();
      const file = new File([blob], `${poNumber}.png`, { type: 'image/png' });
      const waText = buildWaMessage();

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `PO ${poNumber}`,
          text: waText,
          files: [file]
        });
        return;
      }

      downloadBlob(blob, `${poNumber}.png`);
      window.open(
        `https://wa.me/?text=${encodeURIComponent(
          `${waText}\n\nGambar PO sudah di-download otomatis (${poNumber}.png). Silakan lampirkan file tersebut ke chat WA ini.`
        )}`,
        '_blank'
      );
      alert('Browser ini belum support kirim file langsung ke WA. File PO sudah di-download dan chat WA sudah dibuka.');
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Error sharing to WhatsApp:', error);
        alert('Gagal kirim ke WhatsApp.');
      }
    } finally {
      setSaving2(false);
    }
  };
  
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
              onClick={handleShareToWA}
              disabled={saving2}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded transition-colors disabled:opacity-50"
              title="Kirim ke WhatsApp"
            >
              {saving2 ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />} WA
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
        <div className="flex-1 overflow-auto p-6 bg-white">
          {/* Header */}
          <div className="grid grid-cols-2 gap-2 items-start mb-6">
            <div className="text-2xl font-bold text-gray-800">{storeName}</div>
            <div className="text-left ml-2">
              <div className="text-xl font-bold text-blue-700 text-left">PURCHASE ORDER</div>
              <table className="text-sm mt-2">
                <tbody>
                  <tr>
                    <td className="pr-3 text-gray-500 font-medium">DATE</td>
                    <td className="font-bold text-gray-800">{today}</td>
                  </tr>
                  <tr>
                    <td className="pr-3 text-gray-500 font-medium">P.O. #</td>
                    <td className="font-bold text-gray-800">{poNumber}</td>
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
                <th className="px-3 py-2 text-left">
                  <div className="flex items-center justify-start gap-28 text-[11px] uppercase tracking-wide">
                    <span>Part Number / Nama Barang / Aplikasi</span>
                    <span>QTY</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, idx) => (
                <tr key={idx} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-gray-100' : 'bg-white'}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-extrabold text-[17px] text-gray-900 min-w-[50%] tracking-[0.2px]">
                        {item.part_number}
                      </span>
                      <span className="w-20 min-w-[56px] max-w-[100px] border-b border-dotted border-gray-400 -translate-y-[2px]" />
                      <span className="font-extrabold text-xl text-gray-900 leading-none min-w-[24px] text-left">{item.qty}</span>
                    </div>
                    <div className="text-gray-700 text-[13px]">{item.nama_barang}</div>
                    {(item.brand || item.application) && (
                      <div className="text-[11px] text-gray-500 italic">
                        {item.brand && item.brand !== '-' ? `Brand: ${item.brand}` : ''}
                        {item.brand && item.brand !== '-' && item.application && item.application !== '-' ? ' | ' : ''}
                        {item.application && item.application !== '-' ? `App: ${item.application}` : ''}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Notes */}
          <div className="mt-8 border border-gray-300">
            <div className="bg-blue-800 text-white px-3 py-1 text-xs font-bold">Catatan / Komplain Customer</div>
            <div className="p-3 space-y-3">
              <div>
                <label className="block text-xs text-gray-600 font-semibold mb-1">Catatan Internal PO</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Tolong kirim batch 1 dulu..."
                  className="w-full p-3 min-h-[70px] text-sm text-gray-700 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-red-700 font-semibold mb-1">Komplain Customer (ditampilkan di WA)</label>
                <textarea
                  value={customerComplaint}
                  onChange={(e) => setCustomerComplaint(e.target.value)}
                  placeholder="Contoh: Customer komplain ukuran tidak sesuai, mohon dicek kualitas."
                  className="w-full p-3 min-h-[80px] text-sm text-gray-700 border border-red-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                />
              </div>
              <p className="text-[11px] text-gray-500">
                Komplain customer akan ikut di gambar PO dan pesan WhatsApp.
              </p>
            </div>
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
              onClick={() => onConfirm(mergedNotes)}
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
  const [actionLoading, setActionLoading] = useState<'save' | 'wa' | null>(null);
  
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

  const getStoreLabel = () => (store === 'bjw' ? 'BJW AUTOPART' : 'MJMAUTOPART 86');

  const getOrderHtml = (order: SupplierOrder) =>
    renderPurchaseOrderHTML({
      poNumber: order.po_number,
      storeName: getStoreLabel(),
      supplier: order.supplier,
      dateLabel: formatDate(order.created_at),
      notesText: order.notes || '',
      items: (order.items || []).map((item) => ({
        part_number: item.part_number,
        nama_barang: item.nama_barang,
        qty: item.qty
      }))
    });

  const handlePrintSelectedOrder = (order: SupplierOrder) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(getOrderHtml(order));
    printWindow.document.close();
    printWindow.print();
  };

  const handleSaveSelectedOrderImage = async (order: SupplierOrder) => {
    setActionLoading('save');
    try {
      const blob = await createPOImageBlobFromHtml(getOrderHtml(order));
      downloadBlob(blob, `${order.po_number}.png`);
    } catch (error) {
      console.error('Error saving PO image:', error);
      alert('Gagal menyimpan gambar PO.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleShareSelectedOrderWA = async (order: SupplierOrder) => {
    setActionLoading('wa');
    try {
      const parsed = parseSupplierOrderNotes(order.notes);
      const totalQty = (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
      const waText = buildPOWhatsappText({
        storeName: getStoreLabel(),
        poNumber: order.po_number,
        supplier: order.supplier,
        totalItems: order.items?.length || 0,
        totalQty,
        notes: parsed.notes,
        complaint: parsed.complaint
      });

      const blob = await createPOImageBlobFromHtml(getOrderHtml(order));
      const file = new File([blob], `${order.po_number}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `PO ${order.po_number}`,
          text: waText,
          files: [file]
        });
      } else {
        downloadBlob(blob, `${order.po_number}.png`);
        window.open(
          `https://wa.me/?text=${encodeURIComponent(
            `${waText}\n\nGambar PO sudah di-download otomatis (${order.po_number}.png). Silakan lampirkan file tersebut ke chat WA ini.`
          )}`,
          '_blank'
        );
        alert('Browser ini belum support kirim file langsung ke WA. File PO sudah di-download dan chat WA dibuka.');
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Error sharing PO to WA:', error);
        alert('Gagal share PO ke WhatsApp.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const selectedOrderNotes = useMemo(
    () => parseSupplierOrderNotes(selectedOrder?.notes),
    [selectedOrder?.notes]
  );
  
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
                  onClick={() => handleSaveSelectedOrderImage(selectedOrder)}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Simpan
                </button>
                <button
                  onClick={() => handleShareSelectedOrderWA(selectedOrder)}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'wa' ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />} WA
                </button>
                <button 
                  onClick={() => handlePrintSelectedOrder(selectedOrder)}
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
              {(selectedOrderNotes.notes || selectedOrderNotes.complaint) && (
                <div className="mt-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700 space-y-3">
                  {selectedOrderNotes.notes && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Catatan Internal:</div>
                      <div className="text-sm text-gray-200 whitespace-pre-wrap">{selectedOrderNotes.notes}</div>
                    </div>
                  )}
                  {selectedOrderNotes.complaint && (
                    <div>
                      <div className="text-xs text-red-300 mb-1">Komplain Customer:</div>
                      <div className="text-sm text-red-200 whitespace-pre-wrap">{selectedOrderNotes.complaint}</div>
                    </div>
                  )}
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
  onRemoveFromCart: (partNumber: string, supplier: string, store?: string) => void;
  onUpdateQty: (partNumber: string, supplier: string, qty: number, store?: string) => void;
  onViewHistory: (item: SupplierItem) => void;
  supplierOptions: string[];
  currentStore: string | null;
  isBJW?: boolean;
}> = ({ group, isExpanded, onToggle, cart, onAddToCart, onRemoveFromCart, onUpdateQty, onViewHistory, supplierOptions, currentStore, isBJW = false }) => {
  const activeStore = (currentStore || 'mjm').toLowerCase();
  const cartItemsFromSupplier = cart.filter(
    c => c.supplier === group.supplier && (c.store || activeStore).toLowerCase() === activeStore
  );
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
                  const inCart =
                    cart.find(
                      c =>
                        c.part_number === item.part_number &&
                        c.supplier === group.supplier &&
                        (c.store || activeStore).toLowerCase() === activeStore
                    ) ||
                    cart.find(
                      c =>
                        c.part_number === item.part_number &&
                        (c.store || activeStore).toLowerCase() === activeStore
                    );
                  
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
                              onClick={() => onUpdateQty(item.part_number, inCart.supplier, inCart.qty - 1, inCart.store)}
                              className="p-1 bg-gray-600 hover:bg-gray-500 rounded transition-colors"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center font-bold text-white">{inCart.qty}</span>
                            <button
                              onClick={() => onUpdateQty(item.part_number, inCart.supplier, inCart.qty + 1, inCart.store)}
                              className="p-1 bg-gray-600 hover:bg-gray-500 rounded transition-colors"
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              onClick={() => onRemoveFromCart(item.part_number, inCart.supplier, inCart.store)}
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

// Importer Catalog Modal
const ImporterCatalogModal: React.FC<{
  importerName: string;
  onImporterNameChange: (value: string) => void;
  suggestions: string[];
  items: ImporterCatalogItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClose: () => void;
  onAddSelected: (importerName: string, items: ImporterCatalogItem[]) => Promise<void> | void;
}> = ({
  importerName,
  onImporterNameChange,
  suggestions,
  items,
  loading,
  error,
  onRefresh,
  onClose,
  onAddSelected
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedByPartNumber, setSelectedByPartNumber] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<'part_number' | 'nama_barang' | 'stock_mjm' | 'stock_bjw' | 'cheapest_price'>('cheapest_price');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [historyTarget, setHistoryTarget] = useState<ImporterCatalogItem | null>(null);
  const [priceHistoryRows, setPriceHistoryRows] = useState<ImporterPriceHistoryRow[]>([]);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
  const [priceHistoryError, setPriceHistoryError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const source = [...items];
    if (!query) return source;

    return source.filter((item) =>
      item.part_number.toLowerCase().includes(query) ||
      item.nama_barang.toLowerCase().includes(query) ||
      (item.brand || '').toLowerCase().includes(query) ||
      (item.application || '').toLowerCase().includes(query)
    );
  }, [items, searchTerm]);

  const sortedItems = useMemo(() => {
    const source = [...filteredItems];
    source.sort((a, b) => {
      let compare = 0;
      if (sortKey === 'part_number') compare = a.part_number.localeCompare(b.part_number);
      if (sortKey === 'nama_barang') compare = a.nama_barang.localeCompare(b.nama_barang);
      if (sortKey === 'stock_mjm') compare = a.stock_mjm - b.stock_mjm;
      if (sortKey === 'stock_bjw') compare = a.stock_bjw - b.stock_bjw;
      if (sortKey === 'cheapest_price') {
        const aPrice = a.cheapest_price || Number.MAX_SAFE_INTEGER;
        const bPrice = b.cheapest_price || Number.MAX_SAFE_INTEGER;
        compare = aPrice - bPrice;
      }

      if (compare === 0) {
        compare = a.part_number.localeCompare(b.part_number);
      }

      return sortDirection === 'asc' ? compare : -compare;
    });
    return source;
  }, [filteredItems, sortDirection, sortKey]);

  const selectedItems = useMemo(
    () => sortedItems.filter((item) => selectedByPartNumber[item.part_number]),
    [sortedItems, selectedByPartNumber]
  );
  const selectedCount = selectedItems.length;
  const selectedTotal = selectedItems.reduce((sum, item) => sum + item.cheapest_price, 0);
  const allFilteredSelected = sortedItems.length > 0 && selectedCount === sortedItems.length;

  const toggleSort = (key: 'part_number' | 'nama_barang' | 'stock_mjm' | 'stock_bjw' | 'cheapest_price') => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedByPartNumber((prev) => {
        const next = { ...prev };
        sortedItems.forEach((item) => {
          delete next[item.part_number];
        });
        return next;
      });
      return;
    }

    setSelectedByPartNumber((prev) => {
      const next = { ...prev };
      sortedItems.forEach((item) => {
        next[item.part_number] = true;
      });
      return next;
    });
  };

  const fetchPriceHistory = async (item: ImporterCatalogItem) => {
    setHistoryTarget(item);
    setPriceHistoryRows([]);
    setPriceHistoryError(null);
    setPriceHistoryLoading(true);

    try {
      const [{ data: mjmData, error: mjmError }, { data: bjwData, error: bjwError }] = await Promise.all([
        supabase
          .from('barang_masuk_mjm')
          .select('*')
          .eq('part_number', item.part_number)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('barang_masuk_bjw')
          .select('*')
          .eq('part_number', item.part_number)
          .order('created_at', { ascending: false })
          .limit(200)
      ]);

      if (mjmError) throw mjmError;
      if (bjwError) throw bjwError;

      const mapRows = (rows: Record<string, any>[], store: 'MJM' | 'BJW'): ImporterPriceHistoryRow[] =>
        rows
          .filter((row) => !isReturRow(row))
          .map((row, idx) => {
            const supplier = getFirstString(row, ['customer', 'supplier', 'importir'], '-');
            const price = getFirstNumber(row, ['harga_satuan', 'price', 'harga', 'unit_price', 'modal'], 0);
            const tempo = getFirstString(row, ['tempo'], '-');
            const createdAt = getFirstString(row, ['created_at', 'tanggal'], '');

            return {
              id: `${store}-${row.id || idx}-${createdAt || 'nodate'}`,
              part_number: item.part_number,
              supplier,
              store,
              harga_satuan: price,
              tempo,
              created_at: createdAt
            };
          })
          .filter((row) => row.harga_satuan > 0);

      const combined = [...mapRows((mjmData || []) as Record<string, any>[], 'MJM'), ...mapRows((bjwData || []) as Record<string, any>[], 'BJW')]
        .sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bTime - aTime;
        });

      setPriceHistoryRows(combined);
    } catch (error: any) {
      console.error('Error fetching importer price history:', error);
      setPriceHistoryError(error.message || 'Gagal memuat history harga');
    } finally {
      setPriceHistoryLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-7xl bg-gray-900 border border-gray-700 rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">Menu Importir Baru</h3>
            <p className="text-xs text-gray-400">List barang dari base_mjm + base_bjw dengan modal termurah (exclude retur)</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 border-b border-gray-700 bg-gray-800/60 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Nama Importir Tujuan</label>
              <input
                type="text"
                list="importer-suggestion-list"
                value={importerName}
                onChange={(e) => onImporterNameChange(e.target.value)}
                placeholder="Contoh: RMX RADJA PADANG"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 focus:border-blue-500 outline-none"
              />
              <datalist id="importer-suggestion-list">
                {suggestions.map((supplier) => (
                  <option key={supplier} value={supplier} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Cari Barang</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Part number / nama barang..."
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleSelectAllFiltered}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-lg text-xs font-bold"
            >
              {allFilteredSelected ? 'Batal Pilih Semua' : 'Pilih Semua Hasil Filter'}
            </button>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-lg text-xs font-bold disabled:opacity-60"
            >
              {loading ? 'Memuat...' : 'Refresh Data'}
            </button>
            <div className="text-xs text-emerald-300">
              Terpilih {selectedCount} item, estimasi modal {formatCurrency(selectedTotal)}
            </div>
            <button
              onClick={() => onAddSelected(importerName, selectedItems)}
              disabled={!importerName.trim() || selectedCount === 0}
              className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold disabled:opacity-50"
            >
              Tambah ke Keranjang Importir
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <Loader2 size={22} className="animate-spin mr-2" />
              Memuat data barang...
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-red-400 text-sm px-4 text-center">
              {error}
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              Tidak ada barang ditemukan.
            </div>
          ) : (
            <table className="w-full min-w-[980px]">
              <thead className="sticky top-0 bg-gray-900 border-b border-gray-700">
                <tr className="text-xs text-gray-400 uppercase">
                  <th className="px-3 py-2 text-center">Pilih</th>
                  <th className="px-3 py-2 text-left">
                    <button
                      onClick={() => toggleSort('part_number')}
                      className="inline-flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Part Number
                      {sortKey === 'part_number' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <button
                      onClick={() => toggleSort('nama_barang')}
                      className="inline-flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Nama / Brand / Aplikasi
                      {sortKey === 'nama_barang' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggleSort('stock_mjm')}
                      className="inline-flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Stok MJM
                      {sortKey === 'stock_mjm' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggleSort('stock_bjw')}
                      className="inline-flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Stok BJW
                      {sortKey === 'stock_bjw' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button
                      onClick={() => toggleSort('cheapest_price')}
                      className="inline-flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Modal Termurah
                      {sortKey === 'cheapest_price' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedItems.map((item) => (
                  <tr key={item.part_number} className="hover:bg-gray-800/50">
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!selectedByPartNumber[item.part_number]}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelectedByPartNumber((prev) => {
                            if (checked) return { ...prev, [item.part_number]: true };
                            const next = { ...prev };
                            delete next[item.part_number];
                            return next;
                          });
                        }}
                        className="w-4 h-4 accent-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-blue-400 text-sm">{item.part_number}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm text-gray-100 font-semibold">{item.nama_barang}</div>
                      <div className="text-xs text-gray-400">
                        {item.brand && item.brand !== '-' ? `Brand: ${item.brand}` : ''}
                        {item.brand && item.brand !== '-' && item.application && item.application !== '-' ? ' | ' : ''}
                        {item.application && item.application !== '-' ? `App: ${item.application}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="px-2 py-1 rounded text-xs font-bold bg-blue-900/40 text-blue-300">
                        {item.stock_mjm}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="px-2 py-1 rounded text-xs font-bold bg-purple-900/40 text-purple-300">
                        {item.stock_bjw}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <span className="text-sm font-bold text-emerald-300">
                          {item.cheapest_price > 0 ? formatCurrency(item.cheapest_price) : '-'}
                        </span>
                        <button
                          onClick={() => fetchPriceHistory(item)}
                          className="p-1 rounded bg-gray-800 hover:bg-blue-600 text-gray-400 hover:text-white transition-colors"
                          title="Lihat history harga"
                        >
                          <History size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {historyTarget && (
          <div className="fixed inset-0 z-[130] bg-black/70 flex items-center justify-center p-4">
            <div className="w-full max-w-5xl max-h-[85vh] overflow-hidden bg-gray-900 border border-gray-700 rounded-xl flex flex-col">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <History size={16} className="text-blue-400" />
                    History Harga
                  </h4>
                  <p className="text-xs text-gray-400 mt-1">
                    <span className="font-mono text-blue-400">{historyTarget.part_number}</span> - {historyTarget.nama_barang}
                  </p>
                </div>
                <button
                  onClick={() => setHistoryTarget(null)}
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {priceHistoryLoading ? (
                  <div className="py-10 flex items-center justify-center text-gray-400">
                    <Loader2 size={20} className="animate-spin mr-2" />
                    Memuat history harga...
                  </div>
                ) : priceHistoryError ? (
                  <div className="py-10 text-center text-red-400 text-sm">
                    {priceHistoryError}
                  </div>
                ) : priceHistoryRows.length === 0 ? (
                  <div className="py-10 text-center text-gray-400 text-sm">
                    Tidak ada history harga.
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="sticky top-0 bg-gray-900 border-b border-gray-700">
                      <tr className="text-xs text-gray-400 uppercase">
                        <th className="px-3 py-2 text-left">Tanggal</th>
                        <th className="px-3 py-2 text-center">Toko</th>
                        <th className="px-3 py-2 text-left">Supplier</th>
                        <th className="px-3 py-2 text-right">Harga</th>
                        <th className="px-3 py-2 text-center">Tempo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {priceHistoryRows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-800/40">
                          <td className="px-3 py-2 text-sm text-gray-300">{formatDate(row.created_at)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.store === 'MJM' ? 'bg-blue-900/40 text-blue-300' : 'bg-purple-900/40 text-purple-300'}`}>
                              {row.store}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-200">{row.supplier || '-'}</td>
                          <td className="px-3 py-2 text-right text-sm font-bold text-emerald-300">{formatCurrency(row.harga_satuan || 0)}</td>
                          <td className="px-3 py-2 text-center text-xs text-gray-300">{row.tempo || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Cart Sidebar Component
const CartSidebar: React.FC<{
  cart: CartItem[];
  onUpdateQty: (partNumber: string, supplier: string, qty: number, store?: string) => void;
  onRemove: (partNumber: string, supplier: string, store?: string) => void;
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
                  <div key={`${item.part_number}_${item.supplier}_${item.store || 'mjm'}`} className="flex items-center justify-between text-xs bg-gray-800/50 rounded-lg p-2">
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
                          onClick={() => onUpdateQty(item.part_number, item.supplier, item.qty - 1, item.store)}
                          className="p-0.5 bg-gray-700 hover:bg-gray-600 rounded"
                        >
                          <Minus size={10} />
                        </button>
                        <span className="w-6 text-center font-bold">{item.qty}</span>
                        <button
                          onClick={() => onUpdateQty(item.part_number, item.supplier, item.qty + 1, item.store)}
                          className="p-0.5 bg-gray-700 hover:bg-gray-600 rounded"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                      <button
                        onClick={() => onRemove(item.part_number, item.supplier, item.store)}
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
  const [showImporterModal, setShowImporterModal] = useState(false);
  const [importerNameDraft, setImporterNameDraft] = useState('RMX RADJA PADANG');
  const [importerCatalogItems, setImporterCatalogItems] = useState<ImporterCatalogItem[]>([]);
  const [importerCatalogLoading, setImporterCatalogLoading] = useState(false);
  const [importerCatalogError, setImporterCatalogError] = useState<string | null>(null);
  
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
      const [baseMJMData, baseBJWData] = await Promise.all([
        fetchAllRowsPaged<Record<string, any>>(
          'base_mjm',
          'part_number, name, quantity, brand, application',
          (query) => query
        ),
        fetchAllRowsPaged<Record<string, any>>(
          'base_bjw',
          'part_number, name, quantity, brand, application',
          (query) => query
        )
      ]);
      
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
      masukDataMJM = await fetchAllRowsPaged<Record<string, any>>(
        'barang_masuk_mjm',
        'part_number, nama_barang, customer, harga_satuan, tempo, created_at',
        (query) => {
          if (activeTab === 'TEMPO') return query.in('tempo', TEMPO_VALUES);
          return query.eq('tempo', 'CASH');
        },
        { orderBy: 'created_at', ascending: false }
      );
      
      // For BJW view, also fetch BJW data
      if (isBJW) {
        masukDataBJW = await fetchAllRowsPaged<Record<string, any>>(
          'barang_masuk_bjw',
          'part_number, nama_barang, customer, harga_satuan, tempo, created_at',
          (query) => {
            if (activeTab === 'TEMPO') return query.in('tempo', TEMPO_VALUES);
            return query.eq('tempo', 'CASH');
          },
          { orderBy: 'created_at', ascending: false }
        );
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

  const loadImporterCatalog = async () => {
    setImporterCatalogLoading(true);
    setImporterCatalogError(null);

    try {
      const [baseMJMData, baseBJWData, masukMJMData, masukBJWData] = await Promise.all([
        fetchAllRowsPaged<Record<string, any>>(
          'base_mjm',
          'part_number, name, quantity, brand, application',
          (query) => query
        ),
        fetchAllRowsPaged<Record<string, any>>(
          'base_bjw',
          'part_number, name, quantity, brand, application',
          (query) => query
        ),
        fetchAllRowsPaged<Record<string, any>>('barang_masuk_mjm', '*', (query) => query),
        fetchAllRowsPaged<Record<string, any>>('barang_masuk_bjw', '*', (query) => query)
      ]);

      const normalizePN = (pn: string): string => pn?.trim().toUpperCase().replace(/\s+/g, ' ') || '';
      const catalogMap = new Map<string, ImporterCatalogItem>();

      const upsertBaseItem = (
        row: Record<string, any>,
        source: 'mjm' | 'bjw'
      ) => {
        const normalizedPN = normalizePN(String(row?.part_number || ''));
        if (!normalizedPN) return;

        const existing = catalogMap.get(normalizedPN);
        const name = (row?.name || '').trim() || existing?.nama_barang || '-';
        const brand = (row?.brand || '').trim() || existing?.brand || '-';
        const application = (row?.application || '').trim() || existing?.application || '-';
        const qty = Number(row?.quantity) || 0;

        if (!existing) {
          catalogMap.set(normalizedPN, {
            part_number: normalizedPN,
            nama_barang: name,
            brand,
            application,
            stock_mjm: source === 'mjm' ? qty : 0,
            stock_bjw: source === 'bjw' ? qty : 0,
            cheapest_price: 0
          });
          return;
        }

        existing.nama_barang = name || existing.nama_barang;
        existing.brand = brand || existing.brand;
        existing.application = application || existing.application;
        if (source === 'mjm') existing.stock_mjm = qty;
        if (source === 'bjw') existing.stock_bjw = qty;
      };

      (baseMJMData || []).forEach((row: any) => upsertBaseItem(row, 'mjm'));
      (baseBJWData || []).forEach((row: any) => upsertBaseItem(row, 'bjw'));

      const cheapestMap = new Map<string, number>();
      const absorbCheapestPrice = (rows: Record<string, any>[]) => {
        rows.forEach((row) => {
          if (isReturRow(row)) return;

          const partNumber = getFirstString(row, ['part_number', 'partNumber', 'pn', 'sku']).toUpperCase();
          if (!partNumber) return;

          const normalizedPN = normalizePN(partNumber);
          if (!catalogMap.has(normalizedPN)) return;

          const price = getFirstNumber(row, ['harga_satuan', 'price', 'harga', 'unit_price', 'modal'], 0);
          if (!Number.isFinite(price) || price <= 0) return;

          const existing = cheapestMap.get(normalizedPN);
          if (existing === undefined || price < existing) {
            cheapestMap.set(normalizedPN, price);
          }
        });
      };

      absorbCheapestPrice((masukMJMData || []) as Record<string, any>[]);
      absorbCheapestPrice((masukBJWData || []) as Record<string, any>[]);

      const items = Array.from(catalogMap.entries())
        .map(([normalizedPN, item]) => ({
          ...item,
          part_number: normalizedPN,
          cheapest_price: cheapestMap.get(normalizedPN) || 0
        }))
        .sort((a, b) => a.part_number.localeCompare(b.part_number));

      setImporterCatalogItems(items);
    } catch (error: any) {
      console.error('Error loading importer catalog:', error);
      setImporterCatalogError(`Gagal memuat menu importir baru: ${error.message || 'Unknown error'}`);
      setImporterCatalogItems([]);
    } finally {
      setImporterCatalogLoading(false);
    }
  };

  const openImporterModal = () => {
    setShowImporterModal(true);
    loadImporterCatalog();
  };
  
  const loadCartFromOrderSupplier = async (): Promise<CartItem[]> => {
    try {
      const data = await fetchAllRowsPaged<Record<string, any>>(
        'order_supplier',
        '*',
        (query) => query,
        { orderBy: 'created_at', ascending: false }
      );

      return mapOrderSupplierRowsToCart((data || []) as Record<string, any>[], selectedStore || 'mjm');
    } catch (error: any) {
      const message = String(error?.message || '');
      const missingTable =
        error?.code === '42P01' ||
        (message.toLowerCase().includes('order_supplier') &&
          (message.toLowerCase().includes('does not exist') || message.toLowerCase().includes('not found')));

      if (!missingTable) {
        console.error('Error loading cart from order_supplier:', error);
      } else {
        console.info('order_supplier table tidak ditemukan, fallback ke localStorage.');
      }

      return [];
    }
  };

  // Load cart from Supabase order_supplier on mount (fallback to localStorage) and listen for updates
  useEffect(() => {
    let isMounted = true;
    const localOpenStatuses = ['PENDING', 'pending', 'CART', 'cart', 'DRAFT', 'draft'];

    const syncLocalCartToOrderSupplier = async (items: CartItem[]) => {
      for (const item of items) {
        const targetStore = (item.store || selectedStore || 'mjm').toLowerCase();
        const payload = {
          store: targetStore,
          supplier: item.supplier,
          part_number: item.part_number,
          name: item.nama_barang,
          qty: item.qty,
          price: item.price || 0,
          status: 'PENDING',
          notes: `Keranjang Barang Kosong ${targetStore.toUpperCase()}`
        };

        const { data: existingRows, error: fetchError } = await supabase
          .from('order_supplier')
          .select('id')
          .eq('store', targetStore)
          .eq('part_number', item.part_number)
          .eq('supplier', item.supplier)
          .in('status', localOpenStatuses)
          .order('created_at', { ascending: false });

        if (fetchError) {
          console.error('Error checking local cart sync to order_supplier:', fetchError);
          continue;
        }

        if (existingRows && existingRows.length > 0) {
          const primaryId = existingRows[0].id;
          const duplicateIds = existingRows.slice(1).map(r => r.id).filter(Boolean);

          const { error: updateError } = await supabase
            .from('order_supplier')
            .update(payload)
            .eq('id', primaryId);

          if (updateError) {
            console.error('Error updating local cart sync row:', updateError);
            continue;
          }

          if (duplicateIds.length > 0) {
            const { error: deleteDuplicateError } = await supabase
              .from('order_supplier')
              .delete()
              .in('id', duplicateIds);

            if (deleteDuplicateError) {
              console.error('Error deleting duplicate local cart sync rows:', deleteDuplicateError);
            }
          }
          continue;
        }

        const { error: insertError } = await supabase
          .from('order_supplier')
          .insert(payload);

        if (insertError) {
          console.error('Error inserting local cart sync row:', insertError);
        }
      }
    };

    const loadCart = async (showToastOnLoad = true) => {
      const storageKey = `barangKosongCart_${selectedStore || 'mjm'}`;

      const supabaseCart = await loadCartFromOrderSupplier();
      if (!isMounted) return;

      if (supabaseCart.length > 0) {
        setCart(supabaseCart);
        setShowCart(true);
        if (showToastOnLoad) {
          setToast({ msg: `${supabaseCart.length} item dimuat dari order_supplier`, type: 'success' });
        }
        return;
      }

      const savedCart = localStorage.getItem(storageKey);
      if (!savedCart) {
        setCart([]);
        setShowCart(false);
        return;
      }

      try {
        const cartItems = JSON.parse(savedCart) as CartItem[];
        const normalized = cartItems.map((item) => ({
          ...item,
          store: (item.store || selectedStore || 'mjm').toLowerCase()
        }));
        setCart(normalized);
        setShowCart(normalized.length > 0);
        if (normalized.length > 0) {
          await syncLocalCartToOrderSupplier(normalized);
        }
        if (showToastOnLoad && normalized.length > 0) {
          setToast({ msg: `${normalized.length} item dimuat ke keranjang`, type: 'success' });
        }
      } catch (e) {
        console.error('Error loading cart from storage:', e);
        setCart([]);
        setShowCart(false);
      }
    };
    
    loadCart();
    
    // Listen for cart updates from floating widget
    const handleCartUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ store?: string }>;
      if ((customEvent.detail?.store || 'mjm') === (selectedStore || 'mjm')) {
        loadCart(false);
      }
    };
    
    window.addEventListener('barangKosongCartUpdated', handleCartUpdate as EventListener);
    
    return () => {
      isMounted = false;
      window.removeEventListener('barangKosongCartUpdated', handleCartUpdate as EventListener);
    };
  }, [selectedStore]);
  
  // Save cart to localStorage when it changes
  useEffect(() => {
    const storageKey = `barangKosongCart_${selectedStore || 'mjm'}`;
    const activeStore = (selectedStore || 'mjm').toLowerCase();
    const cartForActiveStore = cart.filter(
      item => (item.store || activeStore).toLowerCase() === activeStore
    );

    if (cartForActiveStore.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(cartForActiveStore));
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
  
  const OPEN_ORDER_SUPPLIER_STATUSES = ['PENDING', 'pending', 'CART', 'cart', 'DRAFT', 'draft'];

  const upsertOrderSupplierCartItem = async (cartItem: CartItem) => {
    const targetStore = (cartItem.store || selectedStore || 'mjm').toLowerCase();

    const { data: existingRows, error: fetchError } = await supabase
      .from('order_supplier')
      .select('id')
      .eq('store', targetStore)
      .eq('part_number', cartItem.part_number)
      .eq('supplier', cartItem.supplier)
      .in('status', OPEN_ORDER_SUPPLIER_STATUSES)
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;

    const payload = {
      store: targetStore,
      supplier: cartItem.supplier,
      part_number: cartItem.part_number,
      name: cartItem.nama_barang,
      qty: cartItem.qty,
      price: cartItem.price || 0,
      status: 'PENDING',
      notes: `Keranjang Barang Kosong ${targetStore.toUpperCase()}`
    };

    if (existingRows && existingRows.length > 0) {
      const primaryId = existingRows[0].id;
      const duplicateIds = existingRows.slice(1).map(r => r.id).filter(Boolean);

      const { error: updateError } = await supabase
        .from('order_supplier')
        .update(payload)
        .eq('id', primaryId);

      if (updateError) throw updateError;

      if (duplicateIds.length > 0) {
        const { error: deleteDuplicateError } = await supabase
          .from('order_supplier')
          .delete()
          .in('id', duplicateIds);

        if (deleteDuplicateError) throw deleteDuplicateError;
      }

      return;
    }

    const { error: insertError } = await supabase
      .from('order_supplier')
      .insert(payload);

    if (insertError) throw insertError;
  };

  const deleteOrderSupplierCartItem = async (partNumber: string, supplier: string) => {
    const { error } = await supabase
      .from('order_supplier')
      .delete()
      .eq('part_number', partNumber)
      .eq('supplier', supplier)
      .in('status', OPEN_ORDER_SUPPLIER_STATUSES);

    if (error) throw error;
  };

  const clearOrderSupplierCartByStore = async (store: string) => {
    const targetStore = (store || selectedStore || 'mjm').toLowerCase();
    const { error } = await supabase
      .from('order_supplier')
      .delete()
      .eq('store', targetStore)
      .in('status', OPEN_ORDER_SUPPLIER_STATUSES);

    if (error) throw error;
  };

  const addImporterCatalogItemsToCart = async (
    importerNameRaw: string,
    items: ImporterCatalogItem[]
  ) => {
    const importerName = normalizeSupplierName(importerNameRaw);
    if (!importerName) {
      setToast({ msg: 'Nama importir tujuan wajib diisi', type: 'error' });
      return;
    }
    if (items.length === 0) {
      setToast({ msg: 'Pilih minimal 1 barang', type: 'error' });
      return;
    }

    const targetStore = (selectedStore || 'mjm').toLowerCase();
    const nextCart = [...cart];
    const upsertPayloadMap = new Map<string, CartItem>();

    items.forEach((item) => {
      const existingIndex = nextCart.findIndex((cartItem) =>
        cartItem.part_number === item.part_number &&
        cartItem.supplier.toLowerCase() === importerName.toLowerCase() &&
        (cartItem.store || targetStore).toLowerCase() === targetStore
      );

      if (existingIndex >= 0) {
        const updatedItem: CartItem = {
          ...nextCart[existingIndex],
          qty: nextCart[existingIndex].qty + 1
        };
        nextCart[existingIndex] = updatedItem;
        upsertPayloadMap.set(
          `${updatedItem.part_number}::${updatedItem.supplier}::${targetStore}`,
          updatedItem
        );
        return;
      }

      const newCartItem: CartItem = {
        part_number: item.part_number,
        nama_barang: item.nama_barang,
        supplier: importerName,
        qty: 1,
        price: item.cheapest_price || 0,
        tempo: activeTab === 'TEMPO' ? 'TEMPO' : 'CASH',
        store: targetStore,
        brand: item.brand,
        application: item.application
      };

      nextCart.push(newCartItem);
      upsertPayloadMap.set(
        `${newCartItem.part_number}::${newCartItem.supplier}::${targetStore}`,
        newCartItem
      );
    });

    setCart(nextCart);
    setShowCart(true);

    try {
      await Promise.all(
        Array.from(upsertPayloadMap.values()).map((cartItem) => upsertOrderSupplierCartItem(cartItem))
      );
      setToast({ msg: `${items.length} barang masuk ke keranjang ${importerName}`, type: 'success' });
      setImporterNameDraft(importerName);
      setShowImporterModal(false);
    } catch (error: any) {
      console.error('Error syncing importer catalog cart to order_supplier:', error);
      setToast({ msg: `Gagal simpan ke order_supplier: ${error.message}`, type: 'error' });
    }
  };

  // Cart functions
  const addToCart = async (item: SupplierItem, supplier: string) => {
    const targetStore = (selectedStore || 'mjm').toLowerCase();
    const existing = cart.find(c =>
      c.part_number === item.part_number &&
      c.supplier === supplier &&
      (c.store || targetStore).toLowerCase() === targetStore
    );

    const nextQty = (existing?.qty || 0) + 1;
    const nextCartItem: CartItem = {
      part_number: item.part_number,
      nama_barang: item.nama_barang,
      supplier,
      qty: nextQty,
      price: existing?.price ?? item.last_price ?? 0,
      tempo: existing?.tempo || item.tempo || 'CASH',
      store: targetStore,
      brand: item.brand,
      application: item.application
    };

    setCart(prev => {
      const found = prev.find(c =>
        c.part_number === item.part_number &&
        c.supplier === supplier &&
        (c.store || targetStore).toLowerCase() === targetStore
      );

      if (found) {
        return prev.map(c => 
          c.part_number === item.part_number &&
          c.supplier === supplier &&
          (c.store || targetStore).toLowerCase() === targetStore
            ? { ...c, qty: c.qty + 1 } 
            : c
        );
      }
      return [...prev, nextCartItem];
    });

    try {
      await upsertOrderSupplierCartItem(nextCartItem);
      setToast({ msg: `${item.nama_barang} ditambahkan ke keranjang`, type: 'success' });
    } catch (error: any) {
      console.error('Error syncing addToCart to order_supplier:', error);
      setToast({ msg: `Gagal simpan ke order_supplier: ${error.message}`, type: 'error' });
    }
  };
  
  const removeFromCart = async (partNumber: string, supplier: string, store?: string) => {
    setCart(prev => prev.filter(c => !(c.part_number === partNumber && c.supplier === supplier)));

    try {
      await deleteOrderSupplierCartItem(partNumber, supplier);
    } catch (error: any) {
      console.error('Error syncing removeFromCart to order_supplier:', error);
      setToast({ msg: `Gagal hapus dari order_supplier: ${error.message}`, type: 'error' });
    }
  };
  
  const updateCartQty = async (partNumber: string, supplier: string, qty: number, store?: string) => {
    const targetItem = cart.find(
      c =>
        c.part_number === partNumber &&
        c.supplier === supplier &&
        (!store || (c.store || '').toLowerCase() === store.toLowerCase())
    );
    const targetStore = (store || targetItem?.store || selectedStore || 'mjm').toLowerCase();

    if (qty <= 0) {
      await removeFromCart(partNumber, supplier, targetStore);
      return;
    }

    setCart(prev => prev.map(c => 
      c.part_number === partNumber &&
      c.supplier === supplier &&
      (c.store || targetStore).toLowerCase() === targetStore
        ? { ...c, qty }
        : c
    ));

    if (!targetItem) return;

    try {
      await upsertOrderSupplierCartItem({
        ...targetItem,
        qty,
        store: targetStore
      });
    } catch (error: any) {
      console.error('Error syncing updateCartQty to order_supplier:', error);
      setToast({ msg: `Gagal update qty di order_supplier: ${error.message}`, type: 'error' });
    }
  };
  
  const clearCart = async () => {
    const targetStore = (selectedStore || 'mjm').toLowerCase();

    setCart(prev => prev.filter(c => (c.store || targetStore).toLowerCase() !== targetStore));

    try {
      await clearOrderSupplierCartByStore(targetStore);
    } catch (error: any) {
      console.error('Error syncing clearCart to order_supplier:', error);
      setToast({ msg: `Gagal kosongkan order_supplier: ${error.message}`, type: 'error' });
      return;
    }

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
      const orderItemMap = new Map<string, {
        order_id: number;
        part_number: string;
        nama_barang: string;
        qty: number;
        harga_satuan: number;
        harga_total: number;
      }>();

      supplierItems.forEach((item) => {
        const key = `${item.part_number}::${item.price}`;
        const existing = orderItemMap.get(key);
        if (existing) {
          existing.qty += item.qty;
          existing.harga_total = existing.qty * existing.harga_satuan;
          return;
        }
        orderItemMap.set(key, {
          order_id: orderData.id,
          part_number: item.part_number,
          nama_barang: item.nama_barang,
          qty: item.qty,
          harga_satuan: item.price,
          harga_total: item.qty * item.price
        });
      });

      const orderItems = Array.from(orderItemMap.values());
      
      const { error: itemsError } = await supabase
        .from('supplier_order_items')
        .insert(orderItems);
      
      if (itemsError) throw itemsError;
      
      const uniqueOrderKeys = new Set<string>();
      supplierItems.forEach((item) => {
        uniqueOrderKeys.add(`${item.part_number}::${item.store || ''}`);
      });

      for (const key of uniqueOrderKeys) {
        const [partNumber, itemStore] = key.split('::');
        let updateQuery = supabase
          .from('order_supplier')
          .update({ status: 'ORDERED' })
          .eq('supplier', currentSupplier)
          .eq('part_number', partNumber)
          .in('status', OPEN_ORDER_SUPPLIER_STATUSES);

        if (itemStore) {
          updateQuery = updateQuery.eq('store', itemStore);
        }

        const { error: markOrderedError } = await updateQuery;
        if (markOrderedError) {
          console.error(
            `Error marking order_supplier row as ORDERED (${currentSupplier} / ${partNumber} / ${itemStore || 'ALL'}):`,
            markOrderedError
          );
        }
      }

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
              onClick={openImporterModal}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white rounded-lg transition-colors text-sm font-bold"
              title="Menu Importir Baru"
            >
              <Plus size={18} />
              <span className="hidden md:inline">Importir Baru</span>
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
                currentStore={selectedStore}
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
      
      {/* Importer Catalog Modal */}
      {showImporterModal && (
        <ImporterCatalogModal
          importerName={importerNameDraft}
          onImporterNameChange={setImporterNameDraft}
          suggestions={knownSuppliers}
          items={importerCatalogItems}
          loading={importerCatalogLoading}
          error={importerCatalogError}
          onRefresh={loadImporterCatalog}
          onClose={() => setShowImporterModal(false)}
          onAddSelected={addImporterCatalogItemsToCart}
        />
      )}

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
