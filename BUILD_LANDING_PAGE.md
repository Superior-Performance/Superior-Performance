# Build Instructions: Superior Performance Landing Page

Drop this file into your repo and tell Claude Code: **"Read `BUILD_LANDING_PAGE.md` and implement this landing page in this codebase."**

This file is self-contained. It specifies every color, type size, spacing value, layout rule, interaction, and all final copy. No other file is required to build the page.

---

## 1. What this is

A new marketing landing page for **Superior Performance**, a training business selling individualized throwing programs to high school and college pitchers.

- **Single conversion goal:** Request Info form submission.
- **Tone:** gritty, competitive, matter-of-fact. Not clinical, not hype.
- **Audience:** high school and college pitchers (and the parents reading over their shoulder).

The existing site is a JavaScript single-page app hosted on Firebase at `https://superior-performance-ba102.web.app/` (PWA manifest present). Implement this page **inside that app**, using its existing framework, router, styling approach, and component conventions. Route it as the public landing/marketing route. The assessment/program/tracking app behind the login is unchanged.

**Section order:**

1. Sticky nav
2. Hero
3. Keyword strip
4. Process (`#process`)
5. Full-bleed image band
6. Results (`#results`) — inverted to green
7. Testimonials
8. Staff (`#staff`)
9. FAQ (`#faq`)
10. Four-up image strip
11. Request form (`#request`)
12. Footer

---

## 2. Design tokens

### Colors

| Name | Hex | Use |
|---|---|---|
| Ink | `#0E1113` | Default page and section background |
| Ink deep | `#0B0E10` | Alternating section background (keyword strip, staff, four-up strip, request) |
| Ink raised | `#101416` | Cards, image placeholder panels |
| Ink well | `#131719` | Form input background on focus |
| Ink on green | `#08110C` | All text on green ground; button label color |
| Paper | `#F2F4F3` | Primary text |
| Green primary | `#2FA968` | Brand accent, buttons, Results section ground |
| Green bright | `#3FC77E` | Hover state, stat numerals, link color |

Green ramp, low → high (used only by the velocity chart):
`#1B4332`, `#20603F`, `#22684A`, `#26794F`, `#2A8A5C`, `#2E9C63`, `#2FA968`, `#37B872`, `#3FC77E`

**Text opacity on dark ground** — use these exact levels:

| Level | Use |
|---|---|
| `rgba(242,244,243,.72)` | Hero lead paragraph |
| `.68` | Body paragraphs, FAQ answers |
| `.66` | Program readout values |
| `.62` | Nav links, staff bios |
| `.5` | Mono data labels |
| `.45` | Footer |
| `.42` | Image placeholder annotations |
| `.38` | Keyword strip, placeholder notes |

**Hairlines:**

| Value | Use |
|---|---|
| `rgba(255,255,255,.07)` | Section dividers |
| `rgba(255,255,255,.09)` | Grid-gap fill, outer borders |
| `rgba(255,255,255,.10)` | List rules, card borders |
| `rgba(255,255,255,.18)` | Secondary button border |

**On the green Results section:** all text is full-opacity `#08110C`. Hairlines are `rgba(8,17,12,.22)`. Do not reintroduce opacity on green — it fails contrast.

### Typography

Google Fonts: `Archivo` (400–900), `Archivo Narrow` (500/600/700), `IBM Plex Mono` (400/500/600).

Three roles, applied consistently. This pairing is doing most of the work of not looking generic — do not substitute.

**1. Display — Archivo Narrow 700, uppercase.** All headings and stat numerals. Tight leading, negative tracking at large sizes.

