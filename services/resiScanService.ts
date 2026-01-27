// FILE: services/resiScanService.ts
import { supabase } from './supabaseClient';
import { ResiScanStage, ResiItem, ResellerMaster, ParsedCSVItem } from '../types';
// [UBAH] Import helper timezone
import { getWIBDate } from '../utils/timezone';

// ============================================================================
// HELPER: Table Name Selector
// ============================================================================
const getTableName = (store: string | null) => 
  store === 'mjm' ? 'scan_resi_mjm' : 'scan_resi_bjw';

const getBarangKeluarTable = (store: string | null) => 
  store === 'mjm' ? 'barang_keluar_mjm' : 'barang_keluar_bjw';

const getStockTable = (store: string | null) => 
  store === 'mjm' ? 'base_mjm' : 'base_bjw';

// Helper: Konversi Database (String) ke App (Boolean)
const mapToBoolean = (data: any[]) => {
  return data.map(item => ({
    ...item,
    stage1_scanned: String(item.stage1_scanned) === 'true',
    stage2_verified: String(item.stage2_verified) === 'true',
    is_split: String(item.is_split) === 'true'
  }));
};

// ============================================================================
// HELPER: Cek apakah resi/order sudah ada di barang_keluar (sudah terjual/keluar)
// ============================================================================

/**
 * Cari resi di semua tabel untuk debugging
 */
export const findResiEverywhere = async (
  resi: string,
  store: string | null
): Promise<{ found: boolean; location: string; details?: any }> => {
  const scanTable = getTableName(store);
  const keluarTable = getBarangKeluarTable(store);
  const resiNormalized = resi.trim().toUpperCase();
  
  try {
    // 1. Cek di scan_resi
    const { data: scanData } = await supabase
      .from(scanTable)
      .select('id, resi, status, stage1_scanned, stage2_verified, tanggal')
      .ilike('resi', resiNormalized)
      .limit(1);
    
    if (scanData && scanData.length > 0) {
      return { 
        found: true, 
        location: `scan_resi (status: ${scanData[0].status})`,
        details: scanData[0]
      };
    }
    
    // 2. Cek di barang_keluar
    const { data: keluarData } = await supabase
      .from(keluarTable)
      .select('id, resi, customer, tanggal, created_at')
      .ilike('resi', resiNormalized)
      .limit(1);
    
    if (keluarData && keluarData.length > 0) {
      return { 
        found: true, 
        location: 'barang_keluar (sudah terjual)',
        details: keluarData[0]
      };
    }
    
    return { found: false, location: 'tidak ditemukan' };
  } catch (err) {
    console.error('findResiEverywhere error:', err);
    return { found: false, location: 'error' };
  }
};

/**
 * Cek apakah resi atau order_id sudah ada di barang_keluar
 * Return Set of resi yang sudah ada
 */
