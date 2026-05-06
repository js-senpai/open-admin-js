export default [
  {
    ignores: ["dist/**", ".next/**", "node_modules/**"]
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-console": "off"
    }
  }
];
