// FILE: services/dataAgungService.ts
// Service functions for Data Agung feature (Online Products, Produk Kosong, Table Masuk)

import { supabase } from './supabaseClient';
import { OnlineProduct, ProdukKosong, TableMasuk } from '../types';
import { markEdgeListDatasetsDirty, readEdgeListRowsCached } from './supabaseService';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getOnlineTable = (store: string | null): string | null => {
  if (store === 'mjm') return 'data_agung_online_mjm';
  if (store === 'bjw') return 'data_agung_online_bjw';
  return null;
};

const getKosongTable = (store: string | null): string | null => {
  if (store === 'mjm') return 'data_agung_kosong_mjm';
  if (store === 'bjw') return 'data_agung_kosong_bjw';
  return null;
};

const getMasukTable = (store: string | null): string | null => {
  if (store === 'mjm') return 'data_agung_masuk_mjm';
  if (store === 'bjw') return 'data_agung_masuk_bjw';
  return null;
};

const getOnlineDataset = () => 'data-agung-online' as const;
const getKosongDataset = () => 'data-agung-kosong' as const;
const getMasukDataset = () => 'data-agung-masuk' as const;

const markOnlineDatasetDirty = (store: string | null) => {
  markEdgeListDatasetsDirty(store, [getOnlineDataset()]);
};
const markKosongDatasetDirty = (store: string | null) => {
  markEdgeListDatasetsDirty(store, [getKosongDataset()]);
};
const markMasukDatasetDirty = (store: string | null) => {
  markEdgeListDatasetsDirty(store, [getMasukDataset()]);
};

// Map database row to OnlineProduct
const mapToOnlineProduct = (row: any): OnlineProduct => ({
  id: row.id,
  partNumber: row.part_number || '',
  name: row.name || '',
  brand: row.brand || '',
  quantity: row.quantity || 0,
  isActive: row.is_active ?? true,
  timestamp: new Date(row.created_at).getTime()
});

// Map database row to ProdukKosong
const mapToProdukKosong = (row: any): ProdukKosong => ({
  id: row.id,
  partNumber: row.part_number || '',
  name: row.name || '',
  brand: row.brand || '',
  quantity: row.quantity || 0,
  isOnlineActive: row.is_online_active ?? false,
  timestamp: new Date(row.created_at).getTime()
});

// Map database row to TableMasuk
const mapToTableMasuk = (row: any): TableMasuk => ({
  id: row.id,
  partNumber: row.part_number || '',
  name: row.name || '',
  brand: row.brand || '',
  quantity: row.quantity || 0,
  isActive: row.is_active ?? true,
  timestamp: new Date(row.created_at).getTime()
});

// ============================================================================
// ONLINE PRODUCTS CRUD
// ============================================================================

export const getOnlineProducts = async (store: string | null): Promise<OnlineProduct[]> => {
  const table = getOnlineTable(store);
  if (!table) return [];

  try {
    const data = await readEdgeListRowsCached<any>(store, getOnlineDataset());
    return (data || []).map(mapToOnlineProduct);
  } catch (err) {
    console.error('Exception fetching online products:', err);
    return [];
  }
};

export const addOnlineProduct = async (
  store: string | null,
  product: Omit<OnlineProduct, 'id' | 'timestamp'>
): Promise<{ success: boolean; id?: string; message?: string }> => {
  const table = getOnlineTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    // Check if already exists
    const currentRows = await readEdgeListRowsCached<any>(store, getOnlineDataset());
    const existing = (currentRows || []).find((row: any) =>
      String(row?.part_number || '').trim().toUpperCase() === String(product.partNumber || '').trim().toUpperCase()
    );

    if (existing) {
      return { success: false, message: 'Produk sudah ada di list online' };
    }

    const { data, error } = await supabase
      .from(table)
      .insert({
        part_number: product.partNumber,
        name: product.name,
        brand: product.brand,
        quantity: product.quantity,
        is_active: product.isActive
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error adding online product:', error);
      return { success: false, message: error.message };
    }

    markOnlineDatasetDirty(store);
    return { success: true, id: data.id };
  } catch (err: any) {
    console.error('Exception adding online product:', err);
    return { success: false, message: err.message };
  }
};

