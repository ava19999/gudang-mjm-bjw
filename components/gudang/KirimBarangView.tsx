// FILE: src/components/gudang/KirimBarangView.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Package, ArrowRightLeft, Plus, Send, Check, X,
  Truck, ChevronDown, ChevronUp, AlertCircle, RefreshCw,
  Filter, Building2, Minus, Download
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import {
  KirimBarangItem,
  StockItem,
  fetchBothStoreStock,
  fetchKirimBarang,
  getBulkStockComparison,
  getBulkShelfComparison,
  createKirimBarangRequest,
  approveKirimBarang,
  sendKirimBarang,
  receiveKirimBarang,
  rejectKirimBarang,
  deleteKirimBarang,
  updateKirimBarangPartNumber,
  searchItemsBothStores
} from '../../services/kirimBarangService';

type ViewMode = 'stock_comparison' | 'request_list';
type FilterType = 'all' | 'incoming' | 'outgoing' | 'rejected' | 'pending' | 'approved' | 'completed';
type PeriodFilterType = 'all_period' | 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month';
const ALL_PERIOD_VALUE: PeriodFilterType = 'all_period';
const PERIOD_FILTER_OPTIONS: Array<{ value: PeriodFilterType; label: string }> = [
  { value: ALL_PERIOD_VALUE, label: 'Semua Periode' },
  { value: 'today', label: 'Hari Ini' },
  { value: 'yesterday', label: 'Kemarin' },
  { value: 'last_7_days', label: '7 Hari Terakhir' },
  { value: 'last_30_days', label: '30 Hari Terakhir' },
  { value: 'this_month', label: 'Bulan Ini' },
  { value: 'last_month', label: 'Bulan Lalu' }
];

// Extended stock item with request quantity
interface StockItemWithRequest extends StockItem {
  requestQty: number;
  catatan: string;
}

const getStartOfDay = (date: Date): Date => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const isDateInPeriod = (value: string | null | undefined, period: PeriodFilterType): boolean => {
  if (period === ALL_PERIOD_VALUE) return true;
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const target = getStartOfDay(date);
  const today = getStartOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  switch (period) {
    case 'today':
      return target.getTime() === today.getTime();
    case 'yesterday':
      return target.getTime() === yesterday.getTime();
    case 'last_7_days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return target >= start && target <= today;
    }
    case 'last_30_days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return target >= start && target <= today;
    }
    case 'this_month':
      return target.getFullYear() === today.getFullYear() && target.getMonth() === today.getMonth();
    case 'last_month': {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return target.getFullYear() === lastMonth.getFullYear() && target.getMonth() === lastMonth.getMonth();
    }
    default:
      return true;
  }
};

const getPeriodDisplayLabel = (period: PeriodFilterType): string => (
  PERIOD_FILTER_OPTIONS.find(option => option.value === period)?.label || 'Semua Periode'
);

const getDateValueByFilter = (item: KirimBarangItem, activeFilter: FilterType): string | null => {
  switch (activeFilter) {
    case 'approved': return item.approved_at;
    case 'rejected': return item.rejected_at;
    case 'completed': return item.received_at;
    default: return item.created_at;
  }
};

