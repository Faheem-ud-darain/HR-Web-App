-- Saved chats with Del (HR/Admin assistant). Cloudflare D1 database "delcargo-assistant", bound to the
-- Pages project as ASSISTANT_DB. One row per chat; every query filters by owner (the signed-in user's e-mail).
CREATE TABLE IF NOT EXISTS assistant_chats (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  messages TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assistant_chats_owner_updated ON assistant_chats (owner, updated);
