-- Migration: Create pending_supplier_orders table
-- Description: Table for storing pending order requests from floating widget before approval
-- Run this in Supabase SQL Editor

-- =====================================================
-- TABLE: pending_supplier_orders
-- =====================================================
-- This table stores pending order requests created from the floating widget
-- These are items that need to be reviewed and potentially added to a supplier order

CREATE TABLE IF NOT EXISTS pending_supplier_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Store info
    store VARCHAR(10) NOT NULL DEFAULT 'mjm' CHECK (store IN ('mjm', 'bjw')),
    
    -- Item details
    part_number VARCHAR(100) NOT NULL,
    nama_barang VARCHAR(255) NOT NULL,
    
    -- Quantity info
    qty_requested INTEGER NOT NULL CHECK (qty_requested > 0),
    current_stock INTEGER DEFAULT 0,
    
    -- Status: pending (new request), approved (accepted), processed (added to PO), rejected (cancelled)
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processed', 'rejected')),
    
    -- User tracking
    requested_by VARCHAR(100),
    approved_by VARCHAR(100),
    processed_by VARCHAR(100),
    
    -- Notes
    notes TEXT,
    
    -- Timestamps for status changes
    approved_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    
    -- Reference to supplier_order if processed
    supplier_order_id INTEGER REFERENCES supplier_orders(id) ON DELETE SET NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_pending_supplier_orders_store ON pending_supplier_orders(store);
CREATE INDEX IF NOT EXISTS idx_pending_supplier_orders_status ON pending_supplier_orders(status);
CREATE INDEX IF NOT EXISTS idx_pending_supplier_orders_created_at ON pending_supplier_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_supplier_orders_part_number ON pending_supplier_orders(part_number);
CREATE INDEX IF NOT EXISTS idx_pending_supplier_orders_requested_by ON pending_supplier_orders(requested_by);

-- Enable Row Level Security
ALTER TABLE pending_supplier_orders ENABLE ROW LEVEL SECURITY;

-- Create policy for full access (adjust as needed)
CREATE POLICY "Allow all operations on pending_supplier_orders" ON pending_supplier_orders
    FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON pending_supplier_orders TO authenticated;
GRANT ALL ON pending_supplier_orders TO anon;

-- =====================================================
-- FUNCTION: Update timestamp on pending_supplier_orders update
-- =====================================================
CREATE OR REPLACE FUNCTION update_pending_supplier_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_update_pending_supplier_orders_timestamp ON pending_supplier_orders;
CREATE TRIGGER trigger_update_pending_supplier_orders_timestamp
    BEFORE UPDATE ON pending_supplier_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_pending_supplier_orders_updated_at();

-- =====================================================
-- SAMPLE QUERIES (for reference)
-- =====================================================
-- Get all pending requests for a store:
-- SELECT * FROM pending_supplier_orders WHERE store = 'mjm' AND status = 'pending' ORDER BY created_at DESC;

-- Approve a request:
-- UPDATE pending_supplier_orders SET status = 'approved', approved_by = 'Admin', approved_at = NOW() WHERE id = 'uuid';

-- Get counts by status:
-- SELECT status, COUNT(*) FROM pending_supplier_orders GROUP BY status;
