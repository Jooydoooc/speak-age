// /api/ai/* — AI-assisted content tooling for admins.
//
// All endpoints here are admin-only. They forward to third-party AI APIs and
// each request costs real money, so they're gated separately from the staff
// read endpoints. The Gemini API key is loaded from GEMINI_API_KEY in env.

const express = require('express');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = requireRole('admin');

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

// Hard ceiling on the raw transcript size so a runaway paste can't blow up
// the request payload or rack up token cost. ~64KB is enough for an hour-long
// YouTube auto-transcript with headroom to spare.
const MAX_RAW_BYTES = 64 * 1024;

function buildPrompt(rawTranscript, youtubeUrl) {
  // Keeping the prompt exactly as specified by the product. The IELTS-context
  // additions live in the final paragraph.
  const urlNote = youtubeUrl ? `\nSource video: ${youtubeUrl}\n` : '';
  return `You are helping format a transcript for an English language shadowing lesson platform. Clean up this raw YouTube transcript:

Rules:
- Merge broken sentence fragments into complete natural sentences
- Keep timestamps — format each line as [m:ss] sentence
- Remove filler sounds: um, uh, er, hmm
- Remove: (Laughter), (Applause), (Music), [Music] markers
- Fix punctuation and capitalization
- Do NOT change the actual words spoken
- Do NOT add words that were not said
- Each line = one complete sentence or natural phrase
- Keep timestamps accurate to the original
- Return ONLY the formatted transcript, nothing else

IELTS context:
- If transcript contains IELTS speaking topics, preserve technical terms verbatim
- Keep any band score references (e.g. "Band 7", "7.5") intact
- Preserve quoted speech with proper " " quotation marks
${urlNote}
Raw transcript:
${rawTranscript}`;
}

// Pull out the text response. Gemini returns it nested several levels deep
// and the path varies slightly when safety filters block the output, so we
// hunt for the first text part rather than indexing blindly.
function extractText(data) {
  const cands = (data && data.candidates) || [];
  for (const c of cands) {
    const parts = c && c.content && c.content.parts;
    if (!Array.isArray(parts)) continue;
    const t = parts.map(p => (p && p.text) || '').join('').trim();
    if (t) return t;
  }
  return '';
}

router.post('/fix-transcript', adminOnly, async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(500).json({
        error: 'AI features not configured — set GEMINI_API_KEY in environment'
      });
    }

    const raw = String((req.body && req.body.raw_transcript) || '').trim();
    if (!raw) return res.status(400).json({ error: 'raw_transcript is required' });
    if (Buffer.byteLength(raw, 'utf8') > MAX_RAW_BYTES) {
      return res.status(413).json({ error: 'Transcript is too large (limit ~64KB)' });
    }
    const youtubeUrl = String((req.body && req.body.youtube_url) || '').trim();

    const url = `${GEMINI_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
    const body = {
      contents: [{ parts: [{ text: buildPrompt(raw, youtubeUrl) }] }],
      // Lower temperature so the model sticks to faithful cleanup instead of
      // paraphrasing. The prompt already says "do not change the words", but
      // a low temp reinforces it.
      generationConfig: { temperature: 0.2 }
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify(body)
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error('gemini upstream', upstream.status, errText.slice(0, 500));
      return res.status(502).json({
        error: `Gemini returned ${upstream.status} — check the API key and model name`
      });
    }
    const data = await upstream.json();
    const cleaned = extractText(data);
    if (!cleaned) {
      return res.status(502).json({ error: 'Gemini returned no usable text' });
    }
    res.json({ cleaned });
  } catch (e) {
    console.error('ai fix-transcript', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
