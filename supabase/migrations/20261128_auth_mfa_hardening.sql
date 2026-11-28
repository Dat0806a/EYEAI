-- =============================================================================
-- EYEAI — SUPABASE AUTHENTICATION, SERVER-MANAGED ROLES & MFA (AAL2) HARDENING
-- Migration: 20261128_auth_mfa_hardening.sql (Security-Fixed Revision)
--
-- IMPORTANT:
-- - Do NOT auto-apply to production without review. Execute manually in
--   Supabase Dashboard -> SQL Editor or via `supabase db push`.
-- - Wrapped in BEGIN ... COMMIT for atomic execution on all public/auth objects.
-- - Preserves all existing ownership RLS policies and adds AS RESTRICTIVE
--   policies + SECURITY DEFINER RPC checks + server-managed role table.
-- - Does NOT trust user-editable `raw_user_meta_data` or unverified `profiles.account_type`
--   during backfill; conflicting/unverified accounts are quarantined into
--   `public.account_role_audit_conflicts` for verification before role elevation.
-- =============================================================================

BEGIN;

-- 1. SERVER-MANAGED ACCOUNT POLICY & ROLE CONFLICT AUDIT TABLES
CREATE TABLE IF NOT EXISTS public.user_account_policies (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL CHECK (account_type IN ('impaired', 'patient')),
  mfa_enforced BOOLEAN NOT NULL DEFAULT FALSE,
  role_verified BOOLEAN NOT NULL DEFAULT TRUE,
  requires_role_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_account_policies
  ADD COLUMN IF NOT EXISTS role_verified BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.user_account_policies
  ADD COLUMN IF NOT EXISTS requires_role_review BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.user_account_policies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_account_policies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_account_policies TO authenticated;

DROP POLICY IF EXISTS "Users can read own account policy" ON public.user_account_policies;
CREATE POLICY "Users can read own account policy"
ON public.user_account_policies FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admin-only conflict/quarantine log (never accessible to anon or authenticated)
CREATE TABLE IF NOT EXISTS public.account_role_audit_conflicts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  app_meta_account_type TEXT NULL,
  legacy_profile_account_type TEXT NULL,
  raw_user_meta_account_type TEXT NULL,
  has_patient_medical_records BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_account_type TEXT NOT NULL CHECK (assigned_account_type IN ('impaired', 'patient')),
  conflict_reason TEXT NOT NULL,
  requires_verification BOOLEAN NOT NULL DEFAULT TRUE,
  resolved_at TIMESTAMPTZ NULL,
  resolved_by TEXT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_role_audit_conflicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_role_audit_conflicts FROM PUBLIC, anon, authenticated;

-- Admin-only pre-migration backup snapshot for lossless rollback (never accessible to anon or authenticated)
CREATE TABLE IF NOT EXISTS public.auth_hardening_migration_backup (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  original_raw_app_meta_data JSONB NULL,
  original_profile_account_type TEXT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.auth_hardening_migration_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_hardening_migration_backup FROM PUBLIC, anon, authenticated;

INSERT INTO public.auth_hardening_migration_backup (
  user_id,
  original_raw_app_meta_data,
  original_profile_account_type
)
SELECT
  u.id,
  u.raw_app_meta_data,
  p.account_type
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ON CONFLICT (user_id) DO NOTHING;

-- Safe Backfill: NEVER trust raw_user_meta_data, unverified profiles.account_type,
-- or existence of medical records (`lab_reports`, `meal_plans`, `exercise_plans`)
-- to verify or elevate 'patient' privileges.
-- Conflicting or unverified rows are quarantined with role_verified = FALSE,
-- requires_role_review = TRUE in `public.account_role_audit_conflicts` until admin review.
DO $$
DECLARE
  r RECORD;
  v_app_type TEXT;
  v_profile_type TEXT;
  v_user_meta_type TEXT;
  v_has_patient_data BOOLEAN;
  v_assigned_type TEXT;
  v_mfa_enforced BOOLEAN;
  v_role_verified BOOLEAN;
  v_requires_review BOOLEAN;
  v_conflict_reason TEXT;
  v_already_resolved BOOLEAN;
BEGIN
  FOR r IN
    SELECT
      u.id AS user_id,
      NULLIF(trim(u.raw_app_meta_data->>'account_type'), '') AS raw_app_type,
      NULLIF(trim(p.account_type), '') AS raw_profile_type,
      NULLIF(trim(COALESCE(u.raw_user_meta_data->>'account_type', u.raw_user_meta_data->>'role')), '') AS raw_user_type,
      (
        EXISTS (SELECT 1 FROM public.lab_reports lr WHERE lr.user_id = u.id)
        OR EXISTS (SELECT 1 FROM public.meal_plans mp WHERE mp.user_id = u.id)
        OR EXISTS (SELECT 1 FROM public.exercise_plans ep WHERE ep.user_id = u.id)
      ) AS has_patient_data
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.user_account_policies up
      WHERE up.user_id = r.user_id
        AND up.role_verified = TRUE
        AND up.requires_role_review = FALSE
    ) INTO v_already_resolved;

    v_app_type := CASE WHEN r.raw_app_type IN ('impaired', 'patient') THEN r.raw_app_type ELSE NULL END;
    v_profile_type := CASE WHEN r.raw_profile_type IN ('impaired', 'patient') THEN r.raw_profile_type ELSE NULL END;
    v_user_meta_type := CASE WHEN r.raw_user_type IN ('impaired', 'patient') THEN r.raw_user_type ELSE NULL END;
    v_has_patient_data := COALESCE(r.has_patient_data, FALSE);
    v_conflict_reason := NULL;
    v_requires_review := FALSE;
    v_role_verified := FALSE;

    IF v_app_type IS NOT NULL THEN
      -- Authoritative server-managed app_metadata exists
      v_assigned_type := v_app_type;
      IF (v_profile_type IS NOT NULL AND v_profile_type <> v_app_type)
         OR (v_user_meta_type IS NOT NULL AND v_user_meta_type <> v_app_type)
         OR (v_app_type = 'impaired' AND v_has_patient_data) THEN
        v_role_verified := FALSE;
        v_requires_review := TRUE;
        v_conflict_reason := 'APP_METADATA_MISMATCH_WITH_PROFILE_OR_USER_META_OR_MEDICAL_DATA';
      ELSE
        v_role_verified := TRUE;
        v_requires_review := FALSE;
      END IF;
    ELSIF v_profile_type = 'patient' THEN
      -- Legacy profiles.account_type was previously user-editable and neither raw_user_meta_data
      -- nor medical records existence may be trusted as authorization proof.
      IF v_user_meta_type = 'impaired' THEN
        v_assigned_type := 'impaired';
        v_role_verified := FALSE;
        v_requires_review := TRUE;
        v_conflict_reason := 'CONFLICT_LEGACY_PROFILE_PATIENT_VS_USER_META_IMPAIRED';
      ELSE
        -- Quarantine legacy 'patient' claim for admin review; keep mfa_enforced = TRUE, block access via role_verified = FALSE
        v_assigned_type := 'patient';
        v_role_verified := FALSE;
        v_requires_review := TRUE;
        v_conflict_reason := 'UNVERIFIED_LEGACY_PROFILE_PATIENT_REQUIRES_ADMIN_REVIEW';
      END IF;
    ELSIF v_profile_type = 'impaired' THEN
      v_assigned_type := 'impaired';
      IF v_user_meta_type = 'patient' OR v_has_patient_data THEN
        v_role_verified := FALSE;
        v_requires_review := TRUE;
        v_conflict_reason := 'CONFLICT_PROFILE_IMPAIRED_WITH_PATIENT_META_OR_MEDICAL_DATA';
      ELSE
        v_role_verified := TRUE;
        v_requires_review := FALSE;
      END IF;
    ELSE
      -- Neither app_metadata nor valid profiles.account_type exists: NEVER trust raw_user_meta_data
      v_assigned_type := 'impaired';
      IF v_user_meta_type = 'patient' OR v_has_patient_data THEN
        v_role_verified := FALSE;
        v_requires_review := TRUE;
        v_conflict_reason := 'MISSING_VERIFIED_ROLE_WITH_UNTRUSTED_PATIENT_SIGNAL';
      ELSE
        v_role_verified := TRUE;
        v_requires_review := FALSE;
      END IF;
    END IF;

    v_mfa_enforced := (v_assigned_type = 'patient');

    INSERT INTO public.user_account_policies (
      user_id,
      account_type,
      mfa_enforced,
      role_verified,
      requires_role_review
    )
    VALUES (
      r.user_id,
      v_assigned_type,
      v_mfa_enforced,
      v_role_verified,
      v_requires_review
    )
    ON CONFLICT (user_id) DO NOTHING;

    IF v_conflict_reason IS NOT NULL AND NOT v_already_resolved THEN
      INSERT INTO public.account_role_audit_conflicts (
        user_id,
        app_meta_account_type,
        legacy_profile_account_type,
        raw_user_meta_account_type,
        has_patient_medical_records,
        assigned_account_type,
        conflict_reason,
        requires_verification
      )
      VALUES (
        r.user_id,
        v_app_type,
        v_profile_type,
        v_user_meta_type,
        v_has_patient_data,
        v_assigned_type,
        v_conflict_reason,
        TRUE
      )
      ON CONFLICT (user_id) DO UPDATE SET
        app_meta_account_type = EXCLUDED.app_meta_account_type,
        legacy_profile_account_type = EXCLUDED.legacy_profile_account_type,
        raw_user_meta_account_type = EXCLUDED.raw_user_meta_account_type,
        has_patient_medical_records = EXCLUDED.has_patient_medical_records,
        conflict_reason = EXCLUDED.conflict_reason,
        detected_at = NOW();
    END IF;
  END LOOP;
END $$;

-- Sync server-managed raw_app_meta_data ONLY for verified policies (never mint unverified claims)
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('account_type', p.account_type)
FROM public.user_account_policies p
WHERE p.user_id = u.id
  AND p.role_verified = TRUE
  AND p.requires_role_review = FALSE
  AND (u.raw_app_meta_data->>'account_type') IS DISTINCT FROM p.account_type;

-- Sync public.profiles.account_type ONLY for verified policies before enabling client-lock trigger
UPDATE public.profiles pr
SET account_type = p.account_type
FROM public.user_account_policies p
WHERE p.user_id = pr.id
  AND p.role_verified = TRUE
  AND p.requires_role_review = FALSE
  AND pr.account_type IS DISTINCT FROM p.account_type;

-- 2. PROTECT public.profiles.account_type FROM DIRECT CLIENT MODIFICATION
-- MUST BE SECURITY INVOKER so `current_user` reflects the actual caller (e.g. 'authenticated'),
-- NOT the function owner ('postgres'). Never use SECURITY DEFINER + current_user here!
CREATE OR REPLACE FUNCTION public.protect_profile_security_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
  v_is_privileged BOOLEAN;
  v_policy_type TEXT;
  v_new_json JSONB;
  v_old_json JSONB;
BEGIN
  v_is_privileged := (
    current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role')
    AND v_jwt_role NOT IN ('anon', 'authenticated')
  ) OR (v_jwt_role = 'service_role');

  IF v_is_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT p.account_type INTO v_policy_type
    FROM public.user_account_policies p
    WHERE p.user_id = NEW.id;

    IF v_policy_type IS NULL THEN
      v_policy_type := 'impaired';
    END IF;

    IF NEW.account_type IS NOT NULL AND NEW.account_type IS DISTINCT FROM v_policy_type THEN
      RAISE EXCEPTION 'account_type is server-managed and cannot be arbitrarily set by client'
        USING ERRCODE = '42501';
    END IF;

    NEW.account_type := v_policy_type;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
      RAISE EXCEPTION 'account_type is server-managed and cannot be modified by client'
        USING ERRCODE = '42501';
    END IF;

    -- Also guard legacy `role` column if it exists on public.profiles
    v_new_json := to_jsonb(NEW);
    v_old_json := to_jsonb(OLD);
    IF (v_new_json ? 'role') AND ((v_new_json->>'role') IS DISTINCT FROM (v_old_json->>'role')) THEN
      RAISE EXCEPTION 'role is server-managed and cannot be modified by client'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_security_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_profile_security_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_security_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_security_columns();

-- 3. HARDEN NEW USER SIGNUP TRIGGER (NULL-SAFE ROLE ASSIGNMENT AT REGISTRATION ONLY)
-- Allows valid initial selection ('impaired' | 'patient') once at signup, defaults NULL/invalid
-- safely to 'impaired', writes server-managed policy + app_metadata, and never permits post-signup self-change.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_account_type TEXT;
  v_display_name TEXT;
BEGIN
  v_account_type := NULLIF(trim(COALESCE(
    new.raw_app_meta_data->>'account_type',
    new.raw_user_meta_data->>'account_type',
    new.raw_user_meta_data->>'role',
    ''
  )), '');

  IF v_account_type IS NULL OR v_account_type NOT IN ('impaired', 'patient') THEN
    v_account_type := 'impaired';
  END IF;

  v_display_name := COALESCE(
    NULLIF(trim(new.raw_user_meta_data->>'display_name'), ''),
    NULLIF(trim(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(split_part(COALESCE(new.email, ''), '@', 1)), ''),
    'Người dùng'
  );

  INSERT INTO public.user_account_policies (
    user_id,
    account_type,
    mfa_enforced,
    role_verified,
    requires_role_review
  )
  VALUES (
    new.id,
    v_account_type,
    (v_account_type = 'patient'),
    TRUE,
    FALSE
  )
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('account_type', v_account_type)
  WHERE id = new.id
    AND (raw_app_meta_data->>'account_type') IS DISTINCT FROM v_account_type;

  INSERT INTO public.profiles (id, display_name, avatar_url, account_type)
  VALUES (
    new.id,
    v_display_name,
    new.raw_user_meta_data->>'avatar_url',
    v_account_type
  )
  ON CONFLICT (id) DO UPDATE SET
    account_type = COALESCE(public.profiles.account_type, EXCLUDED.account_type),
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Admin-only verified role resolution function (never callable by anon or authenticated)
CREATE OR REPLACE FUNCTION public.admin_set_verified_account_type(
  p_target_user_id UUID,
  p_new_account_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF p_target_user_id IS NULL OR p_new_account_type NOT IN ('impaired', 'patient') THEN
    RAISE EXCEPTION 'Invalid user_id or account_type';
  END IF;

  INSERT INTO public.user_account_policies (
    user_id,
    account_type,
    mfa_enforced,
    role_verified,
    requires_role_review,
    updated_at
  )
  VALUES (
    p_target_user_id,
    p_new_account_type,
    (p_new_account_type = 'patient'),
    TRUE,
    FALSE,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    account_type = EXCLUDED.account_type,
    mfa_enforced = EXCLUDED.mfa_enforced,
    role_verified = TRUE,
    requires_role_review = FALSE,
    updated_at = NOW();

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('account_type', p_new_account_type)
  WHERE id = p_target_user_id;

  UPDATE public.profiles
  SET account_type = p_new_account_type
  WHERE id = p_target_user_id;

  UPDATE public.account_role_audit_conflicts
  SET assigned_account_type = p_new_account_type,
      requires_verification = FALSE,
      resolved_at = NOW(),
      resolved_by = current_user
  WHERE user_id = p_target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_verified_account_type(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- 4. SERVER-AUTHORITATIVE MFA & ROLE HELPER FUNCTIONS
-- Drop old parameterized signature so callers can NEVER query another user's account_type!
DROP FUNCTION IF EXISTS public.get_authoritative_account_type(UUID);

CREATE OR REPLACE FUNCTION public.get_authoritative_account_type()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_type TEXT;
  v_role_verified BOOLEAN := FALSE;
  v_requires_review BOOLEAN := TRUE;
  v_found_policy BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.account_type, p.role_verified, p.requires_role_review
  INTO v_type, v_role_verified, v_requires_review
  FROM public.user_account_policies p
  WHERE p.user_id = v_uid;

  v_found_policy := FOUND;

  IF v_found_policy THEN
    IF v_type IN ('impaired', 'patient')
       AND COALESCE(v_role_verified, FALSE) = TRUE
       AND COALESCE(v_requires_review, TRUE) = FALSE THEN
      RETURN v_type;
    END IF;
    RETURN NULL;
  END IF;

  SELECT u.raw_app_meta_data->>'account_type' INTO v_type
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_type IN ('impaired', 'patient') THEN
    RETURN v_type;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_mfa_policy_satisfied()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_aal TEXT;
  v_type TEXT;
  v_mfa_enforced BOOLEAN := FALSE;
  v_role_verified BOOLEAN := FALSE;
  v_requires_review BOOLEAN := TRUE;
  v_found_policy BOOLEAN := FALSE;
  v_has_verified_mfa BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  v_aal := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'aal', '');

  SELECT p.account_type, p.mfa_enforced, p.role_verified, p.requires_role_review
  INTO v_type, v_mfa_enforced, v_role_verified, v_requires_review
  FROM public.user_account_policies p
  WHERE p.user_id = v_uid;

  v_found_policy := FOUND;

  IF v_found_policy THEN
    IF COALESCE(v_role_verified, FALSE) = FALSE
       OR COALESCE(v_requires_review, TRUE) = TRUE
       OR v_type NOT IN ('impaired', 'patient') THEN
      RETURN FALSE;
    END IF;
  ELSE
    SELECT u.raw_app_meta_data->>'account_type' INTO v_type
    FROM auth.users u
    WHERE u.id = v_uid;

    IF v_type IS NULL OR v_type NOT IN ('impaired', 'patient') THEN
      RETURN FALSE;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM auth.mfa_factors f
    WHERE f.user_id = v_uid
      AND f.status = 'verified'
  ) INTO v_has_verified_mfa;

  IF v_type = 'patient' OR v_mfa_enforced OR v_has_verified_mfa THEN
    RETURN v_aal = 'aal2';
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_patient_aal2_satisfied()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_aal TEXT;
  v_type TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  v_type := public.get_authoritative_account_type();
  IF v_type IS DISTINCT FROM 'patient' THEN
    RETURN FALSE;
  END IF;

  v_aal := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'aal', '');
  RETURN v_aal = 'aal2';
END;
$$;

-- Per-channel Realtime Authorization helper (enforces MFA + membership on each private channel topic)
CREATE OR REPLACE FUNCTION public.can_access_realtime_topic(
  p_topic TEXT,
  p_action TEXT DEFAULT 'subscribe'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_target_uuid UUID;
BEGIN
  IF v_uid IS NULL OR p_topic IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT public.is_mfa_policy_satisfied() THEN
    RETURN FALSE;
  END IF;

  IF p_topic ~ '^conversation:[0-9a-fA-F-]{36}$' THEN
    v_target_uuid := substring(p_topic FROM '^conversation:([0-9a-fA-F-]{36})$')::UUID;
    RETURN EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = v_target_uuid
        AND (c.user_a = v_uid OR c.user_b = v_uid)
    );
  END IF;

  IF p_topic ~ '^user_signaling_[0-9a-fA-F-]{36}$' THEN
    v_target_uuid := substring(p_topic FROM '^user_signaling_([0-9a-fA-F-]{36})$')::UUID;
    -- Both own channel subscription (receive ring) and mutual verified friends (subscribe+send ring in private channel mode)
    RETURN v_target_uuid = v_uid OR EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE f.user_a = least(v_uid, v_target_uuid)
        AND f.user_b = greatest(v_uid, v_target_uuid)
    );
  END IF;

  IF p_topic ~ '^call_room_[0-9a-fA-F-]{36}$' THEN
    v_target_uuid := substring(p_topic FROM '^call_room_([0-9a-fA-F-]{36})$')::UUID;
    RETURN EXISTS (
      SELECT 1
      FROM public.calls ca
      WHERE ca.id = v_target_uuid
        AND (ca.caller_id = v_uid OR ca.callee_id = v_uid)
    );
  END IF;

  RETURN FALSE;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.get_authoritative_account_type() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_authoritative_account_type() TO authenticated;

REVOKE ALL ON FUNCTION public.is_mfa_policy_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_mfa_policy_satisfied() TO authenticated;

REVOKE ALL ON FUNCTION public.is_patient_aal2_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_patient_aal2_satisfied() TO authenticated;

REVOKE ALL ON FUNCTION public.can_access_realtime_topic(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_realtime_topic(TEXT, TEXT) TO authenticated;

-- 5. RESTRICTIVE RLS POLICIES (PRESERVING ALL EXISTING OWNERSHIP POLICIES)

-- 5A. Medical / Patient Tables: Require Patient role + AAL2
DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on lab_reports" ON public.lab_reports;
CREATE POLICY "Restrictive: patient AAL2 required on lab_reports"
ON public.lab_reports AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_patient_aal2_satisfied())
WITH CHECK (public.is_patient_aal2_satisfied());

DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on lab_results" ON public.lab_results;
CREATE POLICY "Restrictive: patient AAL2 required on lab_results"
ON public.lab_results AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_patient_aal2_satisfied())
WITH CHECK (public.is_patient_aal2_satisfied());

DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on meal_plans" ON public.meal_plans;
CREATE POLICY "Restrictive: patient AAL2 required on meal_plans"
ON public.meal_plans AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_patient_aal2_satisfied())
WITH CHECK (public.is_patient_aal2_satisfied());

DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on meal_plan_items" ON public.meal_plan_items;
CREATE POLICY "Restrictive: patient AAL2 required on meal_plan_items"
ON public.meal_plan_items AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_patient_aal2_satisfied())
WITH CHECK (public.is_patient_aal2_satisfied());

DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on exercise_plans" ON public.exercise_plans;
CREATE POLICY "Restrictive: patient AAL2 required on exercise_plans"
ON public.exercise_plans AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_patient_aal2_satisfied())
WITH CHECK (public.is_patient_aal2_satisfied());

DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on exercise_items" ON public.exercise_items;
CREATE POLICY "Restrictive: patient AAL2 required on exercise_items"
ON public.exercise_items AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_patient_aal2_satisfied())
WITH CHECK (public.is_patient_aal2_satisfied());

-- 5B. Private Social / Communication Tables: Require MFA policy satisfaction
DROP POLICY IF EXISTS "Restrictive: MFA policy required on conversations" ON public.conversations;
CREATE POLICY "Restrictive: MFA policy required on conversations"
ON public.conversations AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_mfa_policy_satisfied())
WITH CHECK (public.is_mfa_policy_satisfied());

