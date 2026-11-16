// Tug-of-War Blitz server: serves the built app and runs every game in memory
// over WebSockets. One small process; no database, no per-tap billing.
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8787);
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const COUNTDOWN_MS = 3000; // keep in step with src/lib/game.ts
const TICK_MS = 200; // how often scores are pushed to the room
const TAP_GRACE_MS = 300; // taps already in flight when time runs out still count
const TAPS_PER_SECOND = 22; // per player; two thumbs manage about 14
const TAP_BURST = 40;
const ANSWER_GRACE_MS = 500;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ROOMS = 500;
const MAX_PLAYERS = 2000;

/** @type {Map<string, any>} */
const rooms = new Map();

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

function newCode() {
  for (let i = 0; i < 50; i++) {
    const code = String(crypto.randomInt(1000, 10000));
    if (!rooms.has(code)) return code;
  }
  return null;
}

function createRoom(opts) {
  if (rooms.size >= MAX_ROOMS) return null;
  const code = newCode();
  if (!code) return null;
  const room = {
    code,
    hostKey: crypto.randomBytes(16).toString('hex'),
    type: opts?.type === 'quiz' ? 'quiz' : 'tug-of-war',
    status: 'waiting',
    round: 0,
    startTime: null,
    labelA: clean(opts?.labelA, 20) || 'A',
    labelB: clean(opts?.labelB, 20) || 'B',
    duration: [15, 30, 60].includes(opts?.duration) ? opts.duration : 30,
    finalA: 0,
    finalB: 0,
    topTappers: [],
    questions: [],
    qIndex: 0,
    qStart: null,
    revealed: [],
    revealCounts: [],
    leaderboard: [],
    players: new Map(),
    sockets: new Set(),
    timer: null,
    dirty: false,
    lastScore: '',
    touched: Date.now(),
  };
  if (room.type === 'quiz') {
    room.questions = (Array.isArray(opts.questions) ? opts.questions : []).slice(0, 50).map((q) => ({
      text: clean(q?.text, 140),
      options: [0, 1, 2, 3].map((i) => clean(q?.options?.[i], 60)),
      correctIndex: [0, 1, 2, 3].includes(q?.correctIndex) ? q.correctIndex : 0,
      timeLimit: [10, 20, 30].includes(q?.timeLimit) ? q.timeLimit : 20,
    })).filter((q) => q.text);
    if (!room.questions.length) return null;
  }
  rooms.set(code, room);
  return room;
}

function tugScores(room) {
  if (room.status === 'finished') return [room.finalA, room.finalB];
  let a = 0;
  let b = 0;
  for (const p of room.players.values()) {
    if (p.team === 'A') a += p.taps;
    else if (p.team === 'B') b += p.taps;
  }
  return [a, b];
}

function publicState(room, forHost) {
  let countA = 0;
  let countB = 0;
  let answered = 0;
  for (const p of room.players.values()) {
    if (p.team === 'A') countA++;
    else if (p.team === 'B') countB++;
    if (p.answers[room.qIndex]) answered++;
  }
  const [scoreA, scoreB] = tugScores(room);
  return {
    code: room.code,
    type: room.type,
    status: room.status,
    round: room.round,
    startTime: room.startTime,
    playerCount: room.players.size,
    labelA: room.labelA,
    labelB: room.labelB,
    duration: room.duration,
    scoreA,
    scoreB,
    countA,
    countB,
    topTappers: room.topTappers,
    questions: room.questions.map(({ text, options, timeLimit }) => ({ text, options, timeLimit })),
    qIndex: room.qIndex,
    qStart: room.qStart,
    revealed: room.revealed,
    revealCounts: room.revealCounts,
    answeredCount: answered,
    leaderboard: room.leaderboard,
    roster: forHost ? [...room.players.values()].map((p) => ({ name: p.name, team: p.team })) : [],
  };
}

function sendState(room) {
  room.dirty = false;
  const forHost = JSON.stringify({ t: 'state', game: publicState(room, true) });
  const forPlayers = JSON.stringify({ t: 'state', game: publicState(room, false) });
  for (const ws of room.sockets) {
    if (ws.readyState === 1) ws.send(ws.role === 'host' ? forHost : forPlayers);
  }
}

function sendYou(room, p) {
  const me = {
    name: p.name,
    team: p.team,
    round: room.round,
    taps: p.taps,
    answers: p.answers,
    gains: p.gains,
    score: p.score,
  };
  for (const ws of room.sockets) if (ws.pid === p.pid) send(ws, { t: 'you', me });
}

