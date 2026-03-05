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
const READ_QUERY_CACHE_MAX_ENTRIES = 600;
const SEARCH_SUGGESTIONS_CACHE_TTL_MS = 60 * 1000; // 1 menit
const DISTINCT_VALUES_CACHE_TTL_MS = 30 * 60 * 1000; // 30 menit
const INVENTORY_BY_PART_CACHE_TTL_MS = 2 * 60 * 1000; // 2 menit
const INVENTORY_LIST_CACHE_TTL_MS = 90 * 1000; // 90 detik
const INVENTORY_STATS_CACHE_TTL_MS = 60 * 1000; // 1 menit
const SHOP_ITEMS_CACHE_TTL_MS = 90 * 1000; // 90 detik
const EXACT_ITEM_CACHE_TTL_MS = 90 * 1000; // 90 detik
const SOLD_ITEMS_PROGRESSIVE_CACHE_TTL_MS = 30 * 1000; // 30 detik
// Browser localStorage cache dinonaktifkan sesuai permintaan.
const ENABLE_LOCAL_STORAGE_CACHE = false;
// Tetap izinkan cache in-memory (non-persistent) untuk dedupe dan performa UI.
const ENABLE_MEMORY_QUERY_CACHE = true;
const ENABLE_MEMORY_PRICE_CACHE = true;

interface ReadQueryCacheEntry {
  value: unknown;
  expiresAt: number;
  updatedAt: number;
}

const readQueryCache = new Map<string, ReadQueryCacheEntry>();
const inFlightReadQueries = new Map<string, Promise<unknown>>();
const storeReadCacheVersion = new Map<string, number>();
const soldItemsProgressiveCacheByStore = new Map<'mjm' | 'bjw', { rows: SoldItemRow[]; expiresAt: number }>();
const soldItemsProgressiveInFlightByStore = new Map<'mjm' | 'bjw', Promise<SoldItemRow[]>>();

interface PersistedPhotoCacheEntry {
  value: any | null;
  expiresAt: number;
  updatedAt: number;
}

let persistedPhotoCacheLoaded = false;
let persistedPhotoCache: Record<string, PersistedPhotoCacheEntry> = {};
let persistPhotoCacheTimer: ReturnType<typeof setTimeout> | null = null;

const normalizePhotoCacheKey = (partNumber: string | null | undefined): string =>
  String(partNumber || '').trim().toUpperCase().replace(/\s+/g, ' ');

const canUseLocalStorage = (): boolean => {
  if (!ENABLE_LOCAL_STORAGE_CACHE) return false;
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
  if (!ENABLE_MEMORY_PRICE_CACHE) return undefined;
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
  if (!ENABLE_MEMORY_PRICE_CACHE) return;
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
};

const normalizeStoreForCache = (store: string | null | undefined): 'mjm' | 'bjw' =>
  store === 'bjw' ? 'bjw' : 'mjm';

const getStoreReadCacheVersion = (store: string | null | undefined): number => {
  const safeStore = normalizeStoreForCache(store);
  return storeReadCacheVersion.get(safeStore) || 0;
};

const serializeCacheValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => serializeCacheValue(item)).join(',');
  if (typeof value === 'object') {
    try {
      const ordered = Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .reduce((acc, [k, v]) => {
          acc[k] = serializeCacheValue(v);
          return acc;
        }, {} as Record<string, unknown>);
      return JSON.stringify(ordered);
    } catch {
      return '';
    }
  }
  return String(value);
};

const buildReadCacheKey = (
  scope: string,
  store: string | null | undefined,
  params: Record<string, unknown> = {}
): string => {
  const safeStore = normalizeStoreForCache(store);
  const version = getStoreReadCacheVersion(store);
  const serializedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${serializeCacheValue(value)}`)
    .join('|');
  return `scope:${scope}|store:${safeStore}|ver:${version}|${serializedParams}`;
};

const pruneReadQueryCache = () => {
  const now = Date.now();
  for (const [key, entry] of readQueryCache.entries()) {
    if (entry.expiresAt <= now) {
      readQueryCache.delete(key);
    }
  }

  if (readQueryCache.size <= READ_QUERY_CACHE_MAX_ENTRIES) return;

  const entries = Array.from(readQueryCache.entries()).sort(
    (a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0)
  );
  const overflow = readQueryCache.size - READ_QUERY_CACHE_MAX_ENTRIES;
  for (let i = 0; i < overflow; i += 1) {
    const key = entries[i]?.[0];
    if (key) readQueryCache.delete(key);
  }
};

const getReadCacheValue = <T,>(key: string): T | undefined => {
  const entry = readQueryCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    readQueryCache.delete(key);
    return undefined;
  }
  return entry.value as T;
};

const setReadCacheValue = <T,>(key: string, value: T, ttlMs: number) => {
  if (ttlMs <= 0) return;
  readQueryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    updatedAt: Date.now()
  });
  pruneReadQueryCache();
};

const cacheReadQuery = async <T,>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> => {
  const useCache = ENABLE_MEMORY_QUERY_CACHE && ttlMs > 0;
  if (useCache) {
    const cached = getReadCacheValue<T>(key);
    if (cached !== undefined) return cached;
  }

  const pending = inFlightReadQueries.get(key);
  if (pending) return pending as Promise<T>;

  const request = (async () => {
    const result = await fetcher();
    if (useCache) {
      setReadCacheValue(key, result, ttlMs);
    }
    return result;
  })().finally(() => {
    inFlightReadQueries.delete(key);
  });

  inFlightReadQueries.set(key, request as Promise<unknown>);
  return request;
};

const invalidateStoreReadCaches = (store: string | null | undefined) => {
  const safeStore = normalizeStoreForCache(store);
  storeReadCacheVersion.set(safeStore, getStoreReadCacheVersion(safeStore) + 1);

  for (const key of readQueryCache.keys()) {
    if (key.includes(`|store:${safeStore}|`)) {
      readQueryCache.delete(key);
    }
  }

  for (const key of inFlightReadQueries.keys()) {
    if (key.includes(`|store:${safeStore}|`)) {
      inFlightReadQueries.delete(key);
    }
  }
};

const invalidateSoldItemsProgressiveCache = (store: string | null | undefined) => {
  if (store === 'mjm' || store === 'bjw') {
    soldItemsProgressiveCacheByStore.delete(store);
    soldItemsProgressiveInFlightByStore.delete(store);
    return;
  }
  soldItemsProgressiveCacheByStore.clear();
  soldItemsProgressiveInFlightByStore.clear();
};

interface InvalidateReadCachesOptions {
  invalidateInventorySnapshot?: boolean;
  invalidateEdgeLists?: boolean | EdgeListDatasetName[];
  invalidateSoldProgressive?: boolean;
}

const invalidateInventoryReadCaches = (
  store: string | null | undefined,
  options: InvalidateReadCachesOptions = {}
) => {
  const {
    invalidateInventorySnapshot = true,
    invalidateEdgeLists = true,
    invalidateSoldProgressive = true
  } = options;

  if (invalidateInventorySnapshot) {
    resetIncrementalInventoryState(store);
  }
  if (invalidateSoldProgressive) {
    invalidateSoldItemsProgressiveCache(store);
  }
  if (invalidateEdgeLists) {
    invalidateEdgeListSnapshotCaches(
      store,
      Array.isArray(invalidateEdgeLists) ? invalidateEdgeLists : undefined
    );
  }

  if (store === 'mjm' || store === 'bjw') {
    if (invalidateInventorySnapshot) {
      markInventorySnapshotDirty(store);
      scheduleInventorySnapshotSync(store);
    }
    invalidateStoreReadCaches(store);
    return;
  }

  if (invalidateInventorySnapshot) {
    markInventorySnapshotDirty('mjm');
    markInventorySnapshotDirty('bjw');
    scheduleInventorySnapshotSync('mjm');
    scheduleInventorySnapshotSync('bjw');
  }
  invalidateStoreReadCaches('mjm');
  invalidateStoreReadCaches('bjw');
};

const invalidatePriceCachesForStore = (store: string | null | undefined, partNumber?: string | null) => {
  const safeStore = normalizeStoreForCache(store);

  if (partNumber) {
    const normalizedPart = normalizePartForLookup(partNumber);
    const keysToDelete = new Set([
      buildStorePartCacheKey(safeStore, partNumber),
      buildStorePartCacheKey(safeStore, normalizedPart)
    ]);
    keysToDelete.forEach((key) => {
      sellPriceCache.delete(key);
      costPriceCache.delete(key);
    });
    return;
  }

  for (const key of sellPriceCache.keys()) {
    if (key.startsWith(`${safeStore}::`)) {
      sellPriceCache.delete(key);
    }
  }
  for (const key of costPriceCache.keys()) {
    if (key.startsWith(`${safeStore}::`)) {
      costPriceCache.delete(key);
    }
  }
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
  store: string | null | undefined,
  partNumbers: string[]
): Promise<Record<string, number>> => {
  const uniquePartNumbers = [...new Set((partNumbers || []).map(p => (p || '').toString().trim()).filter(Boolean))];
  if (uniquePartNumbers.length === 0) return {};

  const stockRows = await getInventoryRowsIncremental(store);

  const stockByNormalized = stockRows.reduce((acc, row) => {
    const original = (row?.part_number || '').toString().trim();
    if (!original) return acc;
    const normalized = normalizePartForLookup(original);
    const qty = Number(row?.quantity || 0);
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

interface InventoryIncrementalState {
  loaded: boolean;
  hasDbBaseline: boolean;
  byPartNumber: Map<string, any>;
  lastBaseCreatedAt: string | null;
  lastInLogCreatedAt: string | null;
  lastOutLogCreatedAt: string | null;
  lastIncrementalCheckAt: number;
  lastFullSyncAt: number;
}

interface DailyLogStatsState {
  dayKey: string;
  todayStartIso: string;
  lastInLogCreatedAt: string | null;
  lastOutLogCreatedAt: string | null;
  todayIn: number;
  todayOut: number;
}

interface InventorySnapshotPayload {
  version: number;
  store: string;
  updatedAt: string;
  items: any[];
}

interface EdgeListSnapshotPayload<T = any> {
  version: number;
  store: string;
  dataset: string;
  updatedAt: string;
  items: T[];
}

const inventoryIncrementalStateByStore = new Map<string, InventoryIncrementalState>();
const dailyLogStatsByStore = new Map<string, DailyLogStatsState>();
const inventorySnapshotMemoryByStore = new Map<string, { etag: string | null; payload: InventorySnapshotPayload }>();
const inventorySnapshotSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const inventorySnapshotSyncInFlight = new Map<string, Promise<void>>();
const inventorySnapshotLoadInFlightByStore = new Map<string, Promise<InventorySnapshotPayload | null>>();
const inventorySnapshotDirtyStores = new Set<string>();
const inventorySnapshotUnavailableUntilByStore = new Map<string, number>();
const inventorySnapshotWarnedByStore = new Set<string>();
const inventorySnapshotLastLoadAttemptAtByStore = new Map<string, number>();
const edgeListSnapshotMemory = new Map<string, { etag: string | null; payload: EdgeListSnapshotPayload<any> }>();
const edgeListSnapshotLoadInFlight = new Map<string, Promise<EdgeListSnapshotPayload<any> | null>>();
const edgeListSnapshotSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const edgeListSnapshotSyncInFlight = new Map<string, Promise<void>>();
const edgeListSnapshotDirtyKeys = new Set<string>();
const edgeListSnapshotLastLoadAttemptAt = new Map<string, number>();
const INVENTORY_FULL_SYNC_INTERVAL_MS = 30 * 1000;
const INVENTORY_INCREMENTAL_CHECK_INTERVAL_MS = 2500;
const INCREMENTAL_PAGE_SIZE = 1000;
const INVENTORY_SNAPSHOT_SYNC_DEBOUNCE_MS = 300;
const INVENTORY_SNAPSHOT_UNAVAILABLE_COOLDOWN_MS = 2 * 60 * 1000;
const INVENTORY_SNAPSHOT_LOAD_MIN_INTERVAL_MS = 8 * 1000;
const EDGE_LIST_SNAPSHOT_SYNC_DEBOUNCE_MS = 300;
const EDGE_LIST_SNAPSHOT_LOAD_MIN_INTERVAL_MS = 8 * 1000;
const EDGE_LIST_SNAPSHOT_VERSION = 1;
const INVENTORY_SNAPSHOT_BUCKET = (import.meta.env.VITE_SUPABASE_EGRESS_CACHE_BUCKET || 'egress-cache').trim() || 'egress-cache';

const getStoreStateKey = (store: string | null | undefined): string =>
  normalizeStoreForCache(store);

const sortInventoryRowsByName = (rows: any[]): any[] =>
  rows.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'id'));

const normalizeInventorySnapshotRow = (row: any): any | null => {
  const part = String(row?.part_number || '').trim();
  if (!part) return null;
  return {
    part_number: part,
    name: String(row?.name || ''),
    brand: String(row?.brand || ''),
    application: String(row?.application || ''),
    shelf: String(row?.shelf || ''),
    quantity: Number(row?.quantity || 0),
    created_at: row?.created_at ? String(row.created_at) : null
  };
};

const toInventorySnapshotRows = (rows: any[]): any[] => {
  const normalized: any[] = [];
  (rows || []).forEach((row) => {
    const mapped = normalizeInventorySnapshotRow(row);
    if (mapped) normalized.push(mapped);
  });
  return sortInventoryRowsByName(normalized);
};

const getInventorySnapshotPath = (store: string | null | undefined): string => {
  const safeStore = getStoreStateKey(store);
  return `inventory/${safeStore}/inventory-v1.json`;
};

const markInventorySnapshotDirty = (store: string | null | undefined) => {
  const safeStore = getStoreStateKey(store);
  inventorySnapshotDirtyStores.add(safeStore);
  inventorySnapshotMemoryByStore.delete(safeStore);
};

const clearInventorySnapshotDirty = (store: string | null | undefined) => {
  const safeStore = getStoreStateKey(store);
  inventorySnapshotDirtyStores.delete(safeStore);
};

const isSnapshotTemporarilyUnavailable = (store: string | null | undefined): boolean => {
  const safeStore = getStoreStateKey(store);
  const unavailableUntil = Number(inventorySnapshotUnavailableUntilByStore.get(safeStore) || 0);
  if (!unavailableUntil) return false;
  if (Date.now() >= unavailableUntil) {
    inventorySnapshotUnavailableUntilByStore.delete(safeStore);
    return false;
  }
  return true;
};

const markSnapshotTemporarilyUnavailable = (
  store: string | null | undefined,
  reason: string,
  cooldownMs: number = INVENTORY_SNAPSHOT_UNAVAILABLE_COOLDOWN_MS
) => {
  const safeStore = getStoreStateKey(store);
  const existingUntil = Number(inventorySnapshotUnavailableUntilByStore.get(safeStore) || 0);
  if (existingUntil && Date.now() < existingUntil) return;

  inventorySnapshotUnavailableUntilByStore.set(safeStore, Date.now() + Math.max(5000, cooldownMs));
  if (import.meta.env.DEV && !inventorySnapshotWarnedByStore.has(safeStore)) {
    inventorySnapshotWarnedByStore.add(safeStore);
    console.warn(`[snapshot] Nonaktif sementara ${safeStore}: ${reason}`);
  }
};

const clearSnapshotTemporaryUnavailable = (store: string | null | undefined) => {
  const safeStore = getStoreStateKey(store);
  inventorySnapshotUnavailableUntilByStore.delete(safeStore);
  inventorySnapshotWarnedByStore.delete(safeStore);
};

const shouldAttemptSnapshotLoadNow = (store: string | null | undefined): boolean => {
  const safeStore = getStoreStateKey(store);
  const now = Date.now();
  const last = Number(inventorySnapshotLastLoadAttemptAtByStore.get(safeStore) || 0);
  if (last && now - last < INVENTORY_SNAPSHOT_LOAD_MIN_INTERVAL_MS) {
    return false;
  }
  inventorySnapshotLastLoadAttemptAtByStore.set(safeStore, now);
  return true;
};

const isBucketMissingErrorMessage = (message: string): boolean => {
  const lower = String(message || '').toLowerCase();
  if (!lower) return false;
  return (
    (lower.includes('bucket') && lower.includes('not found')) ||
    (lower.includes('bucket') && lower.includes('does not exist')) ||
    (lower.includes('bucket') && lower.includes('missing'))
  );
};

const isSnapshotAccessDeniedMessage = (message: string): boolean => {
  const lower = String(message || '').toLowerCase();
  if (!lower) return false;
  return (
    lower.includes('permission') ||
    lower.includes('forbidden') ||
    lower.includes('unauthorized') ||
    lower.includes('access denied')
  );
};

const readStorageErrorMessage = async (response: Response): Promise<string> => {
  try {
    const raw = await response.text();
    if (!raw) return `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(raw);
      const msg =
        String((parsed as any)?.message || '').trim() ||
        String((parsed as any)?.error || '').trim() ||
        String((parsed as any)?.msg || '').trim();
      return msg || raw;
    } catch {
      return raw;
    }
  } catch {
    return `HTTP ${response.status}`;
  }
};

