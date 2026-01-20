// FILE: services/supabaseService.ts
import { supabase } from './supabaseClient';
import { 
  InventoryItem, 
  InventoryFormData, 
  OfflineOrderRow,
  OnlineOrderRow,
  SoldItemRow,
  ReturRow
} from '../types';
import { getWIBDate } from '../utils/timezone';

// --- HELPER: NAMA TABEL ---
const getTableName = (store: string | null | undefined) => {
  if (store === 'mjm') return 'base_mjm';
  if (store === 'bjw') return 'base_bjw';
  console.warn(`Store tidak valid (${store}), menggunakan default base_mjm`);
  return 'base_mjm';
};

const getLogTableName = (baseName: 'barang_masuk' | 'barang_keluar', store: string | null | undefined) => {
  if (store === 'mjm') return `${baseName}_mjm`;
  if (store === 'bjw') return `${baseName}_bjw`;
  console.warn(`Store tidak valid (${store}), menggunakan default ${baseName}_mjm`);
  return `${baseName}_mjm`;
};

// --- HELPER: SAFE DATE PARSING ---
const parseDateToNumber = (dateVal: any): number => {
  if (!dateVal) return Date.now();
  if (typeof dateVal === 'number') return dateVal;
  const parsed = new Date(dateVal).getTime();
  return isNaN(parsed) ? Date.now() : parsed;
};

// --- HELPER: MAPPING FOTO ---
const mapPhotoRowToImages = (photoRow: any): string[] => {
  if (!photoRow) return [];
  const images: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const url = photoRow[`foto_${i}`];
    if (url && typeof url === 'string' && url.trim() !== '') images.push(url);
  }
  return images;
};

const mapImagesToPhotoRow = (partNumber: string, images: string[]) => {
  const row: any = { part_number: partNumber };
  for (let i = 1; i <= 10; i++) row[`foto_${i}`] = null;
  images.forEach((url, index) => {
    if (index < 10) row[`foto_${index + 1}`] = url;
  });
  return row;
};

// --- HELPER: MAPPING DATA ITEM ---
const mapItemFromDB = (item: any, photoData?: any): InventoryItem => {
  const pk = item.part_number || item.partNumber || '';
  
  const imagesFromTable = photoData ? mapPhotoRowToImages(photoData) : [];
  const finalImages = imagesFromTable.length > 0 
    ? imagesFromTable 
    : (item.image_url ? [item.image_url] : []);

  return {
    ...item,
    id: pk, 
    partNumber: pk,
    name: item.name,
    brand: item.brand,
    application: item.application,
    shelf: item.shelf,
    quantity: Number(item.quantity || 0),
    price: 0, 
    costPrice: 0, 
    imageUrl: finalImages[0] || item.image_url || '',
    images: finalImages,
    ecommerce: '', 
    initialStock: 0, 
    qtyIn: 0, 
    qtyOut: 0,
    lastUpdated: parseDateToNumber(item.created_at || item.last_updated) 
  };
};

const mapItemToDB = (data: any) => {
  const dbPayload: any = {
    part_number: data.partNumber || data.part_number, 
    name: data.name,
    brand: data.brand,
    application: data.application,
    shelf: data.shelf,
    quantity: Number(data.quantity) || 0,
    created_at: getWIBDate().toISOString()
  };
  Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);
  return dbPayload;
};

// --- HELPER: FETCH HARGA & FOTO ---
interface PriceData { part_number: string; harga: number; }

const fetchLatestPricesForItems = async (items: any[], store?: string | null): Promise<Record<string, PriceData>> => {
  if (!items || items.length === 0) return {};
  const partNumbersToCheck = items.map(i => {
       const pn = i.part_number || i.partNumber;
       return typeof pn === 'string' ? pn.trim() : pn;
  }).filter(Boolean);
  if (partNumbersToCheck.length === 0) return {};

  try {
    const { data, error } = await supabase.from('list_harga_jual').select('part_number, harga').in('part_number', partNumbersToCheck);
    if (error) return {};
    const priceMap: Record<string, PriceData> = {};
    (data || []).forEach((row: any) => {
      if (row.part_number) priceMap[row.part_number.trim()] = { part_number: row.part_number, harga: Number(row.harga || 0) };
    });
    return priceMap;
  } catch (e) { return {}; }
};

