# Reading Visual Art Reviewer

A phone-friendly reviewer of 115 art questions in six parts. Frontend only: Vite + Tailwind CSS v4, no backend or database.

- **Name on entry**: players type a name (no password). It is remembered on the device; **Switch player** in the header changes it, and earlier names on the device can be picked from a list.
- **Review**: all questions or one part. A right answer moves on by itself; a wrong one shows the answer and waits for Next.
- **Beat the clock**: 60 seconds, +3s per right answer, −5s per wrong one, streaks build a multiplier (up to ×5).
- **Leaderboard**: each player's best Beat the clock score, top 20, shown under the results when time runs out or a review ends, and from the header. It is stored in the browser, so each device has its own board.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

`dist/` can be hosted on any static host (Vercel, Netlify, GitHub Pages). Questions live in `src/questions.js`. The player name, review progress and leaderboard are kept in the browser's localStorage; clearing site data resets them.

Keyboard: `1`–`4` or `A`–`D` to answer, `Enter` for the next question.

Prepared by Xavier.
