// Speak_Age Express entry point.
// Mounted under /api/* by vercel.json; locally serves both the API and the
// static frontend so the whole app runs with one `npm run dev` command.

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const passport = require('passport');

// Load .env for local development. Vercel provides env vars directly in prod.
try { require('dotenv').config(); } catch (_) {}

require('./passport').init();

const authRouter = require('./routes/auth');
const topicsRouter = require('./routes/topics');
const shadowingRouter = require('./routes/shadowing');
const materialsRouter = require('./routes/materials');
const adminRouter = require('./routes/admin');
const progressRouter = require('./routes/progress');
const aiRouter = require('./routes/ai');
const recordingsRouter = require('./routes/recordings');
const dashboardRouter = require('./routes/dashboard');
const drillsRouter = require('./routes/drills');
const badgesRouter = require('./routes/badges');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(cookieParser());
app.use(passport.initialize());

// ----- API routes -----
app.use('/api/auth', authRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/shadowing', shadowingRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/progress', progressRouter);
app.use('/api/ai', aiRouter);
app.use('/api/recordings', recordingsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/drills', drillsRouter);
app.use('/api/badges', badgesRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// JSON 404 for unknown API routes
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ----- Static frontend (local dev only; Vercel serves files directly) -----
const ROOT = path.resolve(__dirname, '..');
app.use(express.static(ROOT, { extensions: ['html'] }));

// SPA-ish fallback to index.html for unknown routes
app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));

// Generic error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

// Boot when run directly (`node server/index.js` or `npm run dev`).
// Vercel imports the app as a serverless function (see api/index.js).
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Speak_Age listening on http://localhost:${port}`));
}

module.exports = app;