const fetchPhotosForItems = async (items: any[]) => {
  if (!items || items.length === 0) return {};
  const partNumbers = items.map(i => i.part_number || i.partNumber).filter(Boolean);
  if (partNumbers.length === 0) return {};
  try {
    const { data } = await supabase.from('foto').select('*').in('part_number', partNumbers);
    const photoMap: Record<string, any> = {};
    (data || []).forEach((row: any) => { if (row.part_number) photoMap[row.part_number] = row; });
    return photoMap;
  } catch (e) { return {}; }
};

const savePhotosToTable = async (partNumber: string, images: string[]) => {
  if (!partNumber) return;
  try {
    const photoPayload = mapImagesToPhotoRow(partNumber, images);
    await supabase.from('foto').upsert(photoPayload, { onConflict: 'part_number' });
  } catch (e) { console.error('Error saving photos:', e); }
};

// --- INVENTORY FUNCTIONS ---

export const fetchInventory = async (store?: string | null): Promise<InventoryItem[]> => {
  const table = getTableName(store);
  const { data: items, error } = await supabase.from(table).select('*').order('name', { ascending: true });
  
  if (error || !items) return [];

  const photoMap = await fetchPhotosForItems(items);
  const priceMap = await fetchLatestPricesForItems(items, store);

  return items.map(item => {
    const mapped = mapItemFromDB(item, photoMap[item.part_number]);
    const lookupKey = (item.part_number || '').trim();
    if (priceMap[lookupKey]) mapped.price = priceMap[lookupKey].harga; 
    return mapped;
  });
};

export const fetchInventoryPaginated = async (store: string | null, page: number, perPage: number, filters?: any): Promise<{ data: InventoryItem[]; total: number }> => {
  const table = getTableName(store);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  let query = supabase.from(table).select('*', { count: 'exact' });

  if (filters?.search) query = query.or(`name.ilike.%${filters.search}%,part_number.ilike.%${filters.search}%`);
  if (filters?.brand) query = query.ilike('brand', `%${filters.brand}%`);

  const { data: items, count, error } = await query.range(from, to).order('name', { ascending: true });
  if (error || !items) return { data: [], total: 0 };

  const photoMap = await fetchPhotosForItems(items);
  const priceMap = await fetchLatestPricesForItems(items, store);

  return { 
    data: items.map(item => {
      const mapped = mapItemFromDB(item, photoMap[item.part_number]);
      const lookupKey = (item.part_number || '').trim();
      if (priceMap[lookupKey]) mapped.price = priceMap[lookupKey].harga; 
      return mapped;
    }), 
    total: count || 0 
  };
};

export const fetchInventoryStats = async (store: string | null): Promise<any> => {
  const items = await fetchInventory(store); 
  const totalItems = items.length;
  const totalValue = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const lowStock = items.filter(item => item.quantity < 5).length; 
  return { totalItems, totalValue, lowStock };
};

export const fetchInventoryAllFiltered = async (store: string | null, filters?: any): Promise<InventoryItem[]> => {
  return await fetchInventory(store); 
};

// --- ADD & UPDATE & DELETE INVENTORY ---

export const addInventory = async (data: InventoryFormData, store?: string | null): Promise<string | null> => {
  const table = getTableName(store);
  if (!data.partNumber) { alert("Part Number wajib!"); return null; }
  const payload = mapItemToDB(data);
  const { error } = await supabase.from(table).insert([payload]);
  
  if (error) {
    alert(`Gagal Tambah: ${error.message}`);
    return null;
  }
  if (data.partNumber) await savePhotosToTable(data.partNumber, data.images);
  return data.partNumber;
};

