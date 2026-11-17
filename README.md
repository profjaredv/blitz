# Tug-of-War Blitz

The host sets up a series of matchups (Pizza vs Tacos, Cats vs Dogs, …). In
each round everyone taps for whichever side they want and the rope shows the
room deciding in real time. The host
screen (put it on the projector) shows the join code, QR code, live score and
the winner. Quiz Blitz is the second mode: fastest right answer scores most.

One small Node server serves the app and runs every game in memory over
WebSockets. There is no database and nothing is billed per tap.

## Deploy on Railway

1. New Project → Deploy from GitHub repo → pick this repo.
2. Railway builds with `npm run build` and starts with `npm start`. No
   environment variables are needed.
3. Settings → Networking → Generate Domain. That URL is the game.

Keep it at **one replica**: games live in the server's memory, so a second
instance would not see them. For the same reason a redeploy or restart ends
any game in progress, so don't push changes mid-event.

## Run locally

    npm install
    npm run build && npm start        # http://localhost:8787

While editing the UI, run `npm run server` and `npm run dev` side by side and
open http://localhost:3000.

## Load test

Host a tug-of-war game in a browser (any matchups), then:

    node scripts/loadtest.mjs <join code> 200

Press Start. When the battle ends the script prints what the bots sent, what
the server credited, and the final score. Add a third argument such as
`wss://your-app.up.railway.app/ws` to test the deployed site.

## Where things are

- `server/index.js` – game rules, timing, scoring, anti-cheat tap limit
- `src/lib/conn.ts` – the phone/host connection, with automatic reconnect
- `src/views/Host.tsx`, `src/views/Player.tsx` – the two screens
