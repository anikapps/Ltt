import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          800: '#0f172a',
          900: '#0a1122',
          950: '#060b16'
        },
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#172554'
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706'
        },
        emergency: {
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c'
        }
      }
    }
  },
  plugins: []
};

export default config;
