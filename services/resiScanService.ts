// FILE: services/resiScanService.ts
import { supabase } from './supabaseClient';
import { ResiScanStage, ResiItem, ResellerMaster, ParsedCSVItem } from '../types';
// [UBAH] Import helper timezone
import { getWIBDate } from '../utils/timezone';
import { fetchCachedRowsPaged } from './edgeCacheTableReader';
import {
  markEdgeListDatasetsDirty,
  markGlobalEdgeListDatasetsDirty,
  markInventoryCacheDirty,
  readEdgeListRowsCached,
  readInventoryRowsCached
} from './supabaseService';

// ============================================================================
// HELPER: Table Name Selector
// ============================================================================
const getTableName = (store: string | null) => 
  store === 'mjm' ? 'scan_resi_mjm' : 'scan_resi_bjw';

const getBarangKeluarTable = (store: string | null) => 
  store === 'mjm' ? 'barang_keluar_mjm' : 'barang_keluar_bjw';

const getStockTable = (store: string | null) => 
  store === 'mjm' ? 'base_mjm' : 'base_bjw';

const SCAN_RESI_DATASET = 'scan-resi' as const;
const RESI_ITEMS_DATASET = 'resi-items' as const;
const SOLD_ITEMS_DATASET = 'sold-items' as const;

const markScanResiDirty = (store: string | null) => {
  markEdgeListDatasetsDirty(store, [SCAN_RESI_DATASET]);
};

const markResiItemsDirty = (store: string | null) => {
  markEdgeListDatasetsDirty(store, [RESI_ITEMS_DATASET]);
};

const markSoldItemsDirty = (store: string | null) => {
  markEdgeListDatasetsDirty(store, [SOLD_ITEMS_DATASET, 'barang-keluar-log']);
};

const normalizeResiKey = (value: string | null | undefined): string =>
  String(value || '').trim().toUpperCase();

const normalizePartKey = (value: string | null | undefined): string =>
  normalizeResiKey(value).replace(/\s+/g, ' ');

const buildScanKeyVariants = (value: string | null | undefined): string[] => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return [];
  return [...new Set([trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()])];
};

// Helper: Konversi Database (String) ke App (Boolean)
const mapToBoolean = (data: any[]) => {
  return data.map(item => ({
    ...item,
    stage1_scanned: String(item.stage1_scanned) === 'true',
    stage2_verified: String(item.stage2_verified) === 'true',
    is_split: String(item.is_split) === 'true'
  }));
};

const splitIntoChunks = <T,>(items: T[], chunkSize: number): T[][] => {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
};

const fetchAllRowsPaged = async <T,>(
  table: string,
  selectColumns: string,
  buildQuery: (query: any) => any,
  options?: { orderBy?: string; ascending?: boolean; pageSize?: number }
): Promise<T[]> => {
  return fetchCachedRowsPaged<T>(table, selectColumns, buildQuery, options);
};

const fetchRowsByInChunksPaged = async <T,>(
  table: string,
  selectColumns: string,
  column: string,
  values: Array<string | number>,
  buildQuery?: (query: any) => any,
  options?: { orderBy?: string; ascending?: boolean; pageSize?: number; inChunkSize?: number }
): Promise<T[]> => {
  const uniqueValues = [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
  if (uniqueValues.length === 0) return [];

  const inChunkSize = options?.inChunkSize ?? 300;
  const chunks = splitIntoChunks(uniqueValues, inChunkSize);
  const rows: T[] = [];

  for (const chunk of chunks) {
    const chunkRows = await fetchAllRowsPaged<T>(
      table,
      selectColumns,
      (query) => {
        let next = query.in(column, chunk);
        if (buildQuery) next = buildQuery(next);
        return next;
      },
      { orderBy: options?.orderBy, ascending: options?.ascending, pageSize: options?.pageSize }
    );
    rows.push(...chunkRows);
  }

  return rows;
};

const updateRowsByIdsInChunks = async (
  table: string,
  ids: Array<string | number>,
  patch: Record<string, any>
): Promise<void> => {
  const chunks = splitIntoChunks(ids.filter(Boolean), 500);
  for (const chunk of chunks) {
    const { error } = await supabase
      .from(table)
      .update(patch)
      .in('id', chunk as any[]);

    if (error) throw error;
  }

  if (table === 'scan_resi_mjm') {
    markScanResiDirty('mjm');
  } else if (table === 'scan_resi_bjw') {
    markScanResiDirty('bjw');
  } else if (table === 'resi_items_mjm') {
    markResiItemsDirty('mjm');
  } else if (table === 'resi_items_bjw') {
    markResiItemsDirty('bjw');
  }
};

// ============================================================================
// HELPER: Cek apakah resi/order sudah ada di barang_keluar (sudah terjual/keluar)
// ============================================================================

/**
 * Cek apakah resi atau order_id sudah ada di barang_keluar
 * Return Set of resi yang sudah ada (UPPERCASE)
 */
export const checkExistingInBarangKeluar = async (
  resiOrOrders: string[],
  store: string | null
): Promise<Set<string>> => {
  if (!resiOrOrders || resiOrOrders.length === 0) return new Set();
  
  try {
    // Normalize: uppercase dan trim, filter yang kosong
    const normalized = new Set(
      resiOrOrders
        .map(r => (r || '').trim().toUpperCase())
        .filter(r => r !== '' && r !== '-')
    );

    if (normalized.size === 0) return new Set();

    const storesToCheck: Array<'mjm' | 'bjw'> =
      store === 'mjm' || store === 'bjw' ? [store] : ['mjm', 'bjw'];
    const foundSet = new Set<string>();

    for (const s of storesToCheck) {
      const rows = await readEdgeListRowsCached<any>(s, SOLD_ITEMS_DATASET);
      (rows || []).forEach((row: any) => {
        const key = String(row?.resi || '').trim().toUpperCase();
        if (!key) return;
        if (normalized.has(key)) {
          foundSet.add(key);
        }
      });
    }

    console.log(`[checkExistingInBarangKeluar] Checked ${normalized.size} resi, found ${foundSet.size} in barang_keluar`);
    return foundSet;
  } catch (err) {
    console.error('checkExistingInBarangKeluar exception:', err);
    return new Set();
  }
};

// ============================================================================
// STAGE 1: SCANNER GUDANG
// ============================================================================

export const scanResiStage1 = async (
  data: any,
  store: string | null
): Promise<{ success: boolean; message: string; data?: ResiScanStage }> => {
  try {
    const table = getTableName(store);
    
    // CEK DUPLIKAT: Pastikan resi belum pernah di-scan sebelumnya
    const existing = (await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET))
      .filter((row: any) => String(row?.resi || '').trim() === String(data.resi || '').trim())
      .slice(0, 1);
    
    if (existing && existing.length > 0) {
      return { success: false, message: 'Resi sudah pernah di-scan sebelumnya!' };
    }
    
    // CEK BARANG KELUAR: Pastikan resi belum ada di barang_keluar (sudah terjual/keluar)
    const existingInBarangKeluar = await checkExistingInBarangKeluar([data.resi], store);
    if (existingInBarangKeluar.has(data.resi.trim().toUpperCase())) {
      return { success: false, message: 'Resi sudah ada di Barang Keluar (sudah terjual/keluar)!' };
    }
    
    const insertData = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      resi: data.resi,
      no_pesanan: null, // Tidak set default - INSTANT hanya muncul jika no_pesanan di-set dari CSV/Stage2
      ecommerce: data.ecommerce,
      sub_toko: data.sub_toko,
      negara_ekspor: data.negara_ekspor || null,
      // [UBAH] Gunakan getWIBDate()
      tanggal: getWIBDate().toISOString(),
      stage1_scanned: 'true', 
      stage1_scanned_at: getWIBDate().toISOString(),
      stage1_scanned_by: data.scanned_by,
      status: 'stage1'
    };
    
    const { data: inserted, error } = await supabase
      .from(table)
      .insert([insertData])
      .select()
      .single();
    
    if (error) throw error;
    markScanResiDirty(store);
    
    return { 
      success: true, 
      message: 'Resi berhasil di-scan!', 
      data: { ...inserted, stage1_scanned: true } 
    };
  } catch (error: any) {
    console.error('Error scanning stage 1:', error);
    return { success: false, message: error.message || 'Gagal scan resi' };
  }
};

