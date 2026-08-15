-- COMPLETE SUPABASE MIGRATION FOR LUCKY DREAM - EYEAI (ACCOUNT TYPE)
-- Migration: Add account_type column to public.profiles and update signup trigger

-- 1. Safely add account_type column if it doesn't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS account_type text;

-- 2. Safely add check constraint for account_type values ('impaired', 'patient')
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_type_check'
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_account_type_check 
        CHECK (account_type IS NULL OR account_type IN ('impaired', 'patient'));
    END IF;
END $$;

-- 3. Safely migrate existing profiles if role column had legacy values
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'profiles' 
          AND column_name = 'role'
    ) THEN
        UPDATE public.profiles 
        SET account_type = 'impaired' 
        WHERE account_type IS NULL AND role = 'impaired';

        UPDATE public.profiles 
        SET account_type = 'patient' 
        WHERE account_type IS NULL AND role = 'patient';
    END IF;
END $$;

-- 4. Update automatic user signup trigger function
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

-- Re-attach trigger if dropped
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Ensure RLS policies for profiles allow users to update their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Authenticated users can select public profiles" ON public.profiles;
CREATE POLICY "Authenticated users can select public profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);
