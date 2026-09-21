import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#22C55E',
        'primary-hover': '#16A34A',
        border: '#E5E7EB',
        'border-dark': '#D1D5DB',
        muted: '#6B7280',
        'muted-light': '#9CA3AF',
        surface: '#F9FAFB',
        danger: '#EF4444',
        amber: '#F59E0B',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
