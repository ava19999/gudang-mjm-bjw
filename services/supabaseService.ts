// FILE: services/supabaseService.ts
import { supabase } from './supabaseClient';
import { 
  InventoryItem, 
  InventoryFormData, 
  OfflineOrderRow,
  OnlineOrderRow,
  SoldItemRow,
  ReturRow
} from '../types';
import { getWIBDate } from '../utils/timezone';

// --- HELPER: NAMA TABEL ---
const getTableName = (store: string | null | undefined) => {
  if (store === 'mjm') return 'base_mjm';
  if (store === 'bjw') return 'base_bjw';
  console.warn(`Store tidak valid (${store}), menggunakan default base_mjm`);
  return 'base_mjm';
};

const getLogTableName = (baseName: 'barang_masuk' | 'barang_keluar', store: string | null | undefined) => {
  if (store === 'mjm') return `${baseName}_mjm`;
  if (store === 'bjw') return `${baseName}_bjw`;
  console.warn(`Store tidak valid (${store}), menggunakan default ${baseName}_mjm`);
  return `${baseName}_mjm`;
};

// --- HELPER: SAFE DATE PARSING ---
const parseDateToNumber = (dateVal: any): number => {
  if (!dateVal) return Date.now();
  if (typeof dateVal === 'number') return dateVal;
  const parsed = new Date(dateVal).getTime();
  return isNaN(parsed) ? Date.now() : parsed;
};

const toSafeNumber = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizePart = (value: string | null | undefined): string => {
  return (value || '').trim().toUpperCase();
};

const normalizeTempo = (value: string | null | undefined): string => {
  return (value || '').trim().toUpperCase();
};

const normalizeText = (value: string | null | undefined): string => {
  const v = (value || '').trim().toUpperCase();
  return v || 'UNKNOWN';
};

const INVENTORY_SELECT_COLUMNS = 'part_number,name,brand,application,shelf,quantity,created_at';
const FOTO_SELECT_COLUMNS = 'part_number,foto_1,foto_2,foto_3,foto_4,foto_5,foto_6,foto_7,foto_8,foto_9,foto_10';
// NOTE:
// Table barang_masuk_mjm/barang_masuk_bjw does not have columns `resi` and `kode_toko`.
// Keep this select list aligned with actual schema, otherwise Supabase returns 42703
// and riwayat/detail barang masuk becomes empty.
const BARANG_MASUK_LOG_SELECT_COLUMNS = 'id,created_at,part_number,nama_barang,qty_masuk,stok_akhir,harga_satuan,harga_total,customer,tempo,ecommerce';
const BARANG_KELUAR_LOG_SELECT_COLUMNS = 'id,created_at,part_number,name,qty_keluar,stock_ahir,harga_satuan,harga_total,customer,tempo,resi,ecommerce,kode_toko';
const SOLD_ITEM_SELECT_COLUMNS = 'id,created_at,kode_toko,tempo,ecommerce,customer,part_number,name,qty_keluar,harga_satuan,harga_total,resi';

const normalizePartForLookup = (pn: string | null | undefined): string =>
  (pn || '').trim().toUpperCase().replace(/\s+/g, ' ');

const photoRowCache = new Map<string, any | null>();
const PHOTO_ROW_CACHE_STORAGE_KEY = 'mjm_bjw_photo_row_cache_v1';
const PHOTO_ROW_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam
const PHOTO_ROW_CACHE_MAX_ENTRIES = 1200;
const SELL_PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit
const SELL_PRICE_MISS_TTL_MS = 60 * 1000; // 1 menit
const COST_PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit
const COST_PRICE_MISS_TTL_MS = 60 * 1000; // 1 menit
const sellPriceCache = new Map<string, { value: number; expiresAt: number }>();
const costPriceCache = new Map<string, { value: number; expiresAt: number }>();

interface PersistedPhotoCacheEntry {
  value: any | null;
  expiresAt: number;
  updatedAt: number;
}

let persistedPhotoCacheLoaded = false;
let persistedPhotoCache: Record<string, PersistedPhotoCacheEntry> = {};
let persistPhotoCacheTimer: ReturnType<typeof setTimeout> | null = null;

const normalizePhotoCacheKey = (partNumber: string | null | undefined): string =>
  String(partNumber || '').trim().toUpperCase();

const canUseLocalStorage = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
};

const prunePersistedPhotoCache = () => {
  const now = Date.now();
  const validEntries = Object.entries(persistedPhotoCache).filter(([, entry]) => entry.expiresAt > now);

  if (validEntries.length <= PHOTO_ROW_CACHE_MAX_ENTRIES) {
    persistedPhotoCache = Object.fromEntries(validEntries);
    return;
  }

  validEntries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  persistedPhotoCache = Object.fromEntries(validEntries.slice(0, PHOTO_ROW_CACHE_MAX_ENTRIES));
};

const loadPersistedPhotoCache = () => {
  if (persistedPhotoCacheLoaded) return;
  persistedPhotoCacheLoaded = true;

  if (!canUseLocalStorage()) return;

  try {
    const raw = window.localStorage.getItem(PHOTO_ROW_CACHE_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    const now = Date.now();
    const valid: Record<string, PersistedPhotoCacheEntry> = {};

    Object.entries(parsed).forEach(([key, value]) => {
      if (!key || !value || typeof value !== 'object') return;
      const entry = value as PersistedPhotoCacheEntry;
      if (!entry.expiresAt || entry.expiresAt <= now) return;
      valid[key] = entry;
      photoRowCache.set(key, entry.value ?? null);
    });

    persistedPhotoCache = valid;
  } catch (error) {
    console.warn('Gagal load cache foto produk:', error);
  }
};

const writePersistedPhotoCache = () => {
  if (!canUseLocalStorage()) return;

  prunePersistedPhotoCache();

  try {
    window.localStorage.setItem(PHOTO_ROW_CACHE_STORAGE_KEY, JSON.stringify(persistedPhotoCache));
  } catch (error) {
    // Jika quota penuh, kurangi cache jadi separuh lalu coba lagi.
    try {
      const entries = Object.entries(persistedPhotoCache)
        .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
        .slice(0, Math.max(100, Math.floor(PHOTO_ROW_CACHE_MAX_ENTRIES / 2)));
      persistedPhotoCache = Object.fromEntries(entries);
      window.localStorage.setItem(PHOTO_ROW_CACHE_STORAGE_KEY, JSON.stringify(persistedPhotoCache));
    } catch (retryError) {
      console.warn('Gagal simpan cache foto produk:', retryError);
    }
  }
};

const schedulePersistedPhotoCacheWrite = () => {
  if (!canUseLocalStorage()) return;
  if (persistPhotoCacheTimer) return;
  persistPhotoCacheTimer = setTimeout(() => {
    persistPhotoCacheTimer = null;
    writePersistedPhotoCache();
  }, 250);
};

const buildStorePartCacheKey = (store: string | null | undefined, partNumber: string): string => {
  const safeStore = String(store || 'all').trim().toLowerCase();
  const safePart = normalizePartForLookup(partNumber);
  return `${safeStore}::${safePart}`;
};

const getNumberCacheValue = (
  cache: Map<string, { value: number; expiresAt: number }>,
  key: string
): number | undefined => {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
};

const setNumberCacheValue = (
  cache: Map<string, { value: number; expiresAt: number }>,
  key: string,
  value: number,
  ttlMs: number
) => {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
};

const setPriceMapEntry = (
  target: Record<string, PriceData>,
  partNumber: string,
  harga: number
) => {
  const trimmed = String(partNumber || '').trim();
  if (!trimmed || !Number.isFinite(harga) || harga <= 0) return;
  target[trimmed] = { part_number: trimmed, harga };
  const normalized = normalizePartForLookup(trimmed);
  if (normalized && normalized !== trimmed) {
    target[normalized] = { part_number: normalized, harga };
  }
};

const setCostPriceMapEntry = (
  target: Record<string, CostPriceData>,
  partNumber: string,
  hargaSatuan: number
) => {
  const trimmed = String(partNumber || '').trim();
  if (!trimmed || !Number.isFinite(hargaSatuan) || hargaSatuan <= 0) return;
  target[trimmed] = { part_number: trimmed, harga_satuan: hargaSatuan };
  const normalized = normalizePartForLookup(trimmed);
  if (normalized && normalized !== trimmed) {
    target[normalized] = { part_number: normalized, harga_satuan: hargaSatuan };
  }
};

const hasPhotoRowCacheEntry = (partNumber: string | null | undefined): boolean => {
  const key = normalizePhotoCacheKey(partNumber);
  if (!key) return false;

  loadPersistedPhotoCache();

  if (photoRowCache.has(key)) return true;

  const entry = persistedPhotoCache[key];
  if (!entry) return false;

  if (entry.expiresAt <= Date.now()) {
    delete persistedPhotoCache[key];
    schedulePersistedPhotoCacheWrite();
    return false;
  }

  photoRowCache.set(key, entry.value ?? null);
  return true;
};

const getPhotoRowCacheEntry = (partNumber: string | null | undefined): any | null | undefined => {
  const key = normalizePhotoCacheKey(partNumber);
  if (!key) return undefined;

  if (!hasPhotoRowCacheEntry(key)) return undefined;
  return photoRowCache.get(key);
};

const setPhotoRowCacheEntry = (partNumber: string | null | undefined, value: any | null) => {
  const key = normalizePhotoCacheKey(partNumber);
  if (!key) return;

  loadPersistedPhotoCache();

  photoRowCache.set(key, value ?? null);
  persistedPhotoCache[key] = {
    value: value ?? null,
    expiresAt: Date.now() + PHOTO_ROW_CACHE_TTL_MS,
    updatedAt: Date.now()
  };

  schedulePersistedPhotoCacheWrite();
};

const fetchStockQtyMapByPartNumbers = async (
  stockTable: string,
  partNumbers: string[]
): Promise<Record<string, number>> => {
  const uniquePartNumbers = [...new Set((partNumbers || []).map(p => (p || '').toString().trim()).filter(Boolean))];
  if (uniquePartNumbers.length === 0) return {};

  const stockRows: Array<{ part_number: string; quantity: number }> = [];
  const { data: exactRows, error: exactError } = await supabase
    .from(stockTable)
    .select('part_number, quantity')
    .in('part_number', uniquePartNumbers);

  if (!exactError && exactRows) {
    stockRows.push(...(exactRows as Array<{ part_number: string; quantity: number }>));
  }

  const normalizedMatched = new Set(
    stockRows
      .map(row => normalizePartForLookup(row.part_number))
      .filter(Boolean)
  );

  const unresolved = uniquePartNumbers.filter(pn => !normalizedMatched.has(normalizePartForLookup(pn)));

  if (unresolved.length > 0 && unresolved.length <= 40) {
    const fallbackResults = await Promise.all(
      unresolved.map((pn) =>
        supabase
          .from(stockTable)
          .select('part_number, quantity')
          .ilike('part_number', pn)
          .limit(1)
      )
    );

    fallbackResults.forEach(({ data, error }) => {
      if (!error && data && data[0]) {
        stockRows.push(data[0] as { part_number: string; quantity: number });
      }
    });
  }

  const stockByNormalized = stockRows.reduce((acc, row) => {
    const original = (row.part_number || '').toString();
    const normalized = normalizePartForLookup(original);
    const qty = Number(row.quantity || 0);
    if (original) acc[original] = qty;
    if (normalized) acc[normalized] = qty;
    return acc;
  }, {} as Record<string, number>);

  return uniquePartNumbers.reduce((acc, pn) => {
    const normalized = normalizePartForLookup(pn);
    acc[pn] = stockByNormalized[pn] ?? stockByNormalized[normalized] ?? 0;
    return acc;
  }, {} as Record<string, number>);
};

const isReturMasuk = (row: { tempo?: string | null; customer?: string | null }): boolean => {
  const tempo = normalizeTempo(row.tempo);
  const customer = normalizeText(row.customer);
  if (tempo.includes('RETUR')) return true;
  if (customer.includes('RETUR')) return true;
  return false;
};

interface ModalMasukRow {
  part_number: string | null;
  harga_satuan: number | null;
  tempo: string | null;
  customer: string | null;
}

interface ModalKeluarRow {
  part_number: string | null;
  qty_keluar: number | null;
  harga_total: number | null;
  customer: string | null;
}

interface ModalBaseItemRow {
  part_number: string | null;
  name: string | null;
  quantity: number | null;
}

export type ModalSourceType = 'HARGA_TERENDAH_MASUK' | 'ESTIMASI_80PCT_AVG_JUAL' | 'TANPA_MODAL';

export interface AssetProfitDetailRow {
  partNumber: string;
  name: string;
  stockQty: number;
  soldQty: number;
  avgSellPrice: number;
  unitModal: number;
  modalSource: ModalSourceType;
  modalStock: number;
  salesTotal: number;
  hppSold: number;
  keuntungan: number;
}

export interface AssetProfitDetailsResult {
  rows: AssetProfitDetailRow[];
  totalItems: number;
  totalModalStock: number;
  totalSales: number;
  totalHppSold: number;
  totalProfit: number;
  estimasiModalItems: number;
  tanpaModalItems: number;
}

const fetchAllRowsForModal = async <T,>(
  table: string,
  select: string,
  orderColumn: string
): Promise<T[]> => {
  const pageSize = 1000;
  let from = 0;
  const rows: T[] = [];

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(`Gagal mengambil data ${table} untuk hitung modal:`, error);
      return rows;
    }

    const page = (data || []) as T[];
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};

const fetchAllRowsForModalFiltered = async <T,>(
  table: string,
  select: string,
  orderColumn: string,
  applyFilters: (query: any) => any,
  ascending: boolean = true
): Promise<T[]> => {
  const pageSize = 1000;
  let from = 0;
  const rows: T[] = [];

  while (true) {
    let query = supabase.from(table).select(select);
    query = applyFilters(query);

    const { data, error } = await query
      .order(orderColumn, { ascending })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(`Gagal mengambil data ${table} (filtered):`, error);
      return rows;
    }

    const page = (data || []) as T[];
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};

const fetchAllModalLogs = async (): Promise<{ masukRows: ModalMasukRow[]; keluarRows: ModalKeluarRow[] }> => {
  const [masukMjm, masukBjw, keluarMjm, keluarBjw] = await Promise.all([
    fetchAllRowsForModal<ModalMasukRow>(
      'barang_masuk_mjm',
      'part_number,harga_satuan,tempo,customer,created_at',
      'created_at'
    ),
    fetchAllRowsForModal<ModalMasukRow>(
      'barang_masuk_bjw',
      'part_number,harga_satuan,tempo,customer,created_at',
      'created_at'
    ),
    fetchAllRowsForModal<ModalKeluarRow>(
      'barang_keluar_mjm',
      'part_number,qty_keluar,harga_total,customer,created_at',
      'created_at'
    ),
    fetchAllRowsForModal<ModalKeluarRow>(
      'barang_keluar_bjw',
      'part_number,qty_keluar,harga_total,customer,created_at',
      'created_at'
    ),
  ]);

  return {
    masukRows: [...masukMjm, ...masukBjw],
    keluarRows: [...keluarMjm, ...keluarBjw],
  };
};

const isKeluarKeBjw = (customer: string | null | undefined): boolean => {
  const normalized = normalizeText(customer).replace(/[^A-Z0-9]/g, '');
  return normalized.includes('KELUARKEBJW');
};

const buildAssetProfitRows = (
  items: Array<{ part_number?: string | null; name?: string | null; quantity?: number | null }>,
  masukRows: ModalMasukRow[],
  keluarRows: ModalKeluarRow[]
): AssetProfitDetailRow[] => {
  if (!items || items.length === 0) return [];

  const minCostByPartExact = new Map<string, number>();

  for (const row of masukRows) {
    if (isReturMasuk(row)) continue;

    const part = normalizePart(row.part_number);
    if (!part) continue;

    const price = toSafeNumber(row.harga_satuan);
    if (price <= 0) continue;

    const exactPrev = minCostByPartExact.get(part);
    if (exactPrev === undefined || price < exactPrev) {
      minCostByPartExact.set(part, price);
    }
  }

  const salesByPart = new Map<string, { qty: number; total: number }>();
  for (const row of keluarRows) {
    if (isKeluarKeBjw(row.customer)) continue;

    const part = normalizePart(row.part_number);
    if (!part) continue;

    if (!salesByPart.has(part)) {
      salesByPart.set(part, { qty: 0, total: 0 });
    }

    const agg = salesByPart.get(part)!;
    agg.qty += toSafeNumber(row.qty_keluar);
    agg.total += toSafeNumber(row.harga_total);
  }

  return items
    .map((item) => {
      const part = normalizePart(item.part_number);
      const stockQty = toSafeNumber(item.quantity);
      const salesAgg = salesByPart.get(part) || { qty: 0, total: 0 };
      const avgSellPrice = salesAgg.qty > 0 ? salesAgg.total / salesAgg.qty : 0;

      // Sesuai database: modal diambil hanya dari part_number exact yang sama.
      const minCost = minCostByPartExact.get(part) || 0;

      let unitModal = 0;
      let modalSource: ModalSourceType = 'TANPA_MODAL';
      if (minCost > 0) {
        unitModal = minCost;
        modalSource = 'HARGA_TERENDAH_MASUK';
      } else if (avgSellPrice > 0) {
        unitModal = avgSellPrice * 0.8;
        modalSource = 'ESTIMASI_80PCT_AVG_JUAL';
      }

      const soldQty = salesAgg.qty;
      const salesTotal = salesAgg.total;
      const modalStock = stockQty * unitModal;
      const hppSold = soldQty * unitModal;
      const keuntungan = salesTotal - hppSold;

      return {
        partNumber: part,
        name: (item.name || '').trim(),
        stockQty,
        soldQty,
        avgSellPrice,
        unitModal,
        modalSource,
        modalStock,
        salesTotal,
        hppSold,
        keuntungan,
      };
    })
    .sort((a, b) => b.salesTotal - a.salesTotal);
};

const summarizeAssetProfitRows = (rows: AssetProfitDetailRow[]): AssetProfitDetailsResult => {
  return {
    rows,
    totalItems: rows.length,
    totalModalStock: rows.reduce((sum, row) => sum + row.modalStock, 0),
    totalSales: rows.reduce((sum, row) => sum + row.salesTotal, 0),
    totalHppSold: rows.reduce((sum, row) => sum + row.hppSold, 0),
    totalProfit: rows.reduce((sum, row) => sum + row.keuntungan, 0),
    estimasiModalItems: rows.filter((row) => row.modalSource === 'ESTIMASI_80PCT_AVG_JUAL').length,
    tanpaModalItems: rows.filter((row) => row.modalSource === 'TANPA_MODAL').length,
  };
};

const calculateModalStockTotal = async (items: Array<{ part_number?: string | null; quantity?: number | null }>): Promise<number> => {
  if (!items || items.length === 0) return 0;
  try {
    const { masukRows, keluarRows } = await fetchAllModalLogs();
    const rows = buildAssetProfitRows(items, masukRows, keluarRows);
    return rows.reduce((sum, row) => sum + row.modalStock, 0);
  } catch (err) {
    console.error('Gagal menghitung total modal stock:', err);
    return 0;
  }
};

