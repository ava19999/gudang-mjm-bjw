// FILE: services/resiService.ts
import { supabase } from './supabaseClient';
import { ScanResi, ScanResiItem, ProductAlias, KilatItem } from '../types';

/**
 * Get table name based on store
 */
function getScanResiTable(store: string | null): string {
  return store === 'mjm' ? 'scan_resi_mjm' : 'scan_resi_bjw';
}

function getScanResiItemsTable(store: string | null): string {
  return store === 'mjm' ? 'scan_resi_items_mjm' : 'scan_resi_items_bjw';
}

function getKilatTable(store: string | null): string {
  return store === 'mjm' ? 'kilat_items_mjm' : 'kilat_items_bjw';
}

/**
 * Check if resi already exists
 */
export async function checkResiExists(
  resi: string,
  type_toko: string,
  toko: string,
  store: string | null
): Promise<boolean> {
  const table = getScanResiTable(store);
  
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('resi', resi)
    .eq('type_toko', type_toko)
    .eq('toko', toko)
    .limit(1);

  if (error) {
    console.error('Error checking resi:', error);
    return false;
  }

  return data && data.length > 0;
}

/**
 * Save scanned resi
 */
export async function saveScanResi(
  resi: ScanResi,
  store: string | null
): Promise<{ success: boolean; id?: number; error?: string }> {
  const table = getScanResiTable(store);

  // Check for duplicates
  const exists = await checkResiExists(
    resi.resi,
    resi.type_toko,
    resi.toko || '',
    store
  );

  if (exists) {
    return { success: false, error: 'Resi sudah pernah discan' };
  }

  const { data, error } = await supabase
    .from(table)
    .insert([{
      tanggal: resi.tanggal,
      type_toko: resi.type_toko,
      toko: resi.toko,
      negara_ekspor: resi.negara_ekspor,
      resi: resi.resi,
      customer: resi.customer,
      no_pesanan: resi.no_pesanan,
      status: resi.status || 'SCANNED',
      scanned_at: resi.scanned_at,
    }])
    .select('id')
    .single();

  if (error) {
    console.error('Error saving scan resi:', error);
    return { success: false, error: error.message };
  }

  return { success: true, id: data.id };
}

/**
 * Get scanned resi by date range
 */
export async function getScanResiByDate(
  startDate: string,
  endDate: string,
  store: string | null,
  filters?: {
    type_toko?: string;
    toko?: string;
    status?: string;
  }
): Promise<ScanResi[]> {
  const table = getScanResiTable(store);

  let query = supabase
    .from(table)
    .select('*')
    .gte('tanggal', startDate)
    .lte('tanggal', endDate)
    .order('scanned_at', { ascending: false });

  if (filters?.type_toko) {
    query = query.eq('type_toko', filters.type_toko);
  }
  if (filters?.toko) {
    query = query.eq('toko', filters.toko);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching scan resi:', error);
    return [];
  }

  return data || [];
}

/**
 * Delete scanned resi
 */
export async function deleteScanResi(
  id: number,
  store: string | null
): Promise<boolean> {
  const table = getScanResiTable(store);

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting scan resi:', error);
    return false;
  }

  return true;
}

/**
 * Update resi with matched data
 */
export async function updateScanResiWithMatch(
  id: number,
  customer: string,
  no_pesanan: string,
  store: string | null
): Promise<boolean> {
  const table = getScanResiTable(store);

  const { error } = await supabase
    .from(table)
    .update({
      customer,
      no_pesanan,
      status: 'MATCHED',
      matched_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating scan resi:', error);
    return false;
  }

  return true;
}

/**
 * Save resi items
 */
export async function saveScanResiItems(
  items: ScanResiItem[],
  store: string | null
): Promise<boolean> {
  const table = getScanResiItemsTable(store);

  const { error } = await supabase
    .from(table)
    .insert(items.map(item => ({
      scan_resi_id: item.scan_resi_id,
      part_number: item.part_number,
      product_name_export: item.product_name_export,
      qty: item.qty,
      harga_satuan: item.harga_satuan,
      harga_total: item.harga_total,
      is_split: item.is_split,
      split_group_id: item.split_group_id,
      split_count: item.split_count,
    })));

  if (error) {
    console.error('Error saving scan resi items:', error);
    return false;
  }

  return true;
}

/**
 * Get items for a scan resi
 */
export async function getScanResiItems(
  scan_resi_id: number,
  store: string | null
): Promise<ScanResiItem[]> {
  const table = getScanResiItemsTable(store);

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('scan_resi_id', scan_resi_id);

  if (error) {
    console.error('Error fetching scan resi items:', error);
    return [];
  }

  return data || [];
}

/**
 * Save product alias
 */
export async function saveProductAlias(
  part_number: string,
  alias_name: string,
  source: 'SHOPEE' | 'TIKTOK'
): Promise<boolean> {
  const { error } = await supabase
    .from('product_alias')
    .upsert({
      part_number,
      alias_name,
      source,
    }, {
      onConflict: 'part_number,alias_name',
    });

  if (error) {
    console.error('Error saving product alias:', error);
    return false;
  }

  return true;
}

/**
 * Search product by alias
 */
export async function searchProductByAlias(query: string): Promise<ProductAlias[]> {
  const { data, error } = await supabase
    .from('product_alias')
    .select('*')
    .ilike('alias_name', `%${query}%`)
    .limit(20);

  if (error) {
    console.error('Error searching product alias:', error);
    return [];
  }

  return data || [];
}

/**
 * KILAT: Save scanned item
 */
export async function saveKilatItem(
  item: KilatItem,
  store: string | null
): Promise<boolean> {
  const table = getKilatTable(store);

  const { error } = await supabase
    .from(table)
    .insert([{
      tanggal: item.tanggal,
      toko: item.toko,
      part_number: item.part_number,
      nama_barang: item.nama_barang,
      status: item.status || 'DIKIRIM',
      sold_at: item.sold_at,
      customer: item.customer,
      harga: item.harga,
    }]);

  if (error) {
    console.error('Error saving kilat item:', error);
    return false;
  }

  return true;
}

/**
 * KILAT: Get items
 */
export async function getKilatItems(
  store: string | null,
  status?: 'DIKIRIM' | 'TERJUAL'
): Promise<KilatItem[]> {
  const table = getKilatTable(store);

  let query = supabase
    .from(table)
    .select('*')
    .order('tanggal', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching kilat items:', error);
    return [];
  }

  return data || [];
}

/**
 * KILAT: Update status to TERJUAL
 */
export async function updateKilatItemToSold(
  id: number,
  customer: string,
  harga: number,
  store: string | null
): Promise<boolean> {
  const table = getKilatTable(store);

  const { error } = await supabase
    .from(table)
    .update({
      status: 'TERJUAL',
      sold_at: new Date().toISOString(),
      customer,
      harga,
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating kilat item:', error);
    return false;
  }

  return true;
}

/**
 * Get today's scanned resi (for displaying in scan view)
 */
export async function getTodayScanResi(
  store: string | null
): Promise<ScanResi[]> {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  return getScanResiByDate(today, tomorrowStr, store);
}
