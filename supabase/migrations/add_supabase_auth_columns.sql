-- =====================================================================
-- ALTIFLOW — Supabase Auth Integration Migration
-- =====================================================================
-- Run this in the Supabase SQL Editor BEFORE enabling SUPABASE_AUTH_ENABLED.
-- (Dashboard ? SQL Editor ? New query ? paste ? Run.)
-- Safe to run on existing databases — all changes use IF NOT EXISTS / DO NOTHING.
-- =====================================================================

-- 1) Add supabase_auth_id column to link public.users -> auth.users
--    Nullable: existing users stay NULL until migration is triggered.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS supabase_auth_id UUID UNIQUE;

-- 2) Add auth_provider column to track which system is authoritative for this user.
--    'custom' = bcrypt password in public.users (all existing users)
--    'supabase' = Supabase Auth is primary (post-migration)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'custom';

-- Add CHECK constraint if it doesn't already exist (safe via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users'
      AND table_schema = 'public'
      AND constraint_name = 'users_auth_provider_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_auth_provider_check
      CHECK (auth_provider IN ('custom', 'supabase'));
  END IF;
END $$;

-- Index for fast lookups by supabase_auth_id (sparse)
CREATE INDEX IF NOT EXISTS users_supabase_auth_id_idx
  ON public.users (supabase_auth_id)
  WHERE supabase_auth_id IS NOT NULL;

-- Index for filtering by auth_provider
CREATE INDEX IF NOT EXISTS users_auth_provider_idx
  ON public.users (auth_provider);

-- =====================================================================
-- 3) Auth Migration Log — tracks per-user migration progress
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.auth_migration_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  supabase_auth_id UUID,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'migrated', 'failed', 'invited', 'skipped')),
  error_message    TEXT,
  migrated_at      TIMESTAMPTZ,
  invite_sent_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_migration_log_user_idx
  ON public.auth_migration_log (user_id);

CREATE INDEX IF NOT EXISTS auth_migration_log_status_idx
  ON public.auth_migration_log (status);

ALTER TABLE public.auth_migration_log ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- Done.
-- After running this migration:
--   1. All existing users retain auth_provider='custom' and supabase_auth_id=NULL
--   2. Set SUPABASE_AUTH_ENABLED=false in .env.local (default - no change in behavior)
--   3. When ready to migrate, use the Super-Admin migration API:
--      POST /api/admin/auth-migration/migrate-all
-- =====================================================================