export const fetchAssetProfitDetails = async (store: string | null): Promise<AssetProfitDetailsResult> => {
  const table = getTableName(store);

  try {
    const [baseItems, { masukRows, keluarRows }] = await Promise.all([
      fetchAllRowsForModal<ModalBaseItemRow>(table, 'part_number,name,quantity', 'part_number'),
      fetchAllModalLogs(),
    ]);

    const rows = buildAssetProfitRows(baseItems, masukRows, keluarRows);
    return summarizeAssetProfitRows(rows);
  } catch (err) {
    console.error('Gagal mengambil detail asset/profit:', err);
    return summarizeAssetProfitRows([]);
  }
};

// --- FETCH DISTINCT ECOMMERCE VALUES ---
export const fetchDistinctEcommerce = async (store: string | null): Promise<string[]> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return [];

  try {
    const rows = await fetchAllRowsForModalFiltered<{ ecommerce: string | null }>(
      table,
      'ecommerce',
      'created_at',
      (query) =>
        query
          .not('ecommerce', 'is', null)
          .not('ecommerce', 'eq', ''),
      false
    );

    const baseOptions = ['OFFLINE', 'TIKTOK', 'SHOPEE', 'RESELLER'];
    const normalizedOptions = rows
      .map((row) => (row.ecommerce || '').trim().toUpperCase())
      .filter((value) => value !== '')
      .map((value) => (value === 'SHOPPE' ? 'SHOPEE' : value));

    const uniqueValues = [...new Set([...baseOptions, ...normalizedOptions])];
    return uniqueValues.sort();
  } catch (err) {
    console.error('Fetch Distinct Ecommerce Exception:', err);
    return [];
  }
};

// --- FETCH DISTINCT SUPPLIERS (Customer dari Barang Masuk) ---
export const fetchDistinctSuppliers = async (store: string | null): Promise<string[]> => {
  const table = store === 'mjm' ? 'barang_masuk_mjm' : (store === 'bjw' ? 'barang_masuk_bjw' : null);
  if (!table) return [];

  try {
    const rows = await fetchAllRowsForModalFiltered<{ customer: string | null }>(
      table,
      'customer',
      'customer',
      (query) =>
        query
          .not('customer', 'is', null)
          .not('customer', 'eq', '')
          .not('customer', 'eq', '-')
          .not('customer', 'ilike', '%RETUR%'),
      true
    );

    // Get unique values and filter out empty/dash/retur
    const uniqueValues = [...new Set(
      rows
        .map(d => d.customer?.trim().toUpperCase())
        .filter((c): c is string => Boolean(c))
        .filter(c => c !== '-' && c !== '')
        .filter(c => !c.includes('RETUR'))
    )];
    return uniqueValues.sort();
  } catch (err) {
    console.error('Fetch Distinct Suppliers Exception:', err);
    return [];
  }
};

// --- FETCH DISTINCT CUSTOMERS (Customer dari Barang Keluar) ---
export const fetchDistinctCustomers = async (store: string | null): Promise<string[]> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return [];

  try {
    const rows = await fetchAllRowsForModalFiltered<{ customer: string | null }>(
      table,
      'customer',
      'customer',
      (query) =>
        query
          .not('customer', 'is', null)
          .not('customer', 'eq', '')
          .not('customer', 'eq', '-')
          .not('customer', 'ilike', '%RETUR%'),
      true
    );

    // Get unique values and filter out empty/dash/retur
    const uniqueValues = [...new Set(
      rows
        .map(d => d.customer?.trim().toUpperCase())
        .filter((c): c is string => Boolean(c))
        .filter(c => c !== '-' && c !== '')
        .filter(c => !c.includes('RETUR'))
    )];
    return uniqueValues.sort();
  } catch (err) {
    console.error('Fetch Distinct Customers Exception:', err);
    return [];
  }
};

// --- FETCH SEARCH SUGGESTIONS (untuk dropdown autocomplete) ---
export const fetchSearchSuggestions = async (
  store: string | null,
  field: 'part_number' | 'name' | 'brand' | 'application',
  searchQuery: string
): Promise<string[]> => {
  const table = getTableName(store);
  if (!searchQuery || searchQuery.length < 1) return [];

  try {
    const { data, error } = await supabase
      .from(table)
      .select(field)
      .ilike(field, `%${searchQuery}%`)
      .not(field, 'is', null)
      .not(field, 'eq', '')
      .limit(50);

    if (error) {
      console.error(`Fetch ${field} Suggestions Error:`, error);
      return [];
    }

    // Get unique values
    const uniqueValues = [...new Set(
      (data || [])
        .map((d: any) => d[field]?.toString().trim())
        .filter(Boolean)
    )];
    return uniqueValues.sort().slice(0, 20);
  } catch (err) {
    console.error(`Fetch ${field} Suggestions Exception:`, err);
    return [];
  }
};

// --- FETCH ALL DISTINCT VALUES (untuk initial load) ---
export const fetchAllDistinctValues = async (
  store: string | null,
  field: 'part_number' | 'name' | 'brand' | 'application'
): Promise<string[]> => {
  const table = getTableName(store);

  try {
    const { data, error } = await supabase
      .from(table)
      .select(field)
      .not(field, 'is', null)
      .not(field, 'eq', '');

    if (error) {
      console.error(`Fetch All ${field} Error:`, error);
      return [];
    }

    // Get unique values
    const uniqueValues = [...new Set(
      (data || [])
        .map((d: any) => d[field]?.toString().trim())
        .filter(Boolean)
    )];
    return uniqueValues.sort();
  } catch (err) {
    console.error(`Fetch All ${field} Exception:`, err);
    return [];
  }
};

// --- FETCH INVENTORY BY PART NUMBER (untuk quick search) ---
export const fetchInventoryByPartNumber = async (
  store: string | null,
  searchValue: string
): Promise<InventoryItem | null> => {
  const table = getTableName(store);
  if (!searchValue) return null;

  try {
    // First try exact match on part_number
    let { data, error } = await supabase
      .from(table)
      .select(INVENTORY_SELECT_COLUMNS)
      .ilike('part_number', searchValue)
      .limit(1)
      .single();

    // If not found, try searching by name
    if (error || !data) {
      const { data: nameData, error: nameError } = await supabase
        .from(table)
        .select(INVENTORY_SELECT_COLUMNS)
        .ilike('name', `%${searchValue}%`)
        .limit(1)
        .single();

      if (nameError || !nameData) {
        return null;
      }
      data = nameData;
    }

    // Fetch photo (pakai cache jika ada)
    const partNumber = data.part_number;
    const cachedPhoto = getPhotoRowCacheEntry(partNumber);
    if (cachedPhoto !== undefined) {
      return mapItemFromDB(data, cachedPhoto || undefined);
    }

    const { data: photoData } = await supabase
      .from('foto')
      .select(FOTO_SELECT_COLUMNS)
      .eq('part_number', partNumber)
      .maybeSingle();

    setPhotoRowCacheEntry(partNumber, photoData || null);

    return mapItemFromDB(data, photoData);
  } catch (err) {
    console.error('Fetch Inventory By Part Number Exception:', err);
    return null;
  }
};

// --- HELPER: MAPPING FOTO ---
const mapPhotoRowToImages = (photoRow: any): string[] => {
  if (!photoRow) return [];
  const images: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const url = photoRow[`foto_${i}`];
    if (url && typeof url === 'string' && url.trim() !== '') images.push(url);
  }
  return images;
};

const mapImagesToPhotoRow = (partNumber: string, images: string[]) => {
  const row: any = { part_number: partNumber };
  for (let i = 1; i <= 10; i++) row[`foto_${i}`] = null;
  images.forEach((url, index) => {
    if (index < 10) row[`foto_${index + 1}`] = url;
  });
  return row;
};

// --- HELPER: MAPPING DATA ITEM ---
const mapItemFromDB = (item: any, photoData?: any): InventoryItem => {
  const pk = item.part_number || item.partNumber || '';
  
  const imagesFromTable = photoData ? mapPhotoRowToImages(photoData) : [];
  const finalImages = imagesFromTable;

  return {
    ...item,
    id: pk, 
    partNumber: pk,
    name: item.name,
    // No swap needed - brand is brand, application is application
    brand: item.brand,
    application: item.application,
    shelf: item.shelf,
    quantity: Number(item.quantity || 0),
    price: 0, 
    costPrice: 0, 
    imageUrl: finalImages[0] || '',
    images: finalImages,
    ecommerce: '', 
    initialStock: 0, 
    qtyIn: 0, 
    qtyOut: 0,
    lastUpdated: parseDateToNumber(item.created_at || item.last_updated) 
  };
};

const mapItemToDB = (data: any) => {
  const dbPayload: any = {
    part_number: data.partNumber || data.part_number, 
    name: data.name,
    // No swap needed - brand is brand, application is application
    brand: data.brand,
    application: data.application,
    shelf: data.shelf,
    quantity: Number(data.quantity) || 0,
    created_at: getWIBDate().toISOString()
  };
  Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);
  return dbPayload;
};

// --- HELPER: FETCH HARGA & FOTO ---
interface PriceData { part_number: string; harga: number; }
interface CostPriceData { part_number: string; harga_satuan: number; }

// Fetch harga modal terakhir dari barang_masuk
const fetchLatestCostPricesForItems = async (items: any[], store?: string | null): Promise<Record<string, CostPriceData>> => {
  if (!items || items.length === 0) return {};
  const partNumbersToCheck = [...new Set(
    items
      .map(i => {
        const pn = i.part_number || i.partNumber;
        return typeof pn === 'string' ? pn.trim() : '';
      })
      .filter(Boolean)
  )];
  if (partNumbersToCheck.length === 0) return {};

  const costPriceMap: Record<string, CostPriceData> = {};
  const missingPartNumbers: string[] = [];

  partNumbersToCheck.forEach((pn) => {
    const cacheKey = buildStorePartCacheKey(store, pn);
    const cached = getNumberCacheValue(costPriceCache, cacheKey);
    if (cached !== undefined) {
      setCostPriceMapEntry(costPriceMap, pn, cached);
      return;
    }
    missingPartNumbers.push(pn);
  });

  if (missingPartNumbers.length === 0) return costPriceMap;

  const logTable = getLogTableName('barang_masuk', store);
  
  try {
    // Ambil semua barang masuk untuk part numbers yang belum ada di cache.
    const { data, error } = await supabase
      .from(logTable)
      .select('part_number, harga_satuan, created_at')
      .in('part_number', missingPartNumbers)
      .not('harga_satuan', 'is', null)
      .gt('harga_satuan', 0)
      .order('created_at', { ascending: false });
    
    if (error) return costPriceMap;

    const resolvedNorm = new Set<string>();
    (data || []).forEach((row: any) => {
      const pk = (row.part_number || '').trim();
      if (!pk) return;
      const norm = normalizePartForLookup(pk);
      if (resolvedNorm.has(norm)) return;

      const harga = Number(row.harga_satuan || 0);
      resolvedNorm.add(norm);
      if (harga > 0) {
        setNumberCacheValue(costPriceCache, buildStorePartCacheKey(store, pk), harga, COST_PRICE_CACHE_TTL_MS);
        setCostPriceMapEntry(costPriceMap, pk, harga);
      }
    });

    missingPartNumbers.forEach((pn) => {
      const norm = normalizePartForLookup(pn);
      if (!resolvedNorm.has(norm)) {
        setNumberCacheValue(costPriceCache, buildStorePartCacheKey(store, pn), 0, COST_PRICE_MISS_TTL_MS);
      }
    });

    return costPriceMap;
  } catch (e) { return costPriceMap; }
};

// Fetch harga jual dari list_harga_jual, fallback ke barang_keluar jika 0
const fetchLatestPricesForItems = async (items: any[], store?: string | null): Promise<Record<string, PriceData>> => {
  if (!items || items.length === 0) return {};
  const partNumbersToCheck = [...new Set(
    items
      .map(i => {
        const pn = i.part_number || i.partNumber;
        return typeof pn === 'string' ? pn.trim() : '';
      })
      .filter(Boolean)
  )];
  if (partNumbersToCheck.length === 0) return {};

  const priceMap: Record<string, PriceData> = {};
  const missingPartNumbers: string[] = [];
  const originalByNorm = new Map<string, string>();

  partNumbersToCheck.forEach((pn) => {
    const norm = normalizePartForLookup(pn);
    if (!originalByNorm.has(norm)) originalByNorm.set(norm, pn);

    const cacheKey = buildStorePartCacheKey(store, pn);
    const cached = getNumberCacheValue(sellPriceCache, cacheKey);
    if (cached !== undefined) {
      if (cached > 0) setPriceMapEntry(priceMap, pn, cached);
      return;
    }
    missingPartNumbers.push(pn);
  });

  if (missingPartNumbers.length === 0) return priceMap;

  try {
    // 1. Ambil harga dari list_harga_jual untuk part number yang belum ada cache.
    const { data, error } = await supabase
      .from('list_harga_jual')
      .select('part_number, harga')
      .in('part_number', missingPartNumbers);
    if (error) return priceMap;

    const unresolvedNorms = new Set(missingPartNumbers.map((pn) => normalizePartForLookup(pn)));
    
    (data || []).forEach((row: any) => {
      if (row.part_number) {
        const pk = row.part_number.trim();
        const harga = Number(row.harga || 0);
        const norm = normalizePartForLookup(pk);

        if (harga > 0) {
          setNumberCacheValue(sellPriceCache, buildStorePartCacheKey(store, pk), harga, SELL_PRICE_CACHE_TTL_MS);
          setPriceMapEntry(priceMap, pk, harga);
          unresolvedNorms.delete(norm);
        } else {
          setNumberCacheValue(sellPriceCache, buildStorePartCacheKey(store, pk), 0, SELL_PRICE_MISS_TTL_MS);
          unresolvedNorms.add(norm);
        }
      }
    });

    // 2. Jika harga masih 0 / belum ada, cari dari barang_keluar (harga terakhir laku)
    if (unresolvedNorms.size > 0) {
      const unresolvedParts = Array.from(unresolvedNorms)
        .map((norm) => originalByNorm.get(norm) || norm)
        .filter(Boolean);

      const outTable = getLogTableName('barang_keluar', store);
      const { data: outData } = await supabase
        .from(outTable)
        .select('part_number, harga_satuan, created_at')
        .in('part_number', unresolvedParts)
        .not('harga_satuan', 'is', null)
        .gt('harga_satuan', 0)
        .order('created_at', { ascending: false });
      
      const outPriceMapByNorm: Record<string, number> = {};
      (outData || []).forEach((row: any) => {
        const pk = (row.part_number || '').trim();
        const norm = normalizePartForLookup(pk);
        if (pk && !outPriceMapByNorm[norm]) {
          outPriceMapByNorm[norm] = Number(row.harga_satuan || 0);
        }
      });

      unresolvedNorms.forEach((norm) => {
        const fallbackHarga = Number(outPriceMapByNorm[norm] || 0);
        const originalPn = originalByNorm.get(norm) || norm;
        if (fallbackHarga > 0) {
          setNumberCacheValue(sellPriceCache, buildStorePartCacheKey(store, originalPn), fallbackHarga, SELL_PRICE_CACHE_TTL_MS);
          setPriceMapEntry(priceMap, originalPn, fallbackHarga);
        } else {
          setNumberCacheValue(sellPriceCache, buildStorePartCacheKey(store, originalPn), 0, SELL_PRICE_MISS_TTL_MS);
        }
      });
    }
    
    return priceMap;
  } catch (e) { return priceMap; }
};

const fetchPhotosForItems = async (items: any[]) => {
  if (!items || items.length === 0) return {};
  const partNumbers = [...new Set(
    items
      .map(i => String(i.part_number || i.partNumber || '').trim())
      .filter(Boolean)
  )];
  if (partNumbers.length === 0) return {};
  try {
    const photoMap: Record<string, any> = {};
    const missingPartNumbers = partNumbers.filter((pn) => !hasPhotoRowCacheEntry(pn));

    if (missingPartNumbers.length > 0) {
      const { data } = await supabase
        .from('foto')
        .select(FOTO_SELECT_COLUMNS)
        .in('part_number', missingPartNumbers);

      const fetchedRows = data || [];
      fetchedRows.forEach((row: any) => {
        if (row?.part_number) {
          setPhotoRowCacheEntry(row.part_number, row);
        }
      });

      const fetchedSet = new Set(
        fetchedRows
          .map((row: any) => normalizePhotoCacheKey(row?.part_number))
          .filter(Boolean)
      );

      missingPartNumbers.forEach((pn) => {
        if (!fetchedSet.has(normalizePhotoCacheKey(pn))) {
          setPhotoRowCacheEntry(pn, null);
        }
      });
    }

    partNumbers.forEach((pn) => {
      const cached = getPhotoRowCacheEntry(pn);
      if (cached) {
        photoMap[pn] = cached;
      }
    });

    return photoMap;
  } catch (e) { return {}; }
};

const savePhotosToTable = async (partNumber: string, images: string[]) => {
  if (!partNumber) return;
  try {
    if (!images || images.length === 0) {
      await supabase.from('foto').delete().eq('part_number', partNumber);
      setPhotoRowCacheEntry(partNumber, null);
      return;
    }
    const photoPayload = mapImagesToPhotoRow(partNumber, images);
    await supabase.from('foto').upsert(photoPayload, { onConflict: 'part_number' });
    setPhotoRowCacheEntry(partNumber, photoPayload);
  } catch (e) { console.error('Error saving photos:', e); }
};

// ============================================================================
// FOTO PRODUK TYPES & FUNCTIONS
// ============================================================================

export interface FotoProdukRow {
  id?: number;
  part_number: string;
  foto_1?: string;
  foto_2?: string;
  foto_3?: string;
  foto_4?: string;
  foto_5?: string;
  foto_6?: string;
  foto_7?: string;
  foto_8?: string;
  foto_9?: string;
  foto_10?: string;
  created_at?: string;
}

export interface FotoLinkRow {
  nama_csv: string;
  sku?: string | null;  // Optional - kolom mungkin belum ada di tabel
  foto_1?: string | null;
  foto_2?: string | null;
  foto_3?: string | null;
  foto_4?: string | null;
  foto_5?: string | null;
  foto_6?: string | null;
  foto_7?: string | null;
  foto_8?: string | null;
  foto_9?: string | null;
  foto_10?: string | null;
}

// Fetch foto produk dari tabel foto
export const fetchFotoProduk = async (searchTerm?: string): Promise<FotoProdukRow[]> => {
  try {
    const pageSize = 1000;
    const rows: FotoProdukRow[] = [];
    const trimmedSearch = searchTerm?.trim() || '';
    let from = 0;

    while (true) {
      let query = supabase
        .from('foto')
        .select(`id,created_at,${FOTO_SELECT_COLUMNS}`)
        .order('created_at', { ascending: false });

      if (trimmedSearch) {
        query = query.ilike('part_number', `%${trimmedSearch}%`);
      }

      const { data, error } = await query.range(from, from + pageSize - 1);

      if (error) {
        // Check if table doesn't exist
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('Table foto does not exist');
          return [];
        }
        console.error('fetchFotoProduk Error:', error);
        return rows;
      }

      const page = (data || []) as FotoProdukRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    return rows;
  } catch (err) {
    console.error('fetchFotoProduk Exception:', err);
    return [];
  }
};

