import React from 'react';
import { Crown, Play } from 'lucide-react';
import { isPlayable, type Bracket, type BracketMatch } from '../lib/game';
import { cn } from '../lib/utils';

/**
 * The whole double-elimination bracket. On the host screen, matches that are
 * ready to play are buttons: click one to battle it out next.
 */
export function BracketView({
  bracket,
  currentId,
  onPlay,
}: {
  bracket: Bracket;
  currentId?: string | null;
  onPlay?: (matchId: string) => void;
}) {
  const section = (kind: BracketMatch['bracket']) => {
    const matches = bracket.matches.filter((m) => m.bracket === kind);
    const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
    return rounds.map((r) => ({ round: r, matches: matches.filter((m) => m.round === r) }));
  };

  const champion = bracket.participants.find((p) => p.id === bracket.championId);

  return (
    <div className="w-full space-y-6">
      <Section title="Winners bracket" accent="text-indigo-300">
        {section('winners').map(({ round, matches }, i, all) => (
          <Column key={round} title={i === all.length - 1 ? 'Final' : `Round ${round}`}>
            {matches.map((m) => (
              <Card key={m.id} m={m} current={m.id === currentId} onPlay={onPlay} />
            ))}
          </Column>
        ))}
      </Section>
      <Section title="Losers bracket" accent="text-rose-300">
        {section('losers').map(({ round, matches }, i, all) => (
          <Column key={round} title={i === all.length - 1 ? 'Final' : `Round ${round}`}>
            {matches.map((m) => (
              <Card key={m.id} m={m} current={m.id === currentId} onPlay={onPlay} />
            ))}
          </Column>
        ))}
      </Section>
      <Section title={bracket.isReset ? 'Grand final · decider' : 'Grand final'} accent="text-yellow-300">
        <Column title="">
          {section('grand-final')[0]?.matches.map((m) => (
            <Card key={m.id} m={m} current={m.id === currentId} onPlay={onPlay} />
          ))}
        </Column>
        {champion && (
          <div className="self-center flex items-center gap-3 px-6 py-4 rounded-3xl bg-yellow-400 text-slate-900 font-black text-2xl">
            <Crown className="w-7 h-7" /> {champion.name}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className={cn('text-xs font-black uppercase tracking-[0.25em]', accent)}>{title}</h3>
      <div className="flex gap-4 overflow-x-auto pb-2">{children}</div>
    </section>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 shrink-0 w-48">
      {title && <span className="text-[11px] font-bold text-white/40 uppercase">{title}</span>}
      <div className="flex flex-col justify-around gap-2 flex-1">{children}</div>
    </div>
  );
}

function Card({
  m,
  current,
  onPlay,
}: {
  m: BracketMatch;
  current: boolean;
  onPlay?: (matchId: string) => void;
}) {
  const ready = isPlayable(m);
  const clickable = ready && !!onPlay;
  const slot = (p: BracketMatch['p1']) => {
    const won = !!p && m.winnerId === p.id;
    const lost = !!p && !!m.winnerId && m.winnerId !== p.id;
    return (
      <div
        className={cn(
          'px-3 py-1.5 truncate text-sm font-bold',
          won && 'text-white bg-white/10',
          lost && 'text-white/30 line-through',
          !p && 'text-white/20 italic font-medium',
        )}
      >
        {p ? p.name : m.isBye ? 'bye' : '—'}
      </div>
    );
  };
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onPlay!(m.id)}
      aria-label={clickable ? `Play ${m.p1!.name} vs ${m.p2!.name}` : undefined}
      className={cn(
        'relative text-left rounded-xl overflow-hidden border divide-y divide-white/5 transition-colors',
        current ? 'border-yellow-400 ring-2 ring-yellow-400/40' : ready ? 'border-indigo-400/70' : 'border-white/10',
        clickable && 'hover:bg-indigo-500/20 cursor-pointer',
        m.isBye && 'opacity-40',
      )}
    >
      {slot(m.p1)}
      {slot(m.p2)}
      {clickable && (
        <Play className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-300 fill-current" />
      )}
    </button>
  );
}
