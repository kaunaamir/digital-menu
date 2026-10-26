import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { brand: { 50: '#fff7ed', 100: '#ffedd5', 500: '#ea580c', 600: '#c2410c', 700: '#9a3412' }, ink: '#1c1917' },
    fontFamily: { sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
  } },
  plugins: [],
} satisfies Config;
