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
- Work directly on the main branch: git checkout main
- Commit changes straight to main (this ships to live production)
- After every change: commit and push to main

## General Rules
- Never hardcode secrets
- Never remove existing features when adding new ones
- Ask before deleting anything
- Mobile responsive always (min tap target 44px)
- Dark theme: bg #09090b, surface #0f0f12, accent #6d28d9
- After every task: commit and push to main automatically

## Known Issues
- Transcript sync offset: use offset_seconds field to fix timing
- Admin UI exists in two places: standalone /admin (admin.html + js/admin.js) AND tabs inside /profile — keep both in sync when editing admin features
- Token limit: work on ONE file at a time, never scan entire project

## Session Start Checklist
1. Read this file
2. git checkout main
3. Ask: "What would you like to work on today?"
4. Work only on relevant files
5. After finishing: commit and push to main

---

## Skill: IELTS Reading HTML Pro

---
name: ielts-reading-html-pro
description: >
  Use this skill when the user wants to create, improve, debug, or regenerate a single-file IELTS Academic Reading HTML test. It is especially relevant for IELTS Reading passages, True/False/Not Given, Yes/No/Not Given, matching headings, matching information, matching features, matching sentence endings, multiple choice, sentence completion, note/table/summary/flow-chart completion, diagram labelling, short-answer questions, answer checking, evidence highlighting, explanations, PDF export, timer, localStorage progress, and student-facing reading mock platforms. Build one polished, self-contained HTML file unless the user asks otherwise.
---

# IELTS Reading HTML Pro Skill

## Purpose

Create polished, exam-style IELTS Academic Reading HTML files for Doniyor's reading platform. The output should normally be a **single `.html` file** containing the full layout, CSS, JavaScript, passage, questions, answers, explanations, evidence highlighting, timer, progress tracking, PDF export, and Telegram/community link.

The file should feel like a serious IELTS practice product: clean, modern, focused, mobile-friendly, and easy for students to use.

---

## Default product identity

Use these defaults unless the user gives different branding:

- Platform name: `Reading Mock Pro`
- Short tagline: `Train with focus.`
- Main color: `#1E3A8A`
- Secondary color: `#0F766E`
- Light background: `#F3F4F6`
- Border color: `#E5E7EB`
- Telegram link: `https://t.me/CD_materialss`
- Telegram label: `@CD_materialss` (icon only in header, text in result modal)

Do not hardcode private Telegram bot tokens or chat IDs in HTML/JS. If Telegram integration beyond a simple public link is requested, route it through a backend/serverless function and environment variables.

---

## Header HTML (exact structure)

Always use this exact header structure. Icons come from Font Awesome 6.0.0.

```html
<header class="header" role="banner">
  <div class="header__logo">
    <div class="brand">
      <span class="ielts-logo" aria-label="IELTS">IELTS</span>
      <a class="brand-telegram" href="https://t.me/CD_materialss" target="_blank"
         rel="noopener noreferrer" title="Join our Telegram channel @CD_materialss"
         aria-label="Open Telegram channel @CD_materialss in a new tab">
        <i class="fa-brands fa-telegram" aria-hidden="true"></i>
      </a>
    </div>
  </div>
  <div class="header__center">
    <div class="header__timer" id="testTimer" role="timer">00:00</div>
    <button class="header-retake hidden" id="headerRetakeBtn" aria-label="Retake test">
      <i class="fas fa-redo" aria-hidden="true"></i> Retake
    </button>
  </div>
  <div class="header__icons">
    <button class="header__icon" id="fullscreenToggle" title="Full screen" aria-label="Toggle full screen">
      <i class="fas fa-expand" aria-hidden="true"></i>
    </button>
    <button class="header__icon" id="helpToggleBtn" title="Help" aria-label="Open help">
      <i class="fas fa-question-circle" aria-hidden="true"></i>
    </button>
    <button class="header__icon" id="menuToggleBtn" title="Options" aria-label="Open options">
      <i class="fas fa-bars" aria-hidden="true"></i>
    </button>
  </div>
</header>
```

