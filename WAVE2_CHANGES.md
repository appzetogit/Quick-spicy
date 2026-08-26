# Wave 2 — Store Screen. Changes Made

Working tree only. Nothing committed. Branch: `main`.

`npm run build` passes. ESLint on the touched files reports 14 errors — all
pre-existing (`motion` unused, `response` undefined at line 836, etc.), none on
changed lines.

**All six store-screen bugs fixed: REQ#016, REQ#017, REQ#011, REQ#014, REQ#006, REQ#005.**

Almost everything lives in `RestaurantDetails.jsx`, plus one new hook.

---

## REQ#016 — Display All Store Items by Default — **FIXED**

Only the first three categories were expanded on load, so everything from the
fourth down was invisible until the customer found and tapped it. The store looked
half-empty.

**Root cause.** The menu-fetch handler seeded `expandedSections` with
`Array.from({ length: Math.min(3, finalMenuSections.length) })`.

**Fix.** Seeds every section index instead — all categories open on load.

### Open risk — please measure
Expanding everything renders the full menu at once. On a large store this may jank
on mid-range Android. **This was not measured.** If scroll FPS regresses, virtualise
the item list rather than reverting to collapsed sections — the collapsed default is
what caused the bug.

---

## REQ#006 — Correct Price Sorting Behaviour — **FIXED**

"Price: Low to High" sorted *within* each category while the categories themselves
stayed in menu order, so the cheapest item in the store was rarely first.

**Root cause.** `sortMenuItems()` was correct but called per section, at the two
item-render sites.

**Fix — a render-mode switch, not a comparator change.** When `filters.sortBy` is
set, `getFilteredSections()` now returns a **single synthetic section** (`All items`)
containing every item flattened out of its section and subsection. The existing
renderer sorts and paints that one list, so the sort spans the whole store.

Doing it this way reuses the entire existing card renderer — no duplicate markup.

### Details
- New `getAllMenuItemsFlat()` walks sections *and* subsections, tagging each item
  with `sourceCategory`.
- **De-duplicated by item id.** A dish appearing both in its own category and in
  "Recommended for you" would otherwise show twice in a flat list.
- The synthetic section uses sentinel index `FLAT_SORT_SECTION_INDEX = -1`, so it can
  never collide with a real section index.
- It is always expanded and its collapse chevron is hidden — there is nothing to
  collapse into. The header shows "Price: low to high / high to low" instead.
- Each card shows its source category, so context is not lost in the flat list.
- Clearing the sort restores the normal grouped/accordion view.

### Still unresolved — needs a product answer
- **Variants/sizes:** the sort uses the existing `getFinalPrice()`. Nobody has
  confirmed what that returns for a multi-variant item (base price? lowest variant?).
  Worth pinning down and documenting.
- **Unavailable items** are sorted in with everything else. Unchanged from before.

---

## REQ#017 — Automatically Expand Selected Category — **FIXED**

Picking a category scrolled to it but never expanded it, so the customer landed on
a closed header and had to tap again.

**Root cause.** The menu-sheet handler called `scrollIntoView` and never touched
`expandedSections`.

**Fix.** The handler now expands the target section, then queues the scroll via
`pendingCategoryScroll`.

**The scroll timing was also wrong.** The old code used a fixed `setTimeout(300)`,
which fires against the *pre-expansion* layout and lands at the wrong offset. It is
now a double `requestAnimationFrame`, so the scroll runs after the expansion has
actually painted. Frames are cancelled on cleanup.

Once REQ#016 is in, all sections are open anyway — but this still matters for
sections the customer has manually collapsed.

### Judgment call
Picking a category **while a price sort is active clears the sort**. The flat sorted
list has no per-category sections to jump to, and choosing a category reads as an
explicit request for the grouped view. Flag if product disagrees.

---

## REQ#011 — Make Category Navigation Interactive — **FIXED**

The category rows were already clickable. What was missing was any notion of a
*selected* category — the acceptance criteria require it to be visually identifiable.

**Fix.**
- New `activeCategoryIndex` state.
- The selected row in the menu sheet renders highlighted (background + bold brand
  colour) with `aria-current`.
