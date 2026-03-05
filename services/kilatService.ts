// FILE: services/kilatService.ts
// Service untuk mengelola sistem KILAT (Pre-Ship ke gudang e-commerce)
// Membaca data KILAT dari scan_resi_mjm/bjw dan mengelola prestock/penjualan

import { supabase } from './supabaseClient';
import { getWIBDate } from '../utils/timezone';
import { fetchCachedRowsPaged } from './edgeCacheTableReader';
import {
  markEdgeListDatasetsDirty,
  markInventoryCacheDirty,
  readEdgeListRowsCached,
  readInventoryRowsCached
} from './supabaseService';

// ============================================================================
// TYPES
// ============================================================================

export interface KilatPrestock {
  id: string;
  scan_resi_id?: string;
  tanggal_kirim: string;
  resi_kirim: string;
  part_number: string;
  nama_barang: string;
  brand?: string;
  application?: string;
  qty_kirim: number;
  qty_terjual: number;
  qty_sisa?: number; // Calculated
  status: 'MENUNGGU_TERJUAL' | 'SEBAGIAN_TERJUAL' | 'HABIS_TERJUAL' | 'RETUR' | 'EXPIRED';
  toko: string;
  sub_toko?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  stock_reduced: boolean;
  stock_reduced_at?: string;
  aging_days?: number; // Calculated
}

export interface KilatPenjualan {
  id: string;
  kilat_id?: string;
  no_pesanan: string;
  resi_penjualan: string;
  customer: string;
  part_number: string;
  nama_barang?: string;
  qty_jual: number;
  harga_satuan: number;
  harga_jual: number;
  tanggal_jual: string;
  source: 'CSV' | 'MANUAL';
  ecommerce?: string;
  created_at: string;
}

export interface KilatFromScanResi {
  id: string;
  resi: string;
  no_pesanan?: string;
  tanggal: string;
  part_number?: string;
  nama_produk?: string;
  customer?: string;
  ecommerce: string;
  sub_toko?: string;
  toko?: string;
  status: string;
  jumlah?: number;
  total_harga_produk?: number;
}

export interface KilatSyncResult {
  matched: boolean;
  kilat_id?: string;
  matched_qty: number;
  remaining_qty: number;
}

// ============================================================================
// HELPER: Table Name Selector
// ============================================================================

const getKilatPrestockTable = (store: string | null) =>
  store === 'mjm' ? 'kilat_prestock_mjm' : 'kilat_prestock_bjw';

const getKilatPenjualanTable = (store: string | null) =>
  store === 'mjm' ? 'kilat_penjualan_mjm' : 'kilat_penjualan_bjw';

const getScanResiTable = (store: string | null) =>
  store === 'mjm' ? 'scan_resi_mjm' : 'scan_resi_bjw';

const getResiItemsTable = (store: string | null) =>
  store === 'mjm' ? 'resi_items_mjm' : 'resi_items_bjw';

const getStockTable = (store: string | null) =>
  store === 'mjm' ? 'base_mjm' : 'base_bjw';

const normalizeKilatPart = (value: string | null | undefined): string =>
  String(value || '').trim().toUpperCase();

const mapKilatPrestockComputed = (item: any): KilatPrestock => ({
  ...item,
  qty_sisa: Number(item?.qty_kirim || 0) - Number(item?.qty_terjual || 0),
  aging_days: Math.floor((Date.now() - new Date(item?.tanggal_kirim || 0).getTime()) / (1000 * 60 * 60 * 24))
});

const markKilatPrestockChanged = (store: string | null) => {
  markEdgeListDatasetsDirty(store, ['kilat-prestock']);
};

const markKilatPenjualanChanged = (store: string | null) => {
  markEdgeListDatasetsDirty(store, ['kilat-penjualan']);
};

const fetchAllRowsPaged = async <T,>(
  table: string,
  selectColumns: string,
  buildQuery: (query: any) => any,
  options?: { orderBy?: string; ascending?: boolean; pageSize?: number }
): Promise<T[]> => {
  return fetchCachedRowsPaged<T>(table, selectColumns, buildQuery, options);
};

const splitIntoChunks = <T,>(items: T[], chunkSize: number): T[][] => {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
};

