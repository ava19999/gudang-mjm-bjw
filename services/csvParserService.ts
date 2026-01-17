// FILE: services/csvParserService.ts
// Service for parsing Shopee and TikTok CSV exports

import { ParsedCSVItem, ShopeeCSVRow, TikTokCSVRow } from '../types';

// ============================================================================
// SHOPEE CSV PARSER
// ============================================================================

/**
 * Parse Shopee CSV export
 */
export const parseShopeeCSV = (csvText: string): ParsedCSVItem[] => {
  try {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('File CSV kosong atau tidak valid');
    }
    
    // Parse header
    const headers = parseCSVLine(lines[0]);
    
    // Parse rows
    const items: ParsedCSVItem[] = [];
    const seenItems = new Set<string>(); // Track duplicates
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < headers.length) continue;
      
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      
      // Extract data
      const resi = row['No. Resi'] || '';
      const orderNo = row['No. Pesanan'] || '';
      const productName = row['Nama Produk'] || '';
      const variation = row['Nama Variasi'] || '';
      const sku = row['Nomor Referensi SKU'] || row['SKU Induk'] || '';
      const quantity = parseInt(row['Jumlah']) || 1;
      const priceAfterDiscount = parseFloat(row['Harga Setelah Diskon']?.replace(/[^\d.]/g, '') || '0');
      const totalPrice = parseFloat(row['Total Harga Produk']?.replace(/[^\d.]/g, '') || '0');
      const customer = row['Nama Penerima'] || row['Username (Pembeli)'] || '';
      
      // Skip if no resi or already processed this exact item
      if (!resi || !productName) continue;
      
      // Create unique key for duplicate detection
      const itemKey = `${resi}-${productName}-${variation}`;
      if (seenItems.has(itemKey)) {
        console.log(`Skipping duplicate: ${itemKey}`);
        continue;
      }
      seenItems.add(itemKey);
      
      items.push({
        resi,
        customer,
        order_id: orderNo,
        sku,
        product_name: productName,
        variation,
        quantity,
        price: priceAfterDiscount,
        total_price: totalPrice
      });
    }
    
    return items;
  } catch (error: any) {
    console.error('Error parsing Shopee CSV:', error);
    throw new Error('Gagal memproses file Shopee CSV: ' + error.message);
  }
};

// ============================================================================
// TIKTOK CSV PARSER
// ============================================================================

/**
 * Parse TikTok CSV export
 */
export const parseTikTokCSV = (csvText: string): ParsedCSVItem[] => {
  try {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('File CSV kosong atau tidak valid');
    }
    
    // Parse header
    const headers = parseCSVLine(lines[0]);
    
    // Parse rows
    const items: ParsedCSVItem[] = [];
    const seenItems = new Set<string>(); // Track duplicates
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < headers.length) continue;
      
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      
      // Extract data
      const resi = row['Tracking ID'] || '';
      const orderId = row['Order ID'] || '';
      const productName = row['Product Name'] || '';
      const variation = row['Variation'] || '';
      const sku = row['Seller SKU'] || row['SKU ID'] || '';
      const quantity = parseInt(row['Quantity']) || 1;
      const unitPrice = parseFloat(row['SKU Unit Original Price']?.replace(/[^\d.]/g, '') || '0');
      const subtotalAfterDiscount = parseFloat(row['SKU Subtotal After Discount']?.replace(/[^\d.]/g, '') || '0');
      const customer = row['Recipient'] || row['Buyer Username'] || '';
      
      // Skip if no resi or already processed this exact item
      if (!resi || !productName) continue;
      
      // Create unique key for duplicate detection
      const itemKey = `${resi}-${productName}-${variation}`;
      if (seenItems.has(itemKey)) {
        console.log(`Skipping duplicate: ${itemKey}`);
        continue;
      }
      seenItems.add(itemKey);
      
      items.push({
        resi,
        customer,
        order_id: orderId,
        sku,
        product_name: productName,
        variation,
        quantity,
        price: unitPrice,
        total_price: subtotalAfterDiscount || (unitPrice * quantity)
      });
    }
    
    return items;
  } catch (error: any) {
    console.error('Error parsing TikTok CSV:', error);
    throw new Error('Gagal memproses file TikTok CSV: ' + error.message);
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current.trim());
  
  return result;
}