export const updateOnlineProduct = async (
  store: string | null,
  id: string,
  updates: Partial<OnlineProduct>
): Promise<{ success: boolean; message?: string }> => {
  const table = getOnlineTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    const dbUpdates: any = {};
    if (updates.partNumber !== undefined) dbUpdates.part_number = updates.partNumber;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.brand !== undefined) dbUpdates.brand = updates.brand;
    if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    const { error } = await supabase
      .from(table)
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating online product:', error);
      return { success: false, message: error.message };
    }

    markOnlineDatasetDirty(store);
    return { success: true };
  } catch (err: any) {
    console.error('Exception updating online product:', err);
    return { success: false, message: err.message };
  }
};

export const deleteOnlineProduct = async (
  store: string | null,
  id: string
): Promise<{ success: boolean; message?: string }> => {
  const table = getOnlineTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting online product:', error);
      return { success: false, message: error.message };
    }

    markOnlineDatasetDirty(store);
    return { success: true };
  } catch (err: any) {
    console.error('Exception deleting online product:', err);
    return { success: false, message: err.message };
  }
};

export const toggleOnlineProduct = async (
  store: string | null,
  id: string
): Promise<{ success: boolean; newValue?: boolean; message?: string }> => {
  const table = getOnlineTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    // Get current value
    const rows = await readEdgeListRowsCached<any>(store, getOnlineDataset());
    const current = (rows || []).find((row: any) => String(row?.id || '') === String(id));

    if (!current) {
      return { success: false, message: 'Produk tidak ditemukan' };
    }

    const newValue = !current.is_active;

    const { error } = await supabase
      .from(table)
      .update({ is_active: newValue })
      .eq('id', id);

    if (error) {
      console.error('Error toggling online product:', error);
      return { success: false, message: error.message };
    }

    markOnlineDatasetDirty(store);
    return { success: true, newValue };
  } catch (err: any) {
    console.error('Exception toggling online product:', err);
    return { success: false, message: err.message };
  }
};

// ============================================================================
// PRODUK KOSONG CRUD
// ============================================================================

export const getProdukKosong = async (store: string | null): Promise<ProdukKosong[]> => {
  const table = getKosongTable(store);
  if (!table) return [];

  try {
    const data = await readEdgeListRowsCached<any>(store, getKosongDataset());
    return (data || []).map(mapToProdukKosong);
  } catch (err) {
    console.error('Exception fetching produk kosong:', err);
    return [];
  }
};

export const addProdukKosong = async (
  store: string | null,
  product: Omit<ProdukKosong, 'id' | 'timestamp'>
): Promise<{ success: boolean; id?: string; message?: string }> => {
  const table = getKosongTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    // Check if already exists
    const currentRows = await readEdgeListRowsCached<any>(store, getKosongDataset());
    const existing = (currentRows || []).find((row: any) =>
      String(row?.part_number || '').trim().toUpperCase() === String(product.partNumber || '').trim().toUpperCase()
    );

    if (existing) {
      return { success: false, message: 'Produk sudah ada di list kosong' };
    }

    const { data, error } = await supabase
      .from(table)
      .insert({
        part_number: product.partNumber,
        name: product.name,
        brand: product.brand,
        quantity: product.quantity,
        is_online_active: product.isOnlineActive
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error adding produk kosong:', error);
      return { success: false, message: error.message };
    }

    markKosongDatasetDirty(store);
    return { success: true, id: data.id };
  } catch (err: any) {
    console.error('Exception adding produk kosong:', err);
    return { success: false, message: err.message };
  }
};

export const updateProdukKosong = async (
  store: string | null,
  id: string,
  updates: Partial<ProdukKosong>
): Promise<{ success: boolean; message?: string }> => {
  const table = getKosongTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    const dbUpdates: any = {};
    if (updates.partNumber !== undefined) dbUpdates.part_number = updates.partNumber;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.brand !== undefined) dbUpdates.brand = updates.brand;
    if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity;
    if (updates.isOnlineActive !== undefined) dbUpdates.is_online_active = updates.isOnlineActive;

    const { error } = await supabase
      .from(table)
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating produk kosong:', error);
      return { success: false, message: error.message };
    }

    markKosongDatasetDirty(store);
    return { success: true };
  } catch (err: any) {
    console.error('Exception updating produk kosong:', err);
    return { success: false, message: err.message };
  }
};

export const deleteProdukKosong = async (
  store: string | null,
  id: string
): Promise<{ success: boolean; message?: string }> => {
  const table = getKosongTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting produk kosong:', error);
      return { success: false, message: error.message };
    }

    markKosongDatasetDirty(store);
    return { success: true };
  } catch (err: any) {
    console.error('Exception deleting produk kosong:', err);
    return { success: false, message: err.message };
  }
};

