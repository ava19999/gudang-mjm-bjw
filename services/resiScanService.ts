// FILE: services/resiScanService.ts
// Service for 3-Stage Receipt Scanning System

import { supabase } from './supabaseClient';
import {
  ResiScanStage,
  ResiItem,
  PartSubstitusi,
  ResellerMaster,
  EcommercePlatform,
  SubToko,
  NegaraEkspor,
  Stage1ScanData,
  Stage2VerifyData,
  Stage3CompleteData,
  ParsedCSVItem
} from '../types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getResiTableName = (store: string | null | undefined): string => {
  if (store === 'mjm') return 'scan_resi_mjm';
  if (store === 'bjw') return 'scan_resi_bjw';
  throw new Error('Invalid store specified');
};

const getResiItemsTableName = (store: string | null | undefined): string => {
  if (store === 'mjm') return 'resi_items_mjm';
  if (store === 'bjw') return 'resi_items_bjw';
  throw new Error('Invalid store specified');
};

const getBarangKeluarTableName = (store: string | null | undefined): string => {
  if (store === 'mjm') return 'barang_keluar_mjm';
  if (store === 'bjw') return 'barang_keluar_bjw';
  throw new Error('Invalid store specified');
};

const getBaseTableName = (store: string | null | undefined): string => {
  if (store === 'mjm') return 'base_mjm';
  if (store === 'bjw') return 'base_bjw';
  throw new Error('Invalid store specified');
};

// ============================================================================
// STAGE 1 FUNCTIONS (Scanner Gudang)
// ============================================================================

/**
 * Scan receipt at Stage 1
 */
export const scanResiStage1 = async (
  data: Stage1ScanData,
  store: string | null
): Promise<{ success: boolean; message: string; data?: ResiScanStage }> => {
  try {
    const tableName = getResiTableName(store);
    
    // Check if resi already exists
    const { data: existing } = await supabase
      .from(tableName)
      .select('*')
      .eq('resi', data.resi)
      .maybeSingle();
    
    if (existing) {
      return { 
        success: false, 
        message: 'Resi sudah pernah di-scan sebelumnya!' 
      };
    }
    
    // Insert new resi
    const insertData: any = {
      id: crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now()),
      resi: data.resi,
      ecommerce: data.ecommerce,
      sub_toko: data.sub_toko,
      negara_ekspor: data.negara_ekspor || null,
      tanggal: new Date().toISOString(),
      stage1_scanned: true,
      stage1_scanned_at: new Date().toISOString(),
      stage1_scanned_by: data.scanned_by,
      status: 'stage1'
    };
    
    const { data: inserted, error } = await supabase
      .from(tableName)
      .insert([insertData])
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      success: true,
      message: 'Resi berhasil di-scan!',
      data: inserted
    };
  } catch (error: any) {
    console.error('Error scanning resi stage 1:', error);
    return {
      success: false,
      message: error.message || 'Gagal menyimpan data resi'
    };
  }
};

/**
 * Delete receipt from Stage 1
 */
export const deleteResiStage1 = async (
  resiId: string,
  store: string | null
): Promise<{ success: boolean; message: string }> => {
  try {
    const tableName = getResiTableName(store);
    
    // Check if resi has progressed beyond stage 1
    const { data: resi } = await supabase
      .from(tableName)
      .select('stage2_verified, stage3_completed')
      .eq('id', resiId)
      .single();
    
    if (resi?.stage2_verified || resi?.stage3_completed) {
      return {
        success: false,
        message: 'Tidak bisa dihapus! Resi sudah diproses di stage selanjutnya.'
      };
    }
    
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', resiId);
    
    if (error) throw error;
    
    return {
      success: true,
      message: 'Resi berhasil dihapus'
    };
  } catch (error: any) {
    console.error('Error deleting resi:', error);
    return {
      success: false,
      message: error.message || 'Gagal menghapus resi'
    };
  }
};

/**
 * Get list of receipts for Stage 1
 */