// Fetch all foto_link entries
export const fetchFotoLink = async (searchTerm?: string): Promise<FotoLinkRow[]> => {
  try {
    const trimmedSearch = searchTerm?.trim() || '';
    return await fetchAllRowsForModalFiltered<FotoLinkRow>(
      'foto_link',
      '*',
      'nama_csv',
      (q) => (trimmedSearch ? q.ilike('nama_csv', `%${trimmedSearch}%`) : q),
      true
    );
  } catch (err) {
    console.error('fetchFotoLink Exception:', err);
    return [];
  }
};

// Fetch foto_link entries that don't have SKU yet
// Note: Jika kolom sku belum ada, ini akan return semua data
export const fetchFotoLinkWithoutSku = async (): Promise<FotoLinkRow[]> => {
  try {
    const data = await fetchAllRowsForModal<FotoLinkRow>('foto_link', '*', 'nama_csv');

    // Filter di client side - items tanpa sku
    const filtered = (data || []).filter(d => !d.sku || d.sku.trim() === '');
    return filtered;
  } catch (err) {
    console.error('fetchFotoLinkWithoutSku Exception:', err);
    return [];
  }
};

// Check existing part numbers in foto table
export const checkExistingFotoPartNumbers = async (partNumbers: string[]): Promise<Set<string>> => {
  if (!partNumbers || partNumbers.length === 0) return new Set();
  
  try {
    const { data, error } = await supabase
      .from('foto')
      .select('part_number')
      .in('part_number', partNumbers);

    if (error) {
      console.error('checkExistingFotoPartNumbers Error:', error);
      return new Set();
    }

    return new Set((data || []).map(d => d.part_number));
  } catch (err) {
    console.error('checkExistingFotoPartNumbers Exception:', err);
    return new Set();
  }
};

// Fetch all part numbers from MJM store (for autocomplete)
export const fetchAllPartNumbersMJM = async (): Promise<Array<{ part_number: string; name: string }>> => {
  try {
    const data = await fetchAllRowsForModalFiltered<any>(
      'base_mjm',
      'part_number, name',
      'part_number',
      (q) => q.not('part_number', 'is', null),
      true
    );

    return (data || []).map(d => ({
      part_number: d.part_number || '',
      name: d.name || ''
    }));
  } catch (err) {
    console.error('fetchAllPartNumbersMJM Exception:', err);
    return [];
  }
};

// Insert batch to foto table
export const insertFotoBatch = async (
  rows: FotoProdukRow[]
): Promise<{ success: boolean; error?: string; inserted?: number }> => {
  if (!rows || rows.length === 0) {
    return { success: false, error: 'No data to insert' };
  }

  try {
    const { data, error } = await supabase
      .from('foto')
      .upsert(rows, { onConflict: 'part_number' })
      .select();

    if (error) {
      console.error('insertFotoBatch Error:', error);
      return { success: false, error: error.message };
    }

    // Sync cache foto agar Dashboard/Beranda bisa langsung pakai data terbaru.
    rows.forEach((row) => {
      if (!row?.part_number) return;
      setPhotoRowCacheEntry(row.part_number, row);
    });

    return { success: true, inserted: data?.length || 0 };
  } catch (err: any) {
    console.error('insertFotoBatch Exception:', err);
    return { success: false, error: err.message };
  }
};