Mobile tab bar (shown on screens ≤800px):
```html
<nav class="mobile-tabs" role="tablist">
  <button class="mobile-tab" role="tab" data-tab="passage" aria-selected="true">
    <i class="fas fa-book-open" aria-hidden="true"></i>Passage
  </button>
  <button class="mobile-tab" role="tab" data-tab="questions" aria-selected="false">
    <i class="fas fa-list-check" aria-hidden="true"></i>Questions
  </button>
  <button class="mobile-tab" role="tab" data-tab="sheet" aria-selected="false">
    <i class="fas fa-clipboard-list" aria-hidden="true"></i>Answer Sheet
  </button>
</nav>
```

Start screen meta icons:
```html
<span><i class="fa-regular fa-clock" aria-hidden="true"></i><strong>60 min</strong></span>
<span><i class="fa-solid fa-list-check" aria-hidden="true"></i><strong>40 questions</strong></span>
<span><i class="fa-solid fa-book-open" aria-hidden="true"></i><strong>Academic</strong></span>
<span><i class="fa-regular fa-calendar" aria-hidden="true"></i><strong id="dashDate">—</strong></span>
```

Result modal buttons:
```html
<button class="btn-print" id="printReportBtn"><i class="fas fa-file-pdf"></i> Export PDF</button>
<button class="btn-copy" id="copyReportBtn"><i class="far fa-copy"></i> Copy Report</button>
<button class="btn-telegram" id="copyTelegramBtn"><i class="fa-brands fa-telegram"></i> Copy Telegram Report</button>
<button class="btn-retake" id="retakeBtn"><i class="fas fa-redo"></i> Retake Test</button>
<button class="btn-close" id="closeSubmission2">Close</button>
```

Review flag button (used next to every question):
```html
<button class="review-flag" data-q="1" title="Mark for review">
  <i class="fa-regular fa-bookmark"></i>
</button>
```

Warning on start screen:
```html
<div class="start-warning">
  <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
  <span>Do not refresh or close the page during the test.</span>
</div>
```



---

## When information is missing

Do **not** force unnecessary follow-up questions. Use this rule:

1. If the user provides a passage but no questions, generate IELTS-style questions, answers, explanations, and evidence snippets.
2. If the user provides questions but no answers, infer answers from the passage when possible.
3. If the user provides answers but no explanations, write clear explanations with paragraph references.
4. If the passage title is missing, create a natural academic title.
5. If the localStorage key is missing, generate it automatically using:

```js
const STORAGE_KEY = "ielts_cdi_" + slugifiedTitle + "_v1";
```

Ask a follow-up only when a missing item makes the task impossible or would clearly change the final file.

---

## Output requirements

When creating an HTML test, produce:

1. One complete `.html` file.
2. Full updated file content, not partial snippets, when the user asks for code.
3. A downloadable file if artifact creation is possible.
4. Valid HTML, CSS, and JavaScript.
5. No placeholder functions such as `...`, `TODO`, or `add logic here`.
6. No missing answer keys or explanation objects.
7. Mobile-responsive design.
8. Accessible form controls with labels or clear question text.
9. Student-friendly explanations after checking answers.
10. Evidence highlighting that scrolls to the relevant passage paragraph.

---

## Recommended HTML structure

Use this structure for every generated file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IELTS Reading — Test Title</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <style>
    /* Full CSS goes here */
  </style>
</head>
<body>
  <main id="app">
    <section id="startScreen"></section>
    <section id="testScreen" class="hidden"></section>
    <section id="resultScreen" class="hidden"></section>
  </main>
  <script>
    /* Full JS engine goes here */
  </script>
</body>
</html>
```

CDN links are allowed, but explain that the file is self-contained except for optional external fonts/PDF library.

---

## Required data model

Represent test content with clear objects.

```js
const testMeta = {
  platform: "Reading Mock Pro",
  tagline: "Train with focus.",
  passageNumber: 1,
  title: "Passage Title",
  subtitle: "Academic Reading Practice",
  totalQuestions: 13,
  timeLimitMinutes: 20,
  telegramUrl: "https://t.me/CD_materialss",
  storageKey: "ielts_cdi_passage_title_v1"
};

