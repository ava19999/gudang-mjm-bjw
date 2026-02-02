-- ============================================================================
-- Migration: 009_ensure_foto_table_rls
-- Date: 2025-01-14
-- Description: Ensure foto table exists and RLS policies are correct
-- ============================================================================

-- Create foto table if not exists
CREATE TABLE IF NOT EXISTS foto (
    id SERIAL PRIMARY KEY,
    part_number VARCHAR(100) UNIQUE NOT NULL,
    foto_1 TEXT,
    foto_2 TEXT,
    foto_3 TEXT,
    foto_4 TEXT,
    foto_5 TEXT,
    foto_6 TEXT,
    foto_7 TEXT,
    foto_8 TEXT,
    foto_9 TEXT,
    foto_10 TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index untuk pencarian berdasarkan part_number
CREATE INDEX IF NOT EXISTS idx_foto_part_number ON foto(part_number);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE foto ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow public read foto" ON foto;
DROP POLICY IF EXISTS "Allow public insert foto" ON foto;
DROP POLICY IF EXISTS "Allow public update foto" ON foto;
DROP POLICY IF EXISTS "Allow public delete foto" ON foto;
DROP POLICY IF EXISTS "Allow all operations on foto" ON foto;

-- Create permissive policy for all operations
CREATE POLICY "Allow all operations on foto" 
    ON foto 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Or if you prefer separate policies:
-- CREATE POLICY "Allow public read foto" ON foto FOR SELECT USING (true);
-- CREATE POLICY "Allow public insert foto" ON foto FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Allow public update foto" ON foto FOR UPDATE USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow public delete foto" ON foto FOR DELETE USING (true);

-- ============================================================================
-- VERIFY TABLE
-- ============================================================================

-- Check if table exists and show structure
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'foto'
ORDER BY ordinal_position;

-- Check existing data count
SELECT COUNT(*) as total_rows FROM foto;
