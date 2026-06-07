// /api/progress/* — fetch + write activity log entries.

const express = require('express');
const { sql, ensureInit } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/activity', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT action, detail, created_at FROM activity_log
      WHERE user_id = ${req.user.id} ORDER BY created_at DESC LIMIT 20
    `;
    res.json({ activity: rows });
  } catch (e) {
    console.error('activity get', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/activity', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const { action, detail } = req.body || {};
    if (!action) return res.status(400).json({ error: 'Action required' });
    await sql`
      INSERT INTO activity_log (user_id, action, detail)
      VALUES (${req.user.id}, ${String(action).slice(0,80)}, ${String(detail || '').slice(0,300)})
    `;
    res.json({ ok: true });
  } catch (e) {
    console.error('activity post', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
