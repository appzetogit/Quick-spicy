# Quick Spicy — Bug Fix Implementation Guide

**Scope:** the 16 items classified as **Bugs**. New features and UI changes are out of scope for this document.

**Stack observed:** React 19 + Vite, React Router 7, Tailwind, Framer Motion, MUI, Firebase (frontend/) · Node/Express modular backend (backend/modules/*).

Root causes below marked **CONFIRMED** were traced in the source. Those marked **HYPOTHESIS** need a reproduction before coding.

---

## Suggested order of work

| Wave | Items | Rationale |
|---|---|---|
| **1 — Ship first** | #019, #032, #028b, #022 | Crash-class or data-correctness. Small, isolated, high user impact. |
| **2 — Store screen (one branch)** | REQ#016, #017, #011, #014, #006, #005 | All live in `RestaurantDetails.jsx`. Fixing them separately causes merge pain and rework. |
| **3 — Nav & banners** | #028a, #020, #021 | Depend on Wave 1's navigation fix landing. |
| **4 — Deep / risky** | #027, #029, REQ#035 | Backend or architectural. Need investigation spikes before estimates. |

---

# WAVE 1

> **Status: #032 and #028b are implemented and building.** #019 needs QA
> confirmation before any code (see correction below). #022 is blocked on a
> product decision. Details in `WAVE1_CHANGES.md`.

## #019 — App Closing on Back Button
**Severity: Critical.** Effectively a crash on the most-used gesture.

> **CORRECTION (this supersedes the first draft of this section).** An earlier
> revision claimed "zero back handlers, confirmed by absence." That was wrong —
> the search was restricted to `*.jsx` and missed `safeBack.js`. **The consumer
> app already implements this fix.** Verify before writing any new code.

**Already in place — CONFIRMED:**

1. `src/module/user/utils/safeBack.js` — reads React Router's `history.state.idx`; if
   there is in-app history it calls `navigate(-1)`, otherwise it `replace`s to a fallback
   route rather than walking off the end of history. Its header comment names this exact
   symptom, including the Flutter WebView closing.
2. **Adoption is complete:** 17 files in `module/user` import `safeBack`, and there are
   **zero** remaining raw `navigate(-1)` or `history.back()` calls in the module.
3. `UserLayout.jsx` carries a history-insertion guard: on entering any non-home screen
   at `history.state.idx === 0` (deep link, notification tap, post-redirect), it replaces
   with Home then pushes the real screen, so history becomes `[Home, current]` and the
   first back press lands on Home instead of exiting.

**Therefore:** do not re-implement. Confirm with QA whether #019 still reproduces.

**If it does still reproduce, the remaining gap is one of:**

- **The native shell, not the web app.** This runs inside a Flutter `InAppWebView`
  (`window.flutter_inappwebview`, see `lib/utils/firebaseMessaging.js:130`). The Android
  hardware back key is consumed by Flutter, which must call `webview.canGoBack()` /
  `goBack()` before allowing the route to pop. No amount of web-side code fixes that —
  **this is most likely where the bug now lives.**
- **Other modules are unguarded.** `history.state?.idx` appears only in `module/user`.
  `AdminLayout` and `DeliveryLayout` have no equivalent. Out of scope for the consumer
  ticket, but the same crash exists there.
- **A specific flow.** The `UserLayout` guard keys on `location.pathname` only. Get the
  exact screen and entry path from whoever filed it.

**Acceptance:** From any screen except Home, back returns to the immediately previous screen. From Home, the app does not silently exit.

**Test:** Home → Store → Item detail → Cart → back ×4 must retrace exactly, with cart state intact. Test cold-start deep links separately — that is the path the guard exists for.

---

## #032 — Incorrect Veg Indication in Cart
**Severity: High.** Serving a veg indicator on a non-veg item is a trust and dietary-compliance issue, not a cosmetic one.

**Root cause — CONFIRMED.** Two defects compound:

- `Cart.jsx` normalises items with `isVeg: item.isVeg !== false` at **five** sites (lines ~1061, ~1337, ~1400, ~1459, ~1563).
- The store menu does not carry `isVeg`. It carries **`foodType: "Veg" | "Non-Veg"`** (see `RestaurantDetails.jsx` filter logic, ~line 1449).

So for any item added from the store, `item.isVeg` is `undefined` → `undefined !== false` → `true` → **every item renders green**. The renderer at `Cart.jsx:2310-2311` then paints the green marker.

There is also a hardcoded `isVeg: true` at `Cart.jsx:~2500` that must be removed.

**Fix**

1. Add one shared resolver — put it in `src/module/user/utils/` so cart, store, and checkout all agree:
   ```js
   export const resolveIsVeg = (item) => {
     if (typeof item?.isVeg === 'boolean') return item.isVeg
     const t = String(item?.foodType ?? '').trim().toLowerCase()
     if (t === 'veg') return true
     if (t === 'non-veg' || t === 'nonveg') return false
     return null   // unknown — do NOT default to veg
   }
   ```
2. Replace all five `isVeg: item.isVeg !== false` occurrences with `isVeg: resolveIsVeg(item)`.
3. Delete the hardcoded `isVeg: true`.
4. Update the indicator at `Cart.jsx:2310` to handle three states — veg (green), non-veg (red), and **unknown (render nothing)**. Never fall back to green.

**Critical rule:** the safe default is *no marker*, not *veg*. A missing marker is a UI gap; a wrong veg marker is a broken promise to the customer.

**Test:** Add a non-veg item from a store → cart shows red. Add veg → green. Add an item with no food type set in BO → no marker, no crash.

---

## #028b — Incorrect Navigation Menu Selection
**Severity: Medium.** Trivial fix, confirmed cause.

**Root cause — CONFIRMED.** `BottomNavigation.jsx:11`:
```js
const isDelivery = !isUnder250 && !isProfile && !isForOthers &&
  (location.pathname === "/" || location.pathname === "/user" ||
   (location.pathname.startsWith("/") && !location.pathname.startsWith("/restaurant") && ...))
```
`isDelivery` is a catch-all built from *exclusions*. `/orders` isn't in the exclusion list and starts with `/`, so **Your Orders highlights the Delivery/Home tab**.

**Fix.** Replace exclusion logic with an explicit route→tab map. Match by prefix, most specific first, and default to *no tab selected* rather than to Delivery:
```js
const TABS = [
  { key: 'under250', match: ['/under-250', '/user/under-250'] },
  { key: 'profile',  match: ['/profile', '/user/profile'] },
  { key: 'orders',   match: ['/orders', '/user/orders'] },
  { key: 'delivery', match: ['/', '/user'] },   // exact-match only
]
```
An unmapped route should highlight nothing — far better than confidently highlighting the wrong thing.

**Test:** Walk every bottom-nav destination plus Orders, Order Details, and Order Tracking; confirm the highlight matches the visible screen each time.

---

## #022 — Offline Stores Displayed
**Severity: Medium–High.** Users can reach a store that cannot fulfil.

**Root cause — CONFIRMED (partially by design).** `Under250.jsx` computes availability (`~line 852`, `isRestaurantOffline` at `~1023`) and renders an **"Offline" badge** (`~1039`) rather than excluding the store. Add-to-cart is correctly disabled when closed (`~1438`, `~1462`, `~1488`), so the guard rails work — the complaint is about *visibility*. Search results have **no availability handling at all**.

**Decision required from product before coding:** hide offline stores entirely, or sort them to the bottom with the existing badge? The sheet says "displayed" is the bug, which reads as *hide*. Get this confirmed — hiding reduces catalogue depth in low-supply hours, and someone should own that call.

**Fix (assuming hide)**

1. Extract the availability logic in `Under250.jsx` into a shared `getRestaurantAvailability()` util — it currently exists only in that file.
2. Apply it as a filter in the Under-250 list.
3. Apply the same filter in `SearchResults.jsx`, which has no such logic today.
4. Prefer filtering **server-side** so pagination counts stay honest. Filtering client-side after paging produces near-empty pages.
5. Availability must derive from server time, not the device clock.

**Test:** Take a store offline in BO → it disappears from search and Under-250 without an app restart. Bring it back → it reappears.

---

# WAVE 2 — Store Screen
> All six items are in `frontend/src/module/user/pages/restaurants/RestaurantDetails.jsx` (3,608 lines). **Do them on one branch, in one pass.** They touch the same render tree and the same state.
>
> Worth doing first: this file is large enough that the menu-list rendering should be extracted into its own component before the fixes go in. That refactor is the difference between a clean fix and six overlapping patches.

## REQ#016 — Display All Store Items by Default
**Root cause — CONFIRMED.** `RestaurantDetails.jsx:~731`:
```js
const defaultExpandedSections = new Set(
  Array.from({ length: Math.min(3, finalMenuSections.length) }, (_, idx) => idx)
)
```
Only the **first three** sections expand on load. Everything from the fourth category down is invisible until the user finds and taps it. State init at line 146 (`useState(new Set([0]))`) has the same problem.

**Fix.** Expand all sections by default:
```js
const defaultExpandedSections = new Set(finalMenuSections.map((_, idx) => idx))
```
and change line 146 to an empty set with an "expand-all once loaded" effect, or seed it from the fetched sections.

**Performance caveat — do not skip.** Expanding every section renders the entire menu at once. On a 200-item store this will jank. Pair the change with virtualisation or incremental rendering of the item list. Measure scroll FPS on a mid-range Android device before and after; if it regresses, virtualise rather than reverting to collapsed sections.

---

## REQ#017 — Automatically Expand Selected Category
**Root cause — CONFIRMED.** `RestaurantDetails.jsx:~2480`, the menu-sheet category button closes the sheet and calls `scrollIntoView` — but **never touches `expandedSections`**. If the target section is collapsed, the user scrolls to a closed header and must tap again.

**Fix.** In the same handler, before the scroll:
```js
setExpandedSections(prev => new Set(prev).add(category.sectionIndex))
```
Keep the existing `setTimeout(..., 300)` for the sheet close, but the scroll must run **after** the expansion has painted — otherwise it scrolls to the pre-expansion offset and lands in the wrong place. Use a layout effect or `requestAnimationFrame` keyed on the expansion, not a fixed delay.

Note: once REQ#016 lands, all sections are expanded anyway — but keep this fix, because it guards the case where a user has manually collapsed a section.

**Open question for UX:** accordion (collapse others) or independent? The sheet defers to "approved UX design." Get it in writing before implementing.

---

## REQ#011 — Make Category Navigation Interactive
**Root cause — PARTIALLY CONFIRMED.** Categories inside the menu sheet **are** already clickable buttons (`~2477`) that scroll to the section. What is missing:

- No **selected/active state** — the acceptance criteria require the chosen category to be visually identifiable. There is no `activeCategory` state on this screen at all.
- The scroll silently no-ops when `document.getElementById(sectionId)` misses, which happens if the section isn't rendered (see REQ#016).

**Fix**

1. Add `activeCategory` state, set on selection and updated on scroll via an `IntersectionObserver` over the section headers so the highlight tracks manual scrolling too.
2. Style the active row in the sheet, and — if design agrees — surface a sticky category strip on the screen itself.
3. Guard the `getElementById` miss: if the node isn't found, expand the section, wait a frame, retry once, then bail quietly.

---

## REQ#014 — Prevent Background Scrolling When Menu Is Open
**Root cause — CONFIRMED (by absence).** `showMenuSheet` (state at line 138) renders a backdrop and sheet at `~2451` with **no body scroll lock** — no `document.body.style.overflow`, no lock utility anywhere in the file.

**Fix.** Add a reusable `useScrollLock(isOpen)` hook and apply it to all three sheets on this screen: `showMenuSheet`, `showFilterSheet` (line 142's `showMenuOptionsSheet` too).

The hook must:
- Capture `window.scrollY` on open.
- Apply `position: fixed; top: -Ypx; width: 100%` to `body` — plain `overflow: hidden` does **not** hold on iOS Safari.
- On close, restore the style **and** `window.scrollTo(0, savedY)`.

Failing to restore the offset makes the page jump to top on sheet close — the classic regression here. Test it explicitly.

---

## REQ#006 — Correct Price Sorting Behaviour
**Root cause — CONFIRMED.** `sortMenuItems()` (line 1469) is correct in isolation, but it is invoked **per section** — at line 2001 for section items and line 2225 for subsection items:
```js
{sortMenuItems(filterMenuItems(sectionItems)).map((item) => { ... })}
```
So each category is internally sorted while the categories themselves stay in menu order. Exactly the reported behaviour.

**Fix — this is a rendering-mode change, not a comparator change.**

When `filters.sortBy` is set, the screen must switch from grouped rendering to a **single flat list** across all categories:

1. Build a flat array: all sections' items + all subsections' items, each tagged with its source category name.
2. Apply `filterMenuItems`, then `sortMenuItems`, to that flat array.
3. Render one ungrouped list. Optionally show the category name as a small label on each card so the user retains context.
4. When `sortBy` is cleared, revert to the existing grouped/accordion rendering.

**Decisions to lock down:**
- **Variants/sizes:** sort by base price or lowest variant price? `getFinalPrice()` already exists — confirm what it returns for multi-variant items and document the choice.
- **Unavailable items:** currently `isAvailable === false` items are excluded from the under-250 check but may still render. Decide whether they sort in or drop out.
- Category grouping must not re-assert itself. That is the whole point of the ticket.

---

## REQ#005 — Correct Store Address Display
**Root cause — HYPOTHESIS. Reproduce before coding.**

`RestaurantDetails.jsx` lines ~274–370 contain a large multi-priority address formatter (Priority 1 → Priority 4 fallbacks, Plus Code stripping, part-count heuristics). This is the prime suspect, but note it appears to build the **customer's** address, not the store's — worth confirming which is rendered where before changing anything.

**Three candidate causes, in likelihood order:**

1. **Stale state across navigation.** If the address shows the *previously viewed* store, the component isn't resetting on route param change. Check that the store fetch effect keys on the restaurant ID and clears prior state. `fetchedMenuKeyRef` suggests memoisation is in play — verify it invalidates correctly.
2. **Fallback chain picking the wrong field.** The `addressParts.length >= 2` branch will happily emit `"City, State"` for a store whose street fields are empty — which reads as "an address from another area."
3. **BO data genuinely wrong** for the affected stores.

**Do this first:** get the specific store IDs that reproduce, then compare `GET` payload vs. BO record vs. rendered string. Only then decide whether this is a frontend or data fix. Do not "fix" the formatter until you know which of the three it is.

---

# WAVE 3

## #028a — Cancelled Order Back Navigation
**Two defects in one ticket.**

**(a) Wrong back destination.** From the Order Cancelled screen, back goes to Profile instead of Home. Almost certainly the same stack problem as **#019** — fix that first, then re-test; this may resolve itself. If it doesn't, the cancelled screen was likely reached via `replace: true` from a Profile-rooted route, so back finds Profile underneath. Explicitly route back to Home from this screen.

**(b) Wrong refund message on COD.** *"Refund will be processed"* must not appear for COD orders cancelled by admin, restaurant, or consumer — nothing was paid.

Gate the message on payment method **and** payment status. Show it only when money was actually captured:
```js
const showRefundNote = order.paymentMethod !== 'COD' && order.paymentStatus === 'PAID'
```
Check the Orders list, Order Details, and the cancellation confirmation screen — the string may exist in more than one place. Also confirm the backend isn't creating a refund record for COD cancellations.

---

## #020 — Banner Overlapping Address
The top banner overlaps the address block; the user can't read or change their delivery address. Files: `OfferBannerCarousel.jsx`, `LocationDisplay.jsx`, and the Home layout.

The sheet says *"Complete implementation is required"* — treat this as a real layout rework, not a `z-index` bump. Give the address bar and the banner separate, non-overlapping layout slots rather than stacking them absolutely.

Verify on small viewports and devices with notches/cutouts, and with a long address string (the overlap usually appears only when the address wraps to two lines).

**Acceptance:** address is fully legible and tappable at every supported width, with a long address, in both themes.

---

## #021 — Banner Navigation to Store
**Root cause — CONFIRMED, and it is probably a data problem, not a code problem.**

`OfferBannerCarousel.jsx:68-74` already implements navigation correctly:
```js
const link = String(banner?.linkUrl || "").trim()
if (!link) return           // decorative banner — silently does nothing
if (/^https?:\/\//i.test(link)) { window.open(link, "_blank", ...); return }
navigate(link.startsWith("/") ? link : `/${link}`)
```
If banners don't navigate, `linkUrl` is **empty on the banner records**. Check `backend/modules/heroBanner` and the BO banner form — the field may not be exposed to whoever uploads banners.

**Fix**

1. Confirm whether BO exposes `linkUrl`. If not, that's the real ticket — add the field.
2. Prefer a structured target (`{ type: 'store', storeId }`) over a raw URL string. Raw paths rot silently and can't be validated.
3. Handle dead targets: store deleted, offline, or outside the user's serviceable zone. Currently a bad path navigates to a broken screen. Decide the fallback — a toast, or route to the store list.
4. `cursor-pointer` is already conditional on `linkUrl` (line 117), so decorative banners correctly look non-interactive. Keep that.

---

# WAVE 4 — Investigation Required

## #027 — Inconsistent Delivery Agent Assignment
**Severity: Critical for operations.** Orders sometimes assign instantly, sometimes after ~1 minute, sometimes never.

**Root cause — HYPOTHESIS. This needs a spike, not an estimate.**

Relevant code: `backend/modules/order/services/deliveryAssignmentService.js` (861 lines), plus `modules/admin/controllers/orderController.js`.

The "sometimes ~1 minute, sometimes never" pattern is characteristic of an assignment that runs **once**, synchronously, at accept-time, with no retry — so it succeeds only if an eligible partner happens to be free at that instant.

Inspect these in order:
- `assignOrderToDeliveryBoy()` (line 605) — is it awaited? Are failures swallowed? Is there any retry?
- `filterOutBusyDeliveryPartners()` (line 239) — if every partner is momentarily busy this returns empty, and the order likely falls through with no re-attempt.
- `filterPartnersByAvailableCashLimit()` (line 195) — COD cash-limit exclusion is a strong candidate for the "never assigned" case, and it will look random from the outside.
- `resolveRequiredZone()` / `isPartnerInsideRequiredZone()` (lines 139, 159) — a zone mismatch silently empties the candidate pool.
- `rejectOrderAssignment()` (line 702) — what happens after a rejection? If there's no re-broadcast, one rejection strands the order.

**Instrument before fixing.** Add structured logging at each filter stage recording how many partners entered and how many survived. Run it for a day. The stage that drops the pool to zero *is* the bug. Guessing here will burn a sprint.

**Likely shape of the fix:** move assignment to a **queue with retry and backoff** rather than a one-shot call — re-attempt every N seconds until assigned or escalated to manual dispatch, with an alert when an order goes unassigned past a threshold. Make it idempotent so retries can't double-assign.

---

## #029 — Search Should Respect Serviceable Area
Restaurants from non-serviceable towns appear in search.

**Same class as #022, and they should be fixed together.** `SearchResults.jsx` has neither availability nor zone filtering.

Zone infrastructure already exists — `useZone.jsx`, `backend/modules/location`, and the Turf.js polygon helpers in `deliveryAssignmentService.js` (`isPointInsideZone`, line 29). Reuse it; do not write a second implementation.

**Fix.** Pass the user's resolved zone to the search endpoint and filter **server-side**. Client-side filtering breaks result counts and pagination, and leaks non-serviceable store data to the client.

**Edge cases to decide:** user has no location yet; user is outside every zone; user changes address mid-session (results must refetch). Note the comment at `RestaurantDetails.jsx:117` — the team already decided zone follows *current location*, not a saved address. Stay consistent with that.

---

## REQ#035 — Address Selection, Map Pinning & Saved Addresses
**Effort: L–XL.** Labelled a bug, but the requirement is a rewrite of the address flow. Scope it honestly.

Touches `LocationSelectorOverlay.jsx`, `LocationGate.jsx`, `LocationDisplay.jsx`, `useLocation.jsx`, `useZone.jsx`, and `backend/modules/location`. Note both Google Maps (`@react-google-maps/api`) and Ola Maps (`OLA_MAPS_SETUP.md`) appear in the project — **confirm which is canonical before starting**; maintaining two map integrations through this rework would be costly.

**Required behaviours**
- Pin fixed at map centre; the *map* moves under it, not the pin.
- Map move → reverse geocode → populate address fields.
- Manual field edit → forward geocode → move map. Both directions must work.
- Saved addresses selectable from the launch slide-up, updating location, fields, and map together.
- Selected address clearly identifiable throughout.

**The hard part is the two-way sync.** Map→fields and fields→map will trigger each other into an infinite loop unless you track update origin and suppress the echo. Design that before writing code — it is the single largest source of bugs in this pattern.

**Also budget for:** geocode debouncing and API cost, rate limits, no-result handling, and permission-denied / GPS-off paths.

---

# Cross-cutting notes

**Before Wave 2 starts.** `RestaurantDetails.jsx` is 3,608 lines and hosts six of these bugs. Extract the menu list and the sheets into separate components first. This is not gold-plating — six overlapping edits to one file of this size will produce conflicts and regressions.

**Repo hygiene, worth a separate ticket.** `backend/` contains committed debug artefacts — `debug_log.txt`, `debug_output.txt`, `server.err.log`, `menu_inspect.txt`, `tmp-*.js`, `check_result.txt`. `frontend/` has `tmp-check.mjs`, `tmp-status-check.mjs`. These should be gitignored and removed.

**Git ownership warning.** `git` in this workspace reports *dubious ownership* for `D:/projects/quick`. Until that's resolved, git commands fail:
```bash
git config --global --add safe.directory D:/projects/quick
```

**Regression suite.** Every fix above is user-visible on a core path. Before Wave 1 merges, get a written manual test pass covering: browse → store → add item → cart → checkout → order → cancel. Most of these bugs live on exactly that path, and several fixes (#019, #028a, #028b) interact.

**Verification standard.** Fixes to #005, #021, #022, and #027 depend on backend or BO data. None of them should be marked done from a frontend-only check — verify against a real BO record each time.
