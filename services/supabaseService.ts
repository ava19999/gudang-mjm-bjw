// FILE: services/supabaseService.ts
import { supabase } from './supabaseClient';
import { 
  InventoryItem, 
  InventoryFormData, 
  Order, 
  OfflineOrderRow,
  OnlineOrderRow,
  SoldItemRow,
  ReturRow
} from '../types';

// --- HELPER: NAMA TABEL ---
const getTableName = (store: string | null | undefined) => {
  if (store === 'mjm') return 'base_mjm';
  if (store === 'bjw') return 'base_bjw';
  return 'base';
};

const getLogTableName = (baseName: 'barang_masuk' | 'barang_keluar', store: string | null | undefined) => {
  const suffix = store === 'mjm' ? '_mjm' : (store === 'bjw' ? '_bjw' : '');
  return `${baseName}${suffix}`;
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
    price: 0, // Akan diisi dari tabel harga terpisah
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
    created_at: new Date().toISOString()
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

// --- UPDATE INVENTORY (DIPERBAIKI UNTUK LOGIC BARANG MASUK) ---
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
       // Tentukan nama tabel log
       const logTable = getLogTableName(isBarangMasuk ? 'barang_masuk' : 'barang_keluar', store);
       const validTempo = isBarangMasuk ? (transactionData.tempo || 'CASH') : (transactionData.resiTempo || transactionData.tempo || '-');

       // Base payload
       let finalLogData: any = {
           part_number: pk,
           brand: item.brand,
           application: item.application,
           rak: item.shelf,
           ecommerce: transactionData.ecommerce || '-',
           customer: transactionData.customer || '-',
           tempo: validTempo,
           created_at: transactionData.tanggal ? new Date(transactionData.tanggal).toISOString() : new Date().toISOString()
       };

       if (isBarangMasuk) {
          // PAYLOAD KHUSUS BARANG MASUK (Sesuai Struktur SQL Baru)
          finalLogData = {
              ...finalLogData,
              nama_barang: item.name,        // Menggunakan nama_barang
              stok_akhir: item.quantity,     // Menggunakan stok_akhir (spelling benar)
              qty_masuk: Number(transactionData.qty),
              harga_satuan: Number(transactionData.price || 0),
              harga_total: Number(transactionData.qty) * Number(transactionData.price || 0)
          };
       } else {
          // PAYLOAD KHUSUS BARANG KELUAR
          finalLogData = {
              ...finalLogData,
              name: item.name,               // Menggunakan name (Legacy)
              stock_ahir: item.quantity,     // Menggunakan stock_ahir (Legacy)
              qty_keluar: Number(transactionData.qty),
              harga_satuan: Number(item.price || 0),
              harga_total: Number(item.price || 0) * Number(transactionData.qty),
              resi: transactionData.resiTempo || '-'
          };
       }
       
       const { error: logError } = await supabase.from(logTable).insert([finalLogData]);
       
       if (logError) {
           console.error('LOG INSERT ERROR:', logError);
           alert(`Gagal simpan riwayat ke ${logTable}: ${logError.message}`);
       }
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

// --- FUNGSI BARU: FETCH DATA BARANG MASUK ---
export const fetchBarangMasukLog = async (store: string | null, page = 1, limit = 20, search = '') => {
    const table = getLogTableName('barang_masuk', store);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from(table)
        .select('*', { count: 'exact' });

    // Filter Pencarian
    if (search) {
        // Mencari di Part Number, Nama Barang, Customer, atau Tanggal (konversi text)
        query = query.or(`part_number.ilike.%${search}%,nama_barang.ilike.%${search}%,customer.ilike.%${search}%`);
    }

    const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

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

// --- SHOP ITEMS (DIPULIHKAN UNTUK BERANDA) ---
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
    let query = supabase.from(table).select('*', { count: 'exact' }).gt('quantity', 0);

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


// --- ORDER MANAGEMENT SYSTEM (OFFLINE, ONLINE, SOLD, RETUR) ---

// 1. FETCH OFFLINE (Orders Table)
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

// 2. FETCH ONLINE (Scan Resi Table)
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

// 3. FETCH SOLD ITEMS (Barang Keluar Table)
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

// 4. FETCH RETUR (Retur Table)
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


// --- PROCESSING LOGIC (ACC) ---

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
    if (action === 'Tolak') {
      const { error } = await supabase.from(orderTable).update({ status: 'Tolak' }).eq('id', item.id);
      if (error) throw error;
      return { success: true, msg: 'Pesanan ditolak.' };
    }

    // ACC: Cek Stok
    const { data: currentItem, error: fetchError } = await supabase.from(stockTable).select('*').eq('part_number', item.part_number).single();
    if (fetchError || !currentItem) return { success: false, msg: 'Barang tidak ditemukan di gudang.' };
    
    if (currentItem.quantity < item.quantity) {
      return { success: false, msg: `Stok tidak cukup! (Sisa: ${currentItem.quantity})` };
    }

    // ACC: Kurangi Stok
    const newQty = currentItem.quantity - item.quantity;
    const { error: updateError } = await supabase.from(stockTable).update({ quantity: newQty }).eq('part_number', item.part_number);
    if (updateError) throw updateError;

    // ACC: Log Barang Keluar
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
      created_at: new Date().toISOString()
    };
    await supabase.from(outTable).insert([logPayload]);

    // ACC: Update Status Order
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
      created_at: new Date().toISOString()
    }]);

    await supabase.from(scanTable).update({ status: 'Diproses' }).eq('id', item.id);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

