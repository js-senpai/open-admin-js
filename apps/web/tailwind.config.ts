import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#059669",
          hover: "#047857",
          soft: "#ECFDF5",
          border: "#A7F3D0",
          accent: "#34D399"
        }
      }
    }
  },
  plugins: []
};

export default config;
