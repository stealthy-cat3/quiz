// Storage for accounts, sessions and the leaderboard.
// Uses Upstash Redis when its env vars are set (Vercel adds them when the store is connected);
// otherwise an in-memory store, so the app runs locally with no setup. Memory data is lost on restart.
import { Redis } from '@upstash/redis';

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days, in seconds
const BOARD = 'lb:clock';

// Vercel may add a custom prefix to these names (e.g. STORAGE_KV_REST_API_URL), so match by ending.
const env = suffixes => {
  for (const suffix of suffixes) {
    const key = Object.keys(process.env).find(k => k.endsWith(suffix) && process.env[k]);
    if (key) return process.env[key];
  }
  return undefined;
};
const url = env(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']);
const token = env(['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN']);

export const usingRedis = Boolean(url && token);
// On Vercel each function call may run in a fresh copy, so the memory store would lose data at random.
export const missingDatabase = Boolean(process.env.VERCEL) && !usingRedis;

function redisStore() {
  const redis = new Redis({ url, token });
  return {
    getUser: name => redis.get(`user:${name.toLowerCase()}`),
    // Returns false when the username is already taken.
    createUser: async (name, record) => (await redis.set(`user:${name.toLowerCase()}`, record, { nx: true })) === 'OK',
    createSession: (sid, name) => redis.set(`session:${sid}`, name, { ex: SESSION_TTL }),
    getSession: sid => redis.get(`session:${sid}`),
    deleteSession: sid => redis.del(`session:${sid}`),
    // Keeps the higher of the old and new score.
    submitScore: (name, score) => redis.zadd(BOARD, { gt: true }, { score, member: name }),
    top: async n => {
      const flat = await redis.zrange(BOARD, 0, n - 1, { rev: true, withScores: true });
      const rows = [];
      for (let i = 0; i < flat.length; i += 2) rows.push({ name: String(flat[i]), score: Number(flat[i + 1]) });
      return rows;
    },
    standing: async name => {
      const [rank, score] = await Promise.all([redis.zrevrank(BOARD, name), redis.zscore(BOARD, name)]);
      return rank === null || score === null ? null : { rank: rank + 1, score: Number(score) };
    },
  };
}

function memoryStore() {
  const users = new Map(), sessions = new Map(), board = new Map();
  const sorted = () => [...board].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    getUser: async name => users.get(name.toLowerCase()) || null,
    createUser: async (name, record) => {
      if (users.has(name.toLowerCase())) return false;
      users.set(name.toLowerCase(), record);
      return true;
    },
    createSession: async (sid, name) => { sessions.set(sid, { name, until: Date.now() + SESSION_TTL * 1000 }); },
    getSession: async sid => {
      const s = sessions.get(sid);
      return s && s.until > Date.now() ? s.name : null;
    },
    deleteSession: async sid => { sessions.delete(sid); },
    submitScore: async (name, score) => { board.set(name, Math.max(board.get(name) ?? -Infinity, score)); },
    top: async n => sorted().slice(0, n).map(([name, score]) => ({ name, score })),
    standing: async name => {
      const i = sorted().findIndex(([n]) => n === name);
      return i < 0 ? null : { rank: i + 1, score: board.get(name) };
    },
  };
}

export const db = usingRedis ? redisStore() : memoryStore();
export { SESSION_TTL };
