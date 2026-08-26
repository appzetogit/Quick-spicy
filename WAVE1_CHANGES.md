# Wave 1 — Changes Made

Working tree only. Nothing committed. Branch: `main` (branch before committing).

**#032, #028b, #022 fixed. #019 needs QA input — the fix is already in the codebase.**

`npm run build` passes (2m43s). ESLint on the touched files reports only
pre-existing errors — none on changed lines.

---

## #032 — Incorrect Veg Indication in Cart — **FIXED**

Non-veg items were rendering a green (veg) marker in the cart.

**Root cause.** Store menu items carry `foodType: "Veg" | "Non-Veg"`; they have no
`isVeg` field. The cart item was built with `isVeg: item.isVeg !== false`, and
`undefined !== false` is `true` — so **every item added from a store menu was marked
Veg.** Confirmed at `RestaurantDetails.jsx:1046`, which was the true source; the five
`Cart.jsx` sites inherited the bad value.

The store screen itself renders correctly (`RestaurantDetails.jsx:2004` uses
`item.foodType === "Veg"`), which is why the bug only showed after adding to cart.

**Backend was already correct** — `orderCalculationService.js:229` prefers the menu
record's `foodType` over the client value, so persisted orders were never wrong. This
was display-only.

### Files

| File | Change |
|---|---|
| `frontend/src/module/user/utils/foodType.js` | **New.** `resolveIsVeg()` → `true` / `false` / `null`. Handles `isVeg`, `foodType`, and legacy `category`/`type`. Plus `resolveIsVegForPayload()` for the boolean-typed API field. |
| `.../pages/restaurants/RestaurantDetails.jsx:1046` | Cart item now uses `resolveIsVeg(item)` and carries `foodType` through. |
| `.../pages/cart/Cart.jsx` (5 sites) | `isVeg: item.isVeg !== false` → `resolveIsVegForPayload(item)`. |
| `.../pages/cart/Cart.jsx:2314` | Indicator is now three-state. Unknown renders **nothing**. Added `aria-label`. |
| `.../pages/cart/Cart.jsx:2511` | Addon add-to-cart no longer hardcodes `isVeg: true`. |

### Design rule
Unknown food type renders **no marker**, never green. A missing marker is a UI gap;
a wrong veg marker is a broken promise to the customer.

`resolveIsVegForPayload()` sends `false` for unknown rather than `true`, so an unknown
is never persisted as a false Veg claim. The server re-derives the real value anyway.

### To verify
- Add a **non-veg** item from a store → cart shows **red**. *(This is the reported bug.)*
- Add a **veg** item → green.
- Item with no food type in BO → **no marker**, no crash.
- Add an **addon** → marker matches the addon, not always green.
- Place an order end-to-end → order record still correct.

---

## #028b — Incorrect Navigation Menu Selection — **FIXED**

"Your Orders" highlighted the Delivery tab.

**Root cause.** `BottomNavigation.jsx:11` built `isDelivery` from *exclusions* — any path
not explicitly excluded matched. `/orders` was not in the exclusion list, so it lit
Delivery. The same catch-all lit Delivery on most of the app.

**Fix.** Replaced with an explicit allowlist (`TAB_ROUTES` + `resolveActiveTab()`),
normalising the optional `/user` prefix and trailing slashes. First match wins.
Unmapped routes highlight **nothing** rather than guessing.

| Section | Routes |
|---|---|
| Delivery | `/`, `/restaurants`, `/category`, `/search`, `/product`, `/cart`, `/offers`, `/collections`, `/top-10`, `/gourmet` |
| Under 250 | `/under-250` |
| For Others | `/order-for-someone-else` |
| Profile | `/profile`, `/orders`, `/wallet`, `/notifications` |
| *(none)* | `/help`, `/auth/*`, `/gift-card`, anything unmapped |

Verified against 22 real routes from `UserRouter.jsx` — all pass.

### Judgment call to confirm
There is no Orders tab in the bottom nav, so **order / wallet / notification screens map
to Profile** (the account area). The alternative is highlighting nothing. If product
prefers no highlight on Orders, move `/orders` out of the `profile` entry — one line.

`resolveActiveTab` is exported, so it is unit-testable.

---

## #019 — App Closing on Back Button — **NO CODE WRITTEN**

**My guide was wrong on this one.** It claimed "zero back handlers, confirmed by
absence." That search was restricted to `*.jsx` and missed `safeBack.js`.

**The fix already exists in the codebase:**

1. `module/user/utils/safeBack.js` — checks `history.state.idx` before `navigate(-1)`;
   falls back to a route instead of walking off the end of history. Its comment names
   this exact symptom, Flutter WebView included.
2. **17 files** import it. **Zero** raw `navigate(-1)` / `history.back()` remain.
3. `UserLayout.jsx` inserts Home beneath any non-home screen entered at `idx === 0`
   (deep link, notification tap), so the first back press lands on Home.

Re-implementing would have been duplicate work. **Needs QA input:** does #019 still
reproduce, and on which screen and entry path?

If it does, the likely remaining cause is **the Flutter shell, not the web app** — this
runs in a Flutter `InAppWebView`, and the Android hardware back key must be handled
there via `canGoBack()` / `goBack()`. No web-side change fixes that.

Also noted: `AdminLayout` and `DeliveryLayout` have no equivalent guard. Same crash
likely exists in those modules. Out of scope for the consumer ticket.

---

## #022 — Offline Stores Displayed — **FIXED**

Product chose: **keep offline stores visible with their badge, sort them to the bottom.**
Catalogue depth is preserved during low-supply hours; customers can still see and plan
around a closed store, but open ones always come first.

**Root cause.** `Under250.jsx` interleaved offline stores with open ones (it already
rendered an "Offline" badge and correctly disabled add-to-cart).
`SearchResults.jsx` had **no availability handling at all** — a customer could tap
straight through to a store that could not take the order.

### Files

| File | Change |
|---|---|
| `frontend/src/lib/utils/restaurantAvailability.js` | **New export** `sortOpenRestaurantsFirst()`. Stable partition — open first, offline appended, each group keeping its incoming order. Does not mutate the input. |
| `.../pages/Under250.jsx` | `sortedAndFilteredRestaurants` now ends with `sortOpenRestaurantsFirst(filtered)`. |
| `.../pages/SearchResults.jsx` | `filteredAllRestaurants` now ends with `sortOpenRestaurantsFirst(...)`. |
| `.../pages/SearchResults.jsx` (card) | Offline stores render greyed with an overlay badge, reusing `openingCountdownLabel` so wording matches Under-250. |

### Design notes
- The sort runs **last**, after the user's own sort (rating / delivery time / distance /
  relevance), so their choice still applies within each group.
- **Unknown availability is treated as open.** Missing operating-hours data must never
  demote a store that is actually trading.
- Nothing is removed from the list, so result counts and pagination stay honest.

### To verify
- Take a store offline in BO → in Search and Under-250 it drops to the bottom, greyed,
  badged. It does **not** disappear.
- Open stores keep their relative order under each sort option.
- A store with no operating hours configured still appears among the open ones.
- Tapping an offline store still works; add-to-cart stays disabled (existing behaviour).

---

## Also worth knowing

`git` reported *dubious ownership* on this repo; resolved for this session with:

```bash
git config --global --add safe.directory D:/projects/quick
```
