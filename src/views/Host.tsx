import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, Check, Copy, Crown, Moon, Play, RefreshCw, Sun, Trophy, Users, X } from 'lucide-react';
import { conn } from '../lib/conn';
import { hasNextMatchup, joinUrl, ropePosition, tugPhase, tugTimes, type Game } from '../lib/game';
import { cn } from '../lib/utils';
import { Button, QUIZ_COLORS, QUIZ_SHAPES, Rope, TEAM, useNow, useWakeLock } from '../components/ui';
import { Leaderboard, Results } from './Player';
import { BracketView } from '../components/Bracket';

/** The scoreboard for the room: put this screen on the projector. */
export function HostView({ game, onLeave }: { game: Game; onLeave: () => void }) {
  useWakeLock();
  return (
    <div className="fixed inset-0 bg-stage text-ink flex flex-col overflow-y-auto">
      <button
        onClick={() => {
          const theme = game.theme === 'light' ? 'dark' : 'light';
          localStorage.setItem('blitz_theme', theme);
          conn.send({ t: 'theme', theme });
        }}
        aria-label={game.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        title={game.theme === 'light' ? 'Dark mode' : 'Light mode'}
        className="absolute top-4 right-14 z-20 p-2 rounded-xl text-ink/40 hover:text-ink hover:bg-ink/10"
      >
        {game.theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
      </button>
      <button
        onClick={() => {
          if (game.status === 'active' && !confirm('Leave the host screen while the game is running?')) return;
          onLeave();
        }}
        aria-label="Leave game"
        className="absolute top-4 right-4 z-20 p-2 rounded-xl text-ink/40 hover:text-ink hover:bg-ink/10"
      >
        <X className="w-5 h-5" />
      </button>
      {game.type === 'quiz' ? <QuizHost game={game} /> : <TugHost game={game} />}
    </div>
  );
}

function JoinPanel({ game, compact }: { game: Game; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = joinUrl(game.code);
  return (
    <div className={cn('flex items-center gap-6', compact ? 'flex-row' : 'flex-col sm:flex-row')}>
      <div className="bg-white p-3 rounded-3xl shrink-0">
        <QRCodeSVG value={url} size={compact ? 96 : 200} level="M" />
      </div>
      <div className="text-center sm:text-left">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-ink/50">Join code</p>
        <p className={cn('font-black tracking-widest tabular-nums', compact ? 'text-4xl' : 'text-7xl sm:text-8xl')}>
          {game.code}
        </p>
        {!compact && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-ink/60 hover:text-ink"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Link copied' : 'Copy join link'}
          </button>
        )}
      </div>
    </div>
  );
}

function TugHost({ game }: { game: Game }) {
  const now = useNow(100);
  const phase = tugPhase(game, now);
  const { open, end } = tugTimes(game);

  const players = game.roster;
  const start = () => conn.send({ t: 'start' });
  const next = () => conn.send({ t: 'next' });
  const replay = () => conn.send({ t: 'replay' });
  const restart = () => conn.send({ t: 'rematch' });
  const matchNo = game.stage;
  const tournament = game.type === 'tournament';
  const play = (matchId: string) => conn.send({ t: 'next', matchId });

  if (phase === 'lobby') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6 sm:p-10">
        <JoinPanel game={game} />
        {tournament && game.bracket ? (
          <div className="w-full max-w-6xl rounded-3xl bg-ink/5 p-5">
            <BracketView bracket={game.bracket} currentId={game.current?.matchId} />
          </div>
        ) : (
          <div className="w-full max-w-3xl rounded-3xl bg-ink/5 p-5 space-y-2">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-ink/50">
              {game.matchups.length} matchup{game.matchups.length === 1 ? '' : 's'} · {game.duration}s each
            </p>
            <ol className="flex flex-wrap gap-2">
              {game.matchups.map((m, i) => (
                <li key={i} className="px-3 py-1.5 rounded-full bg-ink/10 text-sm font-bold">
                  <span className="opacity-50 mr-1">{i + 1}.</span>
                  {m.a} <span className="opacity-50">vs</span> {m.b}
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-2xl font-black">
            <Users className="w-6 h-6" /> {players.length} joined
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 max-w-3xl">
            {players.map((name, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full bg-ink/10 text-xs font-bold">
                {name}
              </span>
            ))}
          </div>
        </div>
        <Button onClick={start} disabled={players.length === 0} className="px-12 py-5 text-2xl">
          <Play className="w-7 h-7 fill-current" />
          {tournament ? `Start: ${game.labelA} vs ${game.labelB}` : 'Start matchup 1'}
        </Button>
        {players.length === 0 && (
          <p className="text-ink/50 font-bold -mt-4">Waiting for the first player to join…</p>
        )}
      </div>
    );
  }

  const done = phase === 'done';
  const { scoreA, scoreB } = game;
  const countdown = open === null ? null : Math.ceil((open - now) / 1000);
  const remaining = end === null ? game.duration : Math.max(0, Math.ceil((end - now) / 1000));
  const winner = !done || scoreA === scoreB ? null : scoreA > scoreB ? 'A' : 'B';

  return (
    <div className="flex-1 flex flex-col p-6 sm:p-10 gap-6">
      <div className="flex justify-between items-center pr-20">
        <div className="flex items-center gap-2 font-black text-ink/60">
          <Users className="w-5 h-5" /> {players.length}
          <span className="ml-3 tracking-widest">{game.code}</span>
          <span className="ml-3">{matchNo}</span>
        </div>
        <div
          className={cn(
            'px-6 py-2 rounded-full font-black text-3xl tabular-nums',
            phase === 'live' && remaining <= 5 ? 'bg-rose-500 on-color' : 'bg-ink/10',
          )}
        >
          {phase === 'countdown' ? 'READY' : phase === 'live' ? `${remaining}s` : done ? 'FINAL' : 'TIME!'}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-10 relative">
        <div className="grid grid-cols-2 gap-6 text-center">
          {(['A', 'B'] as const).map((t) => (
            <div key={t} className={cn('transition-opacity', winner && winner !== t && 'opacity-40')}>
              <div className={cn('text-2xl sm:text-5xl font-black break-words', TEAM[t].text)}>
                {t === 'A' ? game.labelA : game.labelB}
              </div>
              <div className="text-7xl sm:text-9xl font-black tabular-nums mt-2">
                {t === 'A' ? scoreA : scoreB}
              </div>
              {winner === t && (
                <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-yellow-400 text-slate-900 font-black">
                  <Trophy className="w-5 h-5" /> WINNER
                </div>
              )}
            </div>
          ))}
        </div>

        <Rope position={ropePosition(scoreA, scoreB)} className="h-6 mx-6 sm:mx-16 text-[14px]" />

        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-stage/85">
            <p className="text-3xl font-black text-ink/70">{matchNo}</p>
            <div key={countdown ?? 'r'} className="count-pop text-[14rem] leading-none font-black">
              {countdown === null || countdown > 3 ? '…' : Math.max(1, countdown)}
            </div>
          </div>
        )}
        {phase === 'tally' && (
          <p className="text-center text-xl font-black text-ink/60 animate-pulse">
            Counting the last taps…
          </p>
        )}
        {done && scoreA === scoreB && (
          <p className="text-center text-4xl font-black">It's a tie!</p>
        )}
      </div>

      {done && (
        <div className="flex flex-col items-center gap-5">
          {game.champion && (
            <div className="flex items-center gap-3 px-8 py-4 rounded-3xl bg-yellow-400 text-slate-900 font-black text-3xl sm:text-4xl">
              <Crown className="w-9 h-9" /> {game.champion} is the champion!
            </div>
          )}
          {!tournament && !hasNextMatchup(game) && game.results.length > 1 && <Results game={game} large />}
          {game.topTappers.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              <span className="px-2 py-2 text-sm font-bold text-ink/50">Fastest thumbs</span>
              {game.topTappers.map((t, i) => (
                <span key={i} className="px-4 py-2 rounded-full font-bold text-sm bg-ink/10">
                  <span className="opacity-60 mr-1">#{i + 1}</span>
                  {t.name} <span className="font-black tabular-nums ml-1">{t.taps}</span>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {game.upNext ? (
              <Button onClick={next} className="px-10 py-4 text-xl">
                Next: {game.upNext.a} vs {game.upNext.b}
                <ArrowRight className="w-6 h-6" />
              </Button>
            ) : (
              <Button onClick={restart} className="px-10 py-4 text-xl">
                <RefreshCw className="w-6 h-6" /> {tournament ? 'New tournament, same entries' : 'Play the series again'}
              </Button>
            )}
            {(!tournament || scoreA === scoreB) && (
              <Button onClick={replay} variant={scoreA === scoreB ? 'primary' : 'dark'} className="px-6 py-4">
                <RefreshCw className="w-5 h-5" /> {scoreA === scoreB ? 'Tie! Redo this matchup' : 'Redo this matchup'}
              </Button>
            )}
          </div>
          {tournament && game.bracket && (
            <div className="w-full max-w-6xl rounded-3xl bg-ink/5 p-5 mt-4">
              <BracketView bracket={game.bracket} onPlay={game.champion ? undefined : play} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuizHost({ game }: { game: Game }) {
  const now = useNow(200);
  const players = game.roster;
  const q = game.questions[game.qIndex];
  const isRevealed = game.revealed.length > game.qIndex;
  const limitMs = (q?.timeLimit ?? 20) * 1000;
  const left = game.qStart === null ? limitMs : Math.max(0, game.qStart + limitMs - now);
  const start = () => conn.send({ t: 'start' });
  const reveal = () => conn.send({ t: 'reveal' });
  const next = () => conn.send({ t: 'next' });
  const rematch = () => conn.send({ t: 'rematch' });

  if (game.status === 'waiting') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6 sm:p-10">
        <JoinPanel game={game} />
        <div className="flex items-center gap-2 text-2xl font-black">
          <Users className="w-6 h-6" /> {players.length} joined
        </div>
        <div className="flex flex-wrap justify-center gap-1.5 max-w-3xl">
          {players.map((name, i) => (
            <span key={i} className="px-2.5 py-1 rounded-full bg-ink/10 text-xs font-bold">
              {name}
            </span>
          ))}
        </div>
        <Button onClick={start} disabled={players.length === 0} className="px-12 py-5 text-2xl">
          <Play className="w-7 h-7 fill-current" />
          Start quiz ({game.questions.length} questions)
        </Button>
      </div>
    );
  }

  if (game.status === 'finished') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <Trophy className="w-16 h-16 text-yellow-300" />
        <h2 className="text-5xl font-black">Final leaderboard</h2>
        <Leaderboard rows={game.leaderboard} />
        <Button onClick={rematch} className="px-10 py-4 text-xl">
          <RefreshCw className="w-6 h-6" /> Play again
        </Button>
      </div>
    );
  }

  if (!q) return null;
  const correct = isRevealed ? game.revealed[game.qIndex] : null;
  const last = game.qIndex + 1 >= game.questions.length;

  return (
    <div className="flex-1 flex flex-col p-6 sm:p-10 gap-6 bg-stage-2">
      <div className="flex justify-between items-center pr-20 font-black">
        <span className="px-4 py-2 rounded-full bg-ink/10">
          Q{game.qIndex + 1} / {game.questions.length}
        </span>
        <span className="text-ink/70">
          {game.answeredCount} / {game.playerCount} answered
        </span>
        <span className="px-5 py-2 rounded-full bg-ink/10 text-2xl tabular-nums">
          {isRevealed ? '—' : `${Math.ceil(left / 1000)}s`}
        </span>
      </div>

      <h2 className="text-3xl sm:text-6xl font-black text-center py-6 flex-1 flex items-center justify-center">
        {q.text}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {q.options.map((opt, i) =>
          opt ? (
            <div
              key={i}
              className={cn(
                'p-5 rounded-3xl text-xl sm:text-2xl font-black flex items-center gap-4 transition-opacity',
                QUIZ_COLORS[i],
                'on-color',
                correct !== null && correct !== i && 'opacity-30',
              )}
            >
              <span className="w-10 h-10 shrink-0 bg-white/20 rounded-xl flex items-center justify-center">
                {QUIZ_SHAPES[i]}
              </span>
              <span className="flex-1">{opt}</span>
              {correct !== null && (
                <span className="tabular-nums flex items-center gap-2">
                  {correct === i && <Check className="w-6 h-6" />}
                  {game.revealCounts[i] ?? 0}
                </span>
              )}
            </div>
          ) : null,
        )}
      </div>

      <div className="flex flex-col items-center gap-4 min-h-24">
        {isRevealed ? (
          <>
            <div className="flex flex-wrap justify-center gap-2">
              {game.leaderboard.map((r, i) => (
                <span key={i} className="px-4 py-2 rounded-full bg-ink/10 font-bold text-sm">
                  <span className="opacity-60 mr-1">#{i + 1}</span>
                  {r.name} <span className="font-black tabular-nums ml-1">{r.score}</span>
                </span>
              ))}
            </div>
            <Button onClick={next} variant="secondary" className="px-8">
              {last ? 'Show final results' : 'Next question'} <ArrowRight className="w-5 h-5" />
            </Button>
          </>
        ) : (
          <Button onClick={reveal} variant="dark">
            Reveal answer now
          </Button>
        )}
      </div>
    </div>
  );
}
