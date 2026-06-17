-- =============================================
-- Yogadham Gallery Table Setup
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- 1. Create the gallery table
CREATE TABLE IF NOT EXISTS gallery (
  id serial PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  media_url text NOT NULL,
  media_type text DEFAULT 'image',
  created_at timestamptz DEFAULT now()
);

-- 2. Disable RLS (Row Level Security) so the table is accessible
ALTER TABLE gallery DISABLE ROW LEVEL SECURITY;

-- 3. (Optional) If you want RLS enabled with policies instead, 
--    comment out the line above and uncomment the block below:
--
-- ALTER TABLE gallery ENABLE ROW LEVEL SECURITY;
--
-- -- Allow anyone to read gallery items
-- CREATE POLICY "Public read access" ON gallery
--   FOR SELECT USING (true);
--
-- -- Allow service_role to insert/update/delete
-- CREATE POLICY "Service role full access" ON gallery
--   FOR ALL USING (auth.role() = 'service_role');

-- 4. Grant public read access to the anon role (needed for PostgREST)
GRANT SELECT ON gallery TO anon;
GRANT ALL ON gallery TO service_role;
GRANT USAGE, SELECT ON SEQUENCE gallery_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE gallery_id_seq TO service_role;
