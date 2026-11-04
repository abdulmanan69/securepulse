'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import {
  IconActivity,
  IconCard,
  IconGauge,
  IconReport,
  IconSettings,
  IconSites,
} from '@/components/icons';

/**
 * Primary navigation.
 *
 * A persistent sidebar rather than a top bar: this app has six destinations
 * and a user moves between sites and reports constantly, so the cost of a
 * fixed 13rem gutter buys a nav that never needs to be re-found. It collapses
 * to a sheet under `lg`.
 */

const NAV = [
  { href: '/dashboard', label: 'Overview', Icon: IconGauge, exact: true },
  { href: '/dashboard/sites', label: 'Sites', Icon: IconSites },
  { href: '/dashboard/reports', label: 'Reports', Icon: IconReport },
  { href: '/dashboard/activity', label: 'Activity', Icon: IconActivity },
];

const SECONDARY = [
  { href: '/dashboard/billing', label: 'Plan & billing', Icon: IconCard },
  { href: '/dashboard/settings', label: 'Settings', Icon: IconSettings },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  const render = (items: typeof NAV) =>
    items.map(({ href, label, Icon, exact }) => {
      const active = isActive(pathname, href, exact);
      return (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={`flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13.5px] transition-colors ${
            active
              ? 'bg-signal-soft font-medium text-signal-ink'
              : 'text-slate hover:bg-hover hover:text-ink'
          }`}
        >
          <Icon />
          {label}
        </Link>
      );
    });

  return (
    <nav className="flex flex-1 flex-col gap-0.5">
      {render(NAV)}
      <div className="my-3 border-t border-rule" />
      {render(SECONDARY)}
    </nav>
  );
}

export function SidebarContent({
  planName,
  email,
  onNavigate,
  footer,
}: {
  planName: string;
  email: string;
  onNavigate?: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col p-3">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="mb-5 flex items-center gap-2.5 px-2.5 pt-2"
      >
        <span
          aria-hidden="true"
          className="block h-5 w-5 shrink-0 border-2 border-signal"
          style={{
            clipPath: 'polygon(0 0, 100% 0, 100% 45%, 55% 45%, 55% 100%, 0 100%)',
          }}
        />
        <span className="font-display text-[16px] font-bold tracking-tight">
          SecurePulse
        </span>
      </Link>

      <NavList onNavigate={onNavigate} />

      {/* Extra bottom padding keeps the sign-out clear of the floating
          dev-tools bubble, which sits in this exact corner. */}
      <div className="mt-4 border-t border-rule pt-3 pb-14 lg:pb-3">
        <div className="px-2.5">
          <p className="truncate text-[12px] font-medium" title={email}>
            {email}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
            {planName} plan
          </p>
        </div>
        {footer ? <div className="mt-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export function MobileNav({
  planName,
  email,
  footer,
}: {
  planName: string;
  email: string;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="flex h-9 w-9 items-center justify-center rounded-sm border border-rule-strong lg:hidden"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/*
        Portaled to <body> deliberately. This trigger lives inside a header
        that uses backdrop-blur, and backdrop-filter makes an element a
        containing block for position:fixed descendants - so an inline drawer
        gets clipped to the 56px header box instead of covering the viewport.
      */}
      {open
        ? createPortal(
            <div className="fixed inset-0 z-[70] lg:hidden">
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-[var(--shade)]"
              />
              <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-rule bg-surface shadow-xl">
                <SidebarContent
                  planName={planName}
                  email={email}
                  onNavigate={() => setOpen(false)}
                  footer={footer}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
