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

// --- FETCH DISTINCT ECOMMERCE VALUES ---
export const fetchDistinctEcommerce = async (store: string | null): Promise<string[]> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return [];

  try {
    const { data, error } = await supabase
      .from(table)
      .select('ecommerce')
      .not('ecommerce', 'is', null)
      .not('ecommerce', 'eq', '');

    if (error) {
      console.error('Fetch Distinct Ecommerce Error:', error);
      return [];
    }

    // Get unique values
    const uniqueValues = [...new Set((data || []).map(d => d.ecommerce?.toUpperCase()).filter(Boolean))];
    return uniqueValues.sort();
  } catch (err) {
    console.error('Fetch Distinct Ecommerce Exception:', err);
    return [];
  }
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

  // Filter by part number
  if (filters?.partNumber) query = query.ilike('part_number', `%${filters.partNumber}%`);
  // Filter by name
  if (filters?.name) query = query.ilike('name', `%${filters.name}%`);
  // Filter by brand
  if (filters?.brand) query = query.ilike('brand', `%${filters.brand}%`);
  // Filter by application
  if (filters?.app) query = query.ilike('application', `%${filters.app}%`);
  // Filter by stock type
  if (filters?.type === 'low') query = query.gt('quantity', 0).lte('quantity', 3);
  if (filters?.type === 'empty') query = query.eq('quantity', 0);

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
  const table = getTableName(store);
  
  // 1. Get total items and total stock from inventory
  const { data: items, error } = await supabase.from(table).select('quantity, part_number');
  if (error || !items) return { totalItems: 0, totalStock: 0, totalAsset: 0, todayIn: 0, todayOut: 0 };
  
  const totalItems = items.length;
  const totalStock = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  
  // 2. Get today's start timestamp (WIB timezone)
  const now = new Date();
  const wibOffset = 7 * 60; // WIB = UTC+7
  const localOffset = now.getTimezoneOffset();
  const wibNow = new Date(now.getTime() + (localOffset + wibOffset) * 60000);
  const startOfDayWIB = new Date(wibNow.getFullYear(), wibNow.getMonth(), wibNow.getDate(), 0, 0, 0, 0);
  // Convert back to UTC for database query
  const startOfDayUTC = new Date(startOfDayWIB.getTime() - (localOffset + wibOffset) * 60000);
  const todayStart = startOfDayUTC.toISOString();
  
  // 3. Get today's incoming qty from barang_masuk
  const inTable = getLogTableName('barang_masuk', store);
  const { data: inData } = await supabase
    .from(inTable)
    .select('qty_masuk')
    .gte('created_at', todayStart);
  const todayIn = (inData || []).reduce((acc, row) => acc + (Number(row.qty_masuk) || 0), 0);
  
  // 4. Get today's outgoing qty from barang_keluar
  const outTable = getLogTableName('barang_keluar', store);
  const { data: outData } = await supabase
    .from(outTable)
    .select('qty_keluar')
    .gte('created_at', todayStart);
  const todayOut = (outData || []).reduce((acc, row) => acc + (Number(row.qty_keluar) || 0), 0);
  
  // 5. Calculate total asset (need prices)
  const priceMap = await fetchLatestPricesForItems(items, store);
  const totalAsset = items.reduce((acc, item) => {
    const pk = (item.part_number || '').trim();
    const price = priceMap[pk]?.harga || 0;
    return acc + (price * (Number(item.quantity) || 0));
  }, 0);
  
  return { totalItems, totalStock, totalAsset, todayIn, todayOut };
};

