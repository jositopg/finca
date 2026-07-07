/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#f8f9f9',
        'surface-low': '#f1f4f4',
        'surface-lowest': '#ffffff',
        'surface-high': '#dbe4e5',
        primary: '#466649',
        'primary-dim': '#3a5a3e',
        'primary-container': '#c4e8c2',
        'on-primary': '#e4ffe2',
        'on-surface': '#2c3435',
        'outline-variant': '#abb4b5',
        error: '#9e422c',
        'error-container': '#fde8e4',
        warning: '#8a6a1a',
        'warning-container': '#fef3d0',
        success: '#2d6a4f',
        'success-container': '#d8f3dc',
      },
      fontFamily: {
        display: ['Manrope', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 40px rgba(44,52,53,0.06)',
        card: '0 2px 16px rgba(44,52,53,0.08)',
      },
    },
  },
  plugins: [],
}
