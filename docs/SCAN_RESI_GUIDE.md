# Scan Resi System - User Guide

## Overview
The Scan Resi system is a comprehensive order management workflow that supports multiple e-commerce platforms (TikTok, Shopee, Kilat, Reseller, and Export) with a three-person workflow for warehouse operations.

## Three-Person Workflow

### Person 1: Warehouse Scanner (Orang Gudang)
**Role:** Scan resi and input order details

**Access:** Menu → Online → Scan Resi

**Features:**
- Select e-commerce platform (TIKTOK/SHOPEE/KILAT/RESELLER/EKSPOR)
- Select sub-store (LARIS/MJM/BJW) based on platform
- For EKSPOR: select destination country (PH/MY/SG/HK)
- Manual resi input or camera scanning
- CSV import from Shopee/TikTok exports
- Duplicate resi detection
- Excel-like table for item input
- Auto-fill product details from part_number
- Split item feature (+ button) for dividing prices
- Delete resi capability
- Multi-item per resi support

**Workflow:**
1. Select platform and sub-store
2. Scan or type resi number
3. Enter customer name
4. Add items:
   - Enter part_number (auto-fills name, brand, application)
   - Enter quantity
   - Enter price
   - Click "+" to split item if needed
   - Click "Tambah Item" for more items per resi
5. Click "Simpan Scan Resi"

**CSV Import:**
- Click "Import CSV"
- Select CSV file with columns: resi, customer, sku, product name, qty, price
- System auto-processes and imports all valid entries
- Duplicate part_numbers within same resi are filtered out

### Person 2: Packing Confirmation
**Role:** Confirm packing without seeing customer details

**Access:** Menu → Online → Konfirmasi Packing

**Features:**
- Simple resi scanner
- No customer information displayed
- Mark as "packed" status
- Statistics: Menunggu Packing vs Sudah Packed

**Workflow:**
1. Scan resi number
2. Click "Konfirmasi"
3. Resi status changes from "scanned" → "packed"

### Person 3: Order Approval & Management
**Role:** Final approval and stock management

**Access:** Menu → Pesanan → SCAN RESI tab

**Features:**
- View all scanned and packed orders
- Edit order details (quantity, price, customer name)
- Filter by status (scanned/packed/completed)
- Search by resi, customer, or part number
- Approve orders (reduces stock and moves to barang_keluar)
- Delete orders if needed
- Full edit capability before approval

**Workflow:**
1. Review scanned/packed orders
2. Edit details if needed (click Edit icon)
3. Click "Approve & Kurangi Stok" for a resi
4. System:
   - Checks stock availability
   - Reduces stock quantity
   - Creates entry in barang_keluar_mjm/bjw
   - Updates status to "completed"

## E-commerce Platform Support

### TIKTOK
- Sub-stores: LARIS, MJM, BJW
- CSV import supported
- Auto-mapping from SKU

### SHOPEE
- Sub-stores: LARIS, MJM, BJW
- CSV import supported
- Auto-mapping from SKU

### KILAT
- Sub-stores: MJM, BJW, LARIS
- Fast processing support

### RESELLER
- Direct to barang_keluar
- No sub-store selection (uses current store)
- Manual input only

### EKSPOR
- Country selection: PH/MY/SG/HK
- Store mapping based on country
- International order tracking

## Data Flow

### Scan Flow
```
Person 1: Scan Resi
   ↓
scan_resi_mjm/bjw (status: 'scanned')
   ↓
Person 2: Pack Confirm
   ↓
scan_resi_mjm/bjw (status: 'packed')
   ↓
Person 3: Approve
   ↓
barang_keluar_mjm/bjw + Stock Update
```

### Stock Updates
- Stock is **NOT** updated until Person 3 approves
- This prevents premature stock reduction
- Person 1 and 2 can scan/pack without affecting inventory
- Only Person 3 has the power to commit stock changes

## Features

### Duplicate Detection
- System checks for existing resi numbers
- Alerts user if resi already scanned
- Duplicate items (same part_number) in same resi are filtered

### Split Item Feature
- Click "+" button next to an item
- Splits the price equally (default: 2 parts)
- Useful for set items (left/right pairs)
- Each split creates a new row

### Product Alias Support
- Uses product_alias table for part number mapping
- Example: 91214-pna maps to 91214-rb0
- Automatic lookup during part_number entry

### Auto-fill from Database
- Enter part_number
- System fetches from base_mjm/base_bjw:
  - name (Nama Barang)
  - brand
  - application
  - qty_n (reference quantity)
- User still needs to enter:
  - quantity (qty sold)
  - harga_satuan
  - harga_total (auto-calculated)

## Column Order (Excel-like Table)
1. Tanggal (always first, auto-filled)
2. Resi
3. Customer
4. Part_number
5. Nama_barang (auto-fill)
6. Brand (auto-fill)
7. Application (auto-fill)
8. Quantity
9. Harga_satuan
10. Harga_total (calculated)

## Database Schema

### scan_resi_mjm / scan_resi_bjw
```sql
- id (primary key)
- tanggal (date)
- resi (string)
- toko (string: MJM/BJW/LARIS)
- ecommerce (string: TIKTOK/SHOPEE/KILAT/RESELLER/EKSPOR)
- customer (string)
- part_number (string)
- nama_barang (string)
- brand (string)
- application (string)
- quantity (integer)
- harga_satuan (decimal)
- harga_total (decimal)
- status (string: scanned/packed/completed)
- negara (string: PH/MY/SG/HK, optional)
```

### barang_keluar_mjm / barang_keluar_bjw
```sql
- id (primary key)
- tanggal (date)
- kode_toko (string)
- tempo (string)
- ecommerce (string)
- customer (string)
- part_number (string)
- name (string)
- brand (string)
- application (string)
- rak (string)
- stock_ahir (integer)
- qty_keluar (integer)
- harga_satuan (decimal)
- harga_total (decimal)
- resi (string)
- created_at (timestamp)
```

### product_alias
```sql
- id (primary key)
- part_number_alias (string)
- part_number_actual (string)
- created_at (timestamp)
```

## Tips & Best Practices

1. **Always select the correct platform and sub-store** before scanning
2. **Use CSV import** for bulk orders from e-commerce exports
3. **Check duplicate warnings** before proceeding
4. **Use split feature** for paired items (left/right sets)
5. **Verify stock availability** before Person 3 approves
6. **Edit orders** in Person 3 view if corrections needed
7. **Don't delete orders** unless absolutely necessary
8. **Use search** to quickly find specific resi or customer

## Troubleshooting

### Resi already scanned
- Check if it's a duplicate
- Verify the existing entry
- Delete old entry if it's an error

### Part number not found
- Check spelling
- Use product alias if available
- Manual entry is still possible

### Stock not enough
- Person 3 will see error on approval
- Check base_mjm/base_bjw for stock
- Contact warehouse to verify

### CSV import fails
- Check CSV format (resi, customer, sku columns required)
- Ensure UTF-8 encoding
- Remove empty rows

## Security & Permissions

- **Person 1 (Warehouse):** Can scan, input, delete resi
- **Person 2 (Packing):** Can only confirm packing, no customer view
- **Person 3 (Manager):** Full access, can edit and approve all orders

All three roles require admin login to access their respective menus.