const fetchRowsByInChunksPaged = async <T,>(
  table: string,
  selectColumns: string,
  inColumn: string,
  values: Array<string | number>,
  options?: { orderBy?: string; ascending?: boolean; chunkSize?: number }
): Promise<T[]> => {
  const chunkSize = options?.chunkSize ?? 200;
  const uniqueValues = [...new Set(values)];
  const chunks = splitIntoChunks(uniqueValues, chunkSize);
  const rows: T[] = [];

  for (const chunk of chunks) {
    const chunkRows = await fetchAllRowsPaged<T>(
      table,
      selectColumns,
      (q) => q.in(inColumn, chunk),
      { orderBy: options?.orderBy, ascending: options?.ascending }
    );
    rows.push(...chunkRows);
  }

  return rows;
};

// ============================================================================
// 1. FETCH KILAT FROM SCAN_RESI (Read existing KILAT entries)
// ============================================================================

/**
 * Ambil semua data KILAT dari scan_resi_mjm/bjw
 * Filter: ecommerce = 'KILAT' dan status belum completed
 */
export const fetchKilatFromScanResi = async (
  store: string | null,
  options?: {
    includeCompleted?: boolean;
    limit?: number;
    searchTerm?: string;
  }
): Promise<KilatFromScanResi[]> => {
  try {
    const [scanRows, itemsRows] = await Promise.all([
      readEdgeListRowsCached<any>(store, 'scan-resi'),
      readEdgeListRowsCached<any>(store, 'resi-items')
    ]);
    let scanData = (scanRows || [])
      .filter((row: any) => String(row?.ecommerce || '').toUpperCase().includes('KILAT'));

    if (!options?.includeCompleted) {
      scanData = scanData.filter((row: any) => String(row?.status || '').toLowerCase() !== 'completed');
    }

    scanData = scanData.sort((a: any, b: any) => {
      const aTime = new Date(String(a?.tanggal || a?.created_at || 0)).getTime();
      const bTime = new Date(String(b?.tanggal || b?.created_at || 0)).getTime();
      return bTime - aTime;
    });
    if (options?.limit && options.limit > 0) {
      scanData = scanData.slice(0, options.limit);
    }
    
    if (!scanData || scanData.length === 0) return [];
    
    // Ambil detail items dari resi_items
    const resiIds = new Set(scanData.map((d: any) => String(d.id || '')));
    const itemsData = (itemsRows || [])
      .filter((item: any) => resiIds.has(String(item?.resi_id || '')))
      .sort((a: any, b: any) => Number(a?.id || 0) - Number(b?.id || 0));
    
    // Map items ke scan_resi
    const itemsMap = new Map<string, any[]>();
    (itemsData || []).forEach((item: any) => {
      const existing = itemsMap.get(item.resi_id) || [];
      existing.push(item);
      itemsMap.set(item.resi_id, existing);
    });
    
    // Gabungkan data
    const result: KilatFromScanResi[] = scanData.map((scan: any) => {
      const items = itemsMap.get(scan.id) || [];
      const firstItem = items[0] || {};
      
      return {
        id: scan.id,
        resi: scan.resi,
        no_pesanan: scan.no_pesanan,
        tanggal: scan.tanggal,
        part_number: firstItem.part_number || '',
        nama_produk: firstItem.nama_barang || '',
        customer: scan.customer || firstItem.customer || '',
        ecommerce: scan.ecommerce,
        sub_toko: scan.sub_toko,
        toko: store || '',
        status: scan.status,
        jumlah: firstItem.qty_keluar || 1,
        total_harga_produk: firstItem.harga_total || 0
      };
    });
    
    // Filter by search term if provided
    if (options?.searchTerm) {
      const term = options.searchTerm.toLowerCase();
      return result.filter(r => 
        r.resi?.toLowerCase().includes(term) ||
        r.part_number?.toLowerCase().includes(term) ||
        r.nama_produk?.toLowerCase().includes(term) ||
        r.customer?.toLowerCase().includes(term)
      );
    }
    
    return result;
  } catch (err) {
    console.error('fetchKilatFromScanResi exception:', err);
    return [];
  }
};

// ============================================================================
// 2. KILAT PRESTOCK OPERATIONS
// ============================================================================

/**
 * Ambil semua KILAT prestock yang masih pending (menunggu terjual)
 */
