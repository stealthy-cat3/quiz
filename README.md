# Reading Visual Art Reviewer

A phone-friendly reviewer of 115 art questions in six parts. Frontend only: Vite + Tailwind CSS v4, no backend.

- **Review**: all questions or one part. A right answer moves on by itself; a wrong one shows the answer and waits for Next.
- **Beat the clock**: 60 seconds, +3s per right answer, −5s per wrong one, streaks build a multiplier (up to ×5). The best score is saved on the device.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

`dist/` can be hosted on any static host (Netlify, Vercel, GitHub Pages). Questions live in `src/questions.js`; review progress and the best game score are kept in the browser's localStorage.

Keyboard: `1`–`4` or `A`–`D` to answer, `Enter` for the next question.

Prepared by Xavier.
