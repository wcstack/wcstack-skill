---
name: wcstack-app
description: Build web apps, SPAs, and demo pages with wcstack (@wcstack/state, router, signals, and the wcs-* I/O node components such as wcs-fetch / wcs-storage / wcs-ws / wcs-midi / wcs-audio). Follows the project's standards-first, zero-config, buildless principles — one-line CDN loading, then state design → data-wcs binding → I/O node wiring → routing, with exact syntax. Use when the user asks (in any language) to build something with wcstack, wcs-state, data-wcs, wcs-fetch or other wcs-* tags, or a signals-based app (e.g. "build an app with wcstack", 「wcstackでアプリを作って」「wcs-fetchで〜して」). Also covers embedding wcs-* I/O nodes inside a React / Vue / Svelte / Solid app via the wc-bindable adapters. Do NOT use for generic Web Components / Custom Elements questions unrelated to wcstack, for building React / Vue / Lit / NoJS apps that do not touch wcstack, or for developing or modifying the wcstack packages themselves.
metadata:
  wcstack-version: "4.25.0"
---

# Building apps with wcstack

## Overview

wcstack is a family of "standards-first, zero-config, buildless" Web Components packages. An app is correctly a **single HTML file + one-line CDN loads** — do not introduce bundlers, build steps, or npm install unless the user explicitly asks for them. A request for TypeScript or a production build is such a request: keep the state in a `.ts` file and build with Vite and `@wcstack/typescript/vite` (`references/verification.md` §2).

**This skill describes wcstack 4.25.0** (the `wcstack-version` above): every rule here is that release's. A page pinned to an older 4.x release: `references/versions.md`. 3.x code: `references/state-binding.md` §16 and `docs/migration-v4.md` in the wcstack repo. Upgrading a 4.x app: `docs/upgrading-4x.md` in the wcstack repo. If the installed / CDN version is newer than this skill, spot-check syntax against the package READMEs.

What 4.0 changed from 3.x — write the 4.0 form even if you remember the 3.x one:

- **Configuration is split.** `bootstrapState()` takes only notation (`bindAttributeName`, `tagNames`, the anchor-comment prefixes) plus `locale` and `enableContractAnalyzer`; behaviour switches live in each root state as `$behavior: { enableMustache, sameValueGuard, enableDirectionalInitialSync }`. Every package's `bootstrapXxx(config)` throws on an option it does not have (`/auto` passes none).
- **Bubbling `on*:` events are delegated to the root** — `event.currentTarget` is the root. `on*#direct:` keeps a listener on the element.
- **`for:` takes no filters** — loop over a getter. **Writing a list element replaces the value at that position**; reorder by assigning a new array.
- **Volumes (`mount=`) hold data, getters and lifecycle callbacks only** — `$watch` / `$listKeys` / `$renderedCallback` go on the root state.
- **Removed:** `$scan`, the names 3.2 renamed (`uc`, `inc`, `$trackDependency`, `$streams`, …), the `substr` filter, the `@state` selector, and the `bootstrapState()` options `debug` / `commentTextPrefix` / `enablePropagationContext`.
- **A failed `<wcs-state>` reports once (`#49` / `#50`) and rejects `connectedCallbackPromise`** — in 4.0 a page-level markup error stops the whole `<wcs-state>`.

**This file holds the workflow, the invariants and the most frequent failures.** The exact syntax is in references/ next to this file — read the matching one before each phase:

| File | Read before |
|---|---|
| `references/state-binding.md` | writing `<wcs-state>` / `data-wcs` / filters / events / tokens / `$watch` / `$listKeys` / `$eq*` / `$recursion` / components / CSP, SRI and split entries — and its pitfall checklist at the end |
| `references/router-and-scaffold.md` | SPA routing, layouts, guards, `<wcs-link>`, the autoloader, the index.html skeleton and the server fallback |
| `references/io-node-catalog.md` | wiring I/O nodes (52 `wcs-*` tags) or writing a signals app |
| `references/forms.md` | a page that is mostly a form: IME input, fields that format, autofill, reset, rows of inputs, form controls of your own |
| `references/long-lists.md` | a long list: infinite scroll, a feed, thousands of rows, a list the user comes back to |
| `references/device-apis.md` | the screen and the sensors: fullscreen, Picture-in-Picture, pointer lock, orientation and motion, share, contacts, saved passwords |
| `references/islands.md` | a page wcstack does not own (htmx, Turbo) or a widget for other sites' pages |
| `references/frameworks.md` | `wcs-*` elements inside a React / Vue / Svelte / Solid app |
| `references/verification.md` | finishing: the lint in depth, `wcs-schema` / `wcs-tsc`, console messages, DevTools, headless tests, SSR |
| `references/versions.md` | a page pinned to an older 4.x release |