// Bulk scan Stage 1
export const scanResiStage1Bulk = async (
  items: Array<{
    resi: string;
    ecommerce: string;
    sub_toko: string;
    negara_ekspor?: string;
    scanned_by: string;
  }>,
  store: string | null
): Promise<{ success: boolean; message: string; count?: number; duplicates?: string[]; alreadySold?: string[] }> => {
  try {
    const table = getTableName(store);
    
    // CEK DUPLIKAT: Ambil resi yang sudah ada di database scan_resi
    const resiList = items.map(i => i.resi);
    const resiLookup = new Set(resiList.map((r) => String(r || '').trim().toUpperCase()).filter(Boolean));
    const existingResi = (await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET))
      .filter((row: any) => resiLookup.has(String(row?.resi || '').trim().toUpperCase()))
      .map((row: any) => ({ resi: row.resi }));
    
    const existingSet = new Set((existingResi || []).map((r: any) => String(r.resi || '').trim().toUpperCase()));
    
    // CEK BARANG KELUAR: Resi yang sudah ada di barang_keluar (sudah terjual/keluar)
    const existingInBarangKeluar = await checkExistingInBarangKeluar(resiList, store);
    
    const duplicates = items
      .filter(i => existingSet.has(String(i.resi || '').trim().toUpperCase()))
      .map(i => i.resi);
    const alreadySold = items
      .filter(i => existingInBarangKeluar.has(i.resi.trim().toUpperCase()))
      .map(i => i.resi);
    
    // Filter: bukan duplikat DAN bukan sudah terjual
    const newItems = items.filter(i => {
      const resiUpper = i.resi.trim().toUpperCase();
      return !existingSet.has(resiUpper) && !existingInBarangKeluar.has(resiUpper);
    });
    
    if (newItems.length === 0) {
      let errorMsg = '';
      if (alreadySold.length > 0 && duplicates.length > 0) {
        errorMsg = `Semua resi sudah ada! (${duplicates.length} duplikat, ${alreadySold.length} sudah terjual/keluar)`;
      } else if (alreadySold.length > 0) {
        errorMsg = `Semua resi sudah ada di Barang Keluar (sudah terjual/keluar)!`;
      } else {
        errorMsg = 'Semua resi sudah pernah di-scan sebelumnya!';
      }
      return { 
        success: false, 
        message: errorMsg, 
        duplicates,
        alreadySold
      };
    }
    
    const insertData = newItems.map(item => ({
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      resi: item.resi,
      no_pesanan: null, // Tidak set default - INSTANT hanya muncul jika no_pesanan di-set dari CSV/Stage2
      ecommerce: item.ecommerce,
      sub_toko: item.sub_toko,
      negara_ekspor: item.negara_ekspor || null,
      tanggal: getWIBDate().toISOString(),
      stage1_scanned: 'true',
      stage1_scanned_at: getWIBDate().toISOString(),
      stage1_scanned_by: item.scanned_by,
      status: 'stage1'
    }));

    const { error } = await supabase.from(table).insert(insertData);
    if (error) throw error;
    markScanResiDirty(store);

    let msg = `${newItems.length} resi berhasil di-scan!`;
    if (duplicates.length > 0 || alreadySold.length > 0) {
      const parts: string[] = [];
      if (duplicates.length > 0) parts.push(`${duplicates.length} duplikat`);
      if (alreadySold.length > 0) parts.push(`${alreadySold.length} sudah terjual/keluar`);
      msg += ` (${parts.join(', ')} di-skip)`;
    }
    
    return { success: true, message: msg, count: newItems.length, duplicates, alreadySold };
  } catch (error: any) {
    console.error('Error bulk scan stage 1:', error);
    return { success: false, message: error.message || 'Gagal bulk scan resi' };
  }
};

export const getResiStage1List = async (store: string | null) => {
  // Samakan sumber data Stage 1 dengan Stage 3:
  // hanya tampilkan resi yang masih pending (belum completed/sudah terjual).
  return getAllPendingStage1Resi(store);
};

// Ambil semua resi Stage 1 yang belum completed (untuk Stage 3)
export const getAllPendingStage1Resi = async (store: string | null) => {
  let data: any[] = [];
  try {
    const rows = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);
    data = (rows || [])
      .filter((row: any) =>
        String(row?.stage1_scanned || '').toLowerCase() === 'true'
        && String(row?.status || '').toLowerCase() !== 'completed'
      )
      .sort((a: any, b: any) => String(b?.stage1_scanned_at || '').localeCompare(String(a?.stage1_scanned_at || '')));
  } catch (error) {
    console.error('getAllPendingStage1Resi error:', error);
    return [];
  }
  
  const mappedData = mapToBoolean(data || []);
  if (mappedData.length === 0) return [];
  
  // ===== FILTER: Buang resi yang sudah ada di barang_keluar (sudah terjual) =====
  const allResis = mappedData.map((d: any) => d.resi).filter(Boolean);
  const allNoPesanan = mappedData.map((d: any) => d.no_pesanan).filter(Boolean);
  const allToCheck = [...new Set([...allResis, ...allNoPesanan])];
  
  const existingInBarangKeluar = await checkExistingInBarangKeluar(allToCheck, store);
  
  // Jika ada resi yang sudah terjual, update status menjadi 'completed'
  const soldResiIds: string[] = [];
  const filteredData = mappedData.filter((item: any) => {
    const resiUpper = (item.resi || '').trim().toUpperCase();
    const noPesananUpper = (item.no_pesanan || '').trim().toUpperCase();
    
    if (existingInBarangKeluar.has(resiUpper) || existingInBarangKeluar.has(noPesananUpper)) {
      soldResiIds.push(item.id);
      return false; // Exclude dari hasil
    }
    return true;
  });
  
  // Update status resi yang sudah terjual ke 'completed' - AWAIT agar selesai
  if (soldResiIds.length > 0) {
    console.log(`[getAllPendingStage1Resi] Auto-marking ${soldResiIds.length} resi as completed (already in barang_keluar):`, soldResiIds);
    try {
      const table = getTableName(store);
      await updateRowsByIdsInChunks(table, soldResiIds, { status: 'completed' });
      markScanResiDirty(store);
      console.log(`[getAllPendingStage1Resi] Successfully marked ${soldResiIds.length} resi as completed`);
    } catch (updateErr) {
      console.error('Error auto-updating sold resi status:', updateErr);
    }
  }
  
  return filteredData;
};

export const deleteResiStage1 = async (id: string, store: string | null) => {
  const table = getTableName(store);
  const rows = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);
  const data = (rows || []).find((row: any) => String(row?.id || '') === String(id));
  
  if (data?.stage2_verified === 'true') {
    return { success: false, message: 'Tidak bisa dihapus, sudah masuk Stage 2!' };
  }

  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { success: false, message: error.message };
  markScanResiDirty(store);
  return { success: true, message: 'Resi dihapus.' };
};

// Delete resi - bisa menghapus Stage 1, Stage 2, atau Stage 3
export const deleteResi = async (id: string, store: string | null) => {
  const table = getTableName(store);
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { success: false, message: error.message };
  markScanResiDirty(store);
  return { success: true, message: 'Resi berhasil dihapus.' };
};

