# Long lists

A page with a long list: infinite scroll, a feed, a table of thousands of rows, a list the user comes back to. Sources: `docs/long-lists.md` (+ `.ja.md`), `packages/fetch/README.md` §5, `packages/intersection/README.md`, `docs/timing-and-firing-contract.md` §26, the router README "Where route content lives", `docs/seam-apps.md` (town-archive). Verified against wcstack 4.30.0; the infinite-scroll example, the abort on a filter change and the link back to a row's fragment were run in Chromium, Firefox and WebKit. What says 4.24 needs that release; on 4.23 see the notes.

## 1. What costs

`@wcstack/state` does not slow down with the list: one row written at 3,000 rows is about a millisecond, and a getter that walks 12,000 rows through `this.items` is under 0.1 ms. The browser's work on the document grows: a page of 60 cards (about ten elements each) shows in about 20 ms at 120 cards and 30 to 95 ms at 3,000, depending on the browser — and about half as much again with two `<wcs-intersect>` around every card. A few hundred rows in the document are fine; at thousands, render a window (§4).

## 2. Loading a page at a time

```html
<style>wcs-infinite-scroll { display: block; min-height: 1px; }</style>
<wcs-fetch id="page-fetch" manual
  data-wcs="url: nextUrl; loading: listLoading; error: listError; eventToken.value: pageArrived; command.abort: $command.cancelPage"></wcs-fetch>
<ul><template data-wcs="for: items"><li data-wcs="textContent: .name"></li></template></ul>
<wcs-infinite-scroll target="page-fetch" root-margin="240px 0px" data-wcs="disabled: noMore"></wcs-infinite-scroll>
```

```js
export default {
  pageSize: 20, page: 1, items: [], noMore: false, listLoading: false, listError: null, filter: "",
  $eventTokens: ["pageArrived"],
  $commandTokens: ["cancelPage"],
  get nextUrl() { return "/api/items?page=" + this.page + "&limit=" + this.pageSize + "&q=" + encodeURIComponent(this.filter); },
  setFilter(event) {
    this.$command.cancelPage.emit(); // the page on its way is another list's: a manual fetch does not abort on a new url
    this.filter = event.target.value;
    this.items = [];
    this.page = 1;
    this.noMore = false;
  },
  $on: {
    pageArrived(state, event) {
      const { status, value } = event.detail;
      if (status < 200 || status >= 300) return; // a failure: the page number stays
      state.items = state.items.concat(value);
      state.page = state.page + 1;
      if (value.length < state.pageSize) state.noMore = true;
    },
  },
};
```

- The `url` comes from state, never a static attribute for page 1 (the first answer can arrive before state has bound the element).
- 4.24: the sentinel loads the first page when state writes the url, goes on while a page leaves it on screen, never repeats a failed request (the user scrolls away and back, or a retry button writes `trigger`), and stops at a response that added no row. (4.24.0 asked for one page ahead when the user was scrolling as a page landed; 4.24.1 does not.) **On 4.23 it does none of these** — use `<wcs-intersect target="self">` with `eventToken.intersecting:`, a first page asked from `$connectedCallback`, and `command.reobserve:` after each page that lands (never after a failure), as `examples/state-intersect-fetch` does.
- Put the sentinel right after the list, **above** a spinner or a message shown while a page loads, so that only rows move it. A spinner inserted above it when a request starts pushes it out of its margin, a scroll that goes on brings it back, and a request that failed in between is asked again.
- `<wcs-intersect>` is still the element for an edge the page schedules itself (a list that grows at both ends): act on the report, not on a stored flag; ask for the page the list's length says, not `page++`.
- `root` is the element that scrolls (an id or a selector, 4.24); a root that does not scroll counts everything in it as on screen. `root-margin` lengths need `px` or `%`.

## 3. Rows

- Keep the row objects: `items.concat(page)`. A list rebuilt as copies rebuilds every row in the document (focus lost, images decoded again).
- Write one row: `this.$update("items.*.fav", [index], (v) => !v)`.
- A flag per row, not a search per row: keep `fav` on the row (set when the page arrives, from a `Set`) instead of `this.favorites.some(…)` in a row getter. `$eq` is for one selected value; it has no set form.
- Images: native `loading="lazy"`, and the card in the photo's shape (`aspect-ratio`) so nothing moves.
- A per-row `<wcs-intersect>` only for what needs it ("seen"); `threshold="1"` never reports a card taller than the root — use `0.5`.
- A ★ on a card that is a link: the button beside the link, in one wrapper. Handlers are delegated: use the index the handler receives, not `event.currentTarget`.

## 4. A window of rows

For thousands of rows on screen. Row heights known without the document (fixed, or computed from the data); `for:` over a getter that slices the list, in a box as tall as the whole list; the scroll position from one passive `scroll` listener added in `$connectedCallback`, read once a frame and written to state (no wcstack element reports it); the container's width from `<wcs-resize target="self" round>` (a hidden container reports `0`: keep the last real width in a setter). Decide who anchors the scroll: `overflow-anchor: none` on the list when it places its own rows. With `@wcstack/signals`: `For` with a `key`, `current()`, `selector()`, `delegateEvents()` before the table is built. Not worth it below a few hundred rows.

## 5. Coming back

Back restores the position by itself when the list still holds its rows. A link of your own back to a row: navigate to its fragment — `this.navigateUrl = "/#photo-" + id` — not `scrollIntoView()` from a `$watch` (`references/router-and-scaffold.md`). A reload is the page's: keep the filter and the first row on screen in `<wcs-storage type="session">`.