## Workflow

### 1. Pick the stack (state vs signals)

- **`@wcstack/state` (default)** — UI and state connected through `data-wcs` path strings in HTML; no reactive primitives in JS. Forms, lists, CRUD and general apps.
- **`@wcstack/signals`** — `signal()` / `computed()` / `effect()` / `h()` in JS, for users who want no DSL, logic-heavy code or typed signals. No deep path tracking. `references/io-node-catalog.md` §3.
- They coexist, but pick one per app.

### 2. HTML scaffold

```html
<!-- one /auto line per package; @wcstack/state/auto goes LAST -->
<script type="module" src="https://esm.run/@wcstack/fetch/auto"></script>
<script type="module" src="https://esm.run/@wcstack/router/auto"></script>
<script type="module" src="https://esm.run/@wcstack/state/auto"></script>
```

- **State loads last.** A binding on a not-yet-defined element waits for its definition, but a **command-token emit is never replayed**: with state first, a `$command.x.emit()` fired before an I/O element is defined is silently dropped. `@wcstack/devtools/auto` also goes before state. Where you cannot control the order (a pasted snippet, the autoloader), gate the control on `<wcs-defined tags="…" timeout="5000">`'s **`pending`** output (`disabled:`) — never `await customElements.whenDefined()`, which never rejects for a tag that never loads.
- signals apps import **only from `@wcstack/signals/dom`** (mixing `.` and `/dom` duplicates the reactive core).
- An SPA **must have `<base href="/">`** (or the basename, `/ja/`) in `<head>`, and **`<wcs-outlet>` right after its `<wcs-router>`** — to render inside `<main>`, put both there.
- **Always set `<html lang>`** — the locale of the `locale` / `date` / `time` / `datetime` filters, read when state loads.
- **One copy of each package, every wcstack line at one version.** `wcstack/auto` bundles state + router + fetch + storage + autoloader in one file — use it when the app uses that core anyway. Never merge files with jsDelivr `/combine/`.
- `esm.run/@wcstack/<pkg>/auto` follows npm `latest`. To stay on a release, pin it on every line (`@wcstack/state@4.25.0/auto`) and keep `@wcstack/lint` at that version.
- **Production hardening, CSP, SRI and the split entries — only when the user asks**: `references/state-binding.md` §1–2. The one CSP fact that silently breaks a working page: the inline `<script type="module">` inside `<wcs-state>` is imported through a `blob:` URL, so under a strict policy the `<script>` that loads state needs the page nonce — or move the state to `src="./state.js"`.

### 3. State design

State is a plain object, `export default`. Computed values are getters keyed by dot paths (`get "cart.total"()`, `get "users.*.fullName"()`); inside a row accessor `this[".first"]` is the row's own field, and one accessor can serve several lists (`get "users.*.fullName,shown.*.fullName"()`, commas only). Invariants:

- **Write by path, and give lists new arrays.** `this["user.name"] = v`, never `this.user.name = v`; `this.items = this.items.toSpliced(i, 1)` / `concat` / `filter` / `toSorted` / `with`, never `push` / `splice` / `sort` / `items[i] = v` — the DOM stays stale (lint errors). Bulk row writes: `$setAll`; one row from its current value: `$update`.
- **Getters read only through `this`, by the exact path.** The cache follows the dependency graph, which records `this` reads only: a getter reading `Date.now()`, the DOM, `location` or a module variable keeps its first value forever — put that input into state and assign to it. `this.form.name` tracks `form` only — read `this["form.name"]`.
- **Declare every key you write** — a write to an undeclared top-level key silently creates it (`wcs-tsc` / `defineState` typing catches the typo).
- **One state slot per I/O node** (`listFetch: { value: null, loading: false, error: null, status: 0 }`). `for:` needs an array — `get rows() { return this["listFetch.value"] ?? []; }` — and a filtered or sorted view is a getter too.
- **Seed real initial values**: `null` / `false` for what an element outputs (the element is the authority), `false` for a `trigger` slot (any truthy write fires).
- **Behaviour switches** go in each root state that needs them: `$behavior: { enableMustache: false }` — never in `bootstrapState()`.
- **`$listKeys: { items: "id" }`** for a list that is refetched *and* whose rows hold DOM state the bindings do not own (focus, IME, `<details>`, `<video>`) — otherwise that state is shuffled between rows.
- **React to a change nothing renders with `$watch`** (on the root state) — `$renderedCallback` fires only for applied bindings. `$on` handlers are `name(state, event)`, never `this`.
- **An accumulation across events or stream restarts is a key you own**, folded in `$watch` / `$on` with an idempotency key (`references/state-binding.md` §15).
- **A tree of data-decided depth needs `$recursion`** (§14); **a "selected row" flag is `$eqPath` / `$eqIndex`** (§6); **`$errorCallback(error, { path })` on the root state** puts binding failures on the page.