function setTimer(room, ms, fn) {
  clearTimeout(room.timer);
  room.timer = setTimeout(fn, ms);
}

// ---- tug of war -----------------------------------------------------------

function startTug(room) {
  for (const p of room.players.values()) p.taps = 0;
  room.status = 'active';
  room.startTime = Date.now();
  room.topTappers = [];
  setTimer(room, COUNTDOWN_MS + room.duration * 1000 + TAP_GRACE_MS + 100, () => finishTug(room));
}

function finishTug(room) {
  if (room.status !== 'active') return;
  [room.finalA, room.finalB] = tugScores(room);
  room.status = 'finished';
  room.topTappers = [...room.players.values()]
    .filter((p) => p.taps > 0 && p.team !== '-')
    .sort((a, b) => b.taps - a.taps)
    .slice(0, 5)
    .map((p) => ({ name: p.name, team: p.team, taps: p.taps }));
  sendState(room);
  for (const p of room.players.values()) sendYou(room, p);
}

function tap(room, p, n) {
  if (room.type !== 'tug-of-war' || room.status !== 'active' || p.team === '-') return;
  const now = Date.now();
  const open = room.startTime + COUNTDOWN_MS;
  if (now < open || now > open + room.duration * 1000 + TAP_GRACE_MS) return;
  // Token bucket: nobody scores faster than a person can tap.
  p.tokens = Math.min(TAP_BURST, p.tokens + ((now - p.tokenAt) / 1000) * TAPS_PER_SECOND);
  p.tokenAt = now;
  const accepted = Math.max(0, Math.min(Math.floor(Number(n) || 0), Math.floor(p.tokens)));
  p.tokens -= accepted;
  p.taps += accepted;
}

// ---- quiz -----------------------------------------------------------------

function askQuestion(room, index) {
  room.qIndex = index;
  room.qStart = Date.now();
  room.revealCounts = [];
  const limit = room.questions[index].timeLimit * 1000;
  setTimer(room, limit + ANSWER_GRACE_MS + 300, () => reveal(room));
}

function startQuiz(room) {
  for (const p of room.players.values()) Object.assign(p, { answers: {}, gains: {}, score: 0 });
  room.status = 'active';
  room.startTime = Date.now();
  room.revealed = [];
  room.leaderboard = [];
  askQuestion(room, 0);
}

