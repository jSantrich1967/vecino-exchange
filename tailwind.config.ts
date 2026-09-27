import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          600: "#0e7a4f",
          700: "#0b623f",
          800: "#094f34",
        },
      },
    },
  },
  plugins: [],
};
export default config;
