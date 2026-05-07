import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1b2634",
        panel: "#ffffff",
        field: "#f6f8fb",
        line: "#d8e0e8",
        brand: "#1f6f66",
        accent: "#c46b3c"
      }
    }
  },
  plugins: []
} satisfies Config;