export const getResiStage1List = async (
  store: string | null,
  filters?: {
    ecommerce?: EcommercePlatform;
    sub_toko?: SubToko;
    search?: string;
  }
): Promise<ResiScanStage[]> => {
  try {
    const tableName = getResiTableName(store);
    let query = supabase
      .from(tableName)
      .select('*')
      .eq('stage1_scanned', true);
    
    if (filters?.ecommerce) {
      query = query.eq('ecommerce', filters.ecommerce);
    }
    
    if (filters?.sub_toko) {
      query = query.eq('sub_toko', filters.sub_toko);
    }
    
    if (filters?.search) {
      query = query.ilike('resi', `%${filters.search}%`);
    }
    
    const { data, error } = await query.order('tanggal', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error: any) {
    console.error('Error fetching stage 1 list:', error);
    return [];
  }
};

// ============================================================================
// STAGE 2 FUNCTIONS (Packing Verification)
// ============================================================================

/**
 * Verify receipt at Stage 2 using camera scan
 */
export const verifyResiStage2 = async (
  data: Stage2VerifyData,
  store: string | null
): Promise<{ success: boolean; message: string; data?: ResiScanStage }> => {
  try {
    const tableName = getResiTableName(store);
    
    // Find resi by resi number
    const { data: existing } = await supabase
      .from(tableName)
      .select('*')
      .eq('resi', data.resi)
      .maybeSingle();
    
    if (!existing) {
      return {
        success: false,
        message: 'Resi tidak ditemukan! Belum di-scan di Stage 1.'
      };
    }
    
    if (!existing.stage1_scanned) {
      return {
        success: false,
        message: 'Resi belum di-scan di Stage 1!'
      };
    }
    
    if (existing.stage2_verified) {
      return {
        success: false,
        message: 'Resi sudah diverifikasi sebelumnya!'
      };
    }
    
    // Update to stage 2
    const { data: updated, error } = await supabase
      .from(tableName)
      .update({
        stage2_verified: true,
        stage2_verified_at: new Date().toISOString(),
        stage2_verified_by: data.verified_by,
        status: 'stage2'
      })
      .eq('id', existing.id)
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      success: true,
      message: 'Resi berhasil diverifikasi!',
      data: updated
    };
  } catch (error: any) {
    console.error('Error verifying resi stage 2:', error);
    return {
      success: false,
      message: error.message || 'Gagal memverifikasi resi'
    };
  }
};

/**
 * Get list of receipts pending Stage 2 verification
 */
export const getPendingStage2List = async (
  store: string | null
): Promise<ResiScanStage[]> => {
  try {
    const tableName = getResiTableName(store);
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('stage1_scanned', true)
      .eq('stage2_verified', false)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error: any) {
    console.error('Error fetching pending stage 2 list:', error);
    return [];
  }
};

/**
 * Get list of verified Stage 2 receipts
 */
export const getVerifiedStage2List = async (
  store: string | null
): Promise<ResiScanStage[]> => {
  try {
    const tableName = getResiTableName(store);
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('stage2_verified', true)
      .order('stage2_verified_at', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error: any) {
    console.error('Error fetching verified stage 2 list:', error);
    return [];
  }
};

// ============================================================================
// STAGE 3 FUNCTIONS (Data Entry/Finalisasi)
// ============================================================================

/**
 * Add item to receipt
 */
export const addResiItem = async (
  resiId: string,
  itemData: Partial<ResiItem>,
  store: string | null
): Promise<{ success: boolean; message: string; data?: ResiItem }> => {
  try {
    const tableName = getResiItemsTableName(store);
    
    const insertData = {
      resi_id: resiId,
      part_number: itemData.part_number || '',
      nama_barang: itemData.nama_barang || '',
      brand: itemData.brand || '',
      application: itemData.application || '',
      qty_keluar: itemData.qty_keluar || 1,
      harga_total: itemData.harga_total || 0,
      harga_satuan: itemData.harga_satuan || 0,
      is_split_item: itemData.is_split_item || false,
      split_count: itemData.split_count || 1,
      sku_from_csv: itemData.sku_from_csv || null,
      manual_input: itemData.manual_input || false
    };
    
    const { data, error } = await supabase
      .from(tableName)
      .insert([insertData])
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      success: true,
      message: 'Item berhasil ditambahkan',
      data
    };
  } catch (error: any) {
    console.error('Error adding resi item:', error);
    return {
      success: false,
      message: error.message || 'Gagal menambahkan item'
    };
  }
};

/**
 * Split item (for SET items - kiri/kanan)
 */
