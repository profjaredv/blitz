import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Trophy, X } from 'lucide-react';
import { conn, serverNow } from '../lib/conn';
import {
  MAX_TAPS_PER_SECOND,
  TAP_SEND_MS,
  hasNextMatchup,
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
        'fixed inset-0 bg-stage text-ink flex flex-col items-center justify-center gap-6 p-6 text-center overflow-y-auto',
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
      className="absolute top-4 right-4 p-2 rounded-xl text-ink/50 hover:text-ink hover:bg-ink/10"
    >
      <X className="w-5 h-5" />
    </button>
  );
}

function JoinForm({ game, onLeave }: { game: Game; onLeave: () => void }) {
  const [name, setName] = useState(localStorage.getItem('blitz_name') || '');
  const trimmed = name.trim().slice(0, 20);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    localStorage.setItem('blitz_name', trimmed);
    conn.send({ t: 'join', name: trimmed });
  };

  return (
    <Screen>
      <LeaveButton onLeave={onLeave} />
      <form onSubmit={go} className="w-full max-w-sm space-y-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-ink/50">Game {game.code}</p>
          <h2 className="text-3xl font-black mt-1">{game.type === 'quiz' ? 'Quiz Blitz' : 'Tug-of-War Blitz'}</h2>
        </div>
        <Input
          value={name}
          onChange={setName}
          placeholder="Your nickname"
          maxLength={20}
          autoFocus
          className="text-center text-xl"
        />
        <Button type="submit" disabled={!trimmed} className="w-full py-5 text-xl">
          Join
        </Button>
      </form>
    </Screen>
  );
}

/**
 * Counts taps on the phone instantly and trickles them to the server.
 * The server's totals (`me.a`, `me.b`) are the truth; after a reconnect we
 * resend whatever it has not seen yet.
 */
function useTaps(game: Game, me: Me) {
  const gameLatest = useRef(game);
  gameLatest.current = game;
  const local = useRef({ a: me.a, b: me.b });
  const sent = useRef({ a: me.a, b: me.b });
  const round = useRef(me.round);
  const synced = useRef(me.epoch);
  const [, render] = useState(0);

  // Every update from the server about me: adopt its count as "delivered".
  useEffect(() => {
    if (round.current !== me.round) {
      round.current = me.round;
      local.current = { a: me.a, b: me.b };
    } else {
      local.current = { a: Math.max(local.current.a, me.a), b: Math.max(local.current.b, me.b) };
    }
    sent.current = { a: me.a, b: me.b };
    synced.current = me.epoch;
    render((n) => n + 1);
  }, [me]);

  useEffect(() => {
    const i = setInterval(() => {
      const a = local.current.a - sent.current.a;
      const b = local.current.b - sent.current.b;
      if ((a <= 0 && b <= 0) || synced.current !== conn.epoch) return;
      if (conn.sendNow({ t: 'tap', a: Math.max(0, a), b: Math.max(0, b) })) sent.current = { ...local.current };
      render((n) => n + 1);
    }, TAP_SEND_MS);
    return () => clearInterval(i);
  }, []);

  // Ignores anything faster than a human can tap.
  const bucket = useRef({ tokens: MAX_TAPS_PER_SECOND, at: performance.now() });
  const tap = useCallback((side: Team) => {
    if (tugPhase(gameLatest.current, serverNow()) !== 'live') return false;
    const b = bucket.current;
    const now = performance.now();
    b.tokens = Math.min(MAX_TAPS_PER_SECOND, b.tokens + ((now - b.at) / 1000) * MAX_TAPS_PER_SECOND);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    if (side === 'A') local.current.a += 1;
    else local.current.b += 1;
    render((n) => n + 1);
    return true;
  }, []);

  // Taps not yet sent, so this phone's own taps show up straight away.
  const unsent = {
    a: Math.max(0, local.current.a - sent.current.a),
    b: Math.max(0, local.current.b - sent.current.b),
  };
  return { tap, mine: local.current, unsent };
}