// --- UPDATE INVENTORY (LOGIC BARANG MASUK/KELUAR) ---
export const updateInventory = async (arg1: any, arg2?: any, arg3?: any): Promise<InventoryItem | null> => {
  let item: InventoryItem = arg1;
  let transactionData: any = arg2;
  let store: string | null | undefined = arg3;

  const pk = item.partNumber;
  if (!pk) return null;
  const table = getTableName(store);
  
  // 1. Update Stok Utama
  const { error } = await supabase.from(table).update(mapItemToDB(item)).eq('part_number', pk);
  if (error) { alert(`Gagal Update Stok: ${error.message}`); return null; }

  await savePhotosToTable(pk, item.images || []);

  // 2. Insert Log Mutasi
  if (transactionData) {
     try {
       const isBarangMasuk = transactionData.type === 'in';
       const logTable = getLogTableName(isBarangMasuk ? 'barang_masuk' : 'barang_keluar', store);
       const validTempo = isBarangMasuk ? (transactionData.tempo || 'CASH') : (transactionData.resiTempo || transactionData.tempo || '-');

       let finalLogData: any = {
           part_number: pk,
           brand: item.brand,
           application: item.application,
           rak: item.shelf,
           ecommerce: transactionData.ecommerce || '-',
           customer: transactionData.customer || '-',
           tempo: validTempo,
           created_at: transactionData.tanggal ? new Date(transactionData.tanggal).toISOString() : getWIBDate().toISOString()
       };

       if (isBarangMasuk) {
          finalLogData = {
              ...finalLogData,
              nama_barang: item.name,
              stok_akhir: item.quantity,
              qty_masuk: Number(transactionData.qty),
              harga_satuan: Number(transactionData.price || 0),
              harga_total: Number(transactionData.qty) * Number(transactionData.price || 0)
          };
       } else {
          finalLogData = {
              ...finalLogData,
              name: item.name,
              stock_ahir: item.quantity,
              qty_keluar: Number(transactionData.qty),
              harga_satuan: Number(item.price || 0),
              harga_total: Number(item.price || 0) * Number(transactionData.qty),
              resi: transactionData.resiTempo || '-'
          };
       }
       
       await supabase.from(logTable).insert([finalLogData]);
     } catch (e: any) { 
        console.error('Gagal log mutasi:', e);
     }
  }
  return item;
};

export const deleteInventory = async (id: string, store?: string | null): Promise<boolean> => {
  const table = getTableName(store);
  const { error } = await supabase.from(table).delete().eq('part_number', id);
  return !error;
};

export const getItemByPartNumber = async (partNumber: string, store?: string | null): Promise<InventoryItem | null> => {
  const table = getTableName(store);
  const { data, error } = await supabase.from(table).select('*').eq('part_number', partNumber).maybeSingle();
  if (error || !data) return null;
  
  const photoMap = await fetchPhotosForItems([data]);
  const priceMap = await fetchLatestPricesForItems([data], store);
  
  const mapped = mapItemFromDB(data, photoMap[data.part_number]);
  const lookupKey = (data.part_number || '').trim();
  if (priceMap[lookupKey]) {
      mapped.price = priceMap[lookupKey].harga;
  }
  return mapped;
};

export const fetchBarangMasukLog = async (store: string | null, page = 1, limit = 20, search = '') => {
    const table = getLogTableName('barang_masuk', store);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase.from(table).select('*', { count: 'exact' });

    if (search) {
        query = query.or(`part_number.ilike.%${search}%,nama_barang.ilike.%${search}%,customer.ilike.%${search}%`);
    }

    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);

    if (error) {
        console.error("Error fetching barang masuk:", error);
        return { data: [], total: 0 };
    }
    
    const mappedData = (data || []).map(row => ({
        ...row,
        name: row.nama_barang || row.name, 
        quantity: row.qty_masuk
    }));

    return { data: mappedData, total: count || 0 };
};

// --- SHOP ITEMS ---
interface ShopItemFilters {
  searchTerm?: string;
  category?: string;
  partNumberSearch?: string;
  nameSearch?: string;
  brandSearch?: string;
  applicationSearch?: string;
}

