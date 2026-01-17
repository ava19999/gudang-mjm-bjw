// FILE: utils/csvParser.ts
import Papa from 'papaparse';
import { CSVRowShopee, CSVRowTikTok } from '../types';

export interface ParsedCSVRow {
  no_pesanan: string;
  no_resi: string;
  customer: string;
  sku: string;
  product_name: string;
  qty: number;
  harga_satuan: number;
  harga_total: number;
}

export type CSVSource = 'SHOPEE' | 'TIKTOK';

/**
 * Parse Shopee CSV format
 */
function parseShopeeRow(row: CSVRowShopee): ParsedCSVRow | null {
  const no_pesanan = row['No. Pesanan'] || '';
  const no_resi = row['No. Resi'] || '';
  const customer = row['Nama Penerima'] || '';
  const sku = row['SKU Induk'] || '';
  const product_name = row['Nama Produk'] || '';
  const qty_str = row['Jumlah'] || '0';
  const harga_awal_str = row['Harga Awal (Rp)'] || '0';
  const harga_total_str = row['Total Harga (Rp)'] || '0';

  // Skip rows without resi
  if (!no_resi.trim()) {
    return null;
  }

  const qty = parseInt(qty_str) || 0;
  const harga_satuan = parseFloat(harga_awal_str.replace(/[^0-9.-]/g, '')) || 0;
  const harga_total = parseFloat(harga_total_str.replace(/[^0-9.-]/g, '')) || 0;

  return {
    no_pesanan,
    no_resi,
    customer,
    sku,
    product_name,
    qty,
    harga_satuan,
    harga_total,
  };
}

/**
 * Parse TikTok CSV format
 */
function parseTikTokRow(row: CSVRowTikTok): ParsedCSVRow | null {
  const no_pesanan = row['Order ID'] || '';
  const no_resi = row['Tracking ID'] || '';
  const customer = row['Recipient'] || '';
  const sku = row['Seller SKU'] || '';
  const product_name = row['Product Name'] || '';
  const qty_str = row['Quantity'] || '0';
  const harga_awal_str = row['Original Price'] || '0';
  const harga_total_str = row['Total Amount'] || '0';

  // Skip rows without resi
  if (!no_resi.trim()) {
    return null;
  }

  const qty = parseInt(qty_str) || 0;
  const harga_satuan = parseFloat(harga_awal_str.replace(/[^0-9.-]/g, '')) || 0;
  const harga_total = parseFloat(harga_total_str.replace(/[^0-9.-]/g, '')) || 0;

  return {
    no_pesanan,
    no_resi,
    customer,
    sku,
    product_name,
    qty,
    harga_satuan,
    harga_total,
  };
}

/**
 * Auto-detect CSV format and parse
 */
export async function parseCSV(file: File): Promise<{
  source: CSVSource | null;
  data: ParsedCSVRow[];
  errors: string[];
}> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[];
        const errors: string[] = [];

        if (rows.length === 0) {
          resolve({ source: null, data: [], errors: ['File CSV kosong'] });
          return;
        }

        // Auto-detect format based on column headers
        const firstRow = rows[0];
        const headers = Object.keys(firstRow);

        let source: CSVSource | null = null;
        let parsedData: ParsedCSVRow[] = [];

        // Check if it's Shopee format
        if (headers.includes('No. Pesanan') || headers.includes('No. Resi')) {
          source = 'SHOPEE';
          parsedData = rows
            .map((row, index) => {
              try {
                return parseShopeeRow(row as CSVRowShopee);
              } catch (error) {
                errors.push(`Error parsing row ${index + 2}: ${error}`);
                return null;
              }
            })
            .filter((row): row is ParsedCSVRow => row !== null);
        }
        // Check if it's TikTok format
        else if (headers.includes('Order ID') || headers.includes('Tracking ID')) {
          source = 'TIKTOK';
          parsedData = rows
            .map((row, index) => {
              try {
                return parseTikTokRow(row as CSVRowTikTok);
              } catch (error) {
                errors.push(`Error parsing row ${index + 2}: ${error}`);
                return null;
              }
            })
            .filter((row): row is ParsedCSVRow => row !== null);
        } else {
          errors.push('Format CSV tidak dikenali. Pastikan menggunakan export dari Shopee atau TikTok.');
        }

        resolve({ source, data: parsedData, errors });
      },
      error: (error) => {
        resolve({
          source: null,
          data: [],
          errors: [`Error membaca file: ${error.message}`],
        });
      },
    });
  });
}

/**
 * Group parsed rows by resi (for multiple items per order)
 */
export function groupByResi(rows: ParsedCSVRow[]): Map<string, ParsedCSVRow[]> {
  const grouped = new Map<string, ParsedCSVRow[]>();
  
  rows.forEach((row) => {
    const existing = grouped.get(row.no_resi) || [];
    existing.push(row);
    grouped.set(row.no_resi, existing);
  });

  return grouped;
}
