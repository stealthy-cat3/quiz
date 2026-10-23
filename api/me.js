import { db } from './_lib/db.js';
import { route, send, currentUser } from './_lib/http.js';

export default route('GET', async (req, res) => {
  const name = await currentUser(req);
  if (!name) return send(res, 401, { error: 'Not signed in.' });
  const standing = await db.standing(name);
  send(res, 200, { user: { name, best: standing?.score ?? null, rank: standing?.rank ?? null } });
});