| Element | Size | Line-height | Tracking |
|---|---|---|---|
| h1 (hero A) | `clamp(46px, 6.6vw, 104px)` | `.92` | `-.015em` |
| h1 (hero B) | `clamp(52px, 10.5vw, 168px)` | `.86` | `-.02em` |
| h2 section heads | `clamp(34px, 4.4vw, 64px)` | `.96` | `-.01em` |
| h2 request | `clamp(38px, 5.4vw, 80px)` | `.92` | `-.01em` |
| h3 process steps | `clamp(24px, 2.6vw, 34px)` | `1.05` | — |
| Band headline | `clamp(28px, 3.6vw, 52px)` | `1` | `-.01em` |
| Stat numeral, large | `clamp(56px, 7vw, 96px)` | `.9` | — |
| Stat numeral, hero strip | `34px` | `1` | — |
| Stat numeral, hero B rail | `clamp(30px, 3vw, 44px)` | `1` | — |

**2. Body — Archivo 400.** `text-wrap: pretty` on paragraphs; `text-wrap: balance` on the hero h1.

| Element | Size | Line-height |
|---|---|---|
| Hero lead | `clamp(16px, 1.3vw, 19px)` | `1.6` |
| Request lead | `17px` | `1.65` |
| Results lead | `17px` | `1.6` |
| Body / FAQ answers | `16px` | `1.65`–`1.7` |
| Staff bios | `15px` | `1.65` |

**3. Label — IBM Plex Mono 500/600, uppercase, wide tracking.** Every eyebrow, nav item, button label, stat caption, data label.

| Element | Size | Tracking |
|---|---|---|
| Section eyebrows | `11px` | `.22em` |
| Nav links | `11px` | `.16em` |
| Buttons | `11–12px` | `.16em`–`.20em` |
| Stat captions | `11px` | `.1em` (line-height `1.8`) |
| Data labels / detail rows | `10px` | `.14em`–`.18em` |
| Keyword strip | `11px` | `.24em` |
| Footer | `10px` | `.18em` |
| Placeholder annotations | `10px` | `.16em`–`.18em` (line-height `1.7`–`1.9`) |

**Mixed role — quotes and readout values.** Archivo Narrow 600 used at body size:

| Element | Size | Line-height |
|---|---|---|
| Testimonial quotes | `clamp(19px, 1.8vw, 24px)` | `1.35` |
| Readout row labels | `15px` | — (tracking `.06em`) |
| Spec table values | `15px` | — (tracking `.04em`) |
| Detail row values | `14px` | — (tracking `.04em`) |
| Stat unit line | `20px` | — (tracking `.02em`) |

### Spacing & geometry

| Token | Value |
|---|---|
| Section vertical padding | `clamp(72px, 9vw, 140px)` |
| Page horizontal gutter | `clamp(24px, 5vw, 88px)` |
| Two-column gap | `clamp(32px, 5vw, 80px)` |
| Card grid gap | `clamp(16px, 2vw, 28px)` |
| Card padding | `clamp(24px, 2.6vw, 34px)` |
| Stat cell padding | `clamp(28px, 3.5vw, 48px)` |
| Band padding | `clamp(24px, 4vw, 56px)` |

**Border radius: 0 everywhere.** The only exceptions are the circular logo mark and the circular testimonial avatars (`border-radius: 50%`). This is load-bearing to the aesthetic — do not soften corners.

**No box shadows anywhere.** Depth comes from surface tone shifts and hairlines. Do not add shadows, gradients, or glows.

**Hairline grid technique.** Grids that appear to have 1px dividers use `gap: 1px` with the container background set to the hairline color and each cell set to the section background. Reproduce this, or use borders — but keep the effect: single-pixel rules, no gutters.

**Buttons.** Rectangular, generous horizontal padding. Heights: hero primary/secondary `56px`, hero B CTA `52px`, nav `38px`. Form submit is full-width with `22px` padding.

**Placeholder image panels** use `repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 1px, transparent 1px 10px)` — a 45° hairline hatch. Placeholder-only; it disappears when real photos land.

---

## 3. Section-by-section build

### 3.1 Sticky nav

Fixed top, full width, `z-index: 50`. Background `rgba(14,17,19,.82)` with `backdrop-filter: blur(14px)`, bottom hairline `rgba(255,255,255,.07)`, padding `14px 24px`. Height ≈ 64px — the hero offsets by this.

