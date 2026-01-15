# Quick Start: Database Setup & Verification

This is a quick reference for setting up and verifying your database for the Beranda data display feature.

## 🚀 Quick Start (5 Minutes)

### Step 1: Run Migration (2 minutes)

**Go to:** Supabase Dashboard → SQL Editor → New Query

**Copy and Run This:**
```sql
-- Migration: Fix Empty Part Numbers and Create Indexes
-- This script updates empty part_number values and creates indexes

-- Update base_mjm
UPDATE base_mjm
SET part_number = CONCAT('AUTO-MJM-', COALESCE(id::text, gen_random_uuid()::text))
WHERE part_number IS NULL OR part_number = '' OR TRIM(part_number) = '';

-- Update base_bjw
UPDATE base_bjw
SET part_number = CONCAT('AUTO-BJW-', COALESCE(id::text, gen_random_uuid()::text))
WHERE part_number IS NULL OR part_number = '' OR TRIM(part_number) = '';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_base_mjm_part_number ON base_mjm(part_number);
CREATE INDEX IF NOT EXISTS idx_base_bjw_part_number ON base_bjw(part_number);
CREATE INDEX IF NOT EXISTS idx_foto_part_number ON foto(part_number);
CREATE INDEX IF NOT EXISTS idx_list_harga_jual_part_number ON list_harga_jual(part_number);
CREATE INDEX IF NOT EXISTS idx_base_mjm_quantity ON base_mjm(quantity);
CREATE INDEX IF NOT EXISTS idx_base_bjw_quantity ON base_bjw(quantity);
```

**Expected Result:** "Success. No rows returned"

---

### Step 2: Verify Data (1 minute)

**Run This Query:**
```sql
-- Quick verification for MJM store
SELECT 
  COUNT(*) as total_items,
  COUNT(CASE WHEN part_number IS NULL OR part_number = '' THEN 1 END) as empty_part_numbers,
  COUNT(CASE WHEN quantity > 0 THEN 1 END) as items_in_stock,
  COUNT(CASE WHEN quantity < 5 AND quantity > 0 THEN 1 END) as low_stock_items
FROM base_mjm;
```

**Expected Result:**
```
total_items | empty_part_numbers | items_in_stock | low_stock_items
------------|-------------------|----------------|----------------
    150     |         0         |      45        |       8
```

✅ `empty_part_numbers` MUST be `0`  
✅ `items_in_stock` should be > 0 (if you have inventory)

---

### Step 3: Test the App (2 minutes)

1. Open your app in browser
2. Login as Admin (password: `mjm123` or `bjw123`)
3. Click "Beranda" menu
4. **You should see products now!** 🎉

---

## 📊 Useful Verification Queries

### Check Sample Data from All Tables

```sql
-- View sample items with their photos and prices
SELECT 
    b.part_number,
    b.name,
    b.brand,
    b.quantity,
    b.price as base_price,
    f.foto_1,
    f.foto_2,
    lhj.harga_jual as latest_price,
    lhj.created_at as price_updated
FROM base_mjm b
LEFT JOIN foto f ON b.part_number = f.part_number
LEFT JOIN LATERAL (
    SELECT harga_jual, created_at
    FROM list_harga_jual
    WHERE part_number = b.part_number
    ORDER BY created_at DESC
    LIMIT 1
) lhj ON true
WHERE b.quantity > 0
ORDER BY b.name
LIMIT 10;
```

**What to Check:**
- ✅ All items have `part_number` (not NULL)
- ✅ Items with photos show `foto_1`, `foto_2`, etc.
- ✅ Items with price history show `latest_price`

---

### Check Low Stock Items

```sql
-- Find all low stock items (quantity < 5)
SELECT 
    part_number,
    name,
    brand,
    quantity,
    CASE WHEN quantity < 5 THEN '⚠️ LOW STOCK' ELSE '✅ OK' END as status
FROM base_mjm
WHERE quantity > 0 AND quantity < 5
ORDER BY quantity ASC, name ASC;
```

**Expected:** List of items with quantity between 1-4

---

### Check Items Without Photos

```sql
-- Find items that don't have photos in foto table
SELECT 
    b.part_number,
    b.name,
    b.quantity,
    f.part_number as foto_exists
FROM base_mjm b
LEFT JOIN foto f ON b.part_number = f.part_number
WHERE b.quantity > 0 AND f.part_number IS NULL
LIMIT 20;
```

**Use this to:** Identify which products need photos added

---

### Check Items Without Price History

```sql
-- Find items that don't have price history
SELECT 
    b.part_number,
    b.name,
    b.price as current_price,
    lhj.part_number as price_history_exists
FROM base_mjm b
LEFT JOIN list_harga_jual lhj ON b.part_number = lhj.part_number
WHERE b.quantity > 0 AND lhj.part_number IS NULL
LIMIT 20;
```

**Use this to:** Identify which products need price history

---

## 🔧 Create Test Data (Optional)

If you want to test with sample data:

```sql
-- Create test items
INSERT INTO base_mjm (part_number, name, brand, application, quantity, price, cost_price, shelf, ecommerce)
VALUES 
  ('TEST-NORMAL-001', 'Test Product with Good Stock', 'TestBrand', 'Universal', 15, 100000, 80000, 'A1', 'Tokopedia'),
  ('TEST-LOW-002', 'Test Product with Low Stock', 'TestBrand', 'Honda Civic', 3, 150000, 120000, 'A2', 'Shopee'),
  ('TEST-LOW-003', 'Another Low Stock Item', 'TestBrand', 'Toyota Avanza', 2, 200000, 160000, 'A3', 'Bukalapak')
ON CONFLICT (part_number) DO NOTHING;

-- Add photos for test items
INSERT INTO foto (part_number, foto_1, foto_2, foto_3)
VALUES 
  ('TEST-NORMAL-001', 
    'https://via.placeholder.com/400x300/4A90E2/FFFFFF?text=Normal+Stock',
    'https://via.placeholder.com/400x300/4A90E2/FFFFFF?text=Image+2',
    'https://via.placeholder.com/400x300/4A90E2/FFFFFF?text=Image+3'
  ),
  ('TEST-LOW-002',
    'https://via.placeholder.com/400x300/E74C3C/FFFFFF?text=Low+Stock',
    'https://via.placeholder.com/400x300/E74C3C/FFFFFF?text=Image+2',
    NULL
  )
ON CONFLICT (part_number) DO UPDATE 
  SET foto_1 = EXCLUDED.foto_1, foto_2 = EXCLUDED.foto_2, foto_3 = EXCLUDED.foto_3;

-- Add price history for test items
INSERT INTO list_harga_jual (part_number, harga_jual, created_at, keterangan)
VALUES 
  ('TEST-NORMAL-001', 110000, NOW(), 'Updated test price'),
  ('TEST-LOW-002', 160000, NOW(), 'Price increase due to scarcity')
ON CONFLICT DO NOTHING;
```

**Then refresh the app!** You should see 3 test products, and 2 of them should have red "Low Stock" badges.

---

## 🧹 Clean Up Test Data

When done testing:

```sql
-- Remove test data
DELETE FROM base_mjm WHERE part_number LIKE 'TEST-%';
DELETE FROM foto WHERE part_number LIKE 'TEST-%';
DELETE FROM list_harga_jual WHERE part_number LIKE 'TEST-%';
```

---

## ❗ Common Issues & Quick Fixes

### Issue: "Still no data in Beranda"

**Quick Fix:**
```sql
-- Check if you actually have items in stock
SELECT COUNT(*) FROM base_mjm WHERE quantity > 0;
```

If result is `0`, you need to add inventory or increase quantity on existing items:

```sql
-- Add quantity to existing items
UPDATE base_mjm 
SET quantity = 10 
WHERE part_number IN (SELECT part_number FROM base_mjm LIMIT 5);
```

---

### Issue: "Low stock alerts not showing"

**Quick Fix:**
```sql
-- Manually set some items to low stock for testing
UPDATE base_mjm 
SET quantity = 3 
WHERE part_number IN (
  SELECT part_number FROM base_mjm WHERE quantity > 5 LIMIT 3
);
```

---

### Issue: "Images not displaying"

**Quick Check:**
```sql
-- Check if foto table has data
SELECT COUNT(*) FROM foto;

-- Check sample foto URLs
SELECT part_number, foto_1 FROM foto WHERE foto_1 IS NOT NULL LIMIT 5;
```

If URLs are empty or invalid, you need to update them:

```sql
-- Example: Add placeholder images
UPDATE foto 
SET foto_1 = 'https://via.placeholder.com/400x300?text=' || part_number
WHERE foto_1 IS NULL AND part_number IS NOT NULL;
```

---

## 📈 Performance Check

After setup, verify query performance:

```sql
EXPLAIN ANALYZE
SELECT b.*, f.foto_1, f.foto_2
FROM base_mjm b
LEFT JOIN foto f ON b.part_number = f.part_number
WHERE b.quantity > 0
ORDER BY b.name
LIMIT 50;
```

**Good Performance:** Execution Time < 50ms  
**Acceptable:** 50-200ms  
**Needs Optimization:** > 200ms

If slow, ensure indexes were created (check Step 1).

---

## ✅ Success Checklist

After completing this guide, verify:

- [ ] Migration ran successfully (no errors)
- [ ] `empty_part_numbers` = 0 in verification query
- [ ] Test data created (if needed)
- [ ] App shows products in Beranda
- [ ] Images load correctly
- [ ] Low stock badges appear (red with ⚠️)
- [ ] Prices display correctly
- [ ] Performance is acceptable (< 2s page load)

**If all checked:** You're done! 🎉

---

## 📞 Need Help?

1. Check browser console (F12) for errors
2. Check Supabase logs in Dashboard
3. Review `TESTING_GUIDE.md` for detailed troubleshooting
4. Review `migrations/README.md` for migration details
