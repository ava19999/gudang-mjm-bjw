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
  const { data } = await supabase.from(table).select('stage2_verified').eq('id', id).single();
  
  if (data?.stage2_verified === 'true') {
    return { success: false, message: 'Tidak bisa dihapus, sudah masuk Stage 2!' };
  }

  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Resi dihapus.' };
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
    .select('resi, stage1_scanned, stage2_verified, status, ecommerce, sub_toko')
    .in('resi', resis);
  
  if (error) return [];
  return data || [];
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
): Promise<{ success: boolean; message: string; count: number }> => {
  const tableName = store === 'mjm' ? 'resi_items_mjm' : (store === 'bjw' ? 'resi_items_bjw' : null);
  
  if (!tableName) return { success: false, message: 'Toko tidak valid', count: 0 };
  if (!items || items.length === 0) return { success: false, message: 'Tidak ada data untuk disimpan', count: 0 };

  try {
    const resiList = [...new Set(items.map(i => i.resi))];

    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .in('resi', resiList)
      .eq('status', 'pending');

    if (deleteError) {
      console.warn("Warning hapus data lama:", deleteError.message);
    }

    const payload = items.map(item => {
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

    return { success: true, message: 'Data CSV berhasil disimpan ke database', count: payload.length };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menyimpan data CSV', count: 0 };
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