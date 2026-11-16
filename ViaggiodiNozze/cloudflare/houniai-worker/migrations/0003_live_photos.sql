-- Local proposal only. Existing AI/push tables and counters are untouched.
CREATE TABLE IF NOT EXISTS live_photo_objects (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes > 0 AND bytes <= 512000),
  status TEXT NOT NULL CHECK(status IN ('pending','published','deleted','failed')),
  created_at INTEGER NOT NULL,
  post_id TEXT
);
CREATE INDEX IF NOT EXISTS live_photo_created ON live_photo_objects(created_at);
CREATE INDEX IF NOT EXISTS live_photo_owner_created ON live_photo_objects(owner_hash, created_at);
CREATE TABLE IF NOT EXISTS live_photo_requests (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS live_photo_request_expiry ON live_photo_requests(expires_at);