DROP POLICY IF EXISTS "Restrictive: MFA policy required on messages" ON public.messages;
CREATE POLICY "Restrictive: MFA policy required on messages"
ON public.messages AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_mfa_policy_satisfied())
WITH CHECK (public.is_mfa_policy_satisfied());

DROP POLICY IF EXISTS "Restrictive: MFA policy required on calls" ON public.calls;
CREATE POLICY "Restrictive: MFA policy required on calls"
ON public.calls AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_mfa_policy_satisfied())
WITH CHECK (public.is_mfa_policy_satisfied());

DROP POLICY IF EXISTS "Restrictive: MFA policy required on friend_requests" ON public.friend_requests;
CREATE POLICY "Restrictive: MFA policy required on friend_requests"
ON public.friend_requests AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_mfa_policy_satisfied())
WITH CHECK (public.is_mfa_policy_satisfied());

DROP POLICY IF EXISTS "Restrictive: MFA policy required on friendships" ON public.friendships;
CREATE POLICY "Restrictive: MFA policy required on friendships"
ON public.friendships AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_mfa_policy_satisfied())
WITH CHECK (public.is_mfa_policy_satisfied());

-- 5C. Profiles: Always allow reading OWN profile at AAL1 (zero deadlock during MFA enrollment),
-- while blocking directory enumeration & profile edits until MFA policy is satisfied
DROP POLICY IF EXISTS "Restrictive: own profile at AAL1 or MFA satisfied for directory" ON public.profiles;
CREATE POLICY "Restrictive: own profile at AAL1 or MFA satisfied for directory"
ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
USING (auth.uid() = id OR public.is_mfa_policy_satisfied());

