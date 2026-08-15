-- COMPLETE SUPABASE MIGRATION FOR LUCKY DREAM - EYEAI (PATIENT EXPERIENCE TABLES)
-- Non-destructive, additive migration compatible with existing profiles, friends, and auth system.

-- 1. Create table lab_reports if not exists
CREATE TABLE IF NOT EXISTS public.lab_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    image_reference TEXT,
    status TEXT NOT NULL DEFAULT 'PROCESSED' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
    source_type TEXT NOT NULL DEFAULT 'UPLOAD' CHECK (source_type IN ('CAMERA', 'UPLOAD')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create table lab_results if not exists
CREATE TABLE IF NOT EXISTS public.lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.lab_reports(id) ON DELETE CASCADE,
    test_code TEXT NOT NULL,
    test_name TEXT NOT NULL,
    value NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    reference_low NUMERIC,
    reference_high NUMERIC,
    reference_text TEXT,
    status TEXT NOT NULL DEFAULT 'NORMAL' CHECK (status IN ('LOW', 'NORMAL', 'HIGH', 'UNKNOWN')),
    ocr_confidence NUMERIC DEFAULT 1.0,
    explanation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create table meal_plans if not exists
CREATE TABLE IF NOT EXISTS public.meal_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    report_id UUID REFERENCES public.lab_reports(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create table meal_plan_items if not exists
CREATE TABLE IF NOT EXISTS public.meal_plan_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
    meal_type TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DRINK')),
    name TEXT NOT NULL,
    description TEXT,
    ingredients TEXT,
    preparation TEXT,
    image_url TEXT,
    image_alt TEXT,
    image_source_url TEXT,
    image_license TEXT,
    image_author TEXT,
    rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create table exercise_plans if not exists
CREATE TABLE IF NOT EXISTS public.exercise_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    report_id UUID REFERENCES public.lab_reports(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Create table exercise_items if not exists
CREATE TABLE IF NOT EXISTS public.exercise_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercise_plan_id UUID NOT NULL REFERENCES public.exercise_plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    duration INTEGER NOT NULL DEFAULT 15,
    difficulty TEXT NOT NULL DEFAULT 'EASY' CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    rationale TEXT,
    youtube_url TEXT,
    youtube_video_id TEXT,
    youtube_title TEXT,
    youtube_author TEXT,
    youtube_author_url TEXT,
    youtube_thumbnail_url TEXT,
    youtube_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ENABLE ROW LEVEL SECURITY (RLS) ON ALL PATIENT TABLES
ALTER TABLE public.lab_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_items ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES FOR lab_reports
DROP POLICY IF EXISTS "Users can manage own lab reports" ON public.lab_reports;
CREATE POLICY "Users can manage own lab reports"
ON public.lab_reports FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS POLICIES FOR lab_results
DROP POLICY IF EXISTS "Users can manage lab results for own reports" ON public.lab_results;
CREATE POLICY "Users can manage lab results for own reports"
ON public.lab_results FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lab_reports r
    WHERE r.id = lab_results.report_id AND r.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lab_reports r
    WHERE r.id = lab_results.report_id AND r.user_id = auth.uid()
  )
);

-- RLS POLICIES FOR meal_plans
DROP POLICY IF EXISTS "Users can manage own meal plans" ON public.meal_plans;
CREATE POLICY "Users can manage own meal plans"
ON public.meal_plans FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS POLICIES FOR meal_plan_items
DROP POLICY IF EXISTS "Users can manage meal items for own plans" ON public.meal_plan_items;
CREATE POLICY "Users can manage meal items for own plans"
ON public.meal_plan_items FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meal_plans p
    WHERE p.id = meal_plan_items.meal_plan_id AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.meal_plans p
    WHERE p.id = meal_plan_items.meal_plan_id AND p.user_id = auth.uid()
  )
);

-- RLS POLICIES FOR exercise_plans
DROP POLICY IF EXISTS "Users can manage own exercise plans" ON public.exercise_plans;
CREATE POLICY "Users can manage own exercise plans"
ON public.exercise_plans FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS POLICIES FOR exercise_items
DROP POLICY IF EXISTS "Users can manage exercise items for own plans" ON public.exercise_items;
CREATE POLICY "Users can manage exercise items for own plans"
ON public.exercise_items FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exercise_plans p
    WHERE p.id = exercise_items.exercise_plan_id AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exercise_plans p
    WHERE p.id = exercise_items.exercise_plan_id AND p.user_id = auth.uid()
  )
);