function TugPlayer({ game, me, onLeave }: { game: Game; me: Me; onLeave: () => void }) {
  const now = useNow(100);
  const phase = tugPhase(game, now);
  const { tap, mine, unsent } = useTaps(game, me);
  const { open, end } = tugTimes(game);
  const matchNo = game.stage;

  const press = (side: Team) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!tap(side)) return;
    navigator.vibrate?.(8);
    const pad = e.currentTarget;
    const box = pad.getBoundingClientRect();
    const dot = document.createElement('span');
    dot.className = 'tap-ripple';
    dot.style.left = `${e.clientX - box.left}px`;
    dot.style.top = `${e.clientY - box.top}px`;
    dot.addEventListener('animationend', () => dot.remove());
    pad.appendChild(dot);
  };

  if (phase === 'lobby') {
    return (
      <Screen>
        <LeaveButton onLeave={onLeave} />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-ink/50">You're in, {me.name}</p>
        {game.choices.length > 1 ? (
          <h2 className="text-2xl font-black">The host is picking the first matchup…</h2>
        ) : (
          <div className="space-y-2">
            <p className="text-ink/60 font-bold">{matchNo}</p>
            <h2 className="text-3xl font-black">
              <span className={TEAM.A.text}>{game.labelA}</span>
              <span className="text-ink/40 mx-3 text-xl">vs</span>
              <span className={TEAM.B.text}>{game.labelB}</span>
            </h2>
          </div>
        )}
        <p className="text-ink/60 font-bold max-w-xs">
          When it starts, tap the side you want to win. Tap fast — the rope follows the room.
        </p>
      </Screen>
    );
  }

  if (phase === 'done') {
    const winner: Team | null =
      game.scoreA === game.scoreB ? null : game.scoreA > game.scoreB ? 'A' : 'B';
    const more = hasNextMatchup(game);
    return (
      <Screen className={winner ? cn(TEAM[winner].bg, 'on-color') : 'bg-stage'}>
        <LeaveButton onLeave={onLeave} />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-ink/70">{matchNo}</p>
        <Trophy className="w-14 h-14 text-yellow-300" />
        <h2 className="text-4xl font-black break-words max-w-full">
          {winner === null ? "It's a tie!" : `${winner === 'A' ? game.labelA : game.labelB} wins!`}
        </h2>
        <div className="flex items-end gap-6 font-black">
          <div>
            <div className="text-xs uppercase opacity-70">{game.labelA}</div>
            <div className="text-4xl tabular-nums">{game.scoreA}</div>
          </div>
          <div className="text-ink/40 pb-1">vs</div>
          <div>
            <div className="text-xs uppercase opacity-70">{game.labelB}</div>
            <div className="text-4xl tabular-nums">{game.scoreB}</div>
          </div>
        </div>
        <p className="font-bold text-ink/80">
          You tapped {me.a} for {game.labelA} and {me.b} for {game.labelB}.
        </p>
        {game.champion ? (
          <p className="text-2xl font-black text-yellow-300">🏆 {game.champion} is the champion!</p>
        ) : more ? (
          <p className="text-sm font-bold text-ink/60">
            {game.choices.length === 1
              ? `Next up: ${game.upNext!.a} vs ${game.upNext!.b}`
              : 'Waiting for the host to pick the next matchup…'}
          </p>
        ) : game.type === 'tournament' ? (
          <p className="text-sm font-bold text-ink/60">Waiting for the host…</p>
        ) : (
          <Results game={game} />
        )}
      </Screen>
    );
  }

  const countdown = open === null ? null : Math.ceil((open - now) / 1000);
  const remaining = end === null ? game.duration : Math.max(0, Math.ceil((end - now) / 1000));
  const scoreA = game.scoreA + unsent.a;
  const scoreB = game.scoreB + unsent.b;
  const live = phase === 'live';

  const side = (t: Team) => (
    <button
      onPointerDown={press(t)}
      onContextMenu={(e) => e.preventDefault()}
      disabled={!live}
      aria-label={`Vote ${t === 'A' ? game.labelA : game.labelB}`}
      className={cn(
        'tap-pad relative flex-1 overflow-hidden flex flex-col items-center justify-center gap-1 px-6 text-center transition-[filter] active:brightness-110',
        TEAM[t].bg,
        'on-color',
        !live && 'brightness-75',
      )}
    >
      <span className="text-3xl sm:text-4xl font-black uppercase break-words max-w-full pointer-events-none">
        {t === 'A' ? game.labelA : game.labelB}
      </span>
      <span className="text-sm font-bold opacity-80 tabular-nums pointer-events-none">
        your taps: {t === 'A' ? mine.a : mine.b}
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 flex flex-col text-ink bg-stage select-none">
      {side('A')}
      <div className="shrink-0 px-5 py-3 space-y-2 bg-stage">
        <div className="flex justify-between items-center font-black">
          <span className={cn('text-2xl tabular-nums', TEAM.A.text)}>{scoreA}</span>
          <span className="px-4 py-1 rounded-full bg-ink/10 tabular-nums">
            {live ? `${remaining}s` : phase === 'tally' ? 'TIME!' : 'READY'}
          </span>
          <span className={cn('text-2xl tabular-nums', TEAM.B.text)}>{scoreB}</span>
        </div>
        <Rope position={ropePosition(scoreA, scoreB)} className="text-[8px]" />
      </div>
      {side('B')}

      {phase === 'countdown' && (
        <div className="absolute inset-0 bg-stage/85 flex flex-col items-center justify-center gap-4 pointer-events-none">
          <p className="font-black text-ink/70">{matchNo}</p>
          <div key={countdown ?? 'r'} className="count-pop text-[9rem] leading-none font-black">
            {countdown === null || countdown > 3 ? '…' : Math.max(1, countdown)}
          </div>
          <p className="text-2xl font-black px-6 text-center">
            <span className={TEAM.A.text}>{game.labelA}</span>
            <span className="text-ink/40 mx-2">vs</span>
            <span className={TEAM.B.text}>{game.labelB}</span>
          </p>
        </div>
      )}
      {phase === 'tally' && (
        <div className="absolute inset-0 bg-stage/70 flex items-center justify-center pointer-events-none">
          <div className="text-6xl font-black">TIME!</div>
        </div>
      )}
    </div>
  );
}