### 4. Bindings → I/O wiring → routing

Four wiring forms between state and an I/O node:

1. Property: `data-wcs="value: users; loading: busy"`
2. Spread: `data-wcs="...: listFetch"` (properties and inputs; never commands or events)
3. Command-token (state → element): `data-wcs="command.fetch: $command.refresh"` + `$commandTokens: ["refresh"]`
4. Event-token (element → state): `data-wcs="eventToken.value: responded"` + `$eventTokens` + `$on`

- **Text**: `{{ }}` inside templates; at page level a comment binding (`<p>Hello, <!--@@: user.name--></p>`) or `textContent:` — page-level `{{ }}` flashes raw braces until state loads.
- **Grammar the runtime refuses** (at page level the `<wcs-state>` then fails to initialize): a structural binding (`for` / `if` / `elseif` / `else`) must be alone in its `data-wcs`; `else:` keeps its colon; one `#` with comma-separated modifiers (`onclick#prevent,stop:`); no filter on `for:` or on a spread; `|` between filters; the `$command.` prefix on a command binding; an `eventToken.` key is the wcBindable property name, not the DOM event name.
- **Events are delegated**: never read `event.currentTarget` in a plain `on*:` handler — use `event.target.closest("li")` or the loop index the handler receives (`remove(event, index)`). Write `on*#direct:` where the listener must sit on the element: pointer capture, the element's own rect, a `#stop` against your own ancestor listener, an element moved under another root.
- **User content is never markup.** Every `{{ }}`, `data-wcs` and comment binding in the page when state binds it is a binding, and HTML-escaping does not neutralize `{{ }}`. Deliver user content through state with a text binding; put markup you did not write in an element marked `data-wcs-ignore`; sanitize before `html:`; validate URLs bound to `href:` / `src:`.
- **Lists**: reorder or filter by assigning a new array — rows move with their objects. A row write inside `for:` over a getter that returns a *filtered copy* does not reach the source list's row bindings (#365): toggle from a handler that reassigns the source list.
- **I/O nodes never throw**: a refused request, a missing API or a network failure ends in `error` / `errorInfo` — bind them and show them. `wcs-fetch:response` fires on HTTP errors too (check `event.detail.status`). A command runs **before** the bindings of its own update: give the url to the command (`this.$command.load.emit(url)`), or write the inputs and fire `trigger` (bindings apply in the order written). Live handles (`MediaStream`) go element to element through `eventToken` → `$command.attachStream`, never through state.
- **Routing**: on a router page use `<wcs-link to="…">`, not `<a>`; a route that must not render empty loads its data in a **guard** (an object return lands in `<wcs-router>.data`); wrap text `{{ }}` directly under `<wcs-route>` in an element; a guard is evaluated from a `blob:` URL — no static `import` (`references/router-and-scaffold.md` §4).
- **Animation**: enter is plain CSS (`@starting-style`); leave and move need `<wcs-view-transition>` (one per document).
- **A custom element with its own state**: DCC (`data-wc-definition`, no JS class) **or** `bind-component` (a class you already write; mount a subtree with `data-wcs="state: user"`) — never both (`references/state-binding.md` §12). In `@wcstack/audio`, structural attributes (`out` / `param` / `note` / `poly`) rebuild the graph — bind numeric params only.

### 5. Verify — the lint is a completion gate (MUST)

Do not present the app as finished until **`npx @wcstack/lint --errors-only <every html file> <sidecars>` exits `0` and every warning of a run without `--errors-only` is fixed or explained to the user** (why it does not apply here). wcstack's failure model is "wrong wiring fails silently", so a page you have only eyeballed is unverified.

