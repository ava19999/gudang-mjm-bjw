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
    const normalized = resiOrOrders
      .map(r => (r || '').trim().toUpperCase())
      .filter(r => r !== '' && r !== '-');
    
    if (normalized.length === 0) return new Set();
    
    const foundSet = new Set<string>();
    
    // Query KEDUA tabel barang_keluar (mjm dan bjw) untuk memastikan
    // karena data bisa ada di salah satu atau kedua tabel
    const tables = ['barang_keluar_mjm', 'barang_keluar_bjw'];
    
    for (const table of tables) {
      // Query dengan .in() untuk matching langsung - lebih efisien
      // Gunakan ilike untuk case-insensitive matching
      const { data, error } = await supabase
        .from(table)
        .select('resi')
        .in('resi', normalized);
      
      if (!error && data) {
        data.forEach((d: any) => {
          if (d.resi) {
            foundSet.add(d.resi.trim().toUpperCase());
          }
        });
      }
      
      // Juga cek dengan lowercase version (case-insensitive)
      const lowerNormalized = normalized.map(r => r.toLowerCase());
      const { data: dataLower, error: errorLower } = await supabase
        .from(table)
        .select('resi')
        .in('resi', lowerNormalized);
      
      if (!errorLower && dataLower) {
        dataLower.forEach((d: any) => {
          if (d.resi) {
            foundSet.add(d.resi.trim().toUpperCase());
          }
        });
      }
      
      // Cek juga dengan original case
      const { data: dataOrig, error: errorOrig } = await supabase
        .from(table)
        .select('resi')
        .in('resi', resiOrOrders.map(r => (r || '').trim()).filter(r => r !== ''));
      
      if (!errorOrig && dataOrig) {
        dataOrig.forEach((d: any) => {
          if (d.resi) {
            foundSet.add(d.resi.trim().toUpperCase());
          }
        });
      }
    }
    
    console.log(`[checkExistingInBarangKeluar] Checked ${normalized.length} resi, found ${foundSet.size} in barang_keluar`);
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
    const { data: existing } = await supabase
      .from(table)
      .select('id, resi')
      .eq('resi', data.resi)
      .limit(1);
    
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
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('stage1_scanned', 'true') 
    .order('stage1_scanned_at', { ascending: false })
    .limit(500);

  if (error) return [];
  return mapToBoolean(data || []);
};

// Ambil semua resi Stage 1 yang belum completed (untuk Stage 3)
export const getAllPendingStage1Resi = async (store: string | null) => {
  const table = getTableName(store);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('stage1_scanned', 'true')
    .neq('status', 'completed')
    .order('stage1_scanned_at', { ascending: false })
    .limit(500);

  if (error) return [];
  
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
    const { error: updateErr } = await supabase
      .from(table)
      .update({ status: 'completed' })
      .in('id', soldResiIds);
    
    if (updateErr) {
      console.error('Error auto-updating sold resi status:', updateErr);
    } else {
      console.log(`[getAllPendingStage1Resi] Successfully marked ${soldResiIds.length} resi as completed`);
    }
  }
  
  return filteredData;
};

