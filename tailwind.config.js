/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#E7EDF6',
        surface: '#FFFFFF',
        'surface-soft': '#F5F8FD',
        heading: '#081D61',
        'heading-secondary': '#052189',
        'text-primary': '#243B63',
        'text-secondary': '#64748B',
        'text-muted': '#A6B5CE',
        primary: '#3C5EA7',
        'primary-hover': '#052189',
        accent: '#3B82F6',
        success: '#16A34A',
        warning: '#D97706',
        danger: '#DC2626',
      },
      borderRadius: {
        lg: '24px',
        md: '16px',
        button: '14px',
      },
      boxShadow: {
        card: '0 10px 25px -5px rgba(50,75,120,.08), 0 8px 10px -6px rgba(50,75,120,.04)',
        button: '0 4px 14px rgba(60,94,167,.30)',
      },
    },
  },
  plugins: [],
}
