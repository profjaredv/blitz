import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { serverNow } from '../lib/conn';

const VARIANTS = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-900/20',
  secondary: 'bg-white text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 shadow-sm',
  outline: 'bg-white text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'text-rose-600 hover:bg-rose-50',
  dark: 'bg-ink/10 text-ink hover:bg-ink/20',
};

export function Button({
  children,
  onClick,
  className,
  variant = 'primary',
  disabled = false,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: keyof typeof VARIANTS;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'px-5 py-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  className,
  inputMode,
  autoFocus,
  type = 'text',
  autoComplete,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  inputMode?: 'text' | 'numeric' | 'email';
  autoFocus?: boolean;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 w-full">
      {label && (
        <span className="text-sm font-medium text-slate-700">{label}</span>
      )}
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoFocus={autoFocus}
        className={cn(
          'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl shadow-xs placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 focus:outline-none transition text-base text-slate-900',
          className,
        )}
      />
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-900/30">
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" aria-hidden="true">
          <path d="M13.5 2 4 14h6.5L9.5 22 20 9.5h-6.8L13.5 2Z" />
        </svg>
      </span>
      <span className="text-lg font-extrabold tracking-tight">Blitz</span>
    </span>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm', className)}>{children}</div>
  );
}

const BADGE = {
  'tug-of-war': 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  tournament: 'bg-amber-50 text-amber-800 ring-amber-200',
  quiz: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof BADGE; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ring-1 ring-inset', BADGE[tone])}>
      {children}
    </span>
  );
}

/** A row of mutually exclusive options, e.g. seconds per round. */
export function Segmented<T extends string | number>(props: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
  format?: (v: T) => string;
}): React.ReactElement;
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  format = (v) => String(v),
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
  format?: (v: T) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
      <div role="radiogroup" className="inline-flex p-1 rounded-xl bg-slate-100 self-start">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
              value === o ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Alert({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-800">
      <span className="flex-1">{children}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="font-bold text-rose-500 hover:text-rose-700">
          ×
        </button>
      )}
    </div>
  );
}

/** Server-synchronised clock, re-rendering the caller every `ms`. */
export function useNow(ms = 100) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const i = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

/** Keep the screen awake while a game is on (the host tab must stay alive). */
export function useWakeLock() {
  useEffect(() => {
    let lock: any = null;
    const request = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request('screen');
      } catch {
        /* not supported or not allowed: nothing to do */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && request();
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release?.().catch(() => {});
    };
  }, []);
}

export const TEAM = {
  A: { bg: 'bg-indigo-600', text: 'text-team-a', soft: 'bg-indigo-500/15', ring: 'ring-indigo-400' },
  B: { bg: 'bg-rose-500', text: 'text-team-b', soft: 'bg-rose-500/15', ring: 'ring-rose-400' },
} as const;

export const QUIZ_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-500'];
export const QUIZ_SHAPES = ['▲', '◆', '●', '■'];

/** Territory bar: the leading team's colour pushes the knot into the other half. */
export function Rope({ position, className }: { position: number; className?: string }) {
  return (
    <div className={cn('relative h-4 rounded-full overflow-visible ring-2 ring-ink/20', className)}>
      <div className="absolute inset-0 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-indigo-600 transition-[width] duration-500 ease-linear"
          style={{ width: `${50 - position * 42}%` }}
        />
        <div className="h-full flex-1 bg-rose-500" />
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-[220%] bg-ink/40" />
      <div
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-500 ease-linear"
        style={{ left: `${50 - position * 42}%` }}
      >
        <div className="rope-knot" />
      </div>
    </div>
  );
}
