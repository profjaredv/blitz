// One WebSocket to the game server, kept alive for as long as the page is open.
// If it drops (phone locks, Wi-Fi blips) it reconnects and re-enters the game.

type Listener = (msg: any) => void;

const listeners = new Set<Listener>();
const statusListeners = new Set<(open: boolean) => void>();
let ws: WebSocket | null = null;
let hello: () => object | null = () => null;
let queue: object[] = [];
let retry = 0;
let clockOffsetMs = 0;

export const conn = {
  /** Increments every time a connection opens. */
  epoch: 0,

  isOpen: () => ws?.readyState === WebSocket.OPEN,

  /** `getHello` returns the message that puts this device back in its game. */
  start(getHello: () => object | null) {
    hello = getHello;
    if (!ws) open();
  },

  /** Queued until the connection is up. */
  send(msg: object) {
    if (conn.isOpen()) ws!.send(JSON.stringify(msg));
    else queue.push(msg);
  },

  /** Dropped if the connection is down (used for taps, which are re-sent as totals catch up). */
  sendNow(msg: object) {
    if (!conn.isOpen()) return false;
    ws!.send(JSON.stringify(msg));
    return true;
  },

  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },

  onStatus(fn: (open: boolean) => void) {
    statusListeners.add(fn);
    return () => void statusListeners.delete(fn);
  },
};

/** The server's clock, so every screen counts down together. */
export const serverNow = () => Date.now() + clockOffsetMs;

function open() {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${scheme}://${location.host}/ws`);
  ws = socket;

  socket.onopen = () => {
    retry = 0;
    conn.epoch++;
    ping();
    const first = hello();
    if (first) socket.send(JSON.stringify(first));
    for (const msg of queue) socket.send(JSON.stringify(msg));
    queue = [];
    statusListeners.forEach((fn) => fn(true));
  };

  socket.onmessage = (ev) => {
    let msg: any;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.t === 'pong') {
      const t1 = Date.now();
      clockOffsetMs = msg.now - (msg.t0 + t1) / 2;
      return;
    }
    listeners.forEach((fn) => fn(msg));
  };

  socket.onclose = () => {
    if (ws !== socket) return;
    statusListeners.forEach((fn) => fn(false));
    const wait = Math.min(5000, 300 * 2 ** retry++) + Math.random() * 300;
    setTimeout(open, wait);
  };
  socket.onerror = () => socket.close();
}

function ping() {
  conn.sendNow({ t: 'ping', t0: Date.now() });
}

// Keeps the clock in step and stops proxies closing an idle connection.
setInterval(ping, 20000);
