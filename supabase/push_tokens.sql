-- AltiFlow push_tokens table for mobile push notifications
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  device_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user lookup when sending notifications
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);

-- RLS: enable (using service role key from backend only)
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE push_tokens IS 'Stores Expo push notification tokens for the AltiFlow mobile app.';
