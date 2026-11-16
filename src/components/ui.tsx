import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { serverNow } from '../lib/conn';

const VARIANTS = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/30',
  secondary: 'bg-white text-indigo-700 hover:bg-indigo-50 shadow-lg shadow-indigo-500/10',
  outline: 'border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50',
  ghost: 'text-gray-500 hover:bg-gray-100',
  dark: 'bg-white/10 text-white hover:bg-white/20',
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
        'px-6 py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
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
}: {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  inputMode?: 'text' | 'numeric';
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 w-full">
      {label && (
        <span className="text-sm font-bold text-gray-500 uppercase tracking-wider ml-1">{label}</span>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoFocus={autoFocus}
        className={cn(
          'px-4 py-3 bg-white border-2 border-gray-200 rounded-2xl focus:border-indigo-500 focus:outline-none transition-colors text-lg font-medium text-gray-900',
          className,
        )}
      />
    </label>
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
  A: { bg: 'bg-indigo-600', text: 'text-indigo-400', soft: 'bg-indigo-500/15', ring: 'ring-indigo-400' },
  B: { bg: 'bg-rose-500', text: 'text-rose-400', soft: 'bg-rose-500/15', ring: 'ring-rose-400' },
} as const;

export const QUIZ_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-500'];
export const QUIZ_SHAPES = ['▲', '◆', '●', '■'];

/** Territory bar: the leading team's colour pushes the knot into the other half. */
export function Rope({ position, className }: { position: number; className?: string }) {
  return (
    <div className={cn('relative h-4 rounded-full overflow-visible ring-2 ring-white/40', className)}>
      <div className="absolute inset-0 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-indigo-600 transition-[width] duration-500 ease-linear"
          style={{ width: `${50 - position * 42}%` }}
        />
        <div className="h-full flex-1 bg-rose-500" />
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-[220%] bg-white/40" />
      <div
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-500 ease-linear"
        style={{ left: `${50 - position * 42}%` }}
      >
        <div className="rope-knot" />
      </div>
    </div>
  );
}
