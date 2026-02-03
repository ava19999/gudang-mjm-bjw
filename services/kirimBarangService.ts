// FILE: services/kirimBarangService.ts
import { supabase } from './supabaseClient';
import { getWIBDate } from '../utils/timezone';

// ====================================
// TYPES
// ====================================
export interface KirimBarangItem {
  id: string;
  created_at: string;
  updated_at: string;
  from_store: 'mjm' | 'bjw';
  to_store: 'mjm' | 'bjw';
  part_number: string;
  nama_barang: string;
  brand: string | null;
  application: string | null;
  quantity: number;
  status: 'pending' | 'approved' | 'sent' | 'received' | 'rejected';
  catatan: string | null;
  catatan_reject: string | null;
  requested_by: string | null;
  approved_by: string | null;
  sent_by: string | null;
  received_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  received_at: string | null;
  rejected_at: string | null;
}

export interface CreateKirimBarangRequest {
  from_store: 'mjm' | 'bjw';
  to_store: 'mjm' | 'bjw';
  part_number: string;
  nama_barang: string;
  brand?: string;
  application?: string;
  quantity: number;
  catatan?: string;
  requested_by: string;
}

export interface StockItem {
  part_number: string;
  name: string;
  brand: string;
  application: string;
  quantity: number;
  shelf: string;
}

// ====================================
// FETCH FUNCTIONS
// ====================================

// Get stock from both stores for comparison
export const fetchBothStoreStock = async (partNumber?: string): Promise<{
  mjm: StockItem[];
  bjw: StockItem[];
}> => {
  try {
    let mjmQuery = supabase
      .from('base_mjm')
      .select('part_number, name, brand, application, quantity, shelf')
      .order('part_number');

    let bjwQuery = supabase
      .from('base_bjw')
      .select('part_number, name, brand, application, quantity, shelf')
      .order('part_number');

    if (partNumber) {
      mjmQuery = mjmQuery.ilike('part_number', `%${partNumber}%`);
      bjwQuery = bjwQuery.ilike('part_number', `%${partNumber}%`);
    }

    const [mjmResult, bjwResult] = await Promise.all([mjmQuery, bjwQuery]);

    return {
      mjm: (mjmResult.data || []).map(item => ({
        part_number: item.part_number || '',
        name: item.name || '',
        brand: item.brand || '',
        application: item.application || '',
        quantity: item.quantity || 0,
        shelf: item.shelf || ''
      })),
      bjw: (bjwResult.data || []).map(item => ({
        part_number: item.part_number || '',
        name: item.name || '',
        brand: item.brand || '',
        application: item.application || '',
        quantity: item.quantity || 0,
        shelf: item.shelf || ''
      }))
    };
  } catch (error) {
    console.error('fetchBothStoreStock Error:', error);
    return { mjm: [], bjw: [] };
  }
};

// Get all transfer requests
export const fetchKirimBarang = async (
  store: 'mjm' | 'bjw' | null,
  filter?: 'all' | 'incoming' | 'outgoing' | 'pending' | 'completed'
): Promise<KirimBarangItem[]> => {
  try {
    let query = supabase
      .from('kirim_barang')
      .select('*')
      .order('created_at', { ascending: false });

    if (store && filter === 'incoming') {
      query = query.eq('to_store', store);
    } else if (store && filter === 'outgoing') {
      query = query.eq('from_store', store);
    } else if (filter === 'pending') {
      query = query.in('status', ['pending', 'approved', 'sent']);
    } else if (filter === 'completed') {
      query = query.in('status', ['received', 'rejected']);
    }

    const { data, error } = await query;

    if (error) {
      console.error('fetchKirimBarang Error:', error);
      return [];
    }

    return (data || []) as KirimBarangItem[];
  } catch (error) {
    console.error('fetchKirimBarang Exception:', error);
    return [];
  }
};