export const KirimBarangView: React.FC = () => {
  const { selectedStore, userName } = useStore();
  const currentStore = selectedStore as 'mjm' | 'bjw';

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('stock_comparison');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ mjm: StockItemWithRequest[]; bjw: StockItemWithRequest[] }>({ mjm: [], bjw: [] });
  const [requests, setRequests] = useState<KirimBarangItem[]>([]);
  const [stockComparisonMap, setStockComparisonMap] = useState<Record<string, { mjm: number; bjw: number }>>({});
  const [senderShelfMap, setSenderShelfMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilterType>(ALL_PERIOD_VALUE);
  const [isStatusTableMinimized, setIsStatusTableMinimized] = useState(false);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; show: boolean; reason: string }>({
    id: '',
    show: false,
    reason: ''
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [sendingItem, setSendingItem] = useState<string | null>(null);
  const [sendQtyEdits, setSendQtyEdits] = useState<Record<string, string>>({});
  const [requestPartSearch, setRequestPartSearch] = useState('');
  const [partNumberOptionsByStore, setPartNumberOptionsByStore] = useState<{ mjm: StockItem[]; bjw: StockItem[] }>({ mjm: [], bjw: [] });
  const [partNumberOptionsLoading, setPartNumberOptionsLoading] = useState(false);
  const [partNumberEdits, setPartNumberEdits] = useState<Record<string, string>>({});
  const [selectedSendRequestIds, setSelectedSendRequestIds] = useState<string[]>([]);

  // Toast helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load requests
  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchKirimBarang(currentStore, filter);
      setRequests(data);

      const uniquePartNumbers = Array.from(new Set(data.map(item => item.part_number).filter(Boolean)));
      if (uniquePartNumbers.length > 0) {
        const [comparisonByPart, shelfByPart] = await Promise.all([
          getBulkStockComparison(uniquePartNumbers),
          getBulkShelfComparison(uniquePartNumbers)
        ]);
        const comparisonByRequest: Record<string, { mjm: number; bjw: number }> = {};
        const senderShelfByRequest: Record<string, string> = {};
        data.forEach(item => {
          comparisonByRequest[item.id] = comparisonByPart[item.part_number] || { mjm: 0, bjw: 0 };
          const shelfPair = shelfByPart[item.part_number] || { mjm: '-', bjw: '-' };
          senderShelfByRequest[item.id] = item.from_store === 'mjm' ? shelfPair.mjm : shelfPair.bjw;
        });
        setStockComparisonMap(comparisonByRequest);
        setSenderShelfMap(senderShelfByRequest);
      } else {
        setStockComparisonMap({});
        setSenderShelfMap({});
      }
    } finally {
      setLoading(false);
    }
  }, [currentStore, filter]);

  useEffect(() => {
    if (viewMode === 'request_list') {
      loadRequests();
    }
  }, [viewMode, loadRequests]);

  useEffect(() => {
    setIsStatusTableMinimized(false);
  }, [filter]);

  const loadPartNumberOptions = useCallback(async () => {
    setPartNumberOptionsLoading(true);
    try {
      const stockOptions = await fetchBothStoreStock();
      setPartNumberOptionsByStore(stockOptions);
    } finally {
      setPartNumberOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode !== 'request_list') return;
    if (partNumberOptionsByStore.mjm.length > 0 || partNumberOptionsByStore.bjw.length > 0) return;
    loadPartNumberOptions();
  }, [viewMode, loadPartNumberOptions, partNumberOptionsByStore.mjm.length, partNumberOptionsByStore.bjw.length]);

  // Search items
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults({ mjm: [], bjw: [] });
      return;
    }
    setLoading(true);
    const results = await searchItemsBothStores(searchQuery);
    // Add requestQty field to each item
    setSearchResults({
      mjm: results.mjm.map(item => ({ ...item, requestQty: 0, catatan: '' })),
      bjw: results.bjw.map(item => ({ ...item, requestQty: 0, catatan: '' }))
    });
    setLoading(false);
  };

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (searchQuery.length >= 2) {
        handleSearch();
      } else if (searchQuery.length === 0) {
        setSearchResults({ mjm: [], bjw: [] });
      }
    }, 500);
    return () => clearTimeout(delaySearch);
  }, [searchQuery]);

  // Update request quantity for an item
  const updateRequestQty = (store: 'mjm' | 'bjw', partNumber: string, qty: number) => {
    setSearchResults(prev => ({
      ...prev,
      [store]: prev[store].map(item =>
        item.part_number === partNumber ? { ...item, requestQty: Math.max(0, qty) } : item
      )
    }));
  };

  // Update catatan for an item
  const updateCatatan = (store: 'mjm' | 'bjw', partNumber: string, catatan: string) => {
    setSearchResults(prev => ({
      ...prev,
      [store]: prev[store].map(item =>
        item.part_number === partNumber ? { ...item, catatan } : item
      )
    }));
  };

  // Send request for a single item
  const handleSendRequest = async (item: StockItemWithRequest, fromStore: 'mjm' | 'bjw') => {
    if (item.requestQty <= 0) {
      showToast('Masukkan quantity yang akan diminta', 'error');
      return;
    }

    setSendingItem(item.part_number);
    const toStore = fromStore === 'mjm' ? 'bjw' : 'mjm';
    
    const result = await createKirimBarangRequest({
      from_store: fromStore,
      to_store: toStore,
      part_number: item.part_number,
      nama_barang: item.name,
      brand: item.brand,
      application: item.application,
      quantity: item.requestQty,
      catatan: item.catatan,
      requested_by: userName
    });

    if (result.success) {
      showToast(`Request ${item.part_number} berhasil! Qty: ${item.requestQty}`);
      // Reset the qty after successful request
      updateRequestQty(fromStore, item.part_number, 0);
      updateCatatan(fromStore, item.part_number, '');
    } else {
      showToast(result.error || 'Gagal membuat request', 'error');
    }
    setSendingItem(null);
  };

  // Action handlers for request list
  const handleApprove = async (id: string, quantityOverride?: number) => {
    if (typeof quantityOverride === 'number' && quantityOverride <= 0) {
      showToast('Qty harus lebih dari 0', 'error');
      return;
    }

    setLoading(true);
    const result = await approveKirimBarang(id, userName, quantityOverride);
    if (result.success) {
      showToast('Request disetujui!');
      setSendQtyEdits(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      loadRequests();
    } else {
      showToast(result.error || 'Gagal menyetujui', 'error');
    }
    setLoading(false);
  };

  const handleSend = async (id: string, quantityOverride?: number) => {
    if (typeof quantityOverride === 'number' && quantityOverride <= 0) {
      showToast('Qty kirim harus lebih dari 0', 'error');
      return;
    }

    setLoading(true);
    const result = await sendKirimBarang(id, userName, quantityOverride);
    if (result.success) {
      showToast('Barang sudah dikirim! Stok sudah dikurangi.');
      setSendQtyEdits(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      loadRequests();
    } else {
      showToast(result.error || 'Gagal mengirim', 'error');
    }
    setLoading(false);
  };

  const handleReceive = async (id: string) => {
    setLoading(true);
    const result = await receiveKirimBarang(id, userName);
    if (result.success) {
      showToast('Barang diterima! Stok sudah ditambahkan.');
      loadRequests();
    } else {
      showToast(result.error || 'Gagal menerima', 'error');
    }
    setLoading(false);
  };

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) {
      showToast('Alasan penolakan wajib diisi', 'error');
      return;
    }
    setLoading(true);
    const result = await rejectKirimBarang(rejectModal.id, userName, rejectModal.reason);
    if (result.success) {
      showToast('Request ditolak');
      setRejectModal({ id: '', show: false, reason: '' });
      loadRequests();
    } else {
      showToast(result.error || 'Gagal menolak', 'error');
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus request ini?')) return;
    setLoading(true);
    const result = await deleteKirimBarang(id);
    if (result.success) {
      showToast('Request dihapus');
      loadRequests();
    } else {
      showToast(result.error || 'Gagal menghapus', 'error');
    }
    setLoading(false);
  };

  const getFilterDisplayLabel = (activeFilter: FilterType): string => {
    switch (activeFilter) {
      case 'all': return 'Semua';
      case 'incoming': return `Masuk ke ${currentStore.toUpperCase()}`;
      case 'outgoing': return `Keluar dari ${currentStore.toUpperCase()}`;
      case 'pending': return 'Pending';
      case 'approved': return 'Disetujui';
      case 'rejected': return 'Ditolak';
      case 'completed': return 'Diterima';
      default: return activeFilter;
    }
  };

  const getFilterDateLabel = (activeFilter: FilterType): string => {
    switch (activeFilter) {
      case 'approved': return 'Tanggal Disetujui';
      case 'rejected': return 'Tanggal Ditolak';
      case 'completed': return 'Tanggal Diterima';
      default: return 'Tanggal Request';
    }
  };

  const getFilterDateValue = (item: KirimBarangItem, activeFilter: FilterType): string | null => {
    return getDateValueByFilter(item, activeFilter);
  };

  const isSendQtyEditable = (item: KirimBarangItem) =>
    (item.status === 'pending' || item.status === 'approved') && item.from_store === currentStore;

  const getSendQtyValue = (item: KirimBarangItem): string => (
    sendQtyEdits[item.id] ?? String(item.quantity)
  );

  const getSendQtyNumber = (item: KirimBarangItem): number => {
    const parsed = Number.parseInt(getSendQtyValue(item), 10);
    return Number.isNaN(parsed) ? item.quantity : parsed;
  };

  const updateSendQty = (id: string, value: string) => {
    if (!/^\d*$/.test(value)) return;
    setSendQtyEdits(prev => ({ ...prev, [id]: value }));
  };

  const getStockByStore = (requestId: string, store: 'mjm' | 'bjw'): number | null => {
    const stock = stockComparisonMap[requestId];
    if (!stock) return null;
    return store === 'mjm' ? stock.mjm : stock.bjw;
  };

  const getSenderShelf = (requestId: string): string => (
    senderShelfMap[requestId] || '-'
  );

  const isBulkSendEligible = (item: KirimBarangItem) =>
    item.status === 'approved' && item.from_store === currentStore;

  const toggleSelectSendRequest = (id: string, checked: boolean) => {
    setSelectedSendRequestIds(prev => {
      if (checked) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      }
      return prev.filter(itemId => itemId !== id);
    });
  };

  const isPartNumberEditable = (item: KirimBarangItem) =>
    item.status === 'pending' && item.from_store === currentStore;
  const getPartNumberEditValue = (item: KirimBarangItem): string =>
    partNumberEdits[item.id] ?? item.part_number;
  const updatePartNumberEditValue = (id: string, value: string) => {
    setPartNumberEdits(prev => ({ ...prev, [id]: value }));
  };

  const handlePartNumberUpdate = async (item: KirimBarangItem, nextPartNumber: string) => {
    if (!isPartNumberEditable(item)) return;

    const normalizedNext = String(nextPartNumber || '').trim().toUpperCase();
    const normalizedCurrent = String(item.part_number || '').trim().toUpperCase();
    if (!normalizedNext || normalizedNext === normalizedCurrent) {
      setPartNumberEdits(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    setLoading(true);
    const result = await updateKirimBarangPartNumber(item.id, normalizedNext);
    if (result.success) {
      showToast(`Part number diubah ke ${normalizedNext}`);
      setPartNumberEdits(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      loadRequests();
    } else {
      showToast(result.error || 'Gagal mengubah part number', 'error');
    }
    setLoading(false);
  };

  const handleBulkSendSelected = async () => {
    const selectedRows = statusTableRows.filter(req =>
      selectedSendRequestIds.includes(req.id) && isBulkSendEligible(req)
    );

    if (selectedRows.length === 0) {
      showToast('Pilih minimal 1 request disetujui untuk dikirim', 'error');
      return;
    }

    setLoading(true);
    let successCount = 0;
    let failCount = 0;

    for (const req of selectedRows) {
      const result = await sendKirimBarang(req.id, userName, getSendQtyNumber(req));
      if (result.success) {
        successCount += 1;
      } else {
        failCount += 1;
      }
    }

    if (successCount > 0) {
      showToast(`${successCount} request berhasil dikirim`);
    }
    if (failCount > 0) {
      showToast(`${failCount} request gagal dikirim`, 'error');
    }

    setSelectedSendRequestIds([]);
    await loadRequests();
    setLoading(false);
  };

  const handleDownloadFilterPdf = () => {
    const isAllPeriodSelected = selectedPeriod === ALL_PERIOD_VALUE;
    const printableRows = statusTableRows;

    const filterLabel = getFilterDisplayLabel(filter);
    const selectedDateLabel = getPeriodDisplayLabel(selectedPeriod);

    if (printableRows.length === 0) {
      showToast(
        isAllPeriodSelected
          ? `Tidak ada data filter ${filterLabel.toLowerCase()}`
          : `Tidak ada data filter ${filterLabel.toLowerCase()} pada periode tersebut`,
        'error'
      );
      return;
    }

    const escapeHtml = (value: string | null | undefined) =>
      String(value ?? '-')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const getPdfQtyValue = (item: KirimBarangItem): string => {
      const qtyValue = isSendQtyEditable(item) ? getSendQtyValue(item) : String(item.quantity);
      return qtyValue === '' ? String(item.quantity) : qtyValue;
    };

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup diblokir. Izinkan popup untuk export PDF', 'error');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Daftar Request ${filterLabel} - ${currentStore.toUpperCase()}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: A4 landscape; margin: 6mm; }
          body { font-family: Arial, sans-serif; padding: 0; color: #111827; font-size: 9px; }
          h1 { font-size: 13px; margin-bottom: 2px; }
          .subtitle { color: #4b5563; margin-bottom: 6px; font-size: 9px; }
          .meta { margin-bottom: 6px; font-size: 8px; color: #374151; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #d1d5db; padding: 3px 4px; font-size: 8.5px; text-align: left; vertical-align: top; line-height: 1.2; }
          th { background: #f3f4f6; font-weight: 700; }
          .text-center { text-align: center; }
          .no-wrap { white-space: nowrap; }
          .col-no { width: 3%; }
          .col-part { width: 11%; }
          .col-name { width: 14%; }
          .col-stock-from { width: 12%; word-break: break-word; }
          .col-stock-to { width: 7%; }
          .col-qty { width: 6%; }
          .col-status { width: 7%; }
          .col-requester { width: 7%; }
          .col-date { width: 10%; }
          .col-note { width: 19%; word-break: break-word; }
          tr, td, th { page-break-inside: avoid; }
          thead { display: table-header-group; }
          .footer { margin-top: 6px; color: #6b7280; font-size: 8px; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <h1>Daftar Request ${filterLabel}</h1>
        <div class="subtitle">Transfer barang antar toko (per periode)</div>
        <div class="meta">
          Toko Aktif: <strong>${currentStore.toUpperCase()}</strong> |
          Periode: <strong>${selectedDateLabel}</strong> |
          Total Data: <strong>${printableRows.length}</strong> |
          Tanggal Cetak: <strong>${new Date().toLocaleString('id-ID')}</strong>
        </div>
        <table>
          <thead>
            <tr>
              <th class="text-center col-no no-wrap">No</th>
              <th class="col-part">Part Number</th>
              <th class="col-name">Nama Barang</th>
              <th class="col-stock-from">Stok Dari + Rak</th>
              <th class="col-stock-to no-wrap">Stok Ke</th>
              <th class="text-center col-qty no-wrap">Qty</th>
              <th class="col-status no-wrap">Status</th>
              <th class="col-requester no-wrap">Request Oleh</th>
              <th class="col-date">${filterDateLabel}</th>
              <th class="col-note">${filter === 'rejected' ? 'Alasan Ditolak' : 'Catatan'}</th>
            </tr>
          </thead>
          <tbody>
            ${printableRows.map((req, index) => `
              <tr>
                <td class="text-center col-no">${index + 1}</td>
                <td class="col-part">${escapeHtml(req.part_number)}</td>
                <td class="col-name">${escapeHtml(req.nama_barang)}</td>
                <td class="col-stock-from">${escapeHtml(`${req.from_store.toUpperCase()}: ${getStockByStore(req.id, req.from_store) ?? '-'} | Rak: ${getSenderShelf(req.id)}`)}</td>
                <td class="col-stock-to no-wrap">${escapeHtml(`${req.to_store.toUpperCase()}: ${getStockByStore(req.id, req.to_store) ?? '-'}`)}</td>
                <td class="text-center col-qty no-wrap">${escapeHtml(getPdfQtyValue(req))}</td>
                <td class="col-status no-wrap">${escapeHtml(getStatusLabel(req.status))}</td>
                <td class="col-requester no-wrap">${escapeHtml(req.requested_by)}</td>
                <td class="col-date">${getFilterDateValue(req, filter) ? new Date(getFilterDateValue(req, filter) as string).toLocaleString('id-ID') : '-'}</td>
                <td class="col-note">${filter === 'rejected' ? escapeHtml(req.catatan_reject || '-') : escapeHtml(req.catatan || req.catatan_reject || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">
          Dokumen ini dibuat otomatis dari sistem gudang MJM/BJW.
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);

    showToast(`Dialog PDF filter ${filterLabel.toLowerCase()} dibuka. Pilih "Save as PDF" untuk mengunduh`);
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-900/30 text-yellow-400 border-yellow-700';
      case 'approved': return 'bg-blue-900/30 text-blue-400 border-blue-700';
      case 'sent': return 'bg-purple-900/30 text-purple-400 border-purple-700';
      case 'received': return 'bg-green-900/30 text-green-400 border-green-700';
      case 'rejected': return 'bg-red-900/30 text-red-400 border-red-700';
      default: return 'bg-gray-900/30 text-gray-400 border-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Menunggu';
      case 'approved': return 'Disetujui';
      case 'sent': return 'Dikirim';
      case 'received': return 'Diterima';
      case 'rejected': return 'Ditolak';
      default: return status;
    }
  };

  const statusTableDateLabel = getPeriodDisplayLabel(selectedPeriod);
  const filterDisplayLabel = getFilterDisplayLabel(filter);
  const filterDateLabel = getFilterDateLabel(filter);
  const availablePeriodOptions = useMemo(() => {
    const periodCounts: Record<PeriodFilterType, number> = {
      [ALL_PERIOD_VALUE]: requests.length,
      today: 0,
      yesterday: 0,
      last_7_days: 0,
      last_30_days: 0,
      this_month: 0,
      last_month: 0
    };

    requests.forEach((item) => {
      const dateValue = getFilterDateValue(item, filter);
      if (!dateValue) return;

      (Object.keys(periodCounts) as PeriodFilterType[]).forEach((periodKey) => {
        if (periodKey === ALL_PERIOD_VALUE) return;
        if (isDateInPeriod(dateValue, periodKey)) {
          periodCounts[periodKey] += 1;
        }
      });
    });

    return PERIOD_FILTER_OPTIONS.map(option => ({
      value: option.value,
      label: option.label,
      count: periodCounts[option.value] || 0
    }));
  }, [requests, filter]);
  const selectedPeriodValue = (
    availablePeriodOptions.some(option => option.value === selectedPeriod)
  )
    ? selectedPeriod
    : ALL_PERIOD_VALUE;
  const normalizePartNumberSearch = (value: string): string =>
    String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const requestPartSearchKey = normalizePartNumberSearch(requestPartSearch);
  const matchesPartNumber = (partNumber: string | null | undefined): boolean => (
    !requestPartSearchKey || normalizePartNumberSearch(partNumber || '').includes(requestPartSearchKey)
  );
  const allRequestRows = requests.filter(req => matchesPartNumber(req.part_number));
  const statusTableRowsBase = requests.filter(req =>
    isDateInPeriod(getFilterDateValue(req, filter), selectedPeriod)
  );
  const statusTableRows = statusTableRowsBase.filter(req => matchesPartNumber(req.part_number));
  const approvedSendableRows = statusTableRows.filter(req => isBulkSendEligible(req));
  const selectedApprovedSendableRows = approvedSendableRows.filter(req => selectedSendRequestIds.includes(req.id));
  const isAllApprovedSelected = approvedSendableRows.length > 0 && selectedApprovedSendableRows.length === approvedSendableRows.length;

  useEffect(() => {
    setSelectedSendRequestIds(prev => {
      const next = prev.filter(id => approvedSendableRows.some(req => req.id === id));
      if (next.length === prev.length && next.every((id, idx) => id === prev[idx])) {
        return prev;
      }
      return next;
    });
  }, [approvedSendableRows]);

  // Render stock table with inline request input
  const renderStockTable = (items: StockItemWithRequest[], store: 'mjm' | 'bjw') => {
    const otherStore = store === 'mjm' ? 'bjw' : 'mjm';
    const storeColorBg = store === 'mjm' ? 'bg-blue-900/30' : 'bg-purple-900/30';
    const storeColorText = store === 'mjm' ? 'text-blue-400' : 'text-purple-400';
    const otherStoreColorBtn = store === 'mjm' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700';

    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
        <div className={`${storeColorBg} px-4 py-3 border-b border-gray-700`}>
          <h3 className={`font-bold ${storeColorText} flex items-center gap-2`}>
            <Building2 size={18} />
            Stok {store.toUpperCase()} ({items.length} item)
            <span className="text-xs text-gray-500 font-normal ml-2">
              → Request ke {otherStore.toUpperCase()}
            </span>
          </h3>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {items.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-800 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-400">Part Number</th>
                  <th className="text-left px-3 py-2 text-gray-400 hidden md:table-cell">Nama Barang</th>
                  <th className="text-center px-3 py-2 text-gray-400">Stok</th>
                  <th className="text-center px-3 py-2 text-gray-400">Minta</th>
                  <th className="text-left px-3 py-2 text-gray-400 hidden lg:table-cell">Catatan</th>
                  <th className="text-center px-3 py-2 text-gray-400">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-t border-gray-700/50 hover:bg-gray-700/20">
                    <td className="px-3 py-2">
                      <div className="text-gray-300 font-mono text-xs">{item.part_number}</div>
                      <div className="text-gray-500 text-xs truncate max-w-[120px] md:hidden">{item.name}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-300 truncate max-w-[200px] hidden md:table-cell">
                      <div>{item.name}</div>
                      <div className="text-xs text-gray-500">{item.brand} {item.application && `• ${item.application}`}</div>
                    </td>
                    <td className={`px-3 py-2 text-center font-bold ${storeColorText}`}>
                      {item.quantity}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => updateRequestQty(store, item.part_number, item.requestQty - 1)}
                          className="p-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-400"
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={item.requestQty || ''}
                          onChange={(e) => updateRequestQty(store, item.part_number, parseInt(e.target.value) || 0)}
                          className="w-14 text-center px-1 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm"
                          placeholder="0"
                        />
                        <button
                          onClick={() => updateRequestQty(store, item.part_number, item.requestQty + 1)}
                          className="p-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-400"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <input
                        type="text"
                        value={item.catatan}
                        onChange={(e) => updateCatatan(store, item.part_number, e.target.value)}
                        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs"
                        placeholder="Catatan..."
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleSendRequest(item, store)}
                        disabled={item.requestQty <= 0 || sendingItem === item.part_number}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 mx-auto transition-all ${
                          item.requestQty > 0
                            ? `${otherStoreColorBtn} text-white`
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {sendingItem === item.part_number ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <>
                            <Send size={14} />
                            <span className="hidden sm:inline">{otherStore.toUpperCase()}</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? 'Tidak ada hasil' : 'Ketik untuk mencari barang...'}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 p-3 md:p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-right ${
          toast.type === 'success' ? 'bg-green-900/90 text-green-300 border border-green-700' : 'bg-red-900/90 text-red-300 border border-red-700'
        }`}>
          {toast.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl shadow-lg">
            <ArrowRightLeft size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-100">Kirim Barang MJM ↔ BJW</h1>
            <p className="text-sm text-gray-400">Transfer barang antar toko</p>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setViewMode('stock_comparison')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              viewMode === 'stock_comparison'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Search size={16} />
            Cari & Request Barang
          </button>
          <button
            onClick={() => { setViewMode('request_list'); loadRequests(); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              viewMode === 'request_list'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Package size={16} />
            Daftar Request
          </button>
        </div>
      </div>

      {/* Stock Comparison View with Inline Input */}
      {viewMode === 'stock_comparison' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari part number atau nama barang dari database..."
              className="w-full pl-12 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {loading && (
              <RefreshCw className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin" size={20} />
            )}
          </div>

          {/* Info Box */}
          <div className="bg-indigo-900/20 border border-indigo-800/50 rounded-xl p-4 text-sm text-indigo-300">
            <p className="flex items-start gap-2">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>
                Cari barang di atas, lalu masukkan quantity yang ingin diminta pada kolom <strong>Minta</strong>, 
                kemudian klik tombol kirim. Data barang diambil otomatis dari database. Quantity boleh melebihi stok yang tersedia.
              </span>
            </p>
          </div>

          {/* Stock Tables - Side by Side */}
          {searchQuery.length >= 2 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {renderStockTable(searchResults.mjm, 'mjm')}
              {renderStockTable(searchResults.bjw, 'bjw')}
            </div>
          )}
        </div>
      )}

      {/* Request List View */}
      {viewMode === 'request_list' && (
        <div className="space-y-4">
          <datalist id="part-options-mjm">
            {partNumberOptionsByStore.mjm.map(option => (
              <option key={`mjm-${option.part_number}`} value={option.part_number}>
                {option.name}
              </option>
            ))}
          </datalist>
          <datalist id="part-options-bjw">
            {partNumberOptionsByStore.bjw.map(option => (
              <option key={`bjw-${option.part_number}`} value={option.part_number}>
                {option.name}
              </option>
            ))}
          </datalist>

          {/* Filter */}
          <div className="flex flex-wrap gap-2 items-center">
            <Filter size={18} className="text-gray-500" />
            {(['all', 'incoming', 'outgoing', 'rejected', 'pending', 'approved', 'completed'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === f
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {f === 'all' && 'Semua'}
                {f === 'incoming' && `Masuk ke ${currentStore.toUpperCase()}`}
                {f === 'outgoing' && `Keluar dari ${currentStore.toUpperCase()}`}
                {f === 'rejected' && 'Ditolak'}
                {f === 'pending' && 'Pending'}
                {f === 'approved' && 'Setujui'}
                {f === 'completed' && 'Diterima'}
              </button>
            ))}
            <div className="ml-auto flex w-full md:w-auto items-center gap-2">
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                <input
                  type="text"
                  value={requestPartSearch}
                  onChange={(e) => setRequestPartSearch(e.target.value)}
                  placeholder="Cari part number..."
                  className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={loadRequests}
                className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Request List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="animate-spin text-indigo-500" size={32} />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package size={48} className="mx-auto mb-4 opacity-50" />
              <p>Belum ada request transfer</p>
            </div>
          ) : filter === 'all' ? (
            <div className="space-y-3">
              {allRequestRows.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-sm bg-gray-800/40 border border-gray-700 rounded-xl">
                  <p>Part number "{requestPartSearch}" tidak ditemukan.</p>
                </div>
              ) : allRequestRows.map((req) => (
                <div
                  key={req.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden"
                >
                  <div
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-700/30"
                    onClick={() => setExpandedRequest(expandedRequest === req.id ? null : req.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-sm">
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          req.from_store === 'mjm' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'
                        }`}>
                          {req.from_store.toUpperCase()}
                        </span>
                        <ArrowRightLeft size={14} className="text-gray-500" />
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          req.to_store === 'mjm' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'
                        }`}>
                          {req.to_store.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        {isPartNumberEditable(req) ? (
                          <input
                            type="text"
                            list={req.from_store === 'mjm' ? 'part-options-mjm' : 'part-options-bjw'}
                            value={getPartNumberEditValue(req)}
                            onChange={(e) => updatePartNumberEditValue(req.id, e.target.value)}
                            onBlur={() => handlePartNumberUpdate(req, getPartNumberEditValue(req))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                (e.currentTarget as HTMLInputElement).blur();
                              }
                            }}
                            disabled={loading || partNumberOptionsLoading}
                            className="w-56 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs font-mono"
                            placeholder={`Ketik part number (${req.from_store.toUpperCase()})`}
                            title={`Ketik atau pilih part number dari base_${req.from_store}`}
                          />
                        ) : (
                          <p className="text-gray-200 font-medium">{req.part_number}</p>
                        )}
                        <p className="text-gray-500 text-xs truncate max-w-[200px]">{req.nama_barang}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {stockComparisonMap[req.id] && (
                        <div className="hidden md:flex items-center gap-1 text-[11px]">
                          <span className="px-2 py-0.5 rounded border border-blue-800/50 bg-blue-900/30 text-blue-300">
                            MJM: {stockComparisonMap[req.id].mjm}
                          </span>
                          <span className="px-2 py-0.5 rounded border border-purple-800/50 bg-purple-900/30 text-purple-300">
                            BJW: {stockComparisonMap[req.id].bjw}
                          </span>
                        </div>
                      )}
                      <span className="text-lg font-bold text-indigo-400">
                        x{isSendQtyEditable(req) ? getSendQtyNumber(req) : req.quantity}
                      </span>
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${getStatusColor(req.status)}`}>
                        {getStatusLabel(req.status)}
                      </span>
                      {expandedRequest === req.id ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
                    </div>
                  </div>

                  {expandedRequest === req.id && (
                    <div className="px-4 py-3 border-t border-gray-700 bg-gray-800/30">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mb-4">
                        <div>
                          <span className="text-gray-500 text-xs">Brand</span>
                          <p className="text-gray-300">{req.brand || '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">Aplikasi</span>
                          <p className="text-gray-300">{req.application || '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">Request Oleh</span>
                          <p className="text-gray-300">{req.requested_by || '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">Tanggal</span>
                          <p className="text-gray-300">{new Date(req.created_at).toLocaleDateString('id-ID')}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">Rak Pengirim</span>
                          <p className="text-gray-300">{getSenderShelf(req.id)}</p>
                        </div>
                      </div>

                      {req.catatan && (
                        <div className="mb-4 p-2 bg-gray-700/30 rounded-lg">
                          <span className="text-gray-500 text-xs">Catatan:</span>
                          <p className="text-gray-300 text-sm">{req.catatan}</p>
                        </div>
                      )}

                      {req.catatan_reject && (
                        <div className="mb-4 p-2 bg-red-900/20 border border-red-800/50 rounded-lg">
                          <span className="text-red-400 text-xs">Alasan Ditolak:</span>
                          <p className="text-red-300 text-sm">{req.catatan_reject}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 text-xs mb-4">
                        {req.approved_at && (
                          <span className="px-2 py-1 bg-blue-900/20 text-blue-400 rounded">
                            Disetujui: {new Date(req.approved_at).toLocaleString('id-ID')} oleh {req.approved_by}
                          </span>
                        )}
                        {req.sent_at && (
                          <span className="px-2 py-1 bg-purple-900/20 text-purple-400 rounded">
                            Dikirim: {new Date(req.sent_at).toLocaleString('id-ID')} oleh {req.sent_by}
                          </span>
                        )}
                        {req.received_at && (
                          <span className="px-2 py-1 bg-green-900/20 text-green-400 rounded">
                            Diterima: {new Date(req.received_at).toLocaleString('id-ID')} oleh {req.received_by}
                          </span>
                        )}
                      </div>

                      {stockComparisonMap[req.id] && (
                        <div className="mb-4 p-3 bg-emerald-900/20 border border-emerald-800/40 rounded-lg">
                          <p className="text-emerald-300 text-xs mb-2">Perbandingan Stok MJM vs BJW</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-blue-800/40 bg-blue-900/20 px-3 py-2">
                              <span className="text-[11px] text-blue-300/80">Stok MJM</span>
                              <p className="text-blue-300 font-bold text-lg leading-tight">{stockComparisonMap[req.id].mjm}</p>
                            </div>
                            <div className="rounded-lg border border-purple-800/40 bg-purple-900/20 px-3 py-2">
                              <span className="text-[11px] text-purple-300/80">Stok BJW</span>
                              <p className="text-purple-300 font-bold text-lg leading-tight">{stockComparisonMap[req.id].bjw}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {req.status === 'pending' && req.from_store === currentStore && (
                          <>
                            <input
                              type="number"
                              min="1"
                              value={getSendQtyValue(req)}
                              onChange={(e) => updateSendQty(req.id, e.target.value)}
                              className="w-20 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100"
                              title="Edit qty"
                            />
                            <button
                              onClick={() => handleApprove(req.id, getSendQtyNumber(req))}
                              disabled={getSendQtyNumber(req) <= 0}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 ${
                                getSendQtyNumber(req) > 0
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              }`}
                            >
                              <Check size={14} /> Setujui
                            </button>
                            <button
                              onClick={() => setRejectModal({ id: req.id, show: true, reason: '' })}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-red-700"
                            >
                              <X size={14} /> Tolak
                            </button>
                          </>
                        )}

                        {req.status === 'approved' && req.from_store === currentStore && (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              value={getSendQtyValue(req)}
                              onChange={(e) => updateSendQty(req.id, e.target.value)}
                              className="w-20 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100"
                              title="Qty kirim"
                            />
                            <button
                              onClick={() => handleSend(req.id, getSendQtyNumber(req))}
                              disabled={getSendQtyNumber(req) <= 0}
                              className={`px-3 py-1.5 text-white rounded-lg text-sm font-medium flex items-center gap-1 ${
                                getSendQtyNumber(req) > 0
                                  ? 'bg-purple-600 hover:bg-purple-700'
                                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              }`}
                            >
                              <Truck size={14} /> Kirim Barang
                            </button>
                          </div>
                        )}

                        {req.status === 'sent' && req.to_store === currentStore && (
                          <>
                            <button
                              onClick={() => handleReceive(req.id)}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-green-700"
                            >
                              <Check size={14} /> Terima Barang
                            </button>
                            <button
                              onClick={() => setRejectModal({ id: req.id, show: true, reason: '' })}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-red-700"
                            >
                              <X size={14} /> Tolak
                            </button>
                          </>
                        )}

                        {req.status === 'pending' && req.to_store === currentStore && (
                          <button
                            onClick={() => handleDelete(req.id)}
                            className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-gray-700"
                          >
                            <X size={14} /> Hapus Request
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-100">
                    Tabel Request {filterDisplayLabel} - {statusTableDateLabel}
                  </p>
                  <p className="text-xs text-gray-400">Total item: {statusTableRows.length}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedPeriodValue}
                    onChange={(e) => setSelectedPeriod(e.target.value as PeriodFilterType)}
                    className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200"
                    title="Pilih periode data"
                    disabled={requests.length === 0}
                  >
                    {availablePeriodOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} ({option.count})
                      </option>
                    ))}
                  </select>
                  {filter === 'approved' && approvedSendableRows.length > 0 && (
                    <button
                      onClick={handleBulkSendSelected}
                      disabled={selectedApprovedSendableRows.length === 0 || loading}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${
                        selectedApprovedSendableRows.length > 0 && !loading
                          ? 'bg-purple-700 text-white hover:bg-purple-600'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      }`}
                      title="Kirim semua request yang dicentang"
                    >
                      <Truck size={14} />
                      Kirim Terpilih ({selectedApprovedSendableRows.length})
                    </button>
                  )}
                  <button
                    onClick={handleDownloadFilterPdf}
                    className={`px-3 py-1.5 text-white rounded-lg text-xs font-medium flex items-center gap-1 ${
                      filter === 'rejected'
                        ? 'bg-red-700 hover:bg-red-600'
                        : filter === 'approved'
                          ? 'bg-blue-700 hover:bg-blue-600'
                          : 'bg-indigo-700 hover:bg-indigo-600'
                    }`}
                    title="Download PDF per periode"
                  >
                    <Download size={14} />
                    PDF
                  </button>
                  <button
                    onClick={() => setIsStatusTableMinimized(prev => !prev)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium flex items-center gap-1"
                    title="Minimize/Buka tabel"
                  >
                    {isStatusTableMinimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    {isStatusTableMinimized ? 'Buka' : 'Minimize'}
                  </button>
                </div>
              </div>

              {!isStatusTableMinimized && (
                <div className="border-t border-gray-700">
                  {statusTableRows.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 text-sm">
                      {selectedPeriod === ALL_PERIOD_VALUE ? (
                        <p>Tidak ada data request untuk filter {filterDisplayLabel.toLowerCase()}</p>
                      ) : (
                        <p>Tidak ada data request untuk filter {filterDisplayLabel.toLowerCase()} pada periode {statusTableDateLabel}</p>
                      )}
                      {requestPartSearchKey && (
                        <p className="mt-1 text-xs text-gray-400">Part number "{requestPartSearch}" tidak ditemukan.</p>
                      )}
                      {requests.length > 0 && (
                        <p className="mt-1 text-xs text-gray-400">Coba ubah pilihan periode di atas untuk melihat data lainnya.</p>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-900/70">
                          <tr>
                            {filter === 'approved' && (
                              <th className="px-3 py-2 text-center text-gray-400">
                                <input
                                  type="checkbox"
                                  checked={isAllApprovedSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedSendRequestIds(approvedSendableRows.map(req => req.id));
                                    } else {
                                      setSelectedSendRequestIds([]);
                                    }
                                  }}
                                  disabled={approvedSendableRows.length === 0 || loading}
                                  className="h-3.5 w-3.5 accent-purple-600"
                                  title="Pilih semua untuk kirim"
                                />
                              </th>
                            )}
                            <th className="px-3 py-2 text-left text-gray-400">No</th>
                            <th className="px-3 py-2 text-left text-gray-400">Part Number</th>
                            <th className="px-3 py-2 text-left text-gray-400">Nama Barang</th>
                            <th className="px-3 py-2 text-center text-gray-400">Stok Dari</th>
                            <th className="px-3 py-2 text-center text-gray-400">Stok Ke</th>
                            <th className="px-3 py-2 text-left text-gray-400">Rak Pengirim</th>
                            <th className="px-3 py-2 text-right text-gray-400">Qty</th>
                            <th className="px-3 py-2 text-left text-gray-400">Status</th>
                            <th className="px-3 py-2 text-left text-gray-400">Request Oleh</th>
                            <th className="px-3 py-2 text-left text-gray-400">{filterDateLabel}</th>
                            <th className="px-3 py-2 text-left text-gray-400">{filter === 'rejected' ? 'Alasan Ditolak' : 'Catatan'}</th>
                            <th className="px-3 py-2 text-left text-gray-400">Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statusTableRows.map((req, index) => (
                            <tr key={req.id} className="border-t border-gray-700/50 hover:bg-gray-700/20">
                              {filter === 'approved' && (
                                <td className="px-3 py-2 text-center">
                                  {isBulkSendEligible(req) ? (
                                    <input
                                      type="checkbox"
                                      checked={selectedSendRequestIds.includes(req.id)}
                                      onChange={(e) => toggleSelectSendRequest(req.id, e.target.checked)}
                                      disabled={loading}
                                      className="h-3.5 w-3.5 accent-purple-600"
                                      title="Pilih request ini untuk kirim massal"
                                    />
                                  ) : (
                                    <span className="text-gray-600">-</span>
                                  )}
                                </td>
                              )}
                              <td className="px-3 py-2 text-gray-300">{index + 1}</td>
                              <td className="px-3 py-2 text-gray-200 font-mono">
                                {isPartNumberEditable(req) ? (
                                  <input
                                    type="text"
                                    list={req.from_store === 'mjm' ? 'part-options-mjm' : 'part-options-bjw'}
                                    value={getPartNumberEditValue(req)}
                                    onChange={(e) => updatePartNumberEditValue(req.id, e.target.value)}
                                    onBlur={() => handlePartNumberUpdate(req, getPartNumberEditValue(req))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        (e.currentTarget as HTMLInputElement).blur();
                                      }
                                    }}
                                    disabled={loading || partNumberOptionsLoading}
                                    className="w-52 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs font-mono"
                                    placeholder={`Ketik part number (${req.from_store.toUpperCase()})`}
                                    title={`Ketik atau pilih part number dari base_${req.from_store}`}
                                  />
                                ) : (
                                  req.part_number
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-200">{req.nama_barang}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={req.from_store === 'mjm' ? 'text-blue-300' : 'text-purple-300'}>
                                  {req.from_store.toUpperCase()}: {getStockByStore(req.id, req.from_store) ?? '-'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={req.to_store === 'mjm' ? 'text-blue-300' : 'text-purple-300'}>
                                  {req.to_store.toUpperCase()}: {getStockByStore(req.id, req.to_store) ?? '-'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-300">{getSenderShelf(req.id)}</td>
                              <td className="px-3 py-2 text-right">
                                {isSendQtyEditable(req) ? (
                                  <input
                                    type="number"
                                    min="1"
                                    value={getSendQtyValue(req)}
                                    onChange={(e) => updateSendQty(req.id, e.target.value)}
                                    className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs text-right"
                                    title="Edit qty kirim"
                                  />
                                ) : (
                                  <span className="text-indigo-300 font-semibold">{req.quantity}</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${getStatusColor(req.status)}`}>
                                  {getStatusLabel(req.status)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-300">{req.requested_by || '-'}</td>
                              <td className="px-3 py-2 text-gray-300">
                                {getFilterDateValue(req, filter)
                                  ? new Date(getFilterDateValue(req, filter) as string).toLocaleString('id-ID')
                                  : '-'}
                              </td>
                              <td className="px-3 py-2 text-gray-300">
                                {filter === 'rejected' ? (req.catatan_reject || '-') : (req.catatan || req.catatan_reject || '-')}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {req.status === 'pending' && req.from_store === currentStore && (
                                    <>
                                      <button
                                        onClick={() => handleApprove(req.id, getSendQtyNumber(req))}
                                        disabled={getSendQtyNumber(req) <= 0}
                                        className={`px-2 py-1 rounded text-[10px] font-medium ${
                                          getSendQtyNumber(req) > 0
                                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                        }`}
                                      >
                                        Setujui
                                      </button>
                                      <button
                                        onClick={() => setRejectModal({ id: req.id, show: true, reason: '' })}
                                        className="px-2 py-1 bg-red-600 text-white rounded text-[10px] font-medium hover:bg-red-700"
                                      >
                                        Tolak
                                      </button>
                                    </>
                                  )}
                                  {req.status === 'approved' && req.from_store === currentStore && (
                                    <button
                                      onClick={() => handleSend(req.id, getSendQtyNumber(req))}
                                      disabled={getSendQtyNumber(req) <= 0}
                                      className={`px-2 py-1 rounded text-[10px] font-medium ${
                                        getSendQtyNumber(req) > 0
                                          ? 'bg-purple-600 text-white hover:bg-purple-700'
                                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                      }`}
                                    >
                                      Kirim
                                    </button>
                                  )}
                                  {req.status === 'sent' && req.to_store === currentStore && (
                                    <>
                                      <button
                                        onClick={() => handleReceive(req.id)}
                                        className="px-2 py-1 bg-green-600 text-white rounded text-[10px] font-medium hover:bg-green-700"
                                      >
                                        Terima
                                      </button>
                                      <button
                                        onClick={() => setRejectModal({ id: req.id, show: true, reason: '' })}
                                        className="px-2 py-1 bg-red-600 text-white rounded text-[10px] font-medium hover:bg-red-700"
                                      >
                                        Tolak
                                      </button>
                                    </>
                                  )}
                                  {req.status === 'pending' && req.to_store === currentStore && (
                                    <button
                                      onClick={() => handleDelete(req.id)}
                                      className="px-2 py-1 bg-gray-600 text-white rounded text-[10px] font-medium hover:bg-gray-700"
                                    >
                                      Hapus
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.show && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-md p-6 border border-gray-700">
            <h3 className="text-lg font-bold text-gray-100 mb-4 flex items-center gap-2">
              <AlertCircle className="text-red-400" size={20} />
              Tolak Request
            </h3>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              rows={3}
              placeholder="Masukkan alasan penolakan..."
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-red-500 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setRejectModal({ id: '', show: false, reason: '' })}
                className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg font-medium hover:bg-gray-600"
              >
                Batal
              </button>
              <button
                onClick={handleReject}
                disabled={loading || !rejectModal.reason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Tolak
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
