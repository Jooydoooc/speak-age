# Speak_Age

Premium IELTS speaking practice platform — built for students targeting **Band 6.5 to 8.0**.

> Speak with confidence. Score with precision.

---

## Stack

- **Frontend** — HTML / CSS / vanilla JS (no framework)
- **Backend** — Node.js + Express
- **Database** — Neon (serverless PostgreSQL)
- **Auth** — Email/password (bcrypt + JWT in httpOnly cookies) plus Google, Apple and GitHub OAuth via Passport
- **PDF storage** — Cloudinary
- **Video** — YouTube iframe embeds
- **Hosting** — Vercel (Express runs as a serverless function under `/api/*`)

The hero space background (stars + planet + ring) is rendered on a `<canvas>` in pure JS — no images, no libraries.

---

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# …then fill in DATABASE_URL, JWT_SECRET, and any OAuth providers you want enabled.

# 3. Run
npm run dev
# → http://localhost:3000
```

Tables are created automatically on first request (`ensureInit`).

### Create your first admin

After registering an account through the UI, promote it via the Neon console:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

Roles: `student` (default), `teacher`, `admin`.

---

## 1. Create the Neon database

1. Sign up at [neon.tech](https://neon.tech) (free tier is enough).
2. Create a project — name it `speak_age`.
3. Copy the **pooled** connection string from the dashboard.
4. Paste it as `DATABASE_URL` in `.env` (or Vercel → Settings → Environment Variables).

> The connection string ends with `?sslmode=require`. Keep it.

---

## 2. Google OAuth

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. **Create credentials → OAuth client ID → Web application**.
3. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/google/callback`
   - `https://YOUR_DOMAIN/api/auth/google/callback`
4. Copy the Client ID & secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

---

## 3. Apple Sign In (optional)

1. [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers) → create a **Services ID**.
2. Enable Sign in with Apple, set return URL `https://YOUR_DOMAIN/api/auth/apple/callback`.
3. Create a **Key** with Sign in with Apple enabled, download the `.p8`.
4. Fill in `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and paste the key contents into `APPLE_PRIVATE_KEY` (use `\n` for newlines or rely on dotenv's multiline support).

---

## 4. GitHub OAuth (optional)

1. [GitHub → Settings → Developer settings → OAuth apps → New](https://github.com/settings/developers).
2. Authorization callback URL: `https://YOUR_DOMAIN/api/auth/github/callback`.
3. Paste credentials into `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

---

## 5. Cloudinary (PDF uploads)

1. Sign up at [cloudinary.com](https://cloudinary.com).
2. From the dashboard copy the cloud name, API key, and API secret.
3. Fill `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

---

## 6. Deploy to Vercel

```bash
npm install -g vercel
vercel link        # connect to a project
vercel env pull    # optional: pull existing env into .env.local
vercel             # preview deploy
vercel --prod      # production deploy
```

In the Vercel dashboard, paste every variable from `.env.example` into **Settings → Environment Variables** for both Preview and Production.

`vercel.json` routes `/api/*` to the Express app and serves the HTML/CSS/JS as static assets.

---

## File map

```
/
├── index.html, topics.html, shadowing.html, exercises.html,
│   materials.html, dashboard.html, admin.html,
│   login.html, register.html, forgot-password.html
├── css/style.css
├── js/  main.js · auth.js · topics.js · shadowing.js · exercises.js · admin.js
├── server/
│   ├── index.js              Express entry point
│   ├── passport.js           OAuth strategy registration
│   ├── routes/  auth · topics · shadowing · materials · admin · progress
│   ├── middleware/auth.js    JWT + role checks
│   └── db/index.js           Neon client + schema bootstrap
├── api/index.js              Vercel serverless wrapper
├── vercel.json
└── .env.example
```

---

## Access control

| Page             | Public | Student | Teacher | Admin |
| ---------------- | :----: | :-----: | :-----: | :---: |
| Home             |   ✓    |    ✓    |    ✓    |   ✓   |
| Topics (list)    |   ✓    |    ✓    |    ✓    |   ✓   |
| Topics (answers) |        |    ✓    |    ✓    |   ✓   |
| Shadowing        |        |    ✓    |    ✓    |   ✓   |
| Exercises        |        |    ✓    |    ✓    |   ✓   |
| Materials        |        |    ✓    |    ✓    |   ✓   |
| Dashboard        |        |    ✓    |    ✓    |   ✓   |
| Admin (content)  |        |         |    ✓    |   ✓   |
| Admin (users)    |        |         |         |   ✓   |

Both client and server enforce these — never trust the client alone.
