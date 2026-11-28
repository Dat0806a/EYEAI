-- =============================================================================
-- ROLLBACK SCRIPT FOR: 20261128_auth_mfa_hardening.sql
-- Location: supabase/rollbacks/20261128_auth_mfa_hardening.rollback.sql
--
-- IMPORTANT:
-- - Stored OUTSIDE `supabase/migrations/` so CLI/migration runners do NOT execute
--   this automatically after applying `20261128_auth_mfa_hardening.sql`.
-- - Wrapped in BEGIN ... COMMIT for atomic rollback.
-- - Restores pre-migration `public.profiles.account_type` and `auth.users.raw_app_meta_data`
--   from `public.auth_hardening_migration_backup` (if present), restores original
--   `handle_new_user()` and friend/chat RPC definitions & permissions, and drops
--   all Restrictive RLS policies, triggers, and hardening helper functions.
-- - Non-destructive: retains `public.user_account_policies`,
--   `public.account_role_audit_conflicts`, and `public.auth_hardening_migration_backup`
--   with revoked client access so no user/audit data is lost.
-- =============================================================================

BEGIN;

-- 1. Drop Realtime policies added by 20261128_auth_mfa_hardening.sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'realtime'
      AND table_name = 'messages'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Restrictive: MFA policy required on realtime messages" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "Restrictive: MFA policy and verified role required on realtime messages" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "EYEAI: authenticated can subscribe own private channels" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "EYEAI: authenticated can publish authorized private channels" ON realtime.messages';
  END IF;
END $$;

-- 2. Drop Restrictive RLS policies added by 20261128_auth_mfa_hardening.sql
DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on lab_reports" ON public.lab_reports;
DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on lab_results" ON public.lab_results;
DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on meal_plans" ON public.meal_plans;
DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on meal_plan_items" ON public.meal_plan_items;
DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on exercise_plans" ON public.exercise_plans;
DROP POLICY IF EXISTS "Restrictive: patient AAL2 required on exercise_items" ON public.exercise_items;

DROP POLICY IF EXISTS "Restrictive: MFA policy required on conversations" ON public.conversations;
DROP POLICY IF EXISTS "Restrictive: MFA policy required on messages" ON public.messages;
DROP POLICY IF EXISTS "Restrictive: MFA policy required on calls" ON public.calls;
DROP POLICY IF EXISTS "Restrictive: MFA policy required on friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "Restrictive: MFA policy required on friendships" ON public.friendships;

DROP POLICY IF EXISTS "Restrictive: own profile at AAL1 or MFA satisfied for directory" ON public.profiles;
DROP POLICY IF EXISTS "Restrictive: MFA policy required to update profile" ON public.profiles;

-- 3. Drop profile security column protection trigger & function BEFORE restoring profiles
DROP TRIGGER IF EXISTS trg_protect_profile_security_columns ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_security_columns();

-- 4. Restore pre-migration auth.users.raw_app_meta_data and public.profiles.account_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'auth_hardening_migration_backup'
  ) THEN
    UPDATE auth.users u
    SET raw_app_meta_data = b.original_raw_app_meta_data
    FROM public.auth_hardening_migration_backup b
    WHERE b.user_id = u.id
      AND u.raw_app_meta_data IS DISTINCT FROM b.original_raw_app_meta_data;

    UPDATE public.profiles p
    SET account_type = b.original_profile_account_type
    FROM public.auth_hardening_migration_backup b
    WHERE b.user_id = p.id
      AND p.account_type IS DISTINCT FROM b.original_profile_account_type;
  END IF;
END $$;

-- 5. Restore original handle_new_user() & trigger from 20260815_account_type.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_account_type text;
BEGIN
  v_account_type := COALESCE(
    new.raw_user_meta_data->>'account_type',
    new.raw_user_meta_data->>'role'
  );

  IF v_account_type NOT IN ('impaired', 'patient') THEN
    v_account_type := NULL;
  END IF;

  INSERT INTO public.profiles (id, display_name, avatar_url, account_type)
  VALUES (
    new.id,
    COALESCE(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1),
      'Người dùng'
    ),
    new.raw_user_meta_data->>'avatar_url',
    v_account_type
  )
  ON CONFLICT (id) DO UPDATE SET
    account_type = COALESCE(public.profiles.account_type, EXCLUDED.account_type),
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Restore original friend & chat RPCs from 20260813_friend_system.sql and 20260813_chat_and_calls.sql
CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_request record;
  v_user_a uuid;
  v_user_b uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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
SECURITY DEFINER SET search_path = public
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
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_request record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_request record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
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
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR trim(p_query) = '' THEN
    RETURN;
  END IF;

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
    AND p.display_name ILIKE '%' || trim(p_query) || '%'
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
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
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
SECURITY DEFINER SET search_path = public
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
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
  v_trimmed text := trim(p_content);
  v_msg_id uuid;
  v_created_at timestamptz;
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    return;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  ) THEN
    return;
  END IF;

  RETURN QUERY
  SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at, m.edited_at
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at ASC
  LIMIT p_limit;
END;
$$;

-- 7. Restore default function EXECUTE permissions & lock down audit/policy tables safely
GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_friend_request(uuid) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_friends() TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_with_status(text) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_incoming_friend_requests() TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(uuid, int) TO PUBLIC, authenticated;

-- 8. Drop MFA/Realtime helper functions added by 20261128_auth_mfa_hardening.sql
DROP FUNCTION IF EXISTS public.can_access_realtime_topic(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.is_patient_aal2_satisfied();
DROP FUNCTION IF EXISTS public.is_mfa_policy_satisfied();
DROP FUNCTION IF EXISTS public.get_authoritative_account_type();
DROP FUNCTION IF EXISTS public.get_authoritative_account_type(UUID);
DROP FUNCTION IF EXISTS public.admin_set_verified_account_type(UUID, TEXT);

DROP POLICY IF EXISTS "Users can read own account policy" ON public.user_account_policies;
REVOKE ALL ON public.user_account_policies FROM PUBLIC, anon, authenticated;

-- NOTE: `public.auth_hardening_migration_backup`, `public.user_account_policies`, and
-- `public.account_role_audit_conflicts` are retained (locked to admin/service_role)
-- so zero audit trail or user data is lost during rollback.

COMMIT;
