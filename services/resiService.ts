// FILE: services/resiService.ts
// Service for Scan Resi operations and Product Alias management

import { supabase } from './supabaseClient';
import { ScanResiEntry, ProductAlias, KilatEntry } from '../types';

/**
 * Get table name based on store
 */
function getResiTableName(store: string | null | undefined): string {
  if (store === 'mjm') return 'scan_resi_mjm';
  if (store === 'bjw') return 'scan_resi_bjw';
  return 'scan_resi_mjm'; // default
}

function getAliasTableName(): string {
  return 'product_alias';
}

// ============================================
// SCAN RESI OPERATIONS
// ============================================

/**
 * Check if resi already exists (duplicate prevention Layer 1)
 */
export async function checkResiExists(
  resi: string, 
  partNumber: string,
  store: string | null
): Promise<boolean> {
  try {
    const tableName = getResiTableName(store);
    const { data, error } = await supabase
      .from(tableName)
      .select('id')
      .eq('resi', resi)
      .eq('part_number', partNumber)
      .limit(1);

    if (error) throw error;
    return (data && data.length > 0);
  } catch (error) {
    console.error('Error checking resi:', error);
    return false;
  }
}

/**
 * Add new scan resi entry
 */
export async function addScanResi(
  entry: ScanResiEntry,
  store: string | null
): Promise<{ success: boolean; error?: string; id?: number }> {
  try {
    // Check duplicate first
    const exists = await checkResiExists(entry.resi, entry.part_number, store);
    if (exists) {
      return { 
        success: false, 
        error: `Resi ${entry.resi} dengan part number ${entry.part_number} sudah ada!` 
      };
    }

    const tableName = getResiTableName(store);
    const { data, error } = await supabase
      .from(tableName)
      .insert([{
        tanggal: entry.tanggal,
        type_toko: entry.type_toko,
        toko: entry.toko,
        resi: entry.resi,
        customer: entry.customer,
        part_number: entry.part_number,
        barang: entry.barang,
        brand: entry.brand,
        application: entry.application,
        stok_saatini: entry.stok_saatini,
        qty_out: entry.qty_out,
        harga_satuan: entry.harga_satuan,
        total_harga: entry.total_harga,
        no_pesanan: entry.no_pesanan || null,
        negara_ekspor: entry.negara_ekspor || null,
        status_packing: entry.status_packing || 'SCANNED',
        is_split: entry.is_split || false,
        split_group_id: entry.split_group_id || null,
        split_count: entry.split_count || 1,
        original_product_name: entry.original_product_name || null,
        original_price: entry.original_price || null
      }])
      .select('id');

    if (error) throw error;
    
    return { success: true, id: data?.[0]?.id };
  } catch (error: any) {
    console.error('Error adding scan resi:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch all scan resi entries
 */
export async function fetchScanResiEntries(
  store: string | null,
  filters?: {
    type_toko?: string;
    toko?: string;
    status_packing?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<ScanResiEntry[]> {
  try {
    const tableName = getResiTableName(store);
    let query = supabase.from(tableName).select('*');

    if (filters?.type_toko) {
      query = query.eq('type_toko', filters.type_toko);
    }
    if (filters?.toko) {
      query = query.eq('toko', filters.toko);
    }
    if (filters?.status_packing) {
      query = query.eq('status_packing', filters.status_packing);
    }
    if (filters?.dateFrom) {
      query = query.gte('tanggal', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('tanggal', filters.dateTo);
    }

    query = query.order('tanggal', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching scan resi:', error);
    return [];
  }
}

/**
 * Update scan resi entry
 */
export async function updateScanResi(
  id: number,
  updates: Partial<ScanResiEntry>,
  store: string | null
): Promise<boolean> {
  try {
    const tableName = getResiTableName(store);
    const { error } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating scan resi:', error);
    return false;
  }
}

/**
 * Delete scan resi entry (only if not processed)
 */
export async function deleteScanResi(
  id: number,
  store: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const tableName = getResiTableName(store);
    
    // Check status first
    const { data: entry } = await supabase
      .from(tableName)
      .select('status_packing')
      .eq('id', id)
      .single();

    if (entry?.status_packing === 'MATCHED') {
      return { 
        success: false, 
        error: 'Tidak dapat menghapus entry yang sudah MATCHED!' 
      };
    }

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting scan resi:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Match scanned entry with export data and update
 */
export async function matchResiWithExport(
  resi: string,
  exportData: {
    customer: string;
    qty_out: number;
    harga_satuan: number;
    total_harga: number;
  },
  store: string | null
): Promise<boolean> {
  try {
    const tableName = getResiTableName(store);
    const { error } = await supabase
      .from(tableName)
      .update({
        customer: exportData.customer,
        qty_out: exportData.qty_out,
        harga_satuan: exportData.harga_satuan,
        total_harga: exportData.total_harga,
        status_packing: 'MATCHED'
      })
      .eq('resi', resi)
      .eq('status_packing', 'SCANNED');

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error matching resi:', error);
    return false;
  }
}

// ============================================
// KILAT OPERATIONS
// ============================================

/**
 * Add KILAT entry with instant stock reduction
 */
export async function addKilatEntry(
  entry: Omit<KilatEntry, 'id'>,
  store: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const tableName = getResiTableName(store);
    const baseTableName = store === 'mjm' ? 'base_mjm' : 'base_bjw';

    // 1. Add to scan_resi table with customer name pattern
    const customerName = `KILAT ${entry.toko}`;
    const { error: insertError } = await supabase
      .from(tableName)
      .insert([{
        tanggal: entry.tanggal,
        type_toko: 'KILAT',
        toko: entry.toko,
        resi: entry.resi,
        customer: customerName,
        part_number: entry.part_number,
        barang: entry.barang,
        brand: entry.brand,
        application: entry.application,
        stok_saatini: 0, // Will be updated after stock reduction
        qty_out: 1, // Always 1 for KILAT
        harga_satuan: 0, // Will be filled after export match
        total_harga: 0,
        status_packing: 'SCANNED'
      }]);

    if (insertError) throw insertError;

    // 2. Reduce stock immediately
    const { data: currentItem } = await supabase
      .from(baseTableName)
      .select('quantity')
      .eq('part_number', entry.part_number)
      .single();

    if (currentItem) {
      const newQuantity = Math.max(0, currentItem.quantity - 1);
      const { error: updateError } = await supabase
        .from(baseTableName)
        .update({ quantity: newQuantity })
        .eq('part_number', entry.part_number);

      if (updateError) throw updateError;
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error adding KILAT entry:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch KILAT entries with sold status
 */
export async function fetchKilatEntries(
  store: string | null,
  isSold?: boolean
): Promise<KilatEntry[]> {
  try {
    const tableName = getResiTableName(store);
    let query = supabase
      .from(tableName)
      .select('*')
      .eq('type_toko', 'KILAT');

    if (isSold !== undefined) {
      const statusFilter = isSold ? 'MATCHED' : 'SCANNED';
      query = query.eq('status_packing', statusFilter);
    }

    query = query.order('tanggal', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(item => ({
      id: item.id,
      tanggal: item.tanggal,
      type_toko: 'KILAT',
      toko: item.toko,
      resi: item.resi,
      part_number: item.part_number,
      barang: item.barang,
      brand: item.brand,
      application: item.application,
      qty_out: item.qty_out,
      is_sold: item.status_packing === 'MATCHED',
      customer: item.customer,
      harga_satuan: item.harga_satuan,
      total_harga: item.total_harga
    }));
  } catch (error) {
    console.error('Error fetching KILAT entries:', error);
    return [];
  }
}

// ============================================
// PRODUCT ALIAS OPERATIONS
// ============================================

// PostgreSQL error codes
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Add product alias
 */
export async function addProductAlias(
  alias: Omit<ProductAlias, 'id' | 'created_at'>
): Promise<boolean> {
  try {
    const tableName = getAliasTableName();
    const { error } = await supabase
      .from(tableName)
      .insert([alias]);

    if (error) {
      // Ignore duplicate constraint errors
      if (error.code === PG_UNIQUE_VIOLATION) return true;
      throw error;
    }
    return true;
  } catch (error) {
    console.error('Error adding product alias:', error);
    return false;
  }
}

/**
 * Search part numbers by alias
 */
export async function searchByAlias(
  searchTerm: string
): Promise<string[]> {
  try {
    const tableName = getAliasTableName();
    const { data, error } = await supabase
      .from(tableName)
      .select('part_number')
      .ilike('alias_name', `%${searchTerm}%`);

    if (error) throw error;
    
    // Return unique part numbers
    const partNumbers = [...new Set((data || []).map(item => item.part_number))];
    return partNumbers;
  } catch (error) {
    console.error('Error searching by alias:', error);
    return [];
  }
}

/**
 * Get all aliases for a part number
 */
export async function getAliasesForPart(
  partNumber: string
): Promise<ProductAlias[]> {
  try {
    const tableName = getAliasTableName();
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('part_number', partNumber);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching aliases:', error);
    return [];
  }
}

/**
 * Batch add aliases from import
 */
export async function batchAddAliases(
  aliases: Omit<ProductAlias, 'id' | 'created_at'>[]
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  for (const alias of aliases) {
    const added = await addProductAlias(alias);
    if (added) success++;
    else skipped++;
  }

  return { success, skipped };
}

// ============================================
// SPLIT ITEM OPERATIONS
// ============================================

/**
 * Create split group from single entry
 */
export async function createSplitGroup(
  originalEntry: ScanResiEntry,
  splitItems: Array<{ part_number: string; barang: string; brand: string; application: string }>,
  store: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const splitGroupId = `SPLIT-${Date.now()}`;
    const pricePerItem = originalEntry.total_harga / splitItems.length;
    const tableName = getResiTableName(store);

    // Update original entry
    await supabase
      .from(tableName)
      .update({
        is_split: true,
        split_group_id: splitGroupId,
        split_count: splitItems.length
      })
      .eq('id', originalEntry.id);

    // Create split entries
    const splitEntries = splitItems.map(item => ({
      tanggal: originalEntry.tanggal,
      type_toko: originalEntry.type_toko,
      toko: originalEntry.toko,
      resi: originalEntry.resi,
      customer: originalEntry.customer,
      part_number: item.part_number,
      barang: item.barang,
      brand: item.brand,
      application: item.application,
      stok_saatini: 0, // Will be filled from base
      qty_out: 1,
      harga_satuan: pricePerItem,
      total_harga: pricePerItem,
      no_pesanan: originalEntry.no_pesanan,
      status_packing: originalEntry.status_packing,
      is_split: true,
      split_group_id: splitGroupId,
      split_count: splitItems.length,
      original_product_name: originalEntry.barang,
      original_price: originalEntry.total_harga
    }));

    const { error: insertError } = await supabase
      .from(tableName)
      .insert(splitEntries);

    if (insertError) throw insertError;

    return { success: true };
  } catch (error: any) {
    console.error('Error creating split group:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get entries by split group
 */
export async function getSplitGroupEntries(
  splitGroupId: string,
  store: string | null
): Promise<ScanResiEntry[]> {
  try {
    const tableName = getResiTableName(store);
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('split_group_id', splitGroupId)
      .order('id', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching split group:', error);
    return [];
  }
}