**Left:** 34px circular logo, then two stacked lines, `line-height: 1`:
- "Superior" — Archivo Narrow 700, `15px`, tracking `.14em`, uppercase, paper
- "Performance" — mono, `9px`, tracking `.3em`, green primary, `3px` top margin

**Right:** flex row, gap `28px`, wrapping, right-justified.
- Nav links: Process, Results, Staff, FAQ — mono `11px`, tracking `.16em`, uppercase, `rgba(242,244,243,.62)`, gap `26px`, wrapping. Anchors to `#process`, `#results`, `#staff`, `#faq`. Hover → green bright.
- Primary button "Request Info" → `#request`. Height `38px`, padding `0 18px`, green primary ground, `#08110C` mono `11px` label, tracking `.16em`. Hover → green bright.

Add `scroll-margin-top: 72px` to all anchor targets so the sticky nav doesn't cover section heads.

### 3.2 Hero — pick A or B

**Two directions are specified. The client picks one. Build only the picked one.** If it hasn't been decided yet, ask before building — do not ship both, and do not ship a variant toggle.

#### Hero A — split

Grid: `repeat(auto-fit, minmax(min(100%, 440px), 1fr))`. Min-height `calc(100vh - 64px)`, `padding-top: 64px` for the nav. Cells stretch.

**Left cell** — padding `80px clamp(24px,5vw,88px)`, column flex, vertically centered, gap `34px`:

1. **Eyebrow row** — flex, gap `14px`, align center: a 40px × 1px green primary rule, then "High School & College Pitchers" in mono `11px` tracking `.22em` uppercase green primary.

2. **h1**, three lines. Third line is green primary:
   > Nobody Hands<br>You Velocity.<br>**You Build It.**

3. **Lead paragraph**, max-width `46ch`:
   > Individualized throwing programs built from your assessment, then adjusted week by week. No templates. No guessing. Every rep has a reason.

4. **Button row** — flex, wrapping, gap `14px`:
   - Primary "Request Info" → `#request`. Height `56px`, padding `0 30px`, green primary ground, `#08110C` mono `12px` label tracking `.18em`. Hover → green bright.
   - Secondary "See the Process" → `#process`. Height `56px`, padding `0 26px`, `1px rgba(255,255,255,.18)` border, paper label. Hover: border → green primary, label → green bright.

5. **Three-up stat strip** — `12px` top margin. Hairline grid (`gap: 1px`, `rgba(255,255,255,.09)` fill, matching outer border), three equal columns, cells ink, padding `20px 18px`. Each cell: numeral Archivo Narrow 700 `34px` green bright, with the unit inline at `16px` tracking `.02em`; then an `8px`-below caption in mono `10px` tracking `.16em` uppercase at `.5`.
   - `+4 mph` / "Avg over 12 weeks"
   - `0` / "In-house arm injuries"
   - `+8 lbs` / "Avg through phases"

**Right cell** — left hairline border `rgba(255,255,255,.07)`, background ink deep, min-height `520px`, column flex in three parts separated by hairlines:

**(a) Image slot.** `flex: 1`, min-height `180px`, ink raised + 45° hatch, padding `28px`, annotation top-aligned: "[ image placeholder ] / pitcher at release — wide crop". Bottom hairline.

**(b) Sample program readout.** Padding `26px 28px 20px`, bottom hairline.
- Header row (flex, `space-between`, baseline, `20px` bottom margin): "Sample program readout" in mono `10px` tracking `.18em` at `.5`; "Week 7 / 12" in mono `10px` green bright.
- Four rows in a hairline stack (`gap: 1px`, `rgba(255,255,255,.08)` fill, cells ink deep, padding `13px 0`). Each row: label left in Archivo Narrow 600 `15px` tracking `.06em` uppercase paper; value right in mono `11px` tracking `.1em` uppercase at `.66`.

| Label | Value |
|---|---|
| Phase | Season on-ramp |
| Throwing days | Monday · Wednesday · Thursday · Saturday |
| Limiter | Hip mobility and scap winging |
| Correctives | Daily *(value in green bright)* |

