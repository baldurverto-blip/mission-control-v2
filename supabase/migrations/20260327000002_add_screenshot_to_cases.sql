-- Add screenshot_data column to cases for Vera screen-share feature.
-- Stores a compressed JPEG as a base64 data URL (typically 100-400 KB).
alter table cases add column if not exists screenshot_data text;
