// FILE: utils/csvParser.ts
// CSV Parser for Shopee & TikTok Export Files

export interface ShopeeExportRow {
  no_pesanan: string;
  status_pesanan: string;
  no_resi: string;
  nama_produk: string;
  nomor_referensi_sku: string;
  nama_variasi: string;
  harga_setelah_diskon: string;
  jumlah: string;
  total_harga_produk: string;
  username_pembeli: string;
  nama_penerima: string;
  no_telepon: string;
  alamat_pengiriman: string;
}

export interface TikTokExportRow {
  order_id: string;
  order_status: string;
  seller_sku: string;
  product_name: string;
  variation: string;
  quantity: string;
  sku_subtotal_after_discount: string;
  tracking_id: string;
  buyer_username: string;
  recipient: string;
  phone: string;
  detail_address: string;
}

export interface ParsedOrderData {
  resi: string;
  orderNumber: string;
  productName: string;
  sku: string;
  variation: string;
  quantity: number;
  pricePerUnit: number;
  totalPrice: number;
  customerName: string;
  recipientName: string;
  phone: string;
  address: string;
  source: 'SHOPEE' | 'TIKTOK';
}

/**
 * Parse CSV text to array of objects
 */
export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header.trim()] = values[index].trim();
      });
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields with commas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Toggle quote state
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Parse Shopee export CSV to standardized format
 */
export function parseShopeeExport(csvText: string): ParsedOrderData[] {
  const rows = parseCSV(csvText);
  const results: ParsedOrderData[] = [];

  for (const row of rows) {
    // Map Shopee column names (handle variations)
    const orderNumber = row['No. Pesanan'] || row['Order Number'] || '';
    const resi = row['No. Resi'] || row['Tracking Number'] || '';
    const productName = row['Nama Produk'] || row['Product Name'] || '';
    const sku = row['Nomor Referensi SKU'] || row['SKU Reference No'] || '';
    const variation = row['Nama Variasi'] || row['Variation Name'] || '';
    const quantity = parseInt(row['Jumlah'] || row['Quantity'] || '1');
    const priceStr = row['Harga Setelah Diskon'] || row['Price After Discount'] || '0';
    const totalStr = row['Total Harga Produk'] || row['Total Product Price'] || '0';
    const customerName = row['Username (Pembeli)'] || row['Buyer Username'] || '';
    const recipientName = row['Nama Penerima'] || row['Recipient Name'] || '';
    const phone = row['No. Telepon'] || row['Phone Number'] || '';
    const address = row['Alamat Pengiriman'] || row['Shipping Address'] || '';

    // Parse price (remove currency symbols and commas)
    const pricePerUnit = parsePrice(priceStr);
    const totalPrice = parsePrice(totalStr);

    if (resi && productName) {
      results.push({
        resi,
        orderNumber,
        productName,
        sku,
        variation,
        quantity,
        pricePerUnit,
        totalPrice,
        customerName,
        recipientName,
        phone,
        address,
        source: 'SHOPEE'
      });
    }
  }

  return results;
}

/**
 * Parse TikTok export CSV to standardized format
 */
export function parseTikTokExport(csvText: string): ParsedOrderData[] {
  const rows = parseCSV(csvText);
  const results: ParsedOrderData[] = [];

  for (const row of rows) {
    // Map TikTok column names
    const orderNumber = row['Order ID'] || '';
    const resi = row['Tracking ID'] || '';
    const productName = row['Product Name'] || '';
    const sku = row['Seller SKU'] || '';
    const variation = row['Variation'] || '';
    const quantity = parseInt(row['Quantity'] || '1');
    const priceStr = row['SKU Subtotal After Discount'] || '0';
    const customerName = row['Buyer Username'] || '';
    const recipientName = row['Recipient'] || '';
    const phone = row['Phone #'] || row['Phone'] || '';
    const address = row['Detail Address'] || '';

    // Parse price
    const totalPrice = parsePrice(priceStr);
    const pricePerUnit = quantity > 0 ? totalPrice / quantity : 0;

    if (resi && productName) {
      results.push({
        resi,
        orderNumber,
        productName,
        sku,
        variation,
        quantity,
        pricePerUnit,
        totalPrice,
        customerName,
        recipientName,
        phone,
        address,
        source: 'TIKTOK'
      });
    }
  }

  return results;
}

