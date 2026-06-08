# Claude Code Instructions

## Branch Rules
- ALWAYS work on the dev branch
- Run `git checkout dev` at the start of every session
- NEVER commit directly to main
- After every change run: npm run save-dev
- When user says "go live" run: npm run go-live

## Dev Preview
- Test all changes on the Vercel dev preview URL before going live
- Never push untested code to main

## General Rules
- All environment variables must be in .env (never hardcoded)
- Always work on dev branch
- Ask before deleting anything
- Never remove existing features when adding new ones
