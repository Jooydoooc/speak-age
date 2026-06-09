// /api/drills — pronunciation drill catalog and per-user practice tracking.
// Catalog is seeded once in db init (9 drills for Uzbek learners).

const express = require('express');
const { sql, ensureInit } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { updateStreak, checkAndAwardBadges } = require('../lib/awards');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT d.id, d.slug, d.title, d.category, d.explanation, d.examples, d.level,
             COALESCE(p.practice_count, 0) AS practice_count,
             p.last_practised
      FROM pronunciation_drills d
      LEFT JOIN user_drill_progress p
        ON p.drill_id = d.id AND p.user_id = ${req.user.id}
      ORDER BY d.id ASC
    `;
    res.json({ drills: rows });
  } catch (e) {
    console.error('drills list', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:slug', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const slug = String(req.params.slug || '').slice(0, 60);
    const rows = await sql`
      SELECT d.id, d.slug, d.title, d.category, d.explanation, d.examples, d.level,
             COALESCE(p.practice_count, 0) AS practice_count,
             p.last_practised
      FROM pronunciation_drills d
      LEFT JOIN user_drill_progress p
        ON p.drill_id = d.id AND p.user_id = ${req.user.id}
      WHERE d.slug = ${slug}
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Drill not found' });
    res.json({ drill: rows[0] });
  } catch (e) {
    console.error('drill get', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark a drill practised — bumps practice_count for this user. Streak counts
// too, so drilling daily keeps the streak alive.
router.post('/:slug/practise', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const slug = String(req.params.slug || '').slice(0, 60);
    const d = await sql`SELECT id FROM pronunciation_drills WHERE slug = ${slug}`;
    if (d.length === 0) return res.status(404).json({ error: 'Drill not found' });

    await sql`
      INSERT INTO user_drill_progress (user_id, drill_id, practice_count, last_practised)
      VALUES (${req.user.id}, ${d[0].id}, 1, NOW())
      ON CONFLICT (user_id, drill_id) DO UPDATE
      SET practice_count = user_drill_progress.practice_count + 1,
          last_practised = NOW()
    `;
    await sql`
      INSERT INTO activity_log (user_id, action, detail)
      VALUES (${req.user.id}, 'drill_practised', ${'Drill: ' + slug})
    `;
    await updateStreak(req.user.id);
    const newBadges = await checkAndAwardBadges(req.user.id);
    res.json({ ok: true, new_badges: newBadges });
  } catch (e) {
    console.error('drill practise', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
