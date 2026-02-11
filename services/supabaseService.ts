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

// --- FETCH DISTINCT SUPPLIERS (Customer dari Barang Masuk) ---
export const fetchDistinctSuppliers = async (store: string | null): Promise<string[]> => {
  const table = store === 'mjm' ? 'barang_masuk_mjm' : (store === 'bjw' ? 'barang_masuk_bjw' : null);
  if (!table) return [];

  try {
    const { data, error } = await supabase
      .from(table)
      .select('customer')
      .not('customer', 'is', null)
      .not('customer', 'eq', '')
      .not('customer', 'eq', '-');

    if (error) {
      console.error('Fetch Distinct Suppliers Error:', error);
      return [];
    }

    // Get unique values and filter out empty/dash
    const uniqueValues = [...new Set(
      (data || [])
        .map(d => d.customer?.trim().toUpperCase())
        .filter(Boolean)
        .filter(c => c !== '-' && c !== '')
    )];
    return uniqueValues.sort();
  } catch (err) {
    console.error('Fetch Distinct Suppliers Exception:', err);
    return [];
  }
};

// --- FETCH DISTINCT CUSTOMERS (Customer dari Barang Keluar) ---
export const fetchDistinctCustomers = async (store: string | null): Promise<string[]> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return [];

  try {
    const { data, error } = await supabase
      .from(table)
      .select('customer')
      .not('customer', 'is', null)
      .not('customer', 'eq', '')
      .not('customer', 'eq', '-');

    if (error) {
      console.error('Fetch Distinct Customers Error:', error);
      return [];
    }

    // Get unique values and filter out empty/dash
    const uniqueValues = [...new Set(
      (data || [])
        .map(d => d.customer?.trim().toUpperCase())
        .filter(Boolean)
        .filter(c => c !== '-' && c !== '')
    )];
    return uniqueValues.sort();
  } catch (err) {
    console.error('Fetch Distinct Customers Exception:', err);
    return [];
  }
};

// --- FETCH SEARCH SUGGESTIONS (untuk dropdown autocomplete) ---
export const fetchSearchSuggestions = async (
  store: string | null,
  field: 'part_number' | 'name' | 'brand' | 'application',
  searchQuery: string
): Promise<string[]> => {
  const table = getTableName(store);
  if (!searchQuery || searchQuery.length < 1) return [];

  try {
    const { data, error } = await supabase
      .from(table)
      .select(field)
      .ilike(field, `%${searchQuery}%`)
      .not(field, 'is', null)
      .not(field, 'eq', '')
      .limit(50);

    if (error) {
      console.error(`Fetch ${field} Suggestions Error:`, error);
      return [];
    }

    // Get unique values
    const uniqueValues = [...new Set(
      (data || [])
        .map((d: any) => d[field]?.toString().trim())
        .filter(Boolean)
    )];
    return uniqueValues.sort().slice(0, 20);
  } catch (err) {
    console.error(`Fetch ${field} Suggestions Exception:`, err);
    return [];
  }
};

// --- FETCH ALL DISTINCT VALUES (untuk initial load) ---
export const fetchAllDistinctValues = async (
  store: string | null,
  field: 'part_number' | 'name' | 'brand' | 'application'
): Promise<string[]> => {
  const table = getTableName(store);

  try {
    const { data, error } = await supabase
      .from(table)
      .select(field)
      .not(field, 'is', null)
      .not(field, 'eq', '');

    if (error) {
      console.error(`Fetch All ${field} Error:`, error);
      return [];
    }

    // Get unique values
    const uniqueValues = [...new Set(
      (data || [])
        .map((d: any) => d[field]?.toString().trim())
        .filter(Boolean)
    )];
    return uniqueValues.sort();
  } catch (err) {
    console.error(`Fetch All ${field} Exception:`, err);
    return [];
  }
};

