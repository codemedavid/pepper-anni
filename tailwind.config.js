/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // PepperAnni — Biohacking · Glow Smarter · Live Longer
        'theme-bg': '#FCF8FA',
        'theme-text': '#2B1019',

        // Primary Palette — Raspberry / Wine (longevity glow)
        'brand': {
          DEFAULT: '#A8285A',
          50: '#FCF1F6',
          100: '#F9E0EC',
          200: '#F2BDD3',
          300: '#E68FB2',
          400: '#D85E8E',
          500: '#C53A6E',
          600: '#A8285A',
          700: '#8A1E49',
          800: '#6E193B',
          900: '#54142E',
        },

        // Secondary & Neutral — Deep Aubergine / Plum (text & dark surfaces)
        'charcoal': {
          DEFAULT: '#2B1019',
          50: '#F8F4F6',
          100: '#EFE2E9',
          200: '#DAC2D0',
          300: '#BB93AB',
          400: '#925E7B',
          500: '#6B3C53',
          600: '#4E2A3C',
          700: '#3E2030',
          800: '#2E1623',
          900: '#220F1A',
        },

        // Dark surfaces / primary text — aliased to the deep aubergine palette
        // so the many `navy-*` utility classes across the app render correctly.
        'navy': {
          DEFAULT: '#220F1A',
          50: '#F8F4F6',
          100: '#EFE2E9',
          200: '#DAC2D0',
          300: '#BB93AB',
          400: '#925E7B',
          500: '#6B3C53',
          600: '#4E2A3C',
          700: '#3E2030',
          800: '#2E1623',
          900: '#220F1A',
        },

        // Gold accent — used for icons and highlights throughout the app.
        'gold': {
          DEFAULT: '#C9A227',
          50: '#FCF8EC',
          100: '#F7EFCF',
          200: '#EFDD9F',
          300: '#E6C96B',
          400: '#DDB746',
          500: '#C9A227',
          600: '#A8851E',
          700: '#856719',
          800: '#6B5318',
          900: '#5A4517',
        },

        // Backgrounds & Accents
        'cream': '#FCF8FA',
        'blush-light': '#F9E0EC',
        'warm-white': '#FFFCFD',
        'sage-mist': '#F2BDD3',
        'navy-deep': '#2B1019',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['"Cormorant Garamond"', 'Playfair Display', 'serif'],
        serif: ['"Cormorant Garamond"', 'Playfair Display', 'serif'],
        display: ['"Cormorant Garamond"', 'serif'],
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'DEFAULT': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02)',
        // Soft white card shadow
        'soft': '0 4px 20px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.02)',
        'luxury': '0 8px 30px rgba(0, 0, 0, 0.08), 0 4px 10px rgba(0, 0, 0, 0.04)',
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
        'pepper-gradient': 'linear-gradient(180deg, #54142E 0%, #8A1E49 50%, #C53A6E 100%)',
        'pepper-gradient-horizontal': 'linear-gradient(90deg, #54142E 0%, #C53A6E 100%)',
        'glow-veil': 'radial-gradient(ellipse at top, rgba(197,58,110,0.08), transparent 60%)',
      },
    },
  },
  plugins: [],
}