// Restore resi - mengembalikan resi yang dihapus
export const restoreResi = async (resiData: ResiScanStage, store: string | null) => {
  const table = getTableName(store);
  
  // Convert boolean back to string for database
  const insertData = {
    ...resiData,
    stage1_scanned: resiData.stage1_scanned ? 'true' : 'false',
    stage2_verified: resiData.stage2_verified ? 'true' : 'false'
  };
  
  const { error } = await supabase.from(table).insert([insertData]);
  if (error) return { success: false, message: error.message };
  markScanResiDirty(store);
  return { success: true, message: 'Resi berhasil dikembalikan!' };
};

// Update resi - edit resi, ecommerce, sub_toko, negara_ekspor
export const updateResi = async (
  id: string,
  updates: { resi?: string; ecommerce?: string; sub_toko?: string; negara_ekspor?: string | null },
  store: string | null
) => {
  const table = getTableName(store);
  const { error } = await supabase.from(table).update(updates).eq('id', id);
  if (error) return { success: false, message: error.message };
  markScanResiDirty(store);
  return { success: true, message: 'Resi berhasil diupdate!' };
};

// --- FUNGSI RESELLER ---

export const getResellers = async (): Promise<ResellerMaster[]> => {
  const data = await readEdgeListRowsCached<ResellerMaster>('mjm', 'reseller-master');
  return (data || []).sort((a: any, b: any) =>
    String((a as any)?.nama_reseller || '').localeCompare(String((b as any)?.nama_reseller || ''))
  );
};

export const addReseller = async (nama: string): Promise<{ success: boolean; message: string }> => {
  try {
    const { error } = await supabase
      .from('reseller_master')
      .insert([{ nama_reseller: nama }]);
    if (error) throw error;
    markGlobalEdgeListDatasetsDirty(['reseller-master']);
    return { success: true, message: 'Reseller berhasil ditambahkan' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
};

/**
 * Get unique reseller names from barang_keluar table
 * Mengambil dari field kode_toko dimana ecommerce = 'RESELLER'
 * Ini sama dengan sumber data yang digunakan di menu Reseller (ResellerView)
 */
export const getResellerNamesFromBarangKeluar = async (store: string | null): Promise<string[]> => {
  try {
    const allNames: string[] = [];
    
    const fetchFromStore = async (targetStore: 'mjm' | 'bjw'): Promise<string[]> => {
      const rows = await readEdgeListRowsCached<any>(targetStore, SOLD_ITEMS_DATASET);
      return (rows || [])
        .filter((row: any) =>
          String(row?.ecommerce || '').toUpperCase() === 'RESELLER'
          && String(row?.kode_toko || '').trim() !== ''
        )
        .map((row: any) => row.kode_toko);
    };
    
    // Ambil dari kedua toko untuk daftar reseller yang lengkap
    if (store === 'mjm') {
      const names = await fetchFromStore('mjm');
      allNames.push(...names);
    } else if (store === 'bjw') {
      const names = await fetchFromStore('bjw');
      allNames.push(...names);
    } else {
      // Default: ambil dari kedua tabel
      const [mjmNames, bjwNames] = await Promise.all([
        fetchFromStore('mjm'),
        fetchFromStore('bjw')
      ]);
      allNames.push(...mjmNames, ...bjwNames);
    }

    // Get unique names dan filter yang kosong
    const uniqueNames = [...new Set(
      allNames.filter((name: string) => name && name.trim() !== '')
    )];
    
    console.log('[getResellerNamesFromBarangKeluar] Found reseller names:', uniqueNames.length);
    return uniqueNames.sort();
  } catch (err) {
    console.error('Exception fetching reseller names:', err);
    return [];
  }
};

// ============================================================================
// STAGE 2: PACKING VERIFICATION
// ============================================================================

export const getPendingStage2List = async (store: string | null) => {
  const rows = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);
  const filtered = (rows || [])
    .filter((row: any) =>
      String(row?.stage1_scanned || '').toLowerCase() === 'true'
      && String(row?.stage2_verified || '').toLowerCase() !== 'true'
    )
    .sort((a: any, b: any) => String(b?.stage1_scanned_at || '').localeCompare(String(a?.stage1_scanned_at || '')));
  return mapToBoolean(filtered);
};

export const verifyResiStage2 = async (
  data: { resi: string, verified_by: string },
  store: string | null
): Promise<{ success: boolean; message: string }> => {
  const table = getTableName(store);
  const { resi, verified_by } = data;
  const allRows = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);
  const rows = (allRows || []).filter((row: any) =>
    String(row?.resi || '').trim() === String(resi || '').trim()
    && String(row?.stage1_scanned || '').toLowerCase() === 'true'
    && String(row?.stage2_verified || '').toLowerCase() !== 'true'
  );

  if (!rows || rows.length === 0) {
    const unscan = (allRows || []).filter((row: any) =>
      String(row?.resi || '').trim() === String(resi || '').trim()
    ).slice(0, 1);
    if (!unscan || unscan.length === 0) return { success: false, message: 'Resi belum discan di Stage 1!' };
    return { success: false, message: 'Resi sudah terverifikasi sebelumnya.' };
  }

  const ids = rows.map((r: any) => r.id);
  const { error } = await supabase
    .from(table)
    .update({
      stage2_verified: 'true',
      // [UBAH] Gunakan getWIBDate()
      stage2_verified_at: getWIBDate().toISOString(),
      stage2_verified_by: verified_by,
      status: 'stage2'
    })
    .in('id', ids);

  if (error) return { success: false, message: error.message };
  markScanResiDirty(store);
  return { success: true, message: `${ids.length} item terverifikasi.` };
};

// Bulk verify Stage 2
export const verifyResiStage2Bulk = async (
  resiList: string[],
  verified_by: string,
  store: string | null
): Promise<{ success: boolean; message: string; count?: number; alreadyVerified?: string[] }> => {
  const table = getTableName(store);
  let successCount = 0;
  const alreadyVerified: string[] = [];
  const allRows = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);

  for (const resi of resiList) {
    const rows = (allRows || []).filter((row: any) =>
      String(row?.resi || '').trim() === String(resi || '').trim()
      && String(row?.stage1_scanned || '').toLowerCase() === 'true'
      && String(row?.stage2_verified || '').toLowerCase() !== 'true'
    );

    if (rows && rows.length > 0) {
      const ids = rows.map((r: any) => r.id);
      const { error } = await supabase
        .from(table)
        .update({
          stage2_verified: 'true',
          stage2_verified_at: getWIBDate().toISOString(),
          stage2_verified_by: verified_by,
          status: 'stage2'
        })
        .in('id', ids);

      if (!error) successCount += ids.length;
    } else {
      // Cek apakah resi ada tapi sudah diverifikasi
      const existingResi = (allRows || []).filter((row: any) =>
        String(row?.resi || '').trim() === String(resi || '').trim()
      ).slice(0, 1);
      
      if (existingResi && existingResi.length > 0 && String(existingResi[0].stage2_verified) === 'true') {
        alreadyVerified.push(resi);
      }
    }
  }

  if (successCount === 0) {
    const msg = alreadyVerified.length > 0 
      ? `Tidak ada resi baru. ${alreadyVerified.length} resi sudah diverifikasi sebelumnya.`
      : 'Tidak ada resi yang berhasil diverifikasi.';
    return { success: false, message: msg, alreadyVerified };
  }
  
  const msg = alreadyVerified.length > 0
    ? `${successCount} resi berhasil diverifikasi! (${alreadyVerified.length} sudah ada sebelumnya)`
    : `${successCount} resi berhasil diverifikasi!`;

  if (successCount > 0) {
    markScanResiDirty(store);
  }
  return { success: true, message: msg, count: successCount, alreadyVerified };
};

// ============================================================================
// STAGE 3: DATA ENTRY & FINALISASI
// ============================================================================