**(c) Velocity chart.** Padding `24px 28px 28px`.
- Header row (flex, `space-between`, baseline): "Velocity · week 1 → 12" in mono `10px` tracking `.18em` at `.5`; "+4 mph" in mono `10px` green bright.
- **Twelve bars**, one per week. Flex, `align-items: flex-end`, `gap: 4px`, container height `88px`, `16px` top margin. Each bar `flex: 1`, `transform-origin: bottom`.

The shape is deliberately non-linear — gains arrive in steps with small dips at weeks 3, 6, and 9 where the program backs off, then a push through the final block. Use these exact values:

| Week | Height | Color |
|---|---|---|
| 1 | 38% | `#1B4332` |
| 2 | 45% | `#1B4332` |
| 3 | 42% | `#20603F` |
| 4 | 53% | `#22684A` |
| 5 | 57% | `#22684A` |
| 6 | 51% | `#26794F` |
| 7 | 66% | `#2A8A5C` |
| 8 | 72% | `#2A8A5C` |
| 9 | 69% | `#2E9C63` |
| 10 | 84% | `#2FA968` |
| 11 | 88% | `#37B872` |
| 12 | 100% | `#3FC77E` |

Animation: each bar gets `spRise .6s ease-out both` with delay `(week − 1) × .05s`, so week 1 starts at `0` and week 12 at `.55s`.

```css
@keyframes spRise {
  from { transform: scaleY(.15); opacity: .2 }
  to   { transform: scaleY(1);   opacity: 1 }
}
```

#### Hero B — full bleed

Single column, min-height `100vh`, column flex with content bottom-aligned, padding `180px clamp(24px,5vw,88px) 0`. Background ink raised + 45° hatch — **this is the full-bleed photo slot** (annotation: "full-bleed bullpen, low angle, dark", positioned top-left at `96px`).

Content, max-width `1100px`:
- Eyebrow "Assess → Program → Track" — mono `11px` tracking `.22em` green bright, `26px` bottom margin.
- h1, two lines: "Throw Harder." / "Stay Healthy."
- Lead paragraph, `28px` top margin, max-width `52ch`:
  > Individualized throwing programs for high school and college pitchers — built from your assessment, tracked every week until the number moves.

Below, `64px` top margin: a **three-up stat rail** — `repeat(auto-fit, minmax(min(100%, 220px), 1fr))`, `gap: 1px` hairline fill, top hairline, cells ink, padding `26px 22px`. Numerals `clamp(30px,3vw,44px)` green bright; captions mono `10px` tracking `.16em` at `.5`, `10px` above.
- `+4 mph` / "Average over 12 weeks"
- `0` / "In-house arm injuries to date"
- `+8 lbs` / "Average through training phases"

The **Request Info button sits in its own full-width row below the stat grid** — top hairline, padding `26px 0 34px`. Deliberately not a grid cell, so no empty cells appear at any viewport width. Height `52px`, padding `0 26px`, green primary.

### 3.3 Keyword strip

Full width, background ink deep, padding `16px` vertical + page gutter horizontal, bottom hairline.

Five items in a **wrapping** flex row, `gap: 14px 44px`. Each item: a 4×4px green primary square (`flex: none`) then a mono `11px` tracking `.24em` uppercase label at `.38`, gap `14px`.

> Assessment-driven · Weekly adjustments · Velocity + command · Arm care built in · Remote or in-house

Not a marquee. No animation. It wraps — do not use `nowrap` or `overflow: hidden`.

### 3.4 Process (`#process`)

Two columns: `repeat(auto-fit, minmax(min(100%, 320px), 1fr))`, gap `clamp(32px,5vw,80px)`, `align-items: start`.

**Left column** — `position: sticky; top: 100px`:
- Eyebrow "01 — The Process"
- h2: "Three steps." / "No shortcuts."
- Paragraph, `22px` top margin, max-width `34ch`, `.6` opacity:
  > Your program is written for your arm, your movement, and your season — then rewritten as you change.
- **Spec table**, `40px` top margin, top hairline and a hairline under each row, rows padding `16px 0`, baseline-aligned. Label left in mono `10px` tracking `.16em` at `.5`; value right in Archivo Narrow 600 `15px` tracking `.04em` uppercase.

