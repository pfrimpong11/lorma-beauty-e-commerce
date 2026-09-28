/**
 * Runtime configuration (see docs/adr/0005-runtime-config.md).
 *
 * Next inlines NEXT_PUBLIC_* at build time, which would weld one
 * environment's API URL into the image. Instead the server component in
 * app/layout.tsx reads process.env per request and writes this object into
 * the HTML; client code reads it from there.
 */
export interface RuntimeConfig {
  apiUrl: string;
  appName: string;
  currency: string;
  currencyLocale: string;
  expiryWarningDays: number;
}

const FALLBACK: RuntimeConfig = {
  apiUrl: 'http://localhost:4000',
  appName: 'Lorma Beauty POS',
  currency: 'GHS',
  currencyLocale: 'en-GH',
  expiryWarningDays: 30,
};

declare global {
  interface Window {
    __LORMA_CONFIG__?: RuntimeConfig;
  }
}

/** Read on the server, from the environment. */
export function readServerConfig(): RuntimeConfig {
  // With the proxy on, the API lives under this same origin, so the
  // browser must use relative URLs — an absolute one would point at
  // whatever machine the browser is running on.
  const proxied = Boolean(process.env.API_PROXY_TARGET);

  return {
    apiUrl: proxied ? '' : (process.env.API_URL ?? FALLBACK.apiUrl),
    appName: process.env.APP_NAME ?? FALLBACK.appName,
    currency: process.env.CURRENCY ?? FALLBACK.currency,
    currencyLocale: process.env.CURRENCY_LOCALE ?? FALLBACK.currencyLocale,
    expiryWarningDays: Number.parseInt(process.env.EXPIRY_WARNING_DAYS ?? '30', 10),
  };
}

/** Read on the client, from the injected object. */
export function getConfig(): RuntimeConfig {
  if (typeof window === 'undefined') return readServerConfig();
  return window.__LORMA_CONFIG__ ?? FALLBACK;
}
