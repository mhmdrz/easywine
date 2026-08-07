/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Montserrat Variable",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        wine: {
          DEFAULT: "#8e1616",
          accent: "#d84040",
          light: "#eeeeee",
          dark: "#1d1616",
        },
      },
    },
  },
  plugins: [],
};
