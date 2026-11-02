CREATE TABLE IF NOT EXISTS push_subscriptions (
  subscriber_id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  device_id TEXT NOT NULL,
  endpoint_hash TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  preferences_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_trip
  ON push_subscriptions (trip_id, enabled);

CREATE TABLE IF NOT EXISTS push_jobs (
  job_id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  subscriber_id TEXT,
  actor_uid TEXT,
  entity_key TEXT,
  kind TEXT NOT NULL,
  event_at INTEGER,
  lead_minutes INTEGER,
  due_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_jobs_due
  ON push_jobs (due_at);

CREATE INDEX IF NOT EXISTS idx_push_jobs_entity
  ON push_jobs (trip_id, entity_key);

CREATE TABLE IF NOT EXISTS push_dispatches (
  dispatch_key TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS push_daily_usage (
  usage_day TEXT PRIMARY KEY,
  sent_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
