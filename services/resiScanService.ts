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
// STAGE 1: SCANNER GUDANG
// ============================================================================

export const scanResiStage1 = async (
  data: any,
  store: string | null
): Promise<{ success: boolean; message: string; data?: ResiScanStage }> => {
  try {
    const table = getTableName(store);
    const barangKeluarTable = getBarangKeluarTable(store);
    const resiClean = data.resi.trim().toUpperCase(); // Normalize to uppercase

    if (!resiClean) {
      return { success: false, message: 'Resi tidak boleh kosong!' };
    }

    // CHECK 1: Cek apakah resi sudah ada di Stage 1 (scan_resi)
    const { data: existingStage1, error: checkError1 } = await supabase
      .from(table)
      .select('id, resi')
      .ilike('resi', resiClean)
      .limit(1);

    if (checkError1) {
      console.error('Error checking stage1:', checkError1);
    }

    if (existingStage1 && existingStage1.length > 0) {
      return { 
        success: false, 
        message: `Resi "${resiClean}" sudah pernah di-scan sebelumnya!` 
      };
    }

    // CHECK 2: Cek apakah resi sudah ada di barang_keluar (sudah terjual/diproses)
    const { data: existingBarangKeluar, error: checkError2 } = await supabase
      .from(barangKeluarTable)
      .select('id, resi')
      .ilike('resi', resiClean)
      .limit(1);

    if (checkError2) {
      console.error('Error checking barang_keluar:', checkError2);
    }

    if (existingBarangKeluar && existingBarangKeluar.length > 0) {
      return { 
        success: false, 
        message: `Resi "${resiClean}" sudah diproses/terjual sebelumnya!` 
      };
    }

    const insertData = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      resi: resiClean,
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
    
    if (error) {
      // Handle duplicate key error from database constraint
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return { 
          success: false, 
          message: `Resi "${resiClean}" sudah pernah di-scan sebelumnya!` 
        };
      }
      throw error;
    }
    
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

// ============================================================================
// STAGE 1: BULK SCAN (SCAN MASAL)
// ============================================================================
export const scanResiStage1Bulk = async (
  items: Array<{
    resi: string;
    ecommerce: string;
    sub_toko: string;
    negara_ekspor?: string;
    scanned_by: string;
  }>,
  store: string | null
): Promise<{ success: boolean; message: string; inserted: number; skipped: number; duplicates: string[] }> => {
  try {
    const table = getTableName(store);
    const barangKeluarTable = getBarangKeluarTable(store);
    
    // Filter resi kosong dan duplikat dalam batch (normalize ke uppercase)
    const uniqueResis = new Map<string, typeof items[0]>();
    const batchDuplicates: string[] = [];
    
    for (const item of items) {
      const resiClean = item.resi.trim().toUpperCase();
      if (!resiClean) continue;
      
      if (uniqueResis.has(resiClean)) {
        batchDuplicates.push(resiClean);
      } else {
        uniqueResis.set(resiClean, { ...item, resi: resiClean });
      }
    }
    
    if (uniqueResis.size === 0) {
      return { success: false, message: 'Tidak ada resi valid untuk disimpan', inserted: 0, skipped: 0, duplicates: [] };
    }
    
    // Cek resi yang sudah ada di database Stage 1
    const resiList = Array.from(uniqueResis.keys());
    
    // Gunakan ilike untuk case-insensitive matching, atau query satu per satu
    const { data: existingStage1 } = await supabase
      .from(table)
      .select('resi')
      .or(resiList.map(r => `resi.ilike.${r}`).join(','));
    
    // Cek resi yang sudah ada di barang_keluar (sudah terjual)
    const { data: existingBarangKeluar } = await supabase
      .from(barangKeluarTable)
      .select('resi')
      .or(resiList.map(r => `resi.ilike.${r}`).join(','));
    
    // Normalize semua ke uppercase untuk perbandingan
    const existingResis = new Set([
      ...((existingStage1 || []).map((r: any) => (r.resi || '').toUpperCase())),
      ...((existingBarangKeluar || []).map((r: any) => (r.resi || '').toUpperCase()))
    ]);
    
    // Filter hanya resi yang belum ada
    const newItems: typeof items = [];
    const dbDuplicates: string[] = [];
    
    for (const [resi, item] of uniqueResis) {
      if (existingResis.has(resi)) {
        dbDuplicates.push(resi);
      } else {
        newItems.push(item);
      }
    }
    
    if (newItems.length === 0) {
      return { 
        success: true, 
        message: 'Semua resi sudah ada di database atau sudah terjual', 
        inserted: 0, 
        skipped: dbDuplicates.length + batchDuplicates.length,
        duplicates: [...dbDuplicates, ...batchDuplicates]
      };
    }
    
    // Siapkan payload untuk insert
    const payload = newItems.map(item => ({
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
    
    const { error } = await supabase
      .from(table)
      .insert(payload);
    
    if (error) throw error;
    
    const allDuplicates = [...dbDuplicates, ...batchDuplicates];
    let message = `Berhasil menyimpan ${newItems.length} resi`;
    if (allDuplicates.length > 0) {
      message += `, ${allDuplicates.length} dilewati (duplikat)`;
    }
    
    return { 
      success: true, 
      message,
      inserted: newItems.length,
      skipped: allDuplicates.length,
      duplicates: allDuplicates
    };
  } catch (error: any) {
    console.error('Error bulk scanning stage 1:', error);
    return { success: false, message: error.message || 'Gagal scan masal', inserted: 0, skipped: 0, duplicates: [] };
  }
};

export const getResiStage1List = async (store: string | null) => {
  const table = getTableName(store);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('stage1_scanned', 'true') 
    .order('stage1_scanned_at', { ascending: false })
    .limit(100);

  if (error) return [];
  return mapToBoolean(data || []);
};

export const deleteResiStage1 = async (id: string, store: string | null) => {
  const table = getTableName(store);
  const resiItemsTable = store === 'mjm' ? 'resi_items_mjm' : 'resi_items_bjw';
  
  // Ambil data resi terlebih dahulu untuk mendapatkan nomor resi
  const { data: resiData } = await supabase.from(table).select('resi, stage2_verified').eq('id', id).single();
  
  if (resiData?.stage2_verified === 'true') {
    return { success: false, message: 'Tidak bisa dihapus, sudah masuk Stage 2!' };
  }

  const resiNumber = resiData?.resi;

  // Hapus dari tabel scan_resi
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { success: false, message: error.message };

  // Hapus juga data terkait di resi_items (CSV Stage 3) jika ada
  if (resiNumber) {
    const { error: resiItemsError } = await supabase
      .from(resiItemsTable)
      .delete()
      .eq('resi', resiNumber)
      .eq('status', 'pending'); // Hanya hapus yang masih pending, jangan yang sudah processed

    if (resiItemsError) {
      console.warn('Warning: Gagal menghapus data resi_items terkait:', resiItemsError.message);
    }
  }

  return { success: true, message: 'Resi dan data terkait berhasil dihapus.' };
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

// ============================================================================
// STAGE 2: BULK VERIFY (VERIFIKASI MASAL)
// ============================================================================
export const verifyResiStage2Bulk = async (
  resiList: string[],
  verified_by: string,
  store: string | null
): Promise<{ success: boolean; message: string; verified: number; failed: number; failedResis: string[] }> => {
  const table = getTableName(store);
  
  // Filter resi kosong dan duplikat
  const uniqueResis = [...new Set(resiList.map(r => r.trim().toUpperCase()).filter(r => r.length > 0))];
  
  if (uniqueResis.length === 0) {
    return { success: false, message: 'Tidak ada resi valid untuk diverifikasi', verified: 0, failed: 0, failedResis: [] };
  }
  
  let verifiedCount = 0;
  let failedCount = 0;
  const failedResis: string[] = [];
  
  for (const resi of uniqueResis) {
    // Cek apakah resi ada di Stage 1 dan belum diverifikasi Stage 2
    const { data: rows } = await supabase
      .from(table)
      .select('id, stage2_verified')
      .ilike('resi', resi)
      .eq('stage1_scanned', 'true');
    
    if (!rows || rows.length === 0) {
      // Resi tidak ditemukan atau belum scan Stage 1
      failedResis.push(resi);
      failedCount++;
      continue;
    }
    
    // Cek apakah sudah diverifikasi
    const unverified = rows.filter(r => r.stage2_verified !== 'true');
    if (unverified.length === 0) {
      // Sudah diverifikasi sebelumnya
      failedResis.push(resi);
      failedCount++;
      continue;
    }
    
    // Update ke Stage 2
    const ids = unverified.map(r => r.id);
    const { error } = await supabase
      .from(table)
      .update({
        stage2_verified: 'true',
        stage2_verified_at: getWIBDate().toISOString(),
        stage2_verified_by: verified_by,
        status: 'stage2'
      })
      .in('id', ids);
    
    if (error) {
      failedResis.push(resi);
      failedCount++;
    } else {
      verifiedCount++;
    }
  }
  
  let message = `Berhasil verifikasi ${verifiedCount} resi`;
  if (failedCount > 0) {
    message += `, ${failedCount} gagal (tidak ditemukan/sudah diverifikasi)`;
  }
  
  return { 
    success: verifiedCount > 0, 
    message, 
    verified: verifiedCount, 
    failed: failedCount, 
    failedResis 
  };
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
  
  // Query dengan OR: resi IN (...) OR no_pesanan IN (...)
  const { data, error } = await supabase
    .from(table)
    .select('resi, no_pesanan, stage1_scanned, stage2_verified, status, ecommerce, sub_toko')
    .or(`resi.in.(${resiOrOrders.map(r => `"${r}"`).join(',')}),no_pesanan.in.(${resiOrOrders.map(r => `"${r}"`).join(',')})`);
  
  if (error) {
    console.error('checkResiOrOrderStatus error:', error);
    return [];
  }
  return data || [];
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
    .order('created_at', { ascending: false });

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
  store: string | null
): Promise<{ success: boolean; message: string; count: number; skipped: number }> => {
  const tableName = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  
  if (!tableName) return { success: false, message: 'Toko tidak valid', count: 0, skipped: 0 };
  if (!items || items.length === 0) return { success: false, message: 'Tidak ada data untuk disimpan', count: 0, skipped: 0 };

  try {
    // Ambil semua resi dan order_id unik dari items yang akan diimport
    const resiList = [...new Set(items.map(i => i.resi).filter(Boolean))];
    const orderIdList = [...new Set(items.map(i => i.order_id).filter(Boolean))];

    // Cek data yang SUDAH DIPROSES di database (status = 'processed')
    // Item pending boleh di-replace, item processed tidak boleh di-import ulang
    const { data: processedData } = await supabase
      .from(tableName)
      .select('resi, order_id, nama_produk')
      .eq('status', 'processed')
      .or(`resi.in.(${resiList.map(r => `"${r}"`).join(',')}),order_id.in.(${orderIdList.map(o => `"${o}"`).join(',')})`);

    // Buat set key untuk cek duplikat: resi + order_id + nama_produk (normalized)
    // Hanya item yang sudah processed yang dianggap duplikat
    const processedKeys = new Set<string>();
    (processedData || []).forEach((row: any) => {
      const namaNormalized = (row.nama_produk || '').toLowerCase().trim();
      const key = `${row.resi || ''}||${row.order_id || ''}||${namaNormalized}`;
      processedKeys.add(key);
    });

    // Hapus data pending yang akan di-replace dengan data baru
    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .in('resi', resiList)
      .eq('status', 'pending');

    if (deleteError) {
      console.warn("Warning hapus data pending lama:", deleteError.message);
    }

    // Filter items: skip yang sudah processed, sisanya bisa diimport
    const newItems: ParsedCSVItem[] = [];
    let skippedCount = 0;
    const batchKeys = new Set<string>(); // Untuk cek duplikat dalam batch yang sama

    for (const item of items) {
      const namaNormalized = (item.product_name || '').toLowerCase().trim();
      const key = `${item.resi || ''}||${item.order_id || ''}||${namaNormalized}`;
      
      // Skip jika sudah diproses sebelumnya
      if (processedKeys.has(key)) {
        skippedCount++;
        continue;
      }
      
      // Skip jika duplikat dalam batch yang sama
      if (batchKeys.has(key)) {
        skippedCount++;
        continue;
      }
      
      batchKeys.add(key);
      newItems.push(item);
    }

    if (newItems.length === 0) {
      return { 
        success: true, 
        message: `Semua ${skippedCount} item sudah pernah diproses sebelumnya`, 
        count: 0, 
        skipped: skippedCount 
      };
    }

    const payload = newItems.map(item => {
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

    const { error } = await supabase
      .from(tableName)
      .insert(payload); 

    if (error) {
      console.error('Error saving CSV to DB:', error);
      throw error;
    }

    let message = `Berhasil import ${payload.length} item baru`;
    if (skippedCount > 0) {
      message += `, ${skippedCount} item dilewati (sudah diproses)`;
    }

    return { success: true, message, count: payload.length, skipped: skippedCount };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menyimpan data CSV', count: 0, skipped: 0 };
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