// Insert batch to foto_link table
export const insertFotoLinkBatch = async (
  rows: FotoLinkRow[]
): Promise<{ success: boolean; error?: string; inserted?: number }> => {
  if (!rows || rows.length === 0) {
    return { success: false, error: 'No data to insert' };
  }

  try {
    const { data, error } = await supabase
      .from('foto_link')
      .upsert(rows, { onConflict: 'nama_csv' })
      .select();

    if (error) {
      console.error('insertFotoLinkBatch Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, inserted: data?.length || 0 };
  } catch (err: any) {
    console.error('insertFotoLinkBatch Exception:', err);
    return { success: false, error: err.message };
  }
};

const parseSkuCsvString = (skuString: string): string[] => {
  if (!skuString || !skuString.trim()) return [];
  const input = skuString.trim();
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (inQuotes && input[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      const value = current.trim();
      if (value) result.push(value);
      current = '';
      continue;
    }

    current += ch;
  }

  const last = current.trim();
  if (last) result.push(last);
  return result;
};

const escapeSkuCsvValue = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/[",]/.test(trimmed)) {
    return `"${trimmed.replace(/"/g, '""')}"`;
  }
  return trimmed;
};

const formatSkuCsvString = (skus: string[]): string => {
  return skus.map(escapeSkuCsvValue).filter(Boolean).join(', ');
};

// Update SKU in foto_link and sync to foto + product_alias + base_mjm image_url
// Supports multiple SKUs separated by comma (CSV-style quotes supported)
export const updateFotoLinkSku = async (
  namaCsv: string,
  skuString: string
): Promise<{ success: boolean; error?: string; warning?: string }> => {
  if (!namaCsv) {
    return { success: false, error: 'nama_csv is required' };
  }

  // If empty SKU, just clear the sku field
  if (!skuString || skuString.trim() === '') {
    try {
      const { error: updateError } = await supabase
        .from('foto_link')
        .update({ sku: '' })
        .eq('nama_csv', namaCsv);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // Parse comma-separated SKUs (CSV-style quotes supported)
  const skuArray = parseSkuCsvString(skuString);
  if (skuArray.length === 0) {
    // All SKUs cleared
    try {
      const { error: updateError } = await supabase
        .from('foto_link')
        .update({ sku: '' })
        .eq('nama_csv', namaCsv);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  try {
    // 1. Get the foto_link row to get foto URLs
    const { data: linkData, error: fetchError } = await supabase
      .from('foto_link')
      .select('*')
      .eq('nama_csv', namaCsv)
      .single();

    if (fetchError || !linkData) {
      return { success: false, error: 'foto_link entry not found: ' + (fetchError?.message || 'unknown') };
    }

    const canonicalSkuString = formatSkuCsvString(skuArray);

    // 2. Update the sku in foto_link (store as comma-separated string)
    const { error: updateError } = await supabase
      .from('foto_link')
      .update({ sku: canonicalSkuString })
      .eq('nama_csv', namaCsv);

    if (updateError) {
      if (updateError.message?.includes('column') || updateError.code === '42703') {
        return { 
          success: false, 
          error: 'Kolom "sku" belum ada di tabel foto_link. Silakan tambahkan kolom "sku" (text) ke tabel foto_link di Supabase.' 
        };
      }
      return { success: false, error: updateError.message };
    }

    // Get first foto URL for base_mjm update
    const firstFoto = linkData.foto_1 || linkData.foto_2 || linkData.foto_3 || '';

    // Build foto fields object
    const fotoFields: any = {};
    if (linkData.foto_1) fotoFields.foto_1 = linkData.foto_1;
    if (linkData.foto_2) fotoFields.foto_2 = linkData.foto_2;
    if (linkData.foto_3) fotoFields.foto_3 = linkData.foto_3;
    if (linkData.foto_4) fotoFields.foto_4 = linkData.foto_4;
    if (linkData.foto_5) fotoFields.foto_5 = linkData.foto_5;
    if (linkData.foto_6) fotoFields.foto_6 = linkData.foto_6;
    if (linkData.foto_7) fotoFields.foto_7 = linkData.foto_7;
    if (linkData.foto_8) fotoFields.foto_8 = linkData.foto_8;
    if (linkData.foto_9) fotoFields.foto_9 = linkData.foto_9;
    if (linkData.foto_10) fotoFields.foto_10 = linkData.foto_10;

    let notFoundSkus: string[] = [];

    // 3. For each SKU, insert/upsert to foto table and update base_mjm/bjw
    for (const sku of skuArray) {
      // Check if SKU exists in inventory
      const { data: mjmItem } = await supabase
        .from('base_mjm')
        .select('part_number')
        .eq('part_number', sku)
        .maybeSingle();
      
      const { data: bjwItem } = await supabase
        .from('base_bjw')
        .select('part_number')
        .eq('part_number', sku)
        .maybeSingle();

      const skuExistsInInventory = !!(mjmItem || bjwItem);
      if (!skuExistsInInventory) {
        notFoundSkus.push(sku);
      }

      // Insert/upsert to foto table
      const fotoPayload = { part_number: sku, ...fotoFields };
      let { error: fotoError } = await supabase
        .from('foto')
        .upsert(fotoPayload, { onConflict: 'part_number' });

      if (fotoError) {
        console.warn(`Upsert to foto failed for ${sku}, trying delete+insert:`, fotoError.message);
        await supabase.from('foto').delete().eq('part_number', sku);
        const { error: insertError } = await supabase.from('foto').insert(fotoPayload);
        if (insertError) {
          console.warn(`Insert to foto also failed for ${sku}:`, insertError.message);
        } else {
          console.log('Successfully inserted foto for:', sku);
        }
      } else {
        console.log('Successfully upserted foto for:', sku);
      }

      setPhotoRowCacheEntry(sku, fotoPayload);

      // Update image_url in base_mjm/base_bjw
      if (firstFoto) {
        await supabase.from('base_mjm').update({ image_url: firstFoto }).eq('part_number', sku);
        await supabase.from('base_bjw').update({ image_url: firstFoto }).eq('part_number', sku);
      }

      // Insert to product_alias for search capability
      const { data: existingAlias } = await supabase
        .from('product_alias')
        .select('id')
        .eq('part_number', sku)
        .eq('alias_name', namaCsv)
        .maybeSingle();

      if (!existingAlias) {
        await supabase.from('product_alias').insert({
          part_number: sku,
          alias_name: namaCsv,
          source: 'foto_link'
        });
      }
    }

    // Return with warning if some SKUs not found in inventory
    if (notFoundSkus.length > 0) {
      return { 
        success: true, 
        warning: `SKU tidak ditemukan di inventory: ${notFoundSkus.join(', ')}. Foto tersimpan tapi tidak akan muncul di Beranda/Gudang.` 
      };
    }

    return { success: true };
  } catch (err: any) {
    console.error('updateFotoLinkSku Exception:', err);
    return { success: false, error: err.message };
  }
};

// Search inventory with product_alias support
export const searchInventoryWithAlias = async (
  store: string | null,
  searchTerm: string
): Promise<InventoryItem[]> => {
  if (!searchTerm || searchTerm.trim().length < 2) return [];
  
  const table = getTableName(store);
  const searchLower = searchTerm.toLowerCase().trim();

  try {
    // First search directly in inventory
    let { data: directResults } = await supabase
      .from(table)
      .select(INVENTORY_SELECT_COLUMNS)
      .or(`part_number.ilike.%${searchLower}%,name.ilike.%${searchLower}%`)
      .limit(50);

    // Then search via product_alias
    const { data: aliasResults } = await supabase
      .from('product_alias')
      .select('part_number')
      .ilike('alias_name', `%${searchLower}%`)
      .limit(20);

    const aliasPartNumbers = (aliasResults || []).map(a => a.part_number).filter(Boolean);
    
    let aliasItems: any[] = [];
    if (aliasPartNumbers.length > 0) {
      const { data } = await supabase
        .from(table)
        .select(INVENTORY_SELECT_COLUMNS)
        .in('part_number', aliasPartNumbers);
      aliasItems = data || [];
    }

    // Merge results (avoid duplicates)
    const allItems = [...(directResults || [])];
    const existingPNs = new Set(allItems.map(i => i.part_number));
    aliasItems.forEach(item => {
      if (!existingPNs.has(item.part_number)) {
        allItems.push(item);
      }
    });

    if (allItems.length === 0) return [];

    // Fetch photos and prices
    const photoMap = await fetchPhotosForItems(allItems);
    const priceMap = await fetchLatestPricesForItems(allItems, store);

    return allItems.map(item => {
      const mapped = mapItemFromDB(item, photoMap[item.part_number]);
      const lookupKey = (item.part_number || '').trim();
      if (priceMap[lookupKey]) mapped.price = priceMap[lookupKey].harga;
      return mapped;
    });
  } catch (err) {
    console.error('searchInventoryWithAlias Exception:', err);
    return [];
  }
};

// --- INVENTORY FUNCTIONS ---
interface FetchInventoryOptions {
  includePhotos?: boolean;
  includePrices?: boolean;
  includeCostPrices?: boolean;
}

export const fetchInventory = async (
  store?: string | null,
  options: FetchInventoryOptions = {}
): Promise<InventoryItem[]> => {
  const {
    includePhotos = true,
    includePrices = true,
    includeCostPrices = true
  } = options;
  const table = getTableName(store);
  const items = await fetchAllRowsForModalFiltered<any>(
    table,
    INVENTORY_SELECT_COLUMNS,
    'name',
    (query) => query,
    true
  );
  
  if (!items || items.length === 0) return [];

  const [photoMap, priceMap, costPriceMap] = await Promise.all([
    includePhotos ? fetchPhotosForItems(items) : Promise.resolve({}),
    includePrices ? fetchLatestPricesForItems(items, store) : Promise.resolve({}),
    includeCostPrices ? fetchLatestCostPricesForItems(items, store) : Promise.resolve({})
  ]);

  return items.map(item => {
    const mapped = mapItemFromDB(item, photoMap[item.part_number]);
    const lookupKey = (item.part_number || '').trim();
    if (priceMap[lookupKey]) mapped.price = priceMap[lookupKey].harga;
    if (costPriceMap[lookupKey]) mapped.costPrice = costPriceMap[lookupKey].harga_satuan;
    return mapped;
  });
};

export const fetchInventoryPaginated = async (store: string | null, page: number, perPage: number, filters?: any): Promise<{ data: InventoryItem[]; total: number }> => {
  const table = getTableName(store);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  let query = supabase.from(table).select(INVENTORY_SELECT_COLUMNS, { count: 'exact' });

  // Filter by part number
  if (filters?.partNumber) query = query.ilike('part_number', `%${filters.partNumber}%`);
  // Filter by name
  if (filters?.name) query = query.ilike('name', `%${filters.name}%`);
  // Filter by brand (merek spare part) - kolom brand di DB
  if (filters?.brand) query = query.ilike('brand', `%${filters.brand}%`);
  // Filter by application (jenis mobil) - kolom application di DB
  if (filters?.app) query = query.ilike('application', `%${filters.app}%`);
  // Filter by stock type
  if (filters?.type === 'low') query = query.gt('quantity', 0).lte('quantity', 3);
  if (filters?.type === 'empty') query = query.eq('quantity', 0);

  const { data: items, count, error } = await query.range(from, to).order('name', { ascending: true });
  if (error || !items) return { data: [], total: 0 };

  const photoMap = await fetchPhotosForItems(items);
  const priceMap = await fetchLatestPricesForItems(items, store);
  const costPriceMap = await fetchLatestCostPricesForItems(items, store);

  return { 
    data: items.map(item => {
      const mapped = mapItemFromDB(item, photoMap[item.part_number]);
      const lookupKey = (item.part_number || '').trim();
      if (priceMap[lookupKey]) mapped.price = priceMap[lookupKey].harga;
      if (costPriceMap[lookupKey]) mapped.costPrice = costPriceMap[lookupKey].harga_satuan;
      return mapped;
    }), 
    total: count || 0 
  };
};

export const fetchInventoryStats = async (store: string | null): Promise<any> => {
  const table = getTableName(store);

  // Ambil semua inventory secara batch agar tidak mentok default 1000 rows.
  const items = await fetchAllRowsForModal<ModalBaseItemRow>(
    table,
    'part_number,name,quantity',
    'part_number'
  );

  const totalItems = items.length;
  const totalStock = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

  // 2. Get today's start timestamp (WIB timezone)
  const now = new Date();
  const wibOffset = 7 * 60; // WIB = UTC+7
  const localOffset = now.getTimezoneOffset();
  const wibNow = new Date(now.getTime() + (localOffset + wibOffset) * 60000);
  const startOfDayWIB = new Date(wibNow.getFullYear(), wibNow.getMonth(), wibNow.getDate(), 0, 0, 0, 0);
  // Convert back to UTC for database query
  const startOfDayUTC = new Date(startOfDayWIB.getTime() - (localOffset + wibOffset) * 60000);
  const todayStart = startOfDayUTC.toISOString();

  const sumLogQtySince = async (
    tableName: string,
    qtyColumn: 'qty_masuk' | 'qty_keluar'
  ): Promise<number> => {
    const pageSize = 1000;
    let from = 0;
    let total = 0;

    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select(qtyColumn)
        .gte('created_at', todayStart)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error(`Gagal mengambil ${qtyColumn} dari ${tableName}:`, error);
        break;
      }

      const page = (data || []) as Array<Record<string, number | null>>;
      total += page.reduce((acc, row) => acc + (Number(row[qtyColumn]) || 0), 0);

      if (page.length < pageSize) break;
      from += pageSize;
    }

    return total;
  };

  // 3. Get today's incoming qty from barang_masuk
  const inTable = getLogTableName('barang_masuk', store);
  const todayIn = await sumLogQtySince(inTable, 'qty_masuk');

  // 4. Get today's outgoing qty from barang_keluar
  const outTable = getLogTableName('barang_keluar', store);
  const todayOut = await sumLogQtySince(outTable, 'qty_keluar');

  // 5. Calculate total asset as total modal stock (same basis as Zakat Tahunan modal)
  const totalAsset = await calculateModalStockTotal(items);

  return { totalItems, totalStock, totalAsset, todayIn, todayOut };
};

export const fetchInventoryAllFiltered = async (store: string | null, filters?: any): Promise<InventoryItem[]> => {
  const table = getTableName(store);
  let query = supabase.from(table).select(INVENTORY_SELECT_COLUMNS);

  // Filter by part number
  if (filters?.partNumber) query = query.ilike('part_number', `%${filters.partNumber}%`);
  // Filter by name
  if (filters?.name) query = query.ilike('name', `%${filters.name}%`);
  // Filter by brand (merek spare part) - kolom brand di DB
  if (filters?.brand) query = query.ilike('brand', `%${filters.brand}%`);
  // Filter by application (jenis mobil) - kolom application di DB
  if (filters?.app) query = query.ilike('application', `%${filters.app}%`);
  // Filter by stock type
  if (filters?.type === 'low') query = query.gt('quantity', 0).lte('quantity', 3);
  if (filters?.type === 'empty') query = query.eq('quantity', 0);

  const { data: items, error } = await query.order('name', { ascending: true });
  if (error || !items) return [];

  const photoMap = await fetchPhotosForItems(items);
  const priceMap = await fetchLatestPricesForItems(items, store);
  const costPriceMap = await fetchLatestCostPricesForItems(items, store);

  return items.map(item => {
    const mapped = mapItemFromDB(item, photoMap[item.part_number]);
    const lookupKey = (item.part_number || '').trim();
    if (priceMap[lookupKey]) mapped.price = priceMap[lookupKey].harga;
    if (costPriceMap[lookupKey]) mapped.costPrice = costPriceMap[lookupKey].harga_satuan;
    return mapped;
  });
};

// --- ADD & UPDATE & DELETE INVENTORY ---

export const addInventory = async (data: InventoryFormData, store?: string | null): Promise<string | null> => {
  const table = getTableName(store);
  if (!data.partNumber) { console.error("Part Number wajib!"); return null; }
  const payload = mapItemToDB(data);
  const { error } = await supabase.from(table).insert([payload]);
  
  if (error) {
    console.error(`Gagal Tambah: ${error.message}`);
    return null;
  }
  if (data.partNumber) await savePhotosToTable(data.partNumber, data.images);
  return data.partNumber;
};

export interface InventoryBatchRowInput {
  partNumber: string;
  name: string;
  brand?: string;
  application?: string;
  shelf?: string;
}

export interface InventoryBatchInsertResult {
  inserted: number;
  skippedExisting: number;
  skippedInvalid: number;
  skippedDuplicateInput: number;
  skippedEmpty: number;
  errors: string[];
}

const chunkArray = <T,>(arr: T[], chunkSize: number): T[][] => {
  if (chunkSize <= 0) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
};

export const addInventoryBatch = async (
  rows: InventoryBatchRowInput[],
  store?: string | null
): Promise<InventoryBatchInsertResult> => {
  const result: InventoryBatchInsertResult = {
    inserted: 0,
    skippedExisting: 0,
    skippedInvalid: 0,
    skippedDuplicateInput: 0,
    skippedEmpty: 0,
    errors: []
  };

  if (!Array.isArray(rows) || rows.length === 0) return result;

  const table = getTableName(store);
  const seenPartNumbers = new Set<string>();
  const normalizedRows: InventoryBatchRowInput[] = [];

  rows.forEach((row) => {
    const partNumber = normalizePart(row.partNumber);
    const name = (row.name || '').trim();
    const brand = (row.brand || '').trim();
    const application = (row.application || '').trim();
    const shelf = (row.shelf || '').trim();

    const isEmptyRow = !partNumber && !name && !brand && !application && !shelf;
    if (isEmptyRow) {
      result.skippedEmpty += 1;
      return;
    }

    if (!partNumber || !name) {
      result.skippedInvalid += 1;
      return;
    }

    if (seenPartNumbers.has(partNumber)) {
      result.skippedDuplicateInput += 1;
      return;
    }

    seenPartNumbers.add(partNumber);
    normalizedRows.push({
      partNumber,
      name,
      brand,
      application,
      shelf
    });
  });

  if (normalizedRows.length === 0) return result;

  const existingPartNumbers = new Set<string>();
  const partNumberChunks = chunkArray(
    normalizedRows.map((row) => row.partNumber),
    500
  );

  for (const chunk of partNumberChunks) {
    const { data, error } = await supabase
      .from(table)
      .select('part_number')
      .in('part_number', chunk);

    if (error) {
      result.errors.push(`Gagal cek data existing: ${error.message}`);
      continue;
    }

    (data || []).forEach((row: any) => {
      const part = normalizePart(row.part_number);
      if (part) existingPartNumbers.add(part);
    });
  }

  const rowsToInsert = normalizedRows.filter((row) => !existingPartNumbers.has(row.partNumber));
  result.skippedExisting = normalizedRows.length - rowsToInsert.length;

  if (rowsToInsert.length === 0) return result;

  const payloads = rowsToInsert.map((row) =>
    mapItemToDB({
      partNumber: row.partNumber,
      name: row.name,
      brand: row.brand || '',
      application: row.application || '',
      shelf: row.shelf || '',
      quantity: 0
    })
  );

  const payloadChunks = chunkArray(payloads, 300);

  for (const payloadChunk of payloadChunks) {
    const { error } = await supabase.from(table).insert(payloadChunk);
    if (!error) {
      result.inserted += payloadChunk.length;
      continue;
    }

    // Fallback ke insert per baris agar tetap simpan sebagian jika ada konflik sebagian.
    for (const payload of payloadChunk as any[]) {
      const { error: singleError } = await supabase.from(table).insert([payload]);
      if (!singleError) {
        result.inserted += 1;
        continue;
      }

      const message = singleError.message || 'Unknown error';
      const isDuplicate = singleError.code === '23505' || message.toLowerCase().includes('duplicate');
      if (isDuplicate) {
        result.skippedExisting += 1;
      } else {
        const partNumber = normalizePart(payload.part_number || payload.partNumber);
        result.errors.push(`${partNumber || '-'}: ${message}`);
      }
    }
  }

  return result;
};

// --- UPDATE INVENTORY (LOGIC BARANG MASUK/KELUAR) ---
export const updateInventory = async (arg1: any, arg2?: any, arg3?: any): Promise<InventoryItem | null> => {
  let item: InventoryItem = arg1;
  let transactionData: any = arg2;
  let store: string | null | undefined = arg3;

  const pk = item.partNumber;
  if (!pk) return null;
  const table = getTableName(store);
  
  // 1. Update Stok Utama
  const { error } = await supabase.from(table).update(mapItemToDB(item)).eq('part_number', pk);
  if (error) { alert(`Gagal Update Stok: ${error.message}`); return null; }

  await savePhotosToTable(pk, item.images || []);

  // 2. Update Harga Jual di list_harga_jual (pusat)
  if (item.price !== undefined && item.price >= 0) {
    try {
      const { data: existingPrice } = await supabase
        .from('list_harga_jual')
        .select('part_number')
        .eq('part_number', pk)
        .maybeSingle();
      
      if (existingPrice) {
        // Update existing record
        await supabase
          .from('list_harga_jual')
          .update({ harga: item.price, name: item.name })
          .eq('part_number', pk);
      } else {
        // Insert new record
        await supabase
          .from('list_harga_jual')
          .insert([{ part_number: pk, name: item.name, harga: item.price, created_at: getWIBDate().toISOString() }]);
      }
    } catch (e) {
      console.error('Gagal update harga jual:', e);
    }
  }

  // 3. Insert Log Mutasi
  if (transactionData) {
     try {
       const isBarangMasuk = transactionData.type === 'in';
       const logTable = getLogTableName(isBarangMasuk ? 'barang_masuk' : 'barang_keluar', store);
       const validTempo = transactionData.tempo || transactionData.resiTempo || 'CASH';

       let finalLogData: any = {
           part_number: pk,
           brand: item.brand,
           application: item.application,
           rak: item.shelf,
           ecommerce: transactionData.ecommerce || '-',
           customer: transactionData.customer || '-',
           tempo: validTempo,
           created_at: transactionData.tanggal ? new Date(transactionData.tanggal).toISOString() : getWIBDate().toISOString()
       };

       if (isBarangMasuk) {
          finalLogData = {
              ...finalLogData,
              nama_barang: item.name,
              stok_akhir: item.quantity,
              qty_masuk: Number(transactionData.qty),
              harga_satuan: Number(transactionData.price || 0),
              harga_total: Number(transactionData.qty) * Number(transactionData.price || 0)
          };
       } else {
          finalLogData = {
              ...finalLogData,
              name: item.name,
              stock_ahir: item.quantity,
              qty_keluar: Number(transactionData.qty),
              harga_satuan: Number(item.price || 0),
              harga_total: Number(item.price || 0) * Number(transactionData.qty),
              resi: '-'
          };
       }
       
       await supabase.from(logTable).insert([finalLogData]);
     } catch (e: any) { 
        console.error('Gagal log mutasi:', e);
     }
  }
  return item;
};

export const deleteInventory = async (id: string, store?: string | null): Promise<boolean> => {
  const table = getTableName(store);
  const { error } = await supabase.from(table).delete().eq('part_number', id);
  return !error;
};

export const getItemByPartNumber = async (partNumber: string, store?: string | null): Promise<InventoryItem | null> => {
  const table = getTableName(store);
  const { data, error } = await supabase
    .from(table)
    .select(INVENTORY_SELECT_COLUMNS)
    .eq('part_number', partNumber)
    .maybeSingle();
  if (error || !data) return null;
  
  const photoMap = await fetchPhotosForItems([data]);
  const priceMap = await fetchLatestPricesForItems([data], store);
  
  const mapped = mapItemFromDB(data, photoMap[data.part_number]);
  const lookupKey = (data.part_number || '').trim();
  if (priceMap[lookupKey]) {
      mapped.price = priceMap[lookupKey].harga;
  }
  return mapped;
};

interface BarangMasukFilters {
    search?: string;
    partNumber?: string;
    customer?: string;
    dateFrom?: string;
    dateTo?: string;
}

export const fetchBarangMasukLog = async (store: string | null, page = 1, limit = 20, filters: BarangMasukFilters = {}) => {
    const table = getLogTableName('barang_masuk', store);
    const stockTable = getTableName(store);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from(table)
        .select(BARANG_MASUK_LOG_SELECT_COLUMNS, { count: 'exact' })
        // Exclude rows retur from riwayat barang masuk view.
        .not('customer', 'ilike', '%RETUR%')
        .not('tempo', 'ilike', '%RETUR%');

    // Apply search filters
    if (filters.search) {
        query = query.or(`part_number.ilike.%${filters.search}%,nama_barang.ilike.%${filters.search}%,customer.ilike.%${filters.search}%`);
    }
    
    // Apply part number filter
    if (filters.partNumber) {
        query = query.ilike('part_number', `%${filters.partNumber}%`);
    }
    
    // Apply customer filter
    if (filters.customer) {
        query = query.ilike('customer', `%${filters.customer}%`);
    }
    
    // Apply date range filter
    if (filters.dateFrom) {
        query = query.gte('created_at', `${filters.dateFrom}T00:00:00`);
    }
    if (filters.dateTo) {
        query = query.lte('created_at', `${filters.dateTo}T23:59:59`);
    }

    // Order by id descending (newest first) as primary, then created_at as fallback
    const { data, count, error } = await query
        .order('id', { ascending: false })
        .range(from, to);

    if (error) {
        console.error("Error fetching barang masuk:", error);
        return { data: [], total: 0 };
    }

    const partNumbers = [...new Set((data || []).map(row => row.part_number).filter(Boolean))];
    const stockMap = await fetchStockQtyMapByPartNumbers(stockTable, partNumbers);
    
    const mappedData = (data || []).map(row => ({
        ...row,
        name: row.nama_barang || row.name, 
        quantity: row.qty_masuk,
        current_qty: stockMap[row.part_number] ?? 0
    }));

    return { data: mappedData, total: count || 0 };
};

// --- SHOP ITEMS ---
interface ShopItemFilters {
  searchTerm?: string;
  category?: string;
  partNumberSearch?: string;
  nameSearch?: string;
  brandSearch?: string;
  applicationSearch?: string;
}

export const fetchShopItems = async (
  page: number = 1,
  perPage: number = 50,
  filters: ShopItemFilters = {},
  store?: string | null
): Promise<{ data: InventoryItem[]; count: number }> => {
  const table = getTableName(store);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const { searchTerm = '', partNumberSearch = '', nameSearch = '', brandSearch = '', applicationSearch = '' } = filters;

  try {
    let query = supabase.from(table).select(INVENTORY_SELECT_COLUMNS, { count: 'exact' }); 

    // Search all fields: name, part_number, brand, application
    if (searchTerm) query = query.or(`name.ilike.%${searchTerm}%,part_number.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,application.ilike.%${searchTerm}%`);
    if (partNumberSearch) query = query.ilike('part_number', `%${partNumberSearch}%`);
    if (nameSearch) query = query.ilike('name', `%${nameSearch}%`);
    // Brand di UI = merek spare part = kolom brand di DB
    if (brandSearch) query = query.ilike('brand', `%${brandSearch}%`);
    // Aplikasi di UI = jenis mobil = kolom application di DB
    if (applicationSearch) query = query.ilike('application', `%${applicationSearch}%`);

    const { data: items, count, error } = await query.range(from, to).order('name', { ascending: true });

    if (error || !items || items.length === 0) return { data: [], count: count || 0 };

    const photoMap = await fetchPhotosForItems(items);
    const priceMap = await fetchLatestPricesForItems(items, store);

    const mappedItems = items.map(item => {
      const baseItem = mapItemFromDB(item, photoMap[item.part_number]);
      const lookupKey = (item.part_number || '').trim();
      const latestPrice = priceMap[lookupKey];
      return {
        ...baseItem,
        price: latestPrice ? latestPrice.harga : 0, 
        isLowStock: baseItem.quantity < 5
      };
    });

    return { data: mappedItems, count: count || 0 };
  } catch (error) {
    console.error('[fetchShopItems] Unexpected error:', error);
    return { data: [], count: 0 };
  }
};


// --- ORDER MANAGEMENT SYSTEM (UPDATED) ---

// 1. UPDATE DATA ORDER (Fitur Edit)
export const updateOfflineOrder = async (
  id: string,
  updates: { partNumber: string; quantity: number; price: number; nama_barang?: string; tempo?: string },
  store: string | null,
  originalItem?: { tanggal: string; customer: string; part_number: string } // Untuk BJW yang tidak punya id
): Promise<{ success: boolean; msg: string }> => {
  const table = store === 'mjm' ? 'orders_mjm' : (store === 'bjw' ? 'orders_bjw' : null);
  if (!table) return { success: false, msg: 'Toko tidak valid' };

  try {
    const hargaTotal = updates.quantity * updates.price;
    const updatePayload: any = {
      part_number: updates.partNumber,
      quantity: updates.quantity,
      harga_satuan: updates.price,
      harga_total: hargaTotal
    };
    if (updates.nama_barang) updatePayload.nama_barang = updates.nama_barang;
    if (updates.tempo) updatePayload.tempo = updates.tempo;

    let query = supabase.from(table).update(updatePayload);
    
    // BJW tidak punya kolom id, gunakan kombinasi unik
    if (store === 'bjw' && originalItem) {
      query = query
        .eq('tanggal', originalItem.tanggal)
        .eq('customer', originalItem.customer)
        .eq('part_number', originalItem.part_number);
    } else {
      // MJM punya kolom id
      query = query.eq('id', id);
    }

    const { error } = await query;

    if (error) throw error;
    return { success: true, msg: 'Data pesanan berhasil diupdate.' };
  } catch (error: any) {
    console.error('Update Order Error:', error);
    return { success: false, msg: `Gagal update: ${error.message}` };
  }
};

// 2. FETCH OFFLINE
export const fetchOfflineOrders = async (store: string | null): Promise<OfflineOrderRow[]> => {
  const table = store === 'mjm' ? 'orders_mjm' : (store === 'bjw' ? 'orders_bjw' : null);
  if (!table) return [];

  return await fetchAllRowsForModalFiltered<OfflineOrderRow>(
    table,
    '*',
    'tanggal',
    (q) => q.eq('status', 'Belum Diproses'),
    false
  );
};

// 2.1 FETCH SALES (KHUSUS BJW)
export const fetchSalesOrders = async (store: string | null): Promise<OfflineOrderRow[]> => {
  if (store !== 'bjw') return [];

  return await fetchAllRowsForModalFiltered<OfflineOrderRow>(
    'orders_bjw',
    '*',
    'tanggal',
    (q) => q.eq('status', 'Sales Pending').eq('tempo', 'SALES'),
    false
  );
};

// 3. FETCH ONLINE
export const fetchOnlineOrders = async (store: string | null): Promise<OnlineOrderRow[]> => {
  const table = store === 'mjm' ? 'scan_resi_mjm' : (store === 'bjw' ? 'scan_resi_bjw' : null);
  if (!table) return [];

  return await fetchAllRowsForModalFiltered<OnlineOrderRow>(
    table,
    '*',
    'tanggal',
    (q) => q.neq('status', 'Diproses'),
    false
  );
};

// 4. FETCH SOLD ITEMS (no limit, pagination handled in component)
export const fetchSoldItems = async (store: string | null): Promise<SoldItemRow[]> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return [];

  return await fetchAllRowsForModalFiltered<SoldItemRow>(
    table,
    SOLD_ITEM_SELECT_COLUMNS,
    'created_at',
    (q) => q,
    false
  );
};

export interface SoldItemsChunkPayload {
  chunk: SoldItemRow[];
  loaded: number;
  total: number;
}

// Fetch sold items bertahap agar UI bisa render progresif (chunk per chunk).
export const fetchSoldItemsProgressive = async (
  store: string | null,
  onChunk?: (payload: SoldItemsChunkPayload) => void
): Promise<SoldItemRow[]> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return [];

  // Bigger page size + no upfront exact count to improve first render latency
  // and reduce total round-trips on large datasets.
  const pageSize = 1000;
  let from = 0;
  const rows: SoldItemRow[] = [];
  let snapshotMaxCreatedAt: string | null = null;

  try {
    const { data: latestRow, error: latestError } = await supabase
      .from(table)
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestError) {
      snapshotMaxCreatedAt = (latestRow?.created_at as string | undefined) || null;
    }
  } catch (error) {
    console.warn('fetchSoldItemsProgressive: gagal ambil snapshot created_at, lanjut tanpa snapshot.');
  }

  while (true) {
    let data: SoldItemRow[] | null = null;
    let error: any = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let query = supabase
        .from(table)
        .select(SOLD_ITEM_SELECT_COLUMNS)
        .order('created_at', { ascending: false });

      if (snapshotMaxCreatedAt) {
        query = query.lte('created_at', snapshotMaxCreatedAt);
      }

      const response = await query.range(from, from + pageSize - 1);
      data = (response.data || []) as SoldItemRow[];
      error = response.error;

      if (!error) break;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 180 * attempt));
      }
    }

    if (error) {
      console.error('Fetch Sold Progressive Error:', error);
      return rows;
    }

    const page = (data || []) as SoldItemRow[];
    if (page.length === 0) break;

    rows.push(...page);

    onChunk?.({
      chunk: page,
      loaded: rows.length,
      // 0 means "unknown total"; caller can show indeterminate progress.
      total: 0
    });

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};

// 4.1 FETCH SALES PAID ITEMS (KHUSUS BJW)
export const fetchSalesPaidItems = async (store: string | null): Promise<SoldItemRow[]> => {
  if (store !== 'bjw') return [];

  return await fetchAllRowsForModalFiltered<SoldItemRow>(
    'barang_keluar_bjw',
    SOLD_ITEM_SELECT_COLUMNS,
    'created_at',
    (q) => q.ilike('ecommerce', 'SALES').ilike('tempo', 'CASH'),
    false
  );
};

// 4.1 UPDATE SOLD ITEM PRICE
export const updateSoldItemPrice = async (
  itemId: string,
  newHargaTotal: number,
  qtyKeluar: number,
  store: string | null
): Promise<{ success: boolean; msg: string }> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return { success: false, msg: 'Toko tidak valid' };

  try {
    const { error } = await supabase
      .from(table)
      .update({ 
        harga_total: newHargaTotal 
      })
      .eq('id', itemId);

    if (error) {
      console.error('Update Sold Item Price Error:', error);
      return { success: false, msg: 'Gagal update harga: ' + error.message };
    }

    return { success: true, msg: 'Harga berhasil diupdate' };
  } catch (err: any) {
    console.error('Update Sold Item Price Exception:', err);
    return { success: false, msg: 'Error: ' + (err.message || 'Unknown error') };
  }
};

// 4.2 UPDATE SOLD ITEM DATE
export const updateSoldItemDate = async (
  itemId: string,
  newDateIso: string,
  store: string | null
): Promise<{ success: boolean; msg: string }> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return { success: false, msg: 'Toko tidak valid' };

  try {
    const { error } = await supabase
      .from(table)
      .update({ created_at: newDateIso })
      .eq('id', itemId);

    if (error) {
      console.error('Update Sold Item Date Error:', error);
      return { success: false, msg: 'Gagal update tanggal: ' + error.message };
    }

    return { success: true, msg: 'Tanggal berhasil diupdate' };
  } catch (err: any) {
    console.error('Update Sold Item Date Exception:', err);
    return { success: false, msg: 'Error: ' + (err.message || 'Unknown error') };
  }
};

