// Double-elimination bracket, ported from Tournament of Stuff.
// Pure functions over a plain state object, so the server can keep it in a
// room and send it to every screen as-is.
//
// state = { participants: [{id, name}], matches: [Match], isReset, championId }
// Match  = { id, p1, p2, winnerId, round, bracket, matchIndex, isBye? }
//          p1/p2 are participants ({id, name}) or null.

export const ALLOWED_SIZES = [4, 8, 12, 16, 32];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const blank = (id, round, bracket, matchIndex, extra = {}) => ({
  id,
  p1: null,
  p2: null,
  winnerId: null,
  round,
  bracket,
  matchIndex,
  ...extra,
});

/**
 * Seeds a bracket. With 12 entries, the 4 named in `byeNames` (default: the
 * first 4 on the list) skip the first round.
 */
export function createBracket(names, byeNames = []) {
  const n = names.length;
  if (!ALLOWED_SIZES.includes(n)) return null;

  let parts;
  if (n === 12) {
    const byes = byeNames.filter((b) => names.includes(b)).slice(0, 4);
    const byeSet = new Set(byes.length === 4 ? byes : names.slice(0, 4));
    const rest = shuffle(names.filter((x) => !byeSet.has(x)));
    parts = [...rest, ...names.filter((x) => byeSet.has(x))].map((name, i) => ({ id: `p-${i}`, name }));
  } else {
    parts = shuffle(names).map((name, i) => ({ id: `p-${i}`, name }));
  }

  const matches = [];
  if (n === 12) {
    for (let i = 0; i < 4; i++) matches.push({ ...blank(`w-r1-m${i}`, 1, 'winners', i), p1: parts[i * 2], p2: parts[i * 2 + 1] });
    for (let i = 0; i < 4; i++) matches.push({ ...blank(`w-r2-m${i}`, 2, 'winners', i), p1: parts[8 + i] });
    for (let i = 0; i < 2; i++) matches.push(blank(`w-r3-m${i}`, 3, 'winners', i));
    matches.push(blank('w-r4-m0', 4, 'winners', 0));
    for (let i = 0; i < 2; i++) matches.push(blank(`l-r1-m${i}`, 1, 'losers', i));
    matches.push(blank('l-r2-m0', 2, 'losers', 0));
    matches.push(blank('l-r2-m1', 2, 'losers', 1));
    matches.push(blank('l-r2-m2', 2, 'losers', 2, { isBye: true }));
    matches.push(blank('l-r2-m3', 2, 'losers', 3, { isBye: true }));
    for (let i = 0; i < 2; i++) matches.push(blank(`l-r3-m${i}`, 3, 'losers', i));
    for (let i = 0; i < 2; i++) matches.push(blank(`l-r4-m${i}`, 4, 'losers', i));
    matches.push(blank('l-r5-m0', 5, 'losers', 0));
    matches.push(blank('l-r6-m0', 6, 'losers', 0));
    matches.push(blank('gf-1', 1, 'grand-final', 0));
    return { participants: parts, matches, isReset: false, championId: null };
  }

  // Winners bracket
  let count = n / 2;
  for (let round = 1; count >= 1; round++, count /= 2) {
    for (let i = 0; i < count; i++) {
      const m = blank(`w-r${round}-m${i}`, round, 'winners', i);
      if (round === 1) {
        m.p1 = parts[i * 2];
        m.p2 = parts[i * 2 + 1];
      }
      matches.push(m);
    }
  }

  // Losers bracket
  const winnersRounds = Math.log2(n);
  let lr = 1;
  for (let i = 0; i < n / 4; i++) matches.push(blank(`l-r${lr}-m${i}`, lr, 'losers', i));
  for (let w = 2; w <= winnersRounds; w++) {
    lr++;
    const major = n / 2 ** w;
    for (let i = 0; i < major; i++) matches.push(blank(`l-r${lr}-m${i}`, lr, 'losers', i));
    if (w < winnersRounds) {
      lr++;
      for (let i = 0; i < major / 2; i++) matches.push(blank(`l-r${lr}-m${i}`, lr, 'losers', i));
    }
  }

  matches.push(blank('gf-1', 1, 'grand-final', 0));
  return { participants: parts, matches, isReset: false, championId: null };
}

export const isPlayable = (m) => !!(m.p1 && m.p2 && !m.winnerId && !m.isBye);

// Rough play order: alternate winners and losers rounds, grand final last.
const order = (m) =>
  m.bracket === 'winners' ? (m.round - 1) * 2 : m.bracket === 'losers' ? m.round - 0.5 : 1000;

/** The match that should be played next, or null when the tournament is over. */
export function nextMatch(state) {
  if (state.championId) return null;
  const ready = state.matches.filter(isPlayable);
  ready.sort((a, b) => order(a) - order(b) || a.matchIndex - b.matchIndex);
  return ready[0] ?? null;
}