/**
 * Auto-detect format and parse
 */
export function parseMarketplaceExport(csvText: string): ParsedOrderData[] {
  const firstLine = csvText.split('\n')[0].toLowerCase();

  if (firstLine.includes('no. pesanan') || firstLine.includes('order number')) {
    return parseShopeeExport(csvText);
  } else if (firstLine.includes('order id') || firstLine.includes('tracking id')) {
    return parseTikTokExport(csvText);
  }

  // Try both formats
  const shopeeResults = parseShopeeExport(csvText);
  if (shopeeResults.length > 0) return shopeeResults;

  return parseTikTokExport(csvText);
}

/**
 * Parse price string to number
 * Handles both formats: 1.234,56 (EU) and 1,234.56 (US)
 */
function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  // Remove currency symbols and spaces
  const cleaned = priceStr.replace(/[^\d.,]/g, '');
  
  // Detect format: if last dot/comma is followed by exactly 2 digits, it's decimal separator
  // Otherwise, it's thousands separator
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  
  // No separators
  if (lastDot === -1 && lastComma === -1) {
    return parseFloat(cleaned) || 0;
  }
  
  // Only one type of separator
  if (lastDot === -1) {
    // Only commas - check if last is decimal
    const afterLastComma = cleaned.substring(lastComma + 1);
    if (afterLastComma.length === 2) {
      // Comma is decimal: 1234,56
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
    // Comma is thousands: 1,234
    return parseFloat(cleaned.replace(/,/g, '')) || 0;
  }
  
  if (lastComma === -1) {
    // Only dots - check if last is decimal
    const afterLastDot = cleaned.substring(lastDot + 1);
    if (afterLastDot.length === 2) {
      // Dot is decimal: 1234.56
      return parseFloat(cleaned.replace(/,/g, '')) || 0;
    }
    // Dot is thousands: 1.234
    return parseFloat(cleaned.replace(/\./g, '')) || 0;
  }
  
  // Both separators present: use position to determine which is decimal
  if (lastDot > lastComma) {
    // Format: 1.234,56 or 1,234.56 - last one is decimal
    const afterLastDot = cleaned.substring(lastDot + 1);
    if (afterLastDot.length <= 3 && lastDot > lastComma) {
      // 1,234.56 (US format)
      return parseFloat(cleaned.replace(/,/g, '')) || 0;
    }
    // 1.234,56 (EU format)
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  } else {
    // Last comma after last dot
    const afterLastComma = cleaned.substring(lastComma + 1);
    if (afterLastComma.length <= 2) {
      // 1.234,56 (EU format)
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
    // 1,234.56 (US format)
    return parseFloat(cleaned.replace(/,/g, '')) || 0;
  }
}

/**
 * Validate CSV has required columns
 */
export function validateShopeeCSV(csvText: string): { valid: boolean; error?: string } {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    return { valid: false, error: 'File CSV kosong atau tidak memiliki data' };
  }

  const headers = lines[0].toLowerCase();
  const requiredColumns = ['no. resi', 'nama produk', 'jumlah'];
  
  for (const col of requiredColumns) {
    if (!headers.includes(col)) {
      return { valid: false, error: `Kolom "${col}" tidak ditemukan dalam file CSV` };
    }
  }

  return { valid: true };
}

/**
 * Validate TikTok CSV has required columns
 */
export function validateTikTokCSV(csvText: string): { valid: boolean; error?: string } {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    return { valid: false, error: 'File CSV kosong atau tidak memiliki data' };
  }

  const headers = lines[0].toLowerCase();
  const requiredColumns = ['tracking id', 'product name', 'quantity'];
  
  for (const col of requiredColumns) {
    if (!headers.includes(col)) {
      return { valid: false, error: `Kolom "${col}" tidak ditemukan dalam file CSV` };
    }
  }

  return { valid: true };
}