export const deleteResiStage1 = async (id: string, store: string | null) => {
  const table = getTableName(store);
  const { data } = await supabase.from(table).select('stage2_verified').eq('id', id).single();
  
  if (data?.stage2_verified === 'true') {
    return { success: false, message: 'Tidak bisa dihapus, sudah masuk Stage 2!' };
  }

  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Resi dihapus.' };
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

/**
 * Get unique reseller names from barang_keluar table
 * Mengambil dari field kode_toko dimana ecommerce = 'RESELLER'
 * Ini sama dengan sumber data yang digunakan di menu Reseller (ResellerView)
 */
export const getResellerNamesFromBarangKeluar = async (store: string | null): Promise<string[]> => {
  try {
    const allNames: string[] = [];
    
    const fetchFromTable = async (table: string): Promise<string[]> => {
      const { data, error } = await supabase
        .from(table)
        .select('kode_toko')
        .eq('ecommerce', 'RESELLER')
        .not('kode_toko', 'is', null);

      if (error) {
        console.error(`Error fetching reseller names from ${table}:`, error);
        return [];
      }

      return (data || []).map((d: any) => d.kode_toko).filter(Boolean);
    };
    
    // Ambil dari kedua toko untuk daftar reseller yang lengkap
    if (store === 'mjm') {
      const names = await fetchFromTable('barang_keluar_mjm');
      allNames.push(...names);
    } else if (store === 'bjw') {
      const names = await fetchFromTable('barang_keluar_bjw');
      allNames.push(...names);
    } else {
      // Default: ambil dari kedua tabel
      const [mjmNames, bjwNames] = await Promise.all([
        fetchFromTable('barang_keluar_mjm'),
        fetchFromTable('barang_keluar_bjw')
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

export const getAvailableParts = async (store: string | null): Promise<{part_number: string, name: string}[]> => {
  const table = getStockTable(store);
  const { data, error } = await supabase
    .from(table)
    .select('part_number, name')
    .order('part_number', { ascending: true });

  if (error) return [];
  return data?.map(d => ({ part_number: d.part_number, name: d.name || '' })) || [];
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
  
  if (!data || data.length === 0) return [];
  
  // ===== FILTER: Buang resi yang sudah ada di barang_keluar (sudah terjual) =====
  const allResis = data.map((d: any) => d.resi).filter(Boolean);
  const allOrderIds = data.map((d: any) => d.order_id).filter(Boolean);
  const allToCheck = [...new Set([...allResis, ...allOrderIds])];
  
  const existingInBarangKeluar = await checkExistingInBarangKeluar(allToCheck, store);
  
  // Jika ada resi yang sudah terjual, update status menjadi 'processed' - AWAIT agar selesai
  const soldResis: string[] = [];
  const filteredData = data.filter((item: any) => {
    const resiUpper = (item.resi || '').trim().toUpperCase();
    const orderIdUpper = (item.order_id || '').trim().toUpperCase();
    
    if (existingInBarangKeluar.has(resiUpper) || existingInBarangKeluar.has(orderIdUpper)) {
      soldResis.push(item.resi);
      return false; // Exclude dari hasil
    }
    return true;
  });
  
  // Update status resi yang sudah terjual ke 'processed' - AWAIT agar selesai
  if (soldResis.length > 0) {
    console.log(`[fetchPendingCSVItems] Auto-marking ${soldResis.length} resi as processed (already in barang_keluar):`, soldResis);
    const { error: updateErr } = await supabase
      .from(table)
      .update({ status: 'processed' })
      .in('resi', soldResis);
    
    if (updateErr) {
      console.error('Error auto-updating sold resi status:', updateErr);
    } else {
      console.log(`[fetchPendingCSVItems] Successfully marked ${soldResis.length} resi as processed`);
    }
  }
  
  return filteredData;
};

// Helper: Cek apakah item ada di KILAT prestock (sudah dikirim ke gudang Shopee)
const checkKilatPrestock = async (partNumber: string, qty: number, store: string | null): Promise<{
  isKilat: boolean;
  kilatId?: string;
  qtySisa?: number;
}> => {
  const prestockTable = store === 'mjm' ? 'kilat_prestock_mjm' : 'kilat_prestock_bjw';
  
  try {
    const { data } = await supabase
      .from(prestockTable)
      .select('id, qty_kirim, qty_terjual')
      .eq('part_number', partNumber)
      .in('status', ['MENUNGGU_TERJUAL', 'SEBAGIAN_TERJUAL'])
      .order('tanggal_kirim', { ascending: true }) // FIFO
      .limit(1);
    
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
    const { data: kilat } = await supabase
      .from(prestockTable)
      .select('*')
      .eq('id', kilatId)
      .single();
    
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
  const csvTable = store === 'mjm' ? 'resi_items_mjm' : 'resi_items_bjw';
  
  let successCount = 0;
  let errors: string[] = [];

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
        
        // Get current stock untuk logging (tanpa mengurangi)
        const { data: stock } = await supabase
          .from(stockTable)
          .select('quantity')
          .eq('part_number', item.part_number)
          .single();
        newStock = stock?.quantity || 0;
      } else {
        // Normal flow: Cek & Potong Stok
        const { data: stock } = await supabase
          .from(stockTable)
          .select('quantity')
          .eq('part_number', item.part_number)
          .single();
          
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
      const { data: pendingRows } = await supabase
        .from(scanTable)
        .select('id')
        .eq('resi', item.resi)
        .neq('status', 'completed')
        .limit(1); 
      
      if (pendingRows && pendingRows.length > 0) {
        const updateData: any = {
            status: 'completed',
            part_number: item.part_number,
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
          .eq('id', pendingRows[0].id);
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
      const { data: scannedData } = await supabase
        .from(scanTable)
        .select('resi, no_pesanan')
        .in('resi', allToCheck);
      
      // Cek juga dengan no_pesanan untuk instant/sameday
      const { data: scannedByOrder } = await supabase
        .from(scanTable)
        .select('resi, no_pesanan')
        .in('no_pesanan', allToCheck);
      
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
      const { data: existingRows } = await supabase
        .from(tableName)
        .select('id, resi, ecommerce, toko')
        .in('resi', resiList);
      
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
    const { data, error } = await supabase
      .from(table)
      .delete()
      .in('resi', resiList)
      .select('id');

    if (error) {
      console.error('Delete processed scan resi gagal:', error);
      return { success: false, deleted: 0 };
    }

    return { success: true, deleted: data?.length || 0 };
  } catch (err: any) {
    console.error('Delete processed scan resi exception:', err);
    return { success: false, deleted: 0 };
  }
};