// 4.3 UPDATE SOLD ITEM QTY + ADJUST STOCK
export const updateSoldItemQty = async (
  itemId: string,
  newQtyKeluar: number,
  store: string | null
): Promise<{ success: boolean; msg: string; delta?: number }> => {
  const outTable = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  const stockTable = store === 'mjm' ? 'base_mjm' : (store === 'bjw' ? 'base_bjw' : null);
  if (!outTable || !stockTable) return { success: false, msg: 'Toko tidak valid' };

  const targetQty = Number(newQtyKeluar);
  if (!Number.isInteger(targetQty) || targetQty <= 0) {
    return { success: false, msg: 'Qty harus bilangan bulat lebih dari 0' };
  }

  try {
    // 1) Ambil data item terjual saat ini
    const { data: soldItem, error: soldError } = await supabase
      .from(outTable)
      .select('id, part_number, qty_keluar, harga_total, tempo')
      .eq('id', itemId)
      .single();

    if (soldError || !soldItem) {
      return { success: false, msg: 'Data item terjual tidak ditemukan' };
    }

    const partNumber = (soldItem.part_number || '').trim();
    if (!partNumber) {
      return { success: false, msg: 'Part number tidak valid pada item terjual' };
    }

    const currentQty = Number(soldItem.qty_keluar || 0);
    const delta = targetQty - currentQty;

    if (delta === 0) {
      return { success: true, msg: 'Qty tidak berubah', delta: 0 };
    }

    const isKilatItem = normalizeTempo(soldItem.tempo) === 'KILAT';
    const shouldAdjustStock = !isKilatItem;

    // 2) Ambil stok saat ini di base table
    let stockItem: { part_number: string; quantity: number } | null = null;
    let stockPartNumber = partNumber;
    let stockQty = 0;

    if (shouldAdjustStock) {
      const { data: stockExact, error: stockExactErr } = await supabase
        .from(stockTable)
        .select('part_number, quantity')
        .eq('part_number', partNumber)
        .maybeSingle();

      if (stockExactErr) {
        return { success: false, msg: 'Gagal mengambil data stok: ' + stockExactErr.message };
      }

      if (stockExact) {
        stockItem = stockExact;
      } else {
        const { data: stockIlike, error: stockIlikeErr } = await supabase
          .from(stockTable)
          .select('part_number, quantity')
          .ilike('part_number', partNumber)
          .maybeSingle();

        if (stockIlikeErr) {
          return { success: false, msg: 'Gagal mengambil data stok: ' + stockIlikeErr.message };
        }
        stockItem = stockIlike || null;
      }

      if (!stockItem) {
        return { success: false, msg: `Part number ${partNumber} tidak ditemukan di stok` };
      }

      stockPartNumber = stockItem.part_number || partNumber;
      stockQty = Number(stockItem.quantity || 0);

      // 3) Hitung stok baru berdasarkan delta qty
      // delta > 0: qty jual naik -> stok berkurang
      // delta < 0: qty jual turun -> stok bertambah
      const absDelta = Math.abs(delta);
      const newStockQty = delta > 0 ? stockQty - absDelta : stockQty + absDelta;

      if (delta > 0 && stockQty < absDelta) {
        return { success: false, msg: `Stok tidak cukup. Sisa stok ${stockQty}, butuh ${absDelta}` };
      }

      const { error: stockUpdateErr } = await supabase
        .from(stockTable)
        .update({ quantity: newStockQty })
        .eq('part_number', stockPartNumber);

      if (stockUpdateErr) {
        return { success: false, msg: 'Gagal update stok: ' + stockUpdateErr.message };
      }

      stockQty = newStockQty;
    }

    // 4) Update qty pada barang_keluar
    const hargaTotalNow = Number(soldItem.harga_total || 0);
    const newHargaSatuan = targetQty > 0 ? Math.round(hargaTotalNow / targetQty) : 0;
    const soldPayload: any = {
      qty_keluar: targetQty,
      harga_satuan: newHargaSatuan
    };

    if (shouldAdjustStock) {
      soldPayload.stock_ahir = stockQty;
    }

    const { error: soldUpdateErr } = await supabase
      .from(outTable)
      .update(soldPayload)
      .eq('id', itemId);

    if (soldUpdateErr) {
      // Rollback stok jika update barang_keluar gagal
      if (shouldAdjustStock) {
        const rollbackQty = Number(stockItem?.quantity || 0);
        await supabase
          .from(stockTable)
          .update({ quantity: rollbackQty })
          .eq('part_number', stockPartNumber);
      }
      return { success: false, msg: 'Gagal update qty terjual: ' + soldUpdateErr.message };
    }

    if (isKilatItem) {
      return {
        success: true,
        msg: `Qty berhasil diupdate ke ${targetQty} (item KILAT, stok base tidak diubah)`,
        delta
      };
    }

    const absDelta = Math.abs(delta);
    const stockAction = delta > 0 ? `berkurang ${absDelta}` : `bertambah ${absDelta}`;
    return {
      success: true,
      msg: `Qty berhasil diupdate ke ${targetQty}, stok ${stockAction}`,
      delta
    };
  } catch (err: any) {
    console.error('Update Sold Item Qty Exception:', err);
    return { success: false, msg: 'Error: ' + (err.message || 'Unknown error') };
  }
};

// 4.4 UPDATE SOLD ITEM KODE TOKO
export const updateSoldItemKodeToko = async (
  itemId: string,
  newKodeToko: string,
  store: string | null
): Promise<{ success: boolean; msg: string }> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return { success: false, msg: 'Toko tidak valid' };

  const normalizedKodeToko = (newKodeToko || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!normalizedKodeToko) {
    return { success: false, msg: 'Kode toko tidak boleh kosong' };
  }

  try {
    const { error } = await supabase
      .from(table)
      .update({ kode_toko: normalizedKodeToko })
      .eq('id', itemId);

    if (error) {
      console.error('Update Sold Item Kode Toko Error:', error);
      return { success: false, msg: 'Gagal update kode toko: ' + error.message };
    }

    return { success: true, msg: 'Kode toko berhasil diupdate' };
  } catch (err: any) {
    console.error('Update Sold Item Kode Toko Exception:', err);
    return { success: false, msg: 'Error: ' + (err.message || 'Unknown error') };
  }
};

// 4.5 UPDATE SOLD ITEM TEMPO
export const updateSoldItemTempo = async (
  itemId: string,
  newTempo: string,
  store: string | null
): Promise<{ success: boolean; msg: string }> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return { success: false, msg: 'Toko tidak valid' };

  const normalizedTempo = (newTempo || '').trim().toUpperCase();
  const allowedTempo = new Set(['CASH', '3 BLN', '2 BLN', '1 BLN', 'NADIR']);
  if (!allowedTempo.has(normalizedTempo)) {
    return { success: false, msg: 'Tempo tidak valid' };
  }

  try {
    const { error } = await supabase
      .from(table)
      .update({ tempo: normalizedTempo })
      .eq('id', itemId);

    if (error) {
      console.error('Update Sold Item Tempo Error:', error);
      return { success: false, msg: 'Gagal update tempo: ' + error.message };
    }

    return { success: true, msg: 'Tempo berhasil diupdate' };
  } catch (err: any) {
    console.error('Update Sold Item Tempo Exception:', err);
    return { success: false, msg: 'Error: ' + (err.message || 'Unknown error') };
  }
};

// 5. FETCH RETUR
export const fetchReturItems = async (store: string | null): Promise<ReturRow[]> => {
  const table = store === 'mjm' ? 'retur_mjm' : (store === 'bjw' ? 'retur_bjw' : null);
  if (!table) return [];

  return await fetchAllRowsForModalFiltered<ReturRow>(
    table,
    '*',
    'tanggal_retur',
    (q) => q,
    false
  );
};

const normalizePartForSync = (value: string | null | undefined): string =>
  (value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const getResiSyncTables = (store: string | null) => {
  if (store === 'mjm') return { scanTable: 'scan_resi_mjm', resiItemsTable: 'resi_items_mjm' };
  if (store === 'bjw') return { scanTable: 'scan_resi_bjw', resiItemsTable: 'resi_items_bjw' };
  return null;
};

const syncResiToProcessed = async (
  store: string | null,
  resiValue: string | null | undefined,
  partNumber: string | null | undefined
): Promise<void> => {
  const tables = getResiSyncTables(store);
  const normalizedResi = String(resiValue || '').trim();
  if (!tables || !normalizedResi || normalizedResi === '-') return;

  const resiVariants = [...new Set([normalizedResi, normalizedResi.toUpperCase(), normalizedResi.toLowerCase()])];
  const normalizedPart = normalizePartForSync(partNumber);

  try {
    await supabase
      .from(tables.scanTable)
      .update({ status: 'completed' })
      .in('resi', resiVariants)
      .neq('status', 'completed');
  } catch (err) {
    console.warn('syncResiToProcessed scan_resi warning:', err);
  }

  try {
    const pendingItems = await fetchAllRowsForModalFiltered<any>(
      tables.resiItemsTable,
      'id, part_number',
      'id',
      (query) => query.eq('status', 'pending').in('resi', resiVariants),
      true
    );

    if (!pendingItems || pendingItems.length === 0) return;

    let idsToProcess = pendingItems.map((row: any) => row.id).filter(Boolean);
    if (normalizedPart) {
      idsToProcess = pendingItems
        .filter((row: any) => normalizePartForSync(row.part_number) === normalizedPart)
        .map((row: any) => row.id)
        .filter(Boolean);
    }

    if (idsToProcess.length === 0) return;

    for (let i = 0; i < idsToProcess.length; i += 500) {
      const chunk = idsToProcess.slice(i, i + 500);
      const { error: updateErr } = await supabase
        .from(tables.resiItemsTable)
        .update({ status: 'processed' })
        .in('id', chunk as any[]);

      if (updateErr) throw updateErr;
    }
  } catch (err) {
    console.warn('syncResiToProcessed resi_items warning:', err);
  }
};

// --- PROCESSING LOGIC (ACC / TOLAK) ---

export const processOfflineOrderItem = async (
  item: OfflineOrderRow, 
  store: string | null,
  action: 'Proses' | 'Tolak'
): Promise<{ success: boolean; msg: string }> => {
  const orderTable = store === 'mjm' ? 'orders_mjm' : (store === 'bjw' ? 'orders_bjw' : null);
  const stockTable = store === 'mjm' ? 'base_mjm' : (store === 'bjw' ? 'base_bjw' : null);
  const outTable = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);

  if (!orderTable || !stockTable || !outTable) return { success: false, msg: 'Toko tidak valid' };

  // Helper untuk query berdasarkan store (BJW tidak punya id)
  const buildWhereQuery = (query: any) => {
    if (store === 'bjw') {
      return query
        .eq('tanggal', item.tanggal)
        .eq('customer', item.customer)
        .eq('part_number', item.part_number);
    }
    return query.eq('id', item.id);
  };

  try {
    // --- TOLAK = HAPUS (DELETE) ---
    if (action === 'Tolak') {
      let deleteQuery = supabase.from(orderTable).delete();
      deleteQuery = buildWhereQuery(deleteQuery);
      const { error } = await deleteQuery;
      if (error) throw error;
      return { success: true, msg: 'Pesanan ditolak dan dihapus.' };
    }

    // --- PROSES = PINDAH KE BARANG KELUAR ---
    
    // 1. Cek Stok
    const { data: currentItem, error: fetchError } = await supabase.from(stockTable).select('*').eq('part_number', item.part_number).single();
    if (fetchError || !currentItem) return { success: false, msg: 'Barang tidak ditemukan di gudang.' };
    
    if (currentItem.quantity < item.quantity) {
      return { success: false, msg: `Stok tidak cukup! (Sisa: ${currentItem.quantity})` };
    }

    // 2. Kurangi Stok
    const newQty = currentItem.quantity - item.quantity;
    const { error: updateError } = await supabase.from(stockTable).update({ quantity: newQty }).eq('part_number', item.part_number);
    if (updateError) throw updateError;

    // 3. Masukkan ke Barang Keluar (Agar muncul di Tab Terjual)
    const resiFromOrder = String((item as any).resi || (item as any).no_pesanan || '').trim();
    const finalResi = resiFromOrder && resiFromOrder !== '-' ? resiFromOrder : '-';
    const logPayload = {
      tempo: item.tempo || 'CASH',
      ecommerce: 'OFFLINE',
      customer: item.customer,
      part_number: item.part_number,
      name: item.nama_barang,
      brand: currentItem.brand || '',
      application: currentItem.application || '',
      rak: currentItem.shelf || '',
      stock_ahir: newQty,
      qty_keluar: item.quantity,
      harga_satuan: item.harga_satuan,
      harga_total: item.harga_total,
      resi: finalResi,
      created_at: getWIBDate().toISOString()
    };
    await supabase.from(outTable).insert([logPayload]);

    // 4. Update Status Order jadi 'Proses' (Agar hilang dari list Belum Diproses)
    let updateQuery = supabase.from(orderTable).update({ status: 'Proses' });
    updateQuery = buildWhereQuery(updateQuery);
    await updateQuery;

    // Sinkronkan scan_resi + resi_items jika order menyertakan resi/no_pesanan.
    await syncResiToProcessed(store, finalResi, item.part_number);

    return { success: true, msg: 'Pesanan diproses & stok dipotong.' };
  } catch (error: any) {
    console.error('Process Error:', error);
    return { success: false, msg: `Error: ${error.message}` };
  }
};

// --- SALES FLOW (KHUSUS BJW) ---
export const processSalesOrderItem = async (
  item: OfflineOrderRow,
  store: string | null,
  action: 'TERJUAL' | 'KEMBALIKAN',
  qtyToProcess?: number
): Promise<{ success: boolean; msg: string }> => {
  if (store !== 'bjw') {
    return { success: false, msg: 'Fitur Sales hanya untuk toko BJW.' };
  }

  const orderTable = 'orders_bjw';
  const stockTable = 'base_bjw';
  const outTable = 'barang_keluar_bjw';

  const originalQty = Number(item.quantity || 0);
  const processQtyRaw = qtyToProcess == null ? originalQty : Number(qtyToProcess);
  const processQty = Number.isFinite(processQtyRaw) ? Math.floor(processQtyRaw) : 0;
  if (processQty <= 0 || processQty > originalQty) {
    return { success: false, msg: `Qty tidak valid (max: ${originalQty}).` };
  }

  const remainingQty = originalQty - processQty;
  const fallbackUnitPrice = originalQty > 0 ? Math.round(Number(item.harga_total || 0) / originalQty) : 0;
  const unitPrice = Number(item.harga_satuan || 0) > 0 ? Number(item.harga_satuan || 0) : fallbackUnitPrice;
  const processedTotal = unitPrice * processQty;
  const remainingTotal = unitPrice * remainingQty;
  const hasStableId = item.id !== undefined && item.id !== null && String(item.id).trim() !== '';

  // Gunakan id jika ada, fallback ke kombinasi data order
  const buildWhereQuery = (query: any) => {
    if (hasStableId) {
      return query.eq('id', item.id);
    }
    return query
      .eq('tanggal', item.tanggal)
      .eq('customer', item.customer)
      .eq('part_number', item.part_number)
      .eq('tempo', 'SALES')
      .eq('status', 'Sales Pending');
  };

  try {
    if (action === 'KEMBALIKAN') {
      // Barang dikembalikan ke base (stok tambah lagi)
      const { data: currentItem, error: fetchError } = await supabase
        .from(stockTable)
        .select('quantity')
        .eq('part_number', item.part_number)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!currentItem) {
        return { success: false, msg: `Part ${item.part_number} tidak ditemukan di base BJW.` };
      }

      const restoredQty = Number(currentItem.quantity || 0) + processQty;
      const { error: updateStockError } = await supabase
        .from(stockTable)
        .update({ quantity: restoredQty })
        .eq('part_number', item.part_number);

      if (updateStockError) throw updateStockError;

      let updateQuery = supabase
        .from(orderTable)
        .update(
          remainingQty <= 0
            ? { status: 'Tolak' }
            : { quantity: remainingQty, harga_total: remainingTotal, tempo: 'SALES', status: 'Sales Pending' }
        );
      updateQuery = buildWhereQuery(updateQuery);
      const { error: updateOrderError } = await updateQuery;
      if (updateOrderError) throw updateOrderError;

      return { success: true, msg: `Barang dikembalikan ke base (+${processQty}).` };
    }

    // TERJUAL: stok TIDAK dikurangi lagi (sudah berkurang saat dibawa sales)
    const { data: stockItem } = await supabase
      .from(stockTable)
      .select('brand, application, shelf, quantity')
      .eq('part_number', item.part_number)
      .maybeSingle();

    const currentQty = Number(stockItem?.quantity || 0);
    const resiFromOrder = String((item as any).resi || (item as any).no_pesanan || '').trim();
    const finalResi = resiFromOrder && resiFromOrder !== '-' ? resiFromOrder : '-';
    const logPayload = {
      tempo: 'CASH', // terjual & dibayar
      ecommerce: 'SALES',
      customer: item.customer,
      part_number: item.part_number,
      name: item.nama_barang,
      brand: stockItem?.brand || '',
      application: stockItem?.application || '',
      rak: stockItem?.shelf || '',
      stock_ahir: currentQty,
      qty_keluar: processQty,
      harga_satuan: unitPrice,
      harga_total: processedTotal,
      resi: finalResi,
      created_at: getWIBDate().toISOString()
    };

    const { error: insertOutError } = await supabase.from(outTable).insert([logPayload]);
    if (insertOutError) throw insertOutError;

    let updateQuery = supabase
      .from(orderTable)
      .update(
        remainingQty <= 0
          ? { status: 'Proses' }
          : { quantity: remainingQty, harga_total: remainingTotal, tempo: 'SALES', status: 'Sales Pending' }
      );
    updateQuery = buildWhereQuery(updateQuery);
    const { error: updateOrderError } = await updateQuery;
    if (updateOrderError) throw updateOrderError;

    // Sinkronkan scan_resi + resi_items jika order menyertakan resi/no_pesanan.
    await syncResiToProcessed(store, finalResi, item.part_number);

    return { success: true, msg: `Barang Sales ditandai terjual (${processQty}).` };
  } catch (error: any) {
    console.error('processSalesOrderItem Error:', error);
    return { success: false, msg: error?.message || 'Gagal memproses data Sales.' };
  }
};

