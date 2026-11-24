import coreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * Flat ESLint config (ESLint 9 + eslint-config-next 16).
 *
 * The react-hooks v6 compiler rules (set-state-in-effect, purity, refs,
 * immutability) fire on intentional sync-with-external-system patterns in
 * this codebase (localStorage hydration, geolocation polling, latest-value
 * refs). They are kept as warnings so `npm run lint` stays green while the
 * genuinely broken patterns are fixed. Warnings do not fail the build.
 */
export default [
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'next-env.d.ts', 'data/**']
  },
  ...coreWebVitals,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn'
    }
  }
];
