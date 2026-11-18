import type { CreateOptions, MatchResult, LeaderRow } from './game';

export interface User {
  id: string;
  email: string;
  name: string;
}

export type SetType = 'tug-of-war' | 'tournament' | 'quiz';

/** A saved matchup list, tournament entry list or quiz. */
export interface SavedSet {
  id: string;
  type: SetType;
  title: string;
  data: any;
  updatedAt: string;
}

/** One game the host ran, with its latest results. */
export interface GameRecord {
  id: string;
  setId: string | null;
  type: SetType;
  title: string;
  code: string;
  players: number;
  startedAt: string;
  summary: {
    status?: string;
    results?: MatchResult[];
    champion?: string | null;
    leaderboard?: LeaderRow[];
    questions?: number;
  };
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  me: () => call<{ accounts: boolean; user: User | null }>('GET', '/api/me'),
  signup: (name: string, email: string, password: string) =>
    call<{ user: User }>('POST', '/api/signup', { name, email, password }),
  login: (email: string, password: string) => call<{ user: User }>('POST', '/api/login', { email, password }),
  logout: () => call('POST', '/api/logout', {}),

  sets: () => call<{ sets: SavedSet[] }>('GET', '/api/sets').then((r) => r.sets),
  createSet: (type: SetType, title: string, data: unknown) =>
    call<{ set: SavedSet }>('POST', '/api/sets', { type, title, data }).then((r) => r.set),
  updateSet: (id: string, title: string, data: unknown) =>
    call<{ set: SavedSet }>('PUT', `/api/sets/${id}`, { title, data }).then((r) => r.set),
  deleteSet: (id: string) => call('DELETE', `/api/sets/${id}`),

  games: () => call<{ games: GameRecord[] }>('GET', '/api/games').then((r) => r.games),
  deleteGame: (id: string) => call('DELETE', `/api/games/${id}`),
};

/** The game options a saved set turns into. */
export function setToOptions(type: SetType, data: any): CreateOptions {
  if (type === 'quiz') return { type, questions: data.questions ?? [] };
  if (type === 'tournament') return { type, items: data.items ?? [], byes: data.byes ?? [], duration: data.duration ?? 10 };
  return { type, matchups: data.matchups ?? [], duration: data.duration ?? 15 };
}

export function describeSet(type: SetType, data: any) {
  if (type === 'quiz') return plural(data.questions?.length ?? 0, 'question');
  if (type === 'tournament') return plural(data.items?.length ?? 0, 'entry', 'entries');
  return plural(data.matchups?.length ?? 0, 'matchup');
}

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export const TYPE_NAMES: Record<SetType, string> = {
  'tug-of-war': 'Tug of War',
  tournament: 'Tournament',
  quiz: 'Quiz',
};
