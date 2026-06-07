// /api/materials — students only.

const express = require('express');
const { sql, ensureInit } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT id, title, category, file_url, file_size, created_at
      FROM materials ORDER BY created_at DESC
    `;
    res.json({ materials: rows });
  } catch (e) {
    console.error('materials list', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
