import type { Config } from "tailwindcss"

const config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {}
  },
  plugins: []
} satisfies Config

export default config
