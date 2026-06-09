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

---

## File Structure (key files only)
frontend/
  index.html              → home page (space hero background)
  shadowing.html          → shadowing lessons list
  shadowing-lesson.html   → single lesson (video + transcript sync)
  topics.html             → speaking topics (Part 1/2/3)
  exercises.html          → pronunciation + fluency exercises
  materials.html          → study materials (PDFs)
  profile.html            → profile + admin panel (tabbed)
  login.html              → login page
  register.html           → register page

js/
  shadowing-lesson.js     → transcript sync, slow mode, word tooltips, IPA
  profile.js              → profile tabs, admin content management
  topics.js               → speaking topics filter and display
  auth.js                 → login, register, Google OAuth
  main.js                 → navbar, dropdown, shared functions

server/
  index.js                → Express entry point
  routes/auth.js          → login, register, Google OAuth, JWT
  routes/lessons.js       → shadowing lessons CRUD
  routes/topics.js        → speaking topics CRUD
  routes/materials.js     → study materials upload
  routes/admin.js         → admin actions, student management
  routes/ai.js            → Gemini feedback + transcript fixing
  middleware/auth.js      → JWT verification + role checks
  db/index.js             → Neon PostgreSQL client

---

## Database Tables
- users: id, name, email, password_hash, provider, role, avatar_url, created_at
- shadowing_lessons: id, title, youtube_url, cloudinary_url, video_source, level, transcript, key_phrases, offset_seconds, thumbnail_url, duration_seconds, created_by, created_at
- sentences: id, lesson_id, timestamp_seconds (FLOAT), text
- topics: id, title, part, category, questions, answer_65, answer_80, created_by, created_at
- materials: id, title, category, file_url, file_size, created_by, created_at
- exercises: id, type, title, content (JSON), created_at
- progress: id, user_id, fluency_pct, pronunciation_pct, vocabulary_pct, topics_done, lessons_done, exercises_done, updated_at
- activity_log: id, user_id, action, detail, created_at
- user_ai_usage: id, user_id, date, count

---

## Roles & Access
- student → all content pages, dashboard, profile
- teacher → same as student + view-only admin tabs
- admin → everything including add/edit/delete content + manage students

## Shadowing Lesson Levels (IELTS Enigma curriculum)
Beginner → Elementary → Pre-IELTS → Introduction → Graduation

---

## Environment Variables (never hardcode these)
DATABASE_URL, JWT_SECRET, SESSION_SECRET
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
GEMINI_API_KEY, OPENAI_API_KEY

---

## Branch Rules
- ALWAYS start session with: git checkout dev
- NEVER commit directly to main
- After every change: npm run save-dev
- When user says "go live": npm run go-live (creates PR on GitHub)
- User merges PR manually on GitHub → Vercel auto-deploys

## General Rules
- Never hardcode secrets — always use process.env
- Never remove existing features when adding new ones
- Ask before deleting anything
- Keep all pages mobile responsive (min tap target 44px)
- Dark theme colors: bg #09090b, surface #0f0f12, accent #6d28d9
- After finishing any task: run npm run save-dev automatically

---

## Current Known Issues (fix these when relevant)
- Transcript sync offset: speaker starts at different time than transcript timestamp
- Admin panel is inside /profile page (tabbed) — no separate /admin route
- Token limit: work on ONE file at a time, do not scan entire project

---

## How to Start Every Session
1. Read this CLAUDE.md file
2. Run: git checkout dev
3. Ask user: "What would you like to work on today?"
4. Work only on files relevant to the task
5. After finishing: run npm run save-dev
