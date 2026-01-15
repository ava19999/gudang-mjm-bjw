// FILE: services/supabaseService.ts
import { supabase } from './supabaseClient';
import { 
  InventoryItem, 
  InventoryFormData, 
  StockHistory, 
  Order, 
  ChatSession, 
  ReturRecord, 
  ScanResiLog 
} from '../types';

// --- HELPER: NAMA TABEL ---
const getTableName = (store: string | null | undefined) => {
  if (store === 'mjm') return 'base_mjm';
  if (store === 'bjw') return 'base_bjw';
  return 'base';
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

// --- HELPER: MAPPING DATA ITEM (PRIMARY KEY = PART NUMBER) ---
const mapItemFromDB = (item: any, photoData?: any): InventoryItem => {
  // PENTING: Kita gunakan part_number sebagai ID utama aplikasi
  const pk = item.part_number || item.partNumber || '';
  
  // Ambil foto
  const imagesFromTable = photoData ? mapPhotoRowToImages(photoData) : [];
  const finalImages = imagesFromTable.length > 0 
    ? imagesFromTable 
    : (item.image_url ? [item.image_url] : []);

  return {
    ...item,
    id: pk, // Frontend ID sekarang adalah Part Number
    partNumber: pk,
    name: item.name,
    brand: item.brand,
    application: item.application,
    shelf: item.shelf,
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
    costPrice: Number(item.cost_price || item.costPrice || 0),
    imageUrl: finalImages[0] || item.image_url || '',
    images: finalImages,
    ecommerce: item.ecommerce || '',
    initialStock: Number(item.initial_stock || item.initialStock || 0),
    qtyIn: Number(item.qty_in || item.qtyIn || 0),
    qtyOut: Number(item.qty_out || item.qtyOut || 0),
    lastUpdated: item.last_updated || item.lastUpdated || Date.now()
  };
};

const mapItemToDB = (data: any) => {
  const dbPayload: any = {
    part_number: data.partNumber || data.part_number, // PRIMARY KEY
    name: data.name,
    brand: data.brand,
    application: data.application,
    shelf: data.shelf,
    quantity: Number(data.quantity) || 0,
    price: Number(data.price) || 0,
    ecommerce: data.ecommerce || '',
    
    // Snake Case Fields
    initial_stock: Number(data.initialStock ?? data.initial_stock ?? 0),
    cost_price: Number(data.costPrice ?? data.cost_price ?? 0),
    image_url: (data.images && data.images.length > 0) ? data.images[0] : (data.imageUrl || null),
    qty_in: Number(data.qtyIn ?? data.qty_in ?? 0),
    qty_out: Number(data.qtyOut ?? data.qty_out ?? 0),
    last_updated: Date.now()
  };

  // Bersihkan undefined
  Object.keys(dbPayload).forEach(key => dbPayload[key] === undefined && delete dbPayload[key]);
  return dbPayload;
};

// --- INTERNAL: FOTO FETCHING ---
const fetchPhotosForItems = async (items: any[]) => {
  if (!items || items.length === 0) return {};
  const partNumbers = items.map(i => i.part_number || i.partNumber).filter(Boolean);
  if (partNumbers.length === 0) return {};

  try {
    const { data } = await supabase.from('foto').select('*').in('part_number', partNumbers);
    const photoMap: Record<string, any> = {};
    (data || []).forEach((row: any) => {
      if (row.part_number) photoMap[row.part_number] = row;
    });
    return photoMap;
  } catch (e) {
    return {};
  }
};

const savePhotosToTable = async (partNumber: string, images: string[]) => {
  if (!partNumber) return;
  try {
    const photoPayload = mapImagesToPhotoRow(partNumber, images);
    await supabase.from('foto').upsert(photoPayload, { onConflict: 'part_number' });
  } catch (e) {
    console.error('Error saving photos:', e);
  }
};

// --- INVENTORY FUNCTIONS ---

export const fetchInventory = async (store?: string | null): Promise<InventoryItem[]> => {
  const table = getTableName(store);
  const { data: items, error } = await supabase.from(table).select('*').order('name', { ascending: true });
  
  if (error) { console.error(`[Supabase] Error:`, error); return []; }
  if (!items) return [];

  const photoMap = await fetchPhotosForItems(items);
  return items.map(item => mapItemFromDB(item, photoMap[item.part_number]));
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
  return { 
    data: items.map(item => mapItemFromDB(item, photoMap[item.part_number])), 
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

// --- ADD INVENTORY (KEY: PART NUMBER) ---
export const addInventory = async (data: InventoryFormData, store?: string | null): Promise<string | null> => {
  const table = getTableName(store);
  
  // Pastikan Part Number ada
  if (!data.partNumber) {
      alert("Gagal: Part Number wajib diisi!");
      return null;
  }

  const payload = mapItemToDB(data);

  // Insert ke Base Table
  const { data: inserted, error } = await supabase.from(table).insert([payload]).select();
  
  if (error) {
    console.error('[Supabase] Gagal Add:', error);
    let msg = `Gagal Menambah Barang!\nError: ${error.message}`;
    if (error.code === '23505') msg = 'Gagal: Part Number sudah ada di database!';
    alert(msg);
    return null;
  }

  // Simpan Foto
  if (data.partNumber) {
    await savePhotosToTable(data.partNumber, data.images);
  }

  return data.partNumber; // Return Part Number sebagai ID sukses
};

// --- UPDATE INVENTORY (KEY: PART NUMBER) ---
export const updateInventory = async (
  arg1: any, 
  arg2?: any, 
  arg3?: any
): Promise<InventoryItem | null> => {
  // Normalize Arguments
  let item: InventoryItem;
  let transactionData: any;
  let store: string | null | undefined;

  if (typeof arg1 === 'string') {
     alert("Error: Versi kode tidak cocok. Silakan refresh halaman.");
     return null;
  } else {
    item = arg1;
    transactionData = arg2;
    store = arg3;
  }

  // VALIDASI PART NUMBER SEBAGAI PRIMARY KEY
  const pk = item.partNumber; // Kita pakai partNumber, bukan ID
  if (!pk) {
    alert('Gagal Update: Part Number kosong/tidak valid.');
    return null;
  }

  const table = getTableName(store);
  const updates = mapItemToDB(item);

  console.log(`[Supabase] Updating PartNumber: ${pk} in ${table}`, updates);

  // 1. UPDATE BASE (WHERE part_number = pk)
  const { error } = await supabase.from(table).update(updates).eq('part_number', pk);

  if (error) {
    console.error('[Supabase] Gagal Update:', error);
    alert(`Gagal Update Barang!\nError: ${error.message}`);
    return null;
  }

  // 2. UPDATE FOTO
  await savePhotosToTable(pk, item.images || []);

  // 3. LOG MUTASI
  if (transactionData) {
     try {
       const logPayload = {
           part_number: pk,
           name: item.name,
           brand: item.brand,
           application: item.application,
           rak: item.shelf,
           stock_ahir: item.quantity, 
           ecommerce: transactionData.ecommerce || '',
           customer: transactionData.customer || '',
           tempo: transactionData.resiTempo || '',
           created_at: new Date().toISOString()
       };
       
       const logTable = transactionData.type === 'in' ? 'barang_masuk' : 'barang_keluar';
       const logData = transactionData.type === 'in' 
          ? { ...logPayload, qty_masuk: Number(transactionData.qty), harga_satuan: item.costPrice, harga_total: item.costPrice * Number(transactionData.qty) }
          : { ...logPayload, qty_keluar: Number(transactionData.qty), harga_satuan: item.price, harga_total: item.price * Number(transactionData.qty), resi: transactionData.resiTempo || '' };
          
       await supabase.from(logTable).insert([logData]);
     } catch (e) { console.error('Gagal log mutasi:', e); }
  }

  return item;
};

// --- DELETE INVENTORY (KEY: PART NUMBER) ---
export const deleteInventory = async (id: string, store?: string | null): Promise<boolean> => {
  // Catatan: 'id' yang diterima di sini sebenarnya adalah 'partNumber' 
  // karena kita sudah mapping id = partNumber di fetchInventory
  const table = getTableName(store);
  
  console.log(`[Supabase] Deleting PartNumber: ${id}`);
  
  const { error } = await supabase.from(table).delete().eq('part_number', id);
  if (error) { 
      alert(`Gagal Hapus: ${error.message}`); 
      return false; 
  }
  return true;
};

export const getItemByPartNumber = async (partNumber: string, store?: string | null): Promise<InventoryItem | null> => {
  const table = getTableName(store);
  const { data, error } = await supabase.from(table).select('*').eq('part_number', partNumber).maybeSingle();
  if (error || !data) return null;
  const photoMap = await fetchPhotosForItems([data]);
  return mapItemFromDB(data, photoMap[data.part_number]);
};

// --- LAINNYA ---
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
export const updateOrderStatusService = async (id: string, status: string) => {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  return !error;
};
export const updateOrderData = async (id: string, items: any[], total: number, status: string) => {
  const { error } = await supabase.from('orders').update({ items: JSON.stringify(items), totalAmount: total, status }).eq('id', id);
  return !error;
};

// Placeholder Functions
export const fetchHistory = async () => [];
export const fetchItemHistory = async () => [];
export const fetchHistoryLogsPaginated = async () => ({ data: [], total: 0 });
export const addBarangMasuk = async () => {};
export const addBarangKeluar = async () => {};
export const fetchBarangMasuk = async () => [];
export const fetchBarangKeluar = async () => [];
export const fetchPriceHistoryBySource = async () => [];
// --- ENHANCED FETCH SHOP ITEMS WITH PAGINATION & JOINS ---
// Interface for search filters
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
  
  // Destructure filters with defaults
  const {
    searchTerm = '',
    category = 'All',
    partNumberSearch = '',
    nameSearch = '',
    brandSearch = '',
    applicationSearch = ''
  } = filters;

  try {
    // Build query with count
    let query = supabase
      .from(table)
      .select('*', { count: 'exact' })
      .gt('quantity', 0); // Only show items in stock for shop view

    // Apply filters
    if (searchTerm && searchTerm.trim() !== '') {
      query = query.or(`name.ilike.%${searchTerm}%,part_number.ilike.%${searchTerm}%`);
    }
    
    if (partNumberSearch && partNumberSearch.trim() !== '') {
      query = query.ilike('part_number', `%${partNumberSearch}%`);
    }
    
    if (nameSearch && nameSearch.trim() !== '') {
      query = query.ilike('name', `%${nameSearch}%`);
    }
    
    if (brandSearch && brandSearch.trim() !== '') {
      query = query.ilike('brand', `%${brandSearch}%`);
    }
    
    if (applicationSearch && applicationSearch.trim() !== '') {
      query = query.ilike('application', `%${applicationSearch}%`);
    }

    // Apply pagination and ordering
    const { data: items, count, error } = await query
      .range(from, to)
      .order('name', { ascending: true });

    if (error) {
      console.error(`[fetchShopItems] Error fetching from ${table}:`, error);
      return { data: [], count: 0 };
    }

    if (!items || items.length === 0) {
      return { data: [], count: count || 0 };
    }

    // Fetch photos and prices for all items
    const photoMap = await fetchPhotosForItems(items);
    const priceMap = await fetchLatestPricesForItems(items, store);

    // Map items with photos and prices
    const mappedItems = items.map(item => {
      const baseItem = mapItemFromDB(item, photoMap[item.part_number]);
      const latestPrice = priceMap[item.part_number];
      
      return {
        ...baseItem,
        // Override price with latest from list_harga_jual if available
        price: latestPrice?.harga_jual || baseItem.price,
        // Add low stock flag
        isLowStock: baseItem.quantity < 5
      };
    });

    console.log(`[fetchShopItems] Fetched ${mappedItems.length} items from ${table} (page ${page})`);
    return { data: mappedItems, count: count || 0 };
    
  } catch (error) {
    console.error('[fetchShopItems] Unexpected error:', error);
    return { data: [], count: 0 };
  }
};

// --- FETCH LATEST PRICES FOR ITEMS ---
interface PriceData {
  part_number: string;
  harga_jual: number;
  created_at: string;
}

const fetchLatestPricesForItems = async (items: any[], store?: string | null): Promise<Record<string, PriceData>> => {
  if (!items || items.length === 0) return {};
  
  const partNumbers = items.map(i => i.part_number || i.partNumber).filter(Boolean);
  if (partNumbers.length === 0) return {};

  try {
    // Get latest price for each part_number from list_harga_jual
    const { data } = await supabase
      .from('list_harga_jual')
      .select('part_number, harga_jual, created_at')
      .in('part_number', partNumbers)
      .order('created_at', { ascending: false });

    const priceMap: Record<string, PriceData> = {};
    
    // Keep only the latest price for each part_number
    (data || []).forEach((row: PriceData) => {
      if (row.part_number && !priceMap[row.part_number]) {
        priceMap[row.part_number] = row;
      }
    });
    
    return priceMap;
  } catch (e) {
    console.error('[fetchLatestPricesForItems] Error:', e);
    return {};
  }
};
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