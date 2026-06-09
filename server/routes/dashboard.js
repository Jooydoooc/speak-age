// /api/dashboard/speaking — single endpoint that returns everything the
// speaking dashboard needs in one round trip.

const express = require('express');
const { sql, ensureInit } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { bandToRank, recommendedNextTask } = require('../lib/awards');

const router = express.Router();

router.get('/speaking', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const uid = req.user.id;

    // Ensure a progress row exists so the UI never has to handle nulls.
    const progressRows = await sql`SELECT * FROM speaking_progress WHERE user_id = ${uid}`;
    let progress = progressRows[0];
    if (!progress) {
      await sql`INSERT INTO speaking_progress (user_id) VALUES (${uid}) ON CONFLICT DO NOTHING`;
      progress = (await sql`SELECT * FROM speaking_progress WHERE user_id = ${uid}`)[0] || {};
    }

    const streakRows = await sql`SELECT current_streak, longest_streak, last_activity_date FROM user_streak WHERE user_id = ${uid}`;
    const streak = streakRows[0] || { current_streak: 0, longest_streak: 0, last_activity_date: null };

    const feedbackHistory = await sql`
      SELECT f.recording_id, f.fluency, f.pronunciation, f.grammar, f.vocabulary, f.coherence,
             f.estimated_band, f.written_feedback, f.reviewed_at,
             t.title AS topic_title, r.part, u.display_name AS reviewer_name
      FROM recording_feedback f
      JOIN recordings r ON r.id = f.recording_id
      LEFT JOIN topics t ON t.id = r.topic_id
      LEFT JOIN users u ON u.id = f.reviewed_by
      WHERE r.user_id = ${uid}
      ORDER BY f.reviewed_at DESC
      LIMIT 20
    `;

    const badges = await sql`
      SELECT b.slug, b.title, b.icon, b.description, ub.awarded_at
      FROM badges b
      JOIN user_badges ub ON ub.badge_id = b.id
      WHERE ub.user_id = ${uid}
      ORDER BY ub.awarded_at DESC
    `;

    const rank = bandToRank(progress.current_band);
    const nextTask = recommendedNextTask({
      recordings_submitted: Number(progress.recordings_submitted || 0),
      weakest_area: progress.weakest_area
    });

    res.json({
      progress: {
        fluency_pct:          Number(progress.fluency_pct || 0),
        pronunciation_pct:    Number(progress.pronunciation_pct || 0),
        grammar_pct:          Number(progress.grammar_pct || 0),
        vocabulary_pct:       Number(progress.vocabulary_pct || 0),
        coherence_pct:        Number(progress.coherence_pct || 0),
        current_band:         Number(progress.current_band || 0),
        target_band:          Number(progress.target_band || 7.0),
        topics_practiced:     Number(progress.topics_practiced || 0),
        recordings_submitted: Number(progress.recordings_submitted || 0),
        weakest_area:         progress.weakest_area
      },
      streak,
      rank,
      next_task: nextTask,
      feedback_history: feedbackHistory,
      badges
    });
  } catch (e) {
    console.error('dashboard speaking', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Student-side target band update.
router.post('/speaking/target', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const t = Number(req.body && req.body.target_band);
    if (!Number.isFinite(t) || t < 4 || t > 9) {
      return res.status(400).json({ error: 'target_band must be between 4 and 9' });
    }
    await sql`
      INSERT INTO speaking_progress (user_id, target_band) VALUES (${req.user.id}, ${t})
      ON CONFLICT (user_id) DO UPDATE SET target_band = ${t}, updated_at = NOW()
    `;
    res.json({ ok: true, target_band: t });
  } catch (e) {
    console.error('dashboard target', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
