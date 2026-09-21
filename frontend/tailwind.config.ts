import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0E1220',
        surface: '#161B2E',
        raised: '#1C2237',
        line: '#252C45',
        body: '#E8EAF2',
        muted: '#8D95B2',
        accent: '#5B8DEF',
        'accent-dim': '#3D6BC4',
        amber: '#E0A458',
        green: '#4CC38A',
        danger: '#E5646E',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 32px rgba(5,8,18,0.45)',
      },
    },
  },
  plugins: [],
};
export default config;