- An **`IntersectionObserver`** keeps the selection in step with manual scrolling, so
  reopening the sheet always shows where the customer actually is — not just where
  they last tapped.

`rootMargin: "-80px 0px -70% 0px"` biases detection towards the top of the viewport,
so the heading nearest the top wins. The observer is skipped while a price sort is
active (no per-category sections exist) and disconnects on cleanup.

---

## REQ#014 — Prevent Background Scrolling When Menu Is Open — **FIXED**

Dragging inside the category sheet scrolled the store menu behind it.

**Root cause.** No scroll lock existed anywhere in the file.

**Fix.** New `src/module/user/hooks/useScrollLock.jsx`, applied to all three sheets
on this screen (`showMenuSheet`, `showFilterSheet`, `showMenuOptionsSheet`).

### Implementation notes
- Uses `position: fixed` + a negative `top` offset, **not** `overflow: hidden` — iOS
  Safari scrolls the body anyway with `overflow` alone.
- **Restores the exact scroll offset on close.** Skipping this makes the page jump to
  top when the sheet is dismissed — the classic regression with this pattern. Test it.
- **Reference-counted** via `data-scroll-lock-depth`, so a filter sheet opening over a
  menu sheet cannot unlock the page early. Previous inline styles are saved and restored.

---

## REQ#005 — Correct Store Address Display — **FIXED**

The store screen showed an address belonging to a different area.

**Root cause — CONFIRMED, and it is not the address formatter.** My guide listed
three hypotheses; it is the stale-state one.

On slug change the effect reset `fetchedRestaurantRef`, `fetchedSlugRef`, and the menu
refs — but **never cleared the `restaurant` state itself**. Navigating from store A to
store B kept rendering **store A's data** until B's fetch resolved, and if that fetch
failed, indefinitely (the code deliberately keeps content visible on retries:
`setLoadingRestaurant(!fetchedRestaurantRef.current && !restaurant)`).

The address is simply the most visible casualty — it is the most location-specific
field on the screen, so a customer immediately notices a street or state from the
store they just came from. Name, offers, and timings were stale in the same window.

**Fix.** The slug-change reset block now also clears `restaurant`, resets the loading
flags, and clears the category/expansion state.

This fires **only when the slug actually changes**, so the deliberate
"keep content visible during background retries of the same slug" behaviour is
preserved. The address formatter was not touched.

### To verify — this is the important one
- Open store A, then navigate directly to store B. B must **never** briefly show A's
  address. This is the reported bug and the primary test.
- Force B's fetch to fail → a loading/error state, **not** store A's details.
- Retry on the same slug (background refresh) → content stays visible, no flicker.

If an address is still wrong after this, it is a **BO data problem** for that specific
store, not a frontend bug. Get the store ID and compare the API payload to the BO record.

---

# Testing this wave

These six interact heavily — all on one screen, several on the same render path.
Please test together, not individually:

1. Open a store with **4+ categories** → every category visible and expanded.
2. Apply **Price: Low to High** → one flat "All items" list, genuinely cheapest first
   across all categories, each card showing its category. No duplicate dishes.
3. Clear the sort → grouped view returns.
4. Open the category sheet → **background must not scroll**. Close it → page stays
   exactly where it was, **no jump to top**.
5. Pick a category → sheet closes, section expands, page scrolls to it, and that row
   is highlighted when the sheet is reopened.
6. Scroll manually, reopen the sheet → the highlighted category matches where you are.
7. Navigate store A → store B → **B never shows A's address**.
8. Open the filter sheet over the menu sheet → scroll stays locked until both close.

**Not done: none of this has been run in a browser.** Everything here is verified by
build and code reading only. The scroll lock, the scroll-spy highlight, and the flat
sort layout all need a real visual pass on a device.

---

# Still recommended

`RestaurantDetails.jsx` is now ~3,700 lines and hosts all six of these fixes. The
menu list, the item card, and the three sheets should be extracted into their own
components before more work lands here. I did not do it as part of this wave — it
would have buried the actual fixes in a large diff and made review harder. Worth its
own ticket.