| Label | Value |
|---|---|
| Assessment | One session |
| Program block | 12 weeks |
| Check-ins | Weekly |
| Delivery | Remote or in-house |

**Right column** — three steps. Each is a two-column grid (`auto / minmax(0,1fr)`), gap `clamp(20px,3vw,44px)`, padding `34px 0`, top hairline (the third also gets a bottom hairline). Left cell: index in mono `12px` tracking `.16em` green primary with `6px` top padding so it sits on the heading's cap line. Right cell: h3 plus a `56ch` paragraph at `.68`.

**01 · Assessment**
> Mobility, strength, mechanics and current workload get measured before anything is prescribed. We find the limiter, not just the symptom.

**02 · Individualized Program**
> Throwing, lifting and arm care written into one plan with phases that match your calendar — offseason build, in-season maintain, playoff peak.

**03 · Weekly Tracking**
> Every session logged, every number reviewed. The program moves when you do — and it backs off before your arm makes that decision for you.

### 3.5 Full-bleed image band

Edge to edge, no page gutter. Min-height `clamp(320px, 44vw, 560px)`, ink raised + 45° hatch, padding `clamp(24px,4vw,56px)`, content bottom-left aligned, bottom hairline.

Placeholder annotation, absolutely positioned top-left, mono `10px` at `.42`, line-height `1.9`:
> [ full-bleed image band ] / bullpen wide shot, 21:9 crop, 2400px+ / duotone: near-black + #2FA968

Overlaid headline, max-width `24ch`, Archivo Narrow 700 `clamp(28px,3.6vw,52px)` line-height `1` uppercase:
> Every rep<br>gets logged.

**When the real photo lands:** duotone to near-black + `#2FA968`, and make sure the lower-left stays dark enough for the headline to hold ≥4.5:1. If the crop isn't dark enough on its own, add a bottom-up scrim: `linear-gradient(to top, rgba(11,14,16,.85), transparent 60%)`.

### 3.6 Results (`#results`) — inverted

**This is the page's hard visual break: green primary `#2FA968` ground, `#08110C` type throughout.** Standard section padding.

- Eyebrow "02 — Results" — mono `11px` tracking `.22em`, full-opacity `#08110C`, `26px` bottom margin.
- h2, max-width `22ch`: "The numbers we hold ourselves to."
- Lead paragraph, max-width `56ch`, `17px`/`1.6`, `#08110C`:
  > Averages across the pitchers who finish a full 12-week block with us. Measured the same way every time — assessment at week one, reassessment at week twelve.
- Bottom margin before the grid: `clamp(40px,5vw,72px)`.

**Three-up stat grid** — `repeat(auto-fit, minmax(240px, 1fr))`, `gap: 1px` with `rgba(8,17,12,.22)` fill and matching outer border, cells green primary, padding `clamp(28px,3.5vw,48px)`.

Each cell, in order:
1. Giant numeral, Archivo Narrow 700 `clamp(56px,7vw,96px)` line-height `.9`
2. Unit line, Archivo Narrow 700 `20px` uppercase tracking `.02em`, `6px` above
3. Caption, mono `11px` line-height `1.8` tracking `.1em` uppercase, `14px` above
4. Detail block, `22px` above: three rows, each with a top hairline `rgba(8,17,12,.22)`, padding `11px 0`, baseline-aligned — label left in mono `10px` tracking `.14em` uppercase, value right in Archivo Narrow 600 `14px` tracking `.04em` uppercase, right-aligned

| | Cell 1 | Cell 2 | Cell 3 |
|---|---|---|---|
| Numeral | `+4` | `0` | `+8` |
| Unit | mph average | arm injuries | lbs gained |
| Caption | Average 4mph jump over 12 weeks | 0 in-house arm injuries to date | Average 8lbs gained through training phases |
| Detail 1 | Measured — Rapsodo, week 4 vs 12 | Since — Day one | Measured — Weigh-in, each phase |
| Detail 2 | Window — 12-week block | Built in — Daily correctives | Driver — Lifting + nutrition targets |
| Detail 3 | Range seen — +2 to +11 mph | Workload — Capped and logged | Goal — Usable mass, not filler |

