import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"]
      },
      colors: {
        brand: {
          DEFAULT: "#2454FF",
          hover: "#1A3DCC",
          soft: "#EEF3FF",
          border: "#C7D2FE",
          teal: "#0EA5A4",
          "teal-soft": "#E9FBFA"
        }
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 8px rgba(0,0,0,0.06), 0 16px 40px rgba(0,0,0,0.08)",
        "btn-blue": "0 4px 14px rgba(36,84,255,0.28)",
        "btn-blue-hover": "0 6px 20px rgba(36,84,255,0.4)",
        "focus-ring": "0 0 0 3px rgba(36,84,255,0.12)"
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem"
      }
    }
  },
  plugins: []
};

export default config;
