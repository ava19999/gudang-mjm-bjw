# Testing Guide: Beranda Data Display Fix

This guide will help you test and verify that the Beranda (Shop View) is now displaying data correctly with proper table relationships.

## Prerequisites

Before testing, ensure you have:
1. ✅ Run the SQL migration (`migrations/001_fix_empty_part_numbers.sql`) in Supabase
2. ✅ Deployed the latest code changes to your environment
3. ✅ Valid Supabase credentials in `.env` file

## Quick Test Checklist

### 1. Database Migration (DO THIS FIRST!)

**Steps:**
1. Login to Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: `doyyghsijggiibkcktuq`
3. Go to "SQL Editor" in left sidebar
4. Copy content from `migrations/001_fix_empty_part_numbers.sql`
5. Paste and click "Run"
6. Verify success message appears

**Verification Query:**
```sql
-- Check if migration worked
SELECT COUNT(*) as total_items,
       COUNT(CASE WHEN part_number IS NULL OR part_number = '' THEN 1 END) as empty_part_numbers,
       COUNT(CASE WHEN quantity > 0 THEN 1 END) as in_stock_items,
       COUNT(CASE WHEN quantity < 5 AND quantity > 0 THEN 1 END) as low_stock_items
FROM base_mjm;
```

Expected: `empty_part_numbers` should be `0`

### 2. Application Testing

#### Step A: Login and Navigate
1. Open the application in browser
2. Login with Admin credentials:
   - MJM: `mjm123`
   - BJW: `bjw123`
3. Click "Beranda" or "Belanja" menu

#### Step B: Check Console Logs
1. Open Browser DevTools (F12)
2. Go to "Console" tab
3. Look for logs like:
   ```
   [ShopView] Fetching shop items with params: {...}
   [fetchShopItems] Fetched X items from base_mjm (page 1)
   [ShopView] Set shop items: X Total pages: Y
   ```

#### Step C: Verify Data Display

**What to Check:**
- [ ] Products are visible on the page
- [ ] Product images load correctly
- [ ] Product names display correctly
- [ ] Part numbers show (e.g., "ABC-123")
- [ ] Prices display correctly
- [ ] Stock quantity shows
- [ ] Low stock items (<5 units) show red badge with ⚠️ emoji

**If No Data Shows:**
1. Check console for errors
2. Verify you're logged in as Admin
3. Check that `quantity > 0` in database
4. Try different store (MJM vs BJW)

### 3. Feature Testing

#### A. Multiple Images
**Test:**
1. Find a product with multiple images in `foto` table
2. Click on product image
3. Image viewer should open showing all images
4. Look for "🔷 X" indicator (X = number of images)

**Expected:** All images from `foto_1` to `foto_10` should display

#### B. Low Stock Alert
**Test:**
1. Find items with `quantity < 5` in database
2. Look for red badge on product card
3. Verify it shows: "[quantity] Unit ⚠️"

**Expected:** Red background badge instead of black/gray

#### C. Price from `list_harga_jual`
**Test:**
1. Add a price record in `list_harga_jual` table:
```sql
INSERT INTO list_harga_jual (part_number, harga_jual, created_at, keterangan)
VALUES ('YOUR-PART-NUMBER', 150000, NOW(), 'Test price');
```
2. Refresh Beranda page
3. Check if price updated to 150000

**Expected:** Price should reflect latest from `list_harga_jual`

#### D. Search Functionality
**Test:**
1. Use search bar at top
2. Type product name or part number
3. Results should filter in real-time

**Search Options:**
- [ ] General search (name or part number)
- [ ] Part number specific search
- [ ] Name specific search
- [ ] Brand filter
- [ ] Application filter

#### E. Pagination
**Test:**
1. If you have >50 items, pagination appears at bottom
2. Click "Next" or page number
3. Console should log: `[fetchShopItems] Fetched X items from base_mjm (page 2)`

**Expected:** Different items on each page

### 4. Performance Testing

#### Check Query Performance
In Supabase SQL Editor:
```sql
EXPLAIN ANALYZE
SELECT b.*, f.foto_1, f.foto_2
FROM base_mjm b
LEFT JOIN foto f ON b.part_number = f.part_number
WHERE b.quantity > 0
ORDER BY b.name
LIMIT 50;
```

**Good Performance:** Execution time < 100ms

#### Check Console Timing
In browser console, look for:
```
[fetchShopItems] Fetched 50 items from base_mjm (page 1)
```