// --- OTHERS & PLACEHOLDERS (Agar tidak error) ---
export const fetchOrders = async (store?: string | null): Promise<Order[]> => {
    try {
        const { data } = await supabase.from('orders').select('*').order('timestamp', { ascending: false });
        return (data || []).map((o:any) => ({ ...o, items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items }));
    } catch (e) { return []; }
};
export const saveOrder = async (order: Order, store?: string | null): Promise<boolean> => {
  try {
      const payload = { ...order, items: JSON.stringify(order.items) };
      const { error } = await supabase.from('orders').insert([payload]);
      if (error) throw error;
      return true;
  } catch(e: any) { alert(`Gagal Order: ${e.message}`); return false; }
};

export const saveOfflineOrder = async (
  cart: any[], 
  customerName: string, 
  tempo: string, 
  store: string | null
): Promise<boolean> => {
  const tableName = store === 'mjm' ? 'orders_mjm' : (store === 'bjw' ? 'orders_bjw' : null);
  if (!tableName) { alert("Error: Toko tidak teridentifikasi"); return false; }
  if (!cart || cart.length === 0) return false;

  const orderRows = cart.map(item => ({
    tanggal: new Date().toISOString(),
    customer: customerName,
    part_number: item.partNumber,
    nama_barang: item.name,
    quantity: Number(item.cartQuantity),
    harga_satuan: Number(item.price),
    harga_total: Number(item.price * item.cartQuantity),
    status: 'Belum Diproses',
    tempo: tempo || 'CASH'
  }));

  try {
    const { error } = await supabase.from(tableName).insert(orderRows);
    if (error) throw error;
    return true;
  } catch (e: any) { alert(`Gagal menyimpan order: ${e.message}`); return false; }
};

export const updateOrderStatusService = async (id: string, status: string) => {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  return !error;
};
export const updateOrderData = async (id: string, items: any[], total: number, status: string) => {
  const { error } = await supabase.from('orders').update({ items: JSON.stringify(items), totalAmount: total, status }).eq('id', id);
  return !error;
};
// FILE: services/supabaseService.ts
// ... (kode yang sudah ada sebelumnya)

