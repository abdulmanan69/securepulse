'use client';

import { useEffect, useState } from 'react';

/**
 * Keyboard shortcut reference.
 *
 * Opens on "?" from anywhere that is not a text field. A product with a
 * command palette has to tell people the palette exists, and a help sheet is
 * cheaper than a tooltip nobody reads.
 */

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['⌘', 'K'], label: 'Open the command palette' },
  { keys: ['Ctrl', 'K'], label: 'Open the command palette (Windows / Linux)' },
  { keys: ['?'], label: 'Show this list' },
  { keys: ['Esc'], label: 'Close the palette or this list' },
  { keys: ['↑', '↓'], label: 'Move through palette results' },
  { keys: ['↵'], label: 'Run the highlighted result' },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      // Never hijack "?" while someone is writing a domain or a password.
      if (event.key === '?' && !isTypingTarget(event.target)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-[var(--shade)]"
      />
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="relative w-full max-w-md border border-rule bg-surface shadow-2xl"
      >
        <div className="border-b border-rule px-5 py-3.5">
          <h2 className="font-display text-[16px] font-bold">Keyboard shortcuts</h2>
        </div>

        <dl className="divide-y divide-rule">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.label}
              className="flex items-center justify-between gap-4 px-5 py-2.5"
            >
              <dt className="text-[13.5px]">{shortcut.label}</dt>
              <dd className="flex shrink-0 gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="min-w-[1.75rem] rounded-sm border border-rule-strong bg-paper px-1.5 py-0.5 text-center font-mono text-[11px]"
                  >
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>

        <div className="border-t border-rule px-5 py-2.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[12.5px] text-slate hover:text-ink"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
