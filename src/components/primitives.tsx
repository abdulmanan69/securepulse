import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/* Shared building blocks. Kept deliberately small: this product has one
   accent colour and one radius, and the components enforce that. */

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55';

const BUTTON_VARIANTS = {
  primary: 'bg-signal text-white hover:bg-signal-hover',
  secondary: 'bg-ink text-paper hover:bg-ink-hover',
  outline: 'border border-rule-strong bg-surface text-ink hover:border-ink',
  ghost: 'text-slate hover:text-ink hover:bg-hover',
  danger: 'border border-alert/40 bg-alert-soft text-alert hover:border-alert',
} as const;

const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
} as const;

export function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = 'primary',
  size: keyof typeof BUTTON_SIZES = 'md',
  extra = '',
) {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${extra}`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<'button'> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<typeof Link> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate">
      {children}
    </span>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-rule bg-surface ${className}`}>{children}</div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[13px] text-alert">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] text-slate">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-sm border border-rule-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-signal focus:outline-none';

export function Callout({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'pass' | 'caution' | 'alert' | 'signal';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: 'border-rule bg-surface text-ink',
    pass: 'border-pass/30 bg-pass-soft text-pass',
    caution: 'border-caution/30 bg-caution-soft text-caution',
    alert: 'border-alert/30 bg-alert-soft text-alert',
    signal: 'border-signal/25 bg-signal-soft text-signal-ink',
  } as const;

  return (
    <div className={`border px-4 py-3 text-[13px] leading-relaxed ${tones[tone]}`}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}
