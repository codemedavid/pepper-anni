/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // PepperAnni × Snow Snow — Frosted-Ice · Black · Gold · Pink Sakura
        'theme-bg': '#0c0809',
        'theme-text': '#f3e7da',

        // Primary Palette — Pink / Sakura crimson (the "ice" action color)
        'brand': {
          DEFAULT: '#e84d7f',
          50: '#fff0f6',
          100: '#ffd9e7',
          200: '#ffa6c9',
          300: '#ff6fa5',
          400: '#f774a8',
          500: '#e84d7f',
          600: '#d6457e',
          700: '#a51f4d',
          800: '#7a1a3c',
          900: '#4d0f1c',
        },

        // Secondary & Neutral — Warm near-black "onyx" (light ink → black surfaces)
        // Kept 50→900 light-to-dark so existing utility usage stays semantic.
        'charcoal': {
          DEFAULT: '#0c0809',
          50: '#f3e7da',
          100: '#e7d6c6',
          200: '#bfa893',
          300: '#8a7563',
          400: '#5c4c40',
          500: '#3a2c28',
          600: '#241a18',
          700: '#160f0e',
          800: '#0f0a0c',
          900: '#070405',
        },

        // Dark surfaces / primary text — aliased to the onyx palette so the many
        // `navy-*` utility classes across the app render in the new theme.
        'navy': {
          DEFAULT: '#070405',
          50: '#f3e7da',
          100: '#e7d6c6',
          200: '#bfa893',
          300: '#8a7563',
          400: '#5c4c40',
          500: '#3a2c28',
          600: '#241a18',
          700: '#160f0e',
          800: '#0f0a0c',
          900: '#070405',
        },

        // Gold accent — Snow Snow gold, used for icons, hairlines and highlights.
        'gold': {
          DEFAULT: '#e8c47a',
          50: '#fcf6e9',
          100: '#f7eccf',
          200: '#f0d695',
          300: '#e8c47a',
          400: '#d9ad57',
          500: '#c79b3f',
          600: '#a9772f',
          700: '#875f26',
          800: '#6b4b20',
          900: '#573e1c',
        },

        // Backgrounds & Accents
        'cream': '#0c0809',
        'blush-light': '#ffd9e7',
        'warm-white': '#140d10',
        'sage-mist': '#ffa6c9',
        'navy-deep': '#070405',
        // Frosted-glass surface helpers
        'frost': 'rgba(22,16,18,0.55)',
        'frost-strong': 'rgba(30,20,24,0.74)',
        'glacier': '#1c0709',
        'glacier-2': '#3a0c14',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        heading: ['"Shippori Mincho B1"', '"Sora"', 'serif'],
        serif: ['"Shippori Mincho B1"', '"Sora"', 'serif'],
        display: ['"Sora"', 'system-ui', 'sans-serif'],
        jp: ['"Shippori Mincho B1"', '"Sora"', 'serif'],
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.25)',
        'DEFAULT': '0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.45), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.35)',
        // Frosted-ice card shadows
        'soft': '0 16px 40px -22px rgba(0, 0, 0, 0.7)',
        'luxury': '0 24px 54px -24px rgba(0, 0, 0, 0.72), 0 1px 0 rgba(232,196,122,0.2) inset',
        'frost': '0 24px 54px -24px rgba(0,0,0,0.72), 0 1px 0 rgba(232,196,122,0.2) inset',
        'glow': '0 0 0 1px rgba(232,196,122,0.45), 0 16px 40px -14px rgba(255,111,165,0.55)',
      },
      borderRadius: {
        'none': '0',
        'sm': '0.25rem',
        'DEFAULT': '0.5rem',
        'md': '0.75rem',
        'lg': '1rem',
        'xl': '1.25rem',
        '2xl': '1.5rem',
        'full': '9999px',
      },
      animation: {
        'fadeIn': 'fadeIn 0.6s ease-out',
        'slideUp': 'slideUp 0.5s ease-out',
        'slide-up': 'sheetUp 0.3s ease-out',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 8s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        sheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      backgroundImage: {
        'pepper-gradient': 'linear-gradient(135deg, #1c0709 0%, #3a0c14 55%, #a51f4d 100%)',
        'pepper-gradient-horizontal': 'linear-gradient(90deg, #1c0709 0%, #a51f4d 100%)',
        'glow-veil': 'radial-gradient(ellipse at top, rgba(255,111,165,0.18), transparent 60%)',
      },
    },
  },
  plugins: [],
}
