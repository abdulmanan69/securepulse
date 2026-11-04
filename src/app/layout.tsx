import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono, Public_Sans } from 'next/font/google';

import './globals.css';

const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
});

const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'SecurePulse | Website security monitoring that catches the drift',
    template: '%s | SecurePulse',
  },
  description:
    'Continuous security monitoring for websites. Certificates expire, headers get dropped in a deploy, DNS drifts. SecurePulse checks 12 things every day and emails you the moment the grade falls.',
  openGraph: {
    type: 'website',
    siteName: 'SecurePulse',
    title: 'Website security monitoring that catches the drift',
    description:
      'A free scan in seconds, then continuous monitoring from $19/month. Built for agencies and the sites they look after.',
  },
  robots: { index: true, follow: true },
};

/**
 * Replays the saved theme before first paint.
 *
 * Without this, a dark-mode user gets a white flash on every navigation while
 * React hydrates. It is deliberately tiny, synchronous and failure-tolerant:
 * if storage throws, the page simply follows the system preference.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('securepulse-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${publicSans.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
