# TDD Evidence — Snow Snow theme redesign + footer change

**Date:** 2026-06-30
**Source plan:** No `*.plan.md`. Journeys derived during this TDD run from the user request: import the "Snow Snow Storefront" design (claude.ai Design project `3e64ed30-5f99-4f72-aecd-ce1c58b4f92f`) as the site theme, put `Pepperanni2026@gmail.com` in the footer, and remove the location.

## User journeys

1. As a visitor, I see `Pepperanni2026@gmail.com` as the footer contact email so I can reach the store.
2. As a visitor, I do not see a physical location in the footer (removed per request).
3. As a visitor, I still see the phone number in the footer.
4. As a visitor, the whole storefront reflects the dark frosted-ice / gold / sakura-pink "Snow Snow" theme.

## Task report

### Footer (TDD, journeys 1–3)
- **Summary:** Replaced `hello@pepperanni.com` with `Pepperanni2026@gmail.com`, removed the `General Trias, Cavite` location block (and unused `MapPin` import), kept the phone.
- **RED:** `npx vitest run src/components/Footer.test.tsx` → 2 failed (email link not `Pepperanni2026@gmail.com`; "General Trias, Cavite" still present), 1 passed (phone).
- **GREEN:** same command → 3 passed.
- **Guaranteed:** footer renders the new email as a `mailto:` link, omits the location text, retains the phone.

### Theme redesign (journey 4 — visual, not unit-tested)
- Remapped Tailwind tokens (`tailwind.config.js`) and globals (`src/index.css`) to the Snow Snow system: onyx/near-black surfaces, gold `#e8c47a`, sakura pink/crimson `brand` scale, Sora / Plus Jakarta Sans / Shippori Mincho B1 fonts, frosted-glass `.card`/`.btn-primary`/`.input-field`, dark radial body background.
- Hand-restyled storefront surfaces: `Header.tsx` (frosted dark bar + drawer), `Hero.tsx` (light ink + gold accents), `MenuItemCard.tsx` (frosted dark glass cards).
- Admin/secondary surfaces inherit the new palette (per agreed "tokens + storefront" scope) but were not individually polished.
- **Validation:** `npm run build` → `✓ built in 2.78s` (TypeScript + Vite compile clean).

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Footer shows `Pepperanni2026@gmail.com` as a `mailto:` link | `src/components/Footer.test.tsx` | unit | PASS | `npx vitest run src/components/Footer.test.tsx` |
| 2 | Footer does not render "General Trias, Cavite" | `src/components/Footer.test.tsx` | unit | PASS | same |
| 3 | Footer still shows phone `0947 506 7148` | `src/components/Footer.test.tsx` | unit | PASS | same |
| 4 | App compiles with new theme tokens | `npm run build` | build | PASS | `✓ built in 2.78s` |

## Coverage and known gaps
- Full suite: `npx vitest run` → 245 passed, 8 failed. The 8 failures are in `PromoPopup.test.tsx` / `PromoBanner.test.tsx` and are **pre-existing** — verified by `git stash` + rerun on clean `main` (same 8 failures). Not caused by this work.
- Theme is visual; no automated visual-regression test was added. Recommend a manual/Playwright pass on storefront pages.
- ESLint could not run (pre-existing `@typescript-eslint/no-unused-expressions` plugin/version crash, affects all files). The Vite/TS build is the compile gate used here.
- Cart/Checkout and admin dashboards inherit tokens but were not hand-polished (agreed scope).