const getOrCreateInventoryState = (store: string | null | undefined): InventoryIncrementalState => {
  const key = getStoreStateKey(store);
  const existing = inventoryIncrementalStateByStore.get(key);
  if (existing) return existing;
  const next: InventoryIncrementalState = {
    loaded: false,
    hasDbBaseline: false,
    byPartNumber: new Map<string, any>(),
    lastBaseCreatedAt: null,
    lastInLogCreatedAt: null,
    lastOutLogCreatedAt: null,
    lastIncrementalCheckAt: 0,
    lastFullSyncAt: 0
  };
  inventoryIncrementalStateByStore.set(key, next);
  return next;
};

const resetIncrementalInventoryState = (store: string | null | undefined) => {
  if (store === 'mjm' || store === 'bjw') {
    inventoryIncrementalStateByStore.delete(getStoreStateKey(store));
    dailyLogStatsByStore.delete(getStoreStateKey(store));
    return;
  }
  inventoryIncrementalStateByStore.clear();
  dailyLogStatsByStore.clear();
};

const fetchLatestLogCreatedAt = async (tableName: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from(tableName)
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const createdAt = String((data as any).created_at || '').trim();
  return createdAt || null;
};

const buildInventorySnapshotPayload = (
  store: string | null | undefined,
  rows: any[],
  updatedAt?: string | null
): InventorySnapshotPayload => {
  const safeStore = getStoreStateKey(store);
  const latestRowCreatedAt = (rows || []).reduce<string | null>((maxVal, row) => {
    const createdAt = String(row?.created_at || '').trim();
    if (!createdAt) return maxVal;
    if (!maxVal || createdAt > maxVal) return createdAt;
    return maxVal;
  }, null);

  return {
    version: 1,
    store: safeStore,
    updatedAt: updatedAt || latestRowCreatedAt || new Date().toISOString(),
    items: toInventorySnapshotRows(rows)
  };
};

const uploadInventorySnapshot = async (store: string | null | undefined, payload: InventorySnapshotPayload): Promise<void> => {
  const safeStore = getStoreStateKey(store);
  if (isSnapshotTemporarilyUnavailable(safeStore)) return;
  const path = getInventorySnapshotPath(safeStore);
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });

  const { error } = await supabase.storage
    .from(INVENTORY_SNAPSHOT_BUCKET)
    .upload(path, blob, {
      upsert: true,
      cacheControl: '3600',
      contentType: 'application/json'
    });

  if (error) {
    const message = String(error.message || 'Upload snapshot gagal');
    if (isBucketMissingErrorMessage(message) || isSnapshotAccessDeniedMessage(message)) {
      markSnapshotTemporarilyUnavailable(safeStore, message);
      return;
    }
    throw new Error(message);
  }

  clearSnapshotTemporaryUnavailable(safeStore);
  inventorySnapshotMemoryByStore.set(safeStore, {
    etag: null,
    payload
  });
};

const loadInventorySnapshotFromStorage = async (store: string | null | undefined): Promise<InventorySnapshotPayload | null> => {
  const safeStore = getStoreStateKey(store);
  if (isSnapshotTemporarilyUnavailable(safeStore)) return null;

  const pending = inventorySnapshotLoadInFlightByStore.get(safeStore);
  if (pending) return pending;

  const request = (async (): Promise<InventorySnapshotPayload | null> => {
  const path = getInventorySnapshotPath(safeStore);
  const { data } = supabase.storage.from(INVENTORY_SNAPSHOT_BUCKET).getPublicUrl(path);
  const publicUrl = String(data?.publicUrl || '').trim();
  if (!publicUrl) return null;

  try {
    const cached = inventorySnapshotMemoryByStore.get(safeStore);
    const headers = new Headers();
    headers.set('Accept', 'application/json');
    if (cached?.etag) headers.set('If-None-Match', cached.etag);

    const response = await fetch(publicUrl, { method: 'GET', headers });

    if (response.status === 304 && cached?.payload) {
      return cached.payload;
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errorMessage = await readStorageErrorMessage(response);
      if (
        response.status === 400 &&
        (isBucketMissingErrorMessage(errorMessage) || isSnapshotAccessDeniedMessage(errorMessage))
      ) {
        markSnapshotTemporarilyUnavailable(safeStore, `${response.status} ${errorMessage}`);
        return null;
      }
      console.warn(`[snapshot] Gagal load snapshot ${safeStore}: ${response.status} ${errorMessage}`);
      return null;
    }

    const parsed = await response.json();
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as any).items)) {
      console.warn(`[snapshot] Format snapshot invalid untuk ${safeStore}`);
      return null;
    }

    const payload: InventorySnapshotPayload = {
      version: Number((parsed as any).version || 1),
      store: safeStore,
      updatedAt: String((parsed as any).updatedAt || '').trim() || new Date().toISOString(),
      items: toInventorySnapshotRows((parsed as any).items || [])
    };

    const etag = response.headers.get('etag');
    inventorySnapshotMemoryByStore.set(safeStore, {
      etag: etag || null,
      payload
    });

    clearSnapshotTemporaryUnavailable(safeStore);
    return payload;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`[snapshot] Exception load snapshot ${safeStore}:`, error);
    }
    return null;
  }
  })().finally(() => {
    inventorySnapshotLoadInFlightByStore.delete(safeStore);
  });

  inventorySnapshotLoadInFlightByStore.set(safeStore, request);
  return request;
};

const buildInventorySnapshotFromDb = async (store: string | null | undefined): Promise<InventorySnapshotPayload> => {
  const table = getTableName(store);
  const rows = await fetchAllRowsForModal<any>(table, INVENTORY_SELECT_COLUMNS, 'name');
  return buildInventorySnapshotPayload(store, rows);
};

const applyRowsToInventoryState = (
  store: string | null | undefined,
  rows: any[],
  options: {
    hasDbBaseline: boolean;
    lastInLogCreatedAt?: string | null;
    lastOutLogCreatedAt?: string | null;
    fullSyncAt?: number;
  }
): InventoryIncrementalState => {
  const state = getOrCreateInventoryState(store);
  const nextMap = new Map<string, any>();
  let latestCreatedAt: string | null = null;

  toInventorySnapshotRows(rows).forEach((row: any) => {
    const part = String(row?.part_number || '').trim();
    if (!part) return;
    nextMap.set(part, row);
    const createdAt = String(row?.created_at || '').trim();
    if (createdAt && (!latestCreatedAt || createdAt > latestCreatedAt)) {
      latestCreatedAt = createdAt;
    }
  });

  state.byPartNumber = nextMap;
  state.lastBaseCreatedAt = latestCreatedAt;
  state.lastInLogCreatedAt = options.lastInLogCreatedAt ?? null;
  state.lastOutLogCreatedAt = options.lastOutLogCreatedAt ?? null;
  state.lastFullSyncAt = options.fullSyncAt ?? Date.now();
  state.lastIncrementalCheckAt = Date.now();
  state.loaded = true;
  state.hasDbBaseline = options.hasDbBaseline;
  return state;
};

const syncInventorySnapshotFromDb = async (store: string | null | undefined): Promise<void> => {
  const safeStore = getStoreStateKey(store);
  if (isSnapshotTemporarilyUnavailable(safeStore)) return;
  const table = getTableName(safeStore);
  const existingSnapshot = await loadInventorySnapshotFromStorage(safeStore);

  if (!existingSnapshot) {
    const fullPayload = await buildInventorySnapshotFromDb(safeStore);
    await uploadInventorySnapshot(safeStore, fullPayload);
    clearInventorySnapshotDirty(safeStore);
    return;
  }

  const snapshotUpdatedAt = String(existingSnapshot.updatedAt || '').trim();
  if (!snapshotUpdatedAt) {
    const fullPayload = await buildInventorySnapshotFromDb(safeStore);
    await uploadInventorySnapshot(safeStore, fullPayload);
    clearInventorySnapshotDirty(safeStore);
    return;
  }

  let latestChangedAt = snapshotUpdatedAt;
  const changedParts = new Set<string>();

  const [baseDelta, inDelta, outDelta] = await Promise.all([
    supabase
      .from(table)
      .select('part_number,created_at')
      .gt('created_at', snapshotUpdatedAt)
      .order('created_at', { ascending: true })
      .limit(INCREMENTAL_PAGE_SIZE),
    supabase
      .from(getLogTableName('barang_masuk', safeStore))
      .select('part_number,created_at')
      .gt('created_at', snapshotUpdatedAt)
      .order('created_at', { ascending: true })
      .limit(INCREMENTAL_PAGE_SIZE),
    supabase
      .from(getLogTableName('barang_keluar', safeStore))
      .select('part_number,created_at')
      .gt('created_at', snapshotUpdatedAt)
      .order('created_at', { ascending: true })
      .limit(INCREMENTAL_PAGE_SIZE)
  ]);

  if (baseDelta.error || inDelta.error || outDelta.error) {
    throw new Error(
      baseDelta.error?.message ||
      inDelta.error?.message ||
      outDelta.error?.message ||
      'Gagal membaca delta snapshot'
    );
  }

  const hasOverflow =
    (baseDelta.data?.length || 0) >= INCREMENTAL_PAGE_SIZE ||
    (inDelta.data?.length || 0) >= INCREMENTAL_PAGE_SIZE ||
    (outDelta.data?.length || 0) >= INCREMENTAL_PAGE_SIZE;

  if (hasOverflow) {
    const fullPayload = await buildInventorySnapshotFromDb(safeStore);
    await uploadInventorySnapshot(safeStore, fullPayload);
    clearInventorySnapshotDirty(safeStore);
    return;
  }

  const collectDelta = (rows: any[] | null | undefined) => {
    (rows || []).forEach((row: any) => {
      const part = String(row?.part_number || '').trim();
      if (part) changedParts.add(part);
      const createdAt = String(row?.created_at || '').trim();
      if (createdAt && createdAt > latestChangedAt) latestChangedAt = createdAt;
    });
  };

  collectDelta(baseDelta.data as any[]);
  collectDelta(inDelta.data as any[]);
  collectDelta(outDelta.data as any[]);

  if (changedParts.size === 0 && !inventorySnapshotDirtyStores.has(safeStore)) {
    return;
  }

  const snapshotMap = new Map<string, any>();
  (existingSnapshot.items || []).forEach((row: any) => {
    const normalized = normalizeInventorySnapshotRow(row);
    if (!normalized) return;
    snapshotMap.set(normalized.part_number, normalized);
  });

  if (changedParts.size > 0) {
    const chunks = chunkStrings(Array.from(changedParts), 100);
    for (const chunk of chunks) {
      const { data: changedRows, error } = await supabase
        .from(table)
        .select(INVENTORY_SELECT_COLUMNS)
        .in('part_number', chunk);

      if (error) {
        throw new Error(error.message || 'Gagal mengambil perubahan inventory');
      }

      const found = new Set<string>();
      (changedRows || []).forEach((row: any) => {
        const normalized = normalizeInventorySnapshotRow(row);
        if (!normalized) return;
        found.add(normalized.part_number);
        snapshotMap.set(normalized.part_number, normalized);
      });

      // Jika part number tidak ditemukan lagi, anggap sudah dihapus.
      chunk.forEach((part) => {
        if (!found.has(part)) snapshotMap.delete(part);
      });
    }
  }

  const mergedRows = sortInventoryRowsByName(Array.from(snapshotMap.values()));
  const nextPayload: InventorySnapshotPayload = {
    version: 1,
    store: safeStore,
    updatedAt: latestChangedAt || new Date().toISOString(),
    items: mergedRows
  };

  await uploadInventorySnapshot(safeStore, nextPayload);
  clearInventorySnapshotDirty(safeStore);
};

