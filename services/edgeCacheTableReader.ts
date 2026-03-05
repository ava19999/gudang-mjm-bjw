import { readEdgeListRowsCached, readInventoryRowsCached } from './supabaseService';

type QueryOp =
  | { kind: 'eq'; column: string; value: any }
  | { kind: 'neq'; column: string; value: any }
  | { kind: 'gt'; column: string; value: any }
  | { kind: 'gte'; column: string; value: any }
  | { kind: 'lt'; column: string; value: any }
  | { kind: 'lte'; column: string; value: any }
  | { kind: 'ilike'; column: string; value: string }
  | { kind: 'in'; column: string; values: any[] }
  | { kind: 'is'; column: string; value: any }
  | { kind: 'not'; inner: QueryOp };

interface QueryRecorder {
  ops: QueryOp[];
  orderBy?: string;
  ascending?: boolean;
  limitValue?: number;
  eq: (column: string, value: any) => QueryRecorder;
  neq: (column: string, value: any) => QueryRecorder;
  gt: (column: string, value: any) => QueryRecorder;
  gte: (column: string, value: any) => QueryRecorder;
  lt: (column: string, value: any) => QueryRecorder;
  lte: (column: string, value: any) => QueryRecorder;
  ilike: (column: string, value: string) => QueryRecorder;
  in: (column: string, values: any[]) => QueryRecorder;
  is: (column: string, value: any) => QueryRecorder;
  not: (column: string, operator: string, value: any) => QueryRecorder;
  order: (column: string, options?: { ascending?: boolean }) => QueryRecorder;
  limit: (value: number) => QueryRecorder;
}

const toComparable = (value: any): number | string => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();

  const text = String(value ?? '').trim();
  if (!text) return '';

  const maybeNumber = Number(text);
  if (Number.isFinite(maybeNumber) && /^-?\d+(\.\d+)?$/.test(text)) {
    return maybeNumber;
  }

  const maybeDate = Date.parse(text);
  if (Number.isFinite(maybeDate)) {
    return maybeDate;
  }

  return text.toLowerCase();
};

const compareValue = (left: any, right: any): number => {
  const a = toComparable(left);
  const b = toComparable(right);
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b));
};

const valuesEqual = (left: any, right: any): boolean => {
  if (left == null && right == null) return true;
  if (typeof left === 'number' || typeof right === 'number') {
    const l = Number(left);
    const r = Number(right);
    if (Number.isFinite(l) && Number.isFinite(r)) return l === r;
  }
  return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
};

const likeToRegExp = (pattern: string): RegExp => {
  const escaped = String(pattern || '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
};

const evalOp = (row: Record<string, any>, op: QueryOp): boolean => {
  if (op.kind === 'not') {
    return !evalOp(row, op.inner);
  }

  const value = row?.[op.column];
  if (op.kind === 'eq') return valuesEqual(value, op.value);
  if (op.kind === 'neq') return !valuesEqual(value, op.value);
  if (op.kind === 'gt') return compareValue(value, op.value) > 0;
  if (op.kind === 'gte') return compareValue(value, op.value) >= 0;
  if (op.kind === 'lt') return compareValue(value, op.value) < 0;
  if (op.kind === 'lte') return compareValue(value, op.value) <= 0;
  if (op.kind === 'ilike') return likeToRegExp(op.value).test(String(value ?? ''));
  if (op.kind === 'in') return op.values.some((candidate) => valuesEqual(value, candidate));
  if (op.kind === 'is') {
    if (op.value === null) return value === null || value === undefined;
    return valuesEqual(value, op.value);
  }
  return true;
};

const createQueryRecorder = (): QueryRecorder => {
  const self: QueryRecorder = {
    ops: [],
    eq(column, value) {
      self.ops.push({ kind: 'eq', column, value });
      return self;
    },
    neq(column, value) {
      self.ops.push({ kind: 'neq', column, value });
      return self;
    },
    gt(column, value) {
      self.ops.push({ kind: 'gt', column, value });
      return self;
    },
    gte(column, value) {
      self.ops.push({ kind: 'gte', column, value });
      return self;
    },
    lt(column, value) {
      self.ops.push({ kind: 'lt', column, value });
      return self;
    },
    lte(column, value) {
      self.ops.push({ kind: 'lte', column, value });
      return self;
    },
    ilike(column, value) {
      self.ops.push({ kind: 'ilike', column, value: String(value || '') });
      return self;
    },
    in(column, values) {
      self.ops.push({ kind: 'in', column, values: Array.isArray(values) ? values : [] });
      return self;
    },
    is(column, value) {
      self.ops.push({ kind: 'is', column, value });
      return self;
    },
    not(column, operator, value) {
      const op = String(operator || '').toLowerCase();
      if (op === 'ilike') {
        self.ops.push({ kind: 'not', inner: { kind: 'ilike', column, value: String(value || '') } });
      } else if (op === 'eq') {
        self.ops.push({ kind: 'not', inner: { kind: 'eq', column, value } });
      } else if (op === 'is') {
        self.ops.push({ kind: 'not', inner: { kind: 'is', column, value } });
      } else {
        self.ops.push({ kind: 'not', inner: { kind: 'eq', column, value } });
      }
      return self;
    },
    order(column, options) {
      self.orderBy = column;
      self.ascending = options?.ascending ?? true;
      return self;
    },
    limit(value) {
      self.limitValue = Number(value) || 0;
      return self;
    }
  };
  return self;
};

const selectColumnsFromRows = <T,>(rows: any[], selectColumns: string): T[] => {
  const select = String(selectColumns || '*').trim();
  if (!select || select === '*') return rows as T[];

  const columns = select
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(':').pop() || part)
    .map((part) => part.trim());

  if (columns.length === 0) return rows as T[];
  return rows.map((row) => {
    const projected: Record<string, any> = {};
    columns.forEach((column) => {
      projected[column] = row?.[column];
    });
    return projected as T;
  });
};

