# Quick Start: Scan Resi & Packing Feature

This guide will help you get the Scan Resi & Packing feature up and running in 5 minutes.

## 🚀 Step 1: Run Database Migration (2 minutes)

### Go to Supabase Dashboard
1. Open https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the sidebar
4. Click **New Query**

### Copy and Run This Migration
```sql
-- Migration: Add Packing Fields to Scan Resi Tables
-- This migration adds date_time, user, status_packing and other necessary fields

-- Update scan_resi_mjm table
ALTER TABLE scan_resi_mjm 
ADD COLUMN IF NOT EXISTS date_time TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS user_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS status_packing VARCHAR(50) DEFAULT 'unpacked',
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS target_country VARCHAR(100),
ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) DEFAULT 'online',
ADD COLUMN IF NOT EXISTS is_variation BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS parent_resi VARCHAR(255);

-- Update scan_resi_bjw table
ALTER TABLE scan_resi_bjw 
ADD COLUMN IF NOT EXISTS date_time TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS user_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS status_packing VARCHAR(50) DEFAULT 'unpacked',
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS target_country VARCHAR(100),
ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) DEFAULT 'online',
ADD COLUMN IF NOT EXISTS is_variation BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS parent_resi VARCHAR(255);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_resi ON scan_resi_mjm(resi);
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_status_packing ON scan_resi_mjm(status_packing);
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_date_time ON scan_resi_mjm(date_time);
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_customer ON scan_resi_mjm(customer);
CREATE INDEX IF NOT EXISTS idx_scan_resi_mjm_order_type ON scan_resi_mjm(order_type);

CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_resi ON scan_resi_bjw(resi);
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_status_packing ON scan_resi_bjw(status_packing);
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_date_time ON scan_resi_bjw(date_time);
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_customer ON scan_resi_bjw(customer);
CREATE INDEX IF NOT EXISTS idx_scan_resi_bjw_order_type ON scan_resi_bjw(order_type);
```

**Click "Run"** and wait for "Success. No rows returned" message.

---

## ✅ Step 2: Verify Migration (1 minute)

Run this verification query:
```sql
-- Check if new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'scan_resi_mjm' 
  AND column_name IN ('date_time', 'user_name', 'status_packing', 'order_type');
```

**Expected Result:** Should return 4 rows showing the new columns.

---

## 🎯 Step 3: Access the Feature (2 minutes)

1. **Login to App**
   - Use Admin credentials (mjm123 or bjw123)
   
2. **Navigate to Scan Resi**
   - Desktop: Click **"Online"** menu (Globe icon) → Select **"Scan Resi"**
   - Mobile: Tap **"Online"** tab → Tap **"Scan Resi"**

3. **You Should See:**
   - 6 KPI statistics cards at the top
   - Action buttons (Scan Barcode, Input Manual, Export)
   - Filters section
   - Data table (may be empty initially)

---

## 📝 Step 4: Add Your First Resi (Test)

1. **Click "Input Manual"**

2. **Fill the form:**
   - **Resi Number**: `TEST-001` (or scan a barcode)
   - **Customer**: `Test Customer`
   - **Nama Barang**: `Test Product`
   - **Part Number**: `TP-001`
   - **Quantity**: `2`
   - **Harga Satuan**: `50000`
   - **Kategori**: `Shopee`
   - **Target Country**: `Indonesia`

3. **Click "Simpan Resi"**

4. **Verify:**
   - Entry appears in the table
   - Statistics update (Total Resi: 1, Unpacked: 1)
   - Can edit, add variation, or delete

---

## 🎨 Feature Tour

### Dashboard Statistics
- **Total Resi**: Total entries in database
- **Unpacked**: Red - Items awaiting packing
- **Packed**: Blue - Items ready to ship
- **Shipped**: Green - Items already shipped
- **Hari Ini**: Yellow - Today's new orders
- **Total Revenue**: Purple - Total value in millions

### Action Buttons
- **Scan Barcode**: Open camera scanner (placeholder for now - use manual input)
- **Input Manual**: Add resi via form
- **Export Shopee**: Download CSV in Shopee format
- **Export TikTok**: Download CSV in TikTok format
- **Refresh**: Reload data from database

### Filters
- **Search**: Find by resi, customer, or product name
- **Status**: Filter by unpacked/packed/shipped
- **Category**: Filter by Shopee/TikTok/Reseller/Export
- **Date Range**: Filter by start and end date

### Table Actions (per row)
- **Edit** (Pencil icon): Modify customer, product, qty, price
- **Add Variation** (Plus icon): Create product variation
- **Delete** (Trash icon): Remove entry
- **Mark Packed**: Quick status change button

---

## 📊 Common Workflows

### 1. Daily Packing Workflow
```
1. Filter by Status: "Unpacked"
2. Process each order
3. Click "Mark Packed" when done
4. Filter by Status: "Packed"
5. Export for shipping
```

### 2. Export for Platform
```
1. Set Date Range (e.g., last 7 days)
2. Filter by Category (e.g., "Shopee")
3. Filter by Status (e.g., "Packed")
4. Click "Export Shopee"
5. Upload CSV to Shopee Seller Center
```

### 3. Add Product Variation
```
1. Find item in table (e.g., brake pad set)
2. Click "+" button
3. Variation created with:
   - Auto-generated resi (parent-VAR{timestamp})
   - Half the parent price
   - Linked to parent
4. Edit variation details as needed
```

---

## 🛠 Troubleshooting

### Issue: Can't see Scan Resi menu
- **Solution**: Make sure you're logged in as Admin, not Guest

### Issue: "Resi already exists" error
- **Solution**: Use search to find the duplicate. Each resi must be unique.

### Issue: Export not downloading
- **Solution**: Allow downloads in browser settings

### Issue: Table is empty
- **Solution**: 
  1. Click "Input Manual" to add test data
  2. Check if filters are too restrictive
  3. Click "Refresh" button

### Issue: Statistics showing 0
- **Solution**: Add some test data or check database connection

---

## 📱 Mobile Tips

- **Portrait mode** is optimized for table viewing
- **Swipe horizontally** to see all columns
- **Tap and hold** for long-press actions
- **Pull down** to show navigation
- **Scroll up** to hide navigation (auto-hide feature)

---

## 🎓 Pro Tips

1. **Use Categories**: Always select correct category for easy filtering
2. **Batch Processing**: Filter unpacked orders, process in bulk
3. **Export Often**: Regular exports keep platforms in sync
4. **Use Variations**: For items with left/right or color options
5. **Search First**: Before adding, search to avoid duplicates
6. **Status Updates**: Keep statuses current for accurate KPIs

---

## ✅ Success Checklist

After completing this guide, verify:

- [ ] Migration ran successfully (no errors)
- [ ] Can access Scan Resi menu
- [ ] Can add resi via manual input
- [ ] Can see data in table
- [ ] Can edit an entry
- [ ] Can filter by status
- [ ] Can export to CSV
- [ ] Statistics update correctly
- [ ] Can delete an entry
- [ ] Can add product variation

**If all checked:** You're ready to use the feature! 🎉

---

## 📚 Additional Resources

- **Full Documentation**: See `docs/SCAN_RESI_GUIDE.md`
- **Database Schema**: See `migrations/003_scan_resi_packing_schema.sql`
- **Migration Guide**: See `migrations/README.md`

---

## 📞 Need Help?

1. Check browser console (F12) for errors
2. Review full documentation in `docs/SCAN_RESI_GUIDE.md`
3. Check Supabase logs for database errors
4. Contact system administrator

---

**Ready?** Start with Step 1 above! ⬆️

**Estimated Total Time**: 5 minutes ⏱️