// --- SALES CORRECTION (KHUSUS BJW): EDIT QTY TANPA MENGUBAH STOK BASE ---
export const updateSalesPendingQty = async (
  item: OfflineOrderRow,
  store: string | null,
  newQtyRaw: number
): Promise<{ success: boolean; msg: string }> => {
  if (store !== 'bjw') {
    return { success: false, msg: 'Fitur edit qty Sales hanya untuk toko BJW.' };
  }

  const newQty = Number.isFinite(Number(newQtyRaw)) ? Math.floor(Number(newQtyRaw)) : 0;
  if (newQty <= 0) {
    return { success: false, msg: 'Qty baru harus lebih dari 0.' };
  }

  const originalQty = Number(item.quantity || 0);
  const fallbackUnitPrice = originalQty > 0 ? Number(item.harga_total || 0) / originalQty : 0;
  const unitPrice = Number(item.harga_satuan || 0) > 0 ? Number(item.harga_satuan || 0) : fallbackUnitPrice;
  const newTotal = Math.round(unitPrice * newQty);

  const hasStableId = item.id !== undefined && item.id !== null && String(item.id).trim() !== '';

  const updatePayload = {
    quantity: newQty,
    harga_total: newTotal,
    harga_satuan: Math.round(unitPrice),
    tempo: 'SALES',
    status: 'Sales Pending'
  };

  // Gunakan id jika ada, fallback ke kombinasi data order
  const buildWhereQuery = (query: any) => {
    if (hasStableId) {
      return query.eq('id', item.id);
    }
    return query
      .eq('tanggal', item.tanggal)
      .eq('customer', item.customer)
      .eq('part_number', item.part_number)
      .eq('tempo', 'SALES')
      .eq('status', 'Sales Pending');
  };

  try {
    let updateQuery = supabase.from('orders_bjw').update(updatePayload);
    updateQuery = buildWhereQuery(updateQuery);

    const { error } = await updateQuery;
    if (error) throw error;

    return {
      success: true,
      msg: `Qty sales diubah ke ${newQty} (stok base tidak berubah).`
    };
  } catch (error: any) {
    console.error('updateSalesPendingQty Error:', error);
    return {
      success: false,
      msg: error?.message || 'Gagal update qty sales.'
    };
  }
};

// --- SALES CORRECTION (KHUSUS BJW): HAPUS ITEM TANPA MENGUBAH STOK BASE ---
export const deleteSalesPendingItem = async (
  item: OfflineOrderRow,
  store: string | null
): Promise<{ success: boolean; msg: string }> => {
  if (store !== 'bjw') {
    return { success: false, msg: 'Fitur hapus Sales hanya untuk toko BJW.' };
  }

  const hasStableId = item.id !== undefined && item.id !== null && String(item.id).trim() !== '';

  // Gunakan id jika ada, fallback ke kombinasi data order
  const buildWhereQuery = (query: any) => {
    if (hasStableId) {
      return query.eq('id', item.id);
    }

    let q = query
      .eq('tanggal', item.tanggal)
      .eq('customer', item.customer)
      .eq('part_number', item.part_number)
      .eq('tempo', 'SALES')
      .eq('status', 'Sales Pending');

    // Tambahan filter agar lebih spesifik saat id tidak tersedia
    if (item.quantity != null) q = q.eq('quantity', item.quantity);
    if (item.harga_total != null) q = q.eq('harga_total', item.harga_total);

    return q;
  };

  try {
    let deleteQuery = supabase.from('orders_bjw').delete();
    deleteQuery = buildWhereQuery(deleteQuery);

    const { error } = await deleteQuery;
    if (error) throw error;

    return {
      success: true,
      msg: 'Item Sales dihapus (stok base tidak berubah).'
    };
  } catch (error: any) {
    console.error('deleteSalesPendingItem Error:', error);
    return {
      success: false,
      msg: error?.message || 'Gagal menghapus item Sales.'
    };
  }
};

export const processOnlineOrderItem = async (item: OnlineOrderRow, store: string | null): Promise<boolean> => {
  const scanTable = store === 'mjm' ? 'scan_resi_mjm' : (store === 'bjw' ? 'scan_resi_bjw' : null);
  const stockTable = store === 'mjm' ? 'base_mjm' : (store === 'bjw' ? 'base_bjw' : null);
  const outTable = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);

  if (!scanTable || !stockTable || !outTable) return false;

  try {
    const { data: stockItem } = await supabase.from(stockTable).select('*').eq('part_number', item.part_number).single();
    if (!stockItem || stockItem.quantity < item.quantity) {
      alert(`Stok ${item.nama_barang} tidak cukup!`);
      return false;
    }

    const newQty = stockItem.quantity - item.quantity;
    await supabase.from(stockTable).update({ quantity: newQty }).eq('part_number', item.part_number);

    await supabase.from(outTable).insert([{
      tempo: 'ONLINE',
      ecommerce: item.ecommerce,
      customer: item.customer,
      part_number: item.part_number,
      name: item.nama_barang,
      brand: stockItem.brand,
      application: stockItem.application,
      rak: stockItem.shelf,
      stock_ahir: newQty,
      qty_keluar: item.quantity,
      harga_satuan: item.harga_satuan,
      harga_total: item.harga_total,
      resi: item.resi,
      created_at: getWIBDate().toISOString()
    }]);

    await supabase.from(scanTable).update({ status: 'Diproses' }).eq('id', item.id);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

// --- OTHERS ---

export const saveOfflineOrder = async (
  cart: any[], 
  customerName: string, 
  tempo: string, 
  store: string | null,
  orderDate?: string
): Promise<boolean> => {
  const tableName = store === 'mjm' ? 'orders_mjm' : (store === 'bjw' ? 'orders_bjw' : null);
  if (!tableName) { alert("Error: Toko tidak teridentifikasi"); return false; }
  if (!cart || cart.length === 0) return false;

  const normalizedTempo = (tempo || 'CASH').trim().toUpperCase();
  const resolvedOrderDate = (orderDate || '').trim();
  const parsedOrderDate = resolvedOrderDate
    ? new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(resolvedOrderDate)
          ? `${resolvedOrderDate}T00:00:00+07:00`
          : resolvedOrderDate
      )
    : null;
  const orderTimestamp =
    parsedOrderDate && !Number.isNaN(parsedOrderDate.getTime())
      ? parsedOrderDate.toISOString()
      : getWIBDate().toISOString();

  // KHUSUS BJW + SALES:
  // - Saat input, stok langsung dikurangi (barang dibawa sales)
  // - Masuk ke orders dengan status "Sales Pending"
  if (store === 'bjw' && normalizedTempo === 'SALES') {
    const stockTable = 'base_bjw';
    const requiredByPart = new Map<string, number>();

    for (const item of cart) {
      const partNumber = String(item.partNumber || '').trim();
      const qty = Number(item.cartQuantity || 0);
      if (!partNumber || qty <= 0) {
        alert(`Data Sales tidak valid untuk part "${partNumber || '-'}".`);
        return false;
      }
      requiredByPart.set(partNumber, (requiredByPart.get(partNumber) || 0) + qty);
    }

    const stockPlans: Array<{ partNumber: string; currentQty: number; newQty: number }> = [];

    // Validasi stok dulu semua part
    for (const [partNumber, requiredQty] of requiredByPart.entries()) {
      const { data: currentStock, error: stockError } = await supabase
        .from(stockTable)
        .select('part_number, quantity')
        .eq('part_number', partNumber)
        .maybeSingle();

      if (stockError || !currentStock) {
        alert(`Part "${partNumber}" tidak ditemukan di base BJW.`);
        return false;
      }

      const currentQty = Number(currentStock.quantity || 0);
      if (currentQty < requiredQty) {
        alert(`Stok "${partNumber}" tidak cukup. Sisa: ${currentQty}, dibutuhkan: ${requiredQty}.`);
        return false;
      }

      stockPlans.push({
        partNumber,
        currentQty,
        newQty: currentQty - requiredQty
      });
    }

    const salesRows = cart.map(item => {
      const finalPrice = item.customPrice ? Number(item.customPrice) : Number(item.price);
      return {
        tanggal: orderTimestamp,
        customer: customerName,
        part_number: item.partNumber,
        nama_barang: item.name,
        quantity: Number(item.cartQuantity),
        harga_satuan: finalPrice,
        harga_total: finalPrice * Number(item.cartQuantity),
        status: 'Sales Pending',
        tempo: 'SALES'
      };
    });

    const appliedPlans: Array<{ partNumber: string; currentQty: number }> = [];

    try {
      // 1) Kurangi stok dulu
      for (const plan of stockPlans) {
        const { error: updateError } = await supabase
          .from(stockTable)
          .update({ quantity: plan.newQty })
          .eq('part_number', plan.partNumber);

        if (updateError) throw updateError;
        appliedPlans.push({ partNumber: plan.partNumber, currentQty: plan.currentQty });
      }

      // 2) Simpan daftar barang yang dibawa sales
      const { error: insertError } = await supabase.from(tableName).insert(salesRows);
      if (insertError) throw insertError;

      return true;
    } catch (e: any) {
      // Best-effort rollback stok jika insert/order gagal
      for (const rollback of appliedPlans) {
        await supabase
          .from(stockTable)
          .update({ quantity: rollback.currentQty })
          .eq('part_number', rollback.partNumber);
      }
      alert(`Gagal menyimpan order SALES: ${e?.message || e}`);
      return false;
    }
  }

  const orderRows = cart.map(item => {
    // [FIX] Gunakan customPrice jika ada, jika tidak gunakan harga asli
    const finalPrice = item.customPrice ? Number(item.customPrice) : Number(item.price);

    return {
      tanggal: orderTimestamp,
      customer: customerName,
      part_number: item.partNumber,
      nama_barang: item.name,
      quantity: Number(item.cartQuantity),
      harga_satuan: finalPrice, // Gunakan harga final (editan)
      harga_total: finalPrice * Number(item.cartQuantity), // Hitung total dari harga final
      status: 'Belum Diproses',
      tempo: tempo || 'CASH'
    };
  });

  try {
    const { error } = await supabase.from(tableName).insert(orderRows);
    if (error) throw error;
    return true;
  } catch (e: any) { 
    alert(`Gagal menyimpan order: ${e.message}`); 
    return false; 
  }
};

interface BarangKeluarFilters {
    search?: string;
    partNumber?: string;
    customer?: string;
    dateFrom?: string;
    dateTo?: string;
}

export const fetchBarangKeluarLog = async (
    store: string | null,
    page = 1,
    limit = 20,
    filters: BarangKeluarFilters | string | undefined = {}
) => {
    const table = getLogTableName('barang_keluar', store);
    const stockTable = getTableName(store);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase.from(table).select(BARANG_KELUAR_LOG_SELECT_COLUMNS, { count: 'exact' });

    if (typeof filters === 'string' && filters.trim()) {
        const search = filters.trim();
        query = query.or(`part_number.ilike.%${search}%,name.ilike.%${search}%,customer.ilike.%${search}%`);
    } else if (typeof filters === 'object') {
        if (filters.search && filters.search.trim()) {
            const search = filters.search.trim();
            query = query.or(`part_number.ilike.%${search}%,name.ilike.%${search}%,customer.ilike.%${search}%`);
        }
        if (filters.partNumber && filters.partNumber.trim()) {
            query = query.ilike('part_number', `%${filters.partNumber.trim()}%`);
        }
        if (filters.customer && filters.customer.trim()) {
            query = query.ilike('customer', `%${filters.customer.trim()}%`);
        }
        if (filters.dateFrom) {
            query = query.gte('created_at', `${filters.dateFrom}T00:00:00`);
        }
        if (filters.dateTo) {
            query = query.lte('created_at', `${filters.dateTo}T23:59:59`);
        }
    }

    // Order by id descending (newest first)
    const { data, count, error } = await query
        .order('id', { ascending: false })
        .range(from, to);

    if (error) {
        console.error("Error fetching barang keluar:", error);
        return { data: [], total: 0 };
    }

    const partNumbers = [...new Set((data || []).map(row => row.part_number).filter(Boolean))];
    const stockMap = await fetchStockQtyMapByPartNumbers(stockTable, partNumbers);
    
    const mappedData = (data || []).map(row => ({
        ...row,
        name: row.name || row.nama_barang, 
        quantity: row.qty_keluar,
        customer: row.customer || '-',
        tempo: row.tempo || 'CASH',
        current_qty: stockMap[row.part_number] ?? 0
    }));

    return { data: mappedData, total: count || 0 };
};

export const deleteBarangLog = async (
    id: number | string, 
    type: 'in' | 'out', 
    partNumber: string, 
    qty: number, 
    store: string | null,
    restoreStock: boolean = true
): Promise<boolean> => {
    const logTable = getLogTableName(type === 'in' ? 'barang_masuk' : 'barang_keluar', store);
    const stockTable = getTableName(store);
    const normalizedId = typeof id === 'string' ? id.trim() : id;
    const parsedNumericId = typeof normalizedId === 'string' && /^\d+$/.test(normalizedId)
      ? Number(normalizedId)
      : normalizedId;

    console.log('deleteBarangLog called:', { id: normalizedId, type, partNumber, qty, store, restoreStock, logTable, stockTable });

    try {
        if (normalizedId === null || normalizedId === undefined || normalizedId === '' || !partNumber || qty <= 0) {
            console.error('Invalid params:', { id: normalizedId, partNumber, qty });
            return false;
        }

        let newQty: number | null = null;
        let currentQty: number | null = null;
        let actualPartNumber = partNumber;

        if (restoreStock) {
            let { data: currentItem, error: fetchError } = await supabase
                .from(stockTable)
                .select('part_number, quantity')
                .eq('part_number', partNumber)
                .maybeSingle();

            // Fallback case-insensitive match jika exact tidak ketemu.
            if ((fetchError || !currentItem) && !fetchError) {
                const fallback = await supabase
                    .from(stockTable)
                    .select('part_number, quantity')
                    .ilike('part_number', partNumber)
                    .limit(1)
                    .maybeSingle();
                currentItem = fallback.data || null;
                fetchError = fallback.error || null;
            }

            console.log('Current stock:', currentItem, 'Error:', fetchError);

            if (fetchError || !currentItem) throw new Error("Item tidak ditemukan untuk rollback stok");

            actualPartNumber = currentItem.part_number || partNumber;
            currentQty = Number(currentItem.quantity || 0);
            newQty = currentQty;
            if (type === 'in') newQty = Math.max(0, newQty - qty);
            else newQty = newQty + qty;
            
            console.log('Stock will be updated from', currentQty, 'to', newQty, 'for part', actualPartNumber);
        }

        const { error: deleteError } = await supabase.from(logTable).delete().eq('id', parsedNumericId as any);
        if (deleteError) throw new Error("Gagal menghapus log: " + deleteError.message);

        if (restoreStock) {
            const { error: updateError } = await supabase
                .from(stockTable)
                .update({ quantity: newQty as number })
                .eq('part_number', actualPartNumber);

            if (updateError) {
                console.error("Stock update error:", updateError);
                throw new Error("WARNING: Log terhapus tapi stok gagal diupdate: " + updateError.message);
            }
            
            console.log('Stock updated successfully from', currentQty, 'to', newQty);
        }

        return true;
    } catch (e) {
        console.error("Delete Log Error:", e);
        return false;
    }
};

// INSERT BARANG KELUAR - untuk undo delete / manual insert
interface InsertBarangKeluarPayload {
  kode_toko?: string;
  tempo?: string;
  ecommerce?: string;
  customer?: string;
  part_number: string;
  name?: string;
  brand?: string;
  application?: string;
  qty_keluar: number;
  harga_total?: number;
  resi?: string;
  tanggal?: string;
}

export const insertBarangKeluar = async (
  payload: InsertBarangKeluarPayload,
  store: string | null
): Promise<{ success: boolean; msg: string; data?: any }> => {
  const outTable = getLogTableName('barang_keluar', store);
  const stockTable = getTableName(store);

  try {
    // 1. Get current stock to calculate stock_ahir and get item details
    const { data: stockItem, error: stockError } = await supabase
      .from(stockTable)
      .select('*')
      .eq('part_number', payload.part_number)
      .single();

    if (stockError || !stockItem) {
      return { success: false, msg: 'Barang tidak ditemukan di database.' };
    }

    // 2. Check stock availability
    if (stockItem.quantity < payload.qty_keluar) {
      return { success: false, msg: `Stok tidak cukup! (Sisa: ${stockItem.quantity})` };
    }

    // 3. Calculate new stock
    const newQty = stockItem.quantity - payload.qty_keluar;

    // 4. Update stock in base table
    const { error: updateError } = await supabase
      .from(stockTable)
      .update({ quantity: newQty })
      .eq('part_number', payload.part_number);

    if (updateError) {
      return { success: false, msg: 'Gagal mengupdate stok: ' + updateError.message };
    }

    // 5. Calculate harga_satuan if not provided
    const hargaTotal = payload.harga_total || 0;
    const hargaSatuan = payload.qty_keluar > 0 ? Math.round(hargaTotal / payload.qty_keluar) : 0;

    // 6. Insert into barang_keluar log
    const logPayload = {
      kode_toko: payload.kode_toko || '-',
      tempo: payload.tempo || 'CASH',
      ecommerce: payload.ecommerce || 'OFFLINE',
      customer: payload.customer || '-',
      part_number: payload.part_number,
      name: payload.name || stockItem.name || '',
      brand: payload.brand || stockItem.brand || '',
      application: payload.application || stockItem.application || '',
      rak: stockItem.shelf || '',
      stock_ahir: newQty,
      qty_keluar: payload.qty_keluar,
      harga_satuan: hargaSatuan,
      harga_total: hargaTotal,
      resi: payload.resi || '-',
      created_at: payload.tanggal || getWIBDate().toISOString()
    };

    const { data: insertedData, error: insertError } = await supabase
      .from(outTable)
      .insert([logPayload])
      .select()
      .single();

    if (insertError) {
      // Rollback stock update on insert failure
      await supabase
        .from(stockTable)
        .update({ quantity: stockItem.quantity })
        .eq('part_number', payload.part_number);
      
      return { success: false, msg: 'Gagal menyimpan log: ' + insertError.message };
    }

    return { success: true, msg: 'Barang keluar berhasil dicatat.', data: insertedData };
  } catch (e: any) {
    console.error('insertBarangKeluar Error:', e);
    return { success: false, msg: 'Error: ' + (e.message || 'Unknown error') };
  }
};

export const fetchHistory = async () => [];
export const fetchItemHistory = async () => [];

// GET UNIQUE ECOMMERCE LIST - untuk dropdown filter di modal
export const getUniqueEcommerceList = async (
  type: 'in' | 'out',
  store?: string | null
): Promise<string[]> => {
  const effectiveStore = store || 'mjm';
  const tableName = type === 'in' 
    ? getLogTableName('barang_masuk', effectiveStore)
    : getLogTableName('barang_keluar', effectiveStore);
  
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('ecommerce')
      .not('ecommerce', 'is', null)
      .not('ecommerce', 'eq', '')
      .not('ecommerce', 'eq', '-');
    
    if (error) {
      console.error('getUniqueEcommerceList Error:', error);
      return [];
    }
    
    // Extract unique values
    const uniqueSet = new Set<string>();
    (data || []).forEach((row: any) => {
      if (row.ecommerce && row.ecommerce.trim()) {
        uniqueSet.add(row.ecommerce.trim().toUpperCase());
      }
    });
    
    // Sort alphabetically
    return Array.from(uniqueSet).sort();
  } catch (e) {
    console.error('getUniqueEcommerceList Exception:', e);
    return [];
  }
};

