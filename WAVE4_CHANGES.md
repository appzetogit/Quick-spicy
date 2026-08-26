# Wave 4 — Changes Made

Working tree only. Nothing committed. Branch: `main`.

Frontend `npm run build` passes. Backend files pass `node --check`. ESLint on touched
files shows only pre-existing errors.

**#027 fixed. #029 fixed. #019 fixed as far as this repo allows. REQ#035 partially
delivered — the map behaviours are done, the rest is scoped below.**

---

## #027 — Inconsistent Delivery Agent Assignment — **FIXED**

My guide called this a hypothesis needing a spike. Reading the code settled it without
one.

**Root cause — CONFIRMED.** Assignment happened **exactly once**, at
`restaurantOrderController.js:855`, the moment the restaurant marked an order preparing.
If no eligible partner existed in that single instant — all busy, none in zone, all over
their COD cash limit — the controller logged a warning and returned this to the
restaurant:

> "No delivery partners available. Order will be assigned when a delivery partner comes online."

**Nothing anywhere did that.** No retry, no queue, no sweeper. The order sat unassigned
until a human noticed. That is the "sometimes not assigned to any delivery agent at all"
report, and the apparent randomness is simply whether someone happened to be free at that
one moment.

### Fix — a retry sweeper
New `backend/modules/order/services/pendingAssignmentService.js`, registered in
`server.js` on the existing cron infrastructure (behind the same leader gate as the other
schedulers, so it runs once and not per worker).

- Runs every **30 seconds**, matching the auto-ready and auto-reject schedulers.
- Picks up orders in `preparing`/`ready` with no `deliveryPartnerId`, **oldest first**, so
  nobody is overtaken while waiting.
- **Idempotent** — `assignOrderToDeliveryBoy` re-checks status and existing assignment on
  entry, so it cannot double-assign or race the original path.
- **Notifies on retry success.** The original path notifies on assignment; without this a
  partner would get an order in their list with no alert.
- Capped at **25 orders per tick** so a backlog is worked through over several runs rather
  than one long pass holding the event loop.
- Escalates loudly after **10 minutes** — past that it is a dispatch problem, not a supply
  blip, and it should not retry silently forever.
- Restaurants with no usable coordinates are logged as errors, not retried — that never
  resolves on its own.

### Fix — assignment funnel instrumentation
The per-stage counts already existed but were spread over many log lines, interleaved
across concurrent requests, so production logs could never answer *why* an order went
unassigned. `findNearestDeliveryBoy` now emits one line when it returns nothing:

```
[Assignment Funnel] blockedAt=cash-limit online=7 cashEligible=0 free=0 zone=Cumbum excluded=0 maxDistanceKm=50
```

`blockedAt` is one of `no-partners-online`, `cash-limit`, `all-busy`, or
`zone-or-distance`. **This is the line to grep** the next time an order goes unassigned —
it names the filter that emptied the pool.

### What this does *not* fix
- **The ~1-minute delay** case. That is a different symptom and I could not attribute it
  from the code; it may be notification latency rather than assignment. The funnel logs
  should reveal it.
- **`rejectOrderAssignment`** — I did not change what happens after a partner rejects. The
  sweeper now picks up rejected-and-unassigned orders on the next tick, which is a
  meaningful improvement, but a proper re-broadcast is still a separate piece of work.
- **No automatic escalation to a human.** Stale orders are logged, not surfaced in the
  admin UI. Worth a follow-up.

---

## #029 — Search Should Respect Serviceable Area — **FIXED**

**Root cause.** The backend already filters by zone correctly
(`restaurantController.js:651`) — but **only when it receives a `zoneId`**. The frontend
sent it conditionally:

```js
const params = {}
if (zoneId) { params.zoneId = zoneId }   // no zone -> unfiltered
```

So an unresolved zone meant the API returned **every restaurant in the country**, and
customers in a non-serviceable town saw stores that could never deliver to them.

`SearchOverlay.jsx` — the type-ahead, i.e. the actual search box — was worse: it fetched
500 restaurants with **no zone parameter at all**, ever.

### Fix
Both surfaces now mirror the guard Under-250 already used:
- zone still resolving → stay in the loading state, do not fetch
- no serviceable zone → empty list, no request
- otherwise → always send `zoneId`

The empty state now says **"We do not deliver to your area yet"** instead of
"No restaurants found" with a *Clear all filters* button — which read as a bug and sent
customers round in circles clearing filters that were not the cause.

---

## #019 — App Closing on Back Button — **FIXED as far as this repo allows**

The consumer app was already covered (`safeBack.js`, 17 adopters, plus the `UserLayout`
history guard). Two things remained.

### Fixed here
`AdminLayout` and `DeliveryLayout` had no equivalent guard, and the delivery and
restaurant modules contain **85 raw `navigate(-1)` calls** between them (35 and 50) — the
exact pattern that closes the app in a WebView.

