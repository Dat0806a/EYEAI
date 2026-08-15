-- Migration 006: Preserve multiple OAuth provider identities per user.
DROP INDEX IF EXISTS idx_users_provider_sub;

CREATE TABLE IF NOT EXISTS user_oauth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('GOOGLE', 'FACEBOOK')),
  provider_sub TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_sub),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_user
  ON user_oauth_identities(user_id);

INSERT OR IGNORE INTO user_oauth_identities (id, user_id, provider, provider_sub)
SELECT id || ':' || lower(auth_provider), id, auth_provider, provider_sub
FROM users
WHERE auth_provider IN ('GOOGLE', 'FACEBOOK')
  AND provider_sub IS NOT NULL;