export const fetchInventoryAllFiltered = async (store: string | null, filters?: any): Promise<InventoryItem[]> => {
  const table = getTableName(store);
  let query = supabase.from(table).select('*');

  // Filter by part number
  if (filters?.partNumber) query = query.ilike('part_number', `%${filters.partNumber}%`);
  // Filter by name
  if (filters?.name) query = query.ilike('name', `%${filters.name}%`);
  // Filter by brand
  if (filters?.brand) query = query.ilike('brand', `%${filters.brand}%`);
  // Filter by application
  if (filters?.app) query = query.ilike('application', `%${filters.app}%`);
  // Filter by stock type
  if (filters?.type === 'low') query = query.gt('quantity', 0).lte('quantity', 3);
  if (filters?.type === 'empty') query = query.eq('quantity', 0);

  const { data: items, error } = await query.order('name', { ascending: true });
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
       const validTempo = transactionData.tempo || transactionData.resiTempo || 'CASH';

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
              resi: '-'
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
  updates: { partNumber: string; quantity: number; price: number; nama_barang?: string },
  store: string | null,
  originalItem?: { tanggal: string; customer: string; part_number: string } // Untuk BJW yang tidak punya id
): Promise<{ success: boolean; msg: string }> => {
  const table = store === 'mjm' ? 'orders_mjm' : (store === 'bjw' ? 'orders_bjw' : null);
  if (!table) return { success: false, msg: 'Toko tidak valid' };

  try {
    const hargaTotal = updates.quantity * updates.price;
    const updatePayload: any = {
      part_number: updates.partNumber,
      quantity: updates.quantity,
      harga_satuan: updates.price,
      harga_total: hargaTotal
    };
    if (updates.nama_barang) updatePayload.nama_barang = updates.nama_barang;

    let query = supabase.from(table).update(updatePayload);
    
    // BJW tidak punya kolom id, gunakan kombinasi unik
    if (store === 'bjw' && originalItem) {
      query = query
        .eq('tanggal', originalItem.tanggal)
        .eq('customer', originalItem.customer)
        .eq('part_number', originalItem.part_number);
    } else {
      // MJM punya kolom id
      query = query.eq('id', id);
    }

    const { error } = await query;

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

// 4. FETCH SOLD ITEMS (no limit, pagination handled in component)
export const fetchSoldItems = async (store: string | null): Promise<SoldItemRow[]> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return [];

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false });

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

  // Helper untuk query berdasarkan store (BJW tidak punya id)
  const buildWhereQuery = (query: any) => {
    if (store === 'bjw') {
      return query
        .eq('tanggal', item.tanggal)
        .eq('customer', item.customer)
        .eq('part_number', item.part_number);
    }
    return query.eq('id', item.id);
  };

  try {
    // --- TOLAK = HAPUS (DELETE) ---
    if (action === 'Tolak') {
      let deleteQuery = supabase.from(orderTable).delete();
      deleteQuery = buildWhereQuery(deleteQuery);
      const { error } = await deleteQuery;
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
    let updateQuery = supabase.from(orderTable).update({ status: 'Proses' });
    updateQuery = buildWhereQuery(updateQuery);
    await updateQuery;

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

    console.log('deleteBarangLog called:', { id, type, partNumber, qty, store, logTable, stockTable });

    try {
        if (!id || !partNumber || qty <= 0) {
            console.error('Invalid params:', { id, partNumber, qty });
            return false;
        }

        const { data: currentItem, error: fetchError } = await supabase
            .from(stockTable)
            .select('quantity')
            .eq('part_number', partNumber)
            .single();

        console.log('Current stock:', currentItem, 'Error:', fetchError);

        if (fetchError || !currentItem) throw new Error("Item tidak ditemukan untuk rollback stok");

        let newQty = currentItem.quantity;
        if (type === 'in') newQty = Math.max(0, newQty - qty);
        else newQty = newQty + qty;
        
        console.log('Stock will be updated from', currentItem.quantity, 'to', newQty);

        const { error: deleteError } = await supabase.from(logTable).delete().eq('id', id);
        if (deleteError) throw new Error("Gagal menghapus log: " + deleteError.message);

        const { error: updateError } = await supabase
            .from(stockTable)
            .update({ quantity: newQty })
            .eq('part_number', partNumber);

        if (updateError) {
            console.error("Stock update error:", updateError);
            throw new Error("WARNING: Log terhapus tapi stok gagal diupdate: " + updateError.message);
        }
        
        console.log('Stock updated successfully to', newQty);

        return true;
    } catch (e) {
        console.error("Delete Log Error:", e);
        return false;
    }
};

export const fetchHistory = async () => [];
export const fetchItemHistory = async () => [];

// FETCH HISTORY LOGS PAGINATED - untuk modal detail Masuk/Keluar di Dashboard
export const fetchHistoryLogsPaginated = async (
  type: 'in' | 'out',
  page: number = 1,
  perPage: number = 50,
  filters: any = {},
  store?: string | null
): Promise<{ data: any[]; count: number }> => {
  // Determine store from context if not provided
  const effectiveStore = store || 'mjm';
  const tableName = type === 'in' 
    ? getLogTableName('barang_masuk', effectiveStore)
    : getLogTableName('barang_keluar', effectiveStore);
  
  try {
    // Build query
    let query = supabase
      .from(tableName)
      .select('*', { count: 'exact' });
    
    // Handle both old string format and new object format for backwards compatibility
    if (typeof filters === 'string' && filters.trim()) {
      // Old format: search string
      const searchTerm = `%${filters.trim()}%`;
      if (type === 'in') {
        query = query.or(`nama_barang.ilike.${searchTerm},part_number.ilike.${searchTerm},customer.ilike.${searchTerm}`);
      } else {
        query = query.or(`name.ilike.${searchTerm},part_number.ilike.${searchTerm},customer.ilike.${searchTerm},resi.ilike.${searchTerm}`);
      }
    } else if (typeof filters === 'object') {
      // New format: filters object
      // Filter by customer
      if (filters.customer && filters.customer.trim()) {
        query = query.ilike('customer', `%${filters.customer.trim()}%`);
      }
      // Filter by part number
      if (filters.partNumber && filters.partNumber.trim()) {
        query = query.ilike('part_number', `%${filters.partNumber.trim()}%`);
      }
      // Filter by ecommerce
      if (filters.ecommerce && filters.ecommerce.trim()) {
        query = query.ilike('ecommerce', filters.ecommerce.trim());
      }
    }
    
    // Order by created_at desc and apply pagination
    const start = (page - 1) * perPage;
    query = query
      .order('created_at', { ascending: false })
      .range(start, start + perPage - 1);
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('fetchHistoryLogsPaginated Error:', error);
      return { data: [], count: 0 };
    }
    
    // Map data ke format StockHistory yang dipakai HistoryTable
    const mappedData = (data || []).map((row: any) => {
      const isIn = type === 'in';
      const ecommerce = row.ecommerce || '-';
      const customer = row.customer || '-';
      const resi = row.resi || '-';
      const toko = row.kode_toko || row.toko || '-';
      
      // Build reason string that parseHistoryReason can understand
      let reasonParts: string[] = [];
      if (customer !== '-') reasonParts.push(customer);
      if (resi !== '-') reasonParts.push(`(Resi: ${resi})`);
      if (ecommerce !== '-') reasonParts.push(`(Via: ${ecommerce})`);
      if (isIn && row.tempo === 'RETUR') reasonParts.push('(RETUR)');
      const reason = reasonParts.join(' ') || (isIn ? 'Restock' : 'Penjualan');
      
      // Build tempo with toko info for subInfo
      let tempoVal = row.tempo || '-';
      if (resi !== '-' && toko !== '-') {
        tempoVal = `${resi}/${toko}`;
      }
      
      return {
        id: row.id?.toString() || '',
        itemId: row.part_number || '',
        partNumber: row.part_number || '',
        name: isIn ? (row.nama_barang || '') : (row.name || ''),
        type: type,
        quantity: isIn ? (row.qty_masuk || 0) : (row.qty_keluar || 0),
        previousStock: 0,
        currentStock: isIn ? (row.stok_akhir || 0) : (row.stock_ahir || 0),
        price: row.harga_satuan || 0,
        totalPrice: row.harga_total || 0,
        timestamp: row.created_at ? new Date(row.created_at).getTime() : null,
        reason: reason,
        resi: resi,
        tempo: tempoVal,
        customer: customer
      };
    });
    
    return { data: mappedData, count: count || 0 };
  } catch (e) {
    console.error('fetchHistoryLogsPaginated Exception:', e);
    return { data: [], count: 0 };
  }
};
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

