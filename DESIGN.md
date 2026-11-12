# Manga Shelf • design review draft
Authority in order: the approved [board](docs/design/manga-shelf.png), directly observed properties below, then the proposed specifications in this package. External examples supply interaction or content structure. Approve this bundle before implementing or replacing any existing design document.

## Board evidence
The 1536 × 1024 board contains three separate narrow screens. Sign-in uses an angled opening illustration; favorites uses a cropped eye strip, three progress marks and captioned tiles; Discover uses a single feature, two mode buttons and labeled bottom navigation. The paper, ink and red dominate even the illustrated covers. This corrects an earlier description of full-color artwork as a defining feature. Treat the fictionalized cover illustrations as composition studies.

Three flat working tokens are medians sampled from the original PNG (coordinates from its top-left, in pixels). Paper #F9EBD7 at x850–949/y100–129; action #CF102C at x610–639/y944–969; ink #0F0F0B at x1080–1085/y117–144. The board has print variation. Use the flat values beneath UI. White #FFFFFF is the proposed on-action text and checkmark. Secondary controls use ink on paper. Show errors with text and icon. Reserve red for actions, selections, errors with labels, and artwork. No additional status palette.

## Production translation • proposed for approval
The lettering is visibly heavy, narrow and uppercase. Its source font cannot be identified from pixels. Use Anton Regular 400 for display, navigation labels and compact button text; use Source Sans 3 Regular 400, Semibold 600 and Bold 700 for reading and UI. Fallbacks: Impact then sans-serif for display; system-ui then sans-serif for body. Only the two-line ANIME WATCHLIST wordmark gets a slight forward slant and a red brush underline. Self-host licensed Latin WOFF2 subsets. Retain natural casing for titles in accessible names.

|Role|Phone size/line-height in px|Desktop|
|---|---|---|
|Page title|40/42|56/58|
|Featured anime|32/35|44/48|
|Section heading|24/28|30/34|
|Tile caption / primary action|18/22|20/24|
|Body and inputs|16/24|18/26|
|Metadata and navigation|14/20|14/20|
Allow long titles to wrap; use a second caption line before truncating. Full title always available on details. Body text measure 60–68 characters.

Spacing steps 4, 8, 12, 16, 24, 32, 48, 64 px. Page gutters 16 under 600px, 24 at 600–959, 32 from 960. Max content width 1200. Mobile single column; compact cover grids two columns, tablet three or four, desktop six. Desktop uses 12 equivalent tracks, 24px gutters. Use only the column splits in screens.md. At 200% zoom collapse naturally and keep scroll vertical.

Ink rules 1px, interactive outlines 1.5px, corners 3px. Paper surfaces, no elevated card shadows. Buttons min-height 44px with 16px horizontal padding and 8px icon gap. Primary red fill + white label, secondary paper + ink border, tertiary underlined text. Hover underline or thicken the visible edge without resizing; focus 2px ink outline with 3px paper separation. Pending retains width and shows a verb such as Saving…; announce completion to assistive technology. Inputs full width with persistent labels, search icon on left, clear on right, 44px minimum. Keep errors below the field and associate programmatically.

Cover tile: 1:1 art for favorites with focal-point cropping, then paper caption strip and border. Library/search use original 2:3 poster within its frame. Selected favorites show red square and white check at top right plus pressed state. Discover hero uses a near-square mobile crop; authentic catalog color is allowed. Never recolor third-party posters without permission. Header wordmark + optional profile shortcut. Signed-in mobile bottom bar: Discover, My List, Search, Profile; icon + text, current destination red and aria-current. Desktop header uses the same order. Omit bell unless backed by a real feature. Sign-in/onboarding use their own focused header.

Motion: 120ms button feedback, up to 180ms drawers and view transitions. Honor reduced motion with instant state changes. No autoplay. Decorative marks remain outside reading and control surfaces. Check WCAG AA contrast for actual combinations and keyboard focus on every surface.

## Handoff
Read references.md, screens.md, flows.md, assets.md under docs/design before making UI changes. Preview on existing feature branch, preserving user edits. Keep Next.js, TypeScript, Prisma, Neon Postgres and Managed Better Auth; use migration-preview fixtures. The existing Firebase personal import has independent verification and authorization. Preserve ranker, Groq credentials boundary, ownership checks and recommendation exclusions. Never migrate personal data as part of design verification. Merge/deploy requires Remy's review.
