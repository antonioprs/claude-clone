/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        claude: {
          bg: '#262624',
          sidebar: '#1f1e1e',
          surface: '#30302e',
          surface2: '#3a3937',
          border: '#42413e',
          text: '#eeece2',
          muted: '#a39e93',
          accent: '#c96442',
          accentHover: '#b5563a',
        },
        claudeLight: {
          bg: '#faf9f5',
          sidebar: '#f0eee6',
          surface: '#ffffff',
          surface2: '#f0eee6',
          border: '#e5e2d9',
          text: '#3d3d3a',
          muted: '#87857e',
          accent: '#c96442',
          accentHover: '#b5563a',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
