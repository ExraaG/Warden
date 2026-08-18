/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#090d16',
        surface: '#0f172a',
        'surface-hover': '#1e293b',
        'surface-active': '#334155',
        border: '#1e293b',
        'border-strong': '#334155',
        accent: {
          DEFAULT: '#f59e0b', // Industrial Safety Amber
          hover: '#d97706',
          active: '#b45309',
          light: '#fef3c7',
          dark: '#78350f',
        },
        ops: {
          green: '#10b981',
          red: '#ef4444',
          cyan: '#06b6d4',
          amber: '#f59e0b',
        },
      },
      fontFamily: {
        minecraft: ['Minecraft', 'monospace'],
        mono: ['Minecraft', 'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Minecraft', 'JetBrains Mono', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },


    },
  },
  plugins: [],
};