// --- FETCH INVENTORY BY PART NUMBER (untuk quick search) ---
export const fetchInventoryByPartNumber = async (
  store: string | null,
  searchValue: string
): Promise<InventoryItem | null> => {
  const table = getTableName(store);
  if (!searchValue) return null;

  try {
    // First try exact match on part_number
    let { data, error } = await supabase
      .from(table)
      .select('*')
      .ilike('part_number', searchValue)
      .limit(1)
      .single();

    // If not found, try searching by name
    if (error || !data) {
      const { data: nameData, error: nameError } = await supabase
        .from(table)
        .select('*')
        .ilike('name', `%${searchValue}%`)
        .limit(1)
        .single();

      if (nameError || !nameData) {
        return null;
      }
      data = nameData;
    }

    // Fetch photo if exists
    const partNumber = data.part_number;
    const { data: photoData } = await supabase
      .from('foto')
      .select('*')
      .eq('part_number', partNumber)
      .single();

    return mapItemFromDB(data, photoData);
  } catch (err) {
    console.error('Fetch Inventory By Part Number Exception:', err);
    return null;
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
  const finalImages = imagesFromTable;

  return {
    ...item,
    id: pk, 
    partNumber: pk,
    name: item.name,
    // No swap needed - brand is brand, application is application
    brand: item.brand,
    application: item.application,
    shelf: item.shelf,
    quantity: Number(item.quantity || 0),
    price: 0, 
    costPrice: 0, 
    imageUrl: finalImages[0] || '',
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
    // No swap needed - brand is brand, application is application
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
interface CostPriceData { part_number: string; harga_satuan: number; }

// Fetch harga modal terakhir dari barang_masuk
const fetchLatestCostPricesForItems = async (items: any[], store?: string | null): Promise<Record<string, CostPriceData>> => {
  if (!items || items.length === 0) return {};
  const partNumbersToCheck = items.map(i => {
       const pn = i.part_number || i.partNumber;
       return typeof pn === 'string' ? pn.trim() : pn;
  }).filter(Boolean);
  if (partNumbersToCheck.length === 0) return {};

  const logTable = getLogTableName('barang_masuk', store);
  
  try {
    // Ambil semua barang masuk untuk part numbers ini, order by created_at desc
    const { data, error } = await supabase
      .from(logTable)
      .select('part_number, harga_satuan, created_at')
      .in('part_number', partNumbersToCheck)
      .not('harga_satuan', 'is', null)
      .gt('harga_satuan', 0)
      .order('created_at', { ascending: false });
    
    if (error) return {};
    
    // Ambil harga satuan terakhir untuk setiap part number
    const costPriceMap: Record<string, CostPriceData> = {};
    (data || []).forEach((row: any) => {
      const pk = (row.part_number || '').trim();
      if (pk && !costPriceMap[pk]) {
        // Hanya ambil yang pertama (terbaru) karena sudah diorder desc
        costPriceMap[pk] = { part_number: pk, harga_satuan: Number(row.harga_satuan || 0) };
      }
    });
    return costPriceMap;
  } catch (e) { return {}; }
};

// Fetch harga jual dari list_harga_jual, fallback ke barang_keluar jika 0
const fetchLatestPricesForItems = async (items: any[], store?: string | null): Promise<Record<string, PriceData>> => {
  if (!items || items.length === 0) return {};
  const partNumbersToCheck = items.map(i => {
       const pn = i.part_number || i.partNumber;
       return typeof pn === 'string' ? pn.trim() : pn;
  }).filter(Boolean);
  if (partNumbersToCheck.length === 0) return {};

  try {
    // 1. Ambil harga dari list_harga_jual (pusat)
    const { data, error } = await supabase.from('list_harga_jual').select('part_number, harga').in('part_number', partNumbersToCheck);
    if (error) return {};
    
    const priceMap: Record<string, PriceData> = {};
    const zeroOrMissingParts: string[] = [];
    
    (data || []).forEach((row: any) => {
      if (row.part_number) {
        const pk = row.part_number.trim();
        const harga = Number(row.harga || 0);
        priceMap[pk] = { part_number: pk, harga };
        if (harga === 0) zeroOrMissingParts.push(pk);
      }
    });
    
    // Cari part numbers yang tidak ada di list_harga_jual
    partNumbersToCheck.forEach(pk => {
      if (!priceMap[pk]) zeroOrMissingParts.push(pk);
    });
    
    // 2. Jika ada harga 0 atau tidak ada, cari dari barang_keluar (harga terakhir laku)
    if (zeroOrMissingParts.length > 0) {
      const outTable = getLogTableName('barang_keluar', store);
      const { data: outData } = await supabase
        .from(outTable)
        .select('part_number, harga_satuan, created_at')
        .in('part_number', zeroOrMissingParts)
        .not('harga_satuan', 'is', null)
        .gt('harga_satuan', 0)
        .order('created_at', { ascending: false });
      
      // Map harga terakhir dari barang_keluar
      const outPriceMap: Record<string, number> = {};
      (outData || []).forEach((row: any) => {
        const pk = (row.part_number || '').trim();
        if (pk && !outPriceMap[pk]) {
          outPriceMap[pk] = Number(row.harga_satuan || 0);
        }
      });
      
      // Update priceMap dengan harga dari barang_keluar jika harga = 0 atau tidak ada
      zeroOrMissingParts.forEach(pk => {
        if (outPriceMap[pk] && outPriceMap[pk] > 0) {
          priceMap[pk] = { part_number: pk, harga: outPriceMap[pk] };
        }
      });
    }
    
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
    if (!images || images.length === 0) {
      await supabase.from('foto').delete().eq('part_number', partNumber);
      return;
    }
    const photoPayload = mapImagesToPhotoRow(partNumber, images);
    await supabase.from('foto').upsert(photoPayload, { onConflict: 'part_number' });
  } catch (e) { console.error('Error saving photos:', e); }
};

// ============================================================================
// FOTO PRODUK TYPES & FUNCTIONS
// ============================================================================

export interface FotoProdukRow {
  id?: number;
  part_number: string;
  foto_1?: string;
  foto_2?: string;
  foto_3?: string;
  foto_4?: string;
  foto_5?: string;
  foto_6?: string;
  foto_7?: string;
  foto_8?: string;
  foto_9?: string;
  foto_10?: string;
  created_at?: string;
}

export interface FotoLinkRow {
  nama_csv: string;
  sku?: string | null;  // Optional - kolom mungkin belum ada di tabel
  foto_1?: string | null;
  foto_2?: string | null;
  foto_3?: string | null;
  foto_4?: string | null;
  foto_5?: string | null;
  foto_6?: string | null;
  foto_7?: string | null;
  foto_8?: string | null;
  foto_9?: string | null;
  foto_10?: string | null;
}

// Fetch foto produk dari tabel foto
export const fetchFotoProduk = async (searchTerm?: string): Promise<FotoProdukRow[]> => {
  try {
    let query = supabase
      .from('foto')
      .select('*')
      .order('created_at', { ascending: false });

    if (searchTerm && searchTerm.trim()) {
      query = query.ilike('part_number', `%${searchTerm}%`);
    }

    const { data, error } = await query.limit(500);

    if (error) {
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('Table foto does not exist');
        return [];
      }
      console.error('fetchFotoProduk Error:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('fetchFotoProduk Exception:', err);
    return [];
  }
};

// Fetch all foto_link entries
export const fetchFotoLink = async (searchTerm?: string): Promise<FotoLinkRow[]> => {
  try {
    // Select semua kolom - sku mungkin tidak ada di tabel
    let query = supabase
      .from('foto_link')
      .select('*')
      .order('nama_csv', { ascending: true });

    if (searchTerm && searchTerm.trim()) {
      // Search in nama_csv only (sku mungkin tidak ada)
      query = query.ilike('nama_csv', `%${searchTerm}%`);
    }

    // Fetch semua data tanpa limit (untuk 3388+ rows)
    const { data, error } = await query;

    if (error) {
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('Table foto_link does not exist');
        return [];
      }
      console.error('fetchFotoLink Error:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('fetchFotoLink Exception:', err);
    return [];
  }
};

// Fetch foto_link entries that don't have SKU yet
// Note: Jika kolom sku belum ada, ini akan return semua data
export const fetchFotoLinkWithoutSku = async (): Promise<FotoLinkRow[]> => {
  try {
    // Coba fetch semua dulu, filter di client side jika sku column tidak ada
    const { data, error } = await supabase
      .from('foto_link')
      .select('*')
      .order('nama_csv', { ascending: true })
      .limit(500);

    if (error) {
      console.error('fetchFotoLinkWithoutSku Error:', error);
      return [];
    }

    // Filter di client side - items tanpa sku
    const filtered = (data || []).filter(d => !d.sku || d.sku.trim() === '');
    return filtered;
  } catch (err) {
    console.error('fetchFotoLinkWithoutSku Exception:', err);
    return [];
  }
};

// Check existing part numbers in foto table
export const checkExistingFotoPartNumbers = async (partNumbers: string[]): Promise<Set<string>> => {
  if (!partNumbers || partNumbers.length === 0) return new Set();
  
  try {
    const { data, error } = await supabase
      .from('foto')
      .select('part_number')
      .in('part_number', partNumbers);

    if (error) {
      console.error('checkExistingFotoPartNumbers Error:', error);
      return new Set();
    }

    return new Set((data || []).map(d => d.part_number));
  } catch (err) {
    console.error('checkExistingFotoPartNumbers Exception:', err);
    return new Set();
  }
};

// Fetch all part numbers from MJM store (for autocomplete)
export const fetchAllPartNumbersMJM = async (): Promise<Array<{ part_number: string; name: string }>> => {
  try {
    const { data, error } = await supabase
      .from('base_mjm')
      .select('part_number, name')
      .not('part_number', 'is', null)
      .order('part_number', { ascending: true });

    if (error) {
      console.error('fetchAllPartNumbersMJM Error:', error);
      return [];
    }

    return (data || []).map(d => ({
      part_number: d.part_number || '',
      name: d.name || ''
    }));
  } catch (err) {
    console.error('fetchAllPartNumbersMJM Exception:', err);
    return [];
  }
};

// Insert batch to foto table
export const insertFotoBatch = async (
  rows: FotoProdukRow[]
): Promise<{ success: boolean; error?: string; inserted?: number }> => {
  if (!rows || rows.length === 0) {
    return { success: false, error: 'No data to insert' };
  }

  try {
    const { data, error } = await supabase
      .from('foto')
      .upsert(rows, { onConflict: 'part_number' })
      .select();

    if (error) {
      console.error('insertFotoBatch Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, inserted: data?.length || 0 };
  } catch (err: any) {
    console.error('insertFotoBatch Exception:', err);
    return { success: false, error: err.message };
  }
};

// Insert batch to foto_link table
export const insertFotoLinkBatch = async (
  rows: FotoLinkRow[]
): Promise<{ success: boolean; error?: string; inserted?: number }> => {
  if (!rows || rows.length === 0) {
    return { success: false, error: 'No data to insert' };
  }

  try {
    const { data, error } = await supabase
      .from('foto_link')
      .upsert(rows, { onConflict: 'nama_csv' })
      .select();

    if (error) {
      console.error('insertFotoLinkBatch Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, inserted: data?.length || 0 };
  } catch (err: any) {
    console.error('insertFotoLinkBatch Exception:', err);
    return { success: false, error: err.message };
  }
};

const parseSkuCsvString = (skuString: string): string[] => {
  if (!skuString || !skuString.trim()) return [];
  const input = skuString.trim();
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (inQuotes && input[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      const value = current.trim();
      if (value) result.push(value);
      current = '';
      continue;
    }

    current += ch;
  }

  const last = current.trim();
  if (last) result.push(last);
  return result;
};

const escapeSkuCsvValue = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/[",]/.test(trimmed)) {
    return `"${trimmed.replace(/"/g, '""')}"`;
  }
  return trimmed;
};

const formatSkuCsvString = (skus: string[]): string => {
  return skus.map(escapeSkuCsvValue).filter(Boolean).join(', ');
};

// Update SKU in foto_link and sync to foto + product_alias + base_mjm image_url
// Supports multiple SKUs separated by comma (CSV-style quotes supported)
export const updateFotoLinkSku = async (
  namaCsv: string,
  skuString: string
): Promise<{ success: boolean; error?: string; warning?: string }> => {
  if (!namaCsv) {
    return { success: false, error: 'nama_csv is required' };
  }

  // If empty SKU, just clear the sku field
  if (!skuString || skuString.trim() === '') {
    try {
      const { error: updateError } = await supabase
        .from('foto_link')
        .update({ sku: '' })
        .eq('nama_csv', namaCsv);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // Parse comma-separated SKUs (CSV-style quotes supported)
  const skuArray = parseSkuCsvString(skuString);
  if (skuArray.length === 0) {
    // All SKUs cleared
    try {
      const { error: updateError } = await supabase
        .from('foto_link')
        .update({ sku: '' })
        .eq('nama_csv', namaCsv);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  try {
    // 1. Get the foto_link row to get foto URLs
    const { data: linkData, error: fetchError } = await supabase
      .from('foto_link')
      .select('*')
      .eq('nama_csv', namaCsv)
      .single();

    if (fetchError || !linkData) {
      return { success: false, error: 'foto_link entry not found: ' + (fetchError?.message || 'unknown') };
    }

    const canonicalSkuString = formatSkuCsvString(skuArray);

    // 2. Update the sku in foto_link (store as comma-separated string)
    const { error: updateError } = await supabase
      .from('foto_link')
      .update({ sku: canonicalSkuString })
      .eq('nama_csv', namaCsv);

    if (updateError) {
      if (updateError.message?.includes('column') || updateError.code === '42703') {
        return { 
          success: false, 
          error: 'Kolom "sku" belum ada di tabel foto_link. Silakan tambahkan kolom "sku" (text) ke tabel foto_link di Supabase.' 
        };
      }
      return { success: false, error: updateError.message };
    }

    // Get first foto URL for base_mjm update
    const firstFoto = linkData.foto_1 || linkData.foto_2 || linkData.foto_3 || '';

    // Build foto fields object
    const fotoFields: any = {};
    if (linkData.foto_1) fotoFields.foto_1 = linkData.foto_1;
    if (linkData.foto_2) fotoFields.foto_2 = linkData.foto_2;
    if (linkData.foto_3) fotoFields.foto_3 = linkData.foto_3;
    if (linkData.foto_4) fotoFields.foto_4 = linkData.foto_4;
    if (linkData.foto_5) fotoFields.foto_5 = linkData.foto_5;
    if (linkData.foto_6) fotoFields.foto_6 = linkData.foto_6;
    if (linkData.foto_7) fotoFields.foto_7 = linkData.foto_7;
    if (linkData.foto_8) fotoFields.foto_8 = linkData.foto_8;
    if (linkData.foto_9) fotoFields.foto_9 = linkData.foto_9;
    if (linkData.foto_10) fotoFields.foto_10 = linkData.foto_10;

    let notFoundSkus: string[] = [];

    // 3. For each SKU, insert/upsert to foto table and update base_mjm/bjw
    for (const sku of skuArray) {
      // Check if SKU exists in inventory
      const { data: mjmItem } = await supabase
        .from('base_mjm')
        .select('part_number')
        .eq('part_number', sku)
        .maybeSingle();
      
      const { data: bjwItem } = await supabase
        .from('base_bjw')
        .select('part_number')
        .eq('part_number', sku)
        .maybeSingle();

      const skuExistsInInventory = !!(mjmItem || bjwItem);
      if (!skuExistsInInventory) {
        notFoundSkus.push(sku);
      }

      // Insert/upsert to foto table
      const fotoPayload = { part_number: sku, ...fotoFields };
      let { error: fotoError } = await supabase
        .from('foto')
        .upsert(fotoPayload, { onConflict: 'part_number' });

      if (fotoError) {
        console.warn(`Upsert to foto failed for ${sku}, trying delete+insert:`, fotoError.message);
        await supabase.from('foto').delete().eq('part_number', sku);
        const { error: insertError } = await supabase.from('foto').insert(fotoPayload);
        if (insertError) {
          console.warn(`Insert to foto also failed for ${sku}:`, insertError.message);
        } else {
          console.log('Successfully inserted foto for:', sku);
        }
      } else {
        console.log('Successfully upserted foto for:', sku);
      }

      // Update image_url in base_mjm/base_bjw
      if (firstFoto) {
        await supabase.from('base_mjm').update({ image_url: firstFoto }).eq('part_number', sku);
        await supabase.from('base_bjw').update({ image_url: firstFoto }).eq('part_number', sku);
      }

      // Insert to product_alias for search capability
      const { data: existingAlias } = await supabase
        .from('product_alias')
        .select('id')
        .eq('part_number', sku)
        .eq('alias_name', namaCsv)
        .maybeSingle();

      if (!existingAlias) {
        await supabase.from('product_alias').insert({
          part_number: sku,
          alias_name: namaCsv,
          source: 'foto_link'
        });
      }
    }

    // Return with warning if some SKUs not found in inventory
    if (notFoundSkus.length > 0) {
      return { 
        success: true, 
        warning: `SKU tidak ditemukan di inventory: ${notFoundSkus.join(', ')}. Foto tersimpan tapi tidak akan muncul di Beranda/Gudang.` 
      };
    }

    return { success: true };
  } catch (err: any) {
    console.error('updateFotoLinkSku Exception:', err);
    return { success: false, error: err.message };
  }
};

// Search inventory with product_alias support
export const searchInventoryWithAlias = async (
  store: string | null,
  searchTerm: string
): Promise<InventoryItem[]> => {
  if (!searchTerm || searchTerm.trim().length < 2) return [];
  
  const table = getTableName(store);
  const searchLower = searchTerm.toLowerCase().trim();

  try {
    // First search directly in inventory
    let { data: directResults } = await supabase
      .from(table)
      .select('*')
      .or(`part_number.ilike.%${searchLower}%,name.ilike.%${searchLower}%`)
      .limit(50);

    // Then search via product_alias
    const { data: aliasResults } = await supabase
      .from('product_alias')
      .select('part_number')
      .ilike('alias_name', `%${searchLower}%`)
      .limit(20);

    const aliasPartNumbers = (aliasResults || []).map(a => a.part_number).filter(Boolean);
    
    let aliasItems: any[] = [];
    if (aliasPartNumbers.length > 0) {
      const { data } = await supabase
        .from(table)
        .select('*')
        .in('part_number', aliasPartNumbers);
      aliasItems = data || [];
    }

    // Merge results (avoid duplicates)
    const allItems = [...(directResults || [])];
    const existingPNs = new Set(allItems.map(i => i.part_number));
    aliasItems.forEach(item => {
      if (!existingPNs.has(item.part_number)) {
        allItems.push(item);
      }
    });

    if (allItems.length === 0) return [];

    // Fetch photos and prices
    const photoMap = await fetchPhotosForItems(allItems);
    const priceMap = await fetchLatestPricesForItems(allItems, store);

    return allItems.map(item => {
      const mapped = mapItemFromDB(item, photoMap[item.part_number]);
      const lookupKey = (item.part_number || '').trim();
      if (priceMap[lookupKey]) mapped.price = priceMap[lookupKey].harga;
      return mapped;
    });
  } catch (err) {
    console.error('searchInventoryWithAlias Exception:', err);
    return [];
  }
};

// --- INVENTORY FUNCTIONS ---

export const fetchInventory = async (store?: string | null): Promise<InventoryItem[]> => {
  const table = getTableName(store);
  const { data: items, error } = await supabase.from(table).select('*').order('name', { ascending: true });
  
  if (error || !items) return [];

  const photoMap = await fetchPhotosForItems(items);
  const priceMap = await fetchLatestPricesForItems(items, store);
  const costPriceMap = await fetchLatestCostPricesForItems(items, store);

  return items.map(item => {
    const mapped = mapItemFromDB(item, photoMap[item.part_number]);
    const lookupKey = (item.part_number || '').trim();
    if (priceMap[lookupKey]) mapped.price = priceMap[lookupKey].harga;
    if (costPriceMap[lookupKey]) mapped.costPrice = costPriceMap[lookupKey].harga_satuan;
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
  // Filter by brand (merek spare part) - kolom brand di DB
  if (filters?.brand) query = query.ilike('brand', `%${filters.brand}%`);
  // Filter by application (jenis mobil) - kolom application di DB
  if (filters?.app) query = query.ilike('application', `%${filters.app}%`);
  // Filter by stock type
  if (filters?.type === 'low') query = query.gt('quantity', 0).lte('quantity', 3);
  if (filters?.type === 'empty') query = query.eq('quantity', 0);

  const { data: items, count, error } = await query.range(from, to).order('name', { ascending: true });
  if (error || !items) return { data: [], total: 0 };

  const photoMap = await fetchPhotosForItems(items);
  const priceMap = await fetchLatestPricesForItems(items, store);
  const costPriceMap = await fetchLatestCostPricesForItems(items, store);

  return { 
    data: items.map(item => {
      const mapped = mapItemFromDB(item, photoMap[item.part_number]);
      const lookupKey = (item.part_number || '').trim();
      if (priceMap[lookupKey]) mapped.price = priceMap[lookupKey].harga;
      if (costPriceMap[lookupKey]) mapped.costPrice = costPriceMap[lookupKey].harga_satuan;
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
  // Filter by brand (merek spare part) - kolom brand di DB
  if (filters?.brand) query = query.ilike('brand', `%${filters.brand}%`);
  // Filter by application (jenis mobil) - kolom application di DB
  if (filters?.app) query = query.ilike('application', `%${filters.app}%`);
  // Filter by stock type
  if (filters?.type === 'low') query = query.gt('quantity', 0).lte('quantity', 3);
  if (filters?.type === 'empty') query = query.eq('quantity', 0);

  const { data: items, error } = await query.order('name', { ascending: true });
  if (error || !items) return [];

  const photoMap = await fetchPhotosForItems(items);
  const priceMap = await fetchLatestPricesForItems(items, store);
  const costPriceMap = await fetchLatestCostPricesForItems(items, store);

  return items.map(item => {
    const mapped = mapItemFromDB(item, photoMap[item.part_number]);
    const lookupKey = (item.part_number || '').trim();
    if (priceMap[lookupKey]) mapped.price = priceMap[lookupKey].harga;
    if (costPriceMap[lookupKey]) mapped.costPrice = costPriceMap[lookupKey].harga_satuan;
    return mapped;
  });
};

// --- ADD & UPDATE & DELETE INVENTORY ---

export const addInventory = async (data: InventoryFormData, store?: string | null): Promise<string | null> => {
  const table = getTableName(store);
  if (!data.partNumber) { console.error("Part Number wajib!"); return null; }
  const payload = mapItemToDB(data);
  const { error } = await supabase.from(table).insert([payload]);
  
  if (error) {
    console.error(`Gagal Tambah: ${error.message}`);
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

  // 2. Update Harga Jual di list_harga_jual (pusat)
  if (item.price !== undefined && item.price >= 0) {
    try {
      const { data: existingPrice } = await supabase
        .from('list_harga_jual')
        .select('part_number')
        .eq('part_number', pk)
        .maybeSingle();
      
      if (existingPrice) {
        // Update existing record
        await supabase
          .from('list_harga_jual')
          .update({ harga: item.price, name: item.name })
          .eq('part_number', pk);
      } else {
        // Insert new record
        await supabase
          .from('list_harga_jual')
          .insert([{ part_number: pk, name: item.name, harga: item.price, created_at: getWIBDate().toISOString() }]);
      }
    } catch (e) {
      console.error('Gagal update harga jual:', e);
    }
  }

  // 3. Insert Log Mutasi
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

interface BarangMasukFilters {
    search?: string;
    partNumber?: string;
    customer?: string;
    dateFrom?: string;
    dateTo?: string;
}

export const fetchBarangMasukLog = async (store: string | null, page = 1, limit = 20, filters: BarangMasukFilters = {}) => {
    const table = getLogTableName('barang_masuk', store);
    const stockTable = getTableName(store);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase.from(table).select('*', { count: 'exact' });

    // Apply search filters
    if (filters.search) {
        query = query.or(`part_number.ilike.%${filters.search}%,nama_barang.ilike.%${filters.search}%,customer.ilike.%${filters.search}%`);
    }
    
    // Apply part number filter
    if (filters.partNumber) {
        query = query.ilike('part_number', `%${filters.partNumber}%`);
    }
    
    // Apply customer filter
    if (filters.customer) {
        query = query.ilike('customer', `%${filters.customer}%`);
    }
    
    // Apply date range filter
    if (filters.dateFrom) {
        query = query.gte('created_at', `${filters.dateFrom}T00:00:00`);
    }
    if (filters.dateTo) {
        query = query.lte('created_at', `${filters.dateTo}T23:59:59`);
    }

    // Order by id descending (newest first) as primary, then created_at as fallback
    const { data, count, error } = await query
        .order('id', { ascending: false })
        .range(from, to);

    if (error) {
        console.error("Error fetching barang masuk:", error);
        return { data: [], total: 0 };
    }

    // Fetch current quantities from stock table
    // Normalize part numbers to handle variations (spaces, case differences)
    const normalizePN = (pn: string): string => pn?.trim().toUpperCase().replace(/\s+/g, ' ') || '';
    const partNumbers = [...new Set((data || []).map(row => row.part_number).filter(Boolean))];
    const normalizedPartNumbers = partNumbers.map(normalizePN);
    let stockMap: Record<string, number> = {};
    
    if (partNumbers.length > 0) {
        // Query with both original and normalized versions to catch more matches
        const { data: stockData } = await supabase
            .from(stockTable)
            .select('part_number, quantity');
        
        if (stockData) {
            // Create lookup map using normalized part numbers
            const stockByNormalized = stockData.reduce((acc, item) => {
                const normalizedKey = normalizePN(item.part_number);
                acc[normalizedKey] = item.quantity;
                acc[item.part_number] = item.quantity; // Also keep original
                return acc;
            }, {} as Record<string, number>);
            
            // Build stockMap matching log part numbers to stock
            partNumbers.forEach(pn => {
                const normalized = normalizePN(pn);
                stockMap[pn] = stockByNormalized[pn] ?? stockByNormalized[normalized] ?? 0;
            });
        }
    }
    
    const mappedData = (data || []).map(row => ({
        ...row,
        name: row.nama_barang || row.name, 
        quantity: row.qty_masuk,
        current_qty: stockMap[row.part_number] ?? 0
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

    // Search all fields: name, part_number, brand, application
    if (searchTerm) query = query.or(`name.ilike.%${searchTerm}%,part_number.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,application.ilike.%${searchTerm}%`);
    if (partNumberSearch) query = query.ilike('part_number', `%${partNumberSearch}%`);
    if (nameSearch) query = query.ilike('name', `%${nameSearch}%`);
    // Brand di UI = merek spare part = kolom brand di DB
    if (brandSearch) query = query.ilike('brand', `%${brandSearch}%`);
    // Aplikasi di UI = jenis mobil = kolom application di DB
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
  updates: { partNumber: string; quantity: number; price: number; nama_barang?: string; tempo?: string },
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
    if (updates.tempo) updatePayload.tempo = updates.tempo;

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

// 4.1 UPDATE SOLD ITEM PRICE
export const updateSoldItemPrice = async (
  itemId: string,
  newHargaTotal: number,
  qtyKeluar: number,
  store: string | null
): Promise<{ success: boolean; msg: string }> => {
  const table = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!table) return { success: false, msg: 'Toko tidak valid' };

  try {
    const { error } = await supabase
      .from(table)
      .update({ 
        harga_total: newHargaTotal 
      })
      .eq('id', itemId);

    if (error) {
      console.error('Update Sold Item Price Error:', error);
      return { success: false, msg: 'Gagal update harga: ' + error.message };
    }

    return { success: true, msg: 'Harga berhasil diupdate' };
  } catch (err: any) {
    console.error('Update Sold Item Price Exception:', err);
    return { success: false, msg: 'Error: ' + (err.message || 'Unknown error') };
  }
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
    const stockTable = getTableName(store);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase.from(table).select('*', { count: 'exact' });

    if (search) {
        query = query.or(`part_number.ilike.%${search}%,name.ilike.%${search}%,customer.ilike.%${search}%`);
    }

    // Order by id descending (newest first)
    const { data, count, error } = await query
        .order('id', { ascending: false })
        .range(from, to);

    if (error) {
        console.error("Error fetching barang keluar:", error);
        return { data: [], total: 0 };
    }

    // Fetch current quantities from stock table
    // Normalize part numbers to handle variations (spaces, case differences)
    const normalizePN = (pn: string): string => pn?.trim().toUpperCase().replace(/\s+/g, ' ') || '';
    const partNumbers = [...new Set((data || []).map(row => row.part_number).filter(Boolean))];
    let stockMap: Record<string, number> = {};
    
    if (partNumbers.length > 0) {
        // Query all stock data and match using normalized part numbers
        const { data: stockData } = await supabase
            .from(stockTable)
            .select('part_number, quantity');
        
        if (stockData) {
            // Create lookup map using normalized part numbers
            const stockByNormalized = stockData.reduce((acc, item) => {
                const normalizedKey = normalizePN(item.part_number);
                acc[normalizedKey] = item.quantity;
                acc[item.part_number] = item.quantity; // Also keep original
                return acc;
            }, {} as Record<string, number>);
            
            // Build stockMap matching log part numbers to stock
            partNumbers.forEach(pn => {
                const normalized = normalizePN(pn);
                stockMap[pn] = stockByNormalized[pn] ?? stockByNormalized[normalized] ?? 0;
            });
        }
    }
    
    const mappedData = (data || []).map(row => ({
        ...row,
        name: row.name || row.nama_barang, 
        quantity: row.qty_keluar,
        customer: row.customer || '-',
        tempo: row.tempo || 'CASH',
        current_qty: stockMap[row.part_number] ?? 0
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

// INSERT BARANG KELUAR - untuk undo delete / manual insert
interface InsertBarangKeluarPayload {
  kode_toko?: string;
  tempo?: string;
  ecommerce?: string;
  customer?: string;
  part_number: string;
  name?: string;
  brand?: string;
  application?: string;
  qty_keluar: number;
  harga_total?: number;
  resi?: string;
  tanggal?: string;
}

export const insertBarangKeluar = async (
  payload: InsertBarangKeluarPayload,
  store: string | null
): Promise<{ success: boolean; msg: string; data?: any }> => {
  const outTable = getLogTableName('barang_keluar', store);
  const stockTable = getTableName(store);

  try {
    // 1. Get current stock to calculate stock_ahir and get item details
    const { data: stockItem, error: stockError } = await supabase
      .from(stockTable)
      .select('*')
      .eq('part_number', payload.part_number)
      .single();

    if (stockError || !stockItem) {
      return { success: false, msg: 'Barang tidak ditemukan di database.' };
    }

    // 2. Check stock availability
    if (stockItem.quantity < payload.qty_keluar) {
      return { success: false, msg: `Stok tidak cukup! (Sisa: ${stockItem.quantity})` };
    }

    // 3. Calculate new stock
    const newQty = stockItem.quantity - payload.qty_keluar;

    // 4. Update stock in base table
    const { error: updateError } = await supabase
      .from(stockTable)
      .update({ quantity: newQty })
      .eq('part_number', payload.part_number);

    if (updateError) {
      return { success: false, msg: 'Gagal mengupdate stok: ' + updateError.message };
    }

    // 5. Calculate harga_satuan if not provided
    const hargaTotal = payload.harga_total || 0;
    const hargaSatuan = payload.qty_keluar > 0 ? Math.round(hargaTotal / payload.qty_keluar) : 0;

    // 6. Insert into barang_keluar log
    const logPayload = {
      kode_toko: payload.kode_toko || '-',
      tempo: payload.tempo || 'CASH',
      ecommerce: payload.ecommerce || 'OFFLINE',
      customer: payload.customer || '-',
      part_number: payload.part_number,
      name: payload.name || stockItem.name || '',
      brand: payload.brand || stockItem.brand || '',
      application: payload.application || stockItem.application || '',
      rak: stockItem.shelf || '',
      stock_ahir: newQty,
      qty_keluar: payload.qty_keluar,
      harga_satuan: hargaSatuan,
      harga_total: hargaTotal,
      resi: payload.resi || '-',
      created_at: payload.tanggal || getWIBDate().toISOString()
    };

    const { data: insertedData, error: insertError } = await supabase
      .from(outTable)
      .insert([logPayload])
      .select()
      .single();

    if (insertError) {
      // Rollback stock update on insert failure
      await supabase
        .from(stockTable)
        .update({ quantity: stockItem.quantity })
        .eq('part_number', payload.part_number);
      
      return { success: false, msg: 'Gagal menyimpan log: ' + insertError.message };
    }

    return { success: true, msg: 'Barang keluar berhasil dicatat.', data: insertedData };
  } catch (e: any) {
    console.error('insertBarangKeluar Error:', e);
    return { success: false, msg: 'Error: ' + (e.message || 'Unknown error') };
  }
};

export const fetchHistory = async () => [];
export const fetchItemHistory = async () => [];

// GET UNIQUE ECOMMERCE LIST - untuk dropdown filter di modal
export const getUniqueEcommerceList = async (
  type: 'in' | 'out',
  store?: string | null
): Promise<string[]> => {
  const effectiveStore = store || 'mjm';
  const tableName = type === 'in' 
    ? getLogTableName('barang_masuk', effectiveStore)
    : getLogTableName('barang_keluar', effectiveStore);
  
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('ecommerce')
      .not('ecommerce', 'is', null)
      .not('ecommerce', 'eq', '')
      .not('ecommerce', 'eq', '-');
    
    if (error) {
      console.error('getUniqueEcommerceList Error:', error);
      return [];
    }
    
    // Extract unique values
    const uniqueSet = new Set<string>();
    (data || []).forEach((row: any) => {
      if (row.ecommerce && row.ecommerce.trim()) {
        uniqueSet.add(row.ecommerce.trim().toUpperCase());
      }
    });
    
    // Sort alphabetically
    return Array.from(uniqueSet).sort();
  } catch (e) {
    console.error('getUniqueEcommerceList Exception:', e);
    return [];
  }
};

// FETCH HISTORY LOGS PAGINATED - untuk modal detail Masuk/Keluar di Dashboard
export const fetchHistoryLogsPaginated = async (
  type: 'in' | 'out',
  page: number = 1,
  perPage: number = 50,
  filters: any = {},
  store?: string | null,
  sortBy?: string,
  sortDirection: 'asc' | 'desc' = 'desc'
): Promise<{ data: any[]; count: number }> => {
  // Determine store from context if not provided
  const effectiveStore = store || 'mjm';
  const tableName = type === 'in' 
    ? getLogTableName('barang_masuk', effectiveStore)
    : getLogTableName('barang_keluar', effectiveStore);
  const stockTable = getTableName(effectiveStore);
  
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
    
    // Map frontend sort keys to database columns
    // Note: currentQty is fetched from a separate stock table after the query,
    // so we cannot sort by it at the database level. We'll handle it client-side.
    const sortColumnMap: Record<string, string> = {
      'timestamp': 'created_at',
      'partNumber': 'part_number',
      'name': type === 'in' ? 'nama_barang' : 'name',
      'quantity': type === 'in' ? 'qty_masuk' : 'qty_keluar',
      'price': 'harga_satuan',
      'totalPrice': 'harga_total',
      'customer': 'customer',
      'currentStock': type === 'in' ? 'stok_akhir' : 'stock_ahir',
      'currentQty': type === 'in' ? 'stok_akhir' : 'stock_ahir' // Use stok_akhir as proxy for currentQty
    };
    
    // Determine sort column
    const sortColumn = sortBy && sortColumnMap[sortBy] ? sortColumnMap[sortBy] : 'created_at';
    const ascending = sortDirection === 'asc';
    
    // Order and apply pagination
    const start = (page - 1) * perPage;
    query = query
      .order(sortColumn, { ascending })
      .range(start, start + perPage - 1);
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('fetchHistoryLogsPaginated Error:', error);
      return { data: [], count: 0 };
    }
    
    // Fetch current quantities from stock table
    // Normalize part numbers to handle variations (spaces, case differences)
    const normalizePN = (pn: string): string => pn?.trim().toUpperCase().replace(/\s+/g, ' ') || '';
    const partNumbers = [...new Set((data || []).map(row => row.part_number).filter(Boolean))];
    let stockMap: Record<string, number> = {};
    
    if (partNumbers.length > 0) {
      // Query all stock data and match using normalized part numbers
      const { data: stockData } = await supabase
        .from(stockTable)
        .select('part_number, quantity');
      
      if (stockData) {
        // Create lookup map using normalized part numbers
        const stockByNormalized = stockData.reduce((acc, item) => {
          const normalizedKey = normalizePN(item.part_number);
          acc[normalizedKey] = item.quantity;
          acc[item.part_number] = item.quantity; // Also keep original
          return acc;
        }, {} as Record<string, number>);
        
        // Build stockMap matching log part numbers to stock
        partNumbers.forEach(pn => {
          const normalized = normalizePN(pn);
          stockMap[pn] = stockByNormalized[pn] ?? stockByNormalized[normalized] ?? 0;
        });
      }
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
        currentQty: stockMap[row.part_number] ?? 0,
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

// Fetch riwayat harga modal dari barang_masuk
export const fetchPriceHistoryBySource = async (partNumber: string, store?: string | null): Promise<{ source: string; price: number; date: string; isOfficial?: boolean }[]> => {
  if (!partNumber) return [];
  
  // Try both stores if store not specified
  const stores = store ? [store] : ['mjm', 'bjw'];
  const allHistory: { source: string; price: number; date: string; timestamp: number; isOfficial?: boolean }[] = [];
  
  for (const s of stores) {
    const logTable = getLogTableName('barang_masuk', s);
    try {
      const { data, error } = await supabase
        .from(logTable)
        .select('harga_satuan, customer, created_at')
        .eq('part_number', partNumber.trim())
        .not('harga_satuan', 'is', null)
        .gt('harga_satuan', 0)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (!error && data) {
        data.forEach((row: any) => {
          const dateObj = new Date(row.created_at);
          allHistory.push({
            source: row.customer || (s === 'mjm' ? 'MJM' : 'BJW'),
            price: Number(row.harga_satuan || 0),
            date: dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
            timestamp: dateObj.getTime(),
            isOfficial: false
          });
        });
      }
    } catch (e) {
      console.error(`Error fetching price history from ${logTable}:`, e);
    }
  }
  
  // Sort by timestamp descending and return without timestamp
  return allHistory
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(({ source, price, date, isOfficial }) => ({ source, price, date, isOfficial }));
};

// Fetch riwayat harga jual dari list_harga_jual dan barang_keluar
export const fetchSellPriceHistory = async (partNumber: string, store?: string | null): Promise<{ source: string; price: number; date: string; isOfficial?: boolean }[]> => {
  if (!partNumber) return [];
  
  const allHistory: { source: string; price: number; date: string; timestamp: number; isOfficial: boolean }[] = [];
  
  // 1. Ambil harga dari list_harga_jual (harga resmi)
  try {
    const { data: officialData, error: officialError } = await supabase
      .from('list_harga_jual')
      .select('harga, name, created_at')
      .eq('part_number', partNumber.trim())
      .maybeSingle();
    
    if (!officialError && officialData && officialData.harga > 0) {
      const dateObj = officialData.created_at ? new Date(officialData.created_at) : new Date();
      allHistory.push({
        source: 'HARGA RESMI',
        price: Number(officialData.harga || 0),
        date: dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
        timestamp: Date.now() + 1000000, // Ensure it's always at top
        isOfficial: true
      });
    }
  } catch (e) {
    console.error('Error fetching official price:', e);
  }
  
  // 2. Ambil history dari barang_keluar
  const stores = store ? [store] : ['mjm', 'bjw'];
  
  for (const s of stores) {
    const logTable = getLogTableName('barang_keluar', s);
    try {
      const { data, error } = await supabase
        .from(logTable)
        .select('harga_satuan, customer, created_at')
        .eq('part_number', partNumber.trim())
        .not('harga_satuan', 'is', null)
        .gt('harga_satuan', 0)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (!error && data) {
        data.forEach((row: any) => {
          const dateObj = new Date(row.created_at);
          allHistory.push({
            source: row.customer || (s === 'mjm' ? 'MJM' : 'BJW'),
            price: Number(row.harga_satuan || 0),
            date: dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
            timestamp: dateObj.getTime(),
            isOfficial: false
          });
        });
      }
    } catch (e) {
      console.error(`Error fetching sell price history from ${logTable}:`, e);
    }
  }
  
  // Sort: official first, then by timestamp descending
  return allHistory
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(({ source, price, date, isOfficial }) => ({ source, price, date, isOfficial }));
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

// --- RETUR FUNCTIONS ---

const getReturTableName = (store: string | null | undefined) => {
  if (store === 'mjm') return 'retur_mjm';
  if (store === 'bjw') return 'retur_bjw';
  return 'retur_mjm';
};

// Create retur from sold item
export const createReturFromSold = async (
  soldItem: any,
  tipeRetur: 'BALIK_STOK' | 'RUSAK' | 'TUKAR_SUPPLIER' | 'TUKAR_SUPPLIER_GANTI',
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

    // 6. Jika TUKAR_SUPPLIER_GANTI, kurangi stok (ganti barang) dan pending penukaran supplier
    if (tipeRetur === 'TUKAR_SUPPLIER_GANTI') {
      if (!partNum) {
        return { success: true, msg: `Retur tercatat, tapi part_number kosong!` };
      }

      // Ambil stok saat ini
      const { data: currentItem, error: fetchError } = await supabase
        .from(stockTable)
        .select('quantity, name, part_number')
        .ilike('part_number', partNum)
        .single();

      if (fetchError) {
        console.error('TUKAR_SUPPLIER_GANTI: Error fetching item:', fetchError);
        return { success: true, msg: `Retur tercatat, tapi gagal update stok: ${fetchError.message}` };
      }

      if (currentItem) {
        const newQty = (currentItem.quantity || 0) - qty;
        const actualPartNumber = currentItem.part_number || partNum;

        const { error: updateError } = await supabase
          .from(stockTable)
          .update({ quantity: newQty })
          .eq('part_number', actualPartNumber);

        if (updateError) {
          console.error('TUKAR_SUPPLIER_GANTI: Error updating stock:', updateError);
          return { success: true, msg: `Retur tercatat, tapi gagal update stok: ${updateError.message}` };
        }

        return { success: true, msg: `Stok berkurang (${qty}) untuk ganti barang, menunggu tukar supplier` };
      }

      return { success: true, msg: `Retur tercatat, tapi item tidak ditemukan di inventory` };
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
    if (newStatus === 'Sudah Ditukar' && (returData.tipe_retur === 'TUKAR_SUPPLIER' || returData.tipe_retur === 'TUKAR_SUPPLIER_GANTI')) {
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

// --- BARANG KOSONG (LOW STOCK) FUNCTIONS ---

export interface LowStockItem {
  partNumber: string;
  name: string;
  brand: string;
  application: string;
  quantity: number;
  shelf: string;
  suppliers: SupplierHistory[];
}

export interface SupplierHistory {
  supplier: string;
  lastDate: string;
  lastPrice: number;
  lastPriceCash: number;
  lastPriceTempo: number;
  totalQtyPurchased: number;
  purchaseCount: number;
}

export interface SupplierOrderGroup {
  supplier: string;
  items: LowStockOrderItem[];
  totalItems: number;
}

export interface LowStockOrderItem {
  partNumber: string;
  name: string;
  brand: string;
  application: string;
  currentStock: number;
  shelf: string;
  lastPrice: number;
  lastPriceCash: number;
  lastPriceTempo: number;
  orderQty: number;
  isSelected: boolean;
}

// Fetch all items with quantity < threshold (default 5) - Optimized with batch loading
export const fetchLowStockItems = async (
  store: string | null, 
  threshold: number = 5,
  onProgress?: (progress: number, currentItem: string) => void
): Promise<LowStockItem[]> => {
  const table = getTableName(store);
  const logTable = getLogTableName('barang_masuk', store);
  if (!table || !logTable) return [];

  try {
    // Step 1: Fetch items with low stock (10%)
    onProgress?.(5, 'Mengambil data stok...');
    
    const { data: items, error } = await supabase
      .from(table)
      .select('*')
      .lt('quantity', threshold)
      .order('quantity', { ascending: true });

    if (error || !items) {
      console.error('fetchLowStockItems Error:', error);
      return [];
    }

    if (items.length === 0) {
      onProgress?.(100, 'Selesai');
      return [];
    }

    onProgress?.(15, `Ditemukan ${items.length} barang stok rendah`);

    // Step 2: Batch fetch ALL supplier history in ONE query (much faster!)
    const partNumbers = items.map(i => i.part_number);
    
    onProgress?.(20, 'Mengambil data supplier...');
    
    const { data: supplierData, error: supplierError } = await supabase
      .from(logTable)
      .select('part_number, customer, created_at, harga_satuan, qty_masuk, tempo')
      .in('part_number', partNumbers)
      .not('customer', 'is', null)
      .not('customer', 'eq', '')
      .not('customer', 'eq', '-')
      .order('created_at', { ascending: false });

    if (supplierError) {
      console.error('fetchLowStockItems Supplier Error:', supplierError);
    }

    onProgress?.(60, 'Memproses data supplier...');

    // Step 3: Group supplier data by part_number
    const supplierByPart: Record<string, typeof supplierData> = {};
    if (supplierData) {
      for (const row of supplierData) {
        if (!supplierByPart[row.part_number]) {
          supplierByPart[row.part_number] = [];
        }
        supplierByPart[row.part_number].push(row);
      }
    }

    onProgress?.(75, 'Menyusun hasil...');

    // Step 4: Build result with supplier history
    const result: LowStockItem[] = [];
    const totalItems = items.length;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const partSupplierData = supplierByPart[item.part_number] || [];
      
      // Process supplier data for this item
      const supplierMap: Record<string, { 
        lastDate: string; 
        lastPrice: number;
        lastPriceCash: number;
        lastPriceTempo: number;
        lastCashDate: string;
        lastTempoDate: string;
        totalQty: number; 
        count: number 
      }> = {};

      for (const row of partSupplierData) {
        const supplier = (row.customer || '').trim().toUpperCase();
        if (!supplier || supplier === '-') continue;

        const tempo = (row.tempo || 'CASH').toUpperCase();
        const isTempo = tempo.includes('TEMPO') || tempo.includes('3 BLN') || tempo.includes('3BLN');
        const price = row.harga_satuan || 0;
        const rowDate = row.created_at;

        if (!supplierMap[supplier]) {
          supplierMap[supplier] = {
            lastDate: rowDate,
            lastPrice: price,
            lastPriceCash: isTempo ? 0 : price,
            lastPriceTempo: isTempo ? price : 0,
            lastCashDate: isTempo ? '' : rowDate,
            lastTempoDate: isTempo ? rowDate : '',
            totalQty: row.qty_masuk || 0,
            count: 1
          };
        } else {
          supplierMap[supplier].totalQty += row.qty_masuk || 0;
          supplierMap[supplier].count += 1;
          
          if (new Date(rowDate) > new Date(supplierMap[supplier].lastDate)) {
            supplierMap[supplier].lastDate = rowDate;
            supplierMap[supplier].lastPrice = price;
          }
          
          if (!isTempo && price > 0) {
            if (!supplierMap[supplier].lastCashDate || new Date(rowDate) > new Date(supplierMap[supplier].lastCashDate)) {
              supplierMap[supplier].lastPriceCash = price;
              supplierMap[supplier].lastCashDate = rowDate;
            }
          }
          
          if (isTempo && price > 0) {
            if (!supplierMap[supplier].lastTempoDate || new Date(rowDate) > new Date(supplierMap[supplier].lastTempoDate)) {
              supplierMap[supplier].lastPriceTempo = price;
              supplierMap[supplier].lastTempoDate = rowDate;
            }
          }
        }
      }

      const suppliers: SupplierHistory[] = Object.entries(supplierMap)
        .map(([supplier, data]) => ({
          supplier,
          lastDate: data.lastDate,
          lastPrice: data.lastPrice,
          lastPriceCash: data.lastPriceCash,
          lastPriceTempo: data.lastPriceTempo,
          totalQtyPurchased: data.totalQty,
          purchaseCount: data.count
        }))
        .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());

      result.push({
        partNumber: item.part_number,
        name: item.name || '',
        brand: item.brand || '',
        application: item.application || '',
        quantity: item.quantity || 0,
        shelf: item.shelf || '',
        suppliers
      });

      // Update progress every 10 items
      if (i % 10 === 0) {
        const progress = 75 + Math.floor((i / totalItems) * 25);
        onProgress?.(progress, `Memproses ${i + 1}/${totalItems}...`);
      }
    }

    onProgress?.(100, 'Selesai!');
    return result;
  } catch (err) {
    console.error('fetchLowStockItems Exception:', err);
    return [];
  }
};

// Fetch supplier history for a specific part number
export const fetchSupplierHistoryForItem = async (store: string | null, partNumber: string): Promise<SupplierHistory[]> => {
  const logTable = getLogTableName('barang_masuk', store);
  if (!logTable) return [];

  try {
    const { data, error } = await supabase
      .from(logTable)
      .select('customer, created_at, harga_satuan, qty_masuk, tempo')
      .eq('part_number', partNumber)
      .not('customer', 'is', null)
      .not('customer', 'eq', '')
      .not('customer', 'eq', '-')
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('fetchSupplierHistoryForItem Error:', error);
      return [];
    }

    // Group by supplier with separate CASH and TEMPO prices
    const supplierMap: Record<string, { 
      lastDate: string; 
      lastPrice: number;
      lastPriceCash: number;
      lastPriceTempo: number;
      lastCashDate: string;
      lastTempoDate: string;
      totalQty: number; 
      count: number 
    }> = {};

    for (const row of data) {
      const supplier = (row.customer || '').trim().toUpperCase();
      if (!supplier || supplier === '-') continue;

      const tempo = (row.tempo || 'CASH').toUpperCase();
      const isTempo = tempo.includes('TEMPO') || tempo.includes('3 BLN') || tempo.includes('3BLN');
      const price = row.harga_satuan || 0;
      const rowDate = row.created_at;

      if (!supplierMap[supplier]) {
        supplierMap[supplier] = {
          lastDate: rowDate,
          lastPrice: price,
          lastPriceCash: isTempo ? 0 : price,
          lastPriceTempo: isTempo ? price : 0,
          lastCashDate: isTempo ? '' : rowDate,
          lastTempoDate: isTempo ? rowDate : '',
          totalQty: row.qty_masuk || 0,
          count: 1
        };
      } else {
        supplierMap[supplier].totalQty += row.qty_masuk || 0;
        supplierMap[supplier].count += 1;
        
        // Update latest overall date/price
        if (new Date(rowDate) > new Date(supplierMap[supplier].lastDate)) {
          supplierMap[supplier].lastDate = rowDate;
          supplierMap[supplier].lastPrice = price;
        }
        
        // Update CASH price if this is the latest CASH transaction
        if (!isTempo && price > 0) {
          if (!supplierMap[supplier].lastCashDate || new Date(rowDate) > new Date(supplierMap[supplier].lastCashDate)) {
            supplierMap[supplier].lastPriceCash = price;
            supplierMap[supplier].lastCashDate = rowDate;
          }
        }
        
        // Update TEMPO price if this is the latest TEMPO transaction
        if (isTempo && price > 0) {
          if (!supplierMap[supplier].lastTempoDate || new Date(rowDate) > new Date(supplierMap[supplier].lastTempoDate)) {
            supplierMap[supplier].lastPriceTempo = price;
            supplierMap[supplier].lastTempoDate = rowDate;
          }
        }
      }
    }

    return Object.entries(supplierMap).map(([supplier, data]) => ({
      supplier,
      lastDate: data.lastDate,
      lastPrice: data.lastPrice,
      lastPriceCash: data.lastPriceCash,
      lastPriceTempo: data.lastPriceTempo,
      totalQtyPurchased: data.totalQty,
      purchaseCount: data.count
    })).sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  } catch (err) {
    console.error('fetchSupplierHistoryForItem Exception:', err);
    return [];
  }
};

// Get items grouped by supplier for ordering
export const getLowStockGroupedBySupplier = async (
  store: string | null, 
  threshold: number = 5,
  onProgress?: (progress: number, currentItem: string) => void
): Promise<SupplierOrderGroup[]> => {
  const lowStockItems = await fetchLowStockItems(store, threshold, onProgress);
  
  // Group items by their primary supplier (most recent)
  const supplierGroups: Record<string, LowStockOrderItem[]> = {};
  const noSupplierItems: LowStockOrderItem[] = [];

  for (const item of lowStockItems) {
    const primarySupplierData = item.suppliers[0];
    const orderItem: LowStockOrderItem = {
      partNumber: item.partNumber,
      name: item.name,
      brand: item.brand,
      application: item.application,
      currentStock: item.quantity,
      shelf: item.shelf,
      lastPrice: primarySupplierData?.lastPrice || 0,
      lastPriceCash: primarySupplierData?.lastPriceCash || 0,
      lastPriceTempo: primarySupplierData?.lastPriceTempo || 0,
      orderQty: 0,
      isSelected: false
    };

    if (item.suppliers.length > 0) {
      const primarySupplier = item.suppliers[0].supplier;
      if (!supplierGroups[primarySupplier]) {
        supplierGroups[primarySupplier] = [];
      }
      supplierGroups[primarySupplier].push(orderItem);
    } else {
      noSupplierItems.push(orderItem);
    }
  }

  const result: SupplierOrderGroup[] = Object.entries(supplierGroups)
    .map(([supplier, items]) => ({
      supplier,
      items,
      totalItems: items.length
    }))
    .sort((a, b) => b.totalItems - a.totalItems);

  // Add "Tanpa Supplier" group if exists
  if (noSupplierItems.length > 0) {
    result.push({
      supplier: 'TANPA SUPPLIER',
      items: noSupplierItems,
      totalItems: noSupplierItems.length
    });
  }

  return result;
};

// Save order to supplier (creates a record of the order)
export interface SupplierOrder {
  id?: number;
  created_at?: string;
  supplier: string;
  items: { partNumber: string; name: string; qty: number; price: number }[];
  status: 'PENDING' | 'ORDERED' | 'RECEIVED';
  notes: string;
  total_items: number;
  total_value: number;
}

export const saveSupplierOrder = async (store: string | null, order: SupplierOrder): Promise<{ success: boolean; msg: string }> => {
  // For now, we'll store orders in localStorage since we may not have a dedicated table
  try {
    const storageKey = `supplier_orders_${store || 'default'}`;
    const existingOrders = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    const newOrder = {
      ...order,
      id: Date.now(),
      created_at: new Date().toISOString(),
      status: 'PENDING' as const
    };
    
    existingOrders.unshift(newOrder);
    localStorage.setItem(storageKey, JSON.stringify(existingOrders));
    
    return { success: true, msg: 'Order berhasil disimpan' };
  } catch (err) {
    console.error('saveSupplierOrder Error:', err);
    return { success: false, msg: 'Gagal menyimpan order' };
  }
};

export const fetchSupplierOrders = async (store: string | null): Promise<SupplierOrder[]> => {
  try {
    const storageKey = `supplier_orders_${store || 'default'}`;
    const orders = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return orders;
  } catch (err) {
    console.error('fetchSupplierOrders Error:', err);
    return [];
  }
};

export const updateSupplierOrderStatus = async (
  store: string | null, 
  orderId: number, 
  status: 'PENDING' | 'ORDERED' | 'RECEIVED'
): Promise<{ success: boolean; msg: string }> => {
  try {
    const storageKey = `supplier_orders_${store || 'default'}`;
    const orders = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    const orderIndex = orders.findIndex((o: SupplierOrder) => o.id === orderId);
    if (orderIndex === -1) {
      return { success: false, msg: 'Order tidak ditemukan' };
    }
    
    orders[orderIndex].status = status;
    localStorage.setItem(storageKey, JSON.stringify(orders));
    
    return { success: true, msg: 'Status order diupdate' };
  } catch (err) {
    console.error('updateSupplierOrderStatus Error:', err);
    return { success: false, msg: 'Gagal update status' };
  }
};

export const deleteSupplierOrder = async (store: string | null, orderId: number): Promise<{ success: boolean; msg: string }> => {
  try {
    const storageKey = `supplier_orders_${store || 'default'}`;
    const orders = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    const filtered = orders.filter((o: SupplierOrder) => o.id !== orderId);
    localStorage.setItem(storageKey, JSON.stringify(filtered));
    
    return { success: true, msg: 'Order dihapus' };
  } catch (err) {
    console.error('deleteSupplierOrder Error:', err);
    return { success: false, msg: 'Gagal menghapus order' };
  }
};

// --- FETCH SUPPLIER PRICES BY PART NUMBER ---
// Returns list of suppliers/importers with their prices for a given part number
export interface SupplierPriceInfo {
  supplier: string;
  harga_satuan: number;
  tempo: string;
  last_order_date: string;
  qty_last: number;
}

export const fetchSupplierPricesByPartNumber = async (
  store: string | null,
  partNumber: string
): Promise<SupplierPriceInfo[]> => {
  const tableMasuk = store === 'mjm' ? 'barang_masuk_mjm' : (store === 'bjw' ? 'barang_masuk_bjw' : null);
  if (!tableMasuk || !partNumber) return [];

  try {
    // Fetch all purchase records for this part number
    const { data, error } = await supabase
      .from(tableMasuk)
      .select('customer, harga_satuan, tempo, qty_masuk, created_at')
      .ilike('part_number', partNumber)
      .not('customer', 'is', null)
      .not('customer', 'eq', '')
      .not('customer', 'eq', '-')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch Supplier Prices Error:', error);
      return [];
    }

    // Group by supplier, keep only the latest entry per supplier
    const supplierMap: Record<string, SupplierPriceInfo> = {};
    
    (data || []).forEach(row => {
      const supplier = row.customer?.trim().toUpperCase() || '';
      if (!supplier || supplier === '-') return;
      
      // Only keep the first (most recent) entry per supplier
      if (!supplierMap[supplier]) {
        supplierMap[supplier] = {
          supplier,
          harga_satuan: row.harga_satuan || 0,
          tempo: row.tempo || '-',
          last_order_date: row.created_at,
          qty_last: row.qty_masuk || 0
        };
      }
    });

    // Convert to array and sort by price (lowest first)
    return Object.values(supplierMap).sort((a, b) => a.harga_satuan - b.harga_satuan);
  } catch (err) {
    console.error('Fetch Supplier Prices Exception:', err);
    return [];
  }
};

// --- FETCH PRICE HISTORY BY PART NUMBER ---
// Returns history of cost prices (harga modal from barang_masuk) and selling prices (harga jual from barang_keluar)
export interface PriceHistoryItem {
  type: 'modal' | 'jual';
  harga: number;
  date: string;
  customer: string;
  qty: number;
  tempo?: string;
}

export const fetchPriceHistoryByPartNumber = async (
  store: string | null,
  partNumber: string
): Promise<PriceHistoryItem[]> => {
  const tableMasuk = store === 'mjm' ? 'barang_masuk_mjm' : (store === 'bjw' ? 'barang_masuk_bjw' : null);
  const tableKeluar = store === 'mjm' ? 'barang_keluar_mjm' : (store === 'bjw' ? 'barang_keluar_bjw' : null);
  if (!tableMasuk || !tableKeluar || !partNumber) return [];

  try {
    // Fetch cost price history (harga modal) from barang_masuk
    const { data: masukData, error: masukError } = await supabase
      .from(tableMasuk)
      .select('harga_satuan, qty_masuk, customer, tempo, created_at')
      .ilike('part_number', partNumber)
      .not('harga_satuan', 'is', null)
      .gt('harga_satuan', 0)
      .order('created_at', { ascending: false })
      .limit(20);

    // Fetch selling price history (harga jual) from barang_keluar
    const { data: keluarData, error: keluarError } = await supabase
      .from(tableKeluar)
      .select('harga_satuan, qty_keluar, customer, ecommerce, created_at')
      .ilike('part_number', partNumber)
      .not('harga_satuan', 'is', null)
      .gt('harga_satuan', 0)
      .order('created_at', { ascending: false })
      .limit(20);

    const history: PriceHistoryItem[] = [];

    // Add cost prices (harga modal)
    (masukData || []).forEach(row => {
      history.push({
        type: 'modal',
        harga: row.harga_satuan || 0,
        date: row.created_at,
        customer: row.customer || '-',
        qty: row.qty_masuk || 0,
        tempo: row.tempo || '-'
      });
    });

    // Add selling prices (harga jual)
    (keluarData || []).forEach(row => {
      history.push({
        type: 'jual',
        harga: row.harga_satuan || 0,
        date: row.created_at,
        customer: row.customer || row.ecommerce || '-',
        qty: row.qty_keluar || 0
      });
    });

    // Sort by date descending
    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return history;
  } catch (err) {
    console.error('Fetch Price History Exception:', err);
    return [];
  }
};