// FETCH HISTORY LOGS PAGINATED - untuk modal detail Masuk/Keluar di Dashboard
export const fetchHistoryLogsPaginated = async (
  type: 'in' | 'out',
  page: number = 1,
  perPage: number = 50,
  filters: any = {},
  store?: string | null,
  sortBy?: string,
  sortDirection: 'asc' | 'desc' = 'desc'
): Promise<{ data: any[]; count: number }> => {
  // Determine store from context if not provided
  const effectiveStore = store || 'mjm';
  const tableName = type === 'in' 
    ? getLogTableName('barang_masuk', effectiveStore)
    : getLogTableName('barang_keluar', effectiveStore);
  const stockTable = getTableName(effectiveStore);
  
  try {
    // Build query
    let query = supabase
      .from(tableName)
      .select(type === 'in' ? BARANG_MASUK_LOG_SELECT_COLUMNS : BARANG_KELUAR_LOG_SELECT_COLUMNS, { count: 'exact' });

    // Detail Barang Masuk: exclude data retur agar tidak tampil di modal riwayat.
    if (type === 'in') {
      query = query
        .not('customer', 'ilike', '%RETUR%')
        .not('tempo', 'ilike', '%RETUR%');
    }
    
    // Handle both old string format and new object format for backwards compatibility
    if (typeof filters === 'string' && filters.trim()) {
      // Old format: search string
      const searchTerm = `%${filters.trim()}%`;
      if (type === 'in') {
        query = query.or(`nama_barang.ilike.${searchTerm},part_number.ilike.${searchTerm},customer.ilike.${searchTerm}`);
      } else {
        query = query.or(`name.ilike.${searchTerm},part_number.ilike.${searchTerm},customer.ilike.${searchTerm},resi.ilike.${searchTerm}`);
      }
    } else if (typeof filters === 'object') {
      // New format: filters object
      // Filter by customer
      if (filters.customer && filters.customer.trim()) {
        query = query.ilike('customer', `%${filters.customer.trim()}%`);
      }
      // Filter by part number
      if (filters.partNumber && filters.partNumber.trim()) {
        query = query.ilike('part_number', `%${filters.partNumber.trim()}%`);
      }
      // Filter by ecommerce
      if (filters.ecommerce && filters.ecommerce.trim()) {
        query = query.ilike('ecommerce', filters.ecommerce.trim());
      }
    }
    
    // Map frontend sort keys to database columns
    // Note: currentQty is fetched from a separate stock table after the query,
    // so we cannot sort by it at the database level. We'll handle it client-side.
    const sortColumnMap: Record<string, string> = {
      'timestamp': 'created_at',
      'partNumber': 'part_number',
      'name': type === 'in' ? 'nama_barang' : 'name',
      'quantity': type === 'in' ? 'qty_masuk' : 'qty_keluar',
      'price': 'harga_satuan',
      'totalPrice': 'harga_total',
      'customer': 'customer',
      'currentStock': type === 'in' ? 'stok_akhir' : 'stock_ahir',
      'currentQty': type === 'in' ? 'stok_akhir' : 'stock_ahir' // Use stok_akhir as proxy for currentQty
    };
    
    // Determine sort column
    const sortColumn = sortBy && sortColumnMap[sortBy] ? sortColumnMap[sortBy] : 'created_at';
    const ascending = sortDirection === 'asc';
    
    // Order and apply pagination
    const start = (page - 1) * perPage;
    query = query
      .order(sortColumn, { ascending })
      .range(start, start + perPage - 1);
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('fetchHistoryLogsPaginated Error:', error);
      return { data: [], count: 0 };
    }
    
    const partNumbers = [...new Set((data || []).map(row => row.part_number).filter(Boolean))];
    const stockMap = await fetchStockQtyMapByPartNumbers(stockTable, partNumbers);
    
    // Map data ke format StockHistory yang dipakai HistoryTable
    const mappedData = (data || []).map((row: any) => {
      const isIn = type === 'in';
      const ecommerce = row.ecommerce || '-';
      const customer = row.customer || '-';
      const resi = row.resi || '-';
      const toko = row.kode_toko || row.toko || '-';
      
      // Build reason string that parseHistoryReason can understand
      let reasonParts: string[] = [];
      if (customer !== '-') reasonParts.push(customer);
      if (resi !== '-') reasonParts.push(`(Resi: ${resi})`);
      if (ecommerce !== '-') reasonParts.push(`(Via: ${ecommerce})`);
      if (isIn && row.tempo === 'RETUR') reasonParts.push('(RETUR)');
      const reason = reasonParts.join(' ') || (isIn ? 'Restock' : 'Penjualan');
      
      // Build tempo with toko info for subInfo
      let tempoVal = row.tempo || '-';
      if (resi !== '-' && toko !== '-') {
        tempoVal = `${resi}/${toko}`;
      }
      
      return {
        id: row.id?.toString() || '',
        itemId: row.part_number || '',
        partNumber: row.part_number || '',
        name: isIn ? (row.nama_barang || '') : (row.name || ''),
        type: type,
        quantity: isIn ? (row.qty_masuk || 0) : (row.qty_keluar || 0),
        previousStock: 0,
        currentStock: isIn ? (row.stok_akhir || 0) : (row.stock_ahir || 0),
        currentQty: stockMap[row.part_number] ?? 0,
        price: row.harga_satuan || 0,
        totalPrice: row.harga_total || 0,
        timestamp: row.created_at ? new Date(row.created_at).getTime() : null,
        reason: reason,
        resi: resi,
        tempo: tempoVal,
        customer: customer
      };
    });
    
    return { data: mappedData, count: count || 0 };
  } catch (e) {
    console.error('fetchHistoryLogsPaginated Exception:', e);
    return { data: [], count: 0 };
  }
};
export const addBarangMasuk = async () => {};
export const addBarangKeluar = async () => {};
export const fetchBarangMasuk = async () => [];
export const fetchBarangKeluar = async () => [];

// Fetch riwayat harga modal dari barang_masuk
export const fetchPriceHistoryBySource = async (partNumber: string, store?: string | null): Promise<{ source: string; price: number; date: string; isOfficial?: boolean }[]> => {
  if (!partNumber) return [];
  
  // Try both stores if store not specified
  const stores = store ? [store] : ['mjm', 'bjw'];
  const allHistory: { source: string; price: number; date: string; timestamp: number; isOfficial?: boolean }[] = [];
  
  for (const s of stores) {
    const logTable = getLogTableName('barang_masuk', s);
    try {
      const { data, error } = await supabase
        .from(logTable)
        .select('harga_satuan, customer, created_at')
        .eq('part_number', partNumber.trim())
        .not('harga_satuan', 'is', null)
        .gt('harga_satuan', 0)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (!error && data) {
        data.forEach((row: any) => {
          const dateObj = new Date(row.created_at);
          allHistory.push({
            source: row.customer || (s === 'mjm' ? 'MJM' : 'BJW'),
            price: Number(row.harga_satuan || 0),
            date: dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
            timestamp: dateObj.getTime(),
            isOfficial: false
          });
        });
      }
    } catch (e) {
      console.error(`Error fetching price history from ${logTable}:`, e);
    }
  }
  
  // Sort by timestamp descending and return without timestamp
  return allHistory
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(({ source, price, date, isOfficial }) => ({ source, price, date, isOfficial }));
};

// Fetch riwayat harga jual dari list_harga_jual dan barang_keluar
export const fetchSellPriceHistory = async (partNumber: string, store?: string | null): Promise<{ source: string; price: number; date: string; isOfficial?: boolean }[]> => {
  if (!partNumber) return [];
  
  const allHistory: { source: string; price: number; date: string; timestamp: number; isOfficial: boolean }[] = [];
  
  // 1. Ambil harga dari list_harga_jual (harga resmi)
  try {
    const { data: officialData, error: officialError } = await supabase
      .from('list_harga_jual')
      .select('harga, name, created_at')
      .eq('part_number', partNumber.trim())
      .maybeSingle();
    
    if (!officialError && officialData && officialData.harga > 0) {
      const dateObj = officialData.created_at ? new Date(officialData.created_at) : new Date();
      allHistory.push({
        source: 'HARGA RESMI',
        price: Number(officialData.harga || 0),
        date: dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
        timestamp: Date.now() + 1000000, // Ensure it's always at top
        isOfficial: true
      });
    }
  } catch (e) {
    console.error('Error fetching official price:', e);
  }
  
  // 2. Ambil history dari barang_keluar
  const stores = store ? [store] : ['mjm', 'bjw'];
  
  for (const s of stores) {
    const logTable = getLogTableName('barang_keluar', s);
    try {
      const { data, error } = await supabase
        .from(logTable)
        .select('harga_satuan, customer, created_at')
        .eq('part_number', partNumber.trim())
        .not('harga_satuan', 'is', null)
        .gt('harga_satuan', 0)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (!error && data) {
        data.forEach((row: any) => {
          const dateObj = new Date(row.created_at);
          allHistory.push({
            source: row.customer || (s === 'mjm' ? 'MJM' : 'BJW'),
            price: Number(row.harga_satuan || 0),
            date: dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
            timestamp: dateObj.getTime(),
            isOfficial: false
          });
        });
      }
    } catch (e) {
      console.error(`Error fetching sell price history from ${logTable}:`, e);
    }
  }
  
  // Sort: official first, then by timestamp descending
  return allHistory
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(({ source, price, date, isOfficial }) => ({ source, price, date, isOfficial }));
};
export const fetchChatSessions = async () => [];
export const fetchChatMessages = async () => [];
export const sendChatMessage = async () => {};
export const markMessagesAsRead = async () => {};
export const fetchRetur = async () => [];
export const saveReturRecord = async () => {};
export const fetchReturRecords = fetchRetur;
export const addReturTransaction = saveReturRecord;
export const updateReturKeterangan = async () => {};
export const fetchScanResiLogs = async () => [];
export const addScanResiLog = async () => {};
export const saveScanResiLog = addScanResiLog;
export const updateScanResiLogField = async () => {};
export const deleteScanResiLog = async () => {};
export const duplicateScanResiLog = async () => {};
export const processShipmentToOrders = async () => {};
export const importScanResiFromExcel = async () => ({ success: true, skippedCount: 0 });
export const saveItemImages = async (itemId: string, images: string[], store?: string | null): Promise<void> => { };

// --- RETUR FUNCTIONS ---

const getReturTableName = (store: string | null | undefined) => {
  if (store === 'mjm') return 'retur_mjm';
  if (store === 'bjw') return 'retur_bjw';
  return 'retur_mjm';
};

// Create retur from sold item
export const createReturFromSold = async (
  soldItem: any,
  tipeRetur: 'BALIK_STOK' | 'RUSAK' | 'TUKAR_SUPPLIER' | 'TUKAR_SUPPLIER_GANTI',
  qty: number,
  keterangan: string,
  store: string | null
): Promise<{ success: boolean; msg: string }> => {
  const returTable = getReturTableName(store);
  const stockTable = getTableName(store);
  const outTable = getLogTableName('barang_keluar', store);
  
  // Get part_number from soldItem (field bisa 'part_number' atau lainnya)
  const partNum = (soldItem.part_number || '').trim();
  const namaBarang = soldItem.name || soldItem.nama_barang || '';
  const hargaSatuan = soldItem.qty_keluar > 0 ? (soldItem.harga_total / soldItem.qty_keluar) : 0;
  
  console.log('createReturFromSold: Processing', {
    part_number: partNum,
    nama_barang: namaBarang,
    qty_retur: qty,
    tipe: tipeRetur
  });
  
  try {
    // 1. Insert retur record sesuai skema database retur_bjw/retur_mjm
    const returPayload = {
      tanggal_retur: getWIBDate().toISOString(),
      tanggal_pemesanan: soldItem.created_at || getWIBDate().toISOString(),
      resi: soldItem.resi || '-',
      toko: store?.toUpperCase() || '-', // Kolom 'toko' ada di skema
      customer: soldItem.customer || '-',
      part_number: partNum,
      nama_barang: namaBarang,
      quantity: qty,
      harga_satuan: hargaSatuan,
      harga_total: hargaSatuan * qty,
      tipe_retur: tipeRetur,
      status: tipeRetur === 'BALIK_STOK' ? 'Selesai' : 'Pending',
      keterangan: keterangan || '-',
      ecommerce: soldItem.ecommerce || 'OFFLINE'
    };
    
    console.log('createReturFromSold: Inserting retur', returPayload);
    
    const { error: insertError } = await supabase.from(returTable).insert([returPayload]);
    if (insertError) throw new Error('Gagal insert retur: ' + insertError.message);
    
    // 2. Hapus atau kurangi qty dari barang_keluar
    if (qty >= soldItem.qty_keluar) {
      // Hapus seluruh record jika retur semua qty
      await supabase.from(outTable).delete().eq('id', soldItem.id);
    } else {
      // Kurangi qty jika retur sebagian
      const newQtyKeluar = soldItem.qty_keluar - qty;
      const newHargaTotal = (soldItem.harga_total / soldItem.qty_keluar) * newQtyKeluar;
      await supabase.from(outTable).update({
        qty_keluar: newQtyKeluar,
        harga_total: newHargaTotal
      }).eq('id', soldItem.id);
    }
    
    // 3. Jika BALIK_STOK, kembalikan ke inventory (base_bjw/base_mjm)
    if (tipeRetur === 'BALIK_STOK') {
      console.log('BALIK_STOK: Looking for part_number:', partNum, 'in table:', stockTable);
      
      if (!partNum) {
        console.error('BALIK_STOK: part_number is empty!');
        return { success: true, msg: `Retur tercatat, tapi part_number kosong!` };
      }
      
      // Query dengan ilike untuk case-insensitive match
      const { data: currentItem, error: fetchError } = await supabase
        .from(stockTable)
        .select('quantity, name, part_number')
        .ilike('part_number', partNum)
        .single();
      
      if (fetchError) {
        console.error('BALIK_STOK: Error fetching item:', fetchError);
        return { success: true, msg: `Retur tercatat, tapi gagal update stok: ${fetchError.message}` };
      }
      
      if (currentItem) {
        const newQty = (currentItem.quantity || 0) + qty;
        console.log('BALIK_STOK: Updating quantity from', currentItem.quantity, 'to', newQty);
        
        // Use the actual part_number from database to ensure exact match
        const actualPartNumber = currentItem.part_number || partNum;
        
        // Note: base_bjw/base_mjm hanya punya kolom: part_number, name, application, quantity, shelf, brand, created_at
        const { error: updateError } = await supabase
          .from(stockTable)
          .update({ quantity: newQty })
          .eq('part_number', actualPartNumber);
        
        if (updateError) {
          console.error('BALIK_STOK: Error updating stock:', updateError);
          return { success: true, msg: `Retur tercatat, tapi gagal update stok: ${updateError.message}` };
        }
        
        // Log to barang_masuk sesuai skema: part_number, nama_barang, qty_masuk, harga_satuan, harga_total, customer, ecommerce, tempo, stok_akhir
        const inTable = getLogTableName('barang_masuk', store);
        await supabase.from(inTable).insert([{
          part_number: actualPartNumber,
          nama_barang: namaBarang || currentItem.name || '',
          qty_masuk: qty,
          stok_akhir: newQty,
          harga_satuan: hargaSatuan,
          harga_total: hargaSatuan * qty,
          customer: soldItem.customer || '-',
          tempo: 'RETUR',
          ecommerce: soldItem.ecommerce || 'OFFLINE'
        }]);
        
        return { success: true, msg: `Barang dikembalikan ke stok (+${qty}), total: ${newQty}` };
      } else {
        console.error('BALIK_STOK: Item not found for part_number:', partNum);
        return { success: true, msg: `Retur tercatat, tapi item tidak ditemukan di inventory` };
      }
    }
    
    // 4. Jika RUSAK, tidak ada aksi stok
    if (tipeRetur === 'RUSAK') {
      return { success: true, msg: `Retur rusak tercatat (tidak balik stok)` };
    }
    
    // 5. Jika TUKAR_SUPPLIER, pending sampai dikonfirmasi
    if (tipeRetur === 'TUKAR_SUPPLIER') {
      return { success: true, msg: `Retur dikirim ke supplier (menunggu penukaran)` };
    }

    // 6. Jika TUKAR_SUPPLIER_GANTI, kurangi stok (ganti barang) dan pending penukaran supplier
    if (tipeRetur === 'TUKAR_SUPPLIER_GANTI') {
      if (!partNum) {
        return { success: true, msg: `Retur tercatat, tapi part_number kosong!` };
      }

      // Ambil stok saat ini
      const { data: currentItem, error: fetchError } = await supabase
        .from(stockTable)
        .select('quantity, name, part_number')
        .ilike('part_number', partNum)
        .single();

      if (fetchError) {
        console.error('TUKAR_SUPPLIER_GANTI: Error fetching item:', fetchError);
        return { success: true, msg: `Retur tercatat, tapi gagal update stok: ${fetchError.message}` };
      }

      if (currentItem) {
        const newQty = (currentItem.quantity || 0) - qty;
        const actualPartNumber = currentItem.part_number || partNum;

        const { error: updateError } = await supabase
          .from(stockTable)
          .update({ quantity: newQty })
          .eq('part_number', actualPartNumber);

        if (updateError) {
          console.error('TUKAR_SUPPLIER_GANTI: Error updating stock:', updateError);
          return { success: true, msg: `Retur tercatat, tapi gagal update stok: ${updateError.message}` };
        }

        return { success: true, msg: `Stok berkurang (${qty}) untuk ganti barang, menunggu tukar supplier` };
      }

      return { success: true, msg: `Retur tercatat, tapi item tidak ditemukan di inventory` };
    }
    
    return { success: true, msg: 'Retur berhasil' };
  } catch (e: any) {
    console.error('createReturFromSold Error:', e);
    return { success: false, msg: e.message || 'Gagal proses retur' };
  }
};

// Update retur status (for TUKAR_SUPPLIER when exchanged)
export const updateReturStatus = async (
  returId: number,
  newStatus: string,
  store: string | null
): Promise<{ success: boolean; msg: string }> => {
  const returTable = getReturTableName(store);
  const stockTable = getTableName(store);
  
  try {
    // Get retur data first
    const { data: returData, error: fetchError } = await supabase
      .from(returTable)
      .select('*')
      .eq('id', returId)
      .single();
    
    if (fetchError || !returData) {
      return { success: false, msg: 'Retur tidak ditemukan' };
    }
    
    // Update status
    const { error: updateError } = await supabase
      .from(returTable)
      .update({ status: newStatus })
      .eq('id', returId);
    
    if (updateError) throw new Error('Gagal update status: ' + updateError.message);
    
    // If "Sudah Ditukar", return item to stock
    if (newStatus === 'Sudah Ditukar' && (returData.tipe_retur === 'TUKAR_SUPPLIER' || returData.tipe_retur === 'TUKAR_SUPPLIER_GANTI')) {
      const partNum = (returData.part_number || '').trim();
      console.log('TUKAR_SUPPLIER: Looking for part_number:', partNum, 'in table:', stockTable);
      
      if (!partNum) {
        return { success: true, msg: `Status diupdate, tapi part_number kosong!` };
      }
      
      // Cari item berdasarkan part_number (case-insensitive) - base table punya kolom: name bukan nama_barang
      const { data: currentItem, error: itemError } = await supabase
        .from(stockTable)
        .select('quantity, name, part_number')
        .ilike('part_number', partNum)
        .single();
      
      if (itemError) {
        console.error('Error finding item:', itemError);
        return { success: true, msg: `Status diupdate, tapi gagal update stok: ${itemError.message}` };
      }
      
      if (currentItem) {
        const newQty = (currentItem.quantity || 0) + (returData.quantity || 0);
        const actualPartNumber = currentItem.part_number || partNum;
        
        console.log('TUKAR_SUPPLIER: Updating quantity from', currentItem.quantity, 'to', newQty);
        
        // Update quantity di base table (tidak ada kolom last_updated di skema)
        const { error: updateStockError } = await supabase
          .from(stockTable)
          .update({ quantity: newQty })
          .eq('part_number', actualPartNumber);
        
        if (updateStockError) {
          console.error('Error updating stock:', updateStockError);
          return { success: true, msg: `Status diupdate, tapi gagal update stok: ${updateStockError.message}` };
        }
        
        // Log to barang_masuk sesuai skema
        const inTable = getLogTableName('barang_masuk', store);
        await supabase.from(inTable).insert([{
          part_number: actualPartNumber,
          nama_barang: returData.nama_barang || currentItem.name || '',
          qty_masuk: returData.quantity,
          stok_akhir: newQty,
          harga_satuan: returData.harga_satuan || 0,
          harga_total: returData.harga_total || 0,
          customer: 'TUKAR SUPPLIER',
          tempo: 'RETUR',
          ecommerce: returData.ecommerce || '-'
        }]);
        
        return { success: true, msg: `Stok dikembalikan (+${returData.quantity}), total: ${newQty}` };
      }
    }
    
    return { success: true, msg: 'Status retur diupdate' };
  } catch (e: any) {
    console.error('updateReturStatus Error:', e);
    return { success: false, msg: e.message || 'Gagal update status' };
  }
};

