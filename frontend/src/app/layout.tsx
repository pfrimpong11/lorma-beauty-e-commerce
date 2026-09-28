import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import { readServerConfig } from '@/lib/runtime-config';
import { Providers } from './providers';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Lorma Beauty | POS & Retail Management',
    template: '%s · Lorma Beauty POS',
  },
  description: 'Point of sale and retail management for Lorma Beauty — skincare and beauty.',
  applicationName: 'Lorma Beauty POS',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Lorma Beauty POS',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/icon-192.png' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The POS is a fixed-layout application; pinch-zooming a till screen
  // mid-sale causes mis-taps.
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#9B2C5E' },
    { media: '(prefers-color-scheme: dark)', color: '#181416' },
  ],
};

// Config is read per request, never baked into the bundle.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const config = readServerConfig();

  return (
    <html lang="en" className={poppins.variable} suppressHydrationWarning>
      <head>
        {/*
          Runtime configuration injected at request time so one image runs in
          every environment — see docs/adr/0005-runtime-config.md.
          This is public data only; secrets never appear here.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__LORMA_CONFIG__=${JSON.stringify(config)}`,
          }}
        />
      </head>
      {/*
        Extensions write their own attributes onto <body> before React
        hydrates — Grammarly adds data-gr-ext-installed and
        data-new-gr-c-s-check-loaded, password managers do the same — and
        React reports every one as a hydration mismatch. The warning on
        <html> does not reach here: it covers one element's own attributes
        and does not cascade. Nothing we render depends on these, so the
        mismatch is noise from software we do not control.
      */}
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
