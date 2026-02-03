// FILE: src/components/finance/ClosingView.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Calendar, Download, FileDown, TrendingUp, TrendingDown,
  Search, ChevronDown, ChevronRight, Minus
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { useStore } from '../../context/StoreContext';
import html2canvas from 'html2canvas';

type ViewMode = 'masuk' | 'keluar';

// Types for data
interface BarangMasukRow {
  id: number;
  created_at: string;
  tanggal: string;
  tempo: string;
  customer: string;
  part_number: string;
  nama_barang: string;
  brand: string;
  qty_masuk: number;
  harga_satuan: number;
  harga_total: number;
}

interface BarangKeluarRow {
  id: number;
  created_at: string;
  tanggal: string;
  kode_toko: string;
  tempo: string;
  ecommerce: string;
  customer: string;
  part_number: string;
  name: string;
  brand: string;
  qty_keluar: number;
  harga_satuan: number;
  harga_total: number;
}

// Pivot grouping types
interface PivotGroup {
  key: string;
  label: string;
  level: number;
  totalQty: number;
  totalHarga: number;
  isExpanded: boolean;
  children: PivotGroup[];
  items: any[];
}

interface PivotFilterDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

const PivotFilterDropdown: React.FC<PivotFilterDropdownProps> = ({
  label,
  options,
  selected,
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const safeOptions = useMemo(() => {
    return options.filter(Boolean);
  }, [options]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return safeOptions;
    return safeOptions.filter(opt => opt.toLowerCase().includes(q));
  }, [query, safeOptions]);

  const isActive = selected.length > 0 && selected.length < safeOptions.length;
  const buttonLabel = isActive ? `${label} • ${selected.length}` : label;

  const toggleValue = (value: string) => {
    const exists = selected.includes(value);
    const next = exists ? selected.filter(v => v !== value) : [...selected, value];
    onChange(next);
  };

  const handleSelectAll = () => {
    onChange([...safeOptions]);
  };

  const handleClear = () => {
    onChange([]);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        disabled={safeOptions.length === 0}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          safeOptions.length === 0
            ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
            : isActive
              ? 'bg-blue-600/20 border-blue-500 text-blue-200 hover:bg-blue-600/30'
              : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
        }`}
      >
        <span>{buttonLabel}</span>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-2 w-64 rounded-xl border border-gray-700 bg-gray-800 shadow-xl">
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center gap-2 bg-gray-900/60 border border-gray-700 rounded-lg px-2 py-1">
              <Search size={14} className="text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Cari ${label.toLowerCase()}...`}
                className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500">Tidak ada data</div>
            ) : (
              filteredOptions.map(option => (
                <label
                  key={option}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggleValue(option)}
                    className="accent-blue-500"
                  />
                  <span className="truncate">{option}</span>
                </label>
              ))
            )}
          </div>

          <div className="flex items-center gap-2 p-2 border-t border-gray-700">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex-1 px-2 py-1 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md"
            >
              Pilih Semua
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="flex-1 px-2 py-1 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const ClosingView: React.FC = () => {
  const { selectedStore } = useStore();
  const [viewMode, setViewMode] = useState<ViewMode>('masuk');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [barangMasuk, setBarangMasuk] = useState<BarangMasukRow[]>([]);
  const [barangKeluar, setBarangKeluar] = useState<BarangKeluarRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  
  // Filters
  const [tempoFilterMasuk, setTempoFilterMasuk] = useState<string[]>([]);
  const [tempoFilterKeluar, setTempoFilterKeluar] = useState<string[]>([]);
  const [ecommerceFilter, setEcommerceFilter] = useState<string[]>([]);
  const [supplierFilter, setSupplierFilter] = useState<string[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string[]>([]);
  const [partNumberFilterMasuk, setPartNumberFilterMasuk] = useState<string[]>([]);
  const [partNumberFilterKeluar, setPartNumberFilterKeluar] = useState<string[]>([]);

  // Initialize dates to today
  useEffect(() => {
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jakarta'
    }).format(new Date());
    setStartDate(today);
    setEndDate(today);
  }, []);

  // Fetch data when dates or store change
  useEffect(() => {
    if (startDate && endDate) {
      loadData();
    }
  }, [selectedStore, startDate, endDate]);

  const getTableName = (type: 'masuk' | 'keluar') => {
    const store = selectedStore?.toLowerCase() || 'mjm';
    return type === 'masuk' ? `barang_masuk_${store}` : `barang_keluar_${store}`;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch Barang Masuk
      const { data: masukData, error: masukError } = await supabase
        .from(getTableName('masuk'))
        .select('*')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .order('created_at', { ascending: true });
      
      if (masukError) console.error('Error fetching barang masuk:', masukError);
      setBarangMasuk(masukData || []);

      // Fetch Barang Keluar
      const { data: keluarData, error: keluarError } = await supabase
        .from(getTableName('keluar'))
        .select('*')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .order('created_at', { ascending: true });
      
      if (keluarError) console.error('Error fetching barang keluar:', keluarError);
      setBarangKeluar(keluarData || []);

      // Expand all groups by default
      setExpandedKeys(new Set());
    } catch (error) {
      console.error('Failed to load data:', error);
    }
    setLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDateDisplay = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Get unique tempo values from data
  const availableTempoMasuk = useMemo(() => {
    const tempos = new Set(barangMasuk.map(item => item.tempo || 'CASH'));
    return Array.from(tempos).sort();
  }, [barangMasuk]);

  const availableTempoKeluar = useMemo(() => {
    const tempos = new Set(barangKeluar.map(item => item.tempo || 'CASH'));
    return Array.from(tempos).sort();
  }, [barangKeluar]);

  // Get unique ecommerce values from barang keluar
  const availableEcommerce = useMemo(() => {
    const ecoms = new Set(barangKeluar.map(item => item.ecommerce || 'OFFLINE'));
    return Array.from(ecoms).sort();
  }, [barangKeluar]);

  const availableSuppliers = useMemo(() => {
    const suppliers = new Set(barangMasuk.map(item => item.customer || 'Unknown'));
    return Array.from(suppliers).sort();
  }, [barangMasuk]);

  const availableCustomers = useMemo(() => {
    const customers = new Set(barangKeluar.map(item => item.customer || 'Unknown'));
    return Array.from(customers).sort();
  }, [barangKeluar]);

  const availablePartNumbersMasuk = useMemo(() => {
    const parts = new Set(barangMasuk.map(item => item.part_number).filter(Boolean));
    return Array.from(parts).sort();
  }, [barangMasuk]);

  const availablePartNumbersKeluar = useMemo(() => {
    const parts = new Set(barangKeluar.map(item => item.part_number).filter(Boolean));
    return Array.from(parts).sort();
  }, [barangKeluar]);

  const isFilterActive = (selected: string[], options: string[]) => {
    if (options.length === 0) return false;
    return selected.length > 0 && selected.length < options.length;
  };

  const shouldInclude = (value: string, selected: string[], options: string[]) => {
    if (!isFilterActive(selected, options)) return true;
    return selected.includes(value);
  };

  const summarizeFilterValues = (values: string[]) => {
    if (values.length <= 3) return values.join(', ');
    return `${values.slice(0, 3).join(', ')} +${values.length - 3}`;
  };

  const buildFilterInfo = () => {
    if (viewMode === 'masuk') {
      return [
        { label: 'Tempo', values: tempoFilterMasuk, options: availableTempoMasuk },
        { label: 'Supplier', values: supplierFilter, options: availableSuppliers },
        { label: 'Part Number', values: partNumberFilterMasuk, options: availablePartNumbersMasuk }
      ]
        .filter(f => isFilterActive(f.values, f.options))
        .map(f => `${f.label}: ${summarizeFilterValues(f.values)}`);
    }

    return [
      { label: 'Platform', values: ecommerceFilter, options: availableEcommerce },
      { label: 'Tempo', values: tempoFilterKeluar, options: availableTempoKeluar },
      { label: 'Customer', values: customerFilter, options: availableCustomers },
      { label: 'Part Number', values: partNumberFilterKeluar, options: availablePartNumbersKeluar }
    ]
      .filter(f => isFilterActive(f.values, f.options))
      .map(f => `${f.label}: ${summarizeFilterValues(f.values)}`);
  };

  const pruneFilterValues = (values: string[], options: string[]) => {
    if (values.length === 0) return values;
    const next = values.filter(v => options.includes(v));
    return next.length === values.length ? values : next;
  };

  useEffect(() => {
    setTempoFilterMasuk(prev => pruneFilterValues(prev, availableTempoMasuk));
  }, [availableTempoMasuk]);

  useEffect(() => {
    setTempoFilterKeluar(prev => pruneFilterValues(prev, availableTempoKeluar));
  }, [availableTempoKeluar]);

  useEffect(() => {
    setEcommerceFilter(prev => pruneFilterValues(prev, availableEcommerce));
  }, [availableEcommerce]);

  useEffect(() => {
    setSupplierFilter(prev => pruneFilterValues(prev, availableSuppliers));
  }, [availableSuppliers]);

  useEffect(() => {
    setCustomerFilter(prev => pruneFilterValues(prev, availableCustomers));
  }, [availableCustomers]);

  useEffect(() => {
    setPartNumberFilterMasuk(prev => pruneFilterValues(prev, availablePartNumbersMasuk));
  }, [availablePartNumbersMasuk]);

  useEffect(() => {
    setPartNumberFilterKeluar(prev => pruneFilterValues(prev, availablePartNumbersKeluar));
  }, [availablePartNumbersKeluar]);

  // Filtered data based on selected filters (exclude RETUR from closing)
  const filteredBarangMasuk = useMemo(() => {
    return barangMasuk.filter(item => {
      // Exclude RETUR items - check tempo field and keterangan field
      const tempo = (item.tempo || '').toUpperCase();
      const keterangan = ((item as any).keterangan || '').toUpperCase();
      if (tempo === 'RETUR' || tempo.includes('RETUR') || keterangan.includes('RETUR')) {
        return false;
      }

      const tempoValue = item.tempo || 'CASH';
      const supplierValue = item.customer || 'Unknown';
      const partNumberValue = item.part_number || '';

      if (!shouldInclude(tempoValue, tempoFilterMasuk, availableTempoMasuk)) return false;
      if (!shouldInclude(supplierValue, supplierFilter, availableSuppliers)) return false;
      if (!shouldInclude(partNumberValue, partNumberFilterMasuk, availablePartNumbersMasuk)) return false;

      return true;
    });
  }, [
    barangMasuk,
    tempoFilterMasuk,
    supplierFilter,
    partNumberFilterMasuk,
    availableTempoMasuk,
    availableSuppliers,
    availablePartNumbersMasuk
  ]);

  const filteredBarangKeluar = useMemo(() => {
    return barangKeluar.filter(item => {
      // Exclude RETUR items - check tempo field and ecommerce field
      const tempo = (item.tempo || '').toUpperCase();
      const ecommerce = (item.ecommerce || '').toUpperCase();
      if (tempo === 'RETUR' || tempo.includes('RETUR') || ecommerce === 'RETUR') {
        return false;
      }

      const tempoValue = item.tempo || 'CASH';
      const ecommerceValue = item.ecommerce || 'OFFLINE';
      const customerValue = item.customer || 'Unknown';
      const partNumberValue = item.part_number || '';

      if (!shouldInclude(tempoValue, tempoFilterKeluar, availableTempoKeluar)) return false;
      if (!shouldInclude(ecommerceValue, ecommerceFilter, availableEcommerce)) return false;
      if (!shouldInclude(customerValue, customerFilter, availableCustomers)) return false;
      if (!shouldInclude(partNumberValue, partNumberFilterKeluar, availablePartNumbersKeluar)) return false;

      return true;
    });
  }, [
    barangKeluar,
    tempoFilterKeluar,
    ecommerceFilter,
    customerFilter,
    partNumberFilterKeluar,
    availableTempoKeluar,
    availableEcommerce,
    availableCustomers,
    availablePartNumbersKeluar
  ]);

  // Toggle expand/collapse
  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Build Pivot Data for Barang Masuk: Date -> Tempo -> Supplier -> Items
  const pivotDataMasuk = useMemo(() => {
    const dateGroups: Map<string, PivotGroup> = new Map();

    filteredBarangMasuk.forEach(item => {
      const dateKey = item.created_at.split('T')[0];
      const tempo = item.tempo || 'CASH';
      const supplier = item.customer || 'Unknown';

      // Date level
      if (!dateGroups.has(dateKey)) {
        dateGroups.set(dateKey, {
          key: `date-${dateKey}`,
          label: formatDateDisplay(dateKey),
          level: 0,
          totalQty: 0,
          totalHarga: 0,
          isExpanded: true,
          children: [],
          items: []
        });
      }
      const dateGroup = dateGroups.get(dateKey)!;

      // Tempo level
      let tempoGroup = dateGroup.children.find(g => g.label === tempo);
      if (!tempoGroup) {
        tempoGroup = {
          key: `${dateKey}-tempo-${tempo}`,
          label: tempo,
          level: 1,
          totalQty: 0,
          totalHarga: 0,
          isExpanded: true,
          children: [],
          items: []
        };
        dateGroup.children.push(tempoGroup);
      }

      // Supplier level
      let supplierGroup = tempoGroup.children.find(g => g.label === supplier);
      if (!supplierGroup) {
        supplierGroup = {
          key: `${dateKey}-${tempo}-supplier-${supplier}`,
          label: supplier,
          level: 2,
          totalQty: 0,
          totalHarga: 0,
          isExpanded: true,
          children: [],
          items: []
        };
        tempoGroup.children.push(supplierGroup);
      }

      // Add item
      supplierGroup.items.push(item);
      supplierGroup.totalQty += item.qty_masuk || 0;
      supplierGroup.totalHarga += item.harga_total || 0;

      // Update parent totals
      tempoGroup.totalQty += item.qty_masuk || 0;
      tempoGroup.totalHarga += item.harga_total || 0;

      dateGroup.totalQty += item.qty_masuk || 0;
      dateGroup.totalHarga += item.harga_total || 0;
    });

    return Array.from(dateGroups.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredBarangMasuk]);

  // Build Pivot Data for Barang Keluar: Date -> Ecommerce -> Tempo -> Customer -> Items
  const pivotDataKeluar = useMemo(() => {
    const dateGroups: Map<string, PivotGroup> = new Map();

    filteredBarangKeluar.forEach(item => {
      const dateKey = item.created_at.split('T')[0];
      const ecommerce = item.ecommerce || 'OFFLINE';
      const tempo = item.tempo || 'CASH';
      const customer = item.customer || 'Unknown';

      // Date level
      if (!dateGroups.has(dateKey)) {
        dateGroups.set(dateKey, {
          key: `date-${dateKey}`,
          label: formatDateDisplay(dateKey),
          level: 0,
          totalQty: 0,
          totalHarga: 0,
          isExpanded: true,
          children: [],
          items: []
        });
      }
      const dateGroup = dateGroups.get(dateKey)!;

      // Ecommerce level
      let ecomGroup = dateGroup.children.find(g => g.label === ecommerce);
      if (!ecomGroup) {
        ecomGroup = {
          key: `${dateKey}-ecom-${ecommerce}`,
          label: ecommerce,
          level: 1,
          totalQty: 0,
          totalHarga: 0,
          isExpanded: true,
          children: [],
          items: []
        };
        dateGroup.children.push(ecomGroup);
      }

      // Tempo level
      let tempoGroup = ecomGroup.children.find(g => g.label === tempo);
      if (!tempoGroup) {
        tempoGroup = {
          key: `${dateKey}-${ecommerce}-tempo-${tempo}`,
          label: tempo,
          level: 2,
          totalQty: 0,
          totalHarga: 0,
          isExpanded: true,
          children: [],
          items: []
        };
        ecomGroup.children.push(tempoGroup);
      }

      // Customer level
      let customerGroup = tempoGroup.children.find(g => g.label === customer);
      if (!customerGroup) {
        customerGroup = {
          key: `${dateKey}-${ecommerce}-${tempo}-cust-${customer}`,
          label: customer,
          level: 3,
          totalQty: 0,
          totalHarga: 0,
          isExpanded: true,
          children: [],
          items: []
        };
        tempoGroup.children.push(customerGroup);
      }

      // Add item
      customerGroup.items.push(item);
      customerGroup.totalQty += item.qty_keluar || 0;
      customerGroup.totalHarga += item.harga_total || 0;

      // Update parent totals
      tempoGroup.totalQty += item.qty_keluar || 0;
      tempoGroup.totalHarga += item.harga_total || 0;

      ecomGroup.totalQty += item.qty_keluar || 0;
      ecomGroup.totalHarga += item.harga_total || 0;

      dateGroup.totalQty += item.qty_keluar || 0;
      dateGroup.totalHarga += item.harga_total || 0;
    });

    return Array.from(dateGroups.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredBarangKeluar]);

  // Grand totals (based on filtered data)
  const grandTotalMasuk = useMemo(() => {
    return {
      qty: filteredBarangMasuk.reduce((sum, item) => sum + (item.qty_masuk || 0), 0),
      harga: filteredBarangMasuk.reduce((sum, item) => sum + (item.harga_total || 0), 0)
    };
  }, [filteredBarangMasuk]);

  const grandTotalKeluar = useMemo(() => {
    return {
      qty: filteredBarangKeluar.reduce((sum, item) => sum + (item.qty_keluar || 0), 0),
      harga: filteredBarangKeluar.reduce((sum, item) => sum + (item.harga_total || 0), 0)
    };
  }, [filteredBarangKeluar]);

  // Expand all groups
  const expandAll = () => {
    const allKeys = new Set<string>();
    if (viewMode === 'masuk') {
      pivotDataMasuk.forEach(dateGroup => {
        allKeys.add(dateGroup.key);
        dateGroup.children.forEach(tempoGroup => {
          allKeys.add(tempoGroup.key);
          tempoGroup.children.forEach(supplierGroup => {
            allKeys.add(supplierGroup.key);
          });
        });
      });
    } else {
      pivotDataKeluar.forEach(dateGroup => {
        allKeys.add(dateGroup.key);
        dateGroup.children.forEach(ecomGroup => {
          allKeys.add(ecomGroup.key);
          ecomGroup.children.forEach(tempoGroup => {
            allKeys.add(tempoGroup.key);
            tempoGroup.children.forEach(customerGroup => {
              allKeys.add(customerGroup.key);
            });
          });
        });
      });
    }
    setExpandedKeys(allKeys);
  };

  // Collapse all groups
  const collapseAll = () => {
    setExpandedKeys(new Set());
  };

  // Reference to table element for export
  const tableRef = useRef<HTMLTableElement>(null);

  // Export table to PNG - same style as PDF
  const exportToPNG = async () => {
    if (!tableRef.current) return;
    
    try {
      // Expand all before export
      expandAll();
      
      // Wait for DOM update
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const title = viewMode === 'masuk' ? 'Laporan Barang Masuk' : 'Laporan Barang Keluar';
      const period = `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`;
      const store = selectedStore?.toUpperCase() || 'ALL';
      const filterInfo = buildFilterInfo();
      const filterText = filterInfo.length > 0 ? ` | Filter: ${filterInfo.join(', ')}` : '';
      const grandTotal = viewMode === 'masuk' ? grandTotalMasuk : grandTotalKeluar;
      const totalItems = viewMode === 'masuk' ? filteredBarangMasuk.length : filteredBarangKeluar.length;
      const accentColor = viewMode === 'masuk' ? '#059669' : '#dc2626';
      const accentBg = viewMode === 'masuk' ? '#ecfdf5' : '#fef2f2';
      const accentBorder = viewMode === 'masuk' ? '#10b981' : '#ef4444';

      // Create a temporary container
      const container = document.createElement('div');
      container.style.cssText = `
        position: absolute;
        left: -9999px;
        top: 0;
        background: #0b1220;
        padding: 18px;
        min-width: 1200px;
        font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
        font-size: 12px;
        line-height: 1.35;
        color: #e5e7eb;
      `;

      // Add header
      const header = document.createElement('div');
      header.innerHTML = `
        <div style="background:#1f2937;border:1px solid #334155;border-radius:12px;padding:14px 16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;">
            <div style="font-size:16px;font-weight:700;color:#f8fafc;">
              ${title}
              <span style="font-size:12px;font-weight:500;color:#93c5fd;"> (${period})</span>
            </div>
          </div>
          ${filterText ? `<div style="margin-top:6px;font-size:11px;color:#94a3b8;">${filterText.replace(' | ', '')}</div>` : ''}
        </div>
      `;
      container.appendChild(header);

      // Clone and style the table
      const tableClone = tableRef.current.cloneNode(true) as HTMLTableElement;
      tableClone.style.cssText = `
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        background: #1f2937;
        color: #e5e7eb;
        border-radius: 12px;
        overflow: hidden;
      `;

      // Style all cells - black text
      const allCells = tableClone.querySelectorAll('th, td');
      allCells.forEach((cell: Element) => {
        const el = cell as HTMLElement;
        el.style.padding = '8px 10px';
        el.style.borderBottom = '1px solid #2f3b4e';
        el.style.color = '#e5e7eb';
        el.style.verticalAlign = 'middle';
        el.style.fontVariantNumeric = 'tabular-nums';
      });

      // Style header cells
      const headerCells = tableClone.querySelectorAll('th');
      headerCells.forEach((cell: Element) => {
        const el = cell as HTMLElement;
        el.style.background = '#374151';
        el.style.color = '#e5e7eb';
        el.style.fontWeight = '700';
        el.style.fontSize = '11px';
        el.style.textTransform = 'uppercase';
        el.style.letterSpacing = '0.05em';
        el.style.padding = '10px';
        el.style.borderBottom = '1px solid #4b5563';
      });

      // Style row backgrounds and indentation to mimic sheet pivot
      const rows = tableClone.querySelectorAll('tbody tr');
      let rowIndex = 0;
      rows.forEach((row: Element) => {
        const el = row as HTMLElement;
        const className = el.className;
        
        // Level-based background colors
        if (className.includes('bg-blue-900')) {
          el.style.background = '#1f2a44'; // Date level
        } else if (className.includes('bg-purple-900')) {
          el.style.background = '#2b2446'; // Tempo level
        } else if (className.includes('bg-gray-700/20')) {
          el.style.background = '#2a3443'; // Subtotal
        } else if (className.includes('bg-gray-700')) {
          el.style.background = '#263241'; // Supplier/Customer level
        } else if (className.includes('bg-gray-800')) {
          el.style.background = rowIndex % 2 === 0 ? '#1f2a3a' : '#202b3b';
          rowIndex++;
        } else if (className.includes('bg-green-900')) {
          el.style.background = '#1f2937'; // Grand total
          el.style.borderTop = '2px solid #10b981';
        } else if (className.includes('bg-red-900')) {
          el.style.background = '#1f2937'; // Grand total
          el.style.borderTop = '2px solid #10b981';
        }

        // Style SVG chevrons like UI
        const svgs = el.querySelectorAll('svg');
        svgs.forEach(svg => {
          const svgEl = svg as HTMLElement;
          svgEl.style.color = '#94a3b8';
          svgEl.style.width = '14px';
          svgEl.style.height = '14px';
        });

        // Style text colors per level to match dark pivot UI
        const cells = el.querySelectorAll('td');
        const isGroupRow = className.includes('bg-blue-900') || className.includes('bg-purple-900') || className.includes('bg-gray-700') || className.includes('bg-gray-700/20');
        const isGrandTotal = className.includes('bg-green-900') || className.includes('bg-red-900');
        cells.forEach((cell: Element) => {
          const cellEl = cell as HTMLElement;
          const cellClass = cellEl.className;
          cellEl.style.color = '#e5e7eb';
          cellEl.style.fontWeight = isGrandTotal ? '700' : isGroupRow ? '600' : '400';
          cellEl.style.fontSize = '12px';
          cellEl.style.lineHeight = '1.35';
          if (isGroupRow || isGrandTotal) {
            cellEl.style.paddingTop = '10px';
            cellEl.style.paddingBottom = '10px';
          } else if (className.includes('bg-gray-800')) {
            cellEl.style.paddingTop = '8px';
            cellEl.style.paddingBottom = '8px';
          }
          
          // Only make total values bold
          if (cellClass.includes('font-bold') || cellClass.includes('text-green') || cellClass.includes('text-red') || cellClass.includes('text-amber')) {
            cellEl.style.fontWeight = '700';
          }

          // Ensure typography consistency for nested elements
          const descendants = cellEl.querySelectorAll('*');
          descendants.forEach(desc => {
            (desc as HTMLElement).style.fontFamily = "'Inter', 'Segoe UI', Arial, sans-serif";
            (desc as HTMLElement).style.fontSize = '12px';
          });
        });

        if (cells.length >= 3) {
          const firstCell = cells[0] as HTMLElement;
          const qtyCell = cells[1] as HTMLElement;
          const totalCell = cells[2] as HTMLElement;

          if (className.includes('bg-blue-900')) {
            firstCell.style.color = '#7dd3fc';
            qtyCell.style.color = '#e5e7eb';
            totalCell.style.color = '#4ade80';
          } else if (className.includes('bg-purple-900')) {
            firstCell.style.color = '#c084fc';
            qtyCell.style.color = '#e5e7eb';
            totalCell.style.color = '#4ade80';
          } else if (className.includes('bg-gray-700')) {
            firstCell.style.color = '#f8fafc';
            qtyCell.style.color = '#e5e7eb';
            totalCell.style.color = '#4ade80';
          } else if (className.includes('bg-gray-700/20')) {
            firstCell.style.color = '#cbd5f5';
            qtyCell.style.color = '#e5e7eb';
            totalCell.style.color = '#facc15';
          } else if (className.includes('bg-gray-800')) {
            firstCell.style.color = '#e5e7eb';
            qtyCell.style.color = '#cbd5f5';
            totalCell.style.color = '#cbd5f5';

            const partNumberSpan = firstCell.querySelector('span');
            if (partNumberSpan) {
              (partNumberSpan as HTMLElement).style.color = '#60a5fa';
            }
          } else if (className.includes('bg-green-900') || className.includes('bg-red-900')) {
            firstCell.style.color = '#f8fafc';
            qtyCell.style.color = '#e5e7eb';
            totalCell.style.color = '#4ade80';
          }
        }

        // Apply indentation for hierarchy (pivot-like spacing)
        const firstCell = el.querySelector('td') as HTMLElement | null;
        if (firstCell) {
          let indent = 12;
          if (className.includes('bg-blue-900')) {
            indent = 12; // Date
          } else if (className.includes('bg-purple-900')) {
            indent = 32; // Tempo
          } else if (className.includes('bg-gray-700')) {
            indent = 56; // Supplier/Customer
          } else if (className.includes('bg-gray-700/20')) {
            indent = 56; // Subtotal
          } else if (className.includes('bg-gray-800')) {
            indent = 80; // Item rows
          }
          firstCell.style.paddingLeft = `${indent}px`;
        }
      });

      // Add footer
      const footer = document.createElement('div');
      footer.innerHTML = `
        <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #273244; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8;">
          <span>Dicetak: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</span>
          <span>Gudang ${store}</span>
        </div>
      `;

      container.appendChild(tableClone);
      container.appendChild(footer);
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: '#0b1220',
        logging: false,
        useCORS: true
      });

      document.body.removeChild(container);
      
      const link = document.createElement('a');
      link.download = `closing-${viewMode}-${startDate}-to-${endDate}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (error) {
      console.error('Failed to export PNG:', error);
    }
  };

  // Export table to PDF using HTML5 print - Compact version
  const exportToPDF = () => {
    if (!tableRef.current) return;
    
    // Expand all before export
    expandAll();
    
    // Wait for DOM update then print
    setTimeout(() => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Popup blocked! Please allow popups for this site.');
        return;
      }

      const tableHTML = tableRef.current?.outerHTML || '';
      const title = viewMode === 'masuk' ? 'Laporan Barang Masuk' : 'Laporan Barang Keluar';
      const period = `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`;
      const store = selectedStore?.toUpperCase() || 'ALL';
      const filterInfo = buildFilterInfo();
      const filterText = filterInfo.length > 0 ? ` | Filter: ${filterInfo.join(', ')}` : '';
      const totalItems = viewMode === 'masuk' ? filteredBarangMasuk.length : filteredBarangKeluar.length;
      const grandTotal = viewMode === 'masuk' ? grandTotalMasuk : grandTotalKeluar;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${title} - ${period}</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 8mm;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: Arial, Helvetica, sans-serif;
              background: white;
              color: #1f2937;
              font-size: 9px;
              line-height: 1.2;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 8px;
              padding-bottom: 6px;
              border-bottom: 2px solid #3b82f6;
            }
            .header-left h1 { 
              font-size: 16px; 
              color: #1e40af; 
              margin-bottom: 2px; 
              font-weight: bold; 
            }
            .header-left p { font-size: 9px; color: #6b7280; }
            .header-right {
              text-align: right;
              background: ${viewMode === 'masuk' ? '#ecfdf5' : '#fef2f2'};
              padding: 6px 12px;
              border-radius: 6px;
              border: 1px solid ${viewMode === 'masuk' ? '#10b981' : '#ef4444'};
            }
            .header-right .label { font-size: 8px; color: #6b7280; }
            .header-right .value { 
              font-size: 14px; 
              font-weight: bold; 
              color: ${viewMode === 'masuk' ? '#059669' : '#dc2626'}; 
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              font-size: 8px;
              background: white;
            }
            th { 
              background: #1e40af; 
              color: white;
              padding: 5px 4px;
              text-align: left;
              font-weight: 600;
              text-transform: uppercase;
              font-size: 7px;
              letter-spacing: 0.03em;
              position: sticky;
              top: 0;
            }
            th:nth-child(2), th:nth-child(3) { text-align: right; }
            td { 
              padding: 3px 4px; 
              border-bottom: 1px solid #e5e7eb;
              color: #1f2937;
              vertical-align: middle;
            }
            tr:nth-child(even) { background: #f9fafb; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .font-semibold { font-weight: 600; }
            .font-mono { font-family: 'Courier New', monospace; font-size: 7px; }
            
            /* All text black */
            td { color: #000000 !important; }
            
            /* Level-based styling with border accents */
            [class*="bg-blue-900"] { 
              background: #bfdbfe !important; 
              border-left: 4px solid #2563eb;
            }
            [class*="bg-purple-900"] { 
              background: #ddd6fe !important; 
              border-left: 4px solid #7c3aed;
            }
            [class*="bg-gray-700\\/20"] { 
              background: #fef3c7 !important; 
              border-left: 4px solid #f59e0b;
            }
            [class*="bg-gray-700"] { 
              background: #e5e7eb !important; 
              border-left: 4px solid #6b7280;
            }
            [class*="bg-gray-800"] { background: #ffffff !important; }
            
            /* Grand total rows */
            [class*="bg-green-900"] { 
              background: #bbf7d0 !important; 
              border-top: 3px solid #16a34a;
              border-left: 4px solid #16a34a;
            }
            [class*="bg-red-900"] { 
              background: #fecaca !important; 
              border-top: 3px solid #dc2626;
              border-left: 4px solid #dc2626;
            }
            
            /* Only bold for totals, no colored text */
            [class*="text-green"], [class*="text-red"], [class*="text-amber"] { 
              color: #000000 !important; 
              font-weight: bold; 
            }
            [class*="text-blue-300"], [class*="text-blue-400"], [class*="text-purple"] { 
              color: #000000 !important; 
            }
            
            /* Hide icons and chevrons in print */
            svg { display: none !important; }
            
            /* Make group headers more visible */
            .text-lg { font-size: 10px !important; font-weight: bold; }
            .text-base { font-size: 9px !important; }
            
            .footer {
              margin-top: 8px;
              padding-top: 6px;
              border-top: 1px solid #d1d5db;
              display: flex;
              justify-content: space-between;
              font-size: 8px;
              color: #374151;
            }
            
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .header { page-break-after: avoid; }
              tr { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-left">
              <h1>${title}</h1>
              <p>Periode: ${period} | Toko: ${store}${filterText}</p>
            </div>
            <div class="header-right">
              <div class="label">GRAND TOTAL</div>
              <div class="value">${formatCurrency(grandTotal.harga)}</div>
              <div class="label">${totalItems} item (${grandTotal.qty} qty)</div>
            </div>
          </div>
          ${tableHTML}
          <div class="footer">
            <span>Dicetak: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</span>
            <span>Gudang ${store}</span>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }, 100);
  };

  // Render pivot row recursively
  const renderPivotGroup = (group: PivotGroup, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedKeys.has(group.key);
    const hasChildren = group.children.length > 0;
    const hasItems = group.items.length > 0;
    const paddingLeft = depth * 24;

    // Get background color based on level
    const getBgColor = (level: number) => {
      switch(level) {
        case 0: return 'bg-blue-900/30';
        case 1: return 'bg-purple-900/20';
        case 2: return 'bg-gray-700/30';
        case 3: return 'bg-gray-800/50';
        default: return 'bg-gray-800';
      }
    };

    return (
      <React.Fragment key={group.key}>
        {/* Group Header Row */}
        <tr 
          className={`${getBgColor(group.level)} hover:bg-gray-700/50 cursor-pointer transition-colors border-b border-gray-700/50`}
          onClick={() => toggleExpand(group.key)}
        >
          <td className="px-4 py-3 text-base" style={{ paddingLeft: `${paddingLeft + 16}px` }}>
            <div className="flex items-center gap-2">
              {(hasChildren || hasItems) ? (
                isExpanded ? (
                  <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
                )
              ) : (
                <Minus size={18} className="text-gray-600 flex-shrink-0" />
              )}
              <span className={`font-semibold text-base ${group.level === 0 ? 'text-blue-300 text-lg' : group.level === 1 ? 'text-purple-300' : 'text-gray-200'}`}>
                {group.label}
              </span>
              {group.level > 0 && (
                <span className="text-sm text-gray-500 ml-2">
                  ({hasItems ? group.items.length : group.children.reduce((sum, c) => sum + c.items.length + c.children.reduce((s, cc) => s + cc.items.length, 0), 0)} item)
                </span>
              )}
            </div>
          </td>
          <td className="px-4 py-3 text-base text-right text-gray-300 font-medium">
            {group.totalQty}
          </td>
          <td className="px-4 py-3 text-base text-right font-bold text-green-400">
            {formatCurrency(group.totalHarga)}
          </td>
        </tr>

        {/* Render Children or Items when expanded */}
        {isExpanded && (
          <>
            {/* Render child groups */}
            {group.children.map(child => renderPivotGroup(child, depth + 1))}
            
            {/* Render items */}
            {hasItems && group.items.map((item, idx) => (
              <tr key={`${group.key}-item-${idx}`} className="bg-gray-800 hover:bg-gray-750 border-b border-gray-800/50">
                <td className="px-4 py-2 text-sm" style={{ paddingLeft: `${paddingLeft + 48}px` }}>
                  <div className="text-gray-300">
                    <span className="text-blue-400 font-mono mr-2">{item.part_number}</span>
                    <span>{item.name || item.nama_barang}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-sm text-right text-gray-400">
                  {viewMode === 'masuk' ? item.qty_masuk : item.qty_keluar}
                </td>
                <td className="px-4 py-2 text-sm text-right text-gray-400">
                  {formatCurrency(item.harga_total || 0)}
                </td>
              </tr>
            ))}

            {/* Subtotal row for groups with items */}
            {hasItems && (
              <tr className="bg-gray-700/20 border-b border-gray-700">
                <td className="px-4 py-2 text-sm font-semibold text-gray-400" style={{ paddingLeft: `${paddingLeft + 48}px` }}>
                  {group.label} Total
                </td>
                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-300">
                  {group.totalQty}
                </td>
                <td className="px-4 py-2 text-sm text-right font-bold text-amber-400">
                  {formatCurrency(group.totalHarga)}
                </td>
              </tr>
            )}
          </>
        )}
      </React.Fragment>
    );
  };

  const activeFilters = viewMode === 'masuk'
    ? [
        { label: 'Tempo', values: tempoFilterMasuk, options: availableTempoMasuk, onClear: () => setTempoFilterMasuk([]) },
        { label: 'Supplier', values: supplierFilter, options: availableSuppliers, onClear: () => setSupplierFilter([]) },
        { label: 'Part Number', values: partNumberFilterMasuk, options: availablePartNumbersMasuk, onClear: () => setPartNumberFilterMasuk([]) }
      ]
    : [
        { label: 'Platform', values: ecommerceFilter, options: availableEcommerce, onClear: () => setEcommerceFilter([]) },
        { label: 'Tempo', values: tempoFilterKeluar, options: availableTempoKeluar, onClear: () => setTempoFilterKeluar([]) },
        { label: 'Customer', values: customerFilter, options: availableCustomers, onClear: () => setCustomerFilter([]) },
        { label: 'Part Number', values: partNumberFilterKeluar, options: availablePartNumbersKeluar, onClear: () => setPartNumberFilterKeluar([]) }
      ];

  const hasActiveFilters = activeFilters.some(filter => isFilterActive(filter.values, filter.options));

  const resetCurrentFilters = () => {
    if (viewMode === 'masuk') {
      setTempoFilterMasuk([]);
      setSupplierFilter([]);
      setPartNumberFilterMasuk([]);
      return;
    }

    setEcommerceFilter([]);
    setTempoFilterKeluar([]);
    setCustomerFilter([]);
    setPartNumberFilterKeluar([]);
  };

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-blue-600/20 w-12 h-12 rounded-xl flex items-center justify-center">
              <Calendar size={24} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-100">Closing</h1>
              <p className="text-sm text-gray-400">Laporan barang masuk dan keluar (Pivot View)</p>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setViewMode('masuk')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                viewMode === 'masuk'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              <TrendingUp size={20} />
              <span>Barang Masuk</span>
            </button>
            <button
              onClick={() => setViewMode('keluar')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                viewMode === 'keluar'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              <TrendingDown size={20} />
              <span>Barang Keluar</span>
            </button>
          </div>

          {/* Date Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tanggal Mulai
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tanggal Selesai
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={loadData}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Search size={18} />
                <span>Cari</span>
              </button>
            </div>
          </div>
          {/* Pivot Filters */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Pivot Filters
            </label>
            <div className="flex flex-wrap gap-2">
              {viewMode === 'masuk' ? (
                <>
                  <PivotFilterDropdown
                    label="Tempo"
                    options={availableTempoMasuk}
                    selected={tempoFilterMasuk}
                    onChange={setTempoFilterMasuk}
                  />
                  <PivotFilterDropdown
                    label="Supplier"
                    options={availableSuppliers}
                    selected={supplierFilter}
                    onChange={setSupplierFilter}
                  />
                  <PivotFilterDropdown
                    label="Part Number"
                    options={availablePartNumbersMasuk}
                    selected={partNumberFilterMasuk}
                    onChange={setPartNumberFilterMasuk}
                  />
                </>
              ) : (
                <>
                  <PivotFilterDropdown
                    label="Platform"
                    options={availableEcommerce}
                    selected={ecommerceFilter}
                    onChange={setEcommerceFilter}
                  />
                  <PivotFilterDropdown
                    label="Tempo"
                    options={availableTempoKeluar}
                    selected={tempoFilterKeluar}
                    onChange={setTempoFilterKeluar}
                  />
                  <PivotFilterDropdown
                    label="Customer"
                    options={availableCustomers}
                    selected={customerFilter}
                    onChange={setCustomerFilter}
                  />
                  <PivotFilterDropdown
                    label="Part Number"
                    options={availablePartNumbersKeluar}
                    selected={partNumberFilterKeluar}
                    onChange={setPartNumberFilterKeluar}
                  />
                </>
              )}
            </div>
          </div>

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-sm text-gray-400">Filter aktif:</span>
              {activeFilters
                .filter(filter => isFilterActive(filter.values, filter.options))
                .map(filter => (
                  <span key={filter.label} className="px-3 py-1 bg-blue-600/30 text-blue-300 rounded-full text-sm flex items-center gap-1">
                    {filter.label}: {summarizeFilterValues(filter.values)}
                    <button
                      onClick={filter.onClear}
                      className="ml-1 hover:text-white"
                    >
                      x
                    </button>
                  </span>
                ))}
              <button
                onClick={resetCurrentFilters}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-gray-300 rounded-full text-sm transition-colors"
              >
                Reset Filter
              </button>
            </div>
          )}

          {/* Export Buttons */}
          <div className="flex gap-2">
            <button
              onClick={exportToPNG}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Download size={18} />
              <span>Export PNG</span>
            </button>
            <button
              onClick={exportToPDF}
              className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <FileDown size={18} />
              <span>Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
          {/* Expand/Collapse Controls */}
          <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800">
            <h2 className="text-lg font-bold text-gray-100">
              {viewMode === 'masuk' ? 'Laporan Barang Masuk' : 'Laporan Barang Keluar'}
              <span className="text-sm font-normal text-gray-400 ml-2">
                ({formatDateDisplay(startDate)} - {formatDateDisplay(endDate)})
              </span>
            </h2>
            <div className="flex gap-2">
              <button
                onClick={expandAll}
                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Collapse All
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block w-8 h-8 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin"></div>
              <p className="mt-4 text-gray-400">Memuat data...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table ref={tableRef} className="w-full" id="pivot-table">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">
                      {viewMode === 'masuk' ? 'Tanggal / Tempo / Supplier / Part Number' : 'Tanggal / Ecommerce / Tempo / Customer / Part Number'}
                    </th>
                    <th className="px-4 py-4 text-right text-sm font-semibold text-gray-300 uppercase tracking-wider w-28">
                      Qty
                    </th>
                    <th className="px-4 py-4 text-right text-sm font-semibold text-gray-300 uppercase tracking-wider w-48">
                      Total Harga
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {viewMode === 'masuk' ? (
                    pivotDataMasuk.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                          Tidak ada data untuk periode yang dipilih
                        </td>
                      </tr>
                    ) : (
                      <>
                        {pivotDataMasuk.map(group => renderPivotGroup(group, 0))}
                        {/* Grand Total */}
                        <tr className="bg-green-900/30 border-t-2 border-green-600">
                          <td className="px-4 py-4 text-base font-bold text-green-300">
                            Grand Total
                          </td>
                          <td className="px-4 py-4 text-base text-right font-bold text-green-300">
                            {grandTotalMasuk.qty}
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-green-400 text-xl">
                            {formatCurrency(grandTotalMasuk.harga)}
                          </td>
                        </tr>
                      </>
                    )
                  ) : (
                    pivotDataKeluar.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                          Tidak ada data untuk periode yang dipilih
                        </td>
                      </tr>
                    ) : (
                      <>
                        {pivotDataKeluar.map(group => renderPivotGroup(group, 0))}
                        {/* Grand Total */}
                        <tr className="bg-red-900/30 border-t-2 border-red-600">
                          <td className="px-4 py-4 text-base font-bold text-red-300">
                            Grand Total
                          </td>
                          <td className="px-4 py-4 text-base text-right font-bold text-red-300">
                            {grandTotalKeluar.qty}
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-red-400 text-xl">
                            {formatCurrency(grandTotalKeluar.harga)}
                          </td>
                        </tr>
                      </>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        {!loading && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-900/20 border border-green-700 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <TrendingUp className="text-green-400" size={24} />
                <h3 className="text-lg font-bold text-green-300">Total Barang Masuk</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-400">Total Item</p>
                  <p className="text-2xl font-bold text-green-400">{grandTotalMasuk.qty}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Total Nilai</p>
                  <p className="text-2xl font-bold text-green-400">{formatCurrency(grandTotalMasuk.harga)}</p>
                </div>
              </div>
            </div>

            <div className="bg-red-900/20 border border-red-700 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <TrendingDown className="text-red-400" size={24} />
                <h3 className="text-lg font-bold text-red-300">Total Barang Keluar</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-400">Total Item</p>
                  <p className="text-2xl font-bold text-red-400">{grandTotalKeluar.qty}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Total Nilai</p>
                  <p className="text-2xl font-bold text-red-400">{formatCurrency(grandTotalKeluar.harga)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .print\\:block {
            display: block !important;
          }
          .hidden.print\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
};