/** Every matchup's result, shown after the last one. */
export function Results({ game, large }: { game: Game; large?: boolean }) {
  return (
    <ol className={cn('w-full space-y-2 text-left', large ? 'max-w-3xl' : 'max-w-sm')}>
      {game.results.map((r, i) => {
        const win = r.scoreA === r.scoreB ? null : r.scoreA > r.scoreB ? 'A' : 'B';
        return (
          <li
            key={i}
            className={cn('grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 rounded-2xl bg-ink/10 font-bold', large && 'text-2xl py-4')}
          >
            <span className={cn('truncate', win === 'A' ? 'text-ink font-black' : 'text-ink/50')}>
              {win === 'A' && '🏆 '}
              {r.a}
            </span>
            <span className="tabular-nums text-ink/70 text-sm">
              {r.scoreA} – {r.scoreB}
            </span>
            <span className={cn('truncate text-right', win === 'B' ? 'text-ink font-black' : 'text-ink/50')}>
              {r.b}
              {win === 'B' && ' 🏆'}
            </span>
          </li>
        );
      })}
    </ol>
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
        <p className="text-xs font-black uppercase tracking-[0.3em] text-ink/50">You're in</p>
        <h2 className="text-4xl font-black">{me.name}</h2>
        <p className="text-ink/60 font-bold">
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
        <p className="font-bold text-ink/70">
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
    <div className="fixed inset-0 bg-stage-2 text-ink flex flex-col p-5 gap-4 overflow-y-auto">
      <div className="flex justify-between items-center font-black text-sm">
        <span className="px-3 py-1 rounded-full bg-ink/10">
          Q{game.qIndex + 1}/{game.questions.length}
        </span>
        <span className="tabular-nums">{me.score} pts</span>
      </div>
      <div className="h-2 rounded-full bg-ink/10 overflow-hidden">
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
            gained > 0 ? 'bg-emerald-500 on-color' : 'bg-ink/10',
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
                'on-color',
                mine !== null && mine !== i && 'opacity-30',
                mine === i && 'ring-4 ring-ink',
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
      <p className="text-center text-sm font-bold text-ink/50 min-h-5">
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
            i === 0 ? 'bg-yellow-400 text-slate-900' : 'bg-ink/10',
            highlight === r.name && i !== 0 && 'ring-2 ring-ink',
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
