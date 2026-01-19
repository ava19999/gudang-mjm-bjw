// FILE: services/resiScanService.ts
import { supabase } from './supabaseClient';
import { ResiScanStage, ResiItem, ResellerMaster } from '../types';

// ============================================================================
// HELPER: Table Name Selector
// ============================================================================
const getTableName = (store: string | null) => 
  store === 'mjm' ? 'scan_resi_mjm' : 'scan_resi_bjw';

const getBarangKeluarTable = (store: string | null) => 
  store === 'mjm' ? 'barang_keluar_mjm' : 'barang_keluar_bjw';

const getStockTable = (store: string | null) => 
  store === 'mjm' ? 'base_mjm' : 'base_bjw';

// ============================================================================
// STAGE 1: SCANNER GUDANG
// ============================================================================

export const scanResiStage1 = async (
  data: any,
  store: string | null
): Promise<{ success: boolean; message: string; data?: ResiScanStage }> => {
  try {
    const table = getTableName(store);
    
    // FIX: stage1_scanned dikirim sebagai STRING 'true' (sesuai tipe Text di DB)
    const insertData = {
      resi: data.resi,
      ecommerce: data.ecommerce,
      sub_toko: data.sub_toko,
      negara_ekspor: data.negara_ekspor || null,
      tanggal: new Date().toISOString(),
      stage1_scanned: 'true', 
      stage1_scanned_at: new Date().toISOString(),
      stage1_scanned_by: data.scanned_by,
      status: 'stage1'
    };
    
    const { data: inserted, error } = await supabase
      .from(table)
      .insert([insertData])
      .select()
      .single();
    
    if (error) throw error;
    
    return { success: true, message: 'Resi berhasil di-scan!', data: inserted };
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
    .eq('stage1_scanned', 'true') // FIX: Filter pakai string 'true'
    .order('stage1_scanned_at', { ascending: false })
    .limit(100);

  if (error) return [];
  return data || [];
};

export const deleteResiStage1 = async (id: string, store: string | null) => {
  const table = getTableName(store);
  
  // FIX: Cek string 'true' untuk validasi hapus
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
  
  // FIX: Logic filter text (Stage 1 'true' DAN Stage 2 BUKAN 'true')
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('stage1_scanned', 'true')
    .or('stage2_verified.is.null,stage2_verified.neq.true')
    .order('stage1_scanned_at', { ascending: false });
    
  if (error) return [];
  return data || [];
};

export const verifyResiStage2 = async (
  data: { resi: string, verified_by: string },
  store: string | null
): Promise<{ success: boolean; message: string }> => {
  const table = getTableName(store);
  const { resi, verified_by } = data;

  // 1. Cari resi valid (Stage 1 'true', Stage 2 belum)
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

  // 2. Update status (Set ke STRING 'true')
  const ids = rows.map(r => r.id);
  const { error } = await supabase
    .from(table)
    .update({
      stage2_verified: 'true',
      stage2_verified_at: new Date().toISOString(),
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
  // Sort by stage1_scanned_at karena created_at mungkin tidak ada di view tertentu
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('stage1_scanned_at', { ascending: false })
    .limit(100);
    
  if (error) {
    console.error("Error fetching history:", error);
    return [];
  }
  return data || [];
};

export const getPendingStage3List = async (store: string | null) => {
  const table = getTableName(store);
  
  // FIX: Ambil yang Stage 2 'true' DAN status BELUM 'completed'
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('stage2_verified', 'true')
    .neq('status', 'completed')
    .order('stage2_verified_at', { ascending: false });

  if (error) return [];
  return data || [];
};

export const checkResiStatus = async (resis: string[], store: string | null) => {
  const table = getTableName(store);
  if (resis.length === 0) return [];
  
  const { data, error } = await supabase
    .from(table)
    .select('resi, stage1_scanned, stage2_verified, status')
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

// --- PROSES INTI: INPUT KE BARANG KELUAR & UPDATE RESI ---
export const processBarangKeluarBatch = async (items: any[], store: string | null) => {
  const scanTable = getTableName(store);
  const logTable = getBarangKeluarTable(store);
  const stockTable = getStockTable(store);
  
  let successCount = 0;
  let errors: string[] = [];

  for (const item of items) {
    try {
      // 1. Cek Stok
      const { data: stock } = await supabase
        .from(stockTable)
        .select('quantity')
        .eq('part_number', item.part_number)
        .single();
        
      if (!stock || stock.quantity < item.qty_keluar) {
        errors.push(`Stok ${item.part_number} Habis/Kurang (Sisa: ${stock?.quantity || 0})`);
        continue;
      }

      // 2. Potong Stok
      const newStock = stock.quantity - item.qty_keluar;
      const { error: stockErr } = await supabase
        .from(stockTable)
        .update({ quantity: newStock })
        .eq('part_number', item.part_number);

      if (stockErr) {
        errors.push(`Gagal update stok ${item.part_number}: ${stockErr.message}`);
        continue;
      }

      // 3. Log Barang Keluar
      // FIX: Hapus order_id karena kolom tidak ada di DB
      const logPayload = {
        tanggal: item.tanggal, 
        kode_toko: item.sub_toko, 
        ecommerce: item.ecommerce,
        customer: item.customer,
        resi: item.resi,
        // order_id: DIHAPUS (Tidak ada kolom)
        part_number: item.part_number,
        name: item.nama_pesanan,
        brand: item.brand,
        application: item.application,
        qty_keluar: item.qty_keluar,
        harga_satuan: item.harga_satuan,
        harga_total: item.harga_total,
        stock_ahir: newStock,
        tempo: 'LUNAS'
      };
      
      const { error: logErr } = await supabase.from(logTable).insert([logPayload]);
      if (logErr) {
        errors.push(`Gagal simpan log ${item.resi}: ${logErr.message}`);
        // Rollback stok manual
        await supabase.from(stockTable).update({ quantity: stock.quantity }).eq('part_number', item.part_number);
        continue;
      }

      // 4. Update Status Resi di Tabel Scan
      // FIX: Update status='completed' (bukan stage3_completed)
      const { data: pendingRows } = await supabase
        .from(scanTable)
        .select('id')
        .eq('resi', item.resi)
        .neq('status', 'completed')
        .limit(1); 
      
      if (pendingRows && pendingRows.length > 0) {
        const updateData: any = {
            status: 'completed', // Penanda selesai
            part_number: item.part_number,
            barang: item.nama_pesanan, // Nama kolom: barang
            qty_out: item.qty_keluar,
            total_harga: item.harga_total,
            customer: item.customer
        };

        // Coba simpan No Pesanan jika berupa Angka (karena tipe DB numeric)
        const numOrder = Number(item.order_id);
        if (!isNaN(numOrder) && item.order_id) {
            updateData.no_pesanan = numOrder;
        }

        await supabase
          .from(scanTable)
          .update(updateData)
          .eq('id', pendingRows[0].id);
      }

      successCount++;
    } catch (e: any) {
      errors.push(`Error sistem pada ${item.resi}: ${e.message}`);
    }
  }

  return { success: errors.length === 0, processed: successCount, errors };
};