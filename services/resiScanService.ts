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

// Helper: Konversi Database (String) ke App (Boolean)
const mapToBoolean = (data: any[]) => {
  return data.map(item => ({
    ...item,
    // Paksa konversi ke boolean agar UI tidak error
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
    // Insert sebagai STRING 'true' (Sesuai tipe Text di DB)
    const insertData = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2),
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
    
    // Return sebagai boolean agar UI langsung update
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
    .eq('stage1_scanned', 'true') // Filter pakai string
    .order('stage1_scanned_at', { ascending: false })
    .limit(100);

  if (error) return [];
  
  // KONVERSI KE BOOLEAN SEBELUM DIKIRIM KE UI
  return mapToBoolean(data || []);
};

export const deleteResiStage1 = async (id: string, store: string | null) => {
  const table = getTableName(store);
  
  // Cek string 'true'
  const { data } = await supabase.from(table).select('stage2_verified').eq('id', id).single();
  
  if (data?.stage2_verified === 'true') {
    return { success: false, message: 'Tidak bisa dihapus, sudah masuk Stage 2!' };
  }

  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Resi dihapus.' };
};

// --- FUNGSI RESELLER (PENTING UNTUK STAGE 1) ---

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
  
  // Logic: Stage 1 'true' DAN Stage 2 BUKAN 'true'
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
      stage2_verified: 'true', // Update String
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
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('stage1_scanned_at', { ascending: false })
    .limit(100);
    
  if (error) {
    console.error("Error fetching history:", error);
    return [];
  }
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
    .select('resi, stage1_scanned, stage2_verified, status')
    .in('resi', resis);
  
  if (error) return [];
  // Return raw data is fine here, or map if needed by Stage 3
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

// AMBIL SEMUA PART UNTUK DROPDOWN
export const getAvailableParts = async (store: string | null) => {
  const table = getStockTable(store);
  const { data, error } = await supabase
    .from(table)
    .select('part_number')
    .order('part_number', { ascending: true });

  if (error) return [];
  return data?.map(d => d.part_number) || [];
};

export const processBarangKeluarBatch = async (items: any[], store: string | null) => {
  const scanTable = getTableName(store);
  const logTable = getBarangKeluarTable(store);
  const stockTable = getStockTable(store);
  
  let successCount = 0;
  let errors: string[] = [];

  for (const item of items) {
    try {
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
        tempo: 'LUNAS'
      };
      
      const { error: logErr } = await supabase.from(logTable).insert([logPayload]);
      if (logErr) {
        errors.push(`Gagal simpan log ${item.resi}: ${logErr.message}`);
        await supabase.from(stockTable).update({ quantity: stock.quantity }).eq('part_number', item.part_number);
        continue;
      }

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

      successCount++;
    } catch (e: any) {
      errors.push(`Error sistem pada ${item.resi}: ${e.message}`);
    }
  }

  return { success: errors.length === 0, processed: successCount, errors };
};