const normalizeStoreInput = (store: string | null | undefined): 'mjm' | 'bjw' => {
  return String(store || '').toLowerCase() === 'bjw' ? 'bjw' : 'mjm';
};

const inferStoreFromTable = (table: string): 'mjm' | 'bjw' | null => {
  const normalized = String(table || '').toLowerCase();
  if (normalized.endsWith('_bjw')) return 'bjw';
  if (normalized.endsWith('_mjm')) return 'mjm';
  return null;
};

const GLOBAL_CACHE_STORE = 'mjm';

export const readTableRowsCached = async <T,>(
  table: string,
  options?: { store?: string | null }
): Promise<T[]> => {
  const tableName = String(table || '').trim().toLowerCase();
  const inferred = inferStoreFromTable(tableName);
  const store = normalizeStoreInput(options?.store || inferred || 'mjm');

  if (tableName === 'base_mjm') return (await readInventoryRowsCached('mjm')) as T[];
  if (tableName === 'base_bjw') return (await readInventoryRowsCached('bjw')) as T[];

  if (tableName === 'barang_masuk_mjm') return (await readEdgeListRowsCached('mjm', 'barang-masuk-log')) as T[];
  if (tableName === 'barang_masuk_bjw') return (await readEdgeListRowsCached('bjw', 'barang-masuk-log')) as T[];
  if (tableName === 'barang_keluar_mjm') return (await readEdgeListRowsCached('mjm', 'barang-keluar-log')) as T[];
  if (tableName === 'barang_keluar_bjw') return (await readEdgeListRowsCached('bjw', 'barang-keluar-log')) as T[];
  if (tableName === 'orders_mjm') return (await readEdgeListRowsCached('mjm', 'offline-orders')) as T[];
  if (tableName === 'orders_bjw') return (await readEdgeListRowsCached('bjw', 'offline-orders')) as T[];
  if (tableName === 'retur_mjm') return (await readEdgeListRowsCached('mjm', 'retur-items')) as T[];
  if (tableName === 'retur_bjw') return (await readEdgeListRowsCached('bjw', 'retur-items')) as T[];
  if (tableName === 'petty_cash_mjm') return (await readEdgeListRowsCached('mjm', 'petty-cash')) as T[];
  if (tableName === 'petty_cash_bjw') return (await readEdgeListRowsCached('bjw', 'petty-cash')) as T[];
  if (tableName === 'kirim_barang') return (await readEdgeListRowsCached(store, 'kirim-barang')) as T[];
  if (tableName === 'kilat_prestock_mjm') return (await readEdgeListRowsCached('mjm', 'kilat-prestock')) as T[];
  if (tableName === 'kilat_prestock_bjw') return (await readEdgeListRowsCached('bjw', 'kilat-prestock')) as T[];
  if (tableName === 'kilat_penjualan_mjm') return (await readEdgeListRowsCached('mjm', 'kilat-penjualan')) as T[];
  if (tableName === 'kilat_penjualan_bjw') return (await readEdgeListRowsCached('bjw', 'kilat-penjualan')) as T[];
  if (tableName === 'scan_resi_mjm') return (await readEdgeListRowsCached('mjm', 'scan-resi')) as T[];
  if (tableName === 'scan_resi_bjw') return (await readEdgeListRowsCached('bjw', 'scan-resi')) as T[];
  if (tableName === 'resi_items_mjm') return (await readEdgeListRowsCached('mjm', 'resi-items')) as T[];
  if (tableName === 'resi_items_bjw') return (await readEdgeListRowsCached('bjw', 'resi-items')) as T[];
  if (tableName === 'data_agung_online_mjm') return (await readEdgeListRowsCached('mjm', 'data-agung-online')) as T[];
  if (tableName === 'data_agung_online_bjw') return (await readEdgeListRowsCached('bjw', 'data-agung-online')) as T[];
  if (tableName === 'data_agung_kosong_mjm') return (await readEdgeListRowsCached('mjm', 'data-agung-kosong')) as T[];
  if (tableName === 'data_agung_kosong_bjw') return (await readEdgeListRowsCached('bjw', 'data-agung-kosong')) as T[];
  if (tableName === 'data_agung_masuk_mjm') return (await readEdgeListRowsCached('mjm', 'data-agung-masuk')) as T[];
  if (tableName === 'data_agung_masuk_bjw') return (await readEdgeListRowsCached('bjw', 'data-agung-masuk')) as T[];

  if (tableName === 'importir_pembayaran') return (await readEdgeListRowsCached(GLOBAL_CACHE_STORE, 'importir-pembayaran')) as T[];
  if (tableName === 'importir_tagihan') return (await readEdgeListRowsCached(GLOBAL_CACHE_STORE, 'importir-tagihan')) as T[];
  if (tableName === 'toko_pembayaran') return (await readEdgeListRowsCached(GLOBAL_CACHE_STORE, 'toko-pembayaran')) as T[];
  if (tableName === 'toko_tagihan') return (await readEdgeListRowsCached(GLOBAL_CACHE_STORE, 'toko-tagihan')) as T[];
  if (tableName === 'inv_tagihan') return (await readEdgeListRowsCached(GLOBAL_CACHE_STORE, 'inv-tagihan')) as T[];

  if (tableName === 'order_supplier') return (await readEdgeListRowsCached(store, 'order-supplier')) as T[];
  if (tableName === 'supplier_orders') return (await readEdgeListRowsCached(store, 'supplier-orders')) as T[];
  if (tableName === 'supplier_order_items') {
    return (await readEdgeListRowsCached(GLOBAL_CACHE_STORE, 'supplier-order-items')) as T[];
  }

  throw new Error(`Tabel ${table} belum terdaftar di readTableRowsCached`);
};

