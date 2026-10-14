/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'color-mix(in srgb, var(--bg) calc(<alpha-value> * 100%), transparent)',
        panel: 'color-mix(in srgb, var(--panel) calc(<alpha-value> * 100%), transparent)',
        raised: 'color-mix(in srgb, var(--raised) calc(<alpha-value> * 100%), transparent)',
        line: 'color-mix(in srgb, var(--line) calc(<alpha-value> * 100%), transparent)',
        ink: 'color-mix(in srgb, var(--ink) calc(<alpha-value> * 100%), transparent)',
        muted: 'color-mix(in srgb, var(--muted) calc(<alpha-value> * 100%), transparent)',
        gold: 'color-mix(in srgb, var(--gold) calc(<alpha-value> * 100%), transparent)',
        s: {
          green: 'color-mix(in srgb, var(--s-green) calc(<alpha-value> * 100%), transparent)',
          yellow: 'color-mix(in srgb, var(--s-yellow) calc(<alpha-value> * 100%), transparent)',
          orange: 'color-mix(in srgb, var(--s-orange) calc(<alpha-value> * 100%), transparent)',
          grey: 'color-mix(in srgb, var(--s-grey) calc(<alpha-value> * 100%), transparent)',
        },
      },
      fontFamily: {
        display: ['Cinzel', 'Trajan Pro', 'Georgia', 'serif'],
        sans: ['"Barlow Semi Condensed"', '"Arial Narrow"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
