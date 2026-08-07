/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        wine: {
          DEFAULT: '#722f37',
          light: '#9b414c',
          dark: '#4a1f24'
        }
      }
    }
  },
  plugins: []
}
