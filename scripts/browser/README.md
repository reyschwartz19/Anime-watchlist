# Isolated browser review

These dependency-free Node scripts use local Chrome’s DevTools Protocol. They
refuse actions unless `/api/me` identifies the explicitly enabled fixture app.
The app’s fixture mode also refuses production Node/Vercel environments; cookies
alone cannot enable it. No personal database, live catalog, real account, email,
OAuth exchange or Groq completion is exercised by these scripts.

Start a separate development server (its output lives in ignored `.next-review`):

```sh
ANIME_PREVIEW_FIXTURES=1 APP_URL=http://localhost:3067 \
DATABASE_URL= DATABASE_URL_UNPOOLED= NEON_AUTH_BASE_URL= \
GROQ_API_KEY= MIGRATION_ENABLED=false \
npm run dev -- --port 3067
```

In another terminal, use an installed Chrome (`CHROME_BIN` can override its path):

```sh
node scripts/browser/review.mjs
node scripts/browser/edge-states.mjs
node scripts/browser/journeys.mjs
node scripts/browser/auth-journeys.mjs
# Run last: completing this fixture user’s onboarding changes its server state.
node scripts/browser/onboarding-journey.mjs
```

`ANIME_QA_BASE_URL` overrides the loopback app address. Every script owns and
removes its Chrome profile; it does not attach to a personal browser. Stop only
the review server you started afterward. Restarting it resets synthetic server
data. Normal app credentials are unused in fixture mode.

Screenshots and machine-readable results go to
`docs/design/evidence/manga-shelf/`. `review.mjs` captures both full pages and
first viewports at 390×844, 1440×900, and 1363×647, with fonts/images settled and
reduced motion enabled. It hides only the Next.js developer status bubble from
captures; uncaught runtime errors remain recorded. `initial-review/` retains the
first complete capture round before the compact-height and mobile fixes.

Optional contact sheets use Pillow already available in the review environment:

```sh
python3 scripts/browser/contact-sheet.py
```

The 200% check in `journeys.mjs` emulates a 720×450 CSS viewport at device scale 2
for a 1440×900 display. It verifies zoom-equivalent layout reflow, not physical
device or screen-reader behavior. Live auth and Groq verification still need
the configured isolated provider environment and a human-owned test account.
