/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // 背景层
        ink: {
          900: "#0E0F13",
          800: "#1A1C24",
          700: "#23262F",
          600: "#2D313C",
        },
        // 文字
        ivory: "#F2E9DC",
        ivoryDim: "#A39B8E",
        // 强调
        gold: {
          DEFAULT: "#D4A574",
          dim: "#B8915F",
          deep: "#8C6A43",
        },
        // 警示
        wine: "#8B2635",
        moss: "#5A8A5A",
        // 棋盘
        boardLight: "#E8D5B0",
        boardDark: "#7D5A3C",
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Manrope"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(212, 165, 116, 0.35)',
        inset: 'inset 0 1px 0 rgba(212, 165, 116, 0.15)',
      },
      backgroundImage: {
        'grid-gold': "linear-gradient(rgba(212,165,116,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(212,165,116,0.04) 1px, transparent 1px)",
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
      },
      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'letter-tighten': {
          '0%': { letterSpacing: '0.5em', opacity: '0' },
          '100%': { letterSpacing: '0.02em', opacity: '1' },
        },
      },
      animation: {
        breathe: 'breathe 2s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
        'fade-up': 'fade-up 0.5s ease-out both',
        'letter-tighten': 'letter-tighten 1.2s ease-out both',
      },
    },
  },
  plugins: [],
};
