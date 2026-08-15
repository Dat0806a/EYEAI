-- Migration 002: Persist verified meal-image and exercise-video provenance.

ALTER TABLE meal_plan_items ADD COLUMN image_alt TEXT;
ALTER TABLE meal_plan_items ADD COLUMN image_source_url TEXT;
ALTER TABLE meal_plan_items ADD COLUMN image_license TEXT;
ALTER TABLE meal_plan_items ADD COLUMN image_author TEXT;
ALTER TABLE meal_plan_items ADD COLUMN image_verified_at TEXT;

ALTER TABLE exercise_items ADD COLUMN youtube_video_id TEXT;
ALTER TABLE exercise_items ADD COLUMN youtube_title TEXT;
ALTER TABLE exercise_items ADD COLUMN youtube_author TEXT;
ALTER TABLE exercise_items ADD COLUMN youtube_author_url TEXT;
ALTER TABLE exercise_items ADD COLUMN youtube_thumbnail_url TEXT;
ALTER TABLE exercise_items ADD COLUMN youtube_verified_at TEXT;

-- Pre-002 external URLs have no complete trusted tuple, so downgrade them instead of inventing provenance.
UPDATE meal_plan_items
SET image_url = NULL,
    image_alt = NULL,
    image_source_url = NULL,
    image_license = NULL,
    image_author = NULL,
    image_verified_at = NULL
WHERE image_url IS NOT NULL;

UPDATE exercise_items
SET youtube_url = NULL,
    youtube_video_id = NULL,
    youtube_title = NULL,
    youtube_author = NULL,
    youtube_author_url = NULL,
    youtube_thumbnail_url = NULL,
    youtube_verified = 0,
    youtube_source = NULL,
    youtube_verified_at = NULL
WHERE youtube_url IS NOT NULL
   OR youtube_verified IS NOT 0
   OR youtube_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lab_results_report_id
ON lab_results(report_id);

CREATE INDEX IF NOT EXISTS idx_meal_plans_report_created_at
ON meal_plans(lab_report_id, created_at);

CREATE INDEX IF NOT EXISTS idx_meal_plan_items_plan_meal_type
ON meal_plan_items(meal_plan_id, meal_type);

CREATE INDEX IF NOT EXISTS idx_exercise_plans_report_created_at
ON exercise_plans(lab_report_id, created_at);

CREATE INDEX IF NOT EXISTS idx_exercise_items_plan_id
ON exercise_items(exercise_plan_id);
