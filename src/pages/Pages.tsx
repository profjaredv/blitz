import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Crown,
  Library,
  MoreHorizontal,
  Pencil,
  Play,
  Swords,
  Trash2,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { api, describeSet, plural, TYPE_NAMES, type GameRecord, type SavedSet, type SetType } from '../lib/api';
import { cn } from '../lib/utils';
import { Alert, Badge, Button, Card, Input } from '../components/ui';

// ---------------------------------------------------------------------------
// Join box: the one thing players need.

export function JoinBox({
  busy,
  onJoin,
  initialCode = '',
  compact,
}: {
  busy: boolean;
  onJoin: (code: string) => void;
  initialCode?: string;
  compact?: boolean;
}) {
  const [code, setCode] = useState(initialCode);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 4 && !busy) onJoin(code);
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <label className="sr-only" htmlFor={compact ? 'join-compact' : 'join'}>
        Game code
      </label>
      <input
        id={compact ? 'join-compact' : 'join'}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
        inputMode="numeric"
        autoComplete="off"
        placeholder={compact ? 'Code' : 'Enter game code'}
        className={cn(
          'min-w-0 flex-1 bg-white border border-slate-300 rounded-xl text-center font-bold tabular-nums text-slate-900 placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 focus:outline-none',
          compact ? 'w-24 px-3 py-2 text-base tracking-[0.3em]' : 'px-4 py-4 text-3xl tracking-[0.4em]',
        )}
      />
      <Button
        type="submit"
        variant={compact ? 'secondary' : 'primary'}
        disabled={busy || code.length !== 4}
        className={compact ? 'px-3 py-2 text-sm' : 'px-6 text-lg'}
      >
        Join <ArrowRight className="w-4 h-4" />
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Landing page (signed out).

const MODES: { type: SetType; icon: React.ReactNode; title: string; text: string }[] = [
  {
    type: 'tug-of-war',
    icon: <Zap className="w-5 h-5" />,
    title: 'Tug of War',
    text: 'This-or-that rounds. The room taps for a side and the rope moves live.',
  },
  {
    type: 'tournament',
    icon: <Swords className="w-5 h-5" />,
    title: 'Tournament of Stuff',
    text: 'A double-elimination bracket where every match is a tap battle.',
  },
  {
    type: 'quiz',
    icon: <Trophy className="w-5 h-5" />,
    title: 'Quiz Blitz',
    text: 'Multiple-choice questions. Fastest right answer scores most.',
  },
];

const MODE_TONE: Record<SetType, string> = {
  'tug-of-war': 'bg-indigo-50 text-indigo-700',
  tournament: 'bg-amber-50 text-amber-700',
  quiz: 'bg-emerald-50 text-emerald-700',
};

