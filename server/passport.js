// Passport OAuth strategies — Google / Apple / GitHub.
// Each strategy is registered only if its env vars are present, so the app
// boots cleanly even when only some providers are configured.

const passport = require('passport');
const { sql, ensureInit } = require('./db');

async function upsertOAuthUser({ email, name, provider, avatar_url }) {
  if (!sql) throw new Error('DATABASE_URL is not configured');
  if (!email) throw new Error('OAuth account did not return an email');
  await ensureInit();
  const existing = await sql`SELECT id, name, email, role FROM users WHERE email = ${email.toLowerCase()}`;
  if (existing.length) return existing[0];
  const rows = await sql`
    INSERT INTO users (name, email, provider, role, status, avatar_url)
    VALUES (${name || email.split('@')[0]}, ${email.toLowerCase()}, ${provider}, 'student', 'active', ${avatar_url || null})
    RETURNING id, name, email, role
  `;
  return rows[0];
}

// Absolute base URL for OAuth callbacks. Must match what's registered with
// each provider, so we lock it down here instead of letting passport derive
// the host from the request (each Vercel deploy gets a different hostname).
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function init() {
  // ----- Google -----
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const GoogleStrategy = require('passport-google-oauth20').Strategy;
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${BASE_URL}/api/auth/google/callback`
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] && profile.emails[0].value;
        const avatar = profile.photos && profile.photos[0] && profile.photos[0].value;
        const user = await upsertOAuthUser({
          email, name: profile.displayName, provider: 'google', avatar_url: avatar
        });
        done(null, user);
      } catch (e) { done(e); }
    }));
  }

  // ----- Apple -----
  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY) {
    try {
      const AppleStrategy = require('passport-apple');
      passport.use(new AppleStrategy({
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        keyID: process.env.APPLE_KEY_ID,
        privateKeyString: process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        callbackURL: `${BASE_URL}/api/auth/apple/callback`,
        scope: ['name', 'email'],
        passReqToCallback: false
      }, async (accessToken, refreshToken, idToken, profile, done) => {
        try {
          // Apple returns email in the idToken on first sign-in
          const jwt = require('jsonwebtoken');
          const decoded = idToken ? jwt.decode(idToken) : {};
          const email = (decoded && decoded.email) || (profile && profile.email);
          const name = (profile && profile.name && (profile.name.firstName + ' ' + (profile.name.lastName || ''))) || email;
          const user = await upsertOAuthUser({ email, name, provider: 'apple' });
          done(null, user);
        } catch (e) { done(e); }
      }));
    } catch (e) {
      console.warn('Apple strategy not loaded:', e.message);
    }
  }

  // ----- GitHub -----
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    const GitHubStrategy = require('passport-github2').Strategy;
    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${BASE_URL}/api/auth/github/callback`,
      scope: ['user:email']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] && profile.emails[0].value;
        const avatar = profile.photos && profile.photos[0] && profile.photos[0].value;
        const user = await upsertOAuthUser({
          email, name: profile.displayName || profile.username, provider: 'github', avatar_url: avatar
        });
        done(null, user);
      } catch (e) { done(e); }
    }));
  }
}

module.exports = { init };
