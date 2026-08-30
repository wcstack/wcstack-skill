---
name: wcstack-app
description: Build web apps, SPAs, and demo pages with wcstack (@wcstack/state, router, signals, and the wcs-* I/O node components such as wcs-fetch / wcs-storage / wcs-ws / wcs-midi / wcs-audio). Follows the project's standards-first, zero-config, buildless principles — one-line CDN loading, then state design → data-wcs binding → I/O node wiring → routing, with exact syntax. Use when the user asks (in any language) to build something with wcstack, wcs-state, data-wcs, wcs-fetch or other wcs-* tags, or a signals-based app (e.g. "build an app with wcstack", 「wcstackでアプリを作って」「wcs-fetchで〜して」). Also covers embedding wcs-* I/O nodes inside a React / Vue / Svelte / Solid app via the wc-bindable adapters. Do NOT use for generic Web Components / Custom Elements questions unrelated to wcstack, for building React / Vue / Lit / NoJS apps that do not touch wcstack, or for developing or modifying the wcstack packages themselves.
metadata:
  wcstack-version: "1.32.0"
---

# Building apps with wcstack

## Overview

wcstack is a family of "standards-first, zero-config, buildless" Web Components packages. An app is correctly a **single HTML file + one-line CDN loads** — do not introduce bundlers, build steps, or npm install unless the user explicitly asks for them.

Content verified against **wcstack v1.32.0** (READMEs, examples, and source as of 2026-08). If the installed/CDN version is much newer, spot-check syntax against the package READMEs.

Generated-code accuracy lives in the exact syntax. **This file holds only the workflow, a cheat sheet, and the failure-mode matrix**; full syntax is split into references/ next to this file. Read the matching reference before entering each phase:

| File | Read before |
|---|---|
| `references/state-binding.md` | writing `<wcs-state>` / `data-wcs` / filters / command- & event-tokens / `$listKeys` / `$watch` / DCC vs `bind-component` / CSP + SRI loading |
| `references/router-and-scaffold.md` | writing SPA routing / autoloader / index.html scaffold / server |
| `references/io-node-catalog.md` | wiring I/O nodes (51 wcs-* tags) or writing a signals app |

## Workflow

### 1. Pick the stack (state vs signals)

