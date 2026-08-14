# Superior Performance

React 18 + Vite + Tailwind + Firebase. See `PROJECT_BRIEF.md` for architecture and current state.

- `npm run dev` — local dev server
- `npm run build` — production build to `dist/`

---

# Brand

The visual identity is fixed. Don't invent new colors, gradients, or logo treatments — use what's below.

## The mark

Four ascending bars (an athlete's progress) under a pitch arc ending in the ball.

Use the React component, not `<img>`, so the logo inherits color and scales cleanly.
This project uses relative imports (there is no path alias configured):

```jsx
import Logo from '../../components/Logo'   // from src/pages/athlete/*
import Logo from '../components/Logo'      // from src/pages/*

<Logo className="h-9 w-auto" />                  // full lockup on dark
<Logo tone="light" className="h-9 w-auto" />     // full lockup on light
<Logo variant="icon" className="h-8 w-8" />      // icon only
<Logo tone="mono" className="h-6 text-white" />  // single color, inherits currentColor
```

`src/components/Logo.jsx` is ~70 lines and safe to read and edit.

**`src/components/logoPaths.js` is generated glyph geometry — ~26KB of raw
coordinates on 260 lines. Never read, edit, or grep it.** `Logo.jsx` imports two
strings from it and that is the only thing anyone needs to know about it. If the
wordmark ever changes, the file gets replaced wholesale, not edited.

Static files live in `public/brand/` for anything outside React (emails, PDFs, exports).

**Rules**
- Full lockup needs **at least 180px of width**. Below that use `variant="icon"`.
- Clear space around the logo: at least the height of one bar gap (~8% of logo height).
- Never recolor the green, stretch the mark, add a shadow, or put the dark variant on a light background.
- The icon alone is the app mark — nav bars, loading states, favicon.

## Color

Tailwind tokens are in `tailwind.config.js` under `sp`. **Use the tokens, not raw hex.**

| Token | Hex | Use |
|---|---|---|
| `sp-ink-900` | `#0E1113` | Base dark background, app icon tile, `theme-color` |
| `sp-ink-800` | `#1A1E22` | Cards and raised surfaces on dark |
| `sp-ink-600` | `#2A3036` | Borders and dividers on dark |
| `sp-ink-300` | `#9AA4AC` | Secondary text on dark |
| `sp-green-500` | `#2E9E63` | **Primary accent** — buttons, links, active nav, completed states |
| `sp-green-600` | `#278052` | Hover / pressed |
| `sp-green-800` | `#1B5E3F` | Green text on light backgrounds (contrast) |
| `sp-green-100` | `#CDE9D9` | Tinted backgrounds, success banners on light |

**Green carries meaning in this app.** It's the brand accent *and* the "done / on track" color. Progress rings, completed workouts, and PR badges should all use `sp-green-500`. Don't use it for neutral chrome.

The four bar tints double as a chart scale, lightest to darkest: `#1A4731` `#216341` `#278052` `#2E9E63`. Use them for the velo and weight charts so data views feel like the logo.

For non-green semantic states: amber `#E0A82E` (missed / behind), red `#D9534F` (destructive only).

## Type

- **Body / UI:** Inter (already loaded).
- **Display:** `font-display` → Lato, the logo typeface. Use for hero headings and big numbers (velo readouts) that should echo the mark. Don't use it for body copy.

## Migration status — IN PROGRESS

The app was built on a blue palette (`brand-*` in `tailwind.config.js`, plus hardcoded `#3b5bdb` / `#2541b0` / `#1a2d7a` in `src/index.css`). The brand is now charcoal + green.

Both palettes currently exist so nothing broke mid-build. **When touching any file, migrate it:**

- `brand-500` → `sp-green-500`
- `brand-600` → `sp-green-600`
- `brand-700` → `sp-green-600`
- `brand-900` → `sp-ink-900`
- `brand-50` / `brand-100` → `sp-green-50` / `sp-green-100`
- `.btn-brand` gradient `#3b5bdb → #2541b0` → `#2E9E63 → #216341`, shadow `rgba(46,158,99,0.35)`
- `.surface-brand` gradient `#1a2d7a → #0f1442` → `#0E1113 → #14432E`

Files still on the old palette (highest usage first): `LandingPage.jsx`, `AdminAthleteDetail.jsx`, `AdminSettingsPage.jsx`, `DataPage.jsx`, `AdminProgramsPage.jsx`, `ProgressPage.jsx`, `AdminChatPage.jsx`, `AdminAthletesPage.jsx`, `SchedulePage.jsx`, `LoginPage.jsx`, `index.css`.

Also replace the text wordmarks with `<Logo />`: `LandingPage.jsx` (header + footer), `LoginPage.jsx` (h1), `AdminLayout.jsx` (sidebar).

Once every file is migrated, delete the `brand` scale from `tailwind.config.js`.
