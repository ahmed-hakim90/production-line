import type { Config } from "tailwindcss"
import forms from "@tailwindcss/forms"
import containerQueries from "@tailwindcss/container-queries"

const config: Config = {
  important: "#root",
  darkMode: "class",
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./src/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./modules/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  safelist: [
    // Overlay stacking — referenced via shared constants (lib/overlayStack.ts)
    "z-[10050]",
    "z-[10100]",
  ],
  theme: {
    extend: {
      borderRadius: {
        /** Theme-driven via محرك المظهر (`ThemeSettings.borderRadius` → CSS vars). */
        sm: "var(--border-radius-sm)",
        DEFAULT: "var(--border-radius-base)",
        md: "var(--border-radius-base)",
        lg: "var(--border-radius-lg)",
        xl: "var(--border-radius-xl)",
        "2xl": "var(--border-radius-xl)",
        "3xl": "calc(var(--border-radius-xl) + 4px)",
      },
      fontSize: {
        /** Theme-driven via محرك المظهر (`ThemeSettings.baseFontSize` → CSS vars). */
        xs: ["var(--font-size-xs)", { lineHeight: "1.35" }],
        sm: ["var(--font-size-sm)", { lineHeight: "1.4" }],
        base: ["var(--font-size-base)", { lineHeight: "1.5" }],
        lg: ["calc(var(--font-size-base) + 2px)", { lineHeight: "1.45" }],
        xl: ["calc(var(--font-size-base) + 4px)", { lineHeight: "1.35" }],
        "2xl": ["calc(var(--font-size-base) + 8px)", { lineHeight: "1.3" }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
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
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          light: "rgb(var(--color-primary) / 0.15)",
        },
        secondary: {
          DEFAULT: "rgb(var(--color-secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground))",
        },
      },
    },
  },
  plugins: [forms, containerQueries],
}

export default config