export const fetchKilatPrestockPending = async (
  store: string | null,
  options?: {
    partNumber?: string;
    limit?: number;
  }
): Promise<KilatPrestock[]> => {
  try {
    let data = await readEdgeListRowsCached<any>(store, 'kilat-prestock');
    const normalizedPart = normalizeKilatPart(options?.partNumber);
    data = (data || [])
      .filter((row: any) => ['MENUNGGU_TERJUAL', 'SEBAGIAN_TERJUAL'].includes(String(row?.status || '')))
      .filter((row: any) => !normalizedPart || normalizeKilatPart(row?.part_number) === normalizedPart)
      .sort((a: any, b: any) => {
        const aTime = new Date(String(a?.tanggal_kirim || 0)).getTime();
        const bTime = new Date(String(b?.tanggal_kirim || 0)).getTime();
        return aTime - bTime;
      });
    if (options?.limit && options.limit > 0) {
      data = data.slice(0, options.limit);
    }
    
    // Calculate qty_sisa dan aging_days
    return (data || []).map(mapKilatPrestockComputed);
  } catch (err) {
    console.error('fetchKilatPrestockPending exception:', err);
    return [];
  }
};

/**
 * Ambil semua KILAT prestock (termasuk yang sudah terjual)
 */
export const fetchAllKilatPrestock = async (
  store: string | null,
  options?: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    searchTerm?: string;
    limit?: number;
  }
): Promise<KilatPrestock[]> => {
  try {
    let data = await readEdgeListRowsCached<any>(store, 'kilat-prestock');
    data = (data || []).filter((row: any) => {
      if (options?.status && String(row?.status || '') !== String(options.status)) return false;
      if (options?.dateFrom && String(row?.tanggal_kirim || '') < String(options.dateFrom)) return false;
      if (options?.dateTo && String(row?.tanggal_kirim || '') > String(options.dateTo)) return false;
      return true;
    }).sort((a: any, b: any) => {
      const aTime = new Date(String(a?.tanggal_kirim || 0)).getTime();
      const bTime = new Date(String(b?.tanggal_kirim || 0)).getTime();
      return bTime - aTime;
    });
    if (options?.limit && options.limit > 0) {
      data = data.slice(0, options.limit);
    }
    
    let result = (data || []).map(mapKilatPrestockComputed);
    
    // Filter by search term
    if (options?.searchTerm) {
      const term = options.searchTerm.toLowerCase();
      result = result.filter((r: KilatPrestock) =>
        r.part_number?.toLowerCase().includes(term) ||
        r.nama_barang?.toLowerCase().includes(term) ||
        r.resi_kirim?.toLowerCase().includes(term)
      );
    }
    
    return result;
  } catch (err) {
    console.error('fetchAllKilatPrestock exception:', err);
    return [];
  }
};

/**
 * Tambah KILAT prestock baru (input manual atau dari scan_resi)
 */
export const addKilatPrestock = async (
  store: string | null,
  data: {
    scan_resi_id?: string;
    resi_kirim?: string;
    part_number: string;
    nama_barang?: string;
    brand?: string;
    application?: string;
    qty_kirim: number;
    sub_toko?: string;
    created_by?: string;
  },
  reduceStock: boolean = true
): Promise<{ success: boolean; message: string; id?: string }> => {
  try {
    const table = getKilatPrestockTable(store);
    const stockTable = getStockTable(store);
    const normalizedPart = normalizeKilatPart(data.part_number);

    // Validate part number exists in stock (snapshot-first)
    const stockRows = await readInventoryRowsCached(store);
    const stockItem = (stockRows || []).find(
      (row: any) => normalizeKilatPart(row?.part_number) === normalizedPart
    );

    if (!stockItem) {
      return { success: false, message: `Part number ${data.part_number} tidak ditemukan di database!` };
    }
    
    // Check if stock is sufficient
    if (reduceStock && stockItem.quantity < data.qty_kirim) {
      return { success: false, message: `Stock tidak cukup! Tersedia: ${stockItem.quantity}, Dibutuhkan: ${data.qty_kirim}` };
    }
    
    // Insert ke kilat_prestock
    const insertData = {
      scan_resi_id: data.scan_resi_id || null,
      tanggal_kirim: getWIBDate().toISOString(),
      resi_kirim: data.resi_kirim || null,
      part_number: data.part_number,
      nama_barang: data.nama_barang || stockItem.name || '',
      brand: data.brand || stockItem.brand || '',
      application: data.application || stockItem.application || '',
      qty_kirim: data.qty_kirim,
      qty_terjual: 0,
      status: 'MENUNGGU_TERJUAL',
      toko: store?.toUpperCase() || 'MJM',
      sub_toko: data.sub_toko || null,
      created_by: data.created_by || null,
      stock_reduced: reduceStock,
      stock_reduced_at: reduceStock ? getWIBDate().toISOString() : null
    };
    
    const { data: inserted, error: insertError } = await supabase
      .from(table)
      .insert([insertData])
      .select('id')
      .single();
    
    if (insertError) {
      console.error('Error inserting KILAT prestock:', insertError);
      return { success: false, message: insertError.message };
    }
    
    // Reduce stock if requested
    if (reduceStock) {
      const newQty = Number(stockItem.quantity || 0) - data.qty_kirim;
      const { error: updateError } = await supabase
        .from(stockTable)
        .update({ quantity: newQty })
        .eq('part_number', data.part_number);
      
      if (updateError) {
        console.error('Error reducing stock:', updateError);
        // Rollback insert
        await supabase.from(table).delete().eq('id', inserted.id);
        return { success: false, message: 'Gagal mengurangi stock: ' + updateError.message };
      }
    }

    markKilatPrestockChanged(store);
    if (reduceStock) {
      markInventoryCacheDirty(store);
    }
    return { success: true, message: 'KILAT berhasil ditambahkan!', id: inserted.id };
  } catch (err: any) {
    console.error('addKilatPrestock exception:', err);
    return { success: false, message: err.message || 'Terjadi kesalahan' };
  }
};

