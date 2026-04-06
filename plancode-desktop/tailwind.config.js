import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0f0f0f',
        'bg-secondary': '#1a1a1a',
        'bg-tertiary': '#242424',
        'text-primary': '#e4e4e7',
        'text-secondary': '#a1a1aa',
        'accent-plan': '#3b82f6',
        'accent-design': '#a855f7',
        'accent-execute': '#f97316',
        'accent-explorer': '#22c55e',
        'accent-developer': '#eab308',
        'accent-danger': '#ef4444',
        'accent-teammate': '#06b6d4',
        'border': '#27272a',
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [typography],
}