export const toggleProdukKosong = async (
  store: string | null,
  id: string
): Promise<{ success: boolean; newValue?: boolean; message?: string }> => {
  const table = getKosongTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    // Get current value
    const rows = await readEdgeListRowsCached<any>(store, getKosongDataset());
    const current = (rows || []).find((row: any) => String(row?.id || '') === String(id));

    if (!current) {
      return { success: false, message: 'Produk tidak ditemukan' };
    }

    const newValue = !current.is_online_active;

    const { error } = await supabase
      .from(table)
      .update({ is_online_active: newValue })
      .eq('id', id);

    if (error) {
      console.error('Error toggling produk kosong:', error);
      return { success: false, message: error.message };
    }

    markKosongDatasetDirty(store);
    return { success: true, newValue };
  } catch (err: any) {
    console.error('Exception toggling produk kosong:', err);
    return { success: false, message: err.message };
  }
};

// ============================================================================
// TABLE MASUK CRUD
// ============================================================================

export const getTableMasuk = async (store: string | null): Promise<TableMasuk[]> => {
  const table = getMasukTable(store);
  if (!table) return [];

  try {
    const data = await readEdgeListRowsCached<any>(store, getMasukDataset());
    return (data || []).map(mapToTableMasuk);
  } catch (err) {
    console.error('Exception fetching table masuk:', err);
    return [];
  }
};

export const addTableMasuk = async (
  store: string | null,
  product: Omit<TableMasuk, 'id' | 'timestamp'>
): Promise<{ success: boolean; id?: string; message?: string }> => {
  const table = getMasukTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    // Check if already exists
    const currentRows = await readEdgeListRowsCached<any>(store, getMasukDataset());
    const existing = (currentRows || []).find((row: any) =>
      String(row?.part_number || '').trim().toUpperCase() === String(product.partNumber || '').trim().toUpperCase()
    );

    if (existing) {
      return { success: false, message: 'Produk sudah ada di table masuk' };
    }

    const { data, error } = await supabase
      .from(table)
      .insert({
        part_number: product.partNumber,
        name: product.name,
        brand: product.brand,
        quantity: product.quantity,
        is_active: product.isActive
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error adding table masuk:', error);
      return { success: false, message: error.message };
    }

    markMasukDatasetDirty(store);
    return { success: true, id: data.id };
  } catch (err: any) {
    console.error('Exception adding table masuk:', err);
    return { success: false, message: err.message };
  }
};

export const updateTableMasuk = async (
  store: string | null,
  id: string,
  updates: Partial<TableMasuk>
): Promise<{ success: boolean; message?: string }> => {
  const table = getMasukTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    const dbUpdates: any = {};
    if (updates.partNumber !== undefined) dbUpdates.part_number = updates.partNumber;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.brand !== undefined) dbUpdates.brand = updates.brand;
    if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    const { error } = await supabase
      .from(table)
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating table masuk:', error);
      return { success: false, message: error.message };
    }

    markMasukDatasetDirty(store);
    return { success: true };
  } catch (err: any) {
    console.error('Exception updating table masuk:', err);
    return { success: false, message: err.message };
  }
};

export const deleteTableMasuk = async (
  store: string | null,
  id: string
): Promise<{ success: boolean; message?: string }> => {
  const table = getMasukTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting table masuk:', error);
      return { success: false, message: error.message };
    }

    markMasukDatasetDirty(store);
    return { success: true };
  } catch (err: any) {
    console.error('Exception deleting table masuk:', err);
    return { success: false, message: err.message };
  }
};

export const toggleTableMasuk = async (
  store: string | null,
  id: string
): Promise<{ success: boolean; newValue?: boolean; message?: string }> => {
  const table = getMasukTable(store);
  if (!table) return { success: false, message: 'Store tidak valid' };

  try {
    // Get current value
    const rows = await readEdgeListRowsCached<any>(store, getMasukDataset());
    const current = (rows || []).find((row: any) => String(row?.id || '') === String(id));

    if (!current) {
      return { success: false, message: 'Produk tidak ditemukan' };
    }

    const newValue = !current.is_active;

    const { error } = await supabase
      .from(table)
      .update({ is_active: newValue })
      .eq('id', id);

    if (error) {
      console.error('Error toggling table masuk:', error);
      return { success: false, message: error.message };
    }

    markMasukDatasetDirty(store);
    return { success: true, newValue };
  } catch (err: any) {
    console.error('Exception toggling table masuk:', err);
    return { success: false, message: err.message };
  }
};

