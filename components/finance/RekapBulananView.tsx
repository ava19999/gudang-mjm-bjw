import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, BarChart2, PieChart, Download, User, Clock, ChevronDown, ChevronUp, X, Edit3, History, Save, Search, Package, ShoppingBag, Store, Printer } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { useStore } from '../../context/StoreContext';
import html2canvas from 'html2canvas';

// Types for grouped data
interface CustomerGroup {
  customer: string;
  tempo: string;
  totalHarga: number;
  itemCount: number;
}

// Types for barang masuk/keluar record
interface BarangRecord {
  id: number;
  part_number: string;
  name?: string;
  qty_masuk?: number;
  qty_keluar?: number;
  harga_satuan: number;
  harga_total: number;
  customer: string;
  tempo: string;
  created_at: string;
  store?: 'mjm' | 'bjw';
  ecommerce?: string;
  kode_toko?: string;
}

// Utility functions
const formatCurrency = (value: number): string => {
  return `Rp. ${Math.round(value || 0).toLocaleString('id-ID')}`;
};

const formatCompactNumber = (num: number): string => {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'jt';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'rb';
  }
  return num.toString();
};

const formatMonthLabel = (value: string): string => {
  const [year, month] = value.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

const formatRangeLabel = (start: string, end: string): string => {
  if (start === end) return formatMonthLabel(start);
  return `${formatMonthLabel(start)} – ${formatMonthLabel(end)}`;
};

const normalizeTempoLabel = (tempo?: string): string => {
  return (tempo || 'CASH').trim().toUpperCase() || 'CASH';
};

const isCashTempo = (tempo?: string): boolean => {
  return normalizeTempoLabel(tempo) === 'CASH';
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
    if (error) {
      console.error(`Error fetching paged rows from ${table}:`, error);
      return rows;
    }

    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};

const splitIntoChunks = <T,>(items: T[], chunkSize: number): T[][] => {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
};

const updateTempoForIds = async (
  table: string,
  ids: Array<number | string>,
  tempoValue: string
): Promise<void> => {
  const chunks = splitIntoChunks(ids, 500);
  for (const chunk of chunks) {
    const { error } = await supabase
      .from(table)
      .update({ tempo: tempoValue })
      .in('id', chunk);

    if (error) throw error;
  }
};

const normalizeSubToko = (value?: string): 'MJM' | 'LARIS' | 'BJW' | 'PRAKTIS PART' | '-' => {
  const normalized = (value || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!normalized) return '-';
  if (normalized.includes('PRAKTIS')) return 'PRAKTIS PART';
  if (normalized.includes('LARIS')) return 'LARIS';
  if (normalized.includes('BJW')) return 'BJW';
  if (normalized.includes('MJM')) return 'MJM';
  return '-';
};

// TODO: Replace with actual chart components
const DummyChart = ({ title }: { title: string }) => (
  <div className="bg-gray-800 rounded-xl p-6 flex flex-col items-center justify-center min-h-[180px] text-gray-400 border border-gray-700">
    <span className="mb-2"><BarChart2 className="w-8 h-8" /></span>
    <span>{title} (Chart Placeholder)</span>
  </div>
);

interface SummaryCardRow {
  label: string;
  value: number;
}

const HISTORY_ECOMMERCE_OPTIONS = ['OFFLINE', 'TIKTOK', 'SHOPEE', 'RESELLER', 'TOKOPEDIA', 'LAZADA'];
const HISTORY_KODE_TOKO_OPTIONS = ['MJM', 'BJW', 'LARIS', 'PRAKTIS PART'];

const SummaryBreakdownCard = ({
  title,
  value,
  wrapperClassName,
  titleClassName,
  rows = [],
  onActionClick,
}: {
  title: string;
  value: number;
  wrapperClassName: string;
  titleClassName: string;
  rows?: SummaryCardRow[];
  onActionClick?: () => void;
}) => (
  <div className={`${wrapperClassName} rounded-xl p-4`}>
    <div className="flex items-start justify-between gap-3 mb-1">
      <div className={`${titleClassName} text-xs font-medium`}>{title}</div>
      {onActionClick && (
        <button
          type="button"
          onClick={onActionClick}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-gray-900/40 hover:bg-gray-900/60 text-gray-200 border border-white/10 transition-colors"
        >
          <History className="w-3.5 h-3.5" />
          History
        </button>
      )}
    </div>
    <div className="text-lg md:text-xl font-bold text-white break-words">{formatCurrency(value)}</div>
    {rows.length > 0 && (
      <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-xs md:text-sm">
            <span className="text-gray-300">{row.label}</span>
            <span className="font-semibold text-white">{formatCurrency(row.value)}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

export const RekapBulananView: React.FC = () => {
  const { selectedStore } = useStore();
  // Periode bulan (start-end)
  const [bulanMulai, setBulanMulai] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [bulanAkhir, setBulanAkhir] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(false);
  // Data states
  const [barangMasuk, setBarangMasuk] = useState<any[]>([]);
  const [barangKeluar, setBarangKeluar] = useState<any[]>([]);
  const [pettyCashData, setPettyCashData] = useState<any[]>([]);
  
  // Filter states for tempo
  const [filterTempoMasuk, setFilterTempoMasuk] = useState<string>('all');
  const [filterTempoKeluar, setFilterTempoKeluar] = useState<string>('all');
  const [filterEcommerceKeluar, setFilterEcommerceKeluar] = useState<string>('all');
  const [storeFilter, setStoreFilter] = useState<'all' | 'mjm' | 'bjw'>('all');
  const [printTarget, setPrintTarget] = useState<'masuk' | 'keluar' | null>(null);
  
  // Modal states for tempo edit
  const [editTempoModal, setEditTempoModal] = useState(false);
  const [selectedCustomerForEdit, setSelectedCustomerForEdit] = useState<CustomerGroup | null>(null);
  const [newTempo, setNewTempo] = useState('');
  const [editType, setEditType] = useState<'masuk' | 'keluar'>('masuk');
  const [savingTempo, setSavingTempo] = useState(false);
  
  // Modal states for history view
  const [historyModal, setHistoryModal] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<CustomerGroup | null>(null);
  const [historyData, setHistoryData] = useState<BarangRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyType, setHistoryType] = useState<'masuk' | 'keluar'>('masuk');
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [editingHistoryKey, setEditingHistoryKey] = useState<string | null>(null);
  const [savingHistoryRecord, setSavingHistoryRecord] = useState(false);
  const [historyEditForm, setHistoryEditForm] = useState<{
    created_at: string;
    part_number: string;
    name: string;
    customer: string;
    ecommerce: string;
    kode_toko: string;
    qty: string;
    harga_satuan: string;
  }>({
    created_at: '',
    part_number: '',
    name: '',
    customer: '',
    ecommerce: 'OFFLINE',
    kode_toko: 'MJM',
    qty: '',
    harga_satuan: '',
  });
  
  // Toast state
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const rekapRef = useRef<HTMLDivElement>(null);
  
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  // Collapse states
  const [expandedMasuk, setExpandedMasuk] = useState(true);
  const [expandedKeluar, setExpandedKeluar] = useState(true);

  // Helper: normalisasi ecommerce
  const normalizeEcommerce = (ecommerce?: string) => {
    const raw = (ecommerce || 'OFFLINE').trim().toUpperCase();
    if (!raw) return 'OFFLINE';
    if (raw === 'SHOPPE') return 'SHOPEE';
    return raw;
  };

  const getStoreLabel = () => {
    if (storeFilter === 'all') return 'Semua Toko';
    if (storeFilter === 'mjm') return 'MJM';
    return 'BJW';
  };

  // Export / Print helpers
  const handlePrintSection = (target: 'masuk' | 'keluar') => {
    setPrintTarget(target);
    // Pastikan state printTarget ter-render dulu sebelum dialog print dibuka
    setTimeout(() => {
      window.print();
    }, 80);
  };

  const handlePrintPdf = () => {
    handlePrintSection('keluar');
  };

  const handleExportImage = async () => {
    if (!rekapRef.current) return;
    const canvas = await html2canvas(rekapRef.current, {
      backgroundColor: '#111827',
      scale: 1.2,
      useCORS: true,
      logging: false,
    });
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `rekap-bulanan-${bulanMulai}-to-${bulanAkhir}.png`;
    link.click();
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintTarget(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // Helper: hitung rentang tanggal dari bulanMulai/bulanAkhir
  const getRangeDates = () => {
    const [startYear, startMonth] = bulanMulai.split('-').map(Number);
    const [endYear, endMonth] = bulanAkhir.split('-').map(Number);
    const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
    const endDateObj = new Date(endYear, endMonth, 0); // last day of end month
    const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`;
    const startDateTime = `${startDate}T00:00:00`;
    const endDateTime = `${endDateStr}T23:59:59`;
    return {
      startDate,
      endDateStr,
      startDateTime,
      endDateTime,
      startTs: new Date(startDateTime).getTime(),
      endTs: new Date(endDateTime).getTime(),
    };
  };

  // Daftar ecommerce unik (dari data yang sudah diambil)
  const availableEcommerceKeluar = useMemo(() => {
    const set = new Set<string>();
    barangKeluar.forEach(item => set.add(normalizeEcommerce(item.ecommerce)));
    return Array.from(set).sort();
  }, [barangKeluar]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { startDate, endDateStr, startDateTime, endDateTime, startTs, endTs } = getRangeDates();
        if (endTs < startTs) {
          showToast('Periode akhir harus setelah periode awal', 'error');
          setLoading(false);
          return;
        }

        const fetchMasukMJM = storeFilter === 'bjw'
          ? Promise.resolve([])
          : fetchAllRowsPaged<any>(
              'barang_masuk_mjm',
              '*',
              (q) => q.gte('created_at', startDateTime).lte('created_at', endDateTime),
              { orderBy: 'created_at', ascending: true }
            );

        const fetchMasukBJW = storeFilter === 'mjm'
          ? Promise.resolve([])
          : fetchAllRowsPaged<any>(
              'barang_masuk_bjw',
              '*',
              (q) => q.gte('created_at', startDateTime).lte('created_at', endDateTime),
              { orderBy: 'created_at', ascending: true }
            );

        const fetchKeluarMJM = storeFilter === 'bjw'
          ? Promise.resolve([])
          : fetchAllRowsPaged<any>(
              'barang_keluar_mjm',
              '*',
              (q) => q.gte('created_at', startDateTime).lte('created_at', endDateTime),
              { orderBy: 'created_at', ascending: true }
            );

        const fetchKeluarBJW = storeFilter === 'mjm'
          ? Promise.resolve([])
          : fetchAllRowsPaged<any>(
              'barang_keluar_bjw',
              '*',
              (q) => q.gte('created_at', startDateTime).lte('created_at', endDateTime),
              { orderBy: 'created_at', ascending: true }
            );

        // Petty Cash: samakan sumber dengan halaman Petty Cash (selectedStore)
        const pettyStore = selectedStore === 'bjw' ? 'bjw' : 'mjm';
        const pettyTable = pettyStore === 'bjw' ? 'petty_cash_bjw' : 'petty_cash_mjm';
        const fetchPettyRows = fetchAllRowsPaged<any>(
          pettyTable,
          '*',
          (q) => q.gte('tgl', startDate).lte('tgl', endDateStr),
          { orderBy: 'tgl', ascending: true }
        );

        const [masukMJM, masukBJW, keluarMJM, keluarBJW, pettyRows] = await Promise.all([
          fetchMasukMJM,
          fetchMasukBJW,
          fetchKeluarMJM,
          fetchKeluarBJW,
          fetchPettyRows
        ]);

        setBarangMasuk([...(masukMJM).map(r => ({...r, store: 'mjm'})), ...(masukBJW).map(r => ({...r, store: 'bjw'}))]);
        setBarangKeluar([...(keluarMJM).map(r => ({...r, store: 'mjm'})), ...(keluarBJW).map(r => ({...r, store: 'bjw'}))]);
        const pettyCombined = [
          ...(pettyRows).map(r => ({ ...r, store: pettyStore as 'mjm' | 'bjw' })),
        ].sort((a, b) => {
          const aTs = new Date((a as any).tgl || (a as any).created_at || (a as any).tanggal || 0).getTime();
          const bTs = new Date((b as any).tgl || (b as any).created_at || (b as any).tanggal || 0).getTime();
          return bTs - aTs;
        });
        setPettyCashData(pettyCombined);
      } catch (e) {
        console.error('Error fetching rekap data:', e);
      }
      setLoading(false);
    };
    fetchData();
  }, [bulanMulai, bulanAkhir, selectedStore, storeFilter]);

  // Function to load history data for a specific customer/supplier
  const loadHistoryData = async (customer: string, tempo: string, type: 'masuk' | 'keluar') => {
    setLoadingHistory(true);
    try {
      const { startDateTime, endDateTime } = getRangeDates();
      
      const customerUpper = customer.trim().toUpperCase();
      
      if (type === 'masuk') {
        const fetchDataMJM = storeFilter === 'bjw'
          ? Promise.resolve([])
          : fetchAllRowsPaged<any>(
              'barang_masuk_mjm',
              '*',
              (q) =>
                q
                  .ilike('customer', customerUpper)
                  .gte('created_at', startDateTime)
                  .lte('created_at', endDateTime),
              { orderBy: 'created_at', ascending: false }
            );

        const fetchDataBJW = storeFilter === 'mjm'
          ? Promise.resolve([])
          : fetchAllRowsPaged<any>(
              'barang_masuk_bjw',
              '*',
              (q) =>
                q
                  .ilike('customer', customerUpper)
                  .gte('created_at', startDateTime)
                  .lte('created_at', endDateTime),
              { orderBy: 'created_at', ascending: false }
            );

        const [dataMJM, dataBJW] = await Promise.all([fetchDataMJM, fetchDataBJW]);
          
        const combined = [
          ...(dataMJM || []).map(r => ({ ...r, store: 'mjm' as const })),
          ...(dataBJW || []).map(r => ({ ...r, store: 'bjw' as const }))
        ].filter(r => {
          const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
          return itemTempo === tempo || (tempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
        });
        
        setHistoryData(combined);
      } else {
        const fetchDataMJM = storeFilter === 'bjw'
          ? Promise.resolve([])
          : fetchAllRowsPaged<any>(
              'barang_keluar_mjm',
              '*',
              (q) =>
                q
                  .ilike('customer', customerUpper)
                  .gte('created_at', startDateTime)
                  .lte('created_at', endDateTime),
              { orderBy: 'created_at', ascending: false }
            );

        const fetchDataBJW = storeFilter === 'mjm'
          ? Promise.resolve([])
          : fetchAllRowsPaged<any>(
              'barang_keluar_bjw',
              '*',
              (q) =>
                q
                  .ilike('customer', customerUpper)
                  .gte('created_at', startDateTime)
                  .lte('created_at', endDateTime),
              { orderBy: 'created_at', ascending: false }
            );

        const [dataMJM, dataBJW] = await Promise.all([fetchDataMJM, fetchDataBJW]);
          
        const combined = [
          ...(dataMJM || []).map(r => ({ ...r, store: 'mjm' as const })),
          ...(dataBJW || []).map(r => ({ ...r, store: 'bjw' as const }))
        ].filter(r => {
          const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
          return itemTempo === tempo || (tempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
        });
        
        const filtered = filterEcommerceKeluar === 'all'
          ? combined
          : combined.filter(r => normalizeEcommerce((r as any).ecommerce) === filterEcommerceKeluar);

        setHistoryData(filtered);
      }
    } catch (e) {
      console.error('Error loading history:', e);
      setHistoryData([]);
    }
    setLoadingHistory(false);
  };
  
  // Function to update tempo for all records of a customer
  const handleUpdateTempo = async () => {
    if (!selectedCustomerForEdit || !newTempo) return;
    
    setSavingTempo(true);
    try {
      const customerUpper = selectedCustomerForEdit.customer.trim().toUpperCase();
      const oldTempo = selectedCustomerForEdit.tempo;
      const { startDateTime, endDateTime } = getRangeDates();
      
      if (editType === 'masuk') {
        // Get IDs to update from MJM
        if (storeFilter !== 'bjw') {
          const mjmRecords = await fetchAllRowsPaged<{ id: number; tempo: string | null }>(
            'barang_masuk_mjm',
            'id, tempo',
            (q) =>
              q
                .ilike('customer', customerUpper)
                .gte('created_at', startDateTime)
                .lte('created_at', endDateTime),
            { orderBy: 'id', ascending: true }
          );
            
          const mjmIdsToUpdate = (mjmRecords || [])
            .filter(r => {
              const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
              return itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
            })
            .map(r => r.id);
            
          if (mjmIdsToUpdate.length > 0) {
            await updateTempoForIds('barang_masuk_mjm', mjmIdsToUpdate, newTempo);
          }
        }
        
        if (storeFilter !== 'mjm') {
          const bjwRecords = await fetchAllRowsPaged<{ id: number; tempo: string | null }>(
            'barang_masuk_bjw',
            'id, tempo',
            (q) =>
              q
                .ilike('customer', customerUpper)
                .gte('created_at', startDateTime)
                .lte('created_at', endDateTime),
            { orderBy: 'id', ascending: true }
          );
            
          const bjwIdsToUpdate = (bjwRecords || [])
            .filter(r => {
              const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
              return itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
            })
            .map(r => r.id);
            
          if (bjwIdsToUpdate.length > 0) {
            await updateTempoForIds('barang_masuk_bjw', bjwIdsToUpdate, newTempo);
          }
        }
        
        // Update local state
        setBarangMasuk(prev => prev.map(r => {
          const itemCustomer = (r.customer || '').trim().toUpperCase();
          const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
          if (itemCustomer === customerUpper && 
              (itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH')))) {
            return { ...r, tempo: newTempo };
          }
          return r;
        }));
      } else {
        // Barang Keluar
        if (storeFilter !== 'bjw') {
          const mjmRecords = await fetchAllRowsPaged<{ id: number; tempo: string | null }>(
            'barang_keluar_mjm',
            'id, tempo',
            (q) =>
              q
                .ilike('customer', customerUpper)
                .gte('created_at', startDateTime)
                .lte('created_at', endDateTime),
            { orderBy: 'id', ascending: true }
          );
            
          const mjmIdsToUpdate = (mjmRecords || [])
            .filter(r => {
              const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
              return itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
            })
            .map(r => r.id);
            
          if (mjmIdsToUpdate.length > 0) {
            await updateTempoForIds('barang_keluar_mjm', mjmIdsToUpdate, newTempo);
          }
        }
        
        if (storeFilter !== 'mjm') {
          const bjwRecords = await fetchAllRowsPaged<{ id: number; tempo: string | null }>(
            'barang_keluar_bjw',
            'id, tempo',
            (q) =>
              q
                .ilike('customer', customerUpper)
                .gte('created_at', startDateTime)
                .lte('created_at', endDateTime),
            { orderBy: 'id', ascending: true }
          );
            
          const bjwIdsToUpdate = (bjwRecords || [])
            .filter(r => {
              const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
              return itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH'));
            })
            .map(r => r.id);
            
          if (bjwIdsToUpdate.length > 0) {
            await updateTempoForIds('barang_keluar_bjw', bjwIdsToUpdate, newTempo);
          }
        }
        
        // Update local state
        setBarangKeluar(prev => prev.map(r => {
          const itemCustomer = (r.customer || '').trim().toUpperCase();
          const itemTempo = (r.tempo || 'CASH').trim().toUpperCase();
          if (itemCustomer === customerUpper && 
              (itemTempo === oldTempo || (oldTempo === 'CASH' && (itemTempo === '' || itemTempo === 'CASH')))) {
            return { ...r, tempo: newTempo };
          }
          return r;
        }));
      }
      
      showToast('Tempo berhasil diupdate!', 'success');
      setEditTempoModal(false);
      setSelectedCustomerForEdit(null);
      setNewTempo('');
    } catch (e) {
      console.error('Error updating tempo:', e);
      showToast('Gagal mengupdate tempo', 'error');
    }
    setSavingTempo(false);
  };
  
  // Open edit tempo modal
  const openEditTempoModal = (customer: CustomerGroup, type: 'masuk' | 'keluar', e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCustomerForEdit(customer);
    setNewTempo(customer.tempo || 'CASH');
    setEditType(type);
    setEditTempoModal(true);
  };
  
  // Open history modal
  const openHistoryModal = (customer: CustomerGroup, type: 'masuk' | 'keluar') => {
    setSelectedCustomerForHistory(customer);
    setHistoryType(type);
    setHistorySearchTerm('');
    setEditingHistoryKey(null);
    setSavingHistoryRecord(false);
    setHistoryModal(true);
    loadHistoryData(customer.customer, customer.tempo, type);
  };

  const openSummaryHistoryModal = (title: string, records: BarangRecord[], subtitle: string) => {
    setSelectedCustomerForHistory({
      customer: title,
      tempo: subtitle,
      totalHarga: records.reduce((sum, record) => sum + (record.harga_total || 0), 0),
      itemCount: records.length,
    });
    setHistoryType('keluar');
    setLoadingHistory(false);
    setHistorySearchTerm('');
    setEditingHistoryKey(null);
    setSavingHistoryRecord(false);
    setHistoryData(
      [...records].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    );
    setHistoryModal(true);
  };

  const closeHistoryModal = () => {
    setHistoryModal(false);
    setSelectedCustomerForHistory(null);
    setHistoryData([]);
    setHistorySearchTerm('');
    setSavingHistoryRecord(false);
    cancelEditHistoryRecord();
  };

  const startEditHistoryRecord = (record: BarangRecord) => {
    if (historyType !== 'keluar') return;

    const date = new Date(record.created_at);
    const isoLocal = Number.isNaN(date.getTime())
      ? ''
      : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    setEditingHistoryKey(`${record.store || '-'}-${record.id}`);
    setHistoryEditForm({
      created_at: isoLocal,
      part_number: record.part_number || '',
      name: record.name || '',
      customer: record.customer || '',
      ecommerce: normalizeEcommerce(record.ecommerce),
      kode_toko: normalizeSubToko(record.kode_toko) === '-' ? 'MJM' : normalizeSubToko(record.kode_toko),
      qty: String(record.qty_keluar || 0),
      harga_satuan: String(record.harga_satuan || 0),
    });
  };

  const cancelEditHistoryRecord = () => {
    setEditingHistoryKey(null);
    setHistoryEditForm({
      created_at: '',
      part_number: '',
      name: '',
      customer: '',
      ecommerce: 'OFFLINE',
      kode_toko: 'MJM',
      qty: '',
      harga_satuan: '',
    });
  };

  const saveEditHistoryRecord = async (record: BarangRecord) => {
    if (historyType !== 'keluar' || savingHistoryRecord) return;

    if (record.store !== 'mjm' && record.store !== 'bjw') {
      showToast('Toko sumber riwayat tidak valid', 'error');
      return;
    }

    const targetTable = record.store === 'mjm' ? 'barang_keluar_mjm' : 'barang_keluar_bjw';
    const qty = parseInt(historyEditForm.qty, 10);
    const hargaSatuan = parseFloat(historyEditForm.harga_satuan);
    const normalizedKodeToko = normalizeSubToko(historyEditForm.kode_toko);
    const partNumber = historyEditForm.part_number.trim().toUpperCase();
    const customer = historyEditForm.customer.trim();
    const itemName = historyEditForm.name.trim();

    if (!historyEditForm.created_at || Number.isNaN(new Date(historyEditForm.created_at).getTime())) {
      showToast('Tanggal tidak valid', 'error');
      return;
    }
    if (!partNumber) {
      showToast('Part number wajib diisi', 'error');
      return;
    }
    if (!customer) {
      showToast('Customer wajib diisi', 'error');
      return;
    }
    if (!itemName) {
      showToast('Nama barang wajib diisi', 'error');
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      showToast('Qty harus lebih dari 0', 'error');
      return;
    }
    if (!Number.isFinite(hargaSatuan) || hargaSatuan < 0) {
      showToast('Harga satuan tidak valid', 'error');
      return;
    }
    if (normalizedKodeToko === '-') {
      showToast('Kode toko tidak valid', 'error');
      return;
    }

    setSavingHistoryRecord(true);
    try {
      const nextCreatedAt = new Date(historyEditForm.created_at).toISOString();
      const nextHargaTotal = qty * hargaSatuan;
      const patch = {
        created_at: nextCreatedAt,
        part_number: partNumber,
        name: itemName,
        customer,
        ecommerce: normalizeEcommerce(historyEditForm.ecommerce),
        kode_toko: normalizedKodeToko,
        qty_keluar: qty,
        harga_satuan: hargaSatuan,
        harga_total: nextHargaTotal,
      };

      const { error } = await supabase
        .from(targetTable)
        .update(patch)
        .eq('id', record.id);

      if (error) {
        console.error('Error updating history record:', error);
        showToast(`Gagal update riwayat: ${error.message}`, 'error');
        return;
      }

      setHistoryData((prev) =>
        prev.map((item) =>
          item.id === record.id && item.store === record.store
            ? {
                ...item,
                ...patch,
                qty_keluar: qty,
                harga_satuan: hargaSatuan,
                harga_total: nextHargaTotal,
              }
            : item
        )
      );

      setBarangKeluar((prev) =>
        prev.map((item) =>
          item.id === record.id && item.store === record.store
            ? {
                ...item,
                ...patch,
                qty_keluar: qty,
                harga_satuan: hargaSatuan,
                harga_total: nextHargaTotal,
              }
            : item
        )
      );

      showToast('Riwayat penjualan berhasil diupdate', 'success');
      cancelEditHistoryRecord();
    } finally {
      setSavingHistoryRecord(false);
    }
  };

  // Helper function to check if record is RETUR (check both customer and tempo)
  const isRetur = (record: any) => {
    const customer = (record.customer || '').trim().toUpperCase();
    const tempo = (record.tempo || '').trim().toUpperCase();
    return customer.includes('RETUR') || tempo.includes('RETUR');
  };
  
  // Helper function to check if record should be excluded (RETUR or 0 total)
  const shouldExclude = (record: any) => {
    return isRetur(record) || (record.harga_total || 0) === 0;
  };

  const pettyCashOnData = useMemo(
    () =>
      pettyCashData.filter((entry) =>
        String((entry as any).kegunaan || '').toUpperCase().includes('PENGELUARAN LAIN')
      ),
    [pettyCashData]
  );

  // Statistik dari data (excluding RETUR and 0 total)
  const stats = useMemo(() => {
    // Filter out RETUR records and 0 total first
    const filteredMasuk = barangMasuk.filter(b => !shouldExclude(b));
    const filteredKeluar = barangKeluar.filter(b => !shouldExclude(b));
    
    // Barang Masuk - categorize by tempo
    const masukCash = filteredMasuk.filter(b => {
      const tempo = (b.tempo || '').toUpperCase();
      return tempo.includes('CASH') || tempo === '';
    }).reduce((a, b) => a + (b.harga_total || 0), 0);
    
    const masuk3Bln = filteredMasuk.filter(b => (b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const masuk2Bln = filteredMasuk.filter(b => (b.tempo || '').toUpperCase().includes('2') && !(b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const masuk1Bln = filteredMasuk.filter(b => (b.tempo || '').toUpperCase().includes('1') && !(b.tempo || '').toUpperCase().includes('2') && !(b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const masukTotal = filteredMasuk.reduce((a, b) => a + (b.harga_total || 0), 0);
    
    // Barang Keluar - categorize by tempo (using filtered data)
    const keluarCash = filteredKeluar.filter(b => {
      const tempo = (b.tempo || '').toUpperCase();
      return tempo.includes('CASH') || tempo === '';
    }).reduce((a, b) => a + (b.harga_total || 0), 0);
    
    const keluar3Bln = filteredKeluar.filter(b => (b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const keluar2Bln = filteredKeluar.filter(b => (b.tempo || '').toUpperCase().includes('2') && !(b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const keluar1Bln = filteredKeluar.filter(b => (b.tempo || '').toUpperCase().includes('1') && !(b.tempo || '').toUpperCase().includes('2') && !(b.tempo || '').toUpperCase().includes('3')).reduce((a, b) => a + (b.harga_total || 0), 0);
    const keluarTotal = filteredKeluar.reduce((a, b) => a + (b.harga_total || 0), 0);
    
    // Petty Cash: khusus "PENGELUARAN LAIN LAIN"
    // Ambil total langsung dari kolom "Jumlah" pada tabel petty cash yang ditampilkan (data ON)
    const pettyCash = pettyCashOnData.reduce(
      (sum, entry) => sum + Number((entry as any).saldokeluarmasuk || (entry as any).jumlah || 0),
      0
    );
    return { masukCash, masuk3Bln, masuk2Bln, masuk1Bln, masukTotal, keluarCash, keluar3Bln, keluar2Bln, keluar1Bln, keluarTotal, pettyCash };
  }, [barangMasuk, barangKeluar, pettyCashOnData]);

  const validKeluarRecords = useMemo(
    () => barangKeluar.filter((record) => !shouldExclude(record)),
    [barangKeluar]
  );

  const keluarBreakdown = useMemo(() => {
    const summary = {
      offline: { total: 0, cash: 0, tempo: 0, tempo1Bln: 0, tempo2Bln: 0, tempo3Bln: 0 },
      tiktok: { total: 0, mjm: 0, laris: 0 },
      shopee: { total: 0, mjm: 0, laris: 0, bjw: 0, praktisPart: 0 },
      reseller: { total: 0 },
    };

    barangKeluar.forEach((record) => {
      if (shouldExclude(record)) return;

      const amount = Number(record.harga_total || 0);
      const ecommerce = normalizeEcommerce(record.ecommerce);
      const tempo = normalizeTempoLabel(record.tempo);
      const subToko = normalizeSubToko((record as any).kode_toko);

      if (ecommerce === 'OFFLINE') {
        summary.offline.total += amount;
        if (isCashTempo(tempo)) {
          summary.offline.cash += amount;
        } else {
          summary.offline.tempo += amount;
          if (tempo.includes('3')) summary.offline.tempo3Bln += amount;
          else if (tempo.includes('2')) summary.offline.tempo2Bln += amount;
          else if (tempo.includes('1')) summary.offline.tempo1Bln += amount;
        }
        return;
      }

      if (ecommerce === 'TIKTOK') {
        summary.tiktok.total += amount;
        if (subToko === 'MJM') summary.tiktok.mjm += amount;
        if (subToko === 'LARIS') summary.tiktok.laris += amount;
        return;
      }

      if (ecommerce === 'SHOPEE') {
        summary.shopee.total += amount;
        if (subToko === 'MJM') summary.shopee.mjm += amount;
        if (subToko === 'LARIS') summary.shopee.laris += amount;
        if (subToko === 'BJW') summary.shopee.bjw += amount;
        if (subToko === 'PRAKTIS PART') summary.shopee.praktisPart += amount;
        return;
      }

      if (ecommerce === 'RESELLER') {
        summary.reseller.total += amount;
      }
    });

    return summary;
  }, [barangKeluar]);

  const keluarHistoryRecords = useMemo(() => {
    const byEcommerce = (target: string) =>
      validKeluarRecords.filter((record) => normalizeEcommerce(record.ecommerce) === target);

    return {
      all: validKeluarRecords,
      offline: byEcommerce('OFFLINE'),
      tiktok: byEcommerce('TIKTOK'),
      shopee: byEcommerce('SHOPEE'),
      reseller: byEcommerce('RESELLER'),
    };
  }, [validKeluarRecords]);

  const filteredHistoryData = useMemo(() => {
    const search = historySearchTerm.trim().toLowerCase();
    if (!search) return historyData;

    return historyData.filter((record) => {
      const dateLabel = new Date(record.created_at).toLocaleString('id-ID').toLowerCase();
      const qtyValue = historyType === 'masuk' ? record.qty_masuk : record.qty_keluar;
      return [
        record.part_number,
        record.name,
        record.customer,
        record.ecommerce,
        record.kode_toko,
        record.store,
        dateLabel,
        qtyValue,
        record.harga_satuan,
        record.harga_total,
      ]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(search));
    });
  }, [historyData, historySearchTerm, historyType]);

  const filteredHistoryTotals = useMemo(
    () => ({
      qty: filteredHistoryData.reduce(
        (sum, record) => sum + (historyType === 'masuk' ? (record.qty_masuk || 0) : (record.qty_keluar || 0)),
        0
      ),
      amount: filteredHistoryData.reduce((sum, record) => sum + (record.harga_total || 0), 0),
    }),
    [filteredHistoryData, historyType]
  );
  
  // Group Barang Masuk by Customer and Tempo (excluding RETUR and 0 total)
  const groupedBarangMasuk = useMemo(() => {
    const customerMap = new Map<string, CustomerGroup>();
    
    barangMasuk.forEach(record => {
      const customer = (record.customer || 'UNKNOWN').trim().toUpperCase();
      const tempo = (record.tempo || 'CASH').trim().toUpperCase();
      
      // Skip RETUR records (check both customer and tempo) and 0 total
      if (customer.includes('RETUR') || tempo.includes('RETUR')) return;
      if ((record.harga_total || 0) === 0) return;
      
      const key = `${customer}_${tempo}`;
      
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customer,
          tempo,
          totalHarga: 0,
          itemCount: 0,
        });
      }
      
      const existing = customerMap.get(key)!;
      existing.totalHarga += record.harga_total || 0;
      existing.itemCount += 1;
    });
    
    // Apply tempo filter
    let result = Array.from(customerMap.values());
    if (filterTempoMasuk !== 'all') {
      result = result.filter(c => {
        if (filterTempoMasuk === 'CASH') return c.tempo.includes('CASH') || c.tempo === '';
        if (filterTempoMasuk === '3 BLN') return c.tempo.includes('3');
        if (filterTempoMasuk === '2 BLN') return c.tempo.includes('2') && !c.tempo.includes('3');
        if (filterTempoMasuk === '1 BLN') return c.tempo.includes('1') && !c.tempo.includes('2') && !c.tempo.includes('3');
        return true;
      });
    }
    
    return result.sort((a, b) => b.totalHarga - a.totalHarga);
  }, [barangMasuk, filterTempoMasuk]);
  
  // Group Barang Keluar by Customer and Tempo (excluding RETUR and 0 total)
  const groupedBarangKeluar = useMemo(() => {
    const customerMap = new Map<string, CustomerGroup>();
    
    barangKeluar.forEach(record => {
      const customer = (record.customer || 'UNKNOWN').trim().toUpperCase();
      const tempo = (record.tempo || 'CASH').trim().toUpperCase();
      const ecommerce = normalizeEcommerce(record.ecommerce);
      
      // Skip RETUR records (check both customer and tempo) and 0 total
      if (customer.includes('RETUR') || tempo.includes('RETUR')) return;
      if ((record.harga_total || 0) === 0) return;
      // Apply ecommerce filter before grouping
      if (filterEcommerceKeluar !== 'all' && ecommerce !== filterEcommerceKeluar) return;
      
      const key = `${customer}_${tempo}`;
      
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customer,
          tempo,
          totalHarga: 0,
          itemCount: 0,
        });
      }
      
      const existing = customerMap.get(key)!;
      existing.totalHarga += record.harga_total || 0;
      existing.itemCount += 1;
    });
    
    // Apply tempo filter
    let result = Array.from(customerMap.values());
    if (filterTempoKeluar !== 'all') {
      result = result.filter(c => {
        if (filterTempoKeluar === 'CASH') return c.tempo.includes('CASH') || c.tempo === '';
        if (filterTempoKeluar === '3 BLN') return c.tempo.includes('3');
        if (filterTempoKeluar === '2 BLN') return c.tempo.includes('2') && !c.tempo.includes('3');
        if (filterTempoKeluar === '1 BLN') return c.tempo.includes('1') && !c.tempo.includes('2') && !c.tempo.includes('3');
        return true;
      });
    }
    
    return result.sort((a, b) => b.totalHarga - a.totalHarga);
  }, [barangKeluar, filterTempoKeluar, filterEcommerceKeluar]);
  
  // Totals for filtered data
  const totalMasukFiltered = useMemo(() => groupedBarangMasuk.reduce((sum, c) => sum + c.totalHarga, 0), [groupedBarangMasuk]);
  const totalKeluarFiltered = useMemo(() => groupedBarangKeluar.reduce((sum, c) => sum + c.totalHarga, 0), [groupedBarangKeluar]);

  return (
    <div
      className={`min-h-screen bg-gray-900 text-white p-4 md:p-6 print-container ${
        printTarget === 'masuk' ? 'print-target-masuk' : printTarget === 'keluar' ? 'print-target-keluar' : ''
      }`}
      ref={rekapRef}
    >
      <div className="screen-only">
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2 bg-blue-900/30 rounded-xl">
          <BarChart2 className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Rekap Bulanan</h1>
          <p className="text-gray-400 text-sm">Ringkasan keuangan & barang masuk/keluar seluruh toko</p>
          <p className="text-gray-500 text-xs mt-1">Periode: {formatRangeLabel(bulanMulai, bulanAkhir)}</p>
        </div>
      </div>

      {/* Filter Periode Bulan */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-400" />
          <input
            type="month"
            value={bulanMulai}
            onChange={e => setBulanMulai(e.target.value)}
            max={bulanAkhir}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:border-blue-500 transition-colors"
          />
          <span className="text-gray-500 text-sm">s.d</span>
          <input
            type="month"
            value={bulanAkhir}
            onChange={e => setBulanAkhir(e.target.value)}
            min={bulanMulai}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-gray-400" />
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value as 'all' | 'mjm' | 'bjw')}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:border-yellow-500 transition-colors"
            >
              <option value="all">Semua Toko</option>
              <option value="mjm">MJM</option>
              <option value="bjw">BJW</option>
            </select>
          </div>
          <button
            onClick={handlePrintPdf}
            className="no-print flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
            title="Print PDF khusus tabel Barang Keluar"
          >
            <Printer className="w-4 h-4" /> Print Barang Keluar
          </button>
          <button
            onClick={handleExportImage}
            className="no-print flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
            title="Simpan sebagai gambar"
          >
            <Download className="w-4 h-4" /> Image
          </button>
        </div>
      </div>

      {/* Statistik Ringkas - Barang Masuk */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          Barang Masuk (Pembelian)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gradient-to-br from-green-900/40 to-green-800/20 border border-green-800/30 rounded-xl p-4">
            <div className="text-green-400 text-xs font-medium mb-1">Total Masuk</div>
            <div className="text-lg md:text-xl font-bold text-white break-words">{formatCurrency(stats.masukTotal)}</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border border-emerald-800/30 rounded-xl p-4">
            <div className="text-emerald-400 text-xs font-medium mb-1">Cash</div>
            <div className="text-lg md:text-xl font-bold text-white break-words">{formatCurrency(stats.masukCash)}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-800/30 rounded-xl p-4">
            <div className="text-purple-400 text-xs font-medium mb-1">3 BLN</div>
            <div className="text-lg md:text-xl font-bold text-white break-words">{formatCurrency(stats.masuk3Bln)}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-800/30 rounded-xl p-4">
            <div className="text-blue-400 text-xs font-medium mb-1">2 BLN</div>
            <div className="text-lg md:text-xl font-bold text-white break-words">{formatCurrency(stats.masuk2Bln)}</div>
          </div>
          <div className="bg-gradient-to-br from-teal-900/40 to-teal-800/20 border border-teal-800/30 rounded-xl p-4">
            <div className="text-teal-400 text-xs font-medium mb-1">1 BLN</div>
            <div className="text-lg md:text-xl font-bold text-white break-words">{formatCurrency(stats.masuk1Bln)}</div>
          </div>
        </div>
      </div>
      
      {/* Statistik Ringkas - Barang Keluar */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          Barang Keluar (Penjualan)
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SummaryBreakdownCard
            title="Total Keluar"
            value={stats.keluarTotal}
            wrapperClassName="bg-gradient-to-br from-red-900/40 to-red-800/20 border border-red-800/30"
            titleClassName="text-red-400"
            onActionClick={() => openSummaryHistoryModal('Total Keluar', keluarHistoryRecords.all, 'Semua Ecommerce')}
            rows={[
              { label: 'Total Offline', value: keluarBreakdown.offline.total },
              { label: 'Total TikTok', value: keluarBreakdown.tiktok.total },
              { label: 'Total Shopee', value: keluarBreakdown.shopee.total },
              { label: 'Total Reseller', value: keluarBreakdown.reseller.total },
            ]}
          />
          <SummaryBreakdownCard
            title="Offline"
            value={keluarBreakdown.offline.total}
            wrapperClassName="bg-gradient-to-br from-orange-900/40 to-orange-800/20 border border-orange-800/30"
            titleClassName="text-orange-400"
            onActionClick={() => openSummaryHistoryModal('Offline', keluarHistoryRecords.offline, 'Semua Offline')}
            rows={[
              { label: 'CASH', value: keluarBreakdown.offline.cash },
              { label: 'TEMPO', value: keluarBreakdown.offline.tempo },
              { label: '3 BLN', value: keluarBreakdown.offline.tempo3Bln },
              { label: '2 BLN', value: keluarBreakdown.offline.tempo2Bln },
              { label: '1 BLN', value: keluarBreakdown.offline.tempo1Bln },
            ]}
          />
          <SummaryBreakdownCard
            title="TikTok"
            value={keluarBreakdown.tiktok.total}
            wrapperClassName="bg-gradient-to-br from-pink-900/40 to-pink-800/20 border border-pink-800/30"
            titleClassName="text-pink-400"
            onActionClick={() => openSummaryHistoryModal('TikTok', keluarHistoryRecords.tiktok, 'Kode Toko MJM + LARIS')}
            rows={[
              { label: 'Kode Toko MJM', value: keluarBreakdown.tiktok.mjm },
              { label: 'Kode Toko LARIS', value: keluarBreakdown.tiktok.laris },
            ]}
          />
          <SummaryBreakdownCard
            title="Shopee"
            value={keluarBreakdown.shopee.total}
            wrapperClassName="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-800/30"
            titleClassName="text-blue-400"
            onActionClick={() => openSummaryHistoryModal('Shopee', keluarHistoryRecords.shopee, 'MJM, LARIS, BJW, PRAKTIS PART')}
            rows={[
              { label: 'Kode Toko MJM', value: keluarBreakdown.shopee.mjm },
              { label: 'Kode Toko LARIS', value: keluarBreakdown.shopee.laris },
              { label: 'Kode Toko BJW', value: keluarBreakdown.shopee.bjw },
              { label: 'Kode Toko PRAKTIS PART', value: keluarBreakdown.shopee.praktisPart },
            ]}
          />
          <SummaryBreakdownCard
            title="Reseller"
            value={keluarBreakdown.reseller.total}
            wrapperClassName="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border border-emerald-800/30 lg:col-span-2"
            titleClassName="text-emerald-400"
            onActionClick={() => openSummaryHistoryModal('Reseller', keluarHistoryRecords.reseller, 'Semua Reseller')}
          />
        </div>
      </div>
      
      {/* Petty Cash Summary */}
      <div className="grid grid-cols-1 gap-4 mb-6">
        <div className="bg-gradient-to-br from-yellow-900/40 to-yellow-800/20 border border-yellow-800/30 rounded-xl p-4">
          <div className="text-yellow-400 text-xs font-medium mb-1">Penggunaan Petty Cash</div>
          <div className="text-xl md:text-2xl font-bold text-white">{formatCurrency(stats.pettyCash)}</div>
        </div>
      </div>

      {/* Diagram/Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <DummyChart title="Proporsi Cash vs Tempo" />
        <DummyChart title="Barang Masuk/Keluar per Toko" />
      </div>
      <div className="mb-6">
        <DummyChart title="Trend Harian Bulan Ini" />
      </div>

      {/* Tabel Detail - Grouped by Customer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Barang Masuk Table */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Header with filter */}
          <div className="p-4 border-b border-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setExpandedMasuk(!expandedMasuk)}
                className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
              >
                {expandedMasuk ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </button>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                Barang Masuk
              </h2>
              <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded-lg">{groupedBarangMasuk.length} supplier</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <select
                value={filterTempoMasuk}
                onChange={(e) => setFilterTempoMasuk(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-green-500 transition-colors"
              >
                <option value="all">Semua Tempo</option>
                <option value="CASH">Cash</option>
                <option value="3 BLN">3 Bulan</option>
                <option value="2 BLN">2 Bulan</option>
                <option value="1 BLN">1 Bulan</option>
              </select>
              <button
                onClick={() => handlePrintSection('masuk')}
                className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                title="Print tabel Barang Masuk"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            </div>
          </div>
          
          {expandedMasuk && (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/50 sticky top-0">
                  <tr className="text-gray-400">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Customer/Supplier</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Tempo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Total Harga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {groupedBarangMasuk.length === 0 ? (
                    <tr><td colSpan={3} className="text-center text-gray-500 py-8">Data belum tersedia</td></tr>
                  ) : (
                    groupedBarangMasuk.map((item, i) => (
                      <tr 
                        key={`masuk-${item.customer}-${item.tempo}`} 
                        className="hover:bg-gray-700/50 transition-colors cursor-pointer group"
                        onClick={() => openHistoryModal(item, 'masuk')}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-green-900/30 flex items-center justify-center">
                              <User className="w-4 h-4 text-green-400" />
                            </div>
                            <span className="font-medium text-white">{item.customer}</span>
                            <History className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => openEditTempoModal(item, 'masuk', e)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium hover:ring-2 hover:ring-white/30 transition-all inline-flex items-center gap-1 ${
                              item.tempo.includes('CASH') || item.tempo === '' ? 'bg-emerald-900/40 text-emerald-300' :
                              item.tempo.includes('3') ? 'bg-purple-900/40 text-purple-300' :
                              item.tempo.includes('2') ? 'bg-blue-900/40 text-blue-300' :
                              item.tempo.includes('1') ? 'bg-teal-900/40 text-teal-300' :
                              'bg-gray-700 text-gray-300'
                            }`}
                            title="Klik untuk edit tempo"
                          >
                            {item.tempo || 'CASH'}
                            <Edit3 className="w-3 h-3 opacity-60" />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-white">
                          {formatCurrency(item.totalHarga)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {groupedBarangMasuk.length > 0 && (
                  <tfoot className="bg-gray-900/70 sticky bottom-0">
                    <tr className="font-semibold">
                      <td colSpan={2} className="px-4 py-3 text-white">TOTAL</td>
                      <td className="px-4 py-3 text-right font-mono text-green-400 text-base">
                        {formatCurrency(totalMasukFiltered)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
        
        {/* Barang Keluar Table */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Header with filter */}
          <div className="p-4 border-b border-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setExpandedKeluar(!expandedKeluar)}
                className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
              >
                {expandedKeluar ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </button>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                Barang Keluar
              </h2>
              <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded-lg">{groupedBarangKeluar.length} customer</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <select
                  value={filterTempoKeluar}
                  onChange={(e) => setFilterTempoKeluar(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-red-500 transition-colors"
                >
                  <option value="all">Semua Tempo</option>
                  <option value="CASH">Cash</option>
                  <option value="3 BLN">3 Bulan</option>
                  <option value="2 BLN">2 Bulan</option>
                  <option value="1 BLN">1 Bulan</option>
                </select>
                <button
                  onClick={() => handlePrintSection('keluar')}
                  className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                  title="Print tabel Barang Keluar"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
              </div>
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-gray-400" />
                <select
                  value={filterEcommerceKeluar}
                  onChange={(e) => setFilterEcommerceKeluar(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-purple-500 transition-colors"
                >
                  <option value="all">Semua Ecommerce</option>
                  {availableEcommerceKeluar.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {expandedKeluar && (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/50 sticky top-0">
                  <tr className="text-gray-400">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Tempo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Total Harga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {groupedBarangKeluar.length === 0 ? (
                    <tr><td colSpan={3} className="text-center text-gray-500 py-8">Data belum tersedia</td></tr>
                  ) : (
                    groupedBarangKeluar.map((item, i) => (
                      <tr 
                        key={`keluar-${item.customer}-${item.tempo}`} 
                        className="hover:bg-gray-700/50 transition-colors cursor-pointer group"
                        onClick={() => openHistoryModal(item, 'keluar')}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-red-900/30 flex items-center justify-center">
                              <User className="w-4 h-4 text-red-400" />
                            </div>
                            <span className="font-medium text-white">{item.customer}</span>
                            <History className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => openEditTempoModal(item, 'keluar', e)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium hover:ring-2 hover:ring-white/30 transition-all inline-flex items-center gap-1 ${
                              item.tempo.includes('CASH') || item.tempo === '' ? 'bg-orange-900/40 text-orange-300' :
                              item.tempo.includes('3') ? 'bg-purple-900/40 text-purple-300' :
                              item.tempo.includes('2') ? 'bg-blue-900/40 text-blue-300' :
                              item.tempo.includes('1') ? 'bg-pink-900/40 text-pink-300' :
                              'bg-gray-700 text-gray-300'
                            }`}
                            title="Klik untuk edit tempo"
                          >
                            {item.tempo || 'CASH'}
                            <Edit3 className="w-3 h-3 opacity-60" />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-white">
                          {formatCurrency(item.totalHarga)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {groupedBarangKeluar.length > 0 && (
                  <tfoot className="bg-gray-900/70 sticky bottom-0">
                    <tr className="font-semibold">
                      <td colSpan={2} className="px-4 py-3 text-white">TOTAL</td>
                      <td className="px-4 py-3 text-right font-mono text-red-400 text-base">
                        {formatCurrency(totalKeluarFiltered)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 overflow-x-auto mb-6">
        <h2 className="text-lg font-bold mb-2 text-white">Petty Cash</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400">
              <th>Tanggal</th>
              <th>Toko</th>
              <th>Akun</th>
              <th>Tipe</th>
              <th>Keterangan</th>
              <th>Kegunaan</th>
              <th>Jumlah</th>
              <th>Saldo Akhir</th>
            </tr>
          </thead>
          <tbody>
              {pettyCashOnData.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-500">Belum ada transaksi petty cash yang di-ON</td></tr>
              ) : (
                pettyCashOnData.map((p, i) => (
                  <tr key={p.id || i}>
                    <td>
                      {(() => {
                        const rawDate = p.tgl || p.tanggal || p.created_at;
                        if (!rawDate) return '-';
                        const dt = new Date(rawDate);
                        if (Number.isNaN(dt.getTime())) return '-';
                        return dt.toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        });
                      })()}
                    </td>
                    <td>{String(p.store || p.toko || '-').toUpperCase()}</td>
                    <td>{String(p.akun || '-').toUpperCase()}</td>
                    <td>
                      {String(p.type || '').toLowerCase() === 'in' ? (
                        <span className="text-green-400 font-semibold">Masuk</span>
                      ) : (
                        <span className="text-red-400 font-semibold">Keluar</span>
                      )}
                    </td>
                    <td>{p.keterangan || '-'}</td>
                    <td>{p.kegunaan || '-'}</td>
                    <td>
                      {String(p.type || '').toLowerCase() === 'in' ? '+' : '-'}
                      Rp {Number(p.saldokeluarmasuk || p.jumlah || 0).toLocaleString('id-ID')}
                    </td>
                    <td>Rp {Number(p.saldosaatini || 0).toLocaleString('id-ID')}</td>
                  </tr>
                ))
              )}
          </tbody>
        </table>
      </div>
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
      
      {/* Edit Tempo Modal */}
      {editTempoModal && selectedCustomerForEdit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl border border-gray-700">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  editType === 'masuk' ? 'bg-green-900/40' : 'bg-red-900/40'
                }`}>
                  <Edit3 className={`w-5 h-5 ${editType === 'masuk' ? 'text-green-400' : 'text-red-400'}`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Edit Tempo</h3>
                  <p className="text-sm text-gray-400">{selectedCustomerForEdit.customer}</p>
                </div>
              </div>
              <button 
                onClick={() => { setEditTempoModal(false); setSelectedCustomerForEdit(null); }}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Tempo Saat Ini</label>
                <div className={`px-3 py-2 rounded-lg text-sm font-medium inline-block ${
                  selectedCustomerForEdit.tempo.includes('CASH') || selectedCustomerForEdit.tempo === '' ? 'bg-emerald-900/40 text-emerald-300' :
                  selectedCustomerForEdit.tempo.includes('3') ? 'bg-purple-900/40 text-purple-300' :
                  selectedCustomerForEdit.tempo.includes('2') ? 'bg-blue-900/40 text-blue-300' :
                  'bg-teal-900/40 text-teal-300'
                }`}>
                  {selectedCustomerForEdit.tempo || 'CASH'}
                </div>
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Tempo Baru</label>
                <select
                  value={newTempo}
                  onChange={(e) => setNewTempo(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option value="CASH">CASH</option>
                  <option value="3 BLN">3 BLN (3 Bulan)</option>
                  <option value="2 BLN">2 BLN (2 Bulan)</option>
                  <option value="1 BLN">1 BLN (1 Bulan)</option>
                  <option value="NADIR">NADIR</option>
                </select>
              </div>
              
              <div className="bg-yellow-900/20 border border-yellow-800/30 rounded-xl p-3">
                <p className="text-yellow-300 text-sm">
                  ⚠️ Perubahan tempo akan diterapkan ke <strong>{selectedCustomerForEdit.itemCount}</strong> transaksi 
                  untuk customer <strong>{selectedCustomerForEdit.customer}</strong> di periode ini.
                </p>
              </div>
            </div>
            
            {/* Footer */}
            <div className="flex gap-3 p-4 border-t border-gray-700">
              <button
                onClick={() => { setEditTempoModal(false); setSelectedCustomerForEdit(null); }}
                className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleUpdateTempo}
                disabled={savingTempo || newTempo === selectedCustomerForEdit.tempo}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {savingTempo ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Simpan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* History Modal */}
      {historyModal && selectedCustomerForHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-gray-700 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  historyType === 'masuk' ? 'bg-green-900/40' : 'bg-red-900/40'
                }`}>
                  <Package className={`w-5 h-5 ${historyType === 'masuk' ? 'text-green-400' : 'text-red-400'}`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Riwayat {historyType === 'masuk' ? 'Pengambilan Barang' : 'Penjualan Barang'}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {selectedCustomerForHistory.customer} • {selectedCustomerForHistory.tempo || 'CASH'} • {historyData.length} transaksi
                  </p>
                </div>
              </div>
              <button 
                onClick={closeHistoryModal}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-md">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={historySearchTerm}
                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                    placeholder="Cari tanggal, part number, customer, ecommerce..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
                <div className="text-xs text-gray-400">
                  Menampilkan {filteredHistoryData.length} dari {historyData.length} transaksi
                </div>
              </div>

              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-3 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : historyData.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Tidak ada data transaksi</p>
                </div>
              ) : filteredHistoryData.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Data tidak ditemukan untuk kata kunci: "{historySearchTerm}"</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/50 sticky top-0">
                    <tr className="text-gray-400">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Tanggal</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Part Number</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Nama Barang</th>
                      {historyType === 'keluar' && (
                        <>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Customer</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Ecommerce</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Kode Toko</th>
                        </>
                      )}
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Harga Satuan</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Total</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Toko</th>
                      {historyType === 'keluar' && (
                        <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Aksi</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredHistoryData.map((record, i) => {
                      const rowKey = `${record.store || '-'}-${record.id}`;
                      const isEditing = editingHistoryKey === rowKey;
                      const qtyPreview = parseInt(historyEditForm.qty, 10);
                      const hargaPreview = parseFloat(historyEditForm.harga_satuan);
                      const totalPreview =
                        Number.isFinite(qtyPreview) && Number.isFinite(hargaPreview)
                          ? qtyPreview * hargaPreview
                          : 0;

                      return (
                        <tr
                          key={`${rowKey}-${i}`}
                          className={`transition-colors ${isEditing ? 'bg-blue-900/10' : 'hover:bg-gray-700/30'}`}
                        >
                          <td className="px-3 py-2 text-gray-300 text-xs">
                            {isEditing ? (
                              <input
                                type="datetime-local"
                                value={historyEditForm.created_at}
                                onChange={(e) =>
                                  setHistoryEditForm((prev) => ({ ...prev, created_at: e.target.value }))
                                }
                                className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white w-[180px]"
                              />
                            ) : (
                              new Date(record.created_at).toLocaleString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-white text-xs">
                            {isEditing ? (
                              <input
                                value={historyEditForm.part_number}
                                onChange={(e) =>
                                  setHistoryEditForm((prev) => ({
                                    ...prev,
                                    part_number: e.target.value.toUpperCase(),
                                  }))
                                }
                                className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white w-[140px]"
                              />
                            ) : (
                              record.part_number
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-300 text-xs">
                            {isEditing ? (
                              <input
                                value={historyEditForm.name}
                                onChange={(e) =>
                                  setHistoryEditForm((prev) => ({ ...prev, name: e.target.value }))
                                }
                                className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white w-[190px]"
                              />
                            ) : (
                              <span className="truncate block max-w-[200px]" title={record.name}>
                                {record.name || '-'}
                              </span>
                            )}
                          </td>
                          {historyType === 'keluar' && (
                            <>
                              <td className="px-3 py-2 text-gray-200 text-xs whitespace-nowrap">
                                {isEditing ? (
                                  <input
                                    value={historyEditForm.customer}
                                    onChange={(e) =>
                                      setHistoryEditForm((prev) => ({ ...prev, customer: e.target.value }))
                                    }
                                    className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white w-[150px]"
                                  />
                                ) : (
                                  record.customer || '-'
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-200 text-xs whitespace-nowrap">
                                {isEditing ? (
                                  <select
                                    value={historyEditForm.ecommerce}
                                    onChange={(e) =>
                                      setHistoryEditForm((prev) => ({
                                        ...prev,
                                        ecommerce: normalizeEcommerce(e.target.value),
                                      }))
                                    }
                                    className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white"
                                  >
                                    {HISTORY_ECOMMERCE_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  normalizeEcommerce(record.ecommerce)
                                )}
                              </td>
                              <td className="px-3 py-2 text-center text-xs text-gray-200 whitespace-nowrap">
                                {isEditing ? (
                                  <select
                                    value={historyEditForm.kode_toko}
                                    onChange={(e) =>
                                      setHistoryEditForm((prev) => ({
                                        ...prev,
                                        kode_toko: normalizeSubToko(e.target.value),
                                      }))
                                    }
                                    className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white"
                                  >
                                    {HISTORY_KODE_TOKO_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  record.kode_toko || '-'
                                )}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2 text-center font-medium text-white">
                            {isEditing ? (
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={historyEditForm.qty}
                                onChange={(e) =>
                                  setHistoryEditForm((prev) => ({ ...prev, qty: e.target.value }))
                                }
                                className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white w-16 text-center"
                              />
                            ) : historyType === 'masuk' ? (
                              record.qty_masuk
                            ) : (
                              record.qty_keluar
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-300 text-xs">
                            {isEditing ? (
                              <input
                                type="number"
                                min={0}
                                step={100}
                                value={historyEditForm.harga_satuan}
                                onChange={(e) =>
                                  setHistoryEditForm((prev) => ({ ...prev, harga_satuan: e.target.value }))
                                }
                                className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white w-[120px] text-right"
                              />
                            ) : (
                              formatCurrency(record.harga_satuan)
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-white text-sm">
                            {isEditing ? formatCurrency(totalPreview) : formatCurrency(record.harga_total)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${
                                record.store === 'mjm'
                                  ? 'bg-blue-900/40 text-blue-300'
                                  : 'bg-orange-900/40 text-orange-300'
                              }`}
                            >
                              {record.store}
                            </span>
                          </td>
                          {historyType === 'keluar' && (
                            <td className="px-3 py-2 text-center">
                              {isEditing ? (
                                <div className="inline-flex gap-2">
                                  <button
                                    onClick={() => saveEditHistoryRecord(record)}
                                    disabled={savingHistoryRecord}
                                    className="p-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                                    title="Simpan"
                                  >
                                    {savingHistoryRecord ? (
                                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                      <Save className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <button
                                    onClick={cancelEditHistoryRecord}
                                    disabled={savingHistoryRecord}
                                    className="p-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                                    title="Batal"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => startEditHistoryRecord(record)}
                                  className="p-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                  title="Edit transaksi"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-900/70 sticky bottom-0">
                    <tr className="font-semibold">
                      <td colSpan={historyType === 'keluar' ? 6 : 3} className="px-3 py-3 text-white">
                        Total {historySearchTerm.trim() ? '(hasil pencarian)' : ''}
                      </td>
                      <td className="px-3 py-3 text-center text-white">{filteredHistoryTotals.qty}</td>
                      <td className="px-3 py-3"></td>
                      <td
                        className={`px-3 py-3 text-right font-mono text-base ${
                          historyType === 'masuk' ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {formatCurrency(filteredHistoryTotals.amount)}
                      </td>
                      <td></td>
                      {historyType === 'keluar' && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex justify-end p-4 border-t border-gray-700 flex-shrink-0">
              <button
                onClick={closeHistoryModal}
                className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      </div> {/* end screen-only */}

      {/* Print-only Barang Masuk */}
      <div className="print-masuk" style={{ display: printTarget === 'masuk' ? 'block' : 'none' }}>
        <div style={{ color: '#000', background: '#fff', padding: '8mm' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div>
              <div className="print-title" style={{ fontSize: '18pt', fontWeight: 700 }}>Rekap Barang Masuk</div>
              <div style={{ fontSize: '11pt' }}>
                Periode: {formatRangeLabel(bulanMulai, bulanAkhir)} | Toko: {getStoreLabel()} | Tempo: {filterTempoMasuk === 'all' ? 'Semua' : filterTempoMasuk}
              </div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', width: '45%' }}>Customer/Supplier</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', width: '15%' }}>Tempo</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', width: '25%' }}>Total Harga</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', width: '15%' }}>Store</th>
              </tr>
            </thead>
            <tbody>
              {groupedBarangMasuk.map((item, idx) => (
                <tr key={`print-masuk-${item.customer}-${item.tempo}-${idx}`}>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>{item.customer}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{item.tempo}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{formatCurrency(item.totalHarga)}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{getStoreLabel()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="print-total-summary" style={{ marginTop: '8px', fontSize: '11pt', borderTop: '1px solid #000', paddingTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
            <strong>TOTAL</strong>
            <strong>Rp {totalMasukFiltered.toLocaleString('id-ID')}</strong>
          </div>

          <div style={{ marginTop: '10px', fontSize: '11pt' }}>
            Ringkasan: Cash {formatCurrency(stats.masukCash)} - 3 BLN {formatCurrency(stats.masuk3Bln)} - 2 BLN {formatCurrency(stats.masuk2Bln)} - 1 BLN {formatCurrency(stats.masuk1Bln)}
          </div>
        </div>
      </div>

      {/* Print-only Barang Keluar */}
      <div className="print-keluar" style={{ display: printTarget === 'keluar' ? 'block' : 'none' }}>
        <div style={{ color: '#000', background: '#fff', padding: '8mm' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div>
              <div className="print-title" style={{ fontSize: '18pt', fontWeight: 700 }}>Rekap Barang Keluar</div>
              <div style={{ fontSize: '11pt' }}>
                Periode: {formatRangeLabel(bulanMulai, bulanAkhir)} | Toko: {getStoreLabel()} | Tempo: {filterTempoKeluar === 'all' ? 'Semua' : filterTempoKeluar} | Ecommerce: {filterEcommerceKeluar === 'all' ? 'Semua' : filterEcommerceKeluar}
              </div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', width: '45%' }}>Customer</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', width: '15%' }}>Tempo</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', width: '25%' }}>Total Harga</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', width: '15%' }}>Store</th>
              </tr>
            </thead>
            <tbody>
              {groupedBarangKeluar.map((item, idx) => (
                <tr key={`print-${item.customer}-${item.tempo}-${idx}`}>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>{item.customer}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{item.tempo}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{formatCurrency(item.totalHarga)}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{getStoreLabel()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="print-total-summary" style={{ marginTop: '8px', fontSize: '11pt', borderTop: '1px solid #000', paddingTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
            <strong>TOTAL</strong>
            <strong>Rp {totalKeluarFiltered.toLocaleString('id-ID')}</strong>
          </div>

          <div style={{ marginTop: '10px', fontSize: '11pt' }}>
            Ringkasan: Cash {formatCurrency(stats.keluarCash)} - 3 BLN {formatCurrency(stats.keluar3Bln)} - 2 BLN {formatCurrency(stats.keluar2Bln)} - 1 BLN {formatCurrency(stats.keluar1Bln)}
          </div>
        </div>
      </div>

      {/* Print stylesheet */}
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { background: #fff !important; color: #000 !important; }
          body * { visibility: hidden !important; }

          .print-target-masuk,
          .print-target-keluar,
          .print-target-masuk *,
          .print-target-keluar * {
            visibility: visible !important;
          }

          .print-target-masuk,
          .print-target-keluar {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #fff !important;
            color: #000 !important;
          }

          .print-container { background: #fff !important; color: #000 !important; padding: 0 !important; }
          .no-print, .screen-only { display: none !important; }
          .print-masuk, .print-keluar { display: none !important; }
          .print-target-masuk .print-masuk { display: block !important; }
          .print-target-keluar .print-keluar { display: block !important; }
          .print-masuk table, .print-keluar table { page-break-inside: auto !important; }
          .print-masuk thead, .print-keluar thead { display: table-header-group; }
          .print-masuk tr, .print-keluar tr { page-break-inside: avoid !important; break-inside: avoid !important; }
          .print-masuk td, .print-keluar td, .print-masuk th, .print-keluar th { page-break-inside: avoid !important; }
          .print-total-summary { page-break-inside: avoid !important; break-inside: avoid !important; }
          .rounded-xl, .rounded-2xl { border-radius: 6px !important; }
        }
      `}</style>
    </div>
  );
};
