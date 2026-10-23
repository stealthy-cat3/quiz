// Small helpers shared by the API functions. They use plain Node req/res,
// so the same handlers run on Vercel and in the local Vite dev server.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db, SESSION_TTL, missingDatabase } from './db.js';

const scryptAsync = promisify(scrypt);

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error('Body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

// Wraps a handler: only the given method is allowed, and errors become a 500 instead of a crash.
export function route(method, handler) {
  return async (req, res) => {
    if (req.method !== method) return send(res, 405, { error: 'Method not allowed' });
    if (missingDatabase) {
      return send(res, 503, { error: 'The database is not connected yet. Add an Upstash Redis store to this Vercel project.' });
    }
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
      send(res, 500, { error: 'Something went wrong. Try again.' });
    }
  };
}

// ---------- Passwords ----------
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)).toString('hex');
  return { salt, hash };
}

export async function checkPassword(password, { salt, hash }) {
  const given = await scryptAsync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return stored.length === given.length && timingSafeEqual(stored, given);
}

// ---------- Sessions (random token in an httpOnly cookie) ----------
const COOKIE = 'sid';

function cookieFlags(req) {
  const https = req.headers['x-forwarded-proto'] === 'https';
  return `Path=/; HttpOnly; SameSite=Lax${https ? '; Secure' : ''}`;
}

function readCookie(req, name) {
  const pair = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

export async function startSession(req, res, name) {
  const sid = randomBytes(32).toString('hex');
  await db.createSession(sid, name);
  res.setHeader('Set-Cookie', `${COOKIE}=${sid}; Max-Age=${SESSION_TTL}; ${cookieFlags(req)}`);
}

export async function endSession(req, res) {
  const sid = readCookie(req, COOKIE);
  if (sid) await db.deleteSession(sid);
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${cookieFlags(req)}`);
}

// The signed-in username, or null.
export async function currentUser(req) {
  const sid = readCookie(req, COOKIE);
  if (!sid || !/^[a-f0-9]{64}$/.test(sid)) return null;
  return db.getSession(sid);
}

// ---------- Validation ----------
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export function credentials(body) {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  return { username, password };
}
