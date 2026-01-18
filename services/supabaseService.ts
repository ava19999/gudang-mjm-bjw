// FILE: services/supabaseService.ts
import { supabase } from './supabaseClient';
import { getWIBISOString } from '../utils/timezone';
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
    brand: data.brand || null,
    application: data.application || null,
    shelf: data.shelf || null,
    quantity: Number(data.quantity) || 0,
    created_at: getWIBISOString()
  };
  // Hapus field yang undefined, tapi biarkan null
  Object.keys(dbPayload).forEach(key => {
    if (dbPayload[key] === undefined) delete dbPayload[key];
    if (dbPayload[key] === '') dbPayload[key] = null; // Ubah string kosong jadi null
  });
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
  if (!partNumber) {
    console.error('savePhotosToTable: partNumber kosong');
    return;
  }
  
  // Validasi ukuran foto (jika base64, cek apakah terlalu besar)
  const oversizedImages = images.filter(img => {
    if (img.startsWith('data:')) {
      const sizeInBytes = (img.length * 3) / 4; // Estimasi ukuran base64
      const sizeInMB = sizeInBytes / (1024 * 1024);
      return sizeInMB > 5; // Warning jika lebih dari 5MB
    }
    return false;
  });
  
  if (oversizedImages.length > 0) {
    console.warn(`⚠️  Ada ${oversizedImages.length} foto yang berukuran besar (>5MB). Ini mungkin menyebabkan masalah.`);
  }
  
  try {
    const photoPayload = mapImagesToPhotoRow(partNumber, images);
    console.log('Menyimpan foto untuk', partNumber, '- Total foto:', images.length);
    
    // Strategy: Delete existing photos first, then insert new ones
    // Karena tabel foto tidak memiliki unique constraint pada part_number
    const { error: deleteError } = await supabase
      .from('foto')
      .delete()
      .eq('part_number', partNumber);
    
    if (deleteError) {
      console.warn('Info: Tidak ada foto lama untuk dihapus atau error:', deleteError.message);
    }
    
    // Insert foto baru
    const { error: insertError } = await supabase
      .from('foto')
      .insert([photoPayload]);
    
    if (insertError) {
      console.error('Error saat insert foto:', insertError);
      throw new Error(`Gagal simpan foto: ${insertError.message}`);
    }
    
    console.log('✓ Foto berhasil disimpan');
  } catch (e: any) { 
    console.error('Error saving photos:', e); 
    throw new Error(`Error saving photos: ${e.message || e}`);
  }
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
  
  // Validasi: Part Number wajib karena merupakan primary key
  if (!data.partNumber || data.partNumber.trim() === '') {
    alert("Part Number wajib diisi! (Primary Key)");
    return null;
  }
  
  try {
    // 1. Insert ke tabel utama (base_mjm/base_bjw)
    const payload = mapItemToDB(data);
    const { error: insertError } = await supabase.from(table).insert([payload]);
    
    if (insertError) {
      console.error('Error inserting to base table:', insertError);
      alert(`Gagal Tambah ke ${table}: ${insertError.message}`);
      return null;
    }
    
    console.log('✓ Item berhasil ditambahkan ke', table);
    
    // 2. Simpan foto ke tabel foto (jika ada)
    if (data.images && data.images.length > 0) {
      console.log('Menyimpan', data.images.length, 'foto ke tabel foto...');
      await savePhotosToTable(data.partNumber, data.images);
      console.log('✓ Foto berhasil disimpan');
    }
    
    // 3. Simpan harga jual ke list_harga_jual (jika ada)
    if (data.price && data.price > 0) {
      try {
        const hargaPayload = {
          part_number: data.partNumber,
          name: data.name,
          harga: Number(data.price),
          created_at: getWIBISOString()
        };
        await supabase.from('list_harga_jual').upsert(hargaPayload, { onConflict: 'part_number' });
        console.log('✓ Harga jual tersimpan di list_harga_jual');
      } catch (priceError) {
        console.error('Error saving harga jual:', priceError);
        // Tidak menggagalkan seluruh operasi jika harga gagal disimpan
      }
    }
    
    return data.partNumber;
  } catch (error: any) {
    console.error('Error in addInventory:', error);
    const errorMsg = error?.message || error?.toString() || 'Unknown error';
    alert(`Gagal menambahkan barang: ${errorMsg}`);
    throw error; // Re-throw untuk ditangkap di form
  }
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

  // 2. Update Foto
  await savePhotosToTable(pk, item.images || []);

  // 3. Update Harga Jual (jika ada)
  if (item.price && item.price > 0) {
    try {
      const hargaPayload = {
        part_number: pk,
        name: item.name,
        harga: Number(item.price),
        created_at: getWIBISOString()
      };
      
      // Delete then insert untuk list_harga_jual (karena mungkin tidak punya unique constraint)
      await supabase.from('list_harga_jual').delete().eq('part_number', pk);
      await supabase.from('list_harga_jual').insert([hargaPayload]);
      
      console.log('✓ Harga jual berhasil diupdate:', item.price);
    } catch (priceError) {
      console.error('Error updating harga jual:', priceError);
    }
  }

  // 4. Insert Log Mutasi
  if (transactionData) {
     try {
       const isBarangMasuk = transactionData.type === 'in';
       // Tentukan nama tabel log
       const logTable = getLogTableName(isBarangMasuk ? 'barang_masuk' : 'barang_keluar', store);
       const validTempo = isBarangMasuk ? (transactionData.tempo || 'CASH') : (transactionData.resiTempo || transactionData.tempo || '-');

       console.log('Menyimpan log mutasi:', {
         type: isBarangMasuk ? 'MASUK' : 'KELUAR',
         table: logTable,
         qty: transactionData.qty,
         harga: transactionData.price || 0
       });

       // Base payload
       let finalLogData: any = {
           part_number: pk,
           brand: item.brand,
           application: item.application,
           rak: item.shelf,
           ecommerce: transactionData.ecommerce || '-',
           customer: transactionData.customer || '-',
           tempo: validTempo,
           created_at: transactionData.tanggal ? new Date(transactionData.tanggal).toISOString() : getWIBISOString()
       };

       if (isBarangMasuk) {
          // PAYLOAD KHUSUS BARANG MASUK (Sesuai Struktur SQL Baru)
          finalLogData = {
              ...finalLogData,
              nama_barang: item.name,        // Menggunakan nama_barang
              stok_akhir: item.quantity,     // Menggunakan stok_akhir (spelling benar)
              qty_masuk: Number(transactionData.qty),
              harga_satuan: Number(transactionData.price || transactionData.harga_satuan || 0), // Harga opsional, default 0
              harga_total: Number(transactionData.qty) * Number(transactionData.price || transactionData.harga_satuan || 0)
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
    .gt('qty_out', 0) // Only fetch items that haven't been processed yet
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
      // Hapus data dari database daripada update status
      const { error } = await supabase.from(orderTable).delete().eq('id', item.id);
      if (error) throw error;
      return { success: true, msg: 'Pesanan ditolak dan dihapus.' };
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
      created_at: getWIBISOString()
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
    if (!stockItem || stockItem.quantity < item.qty_out) {
      alert(`Stok ${item.barang} tidak cukup!`);
      return false;
    }

    const newQty = stockItem.quantity - item.qty_out;
    await supabase.from(stockTable).update({ quantity: newQty }).eq('part_number', item.part_number);

    await supabase.from(outTable).insert([{
      tempo: 'ONLINE',
      ecommerce: item.type_toko || item.toko,
      customer: item.customer,
      part_number: item.part_number,
      name: item.barang,
      brand: item.brand || stockItem.brand,
      application: item.application || stockItem.application,
      rak: stockItem.shelf,
      stock_ahir: newQty,
      qty_keluar: item.qty_out,
      harga_satuan: item.harga_satuan,
      harga_total: item.total_harga,
      resi: item.resi,
      id_reseller: item.id_reseller,
      id_customer: item.id_customer,
      created_at: getWIBISOString()
    }]);

    // Update scan_resi table - use tanggal, resi, and part_number as composite key
    await supabase.from(scanTable)
      .update({ qty_out: 0 }) // Mark as processed by setting qty_out to 0
      .eq('tanggal', item.tanggal)
      .eq('resi', item.resi)
      .eq('part_number', item.part_number);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

// --- RETUR SOLD ITEM FUNCTION ---
export const returSoldItem = async (
  item: SoldItemRow,
  store: string | null,
  keterangan: 'KEMBALI KE STOCK' | 'BARANG RUSAK'
): Promise<{ success: boolean; msg: string }> => {
  const returTable = store === 'mjm' ? 'retur_mjm' : (store === 'bjw' ? 'retur_bjw' : null);
  const stockTable = store === 'mjm' ? 'base_mjm' : (store === 'bjw' ? 'base_bjw' : null);
  const outTable = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);

  if (!returTable || !stockTable || !outTable) return { success: false, msg: 'Toko tidak valid' };

  try {
    // 1. Insert ke tabel retur
    const returData = {
      tanggal_pemesanan: item.created_at,
      resi: item.resi || '-',
      toko: item.kode_toko || store?.toUpperCase() || '-',
      customer: item.customer,
      part_number: item.part_number,
      nama_barang: item.name,
      quantity: item.qty_keluar,
      harga_satuan: item.harga_satuan,
      harga_total: item.harga_total,
      tanggal_retur: getWIBISOString(),
      keterangan: keterangan,
      ecommerce: item.ecommerce || 'OFFLINE',
      status: 'Retur'
    };

    const { error: returError } = await supabase.from(returTable).insert([returData]);
    if (returError) throw returError;

    // 2. Jika KEMBALI KE STOCK, update stok barang
    if (keterangan === 'KEMBALI KE STOCK') {
      const { data: stockData, error: stockError } = await supabase
        .from(stockTable)
        .select('quantity')
        .eq('part_number', item.part_number)
        .single();

      if (stockError) throw stockError;

      const newQty = (stockData?.quantity || 0) + item.qty_keluar;
      const { error: updateError } = await supabase
        .from(stockTable)
        .update({ quantity: newQty })
        .eq('part_number', item.part_number);

      if (updateError) throw updateError;
    }

    // 3. Hapus dari barang_keluar agar tidak muncul di menu SUDAH TERJUAL
    const { error: deleteError } = await supabase.from(outTable).delete().eq('id', item.id);
    if (deleteError) throw deleteError;

    return { success: true, msg: `Retur berhasil - ${keterangan}` };
  } catch (e: any) {
    console.error('Retur Error:', e);
    return { success: false, msg: `Gagal retur: ${e.message}` };
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
    tanggal: getWIBISOString(),
    customer: customerName,
    part_number: item.partNumber,
    nama_barang: item.name,
    quantity: Number(item.cartQuantity),
    harga_satuan: Number(item.customPrice ?? item.price),
    harga_total: Number((item.customPrice ?? item.price) * item.cartQuantity),
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
            .update({ quantity: newQty, last_updated: getWIBISOString() })
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

// --- FETCH ITEM HISTORY (Riwayat transaksi per item) ---
export const fetchItemHistory = async (partNumber: string, store?: string | null): Promise<any[]> => {
  if (!partNumber) return [];
  
  try {
    const logTableMasuk = getLogTableName('barang_masuk', store);
    const logTableKeluar = getLogTableName('barang_keluar', store);
    
    // Fetch dari barang_masuk
    const { data: masukData, error: masukError } = await supabase
      .from(logTableMasuk)
      .select('*')
      .eq('part_number', partNumber)
      .order('created_at', { ascending: false });
    
    if (masukError) {
      console.error('Error fetching barang masuk history:', masukError);
    }
    
    console.log(`Barang Masuk untuk ${partNumber}:`, masukData?.length || 0, 'records');
    
    // Fetch dari barang_keluar  
    const { data: keluarData, error: keluarError } = await supabase
      .from(logTableKeluar)
      .select('*')
      .eq('part_number', partNumber)
      .order('created_at', { ascending: false });
    
    if (keluarError) {
      console.error('Error fetching barang keluar history:', keluarError);
    }
    
    console.log(`Barang Keluar untuk ${partNumber}:`, keluarData?.length || 0, 'records');
    
    // Gabungkan dan format data
    const allHistory: any[] = [];
    
    // Map barang masuk
    (masukData || []).forEach(item => {
      allHistory.push({
        id: item.id,
        timestamp: new Date(item.created_at).getTime(),
        change: Number(item.qty_masuk || 0),
        quantity: Number(item.qty_masuk || 0), // Tambahkan quantity
        reason: `Barang Masuk - ${item.customer || 'N/A'}`,
        resi: item.ecommerce || '-',
        customer: item.customer || '-',
        tempo: item.tempo || '-',
        price: Number(item.harga_satuan || 0),
        total: Number(item.harga_total || 0),
        totalPrice: Number(item.harga_total || 0),
        type: 'in'
      });
    });
    
    // Map barang keluar
    (keluarData || []).forEach(item => {
      allHistory.push({
        id: item.id,
        timestamp: new Date(item.created_at).getTime(),
        change: Number(item.qty_keluar || 0),
        quantity: Number(item.qty_keluar || 0), // Tambahkan quantity
        reason: `Barang Keluar - ${item.customer || 'N/A'}`,
        resi: item.resi || item.tempo || '-',
        customer: item.customer || '-',
        tempo: item.tempo || '-',
        price: Number(item.harga_satuan || 0),
        total: Number(item.harga_total || 0),
        totalPrice: Number(item.harga_total || 0),
        type: 'out'
      });
    });
    
    // Sort by timestamp descending
    return allHistory.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error in fetchItemHistory:', error);
    return [];
  }
};

// --- FETCH BARANG MASUK (Riwayat semua barang masuk) ---
export const fetchBarangMasuk = async (store?: string | null): Promise<any[]> => {
  try {
    const logTable = getLogTableName('barang_masuk', store);
    
    const { data, error } = await supabase
      .from(logTable)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) {
      console.error('Error fetching barang masuk:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in fetchBarangMasuk:', error);
    return [];
  }
};

// --- FETCH BARANG KELUAR (Riwayat semua barang keluar) ---
export const fetchBarangKeluar = async (store?: string | null): Promise<any[]> => {
  try {
    const logTable = getLogTableName('barang_keluar', store);
    
    const { data, error } = await supabase
      .from(logTable)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) {
      console.error('Error fetching barang keluar:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in fetchBarangKeluar:', error);
    return [];
  }
};

// ... (sisa kode lainnya)
// Placeholder Functions (Safe defaults)
export const fetchHistory = async () => [];
export const fetchHistoryLogsPaginated = async () => ({ data: [], total: 0 });
export const addBarangMasuk = async () => {};
export const addBarangKeluar = async () => {};
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