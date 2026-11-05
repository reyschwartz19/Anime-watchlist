# Anime Watchlist

Help a returning viewer answer “What should I watch next?” and “Which saved show fits tonight?” Discovery, collection management and remembered taste are the core product. Streaming services handle episode progress; existing progress survives migration as historical data only.

The owner approved Manga Shelf: paper, ink, action red, condensed display lettering, recognizable catalog titles, a featured recommendation with an intelligible reason and a compact shelf. The approved boards and specifications in `docs/design` govern implementation. The entrance uses the documented owned wordmark fallback until licensed illustration is supplied.

Four destinations: Discover, My List, Search, Profile. New viewers complete progressive identity, favorites and taste onboarding. Library statuses are Watching, Plan to watch, Completed and Dropped. Completion does not imply favorite. Durable dismissals and explicit taste remain separate from library state. All private reads and writes require server-verified identity.

Implementation remains Next.js App Router, TypeScript, Prisma, Neon PostgreSQL and Neon Managed Better Auth. NVIDIA ranking is server-only. The Firebase personal import remains a separate, explicitly authorized cutover. No production deployment or personal import is part of this change.
