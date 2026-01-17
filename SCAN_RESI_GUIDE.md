# Receipt Scanning & Order Input System

## Overview
This document describes the enhanced receipt scanning and order input system that supports multiple e-commerce platforms, split items, duplicate handling, and role-based workflows.

## Features

### 1. Multi-Platform Support

The system now supports the following e-commerce platforms and marketplaces:

#### TIKTOK (with sub-stores)
- Sub-stores: LARIS, MJM, BJW
- Full CSV import support
- Part number auto-fill from SKU

#### SHOPEE (with sub-stores)
- Sub-stores: LARIS, MJM, BJW
- Full CSV import support
- Part number auto-fill from SKU

#### KILAT (with sub-stores)
- Sub-stores: MJM, BJW, LARIS
- Fast processing for urgent orders

#### TOKOPEDIA (with sub-stores)
- Sub-stores: LARIS, MJM, BJW
- Standard e-commerce flow

#### LAZADA (with sub-stores)
- Sub-stores: LARIS, MJM, BJW
- Standard e-commerce flow

#### RESELLER
- Direct to barang_keluar
- No intermediate scanning required
- Manual input for orders without SKU

#### EKSPOR (Export)
- Country selection: PH (Philippines), MY (Malaysia), SG (Singapore), HK (Hong Kong)
- Store mapping based on country
- International shipping tracking

#### OFFLINE
- In-store purchases
- Manual order entry

### 2. Receipt Scanning Workflow

#### Person 1: Warehouse Scanner
- **Role**: Scan receipts and prepare orders
- **Capabilities**:
  - Scan resi with barcode scanner or HP camera
  - Select store/e-commerce platform
  - Choose sub-store or country (for EKSPOR)
  - Manual input for RESELLER orders
  - Delete scanned receipts
  - View all order details
- **Flow**:
  1. Select target store (MJM, LARIS, BJW)
  2. Select e-commerce platform
  3. Select sub-store (if applicable) or country (for EKSPOR)
  4. Scan receipt barcode
  5. System automatically fills data from CSV import (if available)
  6. Edit part_number, quantity, customer name as needed
  7. Status updates to "Siap Kirim" when all fields are complete

#### Person 2: Packing Confirmation
- **Role**: Confirm items are packed and ready to ship
- **Capabilities**:
  - Scan-only interface
  - No customer information displayed (privacy)
  - Confirm packing status
- **Flow**:
  1. Scan receipt to confirm packing
  2. System marks as "Siap Kirim" if not already
  3. Move to next item

#### Person 3: Admin/Manager
- **Role**: Final approval and processing
- **Capabilities**:
  - View all orders across all statuses
  - Full edit capabilities for all fields
  - Process shipments (updates stock)
  - Handle returns (retur)
  - View "sudah terjual" history
- **Flow**:
  1. Review orders marked as "Siap Kirim"
  2. Process shipments (click "Proses Kirim")
  3. System updates stock in base_mjm/base_bjw
  4. System inserts transaction to barang_keluar_mjm/barang_keluar_bjw
  5. Order status changes to "Terjual"

### 3. Split Item Support

For orders containing multiple items that need separate tracking (e.g., left and right parts):

- Click the "+" button next to an item to create a split
- Price is automatically divided equally among all splits
- Each split gets a unique split_item number (1, 2, 3, etc.)
- Visual indicator shows "SPLIT 1", "SPLIT 2", etc.
- All splits reference the same parent_resi

**Example**: An order with total price Rp 300,000
- Original item: Rp 300,000 (split_item = 0)
- Click "+" to split
- Original item updated: Rp 150,000 (split_item = 0)
- New split item: Rp 150,000 (split_item = 1)
- Click "+" again on any item
- All 3 items updated: Rp 100,000 each (split_item = 0, 1, 2)

### 4. Duplicate Handling

The system handles duplicate receipts intelligently:

- **Same resi + same customer**: Creates a dropdown list
- **Same resi + different item**: Allowed (multi-item orders)
- **Same resi + same part_number**: Second occurrence is ignored during CSV import
- **Manual scan of existing resi**: Updates timestamp and re-validates data completeness

### 5. CSV Import

#### Shopee Export Format
Required columns:
- No. Resi / No. Pesanan
- Username (Pembeli)
- Nama Produk
- SKU Induk (mapped to part_number)
- Jumlah (quantity)
- Harga / Harga Satuan
- Total Harga Produk

#### TikTok Export Format
Required columns:
- No. Resi
- Nama Penerima
- Nama Produk
- No. Referensi (SKU, mapped to part_number)
- Kuantitas
- Harga Satuan
- Total Harga Produk

### 6. Product Alias System

The system supports part number aliases for handling variations:

Example:
- Main part number: `91214-RB0`
- Aliases: `91214-PNA`, `91214-RNA`

When a CSV contains `91214-PNA`, the system automatically resolves it to `91214-RB0`.

**To add aliases**:
```sql
INSERT INTO product_alias (part_number, alias) VALUES 
    ('91214-RB0', '91214-PNA'),
    ('91214-RB0', '91214-RNA');
```

### 7. Order Status Flow

1. **Order Masuk** (Order Received)
   - Initial status when imported from CSV
   - Not yet physically scanned

2. **Pending** (Data Incomplete)
   - Receipt has been physically scanned
   - Missing required fields (part_number, customer, quantity)
   - Requires manual input