// ============================================================================
// BULK OPERATIONS
// ============================================================================

// Move product from Produk Kosong to Table Masuk when qty > 0
export const moveProdukKosongToMasuk = async (
  store: string | null,
  produkKosongId: string
): Promise<{ success: boolean; message?: string }> => {
  const kosongTable = getKosongTable(store);
  const masukTable = getMasukTable(store);
  if (!kosongTable || !masukTable) return { success: false, message: 'Store tidak valid' };

  try {
    // Get produk kosong data
    const kosongRows = await readEdgeListRowsCached<any>(store, getKosongDataset());
    const produk = (kosongRows || []).find((row: any) => String(row?.id || '') === String(produkKosongId));

    if (!produk) {
      return { success: false, message: 'Produk tidak ditemukan' };
    }

    // Check if already in masuk table
    const masukRows = await readEdgeListRowsCached<any>(store, getMasukDataset());
    const existing = (masukRows || []).find((row: any) =>
      String(row?.part_number || '').trim().toUpperCase() === String(produk.part_number || '').trim().toUpperCase()
    );

    if (existing) {
      // Delete from kosong only
      await supabase.from(kosongTable).delete().eq('id', produkKosongId);
      markKosongDatasetDirty(store);
      return { success: true, message: 'Produk sudah ada di Table Masuk, dihapus dari Produk Kosong' };
    }

    // Insert to masuk table
    const { error: insertError } = await supabase
      .from(masukTable)
      .insert({
        part_number: produk.part_number,
        name: produk.name,
        brand: produk.brand,
        quantity: produk.quantity,
        is_active: true
      });

    if (insertError) {
      return { success: false, message: insertError.message };
    }

    // Delete from kosong table
    await supabase.from(kosongTable).delete().eq('id', produkKosongId);

    markKosongDatasetDirty(store);
    markMasukDatasetDirty(store);
    return { success: true };
  } catch (err: any) {
    console.error('Exception moving produk:', err);
    return { success: false, message: err.message };
  }
};

// Sync quantity from inventory items
export const syncQuantityFromInventory = async (
  store: string | null,
  inventoryItems: { partNumber: string; quantity: number }[]
): Promise<{ updated: number; errors: number }> => {
  const onlineTable = getOnlineTable(store);
  const kosongTable = getKosongTable(store);
  const masukTable = getMasukTable(store);
  
  if (!onlineTable || !kosongTable || !masukTable) {
    return { updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;

  // Create a map for quick lookup
  const qtyMap = new Map<string, number>();
  inventoryItems.forEach(item => {
    qtyMap.set(item.partNumber, item.quantity);
  });

  try {
    // Update online products quantity
    const onlineProducts = await readEdgeListRowsCached<any>(store, getOnlineDataset());
    for (const product of onlineProducts || []) {
      const qty = qtyMap.get(product.part_number);
      if (qty !== undefined) {
        const { error } = await supabase
          .from(onlineTable)
          .update({ quantity: qty })
          .eq('id', product.id);
        if (error) errors++; else updated++;
      }
    }

    // Update produk kosong quantity
    const kosongProducts = await readEdgeListRowsCached<any>(store, getKosongDataset());
    for (const product of kosongProducts || []) {
      const qty = qtyMap.get(product.part_number);
      if (qty !== undefined) {
        const { error } = await supabase
          .from(kosongTable)
          .update({ quantity: qty })
          .eq('id', product.id);
        if (error) errors++; else updated++;
      }
    }

    // Update table masuk quantity
    const masukProducts = await readEdgeListRowsCached<any>(store, getMasukDataset());
    for (const product of masukProducts || []) {
      const qty = qtyMap.get(product.part_number);
      if (qty !== undefined) {
        const { error } = await supabase
          .from(masukTable)
          .update({ quantity: qty })
          .eq('id', product.id);
        if (error) errors++; else updated++;
      }
    }

    markOnlineDatasetDirty(store);
    markKosongDatasetDirty(store);
    markMasukDatasetDirty(store);
    return { updated, errors };
  } catch (err) {
    console.error('Exception syncing quantity:', err);
    return { updated, errors: errors + 1 };
  }
};
