/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ---------------------------------------------------------------
        // CURRENT app palette (blue). Being retired — see `sp` below.
        // Left in place so nothing breaks mid-migration.
        // ---------------------------------------------------------------
        brand: {
          50:  '#f0f4ff',
          100: '#e0e9ff',
          500: '#3b5bdb',
          600: '#2f4ccc',
          700: '#2541b0',
          900: '#1a2d7a',
        },

        // ---------------------------------------------------------------
        // Superior Performance brand palette. Matches the logo exactly.
        // `sp-green-500` is the primary accent; `sp-ink-*` are the dark
        // surfaces. To finish the rebrand, swap `brand-*` -> `sp-green-*`
        // and delete the `brand` scale above.
        // ---------------------------------------------------------------
        sp: {
          green: {
            50:  '#EAF6EF',
            100: '#CDE9D9',
            200: '#9BD3B4',
            300: '#68BC8E',
            400: '#45AC76',
            500: '#2E9E63', // primary — the logo green
            600: '#278052',
            700: '#216341',
            800: '#1B5E3F',
            900: '#1A4731',
          },
          ink: {
            50:  '#F5F7F8',
            100: '#E3E7EA',
            300: '#9AA4AC', // secondary text on dark
            600: '#2A3036', // borders on dark
            800: '#1A1E22', // cards on dark
            900: '#0E1113', // base background — the app icon tile
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // The logo typeface. Use for hero headings that should echo the mark.
        display: ['Lato', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
