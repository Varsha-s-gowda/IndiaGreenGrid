export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          50: "#f2f8f4",
          100: "#e0f0e6",
          200: "#c2e2ce",
          300: "#96cca9",
          400: "#62ae80",
          500: "#3d8f60",
          600: "#2d744c",
          700: "#255d3e",
          800: "#1f4a33",
          900: "#1a3d2b",
          950: "#0d2118",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)",
        dropdown:
          "0 12px 24px -8px rgb(16 24 40 / 0.16), 0 4px 8px -4px rgb(16 24 40 / 0.08)",
      },
    },
  },
  plugins: [],
};
