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
      level TEXT NOT NULL,
      duration TEXT,
      topic TEXT,
      transcript TEXT,
      key_phrases TEXT,
      phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Level migration: legacy values were lowercase beginner/intermediate/advanced.
  // Curriculum is now five capitalized values. The constraint is renamed to _v2
  // so this whole block stays idempotent across re-runs.
  await sql`ALTER TABLE shadowing_lessons DROP CONSTRAINT IF EXISTS shadowing_lessons_level_check`;
  await sql`UPDATE shadowing_lessons SET level = 'Beginner'   WHERE level = 'beginner'`;
  await sql`UPDATE shadowing_lessons SET level = 'Elementary' WHERE level = 'intermediate'`;
  await sql`UPDATE shadowing_lessons SET level = 'Graduation' WHERE level = 'advanced'`;
  const hasLevelCheckV2 = await sql`
    SELECT 1 FROM pg_constraint WHERE conname = 'shadowing_lessons_level_check_v2'
  `;
  if (hasLevelCheckV2.length === 0) {
    await sql`
      ALTER TABLE shadowing_lessons
      ADD CONSTRAINT shadowing_lessons_level_check_v2
      CHECK (level IN ('Beginner','Elementary','Pre-IELTS','Introduction','Graduation'))
    `;
  }
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS phrases JSONB NOT NULL DEFAULT '[]'::jsonb`;
  // Video source tracking — 'youtube' (default for legacy rows) or 'cloudinary'.
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS video_source TEXT NOT NULL DEFAULT 'youtube'`;
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS video_url TEXT`;
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT`;
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`;
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`;
  // Transcript timing offset (seconds). Positive = delay highlights by N seconds
  // because the speaker starts later than the transcript's first timestamp.
  await sql`ALTER TABLE shadowing_lessons ADD COLUMN IF NOT EXISTS offset_seconds REAL NOT NULL DEFAULT 0`;
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

  // ============================================================
  // Speaking platform extensions (Phase 1)
  // ============================================================

  // Topics: extend with vocabulary, common mistakes, and follow-up questions.
  await sql`ALTER TABLE topics ADD COLUMN IF NOT EXISTS useful_vocabulary TEXT`;
  await sql`ALTER TABLE topics ADD COLUMN IF NOT EXISTS common_mistakes TEXT`;
  await sql`ALTER TABLE topics ADD COLUMN IF NOT EXISTS followup_questions TEXT`;

  // Student speaking recordings. status drives the review pipeline:
  //   'submitted' -> 'reviewed' (with feedback) or 'needs_improvement'.
  // topic_id is nullable so non-topic recordings (drills, free speech) fit too.
  await sql`
    CREATE TABLE IF NOT EXISTS recordings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
      part SMALLINT CHECK (part IN (1,2,3)),
      cloudinary_url TEXT NOT NULL,
      cloudinary_public_id TEXT,
      duration_sec INTEGER,
      status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted','reviewed','needs_improvement')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS recordings_user_idx ON recordings (user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS recordings_status_idx ON recordings (status, created_at DESC)`;

  // One feedback row per recording. Scores are 0-9 to match IELTS band scale.
  await sql`
    CREATE TABLE IF NOT EXISTS recording_feedback (
      recording_id INTEGER PRIMARY KEY REFERENCES recordings(id) ON DELETE CASCADE,
      fluency SMALLINT CHECK (fluency BETWEEN 0 AND 9),
      pronunciation SMALLINT CHECK (pronunciation BETWEEN 0 AND 9),
      grammar SMALLINT CHECK (grammar BETWEEN 0 AND 9),
      vocabulary SMALLINT CHECK (vocabulary BETWEEN 0 AND 9),
      coherence SMALLINT CHECK (coherence BETWEEN 0 AND 9),
      estimated_band NUMERIC(2,1) CHECK (estimated_band BETWEEN 0 AND 9),
      written_feedback TEXT,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Speaking-only progress snapshot. One row per student, refreshed on every
  // feedback insert. Keeps the dashboard fast (no joins/aggregates at read time).
  await sql`
    CREATE TABLE IF NOT EXISTS speaking_progress (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      fluency_pct SMALLINT NOT NULL DEFAULT 0,
      pronunciation_pct SMALLINT NOT NULL DEFAULT 0,
      grammar_pct SMALLINT NOT NULL DEFAULT 0,
      vocabulary_pct SMALLINT NOT NULL DEFAULT 0,
      coherence_pct SMALLINT NOT NULL DEFAULT 0,
      current_band NUMERIC(2,1) DEFAULT 0,
      target_band NUMERIC(2,1) DEFAULT 7.0,
      topics_practiced INTEGER NOT NULL DEFAULT 0,
      recordings_submitted INTEGER NOT NULL DEFAULT 0,
      weakest_area TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Pronunciation drill catalog. `examples` is a JSON array so the UI can
  // render examples as chips. Seeded once with 9 drills for Uzbek learners.
  await sql`
    CREATE TABLE IF NOT EXISTS pronunciation_drills (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      explanation TEXT,
      examples JSONB NOT NULL DEFAULT '[]'::jsonb,
      level TEXT NOT NULL DEFAULT 'Beginner',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    INSERT INTO pronunciation_drills (slug, title, category, explanation, examples, level) VALUES
      ('th-sounds',         'The /th/ sound',         'Consonants',       'Place your tongue between your teeth and blow air gently. Uzbek has no /th/, so most learners replace it with /s/, /z/, /t/, or /d/.', '["think","thank","this","that","three","weather","mother","birthday"]'::jsonb, 'Beginner'),
      ('r-vs-l',            '/r/ vs /l/',             'Consonants',       'For /r/ curl the tongue back without touching the roof. For /l/ the tongue tip touches behind the upper teeth.', '["right / light","road / load","river / liver","correct / collect","rice / lice","arrive / alive"]'::jsonb, 'Beginner'),
      ('word-stress',       'Word stress',            'Stress',           'English stresses one syllable louder, longer, and higher. Wrong stress can change meaning.', '["PHO-to-graph / pho-TO-gra-phy","PRE-sent (noun) / pre-SENT (verb)","ED-u-cate / e-du-CA-tion"]'::jsonb, 'Elementary'),
      ('sentence-stress',   'Sentence stress',        'Stress',           'Content words (nouns, verbs, adjectives, adverbs) are stressed. Function words (a, the, of, to) are weak.', '["I WANT to GO to the SHOP.","She CAN''T FIND her KEYS.","We''re GOING to LONDON on FRIDAY."]'::jsonb, 'Elementary'),
      ('intonation',        'Intonation',             'Prosody',          'Voice rises at the end of yes/no questions and falls at the end of statements and wh-questions.', '["Are you ready? ↗","I''m ready. ↘","Where are you going? ↘","Really? ↗"]'::jsonb, 'Pre-IELTS'),
      ('linking-sounds',    'Linking sounds',         'Connected speech', 'Native speakers connect words. A final consonant links to the next word''s vowel.', '["turn off -> tur-noff","an apple -> a-napple","pick it up -> pi-ki-tup","keep it -> kee-pit"]'::jsonb, 'Pre-IELTS'),
      ('weak-forms',        'Weak forms',             'Connected speech', 'Common function words have a reduced schwa /ə/ form in fast speech.', '["from -> /frəm/","to -> /tə/","and -> /ən/","of -> /əv/","for -> /fə/","but -> /bət/"]'::jsonb, 'Introduction'),
      ('ed-endings',        '-ed endings',            'Word endings',     'Past -ed has 3 sounds: /t/ after voiceless, /d/ after voiced, /ɪd/ after t/d.', '["walked /t/","stopped /t/","played /d/","arrived /d/","wanted /ɪd/","decided /ɪd/"]'::jsonb, 'Beginner'),
      ('plural-s',          'Plural -s endings',      'Word endings',     'Plural -s has 3 sounds: /s/ after voiceless, /z/ after voiced, /ɪz/ after s/z/sh/ch.', '["books /s/","cats /s/","dogs /z/","boys /z/","buses /ɪz/","watches /ɪz/"]'::jsonb, 'Beginner')
    ON CONFLICT (slug) DO NOTHING
  `;

  // Per-user drill practice counter.
  await sql`
    CREATE TABLE IF NOT EXISTS user_drill_progress (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      drill_id INTEGER NOT NULL REFERENCES pronunciation_drills(id) ON DELETE CASCADE,
      practice_count INTEGER NOT NULL DEFAULT 0,
      last_practised TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, drill_id)
    )
  `;

  // Badge catalog. Seeded once with the 7 starter badges.
  await sql`
    CREATE TABLE IF NOT EXISTS badges (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      icon TEXT,
      description TEXT
    )
  `;
  await sql`
    INSERT INTO badges (slug, title, icon, description) VALUES
      ('first-recording',        'First Recording',        '🎙️', 'Submitted your very first speaking recording.'),
      ('streak-7',               '7-Day Speaking Streak',  '🔥',  'Practised speaking 7 days in a row.'),
      ('part-2-fighter',         'Part 2 Fighter',         '⚔️',  'Completed 10 Part 2 long-turn recordings.'),
      ('shadowing-master',       'Shadowing Master',       '🎧',  'Finished 20 shadowing lessons.'),
      ('pronunciation-improver', 'Pronunciation Improver', '🔊',  'Raised your pronunciation score by at least 1 band.'),
      ('band-7-vocab',           'Band 7 Vocabulary',      '📚',  'Scored 7+ on vocabulary in a teacher review.'),
      ('fluency-builder',        'Fluency Builder',        '💬',  'Submitted 25 recordings in total.')
    ON CONFLICT (slug) DO NOTHING
  `;

  // Awarded badges. Composite PK prevents duplicates per user.
  await sql`
    CREATE TABLE IF NOT EXISTS user_badges (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
      awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, badge_id)
    )
  `;

  // Daily speaking streak. last_activity_date is a DATE for day-level diff.
  await sql`
    CREATE TABLE IF NOT EXISTS user_streak (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_activity_date DATE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

let initPromise = null;
function ensureInit() {
  if (!initPromise) initPromise = init().catch(e => { initPromise = null; throw e; });
  return initPromise;
}

module.exports = { sql, ensureInit };
