import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const config = [
  ...nextVitals,
  ...nextTs,
  {
    // hugo/ here is an old copy of the marketing site (the live one is ../hugo).
    ignores: ['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts', 'hugo/**', 'wordpress-plugin/**'],
  },
  {
    rules: {
      // New in eslint-plugin-react-hooks 7 (React Compiler guidance). Every
      // dashboard page loads data with the fetch-in-useEffect pattern it flags;
      // moving them to a data-fetching layer is its own refactor, so this warns
      // instead of failing CI until then.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Plain Node scripts, run with `node`, not bundled.
    files: ['*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]

export default config