export const fetchShopItems = async (
  page: number = 1,
  perPage: number = 50,
  filters: ShopItemFilters = {},
  store?: string | null
): Promise<{ data: InventoryItem[]; count: number }> => {
  const table = getTableName(store);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const { searchTerm = '', partNumberSearch = '', nameSearch = '', brandSearch = '', applicationSearch = '' } = filters;

  try {
    let query = supabase.from(table).select('*', { count: 'exact' }); 

    if (searchTerm) query = query.or(`name.ilike.%${searchTerm}%,part_number.ilike.%${searchTerm}%`);
    if (partNumberSearch) query = query.ilike('part_number', `%${partNumberSearch}%`);
    if (nameSearch) query = query.ilike('name', `%${nameSearch}%`);
    if (brandSearch) query = query.ilike('brand', `%${brandSearch}%`);
    if (applicationSearch) query = query.ilike('application', `%${applicationSearch}%`);

    const { data: items, count, error } = await query.range(from, to).order('name', { ascending: true });

    if (error || !items || items.length === 0) return { data: [], count: count || 0 };

    const photoMap = await fetchPhotosForItems(items);
    const priceMap = await fetchLatestPricesForItems(items, store);

    const mappedItems = items.map(item => {
      const baseItem = mapItemFromDB(item, photoMap[item.part_number]);
      const lookupKey = (item.part_number || '').trim();
      const latestPrice = priceMap[lookupKey];
      return {
        ...baseItem,
        price: latestPrice ? latestPrice.harga : 0, 
        isLowStock: baseItem.quantity < 5
      };
    });

    return { data: mappedItems, count: count || 0 };
  } catch (error) {
    console.error('[fetchShopItems] Unexpected error:', error);
    return { data: [], count: 0 };
  }
};


// --- ORDER MANAGEMENT SYSTEM (UPDATED) ---

// 1. UPDATE DATA ORDER (Fitur Edit)
export const updateOfflineOrder = async (
  id: string,
  updates: { partNumber: string; quantity: number; price: number },
  store: string | null
): Promise<{ success: boolean; msg: string }> => {
  const table = store === 'mjm' ? 'orders_mjm' : (store === 'bjw' ? 'orders_bjw' : null);
  if (!table) return { success: false, msg: 'Toko tidak valid' };

  try {
    const hargaTotal = updates.quantity * updates.price;
    
    const { error } = await supabase
      .from(table)
      .update({
        part_number: updates.partNumber,
        quantity: updates.quantity,
        harga_satuan: updates.price,
        harga_total: hargaTotal
      })
      .eq('id', id);

    if (error) throw error;
    return { success: true, msg: 'Data pesanan berhasil diupdate.' };
  } catch (error: any) {
    console.error('Update Order Error:', error);
    return { success: false, msg: `Gagal update: ${error.message}` };
  }
};

// 2. FETCH OFFLINE
export const fetchOfflineOrders = async (store: string | null): Promise<OfflineOrderRow[]> => {
  const table = store === 'mjm' ? 'orders_mjm' : (store === 'bjw' ? 'orders_bjw' : null);
  if (!table) return [];

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('status', 'Belum Diproses')
    .order('tanggal', { ascending: false });

  if (error) { console.error(`Fetch Offline Error:`, error); return []; }
  return data || [];
};

// 3. FETCH ONLINE
export const fetchOnlineOrders = async (store: string | null): Promise<OnlineOrderRow[]> => {
  const table = store === 'mjm' ? 'scan_resi_mjm' : (store === 'bjw' ? 'scan_resi_bjw' : null);
  if (!table) return [];

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .neq('status', 'Diproses') 
    .order('tanggal', { ascending: false });

  if (error) { console.error('Fetch Online Error:', error); return []; }
  return data || [];
};

// 4. FETCH SOLD ITEMS
export const fetchSoldItems = async (store: string | null): Promise<SoldItemRow[]> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return [];

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) { console.error('Fetch Sold Error:', error); return []; }
  return data || [];
};

// 5. FETCH RETUR
export const fetchReturItems = async (store: string | null): Promise<ReturRow[]> => {
  const table = store === 'mjm' ? 'retur_mjm' : (store === 'bjw' ? 'retur_bjw' : null);
  if (!table) return [];

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('tanggal_retur', { ascending: false });

  if (error) { console.error('Fetch Retur Error:', error); return []; }
  return data || [];
};

// --- PROCESSING LOGIC (ACC / TOLAK) ---