export function Landing({
  busy,
  initialCode,
  onJoin,
  onHost,
  accounts,
}: {
  busy: boolean;
  initialCode: string;
  onJoin: (code: string) => void;
  onHost: (type?: SetType) => void;
  accounts: boolean;
}) {
  return (
    <div className="space-y-16 py-6 sm:py-12">
      <section className="text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 text-balance">
            Let the room decide.
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 max-w-xl mx-auto text-pretty">
            Live tap battles, brackets and quizzes for any crowd. Everyone plays from their phone. No app, no sign-up.
          </p>
        </div>
        <Card className="max-w-md mx-auto p-4 sm:p-5 text-left space-y-3">
          <p className="text-sm font-medium text-slate-700">Joining a game? Enter the code on the screen.</p>
          <JoinBox busy={busy} onJoin={onJoin} initialCode={initialCode} />
        </Card>
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Host a game</h2>
            <p className="text-slate-600">
              {accounts ? 'Create a free account to build, save and run your games.' : 'Pick a format to get started.'}
            </p>
          </div>
          {accounts && (
            <Button onClick={() => onHost()}>
              Get started <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {MODES.map((m) => (
            <button
              key={m.type}
              onClick={() => onHost(m.type)}
              className="group text-left bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-5 space-y-3 hover:ring-indigo-300 hover:shadow-md transition"
            >
              <span className={cn('inline-flex w-10 h-10 rounded-xl items-center justify-center', MODE_TONE[m.type])}>
                {m.icon}
              </span>
              <div>
                <h3 className="font-semibold text-slate-900 flex items-center gap-1">
                  {m.title}
                  <ArrowRight className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition" />
                </h3>
                <p className="text-sm text-slate-600 mt-1">{m.text}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sign in / create account.

export function AuthPage({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') await api.signup(name, email, password);
      else await api.login(email, password);
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto py-10 sm:py-16 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {mode === 'signup' ? 'Create your host account' : 'Welcome back'}
        </h1>
        <p className="text-slate-600 text-sm">
          {mode === 'signup'
            ? 'Save your games and see results from every event. Players never need an account.'
            : 'Sign in to host and see your saved games.'}
        </p>
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <Input label="Name" value={name} onChange={setName} autoComplete="name" maxLength={60} autoFocus />
          )}
          <Input
            label="Email"
            type="email"
            inputMode="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            autoFocus={mode === 'login'}
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-slate-600">
        {mode === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
        <button
          onClick={() => (setMode(mode === 'signup' ? 'login' : 'signup'), setError(null))}
          className="font-semibold text-indigo-700 hover:text-indigo-600"
        >
          {mode === 'signup' ? 'Sign in' : 'Create an account'}
        </button>
      </p>
      <p className="text-center">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to home
        </button>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard: start something, saved library, history.

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export function Dashboard({
  name,
  busy,
  onNew,
  onEdit,
  onHostSet,
}: {
  name: string;
  busy: boolean;
  onNew: (type: SetType) => void;
  onEdit: (set: SavedSet) => void;
  onHostSet: (set: SavedSet) => void;
}) {
  const [sets, setSets] = useState<SavedSet[] | null>(null);
  const [games, setGames] = useState<GameRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.sets().then(setSets).catch((e) => setError(e.message));
    api.games().then(setGames).catch((e) => setError(e.message));
  }, []);

  const removeSet = async (s: SavedSet) => {
    if (!confirm(`Delete “${s.title}”? Past results stay in your history.`)) return;
    await api.deleteSet(s.id);
    setSets((xs) => xs?.filter((x) => x.id !== s.id) ?? null);
  };

  const removeGame = async (g: GameRecord) => {
    if (!confirm('Remove this game from your history?')) return;
    await api.deleteGame(g.id);
    setGames((xs) => xs?.filter((x) => x.id !== g.id) ?? null);
  };

  return (
    <div className="space-y-10 py-4 sm:py-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Hi, {name.split(' ')[0]}</h1>
        <p className="text-slate-600">Start something new, or run one of your saved games.</p>
      </div>

      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">New game</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {MODES.map((m) => (
            <button
              key={m.type}
              onClick={() => onNew(m.type)}
              className="flex items-center gap-3 text-left bg-white rounded-xl ring-1 ring-slate-200 shadow-sm px-4 py-3 hover:ring-indigo-300 hover:shadow-md transition"
            >
              <span className={cn('inline-flex w-9 h-9 shrink-0 rounded-lg items-center justify-center', MODE_TONE[m.type])}>
                {m.icon}
              </span>
              <span className="font-semibold text-slate-900">{m.title}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
          <Library className="w-4 h-4" /> Your library
        </h2>
        {sets === null ? (
          <Skeleton />
        ) : sets.length === 0 ? (
          <Empty>Games you save show up here, ready to run again with one click.</Empty>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {sets.map((s) => (
              <Card key={s.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{s.title}</h3>
                    <p className="text-sm text-slate-500">
                      {describeSet(s.type, s.data)} · edited {ago(s.updatedAt)}
                    </p>
                  </div>
                  <Badge tone={s.type}>{TYPE_NAMES[s.type]}</Badge>
                </div>
                <div className="flex items-center gap-1 mt-auto">
                  <Button onClick={() => onHostSet(s)} disabled={busy} className="px-3.5 py-2 text-sm">
                    <Play className="w-3.5 h-3.5 fill-current" /> Host
                  </Button>
                  <Button variant="ghost" onClick={() => onEdit(s)} className="px-3 py-2 text-sm">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                  <Button variant="danger" onClick={() => removeSet(s)} className="px-3 py-2 text-sm ml-auto" >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
          <Clock className="w-4 h-4" /> Recent games
        </h2>
        {games === null ? (
          <Skeleton />
        ) : games.length === 0 ? (
          <Empty>Every game you host is recorded here with its results.</Empty>
        ) : (
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {games.map((g) => (
              <div key={g.id}>
                <button
                  onClick={() => setOpen(open === g.id ? null : g.id)}
                  aria-expanded={open === g.id}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 truncate">{g.title}</span>
                      <Badge tone={g.type}>{TYPE_NAMES[g.type]}</Badge>
                    </div>
                    <p className="text-sm text-slate-500 truncate">{headline(g)}</p>
                  </div>
                  <span className="hidden sm:flex items-center gap-1 text-sm text-slate-500 tabular-nums">
                    <Users className="w-3.5 h-3.5" /> {g.players}
                  </span>
                  <span className="text-sm text-slate-500 w-24 text-right">{ago(g.startedAt)}</span>
                  <MoreHorizontal className={cn('w-4 h-4 text-slate-400 transition', open === g.id && 'rotate-90')} />
                </button>
                {open === g.id && <GameDetail g={g} onDelete={() => removeGame(g)} />}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function headline(g: GameRecord) {
  const s = g.summary ?? {};
  if (g.type === 'tournament') return s.champion ? `Champion: ${s.champion}` : `${plural(s.results?.length ?? 0, 'match')} played`;
  if (g.type === 'quiz') return s.leaderboard?.[0] ? `Winner: ${s.leaderboard[0].name} (${s.leaderboard[0].score})` : 'Not finished';
  const r = s.results ?? [];
  if (!r.length) return 'No rounds played';
  const wins = r.map((x) => (x.scoreA === x.scoreB ? 'tie' : x.scoreA > x.scoreB ? x.a : x.b));
  return `${plural(r.length, 'round')}: ${wins.slice(0, 3).join(', ')}${wins.length > 3 ? '…' : ''} won`;
}

function GameDetail({ g, onDelete }: { g: GameRecord; onDelete: () => void }) {
  const s = g.summary ?? {};
  return (
    <div className="px-4 pb-4 space-y-3 bg-slate-50/60">
      {s.champion && (
        <p className="inline-flex items-center gap-2 rounded-lg bg-amber-100 text-amber-900 px-3 py-1.5 text-sm font-semibold">
          <Crown className="w-4 h-4" /> {s.champion} won the tournament
        </p>
      )}
      {!!s.results?.length && (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-200">
            {s.results.map((r, i) => {
              const win = r.scoreA === r.scoreB ? null : r.scoreA > r.scoreB ? 'A' : 'B';
              return (
                <tr key={i}>
                  <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{r.stage}</td>
                  <td className={cn('py-1.5 text-right', win === 'A' ? 'font-semibold text-slate-900' : 'text-slate-500')}>
                    {r.a}
                  </td>
                  <td className="py-1.5 px-3 text-center tabular-nums text-slate-700 whitespace-nowrap">
                    {r.scoreA} – {r.scoreB}
                  </td>
                  <td className={cn('py-1.5', win === 'B' ? 'font-semibold text-slate-900' : 'text-slate-500')}>{r.b}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {!!s.leaderboard?.length && (
        <ol className="text-sm space-y-1">
          {s.leaderboard.map((r, i) => (
            <li key={i} className="flex justify-between max-w-xs">
              <span>
                <span className="text-slate-400 tabular-nums mr-2">{i + 1}.</span>
                {r.name}
              </span>
              <span className="tabular-nums font-medium">{r.score}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Code {g.code} · {new Date(g.startedAt).toLocaleString()}
        </span>
        <button onClick={onDelete} className="text-rose-600 hover:text-rose-700 font-medium">
          Remove from history
        </button>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function Skeleton() {
  return <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />;
}
