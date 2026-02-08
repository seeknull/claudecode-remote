/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#1a1a1a",
          light: "#262626",
          lighter: "#333333",
        },
        accent: {
          DEFAULT: "#e07a5f",
          hover: "#c96a50",
        },
        claude: {
          orange: "#e07a5f",
          blue: "#4a90d9",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
      },
    },
  },
  plugins: [],
};
