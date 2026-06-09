# CLAUDE.md — Speak_Age Project Instructions

## Read this file first. Do not scan other files until asked.

---

## Project Overview
Speak_Age is a premium IELTS speaking practice platform.
- Live site: speak-age.vercel.app
- Repo: github.com/Jooydoooc/speak-age
- Stack: HTML/CSS/Vanilla JS (frontend) + Node.js/Express (backend) + PostgreSQL via Neon (database)
- Auth: JWT in httpOnly cookies + Google OAuth via Passport.js
- Videos: YouTube iframe embed + Cloudinary upload
- AI: Google Gemini API (answer feedback + transcript fixing)
- Deployment: Vercel

## File Structure (key files only)
- index.html → home page
- shadowing.html → lessons list
- shadowing-lesson.html → single lesson page
- topics.html → speaking topics
- exercises.html → exercises
- materials.html → study materials
- profile.html → profile + admin tabs (teacher/admin view)
- admin.html → standalone admin panel
- dashboard.html → student dashboard
- login.html / register.html / forgot-password.html → auth pages
- js/main.js → navbar, shared functions
- js/auth.js → login, register, Google OAuth
- js/shadowing.js → lessons list page
- js/shadowing-lesson.js → transcript sync, slow mode, IPA tooltips
- js/topics.js → speaking topics filter/display
- js/exercises.js → exercises page
- js/profile.js → profile tabs + admin tab content
- js/admin.js → standalone admin panel logic
- server/index.js → Express entry point
- server/passport.js → Passport strategies (Google/GitHub/Apple)
- api/index.js → Vercel serverless entry
- server/routes/auth.js → JWT + Google OAuth
- server/routes/shadowing.js → shadowing lessons CRUD
- server/routes/topics.js → speaking topics CRUD
- server/routes/materials.js → study materials upload
- server/routes/admin.js → admin actions, student management
- server/routes/progress.js → user progress tracking
- server/routes/ai.js → Gemini feedback + transcript fixing
- server/middleware/auth.js → JWT + role checks
- server/db/index.js → Neon PostgreSQL client

## Database Tables
- users: id, name, email, password_hash, provider, role, avatar_url, created_at
- shadowing_lessons: id, title, youtube_url, cloudinary_url, video_source, level, offset_seconds, thumbnail_url, duration_seconds, created_by, created_at
- sentences: id, lesson_id, timestamp_seconds (FLOAT), text
- topics: id, title, part, category, questions, answer_65, answer_80, created_by, created_at
- materials: id, title, category, file_url, file_size, created_by, created_at
- exercises: id, type, title, content (JSON), created_at
- progress: id, user_id, fluency_pct, pronunciation_pct, vocabulary_pct, updated_at
- activity_log: id, user_id, action, detail, created_at
- user_ai_usage: id, user_id, date, count

## Roles & Access
- student → content pages + dashboard + profile
- teacher → same as student + view-only admin tabs
- admin → everything + add/edit/delete content + manage students

## Shadowing Lesson Levels
Beginner → Elementary → Pre-IELTS → Introduction → Graduation

## Environment Variables (NEVER hardcode)
DATABASE_URL, JWT_SECRET, SESSION_SECRET,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
GEMINI_API_KEY, OPENAI_API_KEY

## Branch Rules
- ALWAYS start with: git checkout dev
- NEVER commit to main directly
- After every change: npm run save-dev
- When user says "go live": npm run go-live
- User merges PR on GitHub manually

## General Rules
- Never hardcode secrets
- Never remove existing features when adding new ones
- Ask before deleting anything
- Mobile responsive always (min tap target 44px)
- Dark theme: bg #09090b, surface #0f0f12, accent #6d28d9
- After every task: run npm run save-dev automatically

## Known Issues
- Transcript sync offset: use offset_seconds field to fix timing
- Admin UI exists in two places: standalone /admin (admin.html + js/admin.js) AND tabs inside /profile — keep both in sync when editing admin features
- Token limit: work on ONE file at a time, never scan entire project

## Session Start Checklist
1. Read this file
2. git checkout dev
3. Ask: "What would you like to work on today?"
4. Work only on relevant files
5. After finishing: npm run save-dev
