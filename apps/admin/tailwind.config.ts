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
        slate: {50:'#F5F7F2',100:'#e9ede6',200:'#dce2d9',300:'#c4cec3',400:'#78887f',500:'#53615b',600:'#46554d',700:'#34443f',800:'#25352f',900:'#172329',950:'#101820'},
        brand: {
          DEFAULT: "#426b1d",
          hover: "#365d1b",
          soft: "#e6f6d4",
          border: "#C7D2FE",
          teal: "#426b1d",
          "teal-soft": "#edf4e8"
        }
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 8px rgba(0,0,0,0.06), 0 16px 40px rgba(0,0,0,0.08)",
        "btn-blue": "0 4px 14px rgba(66,107,29,0.28)",
        "btn-blue-hover": "0 6px 20px rgba(66,107,29,0.4)",
        "focus-ring": "0 0 0 3px rgba(66,107,29,0.12)"
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