export const processOfflineOrderItem = async (
  item: OfflineOrderRow, 
  store: string | null,
  action: 'Proses' | 'Tolak'
): Promise<{ success: boolean; msg: string }> => {
  const orderTable = store === 'mjm' ? 'orders_mjm' : (store === 'bjw' ? 'orders_bjw' : null);
  const stockTable = store === 'mjm' ? 'base_mjm' : (store === 'bjw' ? 'base_bjw' : null);
  const outTable = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);

  if (!orderTable || !stockTable || !outTable) return { success: false, msg: 'Toko tidak valid' };

  try {
    // --- TOLAK = HAPUS (DELETE) ---
    if (action === 'Tolak') {
      const { error } = await supabase.from(orderTable).delete().eq('id', item.id);
      if (error) throw error;
      return { success: true, msg: 'Pesanan ditolak dan dihapus.' };
    }

    // --- PROSES = PINDAH KE BARANG KELUAR ---
    
    // 1. Cek Stok
    const { data: currentItem, error: fetchError } = await supabase.from(stockTable).select('*').eq('part_number', item.part_number).single();
    if (fetchError || !currentItem) return { success: false, msg: 'Barang tidak ditemukan di gudang.' };
    
    if (currentItem.quantity < item.quantity) {
      return { success: false, msg: `Stok tidak cukup! (Sisa: ${currentItem.quantity})` };
    }

    // 2. Kurangi Stok
    const newQty = currentItem.quantity - item.quantity;
    const { error: updateError } = await supabase.from(stockTable).update({ quantity: newQty }).eq('part_number', item.part_number);
    if (updateError) throw updateError;

    // 3. Masukkan ke Barang Keluar (Agar muncul di Tab Terjual)
    const logPayload = {
      tempo: item.tempo || 'CASH',
      ecommerce: 'OFFLINE',
      customer: item.customer,
      part_number: item.part_number,
      name: item.nama_barang,
      brand: currentItem.brand || '',
      application: currentItem.application || '',
      rak: currentItem.shelf || '',
      stock_ahir: newQty,
      qty_keluar: item.quantity,
      harga_satuan: item.harga_satuan,
      harga_total: item.harga_total,
      resi: '-',
      created_at: getWIBDate().toISOString()
    };
    await supabase.from(outTable).insert([logPayload]);

    // 4. Update Status Order jadi 'Proses' (Agar hilang dari list Belum Diproses)
    await supabase.from(orderTable).update({ status: 'Proses' }).eq('id', item.id);

    return { success: true, msg: 'Pesanan diproses & stok dipotong.' };
  } catch (error: any) {
    console.error('Process Error:', error);
    return { success: false, msg: `Error: ${error.message}` };
  }
};

export const processOnlineOrderItem = async (item: OnlineOrderRow, store: string | null): Promise<boolean> => {
  const scanTable = store === 'mjm' ? 'scan_resi_mjm' : (store === 'bjw' ? 'scan_resi_bjw' : null);
  const stockTable = store === 'mjm' ? 'base_mjm' : (store === 'bjw' ? 'base_bjw' : null);
  const outTable = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);

  if (!scanTable || !stockTable || !outTable) return false;

  try {
    const { data: stockItem } = await supabase.from(stockTable).select('*').eq('part_number', item.part_number).single();
    if (!stockItem || stockItem.quantity < item.quantity) {
      alert(`Stok ${item.nama_barang} tidak cukup!`);
      return false;
    }

    const newQty = stockItem.quantity - item.quantity;
    await supabase.from(stockTable).update({ quantity: newQty }).eq('part_number', item.part_number);

    await supabase.from(outTable).insert([{
      tempo: 'ONLINE',
      ecommerce: item.ecommerce,
      customer: item.customer,
      part_number: item.part_number,
      name: item.nama_barang,
      brand: stockItem.brand,
      application: stockItem.application,
      rak: stockItem.shelf,
      stock_ahir: newQty,
      qty_keluar: item.quantity,
      harga_satuan: item.harga_satuan,
      harga_total: item.harga_total,
      resi: item.resi,
      created_at: getWIBDate().toISOString()
    }]);

    await supabase.from(scanTable).update({ status: 'Diproses' }).eq('id', item.id);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

// --- OTHERS ---

export const saveOfflineOrder = async (
  cart: any[], 
  customerName: string, 
  tempo: string, 
  store: string | null
): Promise<boolean> => {
  const tableName = store === 'mjm' ? 'orders_mjm' : (store === 'bjw' ? 'orders_bjw' : null);
  if (!tableName) { alert("Error: Toko tidak teridentifikasi"); return false; }
  if (!cart || cart.length === 0) return false;

  const orderRows = cart.map(item => {
    // [FIX] Gunakan customPrice jika ada, jika tidak gunakan harga asli
    const finalPrice = item.customPrice ? Number(item.customPrice) : Number(item.price);

    return {
      tanggal: getWIBDate().toISOString(),
      customer: customerName,
      part_number: item.partNumber,
      nama_barang: item.name,
      quantity: Number(item.cartQuantity),
      harga_satuan: finalPrice, // Gunakan harga final (editan)
      harga_total: finalPrice * Number(item.cartQuantity), // Hitung total dari harga final
      status: 'Belum Diproses',
      tempo: tempo || 'CASH'
    };
  });

  try {
    const { error } = await supabase.from(tableName).insert(orderRows);
    if (error) throw error;
    return true;
  } catch (e: any) { 
    alert(`Gagal menyimpan order: ${e.message}`); 
    return false; 
  }
};

export const fetchBarangKeluarLog = async (store: string | null, page = 1, limit = 20, search = '') => {
    const table = getLogTableName('barang_keluar', store);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase.from(table).select('*', { count: 'exact' });

    if (search) {
        query = query.or(`part_number.ilike.%${search}%,name.ilike.%${search}%,customer.ilike.%${search}%`);
    }

    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);

    if (error) {
        console.error("Error fetching barang keluar:", error);
        return { data: [], total: 0 };
    }
    
    const mappedData = (data || []).map(row => ({
        ...row,
        name: row.name || row.nama_barang, 
        quantity: row.qty_keluar,
        customer: row.customer || '-',
        tempo: row.tempo || 'CASH'
    }));

    return { data: mappedData, total: count || 0 };
};

