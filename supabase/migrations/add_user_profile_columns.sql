-- =====================================================================
-- ALTIFLOW — User Profile Columns Migration
-- =====================================================================
-- Run this in the Supabase SQL Editor.
-- Safe to run on existing databases — uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- =====================================================================

-- Add profile fields to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT,
  ADD COLUMN IF NOT EXISTS phone      TEXT;

-- Index for name searches (optional but helpful for large user lists)
CREATE INDEX IF NOT EXISTS users_first_name_idx ON public.users (lower(first_name)) WHERE first_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_last_name_idx  ON public.users (lower(last_name))  WHERE last_name  IS NOT NULL;

-- =====================================================================
-- Done.
-- Existing users retain NULL for first_name, last_name, phone.
-- These fields are optional for Owner roles, optional for Client roles
-- (email is the required field for Client roles, not phone).
-- =====================================================================
