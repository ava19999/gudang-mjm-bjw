# Scan Resi Online System - Implementation Guide

## Overview

A comprehensive online order tracking and reconciliation system for managing marketplace sales (Shopee, TikTok, KILAT, Reseller, and Export orders).

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Database Schema](#database-schema)
3. [Components](#components)
4. [Workflows](#workflows)
5. [Features](#features)
6. [Setup Instructions](#setup-instructions)
7. [Usage Guide](#usage-guide)
8. [API Reference](#api-reference)

---

## System Architecture

### Menu Structure

```
Online (Menu)
├── Scan Resi      → Morning/Afternoon scanning (TIKTOK, SHOPEE, EKSPOR)
├── KILAT          → Instant stock reduction for Shopee Express
├── Reseller       → Manual input for reseller orders
├── Import Export  → Evening reconciliation with CSV files
├── Koreksi Scan   → Delete wrong scans (SCANNED status only)
└── Data Agung     → Legacy 4-table tracking system
```

### Data Flow

```
MORNING-AFTERNOON: SCAN PACKING
┌─────────────┐
│ Scan Resi   │ → Scan tracking number + part number
│             │ → Auto-fill: barang, brand, application, stock
│             │ → Save with status: SCANNED
└─────────────┘
       ↓
┌─────────────┐
│ scan_resi   │ → type_toko: TIKTOK, SHOPEE, EKSPOR, RESELLER, KILAT
│ _mjm/_bjw   │ → status_packing: SCANNED
└─────────────┘

EVENING: IMPORT & RECONCILIATION
┌─────────────┐
│ CSV Import  │ → Upload Shopee/TikTok export file
│             │ → Auto-detect format
│             │ → Parse customer, qty, price data
└─────────────┘
       ↓
┌─────────────┐
│ Match Resi  │ → Find SCANNED entries by resi number
│             │ → Update: customer, qty, price
│             │ → Change status: SCANNED → MATCHED
│             │ → Save product alias for search
└─────────────┘
       ↓
┌─────────────┐
│ Process     │ → Reduce stock in base_mjm/base_bjw
│             │ → Log to barang_keluar_mjm/_bjw
└─────────────┘
```

---

## Database Schema

### 1. scan_resi_mjm / scan_resi_bjw

Extended table for online order tracking:

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| tanggal | DATE | Scan date |
| type_toko | TEXT | TIKTOK, SHOPEE, KILAT, RESELLER, EKSPOR |
| toko | TEXT | Sub-category: LARIS, MJM, BJW (or country for EKSPOR) |
| resi | TEXT | Tracking number |
| customer | TEXT | Customer name (filled after import) |
| part_number | TEXT | Product part number |
| barang | TEXT | Product name |
| brand | TEXT | Brand |
| application | TEXT | Application |
| stok_saatini | NUMERIC | Stock at scan time |
| qty_out | NUMERIC | Quantity ordered (filled after import) |
| harga_satuan | NUMERIC | Unit price (filled after import) |
| total_harga | NUMERIC | Total price (filled after import) |
| no_pesanan | TEXT | Order number |
| **negara_ekspor** | TEXT | Export country (PH, MY, SG, HK) |
| **status_packing** | TEXT | SCANNED or MATCHED |
| **is_split** | BOOLEAN | Part of item set? |
| **split_group_id** | TEXT | Group ID for split items |
| **split_count** | INTEGER | Number of items in set |
| **original_product_name** | TEXT | Original product name before split |
| **original_price** | NUMERIC | Original price before split |

**Constraints:**
- UNIQUE(resi, part_number) - Prevents duplicate scans

**Indexes:**
- idx_scan_resi_*_status (status_packing)
- idx_scan_resi_*_type (type_toko)
- idx_scan_resi_*_resi (resi)
- idx_scan_resi_*_split (split_group_id)

### 2. product_alias

New table for enhanced search functionality:

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| part_number | TEXT | Reference to base_mjm/base_bjw |
| alias_name | TEXT | Alternative product name from marketplace |
| source | TEXT | SHOPEE, TIKTOK, MANUAL, etc. |
| created_at | TIMESTAMP | Creation timestamp |

**Constraints:**
- UNIQUE(part_number, alias_name) - Prevents duplicate aliases

**Indexes:**
- idx_product_alias_part (part_number)
- idx_product_alias_name (alias_name)
- idx_product_alias_source (source)

---

## Components

### 1. ScanResiView.tsx
**Purpose:** Main scanning interface for TIKTOK, SHOPEE, EKSPOR

**Features:**
- Type & sub-category selection
- Barcode scanning support
- Real-time duplicate detection (Layer 1)
- Auto-fill from base inventory
- Audio feedback (beep on duplicate/success)
- Recent scans display

**Usage:**
```tsx
<ScanResiView showToast={showToast} />
```

### 2. KilatView.tsx
**Purpose:** Special handling for KILAT orders (Shopee Express)

**Features:**
- Instant stock reduction on scan
- Auto-generated customer name: "KILAT [TOKO]"
- Fixed qty = 1
- Two tabs: BELUM TERJUAL | SUDAH TERJUAL
- Update status when matched with export

**Usage:**
```tsx
<KilatView showToast={showToast} />
```

### 3. ResellerView.tsx
**Purpose:** Manual input for reseller orders

**Features:**
- All fields manually entered
- Date picker
- Quantity input (not fixed)
- Manual price entry
- Duplicate prevention
- Recent entries display

**Usage:**
```tsx
<ResellerView showToast={showToast} />
```

### 4. ImportExportView.tsx
**Purpose:** Evening reconciliation with marketplace exports

**Features:**
- CSV file upload
- Auto-detect format (Shopee/TikTok)
- Preview first 5 rows
- Batch matching by resi
- Progress bar
- Result summary (matched/skipped/not found)
- Auto-save product aliases
- Stock reduction
- Logging to barang_keluar

**Usage:**
```tsx
<ImportExportView showToast={showToast} />
```

### 5. ScanCorrectionView.tsx
**Purpose:** Delete wrong scans

**Features:**
- Only SCANNED entries (not MATCHED)
- Filters by type, toko, date range
- Bulk selection
- Confirmation dialog
- Warning notices

**Usage:**
```tsx
<ScanCorrectionView showToast={showToast} />
```

---

## Workflows

### Workflow 1: Standard Scan (TIKTOK/SHOPEE)

**Morning:**
1. Open Scan Resi menu
2. Select type_toko: TIKTOK or SHOPEE
3. Select sub: LARIS, MJM, or BJW
4. Scan tracking number (from shipping label)
5. Scan part number (from barcode)
6. System auto-fills: barang, brand, application, stock
7. Save with status: SCANNED

**Evening:**
1. Open Import Export menu
2. Upload CSV export from marketplace
3. System auto-detects format
4. Click "Match & Process"
5. System matches by resi number
6. Updates: customer, qty, price
7. Changes status: SCANNED → MATCHED
8. Saves product alias
9. Reduces stock
10. Logs to barang_keluar

### Workflow 2: KILAT Orders

**Immediate:**
1. Open KILAT menu
2. Select toko: MJM, BJW, or LARIS
3. Scan tracking number
4. Scan part number
5. System checks stock availability
6. **Stock is IMMEDIATELY reduced by 1**
7. Customer auto-set to: "KILAT [TOKO]"
8. Status: SCANNED (BELUM TERJUAL tab)

**After Sale:**
1. Upload export CSV
2. System matches resi
3. Updates price from CSV
4. Changes status: MATCHED (SUDAH TERJUAL tab)

### Workflow 3: Reseller Manual Entry

1. Open Reseller menu
2. Select tanggal (default today)
3. Select toko
4. Enter resi manually
5. Enter customer name
6. Enter part number (auto-fill triggers)
7. Enter quantity
8. Enter harga satuan
9. Total auto-calculated
10. Save with status: SCANNED

### Workflow 4: Export Orders

**Morning:**
1. Open Scan Resi menu
2. Select type_toko: EKSPOR
3. Select negara: PH, MY, SG, or HK
4. Scan resi and part number
5. System marks with negara_ekspor field

**Evening:**
1. Import export CSV (if available)
2. Match and process as normal

### Workflow 5: Item Set (Split)

For products sold as sets (e.g., Engine Mounting HRV Set = 4 different parts):

1. Scan the set as normal (single entry)
2. Use split functionality (available in code)
3. Enter number of items in set
4. Price automatically divided equally
5. Select part_number for each item
6. System creates linked entries with split_group_id
7. All entries tracked together

---

## Features

### 3-Layer Duplicate Prevention

**Layer 1: Real-time Client Check**
- Immediate check when resi + part_number entered
- Visual alert (red border, pulse animation)
- Audio alert (beep)
- Submit button disabled

**Layer 2: Service Layer Check**
- `checkResiExists()` before insert
- Returns error if duplicate found
- Prevents API call if duplicate

**Layer 3: Database Constraint**
- `UNIQUE(resi, part_number)` constraint
- Final safety net at DB level
- Prevents concurrent duplicates

### Product Alias Search

**Auto-Save:**
- When CSV imported, product names saved as aliases
- Maps marketplace name → part_number
- Source tracked (SHOPEE, TIKTOK, etc.)

**Enhanced Search:**
- Search in Beranda (Shop) now includes:
  - Part Number
  - Product Name (from base)
  - Brand
  - Application
  - **Product Alias (from marketplace)** ← NEW!

**Example:**
- Part Number: "12345-ABC"
- Base Name: "Filter Oli"
- Shopee Alias: "Filter Oli Honda CRV 2015-2020"
- TikTok Alias: "Spare Part Filter Oli CRV Gen 4"
- All searchable!

### CSV Format Support

**Shopee Export Columns:**
- No. Pesanan
- No. Resi
- Nama Produk
- Nomor Referensi SKU
- Nama Variasi
- Jumlah
- Harga Setelah Diskon
- Total Harga Produk
- Username (Pembeli)
- Nama Penerima

**TikTok Export Columns:**
- Order ID
- Tracking ID
- Product Name
- Seller SKU
- Variation
- Quantity
- SKU Subtotal After Discount
- Buyer Username
- Recipient

**Auto-Detection:**
- System checks headers
- Identifies format automatically
- Parses accordingly

---

## Setup Instructions

### 1. Database Migration

Run the migration SQL:

```bash
psql -U your_username -d your_database -f migrations/003_scan_resi_online_system.sql
```

Or in Supabase SQL Editor, copy-paste the content of `003_scan_resi_online_system.sql`.

### 2. Verify Migration

```sql
-- Check new columns
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'scan_resi_mjm';

-- Check product_alias table
SELECT * FROM product_alias LIMIT 1;
```

### 3. Build and Deploy

```bash
npm install
npm run build
```

---

## Usage Guide

### For Staff (Morning/Afternoon):

1. **Log in as Admin**
2. **Navigate to Online → Scan Resi**
3. **Select marketplace type** (TikTok/Shopee/Ekspor)
4. **Select store** (LARIS/MJM/BJW)
5. **Scan resi** from shipping label
6. **Scan part number** from barcode
7. **Verify auto-filled data**
8. **Click Save**
9. **Repeat** for all packages

### For KILAT:

1. **Navigate to Online → KILAT**
2. **Select store**
3. **Scan resi and part number**
4. **Confirm stock reduction**
5. **Click Save** (stock immediately deducted)

### For Admin (Evening):

1. **Export orders from marketplace**
2. **Navigate to Online → Import Export**
3. **Upload CSV file**
4. **Review preview**
5. **Click "Match & Process"**
6. **Wait for completion**
7. **Review summary** (matched/skipped/errors)

### For Corrections:

1. **Navigate to Online → Koreksi Scan**
2. **Apply filters** (date, type, store)
3. **Select wrong entries**
4. **Click Delete**
5. **Confirm** (only SCANNED can be deleted)

---

## API Reference

### resiService.ts

```typescript
// Check duplicate
checkResiExists(resi: string, partNumber: string, store: string): Promise<boolean>

// Add scan entry
addScanResi(entry: ScanResiEntry, store: string): Promise<{success, error?, id?}>

// Fetch entries with filters
fetchScanResiEntries(store: string, filters?: {...}): Promise<ScanResiEntry[]>

// Update entry
updateScanResi(id: number, updates: Partial<ScanResiEntry>, store: string): Promise<boolean>

// Delete entry (SCANNED only)
deleteScanResi(id: number, store: string): Promise<{success, error?}>

// Match with export data
matchResiWithExport(resi: string, exportData: {...}, store: string): Promise<boolean>

// KILAT operations
addKilatEntry(entry: KilatEntry, store: string): Promise<{success, error?}>
fetchKilatEntries(store: string, isSold?: boolean): Promise<KilatEntry[]>

// Product alias
addProductAlias(alias: ProductAlias): Promise<boolean>
searchByAlias(searchTerm: string): Promise<string[]>
getAliasesForPart(partNumber: string): Promise<ProductAlias[]>

// Split items
createSplitGroup(originalEntry, splitItems[], store): Promise<{success, error?}>
getSplitGroupEntries(splitGroupId: string, store): Promise<ScanResiEntry[]>
```

### csvParser.ts

```typescript
// Parse any format
parseMarketplaceExport(csvText: string): ParsedOrderData[]

// Specific formats
parseShopeeExport(csvText: string): ParsedOrderData[]
parseTikTokExport(csvText: string): ParsedOrderData[]

// Validation
validateShopeeCSV(csvText: string): {valid: boolean, error?: string}
validateTikTokCSV(csvText: string): {valid: boolean, error?: string}
```

---

## Troubleshooting

### Issue: Duplicate error even when not duplicate
**Solution:** Clear browser cache, refresh, try again

### Issue: CSV import fails
**Solution:** Check CSV format, ensure headers match expected columns

### Issue: Stock not reducing for KILAT
**Solution:** Check part_number exists in base_mjm/base_bjw

### Issue: Search not finding marketplace names
**Solution:** 
1. Ensure product_alias table exists
2. Run import at least once to populate aliases
3. Check alias saved with: `SELECT * FROM product_alias WHERE part_number = 'YOUR_PART'`

### Issue: Can't delete MATCHED entry
**Solution:** This is by design. Only SCANNED entries can be deleted. MATCHED entries have already been processed.

---

## Best Practices

1. **Always scan in morning/afternoon** before shipping
2. **Run import every evening** to reconcile orders
3. **Double-check KILAT scans** (stock immediately reduced)
4. **Use filters in correction view** to find specific entries
5. **Export CSV from marketplace daily** for accurate data
6. **Backup database regularly** before bulk operations
7. **Train staff on proper scan workflow** to minimize errors

---

## Support

For issues or questions:
- Check this documentation first
- Review error messages in browser console
- Check database logs
- Contact system administrator

---

**Version:** 1.0.0  
**Last Updated:** 2026-01-17  
**Implemented By:** GitHub Copilot