export const fetchCachedRowsPaged = async <T,>(
  table: string,
  selectColumns: string,
  buildQuery: (query: any) => any,
  options?: { orderBy?: string; ascending?: boolean; pageSize?: number; store?: string | null }
): Promise<T[]> => {
  const baseRows = await readTableRowsCached<any>(table, { store: options?.store });
  const recorder = createQueryRecorder();
  try {
    const result = buildQuery(recorder as any);
    if (result && typeof result === 'object' && 'orderBy' in result) {
      const maybe = result as QueryRecorder;
      if (maybe.orderBy) {
        recorder.orderBy = maybe.orderBy;
        recorder.ascending = maybe.ascending;
      }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`[edge-cache] buildQuery lokal gagal untuk ${table}:`, error);
    }
  }

  let rows = baseRows.filter((row) => recorder.ops.every((op) => evalOp(row || {}, op)));
  const orderBy = options?.orderBy || recorder.orderBy;
  const ascending = options?.ascending ?? recorder.ascending ?? true;

  if (orderBy) {
    rows = [...rows].sort((a, b) => {
      const compared = compareValue((a as any)?.[orderBy], (b as any)?.[orderBy]);
      return ascending ? compared : -compared;
    });
  }

  if (recorder.limitValue && recorder.limitValue > 0) {
    rows = rows.slice(0, recorder.limitValue);
  }

  return selectColumnsFromRows<T>(rows, selectColumns);
};
