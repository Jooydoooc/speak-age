// Auth middleware: signs / verifies JWT in an httpOnly cookie and enforces roles.
//
// Cookie strategy
//   - httpOnly: yes (no JS access, so XSS can't lift the token)
//   - secure: true in production (HTTPS only)
//   - sameSite: 'lax' — sent on top-level cross-site navigations (which covers
//     the Google → /api/auth/google/callback redirect) but not on third-party
//     subresource requests. This is the modern recommended default.
//
// Default lifetime is 7 days. Login can override (1d / 30d via "Remember me");
// OAuth callbacks use the 7d default. /api/auth/me silently refreshes the
// cookie when fewer than 24h remain, so an active user never gets logged out
// mid-session.

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const DAY_MS     = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 7;
const REFRESH_THRESHOLD_MS = DAY_MS; // refresh if <1 day left

function isProd() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

// Sign a JWT for `user` that expires in `days` days.
function signTokenFor(user, days = DEFAULT_DAYS) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: `${days}d` }
  );
}
// Back-compat alias — same default.
function signToken(user) { return signTokenFor(user, DEFAULT_DAYS); }

// Set the auth cookie with `days` of life.
function setAuthCookieFor(res, token, days = DEFAULT_DAYS) {
  res.cookie('auth', token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    maxAge: days * DAY_MS,
    path: '/'
  });
}
function setAuthCookie(res, token) { setAuthCookieFor(res, token, DEFAULT_DAYS); }

function clearAuthCookie(res) {
  res.clearCookie('auth', { path: '/' });
}

function getUserFromReq(req) {
  const token = req.cookies && req.cookies.auth;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); }
  catch (_) { return null; }
}

// Verify the cookie; if valid and close to expiring, mint and set a fresh
// cookie for the same number of days. Returns the (possibly refreshed) user
// payload, or null if no/invalid token.
function getUserAndMaybeRefresh(req, res) {
  const token = req.cookies && req.cookies.auth;
  if (!token) return null;
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); }
  catch (_) { return null; }

  if (decoded && decoded.exp) {
    const msLeft = decoded.exp * 1000 - Date.now();
    if (msLeft > 0 && msLeft < REFRESH_THRESHOLD_MS) {
      // Re-issue with the default lifetime so an active user stays signed in.
      const fresh = signTokenFor(decoded, DEFAULT_DAYS);
      setAuthCookieFor(res, fresh, DEFAULT_DAYS);
    }
  }
  return decoded;
}

function requireAuth(req, res, next) {
  const user = getUserAndMaybeRefresh(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = getUserAndMaybeRefresh(req, res);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  };
}

module.exports = {
  JWT_SECRET,
  DEFAULT_COOKIE_DAYS: DEFAULT_DAYS,
  signToken,
  signTokenFor,
  setAuthCookie,
  setAuthCookieFor,
  clearAuthCookie,
  getUserFromReq,
  getUserAndMaybeRefresh,
  requireAuth,
  requireRole
};
