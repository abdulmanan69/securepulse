'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { IconCheck } from '@/components/icons';

/**
 * Toasts.
 *
 * Hand-rolled rather than a library: this needs three tones, a timer and a
 * dismiss button. A dependency for that is bundle weight and another thing to
 * keep current.
 *
 * Messages are announced politely to screen readers, so an action that only
 * confirms itself visually is not silent for everyone else.
 */

type Tone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const ToastContext = createContext<{
  push: (toast: Omit<Toast, 'id'>) => void;
} | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return context;
}

const TONE_STYLES: Record<Tone, string> = {
  success: 'border-pass/35 bg-pass-soft text-pass',
  error: 'border-alert/35 bg-alert-soft text-alert',
  info: 'border-signal/30 bg-signal-soft text-signal-ink',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      // Errors stay until dismissed; they usually need reading twice.
      if (toast.tone !== 'error') {
        setTimeout(() => dismiss(id), 4500);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 border px-3.5 py-3 shadow-lg ${TONE_STYLES[toast.tone]}`}
          >
            {toast.tone === 'success' ? (
              <span className="mt-0.5 shrink-0">
                <IconCheck />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">{toast.title}</p>
              {toast.body ? (
                <p className="mt-0.5 text-[12.5px] leading-relaxed opacity-90">
                  {toast.body}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
