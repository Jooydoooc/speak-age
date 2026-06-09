// Speaking platform helpers: progress aggregation, daily streak, badge awards,
// and band -> rank derivation. Kept in one file so any route that affects
// speaking activity can call the same functions and stay in sync.

const { sql } = require('../db');

// Convert a 0-9 band score to a 0-100 percentage for the dashboard bars.
function bandToPct(band) {
  const n = Number(band);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((n / 9) * 100)));
}

// Map estimated band -> rank ladder. Thresholds use lower bound inclusive.
function bandToRank(band) {
  const n = Number(band) || 0;
  if (n >= 7.5) return 'Speaking Master';
  if (n >= 7.0) return 'Band 8 Candidate';
  if (n >= 6.5) return 'Band 7 Speaker';
  if (n >= 6.0) return 'IELTS Communicator';
  if (n >= 5.5) return 'Confident Speaker';
  return 'Silent Starter';
}

// Recompute the speaking_progress snapshot for one user. Averages the most
// recent N feedback rows (default 5) so the dashboard reflects current ability
// rather than ancient scores.
async function recomputeSpeakingProgress(userId, recentN = 5) {
  if (!sql) return;
  const recent = await sql`
    SELECT f.fluency, f.pronunciation, f.grammar, f.vocabulary, f.coherence, f.estimated_band
    FROM recording_feedback f
    JOIN recordings r ON r.id = f.recording_id
    WHERE r.user_id = ${userId}
    ORDER BY f.reviewed_at DESC
    LIMIT ${recentN}
  `;

  const totals = { fluency: 0, pronunciation: 0, grammar: 0, vocabulary: 0, coherence: 0, band: 0 };
  let band_n = 0;
  for (const f of recent) {
    totals.fluency       += Number(f.fluency       || 0);
    totals.pronunciation += Number(f.pronunciation || 0);
    totals.grammar       += Number(f.grammar       || 0);
    totals.vocabulary    += Number(f.vocabulary    || 0);
    totals.coherence     += Number(f.coherence     || 0);
    if (f.estimated_band != null) { totals.band += Number(f.estimated_band); band_n += 1; }
  }
  const n = recent.length || 1;
  const avg = {
    fluency:       totals.fluency / n,
    pronunciation: totals.pronunciation / n,
    grammar:       totals.grammar / n,
    vocabulary:    totals.vocabulary / n,
    coherence:     totals.coherence / n
  };
  const currentBand = band_n > 0 ? +(totals.band / band_n).toFixed(1) : 0;

  // Weakest area — the lowest of the five sub-scores. Only meaningful if there
  // is at least one feedback row; otherwise leave NULL.
  let weakest = null;
  if (recent.length > 0) {
    weakest = Object.entries(avg).reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  }

  // Counters
  const [{ count: recordings_submitted }] = await sql`
    SELECT COUNT(*)::int AS count FROM recordings WHERE user_id = ${userId}
  `;
  const [{ count: topics_practiced }] = await sql`
    SELECT COUNT(DISTINCT topic_id)::int AS count FROM recordings
    WHERE user_id = ${userId} AND topic_id IS NOT NULL
  `;

  await sql`
    INSERT INTO speaking_progress (
      user_id, fluency_pct, pronunciation_pct, grammar_pct, vocabulary_pct, coherence_pct,
      current_band, topics_practiced, recordings_submitted, weakest_area, updated_at
    )
    VALUES (
      ${userId},
      ${bandToPct(avg.fluency)},
      ${bandToPct(avg.pronunciation)},
      ${bandToPct(avg.grammar)},
      ${bandToPct(avg.vocabulary)},
      ${bandToPct(avg.coherence)},
      ${currentBand},
      ${topics_practiced},
      ${recordings_submitted},
      ${weakest},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      fluency_pct          = EXCLUDED.fluency_pct,
      pronunciation_pct    = EXCLUDED.pronunciation_pct,
      grammar_pct          = EXCLUDED.grammar_pct,
      vocabulary_pct       = EXCLUDED.vocabulary_pct,
      coherence_pct        = EXCLUDED.coherence_pct,
      current_band         = EXCLUDED.current_band,
      topics_practiced     = EXCLUDED.topics_practiced,
      recordings_submitted = EXCLUDED.recordings_submitted,
      weakest_area         = EXCLUDED.weakest_area,
      updated_at           = NOW()
  `;
}

