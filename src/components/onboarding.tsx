import Link from 'next/link';

import { IconCheck } from '@/components/icons';

/**
 * Setup checklist.
 *
 * Shown until every step is done, then it disappears for good. The steps are
 * the real sequence that turns a signup into a customer who gets value:
 * a site, a first scan, proof of ownership, and a schedule. Without the last
 * one the product is a spot check, which is the thing it exists not to be.
 */

export interface OnboardingState {
  hasSite: boolean;
  hasScan: boolean;
  hasVerified: boolean;
  hasSchedule: boolean;
  schedulingAvailable: boolean;
}

export function isOnboardingComplete(state: OnboardingState): boolean {
  return (
    state.hasSite &&
    state.hasScan &&
    state.hasVerified &&
    (state.hasSchedule || !state.schedulingAvailable)
  );
}

export function OnboardingChecklist({
  state,
  firstSiteId,
}: {
  state: OnboardingState;
  firstSiteId: string | null;
}) {
  const steps = [
    {
      done: state.hasSite,
      title: 'Add a site',
      body: 'The domain you want to keep an eye on.',
      href: '/dashboard/sites?add=1',
      cta: 'Add a site',
    },
    {
      done: state.hasScan,
      title: 'Run your first scan',
      body: 'Twelve checks, a few seconds, a full report.',
      href: '/dashboard/sites',
      cta: 'Run a scan',
    },
    {
      done: state.hasVerified,
      title: 'Verify ownership',
      body: 'A DNS TXT record unlocks checks for accidentally published files like .env and .git.',
      href: firstSiteId ? `/dashboard/sites/${firstSiteId}` : '/dashboard/sites',
      cta: 'Verify a domain',
    },
    {
      done: state.hasSchedule,
      title: state.schedulingAvailable
        ? 'Turn on a schedule'
        : 'Turn on a schedule (Pro)',
      body: state.schedulingAvailable
        ? 'Daily or weekly, with an email the moment the grade drops. This is the part that catches what you would otherwise miss.'
        : 'Automatic re-checks and grade-drop alerts are part of the Pro plan.',
      href: state.schedulingAvailable
        ? firstSiteId
          ? `/dashboard/sites/${firstSiteId}`
          : '/dashboard/sites'
        : '/dashboard/billing',
      cta: state.schedulingAvailable ? 'Set a schedule' : 'See Pro',
    },
  ];

  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);

  return (
    <section className="border border-signal/25 bg-signal-soft/50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-signal/20 px-5 py-3">
        <h2 className="font-display text-[15px] font-bold text-signal-ink">
          Finish setting up
        </h2>
        <p className="font-mono text-[11px] text-signal-ink">
          {done} of {steps.length} done
        </p>
      </div>

      <ol className="divide-y divide-signal/15">
        {steps.map((step) => (
          <li
            key={step.title}
            className="flex flex-wrap items-start gap-x-3 gap-y-2.5 px-5 py-3"
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                step.done
                  ? 'border-pass bg-pass text-white'
                  : 'border-signal/40 bg-surface'
              }`}
            >
              {step.done ? <IconCheck size={10} /> : null}
            </span>

            <div className="min-w-0 flex-1 basis-[calc(100%-1.75rem)] sm:basis-auto">
              <p
                className={`text-[13.5px] font-medium ${
                  step.done ? 'text-slate line-through' : 'text-ink'
                }`}
              >
                {step.title}
              </p>
              {!step.done ? (
                <p className="mt-0.5 max-w-[64ch] text-[12.5px] leading-relaxed text-slate">
                  {step.body}
                </p>
              ) : null}
            </div>

            {!step.done && step === next ? (
              <Link
                href={step.href}
                className="inline-flex h-8 w-full shrink-0 items-center justify-center rounded-sm bg-signal px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-signal-hover sm:w-auto sm:justify-start"
              >
                {step.cta}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
