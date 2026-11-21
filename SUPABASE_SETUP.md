# Supabase setup for GymOP

## 1. Apply the database and storage migration

In the Supabase Dashboard, open your GymOP project, then go to **SQL Editor**.
Create a new query, paste the contents of
`supabase/migrations/20261120000100_gymop_persistence.sql`, and run it.

This creates:
- `gyms`: stable gym identifiers based on normalized gym names
- `weekly_uploads`: one JSONB upload per gym and week
- `gym_settings`: the existing limits, placements, floor-plan flag, and event history
- a private `floor-plans` Storage bucket, accepting sanitized PNG images

## 2. Configure the application environment

Copy `.env.example` to `.env.local` in the project root. Fill in:
- `SUPABASE_URL`: the Project URL from Supabase Project Settings -> API
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only secret/service-role key from the API Keys page

Do not prefix either variable with `NEXT_PUBLIC_`. Never commit `.env.local`,
paste the secret into Copilot, or expose it in client-side code. The existing
`.gitignore` ignores `.env*`.

The Supabase backend is selected when both variables are present. If they are
not configured, the existing Vercel Blob/local-file behavior remains available.

## 3. Run and verify locally

Install dependencies with `npm install`, then run:
- `npm test`
- `npm run build`

Start the application with `npm run dev`. Use made-up gym names and test data.
Upload a week, reload the page, and confirm the saved week remains available.
Also test a limit change, a machine placement, and a floor-plan upload/reload.

## Important security limitation

The current API routes accept a gym name supplied by the browser and do not
authenticate a manager or prove gym membership. The service-role key bypasses
Row Level Security. The migration deliberately creates no public RLS or Storage
policies, but server routes using the service-role key can still access records
for any gym name they are given.

Therefore this persistence integration is a development/midpoint milestone,
not a production-ready multi-gym security boundary. Do not store real gym data
or deploy for untrusted users until server-side authentication and authorization
derive the gym identity from a trusted session. That is the separate password/
authentication priority.
