# Reading Visual Art Reviewer

A phone-friendly reviewer of 115 art questions in six parts, with accounts and a leaderboard. Vite + Tailwind CSS v4 frontend, Vercel serverless functions in `api/`, Upstash Redis for storage.

- **Accounts**: sign up, sign in, log out. Passwords are hashed with scrypt; sessions are random tokens in an httpOnly cookie (30 days). Signing in is required to use the app.
- **Leaderboard**: top 20 best Beat the clock scores, shown under the results when time runs out or a review ends, and from the header.

- **Review**: all questions or one part. A right answer moves on by itself; a wrong one shows the answer and waits for Next.
- **Beat the clock**: 60 seconds, +3s per right answer, −5s per wrong one, streaks build a multiplier (up to ×5). Each player's best score goes to the leaderboard.

```bash
npm install
npm run dev      # http://localhost:5173, API included
npm run build    # frontend into dist/
```

Locally, with no database configured, the API keeps accounts and scores in memory; they are cleared when the dev server restarts.

## Deploying on Vercel

1. Import the repo (framework preset: Vite). Functions in `api/` deploy automatically.
2. In the project, open **Storage → Create / Connect → Upstash (Redis)** and connect it to the project. This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) environment variables.
3. Redeploy. Until a store is connected, the API answers with a "database is not connected" error instead of losing data.

To run locally against the real database, put the same two variables in a `.env.local` file (never commit it) and start the dev server.

Questions live in `src/questions.js`; review progress is kept per user in the browser's localStorage. Scores are sent by the browser, so the server only rejects impossible values; a determined user could still post a fake score.

Keyboard: `1`–`4` or `A`–`D` to answer, `Enter` for the next question.

Prepared by Xavier.
