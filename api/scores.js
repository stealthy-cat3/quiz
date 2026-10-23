import { db } from './_lib/db.js';
import { route, send, readBody, currentUser } from './_lib/http.js';

// Scores come from the browser, so this only rejects values no real game could produce.
const MAX_SCORE = 200_000;

export default route('POST', async (req, res) => {
  const name = await currentUser(req);
  if (!name) return send(res, 401, { error: 'Sign in to save your score.' });

  const { score } = await readBody(req);
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return send(res, 400, { error: 'Invalid score.' });
  }

  await db.submitScore(name, score);
  const standing = await db.standing(name);
  send(res, 200, { best: standing?.score ?? score, rank: standing?.rank ?? null });
});
