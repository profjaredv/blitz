import React, { useState } from 'react';
import { ArrowLeft, Check, Dices, Play, Plus, Save, Trash2 } from 'lucide-react';
import { BRACKET_SIZES, type Matchup, type Question } from '../lib/game';
import type { SetType } from '../lib/api';
import { cn } from '../lib/utils';
import { Button, Card, Input, Segmented } from '../components/ui';

/** What every editor hands back: a title and the set's data. */
export interface Draft {
  title: string;
  data: any;
}

interface EditorProps {
  initial?: Draft;
  /** Saving needs an account; hidden when accounts are off. */
  canSave: boolean;
  busy: boolean;
  onBack: () => void;
  onSave: (d: Draft) => Promise<void>;
  onHost: (d: Draft) => void;
}


/** Header, title field and the Save / Host actions shared by all three editors. */
function Shell({
  type,
  heading,
  intro,
  title,
  setTitle,
  ready,
  readyHint,
  props,
  draft,
  children,
}: {
  type: SetType;
  heading: string;
  intro: string;
  title: string;
  setTitle: (t: string) => void;
  ready: boolean;
  readyHint: string;
  props: EditorProps;
  draft: () => Draft;
  children: React.ReactNode;
}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await props.onSave(draft());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      <div className="space-y-3">
        <button
          onClick={props.onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{heading}</h1>
        </div>
        <p className="text-slate-600 max-w-xl">{intro}</p>
      </div>

      <Card className="p-5 sm:p-6">
        <Input label="Name" value={title} onChange={setTitle} placeholder="e.g. Friday lunch debate" maxLength={80} />
      </Card>

      {children}

      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-end gap-3">
          <span className="mr-auto text-sm text-slate-500 hidden sm:block">{ready ? '' : readyHint}</span>
          {props.canSave && (
            <Button variant="secondary" onClick={save} disabled={!ready || saving}>
              {saved ? <Check className="w-4 h-4 text-emerald-600" /> : <Save className="w-4 h-4" />}
              {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
            </Button>
          )}
          <Button onClick={() => props.onHost(draft())} disabled={!ready || props.busy}>
            <Play className="w-4 h-4 fill-current" />
            {props.busy ? 'Starting…' : props.canSave ? 'Save & host' : 'Host'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function parseLine(line: string): Matchup {
  const parts = line.split(/\s+vs\.?\s+|\s+v\s+|\t|,/i);
  return { a: parts[0] ?? '', b: parts.slice(1).join(' ') };
}

export function TugEditor(props: EditorProps) {
  const init = props.initial?.data;
  const [title, setTitle] = useState(props.initial?.title ?? '');
  const [rows, setRows] = useState<Matchup[]>(init?.matchups?.length ? init.matchups : [{ a: '', b: '' }]);
  const [duration, setDuration] = useState<number>(init?.duration ?? 15);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const matchups = (bulk ? bulkText.split('\n').map(parseLine) : rows)
    .map((m) => ({ a: m.a.trim(), b: m.b.trim() }))
    .filter((m) => m.a && m.b);

  const switchMode = (toBulk: boolean) => {
    // Carry what has been typed across to the other mode.
    if (toBulk) setBulkText(matchups.map((m) => `${m.a} vs ${m.b}`).join('\n'));
    else setRows(matchups.length ? matchups : [{ a: '', b: '' }]);
    setBulk(toBulk);
  };

  const setRow = (i: number, side: 'a' | 'b', v: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [side]: v } : r)));

  return (
    <Shell
      type="tug-of-war"
      heading="Tug of War"
      intro="A series of this-or-that matchups. Each round, the room taps for the side they want and the rope shows the result live."
      title={title}
      setTitle={setTitle}
      ready={matchups.length > 0}
      readyHint="Add at least one matchup."
      props={props}
      draft={() => ({ title: title.trim() || matchups.map((m) => `${m.a} vs ${m.b}`).slice(0, 2).join(', '), data: { matchups, duration } })}
    >
      <Card className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Matchups</h2>
          <Segmented
            options={['list', 'paste'] as const}
            value={bulk ? 'paste' : 'list'}
            onChange={(v) => switchMode(v === 'paste')}
            format={(v) => (v === 'list' ? 'One by one' : 'Paste a list')}
          />
        </div>

        {bulk ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-slate-500">One matchup per line, like “Pizza vs Tacos”.</span>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={8}
              placeholder={'Pizza vs Tacos\nCats vs Dogs\nBeach vs Mountains'}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 focus:outline-none text-base"
            />
          </label>
        ) : (
          <ol className="space-y-2.5">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-sm font-semibold text-slate-400 tabular-nums">{i + 1}</span>
                <Input value={r.a} onChange={(v) => setRow(i, 'a', v)} placeholder="e.g. Pizza" maxLength={30} />
                <span className="text-xs font-semibold text-slate-400">vs</span>
                <Input value={r.b} onChange={(v) => setRow(i, 'b', v)} placeholder="e.g. Tacos" maxLength={30} />
                <button
                  type="button"
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  aria-label={`Remove matchup ${i + 1}`}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:invisible"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ol>
        )}
        {!bulk && (
          <Button variant="ghost" onClick={() => setRows([...rows, { a: '', b: '' }])} className="px-3 text-indigo-700">
            <Plus className="w-4 h-4" /> Add matchup
          </Button>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <Segmented label="Seconds per round" options={[10, 15, 20, 30] as const} value={duration as 10 | 15 | 20 | 30} onChange={(d) => setDuration(d)} format={(d) => `${d}s`} />
      </Card>
    </Shell>
  );
}

// ---------------------------------------------------------------------------

const RANDOM_STUFF = [
  'Espresso', 'Pizza', 'Sneakers', 'Mountain Bike', 'Sunglasses', 'Laptop', 'Earbuds', 'Game Console',
  'Vintage Camera', 'Electric Guitar', 'Telescope', 'Vinyl Record', 'Hiking Boots', 'Surfboard',
  'Mechanical Keyboard', 'Drones', 'Electric Car', 'Bonsai Tree', 'Smart Watch', 'Designer Chair',
  'Artisan Bread', 'Craft Beer', 'Action Figure', 'Fountain Pen',
];

export function TournamentEditor(props: EditorProps) {
  const init = props.initial?.data;
  const [title, setTitle] = useState(props.initial?.title ?? '');
  const [text, setText] = useState<string>(
    init?.items?.join('\n') ??
      'Apple Inc\nCars\nClothes\nFood\nFriendship\nMusic\nNintendo\nShoes\nSocial Media\nTechnology\nThe Wheel\nTrees',
  );
  const [byes, setByes] = useState<string[]>(init?.byes ?? []);
  const [duration, setDuration] = useState<number>(init?.duration ?? 10);

  const items = [...new Set(text.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean))];
  const sizeOk = BRACKET_SIZES.includes(items.length);
  const twelve = items.length === 12;
  const chosen = byes.filter((b) => items.includes(b));
  const byeList = chosen.length === 4 ? chosen : [...chosen, ...items.filter((i) => !chosen.includes(i))].slice(0, 4);
  const toggleBye = (name: string) =>
    setByes(byeList.includes(name) ? byeList.filter((b) => b !== name) : [...byeList.slice(-3), name]);

  return (
    <Shell
      type="tournament"
      heading="Tournament of Stuff"
      intro="A double-elimination bracket. Every match is a live tap battle and the winner moves on automatically. Lose twice and you’re out."
      title={title}
      setTitle={setTitle}
      ready={sizeOk}
      readyHint={`Use ${BRACKET_SIZES.join(', ')} entries.`}
      props={props}
      draft={() => ({ title: title.trim() || 'Tournament of Stuff', data: { items, byes: twelve ? byeList : [], duration } })}
    >
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Entries</h2>
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              sizeOk ? 'text-emerald-700' : 'text-amber-700',
            )}
          >
            {items.length} {sizeOk ? '✓' : `· needs ${BRACKET_SIZES.join(', ')}`}
          </span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          aria-label="Entries, one per line"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 focus:outline-none text-base"
        />
        <Button
          variant="ghost"
          onClick={() => setText([...RANDOM_STUFF].sort(() => Math.random() - 0.5).slice(0, 16).join('\n'))}
          className="px-3 text-indigo-700"
        >
          <Dices className="w-4 h-4" /> Fill with 16 random things
        </Button>
      </Card>

      {twelve && (
        <Card className="p-5 sm:p-6 space-y-3">
          <div>
            <h2 className="font-semibold text-slate-900">First-round byes</h2>
            <p className="text-sm text-slate-500">With 12 entries, pick the 4 that skip round one ({byeList.length}/4).</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {items.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => toggleBye(name)}
                aria-pressed={byeList.includes(name)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium ring-1 ring-inset transition-colors',
                  byeList.includes(name)
                    ? 'bg-indigo-600 ring-indigo-600 text-white'
                    : 'ring-slate-300 text-slate-700 hover:bg-slate-50',
                )}
              >
                {name}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <Segmented label="Seconds per match" options={[10, 15, 20, 30] as const} value={duration as 10 | 15 | 20 | 30} onChange={(d) => setDuration(d)} format={(d) => `${d}s`} />
      </Card>
    </Shell>
  );
}

