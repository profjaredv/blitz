import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Trophy, X } from 'lucide-react';
import { conn, serverNow } from '../lib/conn';
import {
  MAX_TAPS_PER_SECOND,
  TAP_SEND_MS,
  ropePosition,
  tugPhase,
  tugTimes,
  type Game,
  type Me,
  type Team,
} from '../lib/game';
import { cn } from '../lib/utils';
import { Button, Input, QUIZ_COLORS, QUIZ_SHAPES, Rope, TEAM, useNow, useWakeLock } from '../components/ui';

export function PlayerView({ game, me, onLeave }: { game: Game; me: Me | null; onLeave: () => void }) {
  useWakeLock();
  if (!me) return <JoinForm game={game} onLeave={onLeave} />;
  return game.type === 'quiz' ? (
    <QuizPlayer game={game} me={me} onLeave={onLeave} />
  ) : (
    <TugPlayer game={game} me={me} onLeave={onLeave} />
  );
}

function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'fixed inset-0 bg-slate-950 text-white flex flex-col items-center justify-center gap-6 p-6 text-center overflow-y-auto',
        className,
      )}
    >
      {children}
    </div>
  );
}

function LeaveButton({ onLeave }: { onLeave: () => void }) {
  return (
    <button
      onClick={onLeave}
      aria-label="Leave game"
      className="absolute top-4 right-4 p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10"
    >
      <X className="w-5 h-5" />
    </button>
  );
}

