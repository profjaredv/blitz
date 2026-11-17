/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Plus, RefreshCw, Trash2, Trophy, Zap } from 'lucide-react';
import { conn } from './lib/conn';
import type { CreateOptions, Game, Matchup, Me, Question } from './lib/game';
import { cn } from './lib/utils';
import { Button, Input } from './components/ui';
import { HostView } from './views/Host';
import { PlayerView } from './views/Player';

type View = 'home' | 'create-tug' | 'create-quiz';
type Session = { code: string; role: 'host' | 'player'; hostKey?: string };

const SESSION_KEY = 'blitz_session';

function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return s && typeof s.code === 'string' ? s : null;
  } catch {
    return null;
  }
}

/** A private random id that lets a phone reclaim its player after a refresh. */
function playerId(): string {
  let id = localStorage.getItem('blitz_pid');
  if (!id || id.length < 16) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('blitz_pid', id);
  }
  return id;
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [session, setSessionState] = useState<Session | null>(() => {
    const code = new URLSearchParams(window.location.search).get('code')?.replace(/\D/g, '').slice(0, 4);
    return code?.length === 4 ? { code, role: 'player' } : loadSession();
  });
  const [game, setGame] = useState<Game | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sessionRef = useRef(session);
  const setSession = (s: Session | null) => {
    sessionRef.current = s;
    setSessionState(s);
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  };

  const helloFor = (s: Session | null) =>
    !s
      ? null
      : s.role === 'host'
        ? { t: 'host', code: s.code, hostKey: s.hostKey }
        : { t: 'peek', code: s.code, pid: playerId() };

  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      window.history.replaceState({}, '', window.location.pathname);
    }
    const offMsg = conn.subscribe((msg) => {
      if (msg.t === 'state') {
        setBusy(false);
        setGame(msg.game);
      } else if (msg.t === 'score') {
        setGame((g) => (g ? { ...g, scoreA: msg.a, scoreB: msg.b } : g));
      } else if (msg.t === 'you') {
        setMe({ ...msg.me, epoch: conn.epoch });
      } else if (msg.t === 'created') {
        setSession({ code: msg.code, role: 'host', hostKey: msg.hostKey });
      } else if (msg.t === 'error') {
        setBusy(false);
        setError(msg.msg);
        if (msg.code === 'no_game') {
          setSession(null);
          setGame(null);
          setMe(null);
        }
      }
    });
    const offStatus = conn.onStatus(setOnline);
    conn.start(() => helloFor(sessionRef.current));
    return () => {
      offMsg();
      offStatus();
    };
  }, []);

  const joinByCode = (code: string) => {
    setError(null);
    setBusy(true);
    const s: Session = { code, role: 'player' };
    setSession(s);
    conn.send(helloFor(s)!);
  };

  const create = (opts: CreateOptions) => {
    setError(null);
    setBusy(true);
    conn.send({ t: 'create', opts });
  };

  const leave = () => {
    conn.send({ t: 'leave' });
    setSession(null);
    setGame(null);
    setMe(null);
    setView('home');
  };

  const offline = !online && (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[200] bg-amber-400 text-slate-900 text-center text-sm font-black py-1.5"
    >
      Reconnecting…
    </div>
  );

  if (session && game) {
    return (
      <>
        {offline}
        {session.role === 'host' ? (
          <HostView game={game} onLeave={leave} />
        ) : (
          <PlayerView game={game} me={me} onLeave={leave} />
        )}
      </>
    );
  }

  if (session) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
        {offline}
        <RefreshCw className="w-10 h-10 text-white/60 animate-spin" />
        <button onClick={leave} className="text-white/50 font-bold text-sm hover:text-white">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {offline}
      <header className="fixed top-0 inset-x-0 p-4 flex items-center z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <button className="flex items-center gap-2" onClick={() => setView('home')}>
          <span className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap className="text-white w-6 h-6 fill-white" />
          </span>
          <span className="text-xl font-black tracking-tight text-indigo-900">BLITZ</span>
        </button>
      </header>

      <main className="pt-24 pb-12 px-4 max-w-2xl mx-auto min-h-screen flex flex-col">
        {error && (
          <div
            role="alert"
            className="fixed top-20 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-2xl shadow-xl z-[60] font-bold flex items-center gap-2 max-w-[90vw]"
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss" className="ml-2 hover:opacity-70">
              ×
            </button>
          </div>
        )}

        {view === 'home' && <Home busy={busy} onJoin={joinByCode} onCreate={setView} />}
        {view === 'create-tug' && <CreateTug busy={busy} onCancel={() => setView('home')} onCreate={create} />}
        {view === 'create-quiz' && <CreateQuiz busy={busy} onCancel={() => setView('home')} onCreate={create} />}
      </main>
    </div>
  );
}

