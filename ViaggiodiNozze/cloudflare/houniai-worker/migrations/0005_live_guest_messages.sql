-- Public LIVE guestbook: additive, intentionally independent of Firebase writes.
CREATE TABLE IF NOT EXISTS live_guest_messages (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_live_guest_messages_trip_created
  ON live_guest_messages(trip_id, created_at DESC);