/**
 * Validate CSV format
 */
export const validateCSVFormat = (
  csvText: string,
  platform: 'shopee' | 'tiktok'
): { valid: boolean; error?: string } => {
  try {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return { valid: false, error: 'File CSV kosong' };
    }
    
    const headers = parseCSVLine(lines[0]);
    
    if (platform === 'shopee') {
      const requiredHeaders = ['No. Resi', 'Nama Produk', 'Jumlah'];
      const hasRequired = requiredHeaders.every(h => 
        headers.some(header => header.includes(h))
      );
      
      if (!hasRequired) {
        return { 
          valid: false, 
          error: 'Format Shopee CSV tidak valid. Pastikan file export dari Shopee.' 
        };
      }
    } else if (platform === 'tiktok') {
      const requiredHeaders = ['Tracking ID', 'Product Name', 'Quantity'];
      const hasRequired = requiredHeaders.every(h => 
        headers.some(header => header.includes(h))
      );
      
      if (!hasRequired) {
        return { 
          valid: false, 
          error: 'Format TikTok CSV tidak valid. Pastikan file export dari TikTok.' 
        };
      }
    }
    
    return { valid: true };
  } catch (error: any) {
    return { 
      valid: false, 
      error: 'Gagal membaca file CSV: ' + error.message 
    };
  }
};

/**
 * Group parsed items by receipt number
 */
export const groupItemsByResi = (items: ParsedCSVItem[]): Map<string, ParsedCSVItem[]> => {
  const grouped = new Map<string, ParsedCSVItem[]>();
  
  items.forEach(item => {
    const existing = grouped.get(item.resi) || [];
    existing.push(item);
    grouped.set(item.resi, existing);
  });
  
  return grouped;
};

/**
 * Get unique customers from parsed items
 */
export const getUniqueCustomers = (items: ParsedCSVItem[]): string[] => {
  const customers = new Set<string>();
  items.forEach(item => {
    if (item.customer) {
      customers.add(item.customer);
    }
  });
  return Array.from(customers).sort();
};

/**
 * Filter items by receipt number
 */
export const filterItemsByResi = (
  items: ParsedCSVItem[],
  resiNumbers: string[]
): ParsedCSVItem[] => {
  const resiSet = new Set(resiNumbers.map(r => r.trim()));
  return items.filter(item => resiSet.has(item.resi));
};

/**
 * Convert file to text
 */
export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const text = e.target?.result as string;
      resolve(text);
    };
    
    reader.onerror = (e) => {
      reject(new Error('Gagal membaca file'));
    };
    
    reader.readAsText(file, 'UTF-8');
  });
};

/**
 * Auto-detect CSV platform from headers
 */
export const detectCSVPlatform = (csvText: string): 'shopee' | 'tiktok' | 'unknown' => {
  try {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 1) return 'unknown';
    
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    
    // Check for Shopee-specific headers
    if (headers.some(h => h.includes('no. pesanan')) || 
        headers.some(h => h.includes('username (pembeli)'))) {
      return 'shopee';
    }
    
    // Check for TikTok-specific headers
    if (headers.some(h => h.includes('order id')) && 
        headers.some(h => h.includes('tracking id'))) {
      return 'tiktok';
    }
    
    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
};

/**
 * Calculate summary statistics from parsed items
 */
export const calculateSummary = (items: ParsedCSVItem[]) => {
  const uniqueResi = new Set(items.map(i => i.resi)).size;
  const uniqueCustomers = new Set(items.map(i => i.customer)).size;
  const totalItems = items.length;
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = items.reduce((sum, item) => sum + item.total_price, 0);
  
  return {
    uniqueResi,
    uniqueCustomers,
    totalItems,
    totalQuantity,
    totalValue
  };
};