const triggerInventorySnapshotSync = (store: string | null | undefined): Promise<void> => {
  const safeStore = getStoreStateKey(store);
  if (isSnapshotTemporarilyUnavailable(safeStore)) {
    return Promise.resolve();
  }
  const running = inventorySnapshotSyncInFlight.get(safeStore);
  if (running) return running;

  const run = (async () => {
    try {
      await syncInventorySnapshotFromDb(safeStore);
    } catch (error) {
      console.warn(`[snapshot] Sync gagal (${safeStore}):`, error);
    }
  })().finally(() => {
    inventorySnapshotSyncInFlight.delete(safeStore);
  });

  inventorySnapshotSyncInFlight.set(safeStore, run);
  return run;
};

const scheduleInventorySnapshotSync = (store: string | null | undefined) => {
  const safeStore = getStoreStateKey(store);
  if (isSnapshotTemporarilyUnavailable(safeStore)) return;
  const prev = inventorySnapshotSyncTimers.get(safeStore);
  if (prev) clearTimeout(prev);

  const timer = setTimeout(() => {
    inventorySnapshotSyncTimers.delete(safeStore);
    void triggerInventorySnapshotSync(safeStore);
  }, INVENTORY_SNAPSHOT_SYNC_DEBOUNCE_MS);

  inventorySnapshotSyncTimers.set(safeStore, timer);
};

type EdgeListDatasetName =
  | 'offline-orders'
  | 'sales-orders'
  | 'online-orders'
  | 'sold-items'
  | 'sales-paid-items'
  | 'retur-items'
  | 'barang-masuk-log'
  | 'barang-keluar-log'
  | 'kirim-barang'
  | 'kilat-prestock'
  | 'kilat-penjualan'
  | 'scan-resi'
  | 'resi-items'
  | 'stock-online'
  | 'data-agung-online'
  | 'data-agung-kosong'
  | 'data-agung-masuk'
  | 'petty-cash'
  | 'importir-pembayaran'
  | 'importir-tagihan'
  | 'toko-pembayaran'
  | 'toko-tagihan'
  | 'inv-tagihan'
  | 'order-supplier'
  | 'supplier-orders'
  | 'supplier-order-items'
  | 'foto-rows'
  | 'list-harga-jual'
  | 'product-alias'
  | 'foto-link'
  | 'reseller-master';

interface EdgeListSnapshotConfig {
  table: string;
  select: string;
  orderColumn: string;
  ascending: boolean;
  applyFilters: (query: any) => any;
}

const EDGE_LIST_DATASETS: EdgeListDatasetName[] = [
  'offline-orders',
  'sales-orders',
  'online-orders',
  'sold-items',
  'sales-paid-items',
  'retur-items',
  'barang-masuk-log',
  'barang-keluar-log',
  'kirim-barang',
  'kilat-prestock',
  'kilat-penjualan',
  'scan-resi',
  'resi-items',
  'stock-online',
  'data-agung-online',
  'data-agung-kosong',
  'data-agung-masuk',
  'petty-cash',
  'order-supplier',
  'supplier-orders'
];
const EDGE_LIST_GLOBAL_DATASETS: EdgeListDatasetName[] = [
  'importir-pembayaran',
  'importir-tagihan',
  'toko-pembayaran',
  'toko-tagihan',
  'inv-tagihan',
  'supplier-order-items',
  'foto-rows',
  'list-harga-jual',
  'product-alias',
  'foto-link',
  'reseller-master'
];

const getEdgeListSnapshotKey = (store: string | null | undefined, dataset: EdgeListDatasetName): string =>
  `${getStoreStateKey(store)}::${dataset}`;

const getEdgeListSnapshotPath = (store: string | null | undefined, dataset: EdgeListDatasetName): string =>
  `lists/${getStoreStateKey(store)}/${dataset}-v1.json`;

const shouldAttemptEdgeListSnapshotLoadNow = (snapshotKey: string): boolean => {
  const now = Date.now();
  const last = Number(edgeListSnapshotLastLoadAttemptAt.get(snapshotKey) || 0);
  if (last && now - last < EDGE_LIST_SNAPSHOT_LOAD_MIN_INTERVAL_MS) {
    return false;
  }
  edgeListSnapshotLastLoadAttemptAt.set(snapshotKey, now);
  return true;
};

const markEdgeListSnapshotDirty = (store: string | null | undefined, dataset: EdgeListDatasetName) => {
  const key = getEdgeListSnapshotKey(store, dataset);
  edgeListSnapshotDirtyKeys.add(key);
  edgeListSnapshotMemory.delete(key);
};

const clearEdgeListSnapshotDirty = (store: string | null | undefined, dataset: EdgeListDatasetName) => {
  const key = getEdgeListSnapshotKey(store, dataset);
  edgeListSnapshotDirtyKeys.delete(key);
};

