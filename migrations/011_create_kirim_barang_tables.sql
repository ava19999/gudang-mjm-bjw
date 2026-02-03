-- Migration: Create Kirim Barang (Transfer Stock) Tables
-- Description: Tables for managing stock transfer requests between MJM and BJW stores

-- =====================================================
-- TABLE: kirim_barang (Inter-store Transfer Requests)
-- =====================================================
-- This table tracks all transfer requests between MJM and BJW
CREATE TABLE IF NOT EXISTS kirim_barang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Request Details
    from_store VARCHAR(10) NOT NULL CHECK (from_store IN ('mjm', 'bjw')),
    to_store VARCHAR(10) NOT NULL CHECK (to_store IN ('mjm', 'bjw')),
    
    -- Item Details
    part_number VARCHAR(100) NOT NULL,
    nama_barang VARCHAR(255) NOT NULL,
    brand VARCHAR(100),
    application TEXT,
    
    -- Quantity
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    
    -- Status: 'pending' (requested), 'approved' (accepted), 'sent' (in transit), 'received' (completed), 'rejected' (cancelled)
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'sent', 'received', 'rejected')),
    
    -- Notes
    catatan TEXT,
    catatan_reject TEXT,
    
    -- User tracking
    requested_by VARCHAR(100),
    approved_by VARCHAR(100),
    sent_by VARCHAR(100),
    received_by VARCHAR(100),
    
    -- Timestamps for each stage
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_kirim_barang_from_store ON kirim_barang(from_store);
CREATE INDEX IF NOT EXISTS idx_kirim_barang_to_store ON kirim_barang(to_store);
CREATE INDEX IF NOT EXISTS idx_kirim_barang_status ON kirim_barang(status);
CREATE INDEX IF NOT EXISTS idx_kirim_barang_created_at ON kirim_barang(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kirim_barang_part_number ON kirim_barang(part_number);

-- Enable Row Level Security
ALTER TABLE kirim_barang ENABLE ROW LEVEL SECURITY;

-- Create policy for full access (adjust as needed)
CREATE POLICY "Allow all operations on kirim_barang" ON kirim_barang
    FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- FUNCTION: Update timestamp on kirim_barang update
-- =====================================================
CREATE OR REPLACE FUNCTION update_kirim_barang_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_update_kirim_barang_timestamp ON kirim_barang;
CREATE TRIGGER trigger_update_kirim_barang_timestamp
    BEFORE UPDATE ON kirim_barang
    FOR EACH ROW
    EXECUTE FUNCTION update_kirim_barang_updated_at();

-- =====================================================
-- SAMPLE QUERIES (for reference)
-- =====================================================
-- Get pending requests to BJW from MJM:
-- SELECT * FROM kirim_barang WHERE to_store = 'bjw' AND status = 'pending';

-- Get all transfers for a store:
-- SELECT * FROM kirim_barang WHERE from_store = 'mjm' OR to_store = 'mjm';

-- Get transfer history:
-- SELECT * FROM kirim_barang WHERE status = 'received' ORDER BY received_at DESC;
