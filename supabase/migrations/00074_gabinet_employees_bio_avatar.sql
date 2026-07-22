-- Add bio and avatar_url columns to gabinet_employees
ALTER TABLE gabinet_employees
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
