/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { conn } from './lib/conn';
import type { CreateOptions, Game, Me } from './lib/game';
import { api, setToOptions, type SavedSet, type SetType, type User } from './lib/api';
import { Alert, Button, Logo } from './components/ui';
import { HostView } from './views/Host';
import { PlayerView } from './views/Player';
import { AuthPage, Dashboard, JoinBox, Landing } from './pages/Pages';
import { QuizEditor, TournamentEditor, TugEditor, type Draft } from './pages/Editors';

/** `key` stays the same while one editor is open, even after its first save. */
type View =
  | { name: 'home' }
  | { name: 'auth'; then?: SetType }
  | { name: 'edit'; type: SetType; set?: SavedSet; key: string };

const editView = (type: SetType, set?: SavedSet): View => ({ name: 'edit', type, set, key: set?.id ?? `new-${Date.now()}` });
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
  const [account, setAccount] = useState<{ accounts: boolean; user: User | null } | null>(null);
  const [view, setView] = useState<View>({ name: 'home' });
  const [initialCode] = useState(
    () => new URLSearchParams(window.location.search).get('code')?.replace(/\D/g, '').slice(0, 4) ?? '',
  );
  const [session, setSessionState] = useState<Session | null>(() =>
    initialCode.length === 4 ? { code: initialCode, role: 'player' } : loadSession(),
  );
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

  const refreshAccount = () =>
    api
      .me()
      .then(setAccount)
      .catch(() => setAccount({ accounts: false, user: null }));

  useEffect(() => {
    refreshAccount();
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
        if (msg.code === 'sign_in') {
          setView({ name: 'auth' });
          return;
        }
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

  // Everyone in a game sees the host's theme.
  useEffect(() => {
    document.documentElement.dataset.theme = game?.theme ?? 'dark';
  }, [game?.theme]);

  const user = account?.user ?? null;
  const accounts = !!account?.accounts;
  const canSave = accounts && !!user;

  const joinByCode = (code: string) => {
    setError(null);
    setBusy(true);
    const s: Session = { code, role: 'player' };
    setSession(s);
    conn.send(helloFor(s)!);
  };

  const launch = (opts: CreateOptions & { title?: string; setId?: string }) => {
    setError(null);
    setBusy(true);
    const theme = localStorage.getItem('blitz_theme') === 'light' ? 'light' : 'dark';
    conn.send({ t: 'create', opts: { ...opts, theme } });
  };

  const leave = () => {
    conn.send({ t: 'leave' });
    setSession(null);
    setGame(null);
    setMe(null);
    setView({ name: 'home' }); // the dashboard, for a signed-in host
  };

  /** Create or update the set being edited; returns its id. */
  const saveDraft = async (type: SetType, d: Draft, set?: SavedSet) => {
    const saved = set ? await api.updateSet(set.id, d.title, d.data) : await api.createSet(type, d.title, d.data);
    setView((v) => (v.name === 'edit' ? { ...v, set: saved } : v));
    return saved;
  };

  const hostDraft = async (type: SetType, d: Draft, set?: SavedSet) => {
    let setId: string | undefined;
    if (canSave) {
      try {
        setId = (await saveDraft(type, d, set)).id;
      } catch (err: any) {
        setError(err.message);
        return;
      }
    }
    launch({ ...setToOptions(type, d.data), title: d.title, setId });
  };

  const startNew = (type?: SetType) => {
    setError(null);
    if (accounts && !user) setView({ name: 'auth', then: type });
    else if (type) setView(editView(type));
    else setView({ name: 'home' });
  };

  const signedIn = async () => {
    await refreshAccount();
    conn.reconnect(); // the game server reads the new session cookie on connect
    setView(view.name === 'auth' && view.then ? editView(view.then) : { name: 'home' });
  };

  const signOut = async () => {
    await api.logout().catch(() => {});
    await refreshAccount();
    conn.reconnect();
    setView({ name: 'home' });
  };

  const offline = !online && (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[200] bg-amber-400 text-slate-900 text-center text-sm font-semibold py-1.5"
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

  if (session || !account) {
    return (
      <div className="min-h-screen bg-stage flex flex-col items-center justify-center gap-6">
        {offline}
        <RefreshCw className="w-8 h-8 text-ink/50 animate-spin" />
        {session && (
          <button onClick={leave} className="text-ink/50 font-medium text-sm hover:text-ink">
            Cancel
          </button>
        )}
      </div>
    );
  }

  const editorProps = (type: SetType, set?: SavedSet) => ({
    initial: set ? { title: set.title, data: set.data } : undefined,
    canSave,
    busy,
    onBack: () => setView({ name: 'home' }),
    onSave: async (d: Draft) => {
      try {
        await saveDraft(type, d, set);
      } catch (err: any) {
        setError(err.message);
        throw err;
      }
    },
    onHost: (d: Draft) => hostDraft(type, d, set),
  });

  let page: React.ReactNode;
  if (view.name === 'auth') {
    page = <AuthPage onDone={signedIn} onBack={() => setView({ name: 'home' })} />;
  } else if (view.name === 'edit') {
    const key = view.key;
    const props = editorProps(view.type, view.set);
    page =
      view.type === 'quiz' ? (
        <QuizEditor key={key} {...props} />
      ) : view.type === 'tournament' ? (
        <TournamentEditor key={key} {...props} />
      ) : (
        <TugEditor key={key} {...props} />
      );
  } else if (user) {
    page = (
      <Dashboard
        name={user.name}
        busy={busy}
        onNew={(type) => setView(editView(type))}
        onEdit={(set) => setView(editView(set.type, set))}
        onHostSet={(set) => launch({ ...setToOptions(set.type, set.data), title: set.title, setId: set.id })}
      />
    );
  } else {
    page = <Landing busy={busy} initialCode={initialCode} onJoin={joinByCode} onHost={startNew} accounts={accounts} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {offline}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <button onClick={() => setView({ name: 'home' })} aria-label="Blitz home">
            <Logo />
          </button>
          <div className="ml-auto flex items-center gap-3">
            {user && view.name !== 'edit' && (
              <div className="hidden sm:block">
                <JoinBox busy={busy} onJoin={joinByCode} compact />
              </div>
            )}
            {user ? (
              <div className="flex items-center gap-2">
                <span
                  title={user.email}
                  className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-semibold text-sm flex items-center justify-center"
                >
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <Button variant="ghost" onClick={signOut} className="px-2.5 py-2 text-sm">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              </div>
            ) : (
              accounts &&
              view.name !== 'auth' && (
                <Button variant="secondary" onClick={() => setView({ name: 'auth' })} className="px-3.5 py-2 text-sm">
                  Sign in
                </Button>
              )
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4">
        {error && (
          <div className="pt-4">
            <Alert onClose={() => setError(null)}>{error}</Alert>
          </div>
        )}
        <div className={view.name === 'edit' ? 'max-w-3xl mx-auto pt-6' : ''}>{page}</div>
      </main>
    </div>
  );
}
