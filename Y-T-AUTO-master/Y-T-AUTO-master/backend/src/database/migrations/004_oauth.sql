-- Migration 004: OAuth provider identity for users
ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'EMAIL';
ALTER TABLE users ADD COLUMN provider_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_sub ON users(provider_sub) WHERE provider_sub IS NOT NULL;
