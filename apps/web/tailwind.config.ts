import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#171A21", soft: "#4B5262" },
        paper: "#F5F5F1",
        panel: "#FFFFFF",
        line: { DEFAULT: "#DCDBD3", strong: "#B9B8AE" },
        brand: { DEFAULT: "#2B3A55", soft: "#EEF1F6" },
        go: { DEFAULT: "#2F6B4F", soft: "#E7F0EA" },
        nogo: { DEFAULT: "#93392A", soft: "#F6E9E6" },
        cond: { DEFAULT: "#B07B2E", soft: "#FAF0DF" },
        trace: { DEFAULT: "#3D7A80", soft: "#E7F1F1" },
        closed: { DEFAULT: "#8B8A80", soft: "#EEEEE9" },
      },
      fontFamily: {
        sans: ["-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
        serif: ["Charter", "Iowan Old Style", "Georgia", "Times New Roman", "serif"],
        mono: ["SFMono-Regular", "IBM Plex Mono", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
