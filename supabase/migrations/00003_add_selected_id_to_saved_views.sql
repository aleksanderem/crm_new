-- Add selected_id column to saved_views table
-- This stores the ID of the currently selected item shown in sidebar (e.g., document ID)

ALTER TABLE saved_views ADD COLUMN selected_id TEXT;

-- Create an index on selected_id for faster lookups
CREATE INDEX idx_saved_views_selected_id ON saved_views (selected_id);
