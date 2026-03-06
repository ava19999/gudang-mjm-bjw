// FILE: services/dataAgungService.ts
// Service functions for Data Agung feature (Online Products, Produk Kosong, Table Masuk)

import { supabase } from './supabaseClient';
import { OnlineProduct, ProdukKosong, TableMasuk } from '../types';

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
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching online products:', error);
      return [];
    }

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
    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq('part_number', product.partNumber)
      .single();

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
    const { data: current, error: fetchError } = await supabase
      .from(table)
      .select('is_active')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
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
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching produk kosong:', error);
      return [];
    }

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
    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq('part_number', product.partNumber)
      .single();

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
    const { data: current, error: fetchError } = await supabase
      .from(table)
      .select('is_online_active')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
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
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching table masuk:', error);
      return [];
    }

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
    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq('part_number', product.partNumber)
      .single();

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
    const { data: current, error: fetchError } = await supabase
      .from(table)
      .select('is_active')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
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
    const { data: produk, error: fetchError } = await supabase
      .from(kosongTable)
      .select('*')
      .eq('id', produkKosongId)
      .single();

    if (fetchError || !produk) {
      return { success: false, message: 'Produk tidak ditemukan' };
    }

    // Check if already in masuk table
    const { data: existing } = await supabase
      .from(masukTable)
      .select('id')
      .eq('part_number', produk.part_number)
      .single();

    if (existing) {
      // Delete from kosong only
      await supabase.from(kosongTable).delete().eq('id', produkKosongId);
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
    const { data: onlineProducts } = await supabase.from(onlineTable).select('id, part_number');
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
    const { data: kosongProducts } = await supabase.from(kosongTable).select('id, part_number');
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
    const { data: masukProducts } = await supabase.from(masukTable).select('id, part_number');
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

    return { updated, errors };
  } catch (err) {
    console.error('Exception syncing quantity:', err);
    return { updated, errors: errors + 1 };
  }
};
