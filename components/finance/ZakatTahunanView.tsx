import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Calendar, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

type ModalSource = 'HARGA_TERENDAH_MASUK' | 'ESTIMASI_80PCT_AVG_JUAL' | 'TANPA_MODAL';

interface BaseItemRow {
  part_number: string;
  name: string;
  quantity: number;
}

interface BarangMasukRow {
  part_number: string;
  customer: string;
  tempo: string;
  harga_satuan: number;
  harga_total: number;
  created_at: string;
}

interface BarangKeluarRow {
  part_number: string;
  customer: string;
  tempo: string;
  qty_keluar: number;
  harga_total: number;
  created_at: string;
}

interface TagihanRow {
  customer: string;
  tempo: string;
  jumlah: number;
  tanggal: string;
}

interface PembayaranRow {
  customer: string;
  tempo: string;
  jumlah: number;
  tanggal: string;
}

interface ItemSummaryRow {
  partNumber: string;
  name: string;
  stockQty: number;
  soldQty: number;
  avgSellPrice: number;
  unitModal: number;
  modalSource: ModalSource;
  modalStock: number;
  salesTotal: number;
  hppSold: number;
  keuntungan: number;
}

interface OutstandingRow {
  key: string;
  customer: string;
  tempo: string;
  totalTagihan: number;
  totalTagihanManual: number;
  totalBayar: number;
  sisa: number;
}

interface ZakatSummary {
  modal: number;
  keuntungan: number;
  piutangBisaDitagih: number;
  hutangBelumTerbayar: number;
  totalHartaBersih: number;
  zakat25: number;
  totalItems: number;
  estimasiModalItems: number;
  tanpaModalItems: number;
  soldWithoutOriginalModalItems: number;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value || 0);
};

