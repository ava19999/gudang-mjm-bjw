import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Loader2, Search, Wallet, X } from 'lucide-react';
import {
  AssetProfitDetailRow,
  ModalSourceType,
  fetchAssetProfitDetails,
} from '../services/supabaseService';
import { useStore } from '../context/StoreContext';

interface AssetProfitModalProps {
  onClose: () => void;
}

interface AssetSummary {
  totalItems: number;
  totalModalStock: number;
  totalSales: number;
  totalHppSold: number;
  totalProfit: number;
  estimasiModalItems: number;
  tanpaModalItems: number;
}

type SortKey =
  | 'partNumber'
  | 'name'
  | 'stockQty'
  | 'soldQty'
  | 'avgSellPrice'
  | 'unitModal'
  | 'modalSource'
  | 'modalStock'
  | 'salesTotal'
  | 'hppSold'
  | 'keuntungan';

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatCompact = (value: number): string => {
  const n = Number(value || 0);
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(1).replace(/\.0$/, '')} M`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')} jt`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)} rb`;
  return `${Math.round(n)}`;
};

const getModalSourceLabel = (source: ModalSourceType): string => {
  if (source === 'HARGA_TERENDAH_MASUK') return 'Harga Terendah (Masuk)';
  if (source === 'ESTIMASI_80PCT_AVG_JUAL') return 'Estimasi 80% Avg Jual';
  return 'Tanpa Modal';
};

const getModalSourceClass = (source: ModalSourceType): string => {
  if (source === 'HARGA_TERENDAH_MASUK') return 'bg-emerald-900/40 text-emerald-300 border-emerald-800/60';
  if (source === 'ESTIMASI_80PCT_AVG_JUAL') return 'bg-amber-900/40 text-amber-300 border-amber-800/60';
  return 'bg-red-900/40 text-red-300 border-red-800/60';
};

export const AssetProfitModal: React.FC<AssetProfitModalProps> = ({ onClose }) => {
  const { selectedStore } = useStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<AssetProfitDetailRow[]>([]);
  const [summary, setSummary] = useState<AssetSummary>({
    totalItems: 0,
    totalModalStock: 0,
    totalSales: 0,
    totalHppSold: 0,
    totalProfit: 0,
    estimasiModalItems: 0,
    tanpaModalItems: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | ModalSourceType>('all');
  const [sortState, setSortState] = useState<{ key: SortKey | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'desc',
  });

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await fetchAssetProfitDetails(selectedStore);
        if (!active) return;
        setRows(result.rows);
        setSummary({
          totalItems: result.totalItems,
          totalModalStock: result.totalModalStock,
          totalSales: result.totalSales,
          totalHppSold: result.totalHppSold,
          totalProfit: result.totalProfit,
          estimasiModalItems: result.estimasiModalItems,
          tanpaModalItems: result.tanpaModalItems,
        });
      } catch (err: any) {
        if (!active) return;
        console.error('Gagal memuat detail asset/profit:', err);
        setRows([]);
        setError(err?.message || 'Gagal memuat detail keuntungan penjualan.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();
    return () => {
      active = false;
    };
  }, [selectedStore]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
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
  }, [rows, searchTerm, sourceFilter]);

  const sortedRows = useMemo(() => {
    if (!sortState.key) return filteredRows;

    const data = [...filteredRows];
    data.sort((a, b) => {
      const key = sortState.key;
      const dir = sortState.direction === 'asc' ? 1 : -1;

      if (key === 'partNumber' || key === 'name' || key === 'modalSource') {
        const aVal = String(a[key] || '').toLowerCase();
        const bVal = String(b[key] || '').toLowerCase();
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      }

      const aVal = Number(a[key] || 0);
      const bVal = Number(b[key] || 0);
      return (aVal - bVal) * dir;
    });
    return data;
  }, [filteredRows, sortState]);

  const setSort = (key: SortKey, direction: 'asc' | 'desc' | 'normal') => {
    if (direction === 'normal') {
      setSortState({ key: null, direction: 'desc' });
      return;
    }
    setSortState({ key, direction });
  };

  const sortButtonClass = (active: boolean): string =>
    `p-0.5 rounded transition-colors ${
      active ? 'text-yellow-300 bg-yellow-900/30' : 'text-gray-500 hover:text-gray-300'
    }`;

  const renderSortControls = (key: SortKey) => (
    <>
      <button
        type="button"
        title="Urut Naik"
        onClick={() => setSort(key, 'asc')}
        className={sortButtonClass(sortState.key === key && sortState.direction === 'asc')}
      >
        <ArrowUp size={12} />
      </button>
      <button
        type="button"
        title="Urut Turun"
        onClick={() => setSort(key, 'desc')}
        className={sortButtonClass(sortState.key === key && sortState.direction === 'desc')}
      >
        <ArrowDown size={12} />
      </button>
      <button
        type="button"
        title="Urutan Normal"
        onClick={() => setSort(key, 'normal')}
        className={sortButtonClass(sortState.key === null)}
      >
        <ArrowUpDown size={12} />
      </button>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 md:p-4 animate-in fade-in">
      <div className="bg-gray-800 rounded-2xl w-full max-w-[1600px] h-[90vh] border border-gray-700 shadow-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between bg-gray-900/50">
          <div className="flex items-center gap-2">
            <Wallet size={18} className="text-yellow-400" />
            <div>
              <h3 className="font-semibold text-gray-100">Detail Modal & Keuntungan Penjualan</h3>
              <p className="text-xs text-gray-400">Semua tanggal, semua penjualan</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 className="animate-spin" size={28} />
            <span className="text-sm">Menghitung detail keuntungan...</span>
          </div>
        ) : (
          <>
            <div className="p-3 md:p-4 border-b border-gray-700 bg-gray-800/70">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-800/40 rounded-xl px-3 py-2.5">
                  <div className="text-[11px] text-blue-300">Modal Stock</div>
                  <div className="text-base font-semibold">{formatCompact(summary.totalModalStock)}</div>
                  <div className="text-[10px] text-gray-400">{formatCurrency(summary.totalModalStock)}</div>
                </div>
                <div className="bg-gradient-to-br from-cyan-900/40 to-cyan-800/20 border border-cyan-800/40 rounded-xl px-3 py-2.5">
                  <div className="text-[11px] text-cyan-300">Penjualan</div>
                  <div className="text-base font-semibold">{formatCompact(summary.totalSales)}</div>
                  <div className="text-[10px] text-gray-400">{formatCurrency(summary.totalSales)}</div>
                </div>
                <div className="bg-gradient-to-br from-orange-900/40 to-orange-800/20 border border-orange-800/40 rounded-xl px-3 py-2.5">
                  <div className="text-[11px] text-orange-300">HPP Terjual</div>
                  <div className="text-base font-semibold">{formatCompact(summary.totalHppSold)}</div>
                  <div className="text-[10px] text-gray-400">{formatCurrency(summary.totalHppSold)}</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border border-emerald-800/40 rounded-xl px-3 py-2.5">
                  <div className="text-[11px] text-emerald-300">Keuntungan</div>
                  <div className="text-base font-semibold">{formatCompact(summary.totalProfit)}</div>
                  <div className="text-[10px] text-gray-400">{formatCurrency(summary.totalProfit)}</div>
                </div>
              </div>

              {(summary.estimasiModalItems > 0 || summary.tanpaModalItems > 0) && (
                <div className="mt-3 bg-amber-900/25 border border-amber-800/50 rounded-xl px-3 py-2 text-[12px]">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5" />
                    <div className="text-amber-200">
                      Item estimasi modal: <span className="font-semibold">{summary.estimasiModalItems}</span>,
                      item tanpa modal: <span className="font-semibold">{summary.tanpaModalItems}</span>.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-3 py-2.5 border-b border-gray-700 flex flex-col md:flex-row md:items-center gap-2.5 bg-gray-800">
              <div>
                <h4 className="font-semibold text-sm">Detail Modal & Keuntungan per Item</h4>
                <p className="text-xs text-gray-400">
                  Total item: {summary.totalItems} | Ditampilkan: {sortedRows.length}
                </p>
              </div>
              <div className="flex items-center gap-2 md:ml-auto">
                <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
                  <Search className="w-4 h-4 text-gray-500" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Cari part / nama..."
                    className="bg-transparent outline-none text-sm w-[160px] md:w-[220px]"
                  />
                </div>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as 'all' | ModalSourceType)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">Semua Sumber</option>
                  <option value="HARGA_TERENDAH_MASUK">Harga Terendah (Masuk)</option>
                  <option value="ESTIMASI_80PCT_AVG_JUAL">Estimasi 80% Avg Jual</option>
                  <option value="TANPA_MODAL">Tanpa Modal</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {error ? (
                <div className="px-4 py-6 text-sm text-red-300">{error}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-900/95 z-10">
                    <tr className="text-xs uppercase tracking-wider text-gray-400">
                      <th className="px-3 py-2 text-left">
                        <div className="inline-flex items-center gap-1">
                          <span>Part Number</span>
                          {renderSortControls('partNumber')}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-left">
                        <div className="inline-flex items-center gap-1">
                          <span>Nama</span>
                          {renderSortControls('name')}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1 w-full">
                          <span>Stok</span>
                          {renderSortControls('stockQty')}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1 w-full">
                          <span>Terjual</span>
                          {renderSortControls('soldQty')}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1 w-full">
                          <span>Avg Jual</span>
                          {renderSortControls('avgSellPrice')}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1 w-full">
                          <span>Modal / Unit</span>
                          {renderSortControls('unitModal')}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-center">
                        <div className="inline-flex items-center justify-center gap-1 w-full">
                          <span>Sumber Modal</span>
                          {renderSortControls('modalSource')}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1 w-full">
                          <span>Modal Stok</span>
                          {renderSortControls('modalStock')}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1 w-full">
                          <span>Penjualan</span>
                          {renderSortControls('salesTotal')}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1 w-full">
                          <span>HPP Terjual</span>
                          {renderSortControls('hppSold')}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1 w-full">
                          <span>Keuntungan</span>
                          {renderSortControls('keuntungan')}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {sortedRows.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-3 py-6 text-center text-gray-500">
                          Tidak ada data.
                        </td>
                      </tr>
                    )}
                    {sortedRows.map((row, index) => (
                      <tr key={`${row.partNumber}-${index}`} className="hover:bg-gray-700/25">
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
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