export const splitItem = async (
  itemId: string,
  splitCount: number,
  store: string | null
): Promise<{ success: boolean; message: string }> => {
  try {
    const tableName = getResiItemsTableName(store);
    
    // Get original item
    const { data: originalItem, error: fetchError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', itemId)
      .single();
    
    if (fetchError || !originalItem) {
      throw new Error('Item tidak ditemukan');
    }
    
    // Calculate new prices
    const newHargaSatuan = originalItem.harga_satuan / splitCount;
    const newHargaTotal = originalItem.harga_total / splitCount;
    
    // Update original item
    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        is_split_item: true,
        split_count: splitCount,
        harga_satuan: newHargaSatuan,
        harga_total: newHargaTotal
      })
      .eq('id', itemId);
    
    if (updateError) throw updateError;
    
    // Create additional split items (splitCount - 1 new items)
    const newItems = [];
    for (let i = 1; i < splitCount; i++) {
      newItems.push({
        resi_id: originalItem.resi_id,
        part_number: originalItem.part_number,
        nama_barang: originalItem.nama_barang,
        brand: originalItem.brand,
        application: originalItem.application,
        qty_keluar: originalItem.qty_keluar,
        harga_total: newHargaTotal,
        harga_satuan: newHargaSatuan,
        is_split_item: true,
        split_count: splitCount,
        sku_from_csv: originalItem.sku_from_csv,
        manual_input: originalItem.manual_input
      });
    }
    
    if (newItems.length > 0) {
      const { error: insertError } = await supabase
        .from(tableName)
        .insert(newItems);
      
      if (insertError) throw insertError;
    }
    
    return {
      success: true,
      message: `Item berhasil dipecah menjadi ${splitCount} bagian`
    };
  } catch (error: any) {
    console.error('Error splitting item:', error);
    return {
      success: false,
      message: error.message || 'Gagal memecah item'
    };
  }
};

/**
 * Complete Stage 3 and move data to barang_keluar
 */
export const completeStage3 = async (
  data: Stage3CompleteData,
  store: string | null
): Promise<{ success: boolean; message: string }> => {
  try {
    const resiTableName = getResiTableName(store);
    const itemsTableName = getResiItemsTableName(store);
    const barangKeluarTableName = getBarangKeluarTableName(store);
    const baseTableName = getBaseTableName(store);
    
    // 1. Get resi data
    const { data: resiData, error: resiError } = await supabase
      .from(resiTableName)
      .select('*')
      .eq('id', data.resi_id)
      .single();
    
    if (resiError || !resiData) {
      throw new Error('Resi tidak ditemukan');
    }
    
    if (!resiData.stage2_verified) {
      throw new Error('Resi belum diverifikasi di Stage 2!');
    }
    
    if (resiData.stage3_completed) {
      throw new Error('Resi sudah selesai diproses!');
    }
    
    // 2. Process each item
    for (const item of data.items) {
      // Get current stock
      const { data: stockData, error: stockError } = await supabase
        .from(baseTableName)
        .select('quantity')
        .eq('part_number', item.part_number)
        .single();
      
      if (stockError || !stockData) {
        console.warn(`Warning: Part ${item.part_number} tidak ditemukan di stock`);
        continue;
      }
      
      // Check if stock is sufficient
      if (stockData.quantity < item.qty_keluar) {
        throw new Error(`Stock tidak cukup untuk ${item.nama_barang}. Stock: ${stockData.quantity}, Diminta: ${item.qty_keluar}`);
      }
      
      // Update stock
      const newQuantity = stockData.quantity - item.qty_keluar;
      const { error: updateStockError } = await supabase
        .from(baseTableName)
        .update({ 
          quantity: newQuantity,
          last_updated: new Date().toISOString()
        })
        .eq('part_number', item.part_number);
      
      if (updateStockError) throw updateStockError;
      
      // Insert into barang_keluar
      const barangKeluarData = {
        tanggal: new Date().toISOString(),
        kode_toko: resiData.sub_toko,
        tempo: 'LUNAS',
        ecommerce: resiData.ecommerce,
        customer: data.customer,
        part_number: item.part_number,
        name: item.nama_barang,
        brand: item.brand,
        application: item.application,
        qty_keluar: item.qty_keluar,
        harga_satuan: item.harga_satuan,
        harga_total: item.harga_total,
        resi: resiData.resi,
        stock_ahir: newQuantity
      };
      
      const { error: insertError } = await supabase
        .from(barangKeluarTableName)
        .insert([barangKeluarData]);
      
      if (insertError) throw insertError;
    }
    
    // 3. Update resi status to completed
    const { error: updateResiError } = await supabase
      .from(resiTableName)
      .update({
        stage3_completed: true,
        stage3_completed_at: new Date().toISOString(),
        customer: data.customer,
        order_id: data.order_id,
        status: 'completed'
      })
      .eq('id', data.resi_id);
    
    if (updateResiError) throw updateResiError;
    
    return {
      success: true,
      message: 'Data berhasil diproses dan stock telah dikurangi!'
    };
  } catch (error: any) {
    console.error('Error completing stage 3:', error);
    return {
      success: false,
      message: error.message || 'Gagal menyelesaikan proses'
    };
  }
};

