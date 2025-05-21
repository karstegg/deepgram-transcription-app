/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3A86FF",
        secondary: "#8338EC",
        success: "#28A745",
        warning: "#FFC107",
        error: "#DC3545",
        light: "#F8F9FA",
        dark: "#212529",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
  darkMode: "class",
};
