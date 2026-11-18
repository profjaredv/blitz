// Accounts, saved sets and game history, kept in Postgres.
//
// Set DATABASE_URL (Railway: add a Postgres database to the project and
// reference its DATABASE_URL in this service). Without it the app still runs,
// but hosting needs no account and nothing is saved.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 60;
export const SESSION_COOKIE = 'blitz_session';

const url = process.env.DATABASE_URL;
const pool = url
  ? new pg.Pool({
      connectionString: url,
      max: 5,
      // Railway's internal network needs no TLS; its public proxy does.
      ssl: /sslmode=require|\.proxy\.rlwy\.net/.test(url) ? { rejectUnauthorized: false } : undefined,
    })
  : null;

export const accountsEnabled = () => !!pool;

const SCHEMA = `
create table if not exists users (
  id bigserial primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists sessions_user on sessions(user_id);
create table if not exists sets (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sets_user on sets(user_id, updated_at desc);
create table if not exists games (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  set_id bigint references sets(id) on delete set null,
  type text not null,
  title text not null,
  code text not null,
  players int not null default 0,
  summary jsonb not null default '{}',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists games_user on games(user_id, started_at desc);
`;

export async function initStore() {
  if (!pool) {
    console.warn('DATABASE_URL not set: accounts and saving are off.');
    return;
  }
  await pool.query(SCHEMA);
  await pool.query('delete from sessions where expires_at < now()');
  console.log('Database ready.');
}

const q = (text, params) => pool.query(text, params);

// ---- passwords & sessions --------------------------------------------------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function checkPassword(password, stored) {
  const [, saltHex, keyHex] = stored.split('$');
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const publicUser = (u) => ({ id: String(u.id), email: u.email, name: u.name });