/**
 * Get receipts ready for Stage 3
 */
export const getPendingStage3List = async (
  store: string | null
): Promise<ResiScanStage[]> => {
  try {
    const tableName = getResiTableName(store);
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('stage2_verified', true)
      .eq('stage3_completed', false)
      .order('stage2_verified_at', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error: any) {
    console.error('Error fetching pending stage 3 list:', error);
    return [];
  }
};

/**
 * Get items for a receipt
 */
export const getResiItems = async (
  resiId: string,
  store: string | null
): Promise<ResiItem[]> => {
  try {
    const tableName = getResiItemsTableName(store);
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('resi_id', resiId)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    return data || [];
  } catch (error: any) {
    console.error('Error fetching resi items:', error);
    return [];
  }
};

// ============================================================================
// RESELLER FUNCTIONS
// ============================================================================

/**
 * Add reseller order directly to barang_keluar
 */
export const addResellerOrder = async (
  orderData: {
    customer: string;
    items: Array<{
      part_number: string;
      nama_barang: string;
      brand: string;
      application: string;
      qty_keluar: number;
      harga_satuan: number;
      harga_total: number;
    }>;
  },
  store: string | null
): Promise<{ success: boolean; message: string }> => {
  try {
    const barangKeluarTableName = getBarangKeluarTableName(store);
    const baseTableName = getBaseTableName(store);
    
    // Process each item
    for (const item of orderData.items) {
      // Get current stock
      const { data: stockData, error: stockError } = await supabase
        .from(baseTableName)
        .select('quantity')
        .eq('part_number', item.part_number)
        .single();
      
      if (stockError || !stockData) {
        throw new Error(`Part ${item.part_number} tidak ditemukan`);
      }
      
      if (stockData.quantity < item.qty_keluar) {
        throw new Error(`Stock tidak cukup untuk ${item.nama_barang}`);
      }
      
      // Update stock
      const newQuantity = stockData.quantity - item.qty_keluar;
      const { error: updateError } = await supabase
        .from(baseTableName)
        .update({ 
          quantity: newQuantity,
          last_updated: new Date().toISOString()
        })
        .eq('part_number', item.part_number);
      
      if (updateError) throw updateError;
      
      // Insert into barang_keluar
      const barangKeluarData = {
        tanggal: new Date().toISOString(),
        kode_toko: 'RESELLER',
        tempo: 'LUNAS',
        ecommerce: 'RESELLER',
        customer: orderData.customer,
        part_number: item.part_number,
        name: item.nama_barang,
        brand: item.brand,
        application: item.application,
        qty_keluar: item.qty_keluar,
        harga_satuan: item.harga_satuan,
        harga_total: item.harga_total,
        resi: '-',
        stock_ahir: newQuantity
      };
      
      const { error: insertError } = await supabase
        .from(barangKeluarTableName)
        .insert([barangKeluarData]);
      
      if (insertError) throw insertError;
    }
    
    return {
      success: true,
      message: 'Order reseller berhasil diproses!'
    };
  } catch (error: any) {
    console.error('Error adding reseller order:', error);
    return {
      success: false,
      message: error.message || 'Gagal memproses order reseller'
    };
  }
};

/**
 * Get all resellers
 */
export const getResellers = async (): Promise<ResellerMaster[]> => {
  try {
    const { data, error } = await supabase
      .from('reseller_master')
      .select('*')
      .order('nama_reseller', { ascending: true });
    
    if (error) throw error;
    
    return data || [];
  } catch (error: any) {
    console.error('Error fetching resellers:', error);
    return [];
  }
};

/**
 * Add new reseller
 */
export const addReseller = async (
  namaReseller: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const { error } = await supabase
      .from('reseller_master')
      .insert([{ nama_reseller: namaReseller }]);
    
    if (error) throw error;
    
    return {
      success: true,
      message: 'Reseller berhasil ditambahkan'
    };
  } catch (error: any) {
    console.error('Error adding reseller:', error);
    return {
      success: false,
      message: error.message || 'Gagal menambahkan reseller'
    };
  }
};

// ============================================================================
// COMMON FUNCTIONS
// ============================================================================

/**
 * Get complete history of all receipts
 */