// --- RETUR FUNCTIONS ---

const getReturTableName = (store: string | null | undefined) => {
  if (store === 'mjm') return 'retur_mjm';
  if (store === 'bjw') return 'retur_bjw';
  return 'retur_mjm';
};

// Create retur from sold item
export const createReturFromSold = async (
  soldItem: any,
  tipeRetur: 'BALIK_STOK' | 'RUSAK' | 'TUKAR_SUPPLIER',
  qty: number,
  keterangan: string,
  store: string | null
): Promise<{ success: boolean; msg: string }> => {
  const returTable = getReturTableName(store);
  const stockTable = getTableName(store);
  const outTable = getLogTableName('barang_keluar', store);
  
  // Get part_number from soldItem (field bisa 'part_number' atau lainnya)
  const partNum = (soldItem.part_number || '').trim();
  const namaBarang = soldItem.name || soldItem.nama_barang || '';
  const hargaSatuan = soldItem.qty_keluar > 0 ? (soldItem.harga_total / soldItem.qty_keluar) : 0;
  
  console.log('createReturFromSold: Processing', {
    part_number: partNum,
    nama_barang: namaBarang,
    qty_retur: qty,
    tipe: tipeRetur
  });
  
  try {
    // 1. Insert retur record sesuai skema database retur_bjw/retur_mjm
    const returPayload = {
      tanggal_retur: getWIBDate().toISOString(),
      tanggal_pemesanan: soldItem.created_at || getWIBDate().toISOString(),
      resi: soldItem.resi || '-',
      toko: store?.toUpperCase() || '-', // Kolom 'toko' ada di skema
      customer: soldItem.customer || '-',
      part_number: partNum,
      nama_barang: namaBarang,
      quantity: qty,
      harga_satuan: hargaSatuan,
      harga_total: hargaSatuan * qty,
      tipe_retur: tipeRetur,
      status: tipeRetur === 'BALIK_STOK' ? 'Selesai' : 'Pending',
      keterangan: keterangan || '-',
      ecommerce: soldItem.ecommerce || 'OFFLINE'
    };
    
    console.log('createReturFromSold: Inserting retur', returPayload);
    
    const { error: insertError } = await supabase.from(returTable).insert([returPayload]);
    if (insertError) throw new Error('Gagal insert retur: ' + insertError.message);
    
    // 2. Hapus atau kurangi qty dari barang_keluar
    if (qty >= soldItem.qty_keluar) {
      // Hapus seluruh record jika retur semua qty
      await supabase.from(outTable).delete().eq('id', soldItem.id);
    } else {
      // Kurangi qty jika retur sebagian
      const newQtyKeluar = soldItem.qty_keluar - qty;
      const newHargaTotal = (soldItem.harga_total / soldItem.qty_keluar) * newQtyKeluar;
      await supabase.from(outTable).update({
        qty_keluar: newQtyKeluar,
        harga_total: newHargaTotal
      }).eq('id', soldItem.id);
    }
    
    // 3. Jika BALIK_STOK, kembalikan ke inventory (base_bjw/base_mjm)
    if (tipeRetur === 'BALIK_STOK') {
      console.log('BALIK_STOK: Looking for part_number:', partNum, 'in table:', stockTable);
      
      if (!partNum) {
        console.error('BALIK_STOK: part_number is empty!');
        return { success: true, msg: `Retur tercatat, tapi part_number kosong!` };
      }
      
      // Query dengan ilike untuk case-insensitive match
      const { data: currentItem, error: fetchError } = await supabase
        .from(stockTable)
        .select('quantity, name, part_number')
        .ilike('part_number', partNum)
        .single();
      
      if (fetchError) {
        console.error('BALIK_STOK: Error fetching item:', fetchError);
        return { success: true, msg: `Retur tercatat, tapi gagal update stok: ${fetchError.message}` };
      }
      
      if (currentItem) {
        const newQty = (currentItem.quantity || 0) + qty;
        console.log('BALIK_STOK: Updating quantity from', currentItem.quantity, 'to', newQty);
        
        // Use the actual part_number from database to ensure exact match
        const actualPartNumber = currentItem.part_number || partNum;
        
        // Note: base_bjw/base_mjm hanya punya kolom: part_number, name, application, quantity, shelf, brand, created_at
        const { error: updateError } = await supabase
          .from(stockTable)
          .update({ quantity: newQty })
          .eq('part_number', actualPartNumber);
        
        if (updateError) {
          console.error('BALIK_STOK: Error updating stock:', updateError);
          return { success: true, msg: `Retur tercatat, tapi gagal update stok: ${updateError.message}` };
        }
        
        // Log to barang_masuk sesuai skema: part_number, nama_barang, qty_masuk, harga_satuan, harga_total, customer, ecommerce, tempo, stok_akhir
        const inTable = getLogTableName('barang_masuk', store);
        await supabase.from(inTable).insert([{
          part_number: actualPartNumber,
          nama_barang: namaBarang || currentItem.name || '',
          qty_masuk: qty,
          stok_akhir: newQty,
          harga_satuan: hargaSatuan,
          harga_total: hargaSatuan * qty,
          customer: soldItem.customer || '-',
          tempo: 'RETUR',
          ecommerce: soldItem.ecommerce || 'OFFLINE'
        }]);
        
        return { success: true, msg: `Barang dikembalikan ke stok (+${qty}), total: ${newQty}` };
      } else {
        console.error('BALIK_STOK: Item not found for part_number:', partNum);
        return { success: true, msg: `Retur tercatat, tapi item tidak ditemukan di inventory` };
      }
    }
    
    // 4. Jika RUSAK, tidak ada aksi stok
    if (tipeRetur === 'RUSAK') {
      return { success: true, msg: `Retur rusak tercatat (tidak balik stok)` };
    }
    
    // 5. Jika TUKAR_SUPPLIER, pending sampai dikonfirmasi
    if (tipeRetur === 'TUKAR_SUPPLIER') {
      return { success: true, msg: `Retur dikirim ke supplier (menunggu penukaran)` };
    }
    
    return { success: true, msg: 'Retur berhasil' };
  } catch (e: any) {
    console.error('createReturFromSold Error:', e);
    return { success: false, msg: e.message || 'Gagal proses retur' };
  }
};

