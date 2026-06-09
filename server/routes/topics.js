// /api/topics — public list. Authed clients receive band-graded sample answers
// plus useful vocabulary, common mistakes, and follow-up questions.

const express = require('express');
const { sql, ensureInit } = require('../db');
const { getUserFromReq } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await ensureInit();
    // Public list excludes drafts.
    const rows = await sql`
      SELECT id, title, part, category, questions,
             answer_65, answer_80,
             useful_vocabulary, common_mistakes, followup_questions,
             created_at
      FROM topics WHERE draft = FALSE ORDER BY created_at DESC
    `;
    const user = getUserFromReq(req);
    const topics = rows.map(t => {
      // Unauthed visitors get the question prompts only — the rich content is
      // a paid/account-locked benefit.
      if (!user) {
        const { answer_65, answer_80, useful_vocabulary, common_mistakes, followup_questions, ...rest } = t;
        return rest;
      }
      return t;
    });
    res.json({ topics });
  } catch (e) {
    console.error('topics list', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const rows = await sql`
      SELECT id, title, part, category, questions,
             answer_65, answer_80,
             useful_vocabulary, common_mistakes, followup_questions
      FROM topics WHERE id = ${id} AND draft = FALSE
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const user = getUserFromReq(req);
    const topic = rows[0];
    if (!user) {
      delete topic.answer_65;
      delete topic.answer_80;
      delete topic.useful_vocabulary;
      delete topic.common_mistakes;
      delete topic.followup_questions;
    }
    res.json({ topic });
  } catch (e) {
    console.error('topic get', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
