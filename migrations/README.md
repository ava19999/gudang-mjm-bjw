# Database Migration Guide

This guide explains how to apply database migrations to fix the Beranda (Shop View) data display issues.

## Problem Overview

The Beranda menu was not displaying data because:
1. Old records had empty `part_number` fields, breaking table relationships
2. The app needs to join data from multiple tables: `base_mjm`/`base_bjw`, `foto`, and `list_harga_jual`
3. Low stock alerts needed to be implemented

## Solution

We've created SQL migration scripts and updated the application code to:
1. Fill empty `part_number` values with auto-generated unique IDs
2. Create indexes for better query performance
3. Implement optimized queries with proper table joins
4. Add low stock indicators for items with quantity < 5

## Migration Files

### 1. `001_fix_empty_part_numbers.sql`
- Updates all empty/null `part_number` values in base tables
- Creates indexes for better join performance
- **IMPORTANT**: Run this migration first before using the application

### 2. `002_optimized_shop_queries.sql`
- Contains reference SQL queries for fetching shop items with joins
- Used as a guide for implementing the TypeScript functions
- Not meant to be executed directly (reference only)

## How to Run Migrations

### Option 1: Using Supabase Dashboard (Recommended)

1. Login to your Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to your project: `doyyghsijggiibkcktuq`
3. Click on "SQL Editor" in the left sidebar
4. Open the file `migrations/001_fix_empty_part_numbers.sql`
5. Copy the entire SQL content
6. Paste it into the SQL Editor
7. Click "Run" button to execute the migration
8. Check the results panel to verify successful execution

### Option 2: Using Supabase CLI

If you have Supabase CLI installed:

```bash
# Navigate to project directory
cd /home/runner/work/gudang-mjm-bjw/gudang-mjm-bjw

# Run the migration
supabase db execute -f migrations/001_fix_empty_part_numbers.sql
```

### Option 3: Manual Execution

You can also connect to your PostgreSQL database directly and run the SQL:

```bash
psql -h db.doyyghsijggiibkcktuq.supabase.co -U postgres -d postgres -f migrations/001_fix_empty_part_numbers.sql
```

## Verification

After running the migration, verify that it worked:

1. In Supabase SQL Editor, run:
```sql
-- Check base_mjm
SELECT COUNT(*) as empty_part_numbers 
FROM base_mjm 
WHERE part_number IS NULL OR part_number = '' OR TRIM(part_number) = '';

-- Check base_bjw
SELECT COUNT(*) as empty_part_numbers 
FROM base_bjw 
WHERE part_number IS NULL OR part_number = '' OR TRIM(part_number) = '';

-- Show sample of updated records
SELECT part_number, name, quantity FROM base_mjm WHERE part_number LIKE 'AUTO-%' LIMIT 5;
```

2. Expected result: `empty_part_numbers` should be `0`

## What Changed in the Code

### Backend (`services/supabaseService.ts`)

1. **Enhanced `fetchShopItems` function**:
   - Now supports pagination (page, perPage)
   - Added search filters (searchTerm, partNumberSearch, nameSearch, brandSearch, applicationSearch)
   - Joins with `foto` table to get all product images
   - Joins with `list_harga_jual` table to get latest prices
   - Adds `isLowStock` flag for items with quantity < 5

2. **New helper function `fetchLatestPricesForItems`**:
   - Fetches the most recent price for each part from `list_harga_jual` table
   - Returns a map of part_number → price data

### Frontend (`types.ts`, `components/shop/ShopItemList.tsx`)

1. **Updated `InventoryItem` interface**:
   - Added optional `isLowStock?: boolean` field

2. **Enhanced `ShopItemList` component**:
   - Now displays red alert badge for low stock items (quantity < 5)
   - Shows warning emoji (⚠️) for low stock items
   - Works in both grid and list view modes

## Testing

After running the migration and deploying the code:

1. **Test Login**: Login to the application (Admin mode)
2. **Navigate to Beranda**: Click on "Beranda" or "Belanja" menu
3. **Verify Data Display**:
   - Products should now appear
   - Images should load from `foto` table
   - Prices should reflect latest values from `list_harga_jual`
   - Low stock items (< 5 units) should have red badge with ⚠️ emoji
4. **Test Filters**:
   - Search by name or part number
   - Filter by brand
   - Filter by application
5. **Test Pagination**:
   - Navigate through pages
   - Verify correct item count per page

## Rollback (If Needed)

If you need to rollback the migration:

```sql
-- Note: This will only remove auto-generated part numbers
-- It will NOT restore original empty values (they're lost)

DELETE FROM base_mjm WHERE part_number LIKE 'AUTO-MJM-%';
DELETE FROM base_bjw WHERE part_number LIKE 'AUTO-BJW-%';
DELETE FROM base WHERE part_number LIKE 'AUTO-BASE-%';
```

**WARNING**: Rollback is not recommended as it will break relationships again.

## Troubleshooting

### Issue: Data still not showing

**Solution**:
1. Check browser console for errors
2. Verify migration ran successfully (see Verification section)
3. Check that Supabase RLS policies allow SELECT on tables
4. Verify `.env` has correct Supabase credentials

### Issue: Images not loading

**Solution**:
1. Check if `foto` table has data for the part_numbers
2. Verify image URLs are valid and accessible
3. Check browser console for CORS or network errors

### Issue: Prices showing incorrect values

**Solution**:
1. Verify `list_harga_jual` table has price data
2. Check that `part_number` matches between tables
3. Ensure `created_at` field is properly set for sorting

## Support

For questions or issues, contact the development team or check the application logs in Supabase Dashboard.

## Next Steps

After successful migration:
1. Monitor application performance
2. Check query execution times in Supabase
3. Consider adding more indexes if queries are slow
4. Implement price history tracking if needed
5. Add bulk edit features for managing part numbers
