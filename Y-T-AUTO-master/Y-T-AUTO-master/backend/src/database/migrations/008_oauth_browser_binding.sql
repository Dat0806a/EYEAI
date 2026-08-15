-- Migration 008: Bind ephemeral OAuth state and callback codes to one browser.
-- Existing rows cannot be upgraded safely because no trustworthy binding exists.
DROP TABLE oauth_authorization_states;
DROP TABLE oauth_callback_codes;

CREATE TABLE oauth_authorization_states (
  state_hash TEXT PRIMARY KEY,
  binding_hash TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('GOOGLE', 'FACEBOOK')),
  purpose TEXT NOT NULL CHECK(purpose IN ('LOGIN', 'LINK')),
  user_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK((purpose = 'LOGIN' AND user_id IS NULL) OR (purpose = 'LINK' AND user_id IS NOT NULL))
);

CREATE INDEX idx_oauth_authorization_states_expires_at
  ON oauth_authorization_states(expires_at);
CREATE INDEX idx_oauth_authorization_states_created_at
  ON oauth_authorization_states(created_at, state_hash);

CREATE TABLE oauth_callback_codes (
  code_hash TEXT PRIMARY KEY,
  binding_hash TEXT NOT NULL,
  result_kind TEXT NOT NULL CHECK(result_kind IN ('SESSION', 'ERROR')),
  user_id TEXT,
  error_code TEXT CHECK(
    error_code IS NULL OR error_code IN (
      'INVALID_OAUTH_STATE',
      'OAUTH_PROVIDER_FAILED',
      'OAUTH_EMAIL_LINK_REQUIRED',
      'OAUTH_IDENTITY_CONFLICT'
    )
  ),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK(
    (result_kind = 'SESSION' AND user_id IS NOT NULL AND error_code IS NULL) OR
    (result_kind = 'ERROR' AND user_id IS NULL AND error_code IS NOT NULL)
  )
);

CREATE INDEX idx_oauth_callback_codes_expires_at
  ON oauth_callback_codes(expires_at);
CREATE INDEX idx_oauth_callback_codes_kind_created_at
  ON oauth_callback_codes(result_kind, created_at, code_hash);
