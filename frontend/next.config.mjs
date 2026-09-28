/** @type {import('next').NextConfig} */
const nextConfig = {
  // Traced server bundle — the Docker runtime image carries only what runs.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,

  // The app was split into /till and /admin sections. Anyone who installed
  // the PWA before that has shortcuts pointing at the old paths, so keep
  // them working rather than serving a 404.
  async redirects() {
    const moved = {
      '/pos': '/till',
      '/till/scanner': '/admin/devices',
      '/till/devices': '/admin/devices',
      '/sync': '/till/sync',
      '/dashboard': '/admin/dashboard',
      '/sales': '/admin/sales',
      '/returns': '/admin/returns',
      '/products': '/admin/products',
      '/categories': '/admin/categories',
      '/inventory': '/admin/inventory',
      '/expiry': '/admin/expiry',
      '/customers': '/admin/customers',
      '/staff': '/admin/staff',
      '/shifts': '/admin/shifts',
      '/reports': '/admin/reports',
      '/audit': '/admin/audit',
    };
    return Object.entries(moved).map(([source, destination]) => ({
      source,
      destination,
      permanent: false,
    }));
  },

  async headers() {
    return [
      {
        // The service worker must never be served stale, or a device can be
        // stuck on an old shell that cannot talk to the current API.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
