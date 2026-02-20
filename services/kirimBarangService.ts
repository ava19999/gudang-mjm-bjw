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

const normalizePartNumber = (partNumber: string): string => (
  String(partNumber || '').trim().toUpperCase()
);

const getBarangMasukTable = (store: 'mjm' | 'bjw'): 'barang_masuk_mjm' | 'barang_masuk_bjw' => (
  store === 'mjm' ? 'barang_masuk_mjm' : 'barang_masuk_bjw'
);

const getTransferCustomerLabel = (fromStore: 'mjm' | 'bjw'): string => (
  `BARANG MASUK ${String(fromStore || '').trim().toUpperCase()}`
);

interface EnsureTransferInLogOptions {
  stokAkhir?: number;
  shelf?: string;
  receivedAtIso?: string;
}

const ensureTransferIncomingLog = async (
  transfer: Pick<
    KirimBarangItem,
    'from_store' | 'to_store' | 'part_number' | 'nama_barang' | 'brand' | 'application' | 'quantity' | 'created_at' | 'updated_at' | 'received_at'
  >,
  options: EnsureTransferInLogOptions = {}
): Promise<{ success: boolean; error?: string }> => {
  try {
    const transferQty = Number(transfer.quantity || 0);
    if (transferQty <= 0) {
      return { success: false, error: 'Qty transfer tidak valid' };
    }

    const inLogTable = getBarangMasukTable(transfer.to_store);
    const transferCustomer = getTransferCustomerLabel(transfer.from_store);
    const receivedAtIso = options.receivedAtIso
      || transfer.received_at
      || transfer.updated_at
      || transfer.created_at
      || getWIBDate().toISOString();

    let finalDestQty = Number(options.stokAkhir);
    let destinationShelf = options.shelf || '-';

    if (!Number.isFinite(finalDestQty)) {
      const destTable = transfer.to_store === 'mjm' ? 'base_mjm' : 'base_bjw';
      const { data: latestDestStock, error: latestDestStockError } = await supabase
        .from(destTable)
        .select('quantity, shelf')
        .eq('part_number', transfer.part_number)
        .maybeSingle();

      if (!latestDestStockError && latestDestStock) {
        finalDestQty = Number(latestDestStock.quantity || 0);
        destinationShelf = latestDestStock.shelf || destinationShelf;
      }
    }

    if (!Number.isFinite(finalDestQty)) {
      finalDestQty = transferQty;
    }

    const receivedDate = new Date(receivedAtIso);
    const hasValidReceivedDate = !Number.isNaN(receivedDate.getTime());
    const matchToleranceMs = 2 * 1000;
    const existingWindowStart = hasValidReceivedDate
      ? new Date(receivedDate.getTime() - matchToleranceMs).toISOString()
      : null;
    const existingWindowEnd = hasValidReceivedDate
      ? new Date(receivedDate.getTime() + matchToleranceMs).toISOString()
      : null;

    let existingLogQuery = supabase
      .from(inLogTable)
      .select('id')
      .eq('part_number', transfer.part_number)
      .eq('customer', transferCustomer)
      .eq('qty_masuk', transferQty)
      .limit(1);

    if (existingWindowStart && existingWindowEnd) {
      existingLogQuery = existingLogQuery
        .gte('created_at', existingWindowStart)
        .lte('created_at', existingWindowEnd);
    }

    const { data: existingLog, error: existingLogError } = await existingLogQuery.maybeSingle();
    if (existingLogError && existingLogError.code !== 'PGRST116') {
      console.error('ensureTransferIncomingLog Existing Log Check Error:', existingLogError);
    }

    if (existingLog) {
      return { success: true };
    }

    const logPayload = {
      part_number: transfer.part_number,
      nama_barang: transfer.nama_barang || transfer.part_number,
      brand: transfer.brand || '',
      application: transfer.application || '',
      rak: destinationShelf,
      qty_masuk: transferQty,
      harga_satuan: 0,
      harga_total: 0,
      customer: transferCustomer,
      ecommerce: '-',
      tempo: 'CASH',
      stok_akhir: finalDestQty,
      created_at: hasValidReceivedDate ? receivedDate.toISOString() : getWIBDate().toISOString()
    };

    const { error: insertLogError } = await supabase
      .from(inLogTable)
      .insert([logPayload]);

    if (insertLogError) {
      console.error('ensureTransferIncomingLog Insert Log Error:', insertLogError);
      return { success: false, error: insertLogError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('ensureTransferIncomingLog Exception:', error);
    return { success: false, error: error.message };
  }
};

const dedupePendingRequests = (items: KirimBarangItem[]): KirimBarangItem[] => {
  const seenPendingKeys = new Set<string>();
  const result: KirimBarangItem[] = [];

  for (const item of items) {
    if (item.status !== 'pending') {
      result.push(item);
      continue;
    }

    const dedupeKey = `${item.from_store}|${item.to_store}|${normalizePartNumber(item.part_number)}`;
    if (seenPendingKeys.has(dedupeKey)) {
      continue;
    }

    seenPendingKeys.add(dedupeKey);
    result.push(item);
  }

  return result;
};

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
  filter?: 'all' | 'incoming' | 'outgoing' | 'rejected' | 'pending' | 'approved' | 'completed'
): Promise<KirimBarangItem[]> => {
  try {
    let query = supabase
      .from('kirim_barang')
      .select('*')
      .order('created_at', { ascending: false });

    if (store && filter === 'incoming') {
      query = query.eq('to_store', store);
      query = query.in('status', ['pending', 'approved', 'sent']);
    } else if (store && filter === 'outgoing') {
      query = query.eq('from_store', store);
      query = query.in('status', ['pending', 'approved', 'sent']);
    } else if (filter === 'rejected') {
      query = query.eq('status', 'rejected');
    } else if (filter === 'pending') {
      query = query.eq('status', 'pending');
    } else if (filter === 'approved') {
      query = query.eq('status', 'approved');
    } else if (filter === 'completed') {
      query = query.eq('status', 'received');
    }

    const { data, error } = await query;

    if (error) {
      console.error('fetchKirimBarang Error:', error);
      return [];
    }

    const dedupedData = dedupePendingRequests((data || []) as KirimBarangItem[]);

    // Auto-sync transfer yang sudah diterima agar masuk ke Detail Barang Masuk.
    const receivedTransfers = dedupedData.filter(item => (
      item.status === 'received' && (!store || item.to_store === store)
    ));

    if (receivedTransfers.length > 0) {
      await Promise.all(receivedTransfers.map(async transfer => {
        const syncResult = await ensureTransferIncomingLog(transfer);
        if (!syncResult.success) {
          console.warn(`fetchKirimBarang sync log gagal untuk transfer ${transfer.id}:`, syncResult.error);
        }
      }));
    }

    return dedupedData;
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
    const normalizedPartNumber = normalizePartNumber(request.part_number);
    if (!normalizedPartNumber) {
      return { success: false, error: 'Part number wajib diisi' };
    }

    const { data: existingPending, error: existingPendingError } = await supabase
      .from('kirim_barang')
      .select('id, quantity, catatan')
      .eq('from_store', request.from_store)
      .eq('to_store', request.to_store)
      .eq('status', 'pending')
      .ilike('part_number', normalizedPartNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPendingError) {
      console.error('createKirimBarangRequest existingPending Error:', existingPendingError);
      return { success: false, error: existingPendingError.message };
    }

    if (existingPending) {
      const { error: updateError } = await supabase
        .from('kirim_barang')
        .update({
          quantity: (existingPending.quantity || 0) + request.quantity,
          nama_barang: request.nama_barang,
          brand: request.brand || null,
          application: request.application || null,
          catatan: request.catatan?.trim() ? request.catatan : existingPending.catatan,
          requested_by: request.requested_by
        })
        .eq('id', existingPending.id);

      if (updateError) {
        console.error('createKirimBarangRequest merge Error:', updateError);
        return { success: false, error: updateError.message };
      }
    } else {
      const { error } = await supabase.from('kirim_barang').insert({
        from_store: request.from_store,
        to_store: request.to_store,
        part_number: normalizedPartNumber,
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
  approvedBy: string,
  quantityOverride?: number
): Promise<{ success: boolean; error?: string }> => {
  try {
    const parsedOverride = typeof quantityOverride === 'number'
      ? Math.floor(quantityOverride)
      : null;
    if (parsedOverride !== null && parsedOverride <= 0) {
      return { success: false, error: 'Qty harus lebih dari 0' };
    }

    const updatePayload: Record<string, any> = {
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString()
    };

    if (parsedOverride !== null) {
      updatePayload.quantity = parsedOverride;
    }

    const { error } = await supabase
      .from('kirim_barang')
      .update(updatePayload)
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
  sentBy: string,
  quantityOverride?: number
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

    const parsedOverride = typeof quantityOverride === 'number'
      ? Math.floor(quantityOverride)
      : null;
    const quantityToSend = parsedOverride !== null ? parsedOverride : transfer.quantity;

    if (quantityToSend <= 0) {
      return { success: false, error: 'Qty kirim harus lebih dari 0' };
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

    if (sourceItem.quantity < quantityToSend) {
      return { success: false, error: `Stok tidak cukup. Tersedia: ${sourceItem.quantity}` };
    }

    // Decrease stock from source
    const newSourceQty = sourceItem.quantity - quantityToSend;
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
        sent_at: new Date().toISOString(),
        quantity: quantityToSend
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

    const transferQty = Number(transfer.quantity || 0);
    if (transferQty <= 0) {
      return { success: false, error: 'Qty transfer tidak valid' };
    }

    if (transfer.status !== 'sent' && transfer.status !== 'received') {
      return { success: false, error: 'Transfer belum berstatus dikirim' };
    }

    // Get destination table
    const destTable = transfer.to_store === 'mjm' ? 'base_mjm' : 'base_bjw';
    const receivedAtIso = transfer.received_at || getWIBDate().toISOString();

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

    let finalDestQty = destItem ? Number(destItem.quantity || 0) : transferQty;
    let destinationShelf = destItem?.shelf || '-';

    // Only mutate stock + status when transfer is still in sent state.
    if (transfer.status === 'sent') {
      if (destItem) {
        // Item exists, increase quantity
        finalDestQty = (destItem.quantity || 0) + transferQty;
        const { error: updateDestError } = await supabase
          .from(destTable)
          .update({ quantity: finalDestQty })
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
          quantity: transferQty,
          shelf: '-',
          price: 0,
          cost_price: 0,
          ecommerce: ''
        });

        if (insertError) {
          return { success: false, error: 'Failed to create item in destination' };
        }

        destinationShelf = '-';
        finalDestQty = transferQty;
      }

      // Update transfer status
      const { error: updateError } = await supabase
        .from('kirim_barang')
        .update({
          status: 'received',
          received_by: receivedBy,
          received_at: receivedAtIso
        })
        .eq('id', id);

      if (updateError) {
        console.error('receiveKirimBarang Update Error:', updateError);
        return { success: false, error: updateError.message };
      }
    }

    const syncLogResult = await ensureTransferIncomingLog(transfer, {
      stokAkhir: finalDestQty,
      shelf: destinationShelf,
      receivedAtIso
    });
    if (!syncLogResult.success) {
      return {
        success: false,
        error: `Barang diterima, tapi gagal masuk Detail Barang Masuk: ${syncLogResult.error}`
      };
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

// Get stock comparison for multiple part numbers in one request
export const getBulkStockComparison = async (
  partNumbers: string[]
): Promise<Record<string, { mjm: number; bjw: number }>> => {
  const uniquePartNumbers = Array.from(new Set(partNumbers.filter(Boolean)));
  if (uniquePartNumbers.length === 0) return {};

  try {
    const [mjmResult, bjwResult] = await Promise.all([
      supabase
        .from('base_mjm')
        .select('part_number, quantity')
        .in('part_number', uniquePartNumbers),
      supabase
        .from('base_bjw')
        .select('part_number, quantity')
        .in('part_number', uniquePartNumbers)
    ]);

    const stockMap: Record<string, { mjm: number; bjw: number }> = {};

    uniquePartNumbers.forEach(partNumber => {
      stockMap[partNumber] = { mjm: 0, bjw: 0 };
    });

    (mjmResult.data || []).forEach((item: any) => {
      const partNumber = item.part_number || '';
      if (!partNumber) return;
      if (!stockMap[partNumber]) {
        stockMap[partNumber] = { mjm: 0, bjw: 0 };
      }
      stockMap[partNumber].mjm = item.quantity || 0;
    });

    (bjwResult.data || []).forEach((item: any) => {
      const partNumber = item.part_number || '';
      if (!partNumber) return;
      if (!stockMap[partNumber]) {
        stockMap[partNumber] = { mjm: 0, bjw: 0 };
      }
      stockMap[partNumber].bjw = item.quantity || 0;
    });

    return stockMap;
  } catch (error) {
    console.error('getBulkStockComparison Error:', error);
    return {};
  }
};

// Update part number on pending request based on sender store master stock
export const updateKirimBarangPartNumber = async (
  id: string,
  partNumber: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const normalizedPartNumber = normalizePartNumber(partNumber);
    if (!normalizedPartNumber) {
      return { success: false, error: 'Part number wajib diisi' };
    }

    const { data: currentRequest, error: currentRequestError } = await supabase
      .from('kirim_barang')
      .select('id, from_store, to_store, status, quantity, part_number, nama_barang')
      .eq('id', id)
      .single();

    if (currentRequestError || !currentRequest) {
      return { success: false, error: 'Request tidak ditemukan' };
    }

    if (currentRequest.status !== 'pending') {
      return { success: false, error: 'Part number hanya bisa diubah saat status pending' };
    }

    const sourceTable = currentRequest.from_store === 'mjm' ? 'base_mjm' : 'base_bjw';
    const { data: sourceItem, error: sourceItemError } = await supabase
      .from(sourceTable)
      .select('part_number, name, brand, application')
      .ilike('part_number', normalizedPartNumber)
      .order('part_number')
      .limit(1)
      .maybeSingle();

    if (sourceItemError || !sourceItem) {
      return { success: false, error: 'Part number tidak ditemukan di master pengirim' };
    }

    const resolvedPartNumber = normalizePartNumber(sourceItem.part_number || normalizedPartNumber);

    const { data: duplicatePending, error: duplicatePendingError } = await supabase
      .from('kirim_barang')
      .select('id, quantity')
      .eq('from_store', currentRequest.from_store)
      .eq('to_store', currentRequest.to_store)
      .eq('status', 'pending')
      .ilike('part_number', resolvedPartNumber)
      .neq('id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (duplicatePendingError) {
      return { success: false, error: duplicatePendingError.message };
    }

    if (duplicatePending) {
      const { error: mergeError } = await supabase
        .from('kirim_barang')
        .update({
          quantity: (duplicatePending.quantity || 0) + (currentRequest.quantity || 0)
        })
        .eq('id', duplicatePending.id);

      if (mergeError) {
        return { success: false, error: mergeError.message };
      }

      const { error: deleteError } = await supabase
        .from('kirim_barang')
        .delete()
        .eq('id', id)
        .eq('status', 'pending');

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }

      return { success: true };
    }

    const { error: updateError } = await supabase
      .from('kirim_barang')
      .update({
        part_number: resolvedPartNumber,
        nama_barang: sourceItem.name || currentRequest.nama_barang,
        brand: sourceItem.brand || null,
        application: sourceItem.application || null
      })
      .eq('id', id)
      .eq('status', 'pending');

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('updateKirimBarangPartNumber Exception:', error);
    return { success: false, error: error.message };
  }
};

// Get shelf comparison for multiple part numbers in one request
export const getBulkShelfComparison = async (
  partNumbers: string[]
): Promise<Record<string, { mjm: string; bjw: string }>> => {
  const uniquePartNumbers = Array.from(new Set(partNumbers.filter(Boolean)));
  if (uniquePartNumbers.length === 0) return {};

  try {
    const [mjmResult, bjwResult] = await Promise.all([
      supabase
        .from('base_mjm')
        .select('part_number, shelf')
        .in('part_number', uniquePartNumbers),
      supabase
        .from('base_bjw')
        .select('part_number, shelf')
        .in('part_number', uniquePartNumbers)
    ]);

    const shelfMap: Record<string, { mjm: string; bjw: string }> = {};

    uniquePartNumbers.forEach(partNumber => {
      shelfMap[partNumber] = { mjm: '-', bjw: '-' };
    });

    (mjmResult.data || []).forEach((item: any) => {
      const partNumber = item.part_number || '';
      if (!partNumber) return;
      if (!shelfMap[partNumber]) {
        shelfMap[partNumber] = { mjm: '-', bjw: '-' };
      }
      shelfMap[partNumber].mjm = item.shelf || '-';
    });

    (bjwResult.data || []).forEach((item: any) => {
      const partNumber = item.part_number || '';
      if (!partNumber) return;
      if (!shelfMap[partNumber]) {
        shelfMap[partNumber] = { mjm: '-', bjw: '-' };
      }
      shelfMap[partNumber].bjw = item.shelf || '-';
    });

    return shelfMap;
  } catch (error) {
    console.error('getBulkShelfComparison Error:', error);
    return {};
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
