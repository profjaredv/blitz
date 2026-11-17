/** Countdown shown on every screen between "Start" and the first tap. Keep in step with server/index.js. */
export const COUNTDOWN_MS = 3000;
/** How often a phone sends the taps it has collected. */
export const TAP_SEND_MS = 150;
/** Taps accepted per second on a phone (two thumbs manage about 14). */
export const MAX_TAPS_PER_SECOND = 20;

export const hasNextMatchup = (g: Game) => g.mIndex + 1 < g.matchups.length;

export type GameType = 'tug-of-war' | 'quiz';
export type GameStatus = 'waiting' | 'active' | 'finished';
export type Team = 'A' | 'B';

export interface PublicQuestion {
  text: string;
  options: string[];
  timeLimit: number;
}

export interface Question extends PublicQuestion {
  correctIndex: number;
}

export interface TopTapper {
  name: string;
  taps: number;
}

export interface Matchup {
  a: string;
  b: string;
}

export interface MatchResult extends Matchup {
  scoreA: number;
  scoreB: number;
}

export interface LeaderRow {
  name: string;
  score: number;
}

/** What the server tells every device about a game. Times are server milliseconds. */
export interface Game {
  code: string;
  type: GameType;
  status: GameStatus;
  /** Bumped on every rematch. */
  round: number;
  startTime: number | null;
  playerCount: number;

  // tug-of-war: a series of matchups, one round each
  /** Sides of the current matchup. */
  labelA: string;
  labelB: string;
  matchups: Matchup[];
  mIndex: number;
  /** Final score of every matchup played so far. */
  results: MatchResult[];
  duration: number;
  scoreA: number;
  scoreB: number;
  topTappers: TopTapper[];

  // quiz
  questions: PublicQuestion[];
  qIndex: number;
  qStart: number | null;
  /** Correct option for each question revealed so far. */
  revealed: number[];
  /** How many players chose each option of the question just revealed. */
  revealCounts: number[];
  answeredCount: number;
  leaderboard: LeaderRow[];

  /** Player names; only sent to the host screen. */
  roster: string[];
}

/** What the server tells one phone about its own player. */
export interface Me {
  name: string;
  round: number;
  /** Taps this player has had credited to each side this round. */
  a: number;
  b: number;
  answers: Record<string, { c: number; ms: number }>;
  /** Points earned per revealed question. */
  gains: Record<string, number>;
  score: number;
  /** Which connection this arrived on (see conn.epoch). */
  epoch: number;
}

export type CreateOptions =
  | { type: 'tug-of-war'; matchups: Matchup[]; duration: number }
  | { type: 'quiz'; questions: Question[] };

export type TugPhase = 'lobby' | 'countdown' | 'live' | 'tally' | 'done';

export function tugTimes(game: Game) {
  const open = game.startTime === null ? null : game.startTime + COUNTDOWN_MS;
  const end = open === null ? null : open + game.duration * 1000;
  return { open, end };
}

export function tugPhase(game: Game, now: number): TugPhase {
  if (game.status === 'finished') return 'done';
  if (game.status !== 'active') return 'lobby';
  const { open, end } = tugTimes(game);
  if (open === null || end === null || now < open) return 'countdown';
  return now < end ? 'live' : 'tally';
}

/** Who is ahead: -1 = A is far ahead, +1 = B is far ahead, 0 = level. */
export function ropePosition(scoreA: number, scoreB: number): number {
  const total = scoreA + scoreB;
  if (total === 0) return 0;
  // A 60/40 split of the taps moves the marker all the way over.
  const lead = (scoreB - scoreA) / Math.max(total, 30);
  return Math.max(-1, Math.min(1, lead * 5));
}

export function joinUrl(code: string) {
  return `${window.location.origin}${window.location.pathname}?code=${code}`;
}
