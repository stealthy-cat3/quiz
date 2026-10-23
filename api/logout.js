import { route, send, endSession } from './_lib/http.js';

export default route('POST', async (req, res) => {
  await endSession(req, res);
  send(res, 200, { ok: true });
});