const passage = [
  {
    id: "para-A",
    label: "A",
    text: "Full paragraph text..."
  },
  {
    id: "para-B",
    label: "B",
    text: "Full paragraph text..."
  }
];

const questionGroups = [
  {
    range: "Questions 1-5",
    type: "TRUE_FALSE_NOT_GIVEN",
    instruction: "Do the following statements agree with the information given in the text?",
    questions: [
      {
        id: 1,
        text: "Statement text...",
        options: ["TRUE", "FALSE", "NOT GIVEN"]
      }
    ]
  }
];

const answerKey = {
  1: {
    answer: "TRUE",
    paragraph: "para-B",
    evidence: "exact evidence phrase from the passage",
    explanation: "The statement matches the passage because..."
  }
};
```

For multi-answer questions, use arrays:

```js
7: {
  answer: ["B", "D"],
  paragraph: "para-C",
  evidence: "exact evidence phrase",
  explanation: "Both options are correct because..."
}
```

For answers where order does not matter, add:

```js
orderMatters: false
```

---

## Supported question types and templates

### TRUE / FALSE / NOT GIVEN

Use when the question asks whether statements agree with **factual information**.

```js
{
  id: 1,
  type: "radio",
  text: "The first chocolate drinks were sweetened with sugar.",
  options: ["TRUE", "FALSE", "NOT GIVEN"]
}
```

### YES / NO / NOT GIVEN

Use when the question asks whether statements agree with the **writer's views or claims**.

```js
{
  id: 1,
  type: "radio",
  text: "The writer believes that museums should primarily educate visitors.",
  options: ["YES", "NO", "NOT GIVEN"]
}
```

### Multiple choice, one answer

```js
{
  id: 4,
  type: "mcq-single",
  text: "What was the main reason for the change?",
  options: {
    A: "A lack of public interest",
    B: "A fall in production costs",
    C: "A government restriction",
    D: "A new scientific discovery"
  }
}
```

### Multiple choice, two or three answers

```js
{
  id: 5,
  type: "mcq-multiple",
  text: "Which TWO factors are mentioned?",
  required: 2,
  options: {
    A: "Lower prices",
    B: "Improved transport",
    C: "Better education",
    D: "Increased demand",
    E: "Reduced taxes"
  }
}
```

### Sentence completion

```js
{
  id: 8,
  type: "text",
  textBefore: "The researchers discovered that the main problem was ",
  textAfter: ".",
  wordLimit: "NO MORE THAN TWO WORDS"
}
```

### Note / table / summary completion without a box

```js
{
  id: 9,
  type: "text",
  label: "Main material used:",
  wordLimit: "ONE WORD ONLY"
}
```

### Summary completion with a box

```js
{
  id: 10,
  type: "select",
  textBefore: "The process became more efficient after the introduction of ",
  textAfter: ".",
  options: ["machinery", "chemicals", "transport", "advertising"]
}
```

### Matching headings

```js
const headingOptions = {
  i: "Early commercial success",
  ii: "A problem that remained unsolved",
  iii: "Changes in public attitudes",
  iv: "The origins of a new industry"
};

{
  id: 14,
  type: "select",
  text: "Paragraph A",
  options: headingOptions
}
```

### Matching information

```js
{
  id: 18,
  type: "select",
  text: "a reference to an unexpected result",
  options: ["A", "B", "C", "D", "E"]
}
```

### Matching features

```js
{
  id: 22,
  type: "select",
  text: "introduced the first successful model",
  options: {
    A: "James Smith",
    B: "Maria Lopez",
    C: "Chen Wei"
  }
}
```

### Matching sentence endings

```js
{
  id: 26,
  type: "select",
  textBefore: "The first experiments failed because",
  options: {
    A: "the equipment was too expensive.",
    B: "the results were difficult to measure.",
    C: "the sample size was too small."
  }
}
```

### Short-answer questions

```js
{
  id: 31,
  type: "text",
  text: "What material was used to protect the surface?",
  wordLimit: "NO MORE THAN THREE WORDS"
}
```

### Diagram labelling

Represent diagram labels as normal text inputs. Include an image/diagram only when the user provides one or requests a generated schematic.

```js
{
  id: 35,
  type: "text",
  label: "35",
  text: "Part of the machine that collects waste",
  wordLimit: "ONE WORD ONLY"
}
```

---

## Scoring engine

Use exact matching after normalization. Accept alternative answers when appropriate.

```js
function normalizeAnswer(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,;:!?()]/g, "")
    .replace(/\s+/g, " ");
}

