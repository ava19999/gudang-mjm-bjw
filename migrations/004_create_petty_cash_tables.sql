-- Migration 004: Create separate petty_cash tables for each store
-- Tables: petty_cash_mjm (store MJM) and petty_cash_bjw (store BJW)
-- Run this in Supabase SQL Editor

-- Create petty_cash_mjm table
CREATE TABLE IF NOT EXISTS petty_cash_mjm (
  id TEXT PRIMARY KEY,
  tgl TIMESTAMPTZ DEFAULT NOW(),
  keterangan TEXT,
  type TEXT NOT NULL, -- 'in' atau 'out'
  akun TEXT DEFAULT 'cash', -- 'cash' atau 'bank'
  saldokeluarmasuk NUMERIC DEFAULT 0,
  saldosaatini NUMERIC DEFAULT 0
);

-- Create petty_cash_bjw table
CREATE TABLE IF NOT EXISTS petty_cash_bjw (
  id TEXT PRIMARY KEY,
  tgl TIMESTAMPTZ DEFAULT NOW(),
  keterangan TEXT,
  type TEXT NOT NULL, -- 'in' atau 'out'
  akun TEXT DEFAULT 'cash', -- 'cash' atau 'bank'
  saldokeluarmasuk NUMERIC DEFAULT 0,
  saldosaatini NUMERIC DEFAULT 0
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_petty_cash_mjm_akun ON petty_cash_mjm(akun);
CREATE INDEX IF NOT EXISTS idx_petty_cash_mjm_tgl ON petty_cash_mjm(tgl);
CREATE INDEX IF NOT EXISTS idx_petty_cash_bjw_akun ON petty_cash_bjw(akun);
CREATE INDEX IF NOT EXISTS idx_petty_cash_bjw_tgl ON petty_cash_bjw(tgl);

-- Enable RLS (Row Level Security) if needed
-- ALTER TABLE petty_cash_mjm ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE petty_cash_bjw ENABLE ROW LEVEL SECURITY;

-- Note: 
-- Valid values for 'akun' are 'cash' (Kas) and 'bank' (Rekening)
-- Valid values for 'type' are 'in' (uang masuk) and 'out' (uang keluar)
