# Scan Resi & Packing Mobile Interface

## Overview
The Scan Resi feature provides a comprehensive mobile-optimized interface for managing e-commerce order packing and shipment tracking. It supports multiple platforms (Shopee, TikTok, Reseller, Export) with full CRUD operations and export capabilities.

## Features

### 1. **Resi Scanning & Input**
- **Barcode Scanner**: Integrated camera scanning for quick resi entry (placeholder ready for full implementation)
- **Manual Input**: Form-based data entry with validation
- **Duplicate Prevention**: Automatic check to prevent duplicate resi entries
- **Required Fields**: Resi number, customer, product details, pricing

### 2. **Mobile-Friendly Design**
- Responsive layout optimized for mobile devices
- Touch-friendly buttons and controls
- Swipe-friendly scrolling
- Auto-hiding navigation on scroll

### 3. **Data Management**
- **Excel-like Table View**: Interactive table with inline editing
- **Locked Resi Column**: Resi numbers cannot be edited (immutable)
- **Editable Fields**: Customer, product name, part number, quantity, prices
- **Real-time Calculations**: Automatic total price calculation on quantity/price changes

### 4. **Status Management**
- Three packing statuses: `unpacked`, `packed`, `shipped`
- Visual status indicators with color coding:
  - 🔴 Red: Unpacked
  - 🔵 Blue: Packed
  - 🟢 Green: Shipped
- Quick status update buttons
- Status filtering

### 5. **Category Filters**
- Filter by order type:
  - Shopee (Orange badge)
  - TikTok (Pink badge)
  - Reseller (Purple badge)
  - Export (Cyan badge)
  - Online (Gray badge)

### 6. **Search & Filters**
- **Text Search**: Search by resi, customer name, product name, or part number
- **Status Filter**: Filter by packing status
- **Category Filter**: Filter by order type
- **Date Range**: Filter by start and end date
- **Results Counter**: Shows filtered results count

### 7. **Product Variations**
- Add product variations with "+" button
- Automatic price splitting (50/50 for variations)
- Link variations to parent resi
- Mark variations with "VAR" badge

### 8. **Export Functionality**
#### Shopee Format:
- Order ID
- Customer Name
- Product Name
- Quantity
- Price
- Total
- Status
- Date

#### TikTok Format:
- Tracking Number
- Buyer Name
- Item Name
- Qty
- Unit Price
- Order Amount
- Packing Status
- Order Date

Both exports generate CSV files with platform-specific column names.

### 9. **Dashboard Metrics**
Six KPI cards displaying:
1. **Total Resi**: Total number of entries
2. **Unpacked**: Orders awaiting packing
3. **Packed**: Orders packed and ready
4. **Shipped**: Orders shipped
5. **Today's Orders**: Orders received today
6. **Total Revenue**: Total revenue in millions (Rp)

### 10. **CRUD Operations**
- **Create**: Add new resi via scanner or manual input
- **Read**: View all resi data with filters
- **Update**: Inline editing of all non-resi fields
- **Delete**: Remove resi entries with confirmation

## Usage

### Accessing Scan Resi
1. Login as Admin
2. Click "Online" menu (Globe icon)
3. Select "Scan Resi" from dropdown

### Adding a Resi

#### Option 1: Scanner (Coming Soon)
1. Click "Scan Barcode" button
2. Allow camera permissions
3. Scan barcode/QR code
4. Complete product details in form
5. Click "Simpan Resi"

#### Option 2: Manual Input
1. Click "Input Manual" button
2. Fill in required fields:
   - Resi Number (required)
   - Customer Name
   - Product Name
   - Part Number
   - Quantity
   - Unit Price
   - Category (Shopee, TikTok, etc.)
   - Target Country
3. Click "Simpan Resi"

### Editing a Resi
1. Find the resi in the table
2. Click the pencil (Edit) icon
3. Modify fields (except Resi number)
4. Click checkmark to save or X to cancel

### Adding Product Variation
1. Find the parent product
2. Click the "+" button
3. Variation is created with:
   - Auto-generated resi (parent-VAR{timestamp})
   - Half the parent's unit price
   - Linked to parent via parent_resi field
   - Marked with "VAR" badge

### Updating Packing Status
- Click "Mark Packed" button on unpacked items
- Or edit the status in edit mode
- Status changes reflect in statistics immediately

### Exporting Data
1. Set filters (optional):
   - Status filter
   - Category filter
   - Date range
2. Click "Export Shopee" or "Export TikTok"
3. CSV file downloads automatically

### Filtering & Searching
1. Use search box for quick text search
2. Select status from "Semua Status" dropdown
3. Select category from "Semua Kategori" dropdown
4. Set date range with date pickers
5. Results update automatically

## Database Schema

The feature uses these new columns in `scan_resi_mjm` and `scan_resi_bjw` tables:

```sql
date_time         TIMESTAMP      -- When the entry was created
user_name         VARCHAR(100)   -- Who created/scanned the entry
status_packing    VARCHAR(50)    -- unpacked | packed | shipped
notes             TEXT           -- Additional notes
target_country    VARCHAR(100)   -- Destination country (for exports)
order_type        VARCHAR(50)    -- shopee | tiktok | reseller | export | online
is_variation      BOOLEAN        -- Whether this is a product variation
parent_resi       VARCHAR(255)   -- Parent resi if this is a variation
```

### Indexes Added:
- `idx_scan_resi_{store}_resi`: Fast resi lookup
- `idx_scan_resi_{store}_status_packing`: Fast status filtering
- `idx_scan_resi_{store}_date_time`: Fast date sorting
- `idx_scan_resi_{store}_customer`: Fast customer search
- `idx_scan_resi_{store}_order_type`: Fast category filtering

## API Functions

### `fetchScanResiData(store)`
Fetches all scan resi entries for the selected store, ordered by date_time descending.

**Returns**: `Promise<OnlineOrderRow[]>`

### `addScanResiEntry(entry, store, userName)`
Adds a new resi entry with duplicate checking.

**Parameters**:
- `entry`: Partial<OnlineOrderRow> - The resi data
- `store`: string | null - 'mjm' or 'bjw'
- `userName`: string - Current user name

**Returns**: `Promise<{ success: boolean; msg: string; data?: OnlineOrderRow }>`

### `updateScanResiEntry(id, updates, store)`
Updates fields of an existing resi entry.

**Parameters**:
- `id`: number - Entry ID
- `updates`: Partial<OnlineOrderRow> - Fields to update
- `store`: string | null

**Returns**: `Promise<{ success: boolean; msg: string }>`

### `deleteScanResiEntry(id, store)`
Deletes a resi entry.

**Parameters**:
- `id`: number - Entry ID
- `store`: string | null

**Returns**: `Promise<{ success: boolean; msg: string }>`

### `addProductVariation(parentEntry, store, userName)`
Creates a product variation linked to a parent entry.

**Parameters**:
- `parentEntry`: OnlineOrderRow - Parent entry
- `store`: string | null
- `userName`: string

**Returns**: `Promise<{ success: boolean; msg: string; data?: OnlineOrderRow }>`

### `exportScanResiData(store, format, filters)`
Exports filtered data in specified format.

**Parameters**:
- `store`: string | null
- `format`: 'shopee' | 'tiktok'
- `filters`: Optional filters (dates, status, order_type)

**Returns**: `Promise<{ success: boolean; data?: any[]; msg: string }>`

## Best Practices

### Data Entry
1. Always scan or enter accurate resi numbers
2. Verify customer names for accurate tracking
3. Use correct category for proper filtering
4. Set target country for export orders

### Packing Workflow
1. View unpacked orders using status filter
2. Process items and mark as "packed"
3. After shipment, mark as "shipped"
4. Export data for platform upload

### Using Variations
- Use for left/right parts (e.g., brake pads)
- Use for split shipments
- Prices automatically split 50/50
- Parent-child link preserved for tracking

### Export Workflow
1. Filter by date range for specific period
2. Filter by category (e.g., only Shopee)
3. Filter by status (e.g., only packed items)
4. Export to CSV
5. Upload to respective platform

## Troubleshooting

### Issue: "Resi already exists"
- **Cause**: Duplicate resi number
- **Solution**: Check if resi was already scanned. Use search to find existing entry.

### Issue: Export not downloading
- **Cause**: Browser blocking downloads
- **Solution**: Allow downloads from the site in browser settings

### Issue: Scanner not working
- **Cause**: Camera integration pending
- **Solution**: Use manual input temporarily or enter code manually in scanner modal

### Issue: Filters not working
- **Cause**: No data matching filter criteria
- **Solution**: Reset filters or adjust date range

## Mobile Tips

1. **Portrait Mode**: Best for table viewing
2. **Landscape Mode**: Shows more columns
3. **Scroll**: Swipe horizontally to see all columns
4. **Edit Mode**: Tap edit icon, fields become editable
5. **Quick Actions**: Buttons are touch-friendly, 48px minimum
6. **Navigation**: Auto-hides on scroll down, shows on scroll up

## Future Enhancements

- [ ] Full camera barcode scanner integration
- [ ] Bulk import from Excel/CSV
- [ ] Print packing slips
- [ ] Barcode label printing
- [ ] Real-time notifications
- [ ] Multi-user collaboration
- [ ] Advanced analytics dashboard
- [ ] API integrations with Shopee/TikTok
- [ ] Automated status updates from shipping carriers

## Support

For issues or questions:
1. Check this documentation
2. Review database migration logs
3. Check browser console for errors
4. Contact system administrator

---

**Last Updated**: 2026-01-17
**Version**: 1.0.0
**Author**: GitHub Copilot Agent
