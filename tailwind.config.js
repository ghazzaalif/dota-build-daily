/** @type {import('tailwindcss').Config} */
const token = (name) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        panel: token('panel'),
        raised: token('raised'),
        line: token('line'),
        faint: token('faint'),
        ink: token('ink'),
        muted: token('muted'),
        gold: token('gold'),
        radiant: token('radiant'),
        dire: token('dire'),
        s: {
          green: token('s-green'),
          yellow: token('s-yellow'),
          orange: token('s-orange'),
          grey: token('s-grey'),
        },
      },
      fontFamily: {
        display: ['"Big Shoulders Display"', '"Arial Narrow"', 'Impact', 'sans-serif'],
        sans: ['"Sofia Sans"', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      // Type scale (≥1.25 between steps): 12 · 13 · 15 · 16 · 20 · 26 · 34 · 48
      fontSize: {
        meta: ['12px', { lineHeight: '16px' }],
        label: ['13px', { lineHeight: '18px' }],
        small: ['15px', { lineHeight: '22px' }],
        body: ['16px', { lineHeight: '24px' }],
        lead: ['20px', { lineHeight: '26px' }],
        h2: ['26px', { lineHeight: '28px' }],
        hero: ['34px', { lineHeight: '32px' }],
        heroLg: ['48px', { lineHeight: '44px' }],
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
    },
  },
  plugins: [],
};