- Extracted the `UserLayout` guard into `src/lib/hooks/useAppBackGuard.jsx`.
- Mounted it once via a `ModuleBackGuard` component in `App.jsx`, resolving the home path
  by URL prefix (`/delivery`, `/restaurant`, `/admin`). The user module is deliberately
  excluded — `UserLayout` already guards it and a second guard would push a duplicate
  history entry.

Mounted in `App.jsx` rather than each module's router because the restaurant routes are
declared flat in that file and have no layout of their own.

This fixes the **cold-entry crash** (deep link, notification tap, post-redirect) for all
three modules without touching 85 call sites.

### Not fixable here — and this matters
**There is no Flutter code in this repository.** I checked: no `pubspec.yaml`, no
`.dart`, no `android/`. The app runs in a Flutter `InAppWebView`, and the Android
hardware back key is consumed by Flutter, which must call `webview.canGoBack()` /
`goBack()` before letting the route pop.

If #019 still reproduces after this, **it is in the Flutter shell and no web-side change
will fix it.** That needs whoever owns the wrapper repo.

### Follow-up worth a ticket
Migrating those 85 `navigate(-1)` calls to `safeBack(navigate)`. I did not attempt it —
it is a mechanical change across ~40 files, each needing an import, and I cannot visually
verify the result. The layout guard covers the crash; the migration would cover the
remaining dead-end cases.

---

## REQ#035 — Address Selection, Map Pinning & Saved Addresses — **PARTIALLY DELIVERED**

I flagged this as L–XL and it is. Here is exactly what is done and what is not.

### Settled: the map provider question
**Google Maps is canonical.** `LocationSelectorOverlay.jsx` (3,559 lines) uses
`@googlemaps/js-api-loader` throughout. The `olamaps.io` references are only
error-suppression strings for a legacy SDK, not a live integration. No decision needed —
build on Google.

### DONE — fixed centre pin
This was the headline requirement and the biggest behavioural gap.

The pin was a **draggable `google.maps.Marker`**. The requirement is a pin *fixed at the
centre* with the map moving beneath it. Dragging a 40px marker means aiming a fingertip
at a target that sits under the finger doing the dragging — hard on a phone, and
impossible to fine-tune near the viewport edge.

- The marker is gone. The pin is now a **DOM overlay** at the container's centre, so it
  never lags behind the map while panning. `pointer-events-none`, so it can never swallow
  a drag meant for the map.
- Offset by its own height so the **point** of the pin marks the centre pixel, not its
  middle. A small dot marks that exact pixel.
- Position now comes from the map's `idle` event, which covers panning, zooming, and
  programmatic recentres — the old `dragend` covered only dragging.

### DONE — the two-way sync loop
This is the part I warned would be the main source of bugs, and it was real. Map→fields
and fields→map feed each other: recentring the map after a chosen address fires `idle`,
which reverse-geocodes straight back over the address just chosen.

Solved with a `suppressNextIdleRef` flag set before **all five** programmatic `panTo`
calls, plus one at map creation to skip the initial `idle` (initial resolution is already
handled by the existing `addListenerOnce` block, so this avoids double geocoding).

### DONE — selected address is identifiable
Selecting a saved address persists it as `isDefault`, but the list gave no indication
which one was in use. Selected addresses now render highlighted with a
**"Delivering here"** chip and `aria-current`.

### NOT DONE — be aware before closing this ticket
- **Fields → map.** Typing or editing address details does not move the map. The
  suppression plumbing this needs is now in place, but the wiring is not written.
- **Geocode cost and debouncing.** The `idle` handler already debounces via the existing
  `reverseGeocodeTimeoutRef`, but continuous panning still costs geocode calls. Not
  measured against quota.
- **Failure paths.** No-result geocodes, rate limits, and permission-denied / GPS-off are
  unchanged from before.
- **Not visually verified.** The centre pin, its offset, and the dot all need eyes on a
  real device. This is a 3,559-line file and the pin is the single most-used control in
  the ordering flow — **do not ship it on a build check alone.**

---

# Testing this wave

**#027** — mark an order preparing with every partner busy or offline. Previously it
stayed unassigned forever; it should now pick up within 30s of a partner becoming
available. Grep `[Assignment Funnel]` and `[Assignment Retry]`.

**#029** — set a delivery address outside any zone. Search and the type-ahead must return
nothing and say "We do not deliver to your area yet" — not a nationwide list.

**#019** — cold-open a deep link into a delivery or restaurant screen, press back. It must
go to that module's home, not close the app.

**REQ#035** — open the address selector. The pin must sit dead centre and stay there while
the map moves under it. Pick a saved address: the map recentres and the address must
**not** be overwritten by a reverse geocode a moment later. The selected address shows
"Delivering here".
