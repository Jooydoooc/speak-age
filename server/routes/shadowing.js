// /api/shadowing — list, lesson detail (with sentences + user progress),
// and progress tracking. Students only.

const express = require('express');
const { sql, ensureInit } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT
        l.id, l.title, l.youtube_url, l.level, l.duration, l.topic,
        l.video_source, l.video_url, l.thumbnail_url, l.duration_seconds,
        l.created_at,
        (SELECT COUNT(*)::int FROM sentences s WHERE s.lesson_id = l.id) AS sentence_count,
        COALESCE(p.completed, FALSE) AS completed,
        COALESCE(array_length(p.sentences_completed, 1), 0) AS practiced_count
      FROM shadowing_lessons l
      LEFT JOIN user_lesson_progress p
        ON p.lesson_id = l.id AND p.user_id = ${req.user.id}
      ORDER BY l.created_at DESC
    `;
    res.json({ lessons: rows });
  } catch (e) {
    console.error('shadowing list', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Bad lesson id' });

    const lessonRows = await sql`
      SELECT id, title, youtube_url, level, duration, topic, transcript, key_phrases, phrases,
             video_source, video_url, cloudinary_public_id, thumbnail_url, duration_seconds,
             offset_seconds
      FROM shadowing_lessons WHERE id = ${id}
    `;
    if (lessonRows.length === 0) return res.status(404).json({ error: 'Not found' });
    const lesson = lessonRows[0];

    const sentences = await sql`
      SELECT id, idx, ts_seconds, text FROM sentences
      WHERE lesson_id = ${id} ORDER BY idx ASC
    `;

    const progressRows = await sql`
      SELECT sentences_completed, completed, difficulty_rating, updated_at FROM user_lesson_progress
      WHERE user_id = ${req.user.id} AND lesson_id = ${id}
    `;
    const progress = progressRows[0] || { sentences_completed: [], completed: false, difficulty_rating: null };

    res.json({ lesson, sentences, progress });
  } catch (e) {
    console.error('shadowing get', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record practiced sentence indices. Idempotent — repeated indices coalesce
// into a set. We expect { sentence_idx: number } per call (one sentence at a
// time, fired client-side when the student finishes shadowing a line).
router.post('/:id/progress', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const sentenceIdx = Number(req.body && req.body.sentence_idx);
    if (!Number.isInteger(id) || !Number.isInteger(sentenceIdx) || sentenceIdx < 0) {
      return res.status(400).json({ error: 'Bad request' });
    }

    // Upsert + dedupe in one statement
    await sql`
      INSERT INTO user_lesson_progress (user_id, lesson_id, sentences_completed)
      VALUES (${req.user.id}, ${id}, ARRAY[${sentenceIdx}]::INTEGER[])
      ON CONFLICT (user_id, lesson_id) DO UPDATE
      SET sentences_completed = (
        SELECT ARRAY(SELECT DISTINCT unnest(user_lesson_progress.sentences_completed || EXCLUDED.sentences_completed))
      ),
      updated_at = NOW()
    `;

    const out = await sql`
      SELECT sentences_completed, completed FROM user_lesson_progress
      WHERE user_id = ${req.user.id} AND lesson_id = ${id}
    `;
    res.json({ progress: out[0] });
  } catch (e) {
    console.error('shadowing progress', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/rate', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const r = Number(req.body && req.body.rating);
    if (!Number.isInteger(id) || !Number.isInteger(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'rating must be 1–5' });
    }
    await sql`
      INSERT INTO user_lesson_progress (user_id, lesson_id, difficulty_rating)
      VALUES (${req.user.id}, ${id}, ${r})
      ON CONFLICT (user_id, lesson_id) DO UPDATE
      SET difficulty_rating = ${r}, updated_at = NOW()
    `;
    res.json({ ok: true, rating: r });
  } catch (e) {
    console.error('shadowing rate', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const value = req.body && req.body.completed !== undefined ? !!req.body.completed : true;
    await sql`
      INSERT INTO user_lesson_progress (user_id, lesson_id, completed)
      VALUES (${req.user.id}, ${id}, ${value})
      ON CONFLICT (user_id, lesson_id) DO UPDATE
      SET completed = ${value}, updated_at = NOW()
    `;
    // Mirror to activity_log so the dashboard activity feed picks it up.
    if (value) {
      const t = await sql`SELECT title FROM shadowing_lessons WHERE id = ${id}`;
      const title = t[0] ? t[0].title : `Lesson #${id}`;
      await sql`
        INSERT INTO activity_log (user_id, action, detail)
        VALUES (${req.user.id}, 'lesson_completed', ${'Completed shadowing: ' + title})
      `;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('shadowing complete', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
