/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/websocket/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    fontFamily: {
      'sans': ['var(--font-jetbrains-mono)', 'monospace'],
      'mono': ['var(--font-jetbrains-mono)', 'monospace'],
    },
    extend: {
      fontFamily: {
        'jetbrains-mono': ['var(--font-jetbrains-mono)', 'monospace'],
        'instrument-sans': ['var(--font-instrument-sans)', 'sans-serif'],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        'light-blue': '#E0F0FD',
        'teal': '#0185B5',
        'sky-blue': '#45ABFF',
        'beige': '#F9F2E5',
      },
    },
  },
  plugins: [],
};
