// FILE: services/kilatService.ts
// Service untuk mengelola sistem KILAT (Pre-Ship ke gudang e-commerce)
// Membaca data KILAT dari scan_resi_mjm/bjw dan mengelola prestock/penjualan

import { supabase } from './supabaseClient';
import { getWIBDate } from '../utils/timezone';

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
    const scanTable = getScanResiTable(store);
    const itemsTable = getResiItemsTable(store);
    
    // Query scan_resi untuk mendapat data KILAT
    let query = supabase
      .from(scanTable)
      .select(`
        id,
        resi,
        no_pesanan,
        tanggal,
        ecommerce,
        sub_toko,
        status,
        customer
      `)
      .ilike('ecommerce', '%KILAT%')
      .order('tanggal', { ascending: false });
    
    if (!options?.includeCompleted) {
      query = query.neq('status', 'completed');
    }
    
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    
    const { data: scanData, error: scanError } = await query;
    
    if (scanError) {
      console.error('Error fetching KILAT from scan_resi:', scanError);
      return [];
    }
    
    if (!scanData || scanData.length === 0) return [];
    
    // Ambil detail items dari resi_items
    const resiIds = scanData.map((d: any) => d.id);
    const { data: itemsData, error: itemsError } = await supabase
      .from(itemsTable)
      .select('*')
      .in('resi_id', resiIds);
    
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
    const table = getKilatPrestockTable(store);
    
    let query = supabase
      .from(table)
      .select('*')
      .in('status', ['MENUNGGU_TERJUAL', 'SEBAGIAN_TERJUAL'])
      .order('tanggal_kirim', { ascending: true }); // FIFO
    
    if (options?.partNumber) {
      query = query.eq('part_number', options.partNumber);
    }
    
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching KILAT prestock:', error);
      return [];
    }
    
    // Calculate qty_sisa dan aging_days
    return (data || []).map((item: any) => ({
      ...item,
      qty_sisa: item.qty_kirim - item.qty_terjual,
      aging_days: Math.floor((Date.now() - new Date(item.tanggal_kirim).getTime()) / (1000 * 60 * 60 * 24))
    }));
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
    const table = getKilatPrestockTable(store);
    
    let query = supabase
      .from(table)
      .select('*')
      .order('tanggal_kirim', { ascending: false });
    
    if (options?.status) {
      query = query.eq('status', options.status);
    }
    
    if (options?.dateFrom) {
      query = query.gte('tanggal_kirim', options.dateFrom);
    }
    
    if (options?.dateTo) {
      query = query.lte('tanggal_kirim', options.dateTo);
    }
    
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching all KILAT prestock:', error);
      return [];
    }
    
    let result = (data || []).map((item: any) => ({
      ...item,
      qty_sisa: item.qty_kirim - item.qty_terjual,
      aging_days: Math.floor((Date.now() - new Date(item.tanggal_kirim).getTime()) / (1000 * 60 * 60 * 24))
    }));
    
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
    
    // Validate part number exists in stock
    const { data: stockItem, error: stockError } = await supabase
      .from(stockTable)
      .select('part_number, name, brand, application, quantity')
      .eq('part_number', data.part_number)
      .single();
    
    if (stockError || !stockItem) {
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
      const newQty = stockItem.quantity - data.qty_kirim;
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
    const { data: pendingKilat, error: fetchError } = await supabase
      .from(prestockTable)
      .select('*')
      .eq('part_number', data.part_number)
      .in('status', ['MENUNGGU_TERJUAL', 'SEBAGIAN_TERJUAL'])
      .order('tanggal_kirim', { ascending: true }) // FIFO
      .limit(1);
    
    if (fetchError || !pendingKilat || pendingKilat.length === 0) {
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
    const table = getKilatPenjualanTable(store);
    
    let query = supabase
      .from(table)
      .select('*')
      .order('tanggal_jual', { ascending: false });
    
    if (options?.kilat_id) {
      query = query.eq('kilat_id', options.kilat_id);
    }
    
    if (options?.dateFrom) {
      query = query.gte('tanggal_jual', options.dateFrom);
    }
    
    if (options?.dateTo) {
      query = query.lte('tanggal_jual', options.dateTo);
    }
    
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching KILAT penjualan:', error);
      return [];
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
      const { data: kilat, error: fetchError } = await supabase
        .from(prestockTable)
        .select('*')
        .eq('id', data.kilat_id)
        .single();
      
      if (fetchError || !kilat) {
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
    const table = getKilatPrestockTable(store);
    
    // Count pending
    const { count: pendingCount } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in('status', ['MENUNGGU_TERJUAL', 'SEBAGIAN_TERJUAL']);
    
    // Count terjual
    const { count: terjualCount } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('status', 'HABIS_TERJUAL');
    
    // Sum qty
    const { data: qtyData } = await supabase
      .from(table)
      .select('qty_kirim, qty_terjual, tanggal_kirim, status');
    
    let totalQtyPending = 0;
    let totalQtyTerjual = 0;
    let totalAgingDays = 0;
    let pendingItemCount = 0;
    let oldestPending: any = null;
    
    (qtyData || []).forEach((item: any) => {
      const qtySisa = item.qty_kirim - item.qty_terjual;
      totalQtyTerjual += item.qty_terjual;
      
      if (item.status !== 'HABIS_TERJUAL') {
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
      totalPending: pendingCount || 0,
      totalTerjual: terjualCount || 0,
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
