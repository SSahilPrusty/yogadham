-- =============================================
-- Yogadham Full Database Setup
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- 1. Create / update the gallery table (with event linking support)
CREATE TABLE IF NOT EXISTS gallery (
  id serial PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  media_url text NOT NULL,
  media_type text DEFAULT 'image',
  event_id integer REFERENCES events(id) ON DELETE SET NULL,
  custom_category text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Add event_id and custom_category columns if they don't exist yet
ALTER TABLE gallery ADD COLUMN IF NOT EXISTS event_id integer REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE gallery ADD COLUMN IF NOT EXISTS custom_category text DEFAULT '';

-- 2. Create the disease_solutions table
CREATE TABLE IF NOT EXISTS disease_solutions (
  id serial PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  media_url text NOT NULL,
  media_type text DEFAULT 'video',
  created_at timestamptz DEFAULT now()
);

-- 3. Disable RLS on both tables so the backend can access them
ALTER TABLE gallery DISABLE ROW LEVEL SECURITY;
ALTER TABLE disease_solutions DISABLE ROW LEVEL SECURITY;

-- 4. Grant permissions
GRANT SELECT ON gallery TO anon;
GRANT ALL ON gallery TO service_role;
GRANT USAGE, SELECT ON SEQUENCE gallery_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE gallery_id_seq TO service_role;

GRANT SELECT ON disease_solutions TO anon;
GRANT ALL ON disease_solutions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE disease_solutions_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE disease_solutions_id_seq TO service_role;
