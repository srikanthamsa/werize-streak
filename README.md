# Streak

Streak is a mobile-first internal web app for attendance insights and monthly hour-bank tracking on top of greytHR biometric swipe data.

## What is implemented

- Next.js App Router project scaffold
- Mobile-responsive dashboard for:
  - "When can I leave?" daily tracker
  - Monthly hour-bank summary
  - Recent sync history
  - Opt-in leaderboard cards
- Secure-looking onboarding/setup flow
- Typed mock domain data and reusable attendance calculation helpers
- Initial Supabase schema and edge-function notes aligned to the PRD

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Project structure

- `app/`: Next.js routes and layout
- `components/`: dashboard and setup UI
- `lib/`: types, calculations, mock data
- `supabase/schema.sql`: starting database schema
- `supabase/functions/sync-greythr/README.md`: sync-engine outline

## Next implementation steps

1. Replace mock data with Supabase queries and React Query hooks.
2. Add Supabase Auth and a secure server-side credential submission endpoint.
3. Implement the greytHR sync Edge Function with jitter and retries.
4. Add holiday-aware working day calculations and settings-driven calendars.
5. Add tests for attendance calculations and monthly hour-bank edge cases.
