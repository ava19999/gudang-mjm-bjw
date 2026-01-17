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

-- Add comment for documentation
COMMENT ON COLUMN scan_resi_mjm.status_packing IS 'Packing status: unpacked, packed, shipped';
COMMENT ON COLUMN scan_resi_mjm.order_type IS 'Order type: shopee, tiktok, reseller, export';
COMMENT ON COLUMN scan_resi_mjm.is_variation IS 'Whether this is a product variation (e.g., left/right)';
COMMENT ON COLUMN scan_resi_mjm.parent_resi IS 'Parent Resi number if this is a variation';

COMMENT ON COLUMN scan_resi_bjw.status_packing IS 'Packing status: unpacked, packed, shipped';
COMMENT ON COLUMN scan_resi_bjw.order_type IS 'Order type: shopee, tiktok, reseller, export';
COMMENT ON COLUMN scan_resi_bjw.is_variation IS 'Whether this is a product variation (e.g., left/right)';
COMMENT ON COLUMN scan_resi_bjw.parent_resi IS 'Parent Resi number if this is a variation';