function isCorrect(userAnswer, correctAnswer) {
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.some(ans => normalizeAnswer(ans) === normalizeAnswer(userAnswer));
  }
  return normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer);
}

function isMultiCorrect(userAnswers, correctAnswers, orderMatters = true) {
  const user = userAnswers.map(normalizeAnswer).filter(Boolean);
  const correct = correctAnswers.map(normalizeAnswer);
  if (user.length !== correct.length) return false;
  if (orderMatters) return user.every((ans, i) => ans === correct[i]);
  return correct.every(ans => user.includes(ans));
}
```

---

## Band score functions

For 13-question single-passage files:

```js
function getBandFor13(score) {
  if (score >= 13) return 9.0;
  if (score >= 12) return 8.5;
  if (score >= 11) return 8.0;
  if (score >= 10) return 7.5;
  if (score >= 9) return 7.0;
  if (score >= 8) return 6.5;
  if (score >= 7) return 6.0;
  if (score >= 6) return 5.5;
  if (score >= 5) return 5.0;
  if (score >= 4) return 4.5;
  if (score >= 3) return 4.0;
  if (score >= 2) return 3.5;
  if (score >= 1) return 3.0;
  return 0;
}
```

For 14-question single-passage files:

```js
function getBandFor14(score) {
  if (score >= 14) return 9.0;
  if (score >= 13) return 8.5;
  if (score >= 12) return 8.0;
  if (score >= 11) return 7.5;
  if (score >= 10) return 7.0;
  if (score >= 9) return 6.5;
  if (score >= 8) return 6.0;
  if (score >= 7) return 5.5;
  if (score >= 6) return 5.0;
  if (score >= 5) return 4.5;
  if (score >= 4) return 4.0;
  if (score >= 3) return 3.5;
  if (score >= 1) return 3.0;
  return 0;
}
```

For other totals, use an approximate percentage scale and label it clearly as approximate:

```js
function getApproxBand(score, total) {
  const pct = total ? score / total : 0;
  if (pct >= 0.95) return 9.0;
  if (pct >= 0.90) return 8.5;
  if (pct >= 0.82) return 8.0;
  if (pct >= 0.75) return 7.5;
  if (pct >= 0.68) return 7.0;
  if (pct >= 0.60) return 6.5;
  if (pct >= 0.52) return 6.0;
  if (pct >= 0.45) return 5.5;
  if (pct >= 0.38) return 5.0;
  if (pct >= 0.30) return 4.5;
  if (pct >= 0.22) return 4.0;
  if (pct > 0) return 3.0;
  return 0;
}
```

---

## Evidence highlighting

Every answer should include:

- `paragraph`: paragraph ID such as `para-B`
- `evidence`: exact phrase from the passage
- `explanation`: student-friendly reason

Use this highlighting logic:

```js
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clearHighlights() {
  document.querySelectorAll(".passage-paragraph").forEach(p => {
    if (p.dataset.original) p.innerHTML = p.dataset.original;
  });
}

function highlightEvidence(questionId) {
  clearHighlights();
  const item = answerKey[questionId];
  if (!item || !item.paragraph || !item.evidence) return;

  const para = document.getElementById(item.paragraph);
  if (!para) return;

  if (!para.dataset.original) para.dataset.original = para.innerHTML;
  const original = para.dataset.original;
  const pattern = new RegExp(escapeRegExp(item.evidence), "i");

  para.innerHTML = original.replace(pattern, match => `<mark class="evidence-mark">${match}</mark>`);
  para.scrollIntoView({ behavior: "smooth", block: "center" });
}
```

If exact evidence cannot be found because of punctuation differences, still scroll to the paragraph and show the explanation.

---

## Timer and autosave

Include a 20-minute timer for one passage by default. Save answers to localStorage so students do not lose progress.

```js
let remainingSeconds = testMeta.timeLimitMinutes * 60;
let timerId = null;