// Bump the daily streak. If last_activity_date == today, no change. If it was
// yesterday, increment. Otherwise reset to 1. Updates longest_streak as needed.
async function updateStreak(userId) {
  if (!sql) return;
  const rows = await sql`SELECT current_streak, longest_streak, last_activity_date FROM user_streak WHERE user_id = ${userId}`;
  const row = rows[0];
  if (!row) {
    await sql`
      INSERT INTO user_streak (user_id, current_streak, longest_streak, last_activity_date)
      VALUES (${userId}, 1, 1, CURRENT_DATE)
    `;
    return;
  }
  const last = row.last_activity_date ? new Date(row.last_activity_date) : null;
  const today = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  let next = 1;
  if (last) {
    const diffDays = Math.round((new Date(today.toDateString()) - new Date(last.toDateString())) / dayMs);
    if (diffDays === 0) return;            // already counted today
    if (diffDays === 1) next = (row.current_streak || 0) + 1;
  }
  const longest = Math.max(Number(row.longest_streak || 0), next);
  await sql`
    UPDATE user_streak
    SET current_streak = ${next}, longest_streak = ${longest},
        last_activity_date = CURRENT_DATE, updated_at = NOW()
    WHERE user_id = ${userId}
  `;
}

// Award any badges the user has newly qualified for. Idempotent — composite PK
// on user_badges prevents duplicates. Returns the list of newly awarded slugs
// so the caller can surface a toast to the student.
async function checkAndAwardBadges(userId) {
  if (!sql) return [];

  const newlyAwarded = [];
  const award = async (slug) => {
    const b = await sql`SELECT id FROM badges WHERE slug = ${slug}`;
    if (b.length === 0) return;
    const inserted = await sql`
      INSERT INTO user_badges (user_id, badge_id)
      VALUES (${userId}, ${b[0].id})
      ON CONFLICT DO NOTHING
      RETURNING badge_id
    `;
    if (inserted.length > 0) newlyAwarded.push(slug);
  };

  const [{ recordings_count }] = await sql`SELECT COUNT(*)::int AS recordings_count FROM recordings WHERE user_id = ${userId}`;
  if (recordings_count >= 1)  await award('first-recording');
  if (recordings_count >= 25) await award('fluency-builder');

  const [{ part2_count }] = await sql`SELECT COUNT(*)::int AS part2_count FROM recordings WHERE user_id = ${userId} AND part = 2`;
  if (part2_count >= 10) await award('part-2-fighter');

  const [{ lessons_done }] = await sql`SELECT COUNT(*)::int AS lessons_done FROM user_lesson_progress WHERE user_id = ${userId} AND completed = TRUE`;
  if (lessons_done >= 20) await award('shadowing-master');

  const streakRows = await sql`SELECT current_streak FROM user_streak WHERE user_id = ${userId}`;
  if (streakRows[0] && Number(streakRows[0].current_streak) >= 7) await award('streak-7');

  // Band-7 vocabulary: any feedback row with vocabulary >= 7.
  const vocab = await sql`
    SELECT 1 FROM recording_feedback f
    JOIN recordings r ON r.id = f.recording_id
    WHERE r.user_id = ${userId} AND f.vocabulary >= 7
    LIMIT 1
  `;
  if (vocab.length > 0) await award('band-7-vocab');

  // Pronunciation improver: latest pronunciation score is at least 1 band
  // higher than the first one.
  const pron = await sql`
    SELECT f.pronunciation, f.reviewed_at
    FROM recording_feedback f
    JOIN recordings r ON r.id = f.recording_id
    WHERE r.user_id = ${userId} AND f.pronunciation IS NOT NULL
    ORDER BY f.reviewed_at ASC
  `;
  if (pron.length >= 2 && Number(pron[pron.length - 1].pronunciation) - Number(pron[0].pronunciation) >= 1) {
    await award('pronunciation-improver');
  }

  return newlyAwarded;
}

// Friendly label for the "next recommended task" CTA on the dashboard.
function recommendedNextTask({ recordings_submitted, weakest_area }) {
  if (!recordings_submitted) return { title: 'Record your first answer', href: 'topics.html' };
  switch (weakest_area) {
    case 'pronunciation': return { title: 'Practise a pronunciation drill', href: 'drills.html' };
    case 'fluency':       return { title: 'Try a Part 2 long-turn',         href: 'topics.html?part=2' };
    case 'vocabulary':    return { title: 'Explore a new topic',            href: 'topics.html' };
    case 'grammar':       return { title: 'Answer a Part 3 question',       href: 'topics.html?part=3' };
    case 'coherence':     return { title: 'Practise structuring an answer', href: 'topics.html?part=2' };
    default:              return { title: 'Pick a topic and record yourself', href: 'topics.html' };
  }
}

module.exports = {
  bandToPct,
  bandToRank,
  recomputeSpeakingProgress,
  updateStreak,
  checkAndAwardBadges,
  recommendedNextTask
};
