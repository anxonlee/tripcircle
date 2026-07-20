# Product Requirements Document: TripCircle (working name)
**A banner-free planner for any day out — local or away — with anchor-based route optimization and a cloneable trip community**

Version 0.2 — Draft | July 2026
Changelog v0.2: repositioned around "any day out" (local day trips + travel); added start-place/anchor model with privacy-by-design (landmark-first, coarse storage, ephemeral mode); replaced manual transport modes with Balanced/Fastest optimization goals; added planning-first design principles; category color system; city-by-city go-to-market and growth loops; legal & compliance section.

---

## 1. Overview

### 1.1 Vision
TripCircle plans any day out. Users set one start place — a landmark near home for a local day, or their hotel/Airbnb when traveling — save the places they want to go, and the app builds the most time- and budget-efficient route from that anchor and back, choosing the best transport for each leg. Finished plans become shareable, cloneable posts, so one person's Saturday food crawl or 3-day Kyoto itinerary becomes another person's starting template.

Positioning in one line: **"Strava for any day out — the plan is the activity."** Tool-first, social-second: the planner is fully useful solo; the community compounds on top.

### 1.2 Problem statement
- Turning a list of saved places into an efficient plan (route order, transport choice, opening hours, budget) is manual and tedious. Google Maps saves pins but won't plan a day; Yelp rates places but won't route them.
- Real days radiate from an anchor — you leave home or your hotel, do things, and come back. Existing planners sequence pins in a vacuum and ignore the anchor.
- Existing tools (notably Wanderlog) are cluttered with banners, upsells, and secondary features; the planning core is buried.
- Travel-only planners are used 2–3x a year, so engagement dies between trips.
- Group planning lives in chat threads and spreadsheets; finished itineraries are lost instead of being reusable by others.

### 1.3 Product principles
1. **Planning-first, banner-free.** No ad strips, no upsell banners, no recommendation clutter on core screens. The map, the route, and the plan are the interface. Restraint is the differentiator.
2. **One start place per day.** A start place (landmark near home, or the stay when traveling) is the single required input; every day is a round trip from it. Privacy by design: landmark-first, coarse storage, ephemeral GPS mode (§3.1).
3. **The optimizer shows its reasoning.** Every generated plan displays what it saved and what it trades off ("saved 45 min," "¥1,340 · home by 17:00"). Trust comes from transparency, and plans are always human-editable.
4. **The plan is the post.** Sharing requires no extra content creation — the itinerary the user built is the shareable artifact.
5. **Local and travel are the same product.** One engine, three frequencies: weekly local days out, occasional weekend getaways, and 2–3 big trips a year.

### 1.4 Goals
1. Effortless capture of places into personal and shared wishlists.
2. Anchor-based, transport-aware route optimization (Balanced or Fastest).
3. High-frequency local use ("plan my Saturday") that sustains engagement between trips.
4. A community layer where every plan is shareable, discoverable, and cloneable.

### 1.5 Non-goals (v1)
- Direct booking of flights/hotels (affiliate link-outs instead).
- Building our own maps/POI database (Google Places or Mapbox + Foursquare).
- Desktop-first experience (mobile-first; responsive web later).
- Competitive mechanics (leaderboards, streaks) — travel behavior is collaborative/inspirational, not competitive.

---

## 2. Target users & personas

| Persona | Description | Primary need |
|---|---|---|
| The Local Explorer | Lives in a big city, plans weekend days out (food, culture, shopping) | "Plan my Saturday" from home, near-me discovery, open-hours awareness |
| The Group Organizer | 24–38, plans trips and outings for friends/family | Shared wishlists, voting, cost splitting |
| The Inspiration Collector | 18–30, saves travel/food content from TikTok and Instagram | Link import, save-to-map, wishlist organization |
| The Efficient Traveler | 28–45, limited vacation days, budget-conscious | Anchor-based optimized itineraries, Balanced/Fastest control |
| The Creator | Documents days out and trips, wants an audience | Rich cloneable posts, follower growth |

---

## 3. Core features