Time between "Fetching" and "Fetched" should be < 1 second

## Troubleshooting

### Issue: "No data showing in Beranda"

**Solution Steps:**
1. **Check Console Logs**
   ```
   [ShopView] Received data: { data: [], count: 0 }
   ```
   → Database has no items with `quantity > 0`

2. **Verify Database**
   ```sql
   SELECT COUNT(*) FROM base_mjm WHERE quantity > 0;
   ```
   → If 0, add test data

3. **Check RLS Policies**
   - Go to Supabase → Authentication → Policies
   - Ensure `SELECT` is allowed for `anon` role

4. **Verify .env File**
   ```
   VITE_SUPABASE_URL="https://doyyghsijggiibkcktuq.supabase.co"
   VITE_SUPABASE_ANON_KEY="your-key-here"
   ```

### Issue: "Images not loading"

**Solution Steps:**
1. **Check `foto` table**
   ```sql
   SELECT part_number, foto_1, foto_2 FROM foto LIMIT 5;
   ```

2. **Verify URLs are valid**
   - URLs should start with `http://` or `https://`
   - Test URL directly in browser

3. **Check CORS**
   - If images are from external domain, CORS may block
   - Check browser console for CORS errors

### Issue: "Prices showing incorrect values"

**Solution Steps:**
1. **Check `list_harga_jual` table**
   ```sql
   SELECT part_number, harga_jual, created_at 
   FROM list_harga_jual 
   WHERE part_number = 'YOUR-PART-NUMBER'
   ORDER BY created_at DESC;
   ```

2. **Verify `created_at` field**
   - Should have valid timestamps
   - Latest record should be returned

3. **Fallback to base table price**
   - If no price in `list_harga_jual`, uses `price` from `base_mjm`

### Issue: "Low stock alert not showing"

**Solution Steps:**
1. **Check quantity**
   ```sql
   SELECT part_number, name, quantity 
   FROM base_mjm 
   WHERE quantity < 5 AND quantity > 0;
   ```

2. **Verify `isLowStock` flag**
   - In console logs, check if `isLowStock: true` in data
   - Should appear for items with `quantity < 5`

## Test Data Creation

If you need test data for testing:

```sql
-- Create test items with various scenarios
INSERT INTO base_mjm (part_number, name, brand, application, quantity, price, cost_price, shelf)
VALUES 
  ('TEST-001', 'Test Product Normal Stock', 'TestBrand', 'Universal', 10, 100000, 80000, 'A1'),
  ('TEST-002', 'Test Product Low Stock', 'TestBrand', 'Honda', 3, 150000, 120000, 'A2'),
  ('TEST-003', 'Test Product Out of Stock', 'TestBrand', 'Toyota', 0, 200000, 160000, 'A3');

-- Add photos for TEST-001
INSERT INTO foto (part_number, foto_1, foto_2, foto_3)
VALUES ('TEST-001', 
  'https://via.placeholder.com/300x300?text=Image1',
  'https://via.placeholder.com/300x300?text=Image2',
  'https://via.placeholder.com/300x300?text=Image3'
);

-- Add price history for TEST-001
INSERT INTO list_harga_jual (part_number, harga_jual, created_at, keterangan)
VALUES ('TEST-001', 110000, NOW(), 'Latest price update');
```

## Expected Results Summary

After all tests pass:

✅ **Data Display**
- Items with `quantity > 0` appear in Beranda
- Images load from `foto` table
- Prices reflect latest from `list_harga_jual`

✅ **Low Stock Alerts**
- Items with `quantity < 5` show red badge
- Badge includes ⚠️ emoji
- Visible in both grid and list view

✅ **Features Working**
- Search and filters work correctly
- Pagination works (if >50 items)
- Image viewer opens for multiple images
- Add to cart button functions

✅ **Performance**
- Page loads in <2 seconds
- No console errors
- Smooth scrolling and interaction

## Support

If issues persist after following this guide:
1. Check `migrations/README.md` for detailed migration instructions
2. Review browser console for specific error messages
3. Check Supabase Dashboard logs for database errors
4. Verify all environment variables are set correctly

## Next Steps After Testing

Once testing is complete and successful:
1. Remove test data (if created)
2. Monitor application performance
3. Gather user feedback
4. Consider implementing additional features:
   - Price history view
   - Bulk operations
   - Advanced filtering
   - Export functionality
