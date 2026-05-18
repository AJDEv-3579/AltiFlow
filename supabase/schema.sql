-- =====================================================================
-- ALTIFLOW — Supabase Postgres Schema
-- =====================================================================
-- Run this entire file ONCE in the Supabase SQL Editor.
-- (Dashboard → SQL Editor → New query → paste → Run.)
-- =====================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1) CLIENTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  logo_url     TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- 2) USERS (Altiflow profile table — uses bcrypt password_hash)
-- Distinct from Supabase Auth's auth.users.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username                TEXT UNIQUE NOT NULL,
  password_hash           TEXT NOT NULL,
  role                    TEXT NOT NULL CHECK (role IN ('Admin', 'Team', 'Client')),
  client_id               UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  must_change_password    BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_username_idx ON public.users (lower(username));
CREATE INDEX IF NOT EXISTS users_role_idx ON public.users (role);

-- =====================================================================
-- 3) PROJECTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  drone_name              TEXT NOT NULL,
  capture_date            DATE NOT NULL,
  upload_timestamp        TIMESTAMPTZ NOT NULL DEFAULT now(),  -- server-locked
  image_count             INT NOT NULL,
  csv_count               INT NOT NULL,
  base_rover_bool         BOOLEAN NOT NULL DEFAULT false,
  grid_file_bool          BOOLEAN NOT NULL DEFAULT false,
  status                  TEXT NOT NULL DEFAULT 'Pending'
                          CHECK (status IN ('Pending','In-Download','QC','Processing','Delivery','Failed_Refly')),
  assigned_to             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sla_deadline            TIMESTAMPTZ,
  sla_hours               INT,
  sla_daily_count         INT,
  refly_reason            TEXT,
  issue_note              TEXT,
  issue_photo             TEXT,        -- data-url for MVP; swap to Storage URL later
  refly_resolved          BOOLEAN DEFAULT false,
  delivery_confirmed      BOOLEAN DEFAULT false,
  delivery_confirmed_at   TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_client_id_idx     ON public.projects (client_id);
CREATE INDEX IF NOT EXISTS projects_status_idx         ON public.projects (status);
CREATE INDEX IF NOT EXISTS projects_upload_ts_idx      ON public.projects (upload_timestamp DESC);
CREATE INDEX IF NOT EXISTS projects_client_day_idx     ON public.projects (client_id, (upload_timestamp::date));

-- =====================================================================
-- 4) AUDIT LOGS (immutable)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  username     TEXT,
  action_desc  TEXT NOT NULL,
  timestamp    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_project_idx ON public.audit_logs (project_id);
CREATE INDEX IF NOT EXISTS audit_logs_ts_idx      ON public.audit_logs (timestamp DESC);

-- =====================================================================
-- 5) SYSTEM STATE (single-row counters for round-robin etc.)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.system_state (
  key    TEXT PRIMARY KEY,
  value  INT NOT NULL DEFAULT 0
);
INSERT INTO public.system_state (key, value)
VALUES ('refly_rr_index', 0)
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- 6) Postgres function: atomic round-robin increment
-- =====================================================================
CREATE OR REPLACE FUNCTION public.next_rr_index()
RETURNS INT AS $$
DECLARE
  current_val INT;
BEGIN
  UPDATE public.system_state
     SET value = value + 1
   WHERE key = 'refly_rr_index'
   RETURNING value - 1 INTO current_val;
  RETURN current_val;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 7) Row Level Security (optional — server uses service_role and
--    bypasses RLS; enable + lock down anon read for safety)
-- =====================================================================
ALTER TABLE public.clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;

-- Default: deny everything for anon and authenticated roles.
-- (Service role bypasses RLS automatically.)

-- =====================================================================
-- Done. Restart the Next.js app — it will auto-seed:
--   • Admin:  devbond01 / 63pk0wpT@123
--   • Team:   Rohit, Shalini, Advik / WelcometoAlti@123
--   • Client: bayer / WelcometoAlti@123  (Bayer client)
-- =====================================================================