```bash
npx @wcstack/lint index.html                 # while authoring: generate → lint → fix → re-lint
npx @wcstack/lint --errors-only index.html   # the final gate
```

- Pass every HTML file and `wcstack.manifest.json` sidecar; `<wcs-state src>` files are read automatically. Files listed under `not read:` / `nothing to check:` are not verified — a framework app is checked in the browser.
- Each diagnostic names its `wcs/<code>`, a `source:line:col` range and the fix. A warning can be a real defect (`wcs/binding-path-missing` is a column left empty).
- **Runtime messages carry the same `[wcs/<code>]`**: run the lint and fix every instance, not just the one that threw. The console's checks under-approximate — no warning proves nothing.
- With a TypeScript state and its generated `stateSchema`, run `npx wcs-schema check <state.ts>` before the lint: the schema wins over the script, so a stale one checks the HTML against the old names.
- If the lint cannot run (offline, no npx), say so explicitly.
- Then run the page in a browser (a tiny server if it fetches; an SPA needs the "every extensionless GET returns index.html" fallback).
- TypeScript states (`wcs-schema`, `wcs-tsc`), reading console messages, DevTools coverage, headless tests and SSR: `references/verification.md`.

### 6. wcs-* nodes in a React / Vue / Svelte / Solid app

A supported path through the `@wc-bindable/*` adapters (0.9+), with no `data-wcs` or `@wcstack/state`: import each element's definition before the app renders, pass objects as properties, post plain copies of reactive values, read `message`-like outputs from the element's events, and call commands instead of driving `trigger`. Rules and traps: `references/frameworks.md`.

## Cheat sheet

```html
<div data-wcs="textContent: user.name"></div>            <!-- text -->
<p>Hello, <!--@@: user.name--></p>                        <!-- page-level text, no FOUC -->
<input data-wcs="value: form.email">                     <!-- two-way -->
<input type="checkbox" data-wcs="checked: done">
<div data-wcs="class.active: isActive; style.color: color; attr.href: url"></div>
<!-- class.* wants a boolean (|truthy to coerce); undefined/null remove it -->
<button data-wcs="onclick: save; disabled: saving">Save</button>   <!-- delegated: currentTarget is the root -->
<form data-wcs="onsubmit#prevent: submit">
<div data-wcs="onpointerdown#direct: dragStart"></div>    <!-- needs event.currentTarget: listener on the element -->
<template data-wcs="if: items.length|gt(0)">...</template>
<template data-wcs="else:">...</template>                <!-- trailing colon required -->
<template data-wcs="for: items"><li>{{ $1|add(1) }}. <span data-wcs="textContent: .name"></span></li></template>
<!-- never children inside a textContent:/innerHTML:/html: element — they are not bound -->
<template data-wcs="for: openItems">...</template>       <!-- for: takes no filters — loop over a getter -->
<user-card data-wcs="state: user"></user-card>                      <!-- mount subtree as component root -->
<wcs-fetch data-wcs="...: usersFetch"></wcs-fetch>                  <!-- spread -->
<wcs-fetch data-wcs="command.fetch: $command.reload"></wcs-fetch>   <!-- command-token -->
<my-el data-wcs="eventToken.value: responded"></my-el>              <!-- event-token -->
```

```javascript
export default {
  // $behavior: { enableMustache: false },                     // behaviour switches (each defaults to true) live here, never in bootstrapState()
  items: [],
  usersFetch: { value: null, loading: false, error: null, status: 0 },
  loadError: "",
  selectedId: null,
  log: [],                                                     // an accumulation is a key you own
  get rows() { return this["usersFetch.value"] ?? []; },       // for: needs an array
  get openItems() { return this.items.filter((i) => !i.done); },   // a filtered view is a getter
  get "items.*.label"() { return this[".name"]; },             // row accessor: a relative path is the row's own field
  get "items.*.selected"() { return this.$eqPath("selectedId", "items.*.id"); },  // keyed selection (selectedId: a primitive)
  add() { this.items = this.items.concat({ id: Date.now(), name: "new" }); },     // new array + path assignment
  remove(e, i) { this.items = this.items.toSpliced(i, 1); },   // (event, ...loopIndexes) — not e.currentTarget
  toggleAll(e) { this.$setAll("items.*.done", [], e.target.checked); },  // bulk write, keeps the array
  $commandTokens: ["reload"],
  $eventTokens: ["responded"],
  $on: { responded(state, ev) { /* check ev.detail.status first */ state.log = [...state.log.slice(-19), ev.detail]; } },  // fold events here, bounded
  $listKeys: { items: "id" },   // keep row DOM state across a refetch
  $watch: { "items.*.name"(cur, prev, i) { /* headless — fires with no DOM binding */ } },
  $errorCallback(error, { path }) { this.loadError = `${path}: ${error.message}`; },  // in-page error boundary
};
```

