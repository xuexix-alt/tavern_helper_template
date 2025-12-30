/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,vue,js,ts}'],

  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'slate-950': '#020617', // Manual fix if Tailwind v4 doesn't support it or for custom usage
        'accent-primary': '#ffc300', // Meituan yellow
      },
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        glow: 'glow 2s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
};