// --- FUNGSI BARU: FETCH DATA BARANG KELUAR ---
export const fetchBarangKeluarLog = async (store: string | null, page = 1, limit = 20, search = '') => {
    const table = getLogTableName('barang_keluar', store);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from(table)
        .select('*', { count: 'exact' });

    // Filter Pencarian
    if (search) {
        query = query.or(`part_number.ilike.%${search}%,name.ilike.%${search}%,customer.ilike.%${search}%`);
    }

    const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

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
        // Validasi input
        if (!id || !partNumber || qty < 0) {
            console.error("Invalid parameters for deleteBarangLog:", { id, partNumber, qty });
            return false;
        }

        // 1. Ambil Data Stok Saat Ini
        const { data: currentItem, error: fetchError } = await supabase
            .from(stockTable)
            .select('quantity')
            .eq('part_number', partNumber)
            .single();

        if (fetchError || !currentItem) {
            console.error("Fetch error:", fetchError);
            throw new Error("Item tidak ditemukan untuk rollback stok");
        }

        // 2. Hitung Stok Rollback
        let newQty = currentItem.quantity;
        if (type === 'in') {
            newQty = Math.max(0, newQty - qty); // Hindari stok negatif
        } else {
            newQty = newQty + qty;
        }

        // 3. Hapus Log TERLEBIH DAHULU (prioritas utama)
        const { error: deleteError } = await supabase
            .from(logTable)
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error("Delete error:", deleteError);
            throw new Error("Gagal menghapus log: " + deleteError.message);
        }

        // 4. Update Stok SETELAH log terhapus
        const { error: updateError } = await supabase
            .from(stockTable)
            .update({ quantity: newQty, last_updated: new Date().toISOString() })
            .eq('part_number', partNumber);

        if (updateError) {
            console.error("Update stock error:", updateError);
            // Log sudah terhapus, tapi stok gagal update - log warning
            console.warn("WARNING: Log terhapus tapi stok gagal diupdate untuk part_number:", partNumber);
        }

        return true;
    } catch (e) {
        console.error("Delete Log Error:", e);
        return false;
    }
};

// ... (sisa kode lainnya)
// --- SCAN RESI MANAGEMENT ---

// Helper: Get scan_resi table name based on store
const getScanResiTableName = (store: string | null): string | null => {
  if (store === 'mjm') return 'scan_resi_mjm';
  if (store === 'bjw') return 'scan_resi_bjw';
  return null;
};

// Cache for resolved aliases to avoid repeated database lookups
const aliasCache = new Map<string, string>();

// Helper: Resolve part number aliases
export const resolvePartNumberAlias = async (partNumber: string): Promise<string> => {
  if (!partNumber || partNumber.trim() === '') return partNumber;
  
  const trimmedPN = partNumber.trim();
  
  // Check cache first
  if (aliasCache.has(trimmedPN)) {
    return aliasCache.get(trimmedPN)!;
  }
  
  try {
    // Check if this is an alias
    const { data, error } = await supabase
      .from('product_alias')
      .select('part_number')
      .eq('alias', trimmedPN)
      .maybeSingle();
    
    if (!error && data) {
      // Cache the resolved alias
      aliasCache.set(trimmedPN, data.part_number);
      return data.part_number;
    }
    
    // Cache the original (no alias found)
    aliasCache.set(trimmedPN, trimmedPN);
    return trimmedPN;
  } catch (e) {
    console.error('Error resolving alias:', e);
    return trimmedPN;
  }
};

// Fetch all scan resi logs
export const fetchScanResiLogs = async (store?: string | null): Promise<any[]> => {
  const table = getScanResiTableName(store);
  if (!table) return [];
  
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('tanggal', { ascending: false })
      .order('id', { ascending: false });
    
    if (error) {
      console.error('Error fetching scan resi logs:', error);
      return [];
    }
    
    return data || [];
  } catch (e) {
    console.error('Exception fetching scan resi logs:', e);
    return [];
  }
};

