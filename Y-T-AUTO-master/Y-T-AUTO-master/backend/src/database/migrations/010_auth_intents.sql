-- Migration 010: Bind every OAuth and phone proof to explicit LOGIN, REGISTER, or LINK intent.
-- Pending ephemeral attempts are intentionally invalidated because older rows cannot be safely upgraded.
DROP TABLE oauth_authorization_states;
DROP TABLE oauth_callback_codes;
DROP TABLE phone_otp_challenges;

CREATE TABLE oauth_authorization_states (
  state_hash TEXT PRIMARY KEY,
  binding_hash TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('GOOGLE', 'FACEBOOK')),
  purpose TEXT NOT NULL CHECK(purpose IN ('LOGIN', 'REGISTER', 'LINK')),
  user_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK(
    (purpose IN ('LOGIN', 'REGISTER') AND user_id IS NULL) OR
    (purpose = 'LINK' AND user_id IS NOT NULL)
  )
);

CREATE INDEX idx_oauth_authorization_states_expires_at
  ON oauth_authorization_states(expires_at);
CREATE INDEX idx_oauth_authorization_states_created_at
  ON oauth_authorization_states(created_at, state_hash);

CREATE TABLE oauth_callback_codes (
  code_hash TEXT PRIMARY KEY,
  binding_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('LOGIN', 'REGISTER', 'LINK')),
  result_kind TEXT NOT NULL CHECK(result_kind IN ('SESSION', 'ERROR')),
  user_id TEXT,
  error_code TEXT CHECK(
    error_code IS NULL OR error_code IN (
      'INVALID_OAUTH_STATE',
      'OAUTH_PROVIDER_FAILED',
      'OAUTH_EMAIL_LINK_REQUIRED',
      'OAUTH_IDENTITY_CONFLICT',
      'LOGIN_REQUIRED',
      'REGISTRATION_REQUIRED'
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

CREATE TABLE phone_otp_challenges (
  challenge_hash TEXT PRIMARY KEY
    CHECK(length(challenge_hash) = 64 AND challenge_hash NOT GLOB '*[^0-9a-f]*'),
  binding_hash TEXT NOT NULL
    CHECK(length(binding_hash) = 64 AND binding_hash NOT GLOB '*[^0-9a-f]*'),
  phone_e164 TEXT NOT NULL
    CHECK(
      length(phone_e164) BETWEEN 8 AND 16 AND
      phone_e164 GLOB '+[1-9][0-9]*' AND
      substr(phone_e164, 2) NOT GLOB '*[^0-9]*'
    ),
  purpose TEXT NOT NULL CHECK(purpose IN ('LOGIN', 'REGISTER', 'LINK')),
  target_user_id TEXT,
  code_mac TEXT
    CHECK(code_mac IS NULL OR (length(code_mac) = 64 AND code_mac NOT GLOB '*[^0-9a-f]*')),
  status TEXT NOT NULL
    CHECK(status IN ('PENDING_SEND', 'SENT', 'SEND_FAILED', 'LOCKED', 'CONSUMED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  max_attempts INTEGER NOT NULL CHECK(max_attempts > 0 AND attempts <= max_attempts),
  expires_at INTEGER NOT NULL,
  resend_available_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL CHECK(created_at > 0),
  sent_at INTEGER,
  failed_at INTEGER,
  locked_at INTEGER,
  consumed_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK(
    (purpose IN ('LOGIN', 'REGISTER') AND target_user_id IS NULL) OR
    (purpose = 'LINK' AND target_user_id IS NOT NULL)
  ),
  CHECK(expires_at > created_at),
  CHECK(resend_available_at >= created_at AND resend_available_at <= expires_at),
  CHECK(updated_at >= created_at),
  CHECK(sent_at IS NULL OR sent_at >= created_at),
  CHECK(failed_at IS NULL OR failed_at >= created_at),
  CHECK(locked_at IS NULL OR locked_at >= created_at),
  CHECK(consumed_at IS NULL OR consumed_at >= created_at),
  CHECK(
    (status = 'PENDING_SEND' AND code_mac IS NOT NULL AND sent_at IS NULL AND failed_at IS NULL AND locked_at IS NULL AND consumed_at IS NULL) OR
    (status = 'SENT' AND code_mac IS NOT NULL AND sent_at IS NOT NULL AND failed_at IS NULL AND locked_at IS NULL AND consumed_at IS NULL) OR
    (status = 'SEND_FAILED' AND code_mac IS NULL AND sent_at IS NULL AND failed_at IS NOT NULL AND locked_at IS NULL AND consumed_at IS NULL) OR
    (status = 'LOCKED' AND code_mac IS NULL AND sent_at IS NOT NULL AND failed_at IS NULL AND locked_at IS NOT NULL AND consumed_at IS NULL AND attempts = max_attempts) OR
    (status = 'CONSUMED' AND code_mac IS NULL AND sent_at IS NOT NULL AND failed_at IS NULL AND locked_at IS NULL AND consumed_at IS NOT NULL)
  )
);

CREATE INDEX idx_phone_otp_challenges_phone_scope
  ON phone_otp_challenges(phone_e164, purpose, target_user_id, created_at DESC);
CREATE INDEX idx_phone_otp_challenges_expires_at
  ON phone_otp_challenges(expires_at);
CREATE INDEX idx_phone_otp_challenges_status_created_at
  ON phone_otp_challenges(status, created_at, challenge_hash);