3. **Siap Kirim** (Ready to Ship)
   - All required fields are complete
   - Receipt has been physically scanned
   - Ready for Person 2 confirmation
   - Can be selected for processing

4. **Terjual** (Sold)
   - Final status after Person 3 processes the shipment
   - Stock has been deducted
   - Transaction logged in barang_keluar

### 8. Data Flow

```
CSV Import → scan_resi_mjm/bjw (Order Masuk)
    ↓
Physical Scan → Update timestamp (Pending or Siap Kirim)
    ↓
Person 2 Confirm → Mark as ready
    ↓
Person 3 Process → Deduct from base_mjm/bjw
    ↓
Log to barang_keluar_mjm/bjw (Terjual)
```

### 9. Input Field Order

The interface displays fields in this order:
1. **Tanggal** (always first) - Auto-filled
2. **Resi** - Scanned or imported
3. **Customer** - From CSV or manual input
4. **Part_number** - Auto-filled from SKU or manual
5. **Nama_barang** - Auto-filled or manual
6. **Qty_keluar** - Manual input
7. **Harga_total** - From CSV or manual
8. **Harga_satuan** - Auto-calculated (Harga_total / QTY)

### 10. Database Tables

#### scan_resi_mjm / scan_resi_bjw
Stores scanned receipts before final processing
- `resi`: Receipt number
- `toko`: Store (MJM, LARIS, BJW)
- `ecommerce`: Platform (SHOPEE, TIKTOK, etc.)
- `sub_toko`: Sub-store for multi-store platforms
- `negara`: Country for EKSPOR
- `customer`: Customer name
- `part_number`: Product part number
- `nama_barang`: Product name
- `quantity`: Quantity ordered
- `harga_satuan`: Unit price
- `harga_total`: Total price
- `status`: Order status
- `split_item`: Split item number (0 for single item)
- `parent_resi`: Parent receipt for split items

#### barang_keluar_mjm / barang_keluar_bjw
Stores finalized transactions (sold items)
- All fields from scan_resi plus:
- `stock_ahir`: Stock after transaction
- `qty_keluar`: Quantity sold
- `kode_toko`: Store code
- `tempo`: Payment terms or sub-store
- `rak`: Shelf location

#### product_alias
Maps alternative part numbers to canonical ones
- `part_number`: Main part number
- `alias`: Alternative part number

## Migration

To set up the database for these features, run:

```sql
-- Run migrations/003_add_scan_resi_enhancements.sql
```

This will:
1. Add new columns to scan_resi tables
2. Create the product_alias table
3. Add necessary indexes
4. Set up comments for documentation

## Best Practices

1. **Import CSV First**: Always import e-commerce exports before physical scanning
2. **Scan Regularly**: Keep scanning receipts as they arrive to maintain accurate status
3. **Review Pending Items**: Check items with "Pending" status and complete missing information
4. **Process Daily**: Person 3 should process "Siap Kirim" items daily to update stock
5. **Use Split Feature**: For items sold as sets (left/right, pairs), use the split feature
6. **Handle Aliases**: Add common SKU variations to product_alias table

## Troubleshooting

### Receipt not found after scanning
- Check if CSV has been imported
- Verify receipt number is correct
- Ensure correct store is selected

### Part number not auto-filling
- Check if SKU exists in base_mjm/base_bjw
- Add alias to product_alias table if needed
- Manually enter part number

### Cannot select item for processing
- Verify status is "Siap Kirim"
- Check all required fields are filled
- Re-scan receipt to update status

### Stock not updating
- Ensure Person 3 processes the shipment
- Check stock availability before processing
- Verify part_number matches inventory

## API Functions

### Core Functions

```typescript
// Fetch all scan resi logs
fetchScanResiLogs(store: string | null): Promise<ScanResiLog[]>

// Add new scan resi log
addScanResiLog(
  resi: string, 
  ecommerce: string, 
  toko: string, 
  store: string | null,
  additionalData?: Partial<ScanResiLog>
): Promise<boolean>

// Update single field
updateScanResiLogField(
  id: number, 
  field: string, 
  value: any, 
  store: string | null
): Promise<boolean>

// Delete scan resi log
deleteScanResiLog(id: number, store: string | null): Promise<boolean>

// Duplicate for split items
duplicateScanResiLog(
  id: number, 
  store: string | null,
  splitData?: { split_item?: number; harga_total?: number; harga_satuan?: number }
): Promise<boolean>

// Process shipment (update stock and log to barang_keluar)
processShipmentToOrders(
  logs: ScanResiLog[], 
  store: string | null
): Promise<{ success: boolean; message?: string }>

// Import from CSV/Excel
importScanResiFromExcel(
  records: any[], 
  store: string | null
): Promise<{ success: boolean; skippedCount: number }>

// Resolve part number alias
resolvePartNumberAlias(partNumber: string): Promise<string>
```

## Future Enhancements

- [ ] Batch CSV import with progress indicator
- [ ] Automatic SKU recognition from product names
- [ ] Integration with shipping APIs
- [ ] Mobile app for Person 2 (packing confirmation)
- [ ] WhatsApp notifications for order updates
- [ ] Analytics dashboard for sales by platform
- [ ] Automated return (retur) workflow
- [ ] Multi-language support
