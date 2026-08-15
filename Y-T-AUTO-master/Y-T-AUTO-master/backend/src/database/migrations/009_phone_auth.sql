-- Migration 009: Verified phone identities, browser-bound OTP challenges, and persistent abuse controls.
-- Migration 005 remains immutable applied history; these tables supersede its limited OTP model.

ALTER TABLE users ADD COLUMN email_is_placeholder INTEGER NOT NULL DEFAULT 0
  CHECK(email_is_placeholder IN (0, 1));

CREATE TABLE user_phone_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  phone_e164 TEXT NOT NULL UNIQUE
    CHECK(
      length(phone_e164) BETWEEN 8 AND 16 AND
      phone_e164 GLOB '+[1-9][0-9]*' AND
      substr(phone_e164, 2) NOT GLOB '*[^0-9]*'
    ),
  verified_at INTEGER NOT NULL CHECK(verified_at > 0),
  created_at INTEGER NOT NULL CHECK(created_at > 0),
  updated_at INTEGER NOT NULL CHECK(updated_at >= created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_phone_identities_user
  ON user_phone_identities(user_id);

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
  purpose TEXT NOT NULL CHECK(purpose IN ('LOGIN', 'LINK')),
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
    (purpose = 'LOGIN' AND target_user_id IS NULL) OR
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

CREATE TABLE phone_auth_rate_limits (
  bucket_key TEXT PRIMARY KEY
    CHECK(length(bucket_key) = 64 AND bucket_key NOT GLOB '*[^0-9a-f]*'),
  domain TEXT NOT NULL CHECK(length(domain) BETWEEN 1 AND 100),
  window_start INTEGER NOT NULL CHECK(window_start >= 0),
  window_end INTEGER NOT NULL CHECK(window_end > window_start),
  request_count INTEGER NOT NULL CHECK(request_count > 0),
  created_at INTEGER NOT NULL CHECK(created_at >= 0),
  updated_at INTEGER NOT NULL CHECK(updated_at >= created_at AND updated_at < window_end)
);

CREATE INDEX idx_phone_auth_rate_limits_window_end
  ON phone_auth_rate_limits(window_end, bucket_key);
CREATE INDEX idx_phone_auth_rate_limits_domain_window
  ON phone_auth_rate_limits(domain, window_end);