The three caption strings are the client's verbatim numbers — do not reword them.

### 3.7 Testimonials

**Header row** — flex, wrapping, baseline-aligned, `space-between`, gap `16px`, bottom margin `clamp(32px,4vw,56px)`.
- Left: eyebrow "03 — From the Guys Doing the Work", then h2 "In their words."
- Right: a `26ch` mono `10px` note at `.38` — **this is a placeholder instruction to the client. Remove it.**

**Three cards** — `repeat(auto-fit, minmax(280px, 1fr))`, gap `clamp(16px,2vw,28px)`. Each: `1px rgba(255,255,255,.1)` border, ink raised background, padding `clamp(24px,2.6vw,34px)`, column flex with `space-between` and `28px` gap so the attribution pins to the bottom regardless of quote length.

- Quote: Archivo Narrow 600 `clamp(19px,1.8vw,24px)` line-height `1.35`, paper, curly quotes.
- Attribution: top hairline, `20px` top padding, flex row gap `14px` — a 42px circular avatar slot (`flex: none`, hatch placeholder), then name in Archivo Narrow 700 `15px` tracking `.06em` uppercase and role in mono `10px` tracking `.14em` green primary, `5px` below.

**All three quotes, names, and avatars are placeholders.** Roles currently read "RHP · Class of 2026", "LHP · D1 Commit", "RHP · College Junior". Client is supplying real quotes. **Do not ship the placeholder text** — either wait for real quotes or cut the section.

### 3.8 Staff (`#staff`)

Background ink deep. Eyebrow "04 — Staff"; h2 max-width `24ch`: "Who writes your program." Bottom margin `clamp(36px,4.5vw,64px)`.

**Three cards** — `repeat(auto-fit, minmax(260px, 1fr))`, gap `clamp(18px,2.4vw,32px)`. Each:
1. Headshot slot — `aspect-ratio: 4/5`, ink raised + hatch, `1px rgba(255,255,255,.1)` border, "[ headshot ]" annotation bottom-left, padding `18px`
2. Name — `18px` above, Archivo Narrow 700 `22px` uppercase tracking `.02em`
3. Role — `6px` above, mono `10px` tracking `.16em` green primary
4. Bio — `14px` above, `15px`/`1.65` at `.62`, max-width `38ch`

Roles (keep these): "Founder · Pitching Coordinator", "Strength Coach", "Assessment & Recovery".
**Names and bios are placeholders** — client is supplying real ones.

### 3.9 FAQ (`#faq`)

Two columns: `repeat(auto-fit, minmax(min(100%, 300px), 1fr))`, gap `clamp(32px,5vw,80px)`, `align-items: start`.

**Left:** eyebrow "05 — FAQ", h2 "Straight" / "answers."

**Right:** an accordion. Each item has a top hairline `rgba(255,255,255,.1)`; add a closing hairline `div` after the last item so the list is fully ruled.

- The question is a full-width `button`: transparent, no border, padding `26px 0`, text left-aligned, `space-between` with `20px` gap, cursor pointer. Question text Archivo Narrow 700 `clamp(18px,1.7vw,22px)` uppercase tracking `.01em`. Hover → green bright.
- Indicator on the right: mono `15px` green primary, `flex: none` — `+` when closed, `—` (em dash) when open.
- Answer: max-width `60ch`, `16px`/`1.7` at `.68`, padding `0 0 28px`.

**Behavior:** single-open. Item 0 is open on load. Clicking an open item closes it; clicking a closed item opens it and closes the other. Add `aria-expanded` on the button and `aria-controls` pointing at the panel — the prototype omits these.

**Content — all final copy:**

**Do I have to train in person?**
> No. Programs run remotely with weekly check-ins, and in-house work is available if you're local. The assessment and the tracking are the same either way.