// ---------------------------------------------------------------------------

const BLANK: Question = { text: '', options: ['', '', '', ''], correctIndex: 0, timeLimit: 20 };
const OPTION_TONES = ['bg-red-500', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-500'];

export function QuizEditor(props: EditorProps) {
  const [title, setTitle] = useState(props.initial?.title ?? '');
  const [questions, setQuestions] = useState<Question[]>(props.initial?.data?.questions ?? []);
  const [draft, setDraft] = useState<Question>(BLANK);
  const [editing, setEditing] = useState<number | null>(null);

  const filled = draft.options.filter((o) => o.trim()).length;
  const canAdd = !!draft.text.trim() && filled >= 2 && !!draft.options[draft.correctIndex].trim();

  const commit = () => {
    if (!canAdd) return;
    const q = { ...draft, text: draft.text.trim(), options: draft.options.map((o) => o.trim()) };
    setQuestions(editing === null ? [...questions, q] : questions.map((x, i) => (i === editing ? q : x)));
    setDraft(BLANK);
    setEditing(null);
  };

  return (
    <Shell
      type="quiz"
      heading="Quiz Blitz"
      intro="Multiple-choice questions. Right answers score up to 1,500 points, more for answering fast."
      title={title}
      setTitle={setTitle}
      ready={questions.length > 0}
      readyHint="Add at least one question."
      props={props}
      draft={() => ({ title: title.trim() || 'Quiz', data: { questions } })}
    >
      <Card className="p-5 sm:p-6 space-y-5">
        <h2 className="font-semibold text-slate-900">
          {editing === null ? `Question ${questions.length + 1}` : `Edit question ${editing + 1}`}
        </h2>
        <Input
          label="Question"
          value={draft.text}
          onChange={(text) => setDraft({ ...draft, text })}
          placeholder="e.g. What is the capital of France?"
          maxLength={140}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700 mb-1.5">
            Answers <span className="font-normal text-slate-500">· select the correct one</span>
          </legend>
          {draft.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className={cn('w-2 h-8 rounded-full shrink-0', OPTION_TONES[i])} />
              <Input
                value={opt}
                maxLength={60}
                placeholder={i < 2 ? `Answer ${i + 1}` : `Answer ${i + 1} (optional)`}
                onChange={(val) => {
                  const options = [...draft.options];
                  options[i] = val;
                  setDraft({ ...draft, options });
                }}
              />
              <button
                type="button"
                onClick={() => setDraft({ ...draft, correctIndex: i })}
                aria-label={`Mark answer ${i + 1} as correct`}
                aria-pressed={draft.correctIndex === i}
                className={cn(
                  'shrink-0 w-9 h-9 rounded-full ring-1 ring-inset flex items-center justify-center transition-colors',
                  draft.correctIndex === i
                    ? 'bg-emerald-600 ring-emerald-600 text-white'
                    : 'ring-slate-300 text-transparent hover:ring-emerald-500 hover:text-emerald-500',
                )}
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ))}
        </fieldset>
        <Segmented
          label="Time to answer"
          options={[10, 20, 30] as const}
          value={draft.timeLimit as 10 | 20 | 30}
          onChange={(timeLimit) => setDraft({ ...draft, timeLimit })}
          format={(t) => `${t}s`}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={commit} disabled={!canAdd}>
            {editing === null ? <Plus className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {editing === null ? 'Add question' : 'Update question'}
          </Button>
          {editing !== null && (
            <Button variant="ghost" onClick={() => (setDraft(BLANK), setEditing(null))}>
              Cancel
            </Button>
          )}
        </div>
      </Card>

      {questions.length > 0 && (
        <Card className="divide-y divide-slate-100">
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <span className="w-6 text-sm font-semibold text-slate-400 tabular-nums">{i + 1}</span>
              <button
                onClick={() => (setDraft(q), setEditing(i))}
                className="flex-1 min-w-0 text-left truncate font-medium text-slate-800 hover:text-indigo-700"
              >
                {q.text}
              </button>
              <span className="text-xs text-slate-500 tabular-nums">{q.timeLimit}s</span>
              <button
                onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
                aria-label={`Remove question ${i + 1}`}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </Card>
      )}
    </Shell>
  );
}
