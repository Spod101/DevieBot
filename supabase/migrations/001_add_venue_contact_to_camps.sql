-- Migration: add venue and contact_person columns to code_camps
-- Run this in your Supabase SQL editor

alter table code_camps
  add column if not exists venue text,
  add column if not exists contact_person text;

-- Optional: migrate existing description-encoded data
-- If you previously stored "Venue | Contact" in the description field, run:
--
-- update code_camps
-- set
--   venue        = trim(split_part(description, '|', 1)),
--   contact_person = trim(split_part(description, '|', 2))
-- where description like '%|%';
