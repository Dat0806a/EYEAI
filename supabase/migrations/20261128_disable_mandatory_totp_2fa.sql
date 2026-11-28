-- =============================================================================
-- EYEAI — DISABLE MANDATORY TOTP 2FA (USE EMAIL OTP + VERIFIED ROLE)
-- Migration: 20261128_disable_mandatory_totp_2fa.sql
--
-- Keeps server-managed account_type, role_verified checks, and ownership RLS,
-- while removing the mandatory Google Authenticator (TOTP AAL2) gate so users
-- can sign in with Email OTP directly.
-- =============================================================================

BEGIN;

-- 1. Disable mandatory TOTP enforcement flag on existing policies
UPDATE public.user_account_policies
SET mfa_enforced = FALSE,
    updated_at = NOW()
WHERE mfa_enforced = TRUE;

-- 2. Update new-user trigger so newly registered users do not require TOTP 2FA
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
    FALSE,
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

-- 3. Update admin role approval helper so verified accounts do not enforce TOTP
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
    FALSE,
    TRUE,
    FALSE,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    account_type = EXCLUDED.account_type,
    mfa_enforced = FALSE,
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

-- 4. Allow verified-role users to satisfy policy & patient RLS after Email OTP (AAL1)
CREATE OR REPLACE FUNCTION public.is_mfa_policy_satisfied()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_type TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  v_type := public.get_authoritative_account_type();
  RETURN v_type IN ('impaired', 'patient');
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
  v_type TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  v_type := public.get_authoritative_account_type();
  RETURN v_type = 'patient';
END;
$$;

COMMIT;
