// /api/badges — list every badge with whether the current user has earned it,
// plus their rank derived from the latest estimated band.

const express = require('express');
const { sql, ensureInit } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { bandToRank } = require('../lib/awards');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT b.id, b.slug, b.title, b.icon, b.description,
             ub.awarded_at,
             (ub.user_id IS NOT NULL) AS earned
      FROM badges b
      LEFT JOIN user_badges ub
        ON ub.badge_id = b.id AND ub.user_id = ${req.user.id}
      ORDER BY (ub.user_id IS NULL), b.id
    `;
    const p = await sql`SELECT current_band FROM speaking_progress WHERE user_id = ${req.user.id}`;
    const currentBand = p[0] ? Number(p[0].current_band || 0) : 0;
    res.json({
      badges: rows,
      rank: bandToRank(currentBand),
      current_band: currentBand
    });
  } catch (e) {
    console.error('badges list', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