// Update retur status (for TUKAR_SUPPLIER when exchanged)
export const updateReturStatus = async (
  returId: number,
  newStatus: string,
  store: string | null
): Promise<{ success: boolean; msg: string }> => {
  const returTable = getReturTableName(store);
  const stockTable = getTableName(store);
  
  try {
    // Get retur data first
    const { data: returData, error: fetchError } = await supabase
      .from(returTable)
      .select('*')
      .eq('id', returId)
      .single();
    
    if (fetchError || !returData) {
      return { success: false, msg: 'Retur tidak ditemukan' };
    }
    
    // Update status
    const { error: updateError } = await supabase
      .from(returTable)
      .update({ status: newStatus })
      .eq('id', returId);
    
    if (updateError) throw new Error('Gagal update status: ' + updateError.message);
    
    // If "Sudah Ditukar", return item to stock
    if (newStatus === 'Sudah Ditukar' && returData.tipe_retur === 'TUKAR_SUPPLIER') {
      const partNum = (returData.part_number || '').trim();
      console.log('TUKAR_SUPPLIER: Looking for part_number:', partNum, 'in table:', stockTable);
      
      if (!partNum) {
        return { success: true, msg: `Status diupdate, tapi part_number kosong!` };
      }
      
      // Cari item berdasarkan part_number (case-insensitive) - base table punya kolom: name bukan nama_barang
      const { data: currentItem, error: itemError } = await supabase
        .from(stockTable)
        .select('quantity, name, part_number')
        .ilike('part_number', partNum)
        .single();
      
      if (itemError) {
        console.error('Error finding item:', itemError);
        return { success: true, msg: `Status diupdate, tapi gagal update stok: ${itemError.message}` };
      }
      
      if (currentItem) {
        const newQty = (currentItem.quantity || 0) + (returData.quantity || 0);
        const actualPartNumber = currentItem.part_number || partNum;
        
        console.log('TUKAR_SUPPLIER: Updating quantity from', currentItem.quantity, 'to', newQty);
        
        // Update quantity di base table (tidak ada kolom last_updated di skema)
        const { error: updateStockError } = await supabase
          .from(stockTable)
          .update({ quantity: newQty })
          .eq('part_number', actualPartNumber);
        
        if (updateStockError) {
          console.error('Error updating stock:', updateStockError);
          return { success: true, msg: `Status diupdate, tapi gagal update stok: ${updateStockError.message}` };
        }
        
        // Log to barang_masuk sesuai skema
        const inTable = getLogTableName('barang_masuk', store);
        await supabase.from(inTable).insert([{
          part_number: actualPartNumber,
          nama_barang: returData.nama_barang || currentItem.name || '',
          qty_masuk: returData.quantity,
          stok_akhir: newQty,
          harga_satuan: returData.harga_satuan || 0,
          harga_total: returData.harga_total || 0,
          customer: 'TUKAR SUPPLIER',
          tempo: 'RETUR',
          ecommerce: returData.ecommerce || '-'
        }]);
        
        return { success: true, msg: `Stok dikembalikan (+${returData.quantity}), total: ${newQty}` };
      }
    }
    
    return { success: true, msg: 'Status retur diupdate' };
  } catch (e: any) {
    console.error('updateReturStatus Error:', e);
    return { success: false, msg: e.message || 'Gagal update status' };
  }
};