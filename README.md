# TripCircle

An iOS day-planning app. You pick a few places, it orders them into a day you
can actually walk, and it remembers where you went.

Most planners stop at the itinerary. TripCircle is built around the loop that
comes after it: **explore → plan → run the day → stamp → the diary feeds the
next suggestion.** What you liked and where you have not been in a while is
what shapes the day it offers you next.

---

## The loop

**Explore** shows a map and a list. You save a couple of places.

**Plan** orders them against a day window, an objective, and opening hours,
and shows its totals and tradeoffs rather than just a result. If you arrange
the stops by hand, it keeps your order — the planner never silently
substitutes its own.

**Start day** walks the plan stop by stop, re-anchoring to the time you
actually set out, and hands off to Google Maps for the navigation itself.

**Stamp** records a visit — with an optional photo and a "would go again"
answer.

**The diary** turns those into a memory wall, and biases future suggestions
toward places you liked or have not tried, depending on which mode you pick.

Around that core: cost splitting, shared wishlists, a public feed of published
days, and multi-day trips.

---

## Stack

React Native 0.86 · Expo SDK 57 · TypeScript (strict) · Zustand with
AsyncStorage persistence · Supabase behind an optional backend flag ·
react-native-maps (MapKit on iOS, Google Maps SDK on Android).

**~29,000 lines across 22 screens. 648 tests, all passing.**

```bash
npm install
npx jest              # 648 tests
npx tsc --noEmit      # typecheck
npx expo run:ios      # build and run on a simulator
```

The app runs with no configuration at all. Without a Google Maps key it uses
the built-in Bay Area place list and its own travel estimates; without
Supabase credentials the account-gated features simply do not appear, and the
diary, the planner and day sharing work exactly as they do with them, because
all three are local. See [.env.example](.env.example).

---

## Testing without a React Native runtime

Jest here parses plain TypeScript. Anything that imports React Native or
AsyncStorage fails to load, so the decision-making logic lives in
[`src/lib`](src/lib) and [`src/domain`](src/domain) as pure functions, and the
screens stay thin over it.

That is why the optimiser, the day-window arithmetic, the reorder maths, the
share-link codec, the diary summariser and the trip model are all directly
testable, and why the test count is what it is. It is a constraint that turned
out to be a good one.

---

## The architectural decision worth reading

**The planner only ever plans one day.** It has no concept of a trip.

A trip is a *container over* it. [`src/domain/trip.ts`](src/domain/trip.ts)
models a trip as a list of days, where a day is exactly what the single-day
planner already holds: a selection, a window, an order, pinned times, a goal.
[`src/lib/tripBridge.ts`](src/lib/tripBridge.ts) is **the only file in the
codebase aware of both stores** — it loads a trip day into the planner and
writes the planner's edits back.

The payoff is that every screen the planner powers — Explore, Plan, Start day,
stamping — works on a trip day unchanged, because none of them can tell the
difference. Multi-day support was additive rather than a rewrite.

Two consequences of that shape:

**Days are ordinal, not calendar dates.** "Day 1", "Day 2". Nothing in the
model varies by weekday: `openHours` carries no per-day dimension, so a date
would change what the screen prints and nothing about what the planner
produces. When opening hours gain weekdays, dates earn their place — not
before.

**A place belongs to exactly one day of a trip.** The write-back door
enforces it rather than relying on the sync to be timely; a place added to one
day leaves whichever other day held it.

### Other things the code is opinionated about

- **The planner orders your selection and never substitutes it.** A
  hand-arranged order is held against the optimiser, and places added
  afterwards are appended rather than silently reshuffled.
- **Ephemeral GPS anchors are never persisted.** A start place saved to disk
  is always a durable, named place; a one-off "where I am right now" anchor
  lives for the session only.
- **Share links carry no start place and no accommodation.** There is no field
  for either in the payload — the mechanism, not a filter.

[`src/_legacy`](src/_legacy) is a **frozen** earlier version of the app. It is
not imported, not built, and not maintained. It is kept for reference only.

---

## Where the specification lives

There is deliberately **no PRD on this branch.** The specification is
`travel-planner-prd.md` on `CCMFHK-economic`, and
[BAY-AREA-DELTA.md](BAY-AREA-DELTA.md) records only what this build does
differently.

That is not laziness. This branch carried a full copy of the PRD for a month
and it drifted — pricing examples in the wrong currency, two optimisation
objectives described where the code had four, a budget cap that had already
been removed. Nobody noticed until the two were read side by side. A second
full specification for one product will diverge again; a short delta naming
its parent revision cannot drift as far, and the whole difference is visible
at once.

## Two builds

There are two builds of this app, from a shared history:

| | Branch | Bundle identifier |
|---|---|---|
| **TripCircle** (this one, SF Bay Area) | `main` | `com.anxonlee.pirt.tripcircle` |
| **PIRT** (Hong Kong) | `CCMFHK-economic` | `com.anxonlee.pirt` |

For a period **both were named PIRT**, and only the bundle identifier and the
branch told them apart. This build has since taken its original name back.
When it matters — privacy policies especially — check the bundle identifier
rather than the name.

---

## Status: what is not done

Honest list. This is a working app, not a finished product.

- **Google Maps link import** — not built. Ungated and buildable.
- **Social import (TikTok / Instagram)** — not built, and blocked pending
  legal review rather than pending code.
- **AI conversational planning** — not built. Needs an API key and a server
  proxy to hold it.
- **Offline maps** — not built. Waiting on a provider decision.
- **Account-gated paths are untested.** Shared wishlists, the public feed and
  publishing a day all require signing in, and that has never been exercised
  end to end. Treat those paths as unproven.

The single-day loop, multi-day trips, the diary, cost splitting and day
sharing are all exercised regularly on a simulator.

---

## Data provenance — please read before judging the place data

The Bay Area place set in
[`src/services/mock/bayAreaPlaces.ts`](src/services/mock/bayAreaPlaces.ts) is
**441 records imported from OpenStreetMap.** It is a demonstration dataset.

Names and coordinates come from the import and are reasonable. **The opening
hours are weaker than they look:** of the 423 records carrying hours, **208
have `hoursEstimated: true`**, meaning the hours are a category default rather
than anything observed. A further 19 carry `openHours: null` and are treated
as always open.

The flag exists precisely so a guessed window is never presented as fact, and
the app is written to respect it. **Check the flag rather than the
plausibility of the number** — an odd-looking hour is not evidence of a guess.
Golden Gate Produce Market really does open at 22:00 and close at 14:00 the
next day, and carries no estimate flag at all.

This dataset is not verified, curated, or researched, and should not be
described as any of those things.

### Attribution

Place data © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, available under the
[Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).
The ODbL governs the data; it is **separate from the licence on this source
code**, and attribution is required by the licence, not by courtesy.

---

## Licence

Source code: see [LICENSE](LICENSE). The OpenStreetMap-derived place data is
ODbL and is not covered by that licence — see the attribution note above.