function JoinForm({ game, onLeave }: { game: Game; onLeave: () => void }) {
  const [name, setName] = useState(localStorage.getItem('blitz_name') || '');
  const trimmed = name.trim().slice(0, 20);

  const go = (team: Team | '-') => {
    if (!trimmed) return;
    localStorage.setItem('blitz_name', trimmed);
    conn.send({ t: 'join', name: trimmed, team });
  };

  return (
    <Screen>
      <LeaveButton onLeave={onLeave} />
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-white/50">Game {game.code}</p>
          <h2 className="text-3xl font-black mt-1">
            {game.type === 'quiz' ? 'Quiz Blitz' : `${game.labelA} vs ${game.labelB}`}
          </h2>
        </div>
        <Input
          value={name}
          onChange={setName}
          placeholder="Your nickname"
          maxLength={20}
          autoFocus
          className="text-center text-xl"
        />
        {game.type === 'quiz' ? (
          <Button onClick={() => go('-')} disabled={!trimmed} className="w-full py-5 text-xl">
            Join quiz
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-bold text-white/60">Pick your side</p>
            <div className="grid grid-cols-2 gap-3">
              {(['A', 'B'] as const).map((t) => (
                <button
                  key={t}
                  disabled={!trimmed}
                  onClick={() => go(t)}
                  className={cn(
                    'py-8 px-3 rounded-3xl font-black text-xl break-words disabled:opacity-40 active:scale-95 transition-transform',
                    TEAM[t].bg,
                  )}
                >
                  {t === 'A' ? game.labelA : game.labelB}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Screen>
  );
}

/**
 * Counts taps on the phone instantly and trickles them to the server.
 * The server's total (`me.taps`) is the truth; after a reconnect we resend
 * whatever it has not seen yet.
 */
function useTaps(game: Game, me: Me) {
  const gameLatest = useRef(game);
  gameLatest.current = game;
  const local = useRef(me.taps);
  const sent = useRef(me.taps);
  const round = useRef(me.round);
  const synced = useRef(me.epoch);
  const [taps, setTaps] = useState(me.taps);

  // Every update from the server about me: adopt its count as "delivered".
  useEffect(() => {
    if (round.current !== me.round) {
      round.current = me.round;
      local.current = me.taps;
    } else {
      local.current = Math.max(local.current, me.taps);
    }
    sent.current = me.taps;
    synced.current = me.epoch;
    setTaps(local.current);
  }, [me]);

  useEffect(() => {
    const i = setInterval(() => {
      const n = local.current - sent.current;
      if (n <= 0 || synced.current !== conn.epoch) return;
      if (conn.sendNow({ t: 'tap', n })) sent.current = local.current;
    }, TAP_SEND_MS);
    return () => clearInterval(i);
  }, []);

  // Ignores anything faster than a human can tap.
  const bucket = useRef({ tokens: MAX_TAPS_PER_SECOND, at: performance.now() });
  const tap = useCallback(() => {
    if (tugPhase(gameLatest.current, serverNow()) !== 'live') return false;
    const b = bucket.current;
    const now = performance.now();
    b.tokens = Math.min(MAX_TAPS_PER_SECOND, b.tokens + ((now - b.at) / 1000) * MAX_TAPS_PER_SECOND);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    local.current += 1;
    setTaps(local.current);
    return true;
  }, []);

  return { tap, taps };
}

function TugPlayer({ game, me, onLeave }: { game: Game; me: Me; onLeave: () => void }) {
  const now = useNow(100);
  const phase = tugPhase(game, now);
  const { tap, taps } = useTaps(game, me);
  const team = me.team === 'B' ? 'B' : 'A';
  const myLabel = team === 'A' ? game.labelA : game.labelB;
  const { open, end } = tugTimes(game);
  const padRef = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!tap()) return;
    navigator.vibrate?.(8);
    const pad = padRef.current;
    if (!pad) return;
    const dot = document.createElement('span');
    dot.className = 'tap-ripple';
    dot.style.left = `${e.clientX}px`;
    dot.style.top = `${e.clientY}px`;
    dot.addEventListener('animationend', () => dot.remove());
    pad.appendChild(dot);
  };

  if (phase === 'lobby') {
    return (
      <Screen>
        <LeaveButton onLeave={onLeave} />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-white/50">You're in, {me.name}</p>
        <div className="w-full max-w-sm grid grid-cols-2 gap-3">
          {(['A', 'B'] as const).map((t) => (
            <button
              key={t}
              onClick={() => t !== me.team && conn.send({ t: 'team', team: t })}
              className={cn(
                'py-6 px-3 rounded-3xl font-black text-lg break-words transition-all',
                TEAM[t].bg,
                me.team === t ? 'ring-4 ring-white scale-100' : 'opacity-40 scale-95',
              )}
            >
              {t === 'A' ? game.labelA : game.labelB}
              <span className="block text-xs font-bold opacity-80 mt-1">
                {t === 'A' ? game.countA : game.countB} pulling
              </span>
            </button>
          ))}
        </div>
        <p className="text-white/60 font-bold">Tap a side to switch. Waiting for the host to start…</p>
      </Screen>
    );
  }

  if (phase === 'done') {
    const winner: Team | null =
      game.scoreA === game.scoreB ? null : game.scoreA > game.scoreB ? 'A' : 'B';
    const rank = game.topTappers.findIndex((t) => t.name === me.name && t.taps === me.taps);
    return (
      <Screen className={winner === team ? TEAM[team].bg : 'bg-slate-900'}>
        <LeaveButton onLeave={onLeave} />
        <Trophy className="w-14 h-14 text-yellow-300" />
        <h2 className="text-4xl font-black">
          {winner === null
            ? "It's a tie!"
            : winner === team
              ? 'You won!'
              : `${winner === 'A' ? game.labelA : game.labelB} takes it!`}
        </h2>
        <div className="flex items-end gap-6 font-black">
          <div>
            <div className="text-xs uppercase opacity-70">{game.labelA}</div>
            <div className="text-4xl tabular-nums">{game.scoreA}</div>
          </div>
          <div className="text-white/40 pb-1">vs</div>
          <div>
            <div className="text-xs uppercase opacity-70">{game.labelB}</div>
            <div className="text-4xl tabular-nums">{game.scoreB}</div>
          </div>
        </div>
        <p className="font-bold text-white/80">
          You pulled <span className="text-white font-black">{me.taps}</span> times
          {rank >= 0 ? ` — #${rank + 1} in the room!` : ''}
        </p>
        <p className="text-sm font-bold text-white/50">Stay here for a rematch.</p>
      </Screen>
    );
  }

  const countdown = open === null ? null : Math.ceil((open - now) / 1000);
  const remaining = end === null ? game.duration : Math.max(0, Math.ceil((end - now) / 1000));

  return (
    <div
      ref={padRef}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        'tap-pad fixed inset-0 overflow-hidden text-white flex flex-col items-center justify-between p-6 text-center',
        TEAM[team].bg,
      )}
    >
      <div className="w-full max-w-md space-y-3 pointer-events-none">
        <div className="flex justify-between items-center font-black">
          <span className="tabular-nums">{game.scoreA}</span>
          <span className="px-4 py-1 rounded-full bg-black/25 tabular-nums text-lg">
            {phase === 'live' ? `${remaining}s` : phase === 'tally' ? 'TIME!' : 'READY'}
          </span>
          <span className="tabular-nums">{game.scoreB}</span>
        </div>
        <Rope position={ropePosition(game.scoreA, game.scoreB)} className="text-[8px]" />
        <div className="flex justify-between text-[11px] font-bold uppercase opacity-80">
          <span className="truncate max-w-[45%]">{game.labelA}</span>
          <span className="truncate max-w-[45%]">{game.labelB}</span>
        </div>
      </div>

      <div className="pointer-events-none">
        {phase === 'countdown' && (
          <div key={countdown ?? 'r'} className="count-pop text-[9rem] leading-none font-black">
            {countdown === null || countdown > 3 ? '…' : Math.max(1, countdown)}
          </div>
        )}
        {phase === 'live' && (
          <>
            <div className="text-[7rem] leading-none font-black tabular-nums">{taps}</div>
            <div className="text-2xl font-black uppercase tracking-widest mt-2">Tap anywhere!</div>
          </>
        )}
        {phase === 'tally' && (
          <>
            <div className="text-6xl font-black">TIME!</div>
            <div className="text-lg font-bold opacity-80 mt-2">Counting…</div>
          </>
        )}
      </div>

      <div className="pointer-events-none font-black uppercase tracking-widest text-sm opacity-80">
        Team {myLabel}
      </div>
    </div>
  );
}

function QuizPlayer({ game, me, onLeave }: { game: Game; me: Me; onLeave: () => void }) {
  const now = useNow(200);
  // Shows the choice the instant it is tapped; the server confirms it via `me`.
  const [picked, setPicked] = useState<{ key: string; c: number } | null>(null);

  if (game.status === 'waiting') {
    return (
      <Screen>
        <LeaveButton onLeave={onLeave} />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-white/50">You're in</p>
        <h2 className="text-4xl font-black">{me.name}</h2>
        <p className="text-white/60 font-bold">
          {game.questions.length} questions. Waiting for the host to start…
        </p>
      </Screen>
    );
  }

  if (game.status === 'finished') {
    const rank = game.leaderboard.findIndex((r) => r.name === me.name && r.score === me.score);
    return (
      <Screen>
        <LeaveButton onLeave={onLeave} />
        <Trophy className="w-14 h-14 text-yellow-300" />
        <h2 className="text-5xl font-black tabular-nums">{me.score}</h2>
        <p className="font-bold text-white/70">
          {rank >= 0 ? `You finished #${rank + 1}!` : 'Your final score'}
        </p>
        <Leaderboard rows={game.leaderboard} highlight={me.name} />
      </Screen>
    );
  }

  const q = game.questions[game.qIndex];
  if (!q) return <Screen>Loading…</Screen>;
  const key = `${game.round}:${game.qIndex}`;
  const saved = me.round === game.round ? me.answers[String(game.qIndex)] : undefined;
  const mine = saved?.c ?? (picked?.key === key ? picked.c : null);
  const isRevealed = game.revealed.length > game.qIndex;
  const limitMs = q.timeLimit * 1000;
  const left = game.qStart === null ? limitMs : Math.max(0, game.qStart + limitMs - now);
  const closed = isRevealed || left <= 0;
  const correct = isRevealed ? game.revealed[game.qIndex] : null;
  const gained = isRevealed ? (me.gains[String(game.qIndex)] ?? 0) : 0;

  const answer = (c: number) => {
    if (mine !== null || closed) return;
    setPicked({ key, c });
    conn.send({ t: 'answer', c });
  };

  return (
    <div className="fixed inset-0 bg-indigo-950 text-white flex flex-col p-5 gap-4 overflow-y-auto">
      <div className="flex justify-between items-center font-black text-sm">
        <span className="px-3 py-1 rounded-full bg-white/10">
          Q{game.qIndex + 1}/{game.questions.length}
        </span>
        <span className="tabular-nums">{me.score} pts</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-yellow-400 transition-[width] duration-200 ease-linear"
          style={{ width: `${isRevealed ? 0 : (left / limitMs) * 100}%` }}
        />
      </div>
      <h2 className="text-2xl font-black text-center py-4">{q.text}</h2>

      {isRevealed && (
        <div
          className={cn(
            'rounded-2xl p-4 text-center font-black text-xl flex items-center justify-center gap-2',
            gained > 0 ? 'bg-emerald-500' : 'bg-white/10',
          )}
        >
          {gained > 0 ? <Check className="w-6 h-6" /> : <X className="w-6 h-6" />}
          {gained > 0 ? `Correct! +${gained}` : saved ? 'Not this time' : 'No answer'}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 content-center">
        {q.options.map((opt, i) =>
          opt ? (
            <button
              key={i}
              disabled={mine !== null || closed}
              onClick={() => answer(i)}
              className={cn(
                'p-5 rounded-3xl text-lg font-black text-left flex items-center gap-3 transition-all active:scale-[0.98]',
                QUIZ_COLORS[i],
                mine !== null && mine !== i && 'opacity-30',
                mine === i && 'ring-4 ring-white',
                mine === null && closed && 'opacity-30',
                correct !== null && (correct === i ? 'opacity-100 ring-4 ring-emerald-300' : 'opacity-30'),
              )}
            >
              <span className="w-9 h-9 shrink-0 bg-white/20 rounded-xl flex items-center justify-center">
                {QUIZ_SHAPES[i]}
              </span>
              {opt}
            </button>
          ) : null,
        )}
      </div>
      <p className="text-center text-sm font-bold text-white/50 min-h-5">
        {isRevealed
          ? 'Next question coming up…'
          : mine !== null
            ? 'Locked in. Waiting for the others…'
            : closed
              ? "Time's up!"
              : ''}
      </p>
    </div>
  );
}

export function Leaderboard({ rows, highlight }: { rows: { name: string; score: number }[]; highlight?: string }) {
  if (!rows.length) return null;
  return (
    <ol className="w-full max-w-sm space-y-2">
      {rows.map((r, i) => (
        <li
          key={i}
          className={cn(
            'flex justify-between items-center px-4 py-3 rounded-2xl font-bold',
            i === 0 ? 'bg-yellow-400 text-slate-900' : 'bg-white/10',
            highlight === r.name && i !== 0 && 'ring-2 ring-white',
          )}
        >
          <span className="flex gap-3 min-w-0">
            <span className="opacity-60">{i + 1}</span>
            <span className="truncate">{r.name}</span>
          </span>
          <span className="font-black tabular-nums">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}
