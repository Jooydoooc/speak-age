// Neon PostgreSQL client + schema bootstrap.
// Uses the serverless-friendly @neondatabase/serverless driver.

const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL is not set — database operations will fail');
}

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

async function init() {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT,
      display_name TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      provider TEXT DEFAULT 'email',
      role TEXT DEFAULT 'student',
      status TEXT DEFAULT 'active',
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Idempotent migration: ensure column exists then backfill from `name`.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT`;
  await sql`UPDATE users SET display_name = name WHERE display_name IS NULL AND name IS NOT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS topics (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      part INTEGER NOT NULL CHECK (part IN (1,2,3)),
      category TEXT NOT NULL,
      questions TEXT NOT NULL,
      answer_65 TEXT,
      answer_80 TEXT,
      draft BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Idempotent migration for existing DBs.
  await sql`ALTER TABLE topics ADD COLUMN IF NOT EXISTS draft BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE topics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;
  await sql`
    CREATE TABLE IF NOT EXISTS shadowing_lessons (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      youtube_url TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
      duration TEXT,
      topic TEXT,
      transcript TEXT,
      key_phrases TEXT,
      phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS phrases JSONB NOT NULL DEFAULT '[]'::jsonb`;
  // Video source tracking — 'youtube' (default for legacy rows) or 'cloudinary'.
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS video_source TEXT NOT NULL DEFAULT 'youtube'`;
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS video_url TEXT`;
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT`;
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`;
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`;
  // youtube_url was NOT NULL in the original schema; relax it now that Cloudinary
  // sources put their URL in video_url instead.
  await sql`ALTER TABLE shadowing_lessons ALTER COLUMN youtube_url DROP NOT NULL`;

  // One row per sentence in a lesson. idx defines order; ts_seconds enables seek+sync.
  await sql`
    CREATE TABLE IF NOT EXISTS sentences (
      id SERIAL PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES shadowing_lessons(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      ts_seconds INTEGER NOT NULL,
      text TEXT NOT NULL,
      UNIQUE (lesson_id, idx)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sentences_lesson_idx_idx ON sentences (lesson_id, idx)`;

  // Per-user lesson progress. sentences_completed is an int[] of sentence indices
  // the student has practiced (for the progress bar). completed is a single bool.
  await sql`
    CREATE TABLE IF NOT EXISTS user_lesson_progress (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL REFERENCES shadowing_lessons(id) ON DELETE CASCADE,
      sentences_completed INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      difficulty_rating SMALLINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, lesson_id)
    )
  `;
  await sql`ALTER TABLE user_lesson_progress ADD COLUMN IF NOT EXISTS difficulty_rating SMALLINT`;
  await sql`
    CREATE TABLE IF NOT EXISTS exercises (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS materials (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      fluency_pct INTEGER DEFAULT 0,
      pronunciation_pct INTEGER DEFAULT 0,
      vocabulary_pct INTEGER DEFAULT 0,
      topics_done INTEGER DEFAULT 0,
      lessons_done INTEGER DEFAULT 0,
      exercises_done INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

let initPromise = null;
function ensureInit() {
  if (!initPromise) initPromise = init().catch(e => { initPromise = null; throw e; });
  return initPromise;
}

module.exports = { sql, ensureInit };
