import type { Config } from 'tailwindcss';

/**
 * Lorma Beauty design tokens.
 *
 * The palette is a warm rose against a soft neutral — premium skincare
 * retail, not clinical. Colours are defined as CSS variables in globals.css
 * so the same tokens drive both light and dark themes.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        /**
         * Height and pointer variants, for hardware Tailwind's width-only
         * breakpoints cannot describe.
         *
         * `short` covers the 15" POS terminals this runs on — 1024x768,
         * 1366x768 and 1280x800 are all wide enough for the desktop
         * layout but only ~710px tall once the header is subtracted, so
         * vertical padding has to give rather than the product grid.
         *
         * `touch` targets any coarse pointer: a POS terminal, a tablet or
         * a phone. Controls sized for a mouse are too small for a finger.
         */
        short: { raw: '(max-height: 820px)' },
        tall: { raw: '(min-height: 821px)' },
        touch: { raw: '(pointer: coarse)' },
      },
      colors: {
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
        'surface-sunken': 'rgb(var(--surface-sunken) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        'ink-subtle': 'rgb(var(--ink-subtle) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 12 14 / 0.04), 0 4px 16px rgb(16 12 14 / 0.06)',
        raised: '0 2px 4px rgb(16 12 14 / 0.06), 0 12px 32px rgb(16 12 14 / 0.10)',
        focus: '0 0 0 3px rgb(var(--brand-200) / 0.55)',
      },
      keyframes: {
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 180ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
