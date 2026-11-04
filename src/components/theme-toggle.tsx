'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Theme switch.
 *
 * Three states, not two: "System" is the default and the honest one, because
 * most people have already expressed a preference at the OS level and a
 * product that ignores it is making a decision it was not asked to make.
 *
 * The choice is written to `data-theme` on <html> and mirrored to
 * localStorage. The inline script in the root layout replays it before first
 * paint, so a dark-mode user never sees a white flash.
 *
 * Read through useSyncExternalStore rather than an effect: localStorage is an
 * external store, and this is the primitive React provides for exactly that.
 * It also keeps two mounted toggles (header and footer) in agreement.
 */

type Choice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'securepulse-theme';
const CHANGE_EVENT = 'securepulse:theme';

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  // Another tab changing the theme should update this one too.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): Choice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private browsing can refuse storage; fall through to system.
  }
  return 'system';
}

/** The server cannot know the preference, so it renders the neutral default. */
function getServerSnapshot(): Choice {
  return 'system';
}

const OPTIONS: Array<{ value: Choice; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const apply = useCallback((next: Choice) => {
    const root = document.documentElement;
    if (next === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', next);

    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The theme still applies to this page; it just is not remembered.
    }

    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex rounded-sm border border-rule-strong bg-surface p-0.5"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={choice === option.value}
          onClick={() => apply(option.value)}
          className={`rounded-[2px] px-2.5 py-1 text-[12px] transition-colors ${
            choice === option.value
              ? 'bg-ink text-paper'
              : 'text-slate hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
