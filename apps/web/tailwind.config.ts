import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    screens: {
      xs: "480px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      /* ---- Billity semantic tokens ---- */
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        tooltip: {
          DEFAULT: "hsl(var(--tooltip))",
          foreground: "hsl(var(--tooltip-foreground))",
          border: "hsl(var(--tooltip-border))",
        },

        /* ---- Domain: opportunity status ---- */
        go: {
          DEFAULT: "hsl(var(--status-go))",
          soft: "hsl(var(--status-go-soft))",
        },
        nogo: {
          DEFAULT: "hsl(var(--status-nogo))",
          soft: "hsl(var(--status-nogo-soft))",
        },
        cond: {
          DEFAULT: "hsl(var(--status-cond))",
          soft: "hsl(var(--status-cond-soft))",
        },
        trace: {
          DEFAULT: "hsl(var(--status-trace))",
          soft: "hsl(var(--status-trace-soft))",
        },
        closed: {
          DEFAULT: "hsl(var(--status-closed))",
          soft: "hsl(var(--status-closed-soft))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["'Hanken Grotesk'", "-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["'IBM Plex Mono'", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "drawer-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "drawer-out": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-100%)" },
        },
        "backdrop-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s ease-in-out infinite",
        "drawer-in": "drawer-in 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
        "drawer-out": "drawer-out 0.22s ease-in",
        "backdrop-in": "backdrop-in 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
