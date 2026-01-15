-- Optimized Query for Beranda (Shop View)
-- Description: Join data from base tables, foto table, and list_harga_jual table
-- Features: Pagination, filters, low stock alerts, multiple photos, latest prices

-- ============================================
-- QUERY 1: Fetch Shop Items with Joins (MJM)
-- ============================================
-- This query demonstrates how to fetch all necessary data for the shop view
-- Parameters: $store (mjm/bjw), $search, $brand, $application, $limit, $offset

-- Example for MJM store:
SELECT 
    b.part_number,
    b.name,
    b.brand,
    b.application,
    b.shelf,
    b.quantity,
    b.price,
    b.cost_price,
    b.ecommerce,
    b.initial_stock,
    b.qty_in,
    b.qty_out,
    b.last_updated,
    b.image_url,
    -- Low stock indicator
    CASE 
        WHEN b.quantity < 5 THEN true 
        ELSE false 
    END as is_low_stock,
    -- Photos from foto table
    f.foto_1,
    f.foto_2,
    f.foto_3,
    f.foto_4,
    f.foto_5,
    f.foto_6,
    f.foto_7,
    f.foto_8,
    f.foto_9,
    f.foto_10,
    -- Latest price from list_harga_jual
    lhj.harga_jual as latest_price,
    lhj.created_at as price_updated_at
FROM 
    base_mjm b
LEFT JOIN 
    foto f ON b.part_number = f.part_number
LEFT JOIN LATERAL (
    -- Get the most recent price for this part_number
    SELECT harga_jual, created_at
    FROM list_harga_jual
    WHERE part_number = b.part_number
    ORDER BY created_at DESC
    LIMIT 1
) lhj ON true
WHERE 
    b.quantity > 0  -- Only show items in stock for shop view
    -- Add optional filters
    -- AND ($search IS NULL OR b.name ILIKE '%' || $search || '%' OR b.part_number ILIKE '%' || $search || '%')
    -- AND ($brand IS NULL OR b.brand ILIKE '%' || $brand || '%')
    -- AND ($application IS NULL OR b.application ILIKE '%' || $application || '%')
ORDER BY 
    b.name ASC
-- LIMIT $limit OFFSET $offset;

-- ============================================
-- QUERY 2: Fetch All Items (Including Out of Stock)
-- ============================================
-- For inventory management views

-- SELECT 
--     b.part_number,
--     b.name,
--     b.brand,
--     b.application,
--     b.shelf,
--     b.quantity,
--     b.price,
--     b.cost_price,
--     b.ecommerce,
--     b.initial_stock,
--     b.qty_in,
--     b.qty_out,
--     b.last_updated,
--     b.image_url,
--     CASE WHEN b.quantity < 5 THEN true ELSE false END as is_low_stock,
--     f.foto_1, f.foto_2, f.foto_3, f.foto_4, f.foto_5,
--     f.foto_6, f.foto_7, f.foto_8, f.foto_9, f.foto_10,
--     lhj.harga_jual as latest_price,
--     lhj.created_at as price_updated_at
-- FROM 
--     base_mjm b
-- LEFT JOIN 
--     foto f ON b.part_number = f.part_number
-- LEFT JOIN LATERAL (
--     SELECT harga_jual, created_at
--     FROM list_harga_jual
--     WHERE part_number = b.part_number
--     ORDER BY created_at DESC
--     LIMIT 1
-- ) lhj ON true
-- ORDER BY b.name ASC;

-- ============================================
-- QUERY 3: Count Query for Pagination
-- ============================================
-- Get total count of items matching filters

-- SELECT COUNT(*) as total
-- FROM base_mjm b
-- WHERE b.quantity > 0
--     AND ($search IS NULL OR b.name ILIKE '%' || $search || '%' OR b.part_number ILIKE '%' || $search || '%')
--     AND ($brand IS NULL OR b.brand ILIKE '%' || $brand || '%')
--     AND ($application IS NULL OR b.application ILIKE '%' || $application || '%');

-- ============================================
-- QUERY 4: Low Stock Items
-- ============================================
-- Get items with low stock for alerts

-- SELECT 
--     b.part_number,
--     b.name,
--     b.brand,
--     b.quantity
-- FROM base_mjm b
-- WHERE b.quantity > 0 AND b.quantity < 5
-- ORDER BY b.quantity ASC, b.name ASC;

-- ============================================
-- QUERY 5: Price History for an Item
-- ============================================
-- Get price change history for a specific part

-- SELECT 
--     part_number,
--     harga_jual,
--     created_at,
--     keterangan
-- FROM list_harga_jual
-- WHERE part_number = 'PART-123'
-- ORDER BY created_at DESC;

-- ============================================
-- NOTES FOR IMPLEMENTATION
-- ============================================
-- 1. Replace 'base_mjm' with dynamic table name based on store (base_mjm or base_bjw)
-- 2. Use parameterized queries to prevent SQL injection
-- 3. Implement pagination with LIMIT and OFFSET
-- 4. Add WHERE clause filters based on user input
-- 5. Handle NULL cases for left joins (foto and price may not exist)
-- 6. Consider caching frequently accessed data
-- 7. Monitor query performance with EXPLAIN ANALYZE