Full syntax (modifiers, the built-in filters, nested loops, `$getAll` / `$resolve`, spread rules): `references/state-binding.md`.

## The most frequent failures (most break without an error)

Run the lint first (§5); then check the page against this table. Each reference ends with the failures of its own area — `references/state-binding.md`'s pitfall checklist above all.

| Mistake | Symptom | Correct form |
|---|---|---|
| `this.user.name = v` | DOM stays stale (lint `wcs/nested-assign`, error) | `this["user.name"] = v` |
| `push` / `splice` / `sort` / `this.items[0] = v`, also through an alias and written back | No row is added, removed or replaced — rows follow only a new array (lint `wcs/array-mutation`, error) | `toSpliced` / `concat` / `filter` / `toSorted` / `with`, or `this["items.0"] = v` |
| A write to an undeclared top-level key (`this.cuont = 1`) | Creates the key; nothing renders it | Declare every key; `wcs-tsc` catches the typo |
| A getter reading `Date.now()`, `location`, the DOM, a module variable — or `this.form.name` | Keeps its first value forever / never re-runs when `form.name` changes | Put the input into state (bind `<wcs-router>`'s `path` / `searchParams` for the URL); read `this["form.name"]` |
| `event.currentTarget` in a plain `on*:` handler | It is the root: `getBoundingClientRect`, `new FormData(e.currentTarget)` act on the wrong node | `event.target.closest(…)` or the loop index; `on*#direct:` where the element itself is needed |
| `for:` over `null` / a non-array, or with a filter (`for: items\|take(2)`) | No rows / throws `#121` and the `<wcs-state>` fails to initialize | A getter: `?? []`, or one that returns the filtered list |
| `$on: { name(event) { this.x = … } }` | `this` is undefined and the first argument is the state | `name(state, event) { state.x = … }` |
| `$renderedCallback` as a watcher | Never fires for a path no live binding renders | `$watch: { path(cur, prev) { … } }` |
| `@wcstack/state/auto` before an I/O package's `/auto` | A `$command.x.emit()` in the load window reaches no one and is dropped | Every I/O `/auto` first, state last; `<wcs-defined>`'s `pending` where the order is not yours |
| An SPA without `<base href>`; `<wcs-outlet>` away from its `<wcs-router>` | Deep links break; the router makes its own outlet and pages render above the header | `<base href="/">` in `<head>`; the outlet right after the router |
| `<wcs-storage>` `value` bound without `#init=element` | The seed is saved over the stored value on every load — data loss (lint error) | `value#init=element: slot`, seeded `null` |
| An I/O node with no failure output bound; `wcs-fetch:response` read as success | A refused or failed request does nothing visible; the response event fires on HTTP errors too | Bind `errorInfo` and show it; check `event.detail.status` |
| `url` / `body` written and `command.fetch:` emitted in one handler | The request carries the values from **before** the change | `this.$command.load.emit(url)`, or write the inputs and fire `trigger` |
| Waiting for the same value again (a `$watch` on `status` to see a second `DELETE` finish) | The same-value guard skips it — nothing fires | `eventToken.value` + `$on` (every response), or `loading` going `true` → `false` |
| A property whose name starts with `on` (`once:` on `<wcs-timer>`) | Becomes an event binding; the value never arrives (lint `wcs/on-prefixed-member`) | The explicit property form: `.once:` |

## Minimal template (starting point)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script type="module" src="https://esm.run/@wcstack/state/auto"></script>
</head>
<body>
<wcs-state>
  <script type="module">
    export default {
      count: 0,
      countUp() { this.count++; }
    };
  </script>
</wcs-state>
<p>Count: <!--@@: count--></p>
<button data-wcs="onclick: countUp">+1</button>
</body>
</html>
```

For a full SPA with fetch wiring and layouts, start from the router-spa skeleton in `references/router-and-scaffold.md` §7.