export const getResiHistory = async (
  store: string | null,
  filters?: {
    status?: string;
    ecommerce?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<ResiScanStage[]> => {
  try {
    const tableName = getResiTableName(store);
    let query = supabase.from(tableName).select('*');
    
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    
    if (filters?.ecommerce) {
      query = query.eq('ecommerce', filters.ecommerce);
    }
    
    if (filters?.search) {
      query = query.or(`resi.ilike.%${filters.search}%,customer.ilike.%${filters.search}%`);
    }
    
    if (filters?.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    
    if (filters?.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error: any) {
    console.error('Error fetching resi history:', error);
    return [];
  }
};

/**
 * Check if receipt is duplicate
 */
export const checkDuplicateResi = async (
  resi: string,
  store: string | null
): Promise<boolean> => {
  try {
    const tableName = getResiTableName(store);
    const { data, error } = await supabase
      .from(tableName)
      .select('id')
      .eq('resi', resi)
      .maybeSingle();
    
    if (error) throw error;
    
    return !!data;
  } catch (error: any) {
    console.error('Error checking duplicate resi:', error);
    return false;
  }
};

/**
 * Lookup part number from database
 */
export const lookupPartNumber = async (
  sku: string,
  store: string | null
): Promise<{
  found: boolean;
  data?: {
    part_number: string;
    name: string;
    brand: string;
    application: string;
    quantity: number;
  };
}> => {
  try {
    const tableName = getBaseTableName(store);
    
    // Try direct match first
    let { data, error } = await supabase
      .from(tableName)
      .select('part_number, name, brand, application, quantity')
      .eq('part_number', sku)
      .maybeSingle();
    
    if (data) {
      return { found: true, data };
    }
    
    // Try substitution lookup
    const substitution = await getPartSubstitusi(sku);
    if (substitution) {
      const { data: subData, error: subError } = await supabase
        .from(tableName)
        .select('part_number, name, brand, application, quantity')
        .eq('part_number', substitution.part_number_utama)
        .maybeSingle();
      
      if (subData) {
        return { found: true, data: subData };
      }
    }
    
    return { found: false };
  } catch (error: any) {
    console.error('Error looking up part number:', error);
    return { found: false };
  }
};

/**
 * Get part number substitution
 */
export const getPartSubstitusi = async (
  partNumberAlias: string
): Promise<PartSubstitusi | null> => {
  try {
    const { data, error } = await supabase
      .from('part_substitusi')
      .select('*')
      .eq('part_number_alias', partNumberAlias)
      .maybeSingle();
    
    if (error) throw error;
    
    return data;
  } catch (error: any) {
    console.error('Error getting part substitution:', error);
    return null;
  }
};

/**
 * Add part substitution
 */
export const addPartSubstitusi = async (
  partNumberUtama: string,
  partNumberAlias: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const { error } = await supabase
      .from('part_substitusi')
      .insert([{
        part_number_utama: partNumberUtama,
        part_number_alias: partNumberAlias
      }]);
    
    if (error) throw error;
    
    return {
      success: true,
      message: 'Substitusi berhasil ditambahkan'
    };
  } catch (error: any) {
    console.error('Error adding part substitution:', error);
    return {
      success: false,
      message: error.message || 'Gagal menambahkan substitusi'
    };
  }
};

/**
 * Get customers by resi for dropdown grouping
 */
export const getCustomersByResi = async (
  resi: string,
  store: string | null
): Promise<string[]> => {
  try {
    const tableName = getResiTableName(store);
    const { data, error } = await supabase
      .from(tableName)
      .select('customer')
      .eq('resi', resi)
      .not('customer', 'is', null);
    
    if (error) throw error;
    
    const customers = data?.map(d => d.customer).filter(c => c) || [];
    return [...new Set(customers)]; // Remove duplicates
  } catch (error: any) {
    console.error('Error getting customers by resi:', error);
    return [];
  }
};

/**
 * Delete resi item
 */
export const deleteResiItem = async (
  itemId: string,
  store: string | null
): Promise<{ success: boolean; message: string }> => {
  try {
    const tableName = getResiItemsTableName(store);
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', itemId);
    
    if (error) throw error;
    
    return {
      success: true,
      message: 'Item berhasil dihapus'
    };
  } catch (error: any) {
    console.error('Error deleting resi item:', error);
    return {
      success: false,
      message: error.message || 'Gagal menghapus item'
    };
  }
};

/**
 * Update resi item
 */
export const updateResiItem = async (
  itemId: string,
  updates: Partial<ResiItem>,
  store: string | null
): Promise<{ success: boolean; message: string }> => {
  try {
    const tableName = getResiItemsTableName(store);
    const { error } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', itemId);
    
    if (error) throw error;
    
    return {
      success: true,
      message: 'Item berhasil diupdate'
    };
  } catch (error: any) {
    console.error('Error updating resi item:', error);
    return {
      success: false,
      message: error.message || 'Gagal mengupdate item'
    };
  }
};
