import { db } from './_lib/db.js';
import { route, send, currentUser } from './_lib/http.js';

const TOP = 20;

export default route('GET', async (req, res) => {
  const name = await currentUser(req);
  if (!name) return send(res, 401, { error: 'Not signed in.' });
  const [top, me] = await Promise.all([db.top(TOP), db.standing(name)]);
  send(res, 200, { top, me });
});