export const checkExistingInBarangKeluar = async (
  resiOrOrders: string[],
  store: string | null
): Promise<Set<string>> => {
  const table = getBarangKeluarTable(store);
  if (!resiOrOrders || resiOrOrders.length === 0) return new Set();
  
  try {
    // Normalize: uppercase dan trim
    const normalized = resiOrOrders.map(r => r.trim().toUpperCase());
    
    // Query semua resi dari barang_keluar
    const { data, error } = await supabase
      .from(table)
      .select('resi')
      .limit(5000);
    
    if (error) {
      console.error('checkExistingInBarangKeluar error:', error);
      return new Set();
    }
    
    // Buat set dari resi yang ada di barang_keluar (UPPERCASE)
    const existingSet = new Set<string>(
      (data || [])
        .map((d: any) => (d.resi || '').trim().toUpperCase())
        .filter((r: string) => r !== '' && r !== '-')
    );
    
    // Return resi yang ada di kedua set (intersection)
    const foundSet = new Set<string>();
    for (const resi of normalized) {
      if (existingSet.has(resi)) {
        foundSet.add(resi);
      }
    }
    
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
    const resiNormalized = data.resi.trim().toUpperCase();
    
    // CEK DUPLIKAT: Pastikan resi belum pernah di-scan sebelumnya
    const { data: existing } = await supabase
      .from(table)
      .select('id, resi, status')
      .ilike('resi', resiNormalized)
      .limit(1);
    
    if (existing && existing.length > 0) {
      const statusInfo = existing[0].status ? ` (status: ${existing[0].status})` : '';
      return { success: false, message: `Resi sudah ada di database${statusInfo}!` };
    }
    
    // CEK BARANG KELUAR: Pastikan resi belum ada di barang_keluar (sudah terjual/keluar)
    const existingInBarangKeluar = await checkExistingInBarangKeluar([data.resi], store);
    if (existingInBarangKeluar.has(data.resi.trim().toUpperCase())) {
      return { success: false, message: 'Resi sudah ada di Barang Keluar (sudah terjual/keluar)!' };
    }
    
    const insertData = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      resi: data.resi,
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
    const { data: existingResi } = await supabase
      .from(table)
      .select('resi')
      .in('resi', resiList);
    
    const existingSet = new Set((existingResi || []).map(r => r.resi));
    
    // CEK BARANG KELUAR: Resi yang sudah ada di barang_keluar (sudah terjual/keluar)
    const existingInBarangKeluar = await checkExistingInBarangKeluar(resiList, store);
    
    const duplicates = items.filter(i => existingSet.has(i.resi)).map(i => i.resi);
    const alreadySold = items
      .filter(i => existingInBarangKeluar.has(i.resi.trim().toUpperCase()))
      .map(i => i.resi);
    
    // Filter: bukan duplikat DAN bukan sudah terjual
    const newItems = items.filter(i => {
      const resiUpper = i.resi.trim().toUpperCase();
      return !existingSet.has(i.resi) && !existingInBarangKeluar.has(resiUpper);
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
  const table = getTableName(store);
  
  // Ambil semua data dari tabel
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('tanggal', { ascending: false })
    .limit(500);

  if (error) {
    console.error('getResiStage1List error:', error);
    return [];
  }
  
  // Filter manual: ambil yang bukan completed
  const filtered = (data || []).filter((d: any) => d.status !== 'completed');
  
  return mapToBoolean(filtered);
};

// Fungsi pencarian resi - cari di semua status
export const searchResiByNumber = async (resiQuery: string, store: string | null) => {
  const table = getTableName(store);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .ilike('resi', `%${resiQuery}%`)
    .order('tanggal', { ascending: false })
    .limit(100);

  if (error) {
    console.error('searchResiByNumber error:', error);
    return [];
  }
  return mapToBoolean(data || []);
};

// Ambil semua resi Stage 1 yang belum completed (untuk Stage 3)
export const getAllPendingStage1Resi = async (store: string | null) => {
  const table = getTableName(store);
  // Ambil resi yang stage1_scanned = true DAN status bukan completed
  // atau status IS NULL (data lama)
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('stage1_scanned', 'true')
    .or('status.is.null,status.neq.completed')
    .order('tanggal', { ascending: false })
    .limit(500);

  if (error) return [];
  return mapToBoolean(data || []);
};

export const deleteResiStage1 = async (id: string, store: string | null, forceDelete: boolean = false) => {
  const table = getTableName(store);
  
  // Jika tidak force delete, cek apakah sudah masuk Stage 2
  if (!forceDelete) {
    const { data } = await supabase.from(table).select('stage2_verified, status').eq('id', id).single();
    
    if (data?.stage2_verified === 'true' || data?.status === 'stage2' || data?.status === 'completed') {
      return { success: false, message: `Tidak bisa dihapus, status: ${data?.status || 'stage2'}. Gunakan opsi hapus paksa jika perlu.` };
    }
  }

  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Resi berhasil dihapus dari database.' };
};

// Delete resi - bisa menghapus Stage 1, Stage 2, atau Stage 3
export const deleteResi = async (id: string, store: string | null) => {
  const table = getTableName(store);
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { success: false, message: error.message };
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
  return { success: true, message: 'Resi berhasil diupdate!' };
};

// --- FUNGSI RESELLER ---

export const getResellers = async (): Promise<ResellerMaster[]> => {
  const { data, error } = await supabase
    .from('reseller_master')
    .select('*')
    .order('nama_reseller', { ascending: true });
  if (error) return [];
  return data || [];
};

export const addReseller = async (nama: string): Promise<{ success: boolean; message: string }> => {
  try {
    const { error } = await supabase
      .from('reseller_master')
      .insert([{ nama_reseller: nama }]);
    if (error) throw error;
    return { success: true, message: 'Reseller berhasil ditambahkan' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
};

// ============================================================================
// STAGE 2: PACKING VERIFICATION
// ============================================================================

export const getPendingStage2List = async (store: string | null) => {
  const table = getTableName(store);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('stage1_scanned', 'true')
    .or('stage2_verified.is.null,stage2_verified.neq.true')
    .order('stage1_scanned_at', { ascending: false });
    
  if (error) return [];
  return mapToBoolean(data || []);
};

export const verifyResiStage2 = async (
  data: { resi: string, verified_by: string },
  store: string | null
): Promise<{ success: boolean; message: string }> => {
  const table = getTableName(store);
  const { resi, verified_by } = data;

  const { data: rows } = await supabase
    .from(table)
    .select('id')
    .eq('resi', resi)
    .eq('stage1_scanned', 'true')
    .or('stage2_verified.is.null,stage2_verified.neq.true');

  if (!rows || rows.length === 0) {
    const { data: unscan } = await supabase.from(table).select('id').eq('resi', resi).limit(1);
    if (!unscan || unscan.length === 0) return { success: false, message: 'Resi belum discan di Stage 1!' };
    return { success: false, message: 'Resi sudah terverifikasi sebelumnya.' };
  }

  const ids = rows.map(r => r.id);
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

  for (const resi of resiList) {
    const { data: rows } = await supabase
      .from(table)
      .select('id')
      .eq('resi', resi)
      .eq('stage1_scanned', 'true')
      .or('stage2_verified.is.null,stage2_verified.neq.true');

    if (rows && rows.length > 0) {
      const ids = rows.map(r => r.id);
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
      const { data: existingResi } = await supabase
        .from(table)
        .select('id, stage2_verified')
        .eq('resi', resi)
        .limit(1);
      
      if (existingResi && existingResi.length > 0 && existingResi[0].stage2_verified === 'true') {
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
  
  return { success: true, message: msg, count: successCount, alreadyVerified };
};

// ============================================================================
// STAGE 3: DATA ENTRY & FINALISASI
// ============================================================================

export const getResiHistory = async (store: string | null) => {
  const table = getTableName(store);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('stage1_scanned_at', { ascending: false })
    .limit(100);
    
  if (error) return [];
  return mapToBoolean(data || []);
};

export const getPendingStage3List = async (store: string | null) => {
  const table = getTableName(store);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('stage2_verified', 'true')
    .neq('status', 'completed')
    .order('stage2_verified_at', { ascending: false });

  if (error) return [];
  return mapToBoolean(data || []);
};

export const checkResiStatus = async (resis: string[], store: string | null) => {
  const table = getTableName(store);
  if (resis.length === 0) return [];
  
  const { data, error } = await supabase
    .from(table)
    .select('resi, stage1_scanned, stage2_verified, status, ecommerce, sub_toko, no_pesanan')
    .in('resi', resis);
  
  if (error) return [];
  return data || [];
};

/**
 * Cek status resi dengan matching ke resi ATAU no_pesanan
 * Untuk kasus instant/sameday yang scan pakai no pesanan
 */
export const checkResiOrOrderStatus = async (
  resiOrOrders: string[], 
  store: string | null
): Promise<any[]> => {
  const table = getTableName(store);
  if (resiOrOrders.length === 0) return [];
  
  // Normalize: uppercase dan trim semua nilai
  const normalized = resiOrOrders.map(r => r.trim().toUpperCase());
  
  // Query semua resi dari Stage 1
  const { data, error } = await supabase
    .from(table)
    .select('resi, no_pesanan, stage1_scanned, stage2_verified, status, ecommerce, sub_toko, negara_ekspor')
    .eq('stage1_scanned', 'true');
  
  if (error) {
    console.error('checkResiOrOrderStatus error:', error);
    return [];
  }
  
  // Filter manual dengan case-insensitive matching
  const filtered = (data || []).filter((d: any) => {
    const resiUpper = String(d.resi || '').trim().toUpperCase();
    const noPesananUpper = String(d.no_pesanan || '').trim().toUpperCase();
    return normalized.includes(resiUpper) || normalized.includes(noPesananUpper);
  });
  
  return filtered;
};

/**
 * Ambil daftar resi yang sudah melewati Stage 1 (untuk dropdown search)
 */
export const getStage1ResiList = async (store: string | null): Promise<Array<{resi: string, no_pesanan?: string, ecommerce: string, sub_toko: string, stage2_verified: boolean}>> => {
  const table = getTableName(store);
  
  const { data, error } = await supabase
    .from(table)
    .select('resi, no_pesanan, ecommerce, sub_toko, stage2_verified')
    .eq('stage1_scanned', 'true')
    .order('stage1_scanned_at', { ascending: false })
    .limit(500);
  
  if (error) {
    console.error('getStage1ResiList error:', error);
    return [];
  }
  
  return (data || []).map(d => ({
    resi: d.resi,
    no_pesanan: d.no_pesanan,
    ecommerce: d.ecommerce || '-',
    sub_toko: d.sub_toko || '-',
    stage2_verified: String(d.stage2_verified) === 'true'
  }));
};

export const lookupPartNumberInfo = async (sku: string, store: string | null) => {
  const table = getStockTable(store);
  const { data } = await supabase
    .from(table)
    .select('part_number, name, brand, application, quantity')
    .eq('part_number', sku)
    .maybeSingle();
  return data;
};

export const getBulkPartNumberInfo = async (skus: string[], store: string | null) => {
  const table = getStockTable(store);
  if (skus.length === 0) return [];
  
  const uniqueSkus = [...new Set(skus)].filter(Boolean);

  const { data, error } = await supabase
    .from(table)
    .select('part_number, name, brand, application, quantity')
    .in('part_number', uniqueSkus);

  if (error) {
    console.error("Error bulk part info:", error);
    return [];
  }
  return data || [];
};

export const getAvailableParts = async (store: string | null) => {
  const table = getStockTable(store);
  const { data, error } = await supabase
    .from(table)
    .select('part_number')
    .order('part_number', { ascending: true });

  if (error) return [];
  return data?.map(d => d.part_number) || [];
};

export const fetchPendingCSVItems = async (store: string | null) => {
  const table = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  if (!table) return [];

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('status', 'pending') 
    .order('created_at', { ascending: false })
    .limit(2000); // Ambil semua pending items (max 2000)

  if (error) {
    console.error("Gagal ambil pending CSV:", error);
    return [];
  }
  return data || [];
};

export const processBarangKeluarBatch = async (items: any[], store: string | null) => {
  const scanTable = getTableName(store);
  const logTable = getBarangKeluarTable(store);
  const stockTable = getStockTable(store);
  const csvTable = store === 'mjm' ? 'resi_items_mjm' : 'resi_items_bjw';
  
  let successCount = 0;
  let errors: string[] = [];

  for (const item of items) {
    try {
      // 1. Cek & Potong Stok
      const { data: stock } = await supabase
        .from(stockTable)
        .select('quantity')
        .eq('part_number', item.part_number)
        .single();
        
      if (!stock || stock.quantity < item.qty_keluar) {
        errors.push(`Stok ${item.part_number} Habis/Kurang (Sisa: ${stock?.quantity || 0})`);
        continue;
      }

      const newStock = stock.quantity - item.qty_keluar;
      const { error: stockErr } = await supabase
        .from(stockTable)
        .update({ quantity: newStock })
        .eq('part_number', item.part_number);

      if (stockErr) {
        errors.push(`Gagal update stok ${item.part_number}: ${stockErr.message}`);
        continue;
      }

      // 2. Simpan Log Barang Keluar
      const logPayload = {
        tanggal: item.tanggal, 
        kode_toko: item.sub_toko, 
        ecommerce: item.ecommerce,
        customer: item.customer,
        resi: item.resi,
        part_number: item.part_number,
        name: item.nama_pesanan,
        brand: item.brand,
        application: item.application,
        qty_keluar: item.qty_keluar,
        harga_satuan: item.harga_satuan,
        harga_total: item.harga_total,
        stock_ahir: newStock,
        tempo: 'LUNAS',
        // [UBAH] Tambahkan created_at dengan getWIBDate()
        created_at: getWIBDate().toISOString()
      };
      
      const { error: logErr } = await supabase.from(logTable).insert([logPayload]);
      if (logErr) {
        errors.push(`Gagal simpan log ${item.resi}: ${logErr.message}`);
        continue;
      }

      // 3. HAPUS dari Tabel SCAN RESI (bukan update, tapi delete)
      // Resi yang sudah diproses ke barang_keluar harus dihapus dari scan_resi
      const { error: scanDeleteErr } = await supabase
        .from(scanTable)
        .delete()
        .eq('resi', item.resi);
      
      if (scanDeleteErr) {
        console.warn(`Gagal hapus scan_resi untuk ${item.resi}:`, scanDeleteErr.message);
        // Tidak menggagalkan proses, hanya warning
      }

      // 4. Update Status di Tabel CSV
      if (csvTable) {
         await supabase
           .from(csvTable)
           .update({ status: 'processed' })
           .eq('resi', item.resi)
           .eq('part_number', item.part_number);
      }

      successCount++;
    } catch (e: any) {
      errors.push(`Error sistem pada ${item.resi}: ${e.message}`);
    }
  }

  return { success: errors.length === 0, processed: successCount, errors };
};

/**
 * existingResiMap: Map<resi_upper, { id: string, ecommerce: string, toko: string, isFromDB: boolean }>
 * Digunakan untuk mendapatkan ecommerce/toko dari scan aplikasi
 */
interface SkippedItemDetail {
  resi: string;
  order_id?: string;
  customer?: string;
  product_name?: string;
  reason: string;
}

export const saveCSVToResiItems = async (
  items: ParsedCSVItem[], 
  store: string | null,
  existingResiMap?: Map<string, { id: string, ecommerce: string, toko: string, isFromDB?: boolean }>
): Promise<{ success: boolean; message: string; count: number; skippedCount: number; skippedResis: string[]; updatedCount: number; skippedItems: SkippedItemDetail[]; updatedItems: Array<{resi: string, order_id?: string, customer?: string, product_name?: string, ecommerce?: string}> }> => {
  const tableName = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  
  if (!tableName) return { success: false, message: 'Toko tidak valid', count: 0, skippedCount: 0, skippedResis: [], updatedCount: 0, skippedItems: [], updatedItems: [] };
  if (!items || items.length === 0) return { success: false, message: 'Tidak ada data untuk disimpan', count: 0, skippedCount: 0, skippedResis: [], updatedCount: 0, skippedItems: [], updatedItems: [] };

  // Array untuk menyimpan item yang berhasil di-update
  const updatedItemsList: Array<{resi: string, order_id?: string, customer?: string, product_name?: string, ecommerce?: string}> = [];

  try {
    // Kumpulkan semua resi dan order_id untuk dicek
    const allResis = items.map(i => i.resi).filter(Boolean);
    const allOrderIds = items.map(i => i.order_id).filter(Boolean);
    const allToCheck = [...new Set([...allResis, ...allOrderIds])];
    
    // Cek apakah sudah ada di barang_keluar (sudah terjual/keluar)
    const existingInBarangKeluar = await checkExistingInBarangKeluar(allToCheck, store);
    
    // === LANGKAH BARU: Cek apakah resi sudah di-scan di Stage 1 ===
    // Hanya resi yang sudah scan Stage 1 yang boleh masuk ke resi_items
    const scanTable = getTableName(store);
    const { data: stage1Data } = await supabase
      .from(scanTable)
      .select('resi, no_pesanan')
      .eq('stage1_scanned', 'true');
    
    // Buat set untuk lookup cepat (UPPERCASE)
    const stage1ResiSet = new Set<string>();
    (stage1Data || []).forEach((row: any) => {
      if (row.resi) stage1ResiSet.add(String(row.resi).trim().toUpperCase());
      if (row.no_pesanan) stage1ResiSet.add(String(row.no_pesanan).trim().toUpperCase());
    });
    
    console.log(`[saveCSVToResiItems] Found ${stage1ResiSet.size} resi/no_pesanan in Stage 1`);
    console.log(`[saveCSVToResiItems] Stage 1 sample (first 10):`, [...stage1ResiSet].slice(0, 10));
    
    // Filter items: harus lolos barang_keluar DAN sudah scan Stage 1
    const skippedItems: ParsedCSVItem[] = [];
    const skippedNotScanned: ParsedCSVItem[] = [];
    const skippedItemsDetail: SkippedItemDetail[] = []; // Detail untuk modal
    
    const validItems = items.filter(item => {
      const resiUpper = (item.resi || '').trim().toUpperCase();
      const orderIdUpper = (item.order_id || '').trim().toUpperCase();
      
      // === SAFETY NET: Skip cancelled/unpaid orders (terutama untuk TikTok) ===
      // KECUALI "Pembatalan Diajukan" - ini TIDAK di-skip karena masih bisa diproses
      const orderStatus = (item.order_status || '').toLowerCase();
      
      // "Pembatalan Diajukan" / "Cancellation Requested" TIDAK di-skip
      const isPembatalanDiajukan = orderStatus.includes('pembatalan diajukan') || 
                                    orderStatus.includes('cancellation requested') ||
                                    orderStatus.includes('pengajuan pembatalan');
      
      // Hanya skip jika BATAL TOTAL (sudah dibatalkan), bukan sekedar "diajukan"
      const isCancelledOrder = (orderStatus.includes('batal') || orderStatus.includes('cancel')) && !isPembatalanDiajukan;
      const isUnpaidOrder = orderStatus.includes('belum dibayar') || 
                            orderStatus.includes('unpaid') || 
                            orderStatus.includes('menunggu bayar') ||
                            orderStatus.includes('menunggu pembayaran') ||
                            orderStatus.includes('awaiting payment');
      if (isCancelledOrder || isUnpaidOrder) {
        console.log(`[saveCSVToResiItems] ⏭️ Skip - cancelled/unpaid order: resi=${resiUpper}, status=${item.order_status}`);
        skippedItemsDetail.push({
          resi: item.resi,
          order_id: item.order_id,
          customer: item.customer,
          product_name: item.product_name,
          reason: `Status pesanan: ${item.order_status}`
        });
        return false;
      }
      
      // Jika resi atau order_id ada di barang_keluar, skip
      if (existingInBarangKeluar.has(resiUpper) || existingInBarangKeluar.has(orderIdUpper)) {
        skippedItems.push(item);
        skippedItemsDetail.push({
          resi: item.resi,
          order_id: item.order_id,
          customer: item.customer,
          product_name: item.product_name,
          reason: 'Sudah ada di Barang Keluar (sudah terjual)'
        });
        return false;
      }
      
      // Jika resi BELUM scan Stage 1, skip
      if (!stage1ResiSet.has(resiUpper) && !stage1ResiSet.has(orderIdUpper)) {
        console.log(`[saveCSVToResiItems] ⏭️ Skip - not in Stage 1: resi=${resiUpper}, order_id=${orderIdUpper}`);
        skippedNotScanned.push(item);
        skippedItemsDetail.push({
          resi: item.resi,
          order_id: item.order_id,
          customer: item.customer,
          product_name: item.product_name,
          reason: 'Belum di-scan di Stage 1'
        });
        return false;
      }
      
      console.log(`[saveCSVToResiItems] ✅ Valid - found in Stage 1: resi=${resiUpper}`);
      return true;
    });
    
    const skippedResis = [...new Set(skippedItems.map(i => i.resi))];
    const skippedNotScannedResis = [...new Set(skippedNotScanned.map(i => i.resi))];
    
    console.log(`[saveCSVToResiItems] Valid items: ${validItems.length}, Skipped (barang_keluar): ${skippedItems.length}, Skipped (not scanned): ${skippedNotScanned.length}`);
    
    if (validItems.length === 0) {
      let message = '';
      if (skippedItems.length > 0 && skippedNotScanned.length > 0) {
        message = `Tidak ada resi valid. ${skippedItems.length} sudah di Barang Keluar, ${skippedNotScanned.length} belum scan Stage 1.`;
      } else if (skippedItems.length > 0) {
        message = `Semua ${items.length} resi sudah ada di Barang Keluar (sudah terjual/keluar)!`;
      } else if (skippedNotScanned.length > 0) {
        message = `Semua ${items.length} resi belum di-scan di Stage 1!`;
      } else {
        message = 'Tidak ada data valid untuk disimpan.';
      }
      return { 
        success: false, 
        message, 
        count: 0, 
        skippedCount: skippedItems.length + skippedNotScanned.length,
        skippedResis: [...skippedResis, ...skippedNotScannedResis],
        updatedCount: 0,
        skippedItems: skippedItemsDetail
      };
    }

    // === LANGKAH 1: Cek SEMUA resi dari CSV ke database resi_items ===
    // Ambil semua resi dan order_id yang sudah ada di database untuk semua item yang valid
    const allValidResis = [...new Set(validItems.map(i => i.resi).filter(Boolean))];
    const allValidOrderIds = [...new Set(validItems.map(i => i.order_id).filter(Boolean))];
    const allToMatch = [...new Set([...allValidResis, ...allValidOrderIds])];
    
    // Query dengan case-insensitive menggunakan ilike untuk setiap resi
    // Karena .in() adalah case-sensitive, kita perlu query semua lalu filter manual
    // Tambahkan status dan part_number untuk cek apakah sudah "Ready"
    const { data: allExistingInDB } = await supabase
      .from(tableName)
      .select('id, resi, order_id, ecommerce, toko, status, part_number, customer');
    
    // Buat map untuk lookup cepat (UPPERCASE untuk case-insensitive)
    // Map by RESI dan juga by ORDER_ID untuk matching Shopee International
    const dbResiMap = new Map<string, { id: number, ecommerce: string, toko: string, isReady: boolean }>();
    const allToMatchUpper = new Set(allToMatch.map(r => r.trim().toUpperCase()));
    
    (allExistingInDB || []).forEach((row: any) => {
      const resiUpper = String(row.resi || '').trim().toUpperCase();
      const orderIdUpper = String(row.order_id || '').trim().toUpperCase();
      
      // Cek apakah sudah "Ready" - memiliki part_number dan customer yang valid
      const hasPartNumber = row.part_number && row.part_number.trim() !== '';
      const hasCustomer = row.customer && row.customer.trim() !== '' && row.customer !== '-';
      const isReady = hasPartNumber && hasCustomer;
      
      const rowData = {
        id: row.id,
        ecommerce: row.ecommerce,
        toko: row.toko,
        isReady: isReady
      };
      
      // Simpan ke map jika resi atau order_id ada di list yang kita cari
      if (resiUpper && allToMatchUpper.has(resiUpper)) {
        dbResiMap.set(resiUpper, rowData);
      }
      if (orderIdUpper && allToMatchUpper.has(orderIdUpper)) {
        dbResiMap.set(orderIdUpper, rowData);
      }
    });
    
    console.log(`[saveCSVToResiItems] Found ${dbResiMap.size} existing resi/order_id in resi_items from ${allToMatch.length} valid CSV items`);

    let updatedCount = 0;
    let insertedCount = 0;
    let skippedReadyCount = 0;

    // === LANGKAH 2: Proses setiap item - UPDATE jika sudah ada, INSERT jika baru ===
    for (const item of validItems) {
      const resiUpper = (item.resi || '').trim().toUpperCase();
      const orderIdUpper = (item.order_id || '').trim().toUpperCase();
      
      // Coba cari dengan resi, kalau tidak ada coba dengan order_id
      let existingInDB = dbResiMap.get(resiUpper);
      if (!existingInDB && orderIdUpper) {
        existingInDB = dbResiMap.get(orderIdUpper);
      }
      
      // Cek juga di existingResiMap (dari UI) untuk mendapatkan ecommerce/toko dari scan
      let scanData = existingResiMap?.get(resiUpper);
      if (!scanData && orderIdUpper) {
        scanData = existingResiMap?.get(orderIdUpper);
      }
      
      console.log(`[saveCSVToResiItems] Processing resi: ${item.resi}, order_id: ${item.order_id}, existingInDB: ${existingInDB ? 'YES (id=' + existingInDB.id + ', isReady=' + existingInDB.isReady + ')' : 'NO'}, scanData: ${scanData ? 'YES' : 'NO'}`);
      
      if (existingInDB) {
        // === RESI SUDAH ADA DI DATABASE ===
        
        // SKIP jika sudah Ready (sudah memiliki data lengkap)
        if (existingInDB.isReady) {
          console.log(`[saveCSVToResiItems] ⏭️ Skipped resi ${item.resi} - already Ready`);
          skippedReadyCount++;
          skippedItemsDetail.push({
            resi: item.resi,
            order_id: item.order_id,
            customer: item.customer,
            product_name: item.product_name,
            reason: 'Sudah Ready (data lengkap)'
          });
          continue;
        }
        
        // UPDATE hanya jika belum Ready
        // JANGAN ubah ecommerce dan toko - tetap dari data yang ada di DB
        // KECUALI untuk SHOPEE INSTAN/KILAT atau Shopee International (PH/MY/SG/INTL)
        const updatePayload: Record<string, any> = {
          order_id: item.order_id,
          status_pesanan: item.order_status,
          opsi_pengiriman: item.shipping_option,
          part_number: item.part_number,
          nama_produk: item.product_name,
          jumlah: item.quantity,
          total_harga_produk: item.total_price,
          customer: item.customer,
        };
        
        // Update ecommerce jika special case (Instan, Kilat, Sameday, atau International)
        const specialEcommerceLabels = [
          'SHOPEE INSTAN', 'KILAT INSTAN', 'SHOPEE SAMEDAY',
          'TIKTOK INSTAN',
          'SHOPEE PH', 'SHOPEE MY', 'SHOPEE SG', 'SHOPEE INTL'
        ];
        if (specialEcommerceLabels.includes(item.ecommerce)) {
          updatePayload.ecommerce = item.ecommerce;
          console.log(`[saveCSVToResiItems] 📦 Updating ecommerce to ${item.ecommerce} for resi ${item.resi}`);
        }
        
        console.log(`[saveCSVToResiItems] Updating resi ${item.resi} with id=${existingInDB.id}, payload:`, updatePayload);
        
        const { error: updateErr } = await supabase
          .from(tableName)
          .update(updatePayload)
          .eq('id', existingInDB.id);
        
        if (!updateErr) {
          updatedCount++;
          // Tambahkan ke list updated items
          updatedItemsList.push({
            resi: item.resi,
            order_id: item.order_id,
            customer: item.customer,
            product_name: item.product_name,
            ecommerce: item.ecommerce
          });
          console.log(`[saveCSVToResiItems] ✅ Updated resi: ${item.resi}`);
        } else {
          console.error(`[saveCSVToResiItems] ❌ Failed to update resi ${item.resi}:`, updateErr);
        }
      } else {
        // === RESI BELUM ADA DI DATABASE → INSERT BARU ===
        // Gunakan ecommerce/toko dari scan (jika ada) atau dari CSV
        let ecommerce = item.ecommerce;
        let toko = (item as any).sub_toko || store?.toUpperCase();
        
        // Cek apakah ecommerce dari CSV punya label khusus (INSTAN/SAMEDAY/KILAT)
        const hasSpecialLabel = ecommerce.includes('INSTAN') || 
                                ecommerce.includes('SAMEDAY') || 
                                ecommerce.includes('KILAT');
        
        if (scanData) {
          // Ada data dari scan
          // PENTING: Jika ecommerce CSV punya label khusus, PERTAHANKAN
          // Hanya ambil toko dari scan, tapi label ecommerce tetap dari CSV
          if (!hasSpecialLabel) {
            ecommerce = scanData.ecommerce;
          }
          toko = scanData.toko;
        }
        
        const insertPayload = {
          order_id: item.order_id,
          status_pesanan: item.order_status,
          resi: item.resi,
          opsi_pengiriman: item.shipping_option,
          part_number: item.part_number,
          nama_produk: item.product_name,
          jumlah: item.quantity,
          total_harga_produk: item.total_price,
          customer: item.customer,
          ecommerce: ecommerce,
          toko: toko,
          status: 'pending',
          created_at: getWIBDate().toISOString()
        };
        
        const { error: insertErr } = await supabase
          .from(tableName)
          .insert([insertPayload]);
        
        if (!insertErr) {
          insertedCount++;
          console.log(`[saveCSVToResiItems] Inserted new resi: ${item.resi}`);
        } else {
          console.error(`[saveCSVToResiItems] Failed to insert resi ${item.resi}:`, insertErr);
        }
      }
    }

    const skippedMsg = skippedResis.length > 0 
      ? ` (${skippedResis.length} resi di-skip karena sudah ada di Barang Keluar)`
      : '';
    
    const readyMsg = skippedReadyCount > 0
      ? `, ${skippedReadyCount} resi di-skip (sudah Ready)`
      : '';
    
    const updateMsg = updatedCount > 0 ? `, ${updatedCount} resi di-update` : '';

    return { 
      success: true, 
      message: `Data CSV berhasil disimpan ke database${updateMsg}${readyMsg}${skippedMsg}`, 
      count: insertedCount,
      skippedCount: skippedItems.length + skippedReadyCount,
      skippedResis,
      updatedCount,
      skippedItems: skippedItemsDetail,
      updatedItems: updatedItemsList
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
    return data?.id || null;
  } catch (err: any) {
    console.error('Insert gagal:', err);
    return null;
  }
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

    return { success: true };
  } catch (err: any) {
    console.error('Error insert alias:', err);
    return { success: false };
  }
};

/**
 * Hapus item dari scan_resi (Stage 1) setelah diproses ke barang_keluar
 */
export const deleteProcessedScanResi = async (
  store: string | null,
  resis: string[]
): Promise<{ success: boolean; deleted: number }> => {
  const table = getTableName(store);
  if (!table || resis.length === 0) return { success: false, deleted: 0 };

  let deletedCount = 0;

  for (const resi of resis) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('resi', resi);

      if (!error) deletedCount++;
    } catch (err) {
      console.warn('Delete scan_resi item gagal:', err);
    }
  }

  return { success: true, deleted: deletedCount };
};

/**
 * Hapus item dari resi_items setelah diproses
 */
export const deleteProcessedResiItems = async (
  store: string | null,
  items: Array<{ resi: string; part_number: string }>
): Promise<{ success: boolean; deleted: number }> => {
  const table = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  if (!table || items.length === 0) return { success: false, deleted: 0 };

  let deletedCount = 0;

  for (const item of items) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('resi', item.resi)
        .eq('part_number', item.part_number);

      if (!error) deletedCount++;
    } catch (err) {
      console.warn('Delete resi item gagal:', err);
    }
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

    return { success: true, message: 'Item berhasil dihapus' };
  } catch (err: any) {
    console.error('Delete resi item exception:', err);
    return { success: false, message: err.message || 'Gagal menghapus item' };
  }
};

/**
 * Hapus satu item dari scan_resi (Stage 1) berdasarkan ID
 * Digunakan saat user menghapus row di Stage 3 yang berasal dari Stage 1 scan
 */
export const deleteScanResiById = async (
  store: string | null,
  id: string | number
): Promise<{ success: boolean; message: string }> => {
  const table = getTableName(store);
  if (!table) return { success: false, message: 'Toko tidak valid' };

  try {
    // ID dari scan biasanya format "s1-123", perlu extract angkanya
    const dbId = String(id).startsWith('s1-') ? String(id).replace('s1-', '') : String(id);
    
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', dbId);

    if (error) {
      console.error('Delete scan_resi by ID gagal:', error);
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Item scan berhasil dihapus' };
  } catch (err: any) {
    console.error('Delete scan_resi exception:', err);
    return { success: false, message: err.message || 'Gagal menghapus item scan' };
  }
};