function startTimer() {
  timerId = setInterval(() => {
    remainingSeconds -= 1;
    renderTimer();
    saveProgress();
    if (remainingSeconds <= 0) {
      clearInterval(timerId);
      submitTest(true);
    }
  }, 1000);
}

function renderTimer() {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  document.getElementById("timer").textContent = `${m}:${String(s).padStart(2, "0")}`;
}
```

---

## UX requirements

The page should include:

1. Start screen with title, subtitle, question count, time limit, and start button.
2. Sticky top bar with timer, progress, theme toggle, and submit button.
3. Two-column desktop layout: passage left, questions right.
4. Single-column mobile layout.
5. Question navigation pills.
6. Clear visual states: unanswered, answered, correct, incorrect.
7. Result screen with score, approximate band, time used, and review list.
8. Review buttons that highlight passage evidence.
9. PDF export button.
10. Reset/retry button.
11. Telegram/community button.

---

## CSS style guidance

Use a clean modern style:

- Font: Inter, system fallback
- Rounded cards: `18px` to `24px`
- Soft shadows
- Strong but not distracting blue/teal branding
- Comfortable line height for passage text: `1.75`
- Passage max-width readable, not too wide
- High contrast between questions and passage
- Dark mode support via a class such as `.dark`
- Optional yellow/reading theme via a class such as `.warm`

Use CSS variables:

```css
:root {
  --primary: #1E3A8A;
  --secondary: #0F766E;
  --bg: #F3F4F6;
  --card: #FFFFFF;
  --text: #111827;
  --muted: #6B7280;
  --border: #E5E7EB;
  --success: #15803D;
  --danger: #B91C1C;
  --warning: #F59E0B;
}
```

---

## IELTS content quality rules

When generating questions:

1. Use IELTS Academic Reading style, not school-exam style.
2. Avoid questions that can be answered from general knowledge.
3. Avoid vague evidence.
4. Make distractors plausible.
5. For TRUE/FALSE/NOT GIVEN:
   - TRUE = directly supported
   - FALSE = directly contradicted
   - NOT GIVEN = not stated or cannot be concluded
6. For YES/NO/NOT GIVEN, focus on views, claims, opinions, or arguments.
7. For completion tasks, respect the word limit.
8. Answers should be natural IELTS answer forms, usually noun phrases.
9. Matching headings should test main ideas, not small details.
10. Matching information should test scanning ability and may include repeated paragraph options if the task allows it.

---

## Explanation style

Explanations should be simple and useful for learners.

Good explanation pattern:

```text
The answer is TRUE because paragraph B says that the method reduced costs after the new machine was introduced. This directly matches the statement.
```

For NOT GIVEN:

```text
The passage mentions the company’s profits, but it does not say whether customers preferred the new product. Therefore, the answer is NOT GIVEN.
```

For completion:

```text
The words “protective coating” are needed because paragraph D says the surface was covered with a protective coating to prevent damage.
```

---

## Final QA checklist before returning the file

Before finalizing, verify:

- [ ] The file is a complete `.html` document.
- [ ] All question IDs are unique.
- [ ] Question numbers match the displayed range.
- [ ] Every question has an answer in `answerKey`.
- [ ] Every answer has an explanation.
- [ ] Every answer has paragraph reference and evidence where possible.
- [ ] Text inputs, radio buttons, selects, and checkboxes are rendered correctly.
- [ ] Multi-answer questions are scored correctly.
- [ ] Normalization accepts capitalization and punctuation differences.
- [ ] Timer works.
- [ ] Submit button works.
- [ ] Results show score and band.
- [ ] Review buttons highlight evidence.
- [ ] localStorage key is unique.
- [ ] Reset clears saved answers.
- [ ] Mobile layout is usable.
- [ ] No private tokens or secrets are hardcoded.

---

## Response behavior

When using this skill:

- For a file-generation request, create the actual downloadable HTML file when possible.
- For a code request, provide the full updated file.
- For a review/debug request, identify issues and give corrected full code if requested.
- Keep explanations practical and product-focused.
- Do not over-explain internal implementation unless the user asks.
