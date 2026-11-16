// Simulated crowd. Each bot is its own WebSocket, like a real phone.
//
//   node scripts/loadtest.mjs <join code> [players=60] [server=ws://127.0.0.1:8787/ws]
//
// Host a tug-of-war game in a browser, run this, then press Start.
// Bots tap 6-14 times a second; at the end the script checks that the
// server's final score equals the taps it credited to each player.
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';

const [code, countArg, urlArg] = process.argv.slice(2);
const COUNT = Number(countArg ?? 60);
const URL = urlArg ?? 'ws://127.0.0.1:8787/ws';
if (!code) {
  console.error('usage: node scripts/loadtest.mjs <join code> [players] [ws url]');
  process.exit(1);
}

const COUNTDOWN_MS = 3000;
let game = null;
let finished = 0;
const bots = [];

function bot(i) {
  const b = { team: i % 2 ? 'B' : 'A', rate: 6 + Math.random() * 8, sent: 0, credited: null, carry: 0 };
  const ws = new WebSocket(URL);
  ws.on('open', () => {
    ws.send(JSON.stringify({ t: 'peek', code, pid: randomBytes(16).toString('hex') }));
    ws.send(JSON.stringify({ t: 'join', name: `Bot ${i + 1}`, team: b.team }));
  });
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.t === 'error') {
      console.error(msg.msg);
      process.exit(1);
    }
    if (msg.t === 'state') {
      if (i === 0) game = msg.game;
      if (msg.game.status === 'finished' && !b.done) {
        b.done = true;
        b.final = msg.game;
      }
    }
    if (msg.t === 'you' && b.done) {
      b.credited = msg.me.taps;
      if (++finished === COUNT) report();
    }
  });
  const timer = setInterval(() => {
    if (!game || game.status !== 'active' || b.done) return;
    const now = Date.now();
    const open = game.startTime + COUNTDOWN_MS;
    if (now < open || now > open + game.duration * 1000) return;
    b.carry += b.rate * 0.15;
    const n = Math.floor(b.carry);
    if (n > 0) {
      b.carry -= n;
      b.sent += n;
      ws.send(JSON.stringify({ t: 'tap', n }));
    }
  }, 150);
  ws.on('close', () => clearInterval(timer));
  return b;
}

function report() {
  const sum = (t, k) => bots.filter((b) => b.team === t).reduce((n, b) => n + b[k], 0);
  const g = bots[0].final;
  console.log(
    JSON.stringify({
      bots: COUNT,
      sentA: sum('A', 'sent'),
      sentB: sum('B', 'sent'),
      creditedA: sum('A', 'credited'),
      creditedB: sum('B', 'credited'),
      finalA: g.scoreA,
      finalB: g.scoreB,
    }),
  );
  process.exit(0);
}

for (let i = 0; i < COUNT; i++) bots.push(bot(i));
console.log(`${COUNT} bots joining game ${code}. Press Start on the host screen.`);