- **`@wcstack/state` (default)** — UI and state connected through `data-wcs` path strings in HTML; no reactive primitives appear in JS. Forms, lists, CRUD, and general apps go here.
- **`@wcstack/signals`** — write `signal()` / `computed()` / `effect()` / `h()` directly in JS. Choose it when the user wants no DSL, logic-heavy code, or typed signals. It has no deep path tracking (that is state's job). When the app owns its I/O nodes, reach for `mountNode(tag)` (v1.23+) or bind a `XxxCore` directly instead of `whenDefined` + `bindNode` — see the decision table in `references/io-node-catalog.md` §3.
- The two **coexist** (not rivals), but pick one per app as a rule.

### 2. HTML scaffold (CDN loading rules)

```html
<!-- state family: one /auto line per package. @wcstack/state/auto goes LAST —
     module scripts execute in document order, so every wcs-* element is defined
     before state wires anything to it. -->
<script type="module" src="https://esm.run/@wcstack/fetch/auto"></script>
<script type="module" src="https://esm.run/@wcstack/router/auto"></script>
<script type="module" src="https://esm.run/@wcstack/state/auto"></script>
```

- **State loads last — this is a real rule, not tidiness.** A property/spread binding on a not-yet-defined element is deferred via `customElements.whenDefined` and re-applied with the latest value, so nothing is lost there. **A command-token emit is never replayed**: its subscription is deferred the same way, so if state is wired first and a slow (or failed) CDN fetch leaves an I/O element undefined, a click that fires `$command.x.emit()` inside that window reaches zero subscribers and is silently dropped. Loading state last closes the window. `@wcstack/devtools/auto`, if used, goes before state too — that one lint enforces as `wcs/script-order`; the I/O-node case is not lint-checked, so it is on you.
- **When you cannot control the order** — a snippet pasted into a larger page, or tags arriving via `@wcstack/autoloader` — gate the emitting control with `<wcs-defined>` (load `@wcstack/defined/auto` too):

  ```html
  <wcs-defined tags="wcs-tilt,wcs-accelerometer" timeout="5000"
    data-wcs="defined: sensorsReady; pending: sensorsPending; missing: sensorsMissing"></wcs-defined>
  <button data-wcs="onclick: startGame; disabled: sensorsResolving">Start</button>
  <!-- get sensorsResolving() { return this.sensorsPending.length > 0; } -->
  ```

  Gate on **`pending`**, not `defined`: a timed-out package lands in `missing`, which should usually release the control into a degraded mode rather than lock the user out (a late arrival is still promoted out of `missing`). Do **not** `await customElements.whenDefined(tag)` inside the handler instead — it never rejects for a tag that is never registered, so a failed import parks the handler forever, and the handler stops being synchronous (which breaks iOS gesture-gated permission calls).
- signals apps import **only from the single `@wcstack/signals/dom` entry** (mixing `.` and `.dom` on a CDN page duplicates the reactive core and breaks reactivity at the seam; lint: `wcs/signals-dual-entry`).
- An SPA **must have `<base href="/">` in `<head>`** (otherwise deep links break: basename gets misderived from the URL).
- **Always set `<html lang>`** — as of v1.32 it is the default locale for the locale-dependent filters (`locale` / `date` / `time` / `datetime`; explicit `bootstrapState({ locale })` still wins). Changing `config.locale` later re-renders nothing, so the language must be set before the page renders.
- The bare-name `wcstack` npm package is the **SPA-core bundle as of v1.32** (it was documentation-only before): `wcstack/auto` = state + router + fetch + storage + autoloader pre-linked into one self-contained file (~61 KB gzip, one request, one SRI hash). Use it when the app uses the SPA core anyway; per-package `/auto` tags stay the default (they fetch in parallel — no waterfall) and pay only for what the page uses. Loading both is safe (first evaluated copy wins; the other is inert). **Never merge files yourself via jsDelivr `/combine/`** — concatenated minified ESM does not even parse (top-level identifier collisions), and jsDelivr itself forbids SRI on it.
- **Production / CSP (v1.26+)** — only when the user asks for hardening; `esm.run` stays the default for demos and prototypes. Pin the version and use the direct jsDelivr path so `integrity` works: `<script type="module" src="https://cdn.jsdelivr.net/npm/@wcstack/state@1.32.0/dist/auto.min.js" integrity="sha384-…">`. `dist/auto.min.js` has zero static imports, so one hash covers the whole runtime; digests ship in the GitHub Release (`sri.json`), never taken from the CDN's own API. `esm.run` cannot be hashed (it redirects to a re-bundling `+esm` endpoint) and costs two CSP hosts. **The one CSP fact that silently breaks a working page: the inline `<script type="module">` inside `<wcs-state>` is imported through a `blob:` URL, so a strict policy needs `script-src blob:` — a page nonce does not help. Move the state to `src="./state.js"` instead.** Route guards are blob:-only with no `src=` escape. Details in `references/state-binding.md` §1–2.

### 3. State design (state family)

State is a plain object `export default`. Computed values are getters keyed by dot-path strings (`get "cart.total"()`, wildcard `get "users.*.fullName"()`). Decide up front:

- **Getters read only through `this`.** The cache is invalidated solely via the dependency graph, and the graph records only `this` reads — a getter reading `Date.now()`, the DOM, or a module variable keeps its **first value forever** with no warning. Put the untracked input into state and assign to it (`this.now = Date.now()` on a timer), or use `$trackDependency` / `$postUpdate`. Details: `references/state-binding.md` §6.
- One state slot per I/O node (`listFetch: { value: null, loading: false, error: null, status: 0 }`)
- `for:` requires an array — wrap nullable sources in a derived getter: `get rows() { return this["listFetch.value"] ?? []; }`
- Never seed convenient initial values into output-only element properties (the element is the authority; seed real initial values like `null` / `false`)
- **Declare `$listKeys` (v1.26+) for any list that is refetched *and* whose rows hold DOM state the bindings do not own** — focus, IME composition, `<details>` open/closed, in-row scroll, `<canvas>`, `<video>.currentTime`. A `fetch().json()` refresh produces all-new objects, so value-based row identity fails and that state is shuffled between rows, not merely lost: `$listKeys: { items: "id" }` keeps the row objects and writes only the changed fields. Skip it for plain text lists.
- **React to a state change nothing renders with `$watch` (v1.27+)** — `$updatedCallback` only reports paths whose live DOM bindings were applied, so "when this value changes, do X" without a binding belongs in `$watch: { path(cur, prev) {...} }`. It also watches computed getters (which turn eager). Two conditions carry the design: a wildcard row watch is headless only with `$listKeys` (or a rendered `for`), and a `$`-path (`$streamStatus.<n>`) cannot be a key — mirror it through a non-`$` getter. Full contract: `references/state-binding.md` §10.

### 4. Bindings → I/O wiring → routing

Read the references, then write. Four wiring forms between state and I/O nodes:

1. Property binding: `data-wcs="value: users; loading: busy"`
2. Spread: `data-wcs="...: listFetch"` (all wcBindable properties + inputs; commands/events excluded)
3. Command-token (state → element): `data-wcs="command.fetch: $command.refresh"` + `$commandTokens`
4. Event-token (element → state): `data-wcs="eventToken.value: responded"` + `$eventTokens` + `$on`

Positive rules with no failure-mode row below: use `<wcs-link to="...">` instead of raw `<a>` (basename handling + `active` class + `aria-current="page"`); wire live handles (MediaStream etc.) element-to-element via `eventToken` → `$command.attachStream`, never through state; `trigger` is a momentary input property, not a command — any truthy write fires (no edge detection, and it bypasses `manual`), so seed its slot with `false`. Exception: on `wcs-debounce`/`wcs-throttle`, `trigger` IS a command. For animations: **enter** is plain CSS (`@starting-style` on the inserted element — no package needed); only **leave and move** need `<wcs-view-transition>` (v1.32+, a policy node, one per document — `for="router"` keeps state's drain timing untouched, `naming="auto"` names list rows for `::view-transition-*` CSS; see `references/io-node-catalog.md`).

Two shapes that sit outside those four forms:

- **Giving a custom element its own state** — pick exactly one mechanism, they are exclusive as of v1.26 and combining them errors: **DCC** (`data-wc-definition`, HTML only, declares `$bindables` + `$commands: ["bumpBy"]` so the parent can `command.bumpBy: $command.bump`) when there is no JS class, **`bind-component`** (path mapping, no `wcBindable`, so no spread and no command tokens) when you are already writing one. Decision table: `references/state-binding.md` §12.
- **`@wcstack/audio` (v1.25+)** — markup nesting *is* the signal graph. Only numeric params are bindable; `id` / `out` / `param` / `note` / `poly` are structural, and changing one **rebuilds the graph and audibly cuts every sounding voice**. Read `references/io-node-catalog.md` §1.1 before writing a patch.

### 5. Server and verification

- **The lint loop is a completion gate, not a suggestion (MUST).** Do not present the app as finished until `npx @wcstack/lint --errors-only <every html file> <sidecars>` exits `0`. The loop is generate → lint → fix → re-lint; wcstack's whole failure model is "wrong wiring fails silently" (see the matrix below), so a page you have only eyeballed is unverified by definition. If lint cannot run (offline, no npx), say so explicitly instead of skipping it silently.
- **Lint every generated HTML file before browser testing**. During authoring, keep warnings visible:

  ```bash
  npx @wcstack/lint index.html
  ```

  Pass every generated HTML file and `wcstack.manifest.json` sidecar as separate arguments when the app has more than one file. **External state files referenced by `<wcs-state src="...">` (`.json` / `.js` / `.ts`) are resolved automatically as of v1.28** — relative to the HTML, never URLs or absolute paths — so do not pass them as arguments, and expect a page whose paths could not be checked before (e.g. the CSP-driven `src="./state.js"` form) to surface real errors once its state resolves. Read the stable `wcs/*` diagnostic codes and `source:line:col` ranges, fix all errors and actionable warnings, then rerun. The CLI machine-checks the real contracts — `data-wcs` syntax / filters / state paths, wcs-* tag members (`command.` / `eventToken.` keys included, with typo suggestions), non-reactive nested/array mutations, `trigger` slots seeded `true`, storage seed clobber, missing `<base href>`, and signals dual-entry. The analyzer follows `$listKeys` (so `for: items.*.children` validates even when `items` starts `[]`). The `$watch` codes (v1.27+) are worth fixing on sight, because a `$watch` typo does not fail visibly the way a binding typo does, it just never fires: `wcs/watch-declaration-invalid` (error — an `@` cross-state key, a `$`-prefixed key, an empty path segment, a non-function handler, or — v1.29 — a whole `$watch` value that is definitely not an object) and `wcs/watch-path-missing` (warning — the key is absent from the state definition). v1.29 also lint-checks the structural single-binding rule (`wcs/template-syntax`): `for` / `if` / `elseif` / `else` sharing one `data-wcs` with any other binding is the shape the runtime raises on. v1.30 adds `wcs/spread-no-bindable` (error): a spread (`...: x`) on a built-in tag that has no `wcBindable` at all — the helper tags `wcs-fetch-header` / `wcs-fetch-body` / `wcs-infinite-scroll` / `wcs-voice` — which the runtime rejects at bind time. **v1.31 raises the non-reactive assignment family — `wcs/nested-assign` / `wcs/array-mutation` / `wcs/array-index-assign` — from warning to error**, so `--errors-only` now exits `1` on them: they always drop the update, so shipping one unnoticed costs more than failing CI. v1.31 also adds four semantic checks carrying the same codes the runtime raises with: `wcs/index-arity` (`$resolve` / `$getAll` index count vs the path's `*` count), `wcs/wildcard-rank` (a path's `*` count and `$N` vs the enclosing `for` nesting), `wcs/getter-cycle` (path getters in a dependency cycle), and `wcs/updated-callback-unbound` (`$updatedCallback` testing a path nothing binds — the static form of the "delete one display element and the feed stops" accident). v1.32 adds `wcs/aria-attr-unknown`: an `attr.aria-*` binding to an attribute name that is not real WAI-ARIA — `setAttribute` writes it happily and assistive technology ignores it — reported with a did-you-mean.
- **Runtime errors echo the lint loop (v1.28+)**: misspelled filters, undeclared tokens, bad `$watch` shapes, and DCC `$bindables` / `$commands` typos now raise with a stable `[wcs/...]` code, a did-you-mean candidate (same edit-distance criterion as the CLI), and a pointer to `npx @wcstack/lint`. A bracketed code in the console means lint reproduces the same finding with a `source:line:col` range — run it and fix every instance, not just the one that threw. **v1.31 extends this to wired paths**: a bound path that provably does not resolve gets one `console.warn` at binding time (`wcs/binding-path-missing`, with did-you-mean), and a top-level typo throws with the same wording instead of an internal message. The check under-approximates on purpose — `null` parents, rows of an empty list, intermediate getter returns, mapped `bind-component` children and `$` namespaces stay silent — so **no warning proves nothing**; only lint checks exhaustively.
- **When wiring is silent and lint is clean, use the devtools coverage tab (v1.29+)**: load `@wcstack/devtools/auto` (before state) and open the wiring pane's coverage view. It joins declared against measured — `$watch` paths (fired ×N / never / *prerequisite-missing* when a wildcard's list is neither `for`-bound nor `$listKeys`-declared; v1.30 states it assertively: "this watch can never fire"), command/event tokens (emitted ×N / never), and bindings (attached / never-attached) — which is exactly the "declared but silently dead" class the matrix below describes.
- **Use the quiet form only as the final CI gate**:

  ```bash
  npx @wcstack/lint --errors-only index.html
  ```

  Append other HTML files and `wcstack.manifest.json` only when they exist. `--errors-only` (alias `--quiet`) hides warning/info lines but does not change their counts or the exit code. Exit `0` means no error-severity diagnostics (warnings may still exist), `1` means one or more errors, and `2` means invalid usage or a file-read failure. Messages follow the environment locale; use `--lang=ja` or `--lang=en` to force it. In VS Code, the WcStack IntelliSense extension shows the same diagnostics and ranges inline — plus, as of v1.29, hover (path kind/type/owner, filter signatures, modifier semantics), go-to-definition (F12 from a path into the state script; `$command.<n>` jumps to `$commandTokens`), find-references in both directions, and inlay hints (`for`-shorthand expansion `.name = users.*.name`, filter-chain result type `→ string`, and — v1.30 — the expansion size of a spread on a built-in tag, `...: slot → 13 props`). Since v1.31 the IDE resolves `<wcs-state src>` external state too (the CLI-only asymmetry is gone — diagnostics and completion both read the file). The extension also ships `wcs.html-data.json` (VS Code HTML custom data generated from the wcBindable catalog) — other editors get `wcs-*` tag/attribute completion by copying it into the project and listing it under the `html.customData` setting.
- A static single page needs no server (recommend a tiny server if it fetches).
- An SPA needs the fallback "every extensionless non-API GET returns index.html" (implementation in router-and-scaffold.md §7).
- After finishing, do a minimal run in a browser or via a tiny server. For working references, see `examples/` (multi-package demos) and `packages/*/examples/` (single-package demos) in the wcstack repo.
- **When the user wants automated tests, the page is testable headlessly with vitest + happy-dom — no test-only API, no build.** Setup file: `bootstrapState(); URL.createObjectURL = undefined as any;` (the second line routes inline `<script type="module">` state through the `data:` loader; without it the state never finishes loading under Node). Test: `document.body.innerHTML = html` → `await stateEl.connectedCallbackPromise` → `await getBindingsReady(document)` → assert → `await stateEl.createStateAsync("writable", async (s) => { s.count = 42; })` (or `button.click()` for a handler) → `await new Promise(r => setTimeout(r, 0))` → assert. Use `json=` or the inline script for state; write arrays reactively (`s.items = [...s.items, x]`, never `push`). `renderToString()` from `@wcstack/server` gives a snapshot test. Full recipes, including bare Node via `installGlobals()` from `@wcstack/server` (dynamic-import `@wcstack/state` **after** it): [state README → Testing Your Page](https://github.com/wcstack/wcstack/blob/main/packages/state/README.md#testing-your-page); a short version is in state-binding.md §13.

### 6. Embedding wcs-* nodes in a React / Vue / Svelte / Solid app

This is a supported path as of v1.24 (`docs/framework-adapter-integration.md`): every I/O node implements wc-bindable, so a thin adapter (`@wc-bindable/react`, `/vue`, `/svelte`, `/solid`, …) maps an element's outputs into framework state with no per-element glue. Three rules carry it — nothing here uses `data-wcs` or `@wcstack/state`.

1. **Import the definition before the app renders.** Adapters check `isWcBindable(el)` once on mount and never retry, so an element that upgrades later stays silently unbound — no error, no log. A static import at the entry (`import "@wcstack/websocket/auto";` in `main.tsx`) satisfies this automatically. If the definition genuinely arrives late (autoloader, CDN tag, code-split), gate the mount on `customElements.whenDefined("wcs-ws")`. `connectedCallbackPromise` is not a substitute — it covers connection, not definition.
2. **Pass object-valued inputs as properties, not attributes.** Attributes hold only strings, and several frameworks fall back to attributes when the property is not on the element yet, which stringifies the payload. Use `.prop` (Vue), `prop:` (Solid), `.prop=` (Lit), or assign through a ref.
3. **Unwrap reactive proxies before handing values in.** Vue `reactive`, Svelte `$state`, Solid stores, MobX and Qwik `useStore` wrap plain objects in proxies, and a proxy cannot cross a structured-clone boundary — `<wcs-worker>` / `<wcs-broadcast>` report a `DataCloneError` into `error` rather than sending. Pass `toRaw()` / `$state.snapshot()` / `unwrap()` results. Cores deliberately do not unwrap for you (that would mean a framework dependency).

Live handles such as `<wcs-camera>`'s `MediaStream` are deliberately not snapshot state — take them off the element event via a ref. Angular templates and JSX cannot bind event names containing a colon, so `addEventListener` / `Renderer2.listen` is the portable path for `wcs-*:*` events. Working demos: `examples/websocket-chat` (React 19 and Vue 3 against the same server as the vanilla / state / signals variants).

## Cheat sheet (most-used bindings)

```html
<div data-wcs="textContent: user.name"></div>            <!-- text -->
<input data-wcs="value: form.email">                     <!-- two-way -->
<input type="checkbox" data-wcs="checked: done">
<div data-wcs="class.active: isActive; style.color: color; attr.href: url"></div>
<button data-wcs="onclick: save; disabled: saving">Save</button>
<form data-wcs="onsubmit#prevent: submit">
<span>{{ count|locale }}</span>                          <!-- mustache text -->
<template data-wcs="if: items.length|gt(0)">...</template>
<template data-wcs="else:">...</template>                <!-- trailing colon required -->
<template data-wcs="for: items"><li data-wcs="textContent: .name"></li></template>
<wcs-fetch data-wcs="...: usersFetch"></wcs-fetch>                  <!-- spread -->
<wcs-fetch data-wcs="command.fetch: $command.reload"></wcs-fetch>   <!-- command-token -->
<my-el data-wcs="eventToken.value: responded"></my-el>              <!-- event-token -->
```

```javascript
export default {
  items: [],
  usersFetch: { value: null, loading: false, error: null, status: 0 },
  get rows() { return this["usersFetch.value"] ?? []; },       // for: needs an array
  get "items.*.label"() { return this["items.*.name"]; },      // wildcard computed
  add() { this.items = this.items.concat({ name: "new" }); },  // new array + path assignment
  toggleAll(e) { this.$setAll("items.*.done", [], e.target.checked); },  // v1.32+: bulk write, keeps the array
  $commandTokens: ["reload"],
  $eventTokens: ["responded"],
  $on: { responded(state, ev) { /* check ev.detail.status first */ } },
  $listKeys: { items: "id" },   // v1.26+: keep row DOM state across a refetch
  $watch: { "items.*.name"(cur, prev, i) { /* v1.27+: headless — fires with no DOM binding */ } },
};
```

Full syntax (modifiers, 46 built-in filters, nested loops, `$getAll` / `$resolve`, spread rules): `references/state-binding.md`.

## Silent-failure matrix (these break without an error)

Run `npx @wcstack/lint` without `--errors-only` first (§5), fix its actionable warnings, then self-review against this table:

| Mistake / combination | Symptom | Correct form |
|---|---|---|
| `this.user.name = v` (nested property mutation) | DOM stays stale; lint reports `wcs/nested-assign` (**error** since v1.31 — fails CI) | Path assignment: `this["user.name"] = v` |
| `push` / `splice` / `sort` or `this.items[0] = v` on arrays | DOM stays stale; lint reports `wcs/array-mutation` or `wcs/array-index-assign` (**error** since v1.31 — fails CI) | Reassign a new array (`toSpliced` / `concat` / `filter` / `toSorted`), or use `this["items.0"] = v` / `this.items = this.items.with(0, v)` |
| Getter reading `Date.now()`, the DOM, or a module variable | Keeps its **first value forever** — the cache is invalidated only through the dependency graph, which records reads through `this` alone | Put the input into state and assign to it, or `$trackDependency(path)` / `$postUpdate(path)` |
| `$resolve` with more indexes than the path's `*` count | ≤1.30: surplus silently dropped — a plausible-looking **wrong value**. v1.31+: throws `wcs/index-arity` (also lint-checked) | Match the `*` count exactly; `$getAll` accepts fewer (a prefix means "expand the rest") |
| `for:` bound to a null / non-array path | List breaks | Derived getter with `?? []` |
| Arguments on `onclick:` | Cannot pass arguments | Zero-arg wrapper method per variant |
| Bare name on command binding (`command.fetch: reload`) | Never fires | `$command.reload` (the `$command.` prefix is mandatory) |
| Raw DOM event name as `eventToken.` key | Never fires | Use the **wcBindable property name** |
| Expecting spread (`...:`) to wire commands/events | They stay unwired | Wire `command.` / `eventToken.` explicitly |
| Right-hand filter on spread (`...: slot\|f`) | Error | Filters go on individual property bindings |
| `data-wcs` inside router-stamped content on **≤1.31** | Bindings never collected (state scanned the DOM once at bind time) | v1.32's binder protocol fixed this: route content and `<wcs-head>` clones are handed to state and bind on insertion — per-route `<title data-wcs>` works. The body-level `<template data-wcs="if: ...">` architecture remains a fine pattern (router-spa still uses it), no longer a requirement. On a page **without** state, the router warns about bindings that cannot work |
| `data-wcs="attr.aria-label: ..."` on `<wcs-link>` | Never reaches the generated `<a>` — `aria-*` is copied once at anchor creation, and dynamic changes are not tracked | Write `aria-*` on `<wcs-link>` as **static attributes** (they are forwarded, along with `title` / `rel` / `target` / `download` / `hreflang`) |
| `@wcstack/state/auto` loaded **before** an I/O package | A `$command.x.emit()` fired in the load window reaches zero subscribers and is dropped (tokens are never replayed; property bindings are fine) | Put every I/O-node `/auto` before `state/auto` |
| `await customElements.whenDefined(tag)` as a readiness gate | Hangs forever if the package never loads (`whenDefined` never rejects) — takes the fallback path down with it | `<wcs-defined timeout>` bound to `disabled:` via its **`pending`** output |
| SPA without `<base href="/">` | Deep links break (basename misderived) | Add `<base href="/">` to `<head>` |
| Assuming `wcs-fetch:response` means success | Fires on HTTP/network errors too | Check `event.detail.status` in `$on` |
| Expecting a repeated identical value on a **`state`** output to fire again | The same-value guard skips the set, the dependency walk, the DOM apply and `$updatedCallback` | Take it from the occurrence surface instead — `eventToken.` + `$on`. (Properties declared `semantics: "event"` — `message` / `result` / `fired` / … — are exempt from the guard as of v1.24; the catalog §0 lists all 20) |
| Awaiting an async `$on` handler, or relying on it to sequence work | Dispatch never awaits handlers; a rejection is caught and reported via `console.error` (v1.24+) but never propagates | Keep `$on` synchronous, or have the async work write its own state slot when it settles |
| Storage slot seeded with `""` / `null` | Initial write-back clobbers the saved value | Seed the bound slot with `undefined`, or bind `value#init=element: slot` (v1.22+: the element's loaded value wins the initial sync, then normal two-way resumes) |
| Seeding truthy initials into output-only properties | Element authority overwrites them | Seed real initial values (`null` / `false`) |
| Seeding `true` into a `trigger`-bound slot | Fires/starts at bind, even with `manual` (no edge detection) | Seed `false`; write `true` to fire |
| `send` / `post` before connected / opened / started | Dropped silently into `error` — not queued, no throw | Gate on `connected` / `running`, and bind `error` |
| Changing an attribute after connect to reconfigure | Most inputs are frozen (connect-time or next-command read) — change silently ignored | Check the catalog's live/frozen notes; re-invoke the command or replace the element |
| Writing `undefined` to an element input | Write is skipped silently (write-skip) | Assign `null` to clear |
| Missing trailing colon on `else` | Parse fails | `data-wcs="else:"` |
| `for:` / `if:` / `elseif:` / `else:` sharing one `data-wcs` with any other binding (`<template data-wcs="for: items; class.on: x">`) | Runtime `raiseError` — takes the whole page down; lint reports `wcs/template-syntax` (v1.29+) | A structural binding must be **alone** in its `data-wcs`; put other bindings on elements inside the template |
| Mixing `@wcstack/signals` and `@wcstack/signals/dom` on a CDN page | Two reactive cores, broken seams | Import everything from the single `/dom` entry |
| Custom filter registration | No such API exists | Compose the 46 built-in filters, or compute in a getter |
| Strict CSP + the inline `<script type="module">` state form | State never initializes; the only console message is `Failed to fetch dynamically imported module` unless a violation was observed | It is imported via a `blob:` URL and the page nonce does not carry over — move the state to `src="./state.js"`, or open `script-src blob:` deliberately |
| Refetching a list (`fetch().json()`) whose rows hold focus / IME / `<details>` / `<canvas>` / `<video>` state | Rows are rebuilt, and that state is **shuffled onto other rows** rather than just lost | Declare `$listKeys: { items: "id" }` (v1.26+) so rows are matched by key and only changed fields are written |
| Using `$updatedCallback` as a headless watcher | Never fires for a path with no live DOM binding; v1.31 detects the shape statically as `wcs/updated-callback-unbound` | It is binding-driven — declare `$watch: { path(cur, prev) {...} }` instead (v1.27+), which fires with no binding at all |
| Headless wildcard row watch (`$watch: { "items.*.price": … }`) with neither a rendered `for` nor `$listKeys` | Assigning the array fires the row watch **zero** times — expansion is driven by the `for` binding, and a watch deliberately does not register the path as a list | Declare `$listKeys` for that list (also makes `prev` a real scalar and fires only changed rows), or render the list |
| Watching `$streamStatus.<name>` / any `$`-path in `$watch` | Rejected at declaration (`$` is reserved); lint reports `wcs/watch-declaration-invalid` | Mirror through a non-`$` getter — `get streamStatus() { return this["$streamStatus.x"]; }` — and watch that; a watched getter is evaluated eagerly even when nothing renders it |
| Watching a **wildcard getter** (`items.*.tax`) and expecting headless firing | Not made eager (priming would sweep the whole list) — fires only when also DOM-bound, and `prev` is always `undefined` | Watch the underlying data path instead, or bind the getter somewhere |
| `$watch` / `$streams` declared on a mapped `bind-component` child | The mapping proxy blanks `$`-prefixed properties — the declaration silently never arrives | Declare them on the host state; a plain (unmapped) child can declare them |
| DCC and `bind-component` on the same component (e.g. `<wcs-state bind-component>` inside a `data-wc-definition` host) | Error (v1.26 made them exclusive) | One mechanism per component — no JS class → DCC, class already written → `bind-component` |
| Duplicate name in `$bindables` / `$commands` | Used to make the whole `wcBindable` declaration unreadable and the element silently non-bindable; now a definition-time error | Deduplicate; `$commands` lists methods only, `$bindables` value properties only |
| `page++` on each `<wcs-intersect>` edge with a `$streams` fetch | A second edge aborts page N and jumps to N+1 — a page is skipped | Derive it from committed rows: `page = floor(items.length / pageSize) + 1`; repeated edges then rewrite the same value and no-op |
| Expecting an auto-fetch after the url passes through empty/`undefined` and back | Skipped — the guard holds the last url *actually fetched*, which an empty url does not update | Explicit `command.fetch` / `trigger`, which bypass the guard |
| Binding a structural audio attribute (`out` / `param` / `note` / `poly`) from state | Every write rebuilds the graph and cuts sounding voices | Bind only numeric params; declare structure in markup |

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
<p>Count: {{ count }}</p>
<button data-wcs="onclick: countUp">+1</button>
</body>
</html>
```

For a full SPA with fetch wiring and layouts, start from the router-spa skeleton in `references/router-and-scaffold.md` §7.