// --- BARANG KOSONG (LOW STOCK) FUNCTIONS ---

export interface LowStockItem {
  partNumber: string;
  name: string;
  brand: string;
  application: string;
  quantity: number;
  shelf: string;
  suppliers: SupplierHistory[];
}

export interface SupplierHistory {
  supplier: string;
  lastDate: string;
  lastPrice: number;
  lastPriceCash: number;
  lastPriceTempo: number;
  totalQtyPurchased: number;
  purchaseCount: number;
}

export interface SupplierOrderGroup {
  supplier: string;
  items: LowStockOrderItem[];
  totalItems: number;
}

export interface LowStockOrderItem {
  partNumber: string;
  name: string;
  brand: string;
  application: string;
  currentStock: number;
  shelf: string;
  lastPrice: number;
  lastPriceCash: number;
  lastPriceTempo: number;
  orderQty: number;
  isSelected: boolean;
}

// Fetch all items with quantity < threshold (default 5) - Optimized with batch loading
export const fetchLowStockItems = async (
  store: string | null, 
  threshold: number = 5,
  onProgress?: (progress: number, currentItem: string) => void
): Promise<LowStockItem[]> => {
  const table = getTableName(store);
  const logTable = getLogTableName('barang_masuk', store);
  if (!table || !logTable) return [];

  try {
    // Step 1: Fetch items with low stock (10%)
    onProgress?.(5, 'Mengambil data stok...');

    const items = await fetchAllRowsForModalFiltered<any>(
      table,
      '*',
      'quantity',
      (q) => q.lt('quantity', threshold),
      true
    );

    if (items.length === 0) {
      onProgress?.(100, 'Selesai');
      return [];
    }

    onProgress?.(15, `Ditemukan ${items.length} barang stok rendah`);

    // Step 2: Batch fetch ALL supplier history in ONE query (much faster!)
    const partNumbers = items.map(i => i.part_number);
    
    onProgress?.(20, 'Mengambil data supplier...');

    const supplierData = await fetchAllRowsForModalFiltered<any>(
      logTable,
      'part_number, customer, created_at, harga_satuan, qty_masuk, tempo',
      'created_at',
      (q) =>
        q
          .in('part_number', partNumbers)
          .not('customer', 'is', null)
          .not('customer', 'eq', '')
          .not('customer', 'eq', '-'),
      false
    );

    onProgress?.(60, 'Memproses data supplier...');

    // Step 3: Group supplier data by part_number
    const supplierByPart: Record<string, typeof supplierData> = {};
    if (supplierData) {
      for (const row of supplierData) {
        if (!supplierByPart[row.part_number]) {
          supplierByPart[row.part_number] = [];
        }
        supplierByPart[row.part_number].push(row);
      }
    }

    onProgress?.(75, 'Menyusun hasil...');

    // Step 4: Build result with supplier history
    const result: LowStockItem[] = [];
    const totalItems = items.length;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const partSupplierData = supplierByPart[item.part_number] || [];
      
      // Process supplier data for this item
      const supplierMap: Record<string, { 
        lastDate: string; 
        lastPrice: number;
        lastPriceCash: number;
        lastPriceTempo: number;
        lastCashDate: string;
        lastTempoDate: string;
        totalQty: number; 
        count: number 
      }> = {};

      for (const row of partSupplierData) {
        const supplier = (row.customer || '').trim().toUpperCase();
        if (!supplier || supplier === '-') continue;

        const tempo = (row.tempo || 'CASH').toUpperCase();
        const isTempo = tempo.includes('TEMPO') || tempo.includes('3 BLN') || tempo.includes('3BLN');
        const price = row.harga_satuan || 0;
        const rowDate = row.created_at;

        if (!supplierMap[supplier]) {
          supplierMap[supplier] = {
            lastDate: rowDate,
            lastPrice: price,
            lastPriceCash: isTempo ? 0 : price,
            lastPriceTempo: isTempo ? price : 0,
            lastCashDate: isTempo ? '' : rowDate,
            lastTempoDate: isTempo ? rowDate : '',
            totalQty: row.qty_masuk || 0,
            count: 1
          };
        } else {
          supplierMap[supplier].totalQty += row.qty_masuk || 0;
          supplierMap[supplier].count += 1;
          
          if (new Date(rowDate) > new Date(supplierMap[supplier].lastDate)) {
            supplierMap[supplier].lastDate = rowDate;
            supplierMap[supplier].lastPrice = price;
          }
          
          if (!isTempo && price > 0) {
            if (!supplierMap[supplier].lastCashDate || new Date(rowDate) > new Date(supplierMap[supplier].lastCashDate)) {
              supplierMap[supplier].lastPriceCash = price;
              supplierMap[supplier].lastCashDate = rowDate;
            }
          }
          
          if (isTempo && price > 0) {
            if (!supplierMap[supplier].lastTempoDate || new Date(rowDate) > new Date(supplierMap[supplier].lastTempoDate)) {
              supplierMap[supplier].lastPriceTempo = price;
              supplierMap[supplier].lastTempoDate = rowDate;
            }
          }
        }
      }

      const suppliers: SupplierHistory[] = Object.entries(supplierMap)
        .map(([supplier, data]) => ({
          supplier,
          lastDate: data.lastDate,
          lastPrice: data.lastPrice,
          lastPriceCash: data.lastPriceCash,
          lastPriceTempo: data.lastPriceTempo,
          totalQtyPurchased: data.totalQty,
          purchaseCount: data.count
        }))
        .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());

      result.push({
        partNumber: item.part_number,
        name: item.name || '',
        brand: item.brand || '',
        application: item.application || '',
        quantity: item.quantity || 0,
        shelf: item.shelf || '',
        suppliers
      });

      // Update progress every 10 items
      if (i % 10 === 0) {
        const progress = 75 + Math.floor((i / totalItems) * 25);
        onProgress?.(progress, `Memproses ${i + 1}/${totalItems}...`);
      }
    }

    onProgress?.(100, 'Selesai!');
    return result;
  } catch (err) {
    console.error('fetchLowStockItems Exception:', err);
    return [];
  }
};

// Fetch supplier history for a specific part number
export const fetchSupplierHistoryForItem = async (store: string | null, partNumber: string): Promise<SupplierHistory[]> => {
  const logTable = getLogTableName('barang_masuk', store);
  if (!logTable) return [];

  try {
    const data = await fetchAllRowsForModalFiltered<any>(
      logTable,
      'customer, created_at, harga_satuan, qty_masuk, tempo',
      'created_at',
      (q) =>
        q
          .eq('part_number', partNumber)
          .not('customer', 'is', null)
          .not('customer', 'eq', '')
          .not('customer', 'eq', '-'),
      false
    );

    // Group by supplier with separate CASH and TEMPO prices
    const supplierMap: Record<string, { 
      lastDate: string; 
      lastPrice: number;
      lastPriceCash: number;
      lastPriceTempo: number;
      lastCashDate: string;
      lastTempoDate: string;
      totalQty: number; 
      count: number 
    }> = {};

    for (const row of data) {
      const supplier = (row.customer || '').trim().toUpperCase();
      if (!supplier || supplier === '-') continue;

      const tempo = (row.tempo || 'CASH').toUpperCase();
      const isTempo = tempo.includes('TEMPO') || tempo.includes('3 BLN') || tempo.includes('3BLN');
      const price = row.harga_satuan || 0;
      const rowDate = row.created_at;

      if (!supplierMap[supplier]) {
        supplierMap[supplier] = {
          lastDate: rowDate,
          lastPrice: price,
          lastPriceCash: isTempo ? 0 : price,
          lastPriceTempo: isTempo ? price : 0,
          lastCashDate: isTempo ? '' : rowDate,
          lastTempoDate: isTempo ? rowDate : '',
          totalQty: row.qty_masuk || 0,
          count: 1
        };
      } else {
        supplierMap[supplier].totalQty += row.qty_masuk || 0;
        supplierMap[supplier].count += 1;
        
        // Update latest overall date/price
        if (new Date(rowDate) > new Date(supplierMap[supplier].lastDate)) {
          supplierMap[supplier].lastDate = rowDate;
          supplierMap[supplier].lastPrice = price;
        }
        
        // Update CASH price if this is the latest CASH transaction
        if (!isTempo && price > 0) {
          if (!supplierMap[supplier].lastCashDate || new Date(rowDate) > new Date(supplierMap[supplier].lastCashDate)) {
            supplierMap[supplier].lastPriceCash = price;
            supplierMap[supplier].lastCashDate = rowDate;
          }
        }
        
        // Update TEMPO price if this is the latest TEMPO transaction
        if (isTempo && price > 0) {
          if (!supplierMap[supplier].lastTempoDate || new Date(rowDate) > new Date(supplierMap[supplier].lastTempoDate)) {
            supplierMap[supplier].lastPriceTempo = price;
            supplierMap[supplier].lastTempoDate = rowDate;
          }
        }
      }
    }

    return Object.entries(supplierMap).map(([supplier, data]) => ({
      supplier,
      lastDate: data.lastDate,
      lastPrice: data.lastPrice,
      lastPriceCash: data.lastPriceCash,
      lastPriceTempo: data.lastPriceTempo,
      totalQtyPurchased: data.totalQty,
      purchaseCount: data.count
    })).sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  } catch (err) {
    console.error('fetchSupplierHistoryForItem Exception:', err);
    return [];
  }
};

// Get items grouped by supplier for ordering
export const getLowStockGroupedBySupplier = async (
  store: string | null, 
  threshold: number = 5,
  onProgress?: (progress: number, currentItem: string) => void
): Promise<SupplierOrderGroup[]> => {
  const lowStockItems = await fetchLowStockItems(store, threshold, onProgress);
  
  // Group items by their primary supplier (most recent)
  const supplierGroups: Record<string, LowStockOrderItem[]> = {};
  const noSupplierItems: LowStockOrderItem[] = [];

  for (const item of lowStockItems) {
    const primarySupplierData = item.suppliers[0];
    const orderItem: LowStockOrderItem = {
      partNumber: item.partNumber,
      name: item.name,
      brand: item.brand,
      application: item.application,
      currentStock: item.quantity,
      shelf: item.shelf,
      lastPrice: primarySupplierData?.lastPrice || 0,
      lastPriceCash: primarySupplierData?.lastPriceCash || 0,
      lastPriceTempo: primarySupplierData?.lastPriceTempo || 0,
      orderQty: 0,
      isSelected: false
    };

    if (item.suppliers.length > 0) {
      const primarySupplier = item.suppliers[0].supplier;
      if (!supplierGroups[primarySupplier]) {
        supplierGroups[primarySupplier] = [];
      }
      supplierGroups[primarySupplier].push(orderItem);
    } else {
      noSupplierItems.push(orderItem);
    }
  }

  const result: SupplierOrderGroup[] = Object.entries(supplierGroups)
    .map(([supplier, items]) => ({
      supplier,
      items,
      totalItems: items.length
    }))
    .sort((a, b) => b.totalItems - a.totalItems);

  // Add "Tanpa Supplier" group if exists
  if (noSupplierItems.length > 0) {
    result.push({
      supplier: 'TANPA SUPPLIER',
      items: noSupplierItems,
      totalItems: noSupplierItems.length
    });
  }

  return result;
};

// Save order to supplier (creates a record of the order)
export interface SupplierOrder {
  id?: number;
  created_at?: string;
  supplier: string;
  items: { partNumber: string; name: string; qty: number; price: number }[];
  status: 'PENDING' | 'ORDERED' | 'RECEIVED';
  notes: string;
  total_items: number;
  total_value: number;
}

export const saveSupplierOrder = async (store: string | null, order: SupplierOrder): Promise<{ success: boolean; msg: string }> => {
  // For now, we'll store orders in localStorage since we may not have a dedicated table
  try {
    const storageKey = `supplier_orders_${store || 'default'}`;
    const existingOrders = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    const newOrder = {
      ...order,
      id: Date.now(),
      created_at: new Date().toISOString(),
      status: 'PENDING' as const
    };
    
    existingOrders.unshift(newOrder);
    localStorage.setItem(storageKey, JSON.stringify(existingOrders));
    
    return { success: true, msg: 'Order berhasil disimpan' };
  } catch (err) {
    console.error('saveSupplierOrder Error:', err);
    return { success: false, msg: 'Gagal menyimpan order' };
  }
};

export const fetchSupplierOrders = async (store: string | null): Promise<SupplierOrder[]> => {
  try {
    const storageKey = `supplier_orders_${store || 'default'}`;
    const orders = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return orders;
  } catch (err) {
    console.error('fetchSupplierOrders Error:', err);
    return [];
  }
};

export const updateSupplierOrderStatus = async (
  store: string | null, 
  orderId: number, 
  status: 'PENDING' | 'ORDERED' | 'RECEIVED'
): Promise<{ success: boolean; msg: string }> => {
  try {
    const storageKey = `supplier_orders_${store || 'default'}`;
    const orders = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    const orderIndex = orders.findIndex((o: SupplierOrder) => o.id === orderId);
    if (orderIndex === -1) {
      return { success: false, msg: 'Order tidak ditemukan' };
    }
    
    orders[orderIndex].status = status;
    localStorage.setItem(storageKey, JSON.stringify(orders));
    
    return { success: true, msg: 'Status order diupdate' };
  } catch (err) {
    console.error('updateSupplierOrderStatus Error:', err);
    return { success: false, msg: 'Gagal update status' };
  }
};

export const deleteSupplierOrder = async (store: string | null, orderId: number): Promise<{ success: boolean; msg: string }> => {
  try {
    const storageKey = `supplier_orders_${store || 'default'}`;
    const orders = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    const filtered = orders.filter((o: SupplierOrder) => o.id !== orderId);
    localStorage.setItem(storageKey, JSON.stringify(filtered));
    
    return { success: true, msg: 'Order dihapus' };
  } catch (err) {
    console.error('deleteSupplierOrder Error:', err);
    return { success: false, msg: 'Gagal menghapus order' };
  }
};

// --- FETCH SUPPLIER PRICES BY PART NUMBER ---
// Returns list of suppliers/importers with their prices for a given part number
export interface SupplierPriceInfo {
  supplier: string;
  harga_satuan: number;
  tempo: string;
  last_order_date: string;
  qty_last: number;
}

export const fetchSupplierPricesByPartNumber = async (
  store: string | null,
  partNumber: string
): Promise<SupplierPriceInfo[]> => {
  const tableMasuk = store === 'mjm' ? 'barang_masuk_mjm' : (store === 'bjw' ? 'barang_masuk_bjw' : null);
  if (!tableMasuk || !partNumber) return [];

  try {
    // Fetch all purchase records for this part number
    const { data, error } = await supabase
      .from(tableMasuk)
      .select('customer, harga_satuan, tempo, qty_masuk, created_at')
      .ilike('part_number', partNumber)
      .not('customer', 'is', null)
      .not('customer', 'eq', '')
      .not('customer', 'eq', '-')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch Supplier Prices Error:', error);
      return [];
    }

    // Group by supplier, keep only the latest entry per supplier
    const supplierMap: Record<string, SupplierPriceInfo> = {};
    
    (data || []).forEach(row => {
      const supplier = row.customer?.trim().toUpperCase() || '';
      if (!supplier || supplier === '-') return;
      
      // Only keep the first (most recent) entry per supplier
      if (!supplierMap[supplier]) {
        supplierMap[supplier] = {
          supplier,
          harga_satuan: row.harga_satuan || 0,
          tempo: row.tempo || '-',
          last_order_date: row.created_at,
          qty_last: row.qty_masuk || 0
        };
      }
    });

    // Convert to array and sort by price (lowest first)
    return Object.values(supplierMap).sort((a, b) => a.harga_satuan - b.harga_satuan);
  } catch (err) {
    console.error('Fetch Supplier Prices Exception:', err);
    return [];
  }
};

// --- FETCH PRICE HISTORY BY PART NUMBER ---
// Returns history of cost prices (harga modal from barang_masuk) and selling prices (harga jual from barang_keluar)
export interface PriceHistoryItem {
  type: 'modal' | 'jual';
  harga: number;
  date: string;
  customer: string;
  qty: number;
  tempo?: string;
}

export const fetchPriceHistoryByPartNumber = async (
  store: string | null,
  partNumber: string
): Promise<PriceHistoryItem[]> => {
  const tableMasuk = store === 'mjm' ? 'barang_masuk_mjm' : (store === 'bjw' ? 'barang_masuk_bjw' : null);
  const tableKeluar = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!tableMasuk || !tableKeluar || !partNumber) return [];

  try {
    // Fetch cost price history (harga modal) from barang_masuk
    const { data: masukData, error: masukError } = await supabase
      .from(tableMasuk)
      .select('harga_satuan, qty_masuk, customer, tempo, created_at')
      .ilike('part_number', partNumber)
      .not('harga_satuan', 'is', null)
      .gt('harga_satuan', 0)
      .order('created_at', { ascending: false })
      .limit(20);

    // Fetch selling price history (harga jual) from barang_keluar
    const { data: keluarData, error: keluarError } = await supabase
      .from(tableKeluar)
      .select('harga_satuan, qty_keluar, customer, ecommerce, created_at')
      .ilike('part_number', partNumber)
      .not('harga_satuan', 'is', null)
      .gt('harga_satuan', 0)
      .order('created_at', { ascending: false })
      .limit(20);

    const history: PriceHistoryItem[] = [];

    // Add cost prices (harga modal)
    (masukData || []).forEach(row => {
      history.push({
        type: 'modal',
        harga: row.harga_satuan || 0,
        date: row.created_at,
        customer: row.customer || '-',
        qty: row.qty_masuk || 0,
        tempo: row.tempo || '-'
      });
    });

    // Add selling prices (harga jual)
    (keluarData || []).forEach(row => {
      history.push({
        type: 'jual',
        harga: row.harga_satuan || 0,
        date: row.created_at,
        customer: row.customer || row.ecommerce || '-',
        qty: row.qty_keluar || 0
      });
    });

    // Sort by date descending
    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return history;
  } catch (err) {
    console.error('Fetch Price History Exception:', err);
    return [];
  }
};
