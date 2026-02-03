-- Migration: Create supplier_orders table for tracking purchase orders
-- Run this in Supabase SQL Editor

-- Table for Purchase Order headers
CREATE TABLE IF NOT EXISTS supplier_orders (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(20) NOT NULL UNIQUE,
    supplier VARCHAR(255) NOT NULL,
    store VARCHAR(10) NOT NULL DEFAULT 'mjm',
    tempo VARCHAR(20) DEFAULT 'CASH',
    total_items INTEGER DEFAULT 0,
    total_value DECIMAL(15,2) DEFAULT 0,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, SENT, RECEIVED, CANCELLED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for Purchase Order items/details
CREATE TABLE IF NOT EXISTS supplier_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES supplier_orders(id) ON DELETE CASCADE,
    part_number VARCHAR(100) NOT NULL,
    nama_barang VARCHAR(255),
    qty INTEGER NOT NULL DEFAULT 1,
    harga_satuan DECIMAL(15,2) DEFAULT 0,
    harga_total DECIMAL(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_supplier_orders_supplier ON supplier_orders(supplier);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_store ON supplier_orders(store);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON supplier_orders(status);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_created_at ON supplier_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_order_items_order_id ON supplier_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_order_items_part_number ON supplier_order_items(part_number);

-- Function to get next PO number
CREATE OR REPLACE FUNCTION get_next_po_number(store_code VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    next_num INTEGER;
    year_part VARCHAR;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYMM');
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 'PO-[A-Z]+-[0-9]{4}-([0-9]+)') AS INTEGER)), 0) + 1
    INTO next_num
    FROM supplier_orders
    WHERE po_number LIKE 'PO-' || UPPER(store_code) || '-' || year_part || '-%';
    
    RETURN 'PO-' || UPPER(store_code) || '-' || year_part || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow all for supplier_orders" ON supplier_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for supplier_order_items" ON supplier_order_items FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON supplier_orders TO authenticated;
GRANT ALL ON supplier_orders TO anon;
GRANT ALL ON supplier_order_items TO authenticated;
GRANT ALL ON supplier_order_items TO anon;
GRANT USAGE, SELECT ON SEQUENCE supplier_orders_id_seq TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE supplier_order_items_id_seq TO authenticated, anon;
