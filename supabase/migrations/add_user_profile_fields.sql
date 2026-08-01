-- =====================================================================
-- ALTIFLOW — User Profile Fields Migration
-- =====================================================================
-- Adds first_name, last_name, and phone columns to public.users table.
-- Safe to run multiple times — uses IF NOT EXISTS.
-- =====================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT,
  ADD COLUMN IF NOT EXISTS phone      TEXT;

-- Index for full-name search if needed
CREATE INDEX IF NOT EXISTS users_names_idx ON public.users (lower(first_name), lower(last_name));
