-- Migration 001: Initial database schema
-- Creates all core tables for Y Tế Cho Người Bình Thường

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('MALE', 'FEMALE', 'OTHER')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS lab_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  image_reference TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING', 'PROCESSED', 'FAILED')) DEFAULT 'PENDING',
  source_type TEXT NOT NULL CHECK(source_type IN ('CAMERA', 'UPLOAD')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS lab_results (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  test_code TEXT NOT NULL,
  test_name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  reference_low REAL,
  reference_high REAL,
  reference_text TEXT,
  status TEXT NOT NULL CHECK(status IN ('LOW', 'NORMAL', 'HIGH', 'UNKNOWN')),
  ocr_confidence REAL DEFAULT 1.0,
  reference_source TEXT NOT NULL CHECK(reference_source IN ('LAB_REPORT', 'SYSTEM_DEFAULT')) DEFAULT 'LAB_REPORT',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (report_id) REFERENCES lab_reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lab_report_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (lab_report_id) REFERENCES lab_reports(id)
);

CREATE TABLE IF NOT EXISTS meal_plan_items (
  id TEXT PRIMARY KEY,
  meal_plan_id TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DRINK')),
  name TEXT NOT NULL,
  description TEXT,
  ingredients TEXT,
  preparation TEXT,
  image_url TEXT,
  rationale TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exercise_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lab_report_id TEXT,
  title TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (lab_report_id) REFERENCES lab_reports(id)
);

CREATE TABLE IF NOT EXISTS exercise_items (
  id TEXT PRIMARY KEY,
  exercise_plan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('EASY', 'MEDIUM', 'HARD')),
  rationale TEXT,
  youtube_url TEXT,
  youtube_verified INTEGER DEFAULT 0,
  youtube_source TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (exercise_plan_id) REFERENCES exercise_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('USER', 'ASSISTANT')),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);