export const getResiHistory = async (store: string | null) => {
  const rows = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);
  const data = (rows || [])
    .sort((a: any, b: any) => String(b?.stage1_scanned_at || '').localeCompare(String(a?.stage1_scanned_at || '')))
    .slice(0, 100);
  return mapToBoolean(data);
};

export const getPendingStage3List = async (store: string | null) => {
  try {
    const rows = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);
    const data = (rows || [])
      .filter((row: any) =>
        String(row?.stage2_verified || '').toLowerCase() === 'true'
        && String(row?.status || '').toLowerCase() !== 'completed'
      )
      .sort((a: any, b: any) => String(b?.stage2_verified_at || '').localeCompare(String(a?.stage2_verified_at || '')));
    return mapToBoolean(data);
  } catch (error) {
    console.error('getPendingStage3List error:', error);
    return [];
  }
};

export const checkResiStatus = async (resis: string[], store: string | null) => {
  if (resis.length === 0) return [];
  const lookup = new Set(resis.map((r) => String(r || '').trim().toUpperCase()).filter(Boolean));
  const rows = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);
  return (rows || [])
    .filter((row: any) => lookup.has(String(row?.resi || '').trim().toUpperCase()))
    .map((row: any) => ({
      resi: row.resi,
      stage1_scanned: row.stage1_scanned,
      stage2_verified: row.stage2_verified,
      status: row.status,
      ecommerce: row.ecommerce,
      sub_toko: row.sub_toko,
      no_pesanan: row.no_pesanan
    }));
};

/**
 * Cek status resi dengan matching ke resi ATAU no_pesanan
 * Untuk kasus instant/sameday yang scan pakai no pesanan
 */
export const checkResiOrOrderStatus = async (
  resiOrOrders: string[], 
  store: string | null
): Promise<any[]> => {
  if (resiOrOrders.length === 0) return [];
  
  // Normalize: uppercase dan trim semua nilai
  const normalized = resiOrOrders.map(r => r.trim().toUpperCase());
  
  // Query semua resi dari Stage 1
  try {
    const data = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);
    const stage1Rows = (data || []).filter((row: any) => String(row?.stage1_scanned || '').toLowerCase() === 'true');

    // Filter manual dengan case-insensitive matching
    const filtered = stage1Rows.filter((d: any) => {
      const resiUpper = String(d.resi || '').trim().toUpperCase();
      const noPesananUpper = String(d.no_pesanan || '').trim().toUpperCase();
      return normalized.includes(resiUpper) || normalized.includes(noPesananUpper);
    });
    
    return filtered;
  } catch (error) {
    console.error('checkResiOrOrderStatus error:', error);
    return [];
  }
};

/**
 * Ambil daftar resi yang sudah melewati Stage 1 (untuk dropdown search)
 */
export const getStage1ResiList = async (store: string | null): Promise<Array<{resi: string, no_pesanan?: string, ecommerce: string, sub_toko: string, stage2_verified: boolean}>> => {
  try {
    const rows = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);
    const data = (rows || [])
      .filter((row: any) => String(row?.stage1_scanned || '').toLowerCase() === 'true')
      .sort((a: any, b: any) => String(b?.stage1_scanned_at || '').localeCompare(String(a?.stage1_scanned_at || '')));
    return (data || []).map(d => ({
      resi: d.resi,
      no_pesanan: d.no_pesanan,
      ecommerce: d.ecommerce || '-',
      sub_toko: d.sub_toko || '-',
      stage2_verified: String(d.stage2_verified) === 'true'
    }));
  } catch (error) {
    console.error('getStage1ResiList error:', error);
    return [];
  }
};

export const lookupPartNumberInfo = async (sku: string, store: string | null) => {
  const normalizedSku = normalizePartKey(sku);
  const rows = await readInventoryRowsCached(store);
  const found = (rows || []).find((row: any) => normalizePartKey(row?.part_number) === normalizedSku);
  if (!found) return null;
  return {
    part_number: found.part_number,
    name: found.name,
    brand: found.brand,
    application: found.application,
    quantity: found.quantity
  };
};

export const getBulkPartNumberInfo = async (skus: string[], store: string | null) => {
  if (skus.length === 0) return [];
  
  const uniqueSkus = [...new Set(skus.map((s) => normalizePartKey(s)).filter(Boolean))];
  const lookup = new Set(uniqueSkus);
  const rows = await readInventoryRowsCached(store);
  return (rows || [])
    .filter((row: any) => lookup.has(normalizePartKey(row?.part_number)))
    .map((row: any) => ({
      part_number: row.part_number,
      name: row.name,
      brand: row.brand,
      application: row.application,
      quantity: row.quantity
    }));
};

export const getAvailableParts = async (store: string | null): Promise<{part_number: string, name: string}[]> => {
  try {
    const data = await readInventoryRowsCached(store);
    data.sort((a: any, b: any) => String(a?.part_number || '').localeCompare(String(b?.part_number || '')));
    return data.map(d => ({ part_number: d.part_number, name: d.name || '' }));
  } catch (error) {
    console.error('getAvailableParts error:', error);
    return [];
  }
};

