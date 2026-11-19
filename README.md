# Gym Equipment Congestion Grader

This Next.js app accepts weekly gym usage spreadsheets, checks the data, scores each machine type by time of day, and recommends extra capacity when points are above the limit.

## Run on your computer

1. Install Node.js 20.9 or newer.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open <http://localhost:3000>.
6. Enter a gym name, upload [`test-upload-week.csv`](./test-upload-week.csv), then open **Results and recommendations**.

Local uploads and gym settings are saved in `.gymop-data`, so they remain after the app restarts on this computer.

## Deploy to Vercel

Create a Vercel Blob store, then configure its `BLOB_READ_WRITE_TOKEN` environment variable in the Vercel project settings. The app uses private Blob files for spreadsheets, settings, activity history, and sanitized floor plans. It intentionally refuses to use temporary local files when it detects a Vercel deployment without the Blob token.

## How scoring works

- The five time bands use 3, 3, 4, 3, and 3 hours respectively.
- Weekday rows are Monday through Thursday; weekend rows are Friday through Sunday.
- Separate views average daily observations within each group. The combined view weights those daily averages 4:3.
- Points use the documented formula and are compared to the unrounded limit. Points are displayed to two decimal places. The default limit is 12.
- Recommendations show the supporting numbers and the number of additional machines rounded up.

## Important access limitation

Gym name is only a label, not a sign-in. Anyone who knows a gym name can read or change that gym's data. This is visibly disclosed in the app. Password-based manager access and backend-operator actions are not enabled because the current access choice is name-only. Do not upload sensitive or real member information.

## Checks

- `npm test` runs the automated acceptance tests.
- `npm run build` makes the production build and checks TypeScript.
