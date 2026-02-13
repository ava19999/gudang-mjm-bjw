-- Migration: Add for_months column to toko_pembayaran to track due-month

ALTER TABLE IF EXISTS toko_pembayaran
ADD COLUMN IF NOT EXISTS for_months VARCHAR(7);

-- Index to speed up month filtering
CREATE INDEX IF NOT EXISTS idx_toko_pembayaran_for_months ON toko_pembayaran(for_months);

COMMENT ON COLUMN toko_pembayaran.for_months IS 'Month (YYYY-MM) of the invoice due that this payment settles';
