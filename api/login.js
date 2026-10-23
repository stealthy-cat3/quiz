import { db } from './_lib/db.js';
import { route, send, readBody, credentials, checkPassword, startSession } from './_lib/http.js';

export default route('POST', async (req, res) => {
  const { username, password } = credentials(await readBody(req));
  const user = username && password ? await db.getUser(username) : null;
  // Same message whether the name or the password is wrong.
  if (!user || !(await checkPassword(password, user))) {
    return send(res, 401, { error: 'Wrong username or password.' });
  }

  await startSession(req, res, user.name);
  const standing = await db.standing(user.name);
  send(res, 200, { user: { name: user.name, best: standing?.score ?? null, rank: standing?.rank ?? null } });
});