function Home({
  busy,
  onJoin,
  onCreate,
}: {
  busy: boolean;
  onJoin: (code: string) => void;
  onCreate: (view: View) => void;
}) {
  const [code, setCode] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 4 && !busy) onJoin(code);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-10 text-center">
      <div className="space-y-3">
        <h1 className="text-5xl font-black tracking-tight leading-tight">
          Rapid Fire <br />
          <span className="text-indigo-600">Tug-of-War</span>
        </h1>
        <p className="text-gray-500 text-lg font-medium max-w-md mx-auto">
          Two choices, one rope. Tap for the side you want and watch the room decide.
        </p>
      </div>

      <form onSubmit={submit} className="w-full bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-xl space-y-3">
        <div className="relative">
          <Input
            value={code}
            onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 4))}
            placeholder="Game code"
            inputMode="numeric"
            className="text-center text-3xl tracking-[0.4em] font-black h-20 placeholder:tracking-normal placeholder:text-xl placeholder:font-bold"
          />
          <button
            type="submit"
            disabled={busy || code.length !== 4}
            aria-label="Join game"
            className="absolute right-3 top-3 bottom-3 w-14 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-40"
          >
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </form>

      <div className="w-full space-y-3">
        <p className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">Or host a game</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button variant="outline" onClick={() => onCreate('create-tug')} className="py-6 flex-col rounded-[2rem]">
            <Zap className="w-7 h-7" />
            <span className="font-black text-lg">Tug of War</span>
            <span className="text-xs font-medium opacity-70">A series of this-vs-that rounds</span>
          </Button>
          <Button variant="outline" onClick={() => onCreate('create-quiz')} className="py-6 flex-col rounded-[2rem]">
            <Trophy className="w-7 h-7" />
            <span className="font-black text-lg">Quiz Blitz</span>
            <span className="text-xs font-medium opacity-70">Fastest right answer wins</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateTug({
  busy,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (opts: CreateOptions) => void;
}) {
  const [rows, setRows] = useState<Matchup[]>([{ a: '', b: '' }]);
  const [duration, setDuration] = useState(15);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // One matchup per line: "Pizza vs Tacos" (also accepts " v ", tab or comma).
  const parsed = (bulk ? bulkText.split('\n').map(parseLine) : rows)
    .map((m) => ({ a: m.a.trim(), b: m.b.trim() }))
    .filter((m) => m.a && m.b);

  const setRow = (i: number, side: 'a' | 'b', v: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [side]: v } : r)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.length || busy) return;
    onCreate({ type: 'tug-of-war', matchups: parsed, duration });
  };

  return (
    <form onSubmit={submit} className="flex-1 flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-black">Set up the matchups</h2>
        <p className="text-gray-500 font-medium">
          Each matchup is one round. The room taps for whichever side they want to win.
        </p>
      </div>

      <div className="flex gap-2 text-sm font-bold">
        {(['One by one', 'Paste a list'] as const).map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setBulk(i === 1)}
            className={cn(
              'px-4 py-2 rounded-xl border-2',
              bulk === (i === 1) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {bulk ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-gray-500">One matchup per line, like “Pizza vs Tacos”</span>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={8}
            placeholder={'Pizza vs Tacos\nCats vs Dogs\nBeach vs Mountains'}
            className="px-4 py-3 bg-white border-2 border-gray-200 rounded-2xl focus:border-indigo-500 focus:outline-none text-lg font-medium"
          />
        </label>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-7 shrink-0 text-center font-black text-gray-400">{i + 1}</span>
              <Input value={r.a} onChange={(v) => setRow(i, 'a', v)} placeholder="e.g. Pizza" maxLength={30} autoFocus={i === 0} />
              <span className="font-black text-gray-400 text-sm">vs</span>
              <Input value={r.b} onChange={(v) => setRow(i, 'b', v)} placeholder="e.g. Tacos" maxLength={30} />
              <button
                type="button"
                disabled={rows.length === 1}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                aria-label={`Remove matchup ${i + 1}`}
                className="p-2 text-red-400 hover:text-red-600 disabled:opacity-0"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setRows([...rows, { a: '', b: '' }])} className="w-full">
            <Plus className="w-5 h-5" /> Add matchup
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <span className="text-sm font-bold text-gray-500 uppercase tracking-wider ml-1">Seconds per matchup</span>
        <div className="grid grid-cols-4 gap-3">
          {[10, 15, 20, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDuration(d)}
              className={cn(
                'py-4 rounded-2xl font-bold border-2 transition-colors',
                duration === d
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300',
              )}
            >
              {d}s
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <Button variant="ghost" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={!parsed.length || busy} className="flex-[2]">
          {busy ? 'Creating…' : `Create game (${parsed.length} matchup${parsed.length === 1 ? '' : 's'})`}
        </Button>
      </div>
    </form>
  );
}

function parseLine(line: string): Matchup {
  const parts = line.split(/\s+vs\.?\s+|\s+v\s+|\t|,/i);
  return { a: parts[0] ?? '', b: parts.slice(1).join(' ') };
}

const BLANK: Question = { text: '', options: ['', '', '', ''], correctIndex: 0, timeLimit: 20 };

function CreateQuiz({
  busy,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (opts: CreateOptions) => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState<Question>(BLANK);

  const filled = draft.options.filter((o) => o.trim()).length;
  const canAdd = draft.text.trim() && filled >= 2 && draft.options[draft.correctIndex].trim();

  const add = () => {
    if (!canAdd) return;
    setQuestions([...questions, { ...draft, text: draft.text.trim(), options: draft.options.map((o) => o.trim()) }]);
    setDraft(BLANK);
  };

  return (
    <div className="flex-1 flex flex-col gap-6">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h2 className="text-3xl font-black">Quiz editor</h2>
          <p className="text-gray-500 font-medium">
            {questions.length} question{questions.length === 1 ? '' : 's'} added
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} className="px-4">
            Cancel
          </Button>
          <Button onClick={() => onCreate({ type: 'quiz', questions })} disabled={!questions.length || busy}>
            {busy ? 'Creating…' : 'Launch'}
          </Button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] shadow-xl space-y-5">
        <Input
          label="Question"
          value={draft.text}
          onChange={(text) => setDraft({ ...draft, text })}
          placeholder="e.g. What is the capital of France?"
          maxLength={140}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {draft.options.map((opt, i) => (
            <div key={i} className="relative">
              <Input
                label={`Option ${i + 1}${i > 1 ? ' (optional)' : ''}`}
                value={opt}
                maxLength={60}
                onChange={(val) => {
                  const options = [...draft.options];
                  options[i] = val;
                  setDraft({ ...draft, options });
                }}
                className={cn('pr-12', draft.correctIndex === i && 'border-green-500 bg-green-50')}
              />
              <button
                type="button"
                onClick={() => setDraft({ ...draft, correctIndex: i })}
                aria-label={`Mark option ${i + 1} as correct`}
                aria-pressed={draft.correctIndex === i}
                className={cn(
                  'absolute right-3 bottom-3.5 w-7 h-7 rounded-full border-2 transition-colors',
                  draft.correctIndex === i ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400',
                )}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">Time</span>
          {[10, 20, 30].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setDraft({ ...draft, timeLimit: t })}
              className={cn(
                'px-4 py-2 rounded-xl font-bold border-2 text-sm',
                draft.timeLimit === t ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600',
              )}
            >
              {t}s
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-500 font-medium">Tap the circle next to the correct answer.</p>
        <Button onClick={add} variant="outline" disabled={!canAdd} className="w-full">
          <Plus className="w-5 h-5" /> Add question
        </Button>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="bg-white p-4 rounded-2xl border-2 border-gray-100 flex justify-between items-center gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <span className="w-8 h-8 shrink-0 bg-indigo-100 rounded-lg flex items-center justify-center font-black text-indigo-600">
                {i + 1}
              </span>
              <span className="font-bold text-gray-700 truncate">{q.text}</span>
            </div>
            <button
              onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
              aria-label={`Remove question ${i + 1}`}
              className="text-red-400 hover:text-red-600 p-2"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