**How long before I see velocity?**
> Our average is a 4mph jump over 12 weeks. Some arms move faster, some need the first block spent on movement and strength before throwing intent goes up.

**What happens at the assessment?**
> Mobility and strength screening, a look at your delivery, and a review of your current throwing workload. That's what the program gets written from.

**Can I run this during my season?**
> Yes. In-season programs are built to maintain velocity and manage workload, not to add volume on top of your outings.

**What ages do you work with?**
> Primarily high school and college pitchers. If you're outside that range, send a note and we'll tell you honestly whether we're the right fit.

### 3.10 Four-up image strip

Background ink deep, edge to edge, no page gutter. Four cells: `repeat(auto-fit, minmax(min(100%, 200px), 1fr))`, `gap: 1px` hairline fill. Each cell `aspect-ratio: 3/4`, ink raised + hatch, padding `20px`, annotation bottom-left in mono `10px` at `.42`, line-height `1.9`.

Annotations: "3:4 — weight room", "3:4 — arm care work", "3:4 — coach + athlete", "3:4 — mound, game day".

### 3.11 Request form (`#request`)

Background ink deep. Two columns: `repeat(auto-fit, minmax(320px, 1fr))`, gap `clamp(36px,5vw,80px)`, `align-items: start`.

**Left:**
- h2: "Tell us about" / "your arm."
- Paragraph, `24px` above, max-width `44ch`, `17px`/`1.65` at `.7`:
  > Send the basics and we'll come back with what an assessment looks like, what your program would cover, and what it costs. No pitch calls you didn't ask for.
- `36px` below, a column list, gap `12px`, mono `11px` tracking `.14em` uppercase at `.5`:
  > Response within 24 hours · Remote and in-house options · No obligation

**Right — the form** as a single hairline-ruled stack: `gap: 1px` column with `rgba(255,255,255,.09)` background and matching outer border, so the inputs read as one bordered block with dividers. No radius, no per-input borders.

Each field: background ink, no border, padding `20px 22px`, `16px` paper text. On focus the background lifts to ink well `#131719`.

| # | Placeholder | Type |
|---|---|---|
| 1 | Full name | text |
| 2 | Email | email |
| 3 | Grad year / level | text |
| 4 | Current top velo (mph) | text |
| 5 | Goals, injury history, anything we should know | textarea, 4 rows, `resize: vertical` |

**Submit button:** full-width, green primary, `#08110C` mono `12px` tracking `.2em` uppercase label, padding `22px`. Hover → green bright. Label "Send Request", switching to "Sent — we'll be in touch" after submit.

Add real `<label>` elements (visually hidden if needed) — placeholder-only labelling is not accessible.

### 3.12 Footer

Padding `44px` + page gutter. Flex, wrapping, `space-between`, gap `20px`.
- Left: 28px circular logo + "Superior Performance" in mono `10px` tracking `.18em` uppercase at `.45`, gap `12px`.
- Right: links Process / Results / Request Info, same mono treatment, gap `24px`.

---

## 4. Interactions

- **Nav and footer links** — in-page anchors. Use the codebase's smooth-scroll approach if it has one. `scroll-margin-top: 72px` on all targets.
- **Hover states** — primary buttons `#2FA968` → `#3FC77E`; secondary button border → green primary and label → green bright; FAQ question → green bright; links green primary → green bright. **No transforms, no scale, no glow.** A ~120ms color transition is fine and in keeping.
- **Focus states** — form inputs lift background ink → `#131719`. The prototype sets `outline: none`; **in production keep a visible focus ring** (2px green bright outline or offset ring) for keyboard users. This is a real accessibility gap in the prototype, not design intent.
- **FAQ accordion** — see 3.9.
- **Velocity chart** — the prototype fires on mount. Prefer triggering on scroll-into-view. Respect `prefers-reduced-motion: reduce` by skipping straight to the end state.

### Responsive behavior

Every multi-column layout is `repeat(auto-fit, minmax(min(100%, N), 1fr))`, so columns collapse to one at narrow widths with no media queries. **Preserve that.** Notes:

- Hero A collapses to a single stacked column below ~880px; the image/readout panel drops under the copy and keeps its `min-height: 520px`.
- **The Process sticky left column must stop sticking once collapsed** — at one column, `position: sticky` on a full-width block hangs awkwardly. Drop to `static` at the collapse point.
- Nav links wrap. At very narrow widths a real mobile menu would be better; the prototype does not include one. Flag it if mobile traffic matters.
- All headings use `clamp()` and need no breakpoint work.
- No fixed widths, no `nowrap`, no fixed heights on text containers.

---

## 5. State

1. `openFaq: number` — index of the expanded FAQ item. `0` initially, `-1` when all closed.
2. Form state — controlled values for the five fields, per-field validation errors, a `submitting` flag, and a submitted/error result state. (The prototype only had a single `sent` boolean that swapped the button label.)

### Form submission — needs building

No backend exists in the prototype. Requirements:

- POST the five fields to whatever the site already uses. The app is Firebase-hosted, so a Firestore write plus a Cloud Function or the Trigger Email extension is the natural fit.
- **Validation:** name required; email required and well-formed; grad year/level required; top velo optional, numeric if present; notes optional.
- **Notify a human.** The copy promises "Response within 24 hours" — submissions must reach an inbox, not just a database.
- Loading state on the button while submitting; a real error state if the request fails.
- Spam protection (honeypot or reCAPTCHA) before this goes live on a public page.
- **Confirm with the client** whether submissions should also create a lead record in the existing app.

---

## 6. Assets

| File | Notes |
|---|---|
| `assets/logo-circle.png` | Circular logo mark. Nav (34px) and footer (28px). **Check it renders crisply at 34px** — it originated as the PWA maskable icon. If it doesn't, ask the client for a vector or larger raster. |
| `assets/logo-wide.png` | Wide/OG lockup. Client-supplied, **not currently placed on the page.** Available if a larger brand mark is wanted. |

If these aren't already in the repo, pull them from the existing site's `public/` directory — they're the same files the PWA manifest and OG tags reference.

### Photography — all placeholders; client is shooting

Every image slot is currently a 45° hatch panel with a mono annotation. Shot list:

| Slot | Crop | Subject |
|---|---|---|
| Hero A right panel | wide | Pitcher at release |
| Hero B background | full-bleed, dark, low angle | Bullpen |
| Full-bleed band | 21:9, 2400px+ | Bullpen wide shot |
| Four-up strip ×4 | 3:4 vertical | Weight room; arm care work; coach + athlete; mound game day |
| Staff ×3 | 4:5 | Headshots |
| Testimonial avatars ×3 | 1:1 circular | Athlete portraits |

**Treatment:** duotone to near-black + `#2FA968`, applied consistently across every photo. That consistency matters more than the number of images.

When photos land: delete the hatch background and the annotation text from each slot, keep the slot geometry (aspect ratios, min-heights), and use `object-fit: cover`.

---

## 7. Open questions for the client

1. **Hero A or Hero B?** One must be picked.
2. Real testimonials — three quotes with names and roles, or cut the section.
3. Staff names and bios.
4. Where form submissions go, and whether they should create a lead in the existing app.
5. Photography (shot list above).
6. Does the page need a mobile nav menu?
7. The Results lead paragraph says "assessment at week one, reassessment at week twelve," while the velo detail row says "Rapsodo, week 4 vs 12" (there's a 3-week build-up). Confirm which framing is right and align the two.

---

## 8. Do not

- Add border radius, box shadows, gradient washes, or glows. The flat, ruled, zero-radius treatment is the whole aesthetic.
- Reintroduce text opacity on the green Results section — full-opacity `#08110C` only.
- Substitute the fonts.
- Make the velocity chart linear. The dips at weeks 3, 6, and 9 are intentional.
- Turn the keyword strip into a marquee.
- Ship: a hero A/B toggle, the placeholder testimonial quotes, the placeholder staff names/bios, the hatch placeholder panels, or the "[ placeholder quotes — send me the real ones... ]" note.
- Keep `outline: none` on form inputs without adding a visible focus ring.