function board(room, top) {
  return [...room.players.values()]
    .map((p) => ({ name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}

function reveal(room) {
  if (room.status !== 'active' || room.revealed.length > room.qIndex) return;
  clearTimeout(room.timer);
  const q = room.questions[room.qIndex];
  room.revealed.push(q.correctIndex);
  room.revealCounts = [0, 0, 0, 0];
  for (const p of room.players.values()) {
    const a = p.answers[room.qIndex];
    let gain = 0;
    if (a) {
      room.revealCounts[a.c]++;
      if (a.c === q.correctIndex) {
        gain = 1000 + Math.round(500 * Math.max(0, 1 - a.ms / (q.timeLimit * 1000)));
      }
    }
    p.gains[room.qIndex] = gain;
    p.score += gain;
  }
  room.leaderboard = board(room, 5);
  sendState(room);
  for (const p of room.players.values()) sendYou(room, p);
}

function answer(room, p, c) {
  if (room.type !== 'quiz' || room.status !== 'active') return;
  if (room.revealed.length > room.qIndex || p.answers[room.qIndex]) return;
  const q = room.questions[room.qIndex];
  if (![0, 1, 2, 3].includes(c) || !q.options[c]) return;
  const ms = Date.now() - room.qStart;
  if (ms > q.timeLimit * 1000 + ANSWER_GRACE_MS) return;
  p.answers[room.qIndex] = { c, ms };
  sendYou(room, p);
  room.dirty = true;
  const everyone = [...room.players.values()].every((x) => x.answers[room.qIndex]);
  if (everyone) setTimer(room, 700, () => reveal(room));
}

function nextQuestion(room) {
  if (room.status !== 'active' || room.revealed.length <= room.qIndex) return;
  if (room.qIndex + 1 >= room.questions.length) {
    room.status = 'finished';
    room.leaderboard = board(room, 10);
  } else {
    askQuestion(room, room.qIndex + 1);
  }
}

function rematch(room) {
  clearTimeout(room.timer);
  room.status = 'waiting';
  room.round++;
  room.startTime = null;
  room.topTappers = [];
  room.qIndex = 0;
  room.qStart = null;
  room.revealed = [];
  room.revealCounts = [];
  room.leaderboard = [];
  for (const p of room.players.values()) {
    Object.assign(p, { taps: 0, answers: {}, gains: {}, score: 0 });
    sendYou(room, p);
  }
}

// ---- connections ----------------------------------------------------------

function attach(ws, room, role, pid) {
  detach(ws);
  ws.room = room;
  ws.role = role;
  ws.pid = pid ?? null;
  room.sockets.add(ws);
}

function detach(ws) {
  ws.room?.sockets.delete(ws);
  ws.room = null;
}

function handle(ws, msg) {
  if (msg.t === 'ping') return send(ws, { t: 'pong', t0: msg.t0, now: Date.now() });

  if (msg.t === 'create') {
    const room = createRoom(msg.opts);
    if (!room) return send(ws, { t: 'error', code: 'create_failed', msg: 'Could not create the game.' });
    attach(ws, room, 'host');
    send(ws, { t: 'created', code: room.code, hostKey: room.hostKey });
    return send(ws, { t: 'state', game: publicState(room, true) });
  }

  if (msg.t === 'host' || msg.t === 'peek') {
    const room = rooms.get(String(msg.code));
    if (!room || (msg.t === 'host' && msg.hostKey !== room.hostKey)) {
      return send(ws, { t: 'error', code: 'no_game', msg: 'No game with that code. Check the screen and try again.' });
    }
    const pid = msg.t === 'peek' && typeof msg.pid === 'string' ? msg.pid.slice(0, 64) : null;
    attach(ws, room, msg.t === 'host' ? 'host' : 'player', pid);
    send(ws, { t: 'state', game: publicState(room, ws.role === 'host') });
    const p = pid && room.players.get(pid);
    if (p) sendYou(room, p);
    return;
  }

  const room = ws.room;
  if (!room) return;
  room.touched = Date.now();

  if (msg.t === 'leave') return detach(ws);

  if (ws.role === 'host') {
    if (msg.t === 'start' && room.status === 'waiting' && room.players.size > 0) {
      room.type === 'quiz' ? startQuiz(room) : startTug(room);
    } else if (msg.t === 'reveal') return reveal(room);
    else if (msg.t === 'next') nextQuestion(room);
    else if (msg.t === 'rematch' && room.status === 'finished') rematch(room);
    else return;
    return sendState(room);
  }

  if (msg.t === 'join') {
    if (!ws.pid || ws.pid.length < 12) return;
    const name = clean(msg.name, 20);
    if (!name) return;
    let p = room.players.get(ws.pid);
    if (!p) {
      if (room.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', code: 'full', msg: 'This game is full.' });
      p = { pid: ws.pid, taps: 0, answers: {}, gains: {}, score: 0, tokens: TAP_BURST, tokenAt: Date.now() };
      room.players.set(ws.pid, p);
    }
    p.name = name;
    p.team = room.type === 'quiz' ? '-' : msg.team === 'B' ? 'B' : 'A';
    room.dirty = true;
    return sendYou(room, p);
  }

  const p = ws.pid && room.players.get(ws.pid);
  if (!p) return;
  if (msg.t === 'tap') return tap(room, p, msg.n);
  if (msg.t === 'answer') return answer(room, p, msg.c);
  if (msg.t === 'team' && room.status === 'waiting' && room.type === 'tug-of-war') {
    p.team = msg.team === 'B' ? 'B' : 'A';
    room.dirty = true;
    return sendYou(room, p);
  }
}

// Push scores to each live room a few times a second, only when they changed.
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.dirty) sendState(room);
    else if (room.type === 'tug-of-war' && room.status === 'active') {
      const [a, b] = tugScores(room);
      const key = `${a}:${b}`;
      if (key === room.lastScore) continue;
      room.lastScore = key;
      const msg = JSON.stringify({ t: 'score', a, b });
      for (const ws of room.sockets) if (ws.readyState === 1) ws.send(msg);
    }
  }
}, TICK_MS);

// Forget games nobody has touched for hours.
setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [code, room] of rooms) {
    if (room.touched < cutoff) {
      clearTimeout(room.timer);
      for (const ws of room.sockets) ws.close();
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

// ---- http -----------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, connections: wss.clients.size }));
  }
  const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST) || !path.extname(file)) file = path.join(DIST, 'index.html');
  try {
    const body = await readFile(file);
    const hashed = file.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg && typeof msg === 'object') {
      try {
        handle(ws, msg);
      } catch (err) {
        console.error('handler error', err);
      }
    }
  });
  ws.on('close', () => detach(ws));
  ws.on('error', () => {});
});

// Drop connections that have silently gone away.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`Tug-of-War Blitz listening on :${PORT}`));