DROP POLICY IF EXISTS "Restrictive: MFA policy required to update profile" ON public.profiles;
CREATE POLICY "Restrictive: MFA policy required to update profile"
ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.is_mfa_policy_satisfied())
WITH CHECK (public.is_mfa_policy_satisfied());

-- 6. HARDEN ALL SECURITY DEFINER RPCS AGAINST AAL1 BYPASS & SEARCH_PATH ATTACKS

CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request record;
  v_user_a uuid;
  v_user_b uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_mfa_policy_satisfied() THEN
    RAISE EXCEPTION 'MFA_REQUIRED: AAL2 verification required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.friend_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found';
  END IF;

  IF v_request.receiver_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized to accept this friend request';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Friend request is not pending';
  END IF;

  v_user_a := least(v_request.sender_id, v_request.receiver_id);
  v_user_b := greatest(v_request.sender_id, v_request.receiver_id);

  INSERT INTO public.friendships (user_a, user_b)
  VALUES (v_user_a, v_user_b)
  ON CONFLICT (user_a, user_b) DO NOTHING;

  UPDATE public.friend_requests
  SET status = 'accepted',
      responded_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object('success', true, 'message', 'Friend request accepted');
END;
$$;

CREATE OR REPLACE FUNCTION public.send_friend_request(p_receiver_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
  v_existing_req record;
  v_user_a uuid;
  v_user_b uuid;
  v_new_id uuid;
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_mfa_policy_satisfied() THEN
    RAISE EXCEPTION 'MFA_REQUIRED: AAL2 verification required' USING ERRCODE = '42501';
  END IF;

  IF v_sender_id = p_receiver_id THEN
    RAISE EXCEPTION 'Cannot send friend request to yourself';
  END IF;

  v_user_a := least(v_sender_id, p_receiver_id);
  v_user_b := greatest(v_sender_id, p_receiver_id);

  IF EXISTS (SELECT 1 FROM public.friendships WHERE user_a = v_user_a AND user_b = v_user_b) THEN
    RAISE EXCEPTION 'Already friends';
  END IF;

  SELECT * INTO v_existing_req
  FROM public.friend_requests
  WHERE sender_id = p_receiver_id AND receiver_id = v_sender_id AND status = 'pending';

  IF FOUND THEN
    PERFORM public.accept_friend_request(v_existing_req.id);
    RETURN json_build_object('success', true, 'status', 'accepted', 'message', 'Cross request auto-accepted');
  END IF;

  SELECT * INTO v_existing_req
  FROM public.friend_requests
  WHERE sender_id = v_sender_id AND receiver_id = p_receiver_id AND status = 'pending';

  IF FOUND THEN
    RETURN json_build_object('success', true, 'status', 'pending', 'message', 'Friend request already sent');
  END IF;

  INSERT INTO public.friend_requests (sender_id, receiver_id, status)
  VALUES (v_sender_id, p_receiver_id, 'pending')
  RETURNING id INTO v_new_id;

  RETURN json_build_object('success', true, 'status', 'pending', 'id', v_new_id, 'message', 'Friend request sent successfully');
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_friend_request(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_mfa_policy_satisfied() THEN
    RAISE EXCEPTION 'MFA_REQUIRED: AAL2 verification required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request FROM public.friend_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found';
  END IF;

  IF v_request.receiver_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized to reject this friend request';
  END IF;

  UPDATE public.friend_requests
  SET status = 'rejected',
      responded_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object('success', true, 'message', 'Friend request rejected');
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_mfa_policy_satisfied() THEN
    RAISE EXCEPTION 'MFA_REQUIRED: AAL2 verification required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request FROM public.friend_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found';
  END IF;

  IF v_request.sender_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized to cancel this friend request';
  END IF;

  UPDATE public.friend_requests
  SET status = 'cancelled',
      responded_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object('success', true, 'message', 'Friend request cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_friends()
RETURNS TABLE (
  friendship_id uuid,
  friend_id uuid,
  display_name text,
  avatar_url text,
  friendship_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_mfa_policy_satisfied() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    f.id AS friendship_id,
    CASE WHEN f.user_a = auth.uid() THEN f.user_b ELSE f.user_a END AS friend_id,
    p.display_name,
    p.avatar_url,
    f.created_at AS friendship_created_at
  FROM public.friendships f
  JOIN public.profiles p ON p.id = (CASE WHEN f.user_a = auth.uid() THEN f.user_b ELSE f.user_a END)
  WHERE f.user_a = auth.uid() OR f.user_b = auth.uid()
  ORDER BY p.display_name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_users_with_status(p_query text)
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text,
  relationship_status text,
  request_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_escaped_query text;
BEGIN
  IF v_user_id IS NULL OR trim(COALESCE(p_query, '')) = '' OR NOT public.is_mfa_policy_satisfied() THEN
    RETURN;
  END IF;

  v_escaped_query := replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.user_a = least(v_user_id, p.id) AND f.user_b = greatest(v_user_id, p.id)
      ) THEN 'friend'
      WHEN EXISTS (
        SELECT 1 FROM public.friend_requests fr
        WHERE fr.sender_id = v_user_id AND fr.receiver_id = p.id AND fr.status = 'pending'
      ) THEN 'outgoing_pending'
      WHEN EXISTS (
        SELECT 1 FROM public.friend_requests fr
        WHERE fr.sender_id = p.id AND fr.receiver_id = v_user_id AND fr.status = 'pending'
      ) THEN 'incoming_pending'
      ELSE 'none'
    END AS relationship_status,
    (
      SELECT fr.id FROM public.friend_requests fr
      WHERE ((fr.sender_id = v_user_id AND fr.receiver_id = p.id) OR (fr.sender_id = p.id AND fr.receiver_id = v_user_id))
        AND fr.status = 'pending'
      LIMIT 1
    ) AS request_id
  FROM public.profiles p
  WHERE p.id != v_user_id
    AND p.display_name ILIKE '%' || v_escaped_query || '%' ESCAPE '\'
  LIMIT 20;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_incoming_friend_requests()
RETURNS TABLE (
  request_id uuid,
  sender_id uuid,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_mfa_policy_satisfied() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    fr.id AS request_id,
    fr.sender_id,
    p.display_name,
    p.avatar_url,
    fr.created_at
  FROM public.friend_requests fr
  JOIN public.profiles p ON p.id = fr.sender_id
  WHERE fr.receiver_id = auth.uid() AND fr.status = 'pending'
  ORDER BY fr.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(p_friend_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_conv_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_mfa_policy_satisfied() THEN
    RAISE EXCEPTION 'MFA_REQUIRED: AAL2 verification required' USING ERRCODE = '42501';
  END IF;

  IF v_user_id = p_friend_id THEN
    RAISE EXCEPTION 'Cannot create conversation with yourself';
  END IF;

  v_user_a := least(v_user_id, p_friend_id);
  v_user_b := greatest(v_user_id, p_friend_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE user_a = v_user_a AND user_b = v_user_b
  ) THEN
    RAISE EXCEPTION 'Users are not friends';
  END IF;

  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE user_a = v_user_a AND user_b = v_user_b;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (user_a, user_b)
    VALUES (v_user_a, v_user_b)
    ON CONFLICT (user_a, user_b) DO NOTHING
    RETURNING id INTO v_conv_id;

    IF v_conv_id IS NULL THEN
      SELECT id INTO v_conv_id
      FROM public.conversations
      WHERE user_a = v_user_a AND user_b = v_user_b;
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'conversation_id', v_conv_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.send_chat_message(p_conversation_id uuid, p_content text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
  v_trimmed text := trim(COALESCE(p_content, ''));
  v_msg_id uuid;
  v_created_at timestamptz;
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_mfa_policy_satisfied() THEN
    RAISE EXCEPTION 'MFA_REQUIRED: AAL2 verification required' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_trimmed) < 1 THEN
    RAISE EXCEPTION 'Message content cannot be empty';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id
      AND (user_a = v_sender_id OR user_b = v_sender_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized to send message in this conversation';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (p_conversation_id, v_sender_id, v_trimmed)
  RETURNING id, created_at INTO v_msg_id, v_created_at;

  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = p_conversation_id;

  RETURN json_build_object(
    'id', v_msg_id,
    'conversation_id', p_conversation_id,
    'sender_id', v_sender_id,
    'content', v_trimmed,
    'created_at', v_created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_conversation_messages(p_conversation_id uuid, p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz,
  edited_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_safe_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_mfa_policy_satisfied() THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at, m.edited_at
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at ASC
  LIMIT v_safe_limit;
END;
$$;

-- Restrict RPC execute permissions to authenticated only
REVOKE ALL ON FUNCTION public.accept_friend_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.send_friend_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_friend_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_friend_request(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_friend_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_friends() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_friends() TO authenticated;

REVOKE ALL ON FUNCTION public.search_users_with_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_users_with_status(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_incoming_friend_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_incoming_friend_requests() TO authenticated;

REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.send_chat_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_conversation_messages(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(uuid, int) TO authenticated;

-- 7. REALTIME AUTHORIZATION (RESTRICTIVE MFA POLICY + PER-PRIVATE-CHANNEL TOPIC CHECK)
-- Never silently swallow deployment errors on security policies.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'realtime'
      AND table_name = 'messages'
  ) THEN
    RAISE EXCEPTION 'realtime.messages table is missing; aborting migration instead of skipping Realtime security policies';
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Restrictive: MFA policy required on realtime messages" ON realtime.messages';
  EXECUTE 'DROP POLICY IF EXISTS "Restrictive: MFA policy and verified role required on realtime messages" ON realtime.messages';
  EXECUTE 'DROP POLICY IF EXISTS "EYEAI: authenticated can subscribe own private channels" ON realtime.messages';
  EXECUTE 'DROP POLICY IF EXISTS "EYEAI: authenticated can publish authorized private channels" ON realtime.messages';

  EXECUTE '
    CREATE POLICY "Restrictive: MFA policy and verified role required on realtime messages"
    ON realtime.messages AS RESTRICTIVE FOR ALL TO authenticated
    USING (public.is_mfa_policy_satisfied())
    WITH CHECK (public.is_mfa_policy_satisfied())
  ';

  EXECUTE '
    CREATE POLICY "EYEAI: authenticated can subscribe own private channels"
    ON realtime.messages FOR SELECT TO authenticated
    USING (public.can_access_realtime_topic(realtime.topic(), ''subscribe''))
  ';

  EXECUTE '
    CREATE POLICY "EYEAI: authenticated can publish authorized private channels"
    ON realtime.messages FOR INSERT TO authenticated
    WITH CHECK (public.can_access_realtime_topic(realtime.topic(), ''publish''))
  ';
END $$;

COMMIT;