export const fetchPendingCSVItems = async (store: string | null) => {
  if (store !== 'mjm' && store !== 'bjw') return [];
  const table = store === 'mjm' ? 'resi_items_mjm' : 'resi_items_bjw';

  let pendingRows: any[] = [];
  try {
    const allRows = await readEdgeListRowsCached<any>(store, RESI_ITEMS_DATASET);
    pendingRows = (allRows || [])
      .filter((row: any) => String(row?.status || '').toLowerCase() === 'pending')
      .sort((a: any, b: any) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
  } catch (error) {
    console.error('Gagal ambil pending CSV:', error);
    return [];
  }
  
  if (!pendingRows || pendingRows.length === 0) return [];
  
  // ===== SYNC STATUS PER-ITEM (resi + part_number), BUKAN PER-RESI =====
  const allResis = [...new Set(pendingRows.map((d: any) => String(d.resi || '').trim()).filter(Boolean))];
  if (allResis.length === 0) return pendingRows;
  const allResiVariants = [...new Set(allResis.flatMap((resi) => {
    const trimmed = String(resi || '').trim();
    if (!trimmed) return [];
    return [trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()];
  }))];

  // Ambil log barang_keluar untuk resi-resi yang sedang pending
  let soldLogs: any[] = [];
  try {
    const soldRows = await readEdgeListRowsCached<any>(store, SOLD_ITEMS_DATASET);
    const resiLookup = new Set(allResiVariants.map((v) => normalizeResiKey(v)));
    soldLogs = (soldRows || [])
      .filter((row: any) => resiLookup.has(normalizeResiKey(row?.resi)) && row?.part_number)
      .map((row: any) => ({ resi: row.resi, part_number: row.part_number }));
  } catch (error: any) {
    console.warn('[fetchPendingCSVItems] Gagal sync dengan barang_keluar, fallback ke pending murni:', error?.message || error);
    return pendingRows;
  }

  // Hitung jumlah terjual per key (support duplicate key di satu resi)
  const soldCountMap = new Map<string, number>();
  soldLogs.forEach((log: any) => {
    const resiKey = normalizeResiKey(log.resi);
    const partKey = normalizePartKey(log.part_number);
    if (!resiKey || !partKey) return;
    const key = `${resiKey}||${partKey}`;
    soldCountMap.set(key, (soldCountMap.get(key) || 0) + 1);
  });

  // Ambil item processed pada resi yang sama untuk recovery jika dulu salah auto-mark
  let processedRows: any[] = [];
  try {
    const processedLookup = new Set(allResis.map((resi) => normalizeResiKey(resi)));
    const allRows = await readEdgeListRowsCached<any>(store, RESI_ITEMS_DATASET);
    processedRows = (allRows || []).filter((row: any) =>
      String(row?.status || '').toLowerCase() === 'processed'
      && processedLookup.has(normalizeResiKey(row?.resi))
    );
  } catch (error: any) {
    console.warn('[fetchPendingCSVItems] Gagal cek processed rows untuk recovery:', error?.message || error);
  }

  const falseProcessedIds: Array<string | number> = [];
  const recoveredRows: any[] = [];

  // Alokasikan sold count ke processed rows dulu (yang valid tetap processed)
  processedRows.forEach((row: any) => {
    const resiKey = normalizeResiKey(row.resi);
    const partKey = normalizePartKey(row.part_number);
    if (!resiKey || !partKey) return;
    const key = `${resiKey}||${partKey}`;
    const current = soldCountMap.get(key) || 0;
    if (current > 0) {
      soldCountMap.set(key, current - 1);
      return;
    }

    // Tidak ada jejak di barang_keluar => kemungkinan salah auto-mark, kembalikan ke pending
    falseProcessedIds.push(row.id);
    recoveredRows.push({ ...row, status: 'pending' });
  });

  if (falseProcessedIds.length > 0) {
    try {
      await updateRowsByIdsInChunks(table, falseProcessedIds, { status: 'pending' });
      markResiItemsDirty(store);
      console.log(`[fetchPendingCSVItems] Recovered ${falseProcessedIds.length} item salah processed menjadi pending.`);
    } catch (recoverErr) {
      console.error('[fetchPendingCSVItems] Gagal recovery processed->pending:', recoverErr);
    }
  }

  // Sinkron pending -> processed jika memang sudah ada log barang_keluar
  const pendingSoldIds: Array<string | number> = [];
  const filteredPending = pendingRows.filter((row: any) => {
    const resiKey = normalizeResiKey(row.resi);
    const partKey = normalizePartKey(row.part_number);
    if (!resiKey || !partKey) return true;

    const key = `${resiKey}||${partKey}`;
    const current = soldCountMap.get(key) || 0;
    if (current > 0) {
      soldCountMap.set(key, current - 1);
      pendingSoldIds.push(row.id);
      return false;
    }
    return true;
  });

  if (pendingSoldIds.length > 0) {
    try {
      await updateRowsByIdsInChunks(table, pendingSoldIds, { status: 'processed' });
      markResiItemsDirty(store);
      console.log(`[fetchPendingCSVItems] Synced ${pendingSoldIds.length} pending item menjadi processed.`);
    } catch (markErr) {
      console.error('[fetchPendingCSVItems] Gagal sync pending->processed:', markErr);
    }
  }

  // Gabungkan pending asli + row hasil recovery
  const merged = [...filteredPending, ...recoveredRows];
  merged.sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return merged;
};

// Helper: Cek apakah item ada di KILAT prestock (sudah dikirim ke gudang Shopee)
const checkKilatPrestock = async (partNumber: string, qty: number, store: string | null): Promise<{
  isKilat: boolean;
  kilatId?: string;
  qtySisa?: number;
}> => {
  try {
    const normalizedPart = normalizePartKey(partNumber);
    const data = (await readEdgeListRowsCached<any>(store, 'kilat-prestock'))
      .filter((row: any) =>
        normalizePartKey(row?.part_number) === normalizedPart
        && ['MENUNGGU_TERJUAL', 'SEBAGIAN_TERJUAL'].includes(String(row?.status || ''))
      )
      .sort((a: any, b: any) => String(a?.tanggal_kirim || '').localeCompare(String(b?.tanggal_kirim || '')))
      .slice(0, 1);
    
    if (data && data.length > 0) {
      const kilat = data[0];
      const qtySisa = kilat.qty_kirim - kilat.qty_terjual;
      if (qtySisa >= qty) {
        return { isKilat: true, kilatId: kilat.id, qtySisa };
      }
    }
  } catch (err) {
    console.error('checkKilatPrestock error:', err);
  }
  
  return { isKilat: false };
};

// Helper: Update KILAT prestock saat terjual
const updateKilatSold = async (kilatId: string, qtySold: number, saleData: any, store: string | null): Promise<boolean> => {
  const prestockTable = store === 'mjm' ? 'kilat_prestock_mjm' : 'kilat_prestock_bjw';
  const penjualanTable = store === 'mjm' ? 'kilat_penjualan_mjm' : 'kilat_penjualan_bjw';
  
  try {
    // Get current kilat data
    const kilatRows = await readEdgeListRowsCached<any>(store, 'kilat-prestock');
    const kilat = (kilatRows || []).find((row: any) => String(row?.id || '') === String(kilatId));
    
    if (!kilat) return false;
    
    // Update qty_terjual
    const newQtyTerjual = kilat.qty_terjual + qtySold;
    await supabase
      .from(prestockTable)
      .update({ qty_terjual: newQtyTerjual })
      .eq('id', kilatId);
    
    // Insert ke kilat_penjualan
    await supabase.from(penjualanTable).insert([{
      kilat_id: kilatId,
      no_pesanan: saleData.order_id || saleData.no_pesanan,
      resi_penjualan: saleData.resi,
      customer: saleData.customer,
      part_number: saleData.part_number,
      nama_barang: saleData.nama_pesanan,
      qty_jual: qtySold,
      harga_satuan: saleData.harga_satuan || 0,
      harga_jual: saleData.harga_total || 0,
      tanggal_jual: getWIBDate().toISOString(),
      source: 'CSV',
      ecommerce: saleData.ecommerce
    }]);

    markEdgeListDatasetsDirty(store, ['kilat-prestock', 'kilat-penjualan']);
    
    console.log(`[KILAT] Updated prestock ${kilatId}: +${qtySold} sold, total ${newQtyTerjual}`);
    return true;
  } catch (err) {
    console.error('updateKilatSold error:', err);
    return false;
  }
};

export const processBarangKeluarBatch = async (items: any[], store: string | null) => {
  const scanTable = getTableName(store);
  const logTable = getBarangKeluarTable(store);
  const stockTable = getStockTable(store);
  const csvTable = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  
  let successCount = 0;
  let errors: string[] = [];
  const inventoryRows = await readInventoryRowsCached(store);
  const stockByPart = new Map<string, number>();
  const scanRowsCache = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);
  (inventoryRows || []).forEach((row: any) => {
    const part = normalizePartKey(row?.part_number);
    if (!part) return;
    stockByPart.set(part, Number(row?.quantity || 0));
  });

  for (const item of items) {
    try {
      // === KILAT CHECK: Cek apakah item ini ada di KILAT prestock ===
      // Jika ada di prestock, berarti stock sudah dikurangi saat kirim ke gudang Shopee
      // Jadi TIDAK perlu kurangi stock lagi, hanya catat penjualan
      const kilatCheck = await checkKilatPrestock(item.part_number, item.qty_keluar, store);
      
      let newStock = 0;
      let skipStockReduction = false;
      
      if (kilatCheck.isKilat && kilatCheck.kilatId) {
        // Item dari KILAT prestock - stock sudah dikurangi sebelumnya
        console.log(`[KILAT] Item ${item.part_number} matched with prestock ${kilatCheck.kilatId}`);
        skipStockReduction = true;
        
        // Update KILAT prestock
        await updateKilatSold(kilatCheck.kilatId, item.qty_keluar, item, store);
        
        // Ambil stok dari snapshot map untuk logging (tanpa mengurangi)
        newStock = stockByPart.get(normalizePartKey(item.part_number)) || 0;
      } else {
        // Normal flow: Cek & Potong Stok
        const currentStock = stockByPart.get(normalizePartKey(item.part_number));
        const stock = typeof currentStock === 'number' ? { quantity: currentStock } : null;
          
        if (!stock || stock.quantity < item.qty_keluar) {
          errors.push(`Stok ${item.part_number} Habis/Kurang (Sisa: ${stock?.quantity || 0})`);
          continue;
        }

        newStock = stock.quantity - item.qty_keluar;
        const { error: stockErr } = await supabase
          .from(stockTable)
          .update({ quantity: newStock })
          .eq('part_number', item.part_number);

        if (stockErr) {
          errors.push(`Gagal update stok ${item.part_number}: ${stockErr.message}`);
          continue;
        }
        stockByPart.set(normalizePartKey(item.part_number), newStock);
      }

      const normalizedResi = String(item.resi || '').trim();
      const normalizedPart = normalizePartKey(item.part_number);
      const normalizedOrderId = String(item.order_id || item.no_pesanan || '').trim();

      // 2. Simpan Log Barang Keluar
      const logPayload = {
        tanggal: item.tanggal, 
        kode_toko: item.sub_toko, 
        ecommerce: item.ecommerce,
        customer: item.customer,
        resi: normalizedResi,
        part_number: normalizedPart,
        name: item.nama_pesanan,
        brand: item.brand,
        application: item.application,
        qty_keluar: item.qty_keluar,
        harga_satuan: item.harga_satuan,
        harga_total: item.harga_total,
        stock_ahir: newStock,
        tempo: skipStockReduction ? 'KILAT' : 'LUNAS', // Mark as KILAT if from prestock
        // [UBAH] Tambahkan created_at dengan getWIBDate()
        created_at: getWIBDate().toISOString()
      };
      
      const { error: logErr } = await supabase.from(logTable).insert([logPayload]);
      if (logErr) {
        errors.push(`Gagal simpan log ${item.resi}: ${logErr.message}`);
        continue;
      }

      // 3. Update Status di Tabel SCAN RESI
      const resiVariants = buildScanKeyVariants(normalizedResi);
      const orderVariants = buildScanKeyVariants(normalizedOrderId);

      const matchedIds = new Set<any>();
      const resiVariantKeys = new Set(resiVariants.map((v) => normalizeResiKey(v)));
      const orderVariantKeys = new Set(orderVariants.map((v) => normalizeResiKey(v)));

      (scanRowsCache || []).forEach((r: any) => {
        if (String(r?.status || '').toLowerCase() === 'completed') return;
        const resiKey = normalizeResiKey(r?.resi);
        const orderKey = normalizeResiKey(r?.no_pesanan);
        if (
          (resiVariantKeys.size > 0 && (resiVariantKeys.has(resiKey) || resiVariantKeys.has(orderKey))) ||
          (orderVariantKeys.size > 0 && (orderVariantKeys.has(resiKey) || orderVariantKeys.has(orderKey)))
        ) {
          matchedIds.add(r.id);
        }
      });

      if (matchedIds.size > 0) {
        const updateData: any = {
            status: 'completed',
            part_number: normalizedPart,
            barang: item.nama_pesanan,
            qty_out: item.qty_keluar,
            total_harga: item.harga_total,
            customer: item.customer
        };
        const numOrder = Number(item.order_id);
        if (!isNaN(numOrder) && item.order_id) {
            updateData.no_pesanan = numOrder;
        }
        await supabase
          .from(scanTable)
          .update(updateData)
          .in('id', Array.from(matchedIds) as any[]);

        (scanRowsCache || []).forEach((row: any) => {
          if (matchedIds.has(row?.id)) {
            row.status = 'completed';
          }
        });
      }

      // 4. Update Status di Tabel CSV
      if (csvTable) {
         await supabase
           .from(csvTable)
           .update({ status: 'processed' })
           .eq('resi', normalizedResi)
           .eq('part_number', normalizedPart);
      }

      successCount++;
    } catch (e: any) {
      errors.push(`Error sistem pada ${item.resi}: ${e.message}`);
    }
  }

  if (successCount > 0) {
    markInventoryCacheDirty(store);
    markScanResiDirty(store);
    markResiItemsDirty(store);
    markSoldItemsDirty(store);
    markEdgeListDatasetsDirty(store, ['kilat-prestock', 'kilat-penjualan']);
  }
  return { success: errors.length === 0, processed: successCount, errors };
};