// ====================================
// CREATE REQUEST
// ====================================
export const createKirimBarangRequest = async (
  request: CreateKirimBarangRequest
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.from('kirim_barang').insert({
      from_store: request.from_store,
      to_store: request.to_store,
      part_number: request.part_number,
      nama_barang: request.nama_barang,
      brand: request.brand || null,
      application: request.application || null,
      quantity: request.quantity,
      catatan: request.catatan || null,
      requested_by: request.requested_by,
      status: 'pending'
    });

    if (error) {
      console.error('createKirimBarangRequest Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('createKirimBarangRequest Exception:', error);
    return { success: false, error: error.message };
  }
};

// ====================================
// UPDATE STATUS FUNCTIONS
// ====================================

// Approve a request
export const approveKirimBarang = async (
  id: string,
  approvedBy: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('kirim_barang')
      .update({
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('approveKirimBarang Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('approveKirimBarang Exception:', error);
    return { success: false, error: error.message };
  }
};

// Mark as sent and update stock (decrease from source store)
export const sendKirimBarang = async (
  id: string,
  sentBy: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // First get the transfer details
    const { data: transfer, error: fetchError } = await supabase
      .from('kirim_barang')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !transfer) {
      return { success: false, error: 'Transfer not found' };
    }

    // Get source table
    const sourceTable = transfer.from_store === 'mjm' ? 'base_mjm' : 'base_bjw';

    // Get current stock
    const { data: sourceItem, error: sourceError } = await supabase
      .from(sourceTable)
      .select('quantity')
      .eq('part_number', transfer.part_number)
      .single();

    if (sourceError || !sourceItem) {
      return { success: false, error: 'Item not found in source store' };
    }

    if (sourceItem.quantity < transfer.quantity) {
      return { success: false, error: `Stok tidak cukup. Tersedia: ${sourceItem.quantity}` };
    }

    // Decrease stock from source
    const newSourceQty = sourceItem.quantity - transfer.quantity;
    const { error: updateSourceError } = await supabase
      .from(sourceTable)
      .update({ quantity: newSourceQty })
      .eq('part_number', transfer.part_number);

    if (updateSourceError) {
      return { success: false, error: 'Failed to update source stock' };
    }

    // Update transfer status
    const { error: updateError } = await supabase
      .from('kirim_barang')
      .update({
        status: 'sent',
        sent_by: sentBy,
        sent_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('sendKirimBarang Update Error:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('sendKirimBarang Exception:', error);
    return { success: false, error: error.message };
  }
};

// Mark as received and update stock (increase in destination store)
export const receiveKirimBarang = async (
  id: string,
  receivedBy: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // First get the transfer details
    const { data: transfer, error: fetchError } = await supabase
      .from('kirim_barang')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !transfer) {
      return { success: false, error: 'Transfer not found' };
    }

    // Get destination table
    const destTable = transfer.to_store === 'mjm' ? 'base_mjm' : 'base_bjw';

    // Get current stock in destination (or create if not exists)
    const { data: destItem, error: destError } = await supabase
      .from(destTable)
      .select('*')
      .eq('part_number', transfer.part_number)
      .single();

    if (destError && destError.code !== 'PGRST116') {
      // PGRST116 = not found, which is okay
      return { success: false, error: 'Error checking destination stock' };
    }

    if (destItem) {
      // Item exists, increase quantity
      const newDestQty = (destItem.quantity || 0) + transfer.quantity;
      const { error: updateDestError } = await supabase
        .from(destTable)
        .update({ quantity: newDestQty })
        .eq('part_number', transfer.part_number);

      if (updateDestError) {
        return { success: false, error: 'Failed to update destination stock' };
      }
    } else {
      // Item doesn't exist, create new entry
      const { error: insertError } = await supabase.from(destTable).insert({
        part_number: transfer.part_number,
        name: transfer.nama_barang,
        brand: transfer.brand || '',
        application: transfer.application || '',
        quantity: transfer.quantity,
        shelf: '-',
        price: 0,
        cost_price: 0,
        ecommerce: ''
      });

      if (insertError) {
        return { success: false, error: 'Failed to create item in destination' };
      }
    }

    // Update transfer status
    const { error: updateError } = await supabase
      .from('kirim_barang')
      .update({
        status: 'received',
        received_by: receivedBy,
        received_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('receiveKirimBarang Update Error:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('receiveKirimBarang Exception:', error);
    return { success: false, error: error.message };
  }
};

// Reject a request
export const rejectKirimBarang = async (
  id: string,
  rejectedBy: string,
  catatanReject: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Check if it was already sent (need to return stock)
    const { data: transfer, error: fetchError } = await supabase
      .from('kirim_barang')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !transfer) {
      return { success: false, error: 'Transfer not found' };
    }

    // If status is 'sent', we need to return stock to source
    if (transfer.status === 'sent') {
      const sourceTable = transfer.from_store === 'mjm' ? 'base_mjm' : 'base_bjw';
      const { data: sourceItem, error: sourceError } = await supabase
        .from(sourceTable)
        .select('quantity')
        .eq('part_number', transfer.part_number)
        .single();

      if (!sourceError && sourceItem) {
        const newQty = (sourceItem.quantity || 0) + transfer.quantity;
        await supabase
          .from(sourceTable)
          .update({ quantity: newQty })
          .eq('part_number', transfer.part_number);
      }
    }

    const { error } = await supabase
      .from('kirim_barang')
      .update({
        status: 'rejected',
        catatan_reject: catatanReject,
        rejected_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('rejectKirimBarang Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('rejectKirimBarang Exception:', error);
    return { success: false, error: error.message };
  }
};

// Delete a request (only pending)
export const deleteKirimBarang = async (
  id: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('kirim_barang')
      .delete()
      .eq('id', id)
      .eq('status', 'pending'); // Only allow deleting pending requests

    if (error) {
      console.error('deleteKirimBarang Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('deleteKirimBarang Exception:', error);
    return { success: false, error: error.message };
  }
};

// Get stock comparison for a specific part number
export const getStockComparison = async (
  partNumber: string
): Promise<{ mjm: number; bjw: number }> => {
  try {
    const [mjmResult, bjwResult] = await Promise.all([
      supabase
        .from('base_mjm')
        .select('quantity')
        .eq('part_number', partNumber)
        .single(),
      supabase
        .from('base_bjw')
        .select('quantity')
        .eq('part_number', partNumber)
        .single()
    ]);

    return {
      mjm: mjmResult.data?.quantity || 0,
      bjw: bjwResult.data?.quantity || 0
    };
  } catch (error) {
    console.error('getStockComparison Error:', error);
    return { mjm: 0, bjw: 0 };
  }
};

// Search items from both stores
export const searchItemsBothStores = async (
  query: string
): Promise<{
  mjm: StockItem[];
  bjw: StockItem[];
}> => {
  if (!query || query.length < 2) return { mjm: [], bjw: [] };

  try {
    const searchPattern = `%${query}%`;

    const [mjmResult, bjwResult] = await Promise.all([
      supabase
        .from('base_mjm')
        .select('part_number, name, brand, application, quantity, shelf')
        .or(`part_number.ilike.${searchPattern},name.ilike.${searchPattern}`)
        .order('part_number')
        .limit(50),
      supabase
        .from('base_bjw')
        .select('part_number, name, brand, application, quantity, shelf')
        .or(`part_number.ilike.${searchPattern},name.ilike.${searchPattern}`)
        .order('part_number')
        .limit(50)
    ]);

    return {
      mjm: (mjmResult.data || []).map(item => ({
        part_number: item.part_number || '',
        name: item.name || '',
        brand: item.brand || '',
        application: item.application || '',
        quantity: item.quantity || 0,
        shelf: item.shelf || ''
      })),
      bjw: (bjwResult.data || []).map(item => ({
        part_number: item.part_number || '',
        name: item.name || '',
        brand: item.brand || '',
        application: item.application || '',
        quantity: item.quantity || 0,
        shelf: item.shelf || ''
      }))
    };
  } catch (error) {
    console.error('searchItemsBothStores Error:', error);
    return { mjm: [], bjw: [] };
  }
};
