# Legacy — built against PRD v0.1/v0.2

These screens, components, and services implement Phase 2–4 features (social
feed, trips, publish/clone, cost splitting, AI planning, IG-style profile)
against the *old* PRD, before v0.3 resequenced the MVP around the place diary.

**Nothing here is on the compile path.** `src/_legacy` is excluded in
`tsconfig.json` and in the Jest config, and nothing outside this directory may
import from it.

Kept — not deleted — because the styling and layout work is largely
independent of the product decisions that changed. Worth cribbing from when
building Phase 1 surfaces; the card rendering in particular.

The product logic is stale. These screens were written against the older
`Place` shape, which had `categories` rather than `themes` and carried
`rating`/`reviewCount` — values PRD v0.3 §12.2 forbids storing, since Google
enrichment is live-only. Do not treat any of this as a reference for the data
model.

Original state is preserved on `bay-area` at commit `fa0a38f`.