export const saveCSVToResiItems = async (
  items: ParsedCSVItem[], 
  store: string | null,
  overrideEcommerceToko: boolean = false
): Promise<{ success: boolean; message: string; count: number; skippedCount: number; skippedResis: string[]; updatedCount: number; skippedItems: any[]; updatedItems: any[] }> => {
  const tableName = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  
  if (!tableName) return { success: false, message: 'Toko tidak valid', count: 0, skippedCount: 0, skippedResis: [], updatedCount: 0, skippedItems: [], updatedItems: [] };
  if (!items || items.length === 0) return { success: false, message: 'Tidak ada data untuk disimpan', count: 0, skippedCount: 0, skippedResis: [], updatedCount: 0, skippedItems: [], updatedItems: [] };

  try {
    // Kumpulkan semua resi dan order_id untuk dicek
    const allResis = items.map(i => i.resi).filter(Boolean);
    const allOrderIds = items.map(i => i.order_id).filter(Boolean);
    const allToCheck = [...new Set([...allResis, ...allOrderIds])];
    
    // === CEK STAGE 1: Resi harus sudah di-scan di Stage 1 ===
    const scanTable = store === 'mjm' ? 'scan_resi_mjm' : (store === 'bjw' ? 'scan_resi_bjw' : null);
    const scannedResiSet = new Set<string>();
    
    if (scanTable) {
      const normalizedCheck = new Set(allToCheck.map((v) => String(v || '').trim().toUpperCase()).filter(Boolean));
      const scanRows = await readEdgeListRowsCached<any>(store, SCAN_RESI_DATASET);
      const scannedData = (scanRows || []).filter((row: any) => {
        const resi = String(row?.resi || '').trim().toUpperCase();
        const orderId = String(row?.no_pesanan || '').trim().toUpperCase();
        return normalizedCheck.has(resi) || normalizedCheck.has(orderId);
      });
      const scannedByOrder = scannedData;
      
      // Kumpulkan semua resi yang sudah di-scan (uppercase untuk matching)
      (scannedData || []).forEach((s: any) => {
        if (s.resi) scannedResiSet.add(String(s.resi).trim().toUpperCase());
        if (s.no_pesanan) scannedResiSet.add(String(s.no_pesanan).trim().toUpperCase());
      });
      (scannedByOrder || []).forEach((s: any) => {
        if (s.resi) scannedResiSet.add(String(s.resi).trim().toUpperCase());
        if (s.no_pesanan) scannedResiSet.add(String(s.no_pesanan).trim().toUpperCase());
      });
    }
    
    // Cek apakah sudah ada di barang_keluar (sudah terjual/keluar)
    const existingInBarangKeluar = await checkExistingInBarangKeluar(allToCheck, store);
    
    // Filter items: harus sudah di-scan Stage 1 DAN tidak ada di barang_keluar
    const skippedItems: ParsedCSVItem[] = [];
    const validItems = items.filter(item => {
      const resiUpper = (item.resi || '').trim().toUpperCase();
      const orderIdUpper = (item.order_id || '').trim().toUpperCase();
      
      // Cek apakah resi sudah di-scan di Stage 1
      const isScannedStage1 = scannedResiSet.has(resiUpper) || scannedResiSet.has(orderIdUpper);
      
      // Skip jika belum di-scan Stage 1
      if (!isScannedStage1) {
        skippedItems.push({ ...item, skipReason: 'Resi belum di-scan di Stage 1' });
        return false;
      }
      
      // Jika resi atau order_id ada di barang_keluar, skip
      if (existingInBarangKeluar.has(resiUpper) || existingInBarangKeluar.has(orderIdUpper)) {
        skippedItems.push({ ...item, skipReason: 'Sudah ada di Barang Keluar' });
        return false;
      }
      return true;
    });
    
    const skippedResis = [...new Set(skippedItems.map(i => i.resi))];
    
    // Generate skipped items result with proper reason
    const skippedItemsResult = skippedItems.map(item => ({
      resi: item.resi,
      order_id: item.order_id,
      customer: item.customer,
      product_name: item.product_name,
      reason: (item as any).skipReason || 'Unknown'
    }));
    
    if (validItems.length === 0) {
      // Count berapa yang skip karena Stage 1 vs Barang Keluar
      const stage1Count = skippedItems.filter(i => (i as any).skipReason?.includes('Stage 1')).length;
      const barangKeluarCount = skippedItems.filter(i => (i as any).skipReason?.includes('Barang Keluar')).length;
      
      let message = `Semua ${items.length} resi di-skip. `;
      if (stage1Count > 0) message += `${stage1Count} belum di-scan Stage 1. `;
      if (barangKeluarCount > 0) message += `${barangKeluarCount} sudah di Barang Keluar.`;
      
      return { 
        success: false, 
        message, 
        count: 0, 
        skippedCount: skippedItems.length,
        skippedResis,
        updatedCount: 0,
        skippedItems: skippedItemsResult,
        updatedItems: []
      };
    }

    const resiList = [...new Set(validItems.map(i => i.resi))];
    
    let updatedCount = 0;
    const updatedItems: any[] = [];
    const itemsToInsert: ParsedCSVItem[] = [];
    
    // === JIKA OVERRIDE AKTIF: Update data existing terlebih dahulu ===
    if (overrideEcommerceToko) {
      // Cek mana resi yang sudah ada di database
      const resiLookup = new Set(resiList.map((r) => String(r || '').trim().toUpperCase()).filter(Boolean));
      const existingRows = (await readEdgeListRowsCached<any>(store, RESI_ITEMS_DATASET))
        .filter((row: any) => resiLookup.has(String(row?.resi || '').trim().toUpperCase()))
        .map((row: any) => ({
          id: row.id,
          resi: row.resi,
          ecommerce: row.ecommerce,
          toko: row.toko
        }));
      
      const existingResiSet = new Set((existingRows || []).map((r: any) => String(r.resi).trim().toUpperCase()));
      const existingResiIdMap = new Map((existingRows || []).map((r: any) => [String(r.resi).trim().toUpperCase(), r]));
      
      for (const item of validItems) {
        const resiUpper = String(item.resi || '').trim().toUpperCase();
        
        if (existingResiSet.has(resiUpper)) {
          // UPDATE existing row
          const existingRow = existingResiIdMap.get(resiUpper);
          if (existingRow) {
            const fixedToko = (item as any).sub_toko || store?.toUpperCase();
            const { error: updateError } = await supabase
              .from(tableName)
              .update({
                ecommerce: item.ecommerce,
                toko: fixedToko,
                order_id: item.order_id,
                status_pesanan: item.order_status,
                opsi_pengiriman: item.shipping_option,
                nama_produk: item.product_name,
                jumlah: item.quantity,
                total_harga_produk: item.total_price,
                customer: item.customer,
              })
              .eq('id', existingRow.id);
            
            if (!updateError) {
              updatedCount++;
              updatedItems.push({
                resi: item.resi,
                old_ecommerce: existingRow.ecommerce,
                new_ecommerce: item.ecommerce,
                old_toko: existingRow.toko,
                new_toko: fixedToko
              });
            }
          }
        } else {
          // Item belum ada, akan di-insert
          itemsToInsert.push(item);
        }
      }
    } else {
      // Mode normal: hapus yang pending dan insert baru semua
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .in('resi', resiList)
        .eq('status', 'pending');

      if (deleteError) {
        console.warn("Warning hapus data lama:", deleteError.message);
      }
      
      // Semua item akan di-insert
      itemsToInsert.push(...validItems);
    }

    const payload = itemsToInsert.map(item => {
      const fixedToko = (item as any).sub_toko || store?.toUpperCase();
      
      return {
        order_id: item.order_id,
        status_pesanan: item.order_status,
        resi: item.resi,
        opsi_pengiriman: item.shipping_option,
        part_number: item.part_number,
        nama_produk: item.product_name,
        jumlah: item.quantity,
        total_harga_produk: item.total_price,
        customer: item.customer,
        ecommerce: item.ecommerce, 
        toko: fixedToko,           
        status: 'pending',
        // [UBAH] Gunakan getWIBDate()
        created_at: getWIBDate().toISOString()
      };
    });

    // Hanya insert jika ada item baru
    if (payload.length > 0) {
      const { error } = await supabase
        .from(tableName)
        .insert(payload); 

      if (error) {
        console.error('Error saving CSV to DB:', error);
        throw error;
      }
    }

    // Generate skip message yang lebih detail
    let skippedMsg = '';
    if (skippedResis.length > 0) {
      const stage1Count = skippedItems.filter(i => (i as any).skipReason?.includes('Stage 1')).length;
      const barangKeluarCount = skippedItems.filter(i => (i as any).skipReason?.includes('Barang Keluar')).length;
      
      const parts: string[] = [];
      if (stage1Count > 0) parts.push(`${stage1Count} belum scan Stage 1`);
      if (barangKeluarCount > 0) parts.push(`${barangKeluarCount} di Barang Keluar`);
      
      skippedMsg = parts.length > 0 ? ` (Skip: ${parts.join(', ')})` : '';
    }
    
    const updateMsg = updatedCount > 0 ? ` (${updatedCount} diupdate)` : '';
    if (payload.length > 0 || updatedCount > 0) {
      markResiItemsDirty(store);
    }

    return { 
      success: true, 
      message: `Data CSV berhasil disimpan ke database${skippedMsg}${updateMsg}`, 
      count: payload.length,
      skippedCount: skippedItems.length,
      skippedResis,
      updatedCount,
      skippedItems: skippedItemsResult,
      updatedItems
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menyimpan data CSV', count: 0, skippedCount: 0, skippedResis: [], updatedCount: 0, skippedItems: [], updatedItems: [] };
  }
};

export const updateResiItem = async (
  store: string | null,
  id: string | number,
  payload: any
) => {
  const table = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  if (!table) return { success: false, message: 'Toko tidak valid' };

  try {
    const { error } = await supabase
      .from(table)
      .update(payload)
      .eq('id', id);

    if (error) throw error;
    markResiItemsDirty(store);
    return { success: true, message: 'Updated' };
  } catch (err: any) {
    console.error('Update gagal:', err);
    return { success: false, message: err.message };
  }
};

// ============================================================================
// [BARU] FUNGSI INSERT SATU ITEM (Untuk Split / Item Baru Manual)
// ============================================================================
export const insertResiItem = async (
  store: string | null,
  payload: any
): Promise<string | null> => {
  const table = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  if (!table) return null;

  try {
    const { data, error } = await supabase
      .from(table)
      .insert([payload])
      .select('id')
      .single();

    if (error) throw error;
    markResiItemsDirty(store);
    return data?.id || null;
  } catch (err: any) {
    console.error('Insert gagal:', err);
    return null;
  }
};

// ============================================================================
// [BARU] BATCH UPDATE - Update banyak item sekaligus untuk performa lebih baik
// ============================================================================
export const batchUpdateResiItems = async (
  store: string | null,
  items: Array<{ id: string; payload: any }>
): Promise<{ success: boolean; updatedCount: number; errorCount: number }> => {
  const table = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  if (!table) return { success: false, updatedCount: 0, errorCount: items.length };

  let updatedCount = 0;
  let errorCount = 0;

  // Supabase tidak support true batch update, tapi kita bisa gunakan Promise.all
  // untuk menjalankan semua update secara parallel
  const updatePromises = items.map(async (item) => {
    try {
      const { error } = await supabase
        .from(table)
        .update(item.payload)
        .eq('id', item.id);

      if (error) {
        console.error(`Batch update error for ${item.id}:`, error);
        errorCount++;
        return false;
      }
      updatedCount++;
      return true;
    } catch (err) {
      console.error(`Batch update exception for ${item.id}:`, err);
      errorCount++;
      return false;
    }
  });

  // Jalankan semua update secara parallel (max 50 concurrent untuk menghindari rate limit)
  const batchSize = 50;
  for (let i = 0; i < updatePromises.length; i += batchSize) {
    const batch = updatePromises.slice(i, i + batchSize);
    await Promise.all(batch);
  }

  if (updatedCount > 0) {
    markResiItemsDirty(store);
  }

  return { success: errorCount === 0, updatedCount, errorCount };
};

// ============================================================================
// [BARU] FUNGSI UNTUK PRODUCT ALIAS
// ============================================================================

/**
 * Insert alias ke product_alias jika belum ada
 * Skip jika alias_name sudah ada untuk part_number tersebut
 */
export const insertProductAlias = async (
  partNumber: string,
  aliasName: string
): Promise<{ success: boolean }> => {
  if (!partNumber || !aliasName) return { success: false };

  try {
    // Cek apakah alias sudah ada untuk part_number ini
    const { data: existing } = await supabase
      .from('product_alias')
      .select('id')
      .eq('part_number', partNumber)
      .eq('alias_name', aliasName)
      .maybeSingle();

    if (existing) {
      // Alias sudah ada, skip
      return { success: true };
    }

    // Insert alias baru
    const { error } = await supabase
      .from('product_alias')
      .insert([{ part_number: partNumber, alias_name: aliasName }]);

    if (error) {
      console.warn('Insert alias gagal:', error.message);
      return { success: false };
    }

    markGlobalEdgeListDatasetsDirty(['product-alias']);
    return { success: true };
  } catch (err: any) {
    console.error('Error insert alias:', err);
    return { success: false };
  }
};

/**
 * Hapus item dari resi_items setelah diproses
 */
export const deleteProcessedResiItems = async (
  store: string | null,
  items: Array<{ id?: string | number; resi: string; part_number: string }>
): Promise<{ success: boolean; deleted: number }> => {
  const table = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  if (!table || items.length === 0) return { success: false, deleted: 0 };

  let deletedCount = 0;

  for (const item of items) {
    try {
      const rawId = item.id == null ? '' : String(item.id);
      const dbId = rawId.startsWith('db-') ? rawId.replace('db-', '') : rawId;

      // Prioritaskan delete by ID jika tersedia agar tidak gagal karena mismatch format part/resi.
      if (dbId) {
        const { data: deletedById, error: deleteByIdErr } = await supabase
          .from(table)
          .delete()
          .eq('id', dbId as any)
          .select('id');

        if (!deleteByIdErr && (deletedById?.length || 0) > 0) {
          deletedCount += deletedById!.length;
          continue;
        }
      }

      const normalizedResi = String(item.resi || '').trim();
      const normalizedPart = normalizePartKey(item.part_number);

      // Coba exact delete dulu (paling cepat).
      const { data: deletedExact, error: deleteExactErr } = await supabase
        .from(table)
        .delete()
        .eq('resi', normalizedResi)
        .eq('part_number', item.part_number)
        .select('id');

      if (!deleteExactErr && (deletedExact?.length || 0) > 0) {
        deletedCount += deletedExact!.length;
        continue;
      }

      // Fallback: cari kandidat dengan variasi case pada resi, lalu match part_number ter-normalize.
      const resiVariants = [...new Set(
        [normalizedResi, normalizedResi.toUpperCase(), normalizedResi.toLowerCase()].filter(Boolean)
      )];

      if (resiVariants.length === 0) continue;

      const { data: candidates, error: candidateErr } = await supabase
        .from(table)
        .select('id, resi, part_number')
        .in('resi', resiVariants)
        .limit(200);

      if (candidateErr || !candidates || candidates.length === 0) continue;

      const matchingIds = candidates
        .filter((row: any) => normalizePartKey(row.part_number) === normalizedPart)
        .map((row: any) => row.id)
        .filter(Boolean);

      if (matchingIds.length === 0) continue;

      const { data: deletedFallback, error: deleteFallbackErr } = await supabase
        .from(table)
        .delete()
        .in('id', matchingIds as any[])
        .select('id');

      if (!deleteFallbackErr && deletedFallback) {
        deletedCount += deletedFallback.length;
      }
    } catch (err) {
      console.warn('Delete resi item gagal:', err);
    }
  }

  if (deletedCount > 0) {
    markResiItemsDirty(store);
  }
  return { success: true, deleted: deletedCount };
};

/**
 * Hapus satu item dari resi_items berdasarkan ID
 */
export const deleteResiItemById = async (
  store: string | null,
  id: string | number
): Promise<{ success: boolean; message: string }> => {
  const table = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  if (!table) return { success: false, message: 'Toko tidak valid' };

  try {
    // ID dari database biasanya format "db-123", perlu extract angkanya
    const dbId = String(id).startsWith('db-') ? String(id).replace('db-', '') : String(id);
    
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', dbId);

    if (error) {
      console.error('Delete resi item by ID gagal:', error);
      return { success: false, message: error.message };
    }

    markResiItemsDirty(store);
    return { success: true, message: 'Item berhasil dihapus' };
  } catch (err: any) {
    console.error('Delete resi item exception:', err);
    return { success: false, message: err.message || 'Gagal menghapus item' };
  }
};

/**
 * Hapus satu item dari scan_resi berdasarkan ID (Stage 1)
 */
export const deleteScanResiById = async (
  store: string | null,
  id: string | number
): Promise<{ success: boolean; message: string }> => {
  const table = store === 'mjm' ? 'scan_resi_mjm' : (store === 'bjw' ? 'scan_resi_bjw' : null);
  if (!table) return { success: false, message: 'Toko tidak valid' };

  try {
    // ID dari Stage 1 biasanya format "s1-123", perlu extract angkanya
    const dbId = String(id).startsWith('s1-') ? String(id).replace('s1-', '') : String(id);
    
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', dbId);

    if (error) {
      console.error('Delete scan resi by ID gagal:', error);
      return { success: false, message: error.message };
    }

    markScanResiDirty(store);
    return { success: true, message: 'Item berhasil dihapus dari Stage 1' };
  } catch (err: any) {
    console.error('Delete scan resi exception:', err);
    return { success: false, message: err.message || 'Gagal menghapus item' };
  }
};

/**
 * Hapus multiple items dari scan_resi berdasarkan resi numbers (setelah proses ke barang_keluar)
 */
export const deleteProcessedScanResi = async (
  store: string | null,
  resiList: string[]
): Promise<{ success: boolean; deleted: number }> => {
  const table = store === 'mjm' ? 'scan_resi_mjm' : (store === 'bjw' ? 'scan_resi_bjw' : null);
  if (!table) return { success: false, deleted: 0 };
  if (!resiList || resiList.length === 0) return { success: true, deleted: 0 };

  try {
    const variants = [...new Set(
      resiList.flatMap((resi) => buildScanKeyVariants(resi))
    )];
    if (variants.length === 0) return { success: true, deleted: 0 };

    const { data, error } = await supabase
      .from(table)
      .delete()
      .in('resi', variants)
      .select('id');

    if (error) {
      console.error('Delete processed scan resi gagal:', error);
      return { success: false, deleted: 0 };
    }

    if ((data?.length || 0) > 0) {
      markScanResiDirty(store);
    }
    return { success: true, deleted: data?.length || 0 };
  } catch (err: any) {
    console.error('Delete processed scan resi exception:', err);
    return { success: false, deleted: 0 };
  }
};