async function newSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await q(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`, [
    sha(token),
    userId,
  ]);
  return token;
}

export async function userFromToken(token) {
  if (!pool || !token) return null;
  const { rows } = await q(
    'select u.* from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()',
    [sha(token)],
  );
  return rows[0] ? publicUser(rows[0]) : null;
}

// ---- sets & games ----------------------------------------------------------

const SET_TYPES = ['tug-of-war', 'tournament', 'quiz'];
const cleanTitle = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';

const setRow = (r) => ({
  id: String(r.id),
  type: r.type,
  title: r.title,
  data: r.data,
  updatedAt: r.updated_at,
});

const gameRow = (r) => ({
  id: String(r.id),
  setId: r.set_id ? String(r.set_id) : null,
  type: r.type,
  title: r.title,
  code: r.code,
  players: r.players,
  summary: r.summary,
  startedAt: r.started_at,
  updatedAt: r.updated_at,
});

/** Called when a room is created by a signed-in host. Returns the game id. */
export async function recordGame(userId, { setId, type, title, code }) {
  if (!pool) return null;
  const { rows } = await q(
    `insert into games (user_id, set_id, type, title, code)
     values ($1, (select id from sets where id = $2 and user_id = $1), $3, $4, $5) returning id`,
    [userId, /^\d+$/.test(String(setId ?? '')) ? setId : null, type, cleanTitle(title), code],
  );
  return rows[0].id;
}

/** Saves the latest results of a running game (fire and forget). */
export function updateGame(gameId, players, summary) {
  if (!pool || !gameId) return;
  q('update games set players = greatest(players, $2), summary = $3, updated_at = now() where id = $1', [
    gameId,
    players,
    JSON.stringify(summary),
  ]).catch((err) => console.error('updateGame failed', err.message));
}

// ---- HTTP API ---------------------------------------------------------------

const attempts = new Map(); // ip -> { n, at }, a crude brake on password guessing

function tooMany(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.at > 15 * 60 * 1000) {
    attempts.set(ip, { n: 1, at: now });
    return false;
  }
  a.n++;
  return a.n > 20;
}

export function readCookie(req, name) {
  const m = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function sessionCookie(req, token, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function body(req) {
  if (!/application\/json/.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Expected JSON.');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 256 * 1024) throw new HttpError(413, 'Too large.');
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new HttpError(400, 'Bad JSON.');
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

/** Handles /api/*. Returns false for other paths. */
export async function handleApi(req, res, url) {
  if (!url.pathname.startsWith('/api/')) return false;
  try {
    await route(req, res, url);
  } catch (err) {
    if (err instanceof HttpError) json(res, err.status, { error: err.message });
    else {
      console.error('api error', err);
      json(res, 500, { error: 'Something went wrong.' });
    }
  }
  return true;
}

async function route(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/me' && m === 'GET') {
    const user = await userFromToken(readCookie(req, SESSION_COOKIE));
    return json(res, 200, { accounts: !!pool, user });
  }
  if (!pool) throw new HttpError(503, 'Accounts are not set up on this server.');

  if ((p === '/api/signup' || p === '/api/login') && m === 'POST') {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    if (tooMany(ip)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const b = await body(req);
    const email = String(b.email ?? '').trim().toLowerCase().slice(0, 200);
    const password = String(b.password ?? '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    let user;
    if (p === '/api/signup') {
      const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!name) throw new HttpError(400, 'Enter your name.');
      if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.');
      const exists = await q('select 1 from users where email = $1', [email]);
      if (exists.rows.length) throw new HttpError(409, 'An account with that email already exists. Sign in instead.');
      const { rows } = await q('insert into users (email, name, password_hash) values ($1, $2, $3) returning *', [
        email,
        name,
        await hashPassword(password),
      ]);
      user = rows[0];
    } else {
      const { rows } = await q('select * from users where email = $1', [email]);
      if (!rows[0] || !(await checkPassword(password, rows[0].password_hash))) {
        throw new HttpError(401, 'That email and password don’t match.');
      }
      user = rows[0];
    }
    const token = await newSession(user.id);
    return json(res, 200, { user: publicUser(user) }, { 'set-cookie': sessionCookie(req, token, SESSION_DAYS * 86400) });
  }

  if (p === '/api/logout' && m === 'POST') {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await q('delete from sessions where token_hash = $1', [sha(token)]);
    return json(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, '', 0) });
  }

  const user = await userFromToken(readCookie(req, SESSION_COOKIE));
  if (!user) throw new HttpError(401, 'Sign in first.');

  if (p === '/api/sets' && m === 'GET') {
    const { rows } = await q('select * from sets where user_id = $1 order by updated_at desc limit 200', [user.id]);
    return json(res, 200, { sets: rows.map(setRow) });
  }
  if (p === '/api/sets' && m === 'POST') {
    const b = await body(req);
    if (!SET_TYPES.includes(b.type)) throw new HttpError(400, 'Unknown game type.');
    const { rows } = await q('insert into sets (user_id, type, title, data) values ($1, $2, $3, $4) returning *', [
      user.id,
      b.type,
      cleanTitle(b.title),
      JSON.stringify(b.data ?? {}),
    ]);
    return json(res, 201, { set: setRow(rows[0]) });
  }
  const setMatch = p.match(/^\/api\/sets\/(\d+)$/);
  if (setMatch && m === 'PUT') {
    const b = await body(req);
    const { rows } = await q(
      'update sets set title = $3, data = $4, updated_at = now() where id = $1 and user_id = $2 returning *',
      [setMatch[1], user.id, cleanTitle(b.title), JSON.stringify(b.data ?? {})],
    );
    if (!rows[0]) throw new HttpError(404, 'Not found.');
    return json(res, 200, { set: setRow(rows[0]) });
  }
  if (setMatch && m === 'DELETE') {
    await q('delete from sets where id = $1 and user_id = $2', [setMatch[1], user.id]);
    return json(res, 200, { ok: true });
  }

  if (p === '/api/games' && m === 'GET') {
    const { rows } = await q('select * from games where user_id = $1 order by started_at desc limit 100', [user.id]);
    return json(res, 200, { games: rows.map(gameRow) });
  }
  const gameMatch = p.match(/^\/api\/games\/(\d+)$/);
  if (gameMatch && m === 'DELETE') {
    await q('delete from games where id = $1 and user_id = $2', [gameMatch[1], user.id]);
    return json(res, 200, { ok: true });
  }

  throw new HttpError(404, 'Not found.');
}
