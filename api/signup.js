import { db } from './_lib/db.js';
import { route, send, readBody, credentials, hashPassword, startSession, USERNAME_RE } from './_lib/http.js';

export default route('POST', async (req, res) => {
  const { username, password } = credentials(await readBody(req));
  if (!USERNAME_RE.test(username)) {
    return send(res, 400, { error: 'Username must be 3 to 20 letters, numbers or underscores.' });
  }
  if (password.length < 6 || password.length > 100) {
    return send(res, 400, { error: 'Password must be at least 6 characters.' });
  }

  const created = await db.createUser(username, { name: username, ...(await hashPassword(password)), created: Date.now() });
  if (!created) return send(res, 409, { error: 'That username is taken.' });

  await startSession(req, res, username);
  send(res, 201, { user: { name: username, best: null, rank: null } });
});
