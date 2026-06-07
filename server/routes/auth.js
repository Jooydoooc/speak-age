// /api/auth/* — register, login, logout, me, forgot, OAuth (Google/Apple/GitHub)

const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const { sql, ensureInit } = require('../db');
const {
  signToken, signTokenFor,
  setAuthCookie, setAuthCookieFor,
  clearAuthCookie,
  getUserAndMaybeRefresh,
  requireAuth
} = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  try {
    await ensureInit();
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be 8+ chars' });

    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (existing.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO users (name, email, password_hash, provider, role, status)
      VALUES (${name}, ${email.toLowerCase()}, ${hash}, 'email', 'student', 'active')
      RETURNING id, name, email, role
    `;
    const user = rows[0];
    setAuthCookie(res, signToken(user));
    res.json({ user });
  } catch (e) {
    console.error('register', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    await ensureInit();
    const { email, password, remember } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const rows = await sql`SELECT id, name, email, password_hash, role FROM users WHERE email = ${email.toLowerCase()}`;
    const user = rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Remember me: checked → 30 days, unchecked → 1 day (effectively session-ish).
    const days = remember ? 30 : 1;
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role };
    setAuthCookieFor(res, signTokenFor(safe, days), days);
    res.json({ user: safe });
  } catch (e) {
    console.error('login', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  // getUserAndMaybeRefresh re-issues the cookie when fewer than ~24h remain,
  // so a user actively using the app stays signed in without re-login.
  const tokenUser = getUserAndMaybeRefresh(req, res);
  if (!tokenUser) return res.status(401).json({ user: null });
  try {
    await ensureInit();
    const rows = await sql`
      SELECT id, name, display_name, email, role, avatar_url
      FROM users WHERE id = ${tokenUser.id}
    `;
    if (rows.length === 0) return res.status(401).json({ user: null });
    const u = rows[0];
    const isAdmin = u.role === 'admin' || u.role === 'teacher';
    res.json({
      user: {
        id: u.id,
        name: u.name,
        display_name: u.display_name || u.name,
        email: u.email,
        role: u.role,
        avatar_url: u.avatar_url,
        isAdmin
      }
    });
  } catch (e) {
    console.error('me', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile — currently only display_name is editable.
router.put('/profile', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const { display_name } = req.body || {};
    if (typeof display_name !== 'string') return res.status(400).json({ error: 'display_name required' });
    const trimmed = display_name.trim().slice(0, 100);
    if (!trimmed) return res.status(400).json({ error: 'Name cannot be empty' });
    await sql`UPDATE users SET display_name = ${trimmed} WHERE id = ${req.user.id}`;
    res.json({ ok: true, display_name: trimmed });
  } catch (e) {
    console.error('profile put', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Content-creation stats — used by the admin/teacher profile page.
router.get('/stats', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM shadowing_lessons WHERE created_by = ${req.user.id}) AS lessons_added,
        (SELECT COUNT(*)::int FROM topics WHERE created_by = ${req.user.id}) AS topics_added,
        (SELECT COUNT(*)::int FROM materials WHERE created_by = ${req.user.id}) AS materials_uploaded
    `;
    res.json({ stats: rows[0] });
  } catch (e) {
    console.error('profile stats', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/providers', (_req, res) => {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY),
    github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
  });
});

router.post('/forgot', async (req, res) => {
  // Always return success to prevent email enumeration.
  // Real implementation would send an email with a signed token.
  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' });
  res.json({ ok: true });
});

// ---------- OAuth ----------
// Each strategy is only registered if its env vars are present.
function oauthFailRedirect() {
  return '/login.html?error=' + encodeURIComponent('Social sign-in failed');
}

async function finishOAuth(req, res) {
  // Passport puts the verified user on req.user (raw DB row).
  const user = req.user;
  if (!user) return res.redirect(oauthFailRedirect());
  setAuthCookie(res, signToken(user));
  if (user.role === 'admin' || user.role === 'teacher') return res.redirect('/admin.html');
  return res.redirect('/dashboard.html');
}

// Wrap passport.authenticate so any verify-callback error (e.g. DB missing)
// becomes a clean redirect to the login page with the message, instead of a
// raw 500 JSON response from the global error handler.
function oauthCallback(strategy, opts = {}) {
  return (req, res, next) => {
    passport.authenticate(strategy, { session: false, ...opts }, (err, user) => {
      if (err) {
        console.error(`[oauth:${strategy}]`, err);
        return res.redirect('/login.html?error=' + encodeURIComponent(err.message || 'Social sign-in failed'));
      }
      if (!user) return res.redirect(oauthFailRedirect());
      req.user = user;
      return finishOAuth(req, res);
    })(req, res, next);
  };
}

// Google
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
  router.get('/google/callback', oauthCallback('google'));
} else {
  router.get('/google', (_req, res) => res.redirect('/login.html?error=' + encodeURIComponent('Google sign-in not configured')));
}

// Apple
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY) {
  router.get('/apple', passport.authenticate('apple', { session: false }));
  router.post('/apple/callback', oauthCallback('apple'));
} else {
  router.get('/apple', (_req, res) => res.redirect('/login.html?error=' + encodeURIComponent('Apple sign-in not configured')));
}

// GitHub
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  router.get('/github', passport.authenticate('github', { scope: ['user:email'], session: false }));
  router.get('/github/callback', oauthCallback('github'));
} else {
  router.get('/github', (_req, res) => res.redirect('/login.html?error=' + encodeURIComponent('GitHub sign-in not configured')));
}

module.exports = router;
