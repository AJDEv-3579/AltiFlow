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
-- Roles: Super-Admin > Admin > Client-Admin > Client-User
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username                TEXT UNIQUE NOT NULL,
  password_hash           TEXT NOT NULL,
  passcode_key_hash       TEXT,
  passcode_key_ext        TEXT,
  passcode_key_created_at TIMESTAMPTZ,
  role                    TEXT NOT NULL CHECK (role IN ('Super-Admin', 'Admin', 'Client-Admin', 'Client-User')),
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
-- NOTE: Avoid expression index on (upload_timestamp::date) because timestamptz->date
-- cast is not IMMUTABLE in Postgres and fails in Supabase SQL editor.
-- Use range filtering on upload_timestamp with this composite index instead.
CREATE INDEX IF NOT EXISTS projects_client_upload_ts_idx ON public.projects (client_id, upload_timestamp DESC);

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

INSERT INTO public.system_state (key, value)
VALUES ('job_admin_rr_index', 0)
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
-- 8) USER_PROJECTS — junction table for Client-User ↔ Project assignment
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, project_id)
);

CREATE INDEX IF NOT EXISTS user_projects_user_idx    ON public.user_projects (user_id);
CREATE INDEX IF NOT EXISTS user_projects_project_idx ON public.user_projects (project_id);

ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 9) DELETE_REQUESTS — Client-Admin requests, Super-Admin approves
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.delete_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_by   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  reviewed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS delete_requests_status_idx ON public.delete_requests (status);

ALTER TABLE public.delete_requests ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 10) SUPPORT_TICKETS — App-level support issues (not project issue tracker)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'Medium' CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  status          TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),
  resolution_note TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_client_idx ON public.support_tickets (client_id);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- Done. Restart the Next.js app — it will auto-seed:
--   • Super-Admin: devbond01 / 63pk0wpT@123
-- Additional users are created manually via the Super-Admin panel.
-- =====================================================================

-- =====================================================================
-- 11) CLIENT_PROJECTS — Project workspaces managed by Client-Admin
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.client_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,
  start_date   DATE NOT NULL,
  end_date     DATE,
  head         TEXT NOT NULL,
  created_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_projects_client_id_idx ON public.client_projects (client_id);

ALTER TABLE public.client_projects ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 12) JOBS — Tasks inside a client_project
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Done', 'Blocked')),
  sc_status    TEXT NOT NULL DEFAULT 'Pending' CHECK (sc_status  IN ('Pending', 'In Progress', 'Done', 'Blocked')),
  uni_status   TEXT NOT NULL DEFAULT 'Pending' CHECK (uni_status IN ('Pending', 'In Progress', 'Done', 'Blocked')),
  category     TEXT NOT NULL DEFAULT 'Stand Count' CHECK (category IN ('Stand Count', 'Uniformity')),
  -- Field capture metadata
  capture_date DATE,
  drone_name   TEXT,
  flight_count INTEGER  NOT NULL DEFAULT 1,
  flights      JSONB    NOT NULL DEFAULT '[]'::jsonb,
  has_logs     BOOLEAN  NOT NULL DEFAULT false,
  comments     TEXT,
  -- Relations
  assigned_to  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_project_id_idx ON public.jobs (project_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx     ON public.jobs (status);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 13) JOB_COMMENTS — Stage-wise comment timeline for job cards
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.job_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  username    TEXT,
  stage       TEXT NOT NULL DEFAULT 'General',
  comment     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_comments_job_id_idx ON public.job_comments (job_id);
CREATE INDEX IF NOT EXISTS job_comments_created_at_idx ON public.job_comments (created_at DESC);

ALTER TABLE public.job_comments ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 14) RECYCLE_BIN — Super-Admin restore center for deleted records
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.recycle_bin (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type          TEXT NOT NULL,
  table_name           TEXT NOT NULL,
  entity_id            UUID NOT NULL,
  payload              JSONB NOT NULL,
  deleted_by           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_by_username  TEXT,
  deleted_at           TIMESTAMPTZ DEFAULT now(),
  restored_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  restored_by_username TEXT,
  restored_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS recycle_bin_deleted_at_idx ON public.recycle_bin (deleted_at DESC);
CREATE INDEX IF NOT EXISTS recycle_bin_entity_idx ON public.recycle_bin (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS recycle_bin_restored_idx ON public.recycle_bin (restored_at);

ALTER TABLE public.recycle_bin ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 15) ENTITY_DELETE_REQUESTS — Role-based delete approval workflow
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.entity_delete_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type           TEXT NOT NULL CHECK (entity_type IN ('job', 'client_project', 'project')),
  entity_id             UUID NOT NULL,
  table_name            TEXT NOT NULL,
  client_id             UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  requested_by          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_by_username TEXT,
  requested_by_role     TEXT NOT NULL,
  target_role           TEXT NOT NULL CHECK (target_role IN ('Client-Admin', 'Super-Admin')),
  reason                TEXT,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_by_username  TEXT,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_delete_requests_status_idx ON public.entity_delete_requests (status, target_role);
CREATE INDEX IF NOT EXISTS entity_delete_requests_entity_idx ON public.entity_delete_requests (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS entity_delete_requests_client_idx ON public.entity_delete_requests (client_id, status);

ALTER TABLE public.entity_delete_requests ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 16) PASSWORD_RESET_CODES — Super-Admin generated passcodes for forgot-password flow
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.password_reset_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  attempts    INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_codes_user_idx ON public.password_reset_codes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_codes_expiry_idx ON public.password_reset_codes (expires_at);

ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;

-- Migration: run these if the table already exists (run each line separately)
-- ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS sc_status    TEXT NOT NULL DEFAULT 'Pending' CHECK (sc_status  IN ('Pending', 'In Progress', 'Done', 'Blocked'));
-- ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS uni_status   TEXT NOT NULL DEFAULT 'Pending' CHECK (uni_status IN ('Pending', 'In Progress', 'Done', 'Blocked'));
-- ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS capture_date DATE;
-- ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS drone_name   TEXT;
-- ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS flight_count INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS flights      JSONB   NOT NULL DEFAULT '[]'::jsonb;
-- ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS has_logs     BOOLEAN NOT NULL DEFAULT false;
-- ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS comments     TEXT;
-- ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS category     TEXT NOT NULL DEFAULT 'Stand Count' CHECK (category IN ('Stand Count', 'Uniformity'));
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS passcode_key_hash       TEXT;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS passcode_key_ext        TEXT;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS passcode_key_created_at TIMESTAMPTZ;
-- CREATE TABLE IF NOT EXISTS public.password_reset_codes (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
--   code_hash TEXT NOT NULL,
--   expires_at TIMESTAMPTZ NOT NULL,
--   created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
--   attempts INT NOT NULL DEFAULT 0,
--   consumed_at TIMESTAMPTZ,
--   created_at TIMESTAMPTZ DEFAULT now()
-- );