/**
 * Update KILAT prestock
 */
export const updateKilatPrestock = async (
  store: string | null,
  id: string,
  updates: Partial<KilatPrestock>
): Promise<{ success: boolean; message: string }> => {
  try {
    const table = getKilatPrestockTable(store);
    
    const { error } = await supabase
      .from(table)
      .update(updates)
      .eq('id', id);
    
    if (error) {
      return { success: false, message: error.message };
    }

    markKilatPrestockChanged(store);
    return { success: true, message: 'KILAT berhasil diupdate!' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
};

/**
 * Hapus KILAT prestock
 */
export const deleteKilatPrestock = async (
  store: string | null,
  id: string,
  restoreStock: boolean = false
): Promise<{ success: boolean; message: string }> => {
  try {
    const table = getKilatPrestockTable(store);
    const stockTable = getStockTable(store);
    
    // Get item data first
    const { data: item, error: fetchError } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !item) {
      return { success: false, message: 'Item tidak ditemukan!' };
    }
    
    // Restore stock if requested and stock was reduced
    if (restoreStock && item.stock_reduced) {
      const qtyToRestore = item.qty_kirim - item.qty_terjual;
      if (qtyToRestore > 0) {
        const { data: currentStock } = await supabase
          .from(stockTable)
          .select('quantity')
          .eq('part_number', item.part_number)
          .single();
        
        if (currentStock) {
          await supabase
            .from(stockTable)
            .update({ quantity: currentStock.quantity + qtyToRestore })
            .eq('part_number', item.part_number);
        }
      }
    }
    
    // Delete the item
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);
    
    if (error) {
      return { success: false, message: error.message };
    }

    markKilatPrestockChanged(store);
    if (restoreStock && item.stock_reduced) {
      markInventoryCacheDirty(store);
    }
    return { success: true, message: 'KILAT berhasil dihapus!' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
};

// ============================================================================
// 3. KILAT SINKRONISASI DENGAN CSV
// ============================================================================

/**
 * Match penjualan dari CSV dengan KILAT prestock
 * Menggunakan logika FIFO (First In First Out)
 */
export const matchKilatSale = async (
  store: string | null,
  data: {
    part_number: string;
    qty: number;
    no_pesanan: string;
    resi: string;
    customer: string;
    harga: number;
    ecommerce: string;
  }
): Promise<KilatSyncResult> => {
  try {
    const prestockTable = getKilatPrestockTable(store);
    const penjualanTable = getKilatPenjualanTable(store);
    
    // Cari KILAT pending dengan part_number yang sama (FIFO)
    const normalizedPart = normalizeKilatPart(data.part_number);
    const pendingKilat = (await readEdgeListRowsCached<any>(store, 'kilat-prestock'))
      .filter((row: any) =>
        normalizeKilatPart(row?.part_number) === normalizedPart
        && ['MENUNGGU_TERJUAL', 'SEBAGIAN_TERJUAL'].includes(String(row?.status || ''))
      )
      .sort((a: any, b: any) => {
        const aTime = new Date(String(a?.tanggal_kirim || 0)).getTime();
        const bTime = new Date(String(b?.tanggal_kirim || 0)).getTime();
        return aTime - bTime;
      });
    
    if (!pendingKilat || pendingKilat.length === 0) {
      // Tidak ada match
      return { matched: false, matched_qty: 0, remaining_qty: data.qty };
    }
    
    const kilat = pendingKilat[0];
    const qtySisa = kilat.qty_kirim - kilat.qty_terjual;
    const matchedQty = Math.min(data.qty, qtySisa);
    
    // Update qty_terjual di prestock
    const { error: updateError } = await supabase
      .from(prestockTable)
      .update({ qty_terjual: kilat.qty_terjual + matchedQty })
      .eq('id', kilat.id);
    
    if (updateError) {
      console.error('Error updating KILAT prestock:', updateError);
      return { matched: false, matched_qty: 0, remaining_qty: data.qty };
    }
    
    // Insert ke kilat_penjualan
    const { error: insertError } = await supabase
      .from(penjualanTable)
      .insert([{
        kilat_id: kilat.id,
        no_pesanan: data.no_pesanan,
        resi_penjualan: data.resi,
        customer: data.customer,
        part_number: data.part_number,
        nama_barang: kilat.nama_barang,
        qty_jual: matchedQty,
        harga_satuan: data.harga / matchedQty,
        harga_jual: data.harga,
        tanggal_jual: getWIBDate().toISOString(),
        source: 'CSV',
        ecommerce: data.ecommerce
      }]);
    
    if (insertError) {
      console.error('Error inserting KILAT penjualan:', insertError);
    }

    markKilatPrestockChanged(store);
    markKilatPenjualanChanged(store);
    
    return {
      matched: true,
      kilat_id: kilat.id,
      matched_qty: matchedQty,
      remaining_qty: data.qty - matchedQty
    };
  } catch (err) {
    console.error('matchKilatSale exception:', err);
    return { matched: false, matched_qty: 0, remaining_qty: data.qty };
  }
};

/**
 * Batch match penjualan dari CSV
 * Return: items yang tidak match (perlu kurangi stock seperti biasa)
 */
export const batchMatchKilatSales = async (
  store: string | null,
  items: Array<{
    part_number: string;
    qty: number;
    no_pesanan: string;
    resi: string;
    customer: string;
    harga: number;
    ecommerce: string;
  }>
): Promise<{
  matchedCount: number;
  unmatchedItems: typeof items;
  partialMatches: Array<{ item: typeof items[0]; remaining_qty: number }>;
}> => {
  let matchedCount = 0;
  const unmatchedItems: typeof items = [];
  const partialMatches: Array<{ item: typeof items[0]; remaining_qty: number }> = [];
  
  for (const item of items) {
    const result = await matchKilatSale(store, item);
    
    if (result.matched) {
      matchedCount++;
      
      if (result.remaining_qty > 0) {
        // Partial match - ada sisa qty yang tidak ter-match
        partialMatches.push({ item, remaining_qty: result.remaining_qty });
      }
    } else {
      unmatchedItems.push(item);
    }
  }
  
  return { matchedCount, unmatchedItems, partialMatches };
};

// ============================================================================
// 4. KILAT PENJUALAN OPERATIONS
// ============================================================================

/**
 * Ambil riwayat penjualan KILAT
 */
export const fetchKilatPenjualan = async (
  store: string | null,
  options?: {
    kilat_id?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }
): Promise<KilatPenjualan[]> => {
  try {
    let data = await readEdgeListRowsCached<any>(store, 'kilat-penjualan');
    data = (data || []).filter((row: any) => {
      if (options?.kilat_id && String(row?.kilat_id || '') !== String(options.kilat_id)) return false;
      if (options?.dateFrom && String(row?.tanggal_jual || '') < String(options.dateFrom)) return false;
      if (options?.dateTo && String(row?.tanggal_jual || '') > String(options.dateTo)) return false;
      return true;
    }).sort((a: any, b: any) => {
      const aTime = new Date(String(a?.tanggal_jual || 0)).getTime();
      const bTime = new Date(String(b?.tanggal_jual || 0)).getTime();
      return bTime - aTime;
    });
    if (options?.limit && options.limit > 0) {
      data = data.slice(0, options.limit);
    }

    return data || [];
  } catch (err) {
    console.error('fetchKilatPenjualan exception:', err);
    return [];
  }
};

/**
 * Tambah penjualan KILAT manual (bukan dari CSV)
 */
export const addKilatPenjualanManual = async (
  store: string | null,
  data: {
    kilat_id?: string;
    no_pesanan?: string;
    resi_penjualan?: string;
    customer: string;
    part_number: string;
    qty_jual: number;
    harga_jual: number;
    ecommerce?: string;
  }
): Promise<{ success: boolean; message: string }> => {
  try {
    const prestockTable = getKilatPrestockTable(store);
    const penjualanTable = getKilatPenjualanTable(store);
    
    // Jika ada kilat_id, update qty_terjual
    if (data.kilat_id) {
      const prestockRows = await readEdgeListRowsCached<any>(store, 'kilat-prestock');
      const kilat = (prestockRows || []).find((row: any) => String(row?.id || '') === String(data.kilat_id));
      
      if (!kilat) {
        return { success: false, message: 'KILAT prestock tidak ditemukan!' };
      }
      
      const qtySisa = kilat.qty_kirim - kilat.qty_terjual;
      if (data.qty_jual > qtySisa) {
        return { success: false, message: `Qty melebihi sisa! Sisa: ${qtySisa}` };
      }
      
      // Update prestock
      await supabase
        .from(prestockTable)
        .update({ qty_terjual: kilat.qty_terjual + data.qty_jual })
        .eq('id', data.kilat_id);
    }
    
    // Insert penjualan
    const { error } = await supabase
      .from(penjualanTable)
      .insert([{
        kilat_id: data.kilat_id || null,
        no_pesanan: data.no_pesanan || null,
        resi_penjualan: data.resi_penjualan || null,
        customer: data.customer,
        part_number: data.part_number,
        qty_jual: data.qty_jual,
        harga_satuan: data.harga_jual / data.qty_jual,
        harga_jual: data.harga_jual,
        tanggal_jual: getWIBDate().toISOString(),
        source: 'MANUAL',
        ecommerce: data.ecommerce || 'KILAT'
      }]);
    
    if (error) {
      return { success: false, message: error.message };
    }

    markKilatPenjualanChanged(store);
    if (data.kilat_id) {
      markKilatPrestockChanged(store);
    }
    return { success: true, message: 'Penjualan berhasil dicatat!' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
};

// ============================================================================
// 5. KILAT STATISTICS & REPORTS
// ============================================================================

/**
 * Get KILAT summary statistics
 */
export const getKilatStats = async (
  store: string | null
): Promise<{
  totalPending: number;
  totalTerjual: number;
  totalQtyPending: number;
  totalQtyTerjual: number;
  avgAgingDays: number;
  oldestPending?: KilatPrestock;
}> => {
  try {
    const qtyData = await readEdgeListRowsCached<any>(store, 'kilat-prestock');
    
    let totalQtyPending = 0;
    let totalQtyTerjual = 0;
    let totalAgingDays = 0;
    let pendingItemCount = 0;
    let oldestPending: any = null;
    let pendingCount = 0;
    let terjualCount = 0;
    
    (qtyData || []).forEach((item: any) => {
      const qtyKirim = Number(item?.qty_kirim || 0);
      const qtyTerjual = Number(item?.qty_terjual || 0);
      const qtySisa = qtyKirim - qtyTerjual;
      totalQtyTerjual += qtyTerjual;
      if (String(item?.status || '') === 'HABIS_TERJUAL') {
        terjualCount += 1;
      }
      
      if (item.status !== 'HABIS_TERJUAL') {
        pendingCount += 1;
        totalQtyPending += qtySisa;
        
        const agingDays = Math.floor(
          (Date.now() - new Date(item.tanggal_kirim).getTime()) / (1000 * 60 * 60 * 24)
        );
        totalAgingDays += agingDays;
        pendingItemCount++;
        
        if (!oldestPending || new Date(item.tanggal_kirim) < new Date(oldestPending.tanggal_kirim)) {
          oldestPending = item;
        }
      }
    });
    
    return {
      totalPending: pendingCount,
      totalTerjual: terjualCount,
      totalQtyPending,
      totalQtyTerjual,
      avgAgingDays: pendingItemCount > 0 ? Math.round(totalAgingDays / pendingItemCount) : 0,
      oldestPending: oldestPending ? {
        ...oldestPending,
        qty_sisa: oldestPending.qty_kirim - oldestPending.qty_terjual,
        aging_days: Math.floor((Date.now() - new Date(oldestPending.tanggal_kirim).getTime()) / (1000 * 60 * 60 * 24))
      } : undefined
    };
  } catch (err) {
    console.error('getKilatStats exception:', err);
    return {
      totalPending: 0,
      totalTerjual: 0,
      totalQtyPending: 0,
      totalQtyTerjual: 0,
      avgAgingDays: 0
    };
  }
};

export const searchKilatStockParts = async (
  store: string | null,
  term: string,
  limit = 20
): Promise<Array<{ part_number: string; name: string; brand: string; quantity: number }>> => {
  const keyword = String(term || '').trim().toLowerCase();
  if (!keyword || keyword.length < 2) return [];

  try {
    const rows = await readInventoryRowsCached(store);
    return (rows || [])
      .filter((row: any) => {
        const part = String(row?.part_number || '').toLowerCase();
        const name = String(row?.name || '').toLowerCase();
        return part.includes(keyword) || name.includes(keyword);
      })
      .sort((a: any, b: any) => String(a?.part_number || '').localeCompare(String(b?.part_number || '')))
      .slice(0, Math.max(1, limit))
      .map((row: any) => ({
        part_number: String(row?.part_number || ''),
        name: String(row?.name || ''),
        brand: String(row?.brand || ''),
        quantity: Number(row?.quantity || 0)
      }));
  } catch (err) {
    console.error('searchKilatStockParts exception:', err);
    return [];
  }
};

// ============================================================================
// 6. MIGRASI DATA KILAT DARI SCAN_RESI
// ============================================================================

/**
 * Migrate existing KILAT entries from scan_resi to kilat_prestock
 * Ini untuk one-time migration data lama
 */
export const migrateKilatFromScanResi = async (
  store: string | null
): Promise<{ success: boolean; message: string; migratedCount: number }> => {
  try {
    const scanTable = getScanResiTable(store);
    const itemsTable = getResiItemsTable(store);
    const prestockTable = getKilatPrestockTable(store);
    
    // Ambil semua KILAT dari scan_resi yang belum di-migrate
    const { data: kilatScans, error: fetchError } = await supabase
      .from(scanTable)
      .select('*')
      .ilike('ecommerce', '%KILAT%');
    
    if (fetchError || !kilatScans || kilatScans.length === 0) {
      return { success: true, message: 'Tidak ada data KILAT untuk di-migrate', migratedCount: 0 };
    }
    
    let migratedCount = 0;
    
    for (const scan of kilatScans) {
      // Cek apakah sudah ada di kilat_prestock
      const { data: existing } = await supabase
        .from(prestockTable)
        .select('id')
        .eq('scan_resi_id', scan.id)
        .limit(1);
      
      if (existing && existing.length > 0) continue;
      
      // Ambil items
      const { data: items } = await supabase
        .from(itemsTable)
        .select('*')
        .eq('resi_id', scan.id);
      
      // Insert untuk setiap item
      for (const item of (items || [{ part_number: '', nama_barang: '', qty_keluar: 1 }])) {
        if (!item.part_number) continue;
        
        await supabase.from(prestockTable).insert([{
          scan_resi_id: scan.id,
          tanggal_kirim: scan.tanggal || scan.created_at,
          resi_kirim: scan.resi,
          part_number: item.part_number,
          nama_barang: item.nama_barang || '',
          brand: item.brand || '',
          application: item.application || '',
          qty_kirim: item.qty_keluar || 1,
          qty_terjual: scan.status === 'completed' ? (item.qty_keluar || 1) : 0,
          status: scan.status === 'completed' ? 'HABIS_TERJUAL' : 'MENUNGGU_TERJUAL',
          toko: store?.toUpperCase() || 'MJM',
          sub_toko: scan.sub_toko,
          stock_reduced: true, // Anggap stock sudah dikurangi sebelumnya
          stock_reduced_at: scan.tanggal || scan.created_at
        }]);
        
        migratedCount++;
      }
    }
    
    return { 
      success: true, 
      message: `Berhasil migrate ${migratedCount} item KILAT`, 
      migratedCount 
    };
  } catch (err: any) {
    console.error('migrateKilatFromScanResi exception:', err);
    return { success: false, message: err.message, migratedCount: 0 };
  }
};