export const deleteBarangLog = async (
    id: number, 
    type: 'in' | 'out', 
    partNumber: string, 
    qty: number, 
    store: string | null
): Promise<boolean> => {
    const logTable = getLogTableName(type === 'in' ? 'barang_masuk' : 'barang_keluar', store);
    const stockTable = getTableName(store);

    try {
        if (!id || !partNumber || qty < 0) return false;

        const { data: currentItem, error: fetchError } = await supabase
            .from(stockTable)
            .select('quantity')
            .eq('part_number', partNumber)
            .single();

        if (fetchError || !currentItem) throw new Error("Item tidak ditemukan untuk rollback stok");

        let newQty = currentItem.quantity;
        if (type === 'in') newQty = Math.max(0, newQty - qty);
        else newQty = newQty + qty;

        const { error: deleteError } = await supabase.from(logTable).delete().eq('id', id);
        if (deleteError) throw new Error("Gagal menghapus log: " + deleteError.message);

        const { error: updateError } = await supabase
            .from(stockTable)
            .update({ quantity: newQty, last_updated: getWIBDate().toISOString() })
            .eq('part_number', partNumber);

        if (updateError) console.warn("WARNING: Log terhapus tapi stok gagal diupdate");

        return true;
    } catch (e) {
        console.error("Delete Log Error:", e);
        return false;
    }
};

export const fetchHistory = async () => [];
export const fetchItemHistory = async () => [];
export const fetchHistoryLogsPaginated = async () => ({ data: [], total: 0 });
export const addBarangMasuk = async () => {};
export const addBarangKeluar = async () => {};
export const fetchBarangMasuk = async () => [];
export const fetchBarangKeluar = async () => [];
export const fetchPriceHistoryBySource = async () => [];
export const fetchChatSessions = async () => [];
export const fetchChatMessages = async () => [];
export const sendChatMessage = async () => {};
export const markMessagesAsRead = async () => {};
export const fetchRetur = async () => [];
export const saveReturRecord = async () => {};
export const fetchReturRecords = fetchRetur;
export const addReturTransaction = saveReturRecord;
export const updateReturKeterangan = async () => {};
export const fetchScanResiLogs = async () => [];
export const addScanResiLog = async () => {};
export const saveScanResiLog = addScanResiLog;
export const updateScanResiLogField = async () => {};
export const deleteScanResiLog = async () => {};
export const duplicateScanResiLog = async () => {};
export const processShipmentToOrders = async () => {};
export const importScanResiFromExcel = async () => ({ success: true, skippedCount: 0 });
export const saveItemImages = async (itemId: string, images: string[], store?: string | null): Promise<void> => { };