const formatCompact = (value: number): string => {
  const n = Number(value || 0);
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(1).replace(/\.0$/, '')} M`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')} jt`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)} rb`;
  return `${Math.round(n)}`;
};

const toNumber = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizePart = (value: string | null | undefined): string => {
  return (value || '').trim().toUpperCase();
};

const normalizePartKey = (value: string | null | undefined): string => {
  return normalizePart(value).replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
};

const normalizeText = (value: string | null | undefined): string => {
  const v = (value || '').trim().toUpperCase();
  return v || 'UNKNOWN';
};

const normalizeTempo = (value: string | null | undefined): string => {
  return (value || '').trim().toUpperCase();
};

const isTempoDebt = (tempoValue: string | null | undefined): boolean => {
  const tempo = normalizeTempo(tempoValue);
  if (!tempo || tempo === '-') return false;
  if (tempo.includes('CASH')) return false;
  if (tempo.includes('NADIR')) return false;
  if (tempo.includes('RETUR')) return false;
  if (tempo.includes('STOK')) return false;
  if (tempo.includes('LUNAS')) return false;
  return true;
};

const isReturMasuk = (row: { tempo?: string | null; customer?: string | null }): boolean => {
  const tempo = normalizeTempo(row.tempo);
  const customer = normalizeText(row.customer);
  if (tempo.includes('RETUR')) return true;
  if (customer.includes('RETUR')) return true;
  return false;
};

const isDateInRange = (value: string | null | undefined, start: string, end: string): boolean => {
  if (!value) return false;
  const ts = new Date(value).getTime();
  const startTs = new Date(start).getTime();
  const endTs = new Date(end).getTime();
  if (!Number.isFinite(ts) || !Number.isFinite(startTs) || !Number.isFinite(endTs)) return false;
  return ts >= startTs && ts <= endTs;
};

const getModalSourceLabel = (source: ModalSource): string => {
  if (source === 'HARGA_TERENDAH_MASUK') return 'Harga Terendah (Masuk)';
  if (source === 'ESTIMASI_80PCT_AVG_JUAL') return 'Estimasi 80% Avg Jual';
  return 'Tanpa Modal';
};

const getModalSourceClass = (source: ModalSource): string => {
  if (source === 'HARGA_TERENDAH_MASUK') return 'bg-emerald-900/40 text-emerald-300 border-emerald-800/60';
  if (source === 'ESTIMASI_80PCT_AVG_JUAL') return 'bg-amber-900/40 text-amber-300 border-amber-800/60';
  return 'bg-red-900/40 text-red-300 border-red-800/60';
};

export const ZakatTahunanView: React.FC = () => {
  const today = useMemo(
    () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date()),
    []
  );

  const [startDate, setStartDate] = useState('2025-03-01');
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [summary, setSummary] = useState<ZakatSummary | null>(null);
  const [itemRows, setItemRows] = useState<ItemSummaryRow[]>([]);
  const [receivableRows, setReceivableRows] = useState<OutstandingRow[]>([]);
  const [payableRows, setPayableRows] = useState<OutstandingRow[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | ModalSource>('all');

  const filteredItemRows = useMemo(() => {
    return itemRows.filter((row) => {
      if (
        searchTerm &&
        !row.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !row.name.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      if (sourceFilter !== 'all' && row.modalSource !== sourceFilter) {
        return false;
      }
      return true;
    });
  }, [itemRows, searchTerm, sourceFilter]);

  const fetchAllRows = async <T,>(
    table: string,
    select: string,
    orderColumn: string,
    applyFilters?: (query: any) => any
  ): Promise<T[]> => {
    const pageSize = 1000;
    let from = 0;
    const allRows: T[] = [];

    while (true) {
      let query: any = supabase
        .from(table)
        .select(select)
        .order(orderColumn, { ascending: true });

      if (applyFilters) {
        query = applyFilters(query);
      }

      const { data, error: queryError } = await query.range(from, from + pageSize - 1);
      if (queryError) throw queryError;

      const page = (data || []) as T[];
      allRows.push(...page);

      if (page.length < pageSize) break;
      from += pageSize;
    }

    return allRows;
  };

  const loadData = async () => {
    if (!startDate || !endDate) return;

    if (endDate < startDate) {
      setError('Tanggal akhir tidak boleh lebih kecil dari tanggal awal.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const startDateTime = `${startDate}T00:00:00`;
      const endDateTime = `${endDate}T23:59:59`;

      const [
        baseItems,
        barangMasukMjm,
        barangMasukBjw,
        barangKeluarMjm,
        barangKeluarBjw,
        importirTagihan,
        importirPembayaran
      ] = await Promise.all([
        fetchAllRows<BaseItemRow>(
          'base_mjm',
          'part_number,name,quantity',
          'part_number',
          (query) => query.not('part_number', 'is', null)
        ),
        fetchAllRows<BarangMasukRow>(
          'barang_masuk_mjm',
          'part_number,customer,tempo,harga_satuan,harga_total,created_at',
          'created_at'
        ),
        fetchAllRows<BarangMasukRow>(
          'barang_masuk_bjw',
          'part_number,customer,tempo,harga_satuan,harga_total,created_at',
          'created_at'
        ),
        fetchAllRows<BarangKeluarRow>(
          'barang_keluar_mjm',
          'part_number,customer,tempo,qty_keluar,harga_total,created_at',
          'created_at',
          (query) => query.gte('created_at', startDateTime).lte('created_at', endDateTime)
        ),
        fetchAllRows<BarangKeluarRow>(
          'barang_keluar_bjw',
          'part_number,customer,tempo,qty_keluar,harga_total,created_at',
          'created_at',
          (query) => query.gte('created_at', startDateTime).lte('created_at', endDateTime)
        ),
        fetchAllRows<TagihanRow>(
          'importir_tagihan',
          'customer,tempo,jumlah,tanggal',
          'tanggal',
          (query) => query.gte('tanggal', startDate).lte('tanggal', endDate)
        ),
        fetchAllRows<PembayaranRow>(
          'importir_pembayaran',
          'customer,tempo,jumlah,tanggal',
          'tanggal',
          (query) => query.gte('tanggal', startDate).lte('tanggal', endDate)
        )
      ]);

      const allKeluar = [...barangKeluarMjm, ...barangKeluarBjw];
      const allMasukAllHistory = [...barangMasukMjm, ...barangMasukBjw].filter(
        (row) => !isReturMasuk(row)
      );
      const allMasuk = allMasukAllHistory.filter((row) =>
        isDateInRange(row.created_at, startDateTime, endDateTime)
      );

      const minCostByPartExact = new Map<string, number>();
      const minCostByPartKey = new Map<string, number>();
      for (const row of allMasukAllHistory) {
        const part = normalizePart(row.part_number);
        const partKey = normalizePartKey(row.part_number);
        const price = toNumber(row.harga_satuan);
        if (!part || price <= 0) continue;

        const prevExact = minCostByPartExact.get(part);
        if (prevExact === undefined || price < prevExact) {
          minCostByPartExact.set(part, price);
        }

        if (partKey) {
          const prevKey = minCostByPartKey.get(partKey);
          if (prevKey === undefined || price < prevKey) {
            minCostByPartKey.set(partKey, price);
          }
        }
      }

      const salesByPart = new Map<string, { qty: number; total: number }>();
      for (const row of allKeluar) {
        const part = normalizePart(row.part_number);
        if (!part) continue;
        const qty = toNumber(row.qty_keluar);
        const total = toNumber(row.harga_total);
        if (!salesByPart.has(part)) {
          salesByPart.set(part, { qty: 0, total: 0 });
        }
        const agg = salesByPart.get(part)!;
        agg.qty += qty;
        agg.total += total;
      }

      const itemSummaryRows: ItemSummaryRow[] = baseItems
        .map((item) => {
          const partNumber = normalizePart(item.part_number);
          const partKey = normalizePartKey(item.part_number);
          const stockQty = toNumber(item.quantity);
          const salesAgg = salesByPart.get(partNumber) || { qty: 0, total: 0 };
          const avgSellPrice = salesAgg.qty > 0 ? salesAgg.total / salesAgg.qty : 0;

          const exactCost = minCostByPartExact.get(partNumber) || 0;
          const keyCost = minCostByPartKey.get(partKey) || 0;
          const minCostCandidates = [exactCost, keyCost].filter((v) => v > 0);
          const minCost = minCostCandidates.length > 0 ? Math.min(...minCostCandidates) : 0;

          let unitModal = 0;
          let modalSource: ModalSource = 'TANPA_MODAL';
          if (minCost > 0) {
            unitModal = minCost;
            modalSource = 'HARGA_TERENDAH_MASUK';
          } else if (avgSellPrice > 0) {
            unitModal = avgSellPrice * 0.8;
            modalSource = 'ESTIMASI_80PCT_AVG_JUAL';
          }

          const modalStock = stockQty * unitModal;
          const soldQty = salesAgg.qty;
          const salesTotal = salesAgg.total;
          const hppSold = soldQty * unitModal;
          const keuntungan = salesTotal - hppSold;

          return {
            partNumber,
            name: (item.name || '').trim(),
            stockQty,
            soldQty,
            avgSellPrice,
            unitModal,
            modalSource,
            modalStock,
            salesTotal,
            hppSold,
            keuntungan
          };
        })
        .sort((a, b) => b.salesTotal - a.salesTotal);

      const receivableMap = new Map<
        string,
        { customer: string; totalTagihan: number; totalTagihanManual: number; totalBayar: number }
      >();
      const ensureReceivable = (customerRaw: string | null | undefined) => {
        const customer = normalizeText(customerRaw);
        if (!receivableMap.has(customer)) {
          receivableMap.set(customer, {
            customer,
            totalTagihan: 0,
            totalTagihanManual: 0,
            totalBayar: 0
          });
        }
        return receivableMap.get(customer)!;
      };

      for (const row of allKeluar) {
        if (!isTempoDebt(row.tempo)) continue;
        const target = ensureReceivable(row.customer);
        target.totalTagihan += toNumber(row.harga_total);
      }
      const receivableOutstandingRows: OutstandingRow[] = Array.from(receivableMap.values())
        .map((row) => ({
          key: row.customer,
          customer: row.customer,
          tempo: '-',
          totalTagihan: row.totalTagihan,
          totalTagihanManual: row.totalTagihanManual,
          totalBayar: row.totalBayar,
          sisa: row.totalTagihan + row.totalTagihanManual - row.totalBayar
        }))
        .filter((row) => row.sisa > 0)
        .sort((a, b) => b.sisa - a.sisa);

      const payableMap = new Map<
        string,
        { customer: string; tempo: string; totalTagihan: number; totalTagihanManual: number; totalBayar: number }
      >();

      const ensurePayable = (
        customerRaw: string | null | undefined,
        tempoRaw: string | null | undefined
      ) => {
        const customer = normalizeText(customerRaw);
        const tempo = normalizeTempo(tempoRaw) || '-';
        const key = `${customer}__${tempo}`;
        if (!payableMap.has(key)) {
          payableMap.set(key, {
            customer,
            tempo,
            totalTagihan: 0,
            totalTagihanManual: 0,
            totalBayar: 0
          });
        }
        return payableMap.get(key)!;
      };

      for (const row of allMasuk) {
        if (!isTempoDebt(row.tempo)) continue;
        const target = ensurePayable(row.customer, row.tempo);
        target.totalTagihan += toNumber(row.harga_total);
      }
      for (const row of importirTagihan) {
        if (!isTempoDebt(row.tempo)) continue;
        const target = ensurePayable(row.customer, row.tempo);
        target.totalTagihanManual += toNumber(row.jumlah);
      }
      for (const row of importirPembayaran) {
        const target = ensurePayable(row.customer, row.tempo);
        target.totalBayar += toNumber(row.jumlah);
      }

      const payableOutstandingRows: OutstandingRow[] = Array.from(payableMap.entries())
        .map(([key, row]) => ({
          key,
          customer: row.customer,
          tempo: row.tempo,
          totalTagihan: row.totalTagihan,
          totalTagihanManual: row.totalTagihanManual,
          totalBayar: row.totalBayar,
          sisa: row.totalTagihan + row.totalTagihanManual - row.totalBayar
        }))
        .filter((row) => row.sisa > 0)
        .sort((a, b) => b.sisa - a.sisa);

      const modal = itemSummaryRows.reduce((sum, row) => sum + row.modalStock, 0);
      const keuntungan = itemSummaryRows.reduce((sum, row) => sum + row.keuntungan, 0);
      const piutangBisaDitagih = receivableOutstandingRows.reduce((sum, row) => sum + row.sisa, 0);
      const hutangBelumTerbayar = payableOutstandingRows.reduce((sum, row) => sum + row.sisa, 0);
      const totalHartaBersih = modal + keuntungan + piutangBisaDitagih - hutangBelumTerbayar;
      const zakat25 = totalHartaBersih > 0 ? totalHartaBersih * 0.025 : 0;

      const estimasiModalItems = itemSummaryRows.filter(
        (row) => row.modalSource === 'ESTIMASI_80PCT_AVG_JUAL'
      ).length;
      const tanpaModalItems = itemSummaryRows.filter((row) => row.modalSource === 'TANPA_MODAL').length;
      const soldWithoutOriginalModalItems = itemSummaryRows.filter(
        (row) => row.soldQty > 0 && row.modalSource !== 'HARGA_TERENDAH_MASUK'
      ).length;

      setSummary({
        modal,
        keuntungan,
        piutangBisaDitagih,
        hutangBelumTerbayar,
        totalHartaBersih,
        zakat25,
        totalItems: itemSummaryRows.length,
        estimasiModalItems,
        tanpaModalItems,
        soldWithoutOriginalModalItems
      });
      setItemRows(itemSummaryRows);
      setReceivableRows(receivableOutstandingRows);
      setPayableRows(payableOutstandingRows);
    } catch (err: any) {
      console.error('Gagal menghitung zakat tahunan:', err);
      setError(err?.message || 'Gagal menghitung data zakat tahunan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      <div className="mb-6 flex items-start gap-3">
        <div className="p-2.5 bg-yellow-900/30 rounded-xl border border-yellow-800/40">
          <Calculator className="w-6 h-6 text-yellow-300" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Zakat Tahunan / Zakat Penghasilan</h1>
          <p className="text-sm text-gray-400 mt-1">
            Rumus: (Modal + Keuntungan + Piutang Bisa Ditagih) - Hutang Belum Terbayar = Total Harta
            Bersih
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Sumber modal: <span className="text-gray-300">`base_mjm + seluruh histori barang_masuk_mjm + barang_masuk_bjw`</span>,
            fallback <span className="text-gray-300">avg jual x 80% dari `barang_keluar_mjm + barang_keluar_bjw`</span>.
            Baris masuk bertipe <span className="text-gray-300">RETUR</span> diabaikan (hanya RESTOCK).
          </p>
        </div>
      </div>

      <div className="bg-gray-800/70 border border-gray-700 rounded-2xl p-4 md:p-5 mb-5">
        <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <label className="text-sm text-gray-400">Dari</label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-yellow-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Sampai</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={today}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-yellow-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-yellow-700 hover:bg-yellow-600 disabled:bg-yellow-800/60 text-white rounded-lg font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Menghitung...' : 'Hitung Ulang'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 bg-red-900/30 border border-red-800/60 rounded-xl px-4 py-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
            <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-800/40 rounded-xl p-4">
              <div className="text-xs text-blue-300 mb-1">Modal</div>
              <div className="text-lg font-semibold">{formatCompact(summary.modal)}</div>
              <div className="text-[11px] text-gray-400 mt-1">{formatCurrency(summary.modal)}</div>
            </div>
            <div className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border border-emerald-800/40 rounded-xl p-4">
              <div className="text-xs text-emerald-300 mb-1">Keuntungan</div>
              <div className="text-lg font-semibold">{formatCompact(summary.keuntungan)}</div>
              <div className="text-[11px] text-gray-400 mt-1">{formatCurrency(summary.keuntungan)}</div>
            </div>
            <div className="bg-gradient-to-br from-cyan-900/40 to-cyan-800/20 border border-cyan-800/40 rounded-xl p-4">
              <div className="text-xs text-cyan-300 mb-1">Piutang Bisa Ditagih</div>
              <div className="text-lg font-semibold">{formatCompact(summary.piutangBisaDitagih)}</div>
              <div className="text-[11px] text-gray-400 mt-1">{formatCurrency(summary.piutangBisaDitagih)}</div>
            </div>
            <div className="bg-gradient-to-br from-red-900/40 to-red-800/20 border border-red-800/40 rounded-xl p-4">
              <div className="text-xs text-red-300 mb-1">Hutang Belum Terbayar</div>
              <div className="text-lg font-semibold">{formatCompact(summary.hutangBelumTerbayar)}</div>
              <div className="text-[11px] text-gray-400 mt-1">{formatCurrency(summary.hutangBelumTerbayar)}</div>
            </div>
            <div className="bg-gradient-to-br from-yellow-900/50 to-yellow-800/25 border border-yellow-700/50 rounded-xl p-4">
              <div className="text-xs text-yellow-200 mb-1">Total Harta Bersih</div>
              <div className="text-lg font-semibold text-yellow-100">{formatCompact(summary.totalHartaBersih)}</div>
              <div className="text-[11px] text-gray-300 mt-1">{formatCurrency(summary.totalHartaBersih)}</div>
            </div>
            <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/25 border border-purple-700/50 rounded-xl p-4">
              <div className="text-xs text-purple-200 mb-1">Estimasi Zakat 2.5%</div>
              <div className="text-lg font-semibold text-purple-100">{formatCompact(summary.zakat25)}</div>
              <div className="text-[11px] text-gray-300 mt-1">{formatCurrency(summary.zakat25)}</div>
            </div>
          </div>

          {(summary.estimasiModalItems > 0 || summary.tanpaModalItems > 0) && (
            <div className="mb-5 bg-amber-900/25 border border-amber-800/50 rounded-xl px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5" />
                <div className="text-amber-200">
                  <div>
                    Item estimasi modal: <span className="font-semibold">{summary.estimasiModalItems}</span>,
                    item tanpa modal: <span className="font-semibold">{summary.tanpaModalItems}</span>,
                    item terjual tanpa modal asli: <span className="font-semibold">{summary.soldWithoutOriginalModalItems}</span>.
                  </div>
                  <div className="text-amber-300/90 text-xs mt-1">
                    Item tanpa modal asli ditandai di tabel detail.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden mb-5">
            <div className="px-4 py-3 border-b border-gray-700 flex flex-col md:flex-row md:items-center gap-3">
              <div>
                <h2 className="font-semibold">Detail Modal & Keuntungan per Item</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Total item: {summary.totalItems} | Ditampilkan: {filteredItemRows.length}
                </p>
              </div>
              <div className="flex items-center gap-2 md:ml-auto">
                <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
                  <Search className="w-4 h-4 text-gray-500" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Cari part / nama..."
                    className="bg-transparent outline-none text-sm"
                  />
                </div>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as 'all' | ModalSource)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">Semua Sumber</option>
                  <option value="HARGA_TERENDAH_MASUK">Harga Terendah (Masuk)</option>
                  <option value="ESTIMASI_80PCT_AVG_JUAL">Estimasi 80% Avg Jual</option>
                  <option value="TANPA_MODAL">Tanpa Modal</option>
                </select>
              </div>
            </div>

            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900/95">
                  <tr className="text-xs uppercase tracking-wider text-gray-400">
                    <th className="px-3 py-2 text-left">Part Number</th>
                    <th className="px-3 py-2 text-left">Nama</th>
                    <th className="px-3 py-2 text-right">Stok</th>
                    <th className="px-3 py-2 text-right">Terjual</th>
                    <th className="px-3 py-2 text-right">Avg Jual</th>
                    <th className="px-3 py-2 text-right">Modal / Unit</th>
                    <th className="px-3 py-2 text-center">Sumber Modal</th>
                    <th className="px-3 py-2 text-right">Modal Stok</th>
                    <th className="px-3 py-2 text-right">Penjualan</th>
                    <th className="px-3 py-2 text-right">HPP Terjual</th>
                    <th className="px-3 py-2 text-right">Keuntungan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredItemRows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-gray-500">
                        Tidak ada data.
                      </td>
                    </tr>
                  )}
                  {filteredItemRows.map((row) => (
                    <tr key={row.partNumber} className="hover:bg-gray-700/25">
                      <td className="px-3 py-2 font-mono text-xs text-blue-300">{row.partNumber}</td>
                      <td className="px-3 py-2 text-gray-200">{row.name || '-'}</td>
                      <td className="px-3 py-2 text-right">{row.stockQty.toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2 text-right">{row.soldQty.toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.avgSellPrice)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.unitModal)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-md border text-[11px] font-medium ${getModalSourceClass(row.modalSource)}`}>
                          {getModalSourceLabel(row.modalSource)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.modalStock)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.salesTotal)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.hppSold)}</td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${
                          row.keuntungan >= 0 ? 'text-emerald-300' : 'text-red-300'
                        }`}
                      >
                        {formatCurrency(row.keuntungan)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700">
                <h3 className="font-semibold text-cyan-300">Piutang Bisa Ditagih (Belum Terbayar)</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Sumber: transaksi tempo `barang_keluar_mjm + barang_keluar_bjw` (yang belum CASH/LUNAS)
                </p>
              </div>
              <div className="overflow-auto max-h-[320px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-900/95">
                    <tr className="text-xs uppercase tracking-wider text-gray-400">
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-right">Tagihan</th>
                      <th className="px-3 py-2 text-right">Manual</th>
                      <th className="px-3 py-2 text-right">Bayar</th>
                      <th className="px-3 py-2 text-right">Sisa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {receivableRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                          Tidak ada piutang belum terbayar.
                        </td>
                      </tr>
                    )}
                    {receivableRows.map((row) => (
                      <tr key={row.key} className="hover:bg-gray-700/25">
                        <td className="px-3 py-2">{row.customer}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.totalTagihan)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.totalTagihanManual)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-300">{formatCurrency(row.totalBayar)}</td>
                        <td className="px-3 py-2 text-right font-mono text-cyan-300">{formatCurrency(row.sisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700">
                <h3 className="font-semibold text-red-300">Hutang Belum Terbayar</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Sumber: Piutang (Tempo) supplier (barang masuk tempo + tagihan manual - pembayaran)
                </p>
              </div>
              <div className="overflow-auto max-h-[320px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-900/95">
                    <tr className="text-xs uppercase tracking-wider text-gray-400">
                      <th className="px-3 py-2 text-left">Supplier</th>
                      <th className="px-3 py-2 text-left">Tempo</th>
                      <th className="px-3 py-2 text-right">Tagihan</th>
                      <th className="px-3 py-2 text-right">Manual</th>
                      <th className="px-3 py-2 text-right">Bayar</th>
                      <th className="px-3 py-2 text-right">Sisa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {payableRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                          Tidak ada hutang belum terbayar.
                        </td>
                      </tr>
                    )}
                    {payableRows.map((row) => (
                      <tr key={row.key} className="hover:bg-gray-700/25">
                        <td className="px-3 py-2">{row.customer}</td>
                        <td className="px-3 py-2">{row.tempo}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.totalTagihan)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.totalTagihanManual)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-300">{formatCurrency(row.totalBayar)}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-300">{formatCurrency(row.sisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