const getEdgeListSnapshotConfig = (
  store: string | null | undefined,
  dataset: EdgeListDatasetName
): EdgeListSnapshotConfig | null => {
  const safeStore = getStoreStateKey(store);

  if (dataset === 'offline-orders') {
    return {
      table: safeStore === 'mjm' ? 'orders_mjm' : 'orders_bjw',
      select: '*',
      orderColumn: 'tanggal',
      ascending: false,
      applyFilters: (q) => q.eq('status', 'Belum Diproses')
    };
  }

  if (dataset === 'sales-orders') {
    if (safeStore !== 'bjw') return null;
    return {
      table: 'orders_bjw',
      select: '*',
      orderColumn: 'tanggal',
      ascending: false,
      applyFilters: (q) => q.eq('status', 'Sales Pending').eq('tempo', 'SALES')
    };
  }

  if (dataset === 'online-orders') {
    return {
      table: safeStore === 'mjm' ? 'scan_resi_mjm' : 'scan_resi_bjw',
      select: '*',
      orderColumn: 'tanggal',
      ascending: false,
      applyFilters: (q) => q.neq('status', 'Diproses')
    };
  }

  if (dataset === 'sold-items') {
    return {
      table: safeStore === 'mjm' ? 'barang_keluar_mjm' : 'barang_keluar_bjw',
      select: SOLD_ITEM_SELECT_COLUMNS,
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'sales-paid-items') {
    if (safeStore !== 'bjw') return null;
    return {
      table: 'barang_keluar_bjw',
      select: SOLD_ITEM_SELECT_COLUMNS,
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) => q.ilike('ecommerce', 'SALES').ilike('tempo', 'CASH')
    };
  }

  if (dataset === 'retur-items') {
    return {
      table: safeStore === 'mjm' ? 'retur_mjm' : 'retur_bjw',
      select: '*',
      orderColumn: 'tanggal_retur',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'barang-masuk-log') {
    return {
      table: safeStore === 'mjm' ? 'barang_masuk_mjm' : 'barang_masuk_bjw',
      select: BARANG_MASUK_LOG_SELECT_COLUMNS,
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) =>
        q
          .not('customer', 'ilike', '%RETUR%')
          .not('tempo', 'ilike', '%RETUR%')
    };
  }

  if (dataset === 'barang-keluar-log') {
    return {
      table: safeStore === 'mjm' ? 'barang_keluar_mjm' : 'barang_keluar_bjw',
      select: BARANG_KELUAR_LOG_SELECT_COLUMNS,
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'kirim-barang') {
    return {
      table: 'kirim_barang',
      select: '*',
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'kilat-prestock') {
    return {
      table: safeStore === 'mjm' ? 'kilat_prestock_mjm' : 'kilat_prestock_bjw',
      select: '*',
      orderColumn: 'tanggal_kirim',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'kilat-penjualan') {
    return {
      table: safeStore === 'mjm' ? 'kilat_penjualan_mjm' : 'kilat_penjualan_bjw',
      select: '*',
      orderColumn: 'tanggal_jual',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'scan-resi') {
    return {
      table: safeStore === 'mjm' ? 'scan_resi_mjm' : 'scan_resi_bjw',
      select: '*',
      orderColumn: 'tanggal',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'resi-items') {
    return {
      table: safeStore === 'mjm' ? 'resi_items_mjm' : 'resi_items_bjw',
      select: '*',
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'stock-online') {
    return {
      table: safeStore === 'mjm' ? 'v_stock_online_mjm' : 'v_stock_online_bjw',
      select: '*',
      orderColumn: 'tanggal',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'data-agung-online') {
    return {
      table: safeStore === 'mjm' ? 'data_agung_online_mjm' : 'data_agung_online_bjw',
      select: '*',
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'data-agung-kosong') {
    return {
      table: safeStore === 'mjm' ? 'data_agung_kosong_mjm' : 'data_agung_kosong_bjw',
      select: '*',
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'data-agung-masuk') {
    return {
      table: safeStore === 'mjm' ? 'data_agung_masuk_mjm' : 'data_agung_masuk_bjw',
      select: '*',
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'petty-cash') {
    return {
      table: safeStore === 'mjm' ? 'petty_cash_mjm' : 'petty_cash_bjw',
      select: '*',
      orderColumn: 'tgl',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'order-supplier') {
    return {
      table: 'order_supplier',
      select: '*',
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) => q.eq('store', safeStore)
    };
  }

  if (dataset === 'supplier-orders') {
    return {
      table: 'supplier_orders',
      select: '*',
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) => q.eq('store', safeStore)
    };
  }

  // Dataset global disimpan 1x di namespace store "mjm" agar tidak duplikasi.
  if (safeStore !== 'mjm') return null;

  if (dataset === 'importir-pembayaran') {
    return {
      table: 'importir_pembayaran',
      select: '*',
      orderColumn: 'tanggal',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'importir-tagihan') {
    return {
      table: 'importir_tagihan',
      select: '*',
      orderColumn: 'tanggal',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'toko-pembayaran') {
    return {
      table: 'toko_pembayaran',
      select: '*',
      orderColumn: 'tanggal',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'toko-tagihan') {
    return {
      table: 'toko_tagihan',
      select: '*',
      orderColumn: 'tanggal',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'inv-tagihan') {
    return {
      table: 'inv_tagihan',
      select: '*',
      orderColumn: 'created_at',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'supplier-order-items') {
    return {
      table: 'supplier_order_items',
      select: '*',
      orderColumn: 'id',
      ascending: false,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'foto-rows') {
    return {
      table: 'foto',
      select: FOTO_SELECT_COLUMNS,
      orderColumn: 'part_number',
      ascending: true,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'list-harga-jual') {
    return {
      table: 'list_harga_jual',
      select: 'part_number,harga,name,created_at',
      orderColumn: 'part_number',
      ascending: true,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'product-alias') {
    return {
      table: 'product_alias',
      select: 'part_number,alias_name,source',
      orderColumn: 'part_number',
      ascending: true,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'foto-link') {
    return {
      table: 'foto_link',
      select: '*',
      orderColumn: 'nama_csv',
      ascending: true,
      applyFilters: (q) => q
    };
  }

  if (dataset === 'reseller-master') {
    return {
      table: 'reseller_master',
      select: '*',
      orderColumn: 'nama_reseller',
      ascending: true,
      applyFilters: (q) => q
    };
  }

  return null;
};

const fetchEdgeListRowsFromDb = async <T,>(
  store: string | null | undefined,
  dataset: EdgeListDatasetName
): Promise<T[]> => {
  const config = getEdgeListSnapshotConfig(store, dataset);
  if (!config) return [];

  return fetchAllRowsForModalFiltered<T>(
    config.table,
    config.select,
    config.orderColumn,
    config.applyFilters,
    config.ascending
  );
};

const buildEdgeListSnapshotPayload = <T,>(
  store: string | null | undefined,
  dataset: EdgeListDatasetName,
  rows: T[]
): EdgeListSnapshotPayload<T> => {
  const safeStore = getStoreStateKey(store);

  const latestUpdatedAt = (rows as any[]).reduce<string | null>((maxVal, row) => {
    const candidates = [
      String((row as any)?.created_at || '').trim(),
      String((row as any)?.updated_at || '').trim(),
      String((row as any)?.tanggal || '').trim(),
      String((row as any)?.tgl || '').trim(),
      String((row as any)?.tanggal_jual || '').trim(),
      String((row as any)?.tanggal_kirim || '').trim(),
      String((row as any)?.tanggal_retur || '').trim()
    ].filter(Boolean);
    const current = candidates[0] || '';
    if (!current) return maxVal;
    if (!maxVal || current > maxVal) return current;
    return maxVal;
  }, null);

  return {
    version: EDGE_LIST_SNAPSHOT_VERSION,
    store: safeStore,
    dataset,
    updatedAt: latestUpdatedAt || new Date().toISOString(),
    items: rows
  };
};

const uploadEdgeListSnapshot = async <T,>(
  store: string | null | undefined,
  dataset: EdgeListDatasetName,
  payload: EdgeListSnapshotPayload<T>
): Promise<boolean> => {
  const safeStore = getStoreStateKey(store);
  if (isSnapshotTemporarilyUnavailable(safeStore)) return false;

  const path = getEdgeListSnapshotPath(safeStore, dataset);
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

  const { error } = await supabase.storage
    .from(INVENTORY_SNAPSHOT_BUCKET)
    .upload(path, blob, {
      upsert: true,
      cacheControl: '3600',
      contentType: 'application/json'
    });

  if (error) {
    const message = String(error.message || 'Upload snapshot list gagal');
    if (isBucketMissingErrorMessage(message) || isSnapshotAccessDeniedMessage(message)) {
      markSnapshotTemporarilyUnavailable(safeStore, message);
      return false;
    }
    throw new Error(message);
  }

  clearSnapshotTemporaryUnavailable(safeStore);
  const key = getEdgeListSnapshotKey(safeStore, dataset);
  edgeListSnapshotMemory.set(key, {
    etag: null,
    payload: payload as EdgeListSnapshotPayload<any>
  });
  return true;
};

const loadEdgeListSnapshotFromStorage = async <T,>(
  store: string | null | undefined,
  dataset: EdgeListDatasetName
): Promise<EdgeListSnapshotPayload<T> | null> => {
  const safeStore = getStoreStateKey(store);
  if (isSnapshotTemporarilyUnavailable(safeStore)) return null;

  const snapshotKey = getEdgeListSnapshotKey(safeStore, dataset);
  const pending = edgeListSnapshotLoadInFlight.get(snapshotKey);
  if (pending) {
    return pending as Promise<EdgeListSnapshotPayload<T> | null>;
  }

  const request = (async (): Promise<EdgeListSnapshotPayload<T> | null> => {
    const path = getEdgeListSnapshotPath(safeStore, dataset);
    const { data } = supabase.storage.from(INVENTORY_SNAPSHOT_BUCKET).getPublicUrl(path);
    const publicUrl = String(data?.publicUrl || '').trim();
    if (!publicUrl) return null;

    try {
      const cached = edgeListSnapshotMemory.get(snapshotKey);
      const headers = new Headers();
      headers.set('Accept', 'application/json');
      if (cached?.etag) headers.set('If-None-Match', cached.etag);

      const response = await fetch(publicUrl, { method: 'GET', headers });
      if (response.status === 304 && cached?.payload) {
        return cached.payload as EdgeListSnapshotPayload<T>;
      }
      if (response.status === 404) return null;

      if (!response.ok) {
        const message = await readStorageErrorMessage(response);
        if (
          response.status === 400 &&
          (isBucketMissingErrorMessage(message) || isSnapshotAccessDeniedMessage(message))
        ) {
          markSnapshotTemporarilyUnavailable(safeStore, `${response.status} ${message}`);
          return null;
        }
        if (import.meta.env.DEV) {
          console.warn(`[snapshot:list] Gagal load ${snapshotKey}: ${response.status} ${message}`);
        }
        return null;
      }

      const parsed = await response.json();
      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as any).items)) {
        return null;
      }

      const payload: EdgeListSnapshotPayload<T> = {
        version: Number((parsed as any).version || EDGE_LIST_SNAPSHOT_VERSION),
        store: safeStore,
        dataset,
        updatedAt: String((parsed as any).updatedAt || '').trim() || new Date().toISOString(),
        items: ((parsed as any).items || []) as T[]
      };

      edgeListSnapshotMemory.set(snapshotKey, {
        etag: response.headers.get('etag') || null,
        payload: payload as EdgeListSnapshotPayload<any>
      });
      clearSnapshotTemporaryUnavailable(safeStore);
      return payload;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn(`[snapshot:list] Exception load ${snapshotKey}:`, error);
      }
      return null;
    }
  })().finally(() => {
    edgeListSnapshotLoadInFlight.delete(snapshotKey);
  });

  edgeListSnapshotLoadInFlight.set(snapshotKey, request as Promise<EdgeListSnapshotPayload<any> | null>);
  return request;
};

const syncEdgeListSnapshotFromDb = async (store: string | null | undefined, dataset: EdgeListDatasetName): Promise<void> => {
  const safeStore = getStoreStateKey(store);
  if (isSnapshotTemporarilyUnavailable(safeStore)) return;

  const config = getEdgeListSnapshotConfig(safeStore, dataset);
  if (!config) {
    clearEdgeListSnapshotDirty(safeStore, dataset);
    return;
  }

  const rows = await fetchEdgeListRowsFromDb<any>(safeStore, dataset);
  const payload = buildEdgeListSnapshotPayload(safeStore, dataset, rows);
  const uploaded = await uploadEdgeListSnapshot(safeStore, dataset, payload);
  if (uploaded) {
    clearEdgeListSnapshotDirty(safeStore, dataset);
  }
};

const triggerEdgeListSnapshotSync = (store: string | null | undefined, dataset: EdgeListDatasetName): Promise<void> => {
  const safeStore = getStoreStateKey(store);
  if (isSnapshotTemporarilyUnavailable(safeStore)) return Promise.resolve();

  const snapshotKey = getEdgeListSnapshotKey(safeStore, dataset);
  const running = edgeListSnapshotSyncInFlight.get(snapshotKey);
  if (running) return running;

  const run = (async () => {
    try {
      await syncEdgeListSnapshotFromDb(safeStore, dataset);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn(`[snapshot:list] Sync gagal ${snapshotKey}:`, error);
      }
    }
  })().finally(() => {
    edgeListSnapshotSyncInFlight.delete(snapshotKey);
  });

  edgeListSnapshotSyncInFlight.set(snapshotKey, run);
  return run;
};

const scheduleEdgeListSnapshotSync = (store: string | null | undefined, dataset: EdgeListDatasetName) => {
  const safeStore = getStoreStateKey(store);
  if (isSnapshotTemporarilyUnavailable(safeStore)) return;

  const snapshotKey = getEdgeListSnapshotKey(safeStore, dataset);
  const prev = edgeListSnapshotSyncTimers.get(snapshotKey);
  if (prev) clearTimeout(prev);

  const timer = setTimeout(() => {
    edgeListSnapshotSyncTimers.delete(snapshotKey);
    void triggerEdgeListSnapshotSync(safeStore, dataset);
  }, EDGE_LIST_SNAPSHOT_SYNC_DEBOUNCE_MS);

  edgeListSnapshotSyncTimers.set(snapshotKey, timer);
};

const invalidateEdgeListSnapshotCaches = (
  store: string | null | undefined,
  datasets?: EdgeListDatasetName[]
) => {
  const targetStores: Array<'mjm' | 'bjw'> =
    store === 'mjm' || store === 'bjw'
      ? [store]
      : ['mjm', 'bjw'];
  const targetDatasets = datasets && datasets.length > 0
    ? datasets
    : EDGE_LIST_DATASETS;

  targetStores.forEach((safeStore) => {
    targetDatasets.forEach((dataset) => {
      const config = getEdgeListSnapshotConfig(safeStore, dataset);
      if (!config) return;
      const snapshotKey = getEdgeListSnapshotKey(safeStore, dataset);
      markEdgeListSnapshotDirty(safeStore, dataset);
      edgeListSnapshotLastLoadAttemptAt.delete(snapshotKey);
      edgeListSnapshotLoadInFlight.delete(snapshotKey);
      edgeListSnapshotSyncInFlight.delete(snapshotKey);
      const timer = edgeListSnapshotSyncTimers.get(snapshotKey);
      if (timer) {
        clearTimeout(timer);
        edgeListSnapshotSyncTimers.delete(snapshotKey);
      }
    });
  });
};

const invalidateGlobalEdgeListSnapshotCaches = (datasets?: EdgeListDatasetName[]) => {
  const target = (datasets || EDGE_LIST_GLOBAL_DATASETS).filter((d) =>
    EDGE_LIST_GLOBAL_DATASETS.includes(d)
  );
  if (target.length === 0) return;
  invalidateEdgeListSnapshotCaches('mjm', target);
};

const getEdgeListRowsWithSnapshot = async <T,>(
  store: string | null | undefined,
  dataset: EdgeListDatasetName
): Promise<T[]> => {
  const safeStore = getStoreStateKey(store);
  const config = getEdgeListSnapshotConfig(safeStore, dataset);
  if (!config) return [];
  const snapshotKey = getEdgeListSnapshotKey(safeStore, dataset);
  const isDirty = edgeListSnapshotDirtyKeys.has(snapshotKey);
  const snapshotUnavailable = isSnapshotTemporarilyUnavailable(safeStore);

  if (!snapshotUnavailable) {
    if (shouldAttemptEdgeListSnapshotLoadNow(snapshotKey)) {
      const snapshot = await loadEdgeListSnapshotFromStorage<T>(safeStore, dataset);
      if (snapshot) {
        // Dirty = snapshot lama, tetap serve dulu lalu refresh background.
        if (isDirty) {
          scheduleEdgeListSnapshotSync(safeStore, dataset);
        }
        return snapshot.items || [];
      }
    } else {
      const cached = edgeListSnapshotMemory.get(snapshotKey)?.payload;
      if (cached) {
        if (isDirty) {
          scheduleEdgeListSnapshotSync(safeStore, dataset);
        }
        return (cached.items || []) as T[];
      }
    }
  }

  const rows = await fetchAllRowsForModalFiltered<T>(
    config.table,
    config.select,
    config.orderColumn,
    config.applyFilters,
    config.ascending
  );
  if (!snapshotUnavailable) {
    scheduleEdgeListSnapshotSync(safeStore, dataset);
  }
  return rows;
};

export type EdgeCacheDataset = EdgeListDatasetName;

export const readEdgeListRowsCached = async <T,>(
  store: string | null | undefined,
  dataset: EdgeCacheDataset
): Promise<T[]> => {
  return getEdgeListRowsWithSnapshot<T>(store, dataset);
};

export const readInventoryRowsCached = async (
  store: string | null | undefined
): Promise<any[]> => {
  return getInventoryRowsIncremental(store);
};

export const markEdgeListDatasetsDirty = (
  store: string | null | undefined,
  datasets: EdgeCacheDataset[]
) => {
  if (!Array.isArray(datasets) || datasets.length === 0) return;
  invalidateEdgeListSnapshotCaches(store, datasets);

  const targetStores: Array<'mjm' | 'bjw'> =
    store === 'mjm' || store === 'bjw' ? [store] : ['mjm', 'bjw'];
  targetStores.forEach((safeStore) => {
    datasets.forEach((dataset) => {
      const config = getEdgeListSnapshotConfig(safeStore, dataset);
      if (!config) return;
      scheduleEdgeListSnapshotSync(safeStore, dataset);
    });
  });
};

export const markGlobalEdgeListDatasetsDirty = (datasets: EdgeCacheDataset[]) => {
  if (!Array.isArray(datasets) || datasets.length === 0) return;
  const allowed = datasets.filter((d) => EDGE_LIST_GLOBAL_DATASETS.includes(d));
  if (allowed.length === 0) return;
  invalidateGlobalEdgeListSnapshotCaches(allowed);
  allowed.forEach((dataset) => {
    scheduleEdgeListSnapshotSync('mjm', dataset);
  });
};

export const markInventoryCacheDirty = (store: string | null | undefined) => {
  invalidateInventoryReadCaches(store, {
    invalidateInventorySnapshot: true,
    invalidateEdgeLists: false,
    invalidateSoldProgressive: false
  });
};

const fullSyncInventoryState = async (store: string | null | undefined): Promise<InventoryIncrementalState> => {
  const table = getTableName(store);
  const rows = await fetchAllRowsForModal<any>(
    table,
    INVENTORY_SELECT_COLUMNS,
    'name'
  );

  const [lastInLogCreatedAt, lastOutLogCreatedAt] = await Promise.all([
    fetchLatestLogCreatedAt(getLogTableName('barang_masuk', store)),
    fetchLatestLogCreatedAt(getLogTableName('barang_keluar', store))
  ]);

  return applyRowsToInventoryState(store, rows, {
    hasDbBaseline: true,
    lastInLogCreatedAt,
    lastOutLogCreatedAt,
    fullSyncAt: Date.now()
  });
};

const fetchChangedPartsFromLog = async (
  tableName: string,
  sinceCreatedAt: string | null
): Promise<{ partNumbers: Set<string>; latestCreatedAt: string | null; overflow: boolean }> => {
  const partNumbers = new Set<string>();
  let latestCreatedAt = sinceCreatedAt;
  let cursor = sinceCreatedAt;

  while (true) {
    let query = supabase
      .from(tableName)
      .select('created_at,part_number')
      .order('created_at', { ascending: true })
      .limit(INCREMENTAL_PAGE_SIZE);

    if (cursor) {
      query = query.gt('created_at', cursor);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) break;

    for (const row of data as any[]) {
      const createdAt = String(row?.created_at || '').trim();
      if (createdAt && (!latestCreatedAt || createdAt > latestCreatedAt)) {
        latestCreatedAt = createdAt;
      }
      const part = String(row?.part_number || '').trim();
      if (part) partNumbers.add(part);
    }

    if (data.length >= INCREMENTAL_PAGE_SIZE) {
      return { partNumbers, latestCreatedAt, overflow: true };
    }
    break;
  }

  return { partNumbers, latestCreatedAt, overflow: false };
};

const chunkStrings = (values: string[], size: number): string[][] => {
  if (size <= 0) return [values];
  const chunks: string[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
};

const incrementalSyncInventoryState = async (store: string | null | undefined): Promise<InventoryIncrementalState> => {
  const state = getOrCreateInventoryState(store);

  if (!state.loaded || !state.hasDbBaseline || Date.now() - state.lastFullSyncAt > INVENTORY_FULL_SYNC_INTERVAL_MS) {
    return fullSyncInventoryState(store);
  }

  if (Date.now() - state.lastIncrementalCheckAt < INVENTORY_INCREMENTAL_CHECK_INTERVAL_MS) {
    return state;
  }

  const table = getTableName(store);
  const changedParts = new Set<string>();
  let latestCreatedAt = state.lastBaseCreatedAt;

  if (latestCreatedAt) {
    const { data: newRows, error: newRowsError } = await supabase
      .from(table)
      .select(INVENTORY_SELECT_COLUMNS)
      .gt('created_at', latestCreatedAt)
      .order('created_at', { ascending: true })
      .limit(INCREMENTAL_PAGE_SIZE);

    if (!newRowsError && newRows && newRows.length > 0) {
      for (const row of newRows as any[]) {
        const part = String(row?.part_number || '').trim();
        if (!part) continue;
        state.byPartNumber.set(part, row);
        changedParts.add(part);
        const createdAt = String(row?.created_at || '');
        if (createdAt && (!latestCreatedAt || createdAt > latestCreatedAt)) {
          latestCreatedAt = createdAt;
        }
      }
      if (newRows.length >= INCREMENTAL_PAGE_SIZE) {
        // Jika delta terlalu besar, fallback full sync supaya tidak miss row.
        return fullSyncInventoryState(store);
      }
    }
  } else {
    return fullSyncInventoryState(store);
  }

  const [inChanges, outChanges] = await Promise.all([
    fetchChangedPartsFromLog(getLogTableName('barang_masuk', store), state.lastInLogCreatedAt),
    fetchChangedPartsFromLog(getLogTableName('barang_keluar', store), state.lastOutLogCreatedAt)
  ]);

  if (inChanges.overflow || outChanges.overflow) {
    return fullSyncInventoryState(store);
  }

  inChanges.partNumbers.forEach((pn) => changedParts.add(pn));
  outChanges.partNumbers.forEach((pn) => changedParts.add(pn));

  if (inChanges.latestCreatedAt) state.lastInLogCreatedAt = inChanges.latestCreatedAt;
  if (outChanges.latestCreatedAt) state.lastOutLogCreatedAt = outChanges.latestCreatedAt;

  if (changedParts.size > 0) {
    const changedArray = Array.from(changedParts);
    const chunks = chunkStrings(changedArray, 100);
    for (const chunk of chunks) {
      const { data: changedRows, error: changedRowsError } = await supabase
        .from(table)
        .select(INVENTORY_SELECT_COLUMNS)
        .in('part_number', chunk);

      if (changedRowsError) continue;

      const foundParts = new Set<string>();
      (changedRows || []).forEach((row: any) => {
        const part = String(row?.part_number || '').trim();
        if (!part) return;
        foundParts.add(part);
        state.byPartNumber.set(part, row);
      });

      // Jika part tidak lagi ada di base table (mis. dihapus), hapus dari state.
      chunk.forEach((part) => {
        if (!foundParts.has(part)) {
          state.byPartNumber.delete(part);
        }
      });
    }
  }

  state.lastBaseCreatedAt = latestCreatedAt;
  state.lastIncrementalCheckAt = Date.now();
  return state;
};

const getInventoryRowsFromIncrementalDb = async (store: string | null | undefined): Promise<any[]> => {
  const state = await incrementalSyncInventoryState(store);
  return sortInventoryRowsByName(Array.from(state.byPartNumber.values()));
};

const hydrateInventoryStateFromSnapshot = (
  store: string | null | undefined,
  snapshot: InventorySnapshotPayload
) => {
  applyRowsToInventoryState(store, snapshot.items || [], {
    hasDbBaseline: false,
    lastInLogCreatedAt: null,
    lastOutLogCreatedAt: null,
    fullSyncAt: Date.now()
  });
};

const getInventoryRowsIncremental = async (store: string | null | undefined): Promise<any[]> => {
  const safeStore = getStoreStateKey(store);
  const isDirty = inventorySnapshotDirtyStores.has(safeStore);
  const snapshotUnavailable = isSnapshotTemporarilyUnavailable(safeStore);

  if (!snapshotUnavailable) {
    if (shouldAttemptSnapshotLoadNow(safeStore)) {
      const snapshot = await loadInventorySnapshotFromStorage(safeStore);
      if (snapshot) {
        if (isDirty) {
          // Dirty = snapshot lama, tampilkan dulu lalu sinkronisasi ulang di background.
          scheduleInventorySnapshotSync(safeStore);
        }
        hydrateInventoryStateFromSnapshot(safeStore, snapshot);
        return sortInventoryRowsByName([...(snapshot.items || [])]);
      }
    } else {
      const cachedSnapshot = inventorySnapshotMemoryByStore.get(safeStore)?.payload;
      if (cachedSnapshot) {
        if (isDirty) {
          scheduleInventorySnapshotSync(safeStore);
        }
        hydrateInventoryStateFromSnapshot(safeStore, cachedSnapshot);
        return sortInventoryRowsByName([...(cachedSnapshot.items || [])]);
      }
    }
  }

  const rows = await getInventoryRowsFromIncrementalDb(safeStore);
  if (!snapshotUnavailable) {
    scheduleInventorySnapshotSync(safeStore);
  }
  return rows;
};

const normalizeLikeFilter = (value: string | undefined): string =>
  String(value || '').trim().toLowerCase();

const applyInventoryFiltersLocal = (rows: any[], filters?: {
  partNumber?: string;
  name?: string;
  brand?: string;
  app?: string;
  type?: string;
}): any[] => {
  const partNumber = normalizeLikeFilter(filters?.partNumber);
  const name = normalizeLikeFilter(filters?.name);
  const brand = normalizeLikeFilter(filters?.brand);
  const app = normalizeLikeFilter(filters?.app);
  const type = String(filters?.type || '').trim().toLowerCase();

  return rows.filter((row) => {
    const part = String(row?.part_number || '').toLowerCase();
    const rowName = String(row?.name || '').toLowerCase();
    const rowBrand = String(row?.brand || '').toLowerCase();
    const rowApp = String(row?.application || '').toLowerCase();
    const qty = Number(row?.quantity || 0);

    if (partNumber && !part.includes(partNumber)) return false;
    if (name && !rowName.includes(name)) return false;
    if (brand && !rowBrand.includes(brand)) return false;
    if (app && !rowApp.includes(app)) return false;
    if (type === 'low' && !(qty > 0 && qty <= 3)) return false;
    if (type === 'empty' && qty !== 0) return false;
    return true;
  });
};

const getWibDayState = () => {
  const now = new Date();
  const wibOffsetMinutes = 7 * 60;
  const localOffset = now.getTimezoneOffset();
  const wibNow = new Date(now.getTime() + (localOffset + wibOffsetMinutes) * 60000);
  const dayKey = `${wibNow.getFullYear()}-${String(wibNow.getMonth() + 1).padStart(2, '0')}-${String(wibNow.getDate()).padStart(2, '0')}`;
  const startOfDayWib = new Date(wibNow.getFullYear(), wibNow.getMonth(), wibNow.getDate(), 0, 0, 0, 0);
  const startOfDayUtc = new Date(startOfDayWib.getTime() - (localOffset + wibOffsetMinutes) * 60000);
  return {
    dayKey,
    todayStartIso: startOfDayUtc.toISOString()
  };
};

const sumDailyQtyFromRows = (
  rows: any[],
  qtyColumn: 'qty_masuk' | 'qty_keluar',
  todayStartIso: string
): { totalQty: number; latestCreatedAt: string | null } => {
  let totalQty = 0;
  let latestCreatedAt: string | null = null;
  const startMs = new Date(todayStartIso).getTime();
  if (!Number.isFinite(startMs)) return { totalQty: 0, latestCreatedAt: null };

  for (const row of rows || []) {
    const createdAt = String(row?.created_at || '').trim();
    if (!createdAt) continue;
    const ts = new Date(createdAt).getTime();
    if (!Number.isFinite(ts) || ts < startMs) continue;
    totalQty += Number(row?.[qtyColumn] || 0);
    if (!latestCreatedAt || createdAt > latestCreatedAt) {
      latestCreatedAt = createdAt;
    }
  }

  return { totalQty, latestCreatedAt };
};

const getTodayLogStatsIncremental = async (store: string | null | undefined): Promise<{ todayIn: number; todayOut: number }> => {
  const storeKey = getStoreStateKey(store);
  const { dayKey, todayStartIso } = getWibDayState();
  const cacheKey = buildReadCacheKey('today-log-stats', store, { dayKey });
  const stats = await cacheReadQuery<{ todayIn: number; todayOut: number; latestIn: string | null; latestOut: string | null }>(
    cacheKey,
    20 * 1000,
    async () => {
      const [inRows, outRows] = await Promise.all([
        getEdgeListRowsWithSnapshot<any>(store, 'barang-masuk-log'),
        getEdgeListRowsWithSnapshot<any>(store, 'barang-keluar-log')
      ]);
      const fullIn = sumDailyQtyFromRows(inRows || [], 'qty_masuk', todayStartIso);
      const fullOut = sumDailyQtyFromRows(outRows || [], 'qty_keluar', todayStartIso);
      return {
        todayIn: fullIn.totalQty,
        todayOut: fullOut.totalQty,
        latestIn: fullIn.latestCreatedAt,
        latestOut: fullOut.latestCreatedAt
      };
    }
  );

  dailyLogStatsByStore.set(storeKey, {
    dayKey,
    todayStartIso,
    lastInLogCreatedAt: stats.latestIn,
    lastOutLogCreatedAt: stats.latestOut,
    todayIn: stats.todayIn,
    todayOut: stats.todayOut
  });

  return { todayIn: stats.todayIn, todayOut: stats.todayOut };
};

const fetchAllModalLogs = async (): Promise<{ masukRows: ModalMasukRow[]; keluarRows: ModalKeluarRow[] }> => {
  const cacheKey = buildReadCacheKey('asset-modal-logs-all', null);
  return cacheReadQuery<{ masukRows: ModalMasukRow[]; keluarRows: ModalKeluarRow[] }>(
    cacheKey,
    30 * 1000,
    async () => {
      const [masukMjm, masukBjw, keluarMjm, keluarBjw] = await Promise.all([
        getEdgeListRowsWithSnapshot<ModalMasukRow>('mjm', 'barang-masuk-log'),
        getEdgeListRowsWithSnapshot<ModalMasukRow>('bjw', 'barang-masuk-log'),
        getEdgeListRowsWithSnapshot<ModalKeluarRow>('mjm', 'barang-keluar-log'),
        getEdgeListRowsWithSnapshot<ModalKeluarRow>('bjw', 'barang-keluar-log'),
      ]);

      return {
        masukRows: [...masukMjm, ...masukBjw],
        keluarRows: [...keluarMjm, ...keluarBjw],
      };
    }
  );
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
  try {
    const [baseItems, { masukRows, keluarRows }] = await Promise.all([
      getInventoryRowsIncremental(store),
      fetchAllModalLogs(),
    ]);
    const rows = buildAssetProfitRows(
      (baseItems || []).map((row: any) => ({
        part_number: row?.part_number,
        name: row?.name,
        quantity: row?.quantity
      })) as ModalBaseItemRow[],
      masukRows,
      keluarRows
    );
    return summarizeAssetProfitRows(rows);
  } catch (err) {
    console.error('Gagal mengambil detail asset/profit:', err);
    return summarizeAssetProfitRows([]);
  }
};

// --- FETCH DISTINCT ECOMMERCE VALUES ---
export const fetchDistinctEcommerce = async (store: string | null): Promise<string[]> => {
  const cacheKey = buildReadCacheKey('distinct-ecommerce', store);

  return cacheReadQuery<string[]>(cacheKey, DISTINCT_VALUES_CACHE_TTL_MS, async () => {
    try {
      const rows = await getEdgeListRowsWithSnapshot<any>(store, 'sold-items');
      const uniqueValues = [...new Set((rows || []).map((d: any) => d?.ecommerce?.toUpperCase()).filter(Boolean))];
      return uniqueValues.sort();
    } catch (err) {
      console.error('Fetch Distinct Ecommerce Exception:', err);
      return [];
    }
  });
};

// --- FETCH DISTINCT SUPPLIERS (Customer dari Barang Masuk) ---
export const fetchDistinctSuppliers = async (store: string | null): Promise<string[]> => {
  const cacheKey = buildReadCacheKey('distinct-suppliers', store);

  return cacheReadQuery<string[]>(cacheKey, DISTINCT_VALUES_CACHE_TTL_MS, async () => {
    try {
      const rows = await getEdgeListRowsWithSnapshot<any>(store, 'barang-masuk-log');
      const uniqueValues = [...new Set(
        (rows || [])
          .map((d: any) => d?.customer?.trim().toUpperCase())
          .filter(Boolean)
          .filter(c => c !== '-' && c !== '')
      )];
      return uniqueValues.sort();
    } catch (err) {
      console.error('Fetch Distinct Suppliers Exception:', err);
      return [];
    }
  });
};

// --- FETCH DISTINCT CUSTOMERS (Customer dari Barang Keluar) ---
export const fetchDistinctCustomers = async (store: string | null): Promise<string[]> => {
  const cacheKey = buildReadCacheKey('distinct-customers', store);

  return cacheReadQuery<string[]>(cacheKey, DISTINCT_VALUES_CACHE_TTL_MS, async () => {
    try {
      const rows = await getEdgeListRowsWithSnapshot<any>(store, 'sold-items');
      const uniqueValues = [...new Set(
        (rows || [])
          .map((d: any) => d?.customer?.trim().toUpperCase())
          .filter(Boolean)
          .filter(c => c !== '-' && c !== '')
      )];
      return uniqueValues.sort();
    } catch (err) {
      console.error('Fetch Distinct Customers Exception:', err);
      return [];
    }
  });
};

// --- FETCH SEARCH SUGGESTIONS (untuk dropdown autocomplete) ---
export const fetchSearchSuggestions = async (
  store: string | null,
  field: 'part_number' | 'name' | 'brand' | 'application',
  searchQuery: string
): Promise<string[]> => {
  const normalizedQuery = (searchQuery || '').trim();
  if (!normalizedQuery) return [];

  const cacheKey = buildReadCacheKey('search-suggestions', store, {
    field,
    query: normalizedQuery
  });

  return cacheReadQuery<string[]>(cacheKey, SEARCH_SUGGESTIONS_CACHE_TTL_MS, async () => {
    try {
      const rows = await getInventoryRowsIncremental(store);
      const queryLower = normalizedQuery.toLowerCase();
      const uniqueValues = [...new Set(
        (rows || [])
          .map((d: any) => d?.[field]?.toString().trim())
          .filter(Boolean)
          .filter((value: string) => value.toLowerCase().includes(queryLower))
      )];
      return uniqueValues.sort().slice(0, 20);
    } catch (err) {
      console.error(`Fetch ${field} Suggestions Exception:`, err);
      return [];
    }
  });
};

// --- FETCH ALL DISTINCT VALUES (untuk initial load) ---
export const fetchAllDistinctValues = async (
  store: string | null,
  field: 'part_number' | 'name' | 'brand' | 'application'
): Promise<string[]> => {
  const cacheKey = buildReadCacheKey('distinct-values', store, { field });

  return cacheReadQuery<string[]>(cacheKey, DISTINCT_VALUES_CACHE_TTL_MS, async () => {
    try {
      const rows = await getInventoryRowsIncremental(store);
      const uniqueValues = [...new Set(
        (rows || [])
          .map((d: any) => d?.[field]?.toString().trim())
          .filter(Boolean)
      )];
      return uniqueValues.sort();
    } catch (err) {
      console.error(`Fetch All ${field} Exception:`, err);
      return [];
    }
  });
};

// --- FETCH INVENTORY BY PART NUMBER (untuk quick search) ---
export const fetchInventoryByPartNumber = async (
  store: string | null,
  searchValue: string
): Promise<InventoryItem | null> => {
  const normalizedSearch = (searchValue || '').trim();
  if (!normalizedSearch) return null;

  const cacheKey = buildReadCacheKey('inventory-by-part', store, {
    searchValue: normalizedSearch
  });

  return cacheReadQuery<InventoryItem | null>(cacheKey, INVENTORY_BY_PART_CACHE_TTL_MS, async () => {
    try {
      const rows = await getInventoryRowsIncremental(store);
      const lowerSearch = normalizedSearch.toLowerCase();
      let data = rows.find((row: any) =>
        String(row?.part_number || '').toLowerCase() === lowerSearch
      ) || null;

      if (!data) {
        data = rows.find((row: any) =>
          String(row?.name || '').toLowerCase().includes(lowerSearch)
        ) || null;
      }
      if (!data) return null;
      const photoMap = await fetchPhotosForItems([data]);
      return mapItemFromDB(data, photoMap[data.part_number]);
    } catch (err) {
      console.error('Fetch Inventory By Part Number Exception:', err);
      return null;
    }
  });
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
interface GlobalFotoIndex {
  byExact: Record<string, any>;
  byNormalized: Record<string, any>;
}
interface GlobalPriceListIndex {
  byExact: Record<string, number>;
  byNormalized: Record<string, number>;
}
interface ProductAliasRow {
  part_number: string;
  alias_name: string;
  source?: string | null;
}

const getGlobalFotoIndex = async (): Promise<GlobalFotoIndex> => {
  const cacheKey = buildReadCacheKey('snapshot-foto-index', 'mjm');
  return cacheReadQuery<GlobalFotoIndex>(cacheKey, 2 * 60 * 1000, async () => {
    const rows = await getEdgeListRowsWithSnapshot<any>('mjm', 'foto-rows');
    const byExact: Record<string, any> = {};
    const byNormalized: Record<string, any> = {};
    (rows || []).forEach((row: any) => {
      const part = String(row?.part_number || '').trim();
      if (!part) return;
      byExact[part] = row;
      byNormalized[normalizePartForLookup(part)] = row;
    });
    return { byExact, byNormalized };
  });
};

const getGlobalPriceListIndex = async (): Promise<GlobalPriceListIndex> => {
  const cacheKey = buildReadCacheKey('snapshot-price-list-index', 'mjm');
  return cacheReadQuery<GlobalPriceListIndex>(cacheKey, 2 * 60 * 1000, async () => {
    const rows = await getEdgeListRowsWithSnapshot<any>('mjm', 'list-harga-jual');
    const byExact: Record<string, number> = {};
    const byNormalized: Record<string, number> = {};
    (rows || []).forEach((row: any) => {
      const part = String(row?.part_number || '').trim();
      const harga = Number(row?.harga || 0);
      if (!part || harga <= 0) return;
      byExact[part] = harga;
      byNormalized[normalizePartForLookup(part)] = harga;
    });
    return { byExact, byNormalized };
  });
};

const getGlobalProductAliasRows = async (): Promise<ProductAliasRow[]> => {
  const cacheKey = buildReadCacheKey('snapshot-product-alias-rows', 'mjm');
  return cacheReadQuery<ProductAliasRow[]>(cacheKey, 90 * 1000, async () => {
    const rows = await getEdgeListRowsWithSnapshot<any>('mjm', 'product-alias');
    return (rows || []) as ProductAliasRow[];
  });
};

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

  try {
    const allMasukRows = await getEdgeListRowsWithSnapshot<any>(store, 'barang-masuk-log');
    const resolvedNorm = new Set<string>();
    const targetNorms = new Set(missingPartNumbers.map((pn) => normalizePartForLookup(pn)));

    (allMasukRows || []).forEach((row: any) => {
      const pk = (row.part_number || '').trim();
      if (!pk) return;
      const norm = normalizePartForLookup(pk);
      if (!targetNorms.has(norm) || resolvedNorm.has(norm)) return;

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
    // 1) Ambil harga dari snapshot list_harga_jual.
    const priceIndex = await getGlobalPriceListIndex();
    const unresolvedNorms = new Set(missingPartNumbers.map((pn) => normalizePartForLookup(pn)));
    
    missingPartNumbers.forEach((pn) => {
      const norm = normalizePartForLookup(pn);
      const harga = Number(priceIndex.byExact[pn] ?? priceIndex.byNormalized[norm] ?? 0);
      if (harga > 0) {
        setNumberCacheValue(sellPriceCache, buildStorePartCacheKey(store, pn), harga, SELL_PRICE_CACHE_TTL_MS);
        setPriceMapEntry(priceMap, pn, harga);
        unresolvedNorms.delete(norm);
      } else {
        setNumberCacheValue(sellPriceCache, buildStorePartCacheKey(store, pn), 0, SELL_PRICE_MISS_TTL_MS);
      }
    });

    // 2) Jika harga belum ada, cari dari snapshot barang_keluar (harga terakhir laku).
    if (unresolvedNorms.size > 0) {
      const unresolvedParts = Array.from(unresolvedNorms)
        .map((norm) => originalByNorm.get(norm) || norm)
        .filter(Boolean);
      
      const outData = await getEdgeListRowsWithSnapshot<any>(store, 'sold-items');
      const unresolvedNormSet = new Set(unresolvedParts.map((pn) => normalizePartForLookup(pn)));
      const outPriceMapByNorm: Record<string, number> = {};
      (outData || []).forEach((row: any) => {
        const pk = (row.part_number || '').trim();
        const norm = normalizePartForLookup(pk);
        if (pk && unresolvedNormSet.has(norm) && !outPriceMapByNorm[norm]) {
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
      const fotoIndex = await getGlobalFotoIndex();
      const fetchedSet = new Set<string>();

      missingPartNumbers.forEach((pn) => {
        const norm = normalizePartForLookup(pn);
        const row = fotoIndex.byExact[pn] || fotoIndex.byNormalized[norm];
        if (row) {
          setPhotoRowCacheEntry(row.part_number || pn, row);
          fetchedSet.add(normalizePhotoCacheKey(pn));
        }
      });

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
      invalidateGlobalEdgeListSnapshotCaches(['foto-rows']);
      invalidateInventoryReadCaches(null, {
        invalidateEdgeLists: false,
        invalidateSoldProgressive: false
      });
      return;
    }
    const photoPayload = mapImagesToPhotoRow(partNumber, images);
    await supabase.from('foto').upsert(photoPayload, { onConflict: 'part_number' });
    setPhotoRowCacheEntry(partNumber, photoPayload);
    invalidateGlobalEdgeListSnapshotCaches(['foto-rows']);
    invalidateInventoryReadCaches(null, {
      invalidateEdgeLists: false,
      invalidateSoldProgressive: false
    });
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
    const trimmedSearch = searchTerm?.trim() || '';
    const rows = await getEdgeListRowsWithSnapshot<FotoProdukRow>('mjm', 'foto-rows');
    const filtered = trimmedSearch
      ? (rows || []).filter((row: any) =>
          String(row?.part_number || '').toLowerCase().includes(trimmedSearch.toLowerCase())
        )
      : (rows || []);
    return [...filtered].sort((a: any, b: any) =>
      String(b?.created_at || '').localeCompare(String(a?.created_at || ''))
    );
  } catch (err) {
    console.error('fetchFotoProduk Exception:', err);
    return [];
  }
};

// Fetch all foto_link entries
export const fetchFotoLink = async (searchTerm?: string): Promise<FotoLinkRow[]> => {
  try {
    const trimmedSearch = searchTerm?.trim() || '';
    const rows = await getEdgeListRowsWithSnapshot<FotoLinkRow>('mjm', 'foto-link');
    return (rows || []).filter((row: any) =>
      !trimmedSearch ||
      String(row?.nama_csv || '').toLowerCase().includes(trimmedSearch.toLowerCase())
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
    const data = await getEdgeListRowsWithSnapshot<FotoLinkRow>('mjm', 'foto-link');

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
    const fotoIndex = await getGlobalFotoIndex();
    const existing = new Set<string>();
    (partNumbers || []).forEach((pn) => {
      const norm = normalizePartForLookup(pn);
      if (fotoIndex.byExact[pn] || fotoIndex.byNormalized[norm]) {
        existing.add(pn);
      }
    });
    return existing;
  } catch (err) {
    console.error('checkExistingFotoPartNumbers Exception:', err);
    return new Set();
  }
};

// Fetch all part numbers from MJM store (for autocomplete)
export const fetchAllPartNumbersMJM = async (): Promise<Array<{ part_number: string; name: string }>> => {
  try {
    const data = await getInventoryRowsIncremental('mjm');

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
    const { error } = await supabase
      .from('foto')
      .upsert(rows, { onConflict: 'part_number' });

    if (error) {
      console.error('insertFotoBatch Error:', error);
      return { success: false, error: error.message };
    }

    // Sync cache foto agar Dashboard/Beranda bisa langsung pakai data terbaru.
    rows.forEach((row) => {
      if (!row?.part_number) return;
      setPhotoRowCacheEntry(row.part_number, row);
    });

    invalidateGlobalEdgeListSnapshotCaches(['foto-rows']);
    invalidateInventoryReadCaches(null, {
      invalidateEdgeLists: false,
      invalidateSoldProgressive: false
    });
    return { success: true, inserted: rows.length };
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

    invalidateGlobalEdgeListSnapshotCaches(['foto-link']);
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
      invalidateGlobalEdgeListSnapshotCaches(['foto-rows', 'product-alias', 'foto-link']);
      invalidateInventoryReadCaches(null, {
        invalidateEdgeLists: false,
        invalidateSoldProgressive: false
      });
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
      invalidateGlobalEdgeListSnapshotCaches(['foto-rows', 'product-alias', 'foto-link']);
      invalidateInventoryReadCaches(null, {
        invalidateEdgeLists: false,
        invalidateSoldProgressive: false
      });
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
    const [mjmInventoryRows, bjwInventoryRows] = await Promise.all([
      getInventoryRowsIncremental('mjm'),
      getInventoryRowsIncremental('bjw')
    ]);
    const inventoryPartSet = new Set<string>([
      ...(mjmInventoryRows || []).map((row: any) => normalizePartForLookup(row?.part_number)),
      ...(bjwInventoryRows || []).map((row: any) => normalizePartForLookup(row?.part_number))
    ].filter(Boolean));

    // 3. For each SKU, insert/upsert to foto table and update base_mjm/bjw
    for (const sku of skuArray) {
      const skuExistsInInventory = inventoryPartSet.has(normalizePartForLookup(sku));
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
      invalidateGlobalEdgeListSnapshotCaches(['foto-rows', 'product-alias', 'foto-link']);
      invalidateInventoryReadCaches(null, {
        invalidateEdgeLists: false,
        invalidateSoldProgressive: false
      });
      return { 
        success: true, 
        warning: `SKU tidak ditemukan di inventory: ${notFoundSkus.join(', ')}. Foto tersimpan tapi tidak akan muncul di Beranda/Gudang.` 
      };
    }

    invalidateGlobalEdgeListSnapshotCaches(['foto-rows', 'product-alias', 'foto-link']);
    invalidateInventoryReadCaches(null, {
      invalidateEdgeLists: false,
      invalidateSoldProgressive: false
    });
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
  const searchLower = searchTerm.toLowerCase().trim();

  try {
    const inventoryRows = await getInventoryRowsIncremental(store);
    const directResults = (inventoryRows || [])
      .filter((row: any) => {
        const part = String(row?.part_number || '').toLowerCase();
        const name = String(row?.name || '').toLowerCase();
        return part.includes(searchLower) || name.includes(searchLower);
      })
      .slice(0, 50);

    const aliasRows = await getGlobalProductAliasRows();
    const aliasResults = (aliasRows || [])
      .filter((row) => String(row?.alias_name || '').toLowerCase().includes(searchLower))
      .slice(0, 100);

    const aliasPartNumbers = new Set(
      (aliasResults || [])
        .map((a) => String(a?.part_number || '').trim())
        .filter(Boolean)
        .map((pn) => normalizePartForLookup(pn))
    );

    const aliasItems = (inventoryRows || []).filter((row: any) =>
      aliasPartNumbers.has(normalizePartForLookup(row?.part_number))
    );

    // Merge results (avoid duplicates)
    const allItems = [...directResults];
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
  const cacheKey = buildReadCacheKey('inventory-list', store, {
    includePhotos,
    includePrices,
    includeCostPrices
  });

  return cacheReadQuery<InventoryItem[]>(cacheKey, INVENTORY_LIST_CACHE_TTL_MS, async () => {
    const items = await getInventoryRowsIncremental(store);
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
  });
};

export const fetchInventoryPaginated = async (store: string | null, page: number, perPage: number, filters?: any): Promise<{ data: InventoryItem[]; total: number }> => {
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const normalizedFilters = {
    partNumber: String(filters?.partNumber || '').trim(),
    name: String(filters?.name || '').trim(),
    brand: String(filters?.brand || '').trim(),
    app: String(filters?.app || '').trim(),
    type: String(filters?.type || '').trim()
  };
  const cacheKey = buildReadCacheKey('inventory-paginated', store, {
    page,
    perPage,
    filters: normalizedFilters
  });

  return cacheReadQuery<{ data: InventoryItem[]; total: number }>(
    cacheKey,
    INVENTORY_LIST_CACHE_TTL_MS,
    async () => {
      const allRows = await getInventoryRowsIncremental(store);
      const filteredRows = applyInventoryFiltersLocal(allRows, normalizedFilters);
      const count = filteredRows.length;
      const items = filteredRows.slice(from, to + 1);
      if (!items || items.length === 0) return { data: [], total: count };

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
    }
  );
};

export const fetchInventoryStats = async (store: string | null): Promise<any> => {
  const cacheKey = buildReadCacheKey('inventory-stats', store);

  return cacheReadQuery<any>(cacheKey, INVENTORY_STATS_CACHE_TTL_MS, async () => {
    // Ambil inventory dari state incremental (full sync + delta).
    const inventoryRows = await getInventoryRowsIncremental(store);
    const items = (inventoryRows || []).map((row: any) => ({
      part_number: row?.part_number || '',
      name: row?.name || '',
      quantity: Number(row?.quantity || 0)
    })) as ModalBaseItemRow[];

    const totalItems = items.length;
    const totalStock = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

    // Hanya ambil delta log harian sejak request terakhir.
    const { todayIn, todayOut } = await getTodayLogStatsIncremental(store);

    // 5. Calculate total asset as total modal stock (same basis as Zakat Tahunan modal)
    const totalAsset = await calculateModalStockTotal(items);

    return { totalItems, totalStock, totalAsset, todayIn, todayOut };
  });
};

export const fetchInventoryAllFiltered = async (store: string | null, filters?: any): Promise<InventoryItem[]> => {
  const normalizedFilters = {
    partNumber: String(filters?.partNumber || '').trim(),
    name: String(filters?.name || '').trim(),
    brand: String(filters?.brand || '').trim(),
    app: String(filters?.app || '').trim(),
    type: String(filters?.type || '').trim()
  };
  const cacheKey = buildReadCacheKey('inventory-all-filtered', store, { filters: normalizedFilters });

  return cacheReadQuery<InventoryItem[]>(cacheKey, INVENTORY_LIST_CACHE_TTL_MS, async () => {
    const allRows = await getInventoryRowsIncremental(store);
    const items = applyInventoryFiltersLocal(allRows, normalizedFilters);
    if (!items || items.length === 0) return [];

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
  invalidatePriceCachesForStore(store, data.partNumber);
  invalidateInventoryReadCaches(store, {
    invalidateEdgeLists: false,
    invalidateSoldProgressive: false
  });
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

  if (result.inserted > 0) {
    invalidatePriceCachesForStore(store);
    invalidateInventoryReadCaches(store, {
      invalidateEdgeLists: false,
      invalidateSoldProgressive: false
    });
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
      await supabase
        .from('list_harga_jual')
        .upsert(
          [{ part_number: pk, name: item.name, harga: item.price, created_at: getWIBDate().toISOString() }],
          { onConflict: 'part_number' }
        );
      invalidateGlobalEdgeListSnapshotCaches(['list-harga-jual']);
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
  invalidatePriceCachesForStore(store, pk);
  if (Number.isFinite(Number(item.price)) && Number(item.price) > 0) {
    setNumberCacheValue(
      sellPriceCache,
      buildStorePartCacheKey(store, pk),
      Number(item.price),
      SELL_PRICE_CACHE_TTL_MS
    );
  }
  if (Number.isFinite(Number(item.costPrice)) && Number(item.costPrice) > 0) {
    setNumberCacheValue(
      costPriceCache,
      buildStorePartCacheKey(store, pk),
      Number(item.costPrice),
      COST_PRICE_CACHE_TTL_MS
    );
  }
  const edgeDatasets: EdgeListDatasetName[] = [];
  if (transactionData?.type === 'in') {
    edgeDatasets.push('barang-masuk-log');
  }
  if (transactionData?.type === 'out') {
    edgeDatasets.push('barang-keluar-log', 'sold-items');
  }
  const shouldInvalidateSoldProgressive = edgeDatasets.includes('sold-items');
  invalidateInventoryReadCaches(store, {
    invalidateEdgeLists: edgeDatasets.length > 0 ? edgeDatasets : false,
    invalidateSoldProgressive: shouldInvalidateSoldProgressive
  });
  return item;
};

export const deleteInventory = async (id: string, store?: string | null): Promise<boolean> => {
  const table = getTableName(store);
  const { error } = await supabase.from(table).delete().eq('part_number', id);
  if (!error) {
    setPhotoRowCacheEntry(id, null);
    invalidatePriceCachesForStore(store, id);
    invalidateInventoryReadCaches(store, {
      invalidateEdgeLists: false,
      invalidateSoldProgressive: false
    });
  }
  return !error;
};

export const getItemByPartNumber = async (partNumber: string, store?: string | null): Promise<InventoryItem | null> => {
  const normalizedPart = (partNumber || '').trim();
  if (!normalizedPart) return null;

  const cacheKey = buildReadCacheKey('item-by-part-exact', store, {
    partNumber: normalizedPart
  });

  return cacheReadQuery<InventoryItem | null>(cacheKey, EXACT_ITEM_CACHE_TTL_MS, async () => {
    const rows = await getInventoryRowsIncremental(store);
    const data = rows.find((row: any) =>
      String(row?.part_number || '').trim().toUpperCase() === normalizedPart.toUpperCase()
    );
    if (!data) return null;
    
    const photoMap = await fetchPhotosForItems([data]);
    const priceMap = await fetchLatestPricesForItems([data], store);
    
    const mapped = mapItemFromDB(data, photoMap[data.part_number]);
    const lookupKey = (data.part_number || '').trim();
    if (priceMap[lookupKey]) {
        mapped.price = priceMap[lookupKey].harga;
    }
    return mapped;
  });
};

interface BarangMasukFilters {
    search?: string;
    partNumber?: string;
    customer?: string;
    dateFrom?: string;
    dateTo?: string;
}

export const fetchBarangMasukLog = async (store: string | null, page = 1, limit = 20, filters: BarangMasukFilters = {}) => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const allRows = await getEdgeListRowsWithSnapshot<any>(store, 'barang-masuk-log');
    const search = String(filters.search || '').trim().toLowerCase();
    const partNumberFilter = String(filters.partNumber || '').trim().toLowerCase();
    const customerFilter = String(filters.customer || '').trim().toLowerCase();
    const dateFromTs = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : null;
    const dateToTs = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).getTime() : null;

    const filteredRows = (allRows || []).filter((row: any) => {
      const part = String(row?.part_number || '').toLowerCase();
      const name = String(row?.nama_barang || row?.name || '').toLowerCase();
      const customer = String(row?.customer || '').toLowerCase();
      const createdTs = row?.created_at ? new Date(row.created_at).getTime() : 0;

      if (search && !(part.includes(search) || name.includes(search) || customer.includes(search))) return false;
      if (partNumberFilter && !part.includes(partNumberFilter)) return false;
      if (customerFilter && !customer.includes(customerFilter)) return false;
      if (dateFromTs !== null && Number.isFinite(dateFromTs) && createdTs < dateFromTs) return false;
      if (dateToTs !== null && Number.isFinite(dateToTs) && createdTs > dateToTs) return false;
      return true;
    });

    filteredRows.sort((a: any, b: any) => {
      const idA = Number(a?.id || 0);
      const idB = Number(b?.id || 0);
      if (idA !== idB) return idB - idA;
      const tsA = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tsB = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return tsB - tsA;
    });

    const pagedRows = filteredRows.slice(from, to + 1);
    const partNumbers = [...new Set((pagedRows || []).map(row => row.part_number).filter(Boolean))];
    const stockMap = await fetchStockQtyMapByPartNumbers(store, partNumbers);
    
    const mappedData = (pagedRows || []).map(row => ({
        ...row,
        name: row.nama_barang || row.name, 
        quantity: row.qty_masuk,
        current_qty: stockMap[row.part_number] ?? 0
    }));

    return { data: mappedData, total: filteredRows.length || 0 };
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
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const normalizedFilters = {
    searchTerm: String(filters.searchTerm || '').trim(),
    partNumberSearch: String(filters.partNumberSearch || '').trim(),
    nameSearch: String(filters.nameSearch || '').trim(),
    brandSearch: String(filters.brandSearch || '').trim(),
    applicationSearch: String(filters.applicationSearch || '').trim()
  };
  const cacheKey = buildReadCacheKey('shop-items', store, {
    page,
    perPage,
    filters: normalizedFilters
  });

  return cacheReadQuery<{ data: InventoryItem[]; count: number }>(cacheKey, SHOP_ITEMS_CACHE_TTL_MS, async () => {
    try {
      const allRows = await getInventoryRowsIncremental(store);
      const searchLower = normalizedFilters.searchTerm.toLowerCase();
      const partLower = normalizedFilters.partNumberSearch.toLowerCase();
      const nameLower = normalizedFilters.nameSearch.toLowerCase();
      const brandLower = normalizedFilters.brandSearch.toLowerCase();
      const appLower = normalizedFilters.applicationSearch.toLowerCase();

      const filteredRows = (allRows || []).filter((row: any) => {
        const part = String(row?.part_number || '').toLowerCase();
        const name = String(row?.name || '').toLowerCase();
        const brand = String(row?.brand || '').toLowerCase();
        const app = String(row?.application || '').toLowerCase();

        if (searchLower) {
          const matchSearch =
            name.includes(searchLower) ||
            part.includes(searchLower) ||
            brand.includes(searchLower) ||
            app.includes(searchLower);
          if (!matchSearch) return false;
        }
        if (partLower && !part.includes(partLower)) return false;
        if (nameLower && !name.includes(nameLower)) return false;
        if (brandLower && !brand.includes(brandLower)) return false;
        if (appLower && !app.includes(appLower)) return false;
        return true;
      });

      const count = filteredRows.length;
      const items = filteredRows.slice(from, to + 1);
      if (!items || items.length === 0) return { data: [], count };

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

      return { data: mappedItems, count };
    } catch (error) {
      console.error('[fetchShopItems] Unexpected error:', error);
      return { data: [], count: 0 };
    }
  });
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
    invalidateInventoryReadCaches(store);
    return { success: true, msg: 'Data pesanan berhasil diupdate.' };
  } catch (error: any) {
    console.error('Update Order Error:', error);
    return { success: false, msg: `Gagal update: ${error.message}` };
  }
};

// 2. FETCH OFFLINE
export const fetchOfflineOrders = async (store: string | null): Promise<OfflineOrderRow[]> => {
  return getEdgeListRowsWithSnapshot<OfflineOrderRow>(store, 'offline-orders');
};

// 2.1 FETCH SALES (KHUSUS BJW)
export const fetchSalesOrders = async (store: string | null): Promise<OfflineOrderRow[]> => {
  if (store !== 'bjw') return [];
  return getEdgeListRowsWithSnapshot<OfflineOrderRow>(store, 'sales-orders');
};

// 3. FETCH ONLINE
export const fetchOnlineOrders = async (store: string | null): Promise<OnlineOrderRow[]> => {
  return getEdgeListRowsWithSnapshot<OnlineOrderRow>(store, 'online-orders');
};

// 4. FETCH SOLD ITEMS (no limit, pagination handled in component)
export const fetchSoldItems = async (store: string | null): Promise<SoldItemRow[]> => {
  return getEdgeListRowsWithSnapshot<SoldItemRow>(store, 'sold-items');
};

export interface SoldItemsChunkPayload {
  chunk: SoldItemRow[];
  loaded: number;
  total: number;
}

const getSoldStoreKey = (store: string | null): 'mjm' | 'bjw' | null => {
  if (store === 'mjm' || store === 'bjw') return store;
  return null;
};

const emitSoldItemsChunks = async (
  rows: SoldItemRow[],
  onChunk?: (payload: SoldItemsChunkPayload) => void
) => {
  if (!onChunk) return;
  if (!rows || rows.length === 0) {
    onChunk({ chunk: [], loaded: 0, total: 0 });
    return;
  }

  const total = rows.length;
  const chunkSize = 400;
  let loaded = 0;
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    loaded += chunk.length;
    onChunk({ chunk, loaded, total });

    // Yield event loop agar UI tidak freeze pada dataset besar.
    if (i + chunkSize < total) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
};

// Fetch sold items bertahap agar UI bisa render progresif (chunk per chunk).
export const fetchSoldItemsProgressive = async (
  store: string | null,
  onChunk?: (payload: SoldItemsChunkPayload) => void
): Promise<SoldItemRow[]> => {
  const storeKey = getSoldStoreKey(store);
  if (!storeKey) return [];

  const cached = soldItemsProgressiveCacheByStore.get(storeKey);
  if (cached && cached.expiresAt > Date.now()) {
    await emitSoldItemsChunks(cached.rows, onChunk);
    return cached.rows;
  }

  const pending = soldItemsProgressiveInFlightByStore.get(storeKey);
  if (pending) {
    const rows = await pending;
    await emitSoldItemsChunks(rows, onChunk);
    return rows;
  }

  const request = (async (): Promise<SoldItemRow[]> => {
    const rows = await fetchSoldItems(storeKey);
    await emitSoldItemsChunks(rows, onChunk);

    soldItemsProgressiveCacheByStore.set(storeKey, {
      rows: [...rows],
      expiresAt: Date.now() + SOLD_ITEMS_PROGRESSIVE_CACHE_TTL_MS
    });

    return rows;
  })().finally(() => {
    soldItemsProgressiveInFlightByStore.delete(storeKey);
  });

  soldItemsProgressiveInFlightByStore.set(storeKey, request);
  return request;
};

// 4.1 FETCH SALES PAID ITEMS (KHUSUS BJW)
export const fetchSalesPaidItems = async (store: string | null): Promise<SoldItemRow[]> => {
  if (store !== 'bjw') return [];
  return getEdgeListRowsWithSnapshot<SoldItemRow>(store, 'sales-paid-items');
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

    invalidateInventoryReadCaches(store);
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

    invalidateInventoryReadCaches(store);
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

    invalidateInventoryReadCaches(store);

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

    invalidateInventoryReadCaches(store);
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

    invalidateInventoryReadCaches(store);
    return { success: true, msg: 'Tempo berhasil diupdate' };
  } catch (err: any) {
    console.error('Update Sold Item Tempo Exception:', err);
    return { success: false, msg: 'Error: ' + (err.message || 'Unknown error') };
  }
};

// 5. FETCH RETUR
export const fetchReturItems = async (store: string | null): Promise<ReturRow[]> => {
  return getEdgeListRowsWithSnapshot<ReturRow>(store, 'retur-items');
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
      invalidateInventoryReadCaches(store);
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

    invalidateInventoryReadCaches(store);
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

      invalidateInventoryReadCaches(store);
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

    invalidateInventoryReadCaches(store);
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

    invalidateInventoryReadCaches(store, {
      invalidateInventorySnapshot: false,
      invalidateEdgeLists: ['sales-orders'],
      invalidateSoldProgressive: false
    });

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

    invalidateInventoryReadCaches(store, {
      invalidateInventorySnapshot: false,
      invalidateEdgeLists: ['sales-orders'],
      invalidateSoldProgressive: false
    });

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
    invalidateInventoryReadCaches(store);
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
  store: string | null
): Promise<boolean> => {
  const tableName = store === 'mjm' ? 'orders_mjm' : (store === 'bjw' ? 'orders_bjw' : null);
  if (!tableName) { alert("Error: Toko tidak teridentifikasi"); return false; }
  if (!cart || cart.length === 0) return false;

  const normalizedTempo = (tempo || 'CASH').trim().toUpperCase();

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

    const nowIso = getWIBDate().toISOString();
    const salesRows = cart.map(item => {
      const finalPrice = item.customPrice ? Number(item.customPrice) : Number(item.price);
      return {
        tanggal: nowIso,
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

      invalidateInventoryReadCaches(store);
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
      tanggal: getWIBDate().toISOString(),
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
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const allRows = await getEdgeListRowsWithSnapshot<any>(store, 'barang-keluar-log');
    const objectFilters = typeof filters === 'object' && filters ? filters : {};
    const search = String(
      (typeof filters === 'string' ? filters : objectFilters.search) || ''
    ).trim().toLowerCase();
    const partNumberFilter = String(objectFilters.partNumber || '').trim().toLowerCase();
    const customerFilter = String(objectFilters.customer || '').trim().toLowerCase();
    const dateFromTs = objectFilters.dateFrom ? new Date(`${objectFilters.dateFrom}T00:00:00`).getTime() : null;
    const dateToTs = objectFilters.dateTo ? new Date(`${objectFilters.dateTo}T23:59:59`).getTime() : null;

    const filteredRows = (allRows || []).filter((row: any) => {
      const part = String(row?.part_number || '').toLowerCase();
      const name = String(row?.name || row?.nama_barang || '').toLowerCase();
      const customer = String(row?.customer || '').toLowerCase();
      const createdTs = row?.created_at ? new Date(row.created_at).getTime() : 0;

      if (search && !(part.includes(search) || name.includes(search) || customer.includes(search))) return false;
      if (partNumberFilter && !part.includes(partNumberFilter)) return false;
      if (customerFilter && !customer.includes(customerFilter)) return false;
      if (dateFromTs !== null && Number.isFinite(dateFromTs) && createdTs < dateFromTs) return false;
      if (dateToTs !== null && Number.isFinite(dateToTs) && createdTs > dateToTs) return false;
      return true;
    });

    filteredRows.sort((a: any, b: any) => {
      const idA = Number(a?.id || 0);
      const idB = Number(b?.id || 0);
      if (idA !== idB) return idB - idA;
      const tsA = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tsB = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return tsB - tsA;
    });

    const pagedRows = filteredRows.slice(from, to + 1);
    const partNumbers = [...new Set((pagedRows || []).map(row => row.part_number).filter(Boolean))];
    const stockMap = await fetchStockQtyMapByPartNumbers(store, partNumbers);
    
    const mappedData = (pagedRows || []).map(row => ({
        ...row,
        name: row.name || row.nama_barang, 
        quantity: row.qty_keluar,
        customer: row.customer || '-',
        tempo: row.tempo || 'CASH',
        current_qty: stockMap[row.part_number] ?? 0
    }));

    return { data: mappedData, total: filteredRows.length || 0 };
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

        invalidateInventoryReadCaches(store);
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

    invalidateInventoryReadCaches(store);
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
  const dataset: EdgeListDatasetName = type === 'in' ? 'barang-masuk-log' : 'barang-keluar-log';
  
  try {
    const rows = await getEdgeListRowsWithSnapshot<any>(effectiveStore, dataset);
    
    // Extract unique values
    const uniqueSet = new Set<string>();
    (rows || []).forEach((row: any) => {
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
  
  try {
    const dataset: EdgeListDatasetName = type === 'in' ? 'barang-masuk-log' : 'barang-keluar-log';
    const allRows = await getEdgeListRowsWithSnapshot<any>(effectiveStore, dataset);

    // Handle both old string format and new object format for backwards compatibility
    const objectFilters = typeof filters === 'object' && filters ? filters : {};
    const searchTerm = String(typeof filters === 'string' ? filters : objectFilters.search || '').trim().toLowerCase();
    const customerFilter = String(objectFilters.customer || '').trim().toLowerCase();
    const partNumberFilter = String(objectFilters.partNumber || '').trim().toLowerCase();
    const ecommerceFilter = String(objectFilters.ecommerce || '').trim().toLowerCase();

    const filteredRows = (allRows || []).filter((row: any) => {
      const nameVal = String(type === 'in' ? row?.nama_barang || row?.name || '' : row?.name || '').toLowerCase();
      const partVal = String(row?.part_number || '').toLowerCase();
      const customerVal = String(row?.customer || '').toLowerCase();
      const resiVal = String(row?.resi || '').toLowerCase();
      const ecommerceVal = String(row?.ecommerce || '').toLowerCase();

      if (searchTerm) {
        const matchesSearch = type === 'in'
          ? (nameVal.includes(searchTerm) || partVal.includes(searchTerm) || customerVal.includes(searchTerm))
          : (nameVal.includes(searchTerm) || partVal.includes(searchTerm) || customerVal.includes(searchTerm) || resiVal.includes(searchTerm));
        if (!matchesSearch) return false;
      }
      if (customerFilter && !customerVal.includes(customerFilter)) return false;
      if (partNumberFilter && !partVal.includes(partNumberFilter)) return false;
      if (ecommerceFilter && ecommerceVal !== ecommerceFilter) return false;
      return true;
    });
    
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

    const toComparable = (row: any, column: string): number | string => {
      if (column === 'created_at') {
        return row?.created_at ? new Date(row.created_at).getTime() : 0;
      }
      const value = row?.[column];
      if (typeof value === 'number') return value;
      const num = Number(value);
      if (Number.isFinite(num) && String(value ?? '').trim() !== '') return num;
      return String(value || '').toLowerCase();
    };

    filteredRows.sort((a: any, b: any) => {
      const aVal = toComparable(a, sortColumn);
      const bVal = toComparable(b, sortColumn);

      let cmp = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal), 'id');
      }

      if (cmp === 0) {
        const aTs = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bTs = b?.created_at ? new Date(b.created_at).getTime() : 0;
        cmp = aTs - bTs;
      }

      return ascending ? cmp : -cmp;
    });

    // Order and apply pagination
    const start = (page - 1) * perPage;
    const pagedRows = filteredRows.slice(start, start + perPage);
    const partNumbers = [...new Set((pagedRows || []).map(row => row.part_number).filter(Boolean))];
    const stockMap = await fetchStockQtyMapByPartNumbers(effectiveStore, partNumbers);
    
    // Map data ke format StockHistory yang dipakai HistoryTable
    const mappedData = (pagedRows || []).map((row: any) => {
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
    
    return { data: mappedData, count: filteredRows.length || 0 };
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
  const stores: Array<'mjm' | 'bjw'> = store === 'mjm' || store === 'bjw' ? [store] : ['mjm', 'bjw'];
  const targetPart = normalizePartForLookup(partNumber);
  const allHistory: { source: string; price: number; date: string; timestamp: number; isOfficial?: boolean }[] = [];
  
  for (const s of stores) {
    try {
      const rows = await getEdgeListRowsWithSnapshot<any>(s, 'barang-masuk-log');
      const filteredRows = (rows || [])
        .filter((row: any) =>
          normalizePartForLookup(row?.part_number) === targetPart &&
          Number(row?.harga_satuan || 0) > 0
        )
        .sort((a: any, b: any) =>
          new Date(String(b?.created_at || 0)).getTime() - new Date(String(a?.created_at || 0)).getTime()
        )
        .slice(0, 50);

      filteredRows.forEach((row: any) => {
        const dateObj = new Date(row.created_at);
        allHistory.push({
          source: row.customer || (s === 'mjm' ? 'MJM' : 'BJW'),
          price: Number(row.harga_satuan || 0),
          date: dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
          timestamp: dateObj.getTime(),
          isOfficial: false
        });
      });
    } catch (e) {
      console.error(`Error fetching price history from barang-masuk snapshot ${s}:`, e);
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
  
  const targetPart = normalizePartForLookup(partNumber);
  const allHistory: { source: string; price: number; date: string; timestamp: number; isOfficial: boolean }[] = [];
  
  // 1. Ambil harga dari list_harga_jual (harga resmi)
  try {
    const rows = await getEdgeListRowsWithSnapshot<any>('mjm', 'list-harga-jual');
    const officialData = (rows || []).find((row: any) =>
      normalizePartForLookup(row?.part_number) === targetPart
    );

    if (officialData && Number(officialData.harga || 0) > 0) {
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
  const stores: Array<'mjm' | 'bjw'> = store === 'mjm' || store === 'bjw' ? [store] : ['mjm', 'bjw'];
  
  for (const s of stores) {
    try {
      const rows = await getEdgeListRowsWithSnapshot<any>(s, 'sold-items');
      const filteredRows = (rows || [])
        .filter((row: any) =>
          normalizePartForLookup(row?.part_number) === targetPart &&
          Number(row?.harga_satuan || 0) > 0
        )
        .sort((a: any, b: any) =>
          new Date(String(b?.created_at || 0)).getTime() - new Date(String(a?.created_at || 0)).getTime()
        )
        .slice(0, 50);

      filteredRows.forEach((row: any) => {
        const dateObj = new Date(row.created_at);
        allHistory.push({
          source: row.customer || (s === 'mjm' ? 'MJM' : 'BJW'),
          price: Number(row.harga_satuan || 0),
          date: dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
          timestamp: dateObj.getTime(),
          isOfficial: false
        });
      });
    } catch (e) {
      console.error(`Error fetching sell price history from sold snapshot ${s}:`, e);
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
  } finally {
    invalidateInventoryReadCaches(store);
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
  } finally {
    invalidateInventoryReadCaches(store);
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
  try {
    // Step 1: Fetch items with low stock (10%)
    onProgress?.(5, 'Mengambil data stok...');
    const safeThreshold = Number.isFinite(Number(threshold)) ? Number(threshold) : 5;
    const inventoryRows = await getInventoryRowsIncremental(store);
    const items = (inventoryRows || [])
      .filter((row: any) => Number(row?.quantity || 0) < safeThreshold)
      .sort((a: any, b: any) => Number(a?.quantity || 0) - Number(b?.quantity || 0));

    if (items.length === 0) {
      onProgress?.(100, 'Selesai');
      return [];
    }

    onProgress?.(15, `Ditemukan ${items.length} barang stok rendah`);

    // Step 2: Batch fetch ALL supplier history in ONE query (much faster!)
    const partNumbers = items.map(i => i.part_number);
    const partNumberSet = new Set(partNumbers.map((pn) => normalizePartForLookup(pn)));
    
    onProgress?.(20, 'Mengambil data supplier...');
    const allMasukRows = await getEdgeListRowsWithSnapshot<any>(store, 'barang-masuk-log');
    const supplierData = (allMasukRows || []).filter((row: any) => {
      const part = normalizePartForLookup(row?.part_number);
      const customer = String(row?.customer || '').trim();
      if (!part || !partNumberSet.has(part)) return false;
      if (!customer || customer === '-') return false;
      return true;
    });

    onProgress?.(60, 'Memproses data supplier...');

    // Step 3: Group supplier data by part_number
    const supplierByPart: Record<string, typeof supplierData> = {};
    if (supplierData) {
      for (const row of supplierData) {
        const partKey = normalizePartForLookup(row?.part_number);
        if (!partKey) continue;
        if (!supplierByPart[partKey]) {
          supplierByPart[partKey] = [];
        }
        supplierByPart[partKey].push(row);
      }
    }

    onProgress?.(75, 'Menyusun hasil...');

    // Step 4: Build result with supplier history
    const result: LowStockItem[] = [];
    const totalItems = items.length;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const partSupplierData = supplierByPart[normalizePartForLookup(item.part_number)] || [];
      
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
  if (!partNumber) return [];

  try {
    const targetPart = normalizePartForLookup(partNumber);
    const allRows = await getEdgeListRowsWithSnapshot<any>(store, 'barang-masuk-log');
    const data = (allRows || []).filter((row: any) => {
      const part = normalizePartForLookup(row?.part_number);
      const customer = String(row?.customer || '').trim();
      if (!part || part !== targetPart) return false;
      if (!customer || customer === '-') return false;
      return true;
    });

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
  if (!(store === 'mjm' || store === 'bjw') || !partNumber) return [];

  try {
    const targetPart = normalizePartForLookup(partNumber);
    const allRows = await getEdgeListRowsWithSnapshot<any>(store, 'barang-masuk-log');
    const data = (allRows || [])
      .filter((row: any) => {
        const part = normalizePartForLookup(row?.part_number);
        const supplier = String(row?.customer || '').trim();
        if (!part || part !== targetPart) return false;
        if (!supplier || supplier === '-') return false;
        return true;
      })
      .sort((a: any, b: any) =>
        new Date(String(b?.created_at || 0)).getTime() - new Date(String(a?.created_at || 0)).getTime()
      );

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
  if (!(store === 'mjm' || store === 'bjw') || !partNumber) return [];

  try {
    const targetPart = normalizePartForLookup(partNumber);
    const [allMasukRows, allKeluarRows] = await Promise.all([
      getEdgeListRowsWithSnapshot<any>(store, 'barang-masuk-log'),
      getEdgeListRowsWithSnapshot<any>(store, 'sold-items')
    ]);

    const masukData = (allMasukRows || [])
      .filter((row: any) =>
        normalizePartForLookup(row?.part_number) === targetPart &&
        Number(row?.harga_satuan || 0) > 0
      )
      .sort((a: any, b: any) =>
        new Date(String(b?.created_at || 0)).getTime() - new Date(String(a?.created_at || 0)).getTime()
      )
      .slice(0, 20);

    const keluarData = (allKeluarRows || [])
      .filter((row: any) =>
        normalizePartForLookup(row?.part_number) === targetPart &&
        Number(row?.harga_satuan || 0) > 0
      )
      .sort((a: any, b: any) =>
        new Date(String(b?.created_at || 0)).getTime() - new Date(String(a?.created_at || 0)).getTime()
      )
      .slice(0, 20);

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