### 3.1 Anchors / start places (the core input model)
- Every day of planning has exactly one **start place**: for travel, the stay (hotel/Airbnb/hostel); for local days, a user-set default start place.
- **Landmark-first by default.** When setting a start place, the app suggests nearby public landmarks (station, plaza, café, corner) rather than asking for a home address. Routing quality is unchanged within a few hundred meters; stored sensitivity drops dramatically.
- **Coarse storage.** Stored start places are snapped to ~100m / block-level precision. Exact typed addresses are never persisted at full precision.
- **Ephemeral mode.** Users can start any plan from current GPS location without saving a default at all — nothing stored, nothing to leak.
- **Multi-stay trips:** when a trip changes cities or hotels, each segment re-anchors to the new stay automatically.
- Start places are treated as sensitive data regardless of label: explicit consent on first save, encrypted at rest, deletable on request, and **never serialized into shared posts, clones, or exports** (neighborhood-level display only; clones re-anchor to the cloner's own start place).

### 3.2 Save places & wishlists
- Search and save any place (restaurant, POI, mall, park, café) to lists ("Tokyo eats," "Saturday ideas").
- Import from links: paste a TikTok/Instagram/Google Maps/blog link and auto-extract the place(s).
- Tags, notes, price level, open hours, and estimated visit duration per place.
- Map view and list view; "Near me" filtering from the current anchor.
- **Shared (collaborative) wishlists:** invite friends/partner to a shared board (e.g., "Our Japan someday list") independent of any trip. Members add places, upvote, and comment. Any trip or day plan can pull from any wishlist. Primary between-trips retention surface and a viral entry point (invites).

### 3.3 Route optimization (key differentiator)
The optimizer turns anchor + selected places + constraints into a routed plan.

**Inputs:** anchor address, selected places, date and day window (start/leave time, "home by" time), budget cap, must-visit flags, opening hours, meal windows.

**Optimization goals (user picks one, can toggle live):**
1. **Balanced** (default) — best blend of total cost and total time; prefers walking/transit where reasonable.
2. **Fastest** — minimizes total travel time regardless of cost; upgrades legs to taxis/rapid transit where it saves meaningful time.

**Per-leg transport selection:** the app — not the user — chooses the transport for each leg (walk, bus, metro/train, taxi/rideshare, drive, bike) to satisfy the chosen goal. Each leg displays its mode, duration, and cost. Toggling Balanced ↔ Fastest re-plans instantly and shows the tradeoff (e.g., "40 min faster, ¥2,000 more").

**Outputs:** ordered route drawn on the map from the anchor and back; timeline with depart time, per-stop arrival times, per-leg transport chips, per-stop costs, day totals (cost, travel time, "home by"), and warnings ("closed Mondays," "over budget by ¥1,200"). Drag-and-drop overrides re-flow the rest of the day.

### 3.4 Manual planning
- Full manual mode: drag places onto days, set times, add custom stops, notes, and reservation details.
- Optimizer available as an on-demand assist ("optimize this day") rather than all-or-nothing.

### 3.5 Local day trips ("plan my Saturday")
- Home-anchored single-day planning with near-me discovery, theme chips, and live open-hours status ("Open now," "Open til 22:00").
- One-tap **Plan day** turns a loose list of nearby saved spots into a routed day; **Start day** provides live guidance through the day.
- Local plans are shareable and cloneable like any trip — the engine of city-level content density.
- This is the frequency engine: weekly local use sustains engagement between the 2–3 big trips a year.

### 3.6 Trip & day types

**By structure:**
- Local day out (home-anchored, single day)
- Day trip / weekend getaway (home- or stay-anchored)
- City trips (multi-day, single stay)
- Multi-city / backpacking routes (re-anchoring per stay, inter-city transport legs)
- Road trips (route-based; anchor is the overnight stop per day)

**By theme (first-class categories, per trip or per day):**
- **Food** — meal-window scheduling (breakfast/lunch/snack/dinner slots), caps meals per day, balances price levels against budget
- **Ancient / historical & cultural** — weights opening hours, entry fees, guided-tour time blocks
- **Shopping / malls** — clusters by district, respects mall hours; optional spending budget separate from trip budget
- Nature and outdoor, nightlife, art and architecture, café hopping, theme parks (extensible category system)

Themes drive: (1) theme-aware optimization rules, (2) feed discovery filters ("food days in Tokyo"), (3) tailored suggestions while building. A single trip can mix themes by day.

### 3.7 Collaborative planning
- Invite collaborators to a trip or day plan via link; real-time sync with presence.
- Shared map with everyone's pins color-coded per person; voting and comment threads per place.
- Shared budget with per-person cost splitting and expense tracking.
- Roles: owner, editor, viewer.

### 3.8 Social feed & cloning
- Publish any plan (local day or multi-day trip) as a post: cover media, timeline, photos/videos per stop, costs (optional), tips.
- Feed: following, trending, and city/destination discovery with theme filters. Local density prioritized ("best food Saturdays in your city").
- Interactions: like, comment, save, share externally.
- **Clone**: one tap copies a shared plan into drafts with all places, re-anchored to the cloner's own home/stay and re-optimized for their dates, budget, and Balanced/Fastest preference. Clone counts are displayed on posts (social proof).
- Privacy: private, link-only, followers, public. Anchor addresses never exposed; optional delayed posting so users don't reveal real-time location.

### 3.9 Supporting features
- Offline access to plans and maps (critical when roaming).
- Push reminders ("Leave by 9:20 to make your 10:00 entry").
- Export to Google Maps / calendar / PDF.
- Multi-currency support.
- Travel passport / stats profile (cities explored, days out, countries, places eaten) — identity layer, not competition.
- Packing checklist per trip (auto-suggested by destination/season).

---

## 4. User flows (summary)

1. **Local loop (weekly):** save spots over the week → Saturday morning, tap Plan day → routed day from home → Start day → optionally share → friends clone.
2. **Travel loop:** shared wishlist fills over months → create trip, enter hotel address → select places → optimize (Balanced/Fastest) → adjust → travel with offline plan → publish → others clone.
3. **Clone loop:** discover a post (local or travel) → clone → re-anchored and re-optimized for own situation → go.

---

## 5. Functional requirements (abridged)

| ID | Requirement | Priority |
|---|---|---|
| F1 | Save a place to a named list in ≤3 taps | P0 |
| F2 | Start-place entry (landmark-first suggestions, coarse storage, ephemeral GPS mode) as the only required planning input | P0 |
| F3 | Optimizer returns a routed plan in ≤10s for ≤40 places, round trip from anchor | P0 |
| F4 | Per-leg transport auto-selection under Balanced and Fastest goals, with live toggle and visible tradeoff | P0 |
| F5 | Optimizer respects opening hours, budget cap, day window ("home by") | P0 |
| F6 | Manual drag-and-drop editing with automatic re-flow | P0 |
| F7 | Local day-trip mode: near-me discovery, open-now status, Plan day, Start day | P0 |
| F8 | Shared wishlists: multi-user boards with add/vote/comment, independent of trips | P0 |
| F9 | Pull places from any wishlist into a plan | P0 |
| F10 | Publish plan post with media, timeline, privacy setting; start place never exposed | P0 |
| F11 | Comment, like, save, and clone shared plans (clone re-anchors + re-optimizes) | P0 |
| F12 | Real-time collaboration with ≤2s sync latency | P1 |
| F13 | Multi-stay trips with automatic re-anchoring per segment | P1 |
| F14 | Trip themes with theme-aware optimizer rules; feed filtering by theme + city | P1 |
| F14b | Category color coding on pins/tags/tiles; two-color rendering for multi-category places (cap 2) | P1 |
| F15 | Link import from Google Maps URLs; TikTok/Instagram import | P1 |
| F16 | Cost splitting and expense tracking | P1 |
| F17 | Offline plans + map tiles | P1 |
| F18 | Travel passport / stats profile | P2 |
| F19 | Export to calendar/Google Maps/PDF | P2 |

---

## 6. Design requirements

- **Banner-free core screens.** No ads, upsell strips, or promotional banners on map, plan, or wishlist screens. Monetization surfaces are confined to settings/paywall contexts.
- **Light, airy visual language.** White surfaces, soft map palette, generous whitespace; a single warm accent (clay) reserved for the key actions (Plan day / Optimize / Clone).
- **Map on top, list below** (Yelp/Strava pattern): map with numbered, theme-colored pins occupies the upper half; a draggable bottom sheet holds the place list or timeline. Pins and list items are linked (tap either to highlight both).
- **Numbered pins double as route order** after optimization; dashed route line drawn from the anchor.
- **Optimizer transparency UI:** day summary chips (total cost, travel time, "home by") and per-leg transport chips are always visible on generated plans.

### 6.1 Category color system
Every place category maps to one fixed color, used consistently across pins, tags, and list tiles so users can scan the map and lists by category at a glance.

- **Fixed palette, ~6–7 colors max.** Beyond ~7 the colors stop being distinguishable (especially in split pins). Starting set: Food = coral (#E8542F), Historical/cultural = amber (#E8A22F), Shopping = blue (#2F7FE8), Nature/outdoor = green (#1D9E75), Nightlife = purple (#8B5CF6). Reserve remaining slots (café, art) with care.
- **Multi-category = two colors.** A place with more than one category shows both colors: pins render as a circle split in half (each color one side); list tiles split the icon background; tags render as two colored pills. Icon and place name stay neutral so the color reads clearly.
- **Cap displayed colors at two.** If a place has 3+ categories, show only its two primary categories on pins/tiles; the rest appear in the detail view. Never render 3+ colors on a pin.
- **Primary category first.** The first color (left half of a split pin, first pill) is the place's primary category — defined as the category the user saved it for, falling back to the venue's main type from POI data. Example: a temple with a famous teahouse leads with Historical; a food hall inside a mall leads with Food.
- **Color is a secondary signal, never the only one.** Every colored element is always paired with a text label (tags) or is tappable to reveal a label (pins), so meaning survives for colorblind users (~8% of men). Color alone must never encode required information.

---

## 7. Technical considerations

- **Maps & POI data:** Google Places API (rich, expensive) vs. Mapbox + Foursquare/OSM (cheaper, less coverage). POI + routing API costs are the #1 margin risk; cache aggressively and model unit economics early. Local day-trip usage multiplies API volume — plan for it.
- **Routing/optimizer:** TSP with time windows + budget constraints + per-leg mode choice (multi-modal). Heuristic solvers (OR-Tools) sufficient; needs a transit/fares data source (e.g., Google Directions, local GTFS feeds) for accurate Balanced/Fastest costs.
- **Real-time sync:** CRDT layer (Yjs/Liveblocks) over WebSockets.
- **Media:** transcoding + CDN; enforce compression and clip-length limits (e.g., 60s).
- **Moderation & safety:** UGC reporting, blocking, automated moderation from day one; start-place privacy enforced at the API level (never serialized into shared posts).

---

## 8. Go-to-market & growth

### 8.1 Strategy: city-by-city, local-first
Launch in **one city** and own local day-tripping there before expanding (the Yelp/Uber density playbook). The launch wedge is a place, not a traveler type. Candidate criteria: dense walkable city, strong food/culture scene, active local creator community, good transit data (e.g., Tokyo, Seoul, Bangkok, Mexico City, or a major Western metro).

Local-first solves the two classic travel-app killers simultaneously:
- **Frequency:** locals plan days out weekly, not 2–3x a year.
- **Cold start:** one city's creators and users generate dense, immediately relevant, cloneable content for each other.

### 8.2 Growth loops
1. **Clone loop:** every shared plan is a public landing page; non-users who receive a link see the full plan and a "Clone this to plan yours" CTA that requires sign-up.
2. **Wishlist invite loop:** shared wishlists require inviting friends — each invite is an acquisition event with built-in purpose.
3. **Creator seeding:** partner with local food/culture creators in the launch city to publish their real weekend plans at launch; their audiences arrive to clone.
4. **Content-to-map capture:** TikTok/Instagram link import intercepts the Gen Z "saved a Reel, never went" behavior and converts it into wishlist entries.

### 8.3 Expansion ladder
City 1 (own it) → 2–3 culturally adjacent cities → the travel use case connects cities organically (users from city A plan trips to city B where content already exists) → general availability.

---

## 9. Monetization

1. **Freemium (Pro):** free tier keeps the full planning core (anchor, optimizer, local days, sharing, cloning) genuinely useful — explicitly avoiding Wanderlog-style paywalling of basics. Pro adds: offline maps, multi-stay trips, advanced optimizer constraints, unlimited collaborators, travel stats depth.
2. **Affiliates (travel intent):** hotels, activities, restaurant reservations, eSIMs, insurance — attached to the high-intent travel loop, never as banners on planning screens.
3. **Later:** tourism-board partnerships, creator monetization, promoted (clearly labeled) local collections.

---

## 10. Success metrics

| Metric | Target (12 mo post-launch, launch city) |
|---|---|
| Activation: ≥5 places saved in first week | 40% |
| Local day plans per MAU per month | 1.5 |
| Plan day → Start day conversion | 50% |
| Shared wishlists per 100 users | 20 |
| Posts published per MAU | 0.2 |
| Clone rate on public plans | 8% of views |
| K-factor from clone + invite loops | ≥0.3 |
| D30 retention | 30% (lifted by local frequency) |
| Free → Pro conversion | 3–5% |

Retention is measured on a monthly local cycle (not daily opens) and on trip cycles for the travel loop.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Crowded market (Wanderlog, TripIt, AI planners) | Differentiate on anchor-based multi-modal optimization + banner-free focus + local frequency; none of the incumbents combine these |
| Google/Apple Maps ship day planning | Moat is the community layer (cloneable plans, shared wishlists) and local content density, not the routing math alone |
| POI/routing API costs (multiplied by local usage) | Aggressive caching, tiered providers, per-city GTFS, early unit-economics modeling |
| Social cold start | Local-first density + creator seeding; planner is fully valuable solo |
| Optimizer trust | Always show reasoning and tradeoffs; always human-editable |
| Start-place privacy | Landmark-first + coarse storage + ephemeral mode (§3.1); never exposed in posts; neighborhood-level display; delayed posting option |
| Seasonality of travel | Local loop is season-resistant; travel loop is the monetization spike |
| UGC moderation | Reporting, blocking, automated pipeline from day one |

---

## 12. Legal & compliance (with design-level mitigations)

Not legal advice — a tracked checklist for counsel review. Each item pairs the obligation with a product/architecture decision that reduces exposure by design.

| Area | Obligation / risk | Design-level mitigation |
|---|---|---|
| Location & start places | Precise location + home addresses are sensitive data (GDPR, CPRA); breach linking "home + currently away" is existential | Landmark-first suggestions, ~100m coarse storage, ephemeral GPS-only mode, consent on first save, encryption at rest, never serialized into shared content (see §3.1) |
| Map & POI licensing | Google Places ToS restricts caching, storage, and display on non-Google tiles; OSM/ODbL requires attribution and share-alike | Decide provider before building the cache layer; if Google, cache only what ToS permits (place IDs, not content) and render on Google tiles; if Mapbox+Foursquare/OSM, build attribution into the map UI from day one; keep our own data (user saves, votes, plans) in our schema keyed by external IDs so providers are swappable |
| TikTok/Instagram import | Server-side scraping violates platform ToS; risk of API cutoff and C&D at peak growth | Build as user-initiated share-sheet intent (user shares a link *to* the app; extraction runs on user-provided content, client-side where possible); no background/server crawling; legal review before build; feature-flagged so it can be disabled without an app update |
| UGC & copyright | Liability for user-uploaded copyrighted media | DMCA safe harbor: registered agent, takedown flow, repeat-infringer policy in ToS; ToS grants display license for user content; original-content attestation on upload |
| Moderation & platform law | DSA (EU) / Online Safety Act (UK) require report/appeal tooling | Report, block, and appeal flows ship with the feed (Phase 3 gate), automated media moderation pipeline, transparency log |
| Minors | COPPA (US) and equivalents; location features for minors are high-risk | 13+ minimum age with age gate at signup; no precise-location social features for under-18 accounts; default-private profiles for under-18 |
| Real-time location exposure | Posts revealing a user is away from home | Delayed-posting option surfaced by default; start places never exposed; "post after your trip" nudge |
| Trademark & branding | Name clearance; competitor trade dress | Trademark search (software/travel classes) before naming spend; "Strava for any day out" used descriptively in private materials only, never in consumer marketing; original visual language (already a design requirement) |
| Affiliate & promoted content | FTC and equivalent disclosure rules | All affiliate links labeled; promoted collections carry a "Sponsored" tag enforced at the design-system component level, not per-campaign |
| Cost splitting | Money movement triggers money-transmission licensing | v1 is tracking-only with settle-up outside the app (Splitwise model); any future payments via a licensed partner (e.g., Stripe Connect); never hold user funds |
| Routing liability | Users act on generated routes | ToS as-is disclaimer; no safety claims in UI copy; never frame routes as safety guidance |
| Corporate & IP | Acquisition diligence fails without a clean IP chain | Entity formation before first user or collaborator; IP assignment agreements for every founder, employee, and contractor; open-source license audit (no copyleft in the proprietary core) |

**Sequencing:** entity + IP assignments immediately → map provider/licensing decision before architecture → location privacy design before data-model freeze (done, §3.1) → DMCA agent + moderation before feed launch (Phase 3 gate) → link-import legal review before that feature builds (Phase 4 gate).

### 12.1 When a lawyer is actually needed (timing and budget)

The design mitigations above shrink exposure and shorten counsel conversations; they do not replace the items below. Estimated year-one legal spend: ~$2–5K, front-loaded on formation — discrete tasks with a startup lawyer, not a retainer.

**Required short term (cannot be replaced by product design):**
1. **Entity formation + signed IP assignments** — before anyone other than a solo founder touches the code (co-founder, freelancer, or informal helper). A broken IP chain is the most common killer of small acquisitions in diligence, and acquisition is the target exit. Trigger: the moment a second contributor exists. Cost: low four figures (or standard startup packages plus lawyer review).
2. **Terms of service + privacy policy written for this app** — before the first real user. Must specifically cover location/start-place data, UGC, and minors; generic templates do not. Trigger: launch. Cost: a few hours of counsel time.
3. **Map provider licensing confirmation** — before the caching layer is architected. Self-serve reading of provider ToS first; one focused consult to confirm the caching/storage interpretation. Getting it wrong later means a rewrite. Trigger: architecture decision (MVP month 0–1).

**Deferrable (tied to release gates):**
- DMCA agent registration ($6 filing) + takedown process → Phase 3 (feed launch)
- DSA/OSA moderation compliance review → Phase 3
- TikTok/Instagram import review → Phase 4, before the feature builds
- Trademark: free self-serve clearance search before naming spend; formal registration once the name is proven
- Money-transmission analysis → moot while cost splitting remains tracking-only
- Formal GDPR/CPRA program review → pre-launch, not pre-MVP (§3.1 design covers the substance)

**Solo-founder note:** a solo founder writing all code personally can defer nearly everything except item 2 at launch. Items 1 and 3 become urgent the moment a second contributor or the caching architecture arrives, respectively.

---

## 13. Open questions

1. Which launch city? (Decision gate: creator availability, transit data quality, team familiarity.)
2. Taxi/rideshare pricing data for Fastest mode — estimate from distance or integrate a provider API?
3. Should Fastest mode have a user-set cost ceiling ("fastest under ¥5,000")?
4. AI conversational planning ("plan me a food Saturday under ¥3,000") — v1 or fast-follow?
5. iOS-first native vs. cross-platform (React Native/Flutter)?

---

## 14. Release plan

- **MVP (Months 0–4):** anchor input, save places, optimizer (Balanced/Fastest, per-leg transport), local day-trip mode (Plan day/Start day), manual editing, export. Single launch city.
- **Phase 2 (Months 4–8):** shared wishlists, link-only plan sharing, clone loop, creator seeding, cost splitting.
- **Phase 3 (Months 8–12):** public feed with theme/city discovery, profiles + travel passport, comments, media posts, real-time collaboration.
- **Phase 4 (12+):** multi-stay trips, TikTok/Instagram import, offline maps, AI conversational planning, affiliates at scale, city expansion.
