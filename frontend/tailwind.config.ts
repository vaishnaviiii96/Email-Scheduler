import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ON8 brand — matches Figma exactly
        primary: {
          DEFAULT: '#00A859',   // Main green — buttons, active nav, chips
          light: '#E8F7EF',     // Light green tint — button backgrounds
          hover: '#008F4C',     // Darker green on hover
        },
        orange: {
          DEFAULT: '#FF9500',   // Scheduled badge color
          light: '#FFF3E0',     // Orange tint bg
        },
        gray: {
          50: '#F9F9F9',        // App canvas bg
          100: '#F3F3F3',       // Input bg
          200: '#EFEFEF',       // Sent badge bg
          300: '#E0E0E0',       // Borders
          400: '#BDBDBD',
          500: '#9E9E9E',       // Placeholder text
          600: '#757575',       // Secondary text
          700: '#616161',
          800: '#424242',       // Primary text
          900: '#212121',
        },
        yellow: {
          callout: '#FFF9D6',   // Yellow callout box bg
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        xs: ['11px', '16px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
        lg: ['16px', '24px'],
        xl: ['18px', '28px'],
        '2xl': ['22px', '32px'],
        '3xl': ['28px', '36px'],
      },
      borderRadius: {
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        popover: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)',
        input: '0 0 0 2px rgba(0,168,89,0.2)',
      },
      spacing: {
        sidebar: '260px',
      },
      animation: {
        'skeleton-pulse': 'skeleton-pulse 1.5s ease-in-out infinite',
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
      },
      keyframes: {
        'skeleton-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
