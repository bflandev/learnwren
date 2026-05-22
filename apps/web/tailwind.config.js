const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: 'var(--lw-bg)', 2: 'var(--lw-bg-2)', 3: 'var(--lw-bg-3)' },
        line: { DEFAULT: 'var(--lw-line)', 2: 'var(--lw-line-2)' },
        ink: {
          DEFAULT: 'var(--lw-ink)',
          2: 'var(--lw-ink-2)',
          3: 'var(--lw-ink-3)',
          4: 'var(--lw-ink-4)',
        },
        ochre: {
          DEFAULT: 'var(--lw-ochre)',
          2: 'var(--lw-ochre-2)',
          ink: 'var(--lw-ochre-ink)',
        },
        moss: 'var(--lw-moss)',
        clay: 'var(--lw-clay)',
        rust: 'var(--lw-rust)',
        good: 'var(--lw-good)',
        warn: 'var(--lw-warn)',
        bad: 'var(--lw-bad)',
      },
      fontFamily: {
        sans: 'var(--lw-font-sans)',
        serif: 'var(--lw-font-serif)',
        mono: 'var(--lw-font-mono)',
      },
      borderRadius: {
        sm: 'var(--lw-r-sm)',
        DEFAULT: 'var(--lw-r)',
        lg: 'var(--lw-r-lg)',
        xl: 'var(--lw-r-xl)',
      },
      boxShadow: {
        1: 'var(--lw-shadow-1)',
        2: 'var(--lw-shadow-2)',
      },
    },
  },
  plugins: [],
};