// Add new scan resi log
export const addScanResiLog = async (
  resi: string,
  ecommerce: string,
  toko: string,
  store?: string | null,
  additionalData?: Partial<any>
): Promise<boolean> => {
  const table = getScanResiTableName(store);
  if (!table) return false;
  
  try {
    const logData = {
      tanggal: new Date().toISOString(),
      resi: resi.trim(),
      toko: toko || 'MJM',
      ecommerce: ecommerce || 'Shopee',
      customer: additionalData?.customer || '-',
      part_number: additionalData?.part_number || null,
      nama_barang: additionalData?.nama_barang || '-',
      quantity: additionalData?.quantity || 0,
      harga_satuan: additionalData?.harga_satuan || 0,
      harga_total: additionalData?.harga_total || 0,
      status: additionalData?.status || 'Pending',
      sub_toko: additionalData?.sub_toko || null,
      negara: additionalData?.negara || null,
      split_item: additionalData?.split_item || 0,
      parent_resi: additionalData?.parent_resi || null
    };
    
    const { error } = await supabase.from(table).insert([logData]);
    
    if (error) {
      console.error('Error adding scan resi log:', error);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('Exception adding scan resi log:', e);
    return false;
  }
};

export const saveScanResiLog = addScanResiLog;

// Update single field in scan resi log
export const updateScanResiLogField = async (
  id: number,
  field: string,
  value: any,
  store?: string | null
): Promise<boolean> => {
  const table = getScanResiTableName(store);
  if (!table) return false;
  
  try {
    // Resolve alias if updating part_number
    let finalValue = value;
    if (field === 'part_number' && typeof value === 'string') {
      finalValue = await resolvePartNumberAlias(value);
    }
    
    const { error } = await supabase
      .from(table)
      .update({ [field]: finalValue })
      .eq('id', id);
    
    if (error) {
      console.error(`Error updating ${field}:`, error);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error(`Exception updating ${field}:`, e);
    return false;
  }
};

// Delete scan resi log
export const deleteScanResiLog = async (id: number, store?: string | null): Promise<boolean> => {
  const table = getScanResiTableName(store);
  if (!table) return false;
  
  try {
    const { error } = await supabase.from(table).delete().eq('id', id);
    
    if (error) {
      console.error('Error deleting scan resi log:', error);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('Exception deleting scan resi log:', e);
    return false;
  }
};

// Duplicate scan resi log (for split items)
export const duplicateScanResiLog = async (
  id: number,
  store?: string | null,
  splitData?: { split_item?: number; harga_total?: number; harga_satuan?: number }
): Promise<boolean> => {
  const table = getScanResiTableName(store);
  if (!table) return false;
  
  try {
    // Get original log
    const { data: original, error: fetchError } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !original) {
      console.error('Error fetching original log:', fetchError);
      return false;
    }
    
    // Create duplicate with split data
    const duplicate = {
      ...original,
      id: undefined, // Let database generate new ID
      parent_resi: original.parent_resi || original.resi,
      split_item: splitData?.split_item || (original.split_item || 0) + 1,
      harga_total: splitData?.harga_total || original.harga_total / 2,
      harga_satuan: splitData?.harga_satuan || original.harga_satuan
    };
    
    // Update original to have parent_resi if not set
    if (!original.parent_resi) {
      await supabase
        .from(table)
        .update({ parent_resi: original.resi })
        .eq('id', id);
    }
    
    const { error: insertError } = await supabase.from(table).insert([duplicate]);
    
    if (insertError) {
      console.error('Error duplicating scan resi log:', insertError);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('Exception duplicating scan resi log:', e);
    return false;
  }
};

// Process shipment - move from scan_resi to barang_keluar and update stock
export const processShipmentToOrders = async (
  logs: any[],
  store: string | null
): Promise<{ success: boolean; message?: string }> => {
  const scanTable = getScanResiTableName(store);
  const stockTable = getTableName(store);
  const outTable = getLogTableName('barang_keluar', store);
  
  if (!scanTable || !stockTable || !outTable) {
    return { success: false, message: 'Invalid store configuration' };
  }
  
  try {
    for (const log of logs) {
      // Resolve part number alias
      const resolvedPartNumber = await resolvePartNumberAlias(log.part_number);
      
      // Get current stock
      const { data: stockItem, error: stockError } = await supabase
        .from(stockTable)
        .select('*')
        .eq('part_number', resolvedPartNumber)
        .maybeSingle();
      
      if (stockError || !stockItem) {
        return { 
          success: false, 
          message: `Item ${resolvedPartNumber} not found in inventory` 
        };
      }
      
      // Check stock availability
      if (stockItem.quantity < log.quantity) {
        return { 
          success: false, 
          message: `Insufficient stock for ${resolvedPartNumber}. Available: ${stockItem.quantity}, Required: ${log.quantity}` 
        };
      }
      
      // Update stock
      const newQty = stockItem.quantity - log.quantity;
      const { error: updateError } = await supabase
        .from(stockTable)
        .update({ quantity: newQty })
        .eq('part_number', resolvedPartNumber);
      
      if (updateError) {
        console.error('Error updating stock:', updateError);
        return { success: false, message: 'Failed to update stock' };
      }
      
      // Insert to barang_keluar
      const keluarData = {
        tanggal: log.tanggal || new Date().toISOString(),
        kode_toko: log.toko || 'MJM',
        tempo: log.sub_toko || '-',
        ecommerce: log.ecommerce || 'ONLINE',
        customer: log.customer || '-',
        part_number: resolvedPartNumber,
        name: log.nama_barang || '-',
        brand: stockItem.brand || '-',
        application: stockItem.application || '-',
        rak: stockItem.shelf || '-',
        stock_ahir: newQty,
        qty_keluar: log.quantity,
        harga_satuan: log.harga_satuan || 0,
        harga_total: log.harga_total || 0,
        resi: log.resi || '-',
        created_at: new Date().toISOString()
      };
      
      const { error: insertError } = await supabase
        .from(outTable)
        .insert([keluarData]);
      
      if (insertError) {
        console.error('Error inserting to barang_keluar:', insertError);
        return { success: false, message: 'Failed to log transaction' };
      }
      
      // Update scan_resi status to 'Terjual'
      const { error: statusError } = await supabase
        .from(scanTable)
        .update({ status: 'Terjual' })
        .eq('id', log.id);
      
      if (statusError) {
        console.error('Error updating scan_resi status:', statusError);
      }
    }
    
    return { success: true };
  } catch (e: any) {
    console.error('Exception processing shipment:', e);
    return { success: false, message: e.message || 'Unknown error' };
  }
};

// Import scan resi from Excel
export const importScanResiFromExcel = async (
  records: any[],
  store?: string | null
): Promise<{ success: boolean; skippedCount: number }> => {
  const table = getScanResiTableName(store);
  if (!table) return { success: false, skippedCount: 0 };
  
  try {
    let skippedCount = 0;
    const recordsToInsert: any[] = [];
    
    for (const record of records) {
      // Check for duplicates
      const { data: existing } = await supabase
        .from(table)
        .select('id, resi, part_number')
        .eq('resi', record.resi)
        .eq('part_number', record.part_number || '-');
      
      // Skip if exact match exists (same resi + same part_number)
      if (existing && existing.length > 0) {
        skippedCount++;
        continue;
      }
      
      // Resolve part number alias
      let resolvedPartNumber = record.part_number;
      if (resolvedPartNumber) {
        resolvedPartNumber = await resolvePartNumberAlias(resolvedPartNumber);
      }
      
      recordsToInsert.push({
        tanggal: record.tanggal || new Date().toISOString(),
        resi: record.resi,
        toko: record.toko || 'MJM',
        ecommerce: record.ecommerce || 'Shopee',
        customer: record.customer || '-',
        part_number: resolvedPartNumber,
        nama_barang: record.nama_barang || '-',
        quantity: record.quantity || 0,
        harga_satuan: record.harga_satuan || 0,
        harga_total: record.harga_total || 0,
        status: record.status || 'Order Masuk',
        sub_toko: record.sub_toko || null,
        negara: record.negara || null,
        split_item: record.split_item || 0,
        parent_resi: record.parent_resi || null
      });
    }
    
    if (recordsToInsert.length > 0) {
      const { error } = await supabase.from(table).insert(recordsToInsert);
      
      if (error) {
        console.error('Error importing records:', error);
        return { success: false, skippedCount };
      }
    }
    
    return { success: true, skippedCount };
  } catch (e) {
    console.error('Exception importing from Excel:', e);
    return { success: false, skippedCount: 0 };
  }
};
// Placeholder Functions (Safe defaults for features not yet implemented)
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
export const saveItemImages = async (itemId: string, images: string[], store?: string | null): Promise<void> => { };
