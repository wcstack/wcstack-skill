# wcstack on a page it does not own — islands and widgets

Sources: `docs/islands.md` (+ `.ja.md`), `packages/state/README.md` "Inserting markup yourself" and "Mounting Additional State", `docs/binder-protocol-design.md` §10, `docs/scoped-custom-element-registries.md`, `packages/state/src/features/release.ts`, `packages/state/src/features/diagnostics.ts`, and the `community-hall` seam app in `docs/seam-apps.md` (a CMS site with htmx 2, five islands, a widget on a Turbo site that runs wcstack 4.17). All verified against the actual files at v4.22.0; the htmx and Turbo frame snippets below were run in Chromium.

Read this before adding wcstack to a server-rendered site whose pages come from another template language and are swapped by htmx or Turbo, or before writing a widget that other sites paste into their pages. Everything else in this skill still applies inside the island.

## 1. Where the root goes

- **One root `<wcs-state>` per page, inside the body the navigator swaps** (htmx's `hx-boost`, Turbo Drive). The old root leaves with the old body; the new page's root binds the new page. Every island of the page is a key of that one state (`booking.*`, `filter.*`) — separate roots on one document collide (`[wcs/second-root]`, `#47`, the winner depends on load timing).
- **Never keep the root across a swap** (`hx-preserve`): the old root stays bound to the old page and the new page's markup is never walked.
- **What the server knows about the page** reaches the state as data: a `<script type="application/json" id="page-seed">` read in `$connectedCallback`, or a volume with `json=`.
- **A state module loaded with `src=`** is fine on every page since 4.20: each `<wcs-state>` naming it gets its own evaluation. On a page pinned to 4.19 or earlier, they shared one object — build the state inline from a factory instead.
- **The server's template language uses `{{ }}` too:** declare `$behavior: { enableMustache: false }` and write bindings as `data-wcs` and comment bindings (`<!--@@: total|locale-->`). Never put wcstack's `{{ }}` inside such a template — the server renders it first. The lint follows the declaration since 4.20.

## 2. Markup another library inserts

The state walks its root once. Markup inserted later — an htmx swap into `#results`, a Turbo frame, an `innerHTML` — keeps its `data-wcs` and does nothing until it is handed to the binder (since 4.20 the diagnostics warn `[wcs/inserted-unbound]` a second later).

```js
const binder = () => globalThis[Symbol.for("wcstack.binder")];
const REGIONS = "#results, #booking";   // the regions the page's htmx swaps into

// htmx: htmx:load for each element a swap inserted; htmx:beforeCleanupElement for each it removes
document.addEventListener("htmx:load", (e) => {
  if (e.detail.elt.parentElement?.closest(REGIONS)) binder()?.bind(e.detail.elt);
});
document.addEventListener("htmx:beforeCleanupElement", (e) => {
  // a region's own children — what the server rendered there first too, which the page walk bound
  if (e.detail.elt.parentElement?.matches(REGIONS)) binder()?.release?.(e.detail.elt);
});

// Turbo frames: the frame element stays and its children are replaced
document.addEventListener("turbo:before-frame-render", (e) => {
  for (const el of e.target.children) binder()?.release?.(el);
});
document.addEventListener("turbo:frame-render", (e) => {
  for (const el of e.target.children) binder()?.bind(el);
});
```

- **Hand over the new nodes, never their container.** An element the walk visited is left alone, with everything in it: `bind(#results)` after a swap into `#results` binds nothing.
- **A `for:` / `if:` template at the top of a fragment** is not rendered when handed over (`#204`): put it inside an element.
- **`release(subtree)`** (4.20, binder protocol version 2, the `release` add-on — in `/auto` and `.`; a `/core` page installs `@wcstack/state/features/release`) lets go of a subtree thrown away for good — whatever is bound under it, handed over or bound by the page walk (the server's first results). Without it, every set of results ever shown stays bound and every change writes into all of them. Released nodes are not bound again — hand over new markup. Never release content that comes back.
- **The binder is `undefined` until `@wcstack/state` has loaded**; markup inserted before that is bound by the first walk.
- **htmx attributes inside a `for:` / `if:` template** do nothing (rows are cloned after htmx processed the page), and a bound `attr.hx-get:` is not seen either. Keep `hx-*` outside wcstack templates.
- **htmx acts during the event's dispatch; bindings apply a microtask later.** Decide in htmx's own events (`htmx:confirm`), not on an attribute a binding sets.
- **One owner per element:** never let the server replace an element a binding renders (`hx-swap-oob`) — the new element is not bound.

## 3. History caches

htmx's history snapshot and Turbo's snapshot cache restore a page **as drawn**: no `<template>` left, comment bindings turned to text — it looks right and never updates (since 4.20 the diagnostics warn `[wcs/rendered-copy]`). On pages with islands, turn the cache off so that Back loads the page from the server:

```html
<body hx-boost="true" hx-history="false">
<!-- Turbo -->
<meta name="turbo-cache-control" content="no-cache">
```

## 4. A widget on another site's page

A page defines `<wcs-state>` once: the first copy of `@wcstack/state` it evaluates defines it, a second copy does nothing (`[wcs/package-twice]`). A widget that loads `/auto` on a page that runs wcstack therefore runs on the page's copy, of whatever version. Give the widget a shadow root with a scoped registry and define wcstack's tags into it — every package's `bootstrapXxx(config, registry)` takes the registry:

```js
import { bootstrapState } from "https://esm.run/@wcstack/state@4.22.0";
import { bootstrapSse } from "https://esm.run/@wcstack/sse@4.22.0";

let registry = null;
function widgetRegistry() {
  if (registry === null) {
    registry = new CustomElementRegistry();
    bootstrapSse(undefined, registry);
    bootstrapState(undefined, registry);
  }
  return registry;
}

class PartnerWidget extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const shadow = this.attachShadow({ mode: "open", customElementRegistry: widgetRegistry() });
    shadow.innerHTML = `<wcs-state src="${new URL("./widget-state.js", import.meta.url)}"></wcs-state>…`;
  }
}
customElements.define("partner-widget", PartnerWidget);
```

- Import the main entries (they export `bootstrapXxx`), never `/auto` (it defines into the page's global registry), and pin the version.
- The shadow root is the widget's own root: one state tree beside the page's, and neither stylesheet reaches the other.
- Scoped registries ship in Chrome / Edge 146 and Safari 26; **Firefox has not shipped them** — where `new CustomElementRegistry()` throws, show a fallback (a link to the full page) rather than run on the page's copy.
- Turbo's snapshot is a clone, and a clone has no shadow root: the widget starts again in `connectedCallback`. Under `data-turbo-preview` on `<html>` show a placeholder.

## 5. Checking

- The lint reads templates in which `{{ }}` is the server's syntax, and fragments without a `<wcs-state>` (`wcs/state-absent` since 4.20 — their paths are not checked). To check a fragment's paths, lint the pages as rendered: render through the server, put each fragment into its page, run `npx @wcstack/lint --root=<public dir>` on the result.
- A main-flow e2e test that fails on any console warning catches `[wcs/inserted-unbound]` and `[wcs/rendered-copy]`.
- `@wcstack/testing` imports a state module anew for each `mount()`, so page-to-page flows (a second page, a second instance) belong in a browser test.
