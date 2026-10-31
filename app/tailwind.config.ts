import type { Config } from 'tailwindcss'

/*
 * ZTA × Tally theme for the dashboard.
 *
 * The app was built with Tailwind's stock palette (gray-*, blue-*, white…),
 * so the palette itself is remapped onto the Tally tokens: every existing
 * screen picks up the identity at once, in light and dark mode, without
 * rewriting thousands of class names. Hand-built screens use the semantic
 * names from the handoff (bg-card, text-ink-2, shadow-pop-app…) and the
 * component classes in src/styles/zta.css.
 */

// Lavender-plum neutrals. Light UI uses the low end for surfaces and the high
// end for text; dark UI (dark:bg-gray-900 etc.) lands on the handoff's dark
// surfaces. Text shades meet WCAG AA on white and on the dark card.
const plum = {
  50: '#F7F2FF',  // --bg
  100: '#EDE4FC', // --soft
  200: '#E2D5F8', // --soft-2
  300: '#C9B8E8',
  400: '#A898C8', // dark --ink-3
  500: '#75688F',
  600: '#695D82', // --ink-3
  700: '#4F4268', // --ink-2
  800: '#2E2248', // dark --soft
  900: '#221838', // dark --card
  950: '#17102A', // dark --bg
}

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Stock palette → Tally
        gray: plum,
        slate: plum,
        // blue = links, focus, info (sky family; white text passes on 600+)
        blue: {
          50: '#EEF7FF', 100: '#D8ECFF', 200: '#B5DCFF', 300: '#7CC4FF', 400: '#4FA3E8',
          500: '#2F80CC', 600: '#1C5FA8', 700: '#174C87', 800: '#133E6E', 900: '#0F3157',
        },
        // indigo/purple (used for some accents) → plum
        indigo: plum,
        purple: plum,
        green: {
          50: '#EEFBF5', 100: '#D6F6EA', 200: '#ADEDD5', 300: '#7EE3BE', 400: '#3DD6A3', 500: '#1FA87A',
          600: '#11734F', 700: '#0E5E41', 800: '#0B4A33', 900: '#083626',
        },
        emerald: {
          50: '#EEFBF5', 100: '#D6F6EA', 200: '#ADEDD5', 300: '#7EE3BE', 400: '#3DD6A3', 500: '#1FA87A',
          600: '#11734F', 700: '#0E5E41', 800: '#0B4A33', 900: '#083626',
        },
        red: {
          50: '#FFF3EF', 100: '#FFE3DA', 200: '#FFC4B5', 300: '#FF9A84', 400: '#FF6B4A', 500: '#E64A2A',
          600: '#C0281B', 700: '#9E2016', 800: '#7C1912', 900: '#5A120D',
        },
        yellow: {
          50: '#FFF8E0', 100: '#FFF0C2', 200: '#FFE38A', 300: '#FFD65C', 400: '#FFC93C', 500: '#F2B21A',
          600: '#B07D06', 700: '#8A6205', 800: '#664804', 900: '#443003',
        },
        orange: {
          50: '#FFF3EF', 100: '#FFE3DA', 200: '#FFC4B5', 300: '#FF9A84', 400: '#FF6B4A', 500: '#E64A2A',
          600: '#B8321A', 700: '#962815', 800: '#741F10', 900: '#52160B',
        },

        // Semantic tokens (CSS variables, light + dark in globals.scss)
        primary: {
          DEFAULT: 'rgb(var(--primary))',
          foreground: 'rgb(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted))',
          foreground: 'rgb(var(--muted-foreground))',
        },
        background: 'rgb(var(--background))',
        foreground: 'rgb(var(--foreground))',
        border: 'rgb(var(--border))',
        input: 'rgb(var(--input))',

        // Handoff names (zta.css variables)
        bg: 'var(--bg)',
        card: 'var(--card)',
        soft: { DEFAULT: 'var(--soft)', 2: 'var(--soft-2)' },
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        line: 'var(--line)',
        tomato: { DEFAULT: 'var(--tomato)', dk: 'var(--tomato-dk)', text: 'var(--tomato-text)', soft: 'var(--coral-soft)' },
        sun: { DEFAULT: 'var(--sun)', soft: 'var(--sun-soft)' },
        mint: { DEFAULT: 'var(--mint)', soft: 'var(--mint-soft)', text: 'var(--mint-text)' },
        sky: { DEFAULT: 'var(--sky)', soft: 'var(--sky-soft)', text: 'var(--sky-text)' },
        bad: 'var(--bad)',
        'on-accent': 'var(--on-accent)',
      },
      fontFamily: {
        display: ['Fredoka', 'sans-serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '10px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
      borderWidth: {
        DEFAULT: '1.5px',
      },
      boxShadow: {
        // Flat plum offset shadow (the handoff's "pop"), toned down for the app
        sm: '0 2px 0 var(--shadow-c)',
        DEFAULT: '0 2px 0 var(--shadow-c)',
        md: '0 3px 0 var(--shadow-c)',
        lg: '0 5px 0 var(--shadow-c)',
        xl: '0 8px 0 var(--shadow-c)',
        'pop-sm': '0 3px 0 var(--shadow-c)',
        pop: '0 5px 0 var(--shadow-c)',
        'pop-app': '0 2px 0 var(--shadow-c)',
      },
    },
  },
  plugins: [],
}

export default config
