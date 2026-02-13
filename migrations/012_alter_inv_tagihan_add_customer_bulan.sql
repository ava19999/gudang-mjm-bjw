-- Migration: add customer and jatuh tempo fields to inv_tagihan for printed-label tracking

ALTER TABLE IF EXISTS inv_tagihan
ADD COLUMN IF NOT EXISTS customer TEXT,
ADD COLUMN IF NOT EXISTS tempo TEXT,
ADD COLUMN IF NOT EXISTS jatuh_tempo_bulan CHAR(7);

-- Indexes for faster lookup
CREATE INDEX IF NOT EXISTS idx_inv_tagihan_customer ON inv_tagihan(customer);
CREATE INDEX IF NOT EXISTS idx_inv_tagihan_bulan ON inv_tagihan(jatuh_tempo_bulan);
CREATE INDEX IF NOT EXISTS idx_inv_tagihan_store ON inv_tagihan(toko);