export function matchLabel(state, m) {
  if (m.bracket === 'grand-final') return state.isReset ? 'Grand final (decider)' : 'Grand final';
  const total = Math.max(...state.matches.filter((x) => x.bracket === m.bracket).map((x) => x.round));
  if (m.round === total) return m.bracket === 'winners' ? 'Winners final' : 'Losers final';
  return `${m.bracket === 'winners' ? 'Winners' : 'Losers'} round ${m.round}`;
}

/** Records a winner and routes both players onward. Returns a new state. */
export function decide(state, matchId, winnerId) {
  const matches = state.matches.map((m) => ({ ...m }));
  const find = (id) => matches.find((m) => m.id === id);
  const cur = find(matchId);
  if (!cur || !isPlayable(cur) || (winnerId !== cur.p1.id && winnerId !== cur.p2.id)) return state;

  const winner = winnerId === cur.p1.id ? cur.p1 : cur.p2;
  const loser = winnerId === cur.p1.id ? cur.p2 : cur.p1;
  cur.winnerId = winnerId;
  let { isReset, championId } = state;

  const grandFinal = () => {
    if (winnerId === cur.p1.id || isReset) {
      championId = winnerId;
    } else {
      // The losers-bracket finalist forced a decider: play the final again.
      isReset = true;
      cur.winnerId = null;
    }
  };

  if (state.participants.length === 12) {
    const b = cur.bracket;
    const r = cur.round;
    const i = cur.matchIndex;
    if (b === 'winners') {
      if (r === 1) {
        find(`w-r2-m${i}`).p2 = winner;
        const l = find(`l-r1-m${Math.floor(i / 2)}`);
        if (i % 2 === 0) l.p1 = loser;
        else l.p2 = loser;
      } else if (r === 2) {
        const w = find(`w-r3-m${Math.floor(i / 2)}`);
        if (i % 2 === 0) w.p1 = winner;
        else w.p2 = winner;
        if (i === 0 || i === 1) {
          const bye = find(`l-r2-m${i + 2}`);
          bye.p1 = loser;
          bye.winnerId = loser.id;
          find(`l-r3-m${i}`).p2 = loser;
        } else {
          find(`l-r2-m${i - 2}`).p2 = loser;
        }
      } else if (r === 3) {
        const w = find('w-r4-m0');
        if (i === 0) w.p1 = winner;
        else w.p2 = winner;
        find(`l-r4-m${i}`).p2 = loser;
      } else if (r === 4) {
        find('gf-1').p1 = winner;
        find('l-r6-m0').p2 = loser;
      }
    } else if (b === 'losers') {
      if (r === 1) find(`l-r2-m${i}`).p1 = winner;
      else if (r === 2) {
        const t = find(`l-r3-m${i % 2}`);
        if (i < 2) t.p1 = winner;
        else t.p2 = winner;
      } else if (r === 3) find(`l-r4-m${i}`).p1 = winner;
      else if (r === 4) {
        const t = find('l-r5-m0');
        if (i === 0) t.p1 = winner;
        else t.p2 = winner;
      } else if (r === 5) find('l-r6-m0').p1 = winner;
      else if (r === 6) find('gf-1').p2 = winner;
    } else {
      grandFinal();
    }
    return { ...state, matches, isReset, championId };
  }

  if (cur.bracket === 'winners') {
    const next = find(`w-r${cur.round + 1}-m${Math.floor(cur.matchIndex / 2)}`);
    if (next) {
      if (cur.matchIndex % 2 === 0) next.p1 = winner;
      else next.p2 = winner;
    } else {
      find('gf-1').p1 = winner;
    }
    const lr = cur.round === 1 ? 1 : (cur.round - 1) * 2;
    const l = find(`l-r${lr}-m${lr === 1 ? Math.floor(cur.matchIndex / 2) : cur.matchIndex}`);
    if (l) {
      if (lr === 1) {
        if (cur.matchIndex % 2 === 0) l.p1 = loser;
        else l.p2 = loser;
      } else {
        l.p2 = loser;
      }
    }
  } else if (cur.bracket === 'losers') {
    const toMinor = cur.round % 2 === 0;
    const idx = toMinor ? Math.floor(cur.matchIndex / 2) : cur.matchIndex;
    const next = find(`l-r${cur.round + 1}-m${idx}`);
    if (next) {
      if (toMinor) {
        if (cur.matchIndex % 2 === 0) next.p1 = winner;
        else next.p2 = winner;
      } else {
        next.p1 = winner;
      }
    } else {
      find('gf-1').p2 = winner;
    }
  } else {
    grandFinal();
  }
  return { ...state, matches, isReset, championId };
}
